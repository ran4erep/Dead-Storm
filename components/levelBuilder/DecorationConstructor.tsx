import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Trash2,
  Plus,
  Play,
  Search,
  Copy,
  Volume2,
  Image,
  Layers,
  Sparkles,
  Heart,
  Eye,
  Hammer,
  ShieldAlert,
  Flame,
  Sun,
  Box,
  Settings,
  HelpCircle
} from "lucide-react";
import { ASSETS } from "../../assets";
import soundsData from "../../data/sounds.json";
import animationsData from "../../data/animations.json";
import { CustomSelect } from "./CustomSelect";
import { AssetPicker } from "./AssetPicker";
import { CustomColorPicker } from "./CustomColorPicker";

// Helper functions for RGB-Hex conversion
const rgbToHex = (r: any, g: any, b: any): string => {
  const clamp = (val: any) => {
    const n = Number(val);
    return Math.max(0, Math.min(255, isNaN(n) ? 0 : Math.round(n)));
  };
  return "#" + [clamp(r), clamp(g), clamp(b)].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
};

const hexToRgb = (hex: string) => {
  const cleanHex = hex.startsWith("#") ? hex : "#" + hex;
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = cleanHex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
};

interface DecorationConstructorProps {
  data: Record<string, any>;
  onChange: (newData: Record<string, any>) => void;
  uiStrings: any;
}

export const DecorationConstructor: React.FC<DecorationConstructorProps> = ({
  data,
  onChange,
  uiStrings
}) => {
  const [selectedId, setSelectedId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [newDecoId, setNewDecoId] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>("");
  const [pickingField, setPickingField] = useState<string | null>(null);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const decoIds = useMemo(() => Object.keys(data), [data]);

  useEffect(() => {
    if ((!selectedId || !decoIds.includes(selectedId)) && decoIds.length > 0) {
      setSelectedId(decoIds[0]);
    }
  }, [decoIds, selectedId]);

  const filteredDecoIds = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return decoIds;
    return decoIds.filter(id => {
      const deco = data[id];
      const name = (deco?.name || "").toLowerCase();
      const desc = (deco?.description || "").toLowerCase();
      return id.toLowerCase().includes(term) || name.includes(term) || desc.includes(term);
    });
  }, [decoIds, searchTerm, data]);

  const activeDeco = useMemo(() => {
    return data[selectedId] || null;
  }, [data, selectedId]);

  const [nameRu, nameEn] = useMemo(() => {
    if (!activeDeco) return ["", ""];
    const parts = (activeDeco.name || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeDeco?.name]);

  const [descRu, descEn] = useMemo(() => {
    if (!activeDeco) return ["", ""];
    const parts = (activeDeco.description || "").split("/");
    return [parts[0] || "", parts[1] || ""];
  }, [activeDeco?.description]);

  const updateMultipleFields = (updates: Record<string, any>, toRemove: string[] = []) => {
    if (!selectedId || !activeDeco) return;
    const newData = JSON.parse(JSON.stringify(data));
    const targetDeco = newData[selectedId];

    // Apply updates
    Object.entries(updates).forEach(([path, value]) => {
      const parts = path.split(".");
      let current = targetDeco;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    });

    // Apply removals
    toRemove.forEach(path => {
      const parts = path.split(".");
      let current = targetDeco;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) return;
        current = current[parts[i]];
      }
      delete current[parts[parts.length - 1]];
    });

    onChange(newData);
  };

  const updateField = (path: string, value: any) => {
    updateMultipleFields({ [path]: value });
  };

  const removeField = (path: string) => {
    updateMultipleFields({}, [path]);
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

  const handleCreateDeco = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newDecoId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanId) {
      setCreateError("ID не может быть пустым");
      return;
    }
    if (data[cleanId]) {
      setCreateError("Декорация с таким ID уже существует");
      return;
    }

    const cleanDeco = {
      name: "/",
      description: "/",
      assetId: "",
      scale: 1.0,
      blocking: false
    };

    const newData = { ...data, [cleanId]: cleanDeco };
    onChange(newData);
    setSelectedId(cleanId);
    setNewDecoId("");
    setShowCreateForm(false);
    setCreateError("");
  };

  const handleDuplicateDeco = (id: string, e: React.MouseEvent) => {
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

    const newData = { ...data, [dupId]: cloned };
    onChange(newData);
    setSelectedId(dupId);
  };

  const handleDeleteDeco = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить декорацию "${id}"?`)) return;

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

  const soundOptions = useMemo(() => Object.keys(soundsData), []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 text-gray-200 max-w-full overflow-x-hidden">
      {/* Asset Picker Modal */}
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

      {/* Sidebar - list of decorations */}
      <div className="w-full lg:w-72 shrink-0 bg-gray-950 border border-gray-800 rounded-lg flex flex-col p-3 gap-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs tracking-wider uppercase text-gray-400">Список декораций</span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="p-1 hover:bg-gray-800 rounded text-green-400 hover:text-green-300 transition-colors"
            title="Создать декорацию"
          >
            <Plus size={18} />
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateDeco} className="bg-gray-900 p-2.5 rounded border border-gray-800 flex flex-col gap-2">
            <span className="text-[10px] text-indigo-400 font-bold">Уникальный ID:</span>
            <input
              type="text"
              placeholder="oil_barrel_leak"
              value={newDecoId}
              onChange={(e) => {
                setNewDecoId(e.target.value);
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
                  setNewDecoId("");
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
            placeholder="Поиск декорации..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-850 rounded pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
        </div>

        <div className="flex-1 overflow-y-auto max-h-[180px] lg:max-h-[60vh] flex flex-col gap-1 pr-1 custom-scrollbar">
          {filteredDecoIds.map(id => {
            const deco = data[id];
            const isSelected = selectedId === id;
            const labelName = deco?.name?.split("/")[0] || id;

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
                    onClick={(e) => handleDuplicateDeco(id, e)}
                    className="p-1 hover:bg-gray-850 rounded text-blue-400 hover:text-blue-300 transition-colors"
                    title="Дублировать"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteDeco(id, e)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-500 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filteredDecoIds.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-500 italic">Ничего не найдено</div>
          )}
        </div>
      </div>

      {/* Main Form */}
      <div className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 lg:p-4 overflow-y-auto max-h-[75vh] lg:max-h-[75vh] custom-scrollbar w-full min-w-0">
        {activeDeco ? (
          <div className="flex flex-col gap-5">
            {/* Header: ID and Name */}
            <div className="border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-emerald-950 text-emerald-400 text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-emerald-800/40 uppercase">ДЕКОРАЦИЯ</span>
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
                    placeholder="Бочка"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 font-bold mb-1">Name (EN)</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => handleNameChange("en", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
                    placeholder="Barrel"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-gray-800 pb-3">
              <div className="flex flex-col">
                <label className="text-[11px] text-gray-400 font-bold mb-1">Описание (RU)</label>
                <textarea
                  value={descRu}
                  onChange={(e) => handleDescChange("ru", e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[50px] resize-none"
                  placeholder="Обычная бочка..."
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[11px] text-gray-400 font-bold mb-1">Description (EN)</label>
                <textarea
                  value={descEn}
                  onChange={(e) => handleDescChange("en", e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 min-h-[50px] resize-none"
                  placeholder="Ordinary barrel..."
                />
              </div>
            </div>

            {/* Section: Sprite & Geometry */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Image size={14} /> Спрайт и Геометрия
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gray-950 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                      {getAssetPreviewUrl(activeDeco.assetId) ? (
                        <img
                          src={getAssetPreviewUrl(activeDeco.assetId)}
                          alt="preview"
                          className="max-w-full max-h-full object-contain pixelated"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] text-gray-600">Нет спрайта</span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-mono text-gray-400">Спрайт / Анимация</span>
                      <span className="text-xs font-mono font-bold truncate text-indigo-300">
                        {activeDeco.assetId || "Не выбран"}
                      </span>
                      <button
                        onClick={() => setPickingField("assetId")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded w-max uppercase"
                        type="button"
                      >
                        Выбрать Спрайт
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-800/50">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 mb-0.5">Масштаб (scale)</span>
                      <input
                        type="text"
                        value={activeDeco.scale ?? ""}
                        onChange={(e) => handleNumInput("scale", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                        placeholder="1.0"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 mb-0.5">Y-Смещение (yOffset)</span>
                      <input
                        type="text"
                        value={activeDeco.yOffset ?? ""}
                        onChange={(e) => handleNumInput("yOffset", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                        placeholder="0.0"
                      />
                    </div>
                  </div>
                </div>

                {/* Flags Checklist */}
                <div className="bg-gray-900/40 border border-gray-850 p-2.5 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="blocking"
                      checked={activeDeco.blocking === true}
                      onChange={(e) => updateField("blocking", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="blocking" className="text-xs text-gray-300 cursor-pointer">
                      <strong>Блокирует путь (blocking)</strong>
                      <span className="block text-[10px] text-gray-500">Персонажи не могут пройти сквозь объект</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 py-1 border-t border-gray-800/40">
                    <input
                      type="checkbox"
                      id="canBeInspected"
                      checked={activeDeco.canBeInspected !== false}
                      onChange={(e) => updateField("canBeInspected", e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="canBeInspected" className="text-xs text-gray-300 cursor-pointer">
                      <strong>Можно осматривать (canBeInspected)</strong>
                      <span className="block text-[10px] text-gray-500">Показывать описание при осмотре</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 py-1 border-t border-gray-800/40">
                    <input
                      type="checkbox"
                      id="foreground"
                      checked={activeDeco.foreground === true}
                      onChange={(e) => {
                        if (e.target.checked) updateField("foreground", true);
                        else removeField("foreground");
                      }}
                      className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="foreground" className="text-xs text-gray-300 cursor-pointer">
                      <strong>На переднем плане (foreground)</strong>
                      <span className="block text-[10px] text-gray-500">Отображать поверх существ и игрока</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Roles */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Settings size={14} /> Роли и Специальное Поведение
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Save Point */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isSavePoint"
                      checked={activeDeco.isSavePoint === true}
                      onChange={(e) => {
                        if (e.target.checked) updateField("isSavePoint", true);
                        else removeField("isSavePoint");
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="isSavePoint" className="text-xs font-bold text-gray-300 cursor-pointer">Точка Сохранения</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Сохраняет игру при активации.</span>
                </div>

                {/* Workbench */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isWorkbench"
                      checked={activeDeco.isWorkbench === true}
                      onChange={(e) => {
                        if (e.target.checked) updateField("isWorkbench", true);
                        else removeField("isWorkbench");
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="isWorkbench" className="text-xs font-bold text-gray-300 cursor-pointer">Верстак (Крафт)</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Открывает меню создания предметов.</span>
                </div>

                {/* Emptiness */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isEmptyness"
                      checked={activeDeco.isEmptyness === true}
                      onChange={(e) => {
                        if (e.target.checked) updateField("isEmptyness", true);
                        else removeField("isEmptyness");
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="isEmptyness" className="text-xs font-bold text-gray-300 cursor-pointer">Невидимая Стена</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Прозрачный невидимый коллижн-блок.</span>
                </div>

                {/* Box 3D Collision */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isBox"
                      checked={activeDeco.isBox === true}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateMultipleFields({ isBox: true, boxSize: 0.7 });
                        } else {
                          updateMultipleFields({}, ["isBox", "boxSize", "moveSound", "fallSound", "stepSound"]);
                        }
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="isBox" className="text-xs font-bold text-gray-300 cursor-pointer">Объёмная Коробка</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Рендерит 3D-куб на месте объекта.</span>
                  {activeDeco.isBox === true && (
                    <div className="mt-1.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Размер:</span>
                        <input
                          type="text"
                          value={activeDeco.boxSize ?? ""}
                          onChange={(e) => handleNumInput("boxSize", e.target.value, true)}
                          className="bg-gray-900 border border-gray-850 rounded px-1.5 py-0.5 text-xs text-center w-16"
                          placeholder="0.7"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-0.5">Звук перемещения (moveSound):</span>
                        <div className="flex gap-1">
                          <CustomSelect
                            value={activeDeco.moveSound || ""}
                            onChange={(e) => {
                              if (e.target.value) updateField("moveSound", e.target.value);
                              else removeField("moveSound");
                            }}
                            className="flex-1 text-[11px] h-7"
                          >
                            <option value="">По умолчанию</option>
                            {soundOptions.map(id => (
                              <option key={id} value={id}>{id}</option>
                            ))}
                          </CustomSelect>
                          {activeDeco.moveSound && (
                            <button
                              onClick={() => playSound(activeDeco.moveSound!)}
                              className="p-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                              type="button"
                            >
                              <Volume2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-0.5">Звук падения (fallSound):</span>
                        <div className="flex gap-1">
                          <CustomSelect
                            value={activeDeco.fallSound || ""}
                            onChange={(e) => {
                              if (e.target.value) updateField("fallSound", e.target.value);
                              else removeField("fallSound");
                            }}
                            className="flex-1 text-[11px] h-7"
                          >
                            <option value="">По умолчанию</option>
                            {soundOptions.map(id => (
                              <option key={id} value={id}>{id}</option>
                            ))}
                          </CustomSelect>
                          {activeDeco.fallSound && (
                            <button
                              onClick={() => playSound(activeDeco.fallSound!)}
                              className="p-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                              type="button"
                            >
                              <Volume2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-0.5">Звук шага (stepSound):</span>
                        <div className="flex gap-1">
                          <CustomSelect
                            value={activeDeco.stepSound || ""}
                            onChange={(e) => {
                              if (e.target.value) updateField("stepSound", e.target.value);
                              else removeField("stepSound");
                            }}
                            className="flex-1 text-[11px] h-7"
                          >
                            <option value="">По умолчанию</option>
                            {soundOptions.map(id => (
                              <option key={id} value={id}>{id}</option>
                            ))}
                          </CustomSelect>
                          {activeDeco.stepSound && (
                            <button
                              onClick={() => playSound(activeDeco.stepSound!)}
                              className="p-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                              type="button"
                            >
                              <Volume2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ladder (LADDER) */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isLadderType"
                      checked={activeDeco.type === "LADDER"}
                      onChange={(e) => {
                        if (e.target.checked) updateField("type", "LADDER");
                        else {
                          removeField("type");
                          removeField("ladderSound");
                        }
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="isLadderType" className="text-xs font-bold text-gray-300 cursor-pointer">Лестница (LADDER)</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Позволяет вылезти из глубоких ям.</span>

                  {activeDeco.type === "LADDER" && (
                    <div className="flex flex-col mt-2 pt-2 border-t border-gray-800/40">
                      <label className="text-[10px] text-gray-400 mb-1">Звук подъёма (ladderSound)</label>
                      <div className="flex gap-1">
                        <CustomSelect
                          value={activeDeco.ladderSound || ""}
                          onChange={(e) => {
                            if (e.target.value) updateField("ladderSound", e.target.value);
                            else removeField("ladderSound");
                          }}
                          className="flex-1 text-[11px]"
                        >
                          <option value="">Без звука (по умолчанию)</option>
                          {soundOptions.map(id => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </CustomSelect>
                        {activeDeco.ladderSound && (
                          <button
                            onClick={() => playSound(activeDeco.ladderSound)}
                            className="p-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                            type="button"
                          >
                            <Volume2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* No Shadow (noShadow) */}
                <div className="bg-gray-900/40 border border-gray-850 p-2 rounded-lg flex flex-col">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="noShadow"
                      checked={activeDeco.noShadow === true}
                      onChange={(e) => {
                        if (e.target.checked) updateField("noShadow", true);
                        else removeField("noShadow");
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                    />
                    <label htmlFor="noShadow" className="text-xs font-bold text-gray-300 cursor-pointer">Без тени (noShadow)</label>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">Отключает отрисовку тени под декорацией.</span>
                </div>
              </div>
            </div>

            {/* Section: Mesh Rendering */}
            <div className="bg-gray-900/40 border border-gray-850 p-3 rounded-lg">
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                <Layers size={14} /> Рендеринг в качестве Плоского Меша
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="text-[11px] text-gray-400 mb-1">Режим рендеринга (renderMode)</label>
                  <CustomSelect
                    value={activeDeco.renderMode || ""}
                    onChange={(e) => {
                      if (e.target.value === "mesh") {
                        updateMultipleFields({
                          renderMode: "mesh",
                          meshAxis: "NS",
                          meshOffset: 0.5
                        });
                      } else {
                        updateMultipleFields({}, ["renderMode", "meshAxis", "meshOffset"]);
                      }
                    }}
                    className="w-full text-xs"
                  >
                    <option value="">Спрайт (Биллборд)</option>
                    <option value="mesh">Плоский Меш Стены (mesh)</option>
                  </CustomSelect>
                </div>

                {activeDeco.renderMode === "mesh" && (
                  <>
                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Ось (meshAxis)</label>
                      <CustomSelect
                        value={activeDeco.meshAxis || "NS"}
                        onChange={(e) => updateField("meshAxis", e.target.value)}
                        className="w-full text-xs"
                      >
                        <option value="NS">Север-Юг (NS)</option>
                        <option value="WE">Запад-Восток (WE)</option>
                        <option value="Y">На полу (Y)</option>
                      </CustomSelect>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[11px] text-gray-400 mb-1">Смещение (meshOffset)</label>
                      <input
                        type="text"
                        value={activeDeco.meshOffset ?? ""}
                        onChange={(e) => handleNumInput("meshOffset", e.target.value, true)}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-1.5 text-xs text-white"
                        placeholder="0.5"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Section: Destructible Property */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Hammer size={14} /> Разрушаемость (Destructable)
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-3 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="destructable"
                    checked={activeDeco.destructable === true}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateMultipleFields({
                          destructable: true,
                          hp: 1
                        });
                      } else {
                        updateMultipleFields({}, [
                          "destructable",
                          "hp",
                          "explode",
                          "explosion_damage",
                          "destroyedAssetId",
                          "deadScale",
                          "walkableWhenDestroyed",
                          "destructionSoundId",
                          "explodeSound"
                        ]);
                      }
                    }}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <label htmlFor="destructable" className="text-xs font-bold text-gray-300 cursor-pointer">
                    Объект можно сломать или уничтожить
                  </label>
                </div>

                {activeDeco.destructable === true && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800/40">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Очки прочности (HP)</label>
                        <input
                          type="text"
                          value={activeDeco.hp ?? ""}
                          onChange={(e) => handleNumInput("hp", e.target.value)}
                          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white w-24"
                          placeholder="1"
                        />
                      </div>

                      {/* Destroyed asset */}
                      <div className="flex items-center gap-3 bg-gray-950 p-2 rounded border border-gray-800">
                        <div className="w-12 h-12 bg-gray-900 rounded border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                          {getAssetPreviewUrl(activeDeco.destroyedAssetId) ? (
                            <img
                              src={getAssetPreviewUrl(activeDeco.destroyedAssetId)}
                              alt="destroyed"
                              className="max-w-full max-h-full object-contain pixelated"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-[9px] text-gray-600">Пусто</span>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                          <span className="text-[10px] text-gray-400">Спрайт обломков</span>
                          <span className="text-xs font-mono font-bold truncate text-indigo-300">
                            {activeDeco.destroyedAssetId || "Не задан"}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setPickingField("destroyedAssetId")}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                              type="button"
                            >
                              Выбрать
                            </button>
                            {activeDeco.destroyedAssetId && (
                              <button
                                onClick={() => removeField("destroyedAssetId")}
                                className="text-red-400 hover:text-red-300 text-[9px] font-bold px-1 py-0.5 uppercase"
                                type="button"
                              >
                                Сброс
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-gray-400">Масштаб обломков (deadScale)</label>
                        <input
                          type="text"
                          value={activeDeco.deadScale ?? ""}
                          onChange={(e) => handleNumInput("deadScale", e.target.value, true)}
                          className="bg-gray-900 border border-gray-850 rounded px-1.5 py-0.5 text-xs text-center w-16"
                          placeholder="1.0"
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          id="walkableWhenDestroyed"
                          checked={activeDeco.walkableWhenDestroyed === true}
                          onChange={(e) => updateField("walkableWhenDestroyed", e.target.checked)}
                          className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                        />
                        <label htmlFor="walkableWhenDestroyed" className="text-xs text-gray-400 cursor-pointer">
                          Можно проходить сквозь обломки
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-l border-gray-800/40 pl-0 md:pl-4">
                      {/* Destruction sound */}
                      <div className="flex flex-col">
                        <label className="text-[11px] text-gray-400 mb-1">Звук разрушения (destructionSoundId)</label>
                        <div className="flex gap-1">
                          <CustomSelect
                            value={activeDeco.destructionSoundId || ""}
                            onChange={(e) => {
                              if (e.target.value) updateField("destructionSoundId", e.target.value);
                              else removeField("destructionSoundId");
                            }}
                            className="flex-1 text-xs"
                          >
                            <option value="">Без звука</option>
                            {soundOptions.map(id => (
                              <option key={id} value={id}>{id}</option>
                            ))}
                          </CustomSelect>
                          {activeDeco.destructionSoundId && (
                            <button
                              onClick={() => playSound(activeDeco.destructionSoundId)}
                              className="p-1.5 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                              type="button"
                            >
                              <Volume2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Destruction Effects (Shattering & Explosion) */}
                      <div className="bg-gray-950 p-2.5 rounded border border-gray-800/80 mt-2 flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Эффекты разрушения</span>

                        {/* Shattering effect */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="explode"
                              checked={activeDeco.explode === true}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("explode", true);
                                } else {
                                  updateMultipleFields({}, ["explode", "explodeSound"]);
                                }
                              }}
                              className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                            />
                            <label htmlFor="explode" className="text-xs font-bold text-gray-300 cursor-pointer flex items-center gap-1">
                              Разлетается на куски при уничтожении (explode)
                            </label>
                          </div>

                          {activeDeco.explode === true && (
                            <div className="flex flex-col pl-5.5 gap-1.5">
                              <span className="text-[10px] text-gray-400">Звук разлетания осколков (explodeSound)</span>
                              <div className="flex gap-1">
                                <CustomSelect
                                  value={activeDeco.explodeSound || ""}
                                  onChange={(e) => {
                                    if (e.target.value) updateField("explodeSound", e.target.value);
                                    else removeField("explodeSound");
                                  }}
                                  className="flex-1 text-[11px]"
                                >
                                  <option value="">По умолчанию</option>
                                  {soundOptions.map(id => (
                                    <option key={id} value={id}>{id}</option>
                                  ))}
                                </CustomSelect>
                                {activeDeco.explodeSound && (
                                  <button
                                    onClick={() => playSound(activeDeco.explodeSound)}
                                    className="p-1.5 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                                    type="button"
                                  >
                                    <Volume2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Explosion effect */}
                        <div className="flex flex-col gap-2 border-t border-gray-900 pt-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="hasExplosion"
                              checked={activeDeco.explosion_damage !== undefined && activeDeco.explosion_damage !== ""}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateField("explosion_damage", "4d6");
                                } else {
                                  removeField("explosion_damage");
                                }
                              }}
                              className="w-3.5 h-3.5 accent-red-600 rounded bg-gray-900 cursor-pointer"
                            />
                            <label htmlFor="hasExplosion" className="text-xs font-bold text-red-400 cursor-pointer flex items-center gap-1">
                              <Flame size={12} /> Взрывается при поломке
                            </label>
                          </div>

                          {activeDeco.explosion_damage !== undefined && (
                            <div className="flex flex-col gap-1.5 pl-5.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400">Урон взрыва (dice)</span>
                                <input
                                  type="text"
                                  value={activeDeco.explosion_damage ?? ""}
                                  onChange={(e) => updateField("explosion_damage", e.target.value)}
                                  className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-center font-mono w-20 text-white focus:outline-none focus:border-red-500"
                                  placeholder="4d6"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Damaging / Hazard */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <ShieldAlert size={14} /> Периодический Урон / Ловушка (Damaging)
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-3 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="damaging"
                    checked={activeDeco.damaging === true}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateMultipleFields({
                          damaging: true,
                          damageDice: "2d5"
                        });
                      } else {
                        updateMultipleFields({}, [
                          "damaging",
                          "damageDice",
                          "lifeTime",
                          "noBleeding",
                          "soundId"
                        ]);
                      }
                    }}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <label htmlFor="damaging" className="text-xs font-bold text-gray-300 cursor-pointer">
                    Объект наносит периодический урон существам внутри него
                  </label>
                </div>

                {activeDeco.damaging === true && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-800/40">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 mb-0.5">Кубик урона (damageDice)</span>
                      <input
                        type="text"
                        value={activeDeco.damageDice ?? ""}
                        onChange={(e) => updateField("damageDice", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-white font-mono"
                        placeholder="2d5"
                      />
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 mb-0.5">Время жизни сек (lifeTime)</span>
                      <input
                        type="text"
                        value={activeDeco.lifeTime ?? ""}
                        onChange={(e) => handleNumInput("lifeTime", e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1 text-xs text-white"
                        placeholder="6"
                      />
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 mb-1">Звук работы (soundId)</span>
                      <div className="flex gap-1">
                        <CustomSelect
                          value={activeDeco.soundId || ""}
                          onChange={(e) => {
                            if (e.target.value) updateField("soundId", e.target.value);
                            else removeField("soundId");
                          }}
                          className="flex-1 text-xs"
                        >
                          <option value="">Без звука</option>
                          {soundOptions.map(id => (
                            <option key={id} value={id}>{id}</option>
                          ))}
                        </CustomSelect>
                        {activeDeco.soundId && (
                          <button
                            onClick={() => playSound(activeDeco.soundId)}
                            className="p-1.5 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded text-indigo-400 hover:text-indigo-300"
                            type="button"
                          >
                            <Volume2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1 col-span-1 md:col-span-3">
                      <input
                        type="checkbox"
                        id="noBleeding"
                        checked={activeDeco.noBleeding === true}
                        onChange={(e) => updateField("noBleeding", e.target.checked)}
                        className="w-3.5 h-3.5 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                      />
                      <label htmlFor="noBleeding" className="text-xs text-gray-400 cursor-pointer">
                        Без эффекта крови при получении урона (noBleeding)
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Light Source */}
            <div>
              <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 mb-2.5 border-b border-gray-850 pb-1.5 uppercase tracking-wide">
                <Sun size={14} /> Источник Света (Light Source)
              </h3>
              <div className="bg-gray-900/40 border border-gray-850 p-3 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasLight"
                    checked={activeDeco.light !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateField("light", {
                          r: 255,
                          g: 170,
                          b: 0,
                          intensity: 1.0,
                          range: 5,
                          mode: "STATIC"
                        });
                      } else {
                        removeField("light");
                      }
                    }}
                    className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                  />
                  <label htmlFor="hasLight" className="text-xs font-bold text-gray-300 cursor-pointer flex items-center gap-1">
                    Излучает динамический свет
                  </label>
                </div>

                {activeDeco.light !== undefined && (
                  <div className="flex flex-col gap-4 pt-2 border-t border-gray-800/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {/* Custom Color Picker for RGB values */}
                      <div className="flex flex-col justify-end">
                        <CustomColorPicker
                          color={rgbToHex(activeDeco.light?.r ?? 255, activeDeco.light?.g ?? 170, activeDeco.light?.b ?? 0)}
                          onChange={(hexColor) => {
                            const rgb = hexToRgb(hexColor);
                            updateMultipleFields({
                              "light.r": rgb.r,
                              "light.g": rgb.g,
                              "light.b": rgb.b
                            });
                          }}
                          label="Цвет света"
                        />
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-1">Яркость (intensity)</span>
                        <input
                          type="text"
                          value={activeDeco.light?.intensity ?? ""}
                          onChange={(e) => handleNumInput("light.intensity", e.target.value, true)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white"
                          placeholder="1.0"
                        />
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-1">Дальность (range / radius)</span>
                        <input
                          type="text"
                          value={activeDeco.light?.range ?? activeDeco.light?.radius ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              updateMultipleFields({}, ["light.range", "light.radius"]);
                            } else {
                              const val = parseFloat(raw);
                              if (!isNaN(val)) {
                                updateMultipleFields({
                                  "light.range": val,
                                  "light.radius": val
                                });
                              }
                            }
                          }}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white"
                          placeholder="5"
                        />
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-1">Высота/Кол-во этажей (maxHeight)</span>
                        <input
                          type="text"
                          value={activeDeco.light?.maxHeight ?? ""}
                          onChange={(e) => handleNumInput("light.maxHeight", e.target.value, false)}
                          className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white"
                          placeholder="0"
                        />
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 mb-1">Режим свечения (mode)</span>
                        <CustomSelect
                          value={activeDeco.light?.mode || "STATIC"}
                          onChange={(e) => {
                            const newMode = e.target.value;
                            if (newMode === "FLICKERING") {
                              updateMultipleFields({
                                "light.mode": "FLICKERING",
                                "light.flickerPeriod": 3000,
                                "light.flickerAlwaysOn": true
                              });
                            } else {
                              updateMultipleFields(
                                { "light.mode": newMode },
                                ["light.flickerPeriod", "light.flickerAlwaysOn"]
                              );
                            }
                          }}
                          className="w-full text-xs"
                        >
                          <option value="STATIC">Постоянный свет (STATIC)</option>
                          <option value="FIRE">Пламя костра (FIRE)</option>
                          <option value="FLICKERING">Мигающая лампа (FLICKERING)</option>
                        </CustomSelect>
                      </div>
                    </div>

                    {activeDeco.light?.mode === "FLICKERING" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-950/40 p-3 rounded-lg border border-gray-850/60 mt-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 mb-1">Интервал мигания, мс (flickerPeriod)</span>
                          <input
                            type="text"
                            value={activeDeco.light?.flickerPeriod ?? ""}
                            onChange={(e) => updateField("light.flickerPeriod", e.target.value)}
                            className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                            placeholder="3000"
                          />
                          <span className="text-[9px] text-gray-500 mt-0.5">Число (например, 3000) или диапазон (например, 3000-6000)</span>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <input
                            type="checkbox"
                            id="flickerAlwaysOn"
                            checked={activeDeco.light?.flickerAlwaysOn ?? true}
                            onChange={(e) => updateField("light.flickerAlwaysOn", e.target.checked)}
                            className="w-4 h-4 accent-indigo-600 rounded bg-gray-900 cursor-pointer"
                          />
                          <label htmlFor="flickerAlwaysOn" className="text-xs text-gray-400 cursor-pointer">
                            Горит постоянно между миганиями (flickerAlwaysOn)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 italic text-xs flex flex-col items-center gap-2">
            <HelpCircle size={32} className="opacity-40" />
            Выберите декорацию из списка слева или создайте новую, чтобы начать редактирование.
          </div>
        )}
      </div>
    </div>
  );
};
