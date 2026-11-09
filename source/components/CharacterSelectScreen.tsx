
import React, { useState } from 'react';
import { GameStrings } from '../types';
import { ChevronRight } from 'lucide-react';
import ParallaxBackground from './ParallaxBackground';

interface CharacterSelectScreenProps {
  strings: GameStrings['ui']['char_select'];
  spriteMap: Map<string, HTMLImageElement>;
  onSelect: (charId: 'male' | 'female') => void;
  onBack: () => void;
  onBackText: string;
  playSound?: (soundId: string) => void;
}

const CharacterSelectScreen: React.FC<CharacterSelectScreenProps> = ({ strings, spriteMap, onSelect, onBack, onBackText, playSound }) => {
  const [selected, setSelected] = useState<'male' | 'female'>('male');

  const malePortrait = spriteMap.get('MALE_PORTRAIT1');
  const femalePortrait = spriteMap.get('FEMALE_PORTRAIT1');

  return (
    <div className="flex flex-col h-full w-full bg-black relative overflow-y-auto overflow-x-hidden">
      
      {/* Background Parallax Image reused from MainMenu style */}
      <ParallaxBackground opacity={0.3} grayscale={true} />
      
      {/* Scanlines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none z-0"></div>

      <div className="z-10 flex flex-col items-center pt-8 pb-4 md:pt-12 md:pb-8 shrink-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-[0.2em] text-gray-200 border-b-2 border-red-800 pb-2 uppercase drop-shadow-md text-center">
          {strings.title}
        </h1>
      </div>

      {/* Hide selection buttons if gamepad navigation is active */}
      <style>{`
        body.gamepad-navigation-active .gamepad-hide-buttons {
          display: none !important;
        }
        .char-select-card {
          cursor: pointer;
        }
      `}</style>

      <div className="flex-1 flex flex-row items-center justify-center gap-4 sm:gap-6 md:gap-12 z-10 w-full px-2 sm:px-4 min-h-[35vh]">
        
        {/* MALE OPTION */}
        <div 
            onClick={() => {
              const isGamepad = document.body.classList.contains('gamepad-navigation-active');
              if (isGamepad) {
                playSound?.('SYS_CLICK');
                onSelect('male');
              } else {
                if (selected !== 'male') {
                  playSound?.('SYS_CLICK');
                }
                setSelected('male');
              }
            }}
            className={`
                group flex flex-col items-center transition-all duration-300 relative outline-none char-select-card
                ${selected === 'male' ? 'scale-105' : 'scale-95 hover:scale-100'}
            `}
        >
            <div 
                id="char-select-male"
                tabIndex={0}
                onFocus={() => setSelected('male')}
                onClick={(e) => {
                  e.stopPropagation();
                  const isGamepad = document.body.classList.contains('gamepad-navigation-active');
                  if (isGamepad) {
                    playSound?.('SYS_CLICK');
                    onSelect('male');
                  } else {
                    if (selected !== 'male') {
                      playSound?.('SYS_CLICK');
                    }
                    setSelected('male');
                  }
                }}
                className={`
                    relative w-40 h-56 sm:w-48 sm:h-64 md:w-56 md:h-72 border-2 transition-colors duration-300 overflow-hidden bg-black char-portrait-container cursor-pointer outline-none
                    ${selected === 'male' ? 'border-gray-400 shadow-[0_0_20px_rgba(156,163,175,0.4)]' : 'border-gray-700 group-hover:border-gray-500'}
                `}
            >
                {malePortrait && (
                    <img 
                        src={malePortrait.src} 
                        crossOrigin="anonymous"
                        className={`w-full h-full object-contain object-bottom transition-all duration-300 ${selected === 'male' ? 'brightness-100' : 'brightness-50 group-hover:brightness-75'}`} 
                        alt="John Mason"
                        style={{ imageRendering: 'pixelated' }}
                    />
                )}
            </div>
            <div className={`
                mt-2 sm:mt-3 px-2 sm:px-4 py-1 sm:py-2 border-x border-b min-w-[120px] sm:min-w-[140px] text-center transition-colors
                ${selected === 'male' ? 'bg-gray-800/80 border-gray-400 text-gray-100' : 'bg-gray-900/80 border-gray-700 text-gray-400'}
            `}>
                <span className="text-xs sm:text-sm font-bold tracking-widest uppercase">{strings.male_name}</span>
            </div>
        </div>

        {/* FEMALE OPTION */}
        <div 
            onClick={() => {
              const isGamepad = document.body.classList.contains('gamepad-navigation-active');
              if (isGamepad) {
                playSound?.('SYS_CLICK');
                onSelect('female');
              } else {
                if (selected !== 'female') {
                  playSound?.('SYS_CLICK');
                }
                setSelected('female');
              }
            }}
            className={`
                group flex flex-col items-center transition-all duration-300 relative outline-none char-select-card
                ${selected === 'female' ? 'scale-105' : 'scale-95 hover:scale-100'}
            `}
        >
            <div 
                id="char-select-female"
                tabIndex={0}
                onFocus={() => setSelected('female')}
                onClick={(e) => {
                  e.stopPropagation();
                  const isGamepad = document.body.classList.contains('gamepad-navigation-active');
                  if (isGamepad) {
                    playSound?.('SYS_CLICK');
                    onSelect('female');
                  } else {
                    if (selected !== 'female') {
                      playSound?.('SYS_CLICK');
                    }
                    setSelected('female');
                  }
                }}
                className={`
                    relative w-40 h-56 sm:w-48 sm:h-64 md:w-56 md:h-72 border-2 transition-colors duration-300 overflow-hidden bg-black char-portrait-container cursor-pointer outline-none
                    ${selected === 'female' ? 'border-gray-400 shadow-[0_0_20px_rgba(156,163,175,0.4)]' : 'border-gray-700 group-hover:border-gray-500'}
                `}
            >
                {femalePortrait && (
                    <img 
                        src={femalePortrait.src} 
                        crossOrigin="anonymous"
                        className={`w-full h-full object-contain object-bottom transition-all duration-300 ${selected === 'female' ? 'brightness-100' : 'brightness-50 group-hover:brightness-75'}`} 
                        alt="Lilith Vane"
                        style={{ imageRendering: 'pixelated' }}
                    />
                )}
            </div>
            <div className={`
                mt-2 sm:mt-3 px-2 sm:px-4 py-1 sm:py-2 border-x border-b min-w-[120px] sm:min-w-[140px] text-center transition-colors
                ${selected === 'female' ? 'bg-gray-800/80 border-gray-400 text-gray-100' : 'bg-gray-900/80 border-gray-700 text-gray-400'}
            `}>
                <span className="text-xs sm:text-sm font-bold tracking-widest uppercase">{strings.female_name}</span>
            </div>
        </div>

      </div>

      <div className="z-10 pb-6 pt-4 w-full max-w-sm mx-auto px-4 flex flex-col gap-3 shrink-0 mt-auto gamepad-hide-buttons">
        <button 
            onClick={() => onSelect(selected)}
            className="w-full group relative px-8 py-3 bg-gray-900 border-2 border-gray-400 text-gray-200 font-bold text-lg tracking-[0.2em] active:bg-gray-800 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-[0_0_15px_rgba(156,163,175,0.3)]"
        >
            <span className="relative z-10 flex items-center gap-2">
                <span>{strings.btn_select}</span>
                <ChevronRight size={20} className="group-active:translate-x-1 transition-transform" />
            </span>
        </button>
        
        <button
            onClick={onBack}
            className="w-full group relative px-8 py-3 bg-gray-900 border border-gray-700 text-gray-300 font-bold text-lg tracking-[0.2em] active:bg-gray-800 active:border-gray-400 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-xl"
            style={{ fontFamily: 'Jura, sans-serif' }}
        >
            <span className="relative z-10 flex items-center gap-2">
                {onBackText}
            </span>
        </button>
      </div>

    </div>
  );
};

export default CharacterSelectScreen;
