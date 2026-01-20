/**
 * Pattern Creator - Compact Mobile Layout
 *
 * Redesigned for iPhone screens - preview and controls visible together
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PatternConfig, GeneratedPattern, ShapeType } from './types';
import { DEFAULT_PATTERN_CONFIG, MOBILE_CONSTRAINTS } from './types';
import { generatePattern, exportThetaRho, generatePreviewSvg } from './services/patternGenerator';
import { PatternPreview } from './components';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Compact shape icons
const SHAPES: { type: ShapeType; icon: string; label: string }[] = [
  { type: 'circle', icon: '○', label: 'Circle' },
  { type: 'polygon', icon: '⬡', label: 'Polygon' },
  { type: 'star', icon: '★', label: 'Star' },
  { type: 'spiral', icon: '🌀', label: 'Spiral' },
  { type: 'rose', icon: '✿', label: 'Rose' },
  { type: 'heart', icon: '♥', label: 'Heart' },
];

export const PatternCreatorDemo: React.FC = () => {
  const navigate = useNavigate();

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
      setTimeout(() => navigate('/sand'), 1000);
    } catch (error) {
      setSaveStatus(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsSaving(false);
    }
  }, [patternName, config, generatedPattern.points, navigate]);

  // Get shape-specific params
  const shapeParams = config.shapeParams || {};

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Compact Header */}
      <header className="flex items-center justify-between px-3 py-2 bg-gray-800/80 backdrop-blur sticky top-0 z-20">
        <Link to="/sand" className="p-2 -ml-2 hover:bg-white/10 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <input
          type="text"
          value={patternName}
          onChange={(e) => setPatternName(e.target.value)}
          className="flex-1 mx-3 px-3 py-1.5 bg-gray-700 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Pattern name"
        />
        <span className="text-xs text-gray-400">~{generatedPattern.estimatedDrawTimeMinutes}m</span>
      </header>

      {/* Status Toast */}
      {saveStatus && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-lg text-xs font-medium text-center ${
          saveStatus.includes('Error') ? 'bg-red-500/20 text-red-300' :
          saveStatus.includes('Added') ? 'bg-green-500/20 text-green-300' :
          'bg-amber-500/20 text-amber-300'
        }`}>
          {saveStatus}
        </div>
      )}

      {/* Main Content - Preview + Controls side by side on larger phones, stacked on small */}
      <main className="flex-1 p-3 overflow-auto">
        <div className="flex flex-col gap-3">

          {/* Preview - Centered, compact */}
          <div className="flex justify-center">
            <div className="bg-gray-800 rounded-xl p-3">
              <PatternPreview
                points={generatedPattern.points}
                size={160}
                isAnimating={false}
                showBall={false}
              />
            </div>
          </div>

          {/* Shape Selector - Horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
            {SHAPES.map(({ type, icon, label }) => (
              <button
                key={type}
                onClick={() => handleShapeSelect(type)}
                className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 transition ${
                  config.shape === type
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <span className="text-xl">{icon}</span>
                <span className="text-[10px]">{label}</span>
              </button>
            ))}
          </div>

          {/* Compact Sliders */}
          <div className="bg-gray-800 rounded-xl p-3 space-y-3">
            {/* Core Parameters */}
            <div className="grid grid-cols-2 gap-3">
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
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={config.alternateDirection}
                onChange={(e) => updateConfig('alternateDirection', e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
              />
              Alternate direction
            </label>
          </div>
        </div>
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="sticky bottom-0 bg-gray-800/95 backdrop-blur border-t border-gray-700 p-3 flex gap-3">
        <button
          onClick={() => {
            setConfig(DEFAULT_PATTERN_CONFIG);
            setPatternName('My Pattern');
          }}
          className="px-4 py-2.5 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-600 transition"
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || !patternName.trim()}
          className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-purple-500 hover:to-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Submitting...' : 'Add to Queue'}
        </button>
      </div>
    </div>
  );
};

// Compact slider component
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
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-medium">{step < 1 ? value.toFixed(2) : value}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-purple-500
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );
};

export default PatternCreatorDemo;
