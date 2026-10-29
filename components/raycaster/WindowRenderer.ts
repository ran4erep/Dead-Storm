import { PassThroughWall } from './RaycasterTypes';
import { RaycasterBuffer } from './RaycasterUtils';
import { getDepthFactor, isFogWeather, getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { isWebGLActive } from './WebGLState';

/**
 * NEW VOLUMETRIC WINDOW RENDERER
 * 
 * Separated 3D window occlusion, cheek mapping and rendering engine.
 * Ensures sprites and depth geometry are perfectly occluded, and renders
 * volumetric 3D tunnel-like cheeks/opening (left, right, head/ceiling, sill/floor) 
 * for correct perspective looking through window openings.
 */

export interface RenderWindowParams {
    x: number;
    pt: PassThroughWall;
    currentWallBuf: RaycasterBuffer;
    texX: number;
    levelDrawStart: number;
    levelDrawEnd: number;
    drawStart: number;
    drawEnd: number;
    texStartShift: number;
    lh: number;
    rMultInt: number;
    gMultInt: number;
    bMultInt: number;
    fRInt: number;
    fGInt: number;
    fBInt: number;
    distFogInt: number;
    screenBuffer: Uint32Array;
    width: number;
    height: number;
    horizon: number;
    resolutionDivisor: number;
    zBuffer: Float32Array;
    cameraZ: number;
    posX: number;
    posY: number;
    rayDirX: number;
    rayDirY: number;
    upperTile: any;
    auxBuffers?: Map<string, RaycasterBuffer>;
    passThroughWallsCol?: PassThroughWall[];
}

export interface Span {
    start: number;
    end: number;
}

export function getUnoccludedSpans(
    startY: number,
    endY: number,
    passThroughWallsCol: PassThroughWall[] | undefined,
    windowDist: number,
    ignorePolyOccluders: boolean = false
): Span[] {
    if (startY >= endY) return [];
    let spans: Span[] = [{ start: startY, end: endY }];
    if (!passThroughWallsCol || passThroughWallsCol.length === 0) return spans;

    for (let i = 0; i < passThroughWallsCol.length; i++) {
        const w = passThroughWallsCol[i];
        const skip = w.isPolyOccluder && ignorePolyOccluders;
        if (w.isOccluderOnly && !skip && w.dist < windowDist - 0.001) {
            let clipStart = w.wallTop !== undefined ? w.wallTop : 0;
            let clipEnd = w.wallBottom !== undefined ? w.wallBottom : 0;
            if (clipStart >= clipEnd) continue;

            if (w.isPolyOccluder) {
                const h = clipEnd - clipStart;
                if (h > 4) {
                    const shrink = Math.min(Math.floor(h * 0.04) + 1, 3);
                    clipStart += shrink;
                    clipEnd -= shrink;
                }
            }

            const nextSpans: Span[] = [];
            for (let s = 0; s < spans.length; s++) {
                const sp = spans[s];
                if (clipEnd <= sp.start || clipStart >= sp.end) {
                    nextSpans.push(sp);
                } else {
                    if (clipStart > sp.start) {
                        nextSpans.push({ start: sp.start, end: clipStart });
                    }
                    if (clipEnd < sp.end) {
                        nextSpans.push({ start: clipEnd, end: sp.end });
                    }
                }
            }
            spans = nextSpans;
            if (spans.length === 0) break;
        }
    }
    return spans;
}

// Draw an individual part of a window block
export function drawWindowPart(
    x: number,
    startY: number,
    endY: number,
    pt: PassThroughWall,
    buf: RaycasterBuffer,
    texX: number,
    levelDrawStart: number,
    texStartShift: number,
    lineHeight: number,
    rMultInt: number,
    gMultInt: number,
    bMultInt: number,
    fRInt: number,
    fGInt: number,
    fBInt: number,
    distFogInt: number,
    alphaMultiplier: number,
    screenBuffer: Uint32Array,
    width: number,
    resolutionDivisor: number
) {
    if (startY >= endY) return;

    const stepFixed = ((buf.height << 16) / lineHeight) | 0;
    let texPosFixed = ((startY - levelDrawStart + texStartShift) * stepFixed) | 0;

    const fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
    const fogR = (getFogColorR() * fogAmtInt) >> 8;
    const fogG = (getFogColorG() * fogAmtInt) >> 8;
    const fogB = (getFogColorB() * fogAmtInt) >> 8;

    const hasFlash = fRInt > 0 || fGInt > 0 || fBInt > 0 || fogAmtInt > 0;
    const texData = buf.data;
    const texW = buf.width;
    const bufH = buf.height;
    const a1 = alphaMultiplier;
    const invA1 = 1.0 - a1;

    const hasAlpha = alphaMultiplier < 1.0;
    const a1_int = (alphaMultiplier * 256) | 0;
    const invA1_int = 256 - a1_int;

    // Limit resolution divisor replication to viewport width boundaries
    const maxD = Math.min(resolutionDivisor, width - x);

    // Loop unswitching prevents expensive branch evaluation inside the pixel loop
    if (hasFlash) {
        if (hasAlpha) {
            if (isWebGLActive) {
                let screenIdx = startY * width + x;
                for (let y = startY; y < endY; y++) {
                    let ty = (texPosFixed >> 16) % bufH;
                    if (ty < 0) ty += bufH;
                    texPosFixed += stepFixed;

                    const color = texData[(ty * texW + texX) | 0];
                    const a = (color >> 24) & 0xFF;
                    if (a === 0) {
                        screenIdx += width;
                        continue;
                    }

                    let r = color & 0xFF;
                    let g = (color >> 8) & 0xFF;
                    let b = (color >> 16) & 0xFF;

                    const totalRMult = rMultInt + fRInt;
                    const totalGMult = gMultInt + fGInt;
                    const totalBMult = bMultInt + fBInt;

                    r = (r * totalRMult) >> 8;
                    g = (g * totalGMult) >> 8;
                    b = (b * totalBMult) >> 8;

                    r += (fRInt >> 2) + fogR;
                    g += (fGInt >> 2) + fogG;
                    b += (fBInt >> 2) + fogB;

                    r = r > 255 ? 255 : r;
                    g = g > 255 ? 255 : g;
                    b = b > 255 ? 255 : b;

                    const oldColor = screenBuffer[screenIdx];
                    const oldAlphaByte = (oldColor >> 24) & 0xFF;
                    if (oldAlphaByte > 0) {
                        const oldR = oldColor & 0xFF;
                        const oldG = (oldColor >> 8) & 0xFF;
                        const oldB = (oldColor >> 16) & 0xFF;

                        const a2 = oldAlphaByte / 255.0;
                        const a_out = a1 + a2 * invA1;

                        const r_out = ((r * a1) + (oldR * a2 * invA1)) / a_out;
                        const g_out = ((g * a1) + (oldG * a2 * invA1)) / a_out;
                        const b_out = ((b * a1) + (oldB * a2 * invA1)) / a_out;

                        r = r_out | 0;
                        g = g_out | 0;
                        b = b_out | 0;

                        const finalAlphaByte = (a_out * 255.0) | 0;
                        const finalColor = (finalAlphaByte << 24) | (b << 16) | (g << 8) | r;

                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    } else {
                        const alphaValue = (a1 * 255.0) | 0;
                        const finalColor = (alphaValue << 24) | (b << 16) | (g << 8) | r;
                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    }
                    screenIdx += width;
                }
            } else {
                let screenIdx = startY * width + x;
                for (let y = startY; y < endY; y++) {
                    let ty = (texPosFixed >> 16) % bufH;
                    if (ty < 0) ty += bufH;
                    texPosFixed += stepFixed;

                    const color = texData[(ty * texW + texX) | 0];
                    const a = (color >> 24) & 0xFF;
                    if (a === 0) {
                        screenIdx += width;
                        continue;
                    }

                    let r = color & 0xFF;
                    let g = (color >> 8) & 0xFF;
                    let b = (color >> 16) & 0xFF;

                    const totalRMult = rMultInt + fRInt;
                    const totalGMult = gMultInt + fGInt;
                    const totalBMult = bMultInt + fBInt;

                    r = (r * totalRMult) >> 8;
                    g = (g * totalGMult) >> 8;
                    b = (b * totalBMult) >> 8;

                    r += (fRInt >> 2) + fogR;
                    g += (fGInt >> 2) + fogG;
                    b += (fBInt >> 2) + fogB;

                    r = r > 255 ? 255 : r;
                    g = g > 255 ? 255 : g;
                    b = b > 255 ? 255 : b;

                    const oldColor = screenBuffer[screenIdx];
                    const oldR = oldColor & 0xFF;
                    const oldG = (oldColor >> 8) & 0xFF;
                    const oldB = (oldColor >> 16) & 0xFF;

                    r = ((r * a1_int) + (oldR * invA1_int)) >> 8;
                    g = ((g * a1_int) + (oldG * invA1_int)) >> 8;
                    b = ((b * a1_int) + (oldB * invA1_int)) >> 8;

                    const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                    screenBuffer[screenIdx] = finalColor;
                    for (let d = 1; d < maxD; d++) {
                        screenBuffer[screenIdx + d] = finalColor;
                    }
                    screenIdx += width;
                }
            }
        } else {
            let screenIdx = startY * width + x;
            for (let y = startY; y < endY; y++) {
                let ty = (texPosFixed >> 16) % bufH;
                if (ty < 0) ty += bufH;
                texPosFixed += stepFixed;

                const color = texData[(ty * texW + texX) | 0];
                const a = (color >> 24) & 0xFF;
                if (a === 0) {
                    screenIdx += width;
                    continue;
                }

                let r = color & 0xFF;
                let g = (color >> 8) & 0xFF;
                let b = (color >> 16) & 0xFF;

                const totalRMult = rMultInt + fRInt;
                const totalGMult = gMultInt + fGInt;
                const totalBMult = bMultInt + fBInt;

                r = (r * totalRMult) >> 8;
                g = (g * totalGMult) >> 8;
                b = (b * totalBMult) >> 8;

                r += (fRInt >> 2) + fogR;
                g += (fGInt >> 2) + fogG;
                b += (fBInt >> 2) + fogB;

                r = r > 255 ? 255 : r;
                g = g > 255 ? 255 : g;
                b = b > 255 ? 255 : b;

                const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                screenBuffer[screenIdx] = finalColor;
                for (let d = 1; d < maxD; d++) {
                    screenBuffer[screenIdx + d] = finalColor;
                }
                screenIdx += width;
            }
        }
    } else {
        if (hasAlpha) {
            if (isWebGLActive) {
                let screenIdx = startY * width + x;
                for (let y = startY; y < endY; y++) {
                    let ty = (texPosFixed >> 16) % bufH;
                    if (ty < 0) ty += bufH;
                    texPosFixed += stepFixed;

                    const color = texData[(ty * texW + texX) | 0];
                    const a = (color >> 24) & 0xFF;
                    if (a === 0) {
                        screenIdx += width;
                        continue;
                    }

                    let r = color & 0xFF;
                    let g = (color >> 8) & 0xFF;
                    let b = (color >> 16) & 0xFF;

                    r = (r * rMultInt) >> 8;
                    g = (g * gMultInt) >> 8;
                    b = (b * bMultInt) >> 8;

                    const oldColor = screenBuffer[screenIdx];
                    const oldAlphaByte = (oldColor >> 24) & 0xFF;
                    if (oldAlphaByte > 0) {
                        const oldR = oldColor & 0xFF;
                        const oldG = (oldColor >> 8) & 0xFF;
                        const oldB = (oldColor >> 16) & 0xFF;

                        const a2 = oldAlphaByte / 255.0;
                        const a_out = a1 + a2 * invA1;

                        const r_out = ((r * a1) + (oldR * a2 * invA1)) / a_out;
                        const g_out = ((g * a1) + (oldG * a2 * invA1)) / a_out;
                        const b_out = ((b * a1) + (oldB * a2 * invA1)) / a_out;

                        r = r_out | 0;
                        g = g_out | 0;
                        b = b_out | 0;

                        const finalAlphaByte = (a_out * 255.0) | 0;
                        const finalColor = (finalAlphaByte << 24) | (b << 16) | (g << 8) | r;

                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    } else {
                        const alphaValue = (a1 * 255.0) | 0;
                        const finalColor = (alphaValue << 24) | (b << 16) | (g << 8) | r;
                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    }
                    screenIdx += width;
                }
            } else {
                let screenIdx = startY * width + x;
                for (let y = startY; y < endY; y++) {
                    let ty = (texPosFixed >> 16) % bufH;
                    if (ty < 0) ty += bufH;
                    texPosFixed += stepFixed;

                    const color = texData[(ty * texW + texX) | 0];
                    const a = (color >> 24) & 0xFF;
                    if (a === 0) {
                        screenIdx += width;
                        continue;
                    }

                    let r = color & 0xFF;
                    let g = (color >> 8) & 0xFF;
                    let b = (color >> 16) & 0xFF;

                    r = (r * rMultInt) >> 8;
                    g = (g * gMultInt) >> 8;
                    b = (b * bMultInt) >> 8;

                    const oldColor = screenBuffer[screenIdx];
                    const oldR = oldColor & 0xFF;
                    const oldG = (oldColor >> 8) & 0xFF;
                    const oldB = (oldColor >> 16) & 0xFF;

                    r = ((r * a1_int) + (oldR * invA1_int)) >> 8;
                    g = ((g * a1_int) + (oldG * invA1_int)) >> 8;
                    b = ((b * a1_int) + (oldB * invA1_int)) >> 8;

                    const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                    screenBuffer[screenIdx] = finalColor;
                    for (let d = 1; d < maxD; d++) {
                        screenBuffer[screenIdx + d] = finalColor;
                    }
                    screenIdx += width;
                }
            }
        } else {
            let screenIdx = startY * width + x;
            for (let y = startY; y < endY; y++) {
                let ty = (texPosFixed >> 16) % bufH;
                if (ty < 0) ty += bufH;
                texPosFixed += stepFixed;

                const color = texData[(ty * texW + texX) | 0];
                const a = (color >> 24) & 0xFF;
                if (a === 0) {
                    screenIdx += width;
                    continue;
                }

                let r = color & 0xFF;
                let g = (color >> 8) & 0xFF;
                let b = (color >> 16) & 0xFF;

                r = (r * rMultInt) >> 8;
                g = (g * gMultInt) >> 8;
                b = (b * bMultInt) >> 8;

                const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                screenBuffer[screenIdx] = finalColor;
                for (let d = 1; d < maxD; d++) {
                    screenBuffer[screenIdx + d] = finalColor;
                }
                screenIdx += width;
            }
        }
    }
}

export function renderWindowSegment({
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
    passThroughWallsCol
}: RenderWindowParams) {
    const cutout = upperTile.cutout || { topLeft: { x: 0.25, y: 0.25 }, bottomRight: { x: 0.75, y: 0.75 } };
    const cutoutLeft = cutout.topLeft.x;
    const cutoutRight = cutout.bottomRight.x;
    const cutoutTop = cutout.topLeft.y;
    const cutoutBottom = cutout.bottomRight.y;

    let isCutoutCol = true;
    const cAxis = upperTile.cutoutAxis || 'NS';
    if (cAxis === 'NS' && pt.side !== 1) isCutoutCol = false;
    if (cAxis === 'WE' && pt.side !== 0) isCutoutCol = false;

    if (isCutoutCol) {
        let texX_norm = currentWallBuf.width > 0 ? (texX / currentWallBuf.width) : 0;
        if (texX_norm < cutoutLeft || texX_norm > cutoutRight) {
            isCutoutCol = false;
        }
    }

    pt.isCutoutColumn = isCutoutCol;

    // Compute the unoccluded spans ONCE for the whole column. Every later part
    // (top/bottom frame, head/sill cheeks, glass) clips against these spans,
    // which is pixel-identical to calling getUnoccludedSpans per part but
    // avoids repeated full passes + allocations per window.
    const fullSpans = getUnoccludedSpans(0, height, passThroughWallsCol, pt.dist);

    const drawWindowPartClipped = (
        partStart: number,
        partEnd: number,
        buf: RaycasterBuffer,
        texXVal: number,
        levelDS: number,
        texShift: number,
        lhVal: number,
        alphaMult: number
    ) => {
        if (partStart >= partEnd) return;
        for (let si = 0; si < fullSpans.length; si++) {
            const a = fullSpans[si].start > partStart ? fullSpans[si].start : partStart;
            const b = fullSpans[si].end < partEnd ? fullSpans[si].end : partEnd;
            if (a < b) {
                drawWindowPart(
                    x, a, b, pt, buf, texXVal,
                    levelDS, texShift, lhVal,
                    rMultInt, gMultInt, bMultInt, fRInt, fGInt, fBInt, distFogInt, alphaMult,
                    screenBuffer, width, resolutionDivisor
                );
            }
        }
    };

    if (!isCutoutCol) {
        if (drawStart < drawEnd && (pt.dist <= zBuffer[x] + 1.5 || (pt.layer !== undefined && pt.layer > 0))) {
            drawWindowPartClipped(drawStart, drawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
        }
        return;
    }

    const screenCutoutTop = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cutoutTop);
    const screenCutoutBot = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cutoutBottom);

    // 1. Top Frame (Opaque)
    const topDrawEnd = Math.min(drawEnd, screenCutoutTop);
    if (drawStart < topDrawEnd) {
        drawWindowPartClipped(drawStart, topDrawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
    }

    // 2. Bottom Frame (Opaque)
    const botDrawStart = Math.max(drawStart, screenCutoutBot);
    if (botDrawStart < drawEnd) {
        drawWindowPartClipped(botDrawStart, drawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
    }

    // 2b. Render simple, flat, highly-optimized horizontal inner cheeks (Head and Sill)
    let elev = upperTile.elevation !== undefined ? upperTile.elevation : 0;
    let h = upperTile.height !== undefined ? Math.abs(upperTile.height) : 1.0;
    if (upperTile.height !== undefined && upperTile.height < 0) { elev = 1.0 - h; }
    const topZ = (pt.layer !== undefined ? pt.layer : 0) + elev + h;

    const headZ_world = topZ - cutoutTop * h;
    const sillZ_world = topZ - cutoutBottom * h;

    const exitDist = (pt.exitDist !== undefined && pt.exitDist > pt.dist) ? pt.exitDist : pt.dist + 1.0;
    const lhFar = height / exitDist;
    const levelDrawStartFar = Math.floor(horizon + lhFar * (cameraZ - topZ));
    const levelDrawEndFar = Math.ceil(horizon + lhFar * (cameraZ - (topZ - h)));
    const screenCutoutTopFar = Math.floor(levelDrawStartFar + (levelDrawEndFar - levelDrawStartFar) * cutoutTop);
    const screenCutoutBotFar = Math.floor(levelDrawStartFar + (levelDrawEndFar - levelDrawStartFar) * cutoutBottom);

    const maxD = Math.min(resolutionDivisor, width - x);

    // Precalculate constants for performance
    const numerator_head = (headZ_world - cameraZ) * height;
    const numerator_sill = (cameraZ - sillZ_world) * height;
    const bufW = currentWallBuf.width;
    const bufH = currentWallBuf.height;
    const texData = currentWallBuf.data;

    const fogAmtInt = isFogWeather() ? 256 - distFogInt : 0;
    const fogR = (getFogColorR() * fogAmtInt) >> 8;
    const fogG = (getFogColorG() * fogAmtInt) >> 8;
    const fogB = (getFogColorB() * fogAmtInt) >> 8;
    const hasFlash = fRInt > 0 || fGInt > 0 || fBInt > 0;

    // Render head cheek if camera is below the header
    if (cameraZ < headZ_world) {
        const headStart = Math.max(drawStart, screenCutoutTop);
        const headEnd = Math.min(drawEnd, screenCutoutTopFar);
        if (headStart < headEnd) {
            for (let si = 0; si < fullSpans.length; si++) {
                const a = fullSpans[si].start > headStart ? fullSpans[si].start : headStart;
                const b = fullSpans[si].end < headEnd ? fullSpans[si].end : headEnd;
                if (a >= b) continue;
                for (let y = a; y < b; y++) {
                    const dy = horizon - y;
                    if (dy <= 0) continue;
                    const dist_cheek = numerator_head / dy;

                    const cx = posX + dist_cheek * rayDirX;
                    const cy = posY + dist_cheek * rayDirY;

                    let tx = Math.floor((cx - Math.floor(cx)) * bufW);
                    let ty = Math.floor((cy - Math.floor(cy)) * bufH);
                    if (tx < 0) tx = 0; else if (tx >= bufW) tx = bufW - 1;
                    if (ty < 0) ty = 0; else if (ty >= bufH) ty = bufH - 1;

                    const color = texData[ty * bufW + tx];
                    const a = (color >> 24) & 0xFF;
                    if (a > 0) {
                        // Apply a beautiful shading (0.7 factor) to simulate inner depth/shadow
                        let r = ((color & 0xFF) * 180) >> 8;
                        let g = (((color >> 8) & 0xFF) * 180) >> 8;
                        let b = (((color >> 16) & 0xFF) * 180) >> 8;

                        let finalR = (r * rMultInt) >> 8;
                        let finalG = (g * gMultInt) >> 8;
                        let finalB = (b * bMultInt) >> 8;

                        if (hasFlash) {
                            finalR = (finalR + fRInt) > 255 ? 255 : (finalR + fRInt);
                            finalG = (finalG + fGInt) > 255 ? 255 : (finalG + fGInt);
                            finalB = (finalB + fBInt) > 255 ? 255 : (finalB + fBInt);
                        }

                        if (fogAmtInt > 0) {
                            r = ((finalR * distFogInt) >> 8) + fogR;
                            g = ((finalG * distFogInt) >> 8) + fogG;
                            b = ((finalB * distFogInt) >> 8) + fogB;
                        } else {
                            r = finalR;
                            g = finalG;
                            b = finalB;
                        }

                        r = r > 255 ? 255 : r;
                        g = g > 255 ? 255 : g;
                        b = b > 255 ? 255 : b;

                        const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                        const screenIdx = y * width + x;
                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    }
                }
            }
        }
    }

    // Render sill cheek if camera is above the sill
    if (cameraZ > sillZ_world) {
        const sillStart = Math.max(drawStart, screenCutoutBotFar);
        const sillEnd = Math.min(drawEnd, screenCutoutBot);
        if (sillStart < sillEnd) {
            for (let si = 0; si < fullSpans.length; si++) {
                const a = fullSpans[si].start > sillStart ? fullSpans[si].start : sillStart;
                const b = fullSpans[si].end < sillEnd ? fullSpans[si].end : sillEnd;
                if (a >= b) continue;
                for (let y = a; y < b; y++) {
                    const dy = y - horizon;
                    if (dy <= 0) continue;
                    const dist_cheek = numerator_sill / dy;

                    const cx = posX + dist_cheek * rayDirX;
                    const cy = posY + dist_cheek * rayDirY;

                    let tx = Math.floor((cx - Math.floor(cx)) * bufW);
                    let ty = Math.floor((cy - Math.floor(cy)) * bufH);
                    if (tx < 0) tx = 0; else if (tx >= bufW) tx = bufW - 1;
                    if (ty < 0) ty = 0; else if (ty >= bufH) ty = bufH - 1;

                    const color = texData[ty * bufW + tx];
                    const a = (color >> 24) & 0xFF;
                    if (a > 0) {
                        // Apply a beautiful shading (0.7 factor) to simulate inner depth/shadow
                        let r = ((color & 0xFF) * 180) >> 8;
                        let g = (((color >> 8) & 0xFF) * 180) >> 8;
                        let b = (((color >> 16) & 0xFF) * 180) >> 8;

                        let finalR = (r * rMultInt) >> 8;
                        let finalG = (g * gMultInt) >> 8;
                        let finalB = (b * bMultInt) >> 8;

                        if (hasFlash) {
                            finalR = (finalR + fRInt) > 255 ? 255 : (finalR + fRInt);
                            finalG = (finalG + fGInt) > 255 ? 255 : (finalG + fGInt);
                            finalB = (finalB + fBInt) > 255 ? 255 : (finalB + fBInt);
                        }

                        if (fogAmtInt > 0) {
                            r = ((finalR * distFogInt) >> 8) + fogR;
                            g = ((finalG * distFogInt) >> 8) + fogG;
                            b = ((finalB * distFogInt) >> 8) + fogB;
                        } else {
                            r = finalR;
                            g = finalG;
                            b = finalB;
                        }

                        r = r > 255 ? 255 : r;
                        g = g > 255 ? 255 : g;
                        b = b > 255 ? 255 : b;

                        const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                        const screenIdx = y * width + x;
                        screenBuffer[screenIdx] = finalColor;
                        for (let d = 1; d < maxD; d++) {
                            screenBuffer[screenIdx + d] = finalColor;
                        }
                    }
                }
            }
        }
    }

    // 3. Render Glass (Layered transparent window pane)
    let glassBuf: RaycasterBuffer | null = null;
    if (upperTile.glassAssetId && !upperTile.isGlassBroken && auxBuffers?.has(upperTile.glassAssetId)) {
        glassBuf = auxBuffers.get(upperTile.glassAssetId)!;
    }
    if (glassBuf) {
        const alphaMultiplier = upperTile.glassTransparency ?? 0.5;
        let gOffset = pt.glassOffset !== undefined ? pt.glassOffset : 0.5;
        let relativeOffset = pt.side === 0 
            ? (rayDirX > 0 ? gOffset : (1 - gOffset))
            : (rayDirY > 0 ? gOffset : (1 - gOffset));
        let glassDist = pt.dist + relativeOffset * (pt.exitDist - pt.dist);

        let maxGlassOccludeDist = zBuffer[x];
        if (pt.layer !== undefined && pt.layer > 0) {
            maxGlassOccludeDist = Infinity;
        }

        if (glassDist > 0 && glassDist < maxGlassOccludeDist) {
            let glassH = lh;
            let glassLevelDS = levelDrawStart;
            let glassLevelDE = levelDrawEnd;

            let gScreenTop = Math.floor(glassLevelDS + (glassLevelDE - glassLevelDS) * cutoutTop);
            let gScreenBot = Math.floor(glassLevelDS + (glassLevelDE - glassLevelDS) * cutoutBottom);

            const glassDrawStart = Math.max(0, gScreenTop, screenCutoutTop, drawStart);
            const glassDrawEnd = Math.min(height, gScreenBot, screenCutoutBot, drawEnd);

            if (glassDrawStart < glassDrawEnd) {
                let glassHitX = posX + glassDist * rayDirX;
                let glassHitY = posY + glassDist * rayDirY;

                let localHoleX = cAxis === 'NS' ? glassHitX - pt.mapX : glassHitY - pt.mapY;
                let holeLeft = cutoutLeft;
                let holeRight = cutoutRight;

                let localX = 0.5;
                if (holeRight > holeLeft) {
                    localX = (localHoleX - holeLeft) / (holeRight - holeLeft);
                }
                localX = Math.max(0, Math.min(1, localX));

                let glassTexX = Math.floor(localX * glassBuf.width);
                glassTexX = (glassTexX + glassBuf.width) % glassBuf.width;

                if (cAxis === 'NS' && rayDirY > 0) glassTexX = glassBuf.width - glassTexX - 1;
                else if (cAxis === 'WE' && rayDirX < 0) glassTexX = glassBuf.width - glassTexX - 1;

                const cutoutScreenHeight = gScreenBot - gScreenTop;
                const targetLh = cutoutScreenHeight > 0 ? cutoutScreenHeight : 1;

                const glassSpans = fullSpans;
                for (let s = 0; s < glassSpans.length; s++) {
                    const a = glassSpans[s].start > glassDrawStart ? glassSpans[s].start : glassDrawStart;
                    const b = glassSpans[s].end < glassDrawEnd ? glassSpans[s].end : glassDrawEnd;
                    if (a < b) {
                        drawWindowPart(
                            x, a, b, pt, glassBuf, glassTexX,
                            gScreenTop, 0, targetLh,
                            rMultInt, gMultInt, bMultInt, fRInt, fGInt, fBInt, distFogInt, alphaMultiplier,
                            screenBuffer, width, resolutionDivisor
                        );
                    }
                }
            }
        }
    }
}

export interface PreparedWindowOcclusion {
    isAlwaysOccluded: boolean;
    levelDrawStart: number;
    levelDrawEnd: number;
    isCutoutCol: boolean;
    screenCutoutTop: number;
    screenCutoutBot: number;
    screenCutoutTopFar: number;
    screenCutoutBotFar: number;
    actualCutoutTop: number;
    actualCutoutBot: number;
}

export function prepareSpriteWindowOcclusion(
    pt: PassThroughWall,
    height: number,
    horizon: number,
    cameraZ: number,
    posX: number,
    posY: number,
    rayDirX: number,
    rayDirY: number,
    cutoutTop?: number,
    cutoutBottom?: number,
    cutoutLeft?: number,
    cutoutRight?: number,
    topZ_val?: number,
    botZ_val?: number
): PreparedWindowOcclusion {
    const topZ = topZ_val !== undefined ? topZ_val : (pt.topZ !== undefined ? pt.topZ : 1.0);
    const botZ = botZ_val !== undefined ? botZ_val : (pt.bottomZ !== undefined ? pt.bottomZ : 0.0);
    const layerVal = pt.layer !== undefined ? pt.layer : 0;
    const absTopZ = layerVal + topZ;
    const absBotZ = layerVal + botZ;

    const lh = height / pt.dist;
    const levelDrawStart = Math.floor(horizon + lh * (cameraZ - absTopZ));
    const levelDrawEnd = Math.ceil(horizon + lh * (cameraZ - absBotZ));

    const cTop = cutoutTop !== undefined ? cutoutTop : (pt.cutoutTop !== undefined ? pt.cutoutTop : 0.25);
    const cBot = cutoutBottom !== undefined ? cutoutBottom : (pt.cutoutBottom !== undefined ? pt.cutoutBottom : 0.75);
    const cLeft = cutoutLeft !== undefined ? cutoutLeft : (pt.cutoutLeft !== undefined ? pt.cutoutLeft : 0.25);
    const cRight = cutoutRight !== undefined ? cutoutRight : (pt.cutoutRight !== undefined ? pt.cutoutRight : 0.75);

    // Compute side cutout column
    let isCutoutCol = true;
    const cAxis = pt.cutoutAxis || 'NS';
    if (cAxis === 'NS' && pt.side !== 1) isCutoutCol = false;
    if (cAxis === 'WE' && pt.side !== 0) isCutoutCol = false;

    if (isCutoutCol) {
        let wallX;
        if (pt.side === 0) {
            wallX = posY + pt.dist * rayDirY;
        } else {
            wallX = posX + pt.dist * rayDirX;
        }
        wallX -= Math.floor(wallX);
        let wallX_norm = wallX;
        if (pt.side === 0 && rayDirX < 0) wallX_norm = 1.0 - wallX_norm;
        if (pt.side === 1 && rayDirY > 0) wallX_norm = 1.0 - wallX_norm;

        if (wallX_norm < cLeft || wallX_norm > cRight) {
            isCutoutCol = false;
        }
    }

    const screenCutoutTop = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cTop);
    const screenCutoutBot = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cBot);

    // Account for inner head/sill cheeks
    const exitDist = (pt.exitDist !== undefined && pt.exitDist > pt.dist) ? pt.exitDist : pt.dist + 1.0;
    const lhFar = height / exitDist;
    const levelDrawStartFar = Math.floor(horizon + lhFar * (cameraZ - absTopZ));
    const levelDrawEndFar = Math.ceil(horizon + lhFar * (cameraZ - absBotZ));
    const screenCutoutTopFar = Math.floor(levelDrawStartFar + (levelDrawEndFar - levelDrawStartFar) * cTop);
    const screenCutoutBotFar = Math.floor(levelDrawStartFar + (levelDrawEndFar - levelDrawStartFar) * cBot);

    const headZ_world = absTopZ - cTop * (topZ - botZ);
    const sillZ_world = absTopZ - cBot * (topZ - botZ);

    const hasHeadCheek = cameraZ < headZ_world;
    const hasSillCheek = cameraZ > sillZ_world;

    const actualCutoutTop = hasHeadCheek ? Math.max(screenCutoutTop, screenCutoutTopFar) : screenCutoutTop;
    const actualCutoutBot = hasSillCheek ? Math.min(screenCutoutBot, screenCutoutBotFar) : screenCutoutBot;

    return {
        isAlwaysOccluded: !isCutoutCol,
        levelDrawStart,
        levelDrawEnd,
        isCutoutCol,
        screenCutoutTop,
        screenCutoutBot,
        screenCutoutTopFar,
        screenCutoutBotFar,
        actualCutoutTop,
        actualCutoutBot
    };
}

export function isSpritePixelOccludedByWindowPrepared(
    y: number,
    transformY: number,
    prepared: PreparedWindowOcclusion,
    horizon: number
): boolean {
    // Outside bounds vertically
    if (y < prepared.levelDrawStart || y >= prepared.levelDrawEnd) {
        return false;
    }

    if (prepared.isAlwaysOccluded) {
        return true;
    }

    if (y < prepared.actualCutoutTop || y >= prepared.actualCutoutBot) {
        return true;
    }

    // Inside the cutout/glass area, it's transparent, so a sprite behind it is visible
    return false;
}

/**
 * Calculates whether a sprite pixel 'y' at distance 'transformY' 
 * is occluded by the window's physical boundaries (frames or cheeks).
 * Returns true if occluded.
 */
export function isSpritePixelOccludedByWindow(
    y: number,
    transformY: number,
    pt: PassThroughWall,
    height: number,
    horizon: number,
    cameraZ: number,
    posX: number,
    posY: number,
    rayDirX: number,
    rayDirY: number,
    cutoutTop?: number,
    cutoutBottom?: number,
    cutoutLeft?: number,
    cutoutRight?: number,
    topZ_val?: number,
    botZ_val?: number
): boolean {
    if (transformY <= pt.dist) {
        return false;
    }
    const prepared = prepareSpriteWindowOcclusion(
        pt, height, horizon, cameraZ, posX, posY, rayDirX, rayDirY,
        cutoutTop, cutoutBottom, cutoutLeft, cutoutRight, topZ_val, botZ_val
    );
    return isSpritePixelOccludedByWindowPrepared(y, transformY, prepared, horizon);
}
