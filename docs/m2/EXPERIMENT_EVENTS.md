# M2.4 Experiment Events

RecordingManager accepts manual events with timeNs, type, title, description and optional topic. Each event receives a generated ID and is persisted in manifest.json. The event model is shared with future playback event markers.

The current Data Center does not yet provide a dedicated event editor or timeline event jump UI. Event persistence API and manifest storage are implemented and tested through the recorder core.
