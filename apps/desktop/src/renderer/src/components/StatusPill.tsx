import type { SessionState } from '../../../shared/types';

const TONE: Record<SessionState, { label: string; dot: string; text: string; ring: string }> = {
  idle: { label: '未连接', dot: 'bg-faint', text: 'text-muted', ring: 'ring-border' },
  connecting: { label: '连接中', dot: 'bg-warn animate-pulse', text: 'text-warn', ring: 'ring-warn/30' },
  connected: { label: '已连接', dot: 'bg-ok', text: 'text-ok', ring: 'ring-ok/30' },
  reconnecting: { label: '重连中', dot: 'bg-warn animate-pulse', text: 'text-warn', ring: 'ring-warn/30' },
  disconnected: { label: '已断开', dot: 'bg-danger', text: 'text-danger', ring: 'ring-danger/30' },
  closed: { label: '已关闭', dot: 'bg-faint', text: 'text-muted', ring: 'ring-border' },
  error: { label: '错误', dot: 'bg-danger', text: 'text-danger', ring: 'ring-danger/40' },
};

export function StatusPill({ state }: { state: SessionState }): React.JSX.Element {
  const tone = TONE[state];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium ring-1 ${tone.ring} ${tone.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}
