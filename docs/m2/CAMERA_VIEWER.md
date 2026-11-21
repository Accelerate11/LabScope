# M2.3 Camera Viewer

CameraViewer supports sensor_msgs/msg/Image, sensor_msgs/msg/CompressedImage and sensor_msgs/msg/CameraInfo. Multiple panels can bind RGB, Depth, left and right camera topics independently. The view uses Canvas, keeps the source aspect ratio, and supports fit and native size.

Depth supports grayscale display, automatic or manual min/max range, invalid pixel count and configurable 16UC1 units. CameraInfo shows width, height, distortion model, D, K, R, P, binning and ROI. Camera frame and ROS timestamp remain visible. Distortion correction is intentionally not claimed.

Playback consumes the nearest complete image at the shared clock time and does not invent image interpolation. Seek clears the old source before showing the target sample. Missing data and decode failures are visible in the panel.
