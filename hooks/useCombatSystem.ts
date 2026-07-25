
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { CombatState, Enemy, CombatEnemyState, GameState, GameStrings, Player, Item } from '../types';
import { rollDice } from '../utils/dice';
import { 
    isValidCombatPosition, 
    calculateNextEnemyMove, 
    getVisibleCombatEnemies, 
    getVisibleCombatEnemiesLightweight,
    getEscapeDirection, 
    getLaneAlignment, 
    getEnemyPositions, 
    getVisibleDestructibleDecorations,
    getVisibleNPCs,
    getVisibleNPCsToGroup,
    hasLineOfSight,
    isBlocked,
    getIntersectingWindows,
    hasPitLineOfSight
} from '../utils/combatLogic';
import { getMaskBuffer, createShardParticles, createExplodingDecorationParticles } from '../utils/particleSystem';
import { findPath } from '../utils/aiLogic';
import animations from '../data/animations.json';

export const useCombatSystem = (
    player: Player,
    setPlayer: React.Dispatch<React.SetStateAction<Player>>,
    enemies: Map<string, Enemy>,
    setEnemies: React.Dispatch<React.SetStateAction<Map<string, Enemy>>>,
    playerHpRef: React.MutableRefObject<number>,
    levelData: any,
    setLevelData: React.Dispatch<React.SetStateAction<any>>,
    strings: GameStrings | null,
    addLog: (text: string, type?: any) => void,
    setGameState: (state: GameState) => void,
    spriteMap: Map<string, HTMLImageElement>,
    triggerDamageEffect: (heavy: boolean) => void,
    triggerMuzzleFlash: () => void, 
    triggerWeaponAnimation: (hand?: 'main' | 'akimbo' | 'both') => void,
    triggerAttackVibration: (pattern?: number | number[]) => void,
    setManualReloadTrigger: React.Dispatch<React.SetStateAction<number>>,
    resetAnimation: () => void,
    forceUpdate: React.Dispatch<React.SetStateAction<number>>,
    godMode: boolean,
    triggerEnemyFlash?: (x: number, y: number) => void,
    onPlayerDamaged?: (sourceX: number, sourceY: number) => void,
    playSound?: (soundName: string, pos?: {x: number, y: number}, uniqueId?: string, delayMs?: number) => void,
    itemsDb?: any,
    triggerLootDrop?: (item: Item, startX: number, startY: number) => void,
    language: 'en' | 'ru' = 'en',
    applyEffect?: (effectId: string) => void,
    processEffects?: () => void,
    onCombatRoundEnd?: () => void,
    addSplatter?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR', intensity?: number, face?: number) => void,
    triggerExplosion?: (x: number, y: number, damageDice: string, range: number, assetId?: string, gridOverride?: any[][]) => void,
    decorationsDb?: any,
    spawnCasing?: (weapon: Item) => void,
    spawnEnemyCasing?: (x: number, y: number, casing: { assetId: string, direction: 'left' | 'right', scale?: number, groundScaleMultiplier?: number }, casingSound?: string) => void,
    applyTileDamageToEntity?: (entityId: string | 'PLAYER', x: number, y: number) => void,
    checkTriggers?: (type: string, params: any) => void,
    checkIsFalling?: () => boolean,
    onSpawnParticles?: (particles: any[]) => void,
    activeExplosionsRef?: React.MutableRefObject<number>,
    showToast?: (msg: string, type?: 'success'|'error'|'info'|'warning', durationMs?: number) => void,
    enemiesStateRef?: React.MutableRefObject<Map<string, Enemy>>,
    combatOverlayDebug?: boolean
) => {
    const [combat, setCombat] = useState<CombatState>({
        isActive: false, activeGroup: [], log: [], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0
    });
    
    const fallbackEnemiesRef = useRef(enemies);
    useEffect(() => {
        fallbackEnemiesRef.current = enemies;
    }, [enemies]);
    const liveEnemiesRef = enemiesStateRef || fallbackEnemiesRef;
    
    const [combatTimerBonus, setCombatTimerBonus] = useState(0);
    const [enemyMoveAnim, setEnemyMoveAnim] = useState<{id: string, startX: number, startY: number, endX: number, endY: number, startTime: number, duration?: number} | null>(null);
    const [visualHitIds, setVisualHitIds] = useState<string[]>([]);
    
    const ambushTargetRef = useRef<string | null>(null);
    const shouldTriggerEnemyTurnRef = useRef(false); 
    const isTriggeringTurnRef = useRef(false);
    const combatRef = useRef(combat);
    const brokenItemsLoggedRef = useRef<Set<string>>(new Set());
    const almostBrokenItemsLoggedRef = useRef<Set<string>>(new Set());
    const sideEffectsQueueRef = useRef<Array<() => void>>([]);
    const playerManuallyTurnedToEmptyDirRef = useRef<number | null>(null);
    const lastKnownPlayerDirRef = useRef<number>(player.dir);
    const combatEnemyPositionsCacheRef = useRef<Map<string, {x: number, y: number}>>(new Map());

    useEffect(() => {
        if (sideEffectsQueueRef.current.length > 0) {
            const effectsToRun = [...sideEffectsQueueRef.current];
            sideEffectsQueueRef.current = [];
            effectsToRun.forEach(fn => fn());
        }
    });
    const nextAkimboHandRef = useRef<'main' | 'akimbo'>('main');
    const lastFiredHandRef = useRef<'main' | 'akimbo'>('main');
    const akimboShotsRemainingRef = useRef(0);
    useEffect(() => { combatRef.current = combat; }, [combat]);

    // Robust automatic combat ender when all enemies in the activeGroup are dead or missing
    useEffect(() => {
        if (!combat.isActive) return;
        
        // Let's filter out decorations and see if any real active enemies are alive
        const realActiveEnemies = combat.activeGroup.filter(g => !g.id.startsWith('decor_'));
        
        // If there are no real enemies in the activeGroup, or all of them are dead/missing in the enemies map
        let hasAliveRealEnemy = false;
        for (const g of realActiveEnemies) {
            const e = enemies.get(g.id);
            if (e && e.hp > 0 && !e.isNPC) {
                hasAliveRealEnemy = true;
                break;
            }
        }
        
        if (!hasAliveRealEnemy) {
            console.log("[System] Auto-ending combat because no live enemies remain in the active group.");
            setManualReloadTrigger(0);
            setGameState(GameState.PLAYING);
            setCombat(prev => {
                if (!prev.isActive) return prev;
                return {
                    ...prev,
                    isActive: false,
                    activeGroup: [],
                    isProcessingTurn: false,
                    activeAttackerId: null
                };
            });
        }
    }, [enemies, combat.isActive, combat.activeGroup, setGameState, setManualReloadTrigger]);

    useEffect(() => {
        if (!combat.isActive || !levelData) {
            playerManuallyTurnedToEmptyDirRef.current = null;
            lastKnownPlayerDirRef.current = player.dir;
            return;
        }

        const isProcessing = combatRef.current.isProcessingTurn;
        const currentDir = player.dir;

        if (!isProcessing && currentDir !== lastKnownPlayerDirRef.current) {
            const roundedDir = Math.round(currentDir);
            
            const aliveEnemies = combatRef.current.activeGroup.filter((g: any) => {
                const e = liveEnemiesRef.current.get(g.id);
                return e && e.hp > 0 && !e.isNPC;
            });

            const currentGrid = levelDataRef.current?.grid || [];
            const height = currentGrid.length;
            const width = currentGrid[0]?.length || 0;
            const positions = getEnemyPositions(currentGrid, width, height);

            let hasEnemiesInDir = false;
            for (const g of aliveEnemies) {
                const pos = positions.find(p => p.id === g.id);
                if (pos) {
                    const lane = getLaneAlignment(pos, player.pos, roundedDir);
                    if (lane !== null) {
                        hasEnemiesInDir = true;
                        break;
                    }
                }
            }

            if (!hasEnemiesInDir) {
                playerManuallyTurnedToEmptyDirRef.current = roundedDir;
            } else {
                playerManuallyTurnedToEmptyDirRef.current = null;
            }
        }
        
        lastKnownPlayerDirRef.current = currentDir;
    }, [player.dir, player.pos, combat.isActive, levelData, enemies]);

    const preparePlayerAttack = useCallback(() => {
        let firingHand: 'main' | 'akimbo' = 'main';
        
        const mainWeapon = player.equippedWeapon || (itemsDb?.['fists'] ? { ...itemsDb['fists'], id: 'fists_weapon', name: strings?.ui?.header?.fists || 'Fists' } as Item : null);
        const akimboWeapon = player.equipment.weaponAkimbo || (mainWeapon?.id === 'fists_weapon' ? mainWeapon : null);

        if (akimboWeapon) {
            const mainHasAmmo = !mainWeapon || mainWeapon.currentAmmo === undefined || mainWeapon.currentAmmo > 0;
            const akimboHasAmmo = !akimboWeapon || akimboWeapon.currentAmmo === undefined || akimboWeapon.currentAmmo > 0;
            
            const mainHasDurability = !mainWeapon || mainWeapon.durability === undefined || mainWeapon.durability > 0;
            const akimboHasDurability = !akimboWeapon || akimboWeapon.durability === undefined || akimboWeapon.durability > 0;

            const mainCanFire = mainHasAmmo && mainHasDurability;
            const akimboCanFire = akimboHasAmmo && akimboHasDurability;
            
            if (nextAkimboHandRef.current === 'main') {
                if (mainCanFire) {
                    firingHand = 'main';
                    nextAkimboHandRef.current = 'akimbo';
                } else if (akimboCanFire) {
                    firingHand = 'akimbo';
                    nextAkimboHandRef.current = 'main';
                }
            } else {
                if (akimboCanFire) {
                    firingHand = 'akimbo';
                    nextAkimboHandRef.current = 'main';
                } else if (mainCanFire) {
                    firingHand = 'main';
                    nextAkimboHandRef.current = 'akimbo';
                }
            }
        }
        
        lastFiredHandRef.current = firingHand;
        triggerWeaponAnimation(firingHand);
        return firingHand;
    }, [player.equippedWeapon, player.equipment.weaponAkimbo, itemsDb, strings, triggerWeaponAnimation]);
    
    const levelDataRef = useRef(levelData);
    useEffect(() => { levelDataRef.current = levelData; }, [levelData]);

    const playerRef = useRef(player);
    useEffect(() => { playerRef.current = player; }, [player]);

    const t = (template: string | undefined, params: { [key: string]: string | number }) => {
        if (!template) return "???";
        return template.replace(/{(\w+)}/g, (_, key) => params[key] !== undefined ? String(params[key]) : `{${key}}`);
    };

    const localize = (text: string | undefined): string => {
        if (!text) return "";
        let localizedText = text;
        const idx = text.indexOf('/');
        if (idx !== -1) {
            const ru = text.substring(0, idx).trim();
            const en = text.substring(idx + 1).trim();
            localizedText = language === 'ru' ? ru : en;
        }
        
        // Parse gender-specific text: word{femaleWord}
        const isFemale = player.characterId === 'female';
        localizedText = localizedText.replace(/([a-zA-Zа-яА-ЯёЁ0-9_\-]+)\{([^}]+)\}/g, (match, maleWord, femaleWord) => {
            return isFemale ? femaleWord : maleWord;
        });

        return localizedText;
    };

    const activeCombatEnemies = useMemo(() => {
        const roundedDir = Math.round(player.dir360);
        if (!combat.isActive && !combatOverlayDebug) return [];
        if (!levelData) return [];

        let groupToUse = combat.activeGroup;
        if (!combat.isActive && combatOverlayDebug) {
            // Simulate combat activeGroup with ALL enemies from enemies map
            groupToUse = Array.from(enemies.keys()).map(id => ({
                id,
                alignment: 'CENTER' as const
            }));
        }

        const visible = getVisibleCombatEnemies(
          groupToUse, enemies, levelData.grid, levelData.width, levelData.height, player.pos, roundedDir, spriteMap, enemyMoveAnim, levelData.lightMap, decorationsDb
        );
        return visible.map((enemy: any) => ({
            ...enemy,
            name: localize(enemy.name)
        }));
    }, [combat.isActive, combat.activeGroup, combatOverlayDebug, levelData, enemies, Math.round(player.pos.x), Math.round(player.pos.y), Math.round(player.dir360), spriteMap, enemyMoveAnim, decorationsDb, language]);

    const handleVisualHit = (targetId: string) => {
        setVisualHitIds(prev => [...prev, targetId]);
        setTimeout(() => setVisualHitIds(prev => prev.filter(id => id !== targetId)), 300);
    };

    const escapeDirection = useMemo(() => {
        if (!levelData || !combat.isActive) return 0;
        return getEscapeDirection(player, levelData);
    }, [Math.round(player.pos.x), Math.round(player.pos.y), player.dir, levelData, combat.isActive]);

    // SMART OFFSET LOGIC
    const getSmartCorpseOffset = (x: number, y: number, grid: any[][]) => {
        const height = grid.length;
        const width = grid[0].length;
        let minX = -0.35, maxX = 0.35;
        let minY = -0.35, maxY = 0.35;
        if (x > 0) {
            const tile = grid[y][x-1];
            if (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN')) minX = 0;
        }
        if (x < width - 1) {
            const tile = grid[y][x+1];
            if (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN')) maxX = 0;
        }
        const offsetX = minX + Math.random() * (maxX - minX);
        const offsetY = minY + Math.random() * (maxY - minY);
        return { x: offsetX, y: offsetY };
    };

    // --- BLOOD DECALS LOGIC ---
    const spawnBloodDecals = (x: number, y: number) => {
        if (!addSplatter || !levelDataRef.current) return;
        
        // 1. FLOOR SPLATTER IS NOW HANDLED BY PARTICLES (EntityRenderer -> updateParticles -> callback)
        // Removed: addSplatter(x, y, 'FLOOR', 1.0); 

        // 2. Check walls for splatter chance (Immediate)
        const grid = levelDataRef.current.grid;
        const width = levelDataRef.current.width;
        const height = levelDataRef.current.height;

        const neighbors = [
            { dx: 0, dy: -1 }, // N
            { dx: 1, dy: 0 },  // E
            { dx: 0, dy: 1 },  // S
            { dx: -1, dy: 0 }  // W
        ];

        neighbors.forEach((dir, index) => {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const tile = grid[ny][nx];
                if (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN')) {
                    // 60% chance to stain the wall
                    if (Math.random() > 0.4) {
                        // Randomize position on the wall texture
                        // .1 to .9 to avoid edge clipping
                        const rx = 0.1 + Math.random() * 0.8;
                        const ry = 0.2 + Math.random() * 0.6; // Keep somewhat centered vertically
                        
                        // Determine which face of the wall we are hitting
                        // Neighbors: 0=N, 1=E, 2=S, 3=W
                        // If we hit N neighbor, we hit its South face (2)
                        // If we hit E neighbor, we hit its West face (3)
                        // If we hit S neighbor, we hit its North face (0)
                        // If we hit W neighbor, we hit its East face (1)
                        const face = (index + 2) % 4;
                        const type = tile.type === 'DOOR' ? 'DOOR' : 'WALL';

                        addSplatter(nx + rx, ny + ry, 0.2 + Math.random() * 0.6, type, 0.8, face);
                    }
                }
            }
        });
    };

    const startCombat = useCallback((activeGroup: CombatEnemyState[], forcedDir?: number, startWithEnemyTurn: boolean = false, ambushTargetId: string | null = null) => {
        if (!strings || activeGroup.length === 0) return;
        const isAlreadyInCombat = combat.isActive;
        setPlayer(prev => {
            if (forcedDir === undefined || forcedDir === prev.dir) return prev;
            return { ...prev, dir: forcedDir, dir360: forcedDir };
        });
        const primaryEnemy = liveEnemiesRef.current.get(activeGroup[0].id);
        const isDecoration = activeGroup[0].id.startsWith('decor_');
        const name = primaryEnemy ? primaryEnemy.name : (isDecoration ? null : "Unknown Hostile");
        setManualReloadTrigger(0);
        const processing = startWithEnemyTurn || !!ambushTargetId;
        
        // Add visible destructible decorations to the combat group
        let finalGroup = [...activeGroup];
        if (levelData) {
            const visibleDecorations = getVisibleDestructibleDecorations(player.pos, levelData.grid, levelData.width, levelData.height);
            visibleDecorations.forEach(d => {
                if (!finalGroup.some(g => g.id === d.id)) {
                    finalGroup.push({ id: d.id, alignment: 'CENTER' });
                }
            });
            // Add visible NPCs (visible to player only)
            const visibleNPCs = getVisibleNPCsToGroup(player.pos, finalGroup, enemies, levelData.grid, levelData.width, levelData.height);
            visibleNPCs.forEach(n => {
                if (!finalGroup.some(g => g.id === n.id)) {
                    finalGroup.push({ id: n.id, alignment: 'CENTER' });
                }
            });
        }

        const newState = { isActive: true, activeGroup: finalGroup, log: [], lastPlayerHit: 0, isProcessingTurn: processing, activeAttackerId: null, startTime: 0 };
        combatRef.current = newState;
        setCombat(newState);
        setCombatTimerBonus(0); 
        setGameState(GameState.COMBAT);
        if (ambushTargetId) {
            ambushTargetRef.current = ambushTargetId;
        }
        if (startWithEnemyTurn) {
            shouldTriggerEnemyTurnRef.current = true;
        }
        if (!isAlreadyInCombat) {
          if (activeGroup.length > 1) addLog(strings.logs.combat_multiple, 'DANGER');
          else if (name) addLog(t(strings.logs.combat_start, { name }), 'DANGER');
        }
    }, [combat.isActive, enemies, player.dir, setPlayer, setGameState, setManualReloadTrigger, strings, addLog, resetAnimation, levelData, player.pos]);

    const joinCombat = useCallback((enemyIds: string[]) => {
        if (!combatRef.current.isActive || enemyIds.length === 0) {
            if (!combatRef.current.isActive && enemyIds.length > 0) {
                const group = enemyIds.map(id => ({ id, alignment: 'CENTER' as const }));
                startCombat(group, undefined, true); 
            }
            return;
        }

        const existingIds = new Set(combatRef.current.activeGroup.map(g => g.id));
        const newEnemies: CombatEnemyState[] = [];
        
        enemyIds.forEach(id => {
            if (!existingIds.has(id)) {
                newEnemies.push({ id, alignment: 'CENTER' });
                const enemy = liveEnemiesRef.current.get(id);
                if (enemy && strings) {
                    // Do not log "joined combat" for NPCs
                    if (id.startsWith('npc_') || enemy.isNPC) {
                        return;
                    }
                    const template = strings.logs.combat_join || strings.logs.combat_start;
                    addLog(t(template, { name: enemy.name }), 'DANGER'); 
                }
            }
        });

        if (newEnemies.length === 0) return;

        setCombat(prev => ({
            ...prev,
            activeGroup: [...prev.activeGroup, ...newEnemies]
        }));
    }, [enemies, player.dir, strings, startCombat, addLog]);

    const handleEnemiesKilled = (targets: string[] | {id: string, cause: string}[], isExplosion: boolean = false, byPlayer: boolean = true): { item: Item, x: number, y: number }[] => {
        if (!strings || targets.length === 0) return [];
        
        const targetList = targets.map(t => typeof t === 'string' ? { id: t, cause: '' } : t);
        const targetIds = targetList.map(t => t.id);
        
        const actualEnemiesKilled = targetIds.filter(id => {
            const enemy = liveEnemiesRef.current.get(id);
            return enemy !== undefined;
        });

        if (byPlayer && actualEnemiesKilled.length > 0) {
            window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'first_blood' } }));
        }

        let accumulatedXp = 0;
        
        console.log("[DEBUG] handleEnemiesKilled processing targetIds:", targetIds);

        const deathMap = new Map<string, {
            loot: Item[];
            corpseAsset?: string;
            corpseScale?: number;
            cause?: string;
            name?: string;
        }>();

        const enemyPositions = new Map<string, {x: number, y: number}>();
        if (levelData && levelData.grid) {
            const grid = levelData.grid;
            const h = grid.length;
            const w = grid[0].length;
            for(let y = 0; y < h; y++) {
                for(let x = 0; x < w; x++) {
                    const tile = grid[y][x];
                    if (tile.enemyId && targetIds.includes(tile.enemyId)) {
                        enemyPositions.set(tile.enemyId, {x, y});
                    }
                }
            }
        }

        const visualsToTrigger: { item: Item, x: number, y: number }[] = [];

        targetIds.forEach(id => {
            const e = liveEnemiesRef.current.get(id);
            if (e) {
                if (byPlayer) {
                    const xp = e.baseXP * rollDice("1d6");
                    accumulatedXp += xp;
                    addLog(t(strings.logs.xp_gain, { xp: xp }), 'XP_GAIN');
                }
                
                addLog(t(strings.logs.enemy_destroyed, { name: localize(e.name) }), 'SUCCESS');
                
                let pos = enemyPositions.get(id);
                if (!pos && typeof window !== 'undefined' && (window as any).enemyPositionsCache?.has(id)) {
                    pos = (window as any).enemyPositionsCache.get(id);
                }
                if (!pos && e.x !== undefined && e.y !== undefined) {
                    pos = { x: e.x, y: e.y };
                }

                if (playSound && e.sounds?.death) {
                    playSound(e.sounds.death, pos ? { x: pos.x, y: pos.y } : undefined);
                }

                if (checkTriggers) {
                    const deathX = pos?.x ?? e.x ?? e.homePos?.x;
                    const deathY = pos?.y ?? e.y ?? e.homePos?.y;
                    const homeX = e.homePos?.x ?? deathX;
                    const homeY = e.homePos?.y ?? deathY;
                    const origHomeX = e.originalHomePos?.x ?? homeX;
                    const origHomeY = e.originalHomePos?.y ?? homeY;

                    checkTriggers('ON_ENEMY_DEFEAT', { 
                        enemyId: id,
                        definitionId: e.definitionId,
                        x: deathX,
                        y: deathY,
                        currentX: deathX,
                        currentY: deathY,
                        homeX: homeX,
                        homeY: homeY,
                        originalHomeX: origHomeX,
                        originalHomeY: origHomeY,
                    });
                }

                // --- TRIGGER BLOOD DECAL ON DEATH ---
                if (pos) {
                    spawnBloodDecals(pos.x, pos.y);
                }

                const drops: Item[] = [];
                if (e.loot && e.loot.length > 0 && itemsDb) {
                    e.loot.forEach(lootEntry => {
                        const roll = Math.random() * 100;
                        if (roll <= lootEntry.chanceToDrop) {
                            const dbItem = itemsDb[lootEntry.id];
                            if (dbItem) {
                                let count = dbItem.count;
                                if (lootEntry.min !== undefined && lootEntry.max !== undefined) {
                                    count = Math.floor(Math.random() * (lootEntry.max - lootEntry.min + 1)) + lootEntry.min;
                                }
                                const name = localize(dbItem.name);
                                const description = localize(dbItem.description);
                                const newItem: Item = {
                                    ...dbItem,
                                    id: Math.random().toString(36).substr(2, 9),
                                    name,
                                    description,
                                    rawName: dbItem.name,
                                    rawDescription: dbItem.description,
                                    count: count,
                                    currentAmmo: dbItem.type === 'AMMO' ? (count) : dbItem.currentAmmo,
                                    handAssetId: dbItem.handAsset,
                                    handFemaleAssetId: dbItem.handFemaleAsset,
                                    attackAssetId: dbItem.attackAsset,
                                    attackFemaleAssetId: dbItem.attackAssetFemale,
                                    maskAssetId: dbItem.maskAsset,
                                    durability: dbItem.maxDurability,
                                };
                                drops.push(newItem);
                                
                                if (strings.logs.enemy_drop) {
                                    addLog(t(strings.logs.enemy_drop, { enemy: e.name, item: newItem.name }), 'SUCCESS');
                                }
                            }
                        }
                    });
                }

                if (pos && drops.length > 0) {
                    drops.forEach(item => {
                        visualsToTrigger.push({ item, x: pos.x, y: pos.y });
                    });
                }

                deathMap.set(id, {
                    loot: drops,
                    corpseAsset: (isExplosion && e.assets.gibMask) ? undefined : e.assets.dead?.assetId,
                    corpseScale: e.assets.dead?.scale,
                    cause: targetList.find(t => t.id === id)?.cause,
                    name: localize(e.name)
                });
            }
        });

        setCombatTimerBonus(prev => prev + (250 * targetIds.length));
        
        setPlayer(prev => {
            let newXp = prev.xp + accumulatedXp;
            let newLevel = prev.level;
            let currentMaxXp = prev.maxXp;
            let newAvailablePoints = prev.availablePoints;

            while (newXp >= currentMaxXp) {
                newXp -= currentMaxXp;
                newLevel++;
                newAvailablePoints++;
                currentMaxXp = Math.floor(currentMaxXp * 1.2 + 200);
            }
            
            return { ...prev, xp: newXp, level: newLevel, maxXp: currentMaxXp, availablePoints: newAvailablePoints };
        });

        setEnemies(prev => {
            const next = new Map(prev);
            targetIds.forEach(id => next.delete(id));
            liveEnemiesRef.current = next;
            return next;
        });

        setLevelData((prev: any) => {
            if (!prev) return null;
            let removedCount = 0;
            const newGrid = prev.grid.map((row: any[], y: number) => row.map((tile: any, x: number) => {
                if (tile.enemyId && deathMap.has(tile.enemyId)) {
                    console.log("[DEBUG] handleEnemiesKilled CLEARING TILE for", tile.enemyId);
                    removedCount++;
                    const deathData = deathMap.get(tile.enemyId)!;
                    
                    let newItems = tile.items || [];
                    if (deathData.loot.length > 0) {
                        newItems = [...newItems, ...deathData.loot];
                    }

                    const newCorpses = tile.corpses ? [...tile.corpses] : [];
                    if (deathData.corpseAsset) {
                        let offset = { x: 0, y: 0 };
                        if (newCorpses.length > 0) {
                            offset = getSmartCorpseOffset(x, y, prev.grid);
                        }
                        
                        newCorpses.push({
                            assetId: deathData.corpseAsset,
                            scale: deathData.corpseScale ?? 0.5,
                            bloodStartTime: Date.now(),
                            offset,
                            isCharred: deathData.cause === 'fire' || (!!deathData.cause && deathData.cause.startsWith('fire')),
                            burntTime: deathData.cause === 'fire' || (!!deathData.cause && deathData.cause.startsWith('fire')) ? Date.now() : undefined,
                            name: deathData.name
                        });
                    }

                    return { 
                        ...tile, 
                        enemyId: undefined, 
                        npc: undefined,
                        corpses: newCorpses, 
                        items: newItems 
                    };
                }
                return tile;
            }));
            const newData = { ...prev, grid: newGrid };
            levelDataRef.current = newData; 
            return newData;
        });

        if (triggerLootDrop && visualsToTrigger.length > 0) {
            visualsToTrigger.forEach(v => triggerLootDrop(v.item, v.x, v.y));
        }

        setCombat(prev => {
            if (!prev.isActive) return prev;

            const remainingGroup = prev.activeGroup.filter(g => !targetIds.includes(g.id));
            const hasRealEnemies = remainingGroup.some(g => {
                if (g.id.startsWith('decor_')) return false;
                const e = liveEnemiesRef.current.get(g.id);
                if (!e || e.hp <= 0 || e.isNPC) return false;
                return true;
            });

            if (remainingGroup.length === 0 || !hasRealEnemies) {
              setManualReloadTrigger(0);
              setGameState(GameState.PLAYING);
              return { isActive: false, activeGroup: [], log: [], lastPlayerHit: 0, isProcessingTurn: false, activeAttackerId: null, startTime: 0 };
            }
            return { ...prev, activeGroup: remainingGroup };
        });

        return []; 
    };

    const triggerEnemyTurn = useCallback((
        isEscapeFail: boolean = false, 
        ignoredEnemyIds: string[] = [], 
        wasInEscapeMode: boolean = false,
        droppedItems: { item: Item, x: number, y: number }[] = []
    ) => {
        if (activeExplosionsRef && activeExplosionsRef.current > 0) {
            setTimeout(() => triggerEnemyTurn(isEscapeFail, ignoredEnemyIds, wasInEscapeMode, droppedItems), 100);
            return;
        }
        if (!strings) return; 
        
        akimboShotsRemainingRef.current = 0;

        // GUARD: Do not trigger enemy turn if combat is already over
        if (!combatRef.current.isActive && !wasInEscapeMode) return;

        // GUARD: Prevent double-triggering of enemy turn
        if (isTriggeringTurnRef.current) return;
        isTriggeringTurnRef.current = true;

        combatRef.current.isProcessingTurn = true;
        setCombat((prev: CombatState) => ({ ...prev, isProcessingTurn: true }));
        
        const tryProcessTurn = async () => {
            if (checkIsFalling && checkIsFalling()) {
                 setTimeout(tryProcessTurn, 200);
                 return;
            }
            
            const initialPlayerDir = playerRef.current.dir;
            let lastEnemyActionDir = initialPlayerDir;
            let currentEnemies: any[] = [];
            const enemyPosMap = new Map<string, {x: number, y: number}>();
            try {
                const currentLevelData = levelDataRef.current;
              if (!currentLevelData) {
                  isTriggeringTurnRef.current = false;
                  combatRef.current.isProcessingTurn = false;
                  setCombat((prev: CombatState) => ({ ...prev, isProcessingTurn: false }));
                  return;
              }

              const currentPlayer = playerRef.current;

              const width = currentLevelData.width; 
              const height = currentLevelData.height;
              
              const sourceGrid = currentLevelData.grid;
              const currentGrid = [...sourceGrid];
              const updateTile = (yLoc: number, xLoc: number, mutator: (t: any) => void) => {
                  if (currentGrid[yLoc] === sourceGrid[yLoc]) {
                       currentGrid[yLoc] = [...sourceGrid[yLoc]];
                  }
                  if (currentGrid[yLoc][xLoc] === sourceGrid[yLoc][xLoc]) {
                       currentGrid[yLoc][xLoc] = { ...sourceGrid[yLoc][xLoc] };
                  }
                  const oldEnemyId = currentGrid[yLoc][xLoc].enemyId;
                  mutator(currentGrid[yLoc][xLoc]);
                  const newEnemyId = currentGrid[yLoc][xLoc].enemyId;
                  if (oldEnemyId !== newEnemyId) {
                      if (oldEnemyId) {
                          combatEnemyPositionsCacheRef.current.delete(oldEnemyId);
                          if (typeof window !== 'undefined') (window as any).enemyPositionsCache?.delete(oldEnemyId);
                      }
                      if (newEnemyId) {
                          combatEnemyPositionsCacheRef.current.set(newEnemyId, { x: xLoc, y: yLoc });
                          if (typeof window !== 'undefined') (window as any).enemyPositionsCache?.set(newEnemyId, { x: xLoc, y: yLoc });
                      }
                  }
              };

              if (droppedItems.length > 0) {
                  droppedItems.forEach(drop => {
                      if (currentGrid[drop.y] && currentGrid[drop.y][drop.x]) {
                          updateTile(drop.y, drop.x, t => {
                              t.items = [...(t.items || []), drop.item];
                          });
                      }
                  });
              }

              if (ignoredEnemyIds.length > 0) {
                  ignoredEnemyIds.forEach(ignoredId => {
                      const cached = combatEnemyPositionsCacheRef.current.get(ignoredId) || (typeof window !== 'undefined' ? (window as any).enemyPositionsCache?.get(ignoredId) : null);
                      if (cached && currentGrid[cached.y]?.[cached.x]?.enemyId === ignoredId) {
                          updateTile(cached.y, cached.x, t => t.enemyId = undefined);
                      }
                      combatEnemyPositionsCacheRef.current.delete(ignoredId);
                  });
              }
            
              currentEnemies = combatRef.current.activeGroup.filter(g => { 
                  if (ignoredEnemyIds.includes(g.id)) return false; 
                  if (!liveEnemiesRef.current.has(g.id)) return false; 
                  const e = liveEnemiesRef.current.get(g.id); 
                  return e && e.hp > 0 && !e.isNPC; 
              });

              // SAFETY CHECK: If no valid enemies remain, end combat immediately
              if (currentEnemies.length === 0) {
                   if (combatRef.current.isActive) {
                       setCombat(prev => ({ ...prev, isActive: false, activeGroup: [], isProcessingTurn: false }));
                       setGameState(GameState.PLAYING);
                   }
                   return;
              }

              for (let i = currentEnemies.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [currentEnemies[i], currentEnemies[j]] = [currentEnemies[j], currentEnemies[i]]; }
              
              // OPTIMIZATION: Scan grid ONCE to find all enemies
              const allEnemies = getEnemyPositions(sourceGrid, width, height).filter(e => !ignoredEnemyIds.includes(e.id));
              allEnemies.forEach(e => enemyPosMap.set(e.id, e));
              
              const liveNpcHp = new Map<string, number>();
              
              let currentDir = currentPlayer.dir;
              
              for (const g of currentEnemies) {
                  if (playerHpRef.current <= 0) break; 
                  const enemy = liveEnemiesRef.current.get(g.id); 
                  if (!enemy || enemy.hp <= 0) continue;

                  const posForDir = enemyPosMap.get(g.id);
                  if (posForDir) {
                      const angle = Math.atan2(posForDir.y - currentPlayer.pos.y, posForDir.x - currentPlayer.pos.x);
                      let enemyDir360 = (angle / (Math.PI / 2)) + 1;
                      while (enemyDir360 < 0) enemyDir360 += 4;
                      while (enemyDir360 >= 4) enemyDir360 -= 4;
                      lastEnemyActionDir = Math.round(enemyDir360) % 4;
                  }

                  if (enemy.isNPC) {
                      // NPCs don't do anything in combat for now
                      continue;
                  }

                  let currentFlash = enemy.flashDuration || 0;
                  let currentAiState = enemy.aiState;

                  if (currentFlash > 0) {
                      currentFlash -= 1;
                      const newAiState = (currentFlash === 0 && currentAiState === 'FLASHED') ? 'IDLE' : currentAiState;
                      currentAiState = newAiState;
                      
                      const nextMap = new Map(liveEnemiesRef.current);
                      const e = nextMap.get(enemy.id);
                      if (e) {
                          nextMap.set(enemy.id, Object.assign({}, e, { flashDuration: currentFlash, aiState: newAiState }));
                      }
                      liveEnemiesRef.current = nextMap;
                      setEnemies(nextMap);
                  } else if (currentAiState === 'FLASHED') {
                      currentAiState = 'IDLE';
                      const nextMap = new Map(liveEnemiesRef.current);
                      const e = nextMap.get(enemy.id);
                      if (e) {
                          nextMap.set(enemy.id, Object.assign({}, e, { flashDuration: 0, aiState: 'IDLE' }));
                      }
                      liveEnemiesRef.current = nextMap;
                      setEnemies(nextMap);
                  }

                  const speed = enemy.speed ?? 1;
                  let remainingActions = speed;
                  
                  while (remainingActions > 0) {
                      // Re-fetch enemy position in case it moved during previous actions
                      const pos = enemyPosMap.get(g.id);
                      if (!pos) break;
                      
                      const ex = pos.x; const ey = pos.y;
                      const range = enemy.attackRange !== undefined ? enemy.attackRange : 1;

                      if ((currentFlash || 0) > 0) {
                          // Flashed! Run in a random direction once, lose turn.
                          const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                          for (let d = dirs.length - 1; d > 0; d--) { const r = Math.floor(Math.random() * (d + 1)); [dirs[d], dirs[r]] = [dirs[r], dirs[d]]; }
                          
                          for (const dir of dirs) {
                              const nx = ex + dir.dx;
                              const ny = ey + dir.dy;
                              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                  const t = currentGrid[ny][nx];
                                  if (t.type !== 'WALL' && !(t.type === 'DOOR' && t.door?.state !== 'OPEN') && !(t.decoration && t.decoration.blocking) && !(t.items && t.items.some((i: any) => i.blocking)) && !t.npc && !t.enemyId && (nx !== currentPlayer.pos.x || ny !== currentPlayer.pos.y)) {
                                      const isVisibleStart = hasLineOfSight(currentPlayer.pos, {x: ex, y: ey}, currentGrid, width, height, "PLAYER", false);
                                      const isVisibleEnd = hasLineOfSight(currentPlayer.pos, {x: nx, y: ny}, currentGrid, width, height, "PLAYER", false);
                                      const isHiding = !isVisibleStart && !isVisibleEnd;

                                      if (!isHiding) {
                                          const startAngle = Math.atan2(ey - currentPlayer.pos.y, ex - currentPlayer.pos.x);
                                          let startLookAtDir360 = (startAngle / (Math.PI / 2)) + 1;
                                          while (startLookAtDir360 < 0) startLookAtDir360 += 4;
                                          while (startLookAtDir360 >= 4) startLookAtDir360 -= 4;
                                          setPlayer(prev => ({ ...prev, dir360: startLookAtDir360 }));
                                          await new Promise(r => setTimeout(r, 450));

                                          const moveAngle = Math.atan2(ny - currentPlayer.pos.y, nx - currentPlayer.pos.x);
                                          let moveLookAtDir360 = (moveAngle / (Math.PI / 2)) + 1;
                                          while (moveLookAtDir360 < 0) moveLookAtDir360 += 4;
                                          while (moveLookAtDir360 >= 4) moveLookAtDir360 -= 4;
                                          setPlayer(prev => ({ ...prev, dir360: moveLookAtDir360 }));

                                          setEnemyMoveAnim({ id: enemy.id, startX: ex, startY: ey, endX: nx, endY: ny, startTime: performance.now(), duration: 400 / (enemy.speed || 1) });
                                      }
                                      
                                      updateTile(ey, ex, t => t.enemyId = undefined);
                                      updateTile(ny, nx, t => t.enemyId = enemy.id);
                                      
                                      setLevelData((prev: any) => {
                                          if (!prev || !prev.grid) return prev;
                                          const pGrid = [...prev.grid];
                                          if (pGrid[ey]) {
                                              pGrid[ey] = [...pGrid[ey]];
                                              if (pGrid[ey][ex] && pGrid[ey][ex].enemyId === enemy.id) {
                                                  pGrid[ey][ex] = { ...pGrid[ey][ex], enemyId: undefined };
                                              }
                                          }
                                          if (pGrid[ny]) {
                                              if (ey !== ny) pGrid[ny] = [...pGrid[ny]];
                                              if (pGrid[ny][nx]) {
                                                  pGrid[ny][nx] = { ...pGrid[ny][nx], enemyId: enemy.id };
                                              }
                                          }
                                          const newData = { ...prev, grid: pGrid };
                                          levelDataRef.current = newData;
                                          return newData;
                                      });
                                      
                                      enemyPosMap.set(g.id, {x: nx, y: ny});
                                      
                                      if (applyTileDamageToEntity) {
                                          applyTileDamageToEntity(enemy.id, nx, ny);
                                      }
                                      
                                      if (!isHiding) {
                                          await new Promise(res => setTimeout(res, Math.max(150, Math.round(650 / (enemy.speed || 1)))));
                                          setEnemyMoveAnim(null);
                                          setPlayer(prev => ({ ...prev, dir360: currentDir }));
                                      }
                                      break;
                                  }
                              }
                          }
                          remainingActions = 0;
                          continue;
                      }

                      // --- TARGET SELECTION ---
                      // We can target the Player or any NPC in combat
                      let targets: { id: string, pos: {x: number, y: number}, isPlayer: boolean, ref?: any }[] = [];
                      if (playerHpRef.current > 0) {
                          targets.push({ id: 'PLAYER', pos: currentPlayer.pos, isPlayer: true });
                      }
                      for (const group of combatRef.current.activeGroup) {
                          const e = liveEnemiesRef.current.get(group.id);
                          if (e && e.hp > 0 && e.isNPC) {
                              const currentHp = liveNpcHp.has(e.id) ? liveNpcHp.get(e.id)! : e.hp;
                              if (currentHp > 0) {
                                  const ePos = enemyPosMap.get(e.id);
                                  if (ePos) targets.push({ id: e.id, pos: ePos, isPlayer: false, ref: { ...e, hp: currentHp } });
                              }
                          }
                      }
                      
                      if (targets.length === 0) break;

                      let bestTarget = targets[0];
                      let minD = Infinity;
                      for (const t of targets) {
                          const dist = Math.abs(ex - t.pos.x) + Math.abs(ey - t.pos.y);
                          if (dist < minD) {
                              minD = dist;
                              bestTarget = t;
                          }
                      }
                      const targetPos = bestTarget.pos;

                      let isVisible = hasLineOfSight(targetPos, { x: ex, y: ey }, currentGrid, width, height, bestTarget.id, false);
                       const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
                       const targetTile = currentGrid[Math.floor(targetPos.y)]?.[Math.floor(targetPos.x)];
                       const enemyTile = currentGrid[Math.floor(ey)]?.[Math.floor(ex)];
                       if (targetTile && enemyTile && (isPitTile(targetTile) || isPitTile(enemyTile))) {
                           if (!hasPitLineOfSight(targetPos, { x: ex, y: ey }, currentGrid, width, height)) {
                               isVisible = false;
                           }
                       }

                      const inRange = isValidCombatPosition({x: ex, y: ey}, targetPos, currentGrid, width, height, enemy.id, range, allEnemies);

                      if (inRange) {
                          // ATTACK
                          if (isVisible && bestTarget.isPlayer) {
                              const angleToEnemy = Math.atan2(ey - currentPlayer.pos.y, ex - currentPlayer.pos.x);
                              let lookAtDir360 = (angleToEnemy / (Math.PI / 2)) + 1;
                              while (lookAtDir360 < 0) lookAtDir360 += 4;
                              while (lookAtDir360 >= 4) lookAtDir360 -= 4;
                              
                              const diffX = ex - currentPlayer.pos.x;
                              const diffY = ey - currentPlayer.pos.y;

                              let isFrontSlot = false;
                              if (currentDir === 0 && diffY === -1 && Math.abs(diffX) <= 1) isFrontSlot = true;
                              else if (currentDir === 1 && diffX === 1 && Math.abs(diffY) <= 1) isFrontSlot = true;
                              else if (currentDir === 2 && diffY === 1 && Math.abs(diffX) <= 1) isFrontSlot = true;
                              else if (currentDir === 3 && diffX === -1 && Math.abs(diffY) <= 1) isFrontSlot = true;

                              const targetCardinalDir = Math.round(lookAtDir360) % 4;
                              
                              if (!isFrontSlot && targetCardinalDir !== currentDir) {
                                  currentDir = targetCardinalDir;
                                  setPlayer(prev => ({ ...prev, dir: currentDir, dir360: currentDir }));
                                  await new Promise(r => setTimeout(r, 400));
                              }
                          }

                          // -- Вычисляем параметры анимации атаки для регулировки таймингов в реальном времени --
                          const attackDx = ex - targetPos.x;
                          const attackDy = ey - targetPos.y;
                          const attackDistSq = attackDx * attackDx + attackDy * attackDy;
                          const isCloseRange = attackDistSq <= 2.5;

                          let chosenAttackAssetId: string | undefined = undefined;
                          if (!isCloseRange && enemy.assets.distanceAttack) {
                              chosenAttackAssetId = typeof enemy.assets.distanceAttack === 'string'
                                  ? enemy.assets.distanceAttack
                                  : enemy.assets.distanceAttack.assetId;
                          } else if (enemy.assets.attack) {
                              chosenAttackAssetId = typeof enemy.assets.attack === 'string'
                                  ? enemy.assets.attack
                                  : enemy.assets.attack.assetId;
                          }

                          let customAnimDuration = 600;
                          let isCustomAnimation = false;
                          if (chosenAttackAssetId && (animations as any)[chosenAttackAssetId]) {
                              const animDef = (animations as any)[chosenAttackAssetId];
                              if (animDef && animDef.frames && animDef.frames.length > 0 && animDef.fps > 0) {
                                  isCustomAnimation = true;
                                  const numFrames = animDef.frames.length;
                                  const frameDuration = 1000 / animDef.fps;
                                  customAnimDuration = Math.round(frameDuration * numFrames);
                              }
                          }

                          let preShotDelay = 100;
                          let postShotDelay = 300;
                          let followUpDelay = 200;

                          if (isCustomAnimation) {
                              preShotDelay = Math.max(20, Math.round(customAnimDuration * 0.25));
                              postShotDelay = Math.max(20, Math.round(customAnimDuration * 0.50));
                              followUpDelay = Math.max(20, customAnimDuration - preShotDelay - postShotDelay);
                          }

                          setCombat((prev: CombatState) => ({ ...prev, activeAttackerId: enemy.id })); 
                          if (playSound && enemy.sounds?.attack) {
                              playSound(enemy.sounds.attack, { x: ex, y: ey });
                          }
                          
                          if (isVisible) {
                              // --- BREAK INTERSECTING WINDOWS ---
                              const intersectingWindows = getIntersectingWindows({x: ex, y: ey}, targetPos, currentGrid, width, height);
                              if (intersectingWindows.length > 0) {
                                  let gridModified = false;
                                  intersectingWindows.forEach(w => {
                                      const cell = currentGrid[w.y]?.[w.x];
                                      if (cell) {
                                          let broke = false;
                                          let prevAsset: string | undefined;
                                          let maskId: string | undefined;
                                          let breakSound: string | undefined;

                                          if (cell.type === 'DOOR' && cell.door && cell.door.maskId && !cell.door.broken && cell.door.state !== 'OPEN') {
                                              cell.door.broken = true;
                                              broke = true;
                                              breakSound = 'SYS_GLASS_SHATTER'; 
                                              prevAsset = cell.door.textureId || cell.door.maskId;
                                              maskId = cell.door.maskId;
                                          } else if (cell.isWindow && !cell.isGlassBroken && cell.glassAssetId) {
                                              cell.isGlassBroken = true;
                                              broke = true;
                                              prevAsset = cell.glassAssetId;
                                              maskId = cell.glassAssetId;
                                              breakSound = cell.glassBreakSound;
                                              cell.glassAssetId = undefined;
                                          } else if (cell.mirror && !cell.isMirrorBroken && cell.maskId) {
                                              cell.isMirrorBroken = true;
                                              broke = true;
                                              prevAsset = cell.assetId || cell.maskId;
                                              maskId = cell.maskId;
                                              breakSound = 'SYS_GLASS_SHATTER';
                                          }

                                          if (broke) {
                                              gridModified = true;
                                              if (playSound && breakSound) {
                                                  playSound(breakSound, { x: w.x + 0.5, y: w.y + 0.5 });
                                              }
                                              
                                              if (prevAsset && maskId) {
                                                  const cachedPrevAsset = prevAsset;
                                                  const cachedMaskId = maskId;
                                                  sideEffectsQueueRef.current.push(() => {
                                                      if (onSpawnParticles) {
                                                          const maskBuffer = getMaskBuffer(cachedMaskId, spriteMap as any);
                                                          if (maskBuffer) {
                                                              const shards = createShardParticles(w.x + 0.5, w.y + 0.5, 0.5, cachedPrevAsset, cachedMaskId, maskBuffer, 20, 1.0, spriteMap as any);
                                                              onSpawnParticles(shards);
                                                          }
                                                      }
                                                  });
                                              }
                                          }
                                      }
                                  });
                                  if (gridModified) {
                                      setLevelData((prev: any) => ({ ...prev, grid: currentGrid.map((row: any[]) => [...row]) }));
                                      levelDataRef.current = { ...levelDataRef.current, grid: currentGrid };
                                  }
                              }

                              await new Promise(r => setTimeout(r, preShotDelay));
                              if (enemy.muzzleFlash && range > 1 && triggerEnemyFlash) {
                                  triggerEnemyFlash(ex, ey);
                              }
                              const casingData = enemy.casing || ((enemy as any).casingAsset ? { 
                                  assetId: (enemy as any).casingAsset, 
                                  direction: (enemy as any).casingDirection || 'left', 
                                  scale: (enemy as any).casingScale !== undefined && (enemy as any).casingScale !== 0 ? (enemy as any).casingScale : 1.0, 
                                  groundScaleMultiplier: (enemy as any).casingGroundScaleMultiplier !== undefined && (enemy as any).casingGroundScaleMultiplier !== 0 ? (enemy as any).casingGroundScaleMultiplier : 0.08 
                              } : undefined);
                              
                              if (casingData && spawnEnemyCasing) {
                                  spawnEnemyCasing(ex, ey, casingData, enemy.sounds?.casing);
                              }
                              await new Promise(r => setTimeout(r, postShotDelay));
                          }
                          
                          if (bestTarget.isPlayer && playerHpRef.current <= 0) { setCombat((prev: CombatState) => ({ ...prev, activeAttackerId: null })); break; }
                          if (!bestTarget.isPlayer && bestTarget.ref.hp <= 0) break; // NPC died

                          const targetAgi = bestTarget.isPlayer ? currentPlayer.stats.agi : (bestTarget.ref.stats?.agi || 0);

                          const enemyAcc = Number(enemy.accuracy ?? 0);
                           const hitRoll = Math.floor(Math.random() * 20) + 1, accuracyMod = isEscapeFail ? 4 : 0, hitTotal = hitRoll + enemyAcc - targetAgi + accuracyMod, hitThreshold = 12;
                          if (hitTotal >= hitThreshold) {
                              const enemyDmg = rollDice(enemy.damageDice);
                              if (bestTarget.isPlayer) {
                                  const totalProt = (currentPlayer.equipment.helmet?.protection || 0) + (currentPlayer.equipment.vest?.protection || 0) + (currentPlayer.equipment.pants?.protection || 0) + (currentPlayer.equipment.boots?.protection || 0);
                                  const reducedDmg = Math.max(0, enemyDmg - totalProt);
                                  if (reducedDmg > 0) { 
                                      triggerDamageEffect(reducedDmg > 4); 
                                      if (onPlayerDamaged) onPlayerDamaged(ex, ey);
                                      if (playSound && currentPlayer.sounds?.damage) playSound(currentPlayer.sounds.damage);
                                      addLog(t(strings.logs.enemy_hit, { name: enemy.name, damage: reducedDmg }), 'COMBAT_ENEMY'); 
                                      if (!godMode) setPlayer(prev => { 
                                          const newHp = Math.max(0, prev.hp - reducedDmg); 
                                          if (newHp === 0) { playerHpRef.current = 0; } 
                                          
                                          // Decrease armor durability
                                          let newInventory = [...prev.inventory];
                                          const newEquipment = { ...prev.equipment };
                                          const armorSlots: ('helmet' | 'vest' | 'pants' | 'boots')[] = ['helmet', 'vest', 'pants', 'boots'];
                                          
                                          const equippedArmorSlots = armorSlots.filter(slot => newEquipment[slot] != null && newEquipment[slot]!.maxDurability !== undefined && newEquipment[slot]!.maxDurability! > 0);
                                          
                                          if (equippedArmorSlots.length > 0) {
                                              // Weighted random selection based on relative durability
                                              const weights = equippedArmorSlots.map(slot => {
                                                  const armor = newEquipment[slot]!;
                                                  const relDurability = (armor.durability || 1) / (armor.maxDurability || 1);
                                                  return relDurability + 0.2; // Base weight to ensure even low durability items can be hit
                                              });
                                              
                                              const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                                              let randomVal = Math.random() * totalWeight;
                                              let selectedSlot = equippedArmorSlots[0];
                                              
                                              for (let i = 0; i < equippedArmorSlots.length; i++) {
                                                  randomVal -= weights[i];
                                                  if (randomVal <= 0) {
                                                      selectedSlot = equippedArmorSlots[i];
                                                      break;
                                                  }
                                              }
                                              
                                              const randomSlot = selectedSlot;
                                              const armor = newEquipment[randomSlot]!;
                                              const durabilityLoss = Math.max(1, Math.floor(enemyDmg / 2));
                                              const updatedArmor = { ...armor, durability: Math.max(0, (armor.durability || 1) - durabilityLoss) };
                                              
                                              if (updatedArmor.durability === 0) {
                                                  if (strings && !brokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                      sideEffectsQueueRef.current.push(() => {
                                                          if (!brokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                              const msg = t(strings.logs.item_broken, { name: updatedArmor.name });
                                                              addLog(msg, 'COMBAT_PLAYER');
                                                              if (showToast) showToast(msg);
                                                              brokenItemsLoggedRef.current.add(updatedArmor.id);
                                                              if (playSound && updatedArmor.type) {
                                                                  playSound(`${updatedArmor.type}_BREAK`);
                                                              }
                                                          }
                                                      });
                                                  }
                                                  newEquipment[randomSlot] = updatedArmor;
                                                  newInventory = newInventory.map(i => i.id === updatedArmor.id ? updatedArmor : i);
                                              } else {
                                                  const relDurability = updatedArmor.durability / (updatedArmor.maxDurability || 1);
                                                  if (relDurability <= 0.2 && strings && !almostBrokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                      sideEffectsQueueRef.current.push(() => {
                                                          if (!almostBrokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                              addLog(t(strings.logs.item_almost_broken, { name: updatedArmor.name }), 'WARNING');
                                                              almostBrokenItemsLoggedRef.current.add(updatedArmor.id);
                                                          }
                                                      });
                                                  }
                                                  newEquipment[randomSlot] = updatedArmor;
                                                  newInventory = newInventory.map(i => i.id === updatedArmor.id ? updatedArmor : i);
                                              }
                                          }
      
                                          return { ...prev, hp: newHp, inventory: newInventory, equipment: newEquipment }; 
                                      }); 
      
                                      if (enemy.onHitEffect && applyEffect && !godMode) {
                                          if (Math.random() * 100 <= enemy.onHitEffect.chance) {
                                              applyEffect(enemy.onHitEffect.id);
                                          }
                                      }
                                  } else {
                                      if (playSound) playSound('SYS_ARMOR_HIT');
                                      addLog(t(strings?.logs?.enemy_hit_armor || "{name} hit you, but armor absorbed the damage!", { name: enemy.name }), 'INFO');
                                      if (!godMode) setPlayer(prev => {
                                          let newInventory = [...prev.inventory];
                                          const newEquipment = { ...prev.equipment };
                                          const armorSlots: ('helmet' | 'vest' | 'pants' | 'boots')[] = ['helmet', 'vest', 'pants', 'boots'];
                                          const equippedArmorSlots = armorSlots.filter(slot => newEquipment[slot] != null && newEquipment[slot]!.maxDurability !== undefined && newEquipment[slot]!.maxDurability! > 0);
                                          
                                          if (equippedArmorSlots.length > 0) {
                                              // Weighted random selection based on relative durability
                                              const weights = equippedArmorSlots.map(slot => {
                                                  const armor = newEquipment[slot]!;
                                                  return ((armor.durability || 1) / (armor.maxDurability || 1)) + 0.2;
                                              });
                                              const totalWeight = weights.reduce((sum, w) => sum + w, 0);
                                              let randomVal = Math.random() * totalWeight;
                                              let selectedSlot = equippedArmorSlots[0];
                                              for (let i = 0; i < equippedArmorSlots.length; i++) {
                                                  randomVal -= weights[i];
                                                  if (randomVal <= 0) {
                                                      selectedSlot = equippedArmorSlots[i];
                                                      break;
                                                   }
                                              }
                                              const randomSlot = selectedSlot;
                                              const armor = newEquipment[randomSlot]!;
                                              const durabilityLoss = 1;
                                              const updatedArmor = { ...armor, durability: Math.max(0, (armor.durability || 1) - durabilityLoss) };
                                              if (updatedArmor.durability === 0) {
                                                  if (strings && !brokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                      sideEffectsQueueRef.current.push(() => {
                                                          if (!brokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                              const msg = t(strings.logs.item_broken, { name: updatedArmor.name });
                                                              addLog(msg, 'COMBAT_PLAYER');
                                                              if (showToast) showToast(msg);
                                                              brokenItemsLoggedRef.current.add(updatedArmor.id);
                                                              if (playSound && updatedArmor.type) {
                                                                  playSound(`${updatedArmor.type}_BREAK`);
                                                              }
                                                          }
                                                      });
                                                  }
                                                  newEquipment[randomSlot] = updatedArmor;
                                                  newInventory = newInventory.map(i => i.id === updatedArmor.id ? updatedArmor : i);
                                              } else {
                                                  const relDurability = updatedArmor.durability / (updatedArmor.maxDurability || 1);
                                                  if (relDurability <= 0.2 && strings && !almostBrokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                      sideEffectsQueueRef.current.push(() => {
                                                          if (!almostBrokenItemsLoggedRef.current.has(updatedArmor.id)) {
                                                              addLog(t(strings.logs.item_almost_broken, { name: updatedArmor.name }), 'WARNING');
                                                              almostBrokenItemsLoggedRef.current.add(updatedArmor.id);
                                                          }
                                                      });
                                                  }
                                                  newEquipment[randomSlot] = updatedArmor;
                                                  newInventory = newInventory.map(i => i.id === updatedArmor.id ? updatedArmor : i);
                                              }
                                          }
                                          return { ...prev, inventory: newInventory, equipment: newEquipment };
                                      });
                                  }
                              } else {
                                  // HIT NPC
                                  const reducedDmg = Math.max(1, enemyDmg);
                                  handleVisualHit(bestTarget.id);
                                  if (playSound && bestTarget.ref.sounds?.damage) playSound(bestTarget.ref.sounds.damage, {x: bestTarget.pos.x, y: bestTarget.pos.y});
                                  else if (playSound) playSound('SYS_BODY_HIT', {x: bestTarget.pos.x, y: bestTarget.pos.y});
                                  
                                  const nameLocalized = localize(bestTarget.ref.name);
                                  addLog(t(strings.logs.npc_attacked, { attacker: localize(enemy.name), target: nameLocalized, damage: reducedDmg }), 'COMBAT_ENEMY');
                                  
                                  const oldHp = liveNpcHp.has(bestTarget.id) ? liveNpcHp.get(bestTarget.id)! : bestTarget.ref.hp;
                                  const newHp = Math.max(0, oldHp - reducedDmg);
                                  liveNpcHp.set(bestTarget.id, newHp);
                                  
                                  if (newHp === 0 && oldHp > 0) {
                                      // The Reaper effect in useGameEngine.ts will catch the 0 HP NPC and call handleEnemiesKilled for us automatically.
                                  }

                                  setEnemies((prev: Map<string, Enemy>) => {
                                      const next = new Map(prev);
                                      const existingNpc = next.get(bestTarget.id);
                                      if (existingNpc) {
                                          const npc = { ...existingNpc };
                                          npc.hp = newHp;
                                          next.set(bestTarget.id, npc);
                                      }
                                      liveEnemiesRef.current = next;
                                      return next;
                                  });
                              }
                          } else {
                              if (bestTarget.isPlayer) {
                                  addLog(t(strings.logs.evaded, { name: localize(enemy.name) }), 'INFO');
                              } else {
                                  addLog(t(strings.logs.npc_evaded, { attacker: localize(enemy.name), target: localize(bestTarget.ref.name) }), 'INFO');
                              }
                          }
                          
                          if (isVisible) {
                              await new Promise(r => setTimeout(r, followUpDelay));
                              setCombat((prev: CombatState) => ({ ...prev, activeAttackerId: null }));
                              await new Promise(r => setTimeout(r, 200)); // Pause to show idle sprite between actions
                          } else {
                              setCombat((prev: CombatState) => ({ ...prev, activeAttackerId: null }));
                          }
                          remainingActions--;
                      } else {
                          // MOVE (Possibly multiple tiles)
                          let movePath: {x: number, y: number}[] = [];
                          let tempPos = { x: ex, y: ey };
                          let tempActions = remainingActions;
  
                          // Check cache
                          let cachedPath = enemy.currentPath || [];
                          let isCacheValid = false;
                          
                          if (cachedPath.length > 0) {
                              const endPos = cachedPath[cachedPath.length - 1];
                              const firstStep = cachedPath[0];
                              const currentDistToPlayer = Math.abs(tempPos.x - targetPos.x) + Math.abs(tempPos.y - targetPos.y);
                              const nextDistToPlayer = Math.abs(firstStep.x - targetPos.x) + Math.abs(firstStep.y - targetPos.y);
                              
                              if (nextDistToPlayer <= currentDistToPlayer || currentDistToPlayer <= 2) {
                                  if (isValidCombatPosition(endPos, targetPos, currentGrid, width, height, enemy.id, range, allEnemies)) {
                                      isCacheValid = true;
                                      // Also check if the immediate next steps are not blocked
                                      for (let i = 0; i < Math.min(tempActions, cachedPath.length); i++) {
                                          if (Math.round(targetPos.x) === cachedPath[i].x && Math.round(targetPos.y) === cachedPath[i].y) {
                                              isCacheValid = false;
                                              break;
                                          }
                                          if (isBlocked(cachedPath[i].x, cachedPath[i].y, currentGrid, width, height, enemy.id)) {
                                              isCacheValid = false;
                                              break;
                                          }
                                      }
                                  }
                              }
                          }
                          
                          let fullPath = isCacheValid ? cachedPath : null;
  
                          if (!fullPath) {
                              const dist = Math.abs(tempPos.x - targetPos.x) + Math.abs(tempPos.y - targetPos.y);
                              if (dist > range + 2) {
                                  // Слишком далеко для поиска боевой линии, сразу прокладываем кратчайший путь через оптимизированный A*
                                  const ignoredCoords = new Set<string>();
                                  for (const otherG of currentEnemies) {
                                      if (otherG.id !== enemy.id) {
                                          const pos = enemyPosMap.get(otherG.id);
                                          if (pos) ignoredCoords.add(`${pos.x},${pos.y}`);
                                      }
                                  }
                                  fullPath = findPath(tempPos.x, tempPos.y, targetPos.x, targetPos.y, currentGrid, width, height, ignoredCoords, {x: targetPos.x, y: targetPos.y});
                                  if (fullPath && fullPath.length > 0) {
                                      if (isBlocked(fullPath[0].x, fullPath[0].y, currentGrid, width, height, enemy.id) || (fullPath[0].x === Math.round(targetPos.x) && fullPath[0].y === Math.round(targetPos.y))) {
                                          fullPath = [];
                                      }
                                  }
                                  if (!fullPath || fullPath.length === 0) {
                                      fullPath = findPath(tempPos.x, tempPos.y, targetPos.x, targetPos.y, currentGrid, width, height, new Set(), {x: targetPos.x, y: targetPos.y});
                                      if (fullPath.length > 0) {
                                          if (isBlocked(fullPath[0].x, fullPath[0].y, currentGrid, width, height, enemy.id) || (fullPath[0].x === Math.round(targetPos.x) && fullPath[0].y === Math.round(targetPos.y))) {
                                              fullPath = null;
                                          }
                                      }
                                  }
                              } else {
                                  fullPath = calculateNextEnemyMove(enemy, tempPos, targetPos, currentGrid, width, height, allEnemies);
                              }
                              
                              if (!fullPath || fullPath.length === 0) {
                                  // A* Fallback if no valid combat position was found by 10-step BFS
                                  const ignoredCoords = new Set<string>();
                                  for (const otherG of currentEnemies) {
                                      if (otherG.id !== enemy.id) {
                                          const pos = enemyPosMap.get(otherG.id);
                                          if (pos) ignoredCoords.add(`${pos.x},${pos.y}`);
                                      }
                                  }
                                  
                                  fullPath = findPath(tempPos.x, tempPos.y, targetPos.x, targetPos.y, currentGrid, width, height, ignoredCoords, {x: targetPos.x, y: targetPos.y});
                                  
                                  if (fullPath && fullPath.length > 0) {
                                      if (isBlocked(fullPath[0].x, fullPath[0].y, currentGrid, width, height, enemy.id) || (fullPath[0].x === Math.round(targetPos.x) && fullPath[0].y === Math.round(targetPos.y))) {
                                          fullPath = [];
                                      }
                                  }

                                  if (!fullPath || fullPath.length === 0) {
                                      // Ghost A*
                                      fullPath = findPath(tempPos.x, tempPos.y, targetPos.x, targetPos.y, currentGrid, width, height, new Set(), {x: targetPos.x, y: targetPos.y});
                                      if (fullPath.length > 0) {
                                          if (isBlocked(fullPath[0].x, fullPath[0].y, currentGrid, width, height, enemy.id) || (fullPath[0].x === Math.round(targetPos.x) && fullPath[0].y === Math.round(targetPos.y))) {
                                              fullPath = null;
                                          }
                                      }
                                  }
                                  
                                  if (!fullPath || fullPath.length === 0) {
                                      // Fallback Shuffle
                                      let bestNeighbor = null;
                                      let bestScore = -Infinity;
                                      const directions = [ { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 } ];
                                      for (let d = directions.length - 1; d > 0; d--) { const r = Math.floor(Math.random() * (d + 1)); [directions[d], directions[r]] = [directions[r], directions[d]]; }
                                      for (const dir of directions) {
                                          const nx = tempPos.x + dir.dx;
                                          const ny = tempPos.y + dir.dy;
                                          if (nx === Math.round(targetPos.x) && ny === Math.round(targetPos.y)) continue;
                                          if (!isBlocked(nx, ny, currentGrid, width, height, enemy.id)) {
                                              const distToPlayer = Math.abs(nx - targetPos.x) + Math.abs(ny - targetPos.y);
                                              const score = -distToPlayer;
                                              if (score > bestScore) {
                                                  bestScore = score;
                                                  bestNeighbor = {x: nx, y: ny};
                                              }
                                          }
                                      }
                                      if (bestNeighbor) fullPath = [bestNeighbor];
                                  }
                              }
                          }
                          
                          if (fullPath && fullPath.length > 0) {
                              for (const step of fullPath) {
                                  if (tempActions <= 0) break;
                                  
                                  if (isBlocked(step.x, step.y, currentGrid, width, height, enemy.id)) {
                                      break;
                                  }
                                  
                                  movePath.push(step);
                                  tempPos = step;
                                  tempActions--;
                                  
                                  if (isValidCombatPosition(tempPos, targetPos, currentGrid, width, height, enemy.id, range, allEnemies)) {
                                      break;
                                  }
                              }
                              
                              // Update cache without triggering state updates to prevent unneeded rendering
                              const remainingPath = fullPath.slice(movePath.length);
                              const e = liveEnemiesRef.current.get(enemy.id);
                              if (e) {
                                  e.currentPath = remainingPath;
                              }
                          }
  
                          if (movePath.length > 0) {
                              const finalPos = movePath[movePath.length - 1];
                              let anySubStepVisible = isVisible;
                              let visibilityByStep = [isVisible]; // index 0 is start, 1..n is steps
                              
                              // Fast check if enemy will be in camera FOV during movement
                              const playerAngle = (currentPlayer.dir360 - 1) * (Math.PI / 2);
                              const MAX_FOV_ANGLE = 75 * (Math.PI / 180); // ~75 degrees each side
                              
                              const checkFov = (targetX: number, targetY: number) => {
                                  const angleToEnemy = Math.atan2(targetY - currentPlayer.pos.y, targetX - currentPlayer.pos.x);
                                  let diff = angleToEnemy - playerAngle;
                                  while (diff > Math.PI) diff -= 2 * Math.PI;
                                  while (diff < -Math.PI) diff += 2 * Math.PI;
                                  return Math.abs(diff) < MAX_FOV_ANGLE;
                              };

                              let anySubStepInFov = isVisible && checkFov(ex, ey);

                              for (let i = 0; i < movePath.length; i++) {
                                  const v = hasLineOfSight(currentPlayer.pos, movePath[i], currentGrid, width, height, "PLAYER", false);
                                  visibilityByStep.push(v);
                                  if (v) {
                                      anySubStepVisible = true;
                                      if (checkFov(movePath[i].x, movePath[i].y)) {
                                          anySubStepInFov = true;
                                      }
                                  }
                              }
                              
                              const shouldShowMoveAnim = anySubStepVisible;

                              if (shouldShowMoveAnim) {
                                  // Find the first visible position to look at initially
                                  let firstVisiblePos = {x: ex, y: ey};
                                  for (let i = 0; i < movePath.length; i++) {
                                      if (visibilityByStep[i] || visibilityByStep[i+1]) {
                                          firstVisiblePos = i === 0 ? {x: ex, y: ey} : movePath[i-1];
                                          break;
                                      }
                                  }
                                  const startAngle = Math.atan2(firstVisiblePos.y - currentPlayer.pos.y, firstVisiblePos.x - currentPlayer.pos.x); let startLookAtDir360 = (startAngle / (Math.PI / 2)) + 1; while (startLookAtDir360 < 0) startLookAtDir360 += 4; while (startLookAtDir360 >= 4) startLookAtDir360 -= 4;
                                  setPlayer(prev => ({ ...prev, dir360: startLookAtDir360 })); 
                                  await new Promise(r => setTimeout(r, 450)); 
                                  
                                  const moveAngle = Math.atan2(finalPos.y - currentPlayer.pos.y, finalPos.x - currentPlayer.pos.x); let moveLookAtDir360 = (moveAngle / (Math.PI / 2)) + 1; while (moveLookAtDir360 < 0) moveLookAtDir360 += 4; while (moveLookAtDir360 >= 4) moveLookAtDir360 -= 4;
                                  setPlayer(prev => ({ ...prev, dir360: moveLookAtDir360 }));
                              }
                              
                              if (currentGrid[finalPos.y] && currentGrid[finalPos.y][finalPos.x]) {
                                  updateTile(ey, ex, t => t.enemyId = undefined); 
                                  updateTile(finalPos.y, finalPos.x, t => t.enemyId = enemy.id);
                                  
                                  const newPosEntry = {id: enemy.id, x: finalPos.x, y: finalPos.y};
                                  enemyPosMap.set(enemy.id, newPosEntry);
                                  const idx = allEnemies.findIndex(e => e.id === enemy.id);
                                  if (idx !== -1) allEnemies[idx] = newPosEntry;
                                  else allEnemies.push(newPosEntry);
                                  
                                  setLevelData((prev: any) => {
                                      if (!prev || !prev.grid) return prev;
                                      const pGrid = [...prev.grid];
                                      if (pGrid[ey]) {
                                          pGrid[ey] = [...pGrid[ey]];
                                          if (pGrid[ey][ex] && pGrid[ey][ex].enemyId === enemy.id) {
                                              pGrid[ey][ex] = { ...pGrid[ey][ex], enemyId: undefined };
                                          }
                                      }
                                      if (pGrid[finalPos.y]) {
                                          if (ey !== finalPos.y) pGrid[finalPos.y] = [...pGrid[finalPos.y]];
                                          if (pGrid[finalPos.y][finalPos.x]) {
                                              pGrid[finalPos.y][finalPos.x] = { ...pGrid[finalPos.y][finalPos.x], enemyId: enemy.id };
                                          }
                                      }
                                      const newData = { ...prev, grid: pGrid };
                                      levelDataRef.current = newData; 
                                      return newData;
                                  });
                                  
                                  if (applyTileDamageToEntity) {
                                      applyTileDamageToEntity(enemy.id, finalPos.x, finalPos.y);
                                  }

                                  // Process movement visually step-by-step
                                  for (let i = 0; i < movePath.length; i++) {
                                      const step = movePath[i];
                                      const prevStep = i === 0 ? {x: ex, y: ey} : movePath[i-1];
                                      
                                      const isVisibleNow = visibilityByStep[i] || visibilityByStep[i+1];
                                      
                                      if (isVisibleNow) {
                                          setEnemyMoveAnim({ id: enemy.id, startX: prevStep.x, startY: prevStep.y, endX: step.x, endY: step.y, startTime: performance.now(), duration: 400 / (enemy.speed || 1) });
                                          
                                          if (playSound) {
                                              const tile = currentGrid[step.y][step.x];
                                              if (enemy.sounds?.step) {
                                                  playSound(enemy.sounds.step, { x: step.x, y: step.y });
                                              } else if (tile && tile.footstepSound) {
                                                  playSound(tile.footstepSound, { x: step.x, y: step.y });
                                              }
                                          }
                                          
                                          await new Promise(r => setTimeout(r, 400 / (enemy.speed || 1)));
                                      } else {
                                          // Invisible step - finish instantly
                                          if (playSound) {
                                              const tile = currentGrid[step.y][step.x];
                                              if (tile && tile.footstepSound) {
                                                  if (enemy.sounds?.step) {
                                                      playSound(enemy.sounds.step, { x: step.x, y: step.y }, undefined, i * 50);
                                                  } else {
                                                      playSound(tile.footstepSound, { x: step.x, y: step.y }, undefined, i * 50); // Muffled/delayed invisible steps
                                                  }
                                              }
                                          }
                                      }
                                  }
                                  setEnemyMoveAnim(null);
                              }
                              if (shouldShowMoveAnim) {
                                  setPlayer(prev => ({ ...prev, dir360: currentDir }));
                              }
                              remainingActions = tempActions;
                          } else {
                              remainingActions = 0;
                          }
                      }
                  }
              }
              
              if (processEffects && playerHpRef.current > 0) {
                  processEffects();
              }
              
              if (onCombatRoundEnd && playerHpRef.current > 0) {
                  onCombatRoundEnd();
              }
          } finally {
              if (playerHpRef.current > 0) {
                  const currentGrid = levelDataRef.current?.grid || [];
                  const height = currentGrid.length;
                  const width = currentGrid[0]?.length || 0;
                  
                  const getEnemiesInSlots = (d: number) => {
                      return getVisibleCombatEnemiesLightweight(
                          combatRef.current.activeGroup,
                          liveEnemiesRef.current,
                          currentGrid,
                          width,
                          height,
                          playerRef.current.pos,
                          d,
                          enemyMoveAnim
                      );
                  };

                  const dirsMapSlots: { [dir: number]: any[] } = {
                      0: getEnemiesInSlots(0),
                      1: getEnemiesInSlots(1),
                      2: getEnemiesInSlots(2),
                      3: getEnemiesInSlots(3)
                  };

                  const isInitialDirEmpty = dirsMapSlots[initialPlayerDir].length === 0;
                  const wasManualTurnToEmpty = playerManuallyTurnedToEmptyDirRef.current === initialPlayerDir;

                  if (isInitialDirEmpty && !wasManualTurnToEmpty) {
                      let finalLastEnemyActionDir = lastEnemyActionDir;
                      const lastEnemy = [...currentEnemies].reverse().find(g => {
                          const e = liveEnemiesRef.current.get(g.id);
                          return e && e.hp > 0;
                      });

                      if (lastEnemy) {
                          if (enemyPosMap.size === 0) {
                              const allEnemies = getEnemyPositions(currentGrid, width, height);
                              allEnemies.forEach(e => enemyPosMap.set(e.id, e));
                          }
                          const pos = enemyPosMap.get(lastEnemy.id);
                          if (pos) {
                              const angle = Math.atan2(pos.y - playerRef.current.pos.y, pos.x - playerRef.current.pos.x);
                              let enemyDir360 = (angle / (Math.PI / 2)) + 1;
                              while (enemyDir360 < 0) enemyDir360 += 4;
                              while (enemyDir360 >= 4) enemyDir360 -= 4;
                              finalLastEnemyActionDir = Math.round(enemyDir360) % 4;
                          }
                      }

                      // Check if anyone is present in finalLastEnemyActionDir slots
                      const isLastEnemyDirEmpty = dirsMapSlots[finalLastEnemyActionDir].length === 0;

                      if (isLastEnemyDirEmpty) {
                          // Find cardinal direction with closest alive enemy in slots
                          let foundDirWithEnemies: number | null = null;
                          let minDistance = Infinity;

                          for (const d of [0, 1, 2, 3]) {
                              const list = dirsMapSlots[d];
                              if (list.length > 0) {
                                  if (enemyPosMap.size === 0) {
                                      const allEnemies = getEnemyPositions(currentGrid, width, height);
                                      allEnemies.forEach(e => enemyPosMap.set(e.id, e));
                                  }
                                  for (const enemyInSlot of list) {
                                      const pos = enemyPosMap.get(enemyInSlot.id);
                                      if (pos) {
                                          const dist = Math.sqrt(
                                              (pos.x - playerRef.current.pos.x) ** 2 +
                                              (pos.y - playerRef.current.pos.y) ** 2
                                          );
                                          if (dist < minDistance) {
                                              minDistance = dist;
                                              foundDirWithEnemies = d;
                                          }
                                      }
                                  }
                              }
                          }

                          if (foundDirWithEnemies !== null) {
                              setPlayer(prev => ({ ...prev, dir: foundDirWithEnemies!, dir360: foundDirWithEnemies! }));
                          } else {
                              setPlayer(prev => ({ ...prev, dir: initialPlayerDir, dir360: initialPlayerDir }));
                          }
                      } else {
                          setPlayer(prev => ({ ...prev, dir: finalLastEnemyActionDir, dir360: finalLastEnemyActionDir }));
                      }
                  } else {
                      setPlayer(prev => ({ ...prev, dir: initialPlayerDir, dir360: initialPlayerDir }));
                  }
              }
              isTriggeringTurnRef.current = false;
              combatRef.current.isProcessingTurn = false;
              setCombat((prev: CombatState) => ({ ...prev, activeAttackerId: null, isProcessingTurn: false })); 
          }
        };

        setTimeout(tryProcessTurn, 500);
    }, [combatRef, enemies, setEnemies, setLevelData, setCombat, setGameState, setPlayer, strings, addLog, triggerDamageEffect, triggerEnemyFlash, onPlayerDamaged, playSound, godMode, forceUpdate, applyEffect, processEffects, onCombatRoundEnd, spawnEnemyCasing]);

    const handlePlayerAttack = (targetId: string | null, damage: number, isCrit: boolean, critFailed: boolean = false, force: boolean = false, armorHitIndex?: number): { grid: any[][] | null, hasNextAkimbo: boolean } | null => {
        if ((combatRef.current.isProcessingTurn && !force) || !strings) return null;
        
        const firingHand = lastFiredHandRef.current;
        const resolvedMainWeapon = player.equippedWeapon || (itemsDb?.['fists'] ? { ...itemsDb['fists'], id: 'fists_weapon', name: strings?.ui?.header?.fists || 'Fists' } as Item : null);
        const resolvedAkimboWeapon = player.equipment.weaponAkimbo || (resolvedMainWeapon?.id === 'fists_weapon' ? resolvedMainWeapon : null);

        let currentWeapon = firingHand === 'akimbo' ? resolvedAkimboWeapon : resolvedMainWeapon;
        
        if (playSound && currentWeapon?.sounds?.attack) {
            let soundPos = undefined;
            if (resolvedAkimboWeapon) {
                // To avoid HRTF completely isolating the sound to one ear, we place the acoustic source
                // slightly in *front* of the player, and only shift it by a small margin to the left or right.
                // This mimics holding a gun extended with arms, rather than firing it directly inside your ear.
                const angle = (player.dir360 - 1) * (Math.PI / 2);
                const angleOffset = firingHand === 'akimbo' ? -Math.PI / 2 : Math.PI / 2;
                
                const forwardDist = 0.8; // Further forward to tighten the acoustic angle
                const sideDist = 0.12;   // Very small shift to the side for subtle stereo presence
                
                soundPos = { 
                    x: (player.pos.x + 0.5) + (Math.cos(angle) * forwardDist) + (Math.cos(angle + angleOffset) * sideDist), 
                    y: (player.pos.y + 0.5) + (Math.sin(angle) * forwardDist) + (Math.sin(angle + angleOffset) * sideDist) 
                };
            }
            playSound(currentWeapon.sounds.attack, soundPos);
        }
        
        if (triggerAttackVibration) {
            triggerAttackVibration(currentWeapon?.vibrationPattern);
        }

        if (currentWeapon && currentWeapon.shakeIntensity !== undefined) {
            const intensity = currentWeapon.shakeIntensity;
            const duration = currentWeapon.shakeDuration !== undefined ? currentWeapon.shakeDuration : 200;
            window.dispatchEvent(new CustomEvent('player-attack-shake', { detail: { intensity, duration } }));
        }

        if (spawnCasing && currentWeapon && !currentWeapon.ejectAllOnReload) {
            spawnCasing(currentWeapon);
        }

        let baseDamage = damage;
        if (damage > 0 && player.stats) baseDamage += player.stats.str;

        if (currentWeapon && currentWeapon.id && currentWeapon.id !== 'fists' && currentWeapon.id !== 'fists_weapon') {
            setPlayer(prev => {
                let newInventory = [...prev.inventory];
                let updatedWeapon = { ...currentWeapon! };
                let weaponBroken = false;

                // Handle ammo
                if (updatedWeapon.magazineMax !== undefined && updatedWeapon.currentAmmo !== undefined) {
                    updatedWeapon.currentAmmo = Math.max(0, updatedWeapon.currentAmmo - 1);
                }

                // Handle durability
                if (updatedWeapon.maxDurability !== undefined && updatedWeapon.maxDurability > 0) {
                    const durabilityLoss = Math.max(1, Math.floor(baseDamage / 2));
                    updatedWeapon.durability = Math.max(0, (updatedWeapon.durability || 1) - durabilityLoss);
                    if (updatedWeapon.durability === 0) {
                        weaponBroken = true;
                        if (strings && !brokenItemsLoggedRef.current.has(updatedWeapon.id)) {
                            sideEffectsQueueRef.current.push(() => {
                                if (!brokenItemsLoggedRef.current.has(updatedWeapon.id)) {
                                    const msg = t(strings.logs.item_broken, { name: updatedWeapon.name });
                                    addLog(msg, 'COMBAT_PLAYER');
                                    if (showToast) showToast(msg);
                                    brokenItemsLoggedRef.current.add(updatedWeapon.id);
                                    if (playSound && updatedWeapon.type) {
                                        playSound(`${updatedWeapon.type}_BREAK`);
                                    }
                                }
                            });
                        }
                    } else {
                        const relDurability = updatedWeapon.durability / updatedWeapon.maxDurability;
                        if (relDurability <= 0.2 && strings && !almostBrokenItemsLoggedRef.current.has(updatedWeapon.id)) {
                            sideEffectsQueueRef.current.push(() => {
                                if (!almostBrokenItemsLoggedRef.current.has(updatedWeapon.id)) {
                                    addLog(t(strings.logs.item_almost_broken, { name: updatedWeapon.name }), 'WARNING');
                                    almostBrokenItemsLoggedRef.current.add(updatedWeapon.id);
                                }
                            });
                        }
                    }
                }

                newInventory = newInventory.map(item => item.id === updatedWeapon.id ? updatedWeapon : item);

                const newEquip = { ...prev.equipment };
                if (firingHand === 'akimbo') {
                    newEquip.weaponAkimbo = updatedWeapon;
                } else {
                    newEquip.weapon = updatedWeapon;
                }
                
                return { 
                    ...prev, 
                    inventory: newInventory, 
                    equipment: newEquip, 
                    equippedWeapon: firingHand === 'main' ? updatedWeapon : prev.equippedWeapon 
                };
            });
        }
        const weaponName = currentWeapon?.name || strings.ui.header.fists;
        const deadIds: string[] = [];
        const shootType = currentWeapon?.shootType || 'default';
        const hits: { enemyId: string, dmg: number, isSecondary?: boolean }[] = [];
        if (targetId && (baseDamage > 0 || armorHitIndex !== undefined)) {
            if (shootType === 'shotgun') {
                 const targetEnemy = activeCombatEnemies.find(e => e.id === targetId);
                 if (targetEnemy) {
                     const spreadDmg = Math.max(1, Math.floor(baseDamage * 0.2));
                     let damagePool = baseDamage;
                     const weaponRange = currentWeapon?.range || 1;
                     const allowedDist = weaponRange <= 1.5 ? 1.55 : weaponRange + 0.5;
                     const neighborsToCheck: string[] = [];
                     if (targetEnemy.alignment === 'LEFT') neighborsToCheck.push('CENTER');
                     else if (targetEnemy.alignment === 'RIGHT') neighborsToCheck.push('CENTER');
                     else if (targetEnemy.alignment === 'CENTER') neighborsToCheck.push('LEFT', 'RIGHT');
                     neighborsToCheck.forEach(align => {
                         const neighbor = activeCombatEnemies.find(e => e.alignment === align && e.hp > 0);
                         if (neighbor && (neighbor.distance || 0) <= allowedDist) {
                             hits.push({ enemyId: neighbor.id, dmg: spreadDmg, isSecondary: true });
                             damagePool -= spreadDmg;
                         }
                     });
                     hits.push({ enemyId: targetId, dmg: damagePool });
                 } else {
                     hits.push({ enemyId: targetId, dmg: baseDamage });
                 }
            } else {
                hits.push({ enemyId: targetId, dmg: baseDamage });
            }
        } else if (!targetId) {
            addLog(t(strings.logs.attack_miss, { weapon: weaponName, enemy: "target" }), 'COMBAT_PLAYER');
        }

        // Trace ray to target to break intersecting unbroken windows
        const lData = levelDataRef.current;
        if (targetId && lData && lData.grid) {
            let targetPos: {x: number, y: number} | null = null;
            if (targetId.startsWith('window_') || targetId.startsWith('decor_') || targetId.startsWith('door_')) {
                const parts = targetId.split('_');
                targetPos = { x: parseInt(parts[1]), y: parseInt(parts[2]) };
            } else {
                const cached = combatEnemyPositionsCacheRef.current.get(targetId) || (typeof window !== 'undefined' ? (window as any).enemyPositionsCache?.get(targetId) : null);
                if (cached && (lData.grid[cached.y]?.[cached.x]?.enemyId === targetId || lData.grid[cached.y]?.[cached.x]?.npc?.id === targetId)) {
                    targetPos = cached;
                    combatEnemyPositionsCacheRef.current.set(targetId, targetPos);
                }
            }
            if (targetPos) {
                const intersectingWindows = getIntersectingWindows(player.pos, targetPos, lData.grid, lData.width, lData.height);
                intersectingWindows.forEach(w => {
                    const tile = lData.grid[w.y]?.[w.x];
                    let prefix = 'window_';
                    if (tile && tile.type === 'DOOR') prefix = 'door_';
                    else if (tile && tile.mirror) prefix = 'mirror_';
                    
                    const winId = `${prefix}${w.x}_${w.y}`;
                    if (!hits.some(h => h.enemyId === winId)) {
                        hits.push({ enemyId: winId, dmg: 1, isSecondary: true });
                    }
                });
            }
        }

        const allHitIds = hits
            .filter(h => {
                if (h.enemyId.startsWith('decor_') || h.enemyId.startsWith('window_') || h.enemyId.startsWith('door_') || h.enemyId.startsWith('mirror_')) {
                    return false;
                }
                const enemy = liveEnemiesRef.current.get(h.enemyId);
                if (enemy && enemy.hp > 0) {
                    const hasUnbrokenArmor = enemy.armor && enemy.armor > 0 && (!enemy.brokenArmor || enemy.brokenArmor.length < enemy.armor);
                    const isAmbushArmorBlock = force && h.enemyId === targetId && armorHitIndex === undefined && hasUnbrokenArmor;
                    const isArmorHit = armorHitIndex !== undefined && h.enemyId === targetId && !h.isSecondary;
                    if (isArmorHit || isAmbushArmorBlock) {
                        return false;
                    }
                }
                return true;
            })
            .map(h => h.enemyId);
        if (allHitIds.length > 0) {
            setVisualHitIds(allHitIds);
            setTimeout(() => setVisualHitIds([]), 300);
        }

        // GRID UPDATE LOGIC
        let currentGrid = levelDataRef.current?.grid ? [...levelDataRef.current.grid] : undefined;
        const sourceGrid = levelDataRef.current?.grid;
        let gridModified = false;
        const width = levelDataRef.current?.width;
        const height = levelDataRef.current?.height;

        const updateTile = (yLoc: number, xLoc: number, mutator: (t: any) => void) => {
            if (!currentGrid || !sourceGrid) return;
            if (currentGrid[yLoc] === sourceGrid[yLoc]) {
                 currentGrid[yLoc] = [...sourceGrid[yLoc]];
            }
            if (currentGrid[yLoc][xLoc] === sourceGrid[yLoc][xLoc]) {
                 currentGrid[yLoc][xLoc] = { ...sourceGrid[yLoc][xLoc] };
            }
            const oldEnemyId = currentGrid[yLoc][xLoc].enemyId;
            mutator(currentGrid[yLoc][xLoc]);
            const newEnemyId = currentGrid[yLoc][xLoc].enemyId;
            if (oldEnemyId !== newEnemyId) {
                if (oldEnemyId) {
                    combatEnemyPositionsCacheRef.current.delete(oldEnemyId);
                    if (typeof window !== 'undefined') (window as any).enemyPositionsCache?.delete(oldEnemyId);
                }
                if (newEnemyId) {
                    combatEnemyPositionsCacheRef.current.set(newEnemyId, { x: xLoc, y: yLoc });
                    if (typeof window !== 'undefined') (window as any).enemyPositionsCache?.set(newEnemyId, { x: xLoc, y: yLoc });
                }
            }
            gridModified = true;
        };

        hits.forEach(hit => {
            setCombat(prev => ({ ...prev, lastPlayerHit: Date.now() })); 
            const enemy = liveEnemiesRef.current.get(hit.enemyId);
            if (enemy && enemy.hp > 0) {
                const hasUnbrokenArmor = enemy.armor && enemy.armor > 0 && (!enemy.brokenArmor || enemy.brokenArmor.length < enemy.armor);
                const isAmbushArmorBlock = force && hit.enemyId === targetId && armorHitIndex === undefined && hasUnbrokenArmor;
                const isArmorHit = armorHitIndex !== undefined && hit.enemyId === targetId && !hit.isSecondary;

                if (isArmorHit || isAmbushArmorBlock) {
                    if (playSound) {
                         const entity = levelDataRef.current?.entities?.find((e: any) => e.id === hit.enemyId);
                         const pos = entity ? { x: entity.x, y: entity.y } : undefined;
                         const armorHitSound = enemy.sounds?.armorHit || 'SYS_RICOCHET';
                         playSound(armorHitSound, pos);
                    }
                    if (!isAmbushArmorBlock) {
                        addLog(strings.logs?.armor_broken || "Armor broken!", 'COMBAT_PLAYER');
                    }

                    if (triggerEnemyFlash) {
                        const entity = levelDataRef.current?.entities?.find((e: any) => e.id === hit.enemyId);
                        if (entity) triggerEnemyFlash(entity.x, entity.y);
                    }
                    
                    if (isArmorHit) {
                        setEnemies((prev: Map<string, Enemy>) => { 
                            const map = new Map<string, Enemy>(prev); 
                            const e = map.get(hit.enemyId);
                            if (e) {
                                const brokenArmor = e.brokenArmor ? [...e.brokenArmor] : [];
                                if (!brokenArmor.includes(armorHitIndex!)) {
                                    brokenArmor.push(armorHitIndex!);
                                }
                                const updatedEnemy: Enemy = Object.assign({}, e, { brokenArmor });
                                map.set(hit.enemyId, updatedEnemy); 
                            }
                            liveEnemiesRef.current = map;
                            return map; 
                        });
                    }
                } else {
                    let suffix = ""; 
                    if (!hit.isSecondary) {
                        if (isCrit) suffix = strings.logs.attack_crit; 
                        else if (critFailed) suffix = strings.logs.attack_crit_fail;
                    }
                    if (hit.dmg > 0) addLog(t(strings.logs.attack_hit, { weapon: weaponName, enemy: enemy.name, damage: hit.dmg }) + suffix, 'COMBAT_PLAYER');
                    const newEnemyHp = enemy.hp - hit.dmg;
                
                // --- TRIGGER BLOOD DECAL ON HIT ---
                let ex = -1, ey = -1;
                if (currentGrid) {
                    const cached = combatEnemyPositionsCacheRef.current.get(hit.enemyId) || (typeof window !== 'undefined' ? (window as any).enemyPositionsCache?.get(hit.enemyId) : null);
                    if (cached && currentGrid[cached.y]?.[cached.x]?.enemyId === hit.enemyId) {
                        ex = cached.x;
                        ey = cached.y;
                    }
                }
                
                if (ex !== -1) {
                    spawnBloodDecals(ex, ey);
                }
                // ----------------------------------

                const playerGridX = Math.floor(player.pos.x);
                const playerGridY = Math.floor(player.pos.y);
                const isPointBlank = ex !== -1 && Math.abs(ex - playerGridX) <= 1 && Math.abs(ey - playerGridY) <= 1;

                if (newEnemyHp > 0 && currentWeapon?.knockbackChance && isPointBlank) {
                    if (Math.random() * 100 <= currentWeapon.knockbackChance) {
                        
                        if (ex !== -1) {
                            const d = Math.round(player.dir);
                            const pushVec = [[0, -1], [1, 0], [0, 1], [-1, 0]][d]; // N, E, S, W
                            const tx = ex + pushVec[0];
                            const ty = ey + pushVec[1];

                            let canPush = false;
                            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                                const targetTile = currentGrid[ty][tx];
                                const isBlocked = targetTile.type === 'WALL' || 
                                                  (targetTile.type === 'DOOR' && targetTile.door?.state !== 'OPEN') ||
                                                  targetTile.decoration?.blocking ||
                                                  (targetTile.items && targetTile.items.some((i: any) => i.blocking)) ||
                                                  targetTile.enemyId ||
                                                  targetTile.npc;
                                
                                if (!isBlocked) {
                                    canPush = true;
                                }
                            }

                            if (canPush) {
                                updateTile(ey, ex, t => t.enemyId = undefined);
                                updateTile(ty, tx, t => t.enemyId = hit.enemyId);
                                combatEnemyPositionsCacheRef.current.set(hit.enemyId, { x: tx, y: ty });

                                setEnemyMoveAnim({ 
                                    id: hit.enemyId, 
                                    startX: ex, startY: ey, 
                                    endX: tx, endY: ty, 
                                    startTime: performance.now(),
                                    duration: 150
                                });
                                setTimeout(() => setEnemyMoveAnim(null), 150);
                            }
                        }
                    }
                }

                if (newEnemyHp <= 0) {
                     deadIds.push(hit.enemyId);
                } else {
                     if (playSound && enemy.sounds?.damage) {
                         playSound(enemy.sounds.damage, ex !== -1 ? { x: ex, y: ey } : undefined);
                     }
                     setEnemies((prev: Map<string, Enemy>) => { 
                         const map = new Map<string, Enemy>(prev); 
                         const e = map.get(hit.enemyId);
                         if (e) {
                            const updatedEnemy: Enemy = Object.assign({}, e, { hp: newEnemyHp });
                            map.set(hit.enemyId, updatedEnemy); 
                         }
                         liveEnemiesRef.current = map;
                         return map; 
                     });
                }
                } // End of isArmorHit else block
            } else if (hit.enemyId.startsWith('window_') || hit.enemyId.startsWith('door_') || hit.enemyId.startsWith('mirror_')) {
                const parts = hit.enemyId.split('_');
                const isDoor = hit.enemyId.startsWith('door_');
                const isMirror = hit.enemyId.startsWith('mirror_');
                const dx = parseInt(parts[1]);
                const dy = parseInt(parts[2]);
                
                if (!isNaN(dx) && !isNaN(dy) && currentGrid) {
                    if (isDoor) {
                        const cell = currentGrid[dy]?.[dx];
                        if (cell && cell.type === 'DOOR' && cell.door && cell.door.maskId && !cell.door.broken && cell.door.state !== 'OPEN') {
                            updateTile(dy, dx, t => {
                                if (t.door) t.door.broken = true;
                            });
                            
                            // Maybe play the closest sound or use default
                            if (playSound) {
                                // Defaulting the same way as window
                                playSound('SYS_GLASS_SHATTER', { x: dx + 0.5, y: dy + 0.5 });
                            }
                            
                            // Spawn Glass Shards
                            const prevDoorAsset = cell.door.textureId || cell.door.maskId;
                            const doorMaskId = cell.door.maskId;
                            if (prevDoorAsset && doorMaskId) {
                                 sideEffectsQueueRef.current.push(() => {
                                     if (onSpawnParticles) {
                                         const maskBuffer = getMaskBuffer(doorMaskId, spriteMap as any);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(dx + 0.5, dy + 0.5, 0.5, prevDoorAsset, doorMaskId, maskBuffer, 20, 1.0, spriteMap as any);
                                             onSpawnParticles(shards);
                                         }
                                     }
                                 });
                            }
                            
                            deadIds.push(hit.enemyId);
                        }
                    } else if (currentGrid[dy] && currentGrid[dy][dx] && currentGrid[dy][dx].isWindow && !currentGrid[dy][dx].isGlassBroken && currentGrid[dy][dx].glassAssetId) {
                        updateTile(dy, dx, t => t.isGlassBroken = true);
                        
                        if (playSound && currentGrid[dy][dx].glassBreakSound) {
                            playSound(currentGrid[dy][dx].glassBreakSound, { x: dx + 0.5, y: dy + 0.5 });
                        }
                        
                        deadIds.push(hit.enemyId);
                        
                        // Spawn Glass Shards
                        const prevGlassAsset = currentGrid[dy][dx].glassAssetId;
                        if (prevGlassAsset) {
                             sideEffectsQueueRef.current.push(() => {
                                 if (onSpawnParticles) {
                                     const maskBuffer = getMaskBuffer(prevGlassAsset, spriteMap as any);
                                     if (maskBuffer) {
                                         const shards = createShardParticles(dx + 0.5, dy + 0.5, 0.5, prevGlassAsset, prevGlassAsset, maskBuffer, 20, 1.0, spriteMap as any);
                                         onSpawnParticles(shards);
                                     }
                                 }
                             });
                        }
                        
                        updateTile(dy, dx, t => t.glassAssetId = undefined); // actually remove the asset so it renders like an empty frame
                    } else if (isMirror && currentGrid[dy] && currentGrid[dy][dx] && currentGrid[dy][dx].mirror && !currentGrid[dy][dx].isMirrorBroken && currentGrid[dy][dx].maskId) {
                        updateTile(dy, dx, t => t.isMirrorBroken = true);
                        
                        // Mirrors default to SYS_GLASS_SHATTER sound (usually true for normal mirrors)
                        if (playSound) {
                            playSound('SYS_GLASS_SHATTER', { x: dx + 0.5, y: dy + 0.5 });
                        }
                        
                        deadIds.push(hit.enemyId);
                        
                        const maskId = currentGrid[dy][dx].maskId;
                        const assetId = currentGrid[dy][dx].assetId;
                        if (maskId) {
                             sideEffectsQueueRef.current.push(() => {
                                 if (onSpawnParticles) {
                                     const maskBuffer = getMaskBuffer(maskId, spriteMap as any);
                                     if (maskBuffer) {
                                         const shards = createShardParticles(dx + 0.5, dy + 0.5, 0.5, assetId || maskId, maskId, maskBuffer, 20, 1.0, spriteMap as any);
                                         onSpawnParticles(shards);
                                     }
                                 }
                             });
                        }
                    }
                }
            } else if (hit.enemyId.startsWith('decor_')) {
                // Handle Decoration Hit
                const parts = hit.enemyId.split('_');
                const dx = parseInt(parts[1]);
                const dy = parseInt(parts[2]);
                
                if (!isNaN(dx) && !isNaN(dy) && currentGrid) {
                    if (currentGrid[dy] && currentGrid[dy][dx] && currentGrid[dy][dx].decoration) {
                        const decor = currentGrid[dy][dx].decoration;
                        if (decor.destructable) {
                            const currentHp = decor.hp !== undefined ? decor.hp : 1;
                            const newHp = currentHp - hit.dmg;
                            
                            if (hit.dmg > 0) addLog(t(strings.logs.attack_hit, { weapon: weaponName, enemy: localize(decor.name), damage: hit.dmg }), 'COMBAT_PLAYER');
                            
                            if (newHp <= 0) {
                                // Destroy decoration
                                addLog(t(strings.logs.enemy_destroyed, { name: localize(decor.name) }), 'SUCCESS');
                                
                                const explosionDamage = decor.explosion_damage;
                                
                                const originalAssetId = decor.assetId;
                                
                                updateTile(dy, dx, t => {
                                    const curDecs = t.decorations && t.decorations.length > 0
                                        ? t.decorations
                                        : (t.decoration ? [t.decoration] : []);
                                    if (curDecs.length > 0) {
                                        if (decor.destroyedAssetId) {
                                            const newDecs = curDecs.map(dc => {
                                                if (dc.id === decor.id) {
                                                    return {
                                                        ...dc,
                                                        assetId: decor.destroyedAssetId,
                                                        destructable: false,
                                                        hp: 0,
                                                        scale: decor.deadScale !== undefined ? decor.deadScale : dc.scale,
                                                        blocking: decor.walkableWhenDestroyed ? false : dc.blocking
                                                    };
                                                }
                                                return dc;
                                            });
                                            t.decorations = newDecs;
                                            t.decoration = newDecs[0];
                                        } else {
                                            const newDecs = curDecs.filter(dc => dc.id !== decor.id);
                                            t.decorations = newDecs.length > 0 ? newDecs : undefined;
                                            t.decoration = newDecs.length > 0 ? newDecs[0] : undefined;
                                        }
                                    } else {
                                        delete t.decoration;
                                        delete t.decorations;
                                    }
                                });
                                
                                if (decor.explode && onSpawnParticles) {
                                    let actualAssetId = originalAssetId;
                                    if (actualAssetId in animations) {
                                        actualAssetId = (animations as any)[actualAssetId].frames[0];
                                    }
                                    const isBox = decor.isBox;
                                    const sizeFactor = isBox ? (decor.boxSize || 1.0) : (decor.scale || 1.0);
                                    const multiplier = isBox ? 25 : 12.5;
                                    const particleCount = Math.max(3, Math.min(25, Math.floor(multiplier * sizeFactor)));
                                    const explodeParticles = createExplodingDecorationParticles(
                                        dx + 0.5, dy + 0.5, 0.5,
                                        actualAssetId,
                                        particleCount,
                                        decor.explodeSound,
                                        decor.scale || 1.0
                                    );
                                    onSpawnParticles(explodeParticles);
                                }

                                if (decor.destructionSoundId && playSound) {
                                    playSound(decor.destructionSoundId, { x: dx + 0.5, y: dy + 0.5 });
                                }
                                
                                // Mark as dead so it gets removed from combat
                                deadIds.push(hit.enemyId);

                                if (explosionDamage && explosionDamage !== "0d0") {
                                    if (triggerExplosion) {
                                        if (activeExplosionsRef) {
                                             activeExplosionsRef.current++;
                                             if (forceUpdate) forceUpdate(prev => prev + 1);
                                         }
                                        setTimeout(() => {
                                            triggerExplosion(dx, dy, explosionDamage, 1.5, 'ANIM_EXPLOSION', undefined);
                                            if (activeExplosionsRef) {
                                                 activeExplosionsRef.current--;
                                                 if (forceUpdate) forceUpdate(prev => prev + 1);
                                             }
                                        }, 10);
                                    }
                                }
                            } else {
                                // Update decoration HP
                                updateTile(dy, dx, t => {
                                    const curDecs = t.decorations && t.decorations.length > 0
                                        ? t.decorations
                                        : (t.decoration ? [t.decoration] : []);
                                    if (curDecs.length > 0) {
                                        const newDecs = curDecs.map(dc => {
                                            if (dc.id === decor.id || curDecs.length === 1) {
                                                return { ...dc, hp: newHp };
                                            }
                                            return dc;
                                        });
                                        t.decorations = newDecs;
                                        t.decoration = newDecs[0];
                                    }
                                });
                            }
                        }
                    }
                }
            }
        });
        
        // COMMIT GRID UPDATES
        if (gridModified && currentGrid) {
            const newData = { ...levelDataRef.current, grid: currentGrid };
            levelDataRef.current = newData;
            setLevelData(newData);
        }

        let drops: any[] = [];
        let allEnemiesDead = false;

        if (deadIds.length > 0) {
            const uniqueDeadIds = Array.from(new Set(deadIds));
            drops = handleEnemiesKilled(uniqueDeadIds);
            
            // Check if all active enemies are dead to prevent triggering a turn after combat ends
            const activeIds = combatRef.current.activeGroup.map(g => g.id);
            // Only count REAL enemies, ignore decorations for combat continuation
            const realActiveIds = activeIds.filter(id => !id.startsWith('decor_'));
            const remaining = realActiveIds.filter(id => !uniqueDeadIds.includes(id));
            
            if (remaining.length === 0) {
                allEnemiesDead = true;
            }
        }
        
        if (!allEnemiesDead) {
            let shouldTriggerEnemyTurn = true;
            
            const mainWeapon = player.equippedWeapon || (itemsDb?.['fists'] ? { ...itemsDb['fists'], id: 'fists_weapon', name: strings?.ui?.header?.fists || 'Fists' } as Item : null);
            const akimboWeapon = player.equipment.weaponAkimbo || (mainWeapon?.id === 'fists_weapon' ? mainWeapon : null);
            
            // Allow akimbo if assetIds match OR if it is our special fists fallback.
            if (mainWeapon && akimboWeapon && (mainWeapon.assetId === akimboWeapon.assetId || mainWeapon.id === 'fists_weapon')) {
                if (akimboShotsRemainingRef.current === 0) {
                    const nextHand = nextAkimboHandRef.current;
                    const nextWeapon = nextHand === 'akimbo' ? akimboWeapon : mainWeapon;
                    const hasAmmo = nextWeapon.currentAmmo === undefined || nextWeapon.currentAmmo > 0;
                    const hasDurability = nextWeapon.durability === undefined || nextWeapon.durability > 0;
                    
                    if (hasAmmo && hasDurability) {
                        akimboShotsRemainingRef.current = 1;
                        shouldTriggerEnemyTurn = false;
                    }
                } else {
                    akimboShotsRemainingRef.current = 0;
                }
            } else {
                akimboShotsRemainingRef.current = 0;
            }

            if (shootType === 'auto') {
                shouldTriggerEnemyTurn = false;
            }

            if (shouldTriggerEnemyTurn) {
                triggerEnemyTurn(false, deadIds, false, drops);
            } else {
                combatRef.current.isProcessingTurn = false;
                setCombat(prev => ({ ...prev, isProcessingTurn: false }));
            }
        } else {
            akimboShotsRemainingRef.current = 0;
        }

        return { grid: gridModified ? currentGrid : null, hasNextAkimbo: akimboShotsRemainingRef.current > 0 };
    };

    useEffect(() => {
        if (combat.isActive && ambushTargetRef.current) {
            const targetId = ambushTargetRef.current;
            ambushTargetRef.current = null;
            
            preparePlayerAttack();
            
            const firingHand = lastFiredHandRef.current;
            const mainWeapon = player.equippedWeapon || (itemsDb?.['fists'] ? { ...itemsDb['fists'], id: 'fists_weapon', name: strings?.ui?.header?.fists || 'Fists' } as Item : null);
            const akimboWeapon = player.equipment.weaponAkimbo || (mainWeapon?.id === 'fists_weapon' ? mainWeapon : null);
            const activeWeapon = firingHand === 'akimbo' ? akimboWeapon : mainWeapon;
            const weaponDamage = activeWeapon?.damageDice || "1d1";
            const damage = rollDice(weaponDamage);
            
            triggerMuzzleFlash();
            // triggerWeaponAnimation is called inside preparePlayerAttack, so we don't need to call it here.
            handlePlayerAttack(targetId, damage, false, false, true); 
        }
    }, [combat.isActive]);

    useEffect(() => {
        if (combat.isActive && shouldTriggerEnemyTurnRef.current) {
            shouldTriggerEnemyTurnRef.current = false;
            triggerEnemyTurn();
        }
    }, [combat.isActive, triggerEnemyTurn]);

    // Sync combat group with new visible decorations and NPCs when player or enemies move
    useEffect(() => {
        if (!combat.isActive) return;
        
        const currentLevel = levelDataRef.current;
        if (!currentLevel) return;
        
        // 1. Scan for visible decorations
        const visibleDecorations = getVisibleDestructibleDecorations(playerRef.current.pos, currentLevel.grid, currentLevel.width, currentLevel.height);
        const currentIds = new Set(combatRef.current.activeGroup.map(g => g.id));
        const newDecorIds = visibleDecorations.filter(d => !currentIds.has(d.id)).map(d => d.id);
        
        // 2. Scan for visible NPCs (visible to player only)
        const visibleNPCs = getVisibleNPCsToGroup(
            playerRef.current.pos,
            combatRef.current.activeGroup,
            enemies,
            currentLevel.grid,
            currentLevel.width,
            currentLevel.height
        );
        const newNpcIds = visibleNPCs.filter(n => !currentIds.has(n.id)).map(n => n.id);
        
        const allNewIds = [...newDecorIds, ...newNpcIds];
        if (allNewIds.length > 0) {
            joinCombat(allNewIds);
        }
    }, [
        Math.round(player.pos.x),
        Math.round(player.pos.y),
        combat.isActive,
        combat.activeGroup,
        joinCombat,
        enemies,
        levelData
    ]);

    return {
        combat,
        combatRef,
        setCombat,
        enemies,
        setEnemies, 
        combatTimerBonus,
        setCombatTimerBonus,
        enemyMoveAnim,
        setEnemyMoveAnim,
        visualHitIds,
        handleVisualHit,
        startCombat,
        handleEnemiesKilled,
        triggerEnemyTurn,
        handlePlayerAttack,
        preparePlayerAttack,
        activeCombatEnemies,
        escapeDirection,
        activeGroup: combat.activeGroup,
        joinCombat
    };
};
