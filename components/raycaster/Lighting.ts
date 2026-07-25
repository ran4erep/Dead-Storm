
import { getIntDepthFactor, isFogWeather } from './DepthEffect';
import { adjustLightForClosedDoors } from './RaycasterUtils';

export interface LightingResult {
    rMultInt: number;
    gMultInt: number;
    bMultInt: number;
    fRInt: number;
    fGInt: number;
    fBInt: number;
    fogAmtInt?: number;
}

const DEFAULT_LIGHT = {r: 1, g: 1, b: 1};

// Reusable fast solid grid map to eliminate multi-level grid object traversals per ray
let cachedSolidMap = new Uint8Array(128 * 128);
let cachedSolidMapWidth = 0;
let cachedSolidMapHeight = 0;

export const updateLightingSolidMap = (grid: any[][], activeGrids?: any[][][]) => {
    if (!grid) return;
    const height = grid.length;
    const width = grid[0]?.length || 0;
    if (width === 0 || height === 0) return;

    const total = width * height;
    if (cachedSolidMap.length < total) {
        cachedSolidMap = new Uint8Array(total * 2);
    }
    cachedSolidMapWidth = width;
    cachedSolidMapHeight = height;

    cachedSolidMap.fill(0, 0, total);

    if (activeGrids && activeGrids.length > 0) {
        for (let l = 0; l < activeGrids.length; l++) {
            const layer = activeGrids[l];
            if (!layer) continue;
            for (let y = 0; y < height; y++) {
                const row = layer[y];
                if (!row) continue;
                const offset = y * width;
                for (let x = 0; x < width; x++) {
                    const tile = row[x];
                    if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                        cachedSolidMap[offset + x] = 1;
                    }
                }
            }
        }
    } else {
        for (let y = 0; y < height; y++) {
            const row = grid[y];
            if (!row) continue;
            const offset = y * width;
            for (let x = 0; x < width; x++) {
                const tile = row[x];
                if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                    cachedSolidMap[offset + x] = 1;
                }
            }
        }
    }
};

export const calculateLighting = (
    mapX: number,
    mapY: number,
    side: number,
    isDoorEdge: boolean,
    isDoorFrame: boolean,
    perpWallDist: number,
    lightMap: { r: number; g: number; b: number }[][] | undefined,
    outdoorMap: boolean[][] | undefined,
    lightningMap: Float32Array | null | undefined,
    lightningIntensity: number,
    muzzleFlashIntensity: number,
    activeFlashes: {x: number, y: number, intensity: number}[] | undefined,
    posX: number,
    posY: number,
    rayDirX: number,
    rayDirY: number,
    stepX: number,
    stepY: number,
    isDoor: boolean,
    grid: any[][],
    flashlightActive: boolean = false,
    flashlightBatteryRatio: number = 1.0,
    outResult: LightingResult,
    activeGrids?: any[][][],
    forceWallBehavior: boolean = false,
    currentLevelIndex?: number
): void => {
    const mapWidth = grid[0]?.length || 0;
    const mapHeight = grid.length;

    let wallWorldX = posX + perpWallDist * rayDirX;
    let wallWorldY = posY + perpWallDist * rayDirY;

    let lightX = mapX, lightY = mapY;
    
    let shouldStepBack = forceWallBehavior;
    if (!shouldStepBack && mapY >= 0 && mapY < mapHeight && mapX >= 0 && mapX < mapWidth) {
        if (cachedSolidMapWidth === mapWidth && cachedSolidMapHeight === mapHeight) {
            shouldStepBack = cachedSolidMap[mapY * mapWidth + mapX] === 1;
        } else if (activeGrids && activeGrids.length > 0) {
            const numGrids = activeGrids.length;
            for (let l = 0; l < numGrids; l++) {
                const layer = activeGrids[l];
                if (layer) {
                    const row = layer[mapY];
                    if (row) {
                        const tile = row[mapX];
                        if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                            shouldStepBack = true;
                            break;
                        }
                    }
                }
            }
        } else {
            const row = grid[mapY];
            if (row) {
                const tile = row[mapX];
                if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                    shouldStepBack = true;
                }
            }
        }
    }

    if (shouldStepBack) {
        if (side === 0) { lightX -= stepX; }
        else { lightY -= stepY; }
    }

    let adjX = lightX;
    let adjY = lightY;
    if (!forceWallBehavior) {
        // Fast path: Only do adjustment if the current cell is a Door
        let hasDoor = false;
        if (lightY >= 0 && lightY < mapHeight && lightX >= 0 && lightX < mapWidth) {
            const row = grid[lightY];
            if (row) {
                const tile = row[lightX];
                if (tile && tile.type === 'DOOR') {
                    hasDoor = true;
                }
            }
            if (!hasDoor && activeGrids && activeGrids[0]) {
                const row0 = activeGrids[0][lightY];
                if (row0) {
                    const tile0 = row0[lightX];
                    if (tile0 && tile0.type === 'DOOR') {
                        hasDoor = true;
                    }
                }
            }
        }
        if (hasDoor) {
            const adj = adjustLightForClosedDoors(lightX, lightY, rayDirX, rayDirY, grid, activeGrids);
            adjX = adj.x;
            adjY = adj.y;
        }
    }
    lightX = adjX;
    lightY = adjY;

    let rMultInt = 256, gMultInt = 256, bMultInt = 256;
    if (lightMap) { 
        let r = 1.0, g = 1.0, b = 1.0;
        if (lightY >= 0 && lightY < mapHeight && lightX >= 0 && lightX < mapWidth) {
            const lightRow = lightMap[lightY];
            if (lightRow) {
                const cellC = lightRow[lightX] || DEFAULT_LIGHT;
                
                // Рассчитываем точное положение на стене (wallX от 0 до 1) для интерполяции
                let wallX = side === 0 ? (posY + perpWallDist * rayDirY) : (posX + perpWallDist * rayDirX);
                wallX -= Math.floor(wallX);
                if (wallX < 0) wallX = 0;
                if (wallX > 1) wallX = 1;

                let flipped = (side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0);
                if (flipped) {
                    wallX = 1 - wallX;
                }

                // Определяем соседей строго вдоль плоскости видимой игроком грани стены
                let lightX_L = lightX, lightY_L = lightY;
                let lightX_R = lightX, lightY_R = lightY;

                if (side === 0) {
                    if (flipped) { lightY_L = lightY + 1; lightY_R = lightY - 1; }
                    else { lightY_L = lightY - 1; lightY_R = lightY + 1; }
                } else {
                    if (flipped) { lightX_L = lightX + 1; lightX_R = lightX - 1; }
                    else { lightX_L = lightX - 1; lightX_R = lightX + 1; }
                }

                // Быстрая проверка непрозрачности соседей через cachedSolidMap
                let opaqueL = (lightY_L < 0 || lightY_L >= mapHeight || lightX_L < 0 || lightX_L >= mapWidth);
                if (!opaqueL) {
                    if (cachedSolidMapWidth === mapWidth && cachedSolidMapHeight === mapHeight) {
                        opaqueL = cachedSolidMap[lightY_L * mapWidth + lightX_L] === 1;
                    } else if (activeGrids && activeGrids.length > 0) {
                        const targetL = currentLevelIndex !== undefined ? currentLevelIndex : 0;
                        if (targetL >= 0 && targetL < activeGrids.length) {
                            const layer = activeGrids[targetL];
                            if (layer && layer[lightY_L]) {
                                const tile = layer[lightY_L][lightX_L];
                                if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                                    opaqueL = true;
                                }
                            }
                        }
                    } else {
                        const rowL = grid[lightY_L];
                        if (rowL && rowL[lightX_L]) {
                            const tile = rowL[lightX_L];
                            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                                opaqueL = true;
                            }
                        }
                    }
                }

                let opaqueR = (lightY_R < 0 || lightY_R >= mapHeight || lightX_R < 0 || lightX_R >= mapWidth);
                if (!opaqueR) {
                    if (cachedSolidMapWidth === mapWidth && cachedSolidMapHeight === mapHeight) {
                        opaqueR = cachedSolidMap[lightY_R * mapWidth + lightX_R] === 1;
                    } else if (activeGrids && activeGrids.length > 0) {
                        const targetR = currentLevelIndex !== undefined ? currentLevelIndex : 0;
                        if (targetR >= 0 && targetR < activeGrids.length) {
                            const layer = activeGrids[targetR];
                            if (layer && layer[lightY_R]) {
                                const tile = layer[lightY_R][lightX_R];
                                if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                                    opaqueR = true;
                                }
                            }
                        }
                    } else {
                        const rowR = grid[lightY_R];
                        if (rowR && rowR[lightX_R]) {
                            const tile = rowR[lightX_R];
                            if (tile && (tile.type === 'WALL' || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                                opaqueR = true;
                            }
                        }
                    }
                }

                // Сэмплируем освещение у соседей, только если они прозрачны (свободны)
                const rowMapL = lightMap[lightY_L];
                const rowMapR = lightMap[lightY_R];
                const cellL = (!opaqueL && rowMapL) ? (rowMapL[lightX_L] || cellC) : cellC;
                const cellR = (!opaqueR && rowMapR) ? (rowMapR[lightX_R] || cellC) : cellC;

                // Непрерывная линейная интерполяция между центрами клеток
                if (wallX <= 0.5) {
                    const t = wallX + 0.5;
                    r = cellL.r * (1.0 - t) + cellC.r * t;
                    g = cellL.g * (1.0 - t) + cellC.g * t;
                    b = cellL.b * (1.0 - t) + cellC.b * t;
                } else {
                    const t = wallX - 0.5;
                    r = cellC.r * (1.0 - t) + cellR.r * t;
                    g = cellC.g * (1.0 - t) + cellR.g * t;
                    b = cellC.b * (1.0 - t) + cellR.b * t;
                }
            }
        }

        if (flashlightActive) {
            let quality = 1.0;
            if (flashlightBatteryRatio <= 0.5) {
                const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                quality = factor * 0.5 + 0.5;
            }
            const floorValue = 0.08 * quality;
            if (r < floorValue) r = floorValue;
            if (g < floorValue) g = floorValue;
            if (b < floorValue) b = floorValue;
        }

        rMultInt = (r * 256) | 0; 
        gMultInt = (g * 256) | 0; 
        bMultInt = (b * 256) | 0; 
    }

    if (side === 1) { 
        rMultInt = (rMultInt * 179) >> 8; 
        gMultInt = (gMultInt * 179) >> 8; 
        bMultInt = (bMultInt * 179) >> 8; 
    }
    if (isDoorEdge) { 
        rMultInt = (rMultInt * 128) >> 8; 
        gMultInt = (gMultInt * 128) >> 8; 
        bMultInt = (bMultInt * 128) >> 8; 
    }
    if (isDoorFrame) { 
        rMultInt = (rMultInt * 204) >> 8; 
        gMultInt = (gMultInt * 204) >> 8; 
        bMultInt = (bMultInt * 204) >> 8; 
    }
    
    const distFogInt = getIntDepthFactor(perpWallDist);
    rMultInt = (rMultInt * distFogInt) >> 8; 
    gMultInt = (gMultInt * distFogInt) >> 8; 
    bMultInt = (bMultInt * distFogInt) >> 8;

    // Flash lighting calculation (Fast Path with distance culling)
    let fR = 0, fG = 0, fB = 0;
    const hasActiveFlashes = activeFlashes && activeFlashes.length > 0;

    if (lightningIntensity > 0 || muzzleFlashIntensity > 0 || hasActiveFlashes) {
        const isOutdoor = outdoorMap ? (lightY >= 0 && lightY < mapHeight && lightX >= 0 && lightX < mapWidth ? outdoorMap[lightY][lightX] : false) : true;
        const lightningMult = lightningMap && lightY >= 0 && lightY < mapHeight && lightX >= 0 && lightX < mapWidth ? lightningMap[lightY * mapWidth + lightX] : (isOutdoor ? 1.0 : 0.0);
        const effectiveLightningIntensity = lightningIntensity * lightningMult;

        if (effectiveLightningIntensity > 0 || muzzleFlashIntensity > 0 || hasActiveFlashes) {
            let flashAttenuation = 0.25;
            if (flashlightActive) {
                 let quality = 1.0;
                 if (flashlightBatteryRatio <= 0.5) {
                     const factor = Math.max(0, flashlightBatteryRatio - 0.47) / 0.03;
                     quality = factor * 0.5 + 0.5;
                 }
                 flashAttenuation = 1.0 - (0.75 * quality); 
            }

            const muzzleR = 1.0, muzzleG = 0.8, muzzleB = 0.3;
            let mInt = 0;
            if (muzzleFlashIntensity > 0) {
                const dx = wallWorldX - posX;
                const dy = wallWorldY - posY;
                const playerDistSq = dx * dx + dy * dy;
                mInt = (flashlightActive ? muzzleFlashIntensity * flashAttenuation : muzzleFlashIntensity) / (playerDistSq * 0.5 + 1.0);
            }
            
            let enemyFlashR = 0, enemyFlashG = 0, enemyFlashB = 0;
            if (hasActiveFlashes) {
                const len = activeFlashes!.length;
                for (let i = 0; i < len; i++) {
                    const f = activeFlashes![i] as any;
                    const fdx = f.x - wallWorldX;
                    const fdy = f.y - wallWorldY;
                    const d2 = fdx * fdx + fdy * fdy;
                    if (d2 > 100) continue; // Distance cull
                    let fInt = f.intensity / (d2 * 0.5 + 1.0); 
                    if (flashlightActive) fInt *= flashAttenuation;
                    if (f.isFlashbang) {
                        enemyFlashR += fInt * 2.0; enemyFlashG += fInt * 2.0; enemyFlashB += fInt * 2.0;
                    } else {
                        enemyFlashR += fInt * muzzleR; enemyFlashG += fInt * muzzleG; enemyFlashB += fInt * muzzleB;
                    }
                }
            }

            if (effectiveLightningIntensity > 0) {
                const lightningR = 0.6, lightningG = 0.65, lightningB = 0.8;
                fR += effectiveLightningIntensity * lightningR;
                fG += effectiveLightningIntensity * lightningG;
                fB += effectiveLightningIntensity * lightningB;
            }
            if (mInt > 0) {
                fR += mInt * muzzleR;
                fG += mInt * muzzleG;
                fB += mInt * muzzleB;
            }
            fR += enemyFlashR;
            fG += enemyFlashG;
            fB += enemyFlashB;
        }
    }

    outResult.rMultInt = rMultInt;
    outResult.gMultInt = gMultInt;
    outResult.bMultInt = bMultInt;
    outResult.fRInt = (fR * 255) | 0;
    outResult.fGInt = (fG * 255) | 0;
    outResult.fBInt = (fB * 255) | 0;
    if (isFogWeather()) {
        outResult.fogAmtInt = 256 - distFogInt;
    } else {
        outResult.fogAmtInt = 0;
    }
};
