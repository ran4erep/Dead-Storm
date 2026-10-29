
import { Tile, AnimationConfig } from '../../types';
import { RaycasterBuffer } from './RaycasterUtils';
import { getDepthFactor, getFogColorInt, isFogWeather, getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { PassThroughDoor, PassThroughWall, MirrorReflection, WallRenderProps } from './RaycasterTypes';
import { performRaycast, RaycastResult, resetRaycastPools, getRenderableWallLayersCache, getDistanceField, getUpperGeometryLayersCache, getSolidWallLayersCache } from './RaycastCore';
import { calculateTextureX } from './TextureMapper';
import { calculateLighting, updateLightingSolidMap } from './Lighting';
import { drawWallStrip, drawBrokenMirrorStrip } from './WallDrawer';
import { performMirrorRaycast, precalculateMirrorWalls, resetMirrorPool, getBilinearFloorLight } from './MirrorRenderer';
import { drawMirrorStrip } from './MirrorStripRenderer';
import { renderPassthroughWalls, renderPassthroughDoors } from './PassthroughRenderer';
import { collectPolyObjectsFromGrid, generatePolyObjectOccluders } from './PolyObjectRenderer';
import { isWebGLActive } from './WebGLState';

// Diagnostics: per-frame CPU wall work counters
let wallStats = { strips: 0, rows: 0, passthrough: 0, rayMs: 0, ptMs: 0 };
let fastGlWalls = false;
export const setFastGlWalls = (v: boolean) => { fastGlWalls = v; };
export const resetWallStats = () => { wallStats.strips = 0; wallStats.rows = 0; wallStats.passthrough = 0; wallStats.rayMs = 0; wallStats.ptMs = 0; };
export const getWallStats = () => wallStats;

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

const rayResultA: RaycastResult = { hit: 0, side: 0, perpWallDist: 0, mapX: 0, mapY: 0, stepX: 0, stepY: 0, rayDirX: 0, rayDirY: 0, isDoor: false, isDoorEdge: false, isDoorFrame: false, doorOffset: 0, isTextureFlipped: false, hitInsideHinge: false, geometryHitSide: 0, hitDepthLimit: false, visibleLayerMask: 0, visibleCapMask: 0 };
const rayResultB: RaycastResult = { hit: 0, side: 0, perpWallDist: 0, mapX: 0, mapY: 0, stepX: 0, stepY: 0, rayDirX: 0, rayDirY: 0, isDoor: false, isDoorEdge: false, isDoorFrame: false, doorOffset: 0, isTextureFlipped: false, hitInsideHinge: false, geometryHitSide: 0, hitDepthLimit: false, visibleLayerMask: 0, visibleCapMask: 0 };

// File-scoped persistent cache for Mirror Reflections
interface CachedMirrorColumn {
    mirrorResult: any; // Return value of performMirrorRaycast
    precalc: any[];    // Return value of precalculateMirrorWalls
}

const cloneMirrorReflection = (ref: MirrorReflection): MirrorReflection => ({
    drawStart: ref.drawStart,
    drawEnd: ref.drawEnd,
    perpWallDist: ref.perpWallDist,
    refRayDirX: ref.refRayDirX,
    refRayDirY: ref.refRayDirY,
    mirrorHitX: ref.mirrorHitX,
    mirrorHitY: ref.mirrorHitY,
    side: ref.side,
    maskTop: 9999, // Reset to re-calculate during draw
    maskBottom: -1, // Reset to re-calculate during draw
    mirrorRefDist: ref.mirrorRefDist,
    rMult: ref.rMult,
    gMult: ref.gMult,
    bMult: ref.bMult,
    fR: ref.fR,
    fG: ref.fG,
    fB: ref.fB,
    texX: ref.texX,
    step: ref.step,
    texPosStart: ref.texPosStart,
    mirrorAlpha: ref.mirrorAlpha,
    textureId: ref.textureId,
    mirrorPassThroughWalls: ref.mirrorPassThroughWalls
});

let cachedMirrorCols: CachedMirrorColumn[] = [];
let lastMirrorCacheWidth = 0;
let lastPosX = -1;
let lastPosY = -1;
let lastDirX = -1;
let lastDirY = -1;
let lastPlaneX = -1;
let lastPlaneY = -1;
let lastHorizon = -1;
let lastCameraZ = -1;
let lastGridRef: any = null;
let lastGridsRef: any = null;
let lastFlashlightActive = false;

function isAnyDoorAnimating(grid: Tile[][]): boolean {
    return !!(window as any).isAnyDoorAnimating;
}

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

export const renderWalls = ({
    width, height, grid, grids, posX, posY, dirX, dirY, planeX, planeY, horizon,
    wallBuffer, doorBuffer, lightMap, floorLightMaps, outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity, debugTextures,
    activeFlashes = [], spriteMap, animations, customWallBuffers, screenBuffer, auxBuffers,
    zBuffer, solidWallTopBuffer, passThroughDoors, passThroughWalls, mirrorReflections,
    ceilingType, skyBuffer, floorBuffer, ceilingBuffer, fov, cameraZ, customFloorBuffers, rowDistances,
    resolutionDivisor = 1, flashlightActive = false, flashlightBatteryRatio = 1.0, renderDistance = 15,
    reusableHighlightSet, polyObjectsList: passedPolyObjectsList
}: WallRenderProps) => {
    const mapWidth = grid[0]?.length || 0; 
    const mapHeight = grid.length;
    // Set render distance high enough to avoid wall strips rendering empty/gaps at high/far distances, but keep it constrained by map dimensions
    renderDistance = Math.max(128, Math.max(mapWidth, mapHeight) * 2);

    resetRaycastPools();
    resetMirrorPool();
    updateLightingSolidMap(grid, grids);

    // Check if we can reuse the mirror reflection cache
    const doorAnimating = isAnyDoorAnimating(grid);
    const hasActiveMirrors = cachedMirrorCols.some(c => c && c.mirrorResult !== null);
    const mirrorAffectedByDoor = doorAnimating && hasActiveMirrors;

    const cameraChanged = (
        Math.abs(posX - lastPosX) > 1e-5 ||
        Math.abs(posY - lastPosY) > 1e-5 ||
        Math.abs(dirX - lastDirX) > 1e-5 ||
        Math.abs(dirY - lastDirY) > 1e-5 ||
        Math.abs(planeX - lastPlaneX) > 1e-5 ||
        Math.abs(planeY - lastPlaneY) > 1e-5 ||
        Math.abs(horizon - lastHorizon) > 0.01 ||
        Math.abs(cameraZ - lastCameraZ) > 1e-5 ||
        grid !== lastGridRef ||
        grids !== lastGridsRef ||
        width !== lastMirrorCacheWidth ||
        flashlightActive !== lastFlashlightActive
    );

    const anyFlashActive = lightningIntensity > 0 || muzzleFlashIntensity > 0 || (activeFlashes && activeFlashes.length > 0);

    const useMirrorCache = !cameraChanged && !mirrorAffectedByDoor && !anyFlashActive && cachedMirrorCols.length === width;

    if (useMirrorCache) {
        // Clear only door and wall passthroughs
        for (let i = 0; i < width; i++) {
            if (passThroughDoors[i].length > 0) passThroughDoors[i].length = 0;
            if (passThroughWalls[i].length > 0) passThroughWalls[i].length = 0;
            if (mirrorReflections[i].length > 0) mirrorReflections[i].length = 0;
        }
    } else {
        // Clear everything properly
        for (let i = 0; i < width; i++) {
            if (passThroughDoors[i].length > 0) passThroughDoors[i].length = 0;
            if (passThroughWalls[i].length > 0) passThroughWalls[i].length = 0;
            if (mirrorReflections[i].length > 0) mirrorReflections[i].length = 0;
        }
        if (cachedMirrorCols.length !== width) {
            if (cachedMirrorCols.length < width) {
                while (cachedMirrorCols.length < width) {
                    cachedMirrorCols.push({ mirrorResult: null, precalc: [] });
                }
            } else {
                cachedMirrorCols.length = width;
            }
        }

        // Update persistent frame keys
        lastPosX = posX;
        lastPosY = posY;
        lastDirX = dirX;
        lastDirY = dirY;
        lastPlaneX = planeX;
        lastPlaneY = planeY;
        lastHorizon = horizon;
        lastCameraZ = cameraZ;
        lastGridRef = grid;
        lastGridsRef = grids;
        lastMirrorCacheWidth = width;
        lastFlashlightActive = flashlightActive;
    }

    const activeGrids = grids || [grid];
    const hasUpperLayers = activeGrids.length > 1;
    const renderableWallLayersCache = getRenderableWallLayersCache(grid, activeGrids);
    
    const distanceField = getDistanceField(grid, activeGrids);
    const upperGeometryCache = getUpperGeometryLayersCache(grid, activeGrids);
    const solidWallCache = getSolidWallLayersCache(grid, activeGrids);
    
    // Flash colors (pre-calc)
    const lightningR = 0.6, lightningG = 0.65, lightningB = 0.8;
    const muzzleR = 1.0, muzzleG = 0.8, muzzleB = 0.3;

    let lastRay: RaycastResult | null = null;
    let currentRayObj = rayResultA;

    const lightingResult: { rMultInt: number, gMultInt: number, bMultInt: number, fRInt: number, fGInt: number, fBInt: number, fogAmtInt?: number } = { rMultInt: 256, gMultInt: 256, bMultInt: 256, fRInt: 0, fGInt: 0, fBInt: 0 };
    const reusableLayerLightingResult = { rMultInt: 256, gMultInt: 256, bMultInt: 256, fRInt: 0, fGInt: 0, fBInt: 0, fogAmtInt: 0 };

    // Precalculate fog tables for mirrors and caps once per frame to maximize CPU efficiency
    const refFogTable = new Int32Array(height);
    const depthFogTable = new Int32Array(height);
    for (let y = 0; y < height; y++) {
        const distToP = rowDistances[y];
        refFogTable[y] = (Math.min(1.0, 1.0 / (1 + (distToP * distToP) * 0.005)) * 256) | 0;
        depthFogTable[y] = (getDepthFactor(distToP) * 256) | 0;
    }

    if (solidWallTopBuffer) {
        solidWallTopBuffer.fill(height);
    }

    // Generate polyObject depth occluders early so mirrors and windows respect PolyObjects in front of them
    const polyObjectsList = passedPolyObjectsList || collectPolyObjectsFromGrid(grid, posX, posY, renderDistance, lightMap);
    if (polyObjectsList && polyObjectsList.length > 0 && passThroughWalls) {
        generatePolyObjectOccluders(
            polyObjectsList, posX, posY, cameraZ, dirX, dirY, planeX, planeY, horizon,
            width, height, passThroughWalls, undefined
        );
    }

    const _l0 = performance.now();
    for (let x = 0; x < width; x += resolutionDivisor) {
        // 1. Raycast
        const ray = performRaycast(
            x, width, posX, posY, dirX, dirY, planeX, planeY, grid, activeGrids, 
            passThroughDoors, passThroughWalls, currentRayObj, renderDistance ?? 15,
            cameraZ, horizon, height, ceilingType,
            distanceField, upperGeometryCache, solidWallCache
        );
        
        lastRay = ray;
        currentRayObj = currentRayObj === rayResultA ? rayResultB : rayResultA;
        
        zBuffer[x] = ray.perpWallDist;
        // Fill Z-Buffer gaps
        for (let d = 1; d < resolutionDivisor; d++) {
            if (x + d < width) zBuffer[x + d] = ray.perpWallDist;
        }
        
        const lineHeight = height / ray.perpWallDist;
        const baseDrawStart = (horizon - lineHeight * (1 - cameraZ)) | 0; 
        
        // 2. Lighting
        calculateLighting(
            ray.mapX, ray.mapY, ray.side, ray.isDoorEdge, ray.isDoorFrame, ray.perpWallDist,
            lightMap, outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity, activeFlashes,
            posX, posY, ray.rayDirX, ray.rayDirY, ray.stepX, ray.stepY, ray.isDoor, grid, flashlightActive, flashlightBatteryRatio,
            lightingResult, grids, false, 0
        );

        if (!ray.hitDepthLimit) {
            // 3. Render Layers
            const renderLayers = renderableWallLayersCache[ray.mapY]?.[ray.mapX];
            if (renderLayers) {
                for (let idx = 0; idx < renderLayers.length; idx++) {
                    const levelIndex = renderLayers[idx];
                    if (ray.isDoor && levelIndex > 0) continue;
                    // RaycastCore already did screen-space interval occlusion for
                    // upper floors. Do not render a layer that never intersected
                    // the visible interval for this column.
                    if (levelIndex > 0 && (ray.visibleLayerMask & (1 << levelIndex)) === 0) continue;
                
                reusableLayerLightingResult.rMultInt = lightingResult.rMultInt;
                reusableLayerLightingResult.gMultInt = lightingResult.gMultInt;
                reusableLayerLightingResult.bMultInt = lightingResult.bMultInt;
                reusableLayerLightingResult.fRInt = lightingResult.fRInt;
                reusableLayerLightingResult.fGInt = lightingResult.fGInt;
                reusableLayerLightingResult.fBInt = lightingResult.fBInt;
                reusableLayerLightingResult.fogAmtInt = lightingResult.fogAmtInt || 0;

                if (floorLightMaps && floorLightMaps[levelIndex]) {
                    calculateLighting(
                        ray.mapX, ray.mapY, ray.side, ray.isDoorEdge, ray.isDoorFrame, ray.perpWallDist,
                        floorLightMaps[levelIndex], outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity, activeFlashes,
                        posX, posY, ray.rayDirX, ray.rayDirY, ray.stepX, ray.stepY, ray.isDoor, grid, flashlightActive, flashlightBatteryRatio,
                        reusableLayerLightingResult, grids, false, levelIndex
                    );
                }
                
                const currentGrid = activeGrids[levelIndex];
                const currentTile = (ray.mapX >= 0 && ray.mapX < mapWidth && ray.mapY >= 0 && ray.mapY < mapHeight) ? currentGrid[ray.mapY][ray.mapX] : undefined;
                
                if (!currentTile || (levelIndex === 0 && !ray.isDoor && currentTile.type !== 'WALL') || (levelIndex > 0 && currentTile.type !== 'WALL')) continue;

                let elev = currentTile?.elevation !== undefined ? currentTile.elevation : 0;
                let h = currentTile?.height !== undefined ? Math.abs(currentTile.height) : 1.0;
                if (currentTile?.height !== undefined && currentTile.height < 0) {
                    elev = 1.0 - h;
                }
                const absTopZ = levelIndex + elev + h;
                const absBotZ = levelIndex + elev;

                let levelDrawEnd = Math.ceil(horizon + lineHeight * (cameraZ - absBotZ)); 
                let levelDrawStart = Math.floor(horizon + lineHeight * (cameraZ - absTopZ)); 
                let drawStart = Math.max(0, levelDrawStart);
                let drawEnd = Math.min(height, levelDrawEnd);
                if (drawStart >= drawEnd) continue;

                if (solidWallTopBuffer) {
                    solidWallTopBuffer[x] = Math.min(solidWallTopBuffer[x], levelDrawStart);
                    for (let d = 1; d < resolutionDivisor; d++) {
                        if (x + d < width) {
                            solidWallTopBuffer[x + d] = Math.min(solidWallTopBuffer[x + d], levelDrawStart);
                        }
                    }
                }

                const fallbackBuf = auxBuffers?.get('TEX_FALLBACK') || auxBuffers?.get('fallback') || wallBuffer;
                let buf = fallbackBuf;
            if (ray.isDoor) {
                if (currentTile?.door?.textureId && auxBuffers?.has(currentTile.door.textureId)) {
                    buf = auxBuffers.get(currentTile.door.textureId)!;
                } else if (currentTile?.door?.textureId && auxBuffers?.has('TEX_' + currentTile.door.textureId)) {
                    buf = auxBuffers.get('TEX_' + currentTile.door.textureId)!;
                } else {
                    buf = fallbackBuf;
                }
            } else {
                let faceDirectionStr: 'N'|'E'|'S'|'W' | null = null;
                if (ray.side === 0) {
                    faceDirectionStr = ray.rayDirX > 0 ? 'W' : 'E';
                } else {
                    faceDirectionStr = ray.rayDirY > 0 ? 'N' : 'S';
                }
                
                let usedFaceAsset = false;
                if (faceDirectionStr && currentTile?.faces?.[faceDirectionStr]) {
                    const faceAssetId = currentTile.faces[faceDirectionStr]!;
                    if (auxBuffers?.has(faceAssetId)) {
                        buf = auxBuffers.get(faceAssetId)!;
                        usedFaceAsset = true;
                    } else if (auxBuffers?.has('TEX_' + faceAssetId)) {
                        buf = auxBuffers.get('TEX_' + faceAssetId)!;
                        usedFaceAsset = true;
                    }
                }

                let assetToUse = currentTile?.assetId;
                if (currentTile?.type === 'FLOOR') {
                    assetToUse = currentTile.floorAssetId || currentTile.assetId || currentTile.textureId;
                }

                if (!usedFaceAsset && assetToUse) {
                    if (auxBuffers?.has(assetToUse)) {
                        buf = auxBuffers.get(assetToUse)!;
                        usedFaceAsset = true;
                    } else if (auxBuffers?.has('TEX_' + assetToUse)) {
                        buf = auxBuffers.get('TEX_' + assetToUse)!;
                        usedFaceAsset = true;
                    }
                }

                if (!usedFaceAsset) {
                    buf = fallbackBuf;
                }
            }

            if (levelIndex === 0 && customWallBuffers) {
                let face = 0;
                if (ray.side === 0) {
                    face = ray.rayDirX > 0 ? 3 : 1;
                } else {
                    face = ray.rayDirY > 0 ? 0 : 2;
                }
                const key = (ray.mapY * 10000 + ray.mapX) * 10 + face;
                if (customWallBuffers.has(key)) {
                    buf = customWallBuffers.get(key)!;
                }
            }
            
            if (!buf || !debugTextures) {
                buf = auxBuffers?.get('TEX_FALLBACK');
                if (!buf && debugTextures) buf = wallBuffer;
                if (!buf) {
                    if (!isWebGLActive) {
                        const solidColor = (ray.side === 1) ? 0xFF514137 : 0xFF63554b;
                        for (let y = drawStart; y < drawEnd; y++) {
                            screenBuffer[y * width + x] = solidColor;
                            for (let d = 1; d < resolutionDivisor; d++) {
                                if (x + d < width) screenBuffer[y * width + (x + d)] = solidColor;
                            }
                        }
                    }
                    continue;
                }
            }

            // Calculate Texture X
            const texX = calculateTextureX(
                ray.isDoor, ray.isDoorFrame, ray.isDoorEdge, ray.isTextureFlipped, ray.doorOffset,
                ray.side, ray.rayDirX, ray.rayDirY, posX, posY, ray.perpWallDist, buf
            );

            const stepFixed = ((buf.height << 16) / lineHeight) | 0;
            const texStartShift = (1.0 - (elev + h)) * lineHeight;
            let texPosFixed = ((drawStart - levelDrawStart + texStartShift) * stepFixed) | 0;

            // Mirror Logic
            let mirrorResult = null;
            let isMirror = false;
            let isBrokenMirror = false;
            
            if (currentTile?.mirror && currentTile?.maskId && (auxBuffers?.has('TEX_' + currentTile.maskId) || auxBuffers?.has(currentTile.maskId))) {
                if (currentTile.isMirrorBroken) {
                    isBrokenMirror = true;
                } else {
                    isMirror = true;
                }
                
                // If a specific target asset is required for the mask, verify it matches
                if (currentTile.maskTargetAsset) {
                    let actualAssetId = currentTile.assetId;
                    let faceDirectionStr: 'N'|'E'|'S'|'W' | null = null;
                    if (!ray.isDoor) {
                        if (ray.side === 0) {
                            faceDirectionStr = ray.rayDirX > 0 ? 'W' : 'E';
                        } else {
                            faceDirectionStr = ray.rayDirY > 0 ? 'N' : 'S';
                        }
                    }
                    if (faceDirectionStr && currentTile?.faces?.[faceDirectionStr]) {
                        actualAssetId = currentTile.faces[faceDirectionStr];
                    }
                    
                    if (actualAssetId !== currentTile.maskTargetAsset) {
                        isMirror = false;
                    }
                }
            }

            if (isMirror && currentTile) {
                const safePerpDist = Math.max(0.12, ray.perpWallDist);
                if (useMirrorCache && cachedMirrorCols[x] && cachedMirrorCols[x].mirrorResult) {
                    mirrorResult = cachedMirrorCols[x].mirrorResult;
                    // Populate mirrorReflections[x] from cloned cached reflections
                    if (mirrorResult && mirrorResult.clonedReflections) {
                        for (let r = 0; r < mirrorResult.clonedReflections.length; r++) {
                            const refCloned = cloneMirrorReflection(mirrorResult.clonedReflections[r]);
                            mirrorReflections[x].push(refCloned);
                        }
                    }
                } else {
                    let dynamicRenderDistance = renderDistance ?? 15;
                    if (safePerpDist < 0.2) {
                        dynamicRenderDistance = 3;
                    } else if (safePerpDist < 0.35) {
                        dynamicRenderDistance = 6;
                    } else if (safePerpDist < 0.6) {
                        dynamicRenderDistance = 10;
                    }

                    mirrorResult = performMirrorRaycast(
                        x, posX, posY, safePerpDist, ray.rayDirX, ray.rayDirY, ray.side,
                        mapWidth, mapHeight, grid, activeGrids, hasUpperLayers, auxBuffers,
                        wallBuffer, doorBuffer, customWallBuffers, mirrorReflections,
                        drawStart, drawEnd, levelDrawStart, lineHeight, buf,
                        ray.isDoor, ray.isDoorFrame, ray.isDoorEdge, ray.doorOffset, ray.isTextureFlipped,
                        currentTile, lightMap, outdoorMap, lightningMap, lightningIntensity, muzzleFlashIntensity, activeFlashes,
                        muzzleR, muzzleG, muzzleB, lightningR, lightningG, lightningB,
                        ray.mapX, ray.mapY, debugTextures, dynamicRenderDistance,
                        distanceField, upperGeometryCache
                    );
                }
            }

             if (mirrorResult && mirrorResult.hasMirrorHit) {
                const safePerpDist = Math.max(0.12, ray.perpWallDist);
                let precalc;
                if (useMirrorCache && cachedMirrorCols[x] && cachedMirrorCols[x].mirrorResult) {
                    precalc = cachedMirrorCols[x].precalc;
                } else {
                    precalc = precalculateMirrorWalls(
                        mirrorResult.mirrorPassThroughWalls, safePerpDist, height, horizon,
                        drawStart, drawEnd, wallBuffer, auxBuffers, 
                        mirrorResult.mirrorHitX, mirrorResult.mirrorHitY, 
                        mirrorResult.refRayDirX, mirrorResult.refRayDirY,
                        lightMap, mapWidth, mapHeight, cameraZ, debugTextures, grid, grids,
                        mirrorResult.mirrorRefDist,
                        posX, posY, lightningIntensity, muzzleFlashIntensity, activeFlashes,
                        muzzleR, muzzleG, muzzleB, lightningR, lightningG, lightningB
                    );
                    
                    // Cache the results!
                    cachedMirrorCols[x] = {
                        mirrorResult: {
                            ...mirrorResult,
                            clonedReflections: mirrorReflections[x].map(cloneMirrorReflection)
                        },
                        precalc: precalc
                    };
                }

                const maskBuf = auxBuffers?.get(currentTile.maskId!) || null;
                
                let mRefBuf = mirrorResult.mirrorRefBuf;
                let mSkyBuf = skyBuffer;
                let mFloorBuf = floorBuffer;
                let mCeilBuf = ceilingBuffer;
                
                if (!debugTextures) {
                    const fallback = auxBuffers?.get('TEX_FALLBACK');
                    mRefBuf = fallback || null;
                    mSkyBuf = fallback || null;
                    mFloorBuf = fallback || null;
                    mCeilBuf = fallback || null;
                }

                drawMirrorStrip(
                    x, drawStart, drawEnd, texPosFixed, stepFixed, texX, buf, maskBuf, screenBuffer,
                    width, height, horizon, mirrorReflections, safePerpDist,
                    mirrorResult.mirrorRefDist, mirrorResult.mirrorHitX, mirrorResult.mirrorHitY,
                    mirrorResult.refRayDirX, mirrorResult.refRayDirY, precalc, auxBuffers,
                    lightMap, mapWidth, mapHeight, mRefBuf,
                    mirrorResult.mirrorRefWallX, mirrorResult.mirrorRefRMult, mirrorResult.mirrorRefGMult, mirrorResult.mirrorRefBMult,
                    ceilingType, mSkyBuf, fov, posX, posY, dirX, dirY, lightningIntensity,
                    muzzleFlashIntensity, activeFlashes, muzzleR, muzzleG, muzzleB, lightningR, lightningG, lightningB,
                    mFloorBuf, mCeilBuf, customFloorBuffers, grid, rowDistances,
                    reusableLayerLightingResult.rMultInt, reusableLayerLightingResult.gMultInt, reusableLayerLightingResult.bMultInt,
                    reusableLayerLightingResult.fRInt, reusableLayerLightingResult.fGInt, reusableLayerLightingResult.fBInt, cameraZ,
                    debugTextures, resolutionDivisor, reusableLayerLightingResult.fogAmtInt || 0, grids,
                    (mirrorResult as any).refAbsTopZ,
                    (mirrorResult as any).refAbsBotZ,
                    refFogTable,
                    depthFogTable,
                    floorLightMaps,
                    flashlightActive,
                    passThroughWalls ? passThroughWalls[x] : undefined
                );

                if (resolutionDivisor > 1 && mirrorReflections[x].length > 0) {
                    for (let d = 1; d < resolutionDivisor; d++) {
                        if (x + d < width) {
                            mirrorReflections[x + d].length = 0;
                            for (let r = 0; r < mirrorReflections[x].length; r++) {
                                mirrorReflections[x + d].push(mirrorReflections[x][r]);
                            }
                        }
                    }
                }
            } else {
                if (!useMirrorCache) {
                    cachedMirrorCols[x] = { mirrorResult: null, precalc: [] };
                }
                
                if (isBrokenMirror && currentTile?.maskId && auxBuffers?.has(currentTile.maskId)) {
                    let actualBuf = buf;
                    const maskBuf = auxBuffers.get(currentTile.maskId)!;
                    drawBrokenMirrorStrip(
                        x, drawStart, drawEnd, texPosFixed, stepFixed, texX, actualBuf, maskBuf, screenBuffer, width,
                        reusableLayerLightingResult.rMultInt, reusableLayerLightingResult.gMultInt, reusableLayerLightingResult.bMultInt,
                        reusableLayerLightingResult.fRInt, reusableLayerLightingResult.fGInt, reusableLayerLightingResult.fBInt,
                        resolutionDivisor, reusableLayerLightingResult.fogAmtInt || 0,
                        // Use a simple seed based on tile coordinates
                        (ray.mapX * 37) ^ (ray.mapY * 17),
                        ray.perpWallDist
                    );
                } else {
                    let actualBuf = buf;
                    wallStats.strips++;
                    wallStats.rows += (drawEnd - drawStart);
                    if (!(isWebGLActive && fastGlWalls && levelIndex === 0 && !ray.isDoor && !ray.isDoorFrame && !ray.isDoorEdge && currentTile?.type === 'WALL' && !currentTile.isWindow && !currentTile.mirror)) {
                        drawWallStrip(
                            x, drawStart, drawEnd, texPosFixed, stepFixed, texX, actualBuf, screenBuffer, width,
                            reusableLayerLightingResult.rMultInt, reusableLayerLightingResult.gMultInt, reusableLayerLightingResult.bMultInt,
                            reusableLayerLightingResult.fRInt, reusableLayerLightingResult.fGInt, reusableLayerLightingResult.fBInt,
                            resolutionDivisor, reusableLayerLightingResult.fogAmtInt || 0, 256,
                            !!(ray.isDoor || ray.isDoorFrame || ray.isDoorEdge),
                            ray.perpWallDist
                        );
                    }
                }
            }

                // --- Bottom Cap Logic for Solid Wall ---
                // Only the raycaster-approved exposed cap(s) reach this expensive
                // path. In stacked floors this normally leaves one cap, or none.
                if (!isWebGLActive && (ray.visibleCapMask & (1 << levelIndex)) !== 0) {
                    let hasWallBelow = false;
                    if (levelIndex > 0) {
                        const underTopZ = getWallTopZ(levelIndex - 1, ray.mapX, ray.mapY, activeGrids);
                        if (underTopZ !== null && underTopZ >= absBotZ - 0.001) {
                            hasWallBelow = true;
                        }
                    }

                    if (levelDrawEnd < horizon && !hasWallBelow && currentTile?.type !== 'FLOOR') {
                        const capStart = Math.max(0, drawEnd);
                        const capEnd = Math.min(height, horizon);
                        
                        if (capStart < capEnd) {
                            let bottomBuf = debugTextures ? null : auxBuffers?.get('TEX_FALLBACK');
                            if (debugTextures && currentTile) {
                                const cellKey = ray.mapY * 10000 + ray.mapX;
                                if (customFloorBuffers && customFloorBuffers.has(cellKey * 10 + 5)) {
                                    bottomBuf = customFloorBuffers.get(cellKey * 10 + 5)!;
                                } else {
                                    const capTex = currentTile.bottomTextureId || currentTile.assetId || currentTile.textureId;
                                    if (capTex && auxBuffers?.has(capTex)) {
                                        bottomBuf = auxBuffers.get(capTex);
                                    }
                                }
                            }
                            
                            if (bottomBuf) {
                                const capW = bottomBuf.width;
                                const capH = bottomBuf.height;
                                const capData = bottomBuf.data;
                                
                                let rMultIntBase = (reusableLayerLightingResult.rMultInt * 153) >> 8; 
                                let gMultIntBase = (reusableLayerLightingResult.gMultInt * 153) >> 8; 
                                let bMultIntBase = (reusableLayerLightingResult.bMultInt * 153) >> 8;

                                const activeLightMap = (floorLightMaps && floorLightMaps[levelIndex]) ? floorLightMaps[levelIndex] : lightMap;

                                let currR = 0, currG = 0, currB = 0;
                                let currAddR = 0, currAddG = 0, currAddB = 0;
                                let stepR = 0, stepG = 0, stepB = 0;
                                let stepAddR = 0, stepAddG = 0, stepAddB = 0;
                                let stepsLeft = 0;
                                let isLastPixelValid = false;

                                for (let y = capStart; y < capEnd; y++) {
                                    const distToP = ((absBotZ - cameraZ) * height) / (horizon - y); 
                                    
                                    if (distToP > (renderDistance ?? 15) + 1.0 || distToP < 0.1) {
                                        isLastPixelValid = false;
                                        continue;
                                    }
                                    if (distToP >= zBuffer[x] + 0.01) {
                                        isLastPixelValid = false;
                                        continue;
                                    }

                                    const weight = distToP;
                                    const currentFloorX = posX + weight * ray.rayDirX;
                                    const currentFloorY = posY + weight * ray.rayDirY;

                                    if (!isLastPixelValid || stepsLeft === 0) {
                                        const distFogInt = (getDepthFactor(distToP) * 256) | 0;
                                        let exactR = 256, exactG = 256, exactB = 256;
                                        if (activeLightMap) {
                                            const l = getBilinearFloorLight(currentFloorX, currentFloorY, activeLightMap, mapWidth, mapHeight, grid, activeGrids, levelIndex);
                                            const capR = ((l.r * 256 * 153) >> 8) | 0;
                                            const capG = ((l.g * 256 * 153) >> 8) | 0;
                                            const capB = ((l.b * 256 * 153) >> 8) | 0;
                                            exactR = (capR * distFogInt) >> 8;
                                            exactG = (capG * distFogInt) >> 8;
                                            exactB = (capB * distFogInt) >> 8;
                                        } else {
                                            exactR = (rMultIntBase * distFogInt) >> 8;
                                            exactG = (gMultIntBase * distFogInt) >> 8;
                                            exactB = (bMultIntBase * distFogInt) >> 8;
                                        }

                                        const hasAnyMuzzleFlash = muzzleFlashIntensity > 0 || (activeFlashes && activeFlashes.length > 0);
                                        let fR = 0, fG = 0, fB = 0;
                                        if (hasAnyMuzzleFlash) {
                                            let flashAttenuation = 0.25;
                                            if (flashlightActive) {
                                                let quality = 1.0;
                                                if (flashlightBatteryRatio <= 0.5) {
                                                    const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                                                    quality = factor * 0.5 + 0.5;
                                                }
                                                flashAttenuation = 1.0 - (0.75 * quality);
                                            }

                                            if (muzzleFlashIntensity > 0) {
                                                const dx = currentFloorX - posX;
                                                const dy = currentFloorY - posY;
                                                const distSq = dx * dx + dy * dy;
                                                const mInt = (flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity) / (distSq * 0.5 + 1.0);
                                                fR += mInt * muzzleR; fG += mInt * muzzleG; fB += mInt * muzzleB;
                                            }

                                            if (activeFlashes && activeFlashes.length > 0) {
                                                for (let i = 0; i < activeFlashes.length; i++) {
                                                    const f = activeFlashes[i];
                                                    const dx = f.x - currentFloorX;
                                                    const dy = f.y - currentFloorY;
                                                    const distSq = dx * dx + dy * dy;
                                                    let fInt = f.intensity / (distSq * 0.5 + 1.0);
                                                    if (flashlightActive) fInt *= flashAttenuation;
                                                    if ((f as any).isFlashbang) {
                                                        fR += fInt * 2.0; fG += fInt * 2.0; fB += fInt * 2.0;
                                                    } else {
                                                        fR += fInt * muzzleR; fG += fInt * muzzleG; fB += fInt * muzzleB;
                                                    }
                                                }
                                            }
                                        }

                                        let rFinalInc = (fR * 255 * distFogInt) >> 8;
                                        let gFinalInc = (fG * 255 * distFogInt) >> 8;
                                        let bFinalInc = (fB * 255 * distFogInt) >> 8;

                                        let fogRInc = 0, fogGInc = 0, fogBInc = 0;
                                        if (isFogWeather()) {
                                            const fogAmt = 256 - distFogInt;
                                            fogRInc = (getFogColorR() * fogAmt) >> 8;
                                            fogGInc = (getFogColorG() * fogAmt) >> 8;
                                            fogBInc = (getFogColorB() * fogAmt) >> 8;
                                        }

                                        currR = exactR; currG = exactG; currB = exactB;
                                        currAddR = rFinalInc + fogRInc;
                                        currAddG = gFinalInc + fogGInc;
                                        currAddB = bFinalInc + fogBInc;

                                        let nextY = y + 4;
                                        if (nextY >= capEnd) {
                                            nextY = capEnd - 1;
                                        }

                                        let isNextValid = false;
                                        let nextDistToP = 0;
                                        if (nextY > y) {
                                            nextDistToP = ((absBotZ - cameraZ) * height) / (horizon - nextY);
                                            if (nextDistToP <= (renderDistance ?? 15) + 1.0 && nextDistToP >= 0.1 && nextDistToP < zBuffer[x] + 0.01) {
                                                isNextValid = true;
                                            }
                                        }

                                        const actualSteps = nextY - y;
                                        if (isNextValid && actualSteps > 0) {
                                            const nextFloorX = posX + nextDistToP * ray.rayDirX;
                                            const nextFloorY = posY + nextDistToP * ray.rayDirY;
                                            const nextDistFogInt = (getDepthFactor(nextDistToP) * 256) | 0;

                                            let nextR = 256, nextG = 256, nextB = 256;
                                            if (activeLightMap) {
                                                const l = getBilinearFloorLight(nextFloorX, nextFloorY, activeLightMap, mapWidth, mapHeight, grid, activeGrids, levelIndex);
                                                const capR = ((l.r * 256 * 153) >> 8) | 0;
                                                const capG = ((l.g * 256 * 153) >> 8) | 0;
                                                const capB = ((l.b * 256 * 153) >> 8) | 0;
                                                nextR = (capR * nextDistFogInt) >> 8;
                                                nextG = (capG * nextDistFogInt) >> 8;
                                                nextB = (capB * nextDistFogInt) >> 8;
                                            } else {
                                                nextR = (rMultIntBase * nextDistFogInt) >> 8;
                                                nextG = (gMultIntBase * nextDistFogInt) >> 8;
                                                nextB = (bMultIntBase * nextDistFogInt) >> 8;
                                            }

                                            let nextFR = 0, nextFG = 0, nextFB = 0;
                                            if (hasAnyMuzzleFlash) {
                                                let flashAttenuation = 0.25;
                                                if (flashlightActive) {
                                                    let quality = 1.0;
                                                    if (flashlightBatteryRatio <= 0.5) {
                                                        const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                                                        quality = factor * 0.5 + 0.5;
                                                    }
                                                    flashAttenuation = 1.0 - (0.75 * quality);
                                                }

                                                if (muzzleFlashIntensity > 0) {
                                                    const dx = nextFloorX - posX;
                                                    const dy = nextFloorY - posY;
                                                    const distSq = dx * dx + dy * dy;
                                                    const mInt = (flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity) / (distSq * 0.5 + 1.0);
                                                    nextFR += mInt * muzzleR; nextFG += mInt * muzzleG; nextFB += mInt * muzzleB;
                                                }

                                                if (activeFlashes && activeFlashes.length > 0) {
                                                    for (let i = 0; i < activeFlashes.length; i++) {
                                                        const f = activeFlashes[i];
                                                        const dx = f.x - nextFloorX;
                                                        const dy = f.y - nextFloorY;
                                                        const distSq = dx * dx + dy * dy;
                                                        let fInt = f.intensity / (distSq * 0.5 + 1.0);
                                                        if (flashlightActive) fInt *= flashAttenuation;
                                                        if ((f as any).isFlashbang) {
                                                            nextFR += fInt * 2.0; nextFG += fInt * 2.0; nextFB += fInt * 2.0;
                                                        } else {
                                                            nextFR += fInt * muzzleR; nextFG += fInt * muzzleG; nextFB += fInt * muzzleB;
                                                        }
                                                    }
                                                }
                                            }

                                            let nextRFinalInc = (nextFR * 255 * nextDistFogInt) >> 8;
                                            let nextGFinalInc = (nextFG * 255 * nextDistFogInt) >> 8;
                                            let nextBFinalInc = (nextFB * 255 * nextDistFogInt) >> 8;

                                            let nextFogRInc = 0, nextFogGInc = 0, nextFogBInc = 0;
                                            if (isFogWeather()) {
                                                const fogAmt = 256 - nextDistFogInt;
                                                nextFogRInc = (getFogColorR() * fogAmt) >> 8;
                                                nextFogGInc = (getFogColorG() * fogAmt) >> 8;
                                                nextFogBInc = (getFogColorB() * fogAmt) >> 8;
                                            }

                                            stepR = (nextR - currR) / actualSteps;
                                            stepG = (nextG - currG) / actualSteps;
                                            stepB = (nextB - currB) / actualSteps;

                                            stepAddR = ((nextRFinalInc + nextFogRInc) - currAddR) / actualSteps;
                                            stepAddG = ((nextGFinalInc + nextFogGInc) - currAddG) / actualSteps;
                                            stepAddB = ((nextBFinalInc + nextFogBInc) - currAddB) / actualSteps;
                                        } else {
                                            stepR = 0; stepG = 0; stepB = 0;
                                            stepAddR = 0; stepAddG = 0; stepAddB = 0;
                                        }

                                        stepsLeft = actualSteps;
                                        isLastPixelValid = true;
                                    }

                                    const tx = Math.floor(-currentFloorX * capW) % capW;
                                    const ty = Math.floor(currentFloorY * capH) % capH;
                                    let ftx = tx % capW; if (ftx < 0) ftx += capW;
                                    let fty = ty % capH; if (fty < 0) fty += capH;
                                    
                                    const color = capData[fty * capW + ftx];
                                    const r = color & 0xFF; const g = (color >> 8) & 0xFF; const b = (color >> 16) & 0xFF;

                                    let rFinal = (r * (currR | 0)) >> 8;
                                    let gFinal = (g * (currG | 0)) >> 8;
                                    let bFinal = (b * (currB | 0)) >> 8;

                                    rFinal = Math.min(255, rFinal + (currAddR | 0));
                                    gFinal = Math.min(255, gFinal + (currAddG | 0));
                                    bFinal = Math.min(255, bFinal + (currAddB | 0));

                                    const finalColor = (255 << 24) | (bFinal << 16) | (gFinal << 8) | rFinal;
                                    screenBuffer[y * width + x] = finalColor;
                                    for (let d = 1; d < resolutionDivisor; d++) {
                                        if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                                    }

                                    currR += stepR;
                                    currG += stepG;
                                    currB += stepB;
                                    currAddR += stepAddR;
                                    currAddG += stepAddG;
                                    currAddB += stepAddB;
                                    stepsLeft--;
                                }
                            }
                        }
                    }
                }

                // --- Top Cap Logic for Solid Wall ---
                if (!isWebGLActive) {
                    let hasWallAbove = false;
                    if (levelIndex < activeGrids.length - 1) {
                        const aboveBotZ = getWallBotZ(levelIndex + 1, ray.mapX, ray.mapY, activeGrids);
                        if (aboveBotZ !== null && aboveBotZ <= absTopZ + 0.001) {
                            hasWallAbove = true;
                        }
                    }

                    if (levelDrawStart > horizon && drawStart > horizon && !hasWallAbove) {
                        const capStart = Math.max(Math.floor(horizon) + 1, 0);
                        const capEnd = Math.min(height, drawStart);
                        
                        if (capStart < capEnd) {
                            let topBuf = debugTextures ? null : auxBuffers?.get('TEX_FALLBACK');
                            if (debugTextures && currentTile) {
                                const cellKey = ray.mapY * 10000 + ray.mapX;
                                if (customFloorBuffers && customFloorBuffers.has(cellKey * 10 + 4)) {
                                    topBuf = customFloorBuffers.get(cellKey * 10 + 4)!;
                                } else {
                                    const capTex = currentTile.topTextureId || currentTile.textureId || currentTile.bottomTextureId || currentTile.assetId;
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
                                
                                let rMultIntBase = reusableLayerLightingResult.rMultInt;
                                let gMultIntBase = reusableLayerLightingResult.gMultInt;
                                let bMultIntBase = reusableLayerLightingResult.bMultInt;

                                const activeLightMap = (floorLightMaps && floorLightMaps[levelIndex]) ? floorLightMaps[levelIndex] : lightMap;

                                let currR = 0, currG = 0, currB = 0;
                                let currAddR = 0, currAddG = 0, currAddB = 0;
                                let stepR = 0, stepG = 0, stepB = 0;
                                let stepAddR = 0, stepAddG = 0, stepAddB = 0;
                                let stepsLeft = 0;
                                let isLastPixelValid = false;

                                for (let y = capStart; y < capEnd; y++) {
                                    const distToP = ((cameraZ - absTopZ) * height) / (y - horizon); 
                                    
                                    if (distToP > (renderDistance ?? 15) + 1.0 || distToP < 0.1) {
                                        isLastPixelValid = false;
                                        continue;
                                    }
                                    if (distToP >= zBuffer[x] + 0.01) {
                                        isLastPixelValid = false;
                                        continue;
                                    }

                                    const weight = distToP;
                                    const currentFloorX = posX + weight * ray.rayDirX;
                                    const currentFloorY = posY + weight * ray.rayDirY;

                                    if (!isLastPixelValid || stepsLeft === 0) {
                                        const distFogInt = (getDepthFactor(distToP) * 256) | 0;
                                        let exactR = 256, exactG = 256, exactB = 256;
                                        if (activeLightMap) {
                                            const l = getBilinearFloorLight(currentFloorX, currentFloorY, activeLightMap, mapWidth, mapHeight, grid, activeGrids, levelIndex);
                                            exactR = (l.r * 256 * distFogInt) >> 8;
                                            exactG = (l.g * 256 * distFogInt) >> 8;
                                            exactB = (l.b * 256 * distFogInt) >> 8;
                                        } else {
                                            exactR = (rMultIntBase * distFogInt) >> 8;
                                            exactG = (gMultIntBase * distFogInt) >> 8;
                                            exactB = (bMultIntBase * distFogInt) >> 8;
                                        }

                                        const hasAnyMuzzleFlash = muzzleFlashIntensity > 0 || (activeFlashes && activeFlashes.length > 0);
                                        let fR = 0, fG = 0, fB = 0;
                                        if (hasAnyMuzzleFlash) {
                                            let flashAttenuation = 0.25;
                                            if (flashlightActive) {
                                                let quality = 1.0;
                                                if (flashlightBatteryRatio <= 0.5) {
                                                    const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                                                    quality = factor * 0.5 + 0.5;
                                                }
                                                flashAttenuation = 1.0 - (0.75 * quality);
                                            }

                                            if (muzzleFlashIntensity > 0) {
                                                const dx = currentFloorX - posX;
                                                const dy = currentFloorY - posY;
                                                const distSq = dx * dx + dy * dy;
                                                const mInt = (flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity) / (distSq * 0.5 + 1.0);
                                                fR += mInt * muzzleR; fG += mInt * muzzleG; fB += mInt * muzzleB;
                                            }

                                            if (activeFlashes && activeFlashes.length > 0) {
                                                for (let i = 0; i < activeFlashes.length; i++) {
                                                    const f = activeFlashes[i];
                                                    const dx = f.x - currentFloorX;
                                                    const dy = f.y - currentFloorY;
                                                    const distSq = dx * dx + dy * dy;
                                                    let fInt = f.intensity / (distSq * 0.5 + 1.0);
                                                    if (flashlightActive) fInt *= flashAttenuation;
                                                    if ((f as any).isFlashbang) {
                                                        fR += fInt * 2.0; fG += fInt * 2.0; fB += fInt * 2.0;
                                                    } else {
                                                        fR += fInt * muzzleR; fG += fInt * muzzleG; fB += fInt * muzzleB;
                                                    }
                                                }
                                            }
                                        }

                                        let rFinalInc = (fR * 255 * distFogInt) >> 8;
                                        let gFinalInc = (fG * 255 * distFogInt) >> 8;
                                        let bFinalInc = (fB * 255 * distFogInt) >> 8;

                                        let fogRInc = 0, fogGInc = 0, fogBInc = 0;
                                        if (isFogWeather()) {
                                            const fogAmt = 256 - distFogInt;
                                            fogRInc = (getFogColorR() * fogAmt) >> 8;
                                            fogGInc = (getFogColorG() * fogAmt) >> 8;
                                            fogBInc = (getFogColorB() * fogAmt) >> 8;
                                        }

                                        currR = exactR; currG = exactG; currB = exactB;
                                        currAddR = rFinalInc + fogRInc;
                                        currAddG = gFinalInc + fogGInc;
                                        currAddB = bFinalInc + fogBInc;

                                        let nextY = y + 4;
                                        if (nextY >= capEnd) {
                                            nextY = capEnd - 1;
                                        }

                                        let isNextValid = false;
                                        let nextDistToP = 0;
                                        if (nextY > y) {
                                            nextDistToP = ((cameraZ - absTopZ) * height) / (nextY - horizon);
                                            if (nextDistToP <= (renderDistance ?? 15) + 1.0 && nextDistToP >= 0.1 && nextDistToP < zBuffer[x] + 0.01) {
                                                isNextValid = true;
                                            }
                                        }

                                        const actualSteps = nextY - y;
                                        if (isNextValid && actualSteps > 0) {
                                            const nextFloorX = posX + nextDistToP * ray.rayDirX;
                                            const nextFloorY = posY + nextDistToP * ray.rayDirY;
                                            const nextDistFogInt = (getDepthFactor(nextDistToP) * 256) | 0;

                                            let nextR = 256, nextG = 256, nextB = 256;
                                            if (activeLightMap) {
                                                const l = getBilinearFloorLight(nextFloorX, nextFloorY, activeLightMap, mapWidth, mapHeight, grid, activeGrids, levelIndex);
                                                nextR = (l.r * 256 * nextDistFogInt) >> 8;
                                                nextG = (l.g * 256 * nextDistFogInt) >> 8;
                                                nextB = (l.b * 256 * nextDistFogInt) >> 8;
                                            } else {
                                                nextR = (rMultIntBase * nextDistFogInt) >> 8;
                                                nextG = (gMultIntBase * nextDistFogInt) >> 8;
                                                nextB = (bMultIntBase * nextDistFogInt) >> 8;
                                            }

                                            let nextFR = 0, nextFG = 0, nextFB = 0;
                                            if (hasAnyMuzzleFlash) {
                                                let flashAttenuation = 0.25;
                                                if (flashlightActive) {
                                                    let quality = 1.0;
                                                    if (flashlightBatteryRatio <= 0.5) {
                                                        const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                                                        quality = factor * 0.5 + 0.5;
                                                    }
                                                    flashAttenuation = 1.0 - (0.75 * quality);
                                                }

                                                if (muzzleFlashIntensity > 0) {
                                                    const dx = nextFloorX - posX;
                                                    const dy = nextFloorY - posY;
                                                    const distSq = dx * dx + dy * dy;
                                                    const mInt = (flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity) / (distSq * 0.5 + 1.0);
                                                    nextFR += mInt * muzzleR; nextFG += mInt * muzzleG; nextFB += mInt * muzzleB;
                                                }

                                                if (activeFlashes && activeFlashes.length > 0) {
                                                    for (let i = 0; i < activeFlashes.length; i++) {
                                                        const f = activeFlashes[i];
                                                        const dx = f.x - nextFloorX;
                                                        const dy = f.y - nextFloorY;
                                                        const distSq = dx * dx + dy * dy;
                                                        let fInt = f.intensity / (distSq * 0.5 + 1.0);
                                                        if (flashlightActive) fInt *= flashAttenuation;
                                                        if ((f as any).isFlashbang) {
                                                            nextFR += fInt * 2.0; nextFG += fInt * 2.0; nextFB += fInt * 2.0;
                                                        } else {
                                                            nextFR += fInt * muzzleR; nextFG += fInt * muzzleG; nextFB += fInt * muzzleB;
                                                        }
                                                    }
                                                }
                                            }

                                            let nextRFinalInc = (nextFR * 255 * nextDistFogInt) >> 8;
                                            let nextGFinalInc = (nextFG * 255 * nextDistFogInt) >> 8;
                                            let nextBFinalInc = (nextFB * 255 * nextDistFogInt) >> 8;

                                            let nextFogRInc = 0, nextFogGInc = 0, nextFogBInc = 0;
                                            if (isFogWeather()) {
                                                const fogAmt = 256 - nextDistFogInt;
                                                nextFogRInc = (getFogColorR() * fogAmt) >> 8;
                                                nextFogGInc = (getFogColorG() * fogAmt) >> 8;
                                                nextFogBInc = (getFogColorB() * fogAmt) >> 8;
                                            }

                                            stepR = (nextR - currR) / actualSteps;
                                            stepG = (nextG - currG) / actualSteps;
                                            stepB = (nextB - currB) / actualSteps;

                                            stepAddR = ((nextRFinalInc + nextFogRInc) - currAddR) / actualSteps;
                                            stepAddG = ((nextGFinalInc + nextFogGInc) - currAddG) / actualSteps;
                                            stepAddB = ((nextBFinalInc + nextFogBInc) - currAddB) / actualSteps;
                                        } else {
                                            stepR = 0; stepG = 0; stepB = 0;
                                            stepAddR = 0; stepAddG = 0; stepAddB = 0;
                                        }

                                        stepsLeft = actualSteps;
                                        isLastPixelValid = true;
                                    }

                                    let texXCoord = currentFloorX;
                                    let texYCoord = currentFloorY;
                                    if (currentTile?.isWater) {
                                        texXCoord += fastSin(currentFloorX * 10 + waterOffset1) * 0.05 + fastCos(currentFloorY * 10 + waterOffset2) * 0.05;
                                        texYCoord += fastSin(currentFloorY * 10 + waterOffset2) * 0.05 + fastCos(currentFloorX * 10 + waterOffset1) * 0.05;
                                        if (texXCoord < 0) texXCoord = -texXCoord;
                                        if (texYCoord < 0) texYCoord = -texYCoord;
                                    }

                                    const tx = Math.floor(texXCoord * capW) % capW;
                                    const ty = Math.floor(texYCoord * capH) % capH;
                                    const rot = (currentTile?.topTextureRotation || 0) % 360;
                                    let ftx = 0, fty = 0;
                                    if (rot === 0) {
                                        ftx = tx % capW; if (ftx < 0) ftx += capW;
                                        fty = ty % capH; if (fty < 0) fty += capH;
                                    } else {
                                        const u = texXCoord - Math.floor(texXCoord);
                                        const v = texYCoord - Math.floor(texYCoord);
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
                                    
                                    const color = topBuf.data[fty * capW + ftx];
                                    const r = color & 0xFF; const g = (color >> 8) & 0xFF; const b = (color >> 16) & 0xFF;

                                    let rFinal = (r * (currR | 0)) >> 8;
                                    let gFinal = (g * (currG | 0)) >> 8;
                                    let bFinal = (b * (currB | 0)) >> 8;

                                    rFinal = Math.min(255, rFinal + (currAddR | 0));
                                    gFinal = Math.min(255, gFinal + (currAddG | 0));
                                    bFinal = Math.min(255, bFinal + (currAddB | 0));

                                    const finalColor = (255 << 24) | (bFinal << 16) | (gFinal << 8) | rFinal;
                                    screenBuffer[y * width + x] = finalColor;
                                    for (let d = 1; d < resolutionDivisor; d++) {
                                        if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                                    }

                                    currR += stepR;
                                    currG += stepG;
                                    currB += stepB;
                                    currAddR += stepAddR;
                                    currAddG += stepAddG;
                                    currAddB += stepAddB;
                                    stepsLeft--;
                                }
                            }
                        }
                    }
                }
            }
        }
        }
    }
    wallStats.rayMs += performance.now() - _l0;

    // Render passthrough walls (windows) and doors after occluders are populated
    const invWidth = 1.0 / width;
    const _l1 = performance.now();
    for (let x = 0; x < width; x += resolutionDivisor) {
        const cameraX = 2 * x * invWidth - 1;
        const rayDirX = dirX + planeX * cameraX;
        const rayDirY = dirY + planeY * cameraX;

        // 4. Passthrough Walls
        renderPassthroughWalls(
            x, passThroughWalls[x], wallBuffer, debugTextures, height, horizon, posY, posX,
            rayDirX, rayDirY, activeGrids, auxBuffers, lightMap, outdoorMap, lightningMap, mapWidth, mapHeight,
            lightningIntensity, muzzleFlashIntensity, activeFlashes, muzzleR, muzzleG, muzzleB,
            lightningR, lightningG, lightningB, zBuffer, screenBuffer, width, cameraZ,
            resolutionDivisor, renderDistance, customFloorBuffers, customWallBuffers, reusableHighlightSet,
            flashlightActive, flashlightBatteryRatio, floorLightMaps
        );

        // 5. Passthrough Doors
        renderPassthroughDoors(
            x, passThroughDoors[x], passThroughWalls[x], doorBuffer, debugTextures, zBuffer, height, horizon,
            auxBuffers, customWallBuffers, lightMap, outdoorMap, lightningMap, mapWidth, mapHeight,
            lightningIntensity, muzzleFlashIntensity, activeFlashes, muzzleR, muzzleG, muzzleB,
            lightningR, lightningG, lightningB, posX, posY, screenBuffer, width, cameraZ,
            resolutionDivisor, grids, grid
        );
    }
    wallStats.ptMs += performance.now() - _l1;

    for (let x = 0; x < width; x++) {
        wallStats.passthrough += passThroughWalls[x].length;
    }
    
    return { zBuffer, passThroughDoors: [] };
};
