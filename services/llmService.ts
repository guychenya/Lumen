import { AIConfig, ChatMessage } from '../types';

export class LLMService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * Verifies if the current configuration is valid and reachable.
   */
  async verifyConnection(): Promise<{ success: boolean; message: string }> {
    if (this.config.provider === 'ollama') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const res = await fetch(`${this.config.baseUrl}/api/tags`, { 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          return { success: true, message: 'Successfully connected to Ollama instance.' };
        } else {
          return { success: false, message: `Ollama responded with status: ${res.status}` };
        }
      } catch (e) {
        return { success: false, message: 'Could not reach Ollama. Check if it is running and CORS is configured.' };
      }
    } else {
      // Cloud Providers (OpenAI, Anthropic, Gemini)
      // In a browser-only env, we can't easily make direct calls due to CORS without a proxy.
      // We will perform a basic validation and simulate a check.
      
      if (!this.config.apiKey || this.config.apiKey.trim().length < 10) {
        return { success: false, message: 'Invalid API Key format.' };
      }

      // Simulate network verification delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      return { success: true, message: `Valid ${this.config.provider} configuration format.` };
    }
  }

  /**
   * Simulates streaming text response
   */
  async *streamResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    const lastMessage = messages[messages.length - 1].content;
    
    let text = "";
    const model = this.config.modelName || 'default';

    if (this.config.provider === 'ollama') {
        text = `[Ollama Local: ${model}]\n\nHere is a processed response based on your input: "${lastMessage}".\n\nSince I am running locally, your privacy is preserved.`;
    } else {
        text = `[Cloud API: ${this.config.provider}]\n\nI have analyzed your request: "${lastMessage}".\n\nHere is a comprehensive summary and expansion of the key points you mentioned.`;
    }

    const tokens = text.split(' ');
    for (const token of tokens) {
        await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 30));
        yield token + " ";
    }
  }
}