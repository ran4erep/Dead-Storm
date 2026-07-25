
export interface FlashParams {
    intensity: number;
    r?: number;
    g?: number;
    b?: number;
}

import { getFogColorR, getFogColorG, getFogColorB } from './DepthEffect';

export const globalSpriteTintCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();

export const clearGlobalSpriteTintCache = () => {
    globalSpriteTintCache.clear();
};

const MAX_SPRITE_CACHE_SIZE = 3000;

// Reusable Canvas Pool to completely eliminate document.createElement('canvas') allocations during gameplay
const canvasPool: HTMLCanvasElement[] = [];

function acquireCanvas(width: number, height: number): HTMLCanvasElement {
    let canvas = canvasPool.pop();
    if (!canvas) {
        canvas = document.createElement('canvas');
    }
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return canvas;
}

function safeCacheSet(
    cache: Map<string, HTMLCanvasElement | HTMLImageElement>,
    key: string,
    val: HTMLCanvasElement | HTMLImageElement
) {
    if (cache.size >= MAX_SPRITE_CACHE_SIZE) {
        const evictCount = Math.floor(MAX_SPRITE_CACHE_SIZE * 0.25);
        let count = 0;
        for (const k of cache.keys()) {
            const evicted = cache.get(k);
            if (evicted instanceof HTMLCanvasElement && canvasPool.length < 500) {
                canvasPool.push(evicted);
            }
            cache.delete(k);
            count++;
            if (count >= evictCount) break;
        }
    }
    cache.set(key, val);
}

export const getTintedSprite = (
    img: HTMLImageElement | HTMLCanvasElement, 
    lightColor: { r: number, g: number, b: number }, 
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    cache: Map<string, HTMLCanvasElement | HTMLImageElement>,
    flashColor?: {r: number, g: number, b: number},
    fogAmount: number = 0
): HTMLCanvasElement | HTMLImageElement => {
    // If not passing a local cache, default to global
    cache = cache || globalSpriteTintCache;
    
    // Fast path: If parameters are standard (no flash, normal brightness, no fog), return raw image
    if (fogAmount < 0.05 && Math.abs(lightColor.r - 1.0) < 0.05 && Math.abs(lightColor.g - 1.0) < 0.05 && Math.abs(lightColor.b - 1.0) < 0.05 && lightningIntensity < 0.05 && muzzleFlashIntensity < 0.05) {
        return img;
    }

    const fr = flashColor ? Math.round(flashColor.r) : 255;
    const fg = flashColor ? Math.round(flashColor.g) : 150;
    const fb = flashColor ? Math.round(flashColor.b) : 0;

    // Quantize keys (16 steps for RGB, 12 steps for fog) for smooth rotation & movement performance
    const rKey = Math.min(16, Math.max(0, Math.round(lightColor.r * 16)));
    const gKey = Math.min(16, Math.max(0, Math.round(lightColor.g * 16)));
    const bKey = Math.min(16, Math.max(0, Math.round(lightColor.b * 16)));
    const lKey = Math.min(8, Math.max(0, Math.round(lightningIntensity * 8)));
    const fKey = Math.min(12, Math.max(0, Math.round(fogAmount * 12)));
    
    const cappedMuzzle = Math.min(2.0, muzzleFlashIntensity);
    const mKey = Math.min(8, Math.max(0, Math.round(cappedMuzzle * 8)));

    // Fast 32-bit packed integer key for O(1) inline check
    const numKey = (rKey) | (gKey << 5) | (bKey << 10) | (lKey << 15) | (mKey << 18) | (fKey << 21) | (((fr ^ fg ^ fb) & 0x1F) << 25);

    // Ultra-fast path: If the sprite image itself already holds the exact same quantized tint canvas, return it instantly!
    const imgAny = img as any;
    if (imgAny._lastTintKey === numKey && imgAny._lastTintCanvas) {
        return imgAny._lastTintCanvas;
    }

    // Create unique string ID for Map cache lookup
    let imgSource = imgAny.src || imgAny.version || imgAny._spriteId;
    if (!imgSource) {
        if (img instanceof HTMLCanvasElement) {
            if (!imgAny._spriteId) {
                imgAny._spriteId = 'canvas_' + Math.random().toString(36).substring(2, 9);
            }
            imgSource = imgAny._spriteId;
        } else {
            imgSource = 'canvas';
        }
    }
    
    const key = `${imgSource}_R${rKey}_G${gKey}_B${bKey}_L${lKey}_M${mKey}_FC${fr}_${fg}_${fb}_F${fKey}`;
    if (cache.has(key)) {
        const cached = cache.get(key)!;
        imgAny._lastTintKey = numKey;
        imgAny._lastTintCanvas = cached;
        return cached;
    }
    
    // First, get or create the base tinted sprite (only lightColor applied)
    const baseKey = `${imgSource}_R${rKey}_G${gKey}_B${bKey}_L0_M0_FC${fr}_${fg}_${fb}_F${fKey}`;
    let baseCanvas: HTMLCanvasElement | HTMLImageElement | undefined = cache.get(baseKey);

    if (!baseCanvas) {
        const tempCanvas = acquireCanvas(img.width, img.height);
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.imageSmoothingEnabled = false;
            tempCtx.clearRect(0, 0, img.width, img.height);
            
            // Recompute exact quantized light values
            const qR = rKey / 16;
            const qG = gKey / 16;
            const qB = bKey / 16;
            
            const needsTint = Math.abs(qR - 1.0) >= 0.03 || Math.abs(qG - 1.0) >= 0.03 || Math.abs(qB - 1.0) >= 0.03;
            
            if (!needsTint) {
                tempCtx.drawImage(img, 0, 0);
            } else {
                const isMonochrome = Math.abs(qR - qG) < 0.01 && Math.abs(qG - qB) < 0.01;
                
                if (isMonochrome) {
                    tempCtx.drawImage(img, 0, 0);
                    tempCtx.globalCompositeOperation = 'source-atop';
                    const opacity = Math.max(0, Math.min(1.0, 1.0 - qR));
                    tempCtx.fillStyle = `rgba(0, 0, 0, ${opacity.toFixed(3)})`;
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                } else {
                    tempCtx.fillStyle = `rgb(${Math.round(qR * 255)}, ${Math.round(qG * 255)}, ${Math.round(qB * 255)})`;
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    
                    tempCtx.globalCompositeOperation = 'multiply';
                    tempCtx.drawImage(img, 0, 0);
                    
                    tempCtx.globalCompositeOperation = 'destination-in';
                    tempCtx.drawImage(img, 0, 0);
                }
            }
            
            if (fogAmount > 0) {
                tempCtx.globalCompositeOperation = 'source-atop';
                tempCtx.globalAlpha = Math.min(1.0, fKey / 12);
                tempCtx.fillStyle = `rgb(${getFogColorR()}, ${getFogColorG()}, ${getFogColorB()})`;
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tempCtx.globalAlpha = 1.0;
            }
            
            tempCtx.globalCompositeOperation = 'source-over';
            
            baseCanvas = tempCanvas;
            (baseCanvas as any)._webglTexId = baseKey;
            safeCacheSet(cache, baseKey, baseCanvas);
        } else {
            baseCanvas = img;
            if (!(baseCanvas as any)._webglTexId) {
                (baseCanvas as any)._webglTexId = baseKey;
            }
        }
    }

    // If no flashes, save to fast path and return baseCanvas
    if (lKey === 0 && mKey === 0) {
        imgAny._lastTintKey = numKey;
        imgAny._lastTintCanvas = baseCanvas;
        return baseCanvas;
    }

    // Now apply flashes using fast canvas operations
    const canvas = acquireCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseCanvas;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);

    if (cappedMuzzle > 0) {
        ctx.drawImage(baseCanvas, 0, 0);
        
        // 1. Restore original brightness (overrides darkness)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1.0, cappedMuzzle);
        ctx.drawImage(img, 0, 0);
        
        // 2. Add additive glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1.0, cappedMuzzle * 0.6);
        ctx.drawImage(img, 0, 0);
        
        // 3. Add orange/yellow tint (or flashbang tint)
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${Math.min(0.8, cappedMuzzle * 0.4)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 4. Restore original alpha channel
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0);
        
        ctx.globalCompositeOperation = 'source-over';
    } else {
        ctx.drawImage(baseCanvas, 0, 0);
    }

    if (lightningIntensity > 0) {
        // 1. Restore original brightness (lightning illuminates everything)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1.0, lightningIntensity * 1.5);
        ctx.drawImage(img, 0, 0);

        // 2. Additive glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lightningIntensity * 0.8;
        ctx.drawImage(img, 0, 0);

        // 3. Colorize
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(180, 200, 255, ${lightningIntensity * 0.6})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 4. Restore original alpha channel
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0);
        
        ctx.globalCompositeOperation = 'source-over';
    }

    (canvas as any)._webglTexId = key;
    safeCacheSet(cache, key, canvas);
    imgAny._lastTintKey = numKey;
    imgAny._lastTintCanvas = canvas;
    return canvas;
};

export const getSpriteBuffer = (
    img: HTMLCanvasElement | HTMLImageElement,
    bufferCache: Map<string, { data: Uint32Array, width: number, height: number }>
): { data: Uint32Array, width: number, height: number } | null => {
    let key = (img as any).src || (img as any).version || (img as any)._webglTexId || (img as any)._spriteId;
    if (!key) {
        (img as any)._spriteId = 'canvas_' + Math.random().toString(36).substring(2, 9);
        key = (img as any)._spriteId;
    }
    if (bufferCache.has(key)) return bufferCache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = {
        data: new Uint32Array(imageData.data.buffer),
        width: canvas.width,
        height: canvas.height
    };
    
    bufferCache.set(key, buffer);
    return buffer;
};



export const getHighlightedSprite = (
    img: HTMLImageElement | HTMLCanvasElement,
    cache: Map<string, HTMLCanvasElement | HTMLImageElement>,
    pulseValue: number,
    spriteId?: string
): HTMLCanvasElement | HTMLImageElement => {
    const qPulse = Math.round(pulseValue * 5); 
    const imgAny = img as any;
    let imgSource = imgAny.src || imgAny.version || imgAny._spriteId || imgAny._webglTexId;
    if (!imgSource) {
        if (img instanceof HTMLCanvasElement) {
            if (!imgAny._spriteId) {
                imgAny._spriteId = 'canvas_' + Math.random().toString(36).substring(2, 9);
            }
            imgSource = imgAny._spriteId;
        } else {
            imgSource = spriteId || ('img_' + Math.random().toString(36).substring(2, 9));
        }
    }
    const key = `${imgSource}_HIGHLIGHT_FLICKER_${qPulse}`;
    if (cache.has(key)) return cache.get(key)!;
    
    const canvas = acquireCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;
    
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);
    
    ctx.drawImage(img, 0, 0);
    
    if (qPulse > 0) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + (qPulse / 25)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'source-over';
    }
    
    (canvas as any)._webglTexId = key;
    safeCacheSet(cache, key, canvas);
    return canvas;
};

export const getDamagedSprite = (
    img: HTMLImageElement | HTMLCanvasElement, 
    cache: Map<string, HTMLCanvasElement | HTMLImageElement>,
    flashlightActive?: boolean
): HTMLCanvasElement | HTMLImageElement => {
    const imgAny = img as any;
    let imgSource = imgAny.src || imgAny.version || imgAny._spriteId || imgAny._webglTexId;
    if (!imgSource) {
        if (img instanceof HTMLCanvasElement) {
            if (!imgAny._spriteId) {
                imgAny._spriteId = 'canvas_' + Math.random().toString(36).substring(2, 9);
            }
            imgSource = imgAny._spriteId;
        } else {
            imgSource = 'canvas_' + Math.random().toString(36).substring(2, 9);
        }
    }
    const key = `${imgSource}_DAMAGED_FILTERED_${flashlightActive ? 'FL' : 'NOFL'}`;
    if (cache.has(key)) return cache.get(key)!;
    const canvas = acquireCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;
    
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);
    
    // Высокопроизводительный рендеринг эффекта урона без использования медленного ctx.filter
    // 1. Рисуем оригинальное изображение
    ctx.drawImage(img, 0, 0);
    
    // 2. Накладываем красный цвет на непрозрачные пиксели
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = flashlightActive ? 'rgba(180, 0, 0, 0.75)' : 'rgba(239, 68, 68, 0.7)'; // Насыщенный красный цвет крови
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 3. Смешиваем детали оригинальной текстуры обратно
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, 0, 0);
    
    // 4. Восстанавливаем оригинальную маску прозрачности (чтобы полупрозрачные края не портились)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);

    // Сбрасываем режим наложения
    ctx.globalCompositeOperation = 'source-over';
    
    (canvas as any)._webglTexId = key;
    safeCacheSet(cache, key, canvas);
    return canvas;
};
