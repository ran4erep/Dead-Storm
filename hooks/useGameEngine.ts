import { useState, useEffect, useMemo, useLayoutEffect, useRef, useCallback } from 'react';
import { GameState, Item, Settings, PlayerEquipment, Enemy, VoiceConfig, RoamingEnemyAnim, Tile } from '../types';
import { WORLD_MAP_PATHS } from '../data/levels';
import { ASSETS } from '../assets';
import { initVoice, setGlobalVoiceVolume } from '../utils/voiceSynth';
import { createPlayer } from '../utils/playerLogic';
import { loadImage, preloadAllAssets } from '../utils/levelLogic';
import { rollDice } from '../utils/dice';
import { hasLineOfSight, findEnemiesWithLineOfSight } from '../utils/combatLogic';
import { createBrickParticles, createShardParticles, createGibParticles, getMaskBuffer, createCasingParticle, clearCasingParticles } from '../utils/particleSystem';

// Hooks
import { useVisualEffects, getLowHealthOverlayImage } from './useVisualEffects';
import { useAimingSystem } from './useAimingSystem';
import { useThrowingSystem } from './useThrowingSystem';
import { useWeaponAnimation } from './useWeaponAnimation';
import { useLogActions } from '../contexts/LogContext';
import { usePlayerSystem } from './usePlayerSystem';
import { usePlayerFall } from './usePlayerFall';
import { useAssetLoader } from './useAssetLoader';
import { useLevelSystem } from './useLevelSystem';
import { useScriptSystem } from './useScriptSystem';
import { useCombatSystem } from './useCombatSystem';
import { useMovementSystem } from './useMovementSystem';
import { useInventorySystem } from './useInventorySystem';
import { useSoundSystem } from './useSoundSystem';
import { useDialogueSystem } from './useDialogueSystem';
import { useToast } from './useToast';
import { useAudioOrchestrator } from './useAudioOrchestrator';
import { useInputController } from './useInputController';
import { useLootSystem } from './useLootSystem'; 
import { useEffectSystem } from './useEffectSystem'; 
import { useExplosionSystem } from './useExplosionSystem';
import { useCasingSystem } from './useCasingSystem';
import { useC4BeepSystem } from './useC4BeepSystem';
import { useGameLifecycle } from './useGameLifecycle';
import { useDialogueNPC } from './useDialogueNPC';
import { useLayout } from './useLayout';
import { useGameTurns } from './useGameTurns';
import { useGlobalState } from './useGlobalState';
import { usePlayerEquipmentEffects } from './usePlayerEquipmentEffects';
import { useSplatterSystem } from './useSplatterSystem';
import { useLocalizationUpdate } from './useLocalizationUpdate';
import { useEnemySoundEffects } from './useEnemySoundEffects';
import { useHighlightedTiles } from './useHighlightedTiles';
import { useWeaponRendering } from './useWeaponRendering';
import { useCombatActions } from './useCombatActions';
import { usePlayerDeath } from './usePlayerDeath';
import { useRoamingSystemReal as useRoamingSystem } from './useRoamingSystem';
import { getWeaponSprite } from '../utils/getWeaponSprite';
import { useAchievements } from './useAchievements';

import { useInspectingSystem } from './useInspectingSystem';

export const RAYCASTER_WIDTH = 320;
export const RAYCASTER_HEIGHT = 240;

export function useGameEngine() {
  // --- 1. Global UI & Game State ---
  const globalState = useGlobalState();
  const {
      gameState, setGameState, settings, setSettings, activeModal, setActiveModal,
      inspectText, setInspectText,
      showPauseMenu, setShowPauseMenu, showSettings, setShowSettings, showDebug, setShowDebug,
      showVolume, setShowVolume, lootData, setLootData, enemies, setEnemies,
      enemyFlashesRef, playerDamageSource, setPlayerDamageSource,
      explosionsRef, isTransitioningToMenu, setIsTransitioningToMenu,
      showIntroVideo, setShowIntroVideo, isVideoReady, setIsVideoReady,
      manualReloadTrigger, setManualReloadTrigger, playerReflectionSprite, setPlayerReflectionSprite,
      forceUpdate, mapSnapshotsRef, inventorySysRef, raycasterRef, activeExplosionsRef, sectorStatesRef, globalScriptFlagsRef,
      roamingAnims, setRoamingAnims, boxMoveAnims, setBoxMoveAnims, cinematicMode, setCinematicMode, cinematicCamera, setCinematicCamera, raycasterWidth, raycasterHeight, resolutionDivisor, weaponRef, akimboWeaponRef,
      pickupAnim, setPickupAnim, throwAnim, setThrowAnim,
      lookAroundAngle, setLookAroundAngle,
      lookAroundPitch, setLookAroundPitch,
      lookAroundAngleRef, lookAroundPitchRef,
      inspectZoom, setInspectZoom,
      gameOverType, setGameOverType
  } = globalState;

  const layout = useLayout();
  const { isLandscape, headerHeight, iframeTopOffset } = layout;

  const playerSystem = usePlayerSystem();
  const { 
      player, setPlayer, playerHpRef, inventoryStats, totalAmmoInInventory, gainLevel
  } = playerSystem;

  const toastSystem = useToast(player.characterId === 'female');
  const { toasts, showToast } = toastSystem;
  const lootSystem = useLootSystem();
  const { lootAnims, triggerLootDrop } = lootSystem; 

  useEffect(() => {
      const voiceVol = settings.volume.voice ?? 100;
      setGlobalVoiceVolume(voiceVol);
  }, [settings.volume.voice]);

  // --- 2. Initialize Systems ---
  const { addLog: rawAddLog, clearLog, setIsFemale } = useLogActions();
  
  useEffect(() => {
      setIsFemale(player.characterId === 'female');
  }, [player.characterId, setIsFemale]);
  
  const assetLoader = useAssetLoader(settings);
  const { 
      strings, loading, setLoading, loadingMessage, setLoadingMessage, 
      loadingProgress, setLoadingProgress, loadingLogs, setLoadingLogs,
      isTransitionLoading, setIsTransitionLoading,
      isWaitingToStart, setIsWaitingToStart, isGameInitialized, masterSpriteMapRef,
      spriteMap, setSpriteMap, loadingLogRef, initialPlayerStateRef, animations, sounds,
      enemiesDb, npcsDb, decorationsDb, particlesDb, itemsDb
  } = assetLoader;

  const addLog = useCallback((text: string, type?: any) => {
      rawAddLog(text, type);
      
      if (strings && strings.logs) {
          const matchTemplate = (txt: string, template: string): boolean => {
              if (!template) return false;
              const parts = template.split(/\{[^}]+\}/);
              if (parts.length === 0) return false;
              let currentIndex = 0;
              for (const part of parts) {
                  if (!part) continue;
                  const idx = txt.indexOf(part, currentIndex);
                  if (idx === -1) return false;
                  currentIndex = idx + part.length;
              }
              return true;
          };

          const isFull = 
              text === strings.logs.inventory_full || 
              text === strings.logs.unequip_fail_space ||
              text === strings.logs.unequip_drop ||
              matchTemplate(text, strings.logs.inventory_full) ||
              matchTemplate(text, strings.logs.unequip_fail_space) ||
              matchTemplate(text, strings.logs.unequip_drop);
              
          if (isFull) {
              showToast(text);
          }
      }
  }, [rawAddLog, strings, showToast]);

  const playerEquipmentEffects = usePlayerEquipmentEffects({
      player, spriteMap, setPlayerReflectionSprite
  });
  const { isFlashlightOn, flashlightBatteryRatio, almostBrokenSlots } = playerEquipmentEffects;

  const [activeTutorial, setActiveTutorial] = useState<{ 
    textId?: string; 
    text?: string; 
    highlightElement?: any; 
    pages?: Array<{ textId?: string; text?: string; highlightElement?: any }>;
    resolve?: () => void 
  } | null>(null);

  const [screamer, setScreamer] = useState<{ image: string; soundId: string; duration: number } | null>(null);

  const showTutorialWrapper = useCallback((params: any) => {
      return new Promise<void>((resolve) => {
          setActiveTutorial({ ...params, resolve });
      });
  }, []);

  const isGameplayState = [
      GameState.PLAYING, GameState.COMBAT, GameState.MAP_VIEW, GameState.RADIO_VIEW,
      GameState.AIMING, GameState.THROWING, GameState.DIALOGUE, GameState.DYING, GameState.FALLING
  ].includes(gameState);
  const maxConcussion = Math.max((player.concussionLevel || 0), (player.flashDuration || 0));
  const concussionDuration = isGameplayState ? maxConcussion : 0;
  const isMenuMuffled = showPauseMenu || showSettings || showDebug || showVolume || !!activeTutorial;

  const forceCloseMapWrapper = useCallback(() => {
      inventorySysRef.current?.forceCloseMap();
  }, []);

  const enemiesRef = useRef(enemies);
  useEffect(() => { enemiesRef.current = enemies; }, [enemies]);
  const roamingAnimsRef = useRef(roamingAnims);
  useEffect(() => { roamingAnimsRef.current = roamingAnims; }, [roamingAnims]);

  const checkTriggersRef = useRef<((type: string, params: any) => void)>();
  const checkTriggersStable = useCallback((type: string, params: any) => {
      checkTriggersRef.current?.(type, params);
  }, []);
  const handleDoorStateChange = useCallback((x: number, y: number, state: 'OPEN' | 'CLOSED') => {
      checkTriggersRef.current?.('ON_DOOR_STATE_CHANGE', { x, y, state });
  }, []);

  const loadSoundRef = useRef<any>(null);
  const loadSoundWrapper = useCallback(async (u: string) => { 
      if (loadSoundRef.current) return await loadSoundRef.current(u); 
  }, []);

  const levelSystem = useLevelSystem(
      strings, masterSpriteMapRef, setSpriteMap, setEnemies, setPlayer, addLog, setLoading, setLoadingProgress, setLoadingLogs, setLoadingMessage, setIsWaitingToStart, setIsTransitionLoading, settings.language,
      forceCloseMapWrapper, loadSoundWrapper, undefined, enemiesDb, npcsDb, decorationsDb, itemsDb,
      sectorStatesRef, () => enemiesRef.current, () => roamingAnimsRef.current, setRoamingAnims, handleDoorStateChange,
      globalScriptFlagsRef
  );
  const {
      levelData, setLevelData, currentLevelPath, setCurrentLevelPath,
      wallTexture, floorTexture, doorTexture, skyTexture, setSkyTexture, ceilingTexture,
      viewportFade, setViewportFade, loadLevel, markTileAsExplored, markTilesAsExploredBatch, clearExploredTiles, addSplatter, addShardDecal, getCurrentDecalEvents, customWallBuffers, customFloorBuffers,
      plantExplosive, tickExplosives
  } = levelSystem;

  const handleRevealFogOfWarBatch = useCallback((tiles: {x: number, y: number}[]) => {
      markTilesAsExploredBatch(currentLevelPath || '', tiles);
  }, [currentLevelPath, markTilesAsExploredBatch]);

  // Clear particles when level changes
  useEffect(() => {
      raycasterRef.current?.clearParticles();
  }, [currentLevelPath]);

  // Initialize Sound System (Now with levelData for occlusion, cinematicMode, and cinematicCamera)
  const soundSystem = useSoundSystem(
      player, 
      sounds, 
      settings.volume, 
      isMenuMuffled,
      concussionDuration,
      levelData, // Pass levelData for wall occlusion logic
      cinematicMode,
      cinematicCamera
  );
  const { playSound: originalPlaySound, stopSound, stopAllSounds, playMusic, pauseMusic, resumeMusic, stopMusic, playWeather, loadSound, initContext, prepareStream, updateSoundPosition } = soundSystem;

  useEffect(() => { loadSoundRef.current = loadSound; }, [loadSound]);

  const levelDataRef = useRef(levelData);
  useEffect(() => { levelDataRef.current = levelData; }, [levelData]);

  // Wrapper around sound system's playSound to alert enemies within triggerRange
  const playSound = useCallback((soundId: string, pos?: { x: number, y: number }, id?: string, delayMs?: number, reverbPos?: { x: number, y: number }, maxDistance?: number, loopOverride?: boolean) => {
      originalPlaySound(soundId, pos, id, delayMs, reverbPos, maxDistance, loopOverride);

      const soundDef = sounds[soundId];
      if (soundDef && soundDef.triggerRange && pos && settings.debug.aiEnabled && gameState !== GameState.DYING) {
          const ld = levelDataRef.current;
          if (!ld || !ld.grid) return;
          
          setEnemies((prev: Map<string, Enemy>) => {
              const next = new Map<string, Enemy>(prev);
              let changed = false;
              
              const range = soundDef.triggerRange!;
              const r = Math.ceil(range);
              const minX = Math.max(0, Math.floor(pos.x) - r);
              const maxX = Math.min(ld.width - 1, Math.ceil(pos.x) + r);
              const minY = Math.max(0, Math.floor(pos.y) - r);
              const maxY = Math.min(ld.height - 1, Math.ceil(pos.y) + r);

              for (let y = minY; y <= maxY; y++) {
                 for (let x = minX; x <= maxX; x++) {
                     const t = ld.grid[y] && ld.grid[y][x];
                     if (t && t.enemyId) {
                         const enemy = next.get(t.enemyId);
                         if (enemy && enemy.hp > 0 && enemy.aiState !== 'COMBAT') {
                             const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                             if (dist <= range) {
                                 // Just set the sound pos as investigation target since they heard it
                                 next.set(t.enemyId, { ...enemy, targetPos: { x: Math.round(pos.x), y: Math.round(pos.y) }, aiState: 'INVESTIGATE', investigateTurns: 0, currentPath: [] });
                                 changed = true;
                             }
                         }
                     }
                 }
              }

              return changed ? next : prev;
          });
      }
  }, [originalPlaySound, sounds, settings.debug.aiEnabled, gameState, setEnemies]);

  const { unlocked: unlockedAchievements, stats: achievementStats, unlockAchievement, incrementStat: incrementAchievementStat } = useAchievements(strings, playSound, showToast);

  const lastHpRef = useRef(player.hp);
  useEffect(() => {
     if (player.hp < lastHpRef.current && !loading) {
         const dmg = lastHpRef.current - player.hp;
         incrementAchievementStat('damage_taken', dmg);
     }
     lastHpRef.current = player.hp;
  }, [player.hp, loading, incrementAchievementStat]);

  useEffect(() => {
      if (gameState === GameState.MAP_VIEW) {
          unlockAchievement('explorer');
      }
  }, [gameState, unlockAchievement]);

  const visualEffects = useVisualEffects(player.hp, player.maxHp, settings.vibration, gameState, loading, playSound, stopSound);
  const { 
      delayedHp, setDelayedHp, showLevelUpText, shakeEventRef, muzzleFlashIntensityRef,
      triggerDamageEffect, triggerPickupEffect, triggerLevelUpEffect, triggerMuzzleFlash, triggerScreenShake, triggerAttackVibration, isLowHealth
  } = visualEffects;

  const prevLevelRef = useRef(player.level);
  const wasLoadingRef = useRef(loading);
  const gameStateRef = useRef(gameState);
  
  useEffect(() => {
     gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const isJustFinishedLoading = wasLoadingRef.current && !loading;

    if (!loading && !isJustFinishedLoading && player.level > prevLevelRef.current) {
      const levelsGained = player.level - prevLevelRef.current;
      triggerLevelUpEffect();
      
      if (strings && strings.logs && strings.logs.level_up) {
         for (let i = 0; i < levelsGained; i++) {
             const currentLevel = prevLevelRef.current + i + 1;
             let trans = strings.logs.level_up.replace('{level}', String(currentLevel));
             addLog(trans, 'SUCCESS');
         }
      }
      playSound('SYS_LEVELUP');
    }
    
    prevLevelRef.current = player.level;
    wasLoadingRef.current = loading;
  }, [player.level, triggerLevelUpEffect, loading, playSound, strings, addLog]);

  const defaultFists = useMemo(() => {
    if (!itemsDb || !itemsDb['fists']) return null;
    const dbItem = itemsDb['fists'];
    return {
      ...dbItem,
      id: 'fists_weapon',
      name: strings?.ui?.header?.fists || 'Fists',
      handAssetId: dbItem.handAsset,
      handFemaleAssetId: dbItem.handFemaleAsset,
      attackAssetId: dbItem.attackAsset,
      attackFemaleAssetId: dbItem.attackAssetFemale,
    } as Item;
  }, [itemsDb, strings]);

  const activeWeapon = player.equippedWeapon || defaultFists || null;
  const activeAkimboWeapon = player.equipment.weaponAkimbo || (activeWeapon?.id === 'fists_weapon' ? activeWeapon : null);
  const weaponAnimation = useWeaponAnimation(activeWeapon, activeAkimboWeapon, animations, player.characterId, spriteMap, gameState, cinematicMode, activeModal);
  const { 
      weaponStyle, akimboWeaponStyle, displayedWeapon, displayedAkimboWeapon, 
      mainHandContainerRef, akimboHandContainerRef, mapContainerRef, consoleContainerRef, mainHandImgRef, mainHandImgShadowRef, akimboHandImgRef, akimboHandImgShadowRef,
      currentHandSprite, akimboHandSprite,
      triggerWeaponAnimation, triggerSway, triggerHolster, triggerEquip, triggerSwap, resetAnimation 
  } = weaponAnimation;

  const handleDropItemFromDialogue = useCallback((item: Item) => {
      setLevelData(prev => {
          if (!prev) return prev;
          const newGrid = [...prev.grid];
          const px = Math.floor(player.pos.x);
          const py = Math.floor(player.pos.y);
          if (newGrid[py] && newGrid[py][px]) {
              newGrid[py] = [...newGrid[py]];
              newGrid[py][px] = {
                  ...newGrid[py][px],
                  items: [...(newGrid[py][px].items || []), item]
              };
          }
          return { ...prev, grid: newGrid };
      });
  }, [player.pos, setLevelData]);

  const [activeDialogueEntityId, setActiveDialogueEntityId] = useState<string | null>(null);
  const [activeDialogueEntityPos, setActiveDialogueEntityPos] = useState<{x: number, y: number} | null>(null);

  const dialogueSystem = useDialogueSystem(setGameState, settings.language, gameState, player, setPlayer, itemsDb, addLog, showToast, inventoryStats, handleDropItemFromDialogue, setPickupAnim, activeDialogueEntityPos, triggerPickupEffect, playSound, showTutorialWrapper, checkTriggersStable);
  const {
      activeDialogue, currentNode, selectedOptionIndex, startDialogue, handleInput: handleDialogueInput, handleDirectChoice, localize, getDisplayText, lastNpcText, reset: resetDialogue, resetVisitedNodes, isRadioDialogue
  } = dialogueSystem;

  const startDialogueWrapper = useCallback((id: string, npcVoice?: VoiceConfig, playerVoice?: VoiceConfig, isRadio?: boolean, entityId?: string) => {
      let foundPos = null;
      if (entityId && levelData && levelData.grid) {
          for (let y = 0; y < levelData.grid.length; y++) {
              for (let x = 0; x < levelData.grid[y].length; x++) {
                  if (levelData.grid[y][x].enemyId === entityId) {
                      foundPos = {x, y};
                  }
              }
          }
      }
      setActiveDialogueEntityId(entityId || null);
      setActiveDialogueEntityPos(foundPos);
      startDialogue(id, npcVoice, playerVoice || player.voice, isRadio);
  }, [startDialogue, player.voice, levelData]);

  const splatterSystem = useSplatterSystem(addSplatter, playSound);
  const { addSplatterWithSound } = splatterSystem;

  // Initialize Effect System (AFTER LevelSystem to get addSplatter)
  const effectSys = useEffectSystem(
      player, setPlayer, strings, addLog, playSound, setGameState, triggerDamageEffect, settings.language,
      (x, y) => addSplatterWithSound(x, y, 0, 'FLOOR', 0.7) // Bleed effect creates floor splatters
  );

  // Update Movement System to pass enemies for Aggro Check
  const handleStartCombatWrapper = (activeGroup: any[], forcedDir?: number, startWithEnemyTurn: boolean = false, ambushTargetId: string | null = null) => {
      forceCloseMapWrapper();
      startCombat(activeGroup, forcedDir, startWithEnemyTurn, ambushTargetId);
  };

  const playerPosRef = useRef({x: player.pos.x, y: player.pos.y});
  playerPosRef.current = {x: player.pos.x, y: player.pos.y};

  const triggerEnemyFlash = (x: number, y: number, intensity?: number, duration?: number, isFlashbang?: boolean) => {
      const id = Math.random();
      const dur = duration || 200;
      enemyFlashesRef.current.push({ x, y, startTime: performance.now(), id, intensity, duration: dur, isFlashbang });
      
      const distSq = (x - playerPosRef.current.x) * (x - playerPosRef.current.x) + (y - playerPosRef.current.y) * (y - playerPosRef.current.y);
      const isVisible = hasLineOfSight(playerPosRef.current, {x, y}, levelData.grid, levelData.width, levelData.height, 'PLAYER', false);
      
      if (isVisible) {
          const maxFlashStr = isFlashbang ? 2.5 : 1.5;
          const ambientIntensity = (intensity || 1.0) * maxFlashStr;
          const dist = Math.sqrt(distSq);
          const flashPower = ambientIntensity / (dist * 0.3 + 1.0); 
          if (flashPower > 0.05) {
              window.dispatchEvent(new CustomEvent('weapon-flash', { detail: Math.min(1.0, flashPower) }));
              
              setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('weapon-flash', { detail: Math.min(1.0, flashPower) * 0.5 }));
              }, 60);
              
              setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('weapon-flash', { detail: 0 }));
              }, 120);
          }
      }

      window.dispatchEvent(new CustomEvent('raycaster-look'));
      setTimeout(() => { 
          enemyFlashesRef.current = enemyFlashesRef.current.filter(f => f.id !== id); 
          window.dispatchEvent(new CustomEvent('raycaster-look'));
      }, dur);
  };

  const triggerExplosion = useCallback((x: number, y: number, assetId: string) => {
      const id = Math.random().toString(36);
      explosionsRef.current.push({ id, x, y, assetId, startTime: performance.now() });
      forceUpdate(prev => prev + 1);
      setTimeout(() => { 
          explosionsRef.current = explosionsRef.current.filter(e => e.id !== id); 
          forceUpdate(prev => prev + 1);
      }, 800);
  }, [forceUpdate]);

  // Ref to break circular dependency between CombatSystem and LevelSystem (C4 Timer)
  const handleCombatTurnRef = useRef<(() => void) | null>(null);

  const casingSystem = useCasingSystem({
      player,
      spriteMap,
      raycasterRef,
      RAYCASTER_WIDTH: raycasterWidth,
      RAYCASTER_HEIGHT: raycasterHeight
  });
  const { spawnCasing, spawnEnemyCasing } = casingSystem;

  const applyTileDamageToEntityRef = useRef<((id: string | 'PLAYER', x: number, y: number) => void)>();

  const combatSystem = useCombatSystem(
      player, setPlayer, enemies, setEnemies, playerHpRef, levelData, setLevelData, strings, addLog, setGameState, spriteMap, triggerDamageEffect,
      triggerMuzzleFlash, triggerWeaponAnimation, triggerAttackVibration, setManualReloadTrigger, 
      resetAnimation, forceUpdate, settings.debug.godMode, triggerEnemyFlash,
      (x, y) => { setPlayerDamageSource({ x, y, id: Math.random().toString(36) }); },
      playSound,
      itemsDb, 
      triggerLootDrop, 
      settings.language,
      effectSys.applyEffect, 
      effectSys.processEffects,
      () => handleCombatTurnRef.current?.(), // Pass the ref callback
      addSplatterWithSound,
      (x, y, dmg, range, assetId, gridOverride) => handleExplosion(x, y, dmg, range, assetId || 'ANIM_EXPLOSION', undefined, undefined, gridOverride),
      decorationsDb,
      spawnCasing,
      spawnEnemyCasing,
      (id, x, y) => applyTileDamageToEntityRef.current?.(id, x, y),
      checkTriggersStable,
      () => gameStateRef.current === GameState.FALLING,
      (particles) => raycasterRef.current?.spawnParticles(particles),
      activeExplosionsRef,
      showToast,
      enemiesRef,
      settings.debug.combatOverlayDebug
  );
  const {
      combat, combatRef, setCombat, combatTimerBonus, setCombatTimerBonus,
      enemyMoveAnim, setEnemyMoveAnim, visualHitIds, handleVisualHit, startCombat, 
      handleEnemiesKilled, triggerEnemyTurn, handlePlayerAttack, preparePlayerAttack, activeCombatEnemies, activeGroup, escapeDirection,
      joinCombat // NEW
  } = combatSystem;

  // Close modals automatically when combat starts
  useEffect(() => {
      if (combat.isActive) {
          setActiveModal(null);
      }
  }, [combat.isActive]);

  const playerDeath = usePlayerDeath({
      player,
      gameState,
      loading,
      combat,
      setGameState,
      setActiveModal,
      setCombat,
      resetDialogue,
      playSound,
      triggerScreenShake,
      setGameOverType
  });
  const { deathAnimProgress: realDeathAnimProgress } = playerDeath;
  const [scriptedDeathProgress, setScriptedDeathProgress] = useState(0);
  const deathAnimProgress = Math.max(realDeathAnimProgress, scriptedDeathProgress);

  const playerFall = usePlayerFall({
      player,
      gameState,
      setGameState,
      playSound,
      triggerScreenShake,
      levelData
  });
  const { fallAnimProgress } = playerFall;

  const enemySoundEffects = useEnemySoundEffects({
      levelData, player, playSound, combat, enemies
  });
  const { activeCombatIds, handleEnemyStep } = enemySoundEffects;

  // Initialize Roaming System
  const roamingSystem = useRoamingSystem(
      levelData, 
      setLevelData, 
      enemies, 
      setEnemies, 
      player, 
      combat.isActive, 
      setRoamingAnims, 
      roamingAnims,
      activeCombatIds, // Filter fighting enemies
      settings.debug.aiEnabled && gameState !== GameState.DYING, // Pass AI enabled setting
      joinCombat, // Pass Join Combat Callback
      handleEnemyStep, // Pass Sound Callback
      playSound
  );
  const { triggerRoamingTurn } = roamingSystem;

  // CHANGED: Accept optional playerPos override to handle movement prediction
  // CHANGED: Accept optional gridOverride to handle simultaneous state updates (e.g. Door Opening)
  const explosionSystem = useExplosionSystem({
      player,
      setPlayer,
      levelData,
      setLevelData,
      enemies,
      setEnemies,
      spriteMap,
      raycasterRef,
      activeExplosionsRef,
      playSound,
      triggerScreenShake,
      triggerDamageEffect,
      triggerExplosionFlash: triggerEnemyFlash,
      addLog,
      strings,
      joinCombat,
      explosionsRef,
      handleEnemiesKilled,
      animations,
      onVisualHit: handleVisualHit,
      setGameState,
      gameState,
      addSplatter: addSplatterWithSound,
      forceUpdate
  });
  const { handleExplosion } = explosionSystem;
  
  const damagedEntitiesThisTurnRef = useRef<Set<string>>(new Set());

  const applyTileDamageToEntity = useCallback((entityId: string | 'PLAYER', x: number, y: number) => {
      if (!levelData || !decorationsDb) return;
      if (damagedEntitiesThisTurnRef.current.has(entityId)) return;
      
      const w = levelData.width;
      const h = levelData.height;
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      
      const grid = levelData.grid;
      const tile = grid[y][x];
      
      const decList = tile.decorations && tile.decorations.length > 0 ? tile.decorations : (tile.decoration ? [tile.decoration] : []);
      
      for (const decObj of decList) {
          if (!decObj || !decObj.id) continue;
          const decDef = decObj.damaging !== undefined 
                       ? decObj 
                       : (decorationsDb[decObj.id] || decorationsDb[(decObj as any).type]);
                       
          if (decDef && decDef.damaging) {
              const dice = decDef.damageDice || "1d4";
              const dmg = rollDice(dice);
              
              damagedEntitiesThisTurnRef.current.add(entityId);
              
              if (entityId === 'PLAYER') {
                  if (playerHpRef.current <= 0) return;
                  playerHpRef.current -= dmg;
                  if (playerHpRef.current < 0) playerHpRef.current = 0;
                  setPlayer(prev => ({ ...prev, hp: playerHpRef.current }));
                  setPlayerDamageSource({ x, y, id: decDef.name });
                  triggerDamageEffect(true);
                  if (playerHpRef.current > 0 && player.sounds?.damage) playSound(player.sounds.damage);
                  addLog(strings?.logs?.trap_damage?.replace('{name}', localize(decDef.name))?.replace('{dmg}', dmg.toString()) || `Ранение от ловушки ${localize(decDef.name)}: ${dmg}`, 'WARNING');
              } else {
                  const enemy = enemiesRef.current.get(entityId);
                  if (!enemy || enemy.hp <= 0) return;
                  
                  setEnemies(prev => {
                      const next = new Map(prev);
                      const existingE = next.get(entityId) as any;
                      if (existingE && existingE.hp > 0) {
                          const e = { ...existingE };
                          e.hp -= dmg;
                          if (e.hp < 0) e.hp = 0;
                          next.set(entityId, e);
                      }
                      enemiesRef.current = next;
                      return next;
                  });
                  triggerEnemyFlash(x, y, 0.8, 200);
                  const isNoBleeding = (decDef as any).noBleeding;
                  handleVisualHit(isNoBleeding ? `${entityId}_NOBLEED` : entityId);
                  if (enemy.hp - dmg > 0 && enemy.sounds?.damage) playSound(enemy.sounds.damage, {x, y});
                  
                  if (enemy.hp - dmg <= 0) {
                      if (strings) addLog(strings.logs.enemy_killed_trap?.replace('{enemy}', enemy.name)?.replace('{trap}', localize(decDef.name)) || `${enemy.name} погибает в ${localize(decDef.name)}!`, 'SUCCESS');
                      handleEnemiesKilled([{ id: entityId, cause: decDef.type || decDef.id }], false, (decObj as any).createdByPlayer === true);
                  }
              }
          }
      }
  }, [levelData, decorationsDb, enemies, strings, playSound, addLog, triggerDamageEffect, handleVisualHit, handleEnemiesKilled, localize]);

  useEffect(() => {
      applyTileDamageToEntityRef.current = applyTileDamageToEntity;
  }, [applyTileDamageToEntity]);

  const prevFlashlightAmmoRef = useRef<{ [id: string]: number }>({});
  const flashlightDischargeCountersRef = useRef<{ [id: string]: number }>({});
  
  useEffect(() => {
      player.inventory.forEach(item => {
          if (item.type === 'FLASHLIGHT') {
              const prevAmmo = prevFlashlightAmmoRef.current[item.id] ?? item.currentAmmo ?? 0;
              const currentAmmo = item.currentAmmo ?? 0;
              if (prevAmmo > 0 && currentAmmo <= 0) {
                  addLog(strings?.logs?.flashlight_drained?.replace('{name}', localize(item.name)) || `Фонарик ${localize(item.name)} разрядился`, "WARNING");
              }
              prevFlashlightAmmoRef.current[item.id] = currentAmmo;
          }
      });
  }, [player.inventory, addLog, strings, localize]);

  const dischargeActiveBatteries = useCallback(() => {
      setPlayer(prev => {
          let inventoryChanged = false;
          let equipmentChanged = false;
          const nextEquipment = { ...prev.equipment };
          
          const isItemEquipped = (id: string) => {
              for (const key of Object.keys(nextEquipment)) {
                  if (nextEquipment[key as keyof typeof nextEquipment]?.id === id) {
                      return key as keyof typeof nextEquipment;
                  }
              }
              return null;
          };

          const updatedInventory = prev.inventory.map(item => {
              const equipSlot = isItemEquipped(item.id);
              // Если предмет экипируется, он должен разряжаться просто будучи в слоте экипировки.
              // Если это не экипируемый предмет, то тогда должен разряжаться пока он включен (isActive === true).
              const isEquippable = item.equip && item.equip !== 'NONE';
              const isCurrentlyActive = isEquippable ? (equipSlot !== null) : !!item.isActive;

              if (item.powerSource && isCurrentlyActive) {
                  // Если скорость разряда не указана или равна 0, используем стандартное значение 1
                  const rate = item.dischargeRate && item.dischargeRate > 0 ? item.dischargeRate : 1;
                  let currentAmmo = item.currentAmmo ?? 0;
                  if (currentAmmo > 0) {
                      let dc = (flashlightDischargeCountersRef.current[item.id] ?? item.dischargeCounter ?? 0) + 1;
                      if (dc >= rate) {
                          dc = 0;
                          currentAmmo -= 1;
                          inventoryChanged = true;
                          flashlightDischargeCountersRef.current[item.id] = 0;
                          if (currentAmmo <= 0) {
                              currentAmmo = 0;
                          }
                          const newItem = { 
                              ...item, 
                              dischargeCounter: 0, 
                              currentAmmo,
                              isActive: currentAmmo > 0 ? (item.type === 'FLASHLIGHT' ? true : item.isActive) : false
                          };
                          if (equipSlot) {
                              nextEquipment[equipSlot] = newItem as any;
                              equipmentChanged = true;
                          }
                          
                          if (currentAmmo <= 0) {
                              addLog(strings?.logs?.flashlight_drained?.replace('{name}', localize(item.name)) || `${localize(item.name)} разрядился`, "WARNING");
                          }
                          return newItem;
                      } else {
                          flashlightDischargeCountersRef.current[item.id] = dc;
                          const newItem = {
                              ...item,
                              dischargeCounter: dc
                          };
                          if (equipSlot) {
                              nextEquipment[equipSlot] = newItem as any;
                              equipmentChanged = true;
                          }
                          inventoryChanged = true;
                          return newItem;
                      }
                  }
              }
              return item;
          });
          
          if (inventoryChanged || equipmentChanged) {
              return { ...prev, inventory: updatedInventory, equipment: nextEquipment };
          }
          return prev;
      });
  }, [setPlayer, addLog, strings, localize]);

  const lastPlayerPosRef = useRef({ x: player.pos.x, y: player.pos.y });
  const prevLevelPathRef = useRef<string | null>(null);

  useEffect(() => {
      if (loading || prevLevelPathRef.current !== currentLevelPath) {
          prevLevelPathRef.current = currentLevelPath;
          lastPlayerPosRef.current = { x: player.pos.x, y: player.pos.y };
          return;
      }

      const prev = lastPlayerPosRef.current;
      const curr = player.pos;

      const dx = Math.abs(curr.x - prev.x);
      const dy = Math.abs(curr.y - prev.y);

      lastPlayerPosRef.current = { x: curr.x, y: curr.y };

      const isStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
      if (isStep) {
          dischargeActiveBatteries();
      }
  }, [player.pos.x, player.pos.y, loading, currentLevelPath, dischargeActiveBatteries]);

  const applyTileDamage = useCallback((playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => {
      if (!levelData || !decorationsDb) return;
      const grid = gridOverride || levelData.grid;
      const pPos = playerPosOverride || player.pos;
      const w = levelData.width;
      const h = levelData.height;

      // Check player
      const px = Math.round(pPos.x);
      const py = Math.round(pPos.y);
      if (px >= 0 && px < w && py >= 0 && py < h && playerHpRef.current > 0 && !damagedEntitiesThisTurnRef.current.has('PLAYER')) {
          const tile = grid[py][px];
          if (tile.decoration && tile.decoration.id) {
              const decDef = tile.decoration.damaging !== undefined 
                           ? tile.decoration 
                           : (decorationsDb[tile.decoration.id] || decorationsDb[tile.decoration.type]);
              
              if (decDef && decDef.damaging) {
                  const dice = decDef.damageDice || "1d4";
                  const dmg = rollDice(dice);
                  
                  damagedEntitiesThisTurnRef.current.add('PLAYER');
                  
                  playerHpRef.current -= dmg;
                  if (playerHpRef.current < 0) playerHpRef.current = 0;
                  setPlayer(prev => ({ ...prev, hp: playerHpRef.current }));
                  setPlayerDamageSource({ x: px, y: py, id: decDef.name });
                  triggerDamageEffect(true);
                  if (playerHpRef.current > 0 && player.sounds && player.sounds.damage) playSound(player.sounds.damage);
                  if (dmg > 0) addLog(strings?.logs?.trap_damage?.replace('{name}', localize(decDef.name))?.replace('{dmg}', dmg.toString()) || `Ранение от ловушки ${localize(decDef.name)}: ${dmg} урона.`, 'WARNING');
              }
          }
      }

      // Check enemies by scanning the grid for damaging tiles
      const enemiesToAggro: string[] = [];
      const killedByPlayerThisTurn: { id: string, cause: string }[] = [];
      const killedByEnvThisTurn: { id: string, cause: string }[] = [];
      
      // Process Enemy status эффекты удалены отсюда, так как они должны уменьшаться только раз за ход, а не каждый рендер.
      // (The previous implementation was trapped in a render loop where any enemy change triggered the effect and decayed flash instantly)
      
      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const tile = grid[y][x];
              if (tile.enemyId && tile.decoration && tile.decoration.id) {
                  const enemyId = tile.enemyId;
                  if (damagedEntitiesThisTurnRef.current.has(enemyId)) continue;
                  
                  const enemy = enemiesRef.current.get(enemyId);
                  if (!enemy || enemy.hp <= 0) continue;

                  const decDef = tile.decoration.damaging !== undefined 
                           ? tile.decoration 
                           : (decorationsDb[tile.decoration.id] || decorationsDb[tile.decoration.type]);
                           
                  if (decDef && decDef.damaging) {
                      const dice = decDef.damageDice || "1d4";
                      const dmg = rollDice(dice);
                      
                      damagedEntitiesThisTurnRef.current.add(enemyId);
                      
                      setEnemies(prev => {
                          const next = new Map(prev);
                          const existingE = next.get(enemyId) as any;
                          if (existingE && existingE.hp > 0) {
                              const e = { ...existingE };
                              e.hp -= dmg;
                              if (e.hp < 0) e.hp = 0;
                              next.set(enemyId, e);
                          }
                          enemiesRef.current = next;
                          return next;
                      });
                      
                      triggerEnemyFlash(x, y, 0.8, 200);
                      const isNoBleeding = (decDef as any).noBleeding;
                      handleVisualHit(isNoBleeding ? `${enemyId}_NOBLEED` : enemyId);
                      if (enemy.hp - dmg > 0 && enemy.sounds && enemy.sounds.damage) playSound(enemy.sounds.damage, {x, y});

                      if (enemy.hp - dmg <= 0) {
                           if (strings) addLog(strings.logs.enemy_killed_trap?.replace('{enemy}', enemy.name)?.replace('{trap}', localize(decDef.name)) || `${enemy.name} погибает в ${localize(decDef.name)}!`, 'SUCCESS');
                           if (tile.decoration.createdByPlayer) {
                               killedByPlayerThisTurn.push({ id: enemyId, cause: decDef.type || decDef.id });
                           } else {
                               killedByEnvThisTurn.push({ id: enemyId, cause: decDef.type || decDef.id });
                           }
                      } else if (tile.decoration.createdByPlayer) {
                           if (!enemiesToAggro.includes(enemyId)) {
                               enemiesToAggro.push(enemyId);
                           }
                      }
                  }
              }
          }
      }
      
      if (killedByPlayerThisTurn.length > 0) {
          handleEnemiesKilled(killedByPlayerThisTurn, false, true);
      }
      
      if (killedByEnvThisTurn.length > 0) {
          handleEnemiesKilled(killedByEnvThisTurn, false, false);
      }
      
      if (enemiesToAggro.length > 0) {
          let aggroIds = [...enemiesToAggro];
          const otherAggroIds = findEnemiesWithLineOfSight(player.pos, grid, w, h);
          for (const id of otherAggroIds) {
              if (!aggroIds.includes(id)) {
                  aggroIds.push(id);
              }
          }
          
          if (!combatSystem.combat.isActive) {
              handleStartCombatWrapper(aggroIds.map(id => ({ id, alignment: 'CENTER' })), undefined, true);
          } else if (combatSystem.joinCombat && combatSystem.combatRef.current) {
              const newEnemies = aggroIds.filter(id => !combatSystem.combatRef.current.activeGroup.some(g => g.id === id));
              if (newEnemies.length > 0) {
                  combatSystem.joinCombat(newEnemies);
              }
          }
      }
      
      damagedEntitiesThisTurnRef.current.clear();
      
  }, [levelData, decorationsDb, player.pos, player.inventory, setPlayer, localize, enemies, playSound, addLog, setGameState, triggerDamageEffect, strings, handleVisualHit, combatSystem, handleStartCombatWrapper]);

  // Reaper Effect: Safely catch any enemies that reached 0 HP but missed the death event.
  // This serves as an ultimate fallback guard against "ghosts".
  useEffect(() => {
      if (!levelData?.grid || !enemies) return;
      const ghostIds: string[] = [];
      enemies.forEach((enemy, id) => {
          if (enemy.hp <= 0) ghostIds.push(id);
      });
      if (ghostIds.length > 0) {
          const ghostsOnGrid = ghostIds.filter(id => levelData.grid.some((row: any[]) => row.some((t: any) => t.enemyId === id)));
          if (ghostsOnGrid.length > 0) {
              console.warn("[System] Reaper caught ghosts on grid:", ghostsOnGrid);
              handleEnemiesKilled(ghostsOnGrid, false, false);
          }
      }
  }, [enemies, levelData, handleEnemiesKilled]);

  const gameTurns = useGameTurns({
      combat,
      triggerRoamingTurn,
      tickExplosives,
      handleExplosion,
      onTurnStart: applyTileDamage,
      activeExplosionsRef,
      processEffects: effectSys.processEffects
  });
  const { handleGameTurn, handleCombatTurnWrapper, handleGameTurnWrapper } = gameTurns;

  // Sync the ref
  useEffect(() => {
      handleCombatTurnRef.current = handleCombatTurnWrapper;
  }, [handleCombatTurnWrapper]);

  const toggleRadioRef = useRef<((item: any, isDialogueTrigger?: boolean) => Promise<void>) | null>(null);
  const [isActionBlocked, setIsActionBlocked] = useState(false);

  const onRadioTrigger = useCallback(async (item: any) => {
      setIsActionBlocked(true);
      if (toggleRadioRef.current) {
          await toggleRadioRef.current(item, true);
      }
      setIsActionBlocked(false);
      setGameState(GameState.DIALOGUE); 
  }, [setGameState]);

  // BEEP LOGIC FOR C4
  useC4BeepSystem(levelData, playSound, gameState);

  const checkIsPaused = () => {
    return !!((activeModal !== null && activeModal !== 'actions' && activeModal !== 'loot' && activeModal !== 'inspect' && activeModal !== 'inspect_anim') || showPauseMenu || showSettings || showDebug || showVolume);
  };
  const isPausedRef = useRef(checkIsPaused());
  useEffect(() => { isPausedRef.current = checkIsPaused(); }, [activeModal, showPauseMenu, showSettings, showDebug, showVolume]);

  // SCRIPT SYSTEM
  const scriptSystem = useScriptSystem(
      player, setPlayer, levelData, setLevelData, enemies, setEnemies, 
      addLog, playSound, startDialogueWrapper, showToast, strings, localize, onRadioTrigger,
      setCinematicMode, setCinematicCamera, isPausedRef, raycasterRef, showTutorialWrapper,
      setGameState, triggerScreenShake, setScriptedDeathProgress, handleExplosion, setScreamer,
      setSkyTexture, spriteMap, playMusic, pauseMusic, resumeMusic, stopMusic, setGameOverType, unlockAchievement
  );

  useEffect(() => {
      checkTriggersRef.current = scriptSystem.checkTriggers;
  }, [scriptSystem.checkTriggers]);

  const lastMapLoadedRef = useRef<string | null>(null);
  useEffect(() => {
      if (!loading && levelData && currentLevelPath !== lastMapLoadedRef.current) {
          lastMapLoadedRef.current = currentLevelPath;
          scriptSystem.checkTriggers('ON_MAP_LOAD', {});
      }
  }, [loading, levelData, currentLevelPath, scriptSystem.checkTriggers]);

  const handleInspect = useCallback((text: string, isEnemy: boolean = false, isCorpse: boolean = false, distance: number = 1) => {
      let targetPitch = isEnemy ? 0.45 : -0.6; // чуть сильнее наклоняемся (-0.6 вниз, 0.45 вверх)
      if (isCorpse) {
          targetPitch = distance <= 1 ? -0.8 : -0.6;
      }
      const duration = 400; // ms
      const startTime = performance.now();
      
      setActiveModal('inspect_anim');
      
      const animatePitch = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Easing function (easeOutCubic)
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          setLookAroundPitch(targetPitch * easeProgress);

          if (progress < 1) {
              requestAnimationFrame(animatePitch);
          } else {
              setInspectText(text);
              setActiveModal('inspect');
          }
      };
      
      requestAnimationFrame(animatePitch);
  }, [setLookAroundPitch, setInspectText, setActiveModal]);

  const handleRemoteInspect = useCallback((text: string, isEnemy: boolean = false, distance: number = 1, isCorpse: boolean = false) => {
      if (distance <= 1) {
          handleInspect(text, isEnemy, isCorpse, distance);
      } else {
          setActiveModal('inspect_anim');
          const targetZoom = 0.25; // Amount of FOV reduction
          const targetPitch = isCorpse ? -0.6 : 0;
          const duration = 400; // ms
          const startTime = performance.now();
          
          const animateZoom = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = 1 - Math.pow(1 - progress, 3);
              setInspectZoom(targetZoom * easeProgress);
              if (targetPitch !== 0) {
                  setLookAroundPitch(targetPitch * easeProgress);
              }

              if (progress < 1) {
                  requestAnimationFrame(animateZoom);
              } else {
                  setInspectText(text);
                  setActiveModal('inspect');
              }
          };
          
          requestAnimationFrame(animateZoom);
      }
  }, [setInspectText, setActiveModal, handleInspect, setInspectZoom, setLookAroundPitch]);

  const inspectingSys = useInspectingSystem({
      player, setPlayer, levelData, gameState, setGameState, strings, addLog,
      enemiesDb, decorationsDb, itemsDb, enemies,
      onInspect: handleRemoteInspect,
      setLookAroundAngle,
      lookAroundAngle,
      lookAroundAngleRef,
      language: settings.language
  });

  useEffect(() => {
      // Animate zoom back out if modal is closed and we have zoom
      if (activeModal !== 'inspect' && activeModal !== 'inspect_anim' && inspectZoom > 0) {
          let frameId: number;
          const duration = 300;
          const startZoom = inspectZoom;
          const startTime = performance.now();
          
          const animateOut = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeProgress = 1 - Math.pow(1 - progress, 3);
              setInspectZoom(startZoom * (1 - easeProgress));

              if (progress < 1) {
                  frameId = requestAnimationFrame(animateOut);
              } else {
                  setInspectZoom(0);
              }
          };
          frameId = requestAnimationFrame(animateOut);
          return () => cancelAnimationFrame(frameId);
      }
  }, [activeModal]); // purposely omitting inspectZoom to prevent re-triggering during its own animation

  // MOVEMENT SYSTEM (Now gets enemies map)
  const currentMovementSys = useMovementSystem(
    player, setPlayer, levelData, setLevelData, strings, addLog, gameState, combatRef,
    loading, viewportFade, raycasterRef, triggerDamageEffect, handleStartCombatWrapper, loadLevel,
    triggerSway, activeModal, setActiveModal, setLootData, setPickupAnim, triggerPickupEffect, inventoryStats,
    playSound, currentLevelPath, forceCloseMapWrapper, 
    handleRevealFogOfWarBatch,
    startDialogueWrapper,
    effectSys.processEffects,
    handleGameTurnWrapper,
    enemies, 
    settings.debug.aiEnabled,
    triggerEnemyTurn, // PASS COMBAT TURN TRIGGER
    joinCombat,
    showToast,
    applyTileDamageToEntity,
    onRadioTrigger,
    scriptSystem.checkTriggers,
    inspectingSys.startInspectMode,
    settings.debug.noclip,
    setBoxMoveAnims,
    itemsDb
  );

  const revealFogOfWarFromPlayerRef = useRef(currentMovementSys.revealFogOfWarFromPlayer);
  useEffect(() => {
      revealFogOfWarFromPlayerRef.current = currentMovementSys.revealFogOfWarFromPlayer;
  }, [currentMovementSys.revealFogOfWarFromPlayer]);

  // Re-bind level system reveal to movement system's logic to immediately reveal the map when a sector loads or transitions
  useEffect(() => {
      if (levelData && revealFogOfWarFromPlayerRef.current) {
          revealFogOfWarFromPlayerRef.current(playerPosRef.current.x, playerPosRef.current.y);
      }
  }, [levelData]);

  const inventorySys = useInventorySystem(
    player, setPlayer, strings, addLog, combat, gameState,
    triggerEnemyTurn, setActiveModal, totalAmmoInInventory, inventoryStats,
    playSound, setGameState, manualReloadTrigger, setManualReloadTrigger,
    { triggerHolster, triggerEquip, triggerSwap }, 
    levelData, setLevelData,
    itemsDb, 
    settings.language,
    effectSys.applyEffect,
    handleGameTurnWrapper,
    plantExplosive,
    casingSystem.spawnReloadCasings
  );
  inventorySysRef.current = inventorySys;

  useEffect(() => {
     toggleRadioRef.current = inventorySys.toggleRadioMode;
  }, [inventorySys.toggleRadioMode]);

  const wasInDialogueRef = useRef(false);
  useEffect(() => {
     if (activeDialogue) {
        wasInDialogueRef.current = true;
     } else if (wasInDialogueRef.current) {
        wasInDialogueRef.current = false;
        if (player.equippedWeapon?.type === 'RADIO') {
            inventorySys.forceHideRadio();
        }
     }
  }, [activeDialogue, player.equippedWeapon, inventorySys]);

  useAudioOrchestrator({
      gameState, loading, combat, levelData, player, settings, activeModal,
      playSound, stopSound, stopAllSounds, playMusic, playWeather, showIntroVideo, updateSoundPosition, initContext,
      enemies,
      cinematicMode,
      cinematicCamera
  });

  const initAudio = () => {
      initContext().then(res => {
          if (res) initVoice(res.ctx, res.voiceBus).catch(console.warn);
      }).catch(console.warn);
  };

  const aimingSys = useAimingSystem({
      player, activeWeapon, setPlayer, levelData, gameState, setGameState, strings, addLog, startCombat: handleStartCombatWrapper,
      handlePlayerAttack,
      preparePlayerAttack: preparePlayerAttack,
      triggerMuzzleFlash,
      onTakeTurn: handleGameTurnWrapper,
      isCombatActive: combat.isActive,
      showToast,
      playSound,
      enemies
  });

  const throwingSys = useThrowingSystem({
      player, setPlayer, levelData, setLevelData, enemies, setEnemies, gameState, setGameState, strings, addLog, startCombat: handleStartCombatWrapper,
      onEnemiesKilled: handleEnemiesKilled, setThrowAnim, isCombatActive: combat.isActive, triggerEnemyTurn, onVisualHit: handleVisualHit,
      playSound, setCombat, combatRef, triggerExplosion, triggerDamageEffect, triggerFlash: triggerMuzzleFlash, triggerExplosionFlash: triggerEnemyFlash, triggerScreenShake,
      onTakeTurn: handleGameTurn, // PASS TURN HANDLER FOR NON-COMBAT THROWS
      inventoryStats,
      getAuxBuffers: () => raycasterRef.current?.getAuxBuffers(),
      onSpawnParticles: (p) => raycasterRef.current?.spawnParticles(p),
      onExplodeLogic: (x, y, damage, range, assetId, soundId, itemType, itemDuration) => handleExplosion(x, y, damage, range, assetId, undefined, undefined, undefined, undefined, soundId, itemType, itemDuration),
      joinCombat,
      decorationsDb,
      spriteMap
  });

  const targetThrowPitchRef = useRef(0);
  const wasInThrowingStateRef = useRef(false);

  useEffect(() => {
    let active = true;
    let animFrame: number;

    const tick = () => {
      if (!active) return;

      const currentPitch = lookAroundPitchRef.current;
      const currentGameState = gameStateRef.current;

      if (currentGameState === GameState.THROWING) {
        // Enforce smooth transition to the throwing target pitch
        const targetPitch = targetThrowPitchRef.current;
        const diff = targetPitch - currentPitch;

        if (Math.abs(diff) > 0.005) {
          // Clamp step to Math.abs(diff) to prevent overshoot and feedback loop oscillations
          const rawStep = Math.min(0.08, Math.max(0.012, Math.abs(diff) * 0.16));
          const step = Math.min(Math.abs(diff), rawStep);
          const nextPitch = currentPitch + Math.sign(diff) * step;
          setLookAroundPitch(nextPitch);
        } else if (currentPitch !== targetPitch) {
          setLookAroundPitch(targetPitch);
        }
        wasInThrowingStateRef.current = true;
      } else if (wasInThrowingStateRef.current) {
        // Smoothly return pitch to 0 after throwing/aiming
        const targetPitch = 0;
        const diff = targetPitch - currentPitch;

        if (Math.abs(diff) > 0.005) {
          // Clamp step to Math.abs(diff) to prevent overshoot and feedback loop oscillations
          const rawStep = Math.min(0.08, Math.max(0.012, Math.abs(diff) * 0.16));
          const step = Math.min(Math.abs(diff), rawStep);
          const nextPitch = currentPitch + Math.sign(diff) * step;
          setLookAroundPitch(nextPitch);
        } else {
          setLookAroundPitch(0);
          wasInThrowingStateRef.current = false;
        }
      }

      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(animFrame);
    };
  }, [setLookAroundPitch, lookAroundPitchRef]);

  useEffect(() => {
    if (gameState === GameState.THROWING && throwingSys.targetCoords && levelData) {
      const playerX = player.pos.x;
      const playerY = player.pos.y;
      const targetX = throwingSys.targetCoords.x;
      const targetY = throwingSys.targetCoords.y;

      const dx = targetX - playerX;
      const dy = targetY - playerY;
      const d = Math.max(1.0, Math.sqrt(dx * dx + dy * dy));

      const playerTile = levelData.grid?.[Math.round(playerY)]?.[Math.round(playerX)];
      const playerLevel = playerTile?.type === 'FLOOR' && playerTile.height !== undefined && playerTile.height < 0 ? playerTile.height : 0;

      const targetTile = levelData.grid?.[Math.round(targetY)]?.[Math.round(targetX)];
      const targetLevel = targetTile?.type === 'FLOOR' && targetTile.height !== undefined && targetTile.height < 0 ? targetTile.height : 0;

      const diff = targetLevel - playerLevel;
      if (diff < 0) {
        // Advanced math formula for vertical alignment of floor points in perspective projection
        // We calculate precise tilt: tilt = - H_diff / distance
        const rawPitch = - 1.8 * (0.5 - diff) / d;
        // Clamp to a natural, stable viewing angle
        const targetPitch = Math.max(-1.5, Math.min(0, rawPitch));
        targetThrowPitchRef.current = targetPitch;
      } else {
        targetThrowPitchRef.current = 0;
      }
    } else {
      targetThrowPitchRef.current = 0;
    }
  }, [gameState, throwingSys.targetCoords, player.pos, levelData]);

  const isSystemMenuOpen = showPauseMenu || showSettings || showDebug || showVolume || !!activeTutorial;
  const isBlockingModal = activeModal === 'inventory' || activeModal === 'stats' || activeModal === 'equipment';
  const isBlockingInteraction = isActionBlocked || viewportFade > 0 || !!throwAnim || gameState === GameState.DIALOGUE || gameState === GameState.DYING || gameState === GameState.FALLING || activeModal === 'keypad' || activeModal === 'inspect_anim' || cinematicMode || isBlockingModal;
  const disableMovement = isSystemMenuOpen || isBlockingInteraction || combat.isProcessingTurn || gameState === GameState.CONSOLE_VIEW;
  const disableWalking = disableMovement || (explosionsRef.current && explosionsRef.current.length > 0) || (activeExplosionsRef && activeExplosionsRef.current > 0);
  const disableActions = isSystemMenuOpen || (isBlockingInteraction && activeModal !== 'keypad');

  const engineContext = useRef<{ toggleModal?: (m: any) => void; handleSkipTurn?: () => void }>({});
  const toggleModalWrapper = useCallback((modal: any) => {
      engineContext.current?.toggleModal?.(modal);
  }, []);
  const handleSkipTurnWrapper = useCallback(() => {
      engineContext.current?.handleSkipTurn?.();
  }, []);

  const inputController = useInputController({
      gameState, loading, viewportFade, player, activeWeapon, levelData, strings, combat,
      inventorySys, currentMovementSys, aimingSys, throwingSys, inspectingSys, dialogueSys: { handleInput: handleDialogueInput },
      addLog, toggleModal: toggleModalWrapper, setShowPauseMenu, handleSkipTurn: handleSkipTurnWrapper,
      lookAroundAngle, setLookAroundAngle, lookAroundPitch, setLookAroundPitch, setGameState, activeModal, disableMovement, disableWalking, settings,
      enemies
  });
  const { 
  
      handleTouchStart, handleTouchMove, handleTouchEnd, 
      canAim, availableActionsCount, 
      handleAimInputWithAnim, handleThrowInputWithAnim, handleInspectInputWithAnim, handleShootWrapper,
      handleToggleLook 
  } = inputController;

  useLayoutEffect(() => {
    if (loading && loadingLogRef.current) {
      const el = loadingLogRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [loadingLogs, loading, isWaitingToStart]);

  useLocalizationUpdate({
      isGameInitialized, strings, levelData, currentLevelPath, settings, loadLevel, setPlayer, player
  });

  const onMenuStart = () => { setGameState(GameState.CHAR_SELECT); };

  const gameLifecycle = useGameLifecycle({
      strings, settings, setSettings, setGameState, setLoading, setLoadingProgress,
      setLoadingLogs, setViewportFade, setEnemies, setCombat, aimingSys,
      setCombatTimerBonus, setManualReloadTrigger, setIsWaitingToStart, setPlayerDamageSource,
      enemyFlashesRef, explosionsRef, setLootData, setPickupAnim, setThrowAnim, clearCasingParticles,
      setLoadingMessage, preloadAllAssets, sounds, loadSound, prepareStream, enemiesDb, npcsDb, decorationsDb,
      masterSpriteMapRef, setSpriteMap, initialPlayerStateRef, itemsDb, setPlayer, setDelayedHp, loadLevel,
      isTransitioningToMenu, setIsTransitioningToMenu, setShowIntroVideo, loading, isWaitingToStart,
      resetDialogue, resetVisitedNodes, clearLog, setShowPauseMenu, setShowSettings, setShowDebug, setShowVolume,
      setActiveModal, showPauseMenu, showSettings, showDebug, showVolume, combat, gameState, availableActionsCount,
      addLog, activeWeapon, activeAkimboWeapon, weaponRef, akimboWeaponRef, triggerSwap, activeModal, currentMovementSys,
      triggerEnemyTurn, loadImage, sectorStatesRef, mapSnapshotsRef, setRoamingAnims, setCurrentLevelPath, clearExploredTiles,
      setLevelData, playSound, restoreDecals: levelSystem.restoreDecals,
      setLookAroundAngle, setLookAroundPitch, setInspectZoom, setCinematicCamera, setCinematicMode,
      globalScriptFlagsRef
  });
  const {
      initializeGameSystems,
      startAudioAndGame,
      handleVideoEnd,
      handleSkipTurn,
      finalizeGameStart,
      loadSavedGame,
      finalizeLevelLoad,
      returnToMenu,
      returnToEditor,
      toggleModal
  } = gameLifecycle;

  engineContext.current.toggleModal = toggleModal;
  engineContext.current.handleSkipTurn = handleSkipTurn;

  const dialogueNPC = useDialogueNPC(
      gameState, activeDialogue, levelData, npcsDb, enemies, localize, activeDialogueEntityId
  );
  const { dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId, dialogueNPCVoice } = dialogueNPC;

  const currentLight = levelData?.lightMap?.[Math.floor(player.pos.y)]?.[Math.floor(player.pos.x)] || { r: 1.0, g: 1.0, b: 1.0 };
  const currentBrightness = (currentLight.r + currentLight.g + currentLight.b) / 3;

  const highlightedTiles = useHighlightedTiles({
      gameState, aimingSys, throwingSys
  });
  const { currentHighlightedTiles } = highlightedTiles;

  const combatActions = useCombatActions({
      strings, levelData, player, setPlayer, combat, setCombat, setGameState, addLog, triggerEnemyTurn, escapeDirection, inventorySys
  });
  const { handleEscapeResult, handleCombatTimeout, handleReloadResult } = combatActions;

  const weaponRendering = useWeaponRendering({
      gameState, combat, player, activeWeapon, currentHandSprite, akimboHandSprite,
      weaponStyle, akimboWeaponStyle, currentLight, currentLevelPath, throwingSys,
      deathAnimProgress
  });
  const {
      getTintMatrix, mainTintId, akimboTintId, handStyleFinal, akimboHandStyleFinal, brokenTransform, akimboBrokenTransform,
      brokenTransition, showWeaponHand, isWeaponBroken, isAkimboWeaponBroken, isMapView, activeMapItem
  } = weaponRendering;

  useEffect(() => {
    if (combat.isActive) {
        if (gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW) {
            inventorySys.forceCloseMap();
        }
        if (activeModal === 'location') {
            setActiveModal(null);
        }
    }
  }, [combat.isActive, gameState, activeModal, inventorySys, setActiveModal]);

  return {
      // Global State
      globalState,
      gameState, setGameState, settings, setSettings, activeModal, setActiveModal,
      inspectText, setInspectText,
      showPauseMenu, setShowPauseMenu, showSettings, setShowSettings, showDebug, setShowDebug,
      showVolume, setShowVolume, lootData, setLootData, enemies, setEnemies,
      enemyFlashesRef, playerDamageSource, setPlayerDamageSource,
      explosionsRef, isTransitioningToMenu, setIsTransitioningToMenu,
      showIntroVideo, setShowIntroVideo, isVideoReady, setIsVideoReady,
      manualReloadTrigger, setManualReloadTrigger, playerReflectionSprite, setPlayerReflectionSprite,
      forceUpdate, mapSnapshotsRef, inventorySysRef, raycasterRef, activeExplosionsRef, sectorStatesRef,
      roamingAnims, setRoamingAnims, boxMoveAnims, setBoxMoveAnims, raycasterWidth, raycasterHeight, resolutionDivisor, weaponRef, akimboWeaponRef,
      pickupAnim, setPickupAnim, throwAnim, setThrowAnim,

      // Layout
      layout, isLandscape, headerHeight, iframeTopOffset,

      // Player System
      playerSystem, player, setPlayer, playerHpRef, inventoryStats, totalAmmoInInventory, gainLevel,

      // Toast
      toastSystem, toasts, showToast,

      // Loot
      lootSystem, lootAnims, triggerLootDrop,

      // Log
      addLog, clearLog,

      // Asset Loader
      assetLoader, strings, loading, setLoading, loadingMessage, setLoadingMessage, 
      loadingProgress, setLoadingProgress, loadingLogs, setLoadingLogs,
      isTransitionLoading, setIsTransitionLoading,
      isWaitingToStart, setIsWaitingToStart, isGameInitialized, masterSpriteMapRef,
      spriteMap, setSpriteMap, loadingLogRef, initialPlayerStateRef, animations, sounds,
      enemiesDb, npcsDb, decorationsDb, particlesDb, itemsDb,

      // Player Equipment Effects
      playerEquipmentEffects, isFlashlightOn, flashlightBatteryRatio, almostBrokenSlots,

      // Level System
      levelSystem, levelData, setLevelData, currentLevelPath, setCurrentLevelPath,
      wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
      viewportFade, setViewportFade, loadLevel, markTileAsExplored, markTilesAsExploredBatch, addSplatter, addShardDecal, getCurrentDecalEvents, customWallBuffers, customFloorBuffers,
      plantExplosive, tickExplosives,

      // Sound System
      soundSystem, playSound, stopSound, stopAllSounds, playMusic, pauseMusic, resumeMusic, stopMusic, playWeather, loadSound, initContext, prepareStream, updateSoundPosition,

      // Visual Effects
      visualEffects, delayedHp, setDelayedHp, showLevelUpText, shakeEvent: shakeEventRef, shakeEventRef, muzzleFlashIntensityRef,
      triggerDamageEffect, triggerPickupEffect, triggerLevelUpEffect, triggerMuzzleFlash, triggerScreenShake, triggerAttackVibration, isLowHealth,

      // Weapon Animation
      weaponAnimation, activeWeapon, activeAkimboWeapon, weaponStyle, akimboWeaponStyle, displayedWeapon, displayedAkimboWeapon, 
      mainHandContainerRef, akimboHandContainerRef, mapContainerRef, consoleContainerRef, mainHandImgRef, mainHandImgShadowRef, akimboHandImgRef, akimboHandImgShadowRef,
      triggerWeaponAnimation, triggerSway, triggerHolster, triggerEquip, triggerSwap, resetAnimation,

      activeTutorial, setActiveTutorial,
      // Dialogue System
      dialogueSystem, activeDialogue, currentNode, selectedOptionIndex, startDialogue, handleDialogueInput, handleDirectChoice, localize, getDisplayText, lastNpcText, resetDialogue, resetVisitedNodes, isRadioDialogue,

      // Splatter System
      splatterSystem, addSplatterWithSound,

      // Effect System
      effectSys,

      // Casing System
      casingSystem, spawnCasing, spawnEnemyCasing,

      // Combat System
      combatSystem, combat, combatRef, setCombat, combatTimerBonus, setCombatTimerBonus,
      enemyMoveAnim, setEnemyMoveAnim, visualHitIds, handleVisualHit, startCombat, 
      handleEnemiesKilled, triggerEnemyTurn, handlePlayerAttack, preparePlayerAttack, activeCombatEnemies, activeGroup, escapeDirection,
      joinCombat,

      // Player Death & Fall
      playerDeath, deathAnimProgress,
      playerFall, fallAnimProgress,

      // Enemy Sound Effects
      enemySoundEffects, activeCombatIds, handleEnemyStep,

      // Roaming System
      roamingSystem, triggerRoamingTurn,

      // Explosion System
      explosionSystem, handleExplosion,

      // Game Turns
      gameTurns, handleGameTurn, handleCombatTurnWrapper, handleGameTurnWrapper,

      // Movement System
      currentMovementSys,

      // Inventory System
      inventorySys,

      // Aiming System
      aimingSys,

      // Throwing System
      throwingSys,

      // Inspecting System
      inspectingSys,

      // Input Controller
      inputController, handleTouchStart, handleTouchMove, handleTouchEnd, 
      handlePointerDown: inputController.handlePointerDown, handlePointerMove: inputController.handlePointerMove, handlePointerUp: inputController.handlePointerUp, handleContextMenu: inputController.handleContextMenu,
      canAim, availableActionsCount, 
      handleAimInputWithAnim, handleThrowInputWithAnim, handleInspectInputWithAnim, handleShootWrapper, handleToggleLook,
      lookAroundAngle, setLookAroundAngle, lookAroundPitch, setLookAroundPitch, lookAroundAngleRef, lookAroundPitchRef, inspectZoom,

      // Game Lifecycle
      gameLifecycle, initializeGameSystems, startAudioAndGame, handleVideoEnd, handleSkipTurn, finalizeGameStart, loadSavedGame, finalizeLevelLoad, returnToMenu, returnToEditor, toggleModal,

      // Dialogue NPC
      dialogueNPC, dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId, dialogueNPCVoice,

      // Weapon Rendering
      weaponRendering, currentHandSprite, akimboHandSprite, currentLight, currentBrightness, getTintMatrix, mainTintId, akimboTintId, handStyleFinal, akimboHandStyleFinal, brokenTransform, akimboBrokenTransform,
      brokenTransition, showWeaponHand, isWeaponBroken, isAkimboWeaponBroken, isMapView, activeMapItem,

      // highlighted tiles
      highlightedTiles, currentHighlightedTiles,

      // Combat Actions
      combatActions, handleEscapeResult, handleCombatTimeout, handleReloadResult,

      // Achievements
      unlockedAchievements, achievementStats, unlockAchievement, incrementAchievementStat,

      // Misc
      initAudio, onMenuStart, disableMovement, disableWalking, disableActions, isSystemMenuOpen, isBlockingInteraction,
      cinematicMode, setCinematicMode, cinematicCamera, setCinematicCamera,
      screamer, setScreamer,
      gameOverType, setGameOverType,
      checkTriggers: checkTriggersStable
  };
}
