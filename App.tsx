import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AIProvider, useAI } from './context/AIContext';
import { NotesProvider, useNotes } from './context/NotesContext';
import { AISettingsModal } from './components/AISettingsModal';
import { Button } from './components/ui/Button';
import { LLMService } from './services/llmService';
import { htmlToMarkdown, htmlToText } from './services/converter';
import { FloatingToolbar } from './components/FloatingToolbar';
import { SlashCommandMenu, SlashCommand } from './components/SlashCommandMenu';
import { RichEditor } from './components/RichEditor';
import { VoiceModeModal } from './components/VoiceModeModal';
import { ChatMessage } from './types';
import { 
  Settings, Sparkles, Plus, FileText, ChevronRight, MoreHorizontal, Zap,
  Bold, Italic, List, PenLine, Trash2, Edit2, Image as ImageIcon, 
  Table as TableIcon, Download, Upload, File, FileCode, Printer, ChevronDown, Mic,
  Heading1, Heading2, Heading3, ListOrdered, CheckSquare, Quote, Code, Minus, Video, Play, Type
} from 'lucide-react';

const EditorWorkspace = () => {
  const { setSettingsOpen, config, connectionStatus } = useAI();
  const { notes, activeNote, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote } = useNotes();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);

  // Slash Command State
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });

  const editorRef = useRef<HTMLDivElement>(null);
  const headerTitleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper for inserting HTML
  const insertHtml = (html: string) => {
    document.execCommand('insertHTML', false, html);
  };
  
  const execFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const insertVideo = (url: string) => {
    let html = '';
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
        html = `<div class="aspect-video my-6"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-[400px] rounded-xl border border-[#333] shadow-lg"></iframe></div><p><br/></p>`;
    } else {
        html = `<video src="${url}" controls class="w-full rounded-xl border border-[#333] shadow-lg my-6"></video><p><br/></p>`;
    }
    insertHtml(html);
  };

  // Define commands with access to component scope (for refs)
  const slashCommands: SlashCommand[] = useMemo(() => [
      {
        id: 'text',
        label: 'Text',
        icon: Type,
        description: 'Start writing with plain text',
        action: () => execFormat('formatBlock', 'P')
      },
      {
        id: 'h1',
        label: 'Heading 1',
        icon: Heading1,
        description: 'Big section heading',
        action: () => execFormat('formatBlock', 'H1')
      },
      {
        id: 'h2',
        label: 'Heading 2',
        icon: Heading2,
        description: 'Medium section heading',
        action: () => execFormat('formatBlock', 'H2')
      },
      {
        id: 'h3',
        label: 'Heading 3',
        icon: Heading3,
        description: 'Small section heading',
        action: () => execFormat('formatBlock', 'H3')
      },
      {
        id: 'bullet',
        label: 'Bullet List',
        icon: List,
        description: 'Create a simple bulleted list',
        action: () => execFormat('insertUnorderedList')
      },
      {
        id: 'numbered',
        label: 'Numbered List',
        icon: ListOrdered,
        description: 'Create a numbered list',
        action: () => execFormat('insertOrderedList')
      },
      {
        id: 'todo',
        label: 'To-Do List',
        icon: CheckSquare,
        description: 'Track tasks with a checklist',
        action: () => insertHtml('<ul class="my-2 space-y-1"><li><input type="checkbox" class="mr-2 accent-emerald-500 h-4 w-4 rounded border-gray-600 bg-[#222]"> Todo item</li></ul><p><br/></p>')
      },
      {
        id: 'image-upload',
        label: 'Image Upload',
        icon: Upload,
        description: 'Upload an image from your device',
        action: () => fileInputRef.current?.click()
      },
      {
        id: 'image-url',
        label: 'Image (URL)',
        icon: ImageIcon,
        description: 'Embed an image via link',
        action: () => {
            const url = prompt("Enter Image URL:");
            if(url) execFormat('insertImage', url);
        }
      },
      {
        id: 'video',
        label: 'Video',
        icon: Video,
        description: 'Embed a video from URL or YouTube',
        action: () => {
            const url = prompt("Enter Video URL (YouTube or MP4):");
            if(url) insertVideo(url);
        }
      },
      {
        id: 'table',
        label: 'Table',
        icon: TableIcon,
        description: 'Add a simple 2x2 table',
        action: () => insertHtml('<table class="border-collapse w-full my-6 text-sm"><thead><tr><th class="border border-[#333] p-3 bg-[#1A1A1A] text-left text-emerald-500">Header 1</th><th class="border border-[#333] p-3 bg-[#1A1A1A] text-left text-emerald-500">Header 2</th></tr></thead><tbody><tr><td class="border border-[#333] p-3">Cell 1</td><td class="border border-[#333] p-3">Cell 2</td></tr></tbody></table><p><br/></p>')
      },
      {
        id: 'quote',
        label: 'Quote',
        icon: Quote,
        description: 'Capture a quote',
        action: () => insertHtml('<blockquote class="border-l-4 border-emerald-500 pl-4 italic my-6 bg-[#1A1A1A] py-3 rounded-r text-gray-300">Quote here</blockquote><p><br/></p>')
      },
      {
        id: 'code',
        label: 'Code Block',
        icon: Code,
        description: 'Capture a code snippet',
        action: () => insertHtml('<pre class="bg-[#111] p-4 rounded-lg border border-[#333] font-mono text-sm text-gray-300 my-6 shadow-inner overflow-x-auto"><code>// Code here</code></pre><p><br/></p>')
      },
      {
        id: 'divider',
        label: 'Divider',
        icon: Minus,
        description: 'Visually divide blocks',
        action: () => execFormat('insertHorizontalRule')
      }
  ], []);

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
           
           // Calculate fixed position based on viewport
           setSlashMenuPos({
               top: rect.bottom + 10, 
               left: rect.left
           });
           setSlashMenuOpen(true);
       }
    }
  };

  const executeSlashCommand = (command: SlashCommand) => {
    // Remove the slash that triggered the menu (heuristic: delete last character)
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

  const handleVoiceInsert = (htmlContent: string) => {
      if (!activeNote || !editorRef.current) return;
      editorRef.current.focus();
      document.execCommand('insertHTML', false, htmlContent);
  };

  const handleDiscard = () => {
      setGeneratedText("");
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

  const handleExport = (type: 'md' | 'txt' | 'pdf') => {
      if (!activeNote) return;
      setIsExportMenuOpen(false);

      if (type === 'pdf') {
          window.print();
          return;
      }

      let content = '';
      let mime = 'text/plain';
      let ext = 'txt';

      if (type === 'md') {
          content = htmlToMarkdown(activeNote.content);
          mime = 'text/markdown';
          ext = 'md';
      } else {
          content = htmlToText(activeNote.content);
          mime = 'text/plain';
          ext = 'txt';
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeNote.title || 'untitled'}.${ext}`;
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
      
      {/* Sidebar - Sticky and Fixed Height - HIDDEN ON PRINT */}
      <div className="w-64 bg-[#111111] border-r border-[#222] flex flex-col min-w-[250px] z-30 sticky top-0 h-screen print:hidden">
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
        
        {/* Header - HIDDEN ON PRINT */}
        <header className="h-14 border-b border-[#222] bg-[#111111] flex items-center justify-between px-6 z-20 print:hidden sticky top-0">
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
              
              <div className="relative">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="text-gray-400 hover:text-white flex items-center gap-1"
                >
                    <Download className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                </Button>
                {isExportMenuOpen && (
                     <div className="absolute right-0 top-full mt-2 w-48 bg-[#222] border border-[#333] rounded-lg shadow-xl z-20 py-1">
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-[#333]">Export As</div>
                        <button onClick={() => handleExport('md')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">
                            <FileCode className="w-4 h-4" /> Markdown (.md)
                        </button>
                        <button onClick={() => handleExport('txt')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">
                            <File className="w-4 h-4" /> Plain Text (.txt)
                        </button>
                        <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">
                            <Printer className="w-4 h-4" /> PDF (Print)
                        </button>
                     </div>
                )}
              </div>

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

        {/* Toolbar - HIDDEN ON PRINT */}
        <div className="h-12 border-b border-[#222] bg-[#161616] flex items-center px-6 gap-2 overflow-x-auto no-scrollbar z-20 sticky top-14 print:hidden">
            <div className="flex items-center gap-1 pr-4 border-r border-[#333]">
                <button onClick={() => execFormat('bold')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                <button onClick={() => execFormat('italic')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                <button onClick={() => execFormat('insertUnorderedList')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bullet List"><List className="w-4 h-4" /></button>
                <button onClick={insertImage} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Insert Image"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={() => execFormat('formatBlock', 'H2')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded font-serif font-bold text-xs" title="Heading">H2</button>
            </div>
            
            <div className="flex items-center gap-2 pl-2 whitespace-nowrap flex-1">
                <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider ml-2 mr-1">AI Tools</span>
                <Button size="sm" variant="secondary" onClick={() => handleAIAction("Summarize this note")}>
                    <Sparkles className="w-3 h-3 mr-2 text-emerald-400" /> Summarize
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleAIAction("Fix grammar and improve tone")}>
                    <PenLine className="w-3 h-3 mr-2 text-blue-400" /> Improve
                </Button>
            </div>

            <Button 
                onClick={() => setIsVoiceModeOpen(true)} 
                className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 hover:bg-emerald-600/30"
                size="sm"
            >
                <Mic className="w-4 h-4 mr-2" /> Voice Mode
            </Button>
        </div>

        {/* Editor Canvas with Dotted Background */}
        <div className="flex-1 bg-dotted-pattern relative cursor-text print:bg-white" onClick={() => editorRef.current?.focus()}>
           {activeNote ? (
               <div className="max-w-4xl mx-auto py-12 px-8 min-h-[calc(100vh-7rem)] print:p-0 print:min-h-0">
                  <input 
                    className="w-full bg-transparent text-4xl font-bold text-white placeholder-gray-600 border-none focus:outline-none focus:ring-0 mb-6 print:text-black"
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
                    className="print:text-black print:prose-p:text-black print:prose-headings:text-black"
                  />

                  {/* Hidden File Input for Images */}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                        
                  {/* Floating Toolbar - HIDDEN ON PRINT */}
                  <div className="print:hidden">
                    <FloatingToolbar 
                        editorRef={editorRef} 
                        onFormat={execFormat} 
                        onAI={handleAIAction}
                    />
                  </div>

                  {/* AI Output Area - HIDDEN ON PRINT */}
                  { (isGenerating || generatedText) && (
                      <div className="mt-8 border-t border-[#333] pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">
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
                  
                  <div className="h-20 print:hidden" />
               </div>
           ) : (
               <div className="flex items-center justify-center h-full text-gray-500 print:hidden">
                   Select a note or create a new one
               </div>
           )}
        </div>
      </div>

      <div className="print:hidden">
        <AISettingsModal />
        <VoiceModeModal 
            isOpen={isVoiceModeOpen} 
            onClose={() => setIsVoiceModeOpen(false)} 
            onInsert={handleVoiceInsert}
        />
        <SlashCommandMenu 
            isOpen={slashMenuOpen} 
            position={slashMenuPos} 
            commands={slashCommands}
            onSelect={executeSlashCommand}
            onClose={() => setSlashMenuOpen(false)}
        />
      </div>
      
      {isMenuOpen && (
          <div className="fixed inset-0 z-10 bg-transparent print:hidden" onClick={() => setIsMenuOpen(false)} />
      )}
      {isExportMenuOpen && (
          <div className="fixed inset-0 z-10 bg-transparent print:hidden" onClick={() => setIsExportMenuOpen(false)} />
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