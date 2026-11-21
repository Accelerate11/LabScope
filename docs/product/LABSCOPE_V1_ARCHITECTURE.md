# LabScope V1 Architecture

Electron Main owns filesystem, RecordingManager, MCAP Writer, AI Gateway and Worker lifecycle. Data Worker owns ROS 2 transport, Schema and raw CDR capture. Renderer owns MessageBus, TimelineClock, Workspace, Viewer3D, CameraViewer, Plot and local Data Center/AI screens.

Sources publish through one MessageBus. Raw recording is separated from JSON previews and GPU rendering. McapPlaybackDataSource, CameraViewer, Plot and Viewer3D share TimelineClock. AI receives explicit local summaries through the main-process gateway and never receives arbitrary filesystem access.
