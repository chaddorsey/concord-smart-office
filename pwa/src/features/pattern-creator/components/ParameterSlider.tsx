/**
 * Parameter Slider Component
 *
 * Reusable touch-friendly slider for pattern parameters.
 * Features large thumb, label, current value display, and optional step markers.
 */

import React, { useCallback, useId } from 'react';

interface ParameterSliderProps {
  /** Label text for the parameter */
  label: string;
  /** Current value */
  value: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment */
  step: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Optional unit suffix (e.g., "deg", "%") */
  unit?: string;
  /** Number of decimal places to show */
  decimals?: number;
  /** Show step markers on track */
  showStepMarkers?: boolean;
  /** Optional description text */
  description?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Optional CSS class names */
  className?: string;
}

/**
 * ParameterSlider is a mobile-optimized slider for adjusting pattern parameters
 */
export const ParameterSlider: React.FC<ParameterSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = '',
  decimals = step < 1 ? 1 : 0,
  showStepMarkers = false,
  description,
  disabled = false,
  className = '',
}) => {
  const id = useId();

  // Format the display value
  const displayValue = value.toFixed(decimals);

  // Calculate percentage for custom styling
  const percentage = ((value - min) / (max - min)) * 100;

  // Handle change with proper number parsing
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      // Round to step precision to avoid floating point issues
      const rounded = Math.round(newValue / step) * step;
      const clamped = Math.max(min, Math.min(max, rounded));
      // Round to decimal places to clean up floating point
      const cleaned = parseFloat(clamped.toFixed(decimals + 1));
      onChange(cleaned);
    },
    [onChange, step, min, max, decimals]
  );

  // Calculate step markers if needed
  const stepMarkers: number[] = [];
  if (showStepMarkers) {
    const numSteps = (max - min) / step;
    // Only show markers if there are a reasonable number
    if (numSteps <= 20) {
      for (let i = 0; i <= numSteps; i++) {
        stepMarkers.push(min + i * step);
      }
    }
  }

  return (
    <div className={`parameter-slider ${className}`}>
      {/* Label and Value Display */}
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        <span
          className={`text-sm font-semibold tabular-nums ${
            disabled ? 'text-gray-400' : 'text-amber-600'
          }`}
        >
          {displayValue}
          {unit && <span className="text-gray-500 font-normal ml-0.5">{unit}</span>}
        </span>
      </div>

      {/* Description if provided */}
      {description && (
        <p className="text-xs text-gray-500 mb-2">{description}</p>
      )}

      {/* Slider Track */}
      <div className="relative py-3">
        {/* Custom track background with fill */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gray-200 overflow-hidden pointer-events-none">
          <div
            className={`h-full rounded-full transition-all ${
              disabled ? 'bg-gray-300' : 'bg-amber-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Step markers */}
        {showStepMarkers && stepMarkers.length > 0 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
            {stepMarkers.map((markerValue, index) => {
              const markerPercent = ((markerValue - min) / (max - min)) * 100;
              const isActive = markerValue <= value;
              return (
                <div
                  key={index}
                  className={`w-1 h-1 rounded-full ${
                    isActive
                      ? disabled
                        ? 'bg-gray-400'
                        : 'bg-amber-600'
                      : 'bg-gray-400'
                  }`}
                  style={{
                    position: 'absolute',
                    left: `${markerPercent}%`,
                    transform: 'translateX(-50%)',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Native range input with enhanced touch area */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={`
            relative w-full h-8 appearance-none bg-transparent cursor-pointer
            touch-manipulation
            disabled:cursor-not-allowed disabled:opacity-60
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:h-6
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-amber-500
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:active:scale-110
            [&::-webkit-slider-thumb]:disabled:border-gray-400
            [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:w-6
            [&::-moz-range-thumb]:h-6
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-amber-500
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:disabled:border-gray-400
          `}
          style={{ touchAction: 'manipulation' }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${displayValue}${unit}`}
        />
      </div>

      {/* Min/Max labels */}
      <div className="flex justify-between text-xs text-gray-400 -mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};

export default ParameterSlider;
