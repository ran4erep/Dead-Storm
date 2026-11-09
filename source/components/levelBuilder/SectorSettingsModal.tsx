import React, { useState, useEffect, useMemo } from 'react';
import { Columns, Play, X, Plus, Trash2 } from 'lucide-react';
import { LevelDefinition, AmbientSoundDef } from '../../types';
import { ASSETS } from '../../assets';
import soundsData from '../../data/sounds.json';
import itemsData from '../../data/items.json';
import { AssetPicker } from './AssetPicker';
import { getPreviewSrc } from './levelBuilderUtils';
import { CustomColorPicker } from './CustomColorPicker';
import { CustomSelect } from './CustomSelect';

interface SectorSettingsModalProps {
    show: boolean;
    onClose: () => void;
    width: number | string;
    height: number | string;
    setWidth: (w: number | string) => void;
    setHeight: (h: number | string) => void;
    level: LevelDefinition;
    setLevel: (level: LevelDefinition) => void;
    handleApplySize: () => void;
    uiStrings: any;
}

export const SectorSettingsModal: React.FC<SectorSettingsModalProps> = ({
    show, onClose, width, height, setWidth, setHeight, level, setLevel, handleApplySize, uiStrings
}) => {
    const soundOptions = useMemo(() => Object.keys(soundsData).filter(key => !(soundsData as any)[key]?.alias), []);
    const [nameRu, setNameRu] = useState('');
    const [nameEn, setNameEn] = useState('');
    const [descRu, setDescRu] = useState('');
    const [descEn, setDescEn] = useState('');
    const [globalLightStr, setGlobalLightStr] = useState('1');
    const [fogDistanceStr, setFogDistanceStr] = useState('5');
    const [texturePickerTarget, setTexturePickerTarget] = useState<string | null>(null);
    const [useOverride, setUseOverride] = useState(false);
    const [overrideGender, setOverrideGender] = useState<'male' | 'female'>('male');

    const [maleInventory, setMaleInventory] = useState<{ id: string; count?: number }[]>([]);
    const [maleEquipment, setMaleEquipment] = useState<Record<string, string>>({});
    const [femaleInventory, setFemaleInventory] = useState<{ id: string; count?: number }[]>([]);
    const [femaleEquipment, setFemaleEquipment] = useState<Record<string, string>>({});

    const extractInventory = (items: { id: string; count?: number }[] | undefined, equip: Record<string, string> | undefined) => {
        if (!items) return [];
        const equipIds = Object.values(equip || {}).filter(Boolean);
        const inv: any[] = [];
        const usedEquip = [...equipIds];
        for (const item of items) {
            const idx = usedEquip.indexOf(item.id);
            if (idx !== -1) {
                usedEquip.splice(idx, 1);
            } else {
                inv.push(item);
            }
        }
        return inv;
    };

    const getInventoryMaxSlotsFor = (gender: 'male' | 'female') => {
        let slots = 4;
        const equip = gender === 'male' ? maleEquipment : femaleEquipment;
        if (equip) {
            Object.values(equip).forEach((itemId: string) => {
                if (itemId && (itemsData as any)[itemId] && (itemsData as any)[itemId].inventorySlots) {
                    slots += (itemsData as any)[itemId].inventorySlots;
                }
            });
        }
        return slots;
    };

    useEffect(() => {
        if (show && level) {
            const nParts = (level.locationName || '').split('/');
            setNameRu(nParts[0] || '');
            setNameEn(nParts[1] || '');

            const dParts = (level.locationDescription || '').split('/');
            setDescRu(dParts[0] || '');
            setDescEn(dParts[1] || '');

            setGlobalLightStr(level.globalLight?.toString() ?? '1');
            setFogDistanceStr(level.fogDistance?.toString() ?? '5');
            
            const hasMale = level.initialInventoryMale !== undefined || Object.keys(level.initialEquipmentMale || {}).length > 0;
            const hasFemale = level.initialInventoryFemale !== undefined || Object.keys(level.initialEquipmentFemale || {}).length > 0;
            const hasCommon = level.initialInventory !== undefined || Object.keys(level.initialEquipment || {}).length > 0;
            const hasOverride = hasMale || hasFemale || hasCommon;
            setUseOverride(hasOverride);

            const maleEquip = level.initialEquipmentMale || level.initialEquipment || {};
            setMaleEquipment(maleEquip);
            const maleInv = extractInventory(level.initialInventoryMale || level.initialInventory, maleEquip);
            setMaleInventory(maleInv);

            const femaleEquip = level.initialEquipmentFemale || level.initialEquipment || {};
            setFemaleEquipment(femaleEquip);
            const femaleInv = extractInventory(level.initialInventoryFemale || level.initialInventory, femaleEquip);
            setFemaleInventory(femaleInv);
        }
    }, [show, level.locationName, level.locationDescription, level.globalLight, level.fogDistance, level.initialInventory, level.initialEquipment, level.initialInventoryMale, level.initialEquipmentMale, level.initialInventoryFemale, level.initialEquipmentFemale]);

    const compileSlots = (inventory: { id: string; count?: number }[], maxSlots: number) => {
        const slots: {
            item?: { id: string; count?: number };
            isDuplicate: boolean;
            parentSlotIndex?: number;
            inventoryIndex?: number;
        }[] = [];

        let currentInvIdx = 0;
        for (let sIdx = 0; sIdx < maxSlots; sIdx++) {
            if (slots[sIdx]) continue;
            
            const item = currentInvIdx < inventory.length ? inventory[currentInvIdx] : undefined;
            if (item) {
                const itemData = (itemsData as any)[item.id];
                const weight = itemData?.weight || 1;
                
                slots[sIdx] = { item, isDuplicate: false, inventoryIndex: currentInvIdx };
                
                for (let w = 1; w < weight; w++) {
                    if (sIdx + w < maxSlots) {
                        slots[sIdx + w] = { item, isDuplicate: true, parentSlotIndex: sIdx };
                    }
                }
                currentInvIdx++;
            } else {
                slots[sIdx] = { isDuplicate: false };
            }
        }
        return slots;
    };

    if (!show) return null;

    const handleApplyAndClose = () => {
        const gl = parseFloat(globalLightStr);
        const fd = parseFloat(fogDistanceStr);
        
        let finalInventoryMale: { id: string; count?: number }[] | undefined = undefined;
        let finalEquipmentMale: Record<string, string> | undefined = undefined;
        let finalInventoryFemale: { id: string; count?: number }[] | undefined = undefined;
        let finalEquipmentFemale: Record<string, string> | undefined = undefined;
        
        if (useOverride) {
            finalEquipmentMale = maleEquipment;
            const equipMaleArr = Object.values(maleEquipment).filter(Boolean).map(id => ({ id: id as string }));
            const maxSlotsMale = getInventoryMaxSlotsFor('male');
            const slotsMale = compileSlots(maleInventory, maxSlotsMale);
            const itemsToSaveMale = slotsMale.filter(s => s.item && !s.isDuplicate).map(s => s.item!);
            finalInventoryMale = [...equipMaleArr, ...itemsToSaveMale];

            finalEquipmentFemale = femaleEquipment;
            const equipFemaleArr = Object.values(femaleEquipment).filter(Boolean).map(id => ({ id: id as string }));
            const maxSlotsFemale = getInventoryMaxSlotsFor('female');
            const slotsFemale = compileSlots(femaleInventory, maxSlotsFemale);
            const itemsToSaveFemale = slotsFemale.filter(s => s.item && !s.isDuplicate).map(s => s.item!);
            finalInventoryFemale = [...equipFemaleArr, ...itemsToSaveFemale];
        }

        setLevel(prev => {
            const next = {
                ...prev,
                locationName: `${nameRu}/${nameEn}`,
                locationDescription: `${descRu}/${descEn}`,
                globalLight: isNaN(gl) ? prev.globalLight : gl,
                fogDistance: isNaN(fd) ? prev.fogDistance : fd,
                initialInventory: finalInventoryMale, // general fallback matches male
                initialEquipment: finalEquipmentMale, // general fallback matches male
                initialInventoryMale: finalInventoryMale,
                initialEquipmentMale: finalEquipmentMale,
                initialInventoryFemale: finalInventoryFemale,
                initialEquipmentFemale: finalEquipmentFemale
            };
            if (!useOverride) {
                delete next.initialInventory;
                delete next.initialEquipment;
                delete (next as any).initialInventoryMale;
                delete (next as any).initialEquipmentMale;
                delete (next as any).initialInventoryFemale;
                delete (next as any).initialEquipmentFemale;
            }
            return next;
        });
        onClose();
    };

    const handleUpdateName = (lang: 'ru' | 'en', val: string) => {
        if (lang === 'ru') setNameRu(val);
        if (lang === 'en') setNameEn(val);
    };

    const handleUpdateDesc = (lang: 'ru' | 'en', val: string) => {
        if (lang === 'ru') setDescRu(val);
        if (lang === 'en') setDescEn(val);
    };

    const handleGlobalLightChange = (val: string) => {
        setGlobalLightStr(val);
    };

    const handleFogDistanceChange = (val: string) => {
        setFogDistanceStr(val);
    };

    return (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[300]">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 relative shadow-2xl max-h-[90dvh] overflow-y-auto">
            <button onClick={handleApplyAndClose} className="absolute top-4 right-4 text-gray-400 hover:text-white z-10">
              <X size={24} />
            </button>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 tracking-widest text-[#d5d2c6] uppercase">
                {uiStrings.sector_settings || 'Sector Settings'}
            </h2>

            {texturePickerTarget ? (
               <AssetPicker
                   targetName={texturePickerTarget}
                   uiStrings={uiStrings}
                   onCancel={() => setTexturePickerTarget(null)}
                   onSelect={(t) => {
                       const val = t === '' ? undefined : t;
                       if (texturePickerTarget === 'Ceiling') setLevel(prev => ({ ...prev, ceilingTextureId: val }));
                       if (texturePickerTarget === 'Skybox') setLevel(prev => ({ ...prev, skyboxTextureId: val }));
                       setTexturePickerTarget(null);
                   }}
               />
            ) : (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-300">{uiStrings.basic_settings || 'Basic Settings'}</h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.size_w || 'Width'}</label>
                                <input 
                                    type="number" 
                                    value={width} 
                                    onChange={e => setWidth(e.target.value === '' ? '' : parseInt(e.target.value) || 0)} 
                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.size_h || 'Height'}</label>
                                <input 
                                    type="number" 
                                    value={height} 
                                    onChange={e => setHeight(e.target.value === '' ? '' : parseInt(e.target.value) || 0)} 
                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                />
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                handleApplySize();
                            }} 
                            className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded text-sm font-bold text-white transition-colors shadow-md flex items-center justify-center gap-2"
                        >
                            <Play size={16} />
                            {uiStrings.apply_size || 'Apply Size'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-300">{uiStrings.environment || 'Environment'}</h3>
                        
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.soundtrack || 'Soundtrack'}</label>
                            <CustomSelect 
                                value={level.soundtrack || ''} 
                                onChange={e => setLevel(prev => ({...prev, soundtrack: e.target.value}))}
                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white"
                            >
                                <option value="">{uiStrings.none || 'None'}</option>
                                {soundOptions.map(snd => (
                                    <option key={snd} value={snd}>{snd}</option>
                                ))}
                            </CustomSelect>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.global_light || 'Global Light'}</label>
                                <input 
                                    type="number" 
                                    value={globalLightStr} 
                                    step="0.01"
                                    min="0" max="2"
                                    onChange={e => handleGlobalLightChange(e.target.value)} 
                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.ceiling || 'Ceiling'}</label>
                                <CustomSelect 
                                    value={level.ceilingType || 'OUTDOOR'} 
                                    onChange={e => setLevel(prev => ({...prev, ceilingType: e.target.value as 'INDOOR' | 'OUTDOOR'}))}
                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white"
                                >
                                    <option value="OUTDOOR">OUTDOOR</option>
                                    <option value="INDOOR">INDOOR</option>
                                </CustomSelect>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.weather || 'Weather'}</label>
                                <CustomSelect 
                                    value={level.weather || 'none'} 
                                    onChange={e => setLevel(prev => ({...prev, weather: e.target.value as 'none' | 'rain' | 'fog'}))}
                                    className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white"
                                >
                                    <option value="none">none</option>
                                    <option value="rain">rain</option>
                                    <option value="fog">fog</option>
                                </CustomSelect>
                            </div>
                        </div>

                        {level.weather === 'fog' && (
                            <div className="flex flex-col sm:flex-row gap-4 mt-4">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Fog Distance</label>
                                    <input 
                                        type="number" 
                                        value={fogDistanceStr} 
                                        min="1" max="50"
                                        onChange={e => handleFogDistanceChange(e.target.value)} 
                                        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Fog Color</label>
                                    <CustomColorPicker 
                                        color={level.fogColor || '#BEC8D2'} 
                                        onChange={color => {
                                            if (level.fogColor !== color) {
                                                setLevel(prev => ({...prev, fogColor: color}));
                                            }
                                        }} 
                                    />
                                </div>
                            </div>
                        )}
                        
                        {(level.ceilingType || 'OUTDOOR') === 'INDOOR' && (
                            <div className="flex gap-4 items-end mt-4">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.ceiling_texture || 'Ceiling Texture'}</label>
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-gray-900 border border-gray-700 rounded overflow-hidden flex-shrink-0">
                                            {level.ceilingTextureId && getPreviewSrc(level.ceilingTextureId) ? (
                                                <img src={getPreviewSrc(level.ceilingTextureId)!} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] break-words text-center text-gray-500">NONE</div>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => setTexturePickerTarget('Ceiling')}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-left truncate transition-colors"
                                        >
                                            <span className="truncate">{level.ceilingTextureId || uiStrings.select || 'Select...'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {(level.ceilingType || 'OUTDOOR') === 'OUTDOOR' && (
                            <div className="flex gap-4 items-end mt-4">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.skybox_texture || 'Skybox Texture'}</label>
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-gray-900 border border-gray-700 rounded overflow-hidden flex-shrink-0">
                                            {level.skyboxTextureId && getPreviewSrc(level.skyboxTextureId) ? (
                                                <img src={getPreviewSrc(level.skyboxTextureId)!} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] break-words text-center text-gray-500">NONE</div>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => setTexturePickerTarget('Skybox')}
                                            className="flex-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded px-3 py-2 text-sm text-left truncate transition-colors"
                                        >
                                            <span className="truncate">{level.skyboxTextureId || uiStrings.select || 'Select...'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4 border-t border-gray-700 pt-4">
                    <h3 className="text-lg font-bold text-gray-300">{uiStrings.location_details || 'Location Details'}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.name_ru || 'Name (RU)'}</label>
                            <input 
                                type="text" 
                                value={nameRu} 
                                onChange={e => handleUpdateName('ru', e.target.value)} 
                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                placeholder={uiStrings.name_ru_placeholder || "Новый уровень"}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.name_en || 'Name (EN)'}</label>
                            <input 
                                type="text" 
                                value={nameEn} 
                                onChange={e => handleUpdateName('en', e.target.value)} 
                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 text-white" 
                                placeholder={uiStrings.name_en_placeholder || "New Level"}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.desc_ru || 'Description (RU)'}</label>
                            <textarea 
                                value={descRu} 
                                onChange={e => handleUpdateDesc('ru', e.target.value)} 
                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 h-24 resize-none text-white" 
                                placeholder={uiStrings.desc_ru_placeholder || "Описание локации..."}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.desc_en || 'Description (EN)'}</label>
                            <textarea 
                                value={descEn} 
                                onChange={e => handleUpdateDesc('en', e.target.value)} 
                                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-sm outline-none focus:border-indigo-500 h-24 resize-none text-white" 
                                placeholder={uiStrings.desc_en_placeholder || "Location description..."}
                            />
                        </div>
                    </div>
                </div>

                {/* Starting Gear & Inventory Overrides */}
                <div className="space-y-4 border-t border-gray-700 pt-4 mt-6">
                    <h3 className="text-base font-bold text-gray-300">
                        {uiStrings.override_inventory_title || 'Starting Items (Override)'}
                    </h3>
                    <p className="text-xs text-gray-400">
                        {uiStrings.override_inventory_desc || 'If specified, overrides player\'s inventory and gear when first entering this sector.'}
                    </p>

                    {/* Checkbox to enable starting loadout override */}
                    <div className="flex items-center gap-3 bg-gray-900/40 p-3 border border-gray-700 rounded-lg">
                        <input
                            type="checkbox"
                            id="useOverrideToggle"
                            checked={useOverride}
                            onChange={e => setUseOverride(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-700 rounded focus:ring-indigo-500 focus:ring-2 focus:ring-offset-gray-800 accent-indigo-500 cursor-pointer"
                        />
                        <label htmlFor="useOverrideToggle" className="text-sm font-bold text-gray-200 cursor-pointer select-none">
                            {uiStrings.override_inventory_enable || 'Override starting equipment for this sector'}
                        </label>
                    </div>

                    {useOverride && (
                        <div className="space-y-4 pt-2">
                            {/* Gender switcher tab inside override */}
                            <div className="flex gap-2 bg-gray-900/50 p-1 rounded w-fit border border-gray-700/50">
                                {(['male', 'female'] as const).map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setOverrideGender(g)}
                                        className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                                            overrideGender === g 
                                                ? 'bg-indigo-600 text-white shadow-sm' 
                                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                        }`}
                                    >
                                        {g === 'male' ? (uiStrings.btn_male || "Мужской") : (uiStrings.btn_female || "Женский")}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* EQUIPMENT OVERRIDE COMPONENTS */}
                                <div className="bg-gray-900/50 p-4 border border-gray-700 rounded-lg space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 pb-2 border-b border-gray-800">
                                        <Columns size={16} className="text-indigo-400" />
                                        {uiStrings.equipment || 'Equipment'} ({overrideGender === 'male' ? (uiStrings.btn_male || "Мужской") : (uiStrings.btn_female || "Женский")})
                                    </h4>

                                    <div className="space-y-3 pt-1">
                                        {[
                                            { key: 'helmet', label: uiStrings.helmet || 'Helmet', equip: 'HEAD' },
                                            { key: 'vest', label: uiStrings.vest || 'Vest', equip: 'BODY' },
                                            { key: 'pants', label: uiStrings.pants || 'Pants', equip: 'LEGS' },
                                            { key: 'boots', label: uiStrings.boots || 'Boots', equip: 'FEET' },
                                            { key: 'weapon', label: uiStrings.weapon || 'Weapon', equip: 'WEAPON' },
                                            { key: 'accessory1', label: uiStrings.accessory1 || 'Accessory 1', equip: 'ACCESSORY' },
                                            { key: 'accessory2', label: uiStrings.accessory2 || 'Accessory 2', equip: 'ACCESSORY' },
                                        ].map(slot => {
                                            const itemOptions = Object.keys(itemsData).map(k => ({ id: k, ...(itemsData as any)[k] }));
                                            const isRu = uiStrings.done === 'ГОТОВО' || uiStrings.sector_settings === 'Настройка сектора';
                                            const localizeVal = (val: string | undefined) => {
                                                if (!val) return "";
                                                const idxVal = val.indexOf('/');
                                                if (idxVal !== -1) return isRu ? val.substring(0, idxVal).trim() : val.substring(idxVal + 1).trim();
                                                return val;
                                            };

                                            const currentEquip = overrideGender === 'male' ? maleEquipment : femaleEquipment;

                                            return (
                                                <div key={slot.key} className="flex items-center justify-between gap-2 bg-gray-800/20 p-2 rounded border border-gray-800/50 text-xs">
                                                    <span className="w-20 text-gray-400 font-medium capitalize truncate">{slot.label}:</span>
                                                    <CustomSelect
                                                        value={currentEquip[slot.key] || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const setEquip = overrideGender === 'male' ? setMaleEquipment : setFemaleEquipment;
                                                            setEquip(prev => {
                                                                const next = { ...prev };
                                                                if (val) {
                                                                    next[slot.key] = val;
                                                                } else {
                                                                    delete next[slot.key];
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-indigo-500 font-mono w-full min-w-0 flex-1"
                                                    >
                                                        <option value="">{uiStrings.none || 'None'}</option>
                                                        {itemOptions.filter(i => i.equip === slot.equip).map(opt => (
                                                            <option key={opt.id} value={opt.id}>
                                                                {localizeVal(opt.name)} ({opt.id})
                                                            </option>
                                                        ))}
                                                    </CustomSelect>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* BACKPACK INVENTORY – RIGHT SIDE */}
                                <div className="bg-gray-900/50 p-4 border border-gray-700 rounded-lg flex flex-col space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-300 flex items-center justify-between pb-2 border-b border-gray-800">
                                        <span className="flex items-center gap-2">
                                            <Columns size={16} className="text-indigo-400" />
                                            {uiStrings.inventory || 'Inventory'} ({overrideGender === 'male' ? (uiStrings.btn_male || "Мужской") : (uiStrings.btn_female || "Женский")})
                                        </span>
                                        <span className="text-xs text-indigo-400 font-mono">
                                            ({compileSlots(overrideGender === 'male' ? maleInventory : femaleInventory, getInventoryMaxSlotsFor(overrideGender)).filter(s => s.item).length} / {getInventoryMaxSlotsFor(overrideGender)})
                                        </span>
                                    </h4>

                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                        {(() => {
                                            const currentInv = overrideGender === 'male' ? maleInventory : femaleInventory;
                                            const maxSlots = getInventoryMaxSlotsFor(overrideGender);
                                            const slots = compileSlots(currentInv, maxSlots);
                                            const itemOptions = Object.keys(itemsData).map(k => ({ id: k, ...(itemsData as any)[k] }));
                                            const isRu = uiStrings.done === 'ГОТОВО' || uiStrings.sector_settings === 'Настройка сектора';
                                            const localizeVal = (val: string | undefined) => {
                                                if (!val) return "";
                                                const idxVal = val.indexOf('/');
                                                if (idxVal !== -1) return isRu ? val.substring(0, idxVal).trim() : val.substring(idxVal + 1).trim();
                                                return val;
                                            };

                                            const updateInventoryItem = (sIdx: number, itemId: string | null, count?: number) => {
                                                const setInv = overrideGender === 'male' ? setMaleInventory : setFemaleInventory;
                                                setInv(prev => {
                                                    const list = [...prev];
                                                    const targetSlot = slots[sIdx];
                                                    if (targetSlot && targetSlot.inventoryIndex !== undefined) {
                                                        const invIdx = targetSlot.inventoryIndex;
                                                        if (itemId === null) {
                                                            list.splice(invIdx, 1);
                                                        } else {
                                                            list[invIdx] = { id: itemId, count };
                                                            if (count === undefined) delete list[invIdx].count;
                                                        }
                                                    } else {
                                                        // It was empty, find insertion index
                                                        if (itemId !== null) {
                                                            let insertAt = 0;
                                                            for (let i = sIdx - 1; i >= 0; i--) {
                                                                if (slots[i] && slots[i].inventoryIndex !== undefined) {
                                                                    insertAt = slots[i].inventoryIndex! + 1;
                                                                    break;
                                                                }
                                                            }
                                                            list.splice(insertAt, 0, { id: itemId, count: count || 1 });
                                                        }
                                                    }
                                                    return list;
                                                });
                                            };

                                            return slots.map((slot, sIdx) => {
                                                const item = slot.item;
                                                const isDuplicate = slot.isDuplicate;

                                                return (
                                                    <div key={sIdx} className={`flex items-center gap-2 p-2 rounded border ${isDuplicate ? 'bg-gray-900/30 border-gray-800 opacity-60 text-gray-500' : 'bg-gray-800/30 border-gray-800/80'}`}>
                                                        <span className="text-gray-500 font-mono text-xs w-4">{sIdx + 1}.</span>
                                                        <CustomSelect
                                                            value={item?.id || ''}
                                                            onChange={e => updateInventoryItem(sIdx, e.target.value === '' ? null : e.target.value, item?.count || 1)}
                                                            disabled={isDuplicate}
                                                            className="bg-gray-900 border border-gray-700 text-white px-2 py-1 rounded flex-1 min-w-0 focus:outline-none focus:border-indigo-500 font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <option value="">{uiStrings.empty || '--- Empty ---'}</option>
                                                            {itemOptions.map(opt => {
                                                                const optWeight = opt.weight || 1;
                                                                const isDisabled = optWeight > (maxSlots - sIdx);
                                                                return (
                                                                    <option key={opt.id} value={opt.id} disabled={isDisabled}>
                                                                        {localizeVal(opt.name)} ({opt.id})
                                                                    </option>
                                                                );
                                                            })}
                                                        </CustomSelect>
                                                        {item && (
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="999"
                                                                value={item.count || 1}
                                                                disabled={isDuplicate}
                                                                onChange={e => {
                                                                    const v = parseInt(e.target.value);
                                                                    updateInventoryItem(sIdx, item.id, isNaN(v) ? 1 : v);
                                                                }}
                                                                className="bg-gray-950 border border-gray-700 text-white px-1 py-1 rounded w-14 focus:outline-none focus:border-indigo-500 text-center font-mono text-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <button 
                    onClick={handleApplyAndClose}
                    className="mt-8 w-full bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest text-lg border border-gray-600"
                >
                    {uiStrings.done || 'DONE'}
                </button>
            </>
            )}
          </div>
        </div>
    );
};
