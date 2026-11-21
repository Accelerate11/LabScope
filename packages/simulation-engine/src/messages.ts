export interface Stamp { sec: number; nanosec: number }
export interface Header { stamp: Stamp; frame_id: string }
export const DEFAULT_EPOCH_NS = 1_700_000_000_000_000_000n;
export const NS_PER_MS = 1_000_000n;
export const CAMERA_OPTICAL_FRAME = 'camera_optical_frame';

export function header(ns: bigint, frame_id: string): Header {
  const sec = Number(ns / 1_000_000_000n);
  return { stamp: { sec, nanosec: Number(ns % 1_000_000_000n) }, frame_id };
}

export const channels = {
  points: { topic: '/points', schemaName: 'sensor_msgs/msg/PointCloud2' },
  rgb: { topic: '/camera/color/image_raw', schemaName: 'sensor_msgs/msg/Image' },
  depth: { topic: '/camera/depth/image_raw', schemaName: 'sensor_msgs/msg/Image' },
  cameraInfo: { topic: '/camera/camera_info', schemaName: 'sensor_msgs/msg/CameraInfo' },
  imu: { topic: '/imu/data', schemaName: 'sensor_msgs/msg/Imu' },
  tf: { topic: '/tf', schemaName: 'tf2_msgs/msg/TFMessage' },
  tfStatic: { topic: '/tf_static', schemaName: 'tf2_msgs/msg/TFMessage' },
  pose: { topic: '/pose', schemaName: 'geometry_msgs/msg/PoseStamped' },
  odom: { topic: '/odom', schemaName: 'nav_msgs/msg/Odometry' },
  path: { topic: '/path', schemaName: 'nav_msgs/msg/Path' },
} as const;

export const CHANNELS = Object.values(channels);
export const markerChannel = { topic: '/visualization_marker_array', schemaName: 'visualization_msgs/msg/MarkerArray' } as const;
export const lidarOverlayChannels = [
  { topic: '/points/structure', schemaName: channels.points.schemaName },
  { topic: '/points/objects', schemaName: channels.points.schemaName },
] as const;
