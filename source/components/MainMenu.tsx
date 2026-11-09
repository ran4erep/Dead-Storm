
import React, { useState, useEffect } from 'react';
import { Play, Settings as SettingsIcon, Info, Download, Save } from 'lucide-react';
import { GameStrings, Settings } from '../types';
import SettingsModal from './SettingsModal';
import ParallaxBackground from './ParallaxBackground';
import LoadModal from './LoadModal';
import { TUTORIAL_SECTOR_PATH, START_SECTOR_PATH } from '../data/levels';

interface MainMenuProps {
  strings: GameStrings;
  loading: boolean;
  loadingMessage: string;
  settings: Settings;
  spriteMap: Map<string, HTMLImageElement>;
  engine: any;
  onStart: () => void;
  onUpdateSettings: (s: Settings) => void;
  onAbout: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ strings, loading, loadingMessage, settings, spriteMap, engine, onStart, onUpdateSettings, onAbout }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [hasSaves, setHasSaves] = useState(false);
  const [showTutorialConfirm, setShowTutorialConfirm] = useState(false);

  useEffect(() => {
    let savesFound = false;
    for (let i = 1; i <= 3; i++) {
        if (localStorage.getItem(`deadstorm_save_${i}`)) {
            savesFound = true;
            break;
        }
    }
    setHasSaves(savesFound);
  }, [showLoadModal, showSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showTutorialConfirm) {
        setShowTutorialConfirm(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showTutorialConfirm]);

  const titleImg = spriteMap.get('TITLE');

  return (
    <div className="flex flex-col h-full w-full bg-black relative overflow-y-auto overflow-x-hidden">
      <ParallaxBackground opacity={0.6} />

      <div className="z-10 flex-1 flex flex-col items-center justify-center p-4 mt-8 md:mt-12 mb-4 w-full min-h-[20vh]">
        {titleImg ? (
            <img 
                src={titleImg.src} 
                crossOrigin="anonymous"
                alt={strings.ui.menu.title}
                className="w-[85%] md:w-[90%] max-w-md max-h-[40vh] object-contain drop-shadow-[0_0_25px_rgba(220,38,38,0.6)]"
                style={{ imageRendering: 'pixelated' }}
            />
        ) : (
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-gray-100 to-gray-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] border-b-4 border-red-800 pb-2 whitespace-nowrap text-center">
            {strings.ui.menu.title}
            </h1>
        )}
      </div>

      <div className="z-10 flex flex-col items-center p-4 w-full max-w-sm mx-auto mb-6 gap-3 shrink-0">
        
        {/* START BUTTON */}
        <button 
          onClick={() => {
              const isTutorialPrompted = localStorage.getItem('deadstorm_tutorial_prompted') === 'true';
              if (!isTutorialPrompted) {
                  setShowTutorialConfirm(true);
              } else {
                  sessionStorage.setItem('deadstorm_next_game_path', START_SECTOR_PATH);
                  onStart();
              }
          }}
          className="w-full group relative px-8 py-2 bg-gray-900 border border-gray-700 text-gray-200 font-bold text-lg tracking-[0.2em] active:bg-red-900/50 active:border-red-600 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-2xl"
        >
          <span className="relative z-10 flex items-center gap-2">
            <Play size={20} className="group-active:fill-current" />
            {strings.ui.menu.btn_start}
          </span>
          <div className="absolute inset-0 bg-red-600/10 transform -skew-x-12 translate-x-[-120%] group-active:translate-x-full transition-transform duration-700 ease-in-out"></div>
        </button>

        {/* LOAD BUTTON */}
        <button 
          onClick={() => {
              if (hasSaves) {
                  setShowLoadModal(true);
              }
          }}
          disabled={!hasSaves}
          className={`w-full group relative px-8 py-2 border font-bold text-lg tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-xl ${hasSaves ? 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white active:bg-green-900/50 active:border-green-600 active:text-white' : 'bg-gray-950 border-gray-900 text-gray-700 cursor-not-allowed'}`}
        >
          <span className="relative z-10 flex items-center gap-2">
            <Save size={20} />
            {settings.language === 'ru' ? 'ЗАГРУЗКА ИГРЫ' : 'LOAD GAME'}
          </span>
        </button>

        {/* SETTINGS BUTTON */}
        <button 
          onClick={() => setShowSettings(true)}
          className="w-full group relative px-8 py-2 bg-gray-900 border border-gray-700 text-gray-300 font-bold text-lg tracking-[0.2em] active:bg-cyan-900/50 active:border-cyan-600 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-xl"
        >
          <span className="relative z-10 flex items-center gap-2">
            <SettingsIcon size={20} />
            {strings.ui.menu.btn_settings}
          </span>
        </button>

        {/* ABOUT BUTTON */}
        <button 
          onClick={onAbout}
          className="w-full group relative px-8 py-2 bg-gray-900 border border-gray-700 text-gray-300 font-bold text-lg tracking-[0.2em] active:bg-cyan-900/50 active:border-cyan-600 active:text-white transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden touch-manipulation shadow-xl"
        >
          <span className="relative z-10 flex items-center gap-2">
            <Info size={20} />
            {strings.ui.menu.btn_about || 'ABOUT'}
          </span>
        </button>
         
        {loading && (
          <div className="mt-4 text-xs font-mono text-gray-500 animate-pulse">
            {loadingMessage}
          </div>
        )}
      </div>

      {showSettings && (
          <SettingsModal 
            settings={settings}
            strings={strings.ui.settings}
            isGameStarted={false}
            onClose={() => setShowSettings(false)}
            onUpdate={onUpdateSettings}
            onOpenEditor={() => {
                localStorage.removeItem('editor_test_player');
                sessionStorage.removeItem('editor_test_tabs');
                sessionStorage.removeItem('editor_active_tab');
                engine.setGameState('EDITOR');
                setShowSettings(false);
            }}
            engine={engine}
            saveLoadStrings={strings.ui.save_load}
          />
      )}

      {showLoadModal && (
          <LoadModal 
              engine={engine}
              strings={strings}
              onClose={() => setShowLoadModal(false)}
          />
      )}

      {showTutorialConfirm && (
          <div id="tutorial-confirm-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-sm bg-black/60 border border-gray-700 p-8 flex flex-col items-center shadow-2xl relative rounded-sm">
                  <h2 className="text-xl md:text-2xl font-black tracking-[0.15em] md:tracking-[0.25em] uppercase mb-10 text-gray-100 border-b border-red-800 pb-4 w-full flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
                      <svg 
                          viewBox="0 0 32 32" 
                          className="w-8 h-8 text-gray-100 fill-current shrink-0"
                      >
                          <path d="M 16 4.875 L 15.53125 5.125 L 2.03125 12.125 L 0.3125 13 L 2 13.84375 L 2 22.28125 C 1.402344 22.628906 1 23.261719 1 24 C 1 25.105469 1.894531 26 3 26 C 4.105469 26 5 25.105469 5 24 C 5 23.261719 4.597656 22.628906 4 22.28125 L 4 14.875 L 6 15.90625 L 6 21 C 6 21.441406 6.203125 21.839844 6.4375 22.09375 C 6.671875 22.347656 6.957031 22.5 7.25 22.65625 C 7.839844 22.964844 8.539063 23.183594 9.40625 23.375 C 11.140625 23.761719 13.453125 24 16 24 C 18.546875 24 20.859375 23.761719 22.59375 23.375 C 23.460938 23.183594 24.160156 22.964844 24.75 22.65625 C 25.042969 22.5 25.328125 22.347656 25.5625 22.09375 C 25.796875 21.839844 26 21.441406 26 21 L 26 15.90625 L 29.96875 13.875 L 31.6875 13 L 29.96875 12.125 L 16.46875 5.125 Z M 16 7.125 L 27.3125 13 L 25.53125 13.90625 C 25.304688 13.667969 25.03125 13.492188 24.75 13.34375 C 24.164063 13.035156 23.460938 12.816406 22.59375 12.625 C 20.863281 12.238281 18.558594 12 16 12 C 13.441406 12 11.136719 12.238281 9.40625 12.625 C 8.539063 12.816406 7.835938 13.035156 7.25 13.34375 C 6.96875 13.492188 6.695313 13.667969 6.46875 13.90625 L 4.6875 13 Z M 16 14 C 18.441406 14 20.636719 14.222656 22.15625 14.5625 C 22.914063 14.730469 23.523438 14.925781 23.84375 15.09375 C 23.945313 15.148438 23.960938 15.1875 24 15.21875 L 24 19.03125 C 23.582031 18.878906 23.125 18.742188 22.59375 18.625 C 20.859375 18.238281 18.546875 18 16 18 C 13.453125 18 11.140625 18.238281 9.40625 18.625 C 8.875 18.742188 8.417969 18.878906 8 19.03125 L 8 15.21875 C 8.039063 15.1875 8.054688 15.148438 8.15625 15.09375 C 8.476563 14.925781 9.085938 14.730469 9.84375 14.5625 C 11.363281 14.222656 13.558594 14 16 14 Z M 16 20 C 18.425781 20 20.632813 20.222656 22.15625 20.5625 C 22.789063 20.703125 23.1875 20.851563 23.53125 21 C 23.1875 21.148438 22.789063 21.296875 22.15625 21.4375 C 20.632813 21.777344 18.425781 22 16 22 C 13.574219 22 11.367188 21.777344 9.84375 21.4375 C 9.210938 21.296875 8.8125 21.148438 8.46875 21 C 8.8125 20.851563 9.210938 20.703125 9.84375 20.5625 C 11.367188 20.222656 13.574219 20 16 20 Z" />
                      </svg>
                      {strings.ui.menu.tutorial_prompt || "ХОТИТЕ ПРОЙТИ ОБУЧЕНИЕ?"}
                  </h2>
                  <div className="flex gap-4 w-full">
                      <button 
                          onClick={() => {
                              sessionStorage.setItem('deadstorm_next_game_path', TUTORIAL_SECTOR_PATH);
                              setShowTutorialConfirm(false);
                              onStart();
                          }}
                          className="flex-1 py-3 bg-green-900/20 border border-green-700/50 hover:border-green-400 text-white font-bold uppercase tracking-[0.2em] active:scale-95 transition-all text-xs rounded-sm whitespace-nowrap"
                      >
                          {strings.ui.menu.tutorial_yes || "ДА"}
                      </button>
                      <button 
                          onClick={() => {
                              sessionStorage.setItem('deadstorm_next_game_path', START_SECTOR_PATH);
                              setShowTutorialConfirm(false);
                              onStart();
                          }}
                          className="flex-1 py-3 bg-red-900/20 border border-red-700/50 hover:border-red-400 text-white font-bold uppercase tracking-[0.2em] active:scale-95 transition-all text-xs rounded-sm whitespace-nowrap"
                      >
                          {strings.ui.menu.tutorial_no || "НЕТ"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="absolute bottom-2 right-4 text-xs font-mono text-gray-400 opacity-80 pointer-events-none">
        v{document.querySelector('meta[name="game-version"]')?.getAttribute('content') || 'dev'}
      </div>
    </div>
  );
};

export default MainMenu;
