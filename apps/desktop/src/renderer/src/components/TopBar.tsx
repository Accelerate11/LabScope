import type { PageId } from '../store';
import { useAppStore } from '../store';
import { StatusPill } from './StatusPill';

const NAV: { id: PageId; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'live', label: '实时' },
  { id: 'data', label: '数据' },
  { id: 'playback', label: '回放' },
  { id: 'ai', label: 'AI 分析' },
  { id: 'settings', label: '设置' },
];

export function TopBar(): React.JSX.Element {
  const page = useAppStore((state) => state.page);
  const setPage = useAppStore((state) => state.setPage);
  const state = useAppStore((store) => store.status.state);
  const subprotocol = useAppStore((store) => store.status.subprotocol);

  return (
    <header className="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2.5">
        <div className="grid h-6 w-6 place-items-center rounded bg-gradient-to-br from-accent to-accent-dim text-[11px] font-bold text-bg">
          LS
        </div>
        <span className="text-[14px] font-semibold tracking-tight">LabScope</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-faint">
          M2.2
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              className={`focus-ring rounded px-3 py-1.5 text-[12px] transition-colors ${
                active
                  ? 'bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
                  : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {subprotocol === undefined ? null : (
          <span className="mono rounded border border-border px-2 py-0.5 text-[10px] text-faint">
            {subprotocol}
          </span>
        )}
        <StatusPill state={state} />
      </div>
    </header>
  );
}
