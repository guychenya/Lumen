import React, { useState, useEffect, useRef } from 'react';
import { useAI } from '../context/AIContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { AIConfig, AIProviderId, OllamaTagsResponse } from '../types';
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
  ShieldAlert,
  Rabbit,
  Cpu
} from 'lucide-react';
import { LLMService } from '../services/llmService';

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  modelName: 'llama3',
  apiKey: '',
};

const KNOWN_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.5-flash', 'gemini-3-pro-preview'],
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it', 'mixtral-8x7b-32768'], 
  custom: [],
  ollama: [] 
};

const DEFAULT_URLS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  groq: 'https://api.groq.com/openai',
  custom: 'https://api.example.com',
};

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3-1-8b-instant',
  custom: 'custom-model',
};

const PROVIDER_DETAILS: Record<AIProviderId, { label: string; icon: React.FC<any>; description: string }> = {
  ollama: {
    label: 'Ollama',
    icon: Server,
    description: 'Run large language models locally on your machine. Great for offline use, privacy, and unlimited zero-cost generations.',
  },
  openai: {
    label: 'OpenAI',
    icon: Key,
    description: 'Industry-leading cloud models such as GPT-4o and GPT-3.5-turbo. Highly accurate and versatile.',
  },
  anthropic: {
    label: 'Anthropic',
    icon: Key,
    description: 'Claude models (e.g. Claude 3.5 Sonnet, Opus, Haiku) known for advanced reasoning, coding, and excellent writing.',
  },
  gemini: {
    label: 'Google Gemini',
    icon: Key,
    description: 'Google’s next-generation multimodal models (e.g. Gemini 2.5 Flash, 3 Pro) with massive context handling capabilities.',
  },
  groq: {
    label: 'Groq',
    icon: Rabbit,
    description: 'Blazing fast, sub-second inference speeds powered by specialized LPU accelerators. Ideal for instant chat experiences.',
  },
  custom: {
    label: 'Custom OpenAI-Compatible API',
    icon: Cpu,
    description: 'Connect to any third-party engine or local server supporting the standard OpenAI completions API layout.',
  },
};

export const AISettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, config, setConfig } = useAI();
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  const [isMixedContent, setIsMixedContent] = useState(false);
  
  // Selection flow steps: 'select' | 'configure'
  const [step, setStep] = useState<'select' | 'configure'>('select');
  
  // Model Management
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const modelListRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<number | null>(null);

  // Connection Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // No mixed content check needed - Ollama is proxied through the server
  useEffect(() => {
    setIsMixedContent(false);
  }, [localConfig.baseUrl]);

  // When modal opens, sync local state
  useEffect(() => {
    if (isSettingsOpen) {
      setLocalConfig(config);
      setTestResult(null);
      // If they already have a configuration with a key or ollama setup, default directly to 'configure' step for easy edits
      if (config.apiKey || config.provider === 'ollama') {
          setStep('configure');
      } else {
          setStep('select');
      }
      loadModelsForProvider(config);
    }
  }, [isSettingsOpen]);
  
  // Debounced effect to load models when credentials change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
        loadModelsForProvider(localConfig);
    }, 500); // 500ms debounce

    return () => {
        if(debounceTimer.current) clearTimeout(debounceTimer.current);
    }
  }, [localConfig.provider, localConfig.apiKey, localConfig.baseUrl]);


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
    setTestResult(null);
  }, [localConfig.provider, localConfig.baseUrl, localConfig.apiKey]);

  const loadModelsForProvider = async (currentConfig: AIConfig) => {
      const { provider, apiKey, baseUrl } = currentConfig;
      
      setIsLoadingModels(true);
      setAvailableModels([]); // Clear old models

      if (provider === 'ollama') {
          await fetchOllamaModels(currentConfig);
      } else if (['openai', 'groq', 'custom', 'anthropic', 'gemini'].includes(provider)) {
          // Require key/URL before fetching
          if ((provider !== 'custom' && !apiKey) || (provider === 'custom' && !baseUrl)) {
              setIsLoadingModels(false);
              setAvailableModels(KNOWN_MODELS[provider] || []); // Show fallback if available
              return;
          }
          
          const service = new LLMService(currentConfig);
          const result = await service.verifyConnection();

          if (result.success && result.models) {
              setAvailableModels(result.models);
              // If current model is not in the new list, or no model is set, auto-select the default if present, or first.
              if (!result.models.includes(currentConfig.modelName) && result.models.length > 0) {
                  const defaultModel = DEFAULT_MODELS[provider];
                  const exactMatch = result.models.find(m => m.toLowerCase().includes(defaultModel.toLowerCase()));
                  setLocalConfig(prev => ({ ...prev, modelName: exactMatch || result.models![0] }));
              }
          } else {
             setAvailableModels(KNOWN_MODELS[provider] || []);
          }
      }
      setIsLoadingModels(false);
  };


  const fetchOllamaModels = async (currentConfig: AIConfig) => {
    try {
      const res = await fetch('/api/ollama/api/tags');
      const data: OllamaTagsResponse = await res.json();
      const models = data.models.map(m => m.name);
      setAvailableModels(models);
      if (!models.includes(currentConfig.modelName) && models.length > 0) {
        setLocalConfig(prev => ({ ...prev, modelName: models[0] }));
      }
    } catch (error) {
      console.warn("Failed to fetch Ollama models:", error);
      setAvailableModels(['llama3', 'llama3.1', 'gemma2', 'mistral', 'phi3']);
    }
    setIsLoadingModels(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setIsLoadingModels(true);

    const service = new LLMService(localConfig);
    const result = await service.verifyConnection();
    setTestResult(result);

    if (result.success && result.models) {
        setAvailableModels(result.models);
        if (!result.models.includes(localConfig.modelName) && result.models.length > 0) {
            setLocalConfig(prev => ({ ...prev, modelName: result.models![0] }));
        }
    }
    setIsTesting(false);
    setIsLoadingModels(false);
  };

  const handleSave = () => {
    setConfig(localConfig);
    setSettingsOpen(false);
  };

  const handleProviderChange = (providerId: AIProviderId) => {
    const preconfiguredUrl = DEFAULT_URLS[providerId] || '';
    setLocalConfig({
      provider: providerId,
      baseUrl: preconfiguredUrl,
      modelName: DEFAULT_MODELS[providerId] || '',
      apiKey: '',
    });
    setTestResult(null);
  };

  const getApiKeyUrlHint = (providerId: AIProviderId): string => {
    switch (providerId) {
      case 'openai': return 'https://platform.openai.com/api-keys';
      case 'anthropic': return 'https://console.anthropic.com/settings/keys';
      case 'gemini': return 'https://aistudio.google.com/app/apikey';
      case 'groq': return 'https://console.groq.com/keys';
      default: return '';
    }
  };

  if (!isSettingsOpen) return null;

  const needsApiKey = ['openai', 'anthropic', 'gemini', 'groq', 'custom'].includes(localConfig.provider);
  const needsBaseUrl = ['ollama', 'custom'].includes(localConfig.provider);
  const isApiProvider = ['openai', 'groq', 'custom', 'anthropic', 'gemini'].includes(localConfig.provider);
  const selectedProviderInfo = PROVIDER_DETAILS[localConfig.provider] || PROVIDER_DETAILS['ollama'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 text-left">
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => setSettingsOpen(false)}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-[#111111] border border-gray-200 dark:border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
                <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Configuration</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configure your model credentials & settings</p>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
            
            {step === 'select' ? (
                /* STEP 1: Provider Selection */
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-1.5 p-0.5">
                        <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Provider</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Choose the AI service you want to use for writing and editing assistances.</p>
                    </div>
                    
                    <div className="relative mt-2 p-0.5">
                        <select
                            value={localConfig.provider}
                            onChange={(e) => handleProviderChange(e.target.value as AIProviderId)}
                            className="w-full bg-white dark:bg-[#1C1C1C] border border-gray-300 dark:border-[#333] rounded-lg p-3.5 pr-10 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none shadow-sm cursor-pointer"
                        >
                            <option value="ollama">Ollama (Run locally on your machine)</option>
                            <option value="gemini">Google Gemini (Gemini 2.5 Pro/Flash)</option>
                            <option value="groq">Groq (Ultra-fast llama, mistral models)</option>
                            <option value="custom">Custom (OpenAI-compatible endpoints)</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 dark:text-gray-400">
                            <ChevronsUpDown className="w-4 h-4" />
                        </div>
                    </div>
                    
                    {/* Selected Provider Details Block */}
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#1C1C1C]/50 border border-gray-200/60 dark:border-[#222] mt-4 flex gap-3.5">
                        <div className="p-2.5 bg-white dark:bg-[#252525] rounded-lg border border-gray-200/50 dark:border-[#333] shadow-sm shrink-0 h-fit">
                            {React.createElement(selectedProviderInfo.icon, { className: "w-5 h-5 text-emerald-500" })}
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                {selectedProviderInfo.label} Option
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                {selectedProviderInfo.description}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* STEP 2: Shared Credentials & Connection Config */
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    
                    {/* Selected Provider Inline Box */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-500/10 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-[#1e2a22] rounded-lg border border-emerald-100 dark:border-emerald-500/20 shadow-xs">
                                {React.createElement(selectedProviderInfo.icon, { className: "w-4.5 h-4.5 text-emerald-500 shrink-0" })}
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-tight lh-none">Active Provider</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none mt-0.5">{selectedProviderInfo.label}</p>
                            </div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setStep('select')} 
                            className="text-xs px-2.5 h-8 font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        >
                            Change Provider
                        </Button>
                    </div>

                    {/* Shared Fields inside a unified config block */}
                    <div className="p-5 rounded-xl border border-gray-200 dark:border-[#222] bg-gray-50/50 dark:bg-[#141414]/50 space-y-4">
                        
                        {/* 1. Base URL Field */}
                        {needsBaseUrl && (
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">API Base URL</label>
                                <Input
                                    value={localConfig.baseUrl || ''}
                                    onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                                    placeholder={localConfig.provider === 'ollama' ? "http://127.0.0.1:11434" : "https://api.example.com"}
                                />
                                {localConfig.provider === 'ollama' && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Standard background address is usually <code>http://localhost:11434</code>.</p>
                                )}
                            </div>
                        )}

                        {/* Mixed Content Warning (Customized for LLM context) */}
                        {isMixedContent && localConfig.provider === 'ollama' && (
                            <div className="flex gap-2.5 p-3.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-800 dark:text-red-300 text-xs items-start text-left">
                                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                                <div>
                                    <strong className="block mb-1 text-red-900 dark:text-red-200 font-semibold">Connection Blocked (Mixed Content)</strong>
                                    You are accessing this web application over secure HTTPS, but your local Ollama runs on open HTTP. Browsers block secure to insecure calls.
                                    <div className="mt-2 space-y-1.5 text-left">
                                        <div className="text-[11px]">
                                            <strong>Option A: Run App Locally (Simple)</strong>
                                            <p className="opacity-80 mt-0.5">Export this project (top right menu), run <code>npm i</code> and <code>npm run dev</code> locally.</p>
                                        </div>
                                        <div className="h-px bg-red-100 dark:bg-red-500/10" />
                                        <div className="text-[11px]">
                                            <strong>Option B: Expose via Ngrok tunnel</strong>
                                            <p className="opacity-80 mt-0.5">Expose Ollama with secure tunnel and paste `https` URL above:</p>
                                            <code className="block bg-black/10 dark:bg-black/30 p-1.5 rounded mt-1 font-mono text-[10px] whitespace-pre text-gray-800 dark:text-gray-250">OLLAMA_ORIGINS="*" ollama serve{"\n"}ngrok http 11434</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. API Key Field */}
                        {needsApiKey && (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {localConfig.provider === 'custom' ? 'Authorization Token' : `${selectedProviderInfo.label} API Key`}
                                    </label>
                                    {getApiKeyUrlHint(localConfig.provider) && (
                                        <a 
                                            href={getApiKeyUrlHint(localConfig.provider)} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
                                        >
                                            Get API Key ↗
                                        </a>
                                    )}
                                </div>
                                <Input
                                    type="password"
                                    value={localConfig.apiKey || ''}
                                    onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value.trim() })}
                                    placeholder={localConfig.provider === 'custom' ? "Optional, e.g. Bearer Token" : "Enter API key to authenticate..."}
                                    className="font-mono text-xs"
                                />
                                {localConfig.provider !== 'custom' && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Key is processed safely server-side to execute your prompts securely.</p>
                                )}
                            </div>
                        )}

                        {/* 3. Model Selector Field */}
                        <div className="space-y-1.5" ref={modelListRef}>
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Model Name</label>
                            <div className="relative">
                                <div className="relative">
                                    <Input
                                        value={localConfig.modelName}
                                        onChange={(e) => {
                                            setLocalConfig({ ...localConfig, modelName: e.target.value });
                                            setIsModelListOpen(true);
                                        }}
                                        onFocus={() => {
                                            setIsModelListOpen(true);
                                            if (availableModels.length === 0) {
                                                loadModelsForProvider(localConfig);
                                            }
                                        }}
                                        placeholder={isLoadingModels ? "Loading models..." : "Select or type a model"}
                                        className="pr-10"
                                        disabled={isLoadingModels}
                                    />
                                    <div 
                                        className="absolute right-2.5 top-2.5 text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                        onClick={() => {
                                            setIsModelListOpen(!isModelListOpen);
                                            loadModelsForProvider(localConfig);
                                        }}
                                    >
                                        {isLoadingModels ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-500"/> : <ChevronsUpDown className="w-4 h-4" />}
                                    </div>
                                </div>

                                {isModelListOpen && (
                                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                        {availableModels.length > 0 ? availableModels
                                            .filter(m => m.toLowerCase().includes((localConfig.modelName || '').toLowerCase()))
                                            .map((model) => (
                                            <button
                                                key={model}
                                                className="w-full text-left px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] hover:text-black dark:hover:text-white flex items-center justify-between border-b border-gray-100 dark:border-[#222] last:border-0"
                                                onClick={() => {
                                                    setLocalConfig({ ...localConfig, modelName: model });
                                                    setIsModelListOpen(false);
                                                }}
                                            >
                                                <span>{model}</span>
                                                {localConfig.modelName === model && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                                            </button>
                                        )) : (
                                            <div className="px-3 py-3.5 text-xs text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-[#181818]/50">
                                                {isApiProvider ? "No remote models found. Try connection verification." : "No models detected yet."}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Unified Connection Verification Report Card */}
                    {testResult && (
                        <div className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                            testResult.success 
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/20 animate-in fade-in zoom-in-95' 
                            : 'bg-red-50/60 dark:bg-red-950/10 text-red-800 dark:text-red-300 border-red-200/50 dark:border-red-500/20 animate-in fade-in zoom-in-95'
                        }`}>
                            <div className="mt-0.5 shrink-0">
                                {testResult.success 
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> 
                                    : <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                }
                            </div>
                            <div className="space-y-1">
                                <strong className="font-semibold block">{testResult.success ? 'Verification Successful' : 'Verification Failed'}</strong>
                                <span className="leading-relaxed opacity-90 block">{testResult.message}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#161616]">
            {step === 'configure' ? (
                <Button variant="ghost" onClick={() => setStep('select')} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">
                    Back to Provider
                </Button>
            ) : (
                <Button variant="ghost" onClick={() => setSettingsOpen(false)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">
                    Cancel
                </Button>
            )}
            
            <div className="flex gap-2">
                {step === 'select' ? (
                    <Button 
                        onClick={() => {
                            setStep('configure');
                            loadModelsForProvider(localConfig);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white text-xs px-5 shadow-sm font-semibold transition-all h-9"
                    >
                        Configure Server
                    </Button>
                ) : (
                    <>
                        <Button 
                            variant="secondary" 
                            onClick={handleTestConnection}
                            disabled={isTesting || (isApiProvider && !localConfig.apiKey && localConfig.provider !== 'custom')}
                            className="text-xs font-semibold px-4 cursor-pointer hover:bg-gray-150 transition-colors h-9"
                        >
                            {isTesting ? 'Verifying...' : 'Test Connection'}
                        </Button>
                        <Button 
                            onClick={handleSave} 
                            className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white text-xs px-5 shadow-sm font-semibold transition-all h-9"
                        >
                            Save Settings
                        </Button>
                    </>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};
