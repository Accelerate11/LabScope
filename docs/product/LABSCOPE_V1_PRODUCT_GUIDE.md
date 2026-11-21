# LabScope V1 Product Guide

LabScope is a local-first robotics data workstation. The current delivery combines ROS 2 connection, Simulation-First data, multimodal visualization, recording, experiment manifests, indexed MCAP playback and optional AI analysis.

The normal product path is:

1. Connect to a Foxglove ROS 2 Bridge or start Simulation data.
2. Open Viewer3D, CameraViewer and Plot panels in the workspace.
3. Select topics and start an experiment recording from Data Center.
4. Pause, resume, add events through the recording API, and stop the recording.
5. Reopen the indexed MCAP through Playback with the shared timeline.
6. Optionally select a configured AI Provider and send a deterministic experiment summary for interpretation.

Core data and visualization features work without any AI Provider. AI uses an isolated Gateway and a Windows encrypted credential store when available. Original MCAP and sensor data remain local unless the user explicitly chooses to send a selected summary to a configured provider.

The current V1 delivery includes M0–M2.4 visualization, recording and basic Data Center, plus local experiment context and provider adapters. LZ4/unindexed MCAP, automatic crash repair, complete Data Center management, log analysis and report export remain future work and are listed as such in the release notes.
