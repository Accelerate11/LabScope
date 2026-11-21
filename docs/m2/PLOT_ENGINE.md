# M2.3 Plot Engine

PlotPanel recursively discovers numeric fields from decoded ROS messages. It supports numbers, booleans, Vector3, Quaternion, Pose, Twist, Odometry and IMU structures. A series stores source, topic, field path, display name, color, unit, visibility and capacity.

TimeSeriesBuffer inserts bigint nanosecond samples in timestamp order, accepts out-of-order messages, enforces a bounded capacity and computes count, min, max, mean and standard deviation. Min-Max bucket downsampling preserves short peaks. CSV export uses original nanosecond timestamps and does not modify source messages.

PlotPanel supports multiple series, shared timeline cursor, statistics and CSV download. Data comes from Unified Message Bus for simulation, live and playback sources.
