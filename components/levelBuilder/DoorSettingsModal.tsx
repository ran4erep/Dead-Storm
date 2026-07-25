import React, { useState } from "react";
import { LevelDefinition } from "../../types";
import { X, Play } from "lucide-react";
import { resolveDoorBrushSymbol, getPreviewSrc, isTextureAsset } from "./levelBuilderUtils";
import itemsData from "../../data/items.json";
import soundsData from "../../data/sounds.json";
import { ASSETS } from "../../assets";
import { AssetPicker } from "./AssetPicker";
import { CustomSelect } from './CustomSelect';

interface DoorSettingsModalProps {
  show: boolean;
  onClose: () => void;
  brushConfig: any;
  setBrushConfig: (config: any) => void;
  level: LevelDefinition;
  setLevel: React.Dispatch<React.SetStateAction<LevelDefinition>>;
  uiStrings: any;
}

export const DoorSettingsModal: React.FC<DoorSettingsModalProps> = ({
  show,
  onClose,
  brushConfig,
  setBrushConfig,
  level,
  setLevel,
  uiStrings,
}) => {
  const [texturePickerTarget, setTexturePickerTarget] = useState<string | null>(null);

  if (!show) return null;

  const handleChange = (key: string, value: any) => {
    setBrushConfig((prev: any) => {
      const next = { ...prev, [key]: value };
      if (key === "type" && value !== "HINGE") {
        delete next.dir;
        delete next.edge;
      }
      return next;
    });
  };

  const playSoundPreview = (soundId: string) => {
    if (!soundId) return;
    const soundDef = (soundsData as any)[soundId];
    if (soundDef) {
      const idToPlay = soundDef.assetId || soundDef.alias;
      const url = idToPlay && ((ASSETS.SOUNDS as any)[idToPlay] || (ASSETS.SPRITES as any)[idToPlay]);
      if (url) {
        const audio = new Audio(url);
        audio.volume = soundDef.volume ?? 1.0;
        audio.play().catch((e) => console.log("Audio preview error:", e));
      }
    }
  };

  const handleApply = () => {
    if (brushConfig.symbol) {
      // If we are editing an existing symbol, update it directly in the level
      setLevel((prevLevel: LevelDefinition) => {
        const nextLevel = { ...prevLevel };
        if (nextLevel.doorDefinitions && nextLevel.doorDefinitions[brushConfig.symbol]) {
          nextLevel.doorDefinitions = {
            ...nextLevel.doorDefinitions,
            [brushConfig.symbol]: { ...brushConfig }
          };
        }
        return nextLevel;
      });
      // We also update the brushConfig in the parent so that it has the latest changes.
      setBrushConfig({ ...brushConfig });
    } else {
      // This is a new door (has no symbol yet), generate symbol and add to level
      const { symbol, newDoorConfig } = resolveDoorBrushSymbol(brushConfig, level);
      
      setLevel((prevLevel: LevelDefinition) => {
        const nextLevel = { ...prevLevel };
        const defs = nextLevel.doorDefinitions ? { ...nextLevel.doorDefinitions } : {};
        if (newDoorConfig) {
          defs[symbol] = newDoorConfig;
          nextLevel.doorDefinitions = defs;
        }
        return nextLevel;
      });
      
      // Update the parent's brush config with the new door
      if (newDoorConfig) {
        setBrushConfig(newDoorConfig);
      }
    }
    
    onClose();
  };

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
          {uiStrings.door_settings || "Door Settings"}
        </h2>

        {texturePickerTarget ? (
           <AssetPicker
               targetName={texturePickerTarget}
               uiStrings={uiStrings}
               onCancel={() => setTexturePickerTarget(null)}
               onSelect={(t) => {
                   if (texturePickerTarget === 'textureId') setBrushConfig({ ...brushConfig, textureId: t });
                   else if (texturePickerTarget === 'maskId') setBrushConfig({ ...brushConfig, maskId: t });
                   setTexturePickerTarget(null);
               }}
           />
        ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-24 shrink-0">
               <label className="block text-sm text-gray-400 mb-1">{uiStrings.symbol || 'Symbol'}</label>
               <input 
                   value={brushConfig.symbol || ''}
                   onChange={e => handleChange('symbol', e.target.value.charAt(0))}
                   placeholder="Auto"
                   className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-center font-bold"
               />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.type || "Type"}
              </label>
              <CustomSelect
                value={brushConfig.type || "HINGE"}
                onChange={(e) => handleChange("type", e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
              >
                <option value="HINGE">HINGE</option>
                <option value="SLIDE">SLIDE</option>
                <option value="LIFT">LIFT</option>
              </CustomSelect>
            </div>

            {(brushConfig.type || "HINGE") === "HINGE" && (
              <>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">
                    {uiStrings.edge || "Edge Attachment"}
                  </label>
                  <CustomSelect
                    value={brushConfig.edge || "AUTO"}
                    onChange={(e) => handleChange("edge", e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="AUTO">{uiStrings.door_edge_auto || 'Auto (By Walls)'}</option>
                    <option value="TOP">{uiStrings.door_edge_top || 'Top Edge'}</option>
                    <option value="BOTTOM">{uiStrings.door_edge_bottom || 'Bottom Edge'}</option>
                    <option value="LEFT">{uiStrings.door_edge_left || 'Left Edge'}</option>
                    <option value="RIGHT">{uiStrings.door_edge_right || 'Right Edge'}</option>
                  </CustomSelect>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">
                    {uiStrings.direction || "Direction"}
                  </label>
                  <CustomSelect
                    value={brushConfig.dir || "LEFT"}
                    onChange={(e) => handleChange("dir", e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="LEFT">{uiStrings.door_left || 'LEFT (Opens to Left)'}</option>
                    <option value="RIGHT">{uiStrings.door_right || 'RIGHT (Opens to Right)'}</option>
                  </CustomSelect>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.texture || "Texture (assetId)"}
              </label>
              <button 
                  onClick={() => setTexturePickerTarget('textureId')}
                  className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
              >
                  <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                      {brushConfig.textureId && getPreviewSrc(brushConfig.textureId) && (
                          <img src={getPreviewSrc(brushConfig.textureId)!} className={`w-full h-full ${isTextureAsset(brushConfig.textureId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                      )}
                  </div>
                  <span className="truncate">{brushConfig.textureId || uiStrings.select || 'Select...'}</span>
              </button>
            </div>

            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.mask || "Mask (maskId)"}
              </label>
              <button 
                  onClick={() => setTexturePickerTarget('maskId')}
                  className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
              >
                  <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                      {brushConfig.maskId && getPreviewSrc(brushConfig.maskId) && (
                          <img src={getPreviewSrc(brushConfig.maskId)!} className={`w-full h-full ${isTextureAsset(brushConfig.maskId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                      )}
                  </div>
                  <span className="truncate">{brushConfig.maskId || uiStrings.select || 'Select...'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.openSound || "Open Sound"}
              </label>
              <div className="flex gap-2">
                <CustomSelect
                  value={brushConfig.openSound || ""}
                  onChange={(e) => handleChange("openSound", e.target.value)}
                  className="flex-1 w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="">{uiStrings.default_sound || "Default (Sound)"}</option>
                  {Object.keys(soundsData).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </CustomSelect>
                {brushConfig.openSound && brushConfig.openSound !== "" && (
                  <button
                    onClick={() => playSoundPreview(brushConfig.openSound)}
                    className="px-3 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow"
                    title="Play Sound"
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.closeSound || "Close Sound"}
              </label>
              <div className="flex gap-2">
                <CustomSelect
                  value={brushConfig.closeSound || ""}
                  onChange={(e) => handleChange("closeSound", e.target.value)}
                  className="flex-1 w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="">{uiStrings.default_sound || "Default (Sound)"}</option>
                  {Object.keys(soundsData).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </CustomSelect>
                {brushConfig.closeSound && brushConfig.closeSound !== "" && (
                  <button
                    onClick={() => playSoundPreview(brushConfig.closeSound)}
                    className="px-3 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow"
                    title="Play Sound"
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4 mt-2">
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!brushConfig.isOpenedAtStart}
                  onChange={(e) => handleChange("isOpenedAtStart", e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span>{uiStrings.isOpenedAtStart || "Opened at start"}</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!brushConfig.isLocked}
                  onChange={(e) => handleChange("isLocked", e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span>{uiStrings.isLocked || "Locked with electronic lock"}</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!brushConfig.closed}
                  onChange={(e) => handleChange("closed", e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span>{uiStrings.closed || "Permanently Closed (Cannot be opened)"}</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!brushConfig.nonInteractable}
                  onChange={(e) => handleChange("nonInteractable", e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span>{uiStrings.nonInteractable || "Script-controlled (Non-interactable by player)"}</span>
              </label>
            </div>

            {brushConfig.isLocked && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {uiStrings.door_id || "Door ID (for keypads)"}
                </label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                  value={brushConfig.id || ""}
                  onChange={(e) => handleChange("id", e.target.value)}
                  placeholder="ID (e.g. door1)"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {uiStrings.keyId || "Key to this door"}
              </label>
              <input
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                value={brushConfig.keyId || ""}
                onChange={(e) => handleChange("keyId", e.target.value)}
                placeholder="ID"
              />
            </div>
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
