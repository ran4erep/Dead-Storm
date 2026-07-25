
import { useState, useRef, useEffect, useMemo } from 'react';
import { Player, Item, PlayerEquipment } from '../types';

export const usePlayerSystem = () => {
    const [player, setPlayer] = useState<Player>({
        characterId: 'male', // Default
        hp: 30,
        maxHp: 30,
        inventory: [],
        equipment: {
            weapon: null,
            helmet: null,
            vest: null,
            pants: null,
            boots: null,
            accessory1: null,
            accessory2: null
        },
        equippedWeapon: null,
        pos: { x: 0, y: 0 },
        dir: 1,
        dir360: 1,
        xp: 0,
        maxXp: 300,
        level: 1,
        stats: { str: 0, agi: 0, spd: 0, vit: 0 },
        availablePoints: 0,
        sounds: {},
        voice: undefined,
        activeEffects: [],
        concussionLevel: 0,
        craftedRecipes: []
    });

    const playerHpRef = useRef(player.hp);
    
    useEffect(() => {
        playerHpRef.current = player.hp;
    }, [player.hp]);

    const inventoryStats = useMemo(() => {
        const BASE_INVENTORY_CAPACITY = 4;
        const bonusCapacity = 
           (player.equipment.helmet?.inventorySlots || 0) +
           (player.equipment.vest?.inventorySlots || 0) +
           (player.equipment.pants?.inventorySlots || 0) +
           (player.equipment.boots?.inventorySlots || 0) +
           (player.equipment.accessory1?.inventorySlots || 0) +
           (player.equipment.accessory2?.inventorySlots || 0);
        const maxCapacity = BASE_INVENTORY_CAPACITY + bonusCapacity;
        const equippedIds = new Set(Object.values(player.equipment).filter(i => i).map(i => (i as Item).id));
        const currentLoad = player.inventory
            .filter(i => !equippedIds.has(i.id) && i.type !== 'CASH')
            .reduce((acc, i) => acc + (i.weight !== undefined ? i.weight : 1), 0);
        return { currentLoad, maxCapacity };
     }, [player.inventory, player.equipment]);
   
     const totalAmmoInInventory = useMemo(() => {
       const currentWeapon = (player.equippedWeapon && (player.equippedWeapon.type === 'MAP' || player.equippedWeapon.type === 'CONSOLE' || player.equippedWeapon.type === 'NOTE' || player.equippedWeapon.type === 'RADIO'))
           ? (player.equipment.weapon || null)
           : player.equippedWeapon;
           
       if (!currentWeapon?.ammoType) return 0;
       const type = currentWeapon.ammoType;
       return player.inventory.reduce((acc, item) => {
           if (item.type === 'AMMO' && item.ammoType === type) {
               return acc + (item.count || 0);
           }
           return acc;
       }, 0);
     }, [player.inventory, player.equippedWeapon, player.equipment.weapon]);

    const gainLevel = (xp?: number) => {
        setPlayer(prev => {
            if (xp !== undefined) {
                let newXp = prev.xp + xp;
                let newLevel = prev.level;
                let newPoints = prev.availablePoints;
                let newMaxXp = prev.maxXp;

                while (newXp >= newMaxXp) {
                    newXp -= newMaxXp;
                    newLevel++;
                    newPoints++;
                    newMaxXp = Math.floor(newMaxXp * 1.2 + 200);
                }
                
                return {
                    ...prev,
                    xp: newXp,
                    level: newLevel,
                    availablePoints: newPoints,
                    maxXp: newMaxXp
                };
            } else {
                // Force Level Up (Debug)
                return {
                    ...prev,
                    level: prev.level + 1,
                    availablePoints: prev.availablePoints + 1,
                    xp: 0, // Reset XP on forced level up? Or keep it? Let's reset for simplicity as per original code
                    maxXp: Math.floor(prev.maxXp * 1.2 + 200)
                };
            }
        });
    };

    return {
        player,
        setPlayer,
        playerHpRef,
        inventoryStats,
        totalAmmoInInventory,
        gainLevel
    };
};
