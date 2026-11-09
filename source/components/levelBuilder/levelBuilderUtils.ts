import { LevelDefinition } from "../../types";
import { ASSETS } from "../../assets";
import animationsData from "../../data/animations.json";
import enemiesData from "../../data/enemies.json";
import npcsData from "../../data/npcs.json";
import itemsData from "../../data/items.json";
import decorationsData from "../../data/decorations.json";

const entityPreviewCache = new Map<string, string | null>();

export const getEntityPreviewUrl = (
  entityType: 'enemy' | 'npc' | 'item' | 'decoration' | string,
  id: string
): string | null => {
  if (!id) return null;
  const cacheKey = `${entityType}:${id}`;
  if (entityPreviewCache.has(cacheKey)) {
    return entityPreviewCache.get(cacheKey)!;
  }

  let assetId: string | undefined = undefined;

  if (entityType === 'enemy' && (enemiesData as any)[id]) {
    const enemy = (enemiesData as any)[id];
    assetId = enemy?.assets?.map?.assetId || enemy?.assets?.portrait?.assetId || enemy?.assets?.attack?.assetId || enemy?.assets?.dead?.assetId || enemy?.assetId;
  } else if (entityType === 'npc' && (npcsData as any)[id]) {
    const npc = (npcsData as any)[id];
    assetId = npc?.assets?.map?.assetId || npc?.assets?.portrait?.assetId || npc?.assets?.hands_up?.assetId || npc?.assetId || npc?.asset;
  } else if (entityType === 'item' && (itemsData as any)[id]) {
    const item = (itemsData as any)[id];
    assetId = item?.assetId || item?.icon || item?.dollAssetId || item?.handAsset || item?.asset;
  } else if (entityType === 'decoration' && (decorationsData as any)[id]) {
    const dec = (decorationsData as any)[id];
    assetId = dec?.assetId || dec?.asset;
  }

  if (!assetId) {
    if ((enemiesData as any)[id]) {
      const e = (enemiesData as any)[id];
      assetId = e?.assets?.map?.assetId || e?.assets?.portrait?.assetId || e?.assetId;
    } else if ((npcsData as any)[id]) {
      const n = (npcsData as any)[id];
      assetId = n?.assets?.map?.assetId || n?.assets?.portrait?.assetId || n?.assetId;
    } else if ((itemsData as any)[id]) {
      const i = (itemsData as any)[id];
      assetId = i?.assetId || i?.icon || i?.dollAssetId || i?.handAsset;
    } else if ((decorationsData as any)[id]) {
      const d = (decorationsData as any)[id];
      assetId = d?.assetId || d?.asset;
    }
  }

  const result = getPreviewSrc(assetId || id);
  entityPreviewCache.set(cacheKey, result);
  return result;
};

export const getPreviewSrc = (assetId: string | undefined): string | null => {
  if (!assetId) return null;
  let src = null;
  if (assetId.startsWith('local://')) {
      src = assetId;
  } else if ((ASSETS.TEXTURES as any)[assetId]) {
      src = (ASSETS.TEXTURES as any)[assetId];
  } else if ((ASSETS.SPRITES as any)[assetId]) {
      src = (ASSETS.SPRITES as any)[assetId];
  } else if ((ASSETS.SOUNDS as any)[assetId]) {
      src = (ASSETS.SOUNDS as any)[assetId];
  } else {
    const anim = (animationsData as any)[assetId];
    if (anim && anim.frames && anim.frames.length > 0) {
       const frame = anim.frames[0];
       src = (ASSETS.TEXTURES as any)[frame] || (ASSETS.SPRITES as any)[frame] || null;
    }
  }
  
  if (src && src.startsWith('local://')) {
      const localData = localStorage.getItem(src.substring(8));
      if (localData) return localData;
  }
  return src;
};

export const isTextureAsset = (assetId: string | undefined): boolean => {
  if (!assetId) return false;
  if ((ASSETS.TEXTURES as any)[assetId]) return true;
  const anim = (animationsData as any)[assetId];
  if (anim && anim.frames && anim.frames.length > 0) {
     const frame = anim.frames[0];
     if ((ASSETS.TEXTURES as any)[frame]) return true;
  }
  return false;
};

export const getAvailableSymbol = (
  currentLevel: LevelDefinition,
  type: "construction" | "door" | "light" | "portal" | "entity" | "sound" | "item",
  preferredContent?: string,
): string => {
  const defaultChars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZабвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン日月火水木金土山川田天地人左右上下大中小男女本学国車花魚鳥風雨星海空電火氷石金銀銅剣盾弓★☆◆◇●○■□△▽▲▼♠♣♥♦⚓⚔🛡🏹🔮🧿🕯️🏮🎐🎎🎍🎋🎌🚩🏴‍☠️░▒▓█▢▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱☀☁☂☃☄☇☈☉☊☋☌☍☎☏☐☑☒☓☔☕☖☗☘☙☚☛☜☝☞☟☠☡☢☣☤☥☦☧☨☩☪☫☬☭☮☯☰☱☲☳☴☵☶☷☸☹☺☻☼☽☾☿♀♁♂♃♄♅♆♇♈♉♊♋♌♍♎♏♐♑♒♓♔♕♖♗♘♙♚♛♜♝♞♟♠♡♢♣♤♥♦♧♨♩♪♫♬♭♮♯♰♱♲♳♴♵♶♷♸♹♺♻♼♽♾♿⚀⚁⚂⚃⚄⚅⚆⚇⚈⚉⚊⚋⚌⚍⚎⚏⚐⚑⚒⚓⚔⚕⚖⚗⚘⚙⚚⚛⚜⚝⚞⚟⚠⚡⚢⚣⚤⚥⚦⚧⚨⚩⚪⚫⚬⚭⚮⚯⚰⚱⚲⚳⚴⚵⚶⚷⚸⚹⚺⚻⚼⚽⚾⚿⛀⛁⛂⛃⛄⛅⛈⛆⛇⛈⛉⛊⛋⛌⛍⛎⛏⛐⛑⛒⛓⛔⛕⛖⛗⛘⛙⛚⛛⛜⛝⛞⛟⛠⛡⛢⛣⛤⛥⛦⛧⛨⛩⛪⛫⛬⛭⛮⛯⛰⛱⛲⛳⛴⛵⛶⛷⛸⛹⛺⛻⛽⛼⛄⛅⛈⛆⛇!@#$^&*=_+|}{;:<>";

  const itemChars = "abcdefghijklmnopqrstuvwxyz0123456789%()[]-~'\"/\\αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";
  const chars = type === "item" ? itemChars + defaultChars : defaultChars + itemChars;
  
  const takenSyms = new Set<string>();

  if (type === "construction") {
    currentLevel.construction?.forEach((c) => takenSyms.add(c.symbol));
    takenSyms.add(" ");
    takenSyms.add(".");
    takenSyms.add(currentLevel.playerStart?.symbol || "S");
    takenSyms.add("#"); // default wall
  } else if (type === "entity" || type === "portal" || type === "door" || type === "item") {
    currentLevel.portals?.forEach((c) => takenSyms.add(c.symbol));
    currentLevel.enemies?.forEach((c) => takenSyms.add(c.symbol));
    currentLevel.NPCs?.forEach((c) => takenSyms.add(c.symbol));
    currentLevel.items?.forEach((c) => takenSyms.add(c.symbol));
    currentLevel.decorations?.forEach((c) => takenSyms.add(c.symbol));
    if (currentLevel.doorDefinitions) {
      Object.keys(currentLevel.doorDefinitions).forEach((k) => takenSyms.add(k));
    }
    takenSyms.add(currentLevel.playerStart?.symbol || "S");
    takenSyms.add(".");
  } else if (type === "light") {
    if (currentLevel.lightDefinitions) {
      Object.keys(currentLevel.lightDefinitions).forEach((k) => takenSyms.add(k));
    }
    takenSyms.add(".");
    takenSyms.add(" ");
  } else if (type === "sound") {
    currentLevel.ambientSounds?.forEach((s) => s.symbol && takenSyms.add(s.symbol));
    takenSyms.add(".");
    takenSyms.add(" ");
  }

  if (preferredContent && !takenSyms.has(preferredContent)) {
    return preferredContent;
  }

  for (const char of chars) {
    if (!takenSyms.has(char)) {
      return char;
    }
  }

  return "?";
};

export const resolveDoorBrushSymbol = (
  brush: any,
  currentLevel: LevelDefinition,
) => {
  if (brush.symbol) {
    const existing =
      currentLevel.doorDefinitions &&
      currentLevel.doorDefinitions[brush.symbol];
    if (existing) {
      return { symbol: brush.symbol, newConstruction: null, newDoorConfig: { ...brush } };
    }
    // New door with specific symbol requested
    return { symbol: brush.symbol, newConstruction: null, newDoorConfig: { ...brush } };
  }

  const newSym = getAvailableSymbol(currentLevel, "door");
  return { symbol: newSym, newConstruction: null, newDoorConfig: { ...brush, symbol: newSym } };
};

export const resolveBrushSymbol = (
  brush: any,
  currentLevel: LevelDefinition,
) => {
  if (brush.symbol) {
    const existing = currentLevel.construction?.find(
      (c) => c.symbol === brush.symbol,
    );
    if (existing) {
      return { symbol: brush.symbol, newDoorConfig: null, newConstruction: { ...brush } };
    }
    return { symbol: brush.symbol, newDoorConfig: null, newConstruction: { ...brush } };
  }

  const newSym = getAvailableSymbol(currentLevel, "construction");
  return {
    symbol: newSym,
    newDoorConfig: null,
    newConstruction: { ...brush, symbol: newSym },
  };
};

export const resolveLightBrushSymbol = (brush: any, currentLevel: LevelDefinition) => {
  if (brush.symbol && brush.symbol !== '.') {
    return { symbol: brush.symbol, newLightConfig: { ...brush } };
  }

  const newSym = getAvailableSymbol(currentLevel, "light");
  return { symbol: newSym, newLightConfig: { ...brush, symbol: newSym } };
};

export const resolveEntityBrushSymbol = (brush: any, currentLevel: LevelDefinition) => {
  if (brush.symbol) {
    return { symbol: brush.symbol, newEntityConfig: { ...brush } };
  }

  const type = brush.entityType === 'item' ? 'item' : 'entity';
  const newSym = getAvailableSymbol(currentLevel, type);
  return { symbol: newSym, newEntityConfig: { ...brush, symbol: newSym } };
};

export const resolvePortalBrushSymbol = (brush: any, currentLevel: LevelDefinition) => {
  if (brush.symbol) {
    return { symbol: brush.symbol, newPortalConfig: { ...brush } };
  }

  const newSym = getAvailableSymbol(currentLevel, "portal");
  return { symbol: newSym, newPortalConfig: { ...brush, symbol: newSym } };
};

export const resolveSoundBrushSymbol = (brush: any, currentLevel: LevelDefinition) => {
  if (brush.symbol) {
    return { symbol: brush.symbol, newSoundConfig: { ...brush } };
  }

  const newSym = getAvailableSymbol(currentLevel, "sound");
  return { symbol: newSym, newSoundConfig: { ...brush, symbol: newSym } };
};

export interface OverrideEntry {
  suffix: string;
  data: any;
}

export const deleteCellOverrides = (
  entityOverrides: Record<string, any> | undefined,
  floor: number,
  y: number,
  x: number
): void => {
  if (!entityOverrides) return;
  const prefix = `${floor}_${y}_${x}`;
  const keysToDelete: string[] = [];
  for (const k in entityOverrides) {
    if (k === prefix || k.startsWith(`${prefix}_`)) {
      keysToDelete.push(k);
    }
  }
  for (const k of keysToDelete) {
    delete entityOverrides[k];
  }
};

export const getCellOverrides = (
  entityOverrides: Record<string, any> | undefined,
  floor: number,
  y: number,
  x: number
): OverrideEntry[] => {
  const result: OverrideEntry[] = [];
  if (!entityOverrides) return result;
  const prefix = `${floor}_${y}_${x}`;
  for (const k in entityOverrides) {
    if (k === prefix || k.startsWith(`${prefix}_`)) {
      result.push({
        suffix: k.slice(prefix.length),
        data: typeof entityOverrides[k] === 'object' && entityOverrides[k] !== null
          ? JSON.parse(JSON.stringify(entityOverrides[k]))
          : entityOverrides[k]
      });
    }
  }
  return result;
};

export const getAndClearCellOverrides = (
  entityOverrides: Record<string, any> | undefined,
  floor: number,
  y: number,
  x: number
): OverrideEntry[] => {
  const result: OverrideEntry[] = [];
  if (!entityOverrides) return result;
  const prefix = `${floor}_${y}_${x}`;
  const keysToDelete: string[] = [];
  for (const k in entityOverrides) {
    if (k === prefix || k.startsWith(`${prefix}_`)) {
      result.push({
        suffix: k.slice(prefix.length),
        data: entityOverrides[k]
      });
      keysToDelete.push(k);
    }
  }
  for (const k of keysToDelete) {
    delete entityOverrides[k];
  }
  return result;
};

export const applyCellOverrides = (
  entityOverridesTarget: Record<string, any>,
  floor: number,
  targetY: number,
  targetX: number,
  entries: OverrideEntry[]
): void => {
  if (!entries || entries.length === 0) return;
  const targetPrefix = `${floor}_${targetY}_${targetX}`;
  for (const entry of entries) {
    entityOverridesTarget[`${targetPrefix}${entry.suffix}`] = entry.data;
  }
};

