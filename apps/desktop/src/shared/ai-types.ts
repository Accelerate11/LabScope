export type AiProviderKind = 'openai-compatible' | 'anthropic' | 'gemini';
export interface AiProviderConfig { id: string; name: string; kind: AiProviderKind; baseUrl: string; model: string; enabled: boolean; hasKey: boolean; }
export interface AiProviderInput { id?: string; name: string; kind: AiProviderKind; baseUrl: string; model: string; apiKey: string; enabled: boolean; }
export interface AiUsage { inputTokens?: number; outputTokens?: number; totalTokens?: number; }
export interface AiResponse { providerId: string; model: string; text: string; usage?: AiUsage; durationMs: number; }
