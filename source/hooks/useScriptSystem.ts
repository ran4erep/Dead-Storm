import { useCallback, useRef, useEffect } from "react";
import { ScriptTrigger, ScriptAction, GameState } from "../types";
import { findPath } from "../utils/aiLogic";
import { calculateLightMap, clearLightMapCache } from "../utils/levelLogic";
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
  returnToMenu?: () => void,
  stopAllSounds?: () => void,
  setViewportFade?: (val: number | ((prev: number) => number)) => void,
  setActiveModal?: any,
  gameState?: any,
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

  const scriptExecutionEpochRef = useRef<number>(0);
  const runningTriggersRef = useRef<Set<any>>(new Set());
  const locallyFiredTriggersRef = useRef<Set<any>>(new Set());
  const stoppedRepeatsRef = useRef<Set<string>>(new Set());
  const activeRepeatsPerLevelRef = useRef<{ [levelKey: string]: Set<string> }>({});
  const executeActionsRef = useRef<any>(null);
  const lastLoadedLevelKeyRef = useRef<string>("");
  const lastGameStateRef = useRef<any>(gameState);

  if (gameState !== undefined && gameState !== lastGameStateRef.current) {
    lastGameStateRef.current = gameState;
    scriptExecutionEpochRef.current++;
    runningTriggersRef.current.clear();
    stoppedRepeatsRef.current.clear();
    activeRepeatsPerLevelRef.current = {};
    timerStatesRef.current = {};
  }

  const currentLevelKey = levelData
    ? (levelData.fileName || levelData.locationName || levelData.name || levelData.rawName || "default_level")
    : "";

  if (currentLevelKey && currentLevelKey !== lastLoadedLevelKeyRef.current) {
    const isFirstLoad = !lastLoadedLevelKeyRef.current;
    lastLoadedLevelKeyRef.current = currentLevelKey;

    scriptExecutionEpochRef.current++;
    locallyFiredTriggersRef.current.clear();
    runningTriggersRef.current.clear();
    timerStatesRef.current = {};

    if (levelData?.triggers && Array.isArray(levelData.triggers)) {
      for (const t of levelData.triggers) {
        if (t && typeof t === "object") {
          delete t.fired;
        }
      }
    }

    if (!isFirstLoad && levelData?.triggers && Array.isArray(levelData.triggers)) {
      const activeSet = activeRepeatsPerLevelRef.current[currentLevelKey];
      if (activeSet && activeSet.size > 0) {
        const triggersToResume = levelData.triggers.filter((t: any) => {
          if (!t || !t.id) return false;
          const normId = String(t.id).trim().toLowerCase();
          return activeSet.has(normId) && !stoppedRepeatsRef.current.has(normId);
        });

        if (triggersToResume.length > 0) {
          setTimeout(() => {
            if (executeActionsRef.current) {
              executeActionsRef.current(triggersToResume, {});
            }
          }, 50);
        }
      }
    }
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
  const latestReturnToMenuRef = useRef(returnToMenu);
  latestReturnToMenuRef.current = returnToMenu;
  const latestStopAllSoundsRef = useRef(stopAllSounds);
  latestStopAllSoundsRef.current = stopAllSounds;
  const latestSetViewportFadeRef = useRef(setViewportFade);
  latestSetViewportFadeRef.current = setViewportFade;
  const latestSetActiveModalRef = useRef(setActiveModal);
  latestSetActiveModalRef.current = setActiveModal;

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

        if (t.id) {
          const normTId = String(t.id).trim().toLowerCase();
          if (stoppedRepeatsRef.current.has(normTId)) return false;
        }

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
            if (
              eventParams.keyId !== p.keyId &&
              eventParams.itemId !== p.keyId &&
              eventParams.itemDefinitionId !== p.keyId
            ) {
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

        if (triggerType === "ON_COUNTER_VALUE" || triggerType === "ON_COUNTER_CHANGE") {
          const p = t.params;
          if (p) {
            const reqCounter = String(p.counterId || p.id || p.counter || p.flag || p.name || "").trim().toLowerCase();
            const evtCounter = String(eventParams.counterId || eventParams.id || eventParams.counter || "").trim().toLowerCase();

            if (reqCounter && evtCounter && reqCounter !== evtCounter) {
              return false;
            }

            const targetVal = Number(p.value ?? p.targetValue ?? p.count ?? p.target ?? 0);
            const actualVal = Number(eventParams.value ?? 0);
            const op = String(p.operator || p.op || p.condition || ">=").trim().toUpperCase();

            let conditionMet = false;
            if (op === "==" || op === "=" || op === "EQ" || op === "EQUAL") {
              conditionMet = actualVal === targetVal;
            } else if (op === ">=" || op === "GTE" || op === "REACHED" || op === "GREATER_EQUAL" || op === "GREATER_OR_EQUAL") {
              conditionMet = actualVal >= targetVal;
            } else if (op === ">" || op === "GT" || op === "GREATER") {
              conditionMet = actualVal > targetVal;
            } else if (op === "<=" || op === "LTE" || op === "LESS_EQUAL" || op === "LESS_OR_EQUAL") {
              conditionMet = actualVal <= targetVal;
            } else if (op === "<" || op === "LT" || op === "LESS") {
              conditionMet = actualVal < targetVal;
            } else if (op === "!=" || op === "NE" || op === "NOT_EQUAL") {
              conditionMet = actualVal !== targetVal;
            } else {
              conditionMet = actualVal >= targetVal;
            }

            if (!conditionMet) {
              return false;
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
            locallyFiredTriggersRef.current.delete(activeTriggers[i]);
          }
        });

        const triggersNeedingFiredUpdate = activeTriggers.filter(
          (t: any) => t.runOnce !== false && !t.fired && !t.actions?.some((a: any) => a?.type === "REPEAT")
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
    const currentEpoch = scriptExecutionEpochRef.current;

    for (const t of triggers) {
      if (scriptExecutionEpochRef.current !== currentEpoch) break;

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

      if (!t.actions || t.actions.length === 0) continue;

      const triggerId = t.id ? String(t.id).trim() : "";
      const normTriggerId = triggerId.toLowerCase();

      const hasRepeat = t.actions.some((a: any) => a?.type === "REPEAT");
      if (hasRepeat && normTriggerId) {
        if (!activeRepeatsPerLevelRef.current[currentLevelKey]) {
          activeRepeatsPerLevelRef.current[currentLevelKey] = new Set();
        }
        activeRepeatsPerLevelRef.current[currentLevelKey].add(normTriggerId);
      }

      const isSequential = t.sequentialActions || hasRepeat;

      if (isSequential) {
        let actionIndex = 0;
        let loopCount = 0;
        while (actionIndex < t.actions.length) {
          if (scriptExecutionEpochRef.current !== currentEpoch) break;
          if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;

          const action = t.actions[actionIndex];
          if (!action) {
            actionIndex++;
            continue;
          }

          if (action.type === "REPEAT") {
            if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;

            const rawDelay = action.params?.delay ?? action.params?.delayMs ?? action.params?.time ?? action.params?.pause;
            const delayMs = typeof rawDelay === "number" ? Math.max(0, rawDelay) : 0;

            if (delayMs > 0) {
              let delayLeft = delayMs;
              while (delayLeft > 0) {
                if (scriptExecutionEpochRef.current !== currentEpoch) break;
                if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;
                await new Promise((resolve) => setTimeout(resolve, Math.min(50, delayLeft)));
                if (!isPausedRef?.current) {
                  delayLeft -= 50;
                }
              }
            }

            if (scriptExecutionEpochRef.current !== currentEpoch) break;
            if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;

            actionIndex = 0;
            loopCount++;
            if (loopCount % 10 === 0 && delayMs <= 0) {
              await new Promise((resolve) => setTimeout(resolve, 16));
            }
            continue;
          }

          if (action.type === "STOP_REPEAT") {
            const targetId = String(action.params?.scriptId || action.params?.id || action.params?.triggerId || "").trim().toLowerCase();
            const idToStop = targetId || normTriggerId;
            if (idToStop) {
              stoppedRepeatsRef.current.add(idToStop);
              for (const lKey of Object.keys(activeRepeatsPerLevelRef.current)) {
                activeRepeatsPerLevelRef.current[lKey]?.delete(idToStop);
              }
            }
            actionIndex++;
            continue;
          }

          const hasMoreCinematic = t.actions.slice(actionIndex + 1).some((act: any) => act?.type === "CINEMATIC_STATIC_CAMERA" || act?.type === "CINEMATIC_CAMERA");
          await runAction(action, hasMoreCinematic, true, triggerId, currentEpoch);

          if (scriptExecutionEpochRef.current !== currentEpoch) break;
          if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;

          actionIndex++;
        }
      } else {
        for (const action of t.actions) {
          if (!action) continue;
          if (scriptExecutionEpochRef.current !== currentEpoch) break;
          if (normTriggerId && stoppedRepeatsRef.current.has(normTriggerId)) break;

          if (action.type === "STOP_REPEAT") {
            const targetId = String(action.params?.scriptId || action.params?.id || action.params?.triggerId || "").trim().toLowerCase();
            const idToStop = targetId || normTriggerId;
            if (idToStop) {
              stoppedRepeatsRef.current.add(idToStop);
              for (const lKey of Object.keys(activeRepeatsPerLevelRef.current)) {
                activeRepeatsPerLevelRef.current[lKey]?.delete(idToStop);
              }
            }
            continue;
          }
          if (action.type === "REPEAT") {
            continue;
          }
          runAction(action, false, false, triggerId, currentEpoch);
        }
      }
    }
  };

  executeActionsRef.current = executeActions;

  const runAction = async (action: ScriptAction, keepCinematic?: boolean, isSequential?: boolean, currentTriggerId?: string, currentEpoch?: number): Promise<void> => {
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
      case "STOP_REPEAT": {
        const targetId = String(params?.scriptId || params?.id || params?.triggerId || "").trim().toLowerCase();
        const idToStop = targetId || (currentTriggerId ? currentTriggerId.trim().toLowerCase() : "");
        if (idToStop) {
          stoppedRepeatsRef.current.add(idToStop);
          for (const lKey of Object.keys(activeRepeatsPerLevelRef.current)) {
            activeRepeatsPerLevelRef.current[lKey]?.delete(idToStop);
          }
        }
        break;
      }
      case "REPEAT": {
        break;
      }
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
          let timeLeft = Number(params.time) || 0;
          const normId = currentTriggerId ? currentTriggerId.trim().toLowerCase() : "";
          while (timeLeft > 0) {
            if (currentEpoch !== undefined && scriptExecutionEpochRef.current !== currentEpoch) break;
            if (normId && stoppedRepeatsRef.current.has(normId)) break;
            await new Promise((resolve) => setTimeout(resolve, Math.min(50, timeLeft)));
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
      case "NPC_FOLLOW": {
        const startX = Number(params.startX ?? params.npcX ?? params.x);
        const startY = Number(params.startY ?? params.npcY ?? params.y);
        const mode = (params.mode || "NPC_FOLLOWS_PLAYER") as "NPC_FOLLOWS_PLAYER" | "PLAYER_FOLLOWS_NPC" | "STOP";
        const targetX = Number(params.targetX ?? params.x);
        const targetY = Number(params.targetY ?? params.y);
        const maxDistance = Number(params.maxDistance ?? params.distance ?? 4);

        if (isNaN(startX) || isNaN(startY)) {
          break;
        }

        // Find NPC/Enemy at start coordinates or by npcId
        let targetEnemyId: string | null = null;
        let targetEnemy: any = null;

        if (params.npcId) {
          targetEnemyId = params.npcId;
          targetEnemy = latestEnemiesRef.current.get(params.npcId);
        }

        if (!targetEnemyId || !targetEnemy) {
          for (const [id, e] of latestEnemiesRef.current.entries()) {
            if (e.x === startX && e.y === startY) {
              targetEnemyId = id;
              targetEnemy = e;
              break;
            }
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

        if (mode === "STOP") {
          setEnemies((prev: Map<string, any>) => {
            const next = new Map(prev);
            const e = next.get(targetEnemyId!);
            if (e) {
              next.set(targetEnemyId!, {
                ...e,
                aiState: e.originalAiState || (e.isNPC ? "PATROL" : "IDLE"),
                movementType: e.originalMovementType || (e.isNPC ? "patroling" : "roaming"),
                homePos: { x: e.x, y: e.y },
                patrolRange: (e.patrolRange && e.patrolRange > 0) ? e.patrolRange : 3,
                followMode: undefined,
                followMaxDistance: undefined,
                targetPos: undefined,
                currentPath: undefined,
                originalAiState: undefined,
                originalMovementType: undefined,
                originalHomePos: undefined,
              });
            }
            return next;
          });
          break;
        }

        const grid = latestLevelDataRef.current?.grid;
        const width = latestLevelDataRef.current?.width || 0;
        const height = latestLevelDataRef.current?.height || 0;
        let path: { x: number; y: number }[] = [];

        if (grid) {
          if (mode === "PLAYER_FOLLOWS_NPC" && !isNaN(targetX) && !isNaN(targetY)) {
            path = findPath(targetEnemy.x, targetEnemy.y, targetX, targetY, grid, width, height);
          } else if (mode === "NPC_FOLLOWS_PLAYER") {
            const playerPos = latestPlayerRef.current?.pos;
            if (playerPos) {
              path = findPath(targetEnemy.x, targetEnemy.y, Math.round(playerPos.x), Math.round(playerPos.y), grid, width, height);
            }
          }
        }

        setEnemies((prev: Map<string, any>) => {
          const next = new Map(prev);
          const e = next.get(targetEnemyId!);
          if (e) {
            next.set(targetEnemyId!, {
              ...e,
              aiState: "NPC_FOLLOW",
              followMode: mode,
              followMaxDistance: isNaN(maxDistance) || maxDistance <= 0 ? 4 : maxDistance,
              originalAiState: e.originalAiState || e.aiState,
              originalMovementType: e.originalMovementType || e.movementType,
              originalHomePos: e.originalHomePos || e.homePos || { x: e.x, y: e.y },
              targetPos: mode === "PLAYER_FOLLOWS_NPC" ? { x: targetX, y: targetY } : undefined,
              currentPath: path,
            });
          }
          return next;
        });

        if (isSequential && mode === "PLAYER_FOLLOWS_NPC" && !isNaN(targetX) && !isNaN(targetY)) {
          let hasTransitionedToFollow = false;
          let checkCount = 0;
          while (true) {
            checkCount++;
            const currentEnemy = latestEnemiesRef.current.get(targetEnemyId);
            if (!currentEnemy) break;
            if (currentEnemy.aiState === "NPC_FOLLOW") {
              hasTransitionedToFollow = true;
            }
            if (currentEnemy.x === targetX && currentEnemy.y === targetY) {
              break;
            }
            if (hasTransitionedToFollow && currentEnemy.aiState !== "NPC_FOLLOW") {
              break;
            }
            if (!hasTransitionedToFollow && checkCount > 20) {
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
      case "LAUNCH_MINIGAME": {
        const gameId = params.gameId;
        const setActiveModal = latestSetActiveModalRef.current;
        if (setActiveModal && gameId === 'chess') {
          setActiveModal('chess');
        }
        break;
      }
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
      case "SPAWN_EXPLOSION":
      case "SPAWN_ENTITY": {
        const rawEntityType = params.entityType || (
          action.type === 'SPAWN_ENEMY' ? 'ENEMY' :
          action.type === 'SPAWN_ITEM' ? 'ITEM' :
          action.type === 'SPAWN_NPC' ? 'NPC' :
          action.type === 'SPAWN_DECORATION' ? 'DECORATION' :
          action.type === 'SPAWN_EXPLOSION' ? 'EXPLOSION' :
          undefined
        );
        const entityType = String(rawEntityType || "").trim().toUpperCase();
        const definitionId = params.definitionId || params.entityId || params.enemyId || params.npcId || params.itemId || params.decorationId;

        if (
          params.x === undefined ||
          params.y === undefined ||
          !entityType
        )
          break;

        if (entityType !== "EXPLOSION" && entityType !== "LIGHT" && !definitionId) {
          break;
        }

        const x = Math.floor(Number(params.x));
        const y = Math.floor(Number(params.y));
        if (isNaN(x) || isNaN(y)) break;

        if (entityType === "EXPLOSION") {
          if (handleExplosion) {
            const damageDice = params.damageDice || params.damage || "2d6";
            const range = params.range !== undefined && params.range !== null && params.range !== "" ? Number(params.range) : 2;
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
              params.itemDuration !== undefined && params.itemDuration !== null && params.itemDuration !== "" ? Number(params.itemDuration) : undefined
            );
          }
          const customDelay = params.delay !== undefined && params.delay !== null && params.delay !== "" ? Number(params.delay) : 0;
          const delayTime = customDelay > 0 ? customDelay : (isSequential ? 450 : 0);
          if (delayTime > 0) {
            let timeLeft = delayTime;
            while (timeLeft > 0) {
              await new Promise((resolve) => setTimeout(resolve, 50));
              if (!isPausedRef?.current) {
                timeLeft -= 50;
              }
            }
          }
          break;
        }

        setLevelData((prev: any) => {
          if (!prev) return prev;
          const next = { ...prev };
          const newGrid = [...(next.grid || [])];

          if (entityType === "AMBIENT_SOUND" || entityType === "SOUND" || entityType === "AMBIENT") {
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
                loop: def.loop ?? params.loop ?? false,
                nonPositional: def.nonPositional ?? params.nonPositional ?? false,
              },
            ];

            // Also place symbol into gridSounds if present
            if (next.gridSounds && Array.isArray(next.gridSounds)) {
              next.gridSounds = next.gridSounds.map((floorGrid: string[]) => {
                if (!Array.isArray(floorGrid) || !floorGrid[y]) return floorGrid;
                if (x < floorGrid[y].length) {
                  const rowArr = floorGrid[y].split("");
                  rowArr[x] = String(definitionId);
                  const newFloor = [...floorGrid];
                  newFloor[y] = rowArr.join("");
                  return newFloor;
                }
                return floorGrid;
              });
            }
            return next;
          }

          if (entityType === "PARTICLE_EMITTER" || entityType === "PARTICLE" || entityType === "EMITTER" || entityType === "PARTICLES") {
            next.particles = [
              ...(next.particles || []).filter((p: any) => Math.floor(Number(p.x)) !== x || Math.floor(Number(p.y)) !== y || String(p.definitionId) !== String(definitionId)),
              {
                id:
                  params.emitterId ||
                  Math.random().toString(36).substring(2, 9),
                definitionId,
                x,
                y,
                z: params.zOffset || 0,
              },
            ];
            return next;
          }

          if (!newGrid[y] || !newGrid[y][x]) return prev;
          newGrid[y] = [...newGrid[y]];
          const tile = { ...newGrid[y][x] };

          let lightSpawned = false;
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
            lightSpawned = true;

            // Set symbol in gridLight if definitionId matches a lightDefinition symbol
            if (definitionId && definitionId.length === 1) {
              if (next.gridLight && next.gridLight[y] && x < next.gridLight[y].length) {
                const r = next.gridLight[y].split("");
                r[x] = definitionId;
                next.gridLight = [...next.gridLight];
                next.gridLight[y] = r.join("");
              }
              if (next.baseLightInfo && next.baseLightInfo.gridLight && next.baseLightInfo.gridLight[y] && x < next.baseLightInfo.gridLight[y].length) {
                const r = next.baseLightInfo.gridLight[y].split("");
                r[x] = definitionId;
                next.baseLightInfo = { ...next.baseLightInfo, gridLight: [...next.baseLightInfo.gridLight] };
                next.baseLightInfo.gridLight[y] = r.join("");
              }
            }
          } else if (entityType === "ITEM") {
            const levelItem = levelData && levelData.itemsPalette ? levelData.itemsPalette.find((i: any) => i.id === definitionId || i.symbol === definitionId || i.definitionId === definitionId) : null;
            const realDbId = levelItem?.definitionId || levelItem?.id || definitionId;
            const dbTemplate = (itemsDb as any)[realDbId] || (itemsDb as any)[definitionId] || {};
            const template = { ...dbTemplate, ...(levelItem || {}) };
            if (latestSpriteMapRef.current) {
              ensureEntityAssetsLoaded(template, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
            }
            const items = [...(tile.items || [])];
            const amount = params.amount || params.count || 1;
            const rawName = params.name || template.name || dbTemplate.name || realDbId || definitionId;
            const rawDesc = params.description || template.description || dbTemplate.description || "";
            const localizedName = localize(rawName);
            const localizedDesc = localize(rawDesc);
            for (let i = 0; i < amount; i++) {
              items.push({
                ...dbTemplate,
                ...levelItem,
                ...template,
                ...params.itemOverrides,
                id: `${realDbId || definitionId}_${Math.random().toString(36).substring(2, 9)}`,
                definitionId: realDbId || definitionId,
                name: localizedName,
                description: localizedDesc,
                rawName: rawName,
                rawDescription: rawDesc,
                durability: params.itemOverrides?.durability ?? template.maxDurability ?? dbTemplate.maxDurability,
                handAssetId: template.handAsset || dbTemplate.handAsset,
                handFemaleAssetId: template.handFemaleAsset || dbTemplate.handFemaleAsset,
                attackAssetId: template.attackAsset || dbTemplate.attackAsset,
                attackFemaleAssetId: template.attackAssetFemale || dbTemplate.attackAssetFemale,
                maskAssetId: template.maskAsset || dbTemplate.maskAsset,
                count: params.itemCount || template.count || dbTemplate.count || 1,
                currentAmmo: template.type === 'AMMO' ? (params.itemCount || template.count || dbTemplate.count || 1) : (template.currentAmmo ?? dbTemplate.currentAmmo),
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
            if (newDecor.lifeTime !== undefined) {
              (window as any).registerTimedEffect?.(x, y);
            }
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

          if (lightSpawned && next.baseLightInfo) {
            const res = calculateLightMap(
              newGrid,
              next.baseLightInfo.gridLight,
              next.baseLightInfo.globalLight,
              next.baseLightInfo.lightDefinitions || {},
              next.outdoorMap,
              next.grids
            );
            next.lightMap = res.baseLightMap;
            next.floorLightMaps = res.floorLightMaps;
            next.dynamicLights = res.dynamicLights;
          }

          return next;
        });
        break;
      }
      case "REMOVE_ENTITY": {
        if (params.x === undefined || params.y === undefined) break;

        const x = Math.floor(Number(params.x));
        const y = Math.floor(Number(params.y));
        if (isNaN(x) || isNaN(y)) break;

        const rawType = params.entityType || params.type || params.entityKind || params.kind || "";
        const normType = String(rawType).trim().toUpperCase();
        const definitionId = params.definitionId || params.entityId || params.enemyId || params.npcId || params.itemId || params.decorationId || params.symbol || params.id;
        const defIdStr = definitionId !== undefined && definitionId !== null ? String(definitionId).trim() : "";

        const isAll = normType === "" || normType === "ALL" || normType === "ANY" || normType === "*";
        const isAmbientSound = isAll || normType === "AMBIENT_SOUND" || normType === "SOUND" || normType === "AMBIENT" || normType === "GRID_SOUND";
        const isParticleEmitter = isAll || normType === "PARTICLE_EMITTER" || normType === "PARTICLE" || normType === "EMITTER" || normType === "PARTICLES";
        const isLight = isAll || normType === "LIGHT" || normType === "GRID_LIGHT";
        const isItem = isAll || normType === "ITEM" || normType === "ITEMS";
        const isDecoration = isAll || normType === "DECORATION" || normType === "DECORATIONS" || normType === "DECOR";
        const isNpcOrEnemy = isAll || normType === "NPC" || normType === "ENEMY" || normType === "MONSTER" || normType === "ENTITY";

        const cleanEnemiesMap = (targetTileEnemyId?: string) => {
          setEnemies((prevEnemies: Map<string, any>) => {
            if (!prevEnemies || prevEnemies.size === 0) return prevEnemies;
            const nextE = new Map(prevEnemies);
            let changed = false;

            for (const [id, enemy] of prevEnemies.entries()) {
              const posMatch = Math.floor(Number(enemy.x)) === x && Math.floor(Number(enemy.y)) === y;
              const idMatch = targetTileEnemyId ? id === targetTileEnemyId : false;
              const defMatch = defIdStr ? (String(enemy.definitionId) === defIdStr || String(enemy.id) === defIdStr || String(enemy.symbol) === defIdStr) : true;

              if ((posMatch || idMatch) && defMatch) {
                nextE.delete(id);
                changed = true;
                if (typeof window !== 'undefined' && (window as any).enemyPositionsCache) {
                  (window as any).enemyPositionsCache.delete(id);
                }
              }
            }
            return changed ? nextE : prevEnemies;
          });
        };

        setLevelData((prev: any) => {
          if (!prev) return prev;
          const next = { ...prev };
          let gridChanged = false;
          let lightNeedRecalc = false;

          // 1. AMBIENT_SOUND
          if (isAmbientSound) {
            if (next.ambientSounds && next.ambientSounds.length > 0) {
              next.ambientSounds = next.ambientSounds.filter((s: any) => {
                const posMatch = Math.floor(Number(s.x)) === x && Math.floor(Number(s.y)) === y;
                const defMatch = defIdStr ? (String(s.symbol) === defIdStr || String(s.id) === defIdStr || String(s.definitionId) === defIdStr) : true;
                return !(posMatch && defMatch);
              });
            }
            if (next.gridSounds && Array.isArray(next.gridSounds)) {
              next.gridSounds = next.gridSounds.map((floorGrid: string[]) => {
                if (!Array.isArray(floorGrid) || !floorGrid[y]) return floorGrid;
                const rowStr = floorGrid[y];
                if (x < rowStr.length && rowStr[x] !== ".") {
                  const targetSymbolMatch = !defIdStr || rowStr[x] === defIdStr;
                  if (targetSymbolMatch) {
                    const rowArr = rowStr.split("");
                    rowArr[x] = ".";
                    const newFloor = [...floorGrid];
                    newFloor[y] = rowArr.join("");
                    return newFloor;
                  }
                }
                return floorGrid;
              });
            }
          }

          // 2. PARTICLE_EMITTER
          if (isParticleEmitter) {
            if (next.particles && next.particles.length > 0) {
              next.particles = next.particles.filter((p: any) => {
                const posMatch = Math.floor(Number(p.x)) === x && Math.floor(Number(p.y)) === y;
                const defMatch = defIdStr ? (String(p.definitionId) === defIdStr || String(p.id) === defIdStr || String(p.emitterId) === defIdStr) : true;
                return !(posMatch && defMatch);
              });
            }
          }

          // Helper to match target light definition or symbol
          const matchesLightDefinition = (sym: string) => {
            if (!sym || sym === ".") return false;
            if (!defIdStr || sym === defIdStr) return true;
            const defs = next.baseLightInfo?.lightDefinitions || next.lightDefinitions || {};
            const def = defs[sym];
            if (def) {
              if (
                String(def.id) === defIdStr ||
                String(def.definitionId) === defIdStr ||
                String(def.symbol) === defIdStr ||
                String(def.name) === defIdStr
              ) {
                return true;
              }
            }
            return false;
          };

          // 3. LIGHT
          if (isLight) {
            if (next.gridLight && next.gridLight[y]) {
              const rowStr = next.gridLight[y];
              if (x < rowStr.length && rowStr[x] !== ".") {
                if (matchesLightDefinition(rowStr[x])) {
                  const rowArr = rowStr.split("");
                  rowArr[x] = ".";
                  next.gridLight = [...next.gridLight];
                  next.gridLight[y] = rowArr.join("");
                  lightNeedRecalc = true;
                }
              }
            }
            if (next.baseLightInfo && next.baseLightInfo.gridLight && next.baseLightInfo.gridLight[y]) {
              const rowStr = next.baseLightInfo.gridLight[y];
              if (x < rowStr.length && rowStr[x] !== ".") {
                if (matchesLightDefinition(rowStr[x])) {
                  const rowArr = rowStr.split("");
                  rowArr[x] = ".";
                  next.baseLightInfo = { ...next.baseLightInfo, gridLight: [...next.baseLightInfo.gridLight] };
                  next.baseLightInfo.gridLight[y] = rowArr.join("");
                  lightNeedRecalc = true;
                }
              }
            }
          }

          const newGrid = [...(next.grid || [])];
          if (!newGrid[y] || !newGrid[y][x]) {
            if (isNpcOrEnemy) {
              cleanEnemiesMap();
            }
            if (lightNeedRecalc) {
              clearLightMapCache();
              const gridLightToUse = next.baseLightInfo?.gridLight || next.gridLight;
              const globalLightToUse = next.baseLightInfo?.globalLight ?? next.globalLight ?? 1.0;
              const lightDefsToUse = next.baseLightInfo?.lightDefinitions || next.lightDefinitions || {};
              const res = calculateLightMap(
                newGrid,
                gridLightToUse,
                globalLightToUse,
                lightDefsToUse,
                next.outdoorMap,
                next.grids
              );
              next.lightMap = res.baseLightMap;
              next.floorLightMaps = res.floorLightMaps;
              next.dynamicLights = res.dynamicLights;
            }
            return next;
          }

          newGrid[y] = [...newGrid[y]];
          const tile = { ...newGrid[y][x] };

          if (isLight && tile.light) {
            delete tile.light;
            lightNeedRecalc = true;
            gridChanged = true;
          }

          if (isLight && (tile.decorations || tile.decoration)) {
            if (tile.decorations && tile.decorations.length > 0) {
              let decChanged = false;
              tile.decorations = tile.decorations.map((d: any) => {
                if (d.light) {
                  decChanged = true;
                  const copy = { ...d };
                  delete copy.light;
                  return copy;
                }
                return d;
              });
              if (decChanged) {
                lightNeedRecalc = true;
                gridChanged = true;
                tile.decoration = tile.decorations[0];
              }
            }
            if (tile.decoration && tile.decoration.light) {
              const copy = { ...tile.decoration };
              delete copy.light;
              tile.decoration = copy;
              lightNeedRecalc = true;
              gridChanged = true;
            }
          }

          if (isItem) {
            if (defIdStr) {
              if (tile.items && tile.items.length > 0) {
                const initialCount = tile.items.length;
                tile.items = tile.items.filter(
                  (i: any) =>
                    String(i.definitionId) !== defIdStr &&
                    String(i.id) !== defIdStr &&
                    String(i.type) !== defIdStr &&
                    String(i.symbol) !== defIdStr
                );
                if (tile.items.length !== initialCount) gridChanged = true;
              }
            } else {
              if (tile.items && tile.items.length > 0) {
                tile.items = [];
                gridChanged = true;
              }
            }
          }

          if (isDecoration || isAll) {
            const currentDecs = tile.decorations && tile.decorations.length > 0
              ? tile.decorations
              : (tile.decoration ? [tile.decoration] : []);

            if (currentDecs.length > 0) {
              let removedAnyLight = false;
              if (defIdStr) {
                const newDecs = currentDecs.filter((d: any) => {
                  const match = String(d.id) === defIdStr ||
                    String(d.type) === defIdStr ||
                    String(d.definitionId) === defIdStr ||
                    String(d.symbol) === defIdStr ||
                    String(d.name) === defIdStr;
                  if (match && d.light) {
                    removedAnyLight = true;
                  }
                  return !match;
                });
                if (newDecs.length !== currentDecs.length) {
                  tile.decorations = newDecs.length > 0 ? newDecs : undefined;
                  tile.decoration = newDecs.length > 0 ? newDecs[0] : undefined;
                  gridChanged = true;
                  if (removedAnyLight) lightNeedRecalc = true;
                }
              } else {
                if (currentDecs.some((d: any) => d.light)) {
                  removedAnyLight = true;
                }
                delete tile.decorations;
                delete tile.decoration;
                gridChanged = true;
                if (removedAnyLight) lightNeedRecalc = true;
              }
            }
          }

          if (isNpcOrEnemy) {
            cleanEnemiesMap(tile.enemyId);
            if (tile.enemyId) {
              delete tile.enemyId;
              gridChanged = true;
            }
          }

          if (gridChanged) {
            newGrid[y][x] = tile;
            next.grid = newGrid;
          }

          if (lightNeedRecalc) {
            clearLightMapCache();
            const gridLightToUse = next.baseLightInfo?.gridLight || next.gridLight;
            const globalLightToUse = next.baseLightInfo?.globalLight ?? next.globalLight ?? 1.0;
            const lightDefsToUse = next.baseLightInfo?.lightDefinitions || next.lightDefinitions || {};
            const res = calculateLightMap(
              newGrid,
              gridLightToUse,
              globalLightToUse,
              lightDefsToUse,
              next.outdoorMap,
              next.grids
            );
            next.lightMap = res.baseLightMap;
            next.floorLightMaps = res.floorLightMaps;
            next.dynamicLights = res.dynamicLights;
          }

          return next;
        });
        break;
      }
      case "MODIFY_ENTITY": {
        if (!params) break;

        const rawType = params.entityType || params.type || params.entityKind || params.kind || "";
        const normType = String(rawType).trim().toUpperCase();
        const targetX = (params.x !== undefined && params.x !== null && params.x !== "") ? Math.floor(Number(params.x)) : undefined;
        const targetY = (params.y !== undefined && params.y !== null && params.y !== "") ? Math.floor(Number(params.y)) : undefined;
        const definitionId = params.definitionId || params.entityId || params.enemyId || params.npcId || params.itemId || params.decorationId || params.symbol || params.id;
        const defIdStr = definitionId !== undefined && definitionId !== null ? String(definitionId).trim().toLowerCase() : undefined;
        const mods = params.modifiedConfig || params.overrides || params.config || {};

        if (Object.keys(mods).length === 0) break;

        const isNpcOrEnemy = !normType || normType === "ALL" || normType === "ENEMY" || normType === "NPC" || normType === "MONSTER" || normType === "ENTITY";
        const isItem = !normType || normType === "ALL" || normType === "ITEM" || normType === "ITEMS";
        const isDecoration = !normType || normType === "ALL" || normType === "DECORATION" || normType === "DECORATIONS" || normType === "DECOR";

        // 1. Modify Enemy / NPC entities in state (enemies Map + latestSpriteMapRef)
        if (isNpcOrEnemy) {
          setEnemies((prevEnemies: Map<string, any>) => {
            if (!prevEnemies || prevEnemies.size === 0) return prevEnemies;
            const nextE = new Map(prevEnemies);
            let updated = false;

            for (const [id, entity] of nextE.entries()) {
              const matchesType = !normType || normType === "ALL" || normType === "ENTITY" || (normType === "NPC" ? entity.isNPC : !entity.isNPC);
              const matchesPos = targetX === undefined || targetY === undefined ||
                (Math.floor(Number(entity.x)) === targetX && Math.floor(Number(entity.y)) === targetY) ||
                (entity.homePos && Math.floor(Number(entity.homePos.x)) === targetX && Math.floor(Number(entity.homePos.y)) === targetY);
              const matchesDef = !defIdStr ||
                String(entity.definitionId || "").toLowerCase() === defIdStr ||
                String(entity.id || "").toLowerCase() === defIdStr ||
                String(entity.symbol || "").toLowerCase() === defIdStr;

              if (matchesType && matchesPos && matchesDef) {
                updated = true;
                const newName = mods.name ? localize(mods.name) : entity.name;
                const newDesc = mods.description ? localize(mods.description) : entity.description;

                let newAssets = entity.assets;
                if (mods.assets) {
                  newAssets = { ...entity.assets, ...mods.assets };
                }

                const modifiedEntity = {
                  ...entity,
                  ...mods,
                  name: newName,
                  description: newDesc,
                  assets: newAssets,
                  hp: mods.hp !== undefined ? Number(mods.hp) : entity.hp,
                  maxHp: mods.maxHp !== undefined ? Number(mods.maxHp) : (mods.hp !== undefined ? Math.max(entity.maxHp || 0, Number(mods.hp)) : entity.maxHp),
                };

                nextE.set(id, modifiedEntity);

                // Update cached sprite if assetId changed
                if (latestSpriteMapRef.current && modifiedEntity.assets?.map?.assetId) {
                  const spriteImg = latestSpriteMapRef.current.get(modifiedEntity.assets.map.assetId);
                  if (spriteImg) {
                    latestSpriteMapRef.current.set(id, spriteImg);
                  }
                }
              }
            }
            return updated ? nextE : prevEnemies;
          });
        }

        // 2. Modify Items & Decorations in levelData.grid
        if (isItem || isDecoration) {
          setLevelData((prev: any) => {
            if (!prev || !prev.grid) return prev;
            let gridChanged = false;
            const newGrid = prev.grid.map((row: any[]) => [...row]);

            for (let y = 0; y < prev.height; y++) {
              if (targetY !== undefined && y !== targetY) continue;
              for (let x = 0; x < prev.width; x++) {
                if (targetX !== undefined && x !== targetX) continue;
                const tile = newGrid[y]?.[x];
                if (!tile) continue;

                let tileChanged = false;
                const newTile = { ...tile };

                // Modify Items
                if (isItem && newTile.items && newTile.items.length > 0) {
                  const updatedItems = newTile.items.map((item: any) => {
                    const matchesDef = !defIdStr ||
                      String(item.definitionId || "").toLowerCase() === defIdStr ||
                      String(item.id || "").toLowerCase() === defIdStr ||
                      String(item.symbol || "").toLowerCase() === defIdStr;
                    if (matchesDef) {
                      tileChanged = true;
                      return {
                        ...item,
                        ...mods,
                        name: mods.name ? localize(mods.name) : item.name,
                        description: mods.description ? localize(mods.description) : item.description,
                      };
                    }
                    return item;
                  });
                  if (tileChanged) {
                    newTile.items = updatedItems;
                  }
                }

                // Modify Decorations
                if (isDecoration) {
                  if (newTile.decorations && newTile.decorations.length > 0) {
                    const updatedDecs = newTile.decorations.map((dec: any) => {
                      const matchesDef = !defIdStr ||
                        String(dec.definitionId || "").toLowerCase() === defIdStr ||
                        String(dec.id || "").toLowerCase() === defIdStr ||
                        String(dec.symbol || "").toLowerCase() === defIdStr;
                      if (matchesDef) {
                        tileChanged = true;
                        return {
                          ...dec,
                          ...mods,
                          name: mods.name ? localize(mods.name) : dec.name,
                          description: mods.description ? localize(mods.description) : dec.description,
                        };
                      }
                      return dec;
                    });
                    if (tileChanged) {
                      newTile.decorations = updatedDecs;
                      newTile.decoration = updatedDecs[0];
                    }
                  } else if (newTile.decoration) {
                    const dec = newTile.decoration;
                    const matchesDef = !defIdStr ||
                      String(dec.definitionId || "").toLowerCase() === defIdStr ||
                      String(dec.id || "").toLowerCase() === defIdStr ||
                      String(dec.symbol || "").toLowerCase() === defIdStr;
                    if (matchesDef) {
                      tileChanged = true;
                      const modifiedDec = {
                        ...dec,
                        ...mods,
                        name: mods.name ? localize(mods.name) : dec.name,
                        description: mods.description ? localize(mods.description) : dec.description,
                      };
                      newTile.decoration = modifiedDec;
                      newTile.decorations = [modifiedDec];
                    }
                  }
                }

                if (tileChanged) {
                  gridChanged = true;
                  newGrid[y][x] = newTile;
                }
              }
            }

            return gridChanged ? { ...prev, grid: newGrid } : prev;
          });
        }

        break;
      }
      case "GIVE_ITEM": {
        const player = latestPlayerRef.current;
        const defId = params.itemDefinitionId || params.itemId;
        if (!defId) break;

        const levelItem = levelData && levelData.itemsPalette ? levelData.itemsPalette.find((i: any) => i.id === defId || i.symbol === defId || i.definitionId === defId) : null;
        const realDbId = levelItem?.definitionId || levelItem?.id || defId;
        const dbTemplate = (itemsDb as any)[realDbId] || (itemsDb as any)[defId] || {};
        const itemTemplate = { ...dbTemplate, ...(levelItem || {}) };

        if (latestSpriteMapRef.current) {
          ensureEntityAssetsLoaded(itemTemplate, itemsDb, enemiesDb, npcsDb, decorationsDb, latestSpriteMapRef.current);
        }

        const count = params.count || params.amount || 1;
        const spawnX = params.spawnAtX !== undefined ? Number(params.spawnAtX) : undefined;
        const spawnY = params.spawnAtY !== undefined ? Number(params.spawnAtY) : undefined;
        const isSpawningOnGround = spawnX !== undefined && spawnY !== undefined && !isNaN(spawnX) && !isNaN(spawnY);

        const rawName = params.itemName || itemTemplate.name || dbTemplate.name || realDbId || defId;
        const rawDesc = params.itemDescription || itemTemplate.description || dbTemplate.description || "";
        const localizedName = localize(rawName);
        const localizedDesc = localize(rawDesc);

        const createItems = () => {
          const items = [];
          for (let i = 0; i < count; i++) {
            items.push({
              ...dbTemplate,
              ...levelItem,
              ...itemTemplate,
              ...params.itemOverrides,
              id: `${realDbId || defId}_${Math.random().toString(36).substring(2, 7)}`,
              definitionId: realDbId || defId,
              name: localizedName,
              description: localizedDesc,
              rawName: rawName,
              rawDescription: rawDesc,
              durability: params.itemOverrides?.durability ?? itemTemplate.maxDurability ?? dbTemplate.maxDurability,
              handAssetId: itemTemplate.handAsset || dbTemplate.handAsset,
              handFemaleAssetId: itemTemplate.handFemaleAsset || dbTemplate.handFemaleAsset,
              attackAssetId: itemTemplate.attackAsset || dbTemplate.attackAsset,
              attackFemaleAssetId: itemTemplate.attackAssetFemale || dbTemplate.attackAssetFemale,
              maskAssetId: itemTemplate.maskAsset || dbTemplate.maskAsset,
              count: params.itemCount || itemTemplate.count || dbTemplate.count || 1,
              currentAmmo: itemTemplate.type === 'AMMO' ? (params.itemCount || itemTemplate.count || dbTemplate.count || 1) : (itemTemplate.currentAmmo ?? dbTemplate.currentAmmo),
            });
          }
          return items;
        };

        if (isSpawningOnGround) {
          setLevelData((prev: any) => {
            if (!prev || !prev.grid || !prev.grid[spawnY] || !prev.grid[spawnY][spawnX])
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

          const msg = `${localizedName}${count > 1 ? ` x${count}` : ""} ${localize("появляется здесь. / appears here.")}`;
          addLog(msg, "INFO");
          if (showToast) showToast(msg);
        } else if (player) {
          const BASE_INVENTORY_CAPACITY = 4;
          const bonusCapacity =
            (player.equipment?.helmet?.inventorySlots || 0) +
            (player.equipment?.vest?.inventorySlots || 0) +
            (player.equipment?.pants?.inventorySlots || 0) +
            (player.equipment?.boots?.inventorySlots || 0) +
            (player.equipment?.accessory1?.inventorySlots || 0) +
            (player.equipment?.accessory2?.inventorySlots || 0);
          const maxCapacity = BASE_INVENTORY_CAPACITY + bonusCapacity;

          const equippedIds = new Set<string>();
          if (player.equippedWeapon?.id) equippedIds.add(player.equippedWeapon.id);
          if (player.equipment) {
            Object.values(player.equipment).forEach((eqItem: any) => {
              if (eqItem?.id) equippedIds.add(eqItem.id);
            });
          }

          const newItems = createItems();
          let updatedInventory = [...(player.inventory || [])];
          const givenItemsFit: any[] = [];
          const droppedItems: any[] = [];

          for (const item of newItems) {
            if (item.type === 'CASH') {
              const existingIndex = updatedInventory.findIndex(i => i.type === 'CASH');
              if (existingIndex !== -1) {
                updatedInventory[existingIndex] = {
                  ...updatedInventory[existingIndex],
                  count: (updatedInventory[existingIndex].count || 0) + (item.count || 1)
                };
                givenItemsFit.push(item);
                continue;
              }
            } else if (item.type === 'AMMO' || item.type === 'MATERIAL') {
              const existingIndex = updatedInventory.findIndex(i =>
                i.id !== item.id &&
                (i.definitionId === item.definitionId || i.rawName === item.rawName) &&
                (i.count || 1) < (i.maxStack || 999)
              );
              if (existingIndex !== -1) {
                const existingItem = updatedInventory[existingIndex];
                const space = (existingItem.maxStack || 999) - (existingItem.count || 1);
                const amountToAdd = Math.min(space, item.count || 1);
                updatedInventory[existingIndex] = {
                  ...existingItem,
                  count: (existingItem.count || 1) + amountToAdd
                };
                givenItemsFit.push(item);
                continue;
              }
            }

            const currentLoad = updatedInventory
              .filter((i) => !equippedIds.has(i.id) && i.type !== 'CASH')
              .reduce((acc, i) => acc + (i.weight !== undefined ? i.weight : 1), 0);
            const itemWeight = item.weight !== undefined ? item.weight : 1;

            if (currentLoad + itemWeight <= maxCapacity) {
              updatedInventory.push(item);
              givenItemsFit.push(item);
            } else {
              droppedItems.push(item);
            }
          }

          setPlayer((prev: any) => ({
            ...prev,
            inventory: updatedInventory,
          }));

          if (givenItemsFit.length > 0) {
            const givenCount = givenItemsFit.reduce((acc, i) => acc + (i.count || 1), 0);
            const prefixText = localize("Получено: / Received:");
            const msg = `${prefixText} ${localizedName}${givenCount > 1 ? ` x${givenCount}` : ""}`;
            addLog(msg, "SUCCESS");
            if (showToast) showToast(msg);
          }

          if (droppedItems.length > 0) {
            const px = Math.floor(player.pos.x);
            const py = Math.floor(player.pos.y);
            if (setLevelData) {
              setLevelData((prev: any) => {
                if (!prev || !prev.grid || !prev.grid[py] || !prev.grid[py][px]) return prev;
                const newGrid = [...prev.grid];
                const newRow = [...newGrid[py]];
                const existingItems = newRow[px].items || [];
                newRow[px] = { ...newRow[px], items: [...existingItems, ...droppedItems] };
                newGrid[py] = newRow;
                return { ...prev, grid: newGrid };
              });
            }

            const droppedCount = droppedItems.reduce((acc, i) => acc + (i.count || 1), 0);
            const droppedLabel = `${localizedName}${droppedCount > 1 ? ` x${droppedCount}` : ""}`;
            const overflowMsg = `${localize("Не хватило места в инвентаре! Выпало на землю: / Not enough inventory space! Dropped on ground:")} ${droppedLabel}`;
            addLog(overflowMsg, "WARNING");
            if (showToast) showToast(overflowMsg);
          }
        }

        if (params.toastMsg) showToast(localize(params.toastMsg));
        break;
      }
      case "TAKE_ITEM": {
        const player = latestPlayerRef.current;
        if (!player) break;

        const isTakeAll = !!params.takeAll;
        const takeScope = params.takeAllScope || params.scope || "ALL";

        let updatedInventory = [...(player.inventory || [])];
        let updatedEquippedWeapon = player.equippedWeapon;
        let updatedEquipment = {
          ...(player.equipment || {
            weapon: null,
            weaponAkimbo: null,
            helmet: null,
            vest: null,
            pants: null,
            boots: null,
            accessory1: null,
            accessory2: null,
          }),
        };

        if (isTakeAll) {
          if (takeScope === "ALL") {
            updatedInventory = [];
            updatedEquippedWeapon = null;
            updatedEquipment = {
              weapon: null,
              weaponAkimbo: null,
              helmet: null,
              vest: null,
              pants: null,
              boots: null,
              accessory1: null,
              accessory2: null,
            };
            const msg = localize("Изъяты все предметы и экипировка / All items and equipment removed");
            addLog(msg, "INFO");
            if (showToast) showToast(msg);
          } else if (takeScope === "INVENTORY") {
            updatedInventory = [];
            const msg = localize("Изъят весь инвентарь / Inventory cleared");
            addLog(msg, "INFO");
            if (showToast) showToast(msg);
          } else if (takeScope === "EQUIPPED") {
            const equippedIds = new Set<string>();
            if (updatedEquippedWeapon?.id) equippedIds.add(updatedEquippedWeapon.id);
            Object.values(updatedEquipment).forEach((eqItem: any) => {
              if (eqItem?.id) equippedIds.add(eqItem.id);
            });

            if (equippedIds.size > 0) {
              updatedInventory = updatedInventory.filter((item) => !equippedIds.has(item.id));
            }

            updatedEquippedWeapon = null;
            updatedEquipment = {
              weapon: null,
              weaponAkimbo: null,
              helmet: null,
              vest: null,
              pants: null,
              boots: null,
              accessory1: null,
              accessory2: null,
            };
            const msg = localize("Изъята вся экипировка / Equipped items removed");
            addLog(msg, "INFO");
            if (showToast) showToast(msg);
          }
        } else {
          const defId = params.itemDefinitionId || params.itemId;
          if (!defId) break;

          const currentItems = updatedInventory;
          if (currentItems.length === 0) break;

          const levelItem = levelData && levelData.itemsPalette ? levelData.itemsPalette.find((i: any) => i.id === defId || i.symbol === defId || i.definitionId === defId) : null;
          const realDbId = levelItem?.definitionId || levelItem?.id || defId;

          const amountToTakeNeeded = params.count || params.amount || 1;
          let remainingToTake = amountToTakeNeeded;
          let takenCount = 0;
          let takenItemName = "";

          const newInv: any[] = [];

          for (const item of currentItems) {
            const isMatch =
              item.id === defId ||
              item.definitionId === defId ||
              item.definitionId === realDbId ||
              item.rawName === defId ||
              item.name === defId ||
              (levelItem && (item.definitionId === levelItem.id || item.id === levelItem.id));

            if (isMatch && remainingToTake > 0) {
              if (!takenItemName) {
                takenItemName = item.name || item.rawName || realDbId || defId;
              }
              const itemQuantity = item.count || 1;
              if (itemQuantity > remainingToTake) {
                takenCount += remainingToTake;
                newInv.push({
                  ...item,
                  count: itemQuantity - remainingToTake,
                });
                remainingToTake = 0;
              } else {
                takenCount += itemQuantity;
                remainingToTake -= itemQuantity;

                if (updatedEquippedWeapon?.id === item.id) {
                  updatedEquippedWeapon = null;
                }
                if (updatedEquipment.weapon?.id === item.id) updatedEquipment.weapon = null;
                if (updatedEquipment.weaponAkimbo?.id === item.id) updatedEquipment.weaponAkimbo = null;
                if (updatedEquipment.helmet?.id && updatedEquipment.helmet.id === item.id) updatedEquipment.helmet = null;
                if (updatedEquipment.vest?.id && updatedEquipment.vest.id === item.id) updatedEquipment.vest = null;
                if (updatedEquipment.pants?.id && updatedEquipment.pants.id === item.id) updatedEquipment.pants = null;
                if (updatedEquipment.boots?.id && updatedEquipment.boots.id === item.id) updatedEquipment.boots = null;
                if (updatedEquipment.accessory1?.id && updatedEquipment.accessory1.id === item.id) updatedEquipment.accessory1 = null;
                if (updatedEquipment.accessory2?.id && updatedEquipment.accessory2.id === item.id) updatedEquipment.accessory2 = null;
              }
            } else {
              newInv.push(item);
            }
          }

          if (takenCount === 0) break;

          updatedInventory = newInv;

          const localizedTakenName = localize(takenItemName || realDbId || defId);
          const prefixText = localize("Изъято: / Removed:");
          const msg = `${prefixText} ${localizedTakenName}${takenCount > 1 ? ` x${takenCount}` : ""}`;
          addLog(msg, "INFO");
          if (showToast) showToast(msg);
        }

        const BASE_INVENTORY_CAPACITY = 4;
        const bonusCapacity =
          (updatedEquipment?.helmet?.inventorySlots || 0) +
          (updatedEquipment?.vest?.inventorySlots || 0) +
          (updatedEquipment?.pants?.inventorySlots || 0) +
          (updatedEquipment?.boots?.inventorySlots || 0) +
          (updatedEquipment?.accessory1?.inventorySlots || 0) +
          (updatedEquipment?.accessory2?.inventorySlots || 0);

        const maxCapacity = BASE_INVENTORY_CAPACITY + bonusCapacity;

        const equippedIds = new Set<string>();
        if (updatedEquippedWeapon?.id) equippedIds.add(updatedEquippedWeapon.id);
        Object.values(updatedEquipment).forEach((eqItem: any) => {
          if (eqItem?.id) equippedIds.add(eqItem.id);
        });

        let currentLoad = updatedInventory
          .filter((i) => !equippedIds.has(i.id) && i.type !== 'CASH')
          .reduce((acc, i) => acc + (i.weight !== undefined ? i.weight : 1), 0);

        const droppedItems: any[] = [];
        if (currentLoad > maxCapacity) {
          for (let i = updatedInventory.length - 1; i >= 0; i--) {
            if (currentLoad <= maxCapacity) break;
            const item = updatedInventory[i];
            if (equippedIds.has(item.id) || item.type === 'CASH') continue;

            const itemWeight = item.weight !== undefined ? item.weight : 1;
            droppedItems.push(item);
            updatedInventory.splice(i, 1);
            currentLoad -= itemWeight;
          }
        }

        setPlayer((prev: any) => ({
          ...prev,
          inventory: updatedInventory,
          equippedWeapon: updatedEquippedWeapon,
          equipment: updatedEquipment,
        }));

        if (droppedItems.length > 0) {
          const px = Math.floor(player.pos.x);
          const py = Math.floor(player.pos.y);
          if (setLevelData) {
            setLevelData((prev: any) => {
              if (!prev || !prev.grid || !prev.grid[py] || !prev.grid[py][px]) return prev;
              const newGrid = [...prev.grid];
              const newRow = [...newGrid[py]];
              const existingItems = newRow[px].items || [];
              newRow[px] = { ...newRow[px], items: [...existingItems, ...droppedItems] };
              newGrid[py] = newRow;
              return { ...prev, grid: newGrid };
            });
          }

          const droppedNames = droppedItems.map(i => localize(i.name || i.rawName || i.id)).join(', ');
          const overflowMsg = `${localize("Выпало на землю (не поместилось в инвентарь): / Dropped on the ground (didn't fit in inventory):")} ${droppedNames}`;
          addLog(overflowMsg, "WARNING");
          if (showToast) showToast(overflowMsg);
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
      case "CREATE_COUNTER":
      case "SET_COUNTER": {
        const counterId = String(params.counterId || params.id || params.counter || params.flag || params.name || "").trim();
        if (!counterId) break;
        const val = Number(params.value ?? params.initialValue ?? params.val ?? params.count ?? 0);
        const currentLevelData = latestLevelDataRef.current;
        if (currentLevelData) {
          if (!currentLevelData.scriptCounters) {
            currentLevelData.scriptCounters = {};
          }
          currentLevelData.scriptCounters[counterId] = val;
        }
        setLevelData((prev: any) => {
          return {
            ...prev,
            scriptCounters: {
              ...(prev?.scriptCounters || {}),
              [counterId]: val,
            },
          };
        });
        checkTriggers("ON_COUNTER_VALUE", { counterId, value: val });
        checkTriggers("ON_COUNTER_CHANGE", { counterId, value: val });
        break;
      }
      case "INCREMENT_COUNTER": {
        const counterId = String(params.counterId || params.id || params.counter || params.flag || params.name || "").trim();
        if (!counterId) break;
        const amount = Number(params.amount ?? params.value ?? params.val ?? params.increment ?? params.add ?? params.step ?? params.count ?? 1);
        const currentLevelData = latestLevelDataRef.current;
        const currentVal = Number(currentLevelData?.scriptCounters?.[counterId] ?? 0);
        const newVal = currentVal + amount;

        if (currentLevelData) {
          if (!currentLevelData.scriptCounters) {
            currentLevelData.scriptCounters = {};
          }
          currentLevelData.scriptCounters[counterId] = newVal;
        }

        setLevelData((prev: any) => {
          return {
            ...prev,
            scriptCounters: {
              ...(prev?.scriptCounters || {}),
              [counterId]: newVal,
            },
          };
        });
        checkTriggers("ON_COUNTER_VALUE", { counterId, value: newVal, previousValue: currentVal, amount });
        checkTriggers("ON_COUNTER_CHANGE", { counterId, value: newVal, previousValue: currentVal, amount });
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
      case "END": {
        if (setCinematicMode) {
          setCinematicMode(true);
        }

        const duration =
          params && params.duration !== undefined && params.duration !== ""
            ? Number(params.duration)
            : 2000;

        if (latestSetViewportFadeRef.current && duration > 0) {
          const startTime = performance.now();
          await new Promise<void>((resolve) => {
            const animate = (time: number) => {
              const elapsed = time - startTime;
              const progress = Math.min(1, elapsed / duration);
              if (latestSetViewportFadeRef.current) {
                latestSetViewportFadeRef.current(progress);
              }
              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                resolve();
              }
            };
            requestAnimationFrame(animate);
          });
        } else if (latestSetViewportFadeRef.current) {
          latestSetViewportFadeRef.current(1);
        }

        const delay =
          params && params.delay !== undefined && params.delay !== ""
            ? Number(params.delay)
            : 500;

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (latestStopMusicRef.current) {
          latestStopMusicRef.current({ fadeOutDuration: 0 });
        }
        if (latestStopAllSoundsRef.current) {
          latestStopAllSoundsRef.current();
        }

        if (latestReturnToMenuRef.current) {
          latestReturnToMenuRef.current();
        } else if (setGameState) {
          setGameState(GameState.MENU);
        }

        if (setCinematicMode) {
          setCinematicMode(false);
        }
        break;
      }
    }
  };

  return { checkTriggers };
};
