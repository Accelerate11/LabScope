import { expect, it } from 'vitest';
import { decodeImage } from '../src/renderer/src/camera/image-decoder';
function image(encoding: string, width = 2, height = 2, step = 0, data?: Uint8Array, big = false) {
  const bpp = encoding === 'rgb8' || encoding === 'bgr8' ? 3 : encoding === 'rgba8' || encoding === 'bgra8' ? 4 : encoding === 'mono8' ? 1 : encoding === '32FC1' ? 4 : 2;
  return { header: { stamp: { sec: 4, nanosec: 5 }, frame_id: 'camera_optical_frame' }, width, height, encoding,
    is_bigendian: big, step: step || width * bpp, data: data ?? new Uint8Array((step || width * bpp) * height) };
}
it.each(['rgb8','bgr8','rgba8','bgra8','mono8','mono16','16UC1','32FC1'])('decodes %s with row padding and metadata', (encoding) => {
  const bpp = encoding === 'rgb8' || encoding === 'bgr8' ? 3 : encoding === 'rgba8' || encoding === 'bgra8' ? 4 : encoding === 'mono8' ? 1 : encoding === '32FC1' ? 4 : 2;
  const data = new Uint8Array((2 * bpp + 3) * 2); data[0] = 10; data[1] = 20; data[2] = 30;
  const decoded = decodeImage(image(encoding, 2, 2, 2 * bpp + 3, data));
  expect(decoded.width).toBe(2); expect(decoded.height).toBe(2); expect(decoded.frameId).toBe('camera_optical_frame');
  expect(decoded.stampNs).toBe(4_000_000_005n);
});
it('converts BGR and counts invalid float depths', () => {
  const decoded = decodeImage(image('bgr8', 1, 1, 3, new Uint8Array([1, 2, 3])));
  expect([...decoded.rgba]).toEqual([3, 2, 1, 255]);
  const bytes = new Uint8Array(8), view = new DataView(bytes.buffer);
  view.setFloat32(0, 2, true); view.setFloat32(4, NaN, true);
  const depth = decodeImage(image('32FC1', 2, 1, 8, bytes));
  expect(depth.validPixels).toBe(1); expect(depth.invalidPixels).toBe(1); expect(depth.minDepth).toBe(2);
});
it('rejects invalid encoding, step and data', () => {
  expect(() => decodeImage(image('xyz8'))).toThrow();
  expect(() => decodeImage({ ...image('rgb8'), step: 1 })).toThrow();
  expect(() => decodeImage({ ...image('rgb8'), data: new Uint8Array(1) })).toThrow();
});
