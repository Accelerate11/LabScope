export type TimelineState = 'idle' | 'playing' | 'paused' | 'seeking';
export interface TimelineSnapshot {
  source: 'live' | 'playback' | 'simulation' | null;
  currentNs: bigint;
  startNs: bigint;
  endNs: bigint;
  rate: number;
  state: TimelineState;
}
type Listener = () => void;

export class TimelineClock {
  private snapshot: TimelineSnapshot = {
    source: null, currentNs: 0n, startNs: 0n, endNs: 0n, rate: 1, state: 'idle',
  };
  private listeners = new Set<Listener>();
  private token = 0;
  get value(): TimelineSnapshot { return this.snapshot; }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { for (const listener of [...this.listeners]) listener(); }
  configure(source: TimelineSnapshot['source'], startNs: bigint, endNs: bigint): void {
    this.snapshot = { ...this.snapshot, source, startNs, endNs, currentNs: startNs, state: 'idle' };
    this.emit();
  }
  setCurrent(currentNs: bigint): void {
    const bounded = currentNs < this.snapshot.startNs ? this.snapshot.startNs :
      currentNs > this.snapshot.endNs ? this.snapshot.endNs : currentNs;
    this.snapshot = { ...this.snapshot, currentNs: bounded };
    this.emit();
  }
  observe(source: TimelineSnapshot['source'], currentNs: bigint): void {
    if (this.snapshot.source !== source) {
      this.snapshot = { ...this.snapshot, source, currentNs, startNs: currentNs, endNs: currentNs };
    } else {
      this.snapshot = { ...this.snapshot, currentNs, endNs: currentNs > this.snapshot.endNs ? currentNs : this.snapshot.endNs };
    }
    this.emit();
  }
  play(): void { this.snapshot = { ...this.snapshot, state: 'playing' }; this.emit(); }
  pause(): void { this.snapshot = { ...this.snapshot, state: 'paused' }; this.emit(); }
  seek(currentNs: bigint): number { this.pause(); this.snapshot = { ...this.snapshot, state: 'seeking', currentNs }; this.emit(); return ++this.token; }
  finishSeek(currentNs = this.snapshot.currentNs): void {
    this.snapshot = { ...this.snapshot, currentNs, state: 'paused' }; this.emit();
  }
  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0 || rate > 16) throw new RangeError('invalid playback rate');
    this.snapshot = { ...this.snapshot, rate }; this.emit();
  }
  cancel(): void { ++this.token; this.snapshot = { ...this.snapshot, source: null, state: 'idle', currentNs: 0n, startNs: 0n, endNs: 0n }; this.emit(); }
  isCurrent(token: number): boolean { return token === this.token; }
}
export const timelineClock = new TimelineClock();
