
import React from 'react';
import { GameStrings } from '../types';
import { Play, Settings as SettingsIcon, LogOut, Pause, Save as SaveIcon } from 'lucide-react';

interface PauseMenuProps {
  strings: GameStrings['ui']['pause'] & { btn_load?: string };
  onResume: () => void;
  onSettings: () => void;
  onLoad?: () => void;
  onQuit: () => void;
  isTestingCustomLevel?: boolean;
  onReturnToEditor?: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ strings, onResume, onSettings, onLoad, onQuit, isTestingCustomLevel, onReturnToEditor }) => {
  const [hasSaves, setHasSaves] = React.useState(false);

  React.useEffect(() => {
    let savesFound = false;
    for (let i = 1; i <= 3; i++) {
        if (localStorage.getItem(`deadstorm_save_${i}`)) {
            savesFound = true;
            break;
        }
    }
    setHasSaves(savesFound);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        onResume();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResume]);

  return (
    <div id="pause-menu-container" className="absolute inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 pt-[70px] transition-all duration-300">
      <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-full shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <Pause size={18} className="text-gray-400" />
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">{strings.title}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 bg-gray-800/95 overflow-y-auto">
            <button 
                onClick={onResume}
                className="w-full py-4 bg-gray-700 border border-gray-700 text-gray-200 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded flex items-center justify-center gap-3 shadow-lg group border-b-2 border-b-green-900/30"
            >
                <Play size={20} className="text-green-500 group-hover:text-green-400" />
                {strings.btn_resume}
            </button>

            {onLoad && (
                <button 
                    onClick={hasSaves ? onLoad : undefined}
                    disabled={!hasSaves}
                    className={`w-full py-4 bg-gray-700 border border-gray-700 font-bold uppercase tracking-widest transition-all rounded flex items-center justify-center gap-3 shadow-lg group border-b-2 ${hasSaves ? 'text-gray-300 hover:bg-gray-600 active:scale-95 border-b-blue-900/30' : 'text-gray-500 opacity-50 cursor-not-allowed border-b-transparent'}`}
                >
                    <SaveIcon size={20} className={hasSaves ? "text-blue-500 group-hover:text-blue-400" : "text-gray-500"} />
                    {strings.btn_load || 'LOAD GAME'}
                </button>
            )}

            <button 
                onClick={onSettings}
                className="w-full py-4 bg-gray-700 border border-gray-700 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded flex items-center justify-center gap-3 shadow-lg group border-b-2 border-b-cyan-900/30"
            >
                <SettingsIcon size={20} className="text-cyan-500 group-hover:text-cyan-400" />
                {strings.btn_settings}
            </button>

            {isTestingCustomLevel && onReturnToEditor && (
                <button 
                    onClick={onReturnToEditor}
                    className="w-full py-4 bg-gray-700 border border-gray-700 text-gray-300 font-bold uppercase tracking-widest hover:bg-gray-600 active:scale-95 transition-all rounded flex items-center justify-center gap-3 shadow-lg group border-b-2 border-b-yellow-900/30"
                >
                    <Play size={20} className="text-yellow-500 group-hover:text-yellow-400" />
                    {strings.btn_return_editor || 'RETURN TO EDITOR'}
                </button>
            )}

            <div className="flex items-center gap-4 py-2">
                <div className="h-px bg-gray-900 flex-1"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-gray-700"></div>
                <div className="h-px bg-gray-900 flex-1"></div>
            </div>

            <button 
                onClick={onQuit}
                className="w-full py-4 bg-red-900/20 border border-red-600/40 text-red-500 font-bold uppercase tracking-widest hover:bg-red-600/30 hover:text-red-400 active:scale-95 transition-all rounded flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(220,38,38,0.1)] mt-2"
            >
                <LogOut size={18} />
                <span className="text-xs">{strings.btn_quit}</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;
