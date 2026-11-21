import {
  bodyVector, cameraOffset, cameraOpticalRotation, imuOffset, lidarOffset,
  seededRandom, vector, yawRotation, type RobotMotion, type Vec3,
} from './geometry.js';
import { CAMERA_OPTICAL_FRAME, header } from './messages.js';

const covariance = (size: number, variance: number) =>
  Array.from({ length: size * size }, (_, index) => index % (size + 1) === 0 ? variance : 0);

export class VirtualImuPublisher {
  create(ns: bigint, robot: RobotMotion, noisy: boolean, seed: number) {
    const random = seededRandom(seed);
    const noise = noisy ? 0.07 : 0.002;
    const sample = () => (random() + random() + random() - 1.5) * noise;
    const bias = noisy ? 0.09 : 0;
    const [ax, ay] = bodyVector(robot.ax, robot.ay, robot.yaw);
    return {
      header: header(ns, 'imu_link'), orientation: yawRotation(robot.yaw + bias + sample()),
      angular_velocity: vector([sample(), sample(), robot.yawRate + bias + sample()]),
      linear_acceleration: vector([ax + bias + sample(), ay - bias + sample(), 9.80665 + sample()]),
      orientation_covariance: covariance(3, noise * noise / 4),
      angular_velocity_covariance: covariance(3, noise * noise / 4),
      linear_acceleration_covariance: covariance(3, noise * noise / 4),
    };
  }
}

export class VirtualTFPublisher {
  private transform(ns: bigint, frame: string, child_frame_id: string,
    translation: Vec3, rotation = yawRotation(0)) {
    return { header: header(ns, frame), child_frame_id, transform: { translation: vector(translation), rotation } };
  }

  dynamic(ns: bigint, robot: RobotMotion) {
    return { transforms: [this.transform(ns, 'odom', 'base_link', [robot.x, robot.y, 0], yawRotation(robot.yaw))] };
  }

  static(ns: bigint) {
    return { transforms: [
      this.transform(ns, 'map', 'odom', [0, 0, 0]),
      this.transform(ns, 'base_link', 'lidar_link', lidarOffset),
      this.transform(ns, 'base_link', 'camera_link', cameraOffset),
      this.transform(ns, 'camera_link', CAMERA_OPTICAL_FRAME, [0, 0, 0], cameraOpticalRotation),
      this.transform(ns, 'base_link', 'imu_link', imuOffset),
    ] };
  }
}

function poseStamped(ns: bigint, robot: RobotMotion) {
  return { header: header(ns, 'map'),
    pose: { position: vector([robot.x, robot.y, 0]), orientation: yawRotation(robot.yaw) } };
}

export class VirtualRobotStatePublisher {
  private readonly history: ReturnType<typeof poseStamped>[] = [];

  reset(): void { this.history.length = 0; }

  sample(ns: bigint, robot: RobotMotion) {
    const pose = poseStamped(ns, robot);
    this.history.push(pose);
    if (this.history.length > 128) this.history.shift();
    return pose;
  }

  odometry(ns: bigint, robot: RobotMotion) {
    return {
      header: header(ns, 'odom'), child_frame_id: 'base_link',
      pose: { pose: poseStamped(ns, robot).pose, covariance: covariance(6, 0.001) },
      twist: {
        twist: { linear: vector(bodyVector(robot.vx, robot.vy, robot.yaw)), angular: vector([0, 0, robot.yawRate]) },
        covariance: covariance(6, 0.001),
      },
    };
  }

  path(ns: bigint) {
    return { header: header(ns, 'map'), poses: this.history.slice() };
  }
}
