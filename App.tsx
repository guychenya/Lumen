import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AIProvider, useAI } from './context/AIContext';
import { NotesProvider, useNotes } from './context/NotesContext';
import { AISettingsModal } from './components/AISettingsModal';
import { Button } from './components/ui/Button';
import { LLMService } from './services/llmService';
import { htmlToMarkdown, htmlToText } from './services/converter';
import { parseMarkdown } from './services/markdown';
import { SlashCommandMenu, SlashCommand } from './components/SlashCommandMenu';
import { VoiceModeModal } from './components/VoiceModeModal';
import { ChatMessage } from './types';
import { 
  Settings, Sparkles, Plus, FileText, ChevronRight, MoreHorizontal, Zap,
  Bold, Italic, List, PenLine, Trash2, Edit2, Image as ImageIcon, 
  Table as TableIcon, Download, Upload, File, FileCode, Printer, ChevronDown, Mic,
  Heading1, Heading2, Heading3, ListOrdered, CheckSquare, Quote, Code, Minus, Video, Type,
  Eye, EyeOff, Columns, GripVertical
} from 'lucide-react';

// Helper to calculate caret coordinates in a textarea
const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);
  
  // Copy styles to mirror div
  Array.from(style).forEach(prop => {
    div.style.setProperty(prop, style.getPropertyValue(prop));
  });

  div.style.position = 'absolute';
  div.style.top = '0';
  div.style.left = '0';
  div.style.visibility = 'hidden';
  div.style.height = 'auto';
  div.style.width = style.width; 
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';

  // Content up to caret
  div.textContent = element.value.substring(0, position);
  
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.'; // Ensure span has height
  div.appendChild(span);
  
  document.body.appendChild(div);
  
  const spanOffsetLeft = span.offsetLeft;
  const spanOffsetTop = span.offsetTop;
  
  const rect = element.getBoundingClientRect();
  
  document.body.removeChild(div);

  return {
    left: rect.left + spanOffsetLeft - element.scrollLeft,
    top: rect.top + spanOffsetTop - element.scrollTop
  };
};

type ViewMode = 'edit' | 'split' | 'preview';

const EditorWorkspace = () => {
  const { setSettingsOpen, config, connectionStatus } = useAI();
  const { notes, activeNote, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote } = useNotes();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  
  // View Mode & Resizing State
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitPos, setSplitPos] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);

  // Slash Command State
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const headerTitleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- HTML/MD State Sync ---
  // We treat activeNote.content as the Source of Truth.
  const [localContent, setLocalContent] = useState("");

  useEffect(() => {
    if (activeNote) {
        // Simple heuristic: If it starts with a tag, it might be legacy HTML
        const isLikelyHtml = /^\s*<[^>]+>/i.test(activeNote.content);
        if (isLikelyHtml) {
            setLocalContent(htmlToMarkdown(activeNote.content));
        } else {
            setLocalContent(activeNote.content);
        }
    } else {
        setLocalContent("");
    }
  }, [activeNoteId]);

  const handleContentChange = (val: string) => {
      setLocalContent(val);
      if (activeNote) {
          updateNote(activeNote.id, { content: val });
      }
  };

  // --- Resizing Logic ---
  const startResizing = () => {
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    let percent = (x / w) * 100;
    
    // Clamp between 20% and 80%
    if (percent < 20) percent = 20;
    if (percent > 80) percent = 80;
    
    setSplitPos(percent);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Helper to insert text at cursor
  const insertTextAtCursor = (text: string, cursorOffset = 0) => {
      if (!textareaRef.current) return;
      
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const currentVal = textareaRef.current.value;
      
      const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
      
      handleContentChange(newVal);
      
      // Reset cursor position
      setTimeout(() => {
          if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(start + text.length + cursorOffset, start + text.length + cursorOffset);
          }
      }, 0);
  };

  const insertVideoBlock = () => {
      const url = prompt("Enter Video URL (YouTube or MP4):");
      if (!url) return;

      // Simple robust detection
      let videoId = '';
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (url.includes('youtu.be')) {
            videoId = url.split('/').pop() || '';
        } else if (url.includes('v=')) {
            videoId = url.split('v=')[1]?.split('&')[0] || '';
        } else if (url.includes('embed/')) {
            videoId = url.split('embed/')[1]?.split('?')[0] || '';
        }
      }

      let block = '';
      if (videoId) {
          block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-[#333] shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
      } else {
          block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-[#333] shadow-lg"><video src="${url}" controls class="w-full h-full"></video></div>\n`;
      }
      insertTextAtCursor(block);
  };

  const slashCommands: SlashCommand[] = useMemo(() => [
      {
        id: 'h1',
        label: 'Heading 1',
        icon: Heading1,
        description: 'Big section heading',
        action: () => insertTextAtCursor('# ')
      },
      {
        id: 'h2',
        label: 'Heading 2',
        icon: Heading2,
        description: 'Medium section heading',
        action: () => insertTextAtCursor('## ')
      },
      {
        id: 'h3',
        label: 'Heading 3',
        icon: Heading3,
        description: 'Small section heading',
        action: () => insertTextAtCursor('### ')
      },
      {
        id: 'text',
        label: 'Text',
        icon: Type,
        description: 'Plain text paragraph',
        action: () => insertTextAtCursor('')
      },
      {
        id: 'bullet',
        label: 'Bullet List',
        icon: List,
        description: 'Create a bulleted list',
        action: () => insertTextAtCursor('- ')
      },
      {
        id: 'numbered',
        label: 'Numbered List',
        icon: ListOrdered,
        description: 'Create a numbered list',
        action: () => insertTextAtCursor('1. ')
      },
      {
        id: 'todo',
        label: 'To-Do List',
        icon: CheckSquare,
        description: 'Track tasks with a checklist',
        action: () => insertTextAtCursor('- [ ] ')
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
            if(url) insertTextAtCursor(`![Image](${url})`);
        }
      },
      {
        id: 'video',
        label: 'Video / YouTube',
        icon: Video,
        description: 'Embed a video from URL or YouTube',
        action: () => insertVideoBlock()
      },
      {
        id: 'table',
        label: 'Table',
        icon: TableIcon,
        description: 'Insert a table template',
        action: () => insertTextAtCursor('\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n')
      },
      {
        id: 'quote',
        label: 'Quote',
        icon: Quote,
        description: 'Capture a quote',
        action: () => insertTextAtCursor('> ')
      },
      {
        id: 'code',
        label: 'Code Block',
        icon: Code,
        description: 'Capture a code snippet',
        action: () => insertTextAtCursor('\n```\ncode here\n```\n')
      },
      {
        id: 'divider',
        label: 'Divider',
        icon: Minus,
        description: 'Visually divide blocks',
        action: () => insertTextAtCursor('\n---\n')
      }
  ], []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept navigation when slash menu is open
    if (slashMenuOpen) {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault(); 
            // The SlashCommandMenu component handles the logic via window listeners
            return;
        }
    }

    if (e.key === '/') {
        // Calculate position for menu
        if (textareaRef.current) {
            const pos = textareaRef.current.selectionStart;
            const coords = getCaretCoordinates(textareaRef.current, pos);
            
            setSlashMenuPos({
                top: coords.top + 24, // Slight offset below cursor
                left: coords.left
            });
            setSlashMenuOpen(true);
        }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
      // Close menu if user backspaces the slash
      if (slashMenuOpen && e.key === 'Backspace') {
          setSlashMenuOpen(false); 
      }
  };

  const executeSlashCommand = (command: SlashCommand) => {
    if (!textareaRef.current) return;
    
    // We need to remove the '/' that triggered the menu
    const end = textareaRef.current.selectionEnd;
    const start = textareaRef.current.selectionStart;
    const val = textareaRef.current.value;

    // Remove the slash (at start-1)
    const beforeSlash = val.substring(0, start - 1);
    const afterSlash = val.substring(end);
    
    const newVal = beforeSlash + afterSlash;
    handleContentChange(newVal);

    // Focus and execute
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(start - 1, start - 1);
            command.action();
        }
    }, 0);
    
    setSlashMenuOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
              const base64 = e.target?.result as string;
              // Wrap image in a reasoning-model style collapsible block
              const imageBlock = `
<details class="group bg-[#1A1A1A] border border-[#333] rounded-lg p-3 my-4 open:bg-[#111] transition-all">
<summary class="cursor-pointer text-sm text-gray-400 group-hover:text-white font-medium select-none flex items-center gap-2">
<span>🖼️</span> <span>Uploaded Image (${file.name})</span>
</summary>
<div class="mt-3 pt-3 border-t border-[#333]">

![${file.name}](${base64})

</div>
</details>
`;
              insertTextAtCursor(imageBlock);
          };
          reader.readAsDataURL(file);
      }
  };

  // --- AI Actions ---
  const handleAIAction = async (promptPrefix: string) => {
    if (!localContent) return;
    
    setIsGenerating(true);
    setGeneratedText(""); 

    const service = new LLMService(config);
    const fullPrompt = `${promptPrefix} for the following text. Output in Markdown format:\n\n${localContent}`;
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

  const handleAIInsert = () => {
      insertTextAtCursor(`\n\n${generatedText}\n\n`);
      setGeneratedText("");
  };

  const handleExport = (type: 'md' | 'txt' | 'pdf') => {
      if (!activeNote) return;
      setIsExportMenuOpen(false);

      if (type === 'pdf') {
          window.print();
          return;
      }

      const content = localContent;
      const mime = type === 'md' ? 'text/markdown' : 'text/plain';
      const ext = type;

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
    <div className="flex min-h-screen bg-[#0F0F0F] text-gray-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 bg-[#111111] border-r border-[#222] flex flex-col min-w-[250px] shrink-0 print:hidden z-20">
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
      <div className="flex-1 flex flex-col min-w-0 relative h-screen">
        
        {/* Header */}
        <header className="h-14 border-b border-[#222] bg-[#111111] flex items-center justify-between px-6 shrink-0 print:hidden z-20">
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
              
              {/* View Mode Toggle */}
              <div className="flex bg-[#1A1A1A] rounded-lg p-1 border border-[#333]">
                <button 
                    onClick={() => setViewMode('edit')} 
                    title="Editor Only"
                    className={`p-1.5 rounded transition-all ${viewMode === 'edit' ? 'bg-[#333] text-emerald-400 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <FileText className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setViewMode('split')} 
                    title="Split View"
                    className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-[#333] text-emerald-400 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <Columns className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setViewMode('preview')} 
                    title="Preview Only"
                    className={`p-1.5 rounded transition-all ${viewMode === 'preview' ? 'bg-[#333] text-emerald-400 shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <Eye className="w-4 h-4" />
                </button>
              </div>

              <div className="h-4 w-px bg-[#333] mx-1" />

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
                     <div className="absolute right-0 top-full mt-2 w-48 bg-[#222] border border-[#333] rounded-lg shadow-xl z-30 py-1">
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
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#222] border border-[#333] rounded-lg shadow-xl z-30 py-1">
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
        <div className="h-12 border-b border-[#222] bg-[#161616] flex items-center px-6 gap-2 overflow-x-auto no-scrollbar shrink-0 print:hidden z-10">
            <div className="flex items-center gap-1 pr-4 border-r border-[#333]">
                <button onClick={() => insertTextAtCursor('**bold text**')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('*italic text*')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('- ')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Bullet List"><List className="w-4 h-4" /></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded" title="Insert Image"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('## ')} className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded font-serif font-bold text-xs" title="Heading">H2</button>
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

        {/* Split Editor Area */}
        <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
           {activeNote ? (
             <>
               {/* Left: Markdown Input */}
               <div 
                   style={{ 
                       width: viewMode === 'split' ? `${splitPos}%` : viewMode === 'edit' ? '100%' : '0%',
                       display: viewMode === 'preview' ? 'none' : 'flex'
                   }}
                   className="flex flex-col border-r border-[#222] bg-[#111] transition-none"
               >
                 <textarea 
                    ref={textareaRef}
                    className="flex-1 w-full bg-transparent text-gray-300 font-mono text-sm p-6 resize-none focus:outline-none custom-scrollbar leading-relaxed break-words whitespace-pre-wrap"
                    placeholder="# Start typing your note here... (Type / for commands)"
                    value={localContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    spellCheck={false}
                 />
               </div>

               {/* Resizer Handle */}
               {viewMode === 'split' && (
                  <div 
                    className="w-2 -ml-1 h-full cursor-col-resize z-50 flex items-center justify-center group hover:bg-emerald-500/10 transition-colors"
                    onMouseDown={startResizing}
                  >
                    <div className="w-0.5 h-8 bg-[#333] group-hover:bg-emerald-500 rounded-full transition-colors" />
                  </div>
               )}

               {/* Right: Preview */}
               <div 
                   style={{ 
                       width: viewMode === 'split' ? `${100 - splitPos}%` : viewMode === 'preview' ? '100%' : '0%',
                       display: viewMode === 'edit' ? 'none' : 'block',
                       pointerEvents: isDragging ? 'none' : 'auto' // Prevent iframe interference while dragging
                   }}
                   className="h-full bg-[#0F0F0F] overflow-y-auto custom-scrollbar bg-dotted-pattern"
               >
                    <div 
                        className="prose prose-invert max-w-none p-8
                        prose-headings:font-bold prose-headings:text-emerald-500 
                        prose-p:text-gray-300 prose-p:leading-relaxed
                        prose-a:text-blue-400 prose-img:rounded-xl prose-img:shadow-lg
                        prose-blockquote:border-l-emerald-500 prose-blockquote:bg-[#1A1A1A]
                        prose-code:text-emerald-300 prose-code:bg-[#222] prose-code:rounded prose-code:px-1"
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(localContent) }}
                    />
               </div>
             </>
           ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-500">
                   Select a note or create a new one
               </div>
           )}

           {/* Hidden File Input */}
           <input 
                type="file" 
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
           />

           {/* AI Output Overlay */}
           { (isGenerating || generatedText) && (
              <div className="absolute bottom-6 right-6 w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="p-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-blue-500/20 backdrop-blur-md border border-[#333] shadow-2xl">
                    <div className="bg-[#161616] rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3 h-3" /> AI Analysis
                        </div>
                        <div className="max-h-60 overflow-y-auto text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-3 custom-scrollbar">
                            {generatedText}
                            {isGenerating && <span className="inline-block w-1 h-3 bg-emerald-500 ml-1 animate-pulse"/>}
                        </div>
                        <div className="flex gap-2 justify-end pt-2 border-t border-[#333]">
                            <Button size="sm" variant="ghost" onClick={() => setGeneratedText("")} disabled={isGenerating} className="h-7 text-xs">Discard</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 h-7 text-xs" onClick={handleAIInsert} disabled={isGenerating}>Insert</Button>
                        </div>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>

      <div className="print:hidden">
        <AISettingsModal />
        <VoiceModeModal 
            isOpen={isVoiceModeOpen} 
            onClose={() => setIsVoiceModeOpen(false)} 
            onInsert={(text) => insertTextAtCursor(text)}
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
    <AIProvider>
      <NotesProvider>
        <EditorWorkspace />
      </NotesProvider>
    </AIProvider>
  );
};

export default App;