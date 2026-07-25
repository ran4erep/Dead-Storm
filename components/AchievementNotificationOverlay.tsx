import React, { useEffect, useState, useCallback } from 'react';
import { useViewportScale } from '../hooks/useViewportScale';
import { Skull, Wrench, ShieldAlert, Compass, Ghost, Package, Gamepad2, Trophy } from 'lucide-react';
import achievementsData from '../data/achievements.json';

interface AchievementNotificationProps {
  strings: any;
}

type NotificationEvent = {
  id: string;
  key: string;
  title: string;
  desc: string;
};

const IconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Skull,
  Wrench,
  ShieldAlert,
  Compass,
  Ghost,
  Package,
  Gamepad2,
  Trophy
};

const getAchievementIcon = (key: string, className = "w-9 h-9 text-yellow-400") => {
  const ach = achievementsData.find(a => a.key === key);
  if (!ach) {
    return <Trophy className={className} />;
  }
  const icon = ach.icon || '';
  if (icon.trim().startsWith('<svg')) {
    return (
      <div 
        className={`${className} flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:shrink-0`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  const IconComponent = IconMap[icon] || Trophy;
  return <IconComponent className={className} />;
};

export const AchievementNotificationOverlay = React.memo<AchievementNotificationProps>(
  ({ strings }) => {
    const [queue, setQueue] = useState<NotificationEvent[]>([]);

    useEffect(() => {
      const handleAchievementUnlocked = (e: any) => {
        const { key, title, desc } = e.detail;
        setQueue(prev => [...prev, { id: `${key}_${Date.now()}`, key, title, desc }]);
      };
      
      window.addEventListener('achievement-unlocked-ui', handleAchievementUnlocked);
      return () => window.removeEventListener('achievement-unlocked-ui', handleAchievementUnlocked);
    }, []);

    const [activeNotification, setActiveNotification] = useState<NotificationEvent | null>(null);

    useEffect(() => {
      if (!activeNotification && queue.length > 0) {
        setActiveNotification(queue[0]);
      }
    }, [queue, activeNotification]);

    const handleDisplayComplete = useCallback(() => {
      setQueue(prev => {
          const nextQueue = prev.slice(1);
          if (nextQueue.length > 0) {
              setActiveNotification(nextQueue[0]);
          } else {
              setActiveNotification(null);
          }
          return nextQueue;
      });
    }, []);

    return (
      <div className="absolute top-[30px] left-0 right-0 pointer-events-none z-[110] flex justify-center perspective-[1000px]">
          {activeNotification && (
            <AchievementNotificationBanner 
              key={activeNotification.id} 
              event={activeNotification} 
              strings={strings}
              onComplete={handleDisplayComplete}
            />
          )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.strings?.achievements?.unlocked_title === nextProps.strings?.achievements?.unlocked_title;
  }
);


const AchievementNotificationBanner: React.FC<{ event: NotificationEvent, strings: any, onComplete: () => void }> = ({ event, strings, onComplete }) => {
  const scale = useViewportScale();
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'exit'>('hidden');
  
  const headerText = strings?.achievements?.unlocked_title || 'ACHIEVEMENT UNLOCKED';

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('enter'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 4000);

    return () => { 
        clearTimeout(t1); 
        clearTimeout(t2); 
    };
  }, []);

  // Hook for calling onComplete after exit transition
  useEffect(() => {
      if (phase === 'exit') {
          const exitTimer = setTimeout(() => onComplete(), 500);
          return () => clearTimeout(exitTimer);
      }
  }, [phase, onComplete]);

  const isVisible = phase !== 'hidden' && phase !== 'exit';
  
  // Transform settings
  const currentScale = isVisible ? scale : scale * 0.95;
  const currentTranslateY = isVisible ? 0 : -16 * scale;
  const opacityClass = isVisible ? 'opacity-100' : 'opacity-0';

  return (
    <div
      className={`transition-[transform,opacity] duration-500 ease-out bg-gray-950/95 border border-gray-600 shadow-lg text-gray-200 py-3 px-3 rounded-md w-72 max-w-[90vw] flex items-center gap-3 mx-4 ${opacityClass}`}
      style={{
        transform: `translateY(${currentTranslateY}px) scale(${currentScale})`,
        transformOrigin: 'top center'
      }}
    >
      <div className="w-11 h-11 shrink-0 border-[1.5px] border-yellow-600 bg-yellow-900/20 rounded flex items-center justify-center text-xl shadow-[0_0_10px_rgba(234,179,8,0.2)]">
         {getAchievementIcon(event.key, "w-[39px] h-[39px] text-yellow-400")}
      </div>
      <div className="flex flex-col justify-center flex-1 w-full text-left">
          <div className={`text-[10px] font-bold tracking-widest uppercase mb-1 text-yellow-400 flex items-center gap-1.5`}>
              <Trophy size={12} className="text-yellow-400 shrink-0" />
              <span className="truncate">{headerText}</span>
          </div>
          <div className="relative font-mono text-xs leading-tight transition-colors text-white line-clamp-2">
              {event.title}
          </div>
      </div>
    </div>
  );
};
