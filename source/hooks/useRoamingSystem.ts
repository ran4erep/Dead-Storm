import React, { useCallback, useEffect } from 'react';
import { Player, Tile, RoamingEnemyAnim, Enemy } from '../types';
import { getRoamingMove, findPath, findBestAttackPosition, getPatrolTarget, getRoamingTarget, getChaseMove } from '../utils/aiLogic';
import { hasLineOfSight, isValidCombatPosition } from '../utils/combatLogic';

const easeInOutQuad = (t: number) => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export const useRoamingSystem = (
    levelData: any,
    setLevelData: React.Dispatch<React.SetStateAction<any>>,
    enemies: Map<string, Enemy>,
    setEnemies: React.Dispatch<React.SetStateAction<Map<string, Enemy>>>,
    player: Player,
    isCombatActive: boolean,
    setRoamingAnims: (anims: RoamingEnemyAnim[] | ((prev: RoamingEnemyAnim[]) => RoamingEnemyAnim[])) => void,
    roamingAnims?: RoamingEnemyAnim[],
    activeCombatEnemyIds?: Set<string>, 
    aiEnabled: boolean = true,
    onEnemyJoinCombat?: (enemyIds: string[]) => void,
    onEnemyStep?: (enemyId: string, x: number, y: number, stepIndex?: number, totalSteps?: number) => void, // NEW CALLBACK
    playSound?: (soundId: string, options?: any) => void,
    enemiesStateRef?: React.MutableRefObject<Map<string, Enemy>>
) => {
    const liveEnemies = enemiesStateRef?.current || enemies;
    const enemyPositionsCacheRef = React.useRef<Map<string, { x: number, y: number }>>(new Map());
    const lastCachedGridRef = React.useRef<Tile[][] | null>(null);

    const getEnemyPositions = useCallback((grid: Tile[][], width: number, height: number) => {
        const globalCache = typeof window !== 'undefined' ? (window as any).enemyPositionsCache : null;
        if (globalCache) {
            return globalCache;
        }

        const cache = enemyPositionsCacheRef.current;
        const isCacheValid = lastCachedGridRef.current === grid;

        if (isCacheValid) {
            return cache;
        }

        const newCache = new Map<string, { x: number, y: number }>();
        for (let y = 0; y < height; y++) {
            const row = grid[y];
            if (!row) continue;
            for (let x = 0; x < width; x++) {
                const tile = row[x];
                if (tile && tile.enemyId) {
                    newCache.set(tile.enemyId, { x, y });
                }
            }
        }
        enemyPositionsCacheRef.current = newCache;
        lastCachedGridRef.current = grid;
        return newCache;
    }, []);

    // --- INITIALIZATION: Pre-calculate paths on level load ---
    useEffect(() => {
        const curEnemies = enemiesStateRef?.current || enemies;
        if (!levelData || !aiEnabled || !curEnemies || curEnemies.size === 0) return;

        const needsInit = Array.from(curEnemies.values()).some((e: Enemy) => !e.targetPos && !e.currentPath && e.movementType !== 'patroling');
        // Only run if we detect fresh enemies without plans (and we are not in combat)
        if (!needsInit || isCombatActive) return;

        const updates = new Map<string, Partial<Enemy>>();
        const grid = levelData.grid;
        const width = levelData.width;
        const height = levelData.height;

        const enemyPositionsOnLoad = getEnemyPositions(grid, width, height);

        curEnemies.forEach((e) => {
            if (activeCombatEnemyIds.has(e.id) || e.isNPC) return;
            // Find position
            const pos = enemyPositionsOnLoad.get(e.id);
            if (!pos) return;
            const ex = pos.x;
            const ey = pos.y;

            let target = null;
            if (e.movementType === 'roaming') {
                target = getRoamingTarget(grid, width, height);
            } else {
                const hx = e.homePos?.x ?? ex;
                const hy = e.homePos?.y ?? ey;
                const range = e.patrolRange || 3;
                target = getPatrolTarget(hx, hy, range, grid, width, height);
            }

            if (target) {
                const path = findPath(ex, ey, target.x, target.y, grid, width, height, new Set(), {x: player.pos.x, y: player.pos.y}, undefined, e.canOpenDoors);
                if (path.length > 0) {
                    updates.set(e.id, { targetPos: target, currentPath: path, aiState: 'PATROL' });
                }
            }
        });

        if (updates.size > 0) {
            setEnemies(prev => {
                const next = new Map(prev);
                updates.forEach((u, id) => {
                    const e = next.get(id);
                    if (e) next.set(id, Object.assign({}, e, u));
                });
                return next;
            });
        }

    }, [levelData?.name]); 

    // MODIFIED: Accepts gridOverride to handle race conditions where state hasn't updated yet (e.g. Door Opening)
    const triggerRoamingTurn = useCallback((playerPosOverride?: {x: number, y: number}, gridOverride?: Tile[][]) => {
        const curEnemies = enemiesStateRef?.current || enemies;
        if (!levelData || !aiEnabled || curEnemies.size === 0) return undefined;

        const targetPlayerPos = playerPosOverride || player.pos;
        const prevLevel = levelData;
        const width = prevLevel.width;
        const height = prevLevel.height;
        
        // USE OVERRIDE GRID IF PROVIDED, OTHERWISE CURRENT STATE
        const sourceGrid = gridOverride || prevLevel.grid;

        // OPTIMIZATION: Shallow copy grid. We will clone rows internally only if they change.
        // This avoids deep cloning the entire Map every time any AI considers moving, 
        // which prevents massive Garbage Collection spikes and lag.
        const newGrid = [...sourceGrid];
        const updateTile = (yLoc: number, xLoc: number, mutator: (t: Tile) => void) => {
            if (newGrid[yLoc] === sourceGrid[yLoc]) {
                 newGrid[yLoc] = [...sourceGrid[yLoc]];
            }
            if (newGrid[yLoc][xLoc] === sourceGrid[yLoc][xLoc]) {
                 newGrid[yLoc][xLoc] = { ...sourceGrid[yLoc][xLoc] };
            }
            const oldEnemyId = newGrid[yLoc][xLoc].enemyId;
            mutator(newGrid[yLoc][xLoc]);
            const newEnemyId = newGrid[yLoc][xLoc].enemyId;
            if (oldEnemyId !== newEnemyId) {
                const cache = enemyPositionsCacheRef.current;
                const globalCache = typeof window !== 'undefined' ? (window as any).enemyPositionsCache : null;
                if (oldEnemyId) {
                    const cached = cache.get(oldEnemyId);
                    if (cached && cached.x === xLoc && cached.y === yLoc) {
                        cache.delete(oldEnemyId);
                    }
                    if (globalCache) {
                        const gcached = globalCache.get(oldEnemyId);
                        if (gcached && gcached.x === xLoc && gcached.y === yLoc) {
                            globalCache.delete(oldEnemyId);
                        }
                    }
                }
                if (newEnemyId) {
                    cache.set(newEnemyId, { x: xLoc, y: yLoc });
                    if (globalCache) {
                        globalCache.set(newEnemyId, { x: xLoc, y: yLoc });
                    }
                }
            }
        };
        
        const newAnims: RoamingEnemyAnim[] = [];
        const now = performance.now();
        const newCombatants: string[] = [];
        
        // --- RESERVATION SYSTEM ---
        const reservedTiles = new Set<string>();
        reservedTiles.add(`${Math.round(targetPlayerPos.x)},${Math.round(targetPlayerPos.y)}`);
        
        const activeEnemies: {id: string, x: number, y: number}[] = [];
        const allEnemies: {id: string, x: number, y: number}[] = []; // NEW: Track ALL enemies for occlusion checks
        const activeNPCs: {npc: Enemy, x: number, y: number}[] = []; // NEW: Track NPCs for roaming
        
        // OPTIMIZATION: Use cached enemy positions instead of scanning the full grid on every step
        const cachedPositions = getEnemyPositions(sourceGrid, width, height);
        cachedPositions.forEach((pos, eid) => {
            const tile = sourceGrid[pos.y]?.[pos.x];
            if (tile && tile.enemyId === eid) {
                const enemyPos = { id: eid, x: pos.x, y: pos.y };
                allEnemies.push(enemyPos);
                reservedTiles.add(`${pos.x},${pos.y}`);

                const enemy = enemies.get(eid);
                if (!activeCombatEnemyIds.has(eid)) {
                    if (enemy && (enemy.isNPC || enemy.aiState === 'NPC_FOLLOW')) {
                        activeNPCs.push({ npc: enemy, x: pos.x, y: pos.y });
                    } else {
                        activeEnemies.push(enemyPos);
                    }
                }
            } else {
                // Invalidate stale cache
                lastCachedGridRef.current = null;
            }
        });

        // Shuffle to prevent movement bias order
        for (let i = activeEnemies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [activeEnemies[i], activeEnemies[j]] = [activeEnemies[j], activeEnemies[i]];
        }

        const enemyStateUpdates = new Map<string, Partial<Enemy>>();

        let hasGridChanges = false;
        
        // Load Balancing Budget: Max 15 A* pathfinding calculations per turn.
        // If exceeded, remaining enemies will use fallback/local avoidance or wait.
        const pathfindingBudget = { count: 15 };

        // PROCESS EACH ENEMY
        const entityStates = [
            ...activeEnemies.map(pos => ({ ...pos, type: 'enemy' as const, entity: enemies.get(pos.id)! })),
            ...activeNPCs.map(data => ({ id: data.npc.id, x: data.x, y: data.y, type: 'npc' as const, entity: data.npc }))
        ];

        const mutableStates = entityStates.map(e => ({
            ...e,
            currentX: e.x,
            currentY: e.y,
            startX: e.x,
            startY: e.y,
            finished: false,
            speed: e.entity.speed ?? 1,
        }));

        const maxSpeed = Math.max(1, ...mutableStates.map(s => s.speed));

        for (let action = 0; action < maxSpeed; action++) {
            for (let i = mutableStates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [mutableStates[i], mutableStates[j]] = [mutableStates[j], mutableStates[i]];
            }

            mutableStates.forEach(state => {
                if (state.finished || action >= state.speed) return;

                const enemyId = state.id;
                let currentX = state.currentX;
                let currentY = state.currentY;
                const enemy = state.entity;

                const updateEnemyState = (updates: Partial<Enemy>) => {
                    const current = enemyStateUpdates.get(enemyId) || {};
                    const next = Object.assign({}, current, updates);
                    enemyStateUpdates.set(enemyId, next);
                };

                const pendingUpdates = enemyStateUpdates.get(enemyId) || {};
                const currentState = pendingUpdates.aiState || enemy.aiState;

                if (currentState === 'SCRIPT_MOVE') {
                    const currentKey = `${currentX},${currentY}`;
                    reservedTiles.delete(currentKey);

                    const targetPos = pendingUpdates.targetPos || enemy.targetPos;
                    let currentPath = pendingUpdates.currentPath !== undefined ? pendingUpdates.currentPath : enemy.currentPath;

                    if (currentX === targetPos?.x && currentY === targetPos?.y) {
                        updateEnemyState({
                            aiState: enemy.originalAiState || (enemy.isNPC ? 'PATROL' : 'IDLE'),
                            movementType: enemy.originalMovementType || (enemy.isNPC ? 'patroling' : 'roaming'),
                            homePos: { x: currentX, y: currentY },
                            patrolRange: (enemy.patrolRange && enemy.patrolRange > 0) ? enemy.patrolRange : 3,
                            targetPos: undefined,
                            currentPath: undefined,
                            originalAiState: undefined,
                            originalMovementType: undefined,
                            originalHomePos: undefined,
                        });
                        reservedTiles.add(currentKey);
                        state.finished = true;
                        return;
                    }

                    // Check if path is empty OR if the next step is blocked by an obstacle (player, entity, closed door)
                    let pathNeedsRecalc = !currentPath || currentPath.length === 0;

                    if (!pathNeedsRecalc && currentPath && currentPath.length > 0) {
                        const nextStep = currentPath[0];
                        const nextKey = `${nextStep.x},${nextStep.y}`;
                        const isReserved = reservedTiles.has(nextKey);
                        const tile = newGrid[nextStep.y]?.[nextStep.x];
                        const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                        const isBlockedByPlayer = Math.round(targetPlayerPos.x) === nextStep.x && Math.round(targetPlayerPos.y) === nextStep.y;
                        const canOpenThisDoor = tile && tile.type === 'DOOR' && (tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING') && 
                                               enemy.canOpenDoors && tile && tile.door && 
                                               !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                               tile.door.state !== 'OPENING';

                        if (isReserved || isBlockedByPlayer || (isBlockedByDoor && !canOpenThisDoor)) {
                            pathNeedsRecalc = true;
                        }
                    }

                    if (pathNeedsRecalc && targetPos) {
                        const newPath = findPath(
                            currentX, currentY,
                            targetPos.x, targetPos.y,
                            sourceGrid, width, height,
                            reservedTiles,
                            { x: targetPlayerPos.x, y: targetPlayerPos.y },
                            pathfindingBudget,
                            enemy.canOpenDoors
                        );

                        if (newPath && newPath.length > 0) {
                            currentPath = newPath;
                            updateEnemyState({ currentPath: newPath });
                        } else {
                            currentPath = [];
                            updateEnemyState({ currentPath: [] });
                        }
                    }

                    let nextX = currentX;
                    let nextY = currentY;
                    let stepMoved = false;

                    if (currentPath && currentPath.length > 0) {
                        const nextStep = currentPath[0];
                        const nextKey = `${nextStep.x},${nextStep.y}`;
                        const isReserved = reservedTiles.has(nextKey);
                        const tile = newGrid[nextStep.y]?.[nextStep.x];
                        const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                        const isBlockedByPlayer = Math.round(targetPlayerPos.x) === nextStep.x && Math.round(targetPlayerPos.y) === nextStep.y;
                        const canOpenThisDoor = tile && tile.type === 'DOOR' && (tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING') && 
                                               enemy.canOpenDoors && tile && tile.door && 
                                               !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                               tile.door.state !== 'OPENING';

                        if (!isReserved && !isBlockedByDoor && !isBlockedByPlayer) {
                            updateTile(currentY, currentX, t => t.enemyId = undefined);
                            updateTile(nextStep.y, nextStep.x, t => t.enemyId = enemyId);
                            hasGridChanges = true;
                            reservedTiles.add(nextKey);

                            const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                            if (enemyIdx !== -1) {
                                allEnemies[enemyIdx].x = nextStep.x;
                                allEnemies[enemyIdx].y = nextStep.y;
                            }

                            stepMoved = true;
                            nextX = nextStep.x;
                            nextY = nextStep.y;
                            updateEnemyState({ currentPath: currentPath.slice(1) });
                        } else if (canOpenThisDoor) {
                            updateTile(nextStep.y, nextStep.x, t => {
                                if (t.door) {
                                    t.door.state = 'OPENING';
                                    t.door.progress = 0;
                                    t.door.lastUpdate = Date.now();
                                }
                            });
                            hasGridChanges = true;
                            reservedTiles.add(currentKey);
                            if (playSound) playSound(tile.door?.openSound || 'DOOR_OPEN', { x: nextStep.x, y: nextStep.y });
                            
                            updateEnemyState({ currentPath: [], blockedTurns: 0 });
                            state.currentX = currentX;
                            state.currentY = currentY;
                            state.finished = true;
                            return;
                        }
                    }

                    // Smart Local Avoidance Fallback:
                    // If blocked in narrow bottleneck and no full path around, try adjacent unreserved neighbor towards targetPos
                    if (!stepMoved && targetPos) {
                        const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                        for (let i = dirs.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                        }

                        let bestNeighbor: {x: number, y: number} | null = null;
                        let minDistToTarget = Math.abs(currentX - targetPos.x) + Math.abs(currentY - targetPos.y);

                        for (const d of dirs) {
                            const nx = currentX + d.dx;
                            const ny = currentY + d.dy;
                            const nKey = `${nx},${ny}`;
                            
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !reservedTiles.has(nKey) && (nx !== Math.round(targetPlayerPos.x) || ny !== Math.round(targetPlayerPos.y))) {
                                const nTile = sourceGrid[ny]?.[nx];
                                if (nTile && nTile.type !== 'WALL' && !(nTile.type === 'DOOR' && nTile.door?.state !== 'OPEN') && !(nTile.decoration && nTile.decoration.blocking) && !(nTile.items && nTile.items.some((i: any) => i.blocking)) && !newGrid[ny]?.[nx]?.enemyId) {
                                    const dist = Math.abs(nx - targetPos.x) + Math.abs(ny - targetPos.y);
                                    if (dist < minDistToTarget) {
                                        minDistToTarget = dist;
                                        bestNeighbor = { x: nx, y: ny };
                                    }
                                }
                            }
                        }

                        if (bestNeighbor) {
                            const nextKey = `${bestNeighbor.x},${bestNeighbor.y}`;
                            updateTile(currentY, currentX, t => t.enemyId = undefined);
                            updateTile(bestNeighbor.y, bestNeighbor.x, t => t.enemyId = enemyId);
                            hasGridChanges = true;
                            reservedTiles.add(nextKey);

                            const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                            if (enemyIdx !== -1) {
                                allEnemies[enemyIdx].x = bestNeighbor.x;
                                allEnemies[enemyIdx].y = bestNeighbor.y;
                            }

                            stepMoved = true;
                            nextX = bestNeighbor.x;
                            nextY = bestNeighbor.y;
                            updateEnemyState({ currentPath: [] });
                        } else {
                            reservedTiles.add(currentKey);
                        }
                    }

                    if (stepMoved) {
                        if (onEnemyStep) onEnemyStep(enemyId, nextX, nextY, action, state.speed);
                        if (Math.abs(currentX - targetPlayerPos.x) < 20 && Math.abs(currentY - targetPlayerPos.y) < 20) {
                            const stepDuration = 300 / state.speed;
                            newAnims.push({
                                id: enemyId,
                                startX: currentX, startY: currentY,
                                endX: nextX, endY: nextY,
                                startTime: now + (action * stepDuration),
                                duration: stepDuration
                            });
                        }
                    }

                    state.currentX = nextX;
                    state.currentY = nextY;

                    if (nextX === targetPos?.x && nextY === targetPos?.y) {
                        updateEnemyState({
                            aiState: enemy.originalAiState || (enemy.isNPC ? 'IDLE' : 'IDLE'),
                            movementType: enemy.originalMovementType || (enemy.isNPC ? 'patroling' : 'roaming'),
                            homePos: enemy.originalHomePos || enemy.homePos,
                            targetPos: undefined,
                            currentPath: undefined,
                            originalAiState: undefined,
                            originalMovementType: undefined,
                            originalHomePos: undefined,
                        });
                    }

                    state.finished = true;
                    return;
                }

                if (currentState === 'NPC_FOLLOW') {
                    const currentKey = `${currentX},${currentY}`;
                    reservedTiles.delete(currentKey);

                    const mode = pendingUpdates.followMode || enemy.followMode || 'NPC_FOLLOWS_PLAYER';
                    const targetPos = pendingUpdates.targetPos || enemy.targetPos;
                    let currentPath = pendingUpdates.currentPath !== undefined ? pendingUpdates.currentPath : enemy.currentPath;

                    if (mode === 'STOP') {
                        updateEnemyState({
                            aiState: enemy.originalAiState || (enemy.isNPC ? 'PATROL' : 'IDLE'),
                            movementType: enemy.originalMovementType || (enemy.isNPC ? 'patroling' : 'roaming'),
                            homePos: { x: currentX, y: currentY },
                            patrolRange: (enemy.patrolRange && enemy.patrolRange > 0) ? enemy.patrolRange : 3,
                            targetPos: undefined,
                            currentPath: undefined,
                            followMode: undefined,
                            followMaxDistance: undefined,
                            originalAiState: undefined,
                            originalMovementType: undefined,
                            originalHomePos: undefined,
                        });
                        reservedTiles.add(currentKey);
                        state.finished = true;
                        return;
                    }

                    const playerX = Math.round(targetPlayerPos.x);
                    const playerY = Math.round(targetPlayerPos.y);

                    if (mode === 'NPC_FOLLOWS_PLAYER') {
                        const dx = playerX - currentX;
                        const dy = playerY - currentY;
                        const distSqToPlayer = dx * dx + dy * dy;

                        // If already adjacent to or on player tile (distSq <= 2), stay in place
                        if (distSqToPlayer <= 2) {
                            reservedTiles.add(currentKey);
                            state.finished = true;
                            return;
                        }

                        // Refresh path if empty, destination not near player, OR next step is blocked
                        const lastStep = currentPath && currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
                        let pathNeedsRefresh = !currentPath || currentPath.length === 0 || (lastStep && ((lastStep.x - playerX)**2 + (lastStep.y - playerY)**2 > 2));

                        if (!pathNeedsRefresh && currentPath && currentPath.length > 0) {
                            const nextStep = currentPath[0];
                            const nextKey = `${nextStep.x},${nextStep.y}`;
                            if (reservedTiles.has(nextKey) || (playerX === nextStep.x && playerY === nextStep.y)) {
                                pathNeedsRefresh = true;
                            }
                        }

                        if (pathNeedsRefresh) {
                            currentPath = findPath(currentX, currentY, playerX, playerY, sourceGrid, width, height, reservedTiles, { x: playerX, y: playerY }, pathfindingBudget, enemy.canOpenDoors);
                            if (currentPath && currentPath.length > 0) {
                                if (currentPath[currentPath.length - 1].x === playerX && currentPath[currentPath.length - 1].y === playerY) {
                                    currentPath = currentPath.slice(0, currentPath.length - 1);
                                }
                                updateEnemyState({ currentPath });
                            }
                        }
                    } else if (mode === 'PLAYER_FOLLOWS_NPC') {
                        if (targetPos && currentX === targetPos.x && currentY === targetPos.y) {
                            updateEnemyState({
                                aiState: enemy.originalAiState || (enemy.isNPC ? 'PATROL' : 'IDLE'),
                                movementType: enemy.originalMovementType || (enemy.isNPC ? 'patroling' : 'roaming'),
                                homePos: { x: currentX, y: currentY },
                                patrolRange: (enemy.patrolRange && enemy.patrolRange > 0) ? enemy.patrolRange : 3,
                                targetPos: undefined,
                                currentPath: undefined,
                                followMode: undefined,
                                followMaxDistance: undefined,
                                originalAiState: undefined,
                                originalMovementType: undefined,
                                originalHomePos: undefined,
                            });
                            reservedTiles.add(currentKey);
                            state.finished = true;
                            return;
                        }

                        const distSqToPlayer = (currentX - playerX)**2 + (currentY - playerY)**2;
                        const maxDist = pendingUpdates.followMaxDistance || enemy.followMaxDistance || 4;

                        // If player is too far away, NPC waits
                        if (distSqToPlayer > maxDist * maxDist) {
                            reservedTiles.add(currentKey);
                            state.finished = true;
                            return;
                        }

                        let pathNeedsRefresh = !currentPath || currentPath.length === 0;
                        if (!pathNeedsRefresh && currentPath && currentPath.length > 0) {
                            const nextStep = currentPath[0];
                            const nextKey = `${nextStep.x},${nextStep.y}`;
                            if (reservedTiles.has(nextKey) || (playerX === nextStep.x && playerY === nextStep.y)) {
                                pathNeedsRefresh = true;
                            }
                        }

                        if (pathNeedsRefresh && targetPos) {
                            currentPath = findPath(currentX, currentY, targetPos.x, targetPos.y, sourceGrid, width, height, reservedTiles, { x: playerX, y: playerY }, pathfindingBudget, enemy.canOpenDoors);
                            if (currentPath && currentPath.length > 0) {
                                updateEnemyState({ currentPath });
                            }
                        }
                    }

                    let nextX = currentX;
                    let nextY = currentY;
                    let stepMoved = false;

                    if (currentPath && currentPath.length > 0) {
                        const nextStep = currentPath[0];
                        const nextKey = `${nextStep.x},${nextStep.y}`;
                        const isReserved = reservedTiles.has(nextKey);
                        const tile = newGrid[nextStep.y]?.[nextStep.x];
                        const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                        const isBlockedByPlayer = playerX === nextStep.x && playerY === nextStep.y;
                        const canOpenThisDoor = tile && tile.type === 'DOOR' && (tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING') && 
                                               enemy.canOpenDoors && tile && tile.door && 
                                               !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                               tile.door.state !== 'OPENING';

                        if (!isReserved && !isBlockedByDoor && !isBlockedByPlayer) {
                            updateTile(currentY, currentX, t => t.enemyId = undefined);
                            updateTile(nextStep.y, nextStep.x, t => t.enemyId = enemyId);
                            hasGridChanges = true;
                            reservedTiles.add(nextKey);

                            const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                            if (enemyIdx !== -1) {
                                allEnemies[enemyIdx].x = nextStep.x;
                                allEnemies[enemyIdx].y = nextStep.y;
                            }

                            stepMoved = true;
                            nextX = nextStep.x;
                            nextY = nextStep.y;
                            updateEnemyState({ currentPath: currentPath.slice(1) });
                        } else if (canOpenThisDoor) {
                            updateTile(nextStep.y, nextStep.x, t => {
                                if (t.door) {
                                    t.door.state = 'OPENING';
                                    t.door.progress = 0;
                                    t.door.lastUpdate = Date.now();
                                }
                            });
                            hasGridChanges = true;
                            reservedTiles.add(currentKey);
                            if (playSound) playSound(tile.door?.openSound || 'DOOR_OPEN', { x: nextStep.x, y: nextStep.y });
                            
                            updateEnemyState({ currentPath: [], blockedTurns: 0 });
                            state.currentX = currentX;
                            state.currentY = currentY;
                            state.finished = true;
                            return;
                        }
                    }

                    // Local avoidance for NPC_FOLLOW if next step blocked
                    if (!stepMoved) {
                        const followTarget = mode === 'NPC_FOLLOWS_PLAYER' ? { x: playerX, y: playerY } : targetPos;
                        if (followTarget) {
                            const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                            for (let i = dirs.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                            }

                            let bestNeighbor: {x: number, y: number} | null = null;
                            let minDistToTarget = Math.abs(currentX - followTarget.x) + Math.abs(currentY - followTarget.y);

                            for (const d of dirs) {
                                const nx = currentX + d.dx;
                                const ny = currentY + d.dy;
                                const nKey = `${nx},${ny}`;
                                
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height && !reservedTiles.has(nKey) && (nx !== playerX || ny !== playerY)) {
                                    const nTile = sourceGrid[ny]?.[nx];
                                    if (nTile && nTile.type !== 'WALL' && !(nTile.type === 'DOOR' && nTile.door?.state !== 'OPEN') && !(nTile.decoration && nTile.decoration.blocking) && !(nTile.items && nTile.items.some((i: any) => i.blocking)) && !newGrid[ny]?.[nx]?.enemyId) {
                                        const dist = Math.abs(nx - followTarget.x) + Math.abs(ny - followTarget.y);
                                        if (dist < minDistToTarget) {
                                            minDistToTarget = dist;
                                            bestNeighbor = { x: nx, y: ny };
                                        }
                                    }
                                }
                            }

                            if (bestNeighbor) {
                                const nextKey = `${bestNeighbor.x},${bestNeighbor.y}`;
                                updateTile(currentY, currentX, t => t.enemyId = undefined);
                                updateTile(bestNeighbor.y, bestNeighbor.x, t => t.enemyId = enemyId);
                                hasGridChanges = true;
                                reservedTiles.add(nextKey);

                                const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                if (enemyIdx !== -1) {
                                    allEnemies[enemyIdx].x = bestNeighbor.x;
                                    allEnemies[enemyIdx].y = bestNeighbor.y;
                                }

                                stepMoved = true;
                                nextX = bestNeighbor.x;
                                nextY = bestNeighbor.y;
                                updateEnemyState({ currentPath: [] });
                            } else {
                                reservedTiles.add(currentKey);
                            }
                        } else {
                            reservedTiles.add(currentKey);
                        }
                    }

                    if (stepMoved) {
                        if (onEnemyStep) onEnemyStep(enemyId, nextX, nextY, action, state.speed);
                        if (Math.abs(currentX - targetPlayerPos.x) < 20 && Math.abs(currentY - targetPlayerPos.y) < 20) {
                            const stepDuration = 300 / state.speed;
                            newAnims.push({
                                id: enemyId,
                                startX: currentX, startY: currentY,
                                endX: nextX, endY: nextY,
                                startTime: now + (action * stepDuration),
                                duration: stepDuration
                            });
                        }
                    } else {
                        reservedTiles.add(currentKey);
                    }

                    state.currentX = nextX;
                    state.currentY = nextY;

                    if (mode === 'PLAYER_FOLLOWS_NPC' && targetPos && nextX === targetPos.x && nextY === targetPos.y) {
                        updateEnemyState({
                            aiState: enemy.originalAiState || 'IDLE',
                            movementType: enemy.originalMovementType || (enemy.isNPC ? 'patroling' : 'roaming'),
                            homePos: enemy.originalHomePos || enemy.homePos,
                            targetPos: undefined,
                            currentPath: undefined,
                            followMode: undefined,
                            followMaxDistance: undefined,
                            originalAiState: undefined,
                            originalMovementType: undefined,
                            originalHomePos: undefined,
                        });
                    }

                    state.finished = true;
                    return;
                }

                if (state.type === 'enemy') {
                    if (action === 0) {
                        const currentFlashDur = enemy.flashDuration || 0;
                        if (currentFlashDur > 0) {
                            const newFlash = currentFlashDur - 1;
                            const newAiState = (newFlash === 0 && enemy.aiState === 'FLASHED') ? 'IDLE' : enemy.aiState;
                            updateEnemyState({ flashDuration: newFlash, aiState: newAiState });
                        }
                    }

                    const currentKey = `${currentX},${currentY}`;
                    reservedTiles.delete(currentKey);

                    const distSq = (currentX - targetPlayerPos.x)**2 + (currentY - targetPlayerPos.y)**2;

                    let nextX = currentX;
                    let nextY = currentY;
                    let stepMoved = false;

                    const isFlashedByDuration = (enemyStateUpdates.get(enemyId)?.flashDuration || 0) > 0;
                    const isFlashedByState = (enemyStateUpdates.get(enemyId)?.aiState || enemy.aiState) === 'FLASHED';

                    if (isFlashedByDuration || isFlashedByState) {
                        if (!isFlashedByDuration) {
                            const recoveredState = enemy.originalAiState || 'IDLE';
                            updateEnemyState({ aiState: recoveredState, flashDuration: 0 });
                        } else {
                            const isVisibleNow = hasLineOfSight({x: currentX, y: currentY}, targetPlayerPos, sourceGrid, width, height, enemyId, false);
                            if ((isCombatActive || newCombatants.length > 0) && isVisibleNow) {
                                if (!newCombatants.includes(enemyId)) {
                                    newCombatants.push(enemyId);
                                    updateEnemyState({ aiState: 'COMBAT' });
                                }
                            }

                            const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                            const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
                            const nx = currentX + randomDir.dx;
                            const ny = currentY + randomDir.dy;
                            const nextKey = `${nx},${ny}`;
                            
                            if (!reservedTiles.has(nextKey) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const tile = sourceGrid[ny][nx];
                                if (tile.type !== 'WALL' && !(tile.type === 'DOOR' && tile.door?.state !== 'OPEN') && !(tile.decoration && tile.decoration.blocking) && !(tile.items && tile.items.some((i: any) => i.blocking)) && !tile.enemyId && (nx !== targetPlayerPos.x || ny !== targetPlayerPos.y)) {
                                    updateTile(currentY, currentX, t => t.enemyId = undefined);
                                    updateTile(ny, nx, t => t.enemyId = enemyId);
                                    hasGridChanges = true;
                                    reservedTiles.add(nextKey);
                                    const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                    if (enemyIdx !== -1) { allEnemies[enemyIdx].x = nx; allEnemies[enemyIdx].y = ny; }
                                    stepMoved = true;
                                    nextX = nx;
                                    nextY = ny;
                                } else {
                                    reservedTiles.add(currentKey);
                                }
                            } else {
                                reservedTiles.add(currentKey);
                            }
                            
                            if (stepMoved) {
                                const isVisibleAfter = hasLineOfSight({x: nextX, y: nextY}, targetPlayerPos, newGrid, width, height, enemyId, false);
                                if ((isCombatActive || newCombatants.length > 0) && isVisibleAfter) {
                                    if (!newCombatants.includes(enemyId)) {
                                        newCombatants.push(enemyId);
                                        updateEnemyState({ aiState: 'COMBAT' });
                                    }
                                }
                            }

                            state.currentX = nextX;
                            state.currentY = nextY;
                            state.finished = true;
                            
                            if (stepMoved) {
                                if (onEnemyStep) onEnemyStep(enemyId, nextX, nextY, action, state.speed);
                                const stepDuration = 300 / state.speed;
                                newAnims.push({
                                    id: enemyId, startX: currentX, startY: currentY, endX: nextX, endY: nextY,
                                    startTime: now + (action * stepDuration), duration: stepDuration
                                });
                            }
                            return;
                        }
                    }

                    if (distSq > 400 && !activeCombatEnemyIds.has(enemyId)) {
                        if (Math.random() > 0.5) {
                            const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                            const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
                            const nx = currentX + randomDir.dx;
                            const ny = currentY + randomDir.dy;
                            const nextKey = `${nx},${ny}`;

                            if (!reservedTiles.has(nextKey) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const tile = sourceGrid[ny][nx];
                                if (tile.type !== 'WALL' && !(tile.type === 'DOOR' && tile.door?.state !== 'OPEN') && !(tile.decoration && tile.decoration.blocking) && !(tile.items && tile.items.some((i: any) => i.blocking))) {
                                    updateTile(currentY, currentX, t => t.enemyId = undefined);
                                    updateTile(ny, nx, t => t.enemyId = enemyId);
                                    hasGridChanges = true;
                                    reservedTiles.add(nextKey);
                                    
                                    const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                    if (enemyIdx !== -1) {
                                        allEnemies[enemyIdx].x = nx;
                                        allEnemies[enemyIdx].y = ny;
                                    }
                                    state.currentX = nx;
                                    state.currentY = ny;
                                    state.finished = true;
                                    if (onEnemyStep) onEnemyStep(enemyId, nx, ny, action, state.speed);
                                    const stepDuration = 300 / state.speed;
                                    newAnims.push({
                                        id: enemyId, startX: currentX, startY: currentY, endX: nx, endY: ny,
                                        startTime: now + (action * stepDuration), duration: stepDuration
                                    });
                                    return;
                                }
                            }
                        }
                        reservedTiles.add(currentKey);
                        state.finished = true;
                        return;
                    }

                    const isVisible = hasLineOfSight({x: currentX, y: currentY}, targetPlayerPos, sourceGrid, width, height, enemyId, false);
                    const rawRange = enemy.attackRange !== undefined ? enemy.attackRange : 1;
                    const effectiveAttackRange = rawRange > 1 ? rawRange : (rawRange > 0 ? rawRange + 0.5 : 0);
                    const distToPlayer = Math.sqrt(distSq);
                    
                    const pendingUpdates = enemyStateUpdates.get(enemyId) || {};
                    let currentState = pendingUpdates.aiState || enemy.aiState;

                    if (isVisible) {
                        if (isCombatActive || newCombatants.length > 0) {
                            if (!newCombatants.includes(enemyId)) newCombatants.push(enemyId);
                            reservedTiles.add(currentKey); 
                            updateEnemyState({ aiState: 'COMBAT' });
                            state.finished = true; return;
                        }

                        const isAdjacentAndVisible = distToPlayer <= 1.5 && rawRange > 0;
                        const canAttackNow = isAdjacentAndVisible || (isValidCombatPosition({x: currentX, y: currentY}, targetPlayerPos, sourceGrid, width, height, enemyId, rawRange, allEnemies) && 
                                             (distToPlayer <= effectiveAttackRange));
                        
                        if (canAttackNow) {
                            newCombatants.push(enemyId);
                            reservedTiles.add(currentKey); 
                            updateEnemyState({ aiState: 'COMBAT' });
                            state.finished = true; return;
                        } 
                    }

                    if (isVisible) {
                        const targetPos = { x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y) };
                        const storedTarget = pendingUpdates.targetPos || enemy.targetPos;
                        const isTargetChanged = !storedTarget || storedTarget.x !== targetPos.x || storedTarget.y !== targetPos.y;

                        if (currentState !== 'CHASE') {
                            currentState = 'CHASE';
                            const newPath = findPath(currentX, currentY, targetPos.x, targetPos.y, sourceGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget, enemy.canOpenDoors);
                            updateEnemyState({ aiState: 'CHASE', currentPath: newPath, targetPos, blockedTurns: 0 });
                        } else if (isTargetChanged) {
                            const newPath = findPath(currentX, currentY, targetPos.x, targetPos.y, sourceGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget, enemy.canOpenDoors);
                            updateEnemyState({ currentPath: newPath, targetPos, blockedTurns: 0 });
                        }
                    } else {
                        if (currentState === 'CHASE') {
                            const targetPos = pendingUpdates.targetPos || enemy.targetPos || { x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y) };
                            if (currentX === targetPos.x && currentY === targetPos.y) {
                                currentState = 'INVESTIGATE';
                                updateEnemyState({ aiState: 'INVESTIGATE', currentPath: [], targetPos, blockedTurns: 0, investigateTurns: 0 });
                            }
                        }
                    }

                    if (currentState === 'CHASE') {
                        let currentPath = pendingUpdates.currentPath !== undefined ? pendingUpdates.currentPath : enemy.currentPath;
                        let blockedTurns = pendingUpdates.blockedTurns ?? enemy.blockedTurns ?? 0;

                        if (!currentPath || currentPath.length === 0) {
                            if (isVisible) {
                                if (blockedTurns > 0) {
                                    blockedTurns--;
                                    updateEnemyState({ blockedTurns });
                                } else {
                                    const newPath = findPath(currentX, currentY, Math.round(targetPlayerPos.x), Math.round(targetPlayerPos.y), sourceGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget, enemy.canOpenDoors);
                                    currentPath = newPath;
                                    if (newPath.length > 0) {
                                        updateEnemyState({ currentPath: newPath, targetPos: {x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y)}, blockedTurns: 0 });
                                    } else {
                                        updateEnemyState({ currentPath: [], blockedTurns: 3 });
                                    }
                                }
                            } else {
                                const targetPos = pendingUpdates.targetPos || enemy.targetPos || { x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y) };
                                const newPath = findPath(currentX, currentY, targetPos.x, targetPos.y, sourceGrid, width, height, reservedTiles, undefined, pathfindingBudget, enemy.canOpenDoors);
                                if (newPath.length > 0) {
                                    currentPath = newPath;
                                    updateEnemyState({ currentPath: newPath, blockedTurns: 0 });
                                } else {
                                    currentState = 'INVESTIGATE';
                                    updateEnemyState({ aiState: 'INVESTIGATE', currentPath: [], blockedTurns: 0, investigateTurns: 0 });
                                    reservedTiles.add(currentKey);
                                    state.finished = true; return;
                                }
                            }
                        }

                        if (currentPath && currentPath.length > 0) {
                            const nextStep = currentPath[0];
                            const nextKey = `${nextStep.x},${nextStep.y}`;
                            
                            const isBlockedByPlayer = Math.round(targetPlayerPos.x) === nextStep.x && Math.round(targetPlayerPos.y) === nextStep.y;
                            const isReserved = reservedTiles.has(nextKey);
                            const tile = newGrid[nextStep.y]?.[nextStep.x];
                            const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                            const canOpenThisDoor = tile && tile.type === 'DOOR' && (tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING') && 
                                                   enemy.canOpenDoors && tile && tile.door && 
                                                   !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                                   tile.door.state !== 'OPENING';

                            if (!isBlockedByPlayer && !isReserved && !isBlockedByDoor) {
                                updateTile(currentY, currentX, t => t.enemyId = undefined);
                                updateTile(nextStep.y, nextStep.x, t => t.enemyId = enemyId);
                                hasGridChanges = true;
                                reservedTiles.add(nextKey);
                                
                                const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                if (enemyIdx !== -1) {
                                    allEnemies[enemyIdx].x = nextStep.x;
                                    allEnemies[enemyIdx].y = nextStep.y;
                                }

                                stepMoved = true;
                                nextX = nextStep.x;
                                nextY = nextStep.y;

                                updateEnemyState({ currentPath: currentPath.slice(1), blockedTurns: 0 });
                            } else if (canOpenThisDoor) {
                                updateTile(nextStep.y, nextStep.x, t => {
                                    if (t.door) {
                                        t.door.state = 'OPENING';
                                        t.door.progress = 0;
                                        t.door.lastUpdate = Date.now();
                                    }
                                });
                                hasGridChanges = true;
                                reservedTiles.add(currentKey);
                                if (playSound) playSound(tile.door?.openSound || 'DOOR_OPEN', { x: nextStep.x, y: nextStep.y });
                                
                                updateEnemyState({ currentPath: [], blockedTurns: 0 });
                                state.currentX = currentX;
                                state.currentY = currentY;
                                state.finished = true;
                                return;
                            } else {
                                blockedTurns++;
                                let rebuilt = false;
                                
                                if (blockedTurns >= 3) {
                                    if (isVisible) {
                                        const newPath = findPath(currentX, currentY, Math.round(targetPlayerPos.x), Math.round(targetPlayerPos.y), sourceGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget, enemy.canOpenDoors);
                                        updateEnemyState({ currentPath: newPath, targetPos: {x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y)}, blockedTurns: 0 });
                                        rebuilt = true;
                                        blockedTurns = 0;
                                    } else {
                                        currentState = 'INVESTIGATE';
                                        updateEnemyState({ aiState: 'INVESTIGATE', currentPath: [], blockedTurns: 0, investigateTurns: 0 });
                                        rebuilt = true;
                                    }
                                } else {
                                    updateEnemyState({ blockedTurns });
                                }

                                if (!rebuilt && currentState === 'CHASE') {
                                    const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                                    for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
                                    
                                    let evaded = false;
                                    for (const d of dirs) {
                                        const nx = currentX + d.dx;
                                        const ny = currentY + d.dy;
                                        const nKey = `${nx},${ny}`;
                                        
                                        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !reservedTiles.has(nKey) && (nx !== Math.round(targetPlayerPos.x) || ny !== Math.round(targetPlayerPos.y))) {
                                            const nTile = sourceGrid[ny][nx];
                                            if (nTile.type !== 'WALL' && !(nTile.type === 'DOOR' && nTile.door?.state !== 'OPEN') && !(nTile.decoration && nTile.decoration.blocking) && !(nTile.items && nTile.items.some((i: any) => i.blocking)) && !newGrid[ny][nx].enemyId) {
                                                updateTile(currentY, currentX, t => t.enemyId = undefined);
                                                updateTile(ny, nx, t => t.enemyId = enemyId);
                                                hasGridChanges = true;
                                                reservedTiles.add(nKey);
                                                
                                                const eIdx = allEnemies.findIndex(e => e.id === enemyId);
                                                if (eIdx !== -1) {
                                                    allEnemies[eIdx].x = nx;
                                                    allEnemies[eIdx].y = ny;
                                                }
                                                
                                                stepMoved = true;
                                                nextX = nx;
                                                nextY = ny;
                                                evaded = true;
                                                updateEnemyState({ currentPath: [], blockedTurns: 0 });
                                                break;
                                            }
                                        }
                                    }
                                    if (!evaded) {
                                        reservedTiles.add(currentKey);
                                        state.finished = true; return;
                                    }
                                } else {
                                    reservedTiles.add(currentKey);
                                    state.finished = true; return;
                                }
                            }
                        } else {
                            reservedTiles.add(currentKey);
                            state.finished = true; return;
                        }
                    } else if (currentState === 'INVESTIGATE') {
                        const memoryTarget = pendingUpdates.targetPos || enemy.targetPos;
                        let investigateTurns = pendingUpdates.investigateTurns ?? enemy.investigateTurns ?? 0;
                        let blockedTurns = pendingUpdates.blockedTurns ?? enemy.blockedTurns ?? 0;
                        let currentPath = pendingUpdates.currentPath !== undefined ? pendingUpdates.currentPath : enemy.currentPath;

                        if (!memoryTarget || investigateTurns >= 4) {
                            updateEnemyState({ aiState: 'IDLE', targetPos: undefined, investigateTurns: undefined, currentPath: undefined, blockedTurns: 0 });
                            reservedTiles.add(currentKey);
                            state.finished = true; return;
                        }

                        let isAtOrNearTarget = (currentX === Math.round(memoryTarget.x) && currentY === Math.round(memoryTarget.y));

                        if (!isAtOrNearTarget) {
                            if (!currentPath || currentPath.length === 0) {
                                const newPath = findPath(currentX, currentY, Math.round(memoryTarget.x), Math.round(memoryTarget.y), sourceGrid, width, height, reservedTiles, undefined, pathfindingBudget, enemy.canOpenDoors);
                                currentPath = newPath;
                                if (newPath.length > 0) {
                                    updateEnemyState({ currentPath: newPath, blockedTurns: 0 });
                                } else {
                                    isAtOrNearTarget = true;
                                }
                            }
                        }

                        if (!isAtOrNearTarget && currentPath && currentPath.length > 0) {
                            const nextStep = currentPath[0];
                            const nextKey = `${nextStep.x},${nextStep.y}`;
                            
                            const isReserved = reservedTiles.has(nextKey);
                            const tile = newGrid[nextStep.y]?.[nextStep.x];
                            const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                            const canOpenThisDoor = tile && tile.type === 'DOOR' && (tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING') && 
                                                   enemy.canOpenDoors && tile && tile.door && 
                                                   !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                                   tile.door.state !== 'OPENING';

                            if (!isReserved && !isBlockedByDoor) {
                                updateTile(currentY, currentX, t => t.enemyId = undefined);
                                updateTile(nextStep.y, nextStep.x, t => t.enemyId = enemyId);
                                hasGridChanges = true;
                                reservedTiles.add(nextKey);
                                
                                const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                if (enemyIdx !== -1) {
                                    allEnemies[enemyIdx].x = nextStep.x;
                                    allEnemies[enemyIdx].y = nextStep.y;
                                }

                                stepMoved = true;
                                nextX = nextStep.x;
                                nextY = nextStep.y;

                                updateEnemyState({ currentPath: currentPath.slice(1), blockedTurns: 0 });
                            } else if (canOpenThisDoor) {
                                updateTile(nextStep.y, nextStep.x, t => {
                                    if (t.door) {
                                        t.door.state = 'OPENING';
                                        t.door.progress = 0;
                                        t.door.lastUpdate = Date.now();
                                    }
                                });
                                hasGridChanges = true;
                                reservedTiles.add(currentKey);
                                if (playSound) playSound(tile.door?.openSound || 'DOOR_OPEN', { x: nextStep.x, y: nextStep.y });
                                
                                updateEnemyState({ currentPath: [], blockedTurns: 0 });
                                state.currentX = currentX;
                                state.currentY = currentY;
                                state.finished = true;
                                return;
                            } else {
                                blockedTurns++;
                                const distToTarget = Math.max(Math.abs(currentX - Math.round(memoryTarget.x)), Math.abs(currentY - Math.round(memoryTarget.y)));
                                if (distToTarget <= 1) {
                                    isAtOrNearTarget = true;
                                } else {
                                    if (blockedTurns >= 2) {
                                        const newPath = findPath(currentX, currentY, Math.round(memoryTarget.x), Math.round(memoryTarget.y), sourceGrid, width, height, reservedTiles, undefined, pathfindingBudget, enemy.canOpenDoors);
                                        if (newPath.length > 0) {
                                            updateEnemyState({ currentPath: newPath, blockedTurns: 0 });
                                        } else {
                                            isAtOrNearTarget = true;
                                        }
                                    } else {
                                        updateEnemyState({ blockedTurns });
                                        reservedTiles.add(currentKey);
                                        state.finished = true; return;
                                    }
                                }
                            }
                        }

                        if (isAtOrNearTarget) {
                            const candidates: {x: number, y: number}[] = [];
                            const dirs = [
                                {dx: 0, dy: 1},
                                {dx: 0, dy: -1},
                                {dx: 1, dy: 0},
                                {dx: -1, dy: 0}
                            ];
                            
                            for (let i = dirs.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                const temp = dirs[i];
                                dirs[i] = dirs[j];
                                dirs[j] = temp;
                            }

                            for (const d of dirs) {
                                const nx = currentX + d.dx;
                                const ny = currentY + d.dy;
                                const nextKey = `${nx},${ny}`;
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    const tile = sourceGrid[ny][nx];
                                    const isWall = tile.type === 'WALL';
                                    const isPortal = false;
                                    const isClosedDoor = tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
                                    const isBlockingDeco = tile.decorations && tile.decorations.length > 0
                                        ? tile.decorations.some((d: any) => d.blocking)
                                        : !!(tile.decoration && tile.decoration.blocking);
                                    const isBlockingItem = tile.items && tile.items.some((it: any) => it.blocking);
                                    const isReserved = reservedTiles.has(nextKey);
                                    const hasOtherEnemy = (newGrid[ny]?.[nx]?.enemyId !== undefined) || (sourceGrid[ny]?.[nx]?.enemyId !== undefined);
                                    const isPlayerTile = Math.round(targetPlayerPos.x) === nx && Math.round(targetPlayerPos.y) === ny;

                                    if (!isWall && !isPortal && !isClosedDoor && !isBlockingDeco && !isBlockingItem && !isReserved && !hasOtherEnemy && !isPlayerTile) {
                                        const distToMemX = Math.abs(nx - Math.round(memoryTarget.x));
                                        const distToMemY = Math.abs(ny - Math.round(memoryTarget.y));
                                        const maxDist = Math.max(distToMemX, distToMemY);
                                        if (maxDist <= 3) {
                                            candidates.push({ x: nx, y: ny });
                                        }
                                    }
                                }
                            }

                            if (candidates.length > 0) {
                                const choice = candidates[0];
                                const choiceKey = `${choice.x},${choice.y}`;

                                updateTile(currentY, currentX, t => t.enemyId = undefined);
                                updateTile(choice.y, choice.x, t => t.enemyId = enemyId);
                                hasGridChanges = true;
                                reservedTiles.add(choiceKey);

                                const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                                if (enemyIdx !== -1) {
                                    allEnemies[enemyIdx].x = choice.x;
                                    allEnemies[enemyIdx].y = choice.y;
                                }

                                stepMoved = true;
                                nextX = choice.x;
                                nextY = choice.y;

                                updateEnemyState({ investigateTurns: investigateTurns + 1, currentPath: [] });
                            } else {
                                updateEnemyState({ investigateTurns: investigateTurns + 1, currentPath: [] });
                                reservedTiles.add(currentKey);
                                state.finished = true; return;
                            }
                        }
                    } else {
                        const aiState = {
                            movementType: pendingUpdates.movementType ?? enemy.movementType,
                            patrolRange: pendingUpdates.patrolRange ?? enemy.patrolRange,
                            homePos: pendingUpdates.homePos ?? enemy.homePos,
                            targetPos: pendingUpdates.targetPos ?? enemy.targetPos,
                            currentPath: pendingUpdates.currentPath ?? enemy.currentPath
                        };

                        const nextMove = getRoamingMove(
                            enemyId, currentX, currentY, newGrid, width, height, targetPlayerPos.x, targetPlayerPos.y,
                            aiState,
                            updateEnemyState,
                            reservedTiles,
                            pathfindingBudget,
                            enemy.canOpenDoors
                        );

                        const isNextMoveDoor = nextMove && newGrid[nextMove.y]?.[nextMove.x]?.type === 'DOOR';
                        const doorTile = isNextMoveDoor ? newGrid[nextMove.y][nextMove.x] : null;
                        const canOpenThisDoor = doorTile && doorTile.door && 
                                               (doorTile.door.state === 'CLOSED' || doorTile.door.state === 'CLOSING') && 
                                               enemy.canOpenDoors && !doorTile.door.isLocked && !doorTile.door.closed && 
                                               !doorTile.door.keyId && doorTile.door.state !== 'OPENING';

                        if (nextMove && canOpenThisDoor) {
                            updateTile(nextMove.y, nextMove.x, t => {
                                if (t.door) {
                                    t.door.state = 'OPENING';
                                    t.door.progress = 0;
                                    t.door.lastUpdate = Date.now();
                                }
                            });
                            hasGridChanges = true;
                            reservedTiles.add(currentKey);
                            if (playSound) playSound(doorTile.door?.openSound || 'DOOR_OPEN', { x: nextMove.x, y: nextMove.y });
                            
                            updateEnemyState({ currentPath: [], blockedTurns: 0 });
                            state.currentX = currentX;
                            state.currentY = currentY;
                            state.finished = true;
                            return;
                        } else if (nextMove) {
                            const nextKey = `${nextMove.x},${nextMove.y}`;
                            updateTile(currentY, currentX, t => t.enemyId = undefined);
                            updateTile(nextMove.y, nextMove.x, t => t.enemyId = enemyId);
                            hasGridChanges = true;
                            reservedTiles.add(nextKey);
                            
                            const enemyIdx = allEnemies.findIndex(e => e.id === enemyId);
                            if (enemyIdx !== -1) {
                                allEnemies[enemyIdx].x = nextMove.x;
                                allEnemies[enemyIdx].y = nextMove.y;
                            }

                            stepMoved = true;
                            nextX = nextMove.x;
                            nextY = nextMove.y;

                            updateEnemyState({ aiState: 'PATROL' });
                        } else {
                            reservedTiles.add(currentKey);
                            state.finished = true; return;
                        }
                    }

                    if (stepMoved) {
                        if (onEnemyStep) onEnemyStep(enemyId, nextX, nextY, action, state.speed);
                        if (Math.abs(currentX - targetPlayerPos.x) < 20 && Math.abs(currentY - targetPlayerPos.y) < 20) {
                            const stepDuration = 300 / state.speed;
                            newAnims.push({
                                id: enemyId,
                                startX: currentX, startY: currentY,
                                endX: nextX, endY: nextY,
                                startTime: now + (action * stepDuration),
                                duration: stepDuration
                            });
                        }
                        
                        const distNew = Math.sqrt((nextX - targetPlayerPos.x)**2 + (nextY - targetPlayerPos.y)**2);
                        const canSeeNow = hasLineOfSight({x: nextX, y: nextY}, targetPlayerPos, newGrid, width, height, enemyId, false);
                        
                        if (canSeeNow) {
                            if (isCombatActive || newCombatants.length > 0) {
                                 if (!newCombatants.includes(enemyId)) newCombatants.push(enemyId);
                                 updateEnemyState({ aiState: 'COMBAT' });
                                 state.currentX = nextX;
                                 state.currentY = nextY;
                                 state.finished = true; return;
                            }
                            else if (distNew <= effectiveAttackRange) {
                                if (isValidCombatPosition({x: nextX, y: nextY}, targetPlayerPos, newGrid, width, height, enemyId, rawRange, allEnemies)) {
                                     if (!newCombatants.includes(enemyId)) newCombatants.push(enemyId);
                                     updateEnemyState({ aiState: 'COMBAT' });
                                     state.currentX = nextX;
                                     state.currentY = nextY;
                                     state.finished = true; return;
                                } else {
                                     const targetPos = { x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y) };
                                     const newPath = findPath(nextX, nextY, targetPos.x, targetPos.y, newGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget);
                                     updateEnemyState({ aiState: 'CHASE', currentPath: newPath, targetPos, blockedTurns: 0 });
                                }
                            } else {
                                 const targetPos = { x: Math.round(targetPlayerPos.x), y: Math.round(targetPlayerPos.y) };
                                 const newPath = findPath(nextX, nextY, targetPos.x, targetPos.y, newGrid, width, height, reservedTiles, targetPlayerPos, pathfindingBudget);
                                 updateEnemyState({ aiState: 'CHASE', currentPath: newPath, targetPos, blockedTurns: 0 });
                            }
                        }
                    }

                    state.currentX = nextX;
                    state.currentY = nextY;
                } else if (state.type === 'npc') {
                    if (action > 0) { state.finished = true; return; }
                    const npc = state.entity;
                    const x = state.currentX;
                    const y = state.currentY;
                    const currentKey = `${x},${y}`;
                    reservedTiles.delete(currentKey);

                    // OPTIMIZATION: If NPC is far from player (>20 tiles) and not in SCRIPT_MOVE, skip roaming step
                    // to prevent unnecessary grid cloning and React state re-renders for offscreen NPCs.
                    const distSqToPlayer = (x - targetPlayerPos.x)**2 + (y - targetPlayerPos.y)**2;
                    if (distSqToPlayer > 400 && npc.aiState !== 'SCRIPT_MOVE' && npc.aiState !== 'NPC_FOLLOW') {
                        reservedTiles.add(currentKey);
                        state.finished = true;
                        return;
                    }

                    if (Math.random() > 0.5) {
                        const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
                        for (let i = dirs.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                        }

                        let hx = npc.homePos?.x ?? x;
                        let hy = npc.homePos?.y ?? y;
                        const range = (npc.patrolRange && npc.patrolRange > 0) ? npc.patrolRange : 3;

                        // Ensure homePos is near current position so NPC doesn't freeze if moved far away by script/follow
                        if (!npc.homePos || ((x - hx)**2 + (y - hy)**2 > range * range)) {
                            hx = x;
                            hy = y;
                            updateEnemyState({ homePos: { x: hx, y: hy } });
                        }

                        let moved = false;
                        for (const dir of dirs) {
                            const nx = x + dir.dx;
                            const ny = y + dir.dy;
                            const nextKey = `${nx},${ny}`;

                            if (!reservedTiles.has(nextKey) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const tile = sourceGrid[ny][nx];
                                const newTile = newGrid[ny][nx];
                                const isTileDecoBlocking = tile.decorations && tile.decorations.length > 0
                                    ? tile.decorations.some((d: any) => d.blocking)
                                    : !!(tile.decoration && tile.decoration.blocking);
                                if (tile.type !== 'WALL' && !(tile.type === 'DOOR' && tile.door?.state !== 'OPEN') && !isTileDecoBlocking && !(tile.items && tile.items.some((i: any) => i.blocking)) && !newTile.enemyId) {
                                    const distSq = (nx - hx)**2 + (ny - hy)**2;
                                    if (distSq <= (range * range)) {
                                        updateTile(y, x, t => t.enemyId = undefined);
                                        updateTile(ny, nx, t => t.enemyId = npc.id);
                                        hasGridChanges = true;
                                        reservedTiles.add(nextKey);
                                        moved = true;
                                        state.currentX = nx;
                                        state.currentY = ny;
                                        
                                        if (onEnemyStep) onEnemyStep(npc.id, nx, ny, action, state.speed);
                                        
                                        if (Math.abs(x - targetPlayerPos.x) < 20 && Math.abs(y - targetPlayerPos.y) < 20) {
                                            const stepDuration = 300 / state.speed;
                                            newAnims.push({
                                                id: npc.id,
                                                startX: x, startY: y,
                                                endX: nx, endY: ny,
                                                startTime: now + (action * stepDuration),
                                                duration: stepDuration
                                            });
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        if (!moved) reservedTiles.add(currentKey);
                    } else {
                        reservedTiles.add(currentKey);
                    }
                    state.finished = true;
                }
            });
        }


        // --- UPDATES ---
        if (newCombatants.length > 0 && onEnemyJoinCombat) {
            onEnemyJoinCombat(newCombatants);
        }

        if (enemyStateUpdates.size > 0) {
            setEnemies(prev => {
                const next = new Map(prev);
                enemyStateUpdates.forEach((updates, id) => {
                    const e = next.get(id);
                    if (e) {
                        const merged = Object.assign({}, e, updates);
                        next.set(id, merged);
                    }
                });
                return next;
            });
        }

        if (newAnims.length > 0) {
            setRoamingAnims(prev => {
                const movingIds = new Set(newAnims.map(a => a.id));
                const remaining = prev.filter(a => !movingIds.has(a.id));
                return [...remaining, ...newAnims];
            });
            
            newAnims.forEach(anim => {
                setTimeout(() => {
                    setRoamingAnims(prev => prev.filter(p => {
                        if (p.id === anim.id) return p.startTime !== anim.startTime;
                        return true;
                    }));
                }, Math.max(0, anim.startTime - performance.now()) + anim.duration + 50);
            });
        }

        if (hasGridChanges) {
            setLevelData((prev: any) => {
                if (!prev || !prev.grid) return prev;
                // Safely apply changes from the old roaming turn to the latest grid state
                // OPTIMIZATION: Shallow copy the top-level row array. We will clone individual rows lazily.
                const updatedGrid = [...prev.grid];
                const updateGridTile = (y: number, x: number, mutator: (t: Tile) => void) => {
                    if (updatedGrid[y] === prev.grid[y]) {
                        updatedGrid[y] = [...prev.grid[y]];
                    }
                    updatedGrid[y][x] = { ...updatedGrid[y][x] };
                    mutator(updatedGrid[y][x]);
                };
                
                // First pass: verify which entities are still alive and record their intended destination
                const enemyIntent = new Map<string, {from: {x:number, y:number}, to: {x:number, y:number}}>();

                for (const state of mutableStates) {
                    if (state.currentX !== state.startX || state.currentY !== state.startY) {
                        enemyIntent.set(state.id, {
                            from: { x: state.startX, y: state.startY },
                            to: { x: state.currentX, y: state.currentY }
                        });
                    }
                }

                // Second pass: validate intent against current grid state
                const validEnemyMoves = new Set<string>();

                for (const [enemyId, move] of enemyIntent.entries()) {
                    const currentSrc = updatedGrid[move.from.y]?.[move.from.x];
                    if (currentSrc && currentSrc.enemyId === enemyId) {
                        validEnemyMoves.add(enemyId);
                    }
                }

                // Third pass: securely apply moves
                // Step A: clear sources
                for (const enemyId of validEnemyMoves) {
                    const move = enemyIntent.get(enemyId)!;
                    updateGridTile(move.from.y, move.from.x, t => t.enemyId = undefined);
                }

                // Step B: place destinations
                for (const enemyId of validEnemyMoves) {
                    const move = enemyIntent.get(enemyId)!;
                    // If the target tile happens to be occupied now (e.g. out of band spawn), we might overwrite it.
                    // But typically this is safe because we just cleared all moving entities.
                    updateGridTile(move.to.y, move.to.x, t => t.enemyId = enemyId);
                }
                
                return { ...prev, grid: updatedGrid };
            });
            return newGrid;
        }

        return sourceGrid;

    }, [levelData, player.pos.x, player.pos.y, setLevelData, setRoamingAnims, setEnemies, aiEnabled, activeCombatEnemyIds, onEnemyJoinCombat, isCombatActive, onEnemyStep, playSound]);

    return { triggerRoamingTurn };
};

export const useRoamingSystemReal = useRoamingSystem;