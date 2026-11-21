import { describe, expect, it } from 'vitest';

import {
  MESSAGE_DATA_HEADER_BYTES,
  decodeBinaryFrame,
  encodeClientMessageData,
  FrameDecodeError,
} from '../src/framing.ts';

function buildMessageFrame(subscriptionId: number, logTime: bigint, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(MESSAGE_DATA_HEADER_BYTES + payload.byteLength);
  const view = new DataView(out.buffer);
  out[0] = 0x01;
  view.setUint32(1, subscriptionId, true);
  view.setBigUint64(5, logTime, true);
  out.set(payload, MESSAGE_DATA_HEADER_BYTES);
  return out;
}

describe('decodeBinaryFrame', () => {
  it('decodes a message-data frame without copying the payload', () => {
    const payload = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0xde, 0xad]);
    const frameBytes = buildMessageFrame(7, 1_795_172_384_589_622_939n, payload);

    const frame = decodeBinaryFrame(frameBytes);
    expect(frame.kind).toBe('messageData');
    if (frame.kind !== 'messageData') return;
    expect(frame.subscriptionId).toBe(7);
    expect(frame.logTime).toBe(1_795_172_384_589_622_939n);
    expect(Array.from(frame.payload)).toEqual([0x00, 0x01, 0x00, 0x00, 0xde, 0xad]);
    // Zero-copy: the payload view shares memory with the frame buffer.
    expect(frame.payload.buffer).toBe(frameBytes.buffer);
  });

  it('copies the payload on request', () => {
    const frameBytes = buildMessageFrame(1, 0n, new Uint8Array([1, 2, 3]));
    const frame = decodeBinaryFrame(frameBytes, true);
    if (frame.kind !== 'messageData') throw new Error('unexpected frame');
    frameBytes[frameBytes.length - 1] = 99;
    expect(Array.from(frame.payload)).toEqual([1, 2, 3]);
  });

  it('decodes a time frame', () => {
    const bytes = new Uint8Array(9);
    bytes[0] = 0x02;
    new DataView(bytes.buffer).setBigUint64(1, 1_700_000_000_000_000_000n, true);
    const frame = decodeBinaryFrame(bytes);
    expect(frame).toEqual({ kind: 'time', timestamp: 1_700_000_000_000_000_000n });
  });

  it('surfaces unknown opcodes instead of throwing', () => {
    const frame = decodeBinaryFrame(new Uint8Array([0x7f, 1, 2]));
    expect(frame.kind).toBe('unknown');
  });

  it('rejects truncated message-data frames', () => {
    expect(() => decodeBinaryFrame(new Uint8Array([0x01, 0, 0]))).toThrow(FrameDecodeError);
  });

  it('rejects empty frames', () => {
    expect(() => decodeBinaryFrame(new Uint8Array())).toThrow(FrameDecodeError);
  });
});

describe('encodeClientMessageData', () => {
  it('round-trips through the client message-data layout', () => {
    const payload = new Uint8Array([9, 9, 9]);
    const encoded = encodeClientMessageData(3, payload);
    expect(encoded[0]).toBe(0x01);
    expect(new DataView(encoded.buffer).getUint32(1, true)).toBe(3);
    expect(Array.from(encoded.subarray(5))).toEqual([9, 9, 9]);
  });
});
