import { messageBus, type MessageBus, type MessageEnvelope, type TopicDescriptor } from './message-bus';

/** Adapter for a replay producer. Timing and file IO belong to the producer. */
export class PlaybackFeed {
  constructor(private readonly bus: MessageBus = messageBus) {}

  load(channels: readonly TopicDescriptor[]): void {
    this.bus.reset('playback');
    this.bus.setChannels('playback', channels);
  }

  deliver(frame: Omit<MessageEnvelope, 'source'>, advanceClock = true): void {
    this.bus.publish({ ...frame, source: 'playback' }, advanceClock);
  }

  clock(time: bigint): void { this.bus.setClock('playback', time); }

  seek(): void {
    this.bus.reset('playback');
  }

  close(): void {
    this.bus.setChannels('playback', []);
    this.bus.reset('playback');
  }
}
