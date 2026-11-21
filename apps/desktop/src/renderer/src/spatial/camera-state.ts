export type Projection = 'perspective' | 'orthographic';
export type ViewPreset = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export type Triple = [number, number, number];

export interface CameraState {
  projection: Projection;
  position: Triple;
  target: Triple;
  scale: number;
}

export const viewPresets: Record<ViewPreset, Triple> = {
  top: [-0.00001, 0, 1], bottom: [-0.00001, 0, -1],
  front: [1, 0, 0], back: [-1, 0, 0], left: [0, 1, 0], right: [0, -1, 0],
};

export const defaultCamera: CameraState = {
  projection: 'perspective', position: [-9, -12, 9], target: [2, 0, 0.4], scale: 12,
};

export function validCameraState(value: unknown): value is CameraState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CameraState;
  const triple = (v: unknown) => Array.isArray(v) && v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e12);
  return ['perspective', 'orthographic'].includes(candidate.projection) &&
    triple(candidate.position) && triple(candidate.target) &&
    candidate.position.some((v, i) => v !== candidate.target[i]) &&
    typeof candidate.scale === 'number' && candidate.scale > 0 && candidate.scale <= 1e12;
}
