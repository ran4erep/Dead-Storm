import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Delete, ArrowUp, Globe, Check, Copy, Scissors, Clipboard } from 'lucide-react';

interface VirtualKeyboardProps {
  onClose: () => void;
  activeInput: HTMLInputElement | HTMLTextAreaElement | null;
  uiStrings?: any;
}

const layouts: Record<string, { default: string[][]; shift: string[][] }> = {
  en: {
    default: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '{bksp}']
    ],
    shift: [
      ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_'],
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '?', '!', '{bksp}']
    ]
  },
  ru: {
    default: [
      ['ё', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
      ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
      ['{shift}', 'я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '{bksp}']
    ],
    shift: [
      ['Ё', '!', '"', '№', ';', '%', ':', '?', '*', '(', ')'],
      ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
      ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
      ['{shift}', 'Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', '{bksp}']
    ]
  },
  symbols: {
    default: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
      ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'],
      ['*', '"', "'", ':', ';', '!', '?', '~', '`'],
      ['{shift}', '\\', '|', '<', '>', '{', '}', '[', ']', '=', '{bksp}']
    ],
    shift: [
      ['±', '÷', '×', '°', 'µ', '§', '¶', '©', '®', '™', '€'],
      ['£', '¥', '¢', '¡', '¿', '«', '»', '•', '…', '‰'],
      ['^', '¨', '´', '`', '¸', '˛', '˝', '˘', 'ˇ'],
      ['{shift}', '√', '∞', '≈', '≠', '≤', '≥', '∫', '∆', '∏', '{bksp}']
    ]
  }
};

interface KeyButtonProps {
  keyVal: string;
  display?: React.ReactNode;
  className?: string;
  onClick: (key: string) => void;
  showPopup?: boolean;
  repeats?: boolean;
}

const KeyButtonComponent: React.FC<KeyButtonProps> = ({ 
  keyVal, display, className, onClick, showPopup = true, repeats = true 
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const repeatInterval = useRef<NodeJS.Timeout | null>(null);
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const clearTimers = () => {
    if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
    }
    if (repeatInterval.current) {
        clearInterval(repeatInterval.current);
        repeatInterval.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);

    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch(err) {} 
    }
    
    setIsPressed(true);
    onClickRef.current(keyVal);

    if (repeats) {
        clearTimers();
        pressTimer.current = setTimeout(() => {
            repeatInterval.current = setInterval(() => {
                onClickRef.current(keyVal);
                if (navigator.vibrate) {
                   try { navigator.vibrate(10); } catch(err) {}
                }
            }, 80); // reduced from 100 on touch repeats for lightning responsiveness
        }, 350); // shortened from 400 for a snappy feel
    }
  };

  const handlePointerUpOrLeave = (e: React.PointerEvent<HTMLButtonElement> | React.SyntheticEvent) => {
    setIsPressed(false);
    clearTimers();
    if ('pointerId' in e) {
      try {
        const target = e.currentTarget as HTMLButtonElement;
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
    }
  };

  useEffect(() => {
    return clearTimers;
  }, []);
  
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`relative ${className} ${isPressed ? '!bg-gray-600' : ''} touch-none select-none`}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUpOrLeave}
        onPointerLeave={handlePointerUpOrLeave}
        onPointerCancel={handlePointerUpOrLeave}
        onContextMenu={(e) => { e.preventDefault(); }}
      >
        {display || keyVal}

        {/* Floating absolute key preview popup: eliminates layout-thrashing getBoundingClientRect() completely! */}
        {showPopup && isPressed && (
           <div 
             className="absolute pointer-events-none z-[10000] flex items-center justify-center bg-gray-700 text-white font-mono rounded-lg shadow-2xl border border-gray-500 animate-none transform"
             style={{
               bottom: '125%',
               left: '50%',
               transform: 'translateX(-50%)',
               width: '160%',
               height: '210%',
               fontSize: '130%',
             }}
           >
             {display || keyVal}
           </div>
        )}
      </button>
    </>
  );
};

const KeyButton = React.memo(KeyButtonComponent);

let persistentLang: 'en' | 'ru' = 'en';

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ onClose, activeInput, uiStrings }) => {
  const [lang, setLangState] = useState<'en' | 'ru'>(persistentLang);
  const [shiftMode, setShiftMode] = useState<0 | 1 | 2>(0);
  const lastShiftClickTime = useRef<number>(0);
  const [isSymbolsMode, setIsSymbolsMode] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const keyboardRef = useRef<HTMLDivElement>(null);

  // Sync references to skip recreating simulateKey callback when active element or modes change
  const activeInputRef = useRef(activeInput);
  const isReadyRef = useRef(isReady);
  const shiftModeRef = useRef(shiftMode);

  const [inputRect, setInputRect] = useState<DOMRect | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showPasteHelper, setShowPasteHelper] = useState(false);
  const [pasteHelperValue, setPasteHelperValue] = useState('');

  const updateInputRect = useCallback(() => {
    const active = activeInputRef.current;
    if (active) {
      setInputRect(active.getBoundingClientRect());
    } else {
      setInputRect(null);
    }
  }, []);

  useEffect(() => {
    activeInputRef.current = activeInput;
    isReadyRef.current = isReady;
    shiftModeRef.current = shiftMode;
    if (activeInput) {
      updateInputRect();
    } else {
      setInputRect(null);
      setShowMenu(false);
      setShowPasteHelper(false);
      setPasteHelperValue('');
    }
  }, [activeInput, isReady, shiftMode, updateInputRect]);

  useEffect(() => {
    setShowPasteHelper(false);
    setPasteHelperValue('');
  }, [activeInput]);

  const setLang = (newLang: 'en' | 'ru') => {
      persistentLang = newLang;
      setLangState(newLang);
  };
  
  const isShift = shiftMode > 0;

  const handleShiftClick = () => {
      const now = Date.now();
      if (now - lastShiftClickTime.current < 400) {
          setShiftMode(2); // caps lock
      } else {
          setShiftMode(shiftMode === 0 ? 1 : 0);
      }
      lastShiftClickTime.current = now;
  };

  useEffect(() => {
    if (!activeInput) {
        setIsReady(false);
        setShiftMode(0);
        return;
    }

    setIsReady(false);
    const readyTimer = setTimeout(() => setIsReady(true), 150);

    // Safeguard numeric inputs from being reset or wiped out to "" by browser/React on string modifications (like adding "." or "-")
    const isNumber = activeInput.tagName.toLowerCase() === 'input' && 
      (activeInput.type === 'number' || activeInput.getAttribute('data-original-type') === 'number');

    let restoreType: (() => void) | null = null;

    if (isNumber) {
      const inputEl = activeInput as HTMLInputElement;
      
      // Temporarily redefine the type property of this specific element to lock its return value to 'text'
      // and reject React's virtual DOM reconciliation from overriding it back to 'number' while focused.
      const originalTypeProperty = Object.getOwnPropertyDescriptor(inputEl, 'type');
      try {
        inputEl.type = 'text'; // enforce DOM text mode
        
        Object.defineProperty(inputEl, 'type', {
          get() {
            return 'text';
          },
          set(val) {
            // Ignore any sets to 'number' from React component trees to keep input in text mode
          },
          configurable: true
        });

        restoreType = () => {
          try {
            delete (inputEl as any).type;
            if (originalTypeProperty) {
              Object.defineProperty(inputEl, 'type', originalTypeProperty);
            }
            inputEl.type = 'number';
          } catch (e) {
            console.warn("Failed to restore input type", e);
          }
        };
      } catch (e) {
        console.warn("Failed to set up type interception", e);
      }
    }

    // Force selection cursor strictly to the end of the text/value upon selection of the field
    const putCursorAtEnd = () => {
      try {
        const val = activeInput.value || '';
        const len = val.length;
        if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
          activeInput.setSelectionRange(len, len);
          activeInput.scrollLeft = activeInput.scrollWidth;
        }
      } catch (e) {
        // ignore
      }
    };

    putCursorAtEnd();
    // Scheduling inside macro-tasks defeats the browser's default select-all/focus coordinate override
    const t1 = setTimeout(putCursorAtEnd, 0);
    const t2 = setTimeout(putCursorAtEnd, 50);
    const t3 = setTimeout(putCursorAtEnd, 150);

    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
        if (!node || node === document.body) return null;
        try {
            const style = window.getComputedStyle(node);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return node;
            }
        } catch (e) {
            return null;
        }
        return getScrollParent(node.parentElement);
    };

    const scrollParent = getScrollParent(activeInput);
    let originalPadding = '';

    const handleScrollAndPadding = () => {
        if (scrollParent && keyboardRef.current) {
           originalPadding = scrollParent.style.paddingBottom;
           const height = keyboardRef.current.offsetHeight;
           scrollParent.style.paddingBottom = `${height + 20}px`;
        }

        try {
            activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            console.warn(e);
        }
        updateInputRect();
    };

    const timeout = setTimeout(handleScrollAndPadding, 50);

    // Floating Menu Event Listeners
    const handleScroll = () => {
      updateInputRect();
    };

    const handleSelection = () => {
      updateInputRect();
      if (activeInput.selectionStart !== activeInput.selectionEnd) {
        setShowMenu(true);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      updateInputRect();
      setShowMenu(true);
    };

    let touchTimer: NodeJS.Timeout | null = null;
    const handleTouchStartInput = () => {
      touchTimer = setTimeout(() => {
        updateInputRect();
        setShowMenu(true);
      }, 500); // 500ms long press
    };

    const handleTouchEndInput = () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    };

    const handleClickInput = () => {
      updateInputRect();
      if (activeInput.selectionStart === activeInput.selectionEnd) {
        setShowMenu(false);
      }
    };

    const handleInputEvent = () => {
      updateInputRect();
      setShowMenu(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (e.shiftKey || shiftModeRef.current > 0) {
          e.preventDefault();
          e.stopPropagation();
          simulateKey('\n');
        }
      }
    };

    window.addEventListener('resize', handleScroll);
    document.addEventListener('scroll', handleScroll, true);
    
    activeInput.addEventListener('keydown', handleKeyDown, true);
    activeInput.addEventListener('input', handleInputEvent);
    activeInput.addEventListener('click', handleClickInput);
    activeInput.addEventListener('select', handleSelection);
    activeInput.addEventListener('contextmenu', handleContextMenu);
    activeInput.addEventListener('touchstart', handleTouchStartInput);
    activeInput.addEventListener('touchend', handleTouchEndInput);
    activeInput.addEventListener('touchmove', handleTouchEndInput);

    return () => {
       clearTimeout(readyTimer);
       clearTimeout(timeout);
       clearTimeout(t1);
       clearTimeout(t2);
       clearTimeout(t3);
       window.removeEventListener('resize', handleScroll);
       document.removeEventListener('scroll', handleScroll, true);
       if (activeInput) {
         activeInput.removeEventListener('keydown', handleKeyDown, true);
         activeInput.removeEventListener('input', handleInputEvent);
         activeInput.removeEventListener('click', handleClickInput);
         activeInput.removeEventListener('select', handleSelection);
         activeInput.removeEventListener('contextmenu', handleContextMenu);
         activeInput.removeEventListener('touchstart', handleTouchStartInput);
         activeInput.removeEventListener('touchend', handleTouchEndInput);
         activeInput.removeEventListener('touchmove', handleTouchEndInput);
       }
       if (scrollParent) {
           scrollParent.style.paddingBottom = originalPadding;
       }
       if (restoreType) {
           restoreType();
       }
    };
  }, [activeInput, updateInputRect]);

  // Prevent blur when clicking kb
  const handlePreventFocus = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  };

  const simulateKey = useCallback((key: string) => {
    const activeInput = activeInputRef.current;
    const isReady = isReadyRef.current;
    const shiftMode = shiftModeRef.current;

    if (!activeInput || !isReady) return;

    activeInput.focus();

    const isNumericInput = activeInput.type === 'number' || activeInput.getAttribute('data-original-type') === 'number' || activeInput.getAttribute('inputMode') === 'numeric';

    let start: number | null = null;
    let end: number | null = null;
    try {
        start = activeInput.selectionStart;
        end = activeInput.selectionEnd;
    } catch(e) {
        start = activeInput.value.length;
        end = activeInput.value.length;
    }

    const val = activeInput.value;
    
    if (start === null || start === undefined) {
        start = val.length;
        end = val.length;
    }

    const ensureCursorVisible = (pos: number, text: string) => {
        try {
            if (activeInput.tagName.toLowerCase() === 'textarea') {
                if (pos === text.length) {
                    activeInput.scrollTop = activeInput.scrollHeight;
                }
            } else {
                if (pos === text.length) {
                    activeInput.scrollLeft = activeInput.scrollWidth;
                } else if (activeInput.scrollWidth > activeInput.clientWidth) {
                    const charRatio = pos / Math.max(1, text.length);
                    const estimatedCaretPos = activeInput.scrollWidth * charRatio;
                    if (estimatedCaretPos < activeInput.scrollLeft || estimatedCaretPos > activeInput.scrollLeft + activeInput.clientWidth) {
                        activeInput.scrollLeft = estimatedCaretPos - (activeInput.clientWidth / 2);
                    }
                }
            }
        } catch (err) {
            // Ignore scroll errors
        }
    };

    if (key === 'ArrowLeft') {
        if (!isNumericInput && start > 0) {
            activeInput.setSelectionRange(start - 1, start - 1);
            ensureCursorVisible(start - 1, val);
        }
        return;
    }
    
    if (key === 'ArrowRight') {
        if (!isNumericInput && start < val.length) {
            activeInput.setSelectionRange(start + 1, start + 1);
            ensureCursorVisible(start + 1, val);
        }
        return;
    }

    let newValue = val;
    let newPos = start;

    if (key === 'Backspace') {
        if (start === end && start > 0) {
            newValue = val.slice(0, start - 1) + val.slice(end);
            newPos = start - 1;
        } else if (start !== end) {
            newValue = val.slice(0, start) + val.slice(end);
            newPos = start;
        }
    } else if (isNumericInput && key === '-') {
        if (val.startsWith('-')) {
            newValue = val.substring(1);
        } else {
            newValue = '-' + val;
        }
        newPos = newValue.length;
    } else if (isNumericInput && key === '.') {
        if (!val.includes('.')) {
            newValue = val + '.';
        }
        newPos = newValue.length;
    } else {
        newValue = val.slice(0, start) + key + val.slice(end);
        newPos = start + key.length;
    }

    setNativeValue(activeInput, newValue);
    
    try {
        if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
            activeInput.setSelectionRange(newPos, newPos);
        }
    } catch (e) {
        console.warn("Could not set selection range on input", e);
    }

    // Workaround to ensure the cursor is visibly scrolled into view
    ensureCursorVisible(newPos, newValue);

    if (shiftMode === 1 && key.length === 1 && key !== 'Backspace' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
        setShiftMode(0);
    }
  }, []);

  const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    
    if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter?.call(element, value);
    } else {
        valueSetter?.call(element, value);
    }
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const handleCopy = useCallback(async () => {
    const activeInput = activeInputRef.current;
    if (!activeInput) return;

    let textToCopy = '';
    try {
      const start = activeInput.selectionStart;
      const end = activeInput.selectionEnd;
      if (start !== null && end !== null && start !== end) {
        textToCopy = activeInput.value.substring(start, end);
      } else {
        textToCopy = activeInput.value;
      }
    } catch (e) {
      textToCopy = activeInput.value;
    }

    if (!textToCopy) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      }
    } catch (e) {
      console.warn("Navigator clipboard write failed, utilizing fallback memory store", e);
    }
    (window as any).__customClipboardBuffer = textToCopy;
    setShowMenu(false);
  }, [setShowMenu]);

  const handleCut = useCallback(async () => {
    const activeInput = activeInputRef.current;
    if (!activeInput) return;

    let textToCut = '';
    let start = 0;
    let end = 0;
    let fallback = false;

    try {
      start = activeInput.selectionStart ?? 0;
      end = activeInput.selectionEnd ?? 0;
      if (start !== end) {
        textToCut = activeInput.value.substring(start, end);
      } else {
        textToCut = activeInput.value;
        fallback = true;
      }
    } catch (e) {
      textToCut = activeInput.value;
      fallback = true;
    }

    if (!textToCut) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCut);
      }
    } catch (e) {
      console.warn("Navigator clipboard write failed, utilizing fallback memory store", e);
    }
    (window as any).__customClipboardBuffer = textToCut;

    let newValue = '';
    let newPos = 0;
    if (fallback) {
      newValue = '';
      newPos = 0;
    } else {
      newValue = activeInput.value.slice(0, start) + activeInput.value.slice(end);
      newPos = start;
    }

    setNativeValue(activeInput, newValue);

    try {
      if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
        activeInput.setSelectionRange(newPos, newPos);
      }
    } catch (e) {
      // ignore
    }
    setShowMenu(false);
  }, [setShowMenu]);

  const handlePaste = useCallback(async () => {
    const activeInput = activeInputRef.current;
    if (!activeInput) return;

    let pastedText = '';
    let success = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        pastedText = await navigator.clipboard.readText();
        if (pastedText) {
          success = true;
        }
      }
    } catch (e) {
      console.warn("Navigator clipboard read failed, using fallback or helper overlay:", e);
    }

    if (!success) {
      pastedText = (window as any).__customClipboardBuffer || '';
      if (pastedText) {
        success = true;
      }
    }

    if (success && pastedText) {
      let start = 0;
      let end = 0;
      try {
        start = activeInput.selectionStart ?? activeInput.value.length;
        end = activeInput.selectionEnd ?? activeInput.value.length;
      } catch (e) {
        start = activeInput.value.length;
        end = activeInput.value.length;
      }

      const val = activeInput.value;
      const newValue = val.slice(0, start) + pastedText + val.slice(end);
      const newPos = start + pastedText.length;

      setNativeValue(activeInput, newValue);

      try {
        if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
          activeInput.setSelectionRange(newPos, newPos);
        }
      } catch (e) {
        // ignore
      }
      setShowMenu(false);
    } else {
      setPasteHelperValue('');
      setShowPasteHelper(true);
      setShowMenu(false);
    }
  }, [setShowMenu]);

  const handleSelectAll = useCallback(() => {
    const activeInput = activeInputRef.current;
    if (!activeInput) return;

    activeInput.focus();
    try {
      if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
        activeInput.setSelectionRange(0, activeInput.value.length);
      } else {
        activeInput.select();
      }
    } catch (e) {
      activeInput.select();
    }
  }, []);

  if (!activeInput) return null;

  const isNumeric = activeInput.type === 'number' || activeInput.getAttribute('data-original-type') === 'number' || activeInput.getAttribute('inputMode') === 'numeric';

  // Retrieve proper localizations
  const spaceLabel = uiStrings?.kb_space || ((lang === 'ru' && !isSymbolsMode) ? 'ПРОБЕЛ' : 'SPACE');
  const okLabel = uiStrings?.kb_ok || 'ОК';
  const enterLabel = uiStrings?.kb_enter || ((lang === 'ru' && !isSymbolsMode) ? 'ВВОД' : 'ENTER');
  const copyLabel = uiStrings?.kb_copy || 'COPY';
  const cutLabel = uiStrings?.kb_cut || 'CUT';
  const pasteLabel = uiStrings?.kb_paste || 'PASTE';
  const selectAllLabel = uiStrings?.kb_select_all || 'SELECT ALL';

  const renderPasteHelper = () => {
    if (!showPasteHelper) return null;

    const titleText = uiStrings?.kb_paste_helper_title || 'PASTE CLIPBOARD TEXT';
    const descText = uiStrings?.kb_paste_helper_desc || 'Due to browser security inside iframes, please paste your text in the box below, then click DONE.';
    const doneText = uiStrings?.kb_btn_done || 'DONE';
    const cancelText = uiStrings?.btn_cancel || 'CANCEL';

    return (
      <div 
        data-native-kb="true"
        className="virtual-keyboard-container absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-[10010] animate-fade-in font-sans"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 w-full max-w-md shadow-2xl flex flex-col gap-4 text-gray-200">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold tracking-wider text-indigo-400 uppercase font-mono">
              {titleText}
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed font-sans mt-1 text-left">
              {descText}
            </p>
          </div>

          <textarea
            data-native-kb="true"
            className="w-full h-28 bg-gray-950 border border-gray-700 focus:border-indigo-500 rounded-lg p-2.5 text-white text-sm focus:outline-none font-mono resize-none transition-colors"
            placeholder="..."
            value={pasteHelperValue}
            onChange={(e) => setPasteHelperValue(e.target.value)}
            autoFocus
          />

          <div className="flex justify-end gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setShowPasteHelper(false);
                setPasteHelperValue('');
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors active:scale-95 cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              disabled={!pasteHelperValue}
              onClick={() => {
                const activeInput = activeInputRef.current;
                if (activeInput && pasteHelperValue) {
                  let start = 0;
                  let end = 0;
                  try {
                    start = activeInput.selectionStart ?? activeInput.value.length;
                    end = activeInput.selectionEnd ?? activeInput.value.length;
                  } catch (e) {
                    start = activeInput.value.length;
                    end = activeInput.value.length;
                  }

                  const val = activeInput.value;
                  const newValue = val.slice(0, start) + pasteHelperValue + val.slice(end);
                  const newPos = start + pasteHelperValue.length;

                  setNativeValue(activeInput, newValue);

                  try {
                    if (activeInput.type !== 'number' && activeInput.type !== 'email' && activeInput.type !== 'color' && activeInput.type !== 'range') {
                      activeInput.setSelectionRange(newPos, newPos);
                    }
                  } catch (e) {
                    // ignore
                  }
                }
                setShowPasteHelper(false);
                setPasteHelperValue('');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg transition-colors active:scale-95 cursor-pointer font-bold"
            >
              {doneText}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFloatingUI = () => {
    if (!activeInput || !inputRect || !showMenu) return null;

    // Calculate floating menu position centered over input, or under if there is no room above
    const menuWidth = 320;
    const menuHeight = 40;
    const spaceAboveInput = inputRect.top;
    const isAbove = spaceAboveInput > menuHeight + 15;
    const menuTop = isAbove ? inputRect.top - menuHeight - 10 : inputRect.bottom + 10;
    // Align horizontally centered, constrained by screen boundaries
    const menuLeft = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, inputRect.left + (inputRect.width - menuWidth) / 2));

    return (
      <div className="virtual-keyboard-container pointer-events-none select-none z-[10005]">
        {/* Floating Context-Menu Pill */}
        <div
          style={{
            top: `${menuTop}px`,
            left: `${menuLeft}px`,
            width: `${menuWidth}px`,
            height: `${menuHeight}px`,
          }}
          className="absolute pointer-events-auto flex items-center justify-between bg-gray-950/95 border border-gray-800 rounded-lg px-2 shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[10007] text-xs font-semibold select-none divide-x divide-gray-800"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSelectAll();
            }}
            className="flex-1 h-full flex items-center justify-center text-gray-300 hover:text-white active:bg-gray-800 rounded-l-lg transition uppercase tracking-wider text-[9px]"
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }}
            className="flex-1 h-full flex items-center justify-center gap-1 text-gray-300 hover:text-white active:bg-gray-800 transition uppercase tracking-wider text-[9px]"
          >
            <Copy size={11} />
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCut();
            }}
            className="flex-1 h-full flex items-center justify-center gap-1 text-gray-300 hover:text-white active:bg-gray-800 transition uppercase tracking-wider text-[9px]"
          >
            <Scissors size={11} />
            {cutLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePaste();
            }}
            className="flex-1 h-full flex items-center justify-center gap-1 text-gray-300 hover:text-white active:bg-gray-800 rounded-r-lg transition uppercase tracking-wider text-[9px]"
          >
            <Clipboard size={11} />
            {pasteLabel}
          </button>
        </div>
      </div>
    );
  };

  const currentLayout = layouts[isSymbolsMode ? 'symbols' : lang][isShift ? 'shift' : 'default'];

  return (
    <>
      {renderFloatingUI()}
      {renderPasteHelper()}

      {isNumeric ? (
        <div 
          ref={keyboardRef}
          className="virtual-keyboard-container absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-2 pb-4 sm:p-4 z-[9999] shadow-[0_-5px_20px_rgba(0,0,0,0.5)] touch-manipulation"
          onMouseDown={handlePreventFocus}
          onTouchStart={handlePreventFocus}
        >
          <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto h-[200px] sm:h-[250px]">
            {/* Row 1 */}
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="1" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="2" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="3" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded row-span-2 flex items-center justify-center font-mono" onClick={simulateKey} keyVal="Backspace" display={<Delete size={24} />} showPopup={false} />
            
            {/* Row 2 */}
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="4" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="5" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="6" />

            {/* Row 3 */}
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="7" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="8" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="9" />
            <KeyButton className="bg-blue-700 hover:bg-blue-600 text-white rounded row-span-2 flex flex-col items-center justify-center text-sm font-bold shadow-sm" onClick={() => { activeInput.blur(); setTimeout(() => onClose(), 150); }} keyVal="OK" display={<><Check size={20} className="mb-1" />{okLabel}</>} showPopup={false} repeats={false} />

            {/* Row 4 */}
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="-" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="0" />
            <KeyButton className="bg-gray-800 hover:bg-gray-750 text-white rounded text-xl font-mono" onClick={simulateKey} keyVal="." />
          </div>
        </div>
      ) : (
        <div 
          ref={keyboardRef}
          className="virtual-keyboard-container absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-1 pb-2 sm:p-2 z-[9999] shadow-[0_-5px_20px_rgba(0,0,0,0.5)] touch-manipulation"
          onMouseDown={handlePreventFocus}
          onTouchStart={handlePreventFocus}
        >
          <div className="flex flex-col gap-1 sm:gap-1.5 max-w-4xl mx-auto w-full px-0.5 sm:px-1">
            {currentLayout.map((row, i) => (
              <div key={i} className="flex justify-center gap-1 sm:gap-1.5 w-full">
                {row.map((key, keyIndex) => {
                  if (key === '{shift}') {
                    return (
                      <KeyButton
                        key={key + '-' + keyIndex}
                        keyVal=""
                        display={
                          <div className="relative flex flex-col items-center justify-center">
                            <ArrowUp size={20} />
                            {shiftMode === 2 && <div className="absolute -bottom-2 w-2 h-0.5 bg-white rounded"></div>}
                          </div>
                        }
                        className={`flex-[1.5] py-2.5 sm:py-3.5 px-0 rounded ${shiftMode === 2 ? 'bg-blue-700 hover:bg-blue-600' : shiftMode === 1 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-800 hover:bg-gray-750'} text-white flex items-center justify-center`}
                        onClick={handleShiftClick}
                        showPopup={false}
                        repeats={false}
                      />
                    );
                  }
                  if (key === '{bksp}') {
                    return (
                      <KeyButton
                        key={key + '-' + keyIndex}
                        keyVal="Backspace"
                        display={<Delete size={20} />}
                        className="flex-[1.5] bg-gray-800 hover:bg-gray-750 text-white rounded py-2.5 sm:py-3.5 px-0 flex items-center justify-center"
                        onClick={simulateKey}
                        showPopup={false}
                      />
                    );
                  }
                  return (
                    <KeyButton
                      key={key + '-' + keyIndex}
                      keyVal={key}
                      className="flex-1 bg-gray-800 hover:bg-gray-750 text-white rounded py-2.5 sm:py-3.5 px-0 text-base sm:text-lg font-mono min-w-0"
                      onClick={simulateKey}
                    />
                  );
                })}
              </div>
            ))}
            
            <div className="flex justify-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 mb-1 sm:mb-0">
              <KeyButton
                keyVal="Sym"
                display={isSymbolsMode ? 'ABC' : '?123'}
                className="flex-[1.2] py-2.5 sm:py-3.5 px-1 rounded bg-gray-800 hover:bg-gray-750 text-white font-bold flex items-center justify-center text-[10px] sm:text-base whitespace-nowrap min-w-0"
                onClick={() => {
                  setIsSymbolsMode(!isSymbolsMode);
                  setShiftMode(0); // Reset shift when toggling mode
                }}
                showPopup={false}
                repeats={false}
              />
              
              <KeyButton
                keyVal="Lang"
                display={<Globe size={20} />}
                className="flex-[1.2] py-2.5 sm:py-3.5 px-1 rounded bg-gray-800 hover:bg-gray-750 text-white flex items-center justify-center min-w-0"
                onClick={() => {
                  setLang(lang === 'en' ? 'ru' : 'en');
                  setIsSymbolsMode(false); // Make sure to exit symbols when changing main language
                }}
                showPopup={false}
                repeats={false}
              />

              <KeyButton
                keyVal="ArrowLeft"
                display="<"
                className="flex-1 py-2.5 sm:py-3.5 px-0 rounded bg-gray-800 hover:bg-gray-750 text-white font-bold flex items-center justify-center text-sm sm:text-lg whitespace-nowrap min-w-0"
                onClick={simulateKey}
                showPopup={false}
              />

              <KeyButton
                keyVal=" "
                display={spaceLabel}
                className="flex-[5] bg-gray-800 hover:bg-gray-750 text-white rounded p-1 sm:p-3.5 text-xs sm:text-base font-bold min-w-0 truncate"
                onClick={simulateKey}
                showPopup={false}
              />
              
              <KeyButton
                keyVal="ArrowRight"
                display=">"
                className="flex-1 py-2.5 sm:py-3.5 px-0 rounded bg-gray-800 hover:bg-gray-750 text-white font-bold flex items-center justify-center text-sm sm:text-lg whitespace-nowrap min-w-0"
                onClick={simulateKey}
                showPopup={false}
              />
              
              {lang === 'ru' && !isSymbolsMode && (
                <KeyButton
                  keyVal={isShift ? "," : "."}
                  display={isShift ? "," : "."}
                  className="flex-1 py-2.5 sm:py-3.5 px-0 rounded bg-gray-800 hover:bg-gray-750 text-white font-bold flex items-center justify-center text-lg sm:text-xl whitespace-nowrap min-w-0"
                  onClick={simulateKey}
                  showPopup={true}
                />
              )}

              <KeyButton
                keyVal={isShift ? "Enter" : "OK"}
                display={isShift ? <span className="text-[10px] sm:text-xs tracking-tight font-bold font-sans uppercase">{enterLabel}</span> : <Check size={20} />}
                className="flex-[1.5] py-2.5 sm:py-3.5 px-1 rounded bg-blue-700 hover:bg-blue-600 text-white flex items-center justify-center min-w-0 text-sm font-bold gap-1"
                onClick={() => {
                  if (isShift) {
                    simulateKey('\n');
                  } else {
                    activeInput.blur();
                    setTimeout(() => onClose(), 150);
                  }
                }}
                showPopup={false}
                repeats={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
