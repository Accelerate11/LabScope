import { useCallback, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';

import { Panel } from '../components/Panel';
import { panelRegistry } from './built-in-panels';
import { clampRatio, listPanels, MAX_PANELS, MAX_RATIO, MIN_RATIO, type LayoutNode, type SplitDirection } from './layout';
import { messageBus } from './message-bus';
import { PanelErrorBoundary } from './panel-error-boundary';
import type { PanelConfig, PanelDefinition } from './panel-registry';
import { useWorkspaceStore } from './workspace-store';

const dragType = 'application/x-labscope-panel';
const button = 'focus-ring rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-ink disabled:opacity-40';
const field = 'focus-ring min-w-0 rounded border border-border bg-bg px-2 py-1 text-[11px] text-ink';

export function Workspace(): React.JSX.Element {
  const { layout, storageError, add } = useWorkspaceStore();
  const definitions = useSyncExternalStore(panelRegistry.subscribe, panelRegistry.getSnapshot);
  const [requestedType, setRequestedType] = useState('Viewer3D');
  const type = definitions.find((definition) => definition.type === requestedType) ?? definitions[0];
  const full = listPanels(layout).length >= MAX_PANELS;

  function insert(direction: SplitDirection, target?: string): void {
    if (type) add(type.type, direction, target);
  }

  return (
    <section aria-label="可视化工作区" className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted" htmlFor="workspace-panel-type">面板类型</label>
        <select id="workspace-panel-type" className={field} value={type?.type ?? ''}
          onChange={(event) => setRequestedType(event.target.value)}>
          {definitions.map((definition) => <option key={definition.type} value={definition.type}>{definition.label}</option>)}
        </select>
        <button type="button" className={button} disabled={full || !type} onClick={() => insert('horizontal')}>
          添加面板
        </button>
        {full && <span className="text-[11px] text-faint">已达 {MAX_PANELS} 个面板</span>}
        {storageError && <span role="alert" className="text-[11px] text-danger">{storageError}</span>}
      </header>
      {layout ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="flex min-h-full min-w-full flex-1">
            <LayoutSlot node={layout} allowSplit={!full && !!type} insert={insert} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-[120px] flex-1 place-items-center rounded border border-border text-xs text-muted">
          添加面板以查看数据。
        </div>
      )}
    </section>
  );
}

interface LayoutSlotProps {
  node: LayoutNode;
  allowSplit: boolean;
  insert(direction: SplitDirection, target: string): void;
}

function LayoutSlot({ node, allowSplit, insert }: LayoutSlotProps): React.JSX.Element {
  if (node.kind === 'split') return <SplitSlot node={node} allowSplit={allowSplit} insert={insert} />;
  return <PanelSlot key={node.panel.id} config={node.panel} allowSplit={allowSplit} insert={insert} />;
}

function SplitSlot({ node, allowSplit, insert }: LayoutSlotProps & {
  node: Extract<LayoutNode, { kind: 'split' }>;
}): React.JSX.Element {
  const resize = useWorkspaceStore((state) => state.resize);
  const [preview, setPreview] = useState<number>();
  const dragging = useRef<number | null>(null);
  const horizontal = node.direction === 'horizontal';
  const ratio = preview ?? node.ratio;
  const tracks = 'minmax(0,' + ratio + 'fr) 8px minmax(0,' + (1 - ratio) + 'fr)';

  function dragRatio(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    return clampRatio(horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height);
  }

  return (
    <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
      style={horizontal ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks }}>
      <LayoutSlot node={node.first} allowSplit={allowSplit} insert={insert} />
      <div
        role="separator"
        aria-label="调整分屏尺寸"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={MIN_RATIO * 100}
        aria-valuemax={MAX_RATIO * 100}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        className={'focus-ring touch-none rounded bg-border/40 hover:bg-accent/50 ' +
          (horizontal ? 'mx-0.5 cursor-col-resize' : 'my-0.5 cursor-row-resize')}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) setPreview(dragRatio(event));
        }}
        onPointerUp={(event) => {
          if (dragging.current !== event.pointerId) return;
          dragging.current = null;
          setPreview(undefined);
          resize(node.id, dragRatio(event));
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
          setPreview(undefined);
        }}
        onPointerCancel={() => {
          dragging.current = null;
          setPreview(undefined);
        }}
        onKeyDown={(event) => {
          const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
          const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
          const next = event.key === decrease ? ratio - 0.05 : event.key === increase ? ratio + 0.05 :
            event.key === 'Home' ? MIN_RATIO : event.key === 'End' ? MAX_RATIO : undefined;
          if (next === undefined) return;
          event.preventDefault();
          resize(node.id, next);
        }}
      />
      <LayoutSlot node={node.second} allowSplit={allowSplit} insert={insert} />
    </div>
  );
}

function PanelSlot({ config, allowSplit, insert }: {
  config: PanelConfig;
  allowSplit: boolean;
  insert(direction: SplitDirection, target: string): void;
}): React.JSX.Element {
  const { remove, swap } = useWorkspaceStore();
  const definitions = useSyncExternalStore(panelRegistry.subscribe, panelRegistry.getSnapshot);
  const definition = definitions.find((entry) => entry.type === config.type);

  return (
    <div data-panel-id={config.id} data-panel-type={config.type} className="flex min-h-0 min-w-0 flex-1"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(dragType)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        const from = event.dataTransfer.getData(dragType);
        if (!from) return;
        event.preventDefault();
        swap(from, config.id);
      }}>
      <Panel title={config.title || definition?.label || config.type} className="min-w-0 flex-1"
        bodyClassName="flex min-w-0 flex-col overflow-auto"
        actions={<>
          <button type="button" className={button} draggable aria-label="拖动面板" title="拖到其他面板交换位置"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData(dragType, config.id);
            }}>↕</button>
          <button type="button" className={button} disabled={!allowSplit} aria-label="右侧分屏"
            onClick={() => insert('horizontal', config.id)}>右分</button>
          <button type="button" className={button} disabled={!allowSplit} aria-label="下方分屏"
            onClick={() => insert('vertical', config.id)}>下分</button>
          <button type="button" className={button} aria-label="关闭面板"
            onClick={() => remove(config.id)}>关闭</button>
        </>}>
        {definition ? (
          <PanelErrorBoundary key={definition.managesSubscriptions ? config.type :
            JSON.stringify([config.type, config.source, config.topic])}>
            <PanelContent definition={definition} config={config} />
          </PanelErrorBoundary>
        ) : <p className="p-3 text-xs text-muted">此面板类型当前未注册。</p>}
      </Panel>
    </div>
  );
}

function PanelContent({ definition, config }: {
  definition: PanelDefinition;
  config: PanelConfig;
}): React.JSX.Element {
  const configure = useWorkspaceStore((state) => state.configure);
  const subscribe = useCallback((listener: () => void) => messageBus.subscribeChannels(config.source, listener),
    [config.source]);
  const read = useCallback(() => messageBus.getChannels(config.source), [config.source]);
  const channels = useSyncExternalStore(subscribe, read);
  const compatible = channels.filter((channel) => definition.accepts(channel.schemaName));
  const known = channels.find(({ topic }) => topic === config.topic);
  const incompatible = known !== undefined && !definition.accepts(known.schemaName);

  return (
    <>
      <div className="grid shrink-0 gap-2 border-b border-border p-2 min-[650px]:grid-cols-2">
        <label className="grid gap-1 text-[11px] text-muted">
          数据源
          <select data-workspace-control="source" className={field} value={config.source}
            onChange={(event) => configure(config.id, {
              source: event.target.value === 'simulation' ? 'simulation'
                : event.target.value === 'playback' ? 'playback' : 'live',
              topic: null,
            })}>
            <option value="live">实时</option>
            <option value="playback">历史回放</option>
            <option value="simulation">模拟</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted">
          话题
          <select data-workspace-control="topic" className={field} value={config.topic ?? ''}
            onChange={(event) => configure(config.id, { topic: event.target.value || null })}>
            <option value="">选择话题</option>
            {config.topic && !compatible.some(({ topic }) => topic === config.topic) &&
              <option value={config.topic}>{config.topic} · {incompatible ? '类型不兼容' : '未发现'}</option>}
            {compatible.map(({ topic }) => <option key={topic} value={topic}>{topic}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted">
          标题
          <input className={field} value={config.title ?? ''} maxLength={80} placeholder={definition.label}
            onChange={(event) => configure(config.id, { title: event.target.value || undefined })} />
        </label>
      </div>
      {definition.managesSubscriptions ? <definition.View config={config} message={undefined} update={(patch) => configure(config.id, patch)} /> :
        incompatible ? <p className="p-3 text-xs text-danger">所选话题类型与此面板不兼容。</p> :
          <BoundView definition={definition} config={config} />}
    </>
  );
}

function BoundView({ definition: { View }, config }: {
  definition: PanelDefinition;
  config: PanelConfig;
}): React.JSX.Element {
  const { source, topic } = config;
  const subscribe = useCallback((notify: () => void) => topic === null ? () => {} :
    messageBus.subscribe(source, topic, notify), [source, topic]);
  const read = useCallback(() => topic === null ? undefined : messageBus.getLatest(source, topic), [source, topic]);
  const message = useSyncExternalStore(subscribe, read);
  const configure = useWorkspaceStore((state) => state.configure);
  return <View config={config} message={message} update={(patch) => configure(config.id, patch)} />;
}
