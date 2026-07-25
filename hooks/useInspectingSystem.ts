import React, { useState } from 'react';
import { Player, GameState, GameStrings, Tile } from '../types';
import { AimingTarget, scanForInspectTargets } from '../utils/aimingLogic';

interface InspectingSystemProps {
  player: Player;
  setPlayer: React.Dispatch<React.SetStateAction<Player>>;
  levelData: { width: number; height: number; grid: Tile[][] } | null;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  strings: GameStrings | null;
  addLog: (text: string, type?: any) => void;
  enemiesDb: Record<string, any>;
  decorationsDb: Record<string, any>;
  itemsDb: Record<string, any>;
  enemies: Map<string, any>;
  onInspect?: (text: string, isNPC?: boolean, distance?: number, isCorpse?: boolean) => void;
  setLookAroundAngle?: React.Dispatch<React.SetStateAction<number>>;
  lookAroundAngle?: number;
  lookAroundAngleRef?: React.MutableRefObject<number>;
  language: string;
}

export const useInspectingSystem = ({
  player,
  setPlayer,
  levelData,
  gameState,
  setGameState,
  strings,
  addLog,
  enemiesDb,
  decorationsDb,
  itemsDb,
  enemies,
  onInspect,
  setLookAroundAngle,
  lookAroundAngle,
  lookAroundAngleRef,
  language
}: InspectingSystemProps) => {
  const [inspectTargets, setInspectTargets] = useState<AimingTarget[]>([]);
  const [inspectTargetIndex, setInspectTargetIndex] = useState(0);
  const [animTargetAngle, setAnimTargetAngle] = useState<{ start: number, target: number, startTime: number } | null>(null);

  const localize = (text: string | undefined): string => {
      if (!text) return "";
      let localizedText = text;
      const idx = text.indexOf('/');
      if (idx !== -1) {
          const ru = text.substring(0, idx).trim();
          const en = text.substring(idx + 1).trim();
          localizedText = language === 'ru' ? ru : en;
      }
      return localizedText;
  };

  React.useEffect(() => {
      if (!animTargetAngle || !setLookAroundAngle) return;
      let frameId: number;
      const duration = 250;
      
      const step = (time: number) => {
          const progress = Math.min((time - animTargetAngle.startTime) / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          const currentAmount = animTargetAngle.start + (animTargetAngle.target - animTargetAngle.start) * ease;
          
          setLookAroundAngle(currentAmount);
          
          if (progress < 1) {
              frameId = requestAnimationFrame(step);
          }
      };
      
      frameId = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frameId);
  }, [animTargetAngle, setLookAroundAngle]);

  const focusTarget = (target: AimingTarget) => {
      // Rotate grid roughly
      if (target.dir !== player.dir) {
          setPlayer(prev => ({...prev, dir: target.dir, dir360: target.dir}));
      }

      // Smooth camera to point exactly at target center
      if (setLookAroundAngle) {
          const dx = target.x - player.pos.x;
          const dy = target.y - player.pos.y;
          let exactAngle = Math.atan2(dy, dx);
          
          let currAngle = (target.dir - 1) * (Math.PI / 2);
          
          let diff = exactAngle - currAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          
          setAnimTargetAngle({
              start: lookAroundAngleRef ? lookAroundAngleRef.current : (lookAroundAngle || 0),
              target: diff,
              startTime: performance.now()
          });
      }
  };

    const getTargetDescription = (target: AimingTarget) => {
        if (!levelData || !strings) return { desc: "Nothing to inspect", isEnemy: false, isCorpse: false };
        const tile = levelData.grid[target.y]?.[target.x];
        let desc = strings.logs.nothing_here || "Nothing to inspect";
        let isEnemy = false;
        let isCorpse = false;
        
        const inspectingStrings = (strings.ui as any)?.inspecting;
        
        if (tile) {
            if (target.id.startsWith('item_') && tile.items && tile.items.length > 0) {
                const parts = target.id.split('_');
                const itemIdx = parts.length >= 4 ? parseInt(parts[3], 10) : 0;
                const itemObj = tile.items[itemIdx] || tile.items[0];
                const itemDef = itemsDb[itemObj.id] || itemsDb[itemObj.definitionId || ''];
                const itemName = localize(itemObj.name || itemDef?.name || "Item");
                const itemDesc = localize(itemObj.description || itemDef?.description || itemName);
                if (inspectingStrings) {
                    const template = target.dist <= 1 ? inspectingStrings.close_item : inspectingStrings.far_item;
                    desc = template.replace('{name}', itemName).replace('{desc}', itemDesc);
                } else {
                    desc = itemDesc;
                }
            } else if (target.id.startsWith('decor_') && (tile.decorations?.length || tile.decoration)) {
                const parts = target.id.split('_');
                const decorIdx = parts.length >= 4 ? parseInt(parts[3], 10) : 0;
                const decList = tile.decorations && tile.decorations.length > 0 ? tile.decorations : (tile.decoration ? [tile.decoration] : []);
                const decorObj = decList[decorIdx] || decList[0];
                const decorDef = decorationsDb[decorObj.id] || decorationsDb[(decorObj as any).type];
                const decorName = localize(decorObj.name || decorDef?.name || "Object");
                const decorDesc = localize(decorObj.description || decorDef?.inspectText || decorDef?.description || decorName);
                if (inspectingStrings) {
                    const template = target.dist <= 1 ? inspectingStrings.close_item : inspectingStrings.far_item;
                    desc = template.replace('{name}', decorName).replace('{desc}', decorDesc);
                } else {
                    desc = decorDesc;
                }
            } else if (target.id.startsWith('corpse_') && tile.corpses && tile.corpses.length > 0) {
                isCorpse = true;
                if (tile.corpses.length === 1) {
                    const corpseName = localize(tile.corpses[0].name || "Enemy");
                    if (inspectingStrings) {
                        const template = target.dist <= 1 ? inspectingStrings.close_corpse : inspectingStrings.far_corpse;
                        desc = template.replace('{name}', corpseName);
                    } else {
                        desc = `Corpse of ${corpseName}`;
                    }
                } else {
                    if (inspectingStrings) {
                        desc = target.dist <= 1 ? inspectingStrings.close_corpses : inspectingStrings.far_corpses;
                    } else {
                        desc = "Pile of corpses";
                    }
                }
            } else if (tile.enemyId) {
                isEnemy = true;
                const enemyInstance = enemies.get(tile.enemyId);
                if (enemyInstance && enemyInstance.isCorpse) {
                    isCorpse = true;
                    desc = (strings.logs as any).action_loot || "Corpse";
                    isEnemy = false;
                } else {
                    const enemyDef = enemiesDb[enemyInstance?.type || ''] || enemiesDb[tile.enemyId];
                    const enemyName = localize(enemyInstance?.name || enemyDef?.name || "Enemy");
                    const enemyDesc = localize(enemyInstance?.description || enemyDef?.description || enemyName);
                    if (inspectingStrings) {
                        const template = target.dist <= 1 ? (inspectingStrings as any).close_enemy : (inspectingStrings as any).far_enemy;
                        desc = template.replace('{name}', enemyName).replace('{desc}', enemyDesc);
                    } else {
                        desc = enemyDesc;
                    }
                }
            }
        }
        return { desc, isEnemy, isCorpse };
    };

    const startInspectMode = () => {
      if (!levelData || !strings) return;

      const targets = scanForInspectTargets(player, levelData.grid, levelData.width, levelData.height, 5, enemies);
      
      if (targets.length > 0) {
          // Find if there is an immediate front target
          const immediateTargetIdx = targets.findIndex(t => t.offset === 0 && t.dist === 1);
          if (immediateTargetIdx !== -1) {
              const target = targets[immediateTargetIdx];
              if (onInspect) {
                  const { desc, isEnemy, isCorpse } = getTargetDescription(target);
                  onInspect(desc, isEnemy, 1, isCorpse);
              }
              return;
          }

          // Initial look at front tile
          const frontTargets = targets.filter(t => t.dir === player.dir);
          let initialIdx = 0;
          
          if (frontTargets.length > 0) {
              initialIdx = targets.findIndex(t => t.dir === player.dir && t.offset === 0);
              if (initialIdx === -1) {
                  const candidates = targets.map((t, i) => ({t, i})).filter(x => x.t.dir === player.dir);
                  candidates.sort((a,b) => Math.abs(a.t.offset) - Math.abs(b.t.offset));
                  initialIdx = candidates[0].i;
              }
          } else {
               // Just find closest
               targets.sort((a, b) => a.dist - b.dist);
          }

          setInspectTargets(targets);
          setInspectTargetIndex(initialIdx);
          setGameState(GameState.INSPECTING);
          
          const initialTarget = targets[initialIdx];
          focusTarget(initialTarget);
      } else {
          addLog(strings.logs.nothing_here || "Nothing to inspect", 'INFO');
      }
    };

    const handleInspectInput = (action: 'PREV' | 'NEXT' | 'CANCEL' | 'SELECT') => {
        if (gameState !== GameState.INSPECTING) return;
        
        if (action === 'CANCEL') {
            if (setLookAroundAngle) {
                setAnimTargetAngle({
                    start: lookAroundAngleRef ? lookAroundAngleRef.current : (lookAroundAngle || 0),
                    target: 0,
                    startTime: performance.now()
                });
            }
            setGameState(GameState.PLAYING);
            setInspectTargets([]);
            return;
        }

        if (action === 'NEXT') {
            const nextIdx = (inspectTargetIndex + 1) % inspectTargets.length;
            setInspectTargetIndex(nextIdx);
            
            const nextTarget = inspectTargets[nextIdx];
            focusTarget(nextTarget);
        }

        if (action === 'PREV') {
            let prevIdx = inspectTargetIndex - 1;
            if (prevIdx < 0) prevIdx = inspectTargets.length - 1;
            setInspectTargetIndex(prevIdx);

            const prevTarget = inspectTargets[prevIdx];
            focusTarget(prevTarget);
        }

        if (action === 'SELECT') {
           // get target details
            const target = inspectTargets[inspectTargetIndex];
            if (target && onInspect) {
                const { desc, isEnemy, isCorpse } = getTargetDescription(target);
                onInspect(desc, isEnemy, target.dist, isCorpse);
            }

            setAnimTargetAngle(null); // Clear any ongoing focus animation

            setGameState(GameState.PLAYING);
            setInspectTargets([]);
            return;
        }
    };

  return {
    inspectTargets,
    setInspectTargets,
    inspectTargetIndex,
    setInspectTargetIndex,
    startInspectMode,
    handleInspectInput
  };
};
