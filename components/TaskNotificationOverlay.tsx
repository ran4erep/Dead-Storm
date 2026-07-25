import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LevelTask } from '../types';
import { useViewportScale } from '../hooks/useViewportScale';

interface TaskNotificationOverlayProps {
  tasks?: LevelTask[];
  strings: any;
  localize?: (text: string) => string;
}

type NotificationEvent = {
  id: string;
  task: LevelTask;
  type: 'COMPLETED' | 'REVEALED';
};

export const TaskNotificationOverlay = React.memo<TaskNotificationOverlayProps>(
  ({ tasks, strings, localize }) => {
    const [queue, setQueue] = useState<NotificationEvent[]>([]);
    const prevTasksRef = useRef<Record<string, LevelTask['status']>>({});
    const isFirstRender = useRef(true);

    useEffect(() => {
      if (!tasks) return;
      
      if (isFirstRender.current) {
          const newQueueItems: NotificationEvent[] = [];
          tasks.forEach(task => {
             prevTasksRef.current[task.id] = task.status;
             if (task.status === 'ACTIVE' && !(task as any).isSilentOnLoad) {
                 newQueueItems.push({ id: `REVEALED_${task.id}_${Date.now()}`, task, type: 'REVEALED' });
             }
          });
          isFirstRender.current = false;
          if (newQueueItems.length > 0) {
              setQueue(prev => [...prev, ...newQueueItems]);
          }
          return;
      }

      const newQueueItems: NotificationEvent[] = [];
      tasks.forEach(task => {
          const prevStatus = prevTasksRef.current[task.id] || 'HIDDEN';
          if (prevStatus !== 'COMPLETED' && task.status === 'COMPLETED') {
              newQueueItems.push({ id: `COMPLETED_${task.id}_${Date.now()}`, task, type: 'COMPLETED' });
          } else if (prevStatus === 'HIDDEN' && task.status === 'ACTIVE') {
              newQueueItems.push({ id: `REVEALED_${task.id}_${Date.now()}`, task, type: 'REVEALED' });
          }
          prevTasksRef.current[task.id] = task.status;
      });

      if (newQueueItems.length > 0) {
          setQueue(prev => [...prev, ...newQueueItems]);
      }
    }, [tasks]);

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
      <div className="absolute top-[60px] left-0 right-0 pointer-events-none z-[100] flex justify-center perspective-[1000px]">
          {activeNotification && (
            <TaskNotificationBanner 
              key={activeNotification.id} 
              event={activeNotification} 
              strings={strings}
              onComplete={handleDisplayComplete}
              localize={localize}
            />
          )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 1. Check if strings localized header changed (e.g. language toggled)
    if (prevProps.strings?.ui?.modal?.new_task !== nextProps.strings?.ui?.modal?.new_task) {
      return false;
    }
    
    // 2. Check if tasks array actually changed
    const prevTasks = prevProps.tasks;
    const nextTasks = nextProps.tasks;
    if (prevTasks === nextTasks) return true;
    if (!prevTasks || !nextTasks) return false;
    if (prevTasks.length !== nextTasks.length) return false;
    
    for (let i = 0; i < prevTasks.length; i++) {
      if (prevTasks[i].id !== nextTasks[i].id || prevTasks[i].status !== nextTasks[i].status) {
        return false;
      }
    }
    
    return true;
  }
);

const TaskNotificationBanner: React.FC<{ event: NotificationEvent, strings: any, onComplete: () => void, localize?: (text: string) => string }> = ({ event, strings, onComplete, localize }) => {
  const scale = useViewportScale();
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'checked' | 'strikethrough' | 'exit'>('hidden');
  
  const textKey = strings.ui?.tasks?.[event.task.descriptionKey] || event.task.descriptionKey;
  const description = localize ? localize(textKey) : textKey;

  const isCompletedEvent = event.type === 'COMPLETED';
  const headerText = isCompletedEvent 
    ? (strings.ui?.modal?.task_completed || 'TASK COMPLETED') 
    : (strings.ui?.modal?.new_task || 'NEW TASK');

  useEffect(() => {
    let t1: any, t2: any, t3: any, t4: any;

    if (isCompletedEvent) {
      t1 = setTimeout(() => setPhase('enter'), 50);
      t2 = setTimeout(() => setPhase('checked'), 800);
      t3 = setTimeout(() => setPhase('strikethrough'), 1050);
      t4 = setTimeout(() => setPhase('exit'), 3000);
    } else {
      t1 = setTimeout(() => setPhase('enter'), 50);
      t4 = setTimeout(() => setPhase('exit'), 2500);
    }

    return () => { 
        clearTimeout(t1); 
        clearTimeout(t2); 
        clearTimeout(t3); 
        clearTimeout(t4); 
    };
  }, [isCompletedEvent]);

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
      className={`transition-[transform,opacity] duration-500 ease-out bg-gray-950/95 border border-gray-600 shadow-lg text-gray-200 py-2 px-3 rounded-md w-64 max-w-[90vw] flex flex-col items-center mx-4 ${opacityClass}`}
      style={{
        transform: `translateY(${currentTranslateY}px) scale(${currentScale})`,
        transformOrigin: 'top center'
      }}
    >
      <div className={`text-[9px] font-bold tracking-widest uppercase mb-1 ${isCompletedEvent ? 'text-green-400' : 'text-cyan-400'}`}>
          {headerText}
      </div>
      <div className="flex items-center gap-2 w-full">
        {/* Checkbox */}
        <div className={`w-4 h-4 shrink-0 border-[1.5px] rounded-sm flex items-center justify-center transition-colors duration-300 relative ${isCompletedEvent && (phase === 'checked' || phase === 'strikethrough') ? 'bg-green-500/20 border-green-500' : 'bg-gray-800/50 border-gray-500'}`}>
           {/* Check icon */}
           <svg
              className={`w-3 h-3 text-green-400 transition-[transform,opacity] duration-300 ${isCompletedEvent && (phase === 'checked' || phase === 'strikethrough') ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2.5"
           >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
           </svg>
        </div>
        
        {/* Text Area */}
        <div className={`flex-1 relative font-mono text-[10px] leading-snug transition-colors duration-500 overflow-hidden ${isCompletedEvent && phase === 'strikethrough' ? 'text-gray-500' : 'text-gray-200'}`}>
             {description}
             
             {/* Strikethrough line */}
             <div 
                 className={`absolute top-1/2 left-0 h-[1.5px] bg-green-500/80 transition-transform duration-500 ease-out z-10 w-full origin-left`}
                 style={{ 
                     transform: isCompletedEvent && phase === 'strikethrough' ? 'scaleX(1)' : 'scaleX(0)',
                     marginTop: '-0.5px'
                 }}
             />
        </div>
      </div>
    </div>
  );
};

