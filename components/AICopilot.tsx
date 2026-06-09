import React, { useState, useRef, useEffect } from 'react';
import { useNotes } from '../context/NotesContext';
import { useAI } from '../context/AIContext';
import { LLMService } from '../services/llmService';
import { ChatMessage, Note } from '../types';
import { Button } from './ui/Button';
import { parseMarkdown } from '../services/markdown';
import { 
  Sparkles, Send, Trash2, X, RotateCcw, FileText, 
  Plus, CheckCircle2, ChevronRight, MessageSquare, Zap
} from 'lucide-react';

interface AICopilotProps {
  onClose: () => void;
}

export const AICopilot: React.FC<AICopilotProps> = ({ onClose }) => {
  const { notes, activeNote, activeNoteId, setActiveNoteId, updateNote, deleteNote, importNote } = useNotes();
  const { config, connectionStatus } = useAI();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('lumen-copilot-messages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestResponseChunk, setLatestResponseChunk] = useState('');
  const [executedActions, setExecutedActions] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist messages to local storage
  useEffect(() => {
    localStorage.setItem('lumen-copilot-messages', JSON.stringify(messages));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, latestResponseChunk]);

  // Clean XML tags from displayed text so user gets clean Markdown
  const cleanResponseText = (text: string): string => {
    return text
      .replace(/<workspace_\w+\b[^>]*>([\s\S]*?)<\/workspace_\w+>/gi, '')
      .trim();
  };

  // Helper system prompt generator
  const getSystemPrompt = () => {
    const notesContextStr = notes.map((note) => {
      const title = note.title || "Untitled Note";
      const excerpt = note.content ? (note.content.substring(0, 500) + (note.content.length > 500 ? '...' : '')) : "[Empty]";
      const tagsStr = note.tags && note.tags.length > 0 ? `Tags: ${note.tags.join(', ')}` : "Tags: None";
      return `[ID: ${note.id}]\nTitle: ${title}\n${tagsStr}\nContent:\n${excerpt}\n---`;
    }).join('\n\n');

    return `You are "Lumen Copilot", an elite AI-native workspace agent.
You have real-time access to all user's notes and files.

Current Active Note:
${activeNote ? `ID: ${activeNote.id}\nTitle: ${activeNote.title || "Untitled Note"}\nTags: ${activeNote.tags ? activeNote.tags.join(', ') : "None"}\nContent:\n${activeNote.content}` : "None Selected"}

All Workspace Notes (${notes.length} documents):
=== WORKSPACE NOTES START ===
${notesContextStr}
=== WORKSPACE NOTES END ===

Capabilities:
You can answer questions, search/analyze notes, write or summarize content, and execute actions directly in the user's workspace using XML action tags.

To make changes to the workspace, append or insert these XML tags anywhere inside your reply. Write them exactly as shown below:

1. Create a new markdown note:
   <workspace_create_note title="The Title Of Note" tags="tag1, tag2">The full content of the note in markdown</workspace_create_note>
   Note: tags is optional (comma-separated strings).

2. Update/edit an existing note (rewriting its full content):
   <workspace_update_note id="note-id" title="Note Title">The complete updated content including any additions or changes</workspace_update_note>
   Note: ALWAYS provide the complete note text, not just diffs, to avoid deleting their text. Keep the title parameter consistent unless you explicitly want to rename it.

3. Navigate the user to a note:
   <workspace_select_note id="note-id"></workspace_select_note>

4. Delete a note:
   <workspace_delete_note id="note-id"></workspace_delete_note>

5. Rename a note:
   <workspace_rename_note id="note-id" title="New Title"></workspace_rename_note>
   Note: If id is omitted or "active", it renames the current active note.

6. Modify specific sections of a note (surgical replacement without full rewrite):
   <workspace_replace_section id="note-id" target="exact text block to replace">new replacement text block</workspace_replace_section>
   Note: Use this to change, edit, or append to specific sections of notes without having to rewrite the entire Note. If id is omitted or "active", it applies to the currently active note.

7. Add tags to a note (comma separated):
   <workspace_add_tags id="note-id" tags="tag1, tag2"></workspace_add_tags>

8. Remove tags from a note:
   <workspace_remove_tags id="note-id" tags="tag1, tag2"></workspace_remove_tags>

System Protocol Guidelines:
- If a user asks to "create a note about...", construct a high-quality note and return <workspace_create_note title="Notes Title" tags="tag1, tag2">Markdown content</workspace_create_note>.
- If a user says "rename this note to...", execute a workspace_rename_note with the new title.
- If a user says "add tags 'draft' and 'ideas'", return <workspace_add_tags tags="draft, ideas"></workspace_add_tags>
- If a user asks to change or edit a specific sentence or paragraph in their note, ALWAYS prefer using <workspace_replace_section id="active" target="sentence to parse">improved sentence</workspace_replace_section> to keep updates surgical, precise, and instantaneous.
- If a user queries workspace content, search the workspace notes above and answer elegantly. Use select_note to guide them to relevant documents.
- Always be professional, helpful, concise, and clear.`;
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsGenerating(true);
    setLatestResponseChunk('');
    setExecutedActions([]);

    const service = new LLMService(config);
    const systemPromptMessage: ChatMessage = { role: 'system', content: getSystemPrompt() };
    const apiPayload = [systemPromptMessage, ...updatedMessages];

    try {
      const generator = service.streamResponse(apiPayload);
      let fullResponse = '';
      
      for await (const chunk of generator) {
        fullResponse += chunk;
        setLatestResponseChunk(fullResponse);
      }

      // Completed generation! Save message
      const assistantMessage: ChatMessage = { role: 'assistant', content: fullResponse };
      setMessages(prev => [...prev, assistantMessage]);
      setLatestResponseChunk('');

      // Parse and execute workspace actions
      runWorkspaceActions(fullResponse);

    } catch (err: any) {
      console.error(err);
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: `Error: Could not reach AI Service. Please check your connection Settings: ${err.message || err}` 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const runWorkspaceActions = (text: string) => {
    const actions: string[] = [];

    // Extract blocks matching <tagName attribute="val">Content</tagName>
    const extractBlocks = (srcText: string, tagName: string) => {
      const regex = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\/${tagName}>`, 'gi');
      const matches = [];
      let match;
      while ((match = regex.exec(srcText)) !== null) {
        matches.push({
          attributesStr: match[1],
          content: match[2]
        });
      }
      return matches;
    };

    const getAttribute = (attrStr: string, attrName: string): string => {
      const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
      const match = regex.exec(attrStr);
      return match ? match[1].trim() : '';
    };

    // 1. Create note
    extractBlocks(text, 'workspace_create_note').forEach(block => {
      const title = getAttribute(block.attributesStr, 'title') || 'Untitled Note';
      const tagsAttr = getAttribute(block.attributesStr, 'tags');
      const parsedTags = tagsAttr ? tagsAttr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
      importNote(title.trim(), block.content.trim(), parsedTags);
      actions.push(`✨ Created new note: "${title}"`);
    });

    // 2. Update note
    extractBlocks(text, 'workspace_update_note').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      const title = getAttribute(block.attributesStr, 'title');
      const content = block.content;
      
      if (id) {
        const updates: Partial<Note> = { content: content.trim() };
        if (title) updates.title = title.trim();
        updateNote(id, updates);
        const matchingNote = notes.find(n => n.id === id);
        actions.push(`📝 Updated content: "${title || (matchingNote ? matchingNote.title : 'Untitled')}"`);
      }
    });

    // 3. Select note
    extractBlocks(text, 'workspace_select_note').forEach(block => {
      const id = getAttribute(block.attributesStr, 'id');
      if (id) {
        const matchingNote = notes.find(n => n.id === id);
        if (matchingNote) {
          setActiveNoteId(id);
          actions.push(`🔍 Navigated to: "${matchingNote.title || 'Untitled note'}"`);
        }
      }
    });

    // 4. Delete note
    extractBlocks(text, 'workspace_delete_note').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      if (id) {
        const matchingNote = notes.find(n => n.id === id);
        const title = matchingNote ? matchingNote.title : "unknown";
        deleteNote(id);
        actions.push(`🗑️ Deleted note: "${title || 'Untitled note'}"`);
      }
    });

    // 5. Rename note
    extractBlocks(text, 'workspace_rename_note').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      const title = getAttribute(block.attributesStr, 'title');
      if (id && title) {
        updateNote(id, { title: title.trim() });
        actions.push(`✏️ Renamed note to: "${title.trim()}"`);
      }
    });

    // 6. Replace specific section
    extractBlocks(text, 'workspace_replace_section').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      const target = getAttribute(block.attributesStr, 'target');
      const replacement = block.content;
      
      if (id && target) {
        const note = notes.find(n => n.id === id);
        if (note) {
          const index = note.content.indexOf(target);
          if (index !== -1) {
            const updatedContent = note.content.replace(target, replacement);
            updateNote(id, { content: updatedContent });
            actions.push(`⚡ Modified section in "${note.title || 'Untitled'}"`);
          } else {
            // If target has slightly different newlines/whitespace, let's try normalized replacement
            const normTarget = target.replace(/\s+/g, ' ').trim();
            const normContent = note.content.replace(/\s+/g, ' ');
            const nIndex = normContent.indexOf(normTarget);
            
            if (nIndex !== -1) {
              // Target is present but has whitespace variances. Let's do a regex replacement.
              const escapedTarget = target.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
              const reg = new RegExp(escapedTarget, 'g');
              const updatedContent = note.content.replace(reg, replacement);
              updateNote(id, { content: updatedContent });
              actions.push(`⚡ Modified section (flexible match) in "${note.title || 'Untitled'}"`);
            } else {
              actions.push(`⚠️ Section modification failed: Target text not found in note`);
            }
          }
        }
      }
    });

    // 7. Add tags
    extractBlocks(text, 'workspace_add_tags').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      const tagsAttr = getAttribute(block.attributesStr, 'tags');
      
      if (id && tagsAttr) {
        const note = notes.find(n => n.id === id);
        if (note) {
          const existingTags = note.tags || [];
          const newTags = tagsAttr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          const combined = Array.from(new Set([...existingTags, ...newTags]));
          updateNote(id, { tags: combined });
          actions.push(`🏷️ Added tags [${newTags.join(', ')}] to "${note.title || 'Untitled'}"`);
        }
      }
    });

    // 8. Remove tags
    extractBlocks(text, 'workspace_remove_tags').forEach(block => {
      let id = getAttribute(block.attributesStr, 'id');
      if (!id || id === 'active') id = activeNoteId || '';
      const tagsAttr = getAttribute(block.attributesStr, 'tags');
      
      if (id && tagsAttr) {
        const note = notes.find(n => n.id === id);
        if (note) {
          const existingTags = note.tags || [];
          const tagsToRemove = tagsAttr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          const reduced = existingTags.filter(t => !tagsToRemove.includes(t));
          updateNote(id, { tags: reduced });
          actions.push(`🏷️ Removed tags [${tagsToRemove.join(', ')}] from "${note.title || 'Untitled'}"`);
        }
      }
    });

    if (actions.length > 0) {
      setExecutedActions(actions);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setExecutedActions([]);
    localStorage.removeItem('lumen-copilot-messages');
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  return (
    <div id="ai-workspace-chat" className="w-96 border-l border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#111111] flex flex-col h-full shrink-0 z-30 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 dark:border-[#222] px-4 flex items-center justify-between shrink-0 bg-white dark:bg-[#0c0c0c]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500 fill-emerald-500/10" />
          <div>
            <h2 className="font-semibold text-sm text-gray-900 dark:text-white">Workspace Copilot</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{config.provider}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} title="Clear Conversation" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} title="Close Chat" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col justify-center items-center text-center p-6 text-gray-400 dark:text-gray-500">
            <div className="p-3 bg-emerald-500/10 rounded-2xl mb-4 animate-bounce">
              <Sparkles className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-gray-800 dark:text-white font-medium mb-1">Welcome to Lumen Workspace Copilot</h3>
            <p className="text-xs text-gray-500 max-w-xs mb-6">
              Ask questions about your files, create notes, rename sections, search documents, or request complex actions using natural language.
            </p>
            <div className="w-full text-left space-y-2 max-w-xs">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block px-1">Try these commands</span>
              {[
                "Search and synthesize notes about React",
                "Create a new note with a project summary",
                "Summarize my currently active note",
                "Add a list of to-do items to my active note"
              ].map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(s)}
                  className="w-full text-left text-xs bg-white dark:bg-[#1A1A1A] hover:bg-gray-100 dark:hover:bg-[#222] border border-gray-200 dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{s}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-gray-400 font-medium mb-1 px-1">
              {msg.role === 'user' ? 'You' : 'Copilot'}
            </span>
            <div className={`rounded-xl p-3 max-w-[90%] text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-emerald-600 text-white' 
                : 'bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-[#2a2a2a] text-gray-800 dark:text-gray-200 shadow-sm'
            }`}>
              <div 
                className={`prose prose-sm ${msg.role === 'user' ? 'text-white' : 'dark:prose-invert'} break-words custom-scrollbar`}
                dangerouslySetInnerHTML={{ __html: msg.role === 'user' ? msg.content : parseMarkdown(cleanResponseText(msg.content)) }}
              />
            </div>
          </div>
        ))}

        {latestResponseChunk && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-gray-400 font-medium mb-1 px-1">Copilot</span>
            <div className="rounded-xl p-3 max-w-[95%] text-sm leading-relaxed bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-[#2a2a2a] text-gray-800 dark:text-gray-200 shadow-sm">
              <div 
                className="prose prose-sm dark:prose-invert break-words custom-scrollbar"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(cleanResponseText(latestResponseChunk)) }}
              />
              <span className="inline-block w-1 h-3 bg-emerald-500 ml-1 animate-pulse" />
            </div>
          </div>
        )}

        {/* Display executed workspace actions */}
        {executedActions.length > 0 && (
          <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-200">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Workspace Actions Executed
            </span>
            {executedActions.map((action, index) => (
              <span key={index} className="text-xs text-gray-700 dark:text-gray-300 font-medium flex items-center gap-1.5 ml-0.5">
                <ChevronRight className="w-3 h-3 text-emerald-400" /> {action}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-[#222] bg-white dark:bg-[#0c0c0c] shrink-0">
        <div className="relative flex items-center bg-gray-50 dark:bg-[#181818] border border-gray-200 dark:border-[#2a2a2a] rounded-lg focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-all pr-1 pl-3">
          <input
            className="flex-1 py-2.5 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder={isGenerating ? "Streaming copilot action..." : "Ask Copilot to research, edit, or create..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isGenerating}
          />
          <Button 
            type="submit" 
            disabled={!input.trim() || isGenerating}
            size="sm"
            className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 rounded-md shrink-0 flex items-center justify-center m-1"
          >
            <Send className="w-4 h-4 text-white" />
          </Button>
        </div>
      </form>
    </div>
  );
};
