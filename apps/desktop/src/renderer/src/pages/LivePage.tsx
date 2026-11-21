import { useState, type ReactNode } from 'react';

import { RawMessagePanel } from '../components/RawMessagePanel';
import { SessionStats } from '../components/SessionStats';
import { Sidebar } from '../components/Sidebar';
import { Workspace } from '../workspace/Workspace';
import { SimulationControls } from '../workspace/SimulationControls';
import { useWorkspaceStore } from '../workspace/workspace-store';
import { PlaybackControls } from '../spatial/PlaybackControls';

const LAYOUT_KEY = 'labscope.live.stats-position';
type StatsPosition = 'top' | 'side';

function savedStatsPosition(): StatsPosition {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'side' ? 'side' : 'top';
  } catch {
    return 'top';
  }
}

export function LivePage(): React.JSX.Element {
  const [position, setPosition] = useState(savedStatsPosition);
  const [view, setView] = useState<'workspace' | 'raw'>(() =>
    useWorkspaceStore.getState().layout === null ? 'raw' : 'workspace');
  const [showPlayback, setShowPlayback] = useState(false);
  const content: ReactNode = view === 'workspace' ? <Workspace /> : <RawMessagePanel />;

  function changePosition(next: StatsPosition): void {
    setPosition(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch (error) {
      console.warn('无法保存工作区统计位置', error);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div role="group" aria-label="实时视图" className="flex gap-1">
            <button type="button" aria-pressed={view === 'raw'} onClick={() => setView('raw')}
              className="focus-ring rounded border border-border px-2 py-1 text-[11px] aria-pressed:bg-surface-2">原始消息</button>
            <button type="button" aria-pressed={view === 'workspace'} onClick={() => setView('workspace')}
              className="focus-ring rounded border border-border px-2 py-1 text-[11px] aria-pressed:bg-surface-2">可视化工作区</button>
            {view === 'workspace' && <button type="button" aria-pressed={showPlayback} onClick={() => setShowPlayback(!showPlayback)}
              className="focus-ring rounded border border-border px-2 py-1 text-[11px] aria-pressed:bg-surface-2">本地 MCAP</button>}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
          统计位置
          <select
            data-testid="stats-position"
            value={position}
            onChange={(event) => changePosition(event.target.value === 'side' ? 'side' : 'top')}
            className="focus-ring rounded border border-border bg-bg px-2 py-1 text-ink"
          >
            <option value="top">顶部</option>
            <option value="side">右侧</option>
          </select>
        </label>
        </div>
        {view === 'workspace' && <SimulationControls />}
        {view === 'workspace' && showPlayback && <PlaybackControls />}
        {position === 'top' ? (
          <>
            <SessionStats />
            {content}
          </>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_11rem] items-stretch gap-2">
            {content}
            <aside aria-label="会话统计" className="min-h-0 overflow-y-auto">
              <SessionStats orientation="vertical" />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
