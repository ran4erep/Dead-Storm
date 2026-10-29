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
  Skull,
  Shield,
  Sparkles,
  Award,
  HelpCircle
} from "lucide-react";
import { ASSETS } from "../../assets";
import soundsData from "../../data/sounds.json";
import itemsData from "../../data/items.json";
import animationsData from "../../data/animations.json";
import { CustomSelect } from "./CustomSelect";
import { AssetPicker } from "./AssetPicker";
import { getEntityPreviewUrl } from "./levelBuilderUtils";

interface EnemyConstructorProps {
  data: Record<string, any>;
  onChange: (newData: Record<string, any>) => void;
  uiStrings: any;
}

export const EnemyConstructor: React.FC<EnemyConstructorProps> = ({
  data,
  onChange,
  uiStrings
}) => {
  const [selectedId, setSelectedId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [newEnemyId, setNewEnemyId] = useState<string>("");
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

  // Memoized enemy IDs
  const enemyIds = useMemo(() => Object.keys(data), [data]);

  // Set initial selected enemy if none selected or if selected ID is invalid
  useEffect(() => {
    if ((!selectedId || !enemyIds.includes(selectedId)) && enemyIds.length > 0) {
      setSelectedId(enemyIds[0]);
    }
  }, [enemyIds, selectedId]);

  // Filtered enemy list
  const filteredEnemyIds = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return enemyIds;
    return enemyIds.filter(id => {
      const enemy = data[id];
      const name = (enemy?.name || "").toLowerCase();
      const desc = (enemy?.description || "").toLowerCase();
      return id.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [enemyIds, searchTerm, data]);

  const activeEnemy = useMemo(() => {
    return data[selectedId] || null;
  }, [data, selectedId]);

  // Helpers to split and join localization slashes
  const [nameRu, nameEn] = useMemo(() => {
    if (!activeEnemy) return ["", ""];
    const parts = (activeEnemy.name || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeEnemy?.name]);

  const [descRu, descEn] = useMemo(() => {
    if (!activeEnemy) return ["", ""];
    const parts = (activeEnemy.description || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeEnemy?.description]);

  // Update helper
  const updateField = (path: string, value: any) => {
    if (!selectedId || !activeEnemy) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetEnemy = newData[selectedId];

    const parts = path.split(".");
    let current = targetEnemy;
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
    if (!selectedId || !activeEnemy) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetEnemy = newData[selectedId];

    const parts = path.split(".");
    let current = targetEnemy;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) return;
      current = current[parts[i]];
    }
    delete current[parts[parts.length - 1]];

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

  const handleCreateEnemy = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newEnemyId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanId) {
      setCreateError("ID не может быть пустым");
      return;
    }
    if (data[cleanId]) {
      setCreateError("Враг с таким ID уже существует");
      return;
    }

    // Создаём абсолютно ЧИСТЫЙ шаблон по требованию пользователя
    const cleanEnemy = {
      name: "/",
      hp: "",
      maxHp: "",
      damageDice: "",
      accuracy: "",
      attackRange: "",
      speed: "",
      assets: {
        map: { assetId: "", scale: "" },
        portrait: { assetId: "", scale: "" },
        attack: { assetId: "", scale: "" },
        dead: { assetId: "", scale: "" },
        gibMask: ""
      },
      sounds: {
        attack: "",
        damage: "",
        death: ""
      },
      description: "/",
      baseXP: "",
      movementType: "sleeping"
    };

    const newData = {
      ...data,
      [cleanId]: cleanEnemy
    };

    onChange(newData);
    setSelectedId(cleanId);
    setNewEnemyId("");
    setShowCreateForm(false);
    setCreateError("");
  };

  const handleDuplicateEnemy = (id: string, e: React.MouseEvent) => {
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

  const handleDeleteEnemy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить врага "${id}"?`)) {
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

  // Loot Drop functions
  const addLootEntry = () => {
    if (!activeEnemy) return;
    const currentLoot = activeEnemy.loot ? [...activeEnemy.loot] : [];
    currentLoot.push({ id: Object.keys(itemsData)[0] || "", chanceToDrop: "", min: "", max: "" });
    updateField("loot", currentLoot);
  };

  const updateLootEntry = (idx: number, field: string, value: any) => {
    if (!activeEnemy || !activeEnemy.loot) return;
    const currentLoot = [...activeEnemy.loot];
    currentLoot[idx] = { ...currentLoot[idx], [field]: value };
    updateField("loot", currentLoot);
  };

  const removeLootEntry = (idx: number) => {
    if (!activeEnemy || !activeEnemy.loot) return;
    const currentLoot = activeEnemy.loot.filter((_: any, i: number) => i !== idx);
    if (currentLoot.length === 0) {
      removeField("loot");
    } else {
      updateField("loot", currentLoot);
    }
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

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 text-gray-200 max-w-full overflow-x-hidden">
      {/* Asset Picker Modal overlay to prevent conflicts */}
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

      {/* Sidebar - Enemies list */}
      <div className="w-full lg:w-72 shrink-0 bg-gray-950 border border-gray-800 rounded-lg flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs tracking-wider uppercase text-gray-400">Список врагов</span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="p-1 hover:bg-gray-800 rounded text-green-400 hover:text-green-300 transition-colors"
            title="Создать врага"
          >
            <Plus size={18} />
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateEnemy} className="bg-gray-900 p-2.5 rounded border border-gray-800 flex flex-col gap-2">
            <span className="text-[10px] text-indigo-400 font-bold">Уникальный ID (без пробелов):</span>
            <input
              type="text"
              placeholder="zombie_crawler"
              value={newEnemyId}
              onChange={(e) => {
                setNewEnemyId(e.target.value);
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
                  setNewEnemyId("");
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
            placeholder="Поиск врага..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-850 rounded pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
        </div>

        <div className="flex-1 overflow-y-auto max-h-[180px] lg:max-h-[60vh] flex flex-col gap-1 pr-1 custom-scrollbar">
          {filteredEnemyIds.map(id => {
            const enemy = data[id];
            const isSelected = selectedId === id;
            const labelName = enemy?.name?.split("/")[0] || id;

            return (
              <div
                key={id}
                onClick={() => setSelectedId(id)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-all border ${
                  isSelected
                    ? "bg-indigo-600/20 border-indigo-500/50 text-white font-bold"
                    : "bg-gray-900/40 border-transparent text-gray-400 hover:bg-gray-900/80 hover:text-gray-200"
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold truncate">{labelName}</span>
                  <span className="text-[10px] opacity-60 font-mono truncate">{id}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={(e) => handleDuplicateEnemy(id, e)}
                    className="p-1 hover:bg-gray-850 rounded text-blue-400 hover:text-blue-300 transition-colors"
                    title="Дублировать"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteEnemy(id, e)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredEnemyIds.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-500 italic">Ничего не найдено</div>
          )}
        </div>
      </div>

      {/* Main Constructor Form */}
      <div className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 lg:p-4 overflow-y-auto max-h-[75vh] lg:max-h-[75vh] custom-scrollbar w-full min-w-0">
        {activeEnemy ? (
          <div className="flex flex-col gap-5">
            {/* Header section with ID and Names */}
            <div className="border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-indigo-950 text-indigo-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-indigo-800/40 uppercase">ВРАГ</span>
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
                    placeholder="Например, Заражённый техник"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 font-bold mb-1">Name (EN)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => handleNameChange("en", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    placeholder="E.g. Infected technician"
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
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Activity size={14} /> Основные Характеристики
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Здоровье (HP)</label>
                  <input
                    type="text"
                    value={activeEnemy.hp ?? ""}
                    onChange={(e) => handleNumInput("hp", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Макс. Здоровье</label>
                  <input
                    type="text"
                    value={activeEnemy.maxHp ?? ""}
                    onChange={(e) => handleNumInput("maxHp", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1" title="Например, 1d4, 2d6">Кубик Урона (Dice)</label>
                  <input
                    type="text"
                    value={activeEnemy.damageDice ?? ""}
                    onChange={(e) => updateField("damageDice", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center font-mono text-white"
                    placeholder="1d4"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Точность (Accuracy)</label>
                  <input
                    type="text"
                    value={activeEnemy.accuracy ?? ""}
                    onChange={(e) => handleNumInput("accuracy", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Дальность Атаки</label>
                  <input
                    type="text"
                    value={activeEnemy.attackRange ?? ""}
                    onChange={(e) => handleNumInput("attackRange", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Скорость (Speed)</label>
                  <input
                    type="text"
                    value={activeEnemy.speed ?? ""}
                    onChange={(e) => handleNumInput("speed", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Опыт (Base XP)</label>
                  <input
                    type="text"
                    value={activeEnemy.baseXP ?? ""}
                    onChange={(e) => handleNumInput("baseXP", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Броня (Armor)</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="checkbox"
                      checked={activeEnemy.armor !== undefined}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateField("armor", 5);
                        } else {
                          removeField("armor");
                        }
                      }}
                      className="accent-indigo-600 rounded bg-gray-900 h-4 w-4"
                    />
                    <input
                      type="text"
                      disabled={activeEnemy.armor === undefined}
                      value={activeEnemy.armor ?? ""}
                      onChange={(e) => handleNumInput("armor", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-xs text-center flex-1 disabled:opacity-45 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Behavior & Movement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Тип Перемещения</label>
                  <CustomSelect
                    value={activeEnemy.movementType || "sleeping"}
                    onChange={(e) => {
                      updateField("movementType", e.target.value);
                      if (e.target.value !== "patroling") {
                        removeField("patrolRange");
                      } else if (activeEnemy.patrolRange === undefined) {
                        updateField("patrolRange", 4);
                      }
                    }}
                    className="w-full text-xs"
                  >
                    <option value="sleeping">Спит / Стоит (sleeping)</option>
                    <option value="roaming">Блуждает (roaming)</option>
                    <option value="patroling">Патрулирует (patroling)</option>
                  </CustomSelect>
                </div>

                {activeEnemy.movementType === "patroling" && (
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Радиус Патрулирования</label>
                    <input
                      type="text"
                      value={activeEnemy.patrolRange ?? ""}
                      onChange={(e) => handleNumInput("patrolRange", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                )}

                <div className="flex flex-col justify-center">
                  <label className="text-[11px] text-gray-400 mb-1">Можно Осматривать</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={activeEnemy.canBeInspected !== false}
                      onChange={(e) => updateField("canBeInspected", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400">Позволяет прочитать описание</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="text-[11px] text-gray-400 mb-1">Умеет открывать двери</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={activeEnemy.canOpenDoors === true}
                      onChange={(e) => updateField("canOpenDoors", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400">Позволяет открывать двери</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="text-[11px] text-gray-400 mb-1">Без тени (noShadow)</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={activeEnemy.noShadow === true}
                      onChange={(e) => updateField("noShadow", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400">Не отбрасывать тень под объектом</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Graphical Assets */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
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
                      {getAssetPreviewUrl(activeEnemy.assets?.map?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeEnemy.assets?.map?.assetId)}
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
                        {activeEnemy.assets?.map?.assetId || "Не задан"}
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
                      value={activeEnemy.assets?.map?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.map.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Portrait */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Портрет в бою
                    <span className="text-[9px] text-gray-500 font-mono">assets.portrait</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeEnemy.assets?.portrait?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeEnemy.assets?.portrait?.assetId)}
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
                        {activeEnemy.assets?.portrait?.assetId || "Не задан"}
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
                      value={activeEnemy.assets?.portrait?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.portrait.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Attack portrait */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Спрайт атаки
                    <span className="text-[9px] text-gray-500 font-mono">assets.attack</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeEnemy.assets?.attack?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeEnemy.assets?.attack?.assetId)}
                          alt="attack"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeEnemy.assets?.attack?.assetId || "Не задан"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.attack.assetId")}
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
                      value={activeEnemy.assets?.attack?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.attack.scale", e.target.value, true)}
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
                      {getAssetPreviewUrl(activeEnemy.assets?.dead?.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeEnemy.assets?.dead?.assetId)}
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
                        {activeEnemy.assets?.dead?.assetId || "Не задан"}
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
                      value={activeEnemy.assets?.dead?.scale ?? ""}
                      onChange={(e) => handleNumInput("assets.dead.scale", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                    />
                  </div>
                </div>

                {/* Gib Mask - Now properly uses AssetPicker as requested */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Маска останков
                    <span className="text-[9px] text-gray-500 font-mono">assets.gibMask</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeEnemy.assets?.gibMask) ? (
                        <img
                          src={getAssetPreviewUrl(activeEnemy.assets?.gibMask)}
                          alt="gibmask"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                        {activeEnemy.assets?.gibMask || "Не задана"}
                      </span>
                      <button
                        onClick={() => setPickingField("assets.gibMask")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded w-full uppercase"
                        type="button"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-1 pt-1.5 border-t border-gray-800/50">
                    <button
                      onClick={() => removeField("assets.gibMask")}
                      className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold"
                      type="button"
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {/* Distance Attack (Optional) */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1 flex items-center justify-between">
                    Дистанционная атака
                    <span className="text-[9px] text-gray-500 font-mono">assets.distanceAttack</span>
                  </span>
                  <div className="flex items-center gap-1.5 mb-1">
                    <input
                      type="checkbox"
                      checked={activeEnemy.assets?.distanceAttack !== undefined}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateField("assets.distanceAttack", { assetId: "", scale: "" });
                        } else {
                          removeField("assets.distanceAttack");
                        }
                      }}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400">Использовать дальнобойный спрайт</span>
                  </div>
                  {activeEnemy.assets?.distanceAttack !== undefined && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                          {getAssetPreviewUrl(activeEnemy.assets?.distanceAttack?.assetId) ? (
                            <img
                              src={getAssetPreviewUrl(activeEnemy.assets?.distanceAttack?.assetId)}
                              alt="dist-attack"
                              className="max-w-full max-h-full object-contain pixelated"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-[9px] text-gray-600">Пусто</span>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                            {activeEnemy.assets?.distanceAttack?.assetId || "Не задан"}
                          </span>
                          <button
                            onClick={() => setPickingField("assets.distanceAttack.assetId")}
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
                          value={activeEnemy.assets?.distanceAttack?.scale ?? ""}
                          onChange={(e) => handleNumInput("assets.distanceAttack.scale", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center w-14"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Extra visual properties (Muzzleflash & Casings) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeEnemy.muzzleFlash === true}
                    onChange={(e) => updateField("muzzleFlash", e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 font-bold">Вспышка выстрела (muzzleFlash)</span>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={activeEnemy.casing !== undefined}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateField("casing", { assetId: "CASING_9MM", direction: "left", scale: 1.0, groundScaleMultiplier: 0.08 });
                        } else {
                          removeField("casing");
                        }
                      }}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <span className="text-xs text-gray-400 font-bold">Выброс гильз (casing)</span>
                  </div>
                  {activeEnemy.casing !== undefined && (
                    <div className="grid grid-cols-2 gap-2 mt-1 bg-gray-950/40 p-2 rounded border border-gray-800">
                      <div className="flex flex-col">
                        <label className="text-[9px] text-gray-500">Ассет гильзы</label>
                        <button
                          onClick={() => setPickingField("casing.assetId")}
                          className="bg-indigo-600/30 border border-indigo-700/50 text-indigo-300 text-[10px] font-bold px-2 py-1 rounded truncate uppercase text-center"
                          type="button"
                        >
                          {activeEnemy.casing?.assetId || "Выбрать"}
                        </button>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] text-gray-500">Направление</label>
                        <CustomSelect
                          value={activeEnemy.casing?.direction || "left"}
                          onChange={(e) => updateField("casing.direction", e.target.value)}
                          className="text-[10px] py-0.5"
                        >
                          <option value="left">Влево (left)</option>
                          <option value="right">Вправо (right)</option>
                        </CustomSelect>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] text-gray-500">Размер гильзы</label>
                        <input
                          type="text"
                          value={activeEnemy.casing?.scale ?? ""}
                          onChange={(e) => handleNumInput("casing.scale", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[10px] text-center"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] text-gray-500">Множ. на земле</label>
                        <input
                          type="text"
                          value={activeEnemy.casing?.groundScaleMultiplier ?? ""}
                          onChange={(e) => handleNumInput("casing.groundScaleMultiplier", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[10px] text-center"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Gib Counts */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Skull size={14} /> Количество кусков при взрыве (gibCounts)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                <div className="flex flex-col">
                  <label className="text-[10px] text-gray-500 mb-1 font-bold">Голова (head)</label>
                  <input
                    type="text"
                    value={activeEnemy.gibCounts?.head ?? ""}
                    onChange={(e) => handleNumInput("gibCounts.head", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-gray-500 mb-1 font-bold">Торс (body)</label>
                  <input
                    type="text"
                    value={activeEnemy.gibCounts?.body ?? ""}
                    onChange={(e) => handleNumInput("gibCounts.body", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-gray-500 mb-1 font-bold">Руки (arms)</label>
                  <input
                    type="text"
                    value={activeEnemy.gibCounts?.arms ?? ""}
                    onChange={(e) => handleNumInput("gibCounts.arms", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-gray-500 mb-1 font-bold">Ноги (legs)</label>
                  <input
                    type="text"
                    value={activeEnemy.gibCounts?.legs ?? ""}
                    onChange={(e) => handleNumInput("gibCounts.legs", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white font-mono"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Section: Audio & Sound Effects */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Volume2 size={14} /> Аудиоэффекты и Озвучка
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Required and standard sounds */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2.5">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1">Основные звуки</span>
                  
                  {/* Attack sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Звук атаки:</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.attack || ""}
                        onChange={(e) => updateField("sounds.attack", e.target.value)}
                        className="flex-1 text-xs"
                      >
                        <option value="">-- Выберите звук --</option>
                        {soundOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </CustomSelect>
                      <button
                        onClick={() => playSound(activeEnemy.sounds?.attack)}
                        disabled={!activeEnemy.sounds?.attack}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Damage sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Получение урона:</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.damage || ""}
                        onChange={(e) => updateField("sounds.damage", e.target.value)}
                        className="flex-1 text-xs"
                      >
                        <option value="">-- Выберите звук --</option>
                        {soundOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </CustomSelect>
                      <button
                        onClick={() => playSound(activeEnemy.sounds?.damage)}
                        disabled={!activeEnemy.sounds?.damage}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Death sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Смерть:</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.death || ""}
                        onChange={(e) => updateField("sounds.death", e.target.value)}
                        className="flex-1 text-xs"
                      >
                        <option value="">-- Выберите звук --</option>
                        {soundOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </CustomSelect>
                      <button
                        onClick={() => playSound(activeEnemy.sounds?.death)}
                        disabled={!activeEnemy.sounds?.death}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Optional / environmental sounds */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2.5">
                  <span className="text-[11px] text-gray-400 font-bold border-b border-gray-800 pb-1">Дополнительные звуки</span>

                  {/* Roam sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Звук блуждания (roam):</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.roam || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("sounds.roam", e.target.value);
                            if (!activeEnemy.sounds?.roamPeriodicity) {
                              updateField("sounds.roamPeriodicity", "15000-60000");
                            }
                          } else {
                            removeField("sounds.roam");
                            removeField("sounds.roamPeriodicity");
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
                        onClick={() => playSound(activeEnemy.sounds?.roam)}
                        disabled={!activeEnemy.sounds?.roam}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Roam Periodicity */}
                  {activeEnemy.sounds?.roam !== undefined && (
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Периодичность звука (roamPeriodicity):</label>
                      <input
                        type="text"
                        value={activeEnemy.sounds?.roamPeriodicity ?? ""}
                        onChange={(e) => updateField("sounds.roamPeriodicity", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                        placeholder="15000-60000"
                      />
                    </div>
                  )}

                  {/* Armor Hit sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Попадание по броне:</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.armorHit || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("sounds.armorHit", e.target.value);
                          } else {
                            removeField("sounds.armorHit");
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
                        onClick={() => playSound(activeEnemy.sounds?.armorHit)}
                        disabled={!activeEnemy.sounds?.armorHit}
                        className="px-2 bg-gray-850 border border-gray-800 hover:bg-gray-800 text-indigo-400 rounded disabled:opacity-40"
                        title="Прослушать"
                        type="button"
                      >
                        <Play size={12} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Casing fall sound */}
                  <div className="flex flex-col">
                    <label className="text-[10px] text-gray-500 mb-1 font-bold">Звук падения гильзы (casing):</label>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={activeEnemy.sounds?.casing || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("sounds.casing", e.target.value);
                          } else {
                            removeField("sounds.casing");
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
                        onClick={() => playSound(activeEnemy.sounds?.casing)}
                        disabled={!activeEnemy.sounds?.casing}
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

            {/* Section: Hit Effects (onHitEffect) */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Sparkles size={14} /> Эффект при ударе игрока (onHitEffect)
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={activeEnemy.onHitEffect !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateField("onHitEffect", { id: "bleeding", chance: "" });
                      } else {
                        removeField("onHitEffect");
                      }
                    }}
                    className="accent-indigo-600 rounded bg-gray-900 h-4 w-4 cursor-pointer"
                  />
                  <span className="text-xs text-gray-300 font-bold">Наносить негативный статус-эффект при атаке</span>
                </div>

                {activeEnemy.onHitEffect !== undefined && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-950/40 p-2.5 rounded border border-gray-800 mt-1">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">ID Статуса / Эффекта:</label>
                      <CustomSelect
                        value={activeEnemy.onHitEffect?.id || "bleeding"}
                        onChange={(e) => updateField("onHitEffect.id", e.target.value)}
                        className="text-xs"
                      >
                        <option value="bleeding">Кровотечение (bleeding)</option>
                        <option value="poison">Яд / Инфекция (poison)</option>
                        <option value="stun">Оглушение (stun)</option>
                        <option value="burn">Горение (burn)</option>
                      </CustomSelect>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1 font-bold">Шанс наложения % (chance):</label>
                      <input
                        type="text"
                        value={activeEnemy.onHitEffect?.chance ?? ""}
                        onChange={(e) => handleNumInput("onHitEffect.chance", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="30"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Loot drop table (Таблица добычи) */}
            <div>
              <div className="flex items-center justify-between border-b border-gray-850 pb-1.5 mb-2.5">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Award size={14} /> Выпадающая Добыча (Loot)
                </h3>
                <button
                  onClick={addLootEntry}
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded flex items-center gap-1 uppercase transition-colors"
                  type="button"
                >
                  <PlusCircle size={12} /> Добавить предмет
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {activeEnemy.loot && activeEnemy.loot.length > 0 ? (
                  activeEnemy.loot.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg"
                    >
                      {/* Item ID selector */}
                      <div className="flex-1 flex flex-col">
                        <label className="text-[9px] text-gray-500 mb-1 font-bold">Выбор предмета</label>
                        <CustomSelect
                          value={item.id || ""}
                          onChange={(e) => updateLootEntry(idx, "id", e.target.value)}
                          className="text-xs py-1"
                        >
                          {Object.keys(itemsData).map(itemId => {
                            const itemDataObj = (itemsData as any)[itemId];
                            const itemLabel = itemDataObj?.name?.split("/")[0] || itemId;
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

                      {/* Drop chance % */}
                      <div className="w-full sm:w-24 flex flex-col">
                        <label className="text-[9px] text-gray-500 mb-1 font-bold">Шанс %</label>
                        <input
                          type="text"
                          value={item.chanceToDrop ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateLootEntry(idx, "chanceToDrop", "");
                            } else {
                              const num = parseInt(raw, 10);
                              updateLootEntry(idx, "chanceToDrop", isNaN(num) ? "" : num);
                            }
                          }}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                          placeholder="50"
                        />
                      </div>

                      {/* Min count */}
                      <div className="w-full sm:w-20 flex flex-col">
                        <label className="text-[9px] text-gray-500 mb-1 font-bold">Мин</label>
                        <input
                          type="text"
                          value={item.min ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateLootEntry(idx, "min", "");
                            } else {
                              const num = parseInt(raw, 10);
                              updateLootEntry(idx, "min", isNaN(num) ? "" : num);
                            }
                          }}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                          placeholder="1"
                        />
                      </div>

                      {/* Max count */}
                      <div className="w-full sm:w-20 flex flex-col">
                        <label className="text-[9px] text-gray-500 mb-1 font-bold">Макс</label>
                        <input
                          type="text"
                          value={item.max ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateLootEntry(idx, "max", "");
                            } else {
                              const num = parseInt(raw, 10);
                              updateLootEntry(idx, "max", isNaN(num) ? "" : num);
                            }
                          }}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                          placeholder="1"
                        />
                      </div>

                      {/* Remove item button */}
                      <button
                        onClick={() => removeLootEntry(idx)}
                        className="p-2 self-end sm:self-center hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded transition-colors border border-transparent hover:border-red-500/30"
                        title="Удалить предмет из добычи"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-gray-500 italic bg-gray-900/20 border border-gray-850 border-dashed rounded-lg">
                    У этого врага нет выпадающих предметов при смерти. Нажмите "Добавить предмет" выше.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 italic text-xs flex flex-col items-center gap-2">
            <HelpCircle size={32} className="opacity-40" />
            Выберите врага из списка слева или создайте нового, чтобы редактировать его характеристики.
          </div>
        )}
      </div>
    </div>
  );
};
