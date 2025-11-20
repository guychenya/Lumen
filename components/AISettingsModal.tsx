
import React, { useState, useEffect, useRef } from 'react';
import { useAI } from '../context/AIContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { AIConfig, OllamaTagsResponse } from '../types';
import { 
  AlertCircle, 
  CheckCircle2, 
  Server, 
  Key, 
  Bot, 
  X, 
  RefreshCw, 
  ChevronsUpDown,
  Check,
  ShieldAlert
} from 'lucide-react';
import { LLMService } from '../services/llmService';

const KNOWN_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
  ollama: [] 
};

export const AISettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, config, setConfig } = useAI();
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  const [isMixedContent, setIsMixedContent] = useState(false);
  
  // Model Management
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const modelListRef = useRef<HTMLDivElement>(null);

  // Connection Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isSettingsOpen) {
      setLocalConfig(config);
      setTestResult(null);
    }
  }, [isSettingsOpen, config]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelListRef.current && !modelListRef.current.contains(event.target as Node)) {
        setIsModelListOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (localConfig.provider === 'ollama') {
      fetchOllamaModels();
      // Check Mixed Content: Running on HTTPS but trying to access HTTP
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && localConfig.baseUrl?.includes('http:')) {
          setIsMixedContent(true);
      } else {
          setIsMixedContent(false);
      }
    } else {
      setAvailableModels(KNOWN_MODELS[localConfig.provider] || []);
      setIsMixedContent(false);
    }
  }, [localConfig.provider, localConfig.baseUrl]);

  useEffect(() => {
    setTestResult(null);
  }, [localConfig.provider, localConfig.baseUrl, localConfig.apiKey]);

  const fetchOllamaModels = async () => {
    if (!localConfig.baseUrl) return;
    setIsLoadingModels(true);
    try {
      const response = await fetch(`${localConfig.baseUrl.replace(/\/$/, '')}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data: OllamaTagsResponse = await response.json();
      setAvailableModels(data.models.map(m => m.name));
    } catch (error) {
      console.warn("Failed to fetch Ollama models:", error);
      setAvailableModels(['llama3', 'mistral', 'gemma', 'qwen']);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const service = new LLMService(localConfig);
    const result = await service.verifyConnection();
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSave = () => {
    setConfig(localConfig);
    setSettingsOpen(false);
  };

  if (!isSettingsOpen) return null;

  const needsApiKey = localConfig.provider !== 'ollama';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => setSettingsOpen(false)}
      />

      <div className="relative w-full max-w-lg bg-[#111111] border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222] bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Configuration</h2>
              <p className="text-xs text-gray-400">Configure your intelligence provider</p>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-300">Select Provider</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { id: 'ollama', label: 'Ollama', icon: Server },
                { id: 'openai', label: 'OpenAI', icon: Key },
                { id: 'anthropic', label: 'Anthropic', icon: Key },
                { id: 'gemini', label: 'Gemini', icon: Key },
              ].map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => setLocalConfig({ ...localConfig, provider: provider.id as any, modelName: '' })}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                    localConfig.provider === provider.id
                      ? 'bg-emerald-900/20 border-emerald-600 text-emerald-400'
                      : 'bg-[#1C1C1C] border-[#333] text-gray-400 hover:bg-[#252525] hover:border-gray-600'
                  }`}
                >
                  <provider.icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{provider.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-[#2A2A2A] bg-[#181818] space-y-5">
            
            {localConfig.provider === 'ollama' && (
                 <div className="space-y-2">
                    <div className="flex justify-between">
                        <label className="text-sm font-medium text-gray-300">Ollama Base URL</label>
                        <button 
                            onClick={fetchOllamaModels}
                            className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                            disabled={isLoadingModels}
                        >
                            <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                            Refresh Models
                        </button>
                    </div>
                    <Input
                        value={localConfig.baseUrl}
                        onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                        placeholder="http://localhost:11434"
                    />
                    {isMixedContent && (
                        <div className="flex gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span>
                                <strong>Browser Security Warning:</strong> You are on HTTPS but Ollama is HTTP. 
                                Browsers block this. Please use a tunneling service (like ngrok) or run this app locally via HTTP.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {needsApiKey && (
                <div className="space-y-2">
                    <Input
                        label={`${localConfig.provider.charAt(0).toUpperCase() + localConfig.provider.slice(1)} API Key`}
                        type="password"
                        value={localConfig.apiKey}
                        onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                        placeholder="sk-..."
                    />
                </div>
            )}

            <div className="space-y-2" ref={modelListRef}>
                <label className="text-sm font-medium text-gray-300">Model Name</label>
                <div className="relative">
                    <div className="relative">
                        <Input
                            value={localConfig.modelName}
                            onChange={(e) => {
                                setLocalConfig({ ...localConfig, modelName: e.target.value });
                                setIsModelListOpen(true);
                            }}
                            onFocus={() => setIsModelListOpen(true)}
                            placeholder={localConfig.provider === 'ollama' ? "llama3" : "gpt-4o"}
                            className="pr-10"
                        />
                        <div 
                            className="absolute right-2 top-2.5 text-gray-500 cursor-pointer hover:text-gray-300"
                            onClick={() => setIsModelListOpen(!isModelListOpen)}
                        >
                            <ChevronsUpDown className="w-4 h-4" />
                        </div>
                    </div>

                    {isModelListOpen && availableModels.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-[#222] border border-[#333] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {availableModels
                                .filter(m => m.toLowerCase().includes((localConfig.modelName || '').toLowerCase()))
                                .map((model) => (
                                <button
                                    key={model}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white flex items-center justify-between"
                                    onClick={() => {
                                        setLocalConfig({ ...localConfig, modelName: model });
                                        setIsModelListOpen(false);
                                    }}
                                >
                                    <span>{model}</span>
                                    {localConfig.modelName === model && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-4 border-t border-[#2A2A2A]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-400">Connection Status</span>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="h-7 text-xs"
                    >
                        {isTesting ? 'Verifying...' : 'Test Connection'}
                    </Button>
                </div>
                
                {testResult && (
                    <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                        <span className="leading-relaxed">{testResult.message}</span>
                    </div>
                )}
            </div>

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#222] bg-[#161616]">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
                Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500">
                Save Configuration
            </Button>
        </div>
      </div>
    </div>
  );
};
