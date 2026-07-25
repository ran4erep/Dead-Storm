import React from 'react';
import { GameState, Player } from '../types';

export const getInteractiveElements = (
  activeModal?: string | null,
  showSettings?: boolean,
  showPauseMenu?: boolean
): HTMLElement[] => {
  const selector = 'button, [role="button"], .cursor-pointer, input, select, textarea, [tabindex="0"]';
  
  let container: HTMLElement | null = null;
  const accessorySelect = document.getElementById('accessory-select-modal-container');
  const batterySelect = document.getElementById('battery-select-modal-container');
  const c4Timer = document.getElementById('c4-timer-modal-container');
  const dropQty = document.getElementById('drop-qty-modal-container');
  const itemInspect = document.getElementById('item-inspect-modal-container');
  const tutorialConfirm = document.getElementById('tutorial-confirm-container');
  const settingsModal = document.getElementById('settings-modal-container');
  const pauseMenu = document.getElementById('pause-menu-container');
  const tradeModal = document.getElementById('trade-modal-container');
  const keepModal = document.getElementById('keep-modal-container');
  
  if (accessorySelect) {
    container = accessorySelect;
  } else if (batterySelect) {
    container = batterySelect;
  } else if (c4Timer) {
    container = c4Timer;
  } else if (dropQty) {
    container = dropQty;
  } else if (itemInspect) {
    container = itemInspect;
  } else if (tutorialConfirm) {
    container = tutorialConfirm;
  } else if (settingsModal) {
    container = settingsModal;
  } else if (pauseMenu) {
    container = pauseMenu;
  } else if (tradeModal) {
    container = tradeModal;
  } else if (keepModal) {
    container = keepModal;
  } else {
    const gameModalsOverlay = document.getElementById('game-modals-overlay');
    if (gameModalsOverlay) {
      container = gameModalsOverlay;
    } else {
      const saveLevelModal = document.getElementById('save-level-modal-overlay');
      if (saveLevelModal) {
        container = saveLevelModal;
      }
    }
  }
  
  const hasExpectedOverlay = 
    !!activeModal || 
    !!showSettings || 
    !!showPauseMenu || 
    !!tradeModal || 
    !!keepModal ||
    !!accessorySelect ||
    !!batterySelect ||
    !!c4Timer ||
    !!dropQty ||
    !!itemInspect;
  if (hasExpectedOverlay && !container) {
    return [];
  }
  
  const root = container || document;
  const elements = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
  
  const filtered = elements.filter(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Check if element is inside an editor canvas or a dynamic non-navigable zone
    if (el.closest('.no-gamepad-nav')) return false;
    
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    
    if (el.hasAttribute('disabled') || (el as any).disabled) return false;
    
    return true;
  });

  // Prioritize default focus elements, placing them at the top of the candidates array
  const defaultFocusIdx = filtered.findIndex(el => el.getAttribute('data-default-focus') === 'true' || el.id === 'crafting-slot-1');
  if (defaultFocusIdx > 0) {
    const defaultFocusEl = filtered[defaultFocusIdx];
    filtered.splice(defaultFocusIdx, 1);
    filtered.unshift(defaultFocusEl);
  }

  return filtered.map(el => {
    if (!el.hasAttribute('tabindex') && (el.classList.contains('cursor-pointer') || el.classList.contains('active:scale-95') || el.classList.contains('active:scale-[0.98]') || el.getAttribute('onClick') !== null)) {
      el.setAttribute('tabindex', '0');
    }
    return el;
  });
};

const getNextSpatialElement = (direction: 'up' | 'down' | 'left' | 'right', current: HTMLElement, candidates: HTMLElement[]): HTMLElement => {
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;
  
  let bestCandidate: HTMLElement | null = null;
  let minScore = Infinity;
  
  for (const el of candidates) {
    if (el === current) continue;
    
    const rect = el.getBoundingClientRect();
    const candidateCenterX = rect.left + rect.width / 2;
    const candidateCenterY = rect.top + rect.height / 2;
    
    const dx = candidateCenterX - currentCenterX;
    const dy = candidateCenterY - currentCenterY;
    
    let isHeadingInDirection = false;
    
    if (direction === 'up' && dy < -5) isHeadingInDirection = true;
    if (direction === 'down' && dy > 5) isHeadingInDirection = true;
    if (direction === 'left' && dx < -5) isHeadingInDirection = true;
    if (direction === 'right' && dx > 5) isHeadingInDirection = true;
    
    if (!isHeadingInDirection) continue;
    
    let mainAxisDist = 0;
    let crossAxisDist = 0;
    
    if (direction === 'up' || direction === 'down') {
      mainAxisDist = Math.abs(dy);
      crossAxisDist = Math.abs(dx);
    } else {
      mainAxisDist = Math.abs(dx);
      crossAxisDist = Math.abs(dy);
    }
    
    // Favor alignment along the main direction axis, but make sure vertical navigation 
    // doesn't skip secondary horizontal columns/elements
    const crossWeight = (direction === 'up' || direction === 'down') ? 0.25 : 1.5;
    const score = mainAxisDist + crossAxisDist * crossWeight;
    
    if (score < minScore) {
      minScore = score;
      bestCandidate = el;
    }
  }
  
  return bestCandidate || current;
};

const isGamepadInputActive = (gamepad: Gamepad | null, controlVal: string | number | undefined): boolean => {
  if (!gamepad || controlVal === undefined || controlVal === null) return false;
  
  if (typeof controlVal === 'number') {
    return !!gamepad.buttons[controlVal]?.pressed;
  }
  
  if (typeof controlVal === 'string') {
    if (controlVal.startsWith('btn_')) {
      const idx = parseInt(controlVal.slice(4));
      return !!gamepad.buttons[idx]?.pressed;
    }
    if (controlVal.startsWith('axis_')) {
      const parts = controlVal.split('_');
      const axisIdx = parseInt(parts[1]);
      const isNeg = parts[2] === 'neg';
      if (axisIdx >= 0 && axisIdx < gamepad.axes.length) {
        const val = gamepad.axes[axisIdx];
        return isNeg ? (val < -0.5) : (val > 0.5);
      }
    }
  }
  return false;
};

interface GamepadControllerProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  loading: boolean;
  viewportFade: number;
  activeModal: string | null;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showPauseMenu: boolean;
  setShowPauseMenu: (show: boolean) => void;
  player: Player;
  currentMovementSys: any;
  inventorySys: any;
  aimingSys: any;
  throwingSys: any;
  inspectingSys: any;
  handleDialogueInput: (action: string) => void;
  combat: any;
  disableMovement: boolean;
  disableWalking: boolean;
  toggleModal: (modal: any) => void;
  lookAroundAngle: number;
  setLookAroundAngle: React.Dispatch<React.SetStateAction<number>>;
  lookAroundPitch: number;
  setLookAroundPitch: React.Dispatch<React.SetStateAction<number>>;
  handleAimInputWithAnim: (action: any) => void;
  handleThrowInputWithAnim: (action: any) => void;
  handleInspectInputWithAnim: (action: any) => void;
  settings?: any;
  handleInteract?: () => void;
  handleSkipTurn?: () => void;
  handleReload?: () => void;
  handleShoot?: () => void;
  handleToggleLook?: () => void;
}

const isCandidate = (el: HTMLElement | null): boolean => {
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    return !el.hasAttribute('disabled') && !(el as any).disabled;
  }
  if (
    el.getAttribute('role') === 'button' ||
    el.classList.contains('cursor-pointer') ||
    el.classList.contains('active:scale-95') ||
    el.classList.contains('active:scale-[0.98]') ||
    el.getAttribute('tabindex') === '0'
  ) {
    return true;
  }
  return false;
};

export const useGamepadController = ({
  gameState,
  setGameState,
  loading,
  viewportFade,
  activeModal,
  showSettings,
  setShowSettings,
  showPauseMenu,
  setShowPauseMenu,
  player,
  currentMovementSys,
  inventorySys,
  aimingSys,
  throwingSys,
  inspectingSys,
  handleDialogueInput,
  combat,
  disableMovement,
  disableWalking,
  toggleModal,
  setLookAroundAngle,
  setLookAroundPitch,
  handleAimInputWithAnim,
  handleThrowInputWithAnim,
  handleInspectInputWithAnim,
  settings,
  handleInteract,
  handleSkipTurn,
  handleReload,
  handleShoot,
  handleToggleLook,
}: GamepadControllerProps) => {

  const paramsRef = React.useRef({
    gameState,
    setGameState,
    loading,
    viewportFade,
    activeModal,
    showSettings,
    setShowSettings,
    showPauseMenu,
    setShowPauseMenu,
    player,
    currentMovementSys,
    inventorySys,
    aimingSys,
    throwingSys,
    inspectingSys,
    handleDialogueInput,
    combat,
    disableMovement,
    disableWalking,
    toggleModal,
    setLookAroundAngle,
    setLookAroundPitch,
    handleAimInputWithAnim,
    handleThrowInputWithAnim,
    handleInspectInputWithAnim,
    settings,
    handleInteract,
    handleSkipTurn,
    handleReload,
    handleShoot,
    handleToggleLook,
  });

  // Keep references perfectly updated on every render
  paramsRef.current = {
    gameState,
    setGameState,
    loading,
    viewportFade,
    activeModal,
    showSettings,
    setShowSettings,
    showPauseMenu,
    setShowPauseMenu,
    player,
    currentMovementSys,
    inventorySys,
    aimingSys,
    throwingSys,
    inspectingSys,
    handleDialogueInput,
    combat,
    disableMovement,
    disableWalking,
    toggleModal,
    setLookAroundAngle,
    setLookAroundPitch,
    handleAimInputWithAnim,
    handleThrowInputWithAnim,
    handleInspectInputWithAnim,
    settings,
    handleInteract,
    handleSkipTurn,
    handleReload,
    handleShoot,
    handleToggleLook,
  };

  const lastGamepadActionTimeRef = React.useRef<number>(0);
  const buttonAHoldStartRef = React.useRef<number | null>(null);
  const buttonALastRepeatRef = React.useRef<number>(0);
  const prevActiveModalRef = React.useRef<string | null>(null);
  const prevShowSettingsRef = React.useRef<boolean>(false);
  const prevShowPauseMenuRef = React.useRef<boolean>(false);
  const prevTradeOpenRef = React.useRef<boolean>(false);
  const prevKeepOpenRef = React.useRef<boolean>(false);
  const lastTransitionTimeRef = React.useRef<number>(0);
  const gamepadButtonANeedReleaseRef = React.useRef<boolean>(false);
  const gamepadButtonBNeedReleaseRef = React.useRef<boolean>(false);
  const lastGamepadButtonsPressedRef = React.useRef<{ [key: string]: boolean }>({});
  const lastGameplayMoveTimeRef = React.useRef<number>(0);
  const preLookAroundGamepadStateRef = React.useRef<GameState | null>(null);
  const lastFocusedRectRef = React.useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const lastGamepadRawButtonsPressedRef = React.useRef<{ [key: number]: boolean }>({});
  const lastSeenGameStateRef = React.useRef<GameState>(gameState);
  const enteredLookingAroundTimeRef = React.useRef<number>(0);
  const actionNeutralRef = React.useRef<{ [key: string]: boolean }>({
    moveForward: true,
    moveBackward: true,
    turnLeft: true,
    turnRight: true,
    strafeLeft: true,
    strafeRight: true,
    interact: true,
    skipTurn: true,
    reload: true,
    toggleAiming: true,
    sectorDetails: true,
    toggleLook: true,
  });

  const isPlayingGame = ![GameState.START_SCREEN, GameState.MENU, GameState.CREDITS, GameState.EDITOR, GameState.CHAR_SELECT, GameState.VICTORY, GameState.GAME_OVER].includes(gameState);
  const isGamepadNavActive = !isPlayingGame || showSettings || showPauseMenu || !!activeModal;

  React.useEffect(() => {
    if (!isGamepadNavActive) {
      if (typeof document !== 'undefined' && document.activeElement && document.activeElement !== document.body) {
        const activeEl = document.activeElement as HTMLElement;
        if (typeof activeEl.blur === 'function') {
          activeEl.blur();
        }
      }
    }
  }, [isGamepadNavActive]);

  React.useEffect(() => {
    let rafId: number | null = null;

    const navigate = (direction: 'up' | 'down' | 'left' | 'right') => {
      const { activeModal, showSettings, showPauseMenu } = paramsRef.current;
      const candidates = getInteractiveElements(activeModal, showSettings, showPauseMenu);
      const current = document.activeElement as HTMLElement;

      if (candidates.length === 0) return;

      if (!current || current === document.body || !candidates.includes(current)) {
        candidates[0].focus({ preventScroll: true });
        candidates[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      // Special handling for LevelBuilder's category-content area grids
      const levelBuilderCats = document.getElementById('levelbuilder-categories-container');
      const levelBuilderContent = document.getElementById('levelbuilder-content-container');
      if (levelBuilderCats && levelBuilderContent) {
        const isInCats = levelBuilderCats.contains(current);
        const isInContent = levelBuilderContent.contains(current);

        if (isInCats && direction === 'right') {
          // Jump from categories to the first available content cell
          const contentCandidates = Array.from(levelBuilderContent.querySelectorAll('button, [role="button"], [tabindex="0"]')) as HTMLElement[];
          const visibleContent = contentCandidates.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
          });
          if (visibleContent.length > 0) {
            visibleContent[0].focus({ preventScroll: true });
            visibleContent[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
        }

        if (isInContent) {
          const contentCandidates = Array.from(levelBuilderContent.querySelectorAll('button, [role="button"], [tabindex="0"]')) as HTMLElement[];
          const visibleContent = contentCandidates.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
          });

          if (direction === 'left') {
            // Check if we are at the leftmost column inside the content grid to jump back to category list
            const currentRect = current.getBoundingClientRect();
            let isLeftmost = true;
            for (const other of visibleContent) {
              if (other === current) continue;
              const otherRect = other.getBoundingClientRect();
              if (otherRect.left < currentRect.left - 15 && Math.abs(otherRect.top - currentRect.top) < 15) {
                isLeftmost = false;
                break;
              }
            }
            if (isLeftmost) {
              const catCandidates = Array.from(levelBuilderCats.querySelectorAll('button, [tabindex="0"]')) as HTMLElement[];
              if (catCandidates.length > 0) {
                catCandidates[0].focus({ preventScroll: true });
                catCandidates[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
              }
            } else {
              const next = getNextSpatialElement('left', current, visibleContent);
              if (next && next !== current) {
                next.focus({ preventScroll: true });
                next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
              return;
            }
          }

          // Handle generic 2D Grid navigation in LevelBuilder Content Grid manually
          if (direction === 'right') {
            const next = getNextSpatialElement('right', current, visibleContent);
            if (next && next !== current) {
              next.focus({ preventScroll: true });
              next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return;
          }
          if (direction === 'down') {
            const currentRect = current.getBoundingClientRect();
            const idx = visibleContent.indexOf(current);
            let nextEl: HTMLElement | null = null;
            if (idx !== -1) {
              let targetRowTop = Infinity;
              for (let i = idx + 1; i < visibleContent.length; i++) {
                const rect = visibleContent[i].getBoundingClientRect();
                if (rect.top - currentRect.top > 15) {
                  targetRowTop = rect.top;
                  nextEl = visibleContent[i];
                  while (i + 1 < visibleContent.length) {
                    const nextRect = visibleContent[i + 1].getBoundingClientRect();
                    if (Math.abs(nextRect.top - targetRowTop) < 15) {
                      nextEl = visibleContent[i + 1];
                      i++;
                    } else {
                      break;
                    }
                  }
                  break;
                }
              }
              
              if (!nextEl && idx + 1 < visibleContent.length) {
                nextEl = visibleContent[idx + 1];
              }
              
              if (nextEl) {
                nextEl.focus({ preventScroll: true });
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }
            return;
          }
          if (direction === 'up') {
            const currentRect = current.getBoundingClientRect();
            const idx = visibleContent.indexOf(current);
            let nextEl: HTMLElement | null = null;
            if (idx !== -1) {
              let targetRowTop = -Infinity;
              for (let i = idx - 1; i >= 0; i--) {
                const rect = visibleContent[i].getBoundingClientRect();
                if (currentRect.top - rect.top > 15) {
                  targetRowTop = rect.top;
                  nextEl = visibleContent[i];
                  while (i - 1 >= 0) {
                    const prevRect = visibleContent[i - 1].getBoundingClientRect();
                    if (Math.abs(prevRect.top - targetRowTop) < 15) {
                      nextEl = visibleContent[i - 1];
                      i--;
                    } else {
                      break;
                    }
                  }
                  break;
                }
              }
              
              if (!nextEl && idx - 1 >= 0) {
                nextEl = visibleContent[idx - 1];
              }
              
              if (nextEl) {
                nextEl.focus({ preventScroll: true });
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }
            return;
          }
        }
      }

      const next = getNextSpatialElement(direction, current, candidates);
      if (next && next !== current) {
        next.focus({ preventScroll: true });
        next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        const idx = candidates.indexOf(current);
        let nextEl: HTMLElement | null = null;
        if (direction === 'down' || direction === 'right') {
          const nextIdx = (idx + 1) % candidates.length;
          nextEl = candidates[nextIdx];
        } else {
          const prevIdx = (idx - 1 + candidates.length) % candidates.length;
          nextEl = candidates[prevIdx];
        }
        if (nextEl) {
          nextEl.focus({ preventScroll: true });
          nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    const handleGameplayGamepad = (gamepad: Gamepad) => {
      const {
        loading,
        viewportFade,
        activeModal,
        gameState,
        settings,
        disableWalking,
        combat,
        disableMovement,
        player,
        currentMovementSys,
        handleInteract,
        handleSkipTurn,
        handleReload,
        handleShoot,
        handleToggleLook,
        handleDialogueInput,
        setLookAroundAngle,
        setLookAroundPitch,
        handleAimInputWithAnim,
        handleThrowInputWithAnim,
        handleInspectInputWithAnim,
        setGameState,
      } = paramsRef.current;

      if (loading || (viewportFade && viewportFade > 0) || activeModal === 'keypad' || gameState === GameState.CONSOLE_VIEW || gameState === GameState.EDITOR) return;

      const now = performance.now();
      const GAMEPLAY_DEBOUNCE = 220; // 220 ms debounce for comfortable stepped inputs

      // Helper to check controls, ignoring them if that physical button is locked for release
      const isInputActiveWithRelease = (control: any) => {
        if (control === undefined || control === null) return false;
        if (control === 0 || control === 'btn_0') {
          if (gamepadButtonANeedReleaseRef.current) return false;
        }
        if (control === 1 || control === 'btn_1') {
          if (gamepadButtonBNeedReleaseRef.current) return false;
        }
        return isGamepadInputActive(gamepad, control);
      };

      const getGamepadControlValue = (controlVal: any): number => {
        if (!gamepad || controlVal === undefined || controlVal === null) return 0;
        if (controlVal === 0 || controlVal === 'btn_0') {
          if (gamepadButtonANeedReleaseRef.current) return 0;
        }
        if (controlVal === 1 || controlVal === 'btn_1') {
          if (gamepadButtonBNeedReleaseRef.current) return 0;
        }
        
        if (typeof controlVal === 'number') {
          return gamepad.buttons[controlVal]?.pressed ? 1 : 0;
        }
        
        if (typeof controlVal === 'string') {
          if (controlVal.startsWith('btn_')) {
            const idx = parseInt(controlVal.slice(4));
            return gamepad.buttons[idx]?.pressed ? 1 : 0;
          }
          if (controlVal.startsWith('axis_')) {
            const parts = controlVal.split('_');
            const axisIdx = parseInt(parts[1]);
            const isNeg = parts[2] === 'neg';
            if (axisIdx >= 0 && axisIdx < gamepad.axes.length) {
              const val = gamepad.axes[axisIdx];
              if (isNeg) {
                return val < -0.5 ? Math.abs(val) : 0;
              } else {
                return val > 0.5 ? val : 0;
              }
            }
          }
        }
        return 0;
      };

      // 1. Buttons & Axis State Extraction (Xbox standard layout or customized layout)
      const gpControls = settings?.gamepadControls || {
        moveForward: 'axis_1_neg',
        moveBackward: 'axis_1_pos',
        turnLeft: 'axis_0_neg',
        turnRight: 'axis_0_pos',
        strafeLeft: 'btn_4',
        strafeRight: 'btn_5',
        leftContext: 'btn_6',
        rightContext: 'btn_7',
        statsMenu: 14,
        equipMenu: 12,
        inventory: 15,
        pauseMenu: 9,
        interact: 0,
        skipTurn: 2,
        reload: 3,
        toggleAiming: 1,
        sectorDetails: 13,
        toggleLook: 11,
      };

      // Remapped customizable actions
      const forwardVal = getGamepadControlValue(gpControls.moveForward);
      const backwardVal = getGamepadControlValue(gpControls.moveBackward);
      const turnLeftVal = getGamepadControlValue(gpControls.turnLeft);
      const turnRightVal = getGamepadControlValue(gpControls.turnRight);
      const strafeLeftVal = getGamepadControlValue(gpControls.strafeLeft);
      const strafeRightVal = getGamepadControlValue(gpControls.strafeRight);

      const moves = [
        { name: 'forward', val: forwardVal },
        { name: 'backward', val: backwardVal },
        { name: 'turnLeft', val: turnLeftVal },
        { name: 'turnRight', val: turnRightVal },
        { name: 'strafeLeft', val: strafeLeftVal },
        { name: 'strafeRight', val: strafeRightVal },
      ];

      // Sort by value descending. In case of tie, keep natural order of preference
      moves.sort((a, b) => b.val - a.val);

      const dominantMoveName = moves[0].val > 0 ? moves[0].name : null;

      const isMoveForwardActive = dominantMoveName === 'forward';
      const isMoveBackwardActive = dominantMoveName === 'backward';
      const isTurnLeftActive = dominantMoveName === 'turnLeft';
      const isTurnRightActive = dominantMoveName === 'turnRight';
      const isStrafeLeftActive = dominantMoveName === 'strafeLeft';
      const isStrafeRightActive = dominantMoveName === 'strafeRight';

      const isLeftContextActive = isInputActiveWithRelease(gpControls.leftContext);
      const isRightContextActive = isInputActiveWithRelease(gpControls.rightContext);
      const isInteractActive = isInputActiveWithRelease(gpControls.interact !== undefined ? gpControls.interact : 0);
      const isSkipTurnActive = isInputActiveWithRelease(gpControls.skipTurn !== undefined ? gpControls.skipTurn : 2);
      const isReloadActive = isInputActiveWithRelease(gpControls.reload !== undefined ? gpControls.reload : 3);
      const isToggleAimingActive = isInputActiveWithRelease(gpControls.toggleAiming !== undefined ? gpControls.toggleAiming : 1);
      const isSectorDetailsActive = isInputActiveWithRelease(gpControls.sectorDetails !== undefined ? gpControls.sectorDetails : 13);
      const isToggleLookActive = isInputActiveWithRelease(gpControls.toggleLook !== undefined ? gpControls.toggleLook : 11);

      // Reset action neutrals when they are released so they can be triggered again
      if (!isMoveForwardActive) actionNeutralRef.current.moveForward = true;
      if (!isMoveBackwardActive) actionNeutralRef.current.moveBackward = true;
      if (!isTurnLeftActive) actionNeutralRef.current.turnLeft = true;
      if (!isTurnRightActive) actionNeutralRef.current.turnRight = true;
      if (!isStrafeLeftActive) actionNeutralRef.current.strafeLeft = true;
      if (!isStrafeRightActive) actionNeutralRef.current.strafeRight = true;
      if (!isInteractActive) actionNeutralRef.current.interact = true;
      if (!isSkipTurnActive) actionNeutralRef.current.skipTurn = true;
      if (!isReloadActive) actionNeutralRef.current.reload = true;
      if (!isToggleAimingActive) actionNeutralRef.current.toggleAiming = true;
      if (!isSectorDetailsActive) actionNeutralRef.current.sectorDetails = true;
      if (!isToggleLookActive) actionNeutralRef.current.toggleLook = true;

      // Prev Button States
      const prevMoveForward = !!lastGamepadButtonsPressedRef.current['moveForward'];
      const prevMoveBackward = !!lastGamepadButtonsPressedRef.current['moveBackward'];
      const prevTurnLeft = !!lastGamepadButtonsPressedRef.current['turnLeft'];
      const prevTurnRight = !!lastGamepadButtonsPressedRef.current['turnRight'];
      const prevStrafeLeft = !!lastGamepadButtonsPressedRef.current['strafeLeft'];
      const prevStrafeRight = !!lastGamepadButtonsPressedRef.current['strafeRight'];
      const prevLeftContext = !!lastGamepadButtonsPressedRef.current['leftContext'];
      const prevRightContext = !!lastGamepadButtonsPressedRef.current['rightContext'];
      const prevInteract = !!lastGamepadButtonsPressedRef.current['interact'];
      const prevSkipTurn = !!lastGamepadButtonsPressedRef.current['skipTurn'];
      const prevReload = !!lastGamepadButtonsPressedRef.current['reload'];
      const prevToggleAiming = !!lastGamepadButtonsPressedRef.current['toggleAiming'];
      const prevSectorDetails = !!lastGamepadButtonsPressedRef.current['sectorDetails'];
      const prevToggleLook = !!lastGamepadButtonsPressedRef.current['toggleLook'];
      const prevAPressed = !!lastGamepadButtonsPressedRef.current['gameplay_btn_0_special'];
      const prevBPressed = !!lastGamepadButtonsPressedRef.current['gameplay_btn_1_special'];

      // Extract raw standard buttons A (0) and B (1) but apply release checks
      const isAPressed = gamepadButtonANeedReleaseRef.current ? false : !!gamepad.buttons[0]?.pressed;
      const isBPressed = gamepadButtonBNeedReleaseRef.current ? false : !!gamepad.buttons[1]?.pressed;

      // Store current buttons for transition checks
      lastGamepadButtonsPressedRef.current['moveForward'] = isMoveForwardActive;
      lastGamepadButtonsPressedRef.current['moveBackward'] = isMoveBackwardActive;
      lastGamepadButtonsPressedRef.current['turnLeft'] = isTurnLeftActive;
      lastGamepadButtonsPressedRef.current['turnRight'] = isTurnRightActive;
      lastGamepadButtonsPressedRef.current['strafeLeft'] = isStrafeLeftActive;
      lastGamepadButtonsPressedRef.current['strafeRight'] = isStrafeRightActive;
      lastGamepadButtonsPressedRef.current['leftContext'] = isLeftContextActive;
      lastGamepadButtonsPressedRef.current['rightContext'] = isRightContextActive;
      lastGamepadButtonsPressedRef.current['interact'] = isInteractActive;
      lastGamepadButtonsPressedRef.current['skipTurn'] = isSkipTurnActive;
      lastGamepadButtonsPressedRef.current['reload'] = isReloadActive;
      lastGamepadButtonsPressedRef.current['toggleAiming'] = isToggleAimingActive;
      lastGamepadButtonsPressedRef.current['sectorDetails'] = isSectorDetailsActive;
      lastGamepadButtonsPressedRef.current['toggleLook'] = isToggleLookActive;
      lastGamepadButtonsPressedRef.current['gameplay_btn_0_special'] = isAPressed;
      lastGamepadButtonsPressedRef.current['gameplay_btn_1_special'] = isBPressed;

      const isCombatSpecialState = gameState === GameState.AIMING || gameState === GameState.THROWING || gameState === GameState.INSPECTING;

      const isLeftContextCombo = isLeftContextActive || (isAPressed && isCombatSpecialState);
      const prevLeftContextCombo = prevLeftContext || (prevAPressed && isCombatSpecialState);

      const isRightContextCombo = isRightContextActive || (isBPressed && isCombatSpecialState);
      const prevRightContextCombo = prevRightContext || (prevBPressed && isCombatSpecialState);

      // Enable gamepad-navigation mode when any gameplay buttons are pressed
      if (isMoveForwardActive || isMoveBackwardActive || isTurnLeftActive || isTurnRightActive || 
          isStrafeLeftActive || isStrafeRightActive || isLeftContextActive || isRightContextActive ||
          isInteractActive || isSkipTurnActive || isReloadActive || isToggleAimingActive || isSectorDetailsActive ||
          isAPressed || isBPressed) {
        if (!document.body.classList.contains('gamepad-navigation-active')) {
          document.body.classList.add('gamepad-navigation-active');
        }
      }

      // 2. Continuous Analog Looking Around (Any stick can rotate the camera)
      if (gameState === GameState.LOOKING_AROUND) {
        let rx = 0;
        let ry = 0;
        
        // Right stick (axes 2 and 3)
        if (gamepad.axes.length >= 4) {
          const rStickX = gamepad.axes[2];
          const rStickY = gamepad.axes[3];
          if (Math.abs(rStickX) > 0.08) rx = rStickX;
          if (Math.abs(rStickY) > 0.08) ry = rStickY;
        }
        
        // Left stick (axes 0 and 1)
        if (gamepad.axes.length >= 2) {
          const lStickX = gamepad.axes[0];
          const lStickY = gamepad.axes[1];
          if (Math.abs(lStickX) > 0.08 && Math.abs(lStickX) > Math.abs(rx)) rx = lStickX;
          if (Math.abs(lStickY) > 0.08 && Math.abs(lStickY) > Math.abs(ry)) ry = lStickY;
        }

        if (Math.abs(rx) > 0.08) {
          setLookAroundAngle(prev => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + rx * 0.04)));
        }
        if (Math.abs(ry) > 0.08) {
          setLookAroundPitch(prev => Math.max(-1, Math.min(0.5, prev - ry * 0.04)));
        }
      }

      // Helper to activate UI buttons hover-feedback visually
      const triggerBtnVisual = (btnId: string, isDown: boolean) => {
        const btn = document.getElementById(btnId);
        if (btn) {
          if (isDown) {
            btn.style.transform = 'scale(0.95)';
            btn.style.filter = 'brightness(0.8)';
          } else {
            btn.style.transform = '';
            btn.style.filter = '';
          }
        }
      };

      // 3. Trigger / Transition Press Actions for Context Buttons
      // leftContext (maps to Action/Interact/Accept Button)
      const isInverted = !!settings?.invertContextButtons;

      if (isLeftContextCombo && !prevLeftContextCombo) {
        const isLeftTriggerPressed = isLeftContextActive && !prevLeftContext;
        const isAPressedJustNow = isAPressed && !prevAPressed && isCombatSpecialState;

        let actsAsAttack = false;
        let actsAsCancel = false;

        if (isAPressedJustNow) {
          actsAsAttack = true; // Button A always acts as Attack/Confirm
        } else if (isLeftTriggerPressed) {
          if (isInverted) {
            actsAsCancel = true; // Inverted: Left Trigger acts as Cancel
          } else {
            actsAsAttack = true; // Normal: Left Trigger acts as Attack
          }
        } else {
          actsAsAttack = !isInverted;
          actsAsCancel = isInverted;
        }

        if (actsAsAttack) {
          triggerBtnVisual(isInverted ? 'combat-right-btn' : 'combat-left-btn', true);
          if (gameState === GameState.AIMING) {
            handleAimInputWithAnim('ATTACK');
          } else if (gameState === GameState.THROWING) {
            handleThrowInputWithAnim('ATTACK');
          } else if (gameState === GameState.INSPECTING) {
            handleInspectInputWithAnim('SELECT');
          } else if (gameState === GameState.DIALOGUE) {
            handleDialogueInput('CONFIRM');
          }

          if (!disableWalking && combat.isActive) {
            const combatBtn = document.getElementById(isInverted ? 'combat-right-btn' : 'combat-left-btn');
            if (combatBtn && !combatBtn.hasAttribute('disabled')) {
              const downEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
              combatBtn.dispatchEvent(downEvent);
            }
          }
          window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: isInverted ? 'right' : 'left', state: 'down' } }));

        } else if (actsAsCancel) {
          triggerBtnVisual(isInverted ? 'combat-left-btn' : 'combat-right-btn', true);
          if (gameState === GameState.AIMING) {
            handleAimInputWithAnim('CANCEL');
          } else if (gameState === GameState.THROWING) {
            handleThrowInputWithAnim('CANCEL');
          } else if (gameState === GameState.INSPECTING) {
            handleInspectInputWithAnim('CANCEL');
          } else if (gameState === GameState.DIALOGUE) {
            window.dispatchEvent(new CustomEvent('gamepad-dialogue-cancel'));
          }

          if (!disableWalking && combat.isActive) {
            const combatBtn = document.getElementById(isInverted ? 'combat-left-btn' : 'combat-right-btn');
            if (combatBtn && !combatBtn.hasAttribute('disabled')) {
              const downEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
              combatBtn.dispatchEvent(downEvent);
            }
          }
          window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: isInverted ? 'left' : 'right', state: 'down' } }));
        }

      } else if (!isLeftContextCombo && prevLeftContextCombo) {
        triggerBtnVisual('combat-left-btn', false);
        triggerBtnVisual('combat-right-btn', false);
        window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'left', state: 'up' } }));
        window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'right', state: 'up' } }));
        
        if (combat.isActive) {
          const btnL = document.getElementById('combat-left-btn');
          if (btnL) {
            btnL.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
            btnL.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, cancelable: true }));
          }
          const btnR = document.getElementById('combat-right-btn');
          if (btnR) {
            btnR.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
            btnR.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, cancelable: true }));
          }
        }
      }

      // rightContext (maps to Look/Cancel/Back Button)
      if (isRightContextCombo && !prevRightContextCombo) {
        const isCombatAction = gameState === GameState.AIMING || gameState === GameState.THROWING || gameState === GameState.INSPECTING || combat.isActive;
        if (isCombatAction) {
          const isRightTriggerPressed = isRightContextActive && !prevRightContext;
          const isBPressedJustNow = isBPressed && !prevBPressed && isCombatSpecialState;

          let actsAsAttack = false;
          let actsAsCancel = false;

          if (isBPressedJustNow) {
            actsAsCancel = true; // Button B always acts as Cancel
          } else if (isRightTriggerPressed) {
            if (isInverted) {
              actsAsAttack = true; // Inverted: Right Trigger acts as Attack
            } else {
              actsAsCancel = true; // Normal: Right Trigger acts as Cancel
            }
          } else {
            actsAsAttack = isInverted;
            actsAsCancel = !isInverted;
          }

          if (actsAsAttack) {
            triggerBtnVisual(isInverted ? 'combat-right-btn' : 'combat-left-btn', true);
            if (gameState === GameState.AIMING) {
              handleAimInputWithAnim('ATTACK');
            } else if (gameState === GameState.THROWING) {
              handleThrowInputWithAnim('ATTACK');
            } else if (gameState === GameState.INSPECTING) {
              handleInspectInputWithAnim('SELECT');
            } else if (gameState === GameState.DIALOGUE) {
              handleDialogueInput('CONFIRM');
            }

            if (!disableWalking && combat.isActive) {
              const combatBtn = document.getElementById(isInverted ? 'combat-right-btn' : 'combat-left-btn');
              if (combatBtn && !combatBtn.hasAttribute('disabled')) {
                const downEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
                combatBtn.dispatchEvent(downEvent);
              }
            }
            window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: isInverted ? 'right' : 'left', state: 'down' } }));
          } else if (actsAsCancel) {
            triggerBtnVisual(isInverted ? 'combat-left-btn' : 'combat-right-btn', true);
            if (gameState === GameState.AIMING) handleAimInputWithAnim('CANCEL');
            else if (gameState === GameState.THROWING) handleThrowInputWithAnim('CANCEL');
            else if (gameState === GameState.INSPECTING) handleInspectInputWithAnim('CANCEL');
            else if (gameState === GameState.DIALOGUE) window.dispatchEvent(new CustomEvent('gamepad-dialogue-cancel'));
            
            if (!disableWalking && combat.isActive) {
              const combatBtn = document.getElementById(isInverted ? 'combat-left-btn' : 'combat-right-btn');
              if (combatBtn && !combatBtn.hasAttribute('disabled')) {
                const downEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
                combatBtn.dispatchEvent(downEvent);
              }
            }
            window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: isInverted ? 'left' : 'right', state: 'down' } }));
          }
        } else if (gameState === GameState.LOOKING_AROUND) {
          setLookAroundAngle(0);
          setLookAroundPitch(0);
          setGameState(GameState.PLAYING);
        } else {
          preLookAroundGamepadStateRef.current = gameState;
          setGameState(GameState.LOOKING_AROUND);
          setLookAroundAngle(0);
          setLookAroundPitch(0);
        }
      } else if (!isRightContextCombo && prevRightContextCombo) {
        triggerBtnVisual('combat-left-btn', false);
        triggerBtnVisual('combat-right-btn', false);
        window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'left', state: 'up' } }));
        window.dispatchEvent(new CustomEvent('viewport-btn', { detail: { btn: 'right', state: 'up' } }));

        if (gameState === GameState.LOOKING_AROUND && preLookAroundGamepadStateRef.current) {
          setLookAroundAngle(0);
          setLookAroundPitch(0);
          setGameState(preLookAroundGamepadStateRef.current);
          preLookAroundGamepadStateRef.current = null;
        }
      }

      // Dialogue State Option Selection (handled completely outside movement input check)
      if (gameState === GameState.DIALOGUE) {
        const dpadUp = !!gamepad.buttons[12]?.pressed;
        const dpadDown = !!gamepad.buttons[13]?.pressed;
        const leftStickY = gamepad.axes.length >= 2 ? gamepad.axes[1] : 0;
        const stickUp = leftStickY < -0.5;
        const stickDown = leftStickY > 0.5;

        const upActive = dpadUp || stickUp || isMoveForwardActive;
        const downActive = dpadDown || stickDown || isMoveBackwardActive;

        if ((upActive || downActive) && now - lastGameplayMoveTimeRef.current > GAMEPLAY_DEBOUNCE) {
          if (upActive) {
            handleDialogueInput('UP');
          } else if (downActive) {
            handleDialogueInput('DOWN');
          }
          lastGameplayMoveTimeRef.current = now;
        }

        const isAJustPressed = isAPressed && !prevAPressed;
        const isInteractJustPressed = isInteractActive && !prevInteract;
        const isLeftContextJustPressed = isLeftContextActive && !prevLeftContext;

        const isBJustPressed = isBPressed && !prevBPressed;
        const isRightContextJustPressed = isRightContextActive && !prevRightContext;

        const leftContextJustPressedMapped = isInverted 
          ? (isRightContextActive && !prevRightContext)
          : (isLeftContextActive && !prevLeftContext);

        const rightContextJustPressedMapped = isInverted 
          ? (isLeftContextActive && !prevLeftContext)
          : (isRightContextActive && !prevRightContext);

        if (isAJustPressed || isInteractJustPressed || leftContextJustPressedMapped) {
          handleDialogueInput('CONFIRM');
        }
        if (isBJustPressed || rightContextJustPressedMapped) {
          window.dispatchEvent(new CustomEvent('gamepad-dialogue-cancel'));
        }
        return;
      }

      // 4. Repeated Input Support for Sub-menus selection (aiming lists fallback to analogs for perfect accessibility)
      const hasMovementInput = isMoveForwardActive || isMoveBackwardActive || isTurnLeftActive || isTurnRightActive || isStrafeLeftActive || isStrafeRightActive;

      if (hasMovementInput && now - lastGameplayMoveTimeRef.current > GAMEPLAY_DEBOUNCE) {

        // Aiming Target Selection
        if (gameState === GameState.AIMING) {
          if (isToggleAimingActive && actionNeutralRef.current.toggleAiming) {
            handleAimInputWithAnim('CANCEL');
            actionNeutralRef.current.toggleAiming = false;
            lastGameplayMoveTimeRef.current = now;
            return;
          }
          if (isTurnLeftActive || isStrafeLeftActive) {
            handleAimInputWithAnim('PREV');
            lastGameplayMoveTimeRef.current = now;
          } else if (isTurnRightActive || isStrafeRightActive) {
            handleAimInputWithAnim('NEXT');
            lastGameplayMoveTimeRef.current = now;
          }
          return;
        }

        // Throwing Position Selection
        if (gameState === GameState.THROWING) {
          if (isMoveForwardActive) {
            handleThrowInputWithAnim('UP');
            lastGameplayMoveTimeRef.current = now;
          } else if (isMoveBackwardActive) {
            handleThrowInputWithAnim('DOWN');
            lastGameplayMoveTimeRef.current = now;
          } else if (isTurnLeftActive || isStrafeLeftActive) {
            handleThrowInputWithAnim('LEFT');
            lastGameplayMoveTimeRef.current = now;
          } else if (isTurnRightActive || isStrafeRightActive) {
            handleThrowInputWithAnim('RIGHT');
            lastGameplayMoveTimeRef.current = now;
          }
          return;
        }

        // Inspecting Option Selection
        if (gameState === GameState.INSPECTING) {
          if (isTurnLeftActive || isStrafeLeftActive) {
            handleInspectInputWithAnim('PREV');
            lastGameplayMoveTimeRef.current = now;
          } else if (isTurnRightActive || isStrafeRightActive) {
            handleInspectInputWithAnim('NEXT');
            lastGameplayMoveTimeRef.current = now;
          }
          return;
        }
      }

      // 5. Gameplay Roaming/Combat Movement & Turning (strictly remapped controls)
      if (!disableMovement && (gameState === GameState.PLAYING || gameState === GameState.MAP_VIEW || gameState === GameState.RADIO_VIEW || gameState === GameState.COMBAT)) {
        const d = Math.round(player.dir);
        let acted = false;

        if (isMoveForwardActive && actionNeutralRef.current.moveForward && !disableWalking) {
          // Forward
          currentMovementSys.movePlayer([0, 1, 0, -1][d], [-1, 0, 1, 0][d]);
          actionNeutralRef.current.moveForward = false;
          acted = true;
        } else if (isMoveBackwardActive && actionNeutralRef.current.moveBackward && !disableWalking) {
          // Backward
          currentMovementSys.movePlayer([0, -1, 0, 1][d], [1, 0, -1, 0][d]);
          actionNeutralRef.current.moveBackward = false;
          acted = true;
        }

        if (isTurnLeftActive && actionNeutralRef.current.turnLeft) {
          // Turn Left
          currentMovementSys.turnPlayer(false);
          actionNeutralRef.current.turnLeft = false;
          acted = true;
        } else if (isTurnRightActive && actionNeutralRef.current.turnRight) {
          // Turn Right
          currentMovementSys.turnPlayer(true);
          actionNeutralRef.current.turnRight = false;
          acted = true;
        }

        if (isStrafeLeftActive && actionNeutralRef.current.strafeLeft && !disableWalking) {
          // Strafe Left
          currentMovementSys.movePlayer([-1, 0, 1, 0][d], [0, -1, 0, 1][d]);
          actionNeutralRef.current.strafeLeft = false;
          acted = true;
        } else if (isStrafeRightActive && actionNeutralRef.current.strafeRight && !disableWalking) {
          // Strafe Right
          currentMovementSys.movePlayer([1, 0, -1, 0][d], [0, 1, 0, -1][d]);
          actionNeutralRef.current.strafeRight = false;
          acted = true;
        }

        if (isInteractActive && actionNeutralRef.current.interact && !disableWalking && handleInteract) {
          handleInteract();
          actionNeutralRef.current.interact = false;
          acted = true;
        } else if (isSkipTurnActive && actionNeutralRef.current.skipTurn && !disableWalking && handleSkipTurn) {
          if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
            handleSkipTurn();
            actionNeutralRef.current.skipTurn = false;
            acted = true;
          }
        } else if (isReloadActive && actionNeutralRef.current.reload && !disableWalking && handleReload) {
          if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
            handleReload();
            actionNeutralRef.current.reload = false;
            acted = true;
          }
        } else if (isToggleAimingActive && actionNeutralRef.current.toggleAiming && !activeModal && !disableWalking && handleShoot) {
          if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && gameState !== GameState.COMBAT) {
            handleShoot();
            actionNeutralRef.current.toggleAiming = false;
            acted = true;
          }
        } else if (isToggleLookActive && actionNeutralRef.current.toggleLook && !activeModal && !disableWalking && handleToggleLook) {
          if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW && gameState !== GameState.COMBAT) {
            handleToggleLook();
            actionNeutralRef.current.toggleLook = false;
            acted = true;
          }
        }

        if (acted) {
          lastGameplayMoveTimeRef.current = now;
        }
      }
    };

    const checkGamepad = () => {
      const {
        gameState,
        activeModal,
        showSettings,
        showPauseMenu,
        settings,
        setShowSettings,
        setShowPauseMenu,
        toggleModal,
        setGameState,
        setLookAroundAngle,
        setLookAroundPitch,
      } = paramsRef.current;

      const gamepads = navigator.getGamepads();
      let activeGamepad = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          activeGamepad = gamepads[i];
          break;
        }
      }

      if (!activeGamepad) {
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      // If we are playing the console snake game, block all default gamepad actions and let ConsoleOverlay handle it
      if (gameState === GameState.CONSOLE_VIEW) {
        for (let i = 0; i < activeGamepad.buttons.length; i++) {
          lastGamepadRawButtonsPressedRef.current[i] = !!activeGamepad.buttons[i]?.pressed;
        }
        lastSeenGameStateRef.current = gameState;
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      const now = performance.now();

      const isTradeOpen = typeof document !== 'undefined' && !!document.getElementById('trade-modal-container');
      const isKeepOpen = typeof document !== 'undefined' && !!document.getElementById('keep-modal-container');

      // Track state/modal change to prevent button press carry-over
      const stateOrModalChanged = 
        gameState !== lastSeenGameStateRef.current ||
        activeModal !== prevActiveModalRef.current ||
        showSettings !== prevShowSettingsRef.current ||
        showPauseMenu !== prevShowPauseMenuRef.current ||
        isTradeOpen !== prevTradeOpenRef.current ||
        isKeepOpen !== prevKeepOpenRef.current;

      if (stateOrModalChanged) {
        if (activeGamepad.buttons[0]?.pressed) {
          gamepadButtonANeedReleaseRef.current = true;
        }
        if (activeGamepad.buttons[1]?.pressed) {
          gamepadButtonBNeedReleaseRef.current = true;
        }
        prevActiveModalRef.current = activeModal;
        prevShowSettingsRef.current = showSettings;
        prevShowPauseMenuRef.current = showPauseMenu;
        prevTradeOpenRef.current = isTradeOpen;
        prevKeepOpenRef.current = isKeepOpen;
        lastTransitionTimeRef.current = now;
        lastFocusedRectRef.current = null;
      }

      // Track and resolve physical button A and B release states early so it works for pure gameplay too
      if (gamepadButtonANeedReleaseRef.current) {
        if (!activeGamepad.buttons[0]?.pressed) {
          gamepadButtonANeedReleaseRef.current = false;
        }
      }
      if (gamepadButtonBNeedReleaseRef.current) {
        if (!activeGamepad.buttons[1]?.pressed) {
          gamepadButtonBNeedReleaseRef.current = false;
        }
      }

      // Track when we enter looking around mode
      if (gameState === GameState.LOOKING_AROUND && lastSeenGameStateRef.current !== GameState.LOOKING_AROUND) {
        enteredLookingAroundTimeRef.current = now;
      }
      lastSeenGameStateRef.current = gameState;

      // Check if any button was newly pressed to exit LOOKING_AROUND mode
      let anyButtonNewlyPressed = false;
      if (gameState === GameState.LOOKING_AROUND && (now - enteredLookingAroundTimeRef.current > 150)) {
        for (let i = 0; i < activeGamepad.buttons.length; i++) {
          const isPressed = !!activeGamepad.buttons[i]?.pressed;
          const wasPressed = !!lastGamepadRawButtonsPressedRef.current[i];
          if (isPressed && !wasPressed) {
            anyButtonNewlyPressed = true;
          }
        }
      }

      // Update basic raw button states for next frame comparison
      for (let i = 0; i < activeGamepad.buttons.length; i++) {
        lastGamepadRawButtonsPressedRef.current[i] = !!activeGamepad.buttons[i]?.pressed;
      }

      // If a button is newly pressed, exit the LOOKING_AROUND mode
      if (anyButtonNewlyPressed) {
        setLookAroundAngle(0);
        setLookAroundPitch(0);
        if (preLookAroundGamepadStateRef.current) {
          setGameState(preLookAroundGamepadStateRef.current);
          preLookAroundGamepadStateRef.current = null;
        } else {
          setGameState(GameState.PLAYING);
        }

        // To prevent actions from executing, mark all pressed buttons as already pressed
        // and deactivate action neutrals until they are physically released.
        const gpControls = settings?.gamepadControls || {
          moveForward: 'axis_1_neg',
          moveBackward: 'axis_1_pos',
          turnLeft: 'axis_0_neg',
          turnRight: 'axis_0_pos',
          strafeLeft: 'btn_4',
          strafeRight: 'btn_5',
          leftContext: 'btn_6',
          rightContext: 'btn_7',
          statsMenu: 14,
          equipMenu: 12,
          inventory: 15,
          pauseMenu: 9,
          interact: 0,
          skipTurn: 2,
          reload: 3,
          toggleAiming: 1,
          sectorDetails: 13,
          toggleLook: 11,
        };

        const keys = [
          'moveForward', 'moveBackward', 'turnLeft', 'turnRight', 'strafeLeft', 'strafeRight',
          'leftContext', 'rightContext', 'interact', 'skipTurn', 'reload', 'toggleAiming', 'sectorDetails',
          'inventory', 'statsMenu', 'equipMenu', 'pauseMenu', 'toggleLook'
        ] as const;

        keys.forEach(key => {
          const control = gpControls[key];
          if (control !== undefined) {
            const isActive = isGamepadInputActive(activeGamepad, control);
            lastGamepadButtonsPressedRef.current[key] = isActive;
            if (isActive && key in actionNeutralRef.current) {
              actionNeutralRef.current[key as any] = false;
            }
          }
        });

        // Also update the raw buttons pressed reference
        for (let i = 0; i < activeGamepad.buttons.length; i++) {
          lastGamepadRawButtonsPressedRef.current[i] = !!activeGamepad.buttons[i]?.pressed;
        }

        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      // State and modal transitions are handled at the top of checkGamepad() for better responsiveness

      if ((window as any).isRemappingControls || document.querySelector('[data-remapping="true"]')) {
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      if ((window as any).gamepadNeedsRelease) {
        let allNeutral = true;
        for (let i = 0; i < activeGamepad.buttons.length; i++) {
          if (activeGamepad.buttons[i]?.pressed) {
            allNeutral = false;
            break;
          }
        }
        if (allNeutral) {
          for (let i = 0; i < activeGamepad.axes.length; i++) {
            if (Math.abs(activeGamepad.axes[i]) > 0.15) {
              allNeutral = false;
              break;
            }
          }
        }
        const elapsedSinceRemap = Date.now() - ((window as any).lastRemapTime || 0);
        if (allNeutral || elapsedSinceRemap > 1200) {
          (window as any).gamepadNeedsRelease = false;
        } else {
          rafId = requestAnimationFrame(checkGamepad);
          return;
        }
      }

      const lastRemap = (window as any).lastRemapTime || 0;
      if (Date.now() - lastRemap < 400) {
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      // Check menu/pause triggers
      const gpControls = settings?.gamepadControls || {
        moveForward: 'axis_1_neg',
        moveBackward: 'axis_1_pos',
        turnLeft: 'axis_0_neg',
        turnRight: 'axis_0_pos',
        strafeLeft: 'btn_4',
        strafeRight: 'btn_5',
        leftContext: 'btn_6',
        rightContext: 'btn_7',
        statsMenu: 14,
        equipMenu: 12,
        inventory: 15,
        pauseMenu: 9,
        interact: 0,
        skipTurn: 2,
        reload: 3,
        toggleAiming: 1,
        sectorDetails: 13,
        toggleLook: 11,
      };

      const isInventoryPressed = isGamepadInputActive(activeGamepad, gpControls.inventory);
      const isStatsMenuPressed = isGamepadInputActive(activeGamepad, gpControls.statsMenu);
      const isEquipMenuPressed = isGamepadInputActive(activeGamepad, gpControls.equipMenu);
      const isPauseMenuPressed = isGamepadInputActive(activeGamepad, gpControls.pauseMenu);
      const isSectorDetailsPressed = isGamepadInputActive(activeGamepad, gpControls.sectorDetails !== undefined ? gpControls.sectorDetails : 13);

      const prevInventoryPressed = !!lastGamepadButtonsPressedRef.current['inventory'];
      const prevStatsMenuPressed = !!lastGamepadButtonsPressedRef.current['statsMenu'];
      const prevEquipMenuPressed = !!lastGamepadButtonsPressedRef.current['equipMenu'];
      const prevPauseMenuPressed = !!lastGamepadButtonsPressedRef.current['pauseMenu'];
      const prevSectorDetailsPressed = !!lastGamepadButtonsPressedRef.current['sectorDetails'];

      lastGamepadButtonsPressedRef.current['inventory'] = isInventoryPressed;
      lastGamepadButtonsPressedRef.current['statsMenu'] = isStatsMenuPressed;
      lastGamepadButtonsPressedRef.current['equipMenu'] = isEquipMenuPressed;
      lastGamepadButtonsPressedRef.current['pauseMenu'] = isPauseMenuPressed;
      lastGamepadButtonsPressedRef.current['sectorDetails'] = isSectorDetailsPressed;

      let handledToggle = false;

      // Only allow toggling if we're in the game (not on start screen, main menu, credits, level editor, etc.)
      const isAllowedToToggle = gameState !== GameState.START_SCREEN && 
                                gameState !== GameState.MENU && 
                                gameState !== GameState.CHAR_SELECT && 
                                gameState !== GameState.CREDITS && 
                                gameState !== GameState.EDITOR &&
                                gameState !== GameState.VICTORY &&
                                gameState !== GameState.GAME_OVER;

      if (isAllowedToToggle) {
        if (isPauseMenuPressed && !prevPauseMenuPressed) {
          if (showSettings) {
            setShowSettings(false);
            handledToggle = true;
          } else if (showPauseMenu) {
            setShowPauseMenu(false);
            handledToggle = true;
          } else if (activeModal) {
            toggleModal(null);
            handledToggle = true;
          } else {
            setShowPauseMenu(true);
            handledToggle = true;
          }
        } else if (!activeModal) {
          if (isInventoryPressed && !prevInventoryPressed) {
            if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
              toggleModal('inventory');
              handledToggle = true;
            }
          } else if (isStatsMenuPressed && !prevStatsMenuPressed) {
            if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
              toggleModal('stats');
              handledToggle = true;
            }
          } else if (isEquipMenuPressed && !prevEquipMenuPressed) {
            if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
              toggleModal('equipment');
              handledToggle = true;
            }
          } else if (isSectorDetailsPressed && !prevSectorDetailsPressed) {
            if (gameState !== GameState.MAP_VIEW && gameState !== GameState.RADIO_VIEW) {
              toggleModal('location');
              handledToggle = true;
            }
          }
        }
      }

      if (handledToggle) {
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      // Tab switching for Trade and Keep modals via L1/R1
      const gpLB = !!activeGamepad.buttons[4]?.pressed;
      const gpRB = !!activeGamepad.buttons[5]?.pressed;
      const prevLB = !!lastGamepadButtonsPressedRef.current['btn_LB_special'];
      const prevRB = !!lastGamepadButtonsPressedRef.current['btn_RB_special'];
      lastGamepadButtonsPressedRef.current['btn_LB_special'] = gpLB;
      lastGamepadButtonsPressedRef.current['btn_RB_special'] = gpRB;

      if (isTradeOpen) {
        if (gpLB && !prevLB) {
          window.dispatchEvent(new CustomEvent('gamepad-trade-tab-switch', { detail: { tab: 'buy' } }));
        } else if (gpRB && !prevRB) {
          window.dispatchEvent(new CustomEvent('gamepad-trade-tab-switch', { detail: { tab: 'sell' } }));
        }
      } else if (isKeepOpen) {
        if (gpLB && !prevLB) {
          window.dispatchEvent(new CustomEvent('gamepad-keep-tab-switch', { detail: { tab: 'retrieve' } }));
        } else if (gpRB && !prevRB) {
          window.dispatchEvent(new CustomEvent('gamepad-keep-tab-switch', { detail: { tab: 'deposit' } }));
        }
      }

      // Handle button X (button index 2) press for Trade/Keep/Crafting action
      const gpX = !!activeGamepad.buttons[2]?.pressed;
      const prevX = !!lastGamepadButtonsPressedRef.current['btn_X_special'];
      lastGamepadButtonsPressedRef.current['btn_X_special'] = gpX;
      
      if (gpX && !prevX) {
        if (isTradeOpen) {
          window.dispatchEvent(new CustomEvent('gamepad-trade-x-press'));
        } else if (isKeepOpen) {
          window.dispatchEvent(new CustomEvent('gamepad-keep-x-press'));
        } else if (activeModal === 'crafting') {
          window.dispatchEvent(new CustomEvent('gamepad-crafting-x-press'));
        }
      }

      // Handle button Y (button index 3) press for Crafting action
      const gpY = !!activeGamepad.buttons[3]?.pressed;
      const prevY = !!lastGamepadButtonsPressedRef.current['btn_Y_special'];
      lastGamepadButtonsPressedRef.current['btn_Y_special'] = gpY;

      if (gpY && !prevY) {
        if (activeModal === 'crafting') {
          window.dispatchEvent(new CustomEvent('gamepad-crafting-y-press'));
        }
      }

      const isPlayingGameDynamic = ![GameState.START_SCREEN, GameState.MENU, GameState.CREDITS, GameState.EDITOR, GameState.CHAR_SELECT, GameState.VICTORY, GameState.GAME_OVER].includes(gameState);
      const isGamepadNavActiveDynamic = !isPlayingGameDynamic || showSettings || showPauseMenu || !!activeModal;
      const effectiveIsGamepadNavActive = isGamepadNavActiveDynamic || isTradeOpen || isKeepOpen;

      if (!effectiveIsGamepadNavActive) {
        handleGameplayGamepad(activeGamepad);
        rafId = requestAnimationFrame(checkGamepad);
        return;
      }

      const currentElement = document.activeElement as HTMLElement;
      
      // Update last active candidate position if currently focused (using ultra-fast checks instead of fetching all candidate DOM nodes)
      if (isCandidate(currentElement)) {
        const r = currentElement.getBoundingClientRect();
        lastFocusedRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
      }

      // Auto-focus geometrically closest or first element if focus is entirely lost/cleared
      const isTransitioning = (performance.now() - lastTransitionTimeRef.current) < 200;
      const isFocusLost = !isTransitioning && (!currentElement || currentElement === document.body || !isCandidate(currentElement));

      if (isFocusLost) {
        const candidates = getInteractiveElements(activeModal, showSettings, showPauseMenu);
        if (candidates.length > 0) {
          let targetElement = candidates[0];
          if (lastFocusedRectRef.current) {
            const lastRect = lastFocusedRectRef.current;
            const lastCenterX = lastRect.left + lastRect.width / 2;
            const lastCenterY = lastRect.top + lastRect.height / 2;
            let minDistance = Infinity;

            for (const cand of candidates) {
              const candRect = cand.getBoundingClientRect();
              const candCenterX = candRect.left + candRect.width / 2;
              const candCenterY = candRect.top + candRect.height / 2;
              const dist = Math.pow(candCenterX - lastCenterX, 2) + Math.pow(candCenterY - lastCenterY, 2);
              if (dist < minDistance) {
                minDistance = dist;
                targetElement = cand;
              }
            }
          }
          targetElement.focus({ preventScroll: true });
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      const DEBOUNCE_TIME = 180;

      // Extract raw input states
      const rawDpadUp = !!activeGamepad.buttons[12]?.pressed;
      const rawDpadDown = !!activeGamepad.buttons[13]?.pressed;
      const rawStickY = activeGamepad.axes[1];

      // Exceptions: Continuous Left Stick / D-pad vertical scrolling inside Achievements container
      let achievementsScrolled = false;
      const hasVerticalInput = rawDpadUp || rawDpadDown || Math.abs(rawStickY) > 0.15;

      if (hasVerticalInput) {
        const achievementsContainer = document.getElementById('achievements-scroll-container');
        const isAchievementsVisible = achievementsContainer && achievementsContainer.getBoundingClientRect().height > 0;

        if (isAchievementsVisible && achievementsContainer) {
          let scrollAmount = 0;
          if (Math.abs(rawStickY) > 0.15) {
            scrollAmount = rawStickY * 26; // Continuous analog vertical scroll (pleasant speed)
            achievementsScrolled = true;
          } else if (rawDpadDown) {
            scrollAmount = 15; // Constant frame-rate scroll
            achievementsScrolled = true;
          } else if (rawDpadUp) {
            scrollAmount = -15; // Constant frame-rate scroll
            achievementsScrolled = true;
          }

          if (scrollAmount !== 0) {
            const originalScrollBehavior = achievementsContainer.style.scrollBehavior;
            achievementsContainer.style.scrollBehavior = 'auto';
            achievementsContainer.scrollTop += scrollAmount;
            achievementsContainer.style.scrollBehavior = originalScrollBehavior;
          }
        }
      }

      // Continuous Right Stick Scrolling (for all other scrollable containers on the screen)
      const rightStickY = activeGamepad.axes[3];
      const rightStickX = activeGamepad.axes[2];
      const hasRightStickY = Math.abs(rightStickY) > 0.15;
      const hasRightStickX = Math.abs(rightStickX) > 0.15;

      if (hasRightStickY || hasRightStickX) {
        // Query potential scrollable elements
        const divs = Array.from(document.querySelectorAll('div, section, aside, main, pre, ul, ol')) as HTMLElement[];
        const scrollableContainers = divs.filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          
          const hasScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
          const hasScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
          
          return hasScrollY || hasScrollX;
        });

        if (scrollableContainers.length > 0) {
          // Sort scrollable containers by matching proximity to focus, nested structure, then size
          scrollableContainers.sort((a, b) => {
            const aContains = a.contains(currentElement);
            const bContains = b.contains(currentElement);
            if (aContains && !bContains) return -1;
            if (!aContains && bContains) return 1;
            
            let depthA = 0;
            let parentA = a.parentElement;
            while (parentA) { depthA++; parentA = parentA.parentElement; }
            
            let depthB = 0;
            let parentB = b.parentElement;
            while (parentB) { depthB++; parentB = parentB.parentElement; }
            
            if (depthA !== depthB) {
              return depthB - depthA; // Nested/inner containers prioritized
            }
            
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return (bRect.width * bRect.height) - (aRect.width * aRect.height);
          });

          const targetContainer = scrollableContainers[0];
          let dy = 0;
          let dx = 0;
          if (hasRightStickY) {
            dy = rightStickY * 36; // Increased speed for right stick scrolling
          }
          if (hasRightStickX) {
            dx = rightStickX * 36;
          }

          if (dy !== 0 || dx !== 0) {
            const originalScrollBehavior = targetContainer.style.scrollBehavior;
            targetContainer.style.scrollBehavior = 'auto';
            targetContainer.scrollTop += dy;
            targetContainer.scrollLeft += dx;
            targetContainer.style.scrollBehavior = originalScrollBehavior;
          }
        }
      }

      // Navigation inputs mapping (override if continuous scroll has consumed the vertical inputs)
      let dpadUp = rawDpadUp && !achievementsScrolled;
      let dpadDown = rawDpadDown && !achievementsScrolled;
      const dpadLeft = activeGamepad.buttons[14]?.pressed;
      const dpadRight = activeGamepad.buttons[15]?.pressed;

      const AXIS_THRESHOLD = 0.5;
      let stickUp = (rawStickY < -AXIS_THRESHOLD) && !achievementsScrolled;
      let stickDown = (rawStickY > AXIS_THRESHOLD) && !achievementsScrolled;
      const stickLeft = activeGamepad.axes[0] < -AXIS_THRESHOLD;
      const stickRight = activeGamepad.axes[0] > AXIS_THRESHOLD;

      // Track and resolve physical button A and B release states
      if (gamepadButtonANeedReleaseRef.current) {
        if (!activeGamepad.buttons[0]?.pressed) {
          gamepadButtonANeedReleaseRef.current = false;
        }
      }
      if (gamepadButtonBNeedReleaseRef.current) {
        if (!activeGamepad.buttons[1]?.pressed) {
          gamepadButtonBNeedReleaseRef.current = false;
        }
      }

      // Always allow standard buttons 0 (A) and 1 (B) to select and cancel in menus
      const buttonA = gamepadButtonANeedReleaseRef.current ? false : activeGamepad.buttons[0]?.pressed;
      const buttonB = gamepadButtonBNeedReleaseRef.current ? false : activeGamepad.buttons[1]?.pressed;

      const prevButtonA = lastGamepadButtonsPressedRef.current['btn_0'] || false;
      const prevButtonB = lastGamepadButtonsPressedRef.current['btn_1'] || false;

      lastGamepadButtonsPressedRef.current['btn_0'] = !!buttonA;
      lastGamepadButtonsPressedRef.current['btn_1'] = !!buttonB;

      // Enable gamepad-navigation mode when any navigation buttons are pressed
      if (rawDpadUp || rawDpadDown || dpadLeft || dpadRight || (Math.abs(rawStickY) > AXIS_THRESHOLD) || stickLeft || stickRight || buttonA || buttonB) {
        if (!document.body.classList.contains('gamepad-navigation-active')) {
          document.body.classList.add('gamepad-navigation-active');
        }
      }

      // Handle hold-to-repeat on holdable elements (e.g. plus/minus buttons in trade/keep modals)
      const isHoldable = currentElement && currentElement.getAttribute('data-holdable') === 'true';
      if (buttonA) {
        if (!prevButtonA) {
          buttonAHoldStartRef.current = now;
          buttonALastRepeatRef.current = now;
        } else if (isHoldable && buttonAHoldStartRef.current !== null) {
          const elapsed = now - buttonAHoldStartRef.current;
          if (elapsed > 400) {
            if (now - buttonALastRepeatRef.current > 75) {
              if (currentElement && typeof currentElement.click === 'function' && !currentElement.hasAttribute('disabled') && currentElement.getAttribute('aria-disabled') !== 'true') {
                currentElement.click();
              }
              buttonALastRepeatRef.current = now;
            }
          }
        }
      } else {
        buttonAHoldStartRef.current = null;
      }

      const isSliderActive = currentElement && currentElement.tagName === 'INPUT' && (currentElement as HTMLInputElement).type === 'range';

      if (now - lastGamepadActionTimeRef.current > DEBOUNCE_TIME) {
        let acted = false;

        // Custom handling for range sliders (volume, custom resolution etc) On Left/Right buttons
        if ((dpadLeft || stickLeft || dpadRight || stickRight) && isSliderActive) {
          const input = currentElement as HTMLInputElement;
          const min = parseFloat(input.min) || 0;
          const max = parseFloat(input.max) || 100;
          const step = parseFloat(input.step) || 1;
          const val = parseFloat(input.value);
          
          let newVal = val;
          // Volume needs larger steps, other sliders (re-scales) might need small step
          const multiplier = (max - min >= 50) ? 5 : 1;
          if (dpadLeft || stickLeft) {
            newVal = Math.max(min, val - step * multiplier);
          } else if (dpadRight || stickRight) {
            newVal = Math.min(max, val + step * multiplier);
          }
          
          if (newVal !== val) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, newVal);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                input.value = String(newVal);
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          acted = true;
        } else {
          // Normal focus navigation
          if (dpadUp || stickUp) {
            navigate('up');
            acted = true;
          } else if (dpadDown || stickDown) {
            navigate('down');
            acted = true;
          } else if (dpadLeft || stickLeft) {
            navigate('left');
            acted = true;
          } else if (dpadRight || stickRight) {
            navigate('right');
            acted = true;
          }
        }

        // Fire single press triggers
        if (!acted) {
          if (buttonA && !prevButtonA) {
            const current = document.activeElement as HTMLElement;
            if (current && typeof current.click === 'function') {
              current.click();
              acted = true;
            }
          } else if (buttonB && !prevButtonB) {
            if (showSettings) {
              setShowSettings(false);
              acted = true;
            } else if (showPauseMenu) {
              setShowPauseMenu(false);
              acted = true;
            } else if (gameState === GameState.CHAR_SELECT) {
              setGameState(GameState.MENU);
              acted = true;
            } else if (gameState === GameState.CREDITS) {
              setGameState(GameState.MENU);
              acted = true;
            } else {
              const escEvent = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true });
              document.dispatchEvent(escEvent);
              acted = true;
            }
          }
        }

        if (acted) {
          lastGamepadActionTimeRef.current = now;
        }
      }

      rafId = requestAnimationFrame(checkGamepad);
    };

    rafId = requestAnimationFrame(checkGamepad);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);
};
