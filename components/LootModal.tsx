
import React, { useMemo } from 'react';
import { Package, X, Pill, Key, Shield } from 'lucide-react';
import { WeaponIcon } from './WeaponIcon';
import { Item, GameStrings } from '../types';
import { BulletIcon } from './CombatOverlay';

// Helper to match icons like in Inventory
const ItemIcon = ({ item, spriteMap, size = 32 }: { item: Item, spriteMap: Map<string, HTMLImageElement>, size?: number }) => {
  const img = spriteMap.get(item.assetId);
  if (img) {
    return (
      <img 
        src={img.src} 
        crossOrigin="anonymous"
        alt={item.name} 
        className="object-contain drop-shadow-md" 
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
        decoding="sync"
      />
    );
  }

  const iconProps = { size, className: "text-gray-400 group-active:text-white transition-colors" };
  switch(item.type) {
    case 'WEAPON': return <WeaponIcon {...iconProps} />;
    case 'ARMOR': return <Shield {...iconProps} />;
    case 'CONSUMABLE': return <Pill {...iconProps} />;
    case 'KEY': return <Key {...iconProps} />;
    default: return <Package {...iconProps} />;
  }
};

interface LootModalProps {
  items: Item[];
  strings: GameStrings;
  spriteMap: Map<string, HTMLImageElement>;
  isContainer?: boolean;
  containerName?: string;
  onPickUp: (item: Item) => void;
  onClose: () => void;
}

const LootModal: React.FC<LootModalProps> = ({
  items,
  strings,
  spriteMap,
  isContainer,
  containerName,
  onPickUp,
  onClose
}) => {
  const gridCols = items.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

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

  return (
    <div 
      className="absolute inset-0 z-[110] bg-transparent flex flex-col justify-end items-center p-4 pb-36 transition-all duration-300 pointer-events-auto font-['Jura']"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900/95 border border-gray-700 w-full max-w-md rounded-lg flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-black/40 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-yellow-500" />
            <h2 className="text-sm font-bold text-gray-200 tracking-widest uppercase">
              {containerName ? containerName : strings.inventory.loot_title}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 active:text-white transition-colors flex items-center gap-1 touch-manipulation p-1 gamepad-hide-buttons">
             <X size={20} />
          </button>
        </div>

        {/* Items Grid */}
        <div className="p-4 bg-gray-900/40 flex flex-col gap-3 max-h-[40vh] overflow-y-auto">
            {items.length === 0 ? (
                <div className="text-center text-gray-500 py-4 font-bold tracking-widest uppercase text-xs">
                    {isContainer && containerName && strings.inventory.container_empty
                        ? strings.inventory.container_empty.replace('{name}', containerName)
                        : strings.inventory.empty}
                </div>
            ) : (
                <div className={`grid ${gridCols} gap-3`}>
                    {items.map((item, index) => (
                      <button 
                        key={`${item.id}-${index}`}
                        onClick={() => onPickUp(item)}
                        className="bg-gray-800/80 border border-gray-700 p-4 rounded flex flex-col items-center gap-2 transition-all group active:bg-cyan-900/40 active:border-cyan-500 hover:border-gray-500 relative"
                      >
                          {renderDurabilityBar(item)}
                          <ItemIcon item={item} spriteMap={spriteMap} />
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold text-gray-300 tracking-wider uppercase text-center leading-tight">
                                {item.name}
                            </span>
                            {(item.type === 'AMMO' || item.type === 'MATERIAL' || (item.count !== undefined && item.count > 1)) && (
                                <span className="text-[9px] text-gray-500 font-['Jura'] font-bold flex items-center gap-1">
                                    {item.type === 'AMMO' && <BulletIcon size={8} />}
                                    {item.type !== 'AMMO' && item.type !== 'MATERIAL' && 'x'}
                                    {item.count}
                                </span>
                            )}
                          </div>
                      </button>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default LootModal;
