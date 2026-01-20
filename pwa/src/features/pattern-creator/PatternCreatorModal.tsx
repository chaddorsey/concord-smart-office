/**
 * Pattern Creator Modal - Light Theme
 *
 * Matches the app's light mode styling and uses a modal popup
 * similar to the pattern browser for UI consistency.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { PatternConfig, GeneratedPattern, ShapeType } from './types';
import { DEFAULT_PATTERN_CONFIG, MOBILE_CONSTRAINTS } from './types';
import { generatePattern, exportThetaRho, generatePreviewSvg } from './services/patternGenerator';
import { PatternPreview } from './components';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Shape options with icons
const SHAPES: { type: ShapeType; icon: string; label: string }[] = [
  { type: 'circle', icon: '○', label: 'Circle' },
  { type: 'polygon', icon: '⬡', label: 'Polygon' },
  { type: 'star', icon: '★', label: 'Star' },
  { type: 'spiral', icon: '🌀', label: 'Spiral' },
  { type: 'rose', icon: '✿', label: 'Rose' },
  { type: 'heart', icon: '♥', label: 'Heart' },
];

interface PatternCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatternCreated?: () => void;
}

export const PatternCreatorModal: React.FC<PatternCreatorModalProps> = ({
  isOpen,
  onClose,
  onPatternCreated,
}) => {
  const [config, setConfig] = useState<PatternConfig>(DEFAULT_PATTERN_CONFIG);
  const [patternName, setPatternName] = useState('My Pattern');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Generate pattern from current config
  const generatedPattern: GeneratedPattern = useMemo(() => {
    try {
      return generatePattern(config);
    } catch (e) {
      console.error('Pattern generation failed:', e);
      return { points: [], flavor: '00', estimatedDrawTimeMinutes: 0, pointCount: 0 };
    }
  }, [config]);

  // Update a single config value
  const updateConfig = useCallback((key: keyof PatternConfig, value: number | string | boolean | object) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Update shape params
  const updateShapeParam = useCallback((param: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      shapeParams: { ...prev.shapeParams, [param]: value }
    }));
  }, []);

  // Handle shape selection
  const handleShapeSelect = useCallback((shape: ShapeType) => {
    setConfig(prev => ({ ...prev, shape, shapeParams: {} }));
  }, []);

  // Reset form
  const handleReset = useCallback(() => {
    setConfig(DEFAULT_PATTERN_CONFIG);
    setPatternName('My Pattern');
    setSaveStatus(null);
  }, []);

  // Save and submit pattern to queue
  const handleSubmit = useCallback(async () => {
    if (!patternName.trim()) {
      setSaveStatus('Enter a name first');
      return;
    }

    setIsSaving(true);
    setSaveStatus('Submitting...');

    try {
      const thetaRhoData = exportThetaRho(generatedPattern.points, patternName);
      const previewSvg = generatePreviewSvg(generatedPattern.points, 200);

      const saveResponse = await fetch(`${API_BASE}/api/oasis/custom-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: patternName, thetaRhoData, previewSvg, config }),
      });

      if (!saveResponse.ok) {
        const error = await saveResponse.json();
        throw new Error(error.error || 'Failed to save');
      }

      const saved = await saveResponse.json();

      await fetch(`${API_BASE}/api/oasis/custom-patterns/${saved.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      setSaveStatus('Added to queue!');
      onPatternCreated?.();
      setTimeout(() => {
        handleReset();
        onClose();
      }, 1000);
    } catch (error) {
      setSaveStatus(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsSaving(false);
    }
  }, [patternName, config, generatedPattern.points, onClose, onPatternCreated, handleReset]);

  // Get shape-specific params
  const shapeParams = config.shapeParams || {};

  // Complexity warning thresholds
  const isHighlyComplex = generatedPattern.pointCount > 3000;
  const isModeratelyComplex = generatedPattern.pointCount > 2000 && !isHighlyComplex;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Create Pattern</h2>
            <p className={`text-xs ${
              isHighlyComplex ? 'text-red-600 font-medium' :
              isModeratelyComplex ? 'text-amber-600' :
              'text-gray-400'
            }`}>
              {isHighlyComplex ? 'Very complex — may take a long time' :
               isModeratelyComplex ? 'Complex — will take longer to draw' :
               'Design your pattern'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Toast */}
        {saveStatus && (
          <div className={`mx-4 mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
            saveStatus.includes('Error') ? 'bg-red-100 text-red-700' :
            saveStatus.includes('Added') ? 'bg-green-100 text-green-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {saveStatus}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Pattern Name Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pattern Name</label>
            <input
              type="text"
              value={patternName}
              onChange={(e) => setPatternName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="My Pattern"
            />
          </div>

          {/* Preview - Centered */}
          <div className="flex justify-center">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100">
              <PatternPreview
                points={generatedPattern.points}
                size={140}
                isAnimating={false}
                showBall={false}
                backgroundColor="#fefce8"
                boundaryColor="#fbbf24"
                lineColor="#d97706"
              />
            </div>
          </div>

          {/* Shape Selector - Horizontal scroll */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shape</label>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {SHAPES.map(({ type, icon, label }) => (
                <button
                  key={type}
                  onClick={() => handleShapeSelect(type)}
                  className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 transition border ${
                    config.shape === type
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-amber-50 hover:border-amber-200'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="text-[10px]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-200">
            {/* Core Parameters */}
            <div className="grid grid-cols-2 gap-4">
              <CompactSlider
                label="Loops"
                value={config.loops}
                min={MOBILE_CONSTRAINTS.loops.min}
                max={MOBILE_CONSTRAINTS.loops.max}
                onChange={(v) => updateConfig('loops', v)}
              />
              <CompactSlider
                label="Growth"
                value={config.growthFactor}
                min={MOBILE_CONSTRAINTS.growth.min}
                max={MOBILE_CONSTRAINTS.growth.max}
                step={0.1}
                onChange={(v) => updateConfig('growthFactor', v)}
              />
              <CompactSlider
                label="Spin"
                value={config.spinDegrees}
                min={MOBILE_CONSTRAINTS.spin.min}
                max={MOBILE_CONSTRAINTS.spin.max}
                onChange={(v) => updateConfig('spinDegrees', v)}
              />

              {/* Shape-specific params */}
              {config.shape === 'polygon' && (
                <CompactSlider
                  label="Sides"
                  value={shapeParams.sides ?? 6}
                  min={3}
                  max={12}
                  onChange={(v) => updateShapeParam('sides', v)}
                />
              )}
              {config.shape === 'star' && (
                <>
                  <CompactSlider
                    label="Points"
                    value={shapeParams.points ?? 5}
                    min={3}
                    max={12}
                    onChange={(v) => updateShapeParam('points', v)}
                  />
                  <CompactSlider
                    label="Depth"
                    value={shapeParams.innerRadius ?? 0.4}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    onChange={(v) => updateShapeParam('innerRadius', v)}
                  />
                </>
              )}
              {config.shape === 'spiral' && (
                <>
                  <CompactSlider
                    label="Turns"
                    value={shapeParams.turns ?? 8}
                    min={2}
                    max={20}
                    onChange={(v) => updateShapeParam('turns', v)}
                  />
                  <CompactSlider
                    label="Tight"
                    value={shapeParams.tightness ?? 0.8}
                    min={0.2}
                    max={1.5}
                    step={0.1}
                    onChange={(v) => updateShapeParam('tightness', v)}
                  />
                </>
              )}
              {config.shape === 'rose' && (
                <>
                  <CompactSlider
                    label="Petals"
                    value={shapeParams.petals ?? 5}
                    min={2}
                    max={12}
                    onChange={(v) => updateShapeParam('petals', v)}
                  />
                  <CompactSlider
                    label="Depth"
                    value={shapeParams.petalDepth ?? 0.5}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onChange={(v) => updateShapeParam('petalDepth', v)}
                  />
                </>
              )}
              {config.shape === 'circle' && (
                <CompactSlider
                  label="Lobes"
                  value={shapeParams.lobes ?? 0}
                  min={0}
                  max={12}
                  onChange={(v) => updateShapeParam('lobes', v)}
                />
              )}
            </div>

            {/* Toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={config.alternateDirection}
                onChange={(e) => updateConfig('alternateDirection', e.target.checked)}
                className="w-4 h-4 rounded bg-white border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              Alternate direction
            </label>
          </div>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="border-t border-gray-100 p-4 flex gap-3 bg-gray-50">
          <button
            onClick={handleReset}
            className="px-4 py-2.5 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-100 transition border border-gray-200"
          >
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !patternName.trim()}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Submitting...' : 'Add to Queue'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Compact slider component - Light theme
interface CompactSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

const CompactSlider: React.FC<CompactSliderProps> = ({ label, value, min, max, step = 1, onChange }) => {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700 font-medium">{step < 1 ? value.toFixed(2) : value}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-amber-500
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );
};

export default PatternCreatorModal;
