/**
 * @silkplot/theme — design tokens for SilkPlot.
 *
 * Tokens as a typed object + a CSS custom-property string. Palette ramps wrap
 * d3-scale-chromatic. Motion and contrast honor user preferences.
 */
export {
  tokens,
  tokensToCss,
  focusVisibleCss,
  cssVar,
  categoricalPalette,
  sequentialRamp,
  seriesChannel,
  seriesDashPatterns,
  seriesMarkerShapes,
  markerPath,
  CSS_PREFIX,
  THEME_ATTR,
  FOCUS_CLASS,
} from "./tokens";
export type { Tokens, SeriesChannel, MarkerShape } from "./tokens";
