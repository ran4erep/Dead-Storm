import { PassThroughWall } from './RaycasterTypes';
import { RaycasterBuffer } from './RaycasterUtils';
import { getDepthFactor, isFogWeather, getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { isWebGLActive } from './WebGLState';

/**
 * Simplified window renderer.
 *
 * A window is modeled as a rectangular cutout in an otherwise opaque wall tile:
 *   - the wall below/above/outside the cutout is opaque wall;
 *   - the cutout itself is filled with a glass texture (alpha-blended) at a
 *     configurable depth inside the frame (glassOffset, 0.5 = middle).
 *
 * No volumetric cheeks / inner surfaces are rendered. This is intentionally
 * kept simple and fast: the only per-pixel work is the glass alpha blend.
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

/**
 * Draw a vertical strip of a texture into the screen buffer with optional
 * alpha blending. This is the only per-pixel window code.
 */
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

    const maxD = Math.min(resolutionDivisor, width - x);

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
                return;
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
                return;
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
            return;
        }
    }

    if (hasAlpha) {
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

            const r = ((color & 0xFF) * rMultInt) >> 8;
            const g = (((color >> 8) & 0xFF) * gMultInt) >> 8;
            const b = (((color >> 16) & 0xFF) * bMultInt) >> 8;

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

                const finalAlphaByte = (a_out * 255.0) | 0;
                const finalColor = (finalAlphaByte << 24) | (b_out << 16) | (g_out << 8) | r_out;

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

            const r = ((color & 0xFF) * rMultInt) >> 8;
            const g = (((color >> 8) & 0xFF) * gMultInt) >> 8;
            const b = (((color >> 16) & 0xFF) * bMultInt) >> 8;

            const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
            screenBuffer[screenIdx] = finalColor;
            for (let d = 1; d < maxD; d++) {
                screenBuffer[screenIdx + d] = finalColor;
            }
            screenIdx += width;
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
    const cutoutTop = cutout.topLeft.y;
    const cutoutBot = cutout.bottomRight.y;

    // Is this screen column inside the cutout horizontally?
    let isCutoutCol = true;
    const cAxis = upperTile.cutoutAxis || 'NS';
    if (cAxis === 'NS' && pt.side !== 1) isCutoutCol = false;
    if (cAxis === 'WE' && pt.side !== 0) isCutoutCol = false;

    if (isCutoutCol) {
        const texX_norm = currentWallBuf.width > 0 ? (texX / currentWallBuf.width) : 0;
        if (texX_norm < cutout.topLeft.x || texX_norm > cutout.bottomRight.x) {
            isCutoutCol = false;
        }
    }

    pt.isCutoutColumn = isCutoutCol;

    const fullSpans = getUnoccludedSpans(0, height, passThroughWallsCol, pt.dist);

    const drawPart = (
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
            drawPart(drawStart, drawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
        }
        return;
    }

    const screenCutoutTop = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cutoutTop);
    const screenCutoutBot = Math.floor(levelDrawStart + (levelDrawEnd - levelDrawStart) * cutoutBot);

    // Top frame (opaque)
    const topDrawEnd = Math.min(drawEnd, screenCutoutTop);
    if (drawStart < topDrawEnd) {
        drawPart(drawStart, topDrawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
    }

    // Bottom frame (opaque)
    const botDrawStart = Math.max(drawStart, screenCutoutBot);
    if (botDrawStart < drawEnd) {
        drawPart(botDrawStart, drawEnd, currentWallBuf, texX, levelDrawStart, texStartShift, lh, 1.0);
    }

    // Glass pane: a texture drawn inside the cutout, alpha-blended over the
    // background. Its depth inside the frame is controlled by glassOffset.
    let glassBuf: RaycasterBuffer | null = null;
    if (upperTile.glassAssetId && !upperTile.isGlassBroken && auxBuffers?.has(upperTile.glassAssetId)) {
        glassBuf = auxBuffers.get(upperTile.glassAssetId)!;
    }
    if (!glassBuf) return;

    const alphaMultiplier = upperTile.glassTransparency ?? 0.5;
    const gOffset = pt.glassOffset !== undefined ? pt.glassOffset : 0.5;
    const exitDist = (pt.exitDist !== undefined && pt.exitDist > pt.dist) ? pt.exitDist : pt.dist + 1.0;
    const glassDist = pt.dist + gOffset * (exitDist - pt.dist);

    let maxGlassOccludeDist = zBuffer[x];
    if (pt.layer !== undefined && pt.layer > 0) {
        maxGlassOccludeDist = Infinity;
    }
    if (glassDist <= 0 || glassDist >= maxGlassOccludeDist) return;

    const glassDrawStart = Math.max(0, screenCutoutTop, drawStart);
    const glassDrawEnd = Math.min(height, screenCutoutBot, drawEnd);
    if (glassDrawStart >= glassDrawEnd) return;

    const localHoleX = cAxis === 'NS' ? (posX + glassDist * rayDirX) - pt.mapX : (posY + glassDist * rayDirY) - pt.mapY;
    const holeLeft = cutout.topLeft.x;
    const holeRight = cutout.bottomRight.x;
    let localX = 0.5;
    if (holeRight > holeLeft) {
        localX = (localHoleX - holeLeft) / (holeRight - holeLeft);
    }
    localX = Math.max(0, Math.min(1, localX));

    let glassTexX = Math.floor(localX * glassBuf.width);
    glassTexX = (glassTexX + glassBuf.width) % glassBuf.width;

    if (cAxis === 'NS' && rayDirY > 0) glassTexX = glassBuf.width - glassTexX - 1;
    else if (cAxis === 'WE' && rayDirX < 0) glassTexX = glassBuf.width - glassTexX - 1;

    const cutoutScreenHeight = screenCutoutBot - screenCutoutTop;
    const targetLh = cutoutScreenHeight > 0 ? cutoutScreenHeight : 1;

    const glassSpans = getUnoccludedSpans(glassDrawStart, glassDrawEnd, passThroughWallsCol, glassDist);
    for (let s = 0; s < glassSpans.length; s++) {
        drawWindowPart(
            x, glassSpans[s].start, glassSpans[s].end, pt, glassBuf, glassTexX,
            screenCutoutTop, 0, targetLh,
            rMultInt, gMultInt, bMultInt, fRInt, fGInt, fBInt, distFogInt, alphaMultiplier,
            screenBuffer, width, resolutionDivisor
        );
    }
}

export interface PreparedWindowOcclusion {
    isAlwaysOccluded: boolean;
    levelDrawStart: number;
    levelDrawEnd: number;
    isCutoutCol: boolean;
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
    const cBot = cutoutBottom !== undefined ? cutoutBottom : (pt.cutoutBot !== undefined ? pt.cutoutBot : 0.75);
    const cLeft = cutoutLeft !== undefined ? cutoutLeft : (pt.cutoutLeft !== undefined ? pt.cutoutLeft : 0.25);
    const cRight = cutoutRight !== undefined ? cutoutRight : (pt.cutoutRight !== undefined ? pt.cutoutRight : 0.75);

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

    return {
        isAlwaysOccluded: !isCutoutCol,
        levelDrawStart,
        levelDrawEnd,
        isCutoutCol,
        actualCutoutTop: screenCutoutTop,
        actualCutoutBot: screenCutoutBot
    };
}

export function isSpritePixelOccludedByWindowPrepared(
    y: number,
    transformY: number,
    prepared: PreparedWindowOcclusion,
    horizon: number
): boolean {
    if (y < prepared.levelDrawStart || y >= prepared.levelDrawEnd) {
        return false;
    }
    if (prepared.isAlwaysOccluded) {
        return true;
    }
    if (y < prepared.actualCutoutTop || y >= prepared.actualCutoutBot) {
        return true;
    }
    return false;
}

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
