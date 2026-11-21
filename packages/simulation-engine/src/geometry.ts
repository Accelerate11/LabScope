export type Vec3 = readonly [number, number, number];
export type Color = readonly [number, number, number];
export interface Box { min: Vec3; max: Vec3; color: Color }
export interface RobotMotion {
  x: number; y: number; yaw: number; vx: number; vy: number; ax: number; ay: number; yawRate: number;
}

export const lidarOffset = [0, 0, 0.85] as const;
export const cameraOffset = [0.3, 0, 0.65] as const;
export const imuOffset = [0, 0, 0] as const;
export const cameraOpticalRotation = { x: -0.5, y: 0.5, z: -0.5, w: 0.5 };

export function vector([x, y, z]: Vec3) { return { x, y, z }; }
export function yawRotation(yaw: number) {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) };
}
export function bodyVector(x: number, y: number, yaw: number): Vec3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * x + s * y, -s * x + c * y, 0];
}
export function sensorOrigin(robot: RobotMotion, [x, y, z]: Vec3): Vec3 {
  const c = Math.cos(robot.yaw), s = Math.sin(robot.yaw);
  return [robot.x + c * x - s * y, robot.y + s * x + c * y, z];
}

export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}
