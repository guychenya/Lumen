
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
  audio?: {
    mimeType: string;
    data: string; // Base64 data without data URL scheme prefix
  };
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
  tags?: string[];
  type?: 'note' | 'voice';
  audioData?: string; // base64 audio string/data URL
  duration?: number; // audio duration in seconds
  folder?: string; // Optional folder name
}