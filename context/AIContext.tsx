
import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { AIConfig, ConnectionStatus } from '../types';
import { LLMService } from '../services/llmService';

interface AIContextType {
  config: AIConfig;
  setConfig: (config: AIConfig) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  connectionStatus: ConnectionStatus;
  checkConnection: () => Promise<void>;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  modelName: 'llama3',
  apiKey: '',
};

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useLocalStorage<AIConfig>('lumen-ai-config', DEFAULT_AI_CONFIG);
  const [isSettingsOpen, setSettingsOpen] = useLocalStorage<boolean>('lumen-ai-modal-open', false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');

  const checkConnection = async () => {
    setConnectionStatus('checking');
    const service = new LLMService(config);
    const result = await service.verifyConnection();
    setConnectionStatus(result.success ? 'connected' : 'disconnected');
  };

  // Check connection whenever config changes
  useEffect(() => {
    checkConnection();
    
    // Optional: Poll for local connections (Ollama) in case it starts up later
    let interval: any;
    if (config.provider === 'ollama') {
      interval = setInterval(checkConnection, 30000);
    }
    
    return () => clearInterval(interval);
  }, [config]);

  return (
    <AIContext.Provider value={{ config, setConfig, isSettingsOpen, setSettingsOpen, connectionStatus, checkConnection }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};
