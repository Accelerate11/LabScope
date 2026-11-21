import { useAppStore } from '../store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function Tile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent';
}): React.JSX.Element {
  const toneClass =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-danger'
          : tone === 'accent'
            ? 'text-accent'
            : 'text-ink';
  return (
    <div className="rounded-md border border-border bg-surface-2/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-faint">{label}</div>
      <div className={`mono mt-0.5 text-[15px] font-semibold ${toneClass}`}>{value}</div>
      {hint === undefined ? null : (
        <div className="mono mt-0.5 truncate text-[10px] text-faint">{hint}</div>
      )}
    </div>
  );
}

export function SessionStats({ orientation = 'horizontal' }: { orientation?: 'horizontal' | 'vertical' }): React.JSX.Element {
  const status = useAppStore((state) => state.status);
  const telemetry = useAppStore((state) => state.telemetry);
  const decodeErrors = telemetry.topics.reduce((sum, topic) => sum + topic.decodeErrors, 0);

  const uptime = telemetry.uptimeMs > 0 ? `${Math.floor(telemetry.uptimeMs / 1000)} s` : '—';

  return (
    <div className={orientation === 'vertical' ? 'grid gap-2' : 'grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6'}>
      <Tile
        label="消息总数"
        value={telemetry.totalMessages.toLocaleString()}
        hint={`已订阅 ${status.subscribed.length} 个话题`}
        tone="accent"
      />
      <Tile label="接收数据量" value={formatBytes(telemetry.totalBytes)} hint={`会话 ${uptime}`} />
      <Tile
        label="解码错误"
        value={String(decodeErrors)}
        tone={decodeErrors === 0 ? 'ok' : 'danger'}
        hint={decodeErrors === 0 ? '全部成功' : '存在解码失败'}
      />
      <Tile
        label="通道"
        value={String(status.channels.length)}
        hint={status.serverInfo?.metadata?.['ROS_DISTRO'] ?? '—'}
      />
      <Tile
        label="重连"
        value={String(status.reconnects)}
        tone={status.reconnects > 0 ? 'warn' : 'default'}
        hint={status.connectAttempt > 0 ? `当前第 ${status.connectAttempt} 次` : '稳定'}
      />
      <Tile
        label="服务器"
        value={status.serverInfo?.name === undefined || status.serverInfo.name === '' ? 'foxglove_bridge' : status.serverInfo.name}
        hint={status.serverInfo?.capabilities.length === undefined ? '—' : `${status.serverInfo.capabilities.length} 项能力`}
      />
    </div>
  );
}
