
import { Tile, AnimationConfig } from '../../types';
import { RaycasterBuffer } from './RaycasterUtils';

export interface PassThroughDoor {
    x: number; 
    perpWallDist: number;
    side: number;
    openAmount: number;
    tileX: number;
    tileY: number;
    rayDirX: number;
    rayDirY: number;
    posX: number;
    posY: number;
    // Extended properties for all door types
    type?: 'HINGE' | 'SLIDE' | 'LIFT';
    doorOffset?: number; // U-coordinate (0..1)
    isDoorEdge?: boolean;
    isFrame?: boolean;
    isTextureFlipped?: boolean;
    textureId?: string;
    maskId?: string;
    isBroken?: boolean;
    clipBottom?: number;
}

export interface PassThroughWall {
    dist: number;
    exitDist: number; // Exact distance where ray leaves the block
    mapX: number;
    mapY: number;
    side: number;
    layer: number;
    topZ?: number;
    bottomZ?: number;
    isWindow?: boolean;
    cutoutTop?: number;
    cutoutBottom?: number;
    cutoutLeft?: number;
    cutoutRight?: number;
    glassTransparency?: number;
    glassOffset?: number;
    glassDist?: number;
    cutoutAxis?: 'NS' | 'WE' | 'AUTO';
    isPitWall?: boolean;
    isFloorWall?: boolean;
    pitTextureId?: string;
    bottomTextureId?: string;
    topTextureId?: string;
    clipBottom?: number;
    isOccluderOnly?: boolean;
    isPolyOccluder?: boolean;
    wallTop?: number;
    wallBottom?: number;
    isStepDown?: boolean;
    isCutoutColumn?: boolean;
}

export interface MirrorReflection {
    drawStart: number;
    drawEnd: number;
    perpWallDist: number;
    refRayDirX: number;
    refRayDirY: number;
    mirrorHitX: number;
    mirrorHitY: number;
    side: number;
    maskTop: number;
    maskBottom: number;
    mirrorRefDist: number;
    // Overlay info
    rMult: number;
    gMult: number;
    bMult: number;
    fR: number;
    fG: number;
    fB: number;
    texX: number;
    step: number;
    texPosStart: number;
    mirrorAlpha: number;
    textureId?: string;
    mirrorPassThroughWalls?: any[];
}

export interface WallRenderProps {
    width: number;
    height: number;
    grid: Tile[][];
    grids?: Tile[][][];
    posX: number;
    posY: number;
    dirX: number;
    dirY: number;
    planeX: number;
    planeY: number;
    horizon: number;
    wallBuffer: RaycasterBuffer | null;
    doorBuffer: RaycasterBuffer | null;
    lightMap?: { r: number; g: number; b: number }[][];
    floorLightMaps?: { r: number; g: number; b: number }[][][];
    outdoorMap?: boolean[][];
    lightningMap?: Float32Array | null;
    lightningIntensity: number;
    muzzleFlashIntensity: number; 
    debugTextures: boolean;
    activeFlashes?: {x: number, y: number, intensity: number}[]; 
    spriteMap: Map<string, HTMLImageElement>;
    animations: AnimationConfig;
    customWallBuffers?: Map<number, RaycasterBuffer>; // OPTIMIZED: Number key
    screenBuffer: Uint32Array; 
    auxBuffers?: Map<string, RaycasterBuffer>;
    // Reused Buffers
    zBuffer: Float32Array;
    solidWallTopBuffer?: Int32Array;
    passThroughDoors: PassThroughDoor[][];
    passThroughWalls: PassThroughWall[][];
    mirrorReflections: MirrorReflection[][];
    ceilingType: 'INDOOR' | 'OUTDOOR';
    skyBuffer: RaycasterBuffer | null;
    floorBuffer: RaycasterBuffer | null;
    ceilingBuffer: RaycasterBuffer | null;
    fov: number;
    cameraZ: number;
    customFloorBuffers?: Map<number, RaycasterBuffer>; 
    rowDistances: Float32Array;
    resolutionDivisor?: number;
    flashlightActive?: boolean;
    flashlightBatteryRatio?: number;
    renderDistance: number;
    reusableHighlightSet?: Set<number>;
    polyObjectsList?: any[];
}

export interface SpriteShadow {
    x: number;
    y: number;
    rx: number;
    ry: number;
}
