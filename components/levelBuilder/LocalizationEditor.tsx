import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

interface LocalizationEditorProps {
    data: { en: any; ru: any };
    onChange: (newData: { en: any; ru: any }) => void;
    label?: string;
    level?: number;
}

export const LocalizationEditor: React.FC<LocalizationEditorProps> = ({ data, onChange, label = 'root', level = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(level === 0 || level === 1);
    const [newKey, setNewKey] = useState('');
    const [newValueType, setNewValueType] = useState<'string' | 'object'>('string');

    const isObject = (val: any) => val !== null && typeof val === 'object' && !Array.isArray(val);

    const handleKeyChange = (oldKey: string, newKeyName: string) => {
        if (oldKey === newKeyName || !newKeyName.trim()) return;
        const newEn = { ...data.en };
        const newRu = { ...data.ru };
        
        newEn[newKeyName] = newEn[oldKey];
        delete newEn[oldKey];

        newRu[newKeyName] = newRu[oldKey];
        delete newRu[oldKey];

        onChange({ en: newEn, ru: newRu });
    };

    const handleDelete = (key: string) => {
        const newEn = { ...data.en };
        const newRu = { ...data.ru };
        delete newEn[key];
        delete newRu[key];
        onChange({ en: newEn, ru: newRu });
    };

    const handleAddField = () => {
        if (!newKey.trim()) return;
        
        const valToAdd = newValueType === 'object' ? {} : '';
        const newEn = { ...data.en, [newKey]: valToAdd };
        const newRu = { ...data.ru, [newKey]: valToAdd };
        
        onChange({ en: newEn, ru: newRu });
        setNewKey('');
    };

    const handleValueChange = (key: string, lang: 'en' | 'ru', updatedValue: any) => {
        const newData = { en: { ...data.en }, ru: { ...data.ru } };
        newData[lang][key] = updatedValue;
        onChange(newData);
    };

    if (typeof data.en !== 'object' || data.en === null) {
        return null; // The base localization node should always be an object.
    }

    // We unite keys from both to handle cases where one might have a key the other doesn't
    const allKeys = Array.from(new Set([...Object.keys(data.en || {}), ...Object.keys(data.ru || {})]));

    return (
        <div className={`ml-${level === 0 ? 0 : 4} mb-2 w-full ${level > 0 ? 'border-l border-gray-700 pl-2' : ''}`}>
            <div 
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 p-1 rounded" 
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                <span className="text-gray-300 font-semibold font-mono text-sm">{label} {'{...}'}</span>
            </div>
            
            {isExpanded && (
                <div className="mt-2 pl-4 border-l border-gray-800">
                    {allKeys.map((key) => {
                        const valEn = data.en[key];
                        const valRu = data.ru[key];
                        const isObjEn = isObject(valEn);
                        const isObjRu = isObject(valRu);

                        // If at least one is an object, treat both as objects
                        if (isObjEn || isObjRu) {
                            return (
                                <div key={key} className="flex flex-col gap-1 mb-2">
                                    <div className="flex items-start justify-between min-w-0 w-full bg-gray-800/30 rounded p-1">
                                        <div className="flex-1 min-w-0">
                                            <LocalizationEditor 
                                                label={key} 
                                                data={{ en: valEn || {}, ru: valRu || {} }} 
                                                onChange={(newVal) => {
                                                    const newData = { en: { ...data.en }, ru: { ...data.ru } };
                                                    newData.en[key] = newVal.en;
                                                    newData.ru[key] = newVal.ru;
                                                    onChange(newData);
                                                }} 
                                                level={level + 1} 
                                            />
                                        </div>
                                        <button onClick={() => handleDelete(key)} className="text-red-500 hover:text-red-400 p-1 ml-2"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={key} className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 mb-2 w-full bg-gray-800/50 p-2 rounded relative">
                                <div className="sm:w-1/4 flex flex-col justify-center">
                                    <input
                                        type="text"
                                        value={key}
                                        onChange={(e) => handleKeyChange(key, e.target.value)}
                                        className="w-full bg-gray-900 text-white border border-gray-600 focus:border-blue-500 p-1.5 rounded font-mono text-sm focus:outline-none"
                                        placeholder="Key..."
                                    />
                                </div>
                                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                    <div className="flex-1 flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">EN</span>
                                        <textarea
                                            value={String(valEn ?? '')}
                                            onChange={(e) => handleValueChange(key, 'en', e.target.value)}
                                            rows={Math.max(1, (valEn || '').toString().split('\n').length)}
                                            className="w-full bg-gray-900 text-white border border-gray-600 p-1.5 rounded font-sans text-sm focus:outline-none focus:border-blue-500 min-h-[32px] resize-y"
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">RU</span>
                                        <textarea
                                            value={String(valRu ?? '')}
                                            onChange={(e) => handleValueChange(key, 'ru', e.target.value)}
                                            rows={Math.max(1, (valRu || '').toString().split('\n').length)}
                                            className="w-full bg-gray-900 text-white border border-gray-600 p-1.5 rounded font-sans text-sm focus:outline-none focus:border-blue-500 min-h-[32px] resize-y"
                                        />
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(key)} className="absolute top-1 right-1 text-red-500 hover:text-red-400 p-1 sm:static sm:self-center bg-gray-900/50 rounded">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-4 pt-2 border-t border-gray-800 w-full">
                        <input 
                            type="text" 
                            placeholder="New key" 
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            className="bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm w-full sm:w-1/4"
                        />
                        <CustomSelect 
                            value={newValueType} 
                            onChange={(e) => setNewValueType(e.target.value as any)}
                            className="bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm w-full sm:w-auto"
                        >
                            <option value="string">String</option>
                            <option value="object">Object (Folder)</option>
                        </CustomSelect>
                        <button 
                            onClick={handleAddField}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 sm:py-1 rounded flex items-center justify-center whitespace-nowrap w-full sm:w-auto"
                        >
                            <Plus size={16} /> Add Route
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
