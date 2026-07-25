import { Tile } from '../../types';

export const computeLightningMap = (grid: Tile[][], outdoorMap?: boolean[][]): Float32Array | null => {
    if (!grid || !outdoorMap) return null;
    
    const height = grid.length;
    const width = grid[0]?.length || 0;
    if (width === 0 || height === 0) return null;

    const map = new Float32Array(width * height);
    const isBlock = new Uint8Array(width * height);
    
    const qX: number[] = [];
    const qY: number[] = [];
    const qInt: number[] = [];
    
    // Precompute blocking status to avoid object property access in hot loop
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = grid[y][x];
            const isWall = tile && tile.type === 'WALL' && !tile.isWindow;
            if (tile && ((tile.type === 'WALL' && !tile.isWindow) || (tile.type === 'DOOR' && tile.door?.state !== 'OPEN' && !tile.door?.maskId && !tile.door?.broken))) {
                isBlock[y * width + x] = 1;
            }
            // Set all outdoor tiles to 1.0 and add them to queue (except WALL blocks, which must remain at 0.0)
            if (outdoorMap[y] && outdoorMap[y][x]) {
                const idx = y * width + x;
                if (isWall) {
                    map[idx] = 0.0;
                } else {
                    map[idx] = 1.0;
                    if (!isBlock[idx]) {
                        qX.push(x);
                        qY.push(y);
                        qInt.push(1.0);
                    }
                }
            }
        }
    }
    
    // Fast BFS propagation for lightning (simulates light bouncing under canopies)
    // Limits spread to ~5-6 tiles into open areas, but respects walls and closed doors.
    const FALLOFF_ORTHO = 0.18; // Slightly faster falloff to prevent deep room bleed
    const FALLOFF_DIAG = 0.25;  // ~sqrt(2) * 0.18
    
    let head = 0;
    while (head < qX.length) {
        const x = qX[head];
        const y = qY[head];
        const intensity = qInt[head];
        head++;
        
        // 8-way propagation
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    // Prevent diagonal light leaking through corners
                    if (dx !== 0 && dy !== 0) {
                        const block1 = isBlock[y * width + nx];
                        const block2 = isBlock[ny * width + x];
                        if (block1 || block2) continue; // Blocked by corner
                    }
                    
                    const isDiag = dx !== 0 && dy !== 0;
                    const falloff = isDiag ? FALLOFF_DIAG : FALLOFF_ORTHO;
                    
                    let extraFalloff = 0;
                    const nextTile = grid[ny]?.[nx];
                    if (nextTile && nextTile.isWindow) {
                        const hasGlass = nextTile.glassAssetId && !nextTile.isGlassBroken;
                        extraFalloff = hasGlass ? 0.15 : 0.05;
                    }
                    const nextIntensity = intensity - falloff - extraFalloff;
                    
                    if (nextIntensity > 0) {
                        const idx = ny * width + nx;
                        if (nextTile && nextTile.type === 'WALL' && !nextTile.isWindow) {
                            // Walls never hold lightning intensity (except windows, which let it pass)
                            continue;
                        }
                        if (nextIntensity > map[idx]) {
                            map[idx] = nextIntensity;
                            
                            if (!isBlock[idx]) {
                                qX.push(nx);
                                qY.push(ny);
                                qInt.push(nextIntensity);
                            }
                        }
                    }
                }
            }
        }
    }
    
    return map;
};
