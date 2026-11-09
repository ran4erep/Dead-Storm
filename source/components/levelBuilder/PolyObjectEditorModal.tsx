import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Clipboard,
  Check,
  RotateCw,
  RefreshCw,
  Move,
  Maximize2,
  MousePointer2,
  Palette,
  Eye,
  Box,
  Layers,
  Sparkles,
  Undo,
  Redo,
  Save,
  RotateCcw,
  Sliders,
  Magnet,
  Compass,
  ChevronUp,
  Image,
  Target,
  Square,
  Minus,
  CircleDot,
  Split,
  Maximize,
  Grid,
  GitCommit,
  Lock,
  Unlock,
  FileText,
  Upload,
  AlertCircle,
  Code
} from 'lucide-react';
import { PolyObjectModel, PolyObjectCube, PolyCustomFace, FaceTextureTransform, TextureLayer } from '../../types';

export function normalizeCube(cube: any): PolyObjectCube {
  if (!cube || typeof cube !== 'object') {
    return {
      offset: [0, 0, 0],
      size: [0.5, 0.5, 0.5],
      color: '#888888',
    };
  }

  let ox = 0, oy = 0, oz = 0;
  if (Array.isArray(cube.offset)) {
    ox = Number(cube.offset[0]) || 0;
    oy = Number(cube.offset[1]) || 0;
    oz = Number(cube.offset[2]) || 0;
  } else if (cube.offset && typeof cube.offset === 'object') {
    ox = Number(cube.offset.x ?? cube.offset.X) || 0;
    oy = Number(cube.offset.y ?? cube.offset.Y) || 0;
    oz = Number(cube.offset.z ?? cube.offset.Z) || 0;
  }

  let sx = 0.2, sy = 0.2, sz = 0.2;
  if (Array.isArray(cube.size)) {
    sx = Number(cube.size[0]) || 0.2;
    sy = Number(cube.size[1]) || 0.2;
    sz = Number(cube.size[2]) || 0.2;
  } else if (cube.size && typeof cube.size === 'object') {
    sx = Number(cube.size.x ?? cube.size.X) || 0.2;
    sy = Number(cube.size.y ?? cube.size.Y) || 0.2;
    sz = Number(cube.size.z ?? cube.size.Z) || 0.2;
  }

  let rotation: [number, number, number] | undefined = undefined;
  if (Array.isArray(cube.rotation)) {
    rotation = [Number(cube.rotation[0]) || 0, Number(cube.rotation[1]) || 0, Number(cube.rotation[2]) || 0];
  } else if (cube.rotation && typeof cube.rotation === 'object') {
    rotation = [Number(cube.rotation.x) || 0, Number(cube.rotation.y) || 0, Number(cube.rotation.z) || 0];
  } else if (typeof cube.rotation === 'number') {
    rotation = [0, Number(cube.rotation) || 0, 0];
  }

  return {
    ...cube,
    offset: [ox, oy, oz],
    size: [sx, sy, sz],
    ...(rotation ? { rotation } : {}),
  };
}

export const getCubeOffset = (c: any): [number, number, number] => {
  if (!c) return [0, 0, 0];
  if (Array.isArray(c.offset)) return [Number(c.offset[0]) || 0, Number(c.offset[1]) || 0, Number(c.offset[2]) || 0];
  if (c.offset && typeof c.offset === 'object') return [Number(c.offset.x ?? c.offset.X) || 0, Number(c.offset.y ?? c.offset.Y) || 0, Number(c.offset.z ?? c.offset.Z) || 0];
  return [0, 0, 0];
};

export const getCubeSize = (c: any): [number, number, number] => {
  if (!c) return [0.2, 0.2, 0.2];
  if (Array.isArray(c.size)) return [Number(c.size[0]) || 0.2, Number(c.size[1]) || 0.2, Number(c.size[2]) || 0.2];
  if (c.size && typeof c.size === 'object') return [Number(c.size.x ?? c.size.X) || 0.2, Number(c.size.y ?? c.size.Y) || 0.2, Number(c.size.z ?? c.size.Z) || 0.2];
  return [0.2, 0.2, 0.2];
};

export type EditorSelectionMode = 'cube' | 'vertex' | 'edge' | 'face';
import { REGISTERED_POLY_MODELS, registerPolyModel, getPolyModelById } from '../../data/polyModels';
import { adjustColor } from '../../utils/polyObjectIsoRenderer';
import { CustomColorPicker } from './CustomColorPicker';
import { getPolyTextureImage, getPolyTextureUrl, subscribeTextureLoaded, drawTexturedPolygonCanvas, computeFaceUVs, applyTextureTransformToUVs, clearCompositeCanvasCache } from '../../utils/polyTextureUtils';
import { AssetPicker } from './AssetPicker';

export interface PolyObjectEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialModelId?: string;
  onSelectModel?: (modelId: string, model: PolyObjectModel) => void;
  uiStrings?: any;
}

type EditorTool = 'select' | 'rotate' | 'pan' | 'move' | 'resize' | 'rotate_object';
type GizmoTarget = 'center' | 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+' | 'Z-' | 'X' | 'Y' | 'Z' | 'rotX' | 'rotY' | 'rotZ' | null;
export type FaceTarget = 'all' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

const FACE_META: Record<FaceTarget, { label: string; axis: string; dirName: string; factor: number }> = {
  all: { label: 'Все', axis: 'Base', dirName: 'Основной цвет куба', factor: 1.0 },
  top: { label: 'Верх', axis: '+Z', dirName: 'Верхняя грань (+Z)', factor: 1.25 },
  bottom: { label: 'Низ', axis: '-Z', dirName: 'Нижняя грань (-Z)', factor: 0.4 },
  front: { label: 'Спереди', axis: '+Y', dirName: 'Передняя грань (+Y)', factor: 1.0 },
  back: { label: 'Сзади', axis: '-Y', dirName: 'Задняя грань (-Y)', factor: 0.5 },
  left: { label: 'Слева', axis: '-X', dirName: 'Левая грань (-X)', factor: 0.65 },
  right: { label: 'Справа', axis: '+X', dirName: 'Правая грань (+X)', factor: 0.8 },
};

const getFaceMeta = (faceTarget: string): { label: string; axis: string; dirName: string; factor: number } => {
  if (FACE_META[faceTarget as FaceTarget]) {
    return FACE_META[faceTarget as FaceTarget];
  }
  let label = 'Полигон';
  let dirName = 'Выделенный полигон';
  if (faceTarget.startsWith('top_')) {
    label = `Верх ${faceTarget.replace('top_', '')}`;
    dirName = `Грань верха (${faceTarget})`;
  } else if (faceTarget.startsWith('bottom_')) {
    label = `Низ ${faceTarget.replace('bottom_', '')}`;
    dirName = `Грань низа (${faceTarget})`;
  } else if (faceTarget.startsWith('side_')) {
    label = `Сбоку ${faceTarget.replace('side_', '')}`;
    dirName = `Боковая грань (${faceTarget})`;
  } else if (faceTarget.startsWith('sphere_')) {
    label = `Сфера ${faceTarget.replace('sphere_', '')}`;
    dirName = `Грань сферы (${faceTarget})`;
  } else if (faceTarget.startsWith('cylinder_')) {
    label = `Цилиндр ${faceTarget.replace('cylinder_', '')}`;
    dirName = `Грань цилиндра (${faceTarget})`;
  } else if (faceTarget.startsWith('front_')) {
    label = `Перед ${faceTarget.replace('front_', '')}`;
    dirName = `Передняя грань (${faceTarget})`;
  } else if (faceTarget.startsWith('back_')) {
    label = `Зад ${faceTarget.replace('back_', '')}`;
    dirName = `Задняя грань (${faceTarget})`;
  } else if (faceTarget.startsWith('left_')) {
    label = `Лево ${faceTarget.replace('left_', '')}`;
    dirName = `Левая грань (${faceTarget})`;
  } else if (faceTarget.startsWith('right_')) {
    label = `Право ${faceTarget.replace('right_', '')}`;
    dirName = `Правая грань (${faceTarget})`;
  } else {
    label = `Полигон (${faceTarget})`;
    dirName = `Уникальный полигон (${faceTarget})`;
  }
  return {
    label,
    axis: 'Custom',
    dirName,
    factor: 1.0
  };
};

interface CameraState {
  yaw: number;   // rotation around Z axis in radians
  pitch: number; // tilt around screen X axis in radians
  panX: number;  // pixel offset X
  panY: number;  // pixel offset Y
  zoom: number;  // scale factor (pixels per unit)
}

interface ProjectedPolygon {
  cubeIndex: number;
  faceType: string;
  points: { x: number; y: number }[];
  depth: number;
  minDepth: number;
  maxDepth: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  planeA: number;
  planeB: number;
  planeC: number;
  color: string;
  sideFactor: number;
  textureId?: string | null;
  textureLayers?: TextureLayer[] | null;
  uvs?: [number, number][];
  rawUVs?: [number, number][];
  isBackface?: boolean;
}

const DEFAULT_CAMERA: CameraState = {
  yaw: Math.PI / 4, // 45 deg
  pitch: Math.PI / 6, // 30 deg
  panX: 0,
  panY: 20,
  zoom: 240,
};

export type CameraPresetType = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

const CAMERA_PRESETS: Record<CameraPresetType, { label: string; title: string; yaw: number; pitch: number; panX: number; panY: number }> = {
  iso: {
    label: '3D (Изометрия)',
    title: 'Изометрия / 3D свободный вид',
    yaw: Math.PI / 4,
    pitch: Math.PI / 6,
    panX: 0,
    panY: 20,
  },
  front: {
    label: 'Спереди',
    title: 'Вид спереди (Front)',
    yaw: 0,
    pitch: 0,
    panX: 0,
    panY: 0,
  },
  back: {
    label: 'Сзади',
    title: 'Вид сзади (Back)',
    yaw: Math.PI,
    pitch: 0,
    panX: 0,
    panY: 0,
  },
  left: {
    label: 'Слева',
    title: 'Вид слева (Left)',
    yaw: -Math.PI / 2,
    pitch: 0,
    panX: 0,
    panY: 0,
  },
  right: {
    label: 'Справа',
    title: 'Вид справа (Right)',
    yaw: Math.PI / 2,
    pitch: 0,
    panX: 0,
    panY: 0,
  },
  top: {
    label: 'Сверху',
    title: 'Вид сверху (Top)',
    yaw: 0,
    pitch: Math.PI / 2 - 0.02,
    panX: 0,
    panY: 0,
  },
  bottom: {
    label: 'Снизу',
    title: 'Вид снизу (Bottom)',
    yaw: 0,
    pitch: -Math.PI / 2 + 0.02,
    panX: 0,
    panY: 0,
  },
};

const FIXED_VIEW_AXES: Record<Exclude<CameraPresetType, 'iso'>, {
  hAxis: 0 | 1 | 2;
  vAxis: 0 | 1 | 2;
  dAxis: 0 | 1 | 2;
  hLabel: string;
  vLabel: string;
}> = {
  front:  { hAxis: 0, vAxis: 2, dAxis: 1, hLabel: 'X', vLabel: 'Z' },
  back:   { hAxis: 0, vAxis: 2, dAxis: 1, hLabel: 'X', vLabel: 'Z' },
  left:   { hAxis: 1, vAxis: 2, dAxis: 0, hLabel: 'Y', vLabel: 'Z' },
  right:  { hAxis: 1, vAxis: 2, dAxis: 0, hLabel: 'Y', vLabel: 'Z' },
  top:    { hAxis: 0, vAxis: 1, dAxis: 2, hLabel: 'X', vLabel: 'Y' },
  bottom: { hAxis: 0, vAxis: 1, dAxis: 2, hLabel: 'X', vLabel: 'Y' },
};

const getRingPoints = (axis: 'X' | 'Y' | 'Z', ox: number, oy: number, oz: number, radius: number): [number, number, number][] => {
  const pts: [number, number, number][] = [];
  const segments = 48;
  for (let i = 0; i <= segments; i++) {
    const theta = (i * 2 * Math.PI) / segments;
    if (axis === 'X') {
      pts.push([ox, oy + radius * Math.cos(theta), oz + radius * Math.sin(theta)]);
    } else if (axis === 'Y') {
      pts.push([ox + radius * Math.cos(theta), oy, oz + radius * Math.sin(theta)]);
    } else {
      pts.push([ox + radius * Math.cos(theta), oy + radius * Math.sin(theta), oz]);
    }
  }
  return pts;
};

const rotateVertex = (
  vertex: [number, number, number],
  center: [number, number, number],
  axis: 'X' | 'Y' | 'Z',
  angle: number
): [number, number, number] => {
  const [ox, oy, oz] = center;
  const [vx, vy, vz] = vertex;
  const dy = vy - oy;
  const dz = vz - oz;
  const dx = vx - ox;

  if (axis === 'X') {
    const ny = oy + dy * Math.cos(angle) - dz * Math.sin(angle);
    const nz = oz + dy * Math.sin(angle) + dz * Math.cos(angle);
    return [vx, ny, nz];
  } else if (axis === 'Y') {
    const nx = ox + dx * Math.cos(angle) + dz * Math.sin(angle);
    const nz = oz - dx * Math.sin(angle) + dz * Math.cos(angle);
    return [nx, vy, nz];
  } else { // Z
    const nx = ox + dx * Math.cos(angle) - dy * Math.sin(angle);
    const ny = oy + dx * Math.sin(angle) + dy * Math.cos(angle);
    return [nx, ny, vz];
  }
};

export const PolyObjectEditorModal: React.FC<PolyObjectEditorModalProps> = ({
  isOpen,
  onClose,
  initialModelId,
  onSelectModel,
  uiStrings = {},
}) => {
  // Available models registry
  const [modelMap, setModelMap] = useState<Record<string, PolyObjectModel>>(() => ({
    ...REGISTERED_POLY_MODELS,
  }));

  const [activeModelId, setActiveModelId] = useState<string>(() => {
    if (initialModelId && REGISTERED_POLY_MODELS[initialModelId]) return initialModelId;
    const keys = Object.keys(REGISTERED_POLY_MODELS);
    return keys[0] || 'chair';
  });

  // Current working model state
  const [model, setModel] = useState<PolyObjectModel>(() => {
    const existing = getPolyModelById(activeModelId) || REGISTERED_POLY_MODELS['chair'];
    return JSON.parse(JSON.stringify(existing));
  });

  // History for Undo/Redo with synchronized ref for low-latency & keyboard shortcuts
  const historyRef = useRef<PolyObjectModel[]>([JSON.parse(JSON.stringify(model))]);
  const historyIdxRef = useRef<number>(0);

  const [history, setHistory] = useState<PolyObjectModel[]>(historyRef.current);
  const [historyIdx, setHistoryIdx] = useState<number>(0);

  // Multi-Cube Selection State & Backward Compatibility Helper
  const [selectedCubeIndices, setSelectedCubeIndices] = useState<number[]>([]);
  const selectedCubeIdx = selectedCubeIndices.length > 0 ? selectedCubeIndices[0] : null;
  const setSelectedCubeIdx = useCallback((val: number | null | ((prev: number | null) => number | null)) => {
    if (typeof val === 'function') {
      const prevVal = selectedCubeIndices.length > 0 ? selectedCubeIndices[0] : null;
      const res = val(prevVal);
      setSelectedCubeIndices(res !== null ? [res] : []);
    } else {
      setSelectedCubeIndices(val !== null ? [val] : []);
    }
  }, [selectedCubeIndices]);

  const [selectedFaceTarget, setSelectedFaceTargetState] = useState<string>('all');
  const selectedFaceTargetRef = useRef<string>('all');
  const setSelectedFaceTarget = useCallback((val: string) => {
    selectedFaceTargetRef.current = val;
    setSelectedFaceTargetState(val);
  }, []);

  const [selectedFaceTargets, setSelectedFaceTargetsState] = useState<string[]>([]);
  const selectedFaceTargetsRef = useRef<string[]>([]);
  const setSelectedFaceTargets = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    if (typeof val === 'function') {
      setSelectedFaceTargetsState(prev => {
        const next = val(prev);
        selectedFaceTargetsRef.current = next;
        return next;
      });
    } else {
      selectedFaceTargetsRef.current = val;
      setSelectedFaceTargetsState(val);
    }
  }, []);

  const [isTouchMultiSelect, setIsTouchMultiSelect] = useState<boolean>(false);

  // Editor tools & settings - 'rotate' (scene rotation) is default tool
  const [activeTool, setActiveTool] = useState<EditorTool>('rotate');
  const [selectionMode, setSelectionMode] = useState<EditorSelectionMode>('cube');

  // Vertex & Edge Selection State
  const [selectedVertexIdxs, setSelectedVertexIdxs] = useState<number[]>([]);
  const [selectedEdgePairs, setSelectedEdgePairs] = useState<[number, number][]>([]);
  const [hoveredVertexIdx, setHoveredVertexIdx] = useState<number | null>(null);
  const [hoveredEdgePair, setHoveredEdgePair] = useState<[number, number] | null>(null);

  // Toggle buttons for X, Y, Z axes simultaneously (Off by default)
  const [activeAxes, setActiveAxes] = useState<{ X: boolean; Y: boolean; Z: boolean }>({ X: false, Y: false, Z: false });
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [showViewAnglesMenu, setShowViewAnglesMenu] = useState<boolean>(false);
  const [showAssetPicker, setShowAssetPicker] = useState<boolean>(false);

  // Primitive creation dropdown & 2D Freeform shape state
  const [showAddPrimitiveMenu, setShowAddPrimitiveMenu] = useState<boolean>(false);
  const [isFreeformDrawing, setIsFreeformDrawing] = useState<boolean>(false);
  const [freeformPoints, setFreeformPoints] = useState<[number, number][]>([]);
  const [freeformHoverPoint, setFreeformHoverPoint] = useState<[number, number] | null>(null);
  const [freeformExtrudeHeight, setFreeformExtrudeHeight] = useState<number>(0.2);

  const setCameraPreset = useCallback((preset: { yaw: number; pitch: number; panX: number; panY: number }) => {
    setCamera(prev => ({
      ...prev,
      yaw: preset.yaw,
      pitch: preset.pitch,
      panX: preset.panX,
      panY: preset.panY,
    }));
  }, []);

  const isPresetActive = useCallback((preset: { yaw: number; pitch: number }) => {
    const norm = (y: number) => {
      let v = y % (2 * Math.PI);
      if (v < 0) v += 2 * Math.PI;
      return v;
    };
    const yawDiff = Math.abs(norm(camera.yaw) - norm(preset.yaw));
    const pitchDiff = Math.abs(camera.pitch - preset.pitch);
    return (yawDiff < 0.08 || Math.abs(yawDiff - 2 * Math.PI) < 0.08) && pitchDiff < 0.08;
  }, [camera.yaw, camera.pitch]);

  // Active fixed camera preset check (front, back, left, right, top, bottom)
  const activeFixedPreset = useMemo<Exclude<CameraPresetType, 'iso'> | null>(() => {
    const fixedKeys: Exclude<CameraPresetType, 'iso'>[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    for (const key of fixedKeys) {
      if (isPresetActive(CAMERA_PRESETS[key])) {
        return key;
      }
    }
    return null;
  }, [isPresetActive]);

  // Gizmo Interaction State
  const [hoveredGizmo, setHoveredGizmo] = useState<GizmoTarget>(null);

  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showTextureTransformModal, setShowTextureTransformModal] = useState<boolean>(false);
  const [isTextureAspectLocked, setIsTextureAspectLocked] = useState<boolean>(true);
  const [newModelModal, setNewModelModal] = useState<boolean>(false);
  const [newModelName, setNewModelName] = useState<string>('');
  const [createMode, setCreateMode] = useState<'empty' | 'json'>('empty');
  const [newModelJson, setNewModelJson] = useState<string>('');
  const [newModelError, setNewModelError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  // Texture Layers state
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(null);
  const [showLayerAssetPicker, setShowLayerAssetPicker] = useState<boolean>(false);
  const [layerPickerTargetIndex, setLayerPickerTargetIndex] = useState<number | 'new'>('new');
  const [copiedLayers, setCopiedLayers] = useState<TextureLayer[] | null>(null);

  // Copy / Paste Clipboard state
  const copiedCubeRef = useRef<PolyObjectCube | null>(null);
  const [hasCopiedCube, setHasCopiedCube] = useState<boolean>(false);

  // Snap Mode toggle (OFF by default) & Magnet Grid Step (default 0.05m = 5cm)
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(false);
  const [gridStep, setGridStep] = useState<number>(0.05);

  // Active Edge Constraint for Edge Sliding
  const [isEdgeSlideEnabled, setIsEdgeSlideEnabled] = useState<boolean>(true);
  const activeEdgeConstraintRef = useRef<{
    v1Idx: number;
    v2Idx: number;
    v1Pos: [number, number, number];
    v2Pos: [number, number, number];
  } | null>(null);

  // Magnet / Snap indicator for canvas rendering
  const snapIndicatorRef = useRef<{
    pos: [number, number, number];
    label: string;
    type: 'vertex' | 'grid' | 'midpoint';
  } | null>(null);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pointer & Touch tracking refs for low-latency dragging & performance
  const isDraggingRef = useRef<boolean>(false);
  const dragGizmoTargetRef = useRef<GizmoTarget>(null);
  const dragMouseButtonRef = useRef<number>(0);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialCameraRef = useRef<CameraState>(DEFAULT_CAMERA);
  const initialCubeOffsetRef = useRef<[number, number, number]>([0, 0, 0]);
  const initialCubeSizeRef = useRef<[number, number, number]>([0.2, 0.2, 0.2]);
  const initialVerticesRef = useRef<[number, number, number][]>([]);
  const dragVertexIdxsRef = useRef<number[]>([]);
  const dragStartedOnEmptyRef = useRef<boolean>(false);
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialTouchZoomRef = useRef<number>(DEFAULT_CAMERA.zoom);
  const hasMovedDuringDragRef = useRef<boolean>(false);

  // Group Transformation tracking refs
  const initialGroupOffsetsRef = useRef<Map<number, { offset: [number, number, number]; size: [number, number, number] }>>(new Map());
  const initialGroupBoundsRef = useRef<{ center: [number, number, number]; size: [number, number, number] } | null>(null);
  const initialGrabAngleRef = useRef<number>(0);
  const initialGroupVerticesRef = useRef<Map<number, [number, number, number][]>>(new Map());

  // Group Bounding Box Calculator for multi-element transforms
  const getGroupBoundingBox = useCallback((cubes: PolyObjectCube[], indices: number[]) => {
    if (!indices || indices.length === 0) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    indices.forEach(idx => {
      const c = cubes[idx];
      if (!c) return;
      const [ox, oy, oz] = getCubeOffset(c);
      const [sx, sy, sz] = getCubeSize(c);
      if (ox - sx / 2 < minX) minX = ox - sx / 2;
      if (ox + sx / 2 > maxX) maxX = ox + sx / 2;
      if (oy - sy / 2 < minY) minY = oy - sy / 2;
      if (oy + sy / 2 > maxY) maxY = oy + sy / 2;
      if (oz - sz / 2 < minZ) minZ = oz - sz / 2;
      if (oz + sz / 2 > maxZ) maxZ = oz + sz / 2;
    });

    if (!isFinite(minX)) return null;

    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [number, number, number],
      size: [Math.max(0.01, maxX - minX), Math.max(0.01, maxY - minY), Math.max(0.01, maxZ - minZ)] as [number, number, number],
      minX, maxX, minY, maxY, minZ, maxZ,
    };
  }, []);

  // Model ref for instantaneous rendering during drag without stale state closures
  const modelRef = useRef<PolyObjectModel>(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // Synchronize when activeModelId changes
  const loadModel = useCallback((modelId: string) => {
    const found = modelMap[modelId] || getPolyModelById(modelId) || REGISTERED_POLY_MODELS['chair'];
    if (found) {
      const cloned = JSON.parse(JSON.stringify(found));
      if (Array.isArray(cloned.cubes)) {
        cloned.cubes = cloned.cubes.map(normalizeCube);
      } else {
        cloned.cubes = [];
      }
      setActiveModelId(modelId);
      setModel(cloned);
      modelRef.current = cloned;
      setSelectedCubeIdx(null);
      setSelectedVertexIdxs([]);
      setSelectedEdgePairs([]);
      setSelectedFaceTarget('all');
      historyRef.current = [cloned];
      historyIdxRef.current = 0;
      setHistory([cloned]);
      setHistoryIdx(0);
    }
  }, [modelMap]);

  useEffect(() => {
    if (initialModelId && modelMap[initialModelId]) {
      loadModel(initialModelId);
    }
  }, [initialModelId]);

  useEffect(() => {
    if (isOpen) {
      setSelectedCubeIdx(null);
      setSelectedVertexIdxs([]);
      setSelectedEdgePairs([]);
      setSelectedFaceTarget('all');
    }
  }, [isOpen]);

  // Record history step (Only called when drag ends or discrete action happens, avoiding CPU thrashing during drag)
  const recordState = useCallback((newModel: PolyObjectModel) => {
    const cloned = JSON.parse(JSON.stringify(newModel));
    const currentHist = historyRef.current;
    const currentIdx = historyIdxRef.current;
    const sliced = currentHist.slice(0, currentIdx + 1);

    // Don't record duplicate consecutive state
    const last = sliced[sliced.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(cloned)) {
      return;
    }

    const nextHist = [...sliced, cloned];
    const nextIdx = nextHist.length - 1;
    historyRef.current = nextHist;
    historyIdxRef.current = nextIdx;
    setHistory(nextHist);
    setHistoryIdx(nextIdx);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current > 0) {
      const newIdx = historyIdxRef.current - 1;
      const targetModel = historyRef.current[newIdx];
      if (targetModel) {
        historyIdxRef.current = newIdx;
        setHistoryIdx(newIdx);
        const cloned = JSON.parse(JSON.stringify(targetModel));
        setModel(cloned);
        modelRef.current = cloned;
        setSelectedCubeIdx(prev => {
          if (prev !== null && prev >= cloned.cubes.length) {
            return cloned.cubes.length > 0 ? cloned.cubes.length - 1 : null;
          }
          return prev;
        });
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current < historyRef.current.length - 1) {
      const newIdx = historyIdxRef.current + 1;
      const targetModel = historyRef.current[newIdx];
      if (targetModel) {
        historyIdxRef.current = newIdx;
        setHistoryIdx(newIdx);
        const cloned = JSON.parse(JSON.stringify(targetModel));
        setModel(cloned);
        modelRef.current = cloned;
        setSelectedCubeIdx(prev => {
          if (prev !== null && prev >= cloned.cubes.length) {
            return cloned.cubes.length > 0 ? cloned.cubes.length - 1 : null;
          }
          return prev;
        });
      }
    }
  }, []);

  const handleCopyCube = useCallback(() => {
    const currentModel = modelRef.current;
    if (selectedCubeIdx === null || !currentModel.cubes[selectedCubeIdx]) return;
    const src = currentModel.cubes[selectedCubeIdx];
    copiedCubeRef.current = JSON.parse(JSON.stringify(src));
    setHasCopiedCube(true);
  }, [selectedCubeIdx]);

  const handlePasteCube = useCallback(() => {
    if (!copiedCubeRef.current) return;
    const currentModel = modelRef.current;
    let dup: PolyObjectCube = JSON.parse(JSON.stringify(copiedCubeRef.current));

    const selected = selectedCubeIdx !== null && currentModel.cubes[selectedCubeIdx] ? currentModel.cubes[selectedCubeIdx] : null;
    if (selected) {
      const selOff = getCubeOffset(selected);
      const selSz = getCubeSize(selected);
      const dupSz = getCubeSize(dup);
      dup.offset = [
        Math.round((selOff[0] + selSz[0] / 2 + dupSz[0] / 2) * 1000) / 1000,
        selOff[1],
        selOff[2]
      ];
    } else {
      const dupOff = getCubeOffset(dup);
      dup.offset = [
        Math.round((dupOff[0] + 0.1) * 1000) / 1000,
        Math.round((dupOff[1] + 0.1) * 1000) / 1000,
        dupOff[2]
      ];
    }

    dup = normalizeCube(dup);
    const updatedModel = { ...currentModel, cubes: [...currentModel.cubes, dup] };
    setModel(updatedModel);
    setSelectedCubeIdx(updatedModel.cubes.length - 1);
    recordState(updatedModel);
  }, [selectedCubeIdx, recordState]);

  const handleDuplicateCube = useCallback(() => {
    const currentModel = modelRef.current;
    if (selectedCubeIdx === null || !currentModel.cubes[selectedCubeIdx]) return;
    const src = currentModel.cubes[selectedCubeIdx];
    let dup: PolyObjectCube = normalizeCube(JSON.parse(JSON.stringify(src)));
    const dupOff = getCubeOffset(dup);
    const dupSz = getCubeSize(dup);
    dup.offset = [
      Math.round((dupOff[0] + dupSz[0]) * 1000) / 1000,
      dupOff[1],
      dupOff[2]
    ];

    const updatedModel = { ...currentModel, cubes: [...currentModel.cubes, dup] };
    setModel(updatedModel);
    setSelectedCubeIdx(updatedModel.cubes.length - 1);
    recordState(updatedModel);
  }, [selectedCubeIdx, recordState]);

  // Keyboard shortcut listener for Undo, Redo, Copy, Paste, Duplicate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const isMeta = e.ctrlKey || e.metaKey;
      if (isMeta && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (isMeta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (isMeta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyCube();
      } else if (isMeta && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteCube();
      } else if (isMeta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateCube();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleRedo, handleCopyCube, handlePasteCube, handleDuplicateCube]);

  // High performance View Grid Snap calculation logic (snaps cube edges/center to 2D view grid lines)
  const snapCubeToViewGrid = useCallback((
    cubeIdx: number,
    candidateOffset: [number, number, number],
    candidateSize: [number, number, number],
    fixedPreset: Exclude<CameraPresetType, 'iso'>,
    stepVal: number,
    extrudeHandle: 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+' | 'Z-' | null = null
  ): { offset: [number, number, number]; size: [number, number, number] } => {
    const axisInfo = FIXED_VIEW_AXES[fixedPreset];
    if (!axisInfo) return { offset: candidateOffset, size: candidateSize };

    const { hAxis, vAxis } = axisInfo;

    const snapAxisEdgeOrCenter = (c: number, s: number): number => {
      const minEdge = c - s / 2;
      const center = c;
      const maxEdge = c + s / 2;

      const snapMin = Math.round(minEdge / stepVal) * stepVal + s / 2;
      const snapCenter = Math.round(center / stepVal) * stepVal;
      const snapMax = Math.round(maxEdge / stepVal) * stepVal - s / 2;

      const dMin = Math.abs(snapMin - c);
      const dCenter = Math.abs(snapCenter - c);
      const dMax = Math.abs(snapMax - c);

      if (dMin <= dCenter && dMin <= dMax) return snapMin;
      if (dMax <= dCenter && dMax <= dMin) return snapMax;
      return snapCenter;
    };

    const snapAxisResize = (
      candOff: number,
      candSz: number,
      axisIdx: number,
      handle: 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+' | 'Z-' | null
    ): { off: number; sz: number } => {
      const axisName = axisIdx === 0 ? 'X' : axisIdx === 1 ? 'Y' : 'Z';
      const plusHandle = `${axisName}+`;
      const minusHandle = `${axisName}-`;

      if (handle === plusHandle) {
        const minEdge = candOff - candSz / 2;
        const candMaxEdge = candOff + candSz / 2;
        const snappedMaxEdge = Math.round(candMaxEdge / stepVal) * stepVal;
        const newSz = Math.max(0.01, snappedMaxEdge - minEdge);
        const newOff = minEdge + newSz / 2;
        return { off: newOff, sz: newSz };
      } else if (handle === minusHandle) {
        const maxEdge = candOff + candSz / 2;
        const candMinEdge = candOff - candSz / 2;
        const snappedMinEdge = Math.round(candMinEdge / stepVal) * stepVal;
        const newSz = Math.max(0.01, maxEdge - snappedMinEdge);
        const newOff = maxEdge - newSz / 2;
        return { off: newOff, sz: newSz };
      } else {
        const newOff = snapAxisEdgeOrCenter(candOff, candSz);
        return { off: newOff, sz: candSz };
      }
    };

    const offArr = [...candidateOffset];
    const szArr = [...candidateSize];

    [hAxis, vAxis].forEach(axisIdx => {
      if (extrudeHandle) {
        const res = snapAxisResize(offArr[axisIdx], szArr[axisIdx], axisIdx, extrudeHandle);
        offArr[axisIdx] = res.off;
        szArr[axisIdx] = res.sz;
      } else {
        offArr[axisIdx] = snapAxisEdgeOrCenter(offArr[axisIdx], szArr[axisIdx]);
      }
    });

    return {
      offset: [
        Math.round(offArr[0] * 1000) / 1000,
        Math.round(offArr[1] * 1000) / 1000,
        Math.round(offArr[2] * 1000) / 1000,
      ],
      size: [
        Math.round(szArr[0] * 1000) / 1000,
        Math.round(szArr[1] * 1000) / 1000,
        Math.round(szArr[2] * 1000) / 1000,
      ],
    };
  }, []);

  // High performance Magnet / Snap calculation logic (Single face attachment, boundary clamping & anti-penetration)
  const snapCube = useCallback((
    cubeIdx: number,
    candidateOffset: [number, number, number],
    candidateSize: [number, number, number],
    cubes: PolyObjectCube[],
    extrudeHandle: 'X+' | 'X-' | 'Y+' | 'Y-' | 'Z+' | 'Z-' | null = null
  ): { offset: [number, number, number]; size: [number, number, number] } => {
    let [ox, oy, oz] = candidateOffset;
    let [sx, sy, sz] = candidateSize;
    const snapThreshold = 0.15; // Threshold for snapping to a surface

    let minZ = oz - sz / 2;
    // 1. Floor snap (Z = 0)
    if (minZ < 0 || Math.abs(minZ) < snapThreshold) {
      if (extrudeHandle === 'Z-') {
        sz = Math.max(0.01, oz + sz / 2);
        oz = sz / 2;
      } else {
        oz = sz / 2;
      }
    }

    // 2. Search for candidate parent surface attachment (Z-, Z+, Y-, Y+, X-, X+)
    let bestDist = snapThreshold;
    let parentSurface: {
      cube: PolyObjectCube;
      face: 'Z-' | 'Z+' | 'Y-' | 'Y+' | 'X-' | 'X+';
    } | null = null;

    for (let i = 0; i < cubes.length; i++) {
      if (i === cubeIdx) continue;
      const b = cubes[i];
      const bMinX = b.offset[0] - b.size[0] / 2;
      const bMaxX = b.offset[0] + b.size[0] / 2;
      const bMinY = b.offset[1] - b.size[1] / 2;
      const bMaxY = b.offset[1] + b.size[1] / 2;
      const bMinZ = b.offset[2] - b.size[2] / 2;
      const bMaxZ = b.offset[2] + b.size[2] / 2;

      const aMinX = ox - sx / 2;
      const aMaxX = ox + sx / 2;
      const aMinY = oy - sy / 2;
      const aMaxY = oy + sy / 2;
      const aMinZ = oz - sz / 2;
      const aMaxZ = oz + sz / 2;

      // Overlap checks for surface sliding
      const overlapXY = aMaxX >= bMinX - sx / 2 && aMinX <= bMaxX + sx / 2 &&
                        aMaxY >= bMinY - sy / 2 && aMinY <= bMaxY + sy / 2;

      const overlapXZ = aMaxX >= bMinX - sx / 2 && aMinX <= bMaxX + sx / 2 &&
                        aMaxZ >= bMinZ - sz / 2 && aMinZ <= bMaxZ + sz / 2;

      const overlapYZ = aMaxY >= bMinY - sy / 2 && aMinY <= bMaxY + sy / 2 &&
                        aMaxZ >= bMinZ - sz / 2 && aMinZ <= bMaxZ + sz / 2;

      // Give priority to attached planar surfaces (Z-, Z+) over side faces
      if (overlapXY) {
        // Top of A to Bottom of B (e.g. Chair leg top attached to Seat bottom)
        const dZMinus = Math.abs(aMaxZ - bMinZ);
        if (dZMinus < bestDist) {
          bestDist = dZMinus;
          parentSurface = { cube: b, face: 'Z-' };
        }

        // Bottom of A to Top of B (e.g. Object on top of Seat)
        const dZPlus = Math.abs(aMinZ - bMaxZ);
        if (dZPlus < bestDist) {
          bestDist = dZPlus;
          parentSurface = { cube: b, face: 'Z+' };
        }
      }

      if (overlapXZ && !parentSurface) {
        const dYMinus = Math.abs(aMaxY - bMinY);
        if (dYMinus < bestDist) {
          bestDist = dYMinus;
          parentSurface = { cube: b, face: 'Y-' };
        }

        const dYPlus = Math.abs(aMinY - bMaxY);
        if (dYPlus < bestDist) {
          bestDist = dYPlus;
          parentSurface = { cube: b, face: 'Y+' };
        }
      }

      if (overlapYZ && !parentSurface) {
        const dXMinus = Math.abs(aMaxX - bMinX);
        if (dXMinus < bestDist) {
          bestDist = dXMinus;
          parentSurface = { cube: b, face: 'X-' };
        }

        const dXPlus = Math.abs(aMinX - bMaxX);
        if (dXPlus < bestDist) {
          bestDist = dXPlus;
          parentSurface = { cube: b, face: 'X+' };
        }
      }
    }

    if (parentSurface) {
      const b = parentSurface.cube;
      const bMinX = b.offset[0] - b.size[0] / 2;
      const bMaxX = b.offset[0] + b.size[0] / 2;
      const bMinY = b.offset[1] - b.size[1] / 2;
      const bMaxY = b.offset[1] + b.size[1] / 2;
      const bMinZ = b.offset[2] - b.size[2] / 2;
      const bMaxZ = b.offset[2] + b.size[2] / 2;

      switch (parentSurface.face) {
        case 'Z-': {
          if (extrudeHandle === 'Z+') {
            const newSz = Math.max(0.01, bMinZ - (oz - sz / 2));
            oz = (oz - sz / 2) + newSz / 2;
            sz = newSz;
          } else {
            oz = bMinZ - sz / 2;
          }
          // X axis edge snap & boundary clamp on surface B
          if (sx <= b.size[0]) {
            const minEdgeX = bMinX + sx / 2;
            const maxEdgeX = bMaxX - sx / 2;
            if (Math.abs(ox - minEdgeX) < 0.03) ox = minEdgeX;
            else if (Math.abs(ox - maxEdgeX) < 0.03) ox = maxEdgeX;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(ox - cubes[i].offset[0]) < 0.02) {
                  ox = cubes[i].offset[0];
                  break;
                }
              }
            }
            ox = Math.max(minEdgeX, Math.min(maxEdgeX, ox));
          } else {
            ox = b.offset[0];
          }

          // Y axis edge snap & boundary clamp on surface B
          if (sy <= b.size[1]) {
            const minEdgeY = bMinY + sy / 2;
            const maxEdgeY = bMaxY - sy / 2;
            if (Math.abs(oy - minEdgeY) < 0.03) oy = minEdgeY;
            else if (Math.abs(oy - maxEdgeY) < 0.03) oy = maxEdgeY;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oy - cubes[i].offset[1]) < 0.02) {
                  oy = cubes[i].offset[1];
                  break;
                }
              }
            }
            oy = Math.max(minEdgeY, Math.min(maxEdgeY, oy));
          } else {
            oy = b.offset[1];
          }
          break;
        }
        case 'Z+': {
          if (extrudeHandle === 'Z-') {
            const newSz = Math.max(0.01, (oz + sz / 2) - bMaxZ);
            oz = (oz + sz / 2) - newSz / 2;
            sz = newSz;
          } else {
            oz = bMaxZ + sz / 2;
          }
          if (sx <= b.size[0]) {
            const minEdgeX = bMinX + sx / 2;
            const maxEdgeX = bMaxX - sx / 2;
            if (Math.abs(ox - minEdgeX) < 0.03) ox = minEdgeX;
            else if (Math.abs(ox - maxEdgeX) < 0.03) ox = maxEdgeX;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(ox - cubes[i].offset[0]) < 0.02) {
                  ox = cubes[i].offset[0];
                  break;
                }
              }
            }
            ox = Math.max(minEdgeX, Math.min(maxEdgeX, ox));
          } else {
            ox = b.offset[0];
          }

          if (sy <= b.size[1]) {
            const minEdgeY = bMinY + sy / 2;
            const maxEdgeY = bMaxY - sy / 2;
            if (Math.abs(oy - minEdgeY) < 0.03) oy = minEdgeY;
            else if (Math.abs(oy - maxEdgeY) < 0.03) oy = maxEdgeY;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oy - cubes[i].offset[1]) < 0.02) {
                  oy = cubes[i].offset[1];
                  break;
                }
              }
            }
            oy = Math.max(minEdgeY, Math.min(maxEdgeY, oy));
          } else {
            oy = b.offset[1];
          }
          break;
        }
        case 'Y-': {
          if (extrudeHandle === 'Y+') {
            const newSy = Math.max(0.01, bMinY - (oy - sy / 2));
            oy = (oy - sy / 2) + newSy / 2;
            sy = newSy;
          } else {
            oy = bMinY - sy / 2;
          }
          if (sx <= b.size[0]) {
            const minEdgeX = bMinX + sx / 2;
            const maxEdgeX = bMaxX - sx / 2;
            if (Math.abs(ox - minEdgeX) < 0.03) ox = minEdgeX;
            else if (Math.abs(ox - maxEdgeX) < 0.03) ox = maxEdgeX;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(ox - cubes[i].offset[0]) < 0.02) {
                  ox = cubes[i].offset[0];
                  break;
                }
              }
            }
            ox = Math.max(minEdgeX, Math.min(maxEdgeX, ox));
          } else {
            ox = b.offset[0];
          }

          if (sz <= b.size[2]) {
            const minEdgeZ = bMinZ + sz / 2;
            const maxEdgeZ = bMaxZ - sz / 2;
            if (Math.abs(oz - minEdgeZ) < 0.03) oz = minEdgeZ;
            else if (Math.abs(oz - maxEdgeZ) < 0.03) oz = maxEdgeZ;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oz - cubes[i].offset[2]) < 0.02) {
                  oz = cubes[i].offset[2];
                  break;
                }
              }
            }
            oz = Math.max(minEdgeZ, Math.min(maxEdgeZ, oz));
          } else {
            oz = b.offset[2];
          }
          break;
        }
        case 'Y+': {
          if (extrudeHandle === 'Y-') {
            const newSy = Math.max(0.01, (oy + sy / 2) - bMaxY);
            oy = (oy + sy / 2) - newSy / 2;
            sy = newSy;
          } else {
            oy = bMaxY + sy / 2;
          }
          if (sx <= b.size[0]) {
            const minEdgeX = bMinX + sx / 2;
            const maxEdgeX = bMaxX - sx / 2;
            if (Math.abs(ox - minEdgeX) < 0.03) ox = minEdgeX;
            else if (Math.abs(ox - maxEdgeX) < 0.03) ox = maxEdgeX;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(ox - cubes[i].offset[0]) < 0.02) {
                  ox = cubes[i].offset[0];
                  break;
                }
              }
            }
            ox = Math.max(minEdgeX, Math.min(maxEdgeX, ox));
          } else {
            ox = b.offset[0];
          }

          if (sz <= b.size[2]) {
            const minEdgeZ = bMinZ + sz / 2;
            const maxEdgeZ = bMaxZ - sz / 2;
            if (Math.abs(oz - minEdgeZ) < 0.03) oz = minEdgeZ;
            else if (Math.abs(oz - maxEdgeZ) < 0.03) oz = maxEdgeZ;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oz - cubes[i].offset[2]) < 0.02) {
                  oz = cubes[i].offset[2];
                  break;
                }
              }
            }
            oz = Math.max(minEdgeZ, Math.min(maxEdgeZ, oz));
          } else {
            oz = b.offset[2];
          }
          break;
        }
        case 'X-': {
          if (extrudeHandle === 'X+') {
            const newSx = Math.max(0.01, bMinX - (ox - sx / 2));
            ox = (ox - sx / 2) + newSx / 2;
            sx = newSx;
          } else {
            ox = bMinX - sx / 2;
          }
          if (sy <= b.size[1]) {
            const minEdgeY = bMinY + sy / 2;
            const maxEdgeY = bMaxY - sy / 2;
            if (Math.abs(oy - minEdgeY) < 0.03) oy = minEdgeY;
            else if (Math.abs(oy - maxEdgeY) < 0.03) oy = maxEdgeY;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oy - cubes[i].offset[1]) < 0.02) {
                  oy = cubes[i].offset[1];
                  break;
                }
              }
            }
            oy = Math.max(minEdgeY, Math.min(maxEdgeY, oy));
          } else {
            oy = b.offset[1];
          }

          if (sz <= b.size[2]) {
            const minEdgeZ = bMinZ + sz / 2;
            const maxEdgeZ = bMaxZ - sz / 2;
            if (Math.abs(oz - minEdgeZ) < 0.03) oz = minEdgeZ;
            else if (Math.abs(oz - maxEdgeZ) < 0.03) oz = maxEdgeZ;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oz - cubes[i].offset[2]) < 0.02) {
                  oz = cubes[i].offset[2];
                  break;
                }
              }
            }
            oz = Math.max(minEdgeZ, Math.min(maxEdgeZ, oz));
          } else {
            oz = b.offset[2];
          }
          break;
        }
        case 'X+': {
          if (extrudeHandle === 'X-') {
            const newSx = Math.max(0.01, (ox + sx / 2) - bMaxX);
            ox = (ox + sx / 2) - newSx / 2;
            sx = newSx;
          } else {
            ox = bMaxX + sx / 2;
          }
          if (sy <= b.size[1]) {
            const minEdgeY = bMinY + sy / 2;
            const maxEdgeY = bMaxY - sy / 2;
            if (Math.abs(oy - minEdgeY) < 0.03) oy = minEdgeY;
            else if (Math.abs(oy - maxEdgeY) < 0.03) oy = maxEdgeY;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oy - cubes[i].offset[1]) < 0.02) {
                  oy = cubes[i].offset[1];
                  break;
                }
              }
            }
            oy = Math.max(minEdgeY, Math.min(maxEdgeY, oy));
          } else {
            oy = b.offset[1];
          }

          if (sz <= b.size[2]) {
            const minEdgeZ = bMinZ + sz / 2;
            const maxEdgeZ = bMaxZ - sz / 2;
            if (Math.abs(oz - minEdgeZ) < 0.03) oz = minEdgeZ;
            else if (Math.abs(oz - maxEdgeZ) < 0.03) oz = maxEdgeZ;
            else {
              for (let i = 0; i < cubes.length; i++) {
                if (i === cubeIdx || cubes[i] === b) continue;
                if (Math.abs(oz - cubes[i].offset[2]) < 0.02) {
                  oz = cubes[i].offset[2];
                  break;
                }
              }
            }
            oz = Math.max(minEdgeZ, Math.min(maxEdgeZ, oz));
          } else {
            oz = b.offset[2];
          }
          break;
        }
      }
    }

    // 3. Anti-penetration collision resolution if inside another cube
    for (let i = 0; i < cubes.length; i++) {
      if (i === cubeIdx) continue;
      const b = cubes[i];
      const bMinX = b.offset[0] - b.size[0] / 2;
      const bMaxX = b.offset[0] + b.size[0] / 2;
      const bMinY = b.offset[1] - b.size[1] / 2;
      const bMaxY = b.offset[1] + b.size[1] / 2;
      const bMinZ = b.offset[2] - b.size[2] / 2;
      const bMaxZ = b.offset[2] + b.size[2] / 2;

      const curMinX = ox - sx / 2;
      const curMaxX = ox + sx / 2;
      const curMinY = oy - sy / 2;
      const curMaxY = oy + sy / 2;
      const curMinZ = oz - sz / 2;
      const curMaxZ = oz + sz / 2;

      if (
        curMaxX > bMinX + 0.001 && curMinX < bMaxX - 0.001 &&
        curMaxY > bMinY + 0.001 && curMinY < bMaxY - 0.001 &&
        curMaxZ > bMinZ + 0.001 && curMinZ < bMaxZ - 0.001
      ) {
        const penX1 = bMaxX - curMinX;
        const penX2 = curMaxX - bMinX;
        const penY1 = bMaxY - curMinY;
        const penY2 = curMaxY - bMinY;
        const penZ1 = bMaxZ - curMinZ;
        const penZ2 = curMaxZ - bMinZ;

        const minPen = Math.min(penX1, penX2, penY1, penY2, penZ1, penZ2);

        if (minPen === penX1) ox = bMaxX + sx / 2;
        else if (minPen === penX2) ox = bMinX - sx / 2;
        else if (minPen === penY1) oy = bMaxY + sy / 2;
        else if (minPen === penY2) oy = bMinY - sy / 2;
        else if (minPen === penZ1) oz = bMaxZ + sz / 2;
        else if (minPen === penZ2) oz = bMinZ - sz / 2;
      }
    }

    return {
      offset: [Math.round(ox * 1000) / 1000, Math.round(oy * 1000) / 1000, Math.round(oz * 1000) / 1000],
      size: [Math.round(sx * 1000) / 1000, Math.round(sy * 1000) / 1000, Math.round(sz * 1000) / 1000],
    };
  }, []);

  // Model modifications (skipHistory argument for continuous dragging)
  const updateCube = (idx: number, patch: Partial<PolyObjectCube>, skipHistory: boolean = false) => {
    if (idx < 0 || idx >= modelRef.current.cubes.length) return;
    const newCubes = [...modelRef.current.cubes];
    const oldCube = newCubes[idx];

    const nextOffset = patch.offset !== undefined ? patch.offset : oldCube.offset;
    const nextSize = patch.size !== undefined ? patch.size : oldCube.size;
    let nextVertices = patch.vertices !== undefined ? patch.vertices : oldCube.vertices;

    if (oldCube.vertices && oldCube.vertices.length > 0 && patch.vertices === undefined) {
      const oldOffset = oldCube.offset || [0, 0, 0];
      const oldSize = oldCube.size || [0.2, 0.2, 0.2];
      const newOffset = nextOffset || [0, 0, 0];
      const newSize = nextSize || [0.2, 0.2, 0.2];

      const hasOffsetChange = oldOffset.some((val, i) => val !== newOffset[i]);
      const hasSizeChange = oldSize.some((val, i) => val !== newSize[i]);

      if (hasOffsetChange || hasSizeChange) {
        nextVertices = oldCube.vertices.map(v => {
          const newV = [...v] as [number, number, number];
          for (let j = 0; j < 3; j++) {
            if (oldSize[j] > 0.001) {
              const t = (v[j] - oldOffset[j]) / oldSize[j];
              newV[j] = Math.round((newOffset[j] + t * newSize[j]) * 1000) / 1000;
            } else {
              newV[j] = Math.round((v[j] + (newOffset[j] - oldOffset[j])) * 1000) / 1000;
            }
          }
          return newV;
        });
      }
    }

    newCubes[idx] = {
      ...oldCube,
      ...patch,
      vertices: nextVertices,
      offset: nextOffset,
      size: nextSize
    };

    const updatedModel = { ...modelRef.current, cubes: newCubes };
    setModel(updatedModel);
    modelRef.current = updatedModel;
    if (!skipHistory) {
      recordState(updatedModel);
    }
  };

  const getCubeFaceNames = useCallback((cube: PolyObjectCube): string[] => {
    if (cube.customFaces && cube.customFaces.length > 0) {
      return cube.customFaces.map(f => f.name || 'custom');
    }
    return ['top', 'bottom', 'front', 'back', 'left', 'right'];
  }, []);

  const currentSelectedCube = selectedCubeIdx !== null && model.cubes[selectedCubeIdx] ? model.cubes[selectedCubeIdx] : null;

  const activeColorValue = useMemo(() => {
    if (!currentSelectedCube) return '#8B5A2B';
    if (selectedFaceTarget === 'all') {
      const col = currentSelectedCube.color;
      return typeof col === 'string' ? col : '#8B5A2B';
    }
    const fcVal = currentSelectedCube.faceColors?.[selectedFaceTarget];
    if (fcVal && typeof fcVal === 'string') return fcVal;
    const col = currentSelectedCube.color;
    return typeof col === 'string' ? col : '#8B5A2B';
  }, [currentSelectedCube, selectedFaceTarget]);

  const handleSetTargetColor = useCallback((newColor: string) => {
    const currentModel = modelRef.current;
    if (selectedCubeIndices.length === 0) return;

    let updatedCubes = [...currentModel.cubes];

    if (selectedFaceTargets.length > 0) {
      selectedFaceTargets.forEach(key => {
        const [cIdxStr, faceName] = key.split(':');
        const cIdx = parseInt(cIdxStr, 10);
        const cube = updatedCubes[cIdx];
        if (!cube) return;

        const currentFc = cube.faceColors ? { ...cube.faceColors } : {};
        currentFc[faceName] = newColor;

        const currentFt = cube.faceTextures ? { ...cube.faceTextures } : {};
        delete currentFt[faceName];

        updatedCubes[cIdx] = {
          ...cube,
          faceColors: currentFc,
          faceTextures: Object.keys(currentFt).length > 0 ? currentFt : undefined,
        };
      });
      const updatedModel = { ...currentModel, cubes: updatedCubes };
      setModel(updatedModel);
      recordState(updatedModel);
      return;
    }

    if (selectedCubeIdx === null || !updatedCubes[selectedCubeIdx]) return;
    const cube = updatedCubes[selectedCubeIdx];

    if (selectedFaceTarget === 'all') {
      // Setting color for all faces -> remove all textures
      updateCube(selectedCubeIdx, {
        color: newColor,
        faceColors: undefined,
        textureId: undefined,
        faceTextures: undefined,
      });
    } else {
      // Setting color for a specific face -> remove texture from this face
      const currentFc = cube.faceColors ? { ...cube.faceColors } : {};
      currentFc[selectedFaceTarget] = newColor;

      const currentFt = cube.faceTextures ? { ...cube.faceTextures } : {};
      delete currentFt[selectedFaceTarget];
      const hasFt = Object.keys(currentFt).length > 0;

      let nextTextureId = cube.textureId;
      let nextFaceTextures = hasFt ? currentFt : undefined;

      // If cube had a global textureId, convert it to faceTextures for remaining faces
      if (cube.textureId) {
        const faceNames = getCubeFaceNames(cube);
        const newFt: Record<string, string> = nextFaceTextures ? { ...nextFaceTextures } : {};
        faceNames.forEach((f) => {
          if (f !== selectedFaceTarget && !currentFc[f] && !newFt[f]) {
            newFt[f] = cube.textureId!;
          }
        });
        nextTextureId = undefined;
        nextFaceTextures = Object.keys(newFt).length > 0 ? newFt : undefined;
      }

      updateCube(selectedCubeIdx, {
        color: cube.color,
        faceColors: currentFc,
        textureId: nextTextureId,
        faceTextures: nextFaceTextures,
      });
    }
  }, [selectedCubeIdx, selectedCubeIndices, selectedFaceTargets, selectedFaceTarget, getCubeFaceNames, recordState]);

  const handleResetTargetFaceColor = useCallback((face: FaceTarget) => {
    const currentModel = modelRef.current;
    if (selectedCubeIndices.length === 0) return;

    let updatedCubes = [...currentModel.cubes];

    if (selectedFaceTargets.length > 0) {
      selectedFaceTargets.forEach(key => {
        const [cIdxStr, faceName] = key.split(':');
        const cIdx = parseInt(cIdxStr, 10);
        const cube = updatedCubes[cIdx];
        if (!cube || !cube.faceColors) return;

        const nextFc = { ...cube.faceColors };
        delete (nextFc as any)[faceName];
        const hasRemaining = Object.keys(nextFc).length > 0;

        updatedCubes[cIdx] = {
          ...cube,
          faceColors: hasRemaining ? nextFc : undefined,
        };
      });
      const updatedModel = { ...currentModel, cubes: updatedCubes };
      setModel(updatedModel);
      recordState(updatedModel);
      return;
    }

    if (selectedCubeIdx === null || !updatedCubes[selectedCubeIdx]) return;
    const cube = updatedCubes[selectedCubeIdx];

    if (face === 'all') {
      updateCube(selectedCubeIdx, { faceColors: undefined });
    } else if (cube.faceColors && (face in cube.faceColors)) {
      const nextFc = { ...cube.faceColors };
      delete (nextFc as any)[face];
      const hasRemaining = Object.keys(nextFc).length > 0;
      updateCube(selectedCubeIdx, { faceColors: hasRemaining ? nextFc : undefined });
    }
  }, [selectedCubeIdx, selectedCubeIndices, selectedFaceTargets, recordState]);

  const activeTextureValue = useMemo(() => {
    if (!currentSelectedCube) return undefined;
    if (selectedFaceTarget === 'all') {
      return currentSelectedCube.textureId;
    }
    return currentSelectedCube.faceTextures?.[selectedFaceTarget] || currentSelectedCube.textureId;
  }, [currentSelectedCube, selectedFaceTarget]);

  const handleSetTargetTexture = useCallback((texId: string | undefined) => {
    const currentModel = modelRef.current;
    if (selectedCubeIndices.length === 0) return;

    let updatedCubes = [...currentModel.cubes];

    if (selectedFaceTargets.length > 0) {
      selectedFaceTargets.forEach(key => {
        const [cIdxStr, faceName] = key.split(':');
        const cIdx = parseInt(cIdxStr, 10);
        const cube = updatedCubes[cIdx];
        if (!cube) return;

        const currentFt = cube.faceTextures ? { ...cube.faceTextures } : {};
        const currentFc = cube.faceColors ? { ...cube.faceColors } : {};

        if (texId) {
          currentFt[faceName] = texId;
          delete currentFc[faceName];
        } else {
          delete currentFt[faceName];
        }

        updatedCubes[cIdx] = {
          ...cube,
          faceTextures: Object.keys(currentFt).length > 0 ? currentFt : undefined,
          faceColors: Object.keys(currentFc).length > 0 ? currentFc : undefined,
        };
      });
      const updatedModel = { ...currentModel, cubes: updatedCubes };
      setModel(updatedModel);
      recordState(updatedModel);
      return;
    }

    if (selectedCubeIdx === null || !updatedCubes[selectedCubeIdx]) return;
    const cube = updatedCubes[selectedCubeIdx];

    if (selectedFaceTarget === 'all') {
      if (texId) {
        // Setting texture for all faces -> remove all colors
        updateCube(selectedCubeIdx, {
          textureId: texId,
          faceTextures: undefined,
          color: undefined,
          faceColors: undefined,
        });
      } else {
        // Resetting texture -> set default fallback color
        updateCube(selectedCubeIdx, {
          textureId: undefined,
          faceTextures: undefined,
          color: cube.color || '#8B5A2B',
          faceColors: undefined,
        });
      }
    } else {
      const currentFt = cube.faceTextures ? { ...cube.faceTextures } : {};
      const currentFc = cube.faceColors ? { ...cube.faceColors } : {};

      if (texId) {
        // Setting texture for specific face -> remove face color for this face
        currentFt[selectedFaceTarget] = texId;
        delete currentFc[selectedFaceTarget];

        let nextColor = cube.color;
        let nextFaceColors = Object.keys(currentFc).length > 0 ? currentFc : undefined;

        // If cube had global color, distribute it to other faces that aren't textured
        if (cube.color) {
          const faceNames = getCubeFaceNames(cube);
          const newFc: Record<string, string> = nextFaceColors ? { ...nextFaceColors } : {};
          faceNames.forEach((f) => {
            if (f !== selectedFaceTarget && !currentFt[f] && !newFc[f]) {
              newFc[f] = cube.color as string;
            }
          });
          nextColor = undefined;
          nextFaceColors = Object.keys(newFc).length > 0 ? newFc : undefined;
        }

        // Distribute global textureId to remaining untextured faces to keep them intact
        let nextTextureId = cube.textureId;
        let nextFaceTextures = currentFt;

        if (cube.textureId) {
          const faceNames = getCubeFaceNames(cube);
          faceNames.forEach((f) => {
            if (f !== selectedFaceTarget && !nextFaceTextures[f]) {
              nextFaceTextures[f] = cube.textureId!;
            }
          });
          nextTextureId = undefined;
        }

        updateCube(selectedCubeIdx, {
          textureId: nextTextureId,
          faceTextures: Object.keys(nextFaceTextures).length > 0 ? nextFaceTextures : undefined,
          color: nextColor,
          faceColors: nextFaceColors,
        });
      } else {
        // Clearing texture for specific face
        delete currentFt[selectedFaceTarget];

        // Distribute global textureId to remaining untextured faces
        let nextTextureId = cube.textureId;
        let nextFaceTextures = currentFt;

        if (cube.textureId) {
          const faceNames = getCubeFaceNames(cube);
          faceNames.forEach((f) => {
            if (f !== selectedFaceTarget && !nextFaceTextures[f]) {
              nextFaceTextures[f] = cube.textureId!;
            }
          });
          nextTextureId = undefined;
        }

        const hasFt = Object.keys(nextFaceTextures).length > 0;

        // Assign a color to this face so it's not transparent/missing
        const fallbackColor = cube.color || '#8B5A2B';
        currentFc[selectedFaceTarget] = fallbackColor;

        updateCube(selectedCubeIdx, {
          textureId: nextTextureId,
          faceTextures: hasFt ? nextFaceTextures : undefined,
          faceColors: currentFc,
        });
      }
    }
  }, [selectedCubeIdx, selectedCubeIndices, selectedFaceTargets, selectedFaceTarget, getCubeFaceNames, recordState]);

  const activeTextureTransform = useMemo<FaceTextureTransform>(() => {
    if (!currentSelectedCube) return {};
    if (selectedFaceTarget === 'all') {
      return currentSelectedCube.textureTransform || {};
    }
    return (
      currentSelectedCube.faceTransforms?.[selectedFaceTarget] ||
      currentSelectedCube.textureTransform ||
      {}
    );
  }, [currentSelectedCube, selectedFaceTarget]);

  const handleSetTargetTextureTransform = useCallback((patch: Partial<FaceTextureTransform>) => {
    if (selectedCubeIdx === null || !modelRef.current.cubes[selectedCubeIdx]) return;
    const cube = modelRef.current.cubes[selectedCubeIdx];

    if (selectedFaceTarget === 'all') {
      const existing = cube.textureTransform || {};
      const nextTransform = { ...existing, ...patch };
      updateCube(selectedCubeIdx, {
        textureTransform: nextTransform,
      });
    } else {
      const currentFt = cube.faceTransforms ? { ...cube.faceTransforms } : {};
      const existing = currentFt[selectedFaceTarget] || cube.textureTransform || {};
      currentFt[selectedFaceTarget] = { ...existing, ...patch };

      updateCube(selectedCubeIdx, {
        faceTransforms: currentFt,
      });
    }
  }, [selectedCubeIdx, selectedFaceTarget]);

  const handleResetTargetTextureTransform = useCallback(() => {
    if (selectedCubeIdx === null || !modelRef.current.cubes[selectedCubeIdx]) return;
    const cube = modelRef.current.cubes[selectedCubeIdx];

    if (selectedFaceTarget === 'all') {
      updateCube(selectedCubeIdx, {
        textureTransform: undefined,
        faceTransforms: undefined,
      });
    } else if (cube.faceTransforms && (selectedFaceTarget in cube.faceTransforms)) {
      const nextFt = { ...cube.faceTransforms };
      delete (nextFt as any)[selectedFaceTarget];
      const hasRemaining = Object.keys(nextFt).length > 0;
      updateCube(selectedCubeIdx, {
        faceTransforms: hasRemaining ? nextFt : undefined,
      });
    }
  }, [selectedCubeIdx, selectedFaceTarget]);

  // Active Texture Layers for currently selected face / cube target
  const activeTextureLayers = useMemo<TextureLayer[]>(() => {
    if (!currentSelectedCube) return [];
    if (selectedFaceTarget === 'all') {
      return currentSelectedCube.textureLayers || [];
    }
    return currentSelectedCube.faceTextureLayers?.[selectedFaceTarget] || currentSelectedCube.textureLayers || [];
  }, [currentSelectedCube, selectedFaceTarget]);

  const handleSetTargetLayers = useCallback((newLayers: TextureLayer[] | undefined) => {
    clearCompositeCanvasCache();
    if (selectedCubeIdx === null || !modelRef.current.cubes[selectedCubeIdx]) return;
    const cube = modelRef.current.cubes[selectedCubeIdx];

    if (selectedFaceTarget === 'all') {
      updateCube(selectedCubeIdx, {
        textureLayers: newLayers && newLayers.length > 0 ? newLayers : undefined,
      });
    } else {
      const currentFtl = cube.faceTextureLayers ? { ...cube.faceTextureLayers } : {};
      if (newLayers && newLayers.length > 0) {
        currentFtl[selectedFaceTarget] = newLayers;
      } else {
        delete currentFtl[selectedFaceTarget];
      }
      const hasRemaining = Object.keys(currentFtl).length > 0;
      updateCube(selectedCubeIdx, {
        faceTextureLayers: hasRemaining ? currentFtl : undefined,
      });
    }
  }, [selectedCubeIdx, selectedFaceTarget]);

  const handleAddLayer = useCallback((textureId: string) => {
    const layer: TextureLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      textureId,
      name: `Слой ${activeTextureLayers.length + 1}`,
      enabled: true,
      opacity: 1.0,
      blendMode: 'source-over',
      transform: {
        scaleU: 1.0,
        scaleV: 1.0,
        offsetU: 0.0,
        offsetV: 0.0,
        rotation: 0,
        flipU: false,
        flipV: false,
      },
    };
    const updated = [...activeTextureLayers, layer];
    handleSetTargetLayers(updated);
    setSelectedLayerIndex(updated.length - 1);
  }, [activeTextureLayers, handleSetTargetLayers]);

  const handleRemoveLayer = useCallback((index: number) => {
    const updated = activeTextureLayers.filter((_, i) => i !== index);
    handleSetTargetLayers(updated);
    if (selectedLayerIndex === index) {
      setSelectedLayerIndex(null);
    } else if (selectedLayerIndex !== null && selectedLayerIndex > index) {
      setSelectedLayerIndex(selectedLayerIndex - 1);
    }
  }, [activeTextureLayers, handleSetTargetLayers, selectedLayerIndex]);

  const handleToggleLayerEnabled = useCallback((index: number) => {
    const updated = activeTextureLayers.map((l, i) => {
      if (i === index) {
        return { ...l, enabled: l.enabled === false ? true : false };
      }
      return l;
    });
    handleSetTargetLayers(updated);
  }, [activeTextureLayers, handleSetTargetLayers]);

  const handleReorderLayer = useCallback((index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= activeTextureLayers.length) return;

    const updated = [...activeTextureLayers];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    handleSetTargetLayers(updated);
    if (selectedLayerIndex === index) {
      setSelectedLayerIndex(targetIdx);
    } else if (selectedLayerIndex === targetIdx) {
      setSelectedLayerIndex(index);
    }
  }, [activeTextureLayers, handleSetTargetLayers, selectedLayerIndex]);

  const handleUpdateLayerProps = useCallback((index: number, patch: Partial<TextureLayer>) => {
    const updated = activeTextureLayers.map((l, i) => {
      if (i === index) {
        return { ...l, ...patch };
      }
      return l;
    });
    handleSetTargetLayers(updated);
  }, [activeTextureLayers, handleSetTargetLayers]);

  const handleUpdateLayerTransform = useCallback((index: number, patch: Partial<FaceTextureTransform>) => {
    const updated = activeTextureLayers.map((l, i) => {
      if (i === index) {
        const existingTransform = l.transform || {
          scaleU: 1.0, scaleV: 1.0, offsetU: 0, offsetV: 0, rotation: 0, flipU: false, flipV: false
        };
        return {
          ...l,
          transform: { ...existingTransform, ...patch }
        };
      }
      return l;
    });
    handleSetTargetLayers(updated);
  }, [activeTextureLayers, handleSetTargetLayers]);

  const handleCopyLayers = useCallback(() => {
    if (activeTextureLayers.length > 0) {
      setCopiedLayers(JSON.parse(JSON.stringify(activeTextureLayers)));
    }
  }, [activeTextureLayers]);

  const handlePasteLayers = useCallback(() => {
    if (copiedLayers && copiedLayers.length > 0) {
      const pasted = copiedLayers.map((l) => ({
        ...l,
        id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      }));
      handleSetTargetLayers(pasted);
      setSelectedLayerIndex(pasted.length - 1);
    }
  }, [copiedLayers, handleSetTargetLayers]);

  // Helper primitive generators & Freeform shape handlers
  const createCylinderCube = useCallback((
    offset: [number, number, number],
    size: [number, number, number],
    color: string = '#8B5A2B',
    segments: number = 12
  ): PolyObjectCube => {
    const rx = size[0] / 2;
    const ry = size[1] / 2;
    const hz = size[2] / 2;
    const [ox, oy, oz] = offset;

    const vertices: [number, number, number][] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const x = ox + rx * Math.cos(angle);
      const y = oy + ry * Math.sin(angle);
      vertices.push([
        Math.round(x * 1000) / 1000,
        Math.round(y * 1000) / 1000,
        Math.round((oz - hz) * 1000) / 1000
      ]);
    }
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const x = ox + rx * Math.cos(angle);
      const y = oy + ry * Math.sin(angle);
      vertices.push([
        Math.round(x * 1000) / 1000,
        Math.round(y * 1000) / 1000,
        Math.round((oz + hz) * 1000) / 1000
      ]);
    }

    const customFaces: PolyCustomFace[] = [];
    const topIndices: number[] = [];
    for (let i = 0; i < segments; i++) topIndices.push(segments + i);
    customFaces.push({ vertices: topIndices, color, name: 'top' });

    const bottomIndices: number[] = [];
    for (let i = segments - 1; i >= 0; i--) bottomIndices.push(i);
    customFaces.push({ vertices: bottomIndices, color, name: 'bottom' });

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      customFaces.push({ vertices: [i, next, segments + next, segments + i], color, name: `side_${i}` });
    }

    return {
      offset: [Math.round(ox * 1000) / 1000, Math.round(oy * 1000) / 1000, Math.round(oz * 1000) / 1000],
      size: [Math.round(size[0] * 1000) / 1000, Math.round(size[1] * 1000) / 1000, Math.round(size[2] * 1000) / 1000],
      color,
      vertices,
      customFaces
    };
  }, []);

  const createFlatSquareCube = useCallback((
    offset: [number, number, number],
    size: [number, number, number],
    color: string = '#8B5A2B'
  ): PolyObjectCube => {
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const [ox, oy, oz] = offset;

    const vertices: [number, number, number][] = [
      [Math.round((ox - hx) * 1000) / 1000, Math.round((oy - hy) * 1000) / 1000, Math.round(oz * 1000) / 1000],
      [Math.round((ox + hx) * 1000) / 1000, Math.round((oy - hy) * 1000) / 1000, Math.round(oz * 1000) / 1000],
      [Math.round((ox + hx) * 1000) / 1000, Math.round((oy + hy) * 1000) / 1000, Math.round(oz * 1000) / 1000],
      [Math.round((ox - hx) * 1000) / 1000, Math.round((oy + hy) * 1000) / 1000, Math.round(oz * 1000) / 1000],
    ];

    const customFaces: PolyCustomFace[] = [
      { vertices: [0, 1, 2, 3], color, name: 'top' },
      { vertices: [3, 2, 1, 0], color, name: 'bottom' }
    ];

    return {
      offset: [Math.round(ox * 1000) / 1000, Math.round(oy * 1000) / 1000, Math.round(oz * 1000) / 1000],
      size: [Math.round(size[0] * 1000) / 1000, Math.round(size[1] * 1000) / 1000, 0.005],
      color,
      vertices,
      customFaces
    };
  }, []);

  const createFlatCircleCube = useCallback((
    offset: [number, number, number],
    size: [number, number, number],
    color: string = '#8B5A2B',
    segments: number = 12
  ): PolyObjectCube => {
    const rx = size[0] / 2;
    const ry = size[1] / 2;
    const [ox, oy, oz] = offset;

    const vertices: [number, number, number][] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const x = ox + rx * Math.cos(angle);
      const y = oy + ry * Math.sin(angle);
      vertices.push([
        Math.round(x * 1000) / 1000,
        Math.round(y * 1000) / 1000,
        Math.round(oz * 1000) / 1000
      ]);
    }

    const topIndices: number[] = [];
    const bottomIndices: number[] = [];
    for (let i = 0; i < segments; i++) topIndices.push(i);
    for (let i = segments - 1; i >= 0; i--) bottomIndices.push(i);

    const customFaces: PolyCustomFace[] = [
      { vertices: topIndices, color, name: 'top' },
      { vertices: bottomIndices, color, name: 'bottom' }
    ];

    return {
      offset: [Math.round(ox * 1000) / 1000, Math.round(oy * 1000) / 1000, Math.round(oz * 1000) / 1000],
      size: [Math.round(size[0] * 1000) / 1000, Math.round(size[1] * 1000) / 1000, 0.005],
      color,
      vertices,
      customFaces
    };
  }, []);

  const createSphereCube = useCallback((
    offset: [number, number, number],
    size: [number, number, number],
    color: string = '#8B5A2B',
    rings: number = 8,
    segments: number = 12
  ): PolyObjectCube => {
    const rx = size[0] / 2;
    const ry = size[1] / 2;
    const rz = size[2] / 2;
    const [ox, oy, oz] = offset;

    const vertices: [number, number, number][] = [];
    for (let r = 0; r <= rings; r++) {
      const theta = (r * Math.PI) / rings;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let s = 0; s < segments; s++) {
        const phi = (s * 2 * Math.PI) / segments;
        const x = ox + rx * sinTheta * Math.cos(phi);
        const y = oy + ry * sinTheta * Math.sin(phi);
        const z = oz + rz * cosTheta;

        vertices.push([
          Math.round(x * 1000) / 1000,
          Math.round(y * 1000) / 1000,
          Math.round(z * 1000) / 1000
        ]);
      }
    }

    const customFaces: PolyCustomFace[] = [];
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const nextS = (s + 1) % segments;
        const i00 = r * segments + s;
        const i01 = r * segments + nextS;
        const i11 = (r + 1) * segments + nextS;
        const i10 = (r + 1) * segments + s;

        // Порядок вершин изменен на [i00, i10, i11, i01] (против часовой стрелки снаружи сферы),
        // чтобы нормали смотрели наружу и передние грани не отсекались.
        customFaces.push({
          vertices: [i00, i10, i11, i01],
          color,
          name: `sphere_${r}_${s}`
        });
      }
    }

    return {
      shape: 'sphere',
      offset: [Math.round(ox * 1000) / 1000, Math.round(oy * 1000) / 1000, Math.round(oz * 1000) / 1000],
      size: [Math.round(size[0] * 1000) / 1000, Math.round(size[1] * 1000) / 1000, Math.round(size[2] * 1000) / 1000],
      color,
      vertices,
      customFaces
    };
  }, []);

// High-performance robust 2D Triangulation algorithm (Ear Clipping with Delaunay quality scoring & shortest internal diagonal partitioning fallback)
const triangulate2DPolygon = (pts: [number, number][]): number[][] => {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  const isPointInTriangle = (
    p: [number, number],
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ): boolean => {
    const crossAB = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const crossBC = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    const crossCA = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    const eps = 1e-7;
    return crossAB >= -eps && crossBC >= -eps && crossCA >= -eps;
  };

  const intersects = (p1: [number, number], p2: [number, number], q1: [number, number], q2: [number, number]): boolean => {
    const ccw = (a: [number, number], b: [number, number], c: [number, number]) =>
      (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
    return ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2);
  };

  const isInternalDiagonal = (polyIndices: number[], iIdx: number, jIdx: number): boolean => {
    const num = polyIndices.length;
    const aIdx = polyIndices[iIdx];
    const bIdx = polyIndices[jIdx];
    const a = pts[aIdx];
    const b = pts[bIdx];

    const midX = (a[0] + b[0]) / 2;
    const midY = (a[1] + b[1]) / 2;

    let inside = false;
    for (let k = 0, l = num - 1; k < num; l = k++) {
      const p1 = pts[polyIndices[k]];
      const p2 = pts[polyIndices[l]];
      const intersect = ((p1[1] > midY) !== (p2[1] > midY)) &&
        (midX < (p2[0] - p1[0]) * (midY - p1[1]) / ((p2[1] - p1[1]) || 1e-9) + p1[0]);
      if (intersect) inside = !inside;
    }
    if (!inside) return false;

    for (let k = 0; k < num; k++) {
      const nextK = (k + 1) % num;
      if (k === iIdx || k === jIdx || nextK === iIdx || nextK === jIdx) continue;
      if (intersects(a, b, pts[polyIndices[k]], pts[polyIndices[nextK]])) {
        return false;
      }
    }
    return true;
  };

  const indices = Array.from({ length: n }, (_, i) => i);
  const triangles: number[][] = [];

  const getEarScore = (currIdx: number, prevIdx: number, nextIdx: number): number | null => {
    const a = pts[prevIdx];
    const b = pts[currIdx];
    const c = pts[nextIdx];

    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross <= 1e-7) return null;

    for (let k = 0; k < indices.length; k++) {
      const idx = indices[k];
      if (idx === prevIdx || idx === currIdx || idx === nextIdx) continue;
      if (isPointInTriangle(pts[idx], a, b, c)) {
        return null;
      }
    }

    const area = cross / 2;
    const diagDistSq = (c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2;
    return area / (diagDistSq + 1e-9);
  };

  while (indices.length > 3) {
    let bestEarIdx = -1;
    let maxScore = -1;

    const count = indices.length;
    for (let i = 0; i < count; i++) {
      const prev = indices[(i + count - 1) % count];
      const curr = indices[i];
      const next = indices[(i + 1) % count];

      const score = getEarScore(curr, prev, next);
      if (score !== null && score > maxScore) {
        maxScore = score;
        bestEarIdx = i;
      }
    }

    if (bestEarIdx !== -1) {
      const prev = indices[(bestEarIdx + count - 1) % count];
      const curr = indices[bestEarIdx];
      const next = indices[(bestEarIdx + 1) % count];

      triangles.push([prev, curr, next]);
      indices.splice(bestEarIdx, 1);
    } else {
      let bestI = -1, bestJ = -1;
      let minDiagLenSq = Infinity;

      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 2; j < indices.length; j++) {
          if (i === 0 && j === indices.length - 1) continue;
          if (isInternalDiagonal(indices, i, j)) {
            const dSq = (pts[indices[i]][0] - pts[indices[j]][0]) ** 2 + (pts[indices[i]][1] - pts[indices[j]][1]) ** 2;
            if (dSq < minDiagLenSq) {
              minDiagLenSq = dSq;
              bestI = i;
              bestJ = j;
            }
          }
        }
      }

      if (bestI !== -1 && bestJ !== -1) {
        const poly1 = indices.slice(bestI, bestJ + 1);
        const poly2 = [...indices.slice(bestJ), ...indices.slice(0, bestI + 1)];

        const pts1 = poly1.map(idx => pts[idx]);
        const pts2 = poly2.map(idx => pts[idx]);

        const tris1 = triangulate2DPolygon(pts1);
        const tris2 = triangulate2DPolygon(pts2);

        tris1.forEach(t => triangles.push([poly1[t[0]], poly1[t[1]], poly1[t[2]]]));
        tris2.forEach(t => triangles.push([poly2[t[0]], poly2[t[1]], poly2[t[2]]]));
        return triangles;
      } else {
        const mid = Math.floor(indices.length / 2);
        for (let i = 1; i < mid; i++) {
          triangles.push([indices[0], indices[i], indices[i + 1]]);
        }
        for (let i = mid; i < indices.length - 1; i++) {
          triangles.push([indices[mid], indices[i], indices[i + 1]]);
        }
        return triangles;
      }
    }
  }

  if (indices.length === 3) {
    triangles.push([indices[0], indices[1], indices[2]]);
  }

  return triangles;
};

  const createFreeformExtrudedCube = useCallback((
    rawPoints2D: [number, number][],
    heightZ: number,
    color: string = '#8B5A2B'
  ): PolyObjectCube => {
    if (rawPoints2D.length < 3) {
      return { offset: [0, 0, heightZ / 2], size: [0.2, 0.2, heightZ], color };
    }

    // Filter out duplicate or extremely close consecutive vertices to prevent degenerated triangles
    const filteredPoints: [number, number][] = [];
    rawPoints2D.forEach(pt => {
      if (filteredPoints.length === 0) {
        filteredPoints.push(pt);
      } else {
        const last = filteredPoints[filteredPoints.length - 1];
        const dist = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
        if (dist > 0.001) {
          filteredPoints.push(pt);
        }
      }
    });

    // Also check if the first and last points are too close
    if (filteredPoints.length >= 3) {
      const first = filteredPoints[0];
      const last = filteredPoints[filteredPoints.length - 1];
      const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
      if (dist <= 0.001) {
        filteredPoints.pop();
      }
    }

    if (filteredPoints.length < 3) {
      return { offset: [0, 0, heightZ / 2], size: [0.2, 0.2, heightZ], color };
    }

    // 1. Calculate orientation (Counter-Clockwise CCW check)
    let area2D = 0;
    const nPts = filteredPoints.length;
    for (let i = 0; i < nPts; i++) {
      const j = (i + 1) % nPts;
      area2D += filteredPoints[i][0] * filteredPoints[j][1] - filteredPoints[j][0] * filteredPoints[i][1];
    }

    // Ensure points are ordered Counter-Clockwise (CCW)
    const points2D = area2D < 0 ? [...filteredPoints].reverse() : [...filteredPoints];
    const N = points2D.length;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    points2D.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const centerOX = (minX + maxX) / 2;
    const centerOY = (minY + maxY) / 2;
    const centerOZ = heightZ / 2;

    const sizeX = Math.max(0.01, maxX - minX);
    const sizeY = Math.max(0.01, maxY - minY);
    const sizeZ = Math.max(0.01, heightZ);

    // Build 3D Vertices: 0..N-1 (Bottom Z=0), N..2N-1 (Top Z=heightZ)
    const vertices: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      vertices.push([
        Math.round(points2D[i][0] * 1000) / 1000,
        Math.round(points2D[i][1] * 1000) / 1000,
        0
      ]);
    }
    for (let i = 0; i < N; i++) {
      vertices.push([
        Math.round(points2D[i][0] * 1000) / 1000,
        Math.round(points2D[i][1] * 1000) / 1000,
        Math.round(heightZ * 1000) / 1000
      ]);
    }

    const customFaces: PolyCustomFace[] = [];

    // 2. High-performance robust Ear Clipping Triangulation for Top and Bottom caps
    const capTriangles = triangulate2DPolygon(points2D);

    // Top faces (Z = heightZ, normal pointing UP [0, 0, 1])
    capTriangles.forEach(([a, b, c], idx) => {
      customFaces.push({
        vertices: [N + a, N + b, N + c],
        color,
        name: `top_${idx}`
      });
    });

    // Bottom faces (Z = 0, normal pointing DOWN [0, 0, -1])
    capTriangles.forEach(([a, b, c], idx) => {
      customFaces.push({
        vertices: [a, c, b],
        color,
        name: `bottom_${idx}`
      });
    });

    // 3. Side wall quads (extruding each edge from Bottom to Top)
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      // Winding order for side quad facing OUTWARD: [i, next, N + next, N + i]
      customFaces.push({
        vertices: [i, next, N + next, N + i],
        color,
        name: `side_${i}`
      });
    }

    return {
      offset: [Math.round(centerOX * 1000) / 1000, Math.round(centerOY * 1000) / 1000, Math.round(centerOZ * 1000) / 1000],
      size: [Math.round(sizeX * 1000) / 1000, Math.round(sizeY * 1000) / 1000, Math.round(sizeZ * 1000) / 1000],
      color,
      vertices,
      customFaces
    };
  }, []);

  const handleAddPrimitive = useCallback((type: 'cube' | 'cylinder' | 'flat_square' | 'flat_circle' | 'sphere') => {
    const currentModel = modelRef.current;
    const selected = selectedCubeIdx !== null && currentModel.cubes[selectedCubeIdx] ? currentModel.cubes[selectedCubeIdx] : null;
    const fixedSize: [number, number, number] = [0.2, 0.2, 0.2];
    const selOff = selected ? getCubeOffset(selected) : [0, 0, 0];
    const selSz = selected ? getCubeSize(selected) : [0.2, 0.2, 0.2];
    const newOffset: [number, number, number] = selected
      ? [selOff[0], selOff[1], selOff[2] + selSz[2] / 2 + fixedSize[2] / 2]
      : [0, 0, fixedSize[2] / 2];
    const newColor = selected?.color || '#8B5A2B';

    let newShape: PolyObjectCube;
    if (type === 'cylinder') {
      newShape = createCylinderCube(newOffset, fixedSize, newColor, 12);
    } else if (type === 'flat_square') {
      newShape = createFlatSquareCube(newOffset, fixedSize, newColor);
    } else if (type === 'flat_circle') {
      newShape = createFlatCircleCube(newOffset, fixedSize, newColor, 12);
    } else if (type === 'sphere') {
      newShape = createSphereCube(newOffset, fixedSize, newColor, 8, 12);
    } else {
      newShape = { offset: newOffset, size: fixedSize, color: newColor };
    }

    const updatedModel = { ...currentModel, cubes: [...currentModel.cubes, newShape] };
    setModel(updatedModel);
    setSelectedCubeIdx(updatedModel.cubes.length - 1);
    recordState(updatedModel);
  }, [selectedCubeIdx, createCylinderCube, createFlatSquareCube, createFlatCircleCube, createSphereCube, recordState]);

  const handleStartFreeform = useCallback(() => {
    setCameraPreset(CAMERA_PRESETS.top);
    setIsSnapEnabled(true);
    setIsFreeformDrawing(true);
    setFreeformPoints([]);
    setFreeformHoverPoint(null);
    setFreeformExtrudeHeight(0.2);
  }, [setCameraPreset]);

  const handleUndoFreeformPoint = useCallback(() => {
    setFreeformPoints(prev => prev.slice(0, -1));
  }, []);

  const handleFinishFreeform = useCallback(() => {
    if (freeformPoints.length < 3) return;
    const currentModel = modelRef.current;
    const newColor = (selectedCubeIdx !== null && currentModel.cubes[selectedCubeIdx])
      ? currentModel.cubes[selectedCubeIdx].color
      : '#8B5A2B';

    const extrudedMesh = createFreeformExtrudedCube(freeformPoints, freeformExtrudeHeight, newColor);
    const updatedModel = { ...currentModel, cubes: [...currentModel.cubes, extrudedMesh] };
    setModel(updatedModel);
    setSelectedCubeIdx(updatedModel.cubes.length - 1);
    recordState(updatedModel);

    setCameraPreset(CAMERA_PRESETS.iso);
    setIsFreeformDrawing(false);
    setFreeformPoints([]);
    setFreeformHoverPoint(null);
  }, [freeformPoints, freeformExtrudeHeight, selectedCubeIdx, createFreeformExtrudedCube, recordState, setCameraPreset]);

  const handleCancelFreeform = useCallback(() => {
    setIsFreeformDrawing(false);
    setFreeformPoints([]);
    setFreeformHoverPoint(null);
  }, []);

  const handleAddCube = () => {
    handleAddPrimitive('cube');
  };

  const handleDeleteCube = useCallback(() => {
    const currentModel = modelRef.current;
    const removeIndices = selectedCubeIndices.length > 0
      ? selectedCubeIndices
      : (selectedCubeIdx !== null ? [selectedCubeIdx] : []);

    if (removeIndices.length === 0) return;

    const removeSet = new Set(removeIndices);
    const newCubes = currentModel.cubes.filter((_, i) => !removeSet.has(i));
    const updatedModel = { ...currentModel, cubes: newCubes };

    setModel(updatedModel);
    modelRef.current = updatedModel;
    setSelectedCubeIndices([]);
    setSelectedVertexIdxs([]);
    setSelectedEdgePairs([]);
    setSelectedFaceTarget('all');
    recordState(updatedModel);
  }, [selectedCubeIndices, selectedCubeIdx, recordState, setSelectedFaceTarget]);

  const handleCopyCurrentModelJson = useCallback(() => {
    try {
      const jsonStr = JSON.stringify(model, null, 2);
      navigator.clipboard.writeText(jsonStr);
      setCopyNotice('JSON модели скопирован!');
      setTimeout(() => setCopyNotice(null), 2500);
    } catch (err) {
      console.error('Failed to copy model JSON:', err);
    }
  }, [model]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setNewModelJson(text);
        setNewModelError(null);
      }
    } catch (err) {
      setNewModelError('Не удалось прочитать буфер обмена');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setNewModelJson(content);
        setNewModelError(null);
      }
    };
    reader.onerror = () => {
      setNewModelError('Ошибка чтения файла');
    };
    reader.readAsText(file);
  };

  const handleCreateNewModel = () => {
    setNewModelError(null);

    let parsedCubes: PolyObjectCube[] = [];
    let parsedName = newModelName.trim();
    let parsedId = '';

    if (createMode === 'json' || newModelJson.trim().length > 0) {
      if (!newModelJson.trim()) {
        setNewModelError('Вставьте JSON код модели');
        return;
      }

      try {
        const data = JSON.parse(newModelJson.trim());
        if (data && typeof data === 'object') {
          if (Array.isArray(data)) {
            parsedCubes = data;
          } else if (Array.isArray(data.cubes)) {
            parsedCubes = data.cubes;
            if (data.name && !parsedName) {
              parsedName = data.name;
            }
            if (data.id) {
              parsedId = data.id;
            }
          } else if (data.offset && data.size) {
            parsedCubes = [data as PolyObjectCube];
          } else {
            setNewModelError('В JSON не найдено массива cubes или параметров объекта');
            return;
          }
        } else {
          setNewModelError('Некорректный JSON формат');
          return;
        }
      } catch (err: any) {
        setNewModelError(`Ошибка синтаксиса JSON: ${err?.message || 'невалидный код'}`);
        return;
      }
    }

    if (!parsedName) {
      parsedName = 'Новая модель';
    }

    const baseId = parsedId || parsedName.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'model';
    let safeId = baseId;
    let counter = 1;
    while (modelMap[safeId]) {
      safeId = `${baseId}_${counter}`;
      counter++;
    }

    const newM: PolyObjectModel = {
      id: safeId,
      name: parsedName,
      cubes: parsedCubes,
    };

    registerPolyModel(newM);
    setModelMap(prev => ({ ...prev, [safeId]: newM }));
    setActiveModelId(safeId);
    setModel(newM);
    modelRef.current = newM;
    setSelectedCubeIndices([]);
    setSelectedVertexIdxs([]);
    setSelectedEdgePairs([]);
    setSelectedFaceTarget('all');
    setHistory([newM]);
    setHistoryIdx(0);
    historyRef.current = [newM];
    historyIdxRef.current = 0;
    setNewModelModal(false);
    setNewModelName('');
    setNewModelJson('');
    setNewModelError(null);
  };

  const handleSaveModel = () => {
    registerPolyModel(model);
    setModelMap(prev => ({ ...prev, [model.id]: model }));
    if (onSelectModel) {
      onSelectModel(model.id, model);
    }
  };

  // Extract unique colors used in current model cubes
  const usedColors = useMemo<string[]>(() => {
    const set = new Set<string>();
    model.cubes.forEach(c => {
      if (c.color) set.add(c.color);
      if (c.faceColors) {
        Object.values(c.faceColors).forEach(fc => {
          if (fc && typeof fc === 'string') set.add(fc);
        });
      }
    });
    return Array.from(set);
  }, [model]);

  // High performance 3D Projection math
  const projectPoint = useCallback((
    x: number, y: number, z: number,
    cam: CameraState,
    w: number, h: number
  ) => {
    // 1. Rotate around Z (Yaw)
    const rx = x * Math.cos(cam.yaw) - y * Math.sin(cam.yaw);
    const ry = x * Math.sin(cam.yaw) + y * Math.cos(cam.yaw);
    const rz = z;

    // 2. Rotate around X (Pitch)
    const vx = rx;
    const vy = ry * Math.sin(cam.pitch) + rz * Math.cos(cam.pitch);
    const vz = ry * Math.cos(cam.pitch) - rz * Math.sin(cam.pitch);

    // 3. Screen coordinates
    const sx = w / 2 + cam.panX + vx * cam.zoom;
    const sy = h / 2 + cam.panY - vy * cam.zoom;

    return { x: sx, y: sy, depth: vz };
  }, []);

  // Helper to extract 3D vertices array [x,y,z][] for any cube/shape
  const getCubeVertices3D = useCallback((cube: PolyObjectCube): [number, number, number][] => {
    if (cube.vertices && cube.vertices.length > 0) {
      return cube.vertices.map(v => [v[0], v[1], v[2]]);
    }
    const [ox, oy, oz] = getCubeOffset(cube);
    const [sx, sy, sz] = getCubeSize(cube);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    return [
      [ox - hx, oy - hy, oz - hz], // 0
      [ox + hx, oy - hy, oz - hz], // 1
      [ox + hx, oy + hy, oz - hz], // 2
      [ox - hx, oy + hy, oz - hz], // 3
      [ox - hx, oy - hy, oz + hz], // 4
      [ox + hx, oy - hy, oz + hz], // 5
      [ox + hx, oy + hy, oz + hz], // 6
      [ox - hx, oy + hy, oz + hz], // 7
    ];
  }, []);

  // Helper to extract unique edges array [[v1, v2], ...]
  const getCubeEdgesList = useCallback((cube: PolyObjectCube): [number, number][] => {
    if (cube.customFaces && cube.customFaces.length > 0) {
      const edgeSet = new Set<string>();
      const result: [number, number][] = [];
      cube.customFaces.forEach(face => {
        const v = face.vertices;
        for (let i = 0; i < v.length; i++) {
          const a = v[i];
          const b = v[(i + 1) % v.length];
          const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            result.push([a, b]);
          }
        }
      });
      return result;
    }
    return [
      [0,1], [1,2], [2,3], [3,0],
      [4,5], [5,6], [6,7], [7,4],
      [0,4], [1,5], [2,6], [3,7]
    ];
  }, []);

  // Subdivide Selected Edge / Add Vertex on Edge & Enable Sliding
  const handleAddVertexOnEdge = useCallback(() => {
    if (selectedCubeIdx === null) return;
    const currentModel = modelRef.current;
    const cube = currentModel.cubes[selectedCubeIdx];
    if (!cube) return;

    let targetEdge: [number, number] | null = null;
    if (selectedEdgePairs.length > 0) {
      targetEdge = selectedEdgePairs[0];
    } else if (selectedVertexIdxs.length === 2) {
      targetEdge = [selectedVertexIdxs[0], selectedVertexIdxs[1]];
    }

    if (!targetEdge) return;

    const verts = getCubeVertices3D(cube);
    const updatedVerts = [...verts];
    const v1 = verts[targetEdge[0]];
    const v2 = verts[targetEdge[1]];
    if (!v1 || !v2) return;

    const midVert: [number, number, number] = [
      Math.round(((v1[0] + v2[0]) / 2) * 1000) / 1000,
      Math.round(((v1[1] + v2[1]) / 2) * 1000) / 1000,
      Math.round(((v1[2] + v2[2]) / 2) * 1000) / 1000,
    ];
    const midIdx = updatedVerts.length;
    updatedVerts.push(midVert);

    let customFaces = cube.customFaces && cube.customFaces.length > 0
      ? [...cube.customFaces]
      : [
          { vertices: [4, 5, 6, 7], name: 'top' },
          { vertices: [0, 3, 2, 1], name: 'bottom' },
          { vertices: [3, 7, 6, 2], name: 'front' },
          { vertices: [0, 1, 5, 4], name: 'back' },
          { vertices: [0, 4, 7, 3], name: 'left' },
          { vertices: [1, 2, 6, 5], name: 'right' },
        ];

    const newFaces = customFaces.map(f => {
      const vLoop = [...f.vertices];
      const N = vLoop.length;
      if (N < 2) return f;
      let insertIndex = -1;
      for (let i = 0; i < N; i++) {
        const a = vLoop[i];
        const b = vLoop[(i + 1) % N];
        if ((a === targetEdge![0] && b === targetEdge![1]) || (a === targetEdge![1] && b === targetEdge![0])) {
          insertIndex = i + 1;
          break;
        }
      }
      if (insertIndex !== -1) {
        if (insertIndex === N) {
          vLoop.push(midIdx);
        } else {
          vLoop.splice(insertIndex, 0, midIdx);
        }
      }
      return { ...f, vertices: vLoop };
    });

    const updatedCubes = [...currentModel.cubes];
    updatedCubes[selectedCubeIdx] = {
      ...cube,
      vertices: updatedVerts,
      customFaces: newFaces,
    };

    const updatedModel = { ...currentModel, cubes: updatedCubes };
    setModel(updatedModel);
    modelRef.current = updatedModel;
    recordState(updatedModel);

    // Active Edge Constraint for Edge Sliding
    activeEdgeConstraintRef.current = {
      v1Idx: targetEdge[0],
      v2Idx: targetEdge[1],
      v1Pos: [...v1] as [number, number, number],
      v2Pos: [...v2] as [number, number, number],
    };

    setSelectedEdgePairs([]);
    setSelectedVertexIdxs([midIdx]);
    dragVertexIdxsRef.current = [midIdx];
    setSelectionMode('vertex');
    setIsEdgeSlideEnabled(true);
  }, [selectedCubeIdx, selectedEdgePairs, selectedVertexIdxs, getCubeVertices3D, recordState]);

  const handleSubdivideEdge = handleAddVertexOnEdge;

  // Connect Selected Vertices with an Edge / Split Face along Edge
  const handleConnectVertices = useCallback(() => {
    if (selectedCubeIdx === null) return;
    const currentModel = modelRef.current;
    const cube = currentModel.cubes[selectedCubeIdx];
    if (!cube) return;

    if (selectedVertexIdxs.length < 2) return;

    const verts = getCubeVertices3D(cube);
    if (verts.length < 2) return;

    let customFaces = cube.customFaces && cube.customFaces.length > 0
      ? [...cube.customFaces]
      : [
          { vertices: [4, 5, 6, 7], name: 'top' },
          { vertices: [0, 3, 2, 1], name: 'bottom' },
          { vertices: [3, 7, 6, 2], name: 'front' },
          { vertices: [0, 1, 5, 4], name: 'back' },
          { vertices: [0, 4, 7, 3], name: 'left' },
          { vertices: [1, 2, 6, 5], name: 'right' },
        ];

    let modified = false;

    if (selectedVertexIdxs.length === 2) {
      const [vA, vB] = selectedVertexIdxs;
      if (vA === vB) return;

      const updatedFaces: typeof customFaces = [];

      for (const face of customFaces) {
        const vList = face.vertices;
        const idxA = vList.indexOf(vA);
        const idxB = vList.indexOf(vB);

        if (idxA !== -1 && idxB !== -1 && vList.length >= 4) {
          const minIdx = Math.min(idxA, idxB);
          const maxIdx = Math.max(idxA, idxB);
          const n = vList.length;

          const isAdjacent = (maxIdx - minIdx === 1) || (minIdx === 0 && maxIdx === n - 1);

          if (!isAdjacent) {
            // Split face into 2 sub-faces along edge (vA, vB)
            const f1Verts = vList.slice(minIdx, maxIdx + 1);
            const f2Verts = [...vList.slice(maxIdx), ...vList.slice(0, minIdx + 1)];

            if (f1Verts.length >= 3 && f2Verts.length >= 3) {
              updatedFaces.push({ ...face, vertices: f1Verts });
              updatedFaces.push({ ...face, vertices: f2Verts });
              modified = true;
              continue;
            }
          }
        }
        updatedFaces.push(face);
      }

      if (!modified) {
        // Check if edge (vA, vB) already exists in any face
        let edgeExists = false;
        for (const face of customFaces) {
          const v = face.vertices;
          for (let i = 0; i < v.length; i++) {
            const a = v[i];
            const b = v[(i + 1) % v.length];
            if ((a === vA && b === vB) || (a === vB && b === vA)) {
              edgeExists = true;
              break;
            }
          }
          if (edgeExists) break;
        }

        if (!edgeExists) {
          updatedFaces.push({ vertices: [vA, vB] });
          modified = true;
        }
      }

      customFaces = updatedFaces;
    } else if (selectedVertexIdxs.length >= 3) {
      const newVerts = [...selectedVertexIdxs];
      const sameFaceExists = customFaces.some(f => {
        if (f.vertices.length !== newVerts.length) return false;
        const setA = new Set(f.vertices);
        return newVerts.every(v => setA.has(v));
      });

      if (!sameFaceExists) {
        customFaces.push({ vertices: newVerts });
        modified = true;
      }
    }

    if (modified) {
      const updatedCubes = [...currentModel.cubes];
      updatedCubes[selectedCubeIdx] = {
        ...cube,
        customFaces,
      };

      const updatedModel = { ...currentModel, cubes: updatedCubes };
      setModel(updatedModel);
      modelRef.current = updatedModel;
      recordState(updatedModel);
    }
  }, [selectedCubeIdx, selectedVertexIdxs, getCubeVertices3D, recordState]);

  // Delete selected vertex
  const handleDeleteSelectedVertex = useCallback(() => {
    if (selectedCubeIdx === null || selectedVertexIdxs.length === 0) return;
    const currentModel = modelRef.current;
    const cube = currentModel.cubes[selectedCubeIdx];
    if (!cube) return;

    const verts = getCubeVertices3D(cube);
    if (verts.length <= 3) return;

    const removeSet = new Set(selectedVertexIdxs);
    const updatedVerts = verts.filter((_, idx) => !removeSet.has(idx));

    const indexMap = new Map<number, number>();
    let newIdxCounter = 0;
    for (let i = 0; i < verts.length; i++) {
      if (!removeSet.has(i)) {
        indexMap.set(i, newIdxCounter++);
      }
    }

    let customFaces = cube.customFaces ? [...cube.customFaces] : [
      { vertices: [4, 5, 6, 7], name: 'top' },
      { vertices: [0, 3, 2, 1], name: 'bottom' },
      { vertices: [3, 7, 6, 2], name: 'front' },
      { vertices: [0, 1, 5, 4], name: 'back' },
      { vertices: [0, 4, 7, 3], name: 'left' },
      { vertices: [1, 2, 6, 5], name: 'right' },
    ];

    const newFaces = customFaces
      .map(f => ({
        ...f,
        vertices: f.vertices.filter(vIdx => !removeSet.has(vIdx)).map(vIdx => indexMap.get(vIdx)!)
      }))
      .filter(f => f.vertices.length >= 3);

    const updatedCubes = [...currentModel.cubes];
    updatedCubes[selectedCubeIdx] = {
      ...cube,
      vertices: updatedVerts,
      customFaces: newFaces,
    };

    const updatedModel = { ...currentModel, cubes: updatedCubes };
    setModel(updatedModel);
    modelRef.current = updatedModel;
    recordState(updatedModel);
    setSelectedVertexIdxs([]);
  }, [selectedCubeIdx, selectedVertexIdxs, getCubeVertices3D, recordState]);

  // Retopologize selected mesh / cube (Fix topology: re-triangulate complex multi-vertex N-gons)
  const handleRetopologizeMesh = useCallback(() => {
    const currentModel = modelRef.current;
    if (!currentModel.cubes || currentModel.cubes.length === 0) return;

    const targetIndices = selectedCubeIndices.length > 0
      ? selectedCubeIndices
      : (selectedCubeIdx !== null ? [selectedCubeIdx] : currentModel.cubes.map((_, i) => i));

    if (targetIndices.length === 0) return;

    const retopologizeCube = (cube: PolyObjectCube): PolyObjectCube => {
      if (!cube.customFaces || cube.customFaces.length === 0) return cube;
      const verts3D = getCubeVertices3D(cube);

      const newCustomFaces: PolyCustomFace[] = [];

      cube.customFaces.forEach(f => {
        if (f.vertices.length <= 3) {
          newCustomFaces.push(f);
          return;
        }

        const faceVerts = f.vertices.map(idx => verts3D[idx]).filter(Boolean);
        if (faceVerts.length < 3) return;

        let nx = 0, ny = 0, nz = 0;
        const numV = faceVerts.length;
        for (let i = 0; i < numV; i++) {
          const curr = faceVerts[i];
          const next = faceVerts[(i + 1) % numV];
          nx += (curr[1] - next[1]) * (curr[2] + next[2]);
          ny += (curr[2] - next[2]) * (curr[0] + next[0]);
          nz += (curr[0] - next[0]) * (curr[1] + next[1]);
        }

        const absX = Math.abs(nx);
        const absY = Math.abs(ny);
        const absZ = Math.abs(nz);

        const pts2D: [number, number][] = faceVerts.map(v => {
          if (absZ >= absX && absZ >= absY) return [v[0], v[1]];
          if (absY >= absX && absY >= absZ) return [v[0], v[2]];
          return [v[1], v[2]];
        });

        const tris = triangulate2DPolygon(pts2D);

        if (tris.length > 0) {
          tris.forEach((t, triIdx) => {
            newCustomFaces.push({
              ...f,
              vertices: [f.vertices[t[0]], f.vertices[t[1]], f.vertices[t[2]]],
              name: `${f.name || 'face'}_retopo_${triIdx}`
            });
          });
        } else {
          newCustomFaces.push(f);
        }
      });

      return {
        ...cube,
        customFaces: newCustomFaces
      };
    };

    const updatedCubes = currentModel.cubes.map((c, i) =>
      targetIndices.includes(i) ? retopologizeCube(c) : c
    );

    const updatedModel = { ...currentModel, cubes: updatedCubes };
    setModel(updatedModel);
    modelRef.current = updatedModel;
    recordState(updatedModel);
  }, [selectedCubeIndices, selectedCubeIdx, getCubeVertices3D, recordState]);

  // Compute all projected polygons for drawing & raycasting
  const projectedPolygons = useMemo<ProjectedPolygon[]>(() => {
    if (isFreeformDrawing) {
      return []; // Hide existing model objects when drawing 2D freeform shape
    }

    const width = viewportSize.width || (canvasRef.current ? canvasRef.current.width : 0);
    const height = viewportSize.height || (canvasRef.current ? canvasRef.current.height : 0);
    if (!width || !height) return [];

    const polygons: ProjectedPolygon[] = [];
    const cosYaw = Math.cos(camera.yaw);
    const sinYaw = Math.sin(camera.yaw);
    const cosPitch = Math.cos(camera.pitch);
    const sinPitch = Math.sin(camera.pitch);

    // 1. Precalculate 3D AABB bounds for all cubes for occlusion testing
    const cubeBounds = model.cubes.map(cube => {
      const [ox, oy, oz] = getCubeOffset(cube);
      const [dx, dy, dz] = getCubeSize(cube);
      return {
        minX: ox - dx / 2, maxX: ox + dx / 2,
        minY: oy - dy / 2, maxY: oy + dy / 2,
        minZ: oz - dz / 2, maxZ: oz + dz / 2,
      };
    });

    // Helper to check if a face of cubeIdx is entirely covered by another adjacent cube
    const isFaceOccluded = (
      cubeIdx: number,
      faceType: ProjectedPolygon['faceType']
    ): boolean => {
      const target = cubeBounds[cubeIdx];
      if (!target) return false;
      const eps = 1e-4;

      for (let i = 0; i < cubeBounds.length; i++) {
        if (i === cubeIdx) continue;
        const b = cubeBounds[i];

        switch (faceType) {
          case 'top': {
            const faceZ = target.maxZ;
            if (b.minZ <= faceZ + eps && b.maxZ >= faceZ - eps) {
              if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                  b.minY <= target.minY + eps && b.maxY >= target.maxY - eps) {
                return true;
              }
            }
            break;
          }
          case 'bottom': {
            const faceZ = target.minZ;
            if (b.minZ <= faceZ + eps && b.maxZ >= faceZ - eps) {
              if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                  b.minY <= target.minY + eps && b.maxY >= target.maxY - eps) {
                return true;
              }
            }
            break;
          }
          case 'front': {
            const faceY = target.maxY;
            if (b.minY <= faceY + eps && b.maxY >= faceY - eps) {
              if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                  b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
                return true;
              }
            }
            break;
          }
          case 'back': {
            const faceY = target.minY;
            if (b.minY <= faceY + eps && b.maxY >= faceY - eps) {
              if (b.minX <= target.minX + eps && b.maxX >= target.maxX - eps &&
                  b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
                return true;
              }
            }
            break;
          }
          case 'left': {
            const faceX = target.minX;
            if (b.minX <= faceX + eps && b.maxX >= faceX - eps) {
              if (b.minY <= target.minY + eps && b.maxY >= target.maxY - eps &&
                  b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
                return true;
              }
            }
            break;
          }
          case 'right': {
            const faceX = target.maxX;
            if (b.minX <= faceX + eps && b.maxX >= faceX - eps) {
              if (b.minY <= target.minY + eps && b.maxY >= target.maxY - eps &&
                  b.minZ <= target.minZ + eps && b.maxZ >= target.maxZ - eps) {
                return true;
              }
            }
            break;
          }
        }
      }
      return false;
    };

    model.cubes.forEach((cube, cubeIdx) => {
      const baseColor = cube.color || '#8B5A2B';
      const fc = cube.faceColors || {};

      const verts3D = getCubeVertices3D(cube);
      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, width, height));

      const customFaces = cube.customFaces && cube.customFaces.length > 0
        ? cube.customFaces
        : [
            { vertices: [4, 5, 6, 7], name: 'top' },
            { vertices: [0, 3, 2, 1], name: 'bottom' },
            { vertices: [3, 7, 6, 2], name: 'front' },
            { vertices: [0, 1, 5, 4], name: 'back' },
            { vertices: [0, 4, 7, 3], name: 'left' },
            { vertices: [1, 2, 6, 5], name: 'right' },
          ];

      customFaces.forEach(f => {
        const faceVertIndices = f.vertices;
        if (faceVertIndices.length < 3) return;

        const pts = faceVertIndices.map(idx => projVerts[idx]).filter(Boolean);
        if (pts.length < 3) return;

        const faceName = (f.name as any) || 'custom';
        if (!isWireframe && isFaceOccluded(cubeIdx, faceName)) return;

        // Calculate 3D geometric normal using Newell's Method (supports N >= 3 vertices and collinear edge points)
        const faceVerts3D = faceVertIndices.map(idx => verts3D[idx]).filter(Boolean);
        let norm3D: [number, number, number] = [0, 0, 1];
        if (faceVerts3D.length >= 3) {
          let nx = 0, ny = 0, nz = 0;
          const numV = faceVerts3D.length;
          for (let i = 0; i < numV; i++) {
            const curr = faceVerts3D[i];
            const next = faceVerts3D[(i + 1) % numV];
            nx += (curr[1] - next[1]) * (curr[2] + next[2]);
            ny += (curr[2] - next[2]) * (curr[0] + next[0]);
            nz += (curr[0] - next[0]) * (curr[1] + next[1]);
          }
          const len = Math.hypot(nx, ny, nz);
          if (len > 1e-6) {
            norm3D = [nx / len, ny / len, nz / len];
          }
        }

        // Backface culling calculation
        const nx1 = norm3D[0] * cosYaw - norm3D[1] * sinYaw;
        const ny1 = norm3D[0] * sinYaw + norm3D[1] * cosYaw;
        const nz1 = norm3D[2];
        const nDepth = ny1 * cosPitch - nz1 * sinPitch;
        const isBackface = !f.isInner && nDepth >= -1e-5;

        // Skip backfacing faces (unless marked as inner/two-sided OR wireframe mode)
        if (!isWireframe && isBackface) return;

        const avgDepth = pts.reduce((sum, p) => sum + p.depth, 0) / pts.length;
        const minDepth = Math.min(...pts.map(p => p.depth));
        const maxDepth = Math.max(...pts.map(p => p.depth));

        const screenX = pts.map(p => p.x);
        const screenY = pts.map(p => p.y);
        const minPx = Math.min(...screenX);
        const maxPx = Math.max(...screenX);
        const minPy = Math.min(...screenY);
        const maxPy = Math.max(...screenY);

        // Plane equation coefficients in screen space using Newell's Method
        let pnx = 0, pny = 0, pnz = 0;
        const numPts = pts.length;
        for (let i = 0; i < numPts; i++) {
          const pCurr = pts[i];
          const pNext = pts[(i + 1) % numPts];
          pnx += (pCurr.y - pNext.y) * (pCurr.depth + pNext.depth);
          pny += (pCurr.depth - pNext.depth) * (pCurr.x + pNext.x);
          pnz += (pCurr.x - pNext.x) * (pCurr.y + pNext.y);
        }

        let planeA = 0, planeB = 0, planeC = avgDepth;
        if (Math.abs(pnz) > 1e-6) {
          planeA = -pnx / pnz;
          planeB = -pny / pnz;
          const avgX = pts.reduce((s, p) => s + p.x, 0) / numPts;
          const avgY = pts.reduce((s, p) => s + p.y, 0) / numPts;
          planeC = avgDepth - planeA * avgX - planeB * avgY;
        }

        const colorFactor = Math.max(0.35, Math.min(1.4, 0.75 + (norm3D[0] * 0.2 + norm3D[1] * 0.35 + norm3D[2] * 0.45)));
        const customColor = (fc as any)[faceName] || f.color;
        const color = customColor ? adjustColor(customColor, colorFactor) : adjustColor(baseColor, colorFactor);
        const faceTex = cube.faceTextures?.[faceName] || f.textureId || cube.textureId || null;
        const faceLayers =
          cube.faceTextureLayers?.[faceName as keyof typeof cube.faceTextureLayers] ||
          f.textureLayers ||
          cube.textureLayers ||
          null;
        const rawFaceUVs = computeFaceUVs(faceVerts3D);
        const faceTransform =
          cube.faceTransforms?.[faceName as keyof typeof cube.faceTransforms] ||
          f.textureTransform ||
          cube.textureTransform;
        const faceUVs = applyTextureTransformToUVs(rawFaceUVs, faceTransform);

        polygons.push({
          cubeIndex: cubeIdx,
          faceType: faceName,
          points: pts.map(p => ({ x: p.x, y: p.y })),
          uvs: faceUVs,
          rawUVs: rawFaceUVs,
          depth: avgDepth,
          minDepth,
          maxDepth,
          minX: minPx,
          maxX: maxPx,
          minY: minPy,
          maxY: maxPy,
          planeA,
          planeB,
          planeC,
          color,
          sideFactor: colorFactor,
          textureId: faceTex,
          textureLayers: faceLayers,
          isBackface,
        });
      });
    });

    // Precise depth sorting (furthest first -> largest depth first)
    polygons.sort((polyA, polyB) => {
      // 1. Strict depth bound separation check
      if (polyA.maxDepth < polyB.minDepth) {
        return 1; // polyA is strictly closer to camera -> polyB drawn first
      }
      if (polyB.maxDepth < polyA.minDepth) {
        return -1; // polyB is strictly closer to camera -> polyA drawn first
      }

      // 2. 2D Screen bounding box overlap check
      const oMinX = Math.max(polyA.minX, polyB.minX);
      const oMaxX = Math.min(polyA.maxX, polyB.maxX);
      const oMinY = Math.max(polyA.minY, polyB.minY);
      const oMaxY = Math.min(polyA.maxY, polyB.maxY);

      if (oMinX < oMaxX && oMinY < oMaxY) {
        const cx = (oMinX + oMaxX) / 2;
        const cy = (oMinY + oMaxY) / 2;

        const depthA = polyA.planeA * cx + polyA.planeB * cy + polyA.planeC;
        const depthB = polyB.planeA * cx + polyB.planeB * cy + polyB.planeC;

        // Verify plane equation evaluation falls within valid polygon depth bounds
        const validA = depthA >= polyA.minDepth - 0.5 && depthA <= polyA.maxDepth + 0.5;
        const validB = depthB >= polyB.minDepth - 0.5 && depthB <= polyB.maxDepth + 0.5;

        if (validA && validB && Math.abs(depthB - depthA) > 1e-4) {
          return depthB - depthA;
        }
      }

      // Fallback to average depth
      return polyB.depth - polyA.depth;
    });

    return polygons;
  }, [model, camera, projectPoint, viewportSize, isWireframe]);

  // Point in polygon hit testing
  const isPointInPoly = (px: number, py: number, points: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Canvas render loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#0b0f19'; // dark slate
    ctx.fillRect(0, 0, width, height);

    // Render floor grid plane (at Z = 0)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 10;
    const step = 0.1;
    for (let i = -gridSize; i <= gridSize; i++) {
      const p1 = projectPoint(i * step, -gridSize * step, 0, camera, width, height);
      const p2 = projectPoint(i * step, gridSize * step, 0, camera, width, height);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const p3 = projectPoint(-gridSize * step, i * step, 0, camera, width, height);
      const p4 = projectPoint(gridSize * step, i * step, 0, camera, width, height);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }

    // Origin world axes lines
    const origin = projectPoint(0, 0, 0, camera, width, height);
    const axisX = projectPoint(0.4, 0, 0, camera, width, height);
    const axisY = projectPoint(0, 0.4, 0, camera, width, height);
    const axisZ = projectPoint(0, 0, 0.4, camera, width, height);

    ctx.lineWidth = 2;
    // X - Red
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(axisX.x, axisX.y); ctx.stroke();
    // Y - Green
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(axisY.x, axisY.y); ctx.stroke();
    // Z - Blue
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(axisZ.x, axisZ.y); ctx.stroke();

    ctx.restore();

    // Render 2D Magnet View Grid Overlay when Magnet is active in fixed orthographic view
    if (isSnapEnabled && activeFixedPreset !== null) {
      const axisInfo = FIXED_VIEW_AXES[activeFixedPreset];
      if (axisInfo) {
        const { hAxis, vAxis, dAxis } = axisInfo;
        const depthVal = selectedCubeIdx !== null && model.cubes[selectedCubeIdx]
          ? model.cubes[selectedCubeIdx].offset[dAxis]
          : 0;

        ctx.save();

        const halfW = (width / (camera.zoom * 2)) + 0.5;
        const halfH = (height / (camera.zoom * 2)) + 0.5;
        const panH = -camera.panX / camera.zoom;
        const panV = camera.panY / camera.zoom;

        const startH = Math.floor((panH - halfW) / gridStep) * gridStep;
        const endH = Math.ceil((panH + halfW) / gridStep) * gridStep;
        const startV = Math.floor((panV - halfH) / gridStep) * gridStep;
        const endV = Math.ceil((panV + halfH) / gridStep) * gridStep;

        const limitStartH = Math.max(-10, startH);
        const limitEndH = Math.min(10, endH);
        const limitStartV = Math.max(-10, startV);
        const limitEndV = Math.min(10, endV);

        // 1. Minor grid lines
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)'; // Amber minor lines

        // Vertical lines (along hAxis)
        for (let h = limitStartH; h <= limitEndH + 1e-5; h += gridStep) {
          const rH = Math.round(h * 1000) / 1000;
          const isMajor = Math.abs((rH / (gridStep * 5)) - Math.round(rH / (gridStep * 5))) < 1e-4;
          const isOrigin = Math.abs(rH) < 1e-4;
          if (isMajor || isOrigin) continue;

          const p1Arr: [number, number, number] = [0, 0, 0]; const p2Arr: [number, number, number] = [0, 0, 0];
          p1Arr[hAxis] = rH; p1Arr[vAxis] = limitStartV; p1Arr[dAxis] = depthVal;
          p2Arr[hAxis] = rH; p2Arr[vAxis] = limitEndV;   p2Arr[dAxis] = depthVal;

          const p1 = projectPoint(p1Arr[0], p1Arr[1], p1Arr[2], camera, width, height);
          const p2 = projectPoint(p2Arr[0], p2Arr[1], p2Arr[2], camera, width, height);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }

        // Horizontal lines (along vAxis)
        for (let v = limitStartV; v <= limitEndV + 1e-5; v += gridStep) {
          const rV = Math.round(v * 1000) / 1000;
          const isMajor = Math.abs((rV / (gridStep * 5)) - Math.round(rV / (gridStep * 5))) < 1e-4;
          const isOrigin = Math.abs(rV) < 1e-4;
          if (isMajor || isOrigin) continue;

          const p1Arr: [number, number, number] = [0, 0, 0]; const p2Arr: [number, number, number] = [0, 0, 0];
          p1Arr[hAxis] = limitStartH; p1Arr[vAxis] = rV; p1Arr[dAxis] = depthVal;
          p2Arr[hAxis] = limitEndH;   p2Arr[vAxis] = rV; p2Arr[dAxis] = depthVal;

          const p1 = projectPoint(p1Arr[0], p1Arr[1], p1Arr[2], camera, width, height);
          const p2 = projectPoint(p2Arr[0], p2Arr[1], p2Arr[2], camera, width, height);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }

        // 2. Major grid lines (every 5 steps)
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';

        for (let h = limitStartH; h <= limitEndH + 1e-5; h += gridStep) {
          const rH = Math.round(h * 1000) / 1000;
          const isMajor = Math.abs((rH / (gridStep * 5)) - Math.round(rH / (gridStep * 5))) < 1e-4;
          const isOrigin = Math.abs(rH) < 1e-4;
          if (!isMajor || isOrigin) continue;

          const p1Arr: [number, number, number] = [0, 0, 0]; const p2Arr: [number, number, number] = [0, 0, 0];
          p1Arr[hAxis] = rH; p1Arr[vAxis] = limitStartV; p1Arr[dAxis] = depthVal;
          p2Arr[hAxis] = rH; p2Arr[vAxis] = limitEndV;   p2Arr[dAxis] = depthVal;

          const p1 = projectPoint(p1Arr[0], p1Arr[1], p1Arr[2], camera, width, height);
          const p2 = projectPoint(p2Arr[0], p2Arr[1], p2Arr[2], camera, width, height);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }

        for (let v = limitStartV; v <= limitEndV + 1e-5; v += gridStep) {
          const rV = Math.round(v * 1000) / 1000;
          const isMajor = Math.abs((rV / (gridStep * 5)) - Math.round(rV / (gridStep * 5))) < 1e-4;
          const isOrigin = Math.abs(rV) < 1e-4;
          if (!isMajor || isOrigin) continue;

          const p1Arr: [number, number, number] = [0, 0, 0]; const p2Arr: [number, number, number] = [0, 0, 0];
          p1Arr[hAxis] = limitStartH; p1Arr[vAxis] = rV; p1Arr[dAxis] = depthVal;
          p2Arr[hAxis] = limitEndH;   p2Arr[vAxis] = rV; p2Arr[dAxis] = depthVal;

          const p1 = projectPoint(p1Arr[0], p1Arr[1], p1Arr[2], camera, width, height);
          const p2 = projectPoint(p2Arr[0], p2Arr[1], p2Arr[2], camera, width, height);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }

        // 3. Main origin lines
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';

        const pOriginV1: [number, number, number] = [0, 0, 0]; const pOriginV2: [number, number, number] = [0, 0, 0];
        pOriginV1[hAxis] = 0; pOriginV1[vAxis] = limitStartV; pOriginV1[dAxis] = depthVal;
        pOriginV2[hAxis] = 0; pOriginV2[vAxis] = limitEndV;   pOriginV2[dAxis] = depthVal;
        const ov1 = projectPoint(pOriginV1[0], pOriginV1[1], pOriginV1[2], camera, width, height);
        const ov2 = projectPoint(pOriginV2[0], pOriginV2[1], pOriginV2[2], camera, width, height);
        ctx.beginPath(); ctx.moveTo(ov1.x, ov1.y); ctx.lineTo(ov2.x, ov2.y); ctx.stroke();

        const pOriginH1: [number, number, number] = [0, 0, 0]; const pOriginH2: [number, number, number] = [0, 0, 0];
        pOriginH1[hAxis] = limitStartH; pOriginH1[vAxis] = 0; pOriginH1[dAxis] = depthVal;
        pOriginH2[hAxis] = limitEndH;   pOriginH2[vAxis] = 0; pOriginH2[dAxis] = depthVal;
        const oh1 = projectPoint(pOriginH1[0], pOriginH1[1], pOriginH1[2], camera, width, height);
        const oh2 = projectPoint(pOriginH2[0], pOriginH2[1], pOriginH2[2], camera, width, height);
        ctx.beginPath(); ctx.moveTo(oh1.x, oh1.y); ctx.lineTo(oh2.x, oh2.y); ctx.stroke();

        ctx.restore();
      }
    }

    // Render 3D Polygons
    projectedPolygons.forEach(poly => {
      if (poly.points.length < 3) return;

      const isSelectedCube = selectedCubeIndices.includes(poly.cubeIndex);
      const faceKey = `${poly.cubeIndex}:${poly.faceType}`;
      const isSelectedSpecificFace =
        selectedFaceTargetsRef.current.includes(faceKey) ||
        (isSelectedCube && selectedFaceTargetRef.current !== 'all' && poly.faceType === selectedFaceTargetRef.current);

      if (isWireframe) {
        ctx.beginPath();
        ctx.moveTo(poly.points[0].x, poly.points[0].y);
        for (let i = 1; i < poly.points.length; i++) {
          ctx.lineTo(poly.points[i].x, poly.points[i].y);
        }
        ctx.closePath();

        // Translucent face tint
        ctx.fillStyle = isSelectedSpecificFace
          ? 'rgba(253, 224, 71, 0.2)'
          : isSelectedCube
            ? 'rgba(56, 189, 248, 0.12)'
            : 'rgba(15, 23, 42, 0.35)';
        ctx.fill();

        // Edge wireframe stroke
        if (poly.isBackface) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = isSelectedCube ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148, 163, 184, 0.2)';
          ctx.lineWidth = 1;
        } else {
          ctx.setLineDash([]);
          if (isSelectedSpecificFace) {
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 3;
          } else if (isSelectedCube) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
          } else {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1.2;
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }

      let drewTexture = false;
      if (poly.textureId || (poly.textureLayers && poly.textureLayers.length > 0)) {
        const img = poly.textureId ? getPolyTextureImage(poly.textureId) : null;
        const quadPts: [number, number][] = poly.points.map(p => [p.x, p.y]);
        drawTexturedPolygonCanvas(
          ctx,
          quadPts,
          poly.uvs,
          img,
          poly.sideFactor,
          undefined,
          poly.textureLayers,
          undefined,
          poly.rawUVs,
          true
        );
        if (img || (poly.textureLayers && poly.textureLayers.some(l => l.enabled !== false && l.textureId))) {
          drewTexture = true;
        }
      }

      if (!drewTexture) {
        ctx.beginPath();
        ctx.moveTo(poly.points[0].x, poly.points[0].y);
        for (let i = 1; i < poly.points.length; i++) {
          ctx.lineTo(poly.points[i].x, poly.points[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = poly.color;
        ctx.fill();
      }

      // Border styling & targeted face highlight
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x, poly.points[0].y);
      for (let i = 1; i < poly.points.length; i++) {
        ctx.lineTo(poly.points[i].x, poly.points[i].y);
      }
      ctx.closePath();

      if (isSelectedCube) {
        if (isSelectedSpecificFace) {
          ctx.strokeStyle = '#fde047'; // bright yellow outline for active targeted face
          ctx.lineWidth = 3.2;
          ctx.stroke();

          ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#38bdf8'; // sky cyan outline for selected cube
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    });

    // Render Interactive Selected Cube Gizmo Handles (Supports Multi-Selection Group Bounds)
    if (selectedCubeIndices.length > 0) {
      const groupBounds = getGroupBoundingBox(model.cubes, selectedCubeIndices);
      if (groupBounds) {
        const [ox, oy, oz] = groupBounds.center;
        const [sx, sy, sz] = groupBounds.size;
        const hOffset = 0.12;

        const cCenter = projectPoint(ox, oy, oz, camera, width, height);

        if (activeTool === 'rotate_object') {
          const R = Math.max(sx, sy, sz) * 0.8 + 0.2;
          const xRing = getRingPoints('X', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));
          const yRing = getRingPoints('Y', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));
          const zRing = getRingPoints('Z', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));

          ctx.save();
          ctx.lineWidth = 4;

          // Render X Ring (Red)
          const isXHovered = hoveredGizmo === 'rotX';
          ctx.strokeStyle = isXHovered ? '#f87171' : '#ef4444';
          ctx.beginPath();
          ctx.moveTo(xRing[0].x, xRing[0].y);
          for (let i = 1; i < xRing.length; i++) {
            ctx.lineTo(xRing[i].x, xRing[i].y);
          }
          ctx.stroke();

          // Render Y Ring (Green)
          const isYHovered = hoveredGizmo === 'rotY';
          ctx.strokeStyle = isYHovered ? '#4ade80' : '#22c55e';
          ctx.beginPath();
          ctx.moveTo(yRing[0].x, yRing[0].y);
          for (let i = 1; i < yRing.length; i++) {
            ctx.lineTo(yRing[i].x, yRing[i].y);
          }
          ctx.stroke();

          // Render Z Ring (Blue)
          const isZHovered = hoveredGizmo === 'rotZ';
          ctx.strokeStyle = isZHovered ? '#60a5fa' : '#3b82f6';
          ctx.beginPath();
          ctx.moveTo(zRing[0].x, zRing[0].y);
          for (let i = 1; i < zRing.length; i++) {
            ctx.lineTo(zRing[i].x, zRing[i].y);
          }
          ctx.stroke();

          // Draw ring labels / buttons to make them look sophisticated and easy to click
          const drawRingLabel = (pt: { x: number; y: number }, label: string, isHovered: boolean, color: string) => {
            ctx.fillStyle = isHovered ? '#ffffff' : color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isHovered ? color : '#ffffff';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, pt.x, pt.y);
          };

          if (xRing.length > 0) drawRingLabel(xRing[Math.floor(xRing.length * 0.125)], 'RX', isXHovered, '#ef4444');
          if (yRing.length > 0) drawRingLabel(yRing[Math.floor(yRing.length * 0.375)], 'RY', isYHovered, '#22c55e');
          if (zRing.length > 0) drawRingLabel(zRing[Math.floor(zRing.length * 0.625)], 'RZ', isZHovered, '#3b82f6');

          ctx.restore();
        } else {
          const gxPlus = projectPoint(ox + sx / 2 + hOffset, oy, oz, camera, width, height);
          const gxMinus = projectPoint(ox - (sx / 2 + hOffset), oy, oz, camera, width, height);
          const gyPlus = projectPoint(ox, oy + sy / 2 + hOffset, oz, camera, width, height);
          const gyMinus = projectPoint(ox, oy - (sy / 2 + hOffset), oz, camera, width, height);
          const gzPlus = projectPoint(ox, oy, oz + sz / 2 + hOffset, camera, width, height);
          const gzMinus = projectPoint(ox, oy, oz - (sz / 2 + hOffset), camera, width, height);

          const fXPlus = projectPoint(ox + sx / 2, oy, oz, camera, width, height);
          const fXMinus = projectPoint(ox - sx / 2, oy, oz, camera, width, height);
          const fYPlus = projectPoint(ox, oy + sy / 2, oz, camera, width, height);
          const fYMinus = projectPoint(ox, oy - sy / 2, oz, camera, width, height);
          const fZPlus = projectPoint(ox, oy, oz + sz / 2, camera, width, height);
          const fZMinus = projectPoint(ox, oy, oz - sz / 2, camera, width, height);

          ctx.save();
          ctx.lineWidth = 3.5;

          // Draw lines from face centers to handles
          // X+ Line (Red)
          const isXPlusHovered = hoveredGizmo === 'X+' || hoveredGizmo === 'X';
          ctx.strokeStyle = activeAxes.X ? '#f87171' : (isXPlusHovered ? '#ff8888' : '#ef4444');
          ctx.beginPath(); ctx.moveTo(fXPlus.x, fXPlus.y); ctx.lineTo(gxPlus.x, gxPlus.y); ctx.stroke();

          // X- Line (Pinkish Red)
          const isXMinusHovered = hoveredGizmo === 'X-';
          ctx.strokeStyle = activeAxes.X ? '#f87171' : (isXMinusHovered ? '#ff8888' : '#dc2626');
          ctx.beginPath(); ctx.moveTo(fXMinus.x, fXMinus.y); ctx.lineTo(gxMinus.x, gxMinus.y); ctx.stroke();

          // Y+ Line (Green)
          const isYPlusHovered = hoveredGizmo === 'Y+' || hoveredGizmo === 'Y';
          ctx.strokeStyle = activeAxes.Y ? '#4ade80' : (isYPlusHovered ? '#86efac' : '#22c55e');
          ctx.beginPath(); ctx.moveTo(fYPlus.x, fYPlus.y); ctx.lineTo(gyPlus.x, gyPlus.y); ctx.stroke();

          // Y- Line (Dark Green)
          const isYMinusHovered = hoveredGizmo === 'Y-';
          ctx.strokeStyle = activeAxes.Y ? '#4ade80' : (isYMinusHovered ? '#86efac' : '#16a34a');
          ctx.beginPath(); ctx.moveTo(fYMinus.x, fYMinus.y); ctx.lineTo(gyMinus.x, gyMinus.y); ctx.stroke();

          // Z+ Line (Blue)
          const isZPlusHovered = hoveredGizmo === 'Z+' || hoveredGizmo === 'Z';
          ctx.strokeStyle = activeAxes.Z ? '#60a5fa' : (isZPlusHovered ? '#93c5fd' : '#3b82f6');
          ctx.beginPath(); ctx.moveTo(fZPlus.x, fZPlus.y); ctx.lineTo(gzPlus.x, gzPlus.y); ctx.stroke();

          // Z- Line (Cyan / Dark Blue)
          const isZMinusHovered = hoveredGizmo === 'Z-';
          ctx.strokeStyle = activeAxes.Z ? '#60a5fa' : (isZMinusHovered ? '#93c5fd' : '#2563eb');
          ctx.beginPath(); ctx.moveTo(fZMinus.x, fZMinus.y); ctx.lineTo(gzMinus.x, gzMinus.y); ctx.stroke();

          // Draw Center Sphere
          const isCenterHovered = hoveredGizmo === 'center';
          ctx.fillStyle = isCenterHovered ? '#fef08a' : '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cCenter.x, cCenter.y, isCenterHovered ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

          // Draw 6 Gizmo Handle Spheres & Axis Labels (+X, -X, +Y, -Y, +Z, -Z)
          const drawHandle = (pt: { x: number; y: number }, label: string, isHovered: boolean, fillCol: string) => {
            ctx.fillStyle = isHovered ? '#ffffff' : fillCol;
            ctx.strokeStyle = isHovered ? fillCol : '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, isHovered ? 9.5 : 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isHovered ? fillCol : '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, pt.x, pt.y);
          };

          drawHandle(gxPlus, '+X', isXPlusHovered, '#ef4444');
          drawHandle(gxMinus, '-X', isXMinusHovered, '#b91c1c');
          drawHandle(gyPlus, '+Y', isYPlusHovered, '#22c55e');
          drawHandle(gyMinus, '-Y', isYMinusHovered, '#15803d');
          drawHandle(gzPlus, '+Z', isZPlusHovered, '#3b82f6');
          drawHandle(gzMinus, '-Z', isZMinusHovered, '#1d4ed8');

          ctx.restore();
        }
      }
    }

    // Render Selected Cube Vertices & Edges (Blender Vertex / Edge Edit Mode)
    if (selectedCubeIdx !== null && model.cubes[selectedCubeIdx]) {
      const selectedCube = model.cubes[selectedCubeIdx];
      const verts3D = getCubeVertices3D(selectedCube);
      const edgesList = getCubeEdgesList(selectedCube);

      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, width, height));

      // Draw Edges (in Edge or Vertex selection mode)
      if (selectionMode === 'edge' || selectionMode === 'vertex') {
        ctx.save();
        edgesList.forEach(([v1Idx, v2Idx]) => {
          const p1 = projVerts[v1Idx];
          const p2 = projVerts[v2Idx];
          if (!p1 || !p2) return;

          const isEdgeSelected = selectedEdgePairs.some(pair => (pair[0] === v1Idx && pair[1] === v2Idx) || (pair[0] === v2Idx && pair[1] === v1Idx));
          const isEdgeHovered = hoveredEdgePair && ((hoveredEdgePair[0] === v1Idx && hoveredEdgePair[1] === v2Idx) || (hoveredEdgePair[0] === v2Idx && hoveredEdgePair[1] === v1Idx));

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);

          if (isEdgeSelected) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3.8;
          } else if (isEdgeHovered) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3.0;
          } else {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
            ctx.lineWidth = 1.8;
          }
          ctx.stroke();
        });
        ctx.restore();
      }

      // Draw Vertices
      if (selectionMode === 'vertex' || selectionMode === 'edge') {
        ctx.save();
        projVerts.forEach((p, idx) => {
          const isVertSelected = selectedVertexIdxs.includes(idx);
          const isVertHovered = hoveredVertexIdx === idx;

          ctx.beginPath();
          const radius = isVertSelected ? 8.5 : isVertHovered ? 7.5 : 5.5;
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);

          if (isVertSelected) {
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
          } else if (isVertHovered) {
            ctx.fillStyle = '#fde047';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2.0;
          } else {
            ctx.fillStyle = '#38bdf8';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.5;
          }
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }

      // Render Active Edge Slide Guide Rail & Magnet Snap Overlay
      if ((selectionMode === 'vertex' || selectionMode === 'edge') && isEdgeSlideEnabled && activeEdgeConstraintRef.current) {
        const { v1Pos, v2Pos } = activeEdgeConstraintRef.current;
        const p1 = projectPoint(v1Pos[0], v1Pos[1], v1Pos[2], camera, width, height);
        const p2 = projectPoint(v2Pos[0], v2Pos[1], v2Pos[2], camera, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)'; // amber guide rail
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      }

      if (snapIndicatorRef.current && isDraggingRef.current) {
        const { pos, label, type } = snapIndicatorRef.current;
        const projSnap = projectPoint(pos[0], pos[1], pos[2], camera, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.arc(projSnap.x, projSnap.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = type === 'vertex' ? '#f59e0b' : type === 'midpoint' ? '#38bdf8' : '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(projSnap.x, projSnap.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = type === 'vertex' ? '#fde047' : type === 'midpoint' ? '#7dd3fc' : '#4ade80';
        ctx.fill();

        ctx.font = 'bold 11px Jura, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(label, projSnap.x, projSnap.y - 16);
        ctx.restore();
      }
    }

    // Render 2D Freeform Overlay Drawing
    if (isFreeformDrawing && freeformPoints.length > 0) {
      ctx.save();
      const screenPts = freeformPoints.map(([wx, wy]) => projectPoint(wx, wy, 0, camera, width, height));

      if (freeformPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.8;
      ctx.stroke();

      if (freeformHoverPoint) {
        const lastScreenPt = screenPts[screenPts.length - 1];
        const hoverScreenPt = projectPoint(freeformHoverPoint[0], freeformHoverPoint[1], 0, camera, width, height);
        ctx.beginPath();
        ctx.moveTo(lastScreenPt.x, lastScreenPt.y);
        ctx.lineTo(hoverScreenPt.x, hoverScreenPt.y);
        ctx.strokeStyle = '#fbbf24';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      screenPts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, idx === 0 ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? '#22c55e' : '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((idx + 1).toString(), pt.x, pt.y - 14);
      });

      if (freeformPoints.length >= 3) {
        const firstPt = screenPts[0];
        ctx.beginPath();
        ctx.arc(firstPt.x, firstPt.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  }, [camera, projectedPolygons, selectedCubeIdx, selectedCubeIndices, model, activeAxes, hoveredGizmo, projectPoint, isSnapEnabled, activeFixedPreset, gridStep, selectionMode, selectedVertexIdxs, selectedEdgePairs, hoveredVertexIdx, hoveredEdgePair, getCubeVertices3D, getCubeEdgesList, isWireframe, getGroupBoundingBox, isFreeformDrawing, freeformPoints, freeformHoverPoint, selectedFaceTarget]);

  // Canvas resize observer & size state updater
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasRef.current.width = rect.width;
          canvasRef.current.height = rect.height;
          setViewportSize({ width: rect.width, height: rect.height });
        }
      }
    };
    handleResize();

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const unsubscribe = subscribeTextureLoaded(() => {
      renderCanvas();
    });
    return unsubscribe;
  }, [renderCanvas]);

  // Global Keyboard Shortcuts (Ctrl+A select all, Esc clear selection, Delete/Backspace remove selected)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input/textarea/select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (selectionMode === 'cube') {
          setSelectedCubeIndices(modelRef.current.cubes.map((_, i) => i));
        } else if (selectionMode === 'vertex' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
          const verts = getCubeVertices3D(modelRef.current.cubes[selectedCubeIdx]);
          setSelectedVertexIdxs(verts.map((_, i) => i));
        } else if (selectionMode === 'edge' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
          const edges = getCubeEdgesList(modelRef.current.cubes[selectedCubeIdx]);
          setSelectedEdgePairs(edges);
        }
      } else if (e.key === 'Escape') {
        setSelectedCubeIndices([]);
        setSelectedVertexIdxs([]);
        setSelectedEdgePairs([]);
        setSelectedFaceTarget('all');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionMode === 'cube' && (selectedCubeIndices.length > 0 || selectedCubeIdx !== null)) {
          e.preventDefault();
          handleDeleteCube();
        } else if (selectionMode === 'vertex' && selectedVertexIdxs.length > 0) {
          e.preventDefault();
          handleDeleteSelectedVertex();
        }
      } else if ((e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'j') && selectionMode === 'vertex' && selectedVertexIdxs.length >= 2) {
        e.preventDefault();
        handleConnectVertices();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectionMode, selectedCubeIdx, selectedCubeIndices, selectedVertexIdxs, handleDeleteCube, handleDeleteSelectedVertex, handleConnectVertices, getCubeVertices3D, getCubeEdgesList, recordState]);

  // Touch Pinch-to-Zoom handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      initialTouchDistanceRef.current = dist;
      initialTouchZoomRef.current = camera.zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && initialTouchDistanceRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (initialTouchDistanceRef.current > 0) {
        const scale = currentDist / initialTouchDistanceRef.current;
        const newZoom = Math.max(50, Math.min(800, initialTouchZoomRef.current * scale));
        setCamera(prev => ({ ...prev, zoom: newZoom }));
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      initialTouchDistanceRef.current = null;
    }
  };

  // Helper to test point-to-segment distance for gizmo handle lines
  const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  };

  // Helper to detect if mouse or finger is over a 3D Gizmo Marker / Handle (Supports Group Multi-Selection)
  const checkGizmoHover = useCallback((touchX: number, touchY: number, isTouch: boolean = false): GizmoTarget => {
    if (selectedCubeIndices.length === 0 || !canvasRef.current) return null;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    const groupBounds = getGroupBoundingBox(modelRef.current.cubes, selectedCubeIndices);
    if (!groupBounds) return null;

    const [ox, oy, oz] = groupBounds.center;
    const [sx, sy, sz] = groupBounds.size;

    if (activeTool === 'rotate_object') {
      const R = Math.max(sx, sy, sz) * 0.8 + 0.2;
      const getMinRingDist = (projPts: { x: number; y: number }[], tx: number, ty: number) => {
        let minDist = Infinity;
        for (let i = 0; i < projPts.length - 1; i++) {
          const d = distToSegment(tx, ty, projPts[i].x, projPts[i].y, projPts[i + 1].x, projPts[i + 1].y);
          if (d < minDist) minDist = d;
        }
        return minDist;
      };

      const xRing = getRingPoints('X', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));
      const yRing = getRingPoints('Y', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));
      const zRing = getRingPoints('Z', ox, oy, oz, R).map(p => projectPoint(p[0], p[1], p[2], camera, width, height));

      const dists = [
        { target: 'rotX' as GizmoTarget, dist: getMinRingDist(xRing, touchX, touchY) },
        { target: 'rotY' as GizmoTarget, dist: getMinRingDist(yRing, touchX, touchY) },
        { target: 'rotZ' as GizmoTarget, dist: getMinRingDist(zRing, touchX, touchY) },
      ];

      const tolerance = isTouch ? 16 : 10;
      const sorted = dists.sort((a, b) => a.dist - b.dist);
      if (sorted[0].dist <= tolerance) {
        return sorted[0].target;
      }
      return null;
    }

    const hOffset = 0.12;

    const cCenter = projectPoint(ox, oy, oz, camera, width, height);

    const gxPlus = projectPoint(ox + sx / 2 + hOffset, oy, oz, camera, width, height);
    const gxMinus = projectPoint(ox - (sx / 2 + hOffset), oy, oz, camera, width, height);
    const gyPlus = projectPoint(ox, oy + sy / 2 + hOffset, oz, camera, width, height);
    const gyMinus = projectPoint(ox, oy - (sy / 2 + hOffset), oz, camera, width, height);
    const gzPlus = projectPoint(ox, oy, oz + sz / 2 + hOffset, camera, width, height);
    const gzMinus = projectPoint(ox, oy, oz - (sz / 2 + hOffset), camera, width, height);

    const fXPlus = projectPoint(ox + sx / 2, oy, oz, camera, width, height);
    const fXMinus = projectPoint(ox - sx / 2, oy, oz, camera, width, height);
    const fYPlus = projectPoint(ox, oy + sy / 2, oz, camera, width, height);
    const fYMinus = projectPoint(ox, oy - sy / 2, oz, camera, width, height);
    const fZPlus = projectPoint(ox, oy, oz + sz / 2, camera, width, height);
    const fZMinus = projectPoint(ox, oy, oz - sz / 2, camera, width, height);

    const sphereRadius = isTouch ? 36 : 28;
    const lineRadius = isTouch ? 24 : 18;

    if (Math.hypot(touchX - cCenter.x, touchY - cCenter.y) <= sphereRadius) return 'center';

    if (
      Math.hypot(touchX - gxPlus.x, touchY - gxPlus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fXPlus.x, fXPlus.y, gxPlus.x, gxPlus.y) <= lineRadius
    ) return 'X+';

    if (
      Math.hypot(touchX - gxMinus.x, touchY - gxMinus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fXMinus.x, fXMinus.y, gxMinus.x, gxMinus.y) <= lineRadius
    ) return 'X-';

    if (
      Math.hypot(touchX - gyPlus.x, touchY - gyPlus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fYPlus.x, fYPlus.y, gyPlus.x, gyPlus.y) <= lineRadius
    ) return 'Y+';

    if (
      Math.hypot(touchX - gyMinus.x, touchY - gyMinus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fYMinus.x, fYMinus.y, gyMinus.x, gyMinus.y) <= lineRadius
    ) return 'Y-';

    if (
      Math.hypot(touchX - gzPlus.x, touchY - gzPlus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fZPlus.x, fZPlus.y, gzPlus.x, gzPlus.y) <= lineRadius
    ) return 'Z+';

    if (
      Math.hypot(touchX - gzMinus.x, touchY - gzMinus.y) <= sphereRadius ||
      distToSegment(touchX, touchY, fZMinus.x, fZMinus.y, gzMinus.x, gzMinus.y) <= lineRadius
    ) return 'Z-';

    return null;
  }, [selectedCubeIndices, camera, projectPoint, getGroupBoundingBox, activeTool]);

  // Pointer event handlers (Touch & Mouse support with precise Gizmo interaction)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvasRef.current.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;
    const isTouch = e.pointerType === 'touch';

    if (isFreeformDrawing) {
      const rawX = (touchX - (rect.width / 2 + camera.panX)) / camera.zoom;
      const rawY = ((rect.height / 2 + camera.panY) - touchY) / camera.zoom;

      const snapStep = isSnapEnabled ? gridStep : 0.01;
      const snappedX = Math.round(rawX / snapStep) * snapStep;
      const snappedY = Math.round(rawY / snapStep) * snapStep;

      // Check if clicking close to the FIRST point on screen to close the loop
      if (freeformPoints.length >= 3) {
        const firstPt = freeformPoints[0];
        const firstScreenPt = projectPoint(firstPt[0], firstPt[1], 0, camera, rect.width, rect.height);
        const screenDist = Math.hypot(touchX - firstScreenPt.x, touchY - firstScreenPt.y);
        if (screenDist <= (isTouch ? 24 : 16)) {
          handleFinishFreeform();
          return;
        }
      }

      // Avoid adding duplicate point at same spot
      if (freeformPoints.length > 0) {
        const lastPt = freeformPoints[freeformPoints.length - 1];
        if (Math.hypot(snappedX - lastPt[0], snappedY - lastPt[1]) < 0.001) {
          return;
        }
      }

      setFreeformPoints(prev => [...prev, [Math.round(snappedX * 1000) / 1000, Math.round(snappedY * 1000) / 1000]]);
      return;
    }

    isDraggingRef.current = true;
    dragMouseButtonRef.current = e.button;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialCameraRef.current = { ...camera };
    hasMovedDuringDragRef.current = false;

    if (selectedCubeIndices.length > 0) {
      const groupBounds = getGroupBoundingBox(modelRef.current.cubes, selectedCubeIndices);
      if (groupBounds) {
        initialGroupBoundsRef.current = { center: groupBounds.center, size: groupBounds.size };
        const map = new Map<number, { offset: [number, number, number]; size: [number, number, number] }>();
        const vertsMap = new Map<number, [number, number, number][]>();
        selectedCubeIndices.forEach(idx => {
          const c = modelRef.current.cubes[idx];
          if (c) {
            map.set(idx, { offset: getCubeOffset(c), size: getCubeSize(c) });
            vertsMap.set(idx, getCubeVertices3D(c));
          }
        });
        initialGroupOffsetsRef.current = map;
        initialGroupVerticesRef.current = vertsMap;
      }
    }

    if (selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const c = modelRef.current.cubes[selectedCubeIdx];
      initialCubeOffsetRef.current = getCubeOffset(c);
      initialCubeSizeRef.current = getCubeSize(c);
      initialVerticesRef.current = getCubeVertices3D(c);
    }

    // 1. Check vertex selection / interaction mode (Vertex Mode)
    if (selectionMode === 'vertex' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const cube = modelRef.current.cubes[selectedCubeIdx];
      const verts3D = getCubeVertices3D(cube);
      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, rect.width, rect.height));

      let hitVIdx: number | null = null;
      const vertHitRadius = isTouch ? 32 : 22;
      for (let i = 0; i < projVerts.length; i++) {
        if (Math.hypot(touchX - projVerts[i].x, touchY - projVerts[i].y) <= vertHitRadius) {
          hitVIdx = i;
          break;
        }
      }

      if (hitVIdx !== null) {
        dragStartedOnEmptyRef.current = false;
        let newSel: number[];
        if (e.shiftKey || isTouchMultiSelect) {
          newSel = selectedVertexIdxs.includes(hitVIdx)
            ? selectedVertexIdxs.filter(id => id !== hitVIdx)
            : [...selectedVertexIdxs, hitVIdx];
        } else {
          newSel = [hitVIdx];
        }
        setSelectedVertexIdxs(newSel);
        dragVertexIdxsRef.current = newSel;
        return;
      }
    }

    // 2. Check edge selection / interaction mode (Edge Mode)
    if (selectionMode === 'edge' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const cube = modelRef.current.cubes[selectedCubeIdx];
      const verts3D = getCubeVertices3D(cube);
      const edgesList = getCubeEdgesList(cube);
      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, rect.width, rect.height));

      let hitEdge: [number, number] | null = null;
      const edgeHitRadius = isTouch ? 24 : 16;
      for (const [v1, v2] of edgesList) {
        const p1 = projVerts[v1];
        const p2 = projVerts[v2];
        if (p1 && p2 && distToSegment(touchX, touchY, p1.x, p1.y, p2.x, p2.y) <= edgeHitRadius) {
          hitEdge = [v1, v2];
          break;
        }
      }

      if (hitEdge) {
        dragStartedOnEmptyRef.current = false;
        let newEdges: [number, number][];
        if (e.shiftKey || isTouchMultiSelect) {
          const exists = selectedEdgePairs.some(p => (p[0] === hitEdge![0] && p[1] === hitEdge![1]) || (p[0] === hitEdge![1] && p[1] === hitEdge![0]));
          newEdges = exists
            ? selectedEdgePairs.filter(p => !((p[0] === hitEdge![0] && p[1] === hitEdge![1]) || (p[0] === hitEdge![1] && p[1] === hitEdge![0])))
            : [...selectedEdgePairs, hitEdge];
        } else {
          newEdges = [hitEdge];
        }
        setSelectedEdgePairs(newEdges);
        const uniqueVerts = Array.from(new Set(newEdges.flatMap(e => [e[0], e[1]])));
        setSelectedVertexIdxs(uniqueVerts);
        dragVertexIdxsRef.current = uniqueVerts;
        return;
      }
    }

    // 3. Check direct Gizmo Handle grab
    const hitGizmo = checkGizmoHover(touchX, touchY, isTouch);
    dragGizmoTargetRef.current = hitGizmo;

    if (hitGizmo) {
      dragStartedOnEmptyRef.current = false;
      setHoveredGizmo(hitGizmo);
      if (hitGizmo === 'rotX' || hitGizmo === 'rotY' || hitGizmo === 'rotZ') {
        const groupBounds = getGroupBoundingBox(modelRef.current.cubes, selectedCubeIndices);
        if (groupBounds) {
          const [ox, oy, oz] = groupBounds.center;
          const cCenter = projectPoint(ox, oy, oz, camera, rect.width, rect.height);
          initialGrabAngleRef.current = Math.atan2(touchY - cCenter.y, touchX - cCenter.x);
        }
      }
      return;
    }

    // 4. Direct touch raycasting / selection for Cubes
    let hitCubeIdx: number | null = null;
    let hitFaceType: FaceTarget | null = null;
    for (let i = projectedPolygons.length - 1; i >= 0; i--) {
      const poly = projectedPolygons[i];
      if (isPointInPoly(touchX, touchY, poly.points)) {
        hitCubeIdx = poly.cubeIndex;
        hitFaceType = poly.faceType;
        break;
      }
    }

    let hitVertex = false;
    if (selectionMode === 'vertex' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const cube = modelRef.current.cubes[selectedCubeIdx];
      const verts3D = getCubeVertices3D(cube);
      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, rect.width, rect.height));
      const vertHitRadius = isTouch ? 32 : 22;
      for (let i = 0; i < projVerts.length; i++) {
        if (Math.hypot(touchX - projVerts[i].x, touchY - projVerts[i].y) <= vertHitRadius) {
          hitVertex = true;
          break;
        }
      }
    }

    let hitEdge = false;
    if (selectionMode === 'edge' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const cube = modelRef.current.cubes[selectedCubeIdx];
      const verts3D = getCubeVertices3D(cube);
      const edgesList = getCubeEdgesList(cube);
      const projVerts = verts3D.map(v => projectPoint(v[0], v[1], v[2], camera, rect.width, rect.height));
      const edgeHitRadius = isTouch ? 24 : 16;
      for (const [v1, v2] of edgesList) {
        const p1 = projVerts[v1];
        const p2 = projVerts[v2];
        if (p1 && p2 && distToSegment(touchX, touchY, p1.x, p1.y, p2.x, p2.y) <= edgeHitRadius) {
          hitEdge = true;
          break;
        }
      }
    }

    const hitAnyElement = hitGizmo !== null || hitCubeIdx !== null || hitVertex || hitEdge;
    dragStartedOnEmptyRef.current = !hitAnyElement;

    if (hitCubeIdx !== null) {
      dragStartedOnEmptyRef.current = false;
      const faceKey = hitFaceType ? `${hitCubeIdx}:${hitFaceType}` : null;

      if (e.shiftKey || isTouchMultiSelect || selectionMode === 'face') {
        if (selectionMode === 'face' || (hitFaceType && (isTouchMultiSelect || e.shiftKey))) {
          // Multi-polygon / face selection mode
          let nextFaceTargets: string[];
          if (faceKey) {
            if (selectedFaceTargets.includes(faceKey)) {
              nextFaceTargets = selectedFaceTargets.filter(k => k !== faceKey);
            } else {
              nextFaceTargets = [...selectedFaceTargets, faceKey];
            }
          } else {
            nextFaceTargets = selectedFaceTargets;
          }
          setSelectedFaceTargets(nextFaceTargets);

          // Always ensure selectedCubeIndices contains all cubes with selected faces
          const cubeIndicesFromFaces = Array.from(new Set(nextFaceTargets.map(k => parseInt(k.split(':')[0], 10))));
          const nextCubeIndices = Array.from(new Set([...selectedCubeIndices, ...cubeIndicesFromFaces, hitCubeIdx]));
          setSelectedCubeIndices(nextCubeIndices);

          if (hitFaceType) {
            setSelectedFaceTarget(hitFaceType);
          }
        } else {
          // Multi-cube selection mode
          const newSel = selectedCubeIndices.includes(hitCubeIdx)
            ? selectedCubeIndices.filter(i => i !== hitCubeIdx)
            : [...selectedCubeIndices, hitCubeIdx];
          setSelectedCubeIndices(newSel);
          setSelectedFaceTargets([]);
          if (hitFaceType) {
            setSelectedFaceTarget(hitFaceType);
          }
        }
      } else {
        // Single click selection
        setSelectedCubeIndices([hitCubeIdx]);
        if (hitFaceType && faceKey) {
          setSelectedFaceTargets([faceKey]);
          setSelectedFaceTarget(hitFaceType);
        } else {
          setSelectedFaceTargets([]);
          setSelectedFaceTarget('all');
        }
      }
    }

    renderCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;
    const isTouch = e.pointerType === 'touch';

    if (isFreeformDrawing) {
      const rawX = (touchX - (rect.width / 2 + camera.panX)) / camera.zoom;
      const rawY = ((rect.height / 2 + camera.panY) - touchY) / camera.zoom;

      const snapStep = isSnapEnabled ? gridStep : 0.01;
      const snappedX = Math.round(rawX / snapStep) * snapStep;
      const snappedY = Math.round(rawY / snapStep) * snapStep;

      setFreeformHoverPoint([Math.round(snappedX * 1000) / 1000, Math.round(snappedY * 1000) / 1000]);
      return;
    }

    // Hover effect when not dragging
    if (!isDraggingRef.current) {
      const gizmoHit = checkGizmoHover(touchX, touchY, isTouch);
      if (gizmoHit !== hoveredGizmo) {
        setHoveredGizmo(gizmoHit);
      }
      return;
    }

    if (initialTouchDistanceRef.current !== null) return; // skip pointer drag during pinch zoom

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 2) {
      hasMovedDuringDragRef.current = true;
    }

    const gizmoTarget = dragGizmoTargetRef.current;
    const isEditingElement = gizmoTarget !== null || dragVertexIdxsRef.current.length > 0;

    // Camera Rotation / Panning: Only if drag started on empty space OR if in rotate/pan tool WITHOUT grabbing a gizmo/vertex/edge
    if (dragStartedOnEmptyRef.current || (!isEditingElement && (activeTool === 'rotate' || activeTool === 'pan'))) {
      const isPanAction = activeTool === 'pan' || e.shiftKey || dragMouseButtonRef.current === 1 || dragMouseButtonRef.current === 2;

      if (isPanAction) {
        setCamera(prev => ({
          ...prev,
          panX: initialCameraRef.current.panX + dx,
          panY: initialCameraRef.current.panY + dy,
        }));
      } else {
        setCamera(prev => ({
          ...prev,
          yaw: initialCameraRef.current.yaw + dx * 0.008,
          pitch: Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, initialCameraRef.current.pitch + dy * 0.008)),
        }));
      }
      return;
    }

    const hasAnyActiveAxis = activeAxes.X || activeAxes.Y || activeAxes.Z;

    const shouldUpdateAxis = (axis: 'X' | 'Y' | 'Z'): boolean => {
      if (hasAnyActiveAxis) {
        return activeAxes[axis];
      }
      if (gizmoTarget === 'X' || gizmoTarget === 'X+' || gizmoTarget === 'X-') return axis === 'X';
      if (gizmoTarget === 'Y' || gizmoTarget === 'Y+' || gizmoTarget === 'Y-') return axis === 'Y';
      if (gizmoTarget === 'Z' || gizmoTarget === 'Z+' || gizmoTarget === 'Z-') return axis === 'Z';
      return true;
    };

    // Vertex or Edge mode direct dragging in 3D
    if ((selectionMode === 'vertex' || selectionMode === 'edge') && dragVertexIdxsRef.current.length > 0 && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const sinPitch = Math.sin(camera.pitch);
      const cosPitch = Math.cos(camera.pitch);
      const sinYaw = Math.sin(camera.yaw);
      const cosYaw = Math.cos(camera.yaw);

      const sX_X = cosYaw * camera.zoom;
      const sY_X = -sinYaw * sinPitch * camera.zoom;
      const lenX2 = Math.max(0.0625 * camera.zoom * camera.zoom, sX_X * sX_X + sY_X * sY_X);

      const sX_Y = -sinYaw * camera.zoom;
      const sY_Y = -cosYaw * sinPitch * camera.zoom;
      const lenY2 = Math.max(0.0625 * camera.zoom * camera.zoom, sX_Y * sX_Y + sY_Y * sY_Y);

      const sX_Z = 0;
      const sY_Z = -cosPitch * camera.zoom;
      const lenZ2 = Math.max(0.0625 * camera.zoom * camera.zoom, sX_Z * sX_Z + sY_Z * sY_Z);

      const deltaWorldX = (dx * sX_X + dy * sY_X) / lenX2;
      const deltaWorldY = (dx * sX_Y + dy * sY_Y) / lenY2;
      const deltaWorldZ = (dx * sX_Z + dy * sY_Z) / lenZ2;

      const cube = modelRef.current.cubes[selectedCubeIdx];
      const origVerts = initialVerticesRef.current;
      const allVerts = getCubeVertices3D(cube);

      if (origVerts.length > 0) {
        const edgeConstraint = activeEdgeConstraintRef.current;
        const useEdgeSlide = isEdgeSlideEnabled && edgeConstraint !== null && dragVertexIdxsRef.current.length === 1;

        let activeSnapInfo: { pos: [number, number, number]; label: string; type: 'vertex' | 'grid' | 'midpoint' } | null = null;
        let finalVerts: [number, number, number][] = [...allVerts];

        if (useEdgeSlide && edgeConstraint) {
          const draggedIdx = dragVertexIdxsRef.current[0];
          const v1Pos = edgeConstraint.v1Pos;
          const v2Pos = edgeConstraint.v2Pos;
          const edgeVec: [number, number, number] = [
            v2Pos[0] - v1Pos[0],
            v2Pos[1] - v1Pos[1],
            v2Pos[2] - v1Pos[2],
          ];
          const lenSq = edgeVec[0] * edgeVec[0] + edgeVec[1] * edgeVec[1] + edgeVec[2] * edgeVec[2];

          if (lenSq > 1e-6) {
            const proj = (deltaWorldX * edgeVec[0] + deltaWorldY * edgeVec[1] + deltaWorldZ * edgeVec[2]) / lenSq;
            const startV = origVerts[draggedIdx] || allVerts[draggedIdx] || v1Pos;

            const candidatePos: [number, number, number] = [
              startV[0] + proj * edgeVec[0],
              startV[1] + proj * edgeVec[1],
              startV[2] + proj * edgeVec[2],
            ];

            let t = ((candidatePos[0] - v1Pos[0]) * edgeVec[0] +
                     (candidatePos[1] - v1Pos[1]) * edgeVec[1] +
                     (candidatePos[2] - v1Pos[2]) * edgeVec[2]) / lenSq;

            t = Math.max(0.001, Math.min(0.999, t));

            let snappedPos: [number, number, number] = [
              v1Pos[0] + t * edgeVec[0],
              v1Pos[1] + t * edgeVec[1],
              v1Pos[2] + t * edgeVec[2],
            ];

            if (isSnapEnabled) {
              // 1. Vertex-to-Vertex Magnet Snap
              let bestDist = 0.05;
              let bestVert: [number, number, number] | null = null;

              allVerts.forEach((v, vIdx) => {
                if (vIdx === draggedIdx) return;
                const dist = Math.hypot(v[0] - snappedPos[0], v[1] - snappedPos[1], v[2] - snappedPos[2]);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestVert = [...v] as [number, number, number];
                }
              });

              if (bestVert) {
                const tTarget = ((bestVert[0] - v1Pos[0]) * edgeVec[0] +
                                 (bestVert[1] - v1Pos[1]) * edgeVec[1] +
                                 (bestVert[2] - v1Pos[2]) * edgeVec[2]) / lenSq;
                const clampedT = Math.max(0.001, Math.min(0.999, tTarget));
                snappedPos = [
                  v1Pos[0] + clampedT * edgeVec[0],
                  v1Pos[1] + clampedT * edgeVec[1],
                  v1Pos[2] + clampedT * edgeVec[2],
                ];
                activeSnapInfo = { pos: snappedPos, label: 'Магнит: Вершина', type: 'vertex' };
              } else if (Math.abs(t - 0.5) < 0.05) {
                snappedPos = [
                  v1Pos[0] + 0.5 * edgeVec[0],
                  v1Pos[1] + 0.5 * edgeVec[1],
                  v1Pos[2] + 0.5 * edgeVec[2],
                ];
                activeSnapInfo = { pos: snappedPos, label: 'Центр ребра (50%)', type: 'midpoint' };
              } else if (Math.abs(t - 0.25) < 0.04) {
                snappedPos = [
                  v1Pos[0] + 0.25 * edgeVec[0],
                  v1Pos[1] + 0.25 * edgeVec[1],
                  v1Pos[2] + 0.25 * edgeVec[2],
                ];
                activeSnapInfo = { pos: snappedPos, label: '25% ребра', type: 'midpoint' };
              } else if (Math.abs(t - 0.75) < 0.04) {
                snappedPos = [
                  v1Pos[0] + 0.75 * edgeVec[0],
                  v1Pos[1] + 0.75 * edgeVec[1],
                  v1Pos[2] + 0.75 * edgeVec[2],
                ];
                activeSnapInfo = { pos: snappedPos, label: '75% ребра', type: 'midpoint' };
              } else {
                const gridP: [number, number, number] = [
                  Math.round(snappedPos[0] / gridStep) * gridStep,
                  Math.round(snappedPos[1] / gridStep) * gridStep,
                  Math.round(snappedPos[2] / gridStep) * gridStep,
                ];
                const tGrid = ((gridP[0] - v1Pos[0]) * edgeVec[0] +
                               (gridP[1] - v1Pos[1]) * edgeVec[1] +
                               (gridP[2] - v1Pos[2]) * edgeVec[2]) / lenSq;
                const clampedTGrid = Math.max(0.001, Math.min(0.999, tGrid));
                snappedPos = [
                  v1Pos[0] + clampedTGrid * edgeVec[0],
                  v1Pos[1] + clampedTGrid * edgeVec[1],
                  v1Pos[2] + clampedTGrid * edgeVec[2],
                ];
                activeSnapInfo = { pos: snappedPos, label: `Сетка ${Math.round(gridStep * 100)}см`, type: 'grid' };
              }
            }

            finalVerts = allVerts.map((v, idx) => {
              if (idx === draggedIdx) {
                return [
                  Math.round(snappedPos[0] * 1000) / 1000,
                  Math.round(snappedPos[1] * 1000) / 1000,
                  Math.round(snappedPos[2] * 1000) / 1000,
                ] as [number, number, number];
              }
              return v;
            });
          }
        } else {
          finalVerts = allVerts.map((v, idx) => {
            let updatedV = v;
            if (dragVertexIdxsRef.current.includes(idx)) {
              const initV = origVerts[idx];
              if (initV) {
                let nx = initV[0] + (shouldUpdateAxis('X') ? deltaWorldX : 0);
                let ny = initV[1] + (shouldUpdateAxis('Y') ? deltaWorldY : 0);
                let nz = initV[2] + (shouldUpdateAxis('Z') ? deltaWorldZ : 0);

                if (isSnapEnabled) {
                  let bestDist = 0.05;
                  let bestVert: [number, number, number] | null = null;

                  allVerts.forEach((otherV, otherIdx) => {
                    if (dragVertexIdxsRef.current.includes(otherIdx)) return;
                    const dist = Math.hypot(otherV[0] - nx, otherV[1] - ny, otherV[2] - nz);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestVert = [...otherV] as [number, number, number];
                    }
                  });

                  if (bestVert) {
                    nx = bestVert[0];
                    ny = bestVert[1];
                    nz = bestVert[2];
                    activeSnapInfo = { pos: [nx, ny, nz], label: 'Магнит: Вершина', type: 'vertex' };
                  } else {
                    nx = Math.round(nx / gridStep) * gridStep;
                    ny = Math.round(ny / gridStep) * gridStep;
                    nz = Math.round(nz / gridStep) * gridStep;
                    activeSnapInfo = { pos: [nx, ny, nz], label: `Сетка ${Math.round(gridStep * 100)}см`, type: 'grid' };
                  }
                }

                updatedV = [
                  Math.round(nx * 1000) / 1000,
                  Math.round(ny * 1000) / 1000,
                  Math.round(nz * 1000) / 1000,
                ] as [number, number, number];
              }
            }
            return updatedV;
          });
        }

        snapIndicatorRef.current = activeSnapInfo;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        finalVerts.forEach(v => {
          if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
          if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
          if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
        });

        const newOffset: [number, number, number] = [
          Math.round(((minX + maxX) / 2) * 1000) / 1000,
          Math.round(((minY + maxY) / 2) * 1000) / 1000,
          Math.round(((minZ + maxZ) / 2) * 1000) / 1000,
        ];
        const newSize: [number, number, number] = [
          Math.max(0.02, Math.round((maxX - minX) * 1000) / 1000),
          Math.max(0.02, Math.round((maxY - minY) * 1000) / 1000),
          Math.max(0.02, Math.round((maxZ - minZ) * 1000) / 1000),
        ];

        updateCube(selectedCubeIdx, { vertices: finalVerts, offset: newOffset, size: newSize }, true);
      }
      return;
    }

    // If user grabbed a rotation Gizmo marker, process rotation immediately!
    if ((gizmoTarget === 'rotX' || gizmoTarget === 'rotY' || gizmoTarget === 'rotZ') && selectedCubeIndices.length > 0) {
      const groupBounds = initialGroupBoundsRef.current;
      if (groupBounds) {
        const [ox, oy, oz] = groupBounds.center;
        const cCenter = projectPoint(ox, oy, oz, camera, rect.width, rect.height);
        const currentAngle = Math.atan2(touchY - cCenter.y, touchX - cCenter.x);
        let deltaAngle = currentAngle - initialGrabAngleRef.current;

        if (isSnapEnabled) {
          const snapAngle = Math.PI / 12; // 15 degrees
          deltaAngle = Math.round(deltaAngle / snapAngle) * snapAngle;
        }

        const draggedAxis = gizmoTarget === 'rotX' ? 'X' : (gizmoTarget === 'rotY' ? 'Y' : 'Z');
        const newCubes = [...modelRef.current.cubes];

        selectedCubeIndices.forEach(idx => {
          const initVerts = initialGroupVerticesRef.current.get(idx);
          if (initVerts) {
            const rotatedVerts = initVerts.map(v => rotateVertex(v, [ox, oy, oz], draggedAxis, deltaAngle));

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            rotatedVerts.forEach(v => {
              if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
              if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
              if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
            });

            const newOffset: [number, number, number] = [
              Math.round(((minX + maxX) / 2) * 1000) / 1000,
              Math.round(((minY + maxY) / 2) * 1000) / 1000,
              Math.round(((minZ + maxZ) / 2) * 1000) / 1000,
            ];
            const newSize: [number, number, number] = [
              Math.max(0.02, Math.round((maxX - minX) * 1000) / 1000),
              Math.max(0.02, Math.round((maxY - minY) * 1000) / 1000),
              Math.max(0.02, Math.round((maxZ - minZ) * 1000) / 1000),
            ];

            newCubes[idx] = {
              ...newCubes[idx],
              vertices: rotatedVerts,
              offset: newOffset,
              size: newSize,
            };
          }
        });

        const updatedModel = { ...modelRef.current, cubes: newCubes };
        setModel(updatedModel);
        modelRef.current = updatedModel;

        snapIndicatorRef.current = {
          pos: [ox, oy, oz],
          label: `Поворот: ${Math.round((deltaAngle * 180) / Math.PI)}°`,
          type: isSnapEnabled ? 'vertex' : 'grid',
        };
      }
      return;
    }

    // If user grabbed a Gizmo marker, process Gizmo movement/resize immediately!
    if (gizmoTarget !== null && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const sinPitch = Math.sin(camera.pitch);
      const cosPitch = Math.cos(camera.pitch);
      const sinYaw = Math.sin(camera.yaw);
      const cosYaw = Math.cos(camera.yaw);

      const sX_X = cosYaw * camera.zoom;
      const sY_X = -sinYaw * sinPitch * camera.zoom;
      const lenX2 = sX_X * sX_X + sY_X * sY_X;

      const sX_Y = -sinYaw * camera.zoom;
      const sY_Y = -cosYaw * sinPitch * camera.zoom;
      const lenY2 = sX_Y * sX_Y + sY_Y * sY_Y;

      const sX_Z = 0;
      const sY_Z = -cosPitch * camera.zoom;
      const lenZ2 = sX_Z * sX_Z + sY_Z * sY_Z;

      const minLen = 0.25 * camera.zoom;
      const minLen2 = minLen * minLen;

      const effLenX2 = Math.max(minLen2, lenX2);
      const effLenY2 = Math.max(minLen2, lenY2);
      const effLenZ2 = Math.max(minLen2, lenZ2);

      const deltaWorldX = (dx * sX_X + dy * sY_X) / effLenX2;
      const deltaWorldY = (dx * sX_Y + dy * sY_Y) / effLenY2;
      const deltaWorldZ = (dx * sX_Z + dy * sY_Z) / effLenZ2;

      const isResize = activeTool === 'resize';

      // Multi-cube Group Transformation Handler
      if (selectedCubeIndices.length > 1) {
        if (isResize && initialGroupBoundsRef.current) {
          const initCenter = initialGroupBoundsRef.current.center;
          const initSize = initialGroupBoundsRef.current.size;
          const initMin: [number, number, number] = [
            initCenter[0] - initSize[0] / 2,
            initCenter[1] - initSize[1] / 2,
            initCenter[2] - initSize[2] / 2,
          ];
          const initMax: [number, number, number] = [
            initCenter[0] + initSize[0] / 2,
            initCenter[1] + initSize[1] / 2,
            initCenter[2] + initSize[2] / 2,
          ];

          let scaleX = 1, scaleY = 1, scaleZ = 1;
          let newCenter: [number, number, number] = [initCenter[0], initCenter[1], initCenter[2]];

          if (gizmoTarget === 'X+' || gizmoTarget === 'X') {
            let targetMaxX = initMax[0] + deltaWorldX;
            if (isSnapEnabled) targetMaxX = Math.round(targetMaxX / gridStep) * gridStep;
            const newSizeX = Math.max(gridStep, targetMaxX - initMin[0]);
            scaleX = newSizeX / Math.max(0.001, initSize[0]);
            newCenter[0] = initMin[0] + newSizeX / 2;
          } else if (gizmoTarget === 'X-') {
            let targetMinX = initMin[0] + deltaWorldX;
            if (isSnapEnabled) targetMinX = Math.round(targetMinX / gridStep) * gridStep;
            const newSizeX = Math.max(gridStep, initMax[0] - targetMinX);
            scaleX = newSizeX / Math.max(0.001, initSize[0]);
            newCenter[0] = targetMinX + newSizeX / 2;
          } else if (hasAnyActiveAxis && shouldUpdateAxis('X')) {
            let targetSizeX = initSize[0] + deltaWorldX;
            if (isSnapEnabled) targetSizeX = Math.max(gridStep, Math.round(targetSizeX / gridStep) * gridStep);
            scaleX = Math.max(0.05, targetSizeX / Math.max(0.001, initSize[0]));
          }

          if (gizmoTarget === 'Y+' || gizmoTarget === 'Y') {
            let targetMaxY = initMax[1] + deltaWorldY;
            if (isSnapEnabled) targetMaxY = Math.round(targetMaxY / gridStep) * gridStep;
            const newSizeY = Math.max(gridStep, targetMaxY - initMin[1]);
            scaleY = newSizeY / Math.max(0.001, initSize[1]);
            newCenter[1] = initMin[1] + newSizeY / 2;
          } else if (gizmoTarget === 'Y-') {
            let targetMinY = initMin[1] + deltaWorldY;
            if (isSnapEnabled) targetMinY = Math.round(targetMinY / gridStep) * gridStep;
            const newSizeY = Math.max(gridStep, initMax[1] - targetMinY);
            scaleY = newSizeY / Math.max(0.001, initSize[1]);
            newCenter[1] = targetMinY + newSizeY / 2;
          } else if (hasAnyActiveAxis && shouldUpdateAxis('Y')) {
            let targetSizeY = initSize[1] + deltaWorldY;
            if (isSnapEnabled) targetSizeY = Math.max(gridStep, Math.round(targetSizeY / gridStep) * gridStep);
            scaleY = Math.max(0.05, targetSizeY / Math.max(0.001, initSize[1]));
          }

          if (gizmoTarget === 'Z+' || gizmoTarget === 'Z') {
            let targetMaxZ = initMax[2] + deltaWorldZ;
            if (isSnapEnabled) targetMaxZ = Math.round(targetMaxZ / gridStep) * gridStep;
            const newSizeZ = Math.max(gridStep, targetMaxZ - initMin[2]);
            scaleZ = newSizeZ / Math.max(0.001, initSize[2]);
            newCenter[2] = initMin[2] + newSizeZ / 2;
          } else if (gizmoTarget === 'Z-') {
            let targetMinZ = initMin[2] + deltaWorldZ;
            if (isSnapEnabled) targetMinZ = Math.round(targetMinZ / gridStep) * gridStep;
            const newSizeZ = Math.max(gridStep, initMax[2] - targetMinZ);
            scaleZ = newSizeZ / Math.max(0.001, initSize[2]);
            newCenter[2] = targetMinZ + newSizeZ / 2;
          } else if (hasAnyActiveAxis && shouldUpdateAxis('Z')) {
            let targetSizeZ = initSize[2] + deltaWorldZ;
            if (isSnapEnabled) targetSizeZ = Math.max(gridStep, Math.round(targetSizeZ / gridStep) * gridStep);
            scaleZ = Math.max(0.05, targetSizeZ / Math.max(0.001, initSize[2]));
          }

          if (!gizmoTarget.startsWith('X') && !gizmoTarget.startsWith('Y') && !gizmoTarget.startsWith('Z')) {
            const factor = 1 + (deltaWorldX + deltaWorldY + deltaWorldZ) / 3;
            let targetSizeX = initSize[0] * factor;
            let targetSizeY = initSize[1] * factor;
            let targetSizeZ = initSize[2] * factor;
            if (isSnapEnabled) {
              targetSizeX = Math.max(gridStep, Math.round(targetSizeX / gridStep) * gridStep);
              targetSizeY = Math.max(gridStep, Math.round(targetSizeY / gridStep) * gridStep);
              targetSizeZ = Math.max(gridStep, Math.round(targetSizeZ / gridStep) * gridStep);
            }
            if (shouldUpdateAxis('X')) scaleX = Math.max(0.05, targetSizeX / Math.max(0.001, initSize[0]));
            if (shouldUpdateAxis('Y')) scaleY = Math.max(0.05, targetSizeY / Math.max(0.001, initSize[1]));
            if (shouldUpdateAxis('Z')) scaleZ = Math.max(0.05, targetSizeZ / Math.max(0.001, initSize[2]));
          }

          const newCubes = [...modelRef.current.cubes];
          selectedCubeIndices.forEach(idx => {
            const initData = initialGroupOffsetsRef.current.get(idx);
            if (initData) {
              const initOff = initData.offset;
              const initSz = initData.size;

              const newOff: [number, number, number] = [
                Math.round((newCenter[0] + (initOff[0] - initCenter[0]) * scaleX) * 1000) / 1000,
                Math.round((newCenter[1] + (initOff[1] - initCenter[1]) * scaleY) * 1000) / 1000,
                Math.round((newCenter[2] + (initOff[2] - initCenter[2]) * scaleZ) * 1000) / 1000,
              ];
              const newSz: [number, number, number] = [
                Math.max(0.01, Math.round(initSz[0] * scaleX * 1000) / 1000),
                Math.max(0.01, Math.round(initSz[1] * scaleY * 1000) / 1000),
                Math.max(0.01, Math.round(initSz[2] * scaleZ * 1000) / 1000),
              ];
              newCubes[idx] = { ...newCubes[idx], offset: newOff, size: newSz };
            }
          });
          const updatedModel = { ...modelRef.current, cubes: newCubes };
          setModel(updatedModel);
          modelRef.current = updatedModel;
          return;
        } else {
          // Multi-cube Move Mode
          const initCenter = initialGroupBoundsRef.current ? initialGroupBoundsRef.current.center : [0, 0, 0];
          const initSize = initialGroupBoundsRef.current ? initialGroupBoundsRef.current.size : [0, 0, 0];
          const initMin: [number, number, number] = [
            initCenter[0] - initSize[0] / 2,
            initCenter[1] - initSize[1] / 2,
            initCenter[2] - initSize[2] / 2,
          ];

          let effDx = deltaWorldX;
          let effDy = deltaWorldY;
          let effDz = deltaWorldZ;

          if (isSnapEnabled) {
            if (shouldUpdateAxis('X')) effDx = Math.round((initMin[0] + deltaWorldX) / gridStep) * gridStep - initMin[0];
            if (shouldUpdateAxis('Y')) effDy = Math.round((initMin[1] + deltaWorldY) / gridStep) * gridStep - initMin[1];
            if (shouldUpdateAxis('Z')) effDz = Math.round((initMin[2] + deltaWorldZ) / gridStep) * gridStep - initMin[2];
          }

          const newCubes = [...modelRef.current.cubes];
          selectedCubeIndices.forEach(idx => {
            const initData = initialGroupOffsetsRef.current.get(idx);
            if (initData) {
              const curOff = initData.offset;
              let newOff: [number, number, number] = [curOff[0], curOff[1], curOff[2]];
              if (shouldUpdateAxis('X')) newOff[0] = Math.round((curOff[0] + effDx) * 1000) / 1000;
              if (shouldUpdateAxis('Y')) newOff[1] = Math.round((curOff[1] + effDy) * 1000) / 1000;
              if (shouldUpdateAxis('Z')) newOff[2] = Math.round((curOff[2] + effDz) * 1000) / 1000;
              newCubes[idx] = { ...newCubes[idx], offset: newOff };
            }
          });
          const updatedModel = { ...modelRef.current, cubes: newCubes };
          setModel(updatedModel);
          modelRef.current = updatedModel;
          return;
        }
      }

      const curOffset = initialCubeOffsetRef.current;
      const curSize = initialCubeSizeRef.current;

      let candOffset: [number, number, number] = [curOffset[0], curOffset[1], curOffset[2]];
      let candSize: [number, number, number] = [curSize[0], curSize[1], curSize[2]];

      let grabbedAxis: 'X' | 'Y' | 'Z' | null = null;
      if (gizmoTarget === 'X' || gizmoTarget === 'X+' || gizmoTarget === 'X-') grabbedAxis = 'X';
      else if (gizmoTarget === 'Y' || gizmoTarget === 'Y+' || gizmoTarget === 'Y-') grabbedAxis = 'Y';
      else if (gizmoTarget === 'Z' || gizmoTarget === 'Z+' || gizmoTarget === 'Z-') grabbedAxis = 'Z';

      const isNegativeHandle = gizmoTarget === 'X-' || gizmoTarget === 'Y-' || gizmoTarget === 'Z-';

      if (isResize) {
        if (hasAnyActiveAxis) {
          const deltaValue = grabbedAxis === 'X' ? deltaWorldX : grabbedAxis === 'Y' ? deltaWorldY : grabbedAxis === 'Z' ? deltaWorldZ : 0;
          const change = grabbedAxis !== null ? (isNegativeHandle ? -deltaValue : deltaValue) : 0;
          const axisKeys: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z'];
          axisKeys.forEach((ax, idx) => {
            if (activeAxes[ax]) {
              if (grabbedAxis !== null) {
                candSize[idx] = Math.max(0.01, curSize[idx] + change);
              } else {
                const dWorld = idx === 0 ? deltaWorldX : idx === 1 ? deltaWorldY : deltaWorldZ;
                candSize[idx] = Math.max(0.01, curSize[idx] + dWorld);
              }
              candOffset[idx] = curOffset[idx]; // Scaled relative to center
            }
          });
        } else {
          // Standard single axis gizmo resize
          if (gizmoTarget === 'X+') {
            const newSx = Math.max(0.01, curSize[0] + deltaWorldX);
            const deltaS = newSx - curSize[0];
            candOffset[0] = curOffset[0] + deltaS / 2;
            candSize[0] = newSx;
          } else if (gizmoTarget === 'X-') {
            const newSx = Math.max(0.01, curSize[0] - deltaWorldX);
            const deltaS = newSx - curSize[0];
            candOffset[0] = curOffset[0] - deltaS / 2;
            candSize[0] = newSx;
          } else if (gizmoTarget === 'Y+') {
            const newSy = Math.max(0.01, curSize[1] + deltaWorldY);
            const deltaS = newSy - curSize[1];
            candOffset[1] = curOffset[1] + deltaS / 2;
            candSize[1] = newSy;
          } else if (gizmoTarget === 'Y-') {
            const newSy = Math.max(0.01, curSize[1] - deltaWorldY);
            const deltaS = newSy - curSize[1];
            candOffset[1] = curOffset[1] - deltaS / 2;
            candSize[1] = newSy;
          } else if (gizmoTarget === 'Z+') {
            const newSz = Math.max(0.01, curSize[2] + deltaWorldZ);
            const deltaS = newSz - curSize[2];
            candOffset[2] = curOffset[2] + deltaS / 2;
            candSize[2] = newSz;
          } else if (gizmoTarget === 'Z-') {
            const newSz = Math.max(0.01, curSize[2] - deltaWorldZ);
            const deltaS = newSz - curSize[2];
            candOffset[2] = curOffset[2] - deltaS / 2;
            candSize[2] = newSz;
          } else {
            candSize = [
              Math.max(0.01, curSize[0] + deltaWorldX),
              Math.max(0.01, curSize[1] + deltaWorldY),
              Math.max(0.01, curSize[2] + deltaWorldZ),
            ];
          }
        }

        if (isSnapEnabled) {
          const extrudeHandle = (gizmoTarget === 'X+' || gizmoTarget === 'X-' || gizmoTarget === 'Y+' || gizmoTarget === 'Y-' || gizmoTarget === 'Z+' || gizmoTarget === 'Z-') ? gizmoTarget : null;
          if (activeFixedPreset !== null) {
            const snapped = snapCubeToViewGrid(selectedCubeIdx, candOffset, candSize, activeFixedPreset, gridStep, extrudeHandle);
            candOffset = snapped.offset;
            candSize = snapped.size;
          } else {
            const snapped = snapCube(selectedCubeIdx, candOffset, candSize, modelRef.current.cubes, extrudeHandle);
            candOffset = snapped.offset;
            candSize = snapped.size;
          }
        }

        updateCube(selectedCubeIdx, { offset: candOffset, size: candSize }, true);
        return;
      } else {
        // Move Mode Gizmo Dragging
        if (hasAnyActiveAxis) {
          const deltaValue = grabbedAxis === 'X' ? deltaWorldX : grabbedAxis === 'Y' ? deltaWorldY : grabbedAxis === 'Z' ? deltaWorldZ : 0;
          const axisKeys: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z'];
          axisKeys.forEach((ax, idx) => {
            if (activeAxes[ax]) {
              if (grabbedAxis !== null) {
                candOffset[idx] = curOffset[idx] + deltaValue;
              } else {
                const dWorld = idx === 0 ? deltaWorldX : idx === 1 ? deltaWorldY : deltaWorldZ;
                candOffset[idx] = curOffset[idx] + dWorld;
              }
            }
          });
        } else {
          if (gizmoTarget === 'X+' || gizmoTarget === 'X-' || gizmoTarget === 'X') {
            candOffset[0] = curOffset[0] + deltaWorldX;
          } else if (gizmoTarget === 'Y+' || gizmoTarget === 'Y-' || gizmoTarget === 'Y') {
            candOffset[1] = curOffset[1] + deltaWorldY;
          } else if (gizmoTarget === 'Z+' || gizmoTarget === 'Z-' || gizmoTarget === 'Z') {
            candOffset[2] = curOffset[2] + deltaWorldZ;
          } else {
            candOffset = [
              curOffset[0] + deltaWorldX,
              curOffset[1] + deltaWorldY,
              curOffset[2] + deltaWorldZ,
            ];
          }
        }

        if (isSnapEnabled) {
          if (activeFixedPreset !== null) {
            const snapped = snapCubeToViewGrid(selectedCubeIdx, candOffset, curSize, activeFixedPreset, gridStep);
            candOffset = snapped.offset;
          } else {
            const snapped = snapCube(selectedCubeIdx, candOffset, curSize, modelRef.current.cubes);
            candOffset = snapped.offset;
          }
        }

        updateCube(selectedCubeIdx, { offset: candOffset }, true);
        return;
      }
    }

    // Shift key or Right/Middle mouse button forces Camera Panning
    const isPanAction = activeTool === 'pan' || e.shiftKey || dragMouseButtonRef.current === 1 || dragMouseButtonRef.current === 2;

    if (isPanAction) {
      // Pan Camera across scene (PanX, PanY)
      setCamera(prev => ({
        ...prev,
        panX: initialCameraRef.current.panX + dx,
        panY: initialCameraRef.current.panY + dy,
      }));
      return;
    }

    if (activeTool === 'rotate') {
      // Rotate Camera scene (Yaw, Pitch)
      setCamera(prev => ({
        ...prev,
        yaw: initialCameraRef.current.yaw + dx * 0.008,
        pitch: Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, initialCameraRef.current.pitch + dy * 0.008)),
      }));
      return;
    }

    if (activeTool === 'move' && selectedCubeIdx !== null && modelRef.current.cubes[selectedCubeIdx]) {
      const sinPitch = Math.sin(camera.pitch);
      const cosPitch = Math.cos(camera.pitch);
      const sinYaw = Math.sin(camera.yaw);
      const cosYaw = Math.cos(camera.yaw);

      const sX_X = cosYaw * camera.zoom;
      const sY_X = -sinYaw * sinPitch * camera.zoom;
      const lenX2 = sX_X * sX_X + sY_X * sY_X;

      const sX_Y = -sinYaw * camera.zoom;
      const sY_Y = -cosYaw * sinPitch * camera.zoom;
      const lenY2 = sX_Y * sX_Y + sY_Y * sY_Y;

      const sX_Z = 0;
      const sY_Z = -cosPitch * camera.zoom;
      const lenZ2 = sX_Z * sX_Z + sY_Z * sY_Z;

      const minLen = 0.25 * camera.zoom;
      const minLen2 = minLen * minLen;

      const effLenX2 = Math.max(minLen2, lenX2);
      const effLenY2 = Math.max(minLen2, lenY2);
      const effLenZ2 = Math.max(minLen2, lenZ2);

      const deltaWorldX = (dx * sX_X + dy * sY_X) / effLenX2;
      const deltaWorldY = (dx * sX_Y + dy * sY_Y) / effLenY2;
      const deltaWorldZ = (dx * sX_Z + dy * sY_Z) / effLenZ2;

      const curOffset = initialCubeOffsetRef.current;
      const curSize = initialCubeSizeRef.current;
      let newOffset: [number, number, number] = [curOffset[0], curOffset[1], curOffset[2]];
      if (shouldUpdateAxis('X')) newOffset[0] = Math.round((curOffset[0] + deltaWorldX) * 1000) / 1000;
      if (shouldUpdateAxis('Y')) newOffset[1] = Math.round((curOffset[1] + deltaWorldY) * 1000) / 1000;
      if (shouldUpdateAxis('Z')) newOffset[2] = Math.round((curOffset[2] + deltaWorldZ) * 1000) / 1000;

      if (isSnapEnabled) {
        if (activeFixedPreset !== null) {
          const snapped = snapCubeToViewGrid(selectedCubeIdx, newOffset, curSize, activeFixedPreset, gridStep);
          newOffset = snapped.offset;
        } else {
          const snapped = snapCube(selectedCubeIdx, newOffset, curSize, modelRef.current.cubes);
          newOffset = snapped.offset;
        }
      }

      updateCube(selectedCubeIdx, { offset: newOffset }, true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (isDraggingRef.current && hasMovedDuringDragRef.current) {
      // Record state to history once drag finishes (saving CPU cycles)
      recordState(modelRef.current);
    } else if (dragStartedOnEmptyRef.current && !hasMovedDuringDragRef.current) {
      // Tap on empty space: clear selection of cube, face, vertices, and edges
      setSelectedCubeIndices([]);
      setSelectedVertexIdxs([]);
      setSelectedEdgePairs([]);
      setSelectedFaceTargets([]);
      setSelectedFaceTarget('all');
    }
    isDraggingRef.current = false;
    dragStartedOnEmptyRef.current = false;
    dragGizmoTargetRef.current = null;
    dragVertexIdxsRef.current = [];
    hasMovedDuringDragRef.current = false;
    snapIndicatorRef.current = null;

    renderCanvas();
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(50, Math.min(800, prev.zoom * zoomFactor)),
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col font-['Jura'] select-none overflow-hidden touch-none w-full h-full max-w-full max-h-full">
      {/* Top Header Bar - Responsive Flex Wrap Layout */}
      <div className="bg-slate-900 border-b border-slate-800 p-2 sm:px-4 flex flex-wrap items-center justify-between shrink-0 gap-2 w-full max-w-full">
        {/* Model Selector & Create Button */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[100px] max-w-[200px]">
          <select
            value={activeModelId}
            onChange={(e) => loadModel(e.target.value)}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-xs font-bold rounded-lg px-2 py-1.5 outline-none focus:border-sky-500 truncate"
          >
            {Object.keys(modelMap).map(id => (
              <option key={id} value={id}>
                {modelMap[id].name || id}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setNewModelModal(true);
              setCreateMode('empty');
              setNewModelName('');
              setNewModelJson('');
              setNewModelError(null);
            }}
            className="w-8 h-8 bg-sky-600 hover:bg-sky-500 text-white rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            title="Создать новую 3D модель (пустую или из JSON)"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={handleCopyCurrentModelJson}
            className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            title="Скопировать JSON код текущей 3D модели"
          >
            <Copy size={15} />
          </button>
        </div>

        {/* Primary Tool Buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 flex-wrap">
          <button
            onClick={() => setActiveTool('rotate')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'rotate'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Вращение сцены (по умолчанию)"
          >
            <RotateCw size={15} />
            <span className="hidden sm:inline">Вращение</span>
          </button>
          <button
            onClick={() => setActiveTool('select')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'select'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Выбор элемента"
          >
            <MousePointer2 size={15} />
            <span className="hidden sm:inline">Выбор</span>
          </button>
          <button
            onClick={() => setActiveTool('pan')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'pan'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Панорама сцены"
          >
            <Move size={15} />
            <span className="hidden sm:inline">Панорама</span>
          </button>
          <button
            onClick={() => setActiveTool('resize')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'resize'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Изменение размера"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Размер</span>
          </button>
          <button
            onClick={() => setActiveTool('rotate_object')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'rotate_object'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Вращение объекта"
          >
            <RefreshCw size={15} />
            <span className="hidden sm:inline">Поворот Объекта</span>
          </button>
        </div>

        {/* 3D Mesh Mode Selector Bar (Blender Mode Switcher) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-sky-900/40 shrink-0 flex-wrap">
          <button
            onClick={() => setSelectionMode('cube')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all ${
              selectionMode === 'cube'
                ? 'bg-emerald-500 text-slate-950 shadow ring-1 ring-emerald-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Выбор 3D Объект / Куб"
          >
            <Box size={16} />
          </button>
          <button
            onClick={() => setSelectionMode('face')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all ${
              selectionMode === 'face'
                ? 'bg-amber-400 text-slate-950 shadow ring-1 ring-amber-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Выделение полигонов / граней (Polygon / Face Mode)"
          >
            <Square size={16} />
          </button>
          <button
            onClick={() => setSelectionMode('vertex')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all ${
              selectionMode === 'vertex'
                ? 'bg-amber-400 text-slate-950 shadow ring-1 ring-amber-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Выделение и перемещение вершин (Vertex Mode)"
          >
            <CircleDot size={16} />
          </button>
          <button
            onClick={() => setSelectionMode('edge')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-all ${
              selectionMode === 'edge'
                ? 'bg-amber-400 text-slate-950 shadow ring-1 ring-amber-300'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Выделение и перемещение рёбер (Edge Mode)"
          >
            <Minus size={16} />
          </button>
        </div>

        {/* Save & Close Actions (Always visible, wraps cleanly) */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap ms-auto">
          <button
            onClick={() => {
              handleSaveModel();
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform shadow"
            title="Сохранить модель"
          >
            <Save size={15} />
            <span className="hidden sm:inline">Сохранить</span>
          </button>
          <button
            onClick={() => {
              handleSaveModel();
              onClose();
            }}
            className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform shadow"
            title="Сохранить модель и закрыть окно"
          >
            <Check size={15} />
            <span className="hidden sm:inline">Готово</span>
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-white rounded-lg flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            title="Закрыть редактор"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main 3D Viewport Canvas Container */}
      <div ref={containerRef} className="flex-1 relative w-full h-full overflow-hidden bg-slate-950 min-h-0">
        {/* Floating Top Controls Container (Prevent UI Overlap) */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-start justify-between gap-2 pointer-events-none flex-wrap">
          {/* Edge / Vertex Actions Bar */}
          {(selectionMode === 'vertex' || selectionMode === 'edge') ? (
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl shadow-2xl flex-wrap pointer-events-auto max-w-full">
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5">
                {selectionMode === 'vertex' ? <CircleDot size={14} /> : <Minus size={14} />}
                <span>
                  {selectionMode === 'vertex' ? `Вершины (${selectedVertexIdxs.length})` : `Рёбра (${selectedEdgePairs.length})`}
                </span>
              </span>

              {selectionMode === 'vertex' && (
                <button
                  onClick={() => setIsEdgeSlideEnabled(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow border ${
                    isEdgeSlideEnabled
                      ? 'bg-amber-500 text-slate-950 border-amber-400 ring-1 ring-amber-300'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border-slate-700/80'
                  }`}
                  title="Движение вдоль линии ребра (Edge Slide Mode)"
                >
                  <Sliders size={14} />
                  <span>Слайд по ребру: {isEdgeSlideEnabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
                </button>
              )}

              <button
                onClick={handleAddVertexOnEdge}
                disabled={selectedEdgePairs.length === 0 && selectedVertexIdxs.length !== 2}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 shadow"
                title="Добавить новую вершину на выбранное ребро"
              >
                <Plus size={14} />
                <span>+ Добавить вершину</span>
              </button>

              {selectionMode === 'vertex' && (
                <button
                  onClick={handleConnectVertices}
                  disabled={selectedVertexIdxs.length < 2}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 shadow"
                  title="Соединить выделенные вершины ребром (Горячая клавиша: F)"
                >
                  <GitCommit size={14} />
                  <span>Соединить ребром</span>
                </button>
              )}

              {selectionMode === 'vertex' && (
                <button
                  onClick={handleDeleteSelectedVertex}
                  disabled={selectedVertexIdxs.length === 0}
                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 shadow"
                  title="Удалить выделенную вершину"
                >
                  <Trash2 size={14} />
                  <span>Удалить</span>
                </button>
              )}
            </div>
          ) : <div />}

          {/* Touch Multi-Select & Selection Controls (Top Right Corner) */}
          <div className="flex items-center gap-1.5 bg-slate-900/95 backdrop-blur border border-slate-800 p-1.5 rounded-2xl shadow-2xl pointer-events-auto ms-auto">
            <button
              onClick={() => setIsTouchMultiSelect(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow border ${
                isTouchMultiSelect
                  ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400/50'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border-slate-700/80'
              }`}
              title="Мульти-выбор для сенсорных экранов"
            >
              <Layers size={15} className={isTouchMultiSelect ? 'text-slate-950' : 'text-amber-400'} />
              <span className="hidden sm:inline">Мульти-выбор:</span>
              <span>{isTouchMultiSelect ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </button>

            <button
              onClick={() => {
                if (selectionMode === 'cube') setSelectedCubeIndices(model.cubes.map((_, i) => i));
                else if (selectionMode === 'face') {
                  const allKeys: string[] = [];
                  model.cubes.forEach((cube, cIdx) => {
                    const names = getCubeFaceNames(cube);
                    names.forEach(f => allKeys.push(`${cIdx}:${f}`));
                  });
                  setSelectedFaceTargets(allKeys);
                  setSelectedCubeIndices(model.cubes.map((_, i) => i));
                } else if (selectionMode === 'vertex' && selectedCubeIdx !== null && model.cubes[selectedCubeIdx]) {
                  const verts = getCubeVertices3D(model.cubes[selectedCubeIdx]);
                  setSelectedVertexIdxs(verts.map((_, i) => i));
                } else if (selectionMode === 'edge' && selectedCubeIdx !== null && model.cubes[selectedCubeIdx]) {
                  setSelectedEdgePairs(getCubeEdgesList(model.cubes[selectedCubeIdx]));
                }
              }}
              className="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700/80 active:scale-95 flex items-center gap-1"
              title="Выделить всё"
            >
              <span>Всё</span>
            </button>

            {(selectedCubeIndices.length > 0 || selectedVertexIdxs.length > 0 || selectedEdgePairs.length > 0) && (
              <button
                onClick={() => {
                  setSelectedCubeIndices([]);
                  setSelectedVertexIdxs([]);
                  setSelectedEdgePairs([]);
                }}
                className="h-8 px-2.5 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 rounded-xl text-xs font-bold transition-all border border-slate-700/80 active:scale-95 flex items-center gap-1"
                title="Снять выделение"
              >
                <span>Сброс</span>
              </button>
            )}
          </div>
        </div>

        {/* Floating 2D Freeform Drawing Overlay Header */}
        {isFreeformDrawing && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 backdrop-blur-md border border-amber-500/60 px-2.5 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 text-slate-100 max-w-[95vw] overflow-x-auto text-xs animate-in fade-in slide-in-from-top-2 duration-150 select-none">
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-800 shrink-0">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="font-bold text-amber-300 whitespace-nowrap">2D Форма:</span>
              <span className="text-[11px] font-mono text-slate-300">{freeformPoints.length} точ.</span>
            </div>

            {/* Height Z Input */}
            <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">Z (м):</span>
              <input
                type="number"
                step="0.05"
                min="0.01"
                max="10"
                value={freeformExtrudeHeight}
                onChange={(e) => setFreeformExtrudeHeight(Math.max(0.01, parseFloat(e.target.value) || 0.2))}
                className="w-12 h-6 bg-slate-950 text-amber-300 font-bold text-xs rounded px-1 border border-slate-700 outline-none text-center"
              />
            </div>

            {/* Undo point button */}
            <button
              onClick={handleUndoFreeformPoint}
              disabled={freeformPoints.length === 0}
              className="h-7 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shrink-0 active:scale-95"
              title="Отменить точку"
            >
              <Undo size={12} />
              <span className="hidden sm:inline">Отмена</span>
            </button>

            {/* Finish / Extrude button */}
            <button
              onClick={handleFinishFreeform}
              disabled={freeformPoints.length < 3}
              className="h-7 px-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 shadow transition-all shrink-0 active:scale-95"
              title="Замкнуть и выдать 3D объем"
            >
              <Check size={13} />
              <span className="whitespace-nowrap">Объём</span>
            </button>

            {/* Cancel Freeform button */}
            <button
              onClick={handleCancelFreeform}
              className="h-7 w-7 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg flex items-center justify-center transition-all shrink-0"
              title="Выйти из рисования"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-full h-full touch-none ${
            hoveredGizmo ? 'cursor-grab active:cursor-grabbing' :
            activeTool === 'pan' ? 'cursor-move' :
            activeTool === 'rotate' ? 'cursor-grab' : 'cursor-crosshair'
          }`}
        />

        {/* Multi-Axis Active Toggles & Cube Actions Toolbar (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto max-w-[calc(100vw-2rem)]">
          {/* Multi-Select Axis Toggle Buttons (X, Y, Z) & View Angle Popup Button */}
          <div className="flex items-center gap-1.5 bg-slate-900/95 backdrop-blur border border-slate-800 p-1.5 rounded-2xl shadow-xl">
            <span className="text-[10px] text-slate-400 uppercase font-bold px-1.5 flex items-center gap-1">
              <Sliders size={12} />
              <span>Оси:</span>
            </span>
            {(['X', 'Y', 'Z'] as const).map(ax => (
              <button
                key={ax}
                onClick={() => setActiveAxes(prev => ({ ...prev, [ax]: !prev[ax] }))}
                className={`w-9 h-8 rounded-xl text-xs font-bold transition-all active:scale-90 ${
                  activeAxes[ax]
                    ? ax === 'X' ? 'bg-red-600 text-white shadow ring-2 ring-red-400'
                      : ax === 'Y' ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-400'
                      : 'bg-sky-600 text-white shadow ring-2 ring-sky-400'
                    : 'bg-slate-800/80 text-slate-500 hover:bg-slate-700 hover:text-slate-300 border border-slate-700/50'
                }`}
                title={`Переключить ось ${ax}`}
              >
                {ax}
              </button>
            ))}

            <div className="w-px h-6 bg-slate-800 mx-0.5" />

            {/* Camera View Angle Selector Button */}
            <div className="relative">
              <button
                onClick={() => setShowViewAnglesMenu(prev => !prev)}
                className={`h-8 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow border ${
                  showViewAnglesMenu
                    ? 'bg-sky-500 text-slate-950 border-sky-400 ring-2 ring-sky-400/40'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700/60'
                }`}
                title="Выбор ракурса и стороны камеры (Спереди, Сзади, Слева, Справа, Сверху, Снизу, 3D)"
              >
                <Eye size={14} className="text-sky-400" />
                <span>Ракурс</span>
                <ChevronUp size={12} className={`transition-transform duration-200 ${showViewAnglesMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* View Angles Dropdown Menu (Opened Above) */}
              {showViewAnglesMenu && (
                <div className="absolute bottom-full right-0 mb-2 z-50 bg-slate-900/98 backdrop-blur border border-slate-800 p-2.5 rounded-2xl shadow-2xl w-64 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                      <Compass size={14} className="text-sky-400" />
                      <span>Ракурсы камеры</span>
                    </div>
                    <button
                      onClick={() => setShowViewAnglesMenu(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(CAMERA_PRESETS) as CameraPresetType[]).map((key) => {
                      const preset = CAMERA_PRESETS[key];
                      const active = isPresetActive(preset);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setCameraPreset(preset);
                            setShowViewAnglesMenu(false);
                          }}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all ${
                            active
                              ? 'bg-sky-500 text-slate-950 shadow ring-1 ring-sky-300'
                              : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800/80'
                          }`}
                          title={preset.title}
                        >
                          <span className="truncate">{preset.label}</span>
                          {active && <Check size={12} className="shrink-0 text-slate-950 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-slate-800 mx-0.5" />

            {/* Wireframe Mode Toggle Button */}
            <button
              onClick={() => setIsWireframe(prev => !prev)}
              className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center transition-all active:scale-95 shadow border ${
                isWireframe
                  ? 'bg-sky-500 text-slate-950 border-sky-400 ring-2 ring-sky-400/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border-slate-700/60'
              }`}
              title="Wireframe (Режим каркаса)"
            >
              <Grid size={15} />
            </button>
          </div>

          {/* Cube Actions Toolbar */}
          <div className="flex items-center gap-1.5 bg-slate-900/95 backdrop-blur border border-slate-800 p-1.5 rounded-2xl shadow-xl flex-wrap">
            {/* Add Primitive Dropdown Menu (Cube, Cylinder, Flat Square, Flat Circle, Freeform) */}
            <div className="relative">
              <button
                onClick={() => setShowAddPrimitiveMenu(prev => !prev)}
                className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center transition-all active:scale-95 shadow border ${
                  showAddPrimitiveMenu
                    ? 'bg-sky-500 text-slate-950 border-sky-400 ring-2 ring-sky-400/40'
                    : 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500/80'
                }`}
                title="Добавить меш/фигуру (+)"
              >
                <Plus size={20} />
              </button>

              {showAddPrimitiveMenu && (
                <div className="absolute bottom-full left-0 mb-2 z-50 bg-slate-900/98 backdrop-blur border border-slate-800 p-2 rounded-2xl shadow-2xl w-56 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-800/80 flex items-center justify-between">
                    <span>Добавить фигуру</span>
                    <button
                      onClick={() => setShowAddPrimitiveMenu(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      handleAddPrimitive('cube');
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-sky-300 transition-colors text-left"
                  >
                    <Box size={16} className="text-sky-400 shrink-0" />
                    <div className="flex flex-col">
                      <span>Куб</span>
                      <span className="text-[10px] text-slate-400 font-normal">Параллелепипед</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleAddPrimitive('cylinder');
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-sky-300 transition-colors text-left"
                  >
                    <CircleDot size={16} className="text-amber-400 shrink-0" />
                    <div className="flex flex-col">
                      <span>Цилиндр</span>
                      <span className="text-[10px] text-slate-400 font-normal">Объёмный 3D цилиндр</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleAddPrimitive('sphere');
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-sky-300 transition-colors text-left"
                  >
                    <CircleDot size={16} className="text-rose-400 shrink-0" />
                    <div className="flex flex-col">
                      <span>Сфера</span>
                      <span className="text-[10px] text-slate-400 font-normal">Объёмная 3D сфера</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleAddPrimitive('flat_square');
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-sky-300 transition-colors text-left"
                  >
                    <Square size={16} className="text-emerald-400 shrink-0" />
                    <div className="flex flex-col">
                      <span>Плоский квадрат</span>
                      <span className="text-[10px] text-slate-400 font-normal">Плоский меш (квадрат)</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleAddPrimitive('flat_circle');
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-sky-300 transition-colors text-left"
                  >
                    <CircleDot size={16} className="text-indigo-400 shrink-0" />
                    <div className="flex flex-col">
                      <span>Плоский круг</span>
                      <span className="text-[10px] text-slate-400 font-normal">Плоский меш (круг)</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleStartFreeform();
                      setShowAddPrimitiveMenu(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 transition-all text-left shadow mt-1"
                  >
                    <Sparkles size={16} className="text-slate-950 shrink-0" />
                    <div className="flex flex-col">
                      <span>Свободная форма</span>
                      <span className="text-[10px] text-slate-900/80 font-medium">2D Рисование + Z объем</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleCopyCube}
              disabled={selectedCubeIdx === null}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Копировать куб (Ctrl+C)"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={handlePasteCube}
              disabled={!hasCopiedCube}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform relative"
              title="Вставить куб (Ctrl+V)"
            >
              <Clipboard size={16} />
            </button>
            <button
              onClick={handleDuplicateCube}
              disabled={selectedCubeIdx === null}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Дублировать куб (Ctrl+D)"
            >
              <Layers size={16} />
            </button>
            <button
              onClick={handleDeleteCube}
              disabled={selectedCubeIndices.length === 0 && selectedCubeIdx === null}
              className="w-10 h-10 bg-red-900/40 hover:bg-red-800/80 disabled:opacity-30 text-red-300 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Удалить выбранные объекты (Delete)"
            >
              <Trash2 size={16} />
            </button>
            <div className="w-px h-6 bg-slate-800 mx-0.5" />
            <button
              onClick={() => {
                setIsSnapEnabled(!isSnapEnabled);
              }}
              className={`h-10 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow active:scale-95 ${
                isSnapEnabled
                  ? 'bg-amber-500 text-slate-950 shadow ring-2 ring-amber-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
              }`}
              title="Магнит / Сетка - прилипание вершин к сетке, центру рёбер и соседним вершинам"
            >
              <Magnet size={16} className={isSnapEnabled ? 'text-slate-950' : 'text-amber-400'} />
              <span className="hidden sm:inline">Магнит</span>
            </button>
            <button
              onClick={handleRetopologizeMesh}
              className="h-10 px-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow active:scale-95 border border-sky-400/50"
              title="Ретопология: Разбить многоугольники на правильную сетку треугольников без веерных искажений"
            >
              <Sparkles size={16} className="text-amber-300" />
              <span className="hidden sm:inline">Ретопология</span>
            </button>

            {/* Grid Step Selector */}
            <select
              value={gridStep}
              onChange={(e) => setGridStep(parseFloat(e.target.value))}
              className="h-10 bg-slate-800 border border-slate-700/80 text-amber-300 font-bold text-xs rounded-xl px-2 outline-none focus:border-amber-500 cursor-pointer"
              title="Шаг ячейки сетки магнита"
            >
              <option value={0.02}>2 см</option>
              <option value={0.05}>5 см</option>
              <option value={0.10}>10 см</option>
              <option value={0.20}>20 см</option>
            </select>
            <div className="w-px h-6 bg-slate-800 mx-0.5" />
            <button
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                if (showTextureTransformModal) setShowTextureTransformModal(false);
              }}
              disabled={selectedCubeIdx === null}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform relative"
              title="Цвет куба и граней"
            >
              <Palette size={16} />
              {selectedCubeIdx !== null && model.cubes[selectedCubeIdx] && (
                <div
                  className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border border-white/70 shadow-sm ${
                    model.cubes[selectedCubeIdx].faceColors ? 'ring-1 ring-sky-400' : ''
                  }`}
                  style={{
                    backgroundColor: activeColorValue,
                  }}
                />
              )}
            </button>
            <button
              onClick={() => {
                setShowTextureTransformModal(prev => !prev);
                if (showColorPicker) setShowColorPicker(false);
              }}
              disabled={selectedCubeIdx === null}
              className={`h-10 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow active:scale-95 disabled:opacity-40 ${
                showTextureTransformModal
                  ? 'bg-amber-500 text-slate-950 shadow ring-2 ring-amber-300'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/60'
              }`}
              title="Трансформация текстуры (Масштаб, Поворот, Сдвиг UV)"
            >
              <Sliders size={16} className={showTextureTransformModal ? 'text-slate-950' : 'text-amber-400'} />
              <span className="hidden sm:inline">UV</span>
            </button>
            <div className="w-px h-6 bg-slate-800 mx-0.5" />
            <button
              onClick={() => setCamera(DEFAULT_CAMERA)}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Сбросить камеру в начальное положение"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Отмена (Ctrl+Z)"
            >
              <Undo size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
              title="Повтор (Ctrl+Y)"
            >
              <Redo size={16} />
            </button>
          </div>
        </div>

        {/* Custom Color Picker & Face Colors Overlay Panel */}
        {showColorPicker && selectedCubeIdx !== null && model.cubes[selectedCubeIdx] && (
          <div className="absolute bottom-20 left-4 z-30 bg-slate-900/95 backdrop-blur border border-slate-800 p-3.5 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] sm:max-w-[340px] w-full max-h-[calc(100vh-7rem)] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Palette size={16} className="text-sky-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Цвета граней и куба</span>
              </div>
              <button
                onClick={() => setShowColorPicker(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={14} />
              </button>
            </div>

            {/* Face Target Selector Tabs */}
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
                Область применения:
              </span>
              <div className="flex flex-col gap-1.5 bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                <button
                  key="all"
                  onClick={() => setSelectedFaceTarget('all')}
                  className={`relative flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold transition-all ${
                    selectedFaceTarget === 'all'
                      ? 'bg-sky-500 text-slate-950 shadow ring-1 ring-sky-300'
                      : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                  title="Применить ко всему кубу"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/40 shadow-inner"
                    style={{
                      backgroundColor: typeof model.cubes[selectedCubeIdx!].color === 'string'
                        ? model.cubes[selectedCubeIdx!].color
                        : '#8B5A2B'
                    }}
                  />
                  <span>Все грани (Весь куб)</span>
                </button>

                {selectedFaceTarget !== 'all' && (
                  <div className="text-center bg-sky-950/30 border border-sky-900/40 py-1.5 rounded-lg text-xs text-sky-300 font-bold">
                    Выбран полигон: {getFaceMeta(selectedFaceTarget).dirName}
                  </div>
                )}
              </div>
            </div>

            {/* Active Face Info & Quick Reset Actions */}
            <div className="flex items-center justify-between text-[11px] bg-slate-950/40 px-2.5 py-1.5 rounded-xl border border-slate-800/80">
              <span className="text-slate-300 font-medium truncate">
                {getFaceMeta(selectedFaceTarget).dirName}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedFaceTarget !== 'all' && model.cubes[selectedCubeIdx!].faceColors?.[selectedFaceTarget] && (
                  <button
                    onClick={() => handleResetTargetFaceColor(selectedFaceTarget)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline font-bold"
                    title="Сбросить цвет этой грани к основному цвету"
                  >
                    Сбросить
                  </button>
                )}
                {model.cubes[selectedCubeIdx!].faceColors && Object.keys(model.cubes[selectedCubeIdx!].faceColors!).length > 0 && (
                  <button
                    onClick={() => handleResetTargetFaceColor('all')}
                    className="text-[10px] text-red-400 hover:text-red-300 hover:underline font-bold"
                    title="Сбросить цвета всех граней данного куба"
                  >
                    Сбросить все
                  </button>
                )}
              </div>
            </div>

            {/* Material Mode Segmented Switcher (Цвет ИЛИ Текстура) */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                Покрытие ({selectedFaceTarget === 'all' ? 'Куб целиком' : getFaceMeta(selectedFaceTarget).label}):
              </span>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (activeTextureValue) {
                      handleSetTargetColor(activeColorValue || '#8B5A2B');
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !activeTextureValue
                      ? 'bg-sky-500 text-slate-950 shadow ring-1 ring-sky-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Сплошной Цвет</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!activeTextureValue) {
                      setShowAssetPicker(true);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTextureValue
                      ? 'bg-sky-500 text-slate-950 shadow ring-1 ring-sky-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>Текстура</span>
                </button>
              </div>
            </div>

            {!activeTextureValue ? (
              <>
                {/* Quick Material Presets */}
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                    Быстрые материалы:
                  </span>
                  <div className="flex flex-wrap gap-1 p-1 bg-slate-950/50 rounded-xl border border-slate-800">
                    {[
                      { name: 'Дерево', color: '#8B5A2B' },
                      { name: 'Дуб', color: '#A06D3B' },
                      { name: 'Тёмное дерево', color: '#543210' },
                      { name: 'Сталь', color: '#94a3b8' },
                      { name: 'Тёмный металл', color: '#475569' },
                      { name: 'Красный', color: '#ef4444' },
                      { name: 'Зелёный', color: '#22c55e' },
                      { name: 'Синий', color: '#3b82f6' },
                      { name: 'Жёлтый', color: '#eab308' },
                      { name: 'Оранжевый', color: '#f97316' },
                      { name: 'Белый', color: '#f8fafc' },
                      { name: 'Чёрный', color: '#1e293b' },
                    ].map((mat) => (
                      <button
                        key={mat.name}
                        onClick={() => handleSetTargetColor(mat.color)}
                        className="w-6 h-6 rounded-md border border-slate-700/80 hover:scale-110 active:scale-95 transition-all shadow-sm"
                        style={{ backgroundColor: mat.color }}
                        title={`${mat.name} (${mat.color})`}
                      />
                    ))}
                  </div>
                </div>

                {/* List of Colors Currently Used on Model */}
                {usedColors.length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                      Цвета в модели ({usedColors.length})
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar p-1 bg-slate-950/50 rounded-xl border border-slate-800">
                      {usedColors.map((c) => (
                        <button
                          key={c}
                          onClick={() => handleSetTargetColor(c)}
                          className={`w-6 h-6 rounded-md border transition-all active:scale-90 ${
                            activeColorValue === c
                              ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                              : 'border-slate-700/80 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Color Picker Component */}
                <div className="pt-1.5 border-t border-slate-800">
                  <CustomColorPicker
                    color={activeColorValue}
                    onChange={(c) => handleSetTargetColor(c)}
                    label="Палитра и HEX"
                    className="w-full"
                    popoverPosition="top"
                  />
                </div>
              </>
            ) : (
              /* Texture Picker Component */
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Активная текстура ({selectedFaceTarget === 'all' ? 'Куб' : getFaceMeta(selectedFaceTarget).label})
                  </span>
                  <button
                    onClick={() => handleSetTargetTexture(undefined)}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Переключить на Цвет
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAssetPicker(true)}
                    className="flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-all active:scale-[0.99] group shadow-inner"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                        <img
                          src={getPolyTextureUrl(activeTextureValue) || ''}
                          alt={activeTextureValue}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="text-xs font-semibold text-sky-300 truncate">
                          {activeTextureValue}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          Нажмите для выбора другой текстуры
                        </span>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 text-[10px] font-semibold bg-sky-950/70 border border-sky-800/80 text-sky-300 rounded-lg group-hover:bg-sky-900/70 transition-colors flex-shrink-0 ml-2">
                      Изменить
                    </span>
                  </button>
                </div>

                {/* UV Texture Transform Button */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLayerIndex(null);
                      setShowTextureTransformModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                  >
                    <Sliders size={14} className="text-amber-400" />
                    <span>Настройка UV базовой текстуры</span>
                  </button>
                </div>

                {/* Texture Layers & Decals (Наклейки) Section */}
                <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                        Слои и Наклейки ({activeTextureLayers.length})
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {copiedLayers && copiedLayers.length > 0 && (
                        <button
                          type="button"
                          onClick={handlePasteLayers}
                          className="p-1 px-1.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg flex items-center gap-1 font-semibold transition-all"
                          title="Вставить скопированные слои"
                        >
                          <Clipboard size={11} />
                          <span>Вставить</span>
                        </button>
                      )}

                      {activeTextureLayers.length > 0 && (
                        <button
                          type="button"
                          onClick={handleCopyLayers}
                          className="p-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 transition-all"
                          title="Копировать слои"
                        >
                          <Copy size={11} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setLayerPickerTargetIndex('new');
                          setShowLayerAssetPicker(true);
                        }}
                        className="px-2 py-1 text-[10px] font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg flex items-center gap-1 shadow transition-all active:scale-95"
                      >
                        <Plus size={11} />
                        <span>Наклейка</span>
                      </button>
                    </div>
                  </div>

                  {/* Layer Stack Items */}
                  {activeTextureLayers.length === 0 ? (
                    <div className="text-[10px] text-slate-400 italic bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
                      Нет наложенных текстур. Нажмите «+ Наклейка», чтобы наложить логотип, грязь, надпись или граффити.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                      {activeTextureLayers.map((layer, lIdx) => {
                        const isSelectedLayer = selectedLayerIndex === lIdx;
                        return (
                          <div
                            key={layer.id || lIdx}
                            className={`flex flex-col p-2 rounded-xl border transition-all ${
                              isSelectedLayer
                                ? 'bg-sky-950/70 border-sky-500 ring-1 ring-sky-500/50 shadow-md'
                                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedLayerIndex(isSelectedLayer ? null : lIdx)}
                                className="flex items-center gap-2 flex-1 overflow-hidden text-left"
                              >
                                {/* Layer Thumbnail */}
                                <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex-shrink-0">
                                  <img
                                    src={getPolyTextureUrl(layer.textureId) || ''}
                                    alt={layer.textureId}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                  />
                                </div>

                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-xs font-bold text-slate-200 truncate">
                                    {layer.name || `Слой ${lIdx + 1}`}
                                  </span>
                                  <span className="text-[9px] text-sky-400 font-mono truncate">
                                    {layer.textureId} • {Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}%
                                  </span>
                                </div>
                              </button>

                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {/* Visibility Toggle */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleLayerEnabled(lIdx)}
                                  className={`p-1 rounded-lg hover:bg-slate-800 ${layer.enabled !== false ? 'text-sky-400' : 'text-slate-600'}`}
                                  title={layer.enabled !== false ? 'Скрыть слой' : 'Показать слой'}
                                >
                                  <Eye size={13} />
                                </button>

                                {/* Move Up */}
                                <button
                                  type="button"
                                  disabled={lIdx === 0}
                                  onClick={() => handleReorderLayer(lIdx, 'up')}
                                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-30"
                                  title="Сдвинуть слой ниже"
                                >
                                  <ChevronUp size={13} />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  disabled={lIdx === activeTextureLayers.length - 1}
                                  onClick={() => handleReorderLayer(lIdx, 'down')}
                                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-30"
                                  title="Сдвинуть слой выше"
                                >
                                  <ChevronUp size={13} className="rotate-180" />
                                </button>

                                {/* Delete Layer */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLayer(lIdx)}
                                  className="p-1 rounded-lg hover:bg-rose-950 text-rose-400"
                                  title="Удалить слой"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Expanded Layer Controls if Selected */}
                            {isSelectedLayer && (
                              <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/90 p-2.5 rounded-xl border border-sky-900/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                                    Параметры наклейки #{lIdx + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLayerPickerTargetIndex(lIdx);
                                      setShowLayerAssetPicker(true);
                                    }}
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-bold underline"
                                  >
                                    Заменить текстуру
                                  </button>
                                </div>

                                {/* Opacity Slider */}
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400 font-medium">Прозрачность:</span>
                                    <span className="text-sky-300 font-mono font-bold">
                                      {Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}%
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={layer.opacity !== undefined ? layer.opacity : 1.0}
                                    onChange={(e) => handleUpdateLayerProps(lIdx, { opacity: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-sky-500 cursor-pointer"
                                  />
                                </div>

                                {/* Blend Mode Selector */}
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-slate-400 font-medium">Режим наложения:</span>
                                  <select
                                    value={layer.blendMode || 'source-over'}
                                    onChange={(e) => handleUpdateLayerProps(lIdx, { blendMode: e.target.value as any })}
                                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-sky-300 text-[10px] font-bold outline-none cursor-pointer focus:border-sky-500"
                                  >
                                    <option value="source-over">Обычный (Normal)</option>
                                    <option value="multiply">Умножение (Multiply)</option>
                                    <option value="screen">Экран (Screen)</option>
                                    <option value="overlay">Перекрытие (Overlay)</option>
                                    <option value="darken">Затемнение (Darken)</option>
                                    <option value="lighten">Осветление (Lighten)</option>
                                    <option value="color-dodge">Осветление основы (Color Dodge)</option>
                                    <option value="hard-light">Жесткий свет (Hard Light)</option>
                                  </select>
                                </div>

                                {/* UV Controls Button for Layer */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedLayerIndex(lIdx);
                                    setShowTextureTransformModal(true);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold transition-all"
                                >
                                  <Sliders size={12} className="text-amber-400" />
                                  <span>Трансформация UV наклейки (Смещение, Масштаб, Поворот)</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast notification for copying model JSON */}
      {copyNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
          <Check size={14} />
          <span>{copyNotice}</span>
        </div>
      )}

      {/* New Model Creation Modal */}
      {newModelModal && (
        <div className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-lg flex flex-col gap-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Plus size={16} className="text-sky-400" />
                <span>Новая 3D модель</span>
              </h3>
              <button
                onClick={() => {
                  setNewModelModal(false);
                  setNewModelError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode selection tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setCreateMode('empty');
                  setNewModelError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  createMode === 'empty'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Box size={14} />
                <span>Пустая модель</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMode('json');
                  setNewModelError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  createMode === 'json'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Code size={14} />
                <span>Вставить JSON</span>
              </button>
            </div>

            {/* Model Name Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                Название модели {createMode === 'json' && <span className="text-slate-500 font-normal font-sans">(из JSON или свое)</span>}
              </label>
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder={createMode === 'json' ? "Автоматически из JSON или свое название" : "Название модели (напр., Стол)"}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-sky-500 transition-colors"
                autoFocus={createMode === 'empty'}
              />
            </div>

            {/* JSON Code Input Area */}
            {createMode === 'json' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <FileText size={13} className="text-sky-400" />
                    <span>JSON код 3D модели:</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors active:scale-95"
                      title="Вставить из буфера обмена"
                    >
                      <Clipboard size={12} />
                      <span>Вставить</span>
                    </button>
                    <label className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors active:scale-95">
                      <Upload size={12} />
                      <span>Файл</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  value={newModelJson}
                  onChange={(e) => {
                    setNewModelJson(e.target.value);
                    if (newModelError) setNewModelError(null);
                  }}
                  placeholder={`{\n  "id": "my_table",\n  "name": "Стол",\n  "cubes": [\n    {\n      "offset": [0, 0, 0],\n      "size": [0.5, 0.5, 0.5],\n      "color": "#8B5A2B"\n    }\n  ]\n}`}
                  rows={7}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-sky-300 outline-none focus:border-sky-500 transition-colors resize-none leading-relaxed placeholder:text-slate-600"
                />

                {/* Parsed JSON cubes preview indicator */}
                {newModelJson.trim() && !newModelError && (() => {
                  try {
                    const parsed = JSON.parse(newModelJson.trim());
                    const count = Array.isArray(parsed)
                      ? parsed.length
                      : Array.isArray(parsed?.cubes)
                      ? parsed.cubes.length
                      : (parsed?.offset && parsed?.size) ? 1 : 0;
                    return (
                      <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-lg self-start">
                        <Check size={12} />
                        <span>Валидный JSON (Кубов: {count})</span>
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}

            {/* Error Message display */}
            {newModelError && (
              <div className="p-2.5 bg-rose-950/70 border border-rose-800/80 rounded-xl text-xs text-rose-300 font-medium flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-rose-400" />
                <span>{newModelError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setNewModelModal(false);
                  setNewModelError(null);
                }}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleCreateNewModel}
                disabled={createMode === 'empty' ? !newModelName.trim() : !newModelJson.trim()}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95 shadow-lg shadow-sky-600/20 flex items-center gap-1.5"
              >
                {createMode === 'json' ? <Code size={14} /> : <Plus size={14} />}
                <span>{createMode === 'json' ? 'Импортировать' : 'Создать'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Asset Picker Modal Dialog */}
      {showAssetPicker && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1200] p-4 flex flex-col justify-center items-center pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden p-4 shadow-2xl flex flex-col">
            <AssetPicker
              targetName={`Текстура (${selectedFaceTarget === 'all' ? 'Все грани куба' : getFaceMeta(selectedFaceTarget).label})`}
              onSelect={(selectedAssetId) => {
                handleSetTargetTexture(selectedAssetId || undefined);
                setShowAssetPicker(false);
              }}
              onCancel={() => setShowAssetPicker(false)}
              uiStrings={uiStrings || {}}
            />
          </div>
        </div>
      )}

      {/* Modal for picking a texture for a new or existing layer / sticker */}
      {showLayerAssetPicker && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1250] p-4 flex flex-col justify-center items-center pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden p-4 shadow-2xl flex flex-col">
            <AssetPicker
              targetName={`Наклейка / Слой (${selectedFaceTarget === 'all' ? 'Все грани куба' : getFaceMeta(selectedFaceTarget).label})`}
              onSelect={(selectedAssetId) => {
                if (selectedAssetId) {
                  if (layerPickerTargetIndex === 'new') {
                    handleAddLayer(selectedAssetId);
                  } else if (typeof layerPickerTargetIndex === 'number') {
                    handleUpdateLayerProps(layerPickerTargetIndex, { textureId: selectedAssetId });
                  }
                }
                setShowLayerAssetPicker(false);
              }}
              onCancel={() => setShowLayerAssetPicker(false)}
              uiStrings={uiStrings || {}}
            />
          </div>
        </div>
      )}

      {/* Bottom Sheet Overlay Panel for UV Texture Transformations (Low height bottom bar across screen width) */}
      {showTextureTransformModal && selectedCubeIdx !== null && model.cubes[selectedCubeIdx] && (() => {
        const isEditingLayer = selectedLayerIndex !== null && activeTextureLayers[selectedLayerIndex];
        const targetTransform = isEditingLayer
          ? (activeTextureLayers[selectedLayerIndex!].transform || { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotation: 0, flipU: false, flipV: false })
          : activeTextureTransform;

        const applyTransformPatch = (patch: Partial<FaceTextureTransform>) => {
          if (isEditingLayer) {
            handleUpdateLayerTransform(selectedLayerIndex!, patch);
          } else {
            handleSetTargetTextureTransform(patch);
          }
        };

        const resetTransform = () => {
          if (isEditingLayer) {
            handleUpdateLayerTransform(selectedLayerIndex!, {
              scaleU: 1.0, scaleV: 1.0, offsetU: 0.0, offsetV: 0.0, rotation: 0, flipU: false, flipV: false
            });
          } else {
            handleResetTargetTextureTransform();
          }
        };

        return (
          <div className="absolute bottom-16 inset-x-2 sm:inset-x-4 max-w-4xl mx-auto z-30 bg-slate-900/95 backdrop-blur border border-amber-500/40 p-2.5 sm:p-3 rounded-2xl shadow-2xl max-h-[38vh] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col gap-2 pointer-events-auto">
            {/* Header Bar */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 gap-2">
              <div className="flex items-center gap-2">
                <Sliders size={14} className="text-amber-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  {isEditingLayer ? `Трансформация UV Наклейки #${selectedLayerIndex! + 1}` : 'Трансформация UV Базовой Текстуры'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/80 border border-amber-800/80 text-amber-300">
                  {selectedFaceTarget === 'all' ? 'Все грани' : getFaceMeta(selectedFaceTarget).label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTextureAspectLocked((prev) => !prev)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors border ${
                    isTextureAspectLocked
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="Связать пропорции X и Y"
                >
                  {isTextureAspectLocked ? <Lock size={10} /> : <Unlock size={10} />}
                  <span className="hidden sm:inline">{isTextureAspectLocked ? 'Связано' : 'Раздельно'}</span>
                </button>

                <button
                  type="button"
                  onClick={resetTransform}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 hover:underline bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded-lg"
                  title="Сбросить все трансформации"
                >
                  <RotateCcw size={10} />
                  <span>Сброс</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTextureTransformModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Закрыть панель UV"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Dropdown Select Bar for choosing which texture layer is being transformed */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2 bg-slate-950/90 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-sky-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Настраиваемая текстура:
                </span>
              </div>

              <div className="flex items-center gap-2 flex-1 sm:flex-none">
                <select
                  value={selectedLayerIndex === null ? 'base' : selectedLayerIndex}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'base') {
                      setSelectedLayerIndex(null);
                    } else if (val === 'add_new') {
                      setLayerPickerTargetIndex('new');
                      setShowLayerAssetPicker(true);
                    } else {
                      setSelectedLayerIndex(parseInt(val, 10));
                    }
                  }}
                  className="flex-1 sm:w-80 bg-slate-900 border border-slate-700 focus:border-sky-500 text-sky-300 font-bold text-xs rounded-xl px-3 py-1.5 outline-none cursor-pointer shadow-inner transition-colors"
                >
                  <option value="base">
                    🖼️ Базовая текстура ({model.cubes[selectedCubeIdx]?.faceTextures?.[selectedFaceTarget === 'all' ? 'top' : selectedFaceTarget] || model.cubes[selectedCubeIdx]?.textureId || 'Основной цвет'})
                  </option>
                  {activeTextureLayers.map((layer, lIdx) => (
                    <option key={layer.id || lIdx} value={lIdx}>
                      🏷️ Наклейка #{lIdx + 1}: {layer.name || layer.textureId} ({Math.round((layer.opacity ?? 1) * 100)}%)
                    </option>
                  ))}
                  <option value="add_new">➕ [Добавить новую наклейку / деталь...]</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setLayerPickerTargetIndex('new');
                    setShowLayerAssetPicker(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow flex items-center gap-1 flex-shrink-0 transition-all"
                  title="Добавить новую наклейку"
                >
                  <Plus size={12} />
                  <span className="hidden sm:inline">Новая наклейка</span>
                </button>
              </div>
            </div>

            {/* Quick Chips for Base Texture & Sticker Layers */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 border-b border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex-shrink-0">
                Быстрый выбор:
              </span>

              <button
                type="button"
                onClick={() => setSelectedLayerIndex(null)}
                className={`px-2.5 py-0.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all flex-shrink-0 border ${
                  selectedLayerIndex === null
                    ? 'bg-amber-500 text-slate-950 shadow border-amber-400'
                    : 'bg-slate-950/80 text-slate-300 hover:bg-slate-800 border-slate-800'
                }`}
              >
                <Image size={11} />
                <span>Базовая ({model.cubes[selectedCubeIdx]?.faceTextures?.[selectedFaceTarget === 'all' ? 'top' : selectedFaceTarget] || model.cubes[selectedCubeIdx]?.textureId || 'Цвет'})</span>
              </button>

              {activeTextureLayers.map((layer, lIdx) => {
                const isSelected = selectedLayerIndex === lIdx;
                return (
                  <button
                    key={layer.id || lIdx}
                    type="button"
                    onClick={() => setSelectedLayerIndex(lIdx)}
                    className={`px-2.5 py-0.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all flex-shrink-0 border ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 shadow border-sky-400'
                        : 'bg-slate-950/80 text-slate-300 hover:bg-slate-800 border-slate-800'
                    }`}
                  >
                    <Layers size={11} className={isSelected ? 'text-slate-950' : 'text-sky-400'} />
                    <span>Наклейка #{lIdx + 1} ({layer.name || layer.textureId})</span>
                  </button>
                );
              })}
            </div>

            {/* Controls Layout Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Column 1: Target Face Selector */}
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 flex flex-col justify-between gap-1.5 min-h-[90px]">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Область применения UV:
                </span>
                <div className="flex flex-col gap-1.5 flex-1 justify-center">
                  <button
                    type="button"
                    onClick={() => setSelectedFaceTarget('all')}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                      selectedFaceTarget === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow ring-1 ring-amber-300'
                        : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                    }`}
                    title="Применить UV ко всем граням"
                  >
                    Все грани (Куб)
                  </button>

                  {selectedFaceTarget !== 'all' && (
                    <div className="text-center bg-slate-950/40 py-1 rounded-lg border border-slate-900/40 text-[10px] font-bold text-slate-300 block truncate px-1">
                      Полигон: {getFaceMeta(selectedFaceTarget).dirName}
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Scale (Tiling) */}
              <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Масштаб (Тайлинг)
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 w-5">U:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={targetTransform.scaleU ?? 1.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isTextureAspectLocked) {
                        applyTransformPatch({ scaleU: val, scaleV: val });
                      } else {
                        applyTransformPatch({ scaleU: val });
                      }
                    }}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <span className="text-[9px] font-bold text-sky-300 w-7 text-right font-mono">
                    {(targetTransform.scaleU ?? 1.0).toFixed(1)}x
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 w-5">V:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={targetTransform.scaleV ?? 1.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isTextureAspectLocked) {
                        applyTransformPatch({ scaleU: val, scaleV: val });
                      } else {
                        applyTransformPatch({ scaleV: val });
                      }
                    }}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <span className="text-[9px] font-bold text-sky-300 w-7 text-right font-mono">
                    {(targetTransform.scaleV ?? 1.0).toFixed(1)}x
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {[
                    { label: '1x', scale: 1.0 },
                    { label: '2x', scale: 2.0 },
                    { label: '3x', scale: 3.0 },
                    { label: '0.5x', scale: 0.5 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyTransformPatch({ scaleU: p.scale, scaleV: p.scale })}
                      className={`py-0.5 rounded text-[9px] font-bold transition-all border ${
                        (targetTransform.scaleU ?? 1.0) === p.scale && (targetTransform.scaleV ?? 1.0) === p.scale
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column 3: Rotation & Flip */}
              <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Поворот & Отражение
                  </span>
                  <span className="text-[9px] font-bold text-amber-300 font-mono">
                    {targetTransform.rotation || 0}°
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={targetTransform.rotation || 0}
                  onChange={(e) => applyTransformPatch({ rotation: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />

                <div className="flex items-center justify-between gap-1">
                  <div className="grid grid-cols-4 gap-0.5 flex-1">
                    {[0, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => applyTransformPatch({ rotation: deg })}
                        className={`py-0.5 rounded text-[9px] font-bold transition-all border ${
                          (targetTransform.rotation || 0) === deg
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border-slate-800'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => applyTransformPatch({ flipU: !targetTransform.flipU })}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                      targetTransform.flipU
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`}
                    title="Отразить по X"
                  >
                    ↔X
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTransformPatch({ flipV: !targetTransform.flipV })}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                      targetTransform.flipV
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`}
                    title="Отразить по Y"
                  >
                    ↕Y
                  </button>
                </div>
              </div>

              {/* Column 4: Shift (Offset) */}
              <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/80 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Смещение (Сдвиг)
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 w-5">U:</span>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.05"
                    value={targetTransform.offsetU || 0}
                    onChange={(e) => applyTransformPatch({ offsetU: parseFloat(e.target.value) })}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[9px] font-bold text-emerald-300 w-8 text-right font-mono">
                    {(targetTransform.offsetU || 0) >= 0 ? `+${(targetTransform.offsetU || 0).toFixed(2)}` : (targetTransform.offsetU || 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 w-5">V:</span>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.05"
                    value={targetTransform.offsetV || 0}
                    onChange={(e) => applyTransformPatch({ offsetV: parseFloat(e.target.value) })}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[9px] font-bold text-emerald-300 w-8 text-right font-mono">
                    {(targetTransform.offsetV || 0) >= 0 ? `+${(targetTransform.offsetV || 0).toFixed(2)}` : (targetTransform.offsetV || 0).toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => applyTransformPatch({ offsetU: 0, offsetV: 0 })}
                  className="w-full py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[9px] font-bold border border-slate-800 transition-colors"
                >
                  Центрировать UV
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
