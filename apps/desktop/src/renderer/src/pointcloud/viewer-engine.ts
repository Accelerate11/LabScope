import {
  AxesHelper, Box3, Color, GridHelper, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { MessageBus, MessageEnvelope, SourceId } from '../workspace/message-bus';
import { CameraController } from '../spatial/camera-controller';
import type { CameraState, Projection, ViewPreset } from '../spatial/camera-state';
import { nanoseconds } from '../spatial/ros';
import { defaultScene, type SceneSettings } from '../spatial/scene-settings';
import { SpatialScene } from '../spatial/spatial-scene';
import { TransformError } from '../spatial/tf-buffer';
import type { LayerStyle } from './config';
import { GpuCloud } from './gpu-layer';
import { decodeDisplayCloud, type ProcessedCloud } from './processor';
import { UploadTimer } from './upload-timer';

export interface LayerBinding extends LayerStyle {
  id: string;
  source: SourceId;
  topic: string;
}

export interface LayerStats {
  id: string;
  topic: string;
  source: SourceId;
  visible: boolean;
  count: number;
  inputCount: number;
  validCount: number;
  invalid: number;
  frame: string | null;
  stamp: string | null;
  logTimeNs: string | null;
  effectiveColor: LayerStyle['colorMode'] | null;
  error: string | null;
  frameMismatch: boolean;
  allocations: number;
  uploads: number;
}

export interface ViewerStats {
  measuredAt: number;
  fps: number;
  frameMs: number;
  frameSubmitMs: number;
  decodeMs: number | null;
  processMs: number | null;
  uploadSubmitMs: number | null;
  uploadGpuMs: number | null;
  gpuTimerAvailable: boolean;
  gpuSamples: number;
  samples: number;
  frames: number;
  queue: number;
  queuePeak: number;
  tfPending: number;
  dropped: number;
  points: number;
  cpuBytes: number;
  gpuBytes: number;
  heapBytes: number | null;
  layers: LayerStats[];
  fixedFrame: string | null;
  scene: SpatialScene['stats'];
  geometries: number;
  textures: number;
}

interface Layer {
  binding: LayerBinding;
  gpu: GpuCloud;
  detach: (() => void) | undefined;
  next: MessageEnvelope | undefined;
  dirty: boolean;
  cloud: ProcessedCloud | undefined;
  logTimeNs: string | null;
  error: string | null;
  candidate?: ProcessedCloud;
  candidateTime?: string | null;
  tfRevision?: number;
  transformError?: string | null;
}

function counters() {
  return { frames: 0, submit: 0, samples: 0, decode: 0, process: 0, uploads: 0, upload: 0, gpuSamples: 0, gpu: 0 };
}

export class PointCloudViewerEngine {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: WebGLRenderer;
  private readonly gl: WebGL2RenderingContext;
  private readonly timer: UploadTimer;
  private readonly scene = new Scene();
  private readonly camera: CameraController;
  private readonly spatial: SpatialScene;
  private readonly grid = new GridHelper(24, 24, 0x57738a, 0x273744);
  private readonly axis = new AxesHelper(1.8);
  private readonly resize: ResizeObserver;
  private readonly layers = new Map<string, Layer>();
  private rows: Layer[] = [];
  private ready: Layer[] = [];
  private statsSince = performance.now();
  private window = counters();
  private animationId = 0;
  private stopped = false;
  private peakQueue = 0;
  private dropped = 0;
  private scale = 1;
  private sceneSettings = defaultScene;
  private sceneSource: SourceId = 'live';
  private sourcesKey = '';

  constructor(private readonly host: HTMLElement, private readonly bus: MessageBus,
    private readonly onStats: (stats: ViewerStats) => void, private readonly onError: (error: string) => void,
    onCamera: (state: CameraState) => void = () => {}) {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('当前环境无法创建 WebGL2 上下文');
    this.gl = gl;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, context: gl });
    this.timer = new UploadTimer(gl);
    this.canvas.className = 'block h-full w-full touch-none outline-none';
    this.canvas.setAttribute('aria-label', 'WebGL2 点云场景');
    this.canvas.addEventListener('webglcontextlost', this.loseContext);
    this.host.appendChild(this.canvas);
    this.scene.background = new Color('#0b141e');
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid, this.axis);
    this.spatial = new SpatialScene(bus, this.scene);
    this.camera = new CameraController(this.canvas, () => this.bounds(), onCamera);
    this.resize = new ResizeObserver(this.fitCanvas);
    this.resize.observe(host);
    this.fitCanvas();
    this.animationId = requestAnimationFrame(this.render);
  }

  get canvasElement(): HTMLCanvasElement { return this.canvas; }

  private fitCanvas = (): void => {
    const { width, height } = this.host.getBoundingClientRect();
    this.scale = Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.resize(Math.max(1, width) / Math.max(1, height));
  };

  private loseContext = (): void => {
    this.stopped = true;
    cancelAnimationFrame(this.animationId);
    this.onError('WebGL2 上下文已丢失');
  };

  resetView(): void { this.camera.reset(); }
  setProjection(projection: Projection): void { this.camera.select(projection); }
  preset(view: ViewPreset): void { this.camera.preset(view); }
  restoreCamera(state: CameraState): void { this.camera.restore(state); }
  focus(): void { this.camera.focus(); }

  private bounds(): Box3 {
    const bounds = this.spatial.bounds();
    for (const { cloud, gpu } of this.rows) {
      if (!gpu.points.visible || !cloud?.drawnPoints) continue;
      gpu.points.updateMatrix();
      bounds.union(new Box3(new Vector3(...cloud.bounds.min), new Vector3(...cloud.bounds.max)).applyMatrix4(gpu.points.matrix));
    }
    return bounds;
  }

  configureScene(settings: SceneSettings, primary: SourceId): void {
    if (settings.fixedFrame !== this.sceneSettings.fixedFrame) {
      for (const layer of this.rows) {
        layer.cloud = undefined;
        layer.gpu.clear();
        if (layer.detach) this.enqueue(layer, this.bus.getLatest(layer.binding.source, layer.binding.topic), false);
      }
    }
    this.sceneSettings = settings;
    this.sceneSource = primary;
    this.syncScene();
  }

  private syncScene(): void {
    const sources = [...new Set(this.rows.filter((layer) => layer.binding.visible).map((layer) => layer.binding.source))];
    const key = JSON.stringify([this.sceneSource, sources, this.sceneSettings]);
    if (key === this.sourcesKey) return;
    this.sourcesKey = key;
    this.spatial.sync(this.sceneSettings, this.sceneSource, sources);
  }

  sync(bindings: readonly LayerBinding[]): void {
    if (this.stopped) return;
    for (const [id, layer] of this.layers) {
      const binding = bindings.find((entry) => entry.id === id);
      if (binding && binding.topic === layer.binding.topic && binding.source === layer.binding.source) continue;
      layer.detach?.();
      layer.gpu.dispose();
      this.layers.delete(id);
    }
    this.rows = bindings.map((binding) => {
      let layer = this.layers.get(binding.id);
      if (!layer) {
        layer = { binding, gpu: new GpuCloud(this.gl, this.scene), detach: undefined, next: undefined, dirty: false,
          cloud: undefined, logTimeNs: null, error: null };
        this.layers.set(binding.id, layer);
      }
      const current = layer;
      const previous = current.binding;
      current.binding = binding;
      if (!binding.visible) {
        current.detach?.();
        current.detach = undefined;
        current.next = undefined;
        current.dirty = false;
        current.gpu.points.visible = false;
      } else if (!current.detach) {
        const receive = () => this.enqueue(current, this.bus.getLatest(binding.source, binding.topic));
        current.detach = this.bus.subscribe(binding.source, binding.topic, receive);
        receive();
      } else if (previous.colorMode !== binding.colorMode || previous.sampling !== binding.sampling ||
          previous.maxPoints !== binding.maxPoints || previous.fixedColor !== binding.fixedColor ||
          previous.intensityRange !== binding.intensityRange || previous.heightRange !== binding.heightRange) {
        this.enqueue(current, this.bus.getLatest(binding.source, binding.topic), false);
      }
      return current;
    });
    this.syncScene();
  }

  private enqueue(layer: Layer, message: MessageEnvelope | undefined, countDrops = true): void {
    if (countDrops && layer.next && layer.next !== message) this.dropped++;
    layer.next = message;
    layer.dirty = true;
    this.peakQueue = Math.max(this.peakQueue, this.queueDepth());
  }

  private queueDepth(): number {
    let depth = 0;
    for (const layer of this.layers.values()) if (layer.next) depth++;
    return depth;
  }

  private prepare(layer: Layer): void {
    if (!layer.dirty) return;
    layer.dirty = false;
    const message = layer.next;
    layer.next = undefined;
    layer.error = null;
    if (message && layer.candidate) this.dropped++;
    layer.candidate = undefined;
    layer.candidateTime = message?.logTimeNs ?? null;
    layer.transformError = null;
    layer.tfRevision = undefined;
    if (message) {
      try {
        const started = performance.now();
        const decoded = decodeDisplayCloud(message);
        const decodedAt = performance.now();
        layer.candidate = layer.gpu.processor.process(decoded, layer.binding);
        this.window.decode += decodedAt - started;
        this.window.process += performance.now() - decodedAt;
        this.window.samples++;
        if (layer.candidate.drawnPoints > 0) return;
      } catch (cause) {
        layer.error = cause instanceof Error ? cause.message : String(cause);
        layer.cloud = undefined;
      }
    } else {
      layer.cloud = undefined;
    }
    layer.cloud = layer.candidate;
    layer.candidate = undefined;
    layer.logTimeNs = layer.candidateTime ?? null;
    layer.gpu.clear();
  }

  private transform(layer: Layer): void {
    const cloud = layer.candidate;
    if (!cloud) return;
    const fixed = this.sceneSettings.fixedFrame;
    const revision = this.spatial.revision(layer.binding.source);
    if (layer.tfRevision === revision) return;
    layer.tfRevision = revision;
    try {
      const points = layer.gpu.points;
      if (fixed) {
        const transform = this.spatial.transform(layer.binding.source, cloud.frameId, nanoseconds(cloud.stamp), fixed);
        points.position.copy(transform.translation);
        points.quaternion.copy(transform.rotation);
      } else {
        points.position.set(0, 0, 0);
        points.quaternion.identity();
      }
    } catch (error) {
      layer.transformError = (error as Error).message;
      // Keep a previously transformed cloud while waiting for the next bracket only.
      if (!(error instanceof TransformError) || error.code !== 'future') {
        layer.cloud = undefined;
        layer.gpu.clear();
      }
      return;
    }
    layer.transformError = null;
    layer.cloud = cloud;
    layer.logTimeNs = layer.candidateTime ?? null;
    layer.candidate = undefined;
    this.ready.push(layer);
  }

  private upload(): void {
    if (!this.ready.length) return;
    this.timer.begin();
    const started = performance.now();
    try {
      for (const { gpu, cloud } of this.ready) gpu.upload(cloud!);
    } finally {
      this.window.upload += performance.now() - started;
      this.window.uploads++;
      this.timer.end();
      this.ready.length = 0;
    }
  }

  private referenceLayer(): Layer | undefined {
    return this.rows.find(({ binding, cloud }) => binding.visible && cloud && cloud.drawnPoints > 0);
  }

  private framesMatch(reference: Layer | undefined, layer: Layer): boolean {
    if (this.sceneSettings.fixedFrame) return !!layer.cloud;
    return reference === layer || (!!reference?.cloud?.frameId && reference.cloud.frameId === layer.cloud?.frameId);
  }

  private render = (): void => {
    if (this.stopped) return;
    try {
      const gpu = this.timer.poll();
      if (gpu) {
        this.window.gpu += gpu.totalMs;
        this.window.gpuSamples += gpu.samples;
      }
      for (const layer of this.rows) {
        this.prepare(layer);
        this.transform(layer);
      }
      this.upload();
      const reference = this.referenceLayer();
      for (const layer of this.rows) {
        layer.gpu.points.visible = layer.binding.visible && !!layer.cloud?.drawnPoints && this.framesMatch(reference, layer);
        layer.gpu.setPointSize(layer.binding.pointSize * this.scale);
      }
      const started = performance.now();
      this.spatial.update(reference?.cloud?.frameId || null);
      this.camera.update();
      this.renderer.render(this.scene, this.camera.camera);
      const finished = performance.now();
      this.window.frames++;
      this.window.submit += finished - started;
      if (finished - this.statsSince >= 500) this.report(finished, reference);
      this.animationId = requestAnimationFrame(this.render);
    } catch (error) {
      this.stopped = true;
      this.onError(error instanceof Error ? error.message : String(error));
    }
  };

  private report(now: number, reference: Layer | undefined): void {
    const elapsed = now - this.statsSince, counts = this.window;
    this.statsSince = now;
    this.window = counters();
    const mean = (sum: number, count: number) => count ? sum / count : null;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    this.onStats({
      measuredAt: now, fps: counts.frames * 1000 / elapsed, frameMs: elapsed / counts.frames,
      frameSubmitMs: counts.submit / counts.frames, samples: counts.samples, frames: counts.frames,
      decodeMs: mean(counts.decode, counts.samples), processMs: mean(counts.process, counts.samples),
      uploadSubmitMs: mean(counts.upload, counts.uploads), uploadGpuMs: mean(counts.gpu, counts.gpuSamples),
      gpuTimerAvailable: this.timer.available, gpuSamples: counts.gpuSamples,
      queue: this.queueDepth(), queuePeak: this.peakQueue, dropped: this.dropped,
      tfPending: this.rows.reduce((count, layer) => count + (layer.candidate ? 1 : 0), 0),
      points: this.rows.reduce((count, layer) => count + (layer.gpu.points.visible ? layer.cloud?.drawnPoints ?? 0 : 0), 0),
      fixedFrame: this.sceneSettings.fixedFrame ?? (reference?.cloud?.frameId || null), scene: this.spatial.stats,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      cpuBytes: this.rows.reduce((bytes, { gpu }) => bytes + gpu.processor.allocatedBytes, 0),
      gpuBytes: this.rows.reduce((bytes, { gpu }) => bytes + gpu.gpuBytes, 0),
      heapBytes: memory.memory?.usedJSHeapSize ?? null,
      layers: this.rows.map((layer) => {
        const { binding, cloud, gpu } = layer;
        const stamp = cloud?.stamp;
        const metadata = layer.candidate ?? cloud;
        return { id: binding.id, topic: binding.topic, source: binding.source, visible: gpu.points.visible,
          count: cloud?.drawnPoints ?? 0, inputCount: metadata?.sourcePoints ?? 0, validCount: metadata?.validPoints ?? 0,
          invalid: metadata?.invalidPoints ?? 0,
          frame: metadata?.frameId ?? null, stamp: stamp ? stamp.sec + '.' + String(stamp.nanosec).padStart(9, '0') : null,
          logTimeNs: layer.logTimeNs, effectiveColor: cloud?.effectiveColor ?? null, error: layer.error ?? layer.transformError ?? null,
          frameMismatch: binding.visible && !!cloud?.drawnPoints && !this.framesMatch(reference, layer),
          allocations: gpu.allocations, uploads: gpu.uploads };
      }),
    });
  }

  dispose(): void {
    this.stopped = true;
    cancelAnimationFrame(this.animationId);
    this.resize.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.loseContext);
    for (const layer of this.layers.values()) {
      layer.detach?.();
      layer.gpu.dispose();
    }
    this.layers.clear();
    this.rows.length = 0;
    this.ready.length = 0;
    this.timer.dispose();
    this.camera.dispose();
    this.spatial.dispose();
    this.grid.dispose();
    this.axis.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
