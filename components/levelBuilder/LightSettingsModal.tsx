import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { LevelDefinition } from '../../types';
import { resolveLightBrushSymbol } from './levelBuilderUtils';
import { CustomColorPicker } from './CustomColorPicker';
import { CustomSelect } from './CustomSelect';

interface LightSettingsModalProps {
    show: boolean;
    onClose: () => void;
    brushConfig: any;
    setBrushConfig: (config: any) => void;
    level: LevelDefinition;
    setLevel: (lvl: LevelDefinition) => void;
    uiStrings: any;
}

export const LightSettingsModal: React.FC<LightSettingsModalProps> = ({
    show, onClose, brushConfig, setBrushConfig, level, setLevel, uiStrings
}) => {
    const getHexColor = () => {
        if (brushConfig && brushConfig.r !== undefined) {
             const r = Math.max(0, Math.min(255, parseInt(brushConfig.r as string) || 0)).toString(16).padStart(2, '0');
             const g = Math.max(0, Math.min(255, parseInt(brushConfig.g as string) || 0)).toString(16).padStart(2, '0');
             const b = Math.max(0, Math.min(255, parseInt(brushConfig.b as string) || 0)).toString(16).padStart(2, '0');
             return `#${r}${g}${b}`;
        }
        return '#ffffff';
    };

    const hexColor = getHexColor();

    if (!show) return null;



    const handleUpdateField = (field: string, value: any) => {
         setBrushConfig({ ...brushConfig, [field]: value });
    };

    return (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[300]">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 max-h-[90dvh] overflow-y-auto relative font-['Jura'] text-gray-200">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                   <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4">{uiStrings.light_settings || 'Настройки источника света'}</h2>
                
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-24 shrink-0">
                            <label className="block text-sm text-gray-400 mb-1">{uiStrings.symbol || 'Символ'}</label>
                            <input 
                                value={brushConfig.symbol && brushConfig.symbol !== '.' ? brushConfig.symbol : ''}
                                onChange={e => setBrushConfig({ ...brushConfig, symbol: e.target.value.charAt(0) })}
                                placeholder="Auto"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-center font-bold"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm text-gray-400 mb-1">{uiStrings.color || 'Цвет'}:</label>
                            <div className="flex gap-2 items-center">
                                <CustomColorPicker 
                                    color={hexColor} 
                                    onChange={(color) => {
                                        const r = parseInt(color.slice(1, 3), 16) || 0;
                                        const g = parseInt(color.slice(3, 5), 16) || 0;
                                        const b = parseInt(color.slice(5, 7), 16) || 0;
                                        if (r !== brushConfig.r || g !== brushConfig.g || b !== brushConfig.b) {
                                            setBrushConfig({
                                                ...brushConfig,
                                                r, g, b
                                            });
                                        }
                                    }} 
                                />
                                <div className="flex gap-2 text-xs text-gray-500 font-mono tracking-tighter ml-2">
                                    <span>R:{brushConfig.r ?? 255}</span>
                                    <span>G:{brushConfig.g ?? 255}</span>
                                    <span>B:{brushConfig.b ?? 255}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                         <label className="block text-sm text-gray-400 mb-1">{uiStrings.mode || 'Режим работы'}:</label>
                         <CustomSelect 
                             value={brushConfig.mode || 'STATIC'}
                             onChange={(e) => handleUpdateField('mode', e.target.value)}
                             className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                         >
                             <option value="STATIC">STATIC</option>
                             <option value="FLICKERING">FLICKERING</option>
                             <option value="FIRE">FIRE</option>
                         </CustomSelect>
                    </div>

                    <div className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4 mt-2">
                        {brushConfig.mode === 'FLICKERING' && (
                            <>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">{uiStrings.light_flicker_period || 'Интервал (мс)'}:</label>
                                    <input 
                                        type="text" 
                                        value={brushConfig.flickerPeriod ?? ''}
                                        onChange={(e) => handleUpdateField('flickerPeriod', e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 font-mono text-gray-300"
                                        placeholder="3000 / 3000-6000"
                                    />
                                </div>
                                <div className="mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={brushConfig.flickerAlwaysOn ?? true}
                                            onChange={(e) => handleUpdateField('flickerAlwaysOn', e.target.checked)}
                                            className="accent-indigo-500 w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-400">{uiStrings.light_flicker_always_on || 'Горит постоянно между миганиями'}</span>
                                    </label>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">{uiStrings.intensity || 'Яркость (0.1 - 2.0)'}:</label>
                            <input 
                                type="number" 
                                min="0.1" max="2.0" step="0.1" 
                                value={brushConfig.intensity ?? 1}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    handleUpdateField('intensity', isNaN(val) ? '' : val);
                                }}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 font-mono text-gray-300"
                                placeholder="1.0"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">{uiStrings.range || 'Радиус'} ({uiStrings.tiles || 'в тайлах'}):</label>
                            <input 
                                type="number" 
                                min="1" max="20" step="1" 
                                value={brushConfig.range ?? 5}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleUpdateField('range', isNaN(val) ? '' : val);
                                }}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 font-mono text-gray-300"
                                placeholder="5"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">{uiStrings.light_max_height || 'Макс. высота'}:</label>
                            <input 
                                type="number" 
                                min="0" max="8" step="1" 
                                value={brushConfig.maxHeight ?? 0}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleUpdateField('maxHeight', isNaN(val) ? '' : val);
                                }}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 font-mono text-gray-300"
                                placeholder="0"
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-4 mt-6">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm"
                        >
                            {uiStrings.btn_cancel || "Cancel"}
                        </button>
                        <button 
                            onClick={() => {
                                const { symbol, newLightConfig } = resolveLightBrushSymbol(brushConfig, level);
                                if (newLightConfig && symbol && symbol !== '.') {
                                   const newDefs = { ...(level.lightDefinitions || {}) };
                                   newDefs[symbol] = newLightConfig;
                                   setLevel({ ...level, lightDefinitions: newDefs });
                                   setBrushConfig({ type: 'light', ...newLightConfig, symbol });
                                } else if (symbol && symbol !== '.') {
                                   setBrushConfig({ type: 'light', ...(level.lightDefinitions?.[symbol] || brushConfig), symbol });
                                }
                                onClose();
                            }} 
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded text-white transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] tracking-widest uppercase text-sm"
                        >
                            {uiStrings.btn_create || 'Create'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
