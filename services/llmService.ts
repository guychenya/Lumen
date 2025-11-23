

import { AIConfig, ChatMessage } from '../types';
import { GoogleGenAI } from '@google/genai';

export class LLMService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  private getCleanBaseUrl(url?: string): string {
    if (!url) return 'http://127.0.0.1:11434';
    let clean = url.replace(/\/$/, '');
    if (clean.includes('localhost')) {
        clean = clean.replace('localhost', '127.0.0.1');
    }
    return clean;
  }

  private checkMixedContent(url: string): string | null {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.includes('http:')) {
        return "Security Error: You are accessing this app via HTTPS but trying to connect to an insecure HTTP server (Ollama). Browsers block this. Please run this web app on HTTP (http://localhost:...) or use a tunneling service (ngrok) for Ollama.";
    }
    return null;
  }

  /**
   * Verifies if the current configuration is valid and returns available models on success.
   */
  async verifyConnection(): Promise<{ success: boolean; message: string; models?: string[] }> {
    const { provider, apiKey, baseUrl } = this.config;

    if (provider === 'ollama') {
      const cleanBaseUrl = this.getCleanBaseUrl(baseUrl);
      const mixedContentError = this.checkMixedContent(cleanBaseUrl);
      if (mixedContentError) return { success: false, message: mixedContentError };
      try {
        const res = await this.fetchOllamaTags(cleanBaseUrl);
        if (res.ok) {
          const data = await res.json();
          const models = data.models.map((m: any) => m.name);
          return { success: true, message: 'Connected to Ollama successfully.', models };
        }
        return { success: false, message: `Ollama connected but returned error: ${res.status}` };
      } catch (error: any) {
        let msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Failed to fetch')) {
            msg += " (Ensure Ollama is running and OLLAMA_ORIGINS='*' is set)";
        }
        return { success: false, message: `Connection Failed: ${msg}` };
      }
    }

    if (provider === 'gemini') {
      if (!apiKey) return { success: false, message: 'API Key is required.' };
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
           const data = await res.json();
           const models = data.models.map((m: any) => m.name.replace('models/', ''));
           return { success: true, message: 'Gemini Key is valid.', models };
        }
        return { success: false, message: `Gemini Error: ${res.statusText}` };
      } catch (e: any) {
        return { success: false, message: `Network Error: ${e.message}` };
      }
    }

    if (provider === 'anthropic') {
         if (!apiKey) return { success: false, message: 'API Key is required.' };
         try {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
            });
            if (res.ok) {
                const data = await res.json();
                const models = data.data.map((m: any) => m.id);
                return { success: true, message: 'Anthropic Key is valid.', models };
            }
            return { success: false, message: `Anthropic Error: ${res.status}` };
        } catch (e: any) {
            return { success: false, message: `Anthropic may block browser requests (CORS). This key might be valid but can't be tested here.` };
        }
    }

    if (provider === 'openai' || provider === 'groq' || provider === 'custom') {
        let endpoint = '';
        if (provider === 'openai') endpoint = 'https://api.openai.com/v1/models';
        if (provider === 'groq') endpoint = 'https://api.groq.com/openai/v1/models';
        if (provider === 'custom') {
            if (!baseUrl) return { success: false, message: 'Base URL is required for Custom provider.'};
            endpoint = `${this.getCleanBaseUrl(baseUrl)}/v1/models`;
        }
        
        if (!apiKey && provider !== 'custom') return { success: false, message: 'API Key is required.' };
        
        try {
            const headers: HeadersInit = {};
            if (apiKey && apiKey.toLowerCase() !== 'na' && apiKey.toLowerCase() !== '') {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const res = await fetch(endpoint, { headers });
            if (res.ok) {
                const data = await res.json();
                const models = data.data.map((m: any) => m.id).sort();
                return { success: true, message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API is valid.`, models };
            }
            const errorText = await res.text();
            return { success: false, message: `${provider} Error: ${res.status} ${res.statusText} - ${errorText.slice(0, 100)}` };
        } catch (e: any) {
            return { success: false, message: `Network Error (CORS?): ${e.message}` };
        }
    }

    return { success: false, message: 'Unknown provider.' };
  }

  private async fetchOllamaTags(baseUrl: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        return await fetch(`${baseUrl}/api/tags`, { 
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal 
        });
    } finally {
        clearTimeout(timeoutId);
    }
  }

  private getOpenAICompatibleEndpoint(): string {
      const { provider, baseUrl } = this.config;
      if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions';
      if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions';
      if (provider === 'custom') return `${this.getCleanBaseUrl(baseUrl)}/v1/chat/completions`;
      return ''; // Should not happen
  }

  async *streamResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    const { provider, baseUrl, apiKey, modelName } = this.config;
    const model = modelName || 'llama3'; // Default model

    try {
        if (provider === 'ollama') {
            const cleanUrl = this.getCleanBaseUrl(baseUrl);
            const mixedContentError = this.checkMixedContent(cleanUrl);
            if (mixedContentError) throw new Error(mixedContentError);

            const response = await fetch(`${cleanUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, stream: true }),
            });
            
            if (!response.body) throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; 
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) yield json.message.content;
                        if (json.error) throw new Error(json.error);
                    } catch (e) { console.warn('Error parsing JSON chunk', e); }
                }
            }
        } 
        
        else if (['openai', 'groq', 'custom'].includes(provider)) {
            const endpoint = this.getOpenAICompatibleEndpoint();
            if (!endpoint) throw new Error("Invalid endpoint for OpenAI-compatible provider.");

            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (apiKey && apiKey.toLowerCase() !== 'na' && apiKey.toLowerCase() !== '') {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, messages, stream: true })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || response.statusText);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            if (json.choices?.[0]?.delta?.content) yield json.choices[0].delta.content;
                        } catch (e) { }
                    }
                }
            }
        }

        else if (provider === 'gemini') {
            if (!apiKey) throw new Error('Gemini API key is required.');
            const ai = new GoogleGenAI({ apiKey });
            
            let systemInstruction: string | undefined;
            const chatMessages = messages.filter(m => {
                if (m.role === 'system' && !systemInstruction) {
                    systemInstruction = m.content;
                    return false;
                }
                return m.role === 'user' || m.role === 'assistant';
            });

            const contents = chatMessages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            const responseStream = await ai.models.generateContentStream({
                model,
                contents,
                ...(systemInstruction && { config: { systemInstruction } })
            });

            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) yield text;
            }
        }
        
        else {
            yield "Provider implementation not fully ready.";
        }

    } catch (error: any) {
        console.error("Streaming Error:", error);
        let msg = error.message || String(error);
        if (msg.includes('Failed to fetch')) {
             msg += " (Check: Is the server running? Is CORS configured?)";
        }
        yield `\n[Error: ${msg}]`;
    }
  }
}