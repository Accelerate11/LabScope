# M2.4 Experiment Metadata

Each experiment has a versioned manifest.json. It contains schemaVersion, experimentId, name, project, operator, notes, tags, createdAt, startLogTimeNs, endLogTimeNs, compression, segments, events, pauses and integrity information.

The experiment directory is created below a validated project and experiment name. Path characters are sanitized. Existing directories are never overwritten. Manifest writes use a temporary file followed by rename. Segment files are independent and include SHA-256 after successful close.
