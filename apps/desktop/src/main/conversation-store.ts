import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Conversation, ConversationMessage } from '../shared/conversation-types';

export class ConversationStore {
  private cache: Conversation[] | null = null;
  private get file(): string { return join(app.getPath('userData'), 'ai-conversations.json'); }
  private async read(): Promise<Conversation[]> {
    if (this.cache) return this.cache;
    try { const parsed = JSON.parse(await readFile(this.file, 'utf8')); this.cache = Array.isArray(parsed) ? parsed : []; }
    catch { this.cache = []; }
    return this.cache;
  }
  private async write(items: Conversation[]): Promise<void> { await mkdir(app.getPath('userData'), { recursive: true }); await writeFile(this.file, JSON.stringify(items, null, 2) + '\n'); this.cache = items; }
  async list(): Promise<Conversation[]> { return [...(await this.read())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async create(input: { title: string; experimentId: string | null; providerId: string; modelId: string }): Promise<Conversation> {
    const now = new Date().toISOString(); const item: Conversation = { conversationId: randomUUID(), title: input.title.trim() || 'New analysis', experimentId: input.experimentId, providerId: input.providerId, modelId: input.modelId, createdAt: now, updatedAt: now, archived: false, messages: [] };
    const items = await this.read(); items.push(item); await this.write(items); return item;
  }
  async save(id: string, patch: Partial<Conversation>): Promise<Conversation> { const items = await this.read(); const item = items.find((entry) => entry.conversationId === id); if (!item) throw new Error('会话不存在'); Object.assign(item, patch, { conversationId: id, updatedAt: new Date().toISOString() }); await this.write(items); return item; }
  async append(id: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): Promise<Conversation> { const item = (await this.read()).find((entry) => entry.conversationId === id); if (!item) throw new Error('会话不存在'); item.messages.push({ ...message, id: randomUUID(), createdAt: new Date().toISOString() }); item.updatedAt = new Date().toISOString(); await this.write(await this.read()); return item; }
  async remove(id: string): Promise<void> { await this.write((await this.read()).filter((item) => item.conversationId !== id)); }
}
