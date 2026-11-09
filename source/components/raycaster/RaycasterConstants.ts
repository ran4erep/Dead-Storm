
export const CEILING_COLOR = 0xFF000000;
export const FALLBACK_WALL = '#4b5563';
export const FALLBACK_DOOR = '#3b82f6';
export const BLOOD_GROWTH_DURATION = 30000;
export const FLY_SPAWN_DELAY = 60000;
export let RENDER_DISTANCE = 30;
export const setGlobalRenderDistance = (dist: number) => { RENDER_DISTANCE = 30; };
export const DOOR_THICKNESS = 0.15; // Increased thickness for visible volume
// Window LOD: beyond this distance windows render as plain solid walls (no cutout/glass).
// Mirrors (tiles with a maskTargetAsset) are excluded so reflections never pop out.
export const WINDOW_LOD_DIST = 8;
