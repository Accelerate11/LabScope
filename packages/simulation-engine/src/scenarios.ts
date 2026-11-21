import type { Box, Color, RobotMotion, Vec3 } from './geometry.js';

export const scenarioIds = ['static-room', 'moving-robot', 'obstacle-scene', 'noisy-sensor'] as const;
export type ScenarioId = typeof scenarioIds[number];

export const scenarioLabels: Record<ScenarioId, string> = {
  'static-room': 'Static Room',
  'moving-robot': 'Moving Robot',
  'obstacle-scene': 'Obstacle Scene',
  'noisy-sensor': 'Noisy Sensor',
};

const room: Box[] = [
  { min: [-12, -9, -0.1], max: [12, 9, 0], color: [138, 147, 151] },
  { min: [-12, -9, 3.9], max: [12, 9, 4], color: [209, 218, 226] },
  { min: [-12, -9, 0], max: [-11.9, 9, 4], color: [144, 171, 190] },
  { min: [11.9, -9, 0], max: [12, 9, 4], color: [181, 187, 200] },
  { min: [-12, -9, 0], max: [12, -8.9, 4], color: [163, 180, 195] },
  { min: [-12, 8.9, 0], max: [12, 9, 4], color: [200, 193, 172] },
  { min: [1.7, -1.8, 0], max: [2.2, -1.3, 3.9], color: [68, 128, 146] },
  { min: [3.5, 2.9, 0], max: [4.1, 3.5, 3.9], color: [106, 131, 155] },
  { min: [4.6, -0.8, 0], max: [5.5, 0.8, 1.1], color: [214, 138, 62] },
  { min: [-4.2, 2, 0], max: [-2.3, 3.5, 0.7], color: [126, 153, 84] },
];

function boxAt(x: number, y: number, radius: number, height: number, color: Color): Box {
  const min: Vec3 = [x - radius, y - radius, 0];
  return { min, max: [x + radius, y + radius, height], color };
}

export function sceneAt(id: ScenarioId, time: number): readonly Box[] {
  if (id === 'static-room') return room;
  const target = boxAt(7 + Math.sin(time * 0.7), 2.3 * Math.sin(time * 0.5), 0.42, 1.25, [206, 63, 62]);
  if (id !== 'obstacle-scene') return [...room, target];
  return [...room, target, boxAt(3, 0.7, 0.55, 0.65, [218, 178, 70]), boxAt(6, -2.5, 0.8, 1.5, [86, 148, 92])];
}

export function motionAt(id: ScenarioId, time: number): RobotMotion {
  if (id === 'static-room') return { x: 0, y: 0, yaw: 0, vx: 0, vy: 0, ax: 0, ay: 0, yawRate: 0 };
  const rate = id === 'obstacle-scene' ? 0.24 : 0.42;
  const theta = time * rate;
  const vx = 2.8 * rate * Math.cos(theta);
  const vy = 1.7 * rate * Math.sin(theta);
  const ax = -2.8 * rate * rate * Math.sin(theta);
  const ay = 1.7 * rate * rate * Math.cos(theta);
  return {
    x: 2.8 * Math.sin(theta) - 2, y: 1.7 * (1 - Math.cos(theta)) - 2.3,
    yaw: Math.atan2(vy, vx), vx, vy, ax, ay,
    yawRate: (vx * ay - vy * ax) / (vx * vx + vy * vy),
  };
}
