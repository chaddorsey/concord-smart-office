/**
 * Preset Grid Component
 *
 * Grid of preset pattern cards with mini previews.
 * Shows preset name and estimated draw time. Tap to load into editor.
 */

import React, { useMemo, useCallback } from 'react';
import type { PatternPreset, PatternConfig, ThetaRhoPoint } from '../types';
import { getMainPresets, presetToConfig } from '../presets';
import { generatePattern } from '../services/patternGenerator';

interface PresetGridProps {
  /** Callback when preset is selected */
  onPresetSelect: (config: PatternConfig, preset: PatternPreset) => void;
  /** Currently selected preset ID (for highlighting) */
  selectedPresetId?: string;
  /** Show extended presets too */
  showExtended?: boolean;
  /** Layout mode: 'grid' (2 columns) or 'scroll' (horizontal scroll) */
  layout?: 'grid' | 'scroll';
  /** Optional CSS class names */
  className?: string;
}

interface PresetCardProps {
  preset: PatternPreset;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Generate mini SVG preview for a preset
 */
function generateMiniPreview(points: ThetaRhoPoint[], size: number = 60): string {
  if (points.length < 2) {
    return '';
  }

  const radius = size / 2 - 4;
  const center = size / 2;

  // Build path - sample points to keep SVG small
  const sampleRate = Math.max(1, Math.floor(points.length / 100));
  const sampledPoints = points.filter((_, i) => i % sampleRate === 0);

  let pathData = '';
  for (let i = 0; i < sampledPoints.length; i++) {
    const point = sampledPoints[i];
    const x = center + point.rho * radius * Math.cos(point.theta);
    const y = center - point.rho * radius * Math.sin(point.theta);

    if (i === 0) {
      pathData += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    } else {
      pathData += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }

  return pathData;
}

/**
 * Individual preset card component
 */
const PresetCard: React.FC<PresetCardProps> = ({ preset, isSelected, onSelect }) => {
  // Generate pattern and preview for this preset
  const { pathData, drawTime } = useMemo(() => {
    try {
      // For random preset, just show a placeholder
      if (preset.isRandom) {
        return { pathData: '', drawTime: '?' };
      }

      const config = presetToConfig(preset);
      const pattern = generatePattern(config);
      const path = generateMiniPreview(pattern.points);
      const time =
        pattern.estimatedDrawTimeMinutes < 1
          ? '<1'
          : pattern.estimatedDrawTimeMinutes.toFixed(0);

      return { pathData: path, drawTime: time };
    } catch (e) {
      console.error('Failed to generate preset preview:', e);
      return { pathData: '', drawTime: '?' };
    }
  }, [preset]);

  return (
    <button
      onClick={onSelect}
      className={`
        relative flex flex-col items-center p-3 rounded-xl
        transition-all duration-200
        min-w-[120px]
        ${
          isSelected
            ? 'bg-amber-100 ring-2 ring-amber-500 shadow-md'
            : 'bg-white border border-gray-200 hover:border-amber-300 hover:shadow-sm active:bg-gray-50'
        }
      `}
      aria-label={`Select ${preset.name} preset`}
      aria-pressed={isSelected}
    >
      {/* Mini Preview */}
      <div className="w-14 h-14 mb-2 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
        {preset.isRandom ? (
          // Random preset shows a special icon
          <svg
            className="w-8 h-8 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        ) : pathData ? (
          <svg
            width="60"
            height="60"
            viewBox="0 0 60 60"
            className="text-amber-600"
          >
            <circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.3"
            />
            <path
              d={pathData}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          // Fallback icon
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </div>

      {/* Preset Name */}
      <span className="text-sm font-medium text-gray-900 text-center leading-tight">
        {preset.name}
      </span>

      {/* Draw Time Estimate */}
      <span className="text-xs text-gray-500 mt-1">
        {preset.isRandom ? 'Surprise!' : `~${drawTime} min`}
      </span>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  );
};

/**
 * PresetGrid displays a collection of pattern presets
 */
export const PresetGrid: React.FC<PresetGridProps> = ({
  onPresetSelect,
  selectedPresetId,
  showExtended = false,
  layout = 'grid',
  className = '',
}) => {
  // Get presets to display
  const presets = useMemo(() => {
    return getMainPresets();
  }, [showExtended]);

  // Handle preset selection
  const handleSelect = useCallback(
    (preset: PatternPreset) => {
      const config = presetToConfig(preset);
      onPresetSelect(config, preset);
    },
    [onPresetSelect]
  );

  if (layout === 'scroll') {
    return (
      <div className={`preset-grid -mx-4 ${className}`}>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-hide">
          {presets.map((preset) => (
            <div key={preset.id} className="snap-start">
              <PresetCard
                preset={preset}
                isSelected={selectedPresetId === preset.id}
                onSelect={() => handleSelect(preset)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`preset-grid ${className}`}>
      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={() => handleSelect(preset)}
          />
        ))}
      </div>
    </div>
  );
};

export default PresetGrid;
