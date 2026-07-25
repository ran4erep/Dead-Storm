
import React, { useMemo, useState, useEffect } from 'react';
import { MapPin, Star, User, Briefcase, Pause } from 'lucide-react';
import { Player, GameStrings, Settings, GameState } from '../types';
import { useViewportScale } from '../hooks/useViewportScale';
import { renderGamepadIconOrLabel } from './SettingsModal';

interface GameHeaderProps {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  maxXp: number;
  availablePoints: number;
  levelName: string;
  strings: GameStrings;
  combatProcessing: boolean;
  combatActive?: boolean;
  showPauseMenu: boolean;
  showSettings: boolean;
  showDebug: boolean;
  activeModal: string | null;
  toggleModal: (modal: any) => void;
  setShowPauseMenu: (show: boolean) => void;
  setActiveModal: (modal: any) => void;
  isDying?: boolean;
  cinematicMode?: boolean;
  activeTutorial?: { highlightElement?: string } | null;
  className?: string;
  style?: React.CSSProperties;
  settings?: Settings;
  gameState?: GameState;
}

const GameHeader: React.FC<GameHeaderProps> = ({
  hp,
  maxHp,
  level,
  xp,
  maxXp,
  availablePoints,
  levelName,
  strings,
  combatProcessing,
  combatActive,
  showPauseMenu,
  showSettings,
  showDebug,
  activeModal,
  toggleModal,
  setShowPauseMenu,
  setActiveModal,
  isDying,
  cinematicMode,
  activeTutorial,
  className,
  style,
  settings,
  gameState
}) => {
  const [isGamepadActive, setIsGamepadActive] = useState(() => {
    return typeof document !== 'undefined' ? document.body.classList.contains('gamepad-navigation-active') : false;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsGamepadActive(document.body.classList.contains('gamepad-navigation-active'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const pauseDisabled = isDying;
  const controlsDisabled = showPauseMenu || showSettings || showDebug || combatProcessing || isDying || cinematicMode;
  const isConsoleActive = gameState === GameState.CONSOLE_VIEW;
  const menuButtonsDisabled = controlsDisabled || isConsoleActive;

  const hpPercent = hp / maxHp;

  const healthStyles = useMemo(() => {
      if (hpPercent <= 0.3) {
          return {
              text: 'text-red-500 animate-pulse',
              bar: 'bg-gradient-to-r from-red-900 via-red-600 to-red-500'
          };
      } else if (hpPercent <= 0.6) {
          return {
              text: 'text-yellow-400',
              bar: 'bg-gradient-to-r from-yellow-900 via-yellow-600 to-yellow-500'
          };
      } else {
          return {
              text: 'text-green-400',
              bar: 'bg-gradient-to-r from-green-900 via-green-600 to-green-500'
          };
      }
  }, [hpPercent]);

  const disabledBtnClass = "disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed transition-all duration-300";
  const locationDisabled = controlsDisabled || combatActive;
  const locationContainerClass = locationDisabled 
      ? "opacity-30 grayscale pointer-events-none" 
      : "cursor-pointer active:bg-gray-800/50 hover:bg-gray-800/30";
  
  const locationTextClass = locationDisabled 
      ? "text-gray-600" 
      : "text-gray-300 active:text-white";
      
  const locationIconClass = locationDisabled
      ? "text-gray-600"
      : "text-gray-500 active:text-cyan-400";

  const viewportScale = useViewportScale();
  // Dynamic scaling based on container height if provided via style
  const containerHeight = style?.height ? Number(style.height) : 60;
  // Allow scaling down if the header is smaller than 60px
  const scaleFactor = Math.min(2.5, Math.max(0.5, containerHeight / 60)) * viewportScale;
  
  const baseTextSize = Math.max(8, 10 * scaleFactor);
  const valueTextSize = Math.max(10, 12 * scaleFactor);
  const iconSize = Math.max(12, 16 * scaleFactor);
  const locationIconSize = Math.max(10, 12 * scaleFactor);
  const buttonPadding = Math.max(4, 6 * scaleFactor);
  
  const headerZIndex = activeTutorial ? 'z-auto' : 'z-[110]';

  return (
    <div className={`flex justify-between items-center px-2 bg-gray-900 shrink-0 ${headerZIndex} shadow-md relative no-gamepad-nav ${className || ''}`} style={{ ...style, minHeight: `${48 * scaleFactor}px`, paddingBottom: Math.max(3, 3 * scaleFactor) }}>
      <div className="flex flex-col shrink-0 min-w-[85px] justify-center tutorial-highlight" data-tutorial-target="PLAYER_STATS">
        <div className="flex items-end gap-1" style={{ marginBottom: 3 * scaleFactor }}>
          <span className="text-gray-400 uppercase font-bold tracking-wider leading-none" style={{ fontSize: baseTextSize }}>{strings.ui.header.status}:</span>
          <span className={`font-bold font-['Jura'] leading-none ${healthStyles.text}`} style={{ fontSize: valueTextSize }}>
            {hp}/{maxHp}
          </span>
        </div>
        <div className="w-full bg-gray-950 rounded-sm border border-gray-700 overflow-hidden relative shadow-inner" style={{ height: 6 * scaleFactor, marginBottom: 3 * scaleFactor }}>
          <div className={`absolute top-0 left-0 h-full transition-all duration-300 ${healthStyles.bar}`} style={{ width: `${Math.max(0, Math.min(100, hpPercent * 100))}%` }} />
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-yellow-600 uppercase font-bold tracking-wider leading-none" style={{ fontSize: Math.max(8, 9 * scaleFactor) }}>{strings.ui.header.level}:</span>
          <span className="font-bold font-['Jura'] text-yellow-400 leading-none" style={{ fontSize: valueTextSize }}>{level}</span>
        </div>
      </div>

      <div className="flex-1 flex justify-center items-center min-w-0 px-2">
        <div onClick={() => { if(!locationDisabled) toggleModal('location'); }} className={`flex flex-col justify-center items-center px-2 rounded transition-all touch-manipulation max-w-full tutorial-highlight ${locationContainerClass}`} data-tutorial-target="HEADER_BUTTON_MAP">
          <h1 className={`font-bold transition-colors flex items-center gap-2 truncate text-center w-full leading-none ${locationTextClass}`} style={{ fontSize: valueTextSize }}>
            {isGamepadActive ? (
              <div className="scale-[0.6] shrink-0 origin-center flex items-center justify-center -my-1 select-none">
                {renderGamepadIconOrLabel(settings?.gamepadControls?.sectorDetails !== undefined ? settings.gamepadControls.sectorDetails : 13)}
              </div>
            ) : (
              <MapPin size={locationIconSize} className={`shrink-0 ${locationIconClass}`}/>
            )}
            <span className="truncate pt-0.5">{levelName}</span>
          </h1>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 shrink-0 tutorial-highlight" data-tutorial-target="HEADER_BUTTONS">
        <button onClick={() => toggleModal('stats')} disabled={menuButtonsDisabled} className={`bg-gray-800 rounded relative border border-gray-700 active:bg-gray-700 ${activeModal === 'stats' ? 'bg-gray-700 border-purple-500/50' : ''} ${disabledBtnClass}`} style={{ padding: buttonPadding }}>
          {isGamepadActive && (
            <div className="absolute -top-1 -right-1 scale-[0.55] origin-top-right z-20">
              {renderGamepadIconOrLabel(settings?.gamepadControls?.statsMenu !== undefined ? settings.gamepadControls.statsMenu : 14)}
            </div>
          )}
          <Star size={iconSize} className={activeModal === 'stats' ? "text-purple-400" : "text-gray-200"} />
          {availablePoints > 0 && !menuButtonsDisabled && (
            <div 
              className="absolute inset-[-2px] border-2 border-purple-500 rounded pointer-events-none animate-[flash_1s_ease-in-out_infinite]" 
              style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
            ></div>
          )}
        </button>
        <button onClick={() => toggleModal('equipment')} disabled={menuButtonsDisabled} className={`bg-gray-800 rounded relative border border-gray-700 ${activeModal === 'equipment' ? 'bg-gray-700 border-yellow-500/50' : ''} ${disabledBtnClass}`} style={{ padding: buttonPadding }}>
          {isGamepadActive && (
            <div className="absolute -top-1 -right-1 scale-[0.55] origin-top-right z-20">
              {renderGamepadIconOrLabel(settings?.gamepadControls?.equipMenu !== undefined ? settings.gamepadControls.equipMenu : 12)}
            </div>
          )}
          <User size={iconSize} className={activeModal === 'equipment' ? "text-yellow-400" : "text-gray-300"} />
        </button>
        <button data-tutorial-target="HEADER_BUTTON_MENU" onClick={() => toggleModal('inventory')} disabled={menuButtonsDisabled} className={`bg-gray-800 rounded relative border border-gray-700 tutorial-highlight ${activeModal === 'inventory' ? 'bg-gray-700 border-cyan-500/50' : ''} ${disabledBtnClass}`} style={{ padding: buttonPadding }}>
          {isGamepadActive && (
            <div className="absolute -top-1 -right-1 scale-[0.55] origin-top-right z-20">
              {renderGamepadIconOrLabel(settings?.gamepadControls?.inventory !== undefined ? settings.gamepadControls.inventory : 15)}
            </div>
          )}
          <Briefcase size={iconSize} className={activeModal === 'inventory' ? "text-cyan-400" : "text-gray-300"} />
        </button>
        <button data-tutorial-target="HEADER_BUTTON_GEAR" onClick={() => { 
          if (!pauseDisabled) { 
            if (isConsoleActive) {
              toggleModal('actions');
            } else {
              setShowPauseMenu(true); 
              setActiveModal(null); 
            }
          } 
        }} disabled={pauseDisabled} className={`bg-gray-800 rounded relative border border-gray-700 tutorial-highlight active:bg-gray-700 ${showPauseMenu ? 'bg-gray-700 border-gray-500' : ''} ${pauseDisabled ? 'opacity-30 grayscale cursor-not-allowed' : ''} transition-all duration-300`} style={{ padding: buttonPadding }}>
          {isGamepadActive && (
            <div className="absolute -top-1 -right-1 scale-[0.55] origin-top-right z-20">
              {renderGamepadIconOrLabel(settings?.gamepadControls?.pauseMenu !== undefined ? settings.gamepadControls.pauseMenu : 9)}
            </div>
          )}
          <Pause size={iconSize} className={showPauseMenu ? "text-white" : "text-gray-400"} />
        </button>
      </div>

      {/* XP BAR at the bottom of header */}
      <div className="absolute bottom-0 left-0 w-full bg-gray-800" style={{ height: Math.max(3, 3 * scaleFactor) }}>
          <div 
             className="h-full bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)] transition-all duration-500" 
             style={{ width: `${Math.min(100, (xp / maxXp) * 100)}%` }} 
          />
      </div>
    </div>
  );
};

export default React.memo(GameHeader);
