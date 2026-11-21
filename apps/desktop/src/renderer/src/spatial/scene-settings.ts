import { validCameraState, type CameraState } from './camera-state';

export interface SceneSettings {
  fixedFrame: string | null;
  transforms: boolean;
  pose: boolean;
  odometry: boolean;
  path: boolean;
  markers: boolean;
  axisLength: number;
  pathColor: string;
  pathLength: number;
  pathStep: number;
  /** Arc length in fixed-frame metres. Zero uses the configured point limit. */
  pathMeters?: number;
  hidden: string[];
  camera?: CameraState;
}

export const defaultScene: SceneSettings = {
  fixedFrame: null, transforms: false, pose: false, odometry: false, path: false, markers: false,
  axisLength: 0.5, pathColor: '#40e7b2', pathLength: 256, pathStep: 1, hidden: [],
  pathMeters: 0,
};

export const fullScene: SceneSettings = {
  ...defaultScene, fixedFrame: 'map', transforms: true, pose: true, odometry: true, path: true, markers: true,
};

export const hexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function validSceneSettings(value: unknown): value is SceneSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as SceneSettings;
  const ranged = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  return (s.fixedFrame === null || (typeof s.fixedFrame === 'string' && !!s.fixedFrame.trim() && s.fixedFrame.length <= 256)) &&
    [s.transforms, s.pose, s.odometry, s.path, s.markers].every((b) => typeof b === 'boolean') &&
    ranged(s.axisLength, 0.05, 100) && hexColor(s.pathColor) && Number.isInteger(s.pathLength) && ranged(s.pathLength, 2, 2048) &&
    Number.isInteger(s.pathStep) && ranged(s.pathStep, 1, 64) && Array.isArray(s.hidden) && s.hidden.length <= 256 &&
    (s.pathMeters === undefined || ranged(s.pathMeters, 0, 100_000)) &&
    s.hidden.every((id) => typeof id === 'string' && id.length <= 520) &&
    (s.camera === undefined || validCameraState(s.camera));
}
