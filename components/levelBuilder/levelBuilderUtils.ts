import { LevelDefinition } from "../../types";
import { ASSETS } from "../../assets";
import animationsData from "../../data/animations.json";

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
