export interface Sample { timeNs: bigint; value: number; sequence: number; }
export interface WindowStats { min: number | null; max: number | null; mean: number | null; stddev: number | null; count: number; }
export class TimeSeriesBuffer {
  private samples: Sample[] = [];
  constructor(readonly capacity = 100_000) { if (!Number.isInteger(capacity) || capacity < 2) throw new RangeError('invalid capacity'); }
  get length(): number { return this.samples.length; }
  clear(): void { this.samples = []; }
  values(startNs = -Infinity as unknown as bigint, endNs = Infinity as unknown as bigint): readonly Sample[] {
    return this.samples.filter(({ timeNs }) => timeNs >= startNs && timeNs <= endNs);
  }
  append(sample: Sample): void {
    const index = this.samples.findIndex(({ timeNs }) => timeNs > sample.timeNs);
    if (index < 0) this.samples.push(sample); else this.samples.splice(index, 0, sample);
    if (this.samples.length > this.capacity) this.samples.splice(0, this.samples.length - this.capacity);
  }
  appendMany(samples: readonly Sample[]): void { for (const sample of samples) this.append(sample); }
  stats(startNs?: bigint, endNs?: bigint): WindowStats {
    const values = this.values(startNs, endNs).map(({ value }) => value).filter(Number.isFinite);
    if (!values.length) return { min: null, max: null, mean: null, stddev: null, count: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return { min: Math.min(...values), max: Math.max(...values), mean, stddev: Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length), count: values.length };
  }
  downsample(startNs: bigint, endNs: bigint, maxPoints: number): Sample[] {
    const source = this.values(startNs, endNs); if (source.length <= maxPoints) return [...source];
    const bucket = Math.max(1, Math.floor(source.length / Math.max(1, maxPoints / 2))), output: Sample[] = [];
    for (let index = 0; index < source.length; index += bucket) {
      const group = source.slice(index, index + bucket), finite = group.filter(({ value }) => Number.isFinite(value));
      if (!finite.length) continue;
      const low = finite.reduce((a, b) => a.value < b.value ? a : b);
      const high = finite.reduce((a, b) => a.value > b.value ? a : b);
      output.push(low, high);
    }
    return output.slice(0, maxPoints).sort((a, b) => a.timeNs < b.timeNs ? -1 : 1);
  }
  toCSV(startNs?: bigint, endNs?: bigint): string {
    const rows = ['time_ns,value']; for (const sample of this.values(startNs, endNs)) rows.push(sample.timeNs.toString() + ',' + sample.value);
    return rows.join('\n') + '\n';
  }
}
export function numericFieldPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'number' || typeof value === 'boolean') return [prefix];
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) return [];
  const output: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? prefix + '.' + key : key;
    output.push(...numericFieldPaths(child, next));
  }
  return output;
}
export function readNumericField(value: unknown, path: string): number | undefined {
  let current: unknown = value;
  for (const key of path.split('.')) { if (!current || typeof current !== 'object') return undefined; current = (current as Record<string, unknown>)[key]; }
  return typeof current === 'boolean' ? (current ? 1 : 0) : typeof current === 'number' && Number.isFinite(current) ? current : undefined;
}
