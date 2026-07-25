import React, { useCallback } from 'react';
import { Item, Player } from '../types';
import { createCasingParticle } from '../utils/particleSystem';

interface UseCasingSystemProps {
    player: Player;
    spriteMap: Map<string, HTMLImageElement>;
    raycasterRef: React.RefObject<any>;
    RAYCASTER_WIDTH: number;
    RAYCASTER_HEIGHT: number;
}

export function useCasingSystem({
    player,
    spriteMap,
    raycasterRef,
    RAYCASTER_WIDTH,
    RAYCASTER_HEIGHT
}: UseCasingSystemProps) {
    const spawnCasing = useCallback((weapon: Item) => {
        if (!weapon.casingAsset || !raycasterRef.current) return;
        
        const scale = weapon.casingScale || 1.0;
        const direction = weapon.casingDirection || 'right';
        const angle = (player.dir360 - 1) * (Math.PI / 2);
        
        let spawnX = player.pos.x + 0.5;
        let spawnY = player.pos.y + 0.5;
        let spawnZ = 0.6; 
        
        const handAssetToUse = (player.characterId === 'female' && weapon.handFemaleAssetId) ? weapon.handFemaleAssetId : weapon.handAssetId;
        const currentHandSprite = handAssetToUse ? spriteMap.get(handAssetToUse) : null;
        
        if (currentHandSprite && weapon.casingSpawnPoint) {
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            const handHeight = windowHeight * 0.6;
            const handWidth = handHeight * (currentHandSprite.width / currentHandSprite.height);
            
            const spriteLeft = windowWidth - handWidth;
            const spriteTop = windowHeight - handHeight;
            
            const screenX = spriteLeft + handWidth * (weapon.casingSpawnPoint.x / 100);
            const screenY = spriteTop + handHeight * (weapon.casingSpawnPoint.y / 100);
            
            const raycasterX = screenX * (RAYCASTER_WIDTH / windowWidth);
            const raycasterY = screenY * (RAYCASTER_HEIGHT / windowHeight);
            
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const planeX = -dirY * 0.66;
            const planeY = dirX * 0.66;
            
            const cameraX = 2 * raycasterX / RAYCASTER_WIDTH - 1;
            
            const rayDirX = dirX + planeX * cameraX;
            const rayDirY = dirY + planeY * cameraX;
            
            const spawnDistance = 0.3;
            spawnX = player.pos.x + 0.5 + rayDirX * spawnDistance;
            spawnY = player.pos.y + 0.5 + rayDirY * spawnDistance;
            
            const horizon = RAYCASTER_HEIGHT / 2;
            const lh = RAYCASTER_HEIGHT / spawnDistance;
            spawnZ = (horizon + (lh / 2) - raycasterY) / lh;
        } else {
            const offsetAngle = angle + (direction === 'right' ? Math.PI / 4 : -Math.PI / 4);
            spawnX = player.pos.x + 0.5 + Math.cos(offsetAngle) * 0.2;
            spawnY = player.pos.y + 0.5 + Math.sin(offsetAngle) * 0.2;
        }
        
        const particles = createCasingParticle(spawnX, spawnY, spawnZ, weapon.casingAsset, scale, direction, angle, weapon.sounds?.casing, weapon.casingGroundScaleMultiplier);
        raycasterRef.current.spawnParticles(particles);
    }, [player.pos.x, player.pos.y, player.dir360, player.characterId, spriteMap, raycasterRef, RAYCASTER_WIDTH, RAYCASTER_HEIGHT]);

    const spawnEnemyCasing = useCallback((x: number, y: number, casing: { assetId: string, direction: 'left' | 'right', scale?: number, groundScaleMultiplier?: number }, casingSound?: string) => {
        if (!casing || !casing.assetId || !raycasterRef.current) return;
        
        const scale = casing.scale || 1.0;
        const groundMultiplier = casing.groundScaleMultiplier || 0.08;
        
        // Calculate angle from enemy to player
        const dx = player.pos.x - x;
        const dy = player.pos.y - y;
        const angle = Math.atan2(dy, dx);
        
        const spawnX = x + 0.5;
        const spawnY = y + 0.5;
        const spawnZ = 0.5; // Roughly chest height
        
        const particles = createCasingParticle(spawnX, spawnY, spawnZ, casing.assetId, scale, casing.direction, angle, casingSound, groundMultiplier, false);
        raycasterRef.current.spawnParticles(particles);
    }, [player.pos.x, player.pos.y, raycasterRef]);

    const spawnReloadCasings = useCallback((weapon: Item, count: number) => {
        if (!weapon.casingAsset || !raycasterRef.current) return;
        
        const scale = weapon.casingScale || 1.0;
        const angle = (player.dir360 - 1) * (Math.PI / 2);
        
        let spawnX = player.pos.x + 0.5;
        let spawnY = player.pos.y + 0.5;
        // Spawning slightly below standard eye level, to simulate dropping from below the viewport
        let spawnZ = 0.35; 
        
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const spawnDistance = 0.4;
        
        spawnX += dirX * spawnDistance;
        spawnY += dirY * spawnDistance;
        
        // Use set timeout to delay the spawner so it meshes with reload sound and animation
        setTimeout(() => {
            for (let i = 0; i < count; i++) {
                // Determine direction randomly or alternate left/right, or just right
                const direction = Math.random() > 0.5 ? 'right' : 'left';
                const particles = createCasingParticle(
                    spawnX + (Math.random() - 0.5) * 0.1, 
                    spawnY + (Math.random() - 0.5) * 0.1, 
                    spawnZ + (Math.random() - 0.5) * 0.1, 
                    weapon.casingAsset!, 
                    scale, 
                    direction, 
                    angle, 
                    weapon.sounds?.casing, 
                    weapon.casingGroundScaleMultiplier,
                    true, // isPlayer
                    true // isReload
                );
                if (raycasterRef.current) {
                    raycasterRef.current.spawnParticles(particles);
                }
            }
        }, 150);
    }, [player.pos.x, player.pos.y, player.dir360, raycasterRef]);

    return { spawnCasing, spawnEnemyCasing, spawnReloadCasings };
}
