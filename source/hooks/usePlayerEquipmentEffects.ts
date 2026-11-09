import { useMemo, useEffect } from 'react';
import { Player } from '../types';
import { generatePlayerReflectionSprite } from '../utils/playerReflection';

export function usePlayerEquipmentEffects({
    player,
    spriteMap,
    setPlayerReflectionSprite
}: {
    player: Player;
    spriteMap: Map<string, HTMLImageElement>;
    setPlayerReflectionSprite: (canvas: HTMLCanvasElement | null) => void;
}) {
    const { isFlashlightOn, flashlightBatteryRatio } = useMemo(() => {
        const acc1 = player.equipment.accessory1;
        const acc2 = player.equipment.accessory2;
        let batteryRatio = 1.0;
        let on = false;

        const checkFlashlight = (acc: any) => {
            if (acc?.type === 'FLASHLIGHT' && (acc.currentAmmo === undefined || acc.currentAmmo > 0)) {
                on = true;
                if (acc.currentAmmo !== undefined && acc.magazineMax) {
                    batteryRatio = acc.currentAmmo / acc.magazineMax;
                }
            }
        };

        checkFlashlight(acc1);
        if (!on) checkFlashlight(acc2); // Prioritize acc1 if both are flashlights

        return { isFlashlightOn: on, flashlightBatteryRatio: batteryRatio };
    }, [player.equipment]);

    const almostBrokenSlots = useMemo(() => {
        const slots: { slot: string, isBroken: boolean, item?: any }[] = [];
        const checkSlot = (slotName: string, item: any) => {
            if (item && item.durability !== undefined && item.maxDurability) {
                if (item.durability === 0) {
                    slots.push({ slot: slotName, isBroken: true, item });
                } else if (item.durability / item.maxDurability <= 0.2) {
                    slots.push({ slot: slotName, isBroken: false, item });
                }
            }
        };
        checkSlot('weapon', player.equipment.weapon);
        checkSlot('weaponAkimbo', player.equipment.weaponAkimbo);
        checkSlot('helmet', player.equipment.helmet);
        checkSlot('vest', player.equipment.vest);
        checkSlot('pants', player.equipment.pants);
        checkSlot('boots', player.equipment.boots);
        return slots;
    }, [player.equipment]);

    // Update player reflection sprite when equipment or sprites change
    useEffect(() => {
        if (spriteMap.size > 0) {
            const canvas = generatePlayerReflectionSprite(player, spriteMap);
            setPlayerReflectionSprite(canvas);
        }
    }, [player.equipment, player.characterId, spriteMap, setPlayerReflectionSprite]);

    return {
        isFlashlightOn,
        flashlightBatteryRatio,
        almostBrokenSlots
    };
}
