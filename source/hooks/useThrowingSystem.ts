import React, { useState, useCallback, useMemo } from "react";
import {
  Player,
  GameState,
  Item,
  Tile,
  CombatEnemyState,
  GameStrings,
  Enemy,
  CombatState,
} from "../types";
import { getBresenhamLine, isVisuallyBlocking } from "../utils/aimingLogic";
import { rollDice } from "../utils/dice";
import { findEnemiesWithLineOfSight } from "../utils/combatLogic";
import {
  createShardParticles,
  getMaskBuffer,
  createMolotovExplosionParticles,
} from "../utils/particleSystem";

interface ThrowingSystemProps {
  player: Player;
  setPlayer: React.Dispatch<React.SetStateAction<Player>>;
  levelData: { width: number; height: number; grid: Tile[][] } | null;
  setLevelData: React.Dispatch<React.SetStateAction<any>>;
  enemies: Map<string, Enemy>;
  setEnemies: React.Dispatch<React.SetStateAction<Map<string, Enemy>>>;
  gameState: GameState;
  setGameState: (state: GameState) => void;
  strings: GameStrings | null;
  addLog: (text: string, type?: any) => void;
  startCombat: (
    activeGroup: CombatEnemyState[],
    forcedDir?: number,
    startWithEnemyTurn?: boolean,
  ) => void;
  onEnemiesKilled: (enemyIds: string[]) => void;
  setThrowAnim: (
    anim: { item: Item; startTime: number; x: number; y: number } | null,
  ) => void;
  isCombatActive?: boolean;
  triggerEnemyTurn?: (
    isEscapeFail?: boolean,
    ignoredEnemyIds?: string[],
  ) => void;
  onVisualHit?: (targetId: string) => void;
  playSound: (soundName: string, pos?: { x: number; y: number }) => void;
  inventoryStats: { currentLoad: number; maxCapacity: number };
  setCombat?: React.Dispatch<React.SetStateAction<CombatState>>;
  combatRef?: React.MutableRefObject<CombatState>;
  triggerExplosion?: (x: number, y: number, assetId: string) => void;
  triggerDamageEffect?: (heavy: boolean) => void;
  triggerFlash?: (intensity: number) => void;
  triggerExplosionFlash?: (
    x: number,
    y: number,
    intensity?: number,
    duration?: number,
    isFlashbang?: boolean,
  ) => void;
  triggerScreenShake?: (
    isHeavy?: boolean,
    pattern?: number | number[],
    customIntensity?: number,
    customDuration?: number,
  ) => void;
  onTakeTurn?: () => void; // Added prop for turn processing
  getAuxBuffers?: () =>
    | Map<string, { data: Uint32Array; width: number; height: number }>
    | undefined;
  onSpawnParticles?: (particles: any[]) => void;
  onExplodeLogic?: (
    x: number,
    y: number,
    damage: string,
    range: number,
    assetId: string,
    soundId?: string,
    itemType?: string,
    itemDuration?: number,
  ) => void;
  joinCombat?: (enemyIds: string[]) => void;
  decorationsDb?: any;
  spriteMap?: Map<string, HTMLImageElement | HTMLCanvasElement>;
}

export const useThrowingSystem = ({
  player,
  setPlayer,
  levelData,
  setLevelData,
  enemies,
  setEnemies,
  gameState,
  setGameState,
  strings,
  addLog,
  startCombat,
  onEnemiesKilled,
  setThrowAnim,
  isCombatActive,
  triggerEnemyTurn,
  onVisualHit,
  playSound,
  setCombat,
  combatRef,
  triggerExplosion,
  triggerDamageEffect,
  triggerScreenShake,
  triggerFlash,
  triggerExplosionFlash,
  onTakeTurn,
  inventoryStats,
  getAuxBuffers,
  onSpawnParticles,
  onExplodeLogic,
  joinCombat,
  decorationsDb,
  spriteMap,
}: ThrowingSystemProps) => {
  const [itemToThrow, setItemToThrow] = useState<Item | null>(null);
  const [localOffset, setLocalOffset] = useState({ forward: 1, side: 0 });

  const maxThrowRange = useMemo(() => {
    return 3 + (player.stats.str || 0);
  }, [player.stats.str]);

  const initiateThrow = (item: Item, countToDrop?: number, isSafe?: boolean) => {
    if (!strings) return;

    // Check if throwing an equipped item that provides slots will overflow inventory
    const isEquipped = Object.values(player.equipment).some(
      (e) => (e as Item | null)?.id === item.id,
    );
    if (isEquipped && item.inventorySlots) {
      const futureCapacity = inventoryStats.maxCapacity - item.inventorySlots;
      if (inventoryStats.currentLoad > futureCapacity) {
        const msg = strings.logs.unequip_fail_space;
        addLog(msg, "DANGER");
        return;
      }
    }

    let initialOffset = null;
    const maxLocalRange = 3 + (player.stats.str || 0);

    for (let f = 1; f <= maxLocalRange; f++) {
      const scanOffsets = [
        { forward: f, side: 0 },
        { forward: f, side: -1 },
        { forward: f, side: 1 },
      ];

      for (const off of scanOffsets) {
        const coords = getCoordsForOffset(off.forward, off.side);
        const trajectoryToInitial = getThrowTrajectory(off.forward, off.side);

        // Check if landing tile is valid
        if (!isTileValidForLanding(coords.x, coords.y)) continue;

        // Check if trajectory is clear
        let pathBlocked = false;
        if (levelData) {
          for (let i = 1; i < trajectoryToInitial.length; i++) {
            const p = trajectoryToInitial[i];
            const tile = levelData.grid[p.y]?.[p.x];

            // Special IPI Check: If this is the immediate side tile (index 1) AND we are side-stepping
            if (off.side !== 0 && i === 1) {
              // Only block on Geometry (Wall/Door), ignore decorations
              if (
                !tile ||
                (tile.type === "WALL" &&
                  tile.blocking !== false &&
                  !tile.isWindow) ||
                (tile.type === "DOOR" && tile.door?.state !== "OPEN") ||
                (tile.enemyId && i !== trajectoryToInitial.length - 1)
              ) {
                pathBlocked = true;
                break;
              }
            } else {
              // Standard check for rest of path
              if (
                isVisuallyBlocking(tile) ||
                (tile.decoration && tile.decoration.blocking) ||
                (tile.enemyId && i !== trajectoryToInitial.length - 1)
              ) {
                pathBlocked = true;
                break;
              }
            }
          }
        }

        if (!pathBlocked) {
          initialOffset = off;
          break;
        }
      }
      if (initialOffset) break;
    }

    if (!initialOffset) {
      if (strings) addLog(strings.logs.throw_blocked, "INFO");
      return;
    }

    const finalItemToThrow =
      countToDrop !== undefined
        ? { ...item, count: countToDrop, originalId: item.id, isSafeDrop: isSafe }
        : { ...item, isSafeDrop: isSafe };
    setItemToThrow(finalItemToThrow);
    setLocalOffset(initialOffset);
    setGameState(GameState.THROWING);

    if (!isSafe && item.sounds && item.sounds.prime) {
      playSound(item.sounds.prime);
    }
  };

  const cancelThrow = () => {
    setItemToThrow(null);
    setGameState(GameState.PLAYING);
  };

  const getCoordsForOffset = useCallback(
    (forward: number, side: number, direction?: number) => {
      const d = direction !== undefined ? direction : Math.round(player.dir);
      const forwardVector = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][d];
      const rightVector = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ][d];

      // Ensure strict integer math for grid lookups
      const px = Math.round(player.pos.x);
      const py = Math.round(player.pos.y);

      return {
        x: px + forward * forwardVector[0] + side * rightVector[0],
        y: py + forward * forwardVector[1] + side * rightVector[1],
      };
    },
    [player.pos, player.dir],
  );

  const getThrowTrajectory = useCallback(
    (forward: number, side: number) => {
      const d = Math.round(player.dir);
      const fwdVec = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][d];
      const rgtVec = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ][d];
      const px = Math.round(player.pos.x);
      const py = Math.round(player.pos.y);

      const path = [];
      // Start with player tile
      path.push({ x: px, y: py });

      // 1. Lateral step if needed (to the side lane)
      if (side !== 0) {
        path.push({
          x: px + rgtVec[0] * side,
          y: py + rgtVec[1] * side,
        });
      }

      // 2. Forward steps along that specific lane
      for (let f = 1; f <= forward; f++) {
        path.push({
          x: px + rgtVec[0] * side + fwdVec[0] * f,
          y: py + rgtVec[1] * side + fwdVec[1] * f,
        });
      }

      return path;
    },
    [player.pos, player.dir],
  );

  const targetCoords = useMemo(() => {
    return getCoordsForOffset(localOffset.forward, localOffset.side);
  }, [localOffset, getCoordsForOffset]);

  const trajectory = useMemo(() => {
    return getThrowTrajectory(localOffset.forward, localOffset.side);
  }, [localOffset, getThrowTrajectory]);

  const isTileValidForLanding = useCallback(
    (x: number, y: number) => {
      if (!levelData) return false;
      if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height)
        return false;

      const tile = levelData.grid[y][x];
      if (tile.type === "WALL" && tile.blocking !== false) return false;
      if (tile.type === "DOOR" && tile.door?.state !== "OPEN") return false;
      if (tile.decoration?.blocking) return false;

      return true;
    },
    [levelData],
  );

  const isBlocked = useMemo(() => {
    if (!levelData) return true;

    const { x, y } = targetCoords;
    if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height)
      return true;

    // IPI Pattern: If side-stepping, check the first step (index 1) only for geometry
    const isSideStep = localOffset.side !== 0;

    for (let i = 1; i < trajectory.length; i++) {
      const p = trajectory[i];
      const tile = levelData.grid[p.y]?.[p.x];
      const isTargetTile = i === trajectory.length - 1;

      if (isSideStep && i === 1) {
        // Side step: Block only on Walls/Doors
        if (isVisuallyBlocking(tile) || (tile.enemyId && !isTargetTile))
          return true;
      } else {
        // Standard check
        if (
          isVisuallyBlocking(tile) ||
          (tile.decoration && tile.decoration.blocking) ||
          (tile.enemyId && !isTargetTile)
        )
          return true;
      }
    }
    return !isTileValidForLanding(x, y);
  }, [
    trajectory,
    levelData,
    targetCoords,
    isTileValidForLanding,
    localOffset.side,
  ]);

  const handleThrowInput = (
    action:
      "PREV" | "NEXT" | "ATTACK" | "CANCEL" | "UP" | "DOWN" | "LEFT" | "RIGHT",
  ) => {
    if (gameState !== GameState.THROWING || !itemToThrow) return;

    if (action === "CANCEL") {
      cancelThrow();
      return;
    }

    const tryMove = (newForward: number, newSide: number): boolean => {
      const coords = getCoordsForOffset(newForward, newSide);

      // 1. Check if landing tile is valid
      if (!isTileValidForLanding(coords.x, coords.y)) return false;

      // 2. Check if trajectory to this tile is clear
      if (levelData) {
        const testTrajectory = getThrowTrajectory(newForward, newSide);
        const isSideStep = newSide !== 0;

        for (let i = 1; i < testTrajectory.length; i++) {
          const p = testTrajectory[i];
          const tile = levelData.grid[p.y]?.[p.x];
          const isTargetTile = i === testTrajectory.length - 1;

          if (isSideStep && i === 1) {
            // Side step: Block only on Walls/Doors
            if (isVisuallyBlocking(tile) || (tile.enemyId && !isTargetTile))
              return false;
          } else {
            // Standard check
            if (
              isVisuallyBlocking(tile) ||
              (tile.decoration && tile.decoration.blocking) ||
              (tile.enemyId && !isTargetTile)
            )
              return false;
          }
        }
      }

      setLocalOffset({ forward: newForward, side: newSide });
      return true;
    };

    const attemptRotation = (isRight: boolean) => {
      const currentDir = Math.round(player.dir);
      const newDir = isRight ? (currentDir + 1) % 4 : (currentDir + 3) % 4;

      const preferredSide = isRight ? -1 : 1;
      const scanOrder = [preferredSide, 0, -preferredSide];

      let found = false;
      // Scan from current distance down to 1 to find closest valid point in new direction
      for (let f = localOffset.forward; f >= 1; f--) {
        for (const s of scanOrder) {
          const c = getCoordsForOffset(f, s, newDir);

          // Check landing and trajectory
          if (isTileValidForLanding(c.x, c.y)) {
            const testTrajectory = getBresenhamLine(
              player.pos.x,
              player.pos.y,
              c.x,
              c.y,
            );
            let pathBlocked = false;
            if (levelData) {
              // Determine front tile for new direction
              const forwardVec = [
                [0, -1],
                [1, 0],
                [0, 1],
                [-1, 0],
              ][newDir];
              const frontX = Math.round(player.pos.x) + forwardVec[0];
              const frontY = Math.round(player.pos.y) + forwardVec[1];

              for (let i = 1; i < testTrajectory.length; i++) {
                const p = testTrajectory[i];
                const isTargetTile = i === testTrajectory.length - 1;

                // IPI Pattern: If adjacent to player AND not the front tile (i.e. side tile), check only geometry
                const isAdjacent =
                  Math.abs(p.x - Math.round(player.pos.x)) +
                    Math.abs(p.y - Math.round(player.pos.y)) ===
                  1;
                const isFront = p.x === frontX && p.y === frontY;
                const isSideStep = isAdjacent && !isFront;

                const tile = levelData.grid[p.y]?.[p.x];

                if (isSideStep) {
                  if (
                    isVisuallyBlocking(tile) ||
                    (tile.enemyId && !isTargetTile)
                  ) {
                    pathBlocked = true;
                    break;
                  }
                } else {
                  if (
                    isVisuallyBlocking(tile) ||
                    (tile.decoration && tile.decoration.blocking) ||
                    (tile.enemyId && !isTargetTile)
                  ) {
                    pathBlocked = true;
                    break;
                  }
                }
              }
            }

            if (!pathBlocked) {
              setPlayer((prev) => ({ ...prev, dir: newDir, dir360: newDir }));
              setLocalOffset({ forward: f, side: s });
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      if (!found) {
        setPlayer((prev) => ({ ...prev, dir: newDir, dir360: newDir }));
        const fallbackCoords = getCoordsForOffset(1, 0, newDir);
        if (isTileValidForLanding(fallbackCoords.x, fallbackCoords.y)) {
          setLocalOffset({ forward: 1, side: 0 });
        }
      }
    };

    switch (action) {
      case "UP":
        for (
          let newForward = localOffset.forward + 1;
          newForward <= maxThrowRange;
          newForward++
        ) {
          if (tryMove(newForward, localOffset.side)) break;
        }
        break;
      case "DOWN":
        for (
          let newForward = localOffset.forward - 1;
          newForward >= 1;
          newForward--
        ) {
          if (tryMove(newForward, localOffset.side)) break;
        }
        break;
      case "LEFT":
        if (localOffset.side > -1) {
          if (!tryMove(localOffset.forward, localOffset.side - 1)) {
            if (localOffset.side === 1) {
              tryMove(localOffset.forward, -1);
            }
          }
        } else {
          attemptRotation(false);
        }
        break;
      case "RIGHT":
        if (localOffset.side < 1) {
          if (!tryMove(localOffset.forward, localOffset.side + 1)) {
            if (localOffset.side === -1) {
              tryMove(localOffset.forward, 1);
            }
          }
        } else {
          attemptRotation(true);
        }
        break;
      case "ATTACK":
        if (isBlocked) {
          if (strings) addLog(strings.logs.wall_hit, "INFO");
          return;
        }
        executeThrow();
        break;
    }
  };

  const executeThrow = () => {
    if (!itemToThrow || !levelData || !strings) return;

    if (isCombatActive && setCombat) {
      if (combatRef && combatRef.current) {
        combatRef.current.isProcessingTurn = true;
      }
      setCombat((prev) => ({ ...prev, isProcessingTurn: true }));
    }

    const { x, y } = targetCoords;
    const targetTile = levelData.grid[y][x];
    const damageNotation = itemToThrow.throwDamage || "0";
    const damage = rollDice(damageNotation);

    playSound("SYS_THROW");

    setThrowAnim({ item: itemToThrow, startTime: performance.now(), x, y });

    setPlayer((prev) => {
      const originalId = (itemToThrow as any).originalId || itemToThrow.id;
      const countToDrop = (itemToThrow as any).originalId
        ? itemToThrow.count
        : undefined;

      const isEquipped = prev.equippedWeapon?.id === originalId;

      let newInventory;
      if (countToDrop !== undefined) {
        newInventory = prev.inventory
          .map((i) => {
            if (i.id === originalId) {
              const newCount = (i.count || 1) - countToDrop;
              return { ...i, count: newCount };
            }
            return i;
          })
          .filter((i) => i.count === undefined || i.count > 0);
      } else {
        newInventory = prev.inventory.filter((i) => i.id !== originalId);
      }

      const newEquip = { ...prev.equipment };

      let thrownSlot: string | null = null;
      Object.keys(newEquip).forEach((key) => {
        if (newEquip[key as keyof typeof newEquip]?.id === originalId) {
          newEquip[key as keyof typeof newEquip] = null;
          thrownSlot = key;
        }
      });

      if (isEquipped) {
        newEquip.weapon = null;
        thrownSlot = "weapon";
      }

      // If throwing primary weapon, move akimbo weapon to primary slot
      if (thrownSlot === "weapon" && newEquip.weaponAkimbo) {
        newEquip.weapon = newEquip.weaponAkimbo;
        newEquip.weaponAkimbo = null;
      }

      return {
        ...prev,
        inventory: newInventory,
        equipment: newEquip,
        equippedWeapon: isEquipped
          ? newEquip.weapon || null
          : prev.equippedWeapon,
      };
    });

    addLog(
      strings.logs.item_thrown.replace("{name}", itemToThrow.name),
      "INFO",
    );

    if (isCombatActive) {
      setGameState(GameState.COMBAT);
    }

    setTimeout(() => {
      if (!isCombatActive) {
        setGameState(GameState.PLAYING);
        // Trigger non-combat turn processing after animation finishes
        if (onTakeTurn) onTakeTurn();
      }

      setThrowAnim(null);

      // --- BREAK WINDOWS ALONG TRAJECTORY ---
      let brokeGlass = false;
      setLevelData((prev: any) => {
        if (!prev) return null;
        const newGrid = prev.grid.map((row: any) => [...row]);
        let gridModified = false;

        trajectory.forEach((p) => {
          const tile = newGrid[p.y]?.[p.x];
          if (
            tile &&
            tile.isWindow &&
            !tile.isGlassBroken &&
            tile.canBeDestroyed !== false &&
            tile.glassAssetId
          ) {
            newGrid[p.y][p.x] = {
              ...tile,
              isGlassBroken: true,
              glassAssetId: undefined,
            };
            gridModified = true;
            brokeGlass = true;

            const prevAsset = tile.glassAssetId;
            if (playSound && tile.glassBreakSound) {
              playSound(tile.glassBreakSound, { x: p.x + 0.5, y: p.y + 0.5 });
            }

            if (onSpawnParticles && prevAsset && spriteMap) {
              const maskBuffer = getMaskBuffer(prevAsset, spriteMap as any);
              if (maskBuffer) {
                const shards = createShardParticles(
                  p.x + 0.5,
                  p.y + 0.5,
                  0.5,
                  prevAsset,
                  prevAsset,
                  maskBuffer,
                  20,
                  1.0,
                  spriteMap as any,
                );
                setTimeout(() => onSpawnParticles(shards), 50);
              }
            }
          } else if (
            tile &&
            tile.mirror &&
            !tile.isMirrorBroken &&
            tile.canBeDestroyed !== false &&
            tile.maskId
          ) {
            newGrid[p.y][p.x] = { ...tile, isMirrorBroken: true };
            gridModified = true;
            brokeGlass = true;

            const maskId = tile.maskId;
            const assetId = tile.assetId;
            if (playSound) {
              playSound("SYS_GLASS_SHATTER", { x: p.x + 0.5, y: p.y + 0.5 });
            }

            if (onSpawnParticles && maskId && spriteMap) {
              const maskBuffer = getMaskBuffer(maskId, spriteMap as any);
              if (maskBuffer) {
                const shards = createShardParticles(
                  p.x + 0.5,
                  p.y + 0.5,
                  0.5,
                  assetId || maskId,
                  maskId,
                  maskBuffer,
                  20,
                  1.0,
                  spriteMap as any,
                );
                setTimeout(() => onSpawnParticles(shards), 50);
              }
            }
          } else if (
            tile &&
            tile.type === "DOOR" &&
            tile.door &&
            tile.door.state !== "OPEN" &&
            !tile.door.broken &&
            tile.door.maskId
          ) {
            newGrid[p.y][p.x] = {
              ...tile,
              door: { ...tile.door, broken: true },
              description: (strings as any)?.environment?.broken_door || "Broken Door",
            };
            gridModified = true;
            brokeGlass = true;

            const maskId = tile.door.maskId;
            const assetId = tile.door.textureId || tile.door.maskId;
            if (playSound) {
              playSound("SYS_GLASS_SHATTER", { x: p.x + 0.5, y: p.y + 0.5 });
            }

            if (onSpawnParticles && maskId && spriteMap) {
              const maskBuffer = getMaskBuffer(maskId, spriteMap as any);
              if (maskBuffer) {
                const shards = createShardParticles(
                  p.x + 0.5,
                  p.y + 0.5,
                  0.5,
                  assetId,
                  maskId,
                  maskBuffer,
                  20,
                  1.0,
                  spriteMap as any,
                );
                setTimeout(() => onSpawnParticles(shards), 50);
              }
            }
          }
        });

        return gridModified ? { ...prev, grid: newGrid } : prev;
      });

      if (brokeGlass && strings.logs.glass_broken) {
        addLog(strings.logs.glass_broken, "INFO");
      }

      const isGrenade =
        !(itemToThrow as any).isSafeDrop &&
        (itemToThrow.type === "GRENADE" || itemToThrow.type === "FLASHBANG");
      const isMolotov = !(itemToThrow as any).isSafeDrop && itemToThrow.type === "MOLOTOV";
      const timer = (itemToThrow as any).timer || 0;
      let shouldDropItem = true;

      // MOLOTOV LOGIC
      if (isMolotov) {
        shouldDropItem = false;
        const fireObjectId = (itemToThrow as any).fireObjectId || "fire";
        const itemSpreadsLeft = (itemToThrow as any).spreadsLeft !== undefined ? (itemToThrow as any).spreadsLeft : 3;
        const itemSpreadChance = (itemToThrow as any).spreadChance !== undefined ? (itemToThrow as any).spreadChance : 0.5;
        const explosionSoundId =
          (itemToThrow as any).explosionSoundId || "GLASS";
        const explosionRange = (itemToThrow as any).explosionRange || 0;
        const glassTextureId = (itemToThrow as any).glassTextureId;

        if (explosionSoundId) playSound(explosionSoundId, { x, y });
        if (triggerExplosionFlash) triggerExplosionFlash(x, y, 4.0, 400);
        else if (triggerFlash) triggerFlash(2.5);

        // Spawn Glass Shards and Fire Particles
        let particlesToSpawn: any[] = [];

        if (glassTextureId && spriteMap && onSpawnParticles) {
          const maskBuffer = getMaskBuffer(glassTextureId, spriteMap as any);
          if (maskBuffer) {
            const shards = createShardParticles(
              x + 0.5,
              y + 0.5,
              0.05,
              glassTextureId,
              glassTextureId,
              maskBuffer,
              30,
              0.25,
              spriteMap as any,
            ); // Decreased sizeMult for smaller speed/spread
            particlesToSpawn = particlesToSpawn.concat(shards);
          }
        }

        if (onSpawnParticles) {
          const explosionParticles = createMolotovExplosionParticles(
            x + 0.5,
            y + 0.5,
            0.5,
          );
          particlesToSpawn = particlesToSpawn.concat(explosionParticles);

          if (particlesToSpawn.length > 0) {
            onSpawnParticles(particlesToSpawn);
          }
        }

        // Spawn fire decoration
        if (decorationsDb && decorationsDb[fireObjectId]) {
          const decBase = decorationsDb[fireObjectId];
          let hitEnemyIds: string[] = [];
          const r = Math.floor(explosionRange);

          // Calculate hits before state update
          if (levelData && levelData.grid) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (
                  ty >= 0 &&
                  ty < levelData.grid.length &&
                  tx >= 0 &&
                  tx < levelData.grid[ty].length
                ) {
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  if (distance <= r * 1.5) {
                    const t = levelData.grid[ty][tx];
                    if (t.enemyId && !hitEnemyIds.includes(t.enemyId)) {
                      hitEnemyIds.push(t.enemyId);
                    }
                  }
                }
              }
            }
          }

          setLevelData((prev: any) => {
            if (!prev) return prev;
            const newGrid = prev.grid.map((row: any) => [...row]);
            const fireDec = { ...decBase, type: fireObjectId };

            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const tx = x + dx;
                const ty = y + dy;

                // Check bounds
                if (
                  ty >= 0 &&
                  ty < newGrid.length &&
                  tx >= 0 &&
                  tx < newGrid[ty].length
                ) {
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  if (distance <= r * 1.5) {
                    const tile = newGrid[ty][tx];

                    // Don't spawn into walls or closed doors
                    if (
                      (tile.type === "WALL" && tile.blocking !== false) ||
                      (tile.type === "DOOR" && tile.door?.state !== "OPEN")
                    ) {
                      continue;
                    }
                    if (tile.decoration) {
                      if (
                        tile.decoration.destructable &&
                        tile.decoration.explosion_damage
                      ) {
                        if (onExplodeLogic) {
                          const dmg = tile.decoration.explosion_damage;
                          const tx_exp = tx;
                          const ty_exp = ty;
                          setTimeout(
                            () =>
                              onExplodeLogic(
                                tx_exp,
                                ty_exp,
                                dmg,
                                1.5,
                                "ANIM_EXPLOSION",
                              ),
                            50,
                          );
                        }
                      } else {
                        continue;
                      }
                    }

                    const spawnedDec = {
                      ...decBase,
                      type: fireObjectId,
                      id: `${fireObjectId}_${Math.random()}`,
                      createdByPlayer: true,
                      isScorching: decBase.isScorching !== undefined ? decBase.isScorching : true,
                      spreadsLeft: itemSpreadsLeft,
                      spreadChance: itemSpreadChance,
                      spreadType: decBase.spreadType || fireObjectId,
                      lifeTime: decBase.lifeTime !== undefined ? decBase.lifeTime : 6,
                    };
                    newGrid[ty][tx] = {
                      ...tile,
                      decoration: spawnedDec,
                      decorations: [spawnedDec],
                    };
                    (window as any).registerTimedEffect?.(tx, ty);
                  }
                }
              }
            }

            return { ...prev, grid: newGrid };
          });

          let aggroIds = [...hitEnemyIds];
          const otherAggroIds = findEnemiesWithLineOfSight(
            player.pos,
            levelData?.grid || [],
            levelData?.width || 0,
            levelData?.height || 0,
          );
          for (const id of otherAggroIds) {
            if (!aggroIds.includes(id)) {
              aggroIds.push(id);
            }
          }

          if (aggroIds.length > 0) {
            if (!isCombatActive && startCombat) {
              startCombat(
                aggroIds.map((id) => ({ id, alignment: "CENTER" })),
                undefined,
                true,
              );
            } else if (
              isCombatActive &&
              joinCombat &&
              combatRef &&
              combatRef.current
            ) {
              const newEnemies = aggroIds.filter(
                (id) => !combatRef.current.activeGroup.some((g) => g.id === id),
              );
              if (newEnemies.length > 0) {
                joinCombat(newEnemies);
              }
            }
          }
        }
      }

      // GRENADE LOGIC
      if (isGrenade && timer === 0) {
        const explosionRange = (itemToThrow as any).explosionRange || 1;
        const explosionDice = itemToThrow.damageDice || "3d6";
        const explosionId =
          (itemToThrow as any).explosionId !== undefined
            ? (itemToThrow as any).explosionId
            : itemToThrow.type === "FLASHBANG"
              ? ""
              : "ANIM_EXPLOSION";
        const explosionSoundId =
          (itemToThrow as any).explosionSoundId || "EXPLOSION";

        if (triggerExplosionFlash)
          triggerExplosionFlash(
            x,
            y,
            4.0,
            400,
            itemToThrow.type === "FLASHBANG",
          );
        else if (triggerFlash) triggerFlash(2.5);

        if (triggerScreenShake) {
          const vibrationPattern = itemToThrow.vibrationPattern;
          triggerScreenShake(true, vibrationPattern);
        }

        if (onExplodeLogic) {
          onExplodeLogic(
            x,
            y,
            explosionDice,
            explosionRange,
            explosionId,
            explosionSoundId,
            itemToThrow.type,
            (itemToThrow as any).duration,
          );
        }

        if (isCombatActive && triggerEnemyTurn) {
          triggerEnemyTurn(false);
        }
        return;
      }

      // --- STANDARD ITEM DROP LOGIC (Non-Explosive) ---
      let isTargetDead = false;
      let didHitEnemy = false;

      if (targetTile.enemyId) {
        const enemyId = targetTile.enemyId;
        const enemy = enemies.get(enemyId);

        if (enemy) {
          if (damage > 0) {
            didHitEnemy = true;
            addLog(
              strings.logs.throw_hit
                .replace("{enemy}", enemy.name)
                .replace("{item}", itemToThrow.name)
                .replace("{damage}", damage.toString()),
              "COMBAT_PLAYER",
            );

            if (onVisualHit) onVisualHit(enemyId);

            // Play damage sound for standard throws too
            if (enemy.sounds && enemy.sounds.damage) {
              playSound(enemy.sounds.damage, { x, y });
            }

            const newHp = enemy.hp - damage;
            if (newHp <= 0) {
              isTargetDead = true;
              onEnemiesKilled([enemyId]);
            } else {
              setEnemies((prev) => {
                const next = new Map(prev);
                next.set(enemyId, { ...enemy, hp: newHp });
                return next;
              });
            }
          }
        }
      }

      const dropItem = () => {
        if (!shouldDropItem) return;
        setLevelData((prev: any) => {
          if (!prev) return null;
          const newGrid = [...prev.grid];
          const newRow = [...newGrid[y]];
          const existingItems = newRow[x].items || [];
          const newItem = {
            ...itemToThrow,
            id: Math.random().toString(36).substr(2, 9),
          };
          if (isGrenade && timer > 0) {
            (newItem as any).activeTimer = timer;
            (newItem as any).justPlaced = true;
          }

          if (itemToThrow.type === "FLARE" || (itemToThrow as any).flareDuration !== undefined) {
            const fDur = (itemToThrow as any).flareDuration ?? 15;
            const initDur = (itemToThrow as any).initialFlareDuration ?? fDur;
            (newItem as any).flareDuration = fDur;
            (newItem as any).initialFlareDuration = initDur;
            (newItem as any).justPlaced = true;
            if (!(itemToThrow as any).isSafeDrop) {
              (newItem as any).activeTimer = fDur;
              (newItem as any).placedAsThrown = true;
              (newItem as any).isLit = true;
              (newItem as any).uncollectible = true;
              (newItem as any).canBeInspected = false;
              (newItem as any).mirroredThrow = Math.random() > 0.5 ? -1 : 1;
            }
          } else if ((itemToThrow as any).throwId && !(itemToThrow as any).isSafeDrop) {
            (newItem as any).placedAsThrown = true;
            (newItem as any).uncollectible = true;
            (newItem as any).canBeInspected = false;
            (newItem as any).mirroredThrow = Math.random() > 0.5 ? -1 : 1;
          }

          newRow[x] = { ...newRow[x], items: [...existingItems, newItem] };
          newGrid[y] = newRow;
          return { ...prev, grid: newGrid };
        });

        if ((isGrenade && timer > 0) || ((itemToThrow.type === "FLARE" || (itemToThrow as any).flareDuration !== undefined) && !(itemToThrow as any).isSafeDrop)) {
          (window as any).registerTimedEffect?.(x, y);
        }

        if (!(itemToThrow as any).isSafeDrop && itemToThrow.sounds?.bounce) {
          playSound(itemToThrow.sounds.bounce, { x, y });
        }
      };

      dropItem();

      if (isCombatActive) {
        let allEnemiesDead = false;
        if (combatRef && combatRef.current && combatRef.current.activeGroup) {
          const activeIds = combatRef.current.activeGroup.map((g) => g.id);
          const remaining = activeIds.filter(
            (id) => !isTargetDead || id !== targetTile.enemyId,
          );
          if (remaining.length === 0) {
            allEnemiesDead = true;
          }
        }

        if (didHitEnemy && joinCombat) {
          const otherAggroIds = findEnemiesWithLineOfSight(
            player.pos,
            levelData.grid,
            levelData.width,
            levelData.height,
          );
          const validAggroIds = isTargetDead
            ? otherAggroIds.filter((id) => id !== targetTile.enemyId)
            : [...otherAggroIds];

          if (
            targetTile.enemyId &&
            !isTargetDead &&
            !validAggroIds.includes(targetTile.enemyId)
          ) {
            validAggroIds.push(targetTile.enemyId);
          }

          if (validAggroIds.length > 0 && combatRef && combatRef.current) {
            const newEnemies = validAggroIds.filter(
              (id) => !combatRef.current.activeGroup.some((g) => g.id === id),
            );
            if (newEnemies.length > 0) {
              joinCombat(newEnemies);
            }
          }
        }

        if (!allEnemiesDead && triggerEnemyTurn) {
          setTimeout(() => triggerEnemyTurn(), 300);
        }
      } else {
        if (didHitEnemy) {
          const otherAggroIds = findEnemiesWithLineOfSight(
            player.pos,
            levelData.grid,
            levelData.width,
            levelData.height,
          );
          const validAggroIds = isTargetDead
            ? otherAggroIds.filter((id) => id !== targetTile.enemyId)
            : [...otherAggroIds];

          if (
            targetTile.enemyId &&
            !isTargetDead &&
            !validAggroIds.includes(targetTile.enemyId)
          ) {
            validAggroIds.push(targetTile.enemyId);
          }

          if (validAggroIds.length > 0) {
            // startCombat with 'true' (3rd param) automatically schedules enemy turn in useCombatSystem
            startCombat(
              validAggroIds.map((id) => ({ id, alignment: "CENTER" })),
              undefined,
              true,
            );
          }
        }
      }
    }, 450);

    setItemToThrow(null);
  };

  return {
    itemToThrow,
    localOffset,
    targetCoords,
    isBlocked,
    isThrowing: itemToThrow !== null,
    initiateThrow,
    handleThrowInput,
    cancelThrow,
  };
};
