/**
 * IPC channel whitelist.
 *
 * The renderer never gets `ipcRenderer` itself: preload exposes one function per
 * channel below, and main only registers handlers for these exact strings. No
 * dynamic channel names are allowed anywhere in the app.
 */
export const IPC = {
  appInfo: 'app:info',
  configGet: 'config:get',
  configSet: 'config:set',
  sessionStatus: 'session:status',
  sessionConnect: 'session:connect',
  sessionDisconnect: 'session:disconnect',
  sessionSubscribe: 'session:subscribe',
  sessionPanelTopics: 'session:panel-topics',
  /** main -> renderer push events */
  eventSessionStatus: 'event:session-status',
  eventTelemetry: 'event:telemetry',
  eventLog: 'event:log',
  recordingStatus: 'recording:status',
  recordingStart: 'recording:start',
  recordingPause: 'recording:pause',
  recordingResume: 'recording:resume',
  recordingStop: 'recording:stop',
  recordingCancel: 'recording:cancel',
  recordingList: 'recording:list',
  recordingEvent: 'recording:event',
  aiProviders: 'ai:providers',
  aiProviderUpsert: 'ai:provider-upsert',
  aiProviderRemove: 'ai:provider-remove',
  aiProviderTest: 'ai:provider-test',
  aiChat: 'ai:chat',
  analysisTools: 'analysis:tools',
  analysisRun: 'analysis:run',
  analysisLog: 'analysis:log',
  reportGenerate: 'report:generate',
  conversationList: 'conversation:list',
  conversationCreate: 'conversation:create',
  conversationSave: 'conversation:save',
  conversationDelete: 'conversation:delete',
  conversationAppend: 'conversation:append',
  reportExportPdf: 'report:export-pdf',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
