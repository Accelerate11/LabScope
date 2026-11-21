import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { messageBus, type MessageEnvelope } from '../workspace/message-bus';
import { decodeCompressedImage, decodeImage, imageToCanvas, type DecodedImage } from './image-decoder';

const field = 'focus-ring rounded border border-border bg-bg px-2 py-1 text-[11px] text-ink';
const button = 'focus-ring rounded border border-border px-2 py-1 text-[11px] text-ink hover:border-accent';
const imageSchemas = new Set(['sensor_msgs/msg/Image','sensor_msgs/msg/CompressedImage']);
function useChannels(source: MessageEnvelope['source']) {
  const subscribe = useCallback((listener: () => void) => messageBus.subscribeChannels(source, listener), [source]);
  const read = useCallback(() => messageBus.getChannels(source), [source]);
  return useSyncExternalStore(subscribe, read);
}
function useMessage(source: MessageEnvelope['source'], topic: string | null): MessageEnvelope | undefined {
  const subscribe = useCallback((listener: () => void) => topic ? messageBus.subscribe(source, topic, listener) : () => {}, [source, topic]);
  const read = useCallback(() => topic ? messageBus.getLatest(source, topic) : undefined, [source, topic]);
  return useSyncExternalStore(subscribe, read);
}
function ns(value: bigint | null): string { return value === null ? '—' : value.toString(); }

export default function CameraViewer({ config, update }: { config: { source: MessageEnvelope['source']; topic: string | null }; update?: (patch: { topic?: string | null }) => void }): React.JSX.Element {
  const channels = useChannels(config.source);
  const imageTopics = channels.filter(({ schemaName }) => imageSchemas.has(schemaName));
  const cameraInfoTopics = channels.filter(({ schemaName }) => schemaName === 'sensor_msgs/msg/CameraInfo');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'fit' | 'native'>('fit');
  const [range, setRange] = useState<[number, number]>([0, 10]);
  const [autoRange, setAutoRange] = useState(true);
  const [depthUnit, setDepthUnit] = useState(0.001);
  const [image, setImage] = useState<DecodedImage>();
  const [info, setInfo] = useState<Record<string, unknown>>();
  const [error, setError] = useState<string>();
  const [decodedAt, setDecodedAt] = useState(0);
  const source = config.source, topic = config.topic;
  const message = useMessage(source, topic);
  const infoTopic = cameraInfoTopics[0]?.topic;
  const infoMessage = useMessage(source, infoTopic ?? null);

  useEffect(() => {
    let cancelled = false;
    const decode = async () => {
      setError(undefined);
      if (!message || message.payload.kind !== 'decoded') { setImage(undefined); return; }
      try {
        const started = performance.now();
        const next = message.schemaName === 'sensor_msgs/msg/CompressedImage'
          ? await decodeCompressedImage(message.payload.value) : decodeImage(message.payload.value, {
            depthUnitMeters: depthUnit, depthRange: autoRange ? undefined : range,
          });
        if (!cancelled) { setImage(next); setDecodedAt(performance.now() - started); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    void decode();
    return () => { cancelled = true; };
  }, [message?.sequence, message?.schemaName, depthUnit, autoRange, range[0], range[1]]);

  useEffect(() => {
    if (!image || !canvas.current) return;
    imageToCanvas(image, canvas.current, mode);
  }, [image, mode, range, autoRange]);

  useEffect(() => {
    if (infoMessage?.payload.kind === 'decoded' && infoMessage.payload.value && typeof infoMessage.payload.value === 'object') {
      setInfo(infoMessage.payload.value as Record<string, unknown>);
    }
  }, [infoMessage?.sequence]);

  const selectedChannel = imageTopics.find(({ topic: item }) => item === topic)?.topic ?? imageTopics[0]?.topic ?? '';
  const depth = image?.encoding === '16UC1' || image?.encoding === '32FC1' || image?.encoding === 'mono16';
  return (
    <div className="flex min-h-[240px] flex-1 flex-col gap-2 p-2 text-[11px] text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <label>图像话题
          <select className={field} value={selectedChannel} onChange={(e) => {
            update?.({ topic: e.target.value || null });
          }}>
            {!selectedChannel && <option value="">等待图像话题</option>}
            {imageTopics.map(({ topic: item }) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button className={button} type="button" onClick={() => setMode(mode === 'fit' ? 'native' : 'fit')}>{mode === 'fit' ? '原始尺寸' : '适应窗口'}</button>
        {depth && <><label>最小深度 <input className={field + ' w-16'} type="number" value={range[0]} onChange={(e) => setRange([Number(e.target.value), range[1]])} /></label>
          <label>最大深度 <input className={field + ' w-16'} type="number" value={range[1]} onChange={(e) => setRange([range[0], Number(e.target.value)])} /></label>
          <label>16UC1 单位(m/计数) <input className={field + ' w-20'} type="number" min={0.000001} step={0.0001} value={depthUnit}
            onChange={(e) => setDepthUnit(Math.max(0.000001, Number(e.target.value)))} /></label>
          <label><input type="checkbox" checked={autoRange} onChange={(e) => setAutoRange(e.target.checked)} /> 自动范围</label></>}
      </div>
      <div className="relative min-h-[150px] flex-1 overflow-auto rounded border border-border bg-black">
        <canvas ref={canvas} className={mode === 'fit' ? 'h-full w-full object-contain' : ''} />
        {!image && <div className="absolute inset-0 grid place-items-center">{error ?? '等待图像数据…'}</div>}
        {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 text-danger">{error}</div>}
      </div>
      <div className="flex flex-wrap gap-3 mono">
        <span>{image?.width ?? 0}×{image?.height ?? 0}</span><span>{image?.encoding ?? '—'}</span>
        <span>frame {image?.frameId || '—'}</span><span>stamp {ns(image?.stampNs ?? null)}</span>
        {depth && <span>有效 {image?.validPixels ?? 0} · 无效 {image?.invalidPixels ?? 0} · {autoRange ? '自动' : range.join('–') + ' m'}</span>}
        <span>decode {decodedAt.toFixed(2)} ms</span>
      </div>
      {info && <details className="max-h-36 overflow-auto rounded border border-border p-2">
        <summary>CameraInfo</summary><pre className="mono whitespace-pre-wrap">{JSON.stringify(info, null, 2)}</pre>
      </details>}
    </div>
  );
}
