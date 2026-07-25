
import { DOOR_THICKNESS } from './RaycasterConstants';

export interface DoorHitResult {
    hit: boolean;
    perpWallDist: number;
    doorOffset: number;
    side: number;
    isTextureFlipped: boolean;
    isDoorEdge?: boolean; 
    isFrame?: boolean; // New flag for door frame
}

// Configuration for the new door style
const FRAME_DEPTH = 0.1; // Thickness of the frame (Z-depth) - Reduced
const FRAME_WIDTH = 0.05; // Width of the side posts - Narrower
const LEAF_THICKNESS = 0.05; // Thinner door leaf
const DOOR_INSET = 0.1; // Position from the edge of the tile (flush-ish)

/**
 * Helper to intersect a static AABB (Axis Aligned Bounding Box) in local tile space [0..1, 0..1]
 */
const intersectAABB = (
    minX: number, maxX: number, minY: number, maxY: number,
    posX: number, posY: number, 
    rayDirX: number, rayDirY: number,
    mapX: number, mapY: number
) => {
    // Ray origin relative to tile corner
    const localX = posX - mapX;
    const localY = posY - mapY;

    let tmin = -Infinity, tmax = Infinity;
    let side = -1; // 0 for X-face, 1 for Y-face

    if (Math.abs(rayDirX) > 1e-9) {
        const t1 = (minX - localX) / rayDirX;
        const t2 = (maxX - localX) / rayDirX;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (localX < minX || localX > maxX) return null;

    if (Math.abs(rayDirY) > 1e-9) {
        const t1 = (minY - localY) / rayDirY;
        const t2 = (maxY - localY) / rayDirY;
        const tyMin = Math.min(t1, t2);
        const tyMax = Math.max(t1, t2);
        
        if (tyMin > tmin) {
            tmin = tyMin;
            side = 1; // Hit Y face
        } else {
            side = 0; // Hit X face (kept from previous check)
        }
        
        tmax = Math.min(tmax, tyMax);
    } else if (localY < minY || localY > maxY) return null;

    if (tmax < tmin || tmax < 0) return null;
    if (tmin <= 0.001) return null; // Ignore internal/behind hits

    // Calculate hit point for UVs
    const hitX = localX + tmin * rayDirX;
    const hitY = localY + tmin * rayDirY;
    
    return { t: tmin, side, hitX, hitY };
};

/**
 * Calculates ray intersection with a hinged door with a FRAME.
 * Door is flush with the edge and opens INTO the tile.
 */
export const calculateHingeIntersection = (
    mapX: number,
    mapY: number,
    posX: number,
    posY: number,
    rayDirX: number,
    rayDirY: number,
    openAmount: number,
    dir: 'LEFT' | 'RIGHT' | undefined,
    edge: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'AUTO' | undefined,
    grid: any[][]
): DoorHitResult | null => {
    // 1. Determine Orientation
    const leftW = grid[mapY]?.[mapX - 1]?.type === 'WALL';
    const rightW = grid[mapY]?.[mapX + 1]?.type === 'WALL';
    
    let doorAxis = (!leftW && !rightW) ? 'V' : 'H';
    let frameY = DOOR_INSET;
    let frameX = DOOR_INSET;
    let flipSwing = false;
    
    if (edge === 'TOP') { doorAxis = 'H'; frameY = DOOR_INSET; flipSwing = false; }
    else if (edge === 'BOTTOM') { doorAxis = 'H'; frameY = 1.0 - DOOR_INSET - FRAME_DEPTH; flipSwing = true; }
    else if (edge === 'LEFT') { doorAxis = 'V'; frameX = DOOR_INSET; flipSwing = false; }
    else if (edge === 'RIGHT') { doorAxis = 'V'; frameX = 1.0 - DOOR_INSET - FRAME_DEPTH; flipSwing = true; }

    // --- GEOMETRY DEFINITION ---
    // We define the door relative to the tile's local space (0..1)
    // Frame consists of two posts. Door leaf swings between them.
    
    // Bounds for H-Door (extends along X)
    // Post 1: Left
    // Post 2: Right
    // Door Leaf: Middle
    
    let p1MinX, p1MaxX, p1MinY, p1MaxY;
    let p2MinX, p2MaxX, p2MinY, p2MaxY;
    let hingeX, hingeY;
    let baseRotation;
    let swingDir; // 1 or -1

    if (doorAxis === 'H') {
        // Horizontal Door
        // Post 1 (Left)
        p1MinX = 0.0; p1MaxX = FRAME_WIDTH;
        p1MinY = frameY; p1MaxY = frameY + FRAME_DEPTH;
        
        // Post 2 (Right)
        p2MinX = 1.0 - FRAME_WIDTH; p2MaxX = 1.0;
        p2MinY = frameY; p2MaxY = frameY + FRAME_DEPTH;

        // Hinge Position & Rotation
        if (dir === 'LEFT') {
            hingeX = FRAME_WIDTH; // Attached to Left Post
            hingeY = frameY + (FRAME_DEPTH / 2); // Center of frame thickness
            baseRotation = 0; // Pointing East
            swingDir = flipSwing ? -1 : 1; // Open "Down/South" (Into the tile) or UP if flipped
        } else {
            hingeX = 1.0 - FRAME_WIDTH; // Attached to Right Post
            hingeY = frameY + (FRAME_DEPTH / 2);
            baseRotation = Math.PI; // Pointing West
            swingDir = flipSwing ? 1 : -1; 
        }
    } else {
        // Vertical Door
        // Post 1 (Top)
        p1MinX = frameX; p1MaxX = frameX + FRAME_DEPTH;
        p1MinY = 0.0; p1MaxY = FRAME_WIDTH;

        // Post 2 (Bottom)
        p2MinX = frameX; p2MaxX = frameX + FRAME_DEPTH;
        p2MinY = 1.0 - FRAME_WIDTH; p2MaxY = 1.0;

        if (dir === 'LEFT') { // Top Hinge
            hingeX = frameX + (FRAME_DEPTH / 2);
            hingeY = FRAME_WIDTH;
            baseRotation = Math.PI / 2; // Pointing South
            swingDir = flipSwing ? 1 : -1; // Open "Right/East" (Into tile) or LEFT if flipped
        } else { // Bottom Hinge
            hingeX = frameX + (FRAME_DEPTH / 2);
            hingeY = 1.0 - FRAME_WIDTH;
            baseRotation = -Math.PI / 2; // Pointing North
            swingDir = flipSwing ? -1 : 1; 
        }
    }

    // --- CHECK FRAMES ---
    const hitP1 = intersectAABB(p1MinX, p1MaxX, p1MinY, p1MaxY, posX, posY, rayDirX, rayDirY, mapX, mapY);
    const hitP2 = intersectAABB(p2MinX, p2MaxX, p2MinY, p2MaxY, posX, posY, rayDirX, rayDirY, mapX, mapY);

    // --- CHECK DOOR LEAF ---
    // Leaf is a rotated AABB
    // Width = 1.0 - (2 * FRAME_WIDTH)
    // Height = LEAF_THICKNESS
    // It's attached at (0, 0) in local rotated space
    
    const leafWidth = 1.0 - (2 * FRAME_WIDTH);
    const swingAngle = openAmount * (Math.PI / 2) * swingDir;
    const totalRotation = baseRotation + swingAngle;

    let cosA = 0;
    let sinA = 0;
    const doorObj = grid[mapY]?.[mapX]?.door;
    if (doorObj && (doorObj as any)._cachedOpenAmount === openAmount && (doorObj as any)._cachedTotalRotation === totalRotation) {
        cosA = (doorObj as any)._cachedCos;
        sinA = (doorObj as any)._cachedSin;
    } else {
        cosA = Math.cos(-totalRotation);
        sinA = Math.sin(-totalRotation);
        if (doorObj) {
            (doorObj as any)._cachedOpenAmount = openAmount;
            (doorObj as any)._cachedTotalRotation = totalRotation;
            (doorObj as any)._cachedCos = cosA;
            (doorObj as any)._cachedSin = sinA;
        }
    }

    // Transform ray to local door space (Pivot at 0,0)
    const dx = posX - (mapX + hingeX);
    const dy = posY - (mapY + hingeY);
    const localPosX = dx * cosA - dy * sinA;
    const localPosY = dx * sinA + dy * cosA;
    const localDirX = rayDirX * cosA - rayDirY * sinA;
    const localDirY = rayDirX * sinA + rayDirY * cosA;

    // Leaf Bounds (Local)
    // Starts at 0, goes to +LeafWidth
    // Centered on thickness Y
    const lMinX = 0; const lMaxX = leafWidth;
    const lMinY = -LEAF_THICKNESS / 2; const lMaxY = LEAF_THICKNESS / 2;

    let tminLeaf = -Infinity, tmaxLeaf = Infinity;
    let leafSide = -1;

    // Slab intersection for rotated leaf
    if (Math.abs(localDirX) > 1e-9) {
        const t1 = (lMinX - localPosX) / localDirX;
        const t2 = (lMaxX - localPosX) / localDirX;
        tminLeaf = Math.max(tminLeaf, Math.min(t1, t2));
        tmaxLeaf = Math.min(tmaxLeaf, Math.max(t1, t2));
    } else if (localPosX < lMinX || localPosX > lMaxX) tminLeaf = -1; // invalid

    if (Math.abs(localDirY) > 1e-9) {
        const t1 = (lMinY - localPosY) / localDirY;
        const t2 = (lMaxY - localPosY) / localDirY;
        const tyMin = Math.min(t1, t2);
        const tyMax = Math.max(t1, t2);
        if (tyMin > tminLeaf) { tminLeaf = tyMin; leafSide = 1; } // Hit Face
        else leafSide = 0; // Hit Edge
        tmaxLeaf = Math.min(tmaxLeaf, tyMax);
    } else if (localPosY < lMinY || localPosY > lMaxY) tminLeaf = -1;

    let hitLeaf = null;
    if (tmaxLeaf >= tminLeaf && tminLeaf > 0.001) {
        const hitLX = localPosX + tminLeaf * localDirX;
        const hitLY = localPosY + tminLeaf * localDirY;
        hitLeaf = { t: tminLeaf, side: leafSide, hitX: hitLX, hitY: hitLY };
    }

    // --- FIND CLOSEST HIT ---
    let bestHit = null;
    let type = 'NONE'; // 'FRAME' or 'LEAF'

    if (hitP1) {
        bestHit = hitP1;
        type = 'FRAME';
    }
    if (hitP2 && (!bestHit || hitP2.t < bestHit.t)) {
        bestHit = hitP2;
        type = 'FRAME';
    }
    if (hitLeaf && (!bestHit || hitLeaf.t < bestHit.t)) {
        bestHit = hitLeaf;
        type = 'LEAF';
    }

    if (!bestHit) return null;

    // --- CALCULATE UVs ---
    let u = 0;
    let isEdge = false;

    if (type === 'FRAME') {
        // Normalize UVs for frame parts to prevent stretching
        let minX, maxX, minY, maxY;
        if (bestHit === hitP1) {
            minX = p1MinX; maxX = p1MaxX; minY = p1MinY; maxY = p1MaxY;
        } else {
            minX = p2MinX; maxX = p2MaxX; minY = p2MinY; maxY = p2MaxY;
        }

        if (bestHit.side === 1) { 
            // Hit Face (Y plane)
            // Normalize X within the post width
            u = (bestHit.hitX - minX) / (maxX - minX);
        } else {
            // Hit Edge (X plane)
            // Normalize Y within the post depth
            u = (bestHit.hitY - minY) / (maxY - minY);
        }
    } else {
        // Door Leaf
        if (bestHit.side === 1) { 
            // Hit Face (Y plane in local) -> Texture along X (Length)
            u = bestHit.hitX / leafWidth; 
            isEdge = false;
        } else {
            // Hit Edge (X plane) -> Texture along Y (Thickness)
            u = (bestHit.hitY - lMinY) / LEAF_THICKNESS;
            isEdge = true;
        }
    }

    let isFlipped = false;
    if (type === 'FRAME') {
        isFlipped = (bestHit.side === 1 && rayDirY > 0) || (bestHit.side === 0 && rayDirX < 0);
    } else {
        isFlipped = false;
    }

    let globalSide = bestHit.side;
    if (type === 'LEAF') {
        if (bestHit.side === 1) { 
            // Hit Face (local Y plane)
            const nx = -Math.sin(totalRotation);
            const ny = Math.cos(totalRotation);
            globalSide = Math.abs(nx) > Math.abs(ny) ? 0 : 1;
        } else { 
            // Hit Edge (local X plane)
            const nx = Math.cos(totalRotation);
            const ny = Math.sin(totalRotation);
            globalSide = Math.abs(nx) > Math.abs(ny) ? 0 : 1;
        }
    }

    return {
        hit: true,
        perpWallDist: bestHit.t,
        doorOffset: u,
        side: globalSide, // 0 for X-axis face, 1 for Y-axis face
        isTextureFlipped: isFlipped,
        isDoorEdge: isEdge,
        isFrame: type === 'FRAME'
    };
};

/**
 * Calculates ray intersection with a sliding door treated as a 3D Slab (AABB).
 * Modified to support center-split opening (dual panels).
 */
export const calculateSlideIntersection = (
    mapX: number,
    mapY: number,
    posX: number,
    posY: number,
    rayDirX: number,
    rayDirY: number,
    sideDistX: number,
    sideDistY: number,
    deltaDistX: number,
    deltaDistY: number,
    side: number,
    openAmount: number,
    grid?: any[][] // Passed to detect orientation
): DoorHitResult | null => {
    
    // 1. Determine Axis (H = along X, V = along Y)
    let doorAxis = 'H';
    const tileDoor = grid ? grid[mapY]?.[mapX]?.door : null;
    if (tileDoor && tileDoor._axis) {
        doorAxis = tileDoor._axis;
    } else if (grid) {
        const leftW = grid[mapY]?.[mapX - 1]?.type === 'WALL';
        const rightW = grid[mapY]?.[mapX + 1]?.type === 'WALL';
        doorAxis = (leftW && rightW) ? 'H' : 'V';
        if (tileDoor) tileDoor._axis = doorAxis;
    }

    // 2. Define Slab Bounds relative to Tile (0..1)
    const rStart = 0.5 - (DOOR_THICKNESS / 2);
    const rEnd = 0.5 + (DOOR_THICKNESS / 2);
    
    // Dual Panel Logic:
    // Panels slide outwards from center.
    // Displacement per panel = openAmount * 0.5
    const displacement = openAmount * 0.5;
    
    // Panel 1 (Left/Top): [0, 0.5 - displacement]
    const p1Start = 0.0;
    const p1End = Math.max(0.0, 0.5 - displacement);
    
    // Panel 2 (Right/Bottom): [0.5 + displacement, 1.0]
    const p2Start = Math.min(1.0, 0.5 + displacement);
    const p2End = 1.0;

    // Helper to check intersection with a specific slab range [dStart, dEnd]
    const checkSlab = (dStart: number, dEnd: number): { t: number, offset: number, edge: boolean, side: number } | null => {
        if (dEnd <= dStart + 0.001) return null; // Too small or inverted

        let minX, maxX, minY, maxY;
        if (doorAxis === 'H') {
            minX = mapX + dStart; maxX = mapX + dEnd;
            minY = mapY + rStart; maxY = mapY + rEnd;
        } else {
            minX = mapX + rStart; maxX = mapX + rEnd;
            minY = mapY + dStart; maxY = mapY + dEnd;
        }

        let tmin = -Infinity, tmax = Infinity;
        let slabNormalSide = -1;

        // Check X planes
        if (Math.abs(rayDirX) > 1e-9) {
            const t1 = (minX - posX) / rayDirX;
            const t2 = (maxX - posX) / rayDirX;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (posX < minX || posX > maxX) return null;

        // Check Y planes
        if (Math.abs(rayDirY) > 1e-9) {
            const t1 = (minY - posY) / rayDirY;
            const t2 = (maxY - posY) / rayDirY;
            const tyMin = Math.min(t1, t2);
            const tyMax = Math.max(t1, t2);
            
            if (tyMin > tmin) {
                tmin = tyMin;
                // If tmin was updated by Y-slab, the normal is on Y (side=1)
                slabNormalSide = 1;
            } else {
                // Keep X-slab normal (side=0)
                slabNormalSide = 0;
            }
            tmax = Math.min(tmax, tyMax);
        } else if (posY < minY || posY > maxY) return null;

        if (tmax < tmin || tmax < 0) return null;
        if (tmin <= 0) return null; // Intersection behind or inside

        // Hit Point
        const hitX = posX + tmin * rayDirX;
        const hitY = posY + tmin * rayDirY;
        
        let offset = 0;
        let isEdge = false;

        // Determine Offset (0..1 along slab dimension or thickness)
        if (doorAxis === 'H') {
            if (slabNormalSide === 1) { // Hit Face (Y-plane)
                // Use X coordinate within tile
                offset = hitX - Math.floor(hitX);
                isEdge = false;
            } else { // Hit Edge (Thickness)
                offset = (hitY - Math.floor(hitY) - rStart) / DOOR_THICKNESS;
                isEdge = true;
            }
        } else {
            if (slabNormalSide === 0) { // Hit Face (X-plane)
                // Use Y coordinate within tile
                offset = hitY - Math.floor(hitY);
                isEdge = false;
            } else { // Hit Edge
                offset = (hitX - Math.floor(hitX) - rStart) / DOOR_THICKNESS;
                isEdge = true;
            }
        }
        
        return { t: tmin, offset, edge: isEdge, side: slabNormalSide };
    };

    const hit1 = checkSlab(p1Start, p1End);
    const hit2 = checkSlab(p2Start, p2End);

    let bestHit = null;
    let isPanel1 = false;

    // Pick closest valid hit
    if (hit1 && hit2) {
        if (hit1.t < hit2.t) { bestHit = hit1; isPanel1 = true; }
        else { bestHit = hit2; isPanel1 = false; }
    } else if (hit1) {
        bestHit = hit1; isPanel1 = true;
    } else if (hit2) {
        bestHit = hit2; isPanel1 = false;
    }

    if (!bestHit) return null;

    // Texture Scroll Adjustment
    let finalOffset = bestHit.offset;
    if (!bestHit.edge) {
        // Shift texture based on panel movement
        // Panel 1 (Left) slides Left: texture coord shifts +disp
        // Panel 2 (Right) slides Right: texture coord shifts -disp
        if (isPanel1) {
            finalOffset = bestHit.offset + displacement;
        } else {
            finalOffset = bestHit.offset - displacement;
        }
    }

    return {
        hit: true,
        perpWallDist: bestHit.t,
        doorOffset: finalOffset,
        side: bestHit.side,
        isTextureFlipped: (bestHit.side === 1 && rayDirY > 0) || (bestHit.side === 0 && rayDirX < 0),
        isDoorEdge: bestHit.edge
    };
};
