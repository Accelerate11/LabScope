# M2.4 Recorder Architecture

The recording path is Data Worker raw CDR -> Main process RecordingManager -> MCAP Writer -> experiment directory. Renderer panels are not on the write path. Worker sends selected raw payloads only while recording is active. The manager owns a bounded queue, pause state, segment rotation, manifest writes and final SHA-256.

RecordingManager currently supports uncompressed MCAP writing. It creates D:/LabScope/data/experiments/Project/EXP_ID by default. The queue capacity, segment byte limit and segment time limit are configurable. Queue high-water, pending bytes and dropped messages are exposed in RecordingStatus.

Pause stops accepting new recording messages while the live UI can continue. Resume continues the same experiment. Stop drains the queue, closes the MCAP footer, hashes each segment and writes manifest.json. The active viewer and GPU renderer are independent.
