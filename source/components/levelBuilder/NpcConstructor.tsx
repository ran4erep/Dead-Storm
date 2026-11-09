import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Trash2,
  Plus,
  Play,
  Search,
  Copy,
  Volume2,
  Image,
  Activity,
  PlusCircle,
  User,
  MessageSquare,
  ShoppingCart,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { ASSETS } from "../../assets";
import soundsData from "../../data/sounds.json";
import itemsData from "../../data/items.json";
import dialoguesData from "../../data/dialogues.json";
import animationsData from "../../data/animations.json";
import { CustomSelect } from "./CustomSelect";
import { AssetPicker } from "./AssetPicker";
import { getEntityPreviewUrl } from "./levelBuilderUtils";

interface NpcConstructorProps {
  data: Record<string, any>;
  onChange: (newData: Record<string, any>) => void;
  uiStrings: any;
}

export const NpcConstructor: React.FC<NpcConstructorProps> = ({
  data,
  onChange,
  uiStrings
}) => {
  const [selectedId, setSelectedId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [newNpcId, setNewNpcId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>("");

  // Asset picker state
  const [pickingField, setPickingField] = useState<string | null>(null);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop sound when unmounting
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
    };
  }, []);

  const playSound = (soundId: string) => {
    if (!soundId) return;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    const soundConfig = (soundsData as any)[soundId];
    const assetId = soundConfig?.assetId || soundId;
    const url = (ASSETS.SOUNDS as any)[assetId];
    if (url) {
      const audio = new Audio(url);
      audio.volume = soundConfig?.volume ?? 1.0;
      activeAudioRef.current = audio;
      audio.play().catch(err => console.log("Audio playback error:", err));
      audio.onended = () => {
        if (activeAudioRef.current === audio) activeAudioRef.current = null;
      };
    }
  };

  // Memoized NPC IDs
  const npcIds = useMemo(() => Object.keys(data), [data]);

  // Set initial selected NPC if none selected or if selected ID is invalid
  useEffect(() => {
    if ((!selectedId || !npcIds.includes(selectedId)) && npcIds.length > 0) {
      setSelectedId(npcIds[0]);
    }
  }, [npcIds, selectedId]);

  // Filtered NPC list
  const filteredNpcIds = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return npcIds;
    return npcIds.filter(id => {
      const npc = data[id];
      const name = (npc?.name || "").toLowerCase();
      const desc = (npc?.description || "").toLowerCase();
      return id.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [npcIds, searchTerm, data]);

  const activeNpc = useMemo(() => {
    return data[selectedId] || null;
  }, [data, selectedId]);

  // Helpers to split and join localization slashes
  const [nameRu, nameEn] = useMemo(() => {
    if (!activeNpc) return ["", ""];
    const parts = (activeNpc.name || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeNpc?.name]);

  const [descRu, descEn] = useMemo(() => {
    if (!activeNpc) return ["", ""];
    const parts = (activeNpc.description || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeNpc?.description]);

  // Trade responses helper
  const getResponseLang = (key: "success" | "sell_success" | "no_money" | "no_space", lang: "ru" | "en") => {
    if (!activeNpc || !activeNpc.tradeResponses) return "";
    const rawResponse = activeNpc.tradeResponses[key] || "";
    const parts = rawResponse.split("/");
    return lang === "ru" ? parts[0] || "" : parts[1] || "";
  };

  const handleResponseChange = (key: "success" | "sell_success" | "no_money" | "no_space", lang: "ru" | "en", val: string) => {
    if (!activeNpc) return;
    const escapedVal = val.replace(/\//g, " ");
    const ruVal = lang === "ru" ? escapedVal : getResponseLang(key, "ru");
    const enVal = lang === "en" ? escapedVal : getResponseLang(key, "en");
    updateField(`tradeResponses.${key}`, `${ruVal}/${enVal}`);
  };

  // Update helper
  const updateField = (path: string, value: any) => {
    if (!selectedId || !activeNpc) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetNpc = newData[selectedId];

    const parts = path.split(".");
    let current = targetNpc;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    onChange(newData);
  };

  // Helper to remove field
  const removeField = (path: string) => {
    if (!selectedId || !activeNpc) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetNpc = newData[selectedId];

    const parts = path.split(".");
    let current = targetNpc;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) return;
      current = current[parts[i]];
    }
    delete current[parts[parts.length - 1]];

    onChange(newData);
  };

  // Helper to update multiple fields atomically
  const updateMultipleFields = (updates: { path: string; value: any }[], removals?: string[]) => {
    if (!selectedId || !activeNpc) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetNpc = newData[selectedId];

    updates.forEach(({ path, value }) => {
      const parts = path.split(".");
      let current = targetNpc;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    });

    if (removals) {
      removals.forEach((path) => {
        const parts = path.split(".");
        let current = targetNpc;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) return;
          current = current[parts[i]];
        }
        delete current[parts[parts.length - 1]];
      });
    }

    onChange(newData);
  };

  const handleNameChange = (lang: "ru" | "en", val: string) => {
    const escapedVal = val.replace(/\//g, " ");
    if (lang === "ru") {
      updateField("name", `${escapedVal}/${nameEn}`);
    } else {
      updateField("name", `${nameRu}/${escapedVal}`);
    }
  };

  const handleDescChange = (lang: "ru" | "en", val: string) => {
    const escapedVal = val.replace(/\//g, " ");
    if (lang === "ru") {
      updateField("description", `${escapedVal}/${descEn}`);
    } else {
      updateField("description", `${descRu}/${escapedVal}`);
    }
  };

  const handleCreateNpc = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newNpcId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanId) {
      setCreateError("ID не может быть пустым");
      return;
    }
    if (data[cleanId]) {
      setCreateError("NPC с таким ID уже существует");
      return;
    }

    // Создаём ЧИСТЫЙ и полноценный шаблон NPC
    const cleanNpc = {
      name: "/",
      description: "/",
      canBeKilled: false,
      talkRange: 1,
      canBeInspected: true,
      assets: {
        map: { assetId: "", scale: "" },
        hands_up: { assetId: "", scale: "" },
        dead: { assetId: "", scale: "" },
        portrait: { assetId: "", scale: "" }
      },
      hp: 1,
      dialogueId: "",
      voice: {
        pitch: 1.0,
        rate: 1.0,
        waveform: "sawtooth",
        volume: 1.0,
        resonance: 1.0
      },
      corpseScale: 0.5,
      deadScale: 0.32,
      roamRadius: 3,
      sounds: {
        death: "BODY_HIT"
      }
    };

    const newData = {
      ...data,
      [cleanId]: cleanNpc
    };

    onChange(newData);
    setSelectedId(cleanId);
    setNewNpcId("");
    setShowCreateForm(false);
    setCreateError("");
  };

  const handleDuplicateNpc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let counter = 1;
    let dupId = `${id}_copy`;
    while (data[dupId]) {
      counter++;
      dupId = `${id}_copy${counter}`;
    }

    const cloned = JSON.parse(JSON.stringify(data[id]));
    const nameParts = (cloned.name || "").split("/");
    cloned.name = `${nameParts[0] || ""} (Копия)/${nameParts[1] || ""} (Copy)`;

    const newData = {
      ...data,
      [dupId]: cloned
    };

    onChange(newData);
    setSelectedId(dupId);
  };

  const handleDeleteNpc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить NPC "${id}"?`)) {
      return;
    }

    const newData = { ...data };
    delete newData[id];

    onChange(newData);

    if (selectedId === id) {
      const remaining = Object.keys(newData);
      setSelectedId(remaining[0] || "");
    }
  };

  const getAssetPreviewUrl = (assetId: string) => {
    if (!assetId) return "";
    let url = (ASSETS.SPRITES as any)[assetId] || (ASSETS.TEXTURES as any)[assetId] || "";
    if (!url) {
      // Check animations
      const anim = (animationsData as any)[assetId];
      if (anim && anim.frames && anim.frames.length > 0) {
        const firstFrame = anim.frames[0];
        url = (ASSETS.SPRITES as any)[firstFrame] || (ASSETS.TEXTURES as any)[firstFrame] || "";
      }
    }
    if (url && url.startsWith("local://")) {
      try {
        url = localStorage.getItem(url.substring(8)) || url;
      } catch (e) {}
    }
    return url;
  };

  // Safe numeric inputs handler - allows user to completely clear inputs
  const handleNumInput = (path: string, rawVal: string, isFloat = false) => {
    const cleanVal = rawVal.replace(/,/g, ".");
    if (cleanVal === "") {
      updateField(path, "");
      return;
    }

    if (isFloat) {
      if (/^-?\d*\.?\d*$/.test(cleanVal)) {
        if (cleanVal.endsWith(".") || cleanVal === "-" || cleanVal === "-0" || (cleanVal.includes(".") && cleanVal.endsWith("0"))) {
          updateField(path, cleanVal);
        } else {
          const parsed = parseFloat(cleanVal);
          updateField(path, isNaN(parsed) ? "" : parsed);
        }
      }
    } else {
      if (/^-?\d*$/.test(cleanVal)) {
        if (cleanVal === "-") {
          updateField(path, cleanVal);
        } else {
          const parsed = parseInt(cleanVal, 10);
          updateField(path, isNaN(parsed) ? "" : parsed);
        }
      }
    }
  };

  const soundOptions = useMemo(() => Object.keys(soundsData).filter(key => !(soundsData as any)[key]?.alias), []);
  const dialogueOptions = useMemo(() => Object.keys(dialoguesData), []);

  // Trade Items Management
  const addTradeItem = () => {
    if (!activeNpc) return;
    const currentTrade = activeNpc.tradeItems ? [...activeNpc.tradeItems] : [];
    currentTrade.push({ id: Object.keys(itemsData)[0] || "", price: 10, count: 0 });
    updateField("tradeItems", currentTrade);
  };

  const updateTradeItem = (idx: number, field: string, value: any) => {
    if (!activeNpc || !activeNpc.tradeItems) return;
    const currentTrade = [...activeNpc.tradeItems];
    currentTrade[idx] = { ...currentTrade[idx], [field]: value };
    updateField("tradeItems", currentTrade);
  };

  const removeTradeItem = (idx: number) => {
    if (!activeNpc || !activeNpc.tradeItems) return;
    const currentTrade = activeNpc.tradeItems.filter((_: any, i: number) => i !== idx);
    if (currentTrade.length === 0) {
      updateField("tradeItems", []);
    } else {
      updateField("tradeItems", currentTrade);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 text-gray-200 max-w-full overflow-x-hidden">
      {/* Asset Picker Modal overlay */}
      {pickingField && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col custom-scrollbar">
            <AssetPicker
              targetName={pickingField}
              onSelect={(assetId) => {
                updateField(pickingField, assetId);
                setPickingField(null);
              }}
              onCancel={() => setPickingField(null)}
              uiStrings={uiStrings}
            />
          </div>
        </div>
      )}

      {/* Sidebar - NPC list */}
      <div className="w-full lg:w-72 shrink-0 bg-gray-950 border border-gray-800 rounded-lg flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs tracking-wider uppercase text-gray-400">Список NPC</span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="p-1 hover:bg-gray-800 rounded text-green-400 hover:text-green-300 transition-colors"
            title="Создать NPC"
          >
            <Plus size={18} />
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateNpc} className="bg-gray-900 p-2.5 rounded border border-gray-800 flex flex-col gap-2">
            <span className="text-[10px] text-indigo-400 font-bold">Уникальный ID (без пробелов):</span>
            <input
              type="text"
              placeholder="journalist_girl"
              value={newNpcId}
              onChange={(e) => {
                setNewNpcId(e.target.value);
                setCreateError("");
              }}
              className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono w-full"
            />
            {createError && <span className="text-[10px] text-red-500 font-bold">{createError}</span>}
            <div className="flex gap-2 justify-end mt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewNpcId("");
                  setCreateError("");
                }}
                className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] uppercase font-bold"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] uppercase font-bold"
              >
                Создать
              </button>
            </div>
          </form>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder="Поиск NPC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-850 rounded pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
        </div>

        <div className="flex-1 overflow-y-auto max-h-[180px] lg:max-h-[60vh] flex flex-col gap-1 pr-1 custom-scrollbar">
          {filteredNpcIds.map(id => {
            const npc = data[id];
            const isSelected = selectedId === id;
            const labelName = npc?.name?.split("/")[0] || id;

            return (
              <div
                key={id}
                onClick={() => setSelectedId(id)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-all border ${
                  isSelected
                    ? "bg-emerald-600/20 border-emerald-500/50 text-white font-bold"
                    : "bg-gray-900/40 border-transparent text-gray-400 hover:bg-gray-900/80 hover:text-gray-200"
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold truncate">{labelName}</span>
                  <span className="text-[10px] opacity-60 font-mono truncate">{id}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={(e) => handleDuplicateNpc(id, e)}
                    className="p-1 hover:bg-gray-850 rounded text-blue-400 hover:text-blue-300 transition-colors"
                    title="Дублировать"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteNpc(id, e)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredNpcIds.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-500 italic">Ничего не найдено</div>
          )}
        </div>
      </div>

      {/* Main Constructor Form */}
      <div className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 lg:p-4 overflow-y-auto max-h-[75vh] lg:max-h-[75vh] custom-scrollbar w-full min-w-0">
        {activeNpc ? (
          <div className="flex flex-col gap-5">
            {/* Header section with ID and Names */}
            <div className="border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-emerald-950 text-emerald-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-emerald-800/40 uppercase">NPC</span>
                <span className="text-xs text-gray-400 font-mono">{selectedId}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 font-bold mb-1">Имя (RU)</label>
                  <input
                    type="text"
                    value={nameRu}
                    onChange={(e) => handleNameChange("ru", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    placeholder="Например, Лана"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 font-bold mb-1">Name (EN)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => handleNameChange("en", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    placeholder="E.g. Lana"
                  />
                </div>
              </div>
            </div>

            {/* General Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-gray-800 pb-3">
              <div className="flex flex-col">
                <label className="text-[11px] text-gray-400 font-bold mb-1">Описание (RU)</label>
                <textarea
                  value={descRu}
                  onChange={(e) => handleDescChange("ru", e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[50px] custom-scrollbar resize-none"
                  placeholder="Описание на русском языке..."
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[11px] text-gray-400 font-bold mb-1">Description (EN)</label>
                <textarea
                  value={descEn}
                  onChange={(e) => handleDescChange("en", e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[50px] custom-scrollbar resize-none"
                  placeholder="English description..."
                />
              </div>
            </div>

            {/* Section: Main Stats */}
            <div>
              <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Activity size={14} /> Основные Характеристики
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Здоровье (HP)</label>
                  <input
                    type="text"
                    value={activeNpc.hp ?? ""}
                    onChange={(e) => handleNumInput("hp", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Радиус Блуждания</label>
                  <input
                    type="text"
                    value={activeNpc.roamRadius ?? ""}
                    onChange={(e) => handleNumInput("roamRadius", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Дальность диалога</label>
                  <input
                    type="text"
                    value={activeNpc.talkRange ?? ""}
                    onChange={(e) => handleNumInput("talkRange", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>
              </div>

              {/* Checkboxes parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeNpc.canBeKilled === true}
                    onChange={(e) => updateField("canBeKilled", e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-bold">Можно убить (canBeKilled)</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeNpc.canBeInspected !== false}
                    onChange={(e) => updateField("canBeInspected", e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-bold">Можно осматривать (canBeInspected)</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeNpc.noShadow === true}
                    onChange={(e) => updateField("noShadow", e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-bold">Без тени (noShadow)</span>
                </div>
              </div>
            </div>

            {/* Section: Dialogue connection */}
            <div>
              <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <MessageSquare size={14} /> Подключение Диалога
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Выбрать диалог:</label>
                  <CustomSelect
                    value={activeNpc.dialogueId || ""}
                    onChange={(e) => updateField("dialogueId", e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="">-- Без диалога --</option>
                    {dialogueOptions.map(id => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </CustomSelect>
                </div>
                <div className="flex-1 flex flex-col w-full">
                  <label className="text-[11px] text-gray-400 mb-1">Вручную ID диалога:</label>
                  <input
                    type="text"
                    value={activeNpc.dialogueId || ""}
                    onChange={(e) => updateField("dialogueId", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono w-full"
                    placeholder="Или введите кастомный ID"
                  />
                </div>
              </div>
            </div>

            {/* Section: Graphical Assets */}
            <div>
              <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Image size={14} /> Настройки Спрайтов и Анимаций
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {/* Map Sprite */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Спрайт на карте
                    <span className="text-[9px] text-gray-500 font-mono">assets.map</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeNpc.assets?.map?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeNpc.assets?.map?.assetId)}
                          alt="map"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeNpc.assets?.map?.assetId || "Не задан"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.map.assetId")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                        type="button"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-800/50">
                    <span className="text-[10px] text-gray-400">Масштаб:</span>
                    <input
                      type="text"
                      value={activeNpc.assets?.map?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.map.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Portrait */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Общий портрет
                    <span className="text-[9px] text-gray-500 font-mono">assets.portrait</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeNpc.assets?.portrait?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeNpc.assets?.portrait?.assetId)}
                          alt="portrait"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeNpc.assets?.portrait?.assetId || "Не задан"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.portrait.assetId")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                        type="button"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-800/50">
                    <span className="text-[10px] text-gray-400">Масштаб:</span>
                    <input
                      type="text"
                      value={activeNpc.assets?.portrait?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.portrait.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Hands Up Sprite */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Руки вверх / Испуг
                    <span className="text-[9px] text-gray-500 font-mono">assets.hands_up</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeNpc.assets?.hands_up?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeNpc.assets?.hands_up?.assetId)}
                          alt="hands_up"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeNpc.assets?.hands_up?.assetId || "Не задан"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.hands_up.assetId")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                        type="button"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-800/50">
                    <span className="text-[10px] text-gray-400">Масштаб:</span>
                    <input
                      type="text"
                      value={activeNpc.assets?.hands_up?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.hands_up.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Dead Sprite */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Спрайт трупа
                    <span className="text-[9px] text-gray-500 font-mono">assets.dead</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeNpc.assets?.dead?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeNpc.assets?.dead?.assetId)}
                          alt="dead"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeNpc.assets?.dead?.assetId || "Не задан"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.dead.assetId")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                        type="button"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-800/50">
                    <span className="text-[10px] text-gray-400">Масштаб:</span>
                    <input
                      type="text"
                      value={activeNpc.assets?.dead?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.dead.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Dialogue Portrait (Optional) */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Анимированный портрет
                    <span className="text-[9px] text-gray-500 font-mono">assets.dialogue_portrait</span>
                  </span>
                  <div className="flex items-center gap-1.5 mb-1">
                    <input
                      type="checkbox"
                      checked={activeNpc.assets?.dialogue_portrait !== undefined}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateField("assets.dialogue_portrait", { assetId: "", scale: "" });
                        } else {
                          removeField("assets.dialogue_portrait");
                        }
                      }}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400">Добавить портрет диалога</span>
                  </div>
                  {activeNpc.assets?.dialogue_portrait !== undefined && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                          {getAssetPreviewUrl(activeNpc.assets?.dialogue_portrait?.assetId) ? (
                            <img
                              src={getAssetPreviewUrl(activeNpc.assets?.dialogue_portrait?.assetId)}
                              alt="dialogue_portrait"
                              className="max-w-full max-h-full object-contain pixelated"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-[9px] text-gray-600">Пусто</span>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                            {activeNpc.assets?.dialogue_portrait?.assetId || "Не задан"}
                          </span>
                          <button
                            onClick={() => setPickingField("assets.dialogue_portrait.assetId")}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                            type="button"
                          >
                            Выбрать
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-800/50">
                        <span className="text-[10px] text-gray-400">Масштаб:</span>
                        <input
                          type="text"
                          value={activeNpc.assets?.dialogue_portrait?.scale ?? ""}
                          onChange={(e) => handleNumInput("assets.dialogue_portrait.scale", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Extra scaling factors (corpseScale & deadScale) */}
              <div className="grid grid-cols-2 gap-3 mt-3 bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Множитель трупа (corpseScale):</label>
                  <input
                    type="text"
                    value={activeNpc.corpseScale ?? ""}
                    onChange={(e) => handleNumInput("corpseScale", e.target.value, true)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0.5"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Множитель смерти (deadScale):</label>
                  <input
                    type="text"
                    value={activeNpc.deadScale ?? ""}
                    onChange={(e) => handleNumInput("deadScale", e.target.value, true)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0.32"
                  />
                </div>
              </div>
            </div>

            {/* Section: Voice & Audio */}
            <div>
              <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Volume2 size={14} /> Настройка Синтеза Речи и Озвучки (Voice)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Voice Synthesis Params */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2.5">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1">Параметры голоса</span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Высота (pitch):</label>
                      <input
                        type="text"
                        value={activeNpc.voice?.pitch ?? ""}
                        onChange={(e) => handleNumInput("voice.pitch", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="1.0"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Скорость (rate):</label>
                      <input
                        type="text"
                        value={activeNpc.voice?.rate ?? ""}
                        onChange={(e) => handleNumInput("voice.rate", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="1.0"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Громкость (volume):</label>
                      <input
                        type="text"
                        value={activeNpc.voice?.volume ?? ""}
                        onChange={(e) => handleNumInput("voice.volume", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="1.0"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Резонанс (resonance):</label>
                      <input
                        type="text"
                        value={activeNpc.voice?.resonance ?? ""}
                        onChange={(e) => handleNumInput("voice.resonance", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="1.0"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Форма волны (waveform):</label>
                    <CustomSelect
                      value={activeNpc.voice?.waveform || "sawtooth"}
                      onChange={(e) => updateField("voice.waveform", e.target.value)}
                      className="text-xs"
                    >
                      <option value="sawtooth">Пилообразная (sawtooth)</option>
                      <option value="sine">Синусоида (sine)</option>
                      <option value="triangle">Треугольная (triangle)</option>
                      <option value="square">Квадратная (square)</option>
                    </CustomSelect>
                  </div>
                </div>

                {/* Sound Effects */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2.5">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1">Звуковые эффекты</span>

                  {/* Death sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Смерть:</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeNpc.sounds?.death || ""}
                        onChange={(e) => updateField("sounds.death", e.target.value)}
                        className="flex-1 text-xs"
                      >
                        <option value="">-- Выберите звук --</option>
                        {soundOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </CustomSelect>
                      <button
                        onClick={() => playSound(activeNpc.sounds?.death)}
                        disabled={!activeNpc.sounds?.death}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Gasp sound (Optional) */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Вздох испуга (gasp):</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeNpc.sounds?.gasp || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("sounds.gasp", e.target.value);
                          } else {
                            removeField("sounds.gasp");
                          }
                        }}
                        className="flex-1 text-xs"
                      >
                        <option value="">-- Отсутствует --</option>
                        {soundOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </CustomSelect>
                      <button
                        onClick={() => playSound(activeNpc.sounds?.gasp)}
                        disabled={!activeNpc.sounds?.gasp}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Trade (optional merchant attributes) */}
            <div>
              <div className="flex items-center justify-between border-b border-gray-850 pb-1.5 mb-2.5">
                <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <ShoppingCart size={14} /> Торговля и Магазин
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeNpc.tradeItems !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateMultipleFields([
                          { path: "tradeItems", value: [] },
                          { path: "tradeResponses", value: {
                            success: "Отличный выбор, друг{подруга}!/Great choice, friend!",
                            sell_success: "Держи плату, друг{подруга}./Here is your payment, friend.",
                            no_money: "Не хватает денег, друг{подруга}, я не работаю в долг./Not enough money, friend, I don't work on credit.",
                            no_space: "У тебя нет места, разгрузись сначала./You have no space, unload first."
                          }}
                        ]);
                      } else {
                        updateMultipleFields([], ["tradeItems", "tradeResponses", "keepPrice"]);
                      }
                    }}
                    className="w-4 h-4 accent-emerald-500 rounded bg-gray-900 cursor-pointer"
                  />
                  <span className="text-xs text-gray-300 font-bold">Включить торговлю</span>
                </div>
              </div>

              {activeNpc.tradeItems !== undefined && (
                <div className="flex flex-col gap-4 bg-gray-900/40 p-3 rounded-lg border border-gray-850">
                  {/* Keep Price */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-950/40 p-2.5 rounded border border-gray-800/60 gap-3">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-gray-300 font-bold">Цена выкупа / залога (keepPrice)</span>
                      <span className="text-[10px] text-gray-500">Стоимость выкупа вещей при залоге у торговца</span>
                    </div>
                    <div className="flex gap-2 items-center w-full sm:w-auto shrink-0">
                      <input
                        type="checkbox"
                        checked={activeNpc.keepPrice !== undefined}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateField("keepPrice", 10);
                          } else {
                            removeField("keepPrice");
                          }
                        }}
                        className="accent-emerald-500 rounded bg-gray-900 h-4 w-4 cursor-pointer"
                      />
                      <input
                        type="text"
                        disabled={activeNpc.keepPrice === undefined}
                        value={activeNpc.keepPrice ?? ""}
                        onChange={(e) => handleNumInput("keepPrice", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center w-20 disabled:opacity-45 text-white font-mono"
                        placeholder="10"
                      />
                    </div>
                  </div>
                  {/* Trade responses localization editor */}
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1">Ответы Торговца при сделках</span>

                    {/* Success buy */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-950/40 p-2 rounded border border-gray-800/60">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Успешная покупка (RU)</label>
                        <input
                          type="text"
                          value={getResponseLang("success", "ru")}
                          onChange={(e) => handleResponseChange("success", "ru", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Отличный выбор, друг!"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Success Purchase (EN)</label>
                        <input
                          type="text"
                          value={getResponseLang("success", "en")}
                          onChange={(e) => handleResponseChange("success", "en", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Great choice, friend!"
                        />
                      </div>
                    </div>

                    {/* Sell success */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-950/40 p-2 rounded border border-gray-800/60">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Успешная продажа (RU)</label>
                        <input
                          type="text"
                          value={getResponseLang("sell_success", "ru")}
                          onChange={(e) => handleResponseChange("sell_success", "ru", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Держи плату, друг."
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Success Selling (EN)</label>
                        <input
                          type="text"
                          value={getResponseLang("sell_success", "en")}
                          onChange={(e) => handleResponseChange("sell_success", "en", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Here is your payment, friend."
                        />
                      </div>
                    </div>

                    {/* No money */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-950/40 p-2 rounded border border-gray-800/60">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Нет денег у игрока (RU)</label>
                        <input
                          type="text"
                          value={getResponseLang("no_money", "ru")}
                          onChange={(e) => handleResponseChange("no_money", "ru", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Не хватает денег, друг, я не работаю в долг."
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Not Enough Money (EN)</label>
                        <input
                          type="text"
                          value={getResponseLang("no_money", "en")}
                          onChange={(e) => handleResponseChange("no_money", "en", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Not enough money, friend, I don't work on credit."
                        />
                      </div>
                    </div>

                    {/* No space */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-950/40 p-2 rounded border border-gray-800/60">
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">Нет места в инвентаре (RU)</label>
                        <input
                          type="text"
                          value={getResponseLang("no_space", "ru")}
                          onChange={(e) => handleResponseChange("no_space", "ru", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="У тебя нет места, разгрузись сначала."
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 font-bold mb-1">No Space left (EN)</label>
                        <input
                          type="text"
                          value={getResponseLang("no_space", "en")}
                          onChange={(e) => handleResponseChange("no_space", "en", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="You have no space, unload first."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Trade Items Table */}
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                      <span className="text-[11px] text-gray-400 font-bold">Товары на продажу</span>
                      <button
                        onClick={addTradeItem}
                        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold rounded flex items-center gap-1 uppercase transition-colors"
                        type="button"
                      >
                        <PlusCircle size={12} /> Добавить товар
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {activeNpc.tradeItems && activeNpc.tradeItems.length > 0 ? (
                        activeNpc.tradeItems.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gray-950/60 border border-gray-800 p-2 rounded-lg"
                          >
                            {/* Item selector */}
                            <div className="flex-1 flex flex-col">
                              <label className="text-[9px] text-gray-500 mb-0.5 font-bold">Товар</label>
                              <CustomSelect
                                value={item.id || ""}
                                onChange={(e) => updateTradeItem(idx, "id", e.target.value)}
                                className="text-xs py-1"
                              >
                                {Object.keys(itemsData).map(itemId => {
                                  const itemObj = (itemsData as any)[itemId];
                                  const itemLabel = itemObj?.name?.split("/")[0] || itemId;
                                  const previewUrl = getEntityPreviewUrl('item', itemId);
                                  return (
                                    <option key={itemId} value={itemId}>
                                      <span className="inline-flex items-center gap-2">
                                        {previewUrl ? (
                                          <img
                                            src={previewUrl}
                                            className="w-5 h-5 object-contain shrink-0 rounded bg-black/60 p-0.5 border border-gray-700"
                                            style={{ imageRendering: 'pixelated' }}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <span className="w-5 h-5 bg-gray-900 rounded shrink-0 border border-gray-700" />
                                        )}
                                        <span>{itemLabel} ({itemId})</span>
                                      </span>
                                    </option>
                                  );
                                })}
                              </CustomSelect>
                            </div>

                            {/* Price */}
                            <div className="w-full sm:w-24 flex flex-col">
                              <label className="text-[9px] text-gray-500 mb-0.5 font-bold">Цена</label>
                              <input
                                type="text"
                                value={item.price ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    updateTradeItem(idx, "price", "");
                                  } else {
                                    const num = parseInt(raw, 10);
                                    updateTradeItem(idx, "price", isNaN(num) ? "" : num);
                                  }
                                }}
                                className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                                placeholder="10"
                              />
                            </div>

                            {/* Count (Optional / Infinity) */}
                            <div className="w-full sm:w-24 flex flex-col">
                              <label className="text-[9px] text-gray-500 mb-0.5 font-bold" title="0 или пусто = бесконечно">Кол-во (0 = ∞)</label>
                              <input
                                type="text"
                                value={item.count ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    updateTradeItem(idx, "count", 0);
                                  } else {
                                    const num = parseInt(raw, 10);
                                    updateTradeItem(idx, "count", isNaN(num) ? 0 : num);
                                  }
                                }}
                                className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                                placeholder="∞"
                              />
                            </div>

                            {/* Remove item button */}
                            <button
                              onClick={() => removeTradeItem(idx)}
                              className="p-1.5 self-end sm:self-center hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded transition-colors border border-transparent hover:border-red-500/30"
                              title="Удалить товар"
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-xs text-gray-500 italic bg-gray-950/20 border border-gray-850 border-dashed rounded-lg">
                          В магазине у этого NPC пока нет товаров. Нажмите "Добавить товар" выше.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 italic text-xs flex flex-col items-center gap-2">
            <HelpCircle size={32} className="opacity-40" />
            Выберите NPC из списка слева или создайте нового, чтобы редактировать его характеристики.
          </div>
        )}
      </div>
    </div>
  );
};
