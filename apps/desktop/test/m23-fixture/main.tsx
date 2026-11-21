import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimulationDataSource } from '@labscope/simulation-engine';
import { messageBus } from '../../src/renderer/src/workspace/message-bus';
import CameraViewer from '../../src/renderer/src/camera/CameraViewer';
import PlotPanel from '../../src/renderer/src/plot/PlotPanel';
import { timelineClock } from '../../src/renderer/src/timeline/timeline-clock';
import type { PanelConfig } from '../../src/renderer/src/workspace/panel-registry';

const bus = messageBus;
bus.subscribe('simulation', '/imu/data', () => {});
const camera: PanelConfig = { id: 'camera', type: 'CameraViewer', source: 'simulation', topic: '/camera/color/image_raw' };
const plot: PanelConfig = { id: 'plot', type: 'Plot', source: 'simulation', topic: '/imu/data',
  plot: { series: [{ id: '/imu/data:linear_acceleration.x', source: 'simulation', topic: '/imu/data',
    field: 'linear_acceleration.x', displayName: 'ax', color: '#52c0f1', unit: 'm/s²', visible: true, capacity: 100_000 }],
    windowSeconds: 30, maxPoints: 1000 } };
let source: SimulationDataSource;
function App() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    source = new SimulationDataSource({
      setChannels: (s, channels) => bus.setChannels(s, channels),
      reset: (s) => bus.reset(s),
      hasSubscribers: (_s, topic) => bus.hasSubscribers('simulation', topic),
      publish: (message) => bus.publish(message),
    }, { scenario: 'moving-robot', seed: 42, cameraWidth: 640, cameraHeight: 480 });
    setTimeout(() => { source.start(); setRunning(true); }, 250);
    const timer = setInterval(() => source.advance(20), 20);
    return () => { clearInterval(timer); source.reset(); timelineClock.cancel(); };
  }, []);
  return <main style={{display:'grid',gridTemplateRows:'1fr 1fr 1fr',height:'100vh',gap:4}}>
    <section data-camera><CameraViewer config={camera} update={() => {}} /></section>
    <section data-depth><CameraViewer config={{...camera, id:'depth', topic:'/camera/depth/image_raw'}} update={() => {}} /></section>
    <section data-plot><PlotPanel config={plot} update={(next) => { plot.plot = next; }} /></section>
    <span hidden data-running={running} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
setTimeout(() => {
  const canvases = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
  const pixels = canvases.map((canvas) => canvas.getContext('2d')?.getImageData(0, 0, Math.min(8, canvas.width), Math.min(8, canvas.height)).data ?? new Uint8ClampedArray());
  const imageVisible = pixels.every((data) => [...data].some((value, index) => index % 4 !== 3 && value !== 0));
  setTimeout(() => {
    const plot = document.querySelector<HTMLElement>('[data-plot] [data-plot-series]');
    const latest = bus.getLatest('simulation', '/imu/data');
    document.body.dataset.result = JSON.stringify({ passed: !!source && imageVisible && !!document.querySelector('[data-plot] polyline'),
      running: !!source, canvas: canvases.length === 2, imageVisible, plot: !!document.querySelector('[data-plot] polyline'), series: plot?.dataset.plotSeries,
      latest: !!latest, latestKind: latest?.payload.kind, hasSubscriber: bus.hasSubscribers('simulation','/imu/data'),
      topic: plot?.dataset.plotTopic, field: plot?.dataset.plotField, active: plot?.dataset.plotActive, stats: plot?.dataset.plotStats,
      value: latest?.payload.kind === 'decoded' ? (latest.payload.value as any).linear_acceleration : undefined });
  }, 150);
}, 1800);
