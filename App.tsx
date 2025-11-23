import React, { useState, useRef, useEffect } from 'react';
import { AIProvider, useAI } from './context/AIContext';
import { NotesProvider, useNotes } from './context/NotesContext';
import { useTheme } from './context/ThemeContext';
import { AISettingsModal } from './components/AISettingsModal';
import { Button } from './components/ui/Button';
import { LLMService } from './services/llmService';
import { htmlToMarkdown } from './services/converter';
import { parseMarkdown } from './services/markdown';
import { SlashCommandMenu, type SlashCommand } from './components/SlashCommandMenu';
import { VoiceModeModal } from './components/VoiceModeModal';
import { ChatMessage } from './types';
import { 
  Settings, Sparkles, Plus, FileText, ChevronRight, MoreHorizontal, Zap,
  Bold, Italic, List, PenLine, Trash2, Edit2, Image as ImageIcon, 
  Table as TableIcon, Download, Upload, File, FileCode, Printer, ChevronDown, Mic,
  Heading1, Heading2, Heading3, ListOrdered, CheckSquare, Quote, Code, Minus, Video, Type,
  Eye, Columns, Moon, Sun
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
  const { notes, activeNote, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote, importNote } = useNotes();
  const { theme, toggleTheme } = useTheme();
  
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
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renameTriggered = useRef<string | null>(null);

  // Effect to handle focusing the title input for renaming
  useEffect(() => {
    if (renameTriggered.current && activeNoteId === renameTriggered.current) {
        if (headerTitleRef.current) {
            headerTitleRef.current.focus();
            headerTitleRef.current.select();
        }
        renameTriggered.current = null;
    }
  }, [activeNoteId]);


  // --- HTML/MD State Sync & Editor Filtering ---
  // `localContent` is what the user SEES in the editor.
  // It's a filtered version of `activeNote.content` to hide image reference definitions.
  const [localContent, setLocalContent] = useState("");
  const imageRefRegex = /^\s*\[img_.*?\]: data:image\/.*$/gm;


  useEffect(() => {
    if (activeNote) {
        let contentToDisplay = activeNote.content;
        const isLikelyHtml = /^\s*<[^>]+>/i.test(contentToDisplay);
        if (isLikelyHtml) {
            contentToDisplay = htmlToMarkdown(contentToDisplay);
        }
        
        // Filter out image reference definitions for a cleaner editor view.
        const contentWithoutImageRefs = contentToDisplay.replace(imageRefRegex, '').trim();
        
        setLocalContent(contentWithoutImageRefs);
    } else {
        setLocalContent("");
    }
  }, [activeNoteId, activeNote]);

  const handleContentChange = (val: string) => {
      setLocalContent(val); // Update local state for immediate feedback
      if (activeNote) {
          // Re-attach the image reference definitions that are visually hidden.
          const imageRefs = activeNote.content.match(imageRefRegex) || [];
          const fullContent = val.trim() + (imageRefs.length > 0 ? '\n\n' + imageRefs.join('\n') : '');
          updateNote(activeNote.id, { content: fullContent.trim() });
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

  // --- Note Actions ---
  const handleRenameClick = (noteId: string) => {
    renameTriggered.current = noteId;
    setActiveNoteId(noteId);
  };

  const handleDeleteClick = (noteId: string) => {
    if (window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
        deleteNote(noteId);
    }
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
          block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-gray-200 dark:border-[#333] shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
      } else {
          block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-gray-200 dark:border-[#333] shadow-lg"><video src="${url}" controls class="w-full h-full"></video></div>\n`;
      }
      insertTextAtCursor(block);
  };

  const slashCommands: SlashCommand[] = [
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
        action: () => imageFileInputRef.current?.click()
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
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept navigation when slash menu is open
    if (slashMenuOpen) {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
            e.preventDefault(); 
            // The SlashCommandMenu component handles the logic via window listeners
            return;
        }
        // If any other character is typed, close the menu.
        // This prevents the menu from getting "stuck" and blocking the Enter key.
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
            setSlashMenuOpen(false);
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
              const cleanName = file.name.replace(/[\[\]\(\)\s]/g, '_'); 
              const refId = `img_${Date.now()}`;
              
              const imageTag = `![${cleanName}][${refId}]`;
              const newRefDef = `[${refId}]: ${base64}`;

              if (!textareaRef.current || !activeNote) return;
              
              const start = textareaRef.current.selectionStart;
              const end = textareaRef.current.selectionEnd;
              const currentEditorVal = textareaRef.current.value;
              
              const newEditorVal = currentEditorVal.substring(0, start) + imageTag + currentEditorVal.substring(end);
              
              const existingImageRefs = activeNote.content.match(imageRefRegex) || [];
              const allRefs = [...existingImageRefs, newRefDef];
              const newFullContent = newEditorVal.trim() + '\n\n' + allRefs.join('\n');
              
              updateNote(activeNote.id, { content: newFullContent.trim() });
              
              setTimeout(() => {
                  if (textareaRef.current) {
                      textareaRef.current.focus();
                      const newCursorPos = start + imageTag.length;
                      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                  }
              }, 0);
          };
          reader.readAsDataURL(file);
      }
      e.target.value = '';
  };

  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target?.result as string;
        
        const generateTitle = (filename: string) => {
            const base = filename.replace(/\.(md|markdown)$/i, '');
            return base.replace(/[_-]/g, ' ')
                       .split(' ')
                       .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                       .join(' ');
        };
        const title = generateTitle(file.name);
        
        importNote(title, content);
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
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

      // For md/txt, use the full, un-filtered content
      const content = activeNote.content;
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
    <div className="flex min-h-screen bg-white dark:bg-[#0F0F0F] text-gray-800 dark:text-gray-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 dark:bg-[#111111] border-r border-gray-200 dark:border-[#222] flex flex-col min-w-[250px] shrink-0 print:hidden z-20">
        <div className="p-4 border-b border-gray-200 dark:border-[#222]">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl tracking-tight">
            <Zap className="w-5 h-5 fill-current" />
            <span>Lumen</span>
          </div>
        </div>
        
        <div className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
           <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Notes</div>
           {notes.map(note => (
               <div key={note.id} className="relative group flex items-center">
                    <button 
                        onClick={() => setActiveNoteId(note.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                            activeNoteId === note.id 
                            ? 'bg-gray-200 dark:bg-[#1C1C1C] text-gray-900 dark:text-white border border-gray-300 dark:border-[#333]' 
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        <FileText className={`w-4 h-4 shrink-0 ${activeNoteId === note.id ? 'text-emerald-500' : 'text-gray-500 dark:text-gray-500'}`} />
                        <span className="truncate flex-1">{note.title || "Untitled Note"}</span>
                    </button>
                    <div className="absolute right-2 top-0 bottom-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button 
                            onClick={() => handleRenameClick(note.id)}
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#2A2A2A] rounded"
                            title="Rename note"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => handleDeleteClick(note.id)}
                            className="p-1 text-red-500/70 hover:text-red-600 dark:hover:text-red-500 hover:bg-red-500/10 rounded"
                            title="Delete note"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
               </div>
           ))}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-[#222] mt-auto space-y-2">
           <Button 
             onClick={addNote}
             className="w-full bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
           >
              <Plus className="w-4 h-4 mr-2" /> New Note
           </Button>
           <div className="flex items-center gap-2">
            <Button 
                variant="secondary"
                onClick={() => mdFileInputRef.current?.click()}
                className="w-full"
            >
                <Upload className="w-4 h-4 mr-2" /> Import .md
            </Button>
            <Button variant="secondary" onClick={toggleTheme} className="px-2.5">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative h-screen">
        
        {/* Header */}
        <header className="h-14 border-b border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#111111] flex items-center justify-between px-6 shrink-0 print:hidden z-20">
           <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 w-full mr-4">
              <span className="hidden sm:inline shrink-0">My Workspace</span>
              <ChevronRight className="w-4 h-4 hidden sm:inline shrink-0" />
              <input 
                ref={headerTitleRef}
                className="bg-transparent text-gray-900 dark:text-white font-medium focus:outline-none focus:border-b border-gray-400 dark:border-gray-600 min-w-[100px] w-full max-w-md truncate"
                value={activeNote?.title || ""}
                onChange={(e) => activeNote && updateNote(activeNote.id, { title: e.target.value })}
                placeholder="Untitled Note"
              />
           </div>

           <div className="flex items-center gap-3 shrink-0">
              
              {/* View Mode Toggle */}
              <div className="flex bg-gray-200 dark:bg-[#1A1A1A] rounded-lg p-1 border border-gray-300 dark:border-[#333]">
                <button 
                    onClick={() => setViewMode('edit')} 
                    title="Editor Only"
                    className={`p-1.5 rounded transition-all ${viewMode === 'edit' ? 'bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                    <FileText className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setViewMode('split')} 
                    title="Split View"
                    className={`p-1.5 rounded transition-all ${viewMode === 'split' ? 'bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                    <Columns className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setViewMode('preview')} 
                    title="Preview Only"
                    className={`p-1.5 rounded transition-all ${viewMode === 'preview' ? 'bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                    <Eye className="w-4 h-4" />
                </button>
              </div>

              <div className="h-4 w-px bg-gray-300 dark:bg-[#333] mx-1" />

              <div className="relative">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white flex items-center gap-1"
                >
                    <Download className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                </Button>
                {isExportMenuOpen && (
                     <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#222] border border-gray-200 dark:border-[#333] rounded-lg shadow-xl z-30 py-1">
                        <button onClick={() => handleExport('md')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white">
                            <FileCode className="w-4 h-4" /> Markdown (.md)
                        </button>
                        <button onClick={() => handleExport('txt')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white">
                            <File className="w-4 h-4" /> Plain Text (.txt)
                        </button>
                        <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white">
                            <Printer className="w-4 h-4" /> PDF (Print)
                        </button>
                     </div>
                )}
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-[#1A1A1A] rounded-full border border-gray-200 dark:border-[#333]">
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${getStatusColor()}`} title={connectionStatus} />
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium uppercase tracking-wider">{config.provider}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                 <Settings className="w-4 h-4" />
              </Button>
              
              <div className="relative">
                <Button variant="ghost" size="sm" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#222] border border-gray-200 dark:border-[#333] rounded-lg shadow-xl z-30 py-1">
                        <button 
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white"
                            onClick={() => {
                                headerTitleRef.current?.focus();
                                headerTitleRef.current?.select();
                                setIsMenuOpen(false);
                            }}
                        >
                            <Edit2 className="w-4 h-4" /> Rename Note
                        </button>
                        <button 
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-[#333] border-t border-gray-200 dark:border-[#333]"
                            onClick={() => {
                                if (activeNote) handleDeleteClick(activeNote.id);
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
        <div className="h-12 border-b border-gray-200 dark:border-[#222] bg-gray-100 dark:bg-[#161616] flex items-center px-6 gap-2 overflow-x-auto no-scrollbar shrink-0 print:hidden z-10">
            <div className="flex items-center gap-1 pr-4 border-r border-gray-300 dark:border-[#333]">
                <button onClick={() => insertTextAtCursor('**bold text**')} className="p-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#222] rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('*italic text*')} className="p-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#222] rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('- ')} className="p-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#222] rounded" title="Bullet List"><List className="w-4 h-4" /></button>
                <button onClick={() => imageFileInputRef.current?.click()} className="p-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#222] rounded" title="Insert Image"><ImageIcon className="w-4 h-4" /></button>
                <button onClick={() => insertTextAtCursor('## ')} className="p-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#222] rounded" title="Heading">H2</button>
            </div>
            
            <div className="flex items-center gap-2 pl-2 whitespace-nowrap flex-1">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider ml-2 mr-1">AI Tools</span>
                <Button size="sm" variant="secondary" onClick={() => handleAIAction("Summarize this note")}>
                    <Sparkles className="w-3 h-3 mr-2 text-emerald-500 dark:text-emerald-400" /> Summarize
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleAIAction("Fix grammar and improve tone")}>
                    <PenLine className="w-3 h-3 mr-2 text-blue-500 dark:text-blue-400" /> Improve
                </Button>
            </div>

            <Button 
                onClick={() => setIsVoiceModeOpen(true)} 
                className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-600/20 dark:text-emerald-400 dark:border-emerald-600/50 dark:hover:bg-emerald-600/30"
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
                   className="flex flex-col border-r border-gray-200 dark:border-[#222] bg-white dark:bg-[#111] transition-none"
               >
                 <textarea 
                    ref={textareaRef}
                    className="flex-1 w-full bg-transparent text-gray-700 dark:text-gray-300 font-mono text-sm p-6 resize-none focus:outline-none custom-scrollbar leading-relaxed break-words whitespace-pre-wrap"
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
                    <div className="w-0.5 h-8 bg-gray-300 dark:bg-[#333] group-hover:bg-emerald-500 rounded-full transition-colors" />
                  </div>
               )}

               {/* Right: Preview */}
               <div 
                   style={{ 
                       width: viewMode === 'split' ? `${100 - splitPos}%` : viewMode === 'preview' ? '100%' : '0%',
                       display: viewMode === 'edit' ? 'none' : 'block',
                       pointerEvents: isDragging ? 'none' : 'auto' // Prevent iframe interference while dragging
                   }}
                   className={`h-full overflow-y-auto custom-scrollbar ${theme === 'light' ? 'bg-dotted-pattern-light' : 'bg-dotted-pattern-dark'}`}
               >
                    <div 
                        className={`prose ${theme === 'dark' ? 'dark:prose-invert' : ''} max-w-none p-8`}
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(activeNote.content) }}
                    />
               </div>
             </>
           ) : (
               <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                   Select a note or create a new one
               </div>
           )}

           {/* Hidden File Inputs */}
           <input 
                type="file" 
                ref={imageFileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
           />
           <input 
                type="file" 
                ref={mdFileInputRef}
                className="hidden"
                accept=".md,.markdown,text/markdown"
                onChange={handleImportMarkdown}
           />

           {/* AI Output Overlay */}
           { (isGenerating || generatedText) && (
              <div className="absolute bottom-6 right-6 w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="p-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-blue-500/20 backdrop-blur-md border border-gray-200 dark:border-[#333] shadow-2xl">
                    <div className="bg-white/80 dark:bg-[#161616] rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3 h-3" /> AI Analysis
                        </div>
                        <div className="max-h-60 overflow-y-auto text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-3 custom-scrollbar">
                            {generatedText}
                            {isGenerating && <span className="inline-block w-1 h-3 bg-emerald-500 ml-1 animate-pulse"/>}
                        </div>
                        <div className="flex gap-2 justify-end pt-2 border-t border-gray-200 dark:border-[#333]">
                            <Button size="sm" variant="ghost" onClick={() => setGeneratedText("")} disabled={isGenerating} className="h-7 text-xs">Discard</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 h-7 text-xs" onClick={handleAIInsert} disabled={isGenerating}>Insert</Button>
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