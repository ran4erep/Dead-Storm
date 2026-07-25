
export const makeTextureAlpha = (img: HTMLImageElement | HTMLCanvasElement, alpha: number = 0.5): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, 0, 0);
    }
    return canvas;
};

export const getDominantColor = (video: HTMLVideoElement): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#0f0f12';

    canvas.width = 16; // Small size for performance
    canvas.height = 16;
    
    try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
            // Skip transparent or very dark pixels to avoid black dominance
            if (data[i+3] < 128 || (data[i] < 20 && data[i+1] < 20 && data[i+2] < 20)) continue;
            
            r += data[i];
            g += data[i+1];
            b += data[i+2];
            count++;
        }

        if (count === 0) return '#0f0f12';

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        return `rgb(${r},${g},${b})`;
    } catch (e) {
        return '#0f0f12';
    }
};
