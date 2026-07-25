
import { Tile } from '../types';
import { hasLineOfSight, isValidCombatPosition } from './combatLogic';
import { getBresenhamLine } from './aimingLogic';

interface Point {
    x: number;
    y: number;
}

interface Node {
    x: number;
    y: number;
    f: number;
    g: number;
    h: number;
    parent: Node | null;
}

let sharedBestG: Float32Array | null = null;
let sharedBestGGeneration: Int32Array | null = null;
let sharedClosedSetGeneration: Int32Array | null = null;
let currentGeneration = 0;

const isValidTile = (x: number, y: number, grid: Tile[][], width: number, height: number, reserved?: Set<string>, playerX?: number, playerY?: number, canOpenDoors: boolean = false): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    
    // Check against player pos
    if (playerX !== undefined && playerY !== undefined && Math.round(playerX) === x && Math.round(playerY) === y) return false;
    
    const tile = grid[y]?.[x];
    if (!tile) return false;
    if (tile.type === 'WALL' && tile.blocking !== false) return false;
    // Closed doors are obstacles for roaming unless they can open them
    if (tile.type === 'DOOR' && tile.door?.state !== 'OPEN') {
        if (!canOpenDoors || tile.door?.isLocked || tile.door?.closed || tile.door?.keyId) return false;
    }
    if (tile.decoration && tile.decoration.blocking) return false;
    if (tile.items && tile.items.some((i: any) => i.blocking)) return false;
    
    // Check other entities: if tile has an enemy, it's blocked.
    // We only check reserved set as a fallback if the tile doesn't have an enemy currently but is reserved.
    if (tile.enemyId !== undefined) return false;
    if (reserved && reserved.size > 0 && reserved.has(`${x},${y}`)) return false;
    
    return true;
};

class PriorityQueue<T> {
    private heap: T[] = [];
    constructor(private compare: (a: T, b: T) => boolean) {}
    push(item: T) {
        this.heap.push(item);
        let i = this.heap.length - 1;
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (this.compare(this.heap[i], this.heap[p])) {
                const t = this.heap[i]; this.heap[i] = this.heap[p]; this.heap[p] = t;
                i = p;
            } else break;
        }
    }
    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const res = this.heap[0];
        const end = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = end;
            let i = 0;
            const l = this.heap.length;
            while (true) {
                let left = 2 * i + 1;
                let right = 2 * i + 2;
                let smallest = i;
                if (left < l && this.compare(this.heap[left], this.heap[smallest])) smallest = left;
                if (right < l && this.compare(this.heap[right], this.heap[smallest])) smallest = right;
                if (smallest !== i) {
                    const t = this.heap[i]; this.heap[i] = this.heap[smallest]; this.heap[smallest] = t;
                    i = smallest;
                } else break;
            }
        }
        return res;
    }
    get length() { return this.heap.length; }
}

// A* Pathfinding
export const findPath = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    grid: Tile[][],
    width: number,
    height: number,
    ignoredCoords?: Set<string>, // Coordinates to treat as walls dynamically (Other enemies)
    playerPos?: {x: number, y: number}, // Treat player as obstacle
    budget?: { count: number }, // Load balancing: limit A* searches per turn
    canOpenDoors: boolean = false
): Point[] => {
    // If target is invalid (wall/blocking decor), don't bother
    if (endX < 0 || endX >= width || endY < 0 || endY >= height) return [];
    const targetTile = grid[endY][endX];
    
    // Strict check for target validity. 
    if ((targetTile.type === 'WALL' && targetTile.blocking !== false) || targetTile.decoration?.blocking) return [];
    // Enemies cannot path to a closed door tile as a destination unless they can open doors
    if (targetTile.type === 'DOOR' && targetTile.door?.state !== 'OPEN') {
        if (!canOpenDoors || targetTile.door?.isLocked || targetTile.door?.closed || targetTile.door?.keyId) return [];
    }
    
    // Load Balancing: If we are out of pathfinding budget for this turn, abort A*
    if (budget) {
        if (budget.count <= 0) return [];
        budget.count--;
    }

    const openSet = new PriorityQueue<Node>((a, b) => a.f < b.f);
    const gridSize = width * height;
    
    // Allocate or grow shared arrays as needed
    if (!sharedBestG || sharedBestG.length < gridSize) {
        sharedBestG = new Float32Array(gridSize);
        sharedBestGGeneration = new Int32Array(gridSize);
        sharedClosedSetGeneration = new Int32Array(gridSize);
        currentGeneration = 0;
    }

    currentGeneration++;
    if (currentGeneration > 2000000000) {
        sharedBestGGeneration.fill(0);
        sharedClosedSetGeneration.fill(0);
        currentGeneration = 1;
    }

    const isClosedNode = (nodeIdx: number): boolean => {
        return sharedClosedSetGeneration[nodeIdx] === currentGeneration;
    };

    const closeNode = (nodeIdx: number) => {
        sharedClosedSetGeneration[nodeIdx] = currentGeneration;
    };

    const getBestG = (nodeIdx: number): number => {
        if (sharedBestGGeneration[nodeIdx] === currentGeneration) {
            return sharedBestG[nodeIdx];
        }
        return Infinity;
    };

    const setBestG = (nodeIdx: number, val: number) => {
        sharedBestG[nodeIdx] = val;
        sharedBestGGeneration[nodeIdx] = currentGeneration;
    };
    
    // Calculate initial h using Manhattan distance
    const startH = Math.abs(startX - endX) + Math.abs(startY - endY);
    const startNode: Node = { x: startX, y: startY, f: startH, g: 0, h: startH, parent: null };
    openSet.push(startNode);
    setBestG(startY * width + startX, 0);

    // Track the closest reachable node in case target is completely unreachable
    let closestNode: Node = startNode;
    let minH = startH;

    // Increased iterations to allow finding paths around large groups of enemies
    const maxIterations = 500; // OPTIMIZATION: Reduced from 1000
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;
        
        let currentNode = openSet.pop()!;
        const currentNodeIdx = currentNode.y * width + currentNode.x;
        
        if (currentNode.h < minH) {
            minH = currentNode.h;
            closestNode = currentNode;
        }

        // Skip if we already found a faster way to this node before popping it
        if (isClosedNode(currentNodeIdx)) continue;
        
        if (currentNode.x === endX && currentNode.y === endY) {
            const path: Point[] = [];
            let curr: Node | null = currentNode;
            while (curr.parent) {
                path.push({ x: curr.x, y: curr.y });
                curr = curr.parent;
            }
            return path.reverse();
        }

        closeNode(currentNodeIdx);

        for (let dir = 0; dir < 4; dir++) {
            let nx = currentNode.x;
            let ny = currentNode.y;
            if (dir === 0) nx++;
            else if (dir === 1) nx--;
            else if (dir === 2) ny++;
            else ny--;

            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            const neighborIdx = ny * width + nx;
            if (isClosedNode(neighborIdx)) continue;

            const tile = grid[ny]?.[nx];
            if (!tile) continue;
            if (tile.type === 'WALL' && tile.blocking !== false) continue;
            // Enemies treat closed doors as walls unless they can open doors
            if (tile.type === 'DOOR' && tile.door?.state !== 'OPEN') {
                if (!canOpenDoors || tile.door?.isLocked || tile.door?.closed || tile.door?.keyId) continue;
            }
            if (tile.decoration && tile.decoration.blocking) continue;
            if (tile.items && tile.items.some((i: any) => i.blocking)) continue;

            let penalty = 0;
            const hasEnemy = tile.enemyId !== undefined;
            const isPlayer = playerPos !== undefined && Math.round(playerPos.x) === nx && Math.round(playerPos.y) === ny;

            // Player collision check
            // Allow stepping onto the player tile ONLY if it is the final destination (to get adjacent for attack)
            if (isPlayer) {
                if (nx !== endX || ny !== endY) {
                    penalty += 10;
                }
            }

            // Dynamic obstacle check (other enemies)
            // Generate string key only when there's an active entity on the tile to avoid unnecessary allocations
            if (hasEnemy && ignoredCoords && ignoredCoords.size > 0) {
                if (nx !== endX || ny !== endY) {
                    const key = `${nx},${ny}`;
                    if (ignoredCoords.has(key)) {
                        penalty += 5; // Pathing through an occupied tile costs 5 extra steps!
                    }
                }
            }

            const gScore = currentNode.g + 1 + penalty;
            const currentBestG = getBestG(neighborIdx);
            
            if (gScore < currentBestG) {
                const h = Math.abs(nx - endX) + Math.abs(ny - endY);
                // OPTIMIZATION: Weighted A* (h * 1.2) to prefer expanding towards target
                const neighborNode: Node = { x: nx, y: ny, f: gScore + (h * 1.2), g: gScore, h, parent: currentNode };
                openSet.push(neighborNode);
                setBestG(neighborIdx, gScore);
            }
        }
    }
    
    // Target unreachable. Return path to closest reachable node if it's not the start node.
    if (closestNode !== startNode) {
        const path: Point[] = [];
        let curr: Node | null = closestNode;
        while (curr.parent) {
            path.push({ x: curr.x, y: curr.y });
            curr = curr.parent;
        }
        return path.reverse();
    }

    return [];
};

export const getPatrolTarget = (
    homeX: number,
    homeY: number,
    range: number,
    grid: Tile[][],
    width: number,
    height: number
): Point | null => {
    let attempts = 0;
    while (attempts < 10) {
        const dx = Math.floor(Math.random() * (range * 2 + 1)) - range;
        const dy = Math.floor(Math.random() * (range * 2 + 1)) - range;
        
        const tx = homeX + dx;
        const ty = homeY + dy;
        
        // Basic validity check
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
             const tile = grid[ty][tx];
             if (tile.type !== 'WALL' && (!tile.decoration || !tile.decoration.blocking) && !(tile.items && tile.items.some((i: any) => i.blocking)) && !(tile.type === 'DOOR' && tile.door?.state !== 'OPEN')) {
                 return { x: tx, y: ty };
             }
        }
        attempts++;
    }
    return null;
};

export const getRoamingTarget = (
    grid: Tile[][],
    width: number,
    height: number
): Point | null => {
    let attempts = 0;
    while (attempts < 20) {
        const tx = Math.floor(Math.random() * width);
        const ty = Math.floor(Math.random() * height);
        
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
             const tile = grid[ty][tx];
             if (tile.type !== 'WALL' && (!tile.decoration || !tile.decoration.blocking) && !(tile.items && tile.items.some((i: any) => i.blocking)) && !(tile.type === 'DOOR' && tile.door?.state !== 'OPEN')) {
                 return { x: tx, y: ty };
             }
        }
        attempts++;
    }
    return null;
};

export const getRoamingMove = (
    enemyId: string,
    currentX: number,
    currentY: number,
    grid: Tile[][],
    width: number,
    height: number,
    playerX: number,
    playerY: number,
    aiState: { 
        movementType?: 'patroling' | 'roaming', 
        patrolRange?: number, 
        homePos?: {x: number, y: number},
        targetPos?: {x: number, y: number},
        currentPath?: {x: number, y: number}[]
    },
    updateEnemyState: (updates: any) => void,
    reservedTiles: Set<string>, // Tiles occupied by other units THIS turn
    budget?: { count: number },
    canOpenDoors: boolean = false
): { x: number, y: number } | null => {
    
    let path = aiState.currentPath;
    let target = aiState.targetPos;

    // --- STRATEGY 1: Generate a target if none exists ---
    if (!path || path.length === 0 || !target) {
        if (aiState.movementType === 'roaming') {
            target = getRoamingTarget(grid, width, height);
        } else {
            const hx = aiState.homePos?.x ?? currentX;
            const hy = aiState.homePos?.y ?? currentY;
            const range = aiState.patrolRange || 3;
            target = getPatrolTarget(hx, hy, range, grid, width, height);
        }

        if (target) {
            // Initial path calculation: STRICT mode (Respect all reserved tiles)
            path = findPath(currentX, currentY, target.x, target.y, grid, width, height, reservedTiles, {x: playerX, y: playerY}, budget, canOpenDoors);

            if (path.length > 0) {
                updateEnemyState({ targetPos: target, currentPath: path, blockedTurns: 0 });
            } else {
                // If strict pathing fails (blocked by walls or friends), discard target to find a new one next turn
                updateEnemyState({ targetPos: undefined, currentPath: [], blockedTurns: 3 });
            }
        }
    }

    // Cooldown check for unreachable roaming
    if ((aiState as any).blockedTurns && (aiState as any).blockedTurns > 0) {
        updateEnemyState({ blockedTurns: (aiState as any).blockedTurns - 1 });
        return null;
    }

    // --- STRATEGY 2: Follow Path (With Real-Time Obstacle Check) ---
    if (path && path.length > 0) {
        const nextStep = path[0];
        const nextKey = `${nextStep.x},${nextStep.y}`;
        
        const isBlockedByPlayer = Math.round(playerX) === nextStep.x && Math.round(playerY) === nextStep.y;
        const isReserved = reservedTiles.has(nextKey);
        const tile = grid[nextStep.y]?.[nextStep.x];
        const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
        const canOpenThisDoor = isBlockedByDoor && canOpenDoors && tile && tile.door && 
                               !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                               tile.door.state !== 'OPENING';

        if (!isBlockedByPlayer && !isReserved && !isBlockedByDoor) {
            // Path is clear!
            const newPath = path.slice(1);
            updateEnemyState({ currentPath: newPath });
            return nextStep;
        } else if (canOpenThisDoor) {
            // Door can be opened! Return nextStep to let roamingSystem handle opening,
            // BUT do NOT slice the path, and do NOT clear path/target!
            return nextStep;
        } else {
            // BLOCKED!
            // When roaming/patrolling, if hit by any obstacle (dynamic or static),
            // just clear target and path to prevent deadlocks and teleportations.
            updateEnemyState({ currentPath: [], targetPos: undefined });
            return null;
        }
    }

    // --- STRATEGY 3: Smart Fallback / Local Avoidance ---
    // Try to move to ANY valid neighbor closest to ideal path.
    const idealDest = (path && path.length > 0) ? path[0] : target;

    const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
    for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }

    let bestNeighbor: {x: number, y: number} | null = null;
    let minDistToIdeal = Infinity;

    for (const d of dirs) {
        const nx = currentX + d.dx;
        const ny = currentY + d.dy;
        
        if (isValidTile(nx, ny, grid, width, height, reservedTiles, playerX, playerY, canOpenDoors)) {
            if (idealDest) {
                const dist = Math.abs(nx - idealDest.x) + Math.abs(ny - idealDest.y);
                if (dist < minDistToIdeal) {
                    minDistToIdeal = dist;
                    bestNeighbor = {x: nx, y: ny};
                }
            } else {
                return { x: nx, y: ny };
            }
        }
    }

    if (bestNeighbor) {
        // Found a detour!
        return bestNeighbor;
    }

    // Completely stuck/surrounded.
    return null;
};

// NEW: Robust chase logic reusing the Ghost Pathing + Local Avoidance strategies
export const getChaseMove = (
    enemyId: string,
    currentX: number,
    currentY: number,
    grid: Tile[][],
    width: number,
    height: number,
    playerX: number,
    playerY: number,
    attackRange: number,
    reservedTiles: Set<string>,
    updateEnemyState: (updates: any) => void,
    aiState?: any,
    budget?: { count: number },
    canOpenDoors: boolean = false
): { x: number, y: number } | null => {
    
    const rawRange = attackRange !== undefined ? attackRange : 1;

    // --- CACHE CHECK ---
    if (aiState && aiState.currentPath && aiState.currentPath.length > 0) {
        const pathDest = aiState.currentPath[aiState.currentPath.length - 1];
        const distToPlayer = Math.abs(pathDest.x - playerX) + Math.abs(pathDest.y - playerY);
        
        let isCacheValid = false;
        if (rawRange > 1) {
            if (distToPlayer <= rawRange + 0.5) {
                if (isValidCombatPosition(pathDest, {x: playerX, y: playerY}, grid, width, height, enemyId, rawRange)) {
                    isCacheValid = true;
                }
            }
        } else {
            if (distToPlayer <= 1.5) {
                isCacheValid = true;
            }
        }

        if (isCacheValid) {
            const nextStep = aiState.currentPath[0];
            const nextKey = `${nextStep.x},${nextStep.y}`;
            
            const isBlockedByPlayer = Math.round(playerX) === nextStep.x && Math.round(playerY) === nextStep.y;
            const isReserved = reservedTiles.has(nextKey);
            const tile = grid[nextStep.y]?.[nextStep.x];
            const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
            const canOpenThisDoor = isBlockedByDoor && canOpenDoors && tile && tile.door && 
                                   !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                                   tile.door.state !== 'OPENING';

            if (!isBlockedByPlayer && !isReserved && !isBlockedByDoor) {
                updateEnemyState({ currentPath: aiState.currentPath.slice(1) });
                return nextStep;
            } else if (canOpenThisDoor) {
                return nextStep;
            } else {
                isCacheValid = false;
            }
        }
    }

    // 1. Determine Target (Best shooting spot OR Player position if melee)
    let attackSpot = findBestAttackPosition({x: currentX, y: currentY}, {x: playerX, y: playerY}, rawRange, grid, width, height, enemyId, reservedTiles);
    
    // Fallback: If no shooting spot found (player cornered?), aim directly for the player to pressure them
    if (!attackSpot) {
        attackSpot = { x: Math.round(playerX), y: Math.round(playerY) };
    }

    // Always remember the precise tile the player was standing on for memory pursuit if sight is lost.
    updateEnemyState({ targetPos: { x: Math.round(playerX), y: Math.round(playerY) } });

    // 2. Calculate Path
    // Strategy: Try strict first, then ghost
    let path = findPath(currentX, currentY, attackSpot.x, attackSpot.y, grid, width, height, reservedTiles, {x: playerX, y: playerY}, budget, canOpenDoors);
    
    if (path.length === 0) {
        // Strict failed (likely blocked by friends). Use Ghost Pathing.
        path = findPath(currentX, currentY, attackSpot.x, attackSpot.y, grid, width, height, new Set(), {x: playerX, y: playerY}, budget, canOpenDoors);
    }

    // 3. Execute Move (Targeting next step)
    if (path.length > 0) {
        const nextStep = path[0];
        const nextKey = `${nextStep.x},${nextStep.y}`;
        
        const isBlockedByPlayer = Math.round(playerX) === nextStep.x && Math.round(playerY) === nextStep.y;
        const isReserved = reservedTiles.has(nextKey);
        const tile = grid[nextStep.y]?.[nextStep.x];
        const isBlockedByDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
        const canOpenThisDoor = isBlockedByDoor && canOpenDoors && tile && tile.door && 
                               !tile.door.isLocked && !tile.door.closed && !tile.door.keyId && 
                               tile.door.state !== 'OPENING';

        if (!isBlockedByPlayer && !isReserved && !isBlockedByDoor) {
            updateEnemyState({ currentPath: path.slice(1) });
            return nextStep;
        } else if (canOpenThisDoor) {
            return nextStep;
        }
    }

    // 4. Local Avoidance / Fallback
    // If we have a path but first step blocked, or no path at all, try to step ANYWHERE closer to target
    const idealDest = (path && path.length > 0) ? path[0] : attackSpot;
    
    const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
    for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }

    let bestNeighbor: {x: number, y: number} | null = null;
    let minDistToIdeal = Infinity;

    for (const d of dirs) {
        const nx = currentX + d.dx;
        const ny = currentY + d.dy;
        
        // Check strict validity for immediate move
        if (isValidTile(nx, ny, grid, width, height, reservedTiles, playerX, playerY, canOpenDoors)) {
            const dist = Math.abs(nx - idealDest.x) + Math.abs(ny - idealDest.y);
            if (dist < minDistToIdeal) {
                minDistToIdeal = dist;
                bestNeighbor = {x: nx, y: ny};
            }
        }
    }

    updateEnemyState({ currentPath: [] });
    return bestNeighbor;
};

export const findBestAttackPosition = (
    enemyPos: {x: number, y: number},
    playerPos: {x: number, y: number},
    attackRange: number,
    grid: Tile[][],
    width: number,
    height: number,
    enemyId: string,
    reservedTiles?: Set<string>
): Point | null => {
    // 1. Identify valid attack candidates
    const candidates: { x: number, y: number, distToEnemy: number }[] = [];
    
    // OPTIMIZATION: Limit scan range to avoid checking too many tiles
    const scanRange = Math.min(Math.ceil(attackRange), 8); 
    const px = Math.round(playerPos.x);
    const py = Math.round(playerPos.y);

    const minX = Math.max(0, px - scanRange);
    const maxX = Math.min(width - 1, px + scanRange);
    const minY = Math.max(0, py - scanRange);
    const maxY = Math.min(height - 1, py + scanRange);

    // OPTIMIZATION: Spiral out from player to find closest valid spots first?
    // For now, just simple iteration but with early exit if we have enough candidates
    
    const potentialSpots: { x: number, y: number, distToEnemy: number }[] = [];

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            // Skip player's own tile
            if (x === px && y === py) continue;

            const distToPlayerSq = (x - px)**2 + (y - py)**2;
            if (distToPlayerSq > (attackRange + 0.5)**2) continue;

            // Check if tile is walkable and not reserved
            if (!isValidTile(x, y, grid, width, height, reservedTiles, px, py)) {
                if (x !== enemyPos.x || y !== enemyPos.y) {
                    continue;
                }
            }

            const distToEnemy = Math.abs(x - enemyPos.x) + Math.abs(y - enemyPos.y);
            potentialSpots.push({ x, y, distToEnemy });
        }
    }

    // Sort by distance to enemy FIRST (we want the closest valid spot to move to)
    potentialSpots.sort((a, b) => a.distToEnemy - b.distToEnemy);

    // NOW check Line of Sight and Lane Alignment only for the best candidates
    for (const spot of potentialSpots) {
        if (isValidCombatPosition({x: spot.x, y: spot.y}, playerPos, grid, width, height, enemyId, attackRange)) {
            candidates.push(spot);
            // OPTIMIZATION: 2 good candidates is enough to pick from
            if (candidates.length >= 2) break; 
        }
    }

    if (candidates.length === 0) return null;

    return { x: candidates[0].x, y: candidates[0].y };
};
