import React, { useState, useEffect } from 'react';
import { ASSETS } from '../../assets';

interface SaveLevelModalProps {
  onClose: () => void;
  initialFileName: string;
  uiStrings: any;
  onSaveJson: (fileName: string) => void;
  onSaveZip: (fileName: string) => void;
}

export const SaveLevelModal: React.FC<SaveLevelModalProps> = ({
  onClose,
  initialFileName,
  uiStrings,
  onSaveJson,
  onSaveZip,
}) => {
  const [localFileName, setLocalFileName] = useState(initialFileName);

  useEffect(() => {
    setLocalFileName(initialFileName);
  }, [initialFileName]);

  const playClickSound = () => {
    try {
      const audio = new Audio(ASSETS.SOUNDS.CLICK);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  };

  const playSaveSound = () => {
    try {
      const audio = new Audio(ASSETS.SOUNDS.SAVE);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  };

  const handleJsonClick = () => {
    playSaveSound();
    onSaveJson(localFileName);
  };

  const handleZipClick = () => {
    playSaveSound();
    onSaveZip(localFileName);
  };

  const handleCancelClick = () => {
    playClickSound();
    onClose();
  };

  return (
    <div 
      id="save-level-modal-overlay"
      className="absolute inset-0 bg-black/60 flex items-center justify-center z-[500] backdrop-blur-sm pointer-events-auto"
      onClick={handleCancelClick}
    >
      <div 
        id="save-level-modal-card"
        className="bg-gray-900 border border-indigo-500/50 p-6 rounded-sm min-w-[320px] shadow-2xl shadow-indigo-900/20 text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="save-level-modal-title" className="font-bold text-xl mb-4 text-white uppercase tracking-widest text-center">
          {uiStrings.save_level || "Save Level"}
        </h3>
        <div className="mb-6">
          <label id="save-level-input-label" className="block text-xs uppercase tracking-widest text-gray-400 mb-2">
            {uiStrings.save_file_name || "File Name"}
          </label>
          <input
            id="save-level-file-input"
            type="text"
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            value={localFileName}
            onChange={(e) => setLocalFileName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleJsonClick();
              if (e.key === 'Escape') handleCancelClick();
            }}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            id="save-level-cancel-btn"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm uppercase tracking-wider transition-colors cursor-pointer"
            onClick={handleCancelClick}
          >
            {uiStrings.btn_cancel || "Cancel"}
          </button>
          <button
            id="save-level-json-btn"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-sm uppercase tracking-wider transition-colors cursor-pointer"
            onClick={handleJsonClick}
          >
            {uiStrings.btn_save_json || "Level JSON"}
          </button>
          <button
            id="save-level-zip-btn"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-sm uppercase tracking-wider transition-colors cursor-pointer"
            onClick={handleZipClick}
          >
            {uiStrings.btn_save_assets || "Assets ZIP"}
          </button>
        </div>
      </div>
    </div>
  );
};
