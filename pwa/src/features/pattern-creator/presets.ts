/**
 * Pattern Presets
 *
 * Curated preset patterns for the mobile Sandify pattern creator.
 * These presets provide a quick start for casual users.
 */

import type { PatternPreset, PatternConfig } from './types';
import { MOBILE_CONSTRAINTS } from './types';

/**
 * Curated preset patterns
 * Each preset is designed to create an aesthetically pleasing pattern
 * with reasonable draw time (typically 5-15 minutes)
 */
export const PATTERN_PRESETS: PatternPreset[] = [
  {
    id: 'classic-spiral',
    name: 'Classic Spiral',
    description: 'A simple, elegant outward spiral',
    shape: 'spiral',
    shapeParams: { turns: 10, tightness: 0.8 },
    loops: 1,
    growthFactor: 1,
    spinDegrees: 0,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'spinning-star',
    name: 'Spinning Star',
    description: 'A five-pointed star that twists as it grows',
    shape: 'star',
    shapeParams: { points: 5, innerRadius: 0.4 },
    loops: 30,
    growthFactor: 1.1,
    spinDegrees: 12,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'flower-bloom',
    name: 'Flower Bloom',
    description: 'Delicate petals spiraling outward like a blooming flower',
    shape: 'rose',
    shapeParams: { petals: 6, petalDepth: 0.5 },
    loops: 40,
    growthFactor: 1.08,
    spinDegrees: 6,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'hypnotic-hexagon',
    name: 'Hypnotic Hexagon',
    description: 'Mesmerizing hexagons rotating and growing',
    shape: 'polygon',
    shapeParams: { sides: 6 },
    loops: 50,
    growthFactor: 1.05,
    spinDegrees: 6,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'ocean-wave',
    name: 'Ocean Wave',
    description: 'Undulating waves like ripples on water',
    shape: 'circle',
    shapeParams: { lobes: 4 },
    loops: 35,
    growthFactor: 1.12,
    spinDegrees: 9,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'galaxy-swirl',
    name: 'Galaxy Swirl',
    description: 'A cosmic spiral with dramatic rotation',
    shape: 'spiral',
    shapeParams: { turns: 5, tightness: 0.6 },
    loops: 20,
    growthFactor: 1.15,
    spinDegrees: 18,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'zen-garden',
    name: 'Zen Garden',
    description: 'Simple, meditative concentric circles',
    shape: 'circle',
    shapeParams: { lobes: 0 },
    loops: 80,
    growthFactor: 1.02,
    spinDegrees: 0,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'random-magic',
    name: 'Random Magic',
    description: 'Surprise yourself with a randomly generated pattern',
    shape: 'circle', // Will be randomized
    shapeParams: {},
    loops: 25,
    growthFactor: 1.1,
    spinDegrees: 10,
    alternateDirection: false,
    startFromCenter: true,
    isRandom: true,
  },
];

/**
 * Additional preset options for users who want more variety
 */
export const EXTENDED_PRESETS: PatternPreset[] = [
  {
    id: 'love-heart',
    name: 'Love Heart',
    description: 'Hearts spiraling outward',
    shape: 'heart',
    shapeParams: {},
    loops: 25,
    growthFactor: 1.12,
    spinDegrees: 15,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'sacred-triangle',
    name: 'Sacred Triangle',
    description: 'Triangles rotating to form intricate patterns',
    shape: 'polygon',
    shapeParams: { sides: 3 },
    loops: 60,
    growthFactor: 1.04,
    spinDegrees: 4,
    alternateDirection: true,
    startFromCenter: true,
  },
  {
    id: 'square-dance',
    name: 'Square Dance',
    description: 'Squares alternating direction for a woven look',
    shape: 'polygon',
    shapeParams: { sides: 4 },
    loops: 45,
    growthFactor: 1.06,
    spinDegrees: 5,
    alternateDirection: true,
    startFromCenter: true,
  },
  {
    id: 'starburst',
    name: 'Starburst',
    description: 'An eight-pointed star expanding outward',
    shape: 'star',
    shapeParams: { points: 8, innerRadius: 0.5 },
    loops: 25,
    growthFactor: 1.15,
    spinDegrees: 7.5,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'wild-rose',
    name: 'Wild Rose',
    description: 'Many small petals creating a dense pattern',
    shape: 'rose',
    shapeParams: { petals: 9, petalDepth: 0.7 },
    loops: 30,
    growthFactor: 1.1,
    spinDegrees: 4,
    alternateDirection: false,
    startFromCenter: true,
  },
  {
    id: 'tight-coil',
    name: 'Tight Coil',
    description: 'A very tight spiral with many turns',
    shape: 'spiral',
    shapeParams: { turns: 15, tightness: 0.95 },
    loops: 1,
    growthFactor: 1,
    spinDegrees: 0,
    alternateDirection: false,
    startFromCenter: true,
  },
];

/**
 * Get all available presets (main + extended)
 */
export function getAllPresets(): PatternPreset[] {
  return [...PATTERN_PRESETS, ...EXTENDED_PRESETS];
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): PatternPreset | undefined {
  return getAllPresets().find((p) => p.id === id);
}

/**
 * Generate a random pattern configuration within safe ranges
 */
export function generateRandomConfig(): PatternConfig {
  const shapes: Array<'circle' | 'polygon' | 'star' | 'spiral' | 'rose' | 'heart'> = [
    'circle',
    'polygon',
    'star',
    'spiral',
    'rose',
    'heart',
  ];

  const shape = shapes[Math.floor(Math.random() * shapes.length)];

  // Generate shape-specific params
  const shapeParams = generateRandomShapeParams(shape);

  // Random loop parameters within mobile constraints
  const loops = randomInRange(
    MOBILE_CONSTRAINTS.loops.min,
    MOBILE_CONSTRAINTS.loops.max,
    MOBILE_CONSTRAINTS.loops.step
  );

  const growthFactor = randomInRange(
    MOBILE_CONSTRAINTS.growth.min,
    MOBILE_CONSTRAINTS.growth.max,
    MOBILE_CONSTRAINTS.growth.step
  );

  const spinDegrees = randomInRange(
    MOBILE_CONSTRAINTS.spin.min,
    MOBILE_CONSTRAINTS.spin.max,
    MOBILE_CONSTRAINTS.spin.step
  );

  const alternateDirection = Math.random() > 0.7; // 30% chance

  return {
    shape,
    shapeParams,
    loops,
    growthFactor,
    spinDegrees,
    alternateDirection,
    startFromCenter: true,
  };
}

/**
 * Generate random parameters for a specific shape
 */
function generateRandomShapeParams(shape: string): Record<string, number> {
  switch (shape) {
    case 'circle':
      return {
        lobes: randomInRange(
          MOBILE_CONSTRAINTS.circleLobes.min,
          MOBILE_CONSTRAINTS.circleLobes.max,
          MOBILE_CONSTRAINTS.circleLobes.step
        ),
      };
    case 'polygon':
      return {
        sides: randomInRange(
          MOBILE_CONSTRAINTS.polygonSides.min,
          MOBILE_CONSTRAINTS.polygonSides.max,
          MOBILE_CONSTRAINTS.polygonSides.step
        ),
      };
    case 'star':
      return {
        points: randomInRange(
          MOBILE_CONSTRAINTS.starPoints.min,
          MOBILE_CONSTRAINTS.starPoints.max,
          MOBILE_CONSTRAINTS.starPoints.step
        ),
        innerRadius: randomInRange(
          MOBILE_CONSTRAINTS.starInnerRadius.min,
          MOBILE_CONSTRAINTS.starInnerRadius.max,
          MOBILE_CONSTRAINTS.starInnerRadius.step
        ),
      };
    case 'spiral':
      return {
        turns: randomInRange(
          MOBILE_CONSTRAINTS.spiralTurns.min,
          MOBILE_CONSTRAINTS.spiralTurns.max,
          MOBILE_CONSTRAINTS.spiralTurns.step
        ),
        tightness: randomInRange(
          MOBILE_CONSTRAINTS.spiralTightness.min,
          MOBILE_CONSTRAINTS.spiralTightness.max,
          MOBILE_CONSTRAINTS.spiralTightness.step
        ),
      };
    case 'rose':
      return {
        petals: randomInRange(
          MOBILE_CONSTRAINTS.rosePetals.min,
          MOBILE_CONSTRAINTS.rosePetals.max,
          MOBILE_CONSTRAINTS.rosePetals.step
        ),
        petalDepth: randomInRange(
          MOBILE_CONSTRAINTS.rosePetalDepth.min,
          MOBILE_CONSTRAINTS.rosePetalDepth.max,
          MOBILE_CONSTRAINTS.rosePetalDepth.step
        ),
      };
    case 'heart':
      return {}; // Heart has no parameters
    default:
      return {};
  }
}

/**
 * Generate a random value within a range, snapped to step
 */
function randomInRange(min: number, max: number, step: number): number {
  const steps = Math.floor((max - min) / step);
  const randomSteps = Math.floor(Math.random() * (steps + 1));
  const value = min + randomSteps * step;
  // Round to avoid floating point issues
  return Math.round(value * 100) / 100;
}

/**
 * Convert a preset to a PatternConfig
 */
export function presetToConfig(preset: PatternPreset): PatternConfig {
  if (preset.isRandom) {
    return generateRandomConfig();
  }

  return {
    shape: preset.shape,
    shapeParams: { ...preset.shapeParams },
    loops: preset.loops,
    growthFactor: preset.growthFactor,
    spinDegrees: preset.spinDegrees,
    alternateDirection: preset.alternateDirection,
    startFromCenter: preset.startFromCenter,
  };
}

/**
 * Get the main 8 presets for the quick select grid
 */
export function getMainPresets(): PatternPreset[] {
  return PATTERN_PRESETS;
}
