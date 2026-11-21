# M3 Analysis Engine

The Analysis Engine reads indexed MCAP segments through bounded ranged reads. It computes topic counts, time range, frequency, mean interval, maximum gap, timestamp jitter, IMU magnitude statistics, PointCloud2 sample counts, invalid point counts, manifest events, and evidence files.

The MCAP source remains read-only. Metrics are computed locally before any optional model interpretation. Large files are streamed through `McapIndexedReader` and are not loaded as one buffer.
