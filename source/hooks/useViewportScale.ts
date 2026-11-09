import { useState, useEffect } from 'react';

// Глобальные переменные для единственного слушателя события resize (паттерн Singleton).
// Это позволяет избежать множественных вызовов getBoundingClientRect / window.innerWidth
// во всех местах использования хука, предотвращая "layout thrashing" (коллизию перерисовок).
let globalScale = 1;
let globalWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
let globalHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
const scaleListeners = new Set<(scale: number) => void>();
let resizeTimeout: any = null;
let isGlobalListening = false;

function calculateScale(w: number, h: number): number {
  let newScale = 1;
  if (w > h) {
    // Ландшафтный режим на ПК
    // Делаем масштабирование более плавным: 1x при ширине 1024, 1.5x при 1536 и т.д.
    newScale = Math.max(1, w / 1024);
    newScale = Math.min(newScale, 2); // Ограничиваем максимальный масштаб до 2x
  } else {
    // Портретный режим на мобильных
    // На мобильных оставляем стандартный размер 1x
    newScale = 1;
  }
  return newScale;
}

const handleGlobalResize = () => {
  // Дебаунс обратного вызова для предотвращения лагов при перетаскивании окна на ПК
  if (resizeTimeout) return;

  resizeTimeout = setTimeout(() => {
    resizeTimeout = null;
    if (typeof window === 'undefined') return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Вычисляем масштаб только если размеры окна ДЕЙСТВИТЕЛЬНО изменились
    if (w !== globalWidth || h !== globalHeight) {
      globalWidth = w;
      globalHeight = h;
      const nextScale = calculateScale(w, h);
      if (nextScale !== globalScale) {
        globalScale = nextScale;
        scaleListeners.forEach(listener => listener(globalScale));
      }
    }
  }, 100); // Ограничиваем частоту обновления до 100мс
};

function startGlobalListening() {
  if (typeof window !== 'undefined' && !isGlobalListening) {
    window.addEventListener('resize', handleGlobalResize);
    isGlobalListening = true;
    
    // Первоначальный расчет
    globalWidth = window.innerWidth;
    globalHeight = window.innerHeight;
    globalScale = calculateScale(globalWidth, globalHeight);
  }
}

function stopGlobalListening() {
  if (typeof window !== 'undefined' && isGlobalListening && scaleListeners.size === 0) {
    window.removeEventListener('resize', handleGlobalResize);
    isGlobalListening = false;
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
      resizeTimeout = null;
    }
  }
}

/**
 * Хук для динамического вычисления масштаба вьюпорта игры.
 * Полноценно оптимизирован для предотвращения layout thrashing и избыточных ре-рендеров.
 */
export function useViewportScale() {
  const [viewportScale, setViewportScale] = useState(globalScale);

  useEffect(() => {
    const listener = (newScale: number) => {
      setViewportScale(newScale);
    };

    scaleListeners.add(listener);
    startGlobalListening();

    // Синхронизируем локальный стейт с актуальным глобальным значением
    setViewportScale(globalScale);

    return () => {
      scaleListeners.delete(listener);
      stopGlobalListening();
    };
  }, []);

  return viewportScale;
}

