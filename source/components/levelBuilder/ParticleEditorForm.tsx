import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Sliders, Zap, Palette, Move, Activity, Image as ImageIcon, X } from 'lucide-react';
import { CustomColorPicker } from './CustomColorPicker';
import { CustomSelect } from './CustomSelect';
import { InfiniteSliderInput } from './InfiniteSliderInput';
import { AssetPicker } from './AssetPicker';
import { ASSETS } from '../../assets';

interface ParticleEditorFormProps {
    data: any;
    onChange: (newData: any) => void;
    currentKey: string;
    onKeyChange: (newKey: string) => void;
    uiStrings: any;
}

// Convert rgba to hex8
const rgbaToHex8 = (rgba: string): string => {
    if (!rgba) return '#ffffffff';
    if (rgba.startsWith('#')) return rgba;
    
    // Parse rgba(r, g, b, a)
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return '#ffffffff';
    
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    let a = 'ff';
    
    if (match[4] !== undefined) {
        a = Math.round(parseFloat(match[4]) * 255).toString(16).padStart(2, '0');
    }
    
    return `#${r}${g}${b}${a}`;
};

export const ParticleEditorForm: React.FC<ParticleEditorFormProps> = ({ data, onChange, currentKey, onKeyChange, uiStrings }) => {
    const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
    const [showAssetPicker, setShowAssetPicker] = useState(false);

    if (!data || !currentKey || !data[currentKey]) {
        return <div className="text-gray-500 mt-4 text-center py-8 font-mono">Выберите или создайте новый эмиттер</div>;
    }

    const emitter = data[currentKey];

    const updateField = (field: string, value: any) => {
        const newData = { ...data };
        newData[currentKey] = { ...emitter, [field]: value };
        onChange(newData);
    };

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newKey = e.target.value;
        if (!newKey || data[newKey]) return; // prevent empty or duplicate
        const newData = { ...data };
        newData[newKey] = { ...emitter, id: newKey };
        delete newData[currentKey];
        onChange(newData);
        onKeyChange(newKey);
    };

    const isBurst = emitter.burst !== undefined;

    // Get preview image src for spriteId if present
    const spriteId = emitter.spriteId || '';
    let spriteSrc = '';
    if (spriteId) {
        spriteSrc = (ASSETS.SPRITES as any)[spriteId] || (ASSETS.TEXTURES as any)[spriteId] || '';
        if (spriteSrc && spriteSrc.startsWith('local://')) {
            spriteSrc = localStorage.getItem(spriteSrc.substring(8)) || spriteSrc;
        }
    }

    return (
        <div className="flex flex-col gap-4 bg-gray-900/90 border border-gray-800 p-3 sm:p-4 rounded-xl shadow-xl relative">
            {/* Asset Picker Modal */}
            {showAssetPicker && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 p-4 flex flex-col justify-center items-center">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden p-4 shadow-2xl flex flex-col">
                        <AssetPicker
                            targetName={`Спрайт частиц (${currentKey})`}
                            onSelect={(selectedAssetId) => {
                                updateField('spriteId', selectedAssetId);
                                setShowAssetPicker(false);
                            }}
                            onCancel={() => setShowAssetPicker(false)}
                            uiStrings={uiStrings}
                        />
                    </div>
                </div>
            )}

            {/* Identity Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">ID / Ключ</label>
                    <input 
                        type="text" 
                        value={currentKey} 
                        onChange={handleKeyChange}
                        className="w-full bg-gray-800 text-white border border-gray-700 p-2 rounded-md text-xs sm:text-sm font-mono focus:border-fuchsia-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Название (Name)</label>
                    <input 
                        type="text" 
                        value={emitter.name || ''} 
                        onChange={e => updateField('name', e.target.value)}
                        className="w-full bg-gray-800 text-white border border-gray-700 p-2 rounded-md text-xs sm:text-sm focus:border-fuchsia-500 outline-none"
                    />
                </div>
            </div>

            <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className="flex justify-between items-center bg-gray-800/80 p-2.5 rounded-lg text-gray-200 hover:text-white transition-colors border border-gray-700 mt-1"
                type="button"
            >
                <span className="font-bold uppercase tracking-widest text-xs flex items-center gap-2 text-fuchsia-400">
                    <Sliders size={15} /> {uiStrings.settings || 'Параметры частиц'}
                </span>
                {isSettingsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isSettingsExpanded && (
                <div className="flex flex-col gap-5 mt-1">
                    {/* Spawn Mode & Rate Section */}
                    <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                            <Zap size={14} /> Режим и спавн
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1">Режим эммитера</label>
                                <CustomSelect 
                                    value={isBurst ? 'burst' : 'continuous'}
                                    onChange={e => {
                                        const newData = { ...data };
                                        if (e.target.value === 'burst') {
                                            newData[currentKey] = { ...emitter, burst: emitter.spawnRate || 10 };
                                            delete newData[currentKey].spawnRate;
                                        } else {
                                            newData[currentKey] = { ...emitter, spawnRate: emitter.burst || 10 };
                                            delete newData[currentKey].burst;
                                        }
                                        onChange(newData);
                                    }}
                                    className="w-full bg-gray-800 text-white border border-gray-700 p-2 rounded text-xs outline-none focus:border-fuchsia-500"
                                >
                                    <option value="continuous">Continuous (Непрерывный)</option>
                                    <option value="burst">Burst (Однократный залп)</option>
                                </CustomSelect>
                            </div>
                            <div>
                                {isBurst ? (
                                    <InfiniteSliderInput
                                        label="Залп (Количество)"
                                        value={emitter.burst}
                                        onChange={val => updateField('burst', val)}
                                        step={1}
                                        defaultMin={1}
                                        defaultMax={100}
                                        minLimit={1}
                                        defaultValue={10}
                                    />
                                ) : (
                                    <InfiniteSliderInput
                                        label="Частота (в сек)"
                                        value={emitter.spawnRate}
                                        onChange={val => updateField('spawnRate', val)}
                                        step={1}
                                        defaultMin={1}
                                        defaultMax={100}
                                        minLimit={0}
                                        defaultValue={15}
                                    />
                                )}
                            </div>
                            <div className="col-span-1 sm:col-span-2">
                                <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1 flex justify-between items-center">
                                    <span>Спрайт частиц (Sprite ID)</span>
                                    {spriteId && (
                                        <button 
                                            onClick={() => updateField('spriteId', '')}
                                            className="text-red-400 hover:text-red-300 text-[10px] font-bold uppercase flex items-center gap-0.5"
                                        >
                                            <X size={12} /> Сбросить
                                        </button>
                                    )}
                                </label>
                                <div className="flex gap-2 items-center">
                                    {/* Preview Thumbnail */}
                                    <div className="w-10 h-10 rounded bg-gray-800 border border-gray-700 shrink-0 flex items-center justify-center overflow-hidden p-0.5 relative group">
                                        {spriteSrc ? (
                                            <img src={spriteSrc} alt={spriteId} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                                        ) : (
                                            <span className="text-[9px] text-gray-500 text-center leading-tight">Без спрайта</span>
                                        )}
                                    </div>

                                    {/* Input & Pick Button */}
                                    <input 
                                        type="text" 
                                        value={emitter.spriteId || ''} 
                                        onChange={e => updateField('spriteId', e.target.value)}
                                        placeholder="Без спрайта (пиксели) или введите ID..."
                                        className="flex-1 bg-gray-800 text-white border border-gray-700 p-2 rounded text-xs font-mono focus:border-fuchsia-500 outline-none"
                                    />

                                    <button
                                        type="button"
                                        onClick={() => setShowAssetPicker(true)}
                                        className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-3 py-2 rounded text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow"
                                        title="Открыть галерею спрайтов"
                                    >
                                        <ImageIcon size={15} />
                                        <span className="hidden sm:inline">Галерея</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Colors Section */}
                    <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-pink-400 uppercase tracking-wider">
                            <Palette size={14} /> Цвета частиц
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            {(emitter.colors || []).map((c: string, i: number) => {
                                const hex = rgbaToHex8(c);
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1 bg-gray-800/80 p-2 rounded-lg border border-gray-700 shadow">
                                        <CustomColorPicker 
                                            color={hex} 
                                            onChange={(newColor) => {
                                                const newColors = [...emitter.colors];
                                                newColors[i] = newColor;
                                                updateField('colors', newColors);
                                            }} 
                                            supportAlpha={true}
                                        />
                                        <button 
                                            className="text-[10px] text-red-400 hover:text-red-300 mt-1 flex items-center gap-0.5 font-bold uppercase"
                                            onClick={() => {
                                                const newColors = [...emitter.colors];
                                                newColors.splice(i, 1);
                                                updateField('colors', newColors);
                                            }}
                                        >
                                            <Trash2 size={11}/> Del
                                        </button>
                                    </div>
                                );
                            })}
                            <button 
                                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white p-2 rounded-lg flex items-center justify-center h-[74px] w-[74px] transition-colors"
                                onClick={() => {
                                    const newColors = [...(emitter.colors || []), '#ffffffff'];
                                    updateField('colors', newColors);
                                }}
                                title="Добавить цвет"
                            >
                                <Plus size={24} className="text-gray-400" />
                            </button>
                        </div>
                    </div>

                    {/* Speed & Direction Section */}
                    <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                            <Move size={14} /> Скорости разлёта (Velocities)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InfiniteSliderInput
                                label="Speed X (Min)"
                                value={emitter.speedXMin}
                                onChange={val => updateField('speedXMin', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={-0.015}
                            />
                            <InfiniteSliderInput
                                label="Speed X (Max)"
                                value={emitter.speedXMax}
                                onChange={val => updateField('speedXMax', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={0.015}
                            />
                            <InfiniteSliderInput
                                label="Speed Y (Min)"
                                value={emitter.speedYMin}
                                onChange={val => updateField('speedYMin', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={-0.015}
                            />
                            <InfiniteSliderInput
                                label="Speed Y (Max)"
                                value={emitter.speedYMax}
                                onChange={val => updateField('speedYMax', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={0.015}
                            />
                            <InfiniteSliderInput
                                label="Speed Z (Min)"
                                value={emitter.speedZMin}
                                onChange={val => updateField('speedZMin', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={0.0}
                            />
                            <InfiniteSliderInput
                                label="Speed Z (Max)"
                                value={emitter.speedZMax}
                                onChange={val => updateField('speedZMax', val)}
                                step={0.001}
                                defaultMin={-0.1}
                                defaultMax={0.1}
                                defaultValue={0.03}
                            />
                        </div>
                    </div>

                    {/* Physics & Environment Section */}
                    <div className="bg-gray-950/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                            <Activity size={14} /> Физика и размеры
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <InfiniteSliderInput
                                label="Гравитация (Gravity)"
                                value={emitter.gravity}
                                onChange={val => updateField('gravity', val)}
                                step={0.0001}
                                defaultMin={-0.005}
                                defaultMax={0.005}
                                defaultValue={0.0008}
                            />
                            <InfiniteSliderInput
                                label="Трение (Friction)"
                                value={emitter.friction}
                                onChange={val => updateField('friction', val)}
                                step={0.005}
                                defaultMin={0.5}
                                defaultMax={1.0}
                                minLimit={0}
                                defaultValue={0.98}
                            />
                            <InfiniteSliderInput
                                label="Нач. размер (Start Size)"
                                value={emitter.startSize}
                                onChange={val => updateField('startSize', val)}
                                step={0.01}
                                defaultMin={0.1}
                                defaultMax={5.0}
                                minLimit={0}
                                defaultValue={1.0}
                            />
                            <InfiniteSliderInput
                                label="Рост размера (Size Growth)"
                                value={emitter.sizeGrowth}
                                onChange={val => updateField('sizeGrowth', val)}
                                step={0.001}
                                defaultMin={0.8}
                                defaultMax={1.5}
                                minLimit={0}
                                defaultValue={1.015}
                            />
                            <InfiniteSliderInput
                                label="Жизнь (Min Life)"
                                value={emitter.life}
                                onChange={val => updateField('life', val)}
                                step={0.05}
                                defaultMin={0.1}
                                defaultMax={5.0}
                                minLimit={0}
                                defaultValue={1.0}
                                unit="s"
                            />
                            <InfiniteSliderInput
                                label="Жизнь (Max Life)"
                                value={emitter.maxLife}
                                onChange={val => updateField('maxLife', val)}
                                step={0.05}
                                defaultMin={0.1}
                                defaultMax={10.0}
                                minLimit={0}
                                defaultValue={1.5}
                                unit="s"
                            />
                            <div className="col-span-1 sm:col-span-2">
                                <InfiniteSliderInput
                                    label="Смещение Z (Z-Offset)"
                                    value={emitter.zOffset}
                                    onChange={val => updateField('zOffset', val)}
                                    step={0.01}
                                    defaultMin={-0.5}
                                    defaultMax={2.0}
                                    defaultValue={0.0}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
