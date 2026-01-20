/**
 * Parameter Controls Component
 *
 * Panel with all configurable pattern parameters including shape-specific
 * options and a collapsible "Advanced" section.
 */

import React, { useState, useCallback } from 'react';
import type { PatternConfig, ShapeType } from '../types';
import { MOBILE_CONSTRAINTS } from '../types';
import { ParameterSlider } from './ParameterSlider';

interface ParameterControlsProps {
  /** Current pattern configuration */
  config: PatternConfig;
  /** Callback when any parameter changes */
  onChange: (config: PatternConfig) => void;
  /** Optional CSS class names */
  className?: string;
}

/**
 * Get shape-specific parameter definitions
 */
function getShapeParams(shape: ShapeType): Array<{
  key: string;
  label: string;
  constraint: keyof typeof MOBILE_CONSTRAINTS;
  unit?: string;
  description?: string;
}> {
  switch (shape) {
    case 'circle':
      return [
        {
          key: 'lobes',
          label: 'Lobes',
          constraint: 'circleLobes',
          description: 'Number of wavy lobes (0 = smooth circle)',
        },
      ];
    case 'polygon':
      return [
        {
          key: 'sides',
          label: 'Sides',
          constraint: 'polygonSides',
          description: '3 = triangle, 4 = square, 6 = hexagon',
        },
      ];
    case 'star':
      return [
        {
          key: 'points',
          label: 'Points',
          constraint: 'starPoints',
          description: 'Number of star points',
        },
        {
          key: 'innerRadius',
          label: 'Point Depth',
          constraint: 'starInnerRadius',
          description: 'How deep the star points go (lower = deeper)',
        },
      ];
    case 'spiral':
      return [
        {
          key: 'turns',
          label: 'Turns',
          constraint: 'spiralTurns',
          description: 'Number of spiral rotations',
        },
        {
          key: 'tightness',
          label: 'Tightness',
          constraint: 'spiralTightness',
          description: 'How tight the coils are at the center',
        },
      ];
    case 'rose':
      return [
        {
          key: 'petals',
          label: 'Petals',
          constraint: 'rosePetals',
          description: 'Number of petals',
        },
        {
          key: 'petalDepth',
          label: 'Petal Depth',
          constraint: 'rosePetalDepth',
          description: 'How pronounced the petals are',
        },
      ];
    case 'heart':
      // Heart has no additional parameters
      return [];
    default:
      return [];
  }
}

/**
 * ParameterControls provides sliders for all pattern parameters
 */
export const ParameterControls: React.FC<ParameterControlsProps> = ({
  config,
  onChange,
  className = '',
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Update a single parameter value
  const updateParam = useCallback(
    <K extends keyof PatternConfig>(key: K, value: PatternConfig[K]) => {
      onChange({ ...config, [key]: value });
    },
    [config, onChange]
  );

  // Update a shape-specific parameter
  const updateShapeParam = useCallback(
    (key: string, value: number) => {
      onChange({
        ...config,
        shapeParams: {
          ...config.shapeParams,
          [key]: value,
        },
      });
    },
    [config, onChange]
  );

  // Get current shape's parameters
  const shapeParams = getShapeParams(config.shape);

  return (
    <div className={`parameter-controls space-y-6 ${className}`}>
      {/* Main Loop Parameters */}
      <div className="space-y-5">
        <ParameterSlider
          label="Loops"
          value={config.loops}
          min={MOBILE_CONSTRAINTS.loops.min}
          max={MOBILE_CONSTRAINTS.loops.max}
          step={MOBILE_CONSTRAINTS.loops.step}
          onChange={(value) => updateParam('loops', value)}
          description="How many times the shape repeats"
        />

        <ParameterSlider
          label="Growth"
          value={config.growthFactor}
          min={MOBILE_CONSTRAINTS.growth.min}
          max={MOBILE_CONSTRAINTS.growth.max}
          step={MOBILE_CONSTRAINTS.growth.step}
          onChange={(value) => updateParam('growthFactor', value)}
          decimals={1}
          unit="x"
          description="How much each loop grows (1.0 = same size)"
        />

        <ParameterSlider
          label="Spin"
          value={config.spinDegrees}
          min={MOBILE_CONSTRAINTS.spin.min}
          max={MOBILE_CONSTRAINTS.spin.max}
          step={MOBILE_CONSTRAINTS.spin.step}
          onChange={(value) => updateParam('spinDegrees', value)}
          unit="deg"
          description="Rotation between each loop"
        />
      </div>

      {/* Shape-Specific Parameters */}
      {shapeParams.length > 0 && (
        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {config.shape} Settings
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {shapeParams.map((param) => {
            const constraint = MOBILE_CONSTRAINTS[param.constraint];
            const value =
              (config.shapeParams[param.key as keyof typeof config.shapeParams] as number) ??
              constraint.default;

            return (
              <ParameterSlider
                key={param.key}
                label={param.label}
                value={value}
                min={constraint.min}
                max={constraint.max}
                step={constraint.step}
                onChange={(v) => updateShapeParam(param.key, v)}
                unit={param.unit}
                description={param.description}
                decimals={constraint.step < 1 ? 2 : 0}
              />
            );
          })}
        </div>
      )}

      {/* Advanced Section (Collapsible) */}
      <div className="pt-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          aria-expanded={showAdvanced}
        >
          <span>Advanced Options</span>
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${
              showAdvanced ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showAdvanced && (
          <div className="space-y-4 pb-2 animate-fadeIn">
            {/* Alternate Direction Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Alternate Direction
                </span>
                <p className="text-xs text-gray-500">
                  Reverse every other loop for a woven effect
                </p>
              </div>
              <button
                onClick={() => updateParam('alternateDirection', !config.alternateDirection)}
                className={`
                  relative w-12 h-7 rounded-full transition-colors duration-200
                  ${config.alternateDirection ? 'bg-amber-500' : 'bg-gray-300'}
                `}
                role="switch"
                aria-checked={config.alternateDirection}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md
                    transition-transform duration-200
                    ${config.alternateDirection ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>

            {/* Start From Center Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  Start From Center
                </span>
                <p className="text-xs text-gray-500">
                  Begin drawing from the center of the table
                </p>
              </div>
              <button
                onClick={() => updateParam('startFromCenter', !config.startFromCenter)}
                className={`
                  relative w-12 h-7 rounded-full transition-colors duration-200
                  ${config.startFromCenter ? 'bg-amber-500' : 'bg-gray-300'}
                `}
                role="switch"
                aria-checked={config.startFromCenter}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md
                    transition-transform duration-200
                    ${config.startFromCenter ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParameterControls;
