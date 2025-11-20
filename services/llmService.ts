
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
   * Performs actual HTTP requests to the providers.
   */
  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    const { provider, apiKey } = this.config;

    // --- OLLAMA VERIFICATION ---
    if (provider === 'ollama') {
      let baseUrl = this.getCleanBaseUrl(this.config.baseUrl);
      
      try {
        // Attempt 1: User provided URL
        const res = await this.fetchOllamaTags(baseUrl);
        if (res.ok) return { success: true, message: 'Connected to Ollama successfully.' };
        
        return { success: false, message: `Ollama connected but returned error: ${res.status} ${res.statusText}` };

      } catch (error: any) {
        // Attempt 2: Fallback to 127.0.0.1 if localhost failed (common Node/Browser IPv6 issue)
        if (baseUrl.includes('localhost')) {
            const fallbackUrl = baseUrl.replace('localhost', '127.0.0.1');
            try {
                const res = await this.fetchOllamaTags(fallbackUrl);
                if (res.ok) {
                    // Update config silently or suggest change? For now just succeed.
                    return { success: true, message: 'Connected via 127.0.0.1 fallback.' };
                }
            } catch (fallbackError) {
                // ignore, return original error
            }
        }

        let msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Failed to fetch')) {
             msg += " (Ensure Ollama is running with OLLAMA_ORIGINS='*')";
        }
        return { success: false, message: `Connection Failed: ${msg}` };
      }
    }

    // --- OPENAI VERIFICATION ---
    if (provider === 'openai') {
      if (!apiKey) return { success: false, message: 'API Key is required.' };
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (res.ok) return { success: true, message: 'OpenAI API Key is valid.' };
        if (res.status === 401) return { success: false, message: 'Invalid OpenAI API Key (401).' };
        
        return { success: false, message: `OpenAI Error: ${res.status} ${res.statusText}` };
      } catch (error: any) {
        // OpenAI blocks browser CORS by default. If this fails in a browser, it's likely CORS.
        return { success: false, message: `Network/CORS Error. If running in browser, OpenAI blocks direct access. (Error: ${error.message})` };
      }
    }

    // --- GEMINI VERIFICATION ---
    if (provider === 'gemini') {
      if (!apiKey) return { success: false, message: 'API Key is required.' };
      try {
        // Google GenAI uses query param for key
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          method: 'GET'
        });

        if (res.ok) return { success: true, message: 'Gemini API Key is valid.' };
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error?.message || res.statusText;
        return { success: false, message: `Gemini Error: ${errMsg}` };
      } catch (error: any) {
        return { success: false, message: `Connection Failed: ${error.message}` };
      }
    }

    // --- ANTHROPIC VERIFICATION ---
    if (provider === 'anthropic') {
        if (!apiKey) return { success: false, message: 'API Key is required.' };
        try {
            // Anthropic strictly enforces CORS. This will likely fail in standard browsers 
            // without a proxy, but we attempt it for Electron/Server contexts.
            const res = await fetch('https://api.anthropic.com/v1/models', {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            if (res.ok) return { success: true, message: 'Anthropic API Key is valid.' };
            if (res.status === 401) return { success: false, message: 'Invalid API Key.' };
            return { success: false, message: `Anthropic Error: ${res.status}` };
        } catch (error: any) {
            return { success: false, message: `CORS/Network Error. Anthropic does not support direct browser calls. (${error.message})` };
        }
    }

    return { success: false, message: 'Unknown provider.' };
  }

  private async fetchOllamaTags(baseUrl: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
        const res = await fetch(`${baseUrl}/api/tags`, { 
            signal: controller.signal,
            // Mode 'cors' is default, but explicit helps debugging
            mode: 'cors', 
        });
        return res;
    } finally {
        clearTimeout(timeoutId);
    }
  }

  /**
   * Simulates streaming text response
   * Note: In a real app, this would hook into the AI SDK or fetch streams directly.
   */
  async *streamResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    const lastMessage = messages[messages.length - 1].content;
    let text = "";
    const model = this.config.modelName || 'default';

    // Mock response generation
    if (this.config.provider === 'ollama') {
        text = `[Ollama (${model})]: I received your input "${lastMessage.slice(0, 20)}...". \n\nSince I am running locally, I can process this without data leaving your machine.`;
    } else {
        text = `[${this.config.provider}]: Analyzing "${lastMessage.slice(0, 20)}..." \n\nHere is a generated response based on the context provided.`;
    }

    const tokens = text.split(' ');
    for (const token of tokens) {
        await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 30));
        yield token + " ";
    }
  }
}
