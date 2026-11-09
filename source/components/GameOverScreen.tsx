import React, { useEffect, useState, useRef } from 'react';
import { GameStrings } from '../types';
import { triggerUnifiedVibration } from '../utils/vibration';

interface GameOverScreenProps {
  strings: GameStrings['ui']['game_over'];
  onReturnToMenu: () => void;
  onReturnToEditor?: () => void;
  volume: number;
  vibrationEnabled?: boolean;
  gameOverType?: 'death' | 'script';
  onLoadGame?: () => void;
  hasSaveGame?: boolean;
}

const playBeep = (freq: number, durationMs: number, vol: number = 0.5) => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
        // Ignore audio errors
    }
};

const playFlatline = (vol: number = 0.5) => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return null;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime); 
        
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 6);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 6);
        return ctx;
    } catch (e) {
        return null;
    }
};

const GameOverScreen: React.FC<GameOverScreenProps> = ({ 
  strings, 
  onReturnToMenu, 
  onReturnToEditor, 
  volume, 
  vibrationEnabled = true,
  gameOverType = 'death',
  onLoadGame
}) => {
  const [flatline, setFlatline] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [hasSaveGame, setHasSaveGame] = useState(false);
  const audioCtxRef = useRef<any>(null);

  useEffect(() => {
    let savesFound = false;
    for (let i = 1; i <= 3; i++) {
        if (localStorage.getItem(`deadstorm_save_${i}`)) {
            savesFound = true;
            break;
        }
    }
    setHasSaveGame(savesFound);
  }, []);

  useEffect(() => {
    // Stage 1: The EKG draws for 4 seconds.
    
    // Beat 1 at 800ms
    const b1 = setTimeout(() => {
        triggerUnifiedVibration([50, 50, 50], vibrationEnabled);
        playBeep(800, 150, volume);
    }, 800);

    // Beat 2 at 2000ms
    const b2 = setTimeout(() => {
        triggerUnifiedVibration([50, 50, 50], vibrationEnabled);
        playBeep(800, 150, volume);
    }, 2000);

    // Beat 3 at 3200ms (weaker)
    const b3 = setTimeout(() => {
        triggerUnifiedVibration([30, 50, 30], vibrationEnabled);
        playBeep(700, 200, volume * 0.5);
    }, 3200);

    // Flatline starts at 4000ms
    const t1 = setTimeout(() => {
        setFlatline(true);
        audioCtxRef.current = playFlatline(volume);
        // Fading out vibration for flatline
        triggerUnifiedVibration([
            400, 50, 
            300, 50, 
            200, 50, 
            100, 50, 
            50, 50, 
            20, 50, 
            10
        ], vibrationEnabled); 
    }, 4000);

    // Stage 2: Show button after the realization of death settles
    const t2 = setTimeout(() => {
        setShowButton(true);
    }, 6000);

    return () => {
        clearTimeout(b1);
        clearTimeout(b2);
        clearTimeout(b3);
        clearTimeout(t1);
        clearTimeout(t2);
        if (audioCtxRef.current) {
            try { audioCtxRef.current.close(); } catch(e) {}
        }
    };
  }, [volume]);

  // Constructing absolute path for smoother control
  // Start (0,50) -> Beat 1 -> Wait -> Beat 2 -> Wait -> Beat 3 (Weak) -> FLATLINE
  const pathData = `
    M 0 50 
    L 55 50 L 60 10 L 65 90 L 70 50 
    L 145 50 L 150 10 L 155 90 L 160 50 
    L 235 50 L 240 30 L 245 70 L 250 50 
    L 3000 50
  `;

  return (
    <div className="flex flex-col h-full w-full bg-black items-center justify-center text-red-600 relative overflow-y-auto overflow-x-hidden font-mono z-50 animate-[fadeIn_1s_ease-out]">
        
        {/* CRT Scanline Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_4px,3px_100%] pointer-events-none"></div>
        <div className="absolute inset-0 bg-red-900/5 animate-pulse z-0 pointer-events-none"></div>

        <div className="z-20 flex flex-col items-center w-full max-w-lg p-12">
            <h1 className="text-4xl md:text-5xl font-black tracking-widest mb-2 text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)] uppercase animate-pulse whitespace-nowrap">
                {gameOverType === 'script' ? (strings.title_script || 'ИГРА ОКОНЧЕНА') : strings.title}
            </h1>
            <p className="text-red-900/60 mb-8 tracking-[0.4em] text-sm uppercase">
                {strings.subtitle}
            </p>

            {/* EKG CONTAINER */}
            <div className="w-full h-24 flex items-center relative mb-8 border-t border-b border-red-900/30 bg-black/40 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)]">
                
                {/* Grid Lines */}
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(50,0,0,0.2)_1px,transparent_1px),linear-gradient(rgba(50,0,0,0.2)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

                {/* THE PULSE LINE */}
                <svg 
                    className="absolute top-0 left-0 h-full w-full overflow-visible"
                    viewBox="0 0 300 100" 
                    preserveAspectRatio="none"
                >
                    <defs>
                        <clipPath id="ekg-clip">
                            <rect x="0" y="0" height="100" className="animate-ekg-mask" />
                        </clipPath>
                    </defs>
                    <g clipPath="url(#ekg-clip)">
                        <path 
                            d={pathData}
                            fill="none" 
                            stroke="#ef4444" 
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-ekg-path"
                        />
                    </g>
                </svg>

                {/* Leading Dot */}
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_4px_rgba(239,68,68,1)] animate-ekg-dot z-10"></div>
            </div>

            <div className="flex flex-col gap-4 w-full">
                {hasSaveGame && onLoadGame && (
                    <button 
                        onClick={onLoadGame} 
                        disabled={!showButton}
                        className={`
                            px-10 py-4 border border-red-700/50 bg-red-950/20 text-red-500 
                            font-bold tracking-[0.2em] uppercase transition-all duration-1000
                            hover:bg-red-900/30 active:bg-red-900/50 touch-manipulation
                            ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}
                        `}
                    >
                        {strings.btn_load || 'ЗАГРУЗИТЬ ИГРУ'}
                    </button>
                )}
                <button 
                    onClick={onReturnToMenu} 
                    disabled={!showButton}
                    className={`
                        px-10 py-4 border border-red-700/50 bg-red-950/20 text-red-500 
                        font-bold tracking-[0.2em] uppercase transition-all duration-1000
                        hover:bg-red-900/30 active:bg-red-900/50 touch-manipulation
                        ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}
                    `}
                >
                    {strings.button}
                </button>
                {onReturnToEditor && (
                    <button 
                        onClick={onReturnToEditor} 
                        disabled={!showButton}
                        className={`
                            px-10 py-4 border border-red-700/50 bg-red-950/20 text-red-500 
                            font-bold tracking-[0.2em] uppercase transition-all duration-1000 delay-150
                            hover:bg-red-900/30 active:bg-red-900/50 touch-manipulation
                            ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}
                        `}
                    >
                        {strings.btn_editor || 'EDITOR'}
                    </button>
                )}
            </div>
        </div>

        <style>{`
            @keyframes ekg-mask {
                0% { width: 0px; }
                100% { width: 300px; }
            }
            @keyframes ekg-path {
                0% { transform: translateX(0); }
                100% { transform: translateX(-2700px); } 
            }
            @keyframes ekg-dot {
                0% { left: 0%; }
                100% { left: 100%; }
            }
            @keyframes fadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
            .animate-ekg-mask {
                animation: ekg-mask 4s linear forwards;
            }
            .animate-ekg-path {
                animation: ekg-path 36s linear 4s forwards; 
            }
            .animate-ekg-dot {
                animation: ekg-dot 4s linear forwards;
            }
        `}</style>
    </div>
  );
};

export default GameOverScreen;