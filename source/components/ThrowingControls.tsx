
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Hand, Ban } from 'lucide-react';
import { GameStrings } from '../types';

interface ThrowingControlsProps {
  strings: GameStrings['ui']['controls'];
  onThrow: () => void;
  onCancel: () => void;
  invertContextButtons?: boolean;
}

const ThrowingControls: React.FC<ThrowingControlsProps> = ({ strings, onThrow, onCancel, invertContextButtons = false }) => {
  useEffect(() => {
    // Custom events are handled directly in useInputController now.
  }, [onThrow, onCancel]);

  const portalTarget = document.getElementById('combat-actions-slot');

  const content = (
    <div 
      className="bg-black/95 border-t border-red-900/50 p-1 pointer-events-auto flex flex-col gap-1 pb-1 transition-opacity duration-300"
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onPointerMove={e => e.stopPropagation()}
      onPointerLeave={e => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-2 w-full">
        <button 
          id="combat-left-btn"
          data-no-click-sound="true"
          onClick={invertContextButtons ? onCancel : onThrow}
          className={`${invertContextButtons ? 'bg-gray-800' : 'bg-red-800 border border-red-600 text-red-100'} font-bold py-3 rounded flex flex-row items-center justify-center gap-2 active:scale-95 transition-all shadow-lg touch-manipulation`}
        >
          {invertContextButtons ? <Ban size={16} /> : <Hand size={16} />}
          <span className={invertContextButtons ? "text-xs uppercase" : "tracking-widest text-xs uppercase"}>
            {invertContextButtons ? strings.btn_cancel : (strings.btn_throw || "THROW")}
          </span>
        </button>
        <button 
          id="combat-right-btn"
          onClick={invertContextButtons ? onThrow : onCancel}
          className={`${invertContextButtons ? 'bg-red-800 border border-red-600 text-red-100' : 'bg-gray-800 active:bg-gray-700 border border-gray-600 text-gray-300'} font-bold py-3 rounded flex flex-row items-center justify-center gap-2 active:scale-95 transition-transform touch-manipulation`}
        >
          {invertContextButtons ? <Hand size={16} /> : <Ban size={16} />}
          <span className={invertContextButtons ? "tracking-widest text-xs uppercase" : "text-xs uppercase"}>
            {invertContextButtons ? (strings.btn_throw || "THROW") : strings.btn_cancel}
          </span>
        </button>
      </div>
    </div>
  );

  if (!portalTarget) return null;
  return createPortal(content, portalTarget);
};

export default React.memo(ThrowingControls);
