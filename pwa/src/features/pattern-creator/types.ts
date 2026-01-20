/**
 * Pattern Creator Types
 *
 * Type definitions for the mobile Sandify pattern creator.
 * These types define the shape parameters, pattern configuration,
 * and theta-rho coordinate system used by Oasis Mini sand tables.
 */

/**
 * Available shape types for pattern generation
 */
export type ShapeType = 'circle' | 'polygon' | 'star' | 'spiral' | 'rose' | 'heart';

/**
 * Parameters specific to each shape type
 */
export interface ShapeParams {
  // Circle - basic circle with optional lobes (wave effect)
  lobes?: number;

  // Polygon - triangles, squares, pentagons, etc.
  sides?: number;

  // Star - multi-pointed star
  points?: number;
  innerRadius?: number; // 0-1, depth of the star points

  // Spiral - Archimedean spiral
  turns?: number;
  tightness?: number; // 0-1, how tight the spiral coils

  // Rose - mathematical rose curves
  petals?: number;
  petalDepth?: number; // 0-1, how pronounced the petals are

  // Heart - fixed geometry, scale only
  // No additional params needed
}

/**
 * Complete pattern configuration
 */
export interface PatternConfig {
  shape: ShapeType;
  shapeParams: ShapeParams;
  loops: number;
  growthFactor: number;
  spinDegrees: number;
  alternateDirection: boolean;
  startFromCenter: boolean;
}

/**
 * A point in theta-rho (polar) coordinate system
 * Used by Oasis Mini / Sisyphus tables
 */
export interface ThetaRhoPoint {
  theta: number;  // Angular position in radians (accumulates, doesn't wrap at 2pi)
  rho: number;    // Radial distance from center, normalized 0-1
}

/**
 * A point in Cartesian coordinates
 * Used for intermediate calculations and shape generation
 */
export interface CartesianPoint {
  x: number;
  y: number;
}

/**
 * Track flavor - defines where pattern starts and ends
 * 00: center to center
 * 01: center to edge
 * 10: edge to center
 * 11: edge to edge
 */
export type TrackFlavor = '00' | '01' | '10' | '11';

/**
 * Result of pattern generation
 */
export interface GeneratedPattern {
  points: ThetaRhoPoint[];
  flavor: TrackFlavor;
  estimatedDrawTimeMinutes: number;
  pointCount: number;
}

/**
 * Pattern preset definition
 */
export interface PatternPreset {
  id: string;
  name: string;
  description: string;
  shape: ShapeType;
  shapeParams: ShapeParams;
  loops: number;
  growthFactor: number;
  spinDegrees: number;
  alternateDirection: boolean;
  startFromCenter: boolean;
  isRandom?: boolean;
}

/**
 * Constraints for mobile-friendly parameter ranges
 */
export interface ParameterConstraints {
  min: number;
  max: number;
  default: number;
  step: number;
}

/**
 * All parameter constraints for the mobile UI
 */
export interface MobileConstraints {
  loops: ParameterConstraints;
  growth: ParameterConstraints;
  spin: ParameterConstraints;
  polygonSides: ParameterConstraints;
  starPoints: ParameterConstraints;
  starInnerRadius: ParameterConstraints;
  spiralTurns: ParameterConstraints;
  spiralTightness: ParameterConstraints;
  rosePetals: ParameterConstraints;
  rosePetalDepth: ParameterConstraints;
  circleLobes: ParameterConstraints;
}

/**
 * Default constraints for mobile UI
 */
export const MOBILE_CONSTRAINTS: MobileConstraints = {
  loops: { min: 5, max: 100, default: 25, step: 5 },
  growth: { min: 0.5, max: 3.0, default: 1.2, step: 0.1 },
  spin: { min: 0, max: 45, default: 10, step: 1 },
  polygonSides: { min: 3, max: 12, default: 6, step: 1 },
  starPoints: { min: 3, max: 12, default: 5, step: 1 },
  starInnerRadius: { min: 0.2, max: 0.8, default: 0.4, step: 0.05 },
  spiralTurns: { min: 3, max: 20, default: 8, step: 1 },
  spiralTightness: { min: 0.3, max: 1.0, default: 0.8, step: 0.1 },
  rosePetals: { min: 3, max: 12, default: 5, step: 1 },
  rosePetalDepth: { min: 0.3, max: 1.0, default: 0.5, step: 0.1 },
  circleLobes: { min: 0, max: 8, default: 0, step: 1 },
};

/**
 * Default pattern configuration
 */
export const DEFAULT_PATTERN_CONFIG: PatternConfig = {
  shape: 'circle',
  shapeParams: { lobes: 0 },
  loops: MOBILE_CONSTRAINTS.loops.default,
  growthFactor: MOBILE_CONSTRAINTS.growth.default,
  spinDegrees: MOBILE_CONSTRAINTS.spin.default,
  alternateDirection: false,
  startFromCenter: true,
};

/**
 * Animation state for preview playback
 */
export interface AnimationState {
  isPlaying: boolean;
  progress: number; // 0-1
  currentPointIndex: number;
  playbackSpeed: number; // multiplier, 1 = normal
}

/**
 * Pattern submission to queue
 */
export interface PatternSubmission {
  name: string;
  config: PatternConfig;
  thetaRhoData: string;
  previewSvg: string;
}
