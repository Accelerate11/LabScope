# M2.3 Timeline Synchronization

TimelineClock is the shared Renderer clock. It stores source, currentNs, startNs, endNs, rate and state. McapPlaybackDataSource drives it during play, pause, seek, resume and rate changes. MessageBus observes live and simulation timestamps. Viewer3D uses the source clock for TF queries. Plot uses the shared cursor. Camera consumes the nearest complete image at the source time.

MCAP log time schedules playback. ROS Header stamp is used for TF and spatial queries. Receive time is used for live telemetry. Simulation timestamp comes from fixed simulation steps. Display cursor is the TimelineClock current position. Different-rate topics use nearest complete images, original numeric samples and TF interpolation. Image interpolation is not fabricated.

Seek clears the playback source, rebuilds static TF and Marker state, restores nearby dynamic TF and latest topic samples, then resumes from the selected cursor. LZ4 and unindexed MCAP remain outside the M2.2 support range.
