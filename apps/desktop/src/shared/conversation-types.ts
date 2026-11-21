export type ConversationRole = 'user' | 'assistant' | 'tool' | 'tool-result' | 'error';
export interface ConversationMessage { id: string; role: ConversationRole; text: string; createdAt: string; toolId?: string; evidence?: string[]; }
export interface Conversation { conversationId: string; title: string; experimentId: string | null; providerId: string; modelId: string; createdAt: string; updatedAt: string; archived: boolean; messages: ConversationMessage[]; }
