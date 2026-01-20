/**
 * Pattern Creator Feature
 *
 * Mobile-friendly pattern creator for the Oasis Mini sand table.
 * Exports all components, services, types, and presets.
 */

// Types
export * from './types';

// Services
export {
  generatePattern,
  generateShape,
  generateCircle,
  generatePolygon,
  generateStar,
  generateSpiral,
  generateRose,
  generateHeart,
  applyLoopTransform,
  cartesianToThetaRho,
  thetaRhoToCartesian,
  estimateDrawTime,
  exportThetaRho,
  generatePreviewSvg,
  validateThetaRhoData,
  parseThetaRhoData,
} from './services/patternGenerator';

// Components
export {
  PatternPreview,
  usePatternAnimation,
  ShapeSelector,
  ParameterSlider,
  ParameterControls,
  PresetGrid,
  PatternActions,
} from './components';

// Demo Page
export { PatternCreatorDemo } from './PatternCreatorDemo';

// Modal Component
export { PatternCreatorModal } from './PatternCreatorModal';

// Presets
export {
  PATTERN_PRESETS,
  EXTENDED_PRESETS,
  getAllPresets,
  getPresetById,
  generateRandomConfig,
  presetToConfig,
  getMainPresets,
} from './presets';
