import React, { useState, useEffect, useRef } from "react";
import { GameState, LevelDefinition, GameStrings } from "../../types";
import {
  Save,
  FolderOpen,
  Play,
  FilePlus,
  PenTool,
  Columns,
  X,
  Trash2,
  PaintBucket,
  Undo,
  Redo,
  ChevronUp,
  ChevronDown,
  Settings,
  ListTodo,
  DoorClosed,
  BoxSelect,
  Copy,
  ClipboardPaste,
  Lightbulb,
  Plus,
  LogOut,
  User,
  ChevronRight,
  ChevronsUp,
  ChevronsDown,
  MousePointer2,
  Volume2,
  Move,
  Wrench,
  Brain,
  Sparkles,
  MapPin,
  Pipette
} from "lucide-react";
import { ASSETS } from "../../assets";
import soundsData from "../../data/sounds.json";
import animationsData from "../../data/animations.json";
import enemiesData from "../../data/enemies.json";
import npcsData from "../../data/npcs.json";
import itemsData from "../../data/items.json";
import decorationsData from "../../data/decorations.json";
import particlesData from "../../data/particles.json";
import JSZip from 'jszip';
import creditsData from '../../data/credits.json';
import debuffsData from '../../data/de-buffs.json';
import dialoguesData from '../../data/dialogues.json';
import recipesData from '../../data/recipes.json';
import stringsEnData from '../../data/strings_en.json';
import stringsRuData from '../../data/strings_ru.json';
import playerData from '../../data/player.json';
import achievementsData from '../../data/achievements.json';
import { WORLD_MAP_PATHS, START_SECTOR_PATH, setStartSectorPath, TUTORIAL_SECTOR_PATH, setTutorialSectorPath, getGroupedSectorsFromGlob, getAllSectorPathsFromGlob } from '../../data/levels';
import { CustomIcon } from "../CustomIcons";
import { SectorSettingsModal } from "./SectorSettingsModal";
import { SectorTasksModal } from "./SectorTasksModal";
import { SectorScriptsModal } from "./SectorScriptsModal";
import { ConstructionSettingsModal } from "./ConstructionSettingsModal";
import { DoorSettingsModal } from "./DoorSettingsModal";
import { LightSettingsModal } from "./LightSettingsModal";
import { PortalSettingsModal } from "./PortalSettingsModal";
import { PlayerSettingsModal } from "./PlayerSettingsModal";
import { EntitySettingsModal } from "./EntitySettingsModal";
import { TweakEntityModal } from "./TweakEntityModal";
import { AssetEditorModal } from "./AssetEditorModal";
import { IsometricViewModal } from "./IsometricViewModal";
import { DialogueEditorModal } from "./DialogueEditorModal";
import { SoundSettingsModal } from "./SoundSettingsModal";
import { SaveLevelModal } from "./SaveLevelModal";
import { VirtualKeyboard } from "./VirtualKeyboard";
import { clearRaycastCache } from "../raycaster/RaycastCore";

import { CustomSelect } from './CustomSelect';
import {
  resolveBrushSymbol,
  resolveDoorBrushSymbol,
  resolveLightBrushSymbol,
  resolvePortalBrushSymbol,
  resolveEntityBrushSymbol,
  resolveSoundBrushSymbol,
  getPreviewSrc,
  isTextureAsset,
  getAvailableSymbol,
} from "./levelBuilderUtils";

const CubeIcon = ({ src, className }: { src: string, className?: string }) => (
  <div className={className || 'relative w-full h-full pointer-events-none'}>
     <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', clipPath: 'polygon(50% 0%, 100% 25%, 50% 50%, 0% 25%)', filter: 'contrast(1.1) brightness(1.2)', imageRendering: 'pixelated' }} />
     <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', clipPath: 'polygon(0% 25%, 50% 50%, 50% 100%, 0% 75%)', filter: 'brightness(0.7)', imageRendering: 'pixelated' }} />
     <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', clipPath: 'polygon(50% 50%, 100% 25%, 100% 75%, 50% 100%)', filter: 'brightness(0.4)', imageRendering: 'pixelated' }} />
  </div>
);

const allSectors = import.meta.glob('../../data/levels/**/*.json', { eager: true });

interface GridCellProps {
  x: number;
  y: number;
  cell: string;
  ent: string;
  itemCell: string;
  lightChar: string;
  soundChar: string;
  currentFloor: number;
  isSpawn: boolean;
  isSelected: boolean;
  isMoveSource: boolean;
  isGhostMoveTarget: boolean;
  hasOverrides: boolean;
  constructionInfo: any;
  doorInfo: any;
  portalInfo: any;
  
  // Onion skin
  showOnionSkin: boolean;
  prevLayerCell?: string;
  prevLayerEnt?: string;
  prevLayerItem?: string;
  prevConst?: any;
  prevDoorInfo?: any;
  prevLayerPortalInfo?: any;
  isPrevEmptyness: boolean;
  
  // App variables
  activeTool: string;
  pickingCoordinateSelected: { x: number; y: number } | null;
  viewSoundRadius: boolean;
  viewLightPreview: boolean;
  editorLightMapColor?: { r: number; g: number; b: number } | null;
  soundMapRadius?: number | null;
  scriptTriggersOnEnter: boolean;
  scriptTriggersRadius: boolean;
  
  // Cache precomputes
  entityAssetCache_val?: string | null;
  entityIsBoxCache_val?: boolean;
  entityEmptynessCache_val?: boolean;
  prevLayerEntityAssetCache_val?: string | null;
  prevLayerEntityIsBoxCache_val?: boolean;
  prevLayerEntityEmptynessCache_val?: boolean;
  
  // Combos
  comboDescriptors?: { sym: string; src: string | null; isBox: boolean }[];
  entityComboDescriptors?: {
    sym: string;
    assetId?: string | null;
    src: string | null;
    isBox: boolean;
    isEmptyness?: boolean;
    portalInfo?: any;
    doorInfo?: any;
  }[];
  
  // Player start metadata
  levelPlayerStartSymbol?: string;
  levelPlayerStartDir?: string;
  levelFloorTexture?: string;
  levelLightDefinitions?: any;
  
  // Strings
  uiStrings: any;
  
  // Handlers
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => void;
  onPointerEnter: (e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => void;
}

const areGridCellPropsEqual = (prev: GridCellProps, next: GridCellProps): boolean => {
  const prevIsSelectOrMove = prev.activeTool === 'select' || prev.activeTool === 'move';
  const nextIsSelectOrMove = next.activeTool === 'select' || next.activeTool === 'move';
  if ((prevIsSelectOrMove || nextIsSelectOrMove) && prev.activeTool !== next.activeTool) {
    return false;
  }

  if (
    prev.x !== next.x ||
    prev.y !== next.y ||
    prev.cell !== next.cell ||
    prev.ent !== next.ent ||
    prev.itemCell !== next.itemCell ||
    prev.lightChar !== next.lightChar ||
    prev.soundChar !== next.soundChar ||
    prev.currentFloor !== next.currentFloor ||
    prev.isSpawn !== next.isSpawn ||
    prev.isSelected !== next.isSelected ||
    prev.isMoveSource !== next.isMoveSource ||
    prev.isGhostMoveTarget !== next.isGhostMoveTarget ||
    prev.hasOverrides !== next.hasOverrides ||
    prev.showOnionSkin !== next.showOnionSkin ||
    prev.prevLayerCell !== next.prevLayerCell ||
    prev.prevLayerEnt !== next.prevLayerEnt ||
    prev.prevLayerItem !== next.prevLayerItem ||
    prev.isPrevEmptyness !== next.isPrevEmptyness ||
    prev.viewSoundRadius !== next.viewSoundRadius ||
    prev.viewLightPreview !== next.viewLightPreview ||
    prev.soundMapRadius !== next.soundMapRadius ||
    prev.scriptTriggersOnEnter !== next.scriptTriggersOnEnter ||
    prev.scriptTriggersRadius !== next.scriptTriggersRadius ||
    prev.entityAssetCache_val !== next.entityAssetCache_val ||
    prev.entityIsBoxCache_val !== next.entityIsBoxCache_val ||
    prev.entityEmptynessCache_val !== next.entityEmptynessCache_val ||
    prev.prevLayerEntityAssetCache_val !== next.prevLayerEntityAssetCache_val ||
    prev.prevLayerEntityIsBoxCache_val !== next.prevLayerEntityIsBoxCache_val ||
    prev.prevLayerEntityEmptynessCache_val !== next.prevLayerEntityEmptynessCache_val ||
    prev.levelPlayerStartSymbol !== next.levelPlayerStartSymbol ||
    prev.levelPlayerStartDir !== next.levelPlayerStartDir ||
    prev.levelFloorTexture !== next.levelFloorTexture ||
    prev.onPointerDown !== next.onPointerDown ||
    prev.onPointerEnter !== next.onPointerEnter
  ) {
    return false;
  }

  // Deep comparison of light color
  if (prev.editorLightMapColor?.r !== next.editorLightMapColor?.r ||
      prev.editorLightMapColor?.g !== next.editorLightMapColor?.g ||
      prev.editorLightMapColor?.b !== next.editorLightMapColor?.b) {
    return false;
  }

  // Picking coordinate
  if (prev.pickingCoordinateSelected?.x !== next.pickingCoordinateSelected?.x ||
      prev.pickingCoordinateSelected?.y !== next.pickingCoordinateSelected?.y) {
    return false;
  }

  // Compare door/construction/portal details (simple symbols/height check)
  if (prev.constructionInfo?.symbol !== next.constructionInfo?.symbol ||
      prev.constructionInfo?.type !== next.constructionInfo?.type ||
      prev.constructionInfo?.height !== next.constructionInfo?.height ||
      prev.constructionInfo?.assetId !== next.constructionInfo?.assetId) {
    return false;
  }

  if (prev.doorInfo?.symbol !== next.doorInfo?.symbol ||
      prev.doorInfo?.textureId !== next.doorInfo?.textureId) {
    return false;
  }

  if (prev.portalInfo?.symbol !== next.portalInfo?.symbol ||
      prev.portalInfo?.assetId !== next.portalInfo?.assetId) {
    return false;
  }

  if (prev.prevConst?.symbol !== next.prevConst?.symbol ||
      prev.prevConst?.height !== next.prevConst?.height ||
      prev.prevConst?.assetId !== next.prevConst?.assetId) {
    return false;
  }

  if (prev.prevDoorInfo?.symbol !== next.prevDoorInfo?.symbol ||
      prev.prevDoorInfo?.textureId !== next.prevDoorInfo?.textureId) {
    return false;
  }

  if (prev.prevLayerPortalInfo?.symbol !== next.prevLayerPortalInfo?.symbol ||
      prev.prevLayerPortalInfo?.assetId !== next.prevLayerPortalInfo?.assetId) {
    return false;
  }

  // Compare combo descriptors length
  if ((prev.comboDescriptors?.length || 0) !== (next.comboDescriptors?.length || 0)) {
    return false;
  }
  if (prev.comboDescriptors && next.comboDescriptors) {
    for (let i = 0; i < prev.comboDescriptors.length; i++) {
      if (prev.comboDescriptors[i].sym !== next.comboDescriptors[i].sym ||
          prev.comboDescriptors[i].src !== next.comboDescriptors[i].src ||
          prev.comboDescriptors[i].isBox !== next.comboDescriptors[i].isBox) {
        return false;
      }
    }
  }

  // Compare entity combo descriptors
  if ((prev.entityComboDescriptors?.length || 0) !== (next.entityComboDescriptors?.length || 0)) {
    return false;
  }
  if (prev.entityComboDescriptors && next.entityComboDescriptors) {
    for (let i = 0; i < prev.entityComboDescriptors.length; i++) {
      if (prev.entityComboDescriptors[i].sym !== next.entityComboDescriptors[i].sym ||
          prev.entityComboDescriptors[i].src !== next.entityComboDescriptors[i].src ||
          prev.entityComboDescriptors[i].isBox !== next.entityComboDescriptors[i].isBox) {
        return false;
      }
    }
  }

  return true;
};

const GridCell: React.FC<GridCellProps> = React.memo(({
  x,
  y,
  cell,
  ent,
  itemCell,
  lightChar,
  soundChar,
  currentFloor,
  isSpawn,
  isSelected,
  isMoveSource,
  isGhostMoveTarget,
  hasOverrides,
  constructionInfo,
  doorInfo,
  portalInfo,
  showOnionSkin,
  prevLayerCell,
  prevLayerEnt,
  prevLayerItem,
  prevConst,
  prevDoorInfo,
  prevLayerPortalInfo,
  isPrevEmptyness,
  activeTool,
  pickingCoordinateSelected,
  viewSoundRadius,
  viewLightPreview,
  editorLightMapColor,
  soundMapRadius,
  scriptTriggersOnEnter,
  scriptTriggersRadius,
  entityAssetCache_val,
  entityIsBoxCache_val,
  entityEmptynessCache_val,
  prevLayerEntityAssetCache_val,
  prevLayerEntityIsBoxCache_val,
  prevLayerEntityEmptynessCache_val,
  comboDescriptors,
  entityComboDescriptors,
  levelPlayerStartSymbol,
  levelPlayerStartDir,
  levelFloorTexture,
  levelLightDefinitions,
  uiStrings,
  onPointerDown,
  onPointerEnter,
}) => {
  const isWall = constructionInfo?.type === "wall";
  const isWindow = constructionInfo?.type === "window";
  const displayCell = cell;
  const displayEnt = ent;
  const displayItem = itemCell;

  const isMirror = constructionInfo?.mirror;
  const maskTargetAsset = constructionInfo?.maskTargetAsset;
  const displayedAssetId = (isMirror && maskTargetAsset && getPreviewSrc(maskTargetAsset))
    ? maskTargetAsset
    : constructionInfo?.assetId;

  const prevConstIsMirror = prevConst?.mirror;
  const prevConstMaskTargetAsset = prevConst?.maskTargetAsset;
  const prevConstDisplayedAssetId = (prevConstIsMirror && prevConstMaskTargetAsset && getPreviewSrc(prevConstMaskTargetAsset))
    ? prevConstMaskTargetAsset
    : prevConst?.assetId;

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, x, y)}
      onPointerEnter={(e) => onPointerEnter(e, x, y)}
      className={`w-8 h-8 border flex items-center justify-center text-xs select-none relative hover:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.8)] transition-shadow duration-100 cursor-crosshair
        ${
          pickingCoordinateSelected?.x === x && pickingCoordinateSelected?.y === y
            ? "border-yellow-400 bg-yellow-400/30 z-[20] shadow-[inset_0_0_0_2px_rgba(250,204,21,1)]"
            : isSelected ? "border-yellow-400 bg-yellow-900/50" : "border-gray-600/50"
        }
        ${
          isMoveSource ? "ring-2 ring-indigo-500 ring-inset bg-indigo-900/40 z-10" : ""
        }
        ${
          isGhostMoveTarget ? "ring-2 ring-emerald-500 ring-inset bg-emerald-900/40 z-10 opacity-70" : ""
        }
        ${
          isWall || isWindow
            ? "bg-gray-600 text-white"
            : displayCell === "."
              ? "bg-gray-800 text-gray-400"
              : "bg-gray-900 text-gray-500"
        }
        ${viewSoundRadius && soundChar && soundChar !== '.' && soundChar !== ' ' ? 'overflow-visible z-[20]' : 'overflow-hidden'}
      `}
    >
      {/* Onion Skin Layer */}
      {showOnionSkin && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Floor from previous layer */}
          {prevLayerCell === "." && (
            <div className="absolute inset-0 bg-gray-800 brightness-50" />
          )}

          {/* Entities, Portals, etc. from previous layer (not darkened) */}
          {prevLayerEnt && prevLayerEnt !== "." && prevLayerEnt !== (levelPlayerStartSymbol || "S") && (
            prevLayerEntityAssetCache_val && getPreviewSrc(prevLayerEntityAssetCache_val) ? (
              prevLayerEntityIsBoxCache_val ? (
                <CubeIcon src={getPreviewSrc(prevLayerEntityAssetCache_val)!} className="absolute z-20 w-[80%] h-[80%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
              ) : (
                <img
                  draggable={false}
                  src={getPreviewSrc(prevLayerEntityAssetCache_val)!}
                  alt="Entity"
                  className="absolute z-20 w-[80%] h-[80%] object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              )
            ) : prevLayerPortalInfo ? (
              prevLayerPortalInfo.assetId && getPreviewSrc(prevLayerPortalInfo.assetId) ? (
                <img
                  draggable={false}
                  src={getPreviewSrc(prevLayerPortalInfo.assetId)!}
                  className="absolute z-20 w-[80%] h-[80%] object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="absolute z-20 flex items-center justify-center w-full h-full">
                  <LogOut className="w-5 h-5 text-purple-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{prevLayerEnt}</span>
                </div>
              )
            ) : prevDoorInfo ? (
              prevDoorInfo.textureId && getPreviewSrc(prevDoorInfo.textureId) ? (
                <img
                  draggable={false}
                  src={getPreviewSrc(prevDoorInfo.textureId)!}
                  className={`absolute inset-0 w-full h-full ${isTextureAsset(prevDoorInfo.textureId) ? 'object-cover' : 'object-contain'}`}
                  style={{ imageRendering: "pixelated" }}
                  alt=""
                />
              ) : (
                <div className="absolute z-20 flex items-center justify-center w-full h-full">
                  <DoorClosed className="w-5 h-5 text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{prevDoorInfo.symbol || prevLayerCell || prevLayerEnt}</span>
                </div>
              )
            ) : (
              <div className="absolute z-20 flex items-center justify-center w-full h-full">
                <User className="w-5 h-5 text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{prevLayerEnt}</span>
              </div>
            )
          )}
          
          {prevLayerEnt === (levelPlayerStartSymbol || "S") && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-20">
              <img
                draggable={false}
                src={getPreviewSrc("MALE_PORTRAIT1")!}
                alt="Spawn"
                className="w-[120%] h-[120%] object-cover grayscale"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          )}

          {isPrevEmptyness && (
            <div className="absolute inset-0 border-2 border-red-500 z-[25] pointer-events-none" />
          )}

          {/* Walls & Doors from previous layer */}
          {(prevConst?.type === "wall" || prevDoorInfo !== undefined) && (
            <div className="absolute inset-0 brightness-50">
              {prevConst?.type === "wall" &&
                !getPreviewSrc(prevConstDisplayedAssetId) && (
                  <div className="absolute inset-0 bg-gray-400 flex items-center justify-center">
                    <CustomIcon id="construction" className="w-5 h-5 text-gray-700 drop-shadow-[0_1px_2px_rgba(255,255,255,0.5)]" />
                    <span className="absolute text-[8px] font-bold text-gray-900 bottom-0 right-0 p-0.5 leading-none">{prevConst.symbol}</span>
                  </div>
                )}

              {prevConst?.type === "wall" && prevConst?.faces && (
                <div className={`absolute inset-0 pointer-events-none z-10 ${
                  prevConst.faces.N ? 'border-t-[3px] border-t-blue-500 ' : ''
                }${
                  prevConst.faces.S ? 'border-b-[3px] border-b-red-500 ' : ''
                }${
                  prevConst.faces.E ? 'border-r-[3px] border-r-yellow-500 ' : ''
                }${
                  prevConst.faces.W ? 'border-l-[3px] border-l-green-500 ' : ''
                }`} />
              )}

              {prevConstDisplayedAssetId &&
              getPreviewSrc(prevConstDisplayedAssetId) ? (
                <img
                  draggable={false}
                  src={getPreviewSrc(prevConstDisplayedAssetId)!}
                  className={`absolute inset-0 w-full h-full ${isTextureAsset(prevConstDisplayedAssetId) ? 'object-cover' : 'object-contain'}`}
                  style={{ imageRendering: "pixelated" }}
                  alt=""
                />
              ) : prevDoorInfo?.textureId &&
                getPreviewSrc(prevDoorInfo.textureId) ? (
                <img
                  draggable={false}
                  src={getPreviewSrc(prevDoorInfo.textureId)!}
                  className={`absolute inset-0 w-full h-full ${isTextureAsset(prevDoorInfo.textureId) ? 'object-cover' : 'object-contain'}`}
                  style={{ imageRendering: "pixelated" }}
                  alt=""
                />
              ) : prevDoorInfo ? (
                <div className="absolute z-20 flex items-center justify-center w-full h-full">
                  <DoorClosed className="w-5 h-5 text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{prevDoorInfo.symbol || prevLayerCell || prevLayerEnt}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Current Layer */}
      {(isWall || isWindow) && constructionInfo?.faces && (
        <div className={`absolute inset-0 pointer-events-none z-10 ${
          constructionInfo.faces.N ? 'border-t-[3px] border-t-blue-500 ' : ''
        }${
          constructionInfo.faces.S ? 'border-b-[3px] border-b-red-500 ' : ''
        }${
          constructionInfo.faces.E ? 'border-r-[3px] border-r-yellow-500 ' : ''
        }${
          constructionInfo.faces.W ? 'border-l-[3px] border-l-green-500 ' : ''
        }`} />
      )}
      {(isWall || isWindow) && constructionInfo?.height !== undefined && constructionInfo.height !== 1.0 && (
        <>
          {/* Visual Overlay for Height */}
          <div 
            className={`absolute inset-0 pointer-events-none z-[15] ${
              constructionInfo.height < 1.0 
                ? 'shadow-[inset_0_6px_10px_2px_rgba(0,0,0,0.8)] bg-black/40 border border-black' 
                : 'shadow-[inset_0_0_12px_rgba(56,189,248,0.5)] bg-sky-400/10 border-[2px] border-b-[4px] border-r-[4px] border-sky-400/60'
            }`} 
          />
          {/* Repeated rings for tall walls */}
          {constructionInfo.height > 1.0 && (
            <>
              <div className="absolute inset-[3px] pointer-events-none z-[15] border border-sky-400/40" />
              <div className="absolute inset-[6px] pointer-events-none z-[15] border border-sky-400/20" />
            </>
          )}
          {/* Badge */}
          <div className={`absolute top-0 left-0 w-[10px] text-[6px] font-black px-0 py-[2px] rounded-br z-[25] pointer-events-none leading-none shadow-md flex flex-col items-center justify-center backdrop-blur-sm ${constructionInfo.height < 0 ? 'bg-red-950/90 text-red-300 border-r border-b border-red-800' : 'bg-sky-950/90 text-sky-300 border-r border-b border-sky-800'}`} title={`Height: ${constructionInfo.height} (Standard is 1.0)`}>
            {constructionInfo.height > 0 && <ChevronsUp size={8} strokeWidth={4} className="mb-[1px]" />}
            <span className="tracking-tighter scale-y-110 leading-none">{constructionInfo.height}</span>
            {constructionInfo.height < 0 && <ChevronsDown size={8} strokeWidth={4} className="mt-[1px]" />}
          </div>
        </>
      )}
      {isWindow && (
        <div 
          className="absolute z-[12] border-2 border-cyan-400 bg-cyan-900/40 flex" 
          style={{ 
            top: `${(constructionInfo.cutout?.topLeft?.y ?? 0.25) * 100}%`,
            bottom: `${(1 - (constructionInfo.cutout?.bottomRight?.y ?? 0.75)) * 100}%`,
            left: `${(constructionInfo.cutout?.topLeft?.x ?? 0.25) * 100}%`,
            right: `${(1 - (constructionInfo.cutout?.bottomRight?.x ?? 0.75)) * 100}%`
          }}
        >
          {constructionInfo.glassAssetId && getPreviewSrc(constructionInfo.glassAssetId) && (
            <img src={getPreviewSrc(constructionInfo.glassAssetId)!} style={{ imageRendering: "pixelated" }} className="w-full h-full object-cover opacity-80" alt="glass" />
          )}
        </div>
      )}
      {constructionInfo?.type === "floor" && constructionInfo?.height !== undefined && constructionInfo.height !== 0.0 && (
        <>
          {/* Visual Overlay for Floor Elevation */}
          <div 
            className={`absolute inset-0 pointer-events-none z-[15] ${
              constructionInfo.height < 0.0 
                ? 'shadow-[inset_0_4px_8px_rgba(0,0,0,0.7)] bg-orange-950/30' 
                : 'shadow-[inset_0_0_8px_rgba(16,185,129,0.3)] bg-emerald-400/10 border-b-[3px] border-r-[3px] border-emerald-500/40'
            }`} 
          />
          {/* Badge */}
          <div className={`absolute top-0 left-0 w-[10px] text-[6px] font-black px-0 py-[2px] rounded-br z-[25] pointer-events-none leading-none shadow-md flex flex-col items-center justify-center backdrop-blur-sm ${constructionInfo.height < 0.0 ? 'bg-orange-950/90 text-orange-300 border-r border-b border-orange-800' : 'bg-emerald-950/90 text-emerald-300 border-r border-b border-emerald-800'}`} title={`Elevation: ${constructionInfo.height} (Standard is 0.0)`}>
            {constructionInfo.height > 0.0 && <ChevronsUp size={8} strokeWidth={4} className="mb-[1px]" />}
            <span className="tracking-tighter scale-y-110 leading-none">{constructionInfo.height}</span>
            {constructionInfo.height < 0.0 && <ChevronsDown size={8} strokeWidth={4} className="mt-[1px]" />}
          </div>
        </>
      )}
       {displayedAssetId && getPreviewSrc(displayedAssetId) ? (
          (constructionInfo.height !== undefined && constructionInfo.height < 0.0 && (isWall || isWindow)) ? (
            <div className="absolute inset-0 flex flex-col opacity-60">
              <div className="flex-1 relative overflow-hidden">
                <img
                  draggable={false}
                  src={getPreviewSrc(displayedAssetId)!}
                  className={`absolute inset-0 w-full h-full ${isTextureAsset(displayedAssetId) ? 'object-cover' : 'object-contain'}`}
                  style={{ imageRendering: "pixelated" }}
                  alt=""
                />
              </div>
              <div className="flex-1 relative overflow-hidden border-t-[1.5px] border-black/80 shadow-[inset_0_4px_8px_rgba(0,0,0,0.5)]">
                {levelFloorTexture && (getPreviewSrc(constructionInfo.floorAssetId || levelFloorTexture) || getPreviewSrc(levelFloorTexture)) && (
                  <img
                    draggable={false}
                    src={getPreviewSrc(constructionInfo.floorAssetId || levelFloorTexture) || getPreviewSrc(levelFloorTexture)!}
                    className="absolute inset-0 w-full h-full object-cover grayscale-[0.3] brightness-[0.6]"
                    style={{ imageRendering: "pixelated" }}
                    alt=""
                  />
                )}
              </div>
            </div>
          ) : (
            <img
              draggable={false}
              src={getPreviewSrc(displayedAssetId)!}
              className={`absolute inset-0 w-full h-full opacity-60 ${isTextureAsset(displayedAssetId) ? 'object-cover' : 'object-contain'}`}
              style={{ imageRendering: "pixelated" }}
              alt=""
            />
          )
        ) : (isWall || isWindow) ? (
          <div className="absolute inset-0 flex items-center justify-center opacity-60">
            <CustomIcon id="construction" className="w-5 h-5 text-gray-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{displayCell}</span>
          </div>
        ) : null}
      {doorInfo?.textureId &&
        getPreviewSrc(doorInfo.textureId) && (
          <img
            draggable={false}
            src={getPreviewSrc(doorInfo.textureId)!}
            className={`absolute inset-0 w-full h-full opacity-60 ${isTextureAsset(doorInfo.textureId) ? 'object-cover' : 'object-contain'}`}
            style={{ imageRendering: "pixelated" }}
            alt=""
          />
        )}
      {portalInfo?.assetId &&
        getPreviewSrc(portalInfo.assetId) && (
          <img
            draggable={false}
            src={getPreviewSrc(portalInfo.assetId)!}
            className={`absolute inset-0 w-full h-full opacity-60 ${isTextureAsset(portalInfo.assetId) ? 'object-cover' : 'object-contain'}`}
            style={{ imageRendering: "pixelated" }}
            alt=""
          />
        )}

      {/* Entity representation */}
      {displayEnt !== "." && displayEnt !== (levelPlayerStartSymbol || "S") && (
        entityComboDescriptors && entityComboDescriptors.length > 1 ? (
          <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
            {entityComboDescriptors.map((entDesc, idx) => {
              const { sym, src, isBox, isEmptyness, portalInfo, doorInfo } = entDesc;
              const offsetLeft = idx * 2.5;
              const offsetTop = -idx * 2.5;
              const style = {
                transform: `translate(${offsetLeft}px, ${offsetTop}px)`,
                zIndex: 20 + idx,
                imageRendering: "pixelated" as const
              };

              return (
                <React.Fragment key={idx}>
                  {isEmptyness && (
                    <div className="absolute inset-0 border-2 border-red-500 z-[25] pointer-events-none" />
                  )}
                  {src ? (
                    isBox ? (
                      <div className="absolute w-[80%] h-[80%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={style}>
                        <CubeIcon src={src} className="w-full h-full" />
                      </div>
                    ) : (
                      <img
                        draggable={false}
                        src={src}
                        alt="Entity"
                        className="absolute w-[85%] h-[85%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                        style={style}
                      />
                    )
                  ) : portalInfo ? (
                    <div className="absolute w-[85%] h-[85%] flex items-center justify-center" style={style}>
                      <LogOut className="w-5 h-5 text-purple-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                    </div>
                  ) : doorInfo ? (
                    <div className="absolute w-[85%] h-[85%] flex items-center justify-center" style={style}>
                      <DoorClosed className="w-5 h-5 text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                    </div>
                  ) : (
                    <div className="absolute w-[85%] h-[85%] flex items-center justify-center bg-black/40 border border-emerald-400/50 rounded" style={style}>
                      <User className="w-4 h-4 text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                      <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{sym}</span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            <div className="absolute top-0 right-0 bg-emerald-950/95 border border-emerald-600 rounded px-[3px] py-[1px] z-[50] shadow-md flex items-center justify-center pointer-events-none scale-75 origin-top-right">
              <span className="font-bold text-[8px] leading-none text-emerald-300">x{entityComboDescriptors.length}</span>
            </div>
          </div>
        ) : (
          <>
            {entityEmptynessCache_val && (
              <div className="absolute inset-0 border-2 border-red-500 z-[25] pointer-events-none" />
            )}
            {entityAssetCache_val && getPreviewSrc(entityAssetCache_val) ? (
              entityIsBoxCache_val ? (
                <CubeIcon src={getPreviewSrc(entityAssetCache_val)!} className="absolute z-20 w-[85%] h-[85%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
              ) : (
                <img
                  draggable={false}
                  src={getPreviewSrc(entityAssetCache_val)!}
                  alt="Entity"
                  className="absolute z-20 w-[90%] h-[90%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  style={{ imageRendering: "pixelated" }}
                />
              )
            ) : portalInfo ? (
              !portalInfo.assetId ? (
                <div className="absolute z-20 flex items-center justify-center w-full h-full">
                  <LogOut className="w-5 h-5 text-purple-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{displayEnt}</span>
                </div>
              ) : null
            ) : doorInfo ? (
              !doorInfo.textureId ? (
                <div className="absolute z-20 flex items-center justify-center w-full h-full">
                  <DoorClosed className="w-5 h-5 text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{displayEnt}</span>
                </div>
              ) : null
            ) : (
              <div className="absolute z-20 flex items-center justify-center w-full h-full">
                <User className="w-5 h-5 text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                <span className="absolute text-[8px] font-bold text-white bottom-0 right-0 p-0.5 leading-none">{displayEnt}</span>
              </div>
            )}
          </>
        )
      )}

      {/* Item Combo representation */}
      {displayItem !== "." && (() => {
        if (!comboDescriptors || comboDescriptors.length === 0) return null;
        
        return (
          <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
            {comboDescriptors.map((itemDesc, idx) => {
              const { sym, src, isBox } = itemDesc;
              
              const offsetLeft = idx * 2.5;
              const offsetTop = -idx * 2.5;
              
              const hasEntity = displayEnt !== "." && displayEnt !== " " && displayEnt !== (levelPlayerStartSymbol || "S");
              
              const itemClass = hasEntity 
                ? "absolute w-[50%] h-[50%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] right-1 bottom-1" 
                : "absolute w-[80%] h-[80%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]";
                
              const style = {
                transform: `translate(${offsetLeft}px, ${offsetTop}px)`,
                zIndex: 30 + idx,
                imageRendering: "pixelated" as const
              };
              
              if (src) {
                if (isBox) {
                  return (
                    <div key={idx} className={itemClass} style={style}>
                      <CubeIcon src={src} className="w-full h-full" />
                    </div>
                  );
                } else {
                  return (
                    <img
                      key={idx}
                      draggable={false}
                      src={src}
                      alt="Item"
                      className={itemClass}
                      style={style}
                    />
                  );
                }
              } else {
                return (
                  <div key={idx} className={`${itemClass} flex items-center justify-center bg-black/40 border border-sky-400/50 rounded`} style={style}>
                    <span className="font-bold text-sky-400 text-[10px] leading-none">{sym}</span>
                  </div>
                );
              }
            })}
            {comboDescriptors.length > 1 && (
              <div className="absolute top-0 left-0 bg-sky-950/95 border border-sky-600 rounded px-[3px] py-[1px] z-[50] shadow-md flex items-center justify-center pointer-events-none scale-75 origin-top-left">
                <span className="font-bold text-[8px] leading-none text-sky-300">x{comboDescriptors.length}</span>
              </div>
            )}
          </div>
        );
      })()}

      {isSpawn && (
        <div className="absolute inset-0 flex items-center justify-center z-20 hover:bg-gray-800/80 transition-colors group/spawn">
          <img
            draggable={false}
            src={(ASSETS as any).SPRITES?.MALE_PORTRAIT1}
            alt="Spawn"
            className="w-[120%] h-[120%] object-cover opacity-80"
            style={{ imageRendering: "pixelated" }}
          />
          <svg
            viewBox="0 0 24 24"
            className="absolute w-8 h-8 text-green-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            style={{
              transform: `rotate(${levelPlayerStartDir === "E" ? 90 : levelPlayerStartDir === "S" ? 180 : levelPlayerStartDir === "W" ? -90 : 0}deg)`,
            }}
          >
            <polygon
              points="12,4 18,18 6,18"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      {viewLightPreview && editorLightMapColor && (
         <div className="absolute inset-0 pointer-events-none z-[15] mix-blend-multiply"
              style={{ backgroundColor: `rgb(${Math.min(255, Math.floor(Math.max(0.4, editorLightMapColor.r) * 255))}, ${Math.min(255, Math.floor(Math.max(0.4, editorLightMapColor.g) * 255))}, ${Math.min(255, Math.floor(Math.max(0.4, editorLightMapColor.b) * 255))})` }} 
         />
      )}

      {lightChar && lightChar !== '.' && lightChar !== ' ' && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-visible">
            <div className="absolute rounded bg-gray-900/80 p-0.5 shadow-sm border border-gray-600 z-[25]">
              <Lightbulb 
                 size={14} 
                 color={levelLightDefinitions?.[lightChar] 
                    ? `rgb(${levelLightDefinitions[lightChar].r},${levelLightDefinitions[lightChar].g},${levelLightDefinitions[lightChar].b})` 
                    : 'yellow'} 
                 />
            </div>
            <span className="absolute top-0 right-0 text-[8px] leading-none bg-black text-white px-[2px] py-[1px] rounded drop-shadow-md z-[30] max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {lightChar}
            </span>
        </div>
      )}

      {soundChar && soundChar !== '.' && soundChar !== ' ' && (
        <div className="absolute inset-0 z-[22] pointer-events-none flex items-center justify-center overflow-visible">
            {viewSoundRadius && soundMapRadius && (
              <div className="absolute top-1/2 left-1/2 pointer-events-none" style={{
                  width: `${soundMapRadius * 2 * 32}px`,
                  height: `${soundMapRadius * 2 * 32}px`,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: '2px dashed rgba(6, 182, 212, 0.6)',
                  backgroundColor: 'rgba(6, 182, 212, 0.05)',
                  zIndex: 10
              }}></div>
            )}
            <div className="absolute rounded bg-gray-900/80 p-0.5 shadow-sm border border-cyan-600 z-[25] text-cyan-400 opacity-80 text-xs font-black mix-blend-screen h-5 w-5 flex items-center justify-center pb-1">
                <Volume2 size={12} />
            </div>
            <span className="absolute bottom-0 right-0 text-[8px] leading-none bg-black text-cyan-400 px-[2px] py-[1px] rounded drop-shadow-md z-[30] max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {soundChar}
            </span>
        </div>
      )}
      
      {/* Script Triggers */}
      {scriptTriggersOnEnter && (
        <div className="absolute top-0 right-0 z-[26] pointer-events-none">
          <div className="bg-indigo-600 text-white text-[8px] font-bold px-[2px] leading-none rounded-bl border-b border-l border-indigo-400 opacity-90 shadow-sm" title="Script Trigger">
            S
          </div>
        </div>
      )}
      {scriptTriggersRadius && (
        <div className="absolute inset-0 bg-indigo-500/20 border-dotted border-indigo-400 pointer-events-none z-[12]" style={{ borderWidth: '1px' }} />
      )}

      {isSelected && <div className="absolute inset-0 bg-blue-500/50 mix-blend-screen z-30 pointer-events-none" />}

      {hasOverrides && (
        <div className="absolute top-0 right-0 z-[35] pointer-events-none bg-amber-600 rounded drop-shadow" title={uiStrings?.tool_tweak || "Индивидуальные настройки"}>
           <Wrench className="w-3 h-3 text-white m-[1px]" />
        </div>
      )}
    </div>
  );
}, areGridCellPropsEqual);

interface GridRowProps {
  y: number;
  rowString: string;
  entityRowString: string;
  itemRowString: string;
  lightRowString: string;
  soundRowString: string;
  
  // Onion skin (layer y of prevFloor if currentFloor > 0)
  prevLayerCellRowString?: string;
  prevLayerEntRowString?: string;
  prevLayerItemRowString?: string;

  // Global options / states
  currentFloor: number;
  activeTool: string;
  viewSoundRadius: boolean;
  viewLightPreview: boolean;
  pickingCoordinateSelected: { x: number; y: number } | null;
  
  // Selection/Move
  selectionStart: { x: number; y: number } | null;
  selectionEnd: { x: number; y: number } | null;
  moveSource: { x: number; y: number } | null;
  moveHoveredCell: { x: number; y: number } | null;
  
  // Databases / Maps
  level: LevelDefinition;
  editorLightMapRow?: { r: number; g: number; b: number }[] | null;
  
  // Caches
  constructionMap: Map<string, any>;
  portalMap: Map<string, any>;
  soundMap: Map<string, any>;
  entityAssetCache: Record<string, string | null>;
  entityEmptynessCache: Record<string, boolean>;
  entityIsBoxCache: Record<string, boolean>;
  scriptTriggersOnEnterSet: Set<string>;
  scriptTriggersRadiusList: any[];
  resolveCombo: (symbol: string) => string[];
  overriddenCellsSet: Set<string>;
  
  // Props
  uiStrings: any;
  
  // Handlers
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => void;
  onPointerEnter: (e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => void;
  tempDrawOverlayRow?: Record<number, { cell?: string; ent?: string; itemCell?: string; lightChar?: string; soundChar?: string }>;
}

const areGridRowPropsEqual = (prev: GridRowProps, next: GridRowProps) => {
  const prevIsSelectOrMove = prev.activeTool === 'select' || prev.activeTool === 'move';
  const nextIsSelectOrMove = next.activeTool === 'select' || next.activeTool === 'move';
  if ((prevIsSelectOrMove || nextIsSelectOrMove) && prev.activeTool !== next.activeTool) {
    return false;
  }

  // 0. Check temporary draw overlay for active row
  if (prev.tempDrawOverlayRow !== next.tempDrawOverlayRow) {
    return false;
  }

  // 1. Basic properties
  if (
    prev.y !== next.y ||
    prev.currentFloor !== next.currentFloor ||
    prev.viewSoundRadius !== next.viewSoundRadius ||
    prev.viewLightPreview !== next.viewLightPreview ||
    prev.rowString !== next.rowString ||
    prev.entityRowString !== next.entityRowString ||
    prev.itemRowString !== next.itemRowString ||
    prev.lightRowString !== next.lightRowString ||
    prev.soundRowString !== next.soundRowString ||
    prev.prevLayerCellRowString !== next.prevLayerCellRowString ||
    prev.prevLayerEntRowString !== next.prevLayerEntRowString ||
    prev.prevLayerItemRowString !== next.prevLayerItemRowString
  ) {
    return false;
  }

  // 2. Selection and move coordinates
  if (
    prev.selectionStart?.x !== next.selectionStart?.x ||
    prev.selectionStart?.y !== next.selectionStart?.y ||
    prev.selectionEnd?.x !== next.selectionEnd?.x ||
    prev.selectionEnd?.y !== next.selectionEnd?.y ||
    prev.moveSource?.x !== next.moveSource?.x ||
    prev.moveSource?.y !== next.moveSource?.y ||
    prev.moveHoveredCell?.x !== next.moveHoveredCell?.x ||
    prev.moveHoveredCell?.y !== next.moveHoveredCell?.y
  ) {
    return false;
  }

  // Optimized Picking Coordinate comparison: Only re-render if the old/new selected coordinate was on this specific row
  const prevPick = prev.pickingCoordinateSelected;
  const nextPick = next.pickingCoordinateSelected;
  if (prevPick?.x !== nextPick?.x || prevPick?.y !== nextPick?.y) {
    if (prevPick?.y === prev.y || nextPick?.y === prev.y) {
      return false;
    }
  }

  // 3. Script Triggers count or references
  if (prev.scriptTriggersOnEnterSet.size !== next.scriptTriggersOnEnterSet.size) {
    return false;
  }
  // Check if our level has triggers changed
  if (prev.level.triggers !== next.level.triggers) {
    return false;
  }

  // 4. Checking light map change for this row
  if (prev.editorLightMapRow !== next.editorLightMapRow) {
    return false;
  }

  // 5. Check if level legends or maps references changed
  if (
    prev.constructionMap !== next.constructionMap ||
    prev.portalMap !== next.portalMap ||
    prev.soundMap !== next.soundMap ||
    prev.entityAssetCache !== next.entityAssetCache ||
    prev.overriddenCellsSet !== next.overriddenCellsSet
  ) {
    return false;
  }

  return true;
};

const GridRow: React.FC<GridRowProps> = React.memo(({
  y,
  rowString,
  entityRowString,
  itemRowString,
  lightRowString,
  soundRowString,
  overriddenCellsSet,
  prevLayerCellRowString,
  prevLayerEntRowString,
  prevLayerItemRowString,
  currentFloor,
  activeTool,
  viewSoundRadius,
  viewLightPreview,
  pickingCoordinateSelected,
  selectionStart,
  selectionEnd,
  moveSource,
  moveHoveredCell,
  level,
  editorLightMapRow,
  constructionMap,
  portalMap,
  soundMap,
  entityAssetCache,
  entityEmptynessCache,
  entityIsBoxCache,
  scriptTriggersOnEnterSet,
  scriptTriggersRadiusList,
  resolveCombo,
  uiStrings,
  onPointerDown,
  onPointerEnter,
  tempDrawOverlayRow,
}) => {
  const cells = rowString.split("");
  return (
    <div className="flex">
      {cells.map((cell, x) => {
        const draft = tempDrawOverlayRow?.[x];
        const ent = entityRowString?.[x] || ".";
        const itemCell = itemRowString?.[x] || ".";
        const lightChar = lightRowString?.[x] || ".";
        const soundChar = soundRowString?.[x] || ".";

        let displayCell = draft?.cell !== undefined ? draft.cell : cell;
        let displayEnt = draft?.ent !== undefined ? draft.ent : ent;
        let displayItem = draft?.itemCell !== undefined ? draft.itemCell : itemCell;
        let displayLight = draft?.lightChar !== undefined ? draft.lightChar : lightChar;
        let displaySound = draft?.soundChar !== undefined ? draft.soundChar : soundChar;
        let isGhostMoveTarget = false;

        if (activeTool === 'move' && moveSource && moveHoveredCell && (moveSource.x !== moveHoveredCell.x || moveSource.y !== moveHoveredCell.y)) {
          const dx = moveHoveredCell.x - moveSource.x;
          const dy = moveHoveredCell.y - moveSource.y;
          const sx = x - dx;
          const sy = y - dy;
          
          let isSourceIncluded = false;
          let isThisSource = false;
          
          const selStart = selectionStart;
          const selEnd = selectionEnd;
          
          if (selStart && selEnd) {
            const minX = Math.min(selStart.x, selEnd.x);
            const maxX = Math.max(selStart.x, selEnd.x);
            const minY = Math.min(selStart.y, selEnd.y);
            const maxY = Math.max(selStart.y, selEnd.y);
            
            if (moveSource.x >= minX && moveSource.x <= maxX && moveSource.y >= minY && moveSource.y <= maxY) {
              if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                isSourceIncluded = true;
              }
              if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                isThisSource = true;
              }
            } else {
              if (sx === moveSource.x && sy === moveSource.y) isSourceIncluded = true;
              if (x === moveSource.x && y === moveSource.y) isThisSource = true;
            }
          } else {
            if (sx === moveSource.x && sy === moveSource.y) isSourceIncluded = true;
            if (x === moveSource.x && y === moveSource.y) isThisSource = true;
          }
          
          if (isSourceIncluded) {
            const sGrid = level.grids[currentFloor]?.[sy]?.[sx] || ' ';
            const sEnt = level.entities?.[currentFloor]?.[sy]?.[sx] || '.';
            const sItem = level.itemsGrid?.[currentFloor]?.[sy]?.[sx] || '.';
            const cInfo = constructionMap.get(sGrid);
            const isFloorOrEmpty = sGrid === ' ' || sGrid === '.' || cInfo?.type === 'floor';
            
            if (!isFloorOrEmpty) displayCell = sGrid;
            if (sEnt !== '.') displayEnt = sEnt;
            if (sItem !== '.') displayItem = sItem;
            
            if (!isFloorOrEmpty || sEnt !== '.' || sItem !== '.') isGhostMoveTarget = true;
          }
          
          if (isThisSource) {
            const cInfo = constructionMap.get(displayCell);
            const isFloorOrEmpty = displayCell === ' ' || displayCell === '.' || cInfo?.type === 'floor';
            if (!isFloorOrEmpty) displayCell = ' ';
            if (displayEnt !== '.') displayEnt = '.';
            if (displayItem !== '.') displayItem = '.';
          }
        }

        const isSpawn = level.playerStart?.symbol ? displayEnt === level.playerStart.symbol : displayEnt === "S";
        const isSelected = (activeTool === 'select' || activeTool === 'move') && selectionStart && selectionEnd && x >= Math.min(selectionStart.x, selectionEnd.x) && x <= Math.max(selectionStart.x, selectionEnd.x) && y >= Math.min(selectionStart.y, selectionEnd.y) && y <= Math.max(selectionStart.y, selectionEnd.y);
        const isMoveSource = activeTool === 'move' && moveSource?.x === x && moveSource?.y === y;

        const constructionInfo = constructionMap.get(displayCell);
        const doorInfo = level.doorDefinitions?.[displayEnt];
        const portalInfo = portalMap.get(displayEnt);

        // Onion skin logic
        const prevLayerCell = prevLayerCellRowString?.[x];
        const prevLayerEnt = prevLayerEntRowString?.[x];
        const prevLayerItem = prevLayerItemRowString?.[x];
        const isCurrentEmpty = (displayCell === " " || displayCell === ".") && displayEnt === "." && displayItem === ".";

        const prevConst = currentFloor > 0 && prevLayerCell ? constructionMap.get(prevLayerCell) : undefined;
        const prevDoorInfo = currentFloor > 0 && prevLayerEnt ? level.doorDefinitions?.[prevLayerEnt] : undefined;
        const isPrevEmptyness = prevLayerEnt && prevLayerEnt !== "." ? !!entityEmptynessCache[prevLayerEnt] : false;

        const showOnionSkin = currentFloor > 0 && isCurrentEmpty && (
          (prevLayerCell && prevLayerCell !== " ") || (prevLayerEnt && prevLayerEnt !== ".")
        );

        const entityAssetCache_val = entityAssetCache[displayEnt];
        const entityIsBoxCache_val = entityIsBoxCache[displayEnt];
        const entityEmptynessCache_val = entityEmptynessCache[displayEnt];

        const prevLayerEntityAssetCache_val = prevLayerEnt ? entityAssetCache[prevLayerEnt] : null;
        const prevLayerEntityIsBoxCache_val = prevLayerEnt ? entityIsBoxCache[prevLayerEnt] : false;
        const prevLayerEntityEmptynessCache_val = prevLayerEnt ? entityEmptynessCache[prevLayerEnt] : false;

        const prevLayerPortalInfo = prevLayerEnt ? portalMap.get(prevLayerEnt) : undefined;

        const resolvedComboItems = displayItem !== "." ? resolveCombo(displayItem) : [];

        const comboDescriptors = resolvedComboItems.map(sym => {
          const assetId = entityAssetCache[sym];
          const src = getPreviewSrc(assetId);
          const isBox = entityIsBoxCache[sym];
          return { sym, src, isBox };
        });

        const resolvedComboEnts = (displayEnt !== "." && displayEnt !== " " && displayEnt !== (level.playerStart?.symbol || "S"))
          ? resolveCombo(displayEnt)
          : [];

        const entityComboDescriptors = resolvedComboEnts.map(sym => {
          const assetId = entityAssetCache[sym];
          const src = getPreviewSrc(assetId);
          const isBox = entityIsBoxCache[sym];
          const isEmptyness = entityEmptynessCache[sym];
          const portalInfo = portalMap.get(sym);
          const doorInfo = level.doorDefinitions?.[sym];
          return { sym, assetId, src, isBox, isEmptyness, portalInfo, doorInfo };
        });

        const editorLightMapColor = (viewLightPreview && editorLightMapRow?.[x]) ? editorLightMapRow[x] : null;

        const soundMapRadius = (viewSoundRadius && displaySound && displaySound !== '.' && displaySound !== ' ') 
          ? soundMap.get(displaySound)?.radius 
          : null;

        const scriptTriggersOnEnter = scriptTriggersOnEnterSet.has(`${x},${y}`);
        const scriptTriggersRadius = scriptTriggersRadiusList.some((t: any) => {
          const r = t.params.radius;
          const dx = Math.abs(x - t.params.x);
          const dy = Math.abs(y - t.params.y);
          return Math.max(dx, dy) <= r;
        });

        const hasOverrides = overriddenCellsSet.has(`${currentFloor}_${y}_${x}`);

        return (
          <GridCell
            key={x}
            x={x}
            y={y}
            cell={displayCell}
            ent={displayEnt}
            itemCell={displayItem}
            lightChar={displayLight}
            soundChar={displaySound}
            currentFloor={currentFloor}
            isSpawn={isSpawn}
            isSelected={isSelected}
            isMoveSource={isMoveSource}
            isGhostMoveTarget={isGhostMoveTarget}
            hasOverrides={hasOverrides}
            constructionInfo={constructionInfo}
            doorInfo={doorInfo}
            portalInfo={portalInfo}
            showOnionSkin={showOnionSkin}
            prevLayerCell={prevLayerCell}
            prevLayerEnt={prevLayerEnt}
            prevLayerItem={prevLayerItem}
            prevConst={prevConst}
            prevDoorInfo={prevDoorInfo}
            prevLayerPortalInfo={prevLayerPortalInfo}
            isPrevEmptyness={isPrevEmptyness}
            activeTool={activeTool}
            pickingCoordinateSelected={pickingCoordinateSelected}
            viewSoundRadius={viewSoundRadius}
            viewLightPreview={viewLightPreview}
            editorLightMapColor={editorLightMapColor}
            soundMapRadius={soundMapRadius}
            scriptTriggersOnEnter={scriptTriggersOnEnter}
            scriptTriggersRadius={scriptTriggersRadius}
            entityAssetCache_val={entityAssetCache_val}
            entityIsBoxCache_val={entityIsBoxCache_val}
            entityEmptynessCache_val={entityEmptynessCache_val}
            prevLayerEntityAssetCache_val={prevLayerEntityAssetCache_val}
            prevLayerEntityIsBoxCache_val={prevLayerEntityIsBoxCache_val}
            prevLayerEntityEmptynessCache_val={prevLayerEntityEmptynessCache_val}
            comboDescriptors={comboDescriptors}
            entityComboDescriptors={entityComboDescriptors}
            levelPlayerStartSymbol={level.playerStart?.symbol}
            levelPlayerStartDir={level.playerStart?.dir}
            levelFloorTexture={level.floorTexture}
            levelLightDefinitions={level.lightDefinitions}
            uiStrings={uiStrings}
            onPointerDown={onPointerDown}
            onPointerEnter={onPointerEnter}
          />
        );
      })}
    </div>
  );
}, areGridRowPropsEqual);

interface LevelBuilderProps {
  engine: any;
  strings: any;
}

const emptyLevel = (width: number, height: number): LevelDefinition => {
  const gridRow = width > 0 ? " ".repeat(width) : "";
  const entRow = width > 0 ? ".".repeat(width) : "";
  const grid = height > 0 ? Array(height).fill(gridRow) : [];
  const entities = height > 0 ? Array(height).fill(entRow) : [];
  const dateStr = new Date().toLocaleDateString('ru-RU');
  return {
    locationName: `${dateStr}/${dateStr}`,
    locationDescription: "Новая локация/New Location",
    objective: "Test Level",
    ceilingType: "OUTDOOR",
    grids: width > 0 && height > 0 ? [[...grid]] : [],
    entities: width > 0 && height > 0 ? [[...entities]] : [],
    itemsGrid: width > 0 && height > 0 ? [[...entities]] : [],
    legend: [],
    construction: [],
    playerStart: { dir: "N" },
  };
};

const smartCloneLevel = (lvl: LevelDefinition): LevelDefinition => {
  return {
    ...lvl,
    grids: lvl.grids ? lvl.grids.map(floor => [...floor]) : [],
    entities: lvl.entities ? lvl.entities.map(floor => [...floor]) : [],
    itemsGrid: lvl.itemsGrid ? lvl.itemsGrid.map(floor => [...floor]) : undefined,
    gridLight: lvl.gridLight ? [...lvl.gridLight] : undefined,
    gridSounds: lvl.gridSounds ? lvl.gridSounds.map(floor => [...floor]) : undefined,
    particles: lvl.particles ? lvl.particles.map(p => ({ ...p })) : undefined,
    entityOverrides: lvl.entityOverrides ? Object.fromEntries(
      Object.entries(lvl.entityOverrides).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v])
    ) : undefined,
    playerStart: lvl.playerStart ? { ...lvl.playerStart } : undefined,
    construction: lvl.construction ? lvl.construction.map(c => ({ 
      ...c, 
      faces: c.faces ? { ...c.faces } : undefined,
      cutout: c.cutout ? { 
        topLeft: c.cutout.topLeft ? { ...c.cutout.topLeft } : { x: 0.25, y: 0.25 },
        bottomRight: c.cutout.bottomRight ? { ...c.cutout.bottomRight } : { x: 0.75, y: 0.75 }
      } : undefined
    })) : undefined,
    doorDefinitions: lvl.doorDefinitions ? Object.fromEntries(
      Object.entries(lvl.doorDefinitions).map(([k, v]) => [
        k, 
        v ? typeof v === 'object' ? { ...v } : v : v
      ])
    ) : undefined,
    portals: lvl.portals ? lvl.portals.map(p => ({ ...p })) : undefined,
    ambientSounds: lvl.ambientSounds ? lvl.ambientSounds.map(s => ({ ...s })) : undefined,
    lightDefinitions: lvl.lightDefinitions ? Object.fromEntries(
      Object.entries(lvl.lightDefinitions).map(([k, v]) => [
        k, 
        v ? typeof v === 'object' ? { ...v } : v : v
      ])
    ) : undefined,
    triggers: lvl.triggers ? lvl.triggers.map(t => ({ ...t, params: t.params ? { ...t.params } : undefined })) : undefined,
  };
};

export const LevelBuilder: React.FC<LevelBuilderProps> = ({
  engine,
  strings,
}) => {
  const uiStrings = React.useMemo(() => ({
    title: "StormEd",
    btn_test: "TEST LEVEL",
    btn_back: "BACK TO MENU",
    tools: "TOOLS",
    properties: "PROPERTIES",
    file: "File",
    tool_wall: "Wall",
    tool_floor: "Floor",
    tool_erase: "Erase",
    tool_tweak: "Индивидуальные настройки (Entity)",
    size_w: "Width",
    size_h: "Height",
    apply_size: "Apply Size",
    new_level: "New Level",
    load_level: "Load Level",
    save_level: "Save Level",
    sector_settings: "Sector Settings",
    player_spawn_dir: "Player Direction",
    empty_state_title: "No open levels",
    empty_state_subtitle: "Create a new level from the 'File' menu or load an existing sector.",
    ...(strings?.ui?.level_editor || {})
  }), [strings]);

  const [tabs, setTabs] = useState<any[]>(() => {
    const saved = sessionStorage.getItem("editor_test_tabs");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const saved = sessionStorage.getItem("editor_active_tab");
    if (saved) return saved;
    return null;
  });

  const activeTab = tabs.find(t => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : null);

  const [level, setLevel] = useState<LevelDefinition>(activeTab ? activeTab.level : emptyLevel(0, 0));
  const [width, setWidth] = useState<number | string>(activeTab ? activeTab.width : 20);
  const [height, setHeight] = useState<number | string>(activeTab ? activeTab.height : 20);
  const [currentFloor, setCurrentFloor] = useState(activeTab ? activeTab.currentFloor || 0 : 0);
  const [past, setPast] = useState<LevelDefinition[]>(activeTab ? activeTab.past || [] : []);
  const [future, setFuture] = useState<LevelDefinition[]>(activeTab ? activeTab.future || [] : []);
  
  const [zoom, setZoom] = useState<number>(() => {
    const saved = sessionStorage.getItem("editor_zoom");
    return saved ? parseInt(saved, 10) : 100;
  });

  useEffect(() => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
         return {
           ...t,
           label: level.locationName?.split('/')[0] || "Level",
           level,
           width,
           height,
           currentFloor,
           past,
           future
         };
      }
      return t;
    }));
  }, [level, width, height, currentFloor, past, future, activeTabId]);

  useEffect(() => {
    sessionStorage.setItem("editor_test_tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    sessionStorage.setItem("editor_active_tab", activeTabId || "");
  }, [activeTabId]);

  useEffect(() => {
    if (level && level.fileName) {
      setSaveFileName(level.fileName);
    } else {
      setSaveFileName("");
    }
  }, [activeTabId, level?.fileName]);

  const switchTab = (tabId: string) => {
    const el = gridScrollRef.current;
    if (el && activeTabId) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop } : t));
    }

    const nextTab = tabs.find(t => t.id === tabId);
    if (!nextTab) return;
    setActiveTabId(tabId);
    setLevel(nextTab.level);
    setWidth(nextTab.width);
    setHeight(nextTab.height);
    setCurrentFloor(nextTab.currentFloor || 0);
    setPast(nextTab.past || []);
    setFuture(nextTab.future || []);

    if (el && nextTab.scrollLeft !== undefined && nextTab.scrollTop !== undefined) {
      const sl = nextTab.scrollLeft;
      const st = nextTab.scrollTop;
      setTimeout(() => {
        if (gridScrollRef.current) {
          gridScrollRef.current.scrollLeft = sl;
          gridScrollRef.current.scrollTop = st;
        }
      }, 50);
    }
  };

  const centerOnPlayerSpawn = (targetLevel?: LevelDefinition, floor?: number) => {
    const el = gridScrollRef.current;
    const lvl = targetLevel || level;
    if (!el || !lvl) return;

    const currentFl = floor !== undefined ? floor : currentFloor;
    const spawnSym = lvl.playerStart?.symbol || "S";
    let spawnX = -1;
    let spawnY = -1;
    let spawnFloor = currentFl;

    if (lvl.entities && lvl.entities.length > 0) {
      for (let f = 0; f < lvl.entities.length; f++) {
        const floorEnt = lvl.entities[f];
        if (floorEnt) {
          for (let y = 0; y < floorEnt.length; y++) {
            const x = floorEnt[y].indexOf(spawnSym);
            if (x !== -1) {
              spawnX = x;
              spawnY = y;
              spawnFloor = f;
              break;
            }
          }
        }
        if (spawnX !== -1) break;
      }
    }

    if (spawnX === -1 && spawnSym !== "S" && lvl.entities) {
      for (let f = 0; f < lvl.entities.length; f++) {
        const floorEnt = lvl.entities[f];
        if (floorEnt) {
          for (let y = 0; y < floorEnt.length; y++) {
            const x = floorEnt[y].indexOf("S");
            if (x !== -1) {
              spawnX = x;
              spawnY = y;
              spawnFloor = f;
              break;
            }
          }
        }
        if (spawnX !== -1) break;
      }
    }

    if (spawnX === -1) {
      const gridW = lvl.grids?.[spawnFloor]?.[0]?.length || 20;
      const gridH = lvl.grids?.[spawnFloor]?.length || 20;
      spawnX = Math.floor(gridW / 2);
      spawnY = Math.floor(gridH / 2);
    }

    if (spawnFloor !== currentFl) {
      setCurrentFloor(spawnFloor);
    }

    setTimeout(() => {
      const currentZoom = zoom || 100;
      const zoomFactor = currentZoom / 100;

      const cellCenterX = (spawnX * 32 + 17) * zoomFactor;
      const cellCenterY = (spawnY * 32 + 17) * zoomFactor;

      const viewW = el.clientWidth;
      const viewH = el.clientHeight;

      el.scrollLeft = Math.max(0, cellCenterX - viewW / 2);
      el.scrollTop = Math.max(0, cellCenterY - viewH / 2);
    }, 60);
  };

  const createTab = (newLevel?: LevelDefinition) => {
    const lvl = newLevel || emptyLevel(0, 0);
    const id = "tab_" + Date.now();
    const newTab = {
       id,
       label: lvl.locationName?.split('/')[0] || "New Level",
       level: lvl,
       width: lvl.grids?.[0]?.[0]?.length || 20,
       height: lvl.grids?.[0]?.length || 20,
       currentFloor: 0,
       past: [],
       future: []
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setLevel(lvl);
    setWidth(newTab.width);
    setHeight(newTab.height);
    setCurrentFloor(0);
    setPast([]);
    setFuture([]);

    centerOnPlayerSpawn(lvl, 0);
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const nextTabs = tabs.filter(t => t.id !== tabId);
    if (nextTabs.length === 0) {
      setTabs([]);
      setActiveTabId(null);
      setLevel(emptyLevel(0, 0));
      setWidth(20);
      setHeight(20);
      setCurrentFloor(0);
      setPast([]);
      setFuture([]);
      return;
    }
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      const nextActive = nextTabs[Math.max(0, idx - 1)];
      setActiveTabId(nextActive.id);
      setLevel(nextActive.level); setWidth(nextActive.width); setHeight(nextActive.height); setCurrentFloor(nextActive.currentFloor || 0); setPast(nextActive.past || []); setFuture(nextActive.future || []);
    }
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  type ToolMode = "construction" | "door" | "spawn" | "erase" | "select" | "light" | "portal" | "entity" | "cursor" | "sound" | "particle" | "move" | "tweak_entity" | "eyedropper";
  const [activeTool, setActiveTool] = useState<ToolMode>("cursor");
  const [isFillMode, setIsFillMode] = useState<boolean>(false);

  const [moveSource, setMoveSource] = useState<{x: number, y: number} | null>(null);
  const [moveHoveredCell, setMoveHoveredCell] = useState<{x: number, y: number} | null>(null);
  const moveSourceRef = React.useRef<{x: number, y: number} | null>(null);
  const hoveredCellRef = React.useRef<{x: number, y: number} | null>(null);
  useEffect(() => { moveSourceRef.current = moveSource; }, [moveSource]);

  interface EraseModalData {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    items: { type: 'grid' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string }[];
  }
  const [eraseModalData, setEraseModalData] = useState<EraseModalData | null>(null);

  interface EyedropperModalData {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    items: { type: 'grid' | 'door' | 'portal' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string; data: any }[];
  }
  const [eyedropperModalData, setEyedropperModalData] = useState<EyedropperModalData | null>(null);

  interface TweakPickModalData {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    items: { char: string; listName: 'enemies' | 'NPCs' | 'items' | 'decorations'; config: any }[];
  }
  const [tweakPickData, setTweakPickData] = useState<TweakPickModalData | null>(null);

  const [brushConfig, setBrushConfig] = useState<any>({
    type: "wall",
    assetId: "",
    canBeDestroyed: true,
    faces: {},
  });

  const [doorBrushConfig, setDoorBrushConfig] = useState<any>({
    type: "HINGE",
    dir: "LEFT",
  });
  const [portalBrushConfig, setPortalBrushConfig] = useState<any>({
    targetDirection: "N",
  });
  const [entityBrushConfig, setEntityBrushConfig] = useState<any>({
    entityType: "enemy",
    id: "guard",
  });
  const [soundBrushConfig, setSoundBrushConfig] = useState<any>({
    id: "",
    minInterval: 2000,
    maxInterval: 5000,
    radius: 10
  });
  const [particleBrushConfig, setParticleBrushConfig] = useState<any>({
    definitionId: "",
    z: 0
  });

  const selectEyedropperObject = React.useCallback((item: { type: 'grid' | 'door' | 'portal' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string; data: any }) => {
    if (item.type === 'grid') {
      setBrushConfig(item.data);
      setActiveTool("construction");
      setActivePalette("construction");
    } else if (item.type === 'door') {
      setDoorBrushConfig(item.data);
      setActiveTool("door");
      setActivePalette("doors");
    } else if (item.type === 'portal') {
      setPortalBrushConfig(item.data);
      setActiveTool("portal");
      setActivePalette("portals");
    } else if (item.type === 'entity') {
      if (item.data.isSpawn) {
        setActiveTool("spawn");
        setShowSpawnSettings(true);
      } else {
        const listName = item.data.listName;
        setEntityBrushConfig({
          ...item.data,
          entityType: item.data.entityType || (
            listName === 'enemies' ? 'enemy' :
            listName === 'NPCs' ? 'npc' :
            listName === 'items' ? 'item' : 'decoration'
          )
        });
        setActiveTool("entity");
        setActivePalette("entities");
      }
    } else if (item.type === 'light') {
      setBrushConfig(item.data);
      setActiveTool("light");
      setActivePalette("lights");
    } else if (item.type === 'sound') {
      setSoundBrushConfig(item.data);
      setActiveTool("sound");
      setActivePalette("sounds");
    } else if (item.type === 'particle') {
      setParticleBrushConfig({
        definitionId: item.data.definitionId,
        z: item.data.z || 0
      });
      setActiveTool("particle");
      setActivePalette("particles");
    }
  }, [setBrushConfig, setDoorBrushConfig, setPortalBrushConfig, setEntityBrushConfig, setSoundBrushConfig, setParticleBrushConfig]);

  const lastClickRef = React.useRef<{ x: number; y: number } | null>(null);

  const [showBrushModal, setShowBrushModal] = useState(false);
  const [showDoorModal, setShowDoorModal] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [showTweakModal, setShowTweakModal] = useState(false);
  const [tweakEntityData, setTweakEntityData] = useState<any>(null);
  const [showLightModal, setShowLightModal] = useState(false);
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [showDialogueEditor, setShowDialogueEditor] = useState(false);
  const [assetEditorMode, setAssetEditorMode] = useState<string | null>(null);
  const [showSectorSettings, setShowSectorSettings] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [showIsometricView, setShowIsometricView] = useState(false);
  const [viewLightPreview, setViewLightPreview] = useState(false);
  const [viewSoundRadius, setViewSoundRadius] = useState(false);
  const [viewPortals, setViewPortals] = useState(true);
  const [viewScripts, setViewScripts] = useState(false);
  const [editorLightMap, setEditorLightMap] = useState<{r:number, g:number, b:number}[][] | null>(null);
  
  // Pre-calculate/memoize lookups for the map render loop to bypass O(N) array scans inside cells
  const overriddenCellsSet = React.useMemo(() => {
    const set = new Set<string>();
    if (!level.entityOverrides) return set;
    for (const key in level.entityOverrides) {
      const data = level.entityOverrides[key];
      if (data && Object.keys(data).length > 0) {
        const parts = key.split('_');
        if (parts.length >= 3) {
          set.add(`${parts[0]}_${parts[1]}_${parts[2]}`);
        }
      }
    }
    return set;
  }, [level.entityOverrides]);

  const constructionMap = React.useMemo(() => {
    const map = new Map<string, any>();
    level.construction?.forEach((c) => {
      if (c && c.symbol) map.set(c.symbol, c);
    });
    return map;
  }, [level.construction]);

  const portalMap = React.useMemo(() => {
    const map = new Map<string, any>();
    level.portals?.forEach((p) => {
      if (p && p.symbol) map.set(p.symbol, p);
    });
    return map;
  }, [level.portals]);

  const soundMap = React.useMemo(() => {
    const map = new Map<string, any>();
    level.ambientSounds?.forEach((s: any) => {
      if (s && s.symbol) map.set(s.symbol, s);
    });
    return map;
  }, [level.ambientSounds]);

  const scriptTriggersOnEnterSet = React.useMemo(() => {
    const set = new Set<string>();
    if (viewScripts && level.triggers) {
      for (const t of level.triggers) {
        if (t && t.type === 'ON_ENTER_TILE' && t.params?.x !== undefined && t.params?.y !== undefined) {
          set.add(`${t.params.x},${t.params.y}`);
        }
      }
    }
    return set;
  }, [viewScripts, level.triggers]);

  const resolveCombo = React.useCallback((symbol: string): string[] => {
    if (!symbol || symbol === '.') return [];
    
    const item = level.items?.find((i: any) => i.symbol === symbol);
    if (item && item.combo && Array.isArray(item.combo)) {
      return item.combo.flatMap(resolveCombo);
    }
    
    const enemy = level.enemies?.find((e: any) => e.symbol === symbol);
    if (enemy && enemy.combo && Array.isArray(enemy.combo)) {
      return enemy.combo.flatMap(resolveCombo);
    }
    
    const npc = level.NPCs?.find((n: any) => n.symbol === symbol);
    if (npc && npc.combo && Array.isArray(npc.combo)) {
      return npc.combo.flatMap(resolveCombo);
    }
    
    const decor = level.decorations?.find((d: any) => d.symbol === symbol);
    if (decor && decor.combo && Array.isArray(decor.combo)) {
      return decor.combo.flatMap(resolveCombo);
    }
    
    const leg = level.legend?.find((l: any) => l.char === symbol);
    if (leg) {
      if ((leg as any).combo && Array.isArray((leg as any).combo)) {
        return (leg as any).combo.flatMap(resolveCombo);
      }
      if ((leg as any).entities && Array.isArray((leg as any).entities)) {
        return (leg as any).entities.flatMap(resolveCombo);
      }
    }
    
    return [symbol];
  }, [level]);

  const getComboSymbol = React.useCallback((symbols: string[], resultingLevel: LevelDefinition) => {
    if (symbols.length === 0) return ".";
    if (symbols.length === 1) return symbols[0];
    const sorted = [...symbols].sort();
    
    const existingCombo = resultingLevel.items?.find((i: any) => 
      i.combo && 
      Array.isArray(i.combo) && 
      i.combo.length === sorted.length && 
      [...i.combo].sort().every((v, idx) => v === sorted[idx])
    ) || resultingLevel.decorations?.find((d: any) => 
      d.combo && 
      Array.isArray(d.combo) && 
      d.combo.length === sorted.length && 
      [...d.combo].sort().every((v, idx) => v === sorted[idx])
    ) || resultingLevel.legend?.find((l: any) => 
      (l as any).combo && 
      Array.isArray((l as any).combo) && 
      (l as any).combo.length === sorted.length && 
      [...(l as any).combo].sort().every((v, idx) => v === sorted[idx])
    );
    if (existingCombo) return (existingCombo.symbol || (existingCombo as any).char);
    
    const newSymbol = getAvailableSymbol(resultingLevel, "item");
    if (!resultingLevel.items) resultingLevel.items = [];
    
    resultingLevel.items.push({
      symbol: newSymbol,
      id: "combo_" + Math.random().toString(36).substr(2, 9),
      type: "COMBO" as any,
      combo: sorted
    } as any);

    return newSymbol;
  }, []);

  const scriptTriggersRadiusList = React.useMemo(() => {
    if (!viewScripts || !level.triggers) return [];
    return level.triggers.filter((t: any) => 
      t && t.type === 'ON_ENTER_TILE' && 
      t.params?.x !== undefined && 
      t.params?.y !== undefined && 
      t.params?.radius > 0
    );
  }, [viewScripts, level.triggers]);
  
  const [testCharacter, setTestCharacter] = useState<"male" | "female">(() => {
    const saved = sessionStorage.getItem("editor_test_character");
    return (saved === "male" || saved === "female") ? saved : "male";
  });

  useEffect(() => {
    sessionStorage.setItem("editor_test_character", testCharacter);
  }, [testCharacter]);

  useEffect(() => {
    sessionStorage.setItem("editor_zoom", zoom.toString());
  }, [zoom]);
  
  const [activeInput, setActiveInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
     if ((!viewLightPreview && !showIsometricView) || !level.grids || !level.grids[currentFloor] || level.grids[currentFloor].length === 0) {
         setEditorLightMap(null);
         return;
     }

     const height = level.grids[currentFloor].length;
     const width = level.grids[currentFloor][0]?.length || 0;
     const globalR = level.globalLight ?? 1.0;
     const globalG = level.globalLight ?? 1.0;
     const globalB = level.globalLight ?? 1.0;
     const lMap = Array.from({ length: height }, () => 
      Array.from({ length: width }, () => ({ r: globalR, g: globalG, b: globalB }))
     );

     const sources: {x:number,y:number,r:number,g:number,b:number,range:number}[] = [];
     const lightGrid = level.gridLight;
     for (let y = 0; y < height; y++) {
         const rowStr = lightGrid && lightGrid[y] ? lightGrid[y] : '';
         for (let x = 0; x < width; x++) {
             const char = x < rowStr.length ? rowStr[x] : '.';
             if (char !== '.' && char !== ' ') {
                 let r = 1, g = 1, b = 1, range = 6, intensity = 1;
                 const def = level.lightDefinitions?.[char];
                 if (def) {
                     r = def.r > 1 ? def.r / 255 : def.r;
                     g = def.g > 1 ? def.g / 255 : def.g;
                     b = def.b > 1 ? def.b / 255 : def.b;
                     intensity = def.intensity ?? 1;
                     range = def.range ?? 6;
                 } else if (char >= '1' && char <= '9') {
                     intensity = parseInt(char) / 9;
                 } else if (char === 'F') {
                     intensity = 1.2;
                 }
                 sources.push({ x, y, r: r*intensity, g: g*intensity, b: b*intensity, range });
             }
         }
     }

     const visited = new Uint8Array(width * height);
     sources.forEach(source => {
         const queue: {x: number, y: number, r: number, g: number, b: number}[] = [];
         let head = 0;
         visited.fill(0);
         queue.push({ x: source.x, y: source.y, r: source.r, g: source.g, b: source.b });
         visited[source.y * width + source.x] = 1;
         
         while (head < queue.length) {
             const { x, y, r, g, b } = queue[head++];
             
             lMap[y][x].r = Math.min(1.0, lMap[y][x].r + r);
             lMap[y][x].g = Math.min(1.0, lMap[y][x].g + g);
             lMap[y][x].b = Math.min(1.0, lMap[y][x].b + b);
             
             const maxBright = Math.max(r, g, b);
             if (maxBright <= 0.05) continue; 
             const dirs = [
                 { dx: 0, dy: 1, dist: 1 }, { dx: 0, dy: -1, dist: 1 },
                 { dx: 1, dy: 0, dist: 1 }, { dx: -1, dy: 0, dist: 1 },
                 { dx: 1, dy: 1, dist: 1.414 }, { dx: 1, dy: -1, dist: 1.414 },
                 { dx: -1, dy: 1, dist: 1.414 }, { dx: -1, dy: -1, dist: 1.414 }
             ];
             for (const {dx, dy, dist} of dirs) {
                 const nx = x + dx; const ny = y + dy;
                 if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                     const idx = ny * width + nx;
                     if (visited[idx] === 0) {
                         visited[idx] = 1;
                         const cChar = level.grids[currentFloor][ny]?.[nx] || ' ';
                         const eChar = level.entities?.[currentFloor]?.[ny]?.[nx] || '.';
                         let isWall = cChar === '#';
                         let isDoorClosed = false;
                         if (level.doorDefinitions && level.doorDefinitions[eChar]) isDoorClosed = true;
                         else if (level.construction?.find(c => c.symbol === cChar)?.type === 'wall' || level.construction?.find(c => c.symbol === cChar)?.type === 'window') isWall = true;

                         let decayBase = 1.0 / source.range; 
                         if (isWall) decayBase = 2.0; 
                         if (isDoorClosed) decayBase = 2.0; 
                         const decay = decayBase * dist;
                         const nextR = Math.max(0, r - decay);
                         const nextG = Math.max(0, g - decay);
                         const nextB = Math.max(0, b - decay);
                         if (Math.max(nextR, nextG, nextB) > 0) {
                             queue.push({ x: nx, y: ny, r: nextR, g: nextG, b: nextB });
                         }
                     }
                 }
             }
         }
     });

     setEditorLightMap(lMap);
  }, [viewLightPreview, showIsometricView, level.grids, level.gridLight, level.lightDefinitions, level.globalLight, level.construction, level.doorDefinitions, currentFloor]);

  const [showSpawnSettings, setShowSpawnSettings] = useState(false);

  const [showTasksSettings, setShowTasksSettings] = useState(false);
  const [showScriptsModal, setShowScriptsModal] = useState(false);
  const [pickingCoordinateCallback, setPickingCoordinateCallback] = useState<
    ((x: number, y: number) => void) | null
  >(null);
  const [pickingCoordinateSelected, setPickingCoordinateSelected] = useState<{x: number, y: number} | null>(null);
  const [pickingModalSource, setPickingModalSource] = useState<'scripts' | 'brush' | null>(null);
  const [activeMenu, setActiveMenu] = useState<
    "file" | "edit" | "settings" | "view" | null
  >(null);

  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const isSpaceDownRef = React.useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
         activeEl.tagName === "TEXTAREA" ||
         activeEl.tagName === "SELECT" ||
         (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        isSpaceDownRef.current = true;
        setIsSpaceDown(true);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = false;
        setIsSpaceDown(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  type PaletteTab = 'construction' | 'doors' | 'lights' | 'portals' | 'entities' | 'sounds' | 'particles';
  const [activePalette, setActivePalette] = useState<PaletteTab>('construction');
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [constructionTypeFilter, setConstructionTypeFilter] = useState<'all' | 'wall' | 'floor' | 'window'>('all');

  const entityAssetCache = React.useMemo(() => {
    const cache: Record<string, string | null> = {};
    const lists = [
      { name: 'enemies', data: enemiesData },
      { name: 'NPCs', data: npcsData },
      { name: 'items', data: itemsData },
      { name: 'decorations', data: decorationsData }
    ];
    lists.forEach(l => {
      const arr = (level as any)[l.name] || [];
      arr.forEach((e: any) => {
         let assetSource = null;
         const def = (l.data as any)[e.id];
         if (def) {
            if (l.name === 'enemies' || l.name === 'NPCs') {
               assetSource = def.assets?.map?.assetId || def.assets?.portrait;
            } else if (l.name === 'items' || l.name === 'decorations') {
               assetSource = def.assetId;
            }
         }
         cache[e.symbol] = assetSource || null;
      });
    });
    return cache;
  }, [level.enemies, level.NPCs, level.items, level.decorations]);

  const entityEmptynessCache = React.useMemo(() => {
    const cache: Record<string, boolean> = {};
    const decs = level.decorations || [];
    decs.forEach((e: any) => {
        const def = (decorationsData as any)[e.id];
        if (def && def.isEmptyness) {
            cache[e.symbol] = true;
        }
    });
    return cache;
  }, [level.decorations]);

  const entityIsBoxCache = React.useMemo(() => {
    const cache: Record<string, boolean> = {};
    const decs = level.decorations || [];
    decs.forEach((e: any) => {
        const def = (decorationsData as any)[e.id];
        if (def && def.isBox) {
            cache[e.symbol] = true;
        }
    });
    return cache;
  }, [level.decorations]);

  const pastRef = React.useRef<LevelDefinition[]>(past);
  const futureRef = React.useRef<LevelDefinition[]>(future);
  const levelRef = React.useRef<LevelDefinition>(level);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState(level?.fileName || "");
  const [selectionStart, setSelectionStart] = useState<{x: number, y: number} | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{x: number, y: number} | null>(null);
  const [clipboard, setClipboard] = useState<{width: number, height: number, grids: string[], entities: string[], overrides?: any} | null>(null);

  const longPressStateRef = React.useRef<{ timer: ReturnType<typeof setTimeout> | null, startX: number, startY: number, cellX: number, cellY: number, shift: boolean, primary: boolean } | null>(null);

  const selectionStartRef = React.useRef(selectionStart);
  const selectionEndRef = React.useRef(selectionEnd);
  const clipboardRef = React.useRef(clipboard);
  const activeToolRef = React.useRef(activeTool);
  const currentFloorRef = React.useRef(currentFloor);
  const gridScrollRef = React.useRef<HTMLDivElement>(null);
  const touchPointersRef = React.useRef<Map<number, { x: number; y: number }>>(new Map());
  const touchLastCenterRef = React.useRef<{ x: number; y: number } | null>(null);

  const brushConfigRef = React.useRef(brushConfig);
  const doorBrushConfigRef = React.useRef(doorBrushConfig);
  const portalBrushConfigRef = React.useRef(portalBrushConfig);
  const entityBrushConfigRef = React.useRef(entityBrushConfig);
  const soundBrushConfigRef = React.useRef(soundBrushConfig);
  const particleBrushConfigRef = React.useRef(particleBrushConfig);
  const isFillModeRef = React.useRef(isFillMode);
  const viewLightPreviewRef = React.useRef(viewLightPreview);
  const pickingCoordinateCallbackRef = React.useRef(pickingCoordinateCallback);
  const lastDraggedCellRef = React.useRef<{ x: number; y: number } | null>(null);
  const handleCellDrawRef = React.useRef<any>(null);

  useEffect(() => { selectionStartRef.current = selectionStart; }, [selectionStart]);
  useEffect(() => { selectionEndRef.current = selectionEnd; }, [selectionEnd]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { currentFloorRef.current = currentFloor; }, [currentFloor]);
  useEffect(() => { brushConfigRef.current = brushConfig; }, [brushConfig]);
  useEffect(() => { doorBrushConfigRef.current = doorBrushConfig; }, [doorBrushConfig]);
  useEffect(() => { portalBrushConfigRef.current = portalBrushConfig; }, [portalBrushConfig]);
  useEffect(() => { entityBrushConfigRef.current = entityBrushConfig; }, [entityBrushConfig]);
  useEffect(() => { soundBrushConfigRef.current = soundBrushConfig; }, [soundBrushConfig]);
  useEffect(() => { particleBrushConfigRef.current = particleBrushConfig; }, [particleBrushConfig]);
  useEffect(() => { isFillModeRef.current = isFillMode; }, [isFillMode]);
  useEffect(() => { viewLightPreviewRef.current = viewLightPreview; }, [viewLightPreview]);
  useEffect(() => { pickingCoordinateCallbackRef.current = pickingCoordinateCallback; }, [pickingCoordinateCallback]);

  const [tempDrawOverlay, setTempDrawOverlay] = useState<Record<number, Record<number, { cell?: string; ent?: string; itemCell?: string; lightChar?: string; soundChar?: string }>> | null>(null);
  const currentStrokeRef = React.useRef<Array<{ x: number; y: number; shiftKey: boolean; isRightClick: boolean; explicitEraseType?: 'grid' | 'entity' | 'light' | 'sound' | 'particle' | 'all' }>>([]);

  const getPreviewChangesForCoord = React.useCallback((
    x: number,
    y: number,
    tool: string,
    isRightClick: boolean,
    explicitEraseType?: 'grid' | 'entity' | 'light' | 'sound' | 'particle' | 'all'
  ) => {
    const effectiveTool = isRightClick ? "erase" : tool;
    const levelVal = levelRef.current;
    
    if (effectiveTool === "erase") {
      const eraseAll = !explicitEraseType || explicitEraseType === 'all';
      return {
        cell: (eraseAll || explicitEraseType === 'grid') ? ' ' : undefined,
        ent: (eraseAll || explicitEraseType === 'entity') ? '.' : undefined,
        itemCell: (eraseAll || explicitEraseType === 'entity') ? '.' : undefined,
        lightChar: (eraseAll || explicitEraseType === 'light') ? '.' : undefined,
        soundChar: (eraseAll || explicitEraseType === 'sound') ? '.' : undefined,
      };
    }
    
    if (effectiveTool === "construction") {
      const { symbol } = resolveBrushSymbol(brushConfigRef.current, levelVal);
      return { cell: symbol };
    }
    
    if (effectiveTool === "door") {
      const { symbol } = resolveDoorBrushSymbol(doorBrushConfigRef.current, levelVal);
      return { ent: symbol };
    }
    
    if (effectiveTool === "portal") {
      const { symbol } = resolvePortalBrushSymbol(portalBrushConfigRef.current, levelVal);
      return { ent: symbol };
    }
    
    if (effectiveTool === "entity") {
      const { symbol } = resolveEntityBrushSymbol(entityBrushConfigRef.current, levelVal);
      const isItem = levelVal.items?.some((i: any) => i.symbol === symbol);
      if (isItem) {
        return { itemCell: symbol };
      } else {
        return { ent: symbol };
      }
    }
    
    if (effectiveTool === "sound") {
      const { symbol } = resolveSoundBrushSymbol(soundBrushConfigRef.current, levelVal);
      return { soundChar: symbol };
    }
    
    if (effectiveTool === "light") {
      const { symbol } = resolveLightBrushSymbol(brushConfigRef.current, levelVal);
      return { lightChar: symbol };
    }
    
    if (effectiveTool === "spawn") {
      const spawnSym = levelVal.playerStart?.symbol || "S";
      return { ent: spawnSym };
    }
    
    return {};
  }, []);

  const addCellToStrokeDraft = React.useCallback((
    x: number,
    y: number,
    shiftKey: boolean,
    isRightClick: boolean,
    explicitEraseType?: 'grid' | 'entity' | 'light' | 'sound' | 'particle' | 'all',
    clientX?: number,
    clientY?: number
  ) => {
    const effectiveTool = isRightClick ? 'erase' : activeToolRef.current;
    
    if (effectiveTool === 'erase' && !isFillModeRef.current && !shiftKey && !explicitEraseType) {
      const gridCell = levelRef.current.grids[currentFloorRef.current]?.[y]?.[x] || ' ';
      const entCell = levelRef.current.entities?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const lightCell = levelRef.current.gridLight?.[y]?.[x] || '.';
      const soundCell = levelRef.current.gridSounds?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const particleExists = levelRef.current.particles?.some((p: any) => Math.floor(p.x) === x && Math.floor(p.y) === y);

      const items: { type: 'grid' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string }[] = [];
      if (gridCell !== ' ') {
         const cInfo = levelRef.current.construction?.find((c: any) => c.symbol === gridCell);
         const word = cInfo ? (cInfo.type === 'wall' ? (uiStrings.desc_wall || 'Wall') : (uiStrings.desc_floor || 'Floor')) : 
                        (gridCell === '.' ? (uiStrings.desc_floor || 'Floor') : (gridCell === '.' ? 'Floor' : 'Grid'));
         items.push({ type: 'grid', char: gridCell, desc: `${word} (${gridCell})` });
      }
      if (entCell !== '.' && entCell !== ' ') {
         let desc = `${uiStrings.desc_entity || 'Entity'} (${entCell})`;
         if (entCell === (levelRef.current.playerStart?.symbol || 'S')) desc = `${uiStrings.desc_spawn || 'Spawn'} (${entCell})`;
         else if (levelRef.current.doorDefinitions?.[entCell]) desc = `${uiStrings.desc_door || 'Door'} (${entCell})`;
         else if (levelRef.current.portals?.find((p: any) => p.symbol === entCell)) desc = `${uiStrings.desc_portal || 'Portal'} (${entCell})`;
         else if (levelRef.current.enemies?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_enemy || 'Enemy'} (${entCell})`;
         else if (levelRef.current.NPCs?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_npc || 'NPC'} (${entCell})`;
         else if (levelRef.current.items?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_item || 'Item'} (${entCell})`;
         else if (levelRef.current.decorations?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_decoration || 'Decoration'} (${entCell})`;
         items.push({ type: 'entity', char: entCell, desc });
      }
      if (lightCell !== '.' && lightCell !== ' ') {
         items.push({ type: 'light', char: lightCell, desc: `${uiStrings.desc_light || 'Light'} (${lightCell})` });
      }
      if (soundCell !== '.' && soundCell !== ' ') {
         items.push({ type: 'sound', char: soundCell, desc: `${uiStrings.desc_sound || 'Sound'} (${soundCell})` });
      }
      if (particleExists) {
         items.push({ type: 'particle', char: '*', desc: `Particle (*)` });
      }

      if (items.length > 1) {
         if (clientX !== undefined && clientY !== undefined) {
            setEraseModalData({ x, y, items, clientX, clientY });
            return;
         }
      }
    }

    const changes = getPreviewChangesForCoord(x, y, activeToolRef.current, isRightClick, explicitEraseType);
    
    const alreadyExists = currentStrokeRef.current.some(c => c.x === x && c.y === y);
    if (!alreadyExists) {
      currentStrokeRef.current.push({
        x,
        y,
        shiftKey,
        isRightClick,
        explicitEraseType,
      });
    }

    setTempDrawOverlay((prev) => {
      const next = prev ? { ...prev } : {};
      if (!next[y]) {
        next[y] = {};
      } else {
        next[y] = { ...next[y] };
      }
      next[y][x] = changes;
      return next;
    });
  }, [getPreviewChangesForCoord]);

  const applyCompletedStroke = React.useCallback(() => {
    const stroke = currentStrokeRef.current;
    if (!stroke || stroke.length === 0) return;

    recordHistory();

    setLevel((prevLevel) => {
      let resultingLevel = smartCloneLevel(prevLevel);

      if (!resultingLevel.entities) {
        resultingLevel.entities = [];
      }
      for (let f = 0; f < resultingLevel.grids.length; f++) {
        const h = resultingLevel.grids[f]?.length || 20;
        const w = resultingLevel.grids[f]?.[0]?.length || 20;
        if (!resultingLevel.entities[f] || resultingLevel.entities[f].length !== h) {
          resultingLevel.entities[f] = Array(h).fill(".".repeat(w));
        }
      }

      if (!resultingLevel.itemsGrid) {
        resultingLevel.itemsGrid = [];
      }
      for (let f = 0; f < resultingLevel.grids.length; f++) {
        const h = resultingLevel.grids[f]?.length || 20;
        const w = resultingLevel.grids[f]?.[0]?.length || 20;
        if (!resultingLevel.itemsGrid[f] || resultingLevel.itemsGrid[f].length !== h) {
          resultingLevel.itemsGrid[f] = Array(h).fill(".".repeat(w));
        }
      }

      if (resultingLevel.gridSounds) {
        for (let f = 0; f < resultingLevel.grids.length; f++) {
          const h = resultingLevel.grids[f]?.length || 20;
          const w = resultingLevel.grids[f]?.[0]?.length || 20;
          if (!resultingLevel.gridSounds[f] || resultingLevel.gridSounds[f].length !== h) {
            resultingLevel.gridSounds[f] = Array(h).fill(".".repeat(w));
          }
        }
      }

      for (const step of stroke) {
        const { x, y, isRightClick, explicitEraseType } = step;
        const effectiveTool = isRightClick ? "erase" : activeToolRef.current;

        let writeSymbol = ".";
        if (effectiveTool === "construction") {
          const { symbol, newConstruction } = resolveBrushSymbol(
            brushConfigRef.current,
            resultingLevel,
          );
          writeSymbol = symbol;
          if (newConstruction) {
            const consts = [...(resultingLevel.construction || [])];
            const existingIdx = consts.findIndex((c: any) => c.symbol === symbol);
            if (existingIdx >= 0) {
              consts[existingIdx] = newConstruction;
            } else {
              consts.push(newConstruction);
              if (brushConfigRef.current.symbol !== symbol) {
                brushConfigRef.current.symbol = symbol;
                setBrushConfig(newConstruction);
              }
            }
            resultingLevel.construction = consts;
          }
        } else if (effectiveTool === "door") {
          const { symbol, newDoorConfig } = resolveDoorBrushSymbol(
            doorBrushConfigRef.current,
            resultingLevel,
          );
          writeSymbol = symbol;
          if (newDoorConfig) {
            const defs = { ...(resultingLevel.doorDefinitions || {}) };
            defs[symbol] = newDoorConfig;
            resultingLevel.doorDefinitions = defs;
            if (doorBrushConfigRef.current.symbol !== symbol) {
              doorBrushConfigRef.current.symbol = symbol;
              setDoorBrushConfig(newDoorConfig);
            }
          }
        } else if (effectiveTool === "portal") {
          const { symbol, newPortalConfig } = resolvePortalBrushSymbol(
            portalBrushConfigRef.current,
            resultingLevel
          );
          writeSymbol = symbol;
          if (newPortalConfig) {
            const portals = [...(resultingLevel.portals || [])];
            const existingIdx = portals.findIndex((p: any) => p.symbol === symbol);
            if (existingIdx >= 0) {
              portals[existingIdx] = newPortalConfig;
            } else {
              portals.push(newPortalConfig);
              if (portalBrushConfigRef.current.symbol !== symbol) {
                portalBrushConfigRef.current.symbol = symbol;
                setPortalBrushConfig(newPortalConfig);
              }
            }
            resultingLevel.portals = portals;
          }
        } else if (effectiveTool === "entity") {
          const { symbol, newEntityConfig } = resolveEntityBrushSymbol(
            entityBrushConfigRef.current,
            resultingLevel
          );
          writeSymbol = symbol;
          if (newEntityConfig) {
            const listName = newEntityConfig.entityType === 'enemy' ? 'enemies' : newEntityConfig.entityType === 'npc' ? 'NPCs' : newEntityConfig.entityType === 'item' ? 'items' : 'decorations';
            const list = [...(resultingLevel[listName] || [])];
            const existingIdx = list.findIndex((c: any) => c.symbol === symbol);
            if (existingIdx >= 0) {
              list[existingIdx] = newEntityConfig;
            } else {
              list.push(newEntityConfig);
              if (entityBrushConfigRef.current.symbol !== symbol) {
                entityBrushConfigRef.current.symbol = symbol;
                setEntityBrushConfig(newEntityConfig);
              }
            }
            resultingLevel[listName] = list;
          }
        } else if (effectiveTool === "sound") {
          const { symbol, newSoundConfig } = resolveSoundBrushSymbol(
            soundBrushConfigRef.current,
            resultingLevel
          );
          writeSymbol = symbol;
          if (newSoundConfig) {
            const sounds = [...(resultingLevel.ambientSounds || [])];
            const existingIdx = sounds.findIndex((s: any) => s.symbol === symbol);
            if (existingIdx >= 0) {
              sounds[existingIdx] = newSoundConfig;
            } else {
              sounds.push(newSoundConfig);
              if (soundBrushConfigRef.current.symbol !== symbol) {
                soundBrushConfigRef.current.symbol = symbol;
                setSoundBrushConfig(newSoundConfig);
              }
            }
            resultingLevel.ambientSounds = sounds;
          }
        } else if (effectiveTool === "light") {
          const { symbol, newLightConfig } = resolveLightBrushSymbol(
            brushConfigRef.current,
            resultingLevel
          );
          writeSymbol = symbol;
          if (newLightConfig && symbol && symbol !== '.') {
            const defs = { ...(resultingLevel.lightDefinitions || {}) };
            defs[symbol] = newLightConfig;
            resultingLevel.lightDefinitions = defs;
            if (brushConfigRef.current.symbol !== symbol) {
              brushConfigRef.current.symbol = symbol;
              setBrushConfig(newLightConfig);
            }
          }
        } else if (effectiveTool === "erase") {
          writeSymbol = " ";
        }

        const px = x;
        const py = y;

        if (effectiveTool === "spawn") {
          let spawnSym = resultingLevel.playerStart?.symbol;
          const previousSpawnSym = spawnSym || "S";

          if (!spawnSym) {
            spawnSym = getAvailableSymbol(resultingLevel, "entity", "S");
            resultingLevel.playerStart = {
              symbol: spawnSym,
              dir: resultingLevel.playerStart?.dir || "N",
            };
          }

          for (let f = 0; f < resultingLevel.entities.length; f++) {
            const floorGrid = resultingLevel.entities[f];
            for (let r = 0; r < floorGrid.length; r++) {
              if (floorGrid[r].includes(previousSpawnSym)) {
                floorGrid[r] = floorGrid[r].split(previousSpawnSym).join(".");
              }
              if (spawnSym !== previousSpawnSym && floorGrid[r].includes(spawnSym)) {
                floorGrid[r] = floorGrid[r].split(spawnSym).join(".");
              }
            }
          }

          const currentEntitiesGrid = resultingLevel.entities[currentFloorRef.current];
          const row = currentEntitiesGrid[py].split("");
          row[px] = spawnSym;
          currentEntitiesGrid[py] = row.join("");

          const newGrid = resultingLevel.grids[currentFloorRef.current];
          const cellChar = newGrid[py][px];
          const isWallCell = cellChar === "#" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "wall" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "window";
          if (isWallCell) {
            const gridRow = newGrid[py].split("");
            gridRow[px] = ".";
            newGrid[py] = gridRow.join("");
          }
        } else if (effectiveTool === "particle") {
          if (!resultingLevel.particles) resultingLevel.particles = [];
          if (particleBrushConfigRef.current.definitionId) {
             const existingIdx = resultingLevel.particles.findIndex((p: any) => Math.floor(p.x) === px && Math.floor(p.y) === py);
             if (existingIdx >= 0) {
                 resultingLevel.particles[existingIdx].definitionId = particleBrushConfigRef.current.definitionId;
                 resultingLevel.particles[existingIdx].z = particleBrushConfigRef.current.z || 0;
             } else {
                 resultingLevel.particles.push({
                     id: Math.random().toString(36).substring(2, 9),
                     definitionId: particleBrushConfigRef.current.definitionId,
                     x: px + 0.5,
                     y: py + 0.5,
                     z: particleBrushConfigRef.current.z || 0
                 });
             }
          }
        } else if (effectiveTool === "portal" || effectiveTool === "entity" || effectiveTool === "door") {
          const isItem = effectiveTool === "entity" && resultingLevel.items?.some((i: any) => i.symbol === writeSymbol);
          const isDecor = effectiveTool === "entity" && resultingLevel.decorations?.some((d: any) => d.symbol === writeSymbol);

          if (isItem) {
             if (!resultingLevel.itemsGrid) {
                 const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
                 resultingLevel.itemsGrid = resultingLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
             }
             if (!resultingLevel.itemsGrid[currentFloorRef.current]) {
                 resultingLevel.itemsGrid[currentFloorRef.current] = Array(resultingLevel.grids[currentFloorRef.current].length).fill(".".repeat(resultingLevel.grids[currentFloorRef.current][0].length));
             }
             const grid = resultingLevel.itemsGrid[currentFloorRef.current];
             const row = grid[py].split("");
             const currentBaseItems = resolveCombo(row[px]);
             const newBaseItems = [...currentBaseItems, writeSymbol];
             const comboSym = getComboSymbol(newBaseItems, resultingLevel);
             if (row[px] !== comboSym && resultingLevel.entityOverrides) {
                 delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_items`];
             }
             row[px] = comboSym;
             grid[py] = row.join("");
          } else if (isDecor) {
             const newEntitiesGrid = resultingLevel.entities[currentFloorRef.current];
             const row = newEntitiesGrid[py].split("");
             const currentSymbol = row[px];
             if (currentSymbol && currentSymbol !== ".") {
               const currentBaseEnts = resolveCombo(currentSymbol);
               const isAllDecors = currentBaseEnts.length > 0 && currentBaseEnts.every(sym => resultingLevel.decorations?.some((d: any) => d.symbol === sym));
               if (isAllDecors) {
                 const newBaseEnts = [...currentBaseEnts, writeSymbol];
                 const comboSym = getComboSymbol(newBaseEnts, resultingLevel);
                 if (row[px] !== comboSym && resultingLevel.entityOverrides) {
                   delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_decorations`];
                 }
                 row[px] = comboSym;
               } else {
                 if (row[px] !== writeSymbol && resultingLevel.entityOverrides) {
                   delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                   for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                     delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                   }
                 }
                 row[px] = writeSymbol;
               }
             } else {
               row[px] = writeSymbol;
             }
             newEntitiesGrid[py] = row.join("");
          } else {
             const newEntitiesGrid = resultingLevel.entities[currentFloorRef.current];
             const row = newEntitiesGrid[py].split("");
             if (row[px] !== writeSymbol && resultingLevel.entityOverrides) {
                 delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                 for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                     delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                 }
             }
             row[px] = writeSymbol;
             newEntitiesGrid[py] = row.join("");
          }

          if (effectiveTool === "portal" || effectiveTool === "door") {
             const newGrid = resultingLevel.grids[currentFloorRef.current];
             const cellChar = newGrid[py][px];
             const isWallCell = cellChar === "#" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "wall" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "window";
             if (isWallCell) {
               const gridRow = newGrid[py].split("");
               gridRow[px] = ".";
               newGrid[py] = gridRow.join("");
             }
          }
        } else if (effectiveTool === "light") {
          if (!resultingLevel.gridLight) {
              const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
              resultingLevel.gridLight = Array(resultingLevel.grids[0].length).fill(rowTemplate);
          }
          const tgtGrid = resultingLevel.gridLight;
          if (tgtGrid[py]) {
            const row = tgtGrid[py].split("");
            row[px] = writeSymbol;
            tgtGrid[py] = row.join("");
          }
        } else if (effectiveTool === "sound") {
          if (!resultingLevel.gridSounds) {
              const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
              resultingLevel.gridSounds = resultingLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
          }
          const tgtGrid = resultingLevel.gridSounds[currentFloorRef.current];
          if (tgtGrid && tgtGrid[py]) {
            const row = tgtGrid[py].split("");
            row[px] = writeSymbol;
            tgtGrid[py] = row.join("");
          }
        } else {
          const newGrid = resultingLevel.grids[currentFloorRef.current];
          const row = newGrid[py].split("");

          if (effectiveTool === "erase") {
            const eraseAll = !explicitEraseType || explicitEraseType === 'all';
            const newEntities = resultingLevel.entities[currentFloorRef.current];
            if ((eraseAll || explicitEraseType === 'entity') && newEntities && newEntities[py]) {
              const entRow = newEntities[py].split("");
              const currentSymbolOnCell = entRow[px];
              if (currentSymbolOnCell !== ".") {
                const currentBaseEnts = resolveCombo(currentSymbolOnCell);
                if (currentBaseEnts.length > 1) {
                  const newBaseEnts = currentBaseEnts.slice(0, currentBaseEnts.length - 1);
                  const newCellSymbol = getComboSymbol(newBaseEnts, resultingLevel);
                  entRow[px] = newCellSymbol;
                } else {
                  entRow[px] = ".";
                  if (resultingLevel.entityOverrides) {
                     delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                     for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                         delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                     }
                  }
                }
                newEntities[py] = entRow.join("");
              }
            }
            if ((eraseAll || explicitEraseType === 'entity') && resultingLevel.itemsGrid && resultingLevel.itemsGrid[currentFloorRef.current] && resultingLevel.itemsGrid[currentFloorRef.current][py]) {
              const itemRow = resultingLevel.itemsGrid[currentFloorRef.current][py].split("");
              const currentSymbolOnCell = itemRow[px];
              if (currentSymbolOnCell !== ".") {
                const currentBaseItems = resolveCombo(currentSymbolOnCell);
                if (currentBaseItems.length > 1) {
                  const newBaseItems = currentBaseItems.slice(0, currentBaseItems.length - 1);
                  const newCellSymbol = getComboSymbol(newBaseItems, resultingLevel);
                  itemRow[px] = newCellSymbol;
                } else {
                  itemRow[px] = ".";
                  if (resultingLevel.entityOverrides) {
                     delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_items`];
                  }
                }
                resultingLevel.itemsGrid[currentFloorRef.current][py] = itemRow.join("");
              }
            }
            if ((eraseAll || explicitEraseType === 'grid') && resultingLevel.triggers) {
               resultingLevel.triggers = resultingLevel.triggers.filter((t: any) => !(t.type === 'ON_ENTER_TILE' && t.params?.x === px && t.params?.y === py));
            }
            if ((eraseAll || explicitEraseType === 'light') && resultingLevel.gridLight && resultingLevel.gridLight[py]) {
                 const lRow = resultingLevel.gridLight[py].split("");
                 lRow[px] = ".";
                 resultingLevel.gridLight[py] = lRow.join("");
            }
            if ((eraseAll || explicitEraseType === 'sound') && resultingLevel.gridSounds && resultingLevel.gridSounds[currentFloorRef.current] && resultingLevel.gridSounds[currentFloorRef.current][py]) {
                 const sRow = resultingLevel.gridSounds[currentFloorRef.current][py].split("");
                 sRow[px] = ".";
                 resultingLevel.gridSounds[currentFloorRef.current][py] = sRow.join("");
            }
            if ((eraseAll || explicitEraseType === 'particle') && resultingLevel.particles) {
                 resultingLevel.particles = resultingLevel.particles.filter((p: any) => !(Math.floor(p.x) === px && Math.floor(p.y) === py));
            }
            if (eraseAll || explicitEraseType === 'grid') {
              row[px] = " ";
              newGrid[py] = row.join("");
            }
          } else {
            row[px] = writeSymbol;
            newGrid[py] = row.join("");
          }
        }
      }

      return resultingLevel;
    });

    currentStrokeRef.current = [];
    setTempDrawOverlay(null);
  }, []);

  useEffect(() => {
    const el = gridScrollRef.current;
    
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Disable standard browser pinch/ctrl+wheel zoom globally
      }
    };
    
    // Add global listener to prevent default browser zoom
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });

    if (!el) {
        return () => document.removeEventListener('wheel', handleGlobalWheel);
    }

    const handleGridWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(z => {
            const dz = e.deltaY * -0.15;
            return Math.floor(Math.max(10, Math.min(300, z + dz)));
        });
      }
    };

    const handleScroll = () => {
      sessionStorage.setItem("editor_scroll_left", el.scrollLeft.toString());
      sessionStorage.setItem("editor_scroll_top", el.scrollTop.toString());
    };

    el.addEventListener('wheel', handleGridWheel, { passive: false });
    el.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
        document.removeEventListener('wheel', handleGlobalWheel);
        el.removeEventListener('wheel', handleGridWheel);
        el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const isInitialMountRef = useRef(true);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (level && (level.grids?.length || level.entities?.length)) {
        centerOnPlayerSpawn(level);
      }
    }
  }, []);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    pastRef.current = past;
  }, [past]);
  useEffect(() => {
    futureRef.current = future;
  }, [future]);

  const recordHistory = () => {
    setPast((p) => {
      const next = [...p, levelRef.current];
      if (next.length > 50) next.shift();
      return next;
    });
    setFuture([]);
  };

  const handleUndo = () => {
    if (pastRef.current.length > 0) {
      const prev = pastRef.current[pastRef.current.length - 1];
      setFuture((f) => [levelRef.current, ...f]);
      setPast((p) => p.slice(0, -1));
      setLevel(prev);
      setActiveMenu(null);
    }
  };

  const handleRedo = () => {
    if (futureRef.current.length > 0) {
      const next = futureRef.current[0];
      setPast((p) => [...p, levelRef.current]);
      setFuture((f) => f.slice(1));
      setLevel(next);
      setActiveMenu(null);
    }
  };

  const executeMove = (sx: number, sy: number, tx: number, ty: number) => {
    recordHistory();
    setLevel((prevLevel) => {
       const newLevel = smartCloneLevel(prevLevel);
       const f = currentFloorRef.current;
       
       let x1 = sx;
       let x2 = sx;
       let y1 = sy;
       let y2 = sy;
       
       const selStart = selectionStartRef.current;
       const selEnd = selectionEndRef.current;
       let isMovingSelection = false;
       
       if (selStart && selEnd) {
           const minX = Math.min(selStart.x, selEnd.x);
           const maxX = Math.max(selStart.x, selEnd.x);
           const minY = Math.min(selStart.y, selEnd.y);
           const maxY = Math.max(selStart.y, selEnd.y);
           
           if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
               x1 = minX;
               x2 = maxX;
               y1 = minY;
               y2 = maxY;
               isMovingSelection = true;
           }
       }
       
       const dx = tx - sx;
       const dy = ty - sy;

       if (dx === 0 && dy === 0) return prevLevel;

       // Move triggers
       if (newLevel.triggers) {
           newLevel.triggers.forEach((t: any) => {
               if (t.params?.x >= x1 && t.params?.x <= x2 && t.params?.y >= y1 && t.params?.y <= y2) {
                   t.params.x += dx;
                   t.params.y += dy;
               }
           });
       }

       const moveBuffer: any[] = [];
       const width = newLevel.grids?.[f]?.[0]?.length || 0;
       const height = newLevel.grids?.[f]?.length || 0;
       
       for (let cy = y1; cy <= y2; cy++) {
           for (let cx = x1; cx <= x2; cx++) {
               const newX = cx + dx;
               const newY = cy + dy;
               
               const sGrid = newLevel.grids?.[f]?.[cy]?.[cx] || ' ';
               const cInfo = newLevel.construction?.find((c:any) => c.symbol === sGrid);
               const isFloorOrEmpty = sGrid === ' ' || sGrid === '.' || cInfo?.type === 'floor';
               const movedGrid = isFloorOrEmpty ? null : sGrid;
               
               const sEnt = newLevel.entities?.[f]?.[cy]?.[cx] || '.';
               const movedEnt = sEnt !== '.' ? sEnt : null;

               const sItem = newLevel.itemsGrid?.[f]?.[cy]?.[cx] || '.';
               const movedItem = sItem !== '.' ? sItem : null;

               const sLight = newLevel.gridLight?.[cy]?.[cx] || '.';
               const movedLight = sLight !== '.' ? sLight : null;

               const sSound = newLevel.gridSounds?.[f]?.[cy]?.[cx] || '.';
               const movedSound = sSound !== '.' ? sSound : null;

               const overrideKey = `${f}_${cy}_${cx}`;
               
               const movedOverride = newLevel.entityOverrides?.[overrideKey];
               const movedSuffixedOverrides: Record<string, any> = {};
               for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                   if (newLevel.entityOverrides?.[`${overrideKey}_${l}`]) {
                       movedSuffixedOverrides[`${overrideKey}_${l}`] = newLevel.entityOverrides[`${overrideKey}_${l}`];
                   }
               }

               const movedParticles: any[] = [];
               if (newLevel.particles) {
                   const particlesToMove = newLevel.particles.filter((p: any) => Math.floor(p.x) === cx && Math.floor(p.y) === cy);
                   if (particlesToMove.length > 0) {
                       movedParticles.push(...particlesToMove);
                   }
               }

               if (movedGrid || movedEnt || movedItem || movedLight || movedSound || movedOverride || Object.keys(movedSuffixedOverrides).length > 0 || movedParticles.length > 0) {
                   moveBuffer.push({ cx, cy, newX, newY, movedGrid, movedEnt, movedItem, movedLight, movedSound, movedOverride, movedSuffixedOverrides, movedParticles });
               }

               // Erase from source
               if (newLevel.particles) {
                   newLevel.particles = newLevel.particles.filter((p: any) => !(Math.floor(p.x) === cx && Math.floor(p.y) === cy));
               }
               if (movedGrid) {
                   const row = newLevel.grids[f][cy].split("");
                   row[cx] = " ";
                   newLevel.grids[f][cy] = row.join("");
               }
               if (movedEnt) {
                   const row = newLevel.entities[f][cy].split("");
                   row[cx] = ".";
                   newLevel.entities[f][cy] = row.join("");
               }
               if (movedItem) {
                   const row = newLevel.itemsGrid[f][cy].split("");
                   row[cx] = ".";
                   newLevel.itemsGrid[f][cy] = row.join("");
               }
               if (movedLight) {
                   const row = newLevel.gridLight[cy].split("");
                   row[cx] = ".";
                   newLevel.gridLight[cy] = row.join("");
               }
               if (movedSound) {
                   const row = newLevel.gridSounds[f][cy].split("");
                   row[cx] = ".";
                   newLevel.gridSounds[f][cy] = row.join("");
               }
               if (movedOverride) {
                   delete newLevel.entityOverrides[overrideKey];
               }
               for (const k in movedSuffixedOverrides) {
                   delete newLevel.entityOverrides[k];
               }
           }
       }

       // Place at target
       for (const item of moveBuffer) {
           const { newX, newY, movedGrid, movedEnt, movedItem, movedLight, movedSound, movedOverride, movedSuffixedOverrides, movedParticles } = item;
           // Also grab movedSuffixedOverrides from object when creating moveBuffer or rebuild it via the same logic. Wait! Let me see what's actually passed.
           if (newX < 0 || newX >= width || newY < 0 || newY >= height) continue;

           if (movedGrid) {
               const tr = newLevel.grids[f][newY].split("");
               tr[newX] = movedGrid;
               newLevel.grids[f][newY] = tr.join("");
           }
           if (movedEnt) {
               const tr = newLevel.entities[f][newY].split("");
               tr[newX] = movedEnt;
               newLevel.entities[f][newY] = tr.join("");
               
               // Clear target override if we overwrite the entity completely and don't bring one
               if (!movedOverride && newLevel.entityOverrides && newLevel.entityOverrides[`${f}_${newY}_${newX}`]) {
                   delete newLevel.entityOverrides[`${f}_${newY}_${newX}`];
               }
               for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                   const k = `${f}_${newY}_${newX}_${l}`;
                   if (!movedSuffixedOverrides?.[`${f}_${item.cy}_${item.cx}_${l}`] && newLevel.entityOverrides?.[k]) {
                       delete newLevel.entityOverrides[k];
                   }
               }
           }
           if (movedItem) {
               if (!newLevel.itemsGrid) {
                   const rowTemplate = ".".repeat(width);
                   newLevel.itemsGrid = newLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
               }
               if (!newLevel.itemsGrid[f]) {
                   newLevel.itemsGrid[f] = Array(height).fill(".".repeat(width));
               }
               const tr = newLevel.itemsGrid[f][newY].split("");
               tr[newX] = movedItem;
               newLevel.itemsGrid[f][newY] = tr.join("");
           }
           if (movedLight) {
               if (!newLevel.gridLight) {
                   const rowTemplate = ".".repeat(width);
                   newLevel.gridLight = Array(height).fill(rowTemplate);
               }
               const tr = newLevel.gridLight[newY].split("");
               tr[newX] = movedLight;
               newLevel.gridLight[newY] = tr.join("");
           }
           if (movedSound) {
               if (!newLevel.gridSounds) {
                   const rowTemplate = ".".repeat(width);
                   newLevel.gridSounds = newLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
               }
               const tr = newLevel.gridSounds[f][newY].split("");
               tr[newX] = movedSound;
               newLevel.gridSounds[f][newY] = tr.join("");
           }
           if (movedOverride) {
               if (!newLevel.entityOverrides) newLevel.entityOverrides = {};
               newLevel.entityOverrides[`${f}_${newY}_${newX}`] = movedOverride;
           }
           if (item.movedSuffixedOverrides) {
               if (!newLevel.entityOverrides) newLevel.entityOverrides = {};
               for (const k in item.movedSuffixedOverrides) {
                   const l = k.split('_').pop();
                   newLevel.entityOverrides[`${f}_${newY}_${newX}_${l}`] = item.movedSuffixedOverrides[k];
               }
           }
           if (item.movedParticles && item.movedParticles.length > 0) {
               if (!newLevel.particles) newLevel.particles = [];
               for (const p of item.movedParticles) {
                   const pNew = { ...p };
                   pNew.x += dx;
                   pNew.y += dy;
                   newLevel.particles.push(pNew);
               }
           }
       }
       
       if (isMovingSelection && selStart && selEnd) {
           setSelectionStart({ x: selStart.x + dx, y: selStart.y + dy });
           setSelectionEnd({ x: selEnd.x + dx, y: selEnd.y + dy });
       }
       
       return newLevel;
    });
  };

  const removePaletteItem = (symbol: string, palette: PaletteTab) => {
    recordHistory();
    setLevel((prev) => {
      const next = { ...prev };
      if (palette === 'construction') {
        next.construction = next.construction?.filter((c) => c.symbol !== symbol);
        if (brushConfig.symbol === symbol) setBrushConfig({ type: 'wall', assetId: '', canBeDestroyed: true });
      } else if (palette === 'doors') {
        if (next.doorDefinitions) {
          const newDefs = { ...next.doorDefinitions };
          delete newDefs[symbol];
          next.doorDefinitions = newDefs;
        }
        if (doorBrushConfig.symbol === symbol) setDoorBrushConfig({ type: 'HINGE', dir: 'LEFT' });
      } else if (palette === 'lights') {
        if (next.lightDefinitions) {
          const newDefs = { ...next.lightDefinitions };
          delete newDefs[symbol];
          next.lightDefinitions = newDefs;
        }
        if (brushConfig.symbol === symbol) setBrushConfig({ type: 'wall', assetId: '', canBeDestroyed: true, symbol: '' });
      } else if (palette === 'portals') {
        next.portals = next.portals?.filter((p) => p.symbol !== symbol);
        if (portalBrushConfig.symbol === symbol) setPortalBrushConfig({ targetDirection: 'N' });
      } else if (palette === 'entities') {
        next.enemies = next.enemies?.filter((e) => e.symbol !== symbol);
        next.NPCs = next.NPCs?.filter((e) => e.symbol !== symbol);
        next.items = next.items?.filter((e) => e.symbol !== symbol);
        next.decorations = next.decorations?.filter((e) => e.symbol !== symbol);
        if (entityBrushConfig.symbol === symbol) setEntityBrushConfig({ entityType: 'enemy', id: 'guard' });
      } else if (palette === 'sounds') {
        next.ambientSounds = next.ambientSounds?.filter((s) => s.symbol !== symbol);
        if (soundBrushConfig.symbol === symbol) setSoundBrushConfig({ id: '', minInterval: 2000, maxInterval: 5000, radius: 10 });
      }
      return next;
    });
  };

   const movePaletteItem = (index: number, type: 'construction' | 'doors' | 'lights' | 'portals' | 'entities' | 'sounds', direction: 'up' | 'down', entityListName?: string) => {
    recordHistory();
    setLevel(prev => {
      const copy = { ...prev };
      if (type === 'construction' && copy.construction) {
        const arr = [...copy.construction];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < arr.length) {
          const temp = arr[index];
          arr[index] = arr[targetIdx];
          arr[targetIdx] = temp;
        }
        copy.construction = arr;
      } else if (type === 'doors' && copy.doorDefinitions) {
        const entries = Object.entries(copy.doorDefinitions);
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < entries.length) {
          const temp = entries[index];
          entries[index] = entries[targetIdx];
          entries[targetIdx] = temp;
          copy.doorDefinitions = Object.fromEntries(entries);
        }
      } else if (type === 'lights' && copy.lightDefinitions) {
        const entries = Object.entries(copy.lightDefinitions);
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < entries.length) {
          const temp = entries[index];
          entries[index] = entries[targetIdx];
          entries[targetIdx] = temp;
          copy.lightDefinitions = Object.fromEntries(entries);
        }
      } else if (type === 'portals' && copy.portals) {
        const arr = [...copy.portals];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < arr.length) {
          const temp = arr[index];
          arr[index] = arr[targetIdx];
          arr[targetIdx] = temp;
        }
        copy.portals = arr;
      } else if (type === 'entities' && entityListName) {
        const arr = [...((copy as any)[entityListName] || [])];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < arr.length) {
          const temp = arr[index];
          arr[index] = arr[targetIdx];
          arr[targetIdx] = temp;
        }
        (copy as any)[entityListName] = arr;
      } else if (type === 'sounds' && copy.ambientSounds) {
        const arr = [...copy.ambientSounds];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx >= 0 && targetIdx < arr.length) {
          const temp = arr[index];
          arr[index] = arr[targetIdx];
          arr[targetIdx] = temp;
        }
        copy.ambientSounds = arr;
      }
      return copy;
    });
  };

  const copyPaletteItem = (index: number, type: 'construction' | 'doors' | 'lights' | 'portals' | 'entities' | 'sounds', entityListName?: string) => {
    recordHistory();
    setLevel(prev => {
      const copy = { ...prev };
      if (type === 'construction' && copy.construction) {
        const arr = [...copy.construction];
        const source = arr[index];
        if (source) {
          const newSym = getAvailableSymbol(copy, "construction");
          const duplicated = { ...source, symbol: newSym };
          arr.splice(index + 1, 0, duplicated);
        }
        copy.construction = arr;
      } else if (type === 'doors' && copy.doorDefinitions) {
        const entries = Object.entries(copy.doorDefinitions);
        const [char, sourceDef] = entries[index];
        if (sourceDef) {
          const newSym = getAvailableSymbol(copy, "door");
          const duplicated = JSON.parse(JSON.stringify(sourceDef));
          duplicated.id = `${(sourceDef as any).id || 'door'}_copy`;
          duplicated.symbol = newSym;
          entries.splice(index + 1, 0, [newSym, duplicated]);
          copy.doorDefinitions = Object.fromEntries(entries);
        }
      } else if (type === 'lights' && copy.lightDefinitions) {
        const entries = Object.entries(copy.lightDefinitions);
        const [char, sourceDef] = entries[index];
        if (sourceDef) {
          const newSym = getAvailableSymbol(copy, "light");
          const duplicated = JSON.parse(JSON.stringify(sourceDef));
          duplicated.symbol = newSym;
          entries.splice(index + 1, 0, [newSym, duplicated]);
          copy.lightDefinitions = Object.fromEntries(entries);
        }
      } else if (type === 'portals' && copy.portals) {
        const arr = [...copy.portals];
        const source = arr[index];
        if (source) {
          const newSym = getAvailableSymbol(copy, "portal");
          const duplicated = { ...source, symbol: newSym, portalId: source.portalId ? `${source.portalId}_copy` : undefined };
          arr.splice(index + 1, 0, duplicated);
        }
        copy.portals = arr;
      } else if (type === 'entities' && entityListName) {
        const arr = [...((copy as any)[entityListName] || [])];
        const source = arr[index];
        if (source) {
          const itemType = source.entityType === 'item' ? 'item' : 'entity';
          const newSym = getAvailableSymbol(copy, itemType);
          const duplicated = { ...source, symbol: newSym };
          arr.splice(index + 1, 0, duplicated);
        }
        (copy as any)[entityListName] = arr;
      } else if (type === 'sounds' && copy.ambientSounds) {
        const arr = [...copy.ambientSounds];
        const source = arr[index];
        if (source) {
          const newSym = getAvailableSymbol(copy, "sound");
          const duplicated = JSON.parse(JSON.stringify(source));
          duplicated.symbol = newSym;
          arr.splice(index + 1, 0, duplicated);
        }
        copy.ambientSounds = arr;
      }
      return copy;
    });
  };

  const handleCopy = () => {
    if (!selectionStartRef.current || !selectionEndRef.current) return;
    const x1 = Math.min(selectionStartRef.current.x, selectionEndRef.current.x);
    const x2 = Math.max(selectionStartRef.current.x, selectionEndRef.current.x);
    const y1 = Math.min(selectionStartRef.current.y, selectionEndRef.current.y);
    const y2 = Math.max(selectionStartRef.current.y, selectionEndRef.current.y);

    const f = currentFloorRef.current;
    const grid = levelRef.current.grids?.[f];
    const ent = levelRef.current.entities?.[f];
    if (!grid) return;

    const copyWidth = x2 - x1 + 1;
    const copyHeight = y2 - y1 + 1;
    const copiedGrids: string[] = [];
    const copiedEntities: string[] = [];
    const copiedOverrides: any = {};
    for (let py = y1; py <= y2; py++) {
      copiedGrids.push(grid[py].substring(x1, x2 + 1));
      copiedEntities.push(ent?.[py]?.substring(x1, x2 + 1) || ".".repeat(copyWidth));
      
      for (let px = x1; px <= x2; px++) {
          const key = `${f}_${py}_${px}`;
          const override = levelRef.current.entityOverrides?.[key];
          if (override) {
              copiedOverrides[`${py - y1}_${px - x1}`] = override;
          }
          for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
              const suffixedOverride = levelRef.current.entityOverrides?.[`${key}_${l}`];
              if (suffixedOverride) {
                  copiedOverrides[`${py - y1}_${px - x1}_${l}`] = suffixedOverride;
              }
          }
      }
    }
    const newClipboard = { width: copyWidth, height: copyHeight, grids: copiedGrids, entities: copiedEntities, overrides: copiedOverrides };
    setClipboard(newClipboard);
    clipboardRef.current = newClipboard;
  };

  const handlePaste = () => {
    const cb = clipboardRef.current;
    if (!cb) return;
    const target = selectionStartRef.current || { x: 0, y: 0 };
    const { x, y } = target;
    const f = currentFloorRef.current;
    if (!levelRef.current.grids?.[f]) return;
    
    recordHistory();
    setLevel(prev => {
      const next = smartCloneLevel(prev);
      const wWidth = Number(width);
      const hHeight = Number(height);
      for (let cy = 0; cy < cb.height; cy++) {
        const py = y + cy;
        if (py >= hHeight) break;
        
        let gridRow = next.grids[f][py].split('');
        let entRow = next.entities[f][py].split('');
        for (let cx = 0; cx < cb.width; cx++) {
          const px = x + cx;
          if (px >= wWidth) break;
          const mapChar = cb.grids[cy][cx];
          const entChar = cb.entities[cy][cx];
          if (mapChar !== undefined) gridRow[px] = mapChar;
          if (entChar !== undefined) entRow[px] = entChar;
          
          const override = cb.overrides?.[`${cy}_${cx}`];
          const trKey = `${f}_${py}_${px}`;
          
          if (entChar !== undefined) {
             if (next.entityOverrides) {
                 delete next.entityOverrides[trKey];
                 for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                     delete next.entityOverrides[`${trKey}_${l}`];
                 }
             }
             if (override) {
                 if (!next.entityOverrides) next.entityOverrides = {};
                 next.entityOverrides[trKey] = JSON.parse(JSON.stringify(override));
             }
             for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                 const suffixed = cb.overrides?.[`${cy}_${cx}_${l}`];
                 if (suffixed) {
                     if (!next.entityOverrides) next.entityOverrides = {};
                     next.entityOverrides[`${trKey}_${l}`] = JSON.parse(JSON.stringify(suffixed));
                 }
             }
          } else if (entChar === '.' && mapChar !== undefined && next.entityOverrides) {
              // If erasing an entity by pasting a space/wall, clear override
              delete next.entityOverrides[trKey];
              for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                  delete next.entityOverrides[`${trKey}_${l}`];
              }
          }
        }
        next.grids[f][py] = gridRow.join('');
        next.entities[f][py] = entRow.join('');
      }
      return next;
    });
  };

  const removeUnusedPaletteObjects = () => {
    recordHistory();
    setLevel((prevLevel) => {
      const nextLevel = smartCloneLevel(prevLevel);

      const usedInGrids = new Set<string>();
      if (nextLevel.grids) {
        for (const floor of nextLevel.grids) {
          for (const row of floor) {
            for (let i = 0; i < row.length; i++) {
              const char = row[i];
              if (char !== " " && char !== ".") {
                usedInGrids.add(char);
              }
            }
          }
        }
      }

      const usedInEntities = new Set<string>();
      if (nextLevel.entities) {
        for (const floor of nextLevel.entities) {
          for (const row of floor) {
            for (let i = 0; i < row.length; i++) {
              const char = row[i];
              if (char !== "." && char !== " ") {
                usedInEntities.add(char);
              }
            }
          }
        }
      }

      const usedInItemsGrid = new Set<string>();
      if (nextLevel.itemsGrid) {
        for (const floor of nextLevel.itemsGrid) {
          for (const row of floor) {
            for (let i = 0; i < row.length; i++) {
              const char = row[i];
              if (char !== "." && char !== " ") {
                usedInItemsGrid.add(char);
              }
            }
          }
        }
      }

      const usedInGridLight = new Set<string>();
      if (nextLevel.gridLight) {
        for (const row of nextLevel.gridLight) {
          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char !== "." && char !== " ") {
              usedInGridLight.add(char);
            }
          }
        }
      }

      const usedInGridSounds = new Set<string>();
      if (nextLevel.gridSounds) {
        for (const floor of nextLevel.gridSounds) {
          for (const row of floor) {
            for (let i = 0; i < row.length; i++) {
              const char = row[i];
              if (char !== "." && char !== " ") {
                usedInGridSounds.add(char);
              }
            }
          }
        }
      }

      if (nextLevel.playerStart?.symbol) {
        usedInEntities.add(nextLevel.playerStart.symbol);
      }

      if (nextLevel.construction) {
        nextLevel.construction = nextLevel.construction.filter((c) => 
          c.symbol && usedInGrids.has(c.symbol)
        );
      }

      if (nextLevel.doorDefinitions) {
        const filteredDoors: typeof nextLevel.doorDefinitions = {};
        for (const [char, def] of Object.entries(nextLevel.doorDefinitions)) {
          if (usedInGrids.has(char)) {
            filteredDoors[char] = def;
          }
        }
        nextLevel.doorDefinitions = filteredDoors;
      }

      if (nextLevel.lightDefinitions) {
        const filteredLights: typeof nextLevel.lightDefinitions = {};
        for (const [char, def] of Object.entries(nextLevel.lightDefinitions)) {
          if (usedInGridLight.has(char)) {
            filteredLights[char] = def;
          }
        }
        nextLevel.lightDefinitions = filteredLights;
      }

      if (nextLevel.portals) {
        nextLevel.portals = nextLevel.portals.filter((p) => 
          p.symbol && usedInGrids.has(p.symbol)
        );
      }

      if (nextLevel.items) {
        nextLevel.items = nextLevel.items.filter((i) => 
          i.symbol && usedInItemsGrid.has(i.symbol)
        );
      }
      if (nextLevel.enemies) {
        nextLevel.enemies = nextLevel.enemies.filter((e) => 
          e.symbol && usedInEntities.has(e.symbol)
        );
      }
      if (nextLevel.NPCs) {
        nextLevel.NPCs = nextLevel.NPCs.filter((n) => 
          n.symbol && usedInEntities.has(n.symbol)
        );
      }
      if (nextLevel.decorations) {
        nextLevel.decorations = nextLevel.decorations.filter((d) => 
          d.symbol && usedInEntities.has(d.symbol)
        );
      }

      if (nextLevel.ambientSounds) {
        nextLevel.ambientSounds = nextLevel.ambientSounds.filter((s) => 
          s.symbol && usedInGridSounds.has(s.symbol)
        );
      }

      return nextLevel;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
         activeEl.tagName === "TEXTAREA" ||
         activeEl.tagName === "SELECT" ||
         (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyZ" || e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyY" || e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        handleRedo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyC" || e.key.toLowerCase() === "c" || e.key.toLowerCase() === "с")
      ) {
        e.preventDefault();
        handleCopy();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyV" || e.key.toLowerCase() === "v" || e.key.toLowerCase() === "м")
      ) {
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (engine?.stopAllSounds) {
      engine.stopAllSounds();
    }
  }, [engine]);

  useEffect(() => {
    let touchStartY = 0;
    let touchStartX = 0;
    let isScrolling = false;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      isScrolling = false;

      const target = e.target as HTMLElement;
      if (target.hasAttribute('data-native-kb') || target.closest('[data-native-kb]')) {
        return;
      }
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const type = (target as HTMLInputElement).type;
        const originalType = target.getAttribute('data-original-type') || type;
        if (['text', 'number', 'password', 'email', 'tel', 'url', 'search', 'textarea'].includes(originalType) || target.tagName === 'TEXTAREA') {
          target.setAttribute('inputmode', 'none');
          (target as any).inputMode = 'none';
          (target as any).virtualKeyboardPolicy = 'manual';
          if (type === 'number') {
            target.setAttribute('data-original-type', 'number');
            (target as HTMLInputElement).type = 'text';
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchStartY) > 10 || Math.abs(e.touches[0].clientX - touchStartX) > 10) {
        isScrolling = true;
      }
    };
    
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.hasAttribute('data-native-kb') || target.closest('[data-native-kb]')) {
        return;
      }
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const type = (target as HTMLInputElement).type;
        const originalType = target.getAttribute('data-original-type') || type;
        const isTouch = typeof window !== 'undefined' && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        if (isTouch && (['text', 'number', 'password', 'email', 'tel', 'url', 'search', 'textarea'].includes(originalType) || target.tagName === 'TEXTAREA')) {
          target.setAttribute('inputmode', 'none');
          (target as any).inputMode = 'none';
          (target as any).virtualKeyboardPolicy = 'manual';
          if (type === 'number') {
            target.setAttribute('data-original-type', 'number');
            (target as HTMLInputElement).type = 'text';
          }
          if (!isScrolling) {
            setActiveInput(target as HTMLInputElement | HTMLTextAreaElement);
          }
        }
      }
    };
    
    // Hide keyboard if clicked outside
    const handleTouchEnd = (e: TouchEvent) => {
       const target = e.target as HTMLElement;
       
       if (target.hasAttribute('data-native-kb') || target.closest('[data-native-kb]')) {
         return;
       }
       if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
         const type = (target as HTMLInputElement).type;
         const originalType = target.getAttribute('data-original-type') || type;
         if (['text', 'number', 'password', 'email', 'tel', 'url', 'search', 'textarea'].includes(originalType) || target.tagName === 'TEXTAREA') {
           if (!isScrolling) {
             setActiveInput(target as HTMLInputElement | HTMLTextAreaElement);
           }
         }
       }
       
       if (activeInput && target !== activeInput && !target.closest('.virtual-keyboard-container')) {
           if (!isScrolling) {
               setActiveInput(null);
               activeInput.blur();
           }
       }
    };

    document.addEventListener('touchstart', handleTouchStart, { capture: true });
    document.addEventListener('touchmove', handleTouchMove, { capture: true });
    document.addEventListener('focusin', handleFocusIn, { capture: true });
    document.addEventListener('touchend', handleTouchEnd, { capture: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('focusin', handleFocusIn, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
    };
  }, [activeInput]);

  const updateTouchCenter = () => {
    const pts = Array.from(touchPointersRef.current.values()) as { x: number; y: number }[];
    if (pts.length === 0) {
      touchLastCenterRef.current = null;
    } else if (pts.length === 1) {
      touchLastCenterRef.current = { x: pts[0].x, y: pts[0].y };
    } else {
      touchLastCenterRef.current = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
    }
  };

  const lastDrawTimeRef = React.useRef<{ time: number } | null>(null);

  const handlePointerDownCapture = (e: React.PointerEvent) => {
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (touchPointersRef.current.size > 1) {
       // If a second finger touched very shortly after a draw, undo that accidental draw
       if (lastDrawTimeRef.current && Date.now() - lastDrawTimeRef.current.time < 300) {
           handleUndo();
           lastDrawTimeRef.current = null;
       }
    }
    
    updateTouchCenter();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (longPressStateRef.current) {
        const dx = e.clientX - longPressStateRef.current.startX;
        const dy = e.clientY - longPressStateRef.current.startY;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            if (longPressStateRef.current.timer) clearTimeout(longPressStateRef.current.timer);
            longPressStateRef.current = null;
        }
    }

    if (isSpaceDownRef.current && e.pointerType === 'mouse') {
      if (gridScrollRef.current) {
        gridScrollRef.current.scrollLeft -= e.movementX;
        gridScrollRef.current.scrollTop -= e.movementY;
      }
      return;
    }

    if (touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const isCursorOneFinger = activeToolRef.current === 'cursor' && touchPointersRef.current.size === 1;

      if ((touchPointersRef.current.size >= 2 || isCursorOneFinger) && gridScrollRef.current) {
        const pts = Array.from(touchPointersRef.current.values()) as { x: number; y: number }[];
        let center = { x: 0, y: 0 };
        if (pts.length === 1) {
            center = { x: pts[0].x, y: pts[0].y };
        } else {
            center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        }
        
        const lastCenter = touchLastCenterRef.current;

        if (lastCenter && center) {
          const dx = center.x - lastCenter.x;
          const dy = center.y - lastCenter.y;

          gridScrollRef.current.scrollLeft -= dx;
          gridScrollRef.current.scrollTop -= dy;
        }

        touchLastCenterRef.current = center;
      }
    }
  };

  const handlePointerUp = React.useCallback((e: React.PointerEvent) => {
    if (longPressStateRef.current) {
        if (longPressStateRef.current.timer) clearTimeout(longPressStateRef.current.timer);
        longPressStateRef.current = null;
    }

    if (activeToolRef.current === 'move' && moveSourceRef.current && hoveredCellRef.current) {
        const src = moveSourceRef.current;
        const tgt = hoveredCellRef.current;
        if (src.x !== tgt.x || src.y !== tgt.y) {
            executeMove(src.x, src.y, tgt.x, tgt.y);
            setMoveSource(null);
            setMoveHoveredCell(null);
        } else {
            setMoveSource(null);
            setMoveHoveredCell(null);
        }
    }

    applyCompletedStroke();

    touchPointersRef.current.delete(e.pointerId);
    updateTouchCenter();
    lastDraggedCellRef.current = null;
  }, [executeMove, applyCompletedStroke]);

  const openTweakModalFromData = React.useCallback((x: number, y: number, listName: string, foundConfig: any) => {
    const oldCoordKey = `${currentFloorRef.current}_${y}_${x}`;
    const symbol = foundConfig?.symbol || '';

    const entChar = levelRef.current.entities?.[currentFloorRef.current]?.[y]?.[x] || '.';
    const itemChar = levelRef.current.itemsGrid?.[currentFloorRef.current]?.[y]?.[x] || '.';
    const isCombo = resolveCombo(entChar).length > 1 || resolveCombo(itemChar).length > 1;

    const newSymbolCoordKey = symbol ? `${oldCoordKey}_${listName}_${symbol}` : '';
    const oldSymbolCoordKey = symbol ? `${oldCoordKey}_${symbol}` : '';
    const oldListCoordKey = `${oldCoordKey}_${listName}`;

    let existingOverride = newSymbolCoordKey ? levelRef.current.entityOverrides?.[newSymbolCoordKey] : null;
    if (!existingOverride && oldSymbolCoordKey) {
        existingOverride = levelRef.current.entityOverrides?.[oldSymbolCoordKey];
    }
    if (!existingOverride && !isCombo) {
        existingOverride = levelRef.current.entityOverrides?.[oldListCoordKey];
    }
    if (!existingOverride && !isCombo) {
        existingOverride = levelRef.current.entityOverrides?.[oldCoordKey];
    }
    if (!existingOverride) {
        existingOverride = {};
    }

    let baseData = {};
    const baseId = foundConfig.id;
    if (listName === 'enemies') {
       baseData = (enemiesData as any)[baseId] || {};
    } else if (listName === 'NPCs') {
       baseData = (npcsData as any)[baseId] || {};
    } else if (listName === 'items') {
       baseData = (itemsData as any)[baseId] || {};
    } else if (listName === 'decorations') {
       baseData = (decorationsData as any)[baseId] || {};
    }

    const fullConfigForEdit = { ...baseData, ...foundConfig, ...existingOverride };
    const baseConfigReference = { ...baseData, ...foundConfig };

    setTweakEntityData({ x, y, listName, symbol, floor: currentFloorRef.current, config: fullConfigForEdit, baseConfigReference });
    setShowTweakModal(true);
  }, []);

  const handleCellDown = React.useCallback((x: number, y: number, shiftKey: boolean, buttons: number, isPrimary: boolean = true, clientX?: number, clientY?: number) => {
    if (!isPrimary) return;
    if (touchPointersRef.current.size > 1) return;
    if (isSpaceDownRef.current) return;

    if (pickingCoordinateCallbackRef.current) {
      setPickingCoordinateSelected({ x, y });
      return;
    }

    if (activeToolRef.current === 'select') {
      setSelectionStart({ x, y });
      setSelectionEnd({ x, y });
      return;
    }

    if (activeToolRef.current === 'eyedropper') {
      const gridCell = levelRef.current.grids[currentFloorRef.current]?.[y]?.[x] || ' ';
      const entCell = levelRef.current.entities?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const lightCell = levelRef.current.gridLight?.[y]?.[x] || '.';
      const soundCell = levelRef.current.gridSounds?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const particleDef = levelRef.current.particles?.find((p: any) => Math.floor(p.x) === x && Math.floor(p.y) === y);

      const items: { type: 'grid' | 'door' | 'portal' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string; data: any }[] = [];
      
      if (gridCell !== ' ' && gridCell !== '.') {
         const cInfo = levelRef.current.construction?.find((c: any) => c.symbol === gridCell);
         const word = cInfo ? (cInfo.type === 'wall' ? (uiStrings.desc_wall || 'Wall') : (uiStrings.desc_floor || 'Floor')) : (uiStrings.desc_grid || 'Grid');
         items.push({ 
            type: 'grid', 
            char: gridCell, 
            desc: `${word} (${gridCell})`,
            data: cInfo || { symbol: gridCell, type: 'floor' }
         });
      }
      
      if (entCell !== '.' && entCell !== ' ') {
         let desc = `${uiStrings.desc_entity || 'Entity'} (${entCell})`;
         if (entCell === (levelRef.current.playerStart?.symbol || 'S')) {
            desc = `${uiStrings.desc_spawn || 'Spawn'} (${entCell})`;
            items.push({ 
               type: 'entity', 
               char: entCell, 
               desc,
               data: { isSpawn: true }
            });
         } else if (levelRef.current.doorDefinitions?.[entCell]) {
            desc = `${uiStrings.desc_door || 'Door'} (${entCell})`;
            items.push({ 
               type: 'door', 
               char: entCell, 
               desc,
               data: { symbol: entCell, ...levelRef.current.doorDefinitions[entCell] }
            });
         } else if (levelRef.current.portals?.find((p: any) => p.symbol === entCell)) {
            const pDef = levelRef.current.portals.find((p: any) => p.symbol === entCell);
            desc = `${uiStrings.desc_portal || 'Portal'} (${entCell})`;
            items.push({ 
               type: 'portal', 
               char: entCell, 
               desc,
               data: pDef
            });
         } else {
            const lists = ['enemies', 'NPCs', 'items', 'decorations'] as const;
            let foundConfig = null;
            let lName = '';
            for (const list of lists) {
               const listVals = (levelRef.current as any)[list];
               if (listVals) {
                  const config = listVals.find((c: any) => c.symbol === entCell);
                  if (config) {
                     foundConfig = config;
                     lName = list;
                     break;
                  }
               }
            }
            if (foundConfig) {
               if (lName === 'enemies') desc = `${uiStrings.desc_enemy || 'Enemy'} (${entCell})`;
               else if (lName === 'NPCs') desc = `${uiStrings.desc_npc || 'NPC'} (${entCell})`;
               else if (lName === 'items') desc = `${uiStrings.desc_item || 'Item'} (${entCell})`;
               else if (lName === 'decorations') desc = `${uiStrings.desc_decoration || 'Decoration'} (${entCell})`;
               items.push({ 
                  type: 'entity', 
                  char: entCell, 
                  desc,
                  data: { ...foundConfig, listName: lName }
               });
            }
         }
      }
      
      if (lightCell !== '.' && lightCell !== ' ') {
         const def = levelRef.current.lightDefinitions?.[lightCell];
         items.push({ 
            type: 'light', 
            char: lightCell, 
            desc: `${uiStrings.desc_light || 'Light'} (${lightCell})`,
            data: def ? { symbol: lightCell, ...def } : { symbol: lightCell }
         });
      }
      
      if (soundCell !== '.' && soundCell !== ' ') {
         const def = levelRef.current.ambientSounds?.find((s: any) => s.symbol === soundCell);
         items.push({ 
            type: 'sound', 
            char: soundCell, 
            desc: `${uiStrings.desc_sound || 'Sound'} (${soundCell})`,
            data: def ? { symbol: soundCell, ...def } : { symbol: soundCell }
         });
      }
      
      if (particleDef) {
         items.push({ 
            type: 'particle', 
            char: '*', 
            desc: `${uiStrings.desc_particle || 'Particle'} (${particleDef.definitionId})`,
            data: particleDef
         });
      }

      if (items.length === 1) {
         selectEyedropperObject(items[0]);
      } else if (items.length > 1) {
         setEyedropperModalData({ x, y, clientX: clientX || 0, clientY: clientY || 0, items });
      }
      return;
    }

    const isRightClick = buttons === 2;

    if (activeToolRef.current === 'move' && !isRightClick) {
        if (!moveSourceRef.current) {
            setMoveSource({ x, y });
            setMoveHoveredCell({ x, y });
        } else {
            if (moveSourceRef.current.x !== x || moveSourceRef.current.y !== y) {
                executeMove(moveSourceRef.current.x, moveSourceRef.current.y, x, y);
            }
            setMoveSource(null);
            setMoveHoveredCell(null);
        }
        return;
    }

    if (activeToolRef.current === 'tweak_entity' && !isRightClick) {
      const cellChar = levelRef.current.entities?.[currentFloorRef.current]?.[y]?.[x];
      const itemChar = levelRef.current.itemsGrid?.[currentFloorRef.current]?.[y]?.[x];
      
      const charCandidates: string[] = [];
      if (cellChar && cellChar !== '.' && cellChar !== ' ') charCandidates.push(cellChar);
      if (itemChar && itemChar !== '.' && itemChar !== ' ' && itemChar !== cellChar) charCandidates.push(itemChar);
      
      if (charCandidates.length > 0) {
        const foundItems: { char: string; listName: 'enemies' | 'NPCs' | 'items' | 'decorations'; config: any }[] = [];

        const lists = ['enemies', 'NPCs', 'items', 'decorations'] as const;

        for (const candidate of charCandidates) {
          let foundConfig = null;
          let listName: 'enemies' | 'NPCs' | 'items' | 'decorations' | null = null;
          
          for (const list of lists) {
            const listVals = (levelRef.current as any)[list];
            if (listVals) {
              const config = listVals.find((c: any) => c.symbol === candidate);
              if (config) {
                foundConfig = { ...config };
                listName = list;
                break;
              }
            }
          }

          let comboSymbols: string[] = [];
          if (foundConfig && Array.isArray(foundConfig.combo) && foundConfig.combo.length > 0) {
            comboSymbols = foundConfig.combo;
          } else {
            const resolved = resolveCombo(candidate);
            if (resolved.length > 1 || (resolved.length === 1 && resolved[0] !== candidate)) {
              comboSymbols = resolved;
            }
          }

          if (comboSymbols.length > 0) {
            for (const sym of comboSymbols) {
              let subConfig = null;
              let subListName: 'enemies' | 'NPCs' | 'items' | 'decorations' | null = null;
              for (const list of lists) {
                const listVals = (levelRef.current as any)[list];
                if (listVals) {
                  const cfg = listVals.find((c: any) => c.symbol === sym);
                  if (cfg) {
                    subConfig = { ...cfg };
                    subListName = list;
                    break;
                  }
                }
              }
              if (subConfig && subListName) {
                foundItems.push({ char: sym, listName: subListName, config: subConfig });
              }
            }
          } else {
            if (foundConfig && listName) {
              foundItems.push({ char: candidate, listName, config: foundConfig });
            }
          }
        }
        
        if (foundItems.length === 1) {
            openTweakModalFromData(x, y, foundItems[0].listName, foundItems[0].config);
        } else if (foundItems.length > 1) {
            setTweakPickData({ x, y, clientX: clientX || 0, clientY: clientY || 0, items: foundItems });
        }
      }
      return;
    }

    if (activeToolRef.current === 'cursor' && !isRightClick) return;

    const effectiveTool = isRightClick ? 'erase' : activeToolRef.current;

    recordHistory();
    lastDrawTimeRef.current = { time: Date.now() };

    // Flood Fill logic
    if (isFillModeRef.current) {
      if (!levelRef.current.grids || !levelRef.current.grids[currentFloorRef.current]) return;
      
      let symbol = " ";
      let newConstruction = null;
      let newDoorConfig = null;
      let newLightConfig = null;
      let newPortalConfig = null;
      let newEntityConfig = null;
      
      if (effectiveTool === 'door') {
          const res = resolveDoorBrushSymbol(doorBrushConfigRef.current, levelRef.current);
          symbol = res.symbol;
          newDoorConfig = res.newDoorConfig;
      } else if (effectiveTool === 'light') {
          const res = resolveLightBrushSymbol(brushConfigRef.current, levelRef.current);
          symbol = res.symbol;
          newLightConfig = res.newLightConfig;
      } else if (effectiveTool === 'portal') {
          const res = resolvePortalBrushSymbol(portalBrushConfigRef.current, levelRef.current);
          symbol = res.symbol;
          newPortalConfig = res.newPortalConfig;
      } else if (effectiveTool === 'entity') {
          const res = resolveEntityBrushSymbol(entityBrushConfigRef.current, levelRef.current);
          symbol = res.symbol;
          newEntityConfig = res.newEntityConfig;
      } else if (effectiveTool === 'erase') {
          symbol = " ";
      } else if (effectiveTool === 'construction') {
          const res = resolveBrushSymbol(brushConfigRef.current, levelRef.current);
          symbol = res.symbol;
          newConstruction = res.newConstruction;
      }

      setLevel((prevLevel) => {
        const newLevel = smartCloneLevel(prevLevel);
        
        if (effectiveTool === 'construction' && newConstruction) {
            const consts = newLevel.construction || [];
            const existingIdx = consts.findIndex((c: any) => c.symbol === symbol);
            if (existingIdx === -1) {
                consts.push(newConstruction);
                newLevel.construction = consts;
            }
        } else if (effectiveTool === 'door' && newDoorConfig) {
            const defs = newLevel.doorDefinitions || {};
            if (!defs[symbol]) {
                defs[symbol] = newDoorConfig;
                newLevel.doorDefinitions = defs;
            }
        } else if (effectiveTool === 'light' && newLightConfig && symbol && symbol !== '.') {
            const defs = newLevel.lightDefinitions || {};
            if (!defs[symbol]) {
                defs[symbol] = newLightConfig;
                newLevel.lightDefinitions = defs;
            }
        } else if (effectiveTool === 'portal' && newPortalConfig) {
            const portals = newLevel.portals || [];
            const existingIdx = portals.findIndex((p: any) => p.symbol === symbol);
            if (existingIdx === -1) {
                portals.push(newPortalConfig);
                newLevel.portals = portals;
            }
        } else if (effectiveTool === 'entity' && newEntityConfig) {
            const listName = newEntityConfig.entityType === 'enemy' ? 'enemies' : newEntityConfig.entityType === 'npc' ? 'NPCs' : newEntityConfig.entityType === 'item' ? 'items' : 'decorations';
            const list = newLevel[listName] || [];
            const existingIdx = list.findIndex((c: any) => c.symbol === symbol);
            if (existingIdx === -1) {
                list.push(newEntityConfig);
                newLevel[listName] = list;
            }
        }

        if (activeToolRef.current === 'light' && (!newLevel.gridLight)) {
           const w = newLevel.grids[0]?.[0]?.length || 0;
           const h = newLevel.grids[0]?.length || 0;
           newLevel.gridLight = Array(h).fill(".".repeat(w));
        }

        const grid = activeToolRef.current === 'light' ? newLevel.gridLight! : (activeToolRef.current === 'portal' || activeToolRef.current === 'entity' || activeToolRef.current === 'door') ? newLevel.entities[currentFloorRef.current] : newLevel.grids[currentFloorRef.current];
        const startSymbol = grid[y][x];
        if (startSymbol === symbol && effectiveTool !== 'erase') return prevLevel; // Same symbol, no-op (except erase might clear entities/lights too)

        const q = [[x, y]];
        const visited = new Set<string>();
        visited.add(`${x},${y}`);

        while (q.length > 0) {
          const [cx, cy] = q.shift()!;
          if (activeToolRef.current === 'portal' || activeToolRef.current === 'entity' || activeToolRef.current === 'door') {
            const entRow = newLevel.entities[currentFloorRef.current][cy].split("");
            entRow[cx] = symbol;
            newLevel.entities[currentFloorRef.current][cy] = entRow.join("");
            
            const gridRow = newLevel.grids[currentFloorRef.current][cy].split("");
            const cellChar = gridRow[cx];
            const isWallCell = cellChar === "#" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "wall" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "window";
            if ((activeToolRef.current === 'portal' || activeToolRef.current === 'door') && isWallCell) {
              gridRow[cx] = ".";
              newLevel.grids[currentFloorRef.current][cy] = gridRow.join("");
            }
          } else {
            const rowArr = grid[cy].split("");
            rowArr[cx] = symbol;
            grid[cy] = rowArr.join("");
          }
          
          if (effectiveTool === 'erase') {
             // Also clear entities
             if (newLevel.entities && newLevel.entities[currentFloorRef.current] && newLevel.entities[currentFloorRef.current][cy]) {
                const entRow = newLevel.entities[currentFloorRef.current][cy].split("");
                entRow[cx] = ".";
                newLevel.entities[currentFloorRef.current][cy] = entRow.join("");
             }
             // Also clear scripts if we erase tile completely. Let's just remove triggers at this location.
             if (newLevel.triggers) {
                newLevel.triggers = newLevel.triggers.filter((t: any) => !(t.type === 'ON_ENTER_TILE' && t.params?.x === cx && t.params?.y === cy));
             }
             // Also clear lights if viewLightPreview
             if (newLevel.gridLight && newLevel.gridLight[cy] && viewLightPreviewRef.current) {
                const lightRow = newLevel.gridLight[cy].split("");
                lightRow[cx] = ".";
                newLevel.gridLight[cy] = lightRow.join("");
             }
          }

          const neighbors = [
            [cx, cy - 1],
            [cx, cy + 1],
            [cx - 1, cy],
            [cx + 1, cy],
          ];
          for (const [nx, ny] of neighbors) {
            if (
              nx >= 0 &&
              nx < grid[0].length &&
              ny >= 0 &&
              ny < grid.length
            ) {
              if (grid[ny][nx] === startSymbol && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`);
                q.push([nx, ny]);
              }
            }
          }
        }
        return newLevel;
      });
      return;
    }

    lastDraggedCellRef.current = { x, y };
    addCellToStrokeDraft(x, y, shiftKey, isRightClick, undefined, clientX, clientY);
  }, [addCellToStrokeDraft]);

  const handleCellEnter = React.useCallback((
    x: number,
    y: number,
    shiftKey: boolean,
    buttons: number,
    isPrimary: boolean = true
  ) => {
    hoveredCellRef.current = { x, y };
    if (!isPrimary) return;
    if (touchPointersRef.current.size > 1) return;
    if (isSpaceDownRef.current) return;
    if (pickingCoordinateCallbackRef.current) return;
    if (buttons === 1 || buttons === 2) {
      if (activeToolRef.current === 'select') {
        setSelectionEnd({ x, y });
        return;
      }
      const isRightClick = buttons === 2;
      if (activeToolRef.current === 'cursor' && !isRightClick) return;
      if (activeToolRef.current === 'tweak_entity' && !isRightClick) return;
      if (activeToolRef.current === 'move') {
          if (!isRightClick && moveSourceRef.current) {
              setMoveHoveredCell({x, y});
          }
          return;
      }
      if (!isFillModeRef.current) {
        const lastCell = lastDraggedCellRef.current;
        if (lastCell) {
          const x0 = lastCell.x;
          const y0 = lastCell.y;
          const x1 = x;
          const y1 = y;

          const dx = Math.abs(x1 - x0);
          const dy = Math.abs(y1 - y0);
          const sx = x0 < x1 ? 1 : -1;
          const sy = y0 < y1 ? 1 : -1;
          let err = dx - dy;

          let cx = x0;
          let cy = y0;

          while (true) {
            addCellToStrokeDraft(cx, cy, shiftKey, isRightClick);
            if (cx === x1 && cy === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
              err -= dy;
              cx += sx;
            }
            if (e2 < dx) {
              err += dx;
              cy += sy;
            }
          }
        } else {
          addCellToStrokeDraft(x, y, shiftKey, isRightClick);
        }
        lastDraggedCellRef.current = { x, y };
      }
    }
  }, [addCellToStrokeDraft]);

  const handleCellDownWrapper = React.useCallback((e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}
    setTimeout(() => {
      try {
        if (e.target && (e.target as Element).hasPointerCapture(e.pointerId)) {
          (e.target as Element).releasePointerCapture(e.pointerId);
        }
      } catch(err) {}
    }, 0);
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const effectiveButtons = isTouch && e.buttons === 0 ? 1 : e.buttons;
    
    handleCellDown(x, y, e.shiftKey, effectiveButtons, e.isPrimary, e.clientX, e.clientY);
    
    if (isTouch && activeToolRef.current !== 'select') {
      if (longPressStateRef.current?.timer) clearTimeout(longPressStateRef.current.timer);
      longPressStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        cellX: x,
        cellY: y,
        shift: e.shiftKey,
        primary: e.isPrimary,
        timer: setTimeout(() => {
          if (longPressStateRef.current) {
            handleCellDown(
              longPressStateRef.current.cellX, 
              longPressStateRef.current.cellY, 
              longPressStateRef.current.shift, 
              2, // Right-click simulation
              longPressStateRef.current.primary, 
              longPressStateRef.current.startX, 
              longPressStateRef.current.startY
            );
            longPressStateRef.current = null;
          }
        }, 500)
      };
    }
  }, [handleCellDown]);

  const handleCellEnterWrapper = React.useCallback((e: React.PointerEvent<HTMLDivElement>, x: number, y: number) => {
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const isTouchActiveDraw = isTouch && touchPointersRef.current.has(e.pointerId);
    const effectiveButtons = isTouch 
      ? (isTouchActiveDraw ? 1 : 0) 
      : e.buttons;
    handleCellEnter(x, y, e.shiftKey, effectiveButtons, e.isPrimary);
  }, [handleCellEnter]);

  const handleCellDraw = React.useCallback((x: number, y: number, shiftKey: boolean = false, isRightClick: boolean = false, explicitEraseType?: 'grid' | 'entity' | 'light' | 'sound' | 'particle' | 'all', isPointerEnter: boolean = false, clientX?: number, clientY?: number) => {
    if (activeToolRef.current === 'cursor' && !isRightClick) return;
    if (activeToolRef.current === 'tweak_entity' && !isRightClick) return;

    const effectiveTool = isRightClick ? "erase" : activeToolRef.current;

    console.log("handleCellDraw start", {x, y, currentFloor: currentFloorRef.current, grids: !!levelRef.current.grids, gridFloor: !!levelRef.current.grids?.[currentFloorRef.current], entities: !!levelRef.current.entities, entFloor: !!levelRef.current.entities?.[currentFloorRef.current]});

    if (
      !levelRef.current.grids ||
      !levelRef.current.grids[currentFloorRef.current]
    ) {
      console.warn("bailing out early because something is undefined");
      return;
    }

    // On touch, tap triggers pointerenter (first) then pointerdown. 
    // If we only show the modal on !isPointerEnter, tapping on mobile might erase via pointerenter.
    // Instead of completely skipping on isPointerEnter, we should skip ONLY if we are legitimately dragging.
    // But since it's tricky to distinguish tap-enter from drag-enter without tracking, 
    // we just use the touch pointer behavior which requires us to NOT erase implicitly on pointerenter if items > 1.
    if (effectiveTool === 'erase' && !isFillModeRef.current && !shiftKey && !explicitEraseType) {
      const gridCell = levelRef.current.grids[currentFloorRef.current][y]?.[x] || ' ';
      const entCell = levelRef.current.entities?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const lightCell = levelRef.current.gridLight?.[y]?.[x] || '.';
      const soundCell = levelRef.current.gridSounds?.[currentFloorRef.current]?.[y]?.[x] || '.';
      const particleExists = levelRef.current.particles?.some((p: any) => Math.floor(p.x) === x && Math.floor(p.y) === y);

      const items: { type: 'grid' | 'entity' | 'light' | 'sound' | 'particle'; char: string; desc: string }[] = [];
      if (gridCell !== ' ') {
         const cInfo = levelRef.current.construction?.find((c: any) => c.symbol === gridCell);
         const word = cInfo ? (cInfo.type === 'wall' ? (uiStrings.desc_wall || 'Wall') : (uiStrings.desc_floor || 'Floor')) : 
                        (gridCell === '.' ? (uiStrings.desc_floor || 'Floor') : (uiStrings.desc_grid || 'Grid'));
         items.push({ type: 'grid', char: gridCell, desc: `${word} (${gridCell})` });
      }
      if (entCell !== '.' && entCell !== ' ') {
         let desc = `${uiStrings.desc_entity || 'Entity'} (${entCell})`;
         if (entCell === (levelRef.current.playerStart?.symbol || 'S')) desc = `${uiStrings.desc_spawn || 'Spawn'} (${entCell})`;
         else if (levelRef.current.doorDefinitions?.[entCell]) desc = `${uiStrings.desc_door || 'Door'} (${entCell})`;
         else if (levelRef.current.portals?.find((p: any) => p.symbol === entCell)) desc = `${uiStrings.desc_portal || 'Portal'} (${entCell})`;
         else if (levelRef.current.enemies?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_enemy || 'Enemy'} (${entCell})`;
         else if (levelRef.current.NPCs?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_npc || 'NPC'} (${entCell})`;
         else if (levelRef.current.items?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_item || 'Item'} (${entCell})`;
         else if (levelRef.current.decorations?.find((e: any) => e.symbol === entCell)) desc = `${uiStrings.desc_decoration || 'Decoration'} (${entCell})`;
         items.push({ type: 'entity', char: entCell, desc });
      }
      if (lightCell !== '.' && lightCell !== ' ') {
         items.push({ type: 'light', char: lightCell, desc: `${uiStrings.desc_light || 'Light'} (${lightCell})` });
      }
      if (soundCell !== '.' && soundCell !== ' ') {
         items.push({ type: 'sound', char: soundCell, desc: `${uiStrings.desc_sound || 'Sound'} (${soundCell})` });
      }
      if (particleExists) {
         items.push({ type: 'particle', char: '*', desc: `Particle (*)` });
      }

      if (items.length > 1) {
         if (isPointerEnter && touchPointersRef.current.size > 0) {
            // Dragging over multiple items. Erase them all without modal to be convenient.
         } else if (isPointerEnter && touchPointersRef.current.size === 0) {
            // This is the pointerEnter event fired right before pointerDown during a mobile tap.
            // Do NOT do anything, wait for pointerDown.
            return;
         } else {
            // Not pointer enter, so it's a down event. Show modal!
            setEraseModalData({ x, y, items, clientX: clientX || 0, clientY: clientY || 0 });
            return;
         }
      }
    }

    let path = [{ x, y }];
    if (shiftKey && lastClickRef.current) {
      const dx = Math.abs(x - lastClickRef.current.x);
      const dy = Math.abs(y - lastClickRef.current.y);
      const sx = lastClickRef.current.x < x ? 1 : -1;
      const sy = lastClickRef.current.y < y ? 1 : -1;
      let err = dx - dy;

      let cx = lastClickRef.current.x;
      let cy = lastClickRef.current.y;
      path = [];

      while (true) {
        path.push({ x: cx, y: cy });
        if (cx === x && cy === y) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          cx += sx;
        }
        if (e2 < dx) {
          err += dx;
          cy += sy;
        }
      }
    }
    lastClickRef.current = { x, y };

    setLevel((prevLevel) => {
      let resultingLevel = smartCloneLevel(prevLevel);

      // Ensure that grids index and other floor structures are completely initialized and aligned for all floors to prevent crash on upper floors
      if (!resultingLevel.entities) {
        resultingLevel.entities = [];
      }
      for (let f = 0; f < resultingLevel.grids.length; f++) {
        const h = resultingLevel.grids[f]?.length || 20;
        const w = resultingLevel.grids[f]?.[0]?.length || 20;
        if (!resultingLevel.entities[f] || resultingLevel.entities[f].length !== h) {
          resultingLevel.entities[f] = Array(h).fill(".".repeat(w));
        }
      }

      if (!resultingLevel.itemsGrid) {
        resultingLevel.itemsGrid = [];
      }
      for (let f = 0; f < resultingLevel.grids.length; f++) {
        const h = resultingLevel.grids[f]?.length || 20;
        const w = resultingLevel.grids[f]?.[0]?.length || 20;
        if (!resultingLevel.itemsGrid[f] || resultingLevel.itemsGrid[f].length !== h) {
          resultingLevel.itemsGrid[f] = Array(h).fill(".".repeat(w));
        }
      }

      if (resultingLevel.gridSounds) {
        for (let f = 0; f < resultingLevel.grids.length; f++) {
          const h = resultingLevel.grids[f]?.length || 20;
          const w = resultingLevel.grids[f]?.[0]?.length || 20;
          if (!resultingLevel.gridSounds[f] || resultingLevel.gridSounds[f].length !== h) {
            resultingLevel.gridSounds[f] = Array(h).fill(".".repeat(w));
          }
        }
      }

      let writeSymbol = ".";
      if (effectiveTool === "construction") {
        const { symbol, newConstruction } = resolveBrushSymbol(
          brushConfigRef.current,
          resultingLevel,
        );
        writeSymbol = symbol;
        if (newConstruction) {
          const consts = [...(resultingLevel.construction || [])];
          const existingIdx = consts.findIndex((c: any) => c.symbol === symbol);
          if (existingIdx >= 0) {
            consts[existingIdx] = newConstruction;
          } else {
            consts.push(newConstruction);
            if (brushConfigRef.current.symbol !== symbol) {
              brushConfigRef.current.symbol = symbol;
              setBrushConfig(newConstruction);
            }
          }
          resultingLevel.construction = consts;
        }
      } else if (effectiveTool === "door") {
        const { symbol, newDoorConfig } = resolveDoorBrushSymbol(
          doorBrushConfigRef.current,
          resultingLevel,
        );
        writeSymbol = symbol;
        if (newDoorConfig) {
          const defs = { ...(resultingLevel.doorDefinitions || {}) };
          defs[symbol] = newDoorConfig;
          resultingLevel.doorDefinitions = defs;
          if (doorBrushConfigRef.current.symbol !== symbol) {
            doorBrushConfigRef.current.symbol = symbol;
            setDoorBrushConfig(newDoorConfig);
          }
        }
      } else if (effectiveTool === "portal") {
        const { symbol, newPortalConfig } = resolvePortalBrushSymbol(
          portalBrushConfigRef.current,
          resultingLevel
        );
        writeSymbol = symbol;
        if (newPortalConfig) {
          const portals = [...(resultingLevel.portals || [])];
          const existingIdx = portals.findIndex((p: any) => p.symbol === symbol);
          if (existingIdx >= 0) {
            portals[existingIdx] = newPortalConfig;
          } else {
            portals.push(newPortalConfig);
            if (portalBrushConfigRef.current.symbol !== symbol) {
              portalBrushConfigRef.current.symbol = symbol;
              setPortalBrushConfig(newPortalConfig);
            }
          }
          resultingLevel.portals = portals;
        }
      } else if (effectiveTool === "entity") {
        const { symbol, newEntityConfig } = resolveEntityBrushSymbol(
          entityBrushConfigRef.current,
          resultingLevel
        );
        writeSymbol = symbol;
        if (newEntityConfig) {
          const listName = newEntityConfig.entityType === 'enemy' ? 'enemies' : newEntityConfig.entityType === 'npc' ? 'NPCs' : newEntityConfig.entityType === 'item' ? 'items' : 'decorations';
          const list = [...(resultingLevel[listName] || [])];
          const existingIdx = list.findIndex((c: any) => c.symbol === symbol);
          if (existingIdx >= 0) {
            list[existingIdx] = newEntityConfig;
          } else {
            list.push(newEntityConfig);
            if (entityBrushConfigRef.current.symbol !== symbol) {
              entityBrushConfigRef.current.symbol = symbol;
              setEntityBrushConfig(newEntityConfig);
            }
          }
          resultingLevel[listName] = list;
        }
      } else if (effectiveTool === "sound") {
        const { symbol, newSoundConfig } = resolveSoundBrushSymbol(
          soundBrushConfigRef.current,
          resultingLevel
        );
        writeSymbol = symbol;
        if (newSoundConfig) {
          const sounds = [...(resultingLevel.ambientSounds || [])];
          const existingIdx = sounds.findIndex((s: any) => s.symbol === symbol);
          if (existingIdx >= 0) {
            sounds[existingIdx] = newSoundConfig;
          } else {
            sounds.push(newSoundConfig);
            if (soundBrushConfigRef.current.symbol !== symbol) {
              soundBrushConfigRef.current.symbol = symbol;
              setSoundBrushConfig(newSoundConfig);
            }
          }
          resultingLevel.ambientSounds = sounds;
        }
      } else if (effectiveTool === "light") {
        const { symbol, newLightConfig } = resolveLightBrushSymbol(
          brushConfigRef.current,
          resultingLevel
        );
        writeSymbol = symbol;
        if (newLightConfig && symbol && symbol !== '.') {
          const defs = { ...(resultingLevel.lightDefinitions || {}) };
          defs[symbol] = newLightConfig;
          resultingLevel.lightDefinitions = defs;
          // Note: light uses brushConfig for state, sharing with construction!
          if (brushConfigRef.current.symbol !== symbol) {
            brushConfigRef.current.symbol = symbol;
            setBrushConfig(newLightConfig);
          }
        }
      } else if (effectiveTool === "erase") {
        writeSymbol = " ";
      }

      for (const p of path) {
        const px = p.x;
        const py = p.y;
        if (effectiveTool === "spawn") {
          let spawnSym = resultingLevel.playerStart?.symbol;
          const previousSpawnSym = spawnSym || "S";

          if (!spawnSym) {
            spawnSym = getAvailableSymbol(resultingLevel, "entity", "S");
            resultingLevel.playerStart = {
              symbol: spawnSym,
              dir: resultingLevel.playerStart?.dir || "N",
            };
          } else {
            // Check if to-be-used symbol is somehow still "taken" by another normal entity?
            // Usually not possible unless manually edited json, but just in case we don't change it here, since it's already recorded in playerStart.
          }

          // Clear spawn symbol from ALL floors to ensure there's only ever one player spawn location
          for (let f = 0; f < resultingLevel.entities.length; f++) {
            const floorGrid = resultingLevel.entities[f];
            for (let r = 0; r < floorGrid.length; r++) {
              if (floorGrid[r].includes(previousSpawnSym)) {
                floorGrid[r] = floorGrid[r].split(previousSpawnSym).join(".");
              }
              if (spawnSym !== previousSpawnSym && floorGrid[r].includes(spawnSym)) {
                floorGrid[r] = floorGrid[r].split(spawnSym).join(".");
              }
            }
          }

          const currentEntitiesGrid = resultingLevel.entities[currentFloorRef.current];
          const row = currentEntitiesGrid[py].split("");
          row[px] = spawnSym;
          currentEntitiesGrid[py] = row.join("");

          const newGrid = resultingLevel.grids[currentFloorRef.current];
          const cellChar = newGrid[py][px];
          const isWallCell = cellChar === "#" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "wall" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "window";
          if (isWallCell) {
            const gridRow = newGrid[py].split("");
            gridRow[px] = ".";
            newGrid[py] = gridRow.join("");
          }
        } else if (effectiveTool === "particle") {
          if (!resultingLevel.particles) resultingLevel.particles = [];
          if (particleBrushConfigRef.current.definitionId) {
             const existingIdx = resultingLevel.particles.findIndex((p: any) => Math.floor(p.x) === px && Math.floor(p.y) === py);
             if (existingIdx >= 0) {
                 resultingLevel.particles[existingIdx].definitionId = particleBrushConfigRef.current.definitionId;
                 resultingLevel.particles[existingIdx].z = particleBrushConfigRef.current.z || 0;
             } else {
                 resultingLevel.particles.push({
                     id: Math.random().toString(36).substring(2, 9),
                     definitionId: particleBrushConfigRef.current.definitionId,
                     x: px + 0.5,
                     y: py + 0.5,
                     z: particleBrushConfigRef.current.z || 0
                 });
             }
          }
        } else if (effectiveTool === "portal" || effectiveTool === "entity" || effectiveTool === "door") {
          const isItem = effectiveTool === "entity" && resultingLevel.items?.some((i: any) => i.symbol === writeSymbol);

          if (isItem) {
             if (!resultingLevel.itemsGrid) {
                 const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
                 resultingLevel.itemsGrid = resultingLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
             }
             if (!resultingLevel.itemsGrid[currentFloorRef.current]) {
                 resultingLevel.itemsGrid[currentFloorRef.current] = Array(resultingLevel.grids[currentFloorRef.current].length).fill(".".repeat(resultingLevel.grids[currentFloorRef.current][0].length));
             }
             const grid = resultingLevel.itemsGrid[currentFloorRef.current];
             const row = grid[py].split("");
             const currentBaseItems = resolveCombo(row[px]);
             const newBaseItems = [...currentBaseItems, writeSymbol];
             const comboSym = getComboSymbol(newBaseItems, resultingLevel);
             if (row[px] !== comboSym && resultingLevel.entityOverrides) {
                 delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_items`];
             }
             row[px] = comboSym;
             grid[py] = row.join("");
          } else {
             const newEntitiesGrid = resultingLevel.entities[currentFloorRef.current];
             const row = newEntitiesGrid[py].split("");
             if (effectiveTool === "entity" && row[px] !== "." && row[px] !== " ") {
                const currentBaseEntities = resolveCombo(row[px]);
                const newBaseEntities = [...currentBaseEntities, writeSymbol];
                const comboSym = getComboSymbol(newBaseEntities, resultingLevel);
                if (row[px] !== comboSym && resultingLevel.entityOverrides) {
                    delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                    for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                        delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                    }
                }
                row[px] = comboSym;
             } else {
                if (row[px] !== writeSymbol && resultingLevel.entityOverrides) {
                    delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                    for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                        delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                    }
                }
                row[px] = writeSymbol;
             }
             newEntitiesGrid[py] = row.join("");
          }

          if (effectiveTool === "portal" || effectiveTool === "door") {
            const newGrid = resultingLevel.grids[currentFloorRef.current];
            const cellChar = newGrid[py][px];
            const isWallCell = cellChar === "#" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "wall" || prevLevel.construction?.find((c: any) => c.symbol === cellChar)?.type === "window";
            if (isWallCell) {
              const gridRow = newGrid[py].split("");
              gridRow[px] = ".";
              newGrid[py] = gridRow.join("");
            }
          }
        } else if (effectiveTool === "light") {
          if (!resultingLevel.gridLight) {
              const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
              resultingLevel.gridLight = Array(resultingLevel.grids[0].length).fill(rowTemplate);
          }
          const tgtGrid = resultingLevel.gridLight;
          if (tgtGrid[py]) {
            const row = tgtGrid[py].split("");
            row[px] = writeSymbol;
            tgtGrid[py] = row.join("");
          }
        } else if (effectiveTool === "sound") {
          if (!resultingLevel.gridSounds) {
              const rowTemplate = ".".repeat(resultingLevel.grids[0][0].length);
              resultingLevel.gridSounds = resultingLevel.grids.map((g: string[]) => Array(g.length).fill(rowTemplate));
          }
          const tgtGrid = resultingLevel.gridSounds[currentFloorRef.current];
          if (tgtGrid && tgtGrid[py]) {
            const row = tgtGrid[py].split("");
            row[px] = writeSymbol;
            tgtGrid[py] = row.join("");
          }
        } else {
          const newGrid = resultingLevel.grids[currentFloorRef.current];
          const row = newGrid[py].split("");

          if (effectiveTool === "erase") {
            const eraseAll = !explicitEraseType || explicitEraseType === 'all';
            const newEntities = resultingLevel.entities[currentFloorRef.current];
            if ((eraseAll || explicitEraseType === 'entity') && newEntities && newEntities[py]) {
              const entRow = newEntities[py].split("");
              entRow[px] = ".";
              newEntities[py] = entRow.join("");

              if (resultingLevel.entityOverrides) {
                  delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}`];
                  for (const l of ['items', 'decorations', 'NPCs', 'enemies', 'portals']) {
                      delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_${l}`];
                  }
              }
            }
            if ((eraseAll || explicitEraseType === 'entity') && resultingLevel.itemsGrid && resultingLevel.itemsGrid[currentFloorRef.current] && resultingLevel.itemsGrid[currentFloorRef.current][py]) {
              const itemRow = resultingLevel.itemsGrid[currentFloorRef.current][py].split("");
              const currentSymbolOnCell = itemRow[px];
              if (currentSymbolOnCell !== ".") {
                const currentBaseItems = resolveCombo(currentSymbolOnCell);
                if (currentBaseItems.length > 1) {
                  const newBaseItems = currentBaseItems.slice(0, currentBaseItems.length - 1);
                  const newCellSymbol = getComboSymbol(newBaseItems, resultingLevel);
                  itemRow[px] = newCellSymbol;
                } else {
                  itemRow[px] = ".";
                  if (resultingLevel.entityOverrides) {
                     delete resultingLevel.entityOverrides[`${currentFloorRef.current}_${py}_${px}_items`];
                  }
                }
                resultingLevel.itemsGrid[currentFloorRef.current][py] = itemRow.join("");
              }
            }
            if ((eraseAll || explicitEraseType === 'grid') && resultingLevel.triggers) {
               resultingLevel.triggers = resultingLevel.triggers.filter((t: any) => !(t.type === 'ON_ENTER_TILE' && t.params?.x === px && t.params?.y === py));
            }
            if ((eraseAll || explicitEraseType === 'light') && resultingLevel.gridLight && resultingLevel.gridLight[py]) {
                 const lRow = resultingLevel.gridLight[py].split("");
                 lRow[px] = ".";
                 resultingLevel.gridLight[py] = lRow.join("");
            }
            if ((eraseAll || explicitEraseType === 'sound') && resultingLevel.gridSounds) {
                 const currentGridSounds = resultingLevel.gridSounds[currentFloorRef.current];
                 if (currentGridSounds && currentGridSounds[py]) {
                     const sRow = currentGridSounds[py].split("");
                     sRow[px] = ".";
                     currentGridSounds[py] = sRow.join("");
                 }
            }
            if ((eraseAll || explicitEraseType === 'particle') && resultingLevel.particles) {
               resultingLevel.particles = resultingLevel.particles.filter(
                   (p: any) => Math.floor(p.x) !== px || Math.floor(p.y) !== py
               );
            }
            
            if (eraseAll || explicitEraseType === 'grid') {
               row[px] = " ";
            }
          } else {
            row[px] = writeSymbol;
          }

          newGrid[py] = row.join("");
        }
      }

      return resultingLevel;
    });
  }, []);

  handleCellDrawRef.current = handleCellDraw;

  const handleApplySize = () => {
    recordHistory();
    const newGrids = [...(level.grids || [])];
    const w = Number(width) || 1;
    const h = Number(height) || 1;

    if (newGrids.length === 0) newGrids.push([]);

    for (let floorIdx = 0; floorIdx < newGrids.length; floorIdx++) {
      const currentGrid = newGrids[floorIdx] || [];
      const newGrid = [];
      for (let y = 0; y < h; y++) {
        let row = "";
        for (let x = 0; x < w; x++) {
          if (y < currentGrid.length && x < currentGrid[y].length) {
            row += currentGrid[y][x];
          } else {
            row += " ";
          }
        }
        newGrid.push(row);
      }
      newGrids[floorIdx] = newGrid;
    }

    // Also adjust entities
    const newEntities = [...(level.entities || [])];
    if (newEntities.length === 0) newEntities.push([]);
    for (let floorIdx = 0; floorIdx < newEntities.length; floorIdx++) {
      const ce = newEntities[floorIdx] || [];
      const ne = [];
      for (let y = 0; y < h; y++) {
        let row = "";
        for (let x = 0; x < w; x++) {
          if (y < ce.length && x < ce[y].length) {
            row += ce[y][x];
          } else {
            row += ".";
          }
        }
        ne.push(row);
      }
      newEntities[floorIdx] = ne;
    }

    const adjustGrid = (gridContainer: string[] | undefined, emptyChar: string) => {
       if (!gridContainer) return undefined;
       const newG = [];
       for (let y = 0; y < h; y++) {
         let row = "";
         for (let x = 0; x < w; x++) {
           if (y < gridContainer.length && x < gridContainer[y].length) {
             row += gridContainer[y][x];
           } else {
             row += emptyChar;
           }
         }
         newG.push(row);
       }
       return newG;
    };

    const newGridLight = adjustGrid(level.gridLight, ".");
    const newGridSounds = level.gridSounds 
        ? level.gridSounds.map(floorGrid => adjustGrid(floorGrid, ".")!) 
        : undefined;

    setLevel({ 
       ...level, 
       grids: newGrids, 
       entities: newEntities,
       ...(newGridLight !== undefined ? { gridLight: newGridLight } : {}),
       ...(newGridSounds !== undefined ? { gridSounds: newGridSounds } : {})
    });
  };

  const [customAssetsLoaded, setCustomAssetsLoaded] = useState(() => !!(window as any).__CUSTOM_ASSETS_LOADED);

  const handleLoadCustomAssetsZip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        let count = 0;
        
        // Prepare global fetch proxy if not already present
        if (!(window as any).__FETCH_PATCHED) {
            const originalFetch = window.fetch;
            Object.defineProperty(window, 'fetch', {
                value: async (input: RequestInfo | URL, init?: RequestInit) => {
                    const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
                    const normUrl = urlStr.replace(/^\.?\/?/, ''); // normalize './data...' to 'data...'
                    const customFiles = (window as any).__CUSTOM_ZIP_FILES || {};
                    
                    if (normUrl && customFiles[normUrl]) {
                        return new Response(customFiles[normUrl], { status: 200, headers: { 'Content-Type': 'application/json' }});
                    }
                    return originalFetch(input, init);
                },
                writable: true,
                configurable: true
            });
            (window as any).__FETCH_PATCHED = true;
        }
        
        (window as any).__CUSTOM_ZIP_FILES = (window as any).__CUSTOM_ZIP_FILES || {};
        
        const replaceData = (target: any, source: any) => {
            if (!target || typeof target !== 'object') return;
            if (Array.isArray(target) && Array.isArray(source)) {
                target.length = 0;
                target.push(...source);
            } else {
                for (const key in target) delete target[key];
                Object.assign(target, source);
            }
        };

        const dataModules: any = {
            'data/achievements.json': achievementsData,
            'data/animations.json': animationsData,
            'data/credits.json': creditsData,
            'data/de-buffs.json': debuffsData,
            'data/decorations.json': decorationsData,
            'data/dialogues.json': dialoguesData,
            'data/enemies.json': enemiesData,
            'data/items.json': itemsData,
            'data/npcs.json': npcsData,
            'data/particles.json': particlesData,
            'data/player.json': playerData,
            'data/recipes.json': recipesData,
            'data/sounds.json': soundsData,
            'data/strings_en.json': stringsEnData,
            'data/strings_ru.json': stringsRuData,
        };
        
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          
          const lowerName = filename.toLowerCase();
          const isImage = lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
          const isAudio = lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.wav');
          const isJson = lowerName.endsWith('.json');
          const isTs = lowerName.endsWith('.ts');
          
          if (isImage || isAudio) {
            const blob = await zipEntry.async('blob');
            const mimeType = isImage ? 'image/png' : 'audio/mpeg';
            const typedBlob = new Blob([blob], { type: mimeType });
            const url = URL.createObjectURL(typedBlob);
            
            const zipParts = filename.split('/');
            const zipFilenameBase = zipParts[zipParts.length - 1];
            
            if (isImage) {
                const img = new Image();
                img.src = url;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
                
                const dictionaries = [ASSETS.SPRITES, ASSETS.TEXTURES];
                for (const dict of dictionaries) {
                    for (const key of Object.keys(dict)) {
                        const dictUrl = (dict as any)[key];
                        if (dictUrl && typeof dictUrl === 'string') {
                            const urlParts = dictUrl.split('/');
                            const dictFilename = urlParts[urlParts.length - 1].split('?')[0];
                            if (dictFilename.toLowerCase() === zipFilenameBase.toLowerCase()) {
                                (dict as any)[key] = url;
                                engine.masterSpriteMapRef?.current.set(key, img);
                                count++;
                            }
                        }
                    }
                }
            } else if (isAudio) {
                const dict = ASSETS.SOUNDS;
                for (const key of Object.keys(dict)) {
                    const dictUrl = (dict as any)[key];
                    if (dictUrl && typeof dictUrl === 'string') {
                        const urlParts = dictUrl.split('/');
                        const dictFilename = urlParts[urlParts.length - 1].split('?')[0];
                        if (dictFilename.toLowerCase() === zipFilenameBase.toLowerCase()) {
                            (dict as any)[key] = url;
                            count++;
                        }
                    }
                }
            }
          } else if (isJson) {
              const text = await zipEntry.async('string');
              const normFilename = filename.replace(/^\.?\/?/, ''); // normalize paths
              
              if (dataModules[normFilename]) {
                  try {
                      const newJson = JSON.parse(text);
                      replaceData(dataModules[normFilename], newJson);
                      if (normFilename === 'data/player.json') {
                          localStorage.setItem('editor_test_player', text);
                      }
                      count++;
                  } catch (e) {
                      console.error('Failed to parse JSON', normFilename, e);
                  }
              } else if (normFilename.startsWith('data/levels/')) {
                  // Put level JSON into the fetch proxy map
                  (window as any).__CUSTOM_ZIP_FILES[normFilename] = text;
                  count++;
                  
                  // Additionally update allSectors if it matches
                  const globPath = '../../' + normFilename;
                  if ((allSectors as any)[globPath]) {
                      try {
                          const newJson = JSON.parse(text);
                          (allSectors as any)[globPath] = { default: newJson, ...newJson };
                      } catch (e) {}
                  }
              }
          } else if (isTs && filename.endsWith('assets.ts')) {
              const text = await zipEntry.async('string');
              const match = text.match(/export const ASSETS = (\{[\s\S]*?\});/);
              if (match) {
                  try {
                      let jsonStr = match[1];
                      // Fallback fixes if strictly not valid JSON (e.g if no double quotes on keys, though commitSaveAssetsZip produces valid JSON because of JSON.stringify)
                      const newJson = JSON.parse(jsonStr);
                      // Merge ASSETS overriding dictionaries deeply
                      for (const dictKey in newJson) {
                         if ((ASSETS as any)[dictKey]) {
                             replaceData((ASSETS as any)[dictKey], newJson[dictKey]);
                         }
                      }
                      count++;
                  } catch(e) {
                      console.error('Failed to parse assets.ts from zip', e);
                  }
              }
          } else if (isTs && filename.endsWith('data/levels.ts')) {
             const text = await zipEntry.async('string');
             const match = text.match(/export const WORLD_MAP_PATHS = (\[[\s\S]*?\]);/);
             const matchStart = text.match(/export let START_SECTOR_PATH = (['"`][\s\S]*?['"`]);/);
             if (match) {
                 try {
                     const newJson = JSON.parse(match[1]);
                     replaceData(WORLD_MAP_PATHS, newJson);
                     if (matchStart) {
                         const startPath = matchStart[1].replace(/['"`]/g, '');
                         setStartSectorPath(startPath);
                     }
                     count++;
                 } catch(e) {
                     console.error('Failed to parse levels.ts from zip', e);
                 }
             }
          }
        }
        
        if (count > 0) {
            (window as any).__CUSTOM_ASSETS_LOADED = true;
            setCustomAssetsLoaded(true);
            if (engine.setSpriteMap && engine.masterSpriteMapRef) {
                engine.setSpriteMap(new Map(engine.masterSpriteMapRef.current));
            }
            alert(`Успех: загружено и применено ${count} файлов!`);
        } else {
            alert('Подходящие файлы в архиве не найдены.');
        }
      } catch (err) {
        console.error("Error loading custom ZIP", err);
        alert("Ошибка при чтении ZIP архива. " + String(err));
      }
    };
    input.click();
  };

  const handleTestLevel = (disableAI: boolean = false) => {
    let hasSpawn = false;
    if (level.entities) {
      for (const floor of level.entities) {
        for (const row of floor) {
          if (row.includes((level.playerStart?.symbol || "S"))) {
            hasSpawn = true;
            break;
          }
        }
        if (hasSpawn) break;
      }
    }

    if (!hasSpawn) {
      setErrorMessage(
        strings.ui.level_editor?.no_spawn ||
          "Please set a spawn point (S) before testing the level.",
      );
      return;
    }

    if (disableAI) {
      engine.setSettings((prev: any) => ({
        ...prev,
        debug: {
          ...prev.debug,
          aiEnabled: false
        }
      }));
    } else {
      engine.setSettings((prev: any) => ({
        ...prev,
        debug: {
          ...prev.debug,
          aiEnabled: true
        }
      }));
    }

    const testPath = (level as any).originalPath || "CUSTOM_EDITOR_LEVEL";
    sessionStorage.setItem('active_test_path', testPath);

    localStorage.setItem(
      "editor_test_level",
      JSON.stringify({ ...level, isEditorTest: Date.now() }),
    );
    if (engine.sectorStatesRef && engine.sectorStatesRef.current) {
      engine.sectorStatesRef.current.delete(testPath);
    }
    if (engine.clearExploredTiles) {
      engine.clearExploredTiles();
    }
    clearRaycastCache();
    engine.finalizeGameStart(testCharacter, testPath);
  };

  const handleSaveClick = () => {
    if (level.fileName) {
      setSaveFileName(level.fileName);
    } else {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      setSaveFileName(`level_${dateStr}`);
    }
    setShowSaveModal(true);
  };

  const getPreparedLevelToSave = (customLevel?: LevelDefinition) => {
    const targetLevel = customLevel || level;
    const { legend, ...levelToSave } = targetLevel;
    delete (levelToSave as any).isEditorTest;
    
    if (levelToSave.entities || levelToSave.itemsGrid) {
      let lastNonEmptyFloor = -1;
      const maxLen = Math.max(levelToSave.entities?.length || 0, levelToSave.itemsGrid?.length || 0);
      
      for (let i = 0; i < maxLen; i++) {
        const entFloor = levelToSave.entities?.[i] || [];
        const itemsFloor = levelToSave.itemsGrid?.[i] || [];
        
        const hasEntities = entFloor.some((row: string) => row.split('').some((char: string) => char !== '.'));
        const hasItems = itemsFloor.some((row: string) => row.split('').some((char: string) => char !== '.'));
        
        if (hasEntities || hasItems) lastNonEmptyFloor = i;
      }
      
      if (lastNonEmptyFloor >= 0) {
        if (levelToSave.entities) levelToSave.entities = levelToSave.entities.slice(0, lastNonEmptyFloor + 1);
        if (levelToSave.itemsGrid) levelToSave.itemsGrid = levelToSave.itemsGrid.slice(0, lastNonEmptyFloor + 1);
      } else {
        levelToSave.entities = [];
        levelToSave.itemsGrid = [];
      }
    }

    // Garbage collect unused COMBO items that are not referenced in the itemsGrid
    if (levelToSave.items && levelToSave.itemsGrid) {
      const usedSymbols = new Set<string>();
      for (const floor of levelToSave.itemsGrid) {
        if (floor) {
          for (const row of floor) {
            if (row) {
              for (let x = 0; x < row.length; x++) {
                const char = row[x];
                if (char !== '.') {
                  usedSymbols.add(char);
                }
              }
            }
          }
        }
      }
      levelToSave.items = levelToSave.items.filter((item: any) => {
        if (item.type === "COMBO") {
          return usedSymbols.has(item.symbol);
        }
        return true;
      });
    }

    if (levelToSave.grids) {
      let lastNonEmptyFloor = -1;
      for (let i = 0; i < levelToSave.grids.length; i++) {
        const floor = levelToSave.grids[i];
        const hasWalls = floor.some((row: string) => row.split('').some((char: string) => char !== ' '));
        if (hasWalls) lastNonEmptyFloor = i;
      }
      if (lastNonEmptyFloor >= 0) {
        levelToSave.grids = levelToSave.grids.slice(0, lastNonEmptyFloor + 1);
      } else {
        levelToSave.grids = [];
      }
    }
    return levelToSave;
  };

  const commitSaveLevelJson = (fileName?: string) => {
    const finalFileName = fileName || saveFileName;
    const updatedLevel = { ...level, fileName: finalFileName };
    setLevel(updatedLevel);
    setSaveFileName(finalFileName);

    const levelToSave = getPreparedLevelToSave(updatedLevel);
    levelToSave.fileName = finalFileName;

    const blob = new Blob([JSON.stringify(levelToSave, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${finalFileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveModal(false);
  };

  const editedSectorsRef = React.useRef<Record<string, any>>({});

  const commitSaveAssetsZip = async (fileName?: string) => {
    const finalFileName = fileName || saveFileName;
    const zip = new JSZip();

    // Generate ASSETS TS format
    let assetsTsContent = `const BASE_URL = "https://ran4erep.github.io/storm";\nconst EQUIP_URL = \\\`\\$\\{BASE_URL\\}/equip\\\`;\nconst SOUND_URL = \\\`\\$\\{BASE_URL\\}/sounds\\\`;\nconst ANIM_URL = \\\`\\$\\{BASE_URL\\}/anims\\\`;\n\nexport const ASSETS = ${JSON.stringify(ASSETS, null, 2)};`;
    assetsTsContent = assetsTsContent.replace(/"https:\/\/ran4erep\.github\.io\/storm(.*?)"/g, (match, p1) => {
        if (p1.startsWith('/equip')) return `\`\${EQUIP_URL}${p1.replace('/equip', '')}\``;
        if (p1.startsWith('/sounds')) return `\`\${SOUND_URL}${p1.replace('/sounds', '')}\``;
        if (p1.startsWith('/anims')) return `\`\${ANIM_URL}${p1.replace('/anims', '')}\``;
        return `\`\${BASE_URL}${p1}\``;
    }).replace(/};\s*$/, '} as Record<string, string>;');
    zip.file('assets.ts', assetsTsContent);

    // Generate levels.ts content
    let levelsTsContent = `export const WORLD_MAP_PATHS = ${JSON.stringify(WORLD_MAP_PATHS, null, 2)};\n\nexport let START_SECTOR_PATH = ${JSON.stringify(START_SECTOR_PATH)};\n\nexport function setStartSectorPath(newPath: string) {\n  START_SECTOR_PATH = newPath;\n}\n\nexport let TUTORIAL_SECTOR_PATH = ${JSON.stringify(TUTORIAL_SECTOR_PATH)};\n\nexport function setTutorialSectorPath(newPath: string) {\n  TUTORIAL_SECTOR_PATH = newPath;\n}`;
    zip.file('data/levels.ts', levelsTsContent);

    // Add JSON databases
    zip.file('data/achievements.json', JSON.stringify(achievementsData, null, 2));
    zip.file('data/animations.json', JSON.stringify(animationsData, null, 2));
    zip.file('data/credits.json', JSON.stringify(creditsData, null, 2));
    zip.file('data/de-buffs.json', JSON.stringify(debuffsData, null, 2));
    zip.file('data/decorations.json', JSON.stringify(decorationsData, null, 2));
    zip.file('data/dialogues.json', JSON.stringify(dialoguesData, null, 2));
    zip.file('data/enemies.json', JSON.stringify(enemiesData, null, 2));
    zip.file('data/items.json', JSON.stringify(itemsData, null, 2));
    zip.file('data/npcs.json', JSON.stringify(npcsData, null, 2));
    zip.file('data/particles.json', JSON.stringify(particlesData, null, 2));
    zip.file('data/recipes.json', JSON.stringify(recipesData, null, 2));
    zip.file('data/sounds.json', JSON.stringify(soundsData, null, 2));
    zip.file('data/strings_en.json', JSON.stringify(stringsEnData, null, 2));
    zip.file('data/strings_ru.json', JSON.stringify(stringsRuData, null, 2));
    
    // Check if player data has been modified and saved to localStorage
    const savedPlayer = localStorage.getItem('editor_test_player');
    const playerToSave = savedPlayer ? JSON.parse(savedPlayer) : playerData;
    zip.file('data/player.json', JSON.stringify(playerToSave, null, 2));

    // Save modified sectors
    const allSectorPathsToSave = getAllSectorPathsFromGlob(allSectors);
    for (const path of allSectorPathsToSave) {
      if (!path || !path.endsWith('.json')) continue;
      const globPath = path.replace(/^\.?\/?data\/levels/, '../../data/levels');
      
      let sectData = editedSectorsRef.current[path];
      if (!sectData && allSectors[globPath] && (allSectors[globPath] as any).default) {
          sectData = (allSectors[globPath] as any).default;
      }

      if (sectData) {
          const zipPath = path.replace(/^\.?\/?/, ''); // e.g. "data/levels/level1/sector1.json"
          zip.file(zipPath, JSON.stringify(sectData, null, 2));
      }
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${finalFileName || 'assets'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveModal(false);
  };

  const handleEnsureItemsGrid = (parsed: any) => {
    const itemsPaletteSymbols = new Set(parsed.items?.map((i:any) => i.symbol) || []);
    if (parsed.entities && !parsed.itemsGrid) {
      const newItemsGrid: string[][] = [];
      const newEntitiesGrid: string[][] = [];
      for (let f = 0; f < parsed.entities.length; f++) {
        const entFloor = parsed.entities[f];
        const nextEntFloor: string[] = [];
        const nextItemFloor: string[] = [];
        for (let y = 0; y < entFloor.length; y++) {
          const row = entFloor[y];
          let entRowStr = "";
          let itemRowStr = "";
          for (let x = 0; x < row.length; x++) {
             const char = row[x];
             if (itemsPaletteSymbols.has(char)) {
                 itemRowStr += char;
                 entRowStr += '.';
             } else {
                 itemRowStr += '.';
                 entRowStr += char;
             }
          }
          nextEntFloor.push(entRowStr);
          nextItemFloor.push(itemRowStr);
        }
        newEntitiesGrid.push(nextEntFloor);
        newItemsGrid.push(nextItemFloor);
      }
      parsed.entities = newEntitiesGrid;
      parsed.itemsGrid = newItemsGrid;
    }
  };

  const handleLoad = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const fileBaseName = file.name.replace(/\.json$/i, '');
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const parsed = JSON.parse(re.target?.result as string);
          if (!parsed.fileName) {
            parsed.fileName = fileBaseName;
          }
          handleEnsureItemsGrid(parsed);
          createTab(parsed);
          setSaveFileName(parsed.fileName);
        } catch (err) {
          console.error(err);
          alert("Invalid level file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleLoadSectorFromPaths = (path: string) => {
    // path from import.meta.glob might be '../../data/levels/level1/sector1.json'
    // but the runtime path is usually './data/levels/level1/sector1.json'
    const globPath = path.replace(/^\.?\/?data\/levels/, '../../data/levels');
    const module = allSectors[globPath] as any;
    if (module && module.default) {
       // Copy to avoid modifying the read-only imported module
       const parsed = JSON.parse(JSON.stringify(module.default));
       const standardizedPath = path.replace(/^(\.\.\/)+data/, './data');
       parsed.originalPath = standardizedPath;
       const fileName = path.split('/').pop()?.replace('.json', '') || 'level';
       parsed.fileName = fileName;
       handleEnsureItemsGrid(parsed);
       createTab(parsed);
       setSaveFileName(fileName);
       setAssetEditorMode(null);
    } else {
       alert("Sector JSON file not found in build: " + globPath);
    }
  };

  const handleNextFloor = () => {
    recordHistory();
    let newLevel = { ...level };
    newLevel.grids = level.grids ? [...level.grids] : [];
    newLevel.entities = level.entities ? [...level.entities] : [];

    if (currentFloor + 1 >= newLevel.grids.length) {
      // Create new floor
      const w = Number(width) || (newLevel.grids[0]?.[0]?.length ?? 20);
      const h = Number(height) || (newLevel.grids[0]?.length ?? 20);
      const gridRow = " ".repeat(w);
      const entRow = ".".repeat(w);
      newLevel.grids.push(Array(h).fill(gridRow));
      newLevel.entities.push(Array(h).fill(entRow));
      
      if (newLevel.gridSounds) {
        newLevel.gridSounds = [...newLevel.gridSounds];
        const rowTemplate = ".".repeat(w);
        newLevel.gridSounds.push(Array(h).fill(rowTemplate));
      }
      
      setLevel(newLevel);
    }
    setCurrentFloor((prev) => prev + 1);
  };

  const handlePrevFloor = () => {
    if (currentFloor > 0) {
      setCurrentFloor((prev) => prev - 1);
    }
  };

  const portalLinesData = React.useMemo(() => {
    let gridW = 0;
    let gridH = 0;
    const lines: {id: string, startX: number, startY: number, endX: number, endY: number}[] = [];
    
    if (viewPortals && level.entities && level.entities[currentFloor] && level.portals && level.grids && level.grids[currentFloor]) {
      gridH = level.grids[currentFloor].length * 32 + 2;
      gridW = (level.grids[currentFloor][0]?.length || 0) * 32 + 2;
      
      const portalPositions: Record<string, {x: number, y: number, portalId: string, targetPortalId?: string}> = {};
      
      for (let y = 0; y < level.entities[currentFloor].length; y++) {
        for (let x = 0; x < level.entities[currentFloor][y].length; x++) {
          const char = level.entities[currentFloor][y][x];
          const p = level.portals.find(p => p.symbol === char);
          if (p && p.portalId) {
            portalPositions[p.portalId] = { x, y, portalId: p.portalId, targetPortalId: p.targetPortalId };
          }
        }
      }

      Object.values(portalPositions).forEach(p1 => {
         if (p1.targetPortalId && portalPositions[p1.targetPortalId]) {
            const p2 = portalPositions[p1.targetPortalId];
            const lineId = `${p1.portalId}->${p2.portalId}`;
            lines.push({
               id: lineId,
               startX: 1 + p1.x * 32 + 16,
               startY: 1 + p1.y * 32 + 16,
               endX: 1 + p2.x * 32 + 16,
               endY: 1 + p2.y * 32 + 16,
            });
         }
      });
    }
    
    return { gridW, gridH, lines };
  }, [viewPortals, level.entities, level.portals, level.grids, currentFloor]);

  const memoizedConstructionList = React.useMemo(() => {
    if (!level.construction) return null;
    
    const filtered = level.construction
      .map((item, originalIdx) => ({ item, originalIdx }))
      .filter(({ item }) => {
        if (constructionTypeFilter === 'all') return true;
        const itemType = item.type || 'wall';
        return itemType === constructionTypeFilter;
      });

    return filtered.map(({ item, originalIdx }) => {
      const itemDisplayedAssetId = (item.mirror && item.maskTargetAsset && getPreviewSrc(item.maskTargetAsset))
        ? item.maskTargetAsset
        : item.assetId;

      return (
        <div
          key={item.symbol}
          className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${brushConfig.symbol === item.symbol && activeTool === "construction" ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
          onClick={() => {
            setBrushConfig(item);
            setActiveTool("construction");
            setIsMobilePaletteOpen(false);
          }}
        >
          <div className="w-8 h-8 shrink-0 bg-black rounded flex items-center justify-center relative overflow-hidden">
            {itemDisplayedAssetId && getPreviewSrc(itemDisplayedAssetId) && (
              <img
                draggable={false}
                src={getPreviewSrc(itemDisplayedAssetId)!}
                className={`absolute inset-0 w-full h-full ${isTextureAsset(itemDisplayedAssetId) ? 'object-cover' : 'object-contain'}`}
                style={{ imageRendering: "pixelated" }}
                alt=""
              />
            )}
            {item.type === 'window' && (
              <div className="absolute border border-cyan-400 bg-cyan-900/40" style={{
                 top: `${(item.cutout?.topLeft?.y ?? 0.25) * 100}%`,
                 bottom: `${(1 - (item.cutout?.bottomRight?.y ?? 0.75)) * 100}%`,
                 left: `${(item.cutout?.topLeft?.x ?? 0.25) * 100}%`,
                 right: `${(1 - (item.cutout?.bottomRight?.x ?? 0.75)) * 100}%`
              }}>
                {item.glassAssetId && getPreviewSrc(item.glassAssetId) && (
                  <img
                    src={getPreviewSrc(item.glassAssetId)!}
                    className="w-full h-full object-cover opacity-80"
                    style={{ imageRendering: "pixelated" }}
                    alt=""
                  />
                )}
              </div>
            )}
            {/* FACE OVERRIDES */}
            {(item.type === 'wall' || item.type === 'window' || !item.type) && item.faces && (
              <div className={`absolute inset-0 pointer-events-none z-10 ${
                item.faces.N ? 'border-t-2 border-t-blue-500 ' : ''
              }${
                item.faces.S ? 'border-b-2 border-b-red-500 ' : ''
              }${
                item.faces.E ? 'border-r-2 border-r-yellow-500 ' : ''
              }${
                item.faces.W ? 'border-l-2 border-l-green-500 ' : ''
              }`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-300 truncate flex items-center gap-1.5 font-mono">
              <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] font-black rounded text-white">{item.symbol}</span>
              {item.type || 'wall'}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {item.assetId ||
                (item.footstepSound
                  ? "SOUND: " + item.footstepSound
                  : "")}
              {item.height !== undefined && (((item.type || 'wall') === 'wall' && item.height !== 1.0) || (item.type === 'floor' && item.height !== 0.0)) && (
                <span className={`${(item.type || 'wall') === 'wall' ? (item.height < 1.0 ? 'text-red-400' : 'text-blue-400') : (item.height < 0.0 ? 'text-orange-400' : 'text-emerald-400')} ml-1 font-bold`}>
                  | {(item.type || 'wall') === 'wall' ? 'h' : 'e'}: {item.height}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              disabled={originalIdx === 0}
              onClick={(e) => {
                e.stopPropagation();
                movePaletteItem(originalIdx, 'construction', 'up');
              }}
              className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
              title={uiStrings.btn_move_up || "Move Up"}
            >
              <ChevronUp size={14} />
            </button>
            <button
              disabled={originalIdx === level.construction.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                movePaletteItem(originalIdx, 'construction', 'down');
              }}
              className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
              title={uiStrings.btn_move_down || "Move Down"}
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyPaletteItem(originalIdx, 'construction');
              }}
              className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
              title={uiStrings.btn_copy || "Copy"}
            >
              <Copy size={14} />
            </button>
            <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBrushConfig(item);
                setActiveTool("construction");
                setShowBrushModal(true);
                setIsMobilePaletteOpen(false);
              }}
              className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
              title={uiStrings.settings || "Settings"}
            >
              <Settings size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removePaletteItem(item.symbol, 'construction');
              }}
              className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
              title={uiStrings.btn_delete || "Delete"}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      );
    });
  }, [level.construction, brushConfig.symbol, activeTool, constructionTypeFilter, uiStrings]);

  const memoizedDoorsList = React.useMemo(() => {
    if (!level.doorDefinitions) return null;
    const entries = Object.entries(level.doorDefinitions);
    return entries.map(([char, doorDef]: [string, any], idx) => (
      <div
        key={"door_" + char}
        className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${doorBrushConfig.symbol === char && activeTool === "door" ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
        onClick={() => {
          setDoorBrushConfig({ ...doorDef, symbol: char });
          setActiveTool("door");
          setIsMobilePaletteOpen(false);
        }}
      >
        <div className="w-8 h-8 shrink-0 bg-blue-900 rounded flex items-center justify-center relative overflow-hidden">
          {doorDef.textureId && getPreviewSrc(doorDef.textureId) && (
              <img
                draggable={false}
                src={getPreviewSrc(doorDef.textureId)!}
                className={`absolute inset-0 w-full h-full ${isTextureAsset(doorDef.textureId) ? 'object-cover' : 'object-contain'}`}
                style={{ imageRendering: "pixelated" }}
                alt=""
              />
            )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-300 truncate flex items-center gap-1.5 font-mono">
            <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] font-black rounded text-white">{char}</span>
            DOOR: {doorDef.type}
          </div>
          <div className="text-[10px] text-gray-500 truncate font-mono">
            {doorDef.textureId || "Default"}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            disabled={idx === 0}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'doors', 'up');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_up || "Move Up"}
          >
            <ChevronUp size={14} />
          </button>
          <button
            disabled={idx === entries.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'doors', 'down');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_down || "Move Down"}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyPaletteItem(idx, 'doors');
            }}
            className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
            title={uiStrings.btn_copy || "Copy"}
          >
            <Copy size={14} />
          </button>
          <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDoorBrushConfig({ ...doorDef, symbol: char });
              setActiveTool("door");
              setShowDoorModal(true);
              setIsMobilePaletteOpen(false);
            }}
            className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
            title={uiStrings.settings || "Settings"}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePaletteItem(char, 'doors');
            }}
            className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
            title={uiStrings.btn_delete || "Delete"}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    ));
  }, [level.doorDefinitions, doorBrushConfig.symbol, activeTool]);

  const memoizedLightsList = React.useMemo(() => {
    if (!level.lightDefinitions) return null;
    const entries = Object.entries(level.lightDefinitions);
    return entries.map(([char, lightDef]: [string, any], idx) => (
      <div
        key={"light_" + char}
        className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${brushConfig.symbol === char && activeTool === "light" ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
        onClick={() => {
          setBrushConfig({ type: 'light', symbol: char, ...lightDef });
          setActiveTool("light");
          setIsMobilePaletteOpen(false);
        }}
      >
        <div className="w-8 h-8 shrink-0 bg-gray-900 border border-gray-700 rounded flex items-center justify-center font-bold text-white shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 opacity-50" style={{ backgroundColor: `rgb(${lightDef.r},${lightDef.g},${lightDef.b})` }} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1 font-mono">
            <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] rounded text-white font-black">{char}</span>
            <div className="text-[10px] text-yellow-500 truncate">{lightDef.mode || 'STATIC'}</div>
          </div>
          <div className="text-[10px] text-gray-400 font-mono">R:{lightDef.range} I:{lightDef.intensity}</div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            disabled={idx === 0}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'lights', 'up');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_up || "Move Up"}
          >
            <ChevronUp size={14} />
          </button>
          <button
            disabled={idx === entries.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'lights', 'down');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_down || "Move Down"}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyPaletteItem(idx, 'lights');
            }}
            className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
            title={uiStrings.btn_copy || "Copy"}
          >
            <Copy size={14} />
          </button>
          <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setBrushConfig({ type: 'light', symbol: char, ...lightDef });
              setActiveTool("light");
              setShowLightModal(true);
              setIsMobilePaletteOpen(false);
            }}
            className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
            title={uiStrings.settings || "Settings"}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePaletteItem(char, 'lights');
            }}
            className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
            title={uiStrings.btn_delete || "Delete"}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    ));
  }, [level.lightDefinitions, brushConfig.symbol, activeTool]);

  const memoizedPortalsList = React.useMemo(() => {
    if (!level.portals) return null;
    return level.portals.map((portalDef: any, idx) => (
      <div
        key={"portal_" + portalDef.symbol + idx}
        className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${portalBrushConfig.symbol === portalDef.symbol && activeTool === "portal" ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
        onClick={() => {
          setPortalBrushConfig({ ...portalDef });
          setActiveTool("portal");
          setIsMobilePaletteOpen(false);
        }}
      >
        <div className="w-8 h-8 shrink-0 bg-purple-900 rounded flex items-center justify-center relative overflow-hidden">
          {portalDef.assetId && getPreviewSrc(portalDef.assetId) && (
            <img
              draggable={false}
              src={getPreviewSrc(portalDef.assetId)!}
              className={`absolute inset-0 w-full h-full ${isTextureAsset(portalDef.assetId) ? 'object-cover' : 'object-contain'}`}
              style={{ imageRendering: "pixelated" }}
              alt=""
            />
          )}
        </div>
        <div className="flex-1 min-w-0 font-mono">
          <div className="text-xs font-bold text-gray-300 truncate flex items-center gap-1.5 font-mono">
            <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] font-black rounded text-white">{portalDef.symbol}</span>
            ID: {portalDef.portalId || 'none'}
          </div>
          <div className="text-[10px] text-gray-500 truncate">
            {portalDef.destination || "none"}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            disabled={idx === 0}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'portals', 'up');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_up || "Move Up"}
          >
            <ChevronUp size={14} />
          </button>
          <button
            disabled={idx === level.portals.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'portals', 'down');
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_down || "Move Down"}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyPaletteItem(idx, 'portals');
            }}
            className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
            title={uiStrings.btn_copy || "Copy"}
          >
            <Copy size={14} />
          </button>
          <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPortalBrushConfig({ ...portalDef });
              setActiveTool("portal");
              setShowPortalModal(true);
              setIsMobilePaletteOpen(false);
            }}
            className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
            title={uiStrings.settings || "Settings"}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePaletteItem(portalDef.symbol, 'portals');
            }}
            className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
            title={uiStrings.btn_delete || "Delete"}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    ));
  }, [level.portals, portalBrushConfig.symbol, activeTool]);

  const memoizedEntitiesList = React.useMemo(() => {
    return ['enemies', 'NPCs', 'items', 'decorations'].map((listName) => {
        const list = (level as any)[listName] || [];
        return list.map((entityDef: any, idx: number) => (
          <div
            key={`entity_${listName}_${entityDef.symbol}_${idx}`}
            className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${entityBrushConfig.symbol === entityDef.symbol && activeTool === "entity" ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
            onClick={() => {
              setEntityBrushConfig({
                ...entityDef,
                entityType: entityDef.entityType || (
                  listName === 'enemies' ? 'enemy' :
                  listName === 'NPCs' ? 'npc' :
                  listName === 'items' ? 'item' : 'decoration'
                )
              });
              setActiveTool("entity");
              setIsMobilePaletteOpen(false);
            }}
          >
            <div className="w-8 h-8 rounded bg-gray-800 border border-gray-600 flex flex-col items-center justify-center text-sm font-black overflow-hidden relative shrink-0">
              {entityAssetCache[entityDef.symbol] && getPreviewSrc(entityAssetCache[entityDef.symbol]!) && (
                entityIsBoxCache[entityDef.symbol] ? (
                  <CubeIcon src={getPreviewSrc(entityAssetCache[entityDef.symbol]!)!} className="absolute z-20 w-[85%] h-[85%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                ) : (
                  <img
                    draggable={false}
                    src={getPreviewSrc(entityAssetCache[entityDef.symbol]!)!}
                    className="absolute z-20 w-[90%] h-[90%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                    style={{ imageRendering: "pixelated" }}
                    alt=""
                  />
                )
              )}
            </div>
            <div className="flex-1 min-w-0 font-mono">
              <div className="text-xs font-bold text-gray-300 truncate flex items-center gap-1.5 font-mono">
                <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] font-black rounded text-white">{entityDef.symbol}</span>
                {entityDef.id}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest truncate font-mono">
                {entityDef.entityType}
              </div>
            </div>
        <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            disabled={idx === 0}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'entities', 'up', listName);
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_up || "Move Up"}
          >
            <ChevronUp size={14} />
          </button>
          <button
            disabled={idx === list.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              movePaletteItem(idx, 'entities', 'down', listName);
            }}
            className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
            title={uiStrings.btn_move_down || "Move Down"}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyPaletteItem(idx, 'entities', listName);
            }}
            className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
            title={uiStrings.btn_copy || "Copy"}
          >
            <Copy size={14} />
          </button>
          <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEntityBrushConfig({
                ...entityDef,
                entityType: entityDef.entityType || (
                  listName === 'enemies' ? 'enemy' :
                  listName === 'NPCs' ? 'npc' :
                  listName === 'items' ? 'item' : 'decoration'
                )
              });
              setActiveTool("entity");
              setShowEntityModal(true);
              setIsMobilePaletteOpen(false);
            }}
            className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
            title={uiStrings.settings || "Settings"}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePaletteItem(entityDef.symbol, 'entities');
            }}
            className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
            title={uiStrings.btn_delete || "Delete"}
          >
            <X size={14} />
          </button>
        </div>
          </div>
        ));
    });
  }, [level.enemies, level.NPCs, level.items, level.decorations, entityBrushConfig.symbol, activeTool, entityAssetCache, entityIsBoxCache]);

  return (
    <div 
      className="absolute inset-0 bg-gray-900 text-gray-200 flex flex-col z-[200] font-['Jura'] w-full h-full max-h-[100dvh] max-w-[100dvw] overflow-hidden"
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
      }}
    >
      <VirtualKeyboard activeInput={activeInput} onClose={() => {
        setActiveInput(null);
      }} uiStrings={uiStrings} />
      {eraseModalData && (
        <div className="absolute inset-0 z-[600]" onPointerDown={() => setEraseModalData(null)}>
          <div 
            className="absolute bg-gray-900 border border-indigo-500/50 p-2 rounded-md shadow-2xl shadow-black/80 text-gray-200 flex flex-col gap-1 pointer-events-auto min-w-[140px]"
            style={{
              top: Math.min(eraseModalData.clientY + 10, typeof window !== 'undefined' ? window.innerHeight - (eraseModalData.items.length * 36 + 60) : 0),
              left: Math.min(Math.max(10, eraseModalData.clientX - 140), typeof window !== 'undefined' ? window.innerWidth - 150 : 0)
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-1 px-1 opacity-80">
              {uiStrings.action_erase || "Erase Object"}
            </div>
            {eraseModalData.items.map((item, idx) => (
              <button
                key={idx}
                className="px-3 py-1.5 min-h-[28px] bg-gray-800/80 hover:bg-gray-700 hover:text-white text-gray-300 rounded text-xs transition-colors text-left font-medium active:scale-95 whitespace-nowrap"
                onClick={() => {
                  recordHistory();
                  lastDrawTimeRef.current = { time: Date.now() };
                  handleCellDraw(eraseModalData.x, eraseModalData.y, false, true, item.type);
                  setEraseModalData(null);
                }}
              >
                {item.desc}
              </button>
            ))}
            <div className="h-px bg-gray-800 my-0.5" />
            <button
              className="px-3 py-1.5 min-h-[28px] bg-red-900/30 hover:bg-red-800/60 text-red-300 hover:text-red-100 rounded text-xs uppercase tracking-wider transition-colors active:scale-95 whitespace-nowrap"
              onClick={() => {
                recordHistory();
                lastDrawTimeRef.current = { time: Date.now() };
                handleCellDraw(eraseModalData.x, eraseModalData.y, false, true, 'all');
                setEraseModalData(null);
              }}
            >
              {uiStrings.btn_erase_all || "Erase All"}
            </button>
          </div>
        </div>
      )}

      {eyedropperModalData && (
        <div className="absolute inset-0 z-[600]" onPointerDown={() => setEyedropperModalData(null)}>
          <div 
            className="absolute bg-gray-900 border border-indigo-500/50 p-2 rounded-md shadow-2xl shadow-black/80 text-gray-200 flex flex-col gap-1 pointer-events-auto min-w-[140px]"
            style={{
              top: Math.min(eyedropperModalData.clientY + 10, typeof window !== 'undefined' ? window.innerHeight - (eyedropperModalData.items.length * 36 + 60) : 0),
              left: Math.min(Math.max(10, eyedropperModalData.clientX - 140), typeof window !== 'undefined' ? window.innerWidth - 150 : 0)
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-1 px-1 opacity-80">
              {uiStrings.action_eyedropper || "Select Object to Copy"}
            </div>
            {eyedropperModalData.items.map((item, idx) => (
              <button
                key={idx}
                className="px-3 py-1.5 min-h-[28px] bg-gray-800/80 hover:bg-gray-700 hover:text-white text-gray-300 rounded text-xs transition-colors text-left font-medium active:scale-95 whitespace-nowrap"
                onClick={() => {
                  selectEyedropperObject(item);
                  setEyedropperModalData(null);
                }}
              >
                {item.desc}
              </button>
            ))}
          </div>
        </div>
      )}

      {tweakPickData && (
        <div className="absolute inset-0 z-[600]" onPointerDown={() => setTweakPickData(null)}>
          <div 
            className="absolute bg-gray-900 border border-indigo-500/50 p-2 rounded-md shadow-2xl shadow-black/80 text-gray-200 flex flex-col gap-1 pointer-events-auto min-w-[140px]"
            style={{
              top: Math.min(tweakPickData.clientY + 10, typeof window !== 'undefined' ? window.innerHeight - (tweakPickData.items.length * 36 + 60) : 0),
              left: Math.min(Math.max(10, tweakPickData.clientX - 140), typeof window !== 'undefined' ? window.innerWidth - 150 : 0)
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-1 px-1 opacity-80">
              Выберите объект / Choose Object
            </div>
            {tweakPickData.items.map((item, idx) => {
              const typeLabel = item.config?.type === 'COMBO' || item.config?.combo
                ? 'Комбо-объект'
                : item.listName === 'decorations'
                ? 'Декорация'
                : item.listName === 'items'
                ? 'Предмет'
                : item.listName === 'enemies'
                ? 'Враг'
                : 'NPC';
              const nameLabel = item.config?.id || item.config?.name || item.char;
              return (
                <button
                  key={idx}
                  className="px-3 py-1.5 min-h-[28px] bg-gray-800/80 hover:bg-gray-700 hover:text-white text-gray-300 rounded text-xs transition-colors text-left font-medium active:scale-95 whitespace-nowrap"
                  onClick={() => {
                    openTweakModalFromData(tweakPickData.x, tweakPickData.y, item.listName, item.config);
                    setTweakPickData(null);
                  }}
                >
                  {typeLabel}: {nameLabel} ({item.char})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showSaveModal && (
        <SaveLevelModal
          onClose={() => setShowSaveModal(false)}
          initialFileName={saveFileName}
          uiStrings={uiStrings}
          onSaveJson={(fileName) => {
            setSaveFileName(fileName);
            commitSaveLevelJson(fileName);
          }}
          onSaveZip={(fileName) => {
            setSaveFileName(fileName);
            commitSaveAssetsZip(fileName);
          }}
        />
      )}

      {showLoadModal && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[500] backdrop-blur-sm pointer-events-auto p-4 sm:p-0">
          <div className="bg-gray-900 border border-indigo-500/50 p-4 sm:p-6 rounded-sm w-full max-w-[600px] sm:w-[600px] max-h-[85dvh] flex flex-col shadow-2xl shadow-indigo-900/20 text-gray-200">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="font-bold text-lg sm:text-xl text-white uppercase tracking-widest truncate max-w-[80%]">
                {uiStrings.load_level || "Load Level"}
              </h3>
              <button 
                onClick={() => setShowLoadModal(false)} 
                className="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded-full transition-colors flex-shrink-0"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-none mb-4 sm:mb-6">
              <button
                className="w-full px-4 py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/50"
                onClick={() => {
                  handleLoad();
                  setShowLoadModal(false);
                }}
              >
                <FolderOpen size={18} /> <span className="truncate">{uiStrings.load_from_file || "Загрузить из файла..."}</span>
              </button>
            </div>

            <div className="text-xs sm:text-sm text-gray-400 mb-2 uppercase tracking-wider">
              {uiStrings.existing_sectors || "Существующие сектора:"}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-800 rounded bg-gray-950 p-2 sm:p-3">
              {getGroupedSectorsFromGlob(allSectors).map((group, groupIdx) => (
                <div key={groupIdx} className="mb-4 last:mb-0">
                  <h4 className="text-white font-bold mb-2 border-b border-gray-800 pb-1 px-2 sticky top-0 bg-gray-950 z-10 text-sm sm:text-base">
                    {group.name}
                  </h4>
                  <div className="flex flex-col gap-1 sm:gap-2 px-1 sm:px-2">
                    {group.paths.map((path, sectorIdx) => (
                      <button
                        key={sectorIdx}
                        className="text-left px-2 sm:px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded text-xs sm:text-sm text-indigo-300 transition-colors flex items-center justify-between group"
                        onClick={() => {
                          handleLoadSectorFromPaths(path);
                          setShowLoadModal(false);
                        }}
                      >
                        <span className="truncate mr-2 flex-1">{path}</span>
                        <span className="opacity-100 sm:opacity-0 group-hover:opacity-100 text-[10px] sm:text-xs bg-indigo-900 text-indigo-200 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                          {uiStrings.load || "Загрузить"}
                        </span>
                      </button>
                    ))}
                    {group.paths.length === 0 && (
                      <div className="px-3 py-2 text-gray-600 text-xs sm:text-sm italic">
                        {uiStrings.no_sectors || "Нет секторов"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
          <div className="bg-gray-900 border border-red-500/50 p-6 rounded-sm min-w-80 text-center shadow-2xl pointer-events-auto shadow-red-900/20">
            <h3 className="text-red-500 font-bold text-xl mb-3 tracking-widest uppercase">
              ERROR
            </h3>
            <p className="text-gray-300 mb-6 font-medium">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="px-8 py-2 bg-red-900/50 hover:bg-red-800/80 border border-red-700 text-red-100 font-bold rounded-sm uppercase tracking-wider transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showPlayerSettings && (
        <PlayerSettingsModal
          onClose={() => setShowPlayerSettings(false)}
          uiStrings={uiStrings}
          level={level}
        />
      )}

      {/* Top Menu Bar */}
      <div className="flex flex-col w-full z-50">
        <div className="min-h-[40px] bg-gray-800 border-b border-gray-700 flex flex-wrap items-center px-2 py-1 justify-between shrink-0 gap-2 relative">
        <div className="flex flex-wrap gap-1 sm:gap-4 items-center" onMouseLeave={() => setActiveMenu(null)}>
          <div className="font-bold text-white tracking-widest mr-2 text-sm sm:text-base hidden sm:block">
            {uiStrings.title}
          </div>
          <div className="relative group">
            <button
              className="px-2 sm:px-3 hover:bg-gray-700 h-8 sm:h-10 rounded sm:rounded-none transition-colors flex items-center text-sm"
              onClick={() =>
                setActiveMenu(activeMenu === "file" ? null : "file")
              }
              onMouseEnter={() => activeMenu && activeMenu !== "file" && setActiveMenu("file")}
            >
              {uiStrings.file}
            </button>
            {activeMenu === "file" && (
              <div className="absolute top-full left-0 w-48 bg-gray-800 border border-gray-700 shadow-xl py-1 z-50 mt-1 sm:mt-0">
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    recordHistory();
                    createTab(emptyLevel(0, 0));
                    setActiveMenu(null);
                    setShowSectorSettings(true);
                  }}
                >
                  <FilePlus size={16} /> {uiStrings.new_level}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowLoadModal(true);
                    setActiveMenu(null);
                  }}
                >
                  <FolderOpen size={16} /> {uiStrings.load_level}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    handleLoadCustomAssetsZip();
                    setActiveMenu(null);
                  }}
                >
                  <FolderOpen size={16} /> {uiStrings.load_custom_zip || "Загрузить ассеты"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    handleSaveClick();
                    setActiveMenu(null);
                  }}
                >
                  <Save size={16} /> {uiStrings.save_level}
                </button>
                <div className="h-px bg-gray-700 my-1 sm:hidden" />
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-green-400 flex items-center gap-2 sm:hidden relative"
                  onClick={() => {
                    setActiveMenu(null);
                    handleTestLevel(false);
                  }}
                >
                  <Play size={16} /> {uiStrings.btn_test}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-green-400 flex items-center gap-2 sm:hidden relative"
                  onClick={() => {
                    setActiveMenu(null);
                    handleTestLevel(true);
                  }}
                >
                  <div className="relative">
                    <Play size={16} />
                    <Brain size={8} className="text-red-500 absolute top-0 right-0 m-0 p-0" />
                  </div>
                  {uiStrings.btn_test} (No AI)
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-red-400 flex items-center gap-2 sm:hidden"
                  onClick={() => {
                    localStorage.removeItem("editor_test_level");
                    localStorage.removeItem("editor_test_player");
                    sessionStorage.removeItem("editor_test_tabs");
                    sessionStorage.removeItem("editor_active_tab");
                    sessionStorage.removeItem("editor_zoom");
                    sessionStorage.removeItem("editor_test_character");
                    sessionStorage.removeItem("editor_scroll_left");
                    sessionStorage.removeItem("editor_scroll_top");
                    setActiveMenu(null);
                    engine.setGameState(GameState.MENU);
                  }}
                >
                  <X size={16} /> {uiStrings.btn_back}
                </button>
              </div>
            )}
          </div>
          <div className="relative group">
            <button
              className="px-2 sm:px-3 hover:bg-gray-700 h-8 sm:h-10 rounded sm:rounded-none transition-colors flex items-center text-sm gap-2 tracking-wide"
              onClick={() =>
                setActiveMenu(activeMenu === "view" ? null : "view")
              }
              onMouseEnter={() => activeMenu && activeMenu !== "view" && setActiveMenu("view")}
            >
              {uiStrings.view_menu || "Вид"}
            </button>
            {activeMenu === "view" && (
              <div className="absolute top-full left-0 w-56 bg-gray-800 border border-gray-700 shadow-xl py-1 z-50 mt-1 sm:mt-0">
                <label className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={viewLightPreview}
                    onChange={(e) => {
                      setViewLightPreview(e.target.checked);
                      setActiveMenu(null);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-900 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm select-none">{uiStrings.view_light || "Освещение"}</span>
                </label>
                <label className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={viewPortals}
                    onChange={(e) => {
                      setViewPortals(e.target.checked);
                      setActiveMenu(null);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-900 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm select-none">{uiStrings.view_portals || "Порталы"}</span>
                </label>
                <label className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={viewSoundRadius}
                    onChange={(e) => {
                      setViewSoundRadius(e.target.checked);
                      setActiveMenu(null);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-900 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm select-none">{uiStrings.view_sound || "Звук"}</span>
                </label>
                <label className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={viewScripts}
                    onChange={(e) => {
                      setViewScripts(e.target.checked);
                      setActiveMenu(null);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-900 border-gray-600 cursor-pointer"
                  />
                  <span className="text-sm select-none">{uiStrings.view_scripts || "Скрипты"}</span>
                </label>
                <div className="border-t border-gray-700 my-1"></div>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowIsometricView(true);
                    setActiveMenu(null);
                  }}
                >
                  <span className="text-sm select-none truncate max-w-full">{uiStrings.isometric_view || "Isometric View"}</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative group">
            <button
              className="px-2 sm:px-3 hover:bg-gray-700 h-8 sm:h-10 rounded sm:rounded-none transition-colors flex items-center text-sm gap-2 tracking-wide"
              onClick={() =>
                setActiveMenu(activeMenu === "edit" ? null : "edit")
              }
              onMouseEnter={() => activeMenu && activeMenu !== "edit" && setActiveMenu("edit")}
            >
              {uiStrings.edit || "Edit"}
            </button>
            {activeMenu === "edit" && (
              <div className="absolute top-full left-0 w-56 bg-gray-800 border border-gray-700 shadow-xl py-1 z-50 mt-1 sm:mt-0">
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => {
                    handleUndo();
                    setActiveMenu(null);
                  }}
                  disabled={past.length === 0}
                >
                  <Undo size={16} /> {uiStrings.undo || "Undo (Ctrl+Z)"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => {
                    handleRedo();
                    setActiveMenu(null);
                  }}
                  disabled={future.length === 0}
                >
                  <Redo size={16} /> {uiStrings.redo || "Redo (Ctrl+Y)"}
                </button>
                <div className="h-[1px] bg-gray-700 my-1 mx-2"></div>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => {
                    handleCopy();
                    setActiveMenu(null);
                  }}
                  disabled={!selectionStart || !selectionEnd}
                >
                  <Copy size={16} /> {uiStrings.copy || "Copy (Ctrl+C)"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => {
                    handlePaste();
                    setActiveMenu(null);
                  }}
                  disabled={!clipboard}
                >
                  <ClipboardPaste size={16} /> {uiStrings.paste || "Paste (Ctrl+V)"}
                </button>
                <div className="h-[1px] bg-gray-700 my-1 mx-2"></div>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    removeUnusedPaletteObjects();
                    setActiveMenu(null);
                  }}
                >
                  <Trash2 size={16} /> {uiStrings.delete_unused || "Удалить неиспользуемое"}
                </button>
              </div>
            )}
          </div>
          <div className="relative group">
            <button
              className="px-2 sm:px-3 hover:bg-gray-700 h-8 sm:h-10 rounded sm:rounded-none transition-colors flex items-center text-sm gap-2 tracking-wide"
              onClick={() =>
                setActiveMenu(activeMenu === "settings" ? null : "settings")
              }
              onMouseEnter={() => activeMenu && activeMenu !== "settings" && setActiveMenu("settings")}
            >
              {uiStrings.settings_menu || "Настройки"}
            </button>
            {activeMenu === "settings" && (
              <div className="absolute top-full left-0 w-56 bg-gray-800 border border-gray-700 shadow-xl py-1 z-50 mt-1 sm:mt-0">
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowSectorSettings(true);
                    setActiveMenu(null);
                  }}
                >
                  {uiStrings.sector_settings || "Настройка сектора"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowTasksSettings(true);
                    setActiveMenu(null);
                  }}
                >
                  {uiStrings.tasks_settings || "Задачи"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowScriptsModal(true);
                    setActiveMenu(null);
                  }}
                >
                  {uiStrings.scripts_settings || "Скрипты"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowPlayerSettings(true);
                    setActiveMenu(null);
                  }}
                >
                  {uiStrings.player_settings || "Игрок"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowDialogueEditor(true);
                    setActiveMenu(null);
                  }}
                >
                  {uiStrings.dialogues_settings || "Диалоги"}
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 border-t border-gray-600 mt-1 pt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTestCharacter(c => c === "male" ? "female" : "male");
                  }}
                >
                  <User size={16} /> 
                  <span>{testCharacter === "male" ? "John" : "Lilith"}</span>
                </button>
                <div className="relative group/submenu">
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-700 flex justify-between items-center">
                    <span>{uiStrings.asset_editor || "Редактор ассетов"}</span>
                    <ChevronRight size={16} className="hidden sm:block" />
                    <ChevronRight size={16} className="sm:hidden transform rotate-90" />
                  </button>
                  <div className="absolute top-full right-0 sm:right-auto sm:left-full sm:top-0 w-48 bg-gray-800 border border-gray-700 shadow-xl py-1 hidden group-hover/submenu:block sm:-mt-1 z-50 max-h-64 sm:max-h-[80dvh] overflow-y-auto">
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('assets'); setActiveMenu(null); }}>{uiStrings.asset_editor_assets || "Ассеты"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('animations'); setActiveMenu(null); }}>{uiStrings.asset_editor_animations || "Анимации"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('credits'); setActiveMenu(null); }}>{uiStrings.asset_editor_credits || "Титры"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('buffs'); setActiveMenu(null); }}>{uiStrings.asset_editor_buffs || "Баффы/Дебаффы"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('decorations'); setActiveMenu(null); }}>{uiStrings.asset_editor_decorations || "Декорации"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('dialogues'); setActiveMenu(null); }}>{uiStrings.asset_editor_dialogues_json || "Диалоги (JSON)"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('enemies'); setActiveMenu(null); }}>{uiStrings.asset_editor_enemies || "Враги"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('items'); setActiveMenu(null); }}>{uiStrings.asset_editor_items || "Предметы"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('sectors'); setActiveMenu(null); }}>{uiStrings.asset_editor_sectors || "Секторы"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('npcs'); setActiveMenu(null); }}>{uiStrings.asset_editor_npcs || "NPC"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('recipes'); setActiveMenu(null); }}>{uiStrings.asset_editor_recipes || "Рецепты"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('sounds'); setActiveMenu(null); }}>{uiStrings.asset_editor_sounds || "Звуки"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('particles'); setActiveMenu(null); }}>{uiStrings.asset_editor_particles || "Частицы"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('localization'); setActiveMenu(null); }}>{uiStrings.asset_editor_localization || "Локализация"}</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => { setAssetEditorMode('achievements'); setActiveMenu(null); }}>{uiStrings.asset_editor_achievements || "Достижения"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center bg-gray-700/50 rounded overflow-hidden h-8 ml-0 sm:ml-2 border border-gray-600">
            <button
              className="w-8 hover:bg-gray-600 transition-colors h-full font-bold disabled:opacity-30 disabled:hover:bg-transparent"
              onClick={handlePrevFloor}
              disabled={currentFloor === 0}
              title="Previous Floor (-)"
            >
              -
            </button>
            <span className="px-3 text-sm whitespace-nowrap text-gray-300">
              {uiStrings.floor || "Floor"} {currentFloor + 1}
            </span>
            <button
              className="w-8 hover:bg-gray-600 transition-colors h-full font-bold border-r border-gray-600"
              onClick={handleNextFloor}
              title="Next Floor (+)"
            >
              +
            </button>
            <button
              className="w-8 hover:bg-gray-600 transition-colors h-full font-bold"
              onClick={() => setZoom(z => Math.max(25, z - 25))}
              title="Zoom Out"
            >
              -
            </button>
            <span 
              className="px-3 text-sm whitespace-nowrap text-gray-300 min-w-[3rem] text-center cursor-pointer hover:text-white transition-colors" 
              onClick={() => setZoom(100)}
              title="Reset Zoom"
            >
              {zoom}%
            </span>
            <button
              className="w-8 hover:bg-gray-600 transition-colors h-full font-bold"
              onClick={() => setZoom(z => Math.min(300, z + 25))}
              title="Zoom In"
            >
              +
            </button>
            {customAssetsLoaded && (
              <div className="sm:hidden px-1 h-full bg-yellow-900/50 border-l border-r border-yellow-500 text-yellow-300 font-bold flex items-center justify-center text-[10px] leading-tight text-center uppercase">
                Assets<br/>override
              </div>
            )}
            <button
              className="w-8 bg-green-700 hover:bg-green-600 transition-colors h-full flex items-center justify-center sm:hidden border-l border-gray-600"
              onClick={() => handleTestLevel(false)}
              title={uiStrings.btn_test}
            >
              <Play size={16} />
            </button>
            <button
              className="w-8 bg-green-700 hover:bg-green-600 transition-colors h-full flex items-center justify-center sm:hidden border-l border-gray-600 relative overflow-hidden"
              onClick={() => handleTestLevel(true)}
              title={uiStrings.btn_test + " (No AI)"}
            >
              <Play size={16} />
              <Brain size={8} className="text-red-500 absolute top-0 right-0 m-0 p-0" />
            </button>
          </div>
        </div>
        <div className="hidden sm:flex gap-2 relative">
          {customAssetsLoaded && (
             <div className="px-3 bg-yellow-900/50 border border-yellow-500 rounded text-yellow-300 font-bold flex items-center shadow shadow-yellow-900/30 text-xs uppercase">
                Assets override
             </div>
          )}
          <button
            onClick={() => handleTestLevel(false)}
            className="bg-green-700 hover:bg-green-600 px-2 sm:px-4 py-1 text-sm font-bold rounded flex items-center gap-2 transition-colors"
          >
            <Play size={16} /> <span className="hidden sm:inline">{uiStrings.btn_test}</span>
          </button>
          <button
            onClick={() => handleTestLevel(true)}
            title={uiStrings.btn_test + " (No AI)"}
            className="bg-green-700 hover:bg-green-600 px-2 sm:px-3 py-1 text-sm font-bold rounded flex items-center justify-center gap-2 transition-colors relative h-full"
          >
            <Play size={16} />
            <Brain size={8} className="text-red-500 absolute top-0 right-0 m-0 p-0 drop-shadow-md" />
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("editor_test_level");
              localStorage.removeItem("editor_test_player");
              sessionStorage.removeItem("editor_test_tabs");
              sessionStorage.removeItem("editor_active_tab");
              sessionStorage.removeItem("editor_zoom");
              sessionStorage.removeItem("editor_test_character");
              sessionStorage.removeItem("editor_scroll_left");
              sessionStorage.removeItem("editor_scroll_top");
              engine.setGameState(GameState.MENU);
            }}
            className="bg-gray-700 hover:bg-gray-600 px-2 sm:px-4 py-1 text-sm rounded flex items-center gap-2 transition-colors"
          >
            <X size={16} /> <span className="hidden sm:inline">{uiStrings.btn_back}</span>
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      {tabs.length > 0 && (
      <div className="flex items-center w-full bg-gray-900 border-b border-gray-700 overflow-x-auto hide-scrollbar shrink-0 px-2 pt-2 gap-1 h-10 shadow-sm shadow-black/20" onMouseLeave={() => setActiveMenu(null)}>
        {tabs.map(tab => (
           <div 
             key={tab.id}
             onClick={() => switchTab(tab.id)}
             className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-t border-t border-x cursor-pointer transition-colors whitespace-nowrap shrink-0 max-w-[200px] select-none ${
               activeTabId === tab.id 
                 ? 'bg-gray-800 border-gray-600 text-indigo-300 relative' 
                 : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
             }`}
           >
             {activeTabId === tab.id && <div className="absolute -bottom-[1px] left-0 w-full h-[1px] bg-gray-800 z-10" />}
             <span className="truncate">{tab.label.length > 12 ? tab.label.slice(0, 12) + '...' : tab.label}</span>
             <button 
               onClick={(e) => closeTab(tab.id, e)} 
               className={`ml-1 rounded-sm p-0.5 opacity-60 hover:opacity-100 transition-colors ${activeTabId === tab.id ? 'hover:bg-gray-700 hover:text-red-400' : 'hover:bg-gray-700'}`}
             >
               <X size={12} />
             </button>
           </div>
        ))}
        <button 
          className="flex items-center justify-center w-6 h-6 ml-1 flex-shrink-0 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
          onClick={() => createTab()}
        >
          <Plus size={14} />
        </button>
      </div>
      )}
    </div>

    {/* Main Workspace */}
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left Toolbar */}
        <div className="w-full md:w-16 bg-gray-800 border-r border-gray-700 flex md:flex-col items-center py-1 gap-1 md:py-2 md:gap-2 shrink-0 md:overflow-y-auto overflow-x-auto">
          <button
            onClick={() => {
              setActiveTool("cursor");
              setIsFillMode(false);
              setSelectionStart(null);
              setSelectionEnd(null);
              setMoveSource(null);
              setShowSpawnSettings(false);
            }}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "cursor" ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title="Cursor / Select / Pan"
          >
            <MousePointer2 className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={() => setActiveTool("tweak_entity")}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "tweak_entity" ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_tweak || "Tweak Entity (Instance Settings)"}
          >
            <Wrench className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <button
            onClick={() => {
              if (activeTool === "spawn") {
                setActiveTool("construction");
              } else {
                setActiveTool("spawn");
                setShowSpawnSettings(true);
              }
            }}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center font-bold text-xl ${activeTool === "spawn" ? "bg-green-600 text-white" : "hover:bg-gray-700 text-green-400"}`}
            title={uiStrings.spawn_point || "Spawn Point"}
          >
            <img
              src={getPreviewSrc("MALE_PORTRAIT1")!}
              alt="S"
              className="w-6 h-6 md:w-8 md:h-8 object-cover rounded shadow"
              style={{ imageRendering: "pixelated" }}
            />
          </button>

          <button
            onClick={() =>
              setActiveTool(activeTool === "erase" ? "construction" : "erase")
            }
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "erase" ? "bg-red-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_erase || "Erase"}
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <button
            onClick={() => {
              setActiveTool(activeTool === "eyedropper" ? "construction" : "eyedropper");
              setIsFillMode(false);
            }}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "eyedropper" ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_eyedropper || "Eyedropper"}
          >
            <Pipette className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <button
            onClick={() => setIsFillMode(!isFillMode)}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${isFillMode ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_fill || "Fill"}
          >
            <PaintBucket className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <button
            onClick={() => setActiveTool("select")}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "select" ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_select || "Select Area (Copy/Paste)"}
          >
            <BoxSelect className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          
          <button
            onClick={() => setActiveTool("move")}
            className={`w-10 h-10 md:w-12 md:h-12 rounded transition-colors flex items-center justify-center ${activeTool === "move" ? "bg-indigo-600 text-white" : "hover:bg-gray-700 text-gray-400"}`}
            title={uiStrings.tool_move || "Move"}
          >
            <Move className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {/* Center Grid Area */}
        <div
          ref={gridScrollRef}
          onPointerDownCapture={handlePointerDownCapture}
          onPointerMove={handlePointerMove}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 bg-gray-950 overflow-auto relative touch-none shadow-inner editor-scroll"
          style={{ cursor: "crosshair", willChange: "scroll-position" }}
        >
          {tabs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4 p-8 text-center max-w-sm mx-auto pointer-events-auto select-none">
              <FolderOpen size={48} className="text-gray-600 mb-2 animate-pulse" />
              <div className="space-y-2">
                <h3 className="text-white font-semibold text-lg tracking-tight">
                  {uiStrings.empty_state_title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {uiStrings.empty_state_subtitle}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-w-full min-h-full w-max h-max flex items-center justify-center p-[3px] mx-auto">
            <div
              className="bg-gray-900 border border-gray-800 shrink-0 origin-center relative"
              style={{ padding: "1px", zoom: `${zoom}%` }}
            >
              {viewPortals && portalLinesData.lines.length > 0 && (
                <svg
                  className="absolute top-0 left-0 z-[150] pointer-events-none"
                  width={portalLinesData.gridW}
                  height={portalLinesData.gridH}
                  style={{ overflow: 'visible' }}
                >
                  {portalLinesData.lines.map(line => (
                     <line 
                       key={line.id} 
                       x1={line.startX} 
                       y1={line.startY} 
                       x2={line.endX} 
                       y2={line.endY} 
                       stroke="rgba(239, 68, 68, 0.9)" 
                       strokeWidth="1.5" 
                     />
                  ))}
                </svg>
              )}
              {level.particles && level.particles.length > 0 && (
                <div className="absolute top-0 left-0 z-[140] pointer-events-none" style={{ width: 0, height: 0 }}>
                   {level.particles.map(p => {
                      let px = Math.floor(p.x);
                      let py = Math.floor(p.y);
                      const z = p.z || 0;
                      let opacity = 1;
                      if (activeTool === 'move' && moveSource && moveHoveredCell && (moveSource.x !== moveHoveredCell.x || moveSource.y !== moveHoveredCell.y)) {
                          const dx = moveHoveredCell.x - moveSource.x;
                          const dy = moveHoveredCell.y - moveSource.y;
                          let isSourceIncluded = false;
                          const selStart = selectionStart;
                          const selEnd = selectionEnd;
                          if (selStart && selEnd) {
                              const minX = Math.min(selStart.x, selEnd.x);
                              const maxX = Math.max(selStart.x, selEnd.x);
                              const minY = Math.min(selStart.y, selEnd.y);
                              const maxY = Math.max(selStart.y, selEnd.y);
                              if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                                  if (moveSource.x >= minX && moveSource.x <= maxX && moveSource.y >= minY && moveSource.y <= maxY) {
                                      isSourceIncluded = true;
                                  }
                              }
                          } else {
                              if (px === moveSource.x && py === moveSource.y) {
                                  isSourceIncluded = true;
                              }
                          }
                          if (isSourceIncluded) {
                              px += dx;
                              py += dy;
                              opacity = 0.5;
                          }
                      }
                      return (
                         <div key={p.id} className="absolute flex items-center justify-center z-[22] pointer-events-none overflow-visible" style={{
                            left: px * 32,
                            top: py * 32,
                            width: 32,
                            height: 32,
                            opacity: opacity
                         }}>
                            <div className="absolute rounded bg-gray-900/80 p-0.5 shadow-sm border border-fuchsia-600 z-[25] text-fuchsia-400 mix-blend-screen h-5 w-5 flex items-center justify-center pb-1" style={{opacity: opacity === 1 ? 0.8 : opacity}}>
                                <Sparkles size={12} />
                            </div>
                            <span className="absolute bottom-0 right-0 text-[8px] leading-none bg-black text-fuchsia-400 px-[2px] py-[1px] rounded drop-shadow-md z-[30] max-w-[32px] overflow-hidden text-ellipsis whitespace-nowrap">
                                 {p.definitionId}{z !== 0 ? `(z:${z})` : ''}
                            </span>
                         </div>
                      )
                    })}
                 </div>
              )}
              {level.grids &&
                level.grids[currentFloor] &&
                level.grids[currentFloor].map((row, y) => {
                  const entityRowString = level.entities?.[currentFloor]?.[y] || "";
                  const itemRowString = level.itemsGrid?.[currentFloor]?.[y] || "";
                  const lightRowString = level.gridLight?.[y] || "";
                  const soundRowString = level.gridSounds?.[currentFloor]?.[y] || "";
                  
                  const prevLayerCellRowString = currentFloor > 0 ? level.grids[currentFloor - 1]?.[y] : undefined;
                  const prevLayerEntRowString = currentFloor > 0 && level.entities ? level.entities[currentFloor - 1]?.[y] : undefined;
                  const prevLayerItemRowString = currentFloor > 0 && level.itemsGrid ? level.itemsGrid[currentFloor - 1]?.[y] : undefined;

                  const editorLightMapRow = editorLightMap?.[y] || null;

                  return (
                    <GridRow
                      key={y}
                      y={y}
                      rowString={row}
                      entityRowString={entityRowString}
                      itemRowString={itemRowString}
                      lightRowString={lightRowString}
                      soundRowString={soundRowString}
                      overriddenCellsSet={overriddenCellsSet}
                      prevLayerCellRowString={prevLayerCellRowString}
                      prevLayerEntRowString={prevLayerEntRowString}
                      prevLayerItemRowString={prevLayerItemRowString}
                      currentFloor={currentFloor}
                      activeTool={activeTool}
                      viewSoundRadius={viewSoundRadius}
                      viewLightPreview={viewLightPreview}
                      pickingCoordinateSelected={pickingCoordinateSelected}
                      selectionStart={selectionStart}
                      selectionEnd={selectionEnd}
                      moveSource={moveSource}
                      moveHoveredCell={moveHoveredCell}
                      level={level}
                      editorLightMapRow={editorLightMapRow}
                      constructionMap={constructionMap}
                      portalMap={portalMap}
                      soundMap={soundMap}
                      entityAssetCache={entityAssetCache}
                      entityEmptynessCache={entityEmptynessCache}
                      entityIsBoxCache={entityIsBoxCache}
                      scriptTriggersOnEnterSet={scriptTriggersOnEnterSet}
                      scriptTriggersRadiusList={scriptTriggersRadiusList}
                      resolveCombo={resolveCombo}
                      uiStrings={uiStrings}
                      onPointerDown={handleCellDownWrapper}
                      onPointerEnter={handleCellEnterWrapper}
                      tempDrawOverlayRow={tempDrawOverlay?.[y]}
                    />
                  );
                })}
            </div>
          </div>
          )}
        </div>

        {/* Right Palette Area */}
        <div className="w-full md:w-auto md:min-w-64 bg-gray-800 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col shrink-0">
          <div className="flex bg-gray-900 border-b border-gray-700 font-bold text-[10px] tracking-wider text-gray-300 relative z-[410] md:z-auto">
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'construction' ? !isMobilePaletteOpen : true); setActivePalette('construction'); }}
                className={`flex-1 py-1.5 transition-colors flex flex-col items-center gap-0.5 ${activePalette === 'construction' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <CustomIcon id="construction" size={14} />
                {strings.ui.level_editor?.palette_blocks || "БЛОКИ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'doors' ? !isMobilePaletteOpen : true); setActivePalette('doors'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'doors' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <DoorClosed size={14} />
                {strings.ui.level_editor?.palette_doors || "ДВЕРИ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'lights' ? !isMobilePaletteOpen : true); setActivePalette('lights'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'lights' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80 text-yellow-400' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <Lightbulb size={14} />
                {strings.ui.level_editor?.palette_light || "СВЕТ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'portals' ? !isMobilePaletteOpen : true); setActivePalette('portals'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'portals' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80 text-purple-400' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <LogOut size={14} />
                {strings.ui.level_editor?.palette_portals || "ПОРТАЛЫ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'entities' ? !isMobilePaletteOpen : true); setActivePalette('entities'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'entities' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80 text-emerald-400' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <User size={14} />
                {strings.ui.level_editor?.palette_entities || "СУЩНОСТИ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'sounds' ? !isMobilePaletteOpen : true); setActivePalette('sounds'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'sounds' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80 text-cyan-400' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <Volume2 size={14} />
                {strings.ui.level_editor?.palette_sounds || "ЗВУКИ"}
            </button>
            <button 
                onClick={() => { if (window.innerWidth < 768) setIsMobilePaletteOpen(activePalette === 'particles' ? !isMobilePaletteOpen : true); setActivePalette('particles'); }}
                className={`flex-1 py-1.5 transition-colors border-l border-gray-700 flex flex-col items-center gap-0.5 ${activePalette === 'particles' ? 'bg-gray-800 text-white shadow-inner bg-opacity-80 text-fuchsia-400' : 'hover:bg-gray-800/50'} md:whitespace-nowrap md:px-1 md:shrink-0`}
            >
                <Sparkles size={14} />
                {strings.ui.level_editor?.palette_particles || "ЧАСТИЦЫ"}
            </button>
          </div>

          {/* Mobile Overlay Background (optional) */}
          {isMobilePaletteOpen && (
             <div className="md:hidden absolute inset-0 bg-black/60 z-[350]" onClick={() => setIsMobilePaletteOpen(false)} />
          )}

          <div className={`flex flex-col md:flex-grow md:h-full md:min-h-0 ${isMobilePaletteOpen ? 'absolute bottom-12 left-0 right-0 top-16 bg-gray-800 z-[400] p-4 rounded-t-xl shadow-2xl flex border-t border-gray-600 md:static md:bottom-auto md:left-auto md:right-auto md:top-auto md:bg-transparent md:z-auto md:p-2 md:shadow-none md:border-none md:rounded-none' : 'hidden md:flex'}`}>
            <div className="md:hidden flex justify-between items-center mb-2 pb-2 border-b border-gray-700 shrink-0">
               <h3 className="font-bold text-white tracking-widest uppercase">
                 {activePalette === 'construction' ? (strings.ui.level_editor?.palette_blocks || 'БЛОКИ') : activePalette === 'doors' ? (strings.ui.level_editor?.palette_doors || 'ДВЕРИ') : activePalette === 'lights' ? (strings.ui.level_editor?.palette_light || 'СВЕТ') : activePalette === 'entities' ? (strings.ui.level_editor?.palette_entities || 'СУЩНОСТИ') : activePalette === 'sounds' ? (strings.ui.level_editor?.palette_sounds || 'ЗВУКИ') : activePalette === 'particles' ? (strings.ui.level_editor?.palette_particles || 'ЧАСТИЦЫ') : (strings.ui.level_editor?.palette_portals || 'ПОРТАЛЫ')}
               </h3>
               <button onClick={() => setIsMobilePaletteOpen(false)} className="text-gray-400 hover:text-white p-1">
                 <X size={20} />
               </button>
            </div>
            {activePalette === 'construction' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                {/* Filter Tabs */}
                <div className="grid grid-cols-4 gap-1 mb-2 bg-gray-950/40 p-1 rounded border border-gray-800/80 shrink-0">
                  <button
                    onClick={() => setConstructionTypeFilter('all')}
                    className={`text-[10px] font-bold py-1.5 px-1 rounded transition-colors text-center ${constructionTypeFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                  >
                    {strings.ui.level_editor?.filter_all || "Все"}
                  </button>
                  <button
                    onClick={() => setConstructionTypeFilter('wall')}
                    className={`text-[10px] font-bold py-1.5 px-1 rounded transition-colors text-center ${constructionTypeFilter === 'wall' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                  >
                    {strings.ui.level_editor?.filter_walls || "Стены"}
                  </button>
                  <button
                    onClick={() => setConstructionTypeFilter('floor')}
                    className={`text-[10px] font-bold py-1.5 px-1 rounded transition-colors text-center ${constructionTypeFilter === 'floor' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                  >
                    {strings.ui.level_editor?.filter_floors || "Полы"}
                  </button>
                  <button
                    onClick={() => setConstructionTypeFilter('window')}
                    className={`text-[10px] font-bold py-1.5 px-1 rounded transition-colors text-center ${constructionTypeFilter === 'window' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                  >
                    {strings.ui.level_editor?.filter_windows || "Окна"}
                  </button>
                </div>

                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {memoizedConstructionList}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                      setActiveTool("construction");
                      setBrushConfig({
                        type: "wall",
                        assetId: "",
                        canBeDestroyed: true,
                      });
                      setShowBrushModal(true);
                      setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_block || "Новый блок"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'doors' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {memoizedDoorsList}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                      setDoorBrushConfig({ type: "HINGE" });
                      setActiveTool("door");
                      setShowDoorModal(true);
                      setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_door || "Новая дверь"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'lights' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {memoizedLightsList}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                       setBrushConfig({ type: 'light', r: 255, g: 255, b: 255, range: 5, intensity: 1.0, mode: 'STATIC' });
                       setActiveTool("light");
                       setShowLightModal(true);
                       setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_light || "Новый свет"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'portals' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {memoizedPortalsList}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                       setPortalBrushConfig({ targetDirection: 'N' });
                       setActiveTool("portal");
                       setShowPortalModal(true);
                       setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_portal || "Новый портал"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'entities' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {memoizedEntitiesList}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                       setEntityBrushConfig({ entityType: 'enemy', id: '' });
                       setActiveTool("entity");
                       setShowEntityModal(true);
                       setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_entity || "Новая сущность"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'sounds' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {level.ambientSounds && level.ambientSounds.map((sndDef: any, idx) => (
                    <div
                      key={"sound_" + sndDef.symbol + idx}
                      className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${activeTool === "sound" && soundBrushConfig.symbol === sndDef.symbol ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
                      onClick={() => {
                        setSoundBrushConfig({ ...sndDef });
                        setActiveTool("sound");
                        setIsMobilePaletteOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 shrink-0 bg-cyan-900 rounded flex items-center justify-center font-bold text-white shadow-inner relative overflow-hidden">
                         <Volume2 size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-300 truncate flex items-center gap-1.5">
                          <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center bg-gray-700 text-[10px] font-black rounded text-white">{sndDef.symbol}</span>
                          ID: {sndDef.id || 'none'}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          Rad: {sndDef.radius} | Min: {sndDef.minInterval}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 bg-gray-950/25 p-0.5 rounded border border-gray-800/40 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            movePaletteItem(idx, 'sounds', 'up');
                          }}
                          className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                          title={uiStrings.btn_move_up || "Move Up"}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          disabled={idx === (level.ambientSounds?.length || 1) - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            movePaletteItem(idx, 'sounds', 'down');
                          }}
                          className="text-gray-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors p-1"
                          title={uiStrings.btn_move_down || "Move Down"}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPaletteItem(idx, 'sounds');
                          }}
                          className="text-gray-400 hover:text-indigo-400 transition-colors p-1"
                          title={uiStrings.btn_copy || "Copy"}
                        >
                          <Copy size={14} />
                        </button>
                        <div className="w-px h-3 bg-gray-800 self-center mx-0.5" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSoundBrushConfig({ ...sndDef });
                            setActiveTool("sound");
                            setShowSoundModal(true);
                            setIsMobilePaletteOpen(false);
                          }}
                          className="text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-1 rounded"
                          title={uiStrings.settings || "Settings"}
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePaletteItem(sndDef.symbol, 'sounds');
                          }}
                          className="text-red-400 hover:text-white hover:bg-red-600 transition-colors p-1 rounded"
                          title={uiStrings.btn_delete || "Delete"}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                       setSoundBrushConfig({ id: Object.keys(soundsData)[0] || '', minInterval: 2000, maxInterval: 5000, radius: 10 });
                       setActiveTool("sound");
                       setShowSoundModal(true);
                       setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_sound || "Новый звук"}</span>
                  </button>
                </div>
              </div>
            )}
            {activePalette === 'particles' && (
              <div className="flex-grow flex flex-col min-h-0 text-left">
                <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                  {Object.values(particlesData).map((pDef: any) => (
                    <div
                      key={"particle_" + pDef.id}
                      className={`w-full text-left p-2 rounded flex items-center gap-3 transition-colors ${activeTool === "particle" && particleBrushConfig.definitionId === pDef.id ? "bg-indigo-600/30 border border-indigo-500" : "bg-gray-900/50 hover:bg-gray-700 border border-transparent"} group cursor-pointer`}
                      onClick={() => {
                        setParticleBrushConfig({ definitionId: pDef.id, z: 0 });
                        setActiveTool("particle");
                        setIsMobilePaletteOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 shrink-0 bg-fuchsia-900 rounded flex items-center justify-center font-bold text-white shadow-inner relative overflow-hidden">
                         <Sparkles size={16} />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="text-xs font-bold text-fuchsia-300 truncate">
                          {pDef.id}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">
                          {pDef.name || pDef.title}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(null);
                          setAssetEditorMode('particles');
                          setIsMobilePaletteOpen(false);
                        }}
                        className="w-8 h-8 flex items-center justify-center shrink-0 rounded transition-colors text-gray-500 hover:text-white hover:bg-gray-600 opacity-100 md:opacity-0 group-hover:opacity-100 title='Редактировать'"
                      >
                        <Wrench size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 pt-2 border-t border-gray-700 bg-gray-800 mt-2">
                  <button
                    onClick={() => {
                       setActiveMenu(null);
                       setAssetEditorMode('particles');
                       setIsMobilePaletteOpen(false);
                    }}
                    className="w-full p-2 rounded flex items-center justify-center gap-2 border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-bold">{strings.ui.level_editor?.add_particle || "Новая частица"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SectorSettingsModal
        show={showSectorSettings}
        onClose={() => setShowSectorSettings(false)}
        width={width}
        height={height}
        setWidth={setWidth}
        setHeight={setHeight}
        level={level}
        setLevel={setLevel}
        handleApplySize={handleApplySize}
        uiStrings={uiStrings}
      />

      {showTasksSettings && (
        <SectorTasksModal
          level={level}
          setLevel={setLevel}
          onClose={() => setShowTasksSettings(false)}
          uiStrings={uiStrings}
        />
      )}

      <SectorScriptsModal
        level={level}
        setLevel={setLevel}
        onClose={() => setShowScriptsModal(false)}
        uiStrings={uiStrings}
        isVisible={showScriptsModal}
        onPickCoordinate={(callback, initialCoordinate) => {
          setShowScriptsModal(false);
          setPickingModalSource('scripts');
          setPickingCoordinateCallback(() => callback);
          if (initialCoordinate) {
            setPickingCoordinateSelected(initialCoordinate);
          }
        }}
      />

      {pickingCoordinateCallback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-gray-900 border border-yellow-500/50 text-gray-100 font-medium px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl sm:rounded-full shadow-2xl z-[300] flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 w-[90vw] sm:w-auto sm:min-w-[500px] animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 animate-pulse shrink-0">
              <MapPin size={18} />
            </div>
            <span className="whitespace-nowrap text-sm sm:text-base">
              {pickingCoordinateSelected 
                ? `${uiStrings.selected_coord || 'Выбрана координата'}: X: ${pickingCoordinateSelected.x}, Y: ${pickingCoordinateSelected.y}` 
                : (uiStrings.click_tile || 'Кликните по нужному тайлу на карте')}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              onClick={() => {
                setPickingCoordinateSelected(null);
                setPickingCoordinateCallback(null);
                if (pickingModalSource === 'scripts') setShowScriptsModal(true);
                if (pickingModalSource === 'brush') setShowBrushModal(true);
                setPickingModalSource(null);
              }}
              className="flex-1 sm:flex-none px-4 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-full transition whitespace-nowrap"
            >
              {uiStrings.btn_cancel || 'Отмена'}
            </button>
            <button
              disabled={!pickingCoordinateSelected}
              onClick={() => {
                if (pickingCoordinateSelected) {
                  pickingCoordinateCallback(pickingCoordinateSelected.x, pickingCoordinateSelected.y);
                  setPickingCoordinateSelected(null);
                  setPickingCoordinateCallback(null);
                  if (pickingModalSource === 'scripts') setShowScriptsModal(true);
                  if (pickingModalSource === 'brush') setShowBrushModal(true);
                  setPickingModalSource(null);
                }
              }}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm rounded-full transition whitespace-nowrap ${pickingCoordinateSelected ? 'bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
            >
              {uiStrings.btn_confirm || 'Подтвердить'}
            </button>
          </div>
        </div>
      )}

      {showSpawnSettings && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-black/10 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 relative shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {uiStrings.player_spawn_dir || "Player Direction"}
              </h2>
              <button
                onClick={() => setShowSpawnSettings(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div className="mb-6">
              <CustomSelect
                value={level.playerStart?.dir || "N"}
                onChange={(e) =>
                  setLevel({
                    ...level,
                    playerStart: { dir: e.target.value as any },
                  })
                }
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="N">{uiStrings.dir_n || "North (0°)"}</option>
                <option value="E">{uiStrings.dir_e || "East (90°)"}</option>
                <option value="S">{uiStrings.dir_s || "South (180°)"}</option>
                <option value="W">{uiStrings.dir_w || "West (270°)"}</option>
              </CustomSelect>
            </div>
            <button
              onClick={() => setShowSpawnSettings(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded font-bold text-white transition-colors"
            >
              {uiStrings.done || "DONE"}
            </button>
          </div>
        </div>
      )}

      <ConstructionSettingsModal
        show={showBrushModal}
        onClose={() => setShowBrushModal(false)}
        brushConfig={brushConfig}
        setBrushConfig={setBrushConfig}
        level={level}
        setLevel={setLevel}
        uiStrings={uiStrings}
        onPickCoordinate={(callback) => {
          setShowBrushModal(false);
          setPickingModalSource('brush');
          setPickingCoordinateCallback(() => callback);
        }}
      />

      <DoorSettingsModal
        show={showDoorModal}
        onClose={() => setShowDoorModal(false)}
        brushConfig={doorBrushConfig}
        setBrushConfig={setDoorBrushConfig}
        level={level}
        setLevel={setLevel}
        uiStrings={uiStrings}
      />

      <LightSettingsModal
        show={showLightModal}
        onClose={() => setShowLightModal(false)}
        brushConfig={brushConfig}
        setBrushConfig={setBrushConfig}
        level={level}
        setLevel={setLevel}
        uiStrings={uiStrings}
      />

      <PortalSettingsModal
        show={showPortalModal}
        onClose={() => setShowPortalModal(false)}
        brushConfig={portalBrushConfig}
        setBrushConfig={setPortalBrushConfig}
        level={level}
        setLevel={setLevel}
        uiStrings={uiStrings}
      />

      <EntitySettingsModal
        isOpen={showEntityModal}
        onClose={() => setShowEntityModal(false)}
        onSave={(config) => {
          const { symbol, newEntityConfig } = resolveEntityBrushSymbol(config, level);
          const finalConfig = newEntityConfig || { ...config, symbol };
          
          setEntityBrushConfig(finalConfig);

          const listName = finalConfig.entityType === 'enemy' ? 'enemies' : finalConfig.entityType === 'npc' ? 'NPCs' : finalConfig.entityType === 'item' ? 'items' : 'decorations';
          const newList = [...((level as any)[listName] || [])];
          const existingIdx = newList.findIndex(e => e.symbol === finalConfig.symbol);
          
          // Optionally remove this symbol from other lists if the type changed
          ['enemies', 'NPCs', 'items', 'decorations'].forEach(name => {
              if (name !== listName) {
                  const otherList = (level as any)[name];
                  if (otherList) {
                      const idx = otherList.findIndex((e: any) => e.symbol === finalConfig.symbol);
                      if (idx !== -1) {
                          (level as any)[name] = otherList.filter((e: any) => e.symbol !== finalConfig.symbol);
                      }
                  }
              }
          });

          if (existingIdx !== -1) {
              newList[existingIdx] = finalConfig;
          } else {
              newList.push(finalConfig);
          }
          setLevel({ ...level, [listName]: newList });

          setShowEntityModal(false);
          setActiveTool("entity");
        }}
        initialConfig={entityBrushConfig}
        strings={strings}
      />

      {tweakEntityData && (
        <TweakEntityModal
          isOpen={showTweakModal}
          onClose={() => setShowTweakModal(false)}
          onSave={(config) => {
            recordHistory();
            const oldCoordKey = `${tweakEntityData.floor}_${tweakEntityData.y}_${tweakEntityData.x}`;
            const symbol = tweakEntityData.symbol || tweakEntityData.config?.symbol;
            const coordKey = symbol 
              ? `${oldCoordKey}_${tweakEntityData.listName}_${symbol}` 
              : `${oldCoordKey}_${tweakEntityData.listName}`;
            const newOverrides = { ...(level.entityOverrides || {}) };
            
            const overrideData: any = {};
            // Compute diff!
            for (const key in config) {
              if (key === 'symbol' || key === 'entityType') continue;
              // If the value changed from the base config OR it's deeply different... 
              if (JSON.stringify(config[key]) !== JSON.stringify(tweakEntityData.baseConfigReference[key])) {
                 overrideData[key] = config[key];
              }
            }

            if (Object.keys(overrideData).length > 0) {
               newOverrides[coordKey] = overrideData;
            } else {
               delete newOverrides[coordKey];
               if (symbol) {
                 delete newOverrides[`${oldCoordKey}_${tweakEntityData.listName}_${symbol}`];
                 delete newOverrides[`${oldCoordKey}_${symbol}`];
               }
            }

            const updatedLevel = { ...level, entityOverrides: newOverrides };
            levelRef.current = updatedLevel;
            setLevel(updatedLevel);
            setShowTweakModal(false);
            setActiveTool('cursor');
          }}
          initialConfig={tweakEntityData.config}
          uiStrings={uiStrings}
          coordKey={`${tweakEntityData.floor}_${tweakEntityData.y}_${tweakEntityData.x}`}
          listName={tweakEntityData.listName}
        />
      )}

      <SoundSettingsModal
        show={showSoundModal}
        onClose={() => setShowSoundModal(false)}
        brushConfig={soundBrushConfig}
        setBrushConfig={setSoundBrushConfig}
        level={level}
        setLevel={setLevel}
        uiStrings={uiStrings}
      />

      {assetEditorMode && (
        <AssetEditorModal
          mode={assetEditorMode}
          onClose={() => setAssetEditorMode(null)}
          uiStrings={uiStrings}
          onLoadSector={handleLoadSectorFromPaths}
          onEditSectorJson={(path) => setAssetEditorMode(path)}
          editedSectorsRef={editedSectorsRef}
          getSectorData={(path) => {
              const globPath = path.replace(/^\.?\/?data\/levels/, '../../data/levels');
              let val = editedSectorsRef.current[path];
              if (!val && allSectors[globPath]) {
                  val = JSON.parse(JSON.stringify((allSectors[globPath] as any).default));
              }
              return val || {};
          }}
        />
      )}

      {showDialogueEditor && (
        <DialogueEditorModal
          onClose={() => setShowDialogueEditor(false)}
          uiStrings={uiStrings}
          triggers={level.triggers}
        />
      )}

      {showIsometricView && (
        <IsometricViewModal
          isOpen={showIsometricView}
          onClose={() => setShowIsometricView(false)}
          level={level}
          currentFloor={currentFloor}
          uiStrings={uiStrings}
          engine={engine}
          lightMap={editorLightMap}
        />
      )}
    </div>
  );
};
