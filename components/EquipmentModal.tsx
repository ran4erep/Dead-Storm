
import React, { useState } from 'react';
import { Item, GameStrings, PlayerEquipment, EquipSlot, Settings, ACCESSORY_TYPES } from '../types';
import { User, X, Footprints, Skull, Shirt, Shield, Info, ChevronLeft, Crosshair, Ruler, Pill, Package, Hand, Flame, Gem, Zap, Eye, Plus, Weight } from 'lucide-react';
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

// Custom Diamond Icon
const DiamondIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 503.607 503.607" 
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <g transform="translate(1 1)">
            <path d="M208.836,258.357c-5.036,0-8.393,3.357-8.393,8.393s3.357,8.393,8.393,8.393h83.934c5.036,0,8.393-3.357,8.393-8.393 s-3.357-8.393-8.393-8.393H208.836z"/>
            <path d="M292.77,308.718h-83.934c-5.036,0-8.393,3.357-8.393,8.393c0,5.036,3.357,8.393,8.393,8.393h83.934 c5.036,0,8.393-3.357,8.393-8.393C301.164,312.075,297.807,308.718,292.77,308.718z"/>
            <path d="M292.77,359.079h-83.934c-5.036,0-8.393,3.357-8.393,8.393s3.357,8.393,8.393,8.393h83.934 c5.036,0,8.393-3.357,8.393-8.393S297.807,359.079,292.77,359.079z"/>
            <path d="M292.77,409.439h-83.934c-5.036,0-8.393,3.357-8.393,8.393s3.357,8.393,8.393,8.393h83.934 c5.036,0,8.393-3.357,8.393-8.393S297.807,409.439,292.77,409.439z"/>
            <path d="M451.407,6.554c-9.233-10.072-25.18-10.072-35.252,0l-23.502,23.502c-7.849,7.195-9.58,18.466-5.196,27.858L373.371,72 c-9.068-4.552-20.634-2.868-28.561,5.06l-23.502,23.502c-8.006,7.339-9.641,18.919-4.919,28.42l-15.284,15.284 c-9.134-3.722-20.587-2.076-27.639,4.977l-22.243,22.243l-23.082-23.082c-7.339-8.006-18.919-9.641-28.42-4.919l-14.363-14.363 c4.552-9.068,2.868-20.634-5.059-28.561l-23.502-23.502c-7.369-8.039-19.013-9.654-28.536-4.861l-14.187-13.697 c4.479-9.051,2.773-20.552-5.12-28.445L85.452,6.554c-9.233-10.072-25.18-10.072-35.252,0c-10.072,9.233-10.072,25.18,0,35.253 l23.502,23.502c5.036,5.036,11.751,7.554,17.626,7.554c3.862,0,7.722-0.838,11.106-2.504l13.991,13.508 c-4.479,9.051-2.773,20.552,5.12,28.445l23.502,23.502c5.036,5.036,10.911,7.554,17.626,7.554c3.907,0,7.81-0.576,11.221-2.209 l13.936,13.936c-4.552,9.068-2.868,20.634,5.06,28.561l0.324,0.324c-5.683,1.967-11.113,4.046-16.272,6.391l-9.233,4.197 c-10.911,5.036-17.626,15.948-17.626,27.698v231.659c0,11.751,6.715,22.662,17.626,27.698l10.072,5.036 c23.502,10.911,47.843,15.948,73.023,15.948c25.18,0,49.521-5.875,73.862-15.108l10.072-5.036 c10.911-5.036,17.626-15.948,17.626-27.698V222.266c0-11.751-6.715-22.662-17.626-27.698l-9.233-4.197 c-5.277-2.45-10.686-4.588-16.188-6.455c7.508-7.385,8.931-18.665,4.27-27.941l14.58-15.12c3.311,1.671,6.899,2.512,10.767,2.512 c6.715,0,12.59-1.679,17.626-7.554l23.502-23.502c5.036-4.197,7.554-10.911,7.554-17.626c0-3.907-0.859-7.527-2.564-10.866 l13.809-13.809c3.49,1.898,7.294,2.852,11.417,2.852c5.875,0,12.59-2.518,17.626-7.554l23.502-23.502 c5.036-4.197,7.554-10.911,7.554-17.626C458.961,17.466,456.443,11.59,451.407,6.554z M216.39,160.154l23.502,23.502 c1.679,1.679,2.518,3.357,2.518,5.875c0,2.518-0.839,4.197-2.518,5.875c-1.567,1.567-3.499,2.392-5.456,2.497 c-1.957-0.105-3.889-0.93-5.456-2.497l-13.43-13.43c-0.864-0.864-1.83-1.516-2.824-1.984l-8.088-8.088 c-3.357-3.357-3.357-8.393,0-11.751c1.679-1.679,3.357-2.518,5.875-2.518C212.193,157.636,214.711,158.475,216.39,160.154z M85.452,52.718L61.951,29.216c-3.357-3.357-3.357-8.393,0-11.751c1.679-1.679,3.357-2.518,5.875-2.518 c2.518,0,4.197,0.839,5.875,2.518l23.502,23.502c3.357,3.357,3.357,8.393,0,11.751C93.846,56.075,88.81,56.075,85.452,52.718z M156.797,124.062l-23.502-23.502c-3.357-3.357-3.357-8.393,0-11.751c1.679-1.679,3.357-2.518,5.875-2.518 c1.679,0,4.197,0.839,5.875,2.518l23.502,23.502c3.357,3.357,3.357,8.393,0,11.751C165.19,127.42,160.154,127.42,156.797,124.062 z M326.344,209.675c4.197,2.518,7.554,7.554,7.554,12.59v233.338c0,5.875-2.518,10.072-7.554,12.59l-10.072,5.036 c-41.967,19.305-89.81,19.305-131.777,0l-10.072-5.036c-4.197-2.518-7.554-7.554-7.554-12.59V223.105 c0-5.875,2.518-10.072,7.554-12.59l9.233-4.197c7.554-3.357,15.108-5.875,22.662-8.393l10.072,10.072 c9.233,10.072,25.18,10.072,35.252,0c4.99-4.159,6.683-9.966,7.53-15.788c10.96,0.469,21.443,2.083,31.919,4.876 c0,0,0.423,0,0.966,0c8.87,2.344,17.553,5.442,25.893,9.233L326.344,209.675z M270.689,175.521l15.367-15.367 c2.719-2.719,6.54-3.235,9.678-1.549c0.344,0.543,0.75,1.065,1.234,1.549c0.688,0.688,1.379,1.227,2.124,1.633 c1.986,3.215,1.564,7.269-1.285,10.118l-6.893,6.893C284.248,177.332,277.493,176.242,270.689,175.521z M368.311,100.561 l-23.502,23.502c-3.357,3.357-8.393,3.357-11.751,0c-3.357-3.357-3.357-8.393,0-11.751l23.502-23.502 c1.679-1.679,3.357-2.518,5.875-2.518c2.518,0,4.197,0.839,5.875,2.518c1.679,1.679,2.518,3.357,2.518,5.875 C370.829,97.203,369.99,98.882,368.311,100.561z M439.656,29.216l-23.502,23.502c-3.357,3.357-8.393,3.357-11.751,0 c-3.357-3.357-3.357-8.393,0-11.751l23.502-23.502c1.679-1.679,3.357-2.518,5.875-2.518c2.518,0,4.197,0.839,5.875,2.518 c1.679,1.679,2.518,3.357,2.518,5.875C442.174,25.859,441.334,27.538,439.656,29.216z"/>
        </g>
    </svg>
);

// Custom Pants Icon
const PantsIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 512.002 512.002" 
        className={className}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="m423.2 323.873-6.516-119.823c-.3-5.515-5.04-9.752-10.528-9.442l-3.777.205c-3.237-55.448-5.847-97.68-8.658-140.141v-44.672c0-5.523-4.477-10-10-10h-255.439c-5.523 0-10 4.477-10 10v44.671c-2.807 42.396-5.417 84.625-8.659 140.142l-3.777-.205c-5.514-.298-10.228 3.928-10.528 9.442l-6.516 119.823c-.144 2.648.77 5.245 2.541 7.22s4.253 3.165 6.901 3.309l3.356.182c-1.667 29.091-3.482 60.458-5.498 93.948-.851 14.135 3.867 25.874 13.385 33.662v39.808c0 5.523 4.477 10 10 10h78.596c5.523 0 10-4.477 10-10v-38.145c11.842-5.888 19.59-17.342 21.651-32.432l26.267-192.172 26.266 192.172c2.062 15.09 9.81 26.543 21.652 32.432v38.145c0 5.523 4.477 10 10 10h78.597c5.523 0 10-4.477 10-10v-39.808c9.518-7.788 14.235-19.527 13.384-33.662-2.021-33.594-3.834-64.928-5.497-93.948l3.355-.182c2.648-.144 5.131-1.334 6.901-3.309 1.771-1.975 2.685-4.572 2.541-7.22zm-65.884-106.58 39.941-2.172 1.354 24.897-39.941 2.172zm42.38 42.696 2.99 54.985-19.97 1.085c-5.303.294-10.42-1.526-14.416-5.108-3.994-3.583-6.353-8.475-6.641-13.776l-1.904-35.015zm-25.338-194.989c1.269 19.348 2.508 38.848 3.796 59.772-31.871-2.618-57.798-27.521-62.33-59.772zm-.638-20h-107.719v-25h107.719zm-235.438-25h107.719v25h-107.719zm-.638 45h58.533c-4.531 32.251-30.459 57.154-62.33 59.772 1.29-20.939 2.53-40.438 3.797-59.772zm-28.328 249.974 2.99-54.985 39.941 2.172-1.904 35.014c-.288 5.301-2.647 10.193-6.641 13.776-3.995 3.583-9.115 5.398-14.415 5.108zm44.016-72.784-39.941-2.172 1.354-24.897 39.941 2.172zm34.751 249.812h-58.596v-25h58.596zm21.836-63.284c-1.317 9.637-5.79 15.781-13.302 18.284h-74.132c-3.494-2.667-7.011-7.421-6.419-17.268 2.018-33.537 3.836-64.942 5.505-94.064l6.629.36c10.568.587 20.896-3.036 28.854-10.189 7.972-7.149 12.68-16.943 13.259-27.579l4.887-89.868c.3-5.515-3.928-10.229-9.442-10.528l-36.163-1.966c1.068-18.284 2.067-35.125 3.027-51.005 43.412-2.132 78.923-36.085 83.711-79.894h29.67v99.733zm172.596 63.284h-58.597v-25h58.597zm13.421-62.269c.592 9.848-2.925 14.601-6.419 17.268h-74.132c-7.512-2.502-11.985-8.647-13.302-18.284l-36.082-263.984v-99.733h29.669c4.788 43.809 40.299 77.761 83.711 79.894.96 15.885 1.959 32.726 3.026 51.005l-36.164 1.967c-2.648.144-5.131 1.334-6.902 3.309s-2.685 4.571-2.541 7.22l4.887 89.868c.578 10.635 5.287 20.43 13.258 27.579 7.958 7.154 18.287 10.777 28.854 10.189l6.629-.36c1.668 29.051 3.483 60.422 5.508 94.062z"/>
    </svg>
);

interface EquipmentModalProps {
  items: Item[];
  equipment: PlayerEquipment;
  strings: GameStrings['equipment'];
  spriteMap: Map<string, HTMLImageElement>;
  currentLoad: number;
  maxCapacity: number;
  language: Settings['language'];
  characterId: 'male' | 'female';
  onEquip: (item: Item, onFeedback?: (msg: string) => void) => void;
  onUnequip: (item: Item, onFeedback?: (msg: string) => void) => void;
  onThrow: (item: Item, count?: number) => void;
  onClose: () => void;
  onUnload?: (item: Item, onFeedback?: (msg: string) => void) => void;
  onExtractBattery?: (item: Item, onFeedback?: (msg: string) => void, selectedBatteryId?: string) => void;
}

const EquipmentModal: React.FC<EquipmentModalProps> = ({ 
  items, 
  equipment, 
  strings, 
  spriteMap, 
  currentLoad, 
  maxCapacity,
  language,
  characterId,
  onEquip, 
  onUnequip,
  onThrow,
  onClose,
  onUnload,
  onExtractBattery
}) => {
  const [inspectItem, setInspectItem] = useState<Item | null>(null);
  const [accessorySelectModal, setAccessorySelectModal] = useState<Item | null>(null);
  const [batterySelectTarget, setBatterySelectTarget] = useState<Item | null>(null);
  const [activeFilter, setActiveFilter] = useState<'WEAPON' | 'ARMOR' | 'ACCESSORY' | null>(null);
  const { toasts, showToast } = useToast();

  const getPowerSourceAssetId = (powerSourceKey: string | undefined): string => {
    if (!powerSourceKey) return 'BATTERY';
    const found = items.find(i => (i.definitionId || i.id || '').toLowerCase() === powerSourceKey.toLowerCase());
    if (found && found.assetId) return found.assetId;
    return powerSourceKey.toUpperCase();
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (accessorySelectModal) {
          setAccessorySelectModal(null);
          e.stopPropagation();
          e.preventDefault();
        } else if (batterySelectTarget) {
          setBatterySelectTarget(null);
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
  }, [inspectItem, accessorySelectModal, batterySelectTarget]);
  
  const equippedItems = Object.values(equipment).filter(i => i) as Item[];
  
  // Create a map of how many of each item ID are equipped
  const equippedCounts = equippedItems.reduce((acc, item) => {
      acc[item.id] = (acc[item.id] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);

  // Track how many of each item ID we've seen in the inventory list so far
  const seenCounts: Record<string, number> = {};

  const handleEquipClick = (item: Item) => {
      // Check if item is accessory and both slots are empty
      if (item.equip === 'ACCESSORY' && !equipment.accessory1 && !equipment.accessory2) {
          setAccessorySelectModal(item);
      } else {
          onEquip(item, showToast);
      }
  };

  const handleSlotSelect = (slot: 'accessory1' | 'accessory2') => {
      if (accessorySelectModal) {
          // Create a copy of the item with the specific slot assigned
          const itemWithSlot = { ...accessorySelectModal, slot };
          onEquip(itemWithSlot, showToast);
          setAccessorySelectModal(null);
          setInspectItem(null); // Also close inspect if open
      }
  };
  
  const equippableItems = items.filter(i => {
      const isGear = i.equip && i.equip !== 'NONE';
      if (!isGear) return false;
      
      seenCounts[i.id] = (seenCounts[i.id] || 0) + 1;
      const isEquipped = seenCounts[i.id] <= (equippedCounts[i.id] || 0);
      
      if (isEquipped) return false;
      
      if (activeFilter) {
          if (activeFilter === 'ACCESSORY') {
              return i.equip === 'ACCESSORY';
          }
          if (activeFilter === 'WEAPON') {
              return i.equip === 'WEAPON';
          }
          if (activeFilter === 'ARMOR') {
              return i.equip === 'HEAD' || i.equip === 'BODY' || i.equip === 'LEGS' || i.equip === 'FEET';
          }
      }
      return true;
  });
  
  const isFull = currentLoad >= maxCapacity;

  const totalArmor = React.useMemo(() => {
      let total = 0;
      if (equipment.helmet) total += equipment.helmet.protection || 0;
      if (equipment.vest) total += equipment.vest.protection || 0;
      if (equipment.pants) total += equipment.pants.protection || 0;
      if (equipment.boots) total += equipment.boots.protection || 0;
      if (equipment.accessory1) total += equipment.accessory1.protection || 0;
      if (equipment.accessory2) total += equipment.accessory2.protection || 0;
      return total;
  }, [equipment]);

  const getAmmoCount = (ammoType: string | undefined) => {
      if (!ammoType) return 0;
      return items.reduce((acc, i) => {
          if (i.type === 'AMMO' && i.ammoType === ammoType) {
              return acc + (i.count || 0);
          }
          return acc;
      }, 0);
  };

  const getSlotString = (count: number) => {
      if (language === 'en') return "SLOT";
      const lastDigit = count % 10;
      const lastTwoDigits = count % 100;
      if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "СЛОТОВ";
      if (lastDigit === 1) return "СЛОТ";
      if (lastDigit >= 2 && lastDigit <= 4) return "СЛОТА";
      return "СЛОТОВ";
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
    return <WeaponIcon className={`${className} text-red-400 ${isBroken ? 'grayscale opacity-50' : ''}`} />;
  };

  const equippedLayers = Object.values(equipment)
    .filter((item): item is Item => item !== null)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

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

  const slots: { id: EquipSlot; label: string; icon: any }[] = [
    { id: 'accessory1', label: strings.accessory1, icon: DiamondIcon },
    { id: 'accessory2', label: strings.accessory2, icon: DiamondIcon },
    { id: 'helmet', label: strings.helmet, icon: Skull },
    { id: 'vest', label: strings.vest, icon: Shirt },
    { id: 'weapon', label: strings.primary_weapon, icon: WeaponIcon },
    { id: 'pants', label: strings.pants, icon: PantsIcon },
    { id: 'boots', label: strings.boots, icon: Footprints },
  ];

  const renderAccessoryModal = () => {
      if (!accessorySelectModal) return null;
      return (
        <div id="accessory-select-modal-container" className="absolute inset-0 z-[110] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-600 w-full max-w-xs rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-3 border-b border-gray-700 bg-gray-900 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest">{strings.select_slot_title || "SELECT SLOT"}</h3>
                    <button onClick={() => setAccessorySelectModal(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                </div>
                <div className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-center mb-2">
                        <div className="w-16 h-16 bg-gray-900 rounded-full border border-gray-700 flex items-center justify-center">
                            {renderIcon(accessorySelectModal, "w-10 h-10")}
                        </div>
                    </div>
                    <p className="text-center text-xs text-gray-400 mb-2 uppercase font-bold">{accessorySelectModal.name}</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => handleSlotSelect('accessory1')}
                            className="flex flex-col items-center gap-2 p-3 bg-gray-900/50 border border-gray-700 rounded hover:bg-gray-700 hover:border-yellow-500/50 active:bg-gray-600 transition-all group"
                        >
                            <div className="w-8 h-8 bg-black/50 rounded flex items-center justify-center border border-gray-700 group-hover:border-yellow-500/50">
                                <DiamondIcon size={16} className="text-gray-500 group-hover:text-yellow-400" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300 group-hover:text-white">{strings.slot_1 || "SLOT 1"}</span>
                        </button>

                        <button 
                            onClick={() => handleSlotSelect('accessory2')}
                            className="flex flex-col items-center gap-2 p-3 bg-gray-900/50 border border-gray-700 rounded hover:bg-gray-700 hover:border-yellow-500/50 active:bg-gray-600 transition-all group"
                        >
                            <div className="w-8 h-8 bg-black/50 rounded flex items-center justify-center border border-gray-700 group-hover:border-yellow-500/50">
                                <DiamondIcon size={16} className="text-gray-500 group-hover:text-yellow-400" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300 group-hover:text-white">{strings.slot_2 || "SLOT 2"}</span>
                        </button>
                    </div>

                    <button 
                        onClick={() => setAccessorySelectModal(null)}
                        className="mt-2 w-full py-2 bg-red-900/20 border border-red-800/30 text-red-400 text-xs font-bold uppercase tracking-widest rounded hover:bg-red-900/40 active:bg-red-900/60 transition-colors"
                    >
                        {strings.cancel || "CANCEL"}
                    </button>
                </div>
            </div>
        </div>
      );
  };

  if (inspectItem) {
    const isEquipped = Object.values(equipment).some(e => (e as Item | null)?.id === inspectItem.id);
    
    // Find the LIVE version of the item to get real-time ammo updates
    // It could be in equipment or in inventory items (if unequipped just now)
    const liveItem = (Object.values(equipment) as (Item | null)[]).find(i => i?.id === inspectItem.id) || items.find(i => i.id === inspectItem.id) || inspectItem;

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
    if (liveItem.damageDice) stats.push({ label: strings.damage_full, value: liveItem.damageDice, icon: <WeaponIcon size={14} />, color: "text-red-400" });
    
    if ((liveItem.type === 'GRENADE' || liveItem.type === 'FLASHBANG') && liveItem.damageDice) {
        stats.push({ label: "BLAST", value: liveItem.damageDice, icon: <Flame size={14} />, color: "text-orange-500" });
    } 
    
    if (liveItem.throwDamage && liveItem.throwDamage !== "0") {
        stats.push({ label: strings.throw_damage_short, value: liveItem.throwDamage, icon: <Hand size={14} />, color: "text-red-500" });
    }

    if (liveItem.type === 'WEAPON' && liveItem.accuracy !== undefined) stats.push({ label: strings.accuracy, value: liveItem.accuracy, icon: <Crosshair size={14} />, color: "text-cyan-400" });
    if (liveItem.type === 'WEAPON' && liveItem.range !== undefined) stats.push({ label: strings.range, value: `${liveItem.range}m`, icon: <Ruler size={14} />, color: "text-yellow-400" });
    
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

    if (liveItem.protection !== undefined) stats.push({ label: strings.protection_full, value: `+${liveItem.protection}`, icon: <Shield size={14} />, color: "text-yellow-500" });
    if (liveItem.inventorySlots) stats.push({ label: strings.capacity, value: `+${liveItem.inventorySlots}`, icon: <Package size={14} />, color: "text-cyan-400" });

    if (liveItem.powerSource && liveItem.currentAmmo !== undefined && liveItem.magazineMax !== undefined) {
        stats.push({
            label: strings.charge_label || "CHARGE",
            value: `${Math.round((liveItem.currentAmmo / liveItem.magazineMax) * 100)}%`,
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
      <div id="item-inspect-modal-container" className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300">
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
                         <img 
                            src={spriteMap.get(getPowerSourceAssetId(liveItem.powerSource))?.src} 
                            crossOrigin="anonymous"
                            alt="Battery" 
                            className="w-7 h-7 object-contain drop-shadow-md" 
                            style={{ imageRendering: 'pixelated' }}
                            decoding="sync"
                         />
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

              <div className="w-full bg-black/20 p-2 rounded border border-gray-700/50 mb-4">
                  <p className="text-xs text-gray-300 italic text-center leading-relaxed">
                    "{liveItem.description}"
                  </p>
              </div>

              <div className="w-full flex gap-2">
                  <button 
                    onClick={() => { 
                        if (isEquipped) onUnequip(liveItem, showToast); 
                        else handleEquipClick(liveItem);
                        if (liveItem.equip !== 'ACCESSORY' || (equipment.accessory1 || equipment.accessory2)) {
                            setInspectItem(null); 
                        }
                    }}
                    className={`flex-1 py-3 border font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all ${isEquipped ? 'bg-gray-700 border-gray-600 text-gray-300 active:bg-gray-600' : 'bg-yellow-900/40 border-yellow-800/50 text-yellow-300 active:bg-yellow-800'}`}
                  >
                    {isEquipped ? strings.btn_unequip : strings.btn_equip}
                  </button>
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
                  {!liveItem.cannotDrop && (
                    <button 
                      onClick={() => { onThrow(liveItem); setInspectItem(null); }}
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
                      <p className="text-[10px] text-yellow-450 uppercase tracking-wider font-bold animate-pulse">
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
                              <img 
                                src={spriteMap.get(getPowerSourceAssetId(batterySelectTarget?.powerSource || 'battery'))?.src} 
                                crossOrigin="anonymous" 
                                alt="Battery" 
                                className="w-6 h-6 object-contain" 
                                style={{ imageRendering: 'pixelated' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-gray-200 uppercase truncate">{bat.name}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Zap size={10} className="text-yellow-400 animate-pulse" />
                                <span className="text-[10px] text-yellow-400 font-bold">{batteryCharge}%</span>
                              </div>
                            </div>
                            <div className="ml-2 text-[10px] font-bold text-yellow-400 bg-yellow-955/30 px-2 py-0.5 rounded border border-yellow-800/60 uppercase hover:bg-yellow-900/40">
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
        {renderAccessoryModal()}
      </div>
    );
  }

  const dollAssetId = characterId === 'female' ? 'FEMALE_DOLL' : 'MALE_DOLL';
  const dollImg = spriteMap.get(dollAssetId);

  return (
    <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300">
      <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col h-full max-h-[85vh] shadow-2xl overflow-hidden relative">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <User size={18} className="text-yellow-400" />
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
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-800/95 relative">
          <div className="relative w-full aspect-[16/9] bg-black/40 flex items-center justify-center border-b border-gray-800 shrink-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(234,179,8,0.1)_0%,transparent_70%)] animate-pulse"></div>
            <div className="absolute bottom-2 left-2 bg-black/95 border border-yellow-900/50 rounded px-2 py-1 flex items-center gap-1.5 shadow-lg z-20">
               <Shield size={12} className="text-yellow-500" />
               <div className="flex flex-col items-center justify-center">
                   <span className="text-[7px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-0.5">{strings.total_armor}</span>
                   <span className="text-xs font-['Jura'] font-bold text-yellow-400 leading-none">{totalArmor}</span>
               </div>
            </div>
            {dollImg && (
              <img 
                src={dollImg.src} 
                crossOrigin="anonymous"
                alt="Character" 
                className="absolute h-[90%] w-auto object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] z-0"
                style={{ imageRendering: 'pixelated' }}
                decoding="sync"
              />
            )}
            {equippedLayers.map((item) => {
              if (!item.dollAssetId) return null;
              const img = spriteMap.get(item.dollAssetId);
              if (!img) return null;
              
              let xOffset = 0;
              let yOffset = 0;
              if (characterId === 'male') {
                  xOffset = item.maleOffsetX || 0;
                  yOffset = item.maleOffsetY || 0;
              } else {
                  xOffset = item.femaleOffsetX || 0;
                  yOffset = item.femaleOffsetY || 0;
              }
              const transformStyle = (xOffset !== 0 || yOffset !== 0) ? `translate(${xOffset}px, ${yOffset}px)` : 'none';

              return (
                <img 
                    key={item.id} 
                    src={img.src} 
                    crossOrigin="anonymous"
                    alt={item.name} 
                    className="absolute h-[90%] w-auto object-contain pointer-events-none" 
                    style={{ 
                        imageRendering: 'pixelated', 
                        zIndex: item.zIndex || 1,
                        transform: transformStyle
                    }}
                    decoding="sync"
                />
              );
            })}
            <div className="absolute left-4 top-2 bottom-12 flex flex-col justify-center gap-2">
               {/* Accessories Row */}
               <div className="flex gap-2 mb-2">
                   {slots.slice(0, 2).map(slot => (
                     <div 
                        key={slot.id} 
                        onClick={() => equipment[slot.id] && setInspectItem(equipment[slot.id])}
                        className={`w-10 h-10 bg-black/50 border rounded flex items-center justify-center relative group transition-all cursor-pointer ${equipment[slot.id] ? 'border-yellow-500/50 active:scale-95' : 'border-gray-700'}`}
                     >
                        {renderDurabilityBar(equipment[slot.id])}
                        {equipment[slot.id] ? renderIcon(equipment[slot.id]!, "w-7 h-7") : <slot.icon size={16} className="text-gray-700" />}
                        {equipment[slot.id]?.powerSource && equipment[slot.id]?.currentAmmo !== undefined && equipment[slot.id]?.magazineMax !== undefined && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                                <Zap size={6} className="text-yellow-400" />
                                <span>{Math.round((equipment[slot.id]!.currentAmmo! / equipment[slot.id]!.magazineMax!) * 100)}%</span>
                            </div>
                        )}
                     </div>
                   ))}
               </div>

               {slots.slice(2, 4).map(slot => (
                 <div 
                    key={slot.id} 
                    onClick={() => equipment[slot.id] && setInspectItem(equipment[slot.id])}
                    className={`w-10 h-10 bg-black/50 border rounded flex items-center justify-center relative group transition-all cursor-pointer ${equipment[slot.id] ? 'border-yellow-500/50 active:scale-95' : 'border-gray-700'}`}
                 >
                    {renderDurabilityBar(equipment[slot.id])}
                    {equipment[slot.id] ? renderIcon(equipment[slot.id]!, "w-7 h-7") : <slot.icon size={16} className="text-gray-700" />}
                    {equipment[slot.id]?.powerSource && equipment[slot.id]?.currentAmmo !== undefined && equipment[slot.id]?.magazineMax !== undefined && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                            <Zap size={6} className="text-yellow-400" />
                            <span>{Math.round((equipment[slot.id]!.currentAmmo! / equipment[slot.id]!.magazineMax!) * 100)}%</span>
                        </div>
                    )}
                 </div>
               ))}
            </div>
            <div className="absolute right-4 top-2 bottom-2 flex flex-col justify-center gap-2 items-end">
               <div className="flex gap-2">
                 {equipment.weaponAkimbo && (
                   <div 
                      onClick={() => setInspectItem(equipment.weaponAkimbo!)}
                      className="w-10 h-10 bg-black/50 border rounded flex items-center justify-center relative group transition-all cursor-pointer border-yellow-500/50 active:scale-95"
                   >
                      {renderDurabilityBar(equipment.weaponAkimbo)}
                      {renderIcon(equipment.weaponAkimbo, "w-7 h-7")}
                      {equipment.weaponAkimbo.currentAmmo !== undefined && (
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                              <BulletIcon size={6} className="text-gray-500" />
                              <span>{equipment.weaponAkimbo.currentAmmo}/{getAmmoCount(equipment.weaponAkimbo.ammoType)}</span>
                          </div>
                      )}
                   </div>
                 )}
                 <div 
                    onClick={() => equipment.weapon && setInspectItem(equipment.weapon)}
                    className={`w-10 h-10 bg-black/50 border rounded flex items-center justify-center relative group transition-all cursor-pointer ${equipment.weapon ? 'border-yellow-500/50 active:scale-95' : 'border-gray-700'}`}
                 >
                    {renderDurabilityBar(equipment.weapon)}
                    {equipment.weapon ? renderIcon(equipment.weapon, "w-7 h-7") : <WeaponIcon size={16} className="text-gray-700" />}
                    {equipment.weapon && equipment.weapon.currentAmmo !== undefined && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                            <BulletIcon size={6} className="text-gray-500" />
                            <span>{equipment.weapon.currentAmmo}/{getAmmoCount(equipment.weapon.ammoType)}</span>
                        </div>
                    )}
                 </div>
               </div>
               
               {slots.slice(5).map(slot => (
                 <div 
                    key={slot.id} 
                    onClick={() => equipment[slot.id] && setInspectItem(equipment[slot.id])}
                    className={`w-10 h-10 bg-black/50 border rounded flex items-center justify-center relative group transition-all cursor-pointer ${equipment[slot.id] ? 'border-yellow-500/50 active:scale-95' : 'border-gray-700'}`}
                 >
                    {renderDurabilityBar(equipment[slot.id])}
                    {equipment[slot.id] ? renderIcon(equipment[slot.id]!, "w-7 h-7") : <slot.icon size={16} className="text-gray-700" />}
                    {equipment[slot.id]?.powerSource && equipment[slot.id]?.currentAmmo !== undefined && equipment[slot.id]?.magazineMax !== undefined && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1 py-px bg-gray-950 text-gray-300 text-[8px] font-['Jura'] font-bold rounded-sm border border-gray-700 flex items-center gap-0.5 shadow-sm z-10 whitespace-nowrap min-w-max">
                            <Zap size={6} className="text-yellow-400" />
                            <span>{Math.round((equipment[slot.id]!.currentAmmo! / equipment[slot.id]!.magazineMax!) * 100)}%</span>
                        </div>
                    )}
                 </div>
               ))}
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-3">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em]">{strings.available_gear}</h3>
                    <div className="flex gap-2 shrink-0">
                        <button 
                            onClick={() => setActiveFilter(prev => prev === 'WEAPON' ? null : 'WEAPON')}
                            className={`px-2 py-1 flex items-center justify-center gap-1 border rounded text-[9px] font-bold uppercase tracking-wider transition-all ${activeFilter === 'WEAPON' ? 'bg-gray-700 text-white border-gray-500' : 'bg-gray-900/40 text-gray-500 border-gray-700 hover:bg-gray-800'}`}
                        >
                            <WeaponIcon size={10} />
                            {strings.primary_weapon}
                        </button>
                        <button 
                            onClick={() => setActiveFilter(prev => prev === 'ARMOR' ? null : 'ARMOR')}
                            className={`px-2 py-1 flex items-center justify-center gap-1 border rounded text-[9px] font-bold uppercase tracking-wider transition-all ${activeFilter === 'ARMOR' ? 'bg-gray-700 text-white border-gray-500' : 'bg-gray-900/40 text-gray-500 border-gray-700 hover:bg-gray-800'}`}
                        >
                            <Shield size={10} />
                            {strings.protection_full}
                        </button>
                        <button 
                            onClick={() => setActiveFilter(prev => prev === 'ACCESSORY' ? null : 'ACCESSORY')}
                            className={`px-2 py-1 flex items-center justify-center gap-1 border rounded text-[9px] font-bold uppercase tracking-wider transition-all ${activeFilter === 'ACCESSORY' ? 'bg-gray-700 text-white border-gray-500' : 'bg-gray-900/40 text-gray-500 border-gray-700 hover:bg-gray-800'}`}
                        >
                            <DiamondIcon size={10} />
                            {strings.accessory_filter || "OTHER"}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {equippableItems.length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-gray-800 rounded text-gray-600 text-xs italic">
                            {strings.no_items || "No items available"}
                        </div>
                    ) : (
                        equippableItems.map((item) => {
                            return (
                                <div key={item.id} className="w-full flex items-center p-1.5 bg-gray-900/50 border border-gray-700 rounded transition-all text-left">
                                    <div className="w-10 h-10 bg-black/20 rounded flex items-center justify-center mr-3 shrink-0 relative">
                                        {renderDurabilityBar(item)}
                                        {renderIcon(item, "w-7 h-7")}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-bold text-gray-300 uppercase truncate">{item.name}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="text-[9px] text-gray-500 font-['Jura']">
                                              {item.type === 'WEAPON' 
                                                ? `${item.damageDice} ${strings.damage_full}` 
                                                : item.protection !== undefined 
                                                    ? `+${item.protection} ${strings.protection_full}`
                                                    : item.description}
                                            </div>
                                            {item.inventorySlots && item.inventorySlots > 0 && <div className="text-[9px] text-cyan-500 font-['Jura']">+{item.inventorySlots} {getSlotString(item.inventorySlots)}</div>}
                                            {item.type === 'WEAPON' && item.currentAmmo !== undefined && (
                                                <div className="flex items-center gap-1 bg-gray-950 border border-gray-700 px-1.5 py-0.5 rounded text-[9px] text-gray-400 font-['Jura']">
                                                    <BulletIcon size={8} className="text-gray-500" />
                                                    <span>{item.currentAmmo}/{getAmmoCount(item.ammoType)}</span>
                                                </div>
                                            )}
                                            {item.powerSource && item.currentAmmo !== undefined && item.magazineMax !== undefined && (
                                                <div className="flex items-center gap-1 bg-gray-950 border border-gray-700 px-1.5 py-0.5 rounded text-[9px] text-yellow-400 font-['Jura'] font-bold">
                                                    <Zap size={8} />
                                                    <span>{Math.round((item.currentAmmo / item.magazineMax) * 100)}%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-row items-center gap-1.5 ml-2">
                                        <button onClick={() => setInspectItem(item)} className="p-1.5 bg-gray-700/50 text-gray-300 rounded active:bg-gray-600 border border-gray-600/50 transition-colors touch-manipulation flex items-center justify-center"><Info size={14} /></button>
                                        <button onClick={() => handleEquipClick(item)} className="px-3 py-1.5 text-[9px] rounded border font-bold uppercase tracking-wider transition-colors touch-manipulation bg-yellow-900/40 border-yellow-800/50 text-yellow-300 active:bg-yellow-800">{strings.btn_equip}</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
              </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} variant="fixed-bottom" isAbsolute={true} />

      {/* Accessory Slot Selection Modal */}
      {renderAccessoryModal()}
    </div>
  );
};

export default EquipmentModal;
