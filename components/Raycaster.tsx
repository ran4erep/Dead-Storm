
/*
  RAYCASTER SKELETON
  Optimized for Soft Rendering (Buffer-based)
*/

import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Tile, Player, Item, Enemy, AnimationConfig, RoamingEnemyAnim, GameStrings } from '../types';
import { WebGLRenderer } from './raycaster/WebGLRenderer';
import { isWebGLActive, setWebGLActive, clearQuads, wallQuadsCollector } from './raycaster/WebGLState';
import { Particle, createRainParticles, createDirectionalBlood, returnParticlesToPool, clearCasingParticles, clearBloodParticles, clearRainSplashParticles, getParticle, createFlareSmokeParticle } from '../utils/particleSystem';
import { getFlareLightSpread } from '../utils/levelLogic';
import { ShakeEvent } from '../hooks/useVisualEffects';
import { getAngleFromDir, shortestAngleDiff, lerp, easeInOutQuad, createBufferFromImage, RaycasterBuffer, clearGlobalBufferCache } from './raycaster/RaycasterUtils';
import { computeLightningMap } from './raycaster/LightningMap';
import { renderBackground } from './raycaster/BackgroundRenderer';
import { renderWalls } from './raycaster/WallRenderer';
import { getDepthFactor, setDepthRenderDistance, setDepthWeather, setDepthAmbientBrightness, setDisableDistanceShading } from './raycaster/DepthEffect';
import { setGlobalRenderDistance } from './raycaster/RaycasterConstants';
import { PassThroughDoor, PassThroughWall, MirrorReflection } from './raycaster/RaycasterTypes';
import { renderEntities, renderPickupAnimation } from './raycaster/EntityRenderer';
import { collectPolyObjectsFromGrid, generatePolyObjectOccluders, generateReflectedPolyObjects } from './raycaster/PolyObjectRenderer';
import { renderParticles, updateAndProcessParticles } from './raycaster/ParticleRenderer';
import { hasActiveAmbientParticles } from '../utils/particleSystem';
import { BLOOD_GROWTH_DURATION, FLY_SPAWN_DELAY } from './raycaster/RaycasterConstants';
import { hasLineOfSight } from '../utils/combatLogic';
import { getCurrentAnimationFrame } from '../utils/animationUtils';
import { globalSpriteTintCache, clearGlobalSpriteTintCache } from './raycaster/SpriteCache';

// Производительные кривые интерполяции для разницы высот (оптимизированы и кэшированы)
// High-performance height interpolation curves (optimized and compiled)
function getFallCurve(t: number): number {
    if (t < 0.4) {
        // Мягкое начало шага, слегка кренимся вперед перед порогом обрыва
        const ratio = t / 0.4;
        return 0.1 * ratio * ratio;
    } else {
        // Быстрое ускоряющееся падение вниз с ударом о землю и амортизацией суставов
        const u = (t - 0.4) / 0.6; // нормировано от 0 до 1
        if (u < 0.75) {
            const ratio = u / 0.75;
            return 0.1 + 0.9 * (ratio * ratio * ratio); // кубическое ускорение
        } else {
            // Удар приземления и легкий сжимающий присед с плавной амортизацией (overshoot & settle)
            const v = (u - 0.75) / 0.25; // нормировано от 0 до 1
            const overshoot = 0.15; // Сила отдачи приземления
            return 1.0 + overshoot * Math.sin(v * Math.PI);
        }
    }
}

function getClimbCurve(t: number): number {
    // Вскарабкивание: сначала тяжело поднимаемся, затем уверенно выходим на уступ
    if (t < 0.3) {
        // Подготовка к усилию, медленный подъем таза
        const ratio = t / 0.3;
        return 0.08 * (1.0 - Math.cos(ratio * Math.PI / 2));
    } else if (t < 0.85) {
        // Активный подъем тела на верхнюю плоскость
        const u = (t - 0.3) / 0.55;
        const ease = 3 * u * u - 2 * u * u * u; // Квинтэссенция плавности (smoothstep)
        return 0.08 + 0.87 * ease;
    } else {
        // Стабилизация центра масс на целевой платформе
        const u = (t - 0.85) / 0.15;
        return 0.95 + 0.05 * Math.sin(u * Math.PI / 2);
    }
}

function getLadderClimbCurve(t: number, heightDiff: number): number {
    const rungSpacing = 0.3;
    const numRungs = Math.max(1, Math.round(heightDiff / rungSpacing));
    
    // Подъём по лестнице: сегментированный подъем по ступеням (rungs), затем плавный въезд на целевой пол
    if (t < 0.85) {
        const climbProgress = t / 0.85; // 0..1
        const rungProgress = climbProgress * numRungs;
        const rungIndex = Math.floor(rungProgress);
        const subT = rungProgress - rungIndex; // 0..1 внутри ступени
        
        // Быстрый подъем в первой части интервала, затем небольшая пауза (перехват рук)
        const riseT = Math.min(1.0, subT / 0.7);
        const easedRise = 3 * riseT * riseT - 2 * riseT * riseT * riseT; // smoothstep
        
        const baseHeightFraction = rungIndex / numRungs;
        const currentRungHeight = (1.0 / numRungs) * easedRise;
        
        // Достигает 0.9 к концу фазы t = 0.85
        return 0.9 * (baseHeightFraction + currentRungHeight);
    } else {
        // С t = 0.85 до 1.0 - "заезжает" на целевой пол
        const u = (t - 0.85) / 0.15;
        const ease = 3 * u * u - 2 * u * u * u;
        return 0.9 + 0.1 * ease;
    }
}

function getLadderHorizontalCurve(t: number): number {
    if (t < 0.85) {
        // Очень маленькое горизонтальное смещение в начале (всего 10% для ощущения наклона к лестнице)
        const climbProgress = t / 0.85;
        return climbProgress * 0.1;
    } else {
        // С 85% до 100% - плавный въезд на целевую плиту от 10% до 100%
        const u = (t - 0.85) / 0.15;
        const ease = 3 * u * u - 2 * u * u * u; // smoothstep
        return 0.1 + 0.9 * ease;
    }
}

const copyLightMapInPlace = (src: {r:number, g:number, b:number}[][], dest: {r:number, g:number, b:number}[][] | undefined): {r:number, g:number, b:number}[][] => {
    if (!dest || dest.length !== src.length || (src.length > 0 && dest[0].length !== src[0].length)) {
        const h = src.length;
        const newDest: {r:number, g:number, b:number}[][] = new Array(h);
        for (let y = 0; y < h; y++) {
            const srcRow = src[y];
            const w = srcRow ? srcRow.length : 0;
            const destRow = new Array(w);
            for (let x = 0; x < w; x++) {
                const cell = srcRow[x];
                destRow[x] = cell ? { r: cell.r, g: cell.g, b: cell.b } : { r: 1, g: 1, b: 1 };
            }
            newDest[y] = destRow;
        }
        return newDest;
    }
    const height = src.length;
    for (let y = 0; y < height; y++) {
        const srcRow = src[y];
        const destRow = dest[y];
        if (!srcRow || !destRow) continue;
        const width = srcRow.length;
        for (let x = 0; x < width; x++) {
            const sc = srcRow[x];
            const dc = destRow[x];
            if (sc && dc) {
                dc.r = sc.r;
                dc.g = sc.g;
                dc.b = sc.b;
            }
        }
    }
    return dest;
};

const copyFloorLightMapsInPlace = (src: {r:number, g:number, b:number}[][][], dest: {r:number, g:number, b:number}[][][] | undefined): {r:number, g:number, b:number}[][][] => {
    if (!dest || dest.length !== src.length || (src.length > 0 && (dest[0].length !== src[0].length || dest[0][0].length !== src[0][0].length))) {
        const layers = src.length;
        const newDest: {r:number, g:number, b:number}[][][] = new Array(layers);
        for (let fl = 0; fl < layers; fl++) {
            const srcLayer = src[fl];
            const h = srcLayer.length;
            const destLayer: {r:number, g:number, b:number}[][] = new Array(h);
            for (let y = 0; y < h; y++) {
                const srcRow = srcLayer[y];
                const w = srcRow ? srcRow.length : 0;
                const destRow = new Array(w);
                for (let x = 0; x < w; x++) {
                    const cell = srcRow[x];
                    destRow[x] = cell ? { r: cell.r, g: cell.g, b: cell.b } : { r: 1, g: 1, b: 1 };
                }
                destLayer[y] = destRow;
            }
            newDest[fl] = destLayer;
        }
        return newDest;
    }
    const layers = src.length;
    for (let fl = 0; fl < layers; fl++) {
        const srcLayer = src[fl];
        const destLayer = dest[fl];
        if (!srcLayer || !destLayer) continue;
        const height = srcLayer.length;
        for (let y = 0; y < height; y++) {
            const srcRow = srcLayer[y];
            const destRow = destLayer[y];
            if (!srcRow || !destRow) continue;
            const width = srcRow.length;
            for (let x = 0; x < width; x++) {
                const sc = srcRow[x];
                const dc = destRow[x];
                if (sc && dc) {
                    dc.r = sc.r;
                    dc.g = sc.g;
                    dc.b = sc.b;
                }
            }
        }
    }
    return dest;
};

const emptyHighlightSet = new Set<number>();

interface RaycasterProps {
  strings?: GameStrings | null;
  grid: Tile[][];
  grids?: Tile[][][];
  lightMap?: {r:number, g:number, b:number}[][];
  floorLightMaps?: {r:number, g:number, b:number}[][][];
  dynamicLights?: import('../utils/levelLogic').DynamicLightSpread[];
  outdoorMap?: boolean[][];
  player: Player;
  lookAroundAngleRef?: React.MutableRefObject<number>;
  lookAroundPitchRef?: React.MutableRefObject<number>;
  width: number;
  height: number;
  fov?: number;
  sprites?: Map<string, HTMLImageElement>;
  wallTexture?: HTMLImageElement | null;
  floorTexture?: HTMLImageElement | null;
  doorTexture?: HTMLImageElement | null;
  skyTexture?: HTMLImageElement | null;
  ceilingTexture?: HTMLImageElement | null;
  ceilingType?: 'INDOOR' | 'OUTDOOR';
  weather?: 'none' | 'rain' | 'fog';
  fogColor?: string;
  fogDistance?: number;
  levelParticles?: import('../types').SectorParticle[];
  particlesDb?: any;
  hiddenEnemyIds?: string[];
  pickupAnim?: { item: Item, startTime: number, x: number, y: number, reverse?: boolean } | null;
  throwAnim?: { item: Item, startTime: number, x: number, y: number } | null;
  shakeEvent?: ShakeEvent | null;
  enemyMoveAnim?: {id: string, startX: number, startY: number, endX: number, endY: number, startTime: number} | null;
  enemyMoveAnimRef?: React.MutableRefObject<{id: string, startX: number, startY: number, endX: number, endY: number, startTime: number} | null>;
  boxMoveAnims?: {id: string, startX: number, startY: number, endX: number, endY: number, startTime: number}[];
  boxMoveAnimsRef?: React.MutableRefObject<{id: string, startX: number, startY: number, endX: number, endY: number, startTime: number}[]>;
  pickupAnimRef?: React.MutableRefObject<{ item: Item, startTime: number, x: number, y: number, reverse?: boolean } | null>;
  throwAnimRef?: React.MutableRefObject<{ item: Item, startTime: number, x: number, y: number } | null>;
  roamingAnimsRef?: React.MutableRefObject<RoamingEnemyAnim[]>;
  highlightedTiles?: { x: number, y: number, color: string }[]; 
  highlightedEntityId?: string | null;
  activeAttackerId?: string | null;
  damagedEnemyIds?: string[]; 
  debugTextures?: boolean;
  showFps?: boolean;
  animationDuration?: number; 
  muzzleFlashIntensity?: number;
  muzzleFlashIntensityRef?: React.MutableRefObject<number>; 
  enemyFlashes?: {x: number, y: number, startTime: number, duration?: number, intensity?: number, isFlashbang?: boolean}[]; 
  enemyFlashesRef?: React.MutableRefObject<{x: number, y: number, startTime: number, duration?: number, intensity?: number, isFlashbang?: boolean}[]>;
  playerDamageSource?: {x: number, y: number, id: string} | null; 
  enemies?: Map<string, Enemy>; 
  enemiesRef?: React.MutableRefObject<Map<string, Enemy>>;
  isCombatActive?: boolean; 
  combatEnemies?: any[]; 
  animations: AnimationConfig;
  playSound: (soundName: string, pos?: { x: number, y: number }) => void;
  explosions?: {id: string, x: number, y: number, assetId: string, startTime: number}[]; 
  explosionsRef?: React.MutableRefObject<{id: string, x: number, y: number, assetId: string, startTime: number}[]>;
  activeDialogueNPCId?: string | null; 
  lootAnims?: { id: string, item: Item, x: number, y: number, startTime: number, targetX: number, targetY: number }[];
  roamingAnims?: RoamingEnemyAnim[]; 
  aiDebug?: boolean; 
  pitLineVis?: boolean; 
  customWallBuffers?: Map<number, RaycasterBuffer>; // OPTIMIZED: Number keys
  customFloorBuffers?: Map<number, RaycasterBuffer>; // OPTIMIZED: Number keys
  onParticleHit?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR') => void; 
  onShardLanded?: (p: Particle) => void;
  onParticleBounce?: (p: Particle) => void;
  playerReflectionSprite?: HTMLCanvasElement | null;
  flashlightActive?: boolean;
  flashlightBatteryRatio?: number;
  resolutionDivisor?: number;
  isPaused?: boolean;
  deathAnimProgress?: number;
  deathAnimProgressRef?: React.MutableRefObject<number>;
  fallAnimProgressRef?: React.MutableRefObject<number>;
  scriptedDeathProgressRef?: React.MutableRefObject<number>;
  renderDistance?: number;
  raycasterCamera?: { x: number; y: number; dir: number; pitch?: number; zoom?: number; floor?: number } | null;
  cinematicCameraRef?: React.MutableRefObject<{ x: number; y: number; dir: number; pitch?: number; zoom?: number; floor?: number } | null>;
  onFrameRendered?: () => void;
  aimingSys?: any;
  gameState?: string;
  constructionPalette?: any[];
  doorDefinitions?: Record<string, any> | any[];
  portalsPalette?: any[];
  forceSoftRenderer?: boolean;
  viewportSmoothing?: boolean;
  textureFiltering?: boolean;
  lightning5s?: boolean;
  levelPath?: string;
  settings?: any;
}

const getEffectiveTileHeight = (tile: any) => {
    if (!tile) return 0.0;
    const baseH = (tile.type === 'FLOOR' && tile.height !== undefined) ? tile.height : 0.0;
    if (tile.decoration?.isBox && baseH < 0.0) {
        return 0.0;
    }
    return baseH;
};

const Raycaster = forwardRef<any, RaycasterProps>(({ 
    strings, grid, grids, lightMap, floorLightMaps, dynamicLights, outdoorMap, player, width, height, fov = 0.66, 
    sprites, wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
    ceilingType = 'INDOOR', weather = 'none', fogColor, fogDistance, hiddenEnemyIds = [], 
    pickupAnim, pickupAnimRef, throwAnim, throwAnimRef, shakeEventRef, enemyMoveAnim, enemyMoveAnimRef, boxMoveAnims = [], boxMoveAnimsRef, highlightedTiles = [], highlightedEntityId = null,
    activeAttackerId, damagedEnemyIds = [], debugTextures = true, showFps = false, animationDuration = 160,
    muzzleFlashIntensity, muzzleFlashIntensityRef, enemyFlashes = [], enemyFlashesRef, playerDamageSource, enemies, enemiesRef, isCombatActive = false,
    combatEnemies = [], animations, playSound, explosions = [], explosionsRef, activeDialogueNPCId = null, lootAnims = [], roamingAnims = [], roamingAnimsRef,
    aiDebug = false, pitLineVis = false, customWallBuffers, customFloorBuffers, onParticleHit, onShardLanded, onParticleBounce,
    playerReflectionSprite, flashlightActive = false, flashlightBatteryRatio = 1.0, resolutionDivisor = 1, isPaused = false, deathAnimProgress = 0,
    deathAnimProgressRef, fallAnimProgressRef, scriptedDeathProgressRef, cinematicCameraRef,
    lookAroundAngleRef, lookAroundPitchRef, renderDistance = 15, raycasterCamera = null,
    onFrameRendered, levelParticles, particlesDb, aimingSys, gameState,
    constructionPalette = [], doorDefinitions = {}, portalsPalette = [],
    forceSoftRenderer = false,
    viewportSmoothing = false,
    textureFiltering = false,
    lightning5s = false,
    levelPath,
    settings
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlaysContainerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglRendererRef = useRef<WebGLRenderer | null>(null);
  const tempCpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flickerStatesRef = useRef<Map<string, { cycleStartTime: number; cycleDuration: number }>>(new Map());
  const weaponTintMainRef = useRef<HTMLElement | null>(null);
  const weaponTintAkimboRef = useRef<HTMLElement | null>(null);
  
  const propsRef = useRef({
    strings, grid, grids, lightMap, floorLightMaps, dynamicLights, outdoorMap, player, width, height, fov, 
    sprites, wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
    ceilingType, weather, fogColor, fogDistance, hiddenEnemyIds, pickupAnim, pickupAnimRef, throwAnim, throwAnimRef, shakeEvent: shakeEventRef, 
    enemyMoveAnim, enemyMoveAnimRef, boxMoveAnims, boxMoveAnimsRef, highlightedTiles, highlightedEntityId, activeAttackerId, damagedEnemyIds, 
    debugTextures, showFps, animationDuration, muzzleFlashIntensity, muzzleFlashIntensityRef, enemyFlashes, enemyFlashesRef, 
    playerDamageSource, enemies, enemiesRef, isCombatActive, combatEnemies, animations, 
    playSound, explosions, explosionsRef, activeDialogueNPCId, lootAnims, roamingAnims, roamingAnimsRef, aiDebug, pitLineVis, 
    customWallBuffers, customFloorBuffers, onParticleHit, 
    onShardLanded, onParticleBounce, playerReflectionSprite, flashlightActive, flashlightBatteryRatio, 
    resolutionDivisor, isPaused, deathAnimProgress, deathAnimProgressRef, fallAnimProgressRef, scriptedDeathProgressRef, cinematicCameraRef, lookAroundAngleRef, lookAroundPitchRef, renderDistance, onFrameRendered, raycasterCamera, levelParticles, particlesDb, aimingSys, gameState,
    constructionPalette, doorDefinitions, portalsPalette, forceSoftRenderer, viewportSmoothing, textureFiltering
  });
  propsRef.current = {
    strings, grid, grids, lightMap, floorLightMaps, dynamicLights, outdoorMap, player, width, height, fov, 
    sprites, wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
    ceilingType, weather, fogColor, fogDistance, hiddenEnemyIds, pickupAnim, pickupAnimRef, throwAnim, throwAnimRef, shakeEvent: shakeEventRef, 
    enemyMoveAnim, enemyMoveAnimRef, boxMoveAnims, boxMoveAnimsRef, highlightedTiles, highlightedEntityId, activeAttackerId, damagedEnemyIds, 
    debugTextures, showFps, animationDuration, muzzleFlashIntensity, muzzleFlashIntensityRef, enemyFlashes, enemyFlashesRef, 
    playerDamageSource, enemies, enemiesRef, isCombatActive, combatEnemies, animations, 
    playSound, explosions, explosionsRef, activeDialogueNPCId, lootAnims, roamingAnims, roamingAnimsRef, aiDebug, pitLineVis, 
    customWallBuffers, customFloorBuffers, onParticleHit, 
    onShardLanded, onParticleBounce, playerReflectionSprite, flashlightActive, flashlightBatteryRatio, 
    resolutionDivisor, isPaused, deathAnimProgress, deathAnimProgressRef, fallAnimProgressRef, scriptedDeathProgressRef, cinematicCameraRef, lookAroundAngleRef, lookAroundPitchRef, renderDistance, raycasterCamera, onFrameRendered, levelParticles, particlesDb, aimingSys, gameState,
    constructionPalette, doorDefinitions, portalsPalette, forceSoftRenderer, viewportSmoothing, textureFiltering
  };
  
  useImperativeHandle(ref, () => ({
    getScreenshot: () => {
      return canvasRef.current?.toDataURL('image/jpeg', 0.5) || null;
    },
    spawnParticles: (newParticles: Particle[]) => {
      particlesRef.current.push(...newParticles);
      window.dispatchEvent(new CustomEvent('raycaster-look'));
    },
    clearParticles: () => {
      returnParticlesToPool(particlesRef.current);
      particlesRef.current = [];
      for (const flies of fliesRef.current.values()) {
        returnParticlesToPool(flies);
      }
      fliesRef.current.clear();
      clearCasingParticles();
      clearBloodParticles();
      clearRainSplashParticles();
    },
    getAuxBuffers: () => auxBuffers,
    getCameraState: () => {
      if (propsRef.current.raycasterCamera) {
        return {
          x: propsRef.current.raycasterCamera.x,
          y: propsRef.current.raycasterCamera.y,
          angle: propsRef.current.raycasterCamera.dir,
          pitch: propsRef.current.raycasterCamera.pitch || 0,
          zoom: propsRef.current.raycasterCamera.zoom || 1.0,
          floor: propsRef.current.raycasterCamera.floor !== undefined ? propsRef.current.raycasterCamera.floor : (lastFloorHeightRef.current || 0),
        };
      }
      const angle = animState.current.angle + (propsRef.current.lookAroundAngleRef?.current || 0);
      const pitch = propsRef.current.lookAroundPitchRef?.current || 0;
      return { x: animState.current.x, y: animState.current.y, angle, pitch, floor: lastFloorHeightRef.current || 0 };
    },
    triggerBump: (x: number, y: number) => {
      startState.current = { x: animState.current.x, y: animState.current.y, angle: animState.current.angle, isMoving: false, progress: 0 };
      targetState.current = { x, y, angle: targetState.current.angle };
      lerpStartTime.current = performance.now();
      window.dispatchEvent(new CustomEvent('raycaster-look'));
      
      // Return to original position after 150ms
      setTimeout(() => {
        startState.current = { x: animState.current.x, y: animState.current.y, angle: animState.current.angle, isMoving: false, progress: 0 };
        targetState.current = { x: player.pos.x, y: player.pos.y, angle: getAngleFromDir(player.dir360 ?? player.dir) };
        lerpStartTime.current = performance.now();
        window.dispatchEvent(new CustomEvent('raycaster-look'));
      }, 150);
    }
  }));

  const spriteTintCache = { current: globalSpriteTintCache };
  
  const particlesRef = useRef<Particle[]>([]);
  const rainRef = useRef<Particle[]>([]);
  const fliesRef = useRef<Map<string, Particle[]>>(new Map());
  const hasActiveAnimationsRef = useRef<boolean>(false);
  const lastProcessedDamageIds = useRef<Set<string>>(new Set());
  const lastProcessedPlayerDamageId = useRef<string | null>(null);
  const waterVisibleRef = useRef<boolean>(false);

  const playSoundRef = useRef(playSound);
  useEffect(() => { playSoundRef.current = playSound; }, [playSound]);

  const fpsRef = useRef<HTMLSpanElement>(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  const stageAccRef = useRef({ bg: 0, walls: 0, gl: 0, ent: 0, part: 0, oth: 0, frames: 0 });

  const [lightningIntensity, setLightningIntensity] = useState(0);

  const animState = useRef({
    x: player.pos.x,
    y: player.pos.y,
    angle: (player.dir360 - 1) * (Math.PI / 2),
    isMoving: false,
    progress: 0 
  });

  const targetState = useRef({
    x: player.pos.x,
    y: player.pos.y,
    angle: (player.dir360 - 1) * (Math.PI / 2)
  });

  const animationFrameId = useRef<number>(0);
  const lerpStartTime = useRef<number>(0);
  const startState = useRef({ ...animState.current });
  const activeAttackerStartTimeRef = useRef<number>(0);
  const prevActiveAttackerIdRef = useRef<string | null>(null);

  useEffect(() => {
      if (activeAttackerId && activeAttackerId !== prevActiveAttackerIdRef.current) {
          activeAttackerStartTimeRef.current = performance.now();
      }
      prevActiveAttackerIdRef.current = activeAttackerId || null;
  }, [activeAttackerId]);

  // --- TEXTURE BUFFERS ---
  const [floorBuffer, setFloorBuffer] = useState<RaycasterBuffer | null>(null);
  const [ceilingBuffer, setCeilingBuffer] = useState<RaycasterBuffer | null>(null);
  const [skyBuffer, setSkyBuffer] = useState<RaycasterBuffer | null>(null);
  const [wallBuffer, setWallBuffer] = useState<RaycasterBuffer | null>(null);
  const [doorBuffer, setDoorBuffer] = useState<RaycasterBuffer | null>(null);
  
  const [auxBuffers, setAuxBuffers] = useState<Map<string, RaycasterBuffer>>(new Map());

  const stateRef = useRef({
    floorBuffer, ceilingBuffer, skyBuffer, wallBuffer, doorBuffer, auxBuffers, lightningIntensity
  });
  stateRef.current = {
    floorBuffer, ceilingBuffer, skyBuffer, wallBuffer, doorBuffer, auxBuffers, lightningIntensity
  };

  // --- SHARED BUFFERS (Reusable to prevent GC) ---
  const screenBufferRef = useRef<ImageData | null>(null);
  const screenDataRef = useRef<Uint32Array | null>(null);

  // Reused buffers for wall rendering calculations
  const wallZBufferRef = useRef<Float32Array | null>(null);
  const wallSolidWallTopBufferRef = useRef<Int32Array | null>(null);
  const wallPassDoorsRef = useRef<PassThroughDoor[][] | null>(null);
  const wallPassWallsRef = useRef<PassThroughWall[][] | null>(null);
  const mirrorReflectionsRef = useRef<MirrorReflection[][] | null>(null);
  const rowDistancesRef = useRef<Float32Array | null>(null);
  
  // Reused Set for background rendering
  const highlightSetRef = useRef<Set<number>>(new Set());
  const lastFrameTimeRef = useRef<number>(0);
  const lastShadingDistRef = useRef<number | null>(null);
  
  // Smooth camera height interpolation refs (Интерполяция высоты камеры)
  const lastBaseZRef = useRef<number | null>(null);
  const lastFloorHeightRef = useRef<number | null>(null);
  const floorHeightVelocityRef = useRef<number>(0);
  const lastCameraRenderTimeRef = useRef<number | null>(null);
  const isHeightInterpolatingRef = useRef<boolean>(false);
  const deepFallStartRef = useRef<number | null>(null);
  const deepFallDurationRef = useRef<number>(600);
  
  // Flashlight cache
  const flashlightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempFlashlightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashlightSizeRef = useRef<{ w: number, h: number }>({ w: 0, h: 0 });

  useEffect(() => {
      // Re-allocate screen buffer if dimensions change
      if (!screenBufferRef.current || screenBufferRef.current.width !== width || screenBufferRef.current.height !== height) {
          const imageData = new ImageData(width, height);
          screenBufferRef.current = imageData;
          screenDataRef.current = new Uint32Array(imageData.data.buffer);
          
          // Allocate standard wall buffers
          wallZBufferRef.current = new Float32Array(width);
          wallSolidWallTopBufferRef.current = new Int32Array(width);
          wallPassDoorsRef.current = Array.from({length: width}, () => []);
          wallPassWallsRef.current = Array.from({length: width}, () => []);
          mirrorReflectionsRef.current = Array.from({length: width}, () => []);
          rowDistancesRef.current = new Float32Array(height);
      }
  }, [width, height]);

  // Convert Images to Buffers and manage level transitions
  useEffect(() => {
      // Clear global CPU caches to prevent memory leaks and slow canvas lookups
      clearGlobalBufferCache();
      clearGlobalSpriteTintCache();

      // Explicitly purge the WebGL renderer GPU caches
      if (webglRendererRef.current) {
          webglRendererRef.current.clearLevelCache();
      }

      // Purge active particles, casings, blood splatters, and flies from previous level
      if (particlesRef.current.length > 0) {
          returnParticlesToPool(particlesRef.current);
          particlesRef.current = [];
      }
      for (const flies of fliesRef.current.values()) {
          returnParticlesToPool(flies);
      }
      fliesRef.current.clear();
      clearCasingParticles();
      clearBloodParticles();
      clearRainSplashParticles();

      setFloorBuffer(floorTexture && floorTexture.width > 0 ? createBufferFromImage(floorTexture, 'floor') : null);
      setCeilingBuffer(ceilingTexture && ceilingTexture.width > 0 ? createBufferFromImage(ceilingTexture, 'ceiling') : null);
      setSkyBuffer(skyTexture && skyTexture.width > 0 ? createBufferFromImage(skyTexture, 'sky') : null);
      setWallBuffer(wallTexture && wallTexture.width > 0 ? createBufferFromImage(wallTexture, 'wall') : null);
      setDoorBuffer(doorTexture && doorTexture.width > 0 ? createBufferFromImage(doorTexture, 'door') : null);
  }, [floorTexture, ceilingTexture, skyTexture, wallTexture, doorTexture, levelPath]);

  // Create buffers for any bottomTextureIds found in grid
  useEffect(() => {
      if (!grid || !sprites) return;
      
      const neededIds = new Set<string>();
      
      // Helper to scan a grid layer
      const scan = (g: Tile[][]) => {
          g.forEach(row => row.forEach(tile => {
              if (tile.bottomTextureId) neededIds.add(tile.bottomTextureId);
              if (tile.topTextureId) neededIds.add(tile.topTextureId);
              if (tile.assetId) neededIds.add(tile.assetId); // Also scan for tile-specific textures
              if (tile.maskId) neededIds.add(tile.maskId); // Scan for mirror masks
              if (tile.faces) {
                  Object.values(tile.faces).forEach((id) => {
                      if (id) neededIds.add(id as string);
                  });
              }
              if (tile.door?.textureId) neededIds.add(tile.door.textureId); // Scan for custom door textures
              if (tile.door?.maskId) neededIds.add(tile.door.maskId); // Scan for door masks
              if (tile.glassAssetId) neededIds.add(tile.glassAssetId);
              if (tile.explosive?.assetId) neededIds.add(tile.explosive.assetId);
          }));
      };

      if (grids) {
          grids.forEach(scan);
      } else {
          scan(grid);
      }

      // Pre-extract and cache buffers for all assets in palettes (construction, doors, portals)
      // to ensure CHANGE_TILE or script-spawned tiles have pre-generated buffers at start-up!
      if (constructionPalette) {
          constructionPalette.forEach((c: any) => {
              if (c.assetId) neededIds.add(c.assetId);
              if (c.floorAssetId) neededIds.add(c.floorAssetId);
              if (c.bottomTextureId) neededIds.add(c.bottomTextureId);
              if (c.topTextureId) neededIds.add(c.topTextureId);
              if (c.faces) {
                  Object.values(c.faces).forEach((id) => {
                      if (id) neededIds.add(id as string);
                  });
              }
              if (c.glassAssetId) neededIds.add(c.glassAssetId);
              if (c.keypadAssetId) neededIds.add(c.keypadAssetId);
              if (c.keypadMaskAssetId) neededIds.add(c.keypadMaskAssetId);
          });
      }

      if (doorDefinitions) {
          const doorsList = Array.isArray(doorDefinitions) 
              ? doorDefinitions 
              : Object.values(doorDefinitions);
          doorsList.forEach((d: any) => {
              if (d.textureId) neededIds.add(d.textureId);
              if (d.maskId) neededIds.add(d.maskId);
          });
      }

      if (portalsPalette) {
          portalsPalette.forEach((p: any) => {
              if (p.assetId) neededIds.add(p.assetId);
          });
      }

      neededIds.add('TEX_FALLBACK');

      if (neededIds.size > 0) {
          setAuxBuffers(prevAux => {
              let needsUpdate = false;
              if (neededIds.size !== prevAux.size) {
                  needsUpdate = true;
              } else {
                  neededIds.forEach(id => {
                      if (!prevAux.has(id)) needsUpdate = true;
                  });
              }
              
              if (!needsUpdate) return prevAux;

              const newAux = new Map<string, RaycasterBuffer>();
              let changed = false;
              
              neededIds.forEach(id => {
                  // Try raw ID first, then prefixed (as per assets loader convention)
                  let img = sprites.get(id);
                  if (!img) img = sprites.get(`TEX_${id}`);
                  
                  if (!img || img.width === 0) {
                      img = sprites.get('TEX_FALLBACK');
                  }
                  
                  if (img && img.width > 0) {
                      // Reuse existing buffer if available to save memory/CPU
                      const existingBuf = prevAux.get(id);
                      if (existingBuf) {
                          newAux.set(id, existingBuf);
                      } else {
                          const buf = createBufferFromImage(img, id);
                          if (buf) {
                              newAux.set(id, buf);
                              changed = true;
                          }
                      }
                  }
              });
              
              return (changed || newAux.size !== prevAux.size) ? newAux : prevAux;
          });
      }
      // CRITICAL OPTIMIZATION: Do NOT depend on `grid` directly.
      // Depend on grid dimensions. If dimensions change, it's a new level.
      // If a door opens, dimensions don't change, but `grid` reference does.
      // We don't want to rebuild texture buffers just because a door moved.
  }, [sprites, grid?.length, grid?.[0]?.length, grids?.length, constructionPalette, doorDefinitions, portalsPalette]);

  useEffect(() => {
    let newTargetX = player.pos.x;
    let newTargetY = player.pos.y;
    let newTargetAngle = getAngleFromDir(player.dir360 ?? player.dir);
    if (newTargetX === targetState.current.x && newTargetY === targetState.current.y && newTargetAngle === targetState.current.angle) return;

    const startTx = Math.round(targetState.current.x);
    const startTy = Math.round(targetState.current.y);
    const targetTx = Math.round(newTargetX);
    const targetTy = Math.round(newTargetY);

    if (grid) {
        const startTile = (startTy >= 0 && startTy < grid.length && startTx >= 0 && startTx < grid[startTy].length) ? grid[startTy][startTx] : null;
        const startFloorH = getEffectiveTileHeight(startTile);

        const targetTile = (targetTy >= 0 && targetTy < grid.length && targetTx >= 0 && targetTx < grid[targetTy].length) ? grid[targetTy][targetTx] : null;
        const targetFloorH = getEffectiveTileHeight(targetTile);

        const heightDiff = targetFloorH - startFloorH;
        if (heightDiff <= -0.29 && targetFloorH < -0.3 && targetFloorH >= -1.0) {
            deepFallStartRef.current = performance.now();
            deepFallDurationRef.current = 600;
        }
    }

    startState.current = { x: animState.current.x, y: animState.current.y, angle: animState.current.angle, isMoving: false, progress: 0 };
    targetState.current = { x: newTargetX, y: newTargetY, angle: newTargetAngle };
    lerpStartTime.current = performance.now();
    window.dispatchEvent(new CustomEvent('raycaster-look'));
  }, [player.pos.x, player.pos.y, player.dir, player.dir360, grid]);

  useEffect(() => {
    let lightningTimeout: any;
    let thunderTimeout: any;

    const scheduleNextLightning = () => {
      if (weather !== 'rain') return;
      const delay = lightning5s ? 5000 : (Math.floor(Math.random() * (90000 - 30000 + 1)) + 30000);
      lightningTimeout = setTimeout(() => {
        setLightningIntensity(0.8);
        setTimeout(() => setLightningIntensity(0), 100);
        setTimeout(() => {
          setLightningIntensity(0.6);
          setTimeout(() => setLightningIntensity(0), 250);
        }, 150);
        
        thunderTimeout = setTimeout(() => {
            playSoundRef.current('THUNDER');
        }, 500);
        scheduleNextLightning();
      }, delay);
    };
    if (weather === 'rain') {
        if (rainRef.current.length === 0) {
            const dirX = Math.cos((player.dir360 - 1) * (Math.PI / 2));
            const dirY = Math.sin((player.dir360 - 1) * (Math.PI / 2));
            rainRef.current = createRainParticles(player.pos.x, player.pos.y, 100, dirX, dirY, fov, outdoorMap, grids);
        }
        scheduleNextLightning();
    } else {
        returnParticlesToPool(rainRef.current);
        rainRef.current = [];
        clearRainSplashParticles();
        setLightningIntensity(0);
        if (lightningTimeout) clearTimeout(lightningTimeout);
        if (thunderTimeout) clearTimeout(thunderTimeout);
    }
    return () => { 
        if (lightningTimeout) clearTimeout(lightningTimeout);
        if (thunderTimeout) clearTimeout(thunderTimeout);
    };
  }, [weather, ceilingType, lightning5s]); 

  useEffect(() => {
      if (playerDamageSource && playerDamageSource.id !== lastProcessedPlayerDamageId.current) {
          lastProcessedPlayerDamageId.current = playerDamageSource.id;
          const currentX = animState.current.x;
          const currentY = animState.current.y;
          const currentAngle = animState.current.angle;
          const dirX = Math.cos(currentAngle);
          const dirY = Math.sin(currentAngle);
          const px = (currentX + 0.5) + dirX * 0.3;
          const py = (currentY + 0.5) + dirY * 0.3;
          const targetX = px + dirX;
          const targetY = py + dirY;
          const newParticles = createDirectionalBlood(px, py, 0.25, targetX, targetY, 40);
          particlesRef.current.push(...newParticles);
      }
  }, [playerDamageSource]); 

  const aiVisionSetRef = useRef<Set<number>>(new Set());
  useMemo(() => {
      const visionSet = new Set<number>();
      if (aiDebug && enemies && grid) {
          // ... (Keep existing logic, simplified for brevity in XML) ...
      }
      aiVisionSetRef.current = visionSet;
  }, [aiDebug, enemies, grid]);

  const c4TilesRef = useRef<{x: number, y: number, assetId: string, side?: string}[]>([]);
  const c4CellsResetRef = useRef<{x: number, y: number}[]>([]);
  const lastC4GridRef = useRef<Tile[][] | null>(null);

  useMemo(() => {
      if (!grid) {
          c4TilesRef.current = [];
          lastC4GridRef.current = null;
          return;
      }
      if (grid === lastC4GridRef.current) return;
      
      const c4s: {x: number, y: number, assetId: string, side?: string}[] = [];
      const cache = typeof window !== 'undefined' ? (window as any).explosivePositionsCache : null;
      if (cache && cache.size > 0) {
          for (const key of cache) {
              const [xStr, yStr] = key.split(',');
              const x = parseInt(xStr, 10);
              const y = parseInt(yStr, 10);
              const cell = grid[y]?.[x];
              if (cell && cell.explosive) {
                  c4s.push({ x, y, assetId: cell.explosive.assetId, side: cell.explosive.side });
              }
          }
      } else if (!cache) {
          const height = grid.length;
          for (let y = 0; y < height; y++) {
              const row = grid[y];
              if (!row) continue;
              const width = row.length;
              for (let x = 0; x < width; x++) {
                  const cell = row[x];
                  if (cell && cell.explosive) {
                      c4s.push({ x, y, assetId: cell.explosive.assetId, side: cell.explosive.side });
                  }
              }
          }
      }
      c4TilesRef.current = c4s;
      lastC4GridRef.current = grid;
  }, [grid]);

  const groundFlaresRef = useRef<{ x: number; y: number; item: any }[]>([]);
  const lastFlareGridRef = useRef<Tile[][] | null>(null);

  useMemo(() => {
      if (!grid) {
          groundFlaresRef.current = [];
          lastFlareGridRef.current = null;
          return;
      }
      if (grid === lastFlareGridRef.current) return;
      
      const flares: { x: number; y: number; item: any }[] = [];
      const height = grid.length;
      for (let y = 0; y < height; y++) {
          const row = grid[y];
          if (!row) continue;
          const width = row.length;
          for (let x = 0; x < width; x++) {
              const cell = row[x];
              if (cell && cell.items && cell.items.length > 0) {
                  for (let i = 0; i < cell.items.length; i++) {
                      const item = cell.items[i];
                      if (item && (item.type === 'FLARE' || (item as any).flareDuration !== undefined) && ((item as any).isLit === true || (item as any).placedAsThrown === true) && (item as any).flareDuration !== undefined && (item as any).flareDuration > 0) {
                          flares.push({ x, y, item });
                      }
                  }
              }
          }
      }
      groundFlaresRef.current = flares;
      lastFlareGridRef.current = grid;
  }, [grid]);

  const lightningMapRef = useRef<Float32Array | null>(null);
  const prevFlareLightsRef = useRef<any[]>([]);
  const prevGeometryHash = useRef<number | string>('');
  const lastLightningGridRef = useRef<Tile[][] | null>(null);
  const cachedDoorCoordsRef = useRef<{x: number, y: number}[]>([]);
  const staticGeometryHashRef = useRef<number>(0);
  
  useMemo(() => {
      if (!grid || weather !== 'rain') {
          lightningMapRef.current = null;
          lastLightningGridRef.current = null;
          return;
      }
      
      const height = grid.length;
      const width = grid[0]?.length || 0;
      
      let needsCacheRebuild = !lastLightningGridRef.current || 
                              lastLightningGridRef.current.length !== height || 
                              lastLightningGridRef.current[0]?.length !== width ||
                              cachedDoorCoordsRef.current.length === 0;
                              
      if (!needsCacheRebuild) {
          // Verify if cached door coordinates still hold door tiles
          for (const d of cachedDoorCoordsRef.current) {
              const t = grid[d.y]?.[d.x];
              if (!t || t.type !== 'DOOR') {
                  needsCacheRebuild = true;
                  break;
              }
          }
      }
      
      if (needsCacheRebuild) {
          const doors: {x: number, y: number}[] = [];
          let staticHash = 0;
          for (let y = 0; y < height; y++) {
              const row = grid[y];
              if (!row) continue;
              for (let x = 0; x < width; x++) {
                  const t = row[x];
                  if (!t) continue;
                  if (t.type === 'WALL') {
                      staticHash = ((staticHash << 5) - staticHash) + 1;
                      staticHash |= 0;
                  } else if (t.type === 'DOOR') {
                      doors.push({ x, y });
                      staticHash = ((staticHash << 5) - staticHash) + 0;
                      staticHash |= 0;
                  } else {
                      staticHash = ((staticHash << 5) - staticHash) + 0;
                      staticHash |= 0;
                  }
              }
          }
          cachedDoorCoordsRef.current = doors;
          staticGeometryHashRef.current = staticHash;
          lastLightningGridRef.current = grid;
      }
      
      // Compute geometry hash based on static hash + cached door states
      let currentHash = staticGeometryHashRef.current;
      for (const d of cachedDoorCoordsRef.current) {
          const t = grid[d.y]?.[d.x];
          if (t && t.type === 'DOOR') {
              const val = t.door?.state === 'OPEN' ? 2 : 3;
              currentHash = ((currentHash << 5) - currentHash) + val;
              currentHash |= 0;
          }
      }
      
      if (currentHash !== prevGeometryHash.current || !lightningMapRef.current) {
          lightningMapRef.current = computeLightningMap(grid, outdoorMap);
          prevGeometryHash.current = currentHash;
      }
  }, [grid, outdoorMap, weather]);

  const animatedLightMapRef = useRef<{r:number, g:number, b:number}[][] | undefined>();
  const animatedFloorLightMapsRef = useRef<{r:number, g:number, b:number}[][][] | undefined>();
  const lastBaseLightMapRef = useRef<{r:number, g:number, b:number}[][] | undefined>();
  const lastWeaponMainValRef = useRef<string>('');
  const lastWeaponAkimboValRef = useRef<string>('');
  
  const renderFrame = useCallback((currX: number, currY: number, currAngle: number, animProgress: number) => {
    const _frameStart = performance.now();
    const _m = { bg: 0, walls: 0, gl: 0, ent: 0, part: 0 };
    waterVisibleRef.current = false;
    const p = propsRef.current;
    const cam = p.cinematicCameraRef?.current || p.raycasterCamera;
    if (cam) {
      currX = cam.x;
      currY = cam.y;
      currAngle = cam.dir;
    }
    const s = stateRef.current;
    const { width, height, fov, sprites, hiddenEnemyIds, grid, grids, pickupAnim, throwAnim, highlightedTiles, enemyMoveAnim, boxMoveAnims, activeAttackerId, damagedEnemyIds, debugTextures, weather, enemies: propEnemies, isCombatActive, combatEnemies, animations, activeDialogueNPCId, lootAnims, roamingAnims, aiDebug, pitLineVis, customWallBuffers, customFloorBuffers, onParticleHit, onShardLanded, onParticleBounce, playerReflectionSprite, flashlightActive, flashlightBatteryRatio, deathAnimProgress: propDeathAnimProgress, shakeEvent, player, ceilingType } = p;
    const deathAnimProgress = Math.max(
      p.deathAnimProgressRef?.current ?? 0,
      p.fallAnimProgressRef?.current ?? 0,
      p.scriptedDeathProgressRef?.current ?? 0,
      propDeathAnimProgress ?? 0
    );
    const enemies = p.enemiesRef?.current || propEnemies;
    const { wallBuffer, doorBuffer, floorBuffer, ceilingBuffer, skyBuffer, auxBuffers, lightningIntensity } = s;
    const lightningMap = lightningMapRef.current;

    const currentPickupAnim = p.pickupAnimRef?.current || p.pickupAnim;
    const currentThrowAnim = p.throwAnimRef?.current || p.throwAnim;
    const currentEnemyMoveAnim = p.enemyMoveAnimRef?.current || p.enemyMoveAnim;
    const currentBoxMoveAnims = p.boxMoveAnimsRef?.current || p.boxMoveAnims || [];
    const currentRoamingAnims = p.roamingAnimsRef?.current || p.roamingAnims || [];
    const currentEnemyFlashes = p.enemyFlashesRef?.current || p.enemyFlashes || [];
    const currentExplosions = p.explosionsRef?.current || p.explosions || [];
    const currentMuzzleFlashIntensity = p.muzzleFlashIntensityRef?.current ?? p.muzzleFlashIntensity ?? 0;

    let currentFlashlightActive = flashlightActive;
    if (flashlightActive && flashlightBatteryRatio !== undefined && flashlightBatteryRatio <= 0.03) {
        const timeMs = Date.now();
        const flickerProb = 1.0 - (flashlightBatteryRatio / 0.03);
        const tick = Math.floor(timeMs / 50);
        const rand = Math.abs((Math.sin(tick * 12.9898) * 43758.5453) % 1);
        if (rand < flickerProb) {
            currentFlashlightActive = false;
        }
    }

    let currentLightMap = p.lightMap;
    let currentFloorLightMaps = p.floorLightMaps;
    
    const hasDynamicLights = p.dynamicLights && p.dynamicLights.length > 0;
    const hasC4Tiles = c4TilesRef.current.length > 0;
    const hasC4Resets = c4CellsResetRef.current.length > 0;
    const isFlyingFlare = !!(currentThrowAnim && currentThrowAnim.item && (currentThrowAnim.item.type === 'FLARE' || (currentThrowAnim.item as any).flareDuration !== undefined) && !(currentThrowAnim.item as any).isSafeDrop);
    const hasGroundFlares = groundFlaresRef.current.length > 0;
    const hasPrevFlareLights = prevFlareLightsRef.current.length > 0;
    const needsLightMapModification = !!(hasDynamicLights || hasC4Tiles || hasC4Resets || isFlyingFlare || hasGroundFlares || hasPrevFlareLights);

    // Ensure animated light map matches current light map before proceeding ONLY if modification is needed
    if (needsLightMapModification && p.lightMap) {
        if (p.lightMap !== lastBaseLightMapRef.current || !animatedLightMapRef.current) {
            animatedLightMapRef.current = copyLightMapInPlace(p.lightMap, animatedLightMapRef.current);
            lastBaseLightMapRef.current = p.lightMap;
            if (p.floorLightMaps) {
                animatedFloorLightMapsRef.current = copyFloorLightMapsInPlace(p.floorLightMaps, animatedFloorLightMapsRef.current);
            } else {
                animatedFloorLightMapsRef.current = undefined;
            }
        }
    } else if (!needsLightMapModification) {
        animatedLightMapRef.current = undefined;
        animatedFloorLightMapsRef.current = undefined;
        lastBaseLightMapRef.current = undefined;
    }
    
    if (animatedLightMapRef.current && p.lightMap) {
        const aMap = animatedLightMapRef.current;
        const afMaps = animatedFloorLightMapsRef.current;
        const time = Date.now();
        let modified = c4TilesRef.current.length > 0 || c4CellsResetRef.current.length > 0;

        // Reset previous C4 modifications first!
        const c4Resets = c4CellsResetRef.current;
        if (c4Resets.length > 0) {
            for (let i = 0; i < c4Resets.length; i++) {
                const cell = c4Resets[i];
                const baseCell = p.lightMap[cell.y]?.[cell.x];
                if (baseCell && aMap[cell.y] && aMap[cell.y][cell.x]) {
                    aMap[cell.y][cell.x].r = baseCell.r;
                    aMap[cell.y][cell.x].g = baseCell.g;
                    aMap[cell.y][cell.x].b = baseCell.b;
                }
                if (afMaps && p.floorLightMaps) {
                    for (let fl = 0; fl < afMaps.length; fl++) {
                        const fBaseCell = p.floorLightMaps[fl]?.[cell.y]?.[cell.x];
                        if (fBaseCell && afMaps[fl]?.[cell.y]?.[cell.x]) {
                            afMaps[fl][cell.y][cell.x].r = fBaseCell.r;
                            afMaps[fl][cell.y][cell.x].g = fBaseCell.g;
                            afMaps[fl][cell.y][cell.x].b = fBaseCell.b;
                        }
                    }
                }
            }
            c4Resets.length = 0; // Clear the array but retain reference
        }

        // --- COLLECT FLARE DYNAMIC LIGHTS & PARTICLES ---
        const activeFlareLights: any[] = [];
        // 1. Flying Flare
        if (currentThrowAnim && currentThrowAnim.item && (currentThrowAnim.item.type === 'FLARE' || (currentThrowAnim.item as any).flareDuration !== undefined) && !(currentThrowAnim.item as any).isSafeDrop) {
            const nowPerf = performance.now();
            const elapsed = nowPerf - currentThrowAnim.startTime;
            const t = Math.min(1.0, Math.max(0, elapsed / 450));
            const curX = lerp(player.pos.x + 0.5, currentThrowAnim.x + 0.5, t);
            const curY = lerp(player.pos.y + 0.5, currentThrowAnim.y + 0.5, t);
            const curTileX = Math.floor(curX);
            const curTileY = Math.floor(curY);
            const tile = grid?.[curTileY]?.[curTileX];
            const floorHeight = (tile && tile.height !== undefined) ? tile.height : 0.0;
            const throwZ = floorHeight + Math.sin(t * Math.PI) * 0.4 + 0.15;
            const flareSpread = getFlareLightSpread(curX, curY, {
                color: (currentThrowAnim.item as any).flareColor,
                radius: (currentThrowAnim.item as any).flareRadius,
                brightness: (currentThrowAnim.item as any).flareBrightness,
            }, grid);
            activeFlareLights.push(flareSpread);

            const smokeCol = (currentThrowAnim.item as any).smokeColor || (currentThrowAnim.item as any).flareColor || '#ff5a28';
            const smokeParticle = createFlareSmokeParticle(curX, curY, smokeCol, throwZ, floorHeight);
            particlesRef.current.push(smokeParticle);
        }

        // 2. Active Ground Flares
        if (groundFlaresRef.current.length > 0) {
            const gFlares = groundFlaresRef.current;
            for (let idx = 0; idx < gFlares.length; idx++) {
                const { x, y, item } = gFlares[idx];
                const curDur = (item as any).flareDuration ?? 15;
                const initDur = (item as any).initialFlareDuration || 15;
                const fadeFactor = Math.max(0.12, Math.min(1.0, curDur / initDur));

                const tile = grid?.[y]?.[x];
                const floorHeight = (tile && tile.height !== undefined) ? tile.height : 0.0;

                const flareSpread = getFlareLightSpread(x + 0.5, y + 0.5, {
                    color: (item as any).flareColor,
                    radius: (item as any).flareRadius,
                    brightness: ((item as any).flareBrightness ?? 2.2) * fadeFactor,
                }, grid);
                activeFlareLights.push(flareSpread);

                const smokeCol = (item as any).smokeColor || (item as any).flareColor;
                const smokeParticle = createFlareSmokeParticle(x + 0.5, y + 0.5, smokeCol, floorHeight, floorHeight);
                particlesRef.current.push(smokeParticle);
                if (Math.random() < 0.6) {
                    const smokeParticle2 = createFlareSmokeParticle(x + 0.5, y + 0.5, smokeCol, floorHeight, floorHeight);
                    particlesRef.current.push(smokeParticle2);
                }
            }
        }

        const effectiveDynamicLights = p.dynamicLights && p.dynamicLights.length > 0
            ? [...p.dynamicLights, ...activeFlareLights]
            : activeFlareLights;

        // Reset cells from previous dynamic lights to base light so expired/moving flares don't leave permanent light
        if (prevFlareLightsRef.current.length > 0) {
            modified = true;
            for (let i = 0; i < prevFlareLightsRef.current.length; i++) {
                const dl = prevFlareLightsRef.current[i];
                if (!dl || !dl.spread) continue;
                for (let j = 0; j < dl.spread.length; j++) {
                    const cell = dl.spread[j];
                    const baseCell = p.lightMap[cell.y]?.[cell.x];
                    if (baseCell && aMap[cell.y] && aMap[cell.y][cell.x]) {
                        aMap[cell.y][cell.x].r = baseCell.r;
                        aMap[cell.y][cell.x].g = baseCell.g;
                        aMap[cell.y][cell.x].b = baseCell.b;
                    }

                    if (afMaps && p.floorLightMaps) {
                        for (let fl = 0; fl < afMaps.length; fl++) {
                            const fBaseCell = p.floorLightMaps[fl]?.[cell.y]?.[cell.x];
                            if (fBaseCell && afMaps[fl]?.[cell.y]?.[cell.x]) {
                                afMaps[fl][cell.y][cell.x].r = fBaseCell.r;
                                afMaps[fl][cell.y][cell.x].g = fBaseCell.g;
                                afMaps[fl][cell.y][cell.x].b = fBaseCell.b;
                            }
                        }
                    }
                }
            }
        }
        prevFlareLightsRef.current = effectiveDynamicLights;

        if (effectiveDynamicLights.length > 0) {
            modified = true;
            // 1. Reset current affected cells to base light
            for (let i = 0; i < effectiveDynamicLights.length; i++) {
                const dl = effectiveDynamicLights[i];
                for (let j = 0; j < dl.spread.length; j++) {
                    const cell = dl.spread[j];
                    const baseCell = p.lightMap[cell.y]?.[cell.x];
                    if (baseCell && aMap[cell.y] && aMap[cell.y][cell.x]) {
                        aMap[cell.y][cell.x].r = baseCell.r;
                        aMap[cell.y][cell.x].g = baseCell.g;
                        aMap[cell.y][cell.x].b = baseCell.b;
                    }

                    if (afMaps && p.floorLightMaps) {
                        for (let fl = 0; fl < afMaps.length; fl++) {
                            const fBaseCell = p.floorLightMaps[fl]?.[cell.y]?.[cell.x];
                            if (fBaseCell && afMaps[fl]?.[cell.y]?.[cell.x]) {
                                afMaps[fl][cell.y][cell.x].r = fBaseCell.r;
                                afMaps[fl][cell.y][cell.x].g = fBaseCell.g;
                                afMaps[fl][cell.y][cell.x].b = fBaseCell.b;
                            }
                        }
                    }
                }
            }
            
            // 2. Add dynamic light
            for (let i = 0; i < effectiveDynamicLights.length; i++) {
                const dl = effectiveDynamicLights[i];
                let multiplier = 1.0;
                if (dl.mode === 'FLICKERING') {
                    const alwaysOn = dl.flickerAlwaysOn ?? true;
                    if (dl.flickerPeriod !== undefined && dl.flickerPeriod !== 0 && dl.flickerPeriod !== '0' && dl.flickerPeriod !== '') {
                        // Parse periodicity
                        let minPeriod = 0;
                        let maxPeriod = 0;
                        const fp = dl.flickerPeriod;
                        if (typeof fp === 'number') {
                            minPeriod = fp;
                            maxPeriod = fp;
                        } else {
                            const parts = String(fp).split('-');
                            if (parts.length === 2) {
                                minPeriod = parseInt(parts[0], 10) || 0;
                                maxPeriod = parseInt(parts[1], 10) || 0;
                            } else {
                                const val = parseInt(fp, 10);
                                minPeriod = val || 0;
                                maxPeriod = val || 0;
                            }
                        }

                        if (minPeriod > 0 && maxPeriod > 0) {
                            const key = (dl.x !== undefined && dl.y !== undefined) ? `${dl.x},${dl.y}` : `idx:${i}`;
                            let state = flickerStatesRef.current.get(key);
                            if (!state) {
                                const duration = minPeriod === maxPeriod ? minPeriod : Math.floor(minPeriod + Math.random() * (maxPeriod - minPeriod));
                                state = {
                                    cycleStartTime: time,
                                    cycleDuration: duration
                                };
                                flickerStatesRef.current.set(key, state);
                            }

                            if (time >= state.cycleStartTime + state.cycleDuration) {
                                // Start new cycle!
                                const duration = minPeriod === maxPeriod ? minPeriod : Math.floor(minPeriod + Math.random() * (maxPeriod - minPeriod));
                                state.cycleStartTime = time;
                                state.cycleDuration = duration;
                            }

                            const t = time - state.cycleStartTime;
                            const showMiddleDip = state.cycleDuration > 1000;
                            const middleDipStart = state.cycleDuration * 0.3;
                            const middleDipEnd = middleDipStart + 100;
                            
                            const isDim = (t > state.cycleDuration - 200) || (showMiddleDip && t > middleDipStart && t < middleDipEnd);
                            multiplier = alwaysOn ? (isDim ? 0.2 : 1.0) : (isDim ? 1.0 : 0.0);
                        } else {
                            // Default random-like flicker
                            const t = (time + i * 800) % 2000;
                            const isDim = (t > 1800 || (t > 500 && t < 600));
                            multiplier = alwaysOn ? (isDim ? 0.2 : 1.0) : (isDim ? 1.0 : 0.0);
                        }
                    } else {
                        // Default random-like flicker
                        const t = (time + i * 800) % 2000;
                        const isDim = (t > 1800 || (t > 500 && t < 600));
                        multiplier = alwaysOn ? (isDim ? 0.2 : 1.0) : (isDim ? 1.0 : 0.0);
                    }
                } else if (dl.mode === 'FIRE') {
                    multiplier = 0.75 + 0.25 * Math.sin(time / 150 + i * 3) + 0.1 * Math.sin(time / 70 + i * 5);
                }
                for (let j = 0; j < dl.spread.length; j++) {
                    const cell = dl.spread[j];
                    if (aMap[cell.y] && aMap[cell.y][cell.x]) {
                        aMap[cell.y][cell.x].r = Math.min(1.0, aMap[cell.y][cell.x].r + cell.r * multiplier);
                        aMap[cell.y][cell.x].g = Math.min(1.0, aMap[cell.y][cell.x].g + cell.g * multiplier);
                        aMap[cell.y][cell.x].b = Math.min(1.0, aMap[cell.y][cell.x].b + cell.b * multiplier);
                    }

                    if (afMaps && p.floorLightMaps) {
                        for (let fl = 0; fl < afMaps.length; fl++) {
                            if (!dl.maxHeight || dl.maxHeight === 0 || fl < dl.maxHeight) {
                                if (afMaps[fl]?.[cell.y]?.[cell.x]) {
                                    afMaps[fl][cell.y][cell.x].r = Math.min(1.0, afMaps[fl][cell.y][cell.x].r + cell.r * multiplier);
                                    afMaps[fl][cell.y][cell.x].g = Math.min(1.0, afMaps[fl][cell.y][cell.x].g + cell.g * multiplier);
                                    afMaps[fl][cell.y][cell.x].b = Math.min(1.0, afMaps[fl][cell.y][cell.x].b + cell.b * multiplier);
                                }
                            }
                        }
                    }
                }
            }
        }

        if (modified) {
            currentLightMap = aMap;
            if (afMaps) {
                currentFloorLightMaps = afMaps;
            }
        }
    }
    
    // Fast weapon UI tint update (synchronous with frame)
    const px = Math.floor(player.pos.x);
    const py = Math.floor(player.pos.y);
    const playerLight = currentLightMap?.[py]?.[px];
    if (playerLight) {
        let tintMinL = 0;
        if (currentFlashlightActive) {
            let quality = 1.0;
            if (p.flashlightBatteryRatio !== undefined && p.flashlightBatteryRatio <= 0.5) {
                const factor = Math.max(0, p.flashlightBatteryRatio - 0.47) / 0.03;
                quality = factor * 0.5 + 0.5;
            }
            tintMinL = 0.08 * quality;
        }
        const minL = tintMinL;
        const plrR = Math.max(minL, playerLight.r);
        const plrG = Math.max(minL, playerLight.g);
        const plrB = Math.max(minL, playerLight.b);
        const muzzle = currentMuzzleFlashIntensity || 0;
        const tintOpacity = Math.max(0, 1 - muzzle * 2);
        const rColor = plrR * tintOpacity + 1.0 * (1 - tintOpacity);
        const gColor = plrG * tintOpacity + 1.0 * (1 - tintOpacity);
        const bColor = plrB * tintOpacity + 1.0 * (1 - tintOpacity);
        
        let mainNode = weaponTintMainRef.current;
        if (!mainNode) {
            mainNode = document.getElementById('weapon-tint-main-matrix');
            if (mainNode) weaponTintMainRef.current = mainNode;
        }
        if (mainNode) {
            const isBroken = player.equipment?.weapon?.durability === 0;
            const mult = isBroken ? 0.6 : 1.0;
            const val = `${rColor * mult} 0 0 0 0  0 ${gColor * mult} 0 0 0  0 0 ${bColor * mult} 0 0  0 0 0 1 0`;
            if (val !== lastWeaponMainValRef.current) {
                mainNode.setAttribute('values', val);
                lastWeaponMainValRef.current = val;
            }
        }
        let akimboNode = weaponTintAkimboRef.current;
        if (!akimboNode) {
            akimboNode = document.getElementById('weapon-tint-akimbo-matrix');
            if (akimboNode) weaponTintAkimboRef.current = akimboNode;
        }
        if (akimboNode) {
            const isBroken = player.equipment?.weaponAkimbo?.durability === 0;
            const mult = isBroken ? 0.6 : 1.0;
            const val = `${rColor * mult} 0 0 0 0  0 ${gColor * mult} 0 0 0  0 0 ${bColor * mult} 0 0  0 0 0 1 0`;
            if (val !== lastWeaponAkimboValRef.current) {
                akimboNode.setAttribute('values', val);
                lastWeaponAkimboValRef.current = val;
            }
        }
    }

    const aiVisionSet = aiVisionSetRef.current;

    // Apply the render distance to the fog globally before this frame
    const originalDist = p.renderDistance || 15;
    const finalDist = (p.weather === 'fog' && p.fogDistance) ? p.fogDistance : originalDist;
    
    // Dynamic shading distance based on currently visible geometry (except under fog weather)
    let shadingDist = finalDist;
    if (p.weather !== 'fog' && wallZBufferRef.current) {
        let maxSeenDistance = 0;
        const zBuf = wallZBufferRef.current;
        const len = zBuf.length;
        // Запрос каждого 8-го элемента обеспечивает великолепную производительность
        for (let i = 0; i < len; i += 8) {
            const dist = zBuf[i];
            if (dist > 0 && dist < 900) {
                if (dist > maxSeenDistance) {
                    maxSeenDistance = dist;
                }
            }
        }
        if (maxSeenDistance > 0) {
            // Мягкий комфортный запас в 30% к дальности максимальной видимой стены
            const targetDist = maxSeenDistance * 1.30;
            // Лимит затухания не зажат ползунком настроек, а позволяет видеть минимум до 25.0,
            // либо до выбранного пользователем значения, если оно больше
            const maxLimit = Math.max(originalDist, 25.0);
            
            // Минимальная дистанция затухания 12.0 метров, что гарантирует широкий красивый диапазон от 5.0 (fogStart) до 12.0+
            const calculatedDist = Math.max(12.0, Math.min(maxLimit, targetDist));

            lastShadingDistRef.current = calculatedDist;
            shadingDist = calculatedDist;
        }
    }

    // Calculate overall average brightness of the current level/sector around the player (3x3 grid for smoothness)
    let currentAmbient = 0.0;
    if (p.lightMap && p.player) {
        const px = Math.floor(p.player.pos.x);
        const py = Math.floor(p.player.pos.y);
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            const ny = py + dy;
            if (ny >= 0 && ny < p.lightMap.length) {
                const row = p.lightMap[ny];
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = px + dx;
                    if (nx >= 0 && nx < row.length) {
                        const cell = row[nx];
                        if (cell) {
                            const tile = grid?.[ny]?.[nx];
                            const isWallOrClosedDoor = tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken));
                            if (!isWallOrClosedDoor) {
                                sum += (cell.r + cell.g + cell.b) / 3;
                                count++;
                            }
                        }
                    }
                }
            }
        }
        if (count > 0) {
            currentAmbient = sum / count;
        } else {
            // Fallback: use only the center cell's light level
            const centerCell = p.lightMap[py]?.[px];
            if (centerCell) {
                currentAmbient = (centerCell.r + centerCell.g + centerCell.b) / 3;
            } else {
                currentAmbient = 0.1;
            }
        }
    } else {
        currentAmbient = 1.0; // Fallback to full brightness if lightMap is not initialized
    }
    setDisableDistanceShading(!!settings?.debug?.disableDistanceShading);
    setDepthAmbientBrightness(currentAmbient);

    setDepthRenderDistance(shadingDist, originalDist);
    setGlobalRenderDistance(shadingDist);
    setDepthWeather(p.weather || 'none', p.fogColor);

    const canvas = canvasRef.current;
    // Check required buffers
    if (!canvas || !screenBufferRef.current || !screenDataRef.current || !wallZBufferRef.current || !wallPassDoorsRef.current || !wallPassWallsRef.current || !rowDistancesRef.current) return;
    
    // Determine Render Context & Resolution
    let renderWidth = width;
    let renderHeight = height;
    let currentScreenData = screenDataRef.current;
    let currentImageData = screenBufferRef.current;
    let ctx = canvas.getContext('2d', { alpha: false });
    
    if (!ctx) return;

    if (ctx.imageSmoothingEnabled !== !!viewportSmoothing) {
        ctx.imageSmoothingEnabled = !!viewportSmoothing;
    }

    // Initialize or verify WebGL Renderer
    if (forceSoftRenderer) {
        setWebGLActive(false);
    } else if (!webglCanvasRef.current) {
        const can = document.createElement('canvas');
        can.width = renderWidth;
        can.height = renderHeight;
        webglCanvasRef.current = can;
        try {
            const r = new WebGLRenderer(can);
            if (r.isSupported()) {
                r.setTextureFiltering(!!viewportSmoothing || !!textureFiltering);
                webglRendererRef.current = r;
                setWebGLActive(true);
            } else {
                setWebGLActive(false);
            }
        } catch (e) {
            console.error("WebGL initialization failed, falling back to soft renderer", e);
            setWebGLActive(false);
        }
    } else {
        const can = webglCanvasRef.current;
        if (can.width !== renderWidth || can.height !== renderHeight) {
            can.width = renderWidth;
            can.height = renderHeight;
        }
        if (webglRendererRef.current && webglRendererRef.current.isSupported()) {
            webglRendererRef.current.setTextureFiltering(!!viewportSmoothing || !!textureFiltering);
            setWebGLActive(true);
        } else {
            setWebGLActive(false);
        }
    }

    if (isWebGLActive) {
        clearQuads();
        currentScreenData.fill(0);
    }

    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;
    let shakeTilt = 0;
    let shakeAngle = 0;
    
    const currentShake = shakeEvent?.current;
    if (currentShake) {
        const now = performance.now();
        if (now < currentShake.startTime + currentShake.duration) {
            // Duke 3D style: Linear decay, fast jerky movements, mostly positional
            const progress = (now - currentShake.startTime) / currentShake.duration;
            const decay = 1 - progress; 
            const currentIntensity = currentShake.intensity * decay;
            
            // High frequency, lower amplitude. Mostly X/Y/Z shifting, very little tilt/roll
            shakeX = Math.sin(now * 0.08) * currentIntensity * 0.15;
            shakeY = Math.cos(now * 0.07) * currentIntensity * 0.15;
            shakeZ = Math.sin(now * 0.1) * currentIntensity * 0.1; // Fast vertical bounce
            shakeTilt = Math.sin(now * 0.05) * currentIntensity * (renderHeight * 0.05); // Slight pitch shift
            shakeAngle = Math.cos(now * 0.06) * currentIntensity * 0.01; // Almost no roll
        }
    }

    const isMoving = Math.abs(currX - startState.current.x) > 0.01 || Math.abs(currY - startState.current.y) > 0.01;
    
    // --- LADDER CLIMB ANIMATION DETECTION & GENERATION ---
    const startTx = Math.round(startState.current.x);
    const startTy = Math.round(startState.current.y);
    const targetTx = Math.round(targetState.current.x);
    const targetTy = Math.round(targetState.current.y);
    const isStepMoving = (startTx !== targetTx || startTy !== targetTy) && animProgress < 1.0;

    let isLadderClimb = false;
    let ladderSwayAngle = 0;
    let ladderSwayTilt = 0;

    if (isStepMoving) {
        const startTile = (startTy >= 0 && startTy < grid.length && startTx >= 0 && startTx < grid[startTy].length) ? grid[startTy][startTx] : null;
        const startFloorH = getEffectiveTileHeight(startTile);
        const targetTile = (targetTy >= 0 && targetTy < grid.length && targetTx >= 0 && targetTx < grid[targetTy].length) ? grid[targetTy][targetTx] : null;
        const targetFloorH = getEffectiveTileHeight(targetTile);
        const heightDiff = targetFloorH - startFloorH;
        
        const hasLadder = startTile?.decoration?.type === 'LADDER' || startTile?.pitDecoration?.type === 'LADDER';
        if (heightDiff > 0.15 && hasLadder) {
            isLadderClimb = true;
            const rungSpacing = 0.3;
            const numRungs = Math.max(1, Math.round(heightDiff / rungSpacing));
            
            // Качание в стороны: синусоидальное раскачивание угла (yaw) и наклона (pitch/tilt) в фазе подъема, затухающее при выходе
            const climbPhase = animProgress / 0.85;
            const exitFade = 1.0 - Math.max(0, (animProgress - 0.85) / 0.15); // Затухание качания на целевом полу
            const rungProgress = climbPhase * numRungs;
            
            ladderSwayAngle = 0.04 * Math.sin(rungProgress * Math.PI) * exitFade;
            ladderSwayTilt = 8 * Math.cos(rungProgress * 2 * Math.PI) * exitFade;
        }
    }

    // --- BOBBING (Highly optimized, calculated once per frame) ---
    const stepPhase = animProgress * Math.PI;
    const bobSin = (isMoving && !p.raycasterCamera) ? Math.sin(stepPhase) : 0;
    // Золотая середина: 0.012 (было 0.025 - слишком сильно)
    const zBob = bobSin * 0.012; 
    // Наклон головы часто вызывает тошноту, уменьшаем его сильно: 0.003 (было 0.008)
    const angleSway = isMoving ? (Math.sin(stepPhase * 2) * 0.003 + ladderSwayAngle) : 0; 
    // Сдвиг горизонта оставляем мягким: 1.5 (было 3 - резко)
    const bob = bobSin * 1.5 + ladderSwayTilt; 
    // -------------------------------------------------------------

    const currentLookAroundAngle = p.lookAroundAngleRef?.current || 0;
    const finalAngle = currAngle + shakeAngle + angleSway + currentLookAroundAngle;
    const dirX = Math.cos(finalAngle);
    const dirY = Math.sin(finalAngle);
    // Death animation: Fall backward and tilt up
    // Fall happens in the first 20% of the 4-second animation (0.8 seconds)
    const cameraFallProgress = Math.min(1, deathAnimProgress * 5);
    // Easing for the fall (accelerates)
    const fallEase = cameraFallProgress * cameraFallProgress;

    // Look up happens AFTER the fall, from 20% to 50% (0.8s to 2.0s)
    let lookUpProgress = 0;
    if (deathAnimProgress > 0.2) {
        lookUpProgress = Math.min(1, (deathAnimProgress - 0.2) / 0.3);
    }
    const lookUpEase = lookUpProgress * lookUpProgress;
    
    // Move slightly backward as we fall
    const fallBackwardDist = fallEase * 0.3; // Move up to 0.3 tiles backward
    const posX = currX + 0.5 - (dirX * fallBackwardDist) + shakeX;
    const posY = currY + 0.5 - (dirY * fallBackwardDist) + shakeY;
    
    // Zoom out slightly
    let currentFov = fov + (fallEase * 0.2);

    const playerTileX = Math.floor(currX + 0.5);
    const playerTileY = Math.floor(currY + 0.5);
    const playerTile = (playerTileY >= 0 && playerTileY < grid.length && playerTileX >= 0 && playerTileX < grid[playerTileY].length) ? grid[playerTileY][playerTileX] : null;

    const playerFloorHeight = getEffectiveTileHeight(playerTile);

    // --- SMOOTH CAMERA HEIGHT INTERPOLATION (ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ВЫСОТЫ КАМЕРЫ) ---
    const now = performance.now();
    const dt = lastCameraRenderTimeRef.current ? Math.min(0.1, (now - lastCameraRenderTimeRef.current) / 1000) : 0.016;
    lastCameraRenderTimeRef.current = now;

    if (p.raycasterCamera && p.raycasterCamera.floor !== undefined) {
        lastFloorHeightRef.current = p.raycasterCamera.floor;
        floorHeightVelocityRef.current = 0;
    } else if (lastFloorHeightRef.current === null) {
        lastFloorHeightRef.current = playerFloorHeight;
        floorHeightVelocityRef.current = 0;
    } else if (isStepMoving) {
        // Находим реальную высоту начального и конечного тайлов
        // Get real floors of source and destination tiles
        const startTile = (startTy >= 0 && startTy < grid.length && startTx >= 0 && startTx < grid[startTy].length) ? grid[startTy][startTx] : null;
        const startFloorH = getEffectiveTileHeight(startTile);

        const targetTile = (targetTy >= 0 && targetTy < grid.length && targetTx >= 0 && targetTx < grid[targetTy].length) ? grid[targetTy][targetTx] : null;
        const targetFloorH = getEffectiveTileHeight(targetTile);

        // Вычисляем разницу высот для выбора правильного физического профиля движения
        // Calculate height difference to select a biologically correct physical movement profile
        const heightDiff = targetFloorH - startFloorH;
        let easeT = 0;

        const hasLadder = startTile?.decoration?.type === 'LADDER' || startTile?.pitDecoration?.type === 'LADDER';

        if (heightDiff > 0.15 && hasLadder) {
            easeT = getLadderClimbCurve(animProgress, heightDiff);
        } else if (heightDiff < -0.15) {
            // Реальное падение в яму / с обрыва (высота уменьшилась существенно)
            easeT = getFallCurve(animProgress);
        } else if (heightDiff > 0.15) {
            // Тяжелое вскарабкивание на высокий уступ / плиту
            easeT = getClimbCurve(animProgress);
        } else {
            // Стандартное плавное перемещение на ровной поверхности или микро-неровностях
            easeT = easeInOutQuad(animProgress);
        }

        lastFloorHeightRef.current = lerp(startFloorH, targetFloorH, easeT);
        floorHeightVelocityRef.current = 0;
    } else {
        // Сбалансированная физическая система пружина-амортизатор (spring-damper system) при простое или повороте
        // Balanced physical spring-damper system when stationary or rotating
        const diffF = playerFloorHeight - lastFloorHeightRef.current;
        // Порог срабатывания амортизатора изменен на 0.002 и 0.02 для полного исключения автоколебаний и дрожания
        if (Math.abs(diffF) > 0.002 || Math.abs(floorHeightVelocityRef.current) > 0.02) {
            // Интегрирование полунеявным методом Эйлера для 100% стабильности при любом FPS
            const subSteps = 3;
            const subDt = dt / subSteps;
            
            for (let i = 0; i < subSteps; i++) {
                const currentDiff = playerFloorHeight - lastFloorHeightRef.current;
                const absDiff = Math.abs(currentDiff);
                
                // Коэффициент жесткости жестко завязан на высоту перепада:
                // чем больше разница по высоте, тем быстрее и динамичнее происходит падение или вскарабкивание
                const k = 150.0 * (1.0 + Math.min(3.0, absDiff) * 5.0);
                
                // Депфирование амортизатора: при больших падениях чуть ослабляем (0.75), 
                // чтобы возник приятный микро-отскок (settlement bounce) и отдача от падения!
                const dampingRatio = absDiff > 0.2 ? 0.75 : 0.95;
                const c = 2.0 * dampingRatio * Math.sqrt(k);
                
                const acc = k * currentDiff - c * floorHeightVelocityRef.current;
                floorHeightVelocityRef.current += acc * subDt;
                lastFloorHeightRef.current += floorHeightVelocityRef.current * subDt;
            }
        } else {
            lastFloorHeightRef.current = playerFloorHeight;
            floorHeightVelocityRef.current = 0;
        }
    }

    let impactPitchOffset = 0;
    let impactZOffset = 0;
    if (deepFallStartRef.current !== null) {
        const elapsedFall = performance.now() - deepFallStartRef.current;
        const totalDur = deepFallDurationRef.current;
        if (elapsedFall < totalDur) {
            const pVal = elapsedFall / totalDur; // 0 to 1
            if (pVal < 0.25) {
                // Air phase: slight forward float and preparation
                impactPitchOffset = 0.02 * Math.sin((pVal / 0.25) * Math.PI);
                impactZOffset = 0.03 * Math.sin((pVal / 0.25) * Math.PI);
            } else if (pVal < 0.50) {
                // Heavy crash: rapid compression downwards and pitch forward
                const tImpact = (pVal - 0.25) / 0.25; // 0 to 1
                const sinT = Math.sin(tImpact * (Math.PI / 2));
                impactZOffset = -0.25 * sinT; // Body compresses down even more
                impactPitchOffset = -1.65 * sinT; // Head nods down heavily to gaze almost straight down
            } else {
                // Spring bounce recovery: knees straighten, head looks back up
                const tRecover = (pVal - 0.50) / 0.50; // 0 to 1
                const dSpring = Math.sin(tRecover * Math.PI * 1.5) * Math.exp(-tRecover * 3.5);
                impactZOffset = -0.25 * (1 - tRecover) + 0.05 * dSpring;
                impactPitchOffset = -1.65 * (1 - tRecover) + 0.25 * dSpring;
            }
        } else {
            deepFallStartRef.current = null;
        }
    }

    const targetBaseZ = 0.5 - (fallEase * 0.45) + lastFloorHeightRef.current;
    
    // Базовая позиция по высоте мгновенно подхватывает физические изменения пола,
    // за счет чего прыжки/падения и амортизация ощущаются безупречно
    lastBaseZRef.current = targetBaseZ;

    const cameraZ = lastBaseZRef.current + shakeZ + zBob + impactZOffset;
    const activeFloorHeight = lastFloorHeightRef.current;

    // Цикл рендеринга продолжается до тех пор, пока высота и скорость полностью не стабилизируются или идет движение шага
    // Rendering continues until height settles, velocity decreases, or step transition completes
    isHeightInterpolatingRef.current = isStepMoving ||
        Math.abs(playerFloorHeight - lastFloorHeightRef.current) > 0.002 || 
        Math.abs(floorHeightVelocityRef.current) > 0.02 ||
        deepFallStartRef.current !== null;
    // ---------------------------------------------------------------------------------

    const planeX = -dirY * currentFov;
    const planeY = dirX * currentFov;
    
    // Tilt head up AFTER falling (horizon moves down), and add look around pitch
    const currentLookAroundPitch = p.lookAroundPitchRef?.current || 0;
    const pitchVal = (p.raycasterCamera?.pitch !== undefined ? p.raycasterCamera.pitch : currentLookAroundPitch) + impactPitchOffset;
    const tilt = lookUpEase * (renderHeight * 0.4) + shakeTilt + pitchVal * (renderHeight * 0.5); 
    const horizon = (renderHeight / 2) + bob + tilt;

    // Pre-calculate row distances to avoid division in inner loops (Mirror optimization)
    if (rowDistancesRef.current) {
        const rd = rowDistancesRef.current;
        for (let y = 0; y < renderHeight; y++) {
            const dy = y - horizon;
            if (dy > 0.1) {
                // Floor (Using activeFloorHeight instead of instantaneous playerFloorHeight to avoid warping)
                rd[y] = ((cameraZ - activeFloorHeight) * renderHeight) / dy;
            } else if (dy < -0.1) {
                // Ceiling
                rd[y] = ((1 - cameraZ) * renderHeight) / -dy;
            } else {
                rd[y] = 999999;
            }
        }
    }

    const activeFlashes: { x: number, y: number, intensity: number, isFlashbang?: boolean }[] = [];
    for (let i = 0; i < currentEnemyFlashes.length; i++) {
        const f = currentEnemyFlashes[i];
        const elapsed = performance.now() - f.startTime;
        const duration = f.duration || 200;
        const baseIntensity = f.intensity !== undefined ? f.intensity : 1.0;
        const intensity = Math.max(0, baseIntensity * (1 - (elapsed / duration)));
        if (intensity > 0) {
            activeFlashes.push({ x: f.x + 0.5, y: f.y + 0.5, intensity, isFlashbang: f.isFlashbang });
        }
    }

    // OPTIMIZATION: Prevent CPU overload on very wide viewports
    // If the viewport is wider than 400 pixels, we automatically scale up the resolution divisor
    // to keep the number of rays cast manageable.
    const maxRays = 400;
    let effectiveResolutionDivisor = p.resolutionDivisor || 1;
    if (width / effectiveResolutionDivisor > maxRays) {
        effectiveResolutionDivisor = Math.ceil(width / maxRays);
    }

    const c4Tiles = c4TilesRef.current;
    if (c4Tiles.length > 0 && currentLightMap && animations) {
        let hasArmedC4 = false;
        const armedC4s: {x: number, y: number, side?: string}[] = [];
        const now = performance.now();
        for (const c4 of c4Tiles) {
            const seed = (Math.floor(c4.x) * 73856093) ^ (Math.floor(c4.y) * 19349663);
            const frameId = getCurrentAnimationFrame(c4.assetId, animations, now, 0, seed);
            if (frameId === 'C4_WALL_ARMED') {
                armedC4s.push(c4);
                hasArmedC4 = true;
            }
        }
        
        if (hasArmedC4) {
            for (const c4 of armedC4s) {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const ny = c4.y + dy;
                        const nx = c4.x + dx;
                        
                        if (c4.side === 'N' && ny >= c4.y) continue;
                        if (c4.side === 'S' && ny <= c4.y) continue;
                        if (c4.side === 'W' && nx >= c4.x) continue;
                        if (c4.side === 'E' && nx <= c4.x) continue;

                        if (ny >= 0 && ny < currentLightMap.length && nx >= 0 && currentLightMap[ny] && nx < currentLightMap[ny].length) {
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            if (dist <= 2) {
                                c4CellsResetRef.current.push({ y: ny, x: nx });
                                const intensity = 1.0 - (dist / 2);
                                const blinkRed = intensity * 0.8;
                                currentLightMap[ny][nx].r = Math.min(1.0, currentLightMap[ny][nx].r + blinkRed);
                                currentLightMap[ny][nx].g = currentLightMap[ny][nx].g * (1 - blinkRed * 0.8);
                                currentLightMap[ny][nx].b = currentLightMap[ny][nx].b * (1 - blinkRed * 0.8);

                                if (currentFloorLightMaps) {
                                    for (let fl = 0; fl < currentFloorLightMaps.length; fl++) {
                                        const flCell = currentFloorLightMaps[fl]?.[ny]?.[nx];
                                        if (flCell) {
                                            flCell.r = Math.min(1.0, flCell.r + blinkRed);
                                            flCell.g = flCell.g * (1 - blinkRed * 0.8);
                                            flCell.b = flCell.b * (1 - blinkRed * 0.8);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. RENDER BACKGROUND & FLOOR (Writes to currentScreenData - only needed for CPU software renderer)
    let _st = performance.now();
    if (!isWebGLActive) {
        renderBackground({
            width: renderWidth, height: renderHeight, fov: currentFov, posX, posY, dirX, dirY, planeX, planeY, horizon, cameraZ,
            playerFloorHeight: activeFloorHeight,
            ceilingType: ceilingType as 'INDOOR' | 'OUTDOOR', 
            lightningIntensity, muzzleFlashIntensity: currentMuzzleFlashIntensity, 
            skyBuffer, floorBuffer, ceilingBuffer, lightMap: currentLightMap, outdoorMap: p.outdoorMap, lightningMap, debugTextures, highlightedTiles,
            activeFlashes, grid, grids, aiVisionSet, customFloorBuffers, 
            screenBuffer: currentScreenData,
            reusableHighlightSet: highlightSetRef.current,
            auxBuffers, // Pass auxiliary buffers for custom floor textures
            resolutionDivisor: effectiveResolutionDivisor,
            flashlightActive: currentFlashlightActive,
            flashlightBatteryRatio: p.flashlightBatteryRatio,
            renderDistance: shadingDist,
            onWaterVisible: () => { waterVisibleRef.current = true; }
        });
    }
    {
      const _d = performance.now() - _st;
      stageAccRef.current.bg += _d;
      _m.bg += _d;
    }

    // 2. COLLECT POLYOBJECTS (BEFORE WALLS & MIRRORS)
    const polyObjectsList = collectPolyObjectsFromGrid(grid, posX, posY, shadingDist, currentLightMap, p.highlightedEntityId, p.onParticleBounce);

    // 3. RENDER WALLS & MIRRORS (Writes to currentScreenData)
    // Pass reusable buffers
    _st = performance.now();
    renderWalls({
        width: renderWidth, height: renderHeight, grid, grids, posX, posY, dirX, dirY, planeX, planeY, horizon,
        wallBuffer, doorBuffer, lightMap: currentLightMap, floorLightMaps: currentFloorLightMaps, outdoorMap: p.outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity: currentMuzzleFlashIntensity, debugTextures,
        activeFlashes, spriteMap: sprites!, animations, customWallBuffers,
        screenBuffer: currentScreenData,
        auxBuffers, 
        zBuffer: wallZBufferRef.current!,
        solidWallTopBuffer: wallSolidWallTopBufferRef.current!,
        passThroughDoors: wallPassDoorsRef.current!,
        passThroughWalls: wallPassWallsRef.current!,
        mirrorReflections: mirrorReflectionsRef.current!,
        ceilingType: ceilingType as 'INDOOR' | 'OUTDOOR',
        skyBuffer,
        floorBuffer,
        ceilingBuffer,
        fov: currentFov,
        cameraZ,
        customFloorBuffers,
        rowDistances: rowDistancesRef.current!,
        resolutionDivisor: effectiveResolutionDivisor,
        flashlightActive: currentFlashlightActive,
        flashlightBatteryRatio: p.flashlightBatteryRatio,
        renderDistance: shadingDist,
        reusableHighlightSet: highlightSetRef.current,
        polyObjectsList
    });
    {
      const _d = performance.now() - _st;
      stageAccRef.current.walls += _d;
      _m.walls += _d;
    }

    // 4. GENERATE REFLECTED POLYOBJECTS (FOR MIRROR INTERIORS)
    const reflectedPolyObjects = generateReflectedPolyObjects(
        polyObjectsList,
        mirrorReflectionsRef.current!,
        renderWidth,
        posX,
        posY,
        shadingDist
    );
    const allPolyObjectsList = reflectedPolyObjects.length > 0 
        ? [...polyObjectsList, ...reflectedPolyObjects]
        : polyObjectsList;

    _st = performance.now();
    if (isWebGLActive && webglRendererRef.current) {
        webglRendererRef.current.render(
            renderWidth,
            renderHeight,
            posX,
            posY,
            dirX,
            dirY,
            planeX,
            planeY,
            cameraZ,
            horizon,
            ceilingType as 'INDOOR' | 'OUTDOOR',
            shadingDist,
            s.lightningIntensity,
            currentMuzzleFlashIntensity,
            floorBuffer,
            ceilingBuffer,
            skyBuffer,
            wallQuadsCollector,
            auxBuffers,
            grid,
            currentLightMap,
            highlightedTiles,
            wallBuffer,
            doorBuffer,
            currentFov,
            customFloorBuffers,
            customWallBuffers,
            () => { waterVisibleRef.current = true; },
            mirrorReflectionsRef.current!,
            lightningMap,
            p.outdoorMap,
            (c4Tiles.length > 0 || (p.dynamicLights && p.dynamicLights.length > 0)),
            activeFlashes,
            currentFlashlightActive,
            flashlightBatteryRatio,
            grids,
            allPolyObjectsList,
            wallZBufferRef.current as any,
            currentFloorLightMaps,
            debugTextures
        );
        ctx.drawImage(webglCanvasRef.current!, 0, 0);
        {
          const _d = performance.now() - _st;
          stageAccRef.current.gl += _d;
          _m.gl += _d;
        }

        // Render any CPU elements like custom passthrough walls/doors if they exist in this frame
        const hasCpuElements = (wallPassDoorsRef.current && wallPassDoorsRef.current.some(arr => arr.length > 0)) || 
                               (wallPassWallsRef.current && wallPassWallsRef.current.some(arr => arr.length > 0));
        if (hasCpuElements) {
            if (!tempCpuCanvasRef.current) {
                tempCpuCanvasRef.current = document.createElement('canvas');
            }
            const tc = tempCpuCanvasRef.current;
            if (tc.width !== renderWidth || tc.height !== renderHeight) {
                tc.width = renderWidth;
                tc.height = renderHeight;
            }
            const tctx = tc.getContext('2d');
            if (tctx) {
                tctx.clearRect(0, 0, renderWidth, renderHeight);
                tctx.putImageData(currentImageData, 0, 0);
                ctx.drawImage(tc, 0, 0);
            }
        }
    } else {
        ctx.putImageData(currentImageData, 0, 0);
    }

    let maskCanvas: HTMLCanvasElement | null = null;
    let maskCtx: CanvasRenderingContext2D | null = null;
    const needsMask = currentMuzzleFlashIntensity > 0 || damagedEnemyIds.length > 0 || particlesRef.current.some(p => p.type === 'BLOOD');
    if (currentFlashlightActive && needsMask) {
        if (!maskCanvasRef.current || maskCanvasRef.current.width !== renderWidth || maskCanvasRef.current.height !== renderHeight) {
            const mCanvas = document.createElement('canvas');
            mCanvas.width = renderWidth;
            mCanvas.height = renderHeight;
            maskCanvasRef.current = mCanvas;
        }
        maskCanvas = maskCanvasRef.current;
        maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.clearRect(0, 0, renderWidth, renderHeight);
        }
    }

    // 3.5 UPDATE AND PROCESS PARTICLES (Calculates dist, x, y for sorting)
    updateAndProcessParticles({
        width: renderWidth, height: renderHeight, posX, posY, dirX, dirY, planeX, planeY, horizon,
        particlesRef, rainRef, weather: weather as 'none' | 'rain', playerPos: player.pos,
        onParticleHit, onShardLanded, onParticleBounce, grid, grids, isPaused: p.isPaused, fov: currentFov, outdoorMap: p.outdoorMap, cameraZ, passThroughWalls: wallPassWallsRef.current
    });

    // 4. RENDER ENTITIES (Sprites use ctx.drawImage over the buffer)
    _st = performance.now();
    const { drawnParticles, hasActiveAnimations, statusOverlays } = renderEntities({
        ctx, width: renderWidth, height: renderHeight, grid, posX, posY, dirX, dirY, planeX, planeY, horizon, cameraZ,
        sprites, lightMap: currentLightMap, outdoorMap: p.outdoorMap, lightningMap, zBuffer: wallZBufferRef.current as any,
        solidWallTopBuffer: wallSolidWallTopBufferRef.current!,
        passThroughDoors: wallPassDoorsRef.current!, 
        passThroughWalls: wallPassWallsRef.current!,
        mirrorReflections: mirrorReflectionsRef.current!,
        player,
        pickupAnim: currentPickupAnim, throwAnim: currentThrowAnim, enemyMoveAnim: currentEnemyMoveAnim, boxMoveAnims: currentBoxMoveAnims, activeAttackerId, activeAttackerStartTime: activeAttackerStartTimeRef.current, damagedEnemyIds, highlightedEntityId: p.highlightedEntityId, hiddenEnemyIds,
        spriteTintCache: spriteTintCache.current, lightningIntensity, muzzleFlashIntensity: currentMuzzleFlashIntensity,
        particlesRef, rainRef, fliesRef, lastProcessedDamageIds,
        activeFlashes, enemies, isCombatActive, combatEnemies,
        animations,
        explosions: currentExplosions,
        activeDialogueNPCId,
        lootAnims,
        roamingAnims: currentRoamingAnims,
        aiDebug,
        pitLineVis,
        strings: p.strings,
        doorBuffer, // Pass door buffer for texture lookups
        auxBuffers, // Pass aux buffers for custom door textures
        playerReflectionSprite,
        resolutionDivisor: effectiveResolutionDivisor,
        flashlightActive: currentFlashlightActive,
        flashlightBatteryRatio: p.flashlightBatteryRatio,
        maskCtx,
        isPaused: p.isPaused,
        raycasterCamera: p.raycasterCamera,
        aimingSys: p.aimingSys,
        gameState: p.gameState,
        isWebGLActive,
        webglRenderer: webglRendererRef.current,
        settings
    });
    {
      const _d = performance.now() - _st;
      stageAccRef.current.ent += _d;
      _m.ent += _d;
    }

    hasActiveAnimationsRef.current = !!hasActiveAnimations;

    // Dynamically update effect status overlay divs on top of the raycaster container
    const overlaysContainer = overlaysContainerRef.current;
    if (overlaysContainer) {
        if (statusOverlays && statusOverlays.length > 0) {
            let htmlContent = '';
            for (let i = 0; i < statusOverlays.length; i++) {
                const data = statusOverlays[i];
                const tagText = p.strings?.combat?.status_stunned || 'ОГЛУШЕНИЕ';
                
                // Position calculations relative to renderWidth / renderHeight
                const xPercent = (data.x / renderWidth) * 100;
                const yPercent = (data.topY / renderHeight) * 100;
                
                htmlContent += `
                    <div 
                        style="
                            position: absolute;
                            left: ${xPercent}%;
                            top: ${yPercent}%;
                            transform: translate(-50%, -100%) translateY(-6px);
                        "
                        class="bg-slate-900/95 text-yellow-400 border border-slate-600/80 px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wider font-['Jura'] shadow-md select-none leading-none whitespace-nowrap flex items-center gap-1"
                    >
                        <svg viewBox="0 0 64 64" fill="currentColor" class="w-3.5 h-3.5 text-yellow-400 shrink-0">
                            <path d="M59.104 24.766l-13.6 3.182l-10.344-9.41l-1.172 13.941l-12.113 6.928l7.971 3.36c-8.95 9.691-21.285 16.05-22.233 12.592c-1.375-5.025 17.34-32.826 35.484-44.744C60.908-1.083 61.4 8.561 59.682 13.795C68.557-5.248 49.547 3.598 43.063 7.336C19.68 20.809-3.102 54.676 3.004 60.602c4.405 4.276 22.777-2.003 33.211-8.733l1.389 6.671l9.119-10.584l13.891 1.535l-7.244-11.977l5.734-12.748"></path>
                        </svg>
                        <span>${tagText}</span>
                    </div>
                `;
            }
            overlaysContainer.innerHTML = htmlContent;
        } else if (overlaysContainer.innerHTML !== '') {
            overlaysContainer.innerHTML = '';
        }
    }

    // 5. RENDER SPECIAL ANIMATIONS
    if (currentPickupAnim) {
        renderPickupAnimation(ctx, renderWidth, renderHeight, horizon, posX, posY, dirX, dirY, planeX, planeY, currentPickupAnim, player, currentLightMap, sprites, animations, spriteTintCache.current);
    }

    // 6. RENDER PARTICLES
    _st = performance.now();
    renderParticles({
        ctx, width: renderWidth, height: renderHeight, posX, posY, dirX, dirY, planeX, planeY, horizon,
        particlesRef, rainRef, zBuffer: wallZBufferRef.current as any, drawnParticles, 
        weather: weather as 'none' | 'rain', 
        playerPos: player.pos,
        onParticleHit,
        onShardLanded,
        onParticleBounce,
        grid,
        grids, // Pass grids for roof occlusion check
        auxBuffers,
        sprites,
        resolutionDivisor: 1, // Keep particles at full resolution (relative to renderWidth)
        maskCtx,
        lightMap: currentLightMap,
        webglRenderer: webglRendererRef.current,
        isWebGLActive,
        lightningIntensity,
        lightningMap,
        outdoorMap: p.outdoorMap,
        ceilingType: ceilingType
    });
    {
      const _d = performance.now() - _st;
      stageAccRef.current.part += _d;
      _m.part += _d;
    }

    // FINAL STEP: Upscale if necessary
    let finalCtx = canvas.getContext('2d', { alpha: false });
    
    if (!finalCtx) return;

    // 7. FLASHLIGHT EFFECT (Rendered on High Res Final Context)
    if (currentFlashlightActive && finalCtx) {
        // ALWAYS build/update the static blurred stencil light profile on CPU once (on resize)
        if (!flashlightCanvasRef.current || flashlightSizeRef.current.w !== width || flashlightSizeRef.current.h !== height) {
            const fCanvas = document.createElement('canvas');
            fCanvas.width = width;
            fCanvas.height = height;
            const fCtx = fCanvas.getContext('2d');
            
            if (fCtx) {
                // Fill with black first so color-dodge works predictably
                fCtx.fillStyle = 'black';
                fCtx.fillRect(0, 0, width, height);

                const centerX = width * 0.5;
                const centerY = height * 0.5;
                
                // 1. The Spot (Round end at center)
                const spotRadius = width * 0.32; 
                const spotGradient = fCtx.createRadialGradient(
                    centerX, centerY, 0,
                    centerX, centerY, spotRadius
                );
                
                // Solid RGB values for color-dodge. 
                // Color-dodge multiplies base color: Multiplier = 255 / (255 - RGB)
                // 250 = ~50x brighter, 220 = ~7x brighter, 128 = 2x brighter, 0 = no change
                spotGradient.addColorStop(0, 'rgba(230, 230, 230, 1)'); // Very bright center
                spotGradient.addColorStop(0.15, 'rgba(200, 200, 200, 1)'); // Strong inner corona
                spotGradient.addColorStop(0.4, 'rgba(120, 120, 120, 1)'); // Mid falloff
                spotGradient.addColorStop(0.7, 'rgba(50, 50, 50, 1)'); // Outer edge
                spotGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fade to transparent

                // 2. The Beam (Cone from bottom-left)
                const originX = 0; // Bottom left corner
                const originY = height;
                
                const angle = Math.atan2(centerY - originY, centerX - originX);
                const perpAngle1 = angle + Math.PI / 2;
                const perpAngle2 = angle - Math.PI / 2;
                
                // Extend the beam gradient to the far edge of the spot
                const extendX = centerX + Math.cos(angle) * spotRadius;
                const extendY = centerY + Math.sin(angle) * spotRadius;
                
                const beamGradient = fCtx.createLinearGradient(
                     originX, originY, 
                     extendX, extendY  
                );
                
                beamGradient.addColorStop(0, 'rgba(180, 180, 180, 1)'); 
                beamGradient.addColorStop(0.5, 'rgba(100, 100, 100, 1)');
                beamGradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
                
                // Apply blur to EVERYTHING drawn next for a smooth volumetric look
                fCtx.filter = 'blur(16px)';
                
                // Soft blending for lights to prevent blown out colors
                fCtx.globalCompositeOperation = 'screen';

                // Draw Beam
                fCtx.fillStyle = beamGradient;
                fCtx.beginPath();
                fCtx.moveTo(-width * 0.1, height + height * 0.1); 
                fCtx.lineTo(width * 0.25, height + height * 0.1); 
                
                // Draw the beam polygon all the way to the far edge of the spot
                fCtx.lineTo(extendX + Math.cos(perpAngle1) * spotRadius, extendY + Math.sin(perpAngle1) * spotRadius); 
                fCtx.lineTo(extendX + Math.cos(perpAngle2) * spotRadius, extendY + Math.sin(perpAngle2) * spotRadius); 
                fCtx.closePath();
                fCtx.fill();

                // Draw Spot
                fCtx.fillStyle = spotGradient;
                fCtx.beginPath();
                fCtx.arc(centerX, centerY, spotRadius, 0, Math.PI * 2);
                fCtx.fill();
                
                // Reset composite operation
                fCtx.globalCompositeOperation = 'source-over';
                fCtx.filter = 'none';
            }
            
            flashlightCanvasRef.current = fCanvas;
            flashlightSizeRef.current = { w: width, h: height };
        }

        if (isWebGLActive && webglRendererRef.current && flashlightCanvasRef.current) {
            // GPU-accelerated Flashlight render with full, exact stencils and identical properties
            webglRendererRef.current.renderFlashlightWebGL(width, height, canvas, flashlightCanvasRef.current, maskCanvas);
            finalCtx.drawImage(webglCanvasRef.current!, 0, 0);
        } else {
            if (maskCanvas) {
                if (!tempFlashlightCanvasRef.current || tempFlashlightCanvasRef.current.width !== width || tempFlashlightCanvasRef.current.height !== height) {
                    const tfCanvas = document.createElement('canvas');
                    tfCanvas.width = width;
                    tfCanvas.height = height;
                    tempFlashlightCanvasRef.current = tfCanvas;
                }

                const tempFlashlightCanvas = tempFlashlightCanvasRef.current;
                const tempCtx = tempFlashlightCanvas.getContext('2d');
                
                if (tempCtx && flashlightCanvasRef.current) {
                    tempCtx.globalCompositeOperation = 'source-over';
                    tempCtx.clearRect(0, 0, width, height);
                    tempCtx.drawImage(flashlightCanvasRef.current, 0, 0);
                    
                    tempCtx.globalAlpha = 0.5;
                    tempCtx.globalCompositeOperation = 'destination-out';
                    tempCtx.drawImage(maskCanvas, 0, 0, width, height);
                    tempCtx.globalAlpha = 1.0;
                    
                    finalCtx.save();
                    
                    // PASS 1: Color Dodge
                    finalCtx.globalCompositeOperation = 'color-dodge'; 
                    finalCtx.drawImage(tempFlashlightCanvas, 0, 0);
                    
                    // PASS 2: Screen (Atmospheric dust/beam)
                    finalCtx.globalCompositeOperation = 'screen';
                    finalCtx.globalAlpha = 0.15;
                    finalCtx.drawImage(tempFlashlightCanvas, 0, 0);
                    
                    finalCtx.restore();
                }
            } else if (flashlightCanvasRef.current) {
                finalCtx.save();
                
                // PASS 1: Color Dodge
                finalCtx.globalCompositeOperation = 'color-dodge'; 
                finalCtx.drawImage(flashlightCanvasRef.current, 0, 0);
                
                // PASS 2: Screen (Atmospheric dust/beam)
                finalCtx.globalCompositeOperation = 'screen';
                finalCtx.globalAlpha = 0.15;
                finalCtx.drawImage(flashlightCanvasRef.current, 0, 0);
                
                finalCtx.restore();
            }
        }
    }

    lastProcessedDamageIds.current.forEach(id => {
        if (!id.startsWith('CORPSE') && !damagedEnemyIds.includes(id)) {
            lastProcessedDamageIds.current.delete(id);
        }
    });

    if (p.onFrameRendered) p.onFrameRendered();

    {
      const _total = performance.now() - _frameStart;
      const _a = stageAccRef.current;
      _a.oth += _total - (_m.bg + _m.walls + _m.gl + _m.ent + _m.part);
      _a.frames++;
    }

  }, []);

  const isLoopRunning = useRef(false);

  const lastParticleTimeRef = useRef<number>(performance.now());
  const particleAccumulatorsRef = useRef<Map<string, number>>(new Map());

  const loop = useCallback((time: number) => {
      const p = propsRef.current;
      const s = stateRef.current;
      
      const startTx = Math.round(startState.current.x);
      const startTy = Math.round(startState.current.y);
      const targetTx = Math.round(targetState.current.x);
      const targetTy = Math.round(targetState.current.y);
      
      let duration = p.animationDuration;
      let isLadderClimb = false;
      if (grid) {
          const startTile = (startTy >= 0 && startTy < grid.length && startTx >= 0 && startTx < grid[startTy].length) ? grid[startTy][startTx] : null;
          const startFloorH = getEffectiveTileHeight(startTile);
          const targetTile = (targetTy >= 0 && targetTy < grid.length && targetTx >= 0 && targetTx < grid[targetTy].length) ? grid[targetTy][targetTx] : null;
          const targetFloorH = getEffectiveTileHeight(targetTile);
          const heightDiff = targetFloorH - startFloorH;
          const hasLadder = startTile?.decoration?.type === 'LADDER' || startTile?.pitDecoration?.type === 'LADDER';
          
          if (heightDiff > 0.15 && hasLadder) {
              isLadderClimb = true;
              duration = Math.max(250, heightDiff * 600);
          }
      }

      const elapsed = time - lerpStartTime.current;
      let t = Math.min(1, elapsed / duration);

      const nowMs = performance.now();
      lastFrameTimeRef.current = nowMs;

      const easeT = isLadderClimb ? getLadderHorizontalCurve(t) : easeInOutQuad(t);
      const currX = lerp(startState.current.x, targetState.current.x, easeT);
      const currY = lerp(startState.current.y, targetState.current.y, easeT);
      const diff = shortestAngleDiff(startState.current.angle, targetState.current.angle);
      const currAngle = startState.current.angle + diff * (isLadderClimb ? t : easeT);
      animState.current.x = currX; 
      animState.current.y = currY; 
      animState.current.angle = currAngle;
      animState.current.progress = t; 
      
      renderFrame(currX, currY, currAngle, t);
      
      frameCountRef.current++;

      // Ambient Particle Spawning
      let hasVisibleEmitters = false;
      if (p.levelParticles && p.particlesDb && !p.isPaused) {
          const dt = (time - lastParticleTimeRef.current) / 1000;
          lastParticleTimeRef.current = time;
          const safeDt = Math.min(dt, 0.1);
          
          for (let i = 0; i < p.levelParticles.length; i++) {
              const emitter = p.levelParticles[i];
              if (!emitter.definitionId) continue;
              const def = p.particlesDb[emitter.definitionId];
              if (!def) continue;

              const dx = emitter.x - currX;
              const dy = emitter.y - currY;
              const distSq = dx * dx + dy * dy;
              
              if (distSq > (p.renderDistance || 8) * (p.renderDistance || 8)) continue;

              const emitterKey = `emitter_${emitter.x}_${emitter.y}_${i}`;
              let toSpawn = 0;

              if (def.burst !== undefined) {
                  const alreadyBurst = particleAccumulatorsRef.current.get(emitterKey + "_burst");
                  if (alreadyBurst) continue;
                  particleAccumulatorsRef.current.set(emitterKey + "_burst", 1);
                  toSpawn = Math.floor(def.burst);
              } else {
                  hasVisibleEmitters = true; // Continuous emitter in range
                  let accum = particleAccumulatorsRef.current.get(emitterKey) || 0;
                  const rate = def.spawnRate || 5;
                  accum += rate * safeDt;

                  toSpawn = Math.floor(accum);
                  if (toSpawn > 0) {
                      accum -= toSpawn;
                  }
                  particleAccumulatorsRef.current.set(emitterKey, accum);
              }

              if (toSpawn > 0) {
                  for (let j = 0; j < toSpawn; j++) {
                      const colors = def.colors && def.colors.length > 0 ? def.colors : ['#ffffff'];
                      const color = colors[Math.floor(Math.random() * colors.length)];
                      const speedXMin = def.speedXMin !== undefined ? def.speedXMin : -0.05;
                      const speedXMax = def.speedXMax !== undefined ? def.speedXMax : 0.05;
                      const speedYMin = def.speedYMin !== undefined ? def.speedYMin : -0.05;
                      const speedYMax = def.speedYMax !== undefined ? def.speedYMax : 0.05;
                      const speedZMin = def.speedZMin !== undefined ? def.speedZMin : 0.0;
                      const speedZMax = def.speedZMax !== undefined ? def.speedZMax : 0.02;

                      const p = getParticle();
                      p.x = 0;
                      p.y = 0;
                      p.worldX = Math.floor(emitter.x) + 0.5;
                      p.worldY = Math.floor(emitter.y) + 0.5;
                      p.worldZ = (def.zOffset || 0) + (emitter.z || 0);
                      p.floorZ = emitter.z || 0;
                      p.useGravity = true;
                      p.wvx = speedXMin + Math.random() * (speedXMax - speedXMin);
                      p.wvy = speedYMin + Math.random() * (speedYMax - speedYMin);
                      p.wvz = speedZMin + Math.random() * (speedZMax - speedZMin);
                      p.life = def.life || 1;
                      p.maxLife = def.maxLife || (def.life || 1) + 0.5;
                      p.size = def.startSize || 1;
                      p.color = color;
                      p.alpha = 1;
                      p.type = 'generic';
                      p.gravity = def.gravity !== undefined ? def.gravity : -0.01;
                      p.friction = def.friction !== undefined ? def.friction : 0.98;
                      p.dist = 0;
                      p.sizeGrowth = def.sizeGrowth;
                      p.spriteId = def.spriteId;
                      p.textureId = undefined; // clear out any old pool data
                      p.soundId = undefined;
                      p.isForeground = undefined;
                      p.landed = false;
                      particlesRef.current.push(p);
                  }
              }
          }
      } else if (p.isPaused) {
          lastParticleTimeRef.current = time;
      }

      // Оптимизация производительности: удаляем группы мух, которые игрок не видел более 3 секунд, чтобы анимационный цикл мог засыпать
      if (fliesRef.current.size > 0 && !p.isPaused) {
          const now = Date.now();
          for (const [key, flies] of fliesRef.current.entries()) {
              const lastSeen = (flies as any).lastSeen || 0;
              if (now - lastSeen > 3000) {
                  returnParticlesToPool(flies);
                  fliesRef.current.delete(key);
              }
          }
      }
      
      const hasAnimations = hasActiveAnimationsRef.current;

      // Check if any doors are currently opening or closing on the grid to keep the engine loop awake
      const hasAnimatingDoors = !!(window as any).isAnyDoorAnimating;

      if (p.isPaused) {
          // Force t=1.0 to stop movement interpolation
          t = 1.0;
          animState.current.x = targetState.current.x;
          animState.current.y = targetState.current.y;
          animState.current.angle = targetState.current.angle;
          animState.current.progress = 1.0;
          renderFrame(targetState.current.x, targetState.current.y, targetState.current.angle, 1.0);
          
          const hasDynamicLights = p.dynamicLights && p.dynamicLights.length > 0;
          const hasC4 = c4TilesRef.current.length > 0;
          const curPickup = p.pickupAnimRef?.current || p.pickupAnim;
          const curThrow = p.throwAnimRef?.current || p.throwAnim;
          const curEnemyMove = p.enemyMoveAnimRef?.current || p.enemyMoveAnim;
          const curBoxAnims = p.boxMoveAnimsRef?.current || p.boxMoveAnims || [];
          const curRoaming = p.roamingAnimsRef?.current || p.roamingAnims || [];
          const curFlashes = p.enemyFlashesRef?.current || p.enemyFlashes || [];
          const curExplosions = p.explosionsRef?.current || p.explosions || [];

          const hasActiveDeathAnim = (p.deathAnimProgressRef?.current || 0) > 0 || (p.fallAnimProgressRef?.current || 0) > 0 || (p.scriptedDeathProgressRef?.current || 0) > 0 || (p.deathAnimProgress || 0) > 0;
          const hasCinematicCam = p.cinematicCameraRef?.current !== null || p.raycasterCamera !== null;

          if (hasVisibleEmitters || hasAnimations || hasAnimatingDoors || isHeightInterpolatingRef.current || hasDynamicLights || hasC4 || (p.muzzleFlashIntensityRef?.current || 0) > 0 || s.lightningIntensity > 0 || curPickup || curThrow || curEnemyMove || curBoxAnims.length > 0 || p.activeAttackerId || (p.damagedEnemyIds && p.damagedEnemyIds.length > 0) || particlesRef.current.length > 0 || rainRef.current.length > 0 || fliesRef.current.size > 0 || hasActiveAmbientParticles() || p.showFps || curFlashes.length > 0 || curExplosions.length > 0 || p.lootAnims.length > 0 || curRoaming.length > 0 || hasActiveDeathAnim || (p.shakeEvent?.current && performance.now() < p.shakeEvent.current.startTime + p.shakeEvent.current.duration) || hasCinematicCam || p.highlightedEntityId || (p.highlightedTiles?.length || 0) > 0) {
              animationFrameId.current = requestAnimationFrame(loop);
          } else {
              isLoopRunning.current = false;
          }
          return;
      }

      const hasDynamicLights = p.dynamicLights && p.dynamicLights.length > 0;
      const hasC4 = c4TilesRef.current.length > 0;
      const isWaterAnimActive = !p.isPaused && waterVisibleRef.current;
      const curPickup = p.pickupAnimRef?.current || p.pickupAnim;
      const curThrow = p.throwAnimRef?.current || p.throwAnim;
      const curEnemyMove = p.enemyMoveAnimRef?.current || p.enemyMoveAnim;
      const curBoxAnims = p.boxMoveAnimsRef?.current || p.boxMoveAnims || [];
      const curRoaming = p.roamingAnimsRef?.current || p.roamingAnims || [];
      const curFlashes = p.enemyFlashesRef?.current || p.enemyFlashes || [];
      const curExplosions = p.explosionsRef?.current || p.explosions || [];

      const hasActiveDeathAnim = (p.deathAnimProgressRef?.current || 0) > 0 || (p.fallAnimProgressRef?.current || 0) > 0 || (p.scriptedDeathProgressRef?.current || 0) > 0 || (p.deathAnimProgress || 0) > 0;
      const hasCinematicCam = p.cinematicCameraRef?.current !== null || p.raycasterCamera !== null;

      if (isWaterAnimActive || hasVisibleEmitters || t < 1.0 || isHeightInterpolatingRef.current || hasAnimations || hasAnimatingDoors || hasDynamicLights || hasC4 || (p.muzzleFlashIntensityRef?.current || 0) > 0 || s.lightningIntensity > 0 || curPickup || curThrow || curEnemyMove || curBoxAnims.length > 0 || p.activeAttackerId || (p.damagedEnemyIds && p.damagedEnemyIds.length > 0) || particlesRef.current.length > 0 || rainRef.current.length > 0 || fliesRef.current.size > 0 || hasActiveAmbientParticles() || p.showFps || curFlashes.length > 0 || curExplosions.length > 0 || p.lootAnims.length > 0 || curRoaming.length > 0 || hasActiveDeathAnim || (p.shakeEvent?.current && performance.now() < p.shakeEvent.current.startTime + p.shakeEvent.current.duration) || hasCinematicCam || p.highlightedEntityId || (p.highlightedTiles?.length || 0) > 0) {
          animationFrameId.current = requestAnimationFrame(loop);
      } else { 
          isLoopRunning.current = false;
          renderFrame(targetState.current.x, targetState.current.y, targetState.current.angle, 1.0); 
      }
  }, [renderFrame]);

  const startLoop = useCallback(() => {
      if (!isLoopRunning.current) {
          isLoopRunning.current = true;
          animationFrameId.current = requestAnimationFrame(loop);
      }
  }, [loop]);

  useEffect(() => {
      const handleLookEvent = () => {
          if (!canvasRef.current || isPaused) return;
          startLoop();
      };
      window.addEventListener('raycaster-look', handleLookEvent);
      return () => window.removeEventListener('raycaster-look', handleLookEvent);
  }, [startLoop, isPaused]);

  useEffect(() => {
      if (!showFps) return;
      const interval = setInterval(() => {
          if (fpsRef.current) {
              const _a = stageAccRef.current;
              const _n = Math.max(1, _a.frames);
              fpsRef.current.textContent =
                  `FPS: ${frameCountRef.current}\n` +
                  `bg: ${(_a.bg / _n).toFixed(2)}ms\n` +
                  `walls: ${(_a.walls / _n).toFixed(2)}ms\n` +
                  `gl: ${(_a.gl / _n).toFixed(2)}ms\n` +
                  `ent: ${(_a.ent / _n).toFixed(2)}ms\n` +
                  `part: ${(_a.part / _n).toFixed(2)}ms\n` +
                  `oth: ${(_a.oth / _n).toFixed(2)}ms`;
              _a.bg = 0; _a.walls = 0; _a.gl = 0; _a.ent = 0; _a.part = 0; _a.oth = 0; _a.frames = 0;
          }
          frameCountRef.current = 0;
      }, 1000);
      return () => clearInterval(interval);
  }, [showFps]);

  useEffect(() => {
      startLoop();
  }, [startLoop]);

  useEffect(() => {
      return () => { 
          if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); 
          isLoopRunning.current = false; 
      };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
        <canvas ref={canvasRef} width={width} height={height} className="w-full h-full bg-black" style={{ imageRendering: viewportSmoothing ? 'auto' : 'pixelated' }} />
        <div ref={overlaysContainerRef} className="absolute inset-x-0 inset-y-0 pointer-events-none z-20 overflow-hidden" />
        {showFps && (
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 border border-gray-700/50 rounded-[2px] pointer-events-none z-[100] flex items-center shadow-sm">
                <span ref={fpsRef} style={{ whiteSpace: 'pre-line' }} className="text-[10px] font-['Jura'] font-bold text-gray-400 tracking-tight">FPS: 0</span>
            </div>
        )}
    </div>
  );
});

export default React.memo(Raycaster, (prev, next) => {
    if (prev.player.pos.x !== next.player.pos.x) return false;
    if (prev.player.pos.y !== next.player.pos.y) return false;
    if (prev.player.dir !== next.player.dir) return false;
    if (prev.player.dir360 !== next.player.dir360) return false;
    if (prev.fov !== next.fov) return false;
    
    if (prev.grid !== next.grid) return false;
    if (prev.grids !== next.grids) return false;
    if (prev.lightMap !== next.lightMap) return false;
    if (prev.outdoorMap !== next.outdoorMap) return false;
    if (prev.width !== next.width) return false;
    if (prev.height !== next.height) return false;
    if (prev.sprites !== next.sprites) return false;
    if (prev.wallTexture !== next.wallTexture) return false;
    if (prev.floorTexture !== next.floorTexture) return false;
    if (prev.doorTexture !== next.doorTexture) return false;
    if (prev.skyTexture !== next.skyTexture) return false;
    if (prev.ceilingTexture !== next.ceilingTexture) return false;
    if (prev.ceilingType !== next.ceilingType) return false;
    if (prev.weather !== next.weather) return false;
    if (prev.shakeEventRef !== next.shakeEventRef) return false;
    if (!prev.enemyMoveAnimRef && prev.enemyMoveAnim !== next.enemyMoveAnim) return false;
    if (prev.highlightedTiles !== next.highlightedTiles) return false;
    if (prev.highlightedEntityId !== next.highlightedEntityId) return false;
    if (prev.activeAttackerId !== next.activeAttackerId) return false;
    if (prev.damagedEnemyIds !== next.damagedEnemyIds) return false;
    if (prev.debugTextures !== next.debugTextures) return false;
    if (prev.showFps !== next.showFps) return false;
    if (prev.animationDuration !== next.animationDuration) return false;
    if (prev.muzzleFlashIntensity !== next.muzzleFlashIntensity) return false;
    if (prev.muzzleFlashIntensityRef !== next.muzzleFlashIntensityRef) return false;
    if (prev.playerDamageSource !== next.playerDamageSource) return false;
    if (prev.isCombatActive !== next.isCombatActive) return false;
    if (prev.combatEnemies !== next.combatEnemies) return false;
    if (prev.animations !== next.animations) return false;
    if (prev.activeDialogueNPCId !== next.activeDialogueNPCId) return false;
    if (prev.lootAnims !== next.lootAnims) return false;
    if (prev.aiDebug !== next.aiDebug) return false;
    if (prev.pitLineVis !== next.pitLineVis) return false;
    if (prev.customWallBuffers !== next.customWallBuffers) return false;
    if (prev.customFloorBuffers !== next.customFloorBuffers) return false;
    if (prev.playerReflectionSprite !== next.playerReflectionSprite) return false;
    if (prev.flashlightActive !== next.flashlightActive) return false;
    if (prev.resolutionDivisor !== next.resolutionDivisor) return false;
    if (!prev.deathAnimProgressRef && prev.deathAnimProgress !== next.deathAnimProgress) return false;
    if (prev.isPaused !== next.isPaused) return false;
    if (prev.raycasterCamera !== next.raycasterCamera) return false;
    
    return true;
});
