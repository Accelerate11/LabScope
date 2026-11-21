import { cameraOffset, sensorOrigin, type Box, type RobotMotion, type Vec3 } from './geometry.js';
import { CAMERA_OPTICAL_FRAME, header } from './messages.js';

function distanceToBox(origin: Vec3, dx: number, dy: number, dz: number, box: Box): number {
  let near = 0.04, far = 40;
  for (let axis = 0; axis < 3; axis++) {
    const direction = axis === 0 ? dx : axis === 1 ? dy : dz;
    const start = origin[axis]!;
    const low = box.min[axis]!, high = box.max[axis]!;
    if (Math.abs(direction) < 1e-9) {
      if (start < low || start > high) return Infinity;
      continue;
    }
    const a = (low - start) / direction, b = (high - start) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (far < near) return Infinity;
  }
  return near;
}

export class VirtualCameraPublisher {
  readonly fx: number;
  readonly cx: number;
  readonly cy: number;
  constructor(readonly width = 160, readonly height = 90) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        width > 640 || height > 480) throw new RangeError('camera size must be within 2×2 and 640×480');
    this.fx = width * 0.67;
    this.cx = (width - 1) / 2;
    this.cy = (height - 1) / 2;
  }

  info(ns: bigint) {
    const { fx, cx, cy, width, height } = this;
    return {
      header: header(ns, CAMERA_OPTICAL_FRAME), width, height,
      distortion_model: 'plumb_bob', d: [0, 0, 0, 0, 0],
      k: [fx, 0, cx, 0, fx, cy, 0, 0, 1],
      r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      p: [fx, 0, cx, 0, 0, fx, cy, 0, 0, 0, 1, 0],
      binning_x: 0, binning_y: 0,
      roi: { x_offset: 0, y_offset: 0, height: 0, width: 0, do_rectify: false },
    };
  }

  render(ns: bigint, boxes: readonly Box[], robot: RobotMotion, color: boolean, depth: boolean) {
    const { width, height, fx, cx, cy } = this;
    const rgb = color ? new Uint8Array(width * height * 3) : undefined;
    const rawDepth = depth ? new Uint8Array(width * height * 4) : undefined;
    const depthView = rawDepth && new DataView(rawDepth.buffer);
    const origin = sensorOrigin(robot, cameraOffset);
    const c = Math.cos(robot.yaw), s = Math.sin(robot.yaw);

    for (let row = 0; row < height; row++) {
      const dz = (cy - row) / fx;
      for (let column = 0; column < width; column++) {
        const right = (column - cx) / fx;
        const dx = c + s * right, dy = s - c * right;
        let best = Infinity;
        let hit: Box | undefined;
        for (const box of boxes) {
          const distance = distanceToBox(origin, dx, dy, dz, box);
          if (distance >= best) continue;
          best = distance;
          hit = box;
        }
        const index = row * width + column;
        if (rgb && hit) {
          const x = origin[0] + dx * best, y = origin[1] + dy * best;
          const tiled = hit.max[2] === 0 && (Math.floor(x) + Math.floor(y)) % 2 !== 0;
          const light = Math.max(0.45, 1 - best * 0.023) * (tiled ? 0.75 : 1);
          rgb[index * 3] = Math.round(hit.color[0] * light);
          rgb[index * 3 + 1] = Math.round(hit.color[1] * light);
          rgb[index * 3 + 2] = Math.round(hit.color[2] * light);
        }
        depthView?.setFloat32(index * 4, hit ? best : NaN, true);
      }
    }

    const image = { header: header(ns, CAMERA_OPTICAL_FRAME), height, width, is_bigendian: 0 };
    return {
      rgb: rgb && { ...image, encoding: 'rgb8', step: width * 3, data: rgb },
      depth: rawDepth && { ...image, encoding: '32FC1', step: width * 4, data: rawDepth },
    };
  }
}
