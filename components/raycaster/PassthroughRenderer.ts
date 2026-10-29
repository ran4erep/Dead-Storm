
import { RaycasterBuffer, adjustLightForClosedDoors } from './RaycasterUtils';
import { PassThroughDoor, PassThroughWall } from './RaycasterTypes';
import { getDepthFactor, isFogWeather, getFogColorInt, getOriginalDepthFactor, getFogColorR, getFogColorG, getFogColorB, getCurrentRenderDistance, getFogStart, getInvFogRange, getInvRenderDistance, getMinBrightness } from './DepthEffect';
import { isWebGLActive, pushQuad, globalSpriteShadows, globalMagentaShadowsEnabled } from './WebGLState';
import { renderWindowSegment } from './WindowRenderer';
import { calculateLighting, LightingResult } from './Lighting';

const SIN_LUT_SIZE = 2048;
const SIN_LUT_MASK = SIN_LUT_SIZE - 1;
const SIN_LUT = new Float32Array(SIN_LUT_SIZE);
const COS_LUT = new Float32Array(SIN_LUT_SIZE);
const SCALE = SIN_LUT_SIZE / (Math.PI * 2);

interface CapShadow {
    x: number;
    y: number;
    rx: number;
    ry: number;
    invRx2: number;
    invRy2: number;
}
const reusableCapShadows: CapShadow[] = [
    { x: 0, y: 0, rx: 0, ry: 0, invRx2: 0, invRy2: 0 },
    { x: 0, y: 0, rx: 0, ry: 0, invRx2: 0, invRy2: 0 },
    { x: 0, y: 0, rx: 0, ry: 0, invRx2: 0, invRy2: 0 },
    { x: 0, y: 0, rx: 0, ry: 0, invRx2: 0, invRy2: 0 }
];

const MAX_LUT_SIZE = 4096;
const RECIPROCAL_LUT = new Float32Array(MAX_LUT_SIZE);
RECIPROCAL_LUT[0] = 0.0001;
for (let i = 1; i < MAX_LUT_SIZE; i++) {
    RECIPROCAL_LUT[i] = 1.0 / i;
}

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

function getMaskedDoorBuffer(doorBuf: RaycasterBuffer, maskBuf: RaycasterBuffer, isBroken: boolean = false): RaycasterBuffer {
    let cached = (doorBuf as any)[`_masked_${isBroken ? 'b' : 'n'}`];
    if (cached) return cached;

    const texW = doorBuf.width;
    const texH = doorBuf.height;
    const maskW = maskBuf.width;
    const maskH = maskBuf.height;
    const scaleX = maskW / texW;
    const scaleY = maskH / texH;

    const srcData = doorBuf.data;
    const maskData = maskBuf.data;
    const outData = new Uint32Array(srcData.length);

    for (let y = 0; y < texH; y++) {
        const mty = (y * scaleY) | 0;
        const maskRow = mty * maskW;
        const texRow = y * texW;
        for (let x = 0; x < texW; x++) {
            const mtx = (x * scaleX) | 0;
            const maskColor = maskData[maskRow + mtx];
            const isGreen = (maskColor & 0x00FFFFFF) === 0x0000FF00;
            const srcPixel = srcData[texRow + x];
            if (isGreen) {
                if (isBroken) {
                    outData[texRow + x] = 0;
                } else {
                    const r = srcPixel & 0xFF;
                    const g = (srcPixel >> 8) & 0xFF;
                    const b = (srcPixel >> 16) & 0xFF;
                    outData[texRow + x] = (100 << 24) | (b << 16) | (g << 8) | r;
                }
            } else {
                outData[texRow + x] = srcPixel;
            }
        }
    }

    const result: RaycasterBuffer = {
        width: texW,
        height: texH,
        data: outData
    };
    (doorBuf as any)[`_masked_${isBroken ? 'b' : 'n'}`] = result;
    return result;
}

const getLightningMultAt = (
    fxObj: number,
    fyObj: number,
    lightningMap: Float32Array | null | undefined,
    outdoorMap: boolean[][] | undefined,
    mapWidth: number,
    mapHeight: number
): number => {
    const cx = fxObj | 0;
    const cy = fyObj | 0;
    if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) {
        return (outdoorMap) ? 1.0 : 0.0;
    }
    if (lightningMap) {
        return lightningMap[cy * mapWidth + cx];
    }
    const isO = outdoorMap && outdoorMap[cy] && outdoorMap[cy][cx];
    return isO ? 1.0 : 0.0;
};

const drawWindowPart = (
    x: number, drawStart: number, drawEnd: number, pt: PassThroughWall,
    currentWallBuf: RaycasterBuffer, texX: number,
    levelDrawStart: number, texStartShift: number, lh: number,
    rMultInt: number, gMultInt: number, bMultInt: number, fRInt: number, fGInt: number, fBInt: number,
    distFogInt: number, alphaMultiplier: number,
    screenBuffer: Uint32Array, width: number, resolutionDivisor: number
) => {
    let fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
    
    const stepFixed = ((currentWallBuf.height << 16) / lh) | 0;
    let texPosFixed = ((drawStart - levelDrawStart + texStartShift) * stepFixed) | 0;
    const texW = currentWallBuf.width;
    const texData = currentWallBuf.data;
    fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
    const fogR = (getFogColorR() * fogAmtInt) >> 8;
    const fogG = (getFogColorG() * fogAmtInt) >> 8;
    const fogB = (getFogColorB() * fogAmtInt) >> 8;
    const hasFlash = fRInt > 0 || fGInt > 0 || fBInt > 0 || fogAmtInt > 0;
    
    // integer alpha (0-255)
    // We already have transparent pixels in texture, alphaMultiplier applies on top of texture alpha
    const alphaMultInt = (alphaMultiplier * 256) | 0;

    for (let y = drawStart; y < drawEnd; y++) {
        const ty = (((texPosFixed >> 16) % currentWallBuf.height) + currentWallBuf.height) % currentWallBuf.height; 
        texPosFixed += stepFixed;
        
        const color = texData[(ty * texW + texX) | 0];
        let texAlpha = (color >> 24) & 0xFF;
        
        // apply alpha multiplier
        if (alphaMultInt < 256) Math.floor(texAlpha = (texAlpha * alphaMultInt) >> 8);
        
        if (texAlpha > 0) {
            let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
            
            if (hasFlash) {
                const totalRMult = rMultInt + fRInt;
                const totalGMult = gMultInt + fGInt;
                const totalBMult = bMultInt + fBInt;
                r = (r * totalRMult) >> 8; 
                g = (g * totalGMult) >> 8; 
                b = (b * totalBMult) >> 8;
                r += (isWebGLActive ? 0 : (fRInt >> 2)) + fogR;
                g += (isWebGLActive ? 0 : (fGInt >> 2)) + fogG;
                b += (isWebGLActive ? 0 : (fBInt >> 2)) + fogB;
            } else {
                r = (r * rMultInt) >> 8; 
                g = (g * gMultInt) >> 8; 
                b = (b * bMultInt) >> 8;
            }

            r = Math.min(255, r);
            g = Math.min(255, g);
            b = Math.min(255, b);
            
            if (texAlpha < 255) {
                // blend
                const bgVal = screenBuffer[y * width + x];
                const bgR = bgVal & 0xFF; const bgG = (bgVal >> 8) & 0xFF; const bgB = (bgVal >> 16) & 0xFF;
                const invA = 255 - texAlpha;
                r = (r * texAlpha + bgR * invA) >> 8;
                g = (g * texAlpha + bgG * invA) >> 8;
                b = (b * texAlpha + bgB * invA) >> 8;
            }
            
            const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
            screenBuffer[y * width + x] = finalColor;
            for (let d = 1; d < resolutionDivisor; d++) {
                if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
            }
        }
    }
};

const getWallTopZ = (layer: number, mx: number, my: number, activeGrids: any[][][]): number | null => {
    const tile = activeGrids[layer]?.[my]?.[mx];
    if (!tile || tile.type !== 'WALL') return null;
    if (tile.isWindow) {
        const thickness = tile.thickness !== undefined ? tile.thickness : 1.0;
        if (thickness < 1.0) return null;
    }
    let elev = tile.elevation !== undefined ? tile.elevation : 0;
    let h = tile.height !== undefined ? Math.abs(tile.height) : 1.0;
    if (tile.height !== undefined && tile.height < 0) {
        elev = 1.0 - h;
    }
    return layer + elev + h;
};

const getWallBotZ = (layer: number, mx: number, my: number, activeGrids: any[][][]): number | null => {
    const tile = activeGrids[layer]?.[my]?.[mx];
    if (!tile || tile.type !== 'WALL') return null;
    let elev = tile.elevation !== undefined ? tile.elevation : 0;
    let h = tile.height !== undefined ? Math.abs(tile.height) : 1.0;
    if (tile.height !== undefined && tile.height < 0) {
        elev = 1.0 - h;
    }
    return layer + elev;
};

// Lazy module-level variables for caching the solid status of walls and doors
let lastActiveGrid: any[][] | null = null;
let isSolidGridsCache: Uint8Array[] = [];

export const renderPassthroughWalls = (
    x: number,
    passThroughWalls: PassThroughWall[],
    wallBuffer: RaycasterBuffer | null,
    debugTextures: boolean,
    height: number,
    horizon: number,
    posY: number,
    posX: number,
    rayDirX: number,
    rayDirY: number,
    activeGrids: any[][][],
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    lightMap: { r: number; g: number; b: number }[][] | undefined,
    outdoorMap: boolean[][] | undefined,
    lightningMap: Float32Array | null | undefined,
    mapWidth: number,
    mapHeight: number,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    activeFlashes: {x: number, y: number, intensity: number}[] | undefined,
    muzzleR: number, muzzleG: number, muzzleB: number,
    lightningR: number, lightningG: number, lightningB: number,
    zBuffer: Float32Array,
    screenBuffer: Uint32Array,
    width: number,
    cameraZ: number,
    resolutionDivisor: number = 1,
    renderDistance: number = 15,
    customFloorBuffers?: Map<number, RaycasterBuffer>,
    customWallBuffers?: Map<number, RaycasterBuffer>,
    reusableHighlightSet?: Set<number>,
    flashlightActive: boolean = false,
    flashlightBatteryRatio: number = 1.0,
    floorLightMaps?: { r: number; g: number; b: number }[][][]
) => {
    if (!passThroughWalls || passThroughWalls.length === 0) {
        return;
    }

    const isFog = isFogWeather();
    const timePulse = Math.sin(Date.now() / 450) * 0.5 + 0.5;
    const highlightPulse = 0.25 + 0.75 * timePulse;
    const highlightRAdd = (60 * highlightPulse) | 0;
    const highlightGBMult = 1.0 - 0.6 * highlightPulse;
    const fogStart = getFogStart();
    const invFogRange = getInvFogRange();
    const invRenderDistance = getInvRenderDistance();
    const minBrightness = getMinBrightness();
    const maxRenderDistance = getCurrentRenderDistance();
    const minBrightnessInt = (minBrightness * 256) | 0;
    const fogColorR = getFogColorR();
    const fogColorG = getFogColorG();
    const fogColorB = getFogColorB();

    const getL = (lx: number, ly: number) => {
        if (!lightMap) return { r: 1.0, g: 1.0, b: 1.0 };
        if (ly >= 0 && ly < mapHeight && lx >= 0 && lx < mapWidth && lightMap[ly]) {
            const grid = activeGrids[0]; // ground level grid for neighbor check
            const tile = grid && grid[ly] ? grid[ly][lx] : null;
            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                let bestX = lx;
                let bestY = ly;
                let minDist = 999999;
                
                const checkNeighbor = (nx: number, ny: number) => {
                    if (ny >= 0 && ny < mapHeight && nx >= 0 && nx < mapWidth) {
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

                checkNeighbor(lx - 1, ly);
                checkNeighbor(lx + 1, ly);
                checkNeighbor(lx, ly - 1);
                checkNeighbor(lx, ly + 1);

                if (minDist === 999999) {
                    checkNeighbor(lx - 1, ly - 1);
                    checkNeighbor(lx + 1, ly - 1);
                    checkNeighbor(lx - 1, ly + 1);
                    checkNeighbor(lx + 1, ly + 1);
                }
                
                if (lightMap[bestY] && lightMap[bestY][bestX]) {
                    return lightMap[bestY][bestX];
                }
            } else {
                return lightMap[ly][lx] || { r: 1.0, g: 1.0, b: 1.0 };
            }
        }
        return { r: 1.0, g: 1.0, b: 1.0 };
    };

    const primaryGrid = activeGrids[0];
    if (isSolidGridsCache.length !== activeGrids.length || lastActiveGrid !== primaryGrid) {
        lastActiveGrid = primaryGrid;
        if (isSolidGridsCache.length !== activeGrids.length) {
            isSolidGridsCache = new Array(activeGrids.length);
        }
        for (let l = 0; l < activeGrids.length; l++) {
            const grid = activeGrids[l];
            const neededSize = mapWidth * mapHeight;
            let cache = isSolidGridsCache[l];
            if (!cache || cache.length !== neededSize) {
                cache = new Uint8Array(neededSize);
                isSolidGridsCache[l] = cache;
            } else {
                cache.fill(0);
            }
            if (grid) {
                for (let y = 0; y < mapHeight; y++) {
                    const row = grid[y];
                    if (row) {
                        for (let x = 0; x < mapWidth; x++) {
                            const tile = row[x];
                            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                                cache[y * mapWidth + x] = 1;
                            }
                        }
                    }
                }
            }
        }
    }

    const defaultLight = { r: 1.0, g: 1.0, b: 1.0 };
    const interpRes = { r: 1.0, g: 1.0, b: 1.0 };
    const getInterpolatedL = (xf: number, yf: number, targetLightMap: { r: number; g: number; b: number }[][] | undefined, layer: number) => {
        if (!targetLightMap) {
            interpRes.r = 1.0; interpRes.g = 1.0; interpRes.b = 1.0;
            return interpRes;
        }
        const cx = Math.floor(xf);
        const cy = Math.floor(yf);

        const rowCurr = targetLightMap[cy];
        const cCurr = rowCurr ? (rowCurr[cx] || defaultLight) : defaultLight;

        const tx = xf - cx;
        const ty = yf - cy;

        const margin = 0.40; // 40% margin as requested for ultra-smooth transitions
        const invMargin = 2.5; // 1.0 / 0.40 is exactly 2.5

        let weightX = 0;
        let neighborXLight = cCurr;

        const layerCache = isSolidGridsCache[layer];
        const mw = mapWidth;
        const cellIdx = cy * mw + cx;

        if (tx < margin) {
            const nx = cx - 1;
            const isSolid = nx < 0 || (layerCache && layerCache[cellIdx - 1] === 1);
            const cLeft = isSolid ? cCurr : (rowCurr ? (rowCurr[nx] || defaultLight) : defaultLight);
            weightX = 0.5 * (margin - tx) * invMargin;
            neighborXLight = cLeft;
        } else if (tx > 1.0 - margin) {
            const nx = cx + 1;
            const isSolid = nx >= mw || (layerCache && layerCache[cellIdx + 1] === 1);
            const cRight = isSolid ? cCurr : (rowCurr ? (rowCurr[nx] || defaultLight) : defaultLight);
            weightX = 0.5 * (tx - (1.0 - margin)) * invMargin;
            neighborXLight = cRight;
        }

        let weightY = 0;
        let neighborYLight = cCurr;

        if (ty < margin) {
            const ny = cy - 1;
            const isSolid = ny < 0 || (layerCache && layerCache[cellIdx - mw] === 1);
            const rowTop = ny >= 0 ? targetLightMap[ny] : undefined;
            const cTop = isSolid ? cCurr : (rowTop ? (rowTop[cx] || defaultLight) : defaultLight);
            weightY = 0.5 * (margin - ty) * invMargin;
            neighborYLight = cTop;
        } else if (ty > 1.0 - margin) {
            const ny = cy + 1;
            const isSolid = ny >= mapHeight || (layerCache && layerCache[cellIdx + mw] === 1);
            const rowBottom = ny < mapHeight ? targetLightMap[ny] : undefined;
            const cBottom = isSolid ? cCurr : (rowBottom ? (rowBottom[cx] || defaultLight) : defaultLight);
            weightY = 0.5 * (ty - (1.0 - margin)) * invMargin;
            neighborYLight = cBottom;
        }

        if (weightX === 0 && weightY === 0) {
            interpRes.r = cCurr.r;
            interpRes.g = cCurr.g;
            interpRes.b = cCurr.b;
        } else {
            const wCurr = (1.0 - weightX) * (1.0 - weightY);
            const wX = weightX * (1.0 - weightY);
            const wY = (1.0 - weightX) * weightY;
            const wXY = weightX * weightY;

            let diagonalLight = cCurr;
            if (wXY > 0) {
                const dx = (tx < margin) ? (cx - 1) : (cx + 1);
                const dy = (ty < margin) ? (cy - 1) : (cy + 1);
                const isSolid = dx < 0 || dx >= mw || dy < 0 || dy >= mapHeight || (layerCache && layerCache[dy * mw + dx] === 1);
                const rowDiag = (dy >= 0 && dy < mapHeight) ? targetLightMap[dy] : undefined;
                diagonalLight = isSolid ? cCurr : (rowDiag ? (rowDiag[dx] || defaultLight) : defaultLight);
            }

            interpRes.r = cCurr.r * wCurr + neighborXLight.r * wX + neighborYLight.r * wY + diagonalLight.r * wXY;
            interpRes.g = cCurr.g * wCurr + neighborXLight.g * wX + neighborYLight.g * wY + diagonalLight.g * wXY;
            interpRes.b = cCurr.b * wCurr + neighborXLight.b * wX + neighborYLight.b * wY + diagonalLight.b * wXY;
        }

        return interpRes;
    };

    if (passThroughWalls.length > 1) {
        for (let i = 0; i < passThroughWalls.length; i++) {
            const w = passThroughWalls[i];
            const topZ = w.layer + (w.topZ !== undefined ? w.topZ : 1.0);
            const botZ = w.layer + (w.bottomZ !== undefined ? w.bottomZ : 0.0);
            const dz = cameraZ - (topZ + botZ) * 0.5;
            (w as any)._sortDist = w.dist * w.dist + dz * dz;
        }
        if (passThroughWalls.length === 2) {
            if ((passThroughWalls[0] as any)._sortDist > (passThroughWalls[1] as any)._sortDist) {
                const tmp = passThroughWalls[0];
                passThroughWalls[0] = passThroughWalls[1];
                passThroughWalls[1] = tmp;
            }
        } else {
            passThroughWalls.sort((a, b) => (a as any)._sortDist - (b as any)._sortDist);
        }
    }

    if (passThroughWalls.length > 0) {

        for (let i = passThroughWalls.length - 1; i >= 0; i--) {
            const pt = passThroughWalls[i];
            if (pt.isOccluderOnly) {
                continue;
            }
            const dist = pt.dist; const lh = height / dist;
            const absTopZ = pt.layer + (pt.topZ !== undefined ? pt.topZ : 1.0);
            const absBotZ = pt.layer + (pt.bottomZ !== undefined ? pt.bottomZ : 0.0);
            
            const levelDrawEnd = Math.ceil(horizon + lh * (cameraZ - absBotZ));
            const levelDrawStart = Math.floor(horizon + lh * (cameraZ - absTopZ));

            let drawStart = Math.max(0, levelDrawStart); 
            let drawEnd = Math.min(height, levelDrawEnd);
            if (pt.clipBottom !== undefined) {
                drawEnd = Math.min(drawEnd, pt.clipBottom);
            }

            const nearSpans: { top: number; bot: number }[] = [];
            for (let k = 0; k < passThroughWalls.length; k++) {
                if (k === i) continue;
                const occ = passThroughWalls[k];
                if (!occ) continue;
                if (occ.dist >= dist - 0.02) continue;

                let occTop: number;
                let occBot: number;
                if (occ.wallTop !== undefined && occ.wallBottom !== undefined) {
                    occTop = occ.wallTop;
                    occBot = occ.wallBottom;
                } else {
                    const occLh = height / occ.dist;
                    const occAbsTopZ = occ.layer + (occ.topZ !== undefined ? occ.topZ : 1.0);
                    const occAbsBotZ = occ.layer + (occ.bottomZ !== undefined ? occ.bottomZ : 0.0);
                    occTop = Math.floor(horizon + occLh * (cameraZ - occAbsTopZ));
                    occBot = Math.ceil(horizon + occLh * (cameraZ - occAbsBotZ));
                    if (occ.clipBottom !== undefined) {
                        occBot = Math.min(occBot, occ.clipBottom);
                    }
                }
                if (occBot > occTop) {
                    nearSpans.push({ top: occTop, bot: occBot });
                }
            }
            const isPixelOccluded = (py: number): boolean => {
                for (let si = 0; si < nearSpans.length; si++) {
                    const s = nearSpans[si];
                    if (py >= s.top && py < s.bot) return true;
                }
                return false;
            };

            const upperTile = activeGrids[pt.layer][pt.mapY][pt.mapX];
            
            const cellKey = pt.mapY * 10000 + pt.mapX;
            // Vertical walls should not be tinted by floor highlights, especially upper floor (layer > 0) walls
            const isHighlighted = false;

            // OPTIMIZATION: Skip texture mapping for very distant walls
            if (dist > renderDistance) {
                continue;
            }

            let currentWallBuf: RaycasterBuffer | null = null;
            let usedAsset = false;
            let hasSpecifiedAsset = false;

            if (pt.isPitWall) {
                if (pt.pitTextureId) {
                    hasSpecifiedAsset = true;
                    if (debugTextures) {
                        if (auxBuffers?.has(pt.pitTextureId)) {
                            currentWallBuf = auxBuffers.get(pt.pitTextureId)!;
                            usedAsset = true;
                        } else if (auxBuffers?.has('TEX_' + pt.pitTextureId)) {
                            currentWallBuf = auxBuffers.get('TEX_' + pt.pitTextureId)!;
                            usedAsset = true;
                        }
                    }
                }
            } else if (upperTile) {
                // Check customWallBuffers for dynamic decals first (only on ground floor / layer 0)
                let faceCol = 0;
                if (pt.side === 0) {
                    faceCol = rayDirX > 0 ? 3 : 1;
                } else {
                    faceCol = rayDirY > 0 ? 0 : 2;
                }
                const wallDecalKey = (pt.mapY * 10000 + pt.mapX) * 10 + faceCol;
                if (debugTextures && customWallBuffers && (pt.layer === undefined || pt.layer === 0) && customWallBuffers.has(wallDecalKey)) {
                    currentWallBuf = customWallBuffers.get(wallDecalKey)!;
                    usedAsset = true;
                    hasSpecifiedAsset = true;
                }

                if (!usedAsset) {
                    let faceDirectionStr: 'N'|'E'|'S'|'W' | null = null;
                    if (pt.side === 0) {
                        faceDirectionStr = rayDirX > 0 ? 'W' : 'E';
                    } else {
                        faceDirectionStr = rayDirY > 0 ? 'N' : 'S';
                    }

                    // 1. Try to resolve side-dependent face textures first
                    if (faceDirectionStr && upperTile.faces?.[faceDirectionStr]) {
                        const faceAssetId = upperTile.faces[faceDirectionStr]!;
                        hasSpecifiedAsset = true;
                        if (debugTextures) {
                            if (auxBuffers?.has(faceAssetId)) {
                                currentWallBuf = auxBuffers.get(faceAssetId)!;
                                usedAsset = true;
                            } else if (auxBuffers?.has('TEX_' + faceAssetId)) {
                                currentWallBuf = auxBuffers.get('TEX_' + faceAssetId)!;
                                usedAsset = true;
                            }
                        }
                    }
                }

                // 2. Try to resolve standard assetId next
                if (!usedAsset && upperTile.assetId) {
                    hasSpecifiedAsset = true;
                    if (debugTextures) {
                        if (auxBuffers?.has(upperTile.assetId)) {
                            currentWallBuf = auxBuffers.get(upperTile.assetId)!;
                            usedAsset = true;
                        } else if (auxBuffers?.has('TEX_' + upperTile.assetId)) {
                            currentWallBuf = auxBuffers.get('TEX_' + upperTile.assetId)!;
                            usedAsset = true;
                        }
                    }
                }

                // 3. Try to resolve floor textureId for elevated floors acting as walls
                if (!usedAsset && upperTile.type === 'FLOOR') {
                    const floorAssetToUse = upperTile.floorAssetId || upperTile.assetId || upperTile.textureId;
                    if (floorAssetToUse) {
                        hasSpecifiedAsset = true;
                        if (debugTextures) {
                            if (auxBuffers?.has(floorAssetToUse)) {
                                currentWallBuf = auxBuffers.get(floorAssetToUse)!;
                                usedAsset = true;
                            } else if (auxBuffers?.has('TEX_' + floorAssetToUse)) {
                                currentWallBuf = auxBuffers.get('TEX_' + floorAssetToUse)!;
                                usedAsset = true;
                            }
                        }
                    }
                }
            }

            // Fallback determination
            if (!usedAsset) {
                // If the tile explicitly defined some asset but we couldn't load it, fallback to the checkerboard placeholder
                if (hasSpecifiedAsset) {
                    currentWallBuf = auxBuffers?.get('TEX_FALLBACK') || null;
                }
                
                // If still not resolved or we didn't specify any assets, use standard fallbacks
                if (!currentWallBuf) {
                    currentWallBuf = debugTextures ? wallBuffer : (auxBuffers?.get('TEX_FALLBACK') || null);
                }
            }

            if (!currentWallBuf) {
                let solidColor = (pt.side === 1) ? 0xFF514137 : 0xFF63554b;
                if (isHighlighted) {
                    let r = (pt.side === 1) ? 0x37 : 0x4b;
                    let g = (pt.side === 1) ? 0x41 : 0x55;
                    let b = (pt.side === 1) ? 0x51 : 0x63;
                    r += highlightRAdd; if (r > 255) r = 255;
                    g = (g * highlightGBMult) | 0; b = (b * highlightGBMult) | 0;
                    solidColor = (255 << 24) | (b << 16) | (g << 8) | r;
                }
                if (drawStart < drawEnd && ((pt.layer !== undefined && pt.layer > 0) || dist <= zBuffer[x] + 0.05)) {
                    for (let y = drawStart; y < drawEnd; y++) {
                        screenBuffer[y * width + x] = solidColor;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[y * width + (x + d)] = solidColor;
                        }
                    }
                }
                
                // Skip caps for non-textured
                continue;
            }

            let wallX; if (pt.side === 0) wallX = posY + dist * rayDirY; else wallX = posX + dist * rayDirX;
            wallX -= Math.floor(wallX);

            let texX = Math.floor(wallX * currentWallBuf.width);
            if (texX >= currentWallBuf.width) texX = currentWallBuf.width - 1;
            if (texX < 0) texX = 0;
            if (pt.side === 0 && rayDirX < 0) texX = currentWallBuf.width - texX - 1;
            if (pt.side === 1 && rayDirY > 0) texX = currentWallBuf.width - texX - 1;

            const stepFixed = ((currentWallBuf.height << 16) / lh) | 0;
            // Shift texture coordinates based on the starting Z
            const texStartShift = (1.0 - (pt.topZ !== undefined ? pt.topZ : 1.0)) * lh;
            let texPosFixed = ((drawStart - levelDrawStart + texStartShift) * stepFixed) | 0;
            const grid = activeGrids[pt.layer !== undefined && pt.layer >= 0 && pt.layer < activeGrids.length ? pt.layer : 0];
            const stepX = rayDirX < 0 ? -1 : 1;
            const stepY = rayDirY < 0 ? -1 : 1;

            const ptLightingResult: LightingResult = {
                rMultInt: 256,
                gMultInt: 256,
                bMultInt: 256,
                fRInt: 0,
                fGInt: 0,
                fBInt: 0,
                fogAmtInt: 0
            };

            const ptLightMap = (floorLightMaps && floorLightMaps[pt.layer]) ? floorLightMaps[pt.layer] : lightMap;
            calculateLighting(
                pt.mapX, pt.mapY, pt.side, false, false, dist,
                ptLightMap, outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity, activeFlashes,
                posX, posY, rayDirX, rayDirY, stepX, stepY, false, activeGrids[0],
                flashlightActive, flashlightBatteryRatio, ptLightingResult, activeGrids, true, pt.layer
            );

            const rMultInt = ptLightingResult.rMultInt;
            const gMultInt = ptLightingResult.gMultInt;
            const bMultInt = ptLightingResult.bMultInt;
            const fRInt = ptLightingResult.fRInt;
            const fGInt = ptLightingResult.fGInt;
            const fBInt = ptLightingResult.fBInt;
            
            const distFogInt = (getDepthFactor(dist) * 256) | 0;
            const texW = currentWallBuf.width; const texData = currentWallBuf.data;

            if (upperTile?.isWindow) {
                renderWindowSegment({
                    x,
                    pt,
                    currentWallBuf,
                    texX,
                    levelDrawStart,
                    levelDrawEnd,
                    drawStart,
                    drawEnd,
                    texStartShift,
                    lh,
                    rMultInt,
                    gMultInt,
                    bMultInt,
                    fRInt,
                    fGInt,
                    fBInt,
                    distFogInt,
                    screenBuffer,
                    width,
                    height,
                    horizon,
                    resolutionDivisor,
                    zBuffer,
                    cameraZ,
                    posX,
                    posY,
                    rayDirX,
                    rayDirY,
                    upperTile,
                    auxBuffers,
                    passThroughWallsCol: passThroughWalls
                });
                drawStart = drawEnd; // Skip default drawing below
            }

            if (drawStart < drawEnd && ((pt.layer !== undefined && pt.layer > 0) || dist <= zBuffer[x] + 0.05)) {
                const fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
                const fogR = (getFogColorR() * fogAmtInt) >> 8;
                const fogG = (getFogColorG() * fogAmtInt) >> 8;
                const fogB = (getFogColorB() * fogAmtInt) >> 8;

                const hasFlash = fRInt > 0 || fGInt > 0 || fBInt > 0 || fogAmtInt > 0;
                
                if (hasFlash) {
                    const h = currentWallBuf.height;
                    for (let y = drawStart; y < drawEnd; y++) {
                        let ty = (texPosFixed >> 16) % h;
                        if (ty < 0) ty += h;
                        texPosFixed += stepFixed;
                        
                        const color = texData[(ty * texW + texX) | 0];
                        let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
                        
                        // Integer Multiply
                        const totalRMult = rMultInt + fRInt;
                        const totalGMult = gMultInt + fGInt;
                        const totalBMult = bMultInt + fBInt;

                        r = (r * totalRMult) >> 8; 
                        g = (g * totalGMult) >> 8; 
                        b = (b * totalBMult) >> 8;
                        
                        r += (isWebGLActive ? 0 : (fRInt >> 2)) + fogR;
                        g += (isWebGLActive ? 0 : (fGInt >> 2)) + fogG;
                        b += (isWebGLActive ? 0 : (fBInt >> 2)) + fogB;

                        r = Math.min(255, r);
                        g = Math.min(255, g);
                        b = Math.min(255, b);

                        if (isHighlighted) {
                            r += highlightRAdd; if (r > 255) r = 255;
                            g = (g * highlightGBMult) | 0; b = (b * highlightGBMult) | 0;
                        }

                        const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                        screenBuffer[y * width + x] = finalColor;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                        }
                    }
                } else {
                    const h = currentWallBuf.height;
                    for (let y = drawStart; y < drawEnd; y++) {
                        let ty = (texPosFixed >> 16) % h;
                        if (ty < 0) ty += h;
                        texPosFixed += stepFixed;

                        const color = texData[(ty * texW + texX) | 0];
                        let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
                        
                        // Integer Multiply
                        r = (r * rMultInt) >> 8; 
                        g = (g * gMultInt) >> 8; 
                        b = (b * bMultInt) >> 8;

                        if (isHighlighted) {
                            r += highlightRAdd; if (r > 255) r = 255;
                            g = (g * highlightGBMult) | 0; b = (b * highlightGBMult) | 0;
                        }
                        
                        const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                        screenBuffer[y * width + x] = finalColor;
                        for (let d = 1; d < resolutionDivisor; d++) {
                            if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                        }
                    }
                }
            }
            
            // --- Bottom Cap Logic (Looking UP) ---
            let hasWallBelow = false;
            if (pt.layer > 0) {
                const underTopZ = getWallTopZ(pt.layer - 1, pt.mapX, pt.mapY, activeGrids);
                if (underTopZ !== null && underTopZ >= absBotZ - 0.001) {
                    hasWallBelow = true;
                }
            }

            const isFloorType = upperTile?.type === 'FLOOR' || pt.isFloorWall;

            if (!pt.isPitWall && levelDrawEnd < horizon && !hasWallBelow && !isFloorType) {
                const capStart = Math.max(0, drawEnd);
                const capEnd = Math.min(height, horizon);
                
                if (capStart < capEnd) {
                    let bottomBuf = debugTextures ? null : auxBuffers?.get('TEX_FALLBACK');
                    if (debugTextures && upperTile) {
                        const cellKey = pt.mapY * 10000 + pt.mapX;
                        if (customFloorBuffers && customFloorBuffers.has(cellKey * 10 + 5)) {
                            bottomBuf = customFloorBuffers.get(cellKey * 10 + 5)!;
                        } else {
                            const capTex = upperTile.bottomTextureId || upperTile.assetId || upperTile.textureId;
                            if (capTex && auxBuffers?.has(capTex)) {
                                bottomBuf = auxBuffers.get(capTex);
                            }
                        }
                    }
                    
                    if (bottomBuf) {
                        const capW = bottomBuf.width;
                        const capH = bottomBuf.height;
                        const capData = bottomBuf.data;
                        
                        const capLayer = Math.max(0, pt.layer - 1);
                        const capLightMap = (floorLightMaps && floorLightMaps[capLayer]) ? floorLightMaps[capLayer] : lightMap;
                        const cellLight = capLightMap ? (capLightMap[pt.mapY]?.[pt.mapX] || { r: 1.0, g: 1.0, b: 1.0 }) : { r: 1.0, g: 1.0, b: 1.0 };
                        const cellLightR = cellLight.r;
                        const cellLightG = cellLight.g;
                        const cellLightB = cellLight.b;

                        const tileCenterX = pt.mapX + 0.5;
                        const tileCenterY = pt.mapY + 0.5;

                        let mInt = 0;
                        if (muzzleFlashIntensity > 0) {
                            const dx = posX - tileCenterX;
                            const dy = posY - tileCenterY;
                            const distSq = dx*dx + dy*dy;
                            if (distSq < 100) {
                                mInt = muzzleFlashIntensity / (distSq * 0.5 + 1.0);
                            }
                        }

                        let enemyFlashR = 0, enemyFlashG = 0, enemyFlashB = 0;
                        if (activeFlashes && activeFlashes.length > 0) {
                            for (let k = 0; k < activeFlashes.length; k++) {
                                const f = activeFlashes[k] as any;
                                const dx = f.x - tileCenterX;
                                const dy = f.y - tileCenterY;
                                const distSq = dx*dx + dy*dy;
                                if (distSq < 100) {
                                    const fInt = f.intensity / (distSq * 0.5 + 1.0);
                                    if (f.isFlashbang) {
                                        enemyFlashR += fInt * 2.0; enemyFlashG += fInt * 2.0; enemyFlashB += fInt * 2.0;
                                    } else {
                                        enemyFlashR += fInt * muzzleR;
                                        enemyFlashG += fInt * muzzleG;
                                        enemyFlashB += fInt * muzzleB;
                                    }
                                }
                            }
                        }

                        const lightningMult = getLightningMultAt(tileCenterX, tileCenterY, lightningMap, outdoorMap, mapWidth, mapHeight);
                        const effectiveLightningIntensity = lightningIntensity * lightningMult;

                        const fR = (effectiveLightningIntensity * lightningR) + (mInt * muzzleR) + enemyFlashR;
                        const fG = (effectiveLightningIntensity * lightningG) + (mInt * muzzleG) + enemyFlashG;
                        const fB = (effectiveLightningIntensity * lightningB) + (mInt * muzzleB) + enemyFlashB;

                        const pFlashR = (fR * 255) | 0;
                        const pFlashG = (fG * 255) | 0;
                        const pFlashB = (fB * 255) | 0;

                        let currLightR = cellLightR, currLightG = cellLightG, currLightB = cellLightB;
                        let stepLightR = 0, stepLightG = 0, stepLightB = 0;
                        let stepsLeft = 0;

                        const constB = (absBotZ - cameraZ) * height;

                        const minValidY = Math.ceil(horizon - constB / 0.1);
                        const maxValidY = Math.floor(horizon - constB / pt.exitDist);
                        let capStart_clamped = Math.max(capStart, minValidY);
                        let capEnd_clamped = Math.min(capEnd, maxValidY + 1);

                        const zBufVal = zBuffer[x];
                        const thresholdY = horizon - constB / zBufVal;
                        const yTop_solid = horizon - (1.0 - (cameraZ || 0.5)) * height / zBufVal;
                        const occlusionLimit = Math.max(thresholdY, yTop_solid);
                        if (occlusionLimit < capEnd_clamped) {
                            capEnd_clamped = Math.min(capEnd_clamped, Math.ceil(occlusionLimit));
                        }

                        if (capStart_clamped < capEnd_clamped) {
                            let currFogInt = 256;
                            let stepFogInt = 0;

                            for (let y = capStart_clamped; y < capEnd_clamped; y++) {
                                 const dy = horizon - y;
                                 const distToP = constB / (dy > 0.0001 ? dy : 0.0001);

                                 if (stepsLeft === 0) {
                                    const currentFloorX = posX + distToP * rayDirX;
                                    const currentFloorY = posY + distToP * rayDirY;
                                    const interpL = getInterpolatedL(currentFloorX, currentFloorY, capLightMap, capLayer);
                                    currLightR = interpL.r;
                                    currLightG = interpL.g;
                                    currLightB = interpL.b;

                                    let fogStartVal = 256;
                                    if (isFog) {
                                        if (distToP <= 0) fogStartVal = 256;
                                        else if (distToP >= maxRenderDistance) fogStartVal = 0;
                                        else {
                                            const t = distToP * invRenderDistance;
                                            fogStartVal = ((1.0 - (t * t * (3 - 2 * t))) * 256) | 0;
                                        }
                                    } else {
                                        if (distToP <= fogStart) fogStartVal = 256;
                                        else {
                                            const t = (distToP - fogStart) * invFogRange;
                                            if (t >= 1.0) fogStartVal = minBrightnessInt;
                                            else {
                                                const factor = 1.0 - (t * t * (3 - 2 * t));
                                                const finalFactor = factor > minBrightness ? factor : minBrightness;
                                                fogStartVal = (finalFactor * 256) | 0;
                                            }
                                        }
                                    }
                                    currFogInt = fogStartVal;

                                    let nextY = y + 4;
                                    if (nextY >= capEnd_clamped) nextY = capEnd_clamped - 1;
                                    const actualSteps = nextY - y;
                                    if (actualSteps > 0) {
                                        const nextDy = horizon - nextY;
                                        const nextDistToP = constB / (nextDy > 0.0001 ? nextDy : 0.0001);
                                        const nextFloorX = posX + nextDistToP * rayDirX;
                                        const nextFloorY = posY + nextDistToP * rayDirY;
                                        const nextInterpL = getInterpolatedL(nextFloorX, nextFloorY, capLightMap, capLayer);
                                        stepLightR = (nextInterpL.r - currLightR) / actualSteps;
                                        stepLightG = (nextInterpL.g - currLightG) / actualSteps;
                                        stepLightB = (nextInterpL.b - currLightB) / actualSteps;

                                        let fogNextVal = 256;
                                        if (isFog) {
                                            if (nextDistToP <= 0) fogNextVal = 256;
                                            else if (nextDistToP >= maxRenderDistance) fogNextVal = 0;
                                            else {
                                                const t = nextDistToP * invRenderDistance;
                                                fogNextVal = ((1.0 - (t * t * (3 - 2 * t))) * 256) | 0;
                                            }
                                        } else {
                                            if (nextDistToP <= fogStart) fogNextVal = 256;
                                            else {
                                                const t = (nextDistToP - fogStart) * invFogRange;
                                                if (t >= 1.0) fogNextVal = minBrightnessInt;
                                                else {
                                                    const factor = 1.0 - (t * t * (3 - 2 * t));
                                                    const finalFactor = factor > minBrightness ? factor : minBrightness;
                                                    fogNextVal = (finalFactor * 256) | 0;
                                                }
                                            }
                                        }
                                        stepFogInt = (fogNextVal - fogStartVal) / actualSteps;
                                    } else {
                                        stepLightR = 0; stepLightG = 0; stepLightB = 0;
                                        stepFogInt = 0;
                                    }
                                    stepsLeft = actualSteps;
                                }

                                 const lightR = currLightR;
                                const lightG = currLightG;
                                const lightB = currLightB;
                                const distFogInt = currFogInt | 0;

                                currLightR += stepLightR;
                                currLightG += stepLightG;
                                currLightB += stepLightB;
                                currFogInt += stepFogInt;
                                stepsLeft--;

                                if (isPixelOccluded(y)) continue;

                                const weight = distToP;
                                const currentFloorX = posX + weight * rayDirX;
                                const currentFloorY = posY + weight * rayDirY;

                                const valX = -currentFloorX * capW;
                                const tx = (valX | 0) - (valX < (valX | 0) ? 1 : 0);
                                const ty = (currentFloorY * capH) | 0;

                                let ftx = tx % capW; if (ftx < 0) ftx += capW;
                                let fty = ty % capH; if (fty < 0) fty += capH;
                                
                                const color = capData[fty * capW + ftx];
                                const r = color & 0xFF; 
                                const g = (color >> 8) & 0xFF; 
                                const b = (color >> 16) & 0xFF;

                                const effR = (lightR * distFogInt) | 0;
                                const effG = (lightG * distFogInt) | 0;
                                const effB = (lightB * distFogInt) | 0;

                                let rFinal = (r * effR * 153) >> 16;
                                let gFinal = (g * effG * 153) >> 16;
                                let bFinal = (b * effB * 153) >> 16;

                                rFinal += pFlashR;
                                gFinal += pFlashG;
                                bFinal += pFlashB;

                                if (isFog) {
                                    const fogAmt = 256 - distFogInt;
                                    rFinal += (fogColorR * fogAmt) >> 8;
                                    gFinal += (fogColorG * fogAmt) >> 8;
                                    bFinal += (fogColorB * fogAmt) >> 8;
                                }

                                if (rFinal > 255) rFinal = 255;
                                if (gFinal > 255) gFinal = 255;
                                if (bFinal > 255) bFinal = 255;

                                const finalColor = (255 << 24) | (bFinal << 16) | (gFinal << 8) | rFinal;
                                const screenIdx = y * width + x;
                                screenBuffer[screenIdx] = finalColor;
                                if (resolutionDivisor > 1) {
                                    for (let d = 1; d < resolutionDivisor; d++) {
                                        if (x + d < width) screenBuffer[screenIdx + d] = finalColor;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // --- Top Cap Logic (Looking DOWN) ---
            let hasWallAbove = false;
            if (pt.layer < activeGrids.length - 1) {
                const aboveBotZ = getWallBotZ(pt.layer + 1, pt.mapX, pt.mapY, activeGrids);
                if (aboveBotZ !== null && aboveBotZ <= absTopZ + 0.001) {
                    hasWallAbove = true;
                }
            }

            if (!pt.isPitWall && levelDrawStart > horizon && drawStart > horizon && !hasWallAbove) {
                const capStart = Math.max(Math.floor(horizon) + 1, 0);
                const capEnd = Math.min(height, drawStart);
                
                if (capStart < capEnd) {
                    let activeShadowCount = 0;
                    if (globalSpriteShadows && globalSpriteShadows.length > 0) {
                        const dist1 = ((cameraZ - absTopZ) * height) / (capStart - horizon);
                        const dist2 = ((cameraZ - absTopZ) * height) / (capEnd - horizon);
                        const tMin = dist2 < dist1 ? dist2 : dist1;
                        const tMax = dist2 > dist1 ? dist2 : dist1;
                        const rayDirSq = rayDirX * rayDirX + rayDirY * rayDirY;
                        
                        const shadowLen = globalSpriteShadows.length;
                        for (let i = 0; i < shadowLen; i++) {
                            const s = globalSpriteShadows[i];
                            const dx = s.x - posX;
                            const dy = s.y - posY;
                            const t = (dx * rayDirX + dy * rayDirY) / rayDirSq;
                            
                            const rx = s.rx;
                            if (t < tMin - rx || t > tMax + rx) {
                                continue;
                            }
                            
                            const closestX = posX + t * rayDirX;
                            const closestY = posY + t * rayDirY;
                            const perpDistSq = (s.x - closestX) * (s.x - closestX) + (s.y - closestY) * (s.y - closestY);
                            if (perpDistSq > rx * rx) {
                                continue;
                            }
                            
                            const slot = reusableCapShadows[activeShadowCount];
                            slot.x = s.x;
                            slot.y = s.y;
                            slot.rx = rx;
                            slot.ry = s.ry !== undefined ? s.ry : rx;
                            slot.invRx2 = s.invRx2 !== undefined ? s.invRx2 : 1.0 / (rx * rx);
                            slot.invRy2 = s.invRy2 !== undefined ? s.invRy2 : 1.0 / (s.ry * s.ry);
                            activeShadowCount++;
                            if (activeShadowCount >= 4) {
                                break;
                            }
                        }
                    }

                    let topBuf = debugTextures ? null : auxBuffers?.get('TEX_FALLBACK');
                    if (debugTextures && upperTile) {
                        const cellKey = pt.mapY * 10000 + pt.mapX;
                        if (customFloorBuffers && customFloorBuffers.has(cellKey * 10 + 4)) {
                            topBuf = customFloorBuffers.get(cellKey * 10 + 4)!;
                        } else {
                            const capTex = upperTile.topTextureId || upperTile.textureId || upperTile.bottomTextureId || upperTile.assetId;
                            if (capTex && auxBuffers?.has(capTex)) {
                                topBuf = auxBuffers.get(capTex);
                            }
                        }
                    }
                    
                    if (topBuf) {
                        const timeSec = Date.now() / 1000;
                        const waterOffset1 = timeSec * 2;
                        const waterOffset2 = timeSec * 1.5;
                        const capW = topBuf.width;
                        const capH = topBuf.height;
                        const capData = topBuf.data;
                        
                        const isUpperFloorCap = (pt.topZ !== undefined ? pt.topZ : 1.0) >= 1.0;
                        const topLayer = (floorLightMaps && isUpperFloorCap && pt.layer + 1 < floorLightMaps.length) ? pt.layer + 1 : pt.layer;
                        const topLightMap = (floorLightMaps && floorLightMaps[topLayer]) ? floorLightMaps[topLayer] : lightMap;
                        const cellLight = topLightMap ? (topLightMap[pt.mapY]?.[pt.mapX] || { r: 1.0, g: 1.0, b: 1.0 }) : { r: 1.0, g: 1.0, b: 1.0 };
                        const cellLightR = cellLight.r;
                        const cellLightG = cellLight.g;
                        const cellLightB = cellLight.b;

                        const tileCenterX = pt.mapX + 0.5;
                        const tileCenterY = pt.mapY + 0.5;

                        let mInt = 0;
                        if (muzzleFlashIntensity > 0) {
                            const dx = posX - tileCenterX;
                            const dy = posY - tileCenterY;
                            const distSq = dx*dx + dy*dy;
                            if (distSq < 100) {
                                mInt = muzzleFlashIntensity / (distSq * 0.5 + 1.0);
                            }
                        }

                        let enemyFlashR = 0, enemyFlashG = 0, enemyFlashB = 0;
                        if (activeFlashes && activeFlashes.length > 0) {
                            for (let k = 0; k < activeFlashes.length; k++) {
                                const f = activeFlashes[k] as any;
                                const dx = f.x - tileCenterX;
                                const dy = f.y - tileCenterY;
                                const distSq = dx*dx + dy*dy;
                                if (distSq < 100) {
                                    const fInt = f.intensity / (distSq * 0.5 + 1.0);
                                    if (f.isFlashbang) {
                                        enemyFlashR += fInt * 2.0; enemyFlashG += fInt * 2.0; enemyFlashB += fInt * 2.0;
                                    } else {
                                        enemyFlashR += fInt * muzzleR;
                                        enemyFlashG += fInt * muzzleG;
                                        enemyFlashB += fInt * muzzleB;
                                    }
                                }
                            }
                        }

                        const lightningMult = getLightningMultAt(tileCenterX, tileCenterY, lightningMap, outdoorMap, mapWidth, mapHeight);
                        const effectiveLightningIntensity = lightningIntensity * lightningMult;

                        const fR = (effectiveLightningIntensity * lightningR) + (mInt * muzzleR) + enemyFlashR;
                        const fG = (effectiveLightningIntensity * lightningG) + (mInt * muzzleG) + enemyFlashG;
                        const fB = (effectiveLightningIntensity * lightningB) + (mInt * muzzleB) + enemyFlashB;

                        const pFlashR = (fR * 255) | 0;
                        const pFlashG = (fG * 255) | 0;
                        const pFlashB = (fB * 255) | 0;

                        const isFog = isFogWeather();
                        const fogColorR = getFogColorR();
                        const fogColorG = getFogColorG();
                        const fogColorB = getFogColorB();

                        const rot = (upperTile?.topTextureRotation || 0) % 360;

                        let currLightR = cellLightR, currLightG = cellLightG, currLightB = cellLightB;
                        let stepLightR = 0, stepLightG = 0, stepLightB = 0;
                        let stepsLeft = 0;

                        const constT = (cameraZ - absTopZ) * height;

                        const minValidY = Math.ceil(horizon + constT / pt.exitDist);
                        const maxValidY = Math.floor(horizon + constT / 0.1);
                        let capStart_clamped = Math.max(capStart, minValidY);
                        let capEnd_clamped = Math.min(capEnd, maxValidY + 1);

                        const zBufVal = zBuffer[x];
                        const thresholdY = horizon + constT / zBufVal;
                        const yBottom_solid = horizon + (cameraZ || 0.5) * height / zBufVal;
                        const occlusionLimit = Math.min(thresholdY, yBottom_solid);
                        capStart_clamped = Math.max(capStart_clamped, Math.floor(occlusionLimit) + 1);

                        if (capStart_clamped < capEnd_clamped) {
                            const isWater = !!upperTile?.isWater;
                            let currFogInt = 256;
                            let stepFogInt = 0;

                            for (let y = capStart_clamped; y < capEnd_clamped; y++) {
                                 const dy = y - horizon;
                                 const distToP = constT / (dy > 0.0001 ? dy : 0.0001);

                                 if (stepsLeft === 0) {
                                    const currentFloorX = posX + distToP * rayDirX;
                                    const currentFloorY = posY + distToP * rayDirY;
                                    const interpL = getInterpolatedL(currentFloorX, currentFloorY, topLightMap, topLayer);
                                    currLightR = interpL.r;
                                    currLightG = interpL.g;
                                    currLightB = interpL.b;

                                    let fogStartVal = 256;
                                    if (isFog) {
                                        if (distToP <= 0) fogStartVal = 256;
                                        else if (distToP >= maxRenderDistance) fogStartVal = 0;
                                        else {
                                            const t = distToP * invRenderDistance;
                                            fogStartVal = ((1.0 - (t * t * (3 - 2 * t))) * 256) | 0;
                                        }
                                    } else {
                                        if (distToP <= fogStart) fogStartVal = 256;
                                        else {
                                            const t = (distToP - fogStart) * invFogRange;
                                            if (t >= 1.0) fogStartVal = minBrightnessInt;
                                            else {
                                                const factor = 1.0 - (t * t * (3 - 2 * t));
                                                const finalFactor = factor > minBrightness ? factor : minBrightness;
                                                fogStartVal = (finalFactor * 256) | 0;
                                            }
                                        }
                                    }
                                    currFogInt = fogStartVal;

                                    let nextY = y + 4;
                                    if (nextY >= capEnd_clamped) nextY = capEnd_clamped - 1;
                                    const actualSteps = nextY - y;
                                    if (actualSteps > 0) {
                                        const nextDy = nextY - horizon;
                                        const nextDistToP = constT / (nextDy > 0.0001 ? nextDy : 0.0001);
                                        const nextFloorX = posX + nextDistToP * rayDirX;
                                        const nextFloorY = posY + nextDistToP * rayDirY;
                                        const nextInterpL = getInterpolatedL(nextFloorX, nextFloorY, topLightMap, topLayer);
                                        stepLightR = (nextInterpL.r - currLightR) / actualSteps;
                                        stepLightG = (nextInterpL.g - currLightG) / actualSteps;
                                        stepLightB = (nextInterpL.b - currLightB) / actualSteps;

                                        let fogNextVal = 256;
                                        if (isFog) {
                                            if (nextDistToP <= 0) fogNextVal = 256;
                                            else if (nextDistToP >= maxRenderDistance) fogNextVal = 0;
                                            else {
                                                const t = nextDistToP * invRenderDistance;
                                                fogNextVal = ((1.0 - (t * t * (3 - 2 * t))) * 256) | 0;
                                            }
                                        } else {
                                            if (nextDistToP <= fogStart) fogNextVal = 256;
                                            else {
                                                const t = (nextDistToP - fogStart) * invFogRange;
                                                if (t >= 1.0) fogNextVal = minBrightnessInt;
                                                else {
                                                    const factor = 1.0 - (t * t * (3 - 2 * t));
                                                    const finalFactor = factor > minBrightness ? factor : minBrightness;
                                                    fogNextVal = (finalFactor * 256) | 0;
                                                }
                                            }
                                        }
                                        stepFogInt = (fogNextVal - fogStartVal) / actualSteps;
                                    } else {
                                        stepLightR = 0; stepLightG = 0; stepLightB = 0;
                                        stepFogInt = 0;
                                    }
                                    stepsLeft = actualSteps;
                                }

                                 const lightR = currLightR;
                                const lightG = currLightG;
                                const lightB = currLightB;
                                const distFogInt = currFogInt | 0;

                                currLightR += stepLightR;
                                currLightG += stepLightG;
                                currLightB += stepLightB;
                                currFogInt += stepFogInt;
                                stepsLeft--;

                                if (isPixelOccluded(y)) continue;

                                const weight = distToP;
                                let texXCoord = posX + weight * rayDirX;
                                let texYCoord = posY + weight * rayDirY;

                                if (isWater) {
                                    texXCoord += fastSin(texXCoord * 10 + waterOffset1) * 0.05 + fastCos(texYCoord * 10 + waterOffset2) * 0.05;
                                    texYCoord += fastSin(texYCoord * 10 + waterOffset2) * 0.05 + fastCos(texXCoord * 10 + waterOffset1) * 0.05;
                                    if (texXCoord < 0) texXCoord = -texXCoord;
                                    if (texYCoord < 0) texYCoord = -texYCoord;
                                }

                                let ftx = 0, fty = 0;
                                if (rot === 0) {
                                    let tx = ((texXCoord * capW) | 0) % capW; if (tx < 0) tx += capW;
                                    let ty = ((texYCoord * capH) | 0) % capH; if (ty < 0) ty += capH;
                                    ftx = tx; fty = ty;
                                } else {
                                    const u = texXCoord - (texXCoord | 0);
                                    const v = texYCoord - (texYCoord | 0);
                                    if (rot === 90) {
                                        ftx = (capW - 1 - ((v * capW) | 0)) % capW; if (ftx < 0) ftx += capW;
                                        fty = ((u * capH) | 0) % capH; if (fty < 0) fty += capH;
                                    } else if (rot === 180) {
                                        ftx = (capW - 1 - ((u * capW) | 0)) % capW; if (ftx < 0) ftx += capW;
                                        fty = (capH - 1 - ((v * capH) | 0)) % capH; if (fty < 0) fty += capH;
                                    } else { // 270
                                        ftx = ((v * capW) | 0) % capW; if (ftx < 0) ftx += capW;
                                        fty = (capH - 1 - ((u * capH) | 0)) % capH; if (fty < 0) fty += capH;
                                    }
                                }
                                
                                const color = capData[fty * capW + ftx];
                                const r = color & 0xFF; 
                                const g = (color >> 8) & 0xFF; 
                                const b = (color >> 16) & 0xFF;

                                const effR = (lightR * distFogInt) | 0;
                                const effG = (lightG * distFogInt) | 0;
                                const effB = (lightB * distFogInt) | 0;

                                let rFinal = (r * effR) >> 8;
                                let gFinal = (g * effG) >> 8;
                                let bFinal = (b * effB) >> 8;

                                rFinal += pFlashR;
                                gFinal += pFlashG;
                                bFinal += pFlashB;

                                if (isFog) {
                                    const fogAmt = 256 - distFogInt;
                                    rFinal += (fogColorR * fogAmt) >> 8;
                                    gFinal += (fogColorG * fogAmt) >> 8;
                                    bFinal += (fogColorB * fogAmt) >> 8;
                                }

                                let isPointHighlighted = false;
                                if (reusableHighlightSet) {
                                    const sampleCellX = Math.floor(posX + distToP * rayDirX);
                                    const sampleCellY = Math.floor(posY + distToP * rayDirY);
                                    isPointHighlighted = reusableHighlightSet.has(sampleCellY * 10000 + sampleCellX);
                                }

                                if (isPointHighlighted) {
                                    rFinal += highlightRAdd; if (rFinal > 255) rFinal = 255;
                                    gFinal = (gFinal * highlightGBMult) | 0;
                                    bFinal = (bFinal * highlightGBMult) | 0;
                                }

                                if (activeShadowCount > 0) {
                                    let maxShadowIntensity = 0.0;
                                    const currentFloorX = posX + weight * rayDirX;
                                    const currentFloorY = posY + weight * rayDirY;
                                    for (let i = 0; i < activeShadowCount; i++) {
                                        const s = reusableCapShadows[i];
                                        const dx = currentFloorX - s.x;
                                        const rx = s.rx;
                                        if (dx >= rx || dx <= -rx) continue;
                                        const dy = currentFloorY - s.y;
                                        const ry = s.ry;
                                        if (dy >= ry || dy <= -ry) continue;

                                        const d2 = (dx * dx) * s.invRx2 + (dy * dy) * s.invRy2;
                                        if (d2 < 1.0) {
                                            const intensity = 1.0 - d2;
                                            if (intensity > maxShadowIntensity) {
                                                maxShadowIntensity = intensity;
                                            }
                                        }
                                    }
                                    if (maxShadowIntensity > 0.0) {
                                        if (globalMagentaShadowsEnabled) {
                                            rFinal = (rFinal * (1.0 - maxShadowIntensity * 0.9) + 255 * maxShadowIntensity * 0.9) | 0;
                                            gFinal = (gFinal * (1.0 - maxShadowIntensity * 0.9)) | 0;
                                            bFinal = (bFinal * (1.0 - maxShadowIntensity * 0.9) + 255 * maxShadowIntensity * 0.9) | 0;
                                        } else {
                                            const shadowFactor = 1.0 - maxShadowIntensity * 0.65;
                                            rFinal = (rFinal * shadowFactor) | 0;
                                            gFinal = (gFinal * shadowFactor) | 0;
                                            bFinal = (bFinal * shadowFactor) | 0;
                                        }
                                    }
                                }

                                if (rFinal > 255) rFinal = 255;
                                if (gFinal > 255) gFinal = 255;
                                if (bFinal > 255) bFinal = 255;

                                const finalColor = (255 << 24) | (bFinal << 16) | (gFinal << 8) | rFinal;
                                screenBuffer[y * width + x] = finalColor;
                                for (let d = 1; d < resolutionDivisor; d++) {
                                    if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export const renderPassthroughDoors = (
    x: number,
    passThroughDoors: PassThroughDoor[],
    passThroughWalls: PassThroughWall[],
    doorBuffer: RaycasterBuffer | null,
    debugTextures: boolean,
    zBuffer: Float32Array,
    height: number,
    horizon: number,
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    customWallBuffers: Map<number, RaycasterBuffer> | undefined,
    lightMap: { r: number; g: number; b: number }[][] | undefined,
    outdoorMap: boolean[][] | undefined,
    lightningMap: Float32Array | null | undefined,
    mapWidth: number,
    mapHeight: number,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    activeFlashes: {x: number, y: number, intensity: number}[] | undefined,
    muzzleR: number, muzzleG: number, muzzleB: number,
    lightningR: number, lightningG: number, lightningB: number,
    posX: number,
    posY: number,
    screenBuffer: Uint32Array,
    width: number,
    cameraZ: number,
    resolutionDivisor: number = 1,
    activeGrids?: any[][][],
    grid?: any[][]
) => {
    if (!passThroughDoors || passThroughDoors.length === 0) {
        return;
    }

    // Precalculate foreground window bounds for occlusion checking
    const windowWalls: {
        dist: number;
        exitDist: number;
        isCutoutColumn: boolean;
        screenCutoutTop: number;
        screenCutoutBot: number;
        absHeadZ: number;
        absSillZ: number;
        headConst: number;
        sillConst: number;
        glassDist: number;
        glassTransparency: number;
        levelDrawStart: number;
        levelDrawEnd: number;
    }[] = [];

    if (passThroughWalls && passThroughWalls.length > 0) {
        for (let j = 0; j < passThroughWalls.length; j++) {
            const wall = passThroughWalls[j];
            if (wall.isWindow) {
                const lh = height / wall.dist;
                const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
                const botZ = wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
                const absTopZ = wall.layer + topZ;
                const absBotZ = wall.layer + botZ;
                const levelDrawStart = wall.wallTop !== undefined ? wall.wallTop : Math.floor(horizon + lh * (cameraZ - absTopZ));
                const levelDrawEnd = wall.wallBottom !== undefined ? wall.wallBottom : Math.ceil(horizon + lh * (cameraZ - absBotZ));

                const cTop = wall.cutoutTop !== undefined ? wall.cutoutTop : 0.25;
                const cBot = wall.cutoutBottom !== undefined ? wall.cutoutBottom : 0.75;

                const screenCutoutTop = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cTop);
                const screenCutoutBot = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cBot);

                const absHeadZ = absTopZ - cTop * (topZ - botZ);
                const absSillZ = absTopZ - cBot * (topZ - botZ);

                windowWalls.push({
                    dist: wall.dist,
                    exitDist: wall.exitDist,
                    isCutoutColumn: wall.isCutoutColumn !== false, // default to true if undefined
                    screenCutoutTop,
                    screenCutoutBot,
                    absHeadZ,
                    absSillZ,
                    headConst: (absHeadZ - cameraZ) * height,
                    sillConst: (cameraZ - absSillZ) * height,
                    glassDist: wall.glassDist ?? wall.dist,
                    glassTransparency: wall.glassTransparency !== undefined ? wall.glassTransparency : 0.0,
                    levelDrawStart,
                    levelDrawEnd
                });
            }
        }
    }

    const solidOccluders: {
        dist: number;
        drawStart: number;
        drawEnd: number;
    }[] = [];

    if (passThroughWalls && passThroughWalls.length > 0) {
        for (let j = 0; j < passThroughWalls.length; j++) {
            const wall = passThroughWalls[j];
            if (!wall.isWindow) {
                const lh = height / wall.dist;
                const topZ = wall.topZ !== undefined ? wall.topZ : 1.0;
                const botZ = wall.bottomZ !== undefined ? wall.bottomZ : 0.0;
                const absTopZ = wall.layer + topZ;
                const absBotZ = wall.layer + botZ;
                const levelDrawStart = wall.wallTop !== undefined ? wall.wallTop : Math.floor(horizon + lh * (cameraZ - absTopZ));
                const levelDrawEnd = wall.wallBottom !== undefined ? wall.wallBottom : Math.ceil(horizon + lh * (cameraZ - absBotZ));

                const drawStart = Math.max(0, levelDrawStart);
                let drawEnd = Math.min(height, levelDrawEnd);
                if (wall.clipBottom !== undefined) {
                    drawEnd = Math.min(drawEnd, wall.clipBottom);
                }

                if (drawStart < drawEnd) {
                    solidOccluders.push({
                        dist: wall.dist,
                        drawStart,
                        drawEnd
                    });
                }
            }
        }
    }

    if (passThroughDoors.length > 0) {
        for (let i = passThroughDoors.length - 1; i >= 0; i--) {
            const d = passThroughDoors[i];
            const dist = d.perpWallDist;
            
            if (dist < zBuffer[x]) {
                const lh = height / dist;
                const ds = Math.floor(horizon - lh * (1 - cameraZ)); const de = Math.ceil(horizon + lh * cameraZ);
                let liftOffset = 0; if (d.type === 'LIFT') liftOffset = Math.floor(lh * d.openAmount);
                let clippedDrawEnd = de - liftOffset;
                if (d.clipBottom !== undefined) {
                    clippedDrawEnd = Math.min(clippedDrawEnd, d.clipBottom);
                }
                
                let currentDoorBuf = debugTextures ? doorBuffer : auxBuffers?.get('TEX_FALLBACK');
                if (!currentDoorBuf && debugTextures) currentDoorBuf = doorBuffer;
                if (!currentDoorBuf) {
                    const solidColor = (d.side === 1) ? 0xFF303030 : 0xFF404040;
                    const drawStart = Math.max(0, ds);
                    const drawEnd = Math.min(height, clippedDrawEnd);
                    if (drawStart < drawEnd) {
                        for (let y = drawStart; y < drawEnd; y++) {
                            // Check window occlusion for solid color door rendering
                            let isPixelOccludedByWindow = false;
                            for (let j = 0; j < windowWalls.length; j++) {
                                const w = windowWalls[j];
                                if (w.dist < dist) {
                                    if (y >= w.levelDrawStart && y < w.levelDrawEnd) {
                                        if (!w.isCutoutColumn) {
                                            isPixelOccludedByWindow = true;
                                            break;
                                        } else {
                                            if (y < w.screenCutoutTop || y >= w.screenCutoutBot) {
                                                isPixelOccludedByWindow = true;
                                                break;
                                            } else {
                                                let distToP = Infinity;
                                                if (cameraZ < w.absHeadZ && y < horizon) {
                                                    const dDist = w.headConst / (horizon - y);
                                                    if (dDist >= w.dist && dDist <= w.exitDist && dDist < distToP) distToP = dDist;
                                                }
                                                if (cameraZ > w.absSillZ && y > horizon) {
                                                    const dDist = w.sillConst / (y - horizon);
                                                    if (dDist >= w.dist && dDist <= w.exitDist && dDist < distToP) distToP = dDist;
                                                }
                                                if (distToP !== Infinity && dist > distToP) {
                                                    isPixelOccludedByWindow = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if (isPixelOccludedByWindow) {
                                continue;
                            }

                            let isPixelOccludedBySolid = false;
                            for (let j = 0; j < solidOccluders.length; j++) {
                                const s = solidOccluders[j];
                                if (s.dist < dist && y >= s.drawStart && y < s.drawEnd) {
                                    isPixelOccludedBySolid = true;
                                    break;
                                }
                            }
                            if (isPixelOccludedBySolid) {
                                continue;
                            }

                            screenBuffer[y * width + x] = solidColor;
                            for (let d = 1; d < resolutionDivisor; d++) {
                                if (x + d < width) screenBuffer[y * width + (x + d)] = solidColor;
                            }
                        }
                    }
                    if (!d.maskId && (d.type !== 'LIFT' || d.openAmount === 0)) {
                        zBuffer[x] = dist; 
                    }
                    continue;
                }

                let wallX; if (d.side === 0) wallX = d.posY + dist * d.rayDirY; else wallX = d.posX + dist * d.rayDirX;
                wallX -= Math.floor(wallX);
                
                if (debugTextures && d.textureId && auxBuffers?.has(d.textureId)) currentDoorBuf = auxBuffers.get(d.textureId)!;

                if (debugTextures && customWallBuffers) {
                    // For doors, we check all possible faces of the tile to show decals from both sides
                    const baseKey = (d.tileY * 10000 + d.tileX) * 10;
                    let foundBuf = null;
                    for (let f = 0; f < 4; f++) {
                        if (customWallBuffers.has(baseKey + f)) {
                            foundBuf = customWallBuffers.get(baseKey + f)!;
                            break;
                        }
                    }
                    
                    if (foundBuf) {
                        currentDoorBuf = foundBuf;
                    }
                }

                const texW = currentDoorBuf.width; const texData = currentDoorBuf.data;
                let texX = 0;

                if (d.type !== 'LIFT') {
                    if (d.isFrame) { const frameTexW = Math.floor(texW * 0.15); texX = Math.floor((d.doorOffset || 0) * frameTexW); if (texX >= frameTexW) texX = frameTexW - 1; if (texX < 0) texX = 0; } 
                    else if (d.isDoorEdge) { const frameWidth = Math.floor(texW * 0.2); texX = Math.floor((d.doorOffset || 0) * frameWidth); if (texX >= frameWidth) texX = frameWidth - 1; if (texX < 0) texX = 0; } 
                    else { 
                        texX = Math.floor((d.doorOffset || 0) * texW); 
                        if (texX >= texW) texX = texW - 1;
                        if (texX < 0) texX = 0;
                        if (d.isTextureFlipped) texX = texW - texX - 1; 
                    }
                } else { 
                    texX = Math.floor(wallX * texW); 
                    if (texX >= texW) texX = texW - 1;
                    if (texX < 0) texX = 0;
                }

                let lightX = d.tileX, lightY = d.tileY;
                // DO NOT step back for open doors - use local light!
                let rMultInt = 256, gMultInt = 256, bMultInt = 256;
                
                const currentGrid = grid || (activeGrids ? activeGrids[0] : undefined);
                const adj = adjustLightForClosedDoors(lightX, lightY, d.rayDirX, d.rayDirY, currentGrid, activeGrids);
                lightX = adj.x;
                lightY = adj.y;

                if (lightMap && lightY >= 0 && lightY < mapHeight && lightX >= 0 && lightX < mapWidth) { 
                    const l = lightMap[lightY][lightX]; 
                    rMultInt = (l.r * 256) | 0; 
                    gMultInt = (l.g * 256) | 0; 
                    bMultInt = (l.b * 256) | 0; 
                }
                if (d.side === 1) { rMultInt = (rMultInt * 179) >> 8; gMultInt = (gMultInt * 179) >> 8; bMultInt = (bMultInt * 179) >> 8; } // 0.7
                if (d.isDoorEdge) { rMultInt = (rMultInt * 128) >> 8; gMultInt = (gMultInt * 128) >> 8; bMultInt = (bMultInt * 128) >> 8; } // 0.5
                if (d.isFrame) { rMultInt = (rMultInt * 204) >> 8; gMultInt = (gMultInt * 204) >> 8; bMultInt = (bMultInt * 204) >> 8; } // 0.8
                
                const distFogInt = (getDepthFactor(dist) * 256) | 0;
                rMultInt = (rMultInt * distFogInt) >> 8; 
                gMultInt = (gMultInt * distFogInt) >> 8; 
                bMultInt = (bMultInt * distFogInt) >> 8;

                let fRInt = 0, fGInt = 0, fBInt = 0;
                const hitX = posX + dist * d.rayDirX;
                const hitY = posY + dist * d.rayDirY;
                const mapX = Math.floor(hitX);
                const mapY = Math.floor(hitY);
                const isOutdoor = outdoorMap ? (mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth ? outdoorMap[mapY][mapX] : false) : true;
                const lightningMult = lightningMap && mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth ? lightningMap[mapY * mapWidth + mapX] : (isOutdoor ? 1.0 : 0.0);
                const effectiveLightningIntensity = lightningIntensity * lightningMult;

                if (effectiveLightningIntensity > 0 || muzzleFlashIntensity > 0 || (activeFlashes && activeFlashes.length > 0)) {
                    const playerDistSq = (hitX - posX)**2 + (hitY - posY)**2;
                    const mInt = muzzleFlashIntensity / (playerDistSq * 0.5 + 1.0);
                    
                    let enemyFlashR = 0, enemyFlashG = 0, enemyFlashB = 0;
                    if (activeFlashes) {
                        for(let k=0; k<activeFlashes.length; k++){
                            const f = activeFlashes[k] as any;
                            const d2 = (f.x - hitX)**2 + (f.y - hitY)**2;
                            const fInt = f.intensity / (d2 * 0.5 + 1.0); 
                            if (f.isFlashbang) {
                                enemyFlashR += fInt * 2.0; enemyFlashG += fInt * 2.0; enemyFlashB += fInt * 2.0;
                            } else {
                                enemyFlashR += fInt * muzzleR; enemyFlashG += fInt * muzzleG; enemyFlashB += fInt * muzzleB;
                            }
                        }
                    }
                    const fR = (effectiveLightningIntensity * lightningR) + (mInt * muzzleR) + enemyFlashR;
                    const fG = (effectiveLightningIntensity * lightningG) + (mInt * muzzleG) + enemyFlashG;
                    const fB = (effectiveLightningIntensity * lightningB) + (mInt * muzzleB) + enemyFlashB;
                    
                    fRInt = (fR * 255) | 0;
                    fGInt = (fG * 255) | 0;
                    fBInt = (fB * 255) | 0;
                }

                if (clippedDrawEnd > ds) {
                    if (d.maskId && d.textureId && !d.isDoorEdge && auxBuffers) {
                        const maskBuf = auxBuffers.get(d.maskId);
                        if (maskBuf) {
                            currentDoorBuf = getMaskedDoorBuffer(currentDoorBuf, maskBuf, d.isBroken);
                        }
                    }

                    const texW = currentDoorBuf.width;
                    const texH = currentDoorBuf.height;
                    const texData = currentDoorBuf.data;

                    const stepFixed = ((texH << 16) / lh) | 0;
                    const drawStart = Math.max(0, ds);
                    const drawEnd = Math.min(height, clippedDrawEnd);
                    let texPosFixed = ((drawStart - ds) * stepFixed) | 0;

                    const fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
                    const fogR = (getFogColorR() * fogAmtInt) >> 8;
                    const fogG = (getFogColorG() * fogAmtInt) >> 8;
                    const fogB = (getFogColorB() * fogAmtInt) >> 8;

                    const totalRMult = rMultInt + fRInt;
                    const totalGMult = gMultInt + fGInt;
                    const totalBMult = bMultInt + fBInt;

                    const addFogR = (isWebGLActive ? 0 : (fRInt >> 2)) + fogR;
                    const addFogG = (isWebGLActive ? 0 : (fGInt >> 2)) + fogG;
                    const addFogB = (isWebGLActive ? 0 : (fBInt >> 2)) + fogB;

                    const wLen = windowWalls.length;
                    const sLen = solidOccluders.length;
                    const hasOccluders = wLen > 0 || sLen > 0;

                    for (let y = drawStart; y < drawEnd; y++) {
                        const ty = (((texPosFixed >> 16) % texH) + texH) % texH; 
                        texPosFixed += stepFixed;

                        if (hasOccluders) {
                            let isOccluded = false;
                            if (wLen > 0) {
                                for (let j = 0; j < wLen; j++) {
                                    const w = windowWalls[j];
                                    if (w.dist < dist && y >= w.levelDrawStart && y < w.levelDrawEnd) {
                                        if (!w.isCutoutColumn || (y < w.screenCutoutTop || y >= w.screenCutoutBot)) {
                                            isOccluded = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (isOccluded) continue;

                            if (sLen > 0) {
                                for (let j = 0; j < sLen; j++) {
                                    const s = solidOccluders[j];
                                    if (s.dist < dist && y >= s.drawStart && y < s.drawEnd) {
                                        isOccluded = true;
                                        break;
                                    }
                                }
                            }
                            if (isOccluded) continue;
                        }

                        const texIdx = (ty * texW + texX) | 0;
                        if (texIdx >= 0 && texIdx < texData.length) {
                            const color = texData[texIdx];
                            const alpha = (color >> 24) & 0xFF;
                            if (alpha === 0) continue;

                            let r = (color & 0xFF);
                            let g = ((color >> 8) & 0xFF);
                            let b = ((color >> 16) & 0xFF);

                            r = (r * totalRMult) >> 8;
                            g = (g * totalGMult) >> 8;
                            b = (b * totalBMult) >> 8;

                            if (addFogR || addFogG || addFogB) {
                                r = Math.min(255, r + addFogR);
                                g = Math.min(255, g + addFogG);
                                b = Math.min(255, b + addFogB);
                            }

                            let finalColor;
                            if (alpha < 255) {
                                const bgVal = screenBuffer[y * width + x];
                                if (isWebGLActive) {
                                    const bgA = (bgVal >> 24) & 0xFF;
                                    if (bgA > 0) {
                                        const bgR = bgVal & 0xFF;
                                        const bgG = (bgVal >> 8) & 0xFF;
                                        const bgB = (bgVal >> 16) & 0xFF;
                                        const invA = 255 - alpha;
                                        const outR = (r * alpha + bgR * invA) >> 8;
                                        const outG = (g * alpha + bgG * invA) >> 8;
                                        const outB = (b * alpha + bgB * invA) >> 8;
                                        const outA = Math.max(alpha, bgA);
                                        finalColor = (outA << 24) | (outB << 16) | (outG << 8) | outR;
                                    } else {
                                        finalColor = (alpha << 24) | (b << 16) | (g << 8) | r;
                                    }
                                } else {
                                    const bgR = bgVal & 0xFF;
                                    const bgG = (bgVal >> 8) & 0xFF;
                                    const bgB = (bgVal >> 16) & 0xFF;
                                    const invA = 255 - alpha;
                                    r = (r * alpha + bgR * invA) >> 8;
                                    g = (g * alpha + bgG * invA) >> 8;
                                    b = (b * alpha + bgB * invA) >> 8;
                                    finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                                }
                            } else {
                                finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                            }

                            screenBuffer[y * width + x] = finalColor;
                            for (let d = 1; d < resolutionDivisor; d++) {
                                if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                            }
                        }
                    }

                    if (!d.maskId && (d.type !== 'LIFT' || d.openAmount === 0)) {
                        zBuffer[x] = dist; 
                    }
                }
            }
        }
    }
};
