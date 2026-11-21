import type { SourceId } from '../workspace/message-bus';
import type { ViewerStats } from '../pointcloud/viewer-engine';
import { sceneKey } from './scene-feed';
import type { SceneSettings } from './scene-settings';

const groups = [
  ['transforms', 'TF 坐标轴'], ['pose', 'Pose 方向'], ['odometry', 'Odometry 方向'],
  ['path', '轨迹'], ['markers', 'Marker'],
] as const;
const numeric = 'focus-ring w-[72px] rounded border border-border bg-bg px-1 py-0.5 text-ink';

export function SceneControls({ settings, scene, update }: {
  settings: SceneSettings; scene: ViewerStats['scene']; update(patch: Partial<SceneSettings>): void;
}): React.JSX.Element {
  const toggle = (source: SourceId, item: string, visible: boolean) => {
    const id = sceneKey(source, item);
    update({ hidden: visible ? settings.hidden.filter((item) => item !== id) : [...settings.hidden, id] });
  };
  const hidden = (source: SourceId, item: string) => settings.hidden.includes(sceneKey(source, item));
  return (
    <details data-spatial-settings className="max-h-[190px] shrink-0 overflow-auto rounded border border-border p-2">
      <summary className="cursor-pointer">场景显示与 TF 树</summary>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {groups.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <input type="checkbox" checked={settings[key]} onChange={(e) => update({ [key]: e.target.checked })} />{label}
          </label>
        ))}
        <label className="flex items-center gap-1">轴长度
          <input className={numeric} type="number" min={0.05} max={100} step={0.05} value={settings.axisLength}
            onChange={(e) => update({ axisLength: Math.min(100, Math.max(0.05, Number(e.target.value))) })} />
        </label>
        <label className="flex items-center gap-1">轨迹颜色
          <input type="color" value={settings.pathColor} onChange={(e) => update({ pathColor: e.target.value })} />
        </label>
        <label className="flex items-center gap-1">最大轨迹点
          <input className={numeric} type="number" min={2} max={2048} value={settings.pathLength}
            onChange={(e) => update({ pathLength: Math.min(2048, Math.max(2, Math.trunc(Number(e.target.value)))) })} />
        </label>
        <label className="flex items-center gap-1">轨迹采样间隔
          <input className={numeric} type="number" min={1} max={64} value={settings.pathStep}
            onChange={(e) => update({ pathStep: Math.min(64, Math.max(1, Math.trunc(Number(e.target.value)))) })} />
        </label>
        <label className="flex items-center gap-1">轨迹长度 (m)
          <input className={numeric} type="number" min={0} max={100000} step={0.5} value={settings.pathMeters ?? 0}
            onChange={(e) => update({ pathMeters: Math.min(100000, Math.max(0, Number(e.target.value))) })} />
        </label>
        <span>0 m 按点数限制</span>
      </div>
      {scene.map(({ source, frames, topics, visibleFrames, poses, odometry, pathPoints, markers }) => (
        <section key={source} className="mt-2 border-t border-border pt-1">
          <h4 className="text-ink">{{ live: '实时', simulation: '模拟', playback: '回放' }[source]}</h4>
          <p className="mono pb-1">轴 {visibleFrames} · Pose {poses} · Odometry {odometry} · 轨迹点 {pathPoints} · Marker {markers}</p>
          <div className="flex flex-wrap gap-2">
            {topics.filter((entry) => entry.schema !== 'tf2_msgs/msg/TFMessage').map(({ topic, error }) => (
              <label key={topic} className="flex items-center gap-1">
                <input type="checkbox" checked={!hidden(source, topic)} onChange={(e) => toggle(source, topic, e.target.checked)} />
                {topic}{error && <span className="text-danger">{error}</span>}
              </label>
            ))}
          </div>
          <ul className="mono grid gap-1">
            {frames.map(({ frame, parent, static: isStatic }) => (
              <li key={frame}>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!hidden(source, 'frame:' + frame)}
                    onChange={(e) => toggle(source, 'frame:' + frame, e.target.checked)} />
                  {parent ? parent + ' → ' + frame + (isStatic ? ' · 静态' : ' · 动态') : frame + ' · 根'}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
