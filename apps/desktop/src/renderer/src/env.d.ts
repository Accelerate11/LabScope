/// <reference types="vite/client" />

import type { LabScopeApi } from '../../shared/api';

declare global {
  interface Window {
    /** Injected by the preload script; absent when the page runs outside Electron. */
    labscope: LabScopeApi;
  }
}

export {};
