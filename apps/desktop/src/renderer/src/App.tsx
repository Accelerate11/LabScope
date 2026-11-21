import { useEffect } from 'react';

import { TopBar } from './components/TopBar';
import { DataPage, AiPage, PlaybackPage } from './pages/MilestonePages';
import { HomePage } from './pages/HomePage';
import { LivePage } from './pages/LivePage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore, type PageId } from './store';

const PAGES: Record<PageId, () => React.JSX.Element> = {
  home: HomePage,
  live: LivePage,
  data: DataPage,
  playback: PlaybackPage,
  ai: AiPage,
  settings: SettingsPage,
};

export function App(): React.JSX.Element {
  const ready = useAppStore((state) => state.ready);
  const page = useAppStore((state) => state.page);
  const error = useAppStore((state) => state.error);
  const clearError = useAppStore((state) => state.clearError);
  const init = useAppStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <span className="mono text-[12px] text-faint">正在启动 LabScope…</span>
      </div>
    );
  }

  const Page = PAGES[page];

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      {error === null ? null : (
        <div className="flex shrink-0 items-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-1.5">
          <span className="text-[11.5px] text-danger">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="focus-ring ml-auto rounded px-1.5 text-[11px] text-danger/80 hover:bg-danger/20"
          >
            关闭
          </button>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-hidden">
        <Page />
      </main>
      <StatusBar />
    </div>
  );
}

function StatusBar(): React.JSX.Element {
  const status = useAppStore((state) => state.status);
  const telemetry = useAppStore((state) => state.telemetry);
  const appInfo = useAppStore((state) => state.appInfo);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-[10.5px] text-faint">
      <span className="mono">{status.state}</span>
      {status.subprotocol === undefined ? null : <span className="mono">{status.subprotocol}</span>}
      <span className="mono">
        {telemetry.totalMessages.toLocaleString()} msgs · {(telemetry.totalBytes / 1024 / 1024).toFixed(1)} MiB
      </span>
      {status.subscribed.length > 0 ? (
        <span className="mono">{status.subscribed.length} subscribed</span>
      ) : null}
      <span className="ml-auto mono">
        {appInfo === null
          ? 'LabScope'
          : `LabScope ${appInfo.appVersion} · Electron ${appInfo.electron} · Chrome ${appInfo.chrome}`}
      </span>
    </footer>
  );
}
