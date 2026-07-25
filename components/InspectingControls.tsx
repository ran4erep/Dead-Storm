import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Ban } from 'lucide-react';

interface InspectingControlsProps {
  strings: any;
  onInspect: () => void;
  onCancel: () => void;
  invertContextButtons?: boolean;
}

const InspectingControls: React.FC<InspectingControlsProps> = ({ strings, onInspect, onCancel, invertContextButtons = false }) => {
  useEffect(() => {
    // Custom events are handled directly in useInputController now.
  }, [onInspect, onCancel]);

  const portalTarget = document.getElementById('combat-actions-slot');

  const content = (
    <div 
      className="bg-black/95 border-t border-cyan-900/50 p-1 pointer-events-auto flex flex-col gap-1 pb-1 transition-opacity duration-300"
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
          onClick={invertContextButtons ? onCancel : onInspect}
          className={`${invertContextButtons ? 'bg-gray-800' : 'bg-cyan-800 border border-cyan-600 text-cyan-100'} font-bold py-3 rounded flex flex-row items-center justify-center gap-2 active:scale-95 transition-all shadow-lg touch-manipulation`}
        >
          {invertContextButtons ? <Ban size={16} /> : <Eye size={16} />}
          <span className={invertContextButtons ? "text-xs uppercase" : "tracking-widest text-xs uppercase"}>
            {invertContextButtons ? strings.btn_cancel : strings.btn_inspect}
          </span>
        </button>
        <button 
          id="combat-right-btn"
          onClick={invertContextButtons ? onInspect : onCancel}
          className={`${invertContextButtons ? 'bg-cyan-800 border border-cyan-600 text-cyan-100' : 'bg-gray-800 active:bg-gray-700 border border-gray-600 text-gray-300'} font-bold py-3 rounded flex flex-row items-center justify-center gap-2 active:scale-95 transition-transform touch-manipulation`}
        >
          {invertContextButtons ? <Eye size={16} /> : <Ban size={16} />}
          <span className={invertContextButtons ? "tracking-widest text-xs uppercase" : "text-xs uppercase"}>
            {invertContextButtons ? strings.btn_inspect : strings.btn_cancel}
          </span>
        </button>
      </div>
    </div>
  );

  if (!portalTarget) return null;
  return createPortal(content, portalTarget);
};

export default React.memo(InspectingControls);
