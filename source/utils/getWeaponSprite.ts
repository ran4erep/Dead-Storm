import { Item } from '../types';

export interface WeaponSpriteResult {
    sprite: HTMLImageElement | null;
    muzzleSprite: HTMLImageElement | null;
    isMuzzleFrame: boolean;
}

export function getWeaponSpriteWithMuzzle(
    weapon: Item | null,
    spriteElapsed: number | undefined,
    characterId: string,
    animations: any,
    spriteMap: Map<string, HTMLImageElement>
): WeaponSpriteResult {
    if (!weapon) return { sprite: null, muzzleSprite: null, isMuzzleFrame: false };
    const handAssetId = weapon.handAssetId || (weapon as any).handAsset;
    const handFemaleAssetId = weapon.handFemaleAssetId || (weapon as any).handFemaleAsset;
    const attackAssetId = weapon.attackAssetId || (weapon as any).attackAsset;
    const attackFemaleAssetId = weapon.attackFemaleAssetId || (weapon as any).attackAssetFemale;

    const muzzleAssetId = weapon.muzzleAsset || (weapon as any).muzzleAssetId;
    const muzzleFemaleAssetId = weapon.muzzleFemaleAsset || (weapon as any).muzzleFemaleAssetId;

    let muzzleSprite: HTMLImageElement | null = null;
    let isMuzzleFrame = false;

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
                        return {
                            sprite: handAssetToUse ? (spriteMap.get(handAssetToUse) || null) : null,
                            muzzleSprite: null,
                            isMuzzleFrame: false
                        };
                    }
                }

                // Check muzzle frame (1-based index)
                const currentFrameNumber = frameIndex + 1;
                const targetMuzzleFrame = weapon.muzzleFrame || 1;
                if (weapon.muzzleFlash === true && currentFrameNumber === targetMuzzleFrame) {
                    isMuzzleFrame = true;
                    const muzzleToUse = (characterId === 'female' && muzzleFemaleAssetId) ? muzzleFemaleAssetId : muzzleAssetId;
                    if (muzzleToUse) {
                        muzzleSprite = spriteMap.get(muzzleToUse) || null;
                    }
                }

                const frameId = animDef.frames[frameIndex];
                return {
                    sprite: spriteMap.get(frameId) || null,
                    muzzleSprite,
                    isMuzzleFrame
                };
            } else {
                if (spriteElapsed > 300) {
                    const handAssetToUse = (characterId === 'female' && handFemaleAssetId) ? handFemaleAssetId : handAssetId;
                    return {
                        sprite: handAssetToUse ? (spriteMap.get(handAssetToUse) || null) : null,
                        muzzleSprite: null,
                        isMuzzleFrame: false
                    };
                }

                const targetMuzzleFrame = weapon.muzzleFrame || 1;
                if (weapon.muzzleFlash === true && targetMuzzleFrame === 1) {
                    isMuzzleFrame = true;
                    const muzzleToUse = (characterId === 'female' && muzzleFemaleAssetId) ? muzzleFemaleAssetId : muzzleAssetId;
                    if (muzzleToUse) {
                        muzzleSprite = spriteMap.get(muzzleToUse) || null;
                    }
                }

                return {
                    sprite: spriteMap.get(attackAssetToUse) || null,
                    muzzleSprite,
                    isMuzzleFrame
                };
            }
        }
    }

    const handAssetToUse = (characterId === 'female' && handFemaleAssetId) ? handFemaleAssetId : handAssetId;
    return {
        sprite: handAssetToUse ? (spriteMap.get(handAssetToUse) || null) : null,
        muzzleSprite: null,
        isMuzzleFrame: false
    };
}

export function getWeaponSprite(
    weapon: Item | null, 
    spriteElapsed: number | undefined,
    characterId: string,
    animations: any,
    spriteMap: Map<string, HTMLImageElement>
) {
    return getWeaponSpriteWithMuzzle(weapon, spriteElapsed, characterId, animations, spriteMap).sprite;
}
