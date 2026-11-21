import { lazy, Suspense } from 'react';
import { PanelRegistry, type PanelViewProps } from './panel-registry';

const PointCloudViewer = lazy(() => import('../pointcloud/Viewer3D'));
const CameraViewer = lazy(() => import('../camera/CameraViewer'));
const PlotPanel = lazy(() => import('../plot/PlotPanel'));

function BindingPreview({ config, message }: PanelViewProps): React.JSX.Element {
  if (config.topic === null) return <p className="p-3 text-xs text-muted">选择数据源和话题。</p>;
  if (!message) return <p className="p-3 text-xs text-muted">等待 {config.topic} 的数据…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <p className="shrink-0 pb-2 text-xs text-ok">已收到数据 · {message.schemaName}</p>
      <p className="mono shrink-0 truncate text-[11px] text-muted">时间戳 {message.logTimeNs ?? '—'}</p>
    </div>
  );
}

export const panelRegistry = new PanelRegistry();
panelRegistry.register({
  type: 'Viewer3D',
  label: '3D Viewer',
  accepts: (schema) => schema === 'sensor_msgs/msg/PointCloud2' || schema === 'sensor_msgs/msg/LaserScan',
  managesSubscriptions: true,
  View: ({ config }) => <Suspense fallback={<p className="p-3 text-xs text-muted">正在加载点云查看器…</p>}>
    <PointCloudViewer config={config} />
  </Suspense>,
});
panelRegistry.register({
  type: 'CameraViewer',
  label: 'Camera Viewer',
  accepts: (schema) => schema === 'sensor_msgs/msg/Image' || schema === 'sensor_msgs/msg/CompressedImage',
  View: ({ config, update }) => <Suspense fallback={<p className="p-3 text-xs text-muted">正在加载相机查看器…</p>}>
    <CameraViewer config={config} update={update} />
  </Suspense>,
});
panelRegistry.register({
  type: 'Plot',
  label: 'Plot',
  accepts: () => true,
  View: ({ config, update }) => <Suspense fallback={<p className="p-3 text-xs text-muted">正在加载曲线面板…</p>}>
    <PlotPanel config={config} update={(plot) => update?.({ plot })} />
  </Suspense>,
});
