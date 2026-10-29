
import { Tile, Enemy, CombatEnemyState, Player } from '../types';
import { getBresenhamLine } from './aimingLogic';

const easeInOutQuad = (t: number) => {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

// Helper to check if a specific tile is blocked by walls, closed doors, or other entities
// USED FOR MOVEMENT (Must remain strict)
export const isBlocked = (
    x: number, 
    y: number, 
    grid: Tile[][], 
    width: number, 
    height: number, 
    ignoreEnemyId?: string
): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return true;
    const tile = grid[y]?.[x];
    if (!tile) return true;
    
    // Windows block movement
    if (tile.type === 'WALL' && tile.blocking !== false) return true;
    if (tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN') return true;
    if (tile.decorations && tile.decorations.length > 0 ? tile.decorations.some((d: any) => d.blocking) : (tile.decoration && tile.decoration.blocking)) return true;
    if (tile.items && tile.items.some((i: any) => i.blocking)) return true;
    
    // Blocked by enemy (unless it's the one we are ignoring, i.e., ourselves moving)
    if (tile.enemyId && tile.enemyId !== ignoreEnemyId) return true;
    
    return false;
};

// Helper strictly for static geometry (Walls/Doors), ignoring entities AND DECORATIONS
// USED FOR SHOOTING/VISIBILITY LANES (Can shoot over decorations)
const isGeometryBlocked = (x: number, y: number, grid: Tile[][], w: number, h: number, allowWindows: boolean = true): boolean => {
    if (x < 0 || x >= w || y < 0 || y >= h) return true;
    const tile = grid[y][x];
    if (!tile) return true;
    
    // Windows block geometry UNLESS allowWindows is true
    if (tile.type === 'WALL' && tile.blocking !== false) {
         if (tile.isWindow && allowWindows) return false;
         
         let th = tile.height !== undefined ? tile.height : 1.0;
         if (th < 0 || th > 0.4) return true;
         return false;
    }
    if (tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN') {
        if (tile.door.maskId && allowWindows) return false;
        return true;
    }
    
    return false;
};

/**
 * Checks if the specific combat lane (Left, Center, Right) is blocked by walls.
 * Unlike generic LineOfSight, this strictly checks the column/row corresponding to the lane.
 */
export const isLaneBlocked = (
    playerPos: {x: number, y: number},
    enemyPos: {x: number, y: number},
    grid: Tile[][],
    width: number,
    height: number,
    lane: 'LEFT' | 'CENTER' | 'RIGHT',
    playerDir360: number
): boolean => {
    const pX = Math.floor(playerPos.x);
    const pY = Math.floor(playerPos.y);
    const eX = Math.floor(enemyPos.x);
    const eY = Math.floor(enemyPos.y);

    let dir = Math.round(playerDir360) % 4;
    if (dir < 0) dir += 4;
    
    const forwardVecs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const rightVecs =   [[1, 0], [0, 1], [-1, 0], [0, -1]];

    const fwd = forwardVecs[dir];
    const rgt = rightVecs[dir];

    let latOffset = 0;
    if (lane === 'LEFT') latOffset = -1;
    if (lane === 'RIGHT') latOffset = 1;

    const isCenterLane = (lane === 'CENTER');

    // 1. IMMEDIATE LATERAL CHECK (The "Blinders" check)
    if (latOffset !== 0) {
        const sideX = pX + rgt[0] * latOffset;
        const sideY = pY + rgt[1] * latOffset;
        
        if (isGeometryBlocked(sideX, sideY, grid, width, height, false)) return true;
    }

    // 2. Check the path forward along that lane
    const dx = eX - pX;
    const dy = eY - pY;
    
    // Dot product to get distance along forward vector
    const forwardDist = dx * fwd[0] + dy * fwd[1];
    const steps = Math.floor(forwardDist); 
    
    for (let i = 1; i <= steps; i++) {
        const tx = pX + rgt[0] * latOffset + fwd[0] * i;
        const ty = pY + rgt[1] * latOffset + fwd[1] * i;
        
        const isEnemyTile = (tx === eX && ty === eY);

        if (!isEnemyTile) {
            if (isGeometryBlocked(tx, ty, grid, width, height, isCenterLane)) return true;
            const tile = grid[ty]?.[tx];
            const isDecoBlocking = tile.decorations && tile.decorations.length > 0 ? tile.decorations.some((d: any) => d.blocking) : !!tile.decoration?.blocking;
            if (tile && isDecoBlocking) return true;
        }

        // 3. CENTRAL LANE CHECK (Corner Cutting prevention)
        if (latOffset !== 0) {
            const cx = pX + fwd[0] * i;
            const cy = pY + fwd[1] * i;
            
            if (isGeometryBlocked(cx, cy, grid, width, height, true)) return true;
        }
    }

    return false;
};

/**
 * Calculates sound occlusion based on number of walls/doors between source and listener.
 * Returns a multiplier. 1.0 = clear, < 1.0 = occluded.
 */
export const getSoundOcclusion = (
    start: {x: number, y: number}, 
    end: {x: number, y: number}, 
    grid: Tile[][], 
    width: number, 
    height: number
): number => {
    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let stepX = (x0 < x1) ? 1 : -1;
    let stepY = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let iterations = 0;
    const MAX_ITERATIONS = 100;
    let countWalls = 0;
    let countDoors = 0;

    while (true) {
        if (iterations++ > MAX_ITERATIONS) {
            break;
        }

        // Skip start tile (listener position), but evaluate all tiles along ray
        // including target tile if it is a wall or closed door
        if (x0 !== Math.floor(start.x) || y0 !== Math.floor(start.y)) {
            if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
                const t = grid[y0]?.[x0];
                if (t) {
                    if (t.type === 'WALL' && t.blocking !== false) {
                        let th = t.height !== undefined ? t.height : 1.0;
                        if (th < 0 || th > 0.4) countWalls++;
                    } else if (t.type === 'DOOR' && t.door?.state !== 'OPEN' && !t.door?.broken) {
                        countDoors++;
                    }
                }
            }
        }

        if (x0 === x1 && y0 === y1) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += stepX; }
        if (e2 < dx) { err += dx; y0 += stepY; }
    }

    // Combine occlusion
    // e.g. wall reduces volume to 20%. Two walls = 4%. Door = 35%.
    let occlusion = 1.0;
    for (let i = 0; i < countWalls; i++) occlusion *= 0.2;
    for (let i = 0; i < countDoors; i++) occlusion *= 0.35;

    return occlusion;
};

/**
 * Determines valid escape direction.
 * Returns:
 *  1: Escape Forward
 * -1: Escape Backward
 *  0: Escape Blocked
 */
export const getEscapeDirection = (
    player: Player,
    levelData: { grid: Tile[][], width: number, height: number } | null
): number => {
    if (!levelData) return 0;

    let d = Math.round(player.dir) % 4;
    if (d < 0) d += 4;

    // Direction vectors: 0=N(0,-1), 1=E(1,0), 2=S(0,1), 3=W(-1,0)
    const forwardVec = [[0, -1], [1, 0], [0, 1], [-1, 0]][d];
    
    // 1. Check Front
    const frontX = player.pos.x + forwardVec[0];
    const frontY = player.pos.y + forwardVec[1];
    
    if (!isBlocked(frontX, frontY, levelData.grid, levelData.width, levelData.height, "PLAYER")) {
        return 1;
    }

    // 2. Check Back (only if front is blocked)
    const backX = player.pos.x - forwardVec[0];
    const backY = player.pos.y - forwardVec[1];

    if (!isBlocked(backX, backY, levelData.grid, levelData.width, levelData.height, "PLAYER")) {
        return -1;
    }

    // 3. Both blocked
    return 0;
};

export const getIntersectingWindows = (
    start: {x: number, y: number}, 
    end: {x: number, y: number}, 
    grid: Tile[][], 
    width: number, 
    height: number
): {x: number, y: number}[] => {
    let x0 = Math.round(start.x);
    let y0 = Math.round(start.y);
    const x1 = Math.round(end.x);
    const y1 = Math.round(end.y);

    const windows: {x: number, y: number}[] = [];
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let stepX = (x0 < x1) ? 1 : -1;
    let stepY = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let iterations = 0;
    while (true) {
        if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
            const tile = grid[y0]?.[x0];
            const isDiagonalCloseToStart = Math.abs(x0 - Math.round(start.x)) === 1 && Math.abs(y0 - Math.round(start.y)) === 1;
            if (tile && !isDiagonalCloseToStart) {
                if (tile.isWindow && tile.canBeDestroyed !== false && !tile.isGlassBroken && tile.glassAssetId) {
                    windows.push({ x: x0, y: y0 });
                } else if (tile.type === 'DOOR' && tile.door && tile.door.maskId && !tile.door.broken && tile.door.state !== 'OPEN') {
                    windows.push({ x: x0, y: y0 });
                } else if (tile.mirror && tile.canBeDestroyed !== false && !tile.isMirrorBroken && tile.maskId) {
                    windows.push({ x: x0, y: y0 });
                }
            }
        }
        if (x0 === x1 && y0 === y1) break;
        if (iterations++ > 1000) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += stepX; }
        if (e2 < dx) { err += dx; y0 += stepY; }
    }
    return windows;
};

// Check if there is a clear shot between two points
let losCacheNum = new Map<number, boolean>();
let lastLOSGridRef: Tile[][] | null = null;
let lastResetTime = 0;

const stringIdToNumMap = new Map<string, number>();
let nextStringIdNum = 1;
const getStringIdNum = (id: string | undefined): number => {
    if (!id) return 0;
    if (id === 'PLAYER') return 1;
    let num = stringIdToNumMap.get(id);
    if (num === undefined) {
        if (nextStringIdNum > 120) {
            stringIdToNumMap.clear();
            stringIdToNumMap.set('PLAYER', 1);
            nextStringIdNum = 2;
        }
        num = nextStringIdNum++;
        stringIdToNumMap.set(id, num);
    }
    return num;
};

export const hasLineOfSight = (
    start: {x: number, y: number}, 
    end: {x: number, y: number}, 
    grid: Tile[][], 
    width: number, 
    height: number,
    ignoreId: string | undefined, 
    checkEnemies: boolean = true,
    ignoreDoors: boolean = false
): boolean => {
    const sx = Math.floor(start.x);
    const sy = Math.floor(start.y);
    const ex = Math.floor(end.x);
    const ey = Math.floor(end.y);

    const now = performance.now();
    // Clear cache if grid changed or periodically (e.g. every 150ms) to account for move/action animations
    if (grid !== lastLOSGridRef || now - lastResetTime > 150) {
        losCacheNum.clear();
        stringIdToNumMap.clear();
        stringIdToNumMap.set('PLAYER', 1);
        nextStringIdNum = 2;
        lastLOSGridRef = grid;
        lastResetTime = now;
    }

    const ignoreIdNum = getStringIdNum(ignoreId);

    if (sx >= 0 && sx < 2048 && sy >= 0 && sy < 2048 && ex >= 0 && ex < 2048 && ey >= 0 && ey < 2048 && ignoreIdNum < 128) {
        // Packing sx (11 bits), sy (11 bits), ex (11 bits), ey (11 bits), ignoreIdNum (7 bits), checkEnemies (1 bit), ignoreDoors (1 bit)
        // Max value is below 2^53 - 1, fitting into JS safe integer.
        const bitPart = ignoreIdNum + (checkEnemies ? 128 : 0) + (ignoreDoors ? 256 : 0);
        const keyNum = sx + 
                       sy * 2048 + 
                       ex * 4194304 + 
                       ey * 8589934592 + 
                       bitPart * 17592186044416;
        
        const cached = losCacheNum.get(keyNum);
        if (cached !== undefined) return cached;

        const result = _hasLineOfSight(start, end, grid, width, height, ignoreId, checkEnemies, ignoreDoors);
        losCacheNum.set(keyNum, result);
        return result;
    }

    return _hasLineOfSight(start, end, grid, width, height, ignoreId, checkEnemies, ignoreDoors);
};

const _hasLineOfSight = (
    start: {x: number, y: number}, 
    end: {x: number, y: number}, 
    grid: Tile[][], 
    width: number, 
    height: number,
    ignoreId: string | undefined, 
    checkEnemies: boolean = true,
    ignoreDoors: boolean = false
): boolean => {

    let x0 = Math.floor(start.x);
    let y0 = Math.floor(start.y);
    const x1 = Math.floor(end.x);
    const y1 = Math.floor(end.y);

    const sx = x0;
    const sy = y0;
    const ex = x1;
    const ey = y1;

    // Fast inline helper to check geometry blocking using tile reference directly
    const tIsVisionBlocking = (t: Tile | undefined) => {
        if (!t) return true;
        
        if (t.type === 'WALL' && !t.isWindow && t.blocking !== false) {
             const h = t.height !== undefined ? t.height : 1.0;
             if (h < 0 || h > 0.4) return true;
             return false;
        }

        if (!ignoreDoors && t.type === 'DOOR' && t.door && t.door.state !== 'OPEN') {
            if (t.door.maskId) return false;
            return true;
        }
        return false;
    };

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let stepX = (x0 < x1) ? 1 : -1;
    let stepY = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let iterations = 0;
    const MAX_ITERATIONS = 1000;

    let prevX = x0;
    let prevY = y0;

    while (true) {
        // 1. DIRECT TILE CHECK
        // Skip check for start and end tiles (entities are standing there)
        if (!((x0 === sx && y0 === sy) || (x0 === ex && y0 === ey))) {
             if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return false;
             
             const tile = grid[y0]?.[x0];
             if (!tile) return false; 
             
             if (tIsVisionBlocking(tile)) return false;
             
             // Optional: Check if entities block LoS (e.g. big enemies)
             if (checkEnemies && tile.enemyId && tile.enemyId !== ignoreId) {
                return false;
             }
        }

        // 2. CORNER CHECK (Diagonal Movement)
        // If moving diagonally, check the two adjacent "elbow" tiles.
        if (iterations > 0) {
            const diffX = x0 - prevX;
            const diffY = y0 - prevY;

            if (Math.abs(diffX) === 1 && Math.abs(diffY) === 1) {
                const t1 = grid[prevY]?.[prevX + diffX];
                const t2 = grid[prevY + diffY]?.[prevX];

                if (tIsVisionBlocking(t1) || tIsVisionBlocking(t2)) {
                    return false;
                }
            }
        }

        if (x0 === x1 && y0 === y1) break;

        prevX = x0;
        prevY = y0;

        iterations++;
        if (iterations > MAX_ITERATIONS) {
            console.warn("Bresenham infinite loop detected in hasLineOfSight", {x0, y0, x1, y1});
            break;
        }

        let e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += stepX;
        }
        if (e2 < dx) {
            err += dx;
            y0 += stepY;
        }
    }

    return true;
};

export const findEnemiesWithLineOfSight = (
    playerPos: { x: number, y: number },
    grid: Tile[][],
    width: number,
    height: number,
    maxRange: number = 20
): string[] => {
    const visibleIds: string[] = [];
    const enemies = getEnemyPositions(grid, width, height, playerPos, maxRange);
    
    for (const e of enemies) {
        if (e.id.startsWith('decor_') || e.id.startsWith('npc_')) continue;
        const distSq = (e.x - playerPos.x)**2 + (e.y - playerPos.y)**2;
        if (distSq <= maxRange * maxRange) {
            if (hasLineOfSight(playerPos, {x: e.x, y: e.y}, grid, width, height, "PLAYER", false)) {
                visibleIds.push(e.id);
            }
        }
    }
    return visibleIds;
};

export const getLaneAlignment = (
    entityPos: {x: number, y: number}, 
    playerPos: {x: number, y: number},
    playerDir360: number 
): 'LEFT' | 'CENTER' | 'RIGHT' | null => {
    const pX = Math.floor(playerPos.x) + 0.5;
    const pY = Math.floor(playerPos.y) + 0.5;
    const eX = Math.floor(entityPos.x) + 0.5;
    const eY = Math.floor(entityPos.y) + 0.5;

    const dx = eX - pX;
    const dy = eY - pY;

    let fdx, fdy, rdx, rdy;
    
    let dir = Math.round(playerDir360) % 4;
    if (dir < 0) dir += 4;

    if (dir === 0) { fdx = 0; fdy = -1; rdx = 1; rdy = 0; }
    else if (dir === 1) { fdx = 1; fdy = 0; rdx = 0; rdy = 1; }
    else if (dir === 2) { fdx = 0; fdy = 1; rdx = -1; rdy = 0; }
    else if (dir === 3) { fdx = -1; fdy = 0; rdx = 0; rdy = -1; }
    else {
        const angle = (playerDir360 - 1) * (Math.PI / 2);
        fdx = Math.cos(angle);
        fdy = Math.sin(angle);
        rdx = -fdy;
        rdy = fdx;
    }

    const forwardDist = dx * fdx + dy * fdy;
    const rightDist = dx * rdx + dy * rdy;

    if (forwardDist < 0.05) return null; 

    if (Math.abs(rightDist) <= 0.51) return 'CENTER';
    if (rightDist < -0.51 && rightDist >= -1.7) return 'LEFT';
    if (rightDist > 0.51 && rightDist <= 1.7) return 'RIGHT';

    return null;
};

let lastGridRef: Tile[][] | null = null;
let lastAllEnemyPositions: {id: string, x: number, y: number}[] = [];

// Helper to get all enemy positions from grid (optimized via global O(1)/O(N) positions cache)
export const getEnemyPositions = (
    grid: Tile[][], 
    width: number, 
    height: number, 
    centerPos?: {x: number, y: number}, 
    maxRange?: number
): {id: string, x: number, y: number}[] => {
    
    let positions: {id: string, x: number, y: number}[] = [];

    if (lastGridRef === grid) {
        positions = lastAllEnemyPositions;
    } else {
        const globalCache = typeof window !== 'undefined' ? (window as any).enemyPositionsCache : null;

        if (globalCache) {
            // High performance O(1)/O(N) retrieval from pre-built cache!
            globalCache.forEach((pos: {x: number, y: number}, id: string) => {
                const tile = grid[pos.y]?.[pos.x];
                if (tile && tile.enemyId === id) {
                    positions.push({ id, x: pos.x, y: pos.y });
                }
            });
        } else {
            // Fallback: scan the grid only if cache is empty or not yet initialized
            for(let y = 0; y < height; y++) {
                const row = grid[y];
                if (!row) continue;
                for(let x = 0; x < width; x++) {
                    const tile = row[x];
                    if (tile && tile.enemyId) {
                        positions.push({ id: tile.enemyId, x, y });
                    }
                }
            }
        }
        lastGridRef = grid;
        lastAllEnemyPositions = positions;
    }

    if (centerPos && maxRange !== undefined) {
        return positions.filter(e => {
            const dx = Math.abs(e.x - centerPos.x);
            const dy = Math.abs(e.y - centerPos.y);
            return dx <= maxRange && dy <= maxRange;
        });
    }

    return [...positions];
};

// New logic: Check if I am the closest enemy in my specific lane relative to the player
// This replaces raycasting for entity blocking
export const isClosestInLane = (
    myId: string,
    myPos: {x: number, y: number},
    playerPos: {x: number, y: number},
    grid: Tile[][],
    width: number,
    height: number,
    checkDir: number,
    precalcEnemies?: {id: string, x: number, y: number}[]
): boolean => {
    const myLane = getLaneAlignment(myPos, playerPos, checkDir);
    if (!myLane) return false;

    const pX = Math.floor(playerPos.x);
    const pY = Math.floor(playerPos.y);
    const mX = Math.floor(myPos.x);
    const mY = Math.floor(myPos.y);

    let dir = Math.round(checkDir) % 4;
    if (dir < 0) dir += 4;
    
    const forwardVecs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const rightVecs =   [[1, 0], [0, 1], [-1, 0], [0, -1]];

    const fwd = forwardVecs[dir];
    const rgt = rightVecs[dir];

    let latOffset = 0;
    if (myLane === 'LEFT') latOffset = -1;
    if (myLane === 'RIGHT') latOffset = 1;

    const dx = mX - pX;
    const dy = mY - pY;
    const forwardDist = dx * fwd[0] + dy * fwd[1];
    const steps = Math.floor(forwardDist); 
    
    const myDistSq = (mX - pX)**2 + (mY - pY)**2;

    // We walk from the player towards the enemy in their lane
    for (let i = 1; i <= steps; i++) {
        const tx = pX + rgt[0] * latOffset + fwd[0] * i;
        const ty = pY + rgt[1] * latOffset + fwd[1] * i;
        
        if (tx === mX && ty === mY) {
            continue;
        }

        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
            const tile = grid[ty][tx];
            if (tile && tile.enemyId && tile.enemyId !== myId) {
                const otherDistSq = (tx - pX)**2 + (ty - pY)**2;
                if (otherDistSq < myDistSq) {
                    return false;
                }
            }
        }
    }
    return true;
};

/**
 * Checks if the 3D line-of-sight between start and end
 * is blocked by intermediate floor heights, specifically for pit scenarios.
 * Custom precision sampling handles vertical precipice visibility accurately and symmetrically.
 */
export const hasPitLineOfSight = (
    start: { x: number, y: number },
    end: { x: number, y: number },
    grid: Tile[][],
    width: number,
    height: number,
    overrideZEnd?: number,
    overrideZStart?: number
): boolean => {
    const sx = Math.floor(start.x);
    const sy = Math.floor(start.y);
    const ex = Math.floor(end.x);
    const ey = Math.floor(end.y);

    const startTile = grid[sy]?.[sx];
    const endTile = grid[ey]?.[ex];

    const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;

    // Use normalized logical heights for robust calculation when height represents a pit,
    // since pit tiles are visually and structurally deep (logical height of -1.0) 
    // even if sector metadata defines them at a shallower fractional value (e.g. -0.1).
    const H_start = startTile && startTile.height !== undefined 
        ? (isPitTile(startTile) ? -1.0 : Math.max(0, startTile.height)) 
        : 0;
    const H_end = endTile && endTile.height !== undefined 
        ? (isPitTile(endTile) ? -1.0 : Math.max(0, endTile.height)) 
        : 0;

    const Z_start = overrideZStart !== undefined ? overrideZStart : (H_start + 0.5);
    const Z_end = overrideZEnd !== undefined ? overrideZEnd : (H_end + 0.8); // Высота проверки для врага опущена на 20% вниз от макушки (1.0 - 0.2 = 0.8), для игрока оставлена 0.5. / Verification height for enemy is lowered 20% from top (1.0 - 0.2 = 0.8), for player kept at 0.5.

    // Use exact tile center for robust and symmetric raycast checks across all systems
    const targetX = ex + 0.5;
    const targetY = ey + 0.5;

    const dx = targetX - start.x;
    const dy = targetY - start.y;
    const dist2D = Math.sqrt(dx * dx + dy * dy);

    if (dist2D < 0.1) return true;

    const stepSize = 0.05;
    const steps = Math.ceil(dist2D / stepSize);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = start.x + t * dx;
        const py = start.y + t * dy;

        const tx = Math.floor(px);
        const ty = Math.floor(py);

        if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
            continue;
        }

        const distFromStart = t * dist2D;
        const distFromEnd = (1 - t) * dist2D;

        // Skip checks extremely close to the start/end centers to prevent self-collision
        if (distFromStart < 0.15 || distFromEnd < 0.15) {
            continue;
        }

        const tile = grid[ty]?.[tx];
        if (!tile) continue;

        const H_tile = tile.height !== undefined 
            ? (isPitTile(tile) ? -1.0 : Math.max(0, tile.height)) 
            : 0;
        const Z_ray = Z_start + t * (Z_end - Z_start);

        const diff = Math.abs(H_start - H_end);

        if (diff > 0.5) {
            const H_max = Math.max(H_start, H_end);
            if (H_tile >= H_max - 0.1) {
                // If the tile is near the upper elevation of the transition,
                // we require a clean clearance to clear the pit lip/cliff edge.
                const clearance = 0.12; 
                if (Z_ray < H_tile + clearance) {
                    return false;
                }
                continue;
            }
        }

        // Default blocking check against the tile's floor height
        if (Z_ray < H_tile + 0.02) {
            return false;
        }
    }

    return true;
};

export const isValidCombatPosition = (
    pos: {x: number, y: number},
    playerPos: {x: number, y: number},
    grid: Tile[][],
    width: number,
    height: number,
    enemyId: string,
    range: number,
    precalcEnemies?: {id: string, x: number, y: number}[]
): boolean => {
    if (range <= 0) return false;

    const distSq = (pos.x - playerPos.x)**2 + (pos.y - playerPos.y)**2;
    // Standardize distance threshold
    const effectiveRange = range <= 1 ? 1.55 : range + 0.5;
    
    if (distSq > effectiveRange * effectiveRange) return false;

    // Pit check for melee range (range is 1, in-place or adjacent, and either tiles is a pit)
    if (range <= 1) {
        const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
        const ex = Math.floor(pos.x);
        const ey = Math.floor(pos.y);
        const px = Math.floor(playerPos.x);
        const py = Math.floor(playerPos.y);
        const isAdjacent = Math.abs(ex - px) <= 1 && Math.abs(ey - py) <= 1;
        if (isAdjacent) {
            const tile1 = grid[ey]?.[ex];
            const tile2 = grid[py]?.[px];
            if (isPitTile(tile1) !== isPitTile(tile2)) {
                return false;
            }
        }
    }

    // Pit check for ranged range (range > 1, when they or player are in a pit)
    if (range > 1) {
        const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
        const ex = Math.floor(pos.x);
        const ey = Math.floor(pos.y);
        const px = Math.floor(playerPos.x);
        const py = Math.floor(playerPos.y);
        const tile1 = grid[ey]?.[ex];
        const tile2 = grid[py]?.[px];
        if (tile1 && tile2) {
            if (isPitTile(tile1) || isPitTile(tile2)) {
                if (!hasPitLineOfSight(playerPos, pos, grid, width, height)) {
                    return false;
                }
            }
        }
    }

    // Check if position is valid in ANY of the 4 cardinal directions
    // AND if it is not blocked by another ally in that same direction
    let isValidLaneAndClear = false;

    // Optimization: Only check the direction that faces the player?
    // No, enemies can turn. But we can prioritize the direction facing the player.
    
    for(let d=0; d<4; d++) {
        const lane = getLaneAlignment(pos, playerPos, d);
        if (lane) {
            // 1. Check if map geometry blocks this specific lane
            // Pass 'd' as direction to ensure alignment logic matches
            if (isLaneBlocked(playerPos, pos, grid, width, height, lane, d)) {
                continue;
            }

            // 2. Found a valid lane slot geometry-wise. Now check entity occlusion.
            if (isClosestInLane(enemyId, pos, playerPos, grid, width, height, d, precalcEnemies)) {
                isValidLaneAndClear = true;
                break;
            }
        }
    }

    if (!isValidLaneAndClear) return false;

    return true;
};

export const calculateNextEnemyMove = (
    enemy: Enemy,
    enemyPos: { x: number, y: number },
    playerPos: { x: number, y: number },
    grid: Tile[][],
    width: number,
    height: number,
    precalcEnemies?: {id: string, x: number, y: number}[]
): { x: number, y: number }[] | null => {
    
    const range = enemy.attackRange !== undefined ? enemy.attackRange : 1; 

    // Pre-calculate enemy positions ONCE for the entire pathfinding session
    // Use provided list if available, otherwise scan grid within 25 tiles
    const allEnemies = precalcEnemies || getEnemyPositions(grid, width, height, playerPos, 25);

    // If already in a valid position (Lane + Dist + LoS + NotBlockedByAlly), don't move.
    if (isValidCombatPosition(enemyPos, playerPos, grid, width, height, enemy.id, range, allEnemies)) {
        return null;
    }

    interface BFSNode { x: number; y: number; parent: BFSNode | null; dist: number; }

    const performBFS = (ignoreEnemies: boolean): {x: number, y: number}[] | null => {
        const queue: BFSNode[] = [];
        let head = 0;
        const visited = new Set<string>();
        
        queue.push({ x: enemyPos.x, y: enemyPos.y, parent: null, dist: 0 });
        visited.add(`${enemyPos.x},${enemyPos.y}`);

        let bestFallbackNode: BFSNode | null = null;
        let bestFallbackDistToPlayer = Infinity;

        const directions = [
            { dx: 0, dy: -1 }, 
            { dx: 1, dy: 0 },  
            { dx: 0, dy: 1 },  
            { dx: -1, dy: 0 }, 
        ];
        for (let i = directions.length - 1; i > 0; i--) { 
            const j = Math.floor(Math.random() * (i + 1)); 
            [directions[i], directions[j]] = [directions[j], directions[i]]; 
        }

        const MAX_ITERATIONS = 300; 
        let iterations = 0;
        
        let validCandidates: BFSNode[] = [];
        let currentDepth = 0;

        while (head < queue.length && iterations < MAX_ITERATIONS) {
            const current = queue[head++];
            iterations++;

            if (current.dist > 10) continue; 
            
            if (current.dist > currentDepth) {
                if (validCandidates.length > 0) {
                    break; // Processed all nodes at the previous depth, and found valid ones!
                }
                currentDepth = current.dist;
            }

            if (current.dist > 0) {
                if (isValidCombatPosition(current, playerPos, grid, width, height, enemy.id, range, allEnemies)) {
                    if (!ignoreEnemies || (!isBlocked(current.x, current.y, grid, width, height, enemy.id) && !(current.x === Math.round(playerPos.x) && current.y === Math.round(playerPos.y)))) {
                        validCandidates.push(current);
                    }
                }

                const dToPlayer = Math.abs(current.x - playerPos.x) + Math.abs(current.y - playerPos.y);
                if (dToPlayer < bestFallbackDistToPlayer) {
                    if (!ignoreEnemies || (!isBlocked(current.x, current.y, grid, width, height, enemy.id) && !(current.x === Math.round(playerPos.x) && current.y === Math.round(playerPos.y)))) {
                        bestFallbackDistToPlayer = dToPlayer;
                        bestFallbackNode = current;
                    }
                }
            }

            for (const dir of directions) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;
                const key = `${nx},${ny}`;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                if (visited.has(key)) continue;

                const tile = grid[ny]?.[nx];
                if (!tile) continue;
                const isDecoBlocking = tile.decorations && tile.decorations.length > 0 ? tile.decorations.some((d: any) => d.blocking) : !!tile.decoration?.blocking;
                if ((tile.type === 'WALL' && tile.blocking !== false) || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN') || isDecoBlocking || (tile.items && tile.items.some((i: any) => i.blocking))) {
                    continue;
                }

                if (!ignoreEnemies) {
                    if (tile.enemyId && tile.enemyId !== enemy.id) continue;
                    if (nx === Math.round(playerPos.x) && ny === Math.round(playerPos.y)) continue;
                }

                visited.add(key);
                queue.push({ x: nx, y: ny, parent: current, dist: current.dist + 1 });
            }
        }
        
        if (validCandidates.length > 0) {
            // Find the candidate closest to the player
            validCandidates.sort((a, b) => {
                const distA = Math.abs(a.x - playerPos.x) + Math.abs(a.y - playerPos.y);
                const distB = Math.abs(b.x - playerPos.x) + Math.abs(b.y - playerPos.y);
                return distA - distB;
            });
            const best = validCandidates[0];
            const path: {x: number, y: number}[] = [];
            let curr: BFSNode | null = best;
            while (curr && curr.parent) {
                path.push({x: curr.x, y: curr.y});
                curr = curr.parent;
            }
            return path.reverse();
        }

        return null;
    };

    // 1. Try strict BFS (Respects friends as obstacles)
    let path = performBFS(false);

    // 2. If it fails, try Ghost BFS (Walk through friends to find a valid spot)
    if (!path || path.length === 0) {
        path = performBFS(true);
        // We can only return a ghost path if the IMMEDIATELY NEXT step is physically empty
        if (path && path.length > 0) {
            const firstStep = path[0];
            if (isBlocked(firstStep.x, firstStep.y, grid, width, height, enemy.id) || (firstStep.x === Math.round(playerPos.x) && firstStep.y === Math.round(playerPos.y))) {
                path = null; 
            }
        }
    }

    return path;
};

let lastDecorationsGridRef: Tile[][] | null = null;
let lastAllDestructibleDecorations: {id: string, x: number, y: number}[] = [];

export const getVisibleDestructibleDecorations = (
    playerPos: { x: number, y: number },
    grid: Tile[][],
    width: number,
    height: number,
    maxRange: number = 20
): { id: string, x: number, y: number }[] => {
    const visible: { id: string, x: number, y: number }[] = [];
    
    let allDecorations = lastAllDestructibleDecorations;

    const isCacheValid = lastDecorationsGridRef === grid;

    if (!isCacheValid) {
        const positions: {id: string, x: number, y: number}[] = [];
        for(let y = 0; y < height; y++) {
            const row = grid[y];
            if (!row) continue;
            for(let x = 0; x < width; x++) {
                const tile = row[x];
                if (tile && tile.decoration && tile.decoration.destructable) {
                    positions.push({ id: `decor_${x}_${y}`, x, y });
                }
            }
        }
        lastDecorationsGridRef = grid;
        lastAllDestructibleDecorations = positions;
        allDecorations = positions;
    }

    for (const d of allDecorations) {
        const dx = Math.abs(d.x - playerPos.x);
        const dy = Math.abs(d.y - playerPos.y);
        if (dx <= maxRange && dy <= maxRange) {
            const distSq = dx*dx + dy*dy;
            if (distSq <= maxRange * maxRange) {
                if (hasLineOfSight(playerPos, {x: d.x, y: d.y}, grid, width, height, "PLAYER", false)) {
                    visible.push(d);
                }
            }
        }
    }
    return visible;
};

export const getVisibleNPCs = (
    playerPos: { x: number, y: number },
    grid: Tile[][],
    width: number,
    height: number,
    maxRange: number = 20
): { id: string, x: number, y: number }[] => {
    const visible: { id: string, x: number, y: number }[] = [];
    const enemies = getEnemyPositions(grid, width, height, playerPos, maxRange);
    
    for (const e of enemies) {
        if (e.id.startsWith('npc_')) {
            const distSq = (e.x - playerPos.x)**2 + (e.y - playerPos.y)**2;
            if (distSq <= maxRange * maxRange) {
                if (hasLineOfSight(playerPos, {x: e.x, y: e.y}, grid, width, height, "PLAYER", false)) {
                    visible.push({ id: e.id, x: e.x, y: e.y });
                }
            }
        }
    }
    return visible;
};

export const getVisibleNPCsToGroup = (
    playerPos: { x: number, y: number },
    activeGroup: { id: string }[],
    enemies: Map<string, Enemy>,
    grid: Tile[][],
    width: number,
    height: number,
    maxRange: number = 20
): { id: string, x: number, y: number }[] => {
    const visible: { id: string, x: number, y: number }[] = [];
    const allEntities = getEnemyPositions(grid, width, height);
    
    // Candidates are all non-decor entities that are not in the active combat group yet, and are still alive
    const candidates = allEntities.filter(e => {
        if (e.id.startsWith('decor_')) return false;
        // Check if already in active group
        if (activeGroup.some(g => g.id === e.id)) return false;
        // Check if alive in enemies Map
        const ent = enemies.get(e.id);
        if (ent && ent.hp !== undefined && ent.hp <= 0) return false;
        return true;
    });

    if (candidates.length === 0) return [];

    for (const cand of candidates) {
        // Checking distance and LOC to player first
        const distSqToPlayer = (cand.x - playerPos.x) ** 2 + (cand.y - playerPos.y) ** 2;
        if (distSqToPlayer <= maxRange * maxRange) {
            if (hasLineOfSight(playerPos, { x: cand.x, y: cand.y }, grid, width, height, "PLAYER", false)) {
                let inPitChecked = true;
                const pTileX = Math.floor(playerPos.x);
                const pTileY = Math.floor(playerPos.y);
                const playerTile = grid[pTileY]?.[pTileX];
                const candTile = grid[cand.y]?.[cand.x];
                const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
                if (isPitTile(playerTile) || isPitTile(candTile)) {
                    if (!hasPitLineOfSight(playerPos, { x: cand.x, y: cand.y }, grid, width, height)) {
                        inPitChecked = false;
                    }
                }
                if (inPitChecked) {
                    visible.push({ id: cand.id, x: cand.x, y: cand.y });
                }
            }
        }
    }

    return visible;
};

export const getVisibleCombatEnemies = (
    activeGroup: CombatEnemyState[],
    enemies: Map<string, Enemy>,
    grid: Tile[][],
    width: number,
    height: number,
    playerPos: { x: number, y: number },
    playerDir360: number, 
    spriteMap: Map<string, HTMLImageElement>,
    enemyMoveAnim?: {id: string, startX: number, startY: number, endX: number, endY: number, startTime: number} | null,
    lightMap?: {r:number, g:number, b:number}[][],
    decorationsDb?: any
): any[] => {
      
      // Pre-calculate enemy positions ONCE (optimized to 25 tiles around player)
      const allEnemies = getEnemyPositions(grid, width, height, playerPos, 25);

      // Add decorations to allEnemies for blocking calculations
      activeGroup.forEach(g => {
          if (g.id.startsWith('decor_')) {
              const parts = g.id.split('_');
              const x = parseInt(parts[1]);
              const y = parseInt(parts[2]);
              if (!isNaN(x) && !isNaN(y)) {
                  allEnemies.push({ id: g.id, x, y });
              }
          }
      });

      // Create a map for faster lookup
      const enemyPosMap = new Map<string, {x: number, y: number}>();
      allEnemies.forEach(e => enemyPosMap.set(e.id, e));

      const visible = activeGroup.map(g => {
          let e: any = enemies.get(g.id);
          let isDecoration = false;
          let enemyX = 0, enemyY = 0;

          if (!e && g.id.startsWith('decor_')) {
              const parts = g.id.split('_');
              const dx = parseInt(parts[1]);
              const dy = parseInt(parts[2]);
              const tile = grid[dy]?.[dx];
              if (tile && tile.decoration && tile.decoration.destructable) {
                  const defId = (tile.decoration as any).type || tile.decoration.id;
                  const def = decorationsDb ? decorationsDb[defId] : null;
                  const maxHp = tile.decoration.maxHp || def?.hp || tile.decoration.hp || 10;
                  
                  e = {
                      id: g.id,
                      name: tile.decoration.name,
                      hp: tile.decoration.hp || 1,
                      maxHp: maxHp,
                      assets: {
                          map: { assetId: tile.decoration.assetId, scale: 1.0 },
                          portrait: { assetId: tile.decoration.assetId, scale: 1.0 },
                          attackPortrait: { assetId: tile.decoration.assetId, scale: 1.0 }
                      },
                      attackRange: 0,
                      accuracy: 0,
                      damageDice: "0d0",
                      baseXP: 0,
                      alignment: 'CENTER', // Default
                      isDecoration: true
                  };
                  enemyX = dx + 0.5;
                  enemyY = dy + 0.5;
                  isDecoration = true;
              }
          }

          if (!e) return null;

          let found = false;

          if (!isDecoration) {
              if (enemyMoveAnim && enemyMoveAnim.id === g.id) {
                 // Use the final destination coordinate for UI and logical checks 
                 // so the combat overlay updates distance and alignment immediately.
                 enemyX = enemyMoveAnim.endX + 0.5;
                 enemyY = enemyMoveAnim.endY + 0.5;
                 found = true;
              }

              if (!found) {
                  // Optimization: Use Map lookup instead of array find
                  const pos = enemyPosMap.get(g.id);
                  if (pos) {
                      enemyX = pos.x + 0.5;
                      enemyY = pos.y + 0.5;
                      found = true;
                  }
              }
              if (!found) return null;
          }

          if (!hasLineOfSight(playerPos, {x: enemyX, y: enemyY}, grid, width, height, "PLAYER", false)) {
              return null;
          }

          // Pit/Height line of sight check for all non-decorations when either is in a pit
          if (!isDecoration) {
              const pTileX = Math.floor(playerPos.x);
              const pTileY = Math.floor(playerPos.y);
              const playerTile = grid[pTileY]?.[pTileX];
              
              const eTileX = Math.floor(enemyX);
              const eTileY = Math.floor(enemyY);
              const enemyTile = grid[eTileY]?.[eTileX];

              const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
              const playerInPit = isPitTile(playerTile);
              const enemyInPit = isPitTile(enemyTile);

              if (playerInPit || enemyInPit) {
                  if (!hasPitLineOfSight(playerPos, {x: enemyX, y: enemyY}, grid, width, height)) {
                      return null;
                  }
              }
          }

          const playerCenterX = Math.floor(playerPos.x) + 0.5;
          const playerCenterY = Math.floor(playerPos.y) + 0.5;
          const distance = Math.sqrt((enemyX - playerCenterX)**2 + (enemyY - playerCenterY)**2);
          const dynamicAlignment = getLaneAlignment({x: enemyX, y: enemyY}, playerPos, playerDir360);
          
          if (!dynamicAlignment) return null;

          // STRICT CHECK: Is the lane physically blocked by a wall or door?
          if (isLaneBlocked(playerPos, {x: enemyX, y: enemyY}, grid, width, height, dynamicAlignment, playerDir360)) {
              return null;
          }

          // STRICT ENTITY OCCLUSION CHECK
          // Ensure that even if I am in the active combat group, I am not being blocked by another enemy in front of me.
          if (!isClosestInLane(g.id, {x: enemyX, y: enemyY}, playerPos, grid, width, height, playerDir360, allEnemies)) {
              return null;
          }

          // Calculate Brightness based on Tile
          let brightness = 1.0;
          const tx = Math.floor(enemyX);
          const ty = Math.floor(enemyY);
          if (lightMap && lightMap[ty] && lightMap[ty][tx]) {
              const l = lightMap[ty][tx];
              brightness = (l.r + l.g + l.b) / 3;
          }

          const mapAssetId = e.assets?.map?.assetId || (typeof e.assets?.map === 'string' ? e.assets.map : undefined);
          const mapImage = mapAssetId ? spriteMap.get(mapAssetId) : undefined;
          
          let portrait = mapImage;
          let attackPortrait = mapImage;

          if (!isDecoration) {
              const portraitKey = `${e.id}_PORTRAIT`;
              portrait = spriteMap.get(portraitKey) || mapImage;
              
              const attackKey = `${e.id}_ATTACK_PORTRAIT`;
              attackPortrait = spriteMap.get(attackKey) || portrait;
          }

          const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
          const playerTile = grid[Math.floor(playerPos.y)]?.[Math.floor(playerPos.x)];
          const enemyTile = grid[ty]?.[tx];
          const isAdjacent = Math.abs(tx - Math.floor(playerPos.x)) <= 1 && Math.abs(ty - Math.floor(playerPos.y)) <= 1;
          const isBlockedByPit = (isPitTile(playerTile) !== isPitTile(enemyTile)) && isAdjacent;

          return { 
              ...e, 
              alignment: dynamicAlignment, 
              image: mapImage, 
              portrait, 
              attackPortrait,
              distance,
              brightness,
              isBlockedByPit
          };
      }).filter((e): e is any => e !== null);

      return visible.sort((a, b) => (a.distance || 0) - (b.distance || 0));
};

export const getVisibleCombatEnemiesLightweight = (
    activeGroup: CombatEnemyState[],
    enemies: Map<string, Enemy>,
    grid: Tile[][],
    width: number,
    height: number,
    playerPos: { x: number, y: number },
    playerDir360: number, 
    enemyMoveAnim?: {id: string, startX: number, startY: number, endX: number, endY: number, startTime: number} | null
): any[] => {
      const allEnemies = [...getEnemyPositions(grid, width, height, playerPos, 25)];

      const enemyPosMap = new Map<string, {x: number, y: number}>();
      allEnemies.forEach(e => enemyPosMap.set(e.id, e));

      const visible = activeGroup.map(g => {
          if (g.id.startsWith('decor_')) return null; // Lightweight: completely skip decorations
          
          let e: any = enemies.get(g.id);
          if (!e || e.hp <= 0 || e.isNPC) return null; // Lightweight: skip dead, NPCs or missing enemies

          let enemyX = 0, enemyY = 0;
          let found = false;

          if (enemyMoveAnim && enemyMoveAnim.id === g.id) {
             enemyX = enemyMoveAnim.endX + 0.5;
             enemyY = enemyMoveAnim.endY + 0.5;
             found = true;
          }

          if (!found) {
              const pos = enemyPosMap.get(g.id);
              if (pos) {
                  enemyX = pos.x + 0.5;
                  enemyY = pos.y + 0.5;
                  found = true;
              }
          }
          if (!found) return null;

          if (!hasLineOfSight(playerPos, {x: enemyX, y: enemyY}, grid, width, height, "PLAYER", false)) {
              return null;
          }

          const pTileX = Math.floor(playerPos.x);
          const pTileY = Math.floor(playerPos.y);
          const playerTile = grid[pTileY]?.[pTileX];
          
          const eTileX = Math.floor(enemyX);
          const eTileY = Math.floor(enemyY);
          const enemyTile = grid[eTileY]?.[eTileX];

          const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
          if (isPitTile(playerTile) || isPitTile(enemyTile)) {
              if (!hasPitLineOfSight(playerPos, {x: enemyX, y: enemyY}, grid, width, height)) {
                  return null;
              }
          }

          const playerCenterX = Math.floor(playerPos.x) + 0.5;
          const playerCenterY = Math.floor(playerPos.y) + 0.5;
          const distance = Math.sqrt((enemyX - playerCenterX)**2 + (enemyY - playerCenterY)**2);
          const dynamicAlignment = getLaneAlignment({x: enemyX, y: enemyY}, playerPos, playerDir360);
          
          if (!dynamicAlignment) return null;

          if (isLaneBlocked(playerPos, {x: enemyX, y: enemyY}, grid, width, height, dynamicAlignment, playerDir360)) {
              return null;
          }

          if (!isClosestInLane(g.id, {x: enemyX, y: enemyY}, playerPos, grid, width, height, playerDir360, allEnemies)) {
              return null;
          }

          const isAdjacent = Math.abs(eTileX - pTileX) <= 1 && Math.abs(eTileY - pTileY) <= 1;
          const isBlockedByPit = (isPitTile(playerTile) !== isPitTile(enemyTile)) && isAdjacent;

          return { 
              id: g.id, 
              hp: e.hp,
              alignment: dynamicAlignment, 
              distance,
              isBlockedByPit
          };
      }).filter((e): e is any => e !== null);

      return visible.sort((a, b) => (a.distance || 0) - (b.distance || 0));
};

