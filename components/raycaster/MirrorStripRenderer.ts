
import { RaycasterBuffer, adjustLightForClosedDoors } from './RaycasterUtils';
import { MirrorReflection } from './RaycasterTypes';
import { getBilinearFloorLight } from './MirrorRenderer';
import { getDepthFactor, getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { isWebGLActive, pushQuad, getQuadFromPool } from './WebGLState';

export const drawMirrorStrip = (
    x: number,
    drawStart: number,
    drawEnd: number,
    texPosFixed: number,
    stepFixed: number,
    texX: number,
    buf: RaycasterBuffer,
    maskBuf: RaycasterBuffer | null,
    screenBuffer: Uint32Array,
    width: number,
    height: number,
    horizon: number,
    mirrorReflections: MirrorReflection[][],
    perpWallDist: number,
    mirrorRefDist: number,
    mirrorHitX: number,
    mirrorHitY: number,
    refRayDirX: number,
    refRayDirY: number,
    precalcMirrorWalls: any[],
    auxBuffers: Map<string, RaycasterBuffer> | undefined,
    lightMap: { r: number; g: number; b: number }[][] | undefined,
    mapWidth: number,
    mapHeight: number,
    mirrorRefBuf: RaycasterBuffer | null,
    mirrorRefWallX: number,
    mirrorRefRMult: number,
    mirrorRefGMult: number,
    mirrorRefBMult: number,
    ceilingType: 'INDOOR' | 'OUTDOOR',
    skyBuffer: RaycasterBuffer | null,
    fov: number,
    posX: number,
    posY: number,
    dirX: number,
    dirY: number,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    activeFlashes: {x: number, y: number, intensity: number}[] | undefined,
    muzzleR: number, muzzleG: number, muzzleB: number,
    lightningR: number, lightningG: number, lightningB: number,
    floorBuffer: RaycasterBuffer | null,
    ceilingBuffer: RaycasterBuffer | null,
    customFloorBuffers: Map<number, RaycasterBuffer> | undefined,
    grid: any[][],
    rowDistances: Float32Array,
    rMultInt: number,
    gMultInt: number,
    bMultInt: number,
    fRInt: number,
    fGInt: number,
    fBInt: number,
    cameraZ: number,
    debugTextures: boolean,
    resolutionDivisor: number = 1,
    fogAmtInt: number = 0,
    activeGrids?: any[][][],
    refAbsTopZ: number = 1.0,
    refAbsBotZ: number = 0.0,
    refFogTable?: Int32Array,
    depthFogTable?: Int32Array,
    floorLightMaps?: { r: number; g: number; b: number }[][][],
    flashlightActive?: boolean
) => {
    const texW = buf.width;
    const texData = buf.data;
    const maskData = maskBuf?.data;
    const maskW = maskBuf?.width || 0;
    const maskH = maskBuf?.height || 0;
    const columnOffset = x;

    let glassRMultInt = rMultInt;
    let glassGMultInt = gMultInt;
    let glassBMultInt = bMultInt;

    const fogR = (getFogColorR() * fogAmtInt) >> 8;
    const fogG = (getFogColorG() * fogAmtInt) >> 8;
    const fogB = (getFogColorB() * fogAmtInt) >> 8;

    // Local cache for reflection floor loop
    let lastRefTileKey = -1;
    let lastRefBuf: RaycasterBuffer | null = null;
    let lastRefRMultInt = 256, lastRefGMultInt = 256, lastRefBMultInt = 256;
    let lastIsRefFloor = false;

    let currentTexPosFixed = texPosFixed;

    const mtx = maskData ? ((texX * maskW) / texW) | 0 : 0;
    const maskScaleY = maskH / buf.height;

    // Pre-calculate base wall reflection constants
    const totalRefDist = perpWallDist + mirrorRefDist;
    let refLineHeight = 0, refStepFixed = 0, refLevelDrawStart = 0, refTexX = 0;
    let mRRInt = 0, mRGInt = 0, mRBInt = 0;
    let refBufWidth = 0, refBufHeight = 0;
    let refBufData: Uint32Array | null = null;
    let refLevelDrawEnd = 0;
    
    if (mirrorRefBuf) {
        refBufWidth = mirrorRefBuf.width;
        refBufHeight = mirrorRefBuf.height;
        refBufData = mirrorRefBuf.data;
        
        refLineHeight = Math.max(1, height / totalRefDist);
        refStepFixed = ((refBufHeight << 16) / refLineHeight) | 0;
        refLevelDrawStart = Math.floor(horizon + refLineHeight * (cameraZ - refAbsTopZ));
        refLevelDrawEnd = Math.ceil(horizon + refLineHeight * (cameraZ - refAbsBotZ));
        refTexX = Math.floor(mirrorRefWallX * refBufWidth);
        if (refTexX >= refBufWidth) refTexX = refBufWidth - 1;
        if (refTexX < 0) refTexX = 0;
        
        mRRInt = (mirrorRefRMult * 256) | 0;
        mRGInt = (mirrorRefGMult * 256) | 0;
        mRBInt = (mirrorRefBMult * 256) | 0;
    }

    const colRefs = mirrorReflections[x];
    const colRef = colRefs && colRefs.length > 0 ? colRefs[colRefs.length - 1] : null;

    if (isWebGLActive) {
        if (colRef) {
            if (!maskData) {
                colRef.maskTop = drawStart;
                colRef.maskBottom = drawEnd - 1;
            } else {
                let currentTexPosFixed = texPosFixed;
                for (let y = drawStart; y < drawEnd; y++) {
                    const ty = (currentTexPosFixed >> 16) % buf.height; 
                    currentTexPosFixed += stepFixed;
                    
                    const mty = (ty * maskScaleY) | 0;
                    const maskColor = maskData[mty * maskW + mtx];
                    if ((maskColor & 0x00FFFFFF) === 0x0000FF00) {
                        if (y < colRef.maskTop) colRef.maskTop = y;
                        if (y > colRef.maskBottom) colRef.maskBottom = y;
                    }
                }
            }
        }
        
        // Push the wall quads for the mirror frame itself, avoiding the glass reflection area!
        let topDrawEnd = drawEnd;
        let bottomDrawStart = drawEnd;
        
        if (colRef && colRef.maskTop <= colRef.maskBottom) {
            topDrawEnd = colRef.maskTop;
            bottomDrawStart = colRef.maskBottom + 1;
        }

        const vAtY = (y: number) => {
            return ((texPosFixed + stepFixed * (y - drawStart)) / 65536.0) / buf.height;
        };

                if (topDrawEnd > drawStart) {
            const quad = getQuadFromPool();
            quad.x0 = x;
            quad.x1 = x + resolutionDivisor;
            quad.y0 = drawStart;
            quad.y1 = topDrawEnd;
            quad.u0 = texX / buf.width;
            quad.u1 = (texX + 1) / buf.width;
            quad.v0 = vAtY(drawStart);
            quad.v1 = vAtY(topDrawEnd);
            quad.r = (rMultInt + fRInt) / 256.0;
            quad.g = (gMultInt + fGInt) / 256.0;
            quad.b = (bMultInt + fBInt) / 256.0;
            quad.fog = fogAmtInt / 256.0;
            quad.textureId = (buf as any).id || 'wall';
            quad.dist = perpWallDist;
            pushQuad(quad);
        }

        if (drawEnd > bottomDrawStart) {
            const quad = getQuadFromPool();
            quad.x0 = x;
            quad.x1 = x + resolutionDivisor;
            quad.y0 = bottomDrawStart;
            quad.y1 = drawEnd;
            quad.u0 = texX / buf.width;
            quad.u1 = (texX + 1) / buf.width;
            quad.v0 = vAtY(bottomDrawStart);
            quad.v1 = vAtY(drawEnd);
            quad.r = (rMultInt + fRInt) / 256.0;
            quad.g = (gMultInt + fGInt) / 256.0;
            quad.b = (bMultInt + fBInt) / 256.0;
            quad.fog = fogAmtInt / 256.0;
            quad.textureId = (buf as any).id || 'wall';
            quad.dist = perpWallDist;
            pushQuad(quad);
        }

        // --- Push the Reflected Wall Geometry inside the Mirror Glass area ---
        if (mirrorRefBuf && colRef && colRef.maskTop <= colRef.maskBottom) {
            const refStart = Math.max(colRef.maskTop, refLevelDrawStart);
            const refEnd = Math.min(colRef.maskBottom + 1, refLevelDrawEnd);
            if (refEnd > refStart) {
                const quad = getQuadFromPool();
                quad.x0 = x;
                quad.x1 = x + resolutionDivisor;
                quad.y0 = refStart;
                quad.y1 = refEnd;
                quad.u0 = refTexX / mirrorRefBuf.width;
                quad.u1 = (refTexX + 1) / mirrorRefBuf.width;
                
                const vAtRefY = (y: number) => {
                    const t = (y - refLevelDrawStart) / (refLevelDrawEnd - refLevelDrawStart);
                    const z = refAbsTopZ + (refAbsBotZ - refAbsTopZ) * t;
                    return 1.0 - z;
                };
                
                quad.v0 = vAtRefY(refStart);
                quad.v1 = vAtRefY(refEnd);
                
                quad.r = ((mRRInt + fRInt) / 256.0) * ((glassRMultInt + fRInt) / 256.0);
                quad.g = ((mRGInt + fGInt) / 256.0) * ((glassGMultInt + fGInt) / 256.0);
                quad.b = ((mRBInt + fBInt) / 256.0) * ((glassBMultInt + fBInt) / 256.0);
                
                const distToP = totalRefDist;
                const refFogInt = refFogTable ? refFogTable[refStart] : ((Math.min(1.0, 1.0 / (1 + (distToP * distToP) * 0.005)) * 256) | 0);
                quad.fog = (256 - refFogInt) / 256.0;
                quad.textureId = (mirrorRefBuf as any).id || 'wall';
                
                // Mask the wall quad horizontally and vertically inside the mirror glass pane
                quad.maskTop = colRef.maskTop;
                quad.maskBottom = colRef.maskBottom;
                quad.dist = totalRefDist;
                pushQuad(quad);
            }
        }

        // --- Push Pass-Through and Upper-Layer Walls visible inside the Reflection ---
        for (let i = precalcMirrorWalls.length - 1; i >= 0; i--) {
            const pm = precalcMirrorWalls[i];
            if (colRef && colRef.maskTop <= colRef.maskBottom) {
                const pStart = Math.max(colRef.maskTop, pm.drawStart);
                const pEnd = Math.min(colRef.maskBottom + 1, pm.drawEnd);
                if (pEnd > pStart) {
                    if (pm.mp.isWindow) {
                        // Solid upper part of window frame
                        const cutoutTopStart = pStart;
                        const cutoutTopEnd = Math.min(pEnd, pm.screenCutoutTop);
                        if (cutoutTopEnd > cutoutTopStart) {
                            const quad = getQuadFromPool();
                            quad.x0 = x;
                            quad.x1 = x + resolutionDivisor;
                            quad.y0 = cutoutTopStart;
                            quad.y1 = cutoutTopEnd;
                            quad.u0 = pm.texX / pm.buf.width;
                            quad.u1 = (pm.texX + 1) / pm.buf.width;
                            
                            const vAtPmY = (y: number) => {
                                return (y - pm.drawStart) / (pm.drawEnd - pm.drawStart);
                            };
                            
                            quad.v0 = vAtPmY(cutoutTopStart);
                            quad.v1 = vAtPmY(cutoutTopEnd);
                            quad.r = ((pm.rMultInt + fRInt) / 256.0) * ((glassRMultInt + fRInt) / 256.0);
                            quad.g = ((pm.gMultInt + fGInt) / 256.0) * ((glassGMultInt + fGInt) / 256.0);
                            quad.b = ((pm.bMultInt + fBInt) / 256.0) * ((glassBMultInt + fBInt) / 256.0);
                            quad.fog = fogAmtInt / 256.0;
                            quad.textureId = (pm.buf as any).id || 'wall';
                            quad.maskTop = colRef.maskTop;
                            quad.maskBottom = colRef.maskBottom;
                            quad.dist = pm.mpTotalDist;
                            pushQuad(quad);
                        }
                        
                        // Solid lower part of window frame
                        const cutoutBotStart = Math.max(pStart, pm.screenCutoutBot);
                        const cutoutBotEnd = pEnd;
                        if (cutoutBotEnd > cutoutBotStart) {
                            const quad = getQuadFromPool();
                            quad.x0 = x;
                            quad.x1 = x + resolutionDivisor;
                            quad.y0 = cutoutBotStart;
                            quad.y1 = cutoutBotEnd;
                            quad.u0 = pm.texX / pm.buf.width;
                            quad.u1 = (pm.texX + 1) / pm.buf.width;
                            
                            const vAtPmY = (y: number) => {
                                return (y - pm.drawStart) / (pm.drawEnd - pm.drawStart);
                            };
                            
                            quad.v0 = vAtPmY(cutoutBotStart);
                            quad.v1 = vAtPmY(cutoutBotEnd);
                            quad.r = ((pm.rMultInt + fRInt) / 256.0) * ((glassRMultInt + fRInt) / 256.0);
                            quad.g = ((pm.gMultInt + fGInt) / 256.0) * ((glassGMultInt + fGInt) / 256.0);
                            quad.b = ((pm.bMultInt + fBInt) / 256.0) * ((glassBMultInt + fBInt) / 256.0);
                            quad.fog = fogAmtInt / 256.0;
                            quad.textureId = (pm.buf as any).id || 'wall';
                            quad.maskTop = colRef.maskTop;
                            quad.maskBottom = colRef.maskBottom;
                            quad.dist = pm.mpTotalDist;
                            pushQuad(quad);
                        }
                        
                        // Window Glass pane
                        if (pm.isGlass) {
                            const glassStart = Math.max(pStart, pm.gScreenTop);
                            const glassEnd = Math.min(pEnd, pm.gScreenBot);
                            if (glassEnd > glassStart && pm.glassBuf) {
                                const quad = getQuadFromPool();
                                quad.x0 = x;
                                quad.x1 = x + resolutionDivisor;
                                quad.y0 = glassStart;
                                quad.y1 = glassEnd;
                                quad.u0 = pm.glassTexX / pm.glassBuf.width;
                                quad.u1 = (pm.glassTexX + 1) / pm.glassBuf.width;
                                
                                const vAtGlassY = (y: number) => {
                                    return (y - pm.gScreenTop) * pm.invGlassRange;
                                };
                                
                                quad.v0 = vAtGlassY(glassStart);
                                quad.v1 = vAtGlassY(glassEnd);
                                
                                quad.r = ((pm.rMultInt + fRInt) / 256.0) * ((glassRMultInt + fRInt) / 256.0);
                                quad.g = ((pm.gMultInt + fGInt) / 256.0) * ((glassGMultInt + fGInt) / 256.0);
                                quad.b = ((pm.bMultInt + fBInt) / 256.0) * ((glassBMultInt + fBInt) / 256.0);
                                quad.fog = fogAmtInt / 256.0;
                                quad.textureId = (pm.glassBuf as any).id || 'wall';
                                quad.maskTop = colRef.maskTop;
                                quad.maskBottom = colRef.maskBottom;
                                quad.dist = pm.mpTotalDist;
                                pushQuad(quad);
                            }
                        }
                    } else {
                        // Regular upper-layer or pass-through wall
                        const quad = getQuadFromPool();
                        quad.x0 = x;
                        quad.x1 = x + resolutionDivisor;
                        quad.y0 = pStart;
                        quad.y1 = pEnd;
                        quad.u0 = pm.texX / pm.buf.width;
                        quad.u1 = (pm.texX + 1) / pm.buf.width;
                        
                        const vAtPmY = (y: number) => {
                            return (y - pm.drawStart) / (pm.drawEnd - pm.drawStart);
                        };
                        
                        quad.v0 = vAtPmY(pStart);
                        quad.v1 = vAtPmY(pEnd);
                        quad.r = ((pm.rMultInt + fRInt) / 256.0) * ((glassRMultInt + fRInt) / 256.0);
                        quad.g = ((pm.gMultInt + fGInt) / 256.0) * ((glassGMultInt + fGInt) / 256.0);
                        quad.b = ((pm.bMultInt + fBInt) / 256.0) * ((glassBMultInt + fBInt) / 256.0);
                        quad.fog = fogAmtInt / 256.0;
                        quad.textureId = (pm.buf as any).id || 'wall';
                        quad.maskTop = colRef.maskTop;
                        quad.maskBottom = colRef.maskBottom;
                        quad.dist = pm.mpTotalDist;
                        pushQuad(quad);
                    }
                }

                // Render Bottom Cap of Upper Wall (WebGL path)
                if (pm.bottomBuf && pm.capDrawStart < pm.capDrawEnd) {
                    let capStart = Math.max(colRef.maskTop, pm.capDrawStart);
                    let capEnd = Math.min(colRef.maskBottom + 1, pm.capDrawEnd);
                    
                    // Clip against all closer solid walls (j < i) in the same column to prevent showing through walls
                    for (let j = 0; j < i; j++) {
                        const closer = precalcMirrorWalls[j];
                        const isCloserSolid = !closer.mp.isWindow && !closer.mp.isMaskedDoor;
                        if (isCloserSolid) {
                            const cStart = closer.drawStart;
                            const cEnd = closer.drawEnd;
                            if (cStart <= capStart && cEnd >= capEnd) {
                                capStart = capEnd; // Completely hidden
                                break;
                            } else if (cStart <= capStart && cEnd > capStart) {
                                capStart = cEnd;
                            } else if (cStart < capEnd && cEnd >= capEnd) {
                                capEnd = cStart;
                            }
                        }
                    }

                    if (capEnd > capStart) {
                        const quad = getQuadFromPool();
                        quad.x0 = x;
                        quad.x1 = x + resolutionDivisor;
                        quad.y0 = capStart;
                        quad.y1 = capEnd;
                        quad.isBottomCap = true;
                        
                        const denomY0 = Math.max(0.001, horizon - capStart);
                        const layerDistToP0 = ((pm.mpLayer - (cameraZ || 0.5)) * height) / denomY0;
                        const weight0 = layerDistToP0 - perpWallDist;
                        const floorX0 = mirrorHitX + weight0 * refRayDirX;
                        const floorY0 = mirrorHitY + weight0 * refRayDirY;
                        let capU0 = floorX0 - Math.floor(floorX0);
                        let capV0 = floorY0 - Math.floor(floorY0);
                        if (capU0 < 0) capU0 += 1.0;
                        if (capV0 < 0) capV0 += 1.0;
                        
                        const denomY1 = Math.max(0.001, horizon - capEnd);
                        const layerDistToP1 = ((pm.mpLayer - (cameraZ || 0.5)) * height) / denomY1;
                        const weight1 = layerDistToP1 - perpWallDist;
                        const floorX1 = mirrorHitX + weight1 * refRayDirX;
                        const floorY1 = mirrorHitY + weight1 * refRayDirY;
                        let capU1 = floorX1 - Math.floor(floorX1);
                        let capV1 = floorY1 - Math.floor(floorY1);
                        if (capU1 < 0) capU1 += 1.0;
                        if (capV1 < 0) capV1 += 1.0;
                        
                        quad.u0 = capU0;
                        quad.u1 = capU1;
                        quad.v0 = capV0;
                        quad.v1 = capV1;
                        
                        const midY = (capStart + capEnd) >> 1;
                        const denomYMid = Math.max(0.001, horizon - midY);
                        const midDistToP = ((pm.mpLayer - (cameraZ || 0.5)) * height) / denomYMid;
                        const totalMidDist = perpWallDist + (midDistToP - perpWallDist);
                        
                        const activeLightMap = (floorLightMaps && pm.mpLayer !== undefined && floorLightMaps[pm.mpLayer]) ? floorLightMaps[pm.mpLayer] : lightMap;
                        
                        let r0Val = pm.bottomCapRMultIntBase / 256.0;
                        let g0Val = pm.bottomCapGMultIntBase / 256.0;
                        let b0Val = pm.bottomCapBMultIntBase / 256.0;
                        if (activeLightMap) {
                            const l0 = getBilinearFloorLight(floorX0, floorY0, activeLightMap, mapWidth, mapHeight);
                            r0Val = l0.r * 0.6;
                            g0Val = l0.g * 0.6;
                            b0Val = l0.b * 0.6;
                        }
                        
                        let r1Val = pm.bottomCapRMultIntBase / 256.0;
                        let g1Val = pm.bottomCapGMultIntBase / 256.0;
                        let b1Val = pm.bottomCapBMultIntBase / 256.0;
                        if (activeLightMap) {
                            const l1 = getBilinearFloorLight(floorX1, floorY1, activeLightMap, mapWidth, mapHeight);
                            r1Val = l1.r * 0.6;
                            g1Val = l1.g * 0.6;
                            b1Val = l1.b * 0.6;
                        }

                        const flashRVal = pm.pFlashR / 256.0;
                        const flashGVal = pm.pFlashG / 256.0;
                        const flashBVal = pm.pFlashB / 256.0;

                        const mRLight = (glassRMultInt + fRInt) / 256.0; const mGLight = (glassGMultInt + fGInt) / 256.0; const mBLight = (glassBMultInt + fBInt) / 256.0; quad.r0 = (r0Val + flashRVal) * mRLight;
                        quad.g0 = (g0Val + flashGVal) * mGLight;
                        quad.b0 = (b0Val + flashBVal) * mBLight;
                        
                        quad.r1 = (r1Val + flashRVal) * mRLight;
                        quad.g1 = (g1Val + flashGVal) * mGLight;
                        quad.b1 = (b1Val + flashBVal) * mBLight;

                        const fogAmt0 = (getDepthFactor(layerDistToP0) * 256) | 0;
                        const fogAmt1 = (getDepthFactor(layerDistToP1) * 256) | 0;
                        quad.fog0 = (256 - fogAmt0) / 256.0;
                        quad.fog1 = (256 - fogAmt1) / 256.0;

                        quad.r = ((r0Val + r1Val) / 2.0 + flashRVal) * mRLight;
                        quad.g = ((g0Val + g1Val) / 2.0 + flashGVal) * mGLight;
                        quad.b = ((b0Val + b1Val) / 2.0 + flashBVal) * mBLight;
                        quad.fog = (256 - ((fogAmt0 + fogAmt1) >> 1)) / 256.0;
                        quad.textureId = (pm.bottomBuf as any).id || 'wall';
                        quad.maskTop = colRef.maskTop;
                        quad.maskBottom = colRef.maskBottom;
                        quad.dist = totalMidDist;
                        pushQuad(quad);
                    }
                }
            }
        }
        return;
    }

    for (let y = drawStart; y < drawEnd; y++) {
        const ty = (currentTexPosFixed >> 16) % buf.height; 
        currentTexPosFixed += stepFixed;
        
        // Check Mask for Mirror
        let isMirrorPixel = false;
        if (maskData) {
            const mty = (ty * maskScaleY) | 0;
            const maskColor = maskData[mty * maskW + mtx];
            // Green color #00FF00 (ABGR: 0xFF00FF00)
            if ((maskColor & 0x00FFFFFF) === 0x0000FF00) {
                isMirrorPixel = true;
            }
        }
        
        if (isMirrorPixel) {
            if (colRef) {
                if (y < colRef.maskTop) colRef.maskTop = y;
                if (y > colRef.maskBottom) colRef.maskBottom = y;
            }

            const distToP = rowDistances[y];

            let currentR = 0;
            let currentG = 0;
            let currentB = 0;
            let hasBg = false;

            // Determine base reflected backdrop
            if (refBufData && y >= refLevelDrawStart && y < refLevelDrawEnd) {
                const texStartShift = (1.0 - refAbsTopZ) * refLineHeight;
                const refTexY = (((((y - refLevelDrawStart + texStartShift) * refStepFixed) >> 16) % refBufHeight) + refBufHeight) % refBufHeight;
                
                const refColor = refBufData[refTexY * refBufWidth + refTexX];
                let r = refColor & 0xFF; let g = (refColor >> 8) & 0xFF; let b = (refColor >> 16) & 0xFF;
                
                const totalRMult = mRRInt + fRInt;
                const totalGMult = mRGInt + fGInt;
                const totalBMult = mRBInt + fBInt;

                r = (r * totalRMult) >> 8; 
                g = (g * totalGMult) >> 8; 
                b = (b * totalBMult) >> 8;
                
                r += (fRInt >> 2);
                g += (fGInt >> 2);
                b += (fBInt >> 2);

                if (fRInt > 0 || fGInt > 0 || fBInt > 0) {
                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;
                }
                currentR = r;
                currentG = g;
                currentB = b;
                hasBg = true;
            }

            if (!hasBg) {
                const isRefFloor = y >= horizon;
                if (!isRefFloor && ceilingType === 'OUTDOOR' && skyBuffer) {
                    // SKYBOX REFLECTION
                    const skyW = skyBuffer.width;
                    const skyH = skyBuffer.height;
                    const focalLength = (width / 2) / fov; 
                    const pixelsPerRad = skyW / (2 * Math.PI);
                    const skyVScale = pixelsPerRad / focalLength;
                    
                    const centerX = mapWidth / 2;
                    const centerY = mapHeight / 2;
                    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
                    const skyRadius = maxDist + 2;
                    const skyRadiusSq = skyRadius * skyRadius;
                    
                    const ox = posX - centerX;
                    const oy = posY - centerY;
                    const a = refRayDirX * refRayDirX + refRayDirY * refRayDirY;
                    const b = 2 * (ox * refRayDirX + oy * refRayDirY);
                    const c = ox * ox + oy * oy - skyRadiusSq;
                    const discriminant = b * b - 4 * a * c;
                    
                    let rayAngleNorm = 0;
                    if (discriminant > 0) {
                        const t = (-b + Math.sqrt(discriminant)) / (2 * a);
                        const hitX = ox + t * refRayDirX;
                        const hitY = oy + t * refRayDirY;
                        const rayAngle = Math.atan2(hitY, hitX);
                        rayAngleNorm = (rayAngle + Math.PI) / (2 * Math.PI);
                    } else {
                        const rayAngle = Math.atan2(refRayDirY, refRayDirX);
                        rayAngleNorm = (rayAngle + Math.PI) / (2 * Math.PI);
                    }

                    let skyTexX = ((rayAngleNorm) * skyW) | 0;
                    skyTexX = (skyTexX % skyW + skyW) % skyW; 
                    const skyBaseY = (skyH / 2);
                    const distFromHorizon = horizon - y;
                    const skyTy = (skyBaseY - (distFromHorizon * skyVScale)) | 0;
                    
                    if (skyTy >= 0 && skyTy < skyH) {
                        let color = skyBuffer.data[skyTy * skyW + skyTexX];
                        let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
                        if (lightningIntensity > 0) {
                            const lIntR = (lightningIntensity * 200) | 0;
                            const lIntG = (lightningIntensity * 220) | 0;
                            const lIntB = (lightningIntensity * 255) | 0;
                            r = Math.min(255, r + lIntR);
                            g = Math.min(255, g + lIntG);
                            b = Math.min(255, b + lIntB);
                        }
                        currentR = r;
                        currentG = g;
                        currentB = b;
                    } else {
                        currentR = 0;
                        currentG = 0;
                        currentB = 0;
                    }
                } else {
                    // FLOOR/CEILING REFLECTION
                    const refFloorX = mirrorHitX + refRayDirX * (distToP - perpWallDist);
                    const refFloorY = mirrorHitY + refRayDirY * (distToP - perpWallDist);
                    
                    const rfX = Math.floor(refFloorX);
                    const rfY = Math.floor(refFloorY);
                    const currentRefTileKey = rfY * 10000 + rfX;

                    if (currentRefTileKey !== lastRefTileKey || isRefFloor !== lastIsRefFloor) {
                        lastRefTileKey = currentRefTileKey;
                        lastIsRefFloor = isRefFloor;
                        
                        let refBuf = isRefFloor ? floorBuffer : ceilingBuffer;
                        
                        if (isRefFloor && rfY >= 0 && rfY < mapHeight && rfX >= 0 && rfX < mapWidth) {
                            const tile = grid[rfY]?.[rfX];
                            if (debugTextures && tile && tile.assetId && auxBuffers && auxBuffers.has(tile.assetId)) {
                                refBuf = auxBuffers.get(tile.assetId)!;
                            }
                        }
                        
                        if (debugTextures && isRefFloor && customFloorBuffers) {
                            const decalKey = (rfY * 10000 + rfX) * 10 + 4;
                            const custom = customFloorBuffers.get(decalKey);
                            if (custom) refBuf = custom;
                        }
                        lastRefBuf = refBuf;

                        let rMultInt = 256, gMultInt = 256, bMultInt = 256;
                        if (lightMap) {
                            const l = getBilinearFloorLight(refFloorX, refFloorY, lightMap, mapWidth, mapHeight);
                            rMultInt = (l.r * 256) | 0; 
                            gMultInt = (l.g * 256) | 0; 
                            bMultInt = (l.b * 256) | 0;
                        }
                        if (!isRefFloor) { 
                            rMultInt = (rMultInt * 204) >> 8; 
                            gMultInt = (gMultInt * 204) >> 8; 
                            bMultInt = (bMultInt * 204) >> 8; 
                        }
                        lastRefRMultInt = rMultInt; lastRefGMultInt = gMultInt; lastRefBMultInt = bMultInt;
                    }

                    if (lastRefBuf) {
                        let tx = Math.floor(refFloorX * lastRefBuf.width) % lastRefBuf.width;
                        let ty = Math.floor(refFloorY * lastRefBuf.height) % lastRefBuf.height;
                        if (tx < 0) tx += lastRefBuf.width; if (ty < 0) ty += lastRefBuf.height;
                        const color = lastRefBuf.data[ty * lastRefBuf.width + tx];
                        let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
                        
                        const refFogInt = refFogTable ? refFogTable[y] : ((Math.min(1.0, 1.0 / (1 + (distToP * distToP) * 0.005)) * 256) | 0);
                        const finalRMultInt = (lastRefRMultInt * refFogInt) >> 8;
                        const finalGMultInt = (lastRefGMultInt * refFogInt) >> 8;
                        const finalBMultInt = (lastRefBMultInt * refFogInt) >> 8;

                        r = (r * finalRMultInt) >> 8; 
                        g = (g * finalGMultInt) >> 8; 
                        b = (b * finalBMultInt) >> 8;
                        
                        if (lightningIntensity > 0) {
                            r = Math.min(255, r + ((lightningIntensity * 150) | 0));
                            g = Math.min(255, g + ((lightningIntensity * 160) | 0));
                            b = Math.min(255, b + ((lightningIntensity * 200) | 0));
                        }
                        currentR = r;
                        currentG = g;
                        currentB = b;
                    } else {
                        if (isRefFloor) {
                            currentR = 26;
                            currentG = 26;
                            currentB = 26;
                        } else {
                            currentR = 0;
                            currentG = 0;
                            currentB = 0;
                        }
                    }
                }
            }

            // Render any overlapping pass-through or upper-layer walls from back to front
            for (let i = precalcMirrorWalls.length - 1; i >= 0; i--) {
                const pm = precalcMirrorWalls[i];

                if (y >= pm.drawStart && y < pm.drawEnd) {
                    if (pm.mp.isWindow) {
                        const screenCutoutTop = pm.screenCutoutTop;
                        const screenCutoutBot = pm.screenCutoutBot;

                        if (y >= screenCutoutTop && y < screenCutoutBot) {
                            // Inside Cutout Hole
                            const isGlass = pm.isGlass;
                            if (isGlass) {
                                let glassBuf = pm.glassBuf;

                                let glassTexX = pm.glassTexX;
                                let gScreenTop = pm.gScreenTop;
                                let gScreenBot = pm.gScreenBot;

                                if (y >= gScreenTop && y < gScreenBot) {
                                    let gTexY = 0;
                                    if (glassBuf && (gScreenBot > gScreenTop)) {
                                        gTexY = Math.floor((y - gScreenTop) * pm.invGlassRange * glassBuf.height);
                                        if (gTexY < 0) gTexY = 0;
                                        if (gTexY >= glassBuf.height) gTexY = glassBuf.height - 1;
                                    }

                                    let glassColor = (glassBuf ? glassBuf.data[gTexY * glassBuf.width + glassTexX] : 0x40FFAA55);
                                    let gr = glassColor & 0xFF;
                                    let gg = (glassColor >> 8) & 0xFF;
                                    let gb = (glassColor >> 16) & 0xFF;
                                    let ga = glassBuf ? ((glassColor >> 24) & 0xFF) : 80;

                                    let glassAlphaMultFinal = (ga / 255.0) * pm.glassAlphaMult;
                                    let grMult = pm.rMultInt + fRInt;
                                    let ggMult = pm.gMultInt + fGInt;
                                    let gbMult = pm.bMultInt + fBInt;
                                    gr = (gr * grMult) >> 8;
                                    gg = (gg * ggMult) >> 8;
                                    gb = (gb * gbMult) >> 8;
                                    
                                    currentR = (gr * glassAlphaMultFinal + currentR * (1.0 - glassAlphaMultFinal)) | 0;
                                    currentG = (gg * glassAlphaMultFinal + currentG * (1.0 - glassAlphaMultFinal)) | 0;
                                    currentB = (gb * glassAlphaMultFinal + currentB * (1.0 - glassAlphaMultFinal)) | 0;
                                }
                            }
                        } else {
                            // Render Solid Frame part of Window
                            const mpBuf = pm.buf;
                            const mpTexY = (((y - pm.drawStart) * pm.stepFixed) >> 16) % mpBuf.height;
                            const color = mpBuf.data[mpTexY * mpBuf.width + pm.texX];
                            const alpha = (color >> 24) & 0xFF;
                            if (alpha > 0) {
                                let r = color & 0xFF;
                                let g = (color >> 8) & 0xFF;
                                let b = (color >> 16) & 0xFF;
                                
                                const totalRMult = pm.rMultInt + fRInt;
                                const totalGMult = pm.gMultInt + fGInt;
                                const totalBMult = pm.bMultInt + fBInt;

                                r = (r * totalRMult) >> 8; 
                                g = (g * totalGMult) >> 8; 
                                b = (b * totalBMult) >> 8;
                                
                                r += (fRInt >> 2);
                                g += (fGInt >> 2);
                                b += (fBInt >> 2);

                                if (fRInt > 0 || fGInt > 0 || fBInt > 0) {
                                    if (r > 255) r = 255;
                                    if (g > 255) g = 255;
                                    if (b > 255) b = 255;
                                }

                                if (alpha === 255) {
                                    currentR = r;
                                    currentG = g;
                                    currentB = b;
                                } else {
                                    const aNorm = alpha / 255.0;
                                    currentR = (r * aNorm + currentR * (1.0 - aNorm)) | 0;
                                    currentG = (g * aNorm + currentG * (1.0 - aNorm)) | 0;
                                    currentB = (b * aNorm + currentB * (1.0 - aNorm)) | 0;
                                }
                            }
                        }
                    } else {
                        // Render Regular Wall/Door of layered pass-through
                        const mpBuf = pm.buf;
                        const mpTexY = (((y - pm.drawStart) * pm.stepFixed) >> 16) % mpBuf.height;
                        
                        let isMaskTransparent = false;
                        if (pm.mp.isMaskedDoor && pm.maskBuf) {
                            const maskH = pm.maskBuf.height;
                            const maskW = pm.maskBuf.width;
                            const mty = (mpTexY * (maskH / pm.buf.height)) | 0;
                            const mtx = Math.floor(pm.texX * (maskW / pm.buf.width));
                            const mIndex = mty * maskW + mtx;
                            if (mIndex >= 0 && mIndex < pm.maskBuf.data.length) {
                                const maskCol = pm.maskBuf.data[mIndex];
                                if ((maskCol & 0x00FFFFFF) === 0x0000FF00) {
                                    isMaskTransparent = true;
                                }
                            }
                        }

                        if (!isMaskTransparent) {
                            const color = mpBuf.data[mpTexY * mpBuf.width + pm.texX];
                            const alpha = (color >> 24) & 0xFF;
                            if (alpha > 0) {
                                let r = color & 0xFF;
                                let g = (color >> 8) & 0xFF;
                                let b = (color >> 16) & 0xFF;
                                
                                const totalRMult = pm.rMultInt + fRInt;
                                const totalGMult = pm.gMultInt + fGInt;
                                const totalBMult = pm.bMultInt + fBInt;

                                r = (r * totalRMult) >> 8; 
                                g = (g * totalGMult) >> 8; 
                                b = (b * totalBMult) >> 8;
                                
                                r += (fRInt >> 2);
                                g += (fGInt >> 2);
                                b += (fBInt >> 2);

                                if (fRInt > 0 || fGInt > 0 || fBInt > 0) {
                                    if (r > 255) r = 255;
                                    if (g > 255) g = 255;
                                    if (b > 255) b = 255;
                                }

                                let doorAlpha = alpha;
                                if (pm.mp.isMaskedDoor && pm.mp.isBroken) {
                                    doorAlpha = (doorAlpha * 0.4) | 0;
                                }

                                if (doorAlpha === 255) {
                                    currentR = r;
                                    currentG = g;
                                    currentB = b;
                                } else {
                                    const aNorm = doorAlpha / 255.0;
                                    currentR = (r * aNorm + currentR * (1.0 - aNorm)) | 0;
                                    currentG = (g * aNorm + currentG * (1.0 - aNorm)) | 0;
                                    currentB = (b * aNorm + currentB * (1.0 - aNorm)) | 0;
                                }
                            }
                        }
                    }
                }

                // Render Bottom Cap of Upper Wall
                if (y >= pm.capDrawStart && y < pm.capDrawEnd) {
                    const bottomBuf = pm.bottomBuf;
                    if (bottomBuf) {
                        const layerDistToP = ((pm.mpLayer - (cameraZ || 0.5)) * height) / (horizon - y);
                        const capW = bottomBuf.width;
                        const capH = bottomBuf.height;
                        
                        const weight = layerDistToP - perpWallDist; 
                        const currentFloorX = mirrorHitX + weight * refRayDirX;
                        const currentFloorY = mirrorHitY + weight * refRayDirY;
                        
                        const tx = Math.floor(currentFloorX * capW) % capW;
                        const ty = Math.floor(currentFloorY * capH) % capH;
                        const ftx = (tx + capW) % capW;
                        const fty = (ty + capH) % capH;
                        
                        const color = bottomBuf.data[fty * capW + ftx];
                        let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
                        
                        const distFogInt = depthFogTable ? depthFogTable[y] : ((getDepthFactor(distToP) * 256) | 0);
                        let rMultInt = 256;
                        let gMultInt = 256;
                        let bMultInt = 256;
                        const activeLightMap = (floorLightMaps && pm.mpLayer !== undefined && floorLightMaps[pm.mpLayer]) ? floorLightMaps[pm.mpLayer] : lightMap;
                        if (activeLightMap) {
                            const l = getBilinearFloorLight(currentFloorX, currentFloorY, activeLightMap, mapWidth, mapHeight);
                            const capR = ((l.r * 256 * 153) >> 8) | 0;
                            const capG = ((l.g * 256 * 153) >> 8) | 0;
                            const capB = ((l.b * 256 * 153) >> 8) | 0;
                            rMultInt = (capR * distFogInt) >> 8;
                            gMultInt = (capG * distFogInt) >> 8;
                            bMultInt = (capB * distFogInt) >> 8;
                        } else {
                            rMultInt = (pm.bottomCapRMultIntBase * distFogInt) >> 8;
                            gMultInt = (pm.bottomCapGMultIntBase * distFogInt) >> 8;
                            bMultInt = (pm.bottomCapBMultIntBase * distFogInt) >> 8;
                        } 
                        
                        const totalRMult = rMultInt + pm.pFlashR;
                        const totalGMult = gMultInt + pm.pFlashG;
                        const totalBMult = bMultInt + pm.pFlashB;

                        r = (r * totalRMult) >> 8; 
                        g = (g * totalGMult) >> 8; 
                        b = (b * totalBMult) >> 8;
                        
                        r += (pm.pFlashR >> 2);
                        g += (pm.pFlashG >> 2);
                        b += (pm.pFlashB >> 2);

                        if (pm.pFlashR > 0 || pm.pFlashG > 0 || pm.pFlashB > 0) {
                            if (r > 255) r = 255;
                            if (g > 255) g = 255;
                            if (b > 255) b = 255;
                        }

                        currentR = r;
                        currentG = g;
                        currentB = b;
                    }
                }
            }

            // Apply mirror wall lighting to make mirrors dark in dark rooms and bright in bright rooms
            const totalRMult = glassRMultInt + fRInt;
            const totalGMult = glassGMultInt + fGInt;
            const totalBMult = glassBMultInt + fBInt;

            currentR = (currentR * totalRMult) >> 8;
            currentG = (currentG * totalGMult) >> 8;
            currentB = (currentB * totalBMult) >> 8;

            if (currentR > 255) currentR = 255;
            if (currentG > 255) currentG = 255;
            if (currentB > 255) currentB = 255;

            const finalColor = (255 << 24) | (currentB << 16) | (currentG << 8) | currentR;
            screenBuffer[y * width + columnOffset] = finalColor;
            for (let d = 1; d < resolutionDivisor; d++) {
                if (columnOffset + d < width) screenBuffer[y * width + (columnOffset + d)] = finalColor;
            }

            continue;
        }

        // Render Normal Wall Pixel (if not masked)
        const color = texData[(ty * texW + texX) | 0];
        const alpha = (color >> 24) & 0xFF;

        if (alpha < 255) {
            const bgVal = screenBuffer[y * width + columnOffset];
            const bgR = bgVal & 0xFF; const bgG = (bgVal >> 8) & 0xFF; const bgB = (bgVal >> 16) & 0xFF;
            let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
            
            // Integer Lighting
            const totalRMult = rMultInt + fRInt;
            const totalGMult = gMultInt + fGInt;
            const totalBMult = bMultInt + fBInt;

            r = (r * totalRMult) >> 8; 
            g = (g * totalGMult) >> 8; 
            b = (b * totalBMult) >> 8;
            
            r += (fRInt >> 2) + fogR;
            g += (fGInt >> 2) + fogG;
            b += (fBInt >> 2) + fogB;

            r = Math.min(255, r);
            g = Math.min(255, g);
            b = Math.min(255, b);

            const invA = 255 - alpha;
            r = (r * alpha + bgR * invA) >> 8; g = (g * alpha + bgG * invA) >> 8; b = (b * alpha + bgB * invA) >> 8;
            const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
            screenBuffer[y * width + columnOffset] = finalColor;
            for (let d = 1; d < resolutionDivisor; d++) {
                if (columnOffset + d < width) screenBuffer[y * width + (columnOffset + d)] = finalColor;
            }
        } else {
            let r = color & 0xFF; let g = (color >> 8) & 0xFF; let b = (color >> 16) & 0xFF;
            
            // Integer Lighting
            const totalRMult = rMultInt + fRInt;
            const totalGMult = gMultInt + fGInt;
            const totalBMult = bMultInt + fBInt;

            r = (r * totalRMult) >> 8; 
            g = (g * totalGMult) >> 8; 
            b = (b * totalBMult) >> 8;
            
            r += (fRInt >> 2) + fogR;
            g += (fGInt >> 2) + fogG;
            b += (fBInt >> 2) + fogB;

            r = Math.min(255, r);
            g = Math.min(255, g);
            b = Math.min(255, b);

            const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
            screenBuffer[y * width + columnOffset] = finalColor;
            for (let d = 1; d < resolutionDivisor; d++) {
                if (columnOffset + d < width) screenBuffer[y * width + (columnOffset + d)] = finalColor;
            }
        }
    }
};
