import { useEffect, useState } from 'react';

import { useAppStore } from '../store';

const SECURITY_POINTS = [
  ['contextIsolation', '开启：渲染进程与 Electron/Node 完全隔离'],
  ['sandbox', '开启：preload 仅能调用白名单 API'],
  ['nodeIntegration', '关闭：渲染进程没有 require / fs / child_process'],
  ['IPC', '固定通道白名单，主进程逐个校验参数（URL 只允许 ws/wss，话题名必须 / 开头）'],
  ['网络', '渲染进程无网络权限，WebSocket 只存在于 Data Worker 线程'],
  ['导航', '禁止应用内跳转与新窗口，外链交给系统浏览器'],
] as const;

export function SettingsPage(): React.JSX.Element {
  const appInfo = useAppStore((state) => state.appInfo);
  const config = useAppStore((state) => state.config);
  const logs = useAppStore((state) => state.logs);
  const saveDefaultUrl = useAppStore((state) => state.saveDefaultUrl);
  const savedUrl = config?.lastUrl ?? '';

  const [draft, setDraft] = useState(savedUrl);
  useEffect(() => {
    setDraft(savedUrl);
  }, [savedUrl]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[20px] font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-[12px] text-muted">
          本版本只持久化一个默认连接地址；密钥、实验元数据与录制目录在 M4/M6 引入。
        </p>

        <section className="mt-6 rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2.5 text-[12px] font-semibold">默认连接地址</h2>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="focus-ring mono w-[360px] rounded border border-border bg-bg px-2 py-1.5 text-[12px]"
            />
            <button
              type="button"
              onClick={() => void saveDefaultUrl(draft)}
              className="focus-ring rounded border border-accent/40 bg-accent/15 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/25"
            >
              保存
            </button>
            <span className="text-[11px] text-faint">
              保存于 %APPDATA%\LabScope\config.json
            </span>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2.5 text-[12px] font-semibold">应用信息</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 md:grid-cols-3">
            <Row label="LabScope" value={appInfo?.appVersion ?? '—'} />
            <Row label="Electron" value={appInfo?.electron ?? '—'} />
            <Row label="Chrome" value={appInfo?.chrome ?? '—'} />
            <Row label="Node" value={appInfo?.node ?? '—'} />
            <Row label="平台" value={appInfo === null ? '—' : `${appInfo.platform} / ${appInfo.arch}`} />
            <Row label="阶段" value="M2.2（三维可视化引擎）" />
          </dl>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2.5 text-[12px] font-semibold">安全边界</h2>
          <ul className="divide-y divide-border/60">
            {SECURITY_POINTS.map(([key, detail]) => (
              <li key={key} className="flex gap-3 px-4 py-2">
                <span className="mono w-[120px] shrink-0 text-[11px] text-accent">{key}</span>
                <span className="text-[11.5px] leading-relaxed text-muted">{detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-surface">
          <h2 className="flex items-center justify-between border-b border-border px-4 py-2.5 text-[12px] font-semibold">
            运行日志
            <span className="text-[10px] font-normal text-faint">最近 {logs.length} 条</span>
          </h2>
          <div className="max-h-[220px] overflow-y-auto px-4 py-2">
            {logs.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-faint">暂无日志</p>
            ) : (
              <ul className="space-y-1">
                {[...logs].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="mono flex gap-2 text-[10.5px]">
                    <span className="shrink-0 text-faint">
                      {new Date(entry.at).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        entry.level === 'error'
                          ? 'text-danger'
                          : entry.level === 'warn'
                            ? 'text-warn'
                            : 'text-muted'
                      }
                    >
                      {entry.level}
                    </span>
                    <span className="break-all text-ink/80">{entry.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-widest text-faint">{label}</dt>
      <dd className="mono mt-0.5 truncate text-[11.5px] text-ink/90" title={value}>
        {value}
      </dd>
    </div>
  );
}
