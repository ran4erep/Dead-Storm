
import React, { useState, useRef, useEffect } from 'react';
import { Item, GameStrings, GameState, ACCESSORY_TYPES } from '../types';
import { Pill, Key, Package, X, Info, ChevronLeft, Briefcase, Shield, Hand, Map as MapIcon, Flame, RotateCcw, Flashlight, Zap, Plus, Crosshair, Ruler, Weight } from 'lucide-react';
import { WeaponIcon } from './WeaponIcon';
import { BulletIcon } from './CombatOverlay';
import ToastContainer from './Toast';
import { useToast } from '../hooks/useToast';
import itemsDb from '../data/items.json';

const ammoTypeToItemMap = new Map<string, any>();
Object.entries(itemsDb).forEach(([id, item]: [string, any]) => {
  if (item.type === 'AMMO' && item.ammoType) {
    ammoTypeToItemMap.set(item.ammoType, { id, ...item });
  }
});

interface InventoryModalProps {
  items: Item[];
  equippedWeaponId: string | undefined;
  strings: GameStrings['inventory'];
  uiStrings: GameStrings['ui']; 
  gameState: GameState; 
  spriteMap: Map<string, HTMLImageElement>;
  currentLoad: number;
  maxCapacity: number;
  language?: 'en' | 'ru';
  onEquip: (item: Item, onFeedback?: (msg: string) => void) => void;
  onUse: (item: Item, onFeedback?: (msg: string) => void) => void;
  onThrow: (item: Item, count?: number) => void;
  onClose: () => void;
  onUnload?: (item: Item, onFeedback?: (msg: string) => void) => void;
  onExtractBattery?: (item: Item, onFeedback?: (msg: string) => void, selectedBatteryId?: string) => void; 
  onPreCheckC4?: () => string | null;
}

const InventoryModal: React.FC<InventoryModalProps> = ({ items, strings, uiStrings, gameState, spriteMap, currentLoad, maxCapacity, language, onUse, onThrow, onClose, onUnload, onExtractBattery, onPreCheckC4 }) => {
  const [inspectItem, setInspectItem] = useState<Item | null>(null);
  const [c4Target, setC4Target] = useState<Item | null>(null);
  const [c4Timer, setC4Timer] = useState<number>(3);
  const [batterySelectTarget, setBatterySelectTarget] = useState<Item | null>(null);
  const [dropQtyTarget, setDropQtyTarget] = useState<Item | null>(null);
  const [dropQty, setDropQty] = useState<number>(1);
  const { toasts, showToast } = useToast();

  const intervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);
  const lastPointerAdjustTimeRef = useRef<number>(0);

  const startAdjusting = (direction: 'up' | 'down', maxVal: number) => {
    stopAdjusting();

    setDropQty(prev => {
      if (direction === 'up') return Math.min(maxVal, prev + 1);
      return Math.max(1, prev - 1);
    });

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setDropQty(prev => {
          if (direction === 'up') return Math.min(maxVal, prev + 1);
          return Math.max(1, prev - 1);
        });
      }, 70);
    }, 400);
  };

  const stopAdjusting = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAdjusting();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (batterySelectTarget) {
          setBatterySelectTarget(null);
          e.stopPropagation();
          e.preventDefault();
        } else if (dropQtyTarget) {
          setDropQtyTarget(null);
          e.stopPropagation();
          e.preventDefault();
        } else if (c4Target) {
          setC4Target(null);
          e.stopPropagation();
          e.preventDefault();
        } else if (inspectItem) {
          setInspectItem(null);
          e.stopPropagation();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [inspectItem, c4Target, dropQtyTarget, batterySelectTarget]);

  const handleC4Click = (item: Item) => {
    if (onPreCheckC4) {
      const errorMsg = onPreCheckC4();
      if (errorMsg) {
        showToast(errorMsg, "error");
        return;
      }
    }
    setC4Target(item);
  };

  const displayItems = items
    .filter(i => !i.equip || i.equip === 'NONE')
    .sort((a, b) => {
      const aVal = a.weight === 0 ? 1 : 0;
      const bVal = b.weight === 0 ? 1 : 0;
      return aVal - bVal;
    });
  
  const isFull = currentLoad >= maxCapacity;

  const getPowerSourceAssetId = (powerSourceKey: string | undefined): string => {
    if (!powerSourceKey) return 'BATTERY';
    const found = items.find(i => (i.definitionId || i.id || '').toLowerCase() === powerSourceKey.toLowerCase());
    if (found && found.assetId) return found.assetId;
    return powerSourceKey.toUpperCase();
  };

  const renderIcon = (item: Item, className: string = "w-8 h-8") => {
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

  const renderDurabilityBar = (item: Item | null) => {
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

  if (c4Target) {
    const titleText = strings.c4_timer_title || "ТАЙМЕР";
    const useText = strings.c4_timer_use || "УСТАНОВИТЬ";
    const cancelText = strings.c4_timer_cancel || "ОТМЕНА";
    const secondsText = strings.c4_timer_sec || "СЕК";

    return (
      <div id="c4-timer-modal-container" className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']">
        <div className="bg-gray-800 border border-gray-600 w-full max-w-sm rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
          
          <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
            <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase">{titleText}</h2>
          </div>

          <div className="p-6 flex flex-col items-center justify-center bg-gray-800/95 relative gap-6">
            <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center border-2 border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden shrink-0">
               <div className="absolute inset-0 bg-gradient-to-br from-gray-700/20 to-black/40"></div>
               <div className="relative z-10 scale-125">
                  {renderIcon(c4Target, "w-12 h-12")}
               </div>
            </div>

            <div className="flex items-center gap-6">
              <button 
                onClick={() => setC4Timer(Math.max(1, c4Timer - 1))}
                className="w-12 h-12 bg-gray-700 border border-gray-600 text-white font-bold text-2xl rounded flex items-center justify-center active:bg-gray-600"
              >
                -
              </button>
              <div className="flex flex-col items-center min-w-[60px]">
                <span className="text-4xl font-bold text-white leading-none">{c4Timer}</span>
                <span className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">{secondsText}</span>
              </div>
              <button 
                onClick={() => setC4Timer(c4Timer + 1)}
                 className="w-12 h-12 bg-gray-700 border border-gray-600 text-white font-bold text-2xl rounded flex items-center justify-center active:bg-gray-600"
              >
                +
              </button>
            </div>

            <div className="w-full flex gap-2 w-full mt-4">
               <button 
                  onClick={() => setC4Target(null)}
                  className="flex-1 py-3 border font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600"
                >
                  {cancelText}
                </button>
                <button 
                  onClick={() => {
                     // Attach timer to item then trigger use
                     onUse({ ...c4Target, timer: c4Timer }, showToast);
                     setC4Target(null);
                  }}
                  className="flex-1 py-3 bg-green-900/40 border border-green-700/40 text-green-400 font-bold rounded active:bg-green-900/60 flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all"
                >
                  {useText}
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dropQtyTarget) {
    const titleText = strings.drop_qty_title || "КОЛИЧЕСТВО";
    const dropText = strings.drop_qty_btn || "БРОСИТЬ";
    const cancelText = strings.c4_timer_cancel || "ОТМЕНА";
    const maxQty = dropQtyTarget.count || 1;

    return (
      <div id="drop-qty-modal-container" className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']">
        <div className="bg-gray-800 border border-gray-600 w-full max-w-sm rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
          
          <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
            <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase">{titleText}</h2>
          </div>

          <div className="p-6 flex flex-col items-center justify-center bg-gray-800/95 relative gap-6">
            <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center border-2 border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden shrink-0">
               <div className="absolute inset-0 bg-gradient-to-br from-gray-700/20 to-black/40"></div>
               <div className="relative z-10 scale-125">
                  {renderIcon(dropQtyTarget, "w-12 h-12")}
               </div>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
              <div className="flex items-center justify-between w-full gap-4">
                <button 
                  data-holdable="true"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    lastPointerAdjustTimeRef.current = Date.now();
                    try { (e.currentTarget as any).setPointerCapture(e.pointerId); } catch(ex) {}
                    startAdjusting('down', maxQty);
                  }}
                  onPointerUp={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onPointerCancel={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onPointerLeave={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onClick={() => {
                    if (Date.now() - lastPointerAdjustTimeRef.current > 100) {
                      setDropQty(prev => Math.max(1, prev - 1));
                    }
                  }}
                  className="w-12 h-12 bg-gray-700 border border-gray-600 text-white font-bold text-2xl rounded flex items-center justify-center active:bg-gray-600 select-none cursor-pointer touch-none"
                >
                  -
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-bold text-white leading-none">
                    {dropQty}/{maxQty}
                  </span>
                </div>
                <button 
                  data-holdable="true"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    lastPointerAdjustTimeRef.current = Date.now();
                    try { (e.currentTarget as any).setPointerCapture(e.pointerId); } catch(ex) {}
                    startAdjusting('up', maxQty);
                  }}
                  onPointerUp={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onPointerCancel={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onPointerLeave={(e) => {
                    try { (e.currentTarget as any).releasePointerCapture(e.pointerId); } catch(ex) {}
                    stopAdjusting();
                  }}
                  onClick={() => {
                    if (Date.now() - lastPointerAdjustTimeRef.current > 100) {
                      setDropQty(prev => Math.min(maxQty, prev + 1));
                    }
                  }}
                  className="w-12 h-12 bg-gray-700 border border-gray-600 text-white font-bold text-2xl rounded flex items-center justify-center active:bg-gray-600 select-none cursor-pointer touch-none"
                >
                  +
                </button>
              </div>
            </div>

            <div className="w-full flex gap-2 mt-4">
               <button 
                  onClick={() => setDropQtyTarget(null)}
                  className="flex-1 py-3 border font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600"
                >
                  {cancelText}
                </button>
                <button 
                  onClick={() => {
                     onThrow(dropQtyTarget, dropQty);
                     setDropQtyTarget(null);
                  }}
                  className="flex-1 py-3 bg-red-900/40 border border-red-700/40 text-red-400 font-bold rounded active:bg-red-900/60 flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all"
                >
                  {dropText}
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (inspectItem) {
    // Find the live version of the item to get real-time ammo updates without closing modal
    const liveItem = items.find(i => i.id === inspectItem.id) || inspectItem;
    
    const localizeVal = (val: string | undefined, lang: 'en' | 'ru') => {
      if (!val) return "";
      const idx = val.indexOf('/');
      if (idx !== -1) return lang === 'ru' ? val.substring(0, idx).trim() : val.substring(idx + 1).trim();
      return val;
    };

    const findAmmoItem = (ammoType: string | undefined): Item | null => {
      if (!ammoType) return null;
      return ammoTypeToItemMap.get(ammoType) || null;
    };

    const stats: { label: string; value: string | number; icon: React.ReactNode; color: string }[] = [];

    if (liveItem.type === 'WEAPON' && liveItem.damageDice) {
      stats.push({ 
        label: strings.damage_short || "УРОН", 
        value: liveItem.damageDice, 
        icon: <WeaponIcon size={14} />, 
        color: "text-red-400" 
      });
    }

    if (liveItem.type === 'WEAPON' && liveItem.accuracy !== undefined) {
      stats.push({ 
        label: strings.accuracy, 
        value: liveItem.accuracy, 
        icon: <Crosshair size={14} />, 
        color: "text-cyan-400" 
      });
    }

    if (liveItem.type === 'WEAPON' && liveItem.range !== undefined) {
      stats.push({ 
        label: strings.range, 
        value: `${liveItem.range}m`, 
        icon: <Ruler size={14} />, 
        color: "text-yellow-400" 
      });
    }

    if (liveItem.type === 'WEAPON' && liveItem.ammoType) {
      const ammoItem = findAmmoItem(liveItem.ammoType);
      if (ammoItem) {
        const ammoLabel = (language || 'ru') === 'ru' ? 'Патроны' : 'Ammo';
        const ammoName = localizeVal(ammoItem.name, language || 'ru');
        stats.push({
          label: ammoLabel,
          value: ammoName,
          icon: renderIcon(ammoItem, "w-[14px] h-[14px]"),
          color: "text-gray-300"
        });
      }
    }

    if (liveItem.healDice) {
      stats.push({ 
        label: strings.heal_short, 
        value: liveItem.healDice, 
        icon: <Pill size={14} />, 
        color: "text-green-400" 
      });
    }

    if ((liveItem.type === 'GRENADE' || liveItem.type === 'FLASHBANG') && liveItem.damageDice) {
        stats.push({
            label: strings.blast_damage,
            value: liveItem.damageDice,
            icon: <Flame size={14} />,
            color: "text-orange-500"
        });
    }

    if (liveItem.throwDamage && liveItem.throwDamage !== "0") {
      stats.push({
          label: strings.throw_damage_short,
          value: liveItem.throwDamage,
          icon: <Hand size={14} />,
          color: "text-red-400"
      });
    }

    if ((liveItem.type === 'AMMO' || liveItem.type === 'CASH' || (liveItem.count && liveItem.count > 1)) && liveItem.count !== undefined) {
      stats.push({
          label: strings.quantity_label,
          value: liveItem.count,
          icon: liveItem.type === 'AMMO' ? <BulletIcon size={14} /> : liveItem.type === 'CASH' ? <span className="text-[10px] font-bold">$</span> : <span className="text-[10px] font-bold">x</span>,
          color: liveItem.type === 'CASH' ? "text-green-400" : "text-gray-300"
      });
    }

    if (liveItem.powerSource && liveItem.currentAmmo !== undefined && liveItem.magazineMax !== undefined) {
        stats.push({
            label: strings.charge_label || "CHARGE",
            value: `${Math.round((liveItem.currentAmmo / liveItem.magazineMax) * 100)}%`,
            icon: <Zap size={14} />,
            color: "text-yellow-400"
        });
    }

    if (liveItem.type === 'BATTERY' && liveItem.charge !== undefined) {
        stats.push({
            label: strings.charge_label || "CHARGE",
            value: `${liveItem.charge}%`,
            icon: <Zap size={14} />,
            color: "text-yellow-400"
        });
    }

    // Weight property
    const itemWeight = liveItem.weight !== undefined ? liveItem.weight : 1;
    stats.push({
      label: strings.weight_label || "Weight",
      value: itemWeight,
      icon: <Weight size={14} />,
      color: "text-amber-500"
    });

    // Show button if it is a weapon (unloaded or loaded)
    const isWeapon = liveItem.type === 'WEAPON';
    const hasAmmo = liveItem.currentAmmo !== undefined && liveItem.currentAmmo > 0;

    return (
      <div id="item-inspect-modal-container" className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']">
        <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
           
           <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
              <button onClick={() => setInspectItem(null)} className="text-gray-400 active:text-white flex items-center gap-1 transition-colors touch-manipulation">
                  <ChevronLeft size={20} />
                  <span className="text-xs font-bold uppercase">{strings.btn_close}</span>
              </button>
              <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase">{strings.details_title}</h2>
              <div className="w-6"></div> 
           </div>

           <div className="p-4 flex flex-col items-center overflow-y-auto bg-gray-800/95 relative">
              <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center mb-4 border-2 border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden shrink-0">
                 <div className="absolute inset-0 bg-gradient-to-br from-gray-700/20 to-black/40"></div>
                 <div className="relative z-10 scale-125">
                    {renderIcon(liveItem, "w-12 h-12")}
                 </div>
              </div>

              <h1 className="text-lg font-bold text-white uppercase text-center mb-4 leading-tight">{liveItem.name}</h1>
              
              {stats.length > 0 && (
                <div className="w-full grid grid-cols-2 gap-2 mb-4">
                   {stats.map((stat, idx) => {
                     const isLong = typeof stat.value === 'string' && stat.value.length > 10;
                     return (
                       <div key={idx} className="bg-gray-900/50 border border-gray-700 p-1.5 rounded flex flex-col items-center justify-center min-h-[48px] w-full overflow-hidden">
                          <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5 text-center truncate w-full">{stat.label}</span>
                          <div className={`flex items-center justify-center gap-1 ${stat.color} w-full px-1`}>
                             <div className="shrink-0 flex items-center justify-center">{stat.icon}</div>
                             <span className={`font-['Jura'] font-bold leading-tight text-center break-words ${isLong ? 'text-[10px]' : 'text-xs md:text-sm'}`}>
                                {stat.value}
                             </span>
                          </div>
                       </div>
                     );
                   })}
                </div>
              )}

              {liveItem.maxDurability !== undefined && liveItem.maxDurability > 0 && (
                <div className="w-full mb-4">
                  <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
                    {strings.durability}
                  </div>
                  <div className="w-full bg-gray-900 h-4 rounded overflow-hidden border border-gray-700 relative flex items-center justify-center">
                    <div 
                      className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${((liveItem.durability || 0) / liveItem.maxDurability) > 0.5 ? 'bg-emerald-600' : ((liveItem.durability || 0) / liveItem.maxDurability) > 0.2 ? 'bg-amber-500' : 'bg-rose-600'}`}
                      style={{ width: `${Math.max(0, Math.min(100, ((liveItem.durability || 0) / liveItem.maxDurability) * 100))}%` }}
                    />
                    <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-md">
                      {Math.round((liveItem.durability || 0) / liveItem.maxDurability * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {liveItem.powerSource && liveItem.currentAmmo !== undefined && liveItem.magazineMax !== undefined && (
                <div className="w-full mb-4">
                  <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
                    {strings.charge_label || "Заряд"}
                  </div>
                  <div className="w-full bg-gray-900 h-4 rounded overflow-hidden border border-gray-700 relative flex items-center justify-center">
                    <div 
                      className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${((liveItem.currentAmmo || 0) / liveItem.magazineMax) > 0.5 ? 'bg-emerald-600' : ((liveItem.currentAmmo || 0) / liveItem.magazineMax) > 0.2 ? 'bg-amber-500' : 'bg-rose-600'}`}
                      style={{ width: `${Math.max(0, Math.min(100, ((liveItem.currentAmmo || 0) / liveItem.magazineMax) * 100))}%` }}
                    />
                    <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-md">
                      {Math.round(((liveItem.currentAmmo || 0) / liveItem.magazineMax) * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {liveItem.powerSource && (
                <div className="w-full mb-4 flex flex-col items-center">
                  <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 font-['Jura']">
                    <Zap size={10} className="text-yellow-400 animate-pulse" />
                    <span>{strings.charge_label || "Заряд аккумулятора"}</span>
                  </div>
                  <button 
                    onClick={() => { 
                      const isExtraction = liveItem.hasBattery !== false && liveItem.currentAmmo !== 0;
                      if (isExtraction) {
                        if (onExtractBattery) onExtractBattery(liveItem, showToast); 
                      } else {
                        const batteriesInInv = items.filter(i => i.type === 'BATTERY');
                        if (batteriesInInv.length > 1) {
                          setBatterySelectTarget(liveItem);
                        } else {
                          if (onExtractBattery) onExtractBattery(liveItem, showToast);
                        }
                      }
                    }} 
                    className={`w-16 h-16 border-2 rounded flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${liveItem.hasBattery !== false && liveItem.currentAmmo !== 0 ? 'border-yellow-500 bg-yellow-900/20 hover:bg-yellow-900/40' : 'border-dashed border-gray-600 bg-gray-900/60 hover:border-gray-500 hover:bg-gray-800'}`}
                    title={liveItem.hasBattery !== false && liveItem.currentAmmo !== 0 ? "Извлечь элемент питания / Extract battery" : "Вставить элемент питания / Insert battery"}
                  >
                     {liveItem.hasBattery !== false && liveItem.currentAmmo !== 0 ? (
                       <>
                         {renderIcon({ ...liveItem, type: 'BATTERY', assetId: getPowerSourceAssetId(liveItem.powerSource) }, 'w-7 h-7')}
                         <span className="text-yellow-400 text-[9px] font-bold">{Math.round((liveItem.currentAmmo / (liveItem.magazineMax || 100)) * 100)}%</span>
                       </>
                     ) : (
                       <>
                         <Plus size={16} className="text-gray-500" />
                         <span className="text-gray-500 text-[9px] font-bold uppercase">ПУСТО</span>
                       </>
                     )}
                  </button>
                </div>
              )}

              <div className="w-full bg-black/20 p-2 rounded border border-gray-700/50 mb-4 font-['Jura']">
                  <p className="text-xs text-gray-300 italic text-center leading-relaxed">
                    "{liveItem.description}"
                  </p>
              </div>

              <div className="w-full flex gap-2">
                  {onUnload && isWeapon && (
                      <button 
                        onClick={() => { if(onUnload && hasAmmo) onUnload(liveItem, showToast); }}
                        disabled={!hasAmmo}
                        className={`flex-1 py-3 border font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all ${
                            hasAmmo 
                            ? 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600 cursor-pointer' 
                            : 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                      >
                        {strings.btn_unload || "UNLOAD"}
                      </button>
                  )}
                  {liveItem.powerSource && liveItem.type !== 'FLASHLIGHT' && (
                      <button 
                        onClick={() => onUse(liveItem, showToast)}
                        className={`flex-1 py-3 border font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all ${
                            liveItem.isActive 
                            ? 'bg-yellow-900/20 border-yellow-700/40 text-yellow-400 active:bg-yellow-900/40 hover:bg-yellow-900/30' 
                            : 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600 hover:bg-gray-650'
                        }`}
                      >
                        {liveItem.isActive ? (strings.btn_turn_off || "OFF") : (strings.btn_turn_on || "ON")}
                      </button>
                  )}
                  {liveItem.type === 'C4' && (
                      <button 
                        onClick={() => { handleC4Click(liveItem); setInspectItem(null); }}
                        className="flex-1 py-3 bg-green-900/20 border border-green-700/40 text-green-400 font-bold rounded active:bg-green-900/40 flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all"
                      >
                        {strings.btn_use || "USE"}
                      </button>
                  )}
                  {!liveItem.cannotDrop && (
                    <button 
                      onClick={() => {
                        if ((liveItem.type === 'AMMO' || liveItem.type === 'MATERIAL') && liveItem.count !== undefined && liveItem.count > 1) {
                          setDropQtyTarget(liveItem);
                          setDropQty(liveItem.count);
                        } else {
                          onThrow(liveItem);
                        }
                        setInspectItem(null);
                      }}
                      className="flex-1 py-3 bg-red-900/20 border border-red-700/40 text-red-400 font-bold rounded active:bg-red-900/40 flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all"
                    >
                      {strings.btn_throw}
                    </button>
                  )}
              </div>
           </div>
           
            {(() => {
              if (!batterySelectTarget) return null;
              const batteriesInInv = items.filter(i => i.type === 'BATTERY');
              return (
                <div id="battery-select-modal-container" className="absolute inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 font-['Jura'] animate-in fade-in zoom-in duration-200">
                  <div className="bg-gray-800 border border-gray-600 w-full max-w-xs rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
                    <div className="p-3 border-b border-gray-700 bg-gray-900 flex justify-between items-center shrink-0">
                      <h3 className="text-sm font-bold text-white uppercase tracking-widest text-shadow">
                        {strings.select_battery_title || "ВЫБЕРИТЕ АККУМУЛЯТОР"}
                      </h3>
                      <button 
                        onClick={() => setBatterySelectTarget(null)} 
                        className="text-gray-400 hover:text-white cursor-pointer active:scale-90 transition-transform animate-pulse"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="p-3 bg-gray-950/40 text-center shrink-0 border-b border-gray-700">
                      <p className="text-[10px] text-yellow-450 uppercase tracking-wider font-bold">
                         {batterySelectTarget.name}
                      </p>
                    </div>
                    <div className="p-3 overflow-y-auto space-y-2 flex-1 scrollbar-thin scrollbar-thumb-gray-700 bg-gray-900/10">
                      {batteriesInInv.map((bat, idx) => {
                        const batteryCharge = bat.charge ?? 100;
                        return (
                          <div 
                            key={`${bat.id}-${idx}`}
                            onClick={() => {
                              if (onExtractBattery) {
                                onExtractBattery(batterySelectTarget, showToast, bat.id);
                              }
                              setBatterySelectTarget(null);
                            }}
                            className="w-full flex items-center p-2 bg-gray-900/60 border border-gray-700 hover:border-yellow-550/60 hover:bg-gray-900 cursor-pointer active:scale-[0.98] transition-all rounded shadow-md"
                          >
                            <div className="w-8 h-8 bg-black/40 rounded flex items-center justify-center mr-3 shrink-0 relative border border-gray-800/80">
                              {renderIcon(bat, "w-6 h-6")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-gray-200 uppercase truncate">{bat.name}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Zap size={10} className="text-yellow-400 animate-pulse" />
                                <span className="text-[10px] text-yellow-400 font-bold">{batteryCharge}%</span>
                              </div>
                            </div>
                            <div className="ml-2 text-[10px] font-bold text-yellow-400 bg-yellow-955/30 px-2 py-0.5 rounded border border-yellow-800/60 uppercase hover:bg-yellow-905/45">
                              {strings.btn_equip || "ВСТАВИТЬ"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-3 border-t border-gray-700 bg-gray-950/25 shrink-0">
                      <button 
                        onClick={() => setBatterySelectTarget(null)}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-650 text-gray-300 active:bg-gray-500 text-xs font-bold uppercase tracking-widest rounded border border-gray-600 transition-colors cursor-pointer"
                      >
                        {strings.btn_cancel || "ОТМЕНА"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>
        <ToastContainer toasts={toasts} variant="fixed-bottom" isAbsolute={true} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']">
      <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
        
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">{strings.title}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className={`text-xs font-['Jura'] font-bold flex items-center gap-1 ${isFull ? 'text-red-500' : 'text-gray-400'}`}>
                <Package size={14} />
                <span className="uppercase text-[9px] tracking-tight mr-1 text-gray-500">{strings.capacity}:</span>
                <span>{currentLoad}/{maxCapacity}</span>
             </div>
             <button onClick={onClose} className="text-gray-400 active:text-white transition-colors flex items-center gap-1 touch-manipulation gamepad-hide-buttons">
                <X size={20} />
             </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-800/95 relative">
          {displayItems.length === 0 && <p className="text-gray-500 text-center italic mt-4">{strings.empty}</p>}
          
          {displayItems.map((item, idx) => {
            const isMap = item.type === 'MAP' || item.type === 'NOTE';
            const isMapCurrentlyOpen = isMap && gameState === GameState.MAP_VIEW;
            const isRadio = item.type === 'RADIO';
            const isRadioCurrentlyOpen = isRadio && gameState === GameState.RADIO_VIEW;
            const isConsole = item.type === 'CONSOLE';
            const isConsoleCurrentlyOpen = isConsole && gameState === GameState.CONSOLE_VIEW;

            return (
              <div key={`${item.id}-${idx}`} className="flex items-center p-1.5 bg-gray-900/80 rounded border border-gray-700 active:border-gray-500 transition-all">
                <div onClick={() => setInspectItem(item)} className="p-0.5 bg-black/40 rounded mr-1.5 active:bg-black/60 transition-colors cursor-pointer border border-gray-700/50 w-10 h-10 flex items-center justify-center shrink-0 relative">
                  {renderDurabilityBar(item)}
                  {renderIcon(item, "w-8 h-8")}
                  {item.powerSource && item.currentAmmo !== undefined && item.magazineMax !== undefined && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                          <Zap size={6} className="text-yellow-400" />
                          <span>{Math.round((item.currentAmmo / item.magazineMax) * 100)}%</span>
                      </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-200 text-xs uppercase truncate">{item.name}</h3>
                    {item.type === 'BATTERY' && item.charge !== undefined && (
                        <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            <Zap size={7} className="text-yellow-400" />
                            <span>{item.charge}%</span>
                        </div>
                    )}
                    {(item.type === 'AMMO' || item.type === 'MATERIAL' || item.type === 'CASH' || (item.type !== 'BATTERY' && item.count !== undefined && item.count > 1)) && (
                        <div className="px-1.5 py-0 bg-gray-700 text-gray-300 text-[9px] font-['Jura'] font-bold rounded border border-gray-600 flex items-center gap-1 shadow-sm">
                            {item.type === 'AMMO' && <BulletIcon size={7} />}
                            {item.type === 'CASH' && <span className="text-[8px] leading-none text-green-400">$</span>}
                            {item.type !== 'AMMO' && item.type !== 'CASH' && item.type !== 'MATERIAL' && <span className="text-[8px] leading-none">x</span>}
                            <span>{item.count}</span>
                        </div>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 leading-tight truncate">{item.description}</p>
                </div>
                <div className="flex flex-row items-center gap-1.5 pl-1.5">
                  <button 
                    onClick={() => setInspectItem(item)}
                    className="p-1.5 bg-gray-700/50 text-gray-300 rounded active:bg-gray-600 border border-gray-600/50 transition-colors touch-manipulation flex items-center justify-center"
                  >
                    <Info size={14} />
                  </button>
                  
                  {item.type === 'CONSUMABLE' && (
                    <button 
                      onClick={() => onUse(item, showToast)}
                      className="px-3 py-1.5 bg-green-900/40 text-[9px] rounded active:bg-green-800 text-green-200 border border-green-800/50 uppercase tracking-wider transition-colors touch-manipulation font-bold"
                    >
                      {strings.btn_use}
                    </button>
                  )}

                  {item.type === 'C4' && (
                    <button 
                      onClick={() => handleC4Click(item)}
                      className="px-3 py-1.5 bg-green-900/40 text-[9px] rounded active:bg-green-800 text-green-200 border border-green-800/50 uppercase tracking-wider transition-colors touch-manipulation font-bold"
                    >
                      {strings.btn_use}
                    </button>
                  )}

                   {item.powerSource && (!item.equip || item.equip === 'NONE') && (
                    <button 
                      onClick={() => onUse(item, showToast)}
                      className={`px-3 py-1.5 text-[9px] rounded border uppercase tracking-wider transition-colors touch-manipulation font-bold ${
                        item.isActive 
                          ? 'bg-yellow-900/40 border-yellow-800/50 text-yellow-200 active:bg-yellow-800'
                          : 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600'
                      }`}
                    >
                      {item.isActive ? (strings.btn_turn_off || "OFF") : (strings.btn_turn_on || "ON")}
                    </button>
                  )}

                  {item.type === 'FLASHLIGHT' && (
                    <button 
                      onClick={() => onUse(item, showToast)}
                      className={`px-3 py-1.5 text-[9px] rounded border uppercase tracking-wider transition-colors touch-manipulation font-bold ${
                        item.isActive 
                          ? 'bg-yellow-900/40 border-yellow-800/50 text-yellow-200 active:bg-yellow-800'
                          : 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600'
                      }`}
                    >
                      {item.isActive ? (strings.btn_turn_off || "OFF") : (strings.btn_turn_on || "ON")}
                    </button>
                  )}

                  {isMap && (
                    <button 
                      onClick={() => { onUse(item, showToast); if (isMapCurrentlyOpen) onClose(); }}
                      className={`px-3 py-1.5 text-[9px] rounded border uppercase tracking-wider transition-colors touch-manipulation font-bold ${
                        isMapCurrentlyOpen 
                          ? 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600'
                          : 'bg-green-900/40 border-green-800/50 text-green-200 active:bg-green-800'
                      }`}
                    >
                      {isMapCurrentlyOpen ? (uiStrings.controls.btn_hide_map || "HIDE") : (item.type === 'NOTE' ? (strings.btn_read || "READ") : strings.btn_use)}
                    </button>
                  )}

                  {isRadio && isRadioCurrentlyOpen && (
                    <button 
                      onClick={() => { onUse(item, showToast); if (isRadioCurrentlyOpen) onClose(); }}
                      className="px-3 py-1.5 text-[9px] rounded border uppercase tracking-wider transition-colors touch-manipulation font-bold bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600"
                    >
                      {uiStrings.controls?.btn_hide_radio || "Спрятать"}
                    </button>
                  )}

                  {isConsole && (
                    <button 
                      onClick={() => { onUse(item, showToast); if (isConsoleCurrentlyOpen) onClose(); }}
                      className={`px-3 py-1.5 text-[9px] rounded border uppercase tracking-wider transition-colors touch-manipulation font-bold ${
                        isConsoleCurrentlyOpen 
                          ? 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600'
                          : 'bg-green-900/40 border-green-800/50 text-green-200 active:bg-green-800'
                      }`}
                    >
                      {isConsoleCurrentlyOpen ? (uiStrings.controls?.btn_hide_radio || "Спрятать") : strings.btn_use}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ToastContainer toasts={toasts} variant="fixed-bottom" isAbsolute={true} />
    </div>
  );
};

export default InventoryModal;
