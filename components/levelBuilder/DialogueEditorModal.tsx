import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Save, GripHorizontal, Volume2, ArrowUp, ArrowDown } from 'lucide-react';
import dialoguesData from '../../data/dialogues.json';
import soundsData from '../../data/sounds.json';
import itemsData from '../../data/items.json';
import { AssetPicker } from './AssetPicker';

// We import these just to use for types if needed, or define locally to save imports
import { CustomSelect } from './CustomSelect';
export interface DialogueOption {
    text: string;
    nextNodeId: string | null;
    condition?: { hasItem?: string };
}
export interface DialogueNode {
    id: string;
    speaker: 'NPC' | 'PLAYER' | 'TUTORIAL';
    text: string;
    next?: string | null;
    options?: DialogueOption[];
    once?: boolean;
    action?: string;
    giveItem?: { id: string; count?: number };
    takeItem?: { id: string; count?: number };
    soundId?: string;
    noVoice?: boolean;
    hiddenSpeaker?: boolean;
    overridePortrait?: string;
    overrideName?: string;
    scriptTriggerId?: string;
    tutorial?: {
        textId?: string;
        text?: string;
        highlightElement?: any;
        pages?: Array<{ textId?: string; text?: string; highlightElement?: any; assetId?: string; assetType?: string }>;
    };
    tutorialId?: string;
}
export interface DialogueTree {
    id: string;
    rootNodeId: string;
    nodes: { [id: string]: DialogueNode };
    _editorPositions?: { [id: string]: { x: number, y: number } };
}

interface DialogueEditorModalProps {
    onClose: () => void;
    uiStrings?: any;
    triggers?: any[];
}

export const DialogueEditorModal: React.FC<DialogueEditorModalProps> = ({ onClose, uiStrings, triggers }) => {
    const [dialogues, setDialogues] = useState<{ [id: string]: DialogueTree }>(() => {
        const raw = JSON.parse(JSON.stringify(dialoguesData));
        Object.values(raw).forEach((tree: any) => {
            if (!tree._editorPositions) tree._editorPositions = {};
            let x = 50, y = 50;
            Object.keys(tree.nodes).forEach(nodeId => {
                if (!tree._editorPositions[nodeId]) {
                    tree._editorPositions[nodeId] = { x, y };
                    y += 180;
                    if (y > 800) {
                        y = 50;
                        x += 320;
                    }
                }
            });
        });
        return raw;
    });
    const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
    const [showNewDialogInput, setShowNewDialogInput] = useState(false);
    const [newDialogId, setNewDialogId] = useState('');
    const [showList, setShowList] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [activePicker, setActivePicker] = useState<{
        targetName: string;
        onSelect: (assetId: string) => void;
    } | null>(null);

    const handleSave = () => {
        // Here we just mutate the imported JSON in memory, which is what the rest of the game exports
        Object.keys(dialoguesData).forEach(k => delete (dialoguesData as any)[k]);
        Object.keys(dialogues).forEach(k => {
            (dialoguesData as any)[k] = dialogues[k];
        });
        onClose();
    };

    return (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[500] p-2 sm:p-4">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-7xl h-[95dvh] flex flex-col shadow-2xl rounded-lg font-sans overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-4 border-b border-gray-800 bg-gray-900 shrink-0 gap-2 sm:gap-4">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 truncate w-full sm:w-auto">
                        Редактор диалогов
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                        <div className="flex bg-gray-800 rounded border border-gray-600 items-center h-8 overflow-hidden select-none">
                            <button 
                                onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} 
                                className="w-8 hover:bg-gray-700 text-gray-300 h-full font-bold transition-colors border-r border-gray-600" 
                                title="Zoom Out"
                            >
                                -
                            </button>
                            <span 
                                className="px-3 text-sm font-mono text-gray-300 flex items-center justify-center min-w-[3.5rem] cursor-pointer hover:text-white transition-colors"
                                onClick={() => setZoom(1)}
                                title="Reset Zoom"
                            >
                                {Math.round(zoom * 100)}%
                            </span>
                            <button 
                                onClick={() => setZoom(z => Math.min(3, z + 0.2))} 
                                className="w-8 hover:bg-gray-700 text-gray-300 h-full font-bold transition-colors border-l border-gray-600" 
                                title="Zoom In"
                            >
                                +
                            </button>
                        </div>
                        <button onClick={() => setShowList(s => !s)} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-bold transition-colors ${showList ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-600' : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'} flex-1 sm:flex-none whitespace-nowrap`}>
                            {showList ? 'Скрыть список' : 'Показать список'}
                        </button>
                        <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded flex items-center justify-center gap-2 font-bold transition-colors flex-1 sm:flex-none whitespace-nowrap">
                            <Save size={16} className="sm:w-[18px] sm:h-[18px]" /> Сохранить
                        </button>
                        <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-red-500/20 text-red-500 rounded transition-colors ml-auto sm:ml-0">
                            <X size={20} className="sm:w-6 sm:h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden relative">
                    <div className={`bg-gray-800 border-r border-gray-700 flex flex-col p-2 sm:p-4 overflow-y-auto shrink-0 z-40 custom-scrollbar ${showList && !selectedDialogId ? 'w-full' : (showList ? 'w-64 sm:max-w-[50%] absolute sm:relative h-full' : 'hidden')} sm:flex`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-gray-300 font-bold uppercase tracking-wider text-sm">Список</h3>
                            <button
                                onClick={() => setShowNewDialogInput(true)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white p-1 rounded"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        {showNewDialogInput && (
                            <div className="mb-2 flex flex-col gap-1 p-2 bg-gray-800 border border-gray-600 rounded">
                                <input 
                                    className="bg-gray-900 border border-gray-700 text-white px-2 py-1 text-sm rounded outline-none"
                                    placeholder="ID диалога..."
                                    value={newDialogId}
                                    autoFocus
                                    onChange={e => setNewDialogId(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            const id = newDialogId.trim();
                                            if (id && !dialogues[id]) {
                                                setDialogues(prev => ({
                                                    ...prev, [id]: {
                                                        id, rootNodeId: 'start', nodes: {
                                                            'start': { id: 'start', speaker: 'NPC', text: 'Новый диалог', next: null }
                                                        }, _editorPositions: { 'start': { x: 50, y: 50 } }
                                                    }
                                                }));
                                                setSelectedDialogId(id);
                                                setShowList(false);
                                            }
                                            setShowNewDialogInput(false);
                                            setNewDialogId('');
                                        } else if (e.key === 'Escape') {
                                            setShowNewDialogInput(false);
                                            setNewDialogId('');
                                        }
                                    }}
                                />
                                <div className="flex gap-1">
                                    <button 
                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs py-1 rounded"
                                        onClick={() => {
                                            const id = newDialogId.trim();
                                            if (id && !dialogues[id]) {
                                                setDialogues(prev => ({
                                                    ...prev, [id]: {
                                                        id, rootNodeId: 'start', nodes: {
                                                            'start': { id: 'start', speaker: 'NPC', text: 'Новый диалог', next: null }
                                                        }, _editorPositions: { 'start': { x: 50, y: 50 } }
                                                    }
                                                }));
                                                setSelectedDialogId(id);
                                                setShowList(false);
                                            }
                                            setShowNewDialogInput(false);
                                            setNewDialogId('');
                                        }}
                                    >OK</button>
                                    <button 
                                        className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs py-1 rounded"
                                        onClick={() => { setShowNewDialogInput(false); setNewDialogId(''); }}
                                    >Cancel</button>
                                </div>
                            </div>
                        )}
                        {Object.keys(dialogues).map(id => (
                            <div key={id} className={`p-2 rounded mb-1 cursor-pointer flex justify-between items-center border ${selectedDialogId === id ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-gray-700/30 border-transparent text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                <span onClick={() => { setSelectedDialogId(id); setShowList(false); }} className="flex-1 truncate">{id}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Removed confirm() as it is blocked in iFrame
                                        const newDbl = { ...dialogues };
                                        delete newDbl[id];
                                        setDialogues(newDbl);
                                        if (selectedDialogId === id) setSelectedDialogId(null);
                                    }}
                                    className="text-gray-500 hover:text-red-400 p-1"
                                    title="Удалить диалог"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 bg-gray-950 relative overflow-hidden">
                        {selectedDialogId && dialogues[selectedDialogId] ? (
                            <DialogueNodeCanvas
                                dialogue={dialogues[selectedDialogId]}
                                updateDialogue={(newTree) => {
                                    setDialogues(prev => ({ ...prev, [selectedDialogId]: newTree }));
                                }}
                                zoom={zoom}
                                setZoom={setZoom}
                                uiStrings={uiStrings}
                                activePicker={activePicker}
                                setActivePicker={setActivePicker}
                                triggers={triggers}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-600 font-bold">
                                Выберите диалог слева
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DialogueNodeCanvas = ({ 
    dialogue, 
    updateDialogue, 
    zoom, 
    setZoom, 
    uiStrings,
    activePicker,
    setActivePicker,
    triggers
}: { 
    dialogue: DialogueTree, 
    updateDialogue: (t: DialogueTree) => void, 
    zoom: number, 
    setZoom: (z: number) => void, 
    uiStrings?: any,
    activePicker: any,
    setActivePicker: (picker: any) => void,
    triggers?: any[]
}) => {
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [linesVersion, setLinesVersion] = useState(0);
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    
    // Use refs for drag to fix race conditions in touch events
    const dragStartRef = useRef({ x: 0, y: 0 });
    const activePointersRef = useRef<Map<number, { clientX: number, clientY: number }>>(new Map());
    const lastPanTimeRef = useRef(0);
    
    const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string, optionIndex?: number, startPos: {x: number, y: number} } | null>(null);
    const mousePosRef = useRef({ x: 0, y: 0 });
    const tempLinePathRef = useRef<SVGPathElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const isSpaceDownRef = useRef(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
            if (e.code === 'Space') {
                isSpaceDownRef.current = true;
                e.preventDefault();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                isSpaceDownRef.current = false;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // Force re-measure connection points after DOM updates
    React.useEffect(() => {
        setLinesVersion(v => v + 1);
    }, [dialogue.nodes]);

    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<{ id: string, newId: string } | null>(null);

    React.useEffect(() => {
        if (selectedNode) {
            setEditingNodeId({ id: selectedNode, newId: selectedNode });
        } else {
            setEditingNodeId(null);
        }
    }, [selectedNode]);

    const commitRename = () => {
        if (!editingNodeId || editingNodeId.id === editingNodeId.newId) return;
        const oldId = editingNodeId.id;
        const newId = editingNodeId.newId.trim();

        if (!newId || dialogue.nodes[newId]) {
            setEditingNodeId({ id: oldId, newId: oldId });
            return;
        }

        const newNodes = { ...dialogue.nodes };
        const nodeToRename = newNodes[oldId];
        delete newNodes[oldId];
        
        nodeToRename.id = newId;
        newNodes[newId] = nodeToRename;

        Object.values(newNodes).forEach(node => {
            if (node.next === oldId) node.next = newId;
            if (node.options) {
                node.options.forEach(opt => {
                    if (opt.nextNodeId === oldId) opt.nextNodeId = newId;
                });
            }
        });

        let editorPos = { ...dialogue._editorPositions };
        if (editorPos[oldId]) {
            editorPos[newId] = editorPos[oldId];
            delete editorPos[oldId];
        }
        
        updateDialogue({
            ...dialogue,
            nodes: newNodes,
            rootNodeId: dialogue.rootNodeId === oldId ? newId : dialogue.rootNodeId,
            _editorPositions: editorPos
        });
        
        setSelectedNode(newId);
        setEditingNodeId({ id: newId, newId: newId });
    };

    const positions = dialogue._editorPositions || {};

    const handlePointerDownContainer = (e: React.PointerEvent) => {
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        
        if (activePointersRef.current.size >= 2) {
            setDraggingNode('CANVAS');
            setSelectedNode(null);
        }

        const target = e.target as HTMLElement;
        if ((target.closest('.node-drop-target') || target.closest('button')) && activePointersRef.current.size < 2) {
            return;
        }

        if (e.button === 0 || e.button === 1 || e.button === 2 || e.pointerType === 'touch') {
            if (activePointersRef.current.size < 2) {
                setDraggingNode('CANVAS');
                setConnectingFrom(null);
                setSelectedNode(null);
            }
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (activePointersRef.current.has(e.pointerId)) {
            const pointers = activePointersRef.current;
            
            // Pinch zoom
            if (pointers.size === 2 && draggingNode === 'CANVAS') {
                lastPanTimeRef.current = Date.now();
                const pointerArr = Array.from(pointers.values()) as { clientX: number, clientY: number }[];
                const p1 = pointerArr[0];
                const p2 = pointerArr[1];
                const oldDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
                
                pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
                
                const np1 = pointers.get(Array.from(pointers.keys())[0])!;
                const np2 = pointers.get(Array.from(pointers.keys())[1])!;
                const newDist = Math.hypot(np1.clientX - np2.clientX, np1.clientY - np2.clientY);
                
                const deltaScale = newDist / oldDist;
                if (!isNaN(deltaScale) && deltaScale > 0) {
                     setZoom(Math.max(0.2, Math.min(3, zoom * deltaScale)));
                }
                
                // Pan midpoint
                const midX = (np1.clientX + np2.clientX) / 2;
                const midY = (np1.clientY + np2.clientY) / 2;
                const oldMidX = (p1.clientX + p2.clientX) / 2;
                const oldMidY = (p1.clientY + p2.clientY) / 2;
                
                setPan(p => ({ x: p.x + (midX - oldMidX), y: p.y + (midY - oldMidY) }));
                
                if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    mousePosRef.current = {
                        x: (midX - rect.left - pan.x) / zoom,
                        y: (midY - rect.top - pan.y) / zoom
                    };
                }
                return;
            } else {
                pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            }
        }

        if (isSpaceDownRef.current && !draggingNode && e.pointerType === 'mouse') {
            setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
            // Also update mouse pos for connecting lines if any
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mousePosRef.current = {
                    x: (e.clientX - rect.left - (pan.x + e.movementX)) / zoom,
                    y: (e.clientY - rect.top - (pan.y + e.movementY)) / zoom
                };
            }
            return;
        }

        if (draggingNode === 'CANVAS' && activePointersRef.current.size < 2) {
            lastPanTimeRef.current = Date.now();
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            dragStartRef.current = { x: e.clientX, y: e.clientY };
        } else if (draggingNode && activePointersRef.current.size < 2) {
            lastPanTimeRef.current = Date.now();
            const dx = (e.clientX - dragStartRef.current.x) / zoom;
            const dy = (e.clientY - dragStartRef.current.y) / zoom;
            const curPos = positions[draggingNode] || { x: 0, y: 0 };
            updateDialogue({
                ...dialogue,
                _editorPositions: {
                    ...positions,
                    [draggingNode]: { x: curPos.x + dx, y: curPos.y + dy }
                }
            });
            dragStartRef.current = { x: e.clientX, y: e.clientY };
        }

        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            mousePosRef.current = {
                x: (e.clientX - rect.left - pan.x) / zoom,
                y: (e.clientY - rect.top - pan.y) / zoom
            };
            
            if (connectingFrom && tempLinePathRef.current) {
                const endPos = mousePosRef.current;
                const startPos = connectingFrom.startPos;
                const dx = endPos.x - startPos.x;
                const dy = endPos.y - startPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const offset = Math.max(40, Math.min(dist / 2.5, 120));
                tempLinePathRef.current.setAttribute('d', `M ${startPos.x} ${startPos.y} C ${startPos.x + offset} ${startPos.y}, ${endPos.x - offset} ${endPos.y}, ${endPos.x} ${endPos.y}`);
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        activePointersRef.current.delete(e.pointerId);
        if (draggingNode === 'CANVAS') {
            try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch(err) {}
        }
        if (connectingFrom) {
            try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch(err) {}
        }
        
        if (activePointersRef.current.size === 0) {
            setDraggingNode(null);
        }

        let currentTarget = e.target as HTMLElement;
        if (connectingFrom || e.pointerType === 'touch') {
             const el = document.elementFromPoint(e.clientX, e.clientY);
             if (el) currentTarget = el as HTMLElement;
        }

        const dropTarget = currentTarget.closest('.node-drop-target') as HTMLElement | null;
        if (connectingFrom && dropTarget) {
            const targetId = dropTarget.dataset.nodeid;
            if (targetId && targetId !== connectingFrom.nodeId) {
                const newNodes = { ...dialogue.nodes };
                const sourceNode = { ...newNodes[connectingFrom.nodeId] };
                if (connectingFrom.optionIndex !== undefined) {
                    if (sourceNode.options && sourceNode.options[connectingFrom.optionIndex]) {
                        sourceNode.options[connectingFrom.optionIndex].nextNodeId = targetId;
                    }
                } else {
                    sourceNode.next = targetId;
                }
                newNodes[sourceNode.id] = sourceNode;
                updateDialogue({ ...dialogue, nodes: newNodes });
            }
        } else if (connectingFrom && !dropTarget && !currentTarget.closest('.properties-pane')) {
             // Create new node at mouse point
             const newId = "node_" + Date.now().toString().slice(-4);
             if (newId && !dialogue.nodes[newId]) {
                 const newNodes = { ...dialogue.nodes };
                 newNodes[newId] = { id: newId, speaker: 'NPC', text: '...' };
                 
                 const p = positions;
                 const sourceNode = { ...newNodes[connectingFrom.nodeId] };
                 if (connectingFrom.optionIndex !== undefined) {
                     if (sourceNode.options && sourceNode.options[connectingFrom.optionIndex]) {
                         sourceNode.options[connectingFrom.optionIndex].nextNodeId = newId;
                     }
                 } else {
                     sourceNode.next = newId;
                 }
                 newNodes[sourceNode.id] = sourceNode;
                 updateDialogue({ ...dialogue, nodes: newNodes, _editorPositions: { ...p, [newId]: { x: mousePosRef.current.x, y: mousePosRef.current.y } } });
             }
        }
        setConnectingFrom(null);
    };

    const handleRemoveLink = (nodeId: string, optionIndex?: number) => {
        const newNodes = { ...dialogue.nodes };
        const sourceNode = { ...newNodes[nodeId] };
        if (optionIndex !== undefined) {
            if (sourceNode.options && sourceNode.options[optionIndex]) {
                const newOptions = [...sourceNode.options];
                newOptions[optionIndex] = { ...newOptions[optionIndex], nextNodeId: null };
                sourceNode.options = newOptions;
            }
        } else {
            delete sourceNode.next;
        }
        newNodes[sourceNode.id] = sourceNode;
        updateDialogue({ ...dialogue, nodes: newNodes });
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const z = zoom - e.deltaY * 0.005;
            setZoom(Math.max(0.2, Math.min(3, z)));
        } else {
            // Trackpad pan
            setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    };

    const getRelativePortPos = (nodeId: string, elId: string, positionsDict: Record<string, {x:number, y:number}>) => {
        const p = positionsDict[nodeId] || { x: 50, y: 50 };
        const nodeEl = document.querySelector(`[data-nodeid="${nodeId}"]`) as HTMLElement;
        const portEl = document.getElementById(elId) as HTMLElement;
        
        if (nodeEl && portEl) {
            let cur: HTMLElement | null = portEl;
            let offsetX = 0;
            let offsetY = 0;
            while (cur && cur !== nodeEl) {
                offsetX += cur.offsetLeft;
                offsetY += cur.offsetTop;
                cur = cur.offsetParent as HTMLElement;
            }
            return {
                x: p.x + offsetX + portEl.offsetWidth / 2,
                y: p.y + offsetY + portEl.offsetHeight / 2
            };
        }
        return null;
    };

    const staticLines = React.useMemo(() => {
        // dummy read to depend on linesVersion
        const _v = linesVersion;
        const getPortPos = (nodeId: string, optIndex?: number, isInput?: boolean) => {
            const elId = isInput ? `port_in_${nodeId}` : (optIndex !== undefined ? `port_out_${nodeId}_opt_${optIndex}` : `port_out_${nodeId}_next`);
            const p = positions[nodeId] || { x: 50, y: 50 };
            
            if (isInput) {
                return { x: p.x, y: p.y + 16 };
            }

            const calculatedPos = getRelativePortPos(nodeId, elId, positions);
            if (calculatedPos) return calculatedPos;

            return { x: p.x + 288, y: p.y + 40 + (optIndex !== undefined ? optIndex * 30 : 0) };
        };

        const lines: React.ReactElement[] = [];
        Object.values(dialogue.nodes).forEach(node => {
            if (node.options && node.options.length > 0) {
                node.options.forEach((opt, idx) => {
                    if (opt.nextNodeId && dialogue.nodes[opt.nextNodeId]) {
                        lines.push(<Line key={`${node.id}_opt_${idx}`} start={getPortPos(node.id, idx)} end={getPortPos(opt.nextNodeId, undefined, true)} />);
                    }
                });
            } else if (node.next && node.next !== 'null' && dialogue.nodes[node.next]) {
                lines.push(<Line key={`${node.id}_next`} start={getPortPos(node.id)} end={getPortPos(node.next, undefined, true)} />);
            }
        });
        return lines;
    }, [dialogue.nodes, linesVersion, positions]); // Removed pan.x, pan.y, zoom inside deps!

    const renderLines = () => {
        return <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 50 }}>
            {staticLines}
            {connectingFrom && (
                <path
                    ref={tempLinePathRef}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth={3}
                    strokeDasharray="5,5"
                    className="transition-none pointer-events-none"
                    d={`M ${connectingFrom.startPos.x} ${connectingFrom.startPos.y} C ${connectingFrom.startPos.x + 40} ${connectingFrom.startPos.y}, ${mousePosRef.current.x - 40} ${mousePosRef.current.y}, ${mousePosRef.current.x} ${mousePosRef.current.y}`}
                />
            )}
        </svg>;
    };

    return (
        <div className="absolute inset-0 flex">
            <div
                className={`flex-1 relative overflow-hidden canvas-bg bg-gray-950 touch-none ${draggingNode === 'CANVAS' ? 'cursor-grabbing' : 'cursor-default'}`}
                ref={containerRef}
                onPointerDown={handlePointerDownContainer}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                onContextMenu={e => e.preventDefault()}
                style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
            >
                <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', inset: 0 }}>
                    {renderLines()}
                    {Object.values(dialogue.nodes).map(node => (
                        <div
                            key={node.id}
                            className={`absolute w-72 bg-gray-800 border-2 rounded-lg shadow-xl cursor-default select-none ${selectedNode === node.id ? 'border-indigo-500 shadow-indigo-900/50 z-20' : 'border-gray-600 hover:border-gray-500 z-10'} node-drop-target`}
                            style={{
                                left: positions[node.id]?.x || 50,
                                top: positions[node.id]?.y || 50,
                            }}
                            data-nodeid={node.id}
                            onClick={(e) => { e.stopPropagation(); if (Date.now() - lastPanTimeRef.current > 300) setSelectedNode(node.id); }}
                        >
                            <div
                                id={`port_in_${node.id}`}
                                className="absolute -left-2 top-2 w-4 h-4 rounded-full bg-indigo-500 border-2 border-gray-800 shrink-0 cursor-crosshair z-10"
                            />
                            <div
                                className={`h-8 flex items-center px-3 rounded-t-sm font-bold text-sm text-white cursor-move ${node.speaker === 'PLAYER' ? 'bg-green-700' : node.speaker === 'TUTORIAL' ? 'bg-amber-600' : 'bg-blue-700'} ${node.id === dialogue.rootNodeId ? 'ring-2 ring-yellow-400' : ''}`}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => {
                                    activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
                                    if (activePointersRef.current.size === 2) {
                                        setDraggingNode('CANVAS');
                                        return;
                                    }
                                    e.stopPropagation();
                                    setDraggingNode(node.id);
                                    dragStartRef.current = { x: e.clientX, y: e.clientY };
                                    setConnectingFrom(null);
                                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                }}
                            >
                                <span className="flex-1 truncate pointer-events-none flex items-center gap-1.5">
                                    {node.id}
                                    {node.hiddenSpeaker && <span className="text-[10px] bg-purple-900/80 text-purple-200 px-1 rounded font-normal shrink-0" title="Скрытый говорящий">???</span>}
                                    {node.soundId && <Volume2 size={13} className="text-yellow-400 inline shrink-0 animate-pulse" title={`Звук: ${node.soundId}`} />}
                                </span>
                                {node.id === dialogue.rootNodeId && <span className="text-[10px] bg-yellow-500 text-black px-1 rounded mr-2">ROOT</span>}
                            </div>
                            <div className="p-2 text-xs">
                                <div className="text-gray-300 font-mono leading-tight max-h-20 overflow-hidden text-ellipsis mb-2 pointer-events-none break-words">
                                    {node.text ? (node.text.split('/')[0].substring(0, 80) + (node.text.split('/')[0].length > 80 ? '...' : '')) : <span className="text-gray-500 italic">Пустой текст</span>}
                                </div>
                                <div className="space-y-1">
                                    {node.speaker === 'PLAYER' && node.options && node.options.length > 0 && node.options.map((opt, i) => (
                                        <div key={i} className="flex items-center justify-between bg-gray-700 p-1 rounded gap-1">
                                            <span className="truncate text-[10px] flex-1 text-gray-300">{opt.text ? opt.text.split('/')[0] : '[Без текста]'}</span>
                                            {opt.nextNodeId && (
                                                 <button
                                                     className="w-4 h-4 rounded bg-red-600/50 hover:bg-red-500 text-[8px] flex items-center justify-center text-white shrink-0 pointer-events-auto"
                                                     title="Удалить связь"
                                                     onClick={(e) => { e.stopPropagation(); handleRemoveLink(node.id, i); }}
                                                 >
                                                     ✕
                                                 </button>
                                            )}
                                            <button
                                                id={`port_out_${node.id}_opt_${i}`}
                                                className={`w-4 h-4 rounded-full ${opt.nextNodeId ? 'bg-green-500' : 'bg-gray-500'} hover:bg-gray-400 shrink-0 cursor-pointer pointer-events-auto touch-none`}
                                                onPointerDown={(e) => { 
                                                    e.stopPropagation(); 
                                                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                                    const startPos = getRelativePortPos(node.id, `port_out_${node.id}_opt_${i}`, positions) || { x: positions[node.id]?.x || 50, y: positions[node.id]?.y || 50 };
                                                    setConnectingFrom({ nodeId: node.id, optionIndex: i, startPos });
                                                    if (containerRef.current) {
                                                        const rect = containerRef.current.getBoundingClientRect();
                                                        mousePosRef.current = { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                    {(node.speaker === 'NPC' || (!node.options || node.options.length === 0)) && (
                                        <div className="flex items-center justify-end mt-2 gap-1">
                                            <span className="text-[10px] text-gray-500 uppercase">Next</span>
                                            {node.next && (
                                                <button
                                                    className="w-4 h-4 rounded bg-red-600/50 hover:bg-red-500 text-[8px] flex items-center justify-center text-white shrink-0 pointer-events-auto"
                                                    title="Удалить связь"
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveLink(node.id); }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                            <button
                                                id={`port_out_${node.id}_next`}
                                                className={`w-5 h-5 rounded-full ${node.next ? 'bg-green-500' : 'bg-gray-600'} hover:bg-gray-400 shrink-0 cursor-pointer border-2 border-gray-800 pointer-events-auto touch-none`}
                                                onPointerDown={(e) => { 
                                                    e.stopPropagation(); 
                                                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                                                    const startPos = getRelativePortPos(node.id, `port_out_${node.id}_next`, positions) || { x: positions[node.id]?.x || 50, y: positions[node.id]?.y || 50 };
                                                    setConnectingFrom({ nodeId: node.id, startPos });
                                                    if (containerRef.current) {
                                                        const rect = containerRef.current.getBoundingClientRect();
                                                        mousePosRef.current = { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Properties Pane */}
            {selectedNode && dialogue.nodes[selectedNode] && (
                <div className="w-full max-w-[80vw] sm:max-w-none sm:w-80 absolute top-0 right-0 h-full sm:relative bg-gray-900 border-l border-gray-700 p-2 sm:p-4 flex flex-col gap-2 sm:gap-4 overflow-y-auto shrink-0 z-40 custom-scrollbar shadow-2xl sm:shadow-none">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-2 shrink-0">
                        <h3 className="font-bold text-white uppercase text-sm">Свойства узла</h3>
                        <button onClick={() => setSelectedNode(null)} className="sm:hidden text-gray-400 hover:text-white p-1">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase">ID узла</label>
                        <input
                            type="text"
                            value={editingNodeId?.newId || ''}
                            onChange={(e) => setEditingNodeId(prev => prev ? { ...prev, newId: e.target.value } : null)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase">Следующий узел (Next)</label>
                        <input
                            type="text"
                            value={dialogue.nodes[selectedNode].next || ''}
                            onChange={(e) => {
                                const newNodes = { ...dialogue.nodes };
                                if (e.target.value) {
                                    newNodes[selectedNode] = { ...newNodes[selectedNode], next: e.target.value };
                                } else {
                                    const { next, ...rest } = newNodes[selectedNode];
                                    newNodes[selectedNode] = rest;
                                }
                                updateDialogue({ ...dialogue, nodes: newNodes });
                            }}
                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500"
                            placeholder="Оставьте пустым для конца диалога"
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase">Спикер</label>
                        <CustomSelect
                            value={dialogue.nodes[selectedNode].speaker}
                            onChange={(e) => {
                                const newNodes = { ...dialogue.nodes };
                                const val = e.target.value as 'NPC' | 'PLAYER' | 'TUTORIAL';
                                let node = newNodes[selectedNode];
                                node = { ...node, speaker: val };
                                if (val === 'TUTORIAL' && (!node.tutorial || !node.tutorial.pages || node.tutorial.pages.length === 0)) {
                                    node.tutorial = {
                                        pages: [{
                                            text: node.text || 'Новое обучение/New tutorial',
                                            highlightElement: 'NONE'
                                        }]
                                    };
                                }
                                newNodes[selectedNode] = node;
                                updateDialogue({ ...dialogue, nodes: newNodes });
                            }}
                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500"
                        >
                            <option value="NPC">NPC (Неигровой)</option>
                            <option value="PLAYER">Игрок (Выбор реплик)</option>
                            <option value="TUTORIAL">{uiStrings?.dialogue_speaker_tutorial || "Обучение"}</option>
                        </CustomSelect>
                    </div>

                    {dialogue.nodes[selectedNode].speaker === 'TUTORIAL' ? (
                        <div className="flex flex-col gap-3 border-t border-gray-700 pt-3">
                            <label className="text-xs text-gray-400 uppercase flex justify-between items-center font-bold text-amber-500">
                                {uiStrings?.dialogue_tutorial_settings || "Настройки обучения"}
                                <button
                                    onClick={() => {
                                        const newNodes = { ...dialogue.nodes };
                                        const node = newNodes[selectedNode];
                                        const tutorial = node.tutorial || {};
                                        const pages = [...(tutorial.pages || [])];
                                        pages.push({ text: 'Новая страница/New page', highlightElement: 'NONE' });
                                        
                                        const updatedTutorial = { ...tutorial, pages };
                                        newNodes[selectedNode] = { 
                                            ...node, 
                                            tutorial: updatedTutorial,
                                            text: pages[0]?.text || node.text
                                        };
                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-xs"
                                >
                                    {uiStrings?.dialogue_add_page || "+ Добавить страницу"}
                                </button>
                            </label>

                            {(() => {
                                const node = dialogue.nodes[selectedNode];
                                const tutorial = node.tutorial || {};
                                const pages = tutorial.pages || [];

                                if (pages.length === 0) {
                                    return (
                                        <p className="text-xs text-gray-500 italic">
                                            {uiStrings?.dialogue_no_pages || "Нет страниц. Добавьте страницу, чтобы начать."}
                                        </p>
                                    );
                                }

                                return pages.map((page: any, pIdx: number) => {
                                    const fullTxt = page.text || '';
                                    const pts = fullTxt.split('/');
                                    const rTxt = pts[0] || '';
                                    const eTxt = pts.length > 1 ? pts.slice(1).join('/') : '';

                                    return (
                                        <div key={pIdx} className="bg-gray-800 border border-gray-700 p-2 rounded flex flex-col gap-2 relative">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] text-gray-500 font-bold uppercase">
                                                    {uiStrings?.dialogue_page || "Страница"} {pIdx + 1}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        const n = newNodes[selectedNode];
                                                        const tut = n.tutorial || {};
                                                        const pgs = [...(tut.pages || [])];
                                                        pgs.splice(pIdx, 1);

                                                        const updatedTut = { ...tut, pages: pgs };
                                                        newNodes[selectedNode] = { 
                                                            ...n, 
                                                            tutorial: updatedTut,
                                                            text: pgs[0]?.text || n.text
                                                        };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="text-red-500 hover:bg-red-950/30 p-1 rounded hover:text-white"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <div className="flex bg-gray-900 border border-gray-600 rounded overflow-hidden">
                                                    <span className="bg-gray-800 text-[10px] text-gray-500 font-bold px-1 py-1 w-6 text-center border-r border-gray-600 flex items-center justify-center">RU</span>
                                                    <textarea
                                                        value={rTxt}
                                                        onChange={(e) => {
                                                            const newNodes = { ...dialogue.nodes };
                                                            const n = newNodes[selectedNode];
                                                            const tut = n.tutorial || {};
                                                            const pgs = [...(tut.pages || [])];
                                                            pgs[pIdx] = { ...pgs[pIdx], text: `${e.target.value}/${eTxt}` };

                                                            const updatedTut = { ...tut, pages: pgs };
                                                            newNodes[selectedNode] = { 
                                                                ...n, 
                                                                tutorial: updatedTut,
                                                                text: pgs[0]?.text || n.text
                                                            };
                                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                                        }}
                                                        className="flex-1 bg-transparent text-white px-2 py-1 text-xs outline-none focus:bg-gray-800 min-h-[45px] resize-y"
                                                        placeholder="Текст обучения..."
                                                    />
                                                </div>
                                                <div className="flex bg-gray-900 border border-gray-600 rounded overflow-hidden">
                                                    <span className="bg-gray-800 text-[10px] text-gray-500 font-bold px-1 py-1 w-6 text-center border-r border-gray-600 flex items-center justify-center">EN</span>
                                                    <textarea
                                                        value={eTxt}
                                                        onChange={(e) => {
                                                            const newNodes = { ...dialogue.nodes };
                                                            const n = newNodes[selectedNode];
                                                            const tut = n.tutorial || {};
                                                            const pgs = [...(tut.pages || [])];
                                                            pgs[pIdx] = { ...pgs[pIdx], text: `${rTxt}/${e.target.value}` };

                                                            const updatedTut = { ...tut, pages: pgs };
                                                            newNodes[selectedNode] = { 
                                                                ...n, 
                                                                tutorial: updatedTut,
                                                                text: pgs[0]?.text || n.text
                                                            };
                                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                                        }}
                                                        className="flex-1 bg-transparent text-gray-300 px-2 py-1 text-xs outline-none focus:bg-gray-800 min-h-[45px] resize-y"
                                                        placeholder="Tutorial text..."
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-400 shrink-0">
                                                    {uiStrings?.dialogue_highlight || "Подсветка:"}
                                                </span>
                                                <CustomSelect
                                                    value={page.highlightElement || 'NONE'}
                                                    onChange={(e) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        const n = newNodes[selectedNode];
                                                        const tut = n.tutorial || {};
                                                        const pgs = [...(tut.pages || [])];
                                                        pgs[pIdx] = { ...pgs[pIdx], highlightElement: e.target.value };

                                                        const updatedTut = { ...tut, pages: pgs };
                                                        newNodes[selectedNode] = { ...n, tutorial: updatedTut };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white flex-1"
                                                >
                                                    <option value="NONE">{uiStrings?.dialogue_highlight_none || "Без подсветки"}</option>
                                                    <option value="TOUCH_CONTROLS">{uiStrings?.dialogue_highlight_touch || "Панель управления (низ)"}</option>
                                                    <option value="HEADER_BUTTON_GEAR">{uiStrings?.dialogue_highlight_pause || "Кнопка \"Пауза\""}</option>
                                                    <option value="HEADER_BUTTON_MAP">{uiStrings?.dialogue_highlight_map || "Кнопка \"Карта\""}</option>
                                                    <option value="HEADER_BUTTON_MENU">{uiStrings?.dialogue_highlight_menu || "Кнопка \"Инвентарь/Меню\""}</option>
                                                    <option value="HEADER_BUTTONS">{uiStrings?.dialogue_highlight_header || "Все кнопки в шапке"}</option>
                                                    <option value="PLAYER_STATS">{uiStrings?.dialogue_highlight_stats || "Уровень и Здоровье"}</option>
                                                    <option value="AMMO_BADGE">{uiStrings?.dialogue_highlight_ammo || "Бирка с патронами"}</option>
                                                    <option value="EFFECTS">{uiStrings?.dialogue_highlight_effects || "Эффекты (Баффы/Дебаффы)"}</option>
                                                </CustomSelect>
                                            </div>

                                            <div className="flex items-center gap-1.5 mt-1 border-t border-gray-700/50 pt-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActivePicker({
                                                            targetName: `${uiStrings?.dialogue_page || "Страница"} ${pIdx + 1} - ${uiStrings?.dialogue_image || "Изображение"}`,
                                                            onSelect: (assetId) => {
                                                                const newNodes = { ...dialogue.nodes };
                                                                const n = newNodes[selectedNode];
                                                                const tut = n.tutorial || {};
                                                                const pgs = [...(tut.pages || [])];
                                                                pgs[pIdx] = { ...pgs[pIdx], assetId: assetId || undefined };

                                                                const updatedTut = { ...tut, pages: pgs };
                                                                newNodes[selectedNode] = { ...n, tutorial: updatedTut };
                                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                                            }
                                                        });
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded font-bold transition-colors max-w-full truncate"
                                                >
                                                    {uiStrings?.dialogue_image || "Изображение"}{page.assetId ? `: ${page.assetId}` : ''}
                                                </button>
                                                {page.assetId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newNodes = { ...dialogue.nodes };
                                                            const n = newNodes[selectedNode];
                                                            const tut = n.tutorial || {};
                                                            const pgs = [...(tut.pages || [])];
                                                            pgs[pIdx] = { ...pgs[pIdx], assetId: undefined };

                                                            const updatedTut = { ...tut, pages: pgs };
                                                            newNodes[selectedNode] = { ...n, tutorial: updatedTut };
                                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                                        }}
                                                        className="bg-red-650 hover:bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400 uppercase">
                                    {uiStrings?.dialogue_sound_id || "Звук при активации узла (soundId)"}
                                </label>
                                <CustomSelect
                                    value={dialogue.nodes[selectedNode].soundId || ''}
                                    onChange={(e) => {
                                        const newNodes = { ...dialogue.nodes };
                                        const soundVal = e.target.value || null;
                                        if (soundVal) {
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], soundId: soundVal };
                                        } else {
                                            const { soundId, ...rest } = newNodes[selectedNode];
                                            newNodes[selectedNode] = rest as DialogueNode;
                                        }
                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                    }}
                                    className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500"
                                >
                                    <option value="">{uiStrings?.dialogue_sound_select || "-- Выбрать звук --"}</option>
                                    {Object.keys(soundsData).map((soundKey) => (
                                        <option key={soundKey} value={soundKey}>
                                            {soundKey}
                                        </option>
                                    ))}
                                </CustomSelect>
                            </div>

                            <div className="flex flex-col gap-2 border border-gray-700 bg-gray-800/50 p-2 rounded">
                                <label className="text-xs text-gray-400 flex justify-between uppercase">
                                    Текст узла (Node Text)
                                    <a href="https://lingva.ml" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">Перевести</a>
                                </label>
                                {(() => {
                                    const fullText = dialogue.nodes[selectedNode].text || '';
                                    const parts = fullText.split('/');
                                    const ruText = parts[0] || '';
                                    const enText = parts.length > 1 ? parts.slice(1).join('/') : '';
                                    
                                    return (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] text-gray-500 uppercase">Русский:</span>
                                                <textarea
                                                    value={ruText}
                                                    onChange={(e) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], text: `${e.target.value}/${enText}` };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500 min-h-[60px] resize-y"
                                                    placeholder="Привет"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] text-gray-500 uppercase">English:</span>
                                                <textarea
                                                    value={enText}
                                                    onChange={(e) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], text: `${ruText}/${e.target.value}` };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="bg-gray-800 text-gray-300 border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-indigo-500 min-h-[60px] resize-y"
                                                    placeholder="Hello"
                                                />
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {dialogue.nodes[selectedNode].speaker === 'PLAYER' && (
                                <div className="flex flex-col gap-2 border-t border-gray-700 pt-3">
                                    <label className="text-xs text-gray-400 uppercase flex justify-between items-center">
                                        Варианты ответа
                                        <button
                                            onClick={() => {
                                                const newNodes = { ...dialogue.nodes };
                                                const opts = [...(newNodes[selectedNode].options || [])];
                                                opts.push({ text: 'Новый вариант/New option', nextNodeId: null });
                                                newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded"
                                        >
                                            + Add
                                        </button>
                                    </label>
                                    {dialogue.nodes[selectedNode].options?.map((opt, idx) => (
                                        <div key={idx} className="bg-gray-800 border border-gray-700 p-2 rounded flex flex-col gap-2">
                                            <div className="flex justify-between items-center border-b border-gray-700/50 pb-1">
                                                <span className="text-[10px] text-gray-450 font-bold">Вариант #{idx + 1}</span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        disabled={idx === 0}
                                                        onClick={() => {
                                                            if (idx === 0) return;
                                                            const newNodes = { ...dialogue.nodes };
                                                            const opts = [...(newNodes[selectedNode].options || [])];
                                                            const temp = opts[idx];
                                                            opts[idx] = opts[idx - 1];
                                                            opts[idx - 1] = temp;
                                                            newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                                        }}
                                                        className={`p-1 rounded transition-colors ${idx === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-450 hover:text-white hover:bg-gray-700'}`}
                                                        title="Переместить вверх"
                                                    >
                                                        <ArrowUp size={12} />
                                                    </button>
                                                    <button
                                                        disabled={idx === (dialogue.nodes[selectedNode].options || []).length - 1}
                                                        onClick={() => {
                                                            if (idx === (dialogue.nodes[selectedNode].options || []).length - 1) return;
                                                            const newNodes = { ...dialogue.nodes };
                                                            const opts = [...(newNodes[selectedNode].options || [])];
                                                            const temp = opts[idx];
                                                            opts[idx] = opts[idx + 1];
                                                            opts[idx + 1] = temp;
                                                            newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                                        }}
                                                        className={`p-1 rounded transition-colors ${idx === (dialogue.nodes[selectedNode].options || []).length - 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-450 hover:text-white hover:bg-gray-700'}`}
                                                        title="Переместить вниз"
                                                    >
                                                        <ArrowDown size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            {(() => {
                                                const fullTxt = opt.text || '';
                                                const pts = fullTxt.split('/');
                                                const rTxt = pts[0] || '';
                                                const eTxt = pts.length > 1 ? pts.slice(1).join('/') : '';
                                                
                                                return (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex bg-gray-900 border border-gray-600 rounded overflow-hidden">
                                                            <span className="bg-gray-800 text-[10px] text-gray-500 font-bold px-1 py-1 w-6 text-center border-r border-gray-600 flex items-center justify-center">RU</span>
                                                            <textarea
                                                                value={rTxt}
                                                                onChange={(e) => {
                                                                    const newNodes = { ...dialogue.nodes };
                                                                    const opts = [...(newNodes[selectedNode].options || [])];
                                                                    opts[idx] = { ...opts[idx], text: `${e.target.value}/${eTxt}` };
                                                                    newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                                    updateDialogue({ ...dialogue, nodes: newNodes });
                                                                }}
                                                                className="flex-1 bg-transparent text-white px-2 py-1 text-xs outline-none focus:bg-gray-800 min-h-[40px] resize-y"
                                                                placeholder="Вариант..."
                                                            />
                                                        </div>
                                                        <div className="flex bg-gray-900 border border-gray-600 rounded overflow-hidden">
                                                            <span className="bg-gray-800 text-[10px] text-gray-500 font-bold px-1 py-1 w-6 text-center border-r border-gray-600 flex items-center justify-center">EN</span>
                                                            <textarea
                                                                value={eTxt}
                                                                onChange={(e) => {
                                                                    const newNodes = { ...dialogue.nodes };
                                                                    const opts = [...(newNodes[selectedNode].options || [])];
                                                                    opts[idx] = { ...opts[idx], text: `${rTxt}/${e.target.value}` };
                                                                    newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                                    updateDialogue({ ...dialogue, nodes: newNodes });
                                                                }}
                                                                className="flex-1 bg-transparent text-gray-300 px-2 py-1 text-xs outline-none focus:bg-gray-800 min-h-[40px] resize-y"
                                                                placeholder="Option..."
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-400 uppercase">Next ID:</span>
                                                <input
                                                    value={opt.nextNodeId || ''}
                                                    onChange={(e) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        const opts = [...(newNodes[selectedNode].options || [])];
                                                        opts[idx] = { ...opts[idx], nextNodeId: e.target.value || null };
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="flex-1 bg-gray-900 border border-gray-600 rounded px-1 min-w-0 text-xs text-white"
                                                    placeholder="null"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        const opts = [...(newNodes[selectedNode].options || [])];
                                                        opts.splice(idx, 1);
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="text-red-500 hover:bg-red-900/30 p-1 rounded"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div className="flex flex-col mt-1 gap-1">
                                                 <label className="text-[10px] text-gray-400 uppercase">{uiStrings?.dialogue_item_condition || "Условие предмета (hasItem):"}</label>
                                                 <CustomSelect
                                                    value={opt.condition?.hasItem || ''}
                                                    onChange={(e) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        const opts = [...(newNodes[selectedNode].options || [])];
                                                        opts[idx] = { ...opts[idx], condition: e.target.value ? { hasItem: e.target.value } : undefined };
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], options: opts };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }}
                                                    className="w-full bg-gray-900 border border-gray-650 rounded px-1 min-w-0 text-xs text-white"
                                                 >
                                                    <option value="">{uiStrings?.dialogue_item_select || "-- Выбрать предмет --"}</option>
                                                    {Object.keys(itemsData).map(itemKey => (
                                                        <option key={itemKey} value={itemKey}>
                                                            {itemKey} ({itemsData[itemKey].name || itemKey})
                                                        </option>
                                                    ))}
                                                 </CustomSelect>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 border-t border-gray-700 pt-3">
                                <label className="text-xs text-gray-400 uppercase">Дополнительно</label>
                                
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!dialogue.nodes[selectedNode].once}
                                        onChange={(e) => {
                                            const newNodes = { ...dialogue.nodes };
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], once: e.target.checked };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="w-4 h-4 bg-gray-800 rounded border-gray-600 text-indigo-600"
                                    />
                                    <span className="text-sm text-gray-300">Один раз (Once)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                    <input
                                        type="checkbox"
                                        checked={!!dialogue.nodes[selectedNode].noVoice}
                                        onChange={(e) => {
                                            const newNodes = { ...dialogue.nodes };
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], noVoice: e.target.checked };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="w-4 h-4 bg-gray-800 rounded border-gray-600 text-indigo-600"
                                    />
                                    <span className="text-sm text-gray-300">{uiStrings?.dialogue_novoice || "Без озвучки (No TTS)"}</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                    <input
                                        type="checkbox"
                                        checked={!!dialogue.nodes[selectedNode].hiddenSpeaker}
                                        onChange={(e) => {
                                            const newNodes = { ...dialogue.nodes };
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], hiddenSpeaker: e.target.checked };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="w-4 h-4 bg-gray-800 rounded border-gray-600 text-indigo-600"
                                    />
                                    <span className="text-sm text-gray-300">{uiStrings?.dialogue_hidden_speaker || "Скрытый говорящий (Hidden Speaker)"}</span>
                                </label>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">{uiStrings?.dialogue_override_name || "Переопределить имя"}</label>
                                    <input
                                        type="text"
                                        value={dialogue.nodes[selectedNode].overrideName || ''}
                                        onChange={(e) => {
                                            const newNodes = { ...dialogue.nodes };
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], overrideName: e.target.value || undefined };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-full"
                                        placeholder="Ghost"
                                    />
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">{uiStrings?.dialogue_override_portrait || "Переопределить портрет"}</label>
                                    <div className="flex gap-1">
                                        <input
                                            type="text"
                                            readOnly
                                            value={dialogue.nodes[selectedNode].overridePortrait || ''}
                                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none flex-1 uppercase cursor-not-allowed"
                                            placeholder="portrait_ghost"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActivePicker({
                                                    targetName: uiStrings?.dialogue_override_portrait || "Портрет / Portrait",
                                                    onSelect: (assetId) => {
                                                        const newNodes = { ...dialogue.nodes };
                                                        newNodes[selectedNode] = { ...newNodes[selectedNode], overridePortrait: assetId || undefined };
                                                        updateDialogue({ ...dialogue, nodes: newNodes });
                                                    }
                                                });
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-2.5 py-1.5 rounded font-bold transition-colors"
                                        >
                                            {uiStrings?.dialogue_select || "Выбрать"}
                                        </button>
                                        {dialogue.nodes[selectedNode].overridePortrait && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newNodes = { ...dialogue.nodes };
                                                    newNodes[selectedNode] = { ...newNodes[selectedNode], overridePortrait: undefined };
                                                    updateDialogue({ ...dialogue, nodes: newNodes });
                                                }}
                                                className="bg-red-650 hover:bg-red-500 text-white text-xs px-2.5 py-1.5 rounded font-bold transition-colors"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500 font-bold">Действие (Action)</label>
                                    <CustomSelect
                                        value={dialogue.nodes[selectedNode].action || ''}
                                        onChange={(e) => {
                                            const newNodes = { ...dialogue.nodes };
                                            const val = e.target.value;
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], action: val ? val : undefined };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-full"
                                    >
                                        <option value="">--- Нет / No Action ---</option>
                                        <option value="trade">Торговля (trade)</option>
                                        <option value="keep">Хранение (keep)</option>
                                    </CustomSelect>
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">{uiStrings?.dialogue_item_give || "Выдать предмет (giveItem):"}</label>
                                    <div className="flex gap-1">
                                        <CustomSelect
                                            value={dialogue.nodes[selectedNode].giveItem?.id || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const newNodes = { ...dialogue.nodes };
                                                const c = newNodes[selectedNode].giveItem?.count || 1;
                                                newNodes[selectedNode] = { ...newNodes[selectedNode], giveItem: val ? { id: val, count: c } : undefined };
                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                            }}
                                            className="bg-gray-800 text-white border border-gray-650 rounded px-2 py-1 text-sm outline-none flex-1"
                                        >
                                            <option value="">{uiStrings?.dialogue_item_select || "-- Выбрать предмет --"}</option>
                                            {Object.keys(itemsData).map(itemKey => (
                                                <option key={itemKey} value={itemKey}>
                                                    {itemKey} ({itemsData[itemKey].name || itemKey})
                                                </option>
                                            ))}
                                        </CustomSelect>
                                        <input
                                            type="number"
                                            value={dialogue.nodes[selectedNode].giveItem?.count || 1}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1;
                                                const newNodes = { ...dialogue.nodes };
                                                const id = newNodes[selectedNode].giveItem?.id;
                                                if (id) {
                                                    newNodes[selectedNode] = { ...newNodes[selectedNode], giveItem: { id, count: val } };
                                                    updateDialogue({ ...dialogue, nodes: newNodes });
                                                }
                                            }}
                                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-16 text-center"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">{uiStrings?.dialogue_item_take || "Забрать предмет (takeItem):"}</label>
                                    <div className="flex gap-1">
                                        <CustomSelect
                                            value={dialogue.nodes[selectedNode].takeItem?.id || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const newNodes = { ...dialogue.nodes };
                                                const c = newNodes[selectedNode].takeItem?.count || 1;
                                                newNodes[selectedNode] = { ...newNodes[selectedNode], takeItem: val ? { id: val, count: c } : undefined };
                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                            }}
                                            className="bg-gray-800 text-white border border-gray-650 rounded px-2 py-1 text-sm outline-none flex-1"
                                        >
                                            <option value="">{uiStrings?.dialogue_item_select || "-- Выбрать предмет --"}</option>
                                            {Object.keys(itemsData).map(itemKey => (
                                                <option key={itemKey} value={itemKey}>
                                                    {itemKey} ({itemsData[itemKey].name || itemKey})
                                                </option>
                                            ))}
                                        </CustomSelect>
                                        <input
                                            type="number"
                                            value={dialogue.nodes[selectedNode].takeItem?.count || 1}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1;
                                                const newNodes = { ...dialogue.nodes };
                                                const id = newNodes[selectedNode].takeItem?.id;
                                                if (id) {
                                                    newNodes[selectedNode] = { ...newNodes[selectedNode], takeItem: { id, count: val } };
                                                    updateDialogue({ ...dialogue, nodes: newNodes });
                                                }
                                            }}
                                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-16 text-center"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">{uiStrings?.dialogue_tutorial_id || "ID Обучения (tutorialId)"}</label>
                                    <input
                                        type="text"
                                        value={dialogue.nodes[selectedNode].tutorialId || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const newNodes = { ...dialogue.nodes };
                                            newNodes[selectedNode] = { ...newNodes[selectedNode], tutorialId: val ? val : undefined };
                                            updateDialogue({ ...dialogue, nodes: newNodes });
                                        }}
                                        className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-full"
                                        placeholder="E.g. movement"
                                    />
                                </div>

                                <div className="flex flex-col gap-1 mt-2">
                                    <label className="text-xs text-gray-500">Запустить скрипт (scriptTriggerId)</label>
                                    {triggers && triggers.length > 0 ? (
                                        <CustomSelect
                                            value={dialogue.nodes[selectedNode].scriptTriggerId || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const newNodes = { ...dialogue.nodes };
                                                newNodes[selectedNode] = { ...newNodes[selectedNode], scriptTriggerId: val ? val : undefined };
                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                            }}
                                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-full"
                                        >
                                            <option value="">--- Выбрать скрипт ---</option>
                                            {triggers.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.id} ({t.type})
                                                </option>
                                            ))}
                                        </CustomSelect>
                                    ) : (
                                        <input
                                            type="text"
                                            value={dialogue.nodes[selectedNode].scriptTriggerId || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const newNodes = { ...dialogue.nodes };
                                                newNodes[selectedNode] = { ...newNodes[selectedNode], scriptTriggerId: val ? val : undefined };
                                                updateDialogue({ ...dialogue, nodes: newNodes });
                                            }}
                                            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none w-full"
                                            placeholder="Введите ID триггера"
                                        />
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    <div className="mt-auto pt-4 border-t border-gray-700">
                        <button
                            onClick={() => {
                                if (dialogue.rootNodeId !== selectedNode) {
                                    updateDialogue({ ...dialogue, rootNodeId: selectedNode });
                                }
                            }}
                            disabled={dialogue.rootNodeId === selectedNode}
                            className="w-full mb-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-yellow-600 text-white font-bold py-1 rounded text-sm transition-colors"
                        >
                            {dialogue.rootNodeId === selectedNode ? 'Node Is Root' : 'Set as Root'}
                        </button>
                        <button
                            onClick={() => {
                                // Removed confirm() as it is blocked in iFrame
                                const newNodes = { ...dialogue.nodes };
                                delete newNodes[selectedNode];
                                updateDialogue({ ...dialogue, nodes: newNodes });
                                setSelectedNode(null);
                            }}
                            className="w-full bg-red-900/50 border border-red-700 text-red-400 hover:bg-red-800 hover:text-white py-1 rounded text-sm transition-colors"
                        >
                            Удалить узел
                        </button>
                    </div>
                </div>
            )}
            {activePicker && (
                <div className="absolute inset-0 bg-gray-900 z-[1000] p-4 flex flex-col">
                    <AssetPicker
                        targetName={activePicker.targetName}
                        onSelect={(assetId) => {
                            activePicker.onSelect(assetId);
                            setActivePicker(null);
                        }}
                        onCancel={() => setActivePicker(null)}
                        uiStrings={uiStrings || {}}
                    />
                </div>
            )}
        </div>
    );
};

interface LineProps {
    start: { x: number, y: number };
    end: { x: number, y: number };
    temp?: boolean;
}

const Line: React.FC<LineProps> = ({ start, end, temp }) => {
    // Bézier curve calculation
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Control points to enforce horizontal flow out of outputs and into inputs
    const offset = Math.max(40, Math.min(dist / 2.5, 120));
    
    const ctrl1X = start.x + offset;
    const ctrl1Y = start.y;
    const ctrl2X = end.x - offset;
    const ctrl2Y = end.y;

    const path = `M ${start.x} ${start.y} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${end.x} ${end.y}`;

    return (
        <path
            d={path}
            fill="none"
            stroke={temp ? '#a855f7' : '#6366f1'}
            strokeWidth={temp ? 3 : 2}
            strokeDasharray={temp ? "5,5" : "none"}
            className="transition-none pointer-events-none"
        />
    );
};
