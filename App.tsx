
import React, { useState, useRef, useEffect } from 'react';
import { AIProvider, useAI } from './context/AIContext';
import { NotesProvider, useNotes } from './context/NotesContext';
import { AISettingsModal } from './components/AISettingsModal';
import { Button } from './components/ui/Button';
import { LLMService } from './services/llmService';
import { htmlToMarkdown } from './services/converter';
import { FloatingToolbar } from './components/FloatingToolbar';
import { SlashCommandMenu, SlashCommand } from './components/SlashCommandMenu';
import { RichEditor } from './components/RichEditor';
import { ChatMessage } from './types';
import { 
  Settings, Sparkles, Plus, FileText, ChevronRight, MoreHorizontal, Zap,
  Bold, Italic, List, PenLine, Trash2, Edit2, Image as ImageIcon, 
  Table as TableIcon, Download, Upload
} from 'lucide-react';

const EditorWorkspace = () => {
  const { setSettingsOpen, config, connectionStatus } = useAI();
  const { notes, activeNote, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote } = useNotes();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Slash Command State
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });

  const editorRef = useRef<HTMLDivElement>(null);
  const headerTitleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuOpen) {
        // Let the menu handle arrows and enter
        if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return; 
        if (e.key === 'Escape') setSlashMenuOpen(false);
    }

    if (e.key === '/') {
       const selection = window.getSelection();
       if (selection && selection.rangeCount > 0) {
           const range = selection.getRangeAt(0);
           const rect = range.getBoundingClientRect();
           setSlashMenuPos({
               top: rect.top + window.scrollY,
               left: rect.left + window.scrollX
           });
           setSlashMenuOpen(true);
       }
    }
  };

  const executeSlashCommand = (command: SlashCommand) => {
    // Remove the slash that triggered the menu (heuristic: delete last character)
    // In contentEditable this is tricky, for now we just execute the command which inserts at caret
    // Ideally we find the slash node and remove it. 
    document.execCommand('delete'); // Remove the slash
    command.action();
    setSlashMenuOpen(false);
    editorRef.current?.focus();
  };

  // --- AI Actions ---
  const handleAIAction = async (promptPrefix: string) => {
    if (!activeNote?.content) return;
    
    // Convert current HTML to text/md for the AI context
    const context = htmlToMarkdown(activeNote.content);

    setIsGenerating(true);
    setGeneratedText(""); 

    const service = new LLMService(config);
    const fullPrompt = `${promptPrefix} for the following text. output only the result:\n\n${context}`;
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
      if (!activeNote || !editorRef.current) return;
      editorRef.current.focus();
      // Insert AI text as HTML
      const html = generatedText.replace(/\n/g, '<br/>');
      document.execCommand('insertHTML', false, html);
      setGeneratedText("");
  };

  const handleDiscard = () => {
      setGeneratedText("");
  };

  // Formatting Actions
  const execFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const insertImage = () => {
      fileInputRef.current?.click();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
              const base64 = e.target?.result as string;
              execFormat('insertImage', base64);
          };
          reader.readAsDataURL(file);
      }
  };

  const exportMarkdown = () => {
      if (!activeNote) return;
      const md = htmlToMarkdown(activeNote.content);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeNote.title || 'untitled'}.md`;
      a.click();
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
      case 'checking': return 'bg-yellow-500 animate-pulse';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0F0F0F] text-gray-100 font-sans">
      
      {/* Sidebar - Sticky and Fixed Height */}
      <div className="w-64 bg-[#111111] border-r border-[#222] flex flex-col min-w-[250px] z-30 sticky top-0 h-screen">
        <div className="p-4 border-b border-[#222]">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl tracking-tight">
            <Zap className="w-5 h-5 fill-current" />
            <span>Lumen</span>
          </div>
        </div>
        
        <div className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
           <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</div>
           {notes.map(note => (
               <button 
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                        activeNoteId === note.id 
                        ? 'bg-[#1C1C1C] text-white border border-[#333]' 
                        : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200'
                    }`}
               >
                  <FileText className={`w-4 h-4 ${activeNoteId === note.id ? 'text-emerald-500' : 'text-gray-500'}`} />
                  <span className="truncate">{note.title || "Untitled Note"}</span>
               </button>
           ))}
        </div>

        <div className="p-3 border-t border-[#222] mt-auto">
           <button 
             onClick={addNote}
             className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-900/20"
           >
              <Plus className="w-4 h-4" /> New Note
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Header */}
        <header className="h-14 border-b border-[#222] bg-[#111111] flex items-center justify-between px-6 z-20">
           <div className="flex items-center gap-2 text-sm text-gray-400 w-full mr-4">
              <span className="hidden sm:inline shrink-0">My Workspace</span>
              <ChevronRight className="w-4 h-4 hidden sm:inline shrink-0" />
              <input 
                ref={headerTitleRef}
                className="bg-transparent text-white font-medium focus:outline-none focus:border-b border-gray-600 min-w-[100px] w-full max-w-md truncate"
                value={activeNote?.title || ""}
                onChange={(e) => activeNote && updateNote(activeNote.id, { title: e.target.value })}
                placeholder="Untitled Note"
              />
           </div>

           <div className="flex items-center gap-3 shrink-0">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={exportMarkdown}
                className="text-gray-400 hover:text-white"
                title="Export to Markdown"
              >
                 <Download className="w-4 h-4" />
              </Button>

              <div className="h-4 w-px bg-[#333] mx-1" />

              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] rounded-full border border-[#333]">
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${getStatusColor()}`} title={connectionStatus} />
                <span className="text-xs text-gray-300 font-medium uppercase tracking-wider">{config.provider}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                 <Settings className="w-4 h-4" />
              </Button>
              
              <div className="relative">
                <Button variant="ghost" size="sm" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#222] border border-[#333] rounded-lg shadow-xl z-20 py-1">
                        <button 
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white"
                            onClick={() => {
                                headerTitleRef.current?.focus();
                                setIsMenuOpen(false);
                            }}
                        >
                            <Edit2 className="w-4 h-4" /> Rename Note
                        </button>
                        <button 
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-[#333] border-t border-[#333]"
                            onClick={() => {
                                if (activeNote) deleteNote(activeNote.id);
                                setIsMenuOpen(false);
                            }}
                        >
                            <Trash2 className="w-4 h-4" /> Delete Note
                        </button>
                    </div>
                )}
              </div>
           </div>
        </header>

        {/* Toolbar */}
        <div className="h-12 border-b border-[#222] bg-[#161616] flex items-center px-6 gap-2 overflow-x-auto no-scrollbar z-20 sticky top-0">
            <div className="flex items-center gap-1 pr-4 border-r border-[#333]">
                <button onClick={() => execFormat('bold')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                <button onClick={() => execFormat('italic')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                <button onClick={() => execFormat('insertUnorderedList')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bullet List"><List className="w-4 h-4" /></button>
                <button onClick={insertImage} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Insert Image"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={() => execFormat('formatBlock', 'H2')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded font-serif font-bold text-xs" title="Heading">H2</button>
            </div>
            
            <div className="flex items-center gap-2 pl-2 whitespace-nowrap">
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
        <div className="flex-1 bg-[#0F0F0F] relative cursor-text" onClick={() => editorRef.current?.focus()}>
           {activeNote ? (
               <div className="max-w-4xl mx-auto py-12 px-8 min-h-[calc(100vh-7rem)]">
                  <input 
                    className="w-full bg-transparent text-4xl font-bold text-white placeholder-gray-600 border-none focus:outline-none focus:ring-0 mb-6"
                    placeholder="Untitled Note"
                    value={activeNote.title}
                    onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                  />

                  <RichEditor 
                    editorRef={editorRef}
                    initialContent={activeNote.content}
                    onChange={(html) => updateNote(activeNote.id, { content: html })}
                    onKeyDown={handleKeyDown}
                    onSelect={() => { /* Trigger toolbar check */ }}
                  />

                  {/* Hidden File Input for Images */}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                        
                  {/* Floating Toolbar on Selection */}
                  <FloatingToolbar 
                    editorRef={editorRef} 
                    onFormat={execFormat} 
                    onAI={handleAIAction}
                  />

                  {/* AI Output Area */}
                  { (isGenerating || generatedText) && (
                      <div className="mt-8 border-t border-[#333] pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                         <div className="flex items-center gap-2 mb-3 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                            <Sparkles className="w-4 h-4" />
                            AI Analysis
                         </div>
                         <div className="p-6 rounded-xl bg-[#161616] border border-[#2A2A2A] text-gray-200 leading-relaxed shadow-lg whitespace-pre-wrap">
                            {generatedText}
                            {isGenerating && <span className="inline-block w-2 h-4 bg-emerald-500 ml-1 animate-pulse"/>}
                         </div>
                         <div className="flex gap-2 mt-3 justify-end">
                            <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={isGenerating}>Discard</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleInsert} disabled={isGenerating}>Insert into Note</Button>
                         </div>
                      </div>
                  )}
                  
                  <div className="h-20" />
               </div>
           ) : (
               <div className="flex items-center justify-center h-full text-gray-500">
                   Select a note or create a new one
               </div>
           )}
        </div>
      </div>

      <AISettingsModal />
      <SlashCommandMenu 
        isOpen={slashMenuOpen} 
        position={slashMenuPos} 
        onSelect={executeSlashCommand}
        onClose={() => setSlashMenuOpen(false)}
      />
      
      {isMenuOpen && (
          <div className="fixed inset-0 z-10 bg-transparent" onClick={() => setIsMenuOpen(false)} />
      )}
    </div>
  );
};

const App = () => {
  return (
    <NotesProvider>
        <AIProvider>
            <EditorWorkspace />
        </AIProvider>
    </NotesProvider>
  );
};

export default App;
