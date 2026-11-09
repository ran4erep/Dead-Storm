import React, { useState } from 'react';
import { X } from 'lucide-react';
import enemiesData from '../../data/enemies.json';
import npcsData from '../../data/npcs.json';
import itemsData from '../../data/items.json';
import decorationsData from '../../data/decorations.json';
import { CustomSelect } from './CustomSelect';
import { getEntityPreviewUrl } from './levelBuilderUtils';
import { PolyObjectIsometricIcon } from '../../utils/polyObjectIsoRenderer';
import { REGISTERED_POLY_MODELS, getPolyModelById } from '../../data/polyModels';

interface EntitySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: any) => void;
    initialConfig: any;
    strings: any;
}

export const EntitySettingsModal: React.FC<EntitySettingsModalProps> = ({
    isOpen, onClose, onSave, initialConfig, strings
}) => {
    const [entityType, setEntityType] = useState<'item' | 'enemy' | 'npc' | 'decoration'>(initialConfig.entityType || 'enemy');
    const [id, setId] = useState<string>(initialConfig.id || '');

    const [symbol, setSymbol] = useState<string>(initialConfig.symbol || '');

    React.useEffect(() => {
        if (isOpen) {
            setEntityType(initialConfig.entityType || 'enemy');
            setId(initialConfig.id || '');
            setSymbol(initialConfig.symbol || '');
        }
    }, [isOpen, initialConfig]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave({
            symbol,
            entityType,
            id
        });
    };

    let idOptions: string[] = [];
    if (entityType === 'enemy') idOptions = Object.keys(enemiesData);
    else if (entityType === 'npc') idOptions = Object.keys(npcsData);
    else if (entityType === 'item') idOptions = Object.keys(itemsData);
    else if (entityType === 'decoration') idOptions = Object.keys(decorationsData);

    const typeOptions = {
        enemy: strings?.ui?.level_editor?.entity_enemy || "Враг (Enemy)",
        npc: strings?.ui?.level_editor?.entity_npc || "NPC",
        item: strings?.ui?.level_editor?.entity_item || "Предмет (Item)",
        decoration: strings?.ui?.level_editor?.entity_decoration || "Декорация (Decoration)",
    };

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[500] p-4">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-indigo-500/50 shadow-2xl flex flex-col space-y-4">
                <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">
                        {strings?.ui?.level_editor?.entity_settings || "Настройки сущности"}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[70dvh] pr-2">
                    {/* Symbol at the top, like ConstructionSettingsModal */}
                    <div className="w-24 shrink-0">
                        <label className="block text-sm text-gray-400 mb-1">
                            {strings?.ui?.level_editor?.symbol || "Symbol"}
                        </label>
                        <input 
                            type="text"
                            maxLength={1}
                            value={symbol} 
                            onChange={(e) => setSymbol(e.target.value.charAt(0))}
                            placeholder="Auto"
                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-center font-bold"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="block text-sm text-gray-400 mb-1">
                            {strings?.ui?.level_editor?.entity_type || "Тип сущности"}
                        </label>
                        <CustomSelect 
                            value={entityType} 
                            onChange={(e) => {
                                setEntityType(e.target.value as any);
                                setId('');
                            }}
                            className="bg-gray-700 text-white p-2 text-sm rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="enemy">{typeOptions.enemy}</option>
                            <option value="npc">{typeOptions.npc}</option>
                            <option value="item">{typeOptions.item}</option>
                            <option value="decoration">{typeOptions.decoration}</option>
                        </CustomSelect>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-bold">
                            {strings?.ui?.level_editor?.entity_id || "Идентификатор (ID)"}
                        </label>
                        <CustomSelect 
                            value={id} 
                            onChange={(e) => setId(e.target.value)}
                            className="bg-gray-700 text-white p-2 text-sm rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="">{strings?.ui?.level_editor?.please_select || "-- Выберите --"}</option>
                            {idOptions.map(opt => {
                                const previewUrl = getEntityPreviewUrl(entityType, opt);
                                let displayName = opt;
                                if (entityType === 'enemy' && (enemiesData as any)[opt]?.name) {
                                    displayName = `${(enemiesData as any)[opt].name.split('/')[0].trim()} [${opt}]`;
                                } else if (entityType === 'npc' && (npcsData as any)[opt]?.name) {
                                    displayName = `${(npcsData as any)[opt].name.split('/')[0].trim()} [${opt}]`;
                                } else if (entityType === 'item' && (itemsData as any)[opt]?.name) {
                                    displayName = `${(itemsData as any)[opt].name.split('/')[0].trim()} [${opt}]`;
                                } else if (entityType === 'decoration' && (decorationsData as any)[opt]?.name) {
                                    displayName = `${(decorationsData as any)[opt].name.split('/')[0].trim()} [${opt}]`;
                                }

                                const optStr = String(opt);
                                let polyModelObj: any = undefined;
                                let polyModelId: string | undefined = undefined;

                                if (entityType === 'decoration' && (decorationsData as any)[opt]) {
                                    const dec = (decorationsData as any)[opt];
                                    if (dec.renderMode === 'polyObject' || dec.polyModelId || dec.polyModel || dec.cubes || REGISTERED_POLY_MODELS[optStr] || getPolyModelById(optStr)) {
                                        polyModelObj = dec.polyModel || (dec.cubes ? { id: optStr, name: dec.name || optStr, cubes: dec.cubes } : getPolyModelById(dec.polyModelId || optStr));
                                        polyModelId = dec.polyModelId || optStr;
                                    }
                                } else if (REGISTERED_POLY_MODELS[optStr] || getPolyModelById(optStr)) {
                                    polyModelObj = getPolyModelById(optStr);
                                    polyModelId = optStr;
                                }

                                return (
                                    <option key={opt} value={opt}>
                                        <span className="inline-flex items-center gap-2">
                                            {polyModelObj || polyModelId ? (
                                                <span className="w-6 h-6 shrink-0 rounded bg-black/60 p-0.5 border border-gray-700 flex items-center justify-center overflow-hidden inline-flex">
                                                    <PolyObjectIsometricIcon modelId={polyModelId || optStr} model={polyModelObj} className="w-full h-full object-contain" />
                                                </span>
                                            ) : previewUrl ? (
                                                <img
                                                    src={previewUrl}
                                                    className="w-6 h-6 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700"
                                                    style={{ imageRendering: 'pixelated' }}
                                                    alt=""
                                                    referrerPolicy="no-referrer"
                                                />
                                            ) : (
                                                <span className="w-6 h-6 bg-gray-900 rounded shrink-0 border border-gray-700 inline-block" />
                                            )}
                                            <span>{displayName}</span>
                                        </span>
                                    </option>
                                );
                            })}
                        </CustomSelect>
                    </div>
                </div>

                <div className="flex gap-4 mt-6 pt-4 border-t border-gray-700">
                    <button 
                        onClick={onClose}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm"
                    >
                        {strings?.ui?.level_editor?.btn_cancel || "Отмена"}
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={!id}
                        className={`flex-1 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm ${!id ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]'}`}
                    >
                        {strings?.ui?.level_editor?.btn_create || "Создать"}
                    </button>
                </div>
            </div>
        </div>
    );
};
