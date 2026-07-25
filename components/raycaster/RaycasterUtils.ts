
export const getAngleFromDir = (dir: number) => {
    return (dir - 1) * (Math.PI / 2);
};

export const normalizeAngle = (a: number) => {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
};

export const shortestAngleDiff = (from: number, to: number) => {
  return normalizeAngle(to - from);
};

export const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

export const easeInOutQuad = (t: number) => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export interface RaycasterBuffer {
    data: Uint32Array;
    width: number;
    height: number;
    id?: string;
    dirty?: boolean;
}

export const globalBufferCache = new Map<string, RaycasterBuffer>();

export const clearGlobalBufferCache = () => {
    globalBufferCache.clear();
};

export const createBufferFromImage = (img: HTMLImageElement, idKey?: string): RaycasterBuffer | null => {
    // We compose a cache key using both idKey and img src/properties to avoid returning a stale cache
    // entry when the texture for a generic target key (like 'sky' or 'wall') changes in the editor.
    const finalKey = idKey && img 
        ? `${idKey}_${(img as any).src || (img as any).version || (img.width + 'x' + img.height)}` 
        : (idKey || (img as any).src || (img as any).version || 'canvas_' + Math.random());
    
    // Quick cache hit
    if (globalBufferCache.has(finalKey)) {
        return globalBufferCache.get(finalKey)!;
    }
    if ((img as any).src && globalBufferCache.has((img as any).src)) {
        return globalBufferCache.get((img as any).src)!; 
    }

    const cvs = document.createElement('canvas');
    cvs.width = img.width;
    cvs.height = img.height;
    const c = cvs.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = false; 
    c.drawImage(img, 0, 0);
    const id = c.getImageData(0, 0, cvs.width, cvs.height);
    const buf: any = {
        data: new Uint32Array(id.data.buffer),
        width: cvs.width,
        height: cvs.height
    };
    
    const resolvedId = idKey || (img as any).src || 'buffer_' + Math.random();
    buf.id = resolvedId;

    globalBufferCache.set(finalKey, buf);
    
    return buf;
};

export const cloneBuffer = (buf: RaycasterBuffer): RaycasterBuffer => {
    const cloned: RaycasterBuffer = {
        data: new Uint32Array(buf.data),
        width: buf.width,
        height: buf.height
    };
    if (buf.id) cloned.id = buf.id;
    if (buf.dirty !== undefined) cloned.dirty = buf.dirty;
    return cloned;
};

const SHARED_ADJ = { x: 0, y: 0 };

export const adjustLightForClosedDoors = (
    lightX: number,
    lightY: number,
    rayDirX: number,
    rayDirY: number,
    grid: any[][] | undefined,
    activeGrids?: any[][][]
): { x: number, y: number } => {
    let lx = lightX;
    let ly = lightY;
    if (grid && ly >= 0 && ly < grid.length && lx >= 0 && lx < grid[0].length) {
        let tile = grid[ly][lx];
        let hasClosedDoor = tile && tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken;
        
        if (!hasClosedDoor && activeGrids && activeGrids[0] && activeGrids[0][ly]) {
            const baseTile = activeGrids[0][ly][lx];
            if (baseTile && baseTile.type === 'DOOR' && baseTile.door?.state !== 'OPEN' && !baseTile.door?.maskId && !baseTile.door?.broken) {
                tile = baseTile;
                hasClosedDoor = true;
            }
        }

        if (hasClosedDoor) {
            const leftW = grid[ly]?.[lx - 1]?.type === 'WALL';
            const rightW = grid[ly]?.[lx + 1]?.type === 'WALL';
            let doorAxis = 'H';
            if (tile.door?.type === 'HINGE') {
                if (tile.door.edge === 'TOP' || tile.door.edge === 'BOTTOM') doorAxis = 'H';
                else if (tile.door.edge === 'LEFT' || tile.door.edge === 'RIGHT') doorAxis = 'V';
                else doorAxis = (!leftW && !rightW) ? 'V' : 'H';
            } else {
                doorAxis = (leftW && rightW) ? 'H' : 'V';
            }

            if (doorAxis === 'V') {
                lx -= rayDirX > 0 ? 1 : (rayDirX < 0 ? -1 : 0);
            } else {
                ly -= rayDirY > 0 ? 1 : (rayDirY < 0 ? -1 : 0);
            }
        }
    }
    SHARED_ADJ.x = lx;
    SHARED_ADJ.y = ly;
    return SHARED_ADJ;
};
