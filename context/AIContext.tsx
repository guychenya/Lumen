import React, { createContext, useContext, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { AIConfig } from '../types';

interface AIContextType {
  config: AIConfig;
  setConfig: (config: AIConfig) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  modelName: 'llama3',
  apiKey: '',
};

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Updated keys to 'lumen-'
  const [config, setConfig] = useLocalStorage<AIConfig>('lumen-ai-config', DEFAULT_AI_CONFIG);
  const [isSettingsOpen, setSettingsOpen] = useLocalStorage<boolean>('lumen-ai-modal-open', false);

  return (
    <AIContext.Provider value={{ config, setConfig, isSettingsOpen, setSettingsOpen }}>
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