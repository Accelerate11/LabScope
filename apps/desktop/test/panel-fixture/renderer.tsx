import { createRoot } from 'react-dom/client';
import { panelRegistry } from '../../src/renderer/src/workspace/built-in-panels';
import { listPanels } from '../../src/renderer/src/workspace/layout';
import { messageBus } from '../../src/renderer/src/workspace/message-bus';
import { PlaybackFeed } from '../../src/renderer/src/workspace/playback-feed';
import { useWorkspaceStore } from '../../src/renderer/src/workspace/workspace-store';
import { Workspace } from '../../src/renderer/src/workspace/Workspace';

const upstream: string[][] = [];
Object.defineProperty(window, 'labscope', {
  value: { setPanelTopics: async (topics: string[]) => { upstream.push(topics); } },
});

function expect(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

async function waitFor(predicate: () => unknown, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(label);
}

async function verify(): Promise<void> {
  const disposeFault = panelRegistry.register({
    type: 'FaultFixture',
    label: 'Fault fixture',
    accepts: () => true,
    View({ message }) {
      if (message) throw new Error('fixture render failure');
      return <p>Fixture waiting</p>;
    },
  });
  const state = useWorkspaceStore.getState();
  state.add('FaultFixture', 'horizontal');
  state.add('Plot', 'horizontal');
  const [fault, plot] = listPanels(useWorkspaceStore.getState().layout);
  expect(fault && plot, 'fixture panes');
  state.configure(fault.id, { topic: '/fault' });
  state.configure(plot.id, { source: 'playback', topic: '/imu' });
  messageBus.setChannels('live', [{ topic: '/fault', schemaName: 'Fixture' }]);
  const feed = new PlaybackFeed();
  feed.load([{ topic: '/imu', schemaName: 'sensor_msgs/msg/Imu' }]);
  const root = createRoot(document.getElementById('root')!);
  root.render(<Workspace />);
  await waitFor(() => upstream.at(-1)?.includes('/fault'), 'rendered panel did not acquire live topic');

  const sample = { logTimeNs: '123', sequence: 1, payload: { kind: 'preview' as const, value: {} } };
  feed.deliver({ ...sample, topic: '/imu', schemaName: 'sensor_msgs/msg/Imu' });
  messageBus.publish({ ...sample, source: 'live', topic: '/fault', schemaName: 'Fixture' });
  await waitFor(() => document.querySelector('[data-panel-type="FaultFixture"] [role="alert"]'),
    'panel error fallback missing');
  await waitFor(() => upstream.at(-1)?.length === 0, 'faulting pane did not release its topic');
  await waitFor(() => document.querySelector('[data-panel-type="Plot"]')?.textContent?.includes('123'),
    'sibling playback panel did not receive its data');

  feed.seek();
  await waitFor(() => !document.querySelector('[data-panel-type="Plot"]')?.textContent?.includes('123'),
    'seek did not reset the frame');
  feed.deliver({ ...sample, sequence: 1, logTimeNs: '456', topic: '/imu', schemaName: 'sensor_msgs/msg/Imu' });
  await waitFor(() => document.querySelector('[data-panel-type="Plot"]')?.textContent?.includes('456'),
    'sibling playback panel did not continue after the fault');
  panelRegistry.unregister('Plot');
  await waitFor(() => document.querySelector('[data-panel-type="Plot"]')?.textContent?.includes('未注册'),
    'unregistered pane fallback missing');
  expect(messageBus.getLatest('playback', '/imu') === undefined, 'unregistered pane retained a frame');
  disposeFault();
  root.unmount();
}

void verify().then(
  () => { document.body.dataset.result = JSON.stringify({ passed: true }); },
  (error: unknown) => { document.body.dataset.result = JSON.stringify({ passed: false, error: String(error) }); },
);
