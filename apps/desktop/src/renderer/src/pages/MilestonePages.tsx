import React from 'react';
import { Placeholder } from '../components/Placeholder';
import { PlaybackControls } from '../spatial/PlaybackControls';
import { Workspace } from '../workspace/Workspace';
import type { ExperimentManifest, RecordingStatus } from '../../../shared/recording-types';
import { useAppStore } from '../store';
import type { AiProviderConfig, AiProviderInput } from '../../../shared/ai-types';
import { buildLocalContext } from '../ai/local-analysis';
import type { ExperimentAnalysis, LogAnalysis } from '@labscope/analysis-engine';
import type { Conversation } from '../../../shared/conversation-types';

export function DataPage(): React.JSX.Element {
  const status = useAppStore((state) => state.status);
  const [recording, setRecording] = React.useState<RecordingStatus>();
  const [experiments, setExperiments] = React.useState<ExperimentManifest[]>([]);
  const [name, setName] = React.useState('Simulation Experiment');
  const [project, setProject] = React.useState('LabScope');
  const [selected, setSelected] = React.useState<string[]>([]);
  const load = React.useCallback(async () => setExperiments(await window.labscope.recordingList()), []);
  React.useEffect(() => { void load(); return window.labscope.onRecordingStatus(setRecording); }, [load]);
  const button = 'focus-ring rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-40';
  const field = 'focus-ring rounded border border-border bg-bg px-2 py-1 text-xs text-ink';
  const active = recording && recording.state !== 'idle' && recording.state !== 'error';
  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs text-muted">
    <section className="rounded border border-border p-3">
      <h1 className="mb-2 text-sm font-semibold text-ink">实验数据中心</h1>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">实验名称<input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1">项目<input className={field} value={project} onChange={(e) => setProject(e.target.value)} /></label>
        <button className={button} disabled={!!active} onClick={async () => {
          const topics = selected.length ? selected : status.channels.map(({ topic }) => topic);
          setRecording(await window.labscope.recordingStart({ name, project, compression: 'none' }, topics));
        }}>开始录制</button>
        <button className={button} disabled={!active || recording?.state !== 'recording'} onClick={async () => setRecording(await window.labscope.recordingPause())}>暂停</button>
        <button className={button} disabled={recording?.state !== 'paused'} onClick={async () => setRecording(await window.labscope.recordingResume())}>继续</button>
        <button className={button} disabled={!active} onClick={async () => { setRecording(await window.labscope.recordingStop()); await load(); }}>停止并保存</button>
        <span className="mono">{recording ? recording.state + ' · ' + recording.messageCount + ' msgs · queue ' + recording.queueDepth : '未录制'}</span>
      </div>
      {recording?.error && <p role="alert" className="mt-2 text-danger">{recording.error}</p>}
      <div className="mt-3 grid max-h-36 grid-cols-2 gap-1 overflow-auto">
        {status.channels.map((channel) => <label key={channel.topic} className="flex items-center gap-1">
          <input type="checkbox" checked={selected.includes(channel.topic)} onChange={(e) => setSelected((current) =>
            e.target.checked ? [...current, channel.topic] : current.filter((topic) => topic !== channel.topic))} />
          {channel.topic} <span className="text-faint">{channel.schemaName}</span>
        </label>)}
      </div>
    </section>
    <section className="rounded border border-border p-3">
      <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-ink">实验列表</h2><button className={button} onClick={() => void load()}>刷新</button></div>
      <div className="grid gap-2">
        {experiments.map((experiment) => <article key={experiment.experimentId} className="rounded border border-border/70 p-2">
          <div className="flex flex-wrap justify-between gap-2"><strong className="text-ink">{experiment.name}</strong><span>{experiment.project} · {experiment.compression}</span></div>
          <div className="mono text-[10px]">{experiment.experimentId} · segments {experiment.segments.length} · events {experiment.events.length}</div>
          {experiment.notes && <p>{experiment.notes}</p>}
        </article>)}
        {!experiments.length && <p className="text-faint">暂无已完成实验。</p>}
      </div>
    </section>
  </div>;
}

export function PlaybackPage(): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <PlaybackControls />
      <Workspace />
    </div>
  );
}

export function AiPage(): React.JSX.Element {
  const [providers, setProviders] = React.useState<AiProviderConfig[]>([]);
  const [experiments, setExperiments] = React.useState<ExperimentManifest[]>([]);
  const [providerId, setProviderId] = React.useState('');
  const [experimentId, setExperimentId] = React.useState('');
  const [prompt, setPrompt] = React.useState('请总结这次实验的基本信息，并区分已确认事实和未知信息。');
  const [answer, setAnswer] = React.useState('');
  const [error, setError] = React.useState('');
  const [analysis, setAnalysis] = React.useState<ExperimentAnalysis>();
  const [logText, setLogText] = React.useState('');
  const [logAnalysis, setLogAnalysis] = React.useState<LogAnalysis>();
  const [report, setReport] = React.useState('');
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [conversationId, setConversationId] = React.useState('');
  const [providerForm, setProviderForm] = React.useState<AiProviderInput>({ name: '', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', enabled: true });
  React.useEffect(() => {
    void Promise.all([window.labscope.aiProviders(), window.labscope.recordingList(), window.labscope.conversationList()]).then(([p, e, c]) => {
      setProviders(p); setExperiments(e); setProviderId(p[0]?.id ?? ''); setExperimentId(e[0]?.experimentId ?? '');
      setConversations(c); setConversationId(c[0]?.conversationId ?? '');
    }).catch((cause) => setError(String(cause)));
  }, []);
  const experiment = experiments.find((item) => item.experimentId === experimentId);
  const button = 'focus-ring rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-40';
  const field = 'focus-ring rounded border border-border bg-bg px-2 py-1 text-xs text-ink';
  const download = (name: string, content: string, type: string): void => { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
  const ensureConversation = async (): Promise<string> => { if (conversationId) return conversationId; const item = await window.labscope.conversationCreate({ title: experiment?.name ?? 'Experiment analysis', experimentId: experimentId || null, providerId, modelId: providers.find((entry) => entry.id === providerId)?.model ?? 'deterministic-v1' }); setConversations((current) => [item, ...current]); setConversationId(item.conversationId); return item.conversationId; };
  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs text-muted">
    <section className="rounded border border-border p-3">
      <h1 className="mb-2 text-sm font-semibold text-ink">AI Analysis Workspace</h1>
      <div className="mb-2 flex flex-wrap gap-2"><select className={field} value={conversationId} onChange={(event) => setConversationId(event.target.value)}><option value="">新建会话</option>{conversations.map((item) => <option key={item.conversationId} value={item.conversationId}>{item.title}</option>)}</select><button className={button} onClick={async () => { const item = await window.labscope.conversationCreate({ title: 'New analysis', experimentId: experimentId || null, providerId, modelId: providers.find((entry) => entry.id === providerId)?.model ?? 'deterministic-v1' }); setConversations((current) => [item, ...current]); setConversationId(item.conversationId); }}>新建会话</button></div>
      <div className="flex flex-wrap gap-2">
        <select className={field} value={experimentId} onChange={(e) => setExperimentId(e.target.value)}>
          <option value="">选择实验</option>{experiments.map((item) => <option key={item.experimentId} value={item.experimentId}>{item.name}</option>)}
        </select>
        <select className={field} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">选择模型</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}
        </select>
        <button className={button} disabled={!providerId} onClick={async () => {
          const result = await window.labscope.aiProviderTest(providerId); setAnswer(result.message); setError(result.ok ? '' : result.message);
        }}>测试 Provider</button>
        <input className={field} placeholder="Provider 名称" value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} />
        <input className={field} placeholder="模型" value={providerForm.model} onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })} />
        <input className={field} placeholder="API Base URL" value={providerForm.baseUrl} onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })} />
        <input className={field} placeholder="API Key（Windows 加密存储）" type="password" value={providerForm.apiKey} onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })} />
        <button className={button} disabled={!providerForm.name || !providerForm.model || !providerForm.apiKey} onClick={async () => {
          try { const next = await window.labscope.aiProviderUpsert(providerForm); setProviders(next); setProviderId(next.at(-1)?.id ?? ''); setProviderForm({ ...providerForm, apiKey: '' }); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        }}>保存 Provider</button>
      </div>
      <textarea className={field + ' mt-2 min-h-20 w-full'} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={button} disabled={!experiment} onClick={async () => {
        try { setError(''); const id = await ensureConversation(); setAnalysis(await window.labscope.analysisRun(experiment!.experimentId)); await window.labscope.conversationAppend(id, { role: 'tool-result', text: 'Deterministic experiment analysis completed.', evidence: [experiment!.experimentId] }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>运行本地确定性分析</button>
      <button className={button} disabled={!providerId || !experiment} onClick={async () => {
        try { setError(''); const id = await ensureConversation(); await window.labscope.conversationAppend(id, { role: 'user', text: prompt }); const result = await window.labscope.aiChat(providerId, buildLocalContext(experiment!) + '\n\nComputed analysis is performed locally before this interpretation.\nUser question: ' + prompt); setAnswer(result.text); await window.labscope.conversationAppend(id, { role: 'assistant', text: result.text }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>请求模型解释</button>
      <button className={button} disabled={!experiment} onClick={async () => {
        try { const result = await window.labscope.reportGenerate(experiment!.experimentId, providerId, prompt); setReport(result.markdown); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      }}>生成报告</button>
      </div>
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      {answer && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg p-2 text-ink">{answer}</pre>}
      {analysis && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg p-2 text-ink">{JSON.stringify(analysis, null, 2)}</pre>}
      {report && <div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={() => download((experiment?.name ?? 'experiment') + '-report.md', report, 'text/markdown')}>下载 Markdown</button><button className={button} onClick={async () => { const result = await window.labscope.reportGenerate(experiment!.experimentId, providerId, prompt); download((experiment?.name ?? 'experiment') + '-report.html', result.html, 'text/html'); }}>下载 HTML</button><button className={button} onClick={async () => { const result = await window.labscope.reportGenerate(experiment!.experimentId, providerId, prompt); setAnswer('PDF 已保存: ' + await window.labscope.reportExportPdf(result.html, (experiment?.name ?? 'experiment') + '-report.pdf')); }}>导出 PDF</button><button className={button} onClick={() => void navigator.clipboard?.writeText(report)}>复制报告</button></div>}
    </section>
    <section className="rounded border border-border p-3">
      <h2 className="mb-2 font-semibold text-ink">本地实验上下文</h2>
      {experiment ? <pre className="whitespace-pre-wrap">{buildLocalContext(experiment)}</pre> : <p>暂无实验。录制或导入一个实验后可分析。</p>}
      <h2 className="mt-3 mb-2 font-semibold text-ink">日志解析</h2>
      <textarea className={field + ' min-h-24 w-full'} value={logText} onChange={(event) => setLogText(event.target.value)} placeholder="粘贴 ROS / Python / C++ 或 JSON 日志" />
      <button className={button + ' mt-2'} disabled={!logText} onClick={async () => { try { setLogAnalysis(await window.labscope.analysisLog(logText, 'AI Workspace')); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>解析日志</button>
      {logAnalysis && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify({ counts: logAnalysis.counts, clusters: logAnalysis.clusters }, null, 2)}</pre>}
    </section>
  </div>;
}
