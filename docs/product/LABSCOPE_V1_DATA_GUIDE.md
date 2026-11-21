# LabScope V1 Data Guide

Default experiments are stored under `D:/LabScope/data/experiments`. Each experiment contains `manifest.json` and one or more indexed MCAP segments. Manifest entries include experiment identity, pause intervals, events, segment status and SHA-256. The raw message path is independent of Viewer3D, CameraViewer and Plot, so closing a panel does not stop an active recording.

The recorder writes uncompressed MCAP in the current build. Existing playback supports uncompressed and Zstd indexed files. LZ4 and unindexed scan are not implemented. The current Data Center exposes recording controls and completed experiment summaries. Full import/export, archive and destructive deletion workflows are future work.

Do not delete active recording directories manually. Stop or cancel from the Data Center, then use the manifest and SHA-256 values for an integrity check. Disk-full recovery, crash repair and long-duration recording remain untested in this delivery.
