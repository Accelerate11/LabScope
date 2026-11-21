# M2.4 Recovery Design

The recorder uses independent segments, bounded queue state and manifest checkpoints to reduce data loss. A normal stop drains the queue, closes the MCAP footer and hashes the segment. A process crash can leave a partial segment and a manifest with partial status. The current build does not claim automatic repair of every truncated MCAP.

Disk and write errors move RecordingManager to error state. Queue overflow increments droppedMessages and exposes an error. The viewer does not decide whether data is lost. Recovery diagnostics must distinguish complete, partial and corrupt files. Automatic orphan scan, repair and resume are future work.
