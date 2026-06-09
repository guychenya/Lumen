

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
  ShieldAlert,
  Rabbit,
  Cpu
} from 'lucide-react';
import { LLMService } from '../services/llmService';

// FIX: Define DEFAULT_AI_CONFIG, which was missing in this scope.
// This provides a default state when a user selects a new AI provider.
const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  modelName: 'llama3',
  apiKey: '',
};

// Fallback models if API fetch fails before user interaction
const KNOWN_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.5-flash', 'gemini-3-pro-preview'],
  groq: [], // Will be fetched dynamically
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

export const AISettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, config, setConfig } = useAI();
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  const [isMixedContent, setIsMixedContent] = useState(false);
  
  // Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  
  // Model Management
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const modelListRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<number | null>(null);

  // Connection Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check for mixed content
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      setIsMixedContent(localConfig.baseUrl?.startsWith('http://') || false);
    } else {
      setIsMixedContent(false);
    }
  }, [localConfig.baseUrl]);

  // When modal opens, sync local state
  useEffect(() => {
    if (isSettingsOpen) {
      setLocalConfig(config);
      setTestResult(null);
      // Start wizard at step 3 if configured, else step 1
      if (config.apiKey || config.provider === 'ollama') {
          setWizardStep(3);
      } else {
          setWizardStep(1);
      }
      // Trigger initial model load for the current provider
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
              // If current model is not in the new list, or no model is set, auto-select the first one.
              if (!result.models.includes(currentConfig.modelName) && result.models.length > 0) {
                  setLocalConfig(prev => ({ ...prev, modelName: result.models![0] }));
              }
          } else {
             // On failure, fallback to known models if any
             setAvailableModels(KNOWN_MODELS[provider] || []);
          }
      }
      setIsLoadingModels(false);
  };


  const fetchOllamaModels = async (currentConfig: AIConfig) => {
    if (!currentConfig.baseUrl) {
      setIsLoadingModels(false);
      return;
    };
    try {
      const service = new LLMService(currentConfig);
      const result = await service.verifyConnection();
      if (result.success) {
          const cleanUrl = currentConfig.baseUrl.replace(/\/$/, '').replace('localhost', '1227.0.0.1');
          const res = await fetch(`${cleanUrl}/api/tags`);
          const data: OllamaTagsResponse = await res.json();
          const models = data.models.map(m => m.name);
          setAvailableModels(models);
           if (!models.includes(currentConfig.modelName) && models.length > 0) {
              setLocalConfig(prev => ({ ...prev, modelName: models[0] }));
           }
      } else {
          setAvailableModels(KNOWN_MODELS['ollama'] || ['llama3']); // Fallback
      }
    } catch (error) {
      console.warn("Failed to fetch Ollama models:", error);
      setAvailableModels(KNOWN_MODELS['ollama'] || ['llama3']); // Fallback
    }
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

  if (!isSettingsOpen) return null;

  const needsApiKey = ['openai', 'anthropic', 'gemini', 'groq', 'custom'].includes(localConfig.provider);
  const needsBaseUrl = ['ollama', 'custom'].includes(localConfig.provider);
  const isApiProvider = ['openai', 'groq', 'custom', 'anthropic', 'gemini'].includes(localConfig.provider);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => setSettingsOpen(false)}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-[#111111] border border-gray-200 dark:border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
                <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Configuration</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configure your intelligence provider</p>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                <div className={`flex items-center gap-2 ${wizardStep >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${wizardStep >= 1 ? 'border-emerald-600 dark:border-emerald-500' : 'border-gray-300 dark:border-gray-600'}`}>1</div>
                    <span className="hidden sm:inline">Provider</span>
                </div>
                <div className={`h-px flex-1 mx-2 sm:mx-4 ${wizardStep >= 2 ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-[#333]'}`} />
                <div className={`flex items-center gap-2 ${wizardStep >= 2 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${wizardStep >= 2 ? 'border-emerald-600 dark:border-emerald-500' : 'border-gray-300 dark:border-gray-600'}`}>2</div>
                    <span className="hidden sm:inline">Connection</span>
                </div>
                <div className={`h-px flex-1 mx-2 sm:mx-4 ${wizardStep >= 3 ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-[#333]'}`} />
                <div className={`flex items-center gap-2 ${wizardStep >= 3 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${wizardStep >= 3 ? 'border-emerald-600 dark:border-emerald-500' : 'border-gray-300 dark:border-gray-600'}`}>3</div>
                    <span className="hidden sm:inline">Model</span>
                </div>
            </div>

            {wizardStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select AI Provider</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                        { id: 'ollama', label: 'Ollama', icon: Server, desc: 'Local compute' },
                        { id: 'openai', label: 'OpenAI', icon: Key, desc: 'Cloud hosted'  },
                        { id: 'anthropic', label: 'Anthropic', icon: Key, desc: 'Cloud hosted'  },
                        { id: 'gemini', label: 'Gemini', icon: Key, desc: 'Cloud hosted'  },
                        { id: 'groq', label: 'Groq', icon: Rabbit, desc: 'Fast inference'  },
                        { id: 'custom', label: 'Custom', icon: Cpu, desc: 'Any OpenAI API'  },
                    ].map((provider) => (
                        <button
                        key={provider.id}
                        onClick={() => {
                            const preconfiguredUrl = DEFAULT_URLS[provider.id] || '';
                            setLocalConfig({ ...DEFAULT_AI_CONFIG, provider: provider.id as any, baseUrl: preconfiguredUrl });
                            setAvailableModels(KNOWN_MODELS[provider.id] || []);
                            setTestResult(null);
                            setWizardStep(2);
                        }}
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                            localConfig.provider === provider.id
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 dark:border-emerald-600 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500 dark:ring-emerald-600'
                            : 'bg-white dark:bg-[#1C1C1C] border-gray-300 dark:border-[#333] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#252525] hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                        >
                        <provider.icon className="w-6 h-6 mb-1" />
                        <span className="text-sm font-medium">{provider.label}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{provider.desc}</span>
                        </button>
                    ))}
                    </div>
                </div>
            )}

            {wizardStep === 2 && (
               <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#181818]">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Base URL</label>
                        <Input
                            value={localConfig.baseUrl || ''}
                            onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                            placeholder="e.g. https://api.openai.com"
                            disabled={!['ollama', 'custom'].includes(localConfig.provider)}
                        />
                        {!['ollama', 'custom'].includes(localConfig.provider) && (
                            <p className="text-[11px] text-gray-500 pt-1">Base URL is pre-configured for {localConfig.provider}.</p>
                        )}
                        {isMixedContent && localConfig.provider === 'ollama' && (
                            <div className="flex gap-2 p-3 mt-2 mb-2 rounded bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/50 text-red-700 dark:text-red-200 text-xs items-start">
                                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="block mb-1">Connection Blocked (Mixed Content)</strong>
                                    This app is currently hosted on HTTPS, but your local Ollama is on HTTP. Browsers strictly block this. To fix it, you have 2 options:
                                    <div className="mt-2 space-y-2">
                                        <div>
                                            <strong>Option A: Run App Locally (Recommended)</strong>
                                            <p className="text-red-600/80 dark:text-red-300/80 mt-0.5">Export this project (top right menu), run <code>npm i</code> and <code>npm run dev</code> locally.</p>
                                        </div>
                                        <div className="h-px bg-red-200 dark:bg-red-500/30" />
                                        <div>
                                            <strong>Option B: Tunnel Ollama (Ngrok)</strong>
                                            <p className="text-red-600/80 dark:text-red-300/80 mt-0.5">Expose your local Ollama via HTTPS in your terminal:</p>
                                            <code className="block bg-black/10 dark:bg-black/30 p-1.5 rounded mt-1 font-mono text-[10px]">OLLAMA_ORIGINS="*" ollama serve<br/>ngrok http 11434</code>
                                            <p className="text-red-600/80 dark:text-red-300/80 mt-1">Then paste the new <code>https://...ngrok.app</code> URL above.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {needsApiKey && (
                        <div className="space-y-2">
                            <Input
                                label={`${localConfig.provider.charAt(0).toUpperCase() + localConfig.provider.slice(1)} API Key`}
                                type="password"
                                value={localConfig.apiKey}
                                onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value.trim() })}
                                placeholder={localConfig.provider === 'custom' ? "Optional, e.g. for Hugging Face" : "Enter API key to continue..."}
                            />
                            {!['custom', 'ollama'].includes(localConfig.provider) && (
                                <p className="text-[11px] text-gray-500 pt-1">You must provide a valid {localConfig.provider.charAt(0).toUpperCase() + localConfig.provider.slice(1)} API key.</p>
                            )}
                        </div>
                    )}
                    
                    {testResult && (
                        <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-500/20'}`}>
                            {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span className="leading-relaxed">{testResult.message}</span>
                        </div>
                    )}
               </div>
            )}

            {wizardStep === 3 && (
               <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 p-5 rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#181818]">
                    <div className="space-y-2" ref={modelListRef}>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Model Name</label>
                        <div className="relative">
                            <div className="relative">
                                <Input
                                    value={localConfig.modelName}
                                    onChange={(e) => {
                                        setLocalConfig({ ...localConfig, modelName: e.target.value });
                                        setIsModelListOpen(true);
                                    }}
                                    onFocus={() => setIsModelListOpen(true)}
                                    placeholder={isLoadingModels ? "Loading models..." : "Select or type a model"}
                                    className="pr-10"
                                    disabled={isLoadingModels}
                                />
                                <div 
                                    className="absolute right-2 top-2.5 text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                                    onClick={() => setIsModelListOpen(!isModelListOpen)}
                                >
                                    {isLoadingModels ? <RefreshCw className="w-4 h-4 animate-spin"/> : <ChevronsUpDown className="w-4 h-4" />}
                                </div>
                            </div>

                            {isModelListOpen && (
                                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[#222] border border-gray-300 dark:border-[#333] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                    {availableModels.length > 0 ? availableModels
                                        .filter(m => m.toLowerCase().includes((localConfig.modelName || '').toLowerCase()))
                                        .map((model) => (
                                        <button
                                            key={model}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white flex items-center justify-between"
                                            onClick={() => {
                                                setLocalConfig({ ...localConfig, modelName: model });
                                                setIsModelListOpen(false);
                                            }}
                                        >
                                            <span>{model}</span>
                                            {localConfig.modelName === model && <Check className="w-3 h-3 text-emerald-500" />}
                                        </button>
                                    )) : (
                                        <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                                            {isApiProvider ? "No models found. Check API key." : "No models available."}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
               </div>
            )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#161616]">
            {wizardStep > 1 ? (
                <Button variant="ghost" onClick={() => setWizardStep(prev => prev - 1 as any)}>
                    Back
                </Button>
            ) : (
                <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
                    Cancel
                </Button>
            )}
            
            <div className="flex gap-2">
                {wizardStep === 2 ? (
                    <>
                        <Button 
                            variant="secondary" 
                            onClick={handleTestConnection}
                            disabled={isTesting || (isApiProvider && !localConfig.apiKey && localConfig.provider !== 'custom')}
                            className="text-sm"
                        >
                            {isTesting ? 'Verifying...' : 'Test Connection'}
                        </Button>
                        <Button 
                            onClick={() => { setWizardStep(3); loadModelsForProvider(localConfig); }} 
                            className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white text-sm shadow-sm"
                            disabled={isApiProvider && !localConfig.apiKey && localConfig.provider !== 'custom'}
                        >
                            Next
                        </Button>
                    </>
                ) : wizardStep === 3 ? (
                    <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white text-sm shadow-sm">
                        Finish Setup
                    </Button>
                ) : null}
            </div>
        </div>
      </div>
    </div>
  );
};
