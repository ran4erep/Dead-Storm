import React, { useState, useEffect, useRef } from "react";
import {
  LevelDefinition,
  ScriptTrigger,
  ScriptAction,
  ScriptTriggerType,
  ScriptActionType,
} from "../../types";
import { X, Plus, Trash2, MapPin, ChevronDown, ChevronUp, ChevronRight, Copy, Play, Square, Power, Sliders, Repeat } from "lucide-react";
import soundsData from "../../data/sounds.json";
import enemiesData from "../../data/enemies.json";
import itemsData from "../../data/items.json";
import dialoguesData from "../../data/dialogues.json";
import npcsData from "../../data/npcs.json";
import decorationsData from "../../data/decorations.json";
import particlesData from "../../data/particles.json";
import achievementsData from "../../data/achievements.json";
import { AssetPicker } from "./AssetPicker";
import { TweakEntityModal } from "./TweakEntityModal";
import { CustomSelect } from './CustomSelect';
import { getPreviewSrc, getEntityPreviewUrl } from "./levelBuilderUtils";
import { CustomColorPicker } from './CustomColorPicker';
import { ASSETS } from "../../assets";

const FastInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & {
  value: string | number;
  onChangeValue: (val: string) => void;
}> = ({ value, onChangeValue, ...props }) => {
  const [localVal, setLocalVal] = React.useState<string>(String(value ?? ""));

  React.useEffect(() => {
    setLocalVal(String(value ?? ""));
  }, [value]);

  const handleBlur = () => {
    if (localVal !== String(value ?? "")) {
      onChangeValue(localVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      {...props}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

const FastTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  onChangeValue: (val: string) => void;
}> = ({ value, onChangeValue, ...props }) => {
  const [localVal, setLocalVal] = React.useState<string>(value ?? "");

  React.useEffect(() => {
    setLocalVal(value ?? "");
  }, [value]);

  const handleBlur = () => {
    if (localVal !== (value ?? "")) {
      onChangeValue(localVal);
    }
  };

  return (
    <textarea
      {...props}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
    />
  );
};

interface SectorScriptsModalProps {
  level: LevelDefinition;
  setLevel: React.Dispatch<React.SetStateAction<LevelDefinition>>;
  onClose: () => void;
  uiStrings: any;
  onPickCoordinate: (callback: (x: number, y: number) => void, initialCoordinate?: {x: number, y: number} | null) => void;
  isVisible?: boolean;
}

export const SectorScriptsModal: React.FC<SectorScriptsModalProps> = ({
  level,
  setLevel,
  onClose,
  uiStrings,
  onPickCoordinate,
  isVisible = true,
}) => {
  const isRu = uiStrings?.scripts_settings === "Скрипты" || !uiStrings?.scripts_settings;
  const [localScripts, setLocalScripts] = useState<ScriptTrigger[]>(level.triggers ? JSON.parse(JSON.stringify(level.triggers)) : []);
  
  useEffect(() => {
    setLocalScripts(level.triggers ? JSON.parse(JSON.stringify(level.triggers)) : []);
  }, [level.triggers]);

  const scripts = localScripts;

  const placedNPCs = React.useMemo(() => {
    const list: {
      key: string;
      label: string;
      npcId: string;
      x: number;
      y: number;
      floor: number;
      name: string;
      symbol: string;
    }[] = [];

    const paletteMap = new Map<string, any>();
    if (level.NPCs) {
      level.NPCs.forEach((n: any) => paletteMap.set(n.symbol, n));
    }
    if (level.enemies) {
      level.enemies.forEach((e: any) => paletteMap.set(e.symbol, e));
    }
    Object.entries(npcsData).forEach(([id, def]: [string, any]) => {
      if (def.symbol && !paletteMap.has(def.symbol)) {
        paletteMap.set(def.symbol, { ...def, id });
      }
    });

    const entitiesFloors = level.entities || [];
    entitiesFloors.forEach((floorGrid, f) => {
      if (!floorGrid) return;
      floorGrid.forEach((row, y) => {
        if (!row) return;
        for (let x = 0; x < row.length; x++) {
          const char = row[x];
          if (char && char !== '.' && char !== ' ') {
            if (paletteMap.has(char)) {
              const def = paletteMap.get(char);
              const rawName = def.name || def.id || char;
              const name = rawName.split('/')[0].trim();
              list.push({
                key: `${f}_${x}_${y}_${char}`,
                label: `${name} [${char}] (X: ${x}, Y: ${y}${entitiesFloors.length > 1 ? `, F: ${f}` : ''})`,
                npcId: def.id || char,
                x,
                y,
                floor: f,
                name,
                symbol: char,
              });
            }
          }
        }
      });
    });

    return list;
  }, [level]);
  const [expandedScripts, setExpandedScripts] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedScripts(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  const [pickingAssetFor, setPickingAssetFor] = useState<{sIdx: number, aIdx: number, type: 'portrait' | 'tutorial_asset' | 'screamer_image' | 'skybox', pIdx?: number} | null>(null);

  const [tweakModalState, setTweakModalState] = useState<{
    isOpen: boolean;
    sIdx: number;
    aIdx: number;
    initialConfig: any;
    baseTemplate: any;
    listName: string;
    coordKey: string;
  } | null>(null);

  const openVisualConstructorForAction = (sIdx: number, aIdx: number, act: ScriptAction) => {
    const entityType = act.params?.entityType || 'ENEMY';
    const defId = act.params?.definitionId || '';
    const normDefId = defId ? String(defId).trim().toLowerCase() : '';

    let baseTemplate: any = {};
    let listName = 'enemies';

    if (entityType === 'ENEMY') {
      listName = 'enemies';
      const paletteItem = level.enemiesPalette?.find((e: any) =>
        (e.id && String(e.id).toLowerCase() === normDefId) ||
        (e.symbol && String(e.symbol).toLowerCase() === normDefId)
      );
      const dbKey = normDefId ? Object.keys(enemiesData).find(k => k.toLowerCase() === normDefId) : undefined;
      const dbItem = dbKey ? (enemiesData as any)[dbKey] : undefined;
      const fallback = Object.values(enemiesData)[0] || {
        id: "zombie_tech",
        name: "Заражённый техник/Infected technician",
        hp: 12,
        maxHp: 12,
        damageDice: "1d4",
        accuracy: 1,
        attackRange: 1,
        speed: 1,
        baseXP: 10,
        assets: { map: { assetId: "ANIM_ZOMBIE_IDLE", scale: 0.8 }, portrait: { assetId: "ANIM_ZOMBIE_PORTRAIT", scale: 1 } },
        sounds: { attack: "ZOMBIE_ATTACK", damage: "ZOMBIE_DAMAGE", death: "ZOMBIE_DIES" }
      };
      const found = dbItem || paletteItem ? { ...dbItem, ...paletteItem } : { ...fallback };
      baseTemplate = JSON.parse(JSON.stringify(found));
      if (defId) baseTemplate.id = defId;
    } else if (entityType === 'NPC') {
      listName = 'npcs';
      const paletteItem = level.npcsPalette?.find((n: any) =>
        (n.id && String(n.id).toLowerCase() === normDefId) ||
        (n.symbol && String(n.symbol).toLowerCase() === normDefId)
      );
      const dbKey = normDefId ? Object.keys(npcsData).find(k => k.toLowerCase() === normDefId) : undefined;
      const dbItem = dbKey ? (npcsData as any)[dbKey] : undefined;
      const fallback = Object.values(npcsData)[0] || {
        id: "lana",
        name: "Лана/Lana",
        description: "Журналистка/Journalist",
        hp: 1,
        canBeKilled: true,
        talkRange: 1,
        assets: { map: { assetId: "LANA", scale: 0.8 }, portrait: { assetId: "LANA_PORTRAIT" } }
      };
      const found = dbItem || paletteItem ? { ...dbItem, ...paletteItem } : { ...fallback };
      baseTemplate = JSON.parse(JSON.stringify(found));
      if (defId) baseTemplate.id = defId;
    } else if (entityType === 'ITEM') {
      listName = 'items';
      const paletteItem = level.itemsPalette?.find((i: any) =>
        (i.id && String(i.id).toLowerCase() === normDefId) ||
        (i.symbol && String(i.symbol).toLowerCase() === normDefId)
      );
      const dbKey = normDefId ? Object.keys(itemsData).find(k => k.toLowerCase() === normDefId) : undefined;
      const dbItem = dbKey ? (itemsData as any)[dbKey] : undefined;
      const fallback = Object.values(itemsData)[0] || {
        id: "item",
        name: "Предмет/Item",
        type: "MISC"
      };
      const found = dbItem || paletteItem ? { ...dbItem, ...paletteItem } : { ...fallback };
      baseTemplate = JSON.parse(JSON.stringify(found));
      if (defId) baseTemplate.id = defId;
    } else if (entityType === 'DECORATION') {
      listName = 'decorations';
      const paletteItem = level.decorationsPalette?.find((d: any) =>
        (d.id && String(d.id).toLowerCase() === normDefId) ||
        (d.symbol && String(d.symbol).toLowerCase() === normDefId)
      );
      const dbKey = normDefId ? Object.keys(decorationsData).find(k => k.toLowerCase() === normDefId) : undefined;
      const dbItem = dbKey ? (decorationsData as any)[dbKey] : undefined;
      const fallback = Object.values(decorationsData)[0] || {
        id: "barrel",
        name: "Бочка с маслом/Oil barrel",
        description: "Бочка/Barrel",
        assetId: "BARREL",
        scale: 0.7,
        blocking: true
      };
      const found = dbItem || paletteItem ? { ...dbItem, ...paletteItem } : { ...fallback };
      baseTemplate = JSON.parse(JSON.stringify(found));
      if (defId) baseTemplate.id = defId;
    }

    const currentModified = act.params?.modifiedConfig || {};
    const mergedConfig = {
      ...baseTemplate,
      ...currentModified,
    };

    setTweakModalState({
      isOpen: true,
      sIdx,
      aIdx,
      initialConfig: mergedConfig,
      baseTemplate,
      listName,
      coordKey: `Скрипт #${sIdx + 1}, Действие #${aIdx + 1} [${entityType}]`,
    });
  };

  const handleSaveTweakModal = (savedConfig: any) => {
    if (!tweakModalState) return;
    const { sIdx, aIdx, baseTemplate } = tweakModalState;

    const modifiedConfig: Record<string, any> = {};
    for (const key in savedConfig) {
      if (key === 'symbol' || key === 'entityType') continue;
      if (JSON.stringify(savedConfig[key]) !== JSON.stringify(baseTemplate[key])) {
        modifiedConfig[key] = savedConfig[key];
      }
    }

    const finalConfig = Object.keys(modifiedConfig).length > 0 ? modifiedConfig : savedConfig;

    updateAction(sIdx, aIdx, (a) => ({
      ...a,
      params: {
        ...a.params,
        modifiedConfig: finalConfig,
      },
    }));

    setTweakModalState(null);
  };

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  const playSoundPreview = (soundId: string) => {
    if (!soundId) return;
    const soundDef = (soundsData as any)[soundId];
    if (soundDef) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (playingTrackId === soundId) {
        setPlayingTrackId(null);
        return;
      }
      const idToPlay = soundDef.assetId || soundDef.alias || soundId;
      const url = idToPlay && ((ASSETS.SOUNDS as any)[idToPlay] || (ASSETS.SPRITES as any)[idToPlay]);
      if (url) {
        const audio = new Audio(url);
        audio.volume = soundDef.volume ?? 1.0;
        audio.play()
          .then(() => {
            setPlayingTrackId(soundId);
          })
          .catch((e) => console.log("Audio preview error:", e));
        audio.onended = () => {
          setPlayingTrackId(null);
        };
        activeAudioRef.current = audio;
      }
    }
  };

  const soundOptions = React.useMemo(() => {
    return Object.keys(soundsData).filter(key => !(soundsData as any)[key]?.alias);
  }, []);

  const streamingMusicOptions = React.useMemo(() => {
    return Object.keys(soundsData).filter(key => {
      const snd = (soundsData as any)[key];
      return snd && !snd.alias && snd.streaming === true;
    });
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const openAssetPicker = (sIdx: number, aIdx: number, type: 'portrait' | 'tutorial_asset' | 'screamer_image' | 'skybox', pIdx?: number) => {
    if (scrollContainerRef.current) {
      savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
    }
    setPickingAssetFor({ sIdx, aIdx, type, pIdx });
  };

  useEffect(() => {
    if (pickingAssetFor === null && scrollContainerRef.current && savedScrollTopRef.current > 0) {
      const savedScroll = savedScrollTopRef.current;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScroll;
        }
      });
    }
  }, [pickingAssetFor]);

  const getSelectedValue = (actParams: any) => {
    if (actParams?.tileSourceType && actParams?.tileSourceId) {
      return `${actParams.tileSourceType}_${actParams.tileSourceId}`;
    }
    const constructionList = level.construction || [];
    const doorDefsList = level.doorDefinitions ? Object.entries(level.doorDefinitions) : [];
    if (actParams?.newType === 'DOOR') {
      const matchedDoor = doorDefsList.find(([key, def]: [string, any]) => def.textureId === actParams.newAssetId || def.id === actParams.newAssetId);
      if (matchedDoor) return `door_${matchedDoor[0]}`;
      if (doorDefsList.length > 0) return `door_${doorDefsList[0][0]}`;
    } else if (actParams?.newType) {
      const matchedBlock = constructionList.find((c: any) => c.assetId === actParams.newAssetId && c.type?.toUpperCase() === actParams.newType);
      if (matchedBlock) return `construction_${matchedBlock.symbol}`;
      const matchedType = constructionList.find((c: any) => c.type?.toUpperCase() === actParams.newType);
      if (matchedType) return `construction_${matchedType.symbol}`;
    }
    return '';
  };

  const handleApplyAndClose = () => {
    setLevel(prev => ({ ...prev, triggers: localScripts }));
    onClose();
  };

  const addScript = () => {
    const newId = `trigger_${Date.now()}`;
    const newScript: ScriptTrigger = {
      id: newId,
      type: "ON_MAP_LOAD",
      params: {},
      actions: [],
      runOnce: true,
    };
    setLocalScripts(prev => [...prev, newScript]);
    setExpandedScripts(prev => ({
      ...prev,
      [newId]: true
    }));
  };

  const removeScript = (index: number) => {
    setLocalScripts(prev => {
      const triggers = [...prev];
      triggers.splice(index, 1);
      return triggers;
    });
  };

  const updateScript = (
    index: number,
    updater: ScriptTrigger | ((s: ScriptTrigger) => ScriptTrigger),
  ) => {
    setLocalScripts((prev) => {
      const triggers = [...prev];
      if (triggers[index]) {
        triggers[index] =
          typeof updater === "function" ? updater(triggers[index]) : updater;
      }
      return triggers;
    });
  };

  const addAction = (scriptIndex: number) => {
    updateScript(scriptIndex, (s) => ({
      ...s,
      actions: [
        ...s.actions,
        { type: "ADD_LOG", params: { messageKey: "New Log" } },
      ],
    }));
  };

  const removeAction = (scriptIndex: number, actionIndex: number) => {
    updateScript(scriptIndex, (s) => {
      const actions = [...s.actions];
      actions.splice(actionIndex, 1);
      return { ...s, actions };
    });
  };

  const updateAction = (
    scriptIndex: number,
    actionIndex: number,
    updater: ScriptAction | ((a: ScriptAction) => ScriptAction),
  ) => {
    updateScript(scriptIndex, (s) => {
      const actions = [...s.actions];
      if (actions[actionIndex]) {
        actions[actionIndex] =
          typeof updater === "function"
            ? updater(actions[actionIndex])
            : updater;
      }
      return { ...s, actions };
    });
  };

  const moveScript = (index: number, direction: 'up' | 'down') => {
    setLocalScripts(prev => {
      const triggers = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < triggers.length) {
        const temp = triggers[index];
        triggers[index] = triggers[targetIndex];
        triggers[targetIndex] = temp;
      }
      return triggers;
    });
  };

  const copyScript = (index: number) => {
    setLocalScripts(prev => {
      const triggers = [...prev];
      const source = triggers[index];
      if (source) {
        const copy: ScriptTrigger = JSON.parse(JSON.stringify(source));
        copy.id = `${source.id}_copy_${Math.floor(Math.random() * 1000)}`;
        triggers.splice(index + 1, 0, copy);
      }
      return triggers;
    });
  };

  const moveAction = (scriptIndex: number, actionIndex: number, direction: 'up' | 'down') => {
    updateScript(scriptIndex, (s) => {
      const actions = [...s.actions];
      const targetIndex = direction === 'up' ? actionIndex - 1 : actionIndex + 1;
      if (targetIndex >= 0 && targetIndex < actions.length) {
        const temp = actions[actionIndex];
        actions[actionIndex] = actions[targetIndex];
        actions[targetIndex] = temp;
      }
      return { ...s, actions };
    });
  };

  const copyAction = (scriptIndex: number, actionIndex: number) => {
    updateScript(scriptIndex, (s) => {
      const actions = [...s.actions];
      const source = actions[actionIndex];
      if (source) {
        const copy = JSON.parse(JSON.stringify(source));
        actions.splice(actionIndex + 1, 0, copy);
      }
      return { ...s, actions };
    });
  };

  return (
    <div className={`absolute inset-0 bg-black/80 sm:bg-black/10 backdrop-blur-sm ${isVisible ? 'flex' : 'hidden'} items-center justify-center z-[600]`}>
      <div className="bg-gray-800 sm:border border-gray-700 sm:rounded-lg max-w-6xl w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] shadow-2xl flex flex-col relative overflow-hidden">
        <div className="flex justify-between items-center px-4 pt-4 sm:p-6 shrink-0 border-b border-gray-700 pb-2 sm:pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-2 tracking-widest text-[#d5d2c6] uppercase">
              {uiStrings.scripts_settings || "Скрипты сектора"}
            </h2>
            {scripts.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    scripts.forEach(s => { next[s.id] = true; });
                    setExpandedScripts(next);
                  }}
                  className="px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/50 text-indigo-200 rounded font-medium transition-colors"
                >
                  {isRu ? "Развернуть все" : "Expand All"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedScripts({});
                  }}
                  className="px-2.5 py-1 bg-gray-700/60 hover:bg-gray-600 border border-gray-600/50 text-gray-200 rounded font-medium transition-colors"
                >
                  {isRu ? "Свернуть все" : "Collapse All"}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleApplyAndClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div ref={scrollContainerRef} className="p-2 sm:p-4 overflow-y-auto flex-1 space-y-1.5 text-sm font-['Jura'] text-gray-200">
          {scripts.length === 0 && (
            <div className="text-gray-500 italic text-center py-8">
              Нет скриптов
            </div>
          )}
          {scripts.map((script, sIdx) => {
            const isExpanded = !!expandedScripts[script.id];
            return (
              <div
                key={sIdx}
                className={`bg-gray-900 border border-gray-700 rounded transition-all duration-150 ${
                  isExpanded ? "p-1.5 sm:p-2" : "py-0.5 px-1 hover:border-gray-500"
                } ${script.disabled ? "opacity-60 bg-gray-950/80 border-dashed border-gray-800" : ""}`}
              >
                {!isExpanded ? (
                  <div
                    onClick={() => toggleExpand(script.id)}
                    className="flex justify-between items-center gap-2 cursor-pointer select-none py-0.5 px-1"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1 text-sm font-semibold">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(script.id);
                        }}
                        className="text-gray-400 hover:text-white shrink-0 p-0.5 rounded hover:bg-gray-800 transition-colors"
                        title={isRu ? "Развернуть скрипт" : "Expand Script"}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <span className="font-mono text-indigo-400 truncate text-xs" title={script.id}>
                        {script.id}
                      </span>
                      {script.disabled && (
                        <span className="text-[10px] bg-red-950/60 text-red-400 px-1 py-0.5 rounded border border-red-900/50 uppercase font-bold shrink-0">
                          {isRu ? "Отключен" : "Disabled"}
                        </span>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0 bg-gray-950/35 p-0.5 rounded border border-gray-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => updateScript(sIdx, { ...script, disabled: !script.disabled })}
                        className={`${script.disabled ? "text-red-500 hover:text-red-400" : "text-green-500 hover:text-green-400"} transition-colors p-1`}
                        title={isRu ? (script.disabled ? "Включить скрипт" : "Отключить скрипт") : (script.disabled ? "Enable Script" : "Disable Script")}
                      >
                        <Power size={14} />
                      </button>
                      <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
                      <button
                        disabled={sIdx === 0}
                        onClick={() => moveScript(sIdx, 'up')}
                        className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                        title={uiStrings.btn_move_up || "Move Up"}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        disabled={sIdx === scripts.length - 1}
                        onClick={() => moveScript(sIdx, 'down')}
                        className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                        title={uiStrings.btn_move_down || "Move Down"}
                      >
                        <ChevronDown size={14} />
                      </button>
                      <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
                      <button
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                        onClick={() => removeScript(sIdx)}
                        title={uiStrings.btn_delete || "Delete"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-2 border-b border-gray-800 pb-2 gap-2">
                      <div className="flex-1 flex flex-col sm:flex-row flex-wrap gap-2 sm:items-center w-full">
                        <button
                          type="button"
                          onClick={() => toggleExpand(script.id)}
                          className="text-gray-400 hover:text-white shrink-0 p-1 rounded hover:bg-gray-800 transition-colors mr-1"
                          title={isRu ? "Свернуть скрипт" : "Collapse Script"}
                        >
                          <ChevronDown size={18} />
                        </button>
                        <FastInput
                    className="bg-gray-950 border border-gray-800 px-2 py-1 rounded text-white w-full sm:w-auto sm:flex-1 sm:min-w-[100px]"
                    value={script.id}
                    onChangeValue={(val) =>
                      updateScript(sIdx, { ...script, id: val })
                    }
                    placeholder="ID"
                  />
                  <CustomSelect
                    className="bg-gray-950 border border-gray-800 px-2 py-1 rounded text-white w-full sm:w-auto sm:flex-1 sm:min-w-[120px]"
                    value={script.type}
                    onChange={(e) => {
                      const newType = e.target.value as ScriptTriggerType;
                      let newParams = { ...script.params };
                      if (
                        newType === "ON_ENTER_TILE" ||
                        newType === "ON_INTERACT" ||
                        newType === "ON_DOOR_STATE_CHANGE"
                      ) {
                        newParams.x = newParams.x || 0;
                        newParams.y = newParams.y || 0;
                        if (newType === "ON_DOOR_STATE_CHANGE") {
                          newParams.state = newParams.state || "OPEN";
                        }
                      }
                      if (newType === "ON_TIMER") {
                        newParams.interval = newParams.interval || 5;
                      }
                      if (newType === "ON_FLAG_CHANGE") {
                        newParams.flag = newParams.flag || "";
                      }
                      if (newType === "ON_COUNTER_VALUE" || newType === "ON_COUNTER_CHANGE") {
                        newParams.counterId = newParams.counterId || newParams.id || "";
                        newParams.value = newParams.value !== undefined ? newParams.value : 1;
                        newParams.operator = newParams.operator || ">=";
                      }
                      updateScript(sIdx, {
                        ...script,
                        type: newType,
                        params: newParams,
                      });
                    }}
                  >
                    <option value="ON_ENTER_TILE">ON_ENTER_TILE</option>
                    <option value="ON_INTERACT">ON_INTERACT</option>
                    <option value="ON_ENEMY_DEFEAT">ON_ENEMY_DEFEAT</option>
                    <option value="ON_MAP_LOAD">ON_MAP_LOAD</option>
                    <option value="ON_ITEM_PICKUP">ON_ITEM_PICKUP</option>
                    <option value="ON_DOOR_STATE_CHANGE">ON_DOOR_STATE_CHANGE</option>
                    <option value="ON_TIMER">ON_TIMER</option>
                    <option value="ON_FLAG_CHANGE">ON_FLAG_CHANGE</option>
                    <option value="ON_COUNTER_VALUE">ON_COUNTER_VALUE</option>
                    <option value="ON_DIALOGUE_NODE">ON_DIALOGUE_NODE</option>
                  </CustomSelect>
                  <div className="flex items-center gap-3 w-full sm:w-auto mt-1 sm:mt-0">
                    <label className="flex items-center gap-1 cursor-pointer text-xs text-red-400 font-bold">
                      <input
                        type="checkbox"
                        checked={!!script.disabled}
                        onChange={(e) =>
                          updateScript(sIdx, {
                            ...script,
                            disabled: e.target.checked,
                          })
                        }
                      />
                      {isRu ? "Отключен" : "Disabled"}
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={!!script.runOnce}
                        onChange={(e) =>
                          updateScript(sIdx, {
                            ...script,
                            runOnce: e.target.checked,
                          })
                        }
                      />
                      Run Once
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-xs text-yellow-400">
                    <input
                      type="checkbox"
                      checked={!!script.sequentialActions}
                      onChange={(e) =>
                        updateScript(sIdx, {
                          ...script,
                          sequentialActions: e.target.checked,
                        })
                      }
                    />
                    Sequential Actions
                    </label>
                    {script.type === "ON_INTERACT" && (
                      <label className="flex items-center gap-1 cursor-pointer text-xs text-cyan-400" title={uiStrings.trigger_on_any_interact_desc}>
                        <input
                          type="checkbox"
                          checked={!!script.triggerOnAnyInteract}
                          onChange={(e) =>
                            updateScript(sIdx, {
                              ...script,
                              triggerOnAnyInteract: e.target.checked,
                            })
                          }
                        />
                        {uiStrings.trigger_on_any_interact || "Использовать без действия"}
                      </label>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 bg-gray-950/35 p-1 rounded border border-gray-800">
                  <button
                    onClick={() => updateScript(sIdx, { ...script, disabled: !script.disabled })}
                    className={`${script.disabled ? "text-red-500 hover:text-red-400" : "text-green-500 hover:text-green-400"} transition-colors p-1`}
                    title={isRu ? (script.disabled ? "Включить скрипт" : "Отключить скрипт") : (script.disabled ? "Enable Script" : "Disable Script")}
                  >
                    <Power size={16} />
                  </button>
                  <div className="w-px h-4 bg-gray-800 self-center" />
                  <button
                    disabled={sIdx === 0}
                    onClick={() => moveScript(sIdx, 'up')}
                    className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                    title={uiStrings.btn_move_up || "Move Up"}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    disabled={sIdx === scripts.length - 1}
                    onClick={() => moveScript(sIdx, 'down')}
                    className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                    title={uiStrings.btn_move_down || "Move Down"}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => copyScript(sIdx)}
                    className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
                    title={uiStrings.btn_copy || "Copy"}
                  >
                    <Copy size={16} />
                  </button>
                  <div className="w-px h-4 bg-gray-800 self-center" />
                  <button
                    className="text-red-400 hover:text-red-300 transition-colors p-1"
                    onClick={() => removeScript(sIdx)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-3">
                <div className="flex flex-col gap-1.5 bg-gray-900/30 p-2 rounded border border-gray-800/50">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                      Условия (Требуемые флаги):
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Primary flag */}
                    <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 px-2 py-1 rounded">
                      <span className="text-xs text-gray-500">1:</span>
                      <FastInput
                        className="bg-transparent border-none text-white focus:outline-none w-24 text-sm"
                        placeholder="Нет флага"
                        value={script.requiresFlag?.startsWith("!") ? script.requiresFlag.substring(1) : (script.requiresFlag || "")}
                        onChangeValue={(val) => {
                          const isNegated = script.requiresFlag?.startsWith("!");
                          const newVal = val ? (isNegated ? "!" + val : val) : "";
                          updateScript(sIdx, {
                            ...script,
                            requiresFlag: newVal || undefined,
                          });
                        }}
                      />
                      <select
                        className="bg-gray-900 text-[10px] text-gray-300 border border-gray-800 rounded px-1 py-0.5 focus:outline-none font-mono"
                        value={script.requiresFlag?.startsWith("!") ? "false" : "true"}
                        onChange={(e) => {
                          const isFalse = e.target.value === "false";
                          let name = script.requiresFlag || "";
                          if (name.startsWith("!")) name = name.substring(1);
                          const newVal = name ? (isFalse ? "!" + name : name) : (isFalse ? "!" : "");
                          updateScript(sIdx, {
                            ...script,
                            requiresFlag: newVal || undefined,
                          });
                        }}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </div>

                    {/* Additional flags */}
                    {(script.requiresFlags || []).map((flag, flagIdx) => {
                      const isNegated = flag.startsWith("!");
                      const cleanName = isNegated ? flag.substring(1) : flag;
                      return (
                        <div key={flagIdx} className="flex items-center gap-2 bg-gray-950 border border-gray-800 px-2 py-1 rounded">
                          <span className="text-xs text-gray-500">{flagIdx + 2}:</span>
                          <FastInput
                            className="bg-transparent border-none text-white focus:outline-none w-24 text-sm"
                            placeholder="Флаг"
                            value={cleanName}
                            onChangeValue={(val) => {
                              const newFlags = [...(script.requiresFlags || [])];
                              newFlags[flagIdx] = val ? (isNegated ? "!" + val : val) : "";
                              updateScript(sIdx, {
                                ...script,
                                requiresFlags: newFlags,
                              });
                            }}
                          />
                          <select
                            className="bg-gray-900 text-[10px] text-gray-300 border border-gray-800 rounded px-1 py-0.5 focus:outline-none font-mono"
                            value={isNegated ? "false" : "true"}
                            onChange={(e) => {
                              const isFalse = e.target.value === "false";
                              const newFlags = [...(script.requiresFlags || [])];
                              let name = newFlags[flagIdx];
                              if (name.startsWith("!")) name = name.substring(1);
                              newFlags[flagIdx] = isFalse ? "!" + name : name;
                              updateScript(sIdx, {
                                ...script,
                                requiresFlags: newFlags,
                              });
                            }}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const newFlags = (script.requiresFlags || []).filter((_, idx) => idx !== flagIdx);
                              updateScript(sIdx, {
                                ...script,
                                requiresFlags: newFlags.length > 0 ? newFlags : undefined,
                              });
                            }}
                            className="text-red-400 hover:text-red-300 transition-colors p-0.5 ml-1"
                            title="Удалить флаг"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        const newFlags = [...(script.requiresFlags || []), ""];
                        updateScript(sIdx, {
                          ...script,
                          requiresFlags: newFlags,
                        });
                      }}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 border border-dashed border-indigo-900/50 hover:border-indigo-500 bg-indigo-950/20 px-2.5 py-1 rounded transition-all"
                    >
                      <Plus size={12} />
                      <span>Флаг</span>
                    </button>
                  </div>
                </div>

                {/* Trigger params based on type */}
                {(script.type === "ON_ENTER_TILE" ||
                  script.type === "ON_DOOR_STATE_CHANGE" ||
                  script.type === "ON_INTERACT") && (
                  <>
                    {script.type !== "ON_DOOR_STATE_CHANGE" && (
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-4">
                        <span className="text-gray-500 whitespace-nowrap">
                          Требуемый предмет:
                        </span>
                        <CustomSelect
                          className="bg-gray-950 border border-gray-800 px-2 py-1 rounded w-full sm:w-32"
                          value={script.requiredItemType || ""}
                          onChange={(e) =>
                            updateScript(sIdx, {
                              ...script,
                              requiredItemType: e.target.value,
                            })
                          }
                        >
                          <option value="">Нет (None)</option>
                          {Object.entries(itemsData).map(
                            ([id, item]: [string, any]) => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ),
                          )}
                        </CustomSelect>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto sm:ml-auto p-1 bg-gray-800 rounded">
                      <span className="text-gray-400 ml-1">X:</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.x ?? 0}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              x: e.target.value === '' ? '' : Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <span className="text-gray-400">Y:</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.y ?? 0}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              y: e.target.value === '' ? '' : Number(e.target.value),
                            },
                          }))
                        }
                      />
                      {script.type === "ON_ENTER_TILE" && (
                        <>
                          <span className="text-gray-400" title="Радиус (0 - только эта клетка)">R:</span>
                          <input
                            type="number"
                            min="0"
                            className="bg-gray-950 w-12 px-1 rounded text-center"
                            value={script.params?.radius ?? 0}
                            onChange={(e) =>
                              updateScript(sIdx, (s) => ({
                                ...s,
                                params: {
                                  ...s.params,
                                  radius: e.target.value === '' ? '' : Number(e.target.value),
                                },
                              }))
                            }
                            title="Радиус (0 - только эта клетка)"
                          />
                        </>
                      )}

                      <button
                        onClick={() => {
                          const cx = typeof script.params?.x === 'number' ? script.params.x : undefined;
                          const cy = typeof script.params?.y === 'number' ? script.params.y : undefined;
                          onPickCoordinate((x, y) => {
                            updateScript(sIdx, (s) => ({
                              ...s,
                              params: { ...s.params, x, y },
                            }));
                          }, cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded ml-1 text-white"
                        title="Указать на карте"
                      >
                        <MapPin size={14} />
                      </button>

                      {script.type === "ON_ENTER_TILE" && (
                        <label className="flex items-center gap-1 cursor-pointer text-xs ml-2 text-gray-400">
                          <input
                            type="checkbox"
                            checked={script.triggerAtStart !== false}
                            onChange={(e) =>
                              updateScript(sIdx, (s) => ({
                                ...s,
                                triggerAtStart: e.target.checked,
                              }))
                            }
                          />
                          {uiStrings.trigger_at_start || "Trigger At Start"}
                        </label>
                      )}

                      {script.type === "ON_DOOR_STATE_CHANGE" && (
                        <>
                          <span className="text-gray-400 ml-1">Состояние:</span>
                          <CustomSelect
                            className="bg-gray-950 px-1 rounded text-center text-xs w-20"
                            value={script.params?.state || "OPEN"}
                            onChange={(e) =>
                              updateScript(sIdx, (s) => ({
                                ...s,
                                params: {
                                  ...s.params,
                                  state: e.target.value,
                                },
                              }))
                            }
                          >
                            <option value="OPEN">Открыта</option>
                            <option value="CLOSED">Закрыта</option>
                          </CustomSelect>
                        </>
                      )}

                      {script.type === "ON_INTERACT" && (
                        <>
                           <span className="text-gray-400 ml-1">Сторона:</span>
                           <CustomSelect
                               className="bg-gray-950 px-1 rounded text-center text-xs"
                               value={script.params?.side || "ANY"}
                               onChange={(e) =>
                                 updateScript(sIdx, (s) => ({
                                   ...s,
                                   params: {
                                     ...s.params,
                                     side: e.target.value,
                                   },
                                 }))
                               }
                             >
                                <option value="ANY">Любая</option>
                                <option value="N">N (Север)</option>
                                <option value="E">E (Восток)</option>
                                <option value="S">S (Юг)</option>
                                <option value="W">W (Запад)</option>
                           </CustomSelect>
                           <span className="text-gray-400 ml-1">Кнопка:</span>
                           <input
                              type="text"
                              disabled={!!script.triggerOnAnyInteract}
                              className={`bg-gray-950 w-full sm:w-28 px-1 rounded flex-shrink min-w-[100px] ${script.triggerOnAnyInteract ? 'opacity-30 cursor-not-allowed' : ''}`}
                              placeholder={script.triggerOnAnyInteract ? "Без доп. кнопки" : "Действие/Action"}
                              title={script.triggerOnAnyInteract ? "Отключено, т.к. включено 'Использовать без действия'" : "Используйте '/' для мультиязычности (RU/EN)"}
                              value={script.triggerOnAnyInteract ? "" : (script.params?.buttonLabel || "")}
                              onChange={(e) =>
                                updateScript(sIdx, (s) => ({
                                  ...s,
                                  params: {
                                    ...s.params,
                                    buttonLabel: e.target.value,
                                  },
                                }))
                              }
                           />
                        </>
                      )}
                    </div>
                  </>
                )}
                {script.type === "ON_ENEMY_DEFEAT" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-4">
                      <span className="text-gray-500">Enemy ID:</span>
                      <CustomSelect
                        className="bg-gray-950 border border-gray-800 px-2 py-1 rounded w-full sm:w-32"
                        value={script.params?.enemyId || ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: { ...s.params, enemyId: e.target.value },
                          }))
                        }
                      >
                        <option value="">Любой</option>
                        {Object.entries(enemiesData).map(
                          ([id, enemy]: [string, any]) => (
                            <option key={id} value={id}>
                              {id} ({enemy.name.split("/")[0]})
                            </option>
                          ),
                        )}
                      </CustomSelect>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto sm:ml-auto p-1 bg-gray-800 rounded">
                      <span className="text-gray-400 ml-1">X (opt):</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.x ?? ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              x: e.target.value
                                ? e.target.value === '' ? '' : Number(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                      />
                      <span className="text-gray-400">Y (opt):</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.y ?? ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              y: e.target.value
                                ? e.target.value === '' ? '' : Number(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                      />
                      <button
                        onClick={() => {
  const cx = typeof script.params?.x === 'number' ? script.params.x : undefined;
  const cy = typeof script.params?.y === 'number' ? script.params.y : undefined;
  onPickCoordinate((x, y) => {
    updateScript(sIdx, (s) => ({
      ...s,
      params: { ...s.params, x, y },
    }));
  }, cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null);
}}
                        className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded ml-1 text-white"
                        title="Указать на карте"
                      >
                        <MapPin size={14} />
                      </button>
                    </div>
                  </>
                )}
                {script.type === "ON_ITEM_PICKUP" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-4">
                      <span className="text-gray-500">Item ID:</span>
                      <CustomSelect
                        className="bg-gray-950 border border-gray-800 px-2 py-1 rounded w-full sm:w-32"
                        value={script.params?.itemId || ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: { ...s.params, itemId: e.target.value },
                          }))
                        }
                      >
                        <option value="">Любой</option>
                        {Object.entries(itemsData).map(
                          ([id, item]: [string, any]) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ),
                        )}
                      </CustomSelect>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto sm:ml-auto p-1 bg-gray-800 rounded">
                      <span className="text-gray-400 ml-1">X (opt):</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.x ?? ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              x: e.target.value
                                ? e.target.value === '' ? '' : Number(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                      />
                      <span className="text-gray-400">Y (opt):</span>
                      <input
                        type="number"
                        className="bg-gray-950 w-12 px-1 rounded text-center"
                        value={script.params?.y ?? ""}
                        onChange={(e) =>
                          updateScript(sIdx, (s) => ({
                            ...s,
                            params: {
                              ...s.params,
                              y: e.target.value
                                ? e.target.value === '' ? '' : Number(e.target.value)
                                : undefined,
                            },
                          }))
                        }
                      />
                      <button
                        onClick={() => {
  const cx = typeof script.params?.x === 'number' ? script.params.x : undefined;
  const cy = typeof script.params?.y === 'number' ? script.params.y : undefined;
  onPickCoordinate((x, y) => {
    updateScript(sIdx, (s) => ({
      ...s,
      params: { ...s.params, x, y },
    }));
  }, cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null);
}}
                        className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded ml-1 text-white"
                        title="Указать на карте"
                      >
                        <MapPin size={14} />
                      </button>
                    </div>
                  </>
                )}
                {script.type === "ON_TIMER" && (
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto p-1 bg-gray-800 rounded">
                    <span className="text-gray-400 ml-1">Интервал (сек):</span>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      className="bg-gray-950 w-20 px-1 rounded text-center text-white font-mono"
                      value={script.params?.interval ?? ""}
                      placeholder="5"
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            interval: e.target.value === '' ? '' : Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <span className="text-gray-400">Рандом от:</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="bg-gray-950 w-16 px-1 rounded text-center text-white font-mono"
                      value={script.params?.minInterval ?? ""}
                      placeholder="мин"
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            minInterval: e.target.value === '' ? '' : Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <span className="text-gray-400">до:</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="bg-gray-950 w-16 px-1 rounded text-center text-white font-mono"
                      value={script.params?.maxInterval ?? ""}
                      placeholder="макс"
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            maxInterval: e.target.value === '' ? '' : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                )}
                {script.type === "ON_FLAG_CHANGE" && (
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto p-1.5 bg-gray-800 rounded text-xs">
                    <span className="text-gray-400 ml-1">Имя флага:</span>
                    <input
                      type="text"
                      className="bg-gray-950 w-44 px-2 py-0.5 rounded text-white font-mono border border-gray-700"
                      value={script.params?.flag ?? ""}
                      placeholder="flag_name"
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            flag: e.target.value,
                          },
                        }))
                      }
                    />
                    <span className="text-gray-400">Ожидаемое значение (опц.):</span>
                    <select
                      className="bg-gray-950 px-2 py-0.5 rounded text-white font-mono border border-gray-700"
                      value={script.params?.value === undefined ? "" : String(script.params.value)}
                      onChange={(e) => {
                        const val = e.target.value;
                        let typedVal: any = undefined;
                        if (val === "true") typedVal = true;
                        else if (val === "false") typedVal = false;
                        else if (val !== "") typedVal = val;
                        
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            value: typedVal,
                          },
                        }));
                      }}
                    >
                      <option value="">Любое изменение (Any)</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                )}
                {(script.type === "ON_COUNTER_VALUE" || script.type === "ON_COUNTER_CHANGE") && (
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto p-1.5 bg-gray-800 rounded text-xs">
                    <span className="text-gray-400 ml-1">{isRu ? "ID счётчика:" : "Counter ID:"}</span>
                    <input
                      type="text"
                      className="bg-gray-950 w-36 px-2 py-0.5 rounded text-white font-mono border border-gray-700"
                      value={script.params?.counterId ?? script.params?.id ?? ""}
                      placeholder="counter_id"
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            counterId: e.target.value,
                          },
                        }))
                      }
                    />
                    <span className="text-gray-400">{isRu ? "Условие:" : "Condition:"}</span>
                    <select
                      className="bg-gray-950 px-2 py-0.5 rounded text-white font-mono border border-gray-700"
                      value={script.params?.operator ?? ">="}
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            operator: e.target.value,
                          },
                        }))
                      }
                    >
                      <option value=">=">&gt;= ({isRu ? "Достиг или больше" : "Greater or equal"})</option>
                      <option value="==">== ({isRu ? "Точно равен" : "Equal"})</option>
                      <option value=">">&gt; ({isRu ? "Больше" : "Greater"})</option>
                      <option value="<=">&lt;= ({isRu ? "Меньше или равен" : "Less or equal"})</option>
                      <option value="<">&lt; ({isRu ? "Меньше" : "Less"})</option>
                      <option value="!=">!= ({isRu ? "Не равен" : "Not equal"})</option>
                    </select>
                    <span className="text-gray-400">{isRu ? "Значение:" : "Value:"}</span>
                    <input
                      type="number"
                      className="bg-gray-950 w-20 px-2 py-0.5 rounded text-white font-mono border border-gray-700"
                      value={script.params?.value ?? script.params?.targetValue ?? 1}
                      onChange={(e) =>
                        updateScript(sIdx, (s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            value: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                )}

              </div>

              <div className="pl-4 mt-2 border-l-2 border-gray-800 space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                  {uiStrings?.script_actions_title || "Действия"}
                </div>
                {script.actions?.map((act, aIdx) => (
                  <div
                    key={aIdx}
                    className="bg-gray-950 border border-gray-800 p-2.5 rounded flex flex-col gap-2 relative group-action hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between w-full border-b border-gray-950 pb-2 mb-0.5">
                      <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">{uiStrings?.script_action_title || "Действие"} #{aIdx + 1}</span>
                      <div className="flex items-center gap-0.5 bg-gray-900 px-1 py-0.5 rounded border border-gray-800">
                        <button
                          disabled={aIdx === 0}
                          onClick={() => moveAction(sIdx, aIdx, 'up')}
                          className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                          title={uiStrings.btn_move_up || "Move Up"}
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          disabled={aIdx === (script.actions?.length - 1)}
                          onClick={() => moveAction(sIdx, aIdx, 'down')}
                          className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                          title={uiStrings.btn_move_down || "Move Down"}
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button
                          onClick={() => copyAction(sIdx, aIdx)}
                          className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
                          title={uiStrings.btn_copy || "Copy"}
                        >
                          <Copy size={12} />
                        </button>
                        <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
                        <button
                          className="text-red-500 hover:text-red-400 transition-colors p-1"
                          onClick={() => removeAction(sIdx, aIdx)}
                          title={uiStrings.btn_delete || "Delete"}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2 w-full">
                      <CustomSelect
                        className="bg-gray-900 border border-gray-700 px-2 py-1 rounded text-indigo-300 font-bold w-full sm:w-auto"
                        value={act.type}
                        onChange={(e) => {
                          const t = e.target.value as ScriptActionType;
                          let newP = { ...act.params };
                          if (t === "SPAWN_ENTITY")
                            newP = { entityType: "ENEMY", definitionId: "", x: 0, y: 0 };
                          else if (t === "SPAWN_EXPLOSION")
                            newP = { entityType: "EXPLOSION", damageDice: "2d6", range: 2, assetId: "ANIM_EXPLOSION", soundId: "EXPLOSION", itemType: "NORMAL", itemDuration: 4, x: 0, y: 0 };
                          else if (t === "REMOVE_ENTITY")
                            newP = { entityType: "ENEMY", x: 0, y: 0 };
                          else if (t === "MODIFY_ENTITY")
                            newP = { entityType: "ENEMY", definitionId: "", modifiedConfig: {} };
                          else if (t === "GIVE_ITEM")
                            newP = { itemDefinitionId: "medkit" };
                          else if (t === "TAKE_ITEM")
                            newP = { itemDefinitionId: "medkit", count: 1 };
                          else if (t === "SHOW_DIALOGUE")
                            newP = { dialogueId: "start_convo" };
                          else if (t === "SHOW_TUTORIAL")
                            newP = { text: "Текст туториала", highlightElement: "NONE" };
                          else if (t === "PLAY_SOUND")
                            newP = { soundId: "beep" };
                          else if (t === "CHANGE_TILE")
                            newP = { x: 0, y: 0, newType: "FLOOR" };
                          else if (t === "ADD_LOG")
                            newP = { messageKey: "Сообщение" };
                          else if (t === "SET_FLAG")
                            newP = { flag: "flag1", value: true };
                          else if (t === "REVEAL_TASK")
                            newP = { taskId: "task1" };
                          else if (t === "COMPLETE_TASK")
                            newP = { taskId: "task1" };
                          else if (t === "CINEMATIC_CAMERA")
                            newP = { points: [{ x: 0, y: 0, dir: "C", pitch: 0, floor: 1, duration: 0 }, { x: 0, y: 0, dir: "C", pitch: 0, floor: 1, duration: 2000 }] };
                          else if (t === "CINEMATIC_STATIC_CAMERA")
                            newP = { x: "", y: "", dir: "C", pitch: 0, zoom: 1.0, floor: 1, duration: 3000 };
                          else if (t === "DELAY")
                            newP = { time: 1000 };
                          else if (t === "PLAYER_FALL")
                            newP = {};
                          else if (t === "PLAYER_DEATH")
                            newP = {};
                          else if (t === "GAME_OVER")
                            newP = {};
                          else if (t === "DOOR_STATE_CHANGE")
                            newP = { x: 0, y: 0, state: "OPEN" };
                          else if (t === "SHOW_SCREAMER")
                            newP = { image: "", soundId: "LEVELUP", duration: 2000 };
                          else if (t === "SET_SECTOR")
                            newP = { globalLight: 0.1, skyboxTextureId: "", weather: "none", changeMode: "all", fogColor: "#bec8d2", fogDistance: 15 };
                          else if (t === "MOVE_TO")
                            newP = { startX: 0, startY: 0, targetX: 0, targetY: 0 };
                          else if (t === "NPC_FOLLOW")
                            newP = { startX: 0, startY: 0, mode: "NPC_FOLLOWS_PLAYER", targetX: 0, targetY: 0, maxDistance: 4 };
                          else if (t === "RESET_SPAWN")
                            newP = { x: 0, y: 0 };
                          else if (t === "UNLOCK_ACHIEVEMENT")
                            newP = { achievementKey: "first_blood" };
                          else if (t === "END")
                            newP = { duration: 2000, delay: 500 };
                          else if (t === "LAUNCH_MINIGAME")
                            newP = { gameId: "chess" };
                          else if (t === "REPEAT")
                            newP = { delay: 0 };
                          else if (t === "STOP_REPEAT")
                            newP = { scriptId: "" };
                          updateAction(sIdx, aIdx, { type: t, params: newP });
                        }}
                      >
                        <option value="SPAWN_ENTITY">SPAWN_ENTITY</option>
                        <option value="SPAWN_EXPLOSION">SPAWN_EXPLOSION</option>
                        <option value="REMOVE_ENTITY">REMOVE_ENTITY</option>
                        <option value="MODIFY_ENTITY">MODIFY_ENTITY</option>
                        <option value="GIVE_ITEM">GIVE_ITEM</option>
                        <option value="TAKE_ITEM">TAKE_ITEM</option>
                        <option value="SHOW_DIALOGUE">SHOW_DIALOGUE</option>
                        <option value="SHOW_TUTORIAL">SHOW_TUTORIAL</option>
                        <option value="PLAY_SOUND">PLAY_SOUND</option>
                        <option value="CHANGE_TILE">CHANGE_TILE</option>
                        <option value="DOOR_STATE_CHANGE">DOOR_STATE_CHANGE</option>
                        <option value="ADD_LOG">ADD_LOG</option>
                        <option value="SET_FLAG">SET_FLAG</option>
                        <option value="CREATE_COUNTER">CREATE_COUNTER</option>
                        <option value="SET_COUNTER">SET_COUNTER</option>
                        <option value="INCREMENT_COUNTER">INCREMENT_COUNTER</option>
                        <option value="REVEAL_TASK">REVEAL_TASK</option>
                        <option value="COMPLETE_TASK">COMPLETE_TASK</option>
                        <option value="CINEMATIC_CAMERA">CINEMATIC_CAMERA</option>
                        <option value="CINEMATIC_STATIC_CAMERA">CINEMATIC_STATIC_CAMERA</option>
                        <option value="DELAY">DELAY</option>
                        <option value="REPEAT">REPEAT</option>
                        <option value="STOP_REPEAT">STOP_REPEAT</option>
                        <option value="PLAYER_FALL">PLAYER_FALL</option>
                        <option value="PLAYER_DEATH">PLAYER_DEATH</option>
                        <option value="GAME_OVER">GAME_OVER</option>
                        <option value="END">END</option>
                        <option value="SHOW_SCREAMER">SHOW_SCREAMER</option>
                        <option value="SET_SECTOR">SET_SECTOR</option>
                        <option value="MOVE_TO">MOVE_TO</option>
                        <option value="NPC_FOLLOW">NPC_FOLLOW</option>
                        <option value="RESET_SPAWN">RESET_SPAWN</option>
                        <option value="MUSIC_PLAYER">MUSIC_PLAYER</option>
                        <option value="UNLOCK_ACHIEVEMENT">UNLOCK_ACHIEVEMENT</option>
                        <option value="LAUNCH_MINIGAME">LAUNCH_MINIGAME</option>
                      </CustomSelect>
                    </div>
                    <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2">
                      {(act.type === "SPAWN_ENTITY" || act.type === "SPAWN_EXPLOSION") && (
                        <>
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                            value={act.params?.entityType || "ENEMY"}
                            onChange={(e) => {
                              const et = e.target.value;
                              const params: any = { 
                                ...act.params, 
                                entityType: et, 
                                definitionId: et === "EXPLOSION" ? undefined : "" 
                              };
                              if (et === "EXPLOSION") {
                                params.damageDice = "2d6";
                                params.range = 2;
                                params.assetId = "ANIM_EXPLOSION";
                                params.soundId = "EXPLOSION";
                                params.itemType = "NORMAL";
                                params.itemDuration = 4;
                              }
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params,
                              });
                            }}
                          >
                            <option value="ENEMY">{uiStrings?.entity_enemy || (isRu ? "Враг" : "Enemy")}</option>
                            <option value="NPC">{uiStrings?.entity_npc || "NPC"}</option>
                            <option value="ITEM">{uiStrings?.entity_item || (isRu ? "Предмет" : "Item")}</option>
                            <option value="DECORATION">{uiStrings?.entity_decoration || (isRu ? "Декорация" : "Decoration")}</option>
                            <option value="AMBIENT_SOUND">{isRu ? "Звук (Ambient)" : "Sound (Ambient)"}</option>
                            <option value="LIGHT">{isRu ? "Свет" : "Light"}</option>
                            <option value="PARTICLE_EMITTER">{isRu ? "Эмиттер частиц" : "Particle Emitter"}</option>
                            <option value="EXPLOSION">{uiStrings?.entity_explosion || (isRu ? "Взрыв" : "Explosion")}</option>
                          </CustomSelect>

                          {act.params?.entityType !== "EXPLOSION" && (
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                              value={act.params?.definitionId || ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, definitionId: e.target.value },
                                })
                              }
                            >
                              <option value="">{uiStrings?.please_select || (isRu ? "-- Выберите --" : "-- Select --")}</option>
                              {act.params?.entityType === "ENEMY" && Object.keys(enemiesData).map(k => {
                                const previewUrl = getEntityPreviewUrl('enemy', k);
                                const nameFmt = (enemiesData as any)[k]?.name ? `${(enemiesData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                                return (
                                  <option key={k} value={k}>
                                    <span className="inline-flex items-center gap-2">
                                      {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                      <span>{nameFmt}</span>
                                    </span>
                                  </option>
                                );
                              })}
                              {act.params?.entityType === "NPC" && Object.keys(npcsData).map(k => {
                                const previewUrl = getEntityPreviewUrl('npc', k);
                                const nameFmt = (npcsData as any)[k]?.name ? `${(npcsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                                return (
                                  <option key={k} value={k}>
                                    <span className="inline-flex items-center gap-2">
                                      {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                      <span>{nameFmt}</span>
                                    </span>
                                  </option>
                                );
                              })}
                              {act.params?.entityType === "ITEM" && Object.keys(itemsData).map(k => {
                                const previewUrl = getEntityPreviewUrl('item', k);
                                const nameFmt = (itemsData as any)[k]?.name ? `${(itemsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                                return (
                                  <option key={k} value={k}>
                                    <span className="inline-flex items-center gap-2">
                                      {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                      <span>{nameFmt}</span>
                                    </span>
                                  </option>
                                );
                              })}
                              {act.params?.entityType === "DECORATION" && Object.keys(decorationsData).map(k => {
                                const previewUrl = getEntityPreviewUrl('decoration', k);
                                const nameFmt = (decorationsData as any)[k]?.name ? `${(decorationsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                                return (
                                  <option key={k} value={k}>
                                    <span className="inline-flex items-center gap-2">
                                      {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                      <span>{nameFmt}</span>
                                    </span>
                                  </option>
                                );
                              })}
                              {act.params?.entityType === "LIGHT" && Object.keys(level.lightDefinitions || {}).map(k => <option key={k} value={k}>{k}</option>)}
                              {act.params?.entityType === "AMBIENT_SOUND" && level.ambientSounds?.filter(s => s.symbol).map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                              {act.params?.entityType === "PARTICLE_EMITTER" && Object.keys(particlesData).map(k => <option key={k} value={k}>{k}</option>)}
                            </CustomSelect>
                          )}

                          {act.params?.entityType === "EXPLOSION" && (
                            <div className="flex flex-wrap items-center gap-2 bg-gray-900 rounded p-1 text-xs">
                              <span className="text-gray-400">{uiStrings?.explosion_damage || (isRu ? "Урон" : "Damage")}:</span>
                              <input
                                type="text"
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-14 text-center text-white"
                                placeholder="2d6"
                                value={act.params?.damageDice ?? "2d6"}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, damageDice: e.target.value },
                                  })
                                }
                              />
                              <span className="text-gray-400">{uiStrings?.explosion_radius || (isRu ? "Радиус" : "Radius")}:</span>
                              <input
                                type="number"
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-10 text-center text-white"
                                placeholder="2"
                                value={act.params?.range ?? 2}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, range: e.target.value === '' ? '' : Number(e.target.value) },
                                  })
                                }
                              />
                              <span className="text-gray-400">{uiStrings?.explosion_asset || (isRu ? "Ассет" : "Asset")}:</span>
                              <input
                                type="text"
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-28 text-white"
                                placeholder="ANIM_EXPLOSION"
                                value={act.params?.assetId ?? "ANIM_EXPLOSION"}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, assetId: e.target.value },
                                  })
                                }
                              />
                              <span className="text-gray-400">{uiStrings?.explosion_sound || (isRu ? "Звук" : "Sound")}:</span>
                              <input
                                type="text"
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-24 text-white"
                                placeholder="EXPLOSION"
                                value={act.params?.soundId ?? "EXPLOSION"}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, soundId: e.target.value },
                                  })
                                }
                              />
                              <span className="text-gray-400">{uiStrings?.explosion_type || (isRu ? "Тип" : "Type")}:</span>
                              <CustomSelect
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5"
                                value={act.params?.itemType || "NORMAL"}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, itemType: e.target.value },
                                  })
                                }
                              >
                                <option value="NORMAL">{uiStrings?.explosion_type_normal || (isRu ? "Нормальный" : "Normal")}</option>
                                <option value="FLASHBANG">{uiStrings?.explosion_type_flashbang || (isRu ? "Вспышка" : "Flashbang")}</option>
                              </CustomSelect>
                              {act.params?.itemType === "FLASHBANG" && (
                                <>
                                  <span className="text-gray-400">{uiStrings?.explosion_blind_dur || (isRu ? "Ослеп (сек)" : "Blind (sec)")}:</span>
                                  <input
                                    type="number"
                                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-10 text-center text-white"
                                    placeholder="4"
                                    value={act.params?.itemDuration ?? 4}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: { ...act.params, itemDuration: e.target.value === '' ? '' : Number(e.target.value) },
                                      })
                                    }
                                  />
                                </>
                              )}
                              <span className="text-gray-400">{uiStrings?.explosion_delay || (isRu ? "Пауза (мс)" : "Delay (ms)")}:</span>
                              <input
                                type="number"
                                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 w-14 text-center text-white"
                                placeholder="0"
                                value={act.params?.delay ?? ""}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, delay: e.target.value === '' ? '' : Number(e.target.value) },
                                  })
                                }
                              />
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.x ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, x: e.target.value === '' ? '' : Number(e.target.value) },
                                })
                              }
                            />
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.y ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, y: e.target.value === '' ? '' : Number(e.target.value) },
                                })
                              }
                            />
                            <button
                              onClick={() => {
  const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
  const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
  onPickCoordinate((x, y) =>
    updateAction(sIdx, aIdx, (a) => ({
      ...a,
      params: { ...a.params, x, y },
    })),
    cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
  );
}}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                            >
                              <MapPin size={14} />
                            </button>
                            {act.params?.entityType === "PARTICLE_EMITTER" && (
                              <>
                                <span className="text-gray-500 ml-2">Z:</span>
                                <input
                                  type="number"
                                  className="bg-transparent w-12 text-center"
                                  value={act.params?.zOffset ?? ""}
                                  placeholder="0"
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: { ...act.params, zOffset: e.target.value ? e.target.value === '' ? '' : Number(e.target.value) : undefined },
                                    })
                                  }
                                />
                              </>
                            )}
                          </div>
                        </>
                      )}
                      {act.type === "REMOVE_ENTITY" && (
                        <>
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                            value={act.params?.entityType || "ENEMY"}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, entityType: e.target.value, definitionId: "" },
                              })
                            }
                          >
                            <option value="ENEMY">Враг</option>
                            <option value="NPC">NPC</option>
                            <option value="ITEM">Предмет</option>
                            <option value="DECORATION">Декорация</option>
                            <option value="AMBIENT_SOUND">Звук (Ambient)</option>
                            <option value="LIGHT">Свет</option>
                            <option value="PARTICLE_EMITTER">Эмиттер частиц</option>
                          </CustomSelect>

                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                            title="Оставьте пустым для удаления любого объекта этого типа на тайле"
                            value={act.params?.definitionId || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, definitionId: e.target.value },
                              })
                            }
                          >
                            <option value="">-- Любой --</option>
                            {act.params?.entityType === "ENEMY" && Object.keys(enemiesData).map(k => {
                              const previewUrl = getEntityPreviewUrl('enemy', k);
                              const nameFmt = (enemiesData as any)[k]?.name ? `${(enemiesData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "NPC" && Object.keys(npcsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('npc', k);
                              const nameFmt = (npcsData as any)[k]?.name ? `${(npcsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "ITEM" && Object.keys(itemsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('item', k);
                              const nameFmt = (itemsData as any)[k]?.name ? `${(itemsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "DECORATION" && Object.keys(decorationsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('decoration', k);
                              const nameFmt = (decorationsData as any)[k]?.name ? `${(decorationsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "LIGHT" && Object.keys(level.lightDefinitions || {}).map(k => <option key={k} value={k}>{k}</option>)}
                            {act.params?.entityType === "AMBIENT_SOUND" && level.ambientSounds?.filter(s => s.symbol).map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                            {act.params?.entityType === "PARTICLE_EMITTER" && Object.keys(particlesData).map(k => <option key={k} value={k}>{k}</option>)}
                          </CustomSelect>

                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.x ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, x: e.target.value === '' ? '' : Number(e.target.value) },
                                })
                              }
                            />
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.y ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, y: e.target.value === '' ? '' : Number(e.target.value) },
                                })
                              }
                            />
                            <button
                              onClick={() => {
  const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
  const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
  onPickCoordinate((x, y) =>
    updateAction(sIdx, aIdx, (a) => ({
      ...a,
      params: { ...a.params, x, y },
    })),
    cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
  );
}}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                            >
                              <MapPin size={14} />
                            </button>
                          </div>
                        </>
                      )}

                      {act.type === "MODIFY_ENTITY" && (
                        <>
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                            value={act.params?.entityType || "ENEMY"}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, entityType: e.target.value },
                              })
                            }
                          >
                            <option value="ENEMY">Враг</option>
                            <option value="NPC">NPC</option>
                            <option value="ITEM">Предмет</option>
                            <option value="DECORATION">Декорация</option>
                          </CustomSelect>

                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-36 px-2 py-1 rounded"
                            title="Выберите конкретную сущность из библиотеки (или оставьте Любой)"
                            value={act.params?.definitionId || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, definitionId: e.target.value },
                              })
                            }
                          >
                            <option value="">-- Любой --</option>
                            {act.params?.entityType === "ENEMY" && Object.keys(enemiesData).map(k => {
                              const previewUrl = getEntityPreviewUrl('enemy', k);
                              const nameFmt = (enemiesData as any)[k]?.name ? `${(enemiesData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "NPC" && Object.keys(npcsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('npc', k);
                              const nameFmt = (npcsData as any)[k]?.name ? `${(npcsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "ITEM" && Object.keys(itemsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('item', k);
                              const nameFmt = (itemsData as any)[k]?.name ? `${(itemsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                            {act.params?.entityType === "DECORATION" && Object.keys(decorationsData).map(k => {
                              const previewUrl = getEntityPreviewUrl('decoration', k);
                              const nameFmt = (decorationsData as any)[k]?.name ? `${(decorationsData as any)[k].name.split('/')[0].trim()} [${k}]` : k;
                              return (
                                <option key={k} value={k}>
                                  <span className="inline-flex items-center gap-2">
                                    {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                    <span>{nameFmt}</span>
                                  </span>
                                </option>
                              );
                            })}
                          </CustomSelect>

                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span className="text-gray-500">X:</span>
                            <input
                              type="text"
                              placeholder="Любой"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.x ?? ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, x: e.target.value === '' ? undefined : Number(e.target.value) },
                                })
                              }
                            />
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="text"
                              placeholder="Любой"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.y ?? ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, y: e.target.value === '' ? undefined : Number(e.target.value) },
                                })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
                                const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
                                onPickCoordinate((x, y) =>
                                  updateAction(sIdx, aIdx, (a) => ({
                                    ...a,
                                    params: { ...a.params, x, y },
                                  })),
                                  cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                );
                              }}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                              title="Указать координаты"
                            >
                              <MapPin size={14} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => openVisualConstructorForAction(sIdx, aIdx, act)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-colors"
                            title="Открыть конструктор параметров сущности"
                          >
                            <Sliders size={13} className="text-indigo-400" />
                            <span>Настроить параметры</span>
                            {act.params?.modifiedConfig && Object.keys(act.params.modifiedConfig).length > 0 && (
                              <span className="bg-indigo-900/80 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded-full font-mono border border-indigo-700/60 ml-0.5">
                                {Object.keys(act.params.modifiedConfig).length}
                              </span>
                            )}
                          </button>

                          {act.params?.modifiedConfig && Object.keys(act.params.modifiedConfig).length > 0 && (
                            <div className="w-full flex flex-wrap items-center gap-1.5 text-[11px] pt-1.5 border-t border-gray-900 text-gray-400">
                              <span className="text-gray-500 font-semibold shrink-0">Изменения:</span>
                              {Object.entries(act.params.modifiedConfig).map(([key, val]) => (
                                <span key={key} className="bg-gray-900 border border-gray-800 text-indigo-300/90 px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]" title={`${key}: ${JSON.stringify(val)}`}>
                                  <span className="text-gray-400 font-sans">{key}:</span> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {act.type === "CHANGE_TILE" && (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-gray-400">
                              {uiStrings.level_editor?.change_tile_target || "Заменить на блок/дверь:"}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 w-full sm:w-auto px-2 py-1 rounded text-white"
                              value={getSelectedValue(act.params)}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                if (val.startsWith("construction_")) {
                                  const sym = val.replace("construction_", "");
                                  const block = (level.construction || []).find((c: any) => c.symbol === sym);
                                  if (block) {
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: {
                                        ...act.params,
                                        tileSourceType: 'construction',
                                        tileSourceId: sym,
                                        newType: (block.type || 'floor').toUpperCase() as any,
                                        newAssetId: block.assetId,
                                      }
                                    });
                                  }
                                } else if (val.startsWith("door_")) {
                                  const key = val.replace("door_", "");
                                  const doorDef = level.doorDefinitions?.[key];
                                  if (doorDef) {
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: {
                                        ...act.params,
                                        tileSourceType: 'door',
                                        tileSourceId: key,
                                        newType: 'DOOR',
                                        newAssetId: doorDef.id || doorDef.textureId || '',
                                        doorConfig: doorDef,
                                      }
                                    });
                                  }
                                }
                              }}
                            >
                              <option value="">-- {uiStrings.level_editor?.sound_select || "-- Выбрать --"} --</option>
                              <optgroup label={uiStrings.level_editor?.palette_blocks || "БЛОКИ"}>
                                {(level.construction || []).map((c: any) => {
                                  const blockFmt = uiStrings.level_editor?.change_tile_block_fmt || "Блок: {symbol} ({type})";
                                  const label = blockFmt
                                    .replace("{symbol}", c.symbol)
                                    .replace("{type}", c.type || "floor");
                                  return (
                                    <option key={`c_${c.symbol}`} value={`construction_${c.symbol}`}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </optgroup>
                              <optgroup label={uiStrings.level_editor?.palette_doors || "ДВЕРИ"}>
                                {Object.entries(level.doorDefinitions || {}).map(([key, def]: [string, any]) => {
                                  const doorFmt = uiStrings.level_editor?.change_tile_door_fmt || "Дверь: {key} ({type})";
                                  const label = doorFmt
                                    .replace("{key}", key)
                                    .replace("{type}", def.type || "HINGE");
                                  return (
                                    <option key={`d_${key}`} value={`door_${key}`}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            </CustomSelect>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.x ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    x: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.y ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    y: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                            <button
                              onClick={() => {
                                const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
                                const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
                                onPickCoordinate((x, y) =>
                                  updateAction(sIdx, aIdx, (a) => ({
                                    ...a,
                                    params: { ...a.params, x, y },
                                  })),
                                  cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                );
                              }}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                            >
                              <MapPin size={14} />
                            </button>
                          </div>
                        </>
                      )}
                      {act.type === "DOOR_STATE_CHANGE" && (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-gray-400">
                              {uiStrings.level_editor?.door_state_label || "Состояние двери:"}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 w-full sm:w-auto px-2 py-1 rounded text-white"
                              value={act.params?.state || "OPEN"}
                              onChange={(e) => {
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    state: e.target.value
                                  }
                                });
                              }}
                            >
                              <option value="OPEN">{uiStrings.level_editor?.door_state_open || "Открыть (OPEN)"}</option>
                              <option value="CLOSED">{uiStrings.level_editor?.door_state_closed || "Закрыть (CLOSED)"}</option>
                            </CustomSelect>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.x ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    x: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.y ?? 0}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    y: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                            <button
                              onClick={() => {
                                const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
                                const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
                                onPickCoordinate((x, y) =>
                                  updateAction(sIdx, aIdx, (a) => ({
                                    ...a,
                                    params: { ...a.params, x, y },
                                  })),
                                  cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                );
                              }}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                            >
                              <MapPin size={14} />
                            </button>
                          </div>
                        </>
                      )}
                      {act.type === "GIVE_ITEM" && (
                        <>
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded"
                            value={act.params?.itemDefinitionId || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  itemDefinitionId: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Выберите предмет</option>
                            {Object.entries(itemsData).map(
                              ([id, item]: [string, any]) => {
                                const previewUrl = getEntityPreviewUrl('item', id);
                                const nameFmt = item?.name ? `${item.name.split('/')[0].trim()} [${id}]` : id;
                                return (
                                  <option key={id} value={id}>
                                    <span className="inline-flex items-center gap-2">
                                      {previewUrl ? <img src={previewUrl} className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700" style={{ imageRendering: 'pixelated' }} alt="" referrerPolicy="no-referrer" /> : <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />}
                                      <span>{nameFmt}</span>
                                    </span>
                                  </option>
                                );
                              },
                            )}
                          </CustomSelect>
                          <input
                            type="number"
                            className="bg-gray-900 border border-gray-700 w-full sm:w-16 px-2 py-1 rounded"
                            placeholder="count (opt)"
                            value={act.params?.count || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  count: e.target.value === '' ? '' : Number(e.target.value) || undefined,
                                },
                              })
                            }
                          />
                          <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                            <span
                              className="text-gray-500"
                              title="Spawn On Ground?"
                            >
                              sp.X:
                            </span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.spawnAtX ?? ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    spawnAtX: e.target.value
                                      ? e.target.value === '' ? '' : Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                            <span
                              className="text-gray-500"
                              title="Spawn On Ground?"
                            >
                              sp.Y:
                            </span>
                            <input
                              type="number"
                              className="bg-transparent w-10 text-center"
                              value={act.params?.spawnAtY ?? ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    spawnAtY: e.target.value
                                      ? e.target.value === '' ? '' : Number(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                            />
                            <button
                              onClick={() => {
    const cx = typeof act.params?.spawnAtX === 'number' ? act.params.spawnAtX : undefined;
    const cy = typeof act.params?.spawnAtY === 'number' ? act.params.spawnAtY : undefined;
    onPickCoordinate((x, y) =>
      updateAction(sIdx, aIdx, (a) => ({
        ...a,
        params: {
          ...a.params,
          spawnAtX: x,
          spawnAtY: y,
        },
      })),
      cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
    );
  }}
                              className="text-indigo-400 hover:text-indigo-300 p-1"
                            >
                              <MapPin size={14} />
                            </button>
                          </div>
                        </>
                      )}
                      {act.type === "TAKE_ITEM" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-xs text-amber-400 cursor-pointer select-none bg-gray-900 px-2 py-1 rounded border border-amber-500/30">
                            <input
                              type="checkbox"
                              checked={!!act.params?.takeAll}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    takeAll: e.target.checked,
                                    takeAllScope: act.params?.takeAllScope || "ALL",
                                  },
                                })
                              }
                              className="rounded text-amber-500 focus:ring-0"
                            />
                            <span>Изъять всё</span>
                          </label>

                          {act.params?.takeAll ? (
                            <CustomSelect
                              className="bg-gray-900 border border-amber-500/50 text-amber-300 w-full sm:w-56 px-2 py-1 rounded text-xs"
                              value={act.params?.takeAllScope || "ALL"}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    takeAllScope: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="ALL">Вообще всё (Инвентарь + Экипировка)</option>
                              <option value="INVENTORY">Только в инвентаре</option>
                              <option value="EQUIPPED">Только экипированные вещи</option>
                            </CustomSelect>
                          ) : (
                            <>
                              <CustomSelect
                                className="bg-gray-900 border border-gray-700 w-full sm:w-36 px-2 py-1 rounded text-xs"
                                value={act.params?.itemDefinitionId || ""}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      itemDefinitionId: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">Выберите предмет</option>
                                {Object.entries(itemsData).map(
                                  ([id, item]: [string, any]) => {
                                    const nameFmt = item?.name ? `${item.name.split('/')[0].trim()} [${id}]` : id;
                                    return (
                                      <option key={id} value={id}>
                                        {nameFmt}
                                      </option>
                                    );
                                  },
                                )}
                              </CustomSelect>

                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-full sm:w-16 px-2 py-1 rounded text-xs"
                                placeholder="кол-во"
                                value={act.params?.count || ""}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      count: e.target.value === '' ? '' : Number(e.target.value) || undefined,
                                    },
                                  })
                                }
                              />
                            </>
                          )}
                        </div>
                      )}
                      {act.type === "SHOW_TUTORIAL" && (
                        <div className="flex flex-col gap-3 w-full border-l-2 border-cyan-500/50 pl-2 bg-cyan-950/20 py-1.5 rounded-r">
                          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider text-cyan-400">
                            Параметры обучения
                          </label>
                          
                          {(() => {
                            const pages = act.params?.pages || [
                              {
                                text: act.params?.text || "",
                                highlightElement: act.params?.highlightElement || "NONE"
                              }
                            ];
                            
                            return (
                              <div className="flex flex-col gap-3">
                                {pages.map((page: any, pIdx: number) => (
                                  <div key={pIdx} className="border border-gray-800 bg-gray-900/40 p-2.5 rounded flex flex-col gap-2 relative">
                                    <div className="flex justify-between items-center font-['Jura']">
                                      <span className="text-[10px] text-gray-500 font-mono">Страница {pIdx + 1}</span>
                                      {pages.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newPages = [...pages];
                                            newPages.splice(pIdx, 1);
                                            updateAction(sIdx, aIdx, {
                                              ...act,
                                              params: { 
                                                ...act.params, 
                                                text: newPages[0]?.text || "",
                                                highlightElement: newPages[0]?.highlightElement || "NONE",
                                                pages: newPages 
                                              }
                                            });
                                          }}
                                          className="text-red-400 hover:text-red-300 transition-colors p-1"
                                          title="Удалить страницу"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                    
                                    <FastTextArea
                                      className="bg-gray-950 border border-gray-800 w-full text-xs px-2 py-1.5 rounded resize-y min-h-[50px] text-gray-100 font-['Jura']"
                                      placeholder="Текст страницы (используйте {W} для кнопок)"
                                      value={page.text || ""}
                                      onChangeValue={(val) => {
                                        const newPages = pages.map((p: any, idx: number) => 
                                          idx === pIdx ? { ...p, text: val } : p
                                        );
                                        updateAction(sIdx, aIdx, {
                                          ...act,
                                          params: { 
                                            ...act.params, 
                                            text: newPages[0]?.text || "",
                                            highlightElement: newPages[0]?.highlightElement || "NONE",
                                            pages: newPages 
                                          }
                                        });
                                      }}
                                    />

                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-gray-400 shrink-0">Подсветка:</span>
                                      <CustomSelect
                                        className="bg-gray-950 border border-gray-800 text-xs px-2 py-0.5 rounded w-full"
                                        value={page.highlightElement || "NONE"}
                                        onChange={(e) => {
                                          const newPages = pages.map((p: any, idx: number) => 
                                            idx === pIdx ? { ...p, highlightElement: e.target.value } : p
                                          );
                                          updateAction(sIdx, aIdx, {
                                            ...act,
                                            params: { 
                                              ...act.params, 
                                              text: newPages[0]?.text || "",
                                              highlightElement: newPages[0]?.highlightElement || "NONE",
                                              pages: newPages 
                                            }
                                          });
                                        }}
                                      >
                                        <option value="NONE">Без подсветки</option>
                                        <option value="TOUCH_CONTROLS">Панель управления (низ)</option>
                                        <option value="HEADER_BUTTON_GEAR">Кнопка "Пауза"</option>
                                        <option value="HEADER_BUTTON_MAP">Кнопка "Карта"</option>
                                        <option value="HEADER_BUTTON_MENU">Кнопка "Инвентарь/Меню"</option>
                                        <option value="HEADER_BUTTONS">Все кнопки в шапке</option>
                                        <option value="PLAYER_STATS">Уровень и Здоровье</option>
                                        <option value="AMMO_BADGE">Бирка с патронами</option>
                                        <option value="EFFECTS">Эффекты (Баффы/Дебаффы)</option>
                                      </CustomSelect>
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1 border-t border-gray-800/80 pt-1.5 font-['Jura'] ml-0 px-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          openAssetPicker(sIdx, aIdx, 'tutorial_asset', pIdx);
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded font-bold transition-colors max-w-full truncate"
                                      >
                                        {uiStrings?.dialogue_image || "Изображение"}{page.assetId ? `: ${page.assetId}` : ''}
                                      </button>
                                      {page.assetId && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newPages = pages.map((p: any, idx: number) => 
                                              idx === pIdx ? { ...p, assetId: undefined } : p
                                            );
                                            updateAction(sIdx, aIdx, {
                                              ...act,
                                              params: { 
                                                ...act.params, 
                                                text: newPages[0]?.text || "",
                                                highlightElement: newPages[0]?.highlightElement || "NONE",
                                                pages: newPages 
                                              }
                                            });
                                          }}
                                          className="bg-red-650 hover:bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="flex justify-end mt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newPages = [...pages, { text: "", highlightElement: "NONE" }];
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: { 
                                          ...act.params, 
                                          text: newPages[0]?.text || "",
                                          highlightElement: newPages[0]?.highlightElement || "NONE",
                                          pages: newPages 
                                        }
                                      });
                                    }}
                                    className="bg-cyan-850 hover:bg-cyan-700 text-white font-semibold text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm border border-cyan-700/50"
                                  >
                                    <Plus size={12} /> Добавить страницу
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {act.type === "SHOW_DIALOGUE" && (
                        <div className="flex flex-col gap-2 w-full">
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 w-full sm:max-w-xs px-2 py-1 rounded"
                            value={act.params?.dialogueId || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  dialogueId: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Выберите диалог</option>
                            {Object.entries(dialoguesData).map(
                              ([id, diag]: [string, any]) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ),
                            )}
                          </CustomSelect>
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="flex items-center gap-1 text-gray-400 text-xs">
                              <input
                                type="checkbox"
                                checked={!!act.params?.isRadio}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, isRadio: e.target.checked },
                                  })
                                }
                              />
                              Радиоперехват
                            </label>
                          </div>
                          <div className="flex flex-col gap-2 bg-gray-800 p-2 rounded w-full border border-gray-700">
                            <div className="flex flex-wrap items-center gap-2 w-full">
                                <input
                                  className="bg-gray-900 border border-gray-700 flex-1 min-w-[120px] px-2 py-1 rounded text-xs"
                                  placeholder="Имя / Name"
                                  value={act.params?.name || ""}
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: { ...act.params, name: e.target.value },
                                    })
                                  }
                                />
                                <div className="flex-1 min-w-[120px] flex">
                                  <input
                                    className="bg-gray-900 border border-gray-700 border-r-0 flex-1 px-2 py-1 rounded-l text-xs w-full"
                                    placeholder="Портрет (Asset ID)"
                                    value={act.params?.portrait || ""}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: { ...act.params, portrait: e.target.value },
                                      })
                                    }
                                  />
                                  <button
                                    onClick={() => openAssetPicker(sIdx, aIdx, 'portrait')}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-r text-xs font-bold whitespace-nowrap"
                                  >
                                    Пик
                                  </button>
                                </div>
                              </div>
                              <div className="text-gray-400 text-xs font-bold mt-1">Опции голоса:</div>
                              <div className="flex flex-wrap items-center gap-2 w-full">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-500 text-xs text-right w-12">Pitch:</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    className="bg-gray-900 border border-gray-700 w-16 px-1 py-1 rounded text-xs text-center"
                                    value={act.params?.voice?.pitch ?? 1.0}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          voice: { ...act.params?.voice, pitch: e.target.value === "" ? "" : e.target.value === '' ? '' : Number(e.target.value) },
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-500 text-xs text-right w-12">Rate:</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    className="bg-gray-900 border border-gray-700 w-16 px-1 py-1 rounded text-xs text-center"
                                    value={act.params?.voice?.rate ?? 1.0}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          voice: { ...act.params?.voice, rate: e.target.value === "" ? "" : e.target.value === '' ? '' : Number(e.target.value) },
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-500 text-xs text-right w-12">Vol:</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    className="bg-gray-900 border border-gray-700 w-16 px-1 py-1 rounded text-xs text-center"
                                    value={act.params?.voice?.volume ?? 1.0}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          voice: { ...act.params?.voice, volume: e.target.value === "" ? "" : e.target.value === '' ? '' : Number(e.target.value) },
                                        },
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-500 text-xs text-right w-12">Wave:</span>
                                  <CustomSelect
                                    className="bg-gray-900 border border-gray-700 px-1 py-1 rounded text-xs"
                                    value={act.params?.voice?.waveform || "sawtooth"}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          voice: { ...act.params?.voice, waveform: e.target.value },
                                        },
                                      })
                                    }
                                  >
                                    <option value="sine">sine</option>
                                    <option value="square">square</option>
                                    <option value="sawtooth">sawtooth</option>
                                    <option value="triangle">triangle</option>
                                  </CustomSelect>
                                </div>
                              </div>
                            </div>
                        </div>
                      )}
                      {act.type === "PLAY_SOUND" && (
                        <CustomSelect
                          className="bg-gray-900 border border-gray-700 w-full sm:max-w-xs px-2 py-1 rounded"
                          value={act.params?.soundId || ""}
                          onChange={(e) =>
                            updateAction(sIdx, aIdx, {
                              ...act,
                              params: {
                                ...act.params,
                                soundId: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Выберите звук</option>
                          {soundOptions.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </CustomSelect>
                      )}
                      {act.type === "SHOW_SCREAMER" && (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex flex-wrap items-center gap-2 w-full">
                            {/* Graphic Picker */}
                            <div className="flex items-center gap-1 w-full sm:max-w-xs">
                              <span className="text-gray-400 text-xs text-right shrink-0 w-24">
                                {uiStrings.screamer_image || "Изображение скримера"}:
                              </span>
                              <div className="flex w-full">
                                <input
                                  type="text"
                                  className="bg-gray-900 border border-gray-700 w-full px-2 py-1 rounded-l text-xs text-indigo-300"
                                  placeholder="ID ассета"
                                  value={act.params?.image || ""}
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: { ...act.params, image: e.target.value },
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => openAssetPicker(sIdx, aIdx, 'screamer_image')}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-r text-xs font-bold whitespace-nowrap"
                                >
                                  Пик
                                </button>
                              </div>
                            </div>

                            {/* Sound Picker */}
                            <div className="flex items-center gap-1 w-full sm:max-w-xs">
                              <span className="text-gray-400 text-xs text-right shrink-0 w-24">
                                {uiStrings.screamer_sound || "Звук скримера"}:
                              </span>
                              <CustomSelect
                                className="bg-gray-900 border border-gray-700 w-full px-2 py-1 rounded text-xs text-gray-200"
                                value={act.params?.soundId || act.params?.sound || ""}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      soundId: e.target.value,
                                      sound: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">-- Выберите звук / Select --</option>
                                {soundOptions.map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              </CustomSelect>
                            </div>

                            {/* Duration */}
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 text-xs text-right shrink-0 w-24 sm:w-auto">
                                {uiStrings.screamer_duration || "Длительность (мс)"}:
                              </span>
                              <input
                                type="number"
                                min={500}
                                max={10000}
                                step={100}
                                className="bg-gray-900 border border-gray-700 w-24 px-2 py-1 rounded text-xs text-center"
                                value={act.params?.duration ?? 2000}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      duration: e.target.value === '' ? '' : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {act.type === "ADD_LOG" && (
                        <>
                          <input
                            className="bg-gray-900 border border-gray-700 w-full sm:max-w-xs px-2 py-1 rounded"
                            placeholder="messageKey (e.g. Рус/Eng)"
                            value={act.params?.messageKey || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  messageKey: e.target.value,
                                },
                              })
                            }
                          />
                          <label className="flex items-center gap-1 text-gray-400 text-xs ml-2">
                            <input
                              type="checkbox"
                              checked={!!act.params?.toast}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    toast: e.target.checked,
                                  },
                                })
                              }
                            />
                            Toast
                          </label>
                        </>
                      )}
                      {act.type === "SET_FLAG" && (
                        <>
                          <input
                            className="bg-gray-900 border border-gray-700 flex-1 min-w-[120px] px-2 py-1 rounded w-full sm:w-auto"
                            placeholder="flag"
                            value={act.params?.flag || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, flag: e.target.value },
                              })
                            }
                          />
                          <CustomSelect
                            className="bg-gray-900 border border-gray-700 flex-1 min-w-[120px] px-2 py-1 rounded w-full sm:w-auto text-white"
                            value={act.params?.value === false ? "false" : "true"}
                            onChange={(e) => {
                              const val = e.target.value === "true";
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, value: val },
                              });
                            }}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </CustomSelect>
                        </>
                      )}
                      {(act.type === "CREATE_COUNTER" || act.type === "SET_COUNTER") && (
                        <>
                          <input
                            className="bg-gray-900 border border-gray-700 flex-1 min-w-[120px] px-2 py-1 rounded w-full sm:w-auto text-xs font-mono"
                            placeholder="counterId (e.g. terminals_counter)"
                            value={act.params?.counterId || act.params?.id || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, counterId: e.target.value },
                              })
                            }
                          />
                          <span className="text-xs text-gray-400">{isRu ? "Значение:" : "Val:"}</span>
                          <input
                            type="number"
                            className="bg-gray-900 border border-gray-700 w-24 px-2 py-1 rounded text-xs text-white font-mono"
                            value={act.params?.value ?? act.params?.initialValue ?? 0}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, value: Number(e.target.value) },
                              })
                            }
                          />
                        </>
                      )}
                      {act.type === "INCREMENT_COUNTER" && (
                        <>
                          <input
                            className="bg-gray-900 border border-gray-700 flex-1 min-w-[120px] px-2 py-1 rounded w-full sm:w-auto text-xs font-mono"
                            placeholder="counterId (e.g. terminals_counter)"
                            value={act.params?.counterId || act.params?.id || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, counterId: e.target.value },
                              })
                            }
                          />
                          <span className="text-xs text-gray-400">{isRu ? "Прибавить (+1):" : "Add (+1):"}</span>
                          <input
                            type="number"
                            className="bg-gray-900 border border-gray-700 w-20 px-2 py-1 rounded text-xs text-white font-mono"
                            value={act.params?.amount ?? act.params?.value ?? 1}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, amount: Number(e.target.value) },
                              })
                            }
                          />
                        </>
                      )}
                      {act.type === "SET_SECTOR" && (
                        <div className="flex flex-col gap-4 bg-gray-900 p-3 rounded border border-gray-800 w-full text-xs">
                          {/* Mode selector */}
                          <div className="w-full">
                            <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                              {uiStrings.set_sector_mode || (isRu ? "Режим изменения" : "Change Mode")}
                            </label>
                            <CustomSelect
                              className="bg-gray-800 border border-gray-700 w-full sm:w-64 px-2 py-1 rounded text-white text-xs animate-none"
                              value={act.params?.changeMode ?? "all"}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: { ...act.params, changeMode: e.target.value },
                                })
                              }
                            >
                              <option value="all">{uiStrings.set_sector_mode_all || (isRu ? "Всё вместе" : "All Together")}</option>
                              <option value="skybox">{uiStrings.set_sector_mode_skybox || (isRu ? "Поменять скайбокс" : "Change Skybox Only")}</option>
                              <option value="light">{uiStrings.set_sector_mode_light || (isRu ? "Уровень освещения" : "Lighting Level Only")}</option>
                              <option value="weather">{uiStrings.set_sector_mode_weather || (isRu ? "Поменять погоду" : "Change Weather Only")}</option>
                            </CustomSelect>
                          </div>

                          {/* Conditional setting inputs */}
                          <div className="flex flex-col sm:flex-row flex-wrap gap-4 w-full">
                            {/* Weather & Fog (only if mode is 'all' or 'weather') */}
                            {(act.params?.changeMode === undefined || act.params?.changeMode === "all" || act.params?.changeMode === "weather") && (
                              <div className="flex-1 min-w-[200px] flex flex-col gap-3">
                                <div className="w-full">
                                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                                    {uiStrings.set_sector_weather || (isRu ? "Погода" : "Weather")}
                                  </label>
                                  <CustomSelect
                                    className="bg-gray-800 border border-gray-700 w-full px-2 py-1 rounded text-white text-xs animate-none"
                                    value={act.params?.weather ?? "none"}
                                    onChange={(e) => {
                                      const nextWeather = e.target.value;
                                      const newParams = { ...act.params, weather: nextWeather };
                                      if (nextWeather === "fog") {
                                        newParams.fogColor = newParams.fogColor || "#bec8d2";
                                        newParams.fogDistance = newParams.fogDistance || 15;
                                      }
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: newParams,
                                      });
                                    }}
                                  >
                                    <option value="none">{uiStrings.set_sector_weather_none || (isRu ? "Без погоды" : "None")}</option>
                                    <option value="rain">{uiStrings.set_sector_weather_rain || (isRu ? "Дождь" : "Rain")}</option>
                                    <option value="fog">{uiStrings.set_sector_weather_fog || (isRu ? "Туман" : "Fog")}</option>
                                  </CustomSelect>
                                </div>

                                {/* Fog options (distance & color) - show only if weather is 'fog' */}
                                {(act.params?.weather === "fog") && (
                                  <div className="flex flex-col sm:flex-row gap-3 bg-black/30 p-2 rounded border border-gray-800 w-full">
                                    {/* Fog Distance */}
                                    <div className="flex-1 min-w-[120px]">
                                      <label className="block text-[9px] text-gray-400 uppercase tracking-wider mb-1">
                                        {uiStrings.set_sector_fog_distance || (isRu ? "Дальность тумана (плитки)" : "Fog Distance (tiles)")}
                                      </label>
                                      <FastInput
                                        type="text"
                                        className="bg-gray-800 border border-gray-700 w-full px-2 py-1 rounded text-white text-xs animate-none"
                                        placeholder="15"
                                        value={act.params?.fogDistance !== undefined ? String(act.params.fogDistance) : ""}
                                        onChangeValue={(val) => {
                                          const trimmed = val.trim();
                                          const num = trimmed === "" ? undefined : Math.max(1, Number(trimmed) || 15);
                                          updateAction(sIdx, aIdx, {
                                            ...act,
                                            params: { ...act.params, fogDistance: num },
                                          });
                                        }}
                                      />
                                    </div>

                                    {/* Fog Color */}
                                    <div className="flex-1 min-w-[150px]">
                                      <label className="block text-[9px] text-gray-400 uppercase tracking-wider mb-1">
                                        {uiStrings.set_sector_fog_color || (isRu ? "Цвет тумана" : "Fog Color")}
                                      </label>
                                      <CustomColorPicker
                                        color={act.params?.fogColor || "#bec8d2"}
                                        onChange={(color) => {
                                          updateAction(sIdx, aIdx, {
                                            ...act,
                                            params: { ...act.params, fogColor: color },
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Global Light (only if mode is 'all' or 'light') */}
                            {(act.params?.changeMode === undefined || act.params?.changeMode === "all" || act.params?.changeMode === "light") && (
                              <div className="flex-1 min-w-[140px]">
                                 <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                                   {uiStrings.set_sector_global_light || (isRu ? "Глобальное освещение (0-1)" : "Global Light (0-1)")}
                                 </label>
                                 <input
                                   type="number"
                                   step="0.05"
                                   min="0"
                                   max="1"
                                   className="bg-gray-800 border border-gray-700 w-full px-2 py-1 rounded text-white text-xs animate-none"
                                   value={act.params?.globalLight ?? 0.1}
                                   onChange={(e) => {
                                     const val = e.target.value === "" ? 0.1 : Math.max(0, Math.min(1, Number(e.target.value)));
                                     updateAction(sIdx, aIdx, {
                                       ...act,
                                       params: { ...act.params, globalLight: val },
                                     });
                                   }}
                                 />
                              </div>
                            )}

                            {/* Skybox (only if mode is 'all' or 'skybox') */}
                            {(act.params?.changeMode === undefined || act.params?.changeMode === "all" || act.params?.changeMode === "skybox") && (
                              <div className="flex-1 min-w-[200px]">
                                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                                  {uiStrings.set_sector_skybox || (isRu ? "Текстура Скайбокса" : "Skybox Texture")}
                                </label>
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-gray-950 border border-gray-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                                    {act.params?.skyboxTextureId && getPreviewSrc(act.params.skyboxTextureId) ? (
                                      <img
                                        src={getPreviewSrc(act.params.skyboxTextureId)!}
                                        className="w-full h-full object-cover"
                                        style={{ imageRendering: "pixelated" }}
                                        alt=""
                                      />
                                    ) : (
                                      <span className="text-[8px] text-gray-500">NONE</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => openAssetPicker(sIdx, aIdx, "skybox")}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-1 text-xs text-left truncate text-white transition-colors animate-none"
                                  >
                                    {act.params?.skyboxTextureId || (uiStrings.select || (isRu ? "Выбрать..." : "Select..."))}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {act.type === "UNLOCK_ACHIEVEMENT" && (
                        <div className="flex flex-wrap items-center gap-2 bg-gray-900/80 p-2 rounded border border-gray-700/50">
                          <span className="text-gray-400 text-xs font-semibold">
                            {uiStrings.level_editor?.achievement_label || "Ачивка / Achievement:"}
                          </span>
                          <CustomSelect
                            className="bg-gray-800 border border-gray-700 w-full sm:w-auto px-2 py-1 rounded text-white text-xs"
                            value={act.params?.achievementKey || act.params?.achievementId || "first_blood"}
                            onChange={(e) => {
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  achievementKey: e.target.value,
                                  achievementId: e.target.value,
                                },
                              });
                            }}
                          >
                            {achievementsData.map((ach: any) => (
                              <option key={ach.key} value={ach.key}>
                                {ach.name?.ru || ach.name?.en || ach.key} ({ach.key})
                              </option>
                            ))}
                          </CustomSelect>
                          <input
                            type="text"
                            placeholder="или ID..."
                            className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-white text-xs w-32 focus:outline-none focus:border-indigo-500"
                            value={act.params?.achievementKey || act.params?.achievementId || ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  achievementKey: e.target.value,
                                  achievementId: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      )}
                      {act.type === "END" && (
                        <div className="flex flex-wrap items-center gap-3 bg-gray-900/80 p-2 rounded border border-gray-700/50">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs font-semibold">
                              {isRu ? "Затемнение (мс):" : "Fade Out (ms):"}
                            </span>
                            <input
                              type="number"
                              className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-white text-xs w-20 focus:outline-none focus:border-indigo-500"
                              value={act.params?.duration ?? 2000}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    duration: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs font-semibold">
                              {isRu ? "Задержка меню (мс):" : "Menu Delay (ms):"}
                            </span>
                            <input
                              type="number"
                              className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-white text-xs w-20 focus:outline-none focus:border-indigo-500"
                              value={act.params?.delay ?? 500}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    delay: e.target.value === '' ? '' : Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {(act.type === "REVEAL_TASK" ||
                        act.type === "COMPLETE_TASK") && (
                        <CustomSelect
                          className="bg-gray-900 border border-gray-700 w-full sm:w-48 px-2 py-1 rounded"
                          value={act.params?.taskId || ""}
                          onChange={(e) =>
                            updateAction(sIdx, aIdx, {
                              ...act,
                              params: { ...act.params, taskId: e.target.value },
                            })
                          }
                        >
                          <option value="">Выберите задачу</option>
                          {level.tasks?.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.id}
                            </option>
                          ))}
                        </CustomSelect>
                      )}
                      {act.type === "CINEMATIC_CAMERA" && (
                        <div className="flex flex-col gap-2 p-2 bg-gray-800 rounded w-full">
                          {(() => {
                            let points: any[] = Array.isArray(act.params?.points) ? act.params.points : [];
                            if (points.length === 0 && (act.params?.startX !== undefined || act.params?.targetX !== undefined)) {
                              // Migrate legacy
                              points = [
                                { x: act.params.startX, y: act.params.startY, dir: act.params.startDir, pitch: act.params.pitch, duration: 0 },
                                { x: act.params.targetX, y: act.params.targetY, dir: act.params.targetDir, pitch: act.params.pitch, duration: act.params.duration || 2000 }
                              ];
                            }
                            if (points.length === 0) {
                                points = [{ x: 0, y: 0, dir: "C", pitch: 0, duration: 0 }];
                            }

                            const isRu = uiStrings?.scripts_settings === "Скрипты" || !uiStrings?.scripts_settings;
                            const labels = {
                              dir: isRu ? "Напр:" : "Dir:",
                              pitch: isRu ? "Наклон:" : "Pitch:",
                              zoom: isRu ? "Зум:" : "Zoom:",
                              floor: uiStrings.cinematic_static_floor || (isRu ? "Этаж:" : "Floor:"),
                              time: isRu ? "Время:" : "Time:",
                              add_point: uiStrings.cinematic_add_path_point || (isRu ? "Добавить точку пути" : "Add path point"),
                              angle: uiStrings.cinematic_angle || (isRu ? "Угол" : "Angle")
                            };

                            const updatePoints = (newPoints: any[]) => {
                                updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: { ...act.params, points: newPoints }
                                });
                            };

                            return (
                              <div className="flex flex-col gap-2 w-full">
                                {points.map((pt: any, ptIdx: number) => {
                                  const isPreset = ["N","S","E","W","C"].includes(pt.dir);
                                  const selectVal = isPreset ? pt.dir : "Custom";
                                  const customAngleVal = !isPreset ? (pt.dir ?? "") : "";

                                  return (
                                    <div key={ptIdx} className="flex flex-col gap-2 bg-gray-900 p-2.5 rounded relative group w-full border border-gray-800">
                                      {/* Row 1: Coordinates */}
                                      <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-400 text-xs font-bold w-4 shrink-0">{ptIdx}:</span>
                                          <span className="text-gray-500 text-xs shrink-0">X:</span>
                                          <input type="number" step="0.5" className="bg-gray-950 border border-gray-700 w-14 px-1.5 py-1 rounded text-xs text-white"
                                            value={pt.x ?? ""}
                                            onChange={(e) => {
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, x: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : undefined };
                                              updatePoints(newPts);
                                            }}
                                          />
                                          <span className="text-gray-500 text-xs shrink-0">Y:</span>
                                          <input type="number" step="0.5" className="bg-gray-950 border border-gray-700 w-14 px-1.5 py-1 rounded text-xs text-white"
                                            value={pt.y ?? ""}
                                            onChange={(e) => {
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, y: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : undefined };
                                              updatePoints(newPts);
                                            }}
                                          />
                                          <button type="button" onClick={() => {
                                            const cx = typeof pt.x === 'number' ? pt.x : undefined;
                                            const cy = typeof pt.y === 'number' ? pt.y : undefined;
                                            onPickCoordinate((x, y) => {
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, x, y };
                                              updatePoints(newPts);
                                            }, cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null);
                                          }} className="text-indigo-400 hover:text-indigo-300 p-1 shrink-0 bg-gray-950 rounded border border-gray-700">
                                            <MapPin size={14} />
                                          </button>
                                        </div>

                                        {points.length > 1 && (
                                          <button type="button" onClick={() => {
                                              const newPts = points.filter((_, i) => i !== ptIdx);
                                              updatePoints(newPts);
                                          }} className="text-red-500 hover:text-red-400 p-1 shrink-0 flex items-center justify-center bg-gray-950 rounded border border-gray-700 hover:border-red-900/50">
                                            <X size={14} />
                                          </button>
                                        )}
                                      </div>

                                      {/* Row 2: Angle/Direction and Pitch (Наклон) */}
                                      <div className="grid grid-cols-2 gap-2 w-full">
                                        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                                          <span className="text-gray-500 text-xs shrink-0">{labels.dir}</span>
                                          <CustomSelect className="bg-gray-950 border border-gray-700 px-1 py-1 rounded text-xs text-white shrink-0 w-14"
                                            value={selectVal}
                                            onChange={(e) => {
                                              const newPts = [...points];
                                              const val = e.target.value;
                                              newPts[ptIdx] = { ...pt, dir: val === "Custom" ? 0 : val };
                                              updatePoints(newPts);
                                            }}>
                                            <option value="N">N</option>
                                            <option value="S">S</option>
                                            <option value="E">E</option>
                                            <option value="W">W</option>
                                            <option value="C">C</option>
                                            <option value="Custom">{labels.angle}</option>
                                          </CustomSelect>

                                          {!isPreset && (
                                            <input type="number" step="any" className="bg-gray-950 border border-gray-700 w-11 px-1 py-1 rounded text-xs text-white shrink-0"
                                              value={customAngleVal}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                const newPts = [...points];
                                                newPts[ptIdx] = { ...pt, dir: val !== "" ? (val === '-' ? '-' : Number(val)) : "" };
                                                updatePoints(newPts);
                                              }}
                                              placeholder="G."
                                            />
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                                          <span className="text-gray-500 text-xs shrink-0">{labels.pitch}</span>
                                          <input type="number" step="0.1" className="bg-gray-950 border border-gray-700 w-14 px-1 py-1 rounded text-xs text-white"
                                            value={pt.pitch ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, pitch: val !== "" ? (val === '-' ? '-' : Number(val)) : "" };
                                              updatePoints(newPts);
                                            }}
                                          />
                                        </div>
                                      </div>

                                      {/* Row 3: Zoom, Floor and Time */}
                                      <div className="grid grid-cols-3 gap-2 w-full">
                                        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                                          <span className="text-gray-500 text-xs shrink-0">{labels.zoom}</span>
                                          <input type="number" step="0.1" className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                            value={pt.zoom ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, zoom: val !== "" ? (val === '-' ? '-' : Number(val)) : "" };
                                              updatePoints(newPts);
                                            }}
                                            placeholder="1.0"
                                          />
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                                          <span className="text-gray-500 text-xs shrink-0">{labels.floor}</span>
                                          <input type="number" step="0.1" className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                            value={pt.floor ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, floor: val !== "" ? (val === '-' ? '-' : Number(val)) : "" };
                                              updatePoints(newPts);
                                            }}
                                            placeholder="0.0"
                                          />
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                                          <span className="text-gray-500 text-xs shrink-0">{labels.time}</span>
                                          <input type="number" className="bg-gray-950 border border-gray-700 w-14 px-1 py-1 rounded text-xs text-white"
                                            value={pt.duration ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              const newPts = [...points];
                                              newPts[ptIdx] = { ...pt, duration: val !== "" ? (val === '-' ? '-' : Number(val)) : "" };
                                              updatePoints(newPts);
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold self-start mt-1 flex gap-1 items-center"
                                  onClick={() => {
                                    const lastPt = points[points.length - 1];
                                    const newPts = [...points, { ...lastPt, duration: 2000 }];
                                    updatePoints(newPts);
                                  }}
                                >
                                  <Plus size={14} /> {labels.add_point}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {act.type === "CINEMATIC_STATIC_CAMERA" && (
                        <div className="flex flex-col gap-3 p-3 bg-gray-800 rounded w-full">
                          {(() => {
                            const isRu = uiStrings?.scripts_settings === "Скрипты" || !uiStrings?.scripts_settings;
                            const labels = {
                              x: uiStrings.cinematic_static_x || "X",
                              y: uiStrings.cinematic_static_y || "Y",
                              dir: uiStrings.cinematic_static_dir || (isRu ? "Угол" : "Angle"),
                              pitch: uiStrings.cinematic_static_pitch || (isRu ? "Наклон" : "Pitch"),
                              zoom: uiStrings.cinematic_static_zoom || (isRu ? "Зум" : "Zoom"),
                              floor: uiStrings.cinematic_static_floor || (isRu ? "Этаж" : "Floor"),
                              duration: uiStrings.cinematic_static_duration || (isRu ? "Время" : "Time"),
                              select_coor: uiStrings.cinematic_select_coor || (isRu ? "Выбрать на карте" : "Select on map")
                            };

                            const valX = act.params?.x ?? "";
                            const valY = act.params?.y ?? "";
                            const valDir = act.params?.dir ?? "";
                            const valPitch = act.params?.pitch ?? "";
                            const valZoom = act.params?.zoom ?? "";
                            const valFloor = act.params?.floor ?? "";
                            const valDuration = act.params?.duration ?? "";

                            const updateParams = (newParams: any) => {
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: { ...act.params, ...newParams }
                              });
                            };

                            return (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-gray-900 p-2 rounded w-full">
                                <div className="flex items-center gap-1.5 min-w-[130px]">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.x}:</span>
                                  <input 
                                    type="number" 
                                    step="0.5"
                                    className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                    value={valX}
                                    onChange={(e) => {
                                      updateParams({ x: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                  
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.y}:</span>
                                  <input 
                                    type="number" 
                                    step="0.5"
                                    className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                    value={valY}
                                    onChange={(e) => {
                                      updateParams({ y: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const cx = valX !== "" ? Number(valX) : undefined;
                                      const cy = valY !== "" ? Number(valY) : undefined;
                                      onPickCoordinate((x, y) => {
                                        updateParams({ x, y });
                                      }, cx !== undefined && cy !== undefined && !isNaN(cx) && !isNaN(cy) ? { x: cx, y: cy } : null);
                                    }} 
                                    className="text-indigo-400 hover:text-indigo-300 p-0.5 shrink-0 flex items-center justify-center"
                                    title={labels.select_coor}
                                  >
                                    <MapPin size={14} />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.dir}:</span>
                                  <input 
                                    type="number" 
                                    step="any"
                                    className="bg-gray-950 border border-gray-700 w-14 px-1 py-1 rounded text-xs text-white"
                                    value={valDir}
                                    onChange={(e) => {
                                      updateParams({ dir: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                    placeholder="Тек."
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.pitch}:</span>
                                  <input 
                                    type="number" 
                                    step="0.1"
                                    className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                    value={valPitch}
                                    onChange={(e) => {
                                      updateParams({ pitch: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.zoom}:</span>
                                  <input 
                                    type="number" 
                                    step="0.1"
                                    className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                    value={valZoom}
                                    onChange={(e) => {
                                      updateParams({ zoom: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.floor}:</span>
                                  <input 
                                    type="number" 
                                    step="0.1"
                                    className="bg-gray-950 border border-gray-700 w-12 px-1 py-1 rounded text-xs text-white"
                                    value={valFloor}
                                    onChange={(e) => {
                                      updateParams({ floor: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                </div>

                                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                                  <span className="text-gray-400 text-xs font-bold shrink-0">{labels.duration}:</span>
                                  <input 
                                    type="number" 
                                    className="bg-gray-950 border border-gray-700 w-14 sm:w-20 px-1 py-1 rounded text-xs text-white"
                                    value={valDuration}
                                    onChange={(e) => {
                                      updateParams({ duration: e.target.value !== "" ? (e.target.value === '' ? '' : Number(e.target.value)) : "" });
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {act.type === "DELAY" && (
                        <div className="flex items-center gap-2 p-2 bg-gray-800 rounded">
                          <span className="text-gray-500 whitespace-nowrap">Время задержки (мс):</span>
                          <input
                            type="number"
                            className="bg-gray-950 border border-gray-700 w-full sm:w-24 px-2 py-1 rounded"
                            value={act.params?.time ?? 1000}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  time: e.target.value === '' ? '' : Number(e.target.value),
                                },
                              })
                            }
                          />
                        </div>
                      )}
                      {act.type === "REPEAT" && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 bg-gray-800 rounded text-xs w-full">
                          <span className="text-gray-400 whitespace-nowrap">Пауза между срабатываниями (мс):</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            className="bg-gray-950 border border-gray-700 w-full sm:w-32 px-2 py-1 rounded text-white text-xs font-mono"
                            placeholder="0"
                            value={act.params?.delay !== undefined ? act.params.delay : (act.params?.time !== undefined ? act.params.time : "")}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  delay: e.target.value === '' ? '' : Number(e.target.value),
                                },
                              })
                            }
                          />
                        </div>
                      )}
                      {act.type === "STOP_REPEAT" && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 bg-gray-800 rounded text-xs w-full">
                          <span className="text-gray-400 whitespace-nowrap">ID скрипта для остановки:</span>
                          <input
                            type="text"
                            className="bg-gray-950 border border-gray-700 w-full sm:w-64 px-2 py-1 rounded text-white text-xs font-mono"
                            placeholder="ID скрипта..."
                            value={act.params?.scriptId ?? ""}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  scriptId: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      )}
                      {act.type === "PLAYER_DEATH" && (
                        <div className="flex flex-col gap-2 p-1.5 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 w-full">
                          {/* Верхний ряд: X: поле, Y: поле, кнопка */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 whitespace-nowrap">X:</span>
                              <input
                                type="number"
                                className="bg-gray-950 border border-gray-700 w-14 px-1.5 py-0.5 rounded text-center text-white text-xs"
                                value={act.params?.wakeUpX ?? ""}
                                placeholder="X"
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      wakeUpX: e.target.value === '' ? undefined : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 whitespace-nowrap">Y:</span>
                              <input
                                type="number"
                                className="bg-gray-950 border border-gray-700 w-14 px-1.5 py-0.5 rounded text-center text-white text-xs"
                                value={act.params?.wakeUpY ?? ""}
                                placeholder="Y"
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      wakeUpY: e.target.value === '' ? undefined : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </div>
                            <button
                              onClick={() => {
                                const cx = typeof act.params?.wakeUpX === 'number' ? act.params.wakeUpX : undefined;
                                const cy = typeof act.params?.wakeUpY === 'number' ? act.params.wakeUpY : undefined;
                                onPickCoordinate((x, y) =>
                                  updateAction(sIdx, aIdx, (a) => ({
                                    ...a,
                                    params: { ...a.params, wakeUpX: x, wakeUpY: y },
                                  })),
                                  cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                );
                              }}
                              className="text-indigo-400 hover:text-indigo-300 p-1 flex items-center justify-center border border-gray-700 bg-gray-950 rounded h-7 w-7 text-xs shrink-0 ml-auto"
                              title="Выбрать координату"
                            >
                              <MapPin size={12} />
                            </button>
                          </div>
                          
                          {/* Нижний ряд: список выбора направления */}
                          <div className="w-full">
                            <CustomSelect
                              className="bg-gray-950 border border-gray-700 w-full px-2 py-1 rounded text-white text-xs"
                              value={act.params?.wakeUpDir ?? ""}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    wakeUpDir: e.target.value === '' ? undefined : Number(e.target.value),
                                  },
                                })
                              }
                            >
                              <option value="">-- {uiStrings.none || "None"} --</option>
                              <option value="0">{uiStrings.dir_n || "North"}</option>
                              <option value="1">{uiStrings.dir_e || "East"}</option>
                              <option value="2">{uiStrings.dir_s || "South"}</option>
                              <option value="3">{uiStrings.dir_w || "West"}</option>
                            </CustomSelect>
                          </div>
                        </div>
                      )}
                      {act.type === "MOVE_TO" && (
                        <div className="flex flex-col gap-2.5 p-2 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 w-full md:max-w-md">
                          {/* START COORDINATES */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-teal-400 text-xs">
                              {uiStrings.moveto_start_x ? `${uiStrings.moveto_start_x}/${uiStrings.moveto_start_y}` : (isRu ? "Начальная точка:" : "Start coordinate:")}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-500">X:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.startX ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      startX: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <span className="text-gray-500">Y:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.startY ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      startY: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <button
                                onClick={() => {
                                  const cx = typeof act.params?.startX === 'number' ? act.params.startX : undefined;
                                  const cy = typeof act.params?.startY === 'number' ? act.params.startY : undefined;
                                  onPickCoordinate((x, y) =>
                                    updateAction(sIdx, aIdx, (a) => ({
                                      ...a,
                                      params: { ...a.params, startX: x, startY: y },
                                    })),
                                    cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                  );
                                }}
                                className="text-indigo-400 hover:text-indigo-300 p-1 flex items-center justify-center border border-gray-700 bg-gray-900 rounded h-6 w-6 text-xs shrink-0"
                                title={uiStrings.moveto_pick_start || "Выбрать начальную точку"}
                              >
                                <MapPin size={11} />
                              </button>
                            </div>
                          </div>

                          {/* TARGET COORDINATES */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-emerald-400 text-xs">
                              {uiStrings.moveto_target_x ? `${uiStrings.moveto_target_x}/${uiStrings.moveto_target_y}` : (isRu ? "Конечная точка:" : "Target coordinate:")}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-500">X:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.targetX ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      targetX: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <span className="text-gray-500">Y:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.targetY ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      targetY: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <button
                                onClick={() => {
                                  const cx = typeof act.params?.targetX === 'number' ? act.params.targetX : undefined;
                                  const cy = typeof act.params?.targetY === 'number' ? act.params.targetY : undefined;
                                  onPickCoordinate((x, y) =>
                                    updateAction(sIdx, aIdx, (a) => ({
                                      ...a,
                                      params: { ...a.params, targetX: x, targetY: y },
                                    })),
                                    cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                  );
                                }}
                                className="text-indigo-400 hover:text-indigo-300 p-1 flex items-center justify-center border border-gray-700 bg-gray-900 rounded h-6 w-6 text-xs shrink-0"
                                 title={uiStrings.moveto_pick_target || "Выбрать конечную точку"}
                              >
                                <MapPin size={11} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {act.type === "NPC_FOLLOW" && (
                        <div className="flex flex-col gap-2.5 p-2 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 w-full md:max-w-md">
                          {/* MODE SELECTOR */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-cyan-400 text-xs">
                              {uiStrings.npcfollow_mode || (isRu ? "Режим следования:" : "Follow mode:")}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 px-2 py-1 rounded text-white"
                              value={act.params?.mode || "NPC_FOLLOWS_PLAYER"}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    mode: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="NPC_FOLLOWS_PLAYER">
                                {uiStrings.npcfollow_mode_npc_follows_player || (isRu ? "NPC следует за игроком" : "NPC follows player")}
                              </option>
                              <option value="PLAYER_FOLLOWS_NPC">
                                {uiStrings.npcfollow_mode_player_follows_npc || (isRu ? "Игрок следует за NPC в точку" : "Player follows NPC to point")}
                              </option>
                              <option value="STOP">
                                {uiStrings.npcfollow_mode_stop || (isRu ? "Остановить следование" : "Stop following")}
                              </option>
                            </CustomSelect>
                          </div>

                          {/* SELECT NPC FROM LEVEL LIST */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-emerald-400 text-xs shrink-0">
                              {uiStrings.npcfollow_select_npc || (isRu ? "Выберите NPC:" : "Select NPC:")}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 px-2 py-1 rounded text-white text-xs w-full sm:max-w-xs"
                              value={
                                placedNPCs.find(
                                  (n) =>
                                    (n.npcId === act.params?.npcId || n.symbol === act.params?.npcId) &&
                                    n.x === (act.params?.startX ?? act.params?.npcX) &&
                                    n.y === (act.params?.startY ?? act.params?.npcY)
                                )?.key ||
                                act.params?.npcId ||
                                ""
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                const found = placedNPCs.find((n) => n.key === val || n.npcId === val);
                                if (found) {
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      startX: found.x,
                                      startY: found.y,
                                      npcId: found.npcId,
                                    },
                                  });
                                } else {
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      npcId: val,
                                    },
                                  });
                                }
                              }}
                            >
                              <option value="">
                                {uiStrings.npcfollow_manual_coords || (isRu ? "-- Указать вручную по X/Y --" : "-- Manual X/Y coordinates --")}
                              </option>
                              {placedNPCs.length > 0 && (
                                <optgroup label={uiStrings.npcfollow_npcs_on_level || (isRu ? "NPC на этом уровне" : "NPCs on this level")}>
                                  {placedNPCs.map((npc) => (
                                    <option key={npc.key} value={npc.key}>
                                      {npc.label}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label={uiStrings.npcfollow_all_npc_presets || (isRu ? "Все типы NPC (из базы)" : "All NPC presets")}>
                                {Object.entries(npcsData).map(([id, def]: [string, any]) => {
                                  const name = (def.name || id).split('/')[0].trim();
                                  return (
                                    <option key={`npc_${id}`} value={id}>
                                      {name} ({id})
                                    </option>
                                  );
                                })}
                              </optgroup>
                            </CustomSelect>
                          </div>

                          {/* NPC START COORDINATES */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-teal-400 text-xs">
                              {uiStrings.npcfollow_npc_pos ? `${uiStrings.npcfollow_npc_pos}` : (isRu ? "Координаты NPC:" : "NPC coordinate:")}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-500">X:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.startX ?? act.params?.npcX ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      startX: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <span className="text-gray-500">Y:</span>
                              <input
                                type="number"
                                className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                value={act.params?.startY ?? act.params?.npcY ?? 0}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      startY: e.target.value === '' ? 0 : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <button
                                onClick={() => {
                                  const cx = typeof act.params?.startX === 'number' ? act.params.startX : undefined;
                                  const cy = typeof act.params?.startY === 'number' ? act.params.startY : undefined;
                                  onPickCoordinate((x, y) =>
                                    updateAction(sIdx, aIdx, (a) => ({
                                      ...a,
                                      params: { ...a.params, startX: x, startY: y },
                                    })),
                                    cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                  );
                                }}
                                className="text-indigo-400 hover:text-indigo-300 p-1 flex items-center justify-center border border-gray-700 bg-gray-900 rounded h-6 w-6 text-xs shrink-0"
                                title={uiStrings.moveto_pick_start || "Выбрать точку NPC"}
                              >
                                <MapPin size={11} />
                              </button>
                            </div>
                          </div>

                          {/* TARGET COORDINATES & DISTANCE (When mode is PLAYER_FOLLOWS_NPC) */}
                          {act.params?.mode === "PLAYER_FOLLOWS_NPC" && (
                            <>
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                                <span className="font-semibold text-emerald-400 text-xs">
                                  {uiStrings.npcfollow_target_pos ? `${uiStrings.npcfollow_target_pos}` : (isRu ? "Целевая точка:" : "Target coordinate:")}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-gray-500">X:</span>
                                  <input
                                    type="number"
                                    className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                    value={act.params?.targetX ?? 0}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          targetX: e.target.value === '' ? 0 : Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                  <span className="text-gray-500">Y:</span>
                                  <input
                                    type="number"
                                    className="bg-gray-900 border border-gray-700 w-12 px-1 py-0.5 rounded text-center text-white"
                                    value={act.params?.targetY ?? 0}
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          targetY: e.target.value === '' ? 0 : Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                  <button
                                    onClick={() => {
                                      const cx = typeof act.params?.targetX === 'number' ? act.params.targetX : undefined;
                                      const cy = typeof act.params?.targetY === 'number' ? act.params.targetY : undefined;
                                      onPickCoordinate((x, y) =>
                                        updateAction(sIdx, aIdx, (a) => ({
                                          ...a,
                                          params: { ...a.params, targetX: x, targetY: y },
                                        })),
                                        cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                                      );
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 p-1 flex items-center justify-center border border-gray-700 bg-gray-900 rounded h-6 w-6 text-xs shrink-0"
                                    title={uiStrings.moveto_pick_target || "Выбрать конечную точку"}
                                  >
                                    <MapPin size={11} />
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                                <span className="font-semibold text-amber-400 text-xs">
                                  {uiStrings.npcfollow_max_dist || (isRu ? "Макс. дистанция ожидания:" : "Max wait distance:")}
                                </span>
                                <input
                                  type="number"
                                  className="bg-gray-900 border border-gray-700 w-16 px-1 py-0.5 rounded text-center text-white"
                                  value={act.params?.maxDistance ?? 4}
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: {
                                        ...act.params,
                                        maxDistance: e.target.value === '' ? 4 : Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {act.type === "RESET_SPAWN" && (
                        <div className="flex flex-wrap items-center gap-1 bg-gray-900 rounded px-1 w-full sm:w-auto">
                          <span className="text-gray-500">X:</span>
                          <input
                            type="number"
                            className="bg-transparent w-10 text-center"
                            value={act.params?.x ?? 0}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  x: e.target.value === '' ? '' : Number(e.target.value),
                                },
                              })
                            }
                          />
                          <span className="text-gray-500">Y:</span>
                          <input
                            type="number"
                            className="bg-transparent w-10 text-center"
                            value={act.params?.y ?? 0}
                            onChange={(e) =>
                              updateAction(sIdx, aIdx, {
                                ...act,
                                params: {
                                  ...act.params,
                                  y: e.target.value === '' ? '' : Number(e.target.value),
                                },
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cx = typeof act.params?.x === 'number' ? act.params.x : undefined;
                              const cy = typeof act.params?.y === 'number' ? act.params.y : undefined;
                              onPickCoordinate(
                                (x, y) =>
                                  updateAction(sIdx, aIdx, (a) => ({
                                    ...a,
                                    params: { ...a.params, x, y },
                                  })),
                                cx !== undefined && cy !== undefined ? { x: cx, y: cy } : null
                              );
                            }}
                            className="text-indigo-400 hover:text-indigo-300 p-1"
                          >
                            <MapPin size={14} />
                          </button>
                        </div>
                      )}
                      {act.type === "MUSIC_PLAYER" && (
                        <div className="flex flex-col gap-2.5 p-2 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 w-full md:max-w-md">
                          {/* ACTION SELECT */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-teal-400 text-xs">
                              {uiStrings?.music_player_action || "Действие с музыкой:"}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                              value={act.params?.musicAction || "CHANGE"}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    musicAction: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="CHANGE">{uiStrings?.music_player_change || "Сменить музыку"}</option>
                              <option value="PAUSE">{uiStrings?.music_player_pause || "Пауза"}</option>
                              <option value="RESUME">{uiStrings?.music_player_resume || "Продолжить"}</option>
                              <option value="STOP">{uiStrings?.music_player_stop || "Остановить"}</option>
                            </CustomSelect>
                          </div>

                          {/* TRACK ID (Only if musicAction is CHANGE) */}
                          {(act.params?.musicAction === "CHANGE" || !act.params?.musicAction) && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                              <span className="font-semibold text-emerald-400 text-xs">
                                {uiStrings?.music_player_select_track || "Выбрать трек:"}
                              </span>
                              <div className="flex gap-2 w-full sm:w-auto">
                                <CustomSelect
                                  value={act.params?.trackId || ""}
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: {
                                        ...act.params,
                                        trackId: e.target.value,
                                      },
                                    })
                                  }
                                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs w-full sm:w-48"
                                >
                                  <option value="">-- {uiStrings?.none || "None"} --</option>
                                  {streamingMusicOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </CustomSelect>
                                {act.params?.trackId && (
                                  <button
                                    type="button"
                                    onClick={() => playSoundPreview(act.params.trackId)}
                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 shrink-0 text-teal-400 hover:text-teal-300 flex items-center justify-center w-8 h-8"
                                    title={playingTrackId === act.params.trackId ? (isRu ? "Остановить" : "Stop") : (isRu ? "Прослушать" : "Play")}
                                  >
                                    {playingTrackId === act.params.trackId ? (
                                      <Square size={13} fill="currentColor" />
                                    ) : (
                                      <Play size={13} fill="currentColor" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* CROSSFADE / FADE DURATION (Only for CHANGE) */}
                          {(act.params?.musicAction === "CHANGE" || !act.params?.musicAction) && (
                            <div className="flex flex-col gap-2 p-1.5 bg-gray-950 rounded">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`crossfade-${sIdx}-${aIdx}`}
                                  checked={act.params?.crossfade !== false}
                                  onChange={(e) =>
                                    updateAction(sIdx, aIdx, {
                                      ...act,
                                      params: {
                                        ...act.params,
                                        crossfade: e.target.checked,
                                      },
                                    })
                                  }
                                  className="rounded bg-gray-900 border-gray-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 animate-none"
                                />
                                <label htmlFor={`crossfade-${sIdx}-${aIdx}`} className="font-semibold text-gray-300 text-xs select-none">
                                  {uiStrings?.music_player_crossfade || "Плавный переход (кроссфейд)"}
                                </label>
                              </div>

                              {act.params?.crossfade !== false && (
                                <div className="flex items-center justify-between mt-1 gap-2 pl-5">
                                  <span className="text-gray-400 text-[11px]">
                                    {uiStrings?.music_player_duration || "Длительность (сек):"}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    className="bg-gray-900 border border-gray-700 w-16 px-1.5 py-0.5 rounded text-center text-white"
                                    value={act.params?.fadeDuration !== undefined ? act.params.fadeDuration : ""}
                                    placeholder="2.0"
                                    onChange={(e) =>
                                      updateAction(sIdx, aIdx, {
                                        ...act,
                                        params: {
                                          ...act.params,
                                          fadeDuration: e.target.value === '' ? '' : Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {act.type === "LAUNCH_MINIGAME" && (
                        <div className="flex flex-col gap-2.5 p-2 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 w-full md:max-w-md font-['Jura']">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                            <span className="font-semibold text-teal-400 text-xs shrink-0">
                              {isRu ? "Мини-игра:" : "Minigame:"}
                            </span>
                            <CustomSelect
                              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs w-full sm:w-48"
                              value={act.params?.gameId || "chess"}
                              onChange={(e) =>
                                updateAction(sIdx, aIdx, {
                                  ...act,
                                  params: {
                                    ...act.params,
                                    gameId: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="chess">{isRu ? "Шахматы" : "Chess"}</option>
                              <option value="custom">{isRu ? "Другая (указать ID)" : "Other (specify ID)"}</option>
                            </CustomSelect>
                          </div>
                          {(act.params?.gameId === "custom" || (act.params?.gameId !== "chess" && act.params?.gameId !== undefined)) && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-gray-950 rounded">
                              <span className="font-semibold text-emerald-400 text-xs">
                                {isRu ? "Идентификатор игры:" : "Custom Game ID:"}
                              </span>
                              <input
                                type="text"
                                className="bg-gray-900 border border-gray-700 w-full sm:w-48 px-2 py-1 rounded text-white text-xs"
                                placeholder="game_id"
                                value={act.params?.gameId === "custom" ? "" : act.params?.gameId || ""}
                                onChange={(e) =>
                                  updateAction(sIdx, aIdx, {
                                    ...act,
                                    params: {
                                      ...act.params,
                                      gameId: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => addAction(sIdx)}
                  className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-2 py-1 rounded"
                >
                  <Plus size={14} /> Добавить действие
                </button>
              </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800 shrink-0">
          <button
            onClick={addScript}
            className="bg-indigo-600 hover:bg-indigo-500 font-bold uppercase tracking-widest text-white px-4 py-2 w-full flex items-center justify-center gap-2 rounded"
          >
            <Plus size={18} /> Добавить скрипт
          </button>
        </div>
        {pickingAssetFor && (
          <div className="absolute inset-0 bg-gray-900 z-[1000] p-4 h-full flex flex-col sm:rounded-lg">
            <AssetPicker
              targetName={pickingAssetFor.type === 'portrait' ? (uiStrings.screamer_portrait || "Портрет / Portrait") : pickingAssetFor.type === 'screamer_image' ? (uiStrings.screamer_image || "Изображение скримера / Screamer Image") : pickingAssetFor.type === 'skybox' ? (isRu ? "Скайбокс / Skybox" : "Skybox Texture") : `${uiStrings?.dialogue_page || "Страница"} ${(pickingAssetFor.pIdx ?? 0) + 1} - ${uiStrings?.dialogue_tutorial_asset || "Ассет"}`}
              uiStrings={uiStrings}
              onCancel={() => setPickingAssetFor(null)}
              onSelect={(assetId) => {
                if (pickingAssetFor.type === 'portrait') {
                  updateAction(pickingAssetFor.sIdx, pickingAssetFor.aIdx, (a) => ({
                    ...a,
                    params: { ...a.params, portrait: assetId },
                  }));
                } else if (pickingAssetFor.type === 'skybox') {
                  updateAction(pickingAssetFor.sIdx, pickingAssetFor.aIdx, (a) => ({
                    ...a,
                    params: { ...a.params, skyboxTextureId: assetId },
                  }));
                } else if (pickingAssetFor.type === 'screamer_image') {
                  updateAction(pickingAssetFor.sIdx, pickingAssetFor.aIdx, (a) => ({
                    ...a,
                    params: { ...a.params, image: assetId },
                  }));
                } else if (pickingAssetFor.type === 'tutorial_asset' && pickingAssetFor.pIdx !== undefined) {
                  const sIdx = pickingAssetFor.sIdx;
                  const aIdx = pickingAssetFor.aIdx;
                  const pIdx = pickingAssetFor.pIdx;
                  const act = localScripts[sIdx].actions[aIdx];
                  const pages = act.params?.pages || [
                    {
                      text: act.params?.text || "",
                      highlightElement: act.params?.highlightElement || "NONE"
                    }
                  ];
                  const newPages = pages.map((p: any, idx: number) => 
                    idx === pIdx ? { ...p, assetId: assetId } : p
                  );
                  updateAction(sIdx, aIdx, {
                    ...act,
                    params: {
                      ...act.params,
                      text: newPages[0]?.text || "",
                      highlightElement: newPages[0]?.highlightElement || "NONE",
                      pages: newPages 
                    }
                  });
                }
                setPickingAssetFor(null);
              }}
            />
          </div>
        )}

        {tweakModalState && tweakModalState.isOpen && (
          <TweakEntityModal
            isOpen={tweakModalState.isOpen}
            onClose={() => setTweakModalState(null)}
            onSave={handleSaveTweakModal}
            initialConfig={tweakModalState.initialConfig}
            uiStrings={uiStrings}
            coordKey={tweakModalState.coordKey}
            listName={tweakModalState.listName}
          />
        )}
      </div>
    </div>
  );
};
