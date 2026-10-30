/**
 * A29 – Maskottchen-Engine: oeffentliche Oberflaeche.
 *
 * EIGENTUEMER: A29.
 */

export {
  MascotEngine,
  type MascotFrame,
  type MascotState,
  MORPH_DURATION,
  RAYON,
  type RenderedEye,
} from "./engine";
export {
  type AvatarExpression,
  type BotExpression,
  blendExpression,
  DEFAULT_EXPRESSION,
  EXPRESSIONS,
  type EyeCfg,
  expressionProfile,
} from "./expressions";
export {
  blinkScale,
  EYE_H,
  EYE_SPLIT,
  EYE_W,
  type EyePose,
  eyePoses,
  type HeadGaze,
  type Liveliness,
  type LivelinessOptions,
  liveliness,
  REST_GAZE,
} from "./face";
export {
  type MascotGeometry,
  type MascotMarkupOptions,
  mascotGeometry,
  mascotSvgMarkup,
  VIEWBOX_HALF,
} from "./markup";
export {
  clamp,
  createRng,
  type Easing,
  easings,
  lerp,
  loopNoise,
  r2,
  TAU,
} from "./math";
export { PROFILE_SAMPLES, PROFILES, type ProfileName } from "./profiles";
export {
  blend,
  capsulePath,
  circle,
  closedPath,
  hullOfCircles,
  type Point,
  polyPath,
  profileFromPolygon,
  radiusAtAngle,
  regularPolygonProfile,
  roundedPolygon,
  roundedPolygonProfile,
  type Silhouette,
  silhouette,
  superellipseProfile,
  toPoints,
  unionOfCirclesProfile,
} from "./shape";
export {
  AVATAR_COLORS,
  AVATAR_SHAPE_PROFILES,
  type AvatarColor,
  type AvatarColorProfile,
  type AvatarShape,
  type AvatarShapeProfile,
  type BotAvatarShape,
  CONTRACT_SHAPES,
  colorProfile,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  EXTRA_SHAPES,
  type ExtraAvatarShape,
  mixHex,
  shapeRadii,
} from "./skins";
