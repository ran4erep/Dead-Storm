import React from 'react';
import { createPortal } from 'react-dom';
import { X, Archive, Package, Plus, Minus, Coins } from 'lucide-react';
import { BulletIcon } from './CombatOverlay';
import { useViewportScale } from '../hooks/useViewportScale';
import { XboxButton } from './SettingsModal';
import npcsDb from '../data/npcs.json';
import itemsDb from '../data/items.json';

interface KeepModalProps {
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

const KeepModal: React.FC<KeepModalProps> = ({ 
  onClose, spriteMap, localize, npcId, inventoryStats, player, setPlayer, addLog, playSound, topOffset = 92 
}) => {
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

  // Tabs: 'retrieve' (items currently in storage) or 'deposit' (items player can store)
  const [activeTab, setActiveTab] = React.useState<'retrieve' | 'deposit'>('retrieve');
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  const npcDef = npcId ? (npcsDb as any)[npcId] : null;
  // Get storage price per item, defaulting to 5
  const keepPrice = npcDef?.keepPrice !== undefined ? npcDef.keepPrice : 5;

  const handleTabSwitch = (tab: 'retrieve' | 'deposit') => {
    if (playSound) playSound('SYS_CLICK');
    setActiveTab(tab);
    setQuantities({});
  };

  const handleClose = () => {
    if (playSound) playSound('SYS_CLICK');
    onClose();
    // Advance dialogue space key
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
      const customEvent = e as CustomEvent<{ tab: 'retrieve' | 'deposit' }>;
      if (customEvent.detail && customEvent.detail.tab) {
        if (playSound) playSound('SYS_CLICK');
        setActiveTab(customEvent.detail.tab);
        setQuantities({});
      }
    };
    window.addEventListener('gamepad-keep-tab-switch', handleGamepadTabSwitch);
    return () => window.removeEventListener('gamepad-keep-tab-switch', handleGamepadTabSwitch);
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

  // Helper: check if item is equipped
  const isItemEquipped = (item: any) => {
    if (!player?.equipment) return false;
    return Object.values(player.equipment).some((eq: any) => eq && eq.id === item.id);
  };

  const getAmmoPackSize = (item: any) => {
    const baseDef = Object.values(itemsDb).find((db: any) => db.name === item.rawName || db.name === item.name) as any;
    return baseDef?.count || 30;
  };

  // List of player items that can be deposited in storage (includes Cash, excludes equipped items)
  const depositLimitItems = player?.inventory?.filter((item: any) => !isItemEquipped(item)) || [];

  // List of items stored globally (not tied to specific NPC)
  const keptItems = Array.isArray(player?.keptItems) ? player.keptItems : [];

  // Quantities handling
  const handleQuantityChange = (itemId: string, delta: number, max: number) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      let next = Math.max(0, current + delta);
      next = Math.min(next, max);
      if (next === current) return prev;
      if (playSound) playSound('SYS_CLICK');
      return { ...prev, [itemId]: next };
    });
  };

  // Helper to get selected packs or individual items count
  const getSelectedPacksOrItemsCount = React.useCallback((itemId: string, qty: number) => {
    if (qty <= 0) return 0;
    const item = activeTab === 'deposit' 
      ? depositLimitItems.find((i: any) => i.id === itemId)
      : keptItems.find((i: any) => i.id === itemId);
    if (!item) return 0;
    if (item.type === 'CASH') {
      return 1; // 1 stack of Cash is considered 1 item for fee
    }
    return qty; // Since AMMO is now selected as 0 or 1 pack, qty is exactly correct!
  }, [activeTab, depositLimitItems, keptItems]);

  // Calculate totals
  const totalItemsCount = React.useMemo(() => {
    return Object.entries(quantities).reduce((sum: number, [itemId, val]) => {
      const qty = val as number;
      return sum + getSelectedPacksOrItemsCount(itemId, qty);
    }, 0);
  }, [quantities, getSelectedPacksOrItemsCount]);

  const totalCost = activeTab === 'deposit' ? totalItemsCount * keepPrice : 0;

  // Space limit check when retrieving items
  const totalSlotsNeededOnRetrieve = activeTab === 'retrieve' ? Object.entries(quantities).reduce((sum: number, [itemId, val]) => {
    const item = keptItems.find((i: any) => i.id === itemId);
    const qty = val as number;
    if (!item || qty <= 0) return sum;
    if (item.type === 'CASH') return sum; // Cash doesn't take slots in load
    const slots = item.weight !== undefined ? item.weight : 1;
    return sum + qty * slots;
  }, 0) : 0;

  const hasSpaceToRetrieve = inventoryStats 
    ? (inventoryStats.currentLoad + totalSlotsNeededOnRetrieve <= inventoryStats.maxCapacity) 
    : true;

  const playerCash = player?.inventory?.find((i: any) => i.type === 'CASH')?.count || 0;

  const totalCashDepositAmount = React.useMemo(() => {
    const cashItem = player?.inventory?.find((i: any) => i.type === 'CASH');
    if (!cashItem) return 0;
    return quantities[cashItem.id] || 0;
  }, [player, quantities]);

  const canAfford = playerCash >= (totalCost + totalCashDepositAmount);

  // Add items with merging logic
  const addItemToArrayWithMerging = (arr: any[], itemToMove: any, qty: number) => {
    const result = [...arr];
    if (itemToMove.type === 'CASH') {
      const existingCashIdx = result.findIndex(i => i.type === 'CASH');
      if (existingCashIdx !== -1) {
        result[existingCashIdx] = {
          ...result[existingCashIdx],
          count: (result[existingCashIdx].count || 0) + qty
        };
      } else {
        result.push({
          ...itemToMove,
          id: `cash_${Math.random().toString(36).substr(2, 9)}`,
          count: qty
        });
      }
    } else if (itemToMove.type === 'AMMO') {
      let remaining = qty;
      for (let i = 0; i < result.length && remaining > 0; i++) {
        const currentItem = result[i];
        if (currentItem.rawName === itemToMove.rawName && currentItem.type === 'AMMO') {
          const currentCount = currentItem.count || 1;
          const maxStack = currentItem.maxStack || 999;
          const spaceLeft = maxStack - currentCount;
          if (spaceLeft > 0) {
            const amountToFill = Math.min(spaceLeft, remaining);
            result[i] = {
              ...currentItem,
              count: currentCount + amountToFill
            };
            remaining -= amountToFill;
          }
        }
      }
      while (remaining > 0) {
        const maxStack = itemToMove.maxStack || 999;
        const countForThisStack = Math.min(maxStack, remaining);
        result.push({
          ...itemToMove,
          id: `${itemToMove.id || 'item'}_${Math.random().toString(36).substring(2, 9)}`,
          count: countForThisStack
        });
        remaining -= countForThisStack;
      }
    } else {
      const isStackable = itemToMove.maxStack && itemToMove.maxStack > 1;
      if (isStackable) {
        result.push({
          ...itemToMove,
          id: `${itemToMove.id || 'item'}_${Math.random().toString(36).substring(2, 9)}`,
          count: qty
        });
      } else {
        for (let i = 0; i < qty; i++) {
          result.push({
            ...itemToMove,
            id: `${itemToMove.id || 'item'}_${Math.random().toString(36).substring(2, 9)}`,
            count: 1
          });
        }
      }
    }
    return result;
  };

  const handleRetrieveAll = () => {
    if (!keptItems || keptItems.length === 0) return;
    if (playSound) playSound('SYS_CLICK');

    if (setPlayer && player && inventoryStats) {
      setPlayer((prev: any) => {
        let newInventory = [...prev.inventory];
        let newStorage = [...(Array.isArray(prev.keptItems) ? prev.keptItems : [])];

        const equippedIds = new Set(Object.values(prev.equipment || {}).filter(i => i).map(i => (i as any).id));
        const getLoad = (inv: any[]) => inv.filter((i: any) => !equippedIds.has(i.id) && i.type !== 'CASH').length;
        const maxCapacity = inventoryStats.maxCapacity;

        let retrievedCount = 0;
        let leftBehindCount = 0;

        const itemsToProcess = [...newStorage];
        newStorage = []; // this will hold items that wouldn't fit

        itemsToProcess.forEach((item) => {
          const qty = item.count || 1;
          if (item.type === 'AMMO') {
            const simulatedWithAmmo = addItemToArrayWithMerging(newInventory, item, qty);
            if (getLoad(simulatedWithAmmo) <= maxCapacity) {
              newInventory = simulatedWithAmmo;
              retrievedCount += qty;
            } else {
              let fitted = 0;
              for (let q = qty; q > 0; q--) {
                const simulatedSub = addItemToArrayWithMerging(newInventory, item, q);
                if (getLoad(simulatedSub) <= maxCapacity) {
                  newInventory = simulatedSub;
                  retrievedCount += q;
                  fitted = q;
                  break;
                }
              }
              const left = qty - fitted;
              if (left > 0) {
                newStorage.push({ ...item, count: left });
                leftBehindCount += left;
              }
            }
          } else {
            const simulatedWithItem = addItemToArrayWithMerging(newInventory, item, qty);
            if (getLoad(simulatedWithItem) <= maxCapacity) {
              newInventory = simulatedWithItem;
              retrievedCount += qty;
            } else {
              newStorage.push(item);
              leftBehindCount += qty;
            }
          }
        });

        if (retrievedCount > 0) {
          if (addLog) {
            addLog(`${localize("Забрано предметов из хранилища: /Retrieved items count: ")}${retrievedCount}`, 'SUCCESS');
            if (leftBehindCount > 0) {
              addLog(`${localize("Не все предметы поместились в инвентарь/Not all items fit into inventory")}`, 'WARNING');
            }
          }
          if (playSound) playSound('SYS_TRANSACTION');
        } else {
          if (addLog) addLog(localize("Недостаточно места в инвентаре/Not enough inventory space"), 'DANGER');
        }

        return {
          ...prev,
          inventory: newInventory,
          keptItems: newStorage
        };
      });

      setQuantities({});
    }
  };

  const handleTransaction = () => {
    if (totalItemsCount === 0) return;
    if (playSound) playSound('SYS_CLICK');

    if (activeTab === 'deposit' && !canAfford) {
      if (addLog) addLog(localize("Не хватает денег/Not enough money"), 'DANGER');
      return;
    }

    if (activeTab === 'retrieve' && !hasSpaceToRetrieve) {
      if (addLog) addLog(localize("Не хватает места в инвентаре/Not enough inventory space"), 'DANGER');
      return;
    }

    if (setPlayer && player) {
      setPlayer((prev: any) => {
        let newInventory = [...prev.inventory];
        let newKeptItems = [...(Array.isArray(prev.keptItems) ? prev.keptItems : [])];

        if (activeTab === 'deposit') {
          // Deduct cash
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

          // Transfer from inventory to storage
          depositLimitItems.forEach((item: any) => {
            const qty = quantities[item.id] || 0;
            if (qty > 0) {
              // Deduct from inventory
              const invIdx = newInventory.findIndex(i => i.id === item.id);
              if (invIdx !== -1) {
                const currentCount = newInventory[invIdx].count || 1;
                if (item.type === 'CASH') {
                  const cashToMove = qty;
                  if (currentCount <= cashToMove) {
                    newInventory.splice(invIdx, 1);
                  } else {
                    newInventory[invIdx] = {
                      ...newInventory[invIdx],
                      count: currentCount - cashToMove
                    };
                  }
                  // Add to storage
                  newKeptItems = addItemToArrayWithMerging(newKeptItems, item, cashToMove);
                } else if (item.type === 'AMMO') {
                  newInventory.splice(invIdx, 1);
                  newKeptItems = addItemToArrayWithMerging(newKeptItems, item, item.count || 0);
                } else {
                  if (currentCount <= qty) {
                    newInventory.splice(invIdx, 1);
                  } else {
                    newInventory[invIdx] = {
                      ...newInventory[invIdx],
                      count: currentCount - qty
                    };
                  }
                  // Add to storage
                  newKeptItems = addItemToArrayWithMerging(newKeptItems, item, qty);
                }
              }
            }
          });

          if (addLog) addLog(`${localize("Сдано предметов на хранение: /Stored items count: ")}${totalItemsCount}`, 'SUCCESS');

         } else {
          // Transfer from storage to inventory
          keptItems.forEach((item: any) => {
            const qty = quantities[item.id] || 0;
            if (qty > 0) {
              // Deduct from storage
              const storageIdx = newKeptItems.findIndex(i => i.id === item.id);
              if (storageIdx !== -1) {
                const currentCount = newKeptItems[storageIdx].count || 1;
                if (item.type === 'CASH') {
                  const cashToMove = qty;
                  if (currentCount <= cashToMove) {
                    newKeptItems.splice(storageIdx, 1);
                  } else {
                    newKeptItems[storageIdx] = {
                      ...newKeptItems[storageIdx],
                      count: currentCount - cashToMove
                    };
                  }
                  // Add to inventory
                  newInventory = addItemToArrayWithMerging(newInventory, item, cashToMove);
                } else if (item.type === 'AMMO') {
                  newKeptItems.splice(storageIdx, 1);
                  newInventory = addItemToArrayWithMerging(newInventory, item, item.count || 0);
                } else {
                  if (currentCount <= qty) {
                    newKeptItems.splice(storageIdx, 1);
                  } else {
                    newKeptItems[storageIdx] = {
                      ...newKeptItems[storageIdx],
                      count: currentCount - qty
                    };
                  }
                  // Add to inventory
                  newInventory = addItemToArrayWithMerging(newInventory, item, qty);
                }
              }
            }
          });

          if (addLog) addLog(`${localize("Забрано предметов из хранилища: /Retrieved items count: ")}${totalItemsCount}`, 'SUCCESS');
        }

        if (playSound) playSound('SYS_TRANSACTION');
        return {
          ...prev,
          inventory: newInventory,
          keptItems: newKeptItems
        };
      });

      setQuantities({});
    }
  };

  const handleTransactionRef = React.useRef(handleTransaction);
  React.useEffect(() => {
    handleTransactionRef.current = handleTransaction;
  }, [handleTransaction]);

  const canExecuteTransactionRef = React.useRef(false);
  canExecuteTransactionRef.current = !(
    totalItemsCount === 0 || 
    (activeTab === 'deposit' && !canAfford) || 
    (activeTab === 'retrieve' && !hasSpaceToRetrieve)
  );

  React.useEffect(() => {
    const handleXPress = () => {
      if (canExecuteTransactionRef.current) {
        handleTransactionRef.current();
      }
    };
    window.addEventListener('gamepad-keep-x-press', handleXPress);
    return () => window.removeEventListener('gamepad-keep-x-press', handleXPress);
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
        id="keep-modal-container"
        className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <Archive size={18} className="text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">{localize("Хранение/Storage")}</h2>
          </div>
          <div className="flex items-center gap-4">
            {inventoryStats && (
              <div className={`text-xs font-['Jura'] font-bold flex items-center gap-1 ${!hasSpaceToRetrieve ? 'text-red-500' : 'text-gray-400'}`}>
                <Package size={14} />
                <span className="uppercase text-[9px] tracking-tight mr-1 text-gray-500">{localize("Место/Space")}:</span>
                <span>{inventoryStats.currentLoad}/{inventoryStats.maxCapacity}</span>
              </div>
            )}
            <button 
              onClick={handleClose}
              className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white gamepad-hide-buttons"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* NPC Price Banner */}
        <div className="bg-gray-950 px-4 py-2 flex items-center justify-between text-[11px] font-bold border-b border-gray-800 text-gray-400 select-none">
          <div className="flex items-center gap-1">
            {spriteMap.get('CASH') ? (
              <img 
                src={spriteMap.get('CASH')!.src} 
                crossOrigin="anonymous"
                alt="Cash" 
                className="w-4 h-4 object-contain mr-0.5" 
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <Coins size={14} className="text-yellow-500" />
            )}
            <span>{localize("Цена за 1 предмет:/Cost per 1 item:")}</span>
            <span className="text-yellow-400">${keepPrice}</span>
          </div>
          <div className="flex items-center gap-1 text-green-400">
            <span>{localize("Ваш баланс:/Your balance:")}</span>
            <span>${playerCash}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900 shrink-0 no-gamepad-nav">
          <button
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'retrieve' 
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-gray-800' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => handleTabSwitch('retrieve')}
          >
            {localize("На хранении/In storage")} ({keptItems.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'deposit' 
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-gray-800' 
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => handleTabSwitch('deposit')}
          >
            {localize("Сдать/Deposit")}
          </button>
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-800/95 relative min-h-0">
          {activeTab === 'retrieve' ? (
            keptItems.length > 0 ? (
              keptItems.map((item: any, idx: number) => {
                const img = spriteMap.get(item.assetId);
                const name = localize(item.name || item.rawName);
                const desc = localize(item.description || item.rawDescription || "");
                const isAmmo = item.type === 'AMMO';
                const packSize = isAmmo ? getAmmoPackSize(item) : 1;
                const maxQty = item.type === 'CASH' ? (item.count || 0) : 1;

                return (
                  <div key={`${item.id}_${idx}`} className="flex items-center p-1.5 bg-gray-900/80 rounded border border-gray-700">
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
                          <div className="px-1.5 py-0 bg-cyan-950 text-cyan-300 text-[9px] font-['Jura'] font-bold rounded border border-cyan-800 flex items-center gap-1 shadow-sm">
                            <BulletIcon size={7} />
                            <span>{item.count || 0}</span>
                          </div>
                        ) : item.count && (
                          <div className="px-1.5 py-0 bg-cyan-950 text-cyan-300 text-[9px] font-['Jura'] font-bold rounded border border-cyan-800 flex items-center gap-1 shadow-sm">
                            {item.type !== 'MATERIAL' && <span className="text-[8px] leading-none">x</span>}
                            <span>{item.count}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-400 leading-tight truncate">{desc}</p>
                    </div>
                    <div className="flex flex-row items-center gap-3 pl-1.5 shrink-0">
                      <div className="flex items-center bg-gray-900 rounded border border-gray-700">
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, -1, maxQty)}
                          className="px-3 py-2 text-gray-400 hover:text-white active:bg-gray-800 rounded-l transition-colors flex items-center justify-center select-none touch-manipulation"
                        >
                          <Minus size={16} />
                        </HoldableButton>
                        <span className="text-sm font-bold w-6 text-center text-gray-200">
                          {quantities[item.id] || 0}
                        </span>
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, 1, maxQty)}
                          disabled={(quantities[item.id] || 0) >= maxQty}
                          className={`px-3 py-2 rounded-r transition-colors flex items-center justify-center select-none touch-manipulation ${(quantities[item.id] || 0) >= maxQty ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white active:bg-gray-800'}`}
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
                {localize("В хранилище пусто/Storage is empty")}
              </div>
            )
          ) : (
            depositLimitItems.length > 0 ? (
              depositLimitItems.map((item: any, idx: number) => {
                const img = spriteMap.get(item.assetId);
                const name = localize(item.name || item.rawName);
                const desc = localize(item.description || item.rawDescription || "");
                const isAmmo = item.type === 'AMMO';
                const maxQty = item.type === 'CASH'
                  ? (() => {
                      const numOtherDepositItems = Object.entries(quantities).reduce((sum, [id, qty]) => {
                        if (id === item.id) return sum;
                        const depositItem = depositLimitItems.find((i: any) => i.id === id);
                        if (!depositItem || (qty as number) <= 0) return sum;
                        return sum + getSelectedPacksOrItemsCount(id, qty as number);
                      }, 0);
                      return Math.max(0, playerCash - (numOtherDepositItems + 1) * keepPrice);
                    })()
                  : 1;

                return (
                  <div key={`${item.id}_${idx}`} className="flex items-center p-1.5 bg-gray-900/80 rounded border border-gray-700">
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
                            <span>{item.count || 0}</span>
                          </div>
                        ) : item.count && (
                          <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            {item.type !== 'MATERIAL' && <span className="text-[8px] leading-none">x</span>}
                            <span>{item.count}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-gray-400 leading-tight truncate">{desc}</p>
                    </div>
                    <div className="flex flex-row items-center gap-3 pl-1.5 shrink-0">
                      <div className="text-yellow-500 font-bold text-sm flex items-center gap-0.5">
                        <span className="text-[12px]">$</span>{keepPrice}
                      </div>
                      <div className="flex items-center bg-gray-900 rounded border border-gray-700">
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, -1, maxQty)}
                          className="px-3 py-2 text-gray-400 hover:text-white active:bg-gray-800 rounded-l transition-colors flex items-center justify-center select-none touch-manipulation"
                        >
                          <Minus size={16} />
                        </HoldableButton>
                        <span className="text-sm font-bold w-6 text-center text-gray-200">
                          {quantities[item.id] || 0}
                        </span>
                        <HoldableButton 
                          onClick={() => handleQuantityChange(item.id, 1, maxQty)}
                          disabled={(quantities[item.id] || 0) >= maxQty}
                          className={`px-3 py-2 rounded-r transition-colors flex items-center justify-center select-none touch-manipulation ${(quantities[item.id] || 0) >= maxQty ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white active:bg-gray-800'}`}
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
                {localize("Нет предметов для сдачи/No items to deposit")}
              </div>
            )
          )}
        </div>

        {/* Action Bottom Section */}
        <div className="p-4 border-t border-gray-700 bg-gray-900 shrink-0 flex flex-col gap-2 shadow-inner z-10 select-none">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <div>
              {activeTab === 'deposit' ? (
                <span>{localize("Общая стоимость:/Total fee:")} <span className="text-yellow-400 font-bold text-sm">${totalCost}</span></span>
              ) : (
                <span>{localize("Общий размер:/Required load:")} <span className={`font-bold ${!hasSpaceToRetrieve ? 'text-red-500' : 'text-cyan-400'}`}>{totalSlotsNeededOnRetrieve} {localize("слотов/slots")}</span></span>
              )}
            </div>
            <div>
              <span>{localize("Выбрано предметов:/Selected count:")} <span className="text-white font-bold">{totalItemsCount}</span></span>
            </div>
          </div>

          <div className="flex gap-2 w-full">
            {activeTab === 'retrieve' && keptItems.length > 0 && (
              <button
                onClick={handleRetrieveAll}
                className="flex-1 py-3 rounded font-bold uppercase tracking-wider text-[11px] transition-colors select-none touch-manipulation bg-cyan-800 text-cyan-100 hover:bg-cyan-700 active:bg-cyan-900 border border-cyan-600 shadow-md cursor-pointer text-center"
              >
                {localize("Забрать всё/Retrieve All")}
              </button>
            )}

            <button
              disabled={
                totalItemsCount === 0 || 
                (activeTab === 'deposit' && !canAfford) || 
                (activeTab === 'retrieve' && !hasSpaceToRetrieve)
              }
              onClick={handleTransaction}
              className={`relative py-3 rounded font-bold uppercase tracking-wider text-[11px] transition-colors select-none touch-manipulation flex items-center justify-center gap-2 ${
                activeTab === 'retrieve' && keptItems.length > 0 ? 'flex-1' : 'w-full'
              } ${
                totalItemsCount === 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : activeTab === 'deposit' && !canAfford
                    ? 'bg-red-900 border border-red-500 text-red-100 hover:bg-red-800'
                    : activeTab === 'retrieve' && !hasSpaceToRetrieve
                      ? 'bg-red-950 border border-red-600 text-red-200 hover:bg-red-900'
                      : 'bg-cyan-600 text-white hover:bg-cyan-500 active:bg-cyan-700 shadow-md shadow-cyan-950/40 cursor-pointer'
              }`}
            >
              {isGamepadActive && (
                <div className="absolute -top-1.5 -right-1.5 scale-75 origin-top-right">
                  <XboxButton label="X" />
                </div>
              )}
              {activeTab === 'deposit' 
                ? (canAfford ? localize("Сдать на хранение/Put in storage") : localize("Недостаточно денег/Not enough cash"))
                : (hasSpaceToRetrieve ? localize("Забрать/Retrieve") : localize("Не хватает места/Not enough space"))
              }
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default React.memo(KeepModal);
