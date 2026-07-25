import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, Wand2, Crosshair, Copy, Play, Square, Upload, Skull, Wrench, ShieldAlert, Compass, Ghost, Package, Gamepad2, Trophy } from 'lucide-react';
import { getTemplateFor } from './typeParser';
import { HandOffsetVisualEditor } from './HandOffsetVisualEditor';
import { AttackAnimationVisualEditor } from './AttackAnimationVisualEditor';
import { ASSETS } from '../../assets';
import { CustomSelect } from './CustomSelect';

const EditorIconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Skull,
  Wrench,
  ShieldAlert,
  Compass,
  Ghost,
  Package,
  Gamepad2,
  Trophy
};

const renderAchievementIcon = (iconStr: string, className = "w-6 h-6 text-yellow-400") => {
  if (!iconStr) return <Trophy className={className} />;
  const trimmed = iconStr.trim();
  if (trimmed.startsWith('<svg')) {
    return (
      <div 
        className={`${className} flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:shrink-0`}
        dangerouslySetInnerHTML={{ __html: iconStr }}
      />
    );
  }
  const IconComponent = EditorIconMap[trimmed] || Trophy;
  return <IconComponent className={className} />;
};

export interface UrlPrefix {
    label: string;
    value: string;
}

export const DEFAULT_URL_PREFIXES: UrlPrefix[] = [
    { label: 'ANIM_URL', value: 'https://ran4erep.github.io/storm/anims' },
    { label: 'EQUIP_URL', value: 'https://ran4erep.github.io/storm/equip' },
    { label: 'SOUND_URL', value: 'https://ran4erep.github.io/storm/sounds' },
    { label: 'BASE_URL', value: 'https://ran4erep.github.io/storm' },
];

const KeyInput = ({ initialKey, onChange, className }: { initialKey: string, onChange: (newKey: string) => void, className: string }) => {
    const [localKey, setLocalKey] = useState(initialKey);
    useEffect(() => { setLocalKey(initialKey); }, [initialKey]);
    return (
        <input
            type="text"
            value={localKey}
            onChange={e => setLocalKey(e.target.value)}
            onBlur={() => onChange(localKey)}
            className={className}
        />
    );
};

const ValueInput = ({ value, originalType, onChange: propOnChange, className }: { value: any, originalType: string, onChange: (v: any) => void, className: string }) => {
    const [localValue, setLocalValue] = useState(String(value ?? ''));
    useEffect(() => { setLocalValue(String(value ?? '')); }, [value]);

    const handleBlur = () => {
        let val: any = localValue;
        if (originalType === 'number') {
            val = Number(val);
            if (isNaN(val)) val = 0;
        }
        if (originalType === 'boolean') val = val === 'true';
        propOnChange(val);
    };

    if (originalType === 'boolean') {
        const booleanValueStr = localValue === 'true' ? 'true' : 'false';
        return (
            <CustomSelect
                value={booleanValueStr}
                onChange={(e) => {
                    const newValStr = e.target.value;
                    setLocalValue(newValStr);
                    propOnChange(newValStr === 'true');
                }}
                className={className}
            >
                <option value="true">true</option>
                <option value="false">false</option>
            </CustomSelect>
        );
    }

    return (
        <input
            key={originalType}
            type={originalType === 'number' ? "number" : "text"}
            value={localValue}
            onChange={(e) => {
                setLocalValue(e.target.value);
                if (originalType === 'string') propOnChange(e.target.value);
            }}
            onBlur={handleBlur}
            className={className}
            onKeyDown={(e) => {
                if (e.key === 'Enter') handleBlur();
            }}
        />
    );
};

const AssetPreview = ({ url, isAudioKey }: { url: string, isAudioKey?: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    let resolvedUrl = url;
    if (url.startsWith('local://')) {
        try {
            resolvedUrl = localStorage.getItem(url) || url;
        } catch(e) {}
    }

    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url) || /image\//.test(resolvedUrl);
    const isAudio = /\.(mp3|wav|ogg)$/i.test(url) || /audio\//.test(resolvedUrl) || isAudioKey;

    if (!url) return null;

    if (isImage) {
        return (
            <div className="w-8 h-8 shrink-0 bg-gray-900 border border-gray-700 rounded overflow-hidden flex items-center justify-center relative group">
                <img src={resolvedUrl} alt="preview" className="max-w-full max-h-full object-contain" />
                <div className="absolute inset-0 bg-black/80 hidden group-hover:flex items-center justify-center border border-gray-500 rounded z-50 transform scale-[3] origin-bottom-right pointer-events-none transition-transform">
                    <img src={resolvedUrl} alt="large-preview" className="max-w-full max-h-full object-contain" />
                </div>
            </div>
        );
    }
    
    if (isAudio) {
        return (
            <button
                onClick={() => {
                    if (isPlaying && audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current.currentTime = 0;
                        setIsPlaying(false);
                    } else {
                        if (!audioRef.current) {
                            audioRef.current = new Audio(resolvedUrl);
                            audioRef.current.onended = () => setIsPlaying(false);
                        }
                        audioRef.current.play().catch(() => {});
                        setIsPlaying(true);
                    }
                }}
                className="w-8 h-8 shrink-0 bg-blue-600/80 hover:bg-blue-500 text-white rounded flex items-center justify-center transition-colors"
                title={isPlaying ? "Stop" : "Play"}
            >
                {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
        );
    }

    return null;
};

interface GenericDataEditorProps {
    data: any;
    parentData?: any;
    onChange: (newData: any) => void;
    label?: string;
    level?: number;
    rootLabel?: string;
    urlPrefixes?: UrlPrefix[];
    uiStrings?: any;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onKeyChange?: (newKey: string) => void;
}

const GenericDataEditorComponent: React.FC<GenericDataEditorProps> = ({ data, parentData, onChange, label = 'root', level = 0, rootLabel, urlPrefixes = DEFAULT_URL_PREFIXES, uiStrings, onDelete, onDuplicate, onKeyChange }) => {
    const currentRootLabel = rootLabel || label;
    const dynamicTemplate = React.useMemo(() => getTemplateFor(currentRootLabel), [currentRootLabel]);
    
    const [isExpanded, setIsExpanded] = useState(false);
    const [showOffsetEditor, setShowOffsetEditor] = useState(false);
    const [showAttackAnimEditor, setShowAttackAnimEditor] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newValueType, setNewValueType] = useState<'string' | 'number' | 'boolean' | 'object' | 'array'>('string');
    const [searchTerm, setSearchTerm] = useState('');
    const [displayLimit, setDisplayLimit] = useState(40);

    const isObject = (val: any) => val !== null && typeof val === 'object' && !Array.isArray(val);
    const isArray = (val: any) => Array.isArray(val);

    const handleKeyChange = (oldKey: string, newKeyName: string) => {
        if (oldKey === newKeyName || !newKeyName.trim()) return;
        const newData = Array.isArray(data) ? [...data] : { ...data };
        if (!Array.isArray(data)) {
            newData[newKeyName] = newData[oldKey];
            delete newData[oldKey];
        }
        onChange(newData);
    };

    const handleValueChange = (key: string | number, updatedValue: any) => {
        const newData = Array.isArray(data) ? [...data] : { ...data };
        newData[key] = updatedValue;
        onChange(newData);
    };

    const handleDelete = (key: string | number) => {
        let newData;
        if (Array.isArray(data)) {
            newData = data.filter((_, i) => i !== key);
        } else {
            newData = { ...data };
            delete newData[key];
        }
        onChange(newData);
    };

    const handleDuplicate = (key: string | number) => {
        let newData;
        if (Array.isArray(data)) {
            newData = [...data];
            const copiedItem = JSON.parse(JSON.stringify(data[key as number]));
            newData.splice((key as number) + 1, 0, copiedItem);
        } else {
            newData = { ...data };
            const copiedItem = JSON.parse(JSON.stringify(data[key as string]));
            let newKeyStr = `${key}_copy`;
            let counter = 1;
            while (newData[newKeyStr] !== undefined) {
                newKeyStr = `${key}_copy${counter}`;
                counter++;
            }
            newData[newKeyStr] = copiedItem;
        }
        onChange(newData);
    };

    const handleAddField = () => {
        if (!Array.isArray(data) && !newKey.trim()) return;
        
        let valToAdd: any = newValue;
        if (newValueType === 'number') valToAdd = Number(newValue);
        else if (newValueType === 'boolean') valToAdd = (newValue || 'true') === 'true';
        else if (newValueType === 'object') valToAdd = {};
        else if (newValueType === 'array') valToAdd = [];

        const newData = Array.isArray(data) ? [...data, valToAdd] : { ...data, [newKey]: valToAdd };
        onChange(newData);
        setNewKey('');
        setNewValue('');
    };

    if (typeof data !== 'object' || data === null) {
        return (
            <div className="flex items-center gap-2 mb-2 w-full">
                <span className="text-gray-400 font-mono text-sm w-1/3 truncate">{label}:</span>
                <ValueInput
                    value={data}
                    originalType={typeof data}
                    onChange={(val) => onChange(val)}
                    className="flex-1 bg-gray-800 text-white border border-gray-600 p-1 rounded font-mono text-sm"
                />
            </div>
        );
    }

    return (
        <div className={`mb-2 w-full ${level > 0 ? 'ml-0.5 sm:ml-4 border-l border-gray-700/50 sm:border-gray-700 pl-1 sm:pl-2' : ''}`}>
            <div className="flex items-center gap-1 sm:gap-2 w-full justify-between pr-0 sm:pr-2">
                <div 
                    className="flex items-center gap-1 sm:gap-2 cursor-pointer hover:bg-gray-800 p-1 rounded flex-1 min-w-0" 
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                    {currentRootLabel === 'achievements' && level === 1 && typeof data === 'object' && data !== null && (
                         <div className="w-6 h-6 shrink-0 bg-gray-950 border border-gray-800 rounded flex items-center justify-center p-0.5 overflow-hidden">
                             {renderAchievementIcon(data?.icon, "w-5 h-5 text-yellow-400")}
                         </div>
                    )}
                    {onKeyChange ? (
                         <div className="flex gap-1 items-center font-mono text-sm min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                             <KeyInput initialKey={label || ''} onChange={onKeyChange} className="bg-transparent text-yellow-400 font-bold border-b border-gray-700 focus:border-gray-500 p-0 focus:outline-none flex-1 min-w-[50px] overflow-hidden text-ellipsis" />
                             <span className="text-yellow-400 font-bold shrink-0">{Array.isArray(data) ? `[${data.length}]` : '{}'}</span>
                         </div>
                    ) : (
                         <span className="text-yellow-400 font-bold font-mono text-sm truncate flex-1">
                             {currentRootLabel === 'achievements' && level === 1 && typeof data === 'object' && data !== null
                                 ? `${label} - ${data?.name?.ru || data?.name?.en || data?.key || ''}`
                                 : `${label} ${Array.isArray(data) ? `[${data.length}]` : '{}'}`
                             }
                         </span>
                    )}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 overflow-x-auto min-w-0">
                    {onDuplicate && (
                        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="text-blue-400 hover:text-blue-300 p-1 sm:p-1.5 rounded-md hover:bg-gray-800" title="Duplicate object"><Copy className="w-4 h-4" /></button>
                    )}
                    {onDelete && (
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-red-500 hover:text-red-400 p-1 sm:p-1.5 rounded-md hover:bg-gray-800" title="Delete object"><Trash2 className="w-4 h-4" /></button>
                    )}
                    {label === 'handOffset' && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowOffsetEditor(true); }}
                            className="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/40 hover:text-yellow-400 text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors border border-yellow-600/30 font-mono"
                        >
                            <Crosshair size={12} className="shrink-0" />
                            <span className="hidden sm:inline">{uiStrings?.visual_editor || 'Visual Editor'}</span>
                            <span className="sm:hidden">Vis</span>
                        </button>
                    )}
                    {label === 'attackAnimation' && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowAttackAnimEditor(true); }}
                            className="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/40 hover:text-yellow-400 text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors border border-yellow-600/30 font-mono"
                        >
                            <Crosshair size={12} className="shrink-0" />
                            <span className="hidden sm:inline">{uiStrings?.visual_editor || 'Visual Editor'}</span>
                            <span className="sm:hidden">Vis</span>
                        </button>
                    )}
                </div>
            </div>
            
            {showOffsetEditor && (
                <HandOffsetVisualEditor 
                    initialOffset={{ x: data?.x || 0, y: data?.y || 0 }} 
                    weaponSpriteUrl={ASSETS.SPRITES[(parentData?.handAssetId ?? parentData?.handAsset) as keyof typeof ASSETS.SPRITES] || parentData?.idleSprite || parentData?.sprite || parentData?.assetId}
                    handScale={parentData?.handScale}
                    onSave={(newOffset) => onChange({ ...data, ...newOffset })} 
                    onClose={() => setShowOffsetEditor(false)} 
                    uiStrings={uiStrings}
                />
            )}
            
            {showAttackAnimEditor && (
                <AttackAnimationVisualEditor 
                    initialAnimation={Array.isArray(data) ? data : []} 
                    weaponSpriteUrl={ASSETS.SPRITES[(parentData?.handAssetId ?? parentData?.handAsset) as keyof typeof ASSETS.SPRITES] || parentData?.idleSprite || parentData?.sprite || parentData?.assetId}
                    handScale={parentData?.handScale}
                    initialOffset={{ x: parentData?.handOffset?.x || 0, y: parentData?.handOffset?.y || 0 }}
                    onSave={(newAnimation) => onChange(newAnimation)} 
                    onClose={() => setShowAttackAnimEditor(false)} 
                    uiStrings={uiStrings}
                />
            )}
            
            {isExpanded && (
                <div className="mt-1 sm:mt-2 pl-1 sm:pl-4 border-l border-gray-800/50 sm:border-gray-800">
                    {level === 0 && (
                        <div className="mb-3 flex items-center gap-2 bg-gray-900/60 p-2 rounded border border-gray-800/80">
                            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider font-mono">{uiStrings?.search_key || 'Поиск по ключу'}:</span>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => {
                                    setSearchTerm(e.target.value);
                                    setDisplayLimit(40); // Reset limit on search
                                }}
                                placeholder={uiStrings?.search_placeholder || "Введите название ключа или ИД..."}
                                className="flex-1 bg-gray-950 text-white border border-gray-700/80 p-1 px-2 rounded focus:border-blue-500 focus:outline-none text-xs sm:text-sm font-mono"
                            />
                            {searchTerm && (
                                <button onClick={() => { setSearchTerm(''); setDisplayLimit(40); }} className="text-xs text-red-400 hover:text-red-300 font-bold px-2">
                                    X
                                </button>
                            )}
                        </div>
                    )}
                    {(() => {
                        const allKeys = Object.keys(data).filter((key) => {
                            if (level === 0 && searchTerm) {
                                return key.toLowerCase().includes(searchTerm.toLowerCase());
                            }
                            return true;
                        });
                        const visibleKeys = level === 0 ? allKeys.slice(0, displayLimit) : allKeys;
                        return (
                            <>
                                {visibleKeys.map((key) => (
                                    <div key={key} className="flex flex-col gap-1 mb-2">
                                         {isObject(data[key as keyof typeof data]) || isArray(data[key as keyof typeof data]) ? (
                                            <div className="w-full">
                                                <GenericDataEditor 
                                                    label={key} 
                                                    rootLabel={currentRootLabel}
                                                    data={data[key as keyof typeof data]} 
                                                    parentData={data}
                                                    onChange={(newVal) => handleValueChange(key, newVal)} 
                                                    level={level + 1} 
                                                    urlPrefixes={urlPrefixes}
                                                    uiStrings={uiStrings}
                                                    onDelete={() => handleDelete(key)}
                                                    onDuplicate={() => handleDuplicate(key)}
                                                    onKeyChange={!Array.isArray(data) ? (newKey) => handleKeyChange(key, newKey) : undefined}
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-2 sm:mb-1 w-full min-w-0">
                                                {!Array.isArray(data) ? (
                                                    <KeyInput
                                                        initialKey={key}
                                                        onChange={(newKey) => handleKeyChange(key, newKey)}
                                                        className="w-full sm:w-1/3 min-w-[50px] bg-transparent text-gray-400 border-b border-gray-700 focus:border-gray-500 p-1 font-mono text-sm focus:outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-gray-500 min-w-max text-left sm:text-right mr-0 sm:mr-2 text-xs sm:text-sm">{key}:</span>
                                                )}
                                                {currentRootLabel === 'assets' && typeof data[key as keyof typeof data] === 'string' ? (() => {
                                                    const strVal = String(data[key as keyof typeof data] ?? '');
                                                    let currentPrefix = '';
                                                    let currentSuffix = strVal;
                                                    for (const p of urlPrefixes) {
                                                        if (strVal.startsWith(p.value)) {
                                                            currentPrefix = p.value;
                                                            currentSuffix = strVal.substring(p.value.length);
                                                            break;
                                                        }
                                                    }
                                                    return (
                                                        <div className="flex flex-col flex-1 min-w-0 gap-1 w-full mt-1 sm:mt-0 p-0.5">
                                                            <div className="flex flex-row items-center gap-1 w-full">
                                                                <CustomSelect 
                                                                    value={currentPrefix} 
                                                                    onChange={(e) => handleValueChange(key, e.target.value + currentSuffix)}
                                                                    className="flex-1 min-w-0 bg-gray-800 text-gray-300 border border-gray-600 p-1 sm:p-1.5 rounded font-mono text-xs sm:text-sm focus:outline-none truncate"
                                                                >
                                                                    <option value="">(None)</option>
                                                                    {urlPrefixes.map(p => (
                                                                        <option key={p.label} value={p.value} title={p.value}>{p.label}</option>
                                                                    ))}
                                                                </CustomSelect>
                                                                <AssetPreview url={currentPrefix + currentSuffix} isAudioKey={typeof key === 'string' && /sound|audio|music|sfx|beep|bgm/i.test(key)} />
                                                                <label className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 sm:h-8 shrink-0 px-2 rounded cursor-pointer font-mono text-sm whitespace-nowrap flex items-center justify-center m-0" title="Upload Local">
                                                                    <Upload size={14} className="sm:mr-1" />
                                                                    <span className="hidden sm:inline">Upload</span>
                                                                    <input type="file" className="hidden" accept="image/*,audio/*" onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        const reader = new FileReader();
                                                                        reader.onload = (evt) => {
                                                                            const res = evt.target?.result as string;
                                                                            if (!res) return;
                                                                            const localKey = "asset_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
                                                                            try {
                                                                                localStorage.setItem(localKey, res);
                                                                                handleValueChange(key, "local://" + localKey);
                                                                            } catch(err) {
                                                                                alert("Failed to save to localStorage. It might be full.");
                                                                            }
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }} />
                                                                </label>
                                                                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 ml-1">
                                                                    <button onClick={() => handleDuplicate(key)} className="text-blue-400 hover:text-blue-300 p-1 flex items-center justify-center rounded-md hover:bg-gray-800 h-7 sm:h-8" title="Duplicate property"><Copy className="w-4 h-4" /></button>
                                                                    <button onClick={() => handleDelete(key)} className="text-red-500 hover:text-red-400 p-1 flex items-center justify-center rounded-md hover:bg-gray-800 h-7 sm:h-8" title="Delete property"><Trash2 className="w-4 h-4" /></button>
                                                                </div>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={currentSuffix}
                                                                onChange={(e) => handleValueChange(key, currentPrefix + e.target.value)}
                                                                className="w-full bg-gray-800 text-white border border-gray-600 p-1 sm:p-1.5 rounded font-mono text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                                                                placeholder="Value"
                                                            />
                                                        </div>
                                                    );
                                                })() : (
                                                    <div className="flex-1 flex items-center gap-2 w-full min-w-0">
                                                        <ValueInput
                                                            value={data[key as keyof typeof data]}
                                                            originalType={typeof data[key as keyof typeof data]}
                                                            onChange={(val) => handleValueChange(key, val)}
                                                            className="w-full sm:flex-1 min-w-[50px] bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                                                        />
                                                        {key === 'icon' && currentRootLabel === 'achievements' && typeof data[key as keyof typeof data] === 'string' && (
                                                            <div className="w-8 h-8 shrink-0 bg-gray-950 border border-gray-700 rounded flex items-center justify-center p-0.5 overflow-hidden">
                                                                {renderAchievementIcon(data[key as keyof typeof data], "w-6 h-6 text-yellow-400")}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {!(currentRootLabel === 'assets' && typeof data[key as keyof typeof data] === 'string') && (
                                                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 w-full sm:w-auto justify-end mt-1 sm:mt-0">
                                                        <button onClick={() => handleDuplicate(key)} className="text-blue-400 hover:text-blue-300 p-1 sm:p-2 rounded-md hover:bg-gray-800" title="Duplicate property"><Copy className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /></button>
                                                        <button onClick={() => handleDelete(key)} className="text-red-500 hover:text-red-400 p-1 sm:p-2 rounded-md hover:bg-gray-800" title="Delete property"><Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /></button>
                                                    </div>
                                                )}
                                            </div>
                                         )}
                                    </div>
                                ))}
                                {level === 0 && allKeys.length > visibleKeys.length && (
                                    <button 
                                        onClick={() => setDisplayLimit(prev => prev + 40)}
                                        className="w-full py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 hover:text-white rounded border border-blue-500/30 text-xs font-bold transition-colors font-mono tracking-widest uppercase mt-2 mb-4"
                                    >
                                        {uiStrings?.show_more || "Показать еще"} ({allKeys.length - visibleKeys.length})
                                    </button>
                                )}
                            </>
                        );
                    })()}
                    
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2 mt-2 pt-2 border-t border-gray-800 w-full">
                        {!Array.isArray(data) && (
                            <input 
                                type="text" 
                                placeholder="New key" 
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                className="w-full xl:w-1/4 bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm"
                            />
                        )}
                        <CustomSelect 
                            value={newValueType} 
                            onChange={(e) => setNewValueType(e.target.value as any)}
                            className="bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm w-full xl:w-auto"
                        >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="object">Object</option>
                            <option value="array">Array</option>
                        </CustomSelect>
                        {newValueType === 'string' && currentRootLabel === 'assets' ? (() => {
                            let currentPrefix = '';
                            let currentSuffix = newValue;
                            for (const p of urlPrefixes) {
                                if (newValue.startsWith(p.value)) {
                                    currentPrefix = p.value;
                                    currentSuffix = newValue.substring(p.value.length);
                                    break;
                                }
                            }
                            return (
                                <div className="flex flex-col flex-1 min-w-0 gap-1 w-full p-0.5">
                                    <div className="flex flex-row items-center gap-1 w-full">
                                        <CustomSelect 
                                            value={currentPrefix} 
                                            onChange={(e) => setNewValue(e.target.value + currentSuffix)}
                                            className="flex-1 min-w-0 bg-gray-800 text-gray-300 border border-gray-600 p-1 sm:p-1.5 rounded font-mono text-xs sm:text-sm focus:outline-none truncate"
                                        >
                                            <option value="">(None)</option>
                                            {urlPrefixes.map(p => (
                                                <option key={p.label} value={p.value} title={p.value}>{p.label}</option>
                                            ))}
                                        </CustomSelect>
                                        <AssetPreview url={currentPrefix + currentSuffix} isAudioKey={/sound|audio|music|sfx|beep|bgm/i.test(newKey)} />
                                        <label className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 sm:h-8 shrink-0 px-2 rounded cursor-pointer font-mono text-sm whitespace-nowrap flex items-center justify-center m-0" title="Upload Local">
                                            <Upload size={14} className="sm:mr-1" />
                                            <span className="hidden sm:inline">Upload</span>
                                            <input type="file" className="hidden" accept="image/*,audio/*" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onload = (evt) => {
                                                    const res = evt.target?.result as string;
                                                    if (!res) return;
                                                    const localKey = "asset_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9_.-]/g, '');
                                                    try {
                                                        localStorage.setItem(localKey, res);
                                                        setNewValue("local://" + localKey);
                                                    } catch(err) {
                                                        alert("Failed to save to localStorage. It might be full.");
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                            }} />
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Value"
                                        value={currentSuffix}
                                        onChange={(e) => setNewValue(currentPrefix + e.target.value)}
                                        className="w-full bg-gray-800 text-white border border-gray-600 p-1 sm:p-1.5 rounded font-mono text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            );
                        })() : (
                            (newValueType === 'string' || newValueType === 'number') && (
                                <input 
                                    key={newValueType}
                                    type={newValueType === 'number' ? "number" : "text"} 
                                    placeholder="Value" 
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    className="flex-1 min-w-[50px] w-full bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm"
                                />
                            )
                        )}
                        {newValueType === 'boolean' && (
                            <CustomSelect
                                value={newValue || 'true'}
                                onChange={(e) => setNewValue(e.target.value)}
                                className="flex-1 min-w-[50px] w-full bg-gray-800 text-white border border-gray-600 p-1.5 sm:p-1 rounded font-mono text-sm"
                            >
                                <option value="true">True</option>
                                <option value="false">False</option>
                            </CustomSelect>
                        )}
                        <div className="flex gap-2 w-full xl:w-auto">
                            <button 
                                onClick={handleAddField}
                                className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 sm:p-1 rounded flex items-center justify-center whitespace-nowrap flex-1 xl:flex-none"
                            >
                                <Plus size={16} /> Add
                            </button>
                            {level === 0 && dynamicTemplate && (
                                <button 
                                    onClick={() => {
                                        if (!Array.isArray(data) && !newKey.trim()) return;
                                        const valToAdd = JSON.parse(JSON.stringify(dynamicTemplate));
                                        const newData = Array.isArray(data) ? [...data, valToAdd] : { ...data, [newKey]: valToAdd };
                                        onChange(newData);
                                        setNewKey('');
                                    }}
                                    className="bg-purple-600 hover:bg-purple-500 text-white p-1.5 sm:p-1 rounded flex items-center justify-center whitespace-nowrap px-2 flex-1 xl:flex-none"
                                    title="Add from dynamic template with empty fields"
                                >
                                    <Wand2 size={16} className="mr-1" /> Add Template
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const GenericDataEditor = React.memo(GenericDataEditorComponent, (prevProps, nextProps) => {
    return prevProps.data === nextProps.data &&
           prevProps.label === nextProps.label &&
           prevProps.level === nextProps.level &&
           prevProps.rootLabel === nextProps.rootLabel &&
           prevProps.uiStrings === nextProps.uiStrings &&
           prevProps.urlPrefixes === nextProps.urlPrefixes;
});
