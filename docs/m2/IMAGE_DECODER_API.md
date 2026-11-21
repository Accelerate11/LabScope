# M2.3 Image Decoder API

Implemented in apps/desktop/src/renderer/src/camera/image-decoder.ts.

The decoder accepts decoded sensor_msgs/msg/Image objects and preserves header timestamp and frame_id. It outputs an independent RGBA buffer, valid and invalid pixel counts, and depth range. It supports rgb8, bgr8, rgba8, bgra8, mono8, mono16, 16UC1 and 32FC1. Width, height, encoding, is_bigendian, step and data length are validated. Row padding is read through step. NaN, Infinity, zero and negative depth are invalid.

16UC1 and Mono16 use a configurable depth unit with a default of 0.001 m/count. 32FC1 is interpreted in metres. CompressedImage uses createImageBitmap and Canvas in the Renderer. Decode failures stay inside the panel error boundary.

CameraViewer displays RGB, Depth and CameraInfo metadata. It uses the same MessageBus for simulation, live and playback data.
