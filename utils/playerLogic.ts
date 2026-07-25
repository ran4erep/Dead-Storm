
import { Player, PlayerConfig, PlayerEquipment, Item, EquipSlot } from '../types';

export const createPlayer = (
    characterId: 'male' | 'female',
    config: PlayerConfig,
    itemsDb: any,
    localize: (text: string | undefined) => string,
    inventoryOverride?: { id: string; count?: number }[],
    equipmentOverride?: Record<string, string>
): Player => {
    
    // 1. Get Base Stats
    const { hp, maxHp, xp, maxXp, level, availablePoints, stats } = config.baseStats;
    const loadout = config.loadouts[characterId];
    
    const itemsToLoad = inventoryOverride || loadout.items;
    const equipmentToLoad = equipmentOverride || loadout.equipment;
    
    // 2. Build Inventory
    const inventory: Item[] = [];
    const idMap = new Map<string, Item>(); // To link equipment later

    itemsToLoad.forEach(def => {
        const dbItem = itemsDb[def.id];
        if (dbItem) {
            const name = localize(dbItem.name);
            const description = localize(dbItem.description);
            
            const newItem: Item = {
                ...dbItem,
                id: Math.random().toString(36).substr(2, 9), // Unique instance ID
                definitionId: def.id,
                name,
                description,
                rawName: dbItem.name,
                rawDescription: dbItem.description,
                count: def.count !== undefined ? def.count : dbItem.count,
                // Ensure currentAmmo matches new count if it's ammo type, or magazine if weapon
                currentAmmo: dbItem.type === 'AMMO' ? (def.count || dbItem.count) : dbItem.currentAmmo,
                
                // MAPPING FIX: Map JSON properties to runtime Item interface properties
                handAssetId: dbItem.handAsset,
                handFemaleAssetId: dbItem.handFemaleAsset,
                attackAssetId: dbItem.attackAsset,
                attackFemaleAssetId: dbItem.attackAssetFemale,
                maskAssetId: dbItem.maskAsset,
                durability: dbItem.maxDurability,
            };
            
            inventory.push(newItem);
            
            // Map the *Source ID* (e.g. "pistol") to the created *Instance Item*
            // If multiple of same ID, the last one wins (usually fine for equipment)
            idMap.set(def.id, newItem);
        } else {
            console.warn(`Item ID not found in DB: ${def.id}`);
        }
    });

    // 3. Build Equipment
    const equipment: PlayerEquipment = {
        weapon: null,
        weaponAkimbo: null,
        helmet: null,
        vest: null,
        pants: null,
        boots: null,
        accessory1: null,
        accessory2: null
    };

    if (equipmentToLoad.helmet) equipment.helmet = idMap.get(equipmentToLoad.helmet) || null;
    if (equipmentToLoad.vest) equipment.vest = idMap.get(equipmentToLoad.vest) || null;
    if (equipmentToLoad.pants) equipment.pants = idMap.get(equipmentToLoad.pants) || null;
    if (equipmentToLoad.boots) equipment.boots = idMap.get(equipmentToLoad.boots) || null;
    if (equipmentToLoad.weapon) equipment.weapon = idMap.get(equipmentToLoad.weapon) || null;
    if (equipmentToLoad.accessory1) equipment.accessory1 = idMap.get(equipmentToLoad.accessory1) || null;
    if (equipmentToLoad.accessory2) equipment.accessory2 = idMap.get(equipmentToLoad.accessory2) || null;

    // 4. Sounds & Voice
    const playerSounds: { damage?: string; death?: string; deathFemale?: string; bodyHit?: string; step?: string } = {};
    
    // Set default damage sound (usually male/generic)
    if (config.sounds?.damage) {
        playerSounds.damage = config.sounds.damage;
    }

    // Override for female if available
    if (characterId === 'female' && config.sounds?.damage_female) {
        playerSounds.damage = config.sounds.damage_female;
    }
    
    if (config.sounds?.death) {
        playerSounds.death = config.sounds.death;
    }
    if (config.sounds?.deathFemale) {
        playerSounds.deathFemale = config.sounds.deathFemale;
    }
    if (config.sounds?.bodyHit) {
        playerSounds.bodyHit = config.sounds.bodyHit;
    }
    
    const voice = characterId === 'male' ? config.voices.male : config.voices.female;
    const portraits = (config as any).portraits;

    return {
        characterId,
        hp,
        maxHp,
        xp,
        maxXp,
        level,
        availablePoints,
        stats,
        inventory,
        equipment,
        equippedWeapon: equipment.weapon, // Start with equipped weapon active
        pos: { x: 0, y: 0 },
        dir: 1,
        dir360: 1,
        sounds: playerSounds,
        voice,
        activeEffects: [],
        portraits
    };
};
