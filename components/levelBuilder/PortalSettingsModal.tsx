import React, { useState, useEffect } from "react";
import { LevelDefinition } from "../../types";
import { X } from "lucide-react";
import { resolvePortalBrushSymbol, getPreviewSrc, isTextureAsset } from "./levelBuilderUtils";
import { getAllSectorPathsFromGlob } from "../../data/levels";
import { ASSETS } from "../../assets";

const allSectors = import.meta.glob('../../data/levels/**/*.json', { eager: true });
import { AssetPicker } from "./AssetPicker";
import { CustomSelect } from './CustomSelect';

interface PortalSettingsModalProps {
  show: boolean;
  onClose: () => void;
  brushConfig: any;
  setBrushConfig: (config: any) => void;
  level: LevelDefinition;
  setLevel: React.Dispatch<React.SetStateAction<LevelDefinition>>;
  uiStrings: any;
}

export const PortalSettingsModal: React.FC<PortalSettingsModalProps> = ({
  show,
  onClose,
  brushConfig,
  setBrushConfig,
  level,
  setLevel,
  uiStrings,
}) => {
  const [texturePickerTarget, setTexturePickerTarget] = useState<string | null>(null);
  const [availableTargetPortals, setAvailableTargetPortals] = useState<string[]>([]);
  const [activeTabs, setActiveTabs] = useState<{id: string, label: string}[]>([]);

  useEffect(() => {
    try {
      const tabsJson = sessionStorage.getItem("editor_test_tabs");
      if (tabsJson) {
        const tabs = JSON.parse(tabsJson);
        setActiveTabs(tabs.map((t: any) => ({
          id: t.level?.originalPath || t.id,
          label: t.label || 'Tab'
        })));
      }
    } catch (e) {
      console.error(e);
    }
  }, [show]);

  useEffect(() => {
    if (!show || !brushConfig.destination) {
      setAvailableTargetPortals([]);
      return;
    }

    let isMounted = true;

    // Check if it's a tab ID or tab's originalPath
    let isTab = false;
    let tabPortals: any[] = [];
    try {
      const tabsJson = sessionStorage.getItem("editor_test_tabs");
      if (tabsJson) {
        const tabs = JSON.parse(tabsJson);
        const activeTab = tabs.find((t: any) => t.id === brushConfig.destination || (t.level && t.level.originalPath === brushConfig.destination));
        if (activeTab && activeTab.level && activeTab.level.portals) {
          tabPortals = activeTab.level.portals;
          isTab = true;
        }
      }
    } catch (e) {
      console.error(e);
    }

    if (isTab) {
      setAvailableTargetPortals(tabPortals.map((p: any) => p.portalId).filter(Boolean));
      return;
    }

    fetch(brushConfig.destination)
      .then(res => {
        if (!res.ok) throw new Error("Could not fetch level data");
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Response is not JSON");
        }
        return res.json();
      })
      .then((data: any) => {
        if (isMounted) {
          const portals = data.portals || [];
          setAvailableTargetPortals(portals.map((p: any) => p.portalId).filter(Boolean));
        }
      })
      .catch((e) => {
        // Silently ignore fetch errors (e.g. when destination is an internal tab id not yet saved or invalid path)
        if (isMounted) setAvailableTargetPortals([]);
      });

    return () => { isMounted = false; };
  }, [brushConfig.destination, show]);

  if (!show) return null;

  const handleChange = (key: string, value: any) => {
    setBrushConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    if (brushConfig.symbol) {
      setLevel((prevLevel: LevelDefinition) => {
        const nextLevel = { ...prevLevel };
        if (nextLevel.portals) {
          const portalIndex = nextLevel.portals.findIndex(p => p.symbol === brushConfig.symbol);
          if (portalIndex !== -1) {
            nextLevel.portals[portalIndex] = { ...brushConfig };
          }
        }
        return nextLevel;
      });
      setBrushConfig({ ...brushConfig });
    } else {
      const { symbol, newPortalConfig } = resolvePortalBrushSymbol(brushConfig, level);
      
      setLevel((prevLevel: LevelDefinition) => {
        const nextLevel = { ...prevLevel };
        const portals = nextLevel.portals ? [...nextLevel.portals] : [];
        if (newPortalConfig) {
          portals.push(newPortalConfig);
          nextLevel.portals = portals;
        }
        return nextLevel;
      });
      
      if (newPortalConfig) {
        setBrushConfig(newPortalConfig);
      }
    }
    
    onClose();
  };

  const allPaths = getAllSectorPathsFromGlob(allSectors);

  return (
    <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[300]">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90dvh] overflow-y-auto relative font-['Jura'] text-gray-200">
        <button
          onClick={handleApply}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold mb-4">
          Настройки портала
        </h2>

        {texturePickerTarget ? (
           <AssetPicker
               targetName={texturePickerTarget}
               uiStrings={uiStrings}
               onCancel={() => setTexturePickerTarget(null)}
               onSelect={(t) => {
                   setBrushConfig({ ...brushConfig, assetId: t });
                   setTexturePickerTarget(null);
               }}
           />
        ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-24 shrink-0">
               <label className="block text-sm text-gray-400 mb-1">Символ</label>
               <input 
                   value={brushConfig.symbol || ''}
                   onChange={e => handleChange('symbol', e.target.value.charAt(0))}
                   placeholder="Auto"
                   className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-center font-bold"
               />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                Иконка на карте (assetId)
              </label>
              <button 
                  onClick={() => setTexturePickerTarget('assetId')}
                  className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
              >
                  <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                      {brushConfig.assetId && getPreviewSrc(brushConfig.assetId) && (
                          <img src={getPreviewSrc(brushConfig.assetId)!} className={`w-full h-full ${isTextureAsset(brushConfig.assetId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                      )}
                  </div>
                  <span className="truncate">{brushConfig.assetId || 'Выбрать...'}</span>
              </button>
            </div>
          </div>

          <div>
             <label className="block text-sm text-gray-400 mb-1">Куда ведет (destination)</label>
             <div className="flex flex-col sm:flex-row gap-2">
                 <input 
                     value={brushConfig.destination || ''}
                     onChange={e => handleChange('destination', e.target.value)}
                     placeholder="Путь к уровню..."
                     className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                 />
                     <CustomSelect
                     value={brushConfig.destination || ''}
                     onChange={e => handleChange('destination', e.target.value)}
                     className="w-full sm:w-48 bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                 >
                     <option value="">Выберите...</option>
                     {activeTabs.length > 0 && <optgroup label="Текущие вкладки">
                         {activeTabs.map(t => <option key={t.id} value={t.id}>[Вкладка] {t.label}</option>)}
                     </optgroup>}
                     <optgroup label="Файлы уровней">
                       {allPaths.map(p => <option key={p} value={p}>{p}</option>)}
                     </optgroup>
                 </CustomSelect>
             </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
             <div className="flex-1">
                 <label className="block text-sm text-gray-400 mb-1">ID портала (portalId)</label>
                 <input 
                     value={brushConfig.portalId || ''}
                     onChange={e => handleChange('portalId', e.target.value)}
                     placeholder="ID текущего портала"
                     className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                 />
             </div>
             <div className="flex-1">
                 <label className="block text-sm text-gray-400 mb-1">Целевой ID (targetPortalId)</label>
                 <input 
                     list="targetPortalIdDatalist"
                     value={brushConfig.targetPortalId || ''}
                     onChange={e => handleChange('targetPortalId', e.target.value)}
                     placeholder="ID портала назначения"
                     className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                 />
                 <datalist id="targetPortalIdDatalist">
                    {availableTargetPortals.map(pid => (
                        <option key={pid} value={pid} />
                    ))}
                 </datalist>
             </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Направление после телепортации (targetDirection)</label>
            <CustomSelect
              value={brushConfig.targetDirection || 'N'}
              onChange={e => handleChange('targetDirection', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
            >
              <option value="N">Север</option>
              <option value="E">Восток</option>
              <option value="S">Юг</option>
              <option value="W">Запад</option>
            </CustomSelect>
          </div>
        </div>
        )}

        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm"
          >
            {uiStrings.btn_cancel || "Cancel"}
          </button>
          <button
            onClick={handleApply}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded text-white transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] tracking-widest uppercase text-sm"
          >
            {uiStrings.btn_create || "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};
