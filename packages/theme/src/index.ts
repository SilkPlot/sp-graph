/**
 * @silkplot/theme — design tokens for SilkPlot.
 *
 * Tokens as a typed object + a CSS custom-property string. Palette ramps wrap
 * d3-scale-chromatic. Motion and contrast honor user preferences.
 */
export {
  tokens,
  tokensToCss,
  cssVar,
  categoricalPalette,
  sequentialRamp,
  CSS_PREFIX,
} from "./tokens";
export type { Tokens } from "./tokens";
