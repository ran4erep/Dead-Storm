
import React, { useState, useMemo, useRef } from 'react';
import { Player, Item, GameState, GameStrings, ACCESSORY_TYPES } from '../types';
import { rollDice } from '../utils/dice';

interface InventoryAnimationControls {
    triggerHolster: () => number; // Returns duration
    triggerEquip: () => number;
    triggerSwap: (oldW: Item | null, newW: Item | null, oldAkimbo?: Item | null, newAkimbo?: Item | null) => void;
}

export const useInventorySystem = (
    player: Player,
    setPlayer: React.Dispatch<React.SetStateAction<Player>>,
    strings: GameStrings | null,
    addLog: (text: string, type?: any) => void,
    combat: any,
    gameState: GameState,
    triggerEnemyTurn: (fail?: boolean, ignoredEnemyIds?: string[], wasInEscapeMode?: boolean, droppedItems?: any[], gridOverride?: any[][]) => void,
    setActiveModal: (m: any) => void,
    totalAmmoInInventory: number,
    inventoryStats: {currentLoad: number, maxCapacity: number},
    playSound: (soundName: string) => void,
    setGameState: (state: GameState) => void,
    manualReloadTrigger: number,
    setManualReloadTrigger: React.Dispatch<React.SetStateAction<number>>,
    animControls: InventoryAnimationControls,
    levelData?: any,
    setLevelData?: React.Dispatch<React.SetStateAction<any>>,
    itemsDb?: any, 
    language: 'en' | 'ru' = 'en',
    applyEffect?: (effectId: string) => void,
    onTakeTurn?: (playerPos?: {x: number, y: number}, gridOverride?: any[][]) => void,
    plantExplosive?: (x: number, y: number, item: Item, player: Player) => any[][] | null,
    spawnReloadCasings?: (weapon: Item, count: number) => void
) => {
    const lastEquippedWeaponRef = useRef<Item | null>(null);
    const [mapZoom, setMapZoom] = useState(1.0);
    const zoomLevelsRef = useRef<Map<string, number>>(new Map());

    const t = (template: string | undefined, params: { [key: string]: string | number }) => {
        if (!template) return "???";
        return template.replace(/{(\w+)}/g, (_, key) => params[key] !== undefined ? String(params[key]) : `{${key}}`);
    };

    const localize = (text: string | undefined): string => {
        if (!text) return "";
        let localizedText = text;
        const idx = text.indexOf('/');
        if (idx !== -1) {
            localizedText = language === 'ru' ? text.substring(0, idx).trim() : text.substring(idx + 1).trim();
        }
        
        // Parse gender-specific text: word{femaleWord}
        const isFemale = player.characterId === 'female';
        localizedText = localizedText.replace(/([a-zA-Zа-яА-ЯёЁ0-9_\-]+)\{([^}]+)\}/g, (match, maleWord, femaleWord) => {
            return isFemale ? femaleWord : maleWord;
        });

        return localizedText;
    };

    const defaultFists = useMemo(() => {
        if (!itemsDb || !itemsDb['fists']) return null;
        const dbItem = itemsDb['fists'];
        return {
            ...dbItem,
            id: 'fists_weapon',
            name: strings?.ui?.header?.fists || 'Fists',
            handAssetId: dbItem.handAsset,
            handFemaleAssetId: dbItem.handFemaleAsset,
            attackAssetId: dbItem.attackAsset,
            attackFemaleAssetId: dbItem.attackAssetFemale,
        } as Item;
    }, [itemsDb, strings]);

    const resolveWeaponConfig = (w: Item | null, wAkimbo: Item | null) => {
        const actWeapon = w || defaultFists || null;
        const actAkimbo = wAkimbo || (actWeapon?.id === 'fists_weapon' ? actWeapon : null);
        return { activeWeapon: actWeapon, activeAkimboWeapon: actAkimbo };
    };

    const handleEquipItem = (item: Item, onFeedback?: (msg: string) => void) => {
        if (!strings) return;
        
        if (gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW) {
            setGameState(GameState.PLAYING);
        }
        
        let slot = item.slot;
        if (item.equip === 'WEAPON') {
            if (player.equipment.weapon && player.equipment.weapon.assetId === item.assetId && item.akimbo && !player.equipment.weaponAkimbo) {
                slot = 'weaponAkimbo';
            } else {
                slot = 'weapon';
            }
        } else if (item.equip === 'ACCESSORY') {
            if (!slot) {
                if (!player.equipment.accessory1) slot = 'accessory1';
                else if (!player.equipment.accessory2) slot = 'accessory2';
                else slot = 'accessory1';
            }
        } else if (item.equip === 'HEAD') {
            slot = 'helmet';
        } else if (item.equip === 'BODY') {
            slot = 'vest';
        } else if (item.equip === 'LEGS') {
            slot = 'pants';
        } else if (item.equip === 'FEET') {
            slot = 'boots';
        }
        
        if (!slot) return;

        const msg = t(strings.logs.equipped, { name: item.name });
        addLog(msg, 'INFO');
        if (onFeedback) onFeedback(msg);
        playSound('SYS_EQUIP');

        const oldWeapon = player.equippedWeapon;
        const oldAkimbo = player.equipment.weaponAkimbo || null;

        setPlayer(prev => {
          const nextEquip = { ...prev.equipment };
          nextEquip[slot] = item; 
          
          // If equipping a new primary weapon, and we have an akimbo weapon that doesn't match, unequip it
          if (slot === 'weapon' && nextEquip.weaponAkimbo && nextEquip.weaponAkimbo.assetId !== item.assetId) {
              nextEquip.weaponAkimbo = null;
          }
          
          return { ...prev, equipment: nextEquip, equippedWeapon: slot === 'weapon' ? item : prev.equippedWeapon };
        });

        if (combat.isActive) { 
            if ((slot === 'weapon' && oldWeapon?.id !== item.id) || (slot === 'weaponAkimbo' && oldAkimbo?.id !== item.id)) {
                const newWeapon = slot === 'weapon' ? item : oldWeapon;
                const newAkimbo = slot === 'weaponAkimbo' ? item : (slot === 'weapon' && oldAkimbo && oldAkimbo.assetId !== item.assetId ? null : oldAkimbo);

                const { activeWeapon: resolvedOldWeapon, activeAkimboWeapon: resolvedOldAkimbo } = resolveWeaponConfig(oldWeapon, oldAkimbo);
                const { activeWeapon: resolvedNewWeapon, activeAkimboWeapon: resolvedNewAkimbo } = resolveWeaponConfig(newWeapon, newAkimbo);

                animControls.triggerSwap(
                    resolvedOldWeapon,
                    resolvedNewWeapon,
                    resolvedOldAkimbo,
                    resolvedNewAkimbo
                );
            }
            setActiveModal(null); 
            triggerEnemyTurn(false); 
        }
    };
    
    const handleUnequipItem = (item: Item, onFeedback?: (msg: string) => void) => {
        if (!strings) return;

        if (gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW) {
            setGameState(GameState.PLAYING);
        }
        
        const itemSlots = item.inventorySlots || 0;
        const futureCapacity = inventoryStats.maxCapacity - itemSlots;

        if (inventoryStats.currentLoad > futureCapacity) {
            const msg = strings.logs.unequip_fail_space;
            addLog(msg, 'DANGER');
            if (onFeedback) onFeedback(msg);
            return;
        }

        const futureLoad = inventoryStats.currentLoad + (item.weight !== undefined ? item.weight : 1);
        const willOverflow = futureLoad > futureCapacity;
        
        const oldWeapon = player.equippedWeapon;
        const oldAkimbo = player.equipment.weaponAkimbo || null;
        const isUnequippingWeapon = item === oldWeapon;
        const isUnequippingAkimbo = item === oldAkimbo;

        let slot = item.slot;
        if (item.equip === 'WEAPON' || slot === 'weapon' || slot === 'weaponAkimbo') {
            if (player.equipment.weapon === item) slot = 'weapon';
            else if (player.equipment.weaponAkimbo === item) slot = 'weaponAkimbo';
            else slot = 'weapon';
        }

        const nextEquipDummy = { ...player.equipment };
        if (slot && (nextEquipDummy[slot] === item || nextEquipDummy[slot]?.id === item.id)) {
            nextEquipDummy[slot] = null;
            if (slot === 'weapon' && nextEquipDummy.weaponAkimbo) {
                nextEquipDummy.weapon = nextEquipDummy.weaponAkimbo;
                nextEquipDummy.weaponAkimbo = null;
            }
        }
        const newWeapon = nextEquipDummy.weapon;
        const newAkimbo = nextEquipDummy.weaponAkimbo;

        if (willOverflow) {
            if (levelData && setLevelData) {
                setPlayer(prev => {
                    const nextEquip = { ...prev.equipment };
                    let localSlot = item.slot;
                    if (item.equip === 'WEAPON' || localSlot === 'weapon' || localSlot === 'weaponAkimbo') {
                        if (nextEquip.weapon === item) localSlot = 'weapon';
                        else if (nextEquip.weaponAkimbo === item) localSlot = 'weaponAkimbo';
                        else localSlot = 'weapon';
                    }
                    // For accessories, we need to find which slot holds this specific item ID
                    else if (item.equip === 'ACCESSORY' || localSlot === 'accessory1' || localSlot === 'accessory2') {
                        if (nextEquip.accessory1?.id === item.id) localSlot = 'accessory1';
                        else if (nextEquip.accessory2?.id === item.id) localSlot = 'accessory2';
                    } else if (item.equip === 'HEAD') {
                        localSlot = 'helmet';
                    } else if (item.equip === 'BODY') {
                        localSlot = 'vest';
                    } else if (item.equip === 'LEGS') {
                        localSlot = 'pants';
                    } else if (item.equip === 'FEET') {
                        localSlot = 'boots';
                    }
                    
                    if (localSlot && (nextEquip[localSlot] === item || nextEquip[localSlot]?.id === item.id)) {
                        nextEquip[localSlot] = null;
                        
                        // If unequipping primary weapon, move akimbo weapon to primary slot
                        if (localSlot === 'weapon' && nextEquip.weaponAkimbo) {
                            nextEquip.weapon = nextEquip.weaponAkimbo;
                            nextEquip.weaponAkimbo = null;
                        }
                    }

                    const newInventory = prev.inventory.filter(i => i.id !== item.id);

                    return { 
                        ...prev, 
                        inventory: newInventory,
                        equipment: nextEquip, 
                        equippedWeapon: (localSlot === 'weapon' && !nextEquip.weapon) ? null : (localSlot === 'weapon' ? nextEquip.weapon : prev.equippedWeapon) 
                    };
                });

                const px = Math.floor(player.pos.x);
                const py = Math.floor(player.pos.y);
                
                setLevelData((prev: any) => {
                    if (!prev) return null;
                    const newGrid = [...prev.grid];
                    const newRow = [...newGrid[py]];
                    const existingItems = newRow[px].items || [];
                    newRow[px] = { ...newRow[px], items: [...existingItems, item] };
                    newGrid[py] = newRow;
                    return { ...prev, grid: newGrid };
                });

                const msg = t(strings.logs.unequip_drop, { name: item.name });
                addLog(msg, 'INFO');
                if (onFeedback) onFeedback(msg);
            } else {
                const msg = strings.logs.unequip_fail_space;
                addLog(msg, 'DANGER');
                if (onFeedback) onFeedback(msg);
                return;
            }
        } else {
            setPlayer(prev => {
              const nextEquip = { ...prev.equipment };
              let localSlot = item.slot;
              if (item.equip === 'WEAPON' || localSlot === 'weapon' || localSlot === 'weaponAkimbo') {
                  if (nextEquip.weapon === item) localSlot = 'weapon';
                  else if (nextEquip.weaponAkimbo === item) localSlot = 'weaponAkimbo';
                  else localSlot = 'weapon';
              }
              else if (item.equip === 'ACCESSORY' || localSlot === 'accessory1' || localSlot === 'accessory2') {
                  if (nextEquip.accessory1?.id === item.id) localSlot = 'accessory1';
                  else if (nextEquip.accessory2?.id === item.id) localSlot = 'accessory2';
              } else if (item.equip === 'HEAD') {
                  localSlot = 'helmet';
              } else if (item.equip === 'BODY') {
                  localSlot = 'vest';
              } else if (item.equip === 'LEGS') {
                  localSlot = 'pants';
              } else if (item.equip === 'FEET') {
                  localSlot = 'boots';
              }
              
              if (localSlot && (nextEquip[localSlot] === item || nextEquip[localSlot]?.id === item.id)) { 
                  nextEquip[localSlot] = null; 
                  
                  // If unequipping primary weapon, move akimbo weapon to primary slot
                  if (localSlot === 'weapon' && nextEquip.weaponAkimbo) {
                      nextEquip.weapon = nextEquip.weaponAkimbo;
                      nextEquip.weaponAkimbo = null;
                  }
                  
                  return { ...prev, equipment: nextEquip, equippedWeapon: (localSlot === 'weapon' && !nextEquip.weapon) ? null : (localSlot === 'weapon' ? nextEquip.weapon : prev.equippedWeapon) }; 
              }
              return prev;
            });
        }

        playSound('SYS_EQUIP');
        
        if (combat.isActive) { 
            if (isUnequippingWeapon || isUnequippingAkimbo) {
                const { activeWeapon: resolvedOldWeapon, activeAkimboWeapon: resolvedOldAkimbo } = resolveWeaponConfig(oldWeapon, oldAkimbo);
                const { activeWeapon: resolvedNewWeapon, activeAkimboWeapon: resolvedNewAkimbo } = resolveWeaponConfig(newWeapon, newAkimbo);

                animControls.triggerSwap(
                    resolvedOldWeapon,
                    resolvedNewWeapon,
                    resolvedOldAkimbo,
                    resolvedNewAkimbo
                );
            }
            setActiveModal(null); 
            triggerEnemyTurn(false); 
        }
    };

    const forceHideRadio = async () => {
        if (player.equippedWeapon?.type === 'RADIO') {
            const radioItem = player.equippedWeapon;
            
            if (radioItem.sounds && (radioItem.sounds as any).radio_off) {
                playSound((radioItem.sounds as any).radio_off);
            } else {
                playSound('SYS_INVENTORY_CLOSE');
            }
            
            const duration = animControls.triggerHolster();
            await new Promise(r => setTimeout(r, duration));
            
            setPlayer(prev => ({
                ...prev,
                equippedWeapon: lastEquippedWeaponRef.current || null
            }));
            
            animControls.triggerEquip();
            if (gameState === GameState.RADIO_VIEW) {
                setGameState(GameState.PLAYING);
            }
        }
    };

    const toggleRadioMode = async (item: Item | null, isDialogueTrigger?: boolean) => {
        if (item && combat.isActive) return;
        
        const isClosing = gameState === GameState.RADIO_VIEW;
        const radioItem = player.equippedWeapon;
        
        if (isClosing) {
            if (radioItem?.sounds && (radioItem.sounds as any).radio_off) {
                playSound((radioItem.sounds as any).radio_off);
            } else {
                playSound('SYS_INVENTORY_CLOSE');
            }
        }
        
        const duration = animControls.triggerHolster();
        await new Promise(r => setTimeout(r, duration));

        if (item && !isClosing) {
            if (player.equippedWeapon?.type !== 'RADIO') {
                lastEquippedWeaponRef.current = player.equippedWeapon;
            }

            setPlayer(prev => ({
                ...prev,
                equippedWeapon: item
            }));
            
            if (!isDialogueTrigger) {
                setGameState(GameState.RADIO_VIEW);
            }
            setActiveModal(null);
            
            const equipDuration = animControls.triggerEquip();

            if (item.sounds && item.sounds.use) {
                playSound(item.sounds.use);
            } else {
                playSound('SYS_INVENTORY_OPEN'); 
            }
            
            if (isDialogueTrigger) {
                await new Promise(r => setTimeout(r, equipDuration));
            }
        } else if (isClosing) {
            setPlayer(prev => ({
                ...prev,
                equippedWeapon: lastEquippedWeaponRef.current || null
            }));
            setGameState(GameState.PLAYING);
            
            const equipDuration = animControls.triggerEquip();
            if (isDialogueTrigger) {
                await new Promise(r => setTimeout(r, equipDuration));
            }
        }
    };

    const toggleMapMode = async (item: Item | null) => {
        if (item && combat.isActive) return;
        const duration = animControls.triggerHolster();
        await new Promise(r => setTimeout(r, duration));

        if (item && gameState !== GameState.MAP_VIEW) {
            // OPENING MAP
            if (player.equippedWeapon?.type !== 'MAP' && player.equippedWeapon?.type !== 'NOTE') {
                lastEquippedWeaponRef.current = player.equippedWeapon;
            }
            
            // Restore saved zoom for this item if available, else use default
            if (zoomLevelsRef.current.has(item.id)) {
                setMapZoom(zoomLevelsRef.current.get(item.id)!);
            } else {
                setMapZoom(item.drawScale || 1.0);
            }

            setPlayer(prev => ({
                ...prev,
                equippedWeapon: item
            }));
            setGameState(GameState.MAP_VIEW);
            setActiveModal(null);
            
            animControls.triggerEquip();

            if (item.sounds && item.sounds.use) {
                playSound(item.sounds.use);
            } else {
                playSound('SYS_INVENTORY_OPEN'); 
            }
        } else if (gameState === GameState.MAP_VIEW) {
            // CLOSING MAP
            // Save current zoom for the closing map item
            if (player.equippedWeapon?.type === 'MAP' || player.equippedWeapon?.type === 'NOTE') {
                zoomLevelsRef.current.set(player.equippedWeapon.id, mapZoom);
            }

            setPlayer(prev => ({
                ...prev,
                equippedWeapon: lastEquippedWeaponRef.current || null
            }));
            setGameState(GameState.PLAYING);
            
            animControls.triggerEquip();
            
            playSound('SYS_INVENTORY_CLOSE');
        }
    };

    const toggleConsoleMode = async (item: Item | null) => {
        if (item && combat.isActive) return;

        if (item && gameState !== GameState.CONSOLE_VIEW) {
            const cartridges = player.inventory?.filter(i => i.type === 'CARTRIDGE') || [];
            if (cartridges.length === 0) {
                playSound('CONSOLE_BUTTON');
                addLog(localize("В инвентаре нет картриджей для консоли!/No cartridges in inventory!"));
                return;
            }
        }

        const duration = animControls.triggerHolster();
        await new Promise(r => setTimeout(r, duration));

        if (item && gameState !== GameState.CONSOLE_VIEW) {
            if (player.equippedWeapon?.type !== 'MAP' && player.equippedWeapon?.type !== 'NOTE' && player.equippedWeapon?.type !== 'CONSOLE') {
                lastEquippedWeaponRef.current = player.equippedWeapon;
            }
            setPlayer(prev => ({ ...prev, equippedWeapon: item }));
            setGameState(GameState.CONSOLE_VIEW);
            setActiveModal(null);
            animControls.triggerEquip();
            if (item.sounds && item.sounds.use) playSound(item.sounds.use);
        } else if (gameState === GameState.CONSOLE_VIEW) {
            setPlayer(prev => ({ ...prev, equippedWeapon: lastEquippedWeaponRef.current || null }));
            setGameState(GameState.PLAYING);
            animControls.triggerEquip();
            playSound('SYS_INVENTORY_CLOSE');
        }
    };

    const forceCloseMap = () => {
        if (player.equippedWeapon?.type === 'MAP' || player.equippedWeapon?.type === 'NOTE' || gameState === GameState.MAP_VIEW || player.equippedWeapon?.type === 'RADIO' || gameState === GameState.RADIO_VIEW || player.equippedWeapon?.type === 'CONSOLE' || gameState === GameState.CONSOLE_VIEW) {
            // Save current zoom before force closing
            if (player.equippedWeapon?.type === 'MAP' || player.equippedWeapon?.type === 'NOTE') {
                zoomLevelsRef.current.set(player.equippedWeapon.id, mapZoom);
            }

            setPlayer(prev => ({
                ...prev,
                equippedWeapon: lastEquippedWeaponRef.current || null
            }));
            setGameState(GameState.PLAYING);
        }
    };

    const canPlantC4 = (): string | null => {
        if (!levelData) return "Нет уровня.";
        const dir = Math.round(player.dir + 4) % 4;
        const dx = [0, 1, 0, -1][dir];
        const dy = [-1, 0, 1, 0][dir];

        const targetX = Math.floor(player.pos.x) + dx;
        const targetY = Math.floor(player.pos.y) + dy;
        
        if (targetX < 0 || targetX >= levelData.width || targetY < 0 || targetY >= levelData.height) {
            return "Нет цели."; // or string from strings.logs
        }
        
        const tile = levelData.grid[targetY][targetX];
        if (tile.type !== 'WALL' && tile.type !== 'DOOR') {
            return strings?.logs?.c4_wall_only || "Можно установить только на стену.";
        }

        if (tile.explosive) {
            return strings?.logs?.c4_already_planted || "На этой стене уже есть взрывчатка.";
        }

        if (!tile.canBeDestroyed) {
             return strings?.logs?.c4_wall_indestructible || "Нельзя установить взрывчатку на эту стену.";
        }

        if (targetX <= 0 || targetX >= levelData.width - 1 || targetY <= 0 || targetY >= levelData.height - 1) {
             return strings?.logs?.c4_wall_indestructible || "Нельзя установить взрывчатку на эту стену.";
        }

        const neighbors = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        let hasAdjacentDoor = false;
        for (const n of neighbors) {
            const nx = targetX + n.dx;
            const ny = targetY + n.dy;
            if (nx >= 0 && nx < levelData.width && ny >= 0 && ny < levelData.height) {
                if (levelData.grid[ny][nx].type === 'DOOR') {
                    hasAdjacentDoor = true;
                    break;
                }
            }
        }

        if (hasAdjacentDoor || tile.type === 'DOOR' || tile.isWindow) {
             return strings?.logs?.c4_wall_indestructible || "Нельзя установить взрывчатку на эту стену.";
        }

        return null;
    };

    const handleInventoryAction = (item: Item, action: 'EQUIP' | 'USE' | 'THROW', initiateThrow: (i: Item, countToDrop?: number) => void, onFeedback?: (msg: string) => void, countToDrop?: number) => {
        if (!strings) return;
        if (action === 'EQUIP') handleEquipItem(item, onFeedback);
        else if (action === 'THROW') { initiateThrow(item, countToDrop); setActiveModal(null); }
        else if (action === 'USE') {
            
            let wasUsed = false;

            if (item.type === 'MAP' || item.type === 'RADIO' || item.type === 'NOTE' || item.type === 'CONSOLE') {
                if (combat.isActive) {
                    if (onFeedback) onFeedback(localize((strings?.logs as any)?.cannot_use_combat || "Cannot do this in combat."));
                    return;
                }
                if (item.type === 'MAP' || item.type === 'NOTE') toggleMapMode(item);
                else if (item.type === 'CONSOLE') toggleConsoleMode(item);
                else toggleRadioMode(item);
                return;
            }
            
            if (item.type === 'C4') {
                if (!plantExplosive || !levelData) return;
                
                const checkError = canPlantC4();
                if (checkError) {
                    if (onFeedback) onFeedback(checkError);
                    addLog(checkError, 'INFO');
                    return;
                }
                
                const dir = Math.round(player.dir + 4) % 4;
                const dx = [0, 1, 0, -1][dir];
                const dy = [-1, 0, 1, 0][dir];

                const targetX = Math.floor(player.pos.x) + dx;
                const targetY = Math.floor(player.pos.y) + dy;
                
                const newGrid = plantExplosive(targetX, targetY, item, player);
                
                if (!newGrid) {
                    // Placement failed (e.g. indestructible wall check inside plantExplosive just in case)
                    const msg = strings.logs.c4_wall_indestructible || "Нельзя установить взрывчатку на эту стену.";
                    if (onFeedback) onFeedback(msg);
                    return;
                }

                // Remove item
                setPlayer(prev => {
                    const newInventory = prev.inventory.filter(i => i.id !== item.id);
                    return { ...prev, inventory: newInventory };
                });
                
                const successMsg = strings.logs.c4_planted || "Взрывчатка установлена.";
                if (onFeedback) onFeedback(successMsg);
                addLog(successMsg, 'SUCCESS');
                
                if (item.sounds && item.sounds.use) {
                    playSound(item.sounds.use);
                }
                
                if (combat.isActive) {
                    setActiveModal(null);
                    triggerEnemyTurn(false, [], false, [], newGrid || undefined);
                } else {
                    if (onTakeTurn) onTakeTurn(undefined, newGrid || undefined);
                }
                return;
            }

            if (item.type === 'BATTERY') {
                // Find any item in equipment or inventory that requires this battery and does NOT have a battery
                const powerSourceType = item.definitionId || 'battery';
                
                // Check equipped items first, then inventory
                let targetItem: Item | undefined = undefined;
                
                // Order of checking: equipped slots then inventory
                const eqKeys = ['accessory1', 'accessory2', 'weapon', 'weaponAkimbo', 'helmet', 'vest', 'pants', 'boots'] as const;
                for (const key of eqKeys) {
                    const eqItem = player.equipment[key];
                    if (eqItem && eqItem.powerSource && (eqItem.hasBattery === false || eqItem.currentAmmo === 0)) {
                        targetItem = eqItem;
                        break;
                    }
                }
                
                if (!targetItem) {
                    targetItem = player.inventory.find(i => i.powerSource && (i.hasBattery === false || i.currentAmmo === 0));
                }
                
                // Fallback: search for any equipped or inventory item with powerSource that isn't fully charged
                if (!targetItem) {
                    for (const key of eqKeys) {
                        const eqItem = player.equipment[key];
                        if (eqItem && eqItem.powerSource && (eqItem.currentAmmo ?? 0) < (eqItem.magazineMax ?? 100)) {
                            targetItem = eqItem;
                            break;
                        }
                    }
                }
                if (!targetItem) {
                    targetItem = player.inventory.find(i => i.powerSource && (i.currentAmmo ?? 0) < (i.magazineMax ?? 100));
                }

                if (targetItem) {
                    if (item.sounds && item.sounds.use) {
                        playSound(item.sounds.use);
                    }
                    
                    const finalTargetVal = targetItem;
                    setPlayer(prev => {
                        const newInventory = prev.inventory.map(i => {
                            if (i.id === finalTargetVal.id) {
                                return { ...i, hasBattery: true, currentAmmo: item.charge ?? 100, dischargeCounter: -1 };
                            }
                            return i;
                        });

                        const nextEquipment = { ...prev.equipment };
                        for (const key of Object.keys(nextEquipment)) {
                            const k = key as keyof typeof nextEquipment;
                            if (nextEquipment[k]?.id === finalTargetVal.id) {
                                nextEquipment[k] = { 
                                    ...nextEquipment[k],
                                    hasBattery: true, 
                                    currentAmmo: item.charge ?? 100,
                                    dischargeCounter: -1
                                } as any;
                            }
                        }
                        
                        // Remove the battery item (taking into account count)
                        const currentItemIndex = prev.inventory.findIndex(i => i.id === item.id);
                        if (currentItemIndex !== -1) {
                            const currentCount = prev.inventory[currentItemIndex].count || 1;
                            if (currentCount > 1) {
                                newInventory[currentItemIndex] = { ...newInventory[currentItemIndex], count: currentCount - 1 };
                            } else {
                                return { ...prev, inventory: newInventory.filter(i => i.id !== item.id), equipment: nextEquipment };
                            }
                        }
                        return { ...prev, inventory: newInventory, equipment: nextEquipment };
                    });
                    
                    const msgName = localize(targetItem.name);
                    const logMsg = (strings?.logs?.battery_inserted || "Батарейка вставлена в {name}").replace('{name}', msgName);
                    if (onFeedback) onFeedback(logMsg);
                    addLog(logMsg, 'SUCCESS');
                    
                    if (combat.isActive) {
                        setActiveModal(null);
                        triggerEnemyTurn(false);
                    } else if (onTakeTurn) {
                        onTakeTurn();
                    }
                } else {
                    const logMsg = strings?.logs?.no_devices_for_battery || "У вас нет подходящих разряженных устройств";
                    if (onFeedback) onFeedback(logMsg);
                    addLog(logMsg, 'INFO');
                }
                return;
            }

            if (item.powerSource) {
                if (item.hasBattery === false || item.currentAmmo === 0) {
                    const msg = strings?.logs?.no_battery_in_inventory || "Нет батарейки";
                    if (onFeedback) onFeedback(msg);
                    addLog(msg, 'INFO');
                    return;
                }
                setPlayer(prev => {
                    const newInventory = prev.inventory.map(i => {
                        if (i.id === item.id) {
                            return { ...i, isActive: !i.isActive };
                        }
                        return i;
                    });
                    const nextEquipment = { ...prev.equipment };
                    for (const key of Object.keys(nextEquipment)) {
                        const k = key as keyof typeof nextEquipment;
                        if (nextEquipment[k]?.id === item.id) {
                            nextEquipment[k] = { 
                                ...nextEquipment[k], 
                                isActive: !nextEquipment[k]?.isActive 
                            } as any;
                        }
                    }
                    return { ...prev, inventory: newInventory, equipment: nextEquipment };
                });
                
                const newState = !item.isActive;
                const msg = newState ? (strings.ui?.settings?.on || "ON") : (strings.ui?.settings?.off || "OFF");
                if (onFeedback) onFeedback(`${localize(item.name)}: ${msg}`);
                
                return;
            } 
            
            // STRICT HEALTH CHECK
            // If item is a healing item and HP is full, BLOCK IT completely (do not apply effects like antiseptic)
            if (item.healDice && player.hp >= player.maxHp) {
                const msg = strings.inventory.full_health;
                addLog(msg, 'INFO');
                if (onFeedback) onFeedback(msg);
                return;
            }
            
            // Effect logic
            if (item.onUseEffect && applyEffect) {
                if (Math.random() * 100 <= item.onUseEffect.chance) {
                    applyEffect(item.onUseEffect.id);
                    wasUsed = true;
                }
            }

            if (item.healDice) {
                const heal = rollDice(item.healDice); 
                
                setPlayer(prev => {
                    const newHp = Math.min(prev.maxHp, prev.hp + heal);
                    // Use common stack reduction logic
                    const currentItemIndex = prev.inventory.findIndex(i => i.id === item.id);
                    if (currentItemIndex === -1) return prev; // Safety check

                    const currentItem = prev.inventory[currentItemIndex];
                    const currentCount = currentItem.count || 1;
                    
                    let newInventory = [...prev.inventory];
                    
                    if (currentCount > 1) {
                        newInventory[currentItemIndex] = { ...currentItem, count: currentCount - 1 };
                    } else {
                        newInventory = prev.inventory.filter(i => i.id !== item.id);
                    }

                    return { 
                        ...prev, 
                        hp: newHp, 
                        inventory: newInventory 
                    };
                }); 
                
                const msg = t(strings.logs.used_heal, { name: item.name, heal });
                addLog(msg, 'SUCCESS');
                if (onFeedback) onFeedback(msg);
                wasUsed = true;
            } else if (wasUsed) {
                // If Item had an effect but no heal dice (e.g. pill for effect only), consume it
                setPlayer(prev => {
                    const currentItemIndex = prev.inventory.findIndex(i => i.id === item.id);
                    if (currentItemIndex === -1) return prev;

                    const currentItem = prev.inventory[currentItemIndex];
                    const currentCount = currentItem.count || 1;
                    
                    let newInventory = [...prev.inventory];
                    
                    if (currentCount > 1) {
                        newInventory[currentItemIndex] = { ...currentItem, count: currentCount - 1 };
                    } else {
                        newInventory = prev.inventory.filter(i => i.id !== item.id);
                    }
                    
                    return { ...prev, inventory: newInventory };
                });
            }

            if (wasUsed) {
                if (item.sounds && item.sounds.use) {
                    playSound(item.sounds.use);
                }
                
                if (combat.isActive) { 
                    setActiveModal(null); 
                    triggerEnemyTurn(false); 
                }
            }
        }
    };

    const handleReloadAction = (forceImmediate: boolean = false) => {
        if (!strings || !player.equippedWeapon) return;
        const weapon = player.equippedWeapon; 
        const akimboWeapon = player.equipment.weaponAkimbo;
        
        if (weapon.magazineMax === undefined || weapon.currentAmmo === undefined) return;
        
        const spare = totalAmmoInInventory; 
        
        let mainNeeded = Math.max(0, weapon.magazineMax - weapon.currentAmmo);
        if (weapon.loseAmmoOnReload && mainNeeded > 0) {
            mainNeeded = weapon.magazineMax;
        }
        
        let akimboNeeded = akimboWeapon && akimboWeapon.magazineMax !== undefined && akimboWeapon.currentAmmo !== undefined 
            ? Math.max(0, akimboWeapon.magazineMax - akimboWeapon.currentAmmo) 
            : 0;
        if (akimboWeapon?.loseAmmoOnReload && akimboNeeded > 0) {
            akimboNeeded = akimboWeapon.magazineMax;
        }
            
        const totalNeeded = mainNeeded + akimboNeeded;
        
        if (gameState === GameState.PLAYING || (gameState === GameState.COMBAT && forceImmediate)) {
            if (totalNeeded === 0) { addLog(strings.logs.reload_not_required, 'INFO'); return; }
            if (spare <= 0) { addLog(strings.logs.no_ammo_spare, 'INFO'); return; }
            
            const toLoadTotal = Math.min(totalNeeded, spare);
            let toLoadMain = Math.min(mainNeeded, toLoadTotal);
            let toLoadAkimbo = Math.min(akimboNeeded, toLoadTotal - toLoadMain);
            
            if (toLoadTotal > 0) {
                // Play sound immediately as requested
                if (weapon.sounds && weapon.sounds.reload) {
                    playSound(weapon.sounds.reload);
                }
                
                if (weapon.ejectAllOnReload && spawnReloadCasings && toLoadMain > 0) {
                    spawnReloadCasings(weapon, (weapon.magazineMax || 0) - (weapon.currentAmmo || 0));
                }
                if (akimboWeapon?.ejectAllOnReload && spawnReloadCasings && toLoadAkimbo > 0) {
                    spawnReloadCasings(akimboWeapon, (akimboWeapon.magazineMax || 0) - (akimboWeapon.currentAmmo || 0));
                }

                // Log immediately
                addLog(t(strings.logs.reload, { name: weapon.name, count: toLoadTotal }), 'SUCCESS');

                // Trigger turn immediately for responsiveness (enemies move while gun animates)
                if (gameState === GameState.PLAYING && onTakeTurn) {
                    onTakeTurn();
                }

                // VISUAL UPGRADE: Trigger holster animation, wait, reload, then equip
                const animDuration = animControls.triggerHolster();

                setTimeout(() => {
                    setPlayer(prev => {
                        const tempInventory = [...prev.inventory];
                        let remainingNeeded = toLoadTotal;

                        const ammoIndices = tempInventory
                            .map((item, index) => ({ item, index }))
                            .filter(({ item }) => item.type === 'AMMO' && item.ammoType === weapon.ammoType)
                            .sort((a, b) => (a.item.count || 0) - (b.item.count || 0));

                        for (const { index } of ammoIndices) {
                            if (remainingNeeded <= 0) break;
                            const item = tempInventory[index];
                            const available = item.count || 0;
                            const take = Math.min(available, remainingNeeded);
                            
                            tempInventory[index] = { ...item, count: available - take };
                            remainingNeeded -= take;
                        }

                        const finalInventory = tempInventory.filter(item => {
                            if (item.type === 'AMMO' && (item.count === undefined || item.count <= 0)) return false;
                            return true;
                        });

                        let updatedWeapon: Item | null = null;
                        let updatedAkimboWeapon: Item | null = null;
                        
                        if (toLoadMain > 0) {
                            const weaponIndex = finalInventory.findIndex(i => i.id === weapon.id);
                            if (weaponIndex !== -1) {
                                updatedWeapon = { 
                                    ...finalInventory[weaponIndex], 
                                    currentAmmo: weapon.loseAmmoOnReload ? toLoadMain : (finalInventory[weaponIndex].currentAmmo || 0) + toLoadMain 
                                };
                                finalInventory[weaponIndex] = updatedWeapon;
                            } else if (prev.equipment.weapon?.id === weapon.id) {
                                updatedWeapon = { 
                                    ...prev.equipment.weapon, 
                                    currentAmmo: weapon.loseAmmoOnReload ? toLoadMain : (prev.equipment.weapon.currentAmmo || 0) + toLoadMain 
                                };
                            }
                        }
                        
                        if (toLoadAkimbo > 0 && akimboWeapon) {
                            const akimboIndex = finalInventory.findIndex(i => i.id === akimboWeapon.id && i !== updatedWeapon);
                            if (akimboIndex !== -1) {
                                updatedAkimboWeapon = { 
                                    ...finalInventory[akimboIndex], 
                                    currentAmmo: akimboWeapon.loseAmmoOnReload ? toLoadAkimbo : (finalInventory[akimboIndex].currentAmmo || 0) + toLoadAkimbo 
                                };
                                finalInventory[akimboIndex] = updatedAkimboWeapon;
                            } else if (prev.equipment.weaponAkimbo?.id === akimboWeapon.id) {
                                updatedAkimboWeapon = { 
                                    ...prev.equipment.weaponAkimbo, 
                                    currentAmmo: akimboWeapon.loseAmmoOnReload ? toLoadAkimbo : (prev.equipment.weaponAkimbo.currentAmmo || 0) + toLoadAkimbo 
                                };
                            }
                        }
                        
                        const newEquip = { ...prev.equipment };
                        if (updatedWeapon) {
                            newEquip.weapon = updatedWeapon;
                        }
                        if (updatedAkimboWeapon) {
                            newEquip.weaponAkimbo = updatedAkimboWeapon;
                        }

                        return { 
                            ...prev, 
                            inventory: finalInventory, 
                            equipment: newEquip,
                            equippedWeapon: updatedWeapon || prev.equippedWeapon
                        };
                    });
                    
                    // Bring weapon back up
                    animControls.triggerEquip();
                    
                }, animDuration);
            }
        } 
        else if (gameState === GameState.COMBAT) {
            // Trigger minigame fallback
            if (totalNeeded === 0) { addLog(strings.logs.reload_not_required, 'INFO'); return; }
            if (spare <= 0) { addLog(strings.logs.no_ammo_spare, 'INFO'); return; }
            setManualReloadTrigger(prev => prev + 1);
        }
    };

    const handleUnloadAction = (weapon: Item, onFeedback?: (msg: string) => void) => {
        if (!strings || !itemsDb) return;
        
        let actualWeapon = player.inventory.find(i => i.id === weapon.id);
        if (!actualWeapon) {
            actualWeapon = (Object.values(player.equipment) as (Item | null)[]).find(i => i && i.id === weapon.id) as Item | undefined;
        }

        if (!actualWeapon || actualWeapon.currentAmmo === undefined || actualWeapon.currentAmmo <= 0) {
            const msg = strings.logs.unload_empty || "Already empty.";
            addLog(msg, 'INFO');
            if (onFeedback) onFeedback(msg);
            return;
        }

        const ammoType = actualWeapon.ammoType;
        if (!ammoType) return;

        const dbAmmoKey = Object.keys(itemsDb).find(key => 
            itemsDb[key].type === 'AMMO' && itemsDb[key].ammoType === ammoType
        );
        const dbAmmo = dbAmmoKey ? itemsDb[dbAmmoKey] : null;

        if (!dbAmmo) {
            console.warn("Could not find ammo definition for type:", ammoType);
            return;
        }

        const maxStack = dbAmmo.maxStack || 999; 

        let ammoAmount = actualWeapon.currentAmmo!;
        const equippedIds = new Set(Object.values(player.equipment).filter(i => i).map(i => (i as Item).id));
        let currentLoad = player.inventory
            .filter(i => !equippedIds.has(i.id) && i.type !== 'CASH')
            .reduce((acc, i) => acc + (i.weight !== undefined ? i.weight : 1), 0);
        
        const BASE_INVENTORY_CAPACITY = 4;
        const bonusCapacity = 
           (player.equipment.helmet?.inventorySlots || 0) +
           (player.equipment.vest?.inventorySlots || 0) +
           (player.equipment.pants?.inventorySlots || 0) +
           (player.equipment.boots?.inventorySlots || 0) +
           (player.equipment.accessory1?.inventorySlots || 0) +
           (player.equipment.accessory2?.inventorySlots || 0);
        const maxCapacity = BASE_INVENTORY_CAPACITY + bonusCapacity;

        let simulatedAmmo = ammoAmount;
        for (let i = 0; i < player.inventory.length; i++) {
            if (simulatedAmmo <= 0) break;
            if (player.inventory[i].type === 'AMMO' && player.inventory[i].ammoType === ammoType) {
                const currentCount = player.inventory[i].count || 0;
                const spaceInStack = maxStack - currentCount;
                if (spaceInStack > 0) {
                    simulatedAmmo -= Math.min(spaceInStack, simulatedAmmo);
                }
            }
        }

        let inventoryFull = false;
        while (simulatedAmmo > 0) {
            const ammoWeight = dbAmmo.weight !== undefined ? dbAmmo.weight : 1;
            if (currentLoad + ammoWeight > maxCapacity) {
                inventoryFull = true;
                break; 
            }
            currentLoad += ammoWeight; 
            simulatedAmmo -= Math.min(maxStack, simulatedAmmo);
        }

        const unloadedAmount = ammoAmount - simulatedAmmo;

        if (inventoryFull) {
            const msg = strings.logs.inventory_full;
            addLog(msg, 'DANGER');
            if (onFeedback) onFeedback(msg);
        }

        if (unloadedAmount > 0) {
            const msg = t(strings.logs.unload_success || "Unloaded {count} rounds.", { count: unloadedAmount });
            addLog(msg, 'SUCCESS');
            if (onFeedback) onFeedback(msg);
            playSound('SYS_RELOAD'); 
            
            if (gameState === GameState.PLAYING && onTakeTurn) {
                onTakeTurn();
            }
        }

        if (unloadedAmount <= 0) return;

        setPlayer(prev => {
            let pWeapon = prev.inventory.find(i => i.id === weapon.id);
            if (!pWeapon) {
                pWeapon = (Object.values(prev.equipment) as (Item | null)[]).find(i => i && i.id === weapon.id) as Item | undefined;
            }

            if (!pWeapon || (pWeapon.currentAmmo || 0) <= 0) {
                return prev; 
            }

            let currentAmmoToProcess = unloadedAmount;
            const newInventory = [...prev.inventory];
            
            for (let i = 0; i < newInventory.length; i++) {
                if (currentAmmoToProcess <= 0) break;
                if (newInventory[i].type === 'AMMO' && newInventory[i].ammoType === ammoType) {
                    const currentCount = newInventory[i].count || 0;
                    const spaceInStack = maxStack - currentCount;
                    
                    if (spaceInStack > 0) {
                        const amountToAdd = Math.min(spaceInStack, currentAmmoToProcess);
                        newInventory[i] = {
                            ...newInventory[i],
                            count: currentCount + amountToAdd
                        };
                        currentAmmoToProcess -= amountToAdd;
                    }
                }
            }

            while (currentAmmoToProcess > 0) {
                const amountForNewStack = Math.min(maxStack, currentAmmoToProcess);
                
                const newAmmoItem: Item = {
                    ...dbAmmo,
                    id: Math.random().toString(36).substr(2, 9),
                    count: amountForNewStack,
                    currentAmmo: amountForNewStack, 
                    handAssetId: dbAmmo.handAsset,
                    handFemaleAssetId: dbAmmo.handFemaleAsset,
                    attackAssetId: dbAmmo.attackAsset,
                    attackFemaleAssetId: dbAmmo.attackAssetFemale,
                    maskAssetId: dbAmmo.maskAsset,
                    rawName: dbAmmo.name, 
                    rawDescription: dbAmmo.description, 
                    name: localize(dbAmmo.name), 
                    description: localize(dbAmmo.description) 
                };
                
                newInventory.push(newAmmoItem);
                currentAmmoToProcess -= amountForNewStack;
            }

            const newWeaponAmmo = pWeapon.currentAmmo! - unloadedAmount;
            let updatedWeapon = null;
            let equipUpdated = false;
            
            const nextEquip = { ...prev.equipment };
            if (nextEquip.weapon?.id === weapon.id) {
                nextEquip.weapon = { ...nextEquip.weapon, currentAmmo: newWeaponAmmo };
                updatedWeapon = nextEquip.weapon;
                equipUpdated = true;
            } else if (nextEquip.weaponAkimbo?.id === weapon.id) {
                nextEquip.weaponAkimbo = { ...nextEquip.weaponAkimbo, currentAmmo: newWeaponAmmo };
                updatedWeapon = nextEquip.weaponAkimbo;
                equipUpdated = true;
            }

            const wInvIndex = newInventory.findIndex(i => i.id === weapon.id);
            if (wInvIndex !== -1) {
                newInventory[wInvIndex] = { ...newInventory[wInvIndex], currentAmmo: newWeaponAmmo };
                if (!updatedWeapon) updatedWeapon = newInventory[wInvIndex];
            }

            return {
                ...prev,
                inventory: newInventory,
                equipment: nextEquip,
                equippedWeapon: (equipUpdated && nextEquip.weapon && prev.equippedWeapon && nextEquip.weapon.id === prev.equippedWeapon.id) ? nextEquip.weapon : prev.equippedWeapon
            };
        });
    };

    const canReload = useMemo(() => {
        const weapon = player.equippedWeapon;
        const akimboWeapon = player.equipment.weaponAkimbo;
        if (!weapon || weapon.magazineMax === undefined || weapon.currentAmmo === undefined) return false;
        
        const mainIsFull = weapon.currentAmmo >= weapon.magazineMax;
        const akimboIsFull = akimboWeapon && akimboWeapon.magazineMax !== undefined && akimboWeapon.currentAmmo !== undefined 
            ? akimboWeapon.currentAmmo >= akimboWeapon.magazineMax 
            : true;
            
        const isFull = mainIsFull && akimboIsFull;
        const hasSpare = totalAmmoInInventory > 0;
        return !isFull && hasSpare;
    }, [player.equippedWeapon, player.equipment.weaponAkimbo, totalAmmoInInventory]);

    const handleMapZoomIn = () => {
        setMapZoom(prev => Math.min(prev * 1.2, 5.0)); // Limit max zoom
    };

    const handleMapZoomOut = () => {
        setMapZoom(prev => Math.max(prev * 0.8, 0.2)); // Limit min zoom
    };

    const handleExtractBattery = (targetItem: Item, onFeedback?: (msg: string) => void, selectedBatteryId?: string) => {
        if (!strings) return;
        
        // If it HAS a battery, extract it!
        if (targetItem.hasBattery !== false && targetItem.currentAmmo !== 0) {
            const batteryPowerSource = targetItem.powerSource || 'battery';
            const baseBattery = (itemsDb as any) ? (itemsDb as any)[batteryPowerSource] || (itemsDb as any)['battery'] || {} : {};
            const batteryWeight = baseBattery.weight !== undefined ? baseBattery.weight : 1;

            // Check capacity
            if (inventoryStats.currentLoad + batteryWeight > inventoryStats.maxCapacity) {
                const msg = strings.logs.inventory_full || "Нет места в инвентаре";
                if (onFeedback) onFeedback(msg);
                addLog(msg, 'INFO');
                return;
            }

            if (baseBattery.sounds && baseBattery.sounds.use) {
                playSound(baseBattery.sounds.use);
            }

            setPlayer(prev => {
                const newInventory = [...prev.inventory];
                const fIndex = newInventory.findIndex(i => i.id === targetItem.id);
                if (fIndex !== -1) {
                    newInventory[fIndex] = { 
                        ...newInventory[fIndex], 
                        hasBattery: false, 
                        currentAmmo: 0,
                        isActive: false 
                    };
                }
                
                // Generate battery item
                const batteryItem: Item = {
                    ...baseBattery,
                    id: `BATTERY_${Date.now()}`,
                    type: 'BATTERY',
                    name: localize(baseBattery.name || "2AA батарейка/2AA battery"),
                    description: localize(baseBattery.description || "Используется для работы устройств требующих электрический ток./Used to power devices that require an electric current."),
                    assetId: baseBattery.assetId || 'BATTERY',
                    charge: targetItem.currentAmmo || 0,
                    count: 1
                };
                
                newInventory.push(batteryItem);
                
                const nextEquip = { ...prev.equipment };
                for (const key of Object.keys(nextEquip)) {
                    const k = key as keyof typeof nextEquip;
                    if (nextEquip[k]?.id === targetItem.id) {
                        nextEquip[k] = { 
                            ...nextEquip[k], 
                            hasBattery: false, 
                            currentAmmo: 0, 
                            isActive: false 
                        } as any;
                    }
                }

                return {
                    ...prev,
                    inventory: newInventory,
                    equipment: nextEquip
                };
            });

            const msgName = localize(targetItem.name);
            const logMsg = (strings.logs?.battery_extracted || "Батарейка извлечена из {name}").replace('{name}', msgName);
            if (onFeedback) onFeedback(logMsg);
            addLog(logMsg, 'SUCCESS');
        } else {
            // If it does NOT have a battery, FIND a battery in inventory and INSERT it!
            const batteryPowerSource = targetItem.powerSource || 'battery';
            
            // Find reference battery in inventory
            const batteryIndex = selectedBatteryId 
                ? player.inventory.findIndex(i => i.id === selectedBatteryId)
                : player.inventory.findIndex(i => i.type === 'BATTERY');
            
            if (batteryIndex === -1) {
                const msg = strings.logs?.no_battery_in_inventory || "У вас нет подходящей батарейки в инвентаре";
                if (onFeedback) onFeedback(msg);
                addLog(msg, 'WARNING');
                return;
            }

            const batteryItem = player.inventory[batteryIndex];

            if (batteryItem.sounds && batteryItem.sounds.use) {
                playSound(batteryItem.sounds.use);
            }

            setPlayer(prev => {
                const newInventory = prev.inventory.map(i => {
                    if (i.id === targetItem.id) {
                        return { 
                            ...i, 
                            hasBattery: true, 
                            currentAmmo: batteryItem.charge ?? 100, 
                            dischargeCounter: -1 
                        };
                    }
                    return i;
                });

                const nextEquip = { ...prev.equipment };
                for (const key of Object.keys(nextEquip)) {
                    const k = key as keyof typeof nextEquip;
                    if (nextEquip[k]?.id === targetItem.id) {
                        nextEquip[k] = { 
                            ...nextEquip[k],
                            hasBattery: true, 
                            currentAmmo: batteryItem.charge ?? 100,
                            dischargeCounter: -1
                        } as any;
                    }
                }
                
                // Remove the battery item (taking into account count)
                const currentItemIndex = prev.inventory.findIndex(i => i.id === batteryItem.id);
                if (currentItemIndex !== -1) {
                    const currentCount = prev.inventory[currentItemIndex].count || 1;
                    if (currentCount > 1) {
                        newInventory[currentItemIndex] = { ...newInventory[currentItemIndex], count: currentCount - 1 };
                    } else {
                        return { 
                            ...prev, 
                            inventory: newInventory.filter(i => i.id !== batteryItem.id), 
                            equipment: nextEquip 
                        };
                    }
                }
                return { ...prev, inventory: newInventory, equipment: nextEquip };
            });

            const msgName = localize(targetItem.name);
            const logMsg = (strings.logs?.battery_inserted || "Батарейка вставлена в {name}").replace('{name}', msgName);
            if (onFeedback) onFeedback(logMsg);
            addLog(logMsg, 'SUCCESS');
        }
    };

    return {
        handleExtractBattery,
        handleEquipItem,
        handleUnequipItem,
        handleInventoryAction,
        handleReloadAction,
        handleUnloadAction, 
        toggleMapMode,
        toggleRadioMode,
        toggleConsoleMode,
        forceHideRadio,
        forceCloseMap,
        canPlantC4,
        canReload,
        manualReloadTrigger,
        setManualReloadTrigger,
        mapZoom,
        handleMapZoomIn,
        handleMapZoomOut
    };
};
