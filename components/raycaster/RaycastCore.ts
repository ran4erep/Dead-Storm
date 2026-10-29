
import { Tile } from '../../types';
import { calculateHingeIntersection, calculateSlideIntersection } from './DoorUtils';
import { invalidateLightingSolidMapCache } from './Lighting';
import { PassThroughDoor, PassThroughWall } from './RaycasterTypes';
import { isFogWeather } from './DepthEffect';

const doorPool: PassThroughDoor[] = [];
let doorPoolIndex = 0;

const wallPool: PassThroughWall[] = [];
let wallPoolIndex = 0;

// Flat pre-allocated arrays for zero-allocation occlusion tracking
const MAX_INTERVALS = 64;
const visibleIntervalsA = new Int16Array(MAX_INTERVALS * 2);
const visibleIntervalsB = new Int16Array(MAX_INTERVALS * 2);
const occupiedIntervals = new Int16Array(MAX_INTERVALS * 2);

function getFloorLevel(tile: Tile | undefined): number {
    if (!tile) return 0;
    if (tile.type === 'FLOOR' && tile.height !== undefined) {
        return tile.height;
    }
    return 0;
}

let cachedWidth = 0;
let cameraXCache = new Float32Array(2048);
let rayDirXCache = new Float32Array(2048);
let rayDirYCache = new Float32Array(2048);
let cachedDirX = 0, cachedDirY = 0, cachedPlaneX = 0, cachedPlaneY = 0;

export function resolveTileCutoutAxis(tile: any, mapX: number, mapY: number, grid: any[][], mapWidth: number, mapHeight: number): 'NS' | 'WE' {
    const rawAxis = tile.cutoutAxis ? tile.cutoutAxis.toString().toUpperCase() : 'NS';
    if (rawAxis !== 'AUTO') {
        return rawAxis === 'WE' ? 'WE' : 'NS';
    }

    const isWall = (tx: number, ty: number): boolean => {
        if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) return false;
        const t = grid[ty][tx];
        return !!t && (t.type === 'WALL' || !!t.isWindow || t.type === 'DOOR');
    };

    const hasWest = isWall(mapX - 1, mapY);
    const hasEast = isWall(mapX + 1, mapY);
    const hasNorth = isWall(mapX, mapY - 1);
    const hasSouth = isWall(mapX, mapY + 1);

    const horizontalCount = (hasWest ? 1 : 0) + (hasEast ? 1 : 0);
    const verticalCount = (hasNorth ? 1 : 0) + (hasSouth ? 1 : 0);

    if (horizontalCount > verticalCount) {
        return 'NS';
    }
    if (verticalCount > horizontalCount) {
        return 'WE';
    }

    const isStableNS = ((mapX * 17) + (mapY * 31)) % 2 === 0;
    return isStableNS ? 'NS' : 'WE';
}

// --- SPACE SKIPPING (DYNAMIC DISTANCE FIELD DEEP RENDER OPTIMIZATION) ---

export interface PrecalculatedUpperLayer {
    layerIndex: number;
    type: 'WALL' | 'FLOOR';
    isWindow: boolean;
    elev: number;
    h: number;
    topZ: number;
    bottomZ: number;
    // Окна
    thickness?: number;
    offsetVal?: number;
    cutoutAxis?: 'NS' | 'WE';
    cLeft?: number;
    cRight?: number;
    cutoutTop?: number;
    cutoutBottom?: number;
    cutoutLeft?: number;
    cutoutRight?: number;
    glassTransparency?: number;
    glassOffset?: number;
    glassAssetId?: string;
    isGlassBroken?: boolean;
    // Границы AABB
    b1MinX?: number; b1MaxX?: number; b1MinY?: number; b1MaxY?: number;
    b2MinX?: number; b2MaxX?: number; b2MinY?: number; b2MaxY?: number;
    holeMinX?: number; holeMaxX?: number; holeMinY?: number; holeMaxY?: number;
}

export interface PrecalculatedSolidLayer {
    layerIndex: number;
    absTopZ: number;
    absBotZ: number;
}

// --- GEOMETRY LAYER CACHE (for upper floors) ---
let upperGeometryLayersCache = new WeakMap<Tile[][], PrecalculatedUpperLayer[][][]>();

export const getUpperGeometryLayersCache = (grid: Tile[][], grids: Tile[][][]): PrecalculatedUpperLayer[][][] => {
    if (upperGeometryLayersCache.has(grid)) {
        return upperGeometryLayersCache.get(grid)!;
    }

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];

    const cache: PrecalculatedUpperLayer[][][] = new Array(mapHeight);

    for (let y = 0; y < mapHeight; y++) {
        cache[y] = new Array(mapWidth);
        for (let x = 0; x < mapWidth; x++) {
            const layers: PrecalculatedUpperLayer[] = [];
            if (activeGrids.length > 1) {
                for (let l = 1; l < activeGrids.length; l++) {
                    const upperTile = activeGrids[l]?.[y]?.[x];
                    if (upperTile && (upperTile.type === 'WALL' || upperTile.type === 'FLOOR')) {
                        let elev = upperTile.elevation !== undefined ? upperTile.elevation : 0;
                        let h = upperTile.height !== undefined ? Math.abs(upperTile.height) : (upperTile.type === 'WALL' ? 1.0 : 0.0);
                        if (upperTile.height !== undefined && upperTile.height < 0) {
                            if (upperTile.type !== 'FLOOR') {
                                elev = 1.0 - h;
                            } else {
                                h = 0;
                            }
                        }
                        
                        const isWindow = upperTile.type === 'WALL' && !!upperTile.isWindow;
                        const topZ = elev + h;
                        const bottomZ = elev;

                        const layerObj: PrecalculatedUpperLayer = {
                            layerIndex: l,
                            type: upperTile.type,
                            isWindow,
                            elev,
                            h,
                            topZ,
                            bottomZ
                        };

                        if (isWindow) {
                            const thickness = upperTile.thickness !== undefined ? upperTile.thickness : 1.0;
                            const offsetVal = upperTile.offset !== undefined ? upperTile.offset : 0.0;
                            const cutoutAxis = resolveTileCutoutAxis(upperTile, x, y, activeGrids[l], mapWidth, mapHeight);
                            const cLeft = upperTile.cutout ? upperTile.cutout.topLeft.x : 0.25;
                            const cRight = upperTile.cutout ? upperTile.cutout.bottomRight.x : 0.75;
                            
                            layerObj.thickness = thickness;
                            layerObj.offsetVal = offsetVal;
                            layerObj.cutoutAxis = cutoutAxis;
                            layerObj.cLeft = cLeft;
                            layerObj.cRight = cRight;
                            layerObj.cutoutTop = upperTile.cutout ? upperTile.cutout.topLeft.y : 0.25;
                            layerObj.cutoutBottom = upperTile.cutout ? upperTile.cutout.bottomRight.y : 0.75;
                            layerObj.cutoutLeft = upperTile.cutout ? upperTile.cutout.topLeft.x : 0.25;
                            layerObj.cutoutRight = upperTile.cutout ? upperTile.cutout.bottomRight.x : 0.75;
                            layerObj.glassTransparency = (upperTile.glassAssetId && !upperTile.isGlassBroken) ? (upperTile.glassTransparency !== undefined ? upperTile.glassTransparency : 0.5) : 0.0;
                            layerObj.glassOffset = upperTile.glassOffset !== undefined ? upperTile.glassOffset : 0.5;
                            layerObj.glassAssetId = upperTile.glassAssetId;
                            layerObj.isGlassBroken = upperTile.isGlassBroken;

                            // Предрассчитываем AABB границы
                            let wMinX = x, wMaxX = x + 1.0;
                            let wMinY = y, wMaxY = y + 1.0;
                            
                            if (cutoutAxis === 'NS') {
                                wMinY = y + offsetVal * (1.0 - thickness);
                                wMaxY = wMinY + thickness;
                            } else {
                                wMinX = x + offsetVal * (1.0 - thickness);
                                wMaxX = wMinX + thickness;
                            }
                            
                            let b1MinX = wMinX, b1MaxX = wMaxX, b1MinY = wMinY, b1MaxY = wMaxY;
                            let b2MinX = wMinX, b2MaxX = wMaxX, b2MinY = wMinY, b2MaxY = wMaxY;
                            let holeMinX = wMinX, holeMaxX = wMaxX, holeMinY = wMinY, holeMaxY = wMaxY;

                            if (cutoutAxis === 'NS') {
                                b1MaxX = x + cLeft;
                                b2MinX = x + cRight;
                                holeMinX = x + cLeft;
                                holeMaxX = x + cRight;
                            } else {
                                b1MaxY = y + cLeft;
                                b2MinY = y + cRight;
                                holeMinY = y + cLeft;
                                holeMaxY = y + cRight;
                            }

                            layerObj.b1MinX = b1MinX;
                            layerObj.b1MaxX = b1MaxX;
                            layerObj.b1MinY = b1MinY;
                            layerObj.b1MaxY = b1MaxY;
                            
                            layerObj.b2MinX = b2MinX;
                            layerObj.b2MaxX = b2MaxX;
                            layerObj.b2MinY = b2MinY;
                            layerObj.b2MaxY = b2MaxY;
                            
                            layerObj.holeMinX = holeMinX;
                            layerObj.holeMaxX = holeMaxX;
                            layerObj.holeMinY = holeMinY;
                            layerObj.holeMaxY = holeMaxY;
                        }

                        layers.push(layerObj);
                    }
                }
            }
            cache[y][x] = layers;
        }
    }

    upperGeometryLayersCache.set(grid, cache);
    return cache;
};

// --- RENDERABLE WALL LAYERS CACHE (for rendering active columns) ---
let renderableWallLayersCache = new WeakMap<Tile[][], number[][][]>();

export const getRenderableWallLayersCache = (grid: Tile[][], grids: Tile[][][]): number[][][] => {
    if (renderableWallLayersCache.has(grid)) {
        return renderableWallLayersCache.get(grid)!;
    }

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];

    const cache: number[][][] = new Array(mapHeight);

    for (let y = 0; y < mapHeight; y++) {
        cache[y] = new Array(mapWidth);
        for (let x = 0; x < mapWidth; x++) {
            const layers: number[] = [];
            for (let l = 0; l < activeGrids.length; l++) {
                const tile = activeGrids[l]?.[y]?.[x];
                if (tile) {
                    const isRaisedFloor = tile.type === 'FLOOR' && tile.height !== undefined && tile.height > 0;
                    if (l === 0) {
                        if (tile.type === 'WALL' || tile.type === 'DOOR' || isRaisedFloor) {
                            layers.push(l);
                        }
                    } else if (tile.type === 'WALL' || isRaisedFloor) {
                        layers.push(l);
                    }
                }
            }
            cache[y][x] = layers;
        }
    }

    renderableWallLayersCache.set(grid, cache);
    return cache;
};

// --- EXPOSED CAP CACHE ---
// Static per-cell bitmask of wall layers whose underside is not covered by any
// solid lower wall. This is computed when level geometry changes, never per ray.
let exposedCapLayersCache = new WeakMap<Tile[][], Uint32Array>();

const getExposedCapLayersCache = (grid: Tile[][], grids: Tile[][][]): Uint32Array => {
    const cached = exposedCapLayersCache.get(grid);
    if (cached) return cached;

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];
    const result = new Uint32Array(mapWidth * mapHeight);
    const layerCount = Math.min(activeGrids.length, 31);

    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            let mask = 0;
            for (let layer = 0; layer < layerCount; layer++) {
                const tile = activeGrids[layer]?.[y]?.[x];
                if (!tile || tile.type !== 'WALL' || tile.isWindow) continue;

                let elev = tile.elevation !== undefined ? tile.elevation : 0;
                let h = tile.height !== undefined ? Math.abs(tile.height) : 1.0;
                if (tile.height !== undefined && tile.height < 0) elev = 1.0 - h;
                const bottomZ = layer + elev;

                let covered = false;
                for (let below = layer - 1; below >= 0; below--) {
                    const lower = activeGrids[below]?.[y]?.[x];
                    if (!lower || lower.type !== 'WALL' || lower.isWindow) continue;

                    let lowerElev = lower.elevation !== undefined ? lower.elevation : 0;
                    let lowerH = lower.height !== undefined ? Math.abs(lower.height) : 1.0;
                    if (lower.height !== undefined && lower.height < 0) lowerElev = 1.0 - lowerH;
                    const lowerTop = below + lowerElev + lowerH;
                    if (lowerTop >= bottomZ - 0.001) {
                        covered = true;
                        break;
                    }
                }

                if (!covered) mask |= (1 << layer);
            }
            result[y * mapWidth + x] = mask;
        }
    }

    exposedCapLayersCache.set(grid, result);
    return result;
};

// --- SOLID SEGMENTS CACHE (for occlusion calculation in RaycastCore.ts) ---
let solidWallLayersCache = new WeakMap<Tile[][], PrecalculatedSolidLayer[][][]>();

export const getSolidWallLayersCache = (grid: Tile[][], grids: Tile[][][]): PrecalculatedSolidLayer[][][] => {
    if (solidWallLayersCache.has(grid)) {
        return solidWallLayersCache.get(grid)!;
    }

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];

    const cache: PrecalculatedSolidLayer[][][] = new Array(mapHeight);

    for (let y = 0; y < mapHeight; y++) {
        cache[y] = new Array(mapWidth);
        for (let x = 0; x < mapWidth; x++) {
            const layers: PrecalculatedSolidLayer[] = [];
            for (let l = 0; l < activeGrids.length; l++) {
                const tile = activeGrids[l]?.[y]?.[x];
                const isSolid = tile && (
                    (tile.type === 'WALL' && !tile.isWindow) ||
                    (tile.type === 'FLOOR' && tile.height !== undefined && tile.height > 0)
                );
                if (isSolid) {
                    let elev = tile.elevation !== undefined ? tile.elevation : 0;
                    let h = tile.height !== undefined ? Math.abs(tile.height) : 1.0;
                    if (tile.height !== undefined && tile.height < 0) {
                        elev = 1.0 - h;
                    }
                    const absTopZ = l + elev + h;
                    const absBotZ = l + elev;
                    layers.push({
                        layerIndex: l,
                        absTopZ,
                        absBotZ
                    });
                }
            }
            cache[y][x] = layers;
        }
    }

    solidWallLayersCache.set(grid, cache);
    return cache;
};

let distanceFieldCache = new WeakMap<Tile[][], Uint8Array[]>();
let flatObstacleCache = new WeakMap<Tile[][], Uint8Array>();

export const getFlatObstacleMap = (grid: Tile[][], grids: Tile[][][]): Uint8Array => {
    if (flatObstacleCache.has(grid)) {
        return flatObstacleCache.get(grid)!;
    }

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];
    const layersCount = activeGrids.length;

    const flatMap = new Uint8Array(mapWidth * mapHeight);
    for (let y = 0; y < mapHeight; y++) {
        const row = grid[y];
        const yOffset = y * mapWidth;
        for (let x = 0; x < mapWidth; x++) {
            let hasObstacle = 0;
            const tile = row?.[x];
            if (tile) {
                if (tile.type === 'WALL' || tile.type === 'DOOR') {
                    hasObstacle = 1;
                } else if (tile.type === 'FLOOR' && tile.height !== undefined && tile.height > 0) {
                    hasObstacle = 1;
                }
            }

            if (!hasObstacle && layersCount > 1) {
                for (let l = 1; l < layersCount; l++) {
                    const layerRow = activeGrids[l]?.[y];
                    const upperTile = layerRow?.[x];
                    if (upperTile) {
                        if (upperTile.type === 'WALL' || upperTile.type === 'DOOR') {
                            hasObstacle = 1;
                            break;
                        } else if (upperTile.type === 'FLOOR' && upperTile.height !== undefined && upperTile.height > 0) {
                            hasObstacle = 1;
                            break;
                        }
                    }
                }
            }
            flatMap[yOffset + x] = hasObstacle;
        }
    }

    flatObstacleCache.set(grid, flatMap);
    return flatMap;
};

export const clearRaycastCache = () => {
    distanceFieldCache = new WeakMap<Tile[][], Uint8Array[]>();
    flatObstacleCache = new WeakMap<Tile[][], Uint8Array>();
    upperGeometryLayersCache = new WeakMap<Tile[][], PrecalculatedUpperLayer[][][]>();
    renderableWallLayersCache = new WeakMap<Tile[][], number[][][]>();
    exposedCapLayersCache = new WeakMap<Tile[][], Uint32Array>();
    solidWallLayersCache = new WeakMap<Tile[][], PrecalculatedSolidLayer[][][]>();
    invalidateLightingSolidMapCache();
};

export const getDistanceField = (grid: Tile[][], grids: Tile[][][]): Uint8Array[] => {
    if (distanceFieldCache.has(grid)) {
        return distanceFieldCache.get(grid)!;
    }

    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;
    const activeGrids = grids || [grid];

    // Initialize distance field using precalculated 1D flat obstacle map
    const flatObstacles = getFlatObstacleMap(grid, activeGrids);
    const distanceField = new Array(mapHeight);
    for (let y = 0; y < mapHeight; y++) {
        distanceField[y] = new Uint8Array(mapWidth);
        const distRow = distanceField[y];
        const yOffset = y * mapWidth;
        for (let x = 0; x < mapWidth; x++) {
            distRow[x] = flatObstacles[yOffset + x] ? 0 : 255;
        }
    }

    // Pass 1: Top-Left to Bottom-Right Chebyshev distance transform
    for (let y = 0; y < mapHeight; y++) {
        const row = distanceField[y];
        const prevRow = y > 0 ? distanceField[y - 1] : null;
        for (let x = 0; x < mapWidth; x++) {
            const val = row[x];
            if (val > 0) {
                let minDist = val;
                if (prevRow) {
                    if (x > 0) minDist = Math.min(minDist, prevRow[x - 1] + 1);
                    minDist = Math.min(minDist, prevRow[x] + 1);
                    if (x < mapWidth - 1) minDist = Math.min(minDist, prevRow[x + 1] + 1);
                }
                if (x > 0) minDist = Math.min(minDist, row[x - 1] + 1);
                row[x] = minDist;
            }
        }
    }

    // Pass 2: Bottom-Right to Top-Left Chebyshev distance transform
    for (let y = mapHeight - 1; y >= 0; y--) {
        const row = distanceField[y];
        const nextRow = y < mapHeight - 1 ? distanceField[y + 1] : null;
        for (let x = mapWidth - 1; x >= 0; x--) {
            const val = row[x];
            if (val > 0) {
                let minDist = row[x];
                if (x < mapWidth - 1) minDist = Math.min(minDist, row[x + 1] + 1);
                if (nextRow) {
                    if (x > 0) minDist = Math.min(minDist, nextRow[x - 1] + 1);
                    minDist = Math.min(minDist, nextRow[x] + 1);
                    if (x < mapWidth - 1) minDist = Math.min(minDist, nextRow[x + 1] + 1);
                }
                row[x] = minDist;
            }
        }
    }

    distanceFieldCache.set(grid, distanceField);
    return distanceField;
};

export const resetRaycastPools = () => {
    doorPoolIndex = 0;
    wallPoolIndex = 0;
};

const getDoorFromPool = (): PassThroughDoor => {
    if (doorPoolIndex >= doorPool.length) {
        doorPool.push({ x: 0, perpWallDist: 0, side: 0, openAmount: 0, tileX: 0, tileY: 0, rayDirX: 0, rayDirY: 0, posX: 0, posY: 0 });
    }
    const door = doorPool[doorPoolIndex++];
    door.isDoorEdge = false;
    door.isFrame = false;
    door.isTextureFlipped = false;
    door.doorOffset = 0;
    door.type = undefined;
    door.textureId = undefined;
    door.maskId = undefined;
    door.isBroken = false;
    return door;
};

const getWallFromPool = (): PassThroughWall => {
    if (wallPoolIndex >= wallPool.length) {
        wallPool.push({ dist: 0, exitDist: 0, mapX: 0, mapY: 0, side: 0, layer: 0 });
    }
    const wall = wallPool[wallPoolIndex++];
    wall.isPitWall = false;
    wall.isFloorWall = false;
    wall.pitTextureId = undefined;
    wall.isOccluderOnly = false;
    wall.isWindow = undefined;
    wall.cutoutTop = undefined;
    wall.cutoutBottom = undefined;
    wall.cutoutLeft = undefined;
    wall.cutoutRight = undefined;
    wall.glassTransparency = undefined;
    wall.glassOffset = undefined;
    wall.glassDist = undefined;
    wall.cutoutAxis = undefined;
    wall.clipBottom = undefined;
    wall.isCutoutColumn = undefined;
    wall.isStepDown = false;
    return wall;
};

export interface RaycastResult {
    hit: number;
    side: number;
    perpWallDist: number;
    mapX: number;
    mapY: number;
    stepX: number;
    stepY: number;
    rayDirX: number;
    rayDirY: number;
    isDoor: boolean;
    isDoorEdge: boolean;
    isDoorFrame: boolean;
    doorOffset: number;
    isTextureFlipped: boolean;
    hitInsideHinge: boolean;
    geometryHitSide: number;
    hitDepthLimit: boolean;
    /** Bitmask of wall/floor layers at the hit cell that actually intersected the ray visibility interval. */
    visibleLayerMask: number;
    /** Bitmask of exposed bottom-cap layers at the hit cell. */
    visibleCapMask: number;
}

const outHit1 = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };
const outHit2 = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };
const outHitHole = { hit: false, t: Infinity, side: 0, tFar: Infinity, tFarX: Infinity, tFarY: Infinity };

function intersectAABB_inplace(
    posX: number,
    posY: number,
    invRayDirX: number,
    invRayDirY: number,
    stepX: number,
    stepY: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: typeof outHit1
) {
    const t1x = (minX - posX) * invRayDirX;
    const t2x = (maxX - posX) * invRayDirX;
    const t1y = (minY - posY) * invRayDirY;
    const t2y = (maxY - posY) * invRayDirY;
    
    const tNearX = stepX > 0 ? t1x : t2x;
    const tFarX = stepX > 0 ? t2x : t1x;
    const tNearY = stepY > 0 ? t1y : t2y;
    const tFarY = stepY > 0 ? t2y : t1y;

    const tNear = tNearX > tNearY ? tNearX : tNearY;
    const tFar = tFarX < tFarY ? tFarX : tFarY;
    
    if (tNear <= tFar && tFar >= 0) {
        out.hit = true;
        out.t = tNear >= 0 ? tNear : tFar;
        out.side = out.t === tNear ? (tNearX > tNearY ? 0 : 1) : (tFarX < tFarY ? 0 : 1);
        out.tFar = tFar;
        out.tFarX = tFarX;
        out.tFarY = tFarY;
    } else {
        out.hit = false;
        out.t = Infinity;
        out.side = 0;
        out.tFar = Infinity;
        out.tFarX = Infinity;
        out.tFarY = Infinity;
    }
}

function pushPassThroughWall(
    passThroughWallsX: PassThroughWall[],
    dist: number,
    exitDist: number,
    mapX: number,
    mapY: number,
    side: number,
    layer: number,
    topZ: number,
    bottomZ: number,
    isWindow: boolean,
    isFloorWall: boolean,
    isPitWall: boolean,
    pitTextureId: string | undefined,
    clipBottom: number,
    isOccluderOnly: boolean = false,
    isStepDown: boolean = false
) {
    if (passThroughWallsX.length > 0) {
        const last = passThroughWallsX[passThroughWallsX.length - 1];
        if (
            isFloorWall &&
            last.isFloorWall &&
            last.layer === layer &&
            last.topZ === topZ &&
            last.bottomZ === bottomZ &&
            last.isWindow === false &&
            !last.isPitWall &&
            !isPitWall &&
            !last.isOccluderOnly &&
            !isOccluderOnly &&
            Math.abs(last.exitDist - dist) < 0.05
        ) {
            last.exitDist = exitDist;
            last.mapX = mapX;
            last.mapY = mapY;
            return;
        }
    }

    const wall = getWallFromPool();
    wall.dist = dist;
    wall.exitDist = exitDist;
    wall.mapX = mapX;
    wall.mapY = mapY;
    wall.side = side;
    wall.layer = layer;
    wall.topZ = topZ;
    wall.bottomZ = bottomZ;
    wall.isWindow = isWindow;
    wall.isFloorWall = isFloorWall;
    wall.isPitWall = isPitWall;
    wall.pitTextureId = pitTextureId;
    wall.clipBottom = clipBottom;
    wall.isOccluderOnly = isOccluderOnly;
    wall.isStepDown = isStepDown;
    passThroughWallsX.push(wall);
}

export const performRaycast = (
    x: number,
    width: number,
    posX: number,
    posY: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    grid: Tile[][],
    grids: Tile[][][],
    passThroughDoors: PassThroughDoor[][],
    passThroughWalls: PassThroughWall[][],
    outResult: RaycastResult,
    renderDistance: number,
    cameraZ: number = 0.5,
    horizon: number = 0,
    screenHeight: number = 0,
    ceilingType: string = 'INDOOR',
    precalcDistanceField?: Uint8Array[],
    precalcUpperGeometry?: PrecalculatedUpperLayer[][][],
    precalcSolidWall?: PrecalculatedSolidLayer[][][]
): RaycastResult => {
    const mapWidth = grid[0]?.length || 0; 
    const mapHeight = grid.length;
    
    if (width !== cachedWidth || dirX !== cachedDirX || dirY !== cachedDirY || planeX !== cachedPlaneX || planeY !== cachedPlaneY) {
        if (width > cameraXCache.length) {
            cameraXCache = new Float32Array(width + 256);
            rayDirXCache = new Float32Array(width + 256);
            rayDirYCache = new Float32Array(width + 256);
        }
        if (width !== cachedWidth) {
            for (let i = 0; i < width; i++) {
                cameraXCache[i] = (2 * i) / width - 1;
            }
            cachedWidth = width;
        }
        for (let i = 0; i < width; i++) {
            let rdx = dirX + planeX * cameraXCache[i];
            let rdy = dirY + planeY * cameraXCache[i];
            if (rdx === 0) rdx = 1e-30;
            if (rdy === 0) rdy = 1e-30;
            rayDirXCache[i] = rdx;
            rayDirYCache[i] = rdy;
        }
        cachedDirX = dirX;
        cachedDirY = dirY;
        cachedPlaneX = planeX;
        cachedPlaneY = planeY;
    }

    let rayDirX = rayDirXCache[x];
    let rayDirY = rayDirYCache[x];
    
    let mapX = Math.floor(posX); 
    let mapY = Math.floor(posY);
    
    const invRayDirX = 1 / rayDirX;
    const invRayDirY = 1 / rayDirY;
    
    let sideDistX, sideDistY;
    const deltaDistX = Math.abs(invRayDirX); 
    const deltaDistY = Math.abs(invRayDirY);
    
    let perpWallDist;
    let overriddenDist: number | undefined; 
    let stepX, stepY; 
    let hit = 0; 
    let side = 0;
    let isDoor = false; 
    let isDoorEdge = false; 
    let isDoorFrame = false; 
    let doorOffset = 0; 
    let hitInsideHinge = false; 
    let isTextureFlipped = false;
    let geometryHitSide = 0;
    outResult.hitDepthLimit = false;

    let firstHitSide = 0;
    let firstHitPerpWallDist = 0;
    let firstHitMapX = 0;
    let firstHitMapY = 0;
    let firstHitIsDoor = false;
    let firstHitIsDoorEdge = false;
    let firstHitIsDoorFrame = false;
    let firstHitDoorOffset = 0;
    let firstHitIsTextureFlipped = false;
    let firstHitInsideHinge = false;
    let firstHitGeometryHitSide = 0;
    
    if (rayDirX < 0) { stepX = -1; sideDistX = (posX - mapX) * deltaDistX; } 
    else { stepX = 1; sideDistX = (mapX + 1.0 - posX) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (posY - mapY) * deltaDistY; } 
    else { stepY = 1; sideDistY = (mapY + 1.0 - posY) * deltaDistY; }

    const activeGrids = grids || [grid];
    const hasUpperLayers = activeGrids.length > 1;
    const distanceField = precalcDistanceField || getDistanceField(grid, activeGrids);
    const upperGeometryCache = precalcUpperGeometry || getUpperGeometryLayersCache(grid, activeGrids);
    const solidWallCache = precalcSolidWall || getSolidWallLayersCache(grid, activeGrids);
    const exposedCapCache = getExposedCapLayersCache(grid, activeGrids);


    // --- CHECK START TILE FOR DOOR (Visuals inside doorway) ---
    if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
        const startTile = grid[mapY][mapX];
        const startDoor = (startTile && startTile.type === 'DOOR' && startTile.door) ? startTile.door : null;
        
        if (startDoor) {
            let result = null;
            if (startDoor.type === 'HINGE') {
                result = calculateHingeIntersection(mapX, mapY, posX, posY, rayDirX, rayDirY, startDoor.openAmount, startDoor.dir, startDoor.edge as any, grid);
            } else if (startDoor.type === 'SLIDE') {
                result = calculateSlideIntersection(mapX, mapY, posX, posY, rayDirX, rayDirY, 0, 0, 0, 0, 0, startDoor.openAmount, grid);
            }
            
            if (result) {
                const door = getDoorFromPool();
                door.x = x; door.perpWallDist = result.perpWallDist; door.side = result.side; door.openAmount = startDoor.openAmount;
                door.tileX = mapX; door.tileY = mapY; door.rayDirX = rayDirX; door.rayDirY = rayDirY; door.posX = posX; door.posY = posY;
                door.type = startDoor.type; door.doorOffset = result.doorOffset; door.isDoorEdge = result.isDoorEdge;
                door.isFrame = result.isFrame; door.isTextureFlipped = result.isTextureFlipped;
                door.textureId = startDoor.textureId; door.maskId = startDoor.maskId; door.isBroken = startDoor.broken;
                passThroughDoors[x].push(door);
            }
        }
    }

    let currentClipBottom = screenHeight > 0 ? screenHeight : 9999;
    const viewHeight = screenHeight > 0 ? screenHeight : 480;
    
    let visibleCount = 1;
    let currentVisible = visibleIntervalsA;
    let nextVisible = visibleIntervalsB;
    currentVisible[0] = 0;
    currentVisible[1] = viewHeight;
    
    while (true) {
      const prevMapX = mapX;
      const prevMapY = mapY;

      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
          break;
      }

      const D = distanceField[mapY][mapX];
      if (D > 2) {
          // --- SPATIAL JUMP USING DISTANCE FIELD (Chebyshev distance transform) ---
          const jumpSize = D - 1;
          const nextTargetX = stepX > 0 ? mapX + jumpSize : mapX - jumpSize;
          const nextTargetY = stepY > 0 ? mapY + jumpSize : mapY - jumpSize;

          const distToTargetX = sideDistX + deltaDistX * (jumpSize - 1);
          const distToTargetY = sideDistY + deltaDistY * (jumpSize - 1);

          if (distToTargetX < distToTargetY) {
              mapX = nextTargetX;
              const hitY = posY + distToTargetX * rayDirY;
              mapY = Math.floor(hitY);
              side = 0;
          } else {
              mapY = nextTargetY;
              const hitX = posX + distToTargetY * rayDirX;
              mapX = Math.floor(hitX);
              side = 1;
          }

          // Re-sync sideDistX and sideDistY
          if (rayDirX < 0) sideDistX = (posX - mapX) * deltaDistX;
          else sideDistX = (mapX + 1.0 - posX) * deltaDistX;

          if (rayDirY < 0) sideDistY = (posY - mapY) * deltaDistY;
          else sideDistY = (mapY + 1.0 - posY) * deltaDistY;
      } else {
          // --- MICRO STEP (Standard DDA) ---
          if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; } 
          else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
      }
      
      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
          break;
      }
      
      const prevTile = grid[prevMapY][prevMapX];
      const prevFLevel = getFloorLevel(prevTile);
      const currTile = grid[mapY][mapX];
      const currFLevel = getFloorLevel(currTile);

      let dist; if (side === 0) dist = (sideDistX - deltaDistX); else dist = (sideDistY - deltaDistY);
      
      if (dist > renderDistance) {
          outResult.hitDepthLimit = true;
          break;
      }
      
      if (dist > 0 && screenHeight > 0) {
          const lh = screenHeight / dist;
          const limitY = Math.ceil(horizon + lh * (cameraZ - prevFLevel));
          currentClipBottom = Math.min(currentClipBottom, limitY);
      }

      if (currFLevel > prevFLevel && mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
          let visible = true;
          if (dist > 0.05 && viewHeight > 0) {
              const lh = viewHeight / dist;
              const yTop_raw = Math.floor(horizon + lh * (cameraZ - currFLevel)) - 1;
              const yBot_raw = Math.ceil(horizon + lh * (cameraZ - prevFLevel)) + 1;
              const yTop = (currFLevel < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
              const yBot = (prevFLevel > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
              if (yTop < yBot) {
                  let overlap = false;
                  for (let vi = 0; vi < visibleCount; vi++) {
                      if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                          overlap = true;
                          break;
                      }
                  }
                  if (!overlap) {
                      visible = false;
                  }
              }
          }
          if (visible) {
              const exitDist = Math.min(sideDistX, sideDistY); 
              pushPassThroughWall(
                  passThroughWalls[x],
                  dist,
                  exitDist,
                  mapX,
                  mapY,
                  side,
                  0, // layer
                  currFLevel,
                  prevFLevel,
                  false, // isWindow
                  true, // isFloorWall
                  currFLevel < 0 || prevFLevel < 0, // isPitWall
                  currTile.textureId || currTile.assetId,
                  currentClipBottom
              );
          }
      }
      
      if (currFLevel < prevFLevel && mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
          let visible = true;
          if (dist > 0.05 && viewHeight > 0) {
              const lh = viewHeight / dist;
              const yTop_raw = Math.floor(horizon + lh * (cameraZ - prevFLevel)) - 1;
              const yBot_raw = Math.ceil(horizon + lh * (cameraZ - currFLevel)) + 1;
              const yTop = (prevFLevel < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
              const yBot = (currFLevel > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
              if (yTop < yBot) {
                  let overlap = false;
                  for (let vi = 0; vi < visibleCount; vi++) {
                      if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                          overlap = true;
                          break;
                      }
                  }
                  if (!overlap) {
                      visible = false;
                  }
              }
          }
          if (visible) {
              const exitDist = Math.min(sideDistX, sideDistY); 
              pushPassThroughWall(
                  passThroughWalls[x],
                  dist,
                  exitDist,
                  mapX,
                  mapY,
                  side,
                  0, // layer
                  prevFLevel,
                  currFLevel,
                  false, // isWindow
                  true, // isFloorWall
                  currFLevel < 0 || prevFLevel < 0, // isPitWall
                  undefined,
                  currentClipBottom,
                  true, // isOccluderOnly
                  true // isStepDown
              );
          }
      }
      
      geometryHitSide = side; 


      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) { 
          break; 
      } 
      else {
          if (hit === 0) {
              const tile = grid[mapY][mapX];
              if (tile) {
                  let elev = tile.elevation !== undefined ? tile.elevation : 0;
              let h = tile.height !== undefined ? Math.abs(tile.height) : ((tile.type === 'WALL' || tile.type === 'DOOR') ? 1.0 : 0.0);
              if (tile.height !== undefined && tile.height < 0) {
                  if (tile.type !== 'FLOOR') {
                      elev = 1.0 - h;
                  } else {
                      h = 0; // FLOOR with negative height shouldn't act as a hanging solid wall.
                  }
              }
              const topZ = elev + h;
              const bottomZ = elev;

              const isWallLike = tile.type === 'WALL' || (tile.type === 'FLOOR' && tile.height !== undefined && tile.height > 0);
              if (isWallLike) {
                  let isSolidWall = true;
                  
                  if (tile.type === 'WALL' && tile.isWindow) {
                      let thickness = tile.thickness !== undefined ? tile.thickness : 1.0;
                      let offsetVal = tile.offset !== undefined ? tile.offset : 0.0;
                      let cutoutAxis = resolveTileCutoutAxis(tile, mapX, mapY, grid, mapWidth, mapHeight);
                      
                      let cLeft = tile.cutout ? tile.cutout.topLeft.x : 0.25;
                      let cRight = tile.cutout ? tile.cutout.bottomRight.x : 0.75;
                      
                      let wMinX = mapX, wMaxX = mapX + 1.0;
                      let wMinY = mapY, wMaxY = mapY + 1.0;
                      
                      if (cutoutAxis === 'NS') {
                          wMinY = mapY + offsetVal * (1.0 - thickness);
                          wMaxY = wMinY + thickness;
                      } else {
                          wMinX = mapX + offsetVal * (1.0 - thickness);
                          wMaxX = wMinX + thickness;
                      }
                      
                      let b1MinX = wMinX, b1MaxX = wMaxX, b1MinY = wMinY, b1MaxY = wMaxY;
                      let b2MinX = wMinX, b2MaxX = wMaxX, b2MinY = wMinY, b2MaxY = wMaxY;
                      let holeMinX = wMinX, holeMaxX = wMaxX, holeMinY = wMinY, holeMaxY = wMaxY;

                      if (cutoutAxis === 'NS') {
                          b1MaxX = mapX + cLeft;
                          b2MinX = mapX + cRight;
                          holeMinX = mapX + cLeft;
                          holeMaxX = mapX + cRight;
                      } else {
                          b1MaxY = mapY + cLeft;
                          b2MinY = mapY + cRight;
                          holeMinY = mapY + cLeft;
                          holeMaxY = mapY + cRight;
                      }

                      intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, b1MinX, b1MinY, b1MaxX, b1MaxY, outHit1);
                      intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, b2MinX, b2MinY, b2MaxX, b2MaxY, outHit2);
                      intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, holeMinX, holeMinY, holeMaxX, holeMaxY, outHitHole);
                      
                      let hitSolid = false;
                      let solidHitT = Infinity;
                      let solidHitSide = 0;
                      if (outHit1.hit && outHit1.t < solidHitT) { hitSolid = true; solidHitT = outHit1.t; solidHitSide = outHit1.side; }
                      if (outHit2.hit && outHit2.t < solidHitT) { hitSolid = true; solidHitT = outHit2.t; solidHitSide = outHit2.side; }

                      let holeHitTime = Infinity;
                      if (outHitHole.hit) {
                          holeHitTime = outHitHole.t;
                      }

                      if (hitSolid && solidHitT <= holeHitTime + 0.0001) {
                          let visible = true;
                          if (solidHitT > 0.05 && viewHeight > 0) {
                              const lh = viewHeight / solidHitT;
                              const yTop_raw = Math.floor(horizon + lh * (cameraZ - topZ)) - 1;
                              const yBot_raw = Math.ceil(horizon + lh * (cameraZ - bottomZ)) + 1;
                              const yTop = (topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                              const yBot = (bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                              if (yTop >= yBot) {
                                  visible = false;
                              } else {
                                  let overlap = false;
                                  for (let vi = 0; vi < visibleCount; vi++) {
                                      if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                          overlap = true;
                                          break;
                                      }
                                  }
                                  if (!overlap) {
                                      visible = false;
                                  }
                              }
                          }

                          if (visible) {
                              const wall = getWallFromPool();
                              const currentExitDist = Math.min(sideDistX, sideDistY);
                              wall.dist = solidHitT; 
                              wall.exitDist = currentExitDist; 
                              wall.mapX = mapX; 
                              wall.mapY = mapY; 
                              wall.side = solidHitSide; 
                              wall.layer = 0;
                              wall.topZ = topZ; 
                              wall.bottomZ = bottomZ;
                              wall.isWindow = true;
                              wall.clipBottom = currentClipBottom;
                              wall.cutoutAxis = cutoutAxis;
                              wall.cutoutTop = tile.cutout ? tile.cutout.topLeft.y : 0.25;
                              wall.cutoutBottom = tile.cutout ? tile.cutout.bottomRight.y : 0.75;
                              wall.cutoutLeft = tile.cutout ? tile.cutout.topLeft.x : 0.25;
                              wall.cutoutRight = tile.cutout ? tile.cutout.bottomRight.x : 0.75;
                              wall.glassTransparency = 0.0;
                              wall.glassOffset = 0.5;
                              wall.glassDist = solidHitT;
                              passThroughWalls[x].push(wall);
                          }

                          isSolidWall = false;
                      } else if (outHitHole.hit) {
                          let tHit = outHitHole.t;
                          let exitDist = outHitHole.tFar;
                          let hitSide = outHitHole.side;

                          let hitsCheek = false;
                          if (cutoutAxis === 'NS' && outHitHole.tFar === outHitHole.tFarX) {
                              hitsCheek = true;
                          } else if (cutoutAxis === 'WE' && outHitHole.tFar === outHitHole.tFarY) {
                              hitsCheek = true;
                          }

                          if (hitsCheek) {
                              // 1. Входной сегмент выреза (с окном/стеклом)
                              let visibleWall = true;
                              if (tHit > 0.05 && viewHeight > 0) {
                                  const lh = viewHeight / tHit;
                                  const yTop_raw = Math.floor(horizon + lh * (cameraZ - topZ)) - 1;
                                  const yBot_raw = Math.ceil(horizon + lh * (cameraZ - bottomZ)) + 1;
                                  const yTop = (topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                                  const yBot = (bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                                  if (yTop >= yBot) {
                                      visibleWall = false;
                                  } else {
                                      let overlap = false;
                                      for (let vi = 0; vi < visibleCount; vi++) {
                                          if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                              overlap = true;
                                              break;
                                          }
                                      }
                                      if (!overlap) {
                                          visibleWall = false;
                                      }
                                  }
                              }

                              if (visibleWall) {
                                  const wall = getWallFromPool();
                                  wall.dist = tHit; wall.exitDist = exitDist; wall.mapX = mapX; wall.mapY = mapY; wall.side = hitSide; wall.layer = 0;
                                  wall.topZ = topZ; wall.bottomZ = bottomZ;
                                  wall.isWindow = true;
                                  wall.clipBottom = currentClipBottom;
                                  wall.cutoutAxis = cutoutAxis;
                                  wall.cutoutTop = tile.cutout ? tile.cutout.topLeft.y : 0.25;
                                  wall.cutoutBottom = tile.cutout ? tile.cutout.bottomRight.y : 0.75;
                                  wall.cutoutLeft = tile.cutout ? tile.cutout.topLeft.x : 0.25;
                                  wall.cutoutRight = tile.cutout ? tile.cutout.bottomRight.x : 0.75;
                                  wall.glassTransparency = (tile.glassAssetId && !tile.isGlassBroken) ? (tile.glassTransparency !== undefined ? tile.glassTransparency : 0.5) : 0.0;
                                  let gOffset = tile.glassOffset !== undefined ? tile.glassOffset : 0.5;
                                  wall.glassOffset = gOffset;
                                  
                                  let exactGlassDist = 0;
                                  let tOffsetVal = tile.offset !== undefined ? tile.offset : 0.0;
                                  let tThickness = tile.thickness !== undefined ? tile.thickness : 1.0;
                                  if (cutoutAxis === 'NS') {
                                      let glassY = mapY + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                                      exactGlassDist = (glassY - posY) / rayDirY;
                                  } else {
                                      let glassX = mapX + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                                      exactGlassDist = (glassX - posX) / rayDirX;
                                  }
                                  wall.glassDist = exactGlassDist;
                                  passThroughWalls[x].push(wall);
                              }

                              // 2. Сама боковая стенка (cheek) на месте выхода из выреза
                              let visibleCheek = true;
                              if (exitDist > 0.05 && viewHeight > 0) {
                                  const lh = viewHeight / exitDist;
                                  const yTop_raw = Math.floor(horizon + lh * (cameraZ - topZ)) - 1;
                                  const yBot_raw = Math.ceil(horizon + lh * (cameraZ - bottomZ)) + 1;
                                  const yTop = (topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                                  const yBot = (bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                                  if (yTop >= yBot) {
                                      visibleCheek = false;
                                  } else {
                                      let overlap = false;
                                      for (let vi = 0; vi < visibleCount; vi++) {
                                          if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                              overlap = true;
                                              break;
                                          }
                                      }
                                      if (!overlap) {
                                          visibleCheek = false;
                                      }
                                  }
                              }

                              if (visibleCheek) {
                                  const cheekWall = getWallFromPool();
                                  cheekWall.dist = exitDist;
                                  cheekWall.exitDist = exitDist + 0.05;
                                  cheekWall.mapX = mapX;
                                  cheekWall.mapY = mapY;
                                  cheekWall.side = cutoutAxis === 'NS' ? 0 : 1;
                                  cheekWall.layer = 0;
                                  cheekWall.topZ = topZ;
                                  cheekWall.bottomZ = bottomZ;
                                  cheekWall.isWindow = true;
                                  cheekWall.clipBottom = currentClipBottom;
                                  cheekWall.cutoutAxis = cutoutAxis;
                                  cheekWall.cutoutTop = tile.cutout ? tile.cutout.topLeft.y : 0.25;
                                  cheekWall.cutoutBottom = tile.cutout ? tile.cutout.bottomRight.y : 0.75;
                                  cheekWall.cutoutLeft = tile.cutout ? tile.cutout.topLeft.x : 0.25;
                                  cheekWall.cutoutRight = tile.cutout ? tile.cutout.bottomRight.x : 0.75;
                                  cheekWall.glassTransparency = 0.0;
                                  cheekWall.glassOffset = 0.5;
                                  cheekWall.glassDist = exitDist;
                                  passThroughWalls[x].push(cheekWall);
                              }

                              isSolidWall = false;
                          } else {
                              let visible = true;
                              if (tHit > 0.05 && viewHeight > 0) {
                                  const lh = viewHeight / tHit;
                                  const yTop_raw = Math.floor(horizon + lh * (cameraZ - topZ)) - 1;
                                  const yBot_raw = Math.ceil(horizon + lh * (cameraZ - bottomZ)) + 1;
                                  const yTop = (topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                                  const yBot = (bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                                  if (yTop >= yBot) {
                                      visible = false;
                                  } else {
                                      let overlap = false;
                                      for (let vi = 0; vi < visibleCount; vi++) {
                                          if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                              overlap = true;
                                              break;
                                          }
                                      }
                                      if (!overlap) {
                                          visible = false;
                                      }
                                  }
                              }

                              if (visible) {
                                  const wall = getWallFromPool();
                                  wall.dist = tHit; wall.exitDist = exitDist; wall.mapX = mapX; wall.mapY = mapY; wall.side = hitSide; wall.layer = 0;
                                  wall.topZ = topZ; wall.bottomZ = bottomZ;
                                  wall.isWindow = true;
                                  wall.clipBottom = currentClipBottom;
                                  wall.cutoutAxis = cutoutAxis;
                                  wall.cutoutTop = tile.cutout ? tile.cutout.topLeft.y : 0.25;
                                  wall.cutoutBottom = tile.cutout ? tile.cutout.bottomRight.y : 0.75;
                                  wall.cutoutLeft = tile.cutout ? tile.cutout.topLeft.x : 0.25;
                                  wall.cutoutRight = tile.cutout ? tile.cutout.bottomRight.x : 0.75;
                                  wall.glassTransparency = (tile.glassAssetId && !tile.isGlassBroken) ? (tile.glassTransparency !== undefined ? tile.glassTransparency : 0.5) : 0.0;
                                  let gOffset = tile.glassOffset !== undefined ? tile.glassOffset : 0.5;
                                  wall.glassOffset = gOffset;
                                  
                                  let exactGlassDist = 0;
                                  let tOffsetVal = tile.offset !== undefined ? tile.offset : 0.0;
                                  let tThickness = tile.thickness !== undefined ? tile.thickness : 1.0;
                                  if (cutoutAxis === 'NS') {
                                      let glassY = mapY + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                                      exactGlassDist = (glassY - posY) / rayDirY;
                                  } else {
                                      let glassX = mapX + tOffsetVal * (1.0 - tThickness) + gOffset * tThickness;
                                      exactGlassDist = (glassX - posX) / rayDirX;
                                  }
                                  wall.glassDist = exactGlassDist;
                                  passThroughWalls[x].push(wall);
                              }

                              isSolidWall = false;
                          }
                      } else {
                          isSolidWall = false;
                      }
                  }

                  if (isSolidWall) {
                      if (bottomZ <= 0.001 && topZ >= 0.999 && cameraZ >= bottomZ && cameraZ <= topZ && tile.type === 'WALL' && !tile.isWindow) {
                          if (hit === 0) {
                              hit = 1;
                              firstHitMapX = mapX;
                              firstHitMapY = mapY;
                              firstHitSide = side;
                              firstHitPerpWallDist = (side === 0) ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
                              firstHitIsDoor = false;
                              firstHitIsDoorEdge = false;
                              firstHitIsDoorFrame = false;
                              firstHitDoorOffset = 0;
                              firstHitIsTextureFlipped = false;
                              firstHitInsideHinge = false;
                              firstHitGeometryHitSide = side;

                              if (dist > 0 && screenHeight > 0) {
                                  const lh = screenHeight / dist;
                                  const limitY = Math.ceil(horizon + lh * (cameraZ - topZ));
                                  currentClipBottom = Math.min(currentClipBottom, limitY);
                              }
                          }
                      } else if (tile.type === 'WALL' && tile.isWindow && cameraZ >= bottomZ && cameraZ <= topZ) {
                          if (hit === 0) {
                              hit = 1; 
                              firstHitMapX = mapX;
                              firstHitMapY = mapY;
                              firstHitSide = side;
                              firstHitPerpWallDist = (side === 0) ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
                              firstHitIsDoor = false;
                              firstHitIsDoorEdge = false;
                              firstHitIsDoorFrame = false;
                              firstHitDoorOffset = 0;
                              firstHitIsTextureFlipped = false;
                              firstHitInsideHinge = false;
                              firstHitGeometryHitSide = side;

                              if (dist > 0 && screenHeight > 0) {
                                  const lh = screenHeight / dist;
                                  const limitY = Math.ceil(horizon + lh * (cameraZ - topZ));
                                  currentClipBottom = Math.min(currentClipBottom, limitY);
                              }
                          }
                      } else if (h > 0) {
                          let dist; if (side === 0) dist = (sideDistX - deltaDistX); else dist = (sideDistY - deltaDistY);
                          
                          let visible = true;
                          if (dist > 0.05 && viewHeight > 0) {
                              const lh = viewHeight / dist;
                              const yTop_raw = Math.floor(horizon + lh * (cameraZ - topZ)) - 1;
                              const yBot_raw = Math.ceil(horizon + lh * (cameraZ - bottomZ)) + 1;
                              const yTop = (topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                              const yBot = (bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                              
                              if (yTop >= yBot) {
                                  visible = false;
                              } else {
                                  let overlap = false;
                                  for (let vi = 0; vi < visibleCount; vi++) {
                                      if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                          overlap = true;
                                          break;
                                      }
                                  }
                                  if (!overlap) {
                                      visible = false;
                                  }
                              }
                          }

                          if (visible) {
                              const exitDist = Math.min(sideDistX, sideDistY);
                              pushPassThroughWall(
                                  passThroughWalls[x],
                                  dist,
                                  exitDist,
                                  mapX,
                                  mapY,
                                  side,
                                  0, // layer
                                  topZ,
                                  bottomZ,
                                  false, // isWindow
                                  tile.type === 'FLOOR', // isFloorWall
                                  topZ < 0 || bottomZ < 0, // isPitWall
                                  undefined,
                                  currentClipBottom
                              );
                          }
                      }
                  }
              } else if (tile.type === 'DOOR' && tile.door) {
                  const openAmt = tile.door.openAmount;
                  const isTransparent = !!tile.door.maskId || openAmt > 0 || cameraZ > 1.0 || cameraZ < 0.0; 
                  
                  if (tile.door.type === 'HINGE') {
                      const result = calculateHingeIntersection(mapX, mapY, posX, posY, rayDirX, rayDirY, openAmt, tile.door.dir, tile.door.edge, grid);
                      if (result) {
                          if (isTransparent) {
                              const door = getDoorFromPool();
                              door.x = x; door.perpWallDist = result.perpWallDist; door.side = result.side; door.openAmount = openAmt;
                              door.tileX = mapX; door.tileY = mapY; door.rayDirX = rayDirX; door.rayDirY = rayDirY; door.posX = posX; door.posY = posY;
                              door.type = 'HINGE'; door.doorOffset = result.doorOffset; door.isDoorEdge = result.isDoorEdge;
                              door.isFrame = result.isFrame; door.isTextureFlipped = result.isTextureFlipped;
                              door.textureId = tile.door.textureId; door.maskId = tile.door.maskId; door.isBroken = tile.door.broken;
                              door.clipBottom = currentClipBottom;
                              passThroughDoors[x].push(door);
                          } else {
                              if (hit === 0) {
                                  hit = 1;
                                  firstHitIsDoor = true;
                                  firstHitPerpWallDist = result.perpWallDist;
                                  firstHitMapX = mapX;
                                  firstHitMapY = mapY;
                                  firstHitSide = result.side;
                                  firstHitDoorOffset = result.doorOffset;
                                  firstHitGeometryHitSide = result.side;
                                  firstHitIsTextureFlipped = result.isTextureFlipped;
                                  firstHitIsDoorEdge = result.isDoorEdge || false;
                                  firstHitIsDoorFrame = result.isFrame || false;
                                  firstHitInsideHinge = false;

                                  if (result.perpWallDist > 0 && screenHeight > 0) {
                                      const lh = screenHeight / result.perpWallDist;
                                      const limitY = Math.ceil(horizon + lh * (cameraZ - 1.0));
                                      currentClipBottom = Math.min(currentClipBottom, limitY);
                                  }
                              }
                          }
                      }
                  } else if (tile.door.type === 'SLIDE') {
                      const result = calculateSlideIntersection(mapX, mapY, posX, posY, rayDirX, rayDirY, sideDistX, sideDistY, deltaDistX, deltaDistY, side, openAmt, grid);
                      if (result) {
                          if (isTransparent) {
                              const door = getDoorFromPool();
                              door.x = x; door.perpWallDist = result.perpWallDist; door.side = result.side; door.openAmount = openAmt;
                              door.tileX = mapX; door.tileY = mapY; door.rayDirX = rayDirX; door.rayDirY = rayDirY; door.posX = posX; door.posY = posY;
                              door.type = 'SLIDE'; door.doorOffset = result.doorOffset; door.isDoorEdge = result.isDoorEdge;
                              door.isTextureFlipped = result.isTextureFlipped;
                              door.textureId = tile.door.textureId; door.maskId = tile.door.maskId; door.isBroken = tile.door.broken;
                              door.clipBottom = currentClipBottom;
                              passThroughDoors[x].push(door);
                          } else {
                              if (hit === 0) {
                                  hit = 1;
                                  firstHitIsDoor = true;
                                  firstHitPerpWallDist = result.perpWallDist;
                                  firstHitMapX = mapX;
                                  firstHitMapY = mapY;
                                  firstHitSide = result.side;
                                  firstHitIsDoorEdge = result.isDoorEdge || false;
                                  firstHitGeometryHitSide = result.side;
                                  firstHitDoorOffset = result.doorOffset;
                                  firstHitIsTextureFlipped = result.isTextureFlipped;
                                  firstHitInsideHinge = false;
                                  firstHitIsDoorFrame = false;

                                  if (result.perpWallDist > 0 && screenHeight > 0) {
                                      const lh = screenHeight / result.perpWallDist;
                                      const limitY = Math.ceil(horizon + lh * (cameraZ - 1.0));
                                      currentClipBottom = Math.min(currentClipBottom, limitY);
                                  }
                              }
                          }
                      }
                  } else if (tile.door.type === 'LIFT') {
                      let pwd, delta; if (side === 0) { pwd = (sideDistX - deltaDistX); delta = deltaDistX; } else { pwd = (sideDistY - deltaDistY); delta = deltaDistY; }
                      const centerDist = pwd + (delta * 0.5);
                      let wallX; if (side === 0) wallX = posY + centerDist * rayDirY; else wallX = posX + centerDist * rayDirX;
                      wallX -= Math.floor(wallX);
                      const door = getDoorFromPool();
                      door.x = x; door.perpWallDist = centerDist; door.side = side; door.openAmount = openAmt;
                      door.tileX = mapX; door.tileY = mapY; door.rayDirX = rayDirX; door.rayDirY = rayDirY; door.posX = posX; door.posY = posY;
                      door.type = 'LIFT'; door.doorOffset = wallX; door.textureId = tile.door.textureId; door.maskId = tile.door.maskId; door.isBroken = tile.door.broken;
                      door.clipBottom = currentClipBottom;
                      passThroughDoors[x].push(door);
                  }
              }
          }
          }

          if (hasUpperLayers) {
              const uLayers = upperGeometryCache[mapY]?.[mapX];
              if (uLayers && uLayers.length > 0) {
                  for (let idx = 0; idx < uLayers.length; idx++) {
                      const uLayer = uLayers[idx];
                      const i = uLayer.layerIndex;
                      const h = uLayer.h;
                      
                      if (h > 0) {
                          const topZ = uLayer.topZ;
                          const bottomZ = uLayer.bottomZ;

                          // Sub-pixel cull: skip upper-floor segments whose projected
                          // height is below 1px (they cannot be seen).
                          if (dist > 0.05 && viewHeight > 0 && viewHeight / dist * (topZ - bottomZ) < 1.0) {
                              continue;
                          }

                          // Оптимизация: отсечение полностью невидимых (загороженных) сегментов верхних этажей
                          // Optimization: cull completely invisible (occluded) upper floor segments
                          if (dist > 0.05 && viewHeight > 0) {
                              const lh = viewHeight / dist;
                              const yTop_raw = Math.floor(horizon + lh * (cameraZ - (i + topZ))) - 1;
                              const yBot_raw = Math.ceil(horizon + lh * (cameraZ - (i + bottomZ))) + 1;
                              const yTop = (i + topZ < cameraZ) ? Math.floor(horizon) - 1 : yTop_raw;
                              const yBot = (i + bottomZ > cameraZ) ? Math.ceil(horizon) + 1 : yBot_raw;
                              
                              if (yTop >= yBot) {
                                  continue;
                              }
                              
                              let overlap = false;
                              for (let vi = 0; vi < visibleCount; vi++) {
                                  if (yBot > currentVisible[vi * 2] && yTop < currentVisible[vi * 2 + 1]) {
                                      overlap = true;
                                      break;
                                  }
                              }
                              if (!overlap) {
                                  continue;
                              }
                          }

                          if (uLayer.isWindow) {
                              const cutoutAxis = uLayer.cutoutAxis!;
                              
                              intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, uLayer.b1MinX!, uLayer.b1MinY!, uLayer.b1MaxX!, uLayer.b1MaxY!, outHit1);
                              intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, uLayer.b2MinX!, uLayer.b2MinY!, uLayer.b2MaxX!, uLayer.b2MaxY!, outHit2);
                              intersectAABB_inplace(posX, posY, invRayDirX, invRayDirY, stepX, stepY, uLayer.holeMinX!, uLayer.holeMinY!, uLayer.holeMaxX!, uLayer.holeMaxY!, outHitHole);
                              
                              let hitSolid = false;
                              let solidHitT = Infinity;
                              let solidHitSide = 0;
                              if (outHit1.hit && outHit1.t < solidHitT) { hitSolid = true; solidHitT = outHit1.t; solidHitSide = outHit1.side; }
                              if (outHit2.hit && outHit2.t < solidHitT) { hitSolid = true; solidHitT = outHit2.t; solidHitSide = outHit2.side; }

                              let holeHitTime = Infinity;
                              if (outHitHole.hit) {
                                  holeHitTime = outHitHole.t;
                              }

                              if (hitSolid && solidHitT <= holeHitTime + 0.0001) {
                                  const wall = getWallFromPool();
                                  const currentExitDist = Math.min(sideDistX, sideDistY);
                                  wall.dist = solidHitT; 
                                  wall.exitDist = currentExitDist; 
                                  wall.mapX = mapX; 
                                  wall.mapY = mapY; 
                                  wall.side = solidHitSide; 
                                  wall.layer = i;
                                  wall.topZ = topZ; 
                                  wall.bottomZ = bottomZ;
                                  wall.isWindow = true;
                                  wall.clipBottom = currentClipBottom;
                                  wall.cutoutAxis = cutoutAxis;
                                  wall.cutoutTop = uLayer.cutoutTop;
                                  wall.cutoutBottom = uLayer.cutoutBottom;
                                  wall.cutoutLeft = uLayer.cutoutLeft;
                                  wall.cutoutRight = uLayer.cutoutRight;
                                  wall.glassTransparency = 0.0;
                                  wall.glassOffset = 0.5;
                                  wall.glassDist = solidHitT;
                                  passThroughWalls[x].push(wall);
                              } else if (outHitHole.hit) {
                                  let tHit = outHitHole.t;
                                  let exitDist = outHitHole.tFar;
                                  let hitSide = outHitHole.side;

                                  let hitsCheek = false;
                                  if (cutoutAxis === 'NS' && outHitHole.tFar === outHitHole.tFarX) {
                                      hitsCheek = true;
                                  } else if (cutoutAxis === 'WE' && outHitHole.tFar === outHitHole.tFarY) {
                                      hitsCheek = true;
                                  }

                                  if (hitsCheek) {
                                      // 1. Входной сегмент выреза (с окном/стеклом)
                                      const wall = getWallFromPool();
                                      wall.dist = tHit; wall.exitDist = exitDist; wall.mapX = mapX; wall.mapY = mapY; wall.side = hitSide; wall.layer = i;
                                      wall.topZ = topZ; wall.bottomZ = bottomZ;
                                      wall.isWindow = true;
                                      wall.clipBottom = currentClipBottom;
                                      wall.cutoutAxis = cutoutAxis;
                                      wall.cutoutTop = uLayer.cutoutTop;
                                      wall.cutoutBottom = uLayer.cutoutBottom;
                                      wall.cutoutLeft = uLayer.cutoutLeft;
                                      wall.cutoutRight = uLayer.cutoutRight;
                                      wall.glassTransparency = uLayer.glassTransparency;
                                      wall.glassOffset = uLayer.glassOffset;
                                      
                                      let exactGlassDist = 0;
                                      if (cutoutAxis === 'NS') {
                                          let glassY = mapY + uLayer.offsetVal! * (1.0 - uLayer.thickness!) + uLayer.glassOffset! * uLayer.thickness!;
                                          exactGlassDist = (glassY - posY) / rayDirY;
                                      } else {
                                          let glassX = mapX + uLayer.offsetVal! * (1.0 - uLayer.thickness!) + uLayer.glassOffset! * uLayer.thickness!;
                                          exactGlassDist = (glassX - posX) / rayDirX;
                                      }
                                      wall.glassDist = exactGlassDist;
                                      passThroughWalls[x].push(wall);

                                      // 2. Сама боковая стенка (cheek) на месте выхода из выреза
                                      const cheekWall = getWallFromPool();
                                      cheekWall.dist = exitDist;
                                      cheekWall.exitDist = exitDist + 0.05;
                                      cheekWall.mapX = mapX;
                                      cheekWall.mapY = mapY;
                                      cheekWall.side = cutoutAxis === 'NS' ? 0 : 1;
                                      cheekWall.layer = i;
                                      cheekWall.topZ = topZ;
                                      cheekWall.bottomZ = bottomZ;
                                      cheekWall.isWindow = true;
                                      cheekWall.clipBottom = currentClipBottom;
                                      cheekWall.cutoutAxis = cutoutAxis;
                                      cheekWall.cutoutTop = uLayer.cutoutTop;
                                      cheekWall.cutoutBottom = uLayer.cutoutBottom;
                                      cheekWall.cutoutLeft = uLayer.cutoutLeft;
                                      cheekWall.cutoutRight = uLayer.cutoutRight;
                                      cheekWall.glassTransparency = 0.0;
                                      cheekWall.glassOffset = 0.5;
                                      cheekWall.glassDist = exitDist;
                                      passThroughWalls[x].push(cheekWall);
                                  } else {
                                      const wall = getWallFromPool();
                                      wall.dist = tHit; wall.exitDist = exitDist; wall.mapX = mapX; wall.mapY = mapY; wall.side = hitSide; wall.layer = i;
                                      wall.topZ = topZ; wall.bottomZ = bottomZ;
                                      wall.isWindow = true;
                                      wall.clipBottom = currentClipBottom;
                                      wall.cutoutAxis = cutoutAxis;
                                      wall.cutoutTop = uLayer.cutoutTop;
                                      wall.cutoutBottom = uLayer.cutoutBottom;
                                      wall.cutoutLeft = uLayer.cutoutLeft;
                                      wall.cutoutRight = uLayer.cutoutRight;
                                      wall.glassTransparency = uLayer.glassTransparency;
                                      wall.glassOffset = uLayer.glassOffset;
                                      
                                      let exactGlassDist = 0;
                                      if (cutoutAxis === 'NS') {
                                          let glassY = mapY + uLayer.offsetVal! * (1.0 - uLayer.thickness!) + uLayer.glassOffset! * uLayer.thickness!;
                                          exactGlassDist = (glassY - posY) / rayDirY;
                                      } else {
                                          let glassX = mapX + uLayer.offsetVal! * (1.0 - uLayer.thickness!) + uLayer.glassOffset! * uLayer.thickness!;
                                          exactGlassDist = (glassX - posX) / rayDirX;
                                      }
                                      wall.glassDist = exactGlassDist;
                                      passThroughWalls[x].push(wall);
                                  }
                              }
                          } else {
                              let dist; if (side === 0) dist = (sideDistX - deltaDistX); else dist = (sideDistY - deltaDistY);
                              if (viewHeight > 0 && viewHeight / dist * (topZ - bottomZ) < 1.0) {
                                  continue;
                              }
                              const exitDist = Math.min(sideDistX, sideDistY);
                              pushPassThroughWall(
                                  passThroughWalls[x],
                                  dist,
                                  exitDist,
                                  mapX,
                                  mapY,
                                  side,
                                  i, // layer
                                  topZ,
                                  bottomZ,
                                  false, // isWindow
                                  uLayer.type === 'FLOOR', // isFloorWall
                                  topZ < 0 || bottomZ < 0, // isPitWall
                                  undefined,
                                  currentClipBottom
                              );
                          }
                      }
                  }
              }
          }
      }
      if (dist > 0.05) {
          const lineHeight = viewHeight / dist;

          // Far cells project to sub-pixel bands (< 1.5px) and cannot occlude
          // anything meaningful on screen; skip interval carving for them to
          // avoid O(floors) work per cell on long rays.
          if (lineHeight >= 1.5) {
          // 1. Bottom-most floor of this cell (occludes below it only if elevated above camera eye level)
          const bottomTile = grid[mapY]?.[mapX];
          const minFloorZ = getFloorLevel(bottomTile);
          
          // 2. Top-most ceiling of this cell (occludes above it if INDOOR)
          const yCeil = ceilingType === 'INDOOR' 
              ? Math.floor(horizon + lineHeight * (cameraZ - activeGrids.length))
              : -1;

          let occupiedCount = 0;
          if (minFloorZ >= cameraZ) {
              const yFloor = Math.ceil(horizon + lineHeight * (cameraZ - minFloorZ));
              if (yFloor < viewHeight) {
                  const start = yFloor > 0 ? yFloor : 0;
                  occupiedIntervals[occupiedCount * 2] = start;
                  occupiedIntervals[occupiedCount * 2 + 1] = viewHeight;
                  occupiedCount++;
              }
          }
          if (yCeil > 0) {
              const end = yCeil < viewHeight ? yCeil : viewHeight;
              occupiedIntervals[occupiedCount * 2] = 0;
              occupiedIntervals[occupiedCount * 2 + 1] = end;
              occupiedCount++;
          }

          // 3. For each active grid layer, if there is a flat solid wall, it covers [yTop, yBot]
          const solidLayers = solidWallCache[mapY]?.[mapX];
          if (solidLayers) {
              for (let idx = 0; idx < solidLayers.length; idx++) {
                  const solid = solidLayers[idx];
                  const yTop = Math.floor(horizon + lineHeight * (cameraZ - solid.absTopZ));
                  const yBot = Math.ceil(horizon + lineHeight * (cameraZ - solid.absBotZ));
                  
                  if (yTop < yBot) {
                      const start = yTop > 0 ? yTop : 0;
                      const end = yBot < viewHeight ? yBot : viewHeight;
                      occupiedIntervals[occupiedCount * 2] = start;
                      occupiedIntervals[occupiedCount * 2 + 1] = end;
                      occupiedCount++;
                  }
              }
          }

          // Subtract all occupied intervals from currentVisible
          for (let k = 0; k < occupiedCount; k++) {
              const oTop = occupiedIntervals[k * 2];
              const oBot = occupiedIntervals[k * 2 + 1];
              let nextCount = 0;
              
              for (let v = 0; v < visibleCount; v++) {
                  const vTop = currentVisible[v * 2];
                  const vBot = currentVisible[v * 2 + 1];
                  
                  if (oBot <= vTop || oTop >= vBot) {
                      // No overlap
                      if (nextCount < MAX_INTERVALS) {
                          nextVisible[nextCount * 2] = vTop;
                          nextVisible[nextCount * 2 + 1] = vBot;
                          nextCount++;
                      }
                  } else {
                      // Overlap!
                      if (oTop > vTop) {
                          if (nextCount < MAX_INTERVALS) {
                              nextVisible[nextCount * 2] = vTop;
                              nextVisible[nextCount * 2 + 1] = oTop;
                              nextCount++;
                          }
                      }
                      if (oBot < vBot) {
                          if (nextCount < MAX_INTERVALS) {
                              nextVisible[nextCount * 2] = oBot;
                              nextVisible[nextCount * 2 + 1] = vBot;
                              nextCount++;
                          }
                      }
                  }
              }
              
              // Swap currentVisible and nextVisible
              const temp = currentVisible;
              currentVisible = nextVisible;
              nextVisible = temp;
              visibleCount = nextCount;
          }

          if (visibleCount === 0) {
              break;
          }
          }
      }
    }
    
    if (hit === 1) {
        perpWallDist = firstHitPerpWallDist;
        mapX = firstHitMapX;
        mapY = firstHitMapY;
        side = firstHitSide;
        isDoor = firstHitIsDoor;
        isDoorEdge = firstHitIsDoorEdge;
        isDoorFrame = firstHitIsDoorFrame;
        doorOffset = firstHitDoorOffset;
        isTextureFlipped = firstHitIsTextureFlipped;
        hitInsideHinge = firstHitInsideHinge;
        geometryHitSide = firstHitGeometryHitSide;
    } else {
        if (overriddenDist !== undefined) {
            perpWallDist = overriddenDist;
        } else if (side === 0) {
            perpWallDist = (sideDistX - deltaDistX); 
        } else {
            perpWallDist = (sideDistY - deltaDistY); 
        }
    }

    outResult.hit = hit;
    outResult.side = side;
    outResult.perpWallDist = perpWallDist!;
    outResult.mapX = mapX;
    outResult.mapY = mapY;
    outResult.stepX = stepX;
    outResult.stepY = stepY;
    outResult.rayDirX = rayDirX;
    outResult.rayDirY = rayDirY;
    outResult.isDoor = isDoor;
    outResult.isDoorEdge = isDoorEdge;
    outResult.isDoorFrame = isDoorFrame;
    outResult.doorOffset = doorOffset;
    outResult.isTextureFlipped = isTextureFlipped;
    outResult.hitInsideHinge = hitInsideHinge;
    outResult.geometryHitSide = geometryHitSide;

    // The raycaster already performs interval-based occlusion while traversing
    // the map. Reuse that information instead of making WallRenderer rescan
    // every floor at the hit cell. Layer 0 is the primary hit; upper layers
    // are represented by pass-through walls only when their projected span was
    // visible at this ray.
    let visibleLayerMask = 0;
    let visibleCapMask = 0;
    if (hit && mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth) {
        const baseTile = grid[mapY]?.[mapX];
        if (baseTile && (baseTile.type === 'WALL' || (baseTile.type === 'FLOOR' && (baseTile.height ?? 0) > 0))) {
            visibleLayerMask |= 1;
        }
        const rayWalls = passThroughWalls[x];
        if (rayWalls && rayWalls.length) {
            // passThroughWalls is ordered by ray traversal. Once the hit cell
            // has been reached, its upper layers are contiguous; stop as soon
            // as traversal moves beyond that cell instead of scanning the rest
            // of the ray's pass-through list.
            let hitCellStarted = false;
            for (let i = 0; i < rayWalls.length; i++) {
                const w = rayWalls[i];
                if (w.mapX === mapX && w.mapY === mapY) {
                    hitCellStarted = true;
                    if (w.layer >= 0 && w.layer <= 30) visibleLayerMask |= (1 << w.layer);
                } else if (hitCellStarted) {
                    break;
                }
            }
        }

        // Exposure is precomputed per map cell. The per-ray operation is now
        // just a bitwise intersection with the already visibility-culled layers.
        visibleCapMask = visibleLayerMask & exposedCapCache[mapY * mapWidth + mapX];
    }
    outResult.visibleLayerMask = visibleLayerMask;
    outResult.visibleCapMask = visibleCapMask;

    return outResult;
};
