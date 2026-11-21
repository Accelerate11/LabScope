import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { DesktopConfig } from '../shared/types';

const DEFAULT_CONFIG: DesktopConfig = { lastUrl: 'ws://127.0.0.1:8765' };
const MAX_URL_LENGTH = 2048;

/**
 * Tiny JSON config store.
 *
 * M1 only needs "remember the last bridge URL". It is deliberately not SQLite
 * yet: experiment metadata (SQLite) arrives with the recorder in M4. Values are
 * sanitized on every read and write so a hand-edited or corrupted file can never
 * inject a non-string URL into the connection path.
 */
export class ConfigStore {
  private readonly filePath: string;
  private cached: DesktopConfig | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'config.json');
  }

  get path(): string {
    return this.filePath;
  }

  read(): DesktopConfig {
    if (this.cached !== null) return this.cached;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      parsed = null;
    }
    this.cached = sanitizeConfig(parsed);
    return this.cached;
  }

  write(patch: Partial<DesktopConfig>): DesktopConfig {
    const next = sanitizeConfig({ ...this.read(), ...patch });
    const tempFile = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tempFile, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      renameSync(tempFile, this.filePath);
    } catch (error) {
      console.error('[config] failed to persist:', error);
      try {
        rmSync(tempFile, { force: true });
      } catch (cleanupError) {
        console.warn('[config] failed to remove temporary file:', cleanupError);
      }
      throw new Error('无法保存连接地址', { cause: error });
    }
    this.cached = next;
    return next;
  }
}

function sanitizeConfig(value: unknown): DesktopConfig {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const rawUrl = source['lastUrl'];
  const lastUrl =
    typeof rawUrl === 'string' && rawUrl.length > 0 && rawUrl.length <= MAX_URL_LENGTH
      ? rawUrl
      : DEFAULT_CONFIG.lastUrl;
  return { lastUrl };
}
