import React, { useRef, useEffect } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Raycaster from './Raycaster';
import TouchControls from './TouchControls';
import GameHeader from './GameHeader';
import MapOverlay from './MapOverlay';
import ConsoleOverlay from './ConsoleOverlay';
import DebugMap from './DebugMap'; 
import LoadingScreen from './LoadingScreen';
import EffectsOverlay from './EffectsOverlay';
import TopRightBadges from './TopRightBadges';
import WeaponHands from './WeaponHands';
import DeathCurtain from './DeathCurtain';
import GameLog from './GameLog';
import GameModals from './GameModals';
import GameOverlays from './GameOverlays';
import KeypadModal from './KeypadModal';
import DialogueOverlay from './DialogueOverlay';
import { TaskNotificationOverlay } from './TaskNotificationOverlay';
import { TutorialOverlay } from './TutorialOverlay';
import { AchievementNotificationOverlay } from './AchievementNotificationOverlay';

import { GameState } from '../types';
import { getLowHealthOverlayImage } from '../hooks/useVisualEffects';

const GameScreenComponent: React.FC<{ engine: any }> = ({ engine }) => {
  const {
      gameState, settings, setSettings, activeModal, setActiveModal,
      aimingSys,
      showPauseMenu, setShowPauseMenu, showSettings, setShowSettings, showDebug, setShowDebug,
      showVolume, setShowVolume, lootData, enemies,
      enemyFlashes, playerDamageSource, explosions,
      raycasterRef, roamingAnims, raycasterWidth, raycasterHeight, resolutionDivisor, pickupAnim, throwAnim,
      isLandscape, headerHeight, player, setPlayer, inventoryStats, totalAmmoInInventory, gainLevel,
      toasts, lootAnims, addLog, isTransitionLoading,
      strings, loading, loadingMessage, loadingProgress, loadingLogs,
      isWaitingToStart, spriteMap, loadingLogRef, animations,
      isFlashlightOn, almostBrokenSlots, levelData, currentLevelPath,
      wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
      viewportFade, playSound, showLevelUpText, shakeEventRef, muzzleFlashIntensityRef,
      isLowHealth, activeWeapon, weaponStyle,
      currentNode, selectedOptionIndex, localize, getDisplayText, lastNpcText,
      effectSys, combat, enemyMoveAnim, boxMoveAnims, visualHitIds, handleVisualHit,
      activeCombatEnemies, escapeDirection, deathAnimProgress, fallAnimProgress,
      currentMovementSys, inventorySys, throwingSys,
      handleTouchStart, handleTouchMove, handleTouchEnd, canAim,
      handlePointerDown, handlePointerMove, handlePointerUp, handleContextMenu,
      handleAimInputWithAnim, handleThrowInputWithAnim, handleShootWrapper,
      handleSkipTurn, finalizeLevelLoad, returnToMenu, toggleModal,
      dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId, dialogueNPCVoice, isRadioDialogue,
      mainHandContainerRef, akimboHandContainerRef, mapContainerRef, consoleContainerRef, mainHandImgRef, mainHandImgShadowRef, akimboHandImgRef, akimboHandImgShadowRef,
      currentHandSprite, akimboHandSprite, getTintMatrix, mainTintId, akimboTintId, handStyleFinal, akimboHandStyleFinal, brokenTransform, akimboBrokenTransform,
      brokenTransition, showWeaponHand, isWeaponBroken, isAkimboWeaponBroken, isMapView, activeMapItem,
      currentHighlightedTiles, handleEscapeResult, handleCombatTimeout, handleReloadResult,
      disableMovement, disableWalking, disableActions, mapSnapshotsRef,
      handlePlayerAttack, combatTimerBonus,
      cinematicMode, cinematicCamera, activeTutorial, setActiveTutorial,
      displayedWeapon, displayedAkimboWeapon,
      screamer,
      checkTriggers
  } = engine;

  const playerPortrait = player.portraits?.[player.characterId]?.static || (player.characterId === 'female' ? 'FEMALE_PORTRAIT1' : 'MALE_PORTRAIT1');
  const playerRawName = player.characterId === 'female' ? "Лилит/Lilith" : "Джон/John";
  
  const [isConsoleGameActive, setIsConsoleGameActive] = React.useState(false);
  
  const baseEffects = React.useMemo(() => effectSys.getActiveEffectDefinitions(), [player.activeEffects, effectSys]);

  const pPosXRound = Math.round(player.pos.x);
  const pPosYRound = Math.round(player.pos.y);

  const isStandingOnFire = React.useMemo(() => {
      let tempStandingOnFire = false;
      if (levelData && levelData.grid) {
          if (levelData.grid[pPosYRound] && levelData.grid[pPosYRound][pPosXRound]) {
              const t = levelData.grid[pPosYRound][pPosXRound];
              if (t.decoration && (t.decoration.id === 'fire' || t.decoration.type === 'fire' || t.decoration.isScorching)) {
                  tempStandingOnFire = true;
              }
          }
      }
      return tempStandingOnFire;
  }, [levelData?.grid, pPosXRound, pPosYRound]);

  const activeEffects = React.useMemo(() => {
      if (isStandingOnFire) {
          return [...baseEffects, {
              active: { id: 'virt_fire', definitionId: 'on_fire', duration: -1 },
              def: {
                  id: "on_fire",
                  name: "Подожжён/On fire",
                  description: "Вы стоите в огне./You are standing in fire.",
                  type: "DEBUFF",
                  icon: "M17.66 11.2C17.66 16.5 13.16 20 8 20C2.84 20 2 15.5 2 11.2C2 7.7 5.59 4.6 7.54 0C8.5 2.1 11.16 4.3 11.16 7.2C11.16 8.5 10.3 9.7 9.16 10.2C10.73 10.5 12.16 11.5 12.16 13.2C12.16 14.5 11.3 15.7 10.16 16.2C13.5 15.5 15.16 12.7 15.16 10.2C16.5 10.5 17.66 11.5 17.66 11.2Z",
                  iconType: "SVG_PATH",
                  color: "text-orange-500",
                  duration: -1
              }
          }];
      }
      return baseEffects;
  }, [baseEffects, isStandingOnFire]);

  const zoomContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
      const handleZoom = (e: any) => {
          if (zoomContainerRef.current && !cinematicMode) {
              zoomContainerRef.current.style.transform = `scale(${1 + e.detail.zoom})`;
          }
      };
      window.addEventListener('update-inspect-zoom', handleZoom);
      return () => window.removeEventListener('update-inspect-zoom', handleZoom);
  }, [cinematicMode]);

  useEffect(() => {
      if (zoomContainerRef.current) {
          if (cinematicMode && cinematicCamera && cinematicCamera.zoom !== undefined) {
              zoomContainerRef.current.style.transform = `scale(${cinematicCamera.zoom})`;
          } else if (!cinematicMode) {
              zoomContainerRef.current.style.transform = `scale(${1 + (engine.inspectZoom || 0)})`;
          }
      }
  }, [cinematicMode, cinematicCamera, engine.inspectZoom]);

  const synchronizedGrids = React.useMemo(() => {
      if (!levelData?.grids) return undefined;
      return [levelData.grid, ...levelData.grids.slice(1)];
  }, [levelData?.grid, levelData?.grids]);

  const engineRef = useRef(engine);
  engineRef.current = engine;

  const onParticleHitMemo = React.useCallback((x: number, y: number, z: number, type: 'WALL' | 'FLOOR', face: any) => {
      engineRef.current.addSplatterWithSound(x, y, z, type, 1.0, face);
  }, []);

  const onShardLandedMemo = React.useCallback((p: any) => {
      engineRef.current.addShardDecal(p);
  }, []);

  const onParticleBounceMemo = React.useCallback((p: any) => {
      if ((p.type === 'casing' || p.type === 'brick' || p.type === 'gib' || p.type === 'deco_gib') && p.soundId) {
          engineRef.current.playSound(p.soundId, { x: p.worldX, y: p.worldY });
      }
  }, []);

  const onFrameRenderedMemo = React.useCallback(() => {
      if (engineRef.current.isWaitingToStart) engineRef.current.finalizeLevelLoad();
  }, []);

  const handlePlayerAttackMemo = React.useCallback((tid: string | null, dmg: number, crit: boolean, fail: boolean, force?: boolean, armorHitIndex?: number) => {
      const res = engineRef.current.handlePlayerAttack(tid, dmg, crit, fail, force, armorHitIndex);
      return res ? res.hasNextAkimbo : false;
  }, []);

  const onSpawnParticlesMemo = React.useCallback((p: any[]) => {
      engineRef.current.raycasterRef.current?.spawnParticles(p);
  }, []);

  const onDebugMapOpenMemo = React.useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      engineRef.current.setActiveModal('debug_map');
  }, []);

  const lastOpenActionsTimeRef = React.useRef(0);
  const onOpenActionsMemo = React.useCallback(() => {
      const now = Date.now();
      if (now - lastOpenActionsTimeRef.current < 150) {
          return;
      }
      lastOpenActionsTimeRef.current = now;
      engineRef.current.toggleModal('actions');
  }, []);

  const toggleModalMemo = React.useCallback((modal: any) => {
      engineRef.current.toggleModal(modal);
  }, []);

  const setPlayerMemo = React.useCallback((p: any) => {
      engineRef.current.setPlayer(p);
  }, []);

  const handleShootWrapperMemo = React.useCallback((target?: any) => {
      engineRef.current.handleShootWrapper(target);
  }, []);

  const handleSkipTurnMemo = React.useCallback(() => {
      engineRef.current.handleSkipTurn();
  }, []);

  const headerStyle = React.useMemo(() => (isLandscape && headerHeight ? { height: headerHeight } : undefined), [isLandscape, headerHeight]);

  const onTutorialCloseMemo = React.useCallback(() => {
      const tut = engineRef.current.activeTutorial;
      if (tut?.resolve) tut.resolve();
      engineRef.current.setActiveTutorial(null);
  }, []);

  const handleDirectChoiceMemo = React.useCallback((index: number) => {
      if (engineRef.current.handleDirectChoice) engineRef.current.handleDirectChoice(index);
  }, []);

  const handleAimInputWithAnimMemo = React.useCallback((action: string) => {
      engineRef.current.handleAimInputWithAnim(action);
  }, []);

  const handleThrowInputWithAnimMemo = React.useCallback((action: string) => {
      engineRef.current.handleThrowInputWithAnim(action);
  }, []);

  const handleInspectInputWithAnimMemo = React.useCallback((action: string) => {
      if (engineRef.current.handleInspectInputWithAnim) engineRef.current.handleInspectInputWithAnim(action);
  }, []);

  const preparePlayerAttackMemo = React.useCallback((targetId: string) => {
      if (engineRef.current.preparePlayerAttack) engineRef.current.preparePlayerAttack(targetId);
  }, []);

  const triggerMuzzleFlashMemo = React.useCallback(() => {
      if (engineRef.current.triggerMuzzleFlash) engineRef.current.triggerMuzzleFlash();
  }, []);

  const playSoundMemo = React.useCallback((soundId: string, pos?: { x: number, y: number }, id?: string, delayMs?: number, reverbPos?: { x: number, y: number }, maxDistance?: number) => {
      if (engineRef.current.playSound) engineRef.current.playSound(soundId, pos, id, delayMs, reverbPos, maxDistance);
  }, []);

  const touchHandlersMemo = React.useMemo(() => {
    return {
      handleStrafe: (isRight: boolean) => {
        if (engineRef.current.disableWalking) return;
        engineRef.current.currentMovementSys.handleStrafe(isRight);
      },
      handleTouchStart: (e: React.TouchEvent) => engineRef.current.handleTouchStart(e),
      handleTouchMove: (e: React.TouchEvent) => engineRef.current.handleTouchMove(e),
      handleTouchEnd: (e: React.TouchEvent) => engineRef.current.handleTouchEnd(e),
      handlePointerDown: (e: React.PointerEvent) => engineRef.current.handlePointerDown(e),
      handlePointerMove: (e: React.PointerEvent) => engineRef.current.handlePointerMove(e),
      handlePointerUp: (e: React.PointerEvent) => engineRef.current.handlePointerUp(e),
      handleContextMenu: (e: React.MouseEvent) => engineRef.current.handleContextMenu(e),
    };
  }, []);

  return (
    <div onContextMenu={(e) => e.preventDefault()} className={`flex flex-col h-full w-full ${isLandscape ? '' : 'max-w-md mx-auto'} bg-gray-900 text-white overflow-hidden relative font-['Jura'] font-medium`}>
       <GameHeader 
            settings={settings}
            hp={player.hp}
            maxHp={player.maxHp}
            level={player.level}
            xp={player.xp}
            maxXp={player.maxXp}
            availablePoints={player.availablePoints}
            levelName={levelData?.name || strings.ui.header.loading_title} 
            strings={strings} 
            combatProcessing={combat.isProcessingTurn}
            combatActive={combat.isActive} 
            showPauseMenu={showPauseMenu} 
            showSettings={showSettings} 
            showDebug={showDebug} 
            activeModal={activeModal} 
            toggleModal={toggleModalMemo} 
            setShowPauseMenu={setShowPauseMenu} 
            setActiveModal={setActiveModal} 
            isDying={gameState === GameState.DYING}
            cinematicMode={cinematicMode}
            activeTutorial={activeTutorial}
            className={isLandscape ? "min-h-[60px]" : ""}
            style={headerStyle}
            gameState={gameState}
        />
       
       {!isLandscape && <TaskNotificationOverlay tasks={levelData?.tasks} strings={strings} localize={localize} />}

       {activeTutorial && (
           <TutorialOverlay 
               tutorial={activeTutorial}
               strings={strings}
               localize={localize}
               onClose={onTutorialCloseMemo}
           />
       )}

       <div className={`flex ${isLandscape ? 'flex-row h-full min-h-0' : 'flex-col flex-1 min-h-0'}`}>
           <div id="viewport-touch-layer" className={`
                relative shrink-0 bg-black touch-none ${activeTutorial ? 'z-auto overflow-visible' : 'z-10 overflow-hidden'}
                ${isLandscape ? 'flex-[4] max-w-[calc(100dvh*4/3)] h-full border-r border-gray-700' : 'w-full aspect-[4/3] max-h-[45dvh] border-b border-gray-700'}
           `} 
           onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
           onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onContextMenu={handleContextMenu}
           >
          
          {/* Top Right Badges */}
          {!cinematicMode && (
              <TopRightBadges 
                  almostBrokenSlots={almostBrokenSlots} 
                  activeWeapon={
                      (activeWeapon && (activeWeapon.type === 'MAP' || activeWeapon.type === 'CONSOLE' || activeWeapon.type === 'NOTE' || activeWeapon.type === 'RADIO'))
                          ? (player.equipment.weapon || null)
                          : activeWeapon
                  } 
                  weaponAkimbo={player.equipment.weaponAkimbo}
                  hasCompass={player?.inventory?.some((item: any) => item.type === 'COMPASS') || Object.values(player?.equipment || {}).some((item: any) => item?.type === 'COMPASS')}
                  dir360={player.dir360}
                  totalAmmoInInventory={totalAmmoInInventory} 
                  hasDigitalMap={
                      player?.inventory?.some((item: any) => item.type === 'DIGITAL_MAP' && item.isActive && (item.currentAmmo ?? 0) > 0 && item.hasBattery !== false) || 
                      Object.values(player?.equipment || {}).some((item: any) => item?.type === 'DIGITAL_MAP' && item.isActive && (item.currentAmmo ?? 0) > 0 && item.hasBattery !== false)
                  }
                  playerX={player.pos.x}
                  playerY={player.pos.y}
                  playerDir={player.dir}
                  grid={levelData?.grid}
                  strings={strings}
                  spriteMap={spriteMap}
              />
          )}

          {/* Debug Map Button */}
          {settings.debug.aiDebug && gameState !== GameState.DIALOGUE && (
              <button 
                  onClick={onDebugMapOpenMemo}
                  className="absolute top-12 right-2 z-[60] p-1.5 bg-blue-900/80 border border-blue-500/50 text-blue-200 rounded hover:bg-blue-800/80 active:scale-95 transition-all shadow-sm"
              >
                  <MapIcon className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />
              </button>
          )}

          {/* EFFECTS OVERLAY */}
          {!cinematicMode && (
              <EffectsOverlay activeEffects={activeEffects} settings={settings} />
          )}

          {gameState === GameState.DIALOGUE && currentNode && (
              <DialogueOverlay 
                  npcId={dialogueNPCDefinitionId}
                  npcName={dialogueNPCName}
                  npcAssetId={dialogueNPCAsset}
                  playerPortraitId={playerPortrait}
                  node={currentNode}
                  selectedOptionIndex={selectedOptionIndex}
                  spriteMap={spriteMap}
                  localize={localize}
                  getDisplayText={getDisplayText}
                  lastNpcText={lastNpcText} 
                  playerName={localize(playerRawName)} 
                  voiceConfig={dialogueNPCVoice} 
                  animations={animations}
                  voiceDebugEnabled={settings.debug.voiceDebug}
                  inventoryStats={inventoryStats}
                  player={player}
                  setPlayer={setPlayerMemo}
                  addLog={addLog}
                  playSound={playSoundMemo}
                  isRadioDialogue={isRadioDialogue}
                  handleDirectChoice={handleDirectChoiceMemo}
                  levelData={levelData}
                  npcInstanceId={dialogueNPCInstanceId}
                  checkTriggers={checkTriggers}
              />
          )}

          <div 
              ref={zoomContainerRef}
              className={`absolute inset-0 transition-[filter] duration-500 origin-center ${((activeModal !== null && activeModal !== 'actions' && activeModal !== 'loot' && activeModal !== 'inspect' && activeModal !== 'inspect_anim') || showPauseMenu || showSettings || showDebug || showVolume) ? 'blur-md' : ''}`}
              style={{ 
                  transform: `scale(${
                      (cinematicMode && cinematicCamera && cinematicCamera.zoom !== undefined) 
                          ? cinematicCamera.zoom 
                          : (1 + (engine.inspectZoom || 0))
                  })` 
              }}
          >
              {levelData ? <Raycaster 
                  strings={strings}
                  isPaused={((activeModal !== null && activeModal !== 'actions' && activeModal !== 'loot' && activeModal !== 'inspect' && activeModal !== 'inspect_anim') || showPauseMenu || showSettings || showDebug || showVolume)}
                  aimingSys={aimingSys}
                  gameState={gameState}
                  constructionPalette={levelData.construction}
                  doorDefinitions={levelData.doorDefinitions}
                  portalsPalette={levelData.portalsPalette}
                  ref={raycasterRef}
                  grid={levelData.grid}
                  grids={synchronizedGrids}
                  lightMap={levelData.lightMap} 
                  floorLightMaps={levelData.floorLightMaps}
                  dynamicLights={levelData.dynamicLights}
                  outdoorMap={levelData.outdoorMap}
                  player={player} 
                  lookAroundAngleRef={engine.lookAroundAngleRef}
                  lookAroundPitchRef={engine.lookAroundPitchRef}
                  fov={0.66}
                  width={engine.raycasterWidth} 
                  height={engine.raycasterHeight} 
                  sprites={spriteMap} 
                  wallTexture={wallTexture} 
                  floorTexture={floorTexture} 
                  doorTexture={doorTexture} 
                  skyTexture={skyTexture} 
                  ceilingTexture={ceilingTexture} 
                  ceilingType={levelData.ceilingType} 
                  weather={levelData.weather}
                  fogColor={levelData.fogColor}
                  fogDistance={levelData.fogDistance}
                  levelParticles={levelData.particles}
                  particlesDb={engine.particlesDb}
                  pickupAnim={pickupAnim} 
                  throwAnim={throwAnim} 
                  shakeEventRef={shakeEventRef}
                  enemyMoveAnim={enemyMoveAnim} 
                  boxMoveAnims={boxMoveAnims}
                  highlightedTiles={currentHighlightedTiles} 
                  highlightedEntityId={gameState === GameState.INSPECTING ? engine.inspectingSys?.inspectTargets[engine.inspectingSys?.inspectTargetIndex]?.id : null}
                  activeAttackerId={combat.activeAttackerId} 
                  damagedEnemyIds={visualHitIds} 
                  debugTextures={settings.debug.textures} 
                  showFps={settings.debug.showFps} 
                  animationDuration={combat.isProcessingTurn ? 450 : 160} 
                  muzzleFlashIntensityRef={muzzleFlashIntensityRef} 
                  enemyFlashesRef={engine.enemyFlashesRef} 
                  playerDamageSource={playerDamageSource} 
                  enemies={enemies} 
                  isCombatActive={combat.isActive} 
                  combatEnemies={activeCombatEnemies} 
                  animations={animations} 
                  playSound={playSound} 
                  explosionsRef={engine.explosionsRef} 
                  activeDialogueNPCId={dialogueNPCInstanceId} 
                  lootAnims={lootAnims} 
                  roamingAnims={roamingAnims} 
                  aiDebug={settings.debug.aiDebug} 
                  pitLineVis={settings.debug.pitLineVis} 
                  customWallBuffers={engine.customWallBuffers}
                  customFloorBuffers={engine.customFloorBuffers}
                  playerReflectionSprite={engine.playerReflectionSprite}
                  flashlightActive={isFlashlightOn}
                  flashlightBatteryRatio={engine.flashlightBatteryRatio}
                  resolutionDivisor={engine.resolutionDivisor}
                  deathAnimProgress={Math.max(deathAnimProgress, fallAnimProgress || 0)}
                  renderDistance={settings.renderDistance ?? 15}
                  raycasterCamera={cinematicMode ? cinematicCamera : null}
                  onParticleHit={onParticleHitMemo} 
                  onShardLanded={onShardLandedMemo}
                  onParticleBounce={onParticleBounceMemo}
                  onFrameRendered={onFrameRenderedMemo}
                  forceSoftRenderer={settings.debug.forceSoftRenderer}
                  viewportSmoothing={settings.viewportSmoothing}
                  textureFiltering={settings.textureFiltering}
                  lightning5s={settings.debug.lightning5s}
                  levelPath={currentLevelPath}
                  settings={settings}
              /> : <div className="absolute inset-0 flex items-center justify-center" />}
              
              {/* Overlay for map view to keep visual appearance with better performance */}
              <div className={`absolute inset-0 pointer-events-none transition-all duration-500 z-[10] ${(isMapView || gameState === GameState.CONSOLE_VIEW) ? 'backdrop-blur-sm bg-black/10 opacity-100' : 'backdrop-blur-none bg-transparent opacity-0'}`} />
              
              {isLowHealth && <div className="absolute inset-0 pointer-events-none z-[18] animate-pulse" style={{ backgroundImage: `url(${getLowHealthOverlayImage()})`, backgroundSize: '100% 100%' }} />}
              <div id="damage-flash-overlay" className="absolute inset-0 pointer-events-none transition-opacity duration-300 bg-red-600/40 z-50" style={{ opacity: 0 }} />
              <div id="pickup-flash-overlay" className="absolute inset-0 pointer-events-none transition-opacity duration-300 bg-white/40 z-50" style={{ opacity: 0 }} />
              <div id="levelup-flash-overlay" className="absolute inset-0 pointer-events-none transition-opacity duration-300 bg-white/60 z-50" style={{ opacity: 0 }} />
              {player.flashDuration && player.flashDuration > 0 ? (
                  <div className="absolute inset-0 pointer-events-none transition-opacity duration-500 z-[55] bg-white flex items-center justify-center backdrop-blur-3xl" style={{ opacity: player.flashDuration >= 3 ? 1 : player.flashDuration / 3 }} />
              ) : null}
              {showLevelUpText && (
                <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center">
                  <div className="text-3xl md:text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,1)] tracking-widest animate-[levelUpFloat_6s_ease-in-out_forwards]">
                    {strings?.logs?.level_up_ui || "Level up"}
                  </div>
                </div>
              )}
              <div className={`absolute inset-0 bg-black pointer-events-none z-[60] ease-in-out flex flex-col items-center justify-center p-8 ${viewportFade > 0 ? 'transition-opacity duration-300' : 'transition-opacity duration-1000'}`} style={{ opacity: viewportFade }}>
                  {isTransitionLoading && viewportFade > 0 && !loading && loadingProgress > 0 && (
                      <div className="w-full max-w-md z-[61] pointer-events-none opacity-80 animate-in fade-in duration-500 delay-300 px-6">
                          <div className="w-full flex flex-col">
                              <div className="flex justify-end items-end mb-2 px-1">
                                  <span className="text-sm font-black text-gray-300 tracking-widest">
                                      {Math.round(loadingProgress)}%
                                  </span>
                              </div>
                              <div className="w-full p-1 border border-gray-700 bg-black/80 rounded shadow-2xl">
                                  <div className="w-full h-3 bg-black/50 relative overflow-hidden rounded-sm">
                                      <div 
                                          className="absolute top-0 left-0 h-full bg-gray-900 border-r border-gray-500 transition-all duration-300 ease-out flex items-center overflow-hidden" 
                                          style={{ width: `${Math.min(100, loadingProgress)}%` }} 
                                      >
                                          <div className="w-full h-full opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,1)_6px,rgba(255,255,255,1)_12px)]" />
                                      </div>
                                  </div>
                              </div>
                              <div className="mt-4 w-full h-8 overflow-hidden relative border-t border-gray-800/50 pt-2">
                                  <div className="absolute top-2 w-full flex flex-col justify-start">
                                      {loadingLogs && loadingLogs.length > 0 && (
                                          <div className="text-[10px] font-mono tracking-wider text-center truncate text-gray-400 font-bold uppercase">
                                              {loadingLogs[loadingLogs.length - 1]}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
              
              <WeaponHands 
                  showWeaponHand={showWeaponHand && !cinematicMode}
                  mainHandContainerRef={mainHandContainerRef}
                  akimboHandContainerRef={akimboHandContainerRef}
                  mapContainerRef={mapContainerRef}
                  consoleContainerRef={consoleContainerRef}
                  mainHandImgRef={mainHandImgRef}
                  mainHandImgShadowRef={mainHandImgShadowRef}
                  akimboHandImgRef={akimboHandImgRef}
                  akimboHandImgShadowRef={akimboHandImgShadowRef}
                  akimboHandSprite={akimboHandSprite}
                  currentHandSprite={currentHandSprite}
                  akimboHandStyleFinal={akimboHandStyleFinal}
                  handStyleFinal={handStyleFinal}
                  akimboBrokenTransform={akimboBrokenTransform}
                  brokenTransform={brokenTransform}
                  brokenTransition={brokenTransition}
                  isWeaponBroken={isWeaponBroken}
                  isAkimboWeaponBroken={isAkimboWeaponBroken}
                  getTintMatrix={getTintMatrix}
                  mainTintId={mainTintId}
                  akimboTintId={akimboTintId}
                  displayedWeapon={displayedWeapon}
                  displayedAkimboWeapon={displayedAkimboWeapon}
                  animations={animations}
                  spriteMap={spriteMap}
                  characterId={player.characterId}
              />

              <GameOverlays 
                  gameState={gameState}
                  strings={strings}
                  handleAimInputWithAnim={handleAimInputWithAnimMemo}
                  handleThrowInputWithAnim={handleThrowInputWithAnimMemo}
                  handleInspectInputWithAnim={handleInspectInputWithAnimMemo}
                  throwAnim={throwAnim}
                  combat={combat}
                  activeCombatEnemies={activeCombatEnemies}
                  enemies={enemies}
                  player={player}
                  setPlayer={setPlayerMemo}
                  addLog={addLog}
                  activeWeapon={activeWeapon}
                  settings={settings}
                  escapeDirection={escapeDirection}
                  combatTimerBonus={combatTimerBonus}
                  handlePlayerAttack={handlePlayerAttackMemo}
                  handleVisualHit={handleVisualHit}
                  lookAroundPitch={engine.lookAroundPitch}
                  handleEscapeResult={handleEscapeResult}
                  handleReloadResult={handleReloadResult}
                  handleCombatTimeout={handleCombatTimeout}
                  activeModal={activeModal}
                  showPauseMenu={showPauseMenu}
                  showSettings={showSettings}
                  showDebug={showDebug}
                  showVolume={showVolume}
                  preparePlayerAttack={preparePlayerAttackMemo}
                  triggerMuzzleFlash={triggerMuzzleFlashMemo}
                  totalAmmoInInventory={totalAmmoInInventory}
                  inventorySys={inventorySys}
                  inventoryStats={inventoryStats}
                  visualHitIds={visualHitIds}
                  isWeaponBroken={activeWeapon?.durability === 0}
                  isAkimboWeaponBroken={engine.activeAkimboWeapon?.durability === 0}
                  RAYCASTER_WIDTH={engine.raycasterWidth}
                  RAYCASTER_HEIGHT={engine.raycasterHeight}
                  spriteMap={spriteMap}
                  levelData={levelData}
                  currentNode={currentNode}
                  dialogueNPCName={dialogueNPCName}
                  dialogueNPCAsset={dialogueNPCAsset}
                  dialogueNPCInstanceId={dialogueNPCInstanceId}
                  dialogueNPCDefinitionId={dialogueNPCDefinitionId}
                  playerPortrait={playerPortrait}
                  selectedOptionIndex={selectedOptionIndex}
                  localize={localize}
                  getDisplayText={getDisplayText}
                  lastNpcText={lastNpcText}
                  playerRawName={playerRawName}
                  dialogueNPCVoice={dialogueNPCVoice}
                  animations={animations}
                  playSound={playSoundMemo}
                  onSpawnParticles={onSpawnParticlesMemo}
                  isRadioDialogue={isRadioDialogue}
                  handleDirectChoice={handleDirectChoiceMemo}
              />
              <DeathCurtain deathAnimProgress={deathAnimProgress} />
          </div>

          {/* CINEMATIC CURTAINS OVERLAY */}
          <div 
              className="absolute left-0 right-0 z-[60] bg-black transition-all duration-700 ease-in-out pointer-events-none"
              style={{ height: (cinematicMode && cinematicCamera) ? '15%' : '0%', top: 0 }}
          />
          <div 
              className="absolute left-0 right-0 z-[60] bg-black transition-all duration-700 ease-in-out pointer-events-none"
              style={{ height: (cinematicMode && cinematicCamera) ? '15%' : '0%', bottom: 0 }}
          />

          {activeMapItem && (
              <MapOverlay 
                  player={player} 
                  levelData={levelData} 
                  sprites={spriteMap} 
                  onClose={() => inventorySys.toggleMapMode(null)} 
                  mapContainerRef={mapContainerRef} 
                  currentLevelPath={currentLevelPath} 
                  currentSnapshot={activeMapItem ? mapSnapshotsRef.current.get(activeMapItem.id) : undefined} 
                  onSnapshotUpdate={(data) => { if(activeMapItem) mapSnapshotsRef.current.set(activeMapItem.id, data); }} 
                  item={activeMapItem}
                  visible={isMapView}
                  zoomLevel={inventorySys.mapZoom} 
                  handStyleFinal={handStyleFinal}
                  localize={localize}
              />
          )}

          {(gameState === GameState.CONSOLE_VIEW || player.inventory.some(i => i.type === 'CONSOLE') || player.equippedWeapon?.type === 'CONSOLE') && (
              <ConsoleOverlay 
                  player={player}
                  sprites={spriteMap}
                  onClose={() => inventorySys.toggleConsoleMode(null)}
                  item={player.equippedWeapon || player.inventory.find(i => i.type === 'CONSOLE') || null}
                  visible={gameState === GameState.CONSOLE_VIEW && player.equippedWeapon?.type === 'CONSOLE'}
                  mapContainerRef={consoleContainerRef}
                  handStyleFinal={handStyleFinal}
                  localize={localize}
                  playSound={playSoundMemo}
                  strings={strings}
                  onGameStatusChange={setIsConsoleGameActive} isPaused={activeModal !== null || showPauseMenu || showSettings || showDebug || showVolume}
                  onOpenActions={onOpenActionsMemo}
                  settings={settings}
              />
          )}
          
          {/* Debug Map Overlay */}
          {activeModal === 'debug_map' && (
              <DebugMap 
                  player={player} 
                  levelData={levelData} 
                  enemies={enemies} 
                  onClose={() => setActiveModal(null)} 
                  settings={settings}
                  onUpdateSettings={setSettings}
                  strings={strings}
              />
          )}

          {activeModal === 'keypad' && !showPauseMenu && !showSettings && !showDebug && !showVolume && currentMovementSys.frontTile && (
              <KeypadModal
                  strings={strings}
                  spriteMap={spriteMap}
                  assetId={currentMovementSys.frontTile.keypadAssetId}
                  maskAssetId={currentMovementSys.frontTile.keypadMaskAssetId}
                  password={currentMovementSys.frontTile.password}
                  onClose={() => toggleModal(null)}
                  onKeyPress={() => engine.playSound(currentMovementSys.frontTile.keypadSound || 'BEEP')}
                  onSuccess={() => { if (currentMovementSys.frontTile.keypadSuccessSound) engine.playSound(currentMovementSys.frontTile.keypadSuccessSound); }}
                  onFail={() => { if (currentMovementSys.frontTile.keypadFailSound) engine.playSound(currentMovementSys.frontTile.keypadFailSound); }}
                  onUnlock={() => {
                      engine.setLevelData((prev: any) => {
                          const newGrid = prev.grid.map((row: any) => [...row]);
                          
                          // Remove the keypad properties from the wall we are interacting with
                          const dx = [0, 1, 0, -1][Math.round(player.dir)];
                          const dy = [-1, 0, 1, 0][Math.round(player.dir)];
                          const fx = player.pos.x + dx;
                          const fy = player.pos.y + dy;
                          
                          if (newGrid[fy] && newGrid[fy][fx]) {
                              newGrid[fy][fx] = {
                                  ...newGrid[fy][fx],
                                  keylock: undefined,
                                  keypadDirection: undefined,
                                  keypadAssetId: undefined,
                                  keypadMaskAssetId: undefined,
                                  password: undefined,
                                  keypadSound: undefined,
                                  keypadSuccessSound: undefined,
                                  keypadFailSound: undefined,
                                  targetId: undefined
                              };
                          }

                          let doorPos: {x: number, y: number} | null = null;
                          let doorSound: string | undefined = undefined;
                          if (currentMovementSys.frontTile.targetId) {
                              const targetId = currentMovementSys.frontTile.targetId;
                              for (let y = 0; y < newGrid.length; y++) {
                                  for (let x = 0; x < newGrid[y].length; x++) {
                                      if (newGrid[y][x].door && newGrid[y][x].door.id === targetId) {
                                          if (newGrid[y][x].door!.openSound) {
                                              doorSound = newGrid[y][x].door!.openSound;
                                          }
                                          newGrid[y][x].door = { 
                                              ...newGrid[y][x].door!, 
                                              isLocked: false,
                                              state: newGrid[y][x].door!.state === 'CLOSED' ? 'OPENING' : newGrid[y][x].door!.state
                                          };
                                          doorPos = { x, y };
                                          // Note: if multiple doors share targetId, this pos will just be the last one, which is probably fine.
                                      }
                                  }
                              }
                          }
                          if (doorSound) {
                              if (doorPos) {
                                  engine.playSound(doorSound, doorPos);
                              } else {
                                  engine.playSound(doorSound);
                              }
                          }
                          return { ...prev, grid: newGrid };
                      });
                      addLog(strings.logs.door_unlocked_electronic || "The door was unlocked electronically.", "SUCCESS");
                  }}
              />
          )}
          {isLandscape && (
              <>
                  <AchievementNotificationOverlay strings={strings} />
                  <TaskNotificationOverlay tasks={levelData?.tasks} strings={strings} localize={localize} />
                  <GameModals 
                      engine={engine}
                      activeModal={activeModal}
                      showPauseMenu={false}
                      showSettings={false}
                      showDebug={showDebug}
                      showVolume={showVolume}
                      strings={strings}
                      combat={combat}
                      gameState={gameState}
                      canAim={canAim}
                      currentMovementSys={currentMovementSys}
                      inventorySys={inventorySys}
                      handleShootWrapper={handleShootWrapperMemo}
                      handleSkipTurn={handleSkipTurnMemo}
                      toggleModal={toggleModalMemo}
                      setShowPauseMenu={setShowPauseMenu}
                      lootData={lootData}
                      spriteMap={spriteMap}
                      player={player}
                      setPlayer={setPlayerMemo}
                      inventoryStats={inventoryStats}
                      throwingSys={throwingSys}
                      settings={settings}
                      levelData={levelData}
                      returnToMenu={returnToMenu}
                      setShowSettings={setShowSettings}
                      setSettings={setSettings}
                      setShowDebug={setShowDebug}
                      setShowVolume={setShowVolume}
                      gainLevel={gainLevel}
                      playSound={playSoundMemo}
                      addLog={addLog}
                      setActiveModal={setActiveModal}
                      setGameState={engine.setGameState}
                      setLookAroundAngle={engine.setLookAroundAngle}
                      setLookAroundPitch={engine.setLookAroundPitch}
                  />
              </>
          )}

          <AnimatePresence>
            {screamer && (() => {
                const imgSrc = spriteMap?.get(screamer.image)?.src || screamer.image || undefined;
                if (!imgSrc) return null;
                const fadeInDuration = screamer.duration ? Math.max(0.1, (screamer.duration * 0.1) / 1000) : 0.2;
                const transitionDuration = screamer.duration ? Math.max(0.15, Math.min(1.2, (screamer.duration * 0.25) / 1000)) : 0.5;
                return (
                    <motion.div 
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.25, transition: { duration: transitionDuration, ease: "easeIn" } }}
                        transition={{ duration: fadeInDuration, ease: "easeOut" }}
                        className="absolute inset-0 flex items-center justify-center z-[150] pointer-events-none select-none overflow-hidden bg-transparent"
                    >
                        <img 
                            src={imgSrc} 
                            alt="Screamer" 
                            className="h-full w-auto object-contain mx-auto block"
                            referrerPolicy="no-referrer"
                        />
                    </motion.div>
                );
            })()}
          </AnimatePresence>
        </div>
          
       <div className={`
            bg-gray-900 p-4 overflow-y-auto text-[14px] leading-4 shadow-inner z-0 relative tracking-wide font-['Jura'] font-normal
            ${isLandscape ? 'flex-[1] h-full border-l border-gray-700 flex flex-col' : 'flex-1 min-w-0'}
       `}>
            <GameLog isCombatActive={combat.isActive} />
            {isLandscape && <div id="combat-actions-slot" className="shrink-0 mt-4 pt-4 border-t border-gray-800"></div>}
       </div>
       {!isLandscape && <div id="combat-actions-slot" className="shrink-0"></div>}
       </div>
       {!isLandscape && <TouchControls 
          disableMovement={disableMovement} 
          disableWalking={disableWalking}
          disableActions={disableActions}
          isConsoleGameActive={isConsoleGameActive || gameState === GameState.CONSOLE_VIEW} 
          onStrafe={touchHandlersMemo.handleStrafe} 
          onOpenActions={(isConsoleGameActive || gameState === GameState.CONSOLE_VIEW) ? () => {
              window.dispatchEvent(new CustomEvent('TRIGGER_CONSOLE_ACTION'));
          } : onOpenActionsMemo} 
          onTouchStart={touchHandlersMemo.handleTouchStart} 
          onTouchMove={touchHandlersMemo.handleTouchMove} 
          onTouchEnd={touchHandlersMemo.handleTouchEnd}

       />}
       {loading && ( 
           <LoadingScreen 
               loadingProgress={loadingProgress}
               loadingMessage={loadingMessage}
               loadingLogs={loadingLogs}
               isWaitingToStart={isWaitingToStart}
               strings={strings}
               finalizeLevelLoad={finalizeLevelLoad}
           />
       )}
       {!isLandscape && (
       <GameModals 
           engine={engine}
           activeModal={activeModal}
           showPauseMenu={showPauseMenu}
           showSettings={showSettings}
           showDebug={showDebug}
           showVolume={showVolume}
           strings={strings}
           combat={combat}
           gameState={gameState}
           canAim={canAim}
           currentMovementSys={currentMovementSys}
           inventorySys={inventorySys}
           handleShootWrapper={handleShootWrapperMemo}
           handleSkipTurn={handleSkipTurnMemo}
           toggleModal={toggleModalMemo}
           setShowPauseMenu={setShowPauseMenu}
           lootData={lootData}
           spriteMap={spriteMap}
           player={player}
           setPlayer={setPlayerMemo}
           inventoryStats={inventoryStats}
           throwingSys={throwingSys}
           settings={settings}
           levelData={levelData}
           returnToMenu={returnToMenu}
           setShowSettings={setShowSettings}
           setSettings={setSettings}
           setShowDebug={setShowDebug}
           setShowVolume={setShowVolume}
           gainLevel={gainLevel}
           playSound={playSoundMemo}
           addLog={addLog}
           setActiveModal={setActiveModal}
           setGameState={engine.setGameState}
           setLookAroundAngle={engine.setLookAroundAngle}
           setLookAroundPitch={engine.setLookAroundPitch}
       />
       )}
       {gameState === GameState.DYING && deathAnimProgress > 0.7 && (
           <div 
               className="fixed inset-0 bg-black z-[99999] pointer-events-none" 
               style={{ opacity: (deathAnimProgress - 0.7) / 0.3 }} 
           />
       )}
       
       
        {/* Внешний GameModals для отображения системных меню во весь экран на ПК */}
        {isLandscape && (showPauseMenu || showSettings) && (
            <GameModals 
                engine={engine}
                activeModal={null}
                showPauseMenu={showPauseMenu}
                showSettings={showSettings}
                showDebug={showDebug}
                showVolume={showVolume}
                strings={strings}
                combat={combat}
                gameState={gameState}
                canAim={canAim}
                currentMovementSys={currentMovementSys}
                inventorySys={inventorySys}
                handleShootWrapper={handleShootWrapperMemo}
                handleSkipTurn={handleSkipTurnMemo}
                toggleModal={toggleModalMemo}
                setShowPauseMenu={setShowPauseMenu}
                lootData={lootData}
                spriteMap={spriteMap}
                player={player}
                setPlayer={setPlayerMemo}
                inventoryStats={inventoryStats}
                throwingSys={throwingSys}
                settings={settings}
                levelData={levelData}
                returnToMenu={returnToMenu}
                setShowSettings={setShowSettings}
                setSettings={setSettings}
                setShowDebug={setShowDebug}
                setShowVolume={setShowVolume}
                gainLevel={gainLevel}
                playSound={playSoundMemo}
                addLog={addLog}
                setActiveModal={setActiveModal}
                setGameState={engine.setGameState}
                setLookAroundAngle={engine.setLookAroundAngle}
                setLookAroundPitch={engine.setLookAroundPitch}
            />
        )}

       {React.useMemo(() => (
           <div style={{ position: 'fixed', top: 0, left: 0, width: '1px', height: '1px', overflow: 'hidden', opacity: 0.01, pointerEvents: 'none', zIndex: -999 }}>
               {Array.from(spriteMap.entries()).map(([k, v]) => {
                   const src = (v as any)?.src || (v as any)?.version;
                   if (!src) return null;
                   return <img key={k} src={src} alt="" />;
               })}
           </div>
       ), [spriteMap])}

       {screamer && (
           <div className="hidden">
               <img 
                   src={spriteMap?.get(screamer.image)?.src || (screamer.image || undefined)} 
                   alt="Screamer" 
                   className="hidden w-0 h-0"
                   referrerPolicy="no-referrer"
               />
           </div>
       )}
    </div>
  );
};

export const GameScreen = React.memo(GameScreenComponent, (prevProps, nextProps) => {
    const prev = prevProps.engine;
    const next = nextProps.engine;

    // Primitives
    if (prev.screamer !== next.screamer) return false;
    if (prev.gameState !== next.gameState) return false;
    if (prev.activeModal !== next.activeModal) return false;
    if (prev.showPauseMenu !== next.showPauseMenu) return false;
    if (prev.showSettings !== next.showSettings) return false;
    if (prev.showDebug !== next.showDebug) return false;
    if (prev.showVolume !== next.showVolume) return false;
    if (prev.isTransitionLoading !== next.isTransitionLoading) return false;
    if (prev.isWaitingToStart !== next.isWaitingToStart) return false;
    if (prev.loading !== next.loading) return false;
    if (prev.loadingProgress !== next.loadingProgress) return false;
    if (prev.loadingMessage !== next.loadingMessage) return false;
    if (prev.currentLevelPath !== next.currentLevelPath) return false;
    if (prev.viewportFade !== next.viewportFade) return false;
    if (prev.showLevelUpText !== next.showLevelUpText) return false;
    if (prev.isLowHealth !== next.isLowHealth) return false;
    if (prev.isRadioDialogue !== next.isRadioDialogue) return false;
    if (prev.isMapView !== next.isMapView) return false;
    if (prev.deathAnimProgress !== next.deathAnimProgress) return false;
    if (prev.fallAnimProgress !== next.fallAnimProgress) return false;
    if (prev.disableMovement !== next.disableMovement) return false;
    if (prev.disableWalking !== next.disableWalking) return false;
    if (prev.disableActions !== next.disableActions) return false;
    if (prev.cinematicMode !== next.cinematicMode) return false;
    if (prev.resolutionDivisor !== next.resolutionDivisor) return false;
    if (prev.inspectZoom !== next.inspectZoom) return false;

    // Dialogue-specific primitives
    if (prev.currentNode !== next.currentNode) return false;
    if (prev.selectedOptionIndex !== next.selectedOptionIndex) return false;
    if (prev.lastNpcText !== next.lastNpcText) return false;
    if (prev.dialogueNPCName !== next.dialogueNPCName) return false;
    if (prev.dialogueNPCAsset !== next.dialogueNPCAsset) return false;
    if (prev.dialogueNPCInstanceId !== next.dialogueNPCInstanceId) return false;
    if (prev.dialogueNPCDefinitionId !== next.dialogueNPCDefinitionId) return false;
    if (prev.dialogueNPCVoice !== next.dialogueNPCVoice) return false;

    // Weapon-specific properties
    if (prev.currentHandSprite !== next.currentHandSprite) return false;
    if (prev.akimboHandSprite !== next.akimboHandSprite) return false;
    if (prev.handStyleFinal !== next.handStyleFinal) return false;
    if (prev.akimboHandStyleFinal !== next.akimboHandStyleFinal) return false;
    if (prev.brokenTransform !== next.brokenTransform) return false;
    if (prev.akimboBrokenTransform !== next.akimboBrokenTransform) return false;
    if (prev.brokenTransition !== next.brokenTransition) return false;
    if (prev.showWeaponHand !== next.showWeaponHand) return false;
    if (prev.isWeaponBroken !== next.isWeaponBroken) return false;
    if (prev.isAkimboWeaponBroken !== next.isAkimboWeaponBroken) return false;

    // Reference and array checks
    if (prev.settings !== next.settings) return false;
    if (prev.strings !== next.strings) return false;
    if (prev.lootData !== next.lootData) return false;
    if (prev.enemies !== next.enemies) return false;
    if (prev.activeCombatEnemies !== next.activeCombatEnemies) return false;
    if (prev.lootAnims !== next.lootAnims) return false;
    if (prev.boxMoveAnims !== next.boxMoveAnims) return false;
    if (prev.currentHighlightedTiles !== next.currentHighlightedTiles) return false;
    if (prev.escapeDirection !== next.escapeDirection) return false;
    if (prev.cinematicCamera !== next.cinematicCamera) return false;
    if (prev.activeTutorial !== next.activeTutorial) return false;
    if (prev.activeWeapon !== next.activeWeapon) return false;
    if (prev.activeAkimboWeapon !== next.activeAkimboWeapon) return false;
    if (prev.activeMapItem !== next.activeMapItem) return false;

    // Deep compare levelData
    if (prev.levelData !== next.levelData) {
        if (!prev.levelData || !next.levelData) return false;
        if (prev.levelData.name !== next.levelData.name) return false;
        if (prev.levelData.grid !== next.levelData.grid) return false;
        if (prev.levelData.tasks !== next.levelData.tasks) return false;
    }

    // Compare combat active and processing turn
    if (prev.combat !== next.combat) {
        if (!prev.combat || !next.combat) return false;
        if (prev.combat.isActive !== next.combat.isActive) return false;
        if (prev.combat.isProcessingTurn !== next.combat.isProcessingTurn) return false;
        if (prev.combat.activeAttackerId !== next.combat.activeAttackerId) return false;
        if (prev.combat.combatTimerBonus !== next.combat.combatTimerBonus) return false;
    }

    // Comprehensive Player check
    const pP = prev.player;
    const nP = next.player;
    if (pP !== nP) {
        if (!pP || !nP) return false;
        if (pP.hp !== nP.hp) return false;
        if (pP.maxHp !== nP.maxHp) return false;
        if (pP.level !== nP.level) return false;
        if (pP.xp !== nP.xp) return false;
        if (pP.maxXp !== nP.maxXp) return false;
        if (pP.availablePoints !== nP.availablePoints) return false;
        if (pP.characterId !== nP.characterId) return false;
        if (pP.pos.x !== nP.pos.x) return false;
        if (pP.pos.y !== nP.pos.y) return false;
        if (pP.dir !== nP.dir) return false;
        if (pP.dir360 !== nP.dir360) return false;
        if (pP.flashDuration !== nP.flashDuration) return false;
        if (pP.activeEffects !== nP.activeEffects) return false;
        if (pP.concussionLevel !== nP.concussionLevel) return false;
        if (pP.inventory !== nP.inventory) return false;
        if (pP.equipment !== nP.equipment) return false;
    }

    return true;
});
