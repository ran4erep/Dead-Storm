
import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, GameStrings, DEFAULT_SETTINGS, KeyboardControlsSettings, GamepadControlsSettings } from '../types';
import { X, Smartphone, Globe, Settings, Terminal, ChevronRight, Volume2, Maximize, Monitor, Zap, ChevronLeft, Image, FileUp, FileDown, Save, Music, Speaker, Mic, Layout, ShieldAlert, Timer, BarChart3, ChevronUp, Brain, Map, RotateCcw, Keyboard, Ghost, Cpu, Skull, Wrench, Compass, Package, Gamepad2, Trophy, Eye, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TUTORIAL_SECTOR_PATH } from '../data/levels';
import achievementsData from '../data/achievements.json';

interface SettingsModalProps {
  settings: SettingsType;
  strings: GameStrings['ui']['settings'];
  isGameStarted: boolean;
  onClose: () => void;
  onUpdate: (newSettings: SettingsType) => void;
  onOpenDebug?: () => void; // Unused now, but kept for compatibility
  onOpenVolume?: () => void; // Unused now, but kept for compatibility
  onOpenEditor?: () => void;
  engine?: any;
  saveLoadStrings?: any;
  onLevelUp?: () => void;
  onOpenMap?: () => void;
}

const TrophyIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
    <Trophy size={size} className={`${className} transition-colors group-hover:text-yellow-500`} />
);

const IconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Skull,
  Wrench,
  ShieldAlert,
  Compass,
  Ghost,
  Package,
  Gamepad2,
  Trophy
};

export const XboxButton: React.FC<{ label: 'A' | 'B' | 'X' | 'Y' }> = ({ label }) => {
  return (
    <div className="relative flex items-center justify-center w-[25px] h-[25px] rounded-full bg-[#202124] shadow-[0_2px_4.5px_rgba(0,0,0,0.65),inset_0_1px_1.5px_rgba(255,255,255,0.15)] border border-neutral-700/80 select-none overflow-hidden shrink-0">
      {/* 3D button body gradient underneath */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/45 via-transparent to-white/10 pointer-events-none" />
      
      {/* Recessed letter with delicate clean drop shadow */}
      <span className="select-none tracking-tight text-neutral-100 font-sans text-xs font-black z-10 scale-105 drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
        {label}
      </span>

      {/* Realistic glass-capsule/dome overlay */}
      <div className="absolute top-[0.5px] left-[1px] right-[1px] h-[40%] bg-gradient-to-b from-white/20 via-white/5 to-transparent rounded-t-full pointer-events-none z-20" />
      
      {/* Edge glass rim refraction */}
      <div className="absolute inset-[0.5px] rounded-full border border-white/10 pointer-events-none z-20" />
      
      {/* Bottom curved inner reflection gloss */}
      <div className="absolute bottom-[0.5px] left-1 right-1 h-[20%] bg-white/5 rounded-b-full pointer-events-none filter blur-[0.2px] z-20" />
    </div>
  );
};

export const XboxBumper: React.FC<{ label: 'LB' | 'RB' }> = ({ label }) => (
  <div className="relative flex items-center justify-center px-2 py-0.5 min-w-[34px] h-[22px] rounded border border-neutral-600 bg-gradient-to-b from-neutral-700 via-neutral-850 to-neutral-900 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.15),0_1.5px_2px_rgba(0,0,0,0.35)] overflow-hidden">
    <div className="absolute top-0 left-0 w-full h-[3px] bg-white/10" />
    <span className="text-gray-100 font-black font-sans text-[9px] uppercase tracking-tight select-none">
      {label}
    </span>
  </div>
);

export const XboxTrigger: React.FC<{ label: 'LT' | 'RT' }> = ({ label }) => {
  const isLeft = label === 'LT';
  
  // High-fidelity asymmetrical trigger shape paths
  // LT curves outward to the left, RT curves outward to the right
  const path = isLeft
    ? "M12 2 h22 a2 2 0 0 1 2 2 v16 a2 2 0 0 1 -2 2 H19 C13 22 7 16 5 12 C 3 8 7 2 12 2 Z"
    : "M26 2 H4 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h15 C25 22 31 16 33 12 C 35 8 31 2 26 2 Z";

  const gradId = isLeft ? "triggerGradLT" : "triggerGradRT";

  return (
    <div className="relative flex items-center justify-center select-none shrink-0" style={{ width: '38px', height: '22px' }}>
      <svg width="38" height="22" viewBox="0 0 38 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_1.5px_2.5px_rgba(0,0,0,0.45)]">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#404040" />
            <stop offset="50%" stopColor="#262626" />
            <stop offset="100%" stopColor="#171717" />
          </linearGradient>
        </defs>
        {/* Trigger shape filled with exact matching bumper gradient & border */}
        <path 
          d={path} 
          fill={`url(#${gradId})`} 
          stroke="#4b5563" 
          strokeWidth="1" 
          strokeLinejoin="round" 
        />
        {/* Subtle interior highlight */}
        <path 
          d={isLeft ? "M12 3 H33" : "M5 3 H26"} 
          stroke="white" 
          strokeWidth="0.8" 
          strokeOpacity="0.12" 
        />
      </svg>
      {/* Positioned text to perfectly align in the trigger area */}
      <span className={`absolute text-gray-200 font-extrabold font-sans text-[9px] uppercase tracking-tighter select-none ${isLeft ? 'translate-x-[4px]' : 'translate-x-[-4px]'}`}>
        {label}
      </span>
    </div>
  );
};

export const XboxMenuButton: React.FC<{ type: 'select' | 'start' }> = ({ type }) => {
  if (type === 'select') {
    return (
      <div className="relative flex items-center justify-center w-[23px] h-[23px] rounded-full border border-neutral-700 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[0_1.5px_3.5px_rgba(0,0,0,0.55)] select-none shrink-0">
        {/* Top gloss */}
        <div className="absolute top-[0.5px] left-[0.5px] right-[0.5px] h-[35%] bg-gradient-to-b from-white/15 to-transparent rounded-t-full pointer-events-none" />
        {/* Flat Overlapping Rectangles (Xbox View Button) */}
        <div className="relative w-3 h-3 flex items-center justify-center scale-95 select-none">
          {/* Back window */}
          <div className="absolute top-[1.2px] left-[1.2px] w-[6.5px] h-[4.8px] border-[1.2px] border-neutral-300 rounded-[1px] bg-transparent" />
          {/* Front window */}
          <div className="absolute bottom-[1.2px] right-[1.2px] w-[6.5px] h-[4.8px] border-[1.2px] border-white rounded-[1px] bg-neutral-950 shadow-sm" />
        </div>
      </div>
    );
  }

  // Hamburger Menu (start) button
  return (
    <div className="relative flex items-center justify-center w-[23px] h-[23px] rounded-full border border-neutral-700 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[0_1.5px_3.5px_rgba(0,0,0,0.55)] select-none shrink-0">
      {/* Top gloss */}
      <div className="absolute top-[0.5px] left-[0.5px] right-[0.5px] h-[35%] bg-gradient-to-b from-white/15 to-transparent rounded-t-full pointer-events-none" />
      <div className="flex flex-col gap-[2px] items-center justify-center w-3 h-3 scale-[0.9] select-none">
        <div className="w-3 h-[1.5px] bg-white rounded-sm" />
        <div className="w-3 h-[1.5px] bg-white rounded-sm" />
        <div className="w-3 h-[1.5px] bg-white rounded-sm" />
      </div>
    </div>
  );
};

export const XboxStick: React.FC<{ type: 'LS' | 'RS'; direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' }> = ({ type, direction }) => {
  const letter = type === 'LS' ? 'L' : 'R';
  
  // Highly crisp vector arrows positioned according to movement direction
  const arrowElements = {
    UP: (
      <svg className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="none">
        <path d="M12 4L4 14H20L12 4Z" fill="white" stroke="#171717" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    DOWN: (
      <svg className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="none">
        <path d="M12 20L4 10H20L12 20Z" fill="white" stroke="#171717" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    LEFT: (
      <svg className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="none">
        <path d="M4 12L14 4V20L4 12Z" fill="white" stroke="#171717" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    RIGHT: (
      <svg className="absolute -right-[7px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="none">
        <path d="M20 12L10 4V20L20 12Z" fill="white" stroke="#171717" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  };

  return (
    <div className="relative flex items-center justify-center w-[22px] h-[22px] rounded-full bg-[#4a4b4e] border-2 border-neutral-300 shadow-[0_1.5px_3.5px_rgba(0,0,0,0.5),inset_0_1px_1.5px_rgba(255,255,255,0.25)] select-none shrink-0">
      {/* Inner stick cap rim to make it look like a real thumbstick with 3D depth */}
      <div className="absolute inset-[1.5px] rounded-full border border-neutral-600/80 bg-[#252627] flex items-center justify-center">
        {/* High-contrast inner letter */}
        <span className="text-neutral-200 font-sans font-black text-[9px] select-none tracking-tight leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {letter}
        </span>
      </div>
      
      {/* Realistic bubble reflection highlight */}
      <div className="absolute top-[0.5px] left-[1px] right-[1px] h-[6px] bg-gradient-to-b from-white/15 to-transparent rounded-t-full pointer-events-none" />
      
      {/* Precise direction arrow aligned outside the stick rim */}
      {direction && arrowElements[direction]}
    </div>
  );
};

export const XboxDpad: React.FC<{ direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' }> = ({ direction }) => {
  // Elegant cohesive D-pad cross shape with distinct activated action wedge matching the custom vector template
  const getFill = (dir: string) => dir === direction ? "fill-white" : "fill-neutral-600/70";
  const getArrowColor = (dir: string) => dir === direction ? "#0c0a09" : "#e5e5e5";

  return (
    <div className="relative w-8 h-8 flex items-center justify-center select-none shrink-0 scale-95">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="drop-shadow-[0_1.5px_2.5px_rgba(0,0,0,0.45)]" xmlns="http://www.w3.org/2000/svg">
        {/* Unified, single continuous base cross body structure */}
        <path 
          d="M10 2h8v24h-8V2z M2 10h24v8H2v-8z" 
          fill="#2d3748" 
          className="stroke-neutral-700/80" 
          strokeWidth="1" 
          strokeLinejoin="round" 
        />
        
        {/* Center depressed compass pivot circle */}
        <circle cx="14" cy="14" r="3.5" fill="#171717" className="stroke-neutral-700/60" strokeWidth="0.5" />
        
        {/* Individually styled directional wedges but joined into the single D-PAD visually */}
        {/* UP */}
        <path 
          d="M10.5 9.5h7V2.8c0-.5-.5-.8-1-.8h-5c-.5 0-1 .3-1 .8v6.7z" 
          className={`transition-all duration-150 ${getFill('UP')}`} 
        />
        <path d="M14 4.5l-2.5 3h5L14 4.5z" fill={getArrowColor('UP')} />
        
        {/* DOWN */}
        <path 
          d="M10.5 18.5h7v6.7c0 .5-.5.8-1 .8h-5c-.5 0-1-.3-1-.8v-6.7z" 
          className={`transition-all duration-150 ${getFill('DOWN')}`} 
        />
        <path d="M14 23.5l-2.5-3h5L14 23.5z" fill={getArrowColor('DOWN')} />
        
        {/* LEFT */}
        <path 
          d="M9.5 10.5v7H2.8c-.5 0-.8-.5-.8-1v-5c0-.5.3-1 .8-1h6.7z" 
          className={`transition-all duration-150 ${getFill('LEFT')}`} 
        />
        <path d="M4.5 14l3-2.5v5l-3-2.5z" fill={getArrowColor('LEFT')} />
        
        {/* RIGHT */}
        <path 
          d="M18.5 10.5v7h6.7c.5 0 .8-.5.8-1v-5c0-.5-.3-1-.8-1h-6.7z" 
          className={`transition-all duration-150 ${getFill('RIGHT')}`} 
        />
        <path d="M23.5 14l-3-2.5v5l3-2.5z" fill={getArrowColor('RIGHT')} />
      </svg>
    </div>
  );
};

export const getGamepadButtonName = (index: number, gamepadId: string): { label: string; isXbox: boolean } => {
  const idLower = gamepadId ? gamepadId.toLowerCase() : '';
  const isPs = idLower.includes('playstation') || idLower.includes('sony') || idLower.includes('dualshock') || idLower.includes('dualsense') || idLower.includes('ps4') || idLower.includes('ps5');
  const isNintendo = idLower.includes('nintendo') || idLower.includes('switch') || idLower.includes('joy-con');
  
  // Custom gamepads often report generic standard structures containing xbox, standard, or xinput
  const isXbox = idLower.includes('xbox') || idLower.includes('x-box') || idLower.includes('microsoft') || idLower.includes('xinput') || (!isPs && !isNintendo); 

  if (isXbox) {
    const xboxLabels: Record<number, string> = {
      0: 'A',
      1: 'B',
      2: 'X',
      3: 'Y',
      4: 'LB',
      5: 'RB',
      6: 'LT',
      7: 'RT',
      8: 'SELECT',
      9: 'START',
      10: 'LS Click',
      11: 'RS Click',
      12: 'D-Pad Up',
      13: 'D-Pad Down',
      14: 'D-Pad Left',
      15: 'D-Pad Right',
    };
    return { label: xboxLabels[index] || `Btn ${index}`, isXbox: true };
  }

  if (isPs) {
    const psLabels: Record<number, string> = {
      0: '✕ Cross',
      1: '◯ Circle',
      2: '☐ Square',
      3: '△ Triangle',
      4: 'L1',
      5: 'R1',
      6: 'L2',
      7: 'R2',
      8: 'Share',
      9: 'Options',
      10: 'L3 Click',
      11: 'R3 Click',
      12: 'D-Pad Up',
      13: 'D-Pad Down',
      14: 'D-Pad Left',
      15: 'D-Pad Right',
    };
    return { label: psLabels[index] || `Button ${index}`, isXbox: false };
  }

  if (isNintendo) {
    const switchLabels: Record<number, string> = {
      0: 'B',
      1: 'A',
      2: 'Y',
      3: 'X',
      4: 'L',
      5: 'R',
      6: 'ZL',
      7: 'ZR',
      8: 'Minus',
      9: 'Plus',
      10: 'Left Stick Click',
      11: 'Right Stick Click',
      12: 'D-Pad Up',
      13: 'D-Pad Down',
      14: 'D-Pad Left',
      15: 'D-Pad Right',
    };
    return { label: switchLabels[index] || `Button ${index}`, isXbox: false };
  }

  return { label: `Button ${index}`, isXbox: false };
};

export const renderGamepadIconOrLabel = (value: string | number) => {
  const key = typeof value === 'number' ? `btn_${value}` : value;

  if (key.startsWith('axis_')) {
    const parts = key.split('_');
    const axisIdx = parseInt(parts[1]);
    let stickType: 'LS' | 'RS' = 'LS';
    if (axisIdx === 2 || axisIdx === 3) stickType = 'RS';

    let direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' = 'UP';
    if (axisIdx === 0 || axisIdx === 2) {
      direction = parts[2] === 'neg' ? 'LEFT' : 'RIGHT';
    } else {
      direction = parts[2] === 'neg' ? 'UP' : 'DOWN';
    }

    return <XboxStick type={stickType} direction={direction} />;
  }

  const index = parseInt(key.slice(4));
  const gamepads = typeof navigator !== 'undefined' ? navigator.getGamepads() : [];
  let name = "";
  let isXbox = true;
  
  let connectedGp = null;
  for (const gp of gamepads) {
    if (gp) {
      connectedGp = gp;
      break;
    }
  }

  if (connectedGp) {
    const info = getGamepadButtonName(index, connectedGp.id);
    name = info.label;
    isXbox = info.isXbox;
  } else {
    const info = getGamepadButtonName(index, "xbox");
    name = info.label;
    isXbox = info.isXbox;
  }

  if (isXbox) {
    if (index === 0) return <XboxButton label="A" />;
    if (index === 1) return <XboxButton label="B" />;
    if (index === 2) return <XboxButton label="X" />;
    if (index === 3) return <XboxButton label="Y" />;
    if (index === 4) return <XboxBumper label="LB" />;
    if (index === 5) return <XboxBumper label="RB" />;
    if (index === 6) return <XboxTrigger label="LT" />;
    if (index === 7) return <XboxTrigger label="RT" />;
    if (index === 8) return <XboxMenuButton type="select" />;
    if (index === 9) return <XboxMenuButton type="start" />;
    if (index === 10) return <XboxStick type="LS" />;
    if (index === 11) return <XboxStick type="RS" />;
    if (index === 12) return <XboxDpad direction="UP" />;
    if (index === 13) return <XboxDpad direction="DOWN" />;
    if (index === 14) return <XboxDpad direction="LEFT" />;
    if (index === 15) return <XboxDpad direction="RIGHT"/>;
  }

  return (
    <span className="font-mono text-[10px] font-black uppercase text-indigo-400 bg-indigo-950/45 border border-indigo-700/50 px-2.5 py-1 rounded min-w-[50px] text-center tracking-wider block">
      {name}
    </span>
  );
};

const defaultGamepadControls: GamepadControlsSettings = {
  moveForward: 'axis_1_neg',
  moveBackward: 'axis_1_pos',
  turnLeft: 'axis_0_neg',
  turnRight: 'axis_0_pos',
  strafeLeft: 4,
  strafeRight: 5,
  leftContext: 6,
  rightContext: 7,
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

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, strings, isGameStarted, onClose, onUpdate, onOpenEditor, engine, saveLoadStrings, onLevelUp, onOpenMap }) => {
  const [activeSubMenu, setActiveSubMenu] = useState<'main' | 'graphics' | 'saves' | 'audio' | 'debug' | 'controls' | 'achievements'>('main');
  const [resetPerformed, setResetPerformed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [awaitingKeyFor, setAwaitingKeyFor] = useState<keyof KeyboardControlsSettings | null>(null);
  const [localControls, setLocalControls] = useState<KeyboardControlsSettings | null>(null);
  const [awaitingGamepadBtnFor, setAwaitingGamepadBtnFor] = useState<keyof GamepadControlsSettings | null>(null);
  const [localGamepadControls, setLocalGamepadControls] = useState<GamepadControlsSettings | null>(null);

  useEffect(() => {
    (window as any).isRemappingControls = !!(awaitingKeyFor || awaitingGamepadBtnFor);
    return () => {
      (window as any).isRemappingControls = false;
    };
  }, [awaitingKeyFor, awaitingGamepadBtnFor]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (awaitingKeyFor || awaitingGamepadBtnFor) return; 

      if (e.code === 'Escape') {
        const isDesktop = window.innerWidth >= 768; // md breakpoint
        if (isDesktop) {
          onClose();
        } else {
          if (activeSubMenu !== 'main') {
            setActiveSubMenu('main');
          } else {
            onClose();
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSubMenu, awaitingKeyFor, awaitingGamepadBtnFor, onClose]);

  // Initialize localControls & localGamepadControls when opening controls menu
  useEffect(() => {
     if (activeSubMenu === 'controls') {
         setLocalControls(settings.controls ? { ...settings.controls } : { ...DEFAULT_SETTINGS.controls });
         setLocalGamepadControls(settings.gamepadControls ? { ...settings.gamepadControls } : { ...defaultGamepadControls });
     } else {
         setLocalControls(null);
         setAwaitingKeyFor(null);
         setLocalGamepadControls(null);
         setAwaitingGamepadBtnFor(null);
     }
  }, [activeSubMenu, settings.controls, settings.gamepadControls]);

  // Poll for gamepad button down when remapping
  useEffect(() => {
    if (!awaitingGamepadBtnFor) return;

    let rafId: number;
    const initialInputs = new Set<string>();
    
    const getActiveInputKeys = (gp: Gamepad): Set<string> => {
      const active = new Set<string>();
      if (!gp) return active;
      
      // Buttons
      gp.buttons.forEach((btn, idx) => {
        if (btn?.pressed) {
          active.add(`btn_${idx}`);
        }
      });
      
      // Axes
      gp.axes.forEach((val, idx) => {
        if (val < -0.6) {
          active.add(`axis_${idx}_neg`);
        } else if (val > 0.6) {
          active.add(`axis_${idx}_pos`);
        }
      });
      
      return active;
    };

    try {
      const gps = typeof navigator !== 'undefined' ? navigator.getGamepads() : [];
      for (const gp of gps) {
        if (gp) {
          getActiveInputKeys(gp).forEach(key => initialInputs.add(key));
        }
      }
    } catch (e) {
      console.warn("Gamepad not supported or restricted:", e);
    }

    const pollGamepad = () => {
      try {
        const gps = navigator.getGamepads();
        let pressedKey: string | null = null;

        for (const gp of gps) {
          if (gp) {
            const currentActive = getActiveInputKeys(gp);
            
            // Look for any input currently active that wasn't in initial inputs
            for (const key of currentActive) {
              if (!initialInputs.has(key)) {
                pressedKey = key;
                break;
              }
            }
            
            // Clean up released inputs from initial set
            for (const key of initialInputs) {
              if (!currentActive.has(key)) {
                initialInputs.delete(key);
              }
            }
          }
          if (pressedKey !== null) break;
        }

        if (pressedKey !== null) {
          const updated = {
            ...(localGamepadControls || settings.gamepadControls || defaultGamepadControls),
            [awaitingGamepadBtnFor]: pressedKey,
          };
          setLocalGamepadControls(updated);
          
          // Check if there are any conflicts. If not, auto-save.
          const counts: Record<string, number> = {};
          let hasConflict = false;
          for (const val of Object.values(updated) as (string | number)[]) {
            if (val !== undefined && val !== null) {
              counts[String(val)] = (counts[String(val)] || 0) + 1;
              if (counts[String(val)] > 1) {
                hasConflict = true;
              }
            }
          }
          
          if (!hasConflict) {
            onUpdate({
              ...settings,
              gamepadControls: updated,
            });
          }
          (window as any).lastRemapTime = Date.now();
          (window as any).gamepadNeedsRelease = true;
          setAwaitingGamepadBtnFor(null);
        } else {
          rafId = requestAnimationFrame(pollGamepad);
        }
      } catch (e) {
        console.error("Error reading gamepad:", e);
        setAwaitingGamepadBtnFor(null);
      }
    };

    rafId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(rafId);
  }, [awaitingGamepadBtnFor, localGamepadControls, settings, onUpdate]);

  // Autofocus the first candidate when the modal is opened or when sub-menu changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const isDesktop = window.innerWidth >= 768;
      
      if (isDesktop) {
        // Find the active sidebar button
        const sidebar = document.querySelector('[data-sidebar-container="true"]');
        if (sidebar) {
          const buttons = Array.from(sidebar.querySelectorAll('button'));
          const activeBtn = buttons.find(btn => 
            btn.classList.contains('bg-indigo-900/40') || 
            btn.classList.contains('bg-yellow-900/20') || 
            btn.classList.contains('bg-red-900/20')
          ) || buttons[0];
          
          if (activeBtn) {
            activeBtn.focus({ preventScroll: true });
            return;
          }
        }
      }
      
      // On mobile or if sidebar button not found, focus the first interactive element inside the content container (excluding header)
      const contentWrapper = document.getElementById('settings-content-wrapper');
      if (contentWrapper) {
        const selector = 'button, [role="button"], .cursor-pointer, input, select, textarea, [tabindex="0"]';
        const elements = Array.from(contentWrapper.querySelectorAll(selector)) as HTMLElement[];
        const visibleCandidates = elements.filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          
          if (el.hasAttribute('disabled') || (el as any).disabled) return false;
          
          return true;
        });
        
        if (visibleCandidates.length > 0) {
          visibleCandidates[0].focus({ preventScroll: true });
          visibleCandidates[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 150);
    
    return () => clearTimeout(timer);
  }, [activeSubMenu]);

  // Compute current conflicts
  const conflicts = React.useMemo(() => {
      const issues: (keyof KeyboardControlsSettings)[] = [];
      if (!localControls) return issues;
      
      const counts: Record<string, number> = {};
      for (const key of Object.values(localControls) as string[]) {
          counts[key] = (counts[key] || 0) + 1;
      }
      
      for (const [action, key] of Object.entries(localControls) as [string, string][]) {
          if (counts[key] > 1) {
              issues.push(action as keyof KeyboardControlsSettings);
          }
      }
      return issues;
  }, [localControls]);

  useEffect(() => {
    if (!awaitingKeyFor || !localControls) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') {
         setAwaitingKeyFor(null);
         return;
      }
      
      const newControls = {
          ...localControls,
          [awaitingKeyFor]: e.code
      };
      
      setLocalControls(newControls);
      
      // Check if the new state has any conflicts. If not, we can save automatically.
      const counts: Record<string, number> = {};
      let hasConflict = false;
      for (const key of Object.values(newControls) as string[]) {
          counts[key] = (counts[key] || 0) + 1;
          if (counts[key] > 1) hasConflict = true;
      }
      
      if (!hasConflict) {
          onUpdate({
              ...settings,
              controls: newControls
          });
      }
      
      (window as any).lastRemapTime = Date.now();
      setAwaitingKeyFor(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [awaitingKeyFor, localControls, settings, onUpdate]);

  const resetKeyboardControls = () => {
    const defaultControls = DEFAULT_SETTINGS.controls;
    setLocalControls({ ...defaultControls });
    onUpdate({
      ...settings,
      controls: { ...defaultControls }
    });
  };

  const resetGamepadControls = () => {
    const defaultGP = DEFAULT_SETTINGS.gamepadControls || defaultGamepadControls;
    setLocalGamepadControls({ ...defaultGP });
    onUpdate({
      ...settings,
      gamepadControls: { ...defaultGP }
    });
  };

  const formatKeyName = (code: string) => {
    if (!code) return "NOT SET";
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return 'SPACE';
    if (code.startsWith('Shift')) return 'SHIFT';
    if (code.startsWith('Control')) return 'CTRL';
    if (code.startsWith('Alt')) return 'ALT';
    if (code === 'ArrowUp') return 'UP';
    if (code === 'ArrowDown') return 'DOWN';
    if (code === 'ArrowLeft') return 'LEFT';
    if (code === 'ArrowRight') return 'RIGHT';
    return code.toUpperCase();
  };

  const renderKeybindRow = (action: keyof KeyboardControlsSettings, label: string) => {
    const isAwaiting = awaitingKeyFor === action;
    const isConflicting = conflicts.includes(action);
    const currentKey = localControls?.[action] || settings.controls?.[action] || DEFAULT_SETTINGS.controls[action];
    
    return (
        <div className={`flex items-center justify-between p-3 rounded border transition-colors duration-300 ${isConflicting ? 'bg-red-900/60 border-red-500' : 'bg-gray-900/40 border-gray-700/50'}`}>
            <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{label}</span>
            <button
                data-remapping={isAwaiting ? "true" : undefined}
                onClick={() => {
                    (window as any).isRemappingControls = true;
                    setAwaitingKeyFor(action);
                }}
                className={`px-4 py-1.5 rounded font-bold uppercase transition-all min-w-[100px] border text-[10px] ${isAwaiting ? 'bg-indigo-900/60 border-indigo-400 text-white animate-pulse' : isConflicting ? 'bg-red-700 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
            >
                {isAwaiting ? ((strings as any).press_key || "PRESS ANY KEY...") : formatKeyName(currentKey)}
            </button>
        </div>
    );
  };

  const gamepadConflicts = React.useMemo(() => {
    const issues: (keyof GamepadControlsSettings)[] = [];
    if (!localGamepadControls) return issues;

    const counts: Record<string, number> = {};
    for (const val of Object.values(localGamepadControls) as (string | number)[]) {
      if (val !== undefined && val !== null) {
        counts[String(val)] = (counts[String(val)] || 0) + 1;
      }
    }

    for (const [action, val] of Object.entries(localGamepadControls) as [string, string | number][]) {
      if (val !== undefined && val !== null && counts[String(val)] > 1) {
        issues.push(action as keyof GamepadControlsSettings);
      }
    }
    return issues;
  }, [localGamepadControls]);

  const renderGamepadControlsRow = (action: keyof GamepadControlsSettings, label: string) => {
    const isAwaiting = awaitingGamepadBtnFor === action;
    const isConflicting = gamepadConflicts.includes(action);
    const currentBtn = localGamepadControls?.[action] !== undefined
      ? localGamepadControls[action]
      : settings.gamepadControls?.[action] !== undefined
        ? settings.gamepadControls[action]
        : defaultGamepadControls[action];

    return (
      <div className={`flex items-center justify-between p-3 rounded border transition-colors duration-300 ${isConflicting ? 'bg-red-900/60 border-red-500' : 'bg-gray-900/40 border-gray-700/50'}`}>
        <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{label}</span>
        <button
          data-remapping={isAwaiting ? "true" : undefined}
          onClick={() => {
              (window as any).isRemappingControls = true;
              setAwaitingGamepadBtnFor(action);
          }}
          className={`flex items-center justify-center p-1 px-3 rounded font-bold uppercase transition-all min-w-[100px] min-h-[36px] border text-[10px] ${isAwaiting ? 'bg-indigo-900/60 border-indigo-400 text-white animate-pulse' : isConflicting ? 'bg-red-700 border-red-500 text-white hover:bg-red-650' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-650'}`}
        >
          {isAwaiting ? ((strings as any).press_gamepad || "PRESS BUTTON...") : renderGamepadIconOrLabel(currentBtn)}
        </button>
      </div>
    );
  };

  const renderControlsContent = () => (
      <div className="p-6 space-y-3 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
          {/* Invert Context Buttons Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 mb-3 animate-fade-in">
              <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-gray-200 tracking-wider text-xs uppercase flex items-center gap-1.5">
                      {(strings as any).invert_context_buttons || "INVERT CONTEXT BUTTONS"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                      {(strings as any).invert_context_buttons_desc || "Swap Left and Right context action buttons"}
                  </span>
              </div>
              <button
                  onClick={() => onUpdate({ ...settings, invertContextButtons: !settings.invertContextButtons })}
                  className={`py-2 px-4 rounded border font-bold uppercase transition-all text-xs min-w-[80px] ${settings.invertContextButtons ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500 hover:bg-gray-600 hover:text-gray-300'}`}
              >
                  {settings.invertContextButtons ? (strings as any).on || "ON" : (strings as any).off || "OFF"}
              </button>
          </div>

          {/* Controls Type Selector */}
          <div className="flex flex-col gap-2 p-3 bg-gray-900/40 rounded border border-gray-700/50 mb-4 animate-fade-in">
              <span className="font-bold text-gray-200 tracking-wider text-xs uppercase mb-1">{(strings as any).controls_type || "INPUT DEVICE"}</span>
              <div className="grid grid-cols-2 gap-3">
                  <button 
                      onClick={() => onUpdate({ ...settings, controlType: 'keyboard' })}
                      className={`py-2 rounded border font-bold uppercase transition-all text-xs ${(!settings.controlType || settings.controlType === 'keyboard') ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500 hover:bg-gray-600 hover:text-gray-300'}`}
                  >
                      {(strings as any).controls_keyboard || "KEYBOARD"}
                  </button>
                  <button 
                      onClick={() => onUpdate({ ...settings, controlType: 'gamepad' })}
                      className={`py-2 rounded border font-bold uppercase transition-all text-xs ${settings.controlType === 'gamepad' ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500 hover:bg-gray-600 hover:text-gray-300'}`}
                  >
                      {(strings as any).controls_gamepad || "GAMEPAD"}
                  </button>
              </div>
          </div>

          {(!settings.controlType || settings.controlType === 'keyboard') ? (
              <div className="space-y-3">
                  <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">{(strings as any).controls_desc || "KEYBOARD MAPPING"}</p>
                  
                  {renderKeybindRow('moveForward', (strings as any).ctrl_move_forward || "MOVE FORWARD")}
                  {renderKeybindRow('moveBackward', (strings as any).ctrl_move_backward || "MOVE BACKWARD")}
                  {renderKeybindRow('turnLeft', (strings as any).ctrl_turn_left || "TURN LEFT")}
                  {renderKeybindRow('turnRight', (strings as any).ctrl_turn_right || "TURN RIGHT")}
                  {renderKeybindRow('strafeLeft', (strings as any).ctrl_strafe_left || "STRAFE LEFT")}
                  {renderKeybindRow('strafeRight', (strings as any).ctrl_strafe_right || "STRAFE RIGHT")}
                  {renderKeybindRow('interact', (strings as any).ctrl_interact || "INTERACT")}
                  {renderKeybindRow('shoot', (strings as any).ctrl_shoot || "AIM")}
                  {renderKeybindRow('toggleLook', (strings as any).ctrl_look || "LOOK AROUND")}
                  {renderKeybindRow('skipTurn', (strings as any).ctrl_skip || "SKIP TURN")}
                  {renderKeybindRow('reload', (strings as any).ctrl_reload || "RELOAD")}
                  {renderKeybindRow('inventory', (strings as any).ctrl_inventory || "INVENTORY")}
                  {renderKeybindRow('statsMenu', (strings as any).ctrl_stats || "STATS MENU")}
                  {renderKeybindRow('equipMenu', (strings as any).ctrl_equip || "EQUIP MENU")}

                  <div className="pt-4 border-t border-gray-700/50 mt-4">
                      <button
                          onClick={resetKeyboardControls}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-red-950/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-bold uppercase tracking-widest active:scale-95 transition-all rounded shadow-md text-xs"
                      >
                          <RotateCcw size={14} />
                          {(strings as any).reset_controls || "RESET CONTROL SETTINGS"}
                      </button>
                  </div>
              </div>
          ) : (
              <div className="space-y-4 animate-fade-in">
                  <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">{(strings as any).gamepad_mapping_title || "GAMEPAD MAPPING"}</p>
                  
                  <div className="space-y-3">
                      {renderGamepadControlsRow('moveForward', (strings as any).ctrl_gp_move_forward || "MOVE FORWARD")}
                      {renderGamepadControlsRow('moveBackward', (strings as any).ctrl_gp_move_backward || "MOVE BACKWARD")}
                      {renderGamepadControlsRow('turnLeft', (strings as any).ctrl_gp_turn_left || "TURN LEFT")}
                      {renderGamepadControlsRow('turnRight', (strings as any).ctrl_gp_turn_right || "TURN RIGHT")}
                      {renderGamepadControlsRow('strafeLeft', (strings as any).ctrl_gp_strafe_left || "STRAFE LEFT")}
                      {renderGamepadControlsRow('strafeRight', (strings as any).ctrl_gp_strafe_right || "STRAFE RIGHT")}
                      {renderGamepadControlsRow('interact', (strings as any).ctrl_interact || "INTERACT")}
                      {renderGamepadControlsRow('toggleAiming', (strings as any).ctrl_gp_toggle_aiming || "AIMING")}
                      {renderGamepadControlsRow('toggleLook', (strings as any).ctrl_look || "LOOK AROUND")}
                      {renderGamepadControlsRow('skipTurn', (strings as any).ctrl_skip || "SKIP TURN")}
                      {renderGamepadControlsRow('reload', (strings as any).ctrl_reload || "RELOAD")}
                      {renderGamepadControlsRow('inventory', (strings as any).ctrl_inventory || "INVENTORY")}
                      {renderGamepadControlsRow('statsMenu', (strings as any).ctrl_stats || "STATS MENU")}
                      {renderGamepadControlsRow('equipMenu', (strings as any).ctrl_equip || "EQUIP MENU")}
                      {renderGamepadControlsRow('leftContext', (strings as any).ctrl_gp_left_context || "LEFT CONTEXT BUTTON")}
                      {renderGamepadControlsRow('rightContext', (strings as any).ctrl_gp_right_context || "RIGHT CONTEXT BUTTON")}
                      {renderGamepadControlsRow('sectorDetails', (strings as any).ctrl_gp_sector_details || "SECTOR DETAILS")}
                      {renderGamepadControlsRow('pauseMenu', (strings as any).ctrl_pause || "PAUSE")}
                  </div>

                  <div className="pt-4 border-t border-gray-700/50 mt-4">
                      <button
                          onClick={resetGamepadControls}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-red-950/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-bold uppercase tracking-widest active:scale-95 transition-all rounded shadow-md text-xs"
                      >
                          <RotateCcw size={14} />
                          {(strings as any).reset_controls || "RESET CONTROL SETTINGS"}
                      </button>
                  </div>
              </div>
          )}

          <div className="pt-4 md:hidden text-center">
              <button 
                  onClick={() => setActiveSubMenu('main')}
                  className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
              >
                  {strings.btn_close}
              </button>
          </div>
      </div>
  );

  const toggleVibration = () => {
    onUpdate({ ...settings, vibration: !settings.vibration });
  };


  const toggleFullscreen = () => {
    const isFull = !!document.fullscreenElement;
    if (!isFull) {
         document.documentElement.requestFullscreen().catch(e => console.log(e));
         onUpdate({ ...settings, fullscreen: true });
    } else {
         document.exitFullscreen().catch(e => console.log(e));
         onUpdate({ ...settings, fullscreen: false });
    }
  };

  const setLanguage = (lang: 'en' | 'ru') => {
    onUpdate({ ...settings, language: lang });
  };

  const uiStrings = saveLoadStrings || {
      btn_export: "Export",
      btn_import: "Import",
      loaded_success: "Game loaded successfully.",
      load_error: "Data corruption / load error."
  };

  const handleExport = () => {
      const exportData = {
          slot1: localStorage.getItem('deadstorm_save_1'),
          slot2: localStorage.getItem('deadstorm_save_2'),
          slot3: localStorage.getItem('deadstorm_save_3'),
      };
      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      a.download = `Dead_Storm_${dateStr}.dss`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleImport = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.dss';
      input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (event) => {
              try {
                  const data = JSON.parse(event.target?.result as string);
                  if (data.slot1 !== undefined) {
                      if (data.slot1) localStorage.setItem('deadstorm_save_1', data.slot1);
                      else localStorage.removeItem('deadstorm_save_1');
                  }
                  if (data.slot2 !== undefined) {
                      if (data.slot2) localStorage.setItem('deadstorm_save_2', data.slot2);
                      else localStorage.removeItem('deadstorm_save_2');
                  }
                  if (data.slot3 !== undefined) {
                      if (data.slot3) localStorage.setItem('deadstorm_save_3', data.slot3);
                      else localStorage.removeItem('deadstorm_save_3');
                  }
                  setRefreshKey(prev => prev + 1);
                  if (engine?.addLog && isGameStarted) {
                      engine.addLog(uiStrings.loaded_success || "Saves imported.", 'SUCCESS');
                  } else {
                      alert(uiStrings.loaded_success || "Saves imported.");
                  }
              } catch (err) {
                  console.error("Failed to parse .dss file", err);
                  if (engine?.addLog && isGameStarted) {
                       engine.addLog(uiStrings.load_error || "Error importing.", 'DANGER');
                  } else {
                       alert(uiStrings.load_error || "Error importing.");
                  }
              }
          };
          reader.readAsText(file);
      };
      input.click();
  };

  const renderHeader = () => {
    let title = strings.title;
    let Icon: any = Settings;
    if (activeSubMenu === 'saves') {
        title = (strings as any).save_management || "SAVE MANAGEMENT";
        Icon = Save;
    } else if (activeSubMenu === 'graphics') {
        title = (strings as any).graphics || "GRAPHICS";
        Icon = Image;
    } else if (activeSubMenu === 'audio') {
        title = strings.audio_title || "AUDIO";
        Icon = Volume2;
    } else if (activeSubMenu === 'debug') {
        title = strings.debug || "DEBUG";
        Icon = Terminal;
    } else if (activeSubMenu === 'controls') {
        title = (strings as any).controls || "CONTROLS";
        Icon = Keyboard;
    } else if (activeSubMenu === 'achievements') {
        title = engine?.strings?.achievements?.title || "ACHIEVEMENTS";
        Icon = TrophyIcon;
    }

    return (
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10 relative no-gamepad-nav">
          <div className="flex items-center gap-2">
            <button 
                onClick={() => activeSubMenu === 'main' ? onClose() : setActiveSubMenu('main')} 
                className="text-gray-400 md:hidden hover:text-white active:scale-95 transition-all flex items-center justify-center mr-1"
            >
                <ChevronLeft size={24} />
            </button>
            <Icon size={18} className="text-gray-400" />
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">{title}</h2>
          </div>
          <button 
              onClick={onClose} 
              className="hidden md:flex text-gray-400 hover:text-white active:scale-95 transition-all items-center justify-center gamepad-hide-buttons"
          >
              <X size={24} />
          </button>
        </div>
    );
  };

  const isDevMode = localStorage.getItem('deadstorm_dev_mode') === 'true';

  const handlePlayTutorial = () => {
    sessionStorage.setItem('deadstorm_next_game_path', TUTORIAL_SECTOR_PATH);
    onClose();
    if (engine) {
       engine.setGameState('CHAR_SELECT');
    }
  };

  const renderMainContent = () => (
    <div className="p-6 space-y-6 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
        
        {/* Achievements Button */}
        {engine && engine.strings?.achievements && (
            <button 
                onClick={() => setActiveSubMenu('achievements')}
                className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-yellow-900/30 transition-colors group"
            >
                <div className="flex items-center gap-3">
                    <TrophyIcon />
                    <span className="font-bold text-gray-200 tracking-wider text-sm uppercase group-hover:text-yellow-400 transition-colors">{engine.strings.achievements.title}</span>
                </div>
                <ChevronRight className="text-gray-500 group-hover:text-yellow-500 transition-colors" size={20} />
            </button>
        )}

        {/* Vibration Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Smartphone className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.vibration}</span>
            </div>
            <button 
                onClick={toggleVibration}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.vibration ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.vibration ? strings.on : strings.off}
            </button>
        </div>

        {/* Graphics Button */}
        <button 
            onClick={() => setActiveSubMenu('graphics')}
            className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <Image className="text-gray-400" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).graphics || "GRAPHICS"}</span>
            </div>
            <ChevronRight className="text-gray-500 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        {/* Audio Button */}
        <button 
            onClick={() => setActiveSubMenu('audio')}
            className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <Volume2 className="text-gray-400" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{strings.audio_title || "AUDIO"}</span>
            </div>
            <ChevronRight className="text-gray-500 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        {/* Controls Button */}
        <button 
            onClick={() => setActiveSubMenu('controls')}
            className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <Keyboard className="text-gray-400" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).controls || "CONTROLS"}</span>
            </div>
            <ChevronRight className="text-gray-500 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        {/* Language Selection - Hidden if game started to avoid re-localization issues during active session */}
        {!isGameStarted && (
          <div className="flex flex-col gap-3 p-3 bg-gray-900/40 rounded border border-gray-700/50">
              <div className="flex items-center gap-3 mb-1">
                  <Globe className="text-gray-400" size={20} />
                  <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.language}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                  <button 
                      onClick={() => setLanguage('en')}
                      className={`py-3 rounded border font-bold uppercase transition-all text-xs ${settings.language === 'en' ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-400 active:bg-gray-700'}`}
                  >
                      ENGLISH
                  </button>
                  <button 
                      onClick={() => setLanguage('ru')}
                      className={`py-3 rounded border font-bold uppercase transition-all text-xs ${settings.language === 'ru' ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-400 active:bg-gray-700'}`}
                  >
                      РУССКИЙ
                  </button>
              </div>
          </div>
        )}

        {/* Tutorial Button */}
        <button 
            onClick={handlePlayTutorial}
            className="w-full flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group text-left"
        >
            <div className="flex items-center gap-3">
                <svg 
                    viewBox="0 0 32 32" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5 text-gray-400 group-hover:text-indigo-400 transition-colors fill-current"
                >
                    <path d="M 16 4.875 L 15.53125 5.125 L 2.03125 12.125 L 0.3125 13 L 2 13.84375 L 2 22.28125 C 1.402344 22.628906 1 23.261719 1 24 C 1 25.105469 1.894531 26 3 26 C 4.105469 26 5 25.105469 5 24 C 5 23.261719 4.597656 22.628906 4 22.28125 L 4 14.875 L 6 15.90625 L 6 21 C 6 21.441406 6.203125 21.839844 6.4375 22.09375 C 6.671875 22.347656 6.957031 22.5 7.25 22.65625 C 7.839844 22.964844 8.539063 23.183594 9.40625 23.375 C 11.140625 23.761719 13.453125 24 16 24 C 18.546875 24 20.859375 23.761719 22.59375 23.375 C 23.460938 23.183594 24.160156 22.964844 24.75 22.65625 C 25.042969 22.5 25.328125 22.347656 25.5625 22.09375 C 25.796875 21.839844 26 21.441406 26 21 L 26 15.90625 L 29.96875 13.875 L 31.6875 13 L 29.96875 12.125 L 16.46875 5.125 Z M 16 7.125 L 27.3125 13 L 25.53125 13.90625 C 25.304688 13.667969 25.03125 13.492188 24.75 13.34375 C 24.164063 13.035156 23.460938 12.816406 22.59375 12.625 C 20.863281 12.238281 18.558594 12 16 12 C 13.441406 12 11.136719 12.238281 9.40625 12.625 C 8.539063 12.816406 7.835938 13.035156 7.25 13.34375 C 6.96875 13.492188 6.695313 13.667969 6.46875 13.90625 L 4.6875 13 Z M 16 14 C 18.441406 14 20.636719 14.222656 22.15625 14.5625 C 22.914063 14.730469 23.523438 14.925781 23.84375 15.09375 C 23.945313 15.148438 23.960938 15.1875 24 15.21875 L 24 19.03125 C 23.582031 18.878906 23.125 18.742188 22.59375 18.625 C 20.859375 18.238281 18.546875 18 16 18 C 13.453125 18 11.140625 18.238281 9.40625 18.625 C 8.875 18.742188 8.417969 18.878906 8 19.03125 L 8 15.21875 C 8.039063 15.1875 8.054688 15.148438 8.15625 15.09375 C 8.476563 14.925781 9.085938 14.730469 9.84375 14.5625 C 11.363281 14.222656 13.558594 14 16 14 Z M 16 20 C 18.425781 20 20.632813 20.222656 22.15625 20.5625 C 22.789063 20.703125 23.1875 20.851563 23.53125 21 C 23.1875 21.148438 22.789063 21.296875 22.15625 21.4375 C 20.632813 21.777344 18.425781 22 16 22 C 13.574219 22 11.367188 21.777344 9.84375 21.4375 C 9.210938 21.296875 8.8125 21.148438 8.46875 21 C 8.8125 20.851563 9.210938 20.703125 9.84375 20.5625 C 11.367188 20.222656 13.574219 20 16 20 Z" />
                </svg>
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).tutorial_btn || "TUTORIAL"}</span>
            </div>
            <ChevronRight className="text-gray-500 group-hover:text-indigo-400 transition-colors" size={20} />
        </button>

        {/* Save Management Button */}
        <button 
            onClick={() => setActiveSubMenu('saves')}
            className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <Save className="text-gray-400" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).save_management || "SAVE MANAGEMENT"}</span>
            </div>
            <ChevronRight className="text-gray-500 group-hover:text-gray-400 transition-colors" size={20} />
        </button>

        {/* Editor Button */}
        {!isGameStarted && onOpenEditor && isDevMode && (
            <button 
                onClick={onOpenEditor}
                className="w-full flex md:hidden items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
            >
                <div className="flex items-center gap-3">
                    <Terminal className="text-indigo-400" size={20} />
                    <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).editor || "StormEd"}</span>
                </div>
                <ChevronRight className="text-gray-500 group-hover:text-indigo-400 transition-colors" size={20} />
            </button>
        )}

        {/* Debug Button - Now opens inside the menu */}
        {isDevMode && (
        <button 
            onClick={() => setActiveSubMenu('debug')}
            className="w-full flex md:hidden items-center justify-between p-3 bg-red-950/20 rounded border border-red-900/40 hover:bg-red-900/30 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <Terminal className="text-red-500" size={20} />
                <span className="font-bold text-red-400 tracking-wider text-sm uppercase">{strings.debug || "DEBUG"}</span>
            </div>
            <ChevronRight className="text-red-900 group-hover:text-red-500 transition-colors" size={20} />
        </button>
        )}

        {/* Reset Settings Button */}
        <button 
            onClick={() => onUpdate(DEFAULT_SETTINGS)}
            className="w-full flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 hover:bg-gray-800/60 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <RotateCcw className="text-gray-400 group-hover:text-gray-300 transition-colors" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).reset || "RESET SETTINGS"}</span>
            </div>
        </button>

        {/* Footer Action */}
        <div className="pt-2 md:hidden gamepad-hide-buttons">
            <button 
                onClick={onClose}
                className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
            >
                {strings.btn_close}
            </button>
        </div>
    </div>
  );

  const hasAnySave = !!(localStorage.getItem('deadstorm_save_1') || localStorage.getItem('deadstorm_save_2') || localStorage.getItem('deadstorm_save_3'));

  const renderSavesContent = () => (
      <div className="p-6 space-y-6 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
          <div className="flex flex-col gap-4">
              <button 
                  onClick={handleImport}
                  className="w-full p-4 bg-gray-900/40 border border-gray-700/50 hover:bg-gray-800/60 transition-colors rounded group flex items-center justify-between"
              >
                  <div className="flex items-center gap-3">
                      <FileDown className="text-gray-400" size={24} />
                      <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).btn_import_saves || "IMPORT SAVES"}</span>
                  </div>
              </button>
              <button 
                  onClick={() => { if (hasAnySave) handleExport(); }}
                  disabled={!hasAnySave}
                  className={`w-full p-4 rounded border transition-colors flex items-center justify-between ${hasAnySave ? 'bg-gray-900/40 border-gray-700/50 hover:bg-gray-800/60 active:bg-gray-700' : 'bg-gray-900/20 border-gray-800 cursor-not-allowed opacity-50'}`}
              >
                  <div className="flex items-center gap-3">
                      <FileUp className={hasAnySave ? "text-gray-400" : "text-gray-600"} size={24} />
                      <span className="font-bold text-gray-200 tracking-wider text-sm uppercase">{(strings as any).btn_export_saves || "EXPORT SAVES"}</span>
                  </div>
              </button>
          </div>
          
          <div className="pt-2 md:hidden">
              <button 
                  onClick={() => setActiveSubMenu('main')}
                  className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
              >
                  {strings.btn_close}
              </button>
          </div>
      </div>
  );

  const renderGraphicsContent = () => (
    <div className="p-6 space-y-6 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
        {/* Fullscreen Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Maximize className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.fullscreen}</span>
            </div>
            <button 
                onClick={toggleFullscreen}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.fullscreen ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.fullscreen ? strings.on : strings.off}
            </button>
        </div>

        {/* Resolution Selector */}
        <div className="flex flex-col gap-3 p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3 mb-1">
                <Monitor className="text-gray-400" size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.resolution}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {(['LOW', 'MEDIUM', 'HIGH', 'CUSTOM'] as const).map((res) => (
                    <button
                        key={res}
                        onClick={() => onUpdate({ ...settings, resolution: res })}
                        className={`py-2 px-1 rounded border font-bold uppercase transition-all text-[10px] ${settings.resolution === res ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-400 active:bg-gray-700'}`}
                    >
                        {res === 'LOW' ? strings.resolution_low : 
                         res === 'MEDIUM' ? strings.resolution_medium : 
                         res === 'HIGH' ? strings.resolution_high : 
                         strings.resolution_custom}
                    </button>
                ))}
            </div>
            
            {/* Custom Resolution Slider */}
            {settings.resolution === 'CUSTOM' && (
                <div className="mt-2 px-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
                        <span>0.2x</span>
                        <span className="text-indigo-400 font-bold">{(settings.customResolutionScale || 1.0).toFixed(2)}x</span>
                        <span>4.0x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.2" 
                        max="4.0" 
                        step="0.1"
                        value={settings.customResolutionScale || 1.0}
                        onChange={(e) => onUpdate({ ...settings, customResolutionScale: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                    />
                </div>
            )}
        </div>

        {/* CRT Effect Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Monitor className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.crt_effect || "CRT EFFECT"}</span>
            </div>
            <button 
                onClick={() => onUpdate({ ...settings, crtEffect: !settings.crtEffect })}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.crtEffect ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.crtEffect ? strings.on : strings.off}
            </button>
        </div>

        {/* LCD Ghosting Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Ghost className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{(strings as any).lcd_ghosting || "CONSOLE GHOSTING EFFECT"}</span>
            </div>
            <button 
                onClick={() => onUpdate({ ...settings, lcdGhosting: settings.lcdGhosting === false })}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.lcdGhosting !== false ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.lcdGhosting !== false ? strings.on : strings.off}
            </button>
        </div>

        {/* Viewport Smoothing Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Monitor className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.viewport_smoothing || "VIEWPORT SMOOTHING"}</span>
            </div>
            <button 
                onClick={() => onUpdate({ ...settings, viewportSmoothing: !settings.viewportSmoothing })}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.viewportSmoothing ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.viewportSmoothing ? strings.on : strings.off}
            </button>
        </div>

        {/* Texture Filtering Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
            <div className="flex items-center gap-3">
                <Image className="text-gray-400" size={24} />
                <span className="font-bold text-gray-200 tracking-wider text-sm">{strings.texture_filtering || "TEXTURE FILTERING"}</span>
            </div>
            <button 
                onClick={() => onUpdate({ ...settings, textureFiltering: !settings.textureFiltering })}
                className={`px-4 py-2 rounded font-bold uppercase transition-all min-w-[80px] border text-xs ${settings.textureFiltering ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.15)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
            >
                {settings.textureFiltering ? strings.on : strings.off}
            </button>
        </div>



        {/* Footer Action */}
        <div className="pt-2 md:hidden">
            <button 
                onClick={() => setActiveSubMenu('main')}
                className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
            >
                {strings.btn_close}
            </button>
        </div>
    </div>
  );

  const renderSlider = (
    label: string, 
    value: number, 
    onChange: (val: number) => void,
    Icon: React.ElementType,
    color: string
  ) => (
    <div className="flex flex-col gap-2 p-3 bg-gray-900/40 rounded border border-gray-700/50">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Icon className={color} size={20} />
                <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{label}</span>
            </div>
            <span className={`font-mono text-xs font-bold ${color}`}>{value}%</span>
        </div>
        <input 
            type="range" 
            min="0" 
            max="100" 
            value={value} 
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
        />
    </div>
  );

  const renderAudioContent = () => (
    <div className="p-6 space-y-6 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
        {renderSlider(
            strings.volume_master || "MASTER", 
            settings.volume.master, 
            (v) => onUpdate({ ...settings, volume: { ...settings.volume, master: v } }), 
            Volume2, 
            "text-gray-400"
        )}

        {renderSlider(
            strings.volume_music || "MUSIC", 
            settings.volume.music, 
            (v) => onUpdate({ ...settings, volume: { ...settings.volume, music: v } }), 
            Music, 
            "text-gray-400"
        )}

        {renderSlider(
            strings.volume_sound || "SFX", 
            settings.volume.sound, 
            (v) => onUpdate({ ...settings, volume: { ...settings.volume, sound: v } }), 
            Speaker, 
            "text-gray-400"
        )}

        {renderSlider(
            strings.volume_voice || "VOICE", 
            settings.volume.voice ?? 100, 
            (v) => onUpdate({ ...settings, volume: { ...settings.volume, voice: v } }), 
            Mic, 
            "text-gray-400"
        )}

        {/* Footer Action */}
        <div className="pt-2 md:hidden">
            <button 
                onClick={() => setActiveSubMenu('main')}
                className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
            >
                {strings.btn_close}
            </button>
        </div>
    </div>
  );

  const renderToggleItem = (
    label: string, 
    subLabel: string, 
    isActive: boolean, 
    onClick: () => void, 
    Icon: React.ElementType, 
    iconColor: string
  ) => (
    <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
        <div className="flex items-center gap-3">
            <Icon className={iconColor} size={20} />
            <div className="flex flex-col">
                <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{label}</span>
                <span className="text-[9px] text-gray-500">{subLabel}</span>
            </div>
        </div>
        <button 
            onClick={onClick}
            className={`px-4 py-1.5 rounded font-bold uppercase transition-all min-w-[70px] border text-[10px] ${isActive ? 'bg-indigo-900/40 border-indigo-600 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'bg-gray-700 border-gray-600 text-gray-500'}`}
        >
            {isActive ? strings.on : strings.off}
        </button>
    </div>
  );

  const renderDebugContent = () => (
    <div className="p-6 space-y-4 bg-gray-800/95 overflow-y-auto flex-1 h-full scroll-smooth">
        {renderToggleItem(
            strings.debug_textures || "RENDER TEXTURES", 
            strings.debug_textures_desc || "TOGGLE ENVIRONMENT MAPPING", 
            settings.debug.textures, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, textures: !settings.debug.textures } }), 
            Layout, 
            "text-gray-400"
        )}

        {renderToggleItem(
            strings.debug_godmode || "GOD MODE", 
            strings.debug_godmode_desc || "PREVENT ALL DAMAGE", 
            settings.debug.godMode, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, godMode: !settings.debug.godMode } }), 
            ShieldAlert, 
            "text-gray-400"
        )}

        {renderToggleItem(
            (strings as any).debug_noclip || "NOCLIP", 
            (strings as any).debug_noclip_desc || "TOGGLE COLLISION", 
            settings.debug.noclip || false, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, noclip: !settings.debug.noclip } }), 
            Ghost, 
            "text-gray-400"
        )}

        {renderToggleItem(
            (strings as any).debug_forcesoft || "CPU RENDERER", 
            (strings as any).debug_forcesoft_desc || "FORCE SOFTWARE PROGRAM RENDER", 
            settings.debug.forceSoftRenderer || false, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, forceSoftRenderer: !settings.debug.forceSoftRenderer } }), 
            Cpu, 
            "text-gray-400"
        )}

        {renderToggleItem(
            (strings as any).debug_auto_res || "AUTO RESOLUTION", 
            (strings as any).debug_auto_res_desc || "DYNAMICALLY LOWER INTERNAL RES IN HEAVY SCENES", 
            settings.debug.autoResolution !== false, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, autoResolution: settings.debug.autoResolution !== false ? false : true } }), 
            Zap, 
            "text-gray-400"
        )}

        {renderToggleItem(
            strings.debug_timer || "COMBAT TIMER", 
            strings.debug_timer_desc || "DISABLE TURN LIMITS", 
            settings.debug.combatTimer, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, combatTimer: !settings.debug.combatTimer } }), 
            Timer, 
            "text-gray-400"
        )}

        {renderToggleItem(
            strings.debug_fps || "SHOW FPS", 
            strings.debug_fps_desc || "REALTIME PERFORMANCE", 
            settings.debug.showFps, 
            () => onUpdate({ ...settings, debug: { ...settings.debug, showFps: !settings.debug.showFps } }), 
            BarChart3, 
            "text-gray-400"
        )}

        {/* AI Settings */}
        {renderToggleItem(
            strings.debug_ai || "ENEMY AI",
            strings.debug_ai_desc || "ENABLE ROAMING BEHAVIOR",
            settings.debug.aiEnabled,
            () => onUpdate({ ...settings, debug: { ...settings.debug, aiEnabled: !settings.debug.aiEnabled } }),
            Brain,
            "text-gray-400"
        )}

        {renderToggleItem(
            strings.debug_ai_viz || "AI DEBUG",
            strings.debug_ai_viz_desc || "SHOW PATROL ZONES & PATHS",
            settings.debug.aiDebug,
            () => onUpdate({ ...settings, debug: { ...settings.debug, aiDebug: !settings.debug.aiDebug } }),
            Map,
            "text-gray-400"
        )}

        {renderToggleItem(
            strings.debug_pit_line_vis || "PIT LINE OF SIGHT",
            strings.debug_pit_line_vis_desc || "SHOW LINE OF SIGHT TO ENEMIES WHEN ON DIFFERENT HEIGHT",
            !!settings.debug.pitLineVis,
            () => onUpdate({ ...settings, debug: { ...settings.debug, pitLineVis: !settings.debug.pitLineVis } }),
            Map,
            "text-gray-400"
        )}

        {/* Voice Debug Toggle */}
        {renderToggleItem(
            strings.debug_voice || "VOICE DEBUG",
            strings.debug_voice_desc || "ENABLE VOICE TUNING",
            !!settings.debug.voiceDebug,
            () => onUpdate({ ...settings, debug: { ...settings.debug, voiceDebug: !settings.debug.voiceDebug } }),
            Mic,
            "text-gray-400"
        )}

        {/* Combat Overlay Debug Toggle */}
        {renderToggleItem(
            (strings as any).debug_combat_overlay || "COMBAT OVERLAY DEBUG",
            (strings as any).debug_combat_overlay_desc || "ALWAYS SHOW COMBAT INTERFACE FOR NEAREST FRONT ENEMY",
            !!settings.debug.combatOverlayDebug,
            () => onUpdate({ ...settings, debug: { ...settings.debug, combatOverlayDebug: !settings.debug.combatOverlayDebug } }),
            Terminal,
            "text-gray-400"
        )}

        {/* Lightning 5 Seconds Mode Toggle */}
        {renderToggleItem(
            (strings as any).debug_lightning_5s || "LIGHTNING 5S",
            (strings as any).debug_lightning_5s_desc || "FORCE RAIN LIGHTNING STRIKES EXACTLY EVERY 5 SECONDS",
            !!settings.debug.lightning5s,
            () => onUpdate({ ...settings, debug: { ...settings.debug, lightning5s: !settings.debug.lightning5s } }),
            Zap,
            "text-gray-400"
        )}

        {/* Magenta Shadows Toggle */}
        {renderToggleItem(
            "MAGENTA SHADOWS",
            "PAINT RENDERED SPRITE SHADOWS MAGENTA FOR TEST VISIBILITY",
            !!settings.debug.magentaShadows,
            () => onUpdate({ ...settings, debug: { ...settings.debug, magentaShadows: !settings.debug.magentaShadows } }),
            Eye,
            "text-gray-400"
        )}

        {/* Disable Shadows Toggle */}
        {renderToggleItem(
            (strings as any).debug_disable_shadows || "DISABLE SHADOWS",
            (strings as any).debug_disable_shadows_desc || "COMPLETELY DISABLES SPRITE SHADOW RENDER",
            !!settings.debug.disableShadows,
            () => onUpdate({ ...settings, debug: { ...settings.debug, disableShadows: !settings.debug.disableShadows } }),
            Moon,
            "text-gray-400"
        )}

        {/* Disable Distance Shading Toggle */}
        {renderToggleItem(
            (strings as any).debug_disable_distance_shading || "DISABLE DISTANCE SHADING",
            (strings as any).debug_disable_distance_shading_desc || "DISABLES GEOMETRY DARKENING AT A DISTANCE",
            !!settings.debug.disableDistanceShading,
            () => onUpdate({ ...settings, debug: { ...settings.debug, disableDistanceShading: !settings.debug.disableDistanceShading } }),
            Sun,
            "text-gray-400"
        )}



        {/* Level Up Button */}
        {onLevelUp && (
          <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50">
              <div className="flex items-center gap-3">
                  <ChevronUp className="text-gray-400" size={20} />
                  <div className="flex flex-col">
                      <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{strings.debug_levelup || "LEVEL UP"}</span>
                      <span className="text-[9px] text-gray-500">GAIN 1 LEVEL</span>
                  </div>
              </div>
              <button 
                  onClick={onLevelUp}
                  className="px-4 py-1.5 rounded font-bold uppercase transition-all min-w-[70px] border text-[10px] bg-indigo-900/40 border-indigo-600 text-indigo-400 hover:bg-indigo-800/50 active:scale-95"
              >
                  +1 LVL
              </button>
          </div>
        )}

        {/* Reset Achievements */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 mt-4">
            <div className="flex items-center gap-3">
                <TrophyIcon className="text-gray-400" size={20} />
                <div className="flex flex-col">
                    <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{(strings as any).debug_reset_achievements || "RESET ACHIEVEMENTS"}</span>
                    <span className="text-[9px] text-gray-500">{(strings as any).debug_reset_achievements_desc || "CLEAR ALL PROGRESS"}</span>
                </div>
            </div>
            <button 
                onClick={() => window.dispatchEvent(new CustomEvent('achievement-reset'))}
                className="px-4 py-1.5 rounded font-bold uppercase transition-all min-w-[70px] border text-[10px] bg-indigo-900/40 border-indigo-600 text-indigo-400 hover:bg-indigo-800/50 active:scale-95"
            >
                RESET
            </button>
        </div>

        {/* Reset Tutorial Prompt */}
        <div className="flex items-center justify-between p-3 bg-gray-900/40 rounded border border-gray-700/50 mt-4">
            <div className="flex items-center gap-3">
                <Brain className="text-gray-400" size={20} />
                <div className="flex flex-col">
                    <span className="font-bold text-gray-200 tracking-wider text-xs uppercase">{(strings as any).debug_reset_tutorial || "RESET TUTORIAL PROMPT"}</span>
                    <span className="text-[9px] text-gray-500">{(strings as any).debug_reset_tutorial_desc || "PROMPT WILL APPEAR ON NEXT START"}</span>
                </div>
            </div>
            <button 
                onClick={() => {
                    localStorage.removeItem('deadstorm_tutorial_prompted');
                    setResetPerformed(true);
                    setTimeout(() => setResetPerformed(false), 2005);
                }}
                className="px-4 py-1.5 rounded font-bold uppercase transition-all min-w-[70px] border text-[10px] bg-indigo-900/40 border-indigo-600 text-indigo-400 hover:bg-indigo-800/50 active:scale-95"
            >
                {resetPerformed ? (settings.language === 'ru' ? "СБРОШЕНО" : "DONE") : "RESET"}
            </button>
        </div>

        {/* Footer Action */}
        <div className="pt-2 md:hidden">
            <button 
                onClick={() => setActiveSubMenu('main')}
                className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs"
            >
                {strings.btn_close}
            </button>
        </div>
    </div>
  );

  const getAchievementIcon = (key: string, className = "w-8 h-8 text-yellow-400") => {
      const ach = achievementsData.find(a => a.key === key);
      if (!ach) {
          return <Trophy className={className} />;
      }
      const icon = ach.icon || '';
      if (icon.trim().startsWith('<svg')) {
          return (
              <div 
                  className={`${className} flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:shrink-0`}
                  dangerouslySetInnerHTML={{ __html: icon }}
              />
          );
      }
      const IconComponent = IconMap[icon] || Trophy;
      return <IconComponent className={className} />;
  };

  const renderAchievementsContent = () => {
      const unlocked = engine?.unlockedAchievements || {};
      const stats = engine?.achievementStats || {};
      const isRu = settings.language === 'ru';

      const getProgressInfo = (key: string) => {
          if (key === 'bullet_sponge') return `${stats['damage_taken'] || 0} / 100`;
          if (key === 'collector') return `${stats['items_collected'] || 0} / 20`;
          return null;
      };

      return (
          <div className="flex flex-col h-full overflow-hidden bg-gray-800/95">
              <div id="achievements-scroll-container" tabIndex={-1} className="p-6 space-y-3 overflow-y-auto flex-1 h-full scroll-smooth no-gamepad-nav outline-none">
                  {achievementsData.map((ach) => {
                      const key = ach.key;
                      const name = isRu ? ach.name.ru : ach.name.en;
                      const desc = isRu ? ach.desc.ru : ach.desc.en;
                      const isUnlocked = !!unlocked[key];
                      const progress = getProgressInfo(key);

                      return (
                          <div key={key} className={`border p-3 flex rounded relative overflow-hidden transition-all duration-300 ${isUnlocked ? 'bg-gray-700 border-yellow-600 shadow-[0_0_15px_rgba(202,138,4,0.15)]' : 'bg-gray-900 border-gray-700 opacity-70'}`}>
                              
                              <div className="mr-4 flex items-center justify-center w-10 h-10 shrink-0 bg-black/40 rounded">
                                  <span className={isUnlocked ? '' : 'grayscale opacity-50'}>
                                      {getAchievementIcon(key)}
                                  </span>
                              </div>
                              
                              <div className="flex flex-col justify-center w-full">
                                  <h3 className={`text-sm font-bold tracking-wider uppercase ${isUnlocked ? 'text-yellow-400' : 'text-gray-400'}`}>
                                      {name}
                                  </h3>
                                  <p className={`text-[10px] uppercase tracking-wide leading-relaxed ${isUnlocked ? 'text-gray-300' : 'text-gray-500'}`}>
                                      {desc}
                                  </p>
                                  
                                  {!isUnlocked && progress && (
                                      <div className="mt-2 text-[9px] font-mono text-gray-500 flex justify-between uppercase">
                                          <span>PROGRESS:</span>
                                          <span>{progress}</span>
                                      </div>
                                  )}
                              </div>

                              {isUnlocked && (
                                  <div className="absolute top-1 right-1 text-[9px] font-bold text-yellow-600 tracking-wider uppercase">
                                      {engine?.strings?.achievements?.unlocked || (isRu ? 'ОТКРЫТО' : 'UNLOCKED')}
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>

              {/* Back button, placed outside of the no-gamepad-nav scroll container so gamepad controller can focus/click it */}
              <div className="p-4 bg-gray-900/60 border-t border-gray-700/50 flex shrink-0 justify-center">
                  <button 
                      onClick={() => setActiveSubMenu('main')}
                      className="w-full py-3 bg-gray-700 border border-gray-600 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded shadow-md text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                      {strings.btn_back || strings.btn_close}
                  </button>
              </div>
          </div>
      );
  };

  return (
    <div id="settings-modal-container" className="absolute inset-0 z-[120] bg-black/40 flex items-center justify-center p-4 pt-[70px] md:pt-4 transition-all duration-300">
      <div className="bg-gray-800 border border-gray-600 w-full max-w-md md:max-w-4xl md:h-[70vh] rounded-lg flex flex-col md:flex-row max-h-full shadow-2xl relative overflow-hidden">
        
        {/* Desktop Sidebar (Left) */}
        <div data-sidebar-container="true" className="hidden md:flex w-64 bg-gray-900 border-r border-gray-700 flex-col shrink-0 overflow-y-auto">
            <div className="p-4 border-b border-gray-700">
               <h1 className="text-xl font-black text-white tracking-widest uppercase">{strings.title}</h1>
            </div>
            <div className="flex-col py-2 flex-1">
               <button onClick={() => setActiveSubMenu('main')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'main' ? 'bg-indigo-900/40 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                   <Settings size={18} />
                   {strings.general}
               </button>
               {engine && engine.strings?.achievements && (
                   <button onClick={() => setActiveSubMenu('achievements')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors group ${activeSubMenu === 'achievements' ? 'bg-yellow-900/20 text-yellow-500 border-r-2 border-yellow-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                       <TrophyIcon size={18} />
                       {engine.strings.achievements.title}
                   </button>
               )}
               <button onClick={() => setActiveSubMenu('graphics')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'graphics' ? 'bg-indigo-900/40 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                   <Image size={18} />
                   {(strings as any).graphics || "GRAPHICS"}
               </button>
               <button onClick={() => setActiveSubMenu('audio')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'audio' ? 'bg-indigo-900/40 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                   <Volume2 size={18} />
                   {strings.audio_title || "AUDIO"}
               </button>
               <button onClick={() => setActiveSubMenu('controls')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'controls' ? 'bg-indigo-900/40 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                   <Keyboard size={18} />
                   {(strings as any).controls || "CONTROLS"}
               </button>
               <button onClick={() => setActiveSubMenu('saves')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'saves' ? 'bg-indigo-900/40 text-indigo-400 border-r-2 border-indigo-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
                   <Save size={18} />
                   {(strings as any).save_management || "SAVE MANAGEMENT"}
               </button>
               
               {!isGameStarted && onOpenEditor && isDevMode && (
                   <button onClick={onOpenEditor} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200 mt-4 border-t border-gray-700/50 pt-4`}>
                       <Terminal size={18} className="text-indigo-400" />
                       {(strings as any).editor || "StormEd"}
                   </button>
               )}
               {isDevMode && (
                   <button onClick={() => setActiveSubMenu('debug')} className={`w-full text-left px-4 py-3 flex items-center gap-3 font-bold text-sm tracking-wider uppercase transition-colors ${activeSubMenu === 'debug' ? 'bg-red-900/20 text-red-500 border-r-2 border-red-500' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'} ${(!isGameStarted && onOpenEditor) ? '' : 'mt-4 border-t border-gray-700/50 pt-4'}`}>
                       <Terminal size={18} className="text-red-500" />
                       {strings.debug || "DEBUG"}
                   </button>
               )}
            </div>
        </div>

        {/* Right side (Mobile container + Desktop Content) */}
        <div data-content-container="true" className="flex flex-col flex-1 relative overflow-hidden bg-gray-800/95">
            {/* Header */}
            {renderHeader()}

            {/* Content with Animation */}
            <div id="settings-content-wrapper" className="relative flex-1 flex flex-col overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                    {activeSubMenu === 'main' && (
                        <motion.div 
                            key="main"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderMainContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'saves' && (
                        <motion.div 
                            key="saves"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderSavesContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'graphics' && (
                        <motion.div 
                            key="graphics"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderGraphicsContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'audio' && (
                        <motion.div 
                            key="audio"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderAudioContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'controls' && (
                        <motion.div 
                            key="controls"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderControlsContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'debug' && (
                        <motion.div 
                            key="debug"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderDebugContent()}
                        </motion.div>
                    )}
                    {activeSubMenu === 'achievements' && (
                        <motion.div 
                            key="achievements"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full flex flex-col overflow-hidden"
                        >
                            {renderAchievementsContent()}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
