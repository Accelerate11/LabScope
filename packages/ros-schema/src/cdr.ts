/**
 * CDR (Common Data Representation) reader for ROS 2 messages.
 *
 * Wire facts confirmed against `foxglove_bridge` 3.6.3 on ROS 2 Humble
 * (see docs/m0/REPORT.md): every payload starts with a 4-byte OMG CDR
 * encapsulation header (`00 01 00 00` for little-endian), and alignment of
 * subsequent fields is computed relative to the byte *after* that header.
 *
 * CDR padding rule: a value of size N must start at an offset that is a
 * multiple of N, where the offset is measured from the start of the body.
 */

import { CdrDecodeError, UnsupportedTypeError } from './types.ts';

export interface CdrReaderOptions {
  /** Offset of the first field, i.e. how many header bytes to skip. */
  base?: number;
  littleEndian?: boolean;
}

/** Maximum alignment CDR uses (largest primitive is 8 bytes). */
const MAX_ALIGN = 8;

export class CdrReader {
  readonly buffer: Uint8Array;
  readonly littleEndian: boolean;
  private readonly view: DataView;
  private readonly base: number;
  private pos: number;

  constructor(buffer: Uint8Array, options: CdrReaderOptions = {}) {
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.base = options.base ?? 0;
    this.littleEndian = options.littleEndian ?? true;
    this.pos = this.base;
  }

  /** Bytes consumed since the start of the CDR body. */
  get offset(): number {
    return this.pos - this.base;
  }

  /** Absolute byte offset inside the payload buffer. */
  get absoluteOffset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.buffer.byteLength - this.pos;
  }

  private ensure(bytes: number): void {
    if (bytes < 0 || this.pos + bytes > this.buffer.byteLength) {
      throw new CdrDecodeError(
        `out of bounds: need ${bytes} byte(s) but only ${this.remaining} left`,
        this.offset,
      );
    }
  }

  align(size: number): void {
    if (size <= 1) return;
    if (size > MAX_ALIGN) size = MAX_ALIGN;
    const relative = this.pos - this.base;
    const remainder = relative % size;
    if (remainder !== 0) {
      this.pos += size - remainder;
      this.ensure(0);
    }
  }

  u8(): number {
    this.ensure(1);
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  i8(): number {
    this.ensure(1);
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    this.align(2);
    this.ensure(2);
    const v = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return v;
  }

  i16(): number {
    this.align(2);
    this.ensure(2);
    const v = this.view.getInt16(this.pos, this.littleEndian);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.align(4);
    this.ensure(4);
    const v = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.align(4);
    this.ensure(4);
    const v = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }

  u64(): bigint {
    this.align(8);
    this.ensure(8);
    const v = this.view.getBigUint64(this.pos, this.littleEndian);
    this.pos += 8;
    return v;
  }

  i64(): bigint {
    this.align(8);
    this.ensure(8);
    const v = this.view.getBigInt64(this.pos, this.littleEndian);
    this.pos += 8;
    return v;
  }

  f32(): number {
    this.align(4);
    this.ensure(4);
    const v = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.align(8);
    this.ensure(8);
    const v = this.view.getFloat64(this.pos, this.littleEndian);
    this.pos += 8;
    return v;
  }

  /**
   * CDR string: uint32 length (including the trailing NUL) followed by UTF-8
   * bytes. ROS 2 serializes a trailing NUL inside the counted length.
   */
  string(): string {
    const length = this.u32();
    if (length === 0) return '';
    this.ensure(length);
    const bytes = this.buffer.subarray(this.pos, this.pos + length);
    this.pos += length;
    // Strip the NUL terminator if present.
    const end = bytes.length > 0 && bytes[bytes.length - 1] === 0 ? bytes.length - 1 : bytes.length;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, end));
  }

  /**
   * `wstring` uses a platform-dependent width in XCDR1 and is not emitted by
   * any message type in the supported set. Failing loudly is deliberate: a
   * silent wrong decode would corrupt recorded data.
   */
  wstring(): never {
    throw new UnsupportedTypeError(
      'wstring decoding is not implemented (no supported message type uses it)',
    );
  }

  /** Zero-copy view over the next `length` bytes. */
  bytesView(length: number): Uint8Array {
    this.ensure(length);
    const view = this.buffer.subarray(this.pos, this.pos + length);
    this.pos += length;
    return view;
  }

  /** Copy of the next `length` bytes. */
  copyBytes(length: number): Uint8Array {
    return Uint8Array.from(this.bytesView(length));
  }
}

export interface EncapsulationInfo {
  /** Header bytes to skip before the first field. */
  skip: number;
  littleEndian: boolean;
  /** `'cdr'` when an OMG CDR header was detected, `'none'` when raw. */
  kind: 'cdr' | 'none';
}

/**
 * Detect an OMG CDR encapsulation header.
 *
 * Representation identifier is a big-endian uint16: `0x0000` = CDR_BE,
 * `0x0001` = CDR_LE, followed by two option bytes.
 */
export function detectEncapsulation(payload: Uint8Array): EncapsulationInfo {
  if (payload.byteLength >= 4 && payload[0] === 0x00 && payload[2] === 0x00 && payload[3] === 0x00) {
    const second = payload[1];
    if (second === 0x00 || second === 0x01) {
      return { skip: 4, littleEndian: second === 0x01, kind: 'cdr' };
    }
  }
  return { skip: 0, littleEndian: true, kind: 'none' };
}
