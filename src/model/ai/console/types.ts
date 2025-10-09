export type AIProvider = "google";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider: AIProvider;
  model: string;
  messages: ChatMessage[];
}

export interface AISettings {
  googleApiKey: string;
  defaultModel: string;
}

export const DEFAULT_MODEL = "gemini-2.0-flash-001";


