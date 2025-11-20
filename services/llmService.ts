
import { AIConfig, ChatMessage } from '../types';

export class LLMService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  private getCleanBaseUrl(url?: string): string {
    if (!url) return 'http://localhost:11434';
    return url.replace(/\/$/, '');
  }

  /**
   * Verifies if the current configuration is valid and reachable.
   */
  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    const { provider, apiKey } = this.config;

    // --- OLLAMA ---
    if (provider === 'ollama') {
      let baseUrl = this.getCleanBaseUrl(this.config.baseUrl);
      try {
        const res = await this.fetchOllamaTags(baseUrl);
        if (res.ok) return { success: true, message: 'Connected to Ollama successfully.' };
        return { success: false, message: `Ollama connected but returned error: ${res.status}` };
      } catch (error: any) {
        // IPv4 Fallback check
        if (baseUrl.includes('localhost')) {
            try {
                const res = await this.fetchOllamaTags(baseUrl.replace('localhost', '127.0.0.1'));
                if (res.ok) return { success: true, message: 'Connected via 127.0.0.1 fallback.' };
            } catch (e) {}
        }
        let msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Failed to fetch')) msg += " (Ensure Ollama is running with OLLAMA_ORIGINS='*')";
        return { success: false, message: `Connection Failed: ${msg}` };
      }
    }

    // --- CLOUD PROVIDERS ---
    if (!apiKey) return { success: false, message: 'API Key is required.' };

    if (provider === 'openai') {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) return { success: true, message: 'OpenAI Key is valid.' };
        return { success: false, message: `OpenAI Error: ${res.status} ${res.statusText}` };
      } catch (e: any) {
        return { success: false, message: `Network Error (CORS?): ${e.message}` };
      }
    }

    if (provider === 'gemini') {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) return { success: true, message: 'Gemini Key is valid.' };
        return { success: false, message: `Gemini Error: ${res.statusText}` };
      } catch (e: any) {
        return { success: false, message: `Network Error: ${e.message}` };
      }
    }

    if (provider === 'anthropic') {
         try {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
            });
            if (res.ok) return { success: true, message: 'Anthropic Key is valid.' };
            return { success: false, message: `Anthropic Error: ${res.status}` };
        } catch (e: any) {
            return { success: false, message: `Anthropic strictly blocks browser requests (CORS). This key might be valid but can't be tested here.` };
        }
    }

    return { success: false, message: 'Unknown provider.' };
  }

  private async fetchOllamaTags(baseUrl: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        return await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
  }

  /**
   * Real streaming implementation
   */
  async *streamResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    const { provider, baseUrl, apiKey, modelName } = this.config;
    const model = modelName || (provider === 'ollama' ? 'llama3' : 'gpt-4o');

    try {
        if (provider === 'ollama') {
            const response = await fetch(`${this.getCleanBaseUrl(baseUrl)}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, stream: true })
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
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

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
        
        else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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
             // Gemini REST API "streamGenerateContent"
             const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
             // Maps standard "messages" to Gemini "contents"
             const contents = messages.map(m => ({
                 role: m.role === 'assistant' ? 'model' : 'user',
                 parts: [{ text: m.content }]
             }));

             const response = await fetch(url, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ contents })
             });

             if (!response.ok) throw new Error(response.statusText);

             const reader = response.body?.getReader();
             const decoder = new TextDecoder();
             let buffer = '';

             while (reader) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                // Gemini returns a JSON array like [{...}, \n {...}]
                // We need to parse these objects. 
                // Simple regex for this context: find objects { ... }
                // Note: Production apps should use a proper stream parser.
                let match;
                const regex = /"text":\s*"([^"]*)"/g; // Basic extraction
                while ((match = regex.exec(buffer)) !== null) {
                     // Simple unescape might be needed
                     yield match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }
                // Clear buffer periodically or use better parsing if precise
                if (buffer.length > 10000) buffer = buffer.slice(-1000); 
             }
        }
        
        else {
            yield "Provider implementation not fully ready. Try Ollama.";
        }

    } catch (error: any) {
        console.error("Streaming Error:", error);
        yield `\n[Error: ${error.message}]`;
    }
  }
}
