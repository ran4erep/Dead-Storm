
import React, { useMemo, useState, useEffect } from 'react';
import { Crosshair, Hand, RotateCcw, X, LayoutGrid, Map as MapIcon, MessageSquare, FastForward, ZoomIn, ZoomOut, Eye, Search } from 'lucide-react';
import { GameStrings, Settings } from '../types';
import { renderGamepadIconOrLabel } from './SettingsModal';

interface InteractionInfo {
    id: string;
    label: string;
    type?: string;
}

interface ActionsModalProps {
  strings: GameStrings;
  settings?: Settings;
  isCombat: boolean;
  isProcessingTurn: boolean;
  isAiming: boolean;
  canAim: boolean;
  availableInteractions: InteractionInfo[];
  canReload: boolean;
  isMapOpen?: boolean;
  isNoteOpen?: boolean;
  mapItemName?: string;
  isRadioOpen?: boolean;
  isConsoleOpen?: boolean;
  onAction: (id: string) => void;
  onShoot: () => void;
  onReload: () => void;
  onHideMap?: () => void;
  onHideRadio?: () => void;
  onHideConsole?: () => void;
  onStartConsole?: () => void;
  onZoomIn?: () => void; 
  onZoomOut?: () => void; 
  onPause: () => void;
  onClose: () => void;
  onSkipTurn?: () => void;
  onLookAround?: () => void;
}

const ActionsModal: React.FC<ActionsModalProps> = ({
  strings,
  settings,
  isCombat,
  isProcessingTurn,
  isAiming,
  canAim,
  availableInteractions,
  canReload,
  isMapOpen,
  isNoteOpen,
  mapItemName,
  isRadioOpen,
  isConsoleOpen,
  onAction,
  onShoot,
  onReload,
  onHideMap,
  onHideRadio,
  onHideConsole,
  onStartConsole,
  onZoomIn,
  onZoomOut,
  onClose,
  onSkipTurn,
  onLookAround
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
  
  
  const actions = useMemo(() => {
    const list = [];

    if (isRadioOpen) {
        if (onHideRadio) {
            list.push({
                id: 'hide_radio',
                label: strings.ui.controls?.btn_hide_radio || "СПРЯТАТЬ",
                icon: Hand,
                onClick: () => { onHideRadio(); onClose(); },
                disabled: false,
                activeColor: 'active:bg-gray-700/80 active:border-gray-500'
            });
        }
    }

    if (isConsoleOpen) {
        if (onStartConsole) {
            list.push({
                id: 'start_console',
                label: strings.ui.menu?.btn_start || "START",
                icon: FastForward, // We can use FastForward or Play
                onClick: () => { onStartConsole(); onClose(); },
                disabled: false,
                activeColor: 'active:bg-green-700/80 active:border-green-500'
            });
        }
        if (onHideConsole) {
            list.push({
                id: 'hide_console',
                label: strings.ui.controls?.btn_hide_console || "ЗАКРЫТЬ",
                icon: Hand,
                onClick: () => { onHideConsole(); onClose(); },
                disabled: false,
                activeColor: 'active:bg-gray-700/80 active:border-gray-500'
            });
        }
        return list;
    }

    // If Map is open, show map controls
    if (isMapOpen) {
        if (onHideMap) {
            const closeLabel = strings.ui.controls?.btn_close_note || "CLOSE";
            list.push({
                id: 'hide_map',
                label: isNoteOpen ? `${closeLabel} ${mapItemName || ''}` : (strings.ui.controls.btn_hide_map || "HIDE MAP"),
                icon: MapIcon,
                onClick: () => { onHideMap(); onClose(); },
                disabled: false,
                activeColor: 'active:bg-gray-700/80 active:border-gray-500'
            });
        }
        if (onZoomIn) {
            list.push({
                id: 'zoom_in',
                label: strings.ui.controls.btn_zoom_in || "ENLARGE",
                icon: ZoomIn,
                onClick: () => { onZoomIn(); }, 
                disabled: false,
                activeColor: 'active:bg-gray-700/80 active:border-gray-500'
            });
        }
        if (onZoomOut) {
            list.push({
                id: 'zoom_out',
                label: strings.ui.controls.btn_zoom_out || "SHRINK",
                icon: ZoomOut,
                onClick: () => { onZoomOut(); }, 
                disabled: false,
                activeColor: 'active:bg-gray-700/80 active:border-gray-500'
            });
        }
        return list; 
    }

    // SKIP TURN - Priority
    if (onSkipTurn) {
        list.push({
            id: 'skip',
            label: strings.ui.controls.btn_skip || "SKIP TURN",
            icon: FastForward,
            onClick: () => { onSkipTurn(); onClose(); },
            disabled: isProcessingTurn,
            activeColor: 'active:bg-gray-700/80 active:border-gray-500'
        });
    }

    // Combat specific layout
    if (!isCombat) {
        if (canAim) {
            list.push({
                id: 'shoot',
                label: strings.ui.controls.btn_shoot_dummy,
                icon: Crosshair,
                onClick: () => { onShoot(); onClose(); },
                disabled: isAiming || isProcessingTurn,
                activeColor: 'active:bg-red-900/40 active:border-red-500'
            });
        }

        if (availableInteractions && availableInteractions.length > 0) {
            availableInteractions.forEach(interaction => {
                list.push({
                    id: `interact_${interaction.id}`,
                    label: interaction.label,
                    icon: interaction.id === 'TALK' ? MessageSquare : (interaction.id === 'INSPECT' ? Search : Hand),
                    onClick: () => { onAction(interaction.id); }, 
                    disabled: isProcessingTurn,
                    activeColor: 'active:bg-cyan-900/40 active:border-cyan-500'
                });
            });
        }

        if (onLookAround) {
            list.push({
                id: 'look_around',
                label: strings.ui.controls.btn_look_around || "LOOK AROUND",
                icon: Eye,
                onClick: () => { onLookAround(); onClose(); },
                disabled: isProcessingTurn,
                activeColor: 'active:bg-blue-900/40 active:border-blue-500'
            });
        }
    }

    if (canReload) {
        list.push({
            id: 'reload',
            label: strings.ui.controls.btn_reload,
            icon: RotateCcw,
            onClick: () => { onReload(); onClose(); },
            disabled: isProcessingTurn,
            activeColor: 'active:bg-yellow-900/40 active:border-yellow-500'
        });
    }

    return list;
  }, [isCombat, isProcessingTurn, canAim, availableInteractions, canReload, isMapOpen, isConsoleOpen, strings, isAiming, onShoot, onAction, onReload, onHideMap, onHideConsole, onStartConsole, onZoomIn, onZoomOut, onClose, onSkipTurn, onLookAround]);

  // Adjust grid columns based on items count
  const gridCols = actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div 
      className="absolute inset-0 z-[250] bg-transparent flex flex-col justify-end items-center p-4 pb-36 transition-all duration-300 pointer-events-auto font-['Jura']"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900/95 border border-gray-700 w-full max-w-md rounded-lg flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-black/40 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-cyan-500" />
            <h2 className="text-sm font-bold text-gray-200 tracking-widest uppercase">
              {strings.ui.modal.actions_title}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 active:text-white transition-colors flex items-center gap-1 touch-manipulation p-1 gamepad-hide-buttons">
             <X size={20} />
          </button>
        </div>

        {/* Content Body with Dynamic Grid */}
        <div className="p-4 bg-gray-900/40 flex flex-col gap-3">
            <div className={`grid ${gridCols} gap-3`}>
                {actions.map((action) => (
                  <button 
                    key={action.id}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`relative bg-gray-800/80 border border-gray-700 p-4 rounded flex flex-col items-center gap-2 transition-all group disabled:opacity-20 ${action.activeColor} hover:border-gray-500`}
                  >
                      {/* Gamepad keybinding hint overlay in the corner */}
                      {isGamepadActive && action.id === 'skip' && (
                        <div className="absolute top-1.5 right-1.5 scale-75 origin-top-right">
                          {renderGamepadIconOrLabel(settings?.gamepadControls?.skipTurn !== undefined ? settings.gamepadControls.skipTurn : 2)}
                        </div>
                      )}
                      {isGamepadActive && action.id === 'reload' && (
                        <div className="absolute top-1.5 right-1.5 scale-75 origin-top-right">
                          {renderGamepadIconOrLabel(settings?.gamepadControls?.reload !== undefined ? settings.gamepadControls.reload : 3)}
                        </div>
                      )}
                      {isGamepadActive && action.id === 'shoot' && (
                        <div className="absolute top-1.5 right-1.5 scale-75 origin-top-right">
                          {renderGamepadIconOrLabel(settings?.gamepadControls?.toggleAiming !== undefined ? settings.gamepadControls.toggleAiming : 1)}
                        </div>
                      )}
                      {isGamepadActive && action.id === 'look_around' && (
                        <div className="absolute top-1.5 right-1.5 scale-75 origin-top-right">
                          {renderGamepadIconOrLabel(settings?.gamepadControls?.toggleLook !== undefined ? settings.gamepadControls.toggleLook : 11)}
                        </div>
                      )}

                      {/* Monochrome Icons */}
                      <action.icon size={32} className="text-gray-400 group-active:text-white transition-colors" />
                      <span className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase text-center">{action.label}</span>
                  </button>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ActionsModal;
