import React, { useEffect, useState, useRef } from 'react';
import { GameStrings } from '../types';
import creditsData from '../data/credits.json';
import ParallaxBackground from './ParallaxBackground';

interface CreditsScreenProps {
  strings: GameStrings;
  language: 'en' | 'ru';
  onBack: () => void;
  onUnlockDebug?: () => void;
}

const CreditsScreen: React.FC<CreditsScreenProps> = ({ strings, language, onBack, onUnlockDebug }) => {
  const [credits, setCredits] = useState<string[]>([]);
  const [offsetY, setOffsetY] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  
  const handleScreenClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next === 10 && onUnlockDebug) {
        onUnlockDebug();
      }
      return next;
    });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCredits(creditsData[language as keyof typeof creditsData] || creditsData['en']);
  }, [language]);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    const speed = 40; // pixels per second

    const scroll = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      setOffsetY(prev => {
        const newOffset = prev - speed * dt;
        
        // Reset if scrolled past the end
        if (contentRef.current && containerRef.current) {
           const contentHeight = contentRef.current.getBoundingClientRect().height;
           const containerHeight = containerRef.current.getBoundingClientRect().height;
           if (-newOffset > contentHeight) {
               return containerHeight;
           }
        }
        return newOffset;
      });
      
      animationFrameId = requestAnimationFrame(scroll);
    };

    // Initial offset to start at 70% of the container height for faster appearance
    if (containerRef.current) {
        setOffsetY(containerRef.current.getBoundingClientRect().height * 0.7);
    }

    animationFrameId = requestAnimationFrame(scroll);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div 
      className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 overflow-hidden"
      onClick={handleScreenClick}
    >
      
      {/* Background Parallax Image reused from MainMenu style */}
      <ParallaxBackground opacity={0.3} grayscale={true} />

      <div className="z-10 flex flex-col items-center mb-4 md:mb-8 w-full mt-4 md:mt-8 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-gray-100 to-gray-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] border-b-4 border-gray-800 pb-2 whitespace-nowrap uppercase" style={{ fontFamily: 'Jura, sans-serif' }}>
          {strings.ui.credits?.title || 'ABOUT'}
        </h1>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 w-full max-w-2xl overflow-hidden relative z-10 min-h-0"
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)' }}
      >
        <div 
            ref={contentRef}
            className="absolute left-0 w-full text-center"
            style={{ transform: `translateY(${offsetY}px)` }}
        >
          {credits.map((line, index) => {
            const isHeader = line.endsWith(':');
            return (
                <div 
                  key={index} 
                  className={`${line === '' ? 'h-4 sm:h-6' : 'mb-1 sm:mb-2'} ${isHeader ? 'text-lg sm:text-xl font-bold text-gray-400 mt-4 sm:mt-6 tracking-widest uppercase' : 'text-base sm:text-lg text-gray-300 font-medium'}`}
                  style={{ fontFamily: 'Jura, sans-serif' }}
                >
                  {line}
                </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={onBack}
        className="mt-4 mb-4 md:mt-8 md:mb-8 w-full max-w-sm group relative px-8 py-3 bg-gray-900 border border-gray-700 text-gray-300 font-bold text-lg tracking-[0.2em] active:bg-cyan-900/50 active:border-cyan-600 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-xl z-10 shrink-0"
        style={{ fontFamily: 'Jura, sans-serif' }}
      >
        <span className="relative z-10 flex items-center gap-2">
          {strings.ui.credits?.btn_back || 'BACK'}
        </span>
      </button>
    </div>
  );
};

export default CreditsScreen;
