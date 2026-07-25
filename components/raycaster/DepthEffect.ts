
/**
 * Depth of Field / Distance Fog Effect
 * 
 * This module handles the darkening of pixels based on their distance from the camera.
 * It uses a quadratic falloff formula to simulate light attenuation and fog.
 */

// Global render distance state for fog
let currentRenderDistance = 15;
let originalRenderDistance = 15;
let currentWeather = 'none';
let isFogCache = false;
let isDistanceShadingDisabled = false;

export const setDisableDistanceShading = (disable: boolean) => {
    if (isDistanceShadingDisabled !== disable) {
        isDistanceShadingDisabled = disable;
        updatePrecomputedFog();
    }
};

export const getDisableDistanceShading = () => isDistanceShadingDisabled;

// Precomputed variables for high-performance CPU calculations and WebGL uniforms
let cachedFogStart = 5.0;
let cachedInvFogRange = 1.0 / 10.0;
let cachedInvRenderDistance = 1.0 / 15.0;
let currentMinBrightness = 0.05;

// High-performance precomputed Lookup Table (LUT) for O(1) CPU depth factor lookups
const LUT_SIZE = 2048;
const LUT_MAX_DIST = 128.0;
const LUT_SCALE = LUT_SIZE / LUT_MAX_DIST; // 16 entries per meter

const DEPTH_FACTOR_LUT = new Float32Array(LUT_SIZE);
const INT_DEPTH_FACTOR_LUT = new Uint16Array(LUT_SIZE);

const updatePrecomputedFog = () => {
    if (isDistanceShadingDisabled) {
        cachedFogStart = 999999.0;
        cachedInvFogRange = 0.0;
        cachedInvRenderDistance = 0.0;
        DEPTH_FACTOR_LUT.fill(1.0);
        INT_DEPTH_FACTOR_LUT.fill(256);
        return;
    }
    cachedFogStart = Math.max(5.0, currentRenderDistance * 0.25);
    const range = currentRenderDistance - cachedFogStart;
    cachedInvFogRange = range > 0 ? 1.0 / range : 0.0;
    cachedInvRenderDistance = currentRenderDistance > 0 ? 1.0 / currentRenderDistance : 0.0;

    const invScale = 1.0 / LUT_SCALE;
    for (let i = 0; i < LUT_SIZE; i++) {
        const distance = i * invScale;
        let factor = 1.0;
        if (isFogCache) {
            if (distance <= 0) {
                factor = 1.0;
            } else if (distance >= currentRenderDistance) {
                factor = 0.0;
            } else {
                const t = distance * cachedInvRenderDistance;
                factor = 1.0 - (t * t * (3.0 - 2.0 * t));
            }
        } else {
            if (distance <= cachedFogStart) {
                factor = 1.0;
            } else {
                const t = (distance - cachedFogStart) * cachedInvFogRange;
                if (t >= 1.0) {
                    factor = currentMinBrightness;
                } else {
                    const smooth = 1.0 - (t * t * (3.0 - 2.0 * t));
                    factor = smooth > currentMinBrightness ? smooth : currentMinBrightness;
                }
            }
        }
        DEPTH_FACTOR_LUT[i] = factor;
        INT_DEPTH_FACTOR_LUT[i] = (factor * 256) | 0;
    }
};

// Initialize LUT on module load
updatePrecomputedFog();

export const getFogStart = () => isDistanceShadingDisabled ? 999999.0 : cachedFogStart;
export const getInvFogRange = () => isDistanceShadingDisabled ? 0.0 : cachedInvFogRange;
export const getInvRenderDistance = () => isDistanceShadingDisabled ? 0.0 : cachedInvRenderDistance;

export const setDepthRenderDistance = (dist: number, originalDist?: number) => {
    currentRenderDistance = dist;
    if (originalDist !== undefined) {
        originalRenderDistance = originalDist;
    } else {
        originalRenderDistance = dist;
    }
    updatePrecomputedFog();
};

let currentFogColorInt = 0xFFD2C8BE; // Default ABGR (A=255, B=210, G=200, R=190)
let currentFogR = 190, currentFogG = 200, currentFogB = 210;

export const setDepthWeather = (weather: string, fogColorHex?: string) => {
    currentWeather = weather;
    isFogCache = weather === 'fog';
    if (fogColorHex && fogColorHex.length === 7) {
        const r = parseInt(fogColorHex.substring(1, 3), 16);
        const g = parseInt(fogColorHex.substring(3, 5), 16);
        const b = parseInt(fogColorHex.substring(5, 7), 16);
        currentFogR = r;
        currentFogG = g;
        currentFogB = b;
        currentFogColorInt = (255 << 24) | (b << 16) | (g << 8) | r;
    } else {
        currentFogR = 190;
        currentFogG = 200;
        currentFogB = 210;
        currentFogColorInt = 0xFFD2C8BE;
    }
    updatePrecomputedFog();
};

export const getCurrentRenderDistance = () => currentRenderDistance;
export const getOriginalRenderDistance = () => originalRenderDistance;

// Minimum brightness to ensure things aren't pitch black immediately (optional)
const MIN_BRIGHTNESS = 0.05;

export const setDepthAmbientBrightness = (brightness: number) => {
    const b = Math.min(1.0, Math.max(0.0, brightness));
    // Чем ярче сектор - тем менее чёрная эта чернота (минимальная яркость на расстоянии выше, до 0.40)
    currentMinBrightness = 0.05 + 0.35 * b;
    updatePrecomputedFog();
};

export const getMinBrightness = () => isDistanceShadingDisabled ? 1.0 : currentMinBrightness;

export const getFogColorR = () => currentFogR;
export const getFogColorG = () => currentFogG;
export const getFogColorB = () => currentFogB;

export const getFogAmount = (distance: number): number => {
    if (!isFogCache) return 0;
    const factor = getDepthFactor(distance);
    return 1.0 - factor;
};

export const isFogWeather = (): boolean => {
    return isFogCache;
};

export const getFogColorInt = (): number => {
    if (isFogCache) {
        return currentFogColorInt;
    }
    return 0xFF000000;
};

/**
 * Calculates the visibility factor (0.0 to 1.0) based on distance.
 * Ultra-fast O(1) LUT lookup eliminating floating point math and cubic curves per ray.
 * 1.0 = Fully visible
 * 0.0 = Fully obscured (black)
 */
export const getDepthFactor = (distance: number): number => {
    if (isDistanceShadingDisabled) return 1.0;
    const idx = (distance * LUT_SCALE) | 0;
    if (idx <= 0) return 1.0;
    if (idx >= LUT_SIZE) return DEPTH_FACTOR_LUT[2047];
    return DEPTH_FACTOR_LUT[idx];
};

/**
 * Returns integer visibility factor (0 to 256) based on distance.
 * Ultra-fast O(1) integer LUT lookup.
 */
export const getIntDepthFactor = (distance: number): number => {
    if (isDistanceShadingDisabled) return 256;
    const idx = (distance * LUT_SCALE) | 0;
    if (idx <= 0) return 256;
    if (idx >= LUT_SIZE) return INT_DEPTH_FACTOR_LUT[2047];
    return INT_DEPTH_FACTOR_LUT[idx];
};

export const getOriginalDepthFactor = (distance: number): number => {
    if (isDistanceShadingDisabled) return 1.0;
    if (isFogCache) {
        if (distance <= 0) return 1.0;
        if (distance >= originalRenderDistance) return 0.0;
        const t = distance / originalRenderDistance;
        return 1.0 - (t * t * (3 - 2 * t));
    }

    // Зона полной видимости без тумана (минимум 5.0 метров)
    const fogStart = Math.max(5.0, originalRenderDistance * 0.25);
    if (distance <= fogStart) return 1.0;
    const fogRange = originalRenderDistance - fogStart;
    if (fogRange <= 0) return currentMinBrightness;
    const t = Math.min(1.0, (distance - fogStart) / fogRange);
    return Math.max(currentMinBrightness, 1.0 - (t * t * (3 - 2 * t)));
};

/**
 * Applies depth shading to a 32-bit integer color (ABGR format).
 * @param color The original color in 0xAABBGGRR format (Little Endian uint32)
 * @param distance The distance from the camera to the pixel
 * @returns The shaded color
 */
export const applyDepthShading = (color: number, distance: number): number => {
    const factor = getDepthFactor(distance);

    // Extract channels (Little Endian: R is lowest byte)
    let r = color & 0xFF;
    let g = (color >> 8) & 0xFF;
    let b = (color >> 16) & 0xFF;
    const a = (color >> 24) & 0xFF;

    // Apply factor
    if (isFogCache) {
        const fogR = currentFogR;
        const fogG = currentFogG;
        const fogB = currentFogB;
        // factor goes from 1.0 (clear) to 0.05 (fog)
        const fogAmount = 1.0 - factor;
        r = Math.min(255, r * factor + fogR * fogAmount) | 0;
        g = Math.min(255, g * factor + fogG * fogAmount) | 0;
        b = Math.min(255, b * factor + fogB * fogAmount) | 0;
    } else {
        r = (r * factor) | 0;
        g = (g * factor) | 0;
        b = (b * factor) | 0;
    }

    // Reassemble
    return (a << 24) | (b << 16) | (g << 8) | r;
};

/**
 * Applies depth shading to a brightness value (0.0 to 1.0).
 * Useful for sprites that use a brightness multiplier.
 * @param brightness The original brightness
 * @param distance The distance from the camera
 * @returns The shaded brightness
 */
export const applyDepthBrightness = (brightness: number, distance: number): number => {
    const factor = getDepthFactor(distance);
    return brightness * factor;
};
