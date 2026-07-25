/*
  APP ROOT
  Integrates all systems and renders the View.
*/

import React from 'react';

import MainMenu from './components/MainMenu';
import CharacterSelectScreen from './components/CharacterSelectScreen';
import GameOverScreen from './components/GameOverScreen';
import StartScreen from './components/StartScreen';
import CreditsScreen from './components/CreditsScreen';
import { GameScreen } from './components/GameScreen';
import { LevelBuilder } from './components/levelBuilder/LevelBuilder';
import { AchievementNotificationOverlay } from './components/AchievementNotificationOverlay';
import ToastContainer from './components/Toast';

import { GameState } from './types';
import { useGameEngine } from './hooks/useGameEngine';

import { useGamepadController, getInteractiveElements } from './hooks/useGamepadController';

const App: React.FC = () => {
  const engine = useGameEngine();
  const {
      gameState, setGameState, settings, setSettings, activeModal, setActiveModal,
      showPauseMenu, setShowPauseMenu, showSettings, setShowSettings, showDebug, setShowDebug,
      showVolume, setShowVolume, lootData, enemies,
      enemyFlashesRef, playerDamageSource, explosionsRef, isTransitioningToMenu,
      showIntroVideo, setIsVideoReady, isVideoReady,
      raycasterRef, roamingAnims, resolutionDivisor, pickupAnim, throwAnim,
      isLandscape, headerHeight, iframeTopOffset, player, setPlayer, inventoryStats, totalAmmoInInventory, gainLevel,
      toasts, lootAnims, addLog,
      strings, loading, loadingMessage, loadingProgress, loadingLogs,
      isWaitingToStart, isGameInitialized, spriteMap, loadingLogRef, animations,
      isFlashlightOn, flashlightBatteryRatio, almostBrokenSlots, levelData, currentLevelPath,
      wallTexture, floorTexture, doorTexture, skyTexture, ceilingTexture,
      viewportFade, playSound, showLevelUpText, shakeEvent,
      isLowHealth, activeWeapon, weaponStyle,
      currentNode, selectedOptionIndex, localize, lastNpcText,
      effectSys, combat, enemyMoveAnim, boxMoveAnims, visualHitIds, handleVisualHit,
      activeCombatEnemies, escapeDirection, deathAnimProgress, gameOverType,
      currentMovementSys, inventorySys, aimingSys, throwingSys, inspectingSys,
      handleTouchStart, handleTouchMove, handleTouchEnd, canAim,
      handleAimInputWithAnim, handleThrowInputWithAnim, handleInspectInputWithAnim, handleShootWrapper, handleToggleLook,
      lookAroundAngle, setLookAroundAngle, lookAroundPitch, setLookAroundPitch, handleDialogueInput,
      initializeGameSystems, startAudioAndGame, handleVideoEnd, handleSkipTurn, finalizeGameStart, finalizeLevelLoad, returnToMenu, returnToEditor, toggleModal,
      dialogueNPCName, dialogueNPCAsset, dialogueNPCInstanceId, dialogueNPCDefinitionId, dialogueNPCVoice,
      currentHandSprite, akimboHandSprite, getTintMatrix, mainTintId, akimboTintId, handStyleFinal, akimboHandStyleFinal, brokenTransform, akimboBrokenTransform,
      brokenTransition, showWeaponHand, isWeaponBroken, isAkimboWeaponBroken, isMapView, activeMapItem,
      currentHighlightedTiles, handleEscapeResult, handleCombatTimeout, handleReloadResult,
      initAudio, onMenuStart, disableMovement, disableWalking, disableActions, mapSnapshotsRef,
      preparePlayerAttack, handlePlayerAttack, combatTimerBonus
  } = engine;

  // Gamepad refs are now managed inside the useGamepadController hook

  // Track active input mode (Gamepad vs Keyboard/Mouse)
  React.useEffect(() => {
    const handleMouseActivity = () => {
      document.body.classList.remove('gamepad-navigation-active');
    };

    window.addEventListener('mousemove', handleMouseActivity);
    window.addEventListener('mousedown', handleMouseActivity);
    window.addEventListener('touchstart', handleMouseActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseActivity);
      window.removeEventListener('mousedown', handleMouseActivity);
      window.removeEventListener('touchstart', handleMouseActivity);
    };
  }, []);

  // Gamepad UI Navigation & Gameplay Controller Hook
  useGamepadController({
    gameState,
    setGameState,
    loading,
    viewportFade,
    activeModal,
    showSettings,
    setShowSettings,
    showPauseMenu,
    setShowPauseMenu,
    player,
    currentMovementSys,
    inventorySys,
    aimingSys,
    throwingSys,
    inspectingSys,
    handleDialogueInput,
    combat,
    disableMovement,
    disableWalking,
    toggleModal,
    lookAroundAngle,
    setLookAroundAngle,
    lookAroundPitch,
    setLookAroundPitch,
    handleAimInputWithAnim,
    handleThrowInputWithAnim,
    handleInspectInputWithAnim,
    settings,
    handleInteract: currentMovementSys.handleInteract,
    handleSkipTurn,
    handleReload: () => inventorySys.handleReloadAction(),
    handleShoot: handleShootWrapper,
    handleToggleLook,
  });

  // Autofocus the first candidate when page/modal transitions occur
  React.useEffect(() => {
    const isPlayingGame = ![GameState.START_SCREEN, GameState.MENU, GameState.CREDITS, GameState.EDITOR, GameState.CHAR_SELECT, GameState.VICTORY, GameState.GAME_OVER].includes(gameState);
    if (isPlayingGame && !showSettings && !showPauseMenu && !activeModal) return;

    const timer = setTimeout(() => {
      const candidates = getInteractiveElements(activeModal, showSettings, showPauseMenu);
      if (candidates.length > 0) {
        // Automatically set the initial focus on transitions or menu loading
        candidates[0].focus({ preventScroll: true });
        candidates[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [gameState, showSettings, showPauseMenu, activeModal]);

  const rootStyle = React.useMemo(() => {
    if (iframeTopOffset && iframeTopOffset > 0) {
      return { paddingTop: `${iframeTopOffset}px` };
    }
    return undefined;
  }, [iframeTopOffset]);

  if (!strings) return <div className="bg-black h-full w-full flex items-center justify-center text-white font-mono">SYSTEM_INIT...</div>;

  const renderScreen = () => {
      if (gameState === GameState.START_SCREEN) {
          return (
            <StartScreen 
                strings={strings}
                showIntroVideo={showIntroVideo}
                isVideoReady={isVideoReady}
                isTransitioningToMenu={isTransitioningToMenu}
                startAudioAndGame={startAudioAndGame}
                initAudio={initAudio}
                handleVideoEnd={handleVideoEnd}
                setIsVideoReady={setIsVideoReady}
                preloadAssets={initializeGameSystems}
            />
          );
      }
      if (gameState === GameState.MENU) return <MainMenu strings={strings} loading={loading} loadingMessage={loadingMessage} settings={settings} spriteMap={spriteMap} engine={engine} onStart={onMenuStart} onUpdateSettings={setSettings} onAbout={() => setGameState(GameState.CREDITS)} />;
      if (gameState === GameState.CREDITS) return <CreditsScreen strings={strings} language={settings.language} onBack={() => setGameState(GameState.MENU)} onUnlockDebug={() => {
        localStorage.setItem('deadstorm_dev_mode', 'true');
        playSound('LEVELUP');
      }} />;
      if (gameState === GameState.EDITOR) return <LevelBuilder engine={engine} strings={strings} />;
      if (gameState === GameState.CHAR_SELECT) return <CharacterSelectScreen strings={strings.ui.char_select} spriteMap={spriteMap} onSelect={finalizeGameStart} onBack={() => { sessionStorage.removeItem('deadstorm_next_game_path'); setGameState(GameState.MENU); }} onBackText={strings.ui.credits?.btn_back || 'BACK'} playSound={playSound} />;
      if (gameState === GameState.VICTORY) return (<div className="flex flex-col h-full w-full bg-black items-center justify-center text-green-500 font-bold font-['Jura']"><h1 className="text-4xl tracking-widest mb-4">{strings.ui.victory.title}</h1><p className="text-gray-400 mb-8">{strings.ui.victory.subtitle}</p><button onClick={returnToMenu} className="px-6 py-2 border border-green-600 text-green-500 active:bg-green-900 uppercase touch-manipulation">{strings.ui.victory.button}</button></div>);
      
      if (gameState === GameState.GAME_OVER) {
          const handleLoadGameFromGameOver = () => {
            let latestSave: any = null;
            let latestTime = 0;
            for (let i = 1; i <= 3; i++) {
              const data = localStorage.getItem(`deadstorm_save_${i}`);
              if (data) {
                try {
                  const parsed = JSON.parse(data);
                  const saveTime = parsed.metadata?.timestamp || parsed.metadata?.saveTime || parsed.metadata?.date || 0;
                  const timeNum = typeof saveTime === 'number' ? saveTime : new Date(saveTime).getTime() || 0;
                  
                  if (!latestSave || timeNum > latestTime) {
                    latestSave = parsed;
                    latestTime = timeNum;
                  }
                } catch (e) {
                  // Игнорируем битые сохранения
                }
              }
            }
            if (latestSave && engine.loadSavedGame) {
              if (engine.playSound) {
                engine.playSound('LOAD');
              }
              engine.loadSavedGame(latestSave.saveData);
            }
          };

          return (
            <GameOverScreen 
                strings={strings.ui.game_over} 
                onReturnToMenu={returnToMenu} 
                onReturnToEditor={(currentLevelPath === 'CUSTOM_EDITOR_LEVEL' || levelData?.isEditorTest || !!sessionStorage.getItem('active_test_path')) ? returnToEditor : undefined} 
                volume={(settings.volume.master / 100) * (settings.volume.sound / 100)} 
                vibrationEnabled={settings.vibration} 
                gameOverType={gameOverType} 
                onLoadGame={handleLoadGameFromGameOver} 
            />
          );
      }
      
      return <GameScreen engine={engine} />;
  };

  const isPlayingGame = ![GameState.START_SCREEN, GameState.MENU, GameState.CREDITS, GameState.EDITOR, GameState.CHAR_SELECT, GameState.VICTORY, GameState.GAME_OVER].includes(gameState);

  return (
      <div style={rootStyle} className="h-full w-full overflow-hidden bg-gray-900 relative">
          {renderScreen()}
          {isPlayingGame && <ToastContainer toasts={toasts} variant="center" />}
          {(!isPlayingGame || !isLandscape) && <AchievementNotificationOverlay strings={strings} />}
      </div>
  );
};

export default App;