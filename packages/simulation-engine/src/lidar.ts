import { lidarOffset, seededRandom, sensorOrigin, type Box, type RobotMotion } from './geometry.js';
import { header } from './messages.js';

export const lidarPointCounts = [10_000, 50_000, 100_000, 500_000] as const;
export type LidarPointCount = typeof lidarPointCounts[number];
export interface PointField { name: string; offset: number; datatype: number; count: number }
export interface PointCloud2 {
  header: ReturnType<typeof header>;
  height: number; width: number; fields: PointField[]; is_bigendian: boolean;
  point_step: number; row_step: number; data: Uint8Array; is_dense: boolean;
}

export class VirtualLidarPublisher {
  constructor(private readonly pointCount: LidarPointCount, private readonly ring = true) {}

  create(ns: bigint, boxes: readonly Box[], robot: RobotMotion, seed: number): PointCloud2 {
    const point_step = this.ring ? 24 : 20;
    const data = new Uint8Array(this.pointCount * point_step);
    const view = new DataView(data.buffer);
    const random = seededRandom(seed);
    const [ox, oy, oz] = sensorOrigin(robot, lidarOffset);
    const c = Math.cos(robot.yaw), s = Math.sin(robot.yaw);
    const fields = ['x', 'y', 'z', 'intensity', 'rgb'].map((name, i) => ({
      name, offset: i * 4, datatype: name === 'rgb' ? 6 : 7, count: 1,
    }));
    if (this.ring) fields.push({ name: 'ring', offset: 20, datatype: 4, count: 1 });

    let index = 0;
    for (const [boxIndex, box] of boxes.entries()) {
      const limit = Math.floor((boxIndex + 1) * this.pointCount / boxes.length);
      const [lx, ly, lz] = box.min, [hx, hy, hz] = box.max;
      const [r, g, b] = box.color;
      const packedRgb = (r << 16) | (g << 8) | b;
      while (index < limit) {
        const face = index % 6;
        const dx = (face < 2 ? (face === 0 ? lx : hx) : lx + (hx - lx) * random()) - ox;
        const dy = (face >= 2 && face < 4 ? (face === 2 ? ly : hy) : ly + (hy - ly) * random()) - oy;
        const z = (face >= 4 ? (face === 4 ? lz : hz) : lz + (hz - lz) * random()) - oz;
        const position = index * point_step;
        view.setFloat32(position, c * dx + s * dy, true);
        view.setFloat32(position + 4, -s * dx + c * dy, true);
        view.setFloat32(position + 8, z, true);
        view.setFloat32(position + 12, (r + g + b) / 3 * (0.8 + 0.2 * random()), true);
        view.setUint32(position + 16, packedRgb, true);
        if (this.ring) {
          const elevation = Math.atan2(z, Math.hypot(dx, dy));
          view.setUint16(position + 20, Math.min(31, Math.max(0, Math.floor((elevation + Math.PI / 2) * 32 / Math.PI))), true);
        }
        index++;
      }
    }
    return { header: header(ns, 'lidar_link'), height: 1, width: this.pointCount, fields,
      is_bigendian: false, point_step, row_step: data.length, data, is_dense: true };
  }
}
