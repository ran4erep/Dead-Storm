
import React, { useRef, useEffect } from 'react';
import { Player, Item } from '../types';
import { getTintedSprite, globalSpriteTintCache } from './raycaster/SpriteCache';
import { createMolotovTrailParticles, createFlareSmokeParticle, createFlareTrailParticles } from '../utils/particleSystem';

interface ThrowOverlayProps {
    player: Player;
    throwAnim?: { item: Item, startTime: number, x: number, y: number } | null;
    throwAnimRef?: React.RefObject<{ item: Item, startTime: number, x: number, y: number } | null>;
    width: number;
    height: number;
    sprites: Map<string, HTMLImageElement>;
    lightMap?: { r: number; g: number; b: number }[][];
    fov?: number;
    animations?: Record<string, any>;
    onSpawnParticles?: (particles: any[]) => void;
    levelData?: any;
    lookAroundPitch?: number;
}

const ThrowOverlay: React.FC<ThrowOverlayProps> = ({ player, throwAnim: propsThrowAnim, throwAnimRef, width, height, sprites, lightMap, fov = 0.66, animations, onSpawnParticles, levelData, lookAroundPitch = 0 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const spriteTintCache = { current: globalSpriteTintCache };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let lastSmokeTime = 0;

        const render = () => {
            const throwAnim = throwAnimRef?.current || propsThrowAnim;
            if (!throwAnim) {
                ctx.clearRect(0, 0, width, height);
                return;
            }

            ctx.clearRect(0, 0, width, height);

            const getFloorLevel = (tile: any) => {
                if (!tile) return 0;
                if (tile.height !== undefined) {
                    return tile.height;
                }
                return 0;
            };

            const grid = levelData?.grid;
            const startTileX = Math.round(player.pos.x);
            const startTileY = Math.round(player.pos.y);
            const startTile = grid?.[startTileY]?.[startTileX];
            const targetTile = grid?.[throwAnim.y]?.[throwAnim.x];

            const startZ = getFloorLevel(startTile);
            const targetZ = getFloorLevel(targetTile);
            const cameraZ = 0.5;

            const THROW_DURATION = 450; 
            const elapsed = performance.now() - throwAnim.startTime; 
            const t = Math.min(1, elapsed / THROW_DURATION);
            
            // Calculate Camera
            const angle = (player.dir360 - 1) * (Math.PI / 2);
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const planeX = -dirY * fov;
            const planeY = dirX * fov;
            const posX = player.pos.x + 0.5;
            const posY = player.pos.y + 0.5;
            
            // Calculate Item Position
            // Start from the bottom right so it looks like the player is throwing it from their right hand
            // dirX/dirY is the exact forward camera vector. planeX/planeY points to the right.
            const worldStartX = posX + dirX * 0.2 + planeX * 0.3;
            const worldStartY = posY + dirY * 0.2 + planeY * 0.3;
            const worldTargetX = throwAnim.x + 0.5;
            const worldTargetY = throwAnim.y + 0.5;

            const currWorldX = worldStartX + (worldTargetX - worldStartX) * t;
            const currWorldY = worldStartY + (worldTargetY - worldStartY) * t;

            // Project
            const relX = currWorldX - posX;
            const relY = currWorldY - posY;
            const det = planeX * dirY - dirX * planeY;
            const invDet = 1.0 / det;
            const transformX = invDet * (dirY * relX - dirX * relY);
            const transformY = invDet * (-planeY * relX + planeX * relY);
            
            if (transformY > 0.05) {
                const screenX = Math.floor((width / 2) * (1 + transformX / transformY));
                const baseH = Math.abs(Math.floor(height / transformY));
                
                // Item scale logic (size on screen)
                const itemScale = throwAnim.item.scale || 0.3;
                const proximityScale = Math.max(1.0, 2.0 - transformY); 
                const finalItemScale = itemScale * proximityScale;

                const isSafe = !!(throwAnim.item as any).isSafeDrop;

                // Linearly interpolate the ground floor height underneath the throwing path
                const zFloor = startZ + (targetZ - startZ) * t;

                // Spawn trail particles during throw flight
                if (!isSafe && onSpawnParticles && elapsed - lastSmokeTime > 15 && t < 1.0) {
                    if (throwAnim.item.type === 'MOLOTOV') {
                        lastSmokeTime = elapsed;
                        const worldDist = Math.sqrt((worldTargetX - worldStartX)**2 + (worldTargetY - worldStartY)**2);
                        const arcPower = 0.4 + (Math.max(0, worldDist - 1) * 0.1);
                        const worldZ = zFloor + (finalItemScale / 2) + arcPower * Math.sin(t * Math.PI);
                        const particles = createMolotovTrailParticles(currWorldX, currWorldY, worldZ);
                        onSpawnParticles(particles);
                    } else if (throwAnim.item.type === 'FLARE' || (throwAnim.item as any).flareDuration !== undefined) {
                        lastSmokeTime = elapsed;
                        const worldDist = Math.sqrt((worldTargetX - worldStartX)**2 + (worldTargetY - worldStartY)**2);
                        const arcPower = 0.4 + (Math.max(0, worldDist - 1) * 0.1);
                        const worldZ = zFloor + (finalItemScale / 2) + arcPower * Math.sin(t * Math.PI);
                        const smokeCol = (throwAnim.item as any).smokeColor || (throwAnim.item as any).flareColor || 'rgba(255, 90, 40, 0.9)';
                        const particles = createFlareTrailParticles(currWorldX, currWorldY, worldZ, smokeCol, zFloor);
                        onSpawnParticles(particles);
                    }
                }
                
                const spriteH = Math.floor(baseH * finalItemScale);
                
                // THROW LOGIC: Use throwId if available, otherwise assetId
                const isThrowableObject = !isSafe && (throwAnim.item.type === 'GRENADE' || throwAnim.item.type === 'MOLOTOV' || throwAnim.item.type === 'FLASHBANG' || throwAnim.item.type === 'FLARE');
                let assetId = (!isSafe && (throwAnim.item as any).throwId) 
                    ? (throwAnim.item as any).throwId 
                    : throwAnim.item.assetId;

                // Resolve animation frame if applicable
                if (animations && animations[assetId]) {
                    const animDef = animations[assetId];
                    const frameDuration = 1000 / (animDef.fps || 10);
                    let frameIdx = Math.floor(elapsed / frameDuration);
                    if (animDef.repeat) {
                        frameIdx = frameIdx % animDef.frames.length;
                    } else {
                        frameIdx = Math.min(frameIdx, animDef.frames.length - 1);
                    }
                    assetId = animDef.frames[frameIdx];
                }

                let img = sprites.get(assetId);
                if (!img && throwAnim.item.symbol) img = sprites.get(`ITEM_${throwAnim.item.symbol}`);
                
                if (!img || img.width === 0) {
                    img = sprites.get('TEX_FALLBACK');
                }
                
                if (img && img.width > 0) {
                    const spriteW = (img.width / img.height) * spriteH;
                    
                    const worldDist = Math.sqrt((worldTargetX - worldStartX)**2 + (worldTargetY - worldStartY)**2);
                    
                    const arcPower = 0.4 + (Math.max(0, worldDist - 1) * 0.1);
                    const arcHeight = baseH * arcPower * Math.sin(t * Math.PI); 
                    
                    const tilt = lookAroundPitch * (height * 0.5);
                    const horizon = (height / 2) + tilt; 
                    const footY = horizon + ((cameraZ - zFloor) * height) / transformY;
                    
                    // Center the object vertically on its trajectory point
                    const currY = footY - (spriteH / 2) - arcHeight;

                    // Light calculation
                    let currentLight = { r: 1.0, g: 1.0, b: 1.0 };
                    const flightX = Math.floor(currWorldX);
                    const flightY = Math.floor(currWorldY);
                    if (lightMap && lightMap[flightY]?.[flightX]) {
                        currentLight = lightMap[flightY][flightX];
                    }

                    const drawSource = getTintedSprite(img, currentLight, 0, 0, spriteTintCache.current);

                    ctx.save();
                    
                    // ROTATION LOGIC for Throwables
                    if (isThrowableObject) {
                        const centerX = screenX;
                        const centerY = currY + spriteH / 2;
                        const rotationAngle = t * Math.PI * 6; // Spin 3 times

                        ctx.translate(centerX, centerY);
                        ctx.rotate(rotationAngle);
                        ctx.drawImage(drawSource, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
                    } else {
                        // Draw centered normally
                        ctx.drawImage(drawSource, screenX - spriteW/2, currY, spriteW, spriteH);
                    }
                    
                    ctx.restore();
                }
            }

            if (t < 1.0) {
                animationFrameId = requestAnimationFrame(render);
            }
        };

        render();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [propsThrowAnim, throwAnimRef, player, width, height, sprites, lightMap, fov, animations, levelData, lookAroundPitch]);

    return (
        <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            className="absolute inset-0 w-full h-full pointer-events-none z-[100]"
            style={{ imageRendering: 'pixelated' }}
        />
    );
};

export default ThrowOverlay;
