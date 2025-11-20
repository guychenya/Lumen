
import React, { useState } from 'react';
import { AIProvider, useAI } from './context/AIContext';
import { AISettingsModal } from './components/AISettingsModal';
import { Button } from './components/ui/Button';
import { LLMService } from './services/llmService';
import { ChatMessage } from './types';
import { 
  Settings, 
  Sparkles, 
  Plus, 
  FileText, 
  ChevronRight, 
  MoreHorizontal,
  Zap,
  Bold,
  Italic,
  List,
  PenLine
} from 'lucide-react';

const EditorWorkspace = () => {
  const { setSettingsOpen, config } = useAI();
  
  // Application State
  const [docTitle, setDocTitle] = useState("Project Alpha Requirements");
  const [content, setContent] = useState("The project requires a local-first approach to ensure data sovereignty.\n\nWe need to integrate Ollama for offline inference.");
  
  // AI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");

  // Actions
  const handleAIAction = async (promptPrefix: string) => {
    if (!content) return;
    
    setIsGenerating(true);
    setGeneratedText(""); // Clear previous

    const service = new LLMService(config);
    const fullPrompt = `${promptPrefix} for the following text. output only the result, no preamble:\n\n${content}`;
    const messages: ChatMessage[] = [{ role: 'user', content: fullPrompt }];

    try {
        const generator = service.streamResponse(messages);
        for await (const token of generator) {
            setGeneratedText(prev => prev + token);
        }
    } catch (e) {
        setGeneratedText("Error generating response. Please check your AI Settings.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleInsert = () => {
      setContent(prev => prev + "\n\n" + generatedText);
      setGeneratedText("");
  };

  const handleDiscard = () => {
      setGeneratedText("");
  };

  return (
    <div className="flex h-screen bg-[#0F0F0F] text-gray-100 font-sans overflow-hidden">
      
      {/* 1. Sidebar */}
      <div className="w-64 bg-[#111111] border-r border-[#222] flex-col hidden md:flex">
        <div className="p-4 border-b border-[#222]">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl tracking-tight">
            <Zap className="w-5 h-5 fill-current" />
            <span>Lumen</span>
          </div>
        </div>
        
        <div className="flex-1 p-3 space-y-1 overflow-y-auto">
           <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Notes</div>
           <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white bg-[#1C1C1C] rounded-lg">
              <FileText className="w-4 h-4 text-gray-400" />
              Project Alpha Req...
           </button>
           <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200 rounded-lg transition-colors">
              <FileText className="w-4 h-4 text-gray-500" />
              Meeting Notes (Q3)
           </button>
           <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200 rounded-lg transition-colors">
              <FileText className="w-4 h-4 text-gray-500" />
              Ideas for Blog
           </button>
        </div>

        <div className="p-3 border-t border-[#222]">
           <button className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> New Note
           </button>
        </div>
      </div>

      {/* 2. Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-14 border-b border-[#222] bg-[#111111] flex items-center justify-between px-6">
           <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>My Workspace</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white truncate max-w-[150px]">{docTitle}</span>
           </div>

           <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] rounded-full border border-[#333]">
                <div className={`w-2 h-2 rounded-full ${config.provider === 'ollama' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                <span className="text-xs text-gray-300 font-medium">{config.provider}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                 <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                 <MoreHorizontal className="w-4 h-4" />
              </Button>
           </div>
        </header>

        {/* Toolbar */}
        <div className="h-12 border-b border-[#222] bg-[#161616] flex items-center px-6 gap-2">
            <div className="flex items-center gap-1 pr-4 border-r border-[#333]">
               <button className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded"><Bold className="w-4 h-4" /></button>
               <button className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded"><Italic className="w-4 h-4" /></button>
               <button className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded"><List className="w-4 h-4" /></button>
            </div>
            
            <div className="flex items-center gap-2 pl-2">
               <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider ml-2 mr-1">AI Tools</span>
               <Button size="sm" variant="secondary" onClick={() => handleAIAction("Summarize this note")}>
                  <Sparkles className="w-3 h-3 mr-2 text-emerald-400" /> Summarize
               </Button>
               <Button size="sm" variant="secondary" onClick={() => handleAIAction("Fix grammar and improve tone")}>
                  <PenLine className="w-3 h-3 mr-2 text-blue-400" /> Improve
               </Button>
            </div>
        </div>

        {/* Editor Canvas */}
        <div className="flex-1 overflow-y-auto bg-[#0F0F0F] cursor-text" onClick={() => document.getElementById('editor-body')?.focus()}>
           <div className="max-w-3xl mx-auto py-12 px-8">
              
              {/* Title Input */}
              <input 
                className="w-full bg-transparent text-4xl font-bold text-white placeholder-gray-600 border-none focus:outline-none focus:ring-0 mb-6"
                placeholder="Untitled Note"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
              />

              {/* Body Input */}
              <textarea 
                id="editor-body"
                className="w-full min-h-[300px] bg-transparent text-lg text-gray-300 placeholder-gray-700 border-none focus:outline-none focus:ring-0 resize-none leading-relaxed"
                placeholder="Start typing or paste content here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />

              {/* AI Output Area */}
              { (isGenerating || generatedText) && (
                  <div className="mt-8 border-t border-[#333] pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                     <div className="flex items-center gap-2 mb-3 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                        <Sparkles className="w-4 h-4" />
                        AI Analysis
                     </div>
                     <div className="p-6 rounded-xl bg-[#161616] border border-[#2A2A2A] text-gray-200 leading-relaxed shadow-lg">
                        {generatedText}
                        {isGenerating && <span className="inline-block w-2 h-4 bg-emerald-500 ml-1 animate-pulse"/>}
                     </div>
                     <div className="flex gap-2 mt-3 justify-end">
                        <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={isGenerating}>Discard</Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleInsert} disabled={isGenerating}>Insert into Note</Button>
                     </div>
                  </div>
              )}

           </div>
        </div>
      </div>

      <AISettingsModal />
    </div>
  );
};

const App = () => {
  return (
    <AIProvider>
      <EditorWorkspace />
    </AIProvider>
  );
};

export default App;
