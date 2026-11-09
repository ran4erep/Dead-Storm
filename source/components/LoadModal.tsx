import React, { useState, useEffect } from 'react';
import { Trash2, Save, ChevronLeft } from 'lucide-react';
import { GameState } from '../types';

interface LoadModalProps {
    engine: any;
    strings: any;
    onClose: () => void;
}

const LoadModal: React.FC<LoadModalProps> = ({ engine, strings, onClose }) => {
    const [slots, setSlots] = useState<any[]>([null, null, null]);

    // Derived strings
    const uiStrings = strings?.ui?.save_load || {
        title_save: "SAVE GAME",
        title_load: "LOAD GAME",
        slot: "SLOT",
        empty: "EMPTY",
        lvl: "Lvl",
        btn_save: "Save",
        btn_load: "Load",
        btn_export: "Export",
        btn_import: "Import",
        saved_success: "Game saved successfully.",
        loaded_success: "Game loaded successfully.",
        save_error: "Not enough space to save.",
        load_error: "Data corruption / load error."
    };
    
    const closeText = strings?.ui?.settings?.btn_close || 
                      (engine?.settings?.language === 'ru' ? 'ЗАКРЫТЬ' : 'CLOSE');

    const refreshSlots = () => {
        const loadedSlots = [];
        for (let i = 1; i <= 3; i++) {
            const data = localStorage.getItem(`deadstorm_save_${i}`);
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    loadedSlots.push(parsed.metadata);
                } catch (e) {
                    loadedSlots.push(null);
                }
            } else {
                loadedSlots.push(null);
            }
        }
        setSlots(loadedSlots);
    };

    useEffect(() => {
        refreshSlots();
    }, []);

    const handleLoad = (slotIndex: number) => {
        const data = localStorage.getItem(`deadstorm_save_${slotIndex}`);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (engine.loadSavedGame) {
                    if (engine.playSound) {
                        engine.playSound('LOAD');
                    }
                    engine.loadSavedGame(parsed.saveData);
                    onClose();
                } else {
                    console.error("loadSavedGame is not available on engine object");
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleClear = (slotIndex: number) => {
        localStorage.removeItem(`deadstorm_save_${slotIndex}`);
        const newSlots = [...slots];
        newSlots[slotIndex - 1] = null;
        setSlots(newSlots);
    };

    const localizeString = (text: string | undefined): string => {
        if (!text) return "";
        let localizedText = text;
        const idx = text.indexOf('/');
        if (idx !== -1) {
            const lang = engine?.settings?.language || (strings?.ui?.menu?.title === 'DEAD STORM' ? 'en' : 'ru');
            localizedText = lang === 'ru' ? text.substring(0, idx).trim() : text.substring(idx + 1).trim();
        }
        return localizedText;
    };

    const getCharName = (nameOrId: string) => {
        if (nameOrId === 'female') return strings?.ui?.char_select?.female_name || "LILITH VANE";
        if (nameOrId === 'male') return strings?.ui?.char_select?.male_name || "JOHN MASON";
        return localizeString(nameOrId);
    };

    return (
        <div className="absolute inset-0 z-[110] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']"
             onMouseDown={(e) => e.stopPropagation()} 
             onTouchStart={(e) => e.stopPropagation()}
        >
            <div className="bg-gray-800 border border-gray-600 w-full max-w-sm rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10 relative">
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="text-gray-400 hover:text-white active:scale-95 transition-all flex items-center justify-center mr-1">
                            <ChevronLeft size={24} />
                        </button>
                        <Save size={18} className="text-gray-400" />
                        <h2 className="text-lg font-bold text-white tracking-widest uppercase">
                            {uiStrings.title_load}
                        </h2>
                    </div>
                </div>
                
                <div className="p-4 flex flex-col items-center overflow-y-auto bg-gray-800/95 relative space-y-4 w-full">
                    {slots.every(meta => !meta) ? (
                        <div className="w-full py-8 text-center text-gray-500 italic tracking-widest text-xs uppercase font-semibold">
                            {uiStrings.no_saves || "НЕТ СОХРАНЕНИЙ"}
                        </div>
                    ) : (
                        [1, 2, 3].map((slotNum) => {
                            const meta = slots[slotNum - 1];
                            if (!meta) return null;
                            return (
                                <div key={slotNum} className="w-full bg-gray-900/50 border border-gray-700 rounded p-3 flex flex-col relative overflow-hidden shrink-0">
                                    <div className="flex gap-3 mb-3 items-center">
                                        <div className="w-1/3 shrink-0 relative aspect-[4/3] rounded border border-gray-600 bg-gray-950 overflow-hidden flex items-center justify-center">
                                            {meta.screenshot ? (
                                                <img src={meta.screenshot} className="w-full h-full object-cover animate-fade-in" alt="Screenshot" />
                                            ) : (
                                                <div className="w-full h-full bg-gray-950 flex items-center justify-center text-gray-600 tracking-widest uppercase font-mono text-[9px]">
                                                    STORM
                                                </div>
                                            )}
                                            {/* Стилизованный ярлык слота на скриншоте */}
                                            <div className="absolute top-1 left-1 bg-cyan-950/90 border border-cyan-500/50 text-cyan-400 text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-[0_0_8px_rgba(6,182,212,0.3)] font-mono leading-none z-10 select-none">
                                                0{slotNum}
                                            </div>
                                        </div>
                                        <div className="text-gray-400 text-xs flex-1 space-y-1 min-w-0">
                                            <div className="text-white font-bold truncate">{getCharName(meta.name)} - {uiStrings.lvl} {meta.level}</div>
                                            <div className="text-emerald-400">{meta.hp}/{meta.maxHp} HP</div>
                                            <div className="text-cyan-400 truncate">{localizeString(meta.locationName || meta.levelPath)}</div>
                                            <div className="text-gray-500 text-[10px] sm:text-xs">{new Date(meta.timestamp).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div className="mt-auto flex gap-2">
                                        <button 
                                            onClick={() => handleLoad(slotNum)}
                                            className="flex-1 py-2 border rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all font-bold bg-green-900/40 border-green-700/40 text-green-400 active:bg-green-900/60"
                                        >
                                            <Save className="w-4 h-4" />
                                            {uiStrings.btn_load}
                                        </button>
                                        <button 
                                            onClick={() => handleClear(slotNum)}
                                            className="px-3 py-2 bg-red-900/40 border border-red-700/40 text-red-500 font-bold rounded flex items-center justify-center transition-all active:bg-red-900/60"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    
                    {/* Footer Action */}
                    <div className="w-full pt-2 shrink-0">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
                        >
                            {closeText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadModal;

