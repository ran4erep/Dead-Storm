import React from 'react';
import { createPortal } from 'react-dom';
import { X, Briefcase, Package, Plus, Minus, ShoppingCart } from 'lucide-react';
import { BulletIcon } from './CombatOverlay';
import { useViewportScale } from '../hooks/useViewportScale';
import { XboxButton } from './SettingsModal';
import itemsDb from '../data/items.json';
import npcsDb from '../data/npcs.json';

interface TradeModalProps {
  onClose: () => void;
  spriteMap: Map<string, HTMLImageElement>;
  localize: (text: string) => string;
  npcId?: string | null;
  inventoryStats?: { currentLoad: number; maxCapacity: number };
  player?: any;
  setPlayer?: React.Dispatch<React.SetStateAction<any>>;
  addLog?: (text: string, type?: any) => void;
  playSound?: (sound: string) => void;
  topOffset?: number;
  checkTriggers?: ((type: string, params: any) => void) | null;
}

const HoldableButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, className, children }) => {
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const clickRef = React.useRef(onClick);
  const isTouchRef = React.useRef(false);
  const wasTriggeredByPointerRef = React.useRef(false);

  React.useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  const stop = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const start = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    wasTriggeredByPointerRef.current = true;
    setTimeout(() => {
      wasTriggeredByPointerRef.current = false;
    }, 150);

    clickRef.current();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        if (!disabled) {
          clickRef.current();
        }
      }, 75);
    }, 400);
  }, [disabled]);

  React.useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  React.useEffect(() => stop, [stop]);

  return (
    <button
      data-holdable="true"
      aria-disabled={disabled}
      className={className}
      onMouseDown={(e) => {
        if (isTouchRef.current || disabled) return;
        start(e);
      }}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        isTouchRef.current = true;
        if (disabled) return;
        start(e);
      }}
      onTouchEnd={stop}
      onTouchCancel={stop}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (!wasTriggeredByPointerRef.current) {
          clickRef.current();
        }
      }}
    >
      {children}
    </button>
  );
};

const TradeModal: React.FC<TradeModalProps> = ({ onClose, spriteMap, localize, npcId, inventoryStats, player, setPlayer, addLog, playSound, topOffset = 92, checkTriggers }) => {
  const scale = useViewportScale();
  const [viewportRect, setViewportRect] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isLandscape, setIsLandscape] = React.useState(false);

  React.useEffect(() => {
    const updateDimensions = () => {
      const landscape = window.innerWidth > window.innerHeight;
      setIsLandscape(landscape);

      const el = document.getElementById('viewport-touch-layer');
      if (el) {
        const rect = el.getBoundingClientRect();
        setViewportRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
      }
    };

    updateDimensions();

    window.addEventListener('resize', updateDimensions);
    const t = setTimeout(updateDimensions, 100);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(t);
    };
  }, []);

  const safeTopOffset = Math.max(0, topOffset);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${safeTopOffset}px`,
    left: 0,
    width: '100vw',
    height: `calc(100vh - ${safeTopOffset}px)`,
    zIndex: 350,
  };

  const cardStyle: React.CSSProperties = isLandscape ? {
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
    width: `${100 / scale}%`,
    height: `${100 / scale}%`,
  } : {};

  const [activeTab, setActiveTab] = React.useState<'buy' | 'sell'>('buy');
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  const handleTabSwitch = (tab: 'buy' | 'sell') => {
    if (playSound) playSound('SYS_CLICK');
    setActiveTab(tab);
    setQuantities({});
  };

  const handleClose = () => {
    if (playSound) playSound('SYS_CLICK');
    onClose();
    // Automatically advance dialogue when closing the trade modal
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  };

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  React.useEffect(() => {
    const handleGamepadTabSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: 'buy' | 'sell' }>;
      if (customEvent.detail && customEvent.detail.tab) {
        if (playSound) playSound('SYS_CLICK');
        setActiveTab(customEvent.detail.tab);
        setQuantities({});
      }
    };
    window.addEventListener('gamepad-trade-tab-switch', handleGamepadTabSwitch);
    return () => window.removeEventListener('gamepad-trade-tab-switch', handleGamepadTabSwitch);
  }, [playSound]);

  const [isGamepadActive, setIsGamepadActive] = React.useState(() => {
    return typeof document !== 'undefined' ? document.body.classList.contains('gamepad-navigation-active') : false;
  });

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsGamepadActive(document.body.classList.contains('gamepad-navigation-active'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Get trade items for the specific NPC, or fallback to empty array
  const npcDef = npcId ? (npcsDb as any)[npcId] : null;
  const tradeItemsConfig = npcDef?.tradeItems || [];

  const getRemainingStock = (itemId: string, config: any) => {
    const configCount = config.count !== undefined ? config.count : (config.stock !== undefined ? config.stock : config.quantity);
    if (configCount === undefined || configCount <= 0) return Infinity;
    const boughtMap = player?.merchantBoughtStock?.[npcId || ''] || {};
    const bought = boughtMap[itemId] || 0;
    return Math.max(0, configCount - bought);
  };

  const isFull = inventoryStats ? inventoryStats.currentLoad >= inventoryStats.maxCapacity : false;

  const playerCash = player?.inventory?.find((i: any) => i.type === 'CASH')?.count || 0;

  const handleQuantityChange = (id: string, delta: number, max?: number) => {
    const currentQty = quantities[id] || 0;
    let nextQty = Math.max(0, currentQty + delta);
    if (max !== undefined) {
      nextQty = Math.min(nextQty, max);
    }
    if (nextQty !== currentQty && playSound) {
      playSound('SYS_CLICK');
    }

    setQuantities(prev => {
      const current = prev[id] || 0;
      let next = Math.max(0, current + delta);
      if (max !== undefined) {
        next = Math.min(next, max);
      }
      if (next === current) return prev;
      return { ...prev, [id]: next };
    });
  };

  const getAmmoPackSize = (item: any) => {
    const baseDef = Object.values(itemsDb).find((db: any) => db.name === item.rawName || db.name === item.name) as any;
    return baseDef?.count || 30;
  };

  const getSellPrice = (item: any) => {
    if (item.type === 'CASH') return 0;
    const baseDef = Object.values(itemsDb).find((db: any) => db.name === item.rawName) as any;
    return item.price ?? baseDef?.price ?? 0;
  };

  const isItemEquipped = (item: any) => {
    if (!player?.equipment) return false;
    return Object.values(player.equipment).some((eq: any) => eq && eq.id === item.id);
  };

  const sellableItems = player?.inventory?.filter((item: any) => getSellPrice(item) > 0 && !isItemEquipped(item)) || [];

  const totalCost = activeTab === 'buy' ? tradeItemsConfig.reduce((sum: number, config: any) => {
    const itemDef = (itemsDb as any)[config.id];
    const packSize = itemDef?.type === 'AMMO' ? (itemDef.count || 1) : 1;
    const itemPrice = config.price * packSize;
    return sum + (quantities[config.id] || 0) * itemPrice;
  }, 0) : 0;

  const totalSellValue = activeTab === 'sell' ? sellableItems.reduce((sum: number, item: any) => {
    const qty = quantities[item.id] || 0;
    if (item.type === 'AMMO') {
      const packSize = getAmmoPackSize(item);
      const packPrice = packSize * getSellPrice(item);
      return sum + qty * packPrice;
    }
    return sum + qty * getSellPrice(item);
  }, 0) : 0;

  const totalSlotsNeeded = activeTab === 'buy' ? tradeItemsConfig.reduce((sum: number, config: any) => {
    const itemDef = (itemsDb as any)[config.id];
    const slots = itemDef?.weight !== undefined ? itemDef.weight : 1;
    return sum + (quantities[config.id] || 0) * slots;
  }, 0) : 0;

  const canAfford = playerCash >= totalCost;
  const hasSpace = inventoryStats ? (inventoryStats.currentLoad + totalSlotsNeeded <= inventoryStats.maxCapacity) : true;

  const handleTrade = () => {
    if (playSound) playSound('SYS_CLICK');
    
    if (activeTab === 'buy' && totalCost === 0) return;
    if (activeTab === 'sell' && totalSellValue === 0) return;
    
    const npcDef = npcId ? (npcsDb as any)[npcId] : null;
    const responses = npcDef?.tradeResponses || {};

    if (activeTab === 'buy' && !canAfford) {
      if (addLog) addLog(localize("Не хватает денег/Not enough money"), 'DANGER');
      if (playSound) playSound('SYS_ERROR_BUMP');
      if (responses.no_money) {
        window.dispatchEvent(new CustomEvent('play-trade-response', { detail: { text: responses.no_money } }));
      }
      return;
    }

    if (activeTab === 'buy' && !hasSpace) {
      if (addLog) addLog(localize("Не хватает места в инвентаре/Not enough inventory space"), 'DANGER');
      if (playSound) playSound('SYS_ERROR_BUMP');
      if (responses.no_space) {
        window.dispatchEvent(new CustomEvent('play-trade-response', { detail: { text: responses.no_space } }));
      }
      return;
    }

    if (setPlayer && player) {
      setPlayer((prev: any) => {
        let newInventory = [...prev.inventory];
        
        if (activeTab === 'sell') {
           // Add cash
           if (totalSellValue > 0) {
               const cashIndex = newInventory.findIndex(i => i.type === 'CASH');
               if (cashIndex !== -1) {
                   newInventory[cashIndex] = {
                       ...newInventory[cashIndex],
                       count: (newInventory[cashIndex].count || 0) + totalSellValue
                   };
               } else {
                   const cashDef = (itemsDb as any)['cash'];
                   newInventory.push({
                       ...cashDef,
                       id: `cash_${Math.random().toString(36).substr(2, 9)}`,
                       rawName: cashDef?.name || 'Cash',
                       rawDescription: cashDef?.description || "Деньги./Money.",
                       name: localize(cashDef?.name || "Деньги/Cash"),
                       description: localize(cashDef?.description || "Деньги./Money."),
                       count: totalSellValue,
                       type: 'CASH'
                   });
               }
           }

           // Remove items
           sellableItems.forEach((item: any) => {
               const qty = quantities[item.id] || 0;
               if (qty > 0) {
                   const idx = newInventory.findIndex(i => i.id === item.id);
                   if (idx !== -1) {
                       const currentCount = newInventory[idx].count || 1;
                       if (item.type === 'AMMO') {
                           const packSize = getAmmoPackSize(item);
                           const roundsToRemove = qty * packSize;
                           if (currentCount <= roundsToRemove) {
                               newInventory.splice(idx, 1);
                           } else {
                               newInventory[idx] = {
                                   ...newInventory[idx],
                                   count: currentCount - roundsToRemove
                               };
                           }
                       } else {
                           if (currentCount <= qty) {
                               newInventory.splice(idx, 1);
                           } else {
                               newInventory[idx] = {
                                   ...newInventory[idx],
                                   count: currentCount - qty
                               };
                           }
                       }
                   }
               }
           });

           if (addLog) addLog(localize("Продажа успешна/Sale successful"), 'SUCCESS');
           if (playSound) playSound('SYS_TRANSACTION');
        } else {
           // Deduct cash for buy
           const cashIndex = newInventory.findIndex(i => i.type === 'CASH');
           if (cashIndex !== -1) {
             newInventory[cashIndex] = {
               ...newInventory[cashIndex],
               count: newInventory[cashIndex].count - totalCost
             };
             if (newInventory[cashIndex].count <= 0) {
               newInventory.splice(cashIndex, 1);
             }
           }

           // Track purchased items for script trigger
           const purchasedItems: { id: string; type: string; keyId?: string; definitionId: string }[] = [];

           // Add items
           tradeItemsConfig.forEach((config: any) => {
             const qty = quantities[config.id] || 0;
             if (qty > 0) {
               const itemDef = (itemsDb as any)[config.id];
               if (itemDef) {
                 for (let i = 0; i < qty; i++) {
                   const generatedId = `${config.id}_${Math.random().toString(36).substr(2, 9)}`;
                   purchasedItems.push({
                     id: generatedId,
                     type: itemDef.type,
                     keyId: itemDef.keyId,
                     definitionId: config.id
                   });

                   if (itemDef.type === 'AMMO') {
                     const existingStackIndex = newInventory.findIndex(invItem => 
                       invItem.rawName === itemDef.name && 
                       (invItem.count || 1) < (invItem.maxStack || 999)
                     );

                     if (existingStackIndex !== -1) {
                       const existingItem = newInventory[existingStackIndex];
                       const currentCount = existingItem.count || 1;
                       const maxStack = existingItem.maxStack || 999;
                       const spaceLeft = maxStack - currentCount;
                       const amountToAdd = itemDef.count || 1;

                       if (amountToAdd <= spaceLeft) {
                         newInventory[existingStackIndex] = {
                           ...existingItem,
                           count: currentCount + amountToAdd
                         };
                       } else {
                         newInventory[existingStackIndex] = {
                           ...existingItem,
                           count: maxStack
                         };
                         const remainder = amountToAdd - spaceLeft;
                         newInventory.push({
                           ...itemDef,
                           id: generatedId,
                           rawName: itemDef.name,
                           rawDescription: itemDef.description,
                           handAssetId: itemDef.handAsset,
                           handFemaleAssetId: itemDef.handFemaleAsset,
                           attackAssetId: itemDef.attackAsset,
                           attackFemaleAssetId: itemDef.attackAssetFemale,
                           maskAssetId: itemDef.maskAsset,
                           name: localize(itemDef.name),
                           description: localize(itemDef.description),
                           ...(itemDef.maxDurability ? { durability: itemDef.maxDurability } : {}),
                           count: remainder
                         });
                       }
                     } else {
                       newInventory.push({
                         ...itemDef,
                         id: generatedId,
                         rawName: itemDef.name,
                         rawDescription: itemDef.description,
                         handAssetId: itemDef.handAsset,
                         handFemaleAssetId: itemDef.handFemaleAsset,
                         attackAssetId: itemDef.attackAsset,
                         attackFemaleAssetId: itemDef.attackAssetFemale,
                         maskAssetId: itemDef.maskAsset,
                         name: localize(itemDef.name),
                         description: localize(itemDef.description),
                         ...(itemDef.maxDurability ? { durability: itemDef.maxDurability } : {})
                       });
                     }
                   } else {
                     newInventory.push({
                       ...itemDef,
                       id: generatedId,
                       rawName: itemDef.name,
                       rawDescription: itemDef.description,
                       handAssetId: itemDef.handAsset,
                       handFemaleAssetId: itemDef.handFemaleAsset,
                       attackAssetId: itemDef.attackAsset,
                       attackFemaleAssetId: itemDef.attackAssetFemale,
                       maskAssetId: itemDef.maskAsset,
                       name: localize(itemDef.name),
                       description: localize(itemDef.description),
                       ...(itemDef.maxDurability ? { durability: itemDef.maxDurability } : {})
                     });
                   }
                 }
               }
             }
           });
           if (addLog) addLog(localize("Покупка успешна/Purchase successful"), 'SUCCESS');
           if (playSound) playSound('SYS_TRANSACTION');

           // Fire ON_ITEM_PICKUP trigger for each purchased item
           if (checkTriggers && player) {
             purchasedItems.forEach(item => {
               checkTriggers('ON_ITEM_PICKUP', {
                 itemId: item.id,
                 itemType: item.type,
                 keyId: item.keyId,
                 itemDefinitionId: item.definitionId,
                 x: player.pos ? Math.round(player.pos.x) : 0,
                 y: player.pos ? Math.round(player.pos.y) : 0
               });
             });
           }
        }
        
        const newMerchantBoughtStock = { ...(prev.merchantBoughtStock || {}) };
        if (activeTab === 'buy' && npcId) {
          const npcStore = { ...(newMerchantBoughtStock[npcId] || {}) };
          tradeItemsConfig.forEach((config: any) => {
            const qty = quantities[config.id] || 0;
            if (qty > 0) {
              npcStore[config.id] = (npcStore[config.id] || 0) + qty;
            }
          });
          newMerchantBoughtStock[npcId] = npcStore;
        }
        return { ...prev, inventory: newInventory, merchantBoughtStock: newMerchantBoughtStock };
      });

      if (activeTab === 'sell' && responses.sell_success) {
        window.dispatchEvent(new CustomEvent('play-trade-response', { detail: { text: responses.sell_success } }));
      } else if (responses.success) {
        window.dispatchEvent(new CustomEvent('play-trade-response', { detail: { text: responses.success } }));
      }
      setQuantities({});
    }
  };

  const handleTradeRef = React.useRef(handleTrade);
  React.useEffect(() => {
    handleTradeRef.current = handleTrade;
  }, [handleTrade]);

  const canExecuteTradeRef = React.useRef(false);
  canExecuteTradeRef.current = activeTab === 'buy' 
    ? (totalCost > 0) 
    : (totalSellValue > 0);

  React.useEffect(() => {
    const handleXPress = () => {
      if (canExecuteTradeRef.current) {
        handleTradeRef.current();
      }
    };
    window.addEventListener('gamepad-trade-x-press', handleXPress);
    return () => window.removeEventListener('gamepad-trade-x-press', handleXPress);
  }, []);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div 
        className="bg-transparent flex flex-col items-center justify-center p-3 font-['Jura'] pointer-events-auto transition-all duration-300"
        style={overlayStyle}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
    >
      <div 
        id="trade-modal-container"
        className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-yellow-400" />
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">{localize("Торговля/Trade")}</h2>
          </div>
          <div className="flex items-center gap-4">
            {inventoryStats && (
              <div className={`text-xs font-['Jura'] font-bold flex items-center gap-1 ${isFull ? 'text-red-500' : 'text-gray-400'}`}>
                <Package size={14} />
                <span className="uppercase text-[9px] tracking-tight mr-1 text-gray-500">{localize("Место/Space")}:</span>
                <span>{inventoryStats.currentLoad}/{inventoryStats.maxCapacity}</span>
              </div>
            )}
            <button onClick={handleClose} className="text-gray-400 active:text-white transition-colors flex items-center gap-1 touch-manipulation gamepad-hide-buttons">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex bg-gray-900 border-b border-gray-700 shrink-0 no-gamepad-nav">
          <button
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'buy' 
                ? 'text-yellow-400 border-b-2 border-yellow-400 bg-gray-800' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => handleTabSwitch('buy')}
          >
            {localize("Покупка/Buy")}
          </button>
          <button
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'sell' 
                ? 'text-yellow-400 border-b-2 border-yellow-400 bg-gray-800' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => handleTabSwitch('sell')}
          >
            {localize("Продажа/Sell")}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-800/95 relative min-h-0">
          {activeTab === 'buy' ? (
            tradeItemsConfig.length > 0 ? (
              tradeItemsConfig.map((config: any, index: number) => {
                const itemDef = (itemsDb as any)[config.id];
                if (!itemDef) return null;
                
                const img = spriteMap.get(itemDef.assetId);
                const name = localize(itemDef.name);
                const desc = localize(itemDef.description);
                
                const maxStock = getRemainingStock(config.id, config);
                const isInfinite = maxStock === Infinity;
                const isSoldOut = maxStock === 0;
                const stockLabel = isSoldOut
                  ? localize("Распродано/Sold out")
                  : isInfinite 
                    ? localize("В наличии: ∞/In stock: ∞") 
                    : `${localize("В наличии: /In stock: ")}${maxStock}`;
                
                return (
                  <div key={`${config.id}_${index}`} className={`flex items-center p-1.5 bg-gray-900/80  rounded border border-gray-700 transition-all ${isSoldOut ? 'opacity-50' : ''}`}>
                    <div className="p-0.5 bg-black/40 rounded mr-1.5 border border-gray-700/50 w-10 h-10 flex items-center justify-center shrink-0 relative">
                      {img ? (
                        <img 
                          src={img.src} 
                          crossOrigin="anonymous"
                          alt={name} 
                          className="w-8 h-8 object-contain drop-shadow-md" 
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-700 rounded" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-gray-200 text-xs uppercase truncate">{name}</h3>
                        {itemDef.count && (
                          <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            {itemDef.type === 'AMMO' ? (
                              <BulletIcon size={7} />
                            ) : itemDef.type === 'MATERIAL' ? (
                              null
                            ) : (
                              <span className="text-[8px] leading-none">x</span>
                            )}
                            <span>{itemDef.count}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-400 leading-tight truncate">{desc}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[8px] tracking-wider uppercase font-bold ${isSoldOut ? 'text-red-400' : 'text-yellow-500 opacity-90'}`}>
                          {stockLabel}
                        </span>
                        <span className="text-[8px] text-gray-500 font-bold">•</span>
                        <span className="text-[8px] text-yellow-500 opacity-90 font-bold uppercase tracking-wider">
                          {localize("ВЕС/WEIGHT")}: {itemDef.weight !== undefined ? itemDef.weight : 1}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-3 pl-1.5 shrink-0">
                      <div className="text-green-400 font-bold text-sm flex items-center gap-0.5">
                        <span className="text-[12px]">$</span>{config.price * (itemDef.type === 'AMMO' ? (itemDef.count || 1) : 1)}
                      </div>
                      <div className="flex items-center bg-gray-900 rounded border border-gray-700">
                        <HoldableButton 
                          onClick={() => handleQuantityChange(config.id, -1)}
                          className="px-3 py-2 text-gray-400 hover:text-white active:bg-gray-800 rounded-l transition-colors flex items-center justify-center select-none touch-manipulation"
                        >
                          <Minus size={16} />
                        </HoldableButton>
                        <span className="text-sm font-bold w-6 text-center text-gray-200">
                          {quantities[config.id] || 0}
                        </span>
                        <HoldableButton 
                          onClick={() => handleQuantityChange(config.id, 1, maxStock)}
                          disabled={(quantities[config.id] || 0) >= maxStock}
                          className={`px-3 py-2 rounded-r transition-colors flex items-center justify-center select-none touch-manipulation ${(quantities[config.id] || 0) >= maxStock ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white active:bg-gray-800'}`}
                        >
                          <Plus size={16} />
                        </HoldableButton>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm uppercase tracking-wider">
                {localize("Нет товаров/No items")}
              </div>
            )
          ) : (
            sellableItems.length > 0 ? (
              sellableItems.map((item: any, idx: number) => {
                const img = spriteMap.get(item.assetId);
                const name = localize(item.name || item.rawName);
                const desc = localize(item.description || item.rawDescription || "");
                const isAmmo = item.type === 'AMMO';
                const packSize = isAmmo ? getAmmoPackSize(item) : 1;
                const maxQty = isAmmo ? Math.floor((item.count || 0) / packSize) : (item.count || 1);
                const sellPrice = isAmmo ? packSize * getSellPrice(item) : getSellPrice(item);
                const currentQty = quantities[item.id] || 0;
                
                return (
                  <div key={`${item.id}_${idx}`} className="flex items-center p-1.5 bg-gray-900/80 rounded border border-gray-700 transition-all">
                    <div className="p-0.5 bg-black/40 rounded mr-1.5 border border-gray-700/50 w-10 h-10 flex items-center justify-center shrink-0 relative">
                      {img ? (
                        <img 
                          src={img.src} 
                          crossOrigin="anonymous"
                          alt={name} 
                          className="w-8 h-8 object-contain drop-shadow-md" 
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-700 rounded" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-gray-200 text-xs uppercase truncate">{name}</h3>
                        {isAmmo ? (
                          <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            <BulletIcon size={7} />
                            <span>{packSize}</span>
                          </div>
                        ) : item.count && (
                          <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            {item.type !== 'MATERIAL' && <span className="text-[8px] leading-none">x</span>}
                            <span>{item.count}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-400 leading-tight truncate">{desc}</p>
                      {isAmmo && (
                        <div className="text-[8px] font-bold text-gray-500 uppercase mt-0.5">
                          {localize("В наличии: /In stock: ")} {maxQty} {localize("пач./pks")}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row items-center gap-3 pl-1.5 shrink-0">
                      <div className="text-green-400 font-bold text-sm flex items-center gap-0.5">
                        <span className="text-[12px]">$</span>{sellPrice}
                      </div>
                      <div className="flex items-center bg-gray-900 rounded border border-gray-700">
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, -1)}
                          className="px-3 py-2 text-gray-400 hover:text-white active:bg-gray-800 rounded-l transition-colors flex items-center justify-center select-none touch-manipulation"
                        >
                          <Minus size={16} />
                        </HoldableButton>
                        <span className="text-sm font-bold w-6 text-center text-gray-200">
                          {currentQty}
                        </span>
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, 1, maxQty)}
                          disabled={currentQty >= maxQty}
                          className={`px-3 py-2 rounded-r transition-colors flex items-center justify-center select-none touch-manipulation ${currentQty >= maxQty ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white active:bg-gray-800'}`}
                        >
                          <Plus size={16} />
                        </HoldableButton>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm uppercase tracking-wider">
                {localize("Нет предметов для продажи/No items to sell")}
              </div>
            )
          )}
        </div>

        {activeTab === 'buy' && (
          <div className="p-3 border-t border-gray-700 bg-gray-900 shrink-0 flex justify-between items-center">
            <div className="flex flex-col">
              <div className="text-xs text-gray-400 uppercase tracking-wider">{localize("Ваши деньги/Your money")}: <span className="text-green-400 font-bold">${playerCash}</span></div>
              <div className="text-sm text-gray-200 uppercase tracking-wider font-bold">{localize("Итого/Total")}: <span className={canAfford ? "text-green-400" : "text-red-400"}>${totalCost}</span></div>
            </div>
            <button 
              onClick={handleTrade}
              disabled={totalCost === 0}
              className={`relative px-4 py-2 rounded font-bold uppercase tracking-wider flex items-center gap-2 transition-colors active:scale-95 ${
                totalCost > 0
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-900/20' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGamepadActive && (
                <div className="absolute -top-1.5 -right-1.5 scale-75 origin-top-right">
                  <XboxButton label="X" />
                </div>
              )}
              <ShoppingCart size={16} />
              {localize("Купить/Buy")}
            </button>
          </div>
        )}
        {activeTab === 'sell' && (
          <div className="p-3 border-t border-gray-700 bg-gray-900 shrink-0 flex justify-between items-center">
            <div className="flex flex-col">
              <div className="text-xs text-gray-400 uppercase tracking-wider">{localize("Ваши деньги/Your money")}: <span className="text-green-400 font-bold">${playerCash}</span></div>
              <div className="text-sm text-gray-200 uppercase tracking-wider font-bold">{localize("Выручка/Revenue")}: <span className="text-green-400">${totalSellValue}</span></div>
            </div>
            <button 
              onClick={handleTrade}
              disabled={totalSellValue === 0}
              className={`relative px-4 py-2 rounded font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
                totalSellValue > 0
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGamepadActive && (
                <div className="absolute -top-1.5 -right-1.5 scale-75 origin-top-right">
                  <XboxButton label="X" />
                </div>
              )}
              <ShoppingCart size={16} />
              {localize("Продать/Sell")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TradeModal;
