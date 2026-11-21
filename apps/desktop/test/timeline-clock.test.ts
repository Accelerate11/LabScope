import { expect, it } from 'vitest';
import { TimelineClock } from '../src/renderer/src/timeline/timeline-clock';
it('coordinates state, seek token and playback rate', () => {
  const clock = new TimelineClock();
  clock.configure('playback', 10n, 100n); clock.play(); clock.setPlaybackRate(2);
  expect(clock.value.state).toBe('playing'); expect(clock.value.rate).toBe(2);
  const token = clock.seek(60n); expect(clock.value.state).toBe('seeking');
  expect(clock.isCurrent(token)).toBe(true); clock.finishSeek(60n); expect(clock.value.state).toBe('paused');
  clock.setCurrent(110n); expect(clock.value.currentNs).toBe(100n);
});
