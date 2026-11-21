# M3.0-R1 Streaming

The current R1 implementation keeps the existing request/response Gateway contract and local Mock Provider. Provider-native streaming events are not yet exposed through IPC. A future streaming adapter should normalize provider events before they reach React and support cancellation and partial-message persistence.
