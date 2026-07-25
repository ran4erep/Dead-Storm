
import { RaycasterBuffer } from './RaycasterUtils';
import { getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';
import { isWebGLActive, pushQuad, getQuadFromPool } from './WebGLState';

export const drawBrokenMirrorStrip = (
    x: number,
    drawStart: number,
    drawEnd: number,
    texPosFixed: number,
    stepFixed: number,
    texX: number,
    buf: RaycasterBuffer,
    maskBuf: RaycasterBuffer,
    screenBuffer: Uint32Array,
    width: number,
    rMultInt: number,
    gMultInt: number,
    bMultInt: number,
    fRInt: number,
    fGInt: number,
    fBInt: number,
    resolutionDivisor: number = 1,
    fogAmtInt: number = 0,
    seed: number = 0,
    dist: number = 1000
) => {
    if (drawStart >= drawEnd) return;

    const maskW = maskBuf.width;
    const maskH = maskBuf.height;
    const maskData = maskBuf.data;
    const maskScaleY = maskH / buf.height;
    const maskScaleX = maskW / buf.width;
    const mtx = (texX * maskScaleX) | 0;

    const scaleX = maskW / 128.0;
    const scaleY = maskH / 128.0;
    const mtxScaled = mtx / scaleX;

    const edgeDistX = Math.min(mtx, maskW - mtx);
    const minSX = 5 * scaleX;
    const tri1AmpX = 25 * scaleX;
    const tri2AmpX = 15 * scaleX;
    const maxShardWidthX = minSX + tri1AmpX + tri2AmpX;

    const minSY = 5 * scaleY;
    const tri1AmpY = 25 * scaleY;
    const tri2AmpY = 15 * scaleY;

    const pX1 = mtxScaled * 0.05 + seed;
    const wX1 = pX1 - Math.floor(pX1);
    const triX1 = wX1 < 0.5 ? wX1 * 2 : (1 - wX1) * 2;
    
    const pX2 = mtxScaled * 0.13 + seed * 1.5;
    const wX2 = pX2 - Math.floor(pX2);
    const triX2 = wX2 < 0.5 ? wX2 * 2 : (1 - wX2) * 2;
    
    const pX3 = mtxScaled * 0.06 - seed;
    const wX3 = pX3 - Math.floor(pX3);
    const triX3 = wX3 < 0.5 ? wX3 * 2 : (1 - wX3) * 2;

    const pX4 = mtxScaled * 0.14 + seed * 0.8;
    const wX4 = pX4 - Math.floor(pX4);
    const triX4 = wX4 < 0.5 ? wX4 * 2 : (1 - wX4) * 2;

    const shardHeightYTop = minSY + triX1 * tri1AmpY + triX2 * tri2AmpY;
    const shardHeightYBot = minSY + triX3 * tri1AmpY + triX4 * tri2AmpY;

    const isPixelHole = (ty: number): boolean => {
        const mty = (ty * maskScaleY) | 0;
        const maskColor = maskData[mty * maskW + mtx];
        // Green color #00FF00
        const isMirrorArea = (maskColor & 0x00FFFFFF) === 0x0000FF00;
        if (!isMirrorArea) {
            return false;
        }

        if (mty < shardHeightYTop || (maskH - mty) < shardHeightYBot) {
            return false;
        } else if (edgeDistX < maxShardWidthX) {
            const mtyScaled = scaleY > 0 ? mty / scaleY : mty;
            const pY1 = mtyScaled * 0.055 + seed;
            const pY2 = mtyScaled * 0.12 - seed * 1.2;
            const w1 = pY1 - Math.floor(pY1);
            const w2 = pY2 - Math.floor(pY2);
            const tri1 = w1 < 0.5 ? w1 * 2 : (1 - w1) * 2;
            const tri2 = w2 < 0.5 ? w2 * 2 : (1 - w2) * 2;
            const shardWidthX = minSX + tri1 * tri1AmpX + tri2 * tri2AmpX;
            if (edgeDistX < shardWidthX) {
                return false;
            }
        }
        return true;
    };

    if (isWebGLActive) {
        let currentTexPosFixed = texPosFixed;
        
        const vAtY = (y: number) => {
            return ((texPosFixed + stepFixed * (y - drawStart)) / 65536.0) / buf.height;
        };

        let spanStart = drawStart;
        let tyFirst = (currentTexPosFixed >> 16) % buf.height;
        if (tyFirst < 0) tyFirst += buf.height;
        let isSpanHole = isPixelHole(tyFirst);
        
        for (let y = drawStart + 1; y < drawEnd; y++) {
            currentTexPosFixed += stepFixed;
            let ty = (currentTexPosFixed >> 16) % buf.height;
            if (ty < 0) ty += buf.height;
            const currentIsHole = isPixelHole(ty);
            
            if (currentIsHole !== isSpanHole) {
                const quad = getQuadFromPool();
                quad.x0 = x;
                quad.x1 = x + resolutionDivisor;
                quad.y0 = spanStart;
                quad.y1 = y;
                quad.u0 = texX / buf.width;
                quad.u1 = (texX + 1) / buf.width;
                quad.v0 = vAtY(spanStart);
                quad.v1 = vAtY(y);
                if (isSpanHole) {
                    quad.r = 0.0;
                    quad.g = 0.0;
                    quad.b = 0.0;
                } else {
                    quad.r = (rMultInt + fRInt) / 256.0;
                    quad.g = (gMultInt + fGInt) / 256.0;
                    quad.b = (bMultInt + fBInt) / 256.0;
                }
                quad.fog = fogAmtInt / 256.0;
                quad.textureId = (buf as any).id || 'wall';
                quad.dist = dist;
                pushQuad(quad);

                spanStart = y;
                isSpanHole = currentIsHole;
            }
        }

        if (spanStart < drawEnd) {
            const quad = getQuadFromPool();
            quad.x0 = x;
            quad.x1 = x + resolutionDivisor;
            quad.y0 = spanStart;
            quad.y1 = drawEnd;
            quad.u0 = texX / buf.width;
            quad.u1 = (texX + 1) / buf.width;
            quad.v0 = vAtY(spanStart);
            quad.v1 = vAtY(drawEnd);
            if (isSpanHole) {
                quad.r = 0.0;
                quad.g = 0.0;
                quad.b = 0.0;
            } else {
                quad.r = (rMultInt + fRInt) / 256.0;
                quad.g = (gMultInt + fGInt) / 256.0;
                quad.b = (bMultInt + fBInt) / 256.0;
            }
            quad.fog = fogAmtInt / 256.0;
            quad.textureId = (buf as any).id || 'wall';
            quad.dist = dist;
            pushQuad(quad);
        }
        return;
    }

    const texW = buf.width;
    const texH = buf.height;
    const texData = buf.data;

    const rMult = (rMultInt + fRInt);
    const gMult = (gMultInt + fGInt);
    const bMult = (bMultInt + fBInt);
    const fRAdd = (fRInt >> 2) + ((getFogColorR() * fogAmtInt) >> 8);
    const fGAdd = (fGInt >> 2) + ((getFogColorG() * fogAmtInt) >> 8);
    const fBAdd = (fBInt >> 2) + ((getFogColorB() * fogAmtInt) >> 8);

    for (let y = drawStart; y < drawEnd; y++) {
        let ty = (texPosFixed >> 16) % texH; 
        if (ty < 0) ty += texH;
        texPosFixed += stepFixed;
        
        if (isPixelHole(ty)) {
            const r = Math.min(255, fRAdd);
            const g = Math.min(255, fGAdd);
            const b = Math.min(255, fBAdd);
            const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
            screenBuffer[y * width + x] = finalColor;
            for (let d = 1; d < resolutionDivisor; d++) {
                if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
            }
        } else {
            const color = texData[(ty * texW + texX) | 0];
            const alpha = (color >> 24) & 0xFF;
            if (alpha > 0) {
                let r = ((color & 0xFF) * rMult) >> 8; 
                let g = (((color >> 8) & 0xFF) * gMult) >> 8; 
                let b = (((color >> 16) & 0xFF) * bMult) >> 8;
                
                r = Math.min(255, r + fRAdd);
                g = Math.min(255, g + fGAdd);
                b = Math.min(255, b + fBAdd);
                
                const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                screenBuffer[y * width + x] = finalColor;
                for (let d = 1; d < resolutionDivisor; d++) {
                    if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                }
            }
        }
    }
};

export const drawWallStrip = (
    x: number,
    drawStart: number,
    drawEnd: number,
    texPosFixed: number,
    stepFixed: number,
    texX: number,
    buf: RaycasterBuffer,
    screenBuffer: Uint32Array,
    width: number,
    rMultInt: number,
    gMultInt: number,
    bMultInt: number,
    fRInt: number,
    fGInt: number,
    fBInt: number,
    resolutionDivisor: number = 1,
    fogAmtInt: number = 0,
    alphaMultInt: number = 256,
    isDoor: boolean = false,
    dist: number = 1000
) => {
    if (isWebGLActive) {
        const v0 = (texPosFixed / 65536.0) / buf.height;
        const v1 = ((texPosFixed + stepFixed * (drawEnd - drawStart)) / 65536.0) / buf.height;
        const quad = getQuadFromPool();
        quad.x0 = x;
        quad.x1 = x + resolutionDivisor;
        quad.y0 = drawStart;
        quad.y1 = drawEnd;
        quad.u0 = texX / buf.width;
        quad.u1 = (texX + 1) / buf.width;
        quad.v0 = v0;
        quad.v1 = v1;
        quad.r = (rMultInt + fRInt) / 256.0;
        quad.g = (gMultInt + fGInt) / 256.0;
        quad.b = (bMultInt + fBInt) / 256.0;
        quad.fog = fogAmtInt / 256.0;
        quad.textureId = (buf as any).id || 'wall';
        quad.dist = dist;
        pushQuad(quad);
        return;
    }

    const texW = buf.width;
    const texH = buf.height;
    const texData = buf.data;
    const hasFlash = fRInt > 0 || fGInt > 0 || fBInt > 0 || fogAmtInt > 0;
    
    const totalRMult = rMultInt + fRInt;
    const totalGMult = gMultInt + fGInt;
    const totalBMult = bMultInt + fBInt;
    
    const fRAdd = (fRInt >> 2) + ((getFogColorR() * fogAmtInt) >> 8);
    const fGAdd = (fGInt >> 2) + ((getFogColorG() * fogAmtInt) >> 8);
    const fBAdd = (fBInt >> 2) + ((getFogColorB() * fogAmtInt) >> 8);

    if (resolutionDivisor === 1) {
        if (!hasFlash) {
            for (let y = drawStart; y < drawEnd; y++) {
                const ty = (texPosFixed >> 16) % texH; 
                texPosFixed += stepFixed;
                
                const color = texData[(ty * texW + texX) | 0];
                let alpha = (color >> 24) & 0xFF;
                if (alphaMultInt < 256) alpha = ((alpha * alphaMultInt) >> 8);

                if (alpha >= 250) {
                    const r = ((color & 0xFF) * rMultInt) >> 8; 
                    const g = (((color >> 8) & 0xFF) * gMultInt) >> 8; 
                    const b = (((color >> 16) & 0xFF) * bMultInt) >> 8;
                    screenBuffer[y * width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
                } else if (alpha > 0) {
                    const bgVal = screenBuffer[y * width + x];
                    const bgR = bgVal & 0xFF; const bgG = (bgVal >> 8) & 0xFF; const bgB = (bgVal >> 16) & 0xFF;
                    let r = ((color & 0xFF) * rMultInt) >> 8; 
                    let g = (((color >> 8) & 0xFF) * gMultInt) >> 8; 
                    let b = (((color >> 16) & 0xFF) * bMultInt) >> 8;
                    
                    const invA = 255 - alpha;
                    r = (r * alpha + bgR * invA) >> 8; g = (g * alpha + bgG * invA) >> 8; b = (b * alpha + bgB * invA) >> 8;
                    screenBuffer[y * width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
                }
            }
        } else {
            for (let y = drawStart; y < drawEnd; y++) {
                const ty = (texPosFixed >> 16) % texH; 
                texPosFixed += stepFixed;
                
                const color = texData[(ty * texW + texX) | 0];
                let alpha = (color >> 24) & 0xFF;
                if (alphaMultInt < 256) alpha = ((alpha * alphaMultInt) >> 8);

                if (alpha >= 250) {
                    let r = ((color & 0xFF) * totalRMult) >> 8; 
                    let g = (((color >> 8) & 0xFF) * totalGMult) >> 8; 
                    let b = (((color >> 16) & 0xFF) * totalBMult) >> 8;
                    
                    r += fRAdd;
                    g += fGAdd;
                    b += fBAdd;

                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;

                    screenBuffer[y * width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
                } else if (alpha > 0) {
                    const bgVal = screenBuffer[y * width + x];
                    const bgR = bgVal & 0xFF; const bgG = (bgVal >> 8) & 0xFF; const bgB = (bgVal >> 16) & 0xFF;
                    let r = ((color & 0xFF) * totalRMult) >> 8; 
                    let g = (((color >> 8) & 0xFF) * totalGMult) >> 8; 
                    let b = (((color >> 16) & 0xFF) * totalBMult) >> 8;
                    
                    r += fRAdd;
                    g += fGAdd;
                    b += fBAdd;

                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;

                    const invA = 255 - alpha;
                    r = (r * alpha + bgR * invA) >> 8; g = (g * alpha + bgG * invA) >> 8; b = (b * alpha + bgB * invA) >> 8;
                    screenBuffer[y * width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
                }
            }
        }
    } else {
        // With resolution divisor
        for (let y = drawStart; y < drawEnd; y++) {
            const ty = (texPosFixed >> 16) % texH; 
            texPosFixed += stepFixed;
            
            const color = texData[(ty * texW + texX) | 0];
            let alpha = (color >> 24) & 0xFF;
            if (alphaMultInt < 256) alpha = ((alpha * alphaMultInt) >> 8);

            if (alpha >= 250) {
                let r = ((color & 0xFF) * (hasFlash ? totalRMult : rMultInt)) >> 8; 
                let g = (((color >> 8) & 0xFF) * (hasFlash ? totalGMult : gMultInt)) >> 8; 
                let b = (((color >> 16) & 0xFF) * (hasFlash ? totalBMult : bMultInt)) >> 8;
                
                if (hasFlash) {
                    r += fRAdd;
                    g += fGAdd;
                    b += fBAdd;
                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;
                }

                const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                screenBuffer[y * width + x] = finalColor;
                for (let d = 1; d < resolutionDivisor; d++) {
                    if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                }
            } else if (alpha > 0) {
                const bgVal = screenBuffer[y * width + x];
                const bgR = bgVal & 0xFF; const bgG = (bgVal >> 8) & 0xFF; const bgB = (bgVal >> 16) & 0xFF;
                let r = ((color & 0xFF) * (hasFlash ? totalRMult : rMultInt)) >> 8; 
                let g = (((color >> 8) & 0xFF) * (hasFlash ? totalGMult : gMultInt)) >> 8; 
                let b = (((color >> 16) & 0xFF) * (hasFlash ? totalBMult : bMultInt)) >> 8;
                
                if (hasFlash) {
                    r += fRAdd;
                    g += fGAdd;
                    b += fBAdd;
                    if (r > 255) r = 255;
                    if (g > 255) g = 255;
                    if (b > 255) b = 255;
                }

                const invA = 255 - alpha;
                r = (r * alpha + bgR * invA) >> 8; g = (g * alpha + bgG * invA) >> 8; b = (b * alpha + bgB * invA) >> 8;
                const finalColor = (255 << 24) | (b << 16) | (g << 8) | r;
                screenBuffer[y * width + x] = finalColor;
                for (let d = 1; d < resolutionDivisor; d++) {
                    if (x + d < width) screenBuffer[y * width + (x + d)] = finalColor;
                }
            }
        }
    }
};
