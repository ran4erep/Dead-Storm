import React, { useEffect, useState } from 'react';
import ParallaxBackground from './ParallaxBackground';

interface LoadingScreenProps {
    isLandscape: boolean;
    loadingProgress: number;
    loadingMessage: string;
    loadingLogs: string[];
    isWaitingToStart: boolean;
    strings: any;
    finalizeLevelLoad: () => void;
    loadingLogRef: React.RefObject<HTMLDivElement | null>;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
    loadingProgress,
    loadingMessage,
    loadingLogs,
    isWaitingToStart,
    strings,
    finalizeLevelLoad,
}) => {
    const [isFadingOut, setIsFadingOut] = useState(false);

    useEffect(() => {
        if (isWaitingToStart) {
            setIsFadingOut(true);
            const timer = setTimeout(() => {
                finalizeLevelLoad();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isWaitingToStart, finalizeLevelLoad]);

    return (
        <div 
            className={`absolute inset-0 bg-black flex flex-col items-center justify-center z-[200] overflow-hidden transition-opacity duration-500 ease-in-out ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
            <ParallaxBackground opacity={0.6} />
            
            <div className="z-10 flex flex-col items-center w-full max-w-md px-6">
                <h2 className="text-3xl md:text-5xl font-black tracking-[0.3em] mb-12 text-transparent bg-clip-text bg-gradient-to-b from-gray-100 to-gray-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] uppercase border-b-4 border-gray-800 pb-2">
                    {strings.ui.header.loading_title || 'LOADING'}
                </h2>
                
                <div className="w-full flex flex-col">
                    <div className="flex justify-end items-end mb-2 px-1">
                        <span className="text-sm font-black text-gray-300 tracking-widest">
                            {loadingProgress}%
                        </span>
                    </div>
                    
                    <div className="w-full p-1 border border-gray-700 bg-black/80 rounded shadow-2xl">
                        <div className="w-full h-3 bg-black/50 relative overflow-hidden rounded-sm">
                            <div 
                                className="absolute top-0 left-0 h-full bg-gray-900 border-r border-gray-500 transition-all duration-300 ease-out flex items-center overflow-hidden" 
                                style={{ width: `${loadingProgress}%` }} 
                            >
                                <div className="w-full h-full opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(255,255,255,1)_6px,rgba(255,255,255,1)_12px)]" />
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="mt-4 w-full h-8 overflow-hidden relative border-t border-gray-800/50 pt-2">
                    <div className="absolute top-2 w-full flex flex-col justify-start">
                        {loadingLogs && loadingLogs.length > 0 && (
                            <div className="text-[10px] font-mono tracking-wider text-center truncate text-gray-400 font-bold uppercase">
                                {loadingLogs[loadingLogs.length - 1]}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div> 
    );
};

export default React.memo(LoadingScreen);

