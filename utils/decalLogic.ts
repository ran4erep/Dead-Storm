



// Helper to draw a jagged blob instead of a perfect circle
const drawIrregularBlob = (
    ctx: CanvasRenderingContext2D, 
    cx: number, 
    cy: number, 
    radius: number
) => {
    ctx.beginPath();
    const segments = 12; // Number of vertices
    const angleStep = (Math.PI * 2) / segments;

    for (let i = 0; i <= segments; i++) {
        const theta = i * angleStep;
        // Randomize radius for "splat" shape (0.5x to 1.3x base radius)
        const r = radius * (0.5 + Math.random() * 0.8); 
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
};

export const drawBloodSplat = (
    canvas: HTMLCanvasElement, 
    intensity: number = 1.0,
    relX?: number, // 0.0 to 1.0 position within tile
    relY?: number,
    surface: 'WALL' | 'FLOOR' | 'DOOR' = 'WALL' // UPDATED: Changed boolean to Enum
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // --- BLENDING & COLOR LOGIC ---
    if (surface === 'WALL' || surface === 'DOOR') {
        // Walls & Doors: Multiply creates a dark, soaked-in look
        ctx.globalCompositeOperation = 'multiply';
        const wallColors = ['rgba(160, 20, 20, 0.9)', 'rgba(140, 10, 10, 0.9)', 'rgba(100, 0, 0, 1.0)'];
        ctx.fillStyle = wallColors[Math.floor(Math.random() * wallColors.length)];
    } else {
        // Floors: Source-over for droplets sitting on top
        ctx.globalCompositeOperation = 'source-over';
        const floorColors = ['rgba(95, 0, 0, 0.9)', 'rgba(85, 0, 0, 0.95)', 'rgba(105, 5, 5, 0.85)'];
        ctx.fillStyle = floorColors[Math.floor(Math.random() * floorColors.length)];
    }

    // --- COUNT & POSITION LOGIC ---
    // If specific coords are given (particle hit), use fewer drops
    const count = relX !== undefined ? Math.floor(1 + Math.random() * 2) : Math.floor((3 + Math.random() * 4) * intensity);

    for (let i = 0; i < count; i++) {
        let cx, cy;

        if (relX !== undefined && relY !== undefined) {
            // Targeted hit (Particle)
            const jitter = surface !== 'FLOOR' ? 0.1 : 0.05; // More spread on vertical surfaces
            cx = (relX + (Math.random() - 0.5) * jitter) * w;
            cy = (relY + (Math.random() - 0.5) * jitter) * h;
        } else {
            // Random hit
            cx = Math.random() * w;
            cy = Math.random() * h;
        }

        // --- SIZE LOGIC ---
        let radius;
        if (surface !== 'FLOOR') {
            // Vertical splats: Increased max size variance
            radius = (Math.random() * (w * 0.15)) + 1.5; 
        } else {
            // Floor droplets: Tiny
            radius = (Math.random() * (w * 0.03)) + 1.5; 
        }

        // Draw the main blob
        drawIrregularBlob(ctx, cx, cy, radius);

        // Add drips/satellite drops
        const drips = Math.floor(Math.random() * 3);
        for(let j=0; j<drips; j++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * (1.5 + Math.random());
            const dx = cx + Math.cos(angle) * dist;
            const dy = cy + Math.sin(angle) * dist;
            const r = Math.random() * (radius * 0.4);
            
            if (r > 1) drawIrregularBlob(ctx, dx, dy, r);
            else {
                ctx.beginPath();
                ctx.arc(dx, dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Gravity drip for vertical surfaces
        if (surface !== 'FLOOR' && Math.random() > 0.6) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            const dripLen = radius * (2 + Math.random() * 4);
            ctx.lineTo(cx + radius*0.5, cy);
            ctx.lineTo(cx, cy + dripLen);
            ctx.lineTo(cx - radius*0.5, cy);
            ctx.fill();
        }
    }
};

export const getTextureBuffer = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
        data: new Uint32Array(imageData.data.buffer),
        width: canvas.width,
        height: canvas.height
    };
};

// --- OPTIMIZATION: CACHED SPLATS & SOFTWARE BLENDING ---

export interface BloodSplat {
    data: Uint32Array;
    width: number;
    height: number;
    type: 'WALL' | 'FLOOR' | 'SCORCH';
}

const SPLAT_CACHE_SIZE = 64; // Size of cached splat sprites
const NUM_VARIANTS = 10; // Number of variants per type

let splatCache: BloodSplat[] | null = null;

export const drawScorchMark = (
    canvas: HTMLCanvasElement, 
    intensity: number = 1.0
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.globalCompositeOperation = 'source-over';
    // We use a higher alpha now so it's clearly visible after an explosion
    const scorchColors = ['rgba(0, 0, 0, 0.4)', 'rgba(10, 5, 0, 0.5)', 'rgba(15, 10, 10, 0.45)'];
    
    // Draw base large scorch
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    drawIrregularBlob(ctx, w/2, h/2, w * 0.35);

    const count = Math.floor((4 + Math.random() * 3) * intensity);

    for (let i = 0; i < count; i++) {
        const cx = (0.3 + Math.random() * 0.4) * w;
        const cy = (0.3 + Math.random() * 0.4) * h;
        const radius = (Math.random() * (w * 0.25)) + 5.0; 
        
        ctx.fillStyle = scorchColors[Math.floor(Math.random() * scorchColors.length)];
        drawIrregularBlob(ctx, cx, cy, radius);
        
        const ashDrops = Math.floor(Math.random() * 6);
        for(let j=0; j<ashDrops; j++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * (1.0 + Math.random());
            const dx = cx + Math.cos(angle) * dist;
            const dy = cy + Math.sin(angle) * dist;
            const r = Math.random() * (radius * 0.3);
            if (r > 1.5) drawIrregularBlob(ctx, dx, dy, r);
            else {
                ctx.beginPath();
                ctx.arc(dx, dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
};

export const initBloodSplats = () => {
    if (splatCache) return splatCache;
    splatCache = [];

    // Generate Wall Splats
    for (let i = 0; i < NUM_VARIANTS; i++) {
        const cvs = document.createElement('canvas');
        cvs.width = SPLAT_CACHE_SIZE;
        cvs.height = SPLAT_CACHE_SIZE;
        // Draw a single centered splat
        drawBloodSplat(cvs, 1.0, 0.5, 0.5, 'WALL');
        const buf = getTextureBuffer(cvs);
        if (buf) splatCache.push({ ...buf, type: 'WALL' });
    }

    // Generate Floor Splats
    for (let i = 0; i < NUM_VARIANTS; i++) {
        const cvs = document.createElement('canvas');
        cvs.width = SPLAT_CACHE_SIZE;
        cvs.height = SPLAT_CACHE_SIZE;
        drawBloodSplat(cvs, 1.0, 0.5, 0.5, 'FLOOR');
        const buf = getTextureBuffer(cvs);
        if (buf) splatCache.push({ ...buf, type: 'FLOOR' });
    }

    // Generate Scorch Splats
    for (let i = 0; i < NUM_VARIANTS; i++) {
        const cvs = document.createElement('canvas');
        cvs.width = SPLAT_CACHE_SIZE;
        cvs.height = SPLAT_CACHE_SIZE;
        drawScorchMark(cvs, 1.0);
        const buf = getTextureBuffer(cvs);
        if (buf) splatCache.push({ ...buf, type: 'SCORCH' });
    }

    return splatCache;
};

export const getCachedSplat = (type: 'WALL' | 'FLOOR' | 'DOOR' | 'SCORCH'): BloodSplat | null => {
    if (!splatCache) initBloodSplats();
    if (!splatCache) return null;
    
    // Filter by type (DOOR uses WALL splats)
    const targetType = type === 'FLOOR' ? 'FLOOR' : (type === 'SCORCH' ? 'SCORCH' : 'WALL');
    const variants = splatCache.filter(s => s.type === targetType);
    if (variants.length === 0) return null;
    
    return variants[Math.floor(Math.random() * variants.length)];
};

/**
 * Blends a blood splat onto a target buffer using integer math.
 * This avoids ctx.getImageData() and is much faster.
 */
export const blitSplat = (
    target: Uint32Array, 
    targetW: number, 
    targetH: number,
    splat: BloodSplat,
    x: number, // Center X
    y: number, // Center Y
    mode: 'MULTIPLY' | 'SOURCE-OVER'
) => {
    const halfW = splat.width >> 1;
    const halfH = splat.height >> 1;
    
    // Calculate bounds
    const startX = Math.floor(x - halfW);
    const startY = Math.floor(y - halfH);
    const endX = startX + splat.width;
    const endY = startY + splat.height;

    // Clipping
    const clipStartX = Math.max(0, startX);
    const clipStartY = Math.max(0, startY);
    const clipEndX = Math.min(targetW, endX);
    const clipEndY = Math.min(targetH, endY);

    for (let py = clipStartY; py < clipEndY; py++) {
        const targetRowOffset = py * targetW;
        const splatRowOffset = (py - startY) * splat.width;
        
        for (let px = clipStartX; px < clipEndX; px++) {
            const splatPixel = splat.data[splatRowOffset + (px - startX)];
            
            // Check alpha (ABGR format: A is high byte)
            const splatA = (splatPixel >>> 24) & 0xFF;
            
            if (splatA > 5) { // Threshold to skip transparent pixels
                const targetIdx = targetRowOffset + px;
                const targetPixel = target[targetIdx];

                const tR = targetPixel & 0xFF;
                const tG = (targetPixel >>> 8) & 0xFF;
                const tB = (targetPixel >>> 16) & 0xFF;
                // tA is usually 255 for textures, but we should preserve it
                const tA = (targetPixel >>> 24) & 0xFF;

                const sR = splatPixel & 0xFF;
                const sG = (splatPixel >>> 8) & 0xFF;
                const sB = (splatPixel >>> 16) & 0xFF;

                let r, g, b;
                let finalA = tA;

                // Update Alpha: If splat is more opaque than target, increase target opacity
                // This ensures blood on glass makes the glass opaque
                if (splatA > tA) {
                    finalA = splatA;
                }

                if (mode === 'MULTIPLY') {
                    // Lerp(Target, Target * Splat, Alpha)
                    // But wait, the splat color is already dark red.
                    // If we just alpha blend, it covers the texture.
                    // If we multiply, we darken it.
                    // The original code used 'multiply' composite.
                    // Formula: Result = Target * Source
                    // But we want to apply it only where splat has alpha.
                    
                    // Standard multiply: R = (tR * sR) / 255
                    // But we need to account for splat alpha.
                    // If splat is transparent (alpha 0), we want NO change (tR).
                    // If splat is opaque (alpha 255), we want (tR * sR) / 255.
                    
                    const blendedR = (tR * sR) / 255;
                    const blendedG = (tG * sG) / 255;
                    const blendedB = (tB * sB) / 255;

                    const alphaNorm = splatA / 255;
                    
                    r = tR * (1 - alphaNorm) + blendedR * alphaNorm;
                    g = tG * (1 - alphaNorm) + blendedG * alphaNorm;
                    b = tB * (1 - alphaNorm) + blendedB * alphaNorm;

                } else {
                    // SOURCE-OVER (Standard Alpha Blend)
                    const alphaNorm = splatA / 255;
                    
                    r = sR * alphaNorm + tR * (1 - alphaNorm);
                    g = sG * alphaNorm + tG * (1 - alphaNorm);
                    b = sB * alphaNorm + tB * (1 - alphaNorm);
                }

                // Reassemble (ABGR)
                target[targetIdx] = (finalA << 24) | ((b & 0xFF) << 16) | ((g & 0xFF) << 8) | (r & 0xFF);
            }
        }
    }
};
