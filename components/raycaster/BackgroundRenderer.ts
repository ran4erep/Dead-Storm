
import { CEILING_COLOR } from './RaycasterConstants';
import { Tile, AnimationConfig } from '../../types';
import { RaycasterBuffer } from './RaycasterUtils';
import { getDepthFactor, applyDepthShading, getFogColorInt, isFogWeather, getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { isWebGLActive } from './WebGLState';

const SIN_LUT_SIZE = 2048;
const SIN_LUT_MASK = SIN_LUT_SIZE - 1;
const SIN_LUT = new Float32Array(SIN_LUT_SIZE);
const COS_LUT = new Float32Array(SIN_LUT_SIZE);
const SCALE = SIN_LUT_SIZE / (Math.PI * 2);

for (let i = 0; i < SIN_LUT_SIZE; i++) {
    const angle = (i / SIN_LUT_SIZE) * Math.PI * 2;
    SIN_LUT[i] = Math.sin(angle);
    COS_LUT[i] = Math.cos(angle);
}

function fastSin(x: number): number {
    return SIN_LUT[((x * SCALE) | 0) & SIN_LUT_MASK];
}

function fastCos(x: number): number {
    return COS_LUT[((x * SCALE) | 0) & SIN_LUT_MASK];
}

const floorHeightCache = new WeakMap<Tile[][], { flatHeights: Float32Array; AnyNonZero: boolean }>();

// Persistent reusable buffers for Zero-GC background rendering
let globalIsSolidGrid = new Uint8Array(128 * 128);
let globalFlashCache = new Float32Array(128 * 128 * 12);
let globalFlashCalculated = new Uint8Array(128 * 128);
let globalFlashState = new Uint8Array(128 * 128);
let globalLightMapCache: ({ r: number; g: number; b: number } | null)[] = new Array(128 * 128);

function ensureBackgroundBuffers(size: number) {
    if (globalIsSolidGrid.length < size) {
        const nextSize = Math.max(size, globalIsSolidGrid.length * 2);
        globalIsSolidGrid = new Uint8Array(nextSize);
        globalFlashCache = new Float32Array(nextSize * 12);
        globalFlashCalculated = new Uint8Array(nextSize);
        globalFlashState = new Uint8Array(nextSize);
        globalLightMapCache = new Array(nextSize);
    }
}

const getFloorHeightCache = (grid: Tile[][]): { flatHeights: Float32Array; AnyNonZero: boolean } => {
    if (floorHeightCache.has(grid)) {
        return floorHeightCache.get(grid)!;
    }
    const h = grid.length;
    const w = grid[0]?.length || 0;
    const flatHeights = new Float32Array(w * h);
    let AnyNonZero = false;
    for (let y = 0; y < h; y++) {
        const row = grid[y];
        for (let x = 0; x < w; x++) {
            const tile = row?.[x];
            let val = 0.0;
            if (tile && tile.type === 'FLOOR' && tile.height !== undefined) {
                val = tile.height;
                if (val !== 0.0) {
                    AnyNonZero = true;
                }
            }
            flatHeights[y * w + x] = val;
        }
    }
    const entry = { flatHeights, AnyNonZero };
    floorHeightCache.set(grid, entry);
    return entry;
};

interface BackgroundRenderProps {
    width: number;
    height: number;
    fov: number;
    posX: number;
    posY: number;
    dirX: number;
    dirY: number;
    planeX: number;
    planeY: number;
    horizon: number;
    cameraZ: number;
    ceilingType: 'INDOOR' | 'OUTDOOR';
    lightningIntensity: number;
    muzzleFlashIntensity: number; 
    skyBuffer: RaycasterBuffer | null;
    floorBuffer: RaycasterBuffer | null;
    ceilingBuffer: RaycasterBuffer | null;
    lightMap?: { r: number; g: number; b: number }[][];
    outdoorMap?: boolean[][];
    lightningMap?: Float32Array | null;
    debugTextures: boolean;
    highlightedTiles: { x: number; y: number; color: string }[];
    activeFlashes?: {x: number, y: number, intensity: number}[]; 
    grid: Tile[][];
    grids?: Tile[][][];
    aiVisionSet?: Set<number>;
    customFloorBuffers?: Map<number, RaycasterBuffer>; 
    screenBuffer: Uint32Array;
    // Optimization: Reusable Set passed from parent
    reusableHighlightSet: Set<number>;
    auxBuffers?: Map<string, RaycasterBuffer>; // NEW PROP
    resolutionDivisor?: number;
    flashlightActive?: boolean;
    flashlightBatteryRatio?: number;
    renderDistance?: number;
    onWaterVisible?: () => void;
    playerFloorHeight?: number; // Smooth floor elevation during falls and climbs
}

const DEFAULT_LIGHT = {r: 1, g: 1, b: 1};

let cachedWidth = 0;
let cameraXCache = new Float32Array(2048);
let rayDirXCache = new Float32Array(2048);
let rayDirYCache = new Float32Array(2048);
let skyTyCache = new Int32Array(2048);
let texXCache = new Int32Array(2048);

export const renderBackground = ({
    width, height, fov, posX, posY, dirX, dirY, planeX, planeY, horizon, cameraZ,
    ceilingType, lightningIntensity, muzzleFlashIntensity, skyBuffer, floorBuffer, ceilingBuffer, lightMap, outdoorMap, lightningMap, debugTextures, highlightedTiles, activeFlashes = [],
    grid, grids, aiVisionSet, customFloorBuffers, screenBuffer, reusableHighlightSet, auxBuffers, resolutionDivisor = 1, flashlightActive = false, flashlightBatteryRatio = 1.0, renderDistance = 15,
    onWaterVisible, playerFloorHeight: passedPlayerFloorHeight
}: BackgroundRenderProps) => {
    // Set render distance high enough to avoid wall strips rendering empty/gaps at high/far distances
    renderDistance = 99999;

    // Ensure caches are large enough
    if (width > cameraXCache.length) {
        cameraXCache = new Float32Array(width + 256);
        rayDirXCache = new Float32Array(width + 256);
        rayDirYCache = new Float32Array(width + 256);
        texXCache = new Int32Array(width + 256);
        cachedWidth = 0; // force rebuild of cameraX
    }
    if (height > skyTyCache.length) {
        skyTyCache = new Int32Array(height + 256);
    }

    if (cachedWidth !== width) {
        for (let x = 0; x < width; x++) {
            cameraXCache[x] = (2 * x) / width - 1;
        }
        cachedWidth = width;
    }

    // Precalculate ray directions for all columns once per frame
    for (let x = 0; x < width; x += resolutionDivisor) {
        const cameraX = cameraXCache[x];
        rayDirXCache[x] = dirX + planeX * cameraX;
        rayDirYCache[x] = dirY + planeY * cameraX;
    }

    const heightCache = getFloorHeightCache(grid);
    const flatHeights = heightCache.flatHeights;
    const hasNonStandardFloors = heightCache.AnyNonZero;
    
    // Always prepare the reusable highlight set, even in WebGL mode!
    reusableHighlightSet.clear();
    for (let h = 0; h < highlightedTiles.length; h++) {
        reusableHighlightSet.add(highlightedTiles[h].y * 10000 + highlightedTiles[h].x);
    }

    const timePulse = Math.sin(Date.now() / 450) * 0.5 + 0.5;
    const highlightPulse = 0.25 + 0.75 * timePulse;
    const highlightRAdd = (60 * highlightPulse) | 0;
    const highlightGBMult = 1.0 - 0.6 * highlightPulse;

    if (isWebGLActive) return;
    
    const horizonInt = horizon | 0;
    const timeSec = Date.now() / 1000;
    const waterOffset1_scaled = (timeSec * 2) * SCALE;
    const waterOffset2_scaled = (timeSec * 1.5) * SCALE;
    const SCALE_10 = 10 * SCALE;
    let waterVisibleThisFrame = false;
    
    let quality = 1.0;
    let flashAttenuation = 0.25;
    if (flashlightActive) {
        if (flashlightBatteryRatio <= 0.5) {
            const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
            quality = factor * 0.5 + 0.5;
        }
        flashAttenuation = 1.0 - (0.75 * quality);
    }
    const floorValue = 0.08 * quality;

    // Fill ceiling color initially
    screenBuffer.fill(CEILING_COLOR);

    const muzzleR = 255, muzzleG = 200, muzzleB = 80;
    const hasFlashes = activeFlashes.length > 0;
    const hasLightMap = !!lightMap;
    const gridHeight = grid.length;
    const gridWidth = grid[0]?.length || 0;
    const totalCells = gridWidth * gridHeight;
    ensureBackgroundBuffers(totalCells);

    const getLightningMult = (x: number, y: number): number => {
        if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
            const tile = grid[y][x];
            if (tile && tile.type === 'WALL') return 0.0;
            if (lightningMap) {
                return lightningMap[y * gridWidth + x];
            }
            return (outdoorMap && outdoorMap[y] && outdoorMap[y][x]) ? 1.0 : 0.0;
        }
        return (ceilingType === 'OUTDOOR') ? 1.0 : 0.0;
    };
    
    // --- OPTIMIZED DYNAMIC FLASH CACHE ---
    const effectiveMuzzleIntensity = flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity;
    const hasMuzzle = effectiveMuzzleIntensity > 0;
    const cellHasFlashGlobal = hasMuzzle || hasFlashes;
    if (cellHasFlashGlobal) {
        globalFlashCalculated.fill(0, 0, totalCells);
    }
    const flashCache = globalFlashCache;
    const flashCalculated = globalFlashCalculated;
    const flashState = globalFlashState;
    
    let tempFlash: number[] = [0,0,0,0,0,0,0,0,0,0,0,0];
    const getCellFlashing = (cellX: number, cellY: number): boolean => {
        if (!cellHasFlashGlobal) return false;
        if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight) return false;
        
        const cacheIdx = cellY * gridWidth + cellX;
        if (flashCalculated[cacheIdx] === 1) {
            if (flashState[cacheIdx] === 1) {
                const base = cacheIdx * 12;
                for(let i=0; i<12; i++) tempFlash[i] = flashCache[base + i];
                return true;
            }
            return false;
        }

        let hasFlash = false;
        const checkFlash = (fx: number, fy: number) => {
            const dx = fx - (cellX + 0.5);
            const dy = fy - (cellY + 0.5);
            if (dx*dx + dy*dy < 120) hasFlash = true;
        };
        
        if (hasMuzzle) checkFlash(posX, posY);
        if (hasFlashes && !hasFlash) {
            for(let i=0; i<activeFlashes.length; i++) {
                checkFlash(activeFlashes[i].x, activeFlashes[i].y);
                if (hasFlash) break;
            }
        }

        flashCalculated[cacheIdx] = 1;
        if (hasFlash) {
            flashState[cacheIdx] = 1;
            let c0R = 0, c0G = 0, c0B = 0;
            let c1R = 0, c1G = 0, c1B = 0;
            let c2R = 0, c2G = 0, c2B = 0;
            let c3R = 0, c3G = 0, c3B = 0;

            const addCornerLight = (fx: number, fy: number, intensity: number, isFlashbang?: boolean) => {
                let dx = fx - cellX; let dy = fy - cellY;
                let i00 = intensity / ((dx*dx + dy*dy) * 0.5 + 1.0);
                dx = fx - (cellX + 1); dy = fy - cellY; 
                let i10 = intensity / ((dx*dx + dy*dy) * 0.5 + 1.0);
                dx = fx - cellX; dy = fy - (cellY + 1);
                let i01 = intensity / ((dx*dx + dy*dy) * 0.5 + 1.0);
                dx = fx - (cellX + 1); dy = fy - (cellY + 1);
                let i11 = intensity / ((dx*dx + dy*dy) * 0.5 + 1.0);

                const mR = isFlashbang ? 2.0 : muzzleR;
                const mG = isFlashbang ? 2.0 : muzzleG;
                const mB = isFlashbang ? 2.0 : muzzleB;

                c0R += i00 * mR; c0G += i00 * mG; c0B += i00 * mB;
                c1R += i10 * mR; c1G += i10 * mG; c1B += i10 * mB;
                c2R += i01 * mR; c2G += i01 * mG; c2B += i01 * mB;
                c3R += i11 * mR; c3G += i11 * mG; c3B += i11 * mB;
            };

            if (hasMuzzle) addCornerLight(posX, posY, effectiveMuzzleIntensity);
            if (hasFlashes) {
                for(let i=0; i<activeFlashes.length; i++) {
                    let f = activeFlashes[i] as any;
                    let fInt = f.intensity;
                    if (flashlightActive) fInt *= flashAttenuation;
                    addCornerLight(f.x, f.y, fInt, f.isFlashbang);
                }
            }

            const base = cacheIdx * 12;
            flashCache[base] = c0R; flashCache[base+1] = c0G; flashCache[base+2] = c0B;
            flashCache[base+3] = c1R; flashCache[base+4] = c1G; flashCache[base+5] = c1B;
            flashCache[base+6] = c2R; flashCache[base+7] = c2G; flashCache[base+8] = c2B;
            flashCache[base+9] = c3R; flashCache[base+10] = c3G; flashCache[base+11] = c3B;
            
            for(let i=0; i<12; i++) tempFlash[i] = flashCache[base + i];
            return true;
        }

        flashState[cacheIdx] = 0;
        return false;
    };

    // --- OPTIMIZED LIGHTMAP CACHE ---
    if (hasLightMap) {
        globalLightMapCache.fill(null, 0, totalCells);
    }
    const lightMapCache = globalLightMapCache;
    const getL = (x: number, y: number) => {
        if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth && lightMap![y]) {
            const cacheIdx = y * gridWidth + x;
            if (lightMapCache[cacheIdx] !== null) return lightMapCache[cacheIdx]!;
            
            let res = DEFAULT_LIGHT;
            const tile = grid[y][x];
            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                let bestX = x;
                let bestY = y;
                let minDist = 999999;
                
                const checkNeighbor = (nx: number, ny: number) => {
                    if (ny >= 0 && ny < gridHeight && nx >= 0 && nx < gridWidth) {
                        const ntile = grid[ny][nx];
                        if (!ntile || (ntile.type !== 'WALL' && ntile.type !== 'DOOR')) {
                            const dx = nx + 0.5 - posX;
                            const dy = ny + 0.5 - posY;
                            const distSq = dx * dx + dy * dy;
                            if (distSq < minDist) {
                                minDist = distSq;
                                bestX = nx;
                                bestY = ny;
                            }
                        }
                    }
                };

                checkNeighbor(x - 1, y);
                checkNeighbor(x + 1, y);
                checkNeighbor(x, y - 1);
                checkNeighbor(x, y + 1);

                if (minDist === 999999) {
                    checkNeighbor(x - 1, y - 1);
                    checkNeighbor(x + 1, y - 1);
                    checkNeighbor(x - 1, y + 1);
                    checkNeighbor(x + 1, y + 1);
                }
                
                if (lightMap![bestY] && lightMap![bestY][bestX]) {
                    res = lightMap![bestY][bestX];
                }
            } else {
                res = lightMap![y][x] || DEFAULT_LIGHT;
            }
            lightMapCache[cacheIdx] = res;
            return res;
        }
        return DEFAULT_LIGHT;
    };

    // Precompute a solid grid once per frame to make wall and door checks incredibly fast
    const isSolidGrid = globalIsSolidGrid;
    for (let y = 0; y < gridHeight; y++) {
        const row = grid[y];
        const rowOffset = y * gridWidth;
        if (row) {
            for (let x = 0; x < gridWidth; x++) {
                const tile = row[x];
                isSolidGrid[rowOffset + x] = (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) ? 1 : 0;
            }
        } else {
            isSolidGrid.fill(0, rowOffset, rowOffset + gridWidth);
        }
    }

    const interpRes = { r: 1.0, g: 1.0, b: 1.0 };
    const getInterpolatedL = (xf: number, yf: number) => {
        if (!hasLightMap) {
            interpRes.r = 1.0; interpRes.g = 1.0; interpRes.b = 1.0;
            return interpRes;
        }
        const cx = Math.floor(xf);
        const cy = Math.floor(yf);

        const u = xf - 0.5;
        const v = yf - 0.5;
        const x0 = Math.floor(u);
        const y0 = Math.floor(v);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const tx = u - x0;
        const ty = v - y0;

        let c00 = DEFAULT_LIGHT;
        if (y0 >= 0 && y0 < gridHeight && x0 >= 0 && x0 < gridWidth) {
            if (isSolidGrid[y0 * gridWidth + x0] === 1) {
                c00 = lightMap![cy]?.[cx] || DEFAULT_LIGHT;
            } else {
                c00 = lightMap![y0][x0] || DEFAULT_LIGHT;
            }
        }

        let c10 = DEFAULT_LIGHT;
        if (y0 >= 0 && y0 < gridHeight && x1 >= 0 && x1 < gridWidth) {
            if (isSolidGrid[y0 * gridWidth + x1] === 1) {
                c10 = lightMap![cy]?.[cx] || DEFAULT_LIGHT;
            } else {
                c10 = lightMap![y0][x1] || DEFAULT_LIGHT;
            }
        }

        let c01 = DEFAULT_LIGHT;
        if (y1 >= 0 && y1 < gridHeight && x0 >= 0 && x0 < gridWidth) {
            if (isSolidGrid[y1 * gridWidth + x0] === 1) {
                c01 = lightMap![cy]?.[cx] || DEFAULT_LIGHT;
            } else {
                c01 = lightMap![y1][x0] || DEFAULT_LIGHT;
            }
        }

        let c11 = DEFAULT_LIGHT;
        if (y1 >= 0 && y1 < gridHeight && x1 >= 0 && x1 < gridWidth) {
            if (isSolidGrid[y1 * gridWidth + x1] === 1) {
                c11 = lightMap![cy]?.[cx] || DEFAULT_LIGHT;
            } else {
                c11 = lightMap![y1][x1] || DEFAULT_LIGHT;
            }
        }

        const w00 = (1.0 - tx) * (1.0 - ty);
        const w10 = tx * (1.0 - ty);
        const w01 = (1.0 - tx) * ty;
        const w11 = tx * ty;

        interpRes.r = c00.r * w00 + c10.r * w10 + c01.r * w01 + c11.r * w11;
        interpRes.g = c00.g * w00 + c10.g * w10 + c01.g * w01 + c11.g * w11;
        interpRes.b = c00.b * w00 + c10.b * w10 + c01.b * w01 + c11.b * w11;
        return interpRes;
    };

    // --- SKYBOX RENDERER ---
    let currentSkyBuffer = skyBuffer || auxBuffers?.get('TEX_FALLBACK');
    if ((ceilingType === 'OUTDOOR' || outdoorMap) && currentSkyBuffer) {
        const isFog = isFogWeather();
        if (isFog) {
            screenBuffer.fill(getFogColorInt());
        } else {
            const skyW = currentSkyBuffer.width;
            const skyH = currentSkyBuffer.height;
            const skyData = currentSkyBuffer.data;
            
            const isFallback = !skyBuffer;
            const hRepeat = isFallback ? 16 : 1;
            const vRepeat = isFallback ? 8 : 1;
            
            const focalLength = (width / 2) / fov;
            const pixelsPerRad = skyW / (2 * Math.PI);
            const skyVScale = pixelsPerRad / focalLength;
            const skyBaseY = (skyH / 2);
            
            // Precompute skyTy values for all y once per frame to avoid recalculation in the nested loops
            for (let y = 0; y < height; y++) {
                const distFromHorizon = horizon - y;
                let skyTy = (skyBaseY - (distFromHorizon * skyVScale * vRepeat)) | 0;
                if (isFallback) {
                    skyTy = (skyTy % skyH + skyH) % skyH;
                } else {
                    skyTy = Math.max(0, Math.min(skyH - 1, skyTy));
                }
                skyTyCache[y] = skyTy;
            }

            const parallaxDistance = 500.0; // Consistent, realistic distance factor to prevent any visible stretching
            const hasLightning = lightningIntensity > 0;

            // Precompute texX horizontal indices for all x columns
            for (let x = 0; x < width; x += resolutionDivisor) {
                const rayDirX = rayDirXCache[x];
                const rayDirY = rayDirYCache[x];
                
                const rayAngle = Math.atan2(rayDirY, rayDirX);
                
                // Parallax shift calculation: independent of camera rotation, only dependent on player position & ray angle
                const len = Math.sqrt(rayDirX * rayDirX + rayDirY * rayDirY);
                const sinRay = rayDirY / len;
                const cosRay = rayDirX / len;
                const parallaxShift = (posX * sinRay - posY * cosRay) / parallaxDistance;
                const rayAngleNorm = (rayAngle + parallaxShift + Math.PI) / (2 * Math.PI);
                
                let texX = ((-rayAngleNorm) * skyW * hRepeat) | 0;
                texX = (texX % skyW + skyW) % skyW; 
                
                texXCache[x] = texX;
                for (let d = 1; d < resolutionDivisor; d++) {
                    if (x + d < width) {
                        texXCache[x + d] = texX;
                    }
                }
            }

            if (hasLightning) {
                const lIntR = (lightningIntensity * 200) | 0;
                const lIntG = (lightningIntensity * 220) | 0;
                const lIntB = (lightningIntensity * 255) | 0;

                for (let y = 0; y < height; y++) {
                    const skyTy = skyTyCache[y];
                    if (skyTy >= 0 && skyTy < skyH) {
                        const skyRowOffset = skyTy * skyW;
                        const screenRowOffset = y * width;
                        for (let x = 0; x < width; x++) {
                            const texX = texXCache[x];
                            let color = skyData[skyRowOffset + texX];
                            let r = color & 0xFF;
                            let g = (color >> 8) & 0xFF;
                            let b = (color >> 16) & 0xFF;
                            const a = (color >> 24) & 0xFF;
                            r = Math.min(255, r + lIntR) | 0;
                            g = Math.min(255, g + lIntG) | 0;
                            b = Math.min(255, b + lIntB) | 0;
                            screenBuffer[screenRowOffset + x] = (a << 24) | (b << 16) | (g << 8) | r;
                        }
                    }
                }
            } else {
                // NO LIGHTNING, NO FOG - HIGHLY OPTIMIZED FAST CONTIGUOUS MEMORY PATH
                for (let y = 0; y < height; y++) {
                    const skyTy = skyTyCache[y];
                    if (skyTy >= 0 && skyTy < skyH) {
                        const skyRowOffset = skyTy * skyW;
                        const screenRowOffset = y * width;
                        for (let x = 0; x < width; x++) {
                            screenBuffer[screenRowOffset + x] = skyData[skyRowOffset + texXCache[x]];
                        }
                    }
                }
            }
        }
    }

    // --- FLOOR & CEILING RENDERER ---
    const rayDirX0 = dirX - planeX; const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX; const rayDirY1 = dirY + planeY;
    
    // OPTIMIZATION: Render floor and ceiling in a single loop to halve CPU usage.
    // We loop from the horizon outwards to cover the maximum distance to the top or bottom of the screen.
    const maxDist = Math.max(horizonInt, height - horizonInt);
    
    const pTileX = posX | 0;
    const pTileY = posY | 0;
    const pTile = (pTileY >= 0 && pTileY < gridHeight && pTileX >= 0 && pTileX < gridWidth) ? grid[pTileY][pTileX] : null;
    const playerFloorHeight = passedPlayerFloorHeight !== undefined ? passedPlayerFloorHeight : (pTile ? ((pTile.type === 'FLOOR' && pTile.height !== undefined) ? pTile.height : 0) : 0);

    for (let dy = 0; dy < maxDist; dy++) {
        const yFloor = horizonInt + dy;
        const yCeil = horizonInt - dy - 1;
        
        const pFloor = Math.max(0.0001, yFloor - horizon + 0.5);
        const pCeil = Math.max(0.0001, horizon - yCeil - 0.5);
        
        const rowDistFloor = ((cameraZ - playerFloorHeight) * height) / pFloor;
        const rowDistCeil = ((1.0 - cameraZ) * height) / pCeil;
        
        const fogFactorFloor = getDepthFactor(rowDistFloor);
        const fogFactorCeil = getDepthFactor(rowDistCeil);
        
        const effectiveMuzzleIntensity = flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity;
        
        const rowLightningR = (lightningIntensity * 150) | 0;
        const rowLightningG = (lightningIntensity * 160) | 0;
        const rowLightningB = (lightningIntensity * 200) | 0;
        
        const hasLightning = lightningIntensity > 0;
        const hasMuzzle = effectiveMuzzleIntensity > 0;

        // Default buffers for this row
        let baseFloorBuffer = debugTextures ? floorBuffer : auxBuffers?.get('TEX_FALLBACK');
        if (!baseFloorBuffer) baseFloorBuffer = floorBuffer;
        let baseCeilBuffer = debugTextures ? ceilingBuffer : auxBuffers?.get('TEX_FALLBACK');
        if (!baseCeilBuffer) baseCeilBuffer = ceilingBuffer;
        
        let defaultFloorData = baseFloorBuffer ? baseFloorBuffer.data : null;
        let defaultFloorW = baseFloorBuffer ? baseFloorBuffer.width : 0;
        let defaultFloorH = baseFloorBuffer ? baseFloorBuffer.height : 0;

        let defaultCeilData = baseCeilBuffer ? baseCeilBuffer.data : null;
        let defaultCeilW = baseCeilBuffer ? baseCeilBuffer.width : 0;
        let defaultCeilH = baseCeilBuffer ? baseCeilBuffer.height : 0;

        let lastCellXFloor = -1;
        let lastCellYFloor = -1;
        let lastCellXCeil = -1;
        let lastCellYCeil = -1;

        let cellLightRFloor = 1, cellLightGFloor = 1, cellLightBFloor = 1;
        let cellLightRCeil = 1, cellLightGCeil = 1, cellLightBCeil = 1;
        let flatFlashRFloor = 0, flatFlashGFloor = 0, flatFlashBFloor = 0;
        let flatFlashRCeil = 0, flatFlashGCeil = 0, flatFlashBCeil = 0;
        
        let floorTexData = defaultFloorData;
        let floorTexW = defaultFloorW;
        let floorTexH = defaultFloorH;
        
        let isHighlightedFloor = false;
        let isAiVisionFloor = false;
        let cellHasFlashFloor = false;
        let isWaterFloor = false;
        let cellHasFlashCeil = false;

        let isOutdoorTileFloor = false;
        let isOutdoorTileCeil = false;
        let effectiveLightningRFloor = 0, effectiveLightningGFloor = 0, effectiveLightningBFloor = 0;
        let effectiveLightningRCeil = 0, effectiveLightningGCeil = 0, effectiveLightningBCeil = 0;

        let lastCellXFloorOuter = -1, lastCellYFloorOuter = -1;
        let isSkyboxFloorCached = false;
        let lastCellXCeilOuter = -1, lastCellYCeilOuter = -1;
        let isSkyboxCeilCached = false;

        let lastResolvedFLevel = playerFloorHeight;

        for (let x = 0; x < width; x += resolutionDivisor) {
            const rayDirX = rayDirXCache[x];
            const rayDirY = rayDirYCache[x];
            const floorX = posX + rowDistFloor * rayDirX;
            const floorY = posY + rowDistFloor * rayDirY;
            const ceilX = posX + rowDistCeil * rayDirX;
            const ceilY = posY + rowDistCeil * rayDirY;
            const ceilTileDistSq = (ceilX - posX) * (ceilX - posX) + (ceilY - posY) * (ceilY - posY);

            // --- FLOOR ---
            if (yFloor >= 0 && yFloor < height) {
                let fLevel = playerFloorHeight;
                let actualRowDistFloor = rowDistFloor;
                let actualFogFactorFloor = fogFactorFloor;

                let cellX = (posX + actualRowDistFloor * rayDirX) | 0;
                let cellY = (posY + actualRowDistFloor * rayDirY) | 0;
                const isValidCell = cellX >= 0 && cellX < gridWidth && cellY >= 0 && cellY < gridHeight;

                let actualFloorX = -1;
                let actualFloorY = -1;
                if (isValidCell) {
                    actualFloorX = posX + actualRowDistFloor * rayDirX;
                    actualFloorY = posY + actualRowDistFloor * rayDirY;
                    actualFogFactorFloor = getDepthFactor(actualRowDistFloor);
                }

                lastResolvedFLevel = fLevel;

                let checkTile = isValidCell ? grid[cellY][cellX] : null;

                // OPTIMIZATION: If the floor projection hits a full-height solid wall tile or raised floor tile on ground layer,
                // it is completely occluded from the viewer's perspective and will be overwritten by the wall/passthrough renderer anyway.
                // We write the fallback fog color extremely fast and skip all texture and lighting mathematics.
                if ((!grids || grids.length <= 1) && checkTile && checkTile.type === 'WALL' && !checkTile.isWindow && (checkTile.elevation === undefined || checkTile.elevation <= 0) && (checkTile.height === undefined || checkTile.height >= 1.0)) {
                    const blackFog = getFogColorInt();
                    screenBuffer[yFloor * width + x] = blackFog;
                    if (resolutionDivisor > 1) {
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[yFloor * width + (x + d)] = blackFog;
                        }
                    }
                } else {
                    const floorTileDistSq = (actualFloorX - posX) * (actualFloorX - posX) + (actualFloorY - posY) * (actualFloorY - posY);

                if (isValidCell) {
                    if (cellX !== lastCellXFloorOuter || cellY !== lastCellYFloorOuter) {
                        lastCellXFloorOuter = cellX;
                        lastCellYFloorOuter = cellY;
                        isSkyboxFloorCached = outdoorMap ? outdoorMap[cellY][cellX] : false;
                    }
                    if (floorTileDistSq <= (renderDistance + 2) * (renderDistance + 2) || isSkyboxFloorCached) {
                const cellKey = cellY * 10000 + cellX;
                if (cellX !== lastCellXFloor || cellY !== lastCellYFloor) {
                    lastCellXFloor = cellX;
                    lastCellYFloor = cellY;
                    
                    floorTexData = defaultFloorData;
                    floorTexW = defaultFloorW;
                    floorTexH = defaultFloorH;
                    
                    isHighlightedFloor = false;
                    isAiVisionFloor = false;
                    cellHasFlashFloor = false;
                    isWaterFloor = false;
                    
                    isOutdoorTileFloor = outdoorMap && isValidCell ? outdoorMap[cellY][cellX] : ceilingType === 'OUTDOOR';

                    if (hasLightMap) {
                        const cellLight = getL(cellX, cellY);
                        cellLightRFloor = cellLight.r;
                        cellLightGFloor = cellLight.g;
                        cellLightBFloor = cellLight.b;
                    } else {
                        cellLightRFloor = 1; cellLightGFloor = 1; cellLightBFloor = 1;
                    }

                    if (getCellFlashing(cellX, cellY)) {
                        cellHasFlashFloor = true;
                        flatFlashRFloor = (tempFlash[0] + tempFlash[3] + tempFlash[6] + tempFlash[9]) * 0.25;
                        flatFlashGFloor = (tempFlash[1] + tempFlash[4] + tempFlash[7] + tempFlash[10]) * 0.25;
                        flatFlashBFloor = (tempFlash[2] + tempFlash[5] + tempFlash[8] + tempFlash[11]) * 0.25;
                    } else {
                        flatFlashRFloor = 0; flatFlashGFloor = 0; flatFlashBFloor = 0;
                    }
                }

                    if (isValidCell) {
                        const tile = grid[cellY][cellX];
                        if (debugTextures && tile && auxBuffers) {
                            if (tile.decoration?.isEmptyness) {
                                const fb = auxBuffers.get('TEX_FALLBACK');
                                if (fb) {
                                    floorTexData = fb.data;
                                    floorTexW = fb.width;
                                    floorTexH = fb.height;
                                }
                            } else {
                                const floorAssetToUse = tile.floorAssetId || (tile.type !== 'WALL' ? tile.assetId : null);
                                if (floorAssetToUse && auxBuffers.has(floorAssetToUse)) {
                                    const aux = auxBuffers.get(floorAssetToUse)!;
                                    floorTexData = aux.data;
                                    floorTexW = aux.width;
                                    floorTexH = aux.height;
                                } else if (!floorAssetToUse && tile.type !== 'WALL') {
                                    const fb = auxBuffers.get('TEX_FALLBACK');
                                    if (fb) {
                                        floorTexData = fb.data;
                                        floorTexW = fb.width;
                                        floorTexH = fb.height;
                                    }
                                }
                            }
                        }

                        if (debugTextures && customFloorBuffers) {
                            const decalKey = cellKey * 10 + 4;
                            const custom = customFloorBuffers.get(decalKey);
                            if (custom) {
                                floorTexData = custom.data;
                                floorTexW = custom.width;
                                floorTexH = custom.height;
                            }
                        }

                        isHighlightedFloor = reusableHighlightSet.has(cellKey);
                        isAiVisionFloor = aiVisionSet ? aiVisionSet.has(cellKey) : false;
                        if (tile) {
                            isWaterFloor = !!tile.isWater;
                            if (isWaterFloor) {
                                waterVisibleThisFrame = true;
                            }
                        }
                    }
                }

                let fr = 26, fg = 26, fb = 26;
                let hasFloorColor = false;

                if (floorTexData) {
                    let fX = actualFloorX;
                    let fY = actualFloorY;
                    if (isWaterFloor) {
                        const argX = (actualFloorX * SCALE_10 + waterOffset1_scaled) | 0;
                        const argY = (actualFloorY * SCALE_10 + waterOffset2_scaled) | 0;
                        
                        const sinX = SIN_LUT[argX & SIN_LUT_MASK];
                        const cosY = COS_LUT[argY & SIN_LUT_MASK];
                        const sinY = SIN_LUT[argY & SIN_LUT_MASK];
                        const cosX = COS_LUT[argX & SIN_LUT_MASK];
                        
                        fX = actualFloorX + (sinX + cosY) * 0.05 + 10000;
                        fY = actualFloorY + (sinY + cosX) * 0.05 + 10000;
                    }
                    let tx = (floorTexW - 1) - (((fX * floorTexW) | 0) % floorTexW);
                    let ty = ((fY * floorTexH) | 0) % floorTexH;
                    const texIdx = ty * floorTexW + tx;
                    let color = floorTexData[texIdx];
                    
                    fr = color & 0xFF;
                    fg = (color >> 8) & 0xFF;
                    fb = (color >> 16) & 0xFF;
                    hasFloorColor = true;
                } else {
                    fr = getFogColorR();
                    fg = getFogColorG();
                    fb = getFogColorB();
                    hasFloorColor = true;
                    isOutdoorTileFloor = false; // Force drawing black fog instead of skybox hole
                }

                if (hasFloorColor) {
                    let lightRFloor = cellLightRFloor, lightGFloor = cellLightGFloor, lightBFloor = cellLightBFloor;
                    if (hasLightMap && isValidCell) {
                        const interpL = getInterpolatedL(actualFloorX, actualFloorY);
                        lightRFloor = interpL.r;
                        lightGFloor = interpL.g;
                        lightBFloor = interpL.b;
                    }
                    if (flashlightActive) {
                        lightRFloor = Math.max(floorValue, lightRFloor);
                        lightGFloor = Math.max(floorValue, lightGFloor);
                        lightBFloor = Math.max(floorValue, lightBFloor);
                    }
                    
                    const fogIntFloor = (actualFogFactorFloor * 256) | 0;
                    const totalRMultFloor = (lightRFloor * fogIntFloor) | 0;
                    const totalGMultFloor = (lightGFloor * fogIntFloor) | 0;
                    const totalBMultFloor = (lightBFloor * fogIntFloor) | 0;

                    fr = (fr * totalRMultFloor) >> 8;
                    fg = (fg * totalGMultFloor) >> 8;
                    fb = (fb * totalBMultFloor) >> 8;

                    if (isFogWeather()) {
                        const fogAmt = 256 - fogIntFloor;
                        fr = Math.min(255, fr + ((getFogColorR() * fogAmt) >> 8));
                        fg = Math.min(255, fg + ((getFogColorG() * fogAmt) >> 8));
                        fb = Math.min(255, fb + ((getFogColorB() * fogAmt) >> 8));
                    }

                    if (hasLightning) {
                        const lightningMult = getLightningMult(cellX, cellY);
                        if (lightningMult > 0.001) {
                            fr += (lightningIntensity * 150 * lightningMult) | 0; if (fr > 255) fr = 255;
                            fg += (lightningIntensity * 160 * lightningMult) | 0; if (fg > 255) fg = 255;
                            fb += (lightningIntensity * 200 * lightningMult) | 0; if (fb > 255) fb = 255;
                        }
                    }
                    if (cellHasFlashFloor) {
                        fr += flatFlashRFloor | 0; if (fr > 255) fr = 255;
                        fg += flatFlashGFloor | 0; if (fg > 255) fg = 255;
                        fb += flatFlashBFloor | 0; if (fb > 255) fb = 255;
                    }
                    if (isHighlightedFloor) {
                        fr += highlightRAdd; if (fr > 255) fr = 255;
                        fg = (fg * highlightGBMult) | 0; fb = (fb * highlightGBMult) | 0;
                    }
                    if (isAiVisionFloor) {
                        fr += 100; if (fr > 255) fr = 255;
                        fg = (fg * 0.5) | 0; fb = (fb * 0.5) | 0;
                    }

                    const finalFloorColor = (255 << 24) | (fb << 16) | (fg << 8) | fr;
                    screenBuffer[yFloor * width + x] = finalFloorColor;
                    for (let d = 1; d < resolutionDivisor; d++) {
                        if (x + d < width) screenBuffer[yFloor * width + (x + d)] = finalFloorColor;
                    }
                    } else { // closes rowDistFloor
                        if (ceilingType !== 'OUTDOOR') {
                            const blackFog = getFogColorInt();
                            screenBuffer[yFloor * width + x] = blackFog;
                            for (let d = 1; d < resolutionDivisor; d++) {
                                if (x + d < width) screenBuffer[yFloor * width + (x + d)] = blackFog;
                            }
                        }
                    }
                } else { // closes cellX
                    if (ceilingType !== 'OUTDOOR') {
                        const blackFog = getFogColorInt();
                        screenBuffer[yFloor * width + x] = blackFog;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[yFloor * width + (x + d)] = blackFog;
                        }
                    }
                }
                } // closes the optimization else
            } // closes yFloor
            
            // --- CEILING ---
            if (yCeil >= 0 && yCeil < height) {
                const cellX = ceilX | 0;
                const cellY = ceilY | 0;
                const ceilTile = (cellY >= 0 && cellY < gridHeight && cellX >= 0 && cellX < gridWidth) ? grid[cellY][cellX] : null;

                // OPTIMIZATION: If the ceiling projection hits a full-height solid wall tile on ground layer,
                // it is completely occluded from the viewer's perspective and will be overwritten by the wall renderer anyway.
                // We write the fallback fog color extremely fast and skip all texture and lighting mathematics.
                if ((!grids || grids.length <= 1) && ceilTile && ceilTile.type === 'WALL' && !ceilTile.isWindow && (ceilTile.elevation === undefined || ceilTile.elevation <= 0) && (ceilTile.height === undefined || ceilTile.height >= 1.0)) {
                    if (ceilingType !== 'OUTDOOR' && !outdoorMap) {
                        const blackFog = getFogColorInt();
                        screenBuffer[yCeil * width + x] = blackFog;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[yCeil * width + (x + d)] = blackFog;
                        }
                    }
                } else {
                    if (cellX >= 0 && cellX < gridWidth && cellY >= 0 && cellY < gridHeight) {
                    if (cellX !== lastCellXCeilOuter || cellY !== lastCellYCeilOuter) {
                        lastCellXCeilOuter = cellX;
                        lastCellYCeilOuter = cellY;
                        isSkyboxCeilCached = outdoorMap ? outdoorMap[cellY][cellX] : ceilingType === 'OUTDOOR';
                    }
                    if (ceilTileDistSq <= (renderDistance + 2) * (renderDistance + 2) || isSkyboxCeilCached) {
                
                if (cellX !== lastCellXCeil || cellY !== lastCellYCeil) {
                    lastCellXCeil = cellX;
                    lastCellYCeil = cellY;
                    
                     isOutdoorTileCeil = outdoorMap && cellY >= 0 && cellY < gridHeight && cellX >= 0 && cellX < gridWidth ? outdoorMap[cellY][cellX] : ceilingType === 'OUTDOOR';
                    if (getCellFlashing(cellX, cellY)) {
                        cellHasFlashCeil = true;
                        flatFlashRCeil = (tempFlash[0] + tempFlash[3] + tempFlash[6] + tempFlash[9]) * 0.25;
                        flatFlashGCeil = (tempFlash[1] + tempFlash[4] + tempFlash[7] + tempFlash[10]) * 0.25;
                        flatFlashBCeil = (tempFlash[2] + tempFlash[5] + tempFlash[8] + tempFlash[11]) * 0.25;
                    } else {
                        cellHasFlashCeil = false;
                        flatFlashRCeil = 0; flatFlashGCeil = 0; flatFlashBCeil = 0;
                    }

                    if (hasLightMap) {
                        const cellLight = getL(cellX, cellY);
                        cellLightRCeil = cellLight.r;
                        cellLightGCeil = cellLight.g;
                        cellLightBCeil = cellLight.b;
                    } else {
                        cellLightRCeil = 1; cellLightGCeil = 1; cellLightBCeil = 1;
                    }
                }

                if (!isOutdoorTileCeil) {
                    const blackFog = getFogColorInt();
                    screenBuffer[yCeil * width + x] = blackFog;
                    for (let d = 1; d < resolutionDivisor; d++) {
                        if (x + d < width) screenBuffer[yCeil * width + (x + d)] = blackFog;
                    }
                }
                    } else { // closes rowDistCeil
                        if (ceilingType !== 'OUTDOOR' && !outdoorMap) {
                            const blackFog = getFogColorInt();
                            screenBuffer[yCeil * width + x] = blackFog;
                            for (let d = 1; d < resolutionDivisor; d++) {
                                if (x + d < width) screenBuffer[yCeil * width + (x + d)] = blackFog;
                            }
                        }
                    }
                } else { // closes cellX
                    if (ceilingType !== 'OUTDOOR' && !outdoorMap) {
                        const blackFog = getFogColorInt();
                        screenBuffer[yCeil * width + x] = blackFog;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[yCeil * width + (x + d)] = blackFog;
                        }
                    }
                }
                } // closes the optimization else
            } // closes yCeil
        }
    }
    if (waterVisibleThisFrame && onWaterVisible) {
        onWaterVisible();
    }
};

