# M2.4 Data Center

The Data page now provides experiment controls and a manifest-backed list. Users can enter experiment name and project, select topics, start, pause, resume and stop recording. Completed experiments are listed by name, project, compression, experiment ID, segment count and event count.

The list reads manifest.json through the main process. Renderer code never receives arbitrary filesystem access. Data Center import, delete, rename, archive and full search are not implemented in this build.
