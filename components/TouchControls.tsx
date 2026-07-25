
import React, { useRef } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

interface TouchControlsProps {
  disableMovement: boolean;
  disableWalking?: boolean;
  disableActions: boolean;
  isConsoleGameActive?: boolean;
  onStrafe: (isRight: boolean) => void;
  onOpenActions: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.PointerEvent) => void;
}

const TouchControls: React.FC<TouchControlsProps> = ({
  disableMovement,
  disableWalking = false,
  disableActions,
  isConsoleGameActive = false,
  onStrafe,
  onOpenActions,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onContextMenu
}) => {
  const touchStartRef = useRef<{x: number, y: number} | null>(null);

  const handleLocalTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    onTouchStart(e);
  };

  const handleStrafeEnd = (e: React.TouchEvent, isRight: boolean) => {
    if (!touchStartRef.current || disableMovement || disableWalking || isConsoleGameActive) return;
    e.preventDefault();
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartRef.current.x);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y);
    if (dx < 10 && dy < 10) {
      onStrafe(isRight);
    }
  };

  const handleCenterEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    if (disableActions && !isConsoleGameActive) return;
    e.preventDefault();
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartRef.current.x);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y);
    if (dx < 10 && dy < 10) {
      onOpenActions();
    }
  };

  return (
    <div 
      id="controls-touch-layer"
      className="bg-gray-900 border-t border-gray-800 shrink-0 h-32 z-40 flex shadow-[inset_0_10px_20px_rgba(0,0,0,0.5)] touch-none tutorial-highlight"
      data-tutorial-target="TOUCH_CONTROLS"
      onTouchStart={handleLocalTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={onContextMenu}
    >
      {/* STRAFE LEFT - 20% */}
      <button
        disabled={disableMovement || disableWalking || isConsoleGameActive}
        onTouchEnd={(e) => handleStrafeEnd(e, false)}
        onClick={(e) => { e.stopPropagation(); if (!isConsoleGameActive) onStrafe(false); }}
        className="w-[20%] h-full flex items-center justify-center bg-black/10 border-r border-gray-800 active:bg-gray-800/80 transition-colors group disabled:opacity-30 pointer-events-auto touch-none"
      >
        <ChevronsLeft className="text-gray-600 group-active:text-cyan-400 transition-colors" size={32} />
      </button>

      {/* CENTER - 60% - Empty for gestures, tap opens actions */}
      <div
        className={`w-[60%] h-full flex flex-col items-center justify-center bg-transparent ${(disableActions && !isConsoleGameActive) ? 'cursor-default' : 'active:bg-gray-800/20 cursor-pointer'} transition-colors group relative overflow-hidden touch-none`}
        onTouchEnd={handleCenterEnd}
        onClick={() => { if (!disableActions || isConsoleGameActive) onOpenActions(); }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:100%_2px] pointer-events-none"></div>
        
        {/* Removed visual decorations (lines and dots) per user request */}
      </div>

      {/* STRAFE RIGHT - 20% */}
      <button
        disabled={disableMovement || disableWalking || isConsoleGameActive}
        onTouchEnd={(e) => handleStrafeEnd(e, true)}
        onClick={(e) => { e.stopPropagation(); if (!isConsoleGameActive) onStrafe(true); }}
        className="w-[20%] h-full flex items-center justify-center bg-black/10 border-l border-gray-800 active:bg-gray-800/80 transition-colors group disabled:opacity-30 pointer-events-auto touch-none"
      >
        <ChevronsRight className="text-gray-600 group-active:text-cyan-400 transition-colors" size={32} />
      </button>
    </div>
  );
};

export default React.memo(TouchControls);
