import { useMemo } from 'react';
import { GameState, Item, Player } from '../types';

export function useWeaponRendering({
    gameState,
    combat,
    player,
    activeWeapon,
    currentHandSprite,
    akimboHandSprite,
    weaponStyle,
    akimboWeaponStyle,
    currentLight,
    currentLevelPath,
    throwingSys,
    deathAnimProgress = 0
}: {
    gameState: GameState;
    combat: any;
    player: Player;
    activeWeapon: Item | null;
    currentHandSprite: HTMLImageElement | null;
    akimboHandSprite: HTMLImageElement | null;
    weaponStyle: any;
    akimboWeaponStyle: any;
    currentLight: { r: number, g: number, b: number };
    currentLevelPath: string | null;
    throwingSys?: any;
    deathAnimProgress?: number;
}) {
    const activeAkimboWeapon = player.equipment.weaponAkimbo || (activeWeapon?.id === 'fists_weapon' ? activeWeapon : null);

    const currentBrightness = (currentLight.r + currentLight.g + currentLight.b) / 3;
    const isWeaponBroken = activeWeapon?.durability === 0;
    const isAkimboWeaponBroken = activeAkimboWeapon?.durability === 0;
    
    // Default base styles
    const baseFilter = `brightness(1) sepia(0) hue-rotate(0deg) saturate(1)`;
    
    const getTintMatrix = useMemo(() => {
        return (isBroken: boolean, currentIntensity: number = 0) => {
            const mult = isBroken ? 0.6 : 1.0;
            const tintOpacity = Math.max(0, 1 - currentIntensity * 5);
            const r = currentLight.r * tintOpacity + 1.0 * (1 - tintOpacity);
            const g = currentLight.g * tintOpacity + 1.0 * (1 - tintOpacity);
            const b = currentLight.b * tintOpacity + 1.0 * (1 - tintOpacity);
            return `${r * mult} 0 0 0 0  0 ${g * mult} 0 0 0  0 0 ${b * mult} 0 0  0 0 0 1 0`;
        };
    }, [currentLight.r, currentLight.g, currentLight.b]);
    
    // Use constant IDs for SVG filters to prevent browser invalidation, 1-frame flickering, and rendering lag when ambient light changes
    const mainTintId = 'weapon-tint-main';
    const akimboTintId = 'weapon-tint-akimbo';
    
    const handStyleFinal = useMemo(() => ({ 
        ...weaponStyle, 
        willChange: 'transform, filter',
    }), [weaponStyle, baseFilter, mainTintId]);

    const akimboHandStyleFinal = useMemo(() => ({ 
        ...akimboWeaponStyle, 
        willChange: 'transform, filter',
    }), [akimboWeaponStyle, baseFilter, akimboTintId]);

    const isCombatOrAiming = combat.isActive || gameState === GameState.AIMING;
    const isThrowing = gameState === GameState.THROWING && throwingSys?.isThrowing;
    
    let normalTransform = 'translateY(30%) rotate(0)';
    if (isThrowing) {
        normalTransform = 'translateY(100%) rotate(0)';
    } else if (isCombatOrAiming || activeWeapon?.type === 'RADIO') {
        normalTransform = 'translateY(0) rotate(0)';
    }
    
    const brokenTransform = isWeaponBroken ? 'translateY(60%) rotate(45deg)' : normalTransform;
    
    let akimboNormalTransform = 'translateY(30%) rotate(0)';
    if (isThrowing) {
        akimboNormalTransform = 'translateY(100%) rotate(0)';
    } else if (isCombatOrAiming || activeAkimboWeapon?.type === 'RADIO') {
        akimboNormalTransform = 'translateY(0) rotate(0)';
    }
    
    const akimboBrokenTransform = isAkimboWeaponBroken ? 'translateY(60%) rotate(-45deg)' : akimboNormalTransform;
    
    const brokenTransition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    
    const showWeaponHand = currentHandSprite && gameState !== GameState.MAP_VIEW && gameState !== GameState.CONSOLE_VIEW && gameState !== GameState.DYING && gameState !== GameState.FALLING && deathAnimProgress === 0 && activeWeapon?.type !== 'MAP' && activeWeapon?.type !== 'NOTE' && activeWeapon?.type !== 'CONSOLE' && (gameState !== GameState.DIALOGUE || activeWeapon?.type === 'RADIO');

    const isMapView = gameState === GameState.MAP_VIEW;
    let activeMapItem: Item | null = null;
    
    if (isMapView) {
        activeMapItem = player.equippedWeapon;
    } else {
        activeMapItem = player.inventory.find(i => (i.type === 'MAP' || i.type === 'NOTE') && (!i.boundLevelPath || i.boundLevelPath === currentLevelPath)) || null;
        if (!activeMapItem && (player.equipment.weapon?.type === 'MAP' || player.equipment.weapon?.type === 'NOTE') && (!player.equipment.weapon.boundLevelPath || player.equipment.weapon.boundLevelPath === currentLevelPath)) {
            activeMapItem = player.equipment.weapon;
        }
    }

    return {
        getTintMatrix,
        mainTintId,
        akimboTintId,
        handStyleFinal,
        akimboHandStyleFinal,
        brokenTransform,
        akimboBrokenTransform,
        brokenTransition,
        showWeaponHand,
        isWeaponBroken,
        isAkimboWeaponBroken,
        isMapView,
        activeMapItem
    };
}
