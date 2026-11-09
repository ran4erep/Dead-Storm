import React, { useState, useEffect } from 'react';
import { Save, X, Trash2 } from 'lucide-react';

interface SaveModalProps {
    engine: any;
    strings: any;
    onClose: () => void;
}

const SaveModal: React.FC<SaveModalProps> = ({ engine, strings, onClose }) => {
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

    useEffect(() => {
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
    }, []);

    const serializeGame = () => {
        // Prepare main data
        const enemiesArray = Array.from(engine.enemies.entries());
        
        // Prepare sector states
        const sectors: any = {};
        if (engine.sectorStatesRef && engine.sectorStatesRef.current) {
            engine.sectorStatesRef.current.forEach((value: any, key: string) => {
                sectors[key] = {
                    levelData: value.levelData,
                    enemies: Array.from(value.enemies.entries()),
                    roamingAnims: value.roamingAnims,
                    decalEvents: value.decalEvents || []
                };
            });
        }

        // Ensure current sector state is properly included in sectorStates cache
        if (engine.currentLevelPath && engine.levelData) {
            sectors[engine.currentLevelPath] = {
                levelData: engine.levelData,
                enemies: Array.from(engine.enemies.entries()),
                roamingAnims: engine.roamingAnims || [],
                decalEvents: engine.getCurrentDecalEvents ? engine.getCurrentDecalEvents() : []
            };
        }

        const saveData = {
            player: engine.player,
            levelData: engine.levelData,
            enemies: enemiesArray,
            currentLevelPath: engine.currentLevelPath,
            sectorStates: sectors,
            roamingAnims: engine.roamingAnims
        };

        const screenshot = engine.raycasterRef?.current?.getScreenshot ? engine.raycasterRef.current.getScreenshot() : null;

        const metadata = {
            timestamp: Date.now(),
            level: engine.player.level,
            hp: engine.player.hp,
            maxHp: engine.player.maxHp,
            name: engine.player.characterId === 'female' ? "Лилит/Lilith" : "Джон/John",
            locationName: engine.levelData?.rawName || engine.levelData?.name || engine.currentLevelPath,
            screenshot
        };

        return { metadata, saveData };
    };

    const handleSave = (slotIndex: number) => {
        try {
            const fullSave = serializeGame();
            localStorage.setItem(`deadstorm_save_${slotIndex}`, JSON.stringify(fullSave));
            
            const newSlots = [...slots];
            newSlots[slotIndex - 1] = fullSave.metadata;
            setSlots(newSlots);

            if (engine.playSound) {
                engine.playSound('SAVE');
            }
            if (engine.addLog) {
                engine.addLog(uiStrings.saved_success, 'SUCCESS');
            }
            onClose();
        } catch (e) {
            console.error("Failed to save:", e);
            if (engine.addLog) {
                engine.addLog(uiStrings.save_error, 'DANGER');
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
            // Re-use engine language, or default to checking if Russian is active
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
        <div className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300 font-['Jura']"
             onMouseDown={(e) => e.stopPropagation()} 
             onTouchStart={(e) => e.stopPropagation()}
        >
            <div className="bg-gray-800 border border-gray-600 w-full max-w-sm rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
                    <div className="w-6"></div>
                    <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase flex items-center">
                        <Save className="w-4 h-4 mr-2" />
                        {uiStrings.title_save}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white active:text-white flex items-center gap-1 transition-colors touch-manipulation gamepad-hide-buttons">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 flex flex-col items-center overflow-y-auto bg-gray-800/95 relative space-y-4 w-full">
                    {[1, 2, 3].map((slotNum) => {
                        const meta = slots[slotNum - 1];
                        return (
                            <div key={slotNum} className="w-full bg-gray-900/50 border border-gray-700 rounded p-3 flex flex-col relative overflow-hidden shrink-0">
                                {meta ? (
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
                                ) : (
                                    <div className="flex gap-3 mb-3 items-center justify-start">
                                        <div className="bg-gray-950 border border-gray-700 text-gray-400 text-xs font-mono font-bold px-2 py-1 rounded select-none">
                                            0{slotNum}
                                        </div>
                                        <div className="text-gray-500 italic text-xs tracking-widest uppercase font-semibold pl-1">
                                            {uiStrings.empty}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-auto flex gap-2">
                                    <button 
                                        onClick={() => handleSave(slotNum)}
                                        className="flex-1 py-2 bg-green-900/40 border border-green-700/40 text-green-400 font-bold rounded flex items-center justify-center gap-2 uppercase tracking-widest text-xs transition-all active:bg-green-900/60"
                                    >
                                        <Save className="w-4 h-4" />
                                        {uiStrings.btn_save}
                                    </button>
                                    {meta && (
                                        <button 
                                            onClick={() => handleClear(slotNum)}
                                            className="px-3 py-2 bg-red-900/40 border border-red-700/40 text-red-500 font-bold rounded flex items-center justify-center transition-all active:bg-red-900/60"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default SaveModal;
