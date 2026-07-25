
import { LevelDefinition, Tile, Enemy, GameStrings, SoundConfig, EnemyDefinition, NPCDefinition, DecorationDefinition } from '../types';
import { ASSETS } from '../assets';
import { getTintedSprite, globalSpriteTintCache } from '../components/raycaster/SpriteCache';
import { getMaskBuffer, precalculateShards, precalculateGibs } from './particleSystem';
import { createBufferFromImage, RaycasterBuffer, globalBufferCache } from '../components/raycaster/RaycasterUtils';
import { clearRaycastCache } from '../components/raycaster/RaycastCore';
import { initBloodSplats } from './decalLogic';

export interface LoadedLevelData {
    wallTexture: HTMLImageElement;
    floorTexture: HTMLImageElement;
    doorTexture: HTMLImageElement;
    skyTexture: HTMLImageElement | null;
    ceilingTexture: HTMLImageElement | null;
    spriteMap: Map<string, HTMLImageElement>;
    enemies: Map<string, Enemy>;
    levelData: {
        name: string;
        rawName: string;
        description: string;
        objective: string;
        ceilingType: 'INDOOR' | 'OUTDOOR';
        weather: 'none' | 'rain' | 'fog';
        fogColor?: string;
        fogDistance?: number;
        grid: Tile[][];
        grids: Tile[][][]; // New array of grids
        width: number;
        height: number;
        lightMap: {r:number, g:number, b:number}[][];
        floorLightMaps?: {r:number, g:number, b:number}[][][];
        dynamicLights?: import('./levelLogic').DynamicLightSpread[];
        outdoorMap: boolean[][];
        triggers: any[]; // ADDED
        tasks: any[];
        baseLightInfo?: {
            globalLight: number;
            gridLight?: string[];
            lightDefinitions?: LevelDefinition['lightDefinitions'];
        };
        ambientSounds?: any[];
        gridSounds?: string[][];
        particles?: any[];
        keyMap: {[keyId: string]: string};
        // Expose definitions for pre-processing
        doorDefinitions?: { [char: string]: any }; 
        construction?: any[];
        enemiesPalette?: any[];
        npcsPalette?: any[];
        itemsPalette?: any[];
        decorationsPalette?: any[];
        portalsPalette?: any[];
    };
    startPos: { x: number, y: number };
    startDir: number; 
}

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
        const actualSrc = src && src.startsWith('local://') ? (localStorage.getItem(src.substring(8)) || src) : src;
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        
        if (!actualSrc) { 
            resolve(img); 
            return; 
        }

        img.src = actualSrc;

        // Force the browser to decode the image immediately.
        // This prevents "pop-in" or flickering when the image is first displayed in the UI.
        if (img.decode) {
            img.decode()
                .then(() => resolve(img))
                .catch((e) => {
                    console.warn(`Failed to decode image: ${actualSrc}`, e);
                    if (img.complete) {
                        resolve(img);
                    } else {
                        img.onload = () => resolve(img);
                        img.onerror = () => resolve(img);
                    }
                });
        } else {
            // Fallback for older browsers
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
        }
    });
};

/**
 * Preloads visual assets and SFX.
 * streaming: true (Music) -> Initiates download but DOES NOT WAIT (instant UI progression).
 * streaming: false (SFX) -> Waits for full decode (avoids lag during gameplay).
 */
export const preloadAllAssets = async (
    soundConfig: SoundConfig,
    onProgress: (pct: number, detail: string, type: 'TEXTURE' | 'SPRITE' | 'AUDIO' | 'OPTIMIZE') => void,
    onLoadSound: (url: string) => Promise<AudioBuffer | null>,
    onPrepareStream: (url: string, id: string) => void,
    enemyDb?: {[id: string]: EnemyDefinition},
    npcDb?: {[id: string]: NPCDefinition},
    decorationsDb?: {[id: string]: DecorationDefinition},
    spriteMap: Map<string, HTMLImageElement> = new Map()
): Promise<Map<string, HTMLImageElement>> => {
    // Generate fallback checkerboard texture
    const generateFallbackTexture = (): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const tileSize = 32;
                for (let y = 0; y < 64; y += tileSize) {
                    for (let x = 0; x < 64; x += tileSize) {
                        ctx.fillStyle = ((x / tileSize + y / tileSize) % 2 === 0) ? '#FF00FF' : '#000000';
                        ctx.fillRect(x, y, tileSize, tileSize);
                    }
                }
            }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
            img.src = canvas.toDataURL('image/png');
        });
    };

    const fallbackImg = await generateFallbackTexture();
    spriteMap.set('TEX_FALLBACK', fallbackImg);
    
    // 1. Audio Streams (Music and weather)
    const audioToStream = new Set<{url: string, id: string}>(); 
    Object.entries(soundConfig).forEach(([key, def]) => {
        const url = (ASSETS.SOUNDS as any)[def.assetId] || (ASSETS.SPRITES as any)[def.assetId];
        if (url && def.streaming) {
            audioToStream.add({url, id: key});
        }
    });
    
    const streamPromises = Array.from(audioToStream).map(async ({url, id}) => {
        try {
            await onPrepareStream(url, id);
        } catch(e) {}
    });

    await Promise.all(streamPromises);

    onProgress(92, 'Decals & Particles', 'OPTIMIZE');
    await new Promise(r => setTimeout(r, 0));
    initBloodSplats();

    // Precalculate all enemy gibs if available
    if (enemyDb) {
        let i = 0;
        const enemyKeys = Object.keys(enemyDb);
        for (const key of enemyKeys) {
            const enemy = enemyDb[key];
            if (enemy?.assets?.gibMask) {
                try {
                    const maskBuffer = getMaskBuffer(enemy.assets.gibMask, spriteMap);
                    if (maskBuffer) {
                        precalculateGibs(enemy.assets.map.assetId, maskBuffer, spriteMap);
                    }
                } catch (e) {
                    console.warn(`Failed to precalculate gibs for ${key}`, e);
                }
            }
            i++;
            if (i % 5 === 0) {
                 await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    if (decorationsDb) {
        let i = 0;
        const decKeys = Object.keys(decorationsDb);
        for (const key of decKeys) {
            const dec = decorationsDb[key];
            if (dec?.glassAssetId) {
                try {
                    precalculateShards(dec.glassAssetId, dec.glassAssetId, spriteMap);
                } catch (e) {}
            }
            // For barrels and other objects that might shatter
            if (dec?.shatterConfig && dec.textureId && dec.shatterConfig.maskId) {
                try {
                    precalculateShards(dec.textureId, dec.shatterConfig.maskId, spriteMap);
                } catch (e) {}
            }
            i++;
            if (i % 10 === 0) {
                 await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    // Give UI time to update
    await new Promise(r => setTimeout(r, 0));

    return spriteMap;
};

export interface DynamicLightSpread {
  mode: 'FLICKERING' | 'FIRE';
  spread: { x: number; y: number; r: number; g: number; b: number }[];
  flickerPeriod?: string | number;
  flickerAlwaysOn?: boolean;
  x?: number;
  y?: number;
  maxHeight?: number;
}

const DIRS_4_DX = new Int32Array([0, 0, 1, -1]);
const DIRS_4_DY = new Int32Array([1, -1, 0, 0]);

const DIRS_8_DX = new Int32Array([0, 0, 1, -1, 1, 1, -1, -1]);
const DIRS_8_DY = new Int32Array([1, -1, 0, 0, 1, -1, 1, -1]);
const DIRS_8_DIST = new Float32Array([1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414]);

let sharedQueueX = new Int32Array(2048);
let sharedQueueY = new Int32Array(2048);
let sharedQueueR = new Float32Array(2048);
let sharedQueueG = new Float32Array(2048);
let sharedQueueB = new Float32Array(2048);
let sharedVisited = new Uint8Array(2048);

const ensureBufferSize = (size: number) => {
    if (sharedQueueX.length < size) {
        sharedQueueX = new Int32Array(size);
        sharedQueueY = new Int32Array(size);
        sharedQueueR = new Float32Array(size);
        sharedQueueG = new Float32Array(size);
        sharedQueueB = new Float32Array(size);
        sharedVisited = new Uint8Array(size);
    }
};


export const computeLightingHash = (grid: Tile[][]): number => {
    if (!grid) return 0;
    const height = grid.length;
    const width = grid[0]?.length || 0;
    let hash = 2166136261;

    for (let y = 0; y < height; y++) {
        const row = grid[y];
        if (!row) continue;
        for (let x = 0; x < width; x++) {
            const tile = row[x];
            if (!tile) continue;
            if (tile.type === 'DOOR' && tile.door) {
                const state = tile.door.state;
                let stateVal = 0;
                if (state === 'OPENING') stateVal = 1;
                else if (state === 'OPEN') stateVal = 2;
                else if (state === 'CLOSING') stateVal = 3;
                const brokenVal = tile.door.broken ? 1 : 0;
                const val = (x << 16) ^ (y << 8) ^ (stateVal << 4) ^ brokenVal ^ 0x12345678;
                hash ^= val;
                hash = Math.imul(hash, 16777619);
            } else if (tile.isWindow) {
                const brokenVal = tile.isGlassBroken ? 1 : 0;
                const val = (x << 16) ^ (y << 8) ^ brokenVal ^ 0x87654321;
                hash ^= val;
                hash = Math.imul(hash, 16777619);
            } else if (tile.light) {
                const l = tile.light;
                const val = (x << 16) ^ (y << 8) ^ ((l.r * 255) | 0) ^ (((l.g * 255) | 0) << 8) ^ (((l.b * 255) | 0) << 16) ^ (((l.intensity || 1) * 100) | 0);
                hash ^= val;
                hash = Math.imul(hash, 16777619);
            } else if (tile.decorations && tile.decorations.length > 0) {
                for (const dec of tile.decorations) {
                    if (dec.light) {
                        const dl = dec.light;
                        const val = (x << 16) ^ (y << 8) ^ ((dl.r * 255) | 0) ^ (((dl.g * 255) | 0) << 8) ^ (((dl.b * 255) | 0) << 16);
                        hash ^= val;
                        hash = Math.imul(hash, 16777619);
                    }
                }
            } else if (tile.decoration?.light) {
                const dl = tile.decoration.light;
                const val = (x << 16) ^ (y << 8) ^ ((dl.r * 255) | 0) ^ (((dl.g * 255) | 0) << 8) ^ (((dl.b * 255) | 0) << 16);
                hash ^= val;
                hash = Math.imul(hash, 16777619);
            }
        }
    }
    return hash;
};

interface CachedLightMapResult {
    baseLightMap: { r: number, g: number, b: number }[][];
    floorLightMaps?: { r: number, g: number, b: number }[][][];
    dynamicLights: DynamicLightSpread[];
}

const lightMapCache = new Map<string, CachedLightMapResult>();

export const clearLightMapCache = () => {
    lightMapCache.clear();
};

function cloneLightMapResult(res: CachedLightMapResult): CachedLightMapResult {
    const height = res.baseLightMap.length;
    const baseLightMap = new Array(height);
    for (let y = 0; y < height; y++) {
        const row = res.baseLightMap[y];
        const w = row.length;
        const newRow = new Array(w);
        for (let x = 0; x < w; x++) {
            const cell = row[x];
            newRow[x] = { r: cell.r, g: cell.g, b: cell.b };
        }
        baseLightMap[y] = newRow;
    }

    let floorLightMaps: { r: number, g: number, b: number }[][][] | undefined = undefined;
    if (res.floorLightMaps) {
        const numFloors = res.floorLightMaps.length;
        floorLightMaps = new Array(numFloors);
        for (let fl = 0; fl < numFloors; fl++) {
            const floor = res.floorLightMaps[fl];
            const flHeight = floor.length;
            const newFloor = new Array(flHeight);
            for (let y = 0; y < flHeight; y++) {
                const row = floor[y];
                const w = row.length;
                const newRow = new Array(w);
                for (let x = 0; x < w; x++) {
                    const cell = row[x];
                    newRow[x] = { r: cell.r, g: cell.g, b: cell.b };
                }
                newFloor[y] = newRow;
            }
            floorLightMaps[fl] = newFloor;
        }
    }

    return {
        baseLightMap,
        floorLightMaps,
        dynamicLights: res.dynamicLights
    };
}

export const prebakeDoorLighting = (
    grid: Tile[][], 
    lightDef: string[] | undefined, 
    globalLight: number,
    lightDefinitions: LevelDefinition['lightDefinitions'],
    outdoorMap?: boolean[][],
    grids?: Tile[][][]
) => {
    if (!grid) return;
    const doors: { x: number; y: number; originalState: any; originalOpenAmount: number }[] = [];
    const height = grid.length;
    const width = grid[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = grid[y]?.[x];
            if (tile && tile.type === 'DOOR' && tile.door) {
                doors.push({
                    x,
                    y,
                    originalState: tile.door.state,
                    originalOpenAmount: tile.door.openAmount
                });
            }
        }
    }

    // 1. Bake default initial state
    calculateLightMap(grid, lightDef, globalLight, lightDefinitions, outdoorMap, grids);

    // 2. Pre-bake individual door open states
    for (const d of doors) {
        const tile = grid[d.y]?.[d.x];
        if (tile && tile.door) {
            tile.door.state = 'OPEN';
            tile.door.openAmount = 0.85;
            calculateLightMap(grid, lightDef, globalLight, lightDefinitions, outdoorMap, grids);
            tile.door.state = d.originalState;
            tile.door.openAmount = d.originalOpenAmount;
        }
    }
};

export const calculateLightMap = (
    grid: Tile[][], 
    lightDef: string[] | undefined, 
    globalLight: number,
    lightDefinitions: LevelDefinition['lightDefinitions'],
    outdoorMap?: boolean[][],
    grids?: Tile[][][]
): { baseLightMap: {r:number, g:number, b:number}[][], floorLightMaps?: {r:number, g:number, b:number}[][][], dynamicLights: DynamicLightSpread[] } => {
    if (grids && grids.length > 0) {
        grids = [grid, ...grids.slice(1)];
    }
    const height = grid.length;
    const width = grid[0].length;
    const size = width * height;

    const hash = computeLightingHash(grid);
    const cacheKey = `${hash}_${globalLight}_${height}x${width}_${outdoorMap ? 1 : 0}_${grids ? grids.length : 0}`;
    const cached = lightMapCache.get(cacheKey);
    if (cached) {
        return cloneLightMapResult(cached);
    }

    const isLevelOutdoor = !!(outdoorMap && outdoorMap.some(row => row.includes(true)));

    // Reusable BFS function for light propagation to ensure extreme speed and minimal memory allocations
    const propagateBFS = (
        offset: number,
        layerDist: Float32Array,
        activeGrid: Tile[][],
        outQueueX: Int32Array,
        outQueueY: Int32Array,
        outHead: number,
        outTail: number
    ) => {
        while (outHead < outTail) {
            const cx = outQueueX[outHead];
            const cy = outQueueY[outHead];
            outHead++;

            const currentDist = layerDist[offset + cy * width + cx];

            // Closed doors and solid walls block further light propagation entirely
            const currentTile = activeGrid[cy]?.[cx];
            if (currentTile) {
                if (currentTile.type === 'WALL' && !currentTile.isWindow) {
                    continue;
                }
                const isClosedDoor = currentTile.type === 'DOOR' && currentTile.door && (currentTile.door.state === 'CLOSED' || currentTile.door.state === 'CLOSING') && !currentTile.door.broken;
                if (isClosedDoor && !currentTile.door.maskId) {
                    continue;
                }
            }

            for (let i = 0; i < 4; i++) {
                const dx = DIRS_4_DX[i];
                const dy = DIRS_4_DY[i];
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nTile = activeGrid[ny]?.[nx];
                    let stepCost = 0.1; // Default decay step inside rooms
                    
                    if (nTile) {
                        const isNeighborClosedDoor = nTile.type === 'DOOR' && nTile.door && (nTile.door.state === 'CLOSED' || nTile.door.state === 'CLOSING') && !nTile.door.broken && !nTile.door.maskId;
                        
                        if (isNeighborClosedDoor) {
                            if (nTile.door?.maskId) {
                                stepCost = 0.2;
                            } else {
                                stepCost = 0.1;
                            }
                        } else if (nTile.isWindow) {
                            const hasGlass = nTile.glassAssetId && !nTile.isGlassBroken;
                            stepCost = hasGlass ? 0.2 : 0.1;
                        }
                    }
                    const nIdx = offset + ny * width + nx;
                    if (layerDist[nIdx] > currentDist + stepCost) {
                        layerDist[nIdx] = currentDist + stepCost;
                        outQueueX[outTail] = nx;
                        outQueueY[outTail] = ny;
                        outTail++;
                    }
                }
            }
        }
    };

    // Precalculate the highest solid tile index for each column (x, y) to optimize getLayerDist
    const highestSolidAbove = new Int32Array(size);
    highestSolidAbove.fill(-1);
    if (grids && grids.length > 0) {
        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                let maxIdx = -1;
                for (let i = 0; i < grids.length; i++) {
                    const tile = grids[i]?.[y]?.[x];
                    if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door && (tile.door.state === 'CLOSED' || tile.door.state === 'CLOSING') && !tile.door.broken && !tile.door.maskId))) {
                        maxIdx = i;
                    }
                }
                highestSolidAbove[rowOffset + x] = maxIdx;
            }
        }
    }

    const numFloors = grids ? grids.length : 0;
    const layerDists = new Float32Array((numFloors || 1) * size);

    const getLayerDist = (fl: number) => {
        const offset = fl * size;
        layerDists.fill(Infinity, offset, offset + size);
        if (!isLevelOutdoor) {
            return;
        }

        ensureBufferSize(size);
        const outQueueX = sharedQueueX;
        const outQueueY = sharedQueueY;
        let outHead = 0;
        let outTail = 0;

        if (!grids || !grids[fl]) {
            // Fallback to 2D outdoorMap if 3D grids are not present or this layer isn't defined
            if (outdoorMap) {
                for (let y = 0; y < height; y++) {
                    const row = outdoorMap[y];
                    if (!row) continue;
                    for (let x = 0; x < width; x++) {
                        if (row[x]) {
                            layerDists[offset + y * width + x] = 0;
                            outQueueX[outTail] = x;
                            outQueueY[outTail] = y;
                            outTail++;
                        }
                    }
                }
                propagateBFS(offset, layerDists, grid, outQueueX, outQueueY, outHead, outTail);
            }
            return;
        }

        // Layer-specific outdoor logic using our O(1) height cache
        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                if (fl > highestSolidAbove[rowOffset + x]) {
                    layerDists[offset + rowOffset + x] = 0;
                    outQueueX[outTail] = x;
                    outQueueY[outTail] = y;
                    outTail++;
                }
            }
        }

        propagateBFS(offset, layerDists, grids[fl], outQueueX, outQueueY, outHead, outTail);
    };

    const floorLightMaps: {r: number, g: number, b: number}[][][] | undefined = numFloors > 0 ? new Array(numFloors) : undefined;

    if (isLevelOutdoor && numFloors > 0) {
        for (let fl = 0; fl < numFloors; fl++) {
            getLayerDist(fl);
        }

        // Fast vertical relaxation passes to let street/window light propagate vertically 
        // through multi-story empty spaces, unless blocked by a solid vertical wall.
        for (let pass = 0; pass < 2; pass++) {
            // Propagate light upwards from lower floors to upper floors
            for (let fl = 1; fl < numFloors; fl++) {
                const prevOffset = (fl - 1) * size;
                const currOffset = fl * size;
                const prevGridRow = grids[fl - 1];
                for (let y = 0; y < height; y++) {
                    const pGrid = prevGridRow ? prevGridRow[y] : null;
                    const rowOffset = y * width;
                    for (let x = 0; x < width; x++) {
                        const prevTile = pGrid ? pGrid[x] : null;
                        const prevIsSolidWall = prevTile && (
                            (prevTile.type === 'WALL' && !prevTile.isWindow) ||
                            (prevTile.type === 'DOOR' && prevTile.door && (prevTile.door.state === 'CLOSED' || prevTile.door.state === 'CLOSING') && !prevTile.door.broken && !prevTile.door.maskId)
                        );
                        if (!prevIsSolidWall) {
                            const val = layerDists[prevOffset + rowOffset + x] + 0.1;
                            if (val < layerDists[currOffset + rowOffset + x]) {
                                layerDists[currOffset + rowOffset + x] = val;
                            }
                        }
                    }
                }
            }

            // Propagate light downwards from upper floors to lower floors (e.g. if a window is on an upper floor)
            for (let fl = numFloors - 2; fl >= 0; fl--) {
                const nextOffset = (fl + 1) * size;
                const currOffset = fl * size;
                const nextGridRow = grids[fl + 1];
                for (let y = 0; y < height; y++) {
                    const nGrid = nextGridRow ? nextGridRow[y] : null;
                    const rowOffset = y * width;
                    for (let x = 0; x < width; x++) {
                        const nextTile = nGrid ? nGrid[x] : null;
                        const nextIsSolidWall = nextTile && (
                            (nextTile.type === 'WALL' && !nextTile.isWindow) ||
                            (nextTile.type === 'DOOR' && nextTile.door && (nextTile.door.state === 'CLOSED' || nextTile.door.state === 'CLOSING') && !nextTile.door.broken && !nextTile.door.maskId)
                        );
                        if (!nextIsSolidWall) {
                            const val = layerDists[nextOffset + rowOffset + x] + 0.1;
                            if (val < layerDists[currOffset + rowOffset + x]) {
                                layerDists[currOffset + rowOffset + x] = val;
                            }
                        }
                    }
                }
            }
        }
    }

    const lightMap: {r: number, g: number, b: number}[][] = new Array(height);
    const groundOffset = 0;
    for (let y = 0; y < height; y++) {
        const row = new Array(width);
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            let factor = 1.0;
            if (isLevelOutdoor && numFloors > 0) {
                const d = layerDists[groundOffset + rowOffset + x];
                if (d !== 0) {
                    factor = d === Infinity ? 0.1 : Math.max(0.1, 1.0 - d);
                }
            }
            const baseLight = globalLight * factor;
            row[x] = { r: baseLight, g: baseLight, b: baseLight };
        }
        lightMap[y] = row;
    }

    if (floorLightMaps) {
        for (let fl = 0; fl < numFloors; fl++) {
            const layer = new Array(height);
            const currOffset = fl * size;
            for (let y = 0; y < height; y++) {
                const row = new Array(width);
                const rowOffset = y * width;
                for (let x = 0; x < width; x++) {
                    let factor = 1.0;
                    if (isLevelOutdoor && numFloors > 0) {
                        const d = layerDists[currOffset + rowOffset + x];
                        if (d !== 0) {
                            factor = d === Infinity ? 0.1 : Math.max(0.1, 1.0 - d);
                        }
                    }
                    const baseLight = globalLight * factor;
                    row[x] = { r: baseLight, g: baseLight, b: baseLight };
                }
                layer[y] = row;
            }
            floorLightMaps[fl] = layer;
        }
    }

    interface LightSource { x: number; y: number; r: number; g: number; b: number; range: number; mode: 'STATIC'|'FLICKERING'|'FIRE'; flickerPeriod?: string | number; flickerAlwaysOn?: boolean; maxHeight?: number; }
    const sources: LightSource[] = [];

    for (let y = 0; y < height; y++) {
        const rowStr = lightDef ? lightDef[y] : "";
        for (let x = 0; x < width; x++) {
            const char = x < rowStr.length ? rowStr[x] : '.';
            let parsedLight = false;
            let r = 1.0, g = 1.0, b = 1.0;
            let intensity = 1.0;
            let range = 6;
            let mode: 'STATIC' | 'FLICKERING' | 'FIRE' = 'STATIC';
            let flickerPeriod: string | number | undefined = undefined;
            let flickerAlwaysOn: boolean | undefined = undefined;
            let maxHeight = 0;

            if (char !== '.') {
                if (lightDefinitions && lightDefinitions[char]) {
                     const def = lightDefinitions[char];
                     r = def.r > 1 ? def.r / 255 : def.r;
                     g = def.g > 1 ? def.g / 255 : def.g;
                     b = def.b > 1 ? def.b / 255 : def.b;
                     intensity = def.intensity ?? 1.0;
                     range = def.range ?? 6;
                     mode = def.mode || 'STATIC';
                     flickerPeriod = def.flickerPeriod;
                     flickerAlwaysOn = def.flickerAlwaysOn;
                     maxHeight = def.maxHeight ?? 0;
                     parsedLight = true;
                } else if (char >= '1' && char <= '9') {
                    intensity = parseInt(char) / 9; 
                    parsedLight = true;
                } else if (char === 'F') {
                    intensity = 1.2; 
                    parsedLight = true;
                }
            }

            if (!parsedLight && grid[y] && grid[y][x]?.light) {
                const def = grid[y][x].light;
                r = def.r > 1 ? def.r / 255 : def.r;
                g = def.g > 1 ? def.g / 255 : def.g;
                b = def.b > 1 ? def.b / 255 : def.b;
                intensity = def.intensity ?? 1.0;
                range = def.range ?? 6;
                mode = def.mode || 'STATIC';
                flickerPeriod = def.flickerPeriod;
                flickerAlwaysOn = def.flickerAlwaysOn;
                maxHeight = (def as any).maxHeight ?? 0;
                parsedLight = true;
            }

            const tileDecs = grid[y] && grid[y][x]?.decorations && grid[y][x].decorations!.length > 0
                ? grid[y][x].decorations!
                : (grid[y] && grid[y][x]?.decoration ? [grid[y][x].decoration!] : []);

            for (const dec of tileDecs) {
                if (dec.light) {
                    const def = dec.light;
                    const decR = def.r > 1 ? def.r / 255 : def.r;
                    const decG = def.g > 1 ? def.g / 255 : def.g;
                    const decB = def.b > 1 ? def.b / 255 : def.b;
                    const decIntensity = def.intensity ?? 1.0;
                    const decRange = def.range ?? 6;
                    const decMode = def.mode || 'STATIC';
                    const decFlickerPeriod = def.flickerPeriod;
                    const decFlickerAlwaysOn = def.flickerAlwaysOn;
                    const decMaxHeight = (def as any).maxHeight ?? 0;
                    if (decIntensity > 0) {
                        sources.push({ x, y, r: decR * decIntensity, g: decG * decIntensity, b: decB * decIntensity, range: decRange, mode: decMode, flickerPeriod: decFlickerPeriod, flickerAlwaysOn: decFlickerAlwaysOn, maxHeight: decMaxHeight });
                    }
                }
            }

            if (parsedLight && intensity > 0) {
                sources.push({ x, y, r: r * intensity, g: g * intensity, b: b * intensity, range, mode, flickerPeriod, flickerAlwaysOn, maxHeight });
            }
        }
    }

    const dynamicLights: DynamicLightSpread[] = [];

    // Use statically preallocated shared typed arrays to prevent GC pauses
    ensureBufferSize(size);
    const queueX = sharedQueueX;
    const queueY = sharedQueueY;
    const queueR = sharedQueueR;
    const queueG = sharedQueueG;
    const queueB = sharedQueueB;
    const visited = sharedVisited;

    const numSources = sources.length;
    for (let sIdx = 0; sIdx < numSources; sIdx++) {
         const source = sources[sIdx];
         let head = 0;
         let tail = 0;
         visited.fill(0);
         
         queueX[tail] = source.x;
         queueY[tail] = source.y;
         queueR[tail] = source.r;
         queueG[tail] = source.g;
         queueB[tail] = source.b;
         tail++;
         
         visited[source.y * width + source.x] = 1;
         
         const spreadObj: DynamicLightSpread | null = (source.mode === 'STATIC') ? null : { 
             mode: source.mode, 
             spread: [], 
             flickerPeriod: source.flickerPeriod, 
             flickerAlwaysOn: source.flickerAlwaysOn,
             x: source.x, 
             y: source.y,
             maxHeight: source.maxHeight
         };
         
         while (head < tail) {
             const x = queueX[head];
             const y = queueY[head];
             const r = queueR[head];
             const g = queueG[head];
             const b = queueB[head];
             head++;
             
             if (spreadObj) {
                 spreadObj.spread.push({ x, y, r, g, b });
             } else {
                 lightMap[y][x].r = Math.min(1.0, lightMap[y][x].r + r);
                 lightMap[y][x].g = Math.min(1.0, lightMap[y][x].g + g);
                 lightMap[y][x].b = Math.min(1.0, lightMap[y][x].b + b);

                 if (floorLightMaps) {
                     const maxFl = Math.min(numFloors, 8);
                     for (let fl = 0; fl < maxFl; fl++) {
                         if (!source.maxHeight || source.maxHeight === 0 || fl < source.maxHeight) {
                             floorLightMaps[fl][y][x].r = Math.min(1.0, floorLightMaps[fl][y][x].r + r);
                             floorLightMaps[fl][y][x].g = Math.min(1.0, floorLightMaps[fl][y][x].g + g);
                             floorLightMaps[fl][y][x].b = Math.min(1.0, floorLightMaps[fl][y][x].b + b);
                         }
                     }
                 }
             }
             
             const maxBright = Math.max(r, g, b);
             if (maxBright <= 0.05) continue; 
             
             const currentTile = grid[y][x];
             if (currentTile) {
                 const isWall = currentTile.type === 'WALL' && !currentTile.isWindow;
                 const isDoorClosed = currentTile.type === 'DOOR' && (currentTile.door?.state === 'CLOSED' || currentTile.door?.state === 'CLOSING') && !currentTile.door?.maskId && !currentTile.door?.broken;
                 if ((isWall || isDoorClosed) && !(x === source.x && y === source.y)) continue;
             }

             for (let i = 0; i < 8; i++) {
                 const dx = DIRS_8_DX[i];
                 const dy = DIRS_8_DY[i];
                 const dist = DIRS_8_DIST[i];
                 const nx = x + dx;
                 const ny = y + dy;
                 if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                     const idx = ny * width + nx;
                     if (visited[idx] === 0) {
                         visited[idx] = 1;
                         const decayBase = 1.0 / source.range; 
                         const decay = decayBase * dist;
                         
                         let multiplier = 1.0;
                         const nTile = grid[ny]?.[nx];
                         if (nTile && nTile.isWindow) {
                             const hasGlass = nTile.glassAssetId && !nTile.isGlassBroken;
                             multiplier = hasGlass ? 0.75 : 0.95;
                         }

                         const nextR = Math.max(0, r - decay) * multiplier;
                         const nextG = Math.max(0, g - decay) * multiplier;
                         const nextB = Math.max(0, b - decay) * multiplier;
                         if (Math.max(nextR, nextG, nextB) > 0) {
                             queueX[tail] = nx;
                             queueY[tail] = ny;
                             queueR[tail] = nextR;
                             queueG[tail] = nextG;
                             queueB[tail] = nextB;
                             tail++;
                         }
                     }
                 }
             }
         }
         if (spreadObj && spreadObj.spread.length > 0) {
             dynamicLights.push(spreadObj);
         }
    }

    const resultToCache = { baseLightMap: lightMap, floorLightMaps, dynamicLights };
    if (lightMapCache.size > 128) {
        lightMapCache.clear();
    }
    lightMapCache.set(cacheKey, resultToCache);

    return cloneLightMapResult(resultToCache);
};



export const parseLevelData = async (
    data: LevelDefinition, 
    S: GameStrings, 
    language: 'en' | 'ru',
    masterSpriteMap: Map<string, HTMLImageElement>,
    enemiesDb: {[id: string]: EnemyDefinition},
    npcsDb: {[id: string]: NPCDefinition},
    decorationsDb: {[id: string]: DecorationDefinition},
    itemsDb: any,
    targetPortalId?: string
): Promise<LoadedLevelData> => {

    const localize = (text: string | undefined): string => {
        if (!text) return "";
        const idx = text.indexOf('/');
        if (idx !== -1) {
            const ru = text.substring(0, idx).trim();
            const en = text.substring(idx + 1).trim();
            return language === 'ru' ? ru : en;
        }
        return text;
    };

    // Helper to get raw parts for dynamic string construction (e.g. replacing placeholders in raw strings)
    const getParts = (str: string) => {
        const idx = str.indexOf('/');
        if (idx !== -1) return [str.substring(0, idx).trim(), str.substring(idx + 1).trim()];
        return [str, str];
    };

    const fallbackTexture = masterSpriteMap.get('TEX_FALLBACK')!;
    
    const getTexture = (key: string): HTMLImageElement => {
        const img = masterSpriteMap.get(key);
        if (img && img.width > 0) return img;
        return fallbackTexture;
    };

    const wallTexture = getTexture('TEX_WALL');
    const floorTexture = getTexture('TEX_FLOOR');
    const doorTexture = getTexture('TEX_DOOR');
    
    let skyTexture: HTMLImageElement | null = null;
    
    if (data.skyboxTextureId && data.skyboxTextureId.trim() !== "") {
        const texKey = `TEX_${data.skyboxTextureId}`;
        const tex = masterSpriteMap.get(texKey) || masterSpriteMap.get(data.skyboxTextureId);
        if (tex && tex.width > 0) {
            skyTexture = tex;
        } else {
            skyTexture = fallbackTexture;
        }
    }
    
    let ceilingTexture = masterSpriteMap.get('TEX_CEILING_TEX') || null;
    if (ceilingTexture && ceilingTexture.width === 0) ceilingTexture = null;
    
    if (data.ceilingType === 'INDOOR' && data.ceilingTextureId) {
        const customCeiling = masterSpriteMap.get(`TEX_${data.ceilingTextureId}`);
        if (customCeiling && customCeiling.width > 0) {
            ceilingTexture = customCeiling;
        } else {
            ceilingTexture = fallbackTexture;
        }
    }

    const newEnemies = new Map<string, Enemy>();
    const itemsPalette = new Map<string, any>();
    const keyMap: {[keyId: string]: string} = {};

    data.items?.forEach(i => {
        let definition = i;
        if (i.id && itemsDb && itemsDb[i.id]) {
            definition = { ...itemsDb[i.id], ...i };
        }
        itemsPalette.set(i.symbol, definition);
        if (definition.type === 'KEY' && definition.keyId) {
            keyMap[definition.keyId] = localize(definition.name);
        }
    });

    const enemyPalette = new Map<string, any>();
    data.enemies?.forEach(e => {
        if (e.id && enemiesDb && enemiesDb[e.id]) {
            const def = enemiesDb[e.id];
            const resolvedEnemy = { ...def, ...e }; 
            enemyPalette.set(e.symbol, resolvedEnemy);
        } else {
            console.warn(`Enemy ID ${e.id} not found in database or legacy format used.`);
            enemyPalette.set(e.symbol, e);
        }
    });
    
    const npcPalette = new Map<string, any>();
    data.NPCs?.forEach(n => {
        if (n.id && npcsDb && npcsDb[n.id]) {
            const def = npcsDb[n.id];
            const resolvedNPC = { ...def, ...n };
            npcPalette.set(n.symbol, resolvedNPC);
        } else {
            npcPalette.set(n.symbol, n);
        }
    });

    const decorPalette = new Map<string, any>();
    data.decorations?.forEach(d => {
        if (d.id && decorationsDb && decorationsDb[d.id]) {
            const def = decorationsDb[d.id];
            decorPalette.set(d.symbol, { ...def, ...d });
        } else {
            decorPalette.set(d.symbol, d);
        }
    });

    const resolveChar = (char: string): string[] => {
        if (!char || char === '.') return [];

        const item = data.items?.find((i: any) => i.symbol === char);
        if (item && item.combo && Array.isArray(item.combo)) {
            return item.combo.flatMap(resolveChar);
        }

        const enemy = data.enemies?.find((e: any) => e.symbol === char);
        if (enemy && enemy.combo && Array.isArray(enemy.combo)) {
            return enemy.combo.flatMap(resolveChar);
        }

        const npc = data.NPCs?.find((n: any) => n.symbol === char);
        if (npc && npc.combo && Array.isArray(npc.combo)) {
            return npc.combo.flatMap(resolveChar);
        }

        const decor = data.decorations?.find((d: any) => d.symbol === char);
        if (decor && decor.combo && Array.isArray(decor.combo)) {
            return decor.combo.flatMap(resolveChar);
        }

        const leg = data.legend?.find((l: any) => l.char === char);
        if (leg) {
            if ((leg as any).combo && Array.isArray((leg as any).combo)) {
                return (leg as any).combo.flatMap(resolveChar);
            }
            if ((leg as any).entities && Array.isArray((leg as any).entities)) {
                return (leg as any).entities.flatMap(resolveChar);
            }
        }

        return [char];
    };

    const doorDefinitions = data.doorDefinitions || {};
    const legendPalette = new Map<string, string>();
    data.legend?.forEach(l => legendPalette.set(l.char, l.description));
    
    const constructionPalette = new Map<string, { type?: 'floor' | 'wall' | 'window', assetId: string, floorAssetId?: string, isWater?: boolean, ladder?: boolean, footstepSound?: string, fallSound?: string, bottomTextureId?: string, topTextureId?: string, topTextureRotation?: number, mirror?: boolean, maskId?: string, maskTargetAsset?: string, mirrorOpacity?: number, canBeDestroyed?: boolean, blocking?: boolean, faces?: Partial<Record<'N' | 'E' | 'S' | 'W', string>>, keylock?: boolean, keypadDirection?: 'N'|'E'|'S'|'W', keypadAssetId?: string, keypadMaskAssetId?: string, keypadSound?: string, keypadSuccessSound?: string, keypadFailSound?: string, targetId?: string, password?: string, height?: number, glassAssetId?: string, glassTransparency?: number, glassOffset?: number, glassBreakSound?: string, cutoutAxis?: 'NS'|'WE', cutout?: { topLeft: {x:number, y:number}, bottomRight: {x:number, y:number} }, thickness?: number, offset?: number }>();
    if (data.construction) {
        data.construction.forEach(c => constructionPalette.set(c.symbol, { 
            type: (c as any).type, // Store explicit type if available
            assetId: c.assetId, 
            floorAssetId: (c as any).floorAssetId,
            isWater: (c as any).isWater,
            ladder: (c as any).ladder,
            footstepSound: (c as any).footstepSound,
            fallSound: (c as any).fallSound,
            bottomTextureId: (c as any).bottomTextureId,
            topTextureId: (c as any).topTextureId,
            topTextureRotation: (c as any).topTextureRotation,
            mirror: (c as any).mirror,
            maskId: (c as any).maskId,
            maskTargetAsset: (c as any).maskTargetAsset,
            mirrorOpacity: (c as any).mirrorOpacity,
            canBeDestroyed: (c as any).canBeDestroyed,
            blocking: (c as any).blocking,
            faces: (c as any).faces,
            keylock: (c as any).keylock,
            keypadDirection: (c as any).keypadDirection,
            keypadAssetId: (c as any).keypadAssetId,
            keypadMaskAssetId: (c as any).keypadMaskAssetId,
            keypadSound: (c as any).keypadSound,
            keypadSuccessSound: (c as any).keypadSuccessSound,
            keypadFailSound: (c as any).keypadFailSound,
            targetId: (c as any).targetId,
            password: (c as any).password,
            height: (c as any).height,
            glassAssetId: (c as any).glassAssetId,
            glassTransparency: (c as any).glassTransparency,
            glassOffset: (c as any).glassOffset,
            glassBreakSound: (c as any).glassBreakSound,
            thickness: (c as any).thickness,
            offset: (c as any).offset,
            cutoutAxis: (c as any).cutoutAxis,
            cutout: (c as any).cutout
        }));
    }

    const portalPalette = new Map<string, { destination?: string, assetId?: string, portalId: string, targetPortalId?: string, targetDirection?: 'N' | 'E' | 'S' | 'W' }>();
    if (data.portals) {
        data.portals.forEach(p => portalPalette.set(p.symbol, { destination: p.destination, assetId: p.assetId || 'EXIT', portalId: p.portalId, targetPortalId: p.targetPortalId, targetDirection: p.targetDirection }));
    }

    // Determine raw grids. Use new 'grids' property or fallback to 'grid' wrapped in array.
    const originalGrids = data.grids || (data.grid ? [data.grid] : []);
    const sourceGrids = [...originalGrids];
    const isIndoorLevel = (data.ceilingType || (data.skyboxTextureId ? 'OUTDOOR' : 'INDOOR')) === 'INDOOR';
    let addedExtraLayer = false;
    let safeChar = '#';

    if (isIndoorLevel && originalGrids.length > 0) {
        const allChars = new Set<string>();
        for (const grid of originalGrids) {
            for (const row of grid) {
                for (let i = 0; i < row.length; i++) {
                    allChars.add(row[i]);
                }
            }
        }
        const candidates = ['#', '█', '▓', '▒', '░', '¶', '§', '\uFFFF'];
        for (const c of candidates) {
            if (!allChars.has(c)) {
                safeChar = c;
                break;
            }
        }
        const width = originalGrids[0].reduce((max, row) => Math.max(max, row.length), 0);
        const height = originalGrids[0].length;
        const extraLayer = Array(height).fill(safeChar.repeat(width));
        sourceGrids.push(extraLayer);
        addedExtraLayer = true;
    }

    const sourceEntities = data.entities || []; // NEW
    const sourceItems = data.itemsGrid || []; // NEW: separate grid for items
    
    // Determine dimensions from the first grid (Ground Floor)
    const width = sourceGrids[0].reduce((max, row) => Math.max(max, row.length), 0);
    const height = sourceGrids[0].length;

    let startPos = { x: 0, y: 0 };
    let hasStart = false;
    let startDir = 1; 

    // Parse each grid layer
    const parsedGrids: Tile[][][] = sourceGrids.map((gridLayer, layerIndex) => {
        const grid: Tile[][] = [];
        
        gridLayer.forEach((rowStr, y) => {
            const row: Tile[] = [];
            for (let x = 0; x < width; x++) {
                const char = x < rowStr.length ? rowStr[x] : safeChar; 
                const entityChar = (sourceEntities.length > layerIndex && sourceEntities[layerIndex].length > y && sourceEntities[layerIndex][y].length > x) ? sourceEntities[layerIndex][y][x] : '.';
                const itemChar = (sourceItems.length > layerIndex && sourceItems[layerIndex].length > y && sourceItems[layerIndex][y].length > x) ? sourceItems[layerIndex][y][x] : '.';
                const activeChar = (entityChar && entityChar !== '.') ? entityChar : char;

                const defaultDesc = localize(legendPalette.get(activeChar)) || '';
                const constr = constructionPalette.get(char); // Floor/Wall construction is based on char
                
                const tile: Tile = { 
                    x, y, 
                    type: 'FLOOR', 
                    description: defaultDesc, 
                    isExplored: false, 
                    items: [], 
                    assetId: constr?.assetId,
                    floorAssetId: constr?.floorAssetId,
                    isWater: constr?.isWater,
                    ladder: constr?.ladder,
                    footstepSound: constr?.footstepSound,
                    fallSound: constr?.fallSound,
                    bottomTextureId: constr?.bottomTextureId,
                    topTextureId: constr?.topTextureId,
                    topTextureRotation: constr?.topTextureRotation,
                    mirror: constr?.mirror,
                    maskId: constr?.maskId,
                    maskTargetAsset: constr?.maskTargetAsset,
                    mirrorOpacity: constr?.mirrorOpacity,
                    canBeDestroyed: constr?.canBeDestroyed,
                    blocking: constr?.blocking,
                    faces: constr?.faces,
                    keylock: constr?.keylock,
                    keypadDirection: constr?.keypadDirection,
                    keypadAssetId: constr?.keypadAssetId,
                    keypadMaskAssetId: constr?.keypadMaskAssetId,
                    keypadSound: constr?.keypadSound,
                    keypadSuccessSound: constr?.keypadSuccessSound,
                    keypadFailSound: constr?.keypadFailSound,
                    targetId: constr?.targetId,
                    password: constr?.password ? String(constr.password) : undefined,
                    height: constr?.height,
                    glassAssetId: constr?.glassAssetId,
                    glassTransparency: constr?.glassTransparency,
                    glassOffset: constr?.glassOffset,
                    glassBreakSound: constr?.glassBreakSound,
                    thickness: constr?.thickness,
                    offset: constr?.offset,
                    cutoutAxis: constr?.cutoutAxis,
                    cutout: constr?.cutout
                };

                // WALL LOGIC (All layers)
                // Check if char is explicit wall '#' OR if it's a construction item defined as 'wall'
                const isDoorChar = doorDefinitions[entityChar] ? entityChar : null;

                if (char === '#' || char === safeChar || (constr && constr.type === 'wall')) {
                    tile.type = 'WALL';
                    tile.canBeDestroyed = constr?.canBeDestroyed !== false;
                } else if (constr && constr.type === 'window') {
                    tile.type = 'WALL';
                    tile.isWindow = true;
                    tile.canBeDestroyed = constr?.canBeDestroyed !== false;
                }
                // DOOR LOGIC (Typically Layer 0 only, unless you want floating doors)
                else if (isDoorChar) {
                    tile.type = 'DOOR';
                    // Only process door logic on Layer 0 to simplify state management for now
                    if (layerIndex === 0) {
                        const def = doorDefinitions[isDoorChar];
                        tile.door = {
                            id: def.id || Math.random().toString(36).substr(2,9),
                            type: def.type,
                            dir: def.dir,
                            edge: def.edge,
                            state: (def as any).isOpenedAtStart ? 'OPEN' : 'CLOSED',
                            openAmount: (def as any).isOpenedAtStart ? (def.type === 'SLIDE' || def.type === 'LIFT' ? 0.85 : 1.0) : 0.0,
                            keyId: def.keyId,
                            textureId: (def as any).textureId,
                            maskId: (def as any).maskId, // Extract maskId from JSON
                            isLocked: def.isLocked,
                            closed: (def as any).closed,
                            openSound: (def as any).openSound,
                            closeSound: (def as any).closeSound,
                            isOpenedAtStart: (def as any).isOpenedAtStart,
                            nonInteractable: (def as any).nonInteractable
                        };
                    }
                } 
                // ENTITIES AND LOGIC
                const resolvedEntityChars = resolveChar(entityChar);
                const resolvedItemChars = resolveChar(itemChar);
                const allChars = [...resolvedEntityChars, ...resolvedItemChars];

                if (allChars.length > 0) {
                    const coordKey = `${layerIndex}_${y}_${x}`;
                    
                    const checkOverrides = (suffix: string, charSymbol?: string) => {
                        let result = {};
                        if (charSymbol && data.entityOverrides?.[`${coordKey}_${suffix}_${charSymbol}`]) {
                            result = data.entityOverrides[`${coordKey}_${suffix}_${charSymbol}`];
                        } else if (charSymbol && data.entityOverrides?.[`${coordKey}_${charSymbol}`]) {
                            result = data.entityOverrides[`${coordKey}_${charSymbol}`];
                        } else if (data.entityOverrides?.[`${coordKey}_${suffix}`]) {
                            result = data.entityOverrides[`${coordKey}_${suffix}`];
                        } else if (data.entityOverrides?.[coordKey]) {
                            result = data.entityOverrides[coordKey];
                        }
                        return Object.fromEntries(
                            Object.entries(result).filter(([k, v]) => v !== "" && v !== null && v !== undefined && !(k === 'scale' && v === 0) && !(k === 'textScale' && v === 0))
                        );
                    };

                    const finalItems: any[] = [];
                    allChars.forEach(char => {
                        if (itemsPalette.has(char)) {
                            const proto = itemsPalette.get(char);
                            const itemOverrides = checkOverrides('items', char);
                            
                            let finalRawDesc = proto.description;
                            let finalRawText = proto.text;
                            if (proto.type === 'MAP' || proto.type === 'NOTE') {
                                const [locRu, locEn] = getParts(data.locationName || "");
                                
                                const [descRu, descEn] = getParts(finalRawDesc);
                                const newRu = descRu.replace('{sector}', locRu);
                                const newEn = descEn.replace('{sector}', locEn);
                                finalRawDesc = `${newRu} / ${newEn}`;
                                
                                if (finalRawText) {
                                    const [textRu, textEn] = getParts(finalRawText);
                                    const newTextRu = textRu.replace('{sector}', locRu);
                                    const newTextEn = textEn.replace('{sector}', locEn);
                                    finalRawText = `${newTextRu} / ${newTextEn}`;
                                }
                            }

                            finalItems.push({ 
                                ...proto,
                                definitionId: proto.id,
                                name: localize(proto.name),
                                description: localize(finalRawDesc),
                                text: finalRawText,
                                rawName: proto.name,
                                rawDescription: finalRawDesc,
                                id: Math.random().toString(36).substr(2, 9),
                                handAssetId: proto.handAsset,
                                handFemaleAssetId: proto.handFemaleAsset,
                                attackAssetId: proto.attackAsset,
                                attackFemaleAssetId: proto.attackAssetFemale,
                                maskAssetId: proto.maskAsset,
                                keyId: proto.keyId,
                                durability: proto.maxDurability,
                                ...itemOverrides
                            });
                        }
                    });

                    if (finalItems.length > 0) {
                        tile.items = finalItems;
                    }

                    let nonItemFound = false;
                    const finalDecorations: any[] = [];
                    for (const char of allChars) {
                        if (decorPalette.has(char)) {
                            const proto = decorPalette.get(char);
                            const decorOverrides = checkOverrides('decorations', char);
                            finalDecorations.push({
                                ...proto,
                                name: localize(proto.name),
                                rawName: proto.name,
                                description: localize(proto.description),
                                rawDescription: proto.description,
                                type: proto.type || proto.id, 
                                id: Math.random().toString(36).substr(2, 9),
                                maxHp: decorOverrides?.maxHp || decorOverrides?.hp || proto.maxHp || proto.hp || undefined,
                                originalX: x,
                                originalY: y,
                                homePos: { x, y },
                                originPos: { x, y },
                                ...decorOverrides
                            });
                        } else {
                            if (nonItemFound) continue;

                            if (portalPalette.has(char)) {
                                tile.type = 'PORTAL';
                                const pData = portalPalette.get(char)!;
                                const portalOverrides = checkOverrides('portals', char);
                                tile.portal = { ...{ destination: pData.destination, assetId: pData.assetId, portalId: pData.portalId, targetPortalId: pData.targetPortalId, targetDirection: pData.targetDirection }, ...portalOverrides };
                                if (targetPortalId && pData.portalId === targetPortalId) {
                                    startPos = { x, y };
                                    hasStart = true;
                                    tile.isExplored = true;
                                    if (pData.targetDirection) {
                                        switch(pData.targetDirection) {
                                            case 'N': startDir = 0; break;
                                            case 'E': startDir = 1; break;
                                            case 'S': startDir = 2; break;
                                            case 'W': startDir = 3; break;
                                        }
                                    }
                                }
                                nonItemFound = true;
                            } else if (!targetPortalId && char === (data.playerStart?.symbol || 'S')) {
                                startPos = { x, y };
                                hasStart = true;
                                tile.isExplored = true;
                                nonItemFound = true;
                            } else if (npcPalette.has(char)) {
                            const stats = npcPalette.get(char);
                            const npcId = 'npc_' + Math.random().toString(36).substr(2, 9);
                            const npcOverrides = checkOverrides('NPCs', char);
                            
                            const newNPC: Enemy = {
                                id: npcId,
                                definitionId: stats.id,
                                name: localize(stats.name),
                                rawName: stats.name,
                                hp: npcOverrides?.hp || stats.hp || 100,
                                maxHp: npcOverrides?.maxHp || npcOverrides?.hp || stats.maxHp || stats.hp || 100,
                                damageDice: "0d0", 
                                accuracy: 0,
                                attackRange: 0,
                                description: localize(stats.description || stats.name),
                                assets: {
                                    map: { assetId: stats.assets?.map?.assetId, scale: stats.assets?.map?.scale || stats.scale || 1.0 },
                                    dead: stats.assets?.dead ? { assetId: stats.assets.dead.assetId, scale: stats.assets.dead.scale || stats.deadScale || stats.corpseScale || 0.32 } : undefined,
                                    portrait: stats.assets?.portrait ? { assetId: stats.assets.portrait.assetId, scale: stats.assets.portrait.scale || 1.0 } : undefined,
                                    dialogue_portrait: stats.assets?.dialogue_portrait ? { assetId: stats.assets.dialogue_portrait.assetId, scale: stats.assets.dialogue_portrait.scale || 1.0 } : undefined,
                                    hands_up: stats.assets?.hands_up ? { assetId: stats.assets.hands_up.assetId, scale: stats.assets.hands_up.scale || stats.assets?.map?.scale || stats.scale || 1.0 } : undefined,
                                },
                                baseXP: 0,
                                movementType: 'patroling',
                                patrolRange: stats.roamRadius || 0,
                                speed: 1,
                                x,
                                y,
                                homePos: { x, y },
                                dialogueId: stats.dialogueId,
                                voice: stats.voice,
                                tradeItems: stats.tradeItems,
                                sounds: stats.sounds,
                                isNPC: true,
                                canBeKilled: npcOverrides?.canBeKilled !== undefined ? npcOverrides.canBeKilled : (stats.canBeKilled !== undefined ? stats.canBeKilled : true),
                                talkRange: npcOverrides?.talkRange !== undefined ? npcOverrides.talkRange : (stats.talkRange !== undefined ? stats.talkRange : 1),
                                canBeInspected: npcOverrides?.canBeInspected !== undefined ? npcOverrides.canBeInspected : (stats.canBeInspected !== undefined ? stats.canBeInspected : true),
                                canOpenDoors: stats.canOpenDoors !== undefined ? stats.canOpenDoors : false,
                                ...npcOverrides
                            };
                            
                            newEnemies.set(npcId, newNPC);
                            tile.enemyId = npcId;

                            const getEnemySprite = (assetId: string) => {
                                const img = masterSpriteMap.get(assetId);
                                if (img && img.width > 0) return img;
                                return fallbackTexture;
                            };

                            if (stats.assets?.map) masterSpriteMap.set(npcId, getEnemySprite(stats.assets.map.assetId));
                            if (stats.assets?.portrait) masterSpriteMap.set(`${npcId}_PORTRAIT`, getEnemySprite(stats.assets.portrait.assetId));
                            if (stats.assets?.dialogue_portrait) masterSpriteMap.set(`${npcId}_DIALOGUE_PORTRAIT`, getEnemySprite(stats.assets.dialogue_portrait.assetId));
                            if (stats.assets?.hands_up) masterSpriteMap.set(`${npcId}_HANDS_UP`, getEnemySprite(stats.assets.hands_up.assetId));
                            nonItemFound = true;
                        } else if (enemyPalette.has(char)) {
                            const stats = enemyPalette.get(char);
                            const enemyId = Math.random().toString(36).substr(2, 9);
                            const enemyOverrides = checkOverrides('enemies', char);
                            
                            const newEnemy: Enemy = {
                                id: enemyId,
                                definitionId: stats.id,
                                name: localize(stats.name),
                                rawName: stats.name,
                                hp: enemyOverrides?.hp || stats.hp,
                                maxHp: enemyOverrides?.maxHp || enemyOverrides?.hp || stats.maxHp || stats.hp,
                                damageDice: stats.damageDice,
                                accuracy: stats.accuracy,
                                attackRange: stats.attackRange,
                                description: localize(stats.description || stats.name),
                                assets: stats.assets,
                                baseXP: stats.baseXP || 10,
                                muzzleFlash: stats.muzzleFlash,
                                casing: stats.casing,
                                sounds: stats.sounds,
                                gibCounts: stats.gibCounts,
                                loot: stats.loot,
                                onHitEffect: stats.onHitEffect,
                                movementType: stats.movementType || 'patroling',
                                patrolRange: stats.patrolRange || 3,
                                speed: stats.speed ?? 1,
                                armor: stats.armor,
                                x,
                                y,
                                homePos: { x, y },
                                canBeKilled: enemyOverrides?.canBeKilled !== undefined ? enemyOverrides.canBeKilled : (stats.canBeKilled !== undefined ? stats.canBeKilled : true),
                                canBeInspected: enemyOverrides?.canBeInspected !== undefined ? enemyOverrides.canBeInspected : (stats.canBeInspected !== undefined ? stats.canBeInspected : true),
                                canOpenDoors: stats.canOpenDoors !== undefined ? stats.canOpenDoors : false,
                                ...enemyOverrides
                            };
                            
                            newEnemies.set(enemyId, newEnemy);
                            tile.enemyId = enemyId;

                            const getEnemySprite = (assetId: string) => {
                                const img = masterSpriteMap.get(assetId);
                                if (img && img.width > 0) return img;
                                return fallbackTexture;
                            };

                            const mapAssetId = stats.assets?.map?.assetId || (typeof stats.assets?.map === 'string' ? stats.assets.map : undefined);
                            if (mapAssetId) {
                                masterSpriteMap.set(enemyId, getEnemySprite(mapAssetId));
                            }
                            
                            if (stats.assets?.portrait) {
                                const portraitAssetId = stats.assets.portrait.assetId || (typeof stats.assets.portrait === 'string' ? stats.assets.portrait : undefined);
                                if (portraitAssetId) {
                                    masterSpriteMap.set(`${enemyId}_PORTRAIT`, getEnemySprite(portraitAssetId));
                                }
                            }
                            if (stats.assets?.attack) {
                                const attackAssetId = stats.assets.attack.assetId || (typeof stats.assets.attack === 'string' ? stats.assets.attack : undefined);
                                if (attackAssetId) {
                                    masterSpriteMap.set(`${enemyId}_ATTACK_PORTRAIT`, getEnemySprite(attackAssetId));
                                }
                            }
                            if (stats.assets?.distanceAttack) {
                                const distAssetId = stats.assets.distanceAttack.assetId || (typeof stats.assets.distanceAttack === 'string' ? stats.assets.distanceAttack : undefined);
                                if (distAssetId) {
                                    masterSpriteMap.set(`${enemyId}_ATTACK_SPRITE`, getEnemySprite(distAssetId));
                                }
                            }
                            nonItemFound = true;
                        }
                    }
                    if (finalDecorations.length > 0) {
                        tile.decorations = finalDecorations;
                        tile.decoration = finalDecorations[0];
                    }
                }
            }
            if (addedExtraLayer && layerIndex === sourceGrids.length - 1) {
                    tile.type = 'WALL';
                    tile.blocking = true;
                    tile.canBeDestroyed = false;
                    tile.description = localize("Ceiling / Потолок");
                    tile.bottomTextureId = data.ceilingTextureId || 'CEILING';
                    tile.items = [];
                    tile.enemyId = undefined;
                    tile.portal = undefined;
                    tile.decorations = undefined;
                    tile.decoration = undefined;
                }
                row.push(tile);
            }
            grid.push(row);
        });

        // Resolve 'AUTO' cutoutAxis for window tiles based on adjacent walls
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const tile = grid[y][x];
                if (tile && tile.type === 'WALL' && tile.isWindow && tile.cutoutAxis && tile.cutoutAxis.toString().toUpperCase() === 'AUTO') {
                    const isWall = (tx: number, ty: number): boolean => {
                        if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
                        const t = grid[ty][tx];
                        return !!t && (t.type === 'WALL' || !!t.isWindow || t.type === 'DOOR');
                    };
                    const hasWest = isWall(x - 1, y);
                    const hasEast = isWall(x + 1, y);
                    const hasNorth = isWall(x, y - 1);
                    const hasSouth = isWall(x, y + 1);

                    const horizontalCount = (hasWest ? 1 : 0) + (hasEast ? 1 : 0);
                    const verticalCount = (hasNorth ? 1 : 0) + (hasSouth ? 1 : 0);

                    if (horizontalCount > verticalCount) {
                        tile.cutoutAxis = 'NS';
                    } else if (verticalCount > horizontalCount) {
                        tile.cutoutAxis = 'WE';
                    } else {
                        // random, but deterministic/stable based on coordinates
                        const isStableNS = ((x * 17) + (y * 31)) % 2 === 0;
                        tile.cutoutAxis = isStableNS ? 'NS' : 'WE';
                    }
                }
            }
        }

        return grid;
    });

    // POST-PROCESSING: Terrain Blending removed as per user request
    parsedGrids[0] = parsedGrids[0];

    if (!hasStart && parsedGrids[0].length > 0) {
         for(let y=0; y<parsedGrids[0].length; y++) {
             for(let x=0; x<parsedGrids[0][0].length; x++) {
                 if(parsedGrids[0][y][x].type === 'FLOOR') { startPos = {x,y}; break; }
             }
             if (startPos.x !== 0 || startPos.y !== 0) break;
         }
    }

    const resolvedCeilingType = data.ceilingType || (data.skyboxTextureId ? 'OUTDOOR' : 'INDOOR');

    const outdoorMap: boolean[][] = Array.from({ length: height }, (_, y) => 
        Array.from({ length: width }, (_, x) => {
            if (resolvedCeilingType === 'INDOOR') return false;
            const baseTile = parsedGrids[0]?.[y]?.[x];
            if (baseTile && (baseTile.type === 'WALL' || (baseTile.type === 'DOOR' && (baseTile.door?.state === 'CLOSED' || baseTile.door?.state === 'CLOSING')))) {
                return false;
            }
            for (let i = 1; i < parsedGrids.length; i++) {
                if (parsedGrids[i][y] && parsedGrids[i][y][x] && parsedGrids[i][y][x].type === 'WALL') {
                    return false;
                }
            }
            return true;
        })
    );

    clearLightMapCache();
    clearRaycastCache();
    const globalLight = data.globalLight !== undefined ? data.globalLight : 1.0;
    prebakeDoorLighting(parsedGrids[0], data.gridLight, globalLight, data.lightDefinitions, outdoorMap, parsedGrids);
    const { baseLightMap: lightMap, floorLightMaps, dynamicLights } = calculateLightMap(parsedGrids[0], data.gridLight, globalLight, data.lightDefinitions, outdoorMap, parsedGrids);

    if (data.playerStart?.dir && !targetPortalId) {
        switch(data.playerStart.dir) {
            case 'N': startDir = 0; break;
            case 'E': startDir = 1; break;
            case 'S': startDir = 2; break;
            case 'W': startDir = 3; break;
        }
    }

    // Pre-cache mask buffers for doors and enemies to prevent performance drops during gameplay
    let yieldCounter = 0;
    for (let layer of parsedGrids) {
        for (let row of layer) {
            for (let tile of row) {
                if (tile.door && tile.door.maskId) {
                    try {
                        const textureId = tile.door.textureId || tile.door.maskId;
                        precalculateShards(textureId, tile.door.maskId, masterSpriteMap);
                    } catch (e) {
                        console.warn("Failed to precalculate shards", e);
                    }
                }
                if (tile.isWindow && tile.glassAssetId) {
                    try {
                        precalculateShards(tile.glassAssetId, tile.glassAssetId, masterSpriteMap);
                    } catch (e) {
                        console.warn("Failed to precalculate glass shards", e);
                    }
                }
                yieldCounter++;
                if (yieldCounter % 50 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
    }
    await new Promise(r => setTimeout(r, 0));
    
    for (let [enemyId, enemy] of newEnemies) {
        if (enemy.assets.gibMask) {
            try {
                const maskBuffer = getMaskBuffer(enemy.assets.gibMask, masterSpriteMap);
                if (maskBuffer) {
                    precalculateGibs(enemy.assets.map.assetId, maskBuffer, masterSpriteMap);
                }
            } catch (e) {
                console.warn("Failed to precalculate gibs", e);
            }
        }
    }

    return {
        wallTexture,
        floorTexture,
        doorTexture,
        skyTexture,
        ceilingTexture,
        spriteMap: masterSpriteMap,
        enemies: newEnemies,
        levelData: {
            name: localize(data.locationName),
            rawName: data.locationName || "",
            description: localize(data.locationDescription),
            objective: localize(data.objective),
            ceilingType: resolvedCeilingType,
            weather: data.weather || 'none',
            fogColor: data.fogColor,
            fogDistance: data.fogDistance,
            grid: parsedGrids[0], 
            grids: parsedGrids,   
            width: width,
            height: height,
            lightMap,
            floorLightMaps,
            dynamicLights,
            baseLightInfo: {
                globalLight,
                gridLight: data.gridLight,
                lightDefinitions: data.lightDefinitions
            },
            ambientSounds: data.ambientSounds,
            gridSounds: data.gridSounds,
            outdoorMap,
            triggers: data.triggers || [],
            particles: data.particles || [],
            tasks: (data.tasks || []).map((t: any) => ({
                ...t,
                descriptionKey: t.descriptionKey ? localize(t.descriptionKey) : t.descriptionKey
            })),
            keyMap,
            doorDefinitions, // Pass definition for pre-processing in useLevelSystem
            construction: data.construction || [],
            enemiesPalette: data.enemies || [],
            npcsPalette: data.NPCs || [],
            itemsPalette: data.items || [],
            decorationsPalette: data.decorations || [],
            portalsPalette: data.portals || []
        },
        startPos,
        startDir
    };
};
