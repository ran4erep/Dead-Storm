
import { Tile, Player, Item, GameStrings } from '../types';
import { hasPitLineOfSight } from './combatLogic';

export interface AimingTarget {
    id: string;
    x: number;
    y: number;
    dir: number; 
    dist: number;
    offset: number; 
    pathToTarget: {x: number, y: number}[];
}

export const isVisuallyBlocking = (tile: Tile | undefined, isCenterLane: boolean = true): boolean => {
    if (!tile) return true;
    if (tile.type === 'WALL' && tile.blocking !== false) {
        if (tile.isWindow && isCenterLane) return false;
        
        let th = tile.height !== undefined ? tile.height : 1.0;
        if (th < 0 || th > 0.4) return true;
        return false; // Can see over short walls
    }
    if (tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN' && !tile.door.broken) {
        if (tile.door.maskId) return false;
        return true;
    }
    return false;
};

export const getBresenhamLine = (x0: number, y0: number, x1: number, y1: number) => {
    // Ensure inputs are integers to prevent infinite loops
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);

    const path = [];
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let iterations = 0;
    const MAX_ITERATIONS = 1000; // Safety break

    while(true) {
        path.push({x: x0, y: y0});
        if (x0 === x1 && y0 === y1) break;
        
        // Safety break for infinite loops
        iterations++;
        if (iterations > MAX_ITERATIONS) {
            console.warn("Bresenham infinite loop detected", {x0, y0, x1, y1});
            break;
        }

        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
    return path;
};

export const scanForTargets = (
    player: Player,
    grid: Tile[][],
    width: number,
    height: number,
    maxViewDistance: number = 12,
    enemies?: Map<string, any>
): AimingTarget[] => {
    
    const weaponRange = player.equippedWeapon?.range || 1; 
    const candidatesMap = new Map<string, AimingTarget>();

    const directions = [
        { dx: 0, dy: -1, dir: 0 }, // N
        { dx: 1, dy: 0, dir: 1 },  // E
        { dx: 0, dy: 1, dir: 2 },  // S
        { dx: -1, dy: 0, dir: 3 }  // W
    ];

    directions.forEach(({ dx, dy, dir }) => {
        const px = -dy; 
        const py = dx;
        
        // Scan 3 lanes (Center + 1 Left + 1 Right) matching the Aggro width
        [-1, 0, 1].forEach(offset => {
            let cx = player.pos.x + (px * offset);
            let cy = player.pos.y + (py * offset);
            
            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                // 1. Blinders check: If there is a wall immediately to the side, the lane is blocked
                if (offset !== 0) {
                    const sideTile = grid[cy][cx];
                    if (isVisuallyBlocking(sideTile, false)) {
                        return; // Skip this lane
                    }
                }

                for (let i = 1; i <= maxViewDistance; i++) {
                     const tx = cx + (dx * i);
                     const ty = cy + (dy * i);
                     
                     if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

                     // 2. Center lane check (Corner Cutting prevention)
                     if (offset !== 0) {
                          const centerTx = player.pos.x + (dx * i);
                          const centerTy = player.pos.y + (dy * i);
                          if (centerTx >= 0 && centerTx < width && centerTy >= 0 && centerTy < height) {
                              const centerTile = grid[centerTy][centerTx];
                              // The center tile itself is on the center lane for aiming, so true
                              if (isVisuallyBlocking(centerTile, true)) {
                                  break; // Center is blocked, so side lane is blocked from here on
                              }
                          }
                     }

                     const tile = grid[ty][tx];
                     
                     if (tile.decoration) {
                          if (tile.decoration.destructable) {
                              const decorId = `decor_${tx}_${ty}`;
                              const existing = candidatesMap.get(decorId);
                              const newCandidate: AimingTarget = {
                                  id: decorId,
                                  x: tx,
                                  y: ty,
                                  dir,
                                  dist: i,
                                  offset,
                                  pathToTarget: []
                              };
                              if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                                  candidatesMap.set(decorId, newCandidate);
                              }
                          }
                          if (tile.decoration.blocking) {
                              // Note: we'll handle blocking after all checks
                          }
                     }

                     if (tile.isWindow && tile.canBeDestroyed !== false && !tile.isGlassBroken && tile.glassAssetId) {
                          const windowId = `window_${tx}_${ty}`;
                          const existing = candidatesMap.get(windowId);
                          const newCandidate: AimingTarget = {
                              id: windowId,
                              x: tx,
                              y: ty,
                              dir,
                              dist: i,
                              offset,
                              pathToTarget: []
                          };
                          if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                              candidatesMap.set(windowId, newCandidate);
                          }
                          // Let the ray pass through to hit stuff behind the window
                     }

                     if (tile.type === 'DOOR' && tile.door && tile.door.maskId && !tile.door.broken && tile.door.state !== 'OPEN') {
                          const doorGlassId = `door_${tx}_${ty}`;
                          const existing = candidatesMap.get(doorGlassId);
                          const newCandidate: AimingTarget = {
                              id: doorGlassId,
                              x: tx,
                              y: ty,
                              dir,
                              dist: i,
                              offset,
                              pathToTarget: []
                          };
                          if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                              candidatesMap.set(doorGlassId, newCandidate);
                          }
                          // Let the ray pass through
                     }

                     if (tile.mirror && tile.canBeDestroyed !== false && !tile.isMirrorBroken && tile.maskId) {
                          const mirrorId = `mirror_${tx}_${ty}`;
                          const existing = candidatesMap.get(mirrorId);
                          const newCandidate: AimingTarget = {
                              id: mirrorId,
                              x: tx,
                              y: ty,
                              dir,
                              dist: i,
                              offset,
                              pathToTarget: []
                          };
                          if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                              candidatesMap.set(mirrorId, newCandidate);
                          }
                          // Let the ray pass through
                     }

                     if (tile.enemyId) {
                          const isPitTile = (t: any) => t && t.type === 'FLOOR' && t.height !== undefined && t.height < 0;
                          const playerTile = grid[Math.floor(player.pos.y)]?.[Math.floor(player.pos.x)];
                          const playerInPit = isPitTile(playerTile);
                          const enemyInPit = isPitTile(tile);

                          if (weaponRange <= 1 && (playerInPit !== enemyInPit)) {
                              // Skip adding enemy to candidates
                          } else if ((playerInPit || enemyInPit) && !hasPitLineOfSight(player.pos, { x: tx + 0.5, y: ty + 0.5 }, grid, Math.max(grid[0]?.length || 0, 1), grid.length)) {
                              // Skip adding enemy if LOS is blocked by a pit wall
                          } else {
                              let allowTarget = true;
                              if (enemies) {
                                  const enemyObj = enemies.get(tile.enemyId);
                                  if (enemyObj && enemyObj.canBeKilled === false) {
                                      allowTarget = false;
                                  }
                              }

                              if (allowTarget) {
                                  const existing = candidatesMap.get(tile.enemyId);
                                  const newCandidate: AimingTarget = {
                                      id: tile.enemyId,
                                      x: tx,
                                      y: ty,
                                      dir,
                                      dist: i,
                                      offset,
                                      pathToTarget: []
                                  };

                                  if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                                      candidatesMap.set(tile.enemyId, newCandidate);
                                  }
                              }
                          }
                     }

                     if (isVisuallyBlocking(tile, offset === 0)) break;
                     if (tile.enemyId) break;
                     if (tile.decoration && tile.decoration.blocking) break;

                }
            }
        });
    });

    const candidates = Array.from(candidatesMap.values());

    candidates.sort((a, b) => {
        const aIsFacing = a.dir === player.dir ? 1 : 0;
        const bIsFacing = b.dir === player.dir ? 1 : 0;
        if (aIsFacing !== bIsFacing) return bIsFacing - aIsFacing; 
        if (a.dist !== b.dist) return a.dist - b.dist; 
        return Math.abs(a.offset) - Math.abs(b.offset); 
    });

    if (candidates.length > 0) {
        // Visual filter for aiming selection - prefer things in range or reasonably close
        const effectiveView = Math.max(weaponRange, 3);
        const validTargets = candidates.filter(t => t.dist <= effectiveView);
        
        validTargets.sort((a, b) => {
            if (a.dir !== b.dir) return a.dir - b.dir;
            return a.offset - b.offset;
        });
        
        validTargets.forEach(t => {
            t.pathToTarget = getBresenhamLine(player.pos.x, player.pos.y, t.x, t.y);
        });

        return validTargets;
    }
    return candidates;
};

export const scanForInspectTargets = (
    player: Player,
    grid: Tile[][],
    width: number,
    height: number,
    maxViewDistance: number = 5,
    enemies?: Map<string, any>
): AimingTarget[] => {
    const candidatesMap = new Map<string, AimingTarget>();

    const directions = [
        { dx: 0, dy: -1, dir: 0 }, // N
        { dx: 1, dy: 0, dir: 1 },  // E
        { dx: 0, dy: 1, dir: 2 },  // S
        { dx: -1, dy: 0, dir: 3 }  // W
    ].filter(d => d.dir === Math.round(player.dir) % 4);

    directions.forEach(({ dx, dy, dir }) => {
        const px = -dy; 
        const py = dx;
        
        [-1, 0, 1].forEach(offset => {
            let cx = player.pos.x + (px * offset);
            let cy = player.pos.y + (py * offset);
            
            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                if (offset !== 0) {
                    const sideTile = grid[cy][cx];
                    if (sideTile && ((sideTile.type === 'WALL' && sideTile.blocking !== false) || (sideTile.type === 'DOOR' && sideTile.door?.state !== 'OPEN'))) {
                        return;
                    }
                }

                for (let i = 1; i <= maxViewDistance; i++) {
                     const tx = cx + (dx * i);
                     const ty = cy + (dy * i);
                     
                     if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

                     if (offset !== 0) {
                          const centerTx = player.pos.x + (dx * i);
                          const centerTy = player.pos.y + (dy * i);
                          if (centerTx >= 0 && centerTx < width && centerTy >= 0 && centerTy < height) {
                              const centerTile = grid[centerTy][centerTx];
                              if (centerTile && ((centerTile.type === 'WALL' && centerTile.blocking !== false) || (centerTile.type === 'DOOR' && centerTile.door?.state !== 'OPEN'))) {
                                  break;
                              }
                          }
                     }

                     const tile = grid[ty][tx];

                     let targetFound = false;

                     const addCandidate = (id: string) => {
                         targetFound = true;
                         const existing = candidatesMap.get(id);
                         const newCandidate: AimingTarget = {
                             id,
                             x: tx,
                             y: ty,
                             dir,
                             dist: i,
                             offset,
                             pathToTarget: []
                         };
                         if (!existing || Math.abs(offset) < Math.abs(existing.offset)) {
                             candidatesMap.set(id, newCandidate);
                         }
                     };

                     if (tile.enemyId) {
                         let allowInspect = true;
                         if (enemies) {
                             const enemyObj = enemies.get(tile.enemyId);
                             if (enemyObj && enemyObj.canBeInspected === false) {
                                 allowInspect = false;
                             }
                         }
                         if (allowInspect) {
                             addCandidate(tile.enemyId);
                         }
                     }

                     if (tile.corpses && tile.corpses.length > 0) {
                         addCandidate(`corpse_${tx}_${ty}`);
                     }

                     const decList = tile.decorations && tile.decorations.length > 0
                         ? tile.decorations
                         : (tile.decoration ? [tile.decoration] : []);

                     if (decList.length > 0) {
                         decList.forEach((dec, idx) => {
                             if (dec.canBeInspected !== false) {
                                 const id = decList.length > 1 ? `decor_${tx}_${ty}_${idx}` : `decor_${tx}_${ty}`;
                                 addCandidate(id);
                             }
                         });
                     }

                     if (tile.items && tile.items.length > 0) {
                         const inspectableItems = tile.items.filter((item) => item.canBeInspected !== false);
                         if (inspectableItems.length > 0) {
                             inspectableItems.forEach((item, idx) => {
                                 const id = inspectableItems.length > 1 ? `item_${tx}_${ty}_${idx}` : `item_${tx}_${ty}`;
                                 addCandidate(id);
                             });
                         }
                     }

                     if (tile.type === 'WALL' && tile.blocking !== false) break;
                     if (tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN') break;

                     const isBlockingDeco = decList.some(d => d.blocking);
                     if (targetFound && (tile.enemyId || isBlockingDeco)) {
                         break; // block LOS
                     }
                }
            }
        });
    });

    const candidates = Array.from(candidatesMap.values());
    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            if (a.dir !== b.dir) return a.dir - b.dir;
            return a.offset - b.offset;
        });
        candidates.forEach(t => {
            t.pathToTarget = getBresenhamLine(player.pos.x, player.pos.y, t.x, t.y);
        });
    }
    return candidates;
};
