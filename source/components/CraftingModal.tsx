import React, { useState, useMemo, useEffect } from 'react';
import { Player, Item, EquipSlot } from '../types';
import { 
    X, 
    Hammer, 
    RotateCcw, 
    Plus, 
    Pill, 
    Key, 
    Package, 
    Shield, 
    Flame, 
    Flashlight, 
    Zap, 
    Info, 
    Hand, 
    Map as MapIcon 
} from 'lucide-react';
import { WeaponIcon } from './WeaponIcon';
import { BulletIcon } from './CombatOverlay';
import recipes from '../data/recipes.json';
import itemsDb from '../data/items.json';
import ToastContainer from './Toast';
import { useToast } from '../hooks/useToast';
import { XboxButton } from './SettingsModal';

interface CraftingModalProps {
    player: Player;
    setPlayer: React.Dispatch<React.SetStateAction<Player>>;
    spriteMap: Map<string, HTMLImageElement>;
    onClose: () => void;
    strings: any;
    addLog: (msg: string, type: string) => void;
    playSound: (soundId: string) => void;
    settings: any;
}

// Global Item Slot renderer matching the aesthetics of Inventory slots but adaptively scaled to 64px
const ItemIcon = ({ 
    item, 
    spriteMap, 
    size = 64, 
    p = 'p-1.5' 
}: { 
    item?: Item | null; 
    spriteMap: Map<string, HTMLImageElement>; 
    size?: number; 
    p?: string; 
}) => {
    if (!item) {
        return (
            <div 
                className="bg-black/40 rounded opacity-50 flex items-center justify-center border border-gray-700/50 shadow-inner" 
                style={{ width: size, height: size }} 
            />
        );
    }

    const img = spriteMap.get(item.assetId);
    const isBroken = item.durability === 0 && item.maxDurability !== undefined && item.maxDurability > 0;

    const renderInnerIcon = () => {
        if (img) {
            return (
                <img 
                    src={img.src} 
                    crossOrigin="anonymous"
                    alt={item.name} 
                    className="w-[75%] h-[75%] object-contain drop-shadow-md border-0 outline-none select-none" 
                    style={{ imageRendering: 'pixelated' }}
                    decoding="sync"
                    draggable={false}
                />
            );
        }

        const brokenClass = isBroken ? 'grayscale opacity-50' : '';
        const iconClass = "w-[65%] h-[65%] select-none";
        
        switch (item.type) {
            case 'WEAPON': 
                return <WeaponIcon className={`${iconClass} text-red-400 ${brokenClass}`} />;
            case 'ARMOR': 
                return <Shield className={`${iconClass} text-yellow-400 ${brokenClass}`} />;
            case 'CONSUMABLE': 
                return <Pill className={`${iconClass} text-green-400 ${brokenClass}`} />;
            case 'KEY': 
                return <Key className={`${iconClass} text-yellow-400 ${brokenClass}`} />;
            case 'AMMO': 
                return <BulletIcon size={Math.round(size * 0.4)} className={`${iconClass} text-gray-500 ${brokenClass}`} />;
            case 'MAP': 
                return <MapIcon className={`${iconClass} text-cyan-400 ${brokenClass}`} />;
            case 'NOTE': 
                return <MapIcon className={`${iconClass} text-amber-200 ${brokenClass}`} />;
            case 'GRENADE':
            case 'FLASHBANG': 
                return (
                    <Flame 
                        className={`${iconClass} ${item.type === 'FLASHBANG' ? 'text-yellow-300' : 'text-orange-500'} ${brokenClass}`} 
                    />
                );
            case 'FLASHLIGHT': 
                return <Flashlight className={`${iconClass} text-yellow-200 ${brokenClass}`} />;
            default: 
                return <Package className={`${iconClass} text-gray-400 ${brokenClass}`} />;
        }
    };

    // Durability indicator bar (exact left vertical positioning as inventory slots)
    const hasDurability = item.maxDurability !== undefined && item.maxDurability > 0;
    const percentage = hasDurability 
        ? Math.max(0, Math.min(100, ((item.durability !== undefined ? item.durability : item.maxDurability!) / item.maxDurability!) * 100)) 
        : 100;
    const durColorClass = percentage > 50 ? 'bg-emerald-600' : percentage > 20 ? 'bg-amber-500' : 'bg-rose-600';

    return (
        <div 
            className={`bg-black/40 rounded flex items-center justify-center relative border border-gray-700/50 outline-none select-none ${p}`} 
            style={{ width: size, height: size }}
        >
            {hasDurability && (
                <div className="absolute -left-0.5 top-1 bottom-1 w-1 bg-gray-900 rounded-full overflow-hidden border border-gray-700/80 z-10 shadow-sm">
                    <div 
                        className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ${durColorClass}`} 
                        style={{ height: `${percentage}%` }} 
                    />
                </div>
            )}
            {renderInnerIcon()}
            {item.count && item.count > 1 && (
                <div className="absolute bottom-1 right-1 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold px-1.5 py-px rounded border border-gray-600/70 shadow-md font-mono leading-none z-10 select-none">
                    x{item.count}
                </div>
            )}
            {item.powerSource && item.currentAmmo !== undefined && item.magazineMax !== undefined && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max select-none">
                    <Zap size={6} className="text-yellow-400 w-1.5 h-1.5" />
                    <span>{Math.round((item.currentAmmo / item.magazineMax) * 100)}%</span>
                </div>
            )}
        </div>
    );
};

const CraftingModal: React.FC<CraftingModalProps> = ({ 
    player, 
    setPlayer, 
    spriteMap, 
    onClose, 
    strings, 
    addLog, 
    playSound, 
    settings 
}) => {
     const [slot1, setSlot1] = useState<Item | null>(null);
    const [slot2, setSlot2] = useState<Item | null>(null);
    const [activeSelectorSlot, setActiveSelectorSlot] = useState<1 | 2 | null>(null);
    const [isViewingRecipes, setIsViewingRecipes] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);
    const { toasts, showToast } = useToast(player.gender === 'female');

    const [isGamepadActive, setIsGamepadActive] = useState(() => {
        return typeof document !== 'undefined' ? document.body.classList.contains('gamepad-navigation-active') : false;
    });

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const observer = new MutationObserver(() => {
            setIsGamepadActive(document.body.classList.contains('gamepad-navigation-active'));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeSelectorSlot !== null) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    setActiveSelectorSlot(null);
                    playSound?.('SYS_CLICK');
                } else if (isViewingRecipes) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    setIsViewingRecipes(false);
                    playSound?.('SYS_CLICK');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [activeSelectorSlot, isViewingRecipes, playSound]);

    const checkItemMatch = (slot: Item, recipeKey: string) => {
        if (slot.id === recipeKey) return true;
        const recipeDef = (itemsDb as any)[recipeKey];
        if (!recipeDef) return false;
        
        // Match raw unlocalized DB names
        if (slot.rawName && recipeDef.name && slot.rawName === recipeDef.name) return true;
        
        // Split and match parts
        const rawNameParts = recipeDef.name ? recipeDef.name.split('/') : [];
        if (rawNameParts.length > 0) {
            const lName = slot.name ? slot.name.trim() : "";
            const matchesAnyPart = rawNameParts.some((p: string) => p.trim() === lName);
            if (matchesAnyPart) return true;
        }
        
        // Match assetId, type, and source templates
        if (slot.assetId && recipeDef.assetId && slot.assetId === recipeDef.assetId && slot.type === recipeDef.type) {
            return true;
        }
        
        return false;
    };

    const isEquipped = (item: Item) => {
        const eq = player.equipment;
        if (!eq) return false;
        const matches = (eqItem: Item | null) => eqItem === item || (eqItem?.id && eqItem.id === item.id);
        return matches(eq.weapon) || matches(eq.weaponAkimbo) || 
               matches(eq.helmet) || matches(eq.vest) || matches(eq.pants) || 
               matches(eq.boots) || matches(eq.accessory1) || matches(eq.accessory2);
    };

    const isDamaged = (item: Item) => {
        return item.maxDurability !== undefined && 
               item.maxDurability > 0 && 
               item.durability !== undefined && 
               item.durability < item.maxDurability;
    };

    const findRecipeForPair = (itemA: Item, itemB: Item) => {
        for (const recipe of recipes as any[]) {
            if ((checkItemMatch(itemA, recipe.item1) && checkItemMatch(itemB, recipe.item2)) ||
                (checkItemMatch(itemA, recipe.item2) && checkItemMatch(itemB, recipe.item1))) {
                return recipe;
            }
        }
        return null;
    };

    const getNeededCount = (candidate: Item, existing: Item | null) => {
        if (!existing) return 1;
        const r = findRecipeForPair(candidate, existing);
        if (!r) return 1;
        if (r.repairAmount !== undefined && r.repairMaterialsNeeded !== undefined) {
            const isCandidateRepairItem = checkItemMatch(candidate, r.result);
            if (isCandidateRepairItem) {
                return 1;
            } else {
                return r.repairMaterialsNeeded;
            }
        }
        return 1;
    };

    const getFillItemsForRecipe = (recipe: any) => {
        const pool = player.inventory.map(i => ({ ...i }));
        
        // Find index of item matching recipe.item1 (excluding equipped unless it's damaged)
        const idx1 = pool.findIndex(i => {
            const meetsEquipmentCheck = !isEquipped(i) || isDamaged(i);
            return meetsEquipmentCheck && checkItemMatch(i, recipe.item1);
        });
        if (idx1 === -1) return null;
        
        const item1 = pool[idx1];
        
        // Deduct it from pool
        const c1 = item1.count ?? 1;
        if (c1 > 1) {
            pool[idx1].count = c1 - 1;
        } else {
            pool.splice(idx1, 1);
        }
        
        // Find index of item matching recipe.item2
        const qtyNeed2 = (recipe.repairAmount !== undefined && recipe.repairMaterialsNeeded !== undefined)
            ? recipe.repairMaterialsNeeded
            : 1;
            
        let totalQty2 = 0;
        let representativeItem2: Item | null = null;
        
        for (const i of pool) {
            const meetsEquipmentCheck = !isEquipped(i) || isDamaged(i);
            if (meetsEquipmentCheck && checkItemMatch(i, recipe.item2)) {
                totalQty2 += (i.count ?? 1);
                if (!representativeItem2) {
                    representativeItem2 = i;
                }
            }
        }
        
        if (!representativeItem2 || totalQty2 < qtyNeed2) return null;
        
        return {
            item1,
            item2: representativeItem2
        };
    };

    const hasItemInInventory = (recipeKey: string) => {
        return player.inventory.some(i => checkItemMatch(i, recipeKey));
    };

    const visibleRecipes = useMemo(() => {
        const base = (recipes as any[]).filter(recipe => {
            const isRepair = recipe.repairAmount !== undefined;
            if (isRepair) {
                // Только ремонтируемый предмет (item1) дает право на показ, ремонтный материал (item2) игнорируется
                return hasItemInInventory(recipe.item1);
            } else {
                // Обычный крафт: любой из ингредиентов дает право на показ
                return hasItemInInventory(recipe.item1) || hasItemInInventory(recipe.item2);
            }
        });

        // Map them with their craftability status
        const mapped = base.map(recipe => {
            const canCraft = getFillItemsForRecipe(recipe) !== null;
            return { recipe, canCraft };
        });

        // Sort: canCraft = true first
        mapped.sort((a, b) => {
            if (a.canCraft && !b.canCraft) return -1;
            if (!a.canCraft && b.canCraft) return 1;
            return 0;
        });

        return mapped.map(item => item.recipe);
    }, [player.inventory, player.equipment]);

    const localize = (text: string | undefined): string => {
        if (!text) return "";
        const idx = text.indexOf('/');
        if (idx !== -1) {
            return settings?.language === 'ru' ? text.substring(0, idx).trim() : text.substring(idx + 1).trim();
        }
        return text;
    };

    const handleFillRecipe = (recipe: any) => {
        const candidates = getFillItemsForRecipe(recipe);
        if (!candidates) return;
        
        const firstItem = candidates.item1;
        const secondItem = candidates.item2;
        
        const cloned1 = { ...firstItem, count: 1 };
        const partnerNeeded = getNeededCount(secondItem, cloned1);
        const cloned2 = { ...secondItem, count: partnerNeeded };
        
        setSlot1(cloned1);
        setSlot2(cloned2);
        setIsViewingRecipes(false);
    };

    const getTotalAvailableCount = (targetItem: Item) => {
        let total = 0;
        player.inventory.forEach(i => {
            if (!isEquipped(i)) {
                if (i.id === targetItem.id || 
                    (i.rawName && targetItem.rawName && i.rawName === targetItem.rawName) || 
                    i.name === targetItem.name ||
                    (i.assetId && targetItem.assetId && i.assetId === targetItem.assetId && i.type === targetItem.type)) {
                    total += (i.count || 1);
                }
            }
        });
        return total;
    };

    // Filter available items: player.inventory minus what's in slot1 and slot2 (deducting exact counts used)
    const availableItems = useMemo(() => {
        const inventory = player.inventory
            .filter(i => !isEquipped(i) || isDamaged(i))
            .map(i => ({ ...i }));

        const deductFromInventory = (slotItem: Item) => {
            const matchIndex = inventory.findIndex(i => 
                i.id === slotItem.id || 
                (i.rawName && slotItem.rawName && i.rawName === slotItem.rawName) || 
                i.name === slotItem.name ||
                (i.assetId && slotItem.assetId && i.assetId === slotItem.assetId && i.type === slotItem.type)
            );
            if (matchIndex >= 0) {
                const invItem = inventory[matchIndex];
                const slotCount = slotItem.count ?? 1;
                const invCount = invItem.count ?? 1;
                if (invCount > slotCount) {
                    invItem.count = invCount - slotCount;
                } else {
                    inventory.splice(matchIndex, 1);
                }
            }
        };

        if (slot1) deductFromInventory(slot1);
        if (slot2) deductFromInventory(slot2);
        return inventory;
    }, [player.inventory, player.equipment, slot1, slot2]);
    
    // Group identically named items visually, but separate by durability if applicable
    const groupedItems = useMemo(() => {
        const groups: { baseItem: Item; totalVisualCount: number; objects: Item[] }[] = [];
        availableItems.forEach(item => {
            const hasDurability = item.maxDurability !== undefined && item.maxDurability > 0;
            const dVal = hasDurability ? (item.durability !== undefined ? item.durability : item.maxDurability) : -1;
            const groupKey = hasDurability 
                ? `${item.rawName || item.id}_dur_${dVal}`
                : (item.rawName || item.assetId || item.id);

            const existing = groups.find(g => {
                const gHasDurability = g.baseItem.maxDurability !== undefined && g.baseItem.maxDurability > 0;
                const gDVal = gHasDurability ? (g.baseItem.durability !== undefined ? g.baseItem.durability : g.baseItem.maxDurability) : -1;
                const gKey = gHasDurability 
                    ? `${g.baseItem.rawName || g.baseItem.id}_dur_${gDVal}`
                    : (g.baseItem.rawName || g.baseItem.assetId || g.baseItem.id);
                return gKey === groupKey;
            });

            const qty = item.count || item.quantity || 1;
            if (existing) {
                existing.totalVisualCount += qty;
                existing.objects.push(item);
            } else {
                groups.push({
                    baseItem: item,
                    totalVisualCount: qty,
                    objects: [item]
                });
            }
        });

        return groups;
    }, [availableItems]);

    const resultRecipe = useMemo(() => {
        if (!slot1 || !slot2) return null;
        return findRecipeForPair(slot1, slot2);
    }, [slot1, slot2]);

    const isRepairRecipe = resultRecipe && resultRecipe.repairAmount !== undefined;

    const isResultRecipeCrafted = useMemo(() => {
        if (!resultRecipe) return false;
        return player.craftedRecipes?.includes(resultRecipe.id) ?? false;
    }, [resultRecipe, player.craftedRecipes]);

    const repairInfo = useMemo(() => {
        if (!resultRecipe || !slot1 || !slot2 || !isRepairRecipe) return null;

        const resultItemDefinition = (itemsDb as any)[resultRecipe.result];
        if (!resultItemDefinition) return null;

        const isSlot1Repaired = checkItemMatch(slot1, resultRecipe.result);
        const itemToRepair = isSlot1Repaired ? slot1 : slot2;
        const materialUsed = isSlot1Repaired ? slot2 : slot1;
        const materialSlotIndex = isSlot1Repaired ? 2 : 1;

        const reqQty = resultRecipe.repairMaterialsNeeded ?? 1;
        const totalMaterialCount = getTotalAvailableCount(materialUsed);
        const canAfford = totalMaterialCount >= reqQty;
        const isFullyRepaired = itemToRepair.durability !== undefined && itemToRepair.maxDurability !== undefined && itemToRepair.durability >= itemToRepair.maxDurability;

        return {
            itemToRepair,
            materialUsed,
            materialSlotIndex,
            reqQty,
            totalMaterialCount,
            canAfford,
            isFullyRepaired
        };
    }, [resultRecipe, isRepairRecipe, slot1, slot2, player.inventory]);

    const isAlreadyFullyRepaired = useMemo(() => {
        return repairInfo ? repairInfo.isFullyRepaired : false;
    }, [repairInfo]);

    const resultItemPreview = useMemo(() => {
        if (!resultRecipe || !slot1 || !slot2) return null;
        const resultItemDefinition = (itemsDb as any)[resultRecipe.result];
        if (!resultItemDefinition) return null;

        if (isRepairRecipe && repairInfo) {
            const itemToRepair = repairInfo.itemToRepair;
            const maxDur = itemToRepair.maxDurability || resultItemDefinition.maxDurability || 100;
            const currentDur = itemToRepair.durability !== undefined ? itemToRepair.durability : maxDur;
            const repAmt = resultRecipe.repairAmount;
            const addedDur = Math.round((repAmt / 100) * maxDur);
            const newDur = Math.min(maxDur, currentDur + addedDur);

            return {
                ...itemToRepair,
                durability: newDur
            };
        }

        return resultItemDefinition ? { ...resultItemDefinition, id: resultRecipe.result } : null;
    }, [resultRecipe, isRepairRecipe, slot1, slot2, repairInfo]);

    const buttonLabel = useMemo(() => {
        if (!resultRecipe) return strings.ui?.controls?.btn_crafting || 'CREATE';
        if (isRepairRecipe) {
            if (isAlreadyFullyRepaired) {
                return strings.ui?.controls?.msg_fully_repaired || 'NO REPAIR NEEDED';
            }
            if (repairInfo && !repairInfo.canAfford) {
                return strings.ui?.controls?.msg_insufficient_materials || 'INSUFFICIENT MATERIALS';
            }
            return strings.ui?.controls?.btn_repair || 'REPAIR';
        }
        return strings.ui?.controls?.btn_crafting || 'CREATE';
    }, [resultRecipe, isRepairRecipe, isAlreadyFullyRepaired, repairInfo, strings]);

    const handleSlotClick = (slotIndex: 1 | 2) => {
        if (slotIndex === 1) {
            setSlot1(null);
            if (slot2) {
                setSlot2({ ...slot2, count: 1 });
            }
        }
        if (slotIndex === 2) {
            setSlot2(null);
            if (slot1) {
                setSlot1({ ...slot1, count: 1 });
            }
        }
    };

    const executeCraftComplete = () => {
        if (!resultRecipe || !slot1 || !slot2) {
            setIsRevealing(false);
            return;
        }
        const resultItemDefinition = (itemsDb as any)[resultRecipe.result];
        if (!resultItemDefinition) {
            setIsRevealing(false);
            return;
        }

        window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'unlock', statKey: 'tinkerer' } }));

        setPlayer(prev => {
            let newInventory = [...prev.inventory];
            const newCrafted = prev.craftedRecipes ? [...prev.craftedRecipes] : [];
            if (resultRecipe && !newCrafted.includes(resultRecipe.id)) {
                newCrafted.push(resultRecipe.id);
            }
            
            if (isRepairRecipe && repairInfo) {
                const itemToRepair = repairInfo.itemToRepair;
                const materialUsed = repairInfo.materialUsed;
                const reqQty = repairInfo.reqQty;

                // Consume exactly reqQty units of repair material
                let qtyLeftToConsume = reqQty;
                newInventory = newInventory.map(item => {
                    if (qtyLeftToConsume <= 0) return item;
                    
                    const isMatch = item.id === materialUsed.id || 
                                    (item.rawName && materialUsed.rawName && item.rawName === materialUsed.rawName) || 
                                    item.name === materialUsed.name ||
                                    (item.assetId && materialUsed.assetId && item.assetId === materialUsed.assetId && item.type === materialUsed.type);
                    
                    if (isMatch) {
                        const count = item.count || 1;
                        if (count > qtyLeftToConsume) {
                            const newCount = count - qtyLeftToConsume;
                            qtyLeftToConsume = 0;
                            return { ...item, count: newCount };
                        } else {
                            qtyLeftToConsume -= count;
                            return null; // completely consumed/removed
                        }
                    }
                    return item;
                }).filter(Boolean) as Item[];

                // Adjust durability of itemToRepair
                let updatedItem: Item | null = null;
                newInventory = newInventory.map(item => {
                    if (item.id === itemToRepair.id || (item.rawName && itemToRepair.rawName && item.rawName === itemToRepair.rawName) || item.name === itemToRepair.name) {
                        const maxDur = item.maxDurability || 100;
                        const currentDur = item.durability !== undefined ? item.durability : maxDur;
                        const addedDur = Math.round((resultRecipe.repairAmount / 100) * maxDur);
                        const newDur = Math.min(maxDur, currentDur + addedDur);
                        const result = {
                            ...item,
                            durability: newDur
                        };
                        updatedItem = result;
                        return result;
                    }
                    return item;
                });

                // Update the durability of the equipped item in player.equipment (if it was equipped)
                const nextEquipment = { ...prev.equipment };
                if (updatedItem) {
                    const typedUpdatedItem = updatedItem as Item;
                    Object.keys(nextEquipment).forEach(key => {
                        const eqItem = nextEquipment[key as EquipSlot];
                        if (eqItem && (eqItem.id === typedUpdatedItem.id || (eqItem.rawName && typedUpdatedItem.rawName && eqItem.rawName === typedUpdatedItem.rawName) || eqItem.name === typedUpdatedItem.name)) {
                            nextEquipment[key as EquipSlot] = {
                                ...eqItem,
                                durability: typedUpdatedItem.durability
                            };
                        }
                    });
                }

                // If equippedWeapon is also this weapon, we update it too
                let nextEquippedWeapon = prev.equippedWeapon;
                if (updatedItem && prev.equippedWeapon) {
                    const typedUpdatedItem = updatedItem as Item;
                    if (prev.equippedWeapon.id === typedUpdatedItem.id || (prev.equippedWeapon.rawName && typedUpdatedItem.rawName && prev.equippedWeapon.rawName === typedUpdatedItem.rawName) || prev.equippedWeapon.name === typedUpdatedItem.name) {
                        nextEquippedWeapon = {
                            ...prev.equippedWeapon,
                            durability: typedUpdatedItem.durability
                        };
                    }
                }

                return {
                    ...prev,
                    inventory: newInventory,
                    equipment: nextEquipment,
                    equippedWeapon: nextEquippedWeapon,
                    craftedRecipes: newCrafted
                };
            } else {
                let found1 = false;
                let found2 = false;
                
                newInventory = newInventory.map(i => {
                    if (!found1 && (i === slot1 || (i.id && slot1.id && i.id === slot1.id))) {
                        found1 = true;
                        if (i.count && i.count > 1) {
                            return { ...i, count: i.count - 1 };
                        }
                        return null;
                    }
                    if (!found2 && (i === slot2 || (i.id && slot2.id && i.id === slot2.id))) {
                        found2 = true;
                        if (i.count && i.count > 1) {
                            return { ...i, count: i.count - 1 };
                        }
                        return null;
                    }
                    return i;
                }).filter(Boolean) as Item[];

                const newItemAmount = resultItemDefinition.count || resultItemDefinition.quantity || 1;
                const isStackable = resultItemDefinition.stackable ?? (resultItemDefinition.type === 'AMMO' || resultItemDefinition.type === 'CASH' || resultItemDefinition.type === 'RESOURCE' || resultItemDefinition.type === 'CONSUMABLE' || resultItemDefinition.type === 'MATERIAL');
                
                let added = false;
                if (isStackable) {
                    const existingIndex = newInventory.findIndex(i => i.id === resultRecipe.result);
                    if (existingIndex >= 0) {
                        newInventory[existingIndex] = {
                            ...newInventory[existingIndex],
                            count: (newInventory[existingIndex].count || 1) + newItemAmount
                        };
                        added = true;
                    }
                }
                
                if (!added) {
                    newInventory.push({
                        ...resultItemDefinition,
                        id: `crafted_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        count: newItemAmount,
                        uses: resultItemDefinition.maxUses || 1,
                        handAssetId: resultItemDefinition.handAsset,
                        handFemaleAssetId: resultItemDefinition.handFemaleAsset,
                        attackAssetId: resultItemDefinition.attackAsset,
                        attackFemaleAssetId: resultItemDefinition.attackAssetFemale,
                        maskAssetId: resultItemDefinition.maskAsset,
                        name: localize(resultItemDefinition.name),
                        rawName: resultItemDefinition.name,
                        description: localize(resultItemDefinition.description),
                        rawDescription: resultItemDefinition.description,
                        ...(resultItemDefinition.desc ? { desc: localize(resultItemDefinition.desc) } : {}),
                        ...(resultItemDefinition.maxDurability ? { durability: resultItemDefinition.maxDurability } : {})
                    });
                }
            }

            return {
                ...prev,
                inventory: newInventory,
                craftedRecipes: newCrafted
            };
        });

        const locName = localize(resultItemDefinition.name);
        if (isRepairRecipe) {
            const repairLabel = strings.ui?.controls?.btn_repair || 'Repaired';
            addLog(`${repairLabel}: ${locName}`, 'SUCCESS');

            const toastTemplate = strings.ui?.controls?.msg_repaired_item || 'You have repaired {item}';
            const toastText = toastTemplate.replace('{item}', locName);
            showToast(toastText);
        } else {
            const craftLabel = strings.ui?.controls?.btn_crafting || 'Crafted';
            addLog(`${craftLabel}: ${locName}`, 'SUCCESS');

            const toastTemplate = strings.ui?.controls?.msg_crafted_item || 'You have crafted {item}';
            const toastText = toastTemplate.replace('{item}', locName);
            showToast(toastText);
        }

        setSlot1(null);
        setSlot2(null);
        setIsRevealing(false);
    };

    const handleCraft = () => {
        if (isRevealing) return;
        if (!resultRecipe || !slot1 || !slot2) return;
        const resultItemDefinition = (itemsDb as any)[resultRecipe.result];
        if (!resultItemDefinition) return;

        // If repair, check materials first
        if (isRepairRecipe && repairInfo && !repairInfo.canAfford) return;

        const isFirstTimeNonRepair = !isRepairRecipe && !isResultRecipeCrafted;

        if (isFirstTimeNonRepair) {
            setIsRevealing(true);
            playSound('SYS_CRAFTED');
            setTimeout(() => {
                executeCraftComplete();
            }, 1800);
        } else {
            executeCraftComplete();
            playSound('SYS_CRAFTED');
        }
    };

    useEffect(() => {
        const handleXPress = () => {
            if (activeSelectorSlot !== null || isViewingRecipes) return;
            const canCraft = resultRecipe && !isAlreadyFullyRepaired && (!isRepairRecipe || (repairInfo && repairInfo.canAfford));
            if (canCraft && !isRevealing) {
                handleCraft();
            }
        };

        const handleYPress = () => {
            if (activeSelectorSlot !== null || isViewingRecipes) return;
            if (slot1 || slot2) {
                setSlot1(null);
                setSlot2(null);
                playSound?.('SYS_CLICK');
            }
        };

        window.addEventListener('gamepad-crafting-x-press', handleXPress);
        window.addEventListener('gamepad-crafting-y-press', handleYPress);

        return () => {
            window.removeEventListener('gamepad-crafting-x-press', handleXPress);
            window.removeEventListener('gamepad-crafting-y-press', handleYPress);
        };
    }, [resultRecipe, isAlreadyFullyRepaired, isRepairRecipe, repairInfo, isRevealing, slot1, slot2, playSound, activeSelectorSlot, isViewingRecipes, handleCraft]);

    // Render durability vertical bar in exactly the style of the Inventory modal
    const renderDurabilityBarForList = (item: Item | null) => {
        if (!item || item.maxDurability === undefined || item.maxDurability === 0) return null;
        const percentage = Math.max(0, Math.min(100, ((item.durability || 0) / item.maxDurability) * 100));
        const colorClass = percentage > 50 ? 'bg-emerald-600' : percentage > 20 ? 'bg-amber-500' : 'bg-rose-600';
        return (
            <div className="absolute -left-0.5 top-1 bottom-1 w-1 bg-gray-900 rounded-full overflow-hidden border border-gray-700/80 z-10 shadow-sm">
                <div 
                    className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ${colorClass}`}
                    style={{ height: `${percentage}%` }}
                />
            </div>
        );
    };

    const renderIconForList = (item: Item, className: string = "w-8 h-8") => {
        const img = spriteMap.get(item.assetId);
        const isBroken = item.durability === 0 && item.maxDurability !== undefined && item.maxDurability > 0;
        if (img) {
            return (
                <img 
                    src={img.src} 
                    crossOrigin="anonymous"
                    alt={item.name} 
                    className={`${className} object-contain drop-shadow-md ${isBroken ? 'grayscale opacity-50' : ''}`} 
                    style={{ imageRendering: 'pixelated' }}
                    decoding="sync"
                />
            );
        }

        const brokenClass = isBroken ? 'grayscale opacity-50' : '';
        switch(item.type) {
            case 'WEAPON': return <WeaponIcon className={`${className} text-red-400 ${brokenClass}`} />;
            case 'ARMOR': return <Shield className={`${className} text-yellow-400 ${brokenClass}`} />;
            case 'CONSUMABLE': return <Pill className={`${className} text-green-400 ${brokenClass}`} />;
            case 'KEY': return <Key className={`${className} text-yellow-400 ${brokenClass}`} />;
            case 'AMMO': return <BulletIcon size={16} className={`${className} text-gray-500 ${brokenClass}`} />;
            case 'MAP': return <MapIcon className={`${className} text-cyan-400 ${brokenClass}`} />;
            case 'NOTE': return <MapIcon className={`${className} text-amber-200 ${brokenClass}`} />;
            case 'GRENADE':
            case 'FLASHBANG': return <Flame className={`${className} ${item.type === 'FLASHBANG' ? 'text-yellow-300' : 'text-orange-500'} ${brokenClass}`} />;
            case 'FLASHLIGHT': return <Flashlight className={`${className} text-yellow-200 ${brokenClass}`} />;
            default: return <Package className={`${className} text-gray-400 ${brokenClass}`} />;
        }
    };

    // If material selector screen is active, render EXACT replica layout of InventoryModal
    if (activeSelectorSlot !== null) {
        return (
            <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura'] select-none">
                <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
                    
                    {/* Header: matched exactly except for unrequested stats/fonts overlays */}
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
                        <div className="flex items-center gap-2">
                            <Hammer className="text-cyan-400" size={18} />
                            <h2 className="text-lg font-bold text-white tracking-widest uppercase">
                                {strings.ui?.controls?.btn_select_material || 'SELECT ITEM'}
                            </h2>
                        </div>
                        <button 
                            onClick={() => setActiveSelectorSlot(null)} 
                            className="text-gray-400 active:text-white hover:text-white transition-colors flex items-center gap-1 touch-manipulation focus:ring-0 focus:outline-none outline-none"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    
                    {/* Items List: identical sizing, padding, scroll logic, background */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-800/95 relative scrollbar-thin">
                        {groupedItems.length === 0 ? (
                            <div className="text-gray-500 text-center italic mt-4">
                                {strings.inventory?.empty || 'EmptyPocket.'}
                            </div>
                        ) : (
                            groupedItems.map((group, index) => {
                                const item = group.baseItem;
                                const itemCount = group.totalVisualCount;
                                return (
                                    <div 
                                        key={`${item.id || 'select'}-${index}`} 
                                        className="flex items-center p-1.5 bg-gray-900/80 rounded border border-gray-700 active:border-gray-500 hover:border-gray-650 transition-all"
                                    >
                                        {/* Icon item: identical to inventory cell */}
                                        <div className="p-0.5 bg-black/40 rounded mr-1.5 border border-gray-700/50 w-10 h-10 flex items-center justify-center shrink-0 relative">
                                            {renderDurabilityBarForList(item)}
                                            {renderIconForList(item, "w-8 h-8")}
                                            {item.powerSource && item.currentAmmo !== undefined && item.magazineMax !== undefined && (
                                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                                                    <Zap size={6} className="text-yellow-400" />
                                                    <span>{Math.round((item.currentAmmo / item.magazineMax) * 100)}%</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Info: identical spacing, font weight */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <h3 className="font-bold text-gray-200 text-xs uppercase truncate">
                                                    {localize(item.name)}
                                                </h3>
                                                {isEquipped(item) && (
                                                    <div className="px-1.5 py-0 bg-amber-900/40 text-amber-300 text-[8px] font-['Jura'] font-bold rounded border border-amber-800/50 flex items-center shadow-sm uppercase whitespace-nowrap shrink-0">
                                                        {strings.equipment?.status_equipped || 'EQUIPPED'}
                                                    </div>
                                                )}
                                                {item.type === 'BATTERY' && item.charge !== undefined && (
                                                    <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm font-mono">
                                                        <Zap size={7} className="text-yellow-400" />
                                                        <span>{item.charge}%</span>
                                                    </div>
                                                )}
                                                {(item.type === 'AMMO' || item.type === 'CASH' || itemCount > 1) && (
                                                    <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm font-mono">
                                                        {item.type === 'AMMO' ? <BulletIcon size={7} /> : item.type === 'CASH' ? <span className="text-[8px] leading-none text-green-400">$</span> : <span className="text-[8px] leading-none">x</span>}
                                                        <span>{itemCount}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-gray-400 leading-tight truncate">
                                                {localize(item.description)}
                                            </p>
                                        </div>

                                        {/* Select button: styled identically to Use button in inventory */}
                                        <div className="flex flex-row items-center pl-1.5">
                                            <button 
                                                onClick={() => {
                                                    const needed = getNeededCount(item, activeSelectorSlot === 1 ? slot2 : slot1);
                                                    const cloned = { ...item, count: needed };
                                                    
                                                    if (activeSelectorSlot === 1) {
                                                        setSlot1(cloned);
                                                        if (slot2) {
                                                            const partnerNeeded = getNeededCount(slot2, cloned);
                                                            setSlot2({ ...slot2, count: partnerNeeded });
                                                        }
                                                    } else {
                                                        setSlot2(cloned);
                                                        if (slot1) {
                                                            const partnerNeeded = getNeededCount(slot1, cloned);
                                                            setSlot1({ ...slot1, count: partnerNeeded });
                                                        }
                                                    }
                                                    setActiveSelectorSlot(null);
                                                }}
                                                className="px-3 py-1.5 bg-green-900/40 text-[9px] rounded active:bg-green-800 text-green-200 border border-green-800/50 uppercase tracking-wider transition-colors touch-manipulation font-bold select-none outline-none focus:outline-none"
                                            >
                                                {strings.ui?.controls?.btn_add || 'ДОБАВИТЬ'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Default main view of CraftingModal
    return (
        <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura'] select-none">
            <div className={`bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative ${isRevealing ? 'pointer-events-none' : ''}`}>
                
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Hammer className="text-cyan-400" size={18} />
                            <h2 className="text-sm sm:text-base font-bold text-white tracking-widest uppercase">
                                {isViewingRecipes 
                                    ? (strings.ui?.controls?.title_recipes || 'RECIPES') 
                                    : (strings.ui?.controls?.btn_crafting || 'CRAFTING')}
                            </h2>
                        </div>
                        <button
                            onClick={() => { if (!isRevealing) setIsViewingRecipes(prev => !prev); }}
                            className="px-2 py-1 bg-cyan-950/80 border border-cyan-800 text-cyan-400 text-[10px] font-bold rounded hover:bg-cyan-900/60 transition-all outline-none focus:outline-none"
                        >
                            {isViewingRecipes 
                                ? (strings.ui?.modal?.back || 'BACK') 
                                : (strings.ui?.controls?.btn_recipes || 'RECIPES')}
                        </button>
                    </div>
                    <button 
                        onClick={() => { if (!isRevealing) onClose(); }} 
                        className="text-gray-400 active:text-white hover:text-white transition-colors flex items-center gap-1 touch-manipulation focus:ring-0 focus:outline-none outline-none gamepad-hide-buttons"
                    >
                        <X size={20} />
                    </button>
                </div>

                {isViewingRecipes && (
                    <div className="px-4 py-2 bg-gray-900/60 border-b border-gray-700/50 flex justify-between items-center shrink-0">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                            {strings.ui?.controls?.title_recipes || 'RECIPES LIST'}
                        </span>
                    </div>
                )}

                {isViewingRecipes ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-800/95 scrollbar-thin max-h-[450px]">
                        {visibleRecipes.length === 0 ? (
                            <div className="text-gray-500 text-center italic mt-4 py-8">
                                {strings.ui?.controls?.msg_no_recipes || 'НЕТ ДОСТУПНЫХ РЕЦЕПТОВ'}
                            </div>
                        ) : (
                            visibleRecipes.map((recipe) => {
                                const isCrafted = player.craftedRecipes?.includes(recipe.id) ?? false;
                                const fillableItems = getFillItemsForRecipe(recipe);
                                const isFillable = !!fillableItems;

                                const itemTemplate1 = (itemsDb as any)[recipe.item1];
                                const itemTemplate2 = (itemsDb as any)[recipe.item2];
                                const resultTemplate = (itemsDb as any)[recipe.result];

                                const matchedItem1 = fillableItems?.item1 || player.inventory.find(i => {
                                    const matches = checkItemMatch(i, recipe.item1);
                                    if (!matches) return false;
                                    if (recipe.repairAmount !== undefined) {
                                        return isDamaged(i);
                                    }
                                    return true;
                                }) || player.inventory.find(i => checkItemMatch(i, recipe.item1));

                                const matchedItem2 = fillableItems?.item2 || player.inventory.find(i => checkItemMatch(i, recipe.item2));

                                const item1Durability = matchedItem1 ? (matchedItem1.durability !== undefined ? matchedItem1.durability : matchedItem1.maxDurability) : itemTemplate1?.maxDurability;
                                const item2Durability = matchedItem2 ? (matchedItem2.durability !== undefined ? matchedItem2.durability : matchedItem2.maxDurability) : itemTemplate2?.maxDurability;

                                let resultDurability = resultTemplate?.maxDurability;
                                if (recipe.repairAmount !== undefined) {
                                    const maxDur = matchedItem1?.maxDurability || resultTemplate?.maxDurability || 100;
                                    const currentDur = item1Durability !== undefined ? item1Durability : maxDur;
                                    const addedDur = Math.round((recipe.repairAmount / 100) * maxDur);
                                    resultDurability = Math.min(maxDur, currentDur + addedDur);
                                }

                                const item1Obj = itemTemplate1 ? { 
                                    ...itemTemplate1, 
                                    id: recipe.item1, 
                                    name: localize(itemTemplate1.name),
                                    description: localize(itemTemplate1.description),
                                    durability: item1Durability
                                } : null;
                                
                                const item2Obj = itemTemplate2 ? { 
                                    ...itemTemplate2, 
                                    id: recipe.item2, 
                                    name: localize(itemTemplate2.name),
                                    count: recipe.repairMaterialsNeeded || 1,
                                    description: localize(itemTemplate2.description),
                                    durability: item2Durability
                                } : null;
                                
                                const resultObj = resultTemplate ? { 
                                    ...resultTemplate, 
                                    id: recipe.result, 
                                    name: localize(resultTemplate.name),
                                    description: localize(resultTemplate.description),
                                    durability: resultDurability
                                } : null;

                                return (
                                    <div key={recipe.id} className="bg-gray-900/70 border border-gray-700/80 rounded p-3 flex flex-col gap-2 shadow-sm">
                                        <div className="flex items-center justify-between gap-2 border-b border-gray-800/50 pb-1.5">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-mono">
                                                {recipe.repairAmount !== undefined 
                                                    ? (strings.ui?.controls?.btn_repair || 'РЕМОНТ') 
                                                    : (strings.ui?.controls?.btn_crafting || 'КРАФТ')}
                                            </span>
                                            {recipe.repairAmount !== undefined && (
                                                <span className="text-[10px] text-cyan-400 font-bold font-mono">
                                                    +{recipe.repairAmount}%
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-center gap-2">
                                            {/* Ингредиент 1 */}
                                            {item1Obj && (
                                                <div className="flex flex-col items-center flex-1 max-w-[90px]">
                                                    <ItemIcon item={item1Obj} spriteMap={spriteMap} size={48} />
                                                    <span className="text-[9px] text-gray-300 text-center leading-snug mt-1 truncate w-full" title={item1Obj.name}>
                                                        {item1Obj.name}
                                                    </span>
                                                    {item1Obj.maxDurability !== undefined && item1Obj.maxDurability > 0 && (
                                                        <span className="text-[9px] text-gray-500 font-bold">
                                                            ({item1Obj.durability !== undefined ? item1Obj.durability : item1Obj.maxDurability}/{item1Obj.maxDurability})
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <span className="text-xl text-gray-500 font-bold self-center pb-4 select-none shrink-0">
                                                +
                                            </span>

                                            {/* Ингредиент 2 */}
                                            {item2Obj && (
                                                <div className="flex flex-col items-center flex-1 max-w-[90px]">
                                                    <ItemIcon item={item2Obj} spriteMap={spriteMap} size={48} />
                                                    <span className="text-[9px] text-gray-300 text-center leading-snug mt-1 truncate w-full" title={item2Obj.name}>
                                                        {item2Obj.name}
                                                    </span>
                                                    {item2Obj.maxDurability !== undefined && item2Obj.maxDurability > 0 && (
                                                        <span className="text-[9px] text-gray-500 font-bold">
                                                            ({item2Obj.durability !== undefined ? item2Obj.durability : item2Obj.maxDurability}/{item2Obj.maxDurability})
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <span className="text-xl text-gray-500 font-bold self-center pb-4 select-none shrink-0">
                                                =
                                            </span>

                                            {/* Результат */}
                                            <div className="flex flex-col items-center flex-1 max-w-[90px]">
                                                {(isCrafted || recipe.repairAmount !== undefined) ? (
                                                    resultObj && (
                                                        <>
                                                            <ItemIcon item={resultObj} spriteMap={spriteMap} size={48} />
                                                            <span className="text-[9px] text-emerald-400 font-bold text-center leading-snug mt-1 truncate w-full" title={resultObj.name}>
                                                                {resultObj.name}
                                                            </span>
                                                            {resultObj.maxDurability !== undefined && resultObj.maxDurability > 0 && (
                                                                <span className="text-[9px] text-emerald-400 font-bold">
                                                                    ({resultObj.durability !== undefined ? resultObj.durability : resultObj.maxDurability}/{resultObj.maxDurability})
                                                                </span>
                                                            )}
                                                        </>
                                                    )
                                                ) : (
                                                    <>
                                                        <div 
                                                            className="bg-black/40 rounded flex items-center justify-center border border-gray-700/50 shadow-inner text-xl font-bold text-cyan-400 select-none animate-pulse" 
                                                            style={{ width: 48, height: 48 }}
                                                        >
                                                            ?
                                                        </div>
                                                        <span className="text-[9px] text-gray-500 font-bold text-center leading-snug mt-1 truncate w-full">
                                                            ???
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex justify-end border-t border-gray-800/30 pt-1.5 mt-1">
                                            <button
                                                type="button"
                                                disabled={!isFillable}
                                                onClick={() => {
                                                    if (isFillable) {
                                                        handleFillRecipe(recipe);
                                                    }
                                                }}
                                                className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition-all outline-none focus:outline-none rounded border ${
                                                    isFillable 
                                                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-400/30 hover:bg-emerald-900/60 cursor-pointer shadow-sm' 
                                                        : 'bg-gray-900/40 text-gray-600 border-gray-800/80 cursor-not-allowed opacity-50'
                                                }`}
                                            >
                                                {strings.ui?.controls?.btn_add || 'ДОБАВИТЬ'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                ) : (
                    <div className="p-4 flex flex-col items-center bg-gray-800/95 shrink-0">
                    <div className="flex flex-col items-center w-full">
                        {/* Slots visual row aligning symbols precisely with squares */}
                        <div className="flex items-center justify-center gap-4 w-full">
                            
                            {/* Slot 1 square wrapper */}
                            <button 
                                id="crafting-slot-1"
                                data-default-focus="true"
                                onClick={() => slot1 ? handleSlotClick(1) : setActiveSelectorSlot(1)}
                                className={`transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer outline-none focus:outline-none relative shrink-0 ${repairInfo && repairInfo.materialSlotIndex === 1 && !repairInfo.canAfford ? 'opacity-40 brightness-50' : ''}`}
                            >
                                {slot1 ? (
                                    <ItemIcon item={slot1} spriteMap={spriteMap} size={64} />
                                ) : (
                                    <div className="w-[64px] h-[64px] rounded border border-gray-700/50 bg-black/40 hover:bg-black/60 flex items-center justify-center shadow-inner transition-colors relative">
                                        <Plus className="text-gray-600 w-5 h-5" />
                                    </div>
                                )}
                            </button>

                            {/* + symbol: enlarged & cleanly centered relative to slots */}
                            <span className="text-4xl text-gray-400 font-bold select-none flex items-center justify-center self-center h-[64px] w-6 pb-1">
                                +
                            </span>

                            {/* Slot 2 square wrapper */}
                            <button 
                                onClick={() => slot2 ? handleSlotClick(2) : setActiveSelectorSlot(2)}
                                className={`transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer outline-none focus:outline-none relative shrink-0 ${repairInfo && repairInfo.materialSlotIndex === 2 && !repairInfo.canAfford ? 'opacity-40 brightness-50' : ''}`}
                            >
                                {slot2 ? (
                                    <ItemIcon item={slot2} spriteMap={spriteMap} size={64} />
                                ) : (
                                    <div className="w-[64px] h-[64px] rounded border border-gray-700/50 bg-black/40 hover:bg-black/60 flex items-center justify-center shadow-inner transition-colors relative">
                                        <Plus className="text-gray-600 w-5 h-5" />
                                    </div>
                                )}
                            </button>

                            {/* = symbol: enlarged & cleanly centered relative to slots */}
                            <span className="text-4xl text-gray-400 font-bold select-none flex items-center justify-center self-center h-[64px] w-6 pb-1">
                                =
                            </span>

                            {/* Result Slot square wrapper */}
                            <div className={`transition-all shrink-0 ${resultItemPreview ? 'scale-[1.03] drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]' : ''}`}>
                                {slot1 && slot2 && !resultItemPreview ? (
                                    <div className="bg-black/40 rounded flex items-center justify-center border border-red-950/50 shadow-inner" style={{ width: 64, height: 64 }}>
                                        <X size={28} className="text-rose-600 opacity-90 select-none" />
                                    </div>
                                ) : (
                                    resultRecipe && !isRepairRecipe && !isResultRecipeCrafted ? (
                                        isRevealing ? (
                                            <div className="relative" style={{ width: 64, height: 64 }}>
                                                {/* Знак вопроса плавно тает */}
                                                <div 
                                                    className="absolute inset-0 bg-black/40 rounded flex items-center justify-center border border-gray-700/50 shadow-inner text-2xl font-bold text-cyan-400 select-none animate-pulse-fade-out"
                                                >
                                                    ?
                                                </div>
                                                {/* Иконка проступает из тумана */}
                                                <div className="absolute inset-0 flex items-center justify-center animate-reveal-item bg-black/20 rounded border border-gray-700/50">
                                                    <ItemIcon item={resultItemPreview as any} spriteMap={spriteMap} size={64} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div 
                                                className="bg-black/40 rounded flex items-center justify-center border border-gray-700/50 shadow-inner text-2xl font-bold text-cyan-400 select-none animate-pulse" 
                                                style={{ width: 64, height: 64 }}
                                            >
                                                ?
                                            </div>
                                        )
                                    ) : (
                                        <ItemIcon item={resultItemPreview as any} spriteMap={spriteMap} size={64} />
                                    )
                                )}
                            </div>

                        </div>

                        {/* Labels row situated cleanly below slots */}
                        <div className="flex justify-between items-start gap-4 w-full mt-3 px-1">
                            {/* Slot 1 label text column */}
                            <div className="text-[11px] text-gray-400 font-bold min-h-[50px] text-center leading-tight w-20 sm:w-24 flex flex-col items-center justify-start py-0.5">
                                {slot1 ? (
                                    <>
                                        <div className="line-clamp-2 break-words w-full text-gray-300 text-center" title={localize(slot1.name)}>{localize(slot1.name)}</div>
                                        {repairInfo && repairInfo.materialSlotIndex === 1 ? (
                                            <>
                                                <div className={`text-[10px] font-bold ${repairInfo.canAfford ? 'text-green-400' : 'text-rose-500'}`}>
                                                    x{repairInfo.reqQty} ({repairInfo.totalMaterialCount})
                                                </div>
                                                {!repairInfo.canAfford && (
                                                    <div className="text-[10px] text-rose-500 font-bold mt-1 text-center leading-tight">
                                                        {strings.ui?.controls?.msg_insufficient_materials || 'НЕДОСТАТОЧНО МАТЕРИАЛОВ'}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            slot1.maxDurability !== undefined && slot1.maxDurability > 0 ? (
                                                <div className="text-[10px] text-gray-500">
                                                    ({slot1.durability !== undefined ? slot1.durability : slot1.maxDurability}/{slot1.maxDurability})
                                                </div>
                                            ) : (
                                                slot1.count && slot1.count > 1 && (
                                                    <div className="text-[10px] text-gray-400 font-bold">
                                                        x{slot1.count}
                                                    </div>
                                                )
                                            )
                                        )}
                                    </>
                                ) : (
                                    <div className="text-gray-500 font-bold uppercase tracking-wider text-[10px] select-none">
                                        {strings.ui?.controls?.label_slot_1 || 'ЯЧЕЙКА 1'}
                                    </div>
                                )}
                            </div>

                            {/* Width spacer matched to "+" */}
                            <div className="w-6 shrink-0" />

                            {/* Slot 2 label text column */}
                            <div className="text-[11px] text-gray-400 font-bold min-h-[50px] text-center leading-tight w-20 sm:w-24 flex flex-col items-center justify-start py-0.5">
                                {slot2 ? (
                                    <>
                                        <div className="line-clamp-2 break-words w-full text-gray-300 text-center" title={localize(slot2.name)}>{localize(slot2.name)}</div>
                                        {repairInfo && repairInfo.materialSlotIndex === 2 ? (
                                            <>
                                                <div className={`text-[10px] font-bold ${repairInfo.canAfford ? 'text-green-400' : 'text-rose-500'}`}>
                                                    x{repairInfo.reqQty} ({repairInfo.totalMaterialCount})
                                                </div>
                                                {!repairInfo.canAfford && (
                                                    <div className="text-[10px] text-rose-500 font-bold mt-1 text-center leading-tight">
                                                        {strings.ui?.controls?.msg_insufficient_materials || 'НЕДОСТАТОЧНО МАТЕРИАЛОВ'}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            slot2.maxDurability !== undefined && slot2.maxDurability > 0 ? (
                                                <div className="text-[10px] text-gray-500">
                                                    ({slot2.durability !== undefined ? slot2.durability : slot2.maxDurability}/{slot2.maxDurability})
                                                </div>
                                            ) : (
                                                slot2.count && slot2.count > 1 && (
                                                    <div className="text-[10px] text-gray-400 font-bold">
                                                        x{slot2.count}
                                                    </div>
                                                )
                                            )
                                        )}
                                    </>
                                ) : (
                                    <div className="text-gray-500 font-bold uppercase tracking-wider text-[10px] select-none">
                                        {strings.ui?.controls?.label_slot_2 || 'ЯЧЕЙКА 2'}
                                    </div>
                                )}
                            </div>

                            {/* Width spacer matched to "=" */}
                            <div className="w-6 shrink-0" />

                            {/* Result Slot label text column */}
                            <div className="text-[11px] font-bold min-h-[50px] text-center leading-tight w-20 sm:w-24 flex flex-col items-center justify-start py-0.5">
                                {resultItemPreview ? (
                                    resultRecipe && !isRepairRecipe && !isResultRecipeCrafted ? (
                                        isRevealing ? (
                                            <div className="text-emerald-400 font-bold text-center animate-fade-in-text">
                                                {localize(resultItemPreview.name)}
                                            </div>
                                        ) : (
                                            <div className="text-gray-500 font-bold text-center">???</div>
                                        )
                                    ) : (
                                        <>
                                            <div className="text-gray-200 line-clamp-2 break-words w-full text-center" title={localize(resultItemPreview.name)}>{localize(resultItemPreview.name)}</div>
                                            {resultItemPreview.maxDurability !== undefined && resultItemPreview.maxDurability > 0 && (
                                                <div className="text-[10px] text-emerald-400 font-bold">
                                                    ({resultItemPreview.durability !== undefined ? resultItemPreview.durability : resultItemPreview.maxDurability}/{resultItemPreview.maxDurability})
                                                </div>
                                            )}
                                        </>
                                    )
                                ) : (
                                    <div className="text-gray-500 font-bold uppercase tracking-wider text-[10px] select-none">
                                        {strings.ui?.controls?.label_result || 'РЕЗУЛЬТАТ'}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Crafting Actions block */}
                    <div className="flex w-full gap-2 mt-4">
                        {/* Reset slots button: fully integrated with general game button design, absolutely no white outline/border */}
                        <button 
                            onClick={() => { setSlot1(null); setSlot2(null); }}
                            disabled={!slot1 && !slot2}
                            title={strings.ui?.controls?.btn_reset_slots || "Сбросить слоты"}
                            className={`relative flex-[0.25] py-2 text-sm rounded font-bold transition-all flex items-center justify-center outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ring-0 border ${
                                slot1 || slot2 
                                    ? 'bg-gray-700/60 border-gray-600/70 hover:bg-gray-650 hover:border-gray-500 text-gray-300 active:bg-gray-600/80 cursor-pointer' 
                                    : 'bg-gray-800/20 border-gray-750/30 text-gray-600 cursor-not-allowed opacity-50'
                            }`}
                        >
                            {isGamepadActive && (
                                <div className="absolute -top-1.5 -right-1.5 scale-75 origin-top-right">
                                    <XboxButton label="Y" />
                                </div>
                            )}
                            <RotateCcw size={16} />
                        </button>
                        
                        {/* Craft button */}
                        <button 
                            onClick={handleCraft}
                            disabled={!resultRecipe || isAlreadyFullyRepaired || (isRepairRecipe && repairInfo && !repairInfo.canAfford)}
                            className={`relative flex-1 py-1.5 px-3 text-xs rounded font-bold tracking-widest uppercase transition-all outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${
                                resultRecipe && !isAlreadyFullyRepaired && (!isRepairRecipe || (repairInfo && repairInfo.canAfford))
                                    ? 'bg-green-900/40 hover:bg-green-850 border-green-800/50 border text-green-200 cursor-pointer' 
                                    : 'bg-gray-750/40 text-gray-500 border-gray-700 border cursor-not-allowed'
                            }`}
                        >
                            {isGamepadActive && (
                                <div className="absolute -top-1.5 -right-1.5 scale-75 origin-top-right">
                                    <XboxButton label="X" />
                                </div>
                            )}
                            {buttonLabel}
                        </button>
                    </div>
                </div>
                )}
            </div>
            <ToastContainer toasts={toasts} variant="fixed-bottom" isAbsolute={true} />
            <style>{`
                @keyframes pulse-fade-out {
                  0% { opacity: 1; transform: scale(1); }
                  100% { opacity: 0; transform: scale(0.6); }
                }
                @keyframes reveal-item {
                  0% { opacity: 0; transform: scale(0.3) rotate(-20deg); filter: brightness(3); }
                  50% { opacity: 0.5; transform: scale(1.1) rotate(10deg); filter: brightness(1.8); }
                  100% { opacity: 1; transform: scale(1) rotate(0deg); filter: brightness(1); }
                }
                @keyframes fade-in-text {
                  0% { opacity: 0; transform: translateY(4px); }
                  100% { opacity: 1; transform: translateY(0); }
                }
                .animate-pulse-fade-out {
                  animation: pulse-fade-out 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-reveal-item {
                  animation: reveal-item 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-fade-in-text {
                  animation: fade-in-text 1.5s cubic-bezier(0.1, 1, 0.1, 1) forwards;
                }
            `}</style>
        </div>
    );
};

export default CraftingModal;
