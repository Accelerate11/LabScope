#!/usr/bin/env python3
"""LabScope M0 robot-side sensor node set.

Publishes *real* ROS 2 topics (real DDS, real CDR serialization) that mimic the
target hardware envelope described in the LabScope plan:

  /imu/data                  sensor_msgs/msg/Imu          200 Hz
  /livox/lidar               sensor_msgs/msg/PointCloud2   10 Hz  (20000 pts)
  /camera/color/image_raw    sensor_msgs/msg/Image         15 Hz  640x480 rgb8
  /odom                      nav_msgs/msg/Odometry        50 Hz
  /tf                        tf2_msgs/msg/TFMessage       50 Hz
  /scan                      sensor_msgs/msg/LaserScan    10 Hz

This node intentionally produces values with known structure (quaternion unit
norm, rotating point cloud, ramp angle) so the Windows client can assert that
decoded CDR payloads are semantically correct, not merely parseable.
"""

import math
import time

import numpy as np
import rclpy
from geometry_msgs.msg import TransformStamped
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import Image, Imu, LaserScan, PointCloud2, PointField
from tf2_msgs.msg import TFMessage

IMU_HZ = 200.0
LIDAR_HZ = 10.0
IMAGE_HZ = 5.0
ODOM_HZ = 50.0
TF_HZ = 50.0
SCAN_HZ = 10.0

LIDAR_POINTS = 20000
IMAGE_W, IMAGE_H = 640, 480


class SensorDemo(Node):
    def __init__(self) -> None:
        super().__init__("labscope_sensor_demo")
        qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        self.pub_imu = self.create_publisher(Imu, "/imu/data", qos)
        self.pub_lidar = self.create_publisher(PointCloud2, "/livox/lidar", qos)
        self.pub_image = self.create_publisher(Image, "/camera/color/image_raw", qos)
        self.pub_odom = self.create_publisher(Odometry, "/odom", qos)
        self.pub_tf = self.create_publisher(TFMessage, "/tf", qos)
        self.pub_scan = self.create_publisher(LaserScan, "/scan", qos)

        # Pre-generate a static lidar geometry so each frame is a rigid rotation.
        rng = np.random.default_rng(20261120)
        n = LIDAR_POINTS
        # A hemispherical shell (roughly Mid-360 FOV) with radial jitter.
        u = rng.random(n)
        v = rng.random(n)
        theta = 2.0 * math.pi * u
        phi = np.arccos(1.0 - v)  # 0..pi/2 hemisphere
        r = 8.0 + 2.0 * rng.random(n)
        self._base_xyz = np.stack(
            [
                r * np.sin(phi) * np.cos(theta),
                r * np.sin(phi) * np.sin(theta),
                r * np.cos(phi),
            ],
            axis=1,
        ).astype(np.float32)
        self._intensity = (rng.random(n) * 200.0).astype(np.float32)

        yy, xx = np.mgrid[0:IMAGE_H, 0:IMAGE_W]
        self._img_x = (xx.astype(np.uint16) % 256).astype(np.uint8)
        self._img_y = (yy.astype(np.uint16) % 256).astype(np.uint8)

        self.t0 = time.time()
        self._counts = {k: 0 for k in ("imu", "lidar", "image", "odom", "tf", "scan")}

        # Deadlines are driven by a monotonic clock, not by tick counts.
        #
        # Two problems were measured with the naive designs:
        #  * independent rclpy timers starve each other (a 5 ms IMU timer slipped
        #    to ~55 Hz once image/lidar copies shared the executor);
        #  * a single timer with *count-based* division drifts with the timer
        #    itself (a nominal 200 Hz timer fired at ~154 Hz, so every derived
        #    stream ran 23% slow).
        # Each stream therefore keeps its own next-deadline, and a slow tick
        # publishes the catch-up messages (bounded, so a stall cannot snowball).
        self._streams = (
            ("imu", IMU_HZ, 4),
            ("odom", ODOM_HZ, 2),
            ("tf", TF_HZ, 2),
            ("scan", SCAN_HZ, 1),
            ("lidar", LIDAR_HZ, 1),
            ("image", IMAGE_HZ, 1),
        )
        self._handlers = {
            "imu": self.pub_imu_cb,
            "odom": self.pub_odom_cb,
            "tf": self.pub_tf_cb,
            "scan": self.pub_scan_cb,
            "lidar": self.pub_lidar_cb,
            "image": self.pub_image_cb,
        }
        self._period = {name: 1.0 / hz for name, hz, _ in self._streams}
        self._next_due: dict[str, float] = {}

        self.create_timer(1.0 / IMU_HZ, self.tick_cb)
        self.create_timer(5.0, self.report_cb)
        self.get_logger().info("labscope_sensor_demo started")

    def tick_cb(self) -> None:
        now = time.monotonic()
        for name, _hz, max_catchup in self._streams:
            period = self._period[name]
            due = self._next_due.get(name, now)
            published = 0
            while now >= due and published < max_catchup:
                self._handlers[name]()
                due += period
                published += 1
            if now >= due:
                # Still behind after the catch-up cap: drop the backlog instead
                # of building an unbounded burst later.
                due = now + period
            self._next_due[name] = due

    # -- helpers -----------------------------------------------------------
    def t(self) -> float:
        return time.time() - self.t0

    def stamp(self):
        return self.get_clock().now().to_msg()

    def report_cb(self) -> None:
        self.get_logger().info(
            "published imu=%d lidar=%d image=%d odom=%d tf=%d scan=%d"
            % (
                self._counts["imu"],
                self._counts["lidar"],
                self._counts["image"],
                self._counts["odom"],
                self._counts["tf"],
                self._counts["scan"],
            )
        )

    # -- publishers --------------------------------------------------------
    def pub_imu_cb(self) -> None:
        t = self.t()
        msg = Imu()
        msg.header.stamp = self.stamp()
        msg.header.frame_id = "imu_link"
        # Yaw spinning at 0.5 rad/s -> known, checkable quaternion.
        yaw = 0.5 * t
        msg.orientation.x = 0.0
        msg.orientation.y = 0.0
        msg.orientation.z = math.sin(yaw / 2.0)
        msg.orientation.w = math.cos(yaw / 2.0)
        # Known sinusoid so the client can assert decoded values.
        msg.angular_velocity.x = 0.02 * math.sin(2.0 * math.pi * 0.5 * t)
        msg.angular_velocity.y = 0.02 * math.cos(2.0 * math.pi * 0.5 * t)
        msg.angular_velocity.z = 0.5
        msg.linear_acceleration.x = 0.0
        msg.linear_acceleration.y = 0.0
        msg.linear_acceleration.z = 9.80665
        for i in range(9):
            msg.orientation_covariance[i] = 0.0
            msg.angular_velocity_covariance[i] = 0.0
            msg.linear_acceleration_covariance[i] = 0.0
        msg.orientation_covariance[0] = 0.001
        msg.orientation_covariance[4] = 0.001
        msg.orientation_covariance[8] = 0.001
        msg.angular_velocity_covariance[0] = 0.0004
        msg.angular_velocity_covariance[4] = 0.0004
        msg.angular_velocity_covariance[8] = 0.0004
        msg.linear_acceleration_covariance[0] = 0.01
        msg.linear_acceleration_covariance[4] = 0.01
        msg.linear_acceleration_covariance[8] = 0.01
        self.pub_imu.publish(msg)
        self._counts["imu"] += 1

    def pub_lidar_cb(self) -> None:
        t = self.t()
        yaw = 0.5 * t
        c, s = math.cos(yaw), math.sin(yaw)
        xyz = self._base_xyz
        rot = np.empty_like(xyz)
        rot[:, 0] = c * xyz[:, 0] - s * xyz[:, 1]
        rot[:, 1] = s * xyz[:, 0] + c * xyz[:, 1]
        rot[:, 2] = xyz[:, 2]

        msg = PointCloud2()
        msg.header.stamp = self.stamp()
        msg.header.frame_id = "livox_frame"
        msg.height = 1
        msg.width = LIDAR_POINTS
        msg.fields = [
            PointField(name="x", offset=0, datatype=PointField.FLOAT32, count=1),
            PointField(name="y", offset=4, datatype=PointField.FLOAT32, count=1),
            PointField(name="z", offset=8, datatype=PointField.FLOAT32, count=1),
            PointField(name="intensity", offset=12, datatype=PointField.FLOAT32, count=1),
        ]
        msg.is_bigendian = False
        msg.point_step = 16
        msg.row_step = 16 * LIDAR_POINTS
        msg.is_dense = True
        packed = np.empty((LIDAR_POINTS, 4), dtype="<f4")
        packed[:, :3] = rot
        packed[:, 3] = self._intensity
        msg.data = packed.tobytes()
        self.pub_lidar.publish(msg)
        self._counts["lidar"] += 1

    def pub_image_cb(self) -> None:
        msg = Image()
        msg.header.stamp = self.stamp()
        msg.header.frame_id = "camera_color_optical_frame"
        msg.height = IMAGE_H
        msg.width = IMAGE_W
        msg.encoding = "rgb8"
        msg.is_bigendian = 0
        msg.step = IMAGE_W * 3
        buf = np.empty((IMAGE_H, IMAGE_W, 3), dtype=np.uint8)
        buf[:, :, 0] = self._img_x
        buf[:, :, 1] = self._img_y
        buf[:, :, 2] = 128
        msg.data = buf.tobytes()
        self.pub_image.publish(msg)
        self._counts["image"] += 1

    def pub_odom_cb(self) -> None:
        t = self.t()
        msg = Odometry()
        msg.header.stamp = self.stamp()
        msg.header.frame_id = "odom"
        msg.child_frame_id = "base_link"
        msg.pose.pose.position.x = 1.5 * math.sin(0.3 * t)
        msg.pose.pose.position.y = 1.5 * math.cos(0.3 * t)
        msg.pose.pose.position.z = 0.1
        yaw = 0.5 * t
        msg.pose.pose.orientation.z = math.sin(yaw / 2.0)
        msg.pose.pose.orientation.w = math.cos(yaw / 2.0)
        msg.twist.twist.linear.x = 0.45 * math.cos(0.3 * t)
        msg.twist.twist.linear.y = -0.45 * math.sin(0.3 * t)
        msg.twist.twist.angular.z = 0.5
        for i in range(36):
            msg.pose.covariance[i] = 0.0
            msg.twist.covariance[i] = 0.0
        msg.pose.covariance[0] = 0.02
        msg.pose.covariance[7] = 0.02
        msg.pose.covariance[35] = 0.05
        msg.twist.covariance[0] = 0.01
        msg.twist.covariance[7] = 0.01
        msg.twist.covariance[35] = 0.02
        self.pub_odom.publish(msg)
        self._counts["odom"] += 1

    def _tf(self, parent: str, child: str, x: float, y: float, z: float, yaw: float):
        ts = TransformStamped()
        ts.header.stamp = self.stamp()
        ts.header.frame_id = parent
        ts.child_frame_id = child
        ts.transform.translation.x = x
        ts.transform.translation.y = y
        ts.transform.translation.z = z
        ts.transform.rotation.z = math.sin(yaw / 2.0)
        ts.transform.rotation.w = math.cos(yaw / 2.0)
        return ts

    def pub_tf_cb(self) -> None:
        msg = TFMessage()
        msg.transforms = [
            self._tf("base_link", "imu_link", 0.0, 0.0, 0.05, 0.0),
            self._tf("base_link", "livox_frame", 0.12, 0.0, 0.30, 0.0),
            self._tf("base_link", "camera_color_optical_frame", 0.30, 0.0, 0.12, 0.0),
        ]
        self.pub_tf.publish(msg)
        self._counts["tf"] += 1

    def pub_scan_cb(self) -> None:
        msg = LaserScan()
        msg.header.stamp = self.stamp()
        msg.header.frame_id = "livox_frame"
        msg.angle_min = -math.pi
        msg.angle_max = math.pi
        msg.angle_increment = (2.0 * math.pi) / 360.0
        msg.time_increment = 0.0
        msg.scan_time = 1.0 / SCAN_HZ
        msg.range_min = 0.1
        msg.range_max = 10.0
        msg.ranges = [3.0 + 0.5 * math.sin(i * 0.1) for i in range(360)]
        self.pub_scan.publish(msg)
        self._counts["scan"] += 1


def main() -> None:
    rclpy.init()
    node = SensorDemo()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == "__main__":
    main()
