import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { CustomColorPicker } from './CustomColorPicker';
import { CustomSelect } from './CustomSelect';
import { NumericInput } from './NumericInput';

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
    const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

    if (!data || !currentKey || !data[currentKey]) {
        return <div className="text-gray-500 mt-4 text-center">Select or create a new emitter</div>;
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

    return (
        <div className="flex flex-col gap-4 bg-gray-900 border border-gray-700 p-3 sm:p-4 rounded overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">ID / Key</label>
                    <input 
                        type="text" 
                        value={currentKey} 
                        onChange={handleKeyChange}
                        className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm focus:border-fuchsia-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Name</label>
                    <input 
                        type="text" 
                        value={emitter.name || ''} 
                        onChange={e => updateField('name', e.target.value)}
                        className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm focus:border-fuchsia-500 outline-none"
                    />
                </div>
            </div>

            <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className="flex justify-between items-center bg-gray-800 p-2 rounded text-gray-300 hover:text-white transition-colors border border-gray-700 mt-1"
                type="button"
            >
                <span className="font-bold uppercase tracking-widest text-xs">{uiStrings.settings || 'Настройки'}</span>
                {isSettingsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isSettingsExpanded && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                        <div className="col-span-1 sm:col-span-2">
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">{uiStrings.mode_and_rate || 'Mode & Rate/Amount'}</label>
                            <div className="flex gap-2">
                                <CustomSelect 
                                    value={emitter.burst !== undefined ? 'burst' : 'continuous'}
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
                                    className="bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none"
                                >
                                    <option value="continuous">{uiStrings.continuous_mode || 'Continuous (Spawns/sec)'}</option>
                                    <option value="burst">{uiStrings.burst_mode || 'Burst (One-shot Amount)'}</option>
                                </CustomSelect>
                                <input 
                                    type="number" 
                                    step="1" 
                                    value={emitter.burst !== undefined ? emitter.burst : (typeof emitter.spawnRate === 'number' && Number.isNaN(emitter.spawnRate) ? '' : (emitter.spawnRate ?? 10))} 
                                    onChange={e => {
                                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                        if (emitter.burst !== undefined) updateField('burst', val);
                                        else updateField('spawnRate', val);
                                    }} 
                                    className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" 
                                />
                            </div>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Sprite ID (Optional)</label>
                            <input 
                                type="text" 
                                value={emitter.spriteId || ''} 
                                onChange={e => updateField('spriteId', e.target.value)}
                                className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm focus:border-fuchsia-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="border-t border-gray-800 pt-4 mt-2">
                        <h4 className="text-gray-300 font-bold mb-3">{uiStrings.colors || 'Colors'}</h4>
                        <div className="flex flex-wrap gap-3">
                            {(emitter.colors || []).map((c: string, i: number) => {
                                const hex = rgbaToHex8(c);
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1 bg-gray-800/50 p-2 rounded border border-gray-700">
                                        <CustomColorPicker 
                                            color={hex} 
                                            onChange={(newColor) => {
                                                const newColors = [...emitter.colors];
                                                newColors[i] = newColor;
                                                updateField('colors', newColors);
                                            }} 
                                            supportAlpha={true}
                                        />
                                        <button className="text-xs text-red-400 hover:text-red-300 mt-1 flex items-center gap-1"
                                            onClick={() => {
                                                const newColors = [...emitter.colors];
                                                newColors.splice(i, 1);
                                                updateField('colors', newColors);
                                            }}
                                        ><Trash2 size={12}/> Del</button>
                                    </div>
                                );
                            })}
                            <button 
                                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white p-2 rounded flex items-center justify-center h-[74px] w-[74px] transition-colors"
                                onClick={() => {
                                    const newColors = [...(emitter.colors || []), '#ffffffff'];
                                    updateField('colors', newColors);
                                }}
                            >
                                <Plus size={24} className="text-gray-400" />
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 pt-4 mt-2 grid grid-cols-2 gap-4">
                        <div className="col-span-2 border border-gray-700 rounded p-3 bg-gray-900/50 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed X (Min)</label>
                                <NumericInput value={emitter.speedXMin ?? -0.05} onChange={val => updateField('speedXMin', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed X (Max)</label>
                                <NumericInput value={emitter.speedXMax ?? 0.05} onChange={val => updateField('speedXMax', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed Y (Min)</label>
                                <NumericInput value={emitter.speedYMin ?? -0.05} onChange={val => updateField('speedYMin', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed Y (Max)</label>
                                <NumericInput value={emitter.speedYMax ?? 0.05} onChange={val => updateField('speedYMax', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed Z (Min)</label>
                                <NumericInput value={emitter.speedZMin ?? 0} onChange={val => updateField('speedZMin', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Speed Z (Max)</label>
                                <NumericInput value={emitter.speedZMax ?? 0.02} onChange={val => updateField('speedZMax', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Gravity</label>
                            <NumericInput value={emitter.gravity ?? 0} onChange={val => updateField('gravity', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Friction</label>
                            <NumericInput value={emitter.friction ?? 0.98} onChange={val => updateField('friction', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Start Size</label>
                            <NumericInput value={emitter.startSize ?? 1} onChange={val => updateField('startSize', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Size Growth</label>
                            <NumericInput value={emitter.sizeGrowth ?? 1.0} onChange={val => updateField('sizeGrowth', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Life (sec)</label>
                            <NumericInput value={emitter.life ?? 1} onChange={val => updateField('life', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Max Life (sec)</label>
                            <NumericInput value={emitter.maxLife ?? 1.5} onChange={val => updateField('maxLife', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Z-Offset (World)</label>
                            <NumericInput value={emitter.zOffset ?? 0} onChange={val => updateField('zOffset', val)} className="w-full bg-gray-800 text-white border border-gray-600 p-2 rounded text-sm outline-none" />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

