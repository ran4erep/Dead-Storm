import React from 'react';
import { MapPin, X, FileText, CheckCircle2, Circle, ListTodo } from 'lucide-react';
import { LevelTask } from '../types';

interface LocationModalProps {
    levelData: any;
    strings: any;
    onClose: () => void;
}

const LocationModal: React.FC<LocationModalProps> = ({ levelData, strings, onClose }) => {
    // Filter out hidden tasks
    const visibleTasks = levelData?.tasks?.filter((t: LevelTask) => t.status !== 'HIDDEN') || [];

    return (
        <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-2 transition-all duration-300">
            <div className="bg-gray-800 border border-gray-600 w-full max-w-md rounded-lg flex flex-col max-h-[85vh] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                    <h3 className="text-lg font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <MapPin size={18} className="text-cyan-500" />
                        {levelData?.name}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 active:text-white transition-colors flex items-center gap-1 touch-manipulation gamepad-hide-buttons">
                        <X size={20} />
                        <span className="text-xs uppercase font-bold">{strings.ui.modal.close}</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="p-2.5 bg-gray-900/80 rounded border border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-black/30 rounded">
                                <FileText className="w-4 h-4 text-gray-400" />
                            </div>
                            <h4 className="font-bold text-gray-200 text-xs uppercase">{strings.ui.modal.intel_title}</h4>
                        </div>
                        <p className="text-gray-400 text-[10px] leading-relaxed italic border-l-2 border-gray-600 pl-2">
                            "{levelData?.description}"
                        </p>
                    </div>

                    {visibleTasks.length > 0 && (
                        <div className="p-3 bg-gray-900/90 rounded border border-gray-700/50 shadow-inner">
                            <div className="flex items-center gap-2 mb-3 border-b border-gray-800 pb-2">
                                <div className="p-1.5 bg-black/40 rounded text-cyan-400">
                                    <ListTodo className="w-4 h-4" />
                                </div>
                                <h4 className="font-bold text-gray-200 text-xs tracking-wider uppercase">{strings.ui.modal.tasks_title || "TASKS"}</h4>
                            </div>
                            <div className="space-y-2.5">
                                {visibleTasks.map((task: LevelTask, index: number) => {
                                    const isCompleted = task.status === 'COMPLETED';
                                    return (
                                        <div 
                                            key={`${task.id}_${index}`} 
                                            className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                                                isCompleted 
                                                    ? 'bg-green-900/10 border border-green-900/30' 
                                                    : 'bg-gray-800/50 border border-gray-700/50'
                                            }`}
                                        >
                                            <div className="mt-0.5 shrink-0 flex items-center justify-center">
                                                {isCompleted ? (
                                                    <CheckCircle2 size={16} className="text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.4)]" />
                                                ) : (
                                                    <Circle size={16} className="text-amber-500/70" />
                                                )}
                                            </div>
                                            <p className={`text-[12px] font-medium leading-relaxed flex-1 ${
                                                isCompleted 
                                                    ? 'text-gray-500 line-through decoration-green-900/50' 
                                                    : 'text-gray-200'
                                            }`}>
                                                {strings.ui.tasks?.[task.descriptionKey] || task.descriptionKey}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LocationModal;
