
import { useState, useCallback, useRef, useEffect } from 'react';
import { ToastItem } from '../types';

export const useToast = (isFemale: boolean = false) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  
  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    
    // Parse gender-specific text: word{femaleWord}
    const parsedMessage = message.replace(/([a-zA-Zа-яА-ЯёЁ0-9_\-]+)\{([^}]+)\}/g, (match, maleWord, femaleWord) => {
        return isFemale ? femaleWord : maleWord;
    });
    
    // 1. Add Toast
    setToasts(prev => {
      const current = [...prev];
      // Keep max 3, remove oldest if needed immediately to prevent screen clutter
      if (current.length >= 3) {
         current.shift();
      }
      return [...current, { id, message: parsedMessage, isExiting: false }];
    });

    // 2. Schedule Exit Animation (Fade out start) - 1 second duration
    const exitTimer = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t));
    }, 1000);
    timersRef.current.push(exitTimer);

    // 3. Schedule Removal (Remove from DOM) - 1s + 0.3s animation
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 1300);
    timersRef.current.push(removeTimer);
  }, [isFemale]);

  // Clean up all pending timeouts on unmount to prevent memory leaks and state updates on unmounted components
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  return { toasts, showToast };
};
