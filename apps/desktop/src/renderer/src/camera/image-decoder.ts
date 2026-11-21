export type ImageEncoding =
  | 'rgb8' | 'bgr8' | 'rgba8' | 'bgra8' | 'mono8' | 'mono16' | '16UC1' | '32FC1';

export interface DecodedImage {
  width: number;
  height: number;
  encoding: ImageEncoding;
  frameId: string;
  stampNs: bigint | null;
  rgba: Uint8ClampedArray;
  validPixels: number;
  invalidPixels: number;
  minDepth: number | null;
  maxDepth: number | null;
}

const known = new Set<ImageEncoding>(['rgb8','bgr8','rgba8','bgra8','mono8','mono16','16UC1','32FC1']);
const byteOrder = (message: Record<string, unknown>) => message.is_bigendian === true || message.is_bigendian === 1;
function stampNs(header: unknown): bigint | null {
  if (!header || typeof header !== 'object') return null;
  const value = header as Record<string, unknown>, stamp = value.stamp;
  if (!stamp || typeof stamp !== 'object') return null;
  const s = stamp as Record<string, unknown>;
  if (typeof s.sec !== 'number' || typeof s.nanosec !== 'number') return null;
  return BigInt(s.sec) * 1_000_000_000n + BigInt(s.nanosec);
}
function bytesPerPixel(encoding: ImageEncoding): number {
  return encoding === 'rgb8' || encoding === 'bgr8' ? 3 :
    encoding === 'rgba8' || encoding === 'bgra8' ? 4 : encoding === 'mono8' ? 1 : encoding === '32FC1' ? 4 : 2;
}
function normalize8(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }
function depthValue(view: DataView, offset: number, encoding: ImageEncoding, little: boolean): number {
  if (encoding === '32FC1') return view.getFloat32(offset, little);
  return view.getUint16(offset, little);
}
export function decodeImage(value: unknown, options: { depthUnitMeters?: number; depthRange?: [number, number] } = {}): DecodedImage {
  if (!value || typeof value !== 'object') throw new Error('Image 消息无效');
  const message = value as Record<string, unknown>;
  const width = message.width as number, height = message.height as number, step = message.step as number, encoding = message.encoding as string;
  const data = message.data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      !Number.isInteger(step) || step <= 0 || typeof encoding !== 'string' || !known.has(encoding as ImageEncoding) ||
      !(data instanceof Uint8Array)) throw new Error('Image 字段无效');
  const kind = encoding as ImageEncoding, bpp = bytesPerPixel(kind);
  if (step < width * bpp || data.byteLength < step * height) throw new Error('Image 行步长或数据长度无效');
  const rgba = new Uint8ClampedArray(width * height * 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const little = !byteOrder(message), depth = kind === '32FC1' || kind === '16UC1' || kind === 'mono16';
  let validPixels = 0, invalidPixels = 0, minDepth = Infinity, maxDepth = -Infinity;
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const source = row * step + col * bpp, target = (row * width + col) * 4;
    if (depth) {
    const raw = depthValue(view, source, kind, little);
      const meters = kind === '32FC1' ? raw : raw * (options.depthUnitMeters ?? 0.001);
      if (!Number.isFinite(meters) || meters <= 0) {
        invalidPixels++; rgba[target + 3] = 0; continue;
      }
      validPixels++; minDepth = Math.min(minDepth, meters); maxDepth = Math.max(maxDepth, meters);
      const min = options.depthRange?.[0] ?? 0;
      const max = options.depthRange?.[1] ?? 10;
      const normalized = Math.max(0, Math.min(1, (meters - min) / Math.max(1e-9, max - min)));
      const gray = normalize8((1 - normalized) * 255);
      rgba[target] = gray; rgba[target + 1] = gray; rgba[target + 2] = gray; rgba[target + 3] = 255;
    } else if (kind === 'mono8') {
      const gray = view.getUint8(source); rgba[target] = rgba[target + 1] = rgba[target + 2] = gray; rgba[target + 3] = 255;
    } else {
      const rgb = kind === 'bgr8' || kind === 'bgra8' ? [2, 1, 0] : [0, 1, 2];
      rgba[target] = view.getUint8(source + rgb[0]!); rgba[target + 1] = view.getUint8(source + rgb[1]!);
      rgba[target + 2] = view.getUint8(source + rgb[2]!); rgba[target + 3] = kind === 'rgba8' || kind === 'bgra8' ? view.getUint8(source + 3) : 255;
    }
  }
  return { width, height, encoding: kind, frameId: typeof (message.header as Record<string, unknown>)?.frame_id === 'string' ? (message.header as Record<string, unknown>).frame_id as string : '',
    stampNs: stampNs(message.header), rgba, validPixels, invalidPixels,
    minDepth: Number.isFinite(minDepth) ? minDepth : null, maxDepth: Number.isFinite(maxDepth) ? maxDepth : null };
}
export async function decodeCompressedImage(value: unknown): Promise<DecodedImage> {
  if (!value || typeof value !== 'object') throw new Error('CompressedImage 消息无效');
  const data = (value as Record<string, unknown>).data;
  if (!(data instanceof Uint8Array)) throw new Error('CompressedImage data 无效');
  if (typeof createImageBitmap !== 'function') throw new Error('当前环境不支持图片解码');
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d'); if (!context) { bitmap.close(); throw new Error('无法创建图片解码画布'); }
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const header = (value as Record<string, unknown>).header as Record<string, unknown> | undefined;
  return { width: canvas.width, height: canvas.height, encoding: 'rgba8', frameId: typeof header?.frame_id === 'string' ? header.frame_id : '',
    stampNs: stampNs(header), rgba: pixels.data, validPixels: canvas.width * canvas.height, invalidPixels: 0, minDepth: null, maxDepth: null };
}
export function imageToCanvas(image: DecodedImage, canvas: HTMLCanvasElement, mode: 'fit' | 'native' = 'fit'): void {
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('无法创建 Canvas 2D 上下文');
  const data = new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height);
  context.putImageData(data, 0, 0);
  if (mode === 'fit') canvas.style.imageRendering = 'auto';
}
