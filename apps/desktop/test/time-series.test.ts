import { expect, it } from 'vitest';
import { TimeSeriesBuffer, numericFieldPaths, readNumericField } from '../src/renderer/src/plot/time-series';
it('extracts nested scalar fields including booleans', () => {
  const value = { orientation: { x: 1, y: 2 }, active: true, points: [{ x: 4 }] };
  expect(numericFieldPaths(value)).toEqual(['orientation.x','orientation.y','active','points.0.x']);
  expect(readNumericField(value, 'orientation.x')).toBe(1);
  expect(readNumericField(value, 'active')).toBe(1);
});
it('keeps ordered out-of-order samples and bounded capacity', () => {
  const buffer = new TimeSeriesBuffer(3);
  buffer.append({ timeNs: 30n, value: 3, sequence: 3 });
  buffer.append({ timeNs: 10n, value: 1, sequence: 1 });
  buffer.append({ timeNs: 20n, value: 2, sequence: 2 });
  buffer.append({ timeNs: 40n, value: 4, sequence: 4 });
  expect(buffer.values().map((sample) => sample.timeNs)).toEqual([20n,30n,40n]);
});
it('preserves extrema with min-max downsampling and exports CSV', () => {
  const buffer = new TimeSeriesBuffer(100);
  for (let i=0;i<100;i++) buffer.append({ timeNs: BigInt(i), value: i === 42 ? 1000 : i, sequence: i });
  const samples = buffer.downsample(0n, 99n, 10);
  expect(samples.some(({ value }) => value === 1000)).toBe(true);
  expect(buffer.stats()).toMatchObject({ min: 0, max: 1000, count: 100 });
  expect(buffer.toCSV(0n, 1n)).toContain('time_ns,value\n0,0');
});
