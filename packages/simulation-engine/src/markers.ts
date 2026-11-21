import { vector, yawRotation, type Box, type Vec3 } from './geometry.js';
import { header } from './messages.js';

const color = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

export class VirtualMarkerPublisher {
  create(time: bigint, scene: readonly Box[]) {
    const obstacle = scene.at(-1)!;
    const center = obstacle.min.map((value, axis) => (value + obstacle.max[axis]!) / 2) as unknown as Vec3;
    const size = obstacle.min.map((value, axis) => obstacle.max[axis]! - value) as unknown as Vec3;
    const item = (id: number, type: number, position: Vec3, scale: Vec3, rgba: ReturnType<typeof color>,
      points: readonly Vec3[] = [], text = '') => ({
      header: header(time, 'map'), ns: 'simulation', id, type, action: 0,
      pose: { position: vector(position), orientation: yawRotation(0) }, scale: vector(scale), color: rgba,
      lifetime: { sec: 0, nanosec: 700000000 }, frame_locked: false,
      points: points.map(vector), colors: [], text, mesh_resource: '', mesh_use_embedded_materials: false,
    });
    return { markers: [
      item(0, 1, center, size, color(1, 0.55, 0.1, 0.38)),
      item(1, 9, [center[0], center[1], obstacle.max[2] + 0.25], [0, 0, 0.33], color(1, 0.75, 0.2), [], '目标'),
      item(2, 2, [-4, 4, 0.32], [0.65, 0.65, 0.65], color(0.15, 0.8, 0.8, 0.72)),
      item(3, 0, [0, 4, 0.2], [1.6, 0.15, 0.24], color(0.35, 0.85, 1)),
      item(4, 4, [0, 0, 0], [0.035, 0, 0], color(0.55, 0.73, 1, 0.8), [[-4, 5, 0.15], [-2, 5, 0.15], [-2, 7, 0.15]]),
      item(5, 5, [0, 0, 0], [0.035, 0, 0], color(1, 0.58, 0.17), [[2, 5, 0.15], [3, 6, 0.15], [3, 5, 0.15], [2, 6, 0.15]]),
      item(6, 8, [0, 0, 0], [0.12, 0.12, 0], color(0.9, 0.9, 0.4), [[4, 5, 0.35], [4.4, 5.3, 0.4], [4.8, 5, 0.5]]),
    ] };
  }
}
