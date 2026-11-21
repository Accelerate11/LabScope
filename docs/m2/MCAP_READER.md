# M2.4 MCAP Reader

M2.3 McapPlaybackDataSource remains the shared reader for indexed uncompressed and Zstd MCAP. It streams file ranges through the browser Blob, uses bounded chunk reads and restores the shared TimelineClock on seek.

Unindexed scanning and LZ4 decompression are not implemented in this build. The current reader rejects missing ChunkIndex and unsupported compression with a visible diagnostic. Original files are never modified. This limitation is reported separately from the new recorder, which currently writes uncompressed indexed segments.
