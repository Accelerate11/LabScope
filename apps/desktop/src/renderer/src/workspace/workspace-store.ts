import { create } from 'zustand';

import {
  WORKSPACE_KEY, deserializeLayout, insertPanel, listPanels, removePanel, resizeSplit, serializeLayout, swapPanels, updatePanel,
  type Layout, type SplitDirection,
} from './layout';
import type { PanelConfigPatch } from './panel-registry';
import { DEFAULT_LAYER_STYLE } from '../pointcloud/config';
import { fullScene } from '../spatial/scene-settings';
import type { SourceId } from './message-bus';

interface WorkspaceStore {
  layout: Layout;
  storageError: string | null;
  add(type: string, direction: SplitDirection, target?: string): void;
  openScene(source: SourceId, topic: string | null): boolean;
  remove(id: string): void;
  configure(id: string, patch: PanelConfigPatch): void;
  swap(id: string, target: string): void;
  resize(id: string, ratio: number): void;
}

type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createWorkspaceStore(getStorage: () => WorkspaceStorage) {
  return create<WorkspaceStore>()((set, get) => {
    let initial: Layout = null;
    let initialError: string | null = null;
    try {
      const saved = getStorage().getItem(WORKSPACE_KEY);
      if (saved !== null) initial = deserializeLayout(saved);
    } catch {
      initialError = '无法恢复已保存的工作区布局。';
    }

    function commit(layout: Layout): void {
      if (layout === get().layout) return;
      try {
        getStorage().setItem(WORKSPACE_KEY, serializeLayout(layout));
        set({ layout, storageError: null });
      } catch {
        set({ layout, storageError: '工作区布局未能保存。' });
      }
    }

    return {
      layout: initial,
      storageError: initialError,
      add: (type, direction, target) => commit(insertPanel(
        get().layout, { id: crypto.randomUUID(), type, source: 'live', topic: null },
        crypto.randomUUID(), direction, target,
      )),
      openScene: (source, topic) => {
        const layout = get().layout;
        const existing = listPanels(layout).find((panel) => panel.type === 'Viewer3D' && panel.source === source);
        const clouds = existing?.pointCloud;
        const pointCloud = { primary: clouds?.primary ?? DEFAULT_LAYER_STYLE, overlays: clouds?.overlays ?? [],
          scene: { ...fullScene, ...(clouds?.scene?.camera ? { camera: clouds.scene.camera } : {}) } };
        const next = existing ? updatePanel(layout, existing.id, { topic, pointCloud }) :
          insertPanel(layout, { id: crypto.randomUUID(), type: 'Viewer3D', source, topic, pointCloud },
            crypto.randomUUID(), 'horizontal');
        commit(next);
        return next !== layout;
      },
      remove: (id) => commit(removePanel(get().layout, id)),
      configure: (id, patch) => commit(updatePanel(get().layout, id, patch)),
      swap: (id, target) => commit(swapPanels(get().layout, id, target)),
      resize: (id, ratio) => commit(resizeSplit(get().layout, id, ratio)),
    };
  });
}

export const useWorkspaceStore = createWorkspaceStore(() => localStorage);
