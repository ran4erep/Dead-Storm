import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { LevelDefinition } from '../../types';
import soundsData from '../../data/sounds.json';
import { resolveSoundBrushSymbol } from './levelBuilderUtils';
import { CustomSelect } from './CustomSelect';

interface SoundSettingsModalProps {
    show: boolean;
    onClose: () => void;
    brushConfig: any;
    setBrushConfig: (config: any) => void;
    level: LevelDefinition;
    setLevel: (lvl: LevelDefinition) => void;
    uiStrings: any;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({
    show, onClose, brushConfig, setBrushConfig, level, setLevel, uiStrings
}) => {
    if (!show) return null;

    const soundOptions = Object.keys(soundsData);

    const handleUpdateField = (field: string, value: any) => {
         setBrushConfig({ ...brushConfig, [field]: value });
    };

    return (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[300]">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 max-h-[90dvh] overflow-y-auto relative font-['Jura'] text-gray-200">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                   <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4">{uiStrings.sound_settings || 'Настройки источника звука'}</h2>
                
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col">
                        <label className="text-sm text-gray-400 mb-1">{uiStrings.sound_id || 'Звук'}:</label>
                        <CustomSelect 
                            value={brushConfig.id || ''}
                            onChange={(e) => handleUpdateField('id', e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded px-2 py-2 text-sm max-w-full"
                        >
                            <option value="">{uiStrings.sound_select || '-- Выбрать --'}</option>
                            {soundOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </CustomSelect>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">{uiStrings.sound_symbol || 'Символ (Авто)'}:</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={brushConfig.symbol || ''} 
                                    onChange={(e) => {
                                        const c = e.target.value;
                                        handleUpdateField('symbol', c.length > 0 ? c[c.length - 1] : '');
                                    }}
                                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1 w-12 text-center text-xl font-bold font-mono"
                                />
                                <span className="text-xs text-gray-500">
                                   {uiStrings.sound_symbol_reset || '(Сбросьте, чтобы создать новый)'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex flex-col flex-1">
                            <label className={`text-sm text-gray-400 mb-1 ${brushConfig.loop ? 'opacity-40' : ''}`}>{uiStrings.sound_min_interval || 'Min interval (ms)'}:</label>
                            <input 
                                type="number" 
                                disabled={!!brushConfig.loop}
                                value={brushConfig.minInterval === '' ? '' : (brushConfig.minInterval ?? 2000)} 
                                onChange={(e) => handleUpdateField('minInterval', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm outline-none ${brushConfig.loop ? 'opacity-40 cursor-not-allowed' : ''}`}
                            />
                        </div>
                        <div className="flex flex-col flex-1">
                            <label className={`text-sm text-gray-400 mb-1 ${brushConfig.loop ? 'opacity-40' : ''}`}>{uiStrings.sound_max_interval || 'Max interval (ms)'}:</label>
                            <input 
                                type="number" 
                                disabled={!!brushConfig.loop}
                                value={brushConfig.maxInterval === '' ? '' : (brushConfig.maxInterval ?? 5000)} 
                                onChange={(e) => handleUpdateField('maxInterval', e.target.value === '' ? '' : Number(e.target.value))}
                                className={`bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm outline-none ${brushConfig.loop ? 'opacity-40 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex flex-col flex-1">
                            <label className="text-sm text-gray-400 mb-1">{uiStrings.sound_radius || 'Radius (tiles)'}:</label>
                            <input 
                                type="number" 
                                value={brushConfig.radius === '' ? '' : (brushConfig.radius ?? 10)} 
                                onChange={(e) => handleUpdateField('radius', e.target.value === '' ? '' : Number(e.target.value))}
                                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm outline-none"
                            />
                        </div>
                        <div className="flex flex-col flex-1 justify-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 select-none">
                                <input 
                                    type="checkbox" 
                                    checked={!!brushConfig.loop} 
                                    onChange={(e) => handleUpdateField('loop', e.target.checked)}
                                    className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>{uiStrings.sound_loop || 'Постоянный повтор (Loop)'}</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 mt-6">
                    <button 
                        onClick={onClose}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm"
                    >
                        {uiStrings.btn_cancel || 'Cancel'}
                    </button>
                    <button 
                        onClick={() => {
                            const { symbol, newSoundConfig } = resolveSoundBrushSymbol(brushConfig, level);
                            if (newSoundConfig && symbol) {
                                const sounds = [...(level.ambientSounds || [])];
                                const existingIdx = sounds.findIndex((s: any) => s.symbol === symbol);
                                if (existingIdx >= 0) {
                                    sounds[existingIdx] = newSoundConfig;
                                } else {
                                    sounds.push(newSoundConfig);
                                }
                                setLevel({ ...level, ambientSounds: sounds });
                                setBrushConfig(newSoundConfig);
                            } else if (symbol) {
                                setBrushConfig({ ...(level.ambientSounds?.find((s: any) => s.symbol === symbol) || brushConfig), symbol });
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
    );
};
