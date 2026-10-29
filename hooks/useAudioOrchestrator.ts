
import { useEffect, useRef, useState } from 'react';
import { GameState, Player, Settings, Enemy } from '../types';
import { initVoice } from '../utils/voiceSynth';
import { getSoundOcclusion } from '../utils/combatLogic';

interface AudioOrchestratorProps {
    gameState: GameState;
    loading: boolean;
    combat: any;
    levelData: any;
    player: Player;
    settings: Settings;
    activeModal: string | null;
    playSound: (name: string, pos?: {x: number, y: number}, uniqueId?: string, delayMs?: number, reverbPos?: {x: number, y: number}, maxDistance?: number, loopOverride?: boolean, nonPositionalOverride?: boolean) => void;
    stopSound: (id: string) => void;
    stopAllSounds: () => void;
    playMusic: (track: string | null, opts?: any) => void;
    playWeather: (track: string | null, opts?: any) => void;
    showIntroVideo: boolean;
    updateSoundPosition: (id: string, pos: {x: number, y: number}, max: number, immediate?: boolean) => void;
    initContext: () => Promise<{ ctx: AudioContext, voiceBus: GainNode } | null>;
    enemies: Map<string, Enemy>;
    cinematicMode?: boolean;
    cinematicCamera?: { x: number, y: number, dir: number, pitch?: number } | null;
}

export const useAudioOrchestrator = ({
    gameState,
    loading,
    combat,
    levelData,
    player,
    settings,
    activeModal,
    playSound,
    stopSound,
    stopAllSounds,
    playMusic,
    playWeather,
    showIntroVideo,
    updateSoundPosition,
    initContext,
    enemies,
    cinematicMode = false,
    cinematicCamera = null
}: AudioOrchestratorProps) => {
    
    const currentSoundtrackRef = useRef<string | null>(null);
    const prevModalRef = useRef<string | null>(null);
    const lastEditorTestIdRef = useRef<number | null>(null);
    
    // Store set of currently active fly sound instance IDs
    const activeFlyIds = useRef<Set<string>>(new Set());
    const activeDecorationSoundIds = useRef<Map<string, string>>(new Map());
    const activeAmbientSoundTimeouts = useRef<Map<string, number>>(new Map());
    const nextRoamSoundTimeMap = useRef<Map<string, number>>(new Map());
    const enemyPositionsCache = useRef<Map<string, {x: number, y: number}>>(new Map());

    const depsRef = useRef({ player, levelData, gameState, loading, settings, enemies, combat, cinematicMode, cinematicCamera });
    useEffect(() => {
        depsRef.current = { player, levelData, gameState, loading, settings, enemies, combat, cinematicMode, cinematicCamera };
    });

    const isGameplayActiveRef = useRef(false);
    useEffect(() => {
        isGameplayActiveRef.current = ![
            GameState.START_SCREEN, 
            GameState.MENU, 
            GameState.CHAR_SELECT, 
            GameState.GAME_OVER, 
            GameState.VICTORY, 
            GameState.CREDITS,
            GameState.EDITOR
        ].includes(gameState) && !loading;
    }, [gameState, loading]);

    // --- AMBIENT SOURCES (FLIES) ---
    // Returns a list of valid corpse coordinates (rotting, in range), sorted by distance
    const getValidFlySources = (limit: number) => {
        const { levelData, player, cinematicMode, cinematicCamera } = depsRef.current;
        if (!levelData) return [];
        const useCam = cinematicMode && cinematicCamera;
        const refPos = useCam ? cinematicCamera : player.pos;

        const range = 4;
        const px = Math.floor(refPos.x);
        const py = Math.floor(refPos.y);
        const yMin = Math.max(0, py - range);
        const yMax = Math.min(levelData.height - 1, py + range);
        const xMin = Math.max(0, px - range);
        const xMax = Math.min(levelData.width - 1, px + range);
        
        const now = Date.now();
        const FLY_SPAWN_DELAY = 60000; 
        const sources = [];

        for (let y = yMin; y <= yMax; y++) {
            for (let x = xMin; x <= xMax; x++) {
                if (levelData.grid[y][x].corpses?.length > 0) {
                    const hasRottingCorpse = levelData.grid[y][x].corpses.some((c: any) => {
                        return (now - (c.bloodStartTime || 0)) > FLY_SPAWN_DELAY;
                    });

                    if (hasRottingCorpse) {
                        const distSq = (x - refPos.x)**2 + (y - refPos.y)**2;
                        if (distSq <= range * range) {
                            const occlusion = getSoundOcclusion(refPos, { x, y }, levelData.grid, levelData.width, levelData.height);
                            if (occlusion >= 1.0) {
                                sources.push({ x, y, distSq });
                            }
                        }
                    }
                }
            }
        }
        
        sources.sort((a, b) => a.distSq - b.distSq);
        return sources.slice(0, limit);
    };

    // --- DECORATION (POSITIONAL) SOUNDS ---
    const getDecorationSoundSources = () => {
        const { levelData, player, cinematicMode, cinematicCamera } = depsRef.current;
        if (!levelData || !levelData.grid) return [];
        const useCam = cinematicMode && cinematicCamera;
        const refPos = useCam ? cinematicCamera : player.pos;

        const range = 20;
        const px = Math.floor(refPos.x);
        const py = Math.floor(refPos.y);
        const yMin = Math.max(0, py - range);
        const yMax = Math.min(levelData.height - 1, py + range);
        const xMin = Math.max(0, px - range);
        const xMax = Math.min(levelData.width - 1, px + range);
        
        const sources = [];

        for (let y = yMin; y <= yMax; y++) {
            for (let x = xMin; x <= xMax; x++) {
                const tile = levelData.grid[y][x];
                if (!tile) continue;
                const decs = tile.decorations && tile.decorations.length > 0
                    ? tile.decorations
                    : (tile.decoration ? [tile.decoration] : []);
                for (const dec of decs) {
                    if (dec && dec.soundId) {
                        const distSq = (x - refPos.x)**2 + (y - refPos.y)**2;
                        if (distSq <= range * range) {
                            sources.push({ x, y, distSq, soundId: dec.soundId });
                        }
                    }
                }
            }
        }
        
        return sources;
    };

    // --- TICKER THREAD ---
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isGameplayActiveRef.current) {
                // Clear flies
                for (const id of activeFlyIds.current) stopSound(id);
                activeFlyIds.current.clear();

                // Clear decorations
                for (const [id] of activeDecorationSoundIds.current) stopSound(id);
                activeDecorationSoundIds.current.clear();
                return;
            }

            // Flies update
            const MAX_FLY_SOURCES = 3;
            const validFlySources = getValidFlySources(MAX_FLY_SOURCES);
            const currentFlyFrameIds = new Set<string>();

            validFlySources.forEach(source => {
                const uniqueId = `FLIES_${source.x}_${source.y}`;
                currentFlyFrameIds.add(uniqueId);

                if (!activeFlyIds.current.has(uniqueId)) {
                    playSound('SYS_FLIES', { x: source.x, y: source.y }, uniqueId);
                    updateSoundPosition(uniqueId, { x: source.x, y: source.y }, 4, true);
                    activeFlyIds.current.add(uniqueId);
                    // Разбудить рендерер для отрисовки летающих мух / Wake up the renderer so fly particles can be spawned and animated
                    window.dispatchEvent(new CustomEvent('raycaster-look'));
                } else {
                    updateSoundPosition(uniqueId, { x: source.x, y: source.y }, 4, false);
                }
            });

            for (const id of activeFlyIds.current) {
                if (!currentFlyFrameIds.has(id)) {
                    stopSound(id);
                    activeFlyIds.current.delete(id);
                }
            }

            // Decorations update
            const validDecSources = getDecorationSoundSources();
            const currentDecFrameIds = new Set<string>();

            validDecSources.forEach(source => {
                const uniqueId = `DEC_${source.soundId}_${source.x}_${source.y}`;
                currentDecFrameIds.add(uniqueId);

                if (!activeDecorationSoundIds.current.has(uniqueId)) {
                    playSound(source.soundId, { x: source.x, y: source.y }, uniqueId);
                    updateSoundPosition(uniqueId, { x: source.x, y: source.y }, 20, true);
                    activeDecorationSoundIds.current.set(uniqueId, source.soundId);
                } else {
                    updateSoundPosition(uniqueId, { x: source.x, y: source.y }, 20, false);
                }
            });

            for (const [id] of activeDecorationSoundIds.current) {
                if (!currentDecFrameIds.has(id)) {
                    stopSound(id);
                    activeDecorationSoundIds.current.delete(id);
                }
            }

            // Destructure latest dependencies
            const { levelData, player, enemies, combat } = depsRef.current;

            // Ambient sounds ticker update
            if (levelData?.ambientSounds) {
                const playerFloor = (player as any).floor || 0;

                levelData.ambientSounds.forEach((ambient: any) => {
                    if (ambient.x !== undefined && ambient.y !== undefined) {
                        const uniqueId = `AMBIENT_${ambient.id}_${ambient.symbol || 'ABS'}_${ambient.x}_${ambient.y}`;
                        if (activeAmbientSoundTimeouts.current.has(uniqueId)) {
                            updateSoundPosition(uniqueId, { x: ambient.x, y: ambient.y }, ambient.radius || 20, false);
                        }
                    }
                });

                if (levelData.gridSounds) {
                    const floorGrid = levelData.gridSounds[playerFloor];
                    if (floorGrid) {
                        floorGrid.forEach((rowStr: string, y: number) => {
                            for (let x = 0; x < rowStr.length; x++) {
                                const char = rowStr[x];
                                if (char !== '.' && char !== ' ') {
                                    const def = levelData.ambientSounds?.find((s: any) => s.symbol === char);
                                    if (def) {
                                        const uniqueId = `AMBIENT_${def.id}_${char}_${x}_${y}`;
                                        if (activeAmbientSoundTimeouts.current.has(uniqueId)) {
                                            updateSoundPosition(uniqueId, { x, y }, def.radius || 20, false);
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            }

            // --- ENEMY PERIODIC ROAMING SOUNDS ---
            if (enemies && enemies.size > 0 && levelData?.grid) {
                const now = Date.now();
                const enemyPositions = new Map<string, {x: number, y: number}>();
                const height = levelData.height;
                const width = levelData.width;
                const grid = levelData.grid;

                // Validate and use our position cache
                const globalCache = typeof window !== 'undefined' ? (window as any).enemyPositionsCache : null;
                enemies.forEach((_, enemyId) => {
                    let cached = enemyPositionsCache.current.get(enemyId);
                    if (cached && grid[cached.y]?.[cached.x]?.enemyId === enemyId) {
                        enemyPositions.set(enemyId, cached);
                    } else if (globalCache && globalCache.has(enemyId)) {
                        cached = globalCache.get(enemyId);
                        if (cached && grid[cached.y]?.[cached.x]?.enemyId === enemyId) {
                            enemyPositions.set(enemyId, cached);
                            enemyPositionsCache.current.set(enemyId, cached);
                        }
                    }
                });

                // Robust grid-scanning fallback: if any enemy positions are missing in the cache,
                // scan the grid once to rebuild and fill them. This avoids desyncs and missing sounds.
                let missingAny = false;
                enemies.forEach((_, enemyId) => {
                    if (!enemyPositions.has(enemyId)) {
                        missingAny = true;
                    }
                });

                if (missingAny) {
                    for (let y = 0; y < height; y++) {
                        const row = grid[y];
                        if (!row) continue;
                        for (let x = 0; x < width; x++) {
                            const tile = row[x];
                            if (tile && tile.enemyId) {
                                const eId = tile.enemyId;
                                enemyPositions.set(eId, { x, y });
                                enemyPositionsCache.current.set(eId, { x, y });
                                if (globalCache) {
                                    globalCache.set(eId, { x, y });
                                }
                            }
                        }
                    }
                }

                enemies.forEach((enemy, enemyId) => {
                    const roamSound = enemy.sounds?.roam;
                    if (!roamSound) return;

                    const inCombat = combat?.isActive && (
                        !combat.activeGroup || 
                        combat.activeGroup.length === 0 || 
                        combat.activeGroup.some((g: any) => g.id === enemyId)
                    );
                    if (inCombat) return;

                    const pos = enemyPositions.get(enemyId);
                    if (!pos) return;

                    // Distance optimization: Only play and track roaming sounds if the enemy is reasonably close (within 20 tiles)
                    const dx = pos.x - player.pos.x;
                    const dy = pos.y - player.pos.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 400) { // 20 * 20 = 400 (max standard hearing distance)
                        return;
                    }

                    let minMs = 5000;
                    let maxMs = 15000;
                    const periodicityStr = enemy.sounds?.roamPeriodicity;
                    if (periodicityStr) {
                        const parts = periodicityStr.split('-');
                        if (parts.length === 2) {
                            const p0 = parseInt(parts[0], 10);
                            const p1 = parseInt(parts[1], 10);
                            if (!isNaN(p0) && !isNaN(p1)) {
                                minMs = p0;
                                maxMs = p1;
                            }
                        }
                    }

                    if (!nextRoamSoundTimeMap.current.has(enemyId)) {
                        const initialStagger = Math.random() * (maxMs - minMs);
                        nextRoamSoundTimeMap.current.set(enemyId, now + initialStagger);
                        return;
                    }

                    const nextTime = nextRoamSoundTimeMap.current.get(enemyId);
                    if (nextTime !== undefined && now >= nextTime) {
                        playSound(roamSound, { x: pos.x, y: pos.y }, `ROAM_${enemyId}_${now}`);
                        const nextDelay = minMs + Math.random() * (maxMs - minMs);
                        nextRoamSoundTimeMap.current.set(enemyId, now + nextDelay);
                    }
                });

                for (const oldId of nextRoamSoundTimeMap.current.keys()) {
                    if (!enemies.has(oldId)) {
                        nextRoamSoundTimeMap.current.delete(oldId);
                    }
                }
            }
            
        }, 1000);
        
        return () => clearInterval(interval);
    }, [playSound, stopSound, updateSoundPosition]);

    // --- HEARTBEAT ---
    useEffect(() => {
        const isCriticalHealth = ((player.hp > 0 && (player.hp / player.maxHp) <= 0.3) || gameState === GameState.DYING);
        if (isCriticalHealth && (gameState === GameState.PLAYING || gameState === GameState.COMBAT || gameState === GameState.DYING) && !loading) {
            // Heartbeat audio is driven by useVisualEffects.ts
        } else {
            stopSound('SYS_HEARTBEAT');
        }
    }, [player.hp, player.maxHp, gameState, loading, playSound, stopSound]);

    // --- UI SOUNDS ---
    useEffect(() => {
        const prev = prevModalRef.current;
        const curr = activeModal;
        const isOpen = (m: string | null) => m === 'inventory' || m === 'equipment';
        if (isOpen(curr) && !isOpen(prev)) {
            playSound('SYS_INVENTORY_OPEN');
        } else if (isOpen(prev) && !isOpen(curr)) {
            playSound('SYS_INVENTORY_CLOSE');
        }
        prevModalRef.current = curr;
    }, [activeModal, playSound]);

    // --- GAME OVER & MENU ---
    useEffect(() => {
        if (gameState === GameState.GAME_OVER || gameState === GameState.MENU) {
            stopAllSounds();
        }
    }, [gameState, stopAllSounds]);

    // --- MUSIC & WEATHER ---
    useEffect(() => {
        let desiredTrack: string | null = null;
        let isCombatMode = false;
        
        if (gameState === GameState.MENU || gameState === GameState.CHAR_SELECT || gameState === GameState.CREDITS) {
            desiredTrack = 'MENU_THEME';
        } else if (gameState === GameState.GAME_OVER) {
            desiredTrack = 'GAME_OVER';
        } else if (gameState === GameState.PLAYING && loading) {
            // Keep menu theme during loading if we came from there
            desiredTrack = currentSoundtrackRef.current === 'MENU_THEME' ? 'MENU_THEME' : currentSoundtrackRef.current;
        } else if (gameState === GameState.DYING) {
            // Keep the current track playing while dying
            desiredTrack = currentSoundtrackRef.current;
        } else if (gameState === GameState.EDITOR) {
            desiredTrack = null;
        } else if (combat.isActive) {
            desiredTrack = 'BATTLE';
            isCombatMode = true;
        } else if (levelData?.soundtrack) {
            desiredTrack = levelData.soundtrack;
        }
        
        // Don't play music during video intro
        if (showIntroVideo) {
            desiredTrack = null;
        }

        let forceRestartMusic = false;
        if (levelData?.isEditorTest && levelData.isEditorTest !== lastEditorTestIdRef.current) {
            forceRestartMusic = true;
            lastEditorTestIdRef.current = levelData.isEditorTest as number;
        }

        if (desiredTrack !== currentSoundtrackRef.current || forceRestartMusic) {
            if (desiredTrack === null) {
                playMusic(null, { fadeOutDuration: 0.5 });
            } else if (isCombatMode) {
                playMusic(desiredTrack, { fadeOutDuration: 0.5, fadeInDuration: 0.1, shouldResume: false });
            } else if (desiredTrack === 'GAME_OVER') {
                playMusic(desiredTrack, { fadeOutDuration: 0.5, fadeInDuration: 0.5, shouldResume: false });
            } else {
                const isReturningToMenu = desiredTrack === 'MENU_THEME' && currentSoundtrackRef.current !== null && currentSoundtrackRef.current !== 'MENU_THEME';
                playMusic(desiredTrack, { fadeOutDuration: 0.5, fadeInDuration: 0.5, shouldResume: !isReturningToMenu && !forceRestartMusic, forceRestart: forceRestartMusic });
            }
            currentSoundtrackRef.current = desiredTrack;
        }
        
        const isGameplayActiveWeather = ![
            GameState.START_SCREEN, 
            GameState.MENU, 
            GameState.CHAR_SELECT, 
            GameState.GAME_OVER, 
            GameState.VICTORY, 
            GameState.CREDITS,
            GameState.EDITOR
        ].includes(gameState) && !loading;
        
        if (isGameplayActiveWeather && levelData?.weather === 'rain') {
            playWeather('RAIN', { fadeInDuration: 0, fadeOutDuration: 0.5, forceRestart: forceRestartMusic });
        } else {
            playWeather(null, { fadeOutDuration: 1.0 });
        }
    }, [gameState, loading, levelData?.soundtrack, levelData?.weather, levelData?.isEditorTest, combat.isActive, playMusic, playWeather, showIntroVideo]);

    // --- GLOBAL CLICK ---
    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            if (!settings.volume.sound) return;
            const target = e.target as HTMLElement;
            const btn = target.closest('button');
            if (btn && !btn.hasAttribute('data-no-click-sound')) {
                // Ensure audio contexts are active on interaction
                initContext().then((res) => {
                    if (res) initVoice(res.ctx, res.voiceBus);
                    playSound('SYS_CLICK');
                });
            }
        };
        window.addEventListener('click', handleGlobalClick);
        return () => { window.removeEventListener('click', handleGlobalClick); };
    }, [playSound, settings.volume.sound, initContext]);

    // --- SECTOR AMBIENT SOUNDS ---
    useEffect(() => {
        if (!isGameplayActiveRef.current) {
            for (const [id, timer] of activeAmbientSoundTimeouts.current.entries()) {
                clearTimeout(timer);
                stopSound(id);
            }
            activeAmbientSoundTimeouts.current.clear();
            return;
        }

        const validAmbientSoundInstances: any[] = [];
        if (levelData?.ambientSounds) {
           // Fallback for explicitly defined absolute coordinates
           validAmbientSoundInstances.push(...levelData.ambientSounds.filter((s:any) => s.x !== undefined && s.y !== undefined));

           if (levelData.gridSounds) {
               levelData.gridSounds.forEach((floorGrid: string[], floorIdx: number) => {
                   const playerFloor = (player as any).floor || 0;
                   if (floorIdx !== playerFloor) return; // Only process sounds on the current floor, or omit this check if they should be 3D. Let's stick to current floor for now.
                   // Wait, the sound system ignores z, so let's only play sounds on current floor so they don't overlap wildly
                   floorGrid.forEach((rowStr: string, y: number) => {
                       for (let x = 0; x < rowStr.length; x++) {
                           const char = rowStr[x];
                           if (char !== '.' && char !== ' ') {
                               const def = levelData.ambientSounds?.find((s:any) => s.symbol === char);
                               if (def) {
                                   validAmbientSoundInstances.push({ ...def, x, y, symbol: char });
                               }
                           }
                       }
                   });
               });
           }
        }

        const currentIds = new Set<string>();

        validAmbientSoundInstances.forEach((ambient: any) => {
            const uniqueId = `AMBIENT_${ambient.id}_${ambient.symbol || 'ABS'}_${ambient.x}_${ambient.y}`;
            currentIds.add(uniqueId);

            if (!activeAmbientSoundTimeouts.current.has(uniqueId)) {
                if (ambient.loop) {
                    // Constant looping sound, no timeout scheduling needed!
                    activeAmbientSoundTimeouts.current.set(uniqueId, -1 as any);
                    playSound(ambient.id, { x: ambient.x, y: ambient.y }, uniqueId, 0, undefined, ambient.radius || 20, true, ambient.nonPositional);
                    updateSoundPosition(uniqueId, { x: ambient.x, y: ambient.y }, ambient.radius || 20, true);
                } else {
                    const scheduleNext = () => {
                        if (!activeAmbientSoundTimeouts.current.has(uniqueId)) return;

                        // Play the sound
                        playSound(ambient.id, { x: ambient.x, y: ambient.y }, uniqueId, 0, undefined, ambient.radius || 20, undefined, ambient.nonPositional);

                        const min = ambient.minInterval || 1000;
                        const max = ambient.maxInterval || 5000;
                        const nextInterval = min + Math.random() * (max - min);

                        const timerId = window.setTimeout(scheduleNext, nextInterval);
                        activeAmbientSoundTimeouts.current.set(uniqueId, timerId);
                    };

                    const min = ambient.minInterval || 1000;
                    const max = ambient.maxInterval || 5000;
                    const initialDelay = min + Math.random() * (max - min);
                    const timerId = window.setTimeout(scheduleNext, initialDelay);
                    activeAmbientSoundTimeouts.current.set(uniqueId, timerId);
                }
            }
        });

        // Cleanup stale sources
        for (const [id, timer] of activeAmbientSoundTimeouts.current.entries()) {
            if (!currentIds.has(id)) {
                clearTimeout(timer);
                stopSound(id);
                activeAmbientSoundTimeouts.current.delete(id);
            }
        }
    }, [isGameplayActiveRef.current, levelData, playSound, stopSound]);

};
