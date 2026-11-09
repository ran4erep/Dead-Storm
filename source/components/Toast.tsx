
import React from 'react';
import { ToastItem } from '../types';
import { useViewportScale } from '../hooks/useViewportScale';

interface ToastContainerProps {
  toasts: ToastItem[];
  variant?: 'default' | 'center' | 'fixed-bottom'; // Updated type
  isAbsolute?: boolean;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, variant = 'default', isAbsolute }) => {
  const scale = useViewportScale();

  if (toasts.length === 0) return null;

  let positionClass = "";
  let layoutClass = isAbsolute ? "absolute" : "fixed";

  if (variant === 'center') {
      positionClass = "top-1/2 left-1/2 justify-center";
  } else if (variant === 'fixed-bottom') {
      // Position slightly higher to avoid overlapping safe areas on mobile or bottom edges too tightly
      positionClass = "bottom-8 left-0 right-0 justify-end"; 
  } else {
      // default
      layoutClass = "absolute";
      positionClass = "bottom-4 left-0 right-0 justify-end";
  }

  let transformValue = `scale(${scale})`;
  let originClass = "bottom center";

  if (variant === 'center') {
      transformValue = `translate(-50%, -50%) scale(${scale})`;
      originClass = "center center";
  }

  return (
    <div 
      className={`${layoutClass} z-[300] flex flex-col items-center gap-2 pointer-events-none px-4 w-full ${positionClass}`}
      style={{
        transform: transformValue,
        transformOrigin: originClass,
      }}
    >
      {toasts.map((toast) => (
        <div 
          key={toast.id}
          className={`
            bg-black/95 border border-white/10 
            text-gray-100 px-5 py-2.5 rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.5)]
            font-['Jura'] font-semibold text-sm tracking-widest uppercase
            transform-gpu text-center
            ${toast.isExiting ? 'animate-toast-exit' : 'animate-toast-enter'}
          `}
        >
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes toast-enter {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-exit {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(10px) scale(0.95); }
        }
        .animate-toast-enter {
          animation: toast-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-toast-exit {
          animation: toast-exit 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default React.memo(ToastContainer);
