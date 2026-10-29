import React, { useCallback } from 'react';
import { rollDice } from '../utils/dice';
import { getMaskBuffer, createBrickParticles, createShardParticles, createGibParticles, createExplodingDecorationParticles } from '../utils/particleSystem';
import { spawnPolyObjectDebris, isPolyObjectDecoration } from '../utils/polyDebrisSystem';
import { findEnemiesWithLineOfSight, hasLineOfSight } from '../utils/combatLogic';
import { Tile, Enemy, Player, GameState } from '../types';
import animations from '../data/animations.json';

interface UseExplosionSystemProps {
    player: Player;
    setPlayer: React.Dispatch<React.SetStateAction<Player>>;
    levelData: any;
    setLevelData: React.Dispatch<React.SetStateAction<any>>;
    enemies?: Map<string, Enemy>;
    enemiesRef?: React.MutableRefObject<Map<string, Enemy>>;
    setEnemies: React.Dispatch<React.SetStateAction<Map<string, Enemy>>>;
    spriteMap: Map<string, HTMLImageElement>;
    raycasterRef: React.RefObject<any>;
    activeExplosionsRef?: React.MutableRefObject<number>;
    playSound: (soundId: string, pos?: { x: number, y: number }) => void;
    triggerScreenShake: () => void;
    triggerDamageEffect: () => void;
    triggerExplosionFlash?: (x: number, y: number, intensity?: number, duration?: number, isFlashbang?: boolean) => void;
    addLog: (msg: string, type: string) => void;
    strings: any;
    joinCombat: (enemyIds: string[]) => void;
    explosionsRef: React.MutableRefObject<any[]>;
    handleEnemiesKilled: (enemyIds: string[], fromExplosion?: boolean, byPlayer?: boolean) => void;
    animations: any;
    onVisualHit?: (enemyId: string) => void;
    setGameState?: (state: GameState) => void;
    gameState?: GameState;
    addSplatter?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR' | 'DOOR' | 'SCORCH' | 'SCORCH_WALL', intensity?: number, face?: number, gridOverride?: Tile[][]) => void;
    forceUpdate?: React.Dispatch<React.SetStateAction<number>>;
}

export function useExplosionSystem({
    player,
    setPlayer,
    levelData,
    setLevelData,
    enemies,
    enemiesRef: propEnemiesRef,
    setEnemies,
    spriteMap,
    raycasterRef,
    activeExplosionsRef,
    playSound,
    triggerScreenShake,
    triggerDamageEffect,
    triggerExplosionFlash,
    addLog,
    strings,
    joinCombat,
    explosionsRef,
    handleEnemiesKilled,
    animations,
    onVisualHit,
    setGameState,
    gameState,
    addSplatter,
    forceUpdate
}: UseExplosionSystemProps) {
    const levelDataRef = React.useRef(levelData);
    levelDataRef.current = levelData;
    const playerRef = React.useRef(player);
    playerRef.current = player;
    const gameStateRef = React.useRef(gameState);
    gameStateRef.current = gameState;
    
    const fallbackEnemiesRef = React.useRef(enemies || new Map());
    if (enemies) fallbackEnemiesRef.current = enemies;
    const enemiesRef = propEnemiesRef || fallbackEnemiesRef;

    const handleExplosionRef = React.useRef<any>(null);
    const queueRef = React.useRef<{
        x: number;
        y: number;
        damageDice: string;
        range: number;
        assetId: string;
        wallTextureId?: string;
        playerPosOverride?: {x: number, y: number};
        gridOverride?: Tile[][];
        ignoredTiles?: Set<string>;
        soundId: string;
        itemType?: string;
        itemDuration?: number;
    }[]>([]);
    const isProcessingRef = React.useRef<boolean>(false);

    const handleExplosion = useCallback((
        x: number, 
        y: number, 
        damageDice: string, 
        range: number, 
        assetId: string = 'ANIM_EXPLOSION', 
        wallTextureId?: string, 
        playerPosOverride?: {x: number, y: number}, 
        gridOverride?: Tile[][], 
        ignoredTiles?: Set<string>,
        soundId: string = 'EXPLOSION',
        itemType?: string,
        itemDuration?: number
    ) => {
        if (activeExplosionsRef) {
            const wasActive = activeExplosionsRef.current > 0 || (explosionsRef.current?.length || 0) > 0;
            activeExplosionsRef.current++;
            const isActiveNow = activeExplosionsRef.current > 0 || (explosionsRef.current?.length || 0) > 0;
            if (isActiveNow !== wasActive && forceUpdate) {
                forceUpdate(prev => prev + 1);
            }
        }

        queueRef.current.push({
            x, y, damageDice, range, assetId, wallTextureId,
            playerPosOverride, gridOverride, ignoredTiles,
            soundId, itemType, itemDuration
        });

        if (isProcessingRef.current) {
            return;
        }

        isProcessingRef.current = true;

        const processNext = () => {
            const nextItem = queueRef.current.shift();
            if (!nextItem) {
                isProcessingRef.current = false;
                return;
            }

            if (activeExplosionsRef) {
                const wasActive = activeExplosionsRef.current > 0 || (explosionsRef.current?.length || 0) > 0;
                activeExplosionsRef.current = Math.max(0, activeExplosionsRef.current - 1);
                const isActiveNow = activeExplosionsRef.current > 0 || (explosionsRef.current?.length || 0) > 0;
                if (isActiveNow !== wasActive && forceUpdate) {
                    forceUpdate(prev => prev + 1);
                }
            }

            const {
                x,
                y,
                damageDice,
                range,
                assetId,
                wallTextureId,
                playerPosOverride,
                gridOverride,
                ignoredTiles,
                soundId,
                itemType,
                itemDuration
            } = nextItem;

            console.log(`[HANDLE_EXPLOSION] At ${x}, ${y}, itemType: ${itemType}, itemDuration: ${itemDuration}`);
            const createsShockwave = itemType !== 'FLASHBANG' && damageDice !== '0d0' && damageDice !== '0';
            const id = Math.random().toString(36);
            
            playSound(soundId, { x, y });
            triggerScreenShake();
            if (triggerExplosionFlash) triggerExplosionFlash(x, y, 4.0, 400, itemType === 'FLASHBANG');

            if (itemType === 'FLASHBANG') {
                const targetPos = playerPosOverride || playerRef.current.pos;
                const pX = Math.round(targetPos.x);
                const pY = Math.round(targetPos.y);
                const gridToUse = gridOverride || levelDataRef.current.grid;
                const canHitPlayer = hasLineOfSight({x, y}, {x: pX, y: pY}, gridToUse, levelDataRef.current.width, levelDataRef.current.height, null, false);
                
                console.log(`[FLASHBANG] Exploded at ${x}, ${y}. Player at ${pX}, ${pY}. Hit player: ${canHitPlayer}`);

                if (canHitPlayer) {
                    setPlayer(p => ({ ...p, flashDuration: (itemDuration || 4) + 2 }));
                    addLog(strings?.logs?.flashbang_flash || 'Ослепительная вспышка!', 'WARNING');
                }
                
                const flashedIds = findEnemiesWithLineOfSight({ x, y }, gridToUse, levelDataRef.current.width, levelDataRef.current.height);
                console.log(`[FLASHBANG] Enemies found in LoS:`, flashedIds);

                if (flashedIds.length > 0) {
                    setEnemies(prev => {
                        const next = new Map(prev);
                        flashedIds.forEach(id => {
                            const enemy = next.get(id) as any;
                            if (enemy && enemy.hp > 0) {
                                console.log(`[FLASHBANG] Flashing enemy: ${enemy.name} (${id})`);
                                next.set(id, { ...enemy, aiState: 'FLASHED', flashDuration: (itemDuration || 4) });
                            }
                        });
                        return next;
                    });
                }
            }
            
            // Spawn Wall Debris (Bricks)
            if (wallTextureId) {
                const bricks = createBrickParticles(x + 0.5, y + 0.5, wallTextureId, 16);
                raycasterRef.current?.spawnParticles(bricks);
            }
            
            const targetPos = playerPosOverride || player.pos;
            const pX = Math.round(targetPos.x);
            const pY = Math.round(targetPos.y);
            
            const damageMap = new Map<string, number>();
            const hitEnemyPositions = new Map<string, {x: number, y: number}>();
            let playerHitDamage = 0;
            const newExplosions: any[] = [];
            const doorsToDestroy: {x: number, y: number}[] = [];
            const windowsToDestroy: {x: number, y: number}[] = [];
            const mirrorsToDestroy: {x: number, y: number}[] = [];
            const decorationsToDestroy: {x: number, y: number, decoration: any}[] = [];
            const decorationsToUpdate: {x: number, y: number, decorationId?: string, hp: number}[] = [];
            
            const processedTiles = ignoredTiles || new Set<string>();

            // Cache for hasLineOfSight calls during this explosion calculation
            const losCacheLocal = new Map<string, boolean>();
            const getHasLosLocal = (tx: number, ty: number, ignoreId: string | null = null) => {
                const cacheKey = `${tx},${ty},${ignoreId || ''}`;
                if (losCacheLocal.has(cacheKey)) return losCacheLocal.get(cacheKey)!;
                const gridToUse = gridOverride || levelDataRef.current?.grid;
                if (!gridToUse || !levelDataRef.current) return false;
                const res = hasLineOfSight({x, y}, {x: tx, y: ty}, gridToUse, levelDataRef.current.width, levelDataRef.current.height, ignoreId || undefined, false);
                losCacheLocal.set(cacheKey, res);
                return res;
            };

            // Single loop logic (like grenade)
            const r = Math.floor(range);
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = x + dx;
                    const ty = y + dy;
                    
                    if (!levelDataRef.current || tx < 0 || ty < 0 || tx >= levelDataRef.current.width || ty >= levelDataRef.current.height) continue;

                    // Visuals and Decals
                    if (assetId !== "") {
                        const tileForVis = (gridOverride || levelDataRef.current.grid)[ty][tx];
                        const isOpaqueClosedDoor = tileForVis.type === 'DOOR' && tileForVis.door && tileForVis.door.state !== 'OPEN' && !tileForVis.door.maskId && !tileForVis.door.broken;
                        const isSolidWall = tileForVis.type === 'WALL' && !tileForVis.isWindow && tileForVis.blocking !== false;

                        const canSeeExplosion = getHasLosLocal(tx, ty);
                        
                        if (canSeeExplosion) {
                            if (!isOpaqueClosedDoor && !isSolidWall) {
                                newExplosions.push({ 
                                     id: `${id}_${dx}_${dy}`, 
                                     x: tx, 
                                     y: ty, 
                                     assetId: assetId, 
                                     startTime: performance.now() 
                                });
                                if (addSplatter) {
                                    addSplatter(tx + 0.5 + (Math.random()-0.5)*0.2, ty + 0.5 + (Math.random()-0.5)*0.2, 0, 'SCORCH', 0.7 + Math.random() * 0.4, undefined, gridOverride);
                                }
                            } else {
                                if (addSplatter) {
                                    let face: number | undefined;
                                    if (tx > Math.round(x)) face = 3;
                                    else if (tx < Math.round(x)) face = 1;
                                    else if (ty > Math.round(y)) face = 2;
                                    else face = 0;
                                    addSplatter(tx + 0.5, ty + 0.5, 0.2 + Math.random() * 0.6, 'SCORCH_WALL', 0.8 + Math.random() * 0.4, face, gridOverride);
                                }
                            }
                        }
                    }

                    // Player Damage
                    if (tx === pX && ty === pY) {
                        const canHitPlayer = getHasLosLocal(tx, ty);
                        if (canHitPlayer) {
                            playerHitDamage = rollDice(damageDice);
                        }
                    }

                    const tile = (gridOverride || levelDataRef.current.grid)[ty][tx];

                    if (createsShockwave) {
                        // Door Logic
                        if (tile.type === 'DOOR' && tile.door?.maskId && tile.door.state !== 'OPEN') {
                             if (!tile.door.broken) {
                                 const canHitDoor = getHasLosLocal(tx, ty);
                                 if (canHitDoor) {
                                     doorsToDestroy.push({x: tx, y: ty});
                                     
                                     // Spawn Glass Shards
                                     const maskBuffer = getMaskBuffer(tile.door.maskId, spriteMap);
                                     if (maskBuffer) {
                                         const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.door.textureId || tile.door.maskId, tile.door.maskId, maskBuffer, 20, 1.0, spriteMap as any);
                                         raycasterRef.current?.spawnParticles(shards);
                                         playSound('SYS_GLASS_SHATTER', { x: tx + 0.5, y: ty + 0.5 });
                                     }
                                 }
                             }
                        }

                        // Window Logic
                        if (tile.isWindow && tile.glassAssetId && tile.canBeDestroyed !== false) {
                             if (!tile.isGlassBroken) {
                                 const canHitWindow = getHasLosLocal(tx, ty);
                                 if (canHitWindow) {
                                     if (!windowsToDestroy.some(w => w.x === tx && w.y === ty)) {
                                         windowsToDestroy.push({x: tx, y: ty});
                                         
                                         // Spawn Glass Shards
                                         const maskBuffer = getMaskBuffer(tile.glassAssetId, spriteMap);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.glassAssetId, tile.glassAssetId, maskBuffer, 20, 1.0, spriteMap as any);
                                             raycasterRef.current?.spawnParticles(shards);
                                             if (tile.glassBreakSound) {
                                                 playSound(tile.glassBreakSound, { x: tx + 0.5, y: ty + 0.5 });
                                             }
                                         }
                                     }
                                 }
                             }
                        }

                        // Mirror Logic
                        if (tile.mirror && tile.canBeDestroyed !== false && tile.maskId) {
                             if (!tile.isMirrorBroken) {
                                 const canHitMirror = getHasLosLocal(tx, ty);
                                 if (canHitMirror) {
                                     if (!mirrorsToDestroy.some(m => m.x === tx && m.y === ty)) {
                                         mirrorsToDestroy.push({x: tx, y: ty});
                                         
                                         const maskBuffer = getMaskBuffer(tile.maskId, spriteMap);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.assetId || tile.maskId, tile.maskId, maskBuffer, 20, 1.0, spriteMap as any);
                                             raycasterRef.current?.spawnParticles(shards);
                                             playSound('SYS_GLASS_SHATTER', { x: tx + 0.5, y: ty + 0.5 });
                                         }
                                     }
                                 }
                             }
                        }

                        // Decoration Logic
                        const decList = tile.decorations && tile.decorations.length > 0
                            ? tile.decorations
                            : (tile.decoration ? [tile.decoration] : []);

                        decList.forEach((decor) => {
                            if (decor && decor.destructable) {
                                const key = `${tx},${ty}_${decor.id}`;
                                if (!processedTiles.has(key)) {
                                    const canHitDeco = getHasLosLocal(tx, ty);
                                    if (canHitDeco) {
                                        const dmg = rollDice(damageDice);
                                        const currentHp = decor.hp !== undefined ? decor.hp : 1;
                                        const newHp = currentHp - dmg;
                                        if (newHp <= 0) {
                                            decorationsToDestroy.push({x: tx, y: ty, decoration: decor});
                                            processedTiles.add(key);
                                        } else {
                                            decorationsToUpdate.push({x: tx, y: ty, decorationId: decor.id, hp: newHp});
                                        }
                                    }
                                }
                            }
                        });
                    }

                    // Enemy Damage
                    if (tile.enemyId) {
                        // Ignore the enemy itself to prevent its own tile from blocking LoS
                        const canHitEnemy = getHasLosLocal(tx, ty, tile.enemyId);
                        if (canHitEnemy) {
                            const dmg = rollDice(damageDice);
                            const current = damageMap.get(tile.enemyId) || 0;
                            damageMap.set(tile.enemyId, current + dmg);
                            hitEnemyPositions.set(tile.enemyId, {x: tx, y: ty});
                        }
                    }
                }
            }

            // Shockwave logic for fragile objects (like glass doors)
            const shockwaveR = Math.ceil(range);
            if (shockwaveR > r && createsShockwave) {
                for (let dy = -shockwaveR; dy <= shockwaveR; dy++) {
                    for (let dx = -shockwaveR; dx <= shockwaveR; dx++) {
                        // Only process the outer ring (shockwave)
                        if (Math.abs(dx) <= r && Math.abs(dy) <= r) continue;

                        const tx = x + dx;
                        const ty = y + dy;
                        
                        if (!levelDataRef.current || tx < 0 || ty < 0 || tx >= levelDataRef.current.width || ty >= levelDataRef.current.height) continue;
                        
                        const tile = (gridOverride || levelDataRef.current.grid)[ty][tx];
                        
                        // Door Logic (Shockwave breaks glass)
                        if (tile.type === 'DOOR' && tile.door?.maskId && tile.door.state !== 'OPEN') {
                             if (!tile.door.broken) {
                                 const canHitDoor = getHasLosLocal(tx, ty);
                                 if (canHitDoor) {
                                     // Check if it's already in doorsToDestroy to avoid duplicates
                                     if (!doorsToDestroy.some(d => d.x === tx && d.y === ty)) {
                                         doorsToDestroy.push({x: tx, y: ty});
                                         
                                         // Spawn Glass Shards
                                         const maskBuffer = getMaskBuffer(tile.door.maskId, spriteMap);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.door.textureId || tile.door.maskId, tile.door.maskId, maskBuffer, 20, 1.0, spriteMap as any);
                                             raycasterRef.current?.spawnParticles(shards);
                                             playSound('SYS_GLASS_SHATTER', { x: tx + 0.5, y: ty + 0.5 });
                                         }
                                     }
                                 }
                             }
                        }
                        
                        // Window Logic (Shockwave breaks glass)
                        if (tile.isWindow && tile.glassAssetId && tile.canBeDestroyed !== false) {
                             if (!tile.isGlassBroken) {
                                 const canHitWindow = getHasLosLocal(tx, ty);
                                 if (canHitWindow) {
                                     // Check if it's already in windowsToDestroy to avoid duplicates
                                     if (!windowsToDestroy.some(w => w.x === tx && w.y === ty)) {
                                         windowsToDestroy.push({x: tx, y: ty});
                                         
                                         // Spawn Glass Shards
                                         const maskBuffer = getMaskBuffer(tile.glassAssetId, spriteMap);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.glassAssetId, tile.glassAssetId, maskBuffer, 20, 1.0, spriteMap as any);
                                             raycasterRef.current?.spawnParticles(shards);
                                             if (tile.glassBreakSound) {
                                                 playSound(tile.glassBreakSound, { x: tx + 0.5, y: ty + 0.5 });
                                             }
                                         }
                                     }
                                 }
                             }
                        }

                        // Mirror Logic (Shockwave breaks mirror)
                        if (tile.mirror && tile.canBeDestroyed !== false && tile.maskId) {
                             if (!tile.isMirrorBroken) {
                                 const canHitMirror = getHasLosLocal(tx, ty);
                                 if (canHitMirror) {
                                     if (!mirrorsToDestroy.some(m => m.x === tx && m.y === ty)) {
                                         mirrorsToDestroy.push({x: tx, y: ty});
                                         
                                         const maskBuffer = getMaskBuffer(tile.maskId, spriteMap);
                                         if (maskBuffer) {
                                             const shards = createShardParticles(tx + 0.5, ty + 0.5, 0.5, tile.assetId || tile.maskId, tile.maskId, maskBuffer, 20, 1.0, spriteMap as any);
                                             raycasterRef.current?.spawnParticles(shards);
                                             playSound('SYS_GLASS_SHATTER', { x: tx + 0.5, y: ty + 0.5 });
                                         }
                                     }
                                 }
                             }
                        }
                    }
                }
            }

            // Aggro Logic
            if (itemType !== 'FLASHBANG') {
                const enemiesToAggro = new Set<string>();
                
                const enemiesWithLoSPlayer = findEnemiesWithLineOfSight(playerPosOverride || playerRef.current.pos, levelDataRef.current.grid, levelDataRef.current.width, levelDataRef.current.height);

                const hitEnemyIds: string[] = [];
                damageMap.forEach((dmg, id) => {
                    const enemy = enemiesRef.current.get(id);
                    if (enemy && (enemy.hp - dmg > 0)) {
                        hitEnemyIds.push(id);
                        // 1. If got hit AND sees the player
                        if (enemiesWithLoSPlayer.includes(id)) {
                            enemiesToAggro.add(id);
                        }
                    }
                });

                // 2. Or if sees someone who took damage AND sees the player
                hitEnemyIds.forEach(hitId => {
                    const hitEnemyPos = hitEnemyPositions.get(hitId);
                    if (hitEnemyPos) {
                        const enemiesSeeingHit = findEnemiesWithLineOfSight(hitEnemyPos, levelDataRef.current.grid, levelDataRef.current.width, levelDataRef.current.height);
                        enemiesSeeingHit.forEach(id => {
                            if (id !== hitId) {
                                if (enemiesWithLoSPlayer.includes(id)) {
                                    enemiesToAggro.add(id);
                                }
                            }
                        });
                    }
                });

                // Filter out any enemies that are dead/will die from the explosion
                const finalEnemiesToAggro: string[] = [];
                enemiesToAggro.forEach(id => {
                     const enemy = enemiesRef.current.get(id);
                     const dmg = damageMap.get(id) || 0;
                     if (enemy && (enemy.hp - dmg > 0)) {
                         finalEnemiesToAggro.push(id);
                     }
                });
                
                if (finalEnemiesToAggro.length > 0) {
                    joinCombat(finalEnemiesToAggro);
                }
            }

            // Apply Visuals
            const wasActive = (activeExplosionsRef?.current || 0) > 0 || (explosionsRef.current?.length || 0) > 0;
            explosionsRef.current.push(...newExplosions);
            window.dispatchEvent(new CustomEvent('raycaster-look'));
            const isActiveNow = (activeExplosionsRef?.current || 0) > 0 || (explosionsRef.current?.length || 0) > 0;
            if (isActiveNow !== wasActive) {
                if (forceUpdate) forceUpdate(prev => prev + 1);
            }
            setTimeout(() => { 
                const wasActiveTimeout = (activeExplosionsRef?.current || 0) > 0 || (explosionsRef.current?.length || 0) > 0;
                explosionsRef.current = explosionsRef.current.filter(e => !e.id.startsWith(id)); 
                window.dispatchEvent(new CustomEvent('raycaster-look'));
                const isActiveNowTimeout = (activeExplosionsRef?.current || 0) > 0 || (explosionsRef.current?.length || 0) > 0;
                if (isActiveNowTimeout !== wasActiveTimeout) {
                    if (forceUpdate) forceUpdate(prev => prev + 1);
                }
            }, 800);

            // Apply Player Damage
            if (playerHitDamage > 0) {
                let newPlayerX = pX;
                let newPlayerY = pY;
                
                if (playerRef.current.hp - playerHitDamage > 0) {
                   if (playerRef.current.sounds && playerRef.current.sounds.damage) playSound(playerRef.current.sounds.damage);
                   if (setGameState && gameStateRef.current !== GameState.FALLING && gameStateRef.current !== GameState.DYING && gameStateRef.current !== GameState.GAME_OVER) {
                       setGameState(GameState.FALLING);
                   }
                   
                   // Calculate pushback
                   const gridToUse = gridOverride || levelDataRef.current.grid;
                   const dx = pX - x;
                   const dy = pY - y;
                   const tryTiles = [];
                   
                   if (Math.abs(dx) > Math.abs(dy)) {
                       tryTiles.push({x: pX + (dx > 0 ? 1 : -1), y: pY});
                   } else if (Math.abs(dy) > Math.abs(dx)) {
                       tryTiles.push({x: pX, y: pY + (dy > 0 ? 1 : -1)});
                   } else if (dx !== 0 || dy !== 0) {
                       tryTiles.push({x: pX + (dx > 0 ? 1 : -1), y: pY});
                       tryTiles.push({x: pX, y: pY + (dy > 0 ? 1 : -1)});
                   } else {
                       // Directly on top of explosion
                       tryTiles.push({x: pX + 1, y: pY});
                       tryTiles.push({x: pX - 1, y: pY});
                       tryTiles.push({x: pX, y: pY + 1});
                       tryTiles.push({x: pX, y: pY - 1});
                   }
                   
                   for (const tt of tryTiles) {
                       if (tt.x >= 0 && tt.y >= 0 && tt.y < levelDataRef.current.height && tt.x < levelDataRef.current.width) {
                           const tile = gridToUse[tt.y][tt.x];
                           const isBlocked = tile.type === 'WALL' || tile.blocking || 
                                             (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.broken) ||
                                             tile.enemyId ||
                                             (tile.decoration && tile.decoration.blocking);
                           if (!isBlocked) {
                               newPlayerX = tt.x;
                               newPlayerY = tt.y;
                               break;
                           }
                       }
                   }
                }

                setPlayer(p => {
                    const newHp = Math.max(0, p.hp - playerHitDamage);
                    return { 
                        ...p, 
                        hp: newHp, 
                        concussionLevel: 3,
                        pos: { x: newPlayerX, y: newPlayerY }
                    };
                });
                addLog(strings.logs.explosion_hit_player.replace('{damage}', playerHitDamage.toString()), 'DANGER');
                triggerDamageEffect();
            }

            // Apply Grid Updates (Doors, Windows, Mirrors, Decorations)
            if (doorsToDestroy.length > 0 || windowsToDestroy.length > 0 || mirrorsToDestroy.length > 0 || decorationsToDestroy.length > 0 || decorationsToUpdate.length > 0) {
                if (gridOverride) {
                    doorsToDestroy.forEach(d => {
                        const t = gridOverride[d.y][d.x];
                        gridOverride[d.y][d.x] = { ...t, door: { ...t.door!, broken: true }, description: strings?.environment?.broken_door || "Broken Door" };
                    });
                    windowsToDestroy.forEach(d => {
                        const t = gridOverride[d.y][d.x];
                        gridOverride[d.y][d.x] = { ...t, isGlassBroken: true, glassAssetId: undefined };
                    });
                    mirrorsToDestroy.forEach(d => {
                        const t = gridOverride[d.y][d.x];
                        gridOverride[d.y][d.x] = { ...t, isMirrorBroken: true };
                    });
                    decorationsToDestroy.forEach(d => {
                        const decor = d.decoration;
                        const tile = gridOverride[d.y][d.x];
                        const curDecs = tile.decorations && tile.decorations.length > 0
                            ? tile.decorations
                            : (tile.decoration ? [tile.decoration] : []);

                        if (decor && decor.destroyedAssetId) {
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
                            gridOverride[d.y][d.x] = {
                                ...tile,
                                decorations: newDecs,
                                decoration: newDecs[0]
                            };
                        } else {
                            const newDecs = curDecs.filter(dc => dc.id !== decor.id);
                            gridOverride[d.y][d.x] = {
                                ...tile,
                                decorations: newDecs.length > 0 ? newDecs : undefined,
                                decoration: newDecs.length > 0 ? newDecs[0] : undefined
                            };
                        }
                        if (decor && decor.destructionSoundId) {
                            playSound(decor.destructionSoundId, { x: d.x + 0.5, y: d.y + 0.5 });
                        }
                        if (decor && decor.explode) {
                            if (isPolyObjectDecoration(decor)) {
                                const tileFH = (tile.type === 'FLOOR' && tile.height !== undefined ? tile.height : 0) + (tile.elevation || 0);
                                const debrisSound = decor.explodeSound || decor.destructionSoundId || 'SYS_DEBRIS_FALL';
                                spawnPolyObjectDebris(decor, d.x, d.y, tileFH, undefined, debrisSound);
                                if (decor.explodeSound && playSound) {
                                    playSound(decor.explodeSound, { x: d.x + 0.5, y: d.y + 0.5 });
                                }
                            } else if (raycasterRef.current) {
                                let actualAssetId = decor.assetId;
                                if (actualAssetId in animations) {
                                    actualAssetId = (animations as any)[actualAssetId].frames[0];
                                }
                                const isBox = decor.isBox;
                                const sizeFactor = isBox ? (decor.boxSize || 1.0) : (decor.scale || 1.0);
                                const multiplier = isBox ? 25 : 12.5;
                                const particleCount = Math.max(3, Math.min(25, Math.floor(multiplier * sizeFactor)));
                                const explodeParticles = createExplodingDecorationParticles(
                                    d.x + 0.5, d.y + 0.5, 0.5,
                                    actualAssetId,
                                    particleCount,
                                    decor.explodeSound,
                                    decor.scale || 1.0
                                );
                                raycasterRef.current.spawnParticles(explodeParticles);
                            }
                        }
                    });
                    decorationsToUpdate.forEach(d => {
                        const tile = gridOverride[d.y][d.x];
                        const curDecs = tile.decorations && tile.decorations.length > 0
                            ? tile.decorations
                            : (tile.decoration ? [tile.decoration] : []);
                        const newDecs = curDecs.map(dc => {
                            if (dc.id === (d as any).decorationId || curDecs.length === 1) {
                                return { ...dc, hp: d.hp };
                            }
                            return dc;
                        });
                        gridOverride[d.y][d.x] = {
                            ...tile,
                            decorations: newDecs,
                            decoration: newDecs[0]
                        };
                    });
                    // Force a React re-render by setting level data with the mutated override
                    setLevelData((prev: any) => ({ ...prev, grid: [...gridOverride] }));
                } else {
                    const anythingChanged = doorsToDestroy.length > 0 || 
                                           windowsToDestroy.length > 0 || 
                                           mirrorsToDestroy.length > 0 || 
                                           decorationsToDestroy.length > 0 || 
                                           decorationsToUpdate.length > 0;

                    if (anythingChanged) {
                        setLevelData((prev: any) => {
                            const newGrid = [...prev.grid];
                        const copiedRows = new Set<number>();
                        const ensureRowCopied = (y: number) => {
                            if (!copiedRows.has(y)) {
                                newGrid[y] = [...prev.grid[y]];
                                copiedRows.add(y);
                            }
                        };

                        doorsToDestroy.forEach(d => {
                            ensureRowCopied(d.y);
                            const t = newGrid[d.y][d.x];
                            newGrid[d.y][d.x] = { ...t, door: { ...t.door!, broken: true }, description: strings?.environment?.broken_door || "Broken Door" };
                        });
                        windowsToDestroy.forEach(d => {
                            ensureRowCopied(d.y);
                            const t = newGrid[d.y][d.x];
                            newGrid[d.y][d.x] = { ...t, isGlassBroken: true, glassAssetId: undefined };
                        });
                        mirrorsToDestroy.forEach(d => {
                            ensureRowCopied(d.y);
                            const t = newGrid[d.y][d.x];
                            newGrid[d.y][d.x] = { ...t, isMirrorBroken: true };
                        });
                        decorationsToDestroy.forEach(d => {
                            ensureRowCopied(d.y);
                            const t = newGrid[d.y][d.x];
                            const newTile = { ...t };
                            const decor = d.decoration;
                            const curDecs = newTile.decorations && newTile.decorations.length > 0
                                ? newTile.decorations
                                : (newTile.decoration ? [newTile.decoration] : []);

                            if (decor && decor.destroyedAssetId) {
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
                                newTile.decorations = newDecs;
                                newTile.decoration = newDecs[0];
                            } else {
                                const newDecs = curDecs.filter(dc => dc.id !== decor.id);
                                newTile.decorations = newDecs.length > 0 ? newDecs : undefined;
                                newTile.decoration = newDecs.length > 0 ? newDecs[0] : undefined;
                            }
                            if (decor && decor.destructionSoundId) {
                                playSound(decor.destructionSoundId, { x: d.x + 0.5, y: d.y + 0.5 });
                            }
                            if (decor && decor.explode) {
                                if (isPolyObjectDecoration(decor)) {
                                    const tileFH = (t.type === 'FLOOR' && t.height !== undefined ? t.height : 0) + (t.elevation || 0);
                                    const debrisSound = decor.explodeSound || decor.destructionSoundId || 'SYS_DEBRIS_FALL';
                                    spawnPolyObjectDebris(decor, d.x, d.y, tileFH, undefined, debrisSound);
                                    if (decor.explodeSound && playSound) {
                                        playSound(decor.explodeSound, { x: d.x + 0.5, y: d.y + 0.5 });
                                    }
                                } else if (raycasterRef.current) {
                                    let actualAssetId = decor.assetId;
                                    if (actualAssetId in animations) {
                                        actualAssetId = (animations as any)[actualAssetId].frames[0];
                                    }
                                    const isBox = decor.isBox;
                                    const sizeFactor = isBox ? (decor.boxSize || 1.0) : (decor.scale || 1.0);
                                    const multiplier = isBox ? 25 : 12.5;
                                    const particleCount = Math.max(3, Math.min(25, Math.floor(multiplier * sizeFactor)));
                                    const explodeParticles = createExplodingDecorationParticles(
                                        d.x + 0.5, d.y + 0.5, 0.5,
                                        actualAssetId,
                                        particleCount,
                                        decor.explodeSound,
                                        decor.scale || 1.0
                                    );
                                    raycasterRef.current.spawnParticles(explodeParticles);
                                }
                            }
                            newGrid[d.y][d.x] = newTile;
                        });
                        decorationsToUpdate.forEach(d => {
                            ensureRowCopied(d.y);
                            const t = newGrid[d.y][d.x];
                            const newTile = { ...t };
                            const curDecs = newTile.decorations && newTile.decorations.length > 0
                                ? newTile.decorations
                                : (newTile.decoration ? [newTile.decoration] : []);
                            if (curDecs.length > 0) {
                                const newDecs = curDecs.map(dc => {
                                    if (dc.id === (d as any).decorationId || curDecs.length === 1) {
                                        return { ...dc, hp: d.hp };
                                    }
                                    return dc;
                                });
                                newTile.decorations = newDecs;
                                newTile.decoration = newDecs[0];
                                newGrid[d.y][d.x] = newTile;
                            }
                        });
                        return { ...prev, grid: newGrid };
                    });
                    }
                }

                // Chain Reactions
                decorationsToDestroy.forEach(d => {
                    if (d.decoration.explosion_damage) {
                         if (handleExplosionRef.current) {
                             handleExplosionRef.current(d.x, d.y, d.decoration.explosion_damage, 1.5, 'ANIM_EXPLOSION', undefined, undefined, undefined, processedTiles);
                         }
                    }
                });
            }

            // Apply Enemy Damage & Update Level
            if (damageMap.size > 0) {
                const deadEnemyIds: string[] = [];

                // Calculate dead enemies synchronously
                damageMap.forEach((dmg, id) => {
                    const enemy = enemiesRef.current.get(id);
                    if (enemy) {
                        if (enemy.hp - dmg <= 0 && !deadEnemyIds.includes(id)) {
                            deadEnemyIds.push(id);
                        }
                    }
                });

                setEnemies(prev => {
                    const next = new Map(prev);
                    damageMap.forEach((dmg, id) => {
                        const enemy = next.get(id) as any;
                        if (enemy) {
                            const newHp = enemy.hp - dmg;
                            if (newHp <= 0) {
                                next.set(id, { ...enemy, hp: 0 });
                            } else {
                                next.set(id, { ...enemy, hp: newHp });
                            }
                        }
                    });
                    return next;
                });

                damageMap.forEach((dmg, id) => {
                    const enemy = enemiesRef.current.get(id);
                    if (enemy) {
                        if (enemy.hp - dmg > 0 && dmg > 0) {
                            addLog(`${enemy.name} получает ${dmg} урона от взрыва!`, 'SUCCESS');
                        }
                        if (enemy.sounds && enemy.sounds.damage && itemType !== 'FLASHBANG') {
                            const evtPos = hitEnemyPositions.get(id);
                            if (evtPos) playSound(enemy.sounds.damage, {x: evtPos.x, y: evtPos.y});
                            else playSound(enemy.sounds.damage);
                        }
                        if (onVisualHit) {
                            onVisualHit(itemType === 'FLASHBANG' ? `${id}_NOBLEED` : id);
                        }
                    }
                });

                if (deadEnemyIds.length > 0) {
                    console.log("[DEBUG] handleExplosion: deadEnemyIds =", deadEnemyIds);

                    // Spawn gibs for enemies that died from explosion
                    deadEnemyIds.forEach(id => {
                        const enemy = enemiesRef.current.get(id);
                        const pos = hitEnemyPositions.get(id);
                        if (enemy && pos && enemy.assets.gibMask && enemy.gibCounts) {
                            const maskBuffer = getMaskBuffer(enemy.assets.gibMask, spriteMap);
                            if (maskBuffer) {
                                const anim = animations[enemy.assets.map.assetId];
                                const textureId = anim ? anim.frames[0] : enemy.assets.map.assetId;
                                
                                const gibs = createGibParticles(
                                    pos.x + 0.5, pos.y + 0.5, 0.5,
                                    textureId,
                                    maskBuffer,
                                    enemy.gibCounts,
                                    enemy.assets.map.scale || 1.0,
                                    spriteMap
                                );
                                console.log("[DEBUG] Spawned gibs:", gibs.length, "for enemy:", id, "mask:", enemy.assets.gibMask);
                                raycasterRef.current?.spawnParticles(gibs);
                            }
                        }
                    });

                    // Call synchronously to prevent Reaper useEffect from catching the 0 HP enemy first
                    console.log("[DEBUG] handleExplosion killing deadEnemyIds =", deadEnemyIds);
                    handleEnemiesKilled(deadEnemyIds, true);
                }
            }

            if (queueRef.current.length > 0) {
                setTimeout(processNext, 350);
            } else {
                isProcessingRef.current = false;
            }
        };

        processNext();
    }, [levelData, player.pos, playSound, triggerScreenShake, triggerExplosionFlash, addLog, setPlayer, setEnemies, setLevelData, triggerDamageEffect, strings, handleEnemiesKilled, spriteMap, joinCombat, explosionsRef, raycasterRef, animations, forceUpdate, activeExplosionsRef]);

    handleExplosionRef.current = handleExplosion;

    return { handleExplosion };
}
