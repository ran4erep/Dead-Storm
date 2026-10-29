
import React from 'react';
import { Particle, updateParticles, drawParticles, createRainSplash, createRainParticles, casingParticles, updateCasingParticles, bloodParticles, updateBloodParticles, rainSplashParticles, updateRainSplashParticles } from '../../utils/particleSystem';
import { Tile } from '../../types';
import { prepareSpriteWindowOcclusion } from './WindowRenderer';

interface ParticleRenderProps {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    posX: number;
    posY: number;
    dirX: number;
    dirY: number;
    planeX: number;
    planeY: number;
    horizon: number;
    particlesRef: React.MutableRefObject<Particle[]>;
    rainRef: React.MutableRefObject<Particle[]>;
    zBuffer: number[];
    drawnParticles: Set<Particle>;
    weather: 'none' | 'rain';
    playerPos: { x: number; y: number };
    onParticleHit?: (x: number, y: number, z: number, type: 'WALL' | 'FLOOR', face?: number) => void;
    onShardLanded?: (p: Particle) => void;
    onParticleBounce?: (p: Particle) => void;
    grid: Tile[][];
    grids?: Tile[][][]; // Add grids prop
    auxBuffers?: Map<string, { data: Uint32Array, width: number, height: number }>;
    sprites?: Map<string, HTMLImageElement>;
    resolutionDivisor?: number;
    maskCtx?: CanvasRenderingContext2D | null;
    lightMap?: { r: number, g: number, b: number }[][];
    webglRenderer?: any;
    isWebGLActive?: boolean;
    lightningIntensity?: number;
    lightningMap?: Float32Array | null;
    outdoorMap?: boolean[][];
    ceilingType?: string;
}

export const updateAndProcessParticles = ({
    width, height, posX, posY, dirX, dirY, planeX, planeY, horizon,
    particlesRef, rainRef, weather, playerPos, onParticleHit, onShardLanded, onParticleBounce, grid, grids, isPaused, fov, outdoorMap, cameraZ, passThroughWalls
}: any) => {
    const mapHeight = grid.length;
    const mapWidth = grid[0]?.length || 0;

    // Optimization: Pre-calculate determinant and inverse determinant
    const det = planeX * dirY - dirX * planeY;
    const invDet = 1.0 / det;

    const processParticle = (p: Particle) => {
        if (p.type === 'fly') return;
        const px = p.worldX - posX;
        const py = p.worldY - posY;
        
        // Optimized projection using pre-calculated invDet
        const transX = invDet * (dirY * px - dirX * py);
        const transY = invDet * (-planeY * px + planeX * py);
        
        p.dist = transY;
        if (transY > 0.1) {
            p.x = Math.floor((width / 2) * (1 + transX / transY));
            const lh = Math.abs(Math.floor(height / transY));
            p.y = horizon + lh * ((cameraZ || 0.5) - p.worldZ);
            
            // Check overhang, window frames, and pit wall occlusion
            if (passThroughWalls && p.x >= 0 && p.x < width) {
                let targetX = p.x;
                if (!passThroughWalls[targetX] || passThroughWalls[targetX].length === 0) {
                    for (let offset = 1; offset <= 4; offset++) {
                        if (targetX - offset >= 0 && passThroughWalls[targetX - offset] && passThroughWalls[targetX - offset].length > 0) {
                            targetX = targetX - offset;
                            break;
                        }
                        if (targetX + offset < width && passThroughWalls[targetX + offset] && passThroughWalls[targetX + offset].length > 0) {
                            targetX = targetX + offset;
                            break;
                        }
                    }
                }
                const ptw = passThroughWalls[targetX];
                if (ptw && ptw.length > 0) {
                    const cameraX = (2 * targetX) / width - 1;
                    const rayDirX = dirX + planeX * cameraX;
                    const rayDirY = dirY + planeY * cameraX;

                    for (let i = 0; i < ptw.length; i++) {
                        const pt = ptw[i];
                        if (transY > pt.dist) {
                            if (pt.isPolyOccluder) {
                                if (p.y >= pt.wallTop && p.y <= pt.wallBottom) {
                                    p.x = -1000;
                                    break;
                                }
                                continue;
                            }

                            const isPitOrFloorWall = pt.isPitWall || pt.isFloorWall;
                            const topZValue = pt.topZ !== undefined ? pt.topZ : 1.0;
                            
                            // If it's a pit or floor wall with positive height (elevated platform),
                            // we skip its occlusion logic just like we do for corpses.
                            if (isPitOrFloorWall && topZValue > 0) {
                                continue;
                            }
                            
                            if (pt.isWindow || pt.cutoutTop !== undefined || pt.cutoutBottom !== undefined) {
                                const prep = prepareSpriteWindowOcclusion(
                                    pt,
                                    height,
                                    horizon,
                                    cameraZ || 0.5,
                                    posX,
                                    posY,
                                    rayDirX,
                                    rayDirY
                                );

                                if (prep.isAlwaysOccluded || p.y < prep.actualCutoutTop || p.y >= prep.actualCutoutBot) {
                                    p.x = -1000;
                                    break;
                                }
                            } else {
                                const ptLh = height / pt.dist;
                                const absTopZ = pt.layer + topZValue;
                                const absBotZ = pt.layer + (pt.bottomZ !== undefined ? pt.bottomZ : 0.0);
                                
                                const levelDrawEnd = Math.ceil(horizon + ptLh * ((cameraZ || 0.5) - absBotZ));
                                const levelDrawStart = Math.floor(horizon + ptLh * ((cameraZ || 0.5) - absTopZ));

                                if (isPitOrFloorWall) {
                                    // For pit / floor-step walls, the wall occupies [levelDrawStart, levelDrawEnd].
                                    if (p.y >= levelDrawStart && p.y <= levelDrawEnd) {
                                        p.x = -1000;
                                        break;
                                    }
                                } else {
                                    // Standard overhang / upper wall stack check
                                    if (p.y < levelDrawEnd) {
                                        p.x = -1000; // Occlude
                                        break;
                                    }
                                    
                                    // Occlude if behind the bottom cap (ceiling of the upper block)
                                    if (pt.layer >= 1 && p.y >= levelDrawEnd && p.y < horizon && p.type === 'rain') {
                                        const distToP = ((pt.layer - (cameraZ || 0.5)) * height) / (horizon - p.y);
                                        if (distToP >= pt.dist && distToP <= pt.exitDist && transY > distToP) {
                                            p.x = -1000;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            p.x = -1000; p.y = -1000; 
        }
    };

    if (particlesRef.current.length > 0 || rainRef.current.length > 0 || casingParticles.length > 0 || bloodParticles.length > 0 || rainSplashParticles.length > 0) { 
        if (!isPaused) {
            // Pass grid and callback for wall/floor collision FIRST so dist is up-to-date
            particlesRef.current = updateParticles(
                particlesRef.current, 
                grid, 
                mapWidth, 
                mapHeight, 
                onParticleHit,
                onShardLanded,
                onParticleBounce
            ); 
            
            updateCasingParticles(grid, mapWidth, mapHeight, onParticleBounce);
            updateBloodParticles(grid, mapWidth, mapHeight, onParticleHit);
            updateRainSplashParticles();
            
            if (weather === 'rain') {
                const rain = rainRef.current;
                
                for (let i = 0; i < rain.length; i++) {
                    const p = rain[i];

                    const dx = p.worldX - playerPos.x;
                    const dy = p.worldY - playerPos.y;
                    const distSq = dx * dx + dy * dy;
                    
                    let needsRespawn = false;
                    let randomizeZ = false;
                    let isCovered = false;

                    const tx = Math.floor(p.worldX);
                    const ty = Math.floor(p.worldY);
                    
                    if (ty >= 0 && ty < mapHeight && tx >= 0 && tx < mapWidth) {
                        if (outdoorMap && !outdoorMap[ty][tx]) {
                            isCovered = true;
                        } else if (grids && grids.length > 1) {
                            const upperTile = grids[1][ty]?.[tx];
                            if (upperTile && (upperTile.type === 'WALL' || upperTile.bottomTextureId)) {
                                isCovered = true;
                            }
                        }
                    } else {
                        isCovered = true;
                    }

                    if (isCovered || p.worldZ <= p.floorZ) {
                        needsRespawn = true;
                        if (!isCovered && p.worldZ <= p.floorZ) {
                            // Only splash if roughly in front to save performance
                            const transY = invDet * (-planeY * dx + planeX * dy);
                            if (transY > -2) {
                                createRainSplash(p.worldX, p.worldY);
                            }
                        }
                    } else if (distSq > 100) { // Radius 10
                        needsRespawn = true;
                        randomizeZ = true; // Player moved away, respawn anywhere in volume
                    }

                    if (needsRespawn) {
                        let newX, newY;
                        let validSpawn = false;
                        let attempts = 0;
                        
                        while (!validSpawn && attempts < 5) {
                            const spawnDist = Math.random() * 10;
                            const spawnAngle = Math.random() * Math.PI * 2;
                            
                            newX = playerPos.x + Math.cos(spawnAngle) * spawnDist;
                            newY = playerPos.y + Math.sin(spawnAngle) * spawnDist;
                            
                            const stx = Math.floor(newX);
                            const sty = Math.floor(newY);
                            
                            if (sty >= 0 && sty < mapHeight && stx >= 0 && stx < mapWidth) {
                                if (!outdoorMap || outdoorMap[sty][stx]) {
                                    validSpawn = true;
                                    if (grids && grids.length > 1) {
                                        const upperTile = grids[1][sty]?.[stx];
                                        if (upperTile && (upperTile.type === 'WALL' || upperTile.bottomTextureId)) {
                                            validSpawn = false;
                                        }
                                    }
                                }
                            }
                            attempts++;
                        }
                        
                        if (!validSpawn) {
                            const fallbackAngle = Math.random() * Math.PI * 2;
                            const fallbackDist = Math.random() * 10;
                            newX = playerPos.x + Math.cos(fallbackAngle) * fallbackDist;
                            newY = playerPos.y + Math.sin(fallbackAngle) * fallbackDist;
                        }
                        
                        p.worldX = newX; 
                        p.worldY = newY;
                        p.worldZ = randomizeZ ? (p.floorZ + Math.random() * 15) : (10 + Math.random() * 5);
                    }
                }
                // Rain doesn't check wall collision for simplicity
                rainRef.current = updateParticles(rainRef.current);
            }
        }

        // Avoid creating new array with spread operator
        for (let i = 0; i < particlesRef.current.length; i++) {
            processParticle(particlesRef.current[i]);
        }
        for (let i = 0; i < rainRef.current.length; i++) {
            processParticle(rainRef.current[i]);
        }
        for (let i = 0; i < casingParticles.length; i++) {
            if (casingParticles[i].life > 0) {
                processParticle(casingParticles[i]);
            } else {
                casingParticles[i].dist = 0;
            }
        }
        for (let i = 0; i < bloodParticles.length; i++) {
            if (bloodParticles[i].life > 0) {
                processParticle(bloodParticles[i]);
            } else {
                bloodParticles[i].dist = 0;
            }
        }
        for (let i = 0; i < rainSplashParticles.length; i++) {
            if (rainSplashParticles[i].life > 0) {
                processParticle(rainSplashParticles[i]);
            } else {
                rainSplashParticles[i].dist = 0;
            }
        }
    }
};

export const renderParticles = ({
    ctx, width, height, posX, posY, dirX, dirY, planeX, planeY, horizon,
    particlesRef, rainRef, zBuffer, drawnParticles, weather, playerPos, onParticleHit, onShardLanded, onParticleBounce, grid, grids,
    auxBuffers, sprites, resolutionDivisor = 1, maskCtx, lightMap, webglRenderer, isWebGLActive, lightningIntensity,
    lightningMap, outdoorMap, ceilingType
}: ParticleRenderProps) => {

    const playerAngle = Math.atan2(dirY, dirX);

    // WebGL acceleration (Hardware rendering) for particles
    if (webglRenderer && isWebGLActive) {
        const gpuList: Particle[] = [];
        const cpuList: Particle[] = [];

        const checkVisible = (p: Particle) => {
            if (p.dist <= 0) return false;
            if (p.x < 0 || p.x >= width) return false;
            if (drawnParticles && drawnParticles.has(p)) return false;
            if (zBuffer) {
                const bx = Math.floor(p.x);
                if (bx >= 0 && bx < zBuffer.length) {
                    const tolerance = p.isForeground ? 0.6 : (p.type === 'brick' ? 0.2 : 0.05);
                    if (zBuffer[bx] < p.dist - tolerance) return false;
                } else if (p.type !== 'rain') {
                    return false;
                }
            }
            return true;
        };

        const addCandidate = (p: Particle) => {
            if (!checkVisible(p)) return;
            gpuList.push(p);
        };

        // Gather all visible particles
        if (particlesRef.current.length > 0) {
            for (let i = 0; i < particlesRef.current.length; i++) {
                addCandidate(particlesRef.current[i]);
            }
        }
        for (let i = 0; i < casingParticles.length; i++) {
            const p = casingParticles[i];
            if (p.life > 0) addCandidate(p);
        }
        for (let i = 0; i < bloodParticles.length; i++) {
            const p = bloodParticles[i];
            if (p.life > 0) {
                if (checkVisible(p)) {
                    addCandidate(p);
                    if (drawnParticles) drawnParticles.add(p);
                }
            }
        }
        for (let i = 0; i < rainSplashParticles.length; i++) {
            const p = rainSplashParticles[i];
            if (p.life > 0) addCandidate(p);
        }
        if (rainRef.current.length > 0) {
            for (let i = 0; i < rainRef.current.length; i++) {
                addCandidate(rainRef.current[i]);
            }
        }

        if (gpuList.length > 0) {
            // Render on GPU high-performance pipeline
            webglRenderer.renderParticlesWebGL(
                width, height, gpuList, sprites, auxBuffers, lightMap, lightningIntensity, playerAngle,
                lightningMap, outdoorMap, ceilingType
            );
            // Draw transparent WebGL canvas over our main 2D frame context
            ctx.drawImage(webglRenderer.getCanvas(), 0, 0);
        }

        if (cpuList.length > 0) {
            // Render on CPU high-fidelity pipeline (for polygonal shards & debris)
            drawParticles(ctx, cpuList, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
        }
        return;
    }

    // Default Software CPU (Canvas 2D) Rendering Fallback
    if (particlesRef.current.length > 0) {
        drawParticles(ctx, particlesRef.current, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    }
    
    // Draw casing particles
    drawParticles(ctx, casingParticles, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    
    // Draw blood particles
    drawParticles(ctx, bloodParticles, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    if (maskCtx) {
        drawParticles(maskCtx, bloodParticles, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    }
    
    // Draw rain splash particles
    drawParticles(ctx, rainSplashParticles, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    
    if (rainRef.current.length > 0) {
        drawParticles(ctx, rainRef.current, zBuffer, sprites, resolutionDivisor, drawnParticles, playerAngle, lightMap);
    }
};
