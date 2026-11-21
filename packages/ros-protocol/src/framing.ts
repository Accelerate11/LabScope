/**
 * Binary frame codec for the Foxglove WebSocket protocol.
 *
 * Server -> client message data (opcode 0x01):
 *   uint8   opcode
 *   uint32  subscription id
 *   uint64  log time (ns, little-endian)
 *   uint8[] payload
 *
 * Server -> client time (opcode 0x02):
 *   uint8   opcode
 *   uint64  timestamp (ns, little-endian)
 *
 * All integers are little-endian per the protocol specification.
 */

export const OPCODE_MESSAGE_DATA = 0x01;
export const OPCODE_TIME = 0x02;

export const MESSAGE_DATA_HEADER_BYTES = 1 + 4 + 8;

export type BinaryFrame =
  | {
      kind: 'messageData';
      subscriptionId: number;
      logTime: bigint;
      payload: Uint8Array;
    }
  | { kind: 'time'; timestamp: bigint }
  | { kind: 'unknown'; opcode: number; raw: Uint8Array };

export class FrameDecodeError extends Error {
  override readonly name = 'FrameDecodeError';
}

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

/**
 * Decode one server -> client binary frame.
 *
 * @param data raw WebSocket binary message
 * @param copy when true the returned payload is an independent copy; when false
 *   it is a zero-copy view into `data` (safe because each WebSocket message
 *   arrives in its own buffer).
 */
export function decodeBinaryFrame(data: ArrayBuffer | Uint8Array, copy = false): BinaryFrame {
  const bytes = toUint8(data);
  if (bytes.byteLength < 1) throw new FrameDecodeError('empty binary frame');

  const opcode = bytes[0] as number;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (opcode) {
    case OPCODE_MESSAGE_DATA: {
      if (bytes.byteLength < MESSAGE_DATA_HEADER_BYTES) {
        throw new FrameDecodeError(
          `message-data frame is ${bytes.byteLength} bytes, need at least ${MESSAGE_DATA_HEADER_BYTES}`,
        );
      }
      const subscriptionId = view.getUint32(1, true);
      const logTime = view.getBigUint64(5, true);
      const rawPayload = bytes.subarray(MESSAGE_DATA_HEADER_BYTES);
      const payload = copy ? Uint8Array.from(rawPayload) : rawPayload;
      return { kind: 'messageData', subscriptionId, logTime, payload };
    }
    case OPCODE_TIME: {
      if (bytes.byteLength < 9) {
        throw new FrameDecodeError(`time frame is ${bytes.byteLength} bytes, need at least 9`);
      }
      return { kind: 'time', timestamp: view.getBigUint64(1, true) };
    }
    default:
      return { kind: 'unknown', opcode, raw: bytes };
  }
}

/**
 * Encode a client -> server message-data frame (opcode 0x01):
 *   uint8 opcode, uint32 channel id, uint8[] payload.
 *
 * Reserved for the (disabled by default) client-publish path; implemented and
 * unit-tested now so the framing code is not half-written later.
 */
export function encodeClientMessageData(channelId: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.byteLength);
  const view = new DataView(out.buffer);
  out[0] = OPCODE_MESSAGE_DATA;
  view.setUint32(1, channelId, true);
  out.set(payload, 5);
  return out;
}
