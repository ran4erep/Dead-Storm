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
  Shield,
  Sparkles,
  Award,
  HelpCircle,
  Backpack,
  Coins,
  Flame,
  Heart,
  FileText,
  Compass,
  MapPin,
  Eye,
  Box,
  Hammer
} from "lucide-react";
import { ASSETS } from "../../assets";
import soundsData from "../../data/sounds.json";
import itemsData from "../../data/items.json";
import animationsData from "../../data/animations.json";
import { CustomSelect } from "./CustomSelect";
import { AssetPicker } from "./AssetPicker";
import { CustomColorPicker } from "./CustomColorPicker";
import { HandOffsetVisualEditor } from "./HandOffsetVisualEditor";
import { AttackAnimationVisualEditor } from "./AttackAnimationVisualEditor";

const rgbToHex = (r: any, g: any, b: any): string => {
  const clamp = (val: any) => Math.max(0, Math.min(255, Math.round(Number(val) || 0)));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}`;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

interface ItemConstructorProps {
  data: Record<string, any>;
  onChange: (newData: Record<string, any>) => void;
  uiStrings: any;
}

export const ItemConstructor: React.FC<ItemConstructorProps> = ({
  data,
  onChange,
  uiStrings
}) => {
  const isRu = useMemo(() => {
    return uiStrings?.player_settings === "Игрок" || uiStrings?.done === "ГОТОВО" || uiStrings?.ui?.settings?.language === "ЯЗЫК";
  }, [uiStrings]);

  const [selectedId, setSelectedId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [newItemId, setNewItemId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>("");

  // Asset picker state
  const [pickingField, setPickingField] = useState<string | null>(null);

  // Visual editors state
  const [showHandOffsetEditor, setShowHandOffsetEditor] = useState<boolean>(false);
  const [showAttackAnimEditor, setShowAttackAnimEditor] = useState<boolean>(false);

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

  // Memoized item IDs
  const itemIds = useMemo(() => Object.keys(data), [data]);

  // Set initial selected item if none selected or if selected ID is invalid
  useEffect(() => {
    if ((!selectedId || !itemIds.includes(selectedId)) && itemIds.length > 0) {
      setSelectedId(itemIds[0]);
    }
  }, [itemIds, selectedId]);

  // Filtered item list
  const filteredItemIds = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return itemIds;
    return itemIds.filter(id => {
      const item = data[id];
      const name = (item?.name || "").toLowerCase();
      const desc = (item?.description || "").toLowerCase();
      return id.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [itemIds, searchTerm, data]);

  const activeItem = useMemo(() => {
    return data[selectedId] || null;
  }, [data, selectedId]);

  // Helpers to split and join localization slashes
  const [nameRu, nameEn] = useMemo(() => {
    if (!activeItem) return ["", ""];
    const parts = (activeItem.name || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeItem?.name]);

  const [descRu, descEn] = useMemo(() => {
    if (!activeItem) return ["", ""];
    const parts = (activeItem.description || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeItem?.description]);

  // Update helper
  const updateField = (path: string, value: any) => {
    if (!selectedId || !activeItem) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetItem = newData[selectedId];

    const parts = path.split(".");
    let current = targetItem;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    onChange(newData);
  };

  // Helper to update multiple fields atomically
  const updateFields = (fieldsMap: Record<string, any>) => {
    if (!selectedId || !activeItem) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetItem = newData[selectedId];

    for (const [path, value] of Object.entries(fieldsMap)) {
      const parts = path.split(".");
      let current = targetItem;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    }

    onChange(newData);
  };

  // Helper to remove field
  const removeField = (path: string) => {
    if (!selectedId || !activeItem) return;

    const newData = JSON.parse(JSON.stringify(data));
    const targetItem = newData[selectedId];

    const parts = path.split(".");
    let current = targetItem;
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

  const handleSaveHandOffset = (offset: { x: number, y: number }) => {
    updateField("handOffset", offset);
  };

  const getVibrationPatternString = (val: any) => {
    if (Array.isArray(val)) return val.join(", ");
    if (val === undefined || val === null) return "";
    return String(val);
  };

  const handleVibrationPatternChange = (val: string) => {
    if (val.trim() === "") {
      removeField("vibrationPattern");
      return;
    }
    if (val.includes(",")) {
      const parts = val.split(",").map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
      updateField("vibrationPattern", parts);
    } else {
      const num = parseInt(val.trim(), 10);
      updateField("vibrationPattern", isNaN(num) ? val : num);
    }
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newItemId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanId) {
      setCreateError("ID не может быть пустым");
      return;
    }
    if (data[cleanId]) {
      setCreateError("Предмет с таким ID уже существует");
      return;
    }

    const cleanItem = {
      name: "/",
      description: "/",
      type: "MATERIAL",
      equip: "NONE",
      assetId: "MISC",
      scale: 0.15,
      price: 10
    };

    const newData = {
      ...data,
      [cleanId]: cleanItem
    };

    onChange(newData);
    setSelectedId(cleanId);
    setNewItemId("");
    setShowCreateForm(false);
    setCreateError("");
  };

  const handleDuplicateItem = (id: string, e: React.MouseEvent) => {
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

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить предмет "${id}"?`)) {
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
  const allItemIds = useMemo(() => Object.keys(data), [data]);

  const ammoOptions = useMemo(() => {
    const uniqueTypes = new Map<string, { itemId: string; label: string }>();

    const processItem = (id: string, item: any) => {
      if (item?.type === "AMMO" && item.ammoType) {
        const ammoType = item.ammoType;
        const namePart = item.name?.split("/")[0] || id;
        if (!uniqueTypes.has(ammoType)) {
          uniqueTypes.set(ammoType, { itemId: id, label: `${namePart} (${ammoType})` });
        }
      }
    };

    if (itemsData && typeof itemsData === "object") {
      Object.entries(itemsData).forEach(([key, item]: [string, any]) => {
        processItem(key, item);
      });
    }
    if (data && typeof data === "object") {
      Object.entries(data).forEach(([key, item]: [string, any]) => {
        processItem(key, item);
      });
    }

    return Array.from(uniqueTypes.entries()).map(([ammoType, info]) => ({
      ammoType,
      ...info
    })).sort((a, b) => a.ammoType.localeCompare(b.ammoType));
  }, [data]);

  // Loot Container functions
  const addLootEntry = () => {
    if (!activeItem) return;
    const currentLoot = activeItem.loot ? [...activeItem.loot] : [];
    currentLoot.push({ id: Object.keys(data)[0] || "", count: 1 });
    updateField("loot", currentLoot);
  };

  const updateLootEntry = (idx: number, field: string, value: any) => {
    if (!activeItem || !activeItem.loot) return;
    const currentLoot = [...activeItem.loot];
    currentLoot[idx] = { ...currentLoot[idx], [field]: value };
    updateField("loot", currentLoot);
  };

  const removeLootEntry = (idx: number) => {
    if (!activeItem || !activeItem.loot) return;
    const currentLoot = activeItem.loot.filter((_: any, i: number) => i !== idx);
    if (currentLoot.length === 0) {
      removeField("loot");
    } else {
      updateField("loot", currentLoot);
    }
  };

  // Weapon Animation Frame functions
  const addAnimationFrame = () => {
    if (!activeItem) return;
    const anim = activeItem.attackAnimation ? [...activeItem.attackAnimation] : [];
    anim.push({ duration: 80, x: 0, y: 0, scale: 1.0 });
    updateField("attackAnimation", anim);
  };

  const updateAnimationFrame = (idx: number, field: string, value: any) => {
    if (!activeItem || !activeItem.attackAnimation) return;
    const anim = [...activeItem.attackAnimation];
    anim[idx] = { ...anim[idx], [field]: value };
    updateField("attackAnimation", anim);
  };

  const removeAnimationFrame = (idx: number) => {
    if (!activeItem || !activeItem.attackAnimation) return;
    const anim = activeItem.attackAnimation.filter((_: any, i: number) => i !== idx);
    if (anim.length === 0) {
      removeField("attackAnimation");
    } else {
      updateField("attackAnimation", anim);
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

      {/* Sidebar - Items list */}
      <div className="w-full lg:w-72 shrink-0 bg-gray-950 border border-gray-800 rounded-lg flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs tracking-wider uppercase text-gray-400">Список предметов</span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="p-1 hover:bg-gray-800 rounded text-green-400 hover:text-green-300 transition-colors"
            title="Создать предмет"
          >
            <Plus size={18} />
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateItem} className="bg-gray-900 p-2.5 rounded border border-gray-800 flex flex-col gap-2">
            <span className="text-[10px] text-indigo-400 font-bold">Уникальный ID (без пробелов):</span>
            <input
              type="text"
              placeholder="heavy_boots"
              value={newItemId}
              onChange={(e) => {
                setNewItemId(e.target.value);
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
                  setNewItemId("");
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
            placeholder="Поиск предмета..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-850 rounded pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
        </div>

        <div className="flex-1 overflow-y-auto max-h-[180px] lg:max-h-[60vh] flex flex-col gap-1 pr-1 custom-scrollbar">
          {filteredItemIds.map(id => {
            const item = data[id];
            const isSelected = selectedId === id;
            const labelName = item?.name?.split("/")[0] || id;

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
                    onClick={(e) => handleDuplicateItem(id, e)}
                    className="p-1 hover:bg-gray-850 rounded text-blue-400 hover:text-blue-300 transition-colors"
                    title="Дублировать"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteItem(id, e)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredItemIds.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-500 italic">Ничего не найдено</div>
          )}
        </div>
      </div>

      {/* Main Constructor Form */}
      <div className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 lg:p-4 overflow-y-auto max-h-[75vh] lg:max-h-[75vh] custom-scrollbar w-full min-w-0">
        {activeItem ? (
          <div className="flex flex-col gap-5">
            {/* Header section with ID and Names */}
            <div className="border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-indigo-950 text-indigo-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-indigo-800/40 uppercase">ПРЕДМЕТ</span>
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
                    placeholder="Например, Осколочная граната"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 font-bold mb-1">Name (EN)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => handleNameChange("en", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    placeholder="E.g. Frag grenade"
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
                  placeholder="Описание на русском..."
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

            {/* Basic Item Config */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Backpack size={14} /> Базовые Свойства Предмета
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Тип предмета</label>
                  <CustomSelect
                    value={activeItem.type || "MATERIAL"}
                    onChange={(e) => updateField("type", e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="WEAPON">WEAPON (Оружие)</option>
                    <option value="GRENADE">GRENADE (Граната)</option>
                    <option value="MOLOTOV">MOLOTOV (Коктейль Молотова)</option>
                    <option value="FLASHBANG">FLASHBANG (Светошумовая граната)</option>
                    <option value="FLARE">FLARE (Сигнальный фаер)</option>
                    <option value="CONSUMABLE">CONSUMABLE (Расходник)</option>
                    <option value="NOTE">NOTE (Записка)</option>
                    <option value="MAP">MAP (Карта)</option>
                    <option value="CONSOLE">CONSOLE (Игровая консоль)</option>
                    <option value="RADIO">RADIO (Рация)</option>
                    <option value="KEY">KEY (Ключ доступа)</option>
                    <option value="COMPASS">COMPASS (Компас)</option>
                    <option value="DIGITAL_MAP">DIGITAL_MAP (Эл. карта)</option>
                    <option value="CASH">CASH (Валюта/Деньги)</option>
                    <option value="AMMO">AMMO (Боеприпасы)</option>
                    <option value="FLASHLIGHT">FLASHLIGHT (Фонарик)</option>
                    <option value="BATTERY">BATTERY (Батарейка)</option>
                    <option value="C4">C4 (Взрывчатка C4)</option>
                    <option value="ARMOR">ARMOR (Броня/Одежда)</option>
                    <option value="MATERIAL">MATERIAL (Ресурс/Материал)</option>
                    <option value="CONTAINER">CONTAINER (Контейнер/Ящик)</option>
                    <option value="CARTRIDGE">CARTRIDGE (Игровой картридж)</option>
                  </CustomSelect>
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Слот экипировки (equip)</label>
                  <CustomSelect
                    value={activeItem.equip || "NONE"}
                    onChange={(e) => updateField("equip", e.target.value)}
                    className="w-full text-xs"
                  >
                    <option value="NONE">NONE (Не экипируется)</option>
                    <option value="WEAPON">WEAPON (В руки как оружие)</option>
                    <option value="HEAD">HEAD (Голова/Шлем)</option>
                    <option value="BODY">BODY (Бронежилет/Торс)</option>
                    <option value="LEGS">LEGS (Штаны)</option>
                    <option value="FEET">FEET (Ботинки)</option>
                    <option value="ACCESSORY">ACCESSORY (Аксессуар)</option>
                  </CustomSelect>
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Стоимость (Цена в торговце)</label>
                  <input
                    type="text"
                    value={activeItem.price ?? ""}
                    onChange={(e) => handleNumInput("price", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Вес (слотов в инвентаре)</label>
                  <input
                    type="text"
                    value={activeItem.weight ?? ""}
                    onChange={(e) => handleNumInput("weight", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white font-mono"
                    placeholder="1"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Масштаб на земле</label>
                  <input
                    type="text"
                    value={activeItem.scale ?? ""}
                    onChange={(e) => handleNumInput("scale", e.target.value, true)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white font-mono"
                    placeholder="0.15"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Смещение Y (yOffset)</label>
                  <input
                    type="text"
                    value={activeItem.yOffset ?? ""}
                    onChange={(e) => handleNumInput("yOffset", e.target.value, true)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white font-mono"
                    placeholder="0.0"
                  />
                </div>
              </div>

              {/* Universal Properties */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 bg-gray-900/20 p-2.5 rounded-lg border border-gray-850">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Макс. стак в рюкзаке (maxStack)</label>
                  <input
                    type="text"
                    value={activeItem.maxStack ?? ""}
                    onChange={(e) => handleNumInput("maxStack", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white font-mono"
                    placeholder="1"
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-4 sm:mt-0 justify-center">
                  <input
                    type="checkbox"
                    checked={activeItem.cannotDrop === true}
                    onChange={(e) => updateField("cannotDrop", e.target.checked)}
                    className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-400 font-bold">Нельзя выкинуть (cannotDrop)</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 sm:mt-0 justify-center">
                  <input
                    type="checkbox"
                    checked={activeItem.blocking === true}
                    onChange={(e) => updateField("blocking", e.target.checked)}
                    className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-400 font-bold">Блокирует проход (blocking)</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 sm:mt-0 justify-center">
                  <input
                    type="checkbox"
                    checked={activeItem.noShadow === true}
                    onChange={(e) => updateField("noShadow", e.target.checked)}
                    className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-400 font-bold">Без тени (noShadow)</span>
                </div>
              </div>
            </div>

            {/* Graphics & On-Ground Sprite */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Image size={14} /> Основной Спрайт Предмета
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex items-center gap-3 w-full max-w-md">
                <div className="w-14 h-14 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {getAssetPreviewUrl(activeItem.assetId) ? (
                    <img
                      src={getAssetPreviewUrl(activeItem.assetId)}
                      alt="asset"
                      className="max-w-full max-h-full object-contain pixelated"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-600">Пусто</span>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <span className="text-xs text-gray-400 mb-0.5">Спрайт предмета (assetId)</span>
                  <span className="text-[10px] font-mono font-bold truncate text-indigo-300">
                    {activeItem.assetId || "Не задан"}
                  </span>
                  <button
                    onClick={() => setPickingField("assetId")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded w-full uppercase mt-1"
                    type="button"
                  >
                    Выбрать Спрайт
                  </button>
                </div>
              </div>
            </div>

            {/* TYPE-SPECIFIC SECTIONS */}

            {/* Section: WEAPON */}
            {activeItem.type === "WEAPON" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Hammer size={14} /> Специфичные Настройки Оружия
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Кубик Урона (damageDice)</label>
                    <input
                      type="text"
                      value={activeItem.damageDice ?? ""}
                      onChange={(e) => updateField("damageDice", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                      placeholder="1d8"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Урон метания (throwDamage)</label>
                    <input
                      type="text"
                      value={activeItem.throwDamage ?? ""}
                      onChange={(e) => updateField("throwDamage", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                      placeholder="1d1"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Точность (accuracy)</label>
                    <input
                      type="text"
                      value={activeItem.accuracy ?? ""}
                      onChange={(e) => handleNumInput("accuracy", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="1.0"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Дальность (range)</label>
                    <input
                      type="text"
                      value={activeItem.range ?? ""}
                      onChange={(e) => handleNumInput("range", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="5"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Патронов в магазине</label>
                    <input
                      type="text"
                      value={activeItem.magazineMax ?? ""}
                      onChange={(e) => handleNumInput("magazineMax", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Текущий запас в магазине</label>
                    <input
                      type="text"
                      value={activeItem.currentAmmo ?? ""}
                      onChange={(e) => handleNumInput("currentAmmo", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Тип патронов (ammoType)</label>
                    <CustomSelect
                      value={activeItem.ammoType || ""}
                      onChange={(e) => updateField("ammoType", e.target.value)}
                      className="w-full text-xs"
                    >
                      <option value="">-- Выберите патроны --</option>
                      {ammoOptions.map(opt => (
                        <option key={opt.ammoType} value={opt.ammoType}>
                          {opt.label}
                        </option>
                      ))}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Макс. Прочность</label>
                    <input
                      type="text"
                      value={activeItem.maxDurability ?? ""}
                      onChange={(e) => handleNumInput("maxDurability", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Тип стрельбы (shootType)</label>
                    <CustomSelect
                      value={activeItem.shootType || "default"}
                      onChange={(e) => updateField("shootType", e.target.value)}
                      className="w-full text-xs"
                    >
                      <option value="default">Default (Обычный)</option>
                      <option value="shotgun">Shotgun (Дробовик)</option>
                      <option value="auto">Auto (Автоматический)</option>
                      <option value="rifle">Rifle (Винтовка)</option>
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">
                      {isRu ? "Интенсивность отдачи" : "Recoil Intensity"} (shakeIntensity)
                    </label>
                    <input
                      type="text"
                      value={activeItem.shakeIntensity ?? ""}
                      onChange={(e) => handleNumInput("shakeIntensity", e.target.value, true)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white font-mono"
                      placeholder="0.0"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">
                      {isRu ? "Длительность отдачи (мс)" : "Recoil Duration (ms)"} (shakeDuration)
                    </label>
                    <input
                      type="text"
                      value={activeItem.shakeDuration ?? ""}
                      onChange={(e) => handleNumInput("shakeDuration", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white font-mono"
                      placeholder="200"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Z-Index на кукле</label>
                    <input
                      type="text"
                      value={activeItem.zIndex ?? ""}
                      onChange={(e) => handleNumInput("zIndex", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Категория слота (slot)</label>
                    <input
                      type="text"
                      value={activeItem.slot ?? "weapon"}
                      onChange={(e) => updateField("slot", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white font-mono"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Отбрасывание (%)</label>
                    <input
                      type="text"
                      value={activeItem.knockbackChance ?? ""}
                      onChange={(e) => handleNumInput("knockbackChance", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Направление гильз (casingDirection)</label>
                    <CustomSelect
                      value={activeItem.casingDirection || ""}
                      onChange={(e) => updateField("casingDirection", e.target.value)}
                      className="w-full text-xs"
                    >
                      <option value="">-- Авто/По умолчанию --</option>
                      <option value="left">Left (Влево)</option>
                      <option value="right">Right (Вправо)</option>
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Вибрация (vibrationPattern)</label>
                    <input
                      type="text"
                      value={getVibrationPatternString(activeItem.vibrationPattern)}
                      onChange={(e) => handleVibrationPatternChange(e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white font-mono"
                      placeholder="e.g. 50 or 80, 20, 60"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="checkbox"
                      checked={activeItem.akimbo === true}
                      onChange={(e) => updateField("akimbo", e.target.checked)}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400 font-bold">Два оружия (akimbo)</span>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">
                      {isRu ? "Кадр вспышки" : "Muzzle Flash Frame"} (muzzleFrame)
                    </label>
                    <input
                      type="text"
                      value={activeItem.muzzleFrame ?? ""}
                      onChange={(e) => handleNumInput("muzzleFrame", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white font-mono"
                      placeholder="2"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="checkbox"
                      checked={activeItem.muzzleFlash === true}
                      onChange={(e) => updateField("muzzleFlash", e.target.checked)}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400 font-bold">Вспышка (muzzleFlash)</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="checkbox"
                      checked={activeItem.loseAmmoOnReload === true}
                      onChange={(e) => updateField("loseAmmoOnReload", e.target.checked)}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400 font-bold">Терять патроны перезарядки</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="checkbox"
                      checked={activeItem.ejectAllOnReload === true}
                      onChange={(e) => updateField("ejectAllOnReload", e.target.checked)}
                      className="accent-indigo-600 rounded bg-gray-900 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-400 font-bold">Гильзы падают при перезарядке</span>
                  </div>
                </div>

                {/* Hands & Paperdoll Sprite picking */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* dollAssetId */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт куклы игрока
                      <span className="text-[9px] text-gray-500 font-mono">dollAssetId</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.dollAssetId) ? (
                          <img src={getAssetPreviewUrl(activeItem.dollAssetId)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.dollAssetId || "Не задан"}</span>
                        <button onClick={() => setPickingField("dollAssetId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* handAsset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт руки (мужской)
                      <span className="text-[9px] text-gray-500 font-mono">handAsset</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.handAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.handAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.handAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("handAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* handFemaleAsset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт руки (женский)
                      <span className="text-[9px] text-gray-500 font-mono">handFemaleAsset</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.handFemaleAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.handFemaleAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.handFemaleAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("handFemaleAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* attackAsset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт выстрела (муж)
                      <span className="text-[9px] text-gray-500 font-mono">attackAsset</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.attackAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.attackAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.attackAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("attackAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* attackAssetFemale */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт выстрела (жен)
                      <span className="text-[9px] text-gray-500 font-mono">attackAssetFemale</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.attackAssetFemale) ? (
                          <img src={getAssetPreviewUrl(activeItem.attackAssetFemale)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.attackAssetFemale || "Не задан"}</span>
                        <button onClick={() => setPickingField("attackAssetFemale")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* muzzleAsset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт вспышки (муж)
                      <span className="text-[9px] text-gray-500 font-mono">muzzleAsset</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.muzzleAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.muzzleAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.muzzleAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("muzzleAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* muzzleFemaleAsset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                      Спрайт вспышки (жен)
                      <span className="text-[9px] text-gray-500 font-mono">muzzleFemaleAsset</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.muzzleFemaleAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.muzzleFemaleAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.muzzleFemaleAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("muzzleFemaleAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  {/* handScale & handOffset */}
                  <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] text-gray-400 font-bold">Смещение рук</span>
                      <button
                        type="button"
                        onClick={() => setShowHandOffsetEditor(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors shrink-0 cursor-pointer"
                      >
                        Визуально
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500">Scale:</span>
                        <input type="text" value={activeItem.handScale ?? ""} onChange={(e) => handleNumInput("handScale", e.target.value, true)} className="bg-gray-950 border border-gray-850 rounded text-center text-xs text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500">Offset X:</span>
                        <input type="text" value={activeItem.handOffset?.x ?? ""} onChange={(e) => handleNumInput("handOffset.x", e.target.value)} className="bg-gray-950 border border-gray-850 rounded text-center text-xs text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500">Offset Y:</span>
                        <input type="text" value={activeItem.handOffset?.y ?? ""} onChange={(e) => handleNumInput("handOffset.y", e.target.value)} className="bg-gray-950 border border-gray-850 rounded text-center text-xs text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Casings details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900/20 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] text-gray-400 font-bold">Спрайт гильз (casingAsset)</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPickingField("casingAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded uppercase">Выбрать</button>
                      <span className="text-[10px] font-mono text-gray-400 truncate">{activeItem.casingAsset || "Не задан"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 min-[370px]:grid-cols-4 gap-1.5">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-gray-400">Scale:</span>
                      <input type="text" value={activeItem.casingScale ?? ""} onChange={(e) => handleNumInput("casingScale", e.target.value, true)} className="bg-gray-900 border border-gray-800 rounded text-center text-xs text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-gray-400">Gr Scale M:</span>
                      <input type="text" value={activeItem.casingGroundScaleMultiplier ?? ""} onChange={(e) => handleNumInput("casingGroundScaleMultiplier", e.target.value, true)} className="bg-gray-900 border border-gray-800 rounded text-center text-xs text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-gray-400">Spawn X:</span>
                      <input type="text" value={activeItem.casingSpawnPoint?.x ?? ""} onChange={(e) => handleNumInput("casingSpawnPoint.x", e.target.value)} className="bg-gray-900 border border-gray-800 rounded text-center text-xs text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-gray-400">Spawn Y:</span>
                      <input type="text" value={activeItem.casingSpawnPoint?.y ?? ""} onChange={(e) => handleNumInput("casingSpawnPoint.y", e.target.value)} className="bg-gray-900 border border-gray-800 rounded text-center text-xs text-white" />
                    </div>
                  </div>
                </div>

                {/* Sounds inside weapon */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук выстрела
                      {activeItem.sounds?.attack && <button onClick={() => playSound(activeItem.sounds.attack)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.attack || ""} onChange={(e) => updateField("sounds.attack", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук перезарядки
                      {activeItem.sounds?.reload && <button onClick={() => playSound(activeItem.sounds.reload)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.reload || ""} onChange={(e) => updateField("sounds.reload", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук падения гильзы
                      {activeItem.sounds?.casing && <button onClick={() => playSound(activeItem.sounds.casing)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.casing || ""} onChange={(e) => updateField("sounds.casing", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>
                </div>

                {/* Attack animations editor */}
                <div className="bg-gray-900/30 border border-gray-850 p-3 rounded-lg flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-gray-800 pb-2 gap-2">
                    <span className="text-xs font-bold text-gray-400">Анимация удара / отдачи (attackAnimation)</span>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setShowAttackAnimEditor(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2.5 py-1 rounded font-bold uppercase transition-colors cursor-pointer"
                      >
                        Визуально
                      </button>
                      <button
                        onClick={addAnimationFrame}
                        className="bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] px-2.5 py-1 rounded font-bold uppercase flex items-center gap-1 transition-colors"
                        type="button"
                      >
                        <Plus size={12} /> Добавить кадр
                      </button>
                    </div>
                  </div>

                  {activeItem.attackAnimation && activeItem.attackAnimation.length > 0 ? (
                    <div className="flex flex-col gap-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                      {activeItem.attackAnimation.map((frame: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-950 p-2 rounded border border-gray-850 text-xs">
                          <span className="font-mono text-gray-500 shrink-0 font-bold">#{idx + 1}</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-gray-500 mb-0.5">Длительность:</span>
                              <input
                                type="text"
                                value={frame.duration ?? ""}
                                onChange={(e) => updateAnimationFrame(idx, "duration", parseInt(e.target.value, 10) || 0)}
                                className="bg-gray-900 border border-gray-800 rounded w-full text-center text-xs py-0.5 text-white"
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-gray-500 mb-0.5">X:</span>
                              <input
                                type="text"
                                value={frame.x ?? ""}
                                onChange={(e) => updateAnimationFrame(idx, "x", parseInt(e.target.value, 10) || 0)}
                                className="bg-gray-900 border border-gray-800 rounded w-full text-center text-xs py-0.5 text-white"
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-gray-500 mb-0.5">Y:</span>
                              <input
                                type="text"
                                value={frame.y ?? ""}
                                onChange={(e) => updateAnimationFrame(idx, "y", parseInt(e.target.value, 10) || 0)}
                                className="bg-gray-900 border border-gray-800 rounded w-full text-center text-xs py-0.5 text-white"
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] text-gray-500 mb-0.5">Масштаб:</span>
                              <input
                                type="text"
                                value={frame.scale ?? ""}
                                onChange={(e) => updateAnimationFrame(idx, "scale", parseFloat(e.target.value) || 1.0)}
                                className="bg-gray-900 border border-gray-800 rounded w-full text-center text-xs py-0.5 text-white"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeAnimationFrame(idx)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/40 rounded text-red-500 self-end mb-0.5 cursor-pointer"
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-xs text-gray-600 italic py-2">Нет кадров анимации. Будет использован стандартный импульс.</div>
                  )}
                </div>
              </div>
            )}

            {/* Section: EXPLOSIVES & FLARES (GRENADE, MOLOTOV, FLASHBANG, C4, FLARE) */}
            {(activeItem.type === "GRENADE" || activeItem.type === "MOLOTOV" || activeItem.type === "FLASHBANG" || activeItem.type === "C4" || activeItem.type === "FLARE") && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Flame size={14} /> Настройки Метательного / Фаера / Взрывчатки
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  {activeItem.type !== "FLARE" && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Кубик Взрыва (damageDice)</label>
                        <input
                          type="text"
                          value={activeItem.damageDice ?? ""}
                          onChange={(e) => updateField("damageDice", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Радиус взрыва (explosionRange)</label>
                        <input
                          type="text"
                          value={activeItem.explosionRange ?? ""}
                          onChange={(e) => handleNumInput("explosionRange", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Таймер взрыва (сек)</label>
                        <input
                          type="text"
                          value={activeItem.timer ?? ""}
                          onChange={(e) => handleNumInput("timer", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Макс. Стаков (maxStack)</label>
                    <input
                      type="text"
                      value={activeItem.maxStack ?? ""}
                      onChange={(e) => handleNumInput("maxStack", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  {activeItem.type === "FLARE" && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Время горения (flareDuration, ходов)</label>
                        <input
                          type="text"
                          value={activeItem.flareDuration ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const cleanVal = val.replace(/,/g, ".");
                            if (cleanVal === "") {
                              updateFields({
                                flareDuration: "",
                                initialFlareDuration: ""
                              });
                            } else if (/^-?\d*$/.test(cleanVal)) {
                              if (cleanVal === "-") {
                                updateFields({
                                  flareDuration: "-",
                                  initialFlareDuration: "-"
                                });
                              } else {
                                const parsed = parseInt(cleanVal, 10);
                                const numOrVal = isNaN(parsed) ? "" : parsed;
                                updateFields({
                                  flareDuration: numOrVal,
                                  initialFlareDuration: numOrVal
                                });
                              }
                            }
                          }}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                          placeholder="15"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Радиус света (flareRadius)</label>
                        <input
                          type="text"
                          value={activeItem.flareRadius ?? ""}
                          onChange={(e) => handleNumInput("flareRadius", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                          placeholder="5"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Яркость света (flareBrightness)</label>
                        <input
                          type="text"
                          value={activeItem.flareBrightness ?? ""}
                          onChange={(e) => handleNumInput("flareBrightness", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                          placeholder="2.2"
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <CustomColorPicker
                          label="Цвет света (flareColor)"
                          color={rgbToHex(activeItem.flareColor?.r ?? 255, activeItem.flareColor?.g ?? 60, activeItem.flareColor?.b ?? 30)}
                          onChange={(hexColor) => {
                            const rgb = hexToRgb(hexColor);
                            updateField("flareColor", rgb);
                          }}
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <CustomColorPicker
                          label="Цвет дыма (smokeColor)"
                          color={typeof activeItem.smokeColor === "string" ? activeItem.smokeColor : "rgba(255, 80, 40, 0.7)"}
                          onChange={(colorStr) => {
                            updateField("smokeColor", colorStr);
                          }}
                          supportAlpha={true}
                        />
                      </div>
                    </>
                  )}

                  {activeItem.type === "FLASHBANG" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Длительность ослепления (сек)</label>
                      <input
                        type="text"
                        value={activeItem.duration ?? ""}
                        onChange={(e) => handleNumInput("duration", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      />
                    </div>
                  )}

                  {activeItem.type === "MOLOTOV" && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Объект огня (fireObjectId)</label>
                        <input
                          type="text"
                          value={activeItem.fireObjectId ?? "fire"}
                          onChange={(e) => updateField("fireObjectId", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Кол-во распространений (spreadsLeft)</label>
                        <input
                          type="text"
                          value={activeItem.spreadsLeft ?? ""}
                          onChange={(e) => handleNumInput("spreadsLeft", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                          placeholder="3"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Шанс распространения (spreadChance 0-1)</label>
                        <input
                          type="text"
                          value={activeItem.spreadChance ?? ""}
                          onChange={(e) => handleNumInput("spreadChance", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                          placeholder="0.5"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Спрайт осколков стекла</label>
                        <input
                          type="text"
                          value={activeItem.glassTextureId ?? ""}
                          onChange={(e) => updateField("glassTextureId", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                        />
                      </div>
                    </>
                  )}

                  {activeItem.type === "C4" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Спрайт C4 на стене</label>
                      <input
                        type="text"
                        value={activeItem.wallAssetId ?? ""}
                        onChange={(e) => updateField("wallAssetId", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-gray-900/30 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold">Спрайт в полёте</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPickingField("throwId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded uppercase">Выбрать (throwId)</button>
                      <span className="text-[10px] font-mono text-indigo-300 truncate">{activeItem.throwId || "Не задан"}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold">Спрайт анимации взрыва</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPickingField("explosionId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded uppercase">Выбрать (explosionId)</button>
                      <span className="text-[10px] font-mono text-indigo-300 truncate">{activeItem.explosionId || "Не задана"}</span>
                    </div>
                  </div>

                  {activeItem.type === "FLARE" && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-gray-400 font-bold">Сгоревший спрайт</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPickingField("burntAssetId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded uppercase">Выбрать (burntAssetId)</button>
                        <span className="text-[10px] font-mono text-indigo-300 truncate">{activeItem.burntAssetId || "FLASHBANG_ARMED"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sounds for explosive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук взрыва (explosionSoundId)
                      {activeItem.explosionSoundId && <button onClick={() => playSound(activeItem.explosionSoundId)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.explosionSoundId || ""} onChange={(e) => updateField("explosionSoundId", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук взведения (sounds.prime)
                      {activeItem.sounds?.prime && <button onClick={() => playSound(activeItem.sounds.prime)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.prime || ""} onChange={(e) => updateField("sounds.prime", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук отскока (sounds.bounce)
                      {activeItem.sounds?.bounce && <button onClick={() => playSound(activeItem.sounds.bounce)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.bounce || ""} onChange={(e) => updateField("sounds.bounce", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук использования (sounds.use)
                      {activeItem.sounds?.use && <button onClick={() => playSound(activeItem.sounds.use)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.use || ""} onChange={(e) => updateField("sounds.use", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук C4 пиканья (sounds.beep)
                      {activeItem.sounds?.beep && <button onClick={() => playSound(activeItem.sounds.beep)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.beep || ""} onChange={(e) => updateField("sounds.beep", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук C4 взрыва (sounds.explosion)
                      {activeItem.sounds?.explosion && <button onClick={() => playSound(activeItem.sounds.explosion)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.explosion || ""} onChange={(e) => updateField("sounds.explosion", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>
                </div>

                {/* Vibration for explosive */}
                <div className="bg-gray-900/20 p-2.5 rounded-lg border border-gray-850 flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1 w-full">
                    <label className="text-[11px] text-gray-400 mb-1 block">Вибрация взрыва (vibrationPattern)</label>
                    <input
                      type="text"
                      value={getVibrationPatternString(activeItem.vibrationPattern)}
                      onChange={(e) => handleVibrationPatternChange(e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center text-white font-mono w-full"
                      placeholder="e.g. 1000 or 500, 100, 500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: CONSUMABLE */}
            {activeItem.type === "CONSUMABLE" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Heart size={14} /> Настройки Расходного Предмета
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Кубик Лечения (healDice)</label>
                    <input
                      type="text"
                      value={activeItem.healDice ?? ""}
                      onChange={(e) => updateField("healDice", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                      placeholder="2d6"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Макс. Стаков (maxStack)</label>
                    <input
                      type="text"
                      value={activeItem.maxStack ?? ""}
                      onChange={(e) => handleNumInput("maxStack", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук использования
                      {activeItem.sounds?.use && <button onClick={() => playSound(activeItem.sounds.use)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.use || ""} onChange={(e) => updateField("sounds.use", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>
                </div>

                <div className="bg-gray-900/20 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <span className="text-[11px] text-gray-400 font-bold">Эффект при использовании (onUseEffect)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1">ID эффекта</label>
                      <input
                        type="text"
                        value={activeItem.onUseEffect?.id ?? ""}
                        onChange={(e) => updateField("onUseEffect.id", e.target.value)}
                        className="bg-gray-900 border border-gray-850 rounded px-2 py-1 text-xs text-white font-mono"
                        placeholder="antiseptic"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] text-gray-500 mb-1">Шанс наложения (%)</label>
                      <input
                        type="text"
                        value={activeItem.onUseEffect?.chance ?? ""}
                        onChange={(e) => handleNumInput("onUseEffect.chance", e.target.value)}
                        className="bg-gray-900 border border-gray-850 rounded px-2 py-1 text-xs text-center text-white"
                        placeholder="100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section: NOTE, MAP, CONSOLE, RADIO */}
            {(activeItem.type === "NOTE" || activeItem.type === "MAP" || activeItem.type === "CONSOLE" || activeItem.type === "RADIO") && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <FileText size={14} /> Интерактивные Предметы (Записка/Карта/Консоль/Рация)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  {activeItem.type === "NOTE" && (
                    <>
                      <div className="flex flex-col col-span-1 sm:col-span-2">
                        <label className="text-[11px] text-gray-400 mb-1">Текст записки (RU/EN через / и переносы |)</label>
                        <input
                          type="text"
                          value={activeItem.text ?? ""}
                          onChange={(e) => updateField("text", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                          placeholder="Текст записки.../Note text..."
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Размер шрифта текста</label>
                        <input
                          type="text"
                          value={activeItem.textScale ?? ""}
                          onChange={(e) => handleNumInput("textScale", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Смещение текста X (textOffsetX)</label>
                        <input
                          type="text"
                          value={activeItem.textOffsetX ?? ""}
                          onChange={(e) => handleNumInput("textOffsetX", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                          placeholder="0.5"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Смещение текста Y (textOffsetY)</label>
                        <input
                          type="text"
                          value={activeItem.textOffsetY ?? ""}
                          onChange={(e) => handleNumInput("textOffsetY", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                          placeholder="0.5"
                        />
                      </div>
                    </>
                  )}

                  {activeItem.type === "MAP" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Масштаб отрисовки (drawScale)</label>
                      <input
                        type="text"
                        value={activeItem.drawScale ?? ""}
                        onChange={(e) => handleNumInput("drawScale", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                      />
                    </div>
                  )}

                  {activeItem.type === "CONSOLE" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Звук игры (gameSound)</label>
                      <CustomSelect value={activeItem.gameSound || ""} onChange={(e) => updateField("gameSound", e.target.value)} className="w-full text-xs">
                        <option value="">-- Нет звука --</option>
                        {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                      </CustomSelect>
                    </div>
                  )}
                </div>

                {/* Sounds Specific Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-gray-900/40 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук использования (sounds.use)
                      {activeItem.sounds?.use && <button onClick={() => playSound(activeItem.sounds.use)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.use || ""} onChange={(e) => updateField("sounds.use", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук экипировки (sounds.equip)
                      {activeItem.sounds?.equip && <button onClick={() => playSound(activeItem.sounds.equip)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.sounds?.equip || ""} onChange={(e) => updateField("sounds.equip", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  {activeItem.type === "CONSOLE" && (
                    <div className="flex flex-col">
                      <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук нажатия кнопки (sounds.button)
                        {activeItem.sounds?.button && <button onClick={() => playSound(activeItem.sounds.button)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                      </span>
                      <CustomSelect value={activeItem.sounds?.button || ""} onChange={(e) => updateField("sounds.button", e.target.value)} className="w-full text-xs">
                        <option value="">-- Нет звука --</option>
                        {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                      </CustomSelect>
                    </div>
                  )}

                  {activeItem.type === "RADIO" && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук рации ВКЛ (sounds.radio_on)
                          {activeItem.sounds?.radio_on && <button onClick={() => playSound(activeItem.sounds.radio_on)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                        </span>
                        <CustomSelect value={activeItem.sounds?.radio_on || ""} onChange={(e) => updateField("sounds.radio_on", e.target.value)} className="w-full text-xs">
                          <option value="">-- Нет звука --</option>
                          {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                        </CustomSelect>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук рации ВЫКЛ (sounds.radio_off)
                          {activeItem.sounds?.radio_off && <button onClick={() => playSound(activeItem.sounds.radio_off)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                        </span>
                        <CustomSelect value={activeItem.sounds?.radio_off || ""} onChange={(e) => updateField("sounds.radio_off", e.target.value)} className="w-full text-xs">
                          <option value="">-- Нет звука --</option>
                          {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                        </CustomSelect>
                      </div>
                    </>
                  )}
                </div>

                {/* Sprites (Male & Female + Screen Masks) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-gray-900/20 p-2.5 rounded-lg border border-gray-850">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">Руки (мужские) <span className="text-[9px] font-mono text-gray-500">handAsset</span></span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.handAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.handAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.handAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("handAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1" type="button">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">Руки (женские) <span className="text-[9px] font-mono text-gray-500">handFemaleAsset</span></span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.handFemaleAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.handFemaleAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.handFemaleAsset || "Не задан"}</span>
                        <button onClick={() => setPickingField("handFemaleAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1" type="button">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">Маска (мужская) <span className="text-[9px] font-mono text-gray-500">maskAsset</span></span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.maskAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.maskAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.maskAsset || "Не задана"}</span>
                        <button onClick={() => setPickingField("maskAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1" type="button">Выбрать</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-gray-400 font-bold flex justify-between">Маска (женская) <span className="text-[9px] font-mono text-gray-500">maskFemaleAsset</span></span>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                        {getAssetPreviewUrl(activeItem.maskFemaleAsset) ? (
                          <img src={getAssetPreviewUrl(activeItem.maskFemaleAsset)} className="max-h-full max-w-full object-contain pixelated" />
                        ) : (
                          <span className="text-[8px] text-gray-600">Пусто</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.maskFemaleAsset || "Не задана"}</span>
                        <button onClick={() => setPickingField("maskFemaleAsset")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1" type="button">Выбрать</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: CONSOLE_SPRITES (consoleAssets) */}
                {activeItem.type === "CONSOLE" && (
                  <div className="pt-2 flex flex-col gap-2">
                    <h4 className="text-[11px] font-bold text-indigo-300 uppercase tracking-wide font-mono">
                      🎮 Спрайты Нажатий Кнопок Игровой Консоли (consoleAssets)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-gray-950 p-3 rounded-lg border border-gray-850">
                      {[
                        { key: "up", label: "Вверх (Муж)", field: "consoleAssets.up" },
                        { key: "down", label: "Вниз (Муж)", field: "consoleAssets.down" },
                        { key: "left", label: "Влево (Муж)", field: "consoleAssets.left" },
                        { key: "right", label: "Вправо (Муж)", field: "consoleAssets.right" },
                        { key: "action", label: "Кнопка A (Муж)", field: "consoleAssets.action" },
                        { key: "upFemale", label: "Вверх (Жен)", field: "consoleAssets.upFemale" },
                        { key: "downFemale", label: "Вниз (Жен)", field: "consoleAssets.downFemale" },
                        { key: "leftFemale", label: "Влево (Жен)", field: "consoleAssets.leftFemale" },
                        { key: "rightFemale", label: "Вправо (Жен)", field: "consoleAssets.rightFemale" },
                        { key: "actionFemale", label: "Кнопка A (Жен)", field: "consoleAssets.actionFemale" }
                      ].map((btn) => (
                        <div key={btn.key} className="bg-gray-900 border border-gray-800 p-2 rounded flex flex-col gap-1">
                          <span className="text-[10px] text-gray-300 font-bold truncate">{btn.label}</span>
                          <div className="w-full h-12 bg-gray-950 border border-gray-850 rounded flex items-center justify-center overflow-hidden mb-1">
                            {getAssetPreviewUrl(activeItem.consoleAssets?.[btn.key]) ? (
                              <img src={getAssetPreviewUrl(activeItem.consoleAssets[btn.key])} className="max-h-full max-w-full object-contain pixelated" />
                            ) : (
                              <span className="text-[8px] text-gray-700">Пусто</span>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-gray-400 block truncate mb-1">{activeItem.consoleAssets?.[btn.key] || "Не задан"}</span>
                          <button
                            onClick={() => setPickingField(btn.field)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] py-0.5 px-1 rounded uppercase font-bold text-center w-full block"
                            type="button"
                          >
                            Выбрать
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Section: AMMO */}
            {activeItem.type === "AMMO" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Coins size={14} /> Настройки Боеприпасов
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Тип патронов (ammoType)</label>
                    <input
                      type="text"
                      value={activeItem.ammoType ?? ""}
                      onChange={(e) => updateField("ammoType", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center font-mono text-white"
                      placeholder="e.g. 9mm, 12g"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Количество в пачке (count)</label>
                    <input
                      type="text"
                      value={activeItem.count ?? ""}
                      onChange={(e) => handleNumInput("count", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Макс. стак в рюкзаке (maxStack)</label>
                    <input
                      type="text"
                      value={activeItem.maxStack ?? ""}
                      onChange={(e) => handleNumInput("maxStack", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: UTILITY_POWER_CASH (FLASHLIGHT, DIGITAL_MAP, CASH, BATTERY) */}
            {(activeItem.type === "FLASHLIGHT" || activeItem.type === "DIGITAL_MAP" || activeItem.type === "CASH" || activeItem.type === "BATTERY") && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  💡 Устройства, Питание и Ценности
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  {(activeItem.type === "FLASHLIGHT" || activeItem.type === "DIGITAL_MAP") && (
                    <>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Источник энергии (powerSource)</label>
                        <CustomSelect
                          value={activeItem.powerSource ?? ""}
                          onChange={(e) => updateField("powerSource", e.target.value)}
                          className="w-full text-xs"
                        >
                          <option value="">-- Выберите предмет --</option>
                          {itemIds.map(id => {
                            const item = data[id];
                            const nameStr = item?.name || "";
                            const displayName = isRu ? nameStr.split("/")[0] : (nameStr.split("/")[1] || nameStr);
                            return (
                              <option key={id} value={id}>
                                {id} {displayName ? `(${displayName})` : ""}
                              </option>
                            );
                          })}
                        </CustomSelect>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Скорость разряда в ход (dischargeRate)</label>
                        <input
                          type="text"
                          value={activeItem.dischargeRate ?? ""}
                          onChange={(e) => handleNumInput("dischargeRate", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                          placeholder="1"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Макс. заряд (magazineMax)</label>
                        <input
                          type="text"
                          value={activeItem.magazineMax ?? ""}
                          onChange={(e) => handleNumInput("magazineMax", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                          placeholder="100"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Текущий заряд (currentAmmo)</label>
                        <input
                          type="text"
                          value={activeItem.currentAmmo ?? ""}
                          onChange={(e) => handleNumInput("currentAmmo", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                          placeholder="100"
                        />
                      </div>
                    </>
                  )}

                  {activeItem.type === "BATTERY" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Заряд батареи (charge)</label>
                      <input
                        type="text"
                        value={activeItem.charge ?? ""}
                        onChange={(e) => handleNumInput("charge", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                        placeholder="100"
                      />
                    </div>
                  )}

                  {activeItem.type === "CASH" && (
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Ценность/Диапазон денег (valuable)</label>
                      <input
                        type="text"
                        value={activeItem.valuable ?? ""}
                        onChange={(e) => updateField("valuable", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-center font-mono text-white"
                        placeholder="5-20"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section: ARMOR */}
            {activeItem.type === "ARMOR" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Shield size={14} /> Настройки Брони
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Защита (protection)</label>
                    <input
                      type="text"
                      value={activeItem.protection ?? ""}
                      onChange={(e) => handleNumInput("protection", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="1"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Категория слота (slot)</label>
                    <CustomSelect
                      value={activeItem.slot || "vest"}
                      onChange={(e) => updateField("slot", e.target.value)}
                      className="w-full text-xs"
                    >
                      <option value="helmet">Helmet (Шлем)</option>
                      <option value="vest">Vest (Жилет)</option>
                      <option value="pants">Pants (Штаны)</option>
                      <option value="boots">Boots (Ботинки)</option>
                    </CustomSelect>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Доп. слоты инвентаря</label>
                    <input
                      type="text"
                      value={activeItem.inventorySlots ?? ""}
                      onChange={(e) => handleNumInput("inventorySlots", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Макс. Прочность (maxDurability)</label>
                    <input
                      type="text"
                      value={activeItem.maxDurability ?? ""}
                      onChange={(e) => handleNumInput("maxDurability", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Z-Index на кукле</label>
                    <input
                      type="text"
                      value={activeItem.zIndex ?? ""}
                      onChange={(e) => handleNumInput("zIndex", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="e.g. 2"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Сдвиг X (женский)</label>
                    <input
                      type="text"
                      value={activeItem.femaleOffsetX ?? ""}
                      onChange={(e) => handleNumInput("femaleOffsetX", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">Сдвиг Y (женский)</label>
                    <input
                      type="text"
                      value={activeItem.femaleOffsetY ?? ""}
                      onChange={(e) => handleNumInput("femaleOffsetY", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-center text-white"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-1.5 max-w-sm">
                  <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                    Спрайт куклы персонажа (будет одет поверх куклы)
                    <span className="text-[9px] text-gray-500 font-mono">dollAssetId</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeItem.dollAssetId) ? (
                        <img src={getAssetPreviewUrl(activeItem.dollAssetId)} className="max-h-full max-w-full object-contain pixelated" />
                      ) : (
                        <span className="text-[8px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.dollAssetId || "Не задан"}</span>
                      <button onClick={() => setPickingField("dollAssetId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать Спрайт</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section: CARTRIDGE */}
            {activeItem.type === "CARTRIDGE" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Play size={14} /> Настройки Картриджа
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-gray-400 mb-1">
                      {isRu ? "Название игры (Название/Name)" : "Game Name (Name/Name)"}
                    </label>
                    <input
                      type="text"
                      value={activeItem.gameName ?? ""}
                      onChange={(e) => updateField("gameName", e.target.value)}
                      className="bg-gray-900 border border-gray-850 rounded px-2.5 py-1.5 text-xs text-white"
                      placeholder="Змейка / Snake"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section: CONTAINER */}
            {activeItem.type === "CONTAINER" && (
              <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-1.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                  <Box size={14} /> Настройки Контейнера / Лута
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900/30 p-3 rounded-lg border border-gray-850">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">Звук открытия контейнера
                      {activeItem.openSound && <button onClick={() => playSound(activeItem.openSound)} className="p-1 bg-indigo-900 hover:bg-indigo-800 rounded text-indigo-400" type="button"><Volume2 size={10} /></button>}
                    </span>
                    <CustomSelect value={activeItem.openSound || ""} onChange={(e) => updateField("openSound", e.target.value)} className="w-full text-xs">
                      <option value="">-- Нет звука --</option>
                      {soundOptions.map(id => <option key={id} value={id}>{id}</option>)}
                    </CustomSelect>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeItem.blocking !== false}
                      onChange={(e) => updateField("blocking", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <span className="text-xs text-gray-400 font-bold">Блокирует проход (blocking)</span>
                  </div>
                </div>

                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-1.5 max-w-sm">
                  <span className="text-[11px] text-gray-400 font-bold flex justify-between">
                    Спрайт открытого контейнера
                    <span className="text-[9px] text-gray-500 font-mono">openedAssetId</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gray-950 border border-gray-800 flex items-center justify-center rounded overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeItem.openedAssetId) ? (
                        <img src={getAssetPreviewUrl(activeItem.openedAssetId)} className="max-h-full max-w-full object-contain pixelated" />
                      ) : (
                        <span className="text-[8px] text-gray-600">Пусто</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-mono text-indigo-300 block truncate">{activeItem.openedAssetId || "Не задан"}</span>
                      <button onClick={() => setPickingField("openedAssetId")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold mt-1">Выбрать Спрайт</button>
                    </div>
                  </div>
                </div>

                {/* Loot items inside container */}
                <div className="bg-gray-900/30 border border-gray-850 p-3 rounded-lg flex flex-col gap-2">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-xs font-bold text-gray-400">Список выпадающих предметов (loot)</span>
                    <button
                      onClick={addLootEntry}
                      className="bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] px-2.5 py-1 rounded font-bold uppercase flex items-center gap-1"
                      type="button"
                    >
                      <Plus size={12} /> Добавить предмет
                    </button>
                  </div>

                  {activeItem.loot && activeItem.loot.length > 0 ? (
                    <div className="flex flex-col gap-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                      {activeItem.loot.map((entry: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-950 p-2 rounded border border-gray-850 text-xs">
                          <span className="font-mono text-gray-500 shrink-0 font-bold">#{idx + 1}</span>
                          <div className="flex-1 flex flex-col sm:flex-row gap-2">
                            <div className="flex-1 flex flex-col">
                              <span className="text-[10px] text-gray-500 mb-0.5">Предмет:</span>
                              <CustomSelect
                                value={entry.id || ""}
                                onChange={(e) => updateLootEntry(idx, "id", e.target.value)}
                                className="w-full text-xs"
                              >
                                {allItemIds.map(id => (
                                  <option key={id} value={id}>{data[id]?.name?.split("/")[0] || id}</option>
                                ))}
                              </CustomSelect>
                            </div>
                            <div className="w-24 flex flex-col">
                              <span className="text-[10px] text-gray-500 mb-0.5">Количество:</span>
                              <input
                                type="number"
                                value={entry.count ?? ""}
                                onChange={(e) => updateLootEntry(idx, "count", parseInt(e.target.value, 10) || 1)}
                                className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-center text-white"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeLootEntry(idx)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/40 rounded text-red-500 self-end mb-1"
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-xs text-gray-600 italic py-2">Контейнер пуст. Добавьте предметы для выбивания.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500 italic">Выберите или создайте предмет слева, чтобы начать редактирование.</div>
        )}
      </div>

      {/* Hand Offset Visual Editor overlay */}
      {showHandOffsetEditor && (
        <HandOffsetVisualEditor
          initialOffset={activeItem.handOffset || { x: 0, y: 0 }}
          weaponSpriteUrl={getAssetPreviewUrl(activeItem.handAsset || activeItem.assetId)}
          handScale={activeItem.handScale || 1.0}
          onSave={handleSaveHandOffset}
          onClose={() => setShowHandOffsetEditor(false)}
          uiStrings={uiStrings}
        />
      )}

      {/* Attack Animation Visual Editor overlay */}
      {showAttackAnimEditor && (
        <AttackAnimationVisualEditor
          initialAnimation={activeItem.attackAnimation || []}
          weaponSpriteUrl={getAssetPreviewUrl(activeItem.handAsset || activeItem.assetId)}
          handScale={activeItem.handScale || 1.0}
          initialOffset={activeItem.handOffset || { x: 0, y: 0 }}
          onSave={(newAnim) => updateField("attackAnimation", newAnim)}
          onClose={() => setShowAttackAnimEditor(false)}
          uiStrings={uiStrings}
        />
      )}
    </div>
  );
};
