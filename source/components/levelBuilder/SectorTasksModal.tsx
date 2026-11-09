import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { LevelDefinition } from '../../types';
import { CustomSelect } from './CustomSelect';

interface SectorTasksModalProps {
  level: LevelDefinition;
  setLevel: React.Dispatch<React.SetStateAction<LevelDefinition>>;
  onClose: () => void;
  uiStrings?: any;
}

export const SectorTasksModal: React.FC<SectorTasksModalProps> = ({ level, setLevel, onClose, uiStrings }) => {
  const [localTasks, setLocalTasks] = useState(level.tasks ? [...level.tasks] : []);
  
  useEffect(() => {
    setLocalTasks(level.tasks ? [...level.tasks] : []);
  }, [level.tasks]);

  const handleApplyAndClose = () => {
    setLevel(prev => ({ ...prev, tasks: localTasks }));
    onClose();
  };

  const handleAddTask = () => {
    const newTask = {
      id: `task_${Date.now()}`,
      descriptionKey: '/',
      status: 'HIDDEN' as 'ACTIVE' | 'HIDDEN'
    };
    setLocalTasks(prev => [...prev, newTask]);
  };

  const handleRemoveTask = (index: number) => {
    setLocalTasks(prev => {
      const newTasks = [...prev];
      newTasks.splice(index, 1);
      return newTasks;
    });
  };

  const handleChangeTask = (index: number, key: string, value: string) => {
    setLocalTasks(prev => {
      const newTasks = [...prev];
      newTasks[index] = { ...newTasks[index], [key]: value };
      return newTasks;
    });
  };

  const handleDescriptionChange = (index: number, lang: 'ru' | 'en', text: string) => {
    setLocalTasks(prev => {
      const newTasks = [...prev];
      const task = { ...newTasks[index] };
      const descParts = (task.descriptionKey || '/').split('/');
      const ruPart = descParts[0] || '';
      const enPart = descParts[1] || '';

      if (lang === 'ru') {
        task.descriptionKey = `${text}/${enPart}`;
      } else {
        task.descriptionKey = `${ruPart}/${text}`;
      }

      newTasks[index] = task;
      return newTasks;
    });
  };

  return (
    <div className="absolute inset-0 bg-black/80 sm:bg-black/10 backdrop-blur-sm flex items-center justify-center z-[600] p-0 sm:p-4">
      <div className="bg-gray-800 border-0 sm:border border-gray-700 sm:rounded-lg flex flex-col max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90dvh] shadow-2xl relative">
        <div className="flex justify-between items-center p-4 sm:p-6 shrink-0 border-b border-gray-700">
          <h2 className="text-xl font-bold">{uiStrings?.tasks_settings || 'Задачи Сектора'}</h2>
          <button onClick={handleApplyAndClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-2 sm:p-6 overflow-y-auto flex-1 space-y-4">
          <div className="space-y-4">
            {localTasks.map((task, index) => {
              const descParts = (task.descriptionKey || '/').split('/');
              const ruPart = descParts[0] || '';
              const enPart = descParts[1] || '';

              return (
                <div key={index} className="bg-gray-900/50 p-4 rounded border border-gray-800 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">ID</label>
                      <input 
                        type="text" 
                        value={task.id}
                        onChange={(e) => handleChangeTask(index, 'id', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500 font-bold"
                      />
                    </div>
                    
                    <div className="w-1/3">
                      <label className="block text-sm text-gray-400 mb-1">Status</label>
                      <CustomSelect
                        value={task.status}
                        onChange={(e) => handleChangeTask(index, 'status', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="HIDDEN">HIDDEN</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </CustomSelect>
                    </div>

                    <button 
                      onClick={() => handleRemoveTask(index)}
                      className="mt-7 bg-red-900/40 border border-red-700/50 hover:bg-red-800/80 text-red-200 p-2 rounded h-10 w-10 flex items-center justify-center transition-colors shrink-0"
                      title="Удалить задачу"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Description (RU)</label>
                      <input 
                        type="text" 
                        value={ruPart}
                        onChange={(e) => handleDescriptionChange(index, 'ru', e.target.value)}
                        placeholder="Текст на русском..."
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Description (EN)</label>
                      <input 
                        type="text" 
                        value={enPart}
                        onChange={(e) => handleDescriptionChange(index, 'en', e.target.value)}
                        placeholder="Текст на английском..."
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button 
            onClick={handleAddTask}
            className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white py-3 rounded flex items-center justify-center gap-2 font-bold transition-colors"
          >
            <Plus size={18} /> Добавить Задачу
          </button>
          
          <button 
              onClick={handleApplyAndClose}
              className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded text-white transition-colors tracking-widest uppercase"
          >
              {uiStrings?.done || 'DONE'}
          </button>
        </div>
      </div>
    </div>
  );
};
