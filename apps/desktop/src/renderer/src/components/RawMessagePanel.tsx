import { useMemo } from 'react';

import { useAppStore } from '../store';
import { Panel } from './Panel';

function formatNs(ns: string | null): string {
  if (ns === null) return '—';
  const value = Number(ns);
  if (!Number.isFinite(value)) return ns;
  return new Date(value / 1e6).toISOString().replace('T', ' ').replace('Z', 'Z');
}

export function RawMessagePanel(): React.JSX.Element {
  const status = useAppStore((state) => state.status);
  const telemetry = useAppStore((state) => state.telemetry);
  const selectedTopic = useAppStore((state) => state.selectedTopic);
  const selectTopic = useAppStore((state) => state.selectTopic);

  const subscribedTopics = useMemo(
    () => status.subscribed.filter((topic) => status.channels.some((channel) => channel.topic === topic)),
    [status.subscribed, status.channels],
  );

  const entry = telemetry.topics.find((topic) => topic.topic === selectedTopic);
  const channel = status.channels.find((item) => item.topic === selectedTopic);
  const sample = entry?.sample;
  const json = sample === undefined ? null : JSON.stringify(sample, null, 2);

  return (
    <Panel
      title="原始消息"
      subtitle={selectedTopic ?? '未选择话题'}
      className="min-h-0"
      bodyClassName="flex min-h-0 flex-col"
      actions={
        <select
          value={selectedTopic ?? ''}
          onChange={(event) => selectTopic(event.target.value)}
          className="focus-ring mono max-w-[260px] rounded border border-border bg-bg px-2 py-1 text-[11px] text-ink"
        >
          <option value="" disabled>
            选择已订阅话题…
          </option>
          {subscribedTopics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      }
    >
      <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 border-b border-border px-3 py-2 text-[11px] md:grid-cols-4">
        <Field label="类型" value={channel?.schemaName ?? '—'} mono />
        <Field label="编码" value={channel === undefined ? '—' : `${channel.encoding} / ${channel.schemaEncoding}`} mono />
        <Field label="速率" value={entry === undefined ? '—' : `${entry.rateHz.toFixed(2)} Hz`} mono />
        <Field label="计数 / 字节" value={entry === undefined ? '—' : `${entry.count} / ${entry.bytes}`} mono />
        <Field label="log_time" value={formatNs(entry?.lastLogTimeNs ?? null)} mono />
        <Field
          label="最近接收"
          value={entry?.lastReceiveAt == null ? '—' : new Date(entry.lastReceiveAt).toLocaleTimeString()}
          mono
        />
        <Field
          label="schema 大小"
          value={channel === undefined ? '—' : `${channel.schemaBytes} B`}
          mono
        />
        <Field
          label="解码错误"
          value={entry === undefined ? '—' : String(entry.decodeErrors)}
          mono
          tone={entry !== undefined && entry.decodeErrors > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {json === null ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-[12px] text-muted">
                {selectedTopic === null ? '在左侧话题列表中点击一个已订阅话题' : '等待该话题的数据…'}
              </p>
              <p className="mt-1 text-[11px] text-faint">
                数据在 Data Worker 线程中解码，只有裁剪后的摘要会传到界面。
              </p>
            </div>
          </div>
        ) : (
          <pre className="mono whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-[1.55] text-ink/90">
            {json}
          </pre>
        )}
      </div>
    </Panel>
  );
}

function Field({
  label,
  value,
  mono = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'default' | 'danger';
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 overflow-hidden">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <span
        className={`truncate text-[11px] ${mono ? 'mono' : ''} ${
          tone === 'danger' ? 'text-danger' : 'text-ink/90'
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
