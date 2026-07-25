import { useCallback, useRef, useEffect } from "react";
import { ScriptTrigger, ScriptAction, GameState } from "../types";
import { findPath } from "../utils/aiLogic";
import { calculateLightMap } from "../utils/levelLogic";
import { ensureEntityAssetsLoaded } from "../utils/assetExtraction";
import enemiesDb from "../data/enemies.json";
import itemsDb from "../data/items.json";
import decorationsDb from "../data/decorations.json";
import npcsDb from "../data/npcs.json";

interface ParsedSubPart {
  flagName: string;
  isNegated: boolean;
}

type ParsedCondition = ParsedSubPart[][];

const flagConditionCache = new Map<string, ParsedCondition>();

function parseFlagCondition(condition: string): ParsedCondition {
  let cached = flagConditionCache.get(condition);
  if (cached) return cached;

  const orParts = condition.includes("||") || condition.includes("|")
    ? condition.split(/\|\||\|/)
    : [condition];

  const parsed: ParsedCondition = [];

  for (let i = 0; i < orParts.length; i++) {
    const part = orParts[i];
    const andParts = part.split(/,;?|&&|&|;/);
    const subParts: ParsedSubPart[] = [];

    for (let j = 0; j < andParts.length; j++) {
      let sub = andParts[j].trim();
      if (!sub) continue;
      let isNegated = false;
      if (sub.startsWith("!")) {
        isNegated = true;
        sub = sub.substring(1).trim();
      }
      if (sub) {
        subParts.push({ flagName: sub, isNegated });
      }
    }
    if (subParts.length > 0) {
      parsed.push(subParts);
    }
  }

  flagConditionCache.set(condition, parsed);
  return parsed;
}

export function isFlagTrue(val: any): boolean {
  return !(val === undefined || val === null || val === "" || val === false || val === "false" || val === 0 || val === "0");
}

export function evaluateFlagCondition(condition: string, flags: Record<string, any>): boolean {
  if (!condition) return true;
  const parsed = parseFlagCondition(condition);
  if (parsed.length === 0) return true;

  for (let i = 0; i < parsed.length; i++) {
    const andGroup = parsed[i];
    let andSatisfied = true;
    for (let j = 0; j < andGroup.length; j++) {
      const { flagName, isNegated } = andGroup[j];
      const val = isFlagTrue(flags[flagName]);
      if (isNegated ? val : !val) {
        andSatisfied = false;
        break;
      }
    }
    if (andSatisfied) return true;
  }
  return false;
}

export function evaluateFlagsArray(requiresFlags: string[], flags: Record<string, any>): boolean {
  for (let i = 0; i < requiresFlags.length; i++) {
    let part = requiresFlags[i].trim();
    if (!part) continue;
    let isNegated = false;
    if (part.startsWith("!")) {
      isNegated = true;
      part = part.substring(1).trim();
    }
    const val = isFlagTrue(flags[part]);
    if (isNegated ? val : !val) return false;
  }
  return true;
}

export const useScriptSystem = (
  player: any,
  setPlayer: any,
  levelData: any,
  setLevelData: any,
  enemies: any,
  setEnemies: any,
  addLog: any,
  playSound: any,
  startDialogue: any,
  showToast: any,
  strings: any,
  localize: any,
  onRadioTrigger?: any,
  setCinematicMode?: (val: boolean) => void,
  setCinematicCamera?: (
    val:
      | { x: number; y: number; dir: number; pitch?: number; zoom?: number; floor?: number }
      | null
      | ((
          prev: { x: number; y: number; dir: number; pitch?: number; zoom?: number; floor?: number } | null,
        ) => { x: number; y: number; dir: number; pitch?: number; zoom?: number; floor?: number } | null),
  ) => void,
  isPausedRef?: any,
  raycasterRef?: any,
  showTutorial?: (params: any) => Promise<void>,
  setGameState?: any,
  triggerScreenShake?: any,
  setScriptedDeathProgress?: any,
  handleExplosion?: any,
  setScreamer?: any,
  setSkyTexture?: any,
  spriteMap?: any,
  playMusic?: any,
  pauseMusic?: any,
  resumeMusic?: any,
  stopMusic?: any,
  setGameOverType?: (type: 'death' | 'script') => void,
  unlockAchievement?: (key: string) => void,
) => {
  const latestPlayerRef = useRef(player);
  const latestLevelDataRef = useRef(levelData);
  const latestEnemiesRef = useRef(enemies);
  const latestStringsRef = useRef(strings);
  const latestOnRadioTriggerRef = useRef(onRadioTrigger);
  const latestAddLogRef = useRef(addLog);
  const latestPlaySoundRef = useRef(playSound);
  const latestStartDialogueRef = useRef(startDialogue);
  const latestShowToastRef = useRef(showToast);
  const latestShowTutorialRef = useRef(showTutorial);
  const latestSetGameStateRef = useRef(setGameState);
  const latestTriggerScreenShakeRef = useRef(triggerScreenShake);
  const latestSetScriptedDeathProgressRef = useRef(setScriptedDeathProgress);
  const latestHandleExplosionRef = useRef(handleExplosion);
  const latestSetScreamerRef = useRef(setScreamer);
  const latestSetCinematicModeRef = useRef(setCinematicMode);
  const latestSetCinematicCameraRef = useRef(setCinematicCamera);
  const latestLocalizeRef = useRef(localize);
  const latestSetSkyTextureRef = useRef(setSkyTexture);
  const latestSpriteMapRef = useRef(spriteMap);
  const latestPlayMusicRef = useRef(playMusic);
  const latestPauseMusicRef = useRef(pauseMusic);
  const latestResumeMusicRef = useRef(resumeMusic);
  const latestStopMusicRef = useRef(stopMusic);
  const latestSetGameOverTypeRef = useRef(setGameOverType);

  const timerStatesRef = useRef<{ [triggerId: string]: { targetMs: number; elapsedMs: number } }>({});
  const latestTriggerPlayerPosRef = useRef<{ x: number; y: number } | null>(null);

  const runningTriggersRef = useRef<Set<any>>(new Set());
  const locallyFiredTriggersRef = useRef<Set<any>>(new Set());
  const lastLoadedLevelKeyRef = useRef<string>("");

  const levelKey = levelData ? `${levelData.fileName || ""}_${levelData.locationName || ""}_${levelData.playerStart?.symbol || ""}` : "";
  if (levelKey !== lastLoadedLevelKeyRef.current) {
    lastLoadedLevelKeyRef.current = levelKey;
    locallyFiredTriggersRef.current.clear();
    runningTriggersRef.current.clear();
  }

  latestPlayerRef.current = player;
  latestLevelDataRef.current = levelData;
  latestEnemiesRef.current = enemies;
  latestStringsRef.current = strings;
  latestOnRadioTriggerRef.current = onRadioTrigger;
  latestAddLogRef.current = addLog;
  latestPlaySoundRef.current = playSound;
  latestStartDialogueRef.current = startDialogue;
  latestShowToastRef.current = showToast;
  latestShowTutorialRef.current = showTutorial;
  latestSetGameStateRef.current = setGameState;
  latestTriggerScreenShakeRef.current = triggerScreenShake;
  latestSetScriptedDeathProgressRef.current = setScriptedDeathProgress;
  latestHandleExplosionRef.current = handleExplosion;
  latestSetScreamerRef.current = setScreamer;
  latestSetCinematicModeRef.current = setCinematicMode;
  latestSetCinematicCameraRef.current = setCinematicCamera;
  latestLocalizeRef.current = localize;
  latestSetSkyTextureRef.current = setSkyTexture;
  latestSpriteMapRef.current = spriteMap;
  latestPlayMusicRef.current = playMusic;
  latestPauseMusicRef.current = pauseMusic;
  latestResumeMusicRef.current = resumeMusic;
  latestStopMusicRef.current = stopMusic;
  latestSetGameOverTypeRef.current = setGameOverType;
  const latestUnlockAchievementRef = useRef(unlockAchievement);
  latestUnlockAchievementRef.current = unlockAchievement;

  const triggerIndicesRef = useRef<{
    triggersByType: Map<string, any[]>;
    triggersByPos: Map<string, any[]>;
    triggersById: Map<string, any>;
    triggersList: any[];
  }>({
    triggersByType: new Map(),
    triggersByPos: new Map(),
    triggersById: new Map(),
    triggersList: [],
  });

  const currentLevelTriggers = levelData?.triggers;
  if (currentLevelTriggers !== triggerIndicesRef.current.triggersList) {
    const triggersByType = new Map<string, any[]>();
    const triggersByPos = new Map<string, any[]>();
    const triggersById = new Map<string, any>();

    if (Array.isArray(currentLevelTriggers)) {
      for (let i = 0; i < currentLevelTriggers.length; i++) {
        const t = currentLevelTriggers[i];
        if (!t) continue;

        if (t.id) {
          triggersById.set(t.id, t);
        }

        const type = t.type || "LEGACY_TILE";
        if (!triggersByType.has(type)) {
          triggersByType.set(type, []);
        }
        triggersByType.get(type)!.push(t);

        const tx = t.params?.x ?? t.x;
        const ty = t.params?.y ?? t.y;
        if (tx !== undefined && ty !== undefined && (!t.params || !t.params.radius || t.params.radius === 0)) {
          const posKey = `${tx},${ty}`;
          if (!triggersByPos.has(posKey)) {
            triggersByPos.set(posKey, []);
          }
          triggersByPos.get(posKey)!.push(t);
        }
      }
    }

    triggerIndicesRef.current = {
      triggersByType,
      triggersByPos,
      triggersById,
      triggersList: currentLevelTriggers || [],
    };
  }

  const checkTriggers = useCallback(
    (triggerType: string, eventParams: any) => {
      const currentLevelData = latestLevelDataRef.current;
      const currentPlayer = latestPlayerRef.current;

      if (triggerType === "ON_ENTER_TILE" && eventParams && eventParams.x !== undefined && eventParams.y !== undefined) {
        latestTriggerPlayerPosRef.current = { x: eventParams.x, y: eventParams.y };
      }

      if (!currentLevelData || !currentLevelData.triggers || currentLevelData.triggers.length === 0)
        return;

      let candidateTriggers: any[] = [];
      const { triggersByType, triggersByPos, triggersById } = triggerIndicesRef.current;

      if (eventParams && eventParams.scriptTriggerId) {
        const direct = triggersById.get(eventParams.scriptTriggerId);
        if (direct) candidateTriggers = [direct];
      } else if (triggerType === "ON_ENTER_TILE" && eventParams && eventParams.x !== undefined && eventParams.y !== undefined) {
        const posKey = `${eventParams.x},${eventParams.y}`;
        const exactPos = triggersByPos.get(posKey) || [];
        const enterTileTriggers = triggersByType.get("ON_ENTER_TILE") || [];
        const legacyTriggers = triggersByType.get("LEGACY_TILE") || [];

        candidateTriggers = [...exactPos];
        for (let i = 0; i < enterTileTriggers.length; i++) {
          const t = enterTileTriggers[i];
          if (!candidateTriggers.includes(t)) {
            const radius = t.params?.radius || 0;
            const tx = t.params?.x;
            if (tx === undefined || radius > 0) {
              candidateTriggers.push(t);
            }
          }
        }
        for (let i = 0; i < legacyTriggers.length; i++) {
          const t = legacyTriggers[i];
          if (!candidateTriggers.includes(t)) {
            candidateTriggers.push(t);
          }
        }
      } else if (triggerType === "ON_INTERACT" && eventParams && eventParams.x !== undefined && eventParams.y !== undefined) {
        const posKey = `${eventParams.x},${eventParams.y}`;
        const exactPos = triggersByPos.get(posKey) || [];
        const interactTriggers = triggersByType.get("ON_INTERACT") || [];
        candidateTriggers = [...exactPos];
        for (let i = 0; i < interactTriggers.length; i++) {
          const t = interactTriggers[i];
          if (!candidateTriggers.includes(t)) {
            if (!t.params || t.params.x === undefined) {
              candidateTriggers.push(t);
            }
          }
        }
      } else {
        candidateTriggers = triggersByType.get(triggerType) || [];
      }

      if (candidateTriggers.length === 0) return;

      let inventoryItemTypes: Set<string> | null = null;
      const getInventoryTypes = () => {
        if (!inventoryItemTypes) {
          inventoryItemTypes = new Set();
          if (currentPlayer && Array.isArray(currentPlayer.inventory)) {
            for (let i = 0; i < currentPlayer.inventory.length; i++) {
              if (currentPlayer.inventory[i]?.type) {
                inventoryItemTypes.add(currentPlayer.inventory[i].type);
              }
            }
          }
        }
        return inventoryItemTypes;
      };

      const activeTriggers = candidateTriggers.filter((t: any) => {
        if (t.disabled) return false;

        if (t.fired && t.runOnce !== false && t.type !== undefined) return false;

        if (locallyFiredTriggersRef.current.has(t) && t.runOnce !== false) return false;

        if (runningTriggersRef.current.has(t)) return false;

        // Legacy trigger support
        if (!t.type) {
          if (triggerType === "ON_ENTER_TILE") {
            const range = t.range || 0;
            const pX = eventParams.x;
            const pY = eventParams.y;
            const distance = Math.max(Math.abs(t.x - pX), Math.abs(t.y - pY));

            if (distance > range) return false;

            if (t.requiredItemType) {
              if (!getInventoryTypes().has(t.requiredItemType)) return false;
            }
            return true;
          }
          return false;
        }

        const isDirect = !!(eventParams && eventParams.scriptTriggerId && t.id === eventParams.scriptTriggerId);

        if (!isDirect && t.type !== triggerType) return false;

        if (t.requiredItemType) {
          if (!getInventoryTypes().has(t.requiredItemType)) return false;
        }

        const flags = currentLevelData.scriptFlags || {};
        if (t.requiresFlag) {
          if (!evaluateFlagCondition(t.requiresFlag, flags)) return false;
        }

        if (t.requiresFlags && Array.isArray(t.requiresFlags)) {
          if (!evaluateFlagsArray(t.requiresFlags, flags)) return false;
        }

        if (isDirect) return true;

        if (triggerType === "ON_ENTER_TILE") {
          const triggerAtStart = t.triggerAtStart !== false;
          if (eventParams.atStart !== undefined && eventParams.atStart !== triggerAtStart) {
            return false;
          }

          const p = t.params;
          if (p && p.x !== undefined && p.y !== undefined) {
            const radius = p.radius || 0;
            if (radius === 0) {
              if (eventParams.x !== p.x || eventParams.y !== p.y) return false;
            } else {
              const distance = Math.max(
                Math.abs(eventParams.x - p.x),
                Math.abs(eventParams.y - p.y),
              );
              if (distance > radius) return false;
            }
          }
        }

        if (triggerType === "ON_INTERACT") {
          const p = t.params;
          if (p && p.x !== undefined && p.y !== undefined) {
            if (eventParams.x !== p.x || eventParams.y !== p.y) return false;

            if (
              !t.triggerOnAnyInteract &&
              eventParams.actionId !== undefined &&
              eventParams.actionId !== t.id
            ) {
              return false;
            }

            if (p.side && p.side !== "ANY") {
              if (eventParams.playerDir !== undefined) {
                const pDir = Math.round(eventParams.playerDir) % 4;
                const reqFace = p.side.toUpperCase();
                const isFacingCorrectly =
                  (pDir === 0 && (reqFace === "S" || reqFace === "SOUTH")) ||
                  (pDir === 1 && (reqFace === "W" || reqFace === "WEST")) ||
                  (pDir === 2 && (reqFace === "N" || reqFace === "NORTH")) ||
                  (pDir === 3 && (reqFace === "E" || reqFace === "EAST"));
                if (!isFacingCorrectly) return false;
              }
            }
          }
        }

        if (triggerType === "ON_ENEMY_DEFEAT") {
          const p = t.params;
          if (p) {
            // Check enemy ID / definition ID if specified and non-empty
            if (p.enemyId !== undefined && p.enemyId !== null && String(p.enemyId).trim() !== "") {
              const targetEnemyId = String(p.enemyId).trim().toLowerCase();
              const evtEnemyId = String(eventParams.enemyId || "").trim().toLowerCase();
              const evtDefId = String(eventParams.definitionId || "").trim().toLowerCase();
              if (evtEnemyId !== targetEnemyId && evtDefId !== targetEnemyId) {
                return false;
              }
            }

            // Check position X / Y if specified and non-empty
            const hasX = p.x !== undefined && p.x !== null && String(p.x).trim() !== "";
            const hasY = p.y !== undefined && p.y !== null && String(p.y).trim() !== "";

            if (hasX || hasY) {
              const reqX = hasX ? Number(p.x) : undefined;
              const reqY = hasY ? Number(p.y) : undefined;

              const checkMatch = (posX: any, posY: any) => {
                if (posX === undefined || posY === undefined || posX === null || posY === null) return false;
                if (reqX !== undefined && Number(posX) !== reqX) return false;
                if (reqY !== undefined && Number(posY) !== reqY) return false;
                return true;
              };

              const matchesCurrent = checkMatch(eventParams.currentX ?? eventParams.x, eventParams.currentY ?? eventParams.y);
              const matchesHome = checkMatch(eventParams.homeX, eventParams.homeY);
              const matchesOrig = checkMatch(eventParams.originalHomeX, eventParams.originalHomeY);
              const matchesFallback = checkMatch(eventParams.x, eventParams.y);

              if (!matchesCurrent && !matchesHome && !matchesOrig && !matchesFallback) {
                return false;
              }
            }
          }
        }

        if (triggerType === "ON_ITEM_PICKUP") {
          const p = t.params;
          if (p && p.itemId !== undefined) {
            if (
              eventParams.itemId !== p.itemId &&
              eventParams.itemDefinitionId !== p.itemId
            ) {
              return false;
            }
          }
          if (p && p.keyId !== undefined) {
            if (eventParams.keyId !== p.keyId) {
              return false;
            }
          }
        }

        if (triggerType === "ON_DOOR_STATE_CHANGE") {
          const p = t.params || {};
          if (p.x !== undefined && p.x !== eventParams.x) return false;
          if (p.y !== undefined && p.y !== eventParams.y) return false;
          if (p.state !== undefined && p.state !== eventParams.state)
            return false;
        }

        if (triggerType === "ON_TIMER") {
          if (eventParams && eventParams.triggerId !== undefined) {
            if (t.id !== eventParams.triggerId) return false;
          }
        }

        if (triggerType === "ON_FLAG_CHANGE") {
          const p = t.params;
          if (p) {
            if (p.flag && eventParams.flag !== p.flag) {
              return false;
            }
            if (p.value !== undefined && p.value !== "") {
              const expectedVal = p.value === "true" || p.value === true ? true : (p.value === "false" || p.value === false ? false : p.value);
              const actualVal = eventParams.value === "true" || eventParams.value === true ? true : (eventParams.value === "false" || eventParams.value === false ? false : eventParams.value);
              if (actualVal !== expectedVal) {
                return false;
              }
            }
          }
        }

        return true;
      });

      if (activeTriggers.length > 0) {
        for (let i = 0; i < activeTriggers.length; i++) {
          const t = activeTriggers[i];
          runningTriggersRef.current.add(t);
          locallyFiredTriggersRef.current.add(t);
        }

        executeActions(activeTriggers, eventParams).finally(() => {
          for (let i = 0; i < activeTriggers.length; i++) {
            runningTriggersRef.current.delete(activeTriggers[i]);
          }
        });

        const triggersNeedingFiredUpdate = activeTriggers.filter(
          (t: any) => t.runOnce !== false && !t.fired
        );

        if (triggersNeedingFiredUpdate.length > 0) {
          for (let i = 0; i < triggersNeedingFiredUpdate.length; i++) {
            triggersNeedingFiredUpdate[i].fired = true;
          }
          const triggersNeedingFiredSet = new Set(triggersNeedingFiredUpdate);
          setLevelData((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              triggers: prev.triggers
                ? prev.triggers.map((t: any) => {
                    if (triggersNeedingFiredSet.has(t)) {
                      return { ...t, fired: true };
                    }
                    return t;
                  })
                : undefined,
            };
          });
        }
      }
    },
    [setLevelData],
  );

  useEffect(() => {
    const parseTimeToMs = (val: any): number => {
      if (val === undefined || val === null || val === "") return 0;
      const num = Number(val);
      if (isNaN(num)) return 0;
      return num > 100 ? num : num * 1000;
    };

    const interval = setInterval(() => {
      if (isPausedRef?.current) return;

      const timerTriggers = triggerIndicesRef.current.triggersByType.get('ON_TIMER');
      if (!timerTriggers || timerTriggers.length === 0) {
        if (Object.keys(timerStatesRef.current).length > 0) {
          timerStatesRef.current = {};
        }
        return;
      }

      // Clean up stale timers
      for (const id in timerStatesRef.current) {
        let exists = false;
        for (let i = 0; i < timerTriggers.length; i++) {
          if (timerTriggers[i].id === id && !timerTriggers[i].disabled) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          delete timerStatesRef.current[id];
        }
      }

      for (let i = 0; i < timerTriggers.length; i++) {
        const t = timerTriggers[i];
        if (t.disabled || (t.fired && t.runOnce !== false)) continue;

        if (!timerStatesRef.current[t.id]) {
          const intervalVal = t.params?.interval ?? t.interval;
          const minVal = t.params?.minInterval ?? t.minInterval;
          const maxVal = t.params?.maxInterval ?? t.maxInterval;

          let targetMs = 5000;
          if (minVal !== undefined && maxVal !== undefined) {
            const minMs = parseTimeToMs(minVal);
            const maxMs = parseTimeToMs(maxVal);
            targetMs = minMs + Math.random() * (maxMs - minMs);
          } else if (intervalVal !== undefined) {
            targetMs = parseTimeToMs(intervalVal);
          }

          timerStatesRef.current[t.id] = { targetMs, elapsedMs: 0 };
        }

        const state = timerStatesRef.current[t.id];
        state.elapsedMs += 100;

        if (state.elapsedMs >= state.targetMs) {
          state.elapsedMs = 0;
          const minVal = t.params?.minInterval ?? t.minInterval;
          const maxVal = t.params?.maxInterval ?? t.maxInterval;
          if (minVal !== undefined && maxVal !== undefined) {
            const minMs = parseTimeToMs(minVal);
            const maxMs = parseTimeToMs(maxVal);
            state.targetMs = minMs + Math.random() * (maxMs - minMs);
          }
          checkTriggers('ON_TIMER', { triggerId: t.id });
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [checkTriggers, isPausedRef]);

  const executeActions = async (triggers: any[], eventParams: any) => {
    const player = latestPlayerRef.current;
    const onRadioTrigger = latestOnRadioTriggerRef.current;
    const startDialogue = latestStartDialogueRef.current;
    for (const t of triggers) {
      // Legacy support
      if (!t.type && t.dialogueId) {
        let isRadio = false;
        if (t.requiredItemType === "RADIO") {
          isRadio = true;
          const radioItem = player.inventory.find(
            (i: any) => i.type === "RADIO",
          );
          if (radioItem && onRadioTrigger) {
            await onRadioTrigger(radioItem);
          }
        }
        if (startDialogue) {
          startDialogue(t.dialogueId, t.voice, undefined, isRadio);
        }
        continue;
      }

      if (!t.actions) continue;

      if (t.sequentialActions) {
        for (let i = 0; i < t.actions.length; i++) {
          const action = t.actions[i];
          const hasMoreCinematic = t.actions.slice(i + 1).some((act: any) => act.type === "CINEMATIC_STATIC_CAMERA" || act.type === "CINEMATIC_CAMERA");
          await runAction(action, hasMoreCinematic, true);
        }
      } else {
        for (const action of t.actions) {
          runAction(action, false, false);
        }
      }
    }
  };

  const runAction = async (action: ScriptAction, keepCinematic?: boolean, isSequential?: boolean): Promise<void> => {
    const { type, params } = action;
    const player = latestPlayerRef.current;
    const levelData = latestLevelDataRef.current;
    const playSound = latestPlaySoundRef.current;
    const onRadioTrigger = latestOnRadioTriggerRef.current;
    const startDialogue = latestStartDialogueRef.current;
    const showToast = latestShowToastRef.current;
    const strings = latestStringsRef.current;
    const localize = latestLocalizeRef.current;
    const showTutorial = latestShowTutorialRef.current;
    const setGameState = latestSetGameStateRef.current;
    const triggerScreenShake = latestTriggerScreenShakeRef.current;
    const setScriptedDeathProgress = latestSetScriptedDeathProgressRef.current;
    const handleExplosion = latestHandleExplosionRef.current;
    const setScreamer = latestSetScreamerRef.current;
    const setCinematicMode = latestSetCinematicModeRef.current;
    const setCinematicCamera = latestSetCinematicCameraRef.current;

    switch (type) {
      case "GAME_OVER": {
        if (latestSetGameOverTypeRef.current) {
          latestSetGameOverTypeRef.current("script");
        }
        if (setGameState) {
          setGameState(GameState.GAME_OVER);
        }
        break;
      }
      case "PLAYER_FALL": {
        if (setGameState) {
          setGameState("FALLING");
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        break;
      }
      case "PLAYER_DEATH": {
        if (setScriptedDeathProgress) {
          if (setCinematicMode) {
            setCinematicMode(true);
          }

          const deathSound =
            player.characterId === "female" && player.sounds?.deathFemale
              ? player.sounds.deathFemale
              : player.sounds?.death;
          if (deathSound && playSound) {
            playSound(deathSound);
          }

          const startTime = performance.now();
          const durationClose = 2000;
          let bodyHitPlayed = false;

          await new Promise<void>((resolve) => {
            const animate = (time: number) => {
              const elapsed = time - startTime;
              const progress = Math.min(1, elapsed / durationClose);

              if (progress >= 0.2 && !bodyHitPlayed) {
                bodyHitPlayed = true;
                if (player.sounds?.bodyHit && playSound) {
                  playSound(player.sounds.bodyHit);
                }
                if (triggerScreenShake) {
                  triggerScreenShake(false, [200, 100, 200], 0.5, 400);
                }
              }

              setScriptedDeathProgress(progress);

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                resolve();
              }
            };
            requestAnimationFrame(animate);
          });

          await new Promise((resolve) => setTimeout(resolve, 1500));

          if (
            params &&
            params.wakeUpX !== undefined &&
            params.wakeUpY !== undefined
          ) {
            setPlayer((prev: any) => {
              const destDir =
                params.wakeUpDir !== undefined
                  ? Number(params.wakeUpDir)
                  : prev.dir;
              return {
                ...prev,
                pos: { x: Number(params.wakeUpX), y: Number(params.wakeUpY) },
                dir: destDir,
                dir360: destDir,
              };
            });
          }

          const startTimeOpen = performance.now();
          const durationOpen = 1500;

          await new Promise<void>((resolve) => {
            const animate = (time: number) => {
              const elapsed = time - startTimeOpen;
              const progress = Math.min(1, elapsed / durationOpen);
              setScriptedDeathProgress(1 - progress);

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                resolve();
              }
            };
            requestAnimationFrame(animate);
          });

          setScriptedDeathProgress(0);

          if (setCinematicMode) {
            setCinematicMode(false);
          }
        }
        break;
      }
      case "DELAY":
        if (params && params.time) {
          let timeLeft = params.time;
          while (timeLeft > 0) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (!isPausedRef?.current) {
              timeLeft -= 50;
            }
          }
        }
        break;
      case "MUSIC_PLAYER": {
        if (!params) break;
        const musicAction = params.musicAction || "CHANGE";
        const trackId = params.trackId;
        const isCrossfade = params.crossfade !== false;
        const fadeDuration = (params.fadeDuration !== undefined && params.fadeDuration !== null && params.fadeDuration !== "") ? Number(params.fadeDuration) : 2.0;

        const actualFadeDuration = isCrossfade ? fadeDuration : 0;

        if (musicAction === "CHANGE" && trackId) {
          if (latestPlayMusicRef.current) {
            latestPlayMusicRef.current(trackId, {
              fadeOutDuration: actualFadeDuration,
              fadeInDuration: actualFadeDuration,
              forceRestart: params.forceRestart || false,
            });
          }
        } else if (musicAction === "PAUSE") {
          if (latestPauseMusicRef.current) {
            latestPauseMusicRef.current({ fadeOutDuration: actualFadeDuration });
          }
        } else if (musicAction === "RESUME") {
          if (latestResumeMusicRef.current) {
            latestResumeMusicRef.current({ fadeInDuration: actualFadeDuration });
          }
        } else if (musicAction === "STOP") {
          if (latestStopMusicRef.current) {
            latestStopMusicRef.current({ fadeOutDuration: actualFadeDuration });
          }
        }
        break;
      }
      case "MOVE_TO": {
        const startX = Number(params.startX);
        const startY = Number(params.startY);
        const targetX = Number(params.targetX);
        const targetY = Number(params.targetY);

        if (isNaN(startX) || isNaN(startY) || isNaN(targetX) || isNaN(targetY)) {
          break;
        }

        // Find the enemy/NPC currently at (startX, startY)
        let targetEnemyId: string | null = null;
        let targetEnemy: any = null;
        for (const [id, e] of latestEnemiesRef.current.entries()) {
          if (e.x === startX && e.y === startY) {
            targetEnemyId = id;
            targetEnemy = e;
            break;
          }
        }

        if (!targetEnemyId || !targetEnemy) {
          const grid = latestLevelDataRef.current?.grid;
          if (grid && grid[startY]?.[startX]?.enemyId) {
            targetEnemyId = grid[startY][startX].enemyId;
            targetEnemy = latestEnemiesRef.current.get(targetEnemyId);
          }
        }

        if (!targetEnemyId || !targetEnemy) {
          break;
        }

        // Calculate path
        let path: { x: number; y: number }[] = [];
        const grid = latestLevelDataRef.current?.grid;
        const width = latestLevelDataRef.current?.width || 0;
        const height = latestLevelDataRef.current?.height || 0;
        if (grid) {
          path = findPath(startX, startY, targetX, targetY, grid, width, height);
        }

        // Set state to SCRIPT_MOVE
        setEnemies((prev: Map<string, any>) => {
          const next = new Map(prev);
          const e = next.get(targetEnemyId!);
          if (e) {
            next.set(targetEnemyId!, {
              ...e,
              aiState: "SCRIPT_MOVE",
              originalAiState: e.originalAiState || e.aiState,
              originalMovementType: e.originalMovementType || e.movementType,
              originalHomePos: e.originalHomePos || e.homePos || { x: e.x, y: e.y },
              targetPos: { x: targetX, y: targetY },
              currentPath: path,
            });
          }
          return next;
        });

        if (isSequential) {
          let hasTransitionedToScriptMove = false;
          let checkCount = 0;
          while (true) {
            checkCount++;
            const currentEnemy = latestEnemiesRef.current.get(targetEnemyId);
            if (!currentEnemy) {
              break;
            }
            if (currentEnemy.aiState === "SCRIPT_MOVE") {
              hasTransitionedToScriptMove = true;
            }
            if (currentEnemy.x === targetX && currentEnemy.y === targetY) {
              break;
            }
            if (hasTransitionedToScriptMove && currentEnemy.aiState !== "SCRIPT_MOVE") {
              break;
            }
            // Safe fallback if React state never updates to SCRIPT_MOVE after 2 seconds
            if (!hasTransitionedToScriptMove && checkCount > 20) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        break;
      }
      case "RESET_SPAWN": {
        const spawnX = Number(params.x);
        const spawnY = Number(params.y);

        if (isNaN(spawnX) || isNaN(spawnY)) break;

        // 1. Check for Enemy or NPC associated with spawn point (spawnX, spawnY)
        let foundEnemyId: string | null = null;
        let foundEnemy: any = null;

        for (const [id, e] of latestEnemiesRef.current.entries()) {
          const hx = e.originalHomePos?.x ?? e.homePos?.x;
          const hy = e.originalHomePos?.y ?? e.homePos?.y;
          if ((hx === spawnX && hy === spawnY) || (e.x === spawnX && e.y === spawnY)) {
            foundEnemyId = id;
            foundEnemy = e;
            break;
          }
        }

        if (!foundEnemyId && latestLevelDataRef.current?.grid) {
          const grid = latestLevelDataRef.current.grid;
          if (grid[spawnY]?.[spawnX]?.enemyId) {
            foundEnemyId = grid[spawnY][spawnX].enemyId;
            foundEnemy = latestEnemiesRef.current.get(foundEnemyId);
          }
        }

        if (foundEnemyId && foundEnemy) {
          // Reset enemy/NPC position and AI state
          setEnemies((prev: Map<string, any>) => {
            const next = new Map(prev);
            const e = next.get(foundEnemyId!);
            if (e) {
              const resetAiState = e.originalAiState || (e.isNPC ? "IDLE" : "PATROL");
              next.set(foundEnemyId!, {
                ...e,
                x: spawnX,
                y: spawnY,
                homePos: { x: spawnX, y: spawnY },
                aiState: resetAiState,
                targetPos: undefined,
                currentPath: [],
              });
            }
            return next;
          });

          // Clear enemy from all previous grid tiles and place on spawn point
          setLevelData((prev: any) => {
            if (!prev || !prev.grid) return prev;
            const newGrid = prev.grid.map((row: any) => [...row]);

            for (let y = 0; y < prev.height; y++) {
              for (let x = 0; x < prev.width; x++) {
                if (newGrid[y]?.[x]?.enemyId === foundEnemyId) {
                  const tile = { ...newGrid[y][x] };
                  delete tile.enemyId;
                  newGrid[y][x] = tile;
                }
              }
            }

            if (newGrid[spawnY]?.[spawnX]) {
              newGrid[spawnY][spawnX] = {
                ...newGrid[spawnY][spawnX],
                enemyId: foundEnemyId,
              };
            }

            return { ...prev, grid: newGrid };
          });

          if (typeof window !== 'undefined' && (window as any).enemyPositionsCache) {
            (window as any).enemyPositionsCache.set(foundEnemyId, { x: spawnX, y: spawnY });
          }

          break;
        }

        // 2. Check for Decoration associated with spawn point (spawnX, spawnY)
        setLevelData((prev: any) => {
          if (!prev || !prev.grid) return prev;

          let targetDeco: any = null;

          for (let y = 0; y < prev.height; y++) {
            for (let x = 0; x < prev.width; x++) {
              const dec = prev.grid[y]?.[x]?.decoration;
              if (dec) {
                const ox = dec.originalX ?? dec.homePos?.x;
                const oy = dec.originalY ?? dec.homePos?.y;
                if ((ox === spawnX && oy === spawnY) || (x === spawnX && y === spawnY)) {
                  targetDeco = dec;
                  break;
                }
              }
            }
            if (targetDeco) break;
          }

          if (!targetDeco) return prev;

          const newGrid = prev.grid.map((row: any) => [...row]);

          for (let y = 0; y < prev.height; y++) {
            for (let x = 0; x < prev.width; x++) {
              const dec = newGrid[y]?.[x]?.decoration;
              if (dec && dec.id === targetDeco.id) {
                const tile = { ...newGrid[y][x] };
                delete tile.decoration;
                newGrid[y][x] = tile;
              }
            }
          }

          if (newGrid[spawnY]?.[spawnX]) {
            newGrid[spawnY][spawnX] = {
              ...newGrid[spawnY][spawnX],
              decoration: {
                ...targetDeco,
                hp: targetDeco.maxHp ?? targetDeco.hp,
              },
            };
          }

          return { ...prev, grid: newGrid };
        });

        break;
      }
      case "PLAY_SOUND":
        const soundPos =
          params.x !== undefined && params.y !== undefined
            ? { x: params.x, y: params.y }
            : undefined;
        playSound(params.soundId, soundPos, undefined, 0, undefined);
        break;
      case "SHOW_DIALOGUE": {
        const isRadio = params.isRadio || false;
        if (isRadio && onRadioTrigger) {
          const radioItem = player.inventory.find(
            (i: any) => i.type === "RADIO",
          );
          if (radioItem) {
            await onRadioTrigger(radioItem);
          }
        }
        startDialogue(params.dialogueId, params.voice, undefined, isRadio);
        break;
      }
      case "SHOW_TUTORIAL": {
        if (showTutorial) {
          await showTutorial(params);
        }
        break;
      }
      case "ADD_LOG":
        let text = strings?.logs?.[params.messageKey] || params.messageKey;
        text = localize(text);
        addLog(text, "INFO");
        if (params.toast) showToast(text);
        break;
      case "DOOR_STATE_CHANGE": {
        const x = Number(params.x);
        const y = Number(params.y);
        const targetState = params.state; // 'OPEN' or 'CLOSED'
        
        if (levelData?.grid?.[y]?.[x]?.type === 'DOOR' && levelData.grid[y][x].door) {
          const currentDoor = levelData.grid[y][x].door;
          let nextState: 'OPENING' | 'CLOSING' | null = null;
          let soundToPlay: string | undefined = undefined;

          if (targetState === 'OPEN') {
            if (currentDoor.state === 'CLOSED' || currentDoor.state === 'CLOSING') {
              nextState = 'OPENING';
              soundToPlay = currentDoor.openSound;
            }
          } else if (targetState === 'CLOSED') {
            if (currentDoor.state === 'OPEN' || currentDoor.state === 'OPENING') {
              nextState = 'CLOSING';
              soundToPlay = currentDoor.closeSound;
            }
          }

          if (nextState) {
            if (soundToPlay && playSound) {
              playSound(soundToPlay, { x, y });
            }

            setLevelData((prev: any) => {
              if (!prev || !prev.grid) return prev;
              const newGrid = prev.grid.map((row: any) => [...row]);
              if (newGrid[y]?.[x]?.door) {
                newGrid[y][x] = {
                  ...newGrid[y][x],
                  door: {
                    ...newGrid[y][x].door,
                    state: nextState!,
                  }
                };
              }
              return { ...prev, grid: newGrid };
            });
          }
        }
        break;
      }
      case "CHANGE_TILE": // tile change marker
        setLevelData((prev: any) => {
          if (!prev || !prev.grid) return prev;
          const newGrid = [...prev.grid];
          const x = params.x;
          const y = params.y;
          if (newGrid[y]?.[x]) {
            newGrid[y] = [...newGrid[y]];
            const originalTile = newGrid[y][x];
            let baseTile: any = {
              x,
              y,
              isExplored: originalTile.isExplored,
              description: originalTile.description,
              items: originalTile.items || [],
              enemyId: originalTile.enemyId,
              corpses: originalTile.corpses,
            };

            if (params.tileSourceType === "construction") {
              const block = (prev.construction || []).find(
                (c: any) => c.symbol === params.tileSourceId
              );
              if (block) {
                let tileType: "FLOOR" | "WALL" = "FLOOR";
                let isWindow = false;
                if (block.type === "wall" || block.type === "window") {
                  tileType = "WALL";
                  if (block.type === "window") isWindow = true;
                }

                baseTile = {
                  ...baseTile,
                  type: tileType,
                  isWindow,
                  assetId: block.assetId,
                  floorAssetId: block.floorAssetId,
                  isWater: block.isWater,
                  footstepSound: block.footstepSound,
                  bottomTextureId: block.bottomTextureId,
                  topTextureId: block.topTextureId,
                  topTextureRotation: block.topTextureRotation,
                  mirror: block.mirror,
                  maskId: block.maskId,
                  maskTargetAsset: block.maskTargetAsset,
                  mirrorOpacity: block.mirrorOpacity,
                  canBeDestroyed: block.canBeDestroyed !== false,
                  blocking: block.blocking,
                  faces: block.faces,
                  keylock: block.keylock,
                  keypadDirection: block.keypadDirection,
                  keypadAssetId: block.keypadAssetId,
                  keypadMaskAssetId: block.keypadMaskAssetId,
                  keypadSound: block.keypadSound,
                  keypadSuccessSound: block.keypadSuccessSound,
                  keypadFailSound: block.keypadFailSound,
                  targetId: block.targetId,
                  password: block.password ? String(block.password) : undefined,
                  height: block.height,
                  glassAssetId: block.glassAssetId,
                  glassTransparency: block.glassTransparency,
                  glassOffset: block.glassOffset,
                  glassBreakSound: block.glassBreakSound,
                  thickness: block.thickness,
                  offset: block.offset,
                  cutoutAxis: block.cutoutAxis,
                  cutout: block.cutout,
                  door: undefined,
                  portal: undefined,
                };
              } else {
                baseTile = {
                  ...originalTile,
                  type: params.newType || originalTile.type,
                  assetId: params.newAssetId || originalTile.assetId,
                  door: undefined,
                };
              }
            } else if (params.tileSourceType === "door") {
              const def = prev.doorDefinitions?.[params.tileSourceId];
              if (def) {
                baseTile = {
                  ...baseTile,
                  type: "DOOR",
                  door: {
                    id: def.id || Math.random().toString(36).substring(2, 9),
                    type: def.type,
                    dir: def.dir,
                    edge: def.edge,
                    state: def.isOpenedAtStart ? "OPEN" : "CLOSED",
                    openAmount: def.isOpenedAtStart
                      ? (def.type === "SLIDE" || def.type === "LIFT"
                        ? 0.85
                        : 1.0)
                      : 0.0,
                    keyId: def.keyId,
                    textureId: def.textureId,
                    maskId: def.maskId,
                    isLocked: def.isLocked,
                    closed: def.closed,
                    openSound: def.openSound,
                    closeSound: def.closeSound,
                    isOpenedAtStart: def.isOpenedAtStart,
                    nonInteractable: def.nonInteractable,
                  },
                  portal: undefined,
                };
              } else {
                baseTile = {
                  ...originalTile,
                  type: "DOOR",
                  door: {
                    id:
                      params.newAssetId ||
                      Math.random().toString(36).substring(2, 9),
                    type: "HINGE",
                    state: "CLOSED",
                    openAmount: 0.0,
                  },
                  portal: undefined,
                };
              }
            } else {
              baseTile = {
                ...originalTile,
                type: params.newType || originalTile.type,
                assetId: params.newAssetId || originalTile.assetId,
              };
              if (params.isLocked !== undefined && baseTile.door) {
                baseTile.door = { ...baseTile.door, isLocked: params.isLocked };
              }
              if (params.closed !== undefined && baseTile.door) {
                baseTile.door = { ...baseTile.door, closed: params.closed };
              }
              if (params.newType === "DOOR" && params.doorConfig) {
                baseTile.door = {
                  ...baseTile.door,
                  ...params.doorConfig,
                };
              }
            }

            newGrid[y][x] = baseTile;
          }
          return { ...prev, grid: newGrid };
        });
        break;
      case "SPAWN_ENEMY":
      case "SPAWN_NPC":
      case "SPAWN_ITEM":
      case "SPAWN_DECORATION":
      case "SPAWN_ENTITY": {
        const entityType = params.entityType || (action.type === 'SPAWN_ENEMY' ? 'ENEMY' : action.type === 'SPAWN_ITEM' ? 'ITEM' : action.type === 'SPAWN_NPC' ? 'NPC' : action.type === 'SPAWN_DECORATION' ? 'DECORATION' : undefined);
        const definitionId = params.definitionId || params.entityId || params.enemyId || params.npcId || params.itemId || params.decorationId;

        if (
          params.x === undefined ||
          params.y === undefined ||
          !entityType ||
          !definitionId
        )
          break;
        const { x, y } = params;

        if (entityType === "EXPLOSION") {
          if (handleExplosion) {
            const damageDice = params.damageDice || params.damage || "2d6";
            const range = params.range ?? 2;
            const assetId = params.assetId || "ANIM_EXPLOSION";
            const soundId = params.soundId || "EXPLOSION";
            const levelGrid = levelData ? levelData.grid : undefined;
            handleExplosion(
              x,
              y,
              damageDice,
              range,
              assetId,
              undefined,
              undefined,
              levelGrid,
              undefined,
              soundId,
              params.itemType,
              params.itemDuration
            );
          }
          break;
        }

        setLevelData((prev: any) => {
          const next = { ...prev };
          const newGrid = [...(next.grid || [])];

          if (entityType === "AMBIENT_SOUND") {
            const def =
              prev.ambientSounds?.find((s: any) => s.symbol === definitionId) ||
              {};
            next.ambientSounds = [
              ...(next.ambientSounds || []),
              {
                id:
                  def.id ||
                  params.soundId ||
                  Math.random().toString(36).substring(2, 9),
                x,
                y,
                symbol: definitionId,
                minInterval: def.minInterval ?? params.minInterval ?? 5000,
                maxInterval: def.maxInterval ?? params.maxInterval ?? 15000,
                volume: def.volume ?? params.volume ?? 0.5,
                radius: def.radius ?? params.radius ?? 10,
              },
            ];
            return next;
          }

          if (entityType === "PARTICLE_EMITTER") {
            next.particles = [
              ...(next.particles || []),
              {
                id:
                  params.emitterId ||
                  Math.random().toString(36).substring(2, 9),
                definitionId,
                x,
                y,
                z: params.zOffset,
              },
            ];
            return next;
          }

          if (!newGrid[y] || !newGrid[y][x]) return prev;
          newGrid[y] = [...newGrid[y]];
          const tile = { ...newGrid[y][x] };

          if (entityType === "LIGHT") {
            const def =
              prev.baseLightInfo?.lightDefinitions?.[definitionId] || {};
            tile.light = {
              r: def.r ?? params.r ?? 255,
              g: def.g ?? params.g ?? 255,
              b: def.b ?? params.b ?? 255,
              intensity: def.intensity ?? params.intensity ?? 1.5,
              range: def.range ?? params.range ?? 4,
              mode: def.mode ?? params.mode ?? "STATIC",
            };
          } else if (entityType === "ITEM") {
            const levelItem = levelData && levelData.itemsPalette ? levelData.itemsPalette.find((i: any) => i.id === definitionId || i.symbol === definitionId) : null;
            const realDbId = levelItem?.id || definitionId;
            const dbTemplate = (itemsDb as any)[realDbId] || (itemsDb as any)[definitionId] || {};
            const template = { ...dbTemplate, ...levelItem };
            if (latestSpriteMapRef.current) {
              ensureEntityAssetsLoaded(template, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
            }
            const items = [...(tile.items || [])];
            const amount = params.amount || 1;
            for (let i = 0; i < amount; i++) {
              items.push({
                ...template,
                ...params.itemOverrides,
                id: Math.random().toString(36).substring(2, 9),
                definitionId: realDbId || definitionId,
                name: localize(params.name || template.name || dbTemplate.name || ""),
                description: localize(params.description || template.description || dbTemplate.description || ""),
                rawName: template.name || dbTemplate.name,
                rawDescription: template.description || dbTemplate.description,
                durability: template.maxDurability || dbTemplate.maxDurability,
                handAssetId: template.handAsset || dbTemplate.handAsset,
                handFemaleAssetId: template.handFemaleAsset || dbTemplate.handFemaleAsset,
                attackAssetId: template.attackAsset || dbTemplate.attackAsset,
                attackFemaleAssetId: template.attackAssetFemale || dbTemplate.attackAssetFemale,
              });
            }
            tile.items = items;
          } else if (entityType === "DECORATION") {
            const levelDec = levelData && levelData.decorationsPalette ? levelData.decorationsPalette.find((d: any) => d.id === definitionId || d.symbol === definitionId) : null;
            const realDbId = levelDec?.id || definitionId;
            const dbTemplate = (decorationsDb as any)[realDbId] || (decorationsDb as any)[definitionId] || {};
            const template = { ...dbTemplate, ...levelDec };
            if (latestSpriteMapRef.current) {
              ensureEntityAssetsLoaded(template, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
            }
            const newDecor = {
              ...dbTemplate,
              ...levelDec,
              ...template,
              ...params.decorationOverrides,
              id: Math.random().toString(36).substring(2, 9),
              definitionId: realDbId || definitionId,
              name: localize(params.name || template.name || dbTemplate.name || "Decoration"),
              description: localize(
                params.description || template.description || dbTemplate.description || "",
              ),
            };
            const currentDecs = tile.decorations && tile.decorations.length > 0 ? tile.decorations : (tile.decoration ? [tile.decoration] : []);
            tile.decorations = [...currentDecs, newDecor];
            tile.decoration = tile.decorations[0];
          } else if (entityType === "NPC" || entityType === "ENEMY") {
            const db = entityType === "NPC" ? npcsDb : enemiesDb;
            const paletteList = entityType === "NPC" ? levelData?.npcsPalette : levelData?.enemiesPalette;
            const levelEnt = paletteList ? paletteList.find((e: any) => e.id === definitionId || e.symbol === definitionId) : null;
            const realDbId = levelEnt?.id || definitionId;
            const dbTemplate = (db as any)[realDbId] || (db as any)[definitionId] || {};
            const template = { ...dbTemplate, ...levelEnt };
            if (latestSpriteMapRef.current) {
              ensureEntityAssetsLoaded(template, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
            }
            const eId = params.entityId || Math.random().toString(36).substring(2, 9);

            const rawAssets = { ...dbTemplate.assets, ...levelEnt?.assets, ...template.assets, ...params.entityOverrides?.assets };
            const parseAssetEntry = (raw: any, defaultScale: number = 1.0) => {
              if (!raw) return undefined;
              if (typeof raw === 'string') return { assetId: raw, scale: defaultScale };
              if (typeof raw === 'object' && raw.assetId) return { assetId: raw.assetId, scale: raw.scale ?? defaultScale };
              return undefined;
            };

            const mapAsset = parseAssetEntry(rawAssets.map, template.scale || dbTemplate.scale || 1.0);
            const deadAsset = parseAssetEntry(rawAssets.dead, template.deadScale || template.corpseScale || dbTemplate.deadScale || 0.32);
            const portraitAsset = parseAssetEntry(rawAssets.portrait, 1.0);
            const dialoguePortraitAsset = parseAssetEntry(rawAssets.dialogue_portrait, 1.0);
            const attackAsset = parseAssetEntry(rawAssets.attack, 1.0);
            const distanceAttackAsset = parseAssetEntry(rawAssets.distanceAttack, 1.0);
            const handsUpAsset = parseAssetEntry(rawAssets.hands_up, template.scale || dbTemplate.scale || 1.0);

            const assets = {
              ...rawAssets,
              ...(mapAsset ? { map: mapAsset } : {}),
              ...(deadAsset ? { dead: deadAsset } : {}),
              ...(portraitAsset ? { portrait: portraitAsset } : {}),
              ...(dialoguePortraitAsset ? { dialogue_portrait: dialoguePortraitAsset } : {}),
              ...(attackAsset ? { attack: attackAsset } : {}),
              ...(distanceAttackAsset ? { distanceAttack: distanceAttackAsset } : {}),
              ...(handsUpAsset ? { hands_up: handsUpAsset } : {}),
              ...(rawAssets.gibMask ? { gibMask: rawAssets.gibMask } : {}),
            };

            const newEntity = {
              ...dbTemplate,
              ...levelEnt,
              ...template,
              ...params.entityOverrides,
              id: eId,
              definitionId: realDbId || template.id || definitionId,
              x,
              y,
              homePos: { x, y },
              originPos: { x, y },
              isNPC: entityType === "NPC",
              hp: params.hp ?? params.entityOverrides?.hp ?? template.hp ?? dbTemplate.hp ?? 100,
              maxHp: params.maxHp ?? params.entityOverrides?.maxHp ?? template.maxHp ?? template.hp ?? dbTemplate.maxHp ?? dbTemplate.hp ?? 100,
              damageDice: template.damageDice || dbTemplate.damageDice || (entityType === "NPC" ? "0d0" : "1d6"),
              accuracy: template.accuracy ?? dbTemplate.accuracy ?? (entityType === "NPC" ? 0 : 50),
              attackRange: template.attackRange ?? dbTemplate.attackRange ?? (entityType === "NPC" ? 0 : 1),
              baseXP: template.baseXP ?? dbTemplate.baseXP ?? (entityType === "NPC" ? 0 : 10),
              muzzleFlash: template.muzzleFlash ?? dbTemplate.muzzleFlash,
              casing: template.casing || dbTemplate.casing,
              gibCounts: template.gibCounts || dbTemplate.gibCounts,
              sounds: template.sounds || dbTemplate.sounds,
              loot: template.loot || dbTemplate.loot,
              onHitEffect: template.onHitEffect || dbTemplate.onHitEffect,
              movementType: template.movementType || dbTemplate.movementType || 'patroling',
              patrolRange: template.patrolRange ?? dbTemplate.patrolRange ?? (entityType === "NPC" ? (template.roamRadius || 0) : 3),
              speed: template.speed ?? dbTemplate.speed ?? 1,
              armor: template.armor ?? dbTemplate.armor,
              canBeKilled: params.entityOverrides?.canBeKilled ?? template.canBeKilled ?? dbTemplate.canBeKilled ?? true,
              canBeInspected: params.entityOverrides?.canBeInspected ?? template.canBeInspected ?? dbTemplate.canBeInspected ?? true,
              canOpenDoors: template.canOpenDoors ?? dbTemplate.canOpenDoors ?? false,
              noShadow: template.noShadow ?? dbTemplate.noShadow,
              talkRange: template.talkRange ?? dbTemplate.talkRange ?? 1,
              dialogueId: template.dialogueId || dbTemplate.dialogueId,
              voice: template.voice || dbTemplate.voice,
              tradeItems: template.tradeItems || dbTemplate.tradeItems,
              keepPrice: template.keepPrice || dbTemplate.keepPrice,
              name: localize(params.name || params.entityOverrides?.name || template.name || dbTemplate.name || "Entity"),
              description: localize(params.description || params.entityOverrides?.description || template.description || dbTemplate.description || ""),
              rawName: template.name || dbTemplate.name,
              rawDescription: template.description || dbTemplate.description,
              aiState: params.aiState || (entityType === "NPC" ? "IDLE" : "PATROL"),
              assets: {
                ...assets,
                ...(params.entityOverrides?.assets || {}),
              },
            };

            setEnemies((prevEnemies: any) => {
              const nextEnemies = new Map(prevEnemies);
              nextEnemies.set(eId, newEntity);
              if (typeof window !== 'undefined' && (window as any).enemyPositionsCache) {
                (window as any).enemyPositionsCache.set(eId, { x, y });
              }
              return nextEnemies;
            });

            if (latestSpriteMapRef.current && mapAsset?.assetId) {
              const spriteImg = latestSpriteMapRef.current.get(mapAsset.assetId);
              if (spriteImg) {
                latestSpriteMapRef.current.set(eId, spriteImg);
              }
            }

            tile.enemyId = eId;
          }

          newGrid[y][x] = tile;
          next.grid = newGrid;
          return next;
        });
        break;
      }
      case "REMOVE_ENTITY": {
        if (
          params.x === undefined ||
          params.y === undefined ||
          !params.entityType
        )
          break;
        const { x, y, entityType } = params;

        setLevelData((prev: any) => {
          const next = { ...prev };

          if (entityType === "AMBIENT_SOUND") {
            if (next.ambientSounds) {
              next.ambientSounds = next.ambientSounds.filter(
                (s: any) => s.x !== x || s.y !== y,
              );
            }
            return next;
          }

          if (entityType === "PARTICLE_EMITTER") {
            if (next.particles) {
              if (params.definitionId) {
                next.particles = next.particles.filter(
                  (p: any) =>
                    p.x !== x ||
                    p.y !== y ||
                    p.definitionId !== params.definitionId,
                );
              } else {
                next.particles = next.particles.filter(
                  (p: any) => p.x !== x || p.y !== y,
                );
              }
            }
            return next;
          }

          const newGrid = [...(next.grid || [])];
          if (!newGrid[y] || !newGrid[y][x]) return prev;

          newGrid[y] = [...newGrid[y]];
          const tile = { ...newGrid[y][x] };

          if (entityType === "LIGHT") {
            delete tile.light;
          } else if (entityType === "ITEM") {
            if (params.definitionId) {
              tile.items = (tile.items || []).filter(
                (i: any) => i.definitionId !== params.definitionId,
              );
            } else {
              tile.items = [];
            }
          } else if (entityType === "DECORATION") {
            if (params.definitionId) {
              const currentDecs = tile.decorations && tile.decorations.length > 0 ? tile.decorations : (tile.decoration ? [tile.decoration] : []);
              const newDecs = currentDecs.filter((d: any) => d.id !== params.definitionId && d.type !== params.definitionId);
              tile.decorations = newDecs.length > 0 ? newDecs : undefined;
              tile.decoration = newDecs.length > 0 ? newDecs[0] : undefined;
            } else {
              delete tile.decorations;
              delete tile.decoration;
            }
          } else if (entityType === "NPC" || entityType === "ENEMY") {
            if (tile.enemyId) {
              setEnemies((prevEnemies: any) => {
                const nextE = new Map<string, any>(prevEnemies);
                // Optional check if it's strictly an NPC or Enemy based on our knowledge.
                // Usually we can just remove whatever is at the tile if it matches
                if (params.definitionId) {
                  const e = nextE.get(tile.enemyId);
                  if (e && e.definitionId === params.definitionId) {
                    nextE.delete(tile.enemyId);
                    if (typeof window !== 'undefined' && (window as any).enemyPositionsCache) {
                      (window as any).enemyPositionsCache.delete(tile.enemyId);
                    }
                  }
                } else {
                  nextE.delete(tile.enemyId);
                  if (typeof window !== 'undefined' && (window as any).enemyPositionsCache) {
                    (window as any).enemyPositionsCache.delete(tile.enemyId);
                  }
                }
                return nextE;
              });
              // If no definitionId specified, or we need to we check if we successfully deleted it ...
              // Being simple, we'll just clear tile.enemyId. If the definitionId doesn't match, we might clear it incorrectly, so let's refine.
              if (!params.definitionId) {
                delete tile.enemyId;
              } else {
                // Wait, the tile update executes sync within the setLevelData callback, but we can't easily read `enemies` here safely without a ref or capturing.
                // Actually we can just assume if `definitionId` is matching, we clear it. Let's just clear it anyway or skip the check.
                delete tile.enemyId;
              }
            }
          }

          newGrid[y][x] = tile;
          next.grid = newGrid;
          return next;
        });
        break;
      }
      case "GIVE_ITEM": {
        const defId = params.itemDefinitionId || params.itemId;
        const levelItem = levelData && levelData.itemsPalette ? levelData.itemsPalette.find((i: any) => i.id === defId || i.symbol === defId) : null;
        const itemTemplate = levelItem || (itemsDb as any)[defId] || {};
        if (latestSpriteMapRef.current) {
          ensureEntityAssetsLoaded(itemTemplate, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
        }
        const count = params.count || 1;
        const spawnX = params.spawnAtX;
        const spawnY = params.spawnAtY;
        const isSpawningOnGround = spawnX !== undefined && spawnY !== undefined;

        const createItems = () => {
          const items = [];
          for (let i = 0; i < count; i++) {
            items.push({
              ...itemTemplate,
              id: `${defId}_${Math.random().toString(36).substring(2, 7)}`,
              definitionId: defId,
              name: localize(itemTemplate.name || params.itemName || defId),
              handAssetId: itemTemplate.handAsset,
              handFemaleAssetId: itemTemplate.handFemaleAsset,
              attackAssetId: itemTemplate.attackAsset,
              attackFemaleAssetId: itemTemplate.attackAssetFemale,
            });
          }
          return items;
        };

        if (isSpawningOnGround) {
          setLevelData((prev: any) => {
            if (!prev.grid || !prev.grid[spawnY] || !prev.grid[spawnY][spawnX])
              return prev;
            const newGrid = [...prev.grid];
            newGrid[spawnY] = [...newGrid[spawnY]];
            newGrid[spawnY][spawnX] = {
              ...newGrid[spawnY][spawnX],
              items: [
                ...(newGrid[spawnY][spawnX].items || []),
                ...createItems(),
              ],
            };
            return { ...prev, grid: newGrid };
          });

          const itemName = localize(
            itemTemplate.name || params.itemName || defId,
          );
          addLog(
            `${itemName}${count > 1 ? ` x${count}` : ""} появляется здесь.`,
            "INFO",
          );
        } else {
          setPlayer((prev: any) => {
            return {
              ...prev,
              inventory: [...prev.inventory, ...createItems()],
            };
          });

          const logPrefix = strings?.logs?.item_received || "Received: ";
          const itemName = localize(
            itemTemplate.name || params.itemName || defId,
          );
          addLog(
            `${localize(logPrefix)} ${itemName}${count > 1 ? ` x${count}` : ""}`,
            "SUCCESS",
          );
        }

        if (params.toastMsg) showToast(localize(params.toastMsg));
        break;
      }
      case "SET_FLAG": {
        const flagName = params.flag;
        const flagValue = params.value;
        const currentLevelData = latestLevelDataRef.current;
        if (currentLevelData) {
          if (!currentLevelData.scriptFlags) {
            currentLevelData.scriptFlags = {};
          }
          currentLevelData.scriptFlags[flagName] = flagValue;
        }
        setLevelData((prev: any) => {
          return {
            ...prev,
            scriptFlags: {
              ...(prev.scriptFlags || {}),
              [flagName]: flagValue,
            },
          };
        });
        checkTriggers("ON_FLAG_CHANGE", { flag: flagName, value: flagValue });
        
        // Also check if any tile triggers are now unlocked for the player standing on them
        const lastPos = latestTriggerPlayerPosRef.current;
        if (lastPos) {
          checkTriggers("ON_ENTER_TILE", { x: lastPos.x, y: lastPos.y, atStart: true });
        } else {
          const freshPlayer = latestPlayerRef.current;
          if (freshPlayer) {
            checkTriggers("ON_ENTER_TILE", { x: Math.round(freshPlayer.x), y: Math.round(freshPlayer.y), atStart: true });
          }
        }
        break;
      }
      case "SET_SECTOR": {
        setLevelData((prev: any) => {
          if (!prev) return prev;
          
          let next = { ...prev };
          let changed = false;

          const mode = params.changeMode || 'all';

          // 1. Weather (none / rain / fog) and fog parameters
          if (mode === 'all' || mode === 'weather') {
            if (params.weather !== undefined) {
              next.weather = params.weather;
              changed = true;
            }
            if (params.weather === 'fog') {
              if (params.fogColor !== undefined) {
                next.fogColor = params.fogColor;
                changed = true;
              }
              if (params.fogDistance !== undefined) {
                next.fogDistance = Number(params.fogDistance);
                changed = true;
              }
            } else {
              // Reset fog params if weather is none or rain
              delete next.fogColor;
              delete next.fogDistance;
              changed = true;
            }
          }

          // 2. Skybox Texture
          if (mode === 'all' || mode === 'skybox') {
            if (params.skyboxTextureId !== undefined) {
              next.skyboxTextureId = params.skyboxTextureId;
              changed = true;

              if (latestSetSkyTextureRef.current && latestSpriteMapRef.current) {
                if (params.skyboxTextureId && params.skyboxTextureId.trim() !== "") {
                  const texKey = `TEX_${params.skyboxTextureId}`;
                  let skyTex = latestSpriteMapRef.current.get(texKey) || latestSpriteMapRef.current.get(params.skyboxTextureId);
                  const fallbackTex = latestSpriteMapRef.current.get('TEX_FALLBACK') || null;
                  latestSetSkyTextureRef.current(skyTex || fallbackTex);
                } else {
                  latestSetSkyTextureRef.current(null);
                }
              }
            }
          }

          // 3. Global Light (Lighting)
          if (mode === 'all' || mode === 'light') {
            if (params.globalLight !== undefined) {
              const nextGlobalLight = Number(params.globalLight);
              
              const baseLightInfo = prev.baseLightInfo ? {
                ...prev.baseLightInfo,
                globalLight: nextGlobalLight
              } : {
                globalLight: nextGlobalLight
              };

              next.baseLightInfo = baseLightInfo;

              // Recalculate lighting maps since we are changing global illumination
              const newLightMapRes = calculateLightMap(
                prev.grid,
                baseLightInfo.gridLight,
                baseLightInfo.globalLight,
                baseLightInfo.lightDefinitions || {},
                prev.outdoorMap,
                prev.grids
              );

              next.lightMap = newLightMapRes.baseLightMap;
              next.floorLightMaps = newLightMapRes.floorLightMaps;
              next.dynamicLights = newLightMapRes.dynamicLights;
              changed = true;
            }
          }

          return changed ? next : prev;
        });
        break;
      }
      case "REVEAL_TASK":
        setLevelData((prev: any) => {
          if (!prev || !prev.tasks) return prev;
          return {
            ...prev,
            tasks: prev.tasks
              ? prev.tasks.map((task: any) =>
                  task.id === params.taskId
                    ? { ...task, status: "ACTIVE" }
                    : task,
                )
              : undefined,
          };
        });
        break;
      case "COMPLETE_TASK":
        setLevelData((prev: any) => {
          if (!prev || !prev.tasks) return prev;
          return {
            ...prev,
            tasks: prev.tasks
              ? prev.tasks.map((task: any) =>
                  task.id === params.taskId
                    ? { ...task, status: "COMPLETED" }
                    : task,
                )
              : undefined,
          };
        });
        break;
      case "CINEMATIC_STATIC_CAMERA":
        if (setCinematicMode && setCinematicCamera) {
          await new Promise<void>((resolve) => {
            setCinematicMode(true);

            const lerpAngle = (a0: number, a1: number, t: number) => {
              const max = Math.PI * 2;
              const da = (a1 - a0) % max;
              const shortest_angle = ((2 * da) % max) - da;
              return a0 + shortest_angle * t;
            };

            const lerp = (v0: number, v1: number, t: number) => {
              return v0 + (v1 - v0) * t;
            };

            let startPos = {
              x: player.pos.x,
              y: player.pos.y,
              dir: (player.dir360 - 1) * (Math.PI / 2),
              pitch: 0,
              zoom: 1.0,
              floor: 0,
            };

            if (raycasterRef?.current?.getCameraState) {
              const camState = raycasterRef.current.getCameraState();
              startPos = {
                x: camState.x,
                y: camState.y,
                dir: camState.angle,
                pitch: camState.pitch || 0,
                zoom: camState.zoom || 1.0,
                floor: camState.floor || 0,
              };
            }

            const targetX = params.x !== undefined && params.x !== "" ? Number(params.x) : startPos.x;
            const targetY = params.y !== undefined && params.y !== "" ? Number(params.y) : startPos.y;
            
            let targetDir = startPos.dir;
            if (params.dir !== undefined && params.dir !== "" && params.dir !== "C") {
              targetDir = Number(params.dir) * (Math.PI / 180);
            }

            const targetPitch = params.pitch !== undefined && params.pitch !== "" ? Number(params.pitch) : startPos.pitch;
            const targetZoom = params.zoom !== undefined && params.zoom !== "" ? Number(params.zoom) : startPos.zoom;
            const targetFloor = params.floor !== undefined && params.floor !== "" ? Number(params.floor) : startPos.floor;
            const duration = params.duration !== undefined && params.duration !== "" ? Number(params.duration) : 3000;

            setCinematicCamera({
              x: startPos.x,
              y: startPos.y,
              dir: startPos.dir,
              pitch: startPos.pitch,
              zoom: startPos.zoom,
              floor: startPos.floor,
            });

            if (duration <= 0) {
              setCinematicCamera({
                x: targetX,
                y: targetY,
                dir: targetDir,
                pitch: targetPitch,
                zoom: targetZoom,
                floor: targetFloor,
              });
              if (!keepCinematic) {
                setCinematicMode(false);
                setCinematicCamera(null);
              }
              resolve();
            } else {
              let lastTime = performance.now();
               let accumulatedTime = 0;
              const animate = (time: number) => {
                const delta = time - lastTime;
                lastTime = time;

                if (isPausedRef?.current) {
                  requestAnimationFrame(animate);
                  return;
                }

                accumulatedTime += delta;
                let progress = accumulatedTime / duration;
                if (progress > 1) progress = 1;

                const ease =
                  progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                setCinematicCamera({
                  x: lerp(startPos.x, targetX, ease),
                  y: lerp(startPos.y, targetY, ease),
                  dir: lerpAngle(startPos.dir, targetDir, ease),
                  pitch: lerp(startPos.pitch, targetPitch, ease),
                  zoom: lerp(startPos.zoom, targetZoom, ease),
                  floor: lerp(startPos.floor, targetFloor, ease),
                });

                if (accumulatedTime < duration) {
                  requestAnimationFrame(animate);
                } else {
                  if (!keepCinematic) {
                    setCinematicMode(false);
                    setCinematicCamera(null);
                  }
                  resolve();
                }
              };
              requestAnimationFrame(animate);
            }
          });
        }
        break;
      case "SHOW_SCREAMER": {
        if (setScreamer) {
          const sId = params.soundId || params.sound || "LEVELUP";
          const imgId = params.image || "";
          const dur = params.duration || 2000;
          
          setScreamer({ image: imgId, soundId: sId, duration: dur });
          if (playSound && sId) {
            playSound(sId, undefined, undefined, 0, undefined);
          }
          await new Promise((resolve) => setTimeout(resolve, dur));
          setScreamer(null);
        }
        break;
      }
      case "CINEMATIC_CAMERA":
        if (setCinematicMode && setCinematicCamera) {
          await new Promise<void>((resolve) => {
            setCinematicMode(true);

            const parseDir = (
              d: string | number | undefined,
              defaultDir: number,
            ) => {
              if (d === "N") return -Math.PI / 2;
              if (d === "S") return Math.PI / 2;
              if (d === "E") return 0;
              if (d === "W") return Math.PI;
              if (d === "C") return defaultDir;
              if (d === undefined || d === "") return defaultDir;
              const numVal = Number(d);
              if (!isNaN(numVal)) {
                return numVal * (Math.PI / 180);
              }
              return defaultDir;
            };

            const lerpAngle = (a0: number, a1: number, t: number) => {
              const max = Math.PI * 2;
              const da = (a1 - a0) % max;
              const shortest_angle = ((2 * da) % max) - da;
              return a0 + shortest_angle * t;
            };

            // Normalize legacy params into points format
            let points = params.points;
            if (!points || !Array.isArray(points)) {
              points = [
                {
                  x: params.startX,
                  y: params.startY,
                  dir: params.startDir,
                  pitch: params.pitch,
                  zoom: params.zoom || 1.0,
                  duration: 0,
                },
                {
                  x: params.targetX,
                  y: params.targetY,
                  dir: params.targetDir,
                  pitch: params.pitch,
                  zoom: params.zoom || 1.0,
                  duration: params.duration || 2000,
                },
              ];
            }

            if (points.length === 0) {
              setCinematicMode(false);
              resolve();
              return;
            }

            const resolvePoint = (
              p: any,
              fallbackX: number,
              fallbackY: number,
              fallbackDir: number,
              fallbackPitch: number,
              fallbackZoom: number,
              fallbackFloor: number,
            ) => {
              const x = p.x !== undefined && p.x !== "" ? Number(p.x) : fallbackX;
              const y = p.y !== undefined && p.y !== "" ? Number(p.y) : fallbackY;
              const dir =
                p.dir !== undefined ? parseDir(p.dir, fallbackDir) : fallbackDir;
              const pitch =
                p.pitch !== undefined && p.pitch !== "" ? Number(p.pitch) : fallbackPitch;
              const zoom =
                p.zoom !== undefined && p.zoom !== "" ? Number(p.zoom) : fallbackZoom;
              const floor =
                p.floor !== undefined && p.floor !== "" ? Number(p.floor) : fallbackFloor;
              const duration = p.duration || 0;
              return { x, y, dir, pitch, zoom, floor, duration };
            };

            let playerStart = {
              x: player.pos.x,
              y: player.pos.y,
              dir: (player.dir360 - 1) * (Math.PI / 2),
              pitch: 0,
              zoom: 1.0,
              floor: 0,
              duration: 0,
            };

            if (raycasterRef?.current?.getCameraState) {
              const camState = raycasterRef.current.getCameraState();
              playerStart = {
                x: camState.x,
                y: camState.y,
                dir: camState.angle,
                pitch: camState.pitch || 0,
                zoom: camState.zoom || 1.0,
                floor: camState.floor || 0,
                duration: 0,
              };
            }

            setCinematicCamera({
              x: playerStart.x,
              y: playerStart.y,
              dir: playerStart.dir,
              pitch: playerStart.pitch,
              zoom: playerStart.zoom,
              floor: playerStart.floor,
            });

            let currentPointIndex = 0;
            let currentStart = playerStart;

            const playNextPoint = () => {
              if (currentPointIndex >= points.length) {
                if (!keepCinematic) {
                  setCinematicMode(false);
                  setCinematicCamera(null);
                }
                resolve();
                return;
              }

              const targetPoint = resolvePoint(
                points[currentPointIndex],
                currentStart.x,
                currentStart.y,
                currentStart.dir,
                currentStart.pitch,
                currentStart.zoom,
                currentStart.floor,
              );
              const duration = targetPoint.duration;

              if (duration <= 0) {
                setCinematicCamera({
                  x: targetPoint.x,
                  y: targetPoint.y,
                  dir: targetPoint.dir,
                  pitch: targetPoint.pitch,
                  zoom: targetPoint.zoom,
                  floor: targetPoint.floor,
                });
                currentStart = targetPoint;
                currentPointIndex++;
                playNextPoint();
                return;
              }

              let lastTime = performance.now();
              let accumulatedTime = 0;
              const animate = (time: number) => {
                const delta = time - lastTime;
                lastTime = time;

                if (isPausedRef?.current) {
                  requestAnimationFrame(animate);
                  return;
                }

                accumulatedTime += delta;
                let progress = accumulatedTime / duration;
                if (progress > 1) progress = 1;

                const ease =
                  progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                setCinematicCamera((current: any) => {
                  return {
                    x: currentStart.x + (targetPoint.x - currentStart.x) * ease,
                    y: currentStart.y + (targetPoint.y - currentStart.y) * ease,
                    dir: lerpAngle(currentStart.dir, targetPoint.dir, ease),
                    pitch:
                      currentStart.pitch +
                      (targetPoint.pitch - currentStart.pitch) * ease,
                    zoom:
                      currentStart.zoom +
                      (targetPoint.zoom - currentStart.zoom) * ease,
                    floor:
                      currentStart.floor +
                      (targetPoint.floor - currentStart.floor) * ease,
                  };
                });

                if (progress < 1) {
                  requestAnimationFrame(animate);
                } else {
                  currentStart = targetPoint;
                  currentPointIndex++;
                  playNextPoint();
                }
              };
              requestAnimationFrame(animate);
            };

            playNextPoint();
          });
        }
        break;
      case "UNLOCK_ACHIEVEMENT": {
        const key = params.achievementKey || params.key || params.achievementId;
        if (key) {
          if (latestUnlockAchievementRef.current) {
            latestUnlockAchievementRef.current(key);
          } else if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("achievement-update", {
                detail: { action: "unlock", statKey: key },
              })
            );
          }
        }
        break;
      }
    }
  };

  return { checkTriggers };
};
