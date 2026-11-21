import { describe, expect, it, vi } from 'vitest';

import { panelRegistry } from '../src/renderer/src/workspace/built-in-panels';
import { PanelErrorBoundary } from '../src/renderer/src/workspace/panel-error-boundary';
import {
  MAX_PANELS, WORKSPACE_KEY, deserializeLayout, insertPanel, listPanels, removePanel, resizeSplit,
  serializeLayout, swapPanels, updatePanel, type Layout,
} from '../src/renderer/src/workspace/layout';
import { MessageBus } from '../src/renderer/src/workspace/message-bus';
import { PanelRegistry, type PanelConfig } from '../src/renderer/src/workspace/panel-registry';
import { PlaybackFeed } from '../src/renderer/src/workspace/playback-feed';
import { createWorkspaceStore } from '../src/renderer/src/workspace/workspace-store';
import type { TelemetryPayload } from '../src/shared/types';

const first: PanelConfig = { id: 'one', type: 'Viewer3D', source: 'live', topic: '/points' };
const second: PanelConfig = { id: 'two', type: 'Plot', source: 'playback', topic: '/imu' };
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function telemetry(sequence: number): TelemetryPayload {
  return {
    topics: [{
      topic: '/points', channelId: 1, schemaName: 'sensor_msgs/msg/PointCloud2', encoding: 'cdr',
      count: 2, bytes: 200, rateHz: 1, decodeErrors: 0, lastReceiveAt: 2,
      lastLogTimeNs: '55', sampleLogTimeNs: '20', sampleSequence: sequence, sample: { width: 20000 },
    }],
    totalMessages: 2, totalBytes: 200, uptimeMs: 50, timestamp: 333,
  };
}

describe('panel registry', () => {
  it('registers the three built-ins with schema selectors', () => {
    expect(panelRegistry.getSnapshot().map(({ type }) => type)).toEqual(['Viewer3D', 'CameraViewer', 'Plot']);
    expect(panelRegistry.get('Viewer3D')?.accepts('sensor_msgs/msg/PointCloud2')).toEqual(true);
    expect(panelRegistry.get('CameraViewer')?.accepts('sensor_msgs/msg/PointCloud2')).toEqual(false);
  });

  it('notifies registration and removal, rejects duplicates, and leaves replacements intact', () => {
    const registry = new PanelRegistry();
    const listener = vi.fn();
    const dispose = registry.subscribe(listener);
    const definition = { type: 'Fixture', label: 'Fixture', View: () => null, accepts: () => true };
    const remove = registry.register(definition);
    expect(() => registry.register(definition)).toThrow(/already registered/);
    registry.unregister('Fixture');
    registry.register({ ...definition });
    remove();
    expect(registry.get('Fixture')).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(3);
    dispose();
    registry.unregister('Fixture');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('switches a failed panel to a retryable fallback', () => {
    const boundary = new PanelErrorBoundary({ children: 'panel view' });
    expect(boundary.render()).toBe('panel view');
    boundary.state = PanelErrorBoundary.getDerivedStateFromError();
    const fallback = boundary.render();
    expect(fallback).toMatchObject({ props: { role: 'alert' } });
  });
});

describe('message bus', () => {
  it('shares upstream subscriptions and releases only the last reference', async () => {
    const setTopics = vi.fn();
    const bus = new MessageBus(setTopics);
    const lhs = bus.subscribe('live', '/points', vi.fn());
    const rhs = bus.subscribe('live', '/points', vi.fn());
    const plot = bus.subscribe('live', '/imu', vi.fn());
    await tick();
    expect(setTopics).toHaveBeenLastCalledWith(['/imu', '/points']);
    lhs();
    await tick();
    expect(setTopics).toHaveBeenCalledTimes(1);
    rhs();
    await tick();
    expect(setTopics).toHaveBeenLastCalledWith(['/imu']);
    plot();
    await tick();
    expect(setTopics).toHaveBeenLastCalledWith([]);
    rhs();
    await tick();
    expect(setTopics).toHaveBeenCalledTimes(3);
  });

  it('routes live and playback through the same interface with independent catalogs and epochs', async () => {
    const setTopics = vi.fn();
    const bus = new MessageBus(setTopics);
    const feed = new PlaybackFeed(bus);
    const catalog = vi.fn();
    const live = vi.fn();
    const replay = vi.fn();
    const unwatch = bus.subscribeChannels('playback', catalog);
    bus.subscribe('live', '/points', live);
    bus.subscribe('playback', '/points', replay);
    feed.load([{ topic: '/points', schemaName: 'sensor_msgs/msg/PointCloud2' }]);
    await tick();
    expect(setTopics).toHaveBeenCalledExactlyOnceWith(['/points']);
    expect(catalog).toHaveBeenCalledTimes(1);
    bus.publishLive(telemetry(4));
    bus.publishLive(telemetry(4));
    expect(live).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveBeenCalled();
    const message = bus.getLatest('live', '/points')!;
    expect(message.logTimeNs).toBe('20');
    feed.deliver(message);
    expect(bus.getLatest('playback', '/points')).toEqual({ ...message, source: 'playback' });
    expect(replay).toHaveBeenCalledTimes(1);
    feed.seek();
    expect(bus.getLatest('playback', '/points')).toBeUndefined();
    feed.deliver(message);
    expect(replay).toHaveBeenCalledTimes(3);
    expect(live).toHaveBeenCalledTimes(1);
    unwatch();
    feed.close();
    expect(bus.getChannels('playback')).toEqual([]);
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('isolates a consumer exception and drops retained frames after unmount', () => {
    const errors = vi.fn();
    const bus = new MessageBus(() => {}, errors);
    const fail = bus.subscribe('live', '/points', () => { throw new Error('panel fault'); });
    const notify = vi.fn();
    const remove = bus.subscribe('live', '/points', notify);
    bus.publishLive(telemetry(1));
    expect(errors).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    fail();
    remove();
    expect(bus.getLatest('live', '/points')).toBeUndefined();
  });
});

describe('workspace layout', () => {
  it('inserts both split directions, swaps positions, configures and collapses branches', () => {
    let layout = insertPanel(null, first, 'split0', 'horizontal');
    layout = insertPanel(layout, second, 'split1', 'horizontal', first.id);
    layout = insertPanel(layout, { ...first, id: 'three', type: 'CameraViewer' }, 'split2', 'vertical', first.id);
    expect(layout).toMatchObject({ direction: 'horizontal', first: { direction: 'vertical' } });
    layout = resizeSplit(layout, 'split2', 0.1);
    expect(layout).toMatchObject({ first: { ratio: 0.2 } });
    layout = swapPanels(layout, 'one', 'two');
    expect(listPanels(layout).map(({ id }) => id)).toEqual(['two', 'three', 'one']);
    layout = updatePanel(layout, 'three', { title: 'Cam' });
    layout = removePanel(layout, 'two');
    expect(layout).toMatchObject({ first: { panel: { id: 'three', title: 'Cam' } } });
    expect(removePanel(removePanel(layout, 'three'), 'one')).toBeNull();
  });

  it('round-trips layout and enforces unique ids, finite ratios and workspace version', () => {
    const data = insertPanel(insertPanel(null, first, 'unused', 'horizontal'), second, 'split1', 'vertical');
    const text = serializeLayout(data);
    expect(serializeLayout(deserializeLayout(text))).toBe(text);
    expect(() => deserializeLayout(text.replace('"two"', '"one"'))).toThrow(/ID/);
    expect(() => deserializeLayout(text.replace('"version":1', '"version":2'))).toThrow(/版本/);
    expect(() => deserializeLayout(text.replace('"ratio":0.5', '"ratio":1e999'))).toThrow(/分屏/);
  });

  it('caps the workspace size and preserves orphaned types for later registration', () => {
    let layout: Layout = null;
    for (let index = 0; index < MAX_PANELS + 1; index++) {
      layout = insertPanel(layout, { ...first, id: 'panel-' + index, type: 'ExtensionPanel' }, 'split-' + index, 'horizontal');
    }
    const loaded = deserializeLayout(serializeLayout(layout));
    expect(listPanels(loaded)).toHaveLength(MAX_PANELS);
    expect(listPanels(loaded)[0]?.type).toBe('ExtensionPanel');
  });

  it('restores persistent layout and handles corrupt or unavailable storage', () => {
    const backing = new Map<string, string>();
    const adapter = { getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => { backing.set(key, value); } };
    const app = createWorkspaceStore(() => adapter);
    app.getState().add('Plot', 'horizontal');
    const panels = listPanels(app.getState().layout);
    app.getState().configure(panels[0]!.id, { source: 'playback', topic: '/imu' });
    expect(createWorkspaceStore(() => adapter).getState().layout).toMatchObject({
      kind: 'panel', panel: { source: 'playback', topic: '/imu' },
    });
    backing.set(WORKSPACE_KEY, 'bad JSON');
    expect(createWorkspaceStore(() => adapter).getState()).toMatchObject({ layout: null, storageError: expect.any(String) });
    const blocked = createWorkspaceStore(() => ({ getItem: () => null, setItem: () => { throw new Error('blocked'); } }));
    blocked.getState().add('Plot', 'horizontal');
    expect(listPanels(blocked.getState().layout)).toHaveLength(1);
    expect(blocked.getState().storageError).not.toBeNull();
  });
});
