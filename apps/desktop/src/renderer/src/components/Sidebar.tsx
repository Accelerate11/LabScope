import { useMemo } from 'react';

import type { ChannelSummary } from '../../../shared/types';
import { useAppStore } from '../store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function Sidebar(): React.JSX.Element {
  const status = useAppStore((state) => state.status);
  const telemetry = useAppStore((state) => state.telemetry);
  const urlInput = useAppStore((state) => state.urlInput);
  const setUrlInput = useAppStore((state) => state.setUrlInput);
  const connect = useAppStore((state) => state.connect);
  const disconnect = useAppStore((state) => state.disconnect);
  const subscribe = useAppStore((state) => state.subscribe);
  const subscribeAll = useAppStore((state) => state.subscribeAll);
  const selectedTopic = useAppStore((state) => state.selectedTopic);
  const selectTopic = useAppStore((state) => state.selectTopic);

  const busy = status.state === 'connecting' || status.state === 'connected' || status.state === 'reconnecting';
  const subscribed = useMemo(() => new Set(status.subscribed), [status.subscribed]);
  const telemetryByTopic = useMemo(
    () => new Map(telemetry.topics.map((topic) => [topic.topic, topic])),
    [telemetry.topics],
  );

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-faint">
            数据源
          </span>
          {status.reconnects > 0 ? (
            <span className="text-[10px] text-warn">已重连 {status.reconnects} 次</span>
          ) : null}
        </div>

        <label className="mb-1 block text-[11px] text-muted" htmlFor="bridge-url">
          ROS 2 Foxglove Bridge 地址
        </label>
        <div className="flex items-center gap-2">
          <input
            id="bridge-url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy) void connect();
            }}
            spellCheck={false}
            placeholder="ws://127.0.0.1:8765"
            className="focus-ring mono min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1.5 text-[12px] text-ink placeholder:text-faint"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              className="focus-ring rounded border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] font-medium text-danger hover:bg-danger/20"
            >
              断开
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              className="focus-ring rounded border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/25"
            >
              连接
            </button>
          )}
        </div>

        {status.error === undefined ? null : (
          <p className="mt-2 rounded border border-danger/30 bg-danger/5 px-2 py-1.5 text-[11px] leading-relaxed text-danger">
            {status.error}
          </p>
        )}
        {status.state === 'connected' && status.serverInfo?.metadata?.['fg-library'] !== undefined ? (
          <p className="mono mt-2 truncate text-[10px] text-faint">
            {status.serverInfo.metadata['fg-library']}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-faint">
          话题 · {status.channels.length}
        </span>
        <button
          type="button"
          disabled={status.channels.length === 0}
          onClick={() => void subscribeAll()}
          className="focus-ring rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          全部订阅
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status.channels.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-faint">
            连接机器人后，
            <br />
            话题会自动出现在这里。
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {status.channels.map((channel) => (
              <TopicRow
                key={channel.id}
                channel={channel}
                active={selectedTopic === channel.topic}
                subscribed={subscribed.has(channel.topic)}
                count={telemetryByTopic.get(channel.topic)?.count ?? 0}
                rateHz={telemetryByTopic.get(channel.topic)?.rateHz ?? 0}
                bytes={telemetryByTopic.get(channel.topic)?.bytes ?? 0}
                onSelect={() => selectTopic(channel.topic)}
                onSubscribe={() => void subscribe(channel.topic)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

interface TopicRowProps {
  channel: ChannelSummary;
  active: boolean;
  subscribed: boolean;
  count: number;
  rateHz: number;
  bytes: number;
  onSelect(): void;
  onSubscribe(): void;
}

function TopicRow({
  channel,
  active,
  subscribed,
  count,
  rateHz,
  bytes,
  onSelect,
  onSubscribe,
}: TopicRowProps): React.JSX.Element {
  return (
    <li
      className={`group flex items-center gap-2 px-3 py-2 transition-colors ${
        active ? 'bg-surface-2' : 'hover:bg-surface-2/60'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="focus-ring min-w-0 flex-1 text-left"
        title={`${channel.topic}\n${channel.schemaName}\n${channel.encoding} / ${channel.schemaEncoding}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              subscribed ? (count > 0 ? 'bg-ok' : 'bg-warn') : 'bg-border-strong'
            }`}
          />
          <span className={`mono truncate text-[12px] ${active ? 'text-accent' : 'text-ink'}`}>
            {channel.topic}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 pl-3 text-[10px] text-faint">
          <span className="truncate">{channel.schemaName.split('/').pop()}</span>
          {subscribed ? (
            <span className="mono shrink-0 text-muted">
              {rateHz.toFixed(1)} Hz · {count} · {formatBytes(bytes)}
            </span>
          ) : null}
        </div>
      </button>
      {subscribed ? (
        <span className="shrink-0 text-[10px] text-ok">已订阅</span>
      ) : (
        <button
          type="button"
          onClick={onSubscribe}
          className="focus-ring shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition-opacity hover:border-accent/50 hover:text-accent group-hover:opacity-100"
        >
          + 订阅
        </button>
      )}
    </li>
  );
}
