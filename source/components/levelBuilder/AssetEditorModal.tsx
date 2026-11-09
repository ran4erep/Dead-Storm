import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Sparkles } from 'lucide-react';
import { GenericDataEditor, DEFAULT_URL_PREFIXES, UrlPrefix } from './GenericDataEditor';
import { LocalizationEditor } from './LocalizationEditor';
import { ParticleEditorForm } from './ParticleEditorForm';
import { EnemyConstructor } from './EnemyConstructor';
import { DecorationConstructor } from './DecorationConstructor';
import { NpcConstructor } from './NpcConstructor';
import { ItemConstructor } from './ItemConstructor';

import { ASSETS } from '../../assets';
import { WORLD_MAP_PATHS, START_SECTOR_PATH, setStartSectorPath, TUTORIAL_SECTOR_PATH, setTutorialSectorPath, getGroupedSectorsFromGlob } from '../../data/levels';

const allSectors = import.meta.glob('../../data/levels/**/*.json', { eager: true });
import animationsData from '../../data/animations.json';
import creditsData from '../../data/credits.json';
import debuffsData from '../../data/de-buffs.json';
import decorationsData from '../../data/decorations.json';
import dialoguesData from '../../data/dialogues.json';
import enemiesData from '../../data/enemies.json';
import itemsData from '../../data/items.json';
import npcsData from '../../data/npcs.json';
import recipesData from '../../data/recipes.json';
import soundsData from '../../data/sounds.json';
import stringsEnData from '../../data/strings_en.json';
import stringsRuData from '../../data/strings_ru.json';
import particlesData from '../../data/particles.json';
import achievementsData from '../../data/achievements.json';
import { ParticleSimulator } from './ParticleSimulator';
import { CustomSelect } from './CustomSelect';

interface AssetEditorModalProps {
  mode: string;
  onClose: () => void;
  uiStrings: any;
  onLoadSector?: (path: string) => void;
  onEditSectorJson?: (path: string) => void;
  getSectorData?: (path: string) => any;
  editedSectorsRef?: React.MutableRefObject<Record<string, any>>;
}

export const AssetEditorModal: React.FC<AssetEditorModalProps> = ({ 
  mode, 
  onClose, 
  uiStrings, 
  onLoadSector, 
  onEditSectorJson, 
  getSectorData,
  editedSectorsRef
}) => {
  const [data, setData] = useState<any>(null);
  const [prefixes, setPrefixes] = useState<UrlPrefix[]>([]);
  const [previewParticleKey, setPreviewParticleKey] = useState<string>('');
  const [restartNonce, setRestartNonce] = useState<number>(0);
  const [viewTab, setViewTab] = useState<'editor' | 'json'>('editor');

  useEffect(() => {
    // Only load the default prefixes once when mounting
    setPrefixes([...DEFAULT_URL_PREFIXES]);
  }, []);

  useEffect(() => {
    if (mode.endsWith('.json')) {
      if (getSectorData) {
        setData(getSectorData(mode));
      }
      return;
    }
    switch (mode) {
      case 'assets': setData(JSON.parse(JSON.stringify(ASSETS))); break;
      case 'achievements': setData(JSON.parse(JSON.stringify(achievementsData))); break;
      case 'animations': setData(JSON.parse(JSON.stringify(animationsData))); break;
      case 'credits': setData(JSON.parse(JSON.stringify(creditsData))); break;
      case 'buffs': setData(JSON.parse(JSON.stringify(debuffsData))); break;
      case 'decorations': setData(JSON.parse(JSON.stringify(decorationsData))); break;
      case 'dialogues': setData(JSON.parse(JSON.stringify(dialoguesData))); break;
      case 'enemies': setData(JSON.parse(JSON.stringify(enemiesData))); break;
      case 'items': setData(JSON.parse(JSON.stringify(itemsData))); break;
      case 'sectors': setData({
        START_SECTOR_PATH,
        TUTORIAL_SECTOR_PATH,
        WORLD_MAP_PATHS: JSON.parse(JSON.stringify(WORLD_MAP_PATHS))
      }); break;
      case 'npcs': setData(JSON.parse(JSON.stringify(npcsData))); break;
      case 'recipes': setData(JSON.parse(JSON.stringify(recipesData))); break;
      case 'sounds': setData(JSON.parse(JSON.stringify(soundsData))); break;
      case 'particles': setData(JSON.parse(JSON.stringify(particlesData))); break;
      case 'localization': 
        setData({
          en: JSON.parse(JSON.stringify(stringsEnData)),
          ru: JSON.parse(JSON.stringify(stringsRuData))
        });
        break;
    }
  }, [mode]);

  const handleApply = () => {
    // Apply changes in memory
    const applyToTarget = (target: any, source: any) => {
        // Remove deleted keys
        Object.keys(target).forEach(key => {
            if (!(key in source)) {
                delete target[key];
            }
        });
        // Add or update keys
        Object.keys(source).forEach(key => {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                applyToTarget(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        });
    };

    if (mode.endsWith('.json')) {
       if (editedSectorsRef) {
         editedSectorsRef.current[mode] = data; // Keep entirely new object ref
       }
    } else {
      switch (mode) {
        case 'assets': applyToTarget(ASSETS, data); break;
        case 'achievements': applyToTarget(achievementsData, data); break;
        case 'animations': applyToTarget(animationsData, data); break;
        case 'credits': applyToTarget(creditsData, data); break;
        case 'buffs': applyToTarget(debuffsData, data); break;
        case 'decorations': applyToTarget(decorationsData, data); break;
        case 'dialogues': applyToTarget(dialoguesData, data); break;
        case 'enemies': applyToTarget(enemiesData, data); break;
        case 'items': applyToTarget(itemsData, data); break;
        case 'sectors': 
          WORLD_MAP_PATHS.length = 0;
          if (data && data.WORLD_MAP_PATHS) {
            data.WORLD_MAP_PATHS.forEach((levelArr: string[]) => WORLD_MAP_PATHS.push(levelArr));
          }
          if (data && data.START_SECTOR_PATH) {
             setStartSectorPath(data.START_SECTOR_PATH);
          }
          if (data && data.TUTORIAL_SECTOR_PATH) {
             setTutorialSectorPath(data.TUTORIAL_SECTOR_PATH);
          }
          break;
        case 'npcs': applyToTarget(npcsData, data); break;
        case 'recipes': applyToTarget(recipesData, data); break;
        case 'sounds': applyToTarget(soundsData, data); break;
        case 'particles': applyToTarget(particlesData, data); break;
        case 'localization': 
          applyToTarget(stringsEnData, data.en); 
          applyToTarget(stringsRuData, data.ru); 
          break;
      }
    }
    // Save prefixes to the DEFAULT_URL_PREFIXES array in memory as well
    if (mode === 'assets') {
      DEFAULT_URL_PREFIXES.length = 0;
      prefixes.forEach(p => DEFAULT_URL_PREFIXES.push(p));
    }
    
    onClose();
  };

  if (!data) return null;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[500] p-0 sm:p-4 font-mono">
      <div className="bg-gray-900 border-x-0 border-y-0 sm:border border-gray-700 w-full max-w-7xl h-[100dvh] sm:h-[95dvh] max-h-screen flex flex-col shadow-2xl overflow-hidden sm:rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-2 sm:p-4 border-b border-gray-800 bg-gray-900 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 truncate">
              {uiStrings.asset_editor || "Редактор"} - {mode.toUpperCase()}
            </h2>
            {(mode === 'enemies' || mode === 'decorations' || mode === 'npcs' || mode === 'items') && (
              <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800 text-xs font-bold font-sans shrink-0">
                <button
                  onClick={() => setViewTab('editor')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewTab === 'editor'
                      ? "bg-indigo-600 text-white shadow-md font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Конструктор
                </button>
                <button
                  onClick={() => setViewTab('json')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewTab === 'json'
                      ? "bg-indigo-600 text-white shadow-md font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Редактор JSON
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-500/20 text-red-500 rounded transition-colors shrink-0 ml-2">
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-4 custom-scrollbar bg-gray-950 flex flex-col gap-4">
          
          {mode === 'assets' && (
             <div className="bg-gray-900/40 border border-gray-800/50 p-2 sm:p-4 rounded flex flex-col gap-2 shrink-0">
                <h3 className="text-gray-400 font-bold text-xs sm:text-sm mb-1">{uiStrings.path_constants || 'Константы путей (URL Prefixes)'}</h3>
                {prefixes.map((p, idx) => (
                  <div key={idx} className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2 mb-2 w-full pb-2 xl:pb-0 border-b border-gray-800/50 xl:border-none">
                    <input
                        type="text"
                        value={p.label}
                        onChange={(e) => {
                          const newPrefixes = [...prefixes];
                          newPrefixes[idx].label = e.target.value;
                          setPrefixes(newPrefixes);
                        }}
                        placeholder="Label"
                        className="w-full xl:w-1/4 bg-gray-800 text-white border-b border-gray-700 focus:border-gray-500 p-1.5 sm:p-1 font-mono text-xs sm:text-sm focus:outline-none"
                    />
                     <div className="flex flex-1 gap-2">
                       <input
                          type="text"
                          value={p.value}
                          onChange={(e) => {
                            const newPrefixes = [...prefixes];
                            newPrefixes[idx].value = e.target.value;
                            setPrefixes(newPrefixes);
                          }}
                          placeholder="URL Value"
                          className="flex-1 min-w-0 bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button onClick={() => setPrefixes(prefixes.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-400 p-1 shrink-0 bg-gray-800/50 rounded"><Trash2 size={16} /></button>
                     </div>
                  </div>
                ))}
                <div className="flex mt-1 pt-2 border-t border-gray-800/50">
                    <button 
                        onClick={() => setPrefixes([...prefixes, { label: 'NEW_URL', value: 'https://' }])}
                        className="bg-blue-600/80 hover:bg-blue-500 text-white px-3 py-1.5 sm:py-1 rounded text-xs sm:text-sm flex items-center justify-center gap-1 w-full sm:w-auto"
                    >
                        <Plus size={16} className="sm:w-3.5 sm:h-3.5" /> {uiStrings.add_constant || 'Add Constant'}
                    </button>
                </div>
             </div>
          )}

          <div className="flex-1">
             {mode === 'localization' ? (
                <LocalizationEditor data={data} onChange={setData} label="Localization" />
             ) : mode === 'sectors' ? (
                <div className="flex flex-col gap-4">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2 px-1">
                    {uiStrings.sectors_description || "Выберите сектор для загрузки в редактор уровней или редактирования JSON файла."}
                  </div>
                  {getGroupedSectorsFromGlob(allSectors).map((group, groupIdx) => (
                    <div key={groupIdx} className="mb-4 text-sm sm:text-base">
                      <h4 className="text-gray-300 font-bold mb-2 border-b border-gray-800 pb-1 px-1">
                        {group.name}
                      </h4>
                      <div className="flex flex-col gap-1">
                        {group.paths.map((path, sectorIdx) => (
                          <div key={sectorIdx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-gray-900/50 p-2 sm:p-2 rounded border border-transparent hover:border-gray-800/50 gap-2 sm:gap-4 transition-colors">
                            <span className="text-blue-400/90 text-xs sm:text-sm break-all w-full sm:w-auto flex-1 font-mono">{path}</span>
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                              {onEditSectorJson && (
                                <button
                                  className="bg-indigo-600/80 hover:bg-indigo-500 text-white px-3 py-1.5 sm:py-1 rounded text-xs font-bold transition-colors flex-1 sm:flex-none uppercase tracking-wider"
                                  onClick={() => onEditSectorJson(path)}
                                >
                                  JSON
                                </button>
                              )}
                              {onLoadSector && (
                                <button
                                  className="bg-green-600/80 hover:bg-green-500 text-white px-3 py-1.5 sm:py-1 rounded text-xs font-bold transition-colors flex-[2] sm:flex-none uppercase tracking-wider"
                                  onClick={() => onLoadSector(path)}
                                >
                                  {uiStrings.load_into_editor || "В РЕДАКТОР"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  <div className="mt-6 sm:mt-8 border-t border-gray-800 pt-4 px-1">
                    <h4 className="text-gray-400 font-bold mb-3 text-xs sm:text-sm uppercase tracking-wider">
                      {uiStrings.edit_paths || "Редактировать пути (WORLD_MAP_PATHS)"}
                    </h4>
                    <GenericDataEditor data={data} onChange={setData} label="WORLD_MAP_PATHS" urlPrefixes={prefixes} uiStrings={uiStrings} />
                  </div>
                </div>
             ) : mode === 'particles' ? (
                <div className="flex flex-col lg:flex-row w-full gap-5 items-start px-1 relative">
                   {/* Simulator Preview Sticky Column - Always in View */}
                   <div className="order-1 lg:order-2 w-full lg:w-[420px] xl:w-[460px] shrink-0 sticky top-0 z-30 bg-gray-950/95 backdrop-blur-md pb-3 lg:pb-0 border-b border-gray-800 lg:border-none">
                       <div className="flex flex-col gap-2">
                           <div className="flex items-center justify-between">
                               <h3 className="text-fuchsia-400 font-bold uppercase tracking-widest text-xs sm:text-sm flex gap-2 items-center">
                                  <Sparkles size={16} /> {uiStrings.simulator || 'Симулятор частицы'}
                               </h3>
                               <button 
                                   onClick={() => setRestartNonce(n => n + 1)} 
                                   className="text-xs bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 px-2.5 py-1 rounded border border-gray-700 transition-colors flex items-center gap-1 font-mono"
                               >
                                   Перезапустить
                               </button>
                           </div>
                           <div className="h-56 sm:h-72 lg:h-[380px] w-full shrink-0 rounded-xl overflow-hidden border border-gray-800 shadow-2xl bg-black/80 relative">
                              <ParticleSimulator particleDef={data && previewParticleKey ? data[previewParticleKey] : null} uiStrings={uiStrings} restartNonce={restartNonce} />
                           </div>
                       </div>
                   </div>

                   {/* Form Controls Column */}
                   <div className="order-2 lg:order-1 flex-1 min-w-0 flex flex-col gap-3 w-full">
                       <div className="flex gap-2 items-center bg-gray-900 p-2.5 rounded-xl border border-gray-800 shadow-lg">
                           <CustomSelect 
                              value={previewParticleKey}
                              onChange={(e) => setPreviewParticleKey(e.target.value)}
                              className="bg-gray-800 text-white border border-gray-700 p-2 rounded text-sm w-full outline-none focus:border-fuchsia-500 flex-1 font-mono"
                           >
                              <option value="">-- Выберите частицу --</option>
                              {data && Object.keys(data).map(k => (
                                 <option key={k} value={k}>{k}</option>
                              ))}
                           </CustomSelect>
                           <button 
                               onClick={() => {
                                   let i = 1;
                                   let newId = `new_emitter_${i}`;
                                   while (data[newId]) { i++; newId = `new_emitter_${i}`; }
                                   setData({ ...data, [newId]: { 
                                       id: newId, 
                                       name: 'New Emitter', 
                                       colors: ["rgba(255, 150, 0, 0.9)", "rgba(255, 200, 50, 0.9)", "rgba(255, 50, 0, 0.8)"], 
                                       spawnRate: 15,
                                       startSize: 1.0,
                                       sizeGrowth: 1.015,
                                       life: 1.0,
                                       maxLife: 1.5,
                                       speedXMin: -0.015,
                                       speedXMax: 0.015,
                                       speedYMin: -0.015,
                                       speedYMax: 0.015,
                                       speedZMin: 0.01,
                                       speedZMax: 0.03,
                                       gravity: 0.0008,
                                       friction: 0.98,
                                       zOffset: 0.0
                                   } });
                                   setPreviewParticleKey(newId);
                               }}
                               className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg flex items-center justify-center font-bold text-xs gap-1 transition-colors shrink-0" 
                               title="Новый эмиттер"
                           >
                               <Plus size={18} />
                               <span className="hidden sm:inline">Новый</span>
                           </button>
                           {previewParticleKey && (
                               <button 
                                   onClick={() => {
                                       const newData = { ...data };
                                       delete newData[previewParticleKey];
                                       setData(newData);
                                       setPreviewParticleKey('');
                                   }}
                                   className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg flex items-center justify-center font-bold text-xs gap-1 transition-colors shrink-0" 
                                   title="Удалить"
                               >
                                   <Trash2 size={18} />
                               </button>
                           )}
                       </div>
                       
                       <ParticleEditorForm data={data} onChange={setData} currentKey={previewParticleKey} onKeyChange={setPreviewParticleKey} uiStrings={uiStrings} />
                   </div>
                </div>
             ) : (
                <div className="px-1">
                  {mode === 'enemies' ? (
                    viewTab === 'editor' ? (
                      <EnemyConstructor data={data} onChange={setData} uiStrings={uiStrings} />
                    ) : (
                      <GenericDataEditor data={data} onChange={setData} label={mode} urlPrefixes={prefixes} uiStrings={uiStrings} />
                    )
                  ) : mode === 'decorations' ? (
                    viewTab === 'editor' ? (
                      <DecorationConstructor data={data} onChange={setData} uiStrings={uiStrings} />
                    ) : (
                      <GenericDataEditor data={data} onChange={setData} label={mode} urlPrefixes={prefixes} uiStrings={uiStrings} />
                    )
                  ) : mode === 'npcs' ? (
                    viewTab === 'editor' ? (
                      <NpcConstructor data={data} onChange={setData} uiStrings={uiStrings} />
                    ) : (
                      <GenericDataEditor data={data} onChange={setData} label={mode} urlPrefixes={prefixes} uiStrings={uiStrings} />
                    )
                  ) : mode === 'items' ? (
                    viewTab === 'editor' ? (
                      <ItemConstructor data={data} onChange={setData} uiStrings={uiStrings} />
                    ) : (
                      <GenericDataEditor data={data} onChange={setData} label={mode} urlPrefixes={prefixes} uiStrings={uiStrings} />
                    )
                  ) : (
                    <GenericDataEditor data={data} onChange={setData} label={mode} urlPrefixes={prefixes} uiStrings={uiStrings} />
                  )}
                </div>
             )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-800 bg-gray-900 flex justify-end gap-2 text-sm shrink-0">
           <button 
            onClick={handleApply}
            className="px-6 py-2 sm:py-1.5 bg-green-600/90 hover:bg-green-500 text-white font-bold rounded flex items-center justify-center gap-2 w-full sm:w-auto uppercase tracking-wider text-xs sm:text-sm transition-colors border border-green-500/50 shadow-[0_0_15px_rgba(22,163,74,0.2)]"
           >
            <Save size={16} className="sm:w-[18px] sm:h-[18px]" /> {uiStrings.apply || 'Применить'}
           </button>
        </div>
      </div>
    </div>
  );
};
