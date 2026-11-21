import * as electron from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiProviderConfig, AiProviderInput, AiResponse } from '../shared/ai-types';

const { app, safeStorage } = electron;

interface StoredProvider extends Omit<AiProviderConfig, 'hasKey'> { encryptedKey?: string; }
interface StoreFile { version: 1; providers: StoredProvider[]; }
const defaultStore = (): StoreFile => ({ version: 1, providers: [] });
function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('AI Base URL 必须使用 HTTP(S)');
  return url.toString().replace(/\/$/, '');
}
export class AiGateway {
  private get file(): string { return join(app.getPath('userData'), 'ai-providers.json'); }
  private cache: StoreFile | null = null;
  private async read(): Promise<StoreFile> {
    if (this.cache) return this.cache;
    try { this.cache = JSON.parse(await readFile(this.file, 'utf8')) as StoreFile; } catch { this.cache = defaultStore(); }
    return this.cache!;
  }
  private async write(store: StoreFile): Promise<void> {
    await mkdir(join(app.getPath('userData')), { recursive: true });
    await writeFile(this.file, JSON.stringify(store, null, 2) + '\n', { flag: 'w' }); this.cache = store;
  }
  async list(): Promise<AiProviderConfig[]> {
    const store = await this.read();
    return store.providers.map(({ encryptedKey, ...provider }) => ({ ...provider, hasKey: !!encryptedKey }));
  }
  async upsert(input: AiProviderInput): Promise<AiProviderConfig[]> {
    if (!input.name.trim() || !input.model.trim()) throw new Error('AI Provider 名称和模型不能为空');
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 凭据加密不可用，未保存 API Key');
    const store = await this.read();
    const provider: StoredProvider = {
      id: input.id || randomUUID(), name: input.name.trim(), kind: input.kind, baseUrl, model: input.model.trim(),
      enabled: input.enabled, encryptedKey: input.apiKey ? safeStorage.encryptString(input.apiKey).toString('base64') :
        store.providers.find((item) => item.id === input.id)?.encryptedKey,
    };
    store.providers = [...store.providers.filter((item) => item.id !== provider.id), provider];
    return this.listAfter(await this.writeAndReturn(store));
  }
  private async writeAndReturn(store: StoreFile): Promise<StoreFile> { await this.write(store); return store; }
  private async listAfter(_store: StoreFile): Promise<AiProviderConfig[]> { return this.list(); }
  async remove(id: string): Promise<AiProviderConfig[]> {
    const store = await this.read(); store.providers = store.providers.filter((item) => item.id !== id); await this.write(store); return this.list();
  }
  async test(id: string): Promise<{ ok: boolean; message: string }> {
    try { const response = await this.chat(id, 'Reply with a short connection confirmation.', 128); return { ok: true, message: response.text.slice(0, 160) }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
  }
  async chat(id: string, prompt: string, maxTokens = 1024): Promise<AiResponse> {
    const store = await this.read(), provider = store.providers.find((item) => item.id === id);
    if (!provider?.encryptedKey) throw new Error('AI Provider 未配置 API Key');
    const key = safeStorage.decryptString(Buffer.from(provider.encryptedKey, 'base64'));
    const started = Date.now();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    let url = provider.baseUrl;
    let body: unknown;
    if (provider.kind === 'anthropic') {
      url += '/v1/messages'; headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01';
      body = { model: provider.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    } else if (provider.kind === 'gemini') {
      url += '/v1beta/models/' + encodeURIComponent(provider.model) + ':generateContent?key=' + encodeURIComponent(key);
      body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } };
    } else {
      url += '/chat/completions'; headers.authorization = 'Bearer ' + key;
      body = { model: provider.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('AI Provider HTTP ' + response.status);
    const data = await response.json() as Record<string, unknown>;
    const text = provider.kind === 'anthropic' ? String(((data.content as Array<Record<string, unknown>>)?.[0]?.text) ?? '') :
      provider.kind === 'gemini' ? String((((data.candidates as Array<Record<string, unknown>>)?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>)?.[0]?.text ?? '') :
      String(((data.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content ?? '');
    return { providerId: provider.id, model: provider.model, text, durationMs: Date.now() - started,
      usage: data.usage as AiResponse['usage'] };
  }
}
