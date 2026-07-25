import { Item, Player } from '../types';

export function getWeaponSprite(
    weapon: Item | null, 
    spriteElapsed: number | undefined,
    characterId: string,
    animations: any,
    spriteMap: Map<string, HTMLImageElement>
) {
    if (!weapon) return null;
    const handAssetId = weapon.handAssetId || (weapon as any).handAsset;
    const handFemaleAssetId = weapon.handFemaleAssetId || (weapon as any).handFemaleAsset;
    const attackAssetId = weapon.attackAssetId || (weapon as any).attackAsset;
    const attackFemaleAssetId = weapon.attackFemaleAssetId || (weapon as any).attackAssetFemale;

    if (spriteElapsed !== undefined) {
        const attackAssetToUse = (characterId === 'female' && attackFemaleAssetId) ? attackFemaleAssetId : attackAssetId;
        if (attackAssetToUse) {
            const animDef = animations[attackAssetToUse];
            if (animDef) {
                const frameDuration = 1000 / animDef.fps;
                let frameIndex = Math.floor(spriteElapsed / frameDuration);
                if (frameIndex >= animDef.frames.length) {
                    if (animDef.repeat) {
                        frameIndex = frameIndex % animDef.frames.length;
                    } else {
                        // Animation finished, revert to idle
                        const handAssetToUse = (characterId === 'female' && handFemaleAssetId) ? handFemaleAssetId : handAssetId;
                        return handAssetToUse ? spriteMap.get(handAssetToUse) : null;
                    }
                }
                const frameId = animDef.frames[frameIndex];
                return spriteMap.get(frameId) || null;
            } else {
                if (spriteElapsed > 300) {
                    const handAssetToUse = (characterId === 'female' && handFemaleAssetId) ? handFemaleAssetId : handAssetId;
                    return handAssetToUse ? spriteMap.get(handAssetToUse) : null;
                }
                return spriteMap.get(attackAssetToUse) || null;
            }
        }
    }
    const handAssetToUse = (characterId === 'female' && handFemaleAssetId) ? handFemaleAssetId : handAssetId;
    return handAssetToUse ? spriteMap.get(handAssetToUse) : null;
}
