# M2.4 MCAP Writer

The writer uses the official @mcap/core McapWriter. Each ROS topic registers its ros2msg Schema and CDR Channel once. Message logTime and publishTime use the source log timestamp. Raw payload bytes are copied into the writer without passing through JSON preview data.

Segment files use indexed chunks, message indexes and a one MiB chunk target. A segment is independently readable. Manifest segments record file name, index, message count, payload byte count, completion status and SHA-256.

Current status is PASS for uncompressed writing. Existing M2.3 Reader supports Zstd, but this build does not contain a Zstd or LZ4 encoder. Requests for those recording modes are rejected with an explicit error and are not silently written as another compression mode.
