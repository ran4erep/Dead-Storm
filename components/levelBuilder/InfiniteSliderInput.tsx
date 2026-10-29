import React, { useState, useRef } from 'react';
import { NumericInput } from './NumericInput';

interface InfiniteSliderInputProps {
  label: string;
  value: number | undefined;
  onChange: (val: number) => void;
  step?: number;
  defaultMin?: number;
  defaultMax?: number;
  minLimit?: number;
  defaultValue?: number;
  unit?: string;
  className?: string;
}

export const InfiniteSliderInput: React.FC<InfiniteSliderInputProps> = ({
  label,
  value,
  onChange,
  step = 0.01,
  defaultMin = 0,
  defaultMax = 1,
  minLimit,
  defaultValue = 0,
  unit = '',
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const val = typeof value === 'number' && !isNaN(value) ? value : defaultValue;

  // Calculate dynamic visual bounds so slider range is NEVER capped!
  let visMin = Math.min(defaultMin, val < 0 ? val * 1.5 : val - Math.abs(val) * 0.5);
  let visMax = Math.max(defaultMax, val > 0 ? val * 1.5 : val + Math.abs(val) * 0.5);

  if (minLimit !== undefined) {
    visMin = Math.max(minLimit, visMin);
  }
  if (visMax <= visMin) {
    visMax = visMin + Math.max(step * 10, 1);
  }

  // Calculate fill percentage for the slider bar
  const rangeSpan = visMax - visMin;
  const pct = Math.max(0, Math.min(100, ((val - visMin) / rangeSpan) * 100));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click / primary touch only
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(true);

    const startX = e.clientX;
    const startVal = val;
    const rect = target.getBoundingClientRect();
    const trackWidth = Math.max(rect.width, 80);

    const handlePointerMove = (pmEvent: PointerEvent) => {
      const dx = pmEvent.clientX - startX;
      let sens = rangeSpan / trackWidth;
      if (pmEvent.shiftKey) sens *= 4;
      if (pmEvent.altKey || pmEvent.ctrlKey) sens *= 0.1;

      let newVal = startVal + dx * sens;
      if (minLimit !== undefined && newVal < minLimit) {
        newVal = minLimit;
      }

      // Format with appropriate decimal precision based on step
      const stepStr = step.toString();
      const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
      const rounded = Math.round(newVal / step) * step;
      const finalVal = parseFloat(rounded.toFixed(Math.max(decimals, 6)));

      onChange(finalVal);
    };

    const handlePointerUp = (puEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(puEvent.pointerId);
      } catch (_) {}
      setIsDragging(false);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
    };

    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseFloat(e.target.value);
    if (!isNaN(rawVal)) {
      let newVal = rawVal;
      if (minLimit !== undefined && newVal < minLimit) newVal = minLimit;
      onChange(newVal);
    }
  };

  const stepStr = step.toString();
  const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-300 font-semibold truncate" title={label}>{label}</span>
        <div className="flex items-center gap-1 shrink-0">
          <NumericInput
            value={value}
            onChange={(v) => {
              if (v === undefined) {
                if (minLimit !== undefined) onChange(minLimit);
                else onChange(0);
              } else {
                let nv = v;
                if (minLimit !== undefined && nv < minLimit) nv = minLimit;
                onChange(nv);
              }
            }}
            className="w-20 bg-gray-800 text-white border border-gray-600 px-1.5 py-0.5 rounded text-xs text-right font-mono focus:border-fuchsia-500 outline-none"
          />
          {unit && <span className="text-gray-400 text-[10px] font-mono">{unit}</span>}
        </div>
      </div>

      {/* Interactive Infinite Slider Track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onDoubleClick={() => onChange(defaultValue)}
        className={`relative h-6 bg-gray-900 border ${
          isDragging ? 'border-fuchsia-500 ring-1 ring-fuchsia-500' : 'border-gray-700 hover:border-gray-500'
        } rounded cursor-ew-resize select-none overflow-hidden flex items-center px-1 transition-all`}
        title="Зажмите и тяните влево/вправо для бесконечного изменения. Shift = быстро, Alt/Ctrl = точно. Двойной клик = сброс."
      >
        {/* Dynamic visual fill bar */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-fuchsia-900/70 via-fuchsia-700/80 to-fuchsia-500/90 transition-all duration-75 pointer-events-none"
          style={{ width: `${pct}%` }}
        />

        {/* Handle line */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none transition-all duration-75 -ml-0.5"
          style={{ left: `${pct}%` }}
        />

        {/* Range slider input overlaid */}
        <input
          type="range"
          min={visMin}
          max={visMax}
          step={step}
          value={val}
          onChange={handleSliderChange}
          className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-10"
        />

        {/* Min / Max bounds & Current Value Overlay */}
        <div className="relative z-0 w-full flex justify-between px-2 text-[10px] font-mono pointer-events-none">
          <span className="text-gray-400">{visMin.toFixed(decimals > 2 ? decimals : 2)}</span>
          <span className="font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{val}{unit}</span>
          <span className="text-gray-400">{visMax.toFixed(decimals > 2 ? decimals : 2)}</span>
        </div>
      </div>
    </div>
  );
};
