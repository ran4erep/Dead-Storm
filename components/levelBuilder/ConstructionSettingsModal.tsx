import React, { useState, useEffect, useMemo } from 'react';
import { X, Play } from 'lucide-react';
import { ASSETS } from '../../assets';
import { LevelDefinition } from '../../types';
import soundsData from '../../data/sounds.json';
import { resolveBrushSymbol, getPreviewSrc, isTextureAsset } from './levelBuilderUtils';
import { AssetPicker } from './AssetPicker';
import { CustomSelect } from './CustomSelect';

import { NumericInput } from './NumericInput';

interface ConstructionSettingsModalProps {
    show: boolean;
    onClose: () => void;
    brushConfig: any;
    setBrushConfig: (config: any) => void;
    level: LevelDefinition;
    setLevel: (lvl: LevelDefinition) => void;
    uiStrings: any;
    onPickCoordinate?: (callback: (x: number, y: number) => void) => void;
}

export const ConstructionSettingsModal: React.FC<ConstructionSettingsModalProps> = ({
    show, onClose, brushConfig, setBrushConfig, level, setLevel, uiStrings, onPickCoordinate
}) => {
    const soundOptions = useMemo(() => Object.keys(soundsData).filter(key => !(soundsData as any)[key]?.alias), []);
    const [texturePickerTarget, setTexturePickerTarget] = useState<string | null>(null);

    // Initialize cutout coordinates and cutout axis if they are undefined for window types
    useEffect(() => {
        if (show && brushConfig && brushConfig.type === 'window') {
            if (!brushConfig.cutout || !brushConfig.cutoutAxis) {
                setBrushConfig({
                    ...brushConfig,
                    cutout: brushConfig.cutout || {
                        topLeft: { x: 0.25, y: 0.25 },
                        bottomRight: { x: 0.75, y: 0.75 }
                    },
                    cutoutAxis: brushConfig.cutoutAxis || 'NS'
                });
            }
        }
    }, [show, brushConfig?.type]);

    const playSoundPreview = (soundId: string) => {
        if (!soundId) return;
        const soundDef = (soundsData as any)[soundId];
        if (soundDef) {
            const idToPlay = soundDef.assetId || soundDef.alias;
            const url = idToPlay && ((ASSETS.SOUNDS as any)[idToPlay] || (ASSETS.SPRITES as any)[idToPlay]);
            if (url) {
                const audio = new Audio(url);
                audio.volume = soundDef.volume || 1;
                audio.play();
            }
        }
    };

    if (!show) return null;

    return (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-[300]">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90dvh] overflow-y-auto relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                   <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4">{uiStrings.construction_settings || 'Construction Settings'}</h2>
                
                {texturePickerTarget ? (
                   <AssetPicker
                       targetName={texturePickerTarget}
                       uiStrings={uiStrings}
                       onCancel={() => setTexturePickerTarget(null)}
                       onSelect={(t) => {
                           if (t === '') {
                               if (texturePickerTarget === 'base') setBrushConfig({ ...brushConfig, assetId: '' });
                               else if (texturePickerTarget === 'bottom') setBrushConfig({ ...brushConfig, bottomTextureId: '' });
                               else if (texturePickerTarget === 'top') {
                                   setBrushConfig({ ...brushConfig, topTextureId: '', topTextureRotation: undefined });
                               }
                               else if (texturePickerTarget === 'floorAssetId') setBrushConfig({ ...brushConfig, floorAssetId: '' });
                               else if (texturePickerTarget === 'keypadAssetId') setBrushConfig({ ...brushConfig, keypadAssetId: '' });
                               else if (texturePickerTarget === 'keypadMaskAssetId') setBrushConfig({ ...brushConfig, keypadMaskAssetId: '' });
                               else if (texturePickerTarget === 'maskId') setBrushConfig({ ...brushConfig, maskId: '' });
                               else if (texturePickerTarget === 'maskTargetAsset') setBrushConfig({ ...brushConfig, maskTargetAsset: '' });
                               else if (texturePickerTarget === 'glassAssetId') setBrushConfig({ ...brushConfig, glassAssetId: '' });
                               else {
                                  const faces = { ...brushConfig.faces };
                                  delete faces[texturePickerTarget];
                                  setBrushConfig({ ...brushConfig, faces });
                               }
                           } else {
                               if (texturePickerTarget === 'base') setBrushConfig({ ...brushConfig, assetId: t });
                               else if (texturePickerTarget === 'bottom') setBrushConfig({ ...brushConfig, bottomTextureId: t });
                               else if (texturePickerTarget === 'top') setBrushConfig({ ...brushConfig, topTextureId: t });
                               else if (texturePickerTarget === 'floorAssetId') setBrushConfig({ ...brushConfig, floorAssetId: t });
                               else if (texturePickerTarget === 'keypadAssetId') setBrushConfig({ ...brushConfig, keypadAssetId: t });
                               else if (texturePickerTarget === 'keypadMaskAssetId') setBrushConfig({ ...brushConfig, keypadMaskAssetId: t });
                               else if (texturePickerTarget === 'maskId') setBrushConfig({ ...brushConfig, maskId: t });
                               else if (texturePickerTarget === 'maskTargetAsset') setBrushConfig({ ...brushConfig, maskTargetAsset: t });
                               else if (texturePickerTarget === 'glassAssetId') setBrushConfig({ ...brushConfig, glassAssetId: t });
                               else {
                                  const faces = { ...brushConfig.faces };
                                  faces[texturePickerTarget] = t;
                                  setBrushConfig({ ...brushConfig, faces });
                               }
                           }
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
                                   onChange={e => setBrushConfig({ ...brushConfig, symbol: e.target.value.charAt(0) })}
                                   placeholder="Auto"
                                   className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-center font-bold"
                               />
                           </div>
                           <div className="flex-1">
                               <label className="block text-sm text-gray-400 mb-1">{uiStrings.type || 'Type'}</label>
                               <CustomSelect 
                                   value={brushConfig.type || 'wall'}
                                   onChange={e => setBrushConfig(prev => (() => {
                                        const newType = e.target.value;
                                        const cleanConfig = { ...prev, type: newType };
                                        delete cleanConfig.height;
                                        if (newType === 'floor') {
                                            delete cleanConfig.canBeDestroyed;
                                            delete cleanConfig.blocking;
                                            delete cleanConfig.keylock;
                                            delete cleanConfig.mirror;
                                            delete cleanConfig.mirrorOpacity;
                                            delete cleanConfig.maskId;
                                            delete cleanConfig.maskTargetAsset;
                                            delete cleanConfig.bottomTextureId;
                                            delete cleanConfig.topTextureId;
                                            delete cleanConfig.topTextureRotation;
                                            delete cleanConfig.faces;
                                            delete cleanConfig.keypadDirection;
                                            delete cleanConfig.password;
                                            delete cleanConfig.targetId;
                                            delete cleanConfig.keypadAssetId;
                                            delete cleanConfig.keypadMaskAssetId;
                                            delete cleanConfig.keypadSound;
                                            delete cleanConfig.keypadSuccessSound;
                                            delete cleanConfig.keypadFailSound;
                                            delete cleanConfig.cutout;
                                            delete cleanConfig.glassAssetId;
                                            delete cleanConfig.cutoutAxis;
                                            delete cleanConfig.thickness;
                                            delete cleanConfig.offset;
                                            delete cleanConfig.glassTransparency;
                                            delete cleanConfig.glassOffset;
                                            delete cleanConfig.glassBreakSound;
                                        } else if (newType === 'wall') {
                                            delete cleanConfig.isWater;
                                            delete cleanConfig.footstepSound;
                                            delete cleanConfig.fallSound;
                                            delete cleanConfig.cutout;
                                            delete cleanConfig.glassAssetId;
                                            delete cleanConfig.cutoutAxis;
                                            delete cleanConfig.thickness;
                                            delete cleanConfig.offset;
                                            delete cleanConfig.glassTransparency;
                                            delete cleanConfig.glassOffset;
                                            delete cleanConfig.glassBreakSound;
                                        } else if (newType === 'window') {
                                            delete cleanConfig.isWater;
                                            delete cleanConfig.footstepSound;
                                            delete cleanConfig.fallSound;
                                            delete cleanConfig.keylock;
                                            delete cleanConfig.mirror;
                                            delete cleanConfig.mirrorOpacity;
                                            delete cleanConfig.maskId;
                                            delete cleanConfig.maskTargetAsset;
                                            delete cleanConfig.keypadDirection;
                                            delete cleanConfig.password;
                                            delete cleanConfig.targetId;
                                            delete cleanConfig.keypadAssetId;
                                            delete cleanConfig.keypadMaskAssetId;
                                            delete cleanConfig.keypadSound;
                                            delete cleanConfig.keypadSuccessSound;
                                            delete cleanConfig.keypadFailSound;
                                        }
                                        return cleanConfig;
                                    })())}
                                   className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                               >
                                   <option value="wall">{uiStrings.tool_wall || 'Wall'}</option>
                                   <option value="floor">{uiStrings.tool_floor || 'Floor'}</option>
                                   <option value="window">{uiStrings.tool_window || 'Window'}</option>
                               </CustomSelect>
                           </div>
                           <div className="flex-1">
                               <label className="block text-sm text-gray-400 mb-1">
                                   {brushConfig.type === 'floor' ? (uiStrings.elevation || 'Elevation') : (uiStrings.height || 'Height')}
                               </label>
                               <NumericInput 
                                    value={brushConfig.height}
                                    placeholder={brushConfig.type === 'floor' ? '0.0' : '1.0'}
                                    onChange={val => {
                                        setBrushConfig({ ...brushConfig, height: val });
                                    }}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-white"
                                />
                           </div>
                           <div className="flex-1">
                               <label className="block text-sm text-gray-400 mb-1">{uiStrings.base_texture || 'Base Texture'}</label>
                               <button 
                                   onClick={() => setTexturePickerTarget('base')}
                                   className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                               >
                                   <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                       {brushConfig.assetId && getPreviewSrc(brushConfig.assetId) && (
                                           <img src={getPreviewSrc(brushConfig.assetId)!} className={`w-full h-full ${isTextureAsset(brushConfig.assetId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                       )}
                                   </div>
                                   <span className="truncate">{brushConfig.assetId || uiStrings.select || 'Select...'}</span>
                               </button>
                           </div>
                       </div>
                       
                       {brushConfig.type === 'floor' && (
                           <div className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4">
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.isWater ?? false}
                                           onChange={e => setBrushConfig({ ...brushConfig, isWater: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.is_water || 'Is Water'}</span>
                                   </label>
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.ladder ?? false}
                                           onChange={e => setBrushConfig({ ...brushConfig, ladder: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.ladder || 'Requires Ladder (Pits)'}</span>
                                   </label>
                               </div>
                           </div>
                       )}

                       {brushConfig.type === 'wall' && (
                           <div className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4">
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.canBeDestroyed ?? true}
                                           onChange={e => setBrushConfig({ ...brushConfig, canBeDestroyed: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.can_be_destroyed || 'Can Be Destroyed'}</span>
                                   </label>
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.blocking !== false}
                                           onChange={e => setBrushConfig({ ...brushConfig, blocking: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.blocking || 'Blocks Movement'}</span>
                                   </label>
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.keylock ?? false}
                                           onChange={e => setBrushConfig({ ...brushConfig, keylock: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.has_keylock || 'Has Keylock'}</span>
                                   </label>
                                   <label className="flex items-center gap-2 cursor-pointer">
                                       <input 
                                           type="checkbox"
                                           checked={brushConfig.mirror ?? false}
                                           onChange={e => setBrushConfig({ ...brushConfig, mirror: e.target.checked })}
                                           className="accent-indigo-500 w-4 h-4"
                                       />
                                       <span>{uiStrings.is_mirror || 'Is Mirror'}</span>
                                   </label>
                               </div>

                               {brushConfig.mirror && (
                                   <div className="p-3 bg-gray-800 rounded border border-gray-700 flex flex-col gap-3">
                                       <label className="block text-sm text-gray-400">{uiStrings.mirror_settings || 'Mirror Settings'}</label>
                                       <div className="flex flex-col sm:flex-row gap-2">
                                           <div className="flex-1">
                                               <span className="text-xs text-gray-500">{uiStrings.opacity || 'Opacity (0-1)'}</span>
                                               <NumericInput 
                                                    value={brushConfig.mirrorOpacity}
                                                    placeholder="0.5"
                                                    onChange={val => {
                                                        setBrushConfig({ ...brushConfig, mirrorOpacity: val });
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm text-white"
                                                />
                                           </div>
                                           <div className="flex-1">
                                                <span className="text-xs text-gray-500">{uiStrings.mask_id || 'Mask ID'}</span>
                                                <button onClick={() => setTexturePickerTarget('maskId')} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs truncate">
                                                    {brushConfig.maskId || (uiStrings.none || 'None')}
                                                </button>
                                           </div>
                                           <div className="flex-1">
                                                <span className="text-xs text-gray-500">{uiStrings.mask_target_asset || 'Target Asset'}</span>
                                                <button onClick={() => setTexturePickerTarget('maskTargetAsset')} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs truncate">
                                                    {brushConfig.maskTargetAsset || (uiStrings.none || 'None')}
                                                </button>
                                           </div>
                                       </div>
                                   </div>
                               )}

                               {brushConfig.keylock && (
                                   <div className="p-3 bg-gray-800 rounded border border-gray-700 flex flex-col gap-3">
                                       <label className="block text-sm text-amber-400 font-bold">{uiStrings.keylock_settings || 'Keylock Settings'}</label>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                           <div>
                                               <span className="text-xs text-gray-500">{uiStrings.direction || 'Direction'}</span>
                                               <CustomSelect 
                                                   value={brushConfig.keypadDirection || 'N'}
                                                   onChange={e => setBrushConfig(prev => ({...prev, keypadDirection: e.target.value}))}
                                                   className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                               >
                                                   <option value="N">North</option>
                                                   <option value="E">East</option>
                                                   <option value="S">South</option>
                                                   <option value="W">West</option>
                                               </CustomSelect>
                                           </div>
                                           <div>
                                               <span className="text-xs text-gray-500">{uiStrings.password || 'Password'}</span>
                                               <input 
                                                   value={brushConfig.password || ''}
                                                   onChange={e => setBrushConfig({ ...brushConfig, password: e.target.value })}
                                                   className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                               />
                                           </div>
                                           <div className="col-span-1 sm:col-span-2">
                                               <span className="text-xs text-gray-500">{uiStrings.target_id || 'Target ID (Door)'}</span>
                                               <div className="flex gap-2">
                                                   <input 
                                                       value={brushConfig.targetId || ''}
                                                       onChange={e => setBrushConfig({ ...brushConfig, targetId: e.target.value })}
                                                       className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                   />
                                                   {onPickCoordinate && (
                                                       <button 
                                                           onClick={() => {
                                                               onPickCoordinate((x, y) => {
                                                                   // Find door ID from coordinates
                                                                   let foundId = '';
                                                                   if (level.grids && level.grids[0]) {
                                                                       const row = level.grids[0][y];
                                                                       if (row) {
                                                                           const symbol = row[x];
                                                                           if (symbol && level.doorDefinitions && level.doorDefinitions[symbol]) {
                                                                               foundId = level.doorDefinitions[symbol].id || symbol;
                                                                           } else {
                                                                                // If it's another wall with targetId? No, mostly door.
                                                                                foundId = symbol; // fallback
                                                                           }
                                                                       }
                                                                   }
                                                                   setBrushConfig(prev => ({ ...prev, targetId: foundId }));
                                                               });
                                                               onClose(); // Need to wait for click, wait, onClose might conflict.
                                                               // The user will be back to Level Builder, they click, then callback is called,
                                                               // but ConstructionSettingsModal will be closed. 
                                                               // However we want it to reopen? In scripts it just updates the level.
                                                               // To keep it simple, it updates the state, but we need to re-open or they just open it manually to verify.
                                                               // Or we don't close? onPickCoordinate just closes the modal, sets picker mode, and when picker finishes, it doesn't automatically reopen the UI unless we instruct it. The `brushConfig` state is local here. We should actually update it in the callback and wait for the user. Oh right, if the modal is closed, the local state is lost unless it's synced. 
                                                               // Wait, ConstructionSettingsModal has local state `brushConfig`. But it is passed from parent! `setBrushConfig` is a parent prop! So it's safe to close!
                                                           }}
                                                           className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded min-w-[32px] flex justify-center text-white flex-shrink-0 items-center transition-colors"
                                                           title="Pick door from map"
                                                       >
                                                           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                                       </button>
                                                   )}
                                               </div>
                                           </div>
                                           <div>
                                               <span className="text-xs text-gray-500">{uiStrings.keypad_asset || 'Keypad Asset'}</span>
                                               <button onClick={() => setTexturePickerTarget('keypadAssetId')} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs truncate">
                                                    {brushConfig.keypadAssetId || (uiStrings.none || 'None')}
                                               </button>
                                           </div>
                                           <div>
                                               <span className="text-xs text-gray-500">{uiStrings.keypad_mask_asset || 'Keypad Mask'}</span>
                                               <button onClick={() => setTexturePickerTarget('keypadMaskAssetId')} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs truncate">
                                                    {brushConfig.keypadMaskAssetId || (uiStrings.none || 'None')}
                                               </button>
                                           </div>
                                           <div className="col-span-1 sm:col-span-2">
                                               <span className="text-xs text-gray-500">{uiStrings.keypad_sound || 'Keypad Sound'}</span>
                                               <div className="flex gap-2">
                                                   <CustomSelect 
                                                       value={brushConfig.keypadSound || ''}
                                                       onChange={e => setBrushConfig(prev => ({...prev, keypadSound: e.target.value}))}
                                                       className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                   >
                                                       <option value="">{uiStrings.none || 'None'}</option>
                                                       {soundOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                   </CustomSelect>
                                                   {brushConfig.keypadSound && (
                                                       <button onClick={() => playSoundPreview(brushConfig.keypadSound)} className="px-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow">
                                                           <Play size={14} fill="currentColor" />
                                                       </button>
                                                   )}
                                               </div>
                                           </div>
                                           <div className="col-span-1 sm:col-span-2">
                                               <span className="text-xs text-gray-500">{uiStrings.keypad_success_sound || 'Success Sound'}</span>
                                               <div className="flex gap-2">
                                                   <CustomSelect 
                                                       value={brushConfig.keypadSuccessSound || ''}
                                                       onChange={e => setBrushConfig(prev => ({...prev, keypadSuccessSound: e.target.value}))}
                                                       className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                   >
                                                       <option value="">{uiStrings.none || 'None'}</option>
                                                       {soundOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                   </CustomSelect>
                                                   {brushConfig.keypadSuccessSound && (
                                                       <button onClick={() => playSoundPreview(brushConfig.keypadSuccessSound)} className="px-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow">
                                                           <Play size={14} fill="currentColor" />
                                                       </button>
                                                   )}
                                               </div>
                                           </div>
                                           <div className="col-span-1 sm:col-span-2">
                                               <span className="text-xs text-gray-500">{uiStrings.keypad_fail_sound || 'Fail Sound'}</span>
                                               <div className="flex gap-2">
                                                   <CustomSelect 
                                                       value={brushConfig.keypadFailSound || ''}
                                                       onChange={e => setBrushConfig(prev => ({...prev, keypadFailSound: e.target.value}))}
                                                       className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                   >
                                                       <option value="">{uiStrings.none || 'None'}</option>
                                                       {soundOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                   </CustomSelect>
                                                   {brushConfig.keypadFailSound && (
                                                       <button onClick={() => playSoundPreview(brushConfig.keypadFailSound)} className="px-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow">
                                                           <Play size={14} fill="currentColor" />
                                                       </button>
                                                   )}
                                               </div>
                                           </div>
                                       </div>
                                   </div>
                               )}

                               <div>
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.bottom_texture || 'Bottom Texture (Optional)'}</label>
                                   <button 
                                       onClick={() => setTexturePickerTarget('bottom')}
                                       className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                                   >
                                       <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                           {brushConfig.bottomTextureId && getPreviewSrc(brushConfig.bottomTextureId) && (
                                               <img src={getPreviewSrc(brushConfig.bottomTextureId)!} className={`w-full h-full ${isTextureAsset(brushConfig.bottomTextureId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                           )}
                                       </div>
                                       <span className="truncate text-gray-500">{brushConfig.bottomTextureId || (uiStrings.none_base || 'None (Use base for full height)')}</span>
                                   </button>
                               </div>

                               <div>
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.top_texture || 'Top Texture (Optional)'}</label>
                                   <button 
                                       onClick={() => setTexturePickerTarget('top')}
                                       className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                                   >
                                       <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                           {brushConfig.topTextureId && getPreviewSrc(brushConfig.topTextureId) && (
                                               <img src={getPreviewSrc(brushConfig.topTextureId)!} className={`w-full h-full ${isTextureAsset(brushConfig.topTextureId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                           )}
                                       </div>
                                       <span className="truncate text-gray-500">{brushConfig.topTextureId || (uiStrings.none_base || 'None (Use base for full height)')}</span>
                                   </button>
                               </div>

                               {brushConfig.topTextureId && (
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.top_texture_rotation || 'Top Texture Rotation'}</label>
                                       <CustomSelect 
                                           value={brushConfig.topTextureRotation !== undefined ? brushConfig.topTextureRotation.toString() : '0'}
                                           onChange={e => setBrushConfig({ ...brushConfig, topTextureRotation: parseInt(e.target.value, 10) })}
                                           className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                                       >
                                           <option value="0">0°</option>
                                           <option value="90">90°</option>
                                           <option value="180">180°</option>
                                           <option value="270">270°</option>
                                       </CustomSelect>
                                   </div>
                               )}

                               <div>
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.floor_under_texture || 'Floor Under Wall (Optional)'}</label>
                                   <button 
                                       onClick={() => setTexturePickerTarget('floorAssetId')}
                                       className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                                   >
                                       <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                           {brushConfig.floorAssetId && getPreviewSrc(brushConfig.floorAssetId) && (
                                               <img src={getPreviewSrc(brushConfig.floorAssetId)!} className={`w-full h-full ${isTextureAsset(brushConfig.floorAssetId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                           )}
                                       </div>
                                       <span className="truncate text-gray-500">{brushConfig.floorAssetId || (uiStrings.none || 'None')}</span>
                                   </button>
                               </div>

                               <div>
                                   <label className="block text-sm text-gray-400 mb-2">{uiStrings.side_textures || 'Side Textures (Overrides)'}</label>
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                       {['N', 'E', 'S', 'W'].map(face => (
                                           <div key={face} className="flex gap-2 items-center">
                                               <span className="font-bold w-4">{face}</span>
                                               <button 
                                                   onClick={() => setTexturePickerTarget(face)}
                                                   className="flex-1 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-2 py-1 text-left flex items-center gap-2 text-sm"
                                               >
                                                   <div className="w-5 h-5 bg-black rounded shrink-0 overflow-hidden flex items-center justify-center text-[8px]">
                                                       {brushConfig.faces?.[face] && getPreviewSrc(brushConfig.faces[face]) ? (
                                                           <img src={getPreviewSrc(brushConfig.faces[face])!} className={`w-full h-full ${isTextureAsset(brushConfig.faces[face]) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                                       ) : '?'}
                                                   </div>
                                                   <span className="truncate text-gray-400">{brushConfig.faces?.[face] || (uiStrings.default || 'Default')}</span>
                                               </button>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           </div>
                       )}

                       {brushConfig.type === 'window' && (
                           <div className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4">
                               <div className="flex flex-col md:flex-row gap-4 items-center">
                                   <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                                       <div>
                                           <label className="block text-sm text-gray-400 mb-1">{uiStrings.cutout_tl || 'Top Left Cutout (X, Y 0.0-1.0)'}</label>
                                       <div className="flex gap-2">
                                            <NumericInput 
                                                value={brushConfig.cutout?.topLeft?.x !== undefined ? brushConfig.cutout.topLeft.x : 0.25}
                                                onChange={val => {
                                                    const currentCutout = brushConfig.cutout || { topLeft: { x: 0.25, y: 0.25 }, bottomRight: { x: 0.75, y: 0.75 } }; setBrushConfig({ ...brushConfig, cutout: { ...currentCutout, topLeft: { ...currentCutout.topLeft, x: val !== undefined ? val : 0.25 } } });
                                                }}
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                placeholder="X"
                                            />
                                            <NumericInput 
                                                value={brushConfig.cutout?.topLeft?.y !== undefined ? brushConfig.cutout.topLeft.y : 0.25}
                                                onChange={val => {
                                                    const currentCutout = brushConfig.cutout || { topLeft: { x: 0.25, y: 0.25 }, bottomRight: { x: 0.75, y: 0.75 } }; setBrushConfig({ ...brushConfig, cutout: { ...currentCutout, topLeft: { ...currentCutout.topLeft, y: val !== undefined ? val : 0.25 } } });
                                                }}
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                placeholder="Y"
                                            />
                                       </div>
                                   </div>
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.cutout_br || 'Bottom Right Cutout (X, Y 0.0-1.0)'}</label>
                                       <div className="flex gap-2">
                                            <NumericInput 
                                                value={brushConfig.cutout?.bottomRight?.x !== undefined ? brushConfig.cutout.bottomRight.x : 0.75}
                                                onChange={val => {
                                                    const currentCutout = brushConfig.cutout || { topLeft: { x: 0.25, y: 0.25 }, bottomRight: { x: 0.75, y: 0.75 } }; setBrushConfig({ ...brushConfig, cutout: { ...currentCutout, bottomRight: { ...currentCutout.bottomRight, x: val !== undefined ? val : 0.75 } } });
                                                }}
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                placeholder="X"
                                            />
                                            <NumericInput 
                                                value={brushConfig.cutout?.bottomRight?.y !== undefined ? brushConfig.cutout.bottomRight.y : 0.75}
                                                onChange={val => {
                                                    const currentCutout = brushConfig.cutout || { topLeft: { x: 0.25, y: 0.25 }, bottomRight: { x: 0.75, y: 0.75 } }; setBrushConfig({ ...brushConfig, cutout: { ...currentCutout, bottomRight: { ...currentCutout.bottomRight, y: val !== undefined ? val : 0.75 } } });
                                                }}
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 outline-none text-sm"
                                                placeholder="Y"
                                            />
                                       </div>
                                   </div>
                                    </div>
                                   {(() => {
                                        const tlX = brushConfig.cutout?.topLeft?.x !== undefined && brushConfig.cutout.topLeft.x !== '' ? parseFloat(brushConfig.cutout.topLeft.x as any) : 0.25;
                                        const tlY = brushConfig.cutout?.topLeft?.y !== undefined && brushConfig.cutout.topLeft.y !== '' ? parseFloat(brushConfig.cutout.topLeft.y as any) : 0.25;
                                        const brX = brushConfig.cutout?.bottomRight?.x !== undefined && brushConfig.cutout.bottomRight.x !== '' ? parseFloat(brushConfig.cutout.bottomRight.x as any) : 0.75;
                                        const brY = brushConfig.cutout?.bottomRight?.y !== undefined && brushConfig.cutout.bottomRight.y !== '' ? parseFloat(brushConfig.cutout.bottomRight.y as any) : 0.75;

                                        const safeTlX = isNaN(tlX) ? 0.25 : Math.max(0, Math.min(1, tlX));
                                        const safeTlY = isNaN(tlY) ? 0.25 : Math.max(0, Math.min(1, tlY));
                                        const safeBrX = isNaN(brX) ? 0.75 : Math.max(0, Math.min(1, brX));
                                        const safeBrY = isNaN(brY) ? 0.75 : Math.max(0, Math.min(1, brY));

                                        const cutoutLeft = `${safeTlX * 100}%`;
                                        const cutoutTop = `${safeTlY * 100}%`;
                                        const cutoutWidth = `${Math.max(0, safeBrX - safeTlX) * 100}%`;
                                        const cutoutHeight = `${Math.max(0, safeBrY - safeTlY) * 100}%`;

                                        return (
                                            <div className="w-24 h-24 bg-gray-950 border border-gray-700 rounded relative shrink-0 overflow-hidden flex items-center justify-center md:self-end self-center mb-1" style={{ imageRendering: 'pixelated' }}>
                                                {brushConfig.assetId && getPreviewSrc(brushConfig.assetId) && (
                                                    <img 
                                                        draggable={false}
                                                        src={getPreviewSrc(brushConfig.assetId)!} 
                                                        style={{ imageRendering: "pixelated" }} 
                                                        className="absolute inset-0 w-full h-full object-cover opacity-50" 
                                                        alt="" 
                                                    />
                                                )}
                                                <div 
                                                    className="absolute border border-cyan-400 bg-cyan-900/40" 
                                                    style={{
                                                        left: cutoutLeft,
                                                        top: cutoutTop,
                                                        width: cutoutWidth,
                                                        height: cutoutHeight,
                                                    }}
                                                >
                                                    {brushConfig.glassAssetId && getPreviewSrc(brushConfig.glassAssetId) && (
                                                        <img 
                                                            draggable={false}
                                                            src={getPreviewSrc(brushConfig.glassAssetId)!} 
                                                            style={{ imageRendering: "pixelated" }} 
                                                            className="w-full h-full object-cover opacity-80" 
                                                            alt="" 
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                               </div>

                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.glass_tex || 'Glass Texture (Inner)'}</label>
                                       <button 
                                           onClick={() => setTexturePickerTarget('glassAssetId')}
                                           className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                                       >
                                            <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                                {brushConfig.glassAssetId && getPreviewSrc(brushConfig.glassAssetId) && (
                                                    <img src={getPreviewSrc(brushConfig.glassAssetId)!} className={`w-full h-full ${isTextureAsset(brushConfig.glassAssetId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                                )}
                                            </div>
                                            <span className="truncate text-gray-500">{brushConfig.glassAssetId || (uiStrings.none || 'None')}</span>
                                       </button>
                                   </div>
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.cutout_axis || 'Cutout Axis'}</label>
                                       <CustomSelect 
                                           value={brushConfig.cutoutAxis || 'NS'}
                                           onChange={e => setBrushConfig(prev => ({ ...prev, cutoutAxis: (e.target.value as 'NS'|'WE'|'AUTO') || 'NS' }))}
                                           className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-sm"
                                       >
                                            <option value="NS">{uiStrings.cutout_axis_ns || 'North-South Axis'}</option>
                                            <option value="WE">{uiStrings.cutout_axis_we || 'West-East Axis'}</option>
                                            <option value="AUTO">{uiStrings.cutout_axis_auto || 'Auto'}</option>
                                       </CustomSelect>
                                   </div>
                               </div>

                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.window_thickness || 'Thickness (0-1)'}</label>
                                       <NumericInput 
                                           value={brushConfig.thickness}
                                           placeholder="1.0"
                                           onChange={val => {
                                               setBrushConfig({ ...brushConfig, thickness: val });
                                           }}
                                           className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-sm"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-sm text-gray-400 mb-1">{uiStrings.window_offset || 'Offset (0-1)'}</label>
                                       <NumericInput 
                                           value={brushConfig.offset}
                                           placeholder="0.0"
                                           onChange={val => {
                                               setBrushConfig({ ...brushConfig, offset: val });
                                           }}
                                           className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-sm"
                                       />
                                   </div>
                               </div>

                               <div className="mt-4">
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.window_floor_texture || 'Floor Under Window (Optional)'}</label>
                                   <button 
                                       onClick={() => setTexturePickerTarget('floorAssetId')}
                                       className="w-full bg-gray-900 border border-gray-700 hover:border-gray-500 rounded px-3 py-2 text-left flex items-center gap-2"
                                   >
                                       <div className="w-6 h-6 bg-black rounded shrink-0 overflow-hidden">
                                           {brushConfig.floorAssetId && getPreviewSrc(brushConfig.floorAssetId) && (
                                               <img src={getPreviewSrc(brushConfig.floorAssetId)!} className={`w-full h-full ${isTextureAsset(brushConfig.floorAssetId) ? 'object-cover' : 'object-contain'}`} style={{ imageRendering: 'pixelated' }} alt="" />
                                           )}
                                       </div>
                                       <span className="truncate text-gray-500">{brushConfig.floorAssetId || (uiStrings.none || 'None')}</span>
                                   </button>
                               </div>

                               <div className="mt-4">
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.glass_transparency || 'Glass Transparency (0-1)'}</label>
                                   <NumericInput 
                                       value={brushConfig.glassTransparency}
                                       placeholder="0.5"
                                       onChange={val => {
                                           setBrushConfig({ ...brushConfig, glassTransparency: val });
                                       }}
                                       className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-sm"
                                   />
                               </div>

                               <div>
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.glass_offset || 'Glass Offset (0-1)'}</label>
                                   <NumericInput 
                                       value={brushConfig.glassOffset}
                                       placeholder="0.5"
                                       onChange={val => {
                                           setBrushConfig({ ...brushConfig, glassOffset: val });
                                       }}
                                       className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 text-sm"
                                   />
                               </div>

                               <div className="col-span-2">
                                   <label className="block text-sm text-gray-400 mb-1">{uiStrings.glass_break_sound || 'Glass Break Sound'}</label>
                                   <div className="flex gap-2">
                                       <CustomSelect 
                                           value={brushConfig.glassBreakSound || ''}
                                           onChange={e => setBrushConfig(prev => ({ ...prev, glassBreakSound: e.target.value }))}
                                           className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                                       >
                                           <option value="">{uiStrings.none || 'None (No Sound)'}</option>
                                           {soundOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                       </CustomSelect>
                                       {brushConfig.glassBreakSound && brushConfig.glassBreakSound !== '' && (
                                           <button 
                                               onClick={() => playSoundPreview(brushConfig.glassBreakSound)}
                                               className="px-3 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow"
                                               title="Play Sound"
                                           >
                                               <Play size={18} fill="currentColor" />
                                           </button>
                                       )}
                                   </div>
                               </div>
                           </div>
                       )}

                       {brushConfig.type === 'floor' && (
                           <div className="bg-gray-900/50 p-4 rounded border border-gray-800">
                               <label className="block text-sm text-gray-400 mb-1">{uiStrings.footstep_sound || 'Footstep Sound'}</label>
                               <div className="flex gap-2">
                                   <CustomSelect 
                                       value={brushConfig.footstepSound || ''}
                                       onChange={e => setBrushConfig(prev => ({ ...prev, footstepSound: e.target.value }))}
                                       className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                                   >
                                       <option value="">{uiStrings.default || 'Default'}</option>
                                       {soundOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                   </CustomSelect>
                                                                   {brushConfig.footstepSound && brushConfig.footstepSound !== '' && (
                                    <button 
                                        onClick={() => playSoundPreview(brushConfig.footstepSound)}
                                        className="px-3 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow"
                                        title="Play Sound"
                                    >
                                        <Play size={18} fill="currentColor" />
                                    </button>
                                )}
                            </div>

                            <div className="mt-4 border-t border-gray-800/50 pt-4">
                                <label className="block text-sm text-gray-400 mb-1">{uiStrings.fall_sound || 'Landing Sound'}</label>
                                <div className="flex gap-2">
                                    <CustomSelect 
                                        value={brushConfig.fallSound || ''}
                                        onChange={e => setBrushConfig(prev => ({ ...prev, fallSound: e.target.value }))}
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                                    >
                                        <option value="">{uiStrings.default || 'Default'}</option>
                                        {soundOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
                                    </CustomSelect>
                                    {brushConfig.fallSound && brushConfig.fallSound !== '' && (
                                        <button 
                                            onClick={() => playSoundPreview(brushConfig.fallSound)}
                                            className="px-3 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors shadow"
                                            title="Play Sound"
                                        >
                                            <Play size={18} fill="currentColor" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                       )}
                       
                       <div className="flex gap-4 mt-6">
                           <button 
                               onClick={onClose}
                               className="flex-1 bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase text-sm"
                           >
                               {uiStrings.btn_cancel || 'Cancel'}
                           </button>
                           <button 
                               onClick={() => {
                                   const { symbol, newConstruction } = resolveBrushSymbol(brushConfig, level);
                                   if (newConstruction) {
                                       const consts = [...(level.construction || [])];
                                       const existingIdx = consts.findIndex(c => c.symbol === symbol);
                                       if (existingIdx >= 0) {
                                           consts[existingIdx] = newConstruction;
                                       } else {
                                           consts.push(newConstruction);
                                       }
                                       setLevel({ ...level, construction: consts });
                                       setBrushConfig(newConstruction); // Update brush with assigned symbol
                                   }
                                   onClose();
                               }} 
                               className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded text-white transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] tracking-widest uppercase text-sm"
                           >
                               {uiStrings.btn_create || 'Create'}
                           </button>
                       </div>
                   </div>
                )}
            </div>
        </div>
    );
};
