/**
 * Shape Selector Component
 *
 * Grid of shape icons for selecting the base pattern shape.
 * Mobile-friendly with large touch targets and visual selection state.
 */

import React from 'react';
import type { ShapeType } from '../types';

interface ShapeSelectorProps {
  /** Currently selected shape */
  selectedShape: ShapeType;
  /** Callback when shape is selected */
  onShapeSelect: (shape: ShapeType) => void;
  /** Optional CSS class names */
  className?: string;
}

interface ShapeOption {
  type: ShapeType;
  name: string;
  icon: React.ReactNode;
}

/**
 * SVG icons for each shape type
 */
const shapeOptions: ShapeOption[] = [
  {
    type: 'circle',
    name: 'Circle',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    type: 'polygon',
    name: 'Polygon',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 3L21 18H3L12 3Z" transform="translate(0, 1)" />
        <path d="M4 9h16M4 15h16" strokeOpacity={0.3} />
      </svg>
    ),
  },
  {
    type: 'star',
    name: 'Star',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6L12 2z" />
      </svg>
    ),
  },
  {
    type: 'spiral',
    name: 'Spiral',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path
          d="M12 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2 .9-2 2 .9 2 2 2 2-.9 2-2"
          strokeLinecap="round"
        />
        <path
          d="M12 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4 1.8-4 4 1.8 4 4 4"
          strokeLinecap="round"
          strokeOpacity={0.5}
        />
      </svg>
    ),
  },
  {
    type: 'rose',
    name: 'Rose',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <ellipse cx="12" cy="7" rx="3" ry="5" />
        <ellipse cx="12" cy="17" rx="3" ry="5" />
        <ellipse cx="7" cy="12" rx="5" ry="3" />
        <ellipse cx="17" cy="12" rx="5" ry="3" />
      </svg>
    ),
  },
  {
    type: 'heart',
    name: 'Heart',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    ),
  },
];

/**
 * ShapeSelector displays a grid of shape options for pattern creation
 */
export const ShapeSelector: React.FC<ShapeSelectorProps> = ({
  selectedShape,
  onShapeSelect,
  className = '',
}) => {
  return (
    <div className={`shape-selector ${className}`}>
      <div className="grid grid-cols-3 gap-3">
        {shapeOptions.map((option) => {
          const isSelected = selectedShape === option.type;
          return (
            <button
              key={option.type}
              onClick={() => onShapeSelect(option.type)}
              className={`
                flex flex-col items-center justify-center
                min-h-[72px] p-3 rounded-xl
                transition-all duration-200
                ${
                  isSelected
                    ? 'bg-amber-500 text-white shadow-md scale-105'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                }
              `}
              aria-label={`Select ${option.name} shape`}
              aria-pressed={isSelected}
            >
              <div className="w-8 h-8 mb-1">{option.icon}</div>
              <span className="text-xs font-medium">{option.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ShapeSelector;
