import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface CustomSelectProps {
  value: any;
  onChange: (e: { target: { value: any } }) => void;
  className?: string;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

type ParsedOption = {
  type: 'option';
  value: string | number;
  label: React.ReactNode;
  disabled?: boolean;
} | {
  type: 'optgroup';
  label: React.ReactNode;
};

const extractOptions = (children: React.ReactNode): ParsedOption[] => {
  const opts: ParsedOption[] = [];
  
  const processNode = (node: React.ReactNode) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(processNode);
      return;
    }
    if (React.isValidElement(node)) {
      if (node.type === 'option') {
        opts.push({ 
          type: 'option', 
          value: node.props.value !== undefined ? node.props.value : node.props.children, 
          label: node.props.children,
          disabled: node.props.disabled
        });
      } else if (node.type === 'optgroup') {
        opts.push({ type: 'optgroup', label: node.props.label });
        processNode(node.props.children);
      } else if (node.type === React.Fragment) {
        processNode(node.props.children);
      }
    }
  };

  React.Children.forEach(children, processNode);
  return opts;
};

export const CustomSelect = ({
  value,
  onChange,
  className = '',
  children,
  title,
  disabled
}: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, bottomUp: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const lastOptionsRef = useRef<ParsedOption[]>([]);
  const options = React.useMemo(() => {
    const newOpts = extractOptions(children);
    const lastOpts = lastOptionsRef.current;
    if (newOpts.length === lastOpts.length) {
      let isSame = true;
      for (let i = 0; i < newOpts.length; i++) {
        const a = newOpts[i];
        const b = lastOpts[i];
        if (a.type !== b.type) {
          isSame = false;
          break;
        }
        if (a.type === 'option' && b.type === 'option') {
          if (a.value !== b.value || a.label !== b.label || a.disabled !== b.disabled) {
            isSame = false;
            break;
          }
        } else if (a.type === 'optgroup' && b.type === 'optgroup') {
          if (a.label !== b.label) {
            isSame = false;
            break;
          }
        }
      }
      if (isSame) {
        return lastOpts;
      }
    }
    lastOptionsRef.current = newOpts;
    return newOpts;
  }, [children]);
  
  // Find selected option
  let selectedOptionLabel: React.ReactNode = value;
  for (const opt of options) {
    if (opt.type === 'option' && String(opt.value) === String(value)) {
      selectedOptionLabel = opt.label;
      break;
    }
  }

  useEffect(() => {
    let touchMoved = false;

    const handleTouchStart = () => {
      touchMoved = false;
    };

    const handleTouchMove = () => {
      touchMoved = true;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!touchMoved) {
        handleClickOutside(event);
      }
    };

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isOpen && containerRef.current && dropdownRef.current) {
        const target = event.target as Node;
        if (!containerRef.current.contains(target) && !dropdownRef.current.contains(target)) {
          setIsOpen(false);
        }
      }
    };
    
    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        const needsBottomUp = spaceBelow < 250 && spaceAbove > spaceBelow;
        
        setDropdownPos({
           top: needsBottomUp ? rect.top - 4 : rect.bottom + 4,
           left: rect.left,
           width: rect.width,
           bottomUp: needsBottomUp
        });
      }
    };

    const handleScrollOrResize = (event: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
         return;
      }
      requestAnimationFrame(updatePosition);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
       const rect = containerRef.current.getBoundingClientRect();
       const spaceBelow = window.innerHeight - rect.bottom;
       const spaceAbove = rect.top;
       
       // Dropdown max height is roughly 240px (max-h-60)
       const needsBottomUp = spaceBelow < 250 && spaceAbove > spaceBelow;
       
       setDropdownPos({
          top: needsBottomUp ? rect.top - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          bottomUp: needsBottomUp
       });
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative inline-block cursor-pointer group ${className} !p-0 !border-0 !bg-transparent`}
        title={title}
        onClick={toggleDropdown}
      >
        <div className={`flex items-center justify-between w-full h-full min-h-[32px] px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-gray-200 outline-none hover:border-indigo-500 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <span className="truncate mr-2 flex items-center min-w-0">{selectedOptionLabel}</span>
          <ChevronDown size={14} className="text-gray-500 group-hover:text-indigo-400 shrink-0" />
        </div>
      </div>

      {isOpen && !disabled && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed z-[99999] bg-gray-900 border border-indigo-500/50 rounded shadow-2xl overflow-y-auto"
          style={{
             top: dropdownPos.bottomUp ? 'auto' : `${dropdownPos.top}px`,
             bottom: dropdownPos.bottomUp ? `${window.innerHeight - dropdownPos.top}px` : 'auto',
             left: `${dropdownPos.left}px`,
             minWidth: `${dropdownPos.width}px`,
             maxHeight: '240px'
          }}
        >
          {options.map((opt, i) => {
            if (opt.type === 'optgroup') {
               return (
                  <div key={i} className="px-3 py-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider bg-gray-800/50">
                    {opt.label}
                  </div>
               );
            }
            
            const isOptDisabled = opt.type === 'option' && opt.disabled;
            return (
              <div
                key={i}
                className={`px-3 py-2 text-sm border-b border-gray-800 last:border-b-0 transition-colors ${
                  isOptDisabled
                    ? 'text-gray-600 bg-gray-950/20 cursor-not-allowed'
                    : String(opt.value) === String(value)
                      ? 'bg-indigo-900/80 text-white font-bold cursor-pointer'
                      : 'text-gray-300 hover:bg-indigo-600 hover:text-white cursor-pointer'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOptDisabled) return;
                  onChange({ target: { value: opt.value } });
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};
