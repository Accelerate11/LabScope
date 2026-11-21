/**
 * Minimal CDR writer used by tests to build ROS 2 payloads byte-by-byte.
 * Mirrors the alignment rules implemented by the decoder.
 */

export class CdrWriter {
  private readonly chunks: number[] = [];
  /** Alignment origin: 4 once an encapsulation header has been written. */
  private base = 0;

  get length(): number {
    return this.chunks.length;
  }

  private push(bytes: number[]): void {
    this.chunks.push(...bytes);
  }

  private align(size: number): void {
    while ((this.chunks.length - this.base) % size !== 0) this.chunks.push(0);
  }

  encapsulationLittleEndian(): this {
    this.push([0x00, 0x01, 0x00, 0x00]);
    this.base = 4;
    return this;
  }

  u8(value: number): this {
    this.push([value & 0xff]);
    return this;
  }

  i8(value: number): this {
    this.push([value & 0xff]);
    return this;
  }

  u16(value: number): this {
    this.align(2);
    this.push([value & 0xff, (value >> 8) & 0xff]);
    return this;
  }

  u32(value: number): this {
    this.align(4);
    this.push([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
    return this;
  }

  i32(value: number): this {
    return this.u32(value >>> 0);
  }

  f32(value: number): this {
    this.align(4);
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    this.push([...new Uint8Array(buf)]);
    return this;
  }

  f64(value: number): this {
    this.align(8);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    this.push([...new Uint8Array(buf)]);
    return this;
  }

  string(value: string): this {
    const encoded = new TextEncoder().encode(value);
    this.u32(encoded.length + 1);
    this.push([...encoded, 0]);
    return this;
  }

  /** Raw bytes, no length prefix (for `uint8[]` bodies). */
  raw(bytes: Uint8Array): this {
    this.push([...bytes]);
    return this;
  }

  /** `uint8[]` sequence: length prefix + raw bytes. */
  bytes(bytes: Uint8Array): this {
    this.u32(bytes.length);
    return this.raw(bytes);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}
