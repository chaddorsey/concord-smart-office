/**
 * Pattern Generator Service
 *
 * Core pattern generation algorithms for the mobile Sandify pattern creator.
 * Generates theta-rho coordinates for Oasis Mini sand tables.
 *
 * Based on Sandify (https://github.com/jeffeb3/sandify) algorithms,
 * simplified for mobile use.
 */

import type {
  PatternConfig,
  ThetaRhoPoint,
  CartesianPoint,
  GeneratedPattern,
  TrackFlavor,
  ShapeType,
  ShapeParams,
} from '../types';

// Constants
const TWO_PI = Math.PI * 2;
const MIN_POINTS_PER_SHAPE = 60; // Minimum points for any shape
const BALL_SPEED_MM_PER_SECOND = 2.5; // Approximate Oasis ball speed
const TABLE_DIAMETER_MM = 380; // Oasis Mini diameter

/**
 * Generate a complete pattern from configuration
 */
export function generatePattern(config: PatternConfig): GeneratedPattern {
  // Generate the base shape in Cartesian coordinates
  const baseShape = generateShape(config.shape, config.shapeParams);

  // Apply loop transformation
  const transformedPoints = applyLoopTransform(
    baseShape,
    config.loops,
    config.growthFactor,
    config.spinDegrees,
    config.alternateDirection
  );

  // Convert to theta-rho coordinates
  let thetaRhoPoints = cartesianToThetaRho(transformedPoints);

  // Add transition from center if starting from center
  if (config.startFromCenter) {
    thetaRhoPoints = addCenterStart(thetaRhoPoints);
  }

  // Ensure pattern ends properly (at center or edge)
  thetaRhoPoints = ensureProperEnding(thetaRhoPoints, config.startFromCenter);

  // Determine track flavor
  const flavor = determineTrackFlavor(thetaRhoPoints);

  // Estimate draw time
  const estimatedDrawTimeMinutes = estimateDrawTime(thetaRhoPoints);

  return {
    points: thetaRhoPoints,
    flavor,
    estimatedDrawTimeMinutes,
    pointCount: thetaRhoPoints.length,
  };
}

/**
 * Generate base shape in Cartesian coordinates
 */
export function generateShape(
  shape: ShapeType,
  params: ShapeParams
): CartesianPoint[] {
  switch (shape) {
    case 'circle':
      return generateCircle(params.lobes ?? 0);
    case 'polygon':
      return generatePolygon(params.sides ?? 6);
    case 'star':
      return generateStar(params.points ?? 5, params.innerRadius ?? 0.4);
    case 'spiral':
      return generateSpiral(params.turns ?? 8, params.tightness ?? 0.8);
    case 'rose':
      return generateRose(params.petals ?? 5, params.petalDepth ?? 0.5);
    case 'heart':
      return generateHeart();
    default:
      return generateCircle(0);
  }
}

/**
 * Generate a circle with optional lobes (wave effect)
 * Lobes create a flower-like wavy edge
 */
export function generateCircle(lobes: number = 0): CartesianPoint[] {
  const points: CartesianPoint[] = [];
  const numPoints = Math.max(MIN_POINTS_PER_SHAPE, lobes > 0 ? lobes * 20 : 60);

  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * TWO_PI;

    // Base radius of 1, with optional lobe modulation
    let radius = 1;
    if (lobes > 0) {
      // Lobes create a flower-like wavy edge
      radius = 1 + 0.2 * Math.sin(lobes * t);
    }

    points.push({
      x: radius * Math.cos(t),
      y: radius * Math.sin(t),
    });
  }

  return points;
}

/**
 * Generate a regular polygon (triangle, square, pentagon, etc.)
 */
export function generatePolygon(sides: number): CartesianPoint[] {
  const points: CartesianPoint[] = [];
  const pointsPerSide = Math.max(20, Math.floor(60 / sides));

  for (let i = 0; i < sides; i++) {
    const startAngle = (i / sides) * TWO_PI - Math.PI / 2; // Start at top
    const endAngle = ((i + 1) / sides) * TWO_PI - Math.PI / 2;

    const startX = Math.cos(startAngle);
    const startY = Math.sin(startAngle);
    const endX = Math.cos(endAngle);
    const endY = Math.sin(endAngle);

    // Interpolate along each edge
    for (let j = 0; j <= pointsPerSide; j++) {
      const t = j / pointsPerSide;
      points.push({
        x: startX + t * (endX - startX),
        y: startY + t * (endY - startY),
      });
    }
  }

  return points;
}

/**
 * Generate a star shape
 * innerRadius controls the depth of the star points (0-1)
 */
export function generateStar(numPoints: number, innerRadius: number): CartesianPoint[] {
  const points: CartesianPoint[] = [];
  const totalVertices = numPoints * 2;
  const pointsPerSegment = 15;

  for (let i = 0; i < totalVertices; i++) {
    const angle1 = (i / totalVertices) * TWO_PI - Math.PI / 2;
    const angle2 = ((i + 1) / totalVertices) * TWO_PI - Math.PI / 2;

    // Alternate between outer (1) and inner radius
    const radius1 = i % 2 === 0 ? 1 : innerRadius;
    const radius2 = (i + 1) % 2 === 0 ? 1 : innerRadius;

    const x1 = radius1 * Math.cos(angle1);
    const y1 = radius1 * Math.sin(angle1);
    const x2 = radius2 * Math.cos(angle2);
    const y2 = radius2 * Math.sin(angle2);

    // Interpolate along edge
    for (let j = 0; j <= pointsPerSegment; j++) {
      const t = j / pointsPerSegment;
      points.push({
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      });
    }
  }

  return points;
}

/**
 * Generate an Archimedean spiral
 * The spiral naturally produces theta-rho points, but we convert to Cartesian
 * for consistency with the transform pipeline
 */
export function generateSpiral(turns: number, tightness: number): CartesianPoint[] {
  const points: CartesianPoint[] = [];
  const numPoints = turns * 60;
  const maxTheta = turns * TWO_PI;

  // Tightness affects how quickly the spiral expands
  // Higher tightness = tighter coils at the start
  const tightnessExponent = 0.5 + tightness * 1.5;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const theta = t * maxTheta;

    // Radius grows from 0 to 1 with tightness curve
    const radius = Math.pow(t, tightnessExponent);

    points.push({
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
    });
  }

  return points;
}

/**
 * Generate a mathematical rose curve
 * Rose curves are defined by r = cos(k * theta)
 * petals: number of petals (odd = petals, even = 2*petals)
 * petalDepth: how pronounced the petals are (0-1)
 */
export function generateRose(petals: number, petalDepth: number): CartesianPoint[] {
  const points: CartesianPoint[] = [];

  // Determine how many rotations needed for a complete rose
  // For k = n/d in lowest terms, need d * pi rotations for odd n, 2*d*pi for even n
  const rotations = petals % 2 === 0 ? 2 : 1;
  const numPoints = petals * rotations * 60;
  const maxTheta = rotations * TWO_PI;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const theta = t * maxTheta;

    // Rose curve: r = cos(k * theta), modified with depth control
    // petalDepth controls the minimum radius (1 = full petals, 0 = circle)
    const minRadius = 1 - petalDepth;
    const radius = minRadius + petalDepth * Math.abs(Math.cos(petals * theta));

    points.push({
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
    });
  }

  return points;
}

/**
 * Generate a heart shape using parametric equations
 */
export function generateHeart(): CartesianPoint[] {
  const points: CartesianPoint[] = [];
  const numPoints = 120;

  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * TWO_PI;

    // Parametric heart curve
    // x = 16 * sin^3(t)
    // y = 13*cos(t) - 5*cos(2t) - 2*cos(3t) - cos(4t)
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

    // Normalize to fit in unit circle (heart spans roughly -17 to 17)
    // Also flip and rotate so heart points up
    points.push({
      x: x / 17,
      y: -y / 17, // Flip to point up
    });
  }

  return points;
}

/**
 * Apply loop transformation to base shape
 * Creates the pattern by repeating the shape with growth, spin, and optional alternation
 */
export function applyLoopTransform(
  baseShape: CartesianPoint[],
  loops: number,
  growthFactor: number,
  spinDegrees: number,
  alternate: boolean
): CartesianPoint[] {
  const result: CartesianPoint[] = [];
  const spinRadians = (spinDegrees * Math.PI) / 180;

  // Calculate initial scale so the first loop is visible
  // and the last loop fills the space (rho approaches 1)
  const totalGrowth = Math.pow(growthFactor, loops - 1);
  const initialScale = 1 / totalGrowth;

  for (let loop = 0; loop < loops; loop++) {
    const scale = initialScale * Math.pow(growthFactor, loop);
    const rotation = loop * spinRadians;

    // Determine direction for this loop
    const direction = alternate && loop % 2 === 1 ? -1 : 1;

    // Transform each point in the base shape
    const shapePoints = direction === -1 ? [...baseShape].reverse() : baseShape;

    for (const point of shapePoints) {
      // Scale
      let x = point.x * scale;
      let y = point.y * scale;

      // Rotate
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;

      result.push({
        x: rotatedX,
        y: rotatedY,
      });
    }
  }

  return result;
}

/**
 * Convert Cartesian coordinates to theta-rho (polar) coordinates
 * Theta accumulates (doesn't wrap at 2*pi) for continuous paths
 */
export function cartesianToThetaRho(points: CartesianPoint[]): ThetaRhoPoint[] {
  if (points.length === 0) return [];

  const result: ThetaRhoPoint[] = [];
  let accumulatedTheta = 0;
  let lastAngle = Math.atan2(points[0].y, points[0].x);

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const rho = Math.sqrt(point.x * point.x + point.y * point.y);
    const currentAngle = Math.atan2(point.y, point.x);

    if (i === 0) {
      accumulatedTheta = currentAngle;
    } else {
      // Calculate angle difference, handling wraparound
      let angleDiff = currentAngle - lastAngle;

      // Normalize to [-pi, pi]
      while (angleDiff > Math.PI) angleDiff -= TWO_PI;
      while (angleDiff < -Math.PI) angleDiff += TWO_PI;

      accumulatedTheta += angleDiff;
    }

    lastAngle = currentAngle;

    // Clamp rho to valid range
    const clampedRho = Math.max(0, Math.min(1, rho));

    result.push({
      theta: accumulatedTheta,
      rho: clampedRho,
    });
  }

  return result;
}

/**
 * Convert theta-rho to Cartesian coordinates (for preview rendering)
 */
export function thetaRhoToCartesian(
  theta: number,
  rho: number,
  radius: number = 1
): CartesianPoint {
  return {
    x: rho * radius * Math.cos(theta),
    y: rho * radius * Math.sin(theta),
  };
}

/**
 * Add a spiral transition from center to the pattern's starting point
 */
function addCenterStart(points: ThetaRhoPoint[]): ThetaRhoPoint[] {
  if (points.length === 0) return points;

  const firstPoint = points[0];

  // If already at center, no transition needed
  if (firstPoint.rho < 0.01) return points;

  // Create spiral from center to first point
  const transitionPoints: ThetaRhoPoint[] = [];
  const numTransitionPoints = 30;

  for (let i = 0; i <= numTransitionPoints; i++) {
    const t = i / numTransitionPoints;
    transitionPoints.push({
      theta: t * firstPoint.theta,
      rho: t * firstPoint.rho,
    });
  }

  // Combine transition with original points (skip first point of original to avoid duplicate)
  return [...transitionPoints, ...points.slice(1)];
}

/**
 * Ensure the pattern ends at center (rho=0) or edge (rho=1)
 */
function ensureProperEnding(
  points: ThetaRhoPoint[],
  endAtCenter: boolean
): ThetaRhoPoint[] {
  if (points.length === 0) return points;

  const lastPoint = points[points.length - 1];
  const targetRho = endAtCenter ? 0 : 1;

  // If already at target, no transition needed
  if (Math.abs(lastPoint.rho - targetRho) < 0.01) return points;

  // Create spiral transition to target
  const transitionPoints: ThetaRhoPoint[] = [];
  const numTransitionPoints = 30;
  const startTheta = lastPoint.theta;
  const startRho = lastPoint.rho;

  // Spiral out/in while continuing rotation
  const additionalRotation = TWO_PI; // One full rotation during transition

  for (let i = 1; i <= numTransitionPoints; i++) {
    const t = i / numTransitionPoints;
    transitionPoints.push({
      theta: startTheta + t * additionalRotation,
      rho: startRho + t * (targetRho - startRho),
    });
  }

  return [...points, ...transitionPoints];
}

/**
 * Determine the track flavor based on start/end rho values
 */
function determineTrackFlavor(points: ThetaRhoPoint[]): TrackFlavor {
  if (points.length === 0) return '00';

  const firstRho = points[0].rho;
  const lastRho = points[points.length - 1].rho;

  const startAtCenter = firstRho < 0.5;
  const endAtCenter = lastRho < 0.5;

  if (startAtCenter && endAtCenter) return '00';
  if (startAtCenter && !endAtCenter) return '01';
  if (!startAtCenter && endAtCenter) return '10';
  return '11';
}

/**
 * Estimate draw time in minutes based on path length
 */
export function estimateDrawTime(points: ThetaRhoPoint[]): number {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  const tableRadius = TABLE_DIAMETER_MM / 2;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Convert to Cartesian for distance calculation
    const prevCart = thetaRhoToCartesian(prev.theta, prev.rho, tableRadius);
    const currCart = thetaRhoToCartesian(curr.theta, curr.rho, tableRadius);

    const dx = currCart.x - prevCart.x;
    const dy = currCart.y - prevCart.y;
    totalDistance += Math.sqrt(dx * dx + dy * dy);
  }

  // Convert to time (mm / mm/s = seconds, then to minutes)
  const timeSeconds = totalDistance / BALL_SPEED_MM_PER_SECOND;
  return Math.round(timeSeconds / 60 * 10) / 10; // Round to 1 decimal
}

/**
 * Export pattern to .thr file format
 */
export function exportThetaRho(points: ThetaRhoPoint[], patternName?: string): string {
  const lines: string[] = [];

  // Header comments
  lines.push('# Generated by Concord Smart Office Pattern Creator');
  if (patternName) {
    lines.push(`# Pattern: ${patternName}`);
  }
  lines.push(`# Points: ${points.length}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Data points
  for (const point of points) {
    // Format: theta rho (space-separated, reasonable precision)
    const theta = point.theta.toFixed(5);
    const rho = point.rho.toFixed(5);
    lines.push(`${theta} ${rho}`);
  }

  return lines.join('\n');
}

/**
 * Generate SVG preview string for thumbnails
 */
export function generatePreviewSvg(
  points: ThetaRhoPoint[],
  size: number = 200
): string {
  if (points.length === 0) {
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }

  const radius = size / 2 - 10; // Leave margin
  const center = size / 2;

  // Build path data
  const pathPoints: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const cart = thetaRhoToCartesian(points[i].theta, points[i].rho, radius);
    const x = (center + cart.x).toFixed(2);
    const y = (center - cart.y).toFixed(2); // Flip Y for SVG coordinates

    if (i === 0) {
      pathPoints.push(`M ${x} ${y}`);
    } else {
      pathPoints.push(`L ${x} ${y}`);
    }
  }

  const pathData = pathPoints.join(' ');

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="1"/>
  <path d="${pathData}" fill="none" stroke="#3b82f6" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * Validate theta-rho data format
 * Returns null if valid, or error message if invalid
 */
export function validateThetaRhoData(data: string): string | null {
  const lines = data
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (lines.length < 2) {
    return 'Pattern must have at least 2 points';
  }

  // Parse and validate all points
  const points: ThetaRhoPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 2) {
      return `Invalid point format at line ${i + 1}: ${lines[i]}`;
    }

    const theta = parseFloat(parts[0]);
    const rho = parseFloat(parts[1]);

    if (isNaN(theta) || isNaN(rho)) {
      return `Invalid numeric values at line ${i + 1}: ${lines[i]}`;
    }

    if (rho < 0 || rho > 1) {
      return `Rho value must be 0-1, got ${rho} at line ${i + 1}`;
    }

    points.push({ theta, rho });
  }

  // Check start/end rho values
  const firstRho = points[0].rho;
  const lastRho = points[points.length - 1].rho;

  const validStartEnd = (rho: number) => rho < 0.05 || rho > 0.95;

  if (!validStartEnd(firstRho)) {
    return `Pattern must start with rho near 0 or 1, got ${firstRho.toFixed(3)}`;
  }

  if (!validStartEnd(lastRho)) {
    return `Pattern must end with rho near 0 or 1, got ${lastRho.toFixed(3)}`;
  }

  return null; // Valid
}

/**
 * Parse theta-rho data string into points array
 */
export function parseThetaRhoData(data: string): ThetaRhoPoint[] {
  const lines = data
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  return lines.map((line) => {
    const [theta, rho] = line.split(/\s+/).map(parseFloat);
    return { theta, rho };
  });
}
