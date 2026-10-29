
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { SoundConfig, SoundDef, Player, Settings, Tile } from '../types';
import { ASSETS } from '../assets';
import { hasLineOfSight, getSoundOcclusion } from '../utils/combatLogic';

interface StreamTrack {
    element: HTMLAudioElement;
    source: MediaElementAudioSourceNode | null; // Connected lazily
    gain: GainNode; // Individual gain for crossfading
    id: string;
}

export const useSoundSystem = (
    player: Player, 
    config: SoundConfig, 
    volumeSettings: Settings['volume'], 
    isMuffled: boolean = false,
    concussionDuration: number = 0,
    levelData?: { 
        name?: string;
        grid: Tile[][]; 
        grids?: Tile[][][];
        ceilingType?: 'INDOOR' | 'OUTDOOR';
        width: number; 
        height: number; 
        outdoorMap?: boolean[][];
    } | null,
    cinematicMode: boolean = false,
    cinematicCamera?: { x: number, y: number, dir: number, pitch?: number } | null
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Keep a ref to the latest player state to avoid stale closures in async callbacks
  const playerRef = useRef<Player>(player);
  useEffect(() => {
      playerRef.current = player;
  }, [player]);

  const cinematicModeRef = useRef<boolean>(cinematicMode);
  const cinematicCameraRef = useRef<any>(cinematicCamera);
  useEffect(() => {
      cinematicModeRef.current = cinematicMode;
      cinematicCameraRef.current = cinematicCamera;
  }, [cinematicMode, cinematicCamera]);

  const levelDataRef = useRef(levelData);
  const reverbMapRef = useRef<number[][]>([]);
  const footstepSoundsRef = useRef<Set<string>>(new Set());

  // Caching refs for performance optimization to avoid redundant BFS and parameter updates
  const structuralHashRef = useRef<number>(0);
  const rainCacheRef = useRef<{ x: number; y: number; hash: number; value: number } | null>(null);
  const lastRainTargetVolumeRef = useRef<number>(-1);
  const lastVoiceReverbSendsRef = useRef<{ px: number; py: number; hash: number } | null>(null);

  useEffect(() => {
      levelDataRef.current = levelData;
  }, [levelData]);

  useEffect(() => {
      const newFootsteps = new Set<string>();
      if (levelData) {
          const checkGrid = (g: Tile[][]) => {
              for (let r = 0; r < g.length; r++) {
                  const row = g[r];
                  if (!row) continue;
                  for (let c = 0; c < row.length; c++) {
                      const tile = row[c];
                      if (tile && tile.footstepSound) {
                          newFootsteps.add(tile.footstepSound);
                      }
                  }
              }
          };
          if (levelData.grid) checkGrid(levelData.grid);
          if (levelData.grids) {
              for (let i = 0; i < levelData.grids.length; i++) {
                  const g = levelData.grids[i];
                  if (g) checkGrid(g);
              }
          }
      }
      footstepSoundsRef.current = newFootsteps;
  }, [levelData?.name, levelData?.width, levelData?.height]);

  // Create a hash that only changes when walls are destroyed or doors fully open/close
  const structuralHash = useMemo(() => {
      if (!levelData || !levelData.grid) return 0;
      let hash = 0;
      
      const hashGrid = (grid: Tile[][], floorIndex: number) => {
          for (let y = 0; y < grid.length; y++) {
              for (let x = 0; x < grid[y].length; x++) {
                  const t = grid[y][x];
                  const posWeight = x * 13 + y * 31 + floorIndex * 47;
                  if (t.type === 'WALL' && t.blocking !== false) {
                      hash += posWeight * 1;
                  } else if (t.type === 'DOOR') {
                      hash += posWeight * ((t.door?.state === 'OPEN' || t.door?.broken) ? 2 : 3);
                  }
              }
          }
      };
      
      hashGrid(levelData.grid, 0);
      if (levelData.grids) {
          levelData.grids.forEach((g, i) => hashGrid(g, i + 1));
      }
      return hash;
  }, [levelData]);

  useEffect(() => {
      structuralHashRef.current = structuralHash;
      const ld = levelDataRef.current;
      // Pre-calculate reverb map for performance
      if (ld && ld.grid) {
          const newMap: number[][] = [];
          const dirs = [[1,0], [-1,0], [0,1], [0,-1], [1,1], [-1,-1], [1,-1], [-1,1]];
          
          const isBlocking = (t: Tile) => !t || (t.type === 'WALL' && t.blocking !== false) || (t.type === 'DOOR' && t.door?.state !== 'OPEN' && !t.door?.broken);

          for (let y = 0; y < ld.height; y++) {
              newMap[y] = [];
              for (let x = 0; x < ld.width; x++) {
                  // Only calculate for non-wall tiles
                  const tile = ld.grid[y]?.[x];
                  if (isBlocking(tile)) {
                      newMap[y][x] = 0;
                      continue;
                  }
                  
                  let totalVolume = 0;
                  for (const [dx, dy] of dirs) {
                      let dist = 0;
                      let cx = x;
                      let cy = y;
                      while (dist < 15) {
                          cx += dx;
                          cy += dy;
                          dist++;
                          const rx = Math.round(cx);
                          const ry = Math.round(cy);
                          if (rx < 0 || ry < 0 || rx >= ld.width || ry >= ld.height) break;
                          
                          const t = ld.grid[ry]?.[rx];
                          if (isBlocking(t)) {
                              break;
                          }
                          
                          totalVolume += 1;
                          
                          // Check upper floors for extra volume
                          if (ld.grids) {
                              for (let floor = 1; floor < ld.grids.length; floor++) {
                                  const upperTile = ld.grids[floor]?.[ry]?.[rx];
                                  if (!upperTile || !isBlocking(upperTile)) {
                                      totalVolume += 1;
                                  } else {
                                      // Blocked by a solid ceiling/floor
                                      break;
                                  }
                              }
                          }
                      }
                  }
                  
                  // Effective radius is volume divided by 8 directions
                  newMap[y][x] = totalVolume / 8;
              }
          }
          reverbMapRef.current = newMap;
      } else {
          reverbMapRef.current = [];
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralHash]);

  // Audio Nodes Hierarchy
  const masterGainRef = useRef<GainNode | null>(null);
  const musicBusRef = useRef<GainNode | null>(null);
  const sfxBusRef = useRef<GainNode | null>(null);
  const uiBusRef = useRef<GainNode | null>(null);
  
  const mufflableBusRef = useRef<GainNode | null>(null); 
  const dryGainRef = useRef<GainNode | null>(null);      
  const wetGainRef = useRef<GainNode | null>(null);      
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);

  const voiceBusRef = useRef<GainNode | null>(null);
  const voiceOutdoorSendRef = useRef<GainNode | null>(null);
  const voiceSmallRoomSendRef = useRef<GainNode | null>(null);
  const voiceLargeRoomSendRef = useRef<GainNode | null>(null);

  // Reverb Nodes
  const outdoorReverbBusRef = useRef<GainNode | null>(null);
  const smallRoomReverbBusRef = useRef<GainNode | null>(null);
  const largeRoomReverbBusRef = useRef<GainNode | null>(null);

  const sfxToOutdoorReverbRef = useRef<GainNode | null>(null);
  const sfxToSmallRoomReverbRef = useRef<GainNode | null>(null);
  const sfxToLargeRoomReverbRef = useRef<GainNode | null>(null);

  const arrayBufferCache = useRef<Map<string, ArrayBuffer>>(new Map());
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  const streamCache = useRef<Map<string, StreamTrack>>(new Map());
  const decodingPromises = useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  
  const activeSources = useRef<Map<string, AudioBufferSourceNode[]>>(new Map());
  // Store PannerNodes for live updates
  const activeNodes = useRef<Map<string, { 
      panner?: PannerNode | StereoPannerNode, 
      filter?: BiquadFilterNode,
      gain: GainNode, 
      soundName: string, 
      pos?: {x: number, y: number}, 
      maxDistance?: number,
      nonPositional?: boolean,
      lastPlayerX?: number,
      lastPlayerY?: number,
      lastNodeX?: number,
      lastNodeY?: number,
      lastHash?: number,
      lastOcclusionMult?: number
  }>>(new Map());

  const queuedSounds = useRef<Array<{ name: string, pos?: { x: number, y: number }, id?: string, delayMs?: number, maxDistance?: number, loop?: boolean, nonPositional?: boolean }>>([]);
  const playTokens = useRef<Map<string, number>>(new Map());
  
  // Rate limiter for sound effects to prevent audio overloading during particle explosions and heavy action
  const soundRateLimitersRef = useRef<Map<string, number[]>>(new Map());
  
  const currentMusicIdRef = useRef<string | null>(null);
  const lastMusicIdRef = useRef<string | null>(null);
  const currentWeatherIdRef = useRef<string | null>(null);

  // Update Volumes
  useEffect(() => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      if (masterGainRef.current) {
          masterGainRef.current.gain.cancelScheduledValues(now);
          masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, now);
          masterGainRef.current.gain.linearRampToValueAtTime(volumeSettings.master / 100, now + 0.1);
      }
      if (musicBusRef.current) {
          musicBusRef.current.gain.cancelScheduledValues(now);
          musicBusRef.current.gain.setValueAtTime(musicBusRef.current.gain.value, now);
          musicBusRef.current.gain.linearRampToValueAtTime(volumeSettings.music / 100, now + 0.1);
      }
      if (sfxBusRef.current) {
          sfxBusRef.current.gain.cancelScheduledValues(now);
          sfxBusRef.current.gain.setValueAtTime(sfxBusRef.current.gain.value, now);
          sfxBusRef.current.gain.linearRampToValueAtTime(volumeSettings.sound / 100, now + 0.1);
      }
      if (sfxToOutdoorReverbRef.current) {
          sfxToOutdoorReverbRef.current.gain.cancelScheduledValues(now);
          sfxToOutdoorReverbRef.current.gain.setValueAtTime(sfxToOutdoorReverbRef.current.gain.value, now);
          sfxToOutdoorReverbRef.current.gain.linearRampToValueAtTime(volumeSettings.sound / 100, now + 0.1);
      }
      if (sfxToSmallRoomReverbRef.current) {
          sfxToSmallRoomReverbRef.current.gain.cancelScheduledValues(now);
          sfxToSmallRoomReverbRef.current.gain.setValueAtTime(sfxToSmallRoomReverbRef.current.gain.value, now);
          sfxToSmallRoomReverbRef.current.gain.linearRampToValueAtTime(volumeSettings.sound / 100, now + 0.1);
      }
      if (sfxToLargeRoomReverbRef.current) {
          sfxToLargeRoomReverbRef.current.gain.cancelScheduledValues(now);
          sfxToLargeRoomReverbRef.current.gain.setValueAtTime(sfxToLargeRoomReverbRef.current.gain.value, now);
          sfxToLargeRoomReverbRef.current.gain.linearRampToValueAtTime(volumeSettings.sound / 100, now + 0.1);
      }
      if (uiBusRef.current) {
          uiBusRef.current.gain.cancelScheduledValues(now);
          uiBusRef.current.gain.setValueAtTime(uiBusRef.current.gain.value, now);
          uiBusRef.current.gain.linearRampToValueAtTime(volumeSettings.sound / 100, now + 0.1);
      }
  }, [volumeSettings]);

  // Update voice reverb sends based on player position
  useEffect(() => {
      if (!audioContextRef.current || !voiceOutdoorSendRef.current || !voiceSmallRoomSendRef.current || !voiceLargeRoomSendRef.current) return;
      
      const ld = levelDataRef.current;
      if (!ld) return;

      const px = Math.floor(playerRef.current.pos.x);
      const py = Math.floor(playerRef.current.pos.y);
      const curHash = structuralHashRef.current;

      // Only proceed if player location or level structure changed
      if (lastVoiceReverbSendsRef.current &&
          lastVoiceReverbSendsRef.current.px === px &&
          lastVoiceReverbSendsRef.current.py === py &&
          lastVoiceReverbSendsRef.current.hash === curHash) {
          return;
      }
      lastVoiceReverbSendsRef.current = { px, py, hash: curHash };

      let isOutdoors = false;
      if (ld.ceilingType === 'OUTDOOR') {
          isOutdoors = true;
          if (ld.grids && ld.grids[1] && ld.grids[1][py] && ld.grids[1][py][px]) {
              const ceil = ld.grids[1][py][px];
              if (ceil.type === 'WALL' || ceil.type === 'DOOR') isOutdoors = false;
          }
      }

      let outdoorSend = 0;
      let smallRoomSend = 0;
      let largeRoomSend = 0;

      if (isOutdoors) {
          outdoorSend = 0.3;
      } else {
          const effectiveRadius = reverbMapRef.current[py]?.[px] || 0;
          const roomSizeFactor = Math.max(0, Math.min(1, (effectiveRadius - 2) / 5));
          const baseReverb = 0.3 + (roomSizeFactor * 0.2);
          smallRoomSend = baseReverb * (1 - roomSizeFactor);
          largeRoomSend = baseReverb * roomSizeFactor;
      }

      const now = audioContextRef.current.currentTime;
      voiceOutdoorSendRef.current.gain.setTargetAtTime(outdoorSend, now, 0.01);
      voiceSmallRoomSendRef.current.gain.setTargetAtTime(smallRoomSend, now, 0.01);
      voiceLargeRoomSendRef.current.gain.setTargetAtTime(largeRoomSend, now, 0.01);
  }, [Math.floor(player.pos.x), Math.floor(player.pos.y), levelData?.name, structuralHash]);

  // Listen for dynamic voice reverb position updates (for speak events)
  useEffect(() => {
      const handleUpdateVoiceReverbPos = (e: Event) => {
          const customEvent = e as CustomEvent<{ x: number, y: number }>;
          const { x, y } = customEvent.detail;
          
          if (!audioContextRef.current || !voiceOutdoorSendRef.current || !voiceSmallRoomSendRef.current || !voiceLargeRoomSendRef.current) return;
          
          const ld = levelDataRef.current;
          if (!ld) return;

          const px = Math.floor(x);
          const py = Math.floor(y);

          // Bound coordinates inside current level data grid dimensions
          if (px < 0 || py < 0 || px >= ld.width || py >= ld.height) return;

          let isOutdoors = false;
          if (ld.ceilingType === 'OUTDOOR') {
              isOutdoors = true;
              if (ld.grids && ld.grids[1] && ld.grids[1][py] && ld.grids[1][py][px]) {
                  const ceil = ld.grids[1][py][px];
                  if (ceil.type === 'WALL' || ceil.type === 'DOOR') isOutdoors = false;
              }
          }

          let outdoorSend = 0;
          let smallRoomSend = 0;
          let largeRoomSend = 0;

          if (isOutdoors) {
              outdoorSend = 0.3;
          } else {
              const effectiveRadius = reverbMapRef.current[py]?.[px] || 0;
              const roomSizeFactor = Math.max(0, Math.min(1, (effectiveRadius - 2) / 5));
              const baseReverb = 0.3 + (roomSizeFactor * 0.2);
              smallRoomSend = baseReverb * (1 - roomSizeFactor);
              largeRoomSend = baseReverb * roomSizeFactor;
          }

          const now = audioContextRef.current.currentTime;
          voiceOutdoorSendRef.current.gain.setTargetAtTime(outdoorSend, now, 0.01);
          voiceSmallRoomSendRef.current.gain.setTargetAtTime(smallRoomSend, now, 0.01);
          voiceLargeRoomSendRef.current.gain.setTargetAtTime(largeRoomSend, now, 0.01);
      };

      window.addEventListener('update-voice-reverb-pos', handleUpdateVoiceReverbPos);
      return () => {
          window.removeEventListener('update-voice-reverb-pos', handleUpdateVoiceReverbPos);
      };
  }, []);

  // Handle Muffling
  useEffect(() => {
      if (!audioContextRef.current || !dryGainRef.current || !wetGainRef.current) return;
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      const rampTime = 0.3;

      dryGainRef.current.gain.cancelScheduledValues(now);
      wetGainRef.current.gain.cancelScheduledValues(now);
      dryGainRef.current.gain.setValueAtTime(dryGainRef.current.gain.value, now);
      wetGainRef.current.gain.setValueAtTime(wetGainRef.current.gain.value, now);

      if (isMuffled) {
          // Full muffle for menus
          dryGainRef.current.gain.linearRampToValueAtTime(0, now + rampTime);
          wetGainRef.current.gain.linearRampToValueAtTime(0.6, now + rampTime);
      } else if (concussionDuration > 0) {
          // Gradual muffle for concussion
          // Max duration is 3.
          // At 3: dry = 0.2, wet = 0.5
          // At 2: dry = 0.5, wet = 0.3
          // At 1: dry = 0.8, wet = 0.1
          const intensity = Math.min(1, concussionDuration / 3);
          const dryTarget = 1.0 - (0.8 * intensity);
          const wetTarget = 0.5 * intensity;
          
          dryGainRef.current.gain.linearRampToValueAtTime(dryTarget, now + rampTime);
          wetGainRef.current.gain.linearRampToValueAtTime(wetTarget, now + rampTime);
      } else {
          // No muffle
          dryGainRef.current.gain.linearRampToValueAtTime(1, now + rampTime);
          wetGainRef.current.gain.linearRampToValueAtTime(0, now + rampTime);
      }
  }, [isMuffled, concussionDuration]);

  // Handle Concussion Ringing
  const concussionOscillatorRef = useRef<{ osc: OscillatorNode, gain: GainNode } | null>(null);
  useEffect(() => {
      if (!audioContextRef.current || !masterGainRef.current) return;
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;

      if (concussionDuration > 0) {
          // Max duration is 3, so volume scales from 0.05 to 0.15
          const intensity = Math.min(1, concussionDuration / 3);
          const targetVolume = intensity * 0.15;
          
          if (!concussionOscillatorRef.current) {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              
              osc.type = 'sine';
              osc.frequency.value = 4000; // High pitch ringing
              
              gain.gain.value = 0;
              
              osc.connect(gain);
              gain.connect(masterGainRef.current); // Connect directly to master, bypassing muffle
              
              osc.start();
              concussionOscillatorRef.current = { osc, gain };
              
              // Fade in
              gain.gain.linearRampToValueAtTime(targetVolume, now + 0.1);
          } else {
              // Adjust volume based on duration
              const { gain } = concussionOscillatorRef.current;
              gain.gain.cancelScheduledValues(now);
              gain.gain.setValueAtTime(gain.gain.value, now);
              gain.gain.linearRampToValueAtTime(targetVolume, now + 0.5);
          }
      } else {
          if (concussionOscillatorRef.current) {
              const { osc, gain } = concussionOscillatorRef.current;
              gain.gain.cancelScheduledValues(now);
              gain.gain.setValueAtTime(gain.gain.value, now);
              gain.gain.linearRampToValueAtTime(0, now + 0.5); // Fade out over 0.5 seconds
              
              setTimeout(() => {
                  try { osc.stop(); } catch (e) {}
                  osc.disconnect();
                  gain.disconnect();
              }, 600);
              
              concussionOscillatorRef.current = null;
          }
      }
  }, [concussionDuration]);

  // --------------------------------------------------------
  // NEW: Sync AudioListener with Player Position & Orientation (or Cinematic Camera)
  // This enables automatic 3D spatialization (HRTF)
  // --------------------------------------------------------
  useEffect(() => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const listener = ctx.listener;

      const useCam = cinematicMode && cinematicCamera;
      const refPos = useCam ? cinematicCamera : player.pos;

      // 1. Update Position
      // Map Game Grid (X, Y) to Audio Space (X, Z). Y is Up.
      const listenerX = refPos.x + 0.5;
      const listenerZ = refPos.y + 0.5;
      
      if (listener.positionX) { 
          listener.positionX.cancelScheduledValues(ctx.currentTime);
          listener.positionX.setTargetAtTime(listenerX, ctx.currentTime, 0.1);
          listener.positionY.cancelScheduledValues(ctx.currentTime);
          listener.positionY.setTargetAtTime(0, ctx.currentTime, 0.1); // Player or camera is at ground level 0
          listener.positionZ.cancelScheduledValues(ctx.currentTime);
          listener.positionZ.setTargetAtTime(listenerZ, ctx.currentTime, 0.1);
      } else {
          // Fallback for older browsers
          listener.setPosition(listenerX, 0, listenerZ);
      }

      // 2. Update Orientation (Facing)
      // dir360: 1=East, 2=South, 3=West, 4(0)=North.
      // Space Grotesk angle: (dir360 - 1) * PI/2
      // Cinematic camera dir is already in radians
      const angle = useCam ? cinematicCamera.dir : (player.dir360 - 1) * (Math.PI / 2);
      const fx = Math.cos(angle);
      const fz = Math.sin(angle);

      if (listener.forwardX) {
          listener.forwardX.cancelScheduledValues(ctx.currentTime);
          listener.forwardX.setTargetAtTime(fx, ctx.currentTime, 0.1);
          listener.forwardY.cancelScheduledValues(ctx.currentTime);
          listener.forwardY.setTargetAtTime(0, ctx.currentTime, 0.1);
          listener.forwardZ.cancelScheduledValues(ctx.currentTime);
          listener.forwardZ.setTargetAtTime(fz, ctx.currentTime, 0.1);
          listener.upX.cancelScheduledValues(ctx.currentTime);
          listener.upX.setTargetAtTime(0, ctx.currentTime, 0.1);
          listener.upY.cancelScheduledValues(ctx.currentTime);
          listener.upY.setTargetAtTime(1, ctx.currentTime, 0.1); // Up is +Y
          listener.upZ.cancelScheduledValues(ctx.currentTime);
          listener.upZ.setTargetAtTime(0, ctx.currentTime, 0.1);
      } else {
          listener.setOrientation(fx, 0, fz, 0, 1, 0);
      }

      // 3. Update out-of-range muting and occlusion when player or camera moves
      const ld = levelDataRef.current;
      activeNodes.current.forEach((node, id) => {
          if (!node.pos) return;
          const dx = node.pos.x - refPos.x;
          const dy = node.pos.y - refPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          const px = Math.floor(refPos.x);
          const py = Math.floor(refPos.y);
          const npx = Math.floor(node.pos.x);
          const npy = Math.floor(node.pos.y);
          const curHash = ld ? structuralHashRef.current : 0;

          let occlusionMult = 1.0;
          if (
              node.lastPlayerX === px &&
              node.lastPlayerY === py &&
              node.lastNodeX === npx &&
              node.lastNodeY === npy &&
              node.lastHash === curHash &&
              node.lastOcclusionMult !== undefined
          ) {
              occlusionMult = node.lastOcclusionMult;
          } else {
              if (ld && ld.grid) {
                  occlusionMult = getSoundOcclusion(refPos, node.pos, ld.grid, ld.width, ld.height);
              }
              node.lastPlayerX = px;
              node.lastPlayerY = py;
              node.lastNodeX = npx;
              node.lastNodeY = npy;
              node.lastHash = curHash;
              node.lastOcclusionMult = occlusionMult;
          }

          const soundDef = resolveSoundDef(node.soundName);
          let baseVol = (soundDef as any)?.volume ?? 1.0;
          baseVol *= 2.0;

          if (occlusionMult < 1.0) {
              const nameUpper = node.soundName.toUpperCase();
              const isFootstep = nameUpper.includes('STEP') || footstepSoundsRef.current.has(node.soundName);
              if (isFootstep || node.soundName === 'SYS_FLIES') occlusionMult = 0;
          }
          
          const maxDistance = node.maxDistance !== undefined ? node.maxDistance : 20;
          let distVolume = 0;
          if (dist < maxDistance) {
              const ratio = 1 - dist / maxDistance;
              distVolume = ratio * ratio;
          }

          let targetVol = baseVol * distVolume * occlusionMult;
          node.gain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.1);

          if (node.filter) {
              const targetCutoff = 800 + 19200 * Math.pow(occlusionMult, 0.5);
              node.filter.frequency.setTargetAtTime(Math.min(20000, targetCutoff), ctx.currentTime, 0.1);
          }
      });
  }, [player.pos.x, player.pos.y, player.dir360, cinematicMode, cinematicCamera?.x, cinematicCamera?.y, cinematicCamera?.dir, structuralHash]);

  // Preload all sounds in background
  useEffect(() => {
    if (!config || Object.keys(config).length === 0) return;

    const preloadAll = async () => {
        const promises = Object.values(config).map(async (def) => {
            // Only preload non-streamed sounds (SFX)
            // Streamed sounds (music) are handled by prepareStream
            if (def.assetId && !streamCache.current.has(def.assetId)) {
                const url = (ASSETS.SOUNDS as any)[def.assetId] || (ASSETS.SPRITES as any)[def.assetId];
                if (url && !bufferCache.current.has(url) && !arrayBufferCache.current.has(url) && !decodingPromises.current.has(url)) {
                    try {
                        const resolvedUrl = url.startsWith('local://') ? (localStorage.getItem(url.substring(8)) || url) : url;
                        const response = await fetch(resolvedUrl);
                        const arrayBuffer = await response.arrayBuffer();
                        
                        const ctx = audioContextRef.current;
                        if (ctx && ctx.state !== 'suspended') {
                            const decodePromise = ctx.decodeAudioData(arrayBuffer.slice(0));
                            decodingPromises.current.set(url, decodePromise);
                            decodePromise.then(audioBuffer => {
                                bufferCache.current.set(url, audioBuffer);
                                decodingPromises.current.delete(url);
                            }).catch(e => {
                                console.warn(`Failed to background decode sound: ${url}`, e);
                                decodingPromises.current.delete(url);
                            });
                        } else {
                            arrayBufferCache.current.set(url, arrayBuffer);
                        }
                    } catch (e) {
                        console.warn(`Failed to preload array buffer for ${url}`, e);
                    }
                }
            }
        });
        
        await Promise.allSettled(promises);
    };

    // Small delay to let the main thread breathe during initial render
    const t = setTimeout(preloadAll, 1000);
    return () => clearTimeout(t);
  }, [config]);

const resolveSoundDef = useCallback((name: string) => {
      let def = config[name];
      // Resolve up to 2 levels of aliases
      if (def && def.alias) {
          def = config[def.alias];
          if (def && def.alias) {
              def = config[def.alias];
          }
      }
      return def;
  }, [config]);

  const getRainDynamicMultiplier = useCallback(() => {
      const ld = levelDataRef.current;
      if (!ld || !ld.grid) return 1.0;

      const px = playerRef.current.pos.x;
      const py = playerRef.current.pos.y;
      const ipx = Math.floor(px);
      const ipy = Math.floor(py);
      const curHash = structuralHashRef.current;

      // Return cached result if player is on the same tile and layout has not changed
      if (rainCacheRef.current &&
          rainCacheRef.current.x === ipx &&
          rainCacheRef.current.y === ipy &&
          rainCacheRef.current.hash === curHash) {
          return rainCacheRef.current.value;
      }

      // Helper to check if a tile is outdoors (canopy / sky)
      const isTileOutdoor = (tx: number, ty: number) => {
          if (tx < 0 || tx >= ld.width || ty < 0 || ty >= ld.height) {
              return ld.ceilingType === 'OUTDOOR';
          }
          if (ld.outdoorMap && ld.outdoorMap[ty]) {
              return !!ld.outdoorMap[ty][tx];
          }
          if (ld.ceilingType === 'OUTDOOR') {
              if (ld.grids && ld.grids[1] && ld.grids[1][ty] && ld.grids[1][ty][tx]) {
                  const ceil = ld.grids[1][ty][tx];
                  if (ceil.type === 'WALL' || ceil.type === 'DOOR') return false;
              }
              return true;
          }
          return false;
      };

      // If the player is directly under the open sky (on an outdoor tile), volume is 100%
      if (isTileOutdoor(ipx, ipy)) {
          const result = 1.0;
          rainCacheRef.current = { x: ipx, y: ipy, hash: curHash, value: result };
          return result;
      }

      // If indoors, calculate how much rain sound seeps in from the nearest outdoor areas using a BFS propagation.
      // Limits spread to outdoor tiles up to 5 tiles away and respects walls, windows (broken/intact) and doors.
      const MAX_SOUND_RADIUS = 5.0;
      
      const isSemiSolid = (t: Tile | undefined) => {
          if (!t) return false;
          if (t.type === 'WALL') {
              const isWindow = !!t.isWindow;
              const isMasked = !!t.maskId;
              if ((isWindow || isMasked) && t.isGlassBroken) {
                  return false;
              }
              return true;
          }
          if (t.type === 'DOOR' && t.door?.state !== 'OPEN' && !t.door?.broken) {
              return true;
          }
          return false;
      };

      let maxTransmission = 0;
      const queue: { x: number; y: number; trans: number; dist: number }[] = [];
      const bestTransmission = new Map<number, number>();

      queue.push({ x: ipx, y: ipy, trans: 1.0, dist: 0 });
      bestTransmission.set((ipx << 10) | ipy, 1.0);

      const dirs = [
          [0, -1, 1.0],    // N
          [1, 0, 1.0],     // E
          [0, 1, 1.0],     // S
          [-1, 0, 1.0],    // W
          [1, -1, 1.414],  // NE
          [-1, -1, 1.414], // NW
          [1, 1, 1.414],   // SE
          [-1, 1, 1.414]   // SW
      ];

      while (queue.length > 0) {
          const curr = queue.shift()!;
          const { x, y, trans, dist } = curr;

          if (isTileOutdoor(x, y)) {
              if (trans > maxTransmission) {
                  maxTransmission = trans;
              }
              continue; // Rain falls directly on outdoor tiles, stop expanding from here
          }

          for (const [dx, dy, stepDist] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              const nextDist = dist + stepDist;

              if (nextDist > MAX_SOUND_RADIUS + 0.1) continue;
              if (nx < 0 || nx >= ld.width || ny < 0 || ny >= ld.height) continue;

              // Prevent diagonal sounds leaking through corners
              if (dx !== 0 && dy !== 0) {
                  const cell1 = ld.grid[y]?.[nx];
                  const cell2 = ld.grid[ny]?.[x];
                  if (isSemiSolid(cell1) || isSemiSolid(cell2)) continue;
              }

              const tile = ld.grid[ny]?.[nx];
              let occlusion = 1.0;

              if (tile) {
                  if (tile.type === 'WALL') {
                      const isWindow = !!tile.isWindow;
                      const isMasked = !!tile.maskId;
                      if (isWindow || isMasked) {
                          if (tile.isGlassBroken) {
                              occlusion = 1.0; // Broken window/mask doesn't absorb sound
                          } else {
                              occlusion = 0.6; // Intact glass/mask passes 60% of sound
                          }
                      } else {
                          occlusion = 0.02; // Solid walls absorb almost all sound
                      }
                  } else if (tile.type === 'DOOR') {
                      if (tile.door?.state === 'OPEN' || tile.door?.broken) {
                          occlusion = 1.0; // Open or broken door passes sound fully
                      } else {
                          occlusion = 0.6; // Closed door passes 60% of sound
                      }
                  }
              }

              // Apply transmission decay (occlusion * physical decay)
              const nextTrans = trans * occlusion * Math.pow(0.8, stepDist);

              const key = (nx << 10) | ny;
              const prevBest = bestTransmission.get(key) ?? -1;
              if (nextTrans > prevBest) {
                  bestTransmission.set(key, nextTrans);
                  queue.push({ x: nx, y: ny, trans: nextTrans, dist: nextDist });
              }
          }
      }

      // Base quiet rain rumble when deep indoors is 0.05
      const result = Math.max(0.05, maxTransmission);
      rainCacheRef.current = { x: ipx, y: ipy, hash: curHash, value: result };
      return result;
  }, []);

  // Update rain volume dynamically based on spatial outdoor exposure and door status
  useEffect(() => {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'suspended') return;

      const currentWeatherId = currentWeatherIdRef.current;
      if (currentWeatherId !== 'RAIN') return;

      const track = streamCache.current.get('RAIN');
      if (!track || !track.gain) return;

      const now = ctx.currentTime;
      const soundDef = resolveSoundDef('RAIN');
      const baseVolume = (soundDef as any)?.volume ?? 1.0;
      const targetVolume = baseVolume * getRainDynamicMultiplier();

      // Avoid scheduling a web audio update if the target volume is virtually identical
      if (Math.abs(lastRainTargetVolumeRef.current - targetVolume) < 0.001) {
          return;
      }
      lastRainTargetVolumeRef.current = targetVolume;

      const currentGain = track.gain.gain.value;
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(currentGain, now);
      track.gain.gain.linearRampToValueAtTime(targetVolume, now + 0.25);
  }, [Math.floor(player.pos.x), Math.floor(player.pos.y), levelData?.name, structuralHash, getRainDynamicMultiplier, resolveSoundDef]);

  const initContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctx();
      const ctx = audioContextRef.current;

      masterGainRef.current = ctx.createGain();
      musicBusRef.current = ctx.createGain();
      sfxBusRef.current = ctx.createGain();
      uiBusRef.current = ctx.createGain();
      mufflableBusRef.current = ctx.createGain();
      
      voiceBusRef.current = ctx.createGain();
      voiceOutdoorSendRef.current = ctx.createGain();
      voiceSmallRoomSendRef.current = ctx.createGain();
      voiceLargeRoomSendRef.current = ctx.createGain();

      sfxToOutdoorReverbRef.current = ctx.createGain();
      sfxToSmallRoomReverbRef.current = ctx.createGain();
      sfxToLargeRoomReverbRef.current = ctx.createGain();

      dryGainRef.current = ctx.createGain();
      wetGainRef.current = ctx.createGain();
      filterNodeRef.current = ctx.createBiquadFilter();

      filterNodeRef.current.type = 'lowpass';
      filterNodeRef.current.frequency.value = 600; 
      filterNodeRef.current.Q.value = 0; 

      masterGainRef.current.gain.value = volumeSettings.master / 100;
      musicBusRef.current.gain.value = volumeSettings.music / 100;
      sfxBusRef.current.gain.value = volumeSettings.sound / 100;
      uiBusRef.current.gain.value = volumeSettings.sound / 100;
      mufflableBusRef.current.gain.value = 1.0;
      
      sfxToOutdoorReverbRef.current.gain.value = volumeSettings.sound / 100;
      sfxToSmallRoomReverbRef.current.gain.value = volumeSettings.sound / 100;
      sfxToLargeRoomReverbRef.current.gain.value = volumeSettings.sound / 100;

      dryGainRef.current.gain.value = 1.0;
      wetGainRef.current.gain.value = 0.0;

      musicBusRef.current.connect(mufflableBusRef.current);
      sfxBusRef.current.connect(mufflableBusRef.current);

      voiceBusRef.current.connect(mufflableBusRef.current);
      voiceBusRef.current.connect(voiceOutdoorSendRef.current);
      voiceBusRef.current.connect(voiceSmallRoomSendRef.current);
      voiceBusRef.current.connect(voiceLargeRoomSendRef.current);

      mufflableBusRef.current.connect(dryGainRef.current); 
      mufflableBusRef.current.connect(wetGainRef.current); 

      dryGainRef.current.connect(masterGainRef.current);

      wetGainRef.current.connect(filterNodeRef.current);
      filterNodeRef.current.connect(masterGainRef.current);

      uiBusRef.current.connect(masterGainRef.current);

      // --- Algorithmic Reverb Setup ---
      const createReverbBus = (delayTimes: number[], feedbackGain: number, filterFreq: number) => {
          const input = ctx.createGain();
          input.gain.value = 1.0;

          // Diffusion (Allpass filters to smear transients and reduce metallic ringing)
          const allpass1 = ctx.createBiquadFilter();
          allpass1.type = 'allpass';
          allpass1.frequency.value = 300;

          const allpass2 = ctx.createBiquadFilter();
          allpass2.type = 'allpass';
          allpass2.frequency.value = 1000;

          input.connect(allpass1);
          allpass1.connect(allpass2);

          const sum = ctx.createGain();
          sum.gain.value = 0.5; // Prevent clipping from summing

          // Parallel comb filters with lowpass in feedback loop (Moorer's reverb)
          for (let i = 0; i < delayTimes.length; i++) {
              const delay = ctx.createDelay();
              delay.delayTime.value = delayTimes[i];

              const filter = ctx.createBiquadFilter();
              filter.type = 'lowpass';
              filter.frequency.value = filterFreq;

              const feedback = ctx.createGain();
              feedback.gain.value = feedbackGain;

              // Routing for this comb
              allpass2.connect(delay);
              delay.connect(filter);
              filter.connect(feedback);
              feedback.connect(delay);

              // Output of this comb goes to sum
              delay.connect(sum);
          }

          // SAFETY: Add a compressor (limiter) to absolutely prevent blowing out speakers
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -12;
          compressor.knee.value = 10;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.1;

          sum.connect(compressor);
          compressor.connect(mufflableBusRef.current!);

          return input;
      };

      // Outdoor: very short delays, low feedback, high frequency absorption
      outdoorReverbBusRef.current = createReverbBus([0.011, 0.013, 0.017, 0.019], 0.2, 1500);
      
      // Small Room: short delays, medium feedback, medium frequency absorption
      smallRoomReverbBusRef.current = createReverbBus([0.0293, 0.0371, 0.0433, 0.0537], 0.5, 3000);
      
      // Large Room: longer delays, higher feedback, lower frequency absorption
      largeRoomReverbBusRef.current = createReverbBus([0.0433, 0.0537, 0.0673, 0.0797], 0.7, 2000);
      // --------------------------------

      voiceOutdoorSendRef.current.connect(outdoorReverbBusRef.current);
      voiceSmallRoomSendRef.current.connect(smallRoomReverbBusRef.current);
      voiceLargeRoomSendRef.current.connect(largeRoomReverbBusRef.current);

      sfxToOutdoorReverbRef.current.connect(outdoorReverbBusRef.current);
      sfxToSmallRoomReverbRef.current.connect(smallRoomReverbBusRef.current);
      sfxToLargeRoomReverbRef.current.connect(largeRoomReverbBusRef.current);

      // Create a master dynamics compressor (limiter) to absolutely prevent digital clipping
      const masterLimiter = ctx.createDynamicsCompressor();
      masterLimiter.threshold.value = -3; // Start compression at -3dB to prevent clipping
      masterLimiter.knee.value = 5;
      masterLimiter.ratio.value = 20; // Hard limiter ratio
      masterLimiter.attack.value = 0.001; // Instant response (1ms)
      masterLimiter.release.value = 0.1;

      masterGainRef.current.connect(masterLimiter);
      masterLimiter.connect(ctx.destination);
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    // Proactively decode all cached array buffers now that context is ready
    const ctx = audioContextRef.current;
    if (ctx) {
        const urls = Array.from(arrayBufferCache.current.keys());
        urls.forEach(url => {
            const arrayBuffer = arrayBufferCache.current.get(url);
            if (arrayBuffer && !decodingPromises.current.has(url)) {
                arrayBufferCache.current.delete(url);
                const decodePromise = ctx.decodeAudioData(arrayBuffer.slice(0));
                decodingPromises.current.set(url, decodePromise);
                decodePromise.then(audioBuffer => {
                    bufferCache.current.set(url, audioBuffer);
                    decodingPromises.current.delete(url);
                }).catch(e => {
                    console.warn(`Failed to background decode sound: ${url}`, e);
                    decodingPromises.current.delete(url);
                });
            }
        });
    }

    while (queuedSounds.current.length > 0) {
      const s = queuedSounds.current.shift();
      if (s) playSound(s.name, s.pos, s.id, s.delayMs, undefined, s.maxDistance, s.loop, s.nonPositional);
    }
    
    streamCache.current.forEach((track) => {
        if (!track.source && audioContextRef.current) {
            connectStreamTrack(track, audioContextRef.current, musicBusRef.current!);
        }
    });

    return { ctx: audioContextRef.current, voiceBus: voiceBusRef.current! };
  }, [volumeSettings]);

  const connectStreamTrack = useCallback((track: StreamTrack, ctx: AudioContext, bus: GainNode) => {
      if (track.source) return;
      try {
          track.source = ctx.createMediaElementSource(track.element);
          track.source.connect(track.gain);
          track.gain.connect(bus);
      } catch (e) {
          console.warn("Error connecting stream track", e);
          track.element.volume = 0; // Prevent direct playback if routing fails
      }
  }, []);

  const prepareStream = useCallback((url: string, id: string): Promise<void> => {
      return new Promise((resolve) => {
          if (streamCache.current.has(id)) {
              resolve();
              return;
          }
          const audio = new Audio();
          audio.crossOrigin = "anonymous";
          audio.src = url.startsWith('local://') ? (localStorage.getItem(url.substring(8)) || url) : url;
          audio.preload = "auto"; 
          audio.loop = true;
          const onReady = () => { cleanup(); resolve(); };
          const onError = (e: any) => { console.warn(`Failed to preload stream ${id}`, e); cleanup(); resolve(); };
          const cleanup = () => {
              audio.removeEventListener('canplay', onReady);
              audio.removeEventListener('canplaythrough', onReady);
              audio.removeEventListener('error', onError);
          };
          audio.addEventListener('canplay', onReady);
          audio.addEventListener('canplaythrough', onReady);
          audio.addEventListener('error', onError);
          audio.load(); 
          if (audioContextRef.current) {
              const ctx = audioContextRef.current;
              const gain = ctx.createGain();
              gain.gain.value = 0; 
              const track: StreamTrack = { element: audio, source: null, gain, id };
              const isWeather = id === 'RAIN';
              connectStreamTrack(track, ctx, isWeather ? sfxBusRef.current! : musicBusRef.current!);
              streamCache.current.set(id, track);
          }
      });
  }, [connectStreamTrack]);

  const loadSound = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    if (bufferCache.current.has(url)) return bufferCache.current.get(url)!;
    if (decodingPromises.current.has(url)) return await decodingPromises.current.get(url)!;
    
    if (!audioContextRef.current) await initContext();
    try {
      let arrayBuffer = arrayBufferCache.current.get(url);
      if (!arrayBuffer) {
          const resolvedUrl = url.startsWith('local://') ? (localStorage.getItem(url.substring(8)) || url) : url;
          const response = await fetch(resolvedUrl);
          arrayBuffer = await response.arrayBuffer();
      } else {
          arrayBufferCache.current.delete(url);
      }
      
      if (!audioContextRef.current) return null;
      const decodePromise = audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
      decodingPromises.current.set(url, decodePromise);
      const audioBuffer = await decodePromise;
      bufferCache.current.set(url, audioBuffer);
      decodingPromises.current.delete(url);
      return audioBuffer;
    } catch (e) {
      console.error(`Failed to load sound: ${url}`, e);
      decodingPromises.current.delete(url);
      return null;
    }
  }, [initContext]);

  const stopSound = useCallback((soundId: string) => {
    queuedSounds.current = queuedSounds.current.filter(s => (s.id || s.name) !== soundId);
    playTokens.current.delete(soundId);
    const sources = activeSources.current.get(soundId);
    if (sources) {
      sources.forEach(s => { try { s.stop(); } catch(e) {} });
      activeSources.current.delete(soundId);
    }
    activeNodes.current.delete(soundId);
  }, []);

  const stopAllSounds = useCallback(() => {
    queuedSounds.current = [];
    playTokens.current.clear();
    activeSources.current.forEach(sources => {
      sources.forEach(s => { try { s.stop(); } catch(e) {} });
    });
    activeSources.current.clear();
    activeNodes.current.clear();
  }, []);

  const playMusic = useCallback(async (trackId: string | null, options: { fadeOutDuration?: number, fadeInDuration?: number, shouldResume?: boolean, forceRestart?: boolean } = {}) => {
      let ctx = audioContextRef.current;
      if (!ctx && trackId) ctx = await initContext();
      if (!ctx || ctx.state === 'suspended') return;
      if (currentMusicIdRef.current === trackId && !options.forceRestart) return;

      const fadeOut = options.fadeOutDuration ?? 1.0;
      const fadeIn = options.fadeInDuration ?? 1.0;
      const shouldResume = options.shouldResume ?? false;
      let soundDef: undefined | null | object;
      let assetUrl: string | undefined;

      if (trackId) {
          lastMusicIdRef.current = trackId;
          soundDef = resolveSoundDef(trackId);
          if (!soundDef) return;
          assetUrl = (ASSETS.SOUNDS as any)[(soundDef as any).assetId] || (ASSETS.SPRITES as any)[(soundDef as any).assetId];
          if (!assetUrl) return;
      }

      let track: any;
      if (trackId && assetUrl) {
          track = streamCache.current.get(trackId);
          if (!track) {
              const audio = new Audio();
              audio.crossOrigin = "anonymous";
              audio.src = assetUrl.startsWith('local://') ? (localStorage.getItem(assetUrl.substring(8)) || assetUrl) : assetUrl;
              audio.preload = "auto";
              audio.loop = true;
              const gain = ctx.createGain();
              gain.gain.value = 0; 
              track = { element: audio, source: null, gain, id: trackId };
              connectStreamTrack(track, ctx, musicBusRef.current!);
              streamCache.current.set(trackId, track);
          } else if (!track.source) {
              connectStreamTrack(track, ctx, musicBusRef.current!);
          }
      }

      const now = ctx.currentTime;
      if (currentMusicIdRef.current) {
          const oldTrack = streamCache.current.get(currentMusicIdRef.current);
          if (oldTrack) {
              oldTrack.gain.gain.cancelScheduledValues(now);
              oldTrack.gain.gain.setValueAtTime(oldTrack.gain.gain.value, now);
              oldTrack.gain.gain.linearRampToValueAtTime(0, now + fadeOut);
              setTimeout(() => {
                  if (currentMusicIdRef.current !== oldTrack.id) {
                      oldTrack.element.pause();
                  }
              }, fadeOut * 1000 + 100);
          }
      }

      if (track && soundDef) {
          if (!shouldResume) track.element.currentTime = 0;
          track.element.play().catch((e: any) => console.warn("Music play failed", e));
          const trackBaseVolume = (soundDef as any).volume ?? 1.0;
          track.gain.gain.cancelScheduledValues(now);
          if (fadeIn > 0.05) {
              track.gain.gain.setValueAtTime(0, now);
              track.gain.gain.linearRampToValueAtTime(trackBaseVolume, now + fadeIn);
          } else {
              track.gain.gain.setValueAtTime(trackBaseVolume, now);
          }
      }
      currentMusicIdRef.current = trackId;
  }, [config, initContext, resolveSoundDef]);

  const pauseMusic = useCallback((options: { fadeOutDuration?: number } = {}) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const fadeOut = options.fadeOutDuration ?? 1.0;
      
      if (currentMusicIdRef.current) {
          const track = streamCache.current.get(currentMusicIdRef.current);
          if (track) {
              track.gain.gain.cancelScheduledValues(now);
              track.gain.gain.setValueAtTime(track.gain.gain.value, now);
              track.gain.gain.linearRampToValueAtTime(0, now + fadeOut);
              setTimeout(() => {
                  if (currentMusicIdRef.current === track.id) {
                      track.element.pause();
                  }
              }, fadeOut * 1000 + 100);
          }
      }
  }, []);

  const resumeMusic = useCallback(async (options: { fadeInDuration?: number } = {}) => {
      const targetTrackId = currentMusicIdRef.current || lastMusicIdRef.current;
      if (!targetTrackId) return;

      let ctx = audioContextRef.current;
      if (!ctx) ctx = await initContext();
      if (!ctx || ctx.state === 'suspended') return;
      
      const fadeIn = options.fadeInDuration ?? 1.0;
      const now = ctx.currentTime;
      
      const track = streamCache.current.get(targetTrackId);
      if (track) {
          const soundDef = resolveSoundDef(targetTrackId);
          if (!soundDef) return;
          
          track.element.play().catch((e: any) => console.warn("Music play failed", e));
          const trackBaseVolume = (soundDef as any).volume ?? 1.0;
          track.gain.gain.cancelScheduledValues(now);
          if (fadeIn > 0.05) {
              track.gain.gain.setValueAtTime(track.gain.gain.value, now);
              track.gain.gain.linearRampToValueAtTime(trackBaseVolume, now + fadeIn);
          } else {
              track.gain.gain.setValueAtTime(trackBaseVolume, now);
          }
          currentMusicIdRef.current = targetTrackId;
      } else {
          // If the track is not cached yet, play it from scratch with fade in
          playMusic(targetTrackId, { fadeInDuration: fadeIn, shouldResume: true });
      }
  }, [resolveSoundDef, initContext, playMusic]);

  const stopMusic = useCallback((options: { fadeOutDuration?: number } = {}) => {
      const ctx = audioContextRef.current;
      const fadeOut = options.fadeOutDuration ?? 1.0;
      const now = ctx ? ctx.currentTime : 0;
      
      if (currentMusicIdRef.current) {
          const track = streamCache.current.get(currentMusicIdRef.current);
          if (track) {
              if (ctx && fadeOut > 0.05) {
                  track.gain.gain.cancelScheduledValues(now);
                  track.gain.gain.setValueAtTime(track.gain.gain.value, now);
                  track.gain.gain.linearRampToValueAtTime(0, now + fadeOut);
                  setTimeout(() => {
                      track.element.pause();
                      track.element.currentTime = 0;
                  }, fadeOut * 1000 + 100);
              } else {
                  track.element.pause();
                  track.element.currentTime = 0;
                  track.gain.gain.setValueAtTime(0, now);
              }
          }
          currentMusicIdRef.current = null;
      }
  }, []);

  const playWeather = useCallback(async (trackId: string | null, options: { fadeOutDuration?: number, fadeInDuration?: number, forceRestart?: boolean } = {}) => {
      if (!trackId && !audioContextRef.current) return;
      
      let ctx = audioContextRef.current;
      if (!ctx && trackId) ctx = await initContext();
      if (!ctx || ctx.state === 'suspended') return;
      if (currentWeatherIdRef.current === trackId && !options.forceRestart) return;

      const fadeOut = options.fadeOutDuration ?? 1.0;
      const fadeIn = options.fadeInDuration ?? 1.0;
      const now = ctx.currentTime;

      if (currentWeatherIdRef.current) {
          const oldTrack = streamCache.current.get(currentWeatherIdRef.current);
          if (oldTrack) {
              oldTrack.gain.gain.cancelScheduledValues(now);
              oldTrack.gain.gain.setValueAtTime(oldTrack.gain.gain.value, now);
              oldTrack.gain.gain.linearRampToValueAtTime(0, now + fadeOut);
              setTimeout(() => {
                  if (currentWeatherIdRef.current !== oldTrack.id) {
                      oldTrack.element.pause();
                  }
              }, fadeOut * 1000 + 100);
          }
      }

      if (trackId) {
          const soundDef = resolveSoundDef(trackId);
          if (soundDef) {
              const assetUrl = (ASSETS.SOUNDS as any)[soundDef.assetId] || (ASSETS.SPRITES as any)[soundDef.assetId];
              if (assetUrl) {
                  let track = streamCache.current.get(trackId);
                  if (!track) {
                      const audio = new Audio();
                      audio.crossOrigin = "anonymous";
                      audio.src = assetUrl.startsWith('local://') ? (localStorage.getItem(assetUrl.substring(8)) || assetUrl) : assetUrl;
                      audio.preload = "auto";
                      audio.loop = true;
                      const gain = ctx.createGain();
                      gain.gain.value = 0;
                      track = { element: audio, source: null, gain, id: trackId };
                      connectStreamTrack(track, ctx, sfxBusRef.current!); 
                      streamCache.current.set(trackId, track);
                  } else if (!track.source) {
                      connectStreamTrack(track, ctx, sfxBusRef.current!);
                  }
                  
                  if (options.forceRestart) {
                      track.element.currentTime = 0;
                  }
                  track.element.play().catch(e => console.warn("Weather play failed", e));
                  const trackBaseVolume = ((soundDef as any).volume ?? 1.0) * (trackId === 'RAIN' ? getRainDynamicMultiplier() : 1.0);
                  track.gain.gain.cancelScheduledValues(now);
                  if (fadeIn > 0.05) {
                      track.gain.gain.setValueAtTime(0, now);
                      track.gain.gain.linearRampToValueAtTime(trackBaseVolume, now + fadeIn);
                  } else {
                      track.gain.gain.setValueAtTime(trackBaseVolume, now);
                  }
              }
          }
      }
      currentWeatherIdRef.current = trackId;
  }, [config, initContext, getRainDynamicMultiplier]);

  // --- UPDATED: 3D Spatial Update ---
  // When using HRTF, we update the SOURCE position in the world.
  // The Listener (Player) is already updated automatically by the useEffect.
  const updateSoundPosition = useCallback((id: string, pos: { x: number, y: number }, maxDistance: number = 20, immediate: boolean = false) => {
      const nodes = activeNodes.current.get(id);
      if (!nodes || (!nodes.panner && !nodes.nonPositional)) return; 
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;

      // OCCLUSION CHECK
      const soundDef = resolveSoundDef(nodes.soundName);
      let baseVol = (soundDef as any).volume ?? 1.0;
      baseVol *= 2.0; // Boost spatial sounds

      let occlusionMult = 1.0;
      
      const ld = levelDataRef.current;
      const useCam = cinematicModeRef.current && cinematicCameraRef.current;
      const refPos = useCam ? cinematicCameraRef.current : playerRef.current.pos;
      if (ld && refPos) {
          const px = Math.floor(refPos.x);
          const py = Math.floor(refPos.y);
          const npx = Math.floor(pos.x);
          const npy = Math.floor(pos.y);
          const curHash = structuralHashRef.current;

          if (
              nodes.lastPlayerX === px &&
              nodes.lastPlayerY === py &&
              nodes.lastNodeX === npx &&
              nodes.lastNodeY === npy &&
              nodes.lastHash === curHash &&
              nodes.lastOcclusionMult !== undefined
          ) {
              occlusionMult = nodes.lastOcclusionMult;
          } else {
              occlusionMult = getSoundOcclusion(refPos, pos, ld.grid, ld.width, ld.height);
              nodes.lastPlayerX = px;
              nodes.lastPlayerY = py;
              nodes.lastNodeX = npx;
              nodes.lastNodeY = npy;
              nodes.lastHash = curHash;
              nodes.lastOcclusionMult = occlusionMult;
          }

          if (occlusionMult < 1.0) {
              const nameUpper = nodes.soundName.toUpperCase();
              const isFootstep = nameUpper.includes('STEP') || footstepSoundsRef.current.has(nodes.soundName);
              if (isFootstep || nodes.soundName === 'SYS_FLIES') {
                  occlusionMult = 0; // Mute footsteps and flies through walls
              }
          }
      }

      const finalX = pos.x % 1 === 0 ? pos.x + 0.5 : pos.x;
      const finalY = pos.y % 1 === 0 ? pos.y + 0.5 : pos.y;

      const playerX = refPos ? refPos.x + 0.5 : finalX;
      const playerY = refPos ? refPos.y + 0.5 : finalY;
      const dx = finalX - playerX;
      const dy = finalY - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let distVolume = 0;
      if (dist < maxDistance) {
          const ratio = 1 - dist / maxDistance;
          distVolume = ratio * ratio;
      }

      if (nodes.nonPositional) {
          nodes.gain.gain.setTargetAtTime(baseVol * distVolume * occlusionMult, now, 0.1);
      } else if (nodes.panner instanceof PannerNode) {
          if (immediate) {
              nodes.panner.positionX.setValueAtTime(finalX, now);
              nodes.panner.positionZ.setValueAtTime(finalY, now);
          } else {
              nodes.panner.positionX.setTargetAtTime(finalX, now, 0.1);
              nodes.panner.positionZ.setTargetAtTime(finalY, now, 0.1);
          }
          // Apply manual falloff and occlusion gain
          nodes.gain.gain.setTargetAtTime(baseVol * distVolume * occlusionMult, now, 0.1);
      } else if (nodes.panner instanceof StereoPannerNode) {
          // Fallback for StereoPannerNode (Legacy or 2D mode)
          const playerAngle = useCam ? cinematicCameraRef.current.dir : (playerRef.current.dir360 - 1) * (Math.PI / 2);
          const soundAngle = Math.atan2(dy, dx);
          let relativeAngle = soundAngle - playerAngle;
          while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
          while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;

          const panValue = Math.max(-1, Math.min(1, Math.sin(relativeAngle)));
          if (Math.cos(relativeAngle) < 0) distVolume *= 0.8;
          
          const finalGain = baseVol * distVolume * occlusionMult;
          nodes.panner.pan.setTargetAtTime(panValue, now, 0.1);
          nodes.gain.gain.setTargetAtTime(finalGain, now, 0.1);
      }

      if (nodes.filter) {
          const targetCutoff = 800 + 19200 * Math.pow(occlusionMult, 0.5);
          nodes.filter.frequency.setTargetAtTime(Math.min(20000, targetCutoff), now, 0.1);
      }

  }, [config]);

  const playSound = useCallback(async (soundName: string, sourcePos?: { x: number, y: number }, uniqueId?: string, delayMs: number = 0, reverbPos?: { x: number, y: number }, maxDistance: number = 20, loopOverride?: boolean, nonPositionalOverride?: boolean) => {
    const ctx = audioContextRef.current;
    
    // For checks before we have resolved soundDef, use the plain name/id
    const tempTrackId = uniqueId || soundName;
    const callTime = performance.now();
    
    if (!ctx || ctx.state === 'suspended') {
      const isAlreadyQueued = queuedSounds.current.some(s => (s.id || s.name) === tempTrackId);
      if (!isAlreadyQueued) {
        queuedSounds.current.push({ name: soundName, pos: sourcePos, id: uniqueId, delayMs, maxDistance, loop: loopOverride, nonPositional: nonPositionalOverride });
      }
      return;
    }

    const soundDef = resolveSoundDef(soundName);
    if (!soundDef) return;

    const isLooped = soundDef.looped || !!loopOverride;

    // Early distance culling: if the sound is a one-shot (non-looped) and has a source position,
    // we can immediately check if it's beyond the maximum audible distance before performing
    // any asynchronous asset loads or Web Audio Node allocations.
    if (sourcePos && !isLooped) {
        const useCam = cinematicModeRef.current && cinematicCameraRef.current;
        const refPos = useCam ? cinematicCameraRef.current : playerRef.current.pos;
        if (refPos) {
            const dx = sourcePos.x - refPos.x;
            const dy = sourcePos.y - refPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDistance) {
                return; // Silent early cull for high-performance!
            }
        }
    }

    // Use a unique trackId for overlapping sounds to prevent them from overwriting each other
    // in activeNodes / activeSources (e.g. multiple footsteps, explosions playing in the same frame).
    const isOverlapping = soundDef.allowOverlap;
    const trackId = uniqueId || (isOverlapping ? `${soundName}_${Math.random().toString(36).substring(2, 9)}` : soundName);

    // Rate limiting to prevent crackling (distortion/clipping) when many decorations or casings break at once.
    // Looped sounds are excluded from rate-limiting to prevent cutouts in ambient tracks or loops.
    // Also exclude local player actions (sounds without sourcePos) so the player's footsteps/reloads are never blocked.
    if (!isLooped && sourcePos) {
        const nowMs = performance.now();
        let timestamps = soundRateLimitersRef.current.get(soundName) || [];
        timestamps = timestamps.filter(t => nowMs - t < 120); // 120ms sliding window
        
        let maxAllowed = 3;
        // Strict limit for high-frequency or numerous debris/casing sounds
        if (soundName === 'SYS_BRICK_HIT' || soundName === 'BRICK_HIT' || soundName.includes('CASING') || soundName === 'SYS_GLASS_SHATTER' || soundName === 'GLASS') {
            maxAllowed = 2;
        }
        
        if (timestamps.length >= maxAllowed) {
            return; // Exceeded limit, silent cull to protect AudioContext
        }
        timestamps.push(nowMs);
        soundRateLimitersRef.current.set(soundName, timestamps);
    }

    if (isLooped) {
        const active = activeSources.current.get(trackId);
        if (active && active.length > 0) return; 
    }

    const assetUrl = (ASSETS.SOUNDS as any)[soundDef.assetId] || (ASSETS.SPRITES as any)[soundDef.assetId];
    if (!assetUrl) return;

    if (!soundDef.allowOverlap) {
      stopSound(trackId);
    }

    const token = Date.now() + Math.random();
    if (!soundDef.allowOverlap) {
        playTokens.current.set(trackId, token);
    }

    const buffer = await loadSound(assetUrl);
    if (!buffer) return;
    
    // Check if stopSound was called while loading (only for non-overlapping sounds)
    if (!soundDef.allowOverlap && playTokens.current.get(trackId) !== token) {
        return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = isLooped;

    if (soundDef.randomizePitch) {
        source.playbackRate.value = 0.9 + Math.random() * 0.2;
    }

    const soundBaseVolume = (soundDef as any).volume ?? 1.0;
    const individualGainNode = ctx.createGain();
    
    // INITIAL OCCLUSION CHECK
    let initialVol = soundBaseVolume;
    let occlusionMult = 1.0;
    if (sourcePos) {
        initialVol *= 2.0; // Boost spatial sounds
        const ld = levelDataRef.current;
        const useCam = cinematicModeRef.current && cinematicCameraRef.current;
        const refPos = useCam ? cinematicCameraRef.current : playerRef.current.pos;
        if (ld && refPos) {
            const dx = sourcePos.x - refPos.x;
            const dy = sourcePos.y - refPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDistance && !isLooped) {
                 return; // Cull one-shot sounds fully if beyond hearing range
            }

            occlusionMult = getSoundOcclusion(refPos, sourcePos, ld.grid, ld.width, ld.height);
            let distVolume = 0;
            if (dist < maxDistance) {
                const ratio = 1 - dist / maxDistance;
                distVolume = ratio * ratio;
            }

            initialVol *= distVolume * occlusionMult;

            if (occlusionMult < 1.0) {
                const nameUpper = soundName.toUpperCase();
                const isFootstep = nameUpper.includes('STEP') || footstepSoundsRef.current.has(soundName);
                if (isFootstep || soundName === 'SYS_FLIES') {
                    initialVol = 0; // Mute footsteps and flies through walls/doors
                    occlusionMult = 0;
                }
            }
        }
    }
    individualGainNode.gain.value = initialVol;

    const isUiSound = soundName === 'SYS_CLICK' || soundName.startsWith('SYS_UI_') || soundName === 'SYS_TRANSACTION' || soundName === 'SYS_ERROR_BUMP' || soundName === 'SYS_EQUIP' || soundName === 'SYS_INVENTORY_OPEN' || soundName === 'SYS_INVENTORY_CLOSE';
    let targetNode: AudioNode;
    if (isUiSound) targetNode = uiBusRef.current || ctx.destination;
    else targetNode = sfxBusRef.current || ctx.destination;

    let pannerNode: PannerNode | StereoPannerNode | undefined;
    let finalSourceNode: AudioNode = individualGainNode;

    if (sourcePos) {
        // --- 3D HRTF PANNING / NON-POSITIONAL SPATIAL ---
        const isNonPositional = !!nonPositionalOverride || !!(soundDef as any)?.nonPositional;
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        const targetCutoff = 800 + 19200 * Math.pow(occlusionMult, 0.5);
        filterNode.frequency.value = Math.min(20000, targetCutoff);

        if (isNonPositional) {
            source.connect(individualGainNode);
            individualGainNode.connect(filterNode);
            filterNode.connect(targetNode);
            
            activeNodes.current.set(trackId, { filter: filterNode, gain: individualGainNode, soundName: soundName, pos: sourcePos, maxDistance: maxDistance, nonPositional: true });
            finalSourceNode = filterNode;
        } else {
            try {
                const panner = ctx.createPanner();
                panner.panningModel = 'HRTF'; // Quality binaural
                panner.distanceModel = 'linear'; // Disable Web Audio automatic distance falloff to handle it manually on GainNode
                panner.refDistance = maxDistance; 
                panner.maxDistance = maxDistance; // configurable max audible
                panner.rolloffFactor = 0.0; // Handled manually for maximum precision and performance
                panner.coneInnerAngle = 360; 
                panner.coneOuterAngle = 0;
                panner.coneOuterGain = 0;

                const finalX = sourcePos.x % 1 === 0 ? sourcePos.x + 0.5 : sourcePos.x;
                const finalY = sourcePos.y % 1 === 0 ? sourcePos.y + 0.5 : sourcePos.y;

                // Set Position (Grid Coords -> X, 0, Y)
                panner.positionX.value = finalX;
                panner.positionY.value = 0; // Height
                panner.positionZ.value = finalY; // Depth (Y in grid)

                source.connect(individualGainNode);
                individualGainNode.connect(filterNode);
                filterNode.connect(panner);
                panner.connect(targetNode);
                
                pannerNode = panner;
                finalSourceNode = panner;
            } catch (e) {
                // Fallback for browsers with limited Panner support
                console.warn("HRTF Panner failed, falling back to Stereo", e);
                const panner = ctx.createStereoPanner();
                source.connect(individualGainNode);
                individualGainNode.connect(filterNode);
                filterNode.connect(panner);
                panner.connect(targetNode);
                pannerNode = panner;
                finalSourceNode = panner;
            }
            
            activeNodes.current.set(trackId, { panner: pannerNode, filter: filterNode, gain: individualGainNode, soundName: soundName, pos: sourcePos, maxDistance: maxDistance });
        }

    } else if (soundName === 'THUNDER') {
      const panner3d = ctx.createPanner();
      panner3d.panningModel = 'HRTF';
      panner3d.distanceModel = 'inverse';
      panner3d.refDistance = 40; 
      panner3d.maxDistance = 10000;
      panner3d.positionX.value = (Math.random() - 0.5) * 40;
      panner3d.positionY.value = 40; // High altitude
      panner3d.positionZ.value = (Math.random() - 0.5) * 40; 
      
      const distFilter = ctx.createBiquadFilter();
      distFilter.type = 'lowpass';
      distFilter.frequency.value = 10000;
      
      individualGainNode.gain.value = soundBaseVolume * 1.0;
      source.connect(individualGainNode);
      individualGainNode.connect(distFilter);
      distFilter.connect(panner3d);
      panner3d.connect(targetNode);
      finalSourceNode = panner3d;
    } else {
      // Flat (UI / Global)
      source.connect(individualGainNode);
      individualGainNode.connect(targetNode);
      activeNodes.current.set(trackId, { gain: individualGainNode, soundName: soundName, pos: sourcePos, maxDistance: maxDistance });
      finalSourceNode = individualGainNode;
    }

    // --- PER-SOURCE REVERB SEND ---
    if (!isUiSound && !soundDef.reverberationIgnored && outdoorReverbBusRef.current && smallRoomReverbBusRef.current && largeRoomReverbBusRef.current) {
        let outdoorSend = 0;
        let smallRoomSend = 0;
        let largeRoomSend = 0;

        const ld = levelDataRef.current;
        if (ld) {
            const px = reverbPos ? Math.floor(reverbPos.x) : (sourcePos ? Math.floor(sourcePos.x) : Math.floor(playerRef.current.pos.x));
            const py = reverbPos ? Math.floor(reverbPos.y) : (sourcePos ? Math.floor(sourcePos.y) : Math.floor(playerRef.current.pos.y));
            
            let isOutdoors = false;
            if (ld.ceilingType === 'OUTDOOR') {
                isOutdoors = true;
                if (ld.grids && ld.grids[1] && ld.grids[1][py] && ld.grids[1][py][px]) {
                    const ceil = ld.grids[1][py][px];
                    if (ceil.type === 'WALL' || ceil.type === 'DOOR') isOutdoors = false;
                }
            }

            if (isOutdoors) {
                outdoorSend = 0.3; // Noticeable slapback for outdoors
            } else {
                // Use pre-calculated effective radius
                const effectiveRadius = reverbMapRef.current[py]?.[px] || 0;
                
                // Interpolate between small and large room based on effectiveRadius
                // effectiveRadius: 1-3 -> mostly small room
                // effectiveRadius: > 7 -> mostly large room
                const roomSizeFactor = Math.max(0, Math.min(1, (effectiveRadius - 2) / 5)); // 0 to 1
                
                // Base reverb amount increases slightly with room size
                const totalReverbAmount = 0.2 + (roomSizeFactor * 0.3); 

                smallRoomSend = totalReverbAmount * (1 - roomSizeFactor);
                largeRoomSend = totalReverbAmount * roomSizeFactor;
            }
        }
        
        if (outdoorSend > 0) {
            const send = ctx.createGain();
            send.gain.value = outdoorSend;
            finalSourceNode.connect(send);
            send.connect(sfxToOutdoorReverbRef.current!);
        }
        if (smallRoomSend > 0) {
            const send = ctx.createGain();
            send.gain.value = smallRoomSend;
            finalSourceNode.connect(send);
            send.connect(sfxToSmallRoomReverbRef.current!);
        }
        if (largeRoomSend > 0) {
            const send = ctx.createGain();
            send.gain.value = largeRoomSend;
            finalSourceNode.connect(send);
            send.connect(sfxToLargeRoomReverbRef.current!);
        }
    }
    // ------------------------------

    const loadTime = performance.now() - callTime;
    const remainingDelay = Math.max(0, delayMs - loadTime);
    source.start(ctx.currentTime + remainingDelay / 1000);

    const current = activeSources.current.get(trackId) || [];
    current.push(source);
    activeSources.current.set(trackId, current);

    source.onended = () => {
      const active = activeSources.current.get(trackId);
      if (active) {
        activeSources.current.set(trackId, active.filter(s => s !== source));
      }
      if (activeSources.current.get(trackId)?.length === 0) {
          activeNodes.current.delete(trackId);
      }
    };
  }, [config, loadSound]); 

  return { playSound, stopSound, stopAllSounds, playMusic, pauseMusic, resumeMusic, stopMusic, playWeather, loadSound, initContext, prepareStream, updateSoundPosition };
};
