import React, { useState, useEffect, useMemo } from 'react';
import { X, Save } from 'lucide-react';
import { GenericDataEditor } from './GenericDataEditor';
import { EnemyConstructor } from './EnemyConstructor';
import { NpcConstructor } from './NpcConstructor';
import { ItemConstructor } from './ItemConstructor';
import { DecorationConstructor } from './DecorationConstructor';

interface TweakEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  initialConfig: any;
  uiStrings: any;
  coordKey: string;
  listName?: string;
}

export const TweakEntityModal: React.FC<TweakEntityModalProps> = ({ 
  isOpen, onClose, onSave, initialConfig, uiStrings, coordKey, listName 
}) => {
  const [data, setData] = useState<any>(null);
  const [viewTab, setViewTab] = useState<'editor' | 'json'>('editor');

  useEffect(() => {
    if (isOpen) {
      setData(JSON.parse(JSON.stringify(initialConfig || {})));
      setViewTab('editor');
    }
  }, [isOpen, initialConfig]);

  const normalizedListName = useMemo(() => {
    return listName ? listName.toLowerCase() : '';
  }, [listName]);

  const hasConstructor = useMemo(() => {
    return ['enemies', 'npcs', 'items', 'decorations'].includes(normalizedListName);
  }, [normalizedListName]);

  const formattedListName = useMemo(() => {
    if (listName === 'NPCs') return 'NPC';
    if (normalizedListName === 'enemies') return 'Враг';
    if (normalizedListName === 'items') return 'Предмет';
    if (normalizedListName === 'decorations') return 'Декорация';
    return listName || '';
  }, [listName, normalizedListName]);

  if (!isOpen || !data) return null;

  const entityId = data.id || 'entity';

  // Оборачиваем конфигурацию одного экземпляра в структуру словаря, ожидаемую конструкторами
  const wrapperData = { [entityId]: data };

  const handleConstructorChange = (newData: Record<string, any>) => {
    const updated = newData[entityId];
    if (updated) {
      setData(updated);
    }
  };

  return (
    <div className="absolute inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[500] p-4 font-mono text-xs overflow-hidden">
      {/* Стили для автоматического скрытия сайдбара-списка в конструкторах при индивидуальной настройке */}
      <style>{`
        .tweak-compact-constructor > div > .lg\\:w-72 {
          display: none !important;
        }
      `}</style>

      <div className="bg-gray-900 border border-amber-600 rounded-lg w-full max-w-7xl h-[95dvh] flex flex-col shadow-2xl">
        {/* Компактная шапка модального окна */}
        <div className="py-2.5 px-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 shrink-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-sm font-bold text-amber-500 whitespace-nowrap">
                Настройка: {formattedListName}
              </h2>
              <span className="text-gray-400 text-[10px] truncate">
                ({coordKey})
              </span>
            </div>
            {hasConstructor && (
              <div className="flex bg-gray-950 p-0.5 rounded border border-gray-800 text-[10px] font-sans shrink-0">
                <button
                  onClick={() => setViewTab('editor')}
                  className={`px-2 py-0.5 rounded transition-all ${
                    viewTab === 'editor'
                      ? "bg-indigo-600 text-white font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Конструктор
                </button>
                <button
                  onClick={() => setViewTab('json')}
                  className={`px-2 py-0.5 rounded transition-all ${
                    viewTab === 'json'
                      ? "bg-indigo-600 text-white font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Редактор JSON
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition duration-200 ml-2 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Тело модального окна */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-950">
          {viewTab === 'editor' && hasConstructor ? (
            <div className="tweak-compact-constructor h-full">
              {normalizedListName === 'enemies' && (
                <EnemyConstructor key={`${coordKey}_${entityId}`} data={wrapperData} onChange={handleConstructorChange} uiStrings={uiStrings} />
              )}
              {normalizedListName === 'npcs' && (
                <NpcConstructor key={`${coordKey}_${entityId}`} data={wrapperData} onChange={handleConstructorChange} uiStrings={uiStrings} />
              )}
              {normalizedListName === 'items' && (
                <ItemConstructor key={`${coordKey}_${entityId}`} data={wrapperData} onChange={handleConstructorChange} uiStrings={uiStrings} />
              )}
              {normalizedListName === 'decorations' && (
                <DecorationConstructor key={`${coordKey}_${entityId}`} data={wrapperData} onChange={handleConstructorChange} uiStrings={uiStrings} />
              )}
            </div>
          ) : (
            <GenericDataEditor
              data={data}
              onChange={(newData) => setData(newData)}
              label="Entity Instance"
              rootLabel="EntityOverride"
              uiStrings={uiStrings}
            />
          )}
        </div>

        {/* Подвал */}
        <div className="py-2.5 px-4 border-t border-gray-700 flex justify-end gap-2 bg-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition duration-200"
          >
            {uiStrings.cancel || 'Отмена'}
          </button>
          <button
            onClick={() => onSave(data)}
            className="px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-500 transition duration-200 flex items-center gap-1.5 font-bold"
          >
            <Save size={14} />
            {uiStrings.save || 'Сохранить настройки'}
          </button>
        </div>
      </div>
    </div>
  );
};
