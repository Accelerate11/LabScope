import type { PageId } from '../store';
import { useAppStore } from '../store';
import { Sidebar } from '../components/Sidebar';
import { SessionStats } from '../components/SessionStats';
import { RawMessagePanel } from '../components/RawMessagePanel';

const STEPS: { title: string; detail: string }[] = [
  { title: '进入可视化工作区', detail: '在「实时」页打开可视化工作区。' },
  { title: '启动模拟场景', detail: '展开「模拟数据」，选择场景并点击「启动完整 3D 场景」。' },
  { title: '查看空间数据', detail: '旋转、平移或缩放。用 Fixed Frame 切换参考坐标系。' },
];

const CAPABILITIES: { id: PageId; label: string; status: 'ready' | 'planned'; detail: string }[] = [
  { id: 'live', label: '实时监控', status: 'ready', detail: '连接、话题发现、订阅、原始消息解码（本版本）' },
  { id: 'live', label: '3D 可视化', status: 'ready', detail: 'M2.2：PointCloud2、TF、Pose、Path 和 Marker' },
  { id: 'live', label: '相机与曲线', status: 'planned', detail: '现有面板可绑定话题，完整渲染分阶段交付' },
  { id: 'data', label: '实验数据管理', status: 'planned', detail: 'M4：MCAP 录制、实验元数据、文件管理' },
  { id: 'playback', label: '3D 历史回放', status: 'ready', detail: '打开本地 ROS 2 MCAP、跳转、暂停和继续' },
  { id: 'ai', label: 'AI 分析', status: 'planned', detail: 'M6：多模型 API、日志与实验总结' },
];

export function HomePage(): React.JSX.Element {
  const setPage = useAppStore((state) => state.setPage);
  const status = useAppStore((state) => state.status);
  const appInfo = useAppStore((state) => state.appInfo);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex items-center gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight">LabScope 桌面数据工作站</h1>
          <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
            M2.2
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          面向机器人科研的 Windows 桌面工作站。可检查 ROS 2 话题，在同一 3D 工作区显示模拟、实时或本地回放数据。
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <StatCard label="M0 已验证" value="5412 条 / 0 错误" hint="20 秒真实 IMU+点云+图像流量" />
          <StatCard
            label="当前连接"
            value={status.state === 'connected' ? '已连接' : '未连接'}
            hint={status.url ?? '尚未连接机器人'}
          />
          <StatCard
            label="桌面运行时"
            value={appInfo === null ? '—' : `Electron ${appInfo.electron}`}
            hint={appInfo === null ? '—' : `Chrome ${appInfo.chrome} · Node ${appInfo.node}`}
          />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-faint">
              三步开始
            </h2>
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                  <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-2 text-[11px] text-accent">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium">{step.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setPage('live')}
              className="focus-ring mt-4 rounded border border-accent/40 bg-accent/15 px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/25"
            >
              进入实时监控 →
            </button>
          </section>

          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-faint">
              功能状态
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {CAPABILITIES.map((item) => (
                <li key={item.label} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.status === 'ready' ? 'bg-ok' : 'bg-border-strong'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-ink">{item.label}</p>
                    <p className="truncate text-[10.5px] text-faint">{item.detail}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-medium ${
                      item.status === 'ready' ? 'text-ok' : 'text-faint'
                    }`}
                  >
                    {item.status === 'ready' ? '可用' : '计划中'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-8 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-[12px] font-semibold text-ink">当前版本</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            可视化工作区支持分屏、调整尺寸、交换位置和恢复布局。3D、相机和曲线面板当前显示话题绑定状态。
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className="mono mt-1 text-[15px] font-semibold text-ink">{value}</div>
      <div className="mono mt-0.5 truncate text-[10.5px] text-faint" title={hint}>
        {hint}
      </div>
    </div>
  );
}
