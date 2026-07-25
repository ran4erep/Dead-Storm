
import React, { useState, useRef, useCallback } from 'react';
import { Player, GameState, GameStrings, CombatState, Tile, Item, CombatEnemyState, Enemy } from '../types';
import { findEnemiesWithLineOfSight, hasLineOfSight, isValidCombatPosition } from '../utils/combatLogic';
import { resolveDoorInteraction } from '../utils/doorSystem';
import { scanForInspectTargets } from '../utils/aimingLogic';
import { evaluateFlagCondition, evaluateFlagsArray } from './useScriptSystem';

const MAX_VISION_DISTANCE = 12;

export const useMovementSystem = (
    player: Player,
    setPlayer: React.Dispatch<React.SetStateAction<Player>>,
    levelData: any,
    setLevelData: React.Dispatch<React.SetStateAction<any>>,
    strings: GameStrings | null,
    addLog: (text: string, type?: any) => void,
    gameState: GameState,
    combatRef: React.MutableRefObject<CombatState>,
    loading: boolean,
    viewportFade: number,
    raycasterRef: React.MutableRefObject<any>,
    triggerDamageEffect: (heavy: boolean) => void,
    startCombat: (activeGroup: CombatEnemyState[], forcedDir?: number, startWithEnemyTurn?: boolean, ambushTargetId?: string | null) => void,
    loadLevel: (path: string, strings?: any, transition?: boolean, targetPortalId?: string) => void,
    triggerSway: () => void,
    activeModal: string | null,
    setActiveModal: (modal: any) => void,
    setLootData: (data: { items: Item[], x: number, y: number, isContainer?: boolean, containerItem?: Item } | null) => void,
    setPickupAnim: (anim: { item: Item, startTime: number, x: number, y: number } | null) => void,
    triggerPickupEffect: () => void,
    inventoryStats: { currentLoad: number, maxCapacity: number },
    playSound: (name: string, pos?: { x: number, y: number }) => void,
    currentLevelPath: string | null,
    forceCloseMap: () => void,
    revealFogOfWarBatch: (tiles: {x: number, y: number}[]) => void,
    startDialogue: (id: string, voice?: any, playerVoice?: any, isRadio?: boolean, entityId?: string) => void,
    processEffects: () => void,
    onTakeTurn: (playerPos?: { x: number, y: number }, gridOverride?: Tile[][]) => void,
    enemies: Map<string, Enemy>,
    aiEnabled: boolean,
    triggerEnemyTurn?: (isEscapeFail?: boolean, ignoredIds?: string[], escapeMode?: boolean, drops?: any[], gridOverride?: any[][]) => void,
    joinCombat?: (enemyIds: string[]) => void,
    showToast?: (msg: string) => void,
    applyTileDamageToEntity?: (id: string | 'PLAYER', x: number, y: number) => void,
    onRadioTrigger?: (item: any) => Promise<void>,
    checkTriggers?: (type: string, params: any) => void,
    onInspect?: () => void,
    noclip?: boolean,
    setBoxMoveAnims?: React.Dispatch<React.SetStateAction<{id: string, startX: number, startY: number, endX: number, endY: number, startTime: number}[]>>,
    itemsDb?: Record<string, any>
) => {

    const onTakeTurnRef = useRef(onTakeTurn);
    React.useEffect(() => { onTakeTurnRef.current = onTakeTurn; }, [onTakeTurn]);

    const inputLockRef = useRef<boolean>(false);
    const loggedItemIdsRef = useRef<Set<string>>(new Set());

    const lastRevealRef = useRef<{
        x: number;
        y: number;
        levelName: string;
        levelDataRef: any;
        radius: number;
    } | null>(null);

    const visibleMaskRef = useRef<Uint8Array | null>(null);
    const candidatesRef = useRef<Int32Array | null>(null);

    const t = (template: string | undefined, params: { [key: string]: string | number }) => {
        if (!template) return "???";
        return template.replace(/{(\w+)}/g, (_, key) => params[key] !== undefined ? String(params[key]) : `{${key}}`);
    };

    const getFrontTile = (px: number, py: number, dir: number) => {
        const dx = [0, 1, 0, -1][Math.round(dir)];
        const dy = [-1, 0, 1, 0][Math.round(dir)];
        return { x: px + dx, y: py + dy };
    };

    const turnPlayer = (clockwise: boolean) => {
        if (inputLockRef.current || viewportFade > 0 || (combatRef.current.isActive && combatRef.current.isProcessingTurn) || loading) return;
        
        setPlayer(prev => {
            let nextDir = clockwise ? prev.dir + 1 : prev.dir - 1;
            if (nextDir > 3) nextDir = 0;
            if (nextDir < 0) nextDir = 3;
            
            let next360 = clockwise ? prev.dir360 + 1 : prev.dir360 - 1;

            if (levelData && strings) {
                const frontPos = {
                    x: prev.pos.x + [0, 1, 0, -1][Math.round(nextDir)],
                    y: prev.pos.y + [-1, 0, 1, 0][Math.round(nextDir)]
                };
                if (frontPos) {
                    const frontTile = levelData.grid[frontPos.y]?.[frontPos.x];
                    if (frontTile && frontTile.items && frontTile.items.length > 0) {
                        const hasNewItems = frontTile.items.some((item: Item) => !loggedItemIdsRef.current.has(item.id));
                        if (hasNewItems) {
                            if (frontTile.items.length > 1) {
                                addLog(strings.logs.multiple_items_in_front, 'INFO');
                            } else {
                                addLog(t(strings.logs.item_in_front, { name: frontTile.items[frontTile.items.length - 1].name }), 'INFO');
                            }
                            frontTile.items.forEach((item: Item) => loggedItemIdsRef.current.add(item.id));
                        }
                    }
                }
            }
            return { ...prev, dir: nextDir, dir360: next360 };
        });
    };

    const revealFogOfWarFromPlayer = useCallback((customX?: number, customY?: number) => {
        if (!levelData) return;
        const pX = Math.round(customX !== undefined ? customX : player.pos.x);
        const pY = Math.round(customY !== undefined ? customY : player.pos.y);

        const hasDigitalMap = (player?.inventory || []).some((item: any) => item?.type === 'DIGITAL_MAP' && item.isActive && (item.currentAmmo ?? 0) > 0 && item.hasBattery !== false) || 
                              Object.values(player?.equipment || {}).some((item: any) => item?.type === 'DIGITAL_MAP' && item.isActive && (item.currentAmmo ?? 0) > 0 && item.hasBattery !== false);
        const hasRegularMap = (player?.inventory || []).some((item: any) => item?.type === 'MAP') || 
                              Object.values(player?.equipment || {}).some((item: any) => item?.type === 'MAP');
        const revealRadius = (hasDigitalMap || hasRegularMap) ? 6 : 2;

        if (lastRevealRef.current &&
            lastRevealRef.current.x === pX &&
            lastRevealRef.current.y === pY &&
            lastRevealRef.current.levelName === (levelData.name || "") &&
            lastRevealRef.current.levelDataRef === levelData &&
            lastRevealRef.current.radius === revealRadius
        ) {
            return;
        }

        lastRevealRef.current = {
            x: pX,
            y: pY,
            levelName: levelData.name || "",
            levelDataRef: levelData,
            radius: revealRadius
        };
        
        const gridWidth = levelData.width;
        const gridHeight = levelData.height;
        const grid = levelData.grid;
        const totalCells = gridWidth * gridHeight;
        
        let visibleMask = visibleMaskRef.current;
        if (!visibleMask || visibleMask.length < totalCells) {
            visibleMask = new Uint8Array(totalCells);
            visibleMaskRef.current = visibleMask;
        } else {
            visibleMask.fill(0, 0, totalCells);
        }

        let candidates = candidatesRef.current;
        if (!candidates || candidates.length < totalCells) {
            candidates = new Int32Array(totalCells);
            candidatesRef.current = candidates;
        }
        let candidatesCount = 0;

        const radiusSq = revealRadius * revealRadius;
        const R = revealRadius;

        // Inline fast raycasting function working with packed indices
        const castRay = (x1: number, y1: number) => {
            const x0 = pX;
            const y0 = pY;
            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = (x0 < x1) ? 1 : -1;
            const sy = (y0 < y1) ? 1 : -1;
            let err = dx - dy;

            let cx = x0;
            let cy = y0;
            let prevX = cx;
            let prevY = cy;

            while (true) {
                // Out of bounds check
                if (cx < 0 || cx >= gridWidth || cy < 0 || cy >= gridHeight) {
                    break;
                }

                // Circle distance constraint
                const dxCenter = cx - pX;
                const dyCenter = cy - pY;
                if (dxCenter * dxCenter + dyCenter * dyCenter > radiusSq) {
                    break;
                }

                // Diagonal corner block check
                if (cx !== pX || cy !== pY) {
                    const diffX = cx - prevX;
                    const diffY = cy - prevY;
                    if (Math.abs(diffX) === 1 && Math.abs(diffY) === 1) {
                        const t1 = grid[prevY]?.[prevX + diffX];
                        const t2 = grid[prevY + diffY]?.[prevX];
                        
                        const isT1Blocking = t1 && (
                            (t1.type === 'WALL' && !t1.isWindow && t1.blocking !== false) ||
                            (t1.type === 'DOOR' && t1.door && t1.door.state !== 'OPEN' && !t1.door.maskId)
                        );
                        const isT2Blocking = t2 && (
                            (t2.type === 'WALL' && !t2.isWindow && t2.blocking !== false) ||
                            (t2.type === 'DOOR' && t2.door && t2.door.state !== 'OPEN' && !t2.door.maskId)
                        );
                        
                        if (isT1Blocking || isT2Blocking) {
                            break; // Stop ray on diagonal wall corner block
                        }
                    }
                }

                // Mark tile as visible in the local visibility mask
                const idx = cy * gridWidth + cx;
                if (visibleMask[idx] === 0) {
                    visibleMask[idx] = 1;
                    candidates[candidatesCount++] = idx;
                }

                // Stop ray propagation if we hit a wall or closed door
                const tile = grid[cy]?.[cx];
                if (tile) {
                    const isBlocking = tile.type === 'WALL' && !tile.isWindow && tile.blocking !== false;
                    const isClosedDoor = tile.type === 'DOOR' && tile.door && tile.door.state !== 'OPEN' && !tile.door.maskId;
                    if (isBlocking || isClosedDoor) {
                        break;
                    }
                }

                if (cx === x1 && cy === y1) {
                    break;
                }

                prevX = cx;
                prevY = cy;

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
        };

        // Cast rays to all perimeter cells directly without allocating an array of coordinate objects
        // 1. Top and bottom borders of the bounding box
        for (let dx = -R; dx <= R; dx++) {
            castRay(pX + dx, pY - R);
            castRay(pX + dx, pY + R);
        }
        // 2. Left and right borders (excluding corners which are already in top/bottom borders)
        for (let dy = -R + 1; dy <= R - 1; dy++) {
            castRay(pX - R, pY + dy);
            castRay(pX + R, pY + dy);
        }

        // Perform fast non-allocating wall neighbor exploration checks
        const tilesToReveal: { x: number, y: number }[] = [];
        for (let i = 0; i < candidatesCount; i++) {
            const idx = candidates[i];
            const tx = idx % gridWidth;
            const ty = Math.floor(idx / gridWidth);
            const tile = grid[ty]?.[tx];
            if (!tile || tile.isExplored) continue;
            
            let shouldReveal = true;

            if (tile.type === 'WALL') {
                // Check right neighbor
                let nx = tx + 1;
                let ny = ty;
                if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) { 
                    shouldReveal = false; 
                } else {
                    const nTile = grid[ny]?.[nx];
                    if (!nTile) { 
                        shouldReveal = false; 
                    } else if (nTile.type !== 'WALL' && !nTile.isExplored && visibleMask[ny * gridWidth + nx] !== 1) { 
                        shouldReveal = false; 
                    }
                }

                // Check left neighbor
                if (shouldReveal) {
                    nx = tx - 1;
                    ny = ty;
                    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) { 
                        shouldReveal = false; 
                    } else {
                        const nTile = grid[ny]?.[nx];
                        if (!nTile) { 
                            shouldReveal = false; 
                        } else if (nTile.type !== 'WALL' && !nTile.isExplored && visibleMask[ny * gridWidth + nx] !== 1) { 
                            shouldReveal = false; 
                        }
                    }
                }

                // Check bottom neighbor
                if (shouldReveal) {
                    nx = tx;
                    ny = ty + 1;
                    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) { 
                        shouldReveal = false; 
                    } else {
                        const nTile = grid[ny]?.[nx];
                        if (!nTile) { 
                            shouldReveal = false; 
                        } else if (nTile.type !== 'WALL' && !nTile.isExplored && visibleMask[ny * gridWidth + nx] !== 1) { 
                            shouldReveal = false; 
                        }
                    }
                }

                // Check top neighbor
                if (shouldReveal) {
                    nx = tx;
                    ny = ty - 1;
                    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) { 
                        shouldReveal = false; 
                    } else {
                        const nTile = grid[ny]?.[nx];
                        if (!nTile) { 
                            shouldReveal = false; 
                        } else if (nTile.type !== 'WALL' && !nTile.isExplored && visibleMask[ny * gridWidth + nx] !== 1) { 
                            shouldReveal = false; 
                        }
                    }
                }
            }

            if (shouldReveal) {
                tilesToReveal.push({ x: tx, y: ty });
            }
        }
        
        if (tilesToReveal.length > 0) {
            revealFogOfWarBatch(tilesToReveal);
        }
    }, [player, levelData, revealFogOfWarBatch]);

    const movePlayer = (dx: number, dy: number) => {
        if (inputLockRef.current || viewportFade > 0 || (combatRef.current.isActive && combatRef.current.isProcessingTurn) || loading || !strings) return;
        if (gameState !== GameState.PLAYING && gameState !== GameState.MAP_VIEW && gameState !== GameState.COMBAT && gameState !== GameState.RADIO_VIEW) return;

        if (!levelData) return;
        const newX = player.pos.x + dx; 
        const newY = player.pos.y + dy;
        
        if (newX < 0 || newX >= levelData.width || newY < 0 || newY >= levelData.height) return;
        
        const row = levelData.grid[newY]; 
        if (!row) return;
        const targetTile = row[newX]; 
        if (!targetTile) return;
        
        const isDoorClosed = targetTile.type === 'DOOR' && targetTile.door && 
                             (targetTile.door.state === 'CLOSED' || targetTile.door.state === 'CLOSING');
        const isCombatExit = targetTile.type === 'PORTAL' && combatRef.current.isActive;
                             
        const playerTile = levelData.grid[player.pos.y]?.[player.pos.x];
        const isPlayerInPit = !!(playerTile && playerTile.type === 'FLOOR' && playerTile.height !== undefined && playerTile.height < 0.0 && !playerTile.decoration?.isBox);
        const isBoxInPit = !!(targetTile && targetTile.type === 'FLOOR' && targetTile.height !== undefined && targetTile.height < 0.0);

        const realPlayerHeight = (playerTile && playerTile.type === 'FLOOR' && playerTile.height !== undefined) ? playerTile.height : 0.0;
        const realTargetHeight = (targetTile.type === 'FLOOR' && targetTile.height !== undefined) ? targetTile.height : 0.0;

        let playerHeight = realPlayerHeight;
        if (playerTile?.decoration?.isBox) {
            playerHeight = 0.0;
        }
        let targetHeight = realTargetHeight;
        if (targetTile?.decoration?.isBox) {
            targetHeight = 0.0;
        }

        let targetDecoBlocking = targetTile.decoration ? targetTile.decoration.blocking : false;
        if (targetTile.decoration?.isBox) {
            const isBoxAtBottom = isBoxInPit && !targetTile.pitDecoration;
            if (isBoxAtBottom) {
                // Если коробка на дне ямы, она блокирует только если игрок тоже в яме на одном уровне.
                // Иначе (игрок сверху) коробка работает как пол/мост и пропускает его.
                targetDecoBlocking = isPlayerInPit;
            } else {
                targetDecoBlocking = targetTile.decoration.blocking;
            }
        }

        let isBlockingTiles = (targetTile.type === 'WALL' && targetTile.blocking !== false) || 
                              targetDecoBlocking ||
                              (targetTile.items && targetTile.items.some((i: Item) => i.blocking));
        
        let isLadderBlocked = false;
        const isClimbingOut = playerHeight < 0.0 && targetHeight > playerHeight;
        const hasLadder = playerTile?.decoration?.type === 'LADDER' || playerTile?.pitDecoration?.type === 'LADDER';
        if (!noclip && isClimbingOut && playerTile?.ladder && !hasLadder) {
            isBlockingTiles = true;
            isLadderBlocked = true;
        }
        let boxPushed = false;
        
        if (!noclip && targetTile.decoration?.isBox) {
            const isBoxAtBottom = isBoxInPit && !targetTile.pitDecoration;
            const canPushBox = isPlayerInPit === isBoxAtBottom;

            if (canPushBox) {
                const nextBoxX = newX + dx;
                const nextBoxY = newY + dy;
                if (nextBoxX >= 0 && nextBoxX < levelData.width && nextBoxY >= 0 && nextBoxY < levelData.height) {
                    const nextTile = levelData.grid[nextBoxY][nextBoxX];
                    
                    const isNextDoor = nextTile.type === 'DOOR' && nextTile.door;
                    const isNextDoorClosed = isNextDoor && (nextTile.door.state === 'CLOSED' || nextTile.door.state === 'CLOSING');
                    const canPassDoor = !isNextDoorClosed && (targetTile.decoration.boxSize !== undefined && targetTile.decoration.boxSize < 1.0);
                    
                    const nextHeight = (nextTile.type === 'FLOOR' && nextTile.height !== undefined) ? nextTile.height : 0.0;
                    const isTooHigh = nextHeight > realTargetHeight;

                    // Если коробка на следующем тайле находится на дне ямы, она не блокирует толкаемую коробку (служит мостом)
                    const isNextBoxAtBottom = !!(nextTile.decoration?.isBox && nextHeight < 0.0 && !nextTile.pitDecoration);
                    let nextDecoBlocking = nextTile.decoration ? nextTile.decoration.blocking : false;
                    if (isNextBoxAtBottom) {
                        nextDecoBlocking = false;
                    }

                    const isNextBlocking = (nextTile.type === 'WALL' && nextTile.blocking !== false) || 
                                           nextDecoBlocking || 
                                           (nextTile.items && nextTile.items.some((i: Item) => i.blocking)) ||
                                           nextTile.enemyId || 
                                           nextTile.type === 'PORTAL' ||
                                           (isNextDoor && !canPassDoor) ||
                                           isTooHigh;
                                           
                    if (!isNextBlocking) {
                        const decorAny = targetTile.decoration as any;
                        const decorId = decorAny?.id || `box_${newX}_${newY}`;
                        if (setBoxMoveAnims) {
                            setBoxMoveAnims(prev => {
                                const now = performance.now();
                                return [...prev.filter(a => now - a.startTime < 1000), {
                                    id: decorId,
                                    startX: newX,
                                    startY: newY,
                                    endX: nextBoxX,
                                    endY: nextBoxY,
                                    startTime: now
                                }];
                            });
                        }
                        if (decorAny.moveSound) {
                             playSound(decorAny.moveSound, {x: newX, y: newY});
                        } else {
                             playSound('DOOR_SLIDE_OPEN', {x: newX, y: newY}); // Fallback
                        }

                        const isPitAlreadyFilled = !!nextTile.decoration;

                        setLevelData((prev: any) => {
                            const newGrid = [...prev.grid];
                            newGrid[newY] = [...newGrid[newY]];
                            newGrid[nextBoxY] = [...newGrid[nextBoxY]];
                            
                            const destTile = prev.grid[nextBoxY][nextBoxX];
                            const currentBox = prev.grid[newY][newX].decoration;
                            
                            let finalDestTile = { ...destTile };
                            if (nextHeight < 0.0 && destTile.decoration) {
                                finalDestTile.pitDecoration = destTile.decoration;
                            }
                            finalDestTile.decoration = currentBox;
                            newGrid[nextBoxY][nextBoxX] = finalDestTile;

                            const srcTile = prev.grid[newY][newX];
                            let finalSrcTile = { ...srcTile };
                            if (srcTile.pitDecoration) {
                                finalSrcTile.decoration = srcTile.pitDecoration;
                                delete finalSrcTile.pitDecoration;
                            } else {
                                delete finalSrcTile.decoration;
                            }
                            newGrid[newY][newX] = finalSrcTile;

                            return { ...prev, grid: newGrid };
                        });

                        if (realTargetHeight >= 0.0 && nextHeight < 0.0 && !isPitAlreadyFilled) {
                            setTimeout(() => {
                                setLevelData((prev: any) => {
                                    if (!prev || !prev.grid || !prev.grid[nextBoxY] || !prev.grid[nextBoxY][nextBoxX]) return prev;
                                    const currentTile = prev.grid[nextBoxY][nextBoxX];
                                    if (currentTile.decoration?.isBox) {
                                        const fallSound = currentTile.decoration.fallSound || 'BODY_HIT';
                                        playSound(fallSound, { x: nextBoxX, y: nextBoxY });
                                    }
                                    return prev;
                                });
                            }, 150);
                        }
                        
                        // Box translates, but player stays.
                        isBlockingTiles = true;
                        boxPushed = true;
                    }
                }
            }
        }

        const isBlocking = noclip ? false : (isBlockingTiles || isDoorClosed || isCombatExit);
        if (isBlocking) {
          if (!boxPushed) {
              const nudgeFactor = 0.3; 
              const nudgeX = player.pos.x + (dx * nudgeFactor); 
              const nudgeY = player.pos.y + (dy * nudgeFactor);
              raycasterRef.current?.triggerBump(nudgeX, nudgeY);
              playSound('SYS_ERROR_BUMP');
          } else {
              if (onTakeTurnRef.current) onTakeTurnRef.current();
              return;
          } 
          let msg = ""; 
          let logType: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO';
          if (isLadderBlocked) {
              msg = "";
          }
          else if (targetTile.type === 'WALL') msg = strings.logs.wall_hit; 
          else if (targetTile.type === 'DOOR') msg = strings.logs.door_hit; 
          else if (isCombatExit) {
              msg = strings.logs.exit_blocked_combat;
              logType = 'WARNING';
          }
          else {
              if (targetTile.decoration?.isEmptyness) {
                 msg = "";
              } else if (targetTile.items && targetTile.items.some((i: Item) => i.blocking)) {
                 const blockingItem = targetTile.items.find((i: Item) => i.blocking);
                 msg = t(strings.logs.blocking, { name: blockingItem?.name || "???" });
              } else {
                 msg = t(strings.logs.blocking, { name: targetTile.decoration?.name || "???" });
              }
          }
          if (msg !== "") {
              addLog(msg, logType); 
          }
          return;
        }
        
        if (targetTile.enemyId) {
           const targetEntity = enemies.get(targetTile.enemyId);
           if (targetEntity?.isNPC) {
               const nudgeFactor = 0.3; 
               const nudgeX = player.pos.x + (dx * nudgeFactor); 
               const nudgeY = player.pos.y + (dy * nudgeFactor);
               raycasterRef.current?.triggerBump(nudgeX, nudgeY);
               playSound('SYS_ERROR_BUMP'); 
               addLog(t(strings.logs.blocking, { name: targetEntity.name || "NPC" }), 'INFO');
               return;
           }

           const aggroIds = findEnemiesWithLineOfSight(player.pos, levelData.grid, levelData.width, levelData.height);
           if (!aggroIds.includes(targetTile.enemyId)) aggroIds.push(targetTile.enemyId);
           if (aggroIds.length > 0) {
               if (combatRef.current.isActive && joinCombat) {
                   const newEnemies = aggroIds.filter(id => !combatRef.current.activeGroup.some(g => g.id === id));
                   if (newEnemies.length > 0) {
                       joinCombat(newEnemies);
                   }
                   const nudgeFactor = 0.3; 
                   const nudgeX = player.pos.x + (dx * nudgeFactor); 
                   const nudgeY = player.pos.y + (dy * nudgeFactor);
                   raycasterRef.current?.triggerBump(nudgeX, nudgeY);
                   playSound('SYS_ERROR_BUMP'); 
               } else if (!combatRef.current.isActive) {
                   const hasHostile = aggroIds.some(id => !enemies.get(id)?.isNPC);
                   if (hasHostile) {
                       const group = aggroIds.map(id => ({ id, alignment: 'CENTER' as const }));
                       let forcedDir = player.dir; 
                       if (dy < 0) forcedDir = 0; else if (dx > 0) forcedDir = 1; else if (dy > 0) forcedDir = 2; else if (dx < 0) forcedDir = 3;
                       startCombat(group, forcedDir); 
                   } else {
                       const nudgeFactor = 0.3; 
                       const nudgeX = player.pos.x + (dx * nudgeFactor); 
                       const nudgeY = player.pos.y + (dy * nudgeFactor);
                       raycasterRef.current?.triggerBump(nudgeX, nudgeY);
                       playSound('SYS_ERROR_BUMP'); 
                       addLog(t(strings.logs.blocking, { name: targetEntity?.name || "NPC" }), 'INFO');
                   }
               }
               return;
           }
        }
        
        
        if (!combatRef.current.isActive && onTakeTurnRef.current) {
            onTakeTurnRef.current({ x: newX, y: newY });
        } else if (combatRef.current.isActive && applyTileDamageToEntity) {
            applyTileDamageToEntity('PLAYER', newX, newY);
        }

        setPlayer(prev => {
            return { 
                ...prev, 
                pos: { x: newX, y: newY }
            };
        });

        if (targetTile.decoration?.isSavePoint && !combatRef.current.isActive && setActiveModal) {
            setActiveModal('save');
        }

        const pX = Math.round(newX);
        const pY = Math.round(newY);

        // --- FOG OF WAR LOGIC ---
        revealFogOfWarFromPlayer(newX, newY);

        // --- TRIGGER LOGIC ---
        const animDelay = combatRef.current?.isActive ? 450 : 160;
        if (checkTriggers) {
             checkTriggers('ON_ENTER_TILE', { x: pX, y: pY, atStart: true });

             setTimeout(() => {
                 checkTriggers('ON_ENTER_TILE', { x: pX, y: pY, atStart: false });
             }, animDelay);
        }

        const startX = Math.round(player.pos.x);
        const startY = Math.round(player.pos.y);
        const startTile = levelData.grid[startY]?.[startX];
        
        const getEffectiveTileHeight = (tile: any) => {
            if (!tile) return 0.0;
            const baseH = (tile.type === 'FLOOR' && tile.height !== undefined) ? tile.height : 0.0;
            if (tile.decoration?.isBox && baseH < 0.0) {
                return 0.0;
            }
            return baseH;
        };

        const startFloorH = getEffectiveTileHeight(startTile);
        const targetFloorH = getEffectiveTileHeight(targetTile);
        const isLandingFall = startFloorH > targetFloorH && targetFloorH < -0.3 && targetFloorH >= -1.0;

        const ladderDeco = startTile?.decoration?.type === 'LADDER' 
            ? startTile.decoration 
            : (startTile?.pitDecoration?.type === 'LADDER' ? startTile.pitDecoration : null);
        const isClimbingLadder = targetFloorH > startFloorH && !!ladderDeco;

        if (isLandingFall) {
            inputLockRef.current = true;
            const fallSound = (targetTile.fallSound && targetTile.fallSound.trim() !== '') 
                ? targetTile.fallSound 
                : (player.sounds?.bodyHit || 'BODY_HIT');
            setTimeout(() => {
                playSound(fallSound);
            }, animDelay);

            setTimeout(() => {
                inputLockRef.current = false;
            }, 600); // Lock input during the 600ms falling & camera nod impact animation
        } else if (isClimbingLadder) {
            const heightDiff = targetFloorH - startFloorH;
            const climbDuration = Math.max(250, heightDiff * 600);
            inputLockRef.current = true;
            
            if (ladderDeco?.ladderSound) {
                const rungSpacing = 0.3;
                const numRungs = Math.max(1, Math.round(heightDiff / rungSpacing));
                for (let i = 0; i < numRungs; i++) {
                    const delay = (climbDuration * 0.85) * (i / numRungs);
                    setTimeout(() => {
                        playSound(ladderDeco!.ladderSound);
                    }, delay);
                }
            }
            
            setTimeout(() => {
                inputLockRef.current = false;
            }, climbDuration);
        } else if (targetTile.decoration?.isBox && isBoxInPit && !isPlayerInPit && targetTile.decoration.stepSound) {
            playSound(targetTile.decoration.stepSound);
        } else if (targetTile.footstepSound) {
            playSound(targetTile.footstepSound);
        }
        triggerSway();
    
        if (targetTile.type === 'PORTAL' && targetTile.portal && targetTile.portal.targetPortalId && targetTile.portal.targetPortalId.trim() !== '') { 
            addLog(strings.logs.evac_found, 'SUCCESS'); 
            forceCloseMap(); 
            loadLevel(targetTile.portal.destination || undefined, undefined, true, targetTile.portal.targetPortalId); 
            return; 
        }
    
        if (enemies && aiEnabled) {
            const visibleEnemies: string[] = [];
            const mapH = levelData.height;
            const mapW = levelData.width;

            // OPTIMIZATION: Collect all enemy positions first to avoid O(N*W*H) in isValidCombatPosition
            // Only scan within MAX_VISION_DISTANCE to save CPU
            const allEnemiesPos: {id: string, x: number, y: number}[] = [];
            const radius = MAX_VISION_DISTANCE;
            const minX = Math.max(0, newX - radius);
            const maxX = Math.min(mapW - 1, newX + radius);
            const minY = Math.max(0, newY - radius);
            const maxY = Math.min(mapH - 1, newY + radius);

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const tile = levelData.grid[y][x];
                    if (tile.enemyId) {
                        allEnemiesPos.push({ id: tile.enemyId, x, y });
                    }
                }
            }

            for (const ePos of allEnemiesPos) {
                const enemy = enemies.get(ePos.id);
                if (enemy && enemy.hp > 0) {
                    const rawRange = enemy.attackRange !== undefined ? enemy.attackRange : 1;
                    const renderDist = Math.max(Math.abs(ePos.x - newX), Math.abs(ePos.y - newY));

                    if (renderDist <= MAX_VISION_DISTANCE) {
                        if (hasLineOfSight({x: ePos.x, y: ePos.y}, {x: newX, y: newY}, levelData.grid, mapW, mapH, enemy.id, false)) {
                            // Pass pre-calculated enemies list to avoid internal grid scan
                            if (isValidCombatPosition({x: ePos.x, y: ePos.y}, {x: newX, y: newY}, levelData.grid, mapW, mapH, enemy.id, rawRange, allEnemiesPos)) {
                                visibleEnemies.push(enemy.id);
                            }
                        }
                    }
                }
            }

            if (visibleEnemies.length > 0) {
                if (combatRef.current.isActive && joinCombat) {
                    const newEnemies = visibleEnemies.filter(id => !combatRef.current.activeGroup.some(g => g.id === id));
                    if (newEnemies.length > 0) {
                        joinCombat(newEnemies);
                    }
                } else if (!combatRef.current.isActive) {
                    const hasHostile = visibleEnemies.some(id => !enemies.get(id)?.isNPC);
                    if (hasHostile) {
                        const group = visibleEnemies.map(id => ({ id, alignment: 'CENTER' as const }));
                        startCombat(group, undefined, true);
                    }
                }
            }
        }

        if (combatRef.current.isActive) {
            if (triggerEnemyTurn) triggerEnemyTurn();
        }

        loggedItemIdsRef.current.clear();

        const frontPos = getFrontTile(newX, newY, player.dir);
        if (frontPos) { 
            const frontTile = levelData.grid[frontPos.y]?.[frontPos.x]; 
            if (frontTile && frontTile.items && frontTile.items.length > 0) {
                const hasNewItems = frontTile.items.some((item: Item) => !loggedItemIdsRef.current.has(item.id));
                if (hasNewItems) {
                    if (frontTile.items.length > 1) {
                        addLog(strings.logs.multiple_items_in_front, 'INFO');
                    } else {
                        addLog(t(strings.logs.item_in_front, { name: frontTile.items[frontTile.items.length - 1].name }), 'INFO');
                    }
                    frontTile.items.forEach((item: Item) => loggedItemIdsRef.current.add(item.id));
                }
            } 
        }
    };

    const handleStrafe = (isRight: boolean) => {
        if (inputLockRef.current) return;
        const d = Math.round(player.dir);
        if (isRight) movePlayer([1, 0, -1, 0][d], [0, 1, 0, -1][d]);
        else movePlayer([-1, 0, 1, 0][d], [0, -1, 0, 1][d]);
    };

    const handleWait = () => {
        if (inputLockRef.current || combatRef.current.isActive) return;
        if (onTakeTurnRef.current) onTakeTurnRef.current();
        
        const logMsg = strings?.logs.skip_turn || strings?.ui.controls.btn_skip || "Wait...";
        addLog(logMsg, 'INFO');
    };

    const pickedUpItemsRef = useRef<Set<string>>(new Set());

    const handlePickUpSingle = (item: Item, pos: {x: number, y: number}, containerId?: string) => {
        if (!strings || !levelData) return;
        
        if (pickedUpItemsRef.current.has(item.id)) return;
        pickedUpItemsRef.current.add(item.id);
        setTimeout(() => {
            pickedUpItemsRef.current.delete(item.id);
        }, 1000);

        const grid = levelData.grid;
        const tile = grid[pos.y][pos.x];
        
        let foundItem: Item | undefined;
        
        if (!tile.items) return;

        if (containerId) {
            const container = tile.items.find((i: Item) => i.id === containerId && i.type === 'CONTAINER');
            if (container && container.loot) {
                foundItem = container.loot.find((i: Item) => i.id === item.id);
            }
        } else {
            foundItem = tile.items.find((i: Item) => i.id === item.id);
        }

        if (!foundItem) return;

        let willMerge = false;
        if (foundItem.type === 'AMMO' || foundItem.type === 'MATERIAL') {
            const existingStack = player.inventory.find(i => 
                i.id !== foundItem.id && 
                i.rawName === foundItem.rawName && 
                (i.count || 1) < (i.maxStack || 999)
            );
            if (existingStack) {
                willMerge = true;
            }
        }
        const itemWeight = foundItem.weight !== undefined ? foundItem.weight : 1;
        const addedLoad = willMerge ? 0 : itemWeight;

        if (foundItem.type !== 'CASH' && inventoryStats.currentLoad + addedLoad > inventoryStats.maxCapacity) {
            addLog(strings.logs.inventory_full, 'DANGER');
            return;
        }

        let cashValue = 0;
        if (item.type === 'CASH') {
            if (typeof item.valuable === 'number') {
                cashValue = item.valuable;
            } else if (typeof item.valuable === 'string') {
                const parts = item.valuable.split('-');
                if (parts.length === 2) {
                    const min = parseInt(parts[0], 10);
                    const max = parseInt(parts[1], 10);
                    if (!isNaN(min) && !isNaN(max)) {
                        cashValue = Math.floor(Math.random() * (max - min + 1)) + min;
                    }
                } else {
                    const val = parseInt(item.valuable, 10);
                    if (!isNaN(val)) cashValue = val;
                }
            }
            if (cashValue <= 0) cashValue = 1; // fallback
        }

        setPlayer(prev => {
            const itemToAdd = { ...item };
            delete itemToAdd.yOffset;

            if (itemToAdd.type === 'CASH') {
                const existingIndex = prev.inventory.findIndex(i => i.type === 'CASH');
                if (existingIndex !== -1) {
                    const newInventory = [...prev.inventory];
                    newInventory[existingIndex] = {
                        ...newInventory[existingIndex],
                        count: (newInventory[existingIndex].count || 0) + cashValue
                    };
                    return { ...prev, inventory: newInventory };
                } else {
                    itemToAdd.count = cashValue;
                    return { ...prev, inventory: [...prev.inventory, itemToAdd] };
                }
            }

            if (itemToAdd.type === 'AMMO' || itemToAdd.type === 'MATERIAL') {
                if (itemToAdd.count === undefined) itemToAdd.count = 1;
                const existingStackIndex = prev.inventory.findIndex(i => 
                    i.id !== itemToAdd.id && 
                    i.rawName === itemToAdd.rawName && 
                    (i.count || 1) < (i.maxStack || 999)
                );

                if (existingStackIndex !== -1) {
                    const newInventory = [...prev.inventory];
                    const existingItem = newInventory[existingStackIndex];
                    const space = (existingItem.maxStack || 999) - (existingItem.count || 1);
                    const amountToAdd = Math.min(space, itemToAdd.count || 1);
                    
                    newInventory[existingStackIndex] = {
                        ...existingItem,
                        count: (existingItem.count || 1) + amountToAdd
                    };
                    
                    return { ...prev, inventory: newInventory };
                }
            }
            
            // Ensure flashlight is off when picked up
            if (itemToAdd.type === 'FLASHLIGHT') {
                return { ...prev, inventory: [...prev.inventory, { ...itemToAdd, isActive: false }] };
            }

            return { ...prev, inventory: [...prev.inventory, itemToAdd] };
        });

        // Calculate new grid locally to ensure turn handlers use the updated state
        // Create deep copy of the grid to modify
        const newGrid = grid.map((row: any) => [...row]);
        const updatedTile = { ...tile, items: [...tile.items] };
        
        if (containerId) {
            const containerIndex = updatedTile.items.findIndex((i: Item) => i.id === containerId);
            if (containerIndex !== -1) {
                const container = { ...updatedTile.items[containerIndex] };
                container.loot = (container.loot || []).filter((i: Item) => i.id !== item.id);
                updatedTile.items[containerIndex] = container;
            }
        } else {
            updatedTile.items = updatedTile.items.filter((i: Item) => i.id !== item.id);
        }

        newGrid[pos.y][pos.x] = updatedTile;

        // Update state
        setLevelData((prev: any) => {
            return { ...prev, grid: newGrid };
        });

        setPickupAnim({ item, startTime: performance.now(), x: pos.x, y: pos.y });
        triggerPickupEffect();
        window.dispatchEvent(new CustomEvent('achievement-update', { detail: { action: 'increment', statKey: 'items_collected', amount: 1 } }));
        playSound('SYS_PICKUP');
        if (item.type === 'CASH' && strings.logs.picked_up_cash) {
            addLog(t(strings.logs.picked_up_cash, { name: item.name, amount: cashValue }), 'SUCCESS');
        } else {
            addLog(t(strings.logs.picked_up, { name: item.name }), 'SUCCESS');
        }
        
        setTimeout(() => {
             setPickupAnim(null);
        }, 500);
        
        if (checkTriggers) {
            checkTriggers('ON_ITEM_PICKUP', { itemId: item.id, itemType: item.type, keyId: (item as any).keyId, itemDefinitionId: item.definitionId, x: pos.x, y: pos.y });
        }

        // --- TURN LOGIC FOR PICKUP ---
        // Pass the newGrid to turn handlers so they don't use stale state
        if (combatRef.current.isActive) {
            if (triggerEnemyTurn) triggerEnemyTurn(false, [], false, [], newGrid);
        } else {
            // Process non-combat turn (Roaming enemies, effects)
            if (onTakeTurnRef.current) onTakeTurnRef.current(undefined, newGrid);
        }

        // Optimistically remove from local modal logic
        if (containerId && activeModal === 'loot') {
            const cItem = newGrid[pos.y][pos.x].items.find((i: Item) => i.id === containerId);
            if (!cItem || !cItem.loot || cItem.loot.length === 0) {
                setActiveModal(null);
            } else {
                setLootData({ items: cItem.loot, x: pos.x, y: pos.y, isContainer: true, containerItem: cItem });
            }
        } else {
            const remainingItems = newGrid[pos.y][pos.x].items.filter((i: any) => i.type !== 'CONTAINER' && !((i.type === 'GRENADE' || i.type === 'FLASHBANG') && i.activeTimer > 0)) || [];
            if (remainingItems.length === 0 && activeModal === 'loot') {
                setActiveModal(null);
            } else if (activeModal === 'loot') {
                setLootData({ items: remainingItems, x: pos.x, y: pos.y });
            }
        }
    };

    const findConversationalNPCInFront = () => {
        if (!levelData) return null;
        const dx = [0, 1, 0, -1][Math.round(player.dir)];
        const dy = [-1, 0, 1, 0][Math.round(player.dir)];
        
        // Находим максимальную дистанцию разговора среди существующих NPC для оптимизации прохода луча
        let maxTalkRange = 1;
        enemies.forEach(enemy => {
            if (enemy.isNPC && enemy.talkRange !== undefined) {
                if (enemy.talkRange > maxTalkRange) {
                    maxTalkRange = enemy.talkRange;
                }
            }
        });
        
        // Сканируем только в пределах максимальной дистанции
        for (let dist = 1; dist <= maxTalkRange; dist++) {
            const x = player.pos.x + dx * dist;
            const y = player.pos.y + dy * dist;
            
            if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height) {
                break;
            }
            
            const tile = levelData.grid[y]?.[x];
            if (!tile) {
                break;
            }
            
            const npc = tile.enemyId ? enemies.get(tile.enemyId) : undefined;
            if (npc && npc.isNPC) {
                const requiredTalkRange = npc.talkRange !== undefined ? npc.talkRange : 1;
                if (requiredTalkRange >= dist) {
                    return { npc, pos: { x, y }, dist };
                }
            }
            
            // Если на пути есть стена или закрытая дверь, идти дальше бессмысленно
            const isBlockingWall = tile.type === 'WALL' && !tile.isWindow && (tile.height === undefined || tile.height > 0.5);
            const isBlockingDoor = tile.type === 'DOOR' && tile.door?.state !== 'OPEN';
            if (isBlockingWall || isBlockingDoor) {
                break;
            }
        }
        return null;
    };

    const handleInteract = (actionId?: string) => {
        if (inputLockRef.current || viewportFade > 0 || (combatRef.current.isActive && combatRef.current.isProcessingTurn) || loading || !strings || !levelData) return;
        const frontPos = getFrontTile(player.pos.x, player.pos.y, player.dir);

        if (checkTriggers) {
            checkTriggers('ON_INTERACT', { x: frontPos.x, y: frontPos.y, actionId: actionId, playerDir: player.dir });
        }

        const tile = levelData.grid[frontPos.y]?.[frontPos.x];
        
        if (!tile) {
            addLog(strings.logs.nothing_here, 'INFO');
            return;
        }

        // Resolving NPC talk info
        const talkNPCInfo = findConversationalNPCInFront();
        const actionEnemy = (actionId === 'TALK' || (actionId === undefined && talkNPCInfo)) ? talkNPCInfo?.npc : (tile.enemyId ? enemies.get(tile.enemyId) : undefined);

        // Custom gamepad-specific interaction mapping
        const isGamepad = typeof document !== 'undefined' && document.body.classList.contains('gamepad-navigation-active');
        if (isGamepad && actionId === undefined) {
            // 1. NPC in front: Talk/Dialogue
            if (actionEnemy && actionEnemy.isNPC) {
                if (actionEnemy.dialogueId) {
                    startDialogue(actionEnemy.dialogueId, actionEnemy.voice, undefined, false, actionEnemy.id);
                } else {
                    addLog("...", 'INFO');
                }
                return;
            }

            // 2. Items or Container in front: Loot/Pick up / Open container
            if (tile.items && tile.items.length > 0) {
                const looted = handleLootInteraction(tile, frontPos);
                if (looted) return;
                
                const container = tile.items.find((item: any) => item.type === 'CONTAINER');
                if (container) {
                    handleOpenContainer(container, tile, frontPos);
                    return;
                }
            }

            // 3. Regular door (without keypad) in front: Open/Close
            if (tile.type === 'DOOR' && !tile.keylock && !tile.door?.nonInteractable) {
                handleDoorInteraction(tile, frontPos);
                return;
            }

            // 4. In all other cases (e.g. wall, empty tile, workbench, keypad panel): ALWAYS open Actions menu
            if (setActiveModal) {
                setActiveModal('actions');
            } else if (onInspect) {
                onInspect();
            } else {
                addLog(strings.logs.nothing_here, 'INFO');
            }
            return;
        }

        if (actionId === 'TALK' && actionEnemy && actionEnemy.isNPC) {
            if (actionEnemy.dialogueId) {
                startDialogue(actionEnemy.dialogueId, actionEnemy.voice, undefined, false, actionEnemy.id);
            } else {
                addLog("...", 'INFO');
            }
            return;
        }

        if (actionId === 'DOOR' && tile.type === 'DOOR' && !tile.door?.nonInteractable) {
            handleDoorInteraction(tile, frontPos);
            return;
        }

        if (actionId === 'LOOT' && tile.items && tile.items.length > 0) {
            const looted = handleLootInteraction(tile, frontPos);
            if (looted) return;
        }

        if (actionId === 'KEYPAD' && tile.keylock) {
            if (setActiveModal) {
                setActiveModal('keypad');
            }
            return;
        }

        if (actionId === 'WORKBENCH' && tile.decoration?.isWorkbench) {
            if (setActiveModal) {
                setActiveModal('crafting');
            }
            return;
        }

        if (actionId === 'INSPECT' && onInspect) {
            onInspect();
            return;
        }

        if (actionId === 'OPEN_CONTAINER' && tile.items) {
            const container = tile.items.find((item: any) => item.type === 'CONTAINER');
            if (container) {
                handleOpenContainer(container, tile, frontPos);
                return;
            }
        }

        if (actionId !== undefined && !['TALK', 'DOOR', 'LOOT', 'KEYPAD', 'WORKBENCH', 'INSPECT', 'OPEN_CONTAINER'].includes(actionId)) {
            // It was a custom script action that triggered checkTriggers above.
            return;
        }

        if (actionEnemy && actionEnemy.isNPC) {
            if (actionEnemy.dialogueId) {
                startDialogue(actionEnemy.dialogueId, actionEnemy.voice, undefined, false, actionEnemy.id);
            } else {
                addLog("...", 'INFO');
            }
            return;
        }

        // Priority logic for multiple interactions on the same tile
        if (tile.keylock) {
            let isFacingCorrectly = true;
            if (tile.keypadDirection) {
                const pDir = Math.round(player.dir) % 4;
                const reqFace = tile.keypadDirection.toUpperCase();
                isFacingCorrectly = (
                    (pDir === 0 && (reqFace === 'S' || reqFace === 'SOUTH')) ||
                    (pDir === 1 && (reqFace === 'W' || reqFace === 'WEST')) ||
                    (pDir === 2 && (reqFace === 'N' || reqFace === 'NORTH')) ||
                    (pDir === 3 && (reqFace === 'E' || reqFace === 'EAST'))
                );
            }
            if (isFacingCorrectly && setActiveModal) {
                setActiveModal('keypad');
                return;
            }
        }

        if (tile.type === 'DOOR' && !tile.door?.nonInteractable) {
            handleDoorInteraction(tile, frontPos);
            // If the door was already open, maybe we also want to pick up items?
            // For now, let's keep it simple: one press = one primary action.
            return;
        }

        if (tile.items && tile.items.length > 0) {
            const looted = handleLootInteraction(tile, frontPos);
            if (looted) return;
            
            const container = tile.items.find((item: any) => item.type === 'CONTAINER');
            if (container) {
                handleOpenContainer(container, tile, frontPos);
                return;
            }
        }

        if (setActiveModal) {
            setActiveModal('actions');
        } else if (onInspect) {
            onInspect();
        } else {
            addLog(strings.logs.nothing_here, 'INFO');
        }
    };

    const handleDoorInteraction = (tile: Tile, pos: {x: number, y: number}) => {
        const result = resolveDoorInteraction(
            tile, 
            player.pos, 
            pos, 
            player.inventory, 
            strings!, 
            enemies,
            levelData.keyMap,
            levelData.grid
        );

        if (result.message) {
            if (result.action === 'LOCKED' || result.action === 'BLOCK') {
                addLog(result.message, 'DANGER');
                if (result.action === 'LOCKED' && showToast) {
                    showToast(result.message);
                }
            } else {
                addLog(result.message, 'INFO');
            }
        }

        if (result.sound) playSound(result.sound, pos);
        if (result.secondarySound) setTimeout(() => playSound(result.secondarySound!, pos), 300);

        if (result.action === 'UNLOCK' && result.keyToConsume) {
            const keyId = result.keyToConsume.id;
            setPlayer(prev => ({
                ...prev,
                inventory: prev.inventory.filter(i => i.id !== keyId)
            }));
        }

        if (result.nextState) {
            const newGrid = levelData.grid.map((row: any) => [...row]);
            
            const currentDoor = newGrid[pos.y][pos.x].door!;
            const updatedDoor = { 
                ...currentDoor, 
                state: result.nextState!, 
                openAmount: currentDoor.openAmount 
            };

            // If successfully unlocked, remove the lock (keyId) so it doesn't lock again
            if (result.action === 'UNLOCK') {
                delete updatedDoor.keyId;
            }

            setLevelData((prev: any) => {
                if (!prev || !prev.grid) return prev;
                const updatedGrid = prev.grid.map((r: any) => [...r]);
                updatedGrid[pos.y][pos.x] = { 
                    ...updatedGrid[pos.y][pos.x], 
                    door: updatedDoor
                };
                return { ...prev, grid: updatedGrid };
            });

            // Lock input slightly longer than the door animation takes
            inputLockRef.current = true;
            setTimeout(() => {
                inputLockRef.current = false;
                if (combatRef.current.isActive) {
                    if (triggerEnemyTurn) triggerEnemyTurn();
                } else {
                    if (onTakeTurnRef.current) onTakeTurnRef.current(); // pass turn without overriding grid, using latest state
                }
            }, 350);
        }
    };

    const handleOpenContainer = (container: Item, tile: Tile, pos: {x: number, y: number}) => {
        if (!container.isOpened) {
            let generatedContents: Item[] = [];
            
            if (container.loot && container.loot.length > 0) {
                const isRu = strings?.inventory?.title === "ИНВЕНТАРЬ" || strings?.inventory?.empty === "Карманы пусты.";
                const loc = (str?: string) => {
                    if (!str) return "";
                    const idx = str.indexOf('/');
                    if (idx !== -1) {
                        return isRu ? str.substring(0, idx).trim() : str.substring(idx + 1).trim();
                    }
                    return str;
                };

                // If the first item has a 'type' property, it means it's already an evaluated item.
                if (container.loot[0].type && (container.loot[0] as Item).name) {
                    generatedContents = [...container.loot];
                } else if (itemsDb) {
                    // Otherwise it's a descriptor like {id: 'medkit', count: 1}. If it's just a string, handle that too just in case.
                    container.loot.forEach((lootEntry: any) => {
                        const id = typeof lootEntry === 'string' ? lootEntry : lootEntry.id;
                        const dbItem = itemsDb[id];
                        if (dbItem) {
                            const count = typeof lootEntry === 'object' && lootEntry.count !== undefined ? lootEntry.count : 1;
                            generatedContents.push({
                                ...dbItem,
                                name: loc(dbItem.name),
                                description: loc(dbItem.description),
                                text: loc(dbItem.text),
                                id: `${id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                count: count,
                                handAssetId: dbItem.handAsset,
                                handFemaleAssetId: dbItem.handFemaleAsset,
                                attackAssetId: dbItem.attackAsset,
                                attackFemaleAssetId: dbItem.attackAssetFemale,
                                maskAssetId: dbItem.maskAsset,
                                keyId: dbItem.keyId,
                                durability: dbItem.maxDurability
                            });
                        }
                    });
                }
            }

            container.loot = generatedContents;
            container.isOpened = true;
            
            if (container.openedAssetId) {
                container.assetId = container.openedAssetId;
            }

            playSound(container.openSound || 'SYS_PICKUP', pos);
            
            setLevelData((prev: any) => {
                if (!prev || !prev.grid) return prev;
                const newGrid = prev.grid.map((r: any) => [...r]);
                newGrid[pos.y][pos.x] = { ...newGrid[pos.y][pos.x], items: [...tile.items!] };
                return { ...prev, grid: newGrid };
            });
        } else {
            playSound('STEP', pos);
        }

        setLootData({
            items: container.loot || [],
            x: pos.x,
            y: pos.y,
            isContainer: true,
            containerItem: container
        });
        setActiveModal('loot');
    };

    const handleLootInteraction = (tile: Tile, pos: {x: number, y: number}): boolean => {
        if (tile.items && tile.items.length > 0) {
            const pickableItems = tile.items.filter((item: any) => !((item.type === 'GRENADE' || item.type === 'FLASHBANG') && item.activeTimer > 0) && item.type !== 'CONTAINER');
            if (pickableItems.length === 0) return false;
            
            if (pickableItems.length === 1) {
                handlePickUpSingle(pickableItems[0], pos);
            } else {
                setLootData({ items: pickableItems, x: pos.x, y: pos.y });
                setActiveModal('loot');
            }
            return true;
        }
        return false;
    };

    const getCanInteractInfo = () => {
        if (!levelData || !strings) return [];
        
        const frontPos = getFrontTile(player.pos.x, player.pos.y, player.dir);
        if (frontPos.x < 0 || frontPos.x >= levelData.width || frontPos.y < 0 || frontPos.y >= levelData.height) return [];
        
        const tile = levelData.grid[frontPos.y]?.[frontPos.x];
        if (!tile) return [];

        const availableActions = [];

        const talkNPCInfo = findConversationalNPCInFront();
        if (talkNPCInfo) {
            availableActions.push({ id: 'TALK', label: strings.ui.controls.btn_talk || "TALK" });
        }
        
        if (tile.type === 'DOOR' && !tile.door?.nonInteractable) {
            const isClosed = tile.door?.state === 'CLOSED' || tile.door?.state === 'CLOSING';
            availableActions.push({ 
                id: 'DOOR', 
                label: isClosed ? (strings.ui.controls.btn_open || "OPEN") : (strings.ui.controls.btn_close_door || "CLOSE")
            });
        }
        
        if (tile.items && tile.items.length > 0) {
            const pickableItems = tile.items.filter((item: any) => !((item.type === 'GRENADE' || item.type === 'FLASHBANG') && item.activeTimer > 0) && item.type !== 'CONTAINER');
            if (pickableItems.length > 0) {
                availableActions.push({ id: 'LOOT', label: strings.ui.controls.btn_pickup || "LOOT" });
            }
            
            const containers = tile.items.filter((item: any) => item.type === 'CONTAINER');
            if (containers.length > 0) {
                availableActions.push({ id: 'OPEN_CONTAINER', label: strings.ui.controls.btn_open || "OPEN" });
            }
        }
        
        // Custom ON_INTERACT scripts
        const interactScripts = levelData.triggers?.filter((t: any) => {
            if (t.fired && t.runOnce !== false && t.type !== undefined) return false;
            
            if (t.type === 'ON_INTERACT') {
                const p = t.params;
                if (p && p.x !== undefined && p.y !== undefined) {
                      if (frontPos.x !== p.x || frontPos.y !== p.y) return false;
                      
                      if (p.side && p.side !== 'ANY') {
                          const pDir = Math.round(player.dir) % 4;
                          const reqFace = p.side.toUpperCase();
                          const isFacingCorrectly = (
                              (pDir === 0 && (reqFace === 'S' || reqFace === 'SOUTH')) ||
                              (pDir === 1 && (reqFace === 'W' || reqFace === 'WEST')) ||
                              (pDir === 2 && (reqFace === 'N' || reqFace === 'NORTH')) ||
                              (pDir === 3 && (reqFace === 'E' || reqFace === 'EAST'))
                          );
                          if (!isFacingCorrectly) return false;
                      }

                      const flags = levelData.scriptFlags || {};
                      if (t.requiresFlag && !evaluateFlagCondition(t.requiresFlag, flags)) {
                          return false;
                      }

                      if (t.requiresFlags && Array.isArray(t.requiresFlags) && !evaluateFlagsArray(t.requiresFlags, flags)) {
                          return false;
                      }
                      
                      return true;
                }
            }
            return false;
        });

        let hasAnyInteractTrigger = false;
        if (interactScripts && interactScripts.length > 0) {
            interactScripts.forEach((t: any) => {
                if (t.triggerOnAnyInteract) {
                    hasAnyInteractTrigger = true;
                    return; // Skip adding a custom labeled button
                }
                
                // If the script defines a buttonLabel in params, use it, otherwise use generic label
                const rawLabel = t.params?.buttonLabel || strings.ui.controls?.btn_action || "Использовать";
                
                let finalLabel = rawLabel;
                if (rawLabel.includes('/')) {
                    const parts = rawLabel.split('/');
                    const isRu = strings.ui?.settings?.title === "НАСТРОЙКИ";
                    finalLabel = (isRu ? parts[0] : parts[1]) || parts[0];
                }
                
                availableActions.push({
                    id: t.id,
                    label: finalLabel
                });
            });
        }
        
        if (tile.keylock) {
            let isFacingCorrectly = true;
            if (tile.keypadDirection) {
                const pDir = Math.round(player.dir) % 4;
                const reqFace = tile.keypadDirection.toUpperCase();
                // pDir 0 -> facing North -> seeing South face
                // pDir 1 -> facing East -> seeing West face
                // pDir 2 -> facing South -> seeing North face
                // pDir 3 -> facing West -> seeing East face
                isFacingCorrectly = (
                    (pDir === 0 && (reqFace === 'S' || reqFace === 'SOUTH')) ||
                    (pDir === 1 && (reqFace === 'W' || reqFace === 'WEST')) ||
                    (pDir === 2 && (reqFace === 'N' || reqFace === 'NORTH')) ||
                    (pDir === 3 && (reqFace === 'E' || reqFace === 'EAST'))
                );
            }
            
            if (isFacingCorrectly) {
                availableActions.push({
                   id: 'KEYPAD',
                   label: strings.inventory?.btn_use || "Использовать"
                });
            }
        }

        if (tile.decoration?.isWorkbench) {
            availableActions.push({
                id: 'WORKBENCH',
                label: strings.ui.controls.btn_crafting || "КРАФТ"
            });
        }

        const inspectTargets = scanForInspectTargets(player, levelData.grid, levelData.width, levelData.height, 5, enemies);
        if (inspectTargets.length > 0) {
            availableActions.push({
                id: 'INSPECT',
                label: strings.ui.controls?.btn_inspect || "ОСМОТР"
            });
        }

        if (availableActions.length === 0 && hasAnyInteractTrigger) {
            availableActions.push({
                id: 'GENERIC_USE',
                label: strings.inventory?.btn_use || "Использовать"
            });
        }

        return availableActions;
    };

    // Compute frontTile to expose it to UI
    let frontTile: any = undefined;
    if (levelData) {
        const frontPos = getFrontTile(player.pos.x, player.pos.y, player.dir);
        if (frontPos.x >= 0 && frontPos.x < levelData.width && frontPos.y >= 0 && frontPos.y < levelData.height) {
            frontTile = levelData.grid[frontPos.y]?.[frontPos.x];
        }
    }

    return {
        movePlayer,
        turnPlayer,
        handleStrafe,
        handleWait,
        handleInteract,
        handlePickUpSingle,
        canInteractInfo: getCanInteractInfo(),
        revealFogOfWarBatch,
        revealFogOfWarFromPlayer,
        frontTile
    };
};
