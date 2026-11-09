import { useCallback } from 'react';
import { GameState, Item, PlayerEquipment, Enemy } from '../types';
import { createPlayer } from '../utils/playerLogic';
import { WORLD_MAP_PATHS, START_SECTOR_PATH, TUTORIAL_SECTOR_PATH } from '../data/levels';
import { ASSETS } from '../assets';
import { makeTextureAlpha } from '../utils/imageProcessing';
import { precalculateShards } from '../utils/particleSystem';
import { globalBufferCache } from '../components/raycaster/RaycasterUtils';
import { globalSpriteTintCache } from '../components/raycaster/SpriteCache';

export function useGameLifecycle({
    strings,
    settings,
    setSettings,
    setGameState,
    setLoading,
    setLoadingProgress,
    setLoadingLogs,
    setViewportFade,
    setEnemies,
    setCombat,
    aimingSys,
    setCombatTimerBonus,
    setManualReloadTrigger,
    setIsWaitingToStart,
    setPlayerDamageSource,
    enemyFlashesRef,
    explosionsRef,
    setLootData,
    setPickupAnim,
    setThrowAnim,
    clearCasingParticles,
    setLoadingMessage,
    preloadAllAssets,
    sounds,
    loadSound,
    prepareStream,
    enemiesDb,
    npcsDb,
    decorationsDb,
    masterSpriteMapRef,
    setSpriteMap,
    initialPlayerStateRef,
    itemsDb,
    setPlayer,
    setDelayedHp,
    loadLevel,
    isTransitioningToMenu,
    setIsTransitioningToMenu,
    setShowIntroVideo,
    loading,
    isWaitingToStart,
    resetDialogue,
    resetVisitedNodes,
    clearLog,
    setShowPauseMenu,
    setShowSettings,
    setShowDebug,
    setShowVolume,
    setActiveModal,
    showPauseMenu,
    showSettings,
    showDebug,
    showVolume,
    combat,
    gameState,
    availableActionsCount,
    addLog,
    activeWeapon,
    activeAkimboWeapon,
    weaponRef,
    akimboWeaponRef,
    triggerSwap,
    activeModal,
    currentMovementSys,
    triggerEnemyTurn,
    loadImage,
    sectorStatesRef,
    mapSnapshotsRef,
    setRoamingAnims,
    setCurrentLevelPath,
    clearExploredTiles,
    setLevelData,
    playSound,
    restoreDecals,
    setLookAroundAngle,
    setLookAroundPitch,
    setInspectZoom,
    setCinematicCamera,
    setCinematicMode,
    globalScriptFlagsRef
}: any) {
    const initializeGameSystems = async () => {
        const preloadPromises: Promise<any>[] = [];
        
        preloadPromises.push(document.fonts.load('400 12px "Caveat"').catch(() => {}));
        preloadPromises.push(document.fonts.load('500 12px "Caveat"').catch(() => {}));
        preloadPromises.push(document.fonts.load('600 12px "Caveat"').catch(() => {}));
        preloadPromises.push(document.fonts.load('700 12px "Caveat"').catch(() => {}));
        preloadPromises.push(document.fonts.load('500 12px "Jura"').catch(() => {}));
        preloadPromises.push(document.fonts.load('700 12px "Jura"').catch(() => {}));

        if (ASSETS.SPRITES.MENU_PARALLAX1) preloadPromises.push(loadImage(ASSETS.SPRITES.MENU_PARALLAX1));
        if (ASSETS.SPRITES.MENU_PARALLAX1_1) preloadPromises.push(loadImage(ASSETS.SPRITES.MENU_PARALLAX1_1));
        if (ASSETS.SPRITES.MENU_PARALLAX2) preloadPromises.push(loadImage(ASSETS.SPRITES.MENU_PARALLAX2));
        if (ASSETS.SPRITES.MENU_PARALLAX3) preloadPromises.push(loadImage(ASSETS.SPRITES.MENU_PARALLAX3));
        if (ASSETS.SPRITES.MENU_PARALLAX4) preloadPromises.push(loadImage(ASSETS.SPRITES.MENU_PARALLAX4));
        if (ASSETS.SPRITES.TITLE) preloadPromises.push(loadImage(ASSETS.SPRITES.TITLE));
        if (sounds.MENU_THEME) {
            const url = (ASSETS.SOUNDS as any)[sounds.MENU_THEME.assetId] || (ASSETS.SPRITES as any)[sounds.MENU_THEME.assetId];
            if (url) preloadPromises.push(prepareStream(url, 'MENU_THEME'));
        }
        
        return Promise.all(preloadPromises);
    };

    const startAudioAndGame = (enableSound: boolean) => {
        if (!strings || isTransitioningToMenu) return;
        setIsTransitioningToMenu(true);
        
        // 1. Show video immediately
        setShowIntroVideo(true);

        const lastChoice = localStorage.getItem('deadstorm_last_sound_choice');
        
        if (enableSound) {
            if (lastChoice === 'no') {
                setSettings((prev: any) => ({...prev, volume: { ...prev.volume, master: 100 }}));
            }
            localStorage.setItem('deadstorm_last_sound_choice', 'yes');
        } else {
            setSettings((prev: any) => ({...prev, volume: { ...prev.volume, master: 0 }}));
            localStorage.setItem('deadstorm_last_sound_choice', 'no');
        }
    };

    const handleVideoEnd = () => {
        setShowIntroVideo(false);
        setGameState(GameState.MENU);
    };

    const handleSkipTurn = () => {
        if (!strings) return;
        
        if (combat.isActive) {
            addLog(strings.logs.skip_turn || "Turn skipped.", 'INFO');
            triggerEnemyTurn(false);
        } else {
            currentMovementSys.handleWait();
        }
    };

    const finalizeGameStart = async (selectedCharId: 'male' | 'female', customPath?: string) => {
        if (!customPath || (customPath !== 'CUSTOM_EDITOR_LEVEL' && customPath !== sessionStorage.getItem('active_test_path'))) {
            sessionStorage.removeItem('active_test_path');
        }

        // Очистка кэша текстур и спрайтов для немедленного обновления изменений из редактора в игровой сессии
        const activeTestPath = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('active_test_path') : null;
        const isTesting = customPath === 'CUSTOM_EDITOR_LEVEL' || (activeTestPath && customPath === activeTestPath) || (typeof localStorage !== 'undefined' && localStorage.getItem('editor_test_level') !== null);

        if (isTesting) {
            if (globalBufferCache) globalBufferCache.clear();
            if (globalSpriteTintCache) globalSpriteTintCache.clear();

            if (masterSpriteMapRef && masterSpriteMapRef.current) {
                const map = masterSpriteMapRef.current;

                // Удаляем текстуры и локальные медиафайлы
                map.forEach((_val, key) => {
                    if (key.startsWith('TEX_') && key !== 'TEX_FALLBACK') {
                        map.delete(key);
                    }
                    if (key.startsWith('local://')) {
                        map.delete(key);
                    }
                });

                // Удаляем ключи из ASSETS.TEXTURES и ASSETS.SPRITES
                if (ASSETS) {
                    if (ASSETS.TEXTURES) {
                        Object.keys(ASSETS.TEXTURES).forEach(k => {
                            map.delete(k);
                            map.delete(`TEX_${k}`);
                        });
                    }
                    if (ASSETS.SPRITES) {
                        Object.keys(ASSETS.SPRITES).forEach(k => {
                            map.delete(k);
                            map.delete(`TEX_${k}`);
                        });
                    }
                }
            }
        }

        if (!strings) return;
        const S = strings;
        setLoading(true);
        setLoadingProgress(0);
        setLoadingLogs([]);
        setGameState(GameState.PLAYING);
        setViewportFade(1); 
        setEnemies(new Map());
        setCombat({ isActive: false, activeGroup: [], log: [], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0 });
        aimingSys.setAimingTargets([]);
        setCombatTimerBonus(0);
        setManualReloadTrigger(0);
        setIsWaitingToStart(false);

        // FIX: Clear visual effect states to prevent old effects (like blood) from re-triggering in the new session
        setPlayerDamageSource(null);
        if (enemyFlashesRef) enemyFlashesRef.current = [];
        if (explosionsRef) explosionsRef.current = [];
        setLootData(null);
        setPickupAnim(null);
        setThrowAnim(null);
        clearCasingParticles();

        if (sectorStatesRef && sectorStatesRef.current) sectorStatesRef.current.clear();
        if (globalScriptFlagsRef && globalScriptFlagsRef.current) {
            globalScriptFlagsRef.current = {};
        }
        if (mapSnapshotsRef && mapSnapshotsRef.current) mapSnapshotsRef.current.clear();
        if (setRoamingAnims) setRoamingAnims([]);
        if (setCurrentLevelPath) setCurrentLevelPath(null);
        if (clearExploredTiles) clearExploredTiles();
        if (setLookAroundAngle) setLookAroundAngle(0);
        if (setLookAroundPitch) setLookAroundPitch(0);
        if (setInspectZoom) setInspectZoom(0);
        if (setCinematicCamera) setCinematicCamera(null);
        if (setCinematicMode) setCinematicMode(false);

        setLoadingMessage(S.ui.loading.sprites);
        const preloadedMap = await preloadAllAssets(
            sounds,
            (pct: number, id: string, type: string) => {
                setLoadingProgress(Math.round(pct * 0.2)); // Scale to 20%
                let label = S.ui.loading.sprites;
                if (type === 'TEXTURE') label = S.ui.loading.textures;
                if (type === 'AUDIO') label = S.ui.loading.sounds;
                if (type === 'OPTIMIZE') label = (S.ui.loading as any).optimizing || 'Optimizing Textures...';
                setLoadingLogs((prev: string[]) => [...prev, `${label}: ${id}`]);
            },
            async (url: string) => { return await loadSound(url); },
            (url: string, id: string) => { return prepareStream(url, id); },
            enemiesDb, npcsDb, decorationsDb, masterSpriteMapRef.current
        );
        masterSpriteMapRef.current = preloadedMap;
        setSpriteMap(new Map(preloadedMap));

        // Process glass textures from items
        if (itemsDb) {
            Object.values(itemsDb).forEach((item: any) => {
                if (item.glassTextureId) {
                    const img = masterSpriteMapRef.current.get(item.glassTextureId) || masterSpriteMapRef.current.get(`TEX_${item.glassTextureId}`);
                    if (img && !(img as any).__hasAlphaApplied) {
                        const canvas = makeTextureAlpha(img, 0.4);
                        (canvas as any).__hasAlphaApplied = true;
                        masterSpriteMapRef.current.set(item.glassTextureId, canvas as any);
                        setSpriteMap(new Map(masterSpriteMapRef.current));
                        precalculateShards(item.glassTextureId, item.glassTextureId, masterSpriteMapRef.current, 0.25);
                    }
                }
            });
        }
        
        setLoadingMessage(S.ui.loading.gear);
        setLoadingLogs((prev: string[]) => [...prev, S.ui.loading.init_player]);
        setLoadingProgress(25);
        
        const localizeVal = (val: string | undefined) => {
            if (!val) return "";
            const idx = val.indexOf('/');
            if (idx !== -1) return settings.language === 'ru' ? val.substring(0, idx).trim() : val.substring(idx + 1).trim();
            return val;
        };

        let newPlayer: any = null;
        let finalConfig = initialPlayerStateRef.current?.config;
        const testConfigStr = localStorage.getItem("editor_test_player");
        if (testConfigStr) {
            try {
                finalConfig = JSON.parse(testConfigStr);
            } catch(e){}
        }

        if (finalConfig) {
            newPlayer = createPlayer(selectedCharId, finalConfig, itemsDb, localizeVal);
            setPlayer(newPlayer);
            setDelayedHp(newPlayer.hp);
        } 
        
        setLoadingLogs((prev: string[]) => [...prev, S.ui.loading.geometry]);
        setLoadingProgress(30);
        const nextPath = customPath || sessionStorage.getItem('deadstorm_next_game_path') || START_SECTOR_PATH;
        if (nextPath === TUTORIAL_SECTOR_PATH || nextPath === START_SECTOR_PATH) {
            localStorage.setItem('deadstorm_tutorial_prompted', 'true');
        }
        sessionStorage.removeItem('deadstorm_next_game_path');
        await loadLevel(nextPath, S, false, undefined, newPlayer);
    };

    const loadSavedGame = async (savedData: any) => {
        sessionStorage.removeItem('active_test_path');
        if (!strings) return;
        const S = strings;
        setLoading(true);
        setLoadingProgress(0);
        setLoadingLogs([]);
        setShowPauseMenu(false);
        setGameState(GameState.PLAYING);
        setViewportFade(1); 
        setEnemies(new Map());
        setCombat({ isActive: false, activeGroup: [], log: [], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0 });
        aimingSys.setAimingTargets([]);
        setCombatTimerBonus(0);
        setManualReloadTrigger(0);
        setIsWaitingToStart(false);

        // FIX: Clear visual effect states to prevent old effects (like blood) from re-triggering in the new session
        setPlayerDamageSource(null);
        if (enemyFlashesRef) enemyFlashesRef.current = [];
        if (explosionsRef) explosionsRef.current = [];
        setLootData(null);
        setPickupAnim(null);
        setThrowAnim(null);
        clearCasingParticles();

        if (sectorStatesRef && sectorStatesRef.current) sectorStatesRef.current.clear();
        if (globalScriptFlagsRef && globalScriptFlagsRef.current) {
            globalScriptFlagsRef.current = {};
        }
        if (mapSnapshotsRef && mapSnapshotsRef.current) mapSnapshotsRef.current.clear();
        if (setRoamingAnims) setRoamingAnims([]);
        if (setCurrentLevelPath) setCurrentLevelPath(null);
        if (clearExploredTiles) clearExploredTiles();
        if (setLookAroundAngle) setLookAroundAngle(0);
        if (setLookAroundPitch) setLookAroundPitch(0);
        if (setInspectZoom) setInspectZoom(0);
        if (setCinematicCamera) setCinematicCamera(null);
        if (setCinematicMode) setCinematicMode(false);

        setLoadingMessage(S.ui.loading.sprites);
        const preloadedMap = await preloadAllAssets(
            sounds,
            (pct: number, id: string, type: string) => {
                setLoadingProgress(Math.round(pct * 0.2)); // Scale to 20%
                let label = S.ui.loading.sprites;
                if (type === 'TEXTURE') label = S.ui.loading.textures;
                if (type === 'AUDIO') label = S.ui.loading.sounds;
                if (type === 'OPTIMIZE') label = (S.ui.loading as any).optimizing || 'Optimizing Textures...';
                setLoadingLogs((prev: string[]) => [...prev, `${label}: ${id}`]);
            },
            async (url: string) => { return await loadSound(url); },
            (url: string, id: string) => { return prepareStream(url, id); },
            enemiesDb, npcsDb, decorationsDb, masterSpriteMapRef.current
        );
        masterSpriteMapRef.current = preloadedMap;
        setSpriteMap(new Map(preloadedMap));

        // Process glass textures from items
        if (itemsDb) {
            Object.values(itemsDb).forEach((item: any) => {
                if (item.glassTextureId) {
                    const img = masterSpriteMapRef.current.get(item.glassTextureId) || masterSpriteMapRef.current.get(`TEX_${item.glassTextureId}`);
                    if (img && !(img as any).__hasAlphaApplied) {
                        const canvas = makeTextureAlpha(img, 0.4);
                        (canvas as any).__hasAlphaApplied = true;
                        masterSpriteMapRef.current.set(item.glassTextureId, canvas as any);
                        setSpriteMap(new Map(masterSpriteMapRef.current));
                        precalculateShards(item.glassTextureId, item.glassTextureId, masterSpriteMapRef.current, 0.25);
                    }
                }
            });
        }
        
        setLoadingMessage(S.ui.loading.gear);
        setLoadingLogs((prev: string[]) => [...prev, "Restoring environment caches..."]);
        setLoadingProgress(25);
        
        // Temporarily clear sector cache so loadLevel runs fresh and initializes local textures/masks
        if (sectorStatesRef && sectorStatesRef.current) sectorStatesRef.current.clear();
        if (globalScriptFlagsRef && globalScriptFlagsRef.current) {
            globalScriptFlagsRef.current = {};
        }
        
        // This will run parseLevelData, generate textures, and update sprite arrays inside useLevelSystem
        if (loadLevel) await loadLevel(savedData.currentLevelPath, S, true, undefined, savedData.player, true);

        setLoadingLogs((prev: string[]) => [...prev, "Restoring loaded state..."]);
        setLoadingProgress(35);

        const localizeVal = (val: string | undefined) => {
            if (!val) return "";
            const idx = val.indexOf('/');
            if (idx !== -1) return settings.language === 'ru' ? val.substring(0, idx).trim() : val.substring(idx + 1).trim();
            return val;
        };

        const reLocalizeObj = (obj: any) => {
            if (!obj) return;
            if (Array.isArray(obj)) {
                obj.forEach(reLocalizeObj);
            } else if (typeof obj === 'object') {
                if (obj.rawName) obj.name = localizeVal(obj.rawName);
                if (obj.rawDescription) obj.description = localizeVal(obj.rawDescription);
                if (obj.definitionId && enemiesDb && enemiesDb[obj.definitionId]) {
                   obj.name = localizeVal(enemiesDb[obj.definitionId].name);
                   obj.description = localizeVal(enemiesDb[obj.definitionId].description || enemiesDb[obj.definitionId].name);
                   obj.rawName = enemiesDb[obj.definitionId].name; 
                }
                if (obj.definitionId && npcsDb && npcsDb[obj.definitionId]) {
                   obj.name = localizeVal(npcsDb[obj.definitionId].name);
                   obj.description = localizeVal(npcsDb[obj.definitionId].description || npcsDb[obj.definitionId].name);
                   obj.rawName = npcsDb[obj.definitionId].name;
                }
                
                // Do not recursively traverse DOM nodes or React objects or Map/Set to prevent infinite loops,
                // but we only traverse plain objects / arrays
                if (obj.constructor === Object) {
                   Object.values(obj).forEach(reLocalizeObj);
                }
            }
        };

        if (savedData.player) reLocalizeObj(savedData.player);
        if (savedData.levelData) {
            reLocalizeObj(savedData.levelData);
            if (savedData.levelData.tasks) {
                savedData.levelData.tasks.forEach((t: any) => t.isSilentOnLoad = true);
            }
        }
        if (savedData.enemies) savedData.enemies.forEach((enemy: any) => reLocalizeObj(enemy[1] || enemy));
        
        if (savedData.sectorStates) {
            Object.values(savedData.sectorStates).forEach((sData: any) => {
                reLocalizeObj(sData.levelData);
                if (sData.levelData && sData.levelData.tasks) {
                    sData.levelData.tasks.forEach((t: any) => t.isSilentOnLoad = true);
                }
                if (sData.enemies) sData.enemies.forEach((enemy: any) => reLocalizeObj(enemy[1] || enemy));
            });
        }
        
        // Restore state over the freshly loaded generic level
        setPlayer(savedData.player);
        setDelayedHp(savedData.player.hp);
        setLevelData(savedData.levelData);
        setEnemies(new Map(savedData.enemies));
        
        // Re-initialize level caches with the restored level grid to update enemy, explosive, and timed effects positions
        if (typeof window !== 'undefined' && (window as any).initializeLevelCaches) {
            (window as any).initializeLevelCaches(savedData.levelData.grid);
        }
        
        // Failsafe: Explicitly make sure to clear enemy ai states to prevent getting stuck
        setEnemies((prev: Map<string, Enemy>) => {
            const safeEnemies = new Map<string, Enemy>();
            prev.forEach((enemy, key) => {
                const copy = { ...enemy };
                // If they were stuck in COMBAT state during save, clear them into a roaming state
                if (copy.aiState === 'COMBAT') {
                    copy.aiState = copy.movementType === 'roaming' ? 'PATROL' : 'IDLE';
                    copy.currentPath = [];
                    copy.targetPos = undefined;
                }
                safeEnemies.set(key, copy);
            });
            return safeEnemies;
        });

        setCurrentLevelPath(savedData.currentLevelPath);
        if(savedData.roamingAnims) setRoamingAnims(savedData.roamingAnims);
        
        // Restore sector states
        if (savedData.sectorStates) {
            const restoredSectors = new Map();
            Object.keys(savedData.sectorStates).forEach(key => {
                const sData = savedData.sectorStates[key];
                
                // Sanitize enemies in sector
                const sEnemies = new Map(sData.enemies);
                sEnemies.forEach((enemy: any, eKey: string) => {
                    const copy = { ...enemy };
                    if (copy.aiState === 'COMBAT') {
                        copy.aiState = copy.movementType === 'roaming' ? 'PATROL' : 'IDLE';
                        copy.currentPath = [];
                        copy.targetPos = undefined;
                    }
                    sEnemies.set(eKey, copy);
                });

                restoredSectors.set(key, {
                    levelData: sData.levelData,
                    enemies: sEnemies,
                    customWallBuffers: new Map(), // clear buffers
                    customFloorBuffers: new Map(),
                    roamingAnims: sData.roamingAnims || [],
                    decalEvents: sData.decalEvents || []
                });
            });
            if (sectorStatesRef) {
                sectorStatesRef.current = restoredSectors;
            }
            if (savedData.currentLevelPath && restoredSectors.has(savedData.currentLevelPath) && restoreDecals) {
                restoreDecals(restoredSectors.get(savedData.currentLevelPath).decalEvents);
            }
        }
        
        if (playSound) playSound('SYS_PICKUP');
        addLog(strings?.ui?.save_load?.loaded_success || 'Игра загружена/Game loaded.', 'SUCCESS');

        setLoading(false); 
        setIsWaitingToStart(false); 
        setViewportFade(0);
    };

    const finalizeLevelLoad = () => { 
        if (isWaitingToStart) { 
            if (loading) setLoading(false); 
            setIsWaitingToStart(false); 
            setTimeout(() => setViewportFade(0), 50); 
        } 
    };

    const returnToMenu = () => { 
        sessionStorage.removeItem('active_test_path');
        if (setCurrentLevelPath) setCurrentLevelPath(null);
        if (setLookAroundAngle) setLookAroundAngle(0);
        if (setLookAroundPitch) setLookAroundPitch(0);
        if (setInspectZoom) setInspectZoom(0);
        if (setCinematicCamera) setCinematicCamera(null);
        if (setCinematicMode) setCinematicMode(false);
        resetDialogue(); 
        resetVisitedNodes();
        clearLog(); 
        clearCasingParticles();
        localStorage.removeItem("editor_test_level");
        setPlayer(prev => ({ ...prev, hp: prev.maxHp > 0 ? prev.maxHp : 100, concussionLevel: 0 }));
        if (setEnemies) setEnemies(new Map());
        if (setCombat) setCombat({ isActive: false, activeGroup: [], log: [], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0 });
        if (setLevelData) setLevelData(null);
        if (setRoamingAnims) setRoamingAnims([]);
        if (clearExploredTiles) clearExploredTiles();
        if (sectorStatesRef && sectorStatesRef.current) sectorStatesRef.current.clear();
        if (globalScriptFlagsRef && globalScriptFlagsRef.current) globalScriptFlagsRef.current = {};
        if (mapSnapshotsRef && mapSnapshotsRef.current) mapSnapshotsRef.current.clear();
        setGameState(GameState.MENU); 
        setViewportFade(1); 
        setShowPauseMenu(false); 
        setShowSettings(false); 
        setShowDebug(false); 
        setShowVolume(false); 
        setActiveModal(null); 
    };

    const returnToEditor = () => { 
        sessionStorage.removeItem('active_test_path');
        if (setCurrentLevelPath) setCurrentLevelPath(null);
        if (setLookAroundAngle) setLookAroundAngle(0);
        if (setLookAroundPitch) setLookAroundPitch(0);
        if (setInspectZoom) setInspectZoom(0);
        if (setCinematicCamera) setCinematicCamera(null);
        if (setCinematicMode) setCinematicMode(false);
        resetDialogue(); 
        resetVisitedNodes();
        clearLog(); 
        clearCasingParticles();
        setPlayer(prev => ({ ...prev, hp: prev.maxHp > 0 ? prev.maxHp : 100, concussionLevel: 0 }));
        setGameState(GameState.EDITOR); 
        setViewportFade(1); 
        setShowPauseMenu(false); 
        setShowSettings(false); 
        setShowDebug(false); 
        setShowVolume(false); 
        setActiveModal(null); 
    };

    const toggleModal = useCallback((modal: any) => {
        if (showPauseMenu || showSettings || showDebug || showVolume) return;
        if (combat.isProcessingTurn && modal !== 'actions' && modal !== null) return;
        if (gameState !== GameState.PLAYING && gameState !== GameState.COMBAT && gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && gameState !== GameState.CONSOLE_VIEW) return;
        if (modal === 'actions') { if (availableActionsCount === 0) { addLog(strings?.logs.no_actions || "No actions available", 'INFO'); return; } }
        
        if (modal === 'equipment' || modal === 'inventory') {
            weaponRef.current = activeWeapon;
            akimboWeaponRef.current = activeAkimboWeapon;
        }

        if (modal === null) {
            if (activeModal === 'equipment') {
                if (activeWeapon?.id !== weaponRef.current?.id || activeAkimboWeapon?.id !== akimboWeaponRef.current?.id) {
                    triggerSwap(weaponRef.current, activeWeapon, akimboWeaponRef.current, activeAkimboWeapon);
                }
            } else if (activeModal === 'inventory') {
                if ((activeWeapon?.type === 'MAP' || activeWeapon?.type === 'NOTE') && activeWeapon?.id !== weaponRef.current?.id) {
                    triggerSwap(weaponRef.current, activeWeapon, akimboWeaponRef.current, activeAkimboWeapon);
                }
            }
        }

        setActiveModal((prev: any) => prev === modal ? null : modal);
    }, [showPauseMenu, showSettings, showDebug, showVolume, combat.isProcessingTurn, gameState, availableActionsCount, strings, activeWeapon, activeAkimboWeapon, activeModal, triggerSwap, addLog, setActiveModal]);

    return {
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
    };
}
