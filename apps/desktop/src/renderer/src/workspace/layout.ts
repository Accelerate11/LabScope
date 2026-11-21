import { validPointCloudConfig } from '../pointcloud/config';
import type { PanelConfig, PanelConfigPatch } from './panel-registry';
import type { PlotConfig } from '../plot/plot-types';

export type SplitDirection = 'horizontal' | 'vertical';
export type LayoutNode =
  | { kind: 'panel'; panel: PanelConfig }
  | { kind: 'split'; id: string; direction: SplitDirection; ratio: number; first: LayoutNode; second: LayoutNode };
export type Layout = LayoutNode | null;

export const WORKSPACE_KEY = 'labscope.workspace.v1';
export const MAX_PANELS = 12;
export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;

export function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio)) : 0.5;
}

export function listPanels(node: Layout): PanelConfig[] {
  if (!node) return [];
  return node.kind === 'panel' ? [node.panel] : [...listPanels(node.first), ...listPanels(node.second)];
}

function editPanel(node: LayoutNode, id: string, edit: (panel: PanelConfig) => Layout): Layout {
  if (node.kind === 'panel') return node.panel.id === id ? edit(node.panel) : node;
  const first = editPanel(node.first, id, edit);
  const second = editPanel(node.second, id, edit);
  if (!first) return second;
  if (!second) return first;
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

export function insertPanel(
  layout: Layout, panel: PanelConfig, splitId: string, direction: SplitDirection, target?: string,
): Layout {
  const next: LayoutNode = { kind: 'panel', panel };
  if (!layout) return next;
  const panels = listPanels(layout);
  const anchor = target ?? panels.at(-1)?.id;
  if (!anchor || panels.length >= MAX_PANELS || panels.some(({ id }) => id === panel.id)) return layout;
  return editPanel(layout, anchor, (existing) => ({
    kind: 'split',
    id: splitId,
    direction,
    ratio: 0.5,
    first: { kind: 'panel', panel: existing },
    second: next,
  }));
}

export function removePanel(layout: Layout, id: string): Layout {
  return layout && editPanel(layout, id, () => null);
}

export function updatePanel(layout: Layout, id: string, patch: PanelConfigPatch): Layout {
  return layout && editPanel(layout, id, (panel) => ({ kind: 'panel', panel: { ...panel, ...patch } }));
}

export function swapPanels(layout: Layout, id: string, target: string): Layout {
  if (!layout || id === target) return layout;
  const panels = listPanels(layout);
  const first = panels.find((panel) => panel.id === id);
  const second = panels.find((panel) => panel.id === target);
  if (!first || !second) return layout;

  function swap(node: LayoutNode): LayoutNode {
    if (node.kind === 'split') {
      const left = swap(node.first);
      const right = swap(node.second);
      return left === node.first && right === node.second ? node : { ...node, first: left, second: right };
    }
    if (node.panel === first) return { kind: 'panel', panel: second! };
    if (node.panel === second) return { kind: 'panel', panel: first! };
    return node;
  }

  return swap(layout);
}

export function resizeSplit(layout: Layout, id: string, ratio: number): Layout {
  if (!layout || layout.kind === 'panel') return layout;
  if (layout.id === id) return { ...layout, ratio: clampRatio(ratio) };
  const first = resizeSplit(layout.first, id, ratio);
  const second = resizeSplit(layout.second, id, ratio);
  if (first === layout.first && second === layout.second) return layout;
  if (!first || !second) return layout;
  return { ...layout, first, second };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deserializeLayout(serialized: string): Layout {
  const file: unknown = JSON.parse(serialized);
  if (!isRecord(file) || file.version !== 1 || !('root' in file)) throw new Error('工作区版本不支持');
  if (file.root === null) return null;

  const ids = new Set<string>();
  let panelCount = 0;

  function readId(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(value) || ids.has(value)) {
      throw new Error('工作区节点 ID 无效或重复');
    }
    ids.add(value);
    return value;
  }

  function read(node: unknown, depth: number): LayoutNode {
    if (!isRecord(node) || depth >= MAX_PANELS) throw new Error('工作区结构无效');
    if (node.kind === 'panel') {
      const panel = node.panel;
      if (++panelCount > MAX_PANELS || !isRecord(panel)) throw new Error('面板配置无效');
      const { type, source, topic, title, pointCloud, plot } = panel;
      if (typeof type !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(type) ||
          (source !== 'live' && source !== 'playback' && source !== 'simulation') ||
          (topic !== null && (typeof topic !== 'string' || !topic.startsWith('/') || topic.length > 256)) ||
          (title !== undefined && (typeof title !== 'string' || title.length > 80))) {
        throw new Error('面板类型、数据源或话题无效');
      }
      return { kind: 'panel', panel: { id: readId(panel.id), type, source, topic, title,
        ...(type === 'Viewer3D' && validPointCloudConfig(pointCloud) ? { pointCloud } : {}),
        ...(type === 'Plot' && isPlotConfig(plot) ? { plot } : {}),
      } };
    }
    if (node.kind !== 'split' || (node.direction !== 'horizontal' && node.direction !== 'vertical') ||
        typeof node.ratio !== 'number' || !Number.isFinite(node.ratio)) {
      throw new Error('分屏配置无效');
    }
    return {
      kind: 'split', id: readId(node.id), direction: node.direction, ratio: clampRatio(node.ratio),
      first: read(node.first, depth + 1), second: read(node.second, depth + 1),
    };
  }

  return read(file.root, 0);
}

function isPlotConfig(value: unknown): value is PlotConfig {
  if (!value || typeof value !== 'object') return false;
  const plot = value as PlotConfig;
  return Array.isArray(plot.series) && Number.isFinite(plot.windowSeconds) && plot.windowSeconds > 0 &&
    Number.isInteger(plot.maxPoints) && plot.maxPoints > 0 && plot.series.every((series) =>
      series && typeof series.id === 'string' && typeof series.topic === 'string' && typeof series.field === 'string' &&
      typeof series.color === 'string' && typeof series.visible === 'boolean' && Number.isInteger(series.capacity));
}

export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ version: 1, root: layout });
}
