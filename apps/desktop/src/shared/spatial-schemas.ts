export const spatialSchemas = {
  tf: 'tf2_msgs/msg/TFMessage',
  pose: 'geometry_msgs/msg/PoseStamped',
  odom: 'nav_msgs/msg/Odometry',
  path: 'nav_msgs/msg/Path',
  marker: 'visualization_msgs/msg/Marker',
  markers: 'visualization_msgs/msg/MarkerArray',
} as const;

export const spatialSchemaNames: ReadonlySet<string> = new Set(Object.values(spatialSchemas));
