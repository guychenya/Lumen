
export type AIProviderId = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'custom';
export type ConnectionStatus = 'connected' | 'checking' | 'disconnected';

export interface AIConfig {
  provider: AIProviderId;
  apiKey?: string;
  baseUrl?: string; // Essential for Ollama (e.g., http://localhost:11434)
  modelName: string;
}

export interface ChatMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}