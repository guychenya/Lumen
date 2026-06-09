import React, { useState, useRef, useEffect, useMemo } from "react";
import { AIProvider, useAI } from "./context/AIContext";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { useTheme } from "./context/ThemeContext";
import { AISettingsModal } from "./components/AISettingsModal";
import { Button } from "./components/ui/Button";
import { LLMService } from "./services/llmService";
import { htmlToMarkdown } from "./services/converter";
import { parseMarkdown } from "./services/markdown";
import {
  SlashCommandMenu,
  type SlashCommand,
} from "./components/SlashCommandMenu";
import { VoiceModeModal } from "./components/VoiceModeModal";
import { AICopilot } from "./components/AICopilot";
import { VoiceMemoPlayer } from "./components/VoiceMemoPlayer";
import { ChatMessage } from "./types";
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
  PenLine,
  Trash2,
  Edit2,
  Image as ImageIcon,
  Table as TableIcon,
  Download,
  Upload,
  File,
  FileCode,
  Printer,
  ChevronDown,
  ChevronUp,
  Folder,
  Mic,
  Heading1,
  Heading2,
  Heading3,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Video,
  Type,
  Eye,
  Columns,
  Moon,
  Sun,
  MessageSquare,
  Sidebar,
  PanelRight,
} from "lucide-react";

// Helper to calculate caret coordinates in a textarea
const getCaretCoordinates = (
  element: HTMLTextAreaElement,
  position: number,
) => {
  const div = document.createElement("div");
  const style = window.getComputedStyle(element);

  // Copy styles to mirror div
  Array.from(style).forEach((prop) => {
    div.style.setProperty(prop, style.getPropertyValue(prop));
  });

  div.style.position = "absolute";
  div.style.top = "0";
  div.style.left = "0";
  div.style.visibility = "hidden";
  div.style.height = "auto";
  div.style.width = style.width;
  div.style.whiteSpace = "pre-wrap";
  div.style.overflowWrap = "break-word";

  // Content up to caret
  div.textContent = element.value.substring(0, position);

  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || "."; // Ensure span has height
  div.appendChild(span);

  document.body.appendChild(div);

  const spanOffsetLeft = span.offsetLeft;
  const spanOffsetTop = span.offsetTop;

  const rect = element.getBoundingClientRect();

  document.body.removeChild(div);

  return {
    left: rect.left + spanOffsetLeft - element.scrollLeft,
    top: rect.top + spanOffsetTop - element.scrollTop,
  };
};

type ViewMode = "edit" | "split" | "preview";

const EditorWorkspace = () => {
  const { setSettingsOpen, config, connectionStatus } = useAI();
  const {
    notes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    addNote,
    updateNote,
    deleteNote,
    deleteMultipleNotes,
    importNote,
    importMultipleNotes,
  } = useNotes();
  const { theme, toggleTheme } = useTheme();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("lumen-sidebar-open");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("lumen-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  const [activeSelection, setActiveSelection] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  // View Mode & Resizing State
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [splitPos, setSplitPos] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);

  // Slash Command State
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Custom states for filtering notes & voice memos
  const [sidebarTab, setSidebarTab] = useState<"all" | "notes" | "voice">(
    "all",
  );
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});

  const filteredNotes = useMemo(() => {
    if (sidebarTab === "notes") {
      return notes.filter((n) => !n.type || n.type === "note");
    }
    if (sidebarTab === "voice") {
      return notes.filter((n) => n.type === "voice");
    }
    return notes;
  }, [notes, sidebarTab]);

  const toggleFolder = (folderName: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const groupedNotes = useMemo(() => {
    const folders: Record<string, Note[]> = {};
    const unassigned: Note[] = [];

    filteredNotes.forEach((note) => {
      if (note.folder) {
        if (!folders[note.folder]) {
          folders[note.folder] = [];
        }
        folders[note.folder].push(note);
      } else {
        unassigned.push(note);
      }
    });

    return { folders, unassigned };
  }, [filteredNotes]);

  // Bulk Deletion / Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<
    Record<string, boolean>
  >({});

  const toggleSelectNote = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedNoteIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleBulkDelete = () => {
    const idsToDelete = Object.keys(selectedNoteIds).filter(
      (id) => selectedNoteIds[id],
    );
    if (idsToDelete.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = () => {
    const idsToDelete = Object.keys(selectedNoteIds).filter(
      (id) => selectedNoteIds[id],
    );
    if (idsToDelete.length > 0) {
      deleteMultipleNotes(idsToDelete);
      setSelectedNoteIds({});
      setIsSelectionMode(false);
    }
    setShowBulkDeleteModal(false);
  };

  const hasVisibleNotes = filteredNotes.length > 0;
  const selectedVisibleCount = useMemo(() => {
    return filteredNotes.filter((n) => selectedNoteIds[n.id]).length;
  }, [filteredNotes, selectedNoteIds]);

  const isAllSelected =
    hasVisibleNotes && selectedVisibleCount === filteredNotes.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all visible
      setSelectedNoteIds((prev) => {
        const next = { ...prev };
        filteredNotes.forEach((n) => {
          delete next[n.id];
        });
        return next;
      });
    } else {
      // Select all visible
      setSelectedNoteIds((prev) => {
        const next = { ...prev };
        filteredNotes.forEach((n) => {
          next[n.id] = true;
        });
        return next;
      });
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const headerTitleRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const folderFileInputRef = useRef<HTMLInputElement>(null);
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
  const imageRefRegex = /^\s*\[img_.*?\]: data:image\/.*$/gm;

  // FIX: Removed `localContent` state. The editor's value is now derived directly
  // from `activeNote.content` using `useMemo`. This creates a single source of
  // truth and prevents state synchronization bugs that caused the editor to "get stuck".
  const editorContent = useMemo(() => {
    if (!activeNote) return "";
    let contentToDisplay = activeNote.content;
    const isLikelyHtml = /^\s*<[^>]+>/i.test(contentToDisplay);
    if (isLikelyHtml) {
      contentToDisplay = htmlToMarkdown(contentToDisplay);
    }
    // Filter out image reference definitions for a cleaner editor view.
    let stripped = contentToDisplay.replace(imageRefRegex, "");

    // We only trim at the very end to avoid stripping trailing newlines/spaces
    // when the user is actively typing them. Actually, safest not to trim at all.
    return stripped;
  }, [activeNote]);

  const handleContentChange = (val: string) => {
    if (activeNote) {
      // Re-attach the image reference definitions that are visually hidden.
      const imageRefs = activeNote.content.match(imageRefRegex) || [];
      const fullContent =
        val + (imageRefs.length > 0 ? "\n\n" + imageRefs.join("\n") : "");
      updateNote(activeNote.id, { content: fullContent });
    }
  };

  // --- Resizing Logic ---
  const startResizing = () => {
    setIsDragging(true);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
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
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // --- Note Actions ---
  const handleRenameClick = (noteId: string) => {
    renameTriggered.current = noteId;
    setActiveNoteId(noteId);
  };

  const handleDeleteClick = (noteId: string) => {
    setNoteToDelete(noteId);
  };

  const confirmDelete = () => {
    if (noteToDelete) {
      deleteNote(noteToDelete);
      setNoteToDelete(null);
    }
  };

  // Helper to insert text at cursor
  const insertTextAtCursor = (text: string, cursorOffset = 0) => {
    if (!textareaRef.current) return;

    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const currentVal = textareaRef.current.value;

    const newVal =
      currentVal.substring(0, start) + text + currentVal.substring(end);

    handleContentChange(newVal);

    // Reset cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          start + text.length + cursorOffset,
          start + text.length + cursorOffset,
        );
      }
    }, 0);
  };

  const insertVideoBlock = () => {
    const url = prompt("Enter Video URL (YouTube or MP4):");
    if (!url) return;

    // Simple robust detection
    let videoId = "";
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      if (url.includes("youtu.be")) {
        videoId = url.split("/").pop() || "";
      } else if (url.includes("v=")) {
        videoId = url.split("v=")[1]?.split("&")[0] || "";
      } else if (url.includes("embed/")) {
        videoId = url.split("embed/")[1]?.split("?")[0] || "";
      }
    }

    let block = "";
    if (videoId) {
      block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-gray-200 dark:border-[#333] shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
    } else {
      block = `\n<div class="aspect-video my-6 rounded-xl overflow-hidden border border-gray-200 dark:border-[#333] shadow-lg"><video src="${url}" controls class="w-full h-full"></video></div>\n`;
    }
    insertTextAtCursor(block);
  };

  // FIX: Removed useMemo from slashCommands to prevent a stale closure bug.
  // This ensures that actions always have access to the current editor state.
  const slashCommands: SlashCommand[] = [
    {
      id: "h1",
      label: "Heading 1",
      icon: Heading1,
      description: "Big section heading",
      action: () => insertTextAtCursor("# "),
    },
    {
      id: "h2",
      label: "Heading 2",
      icon: Heading2,
      description: "Medium section heading",
      action: () => insertTextAtCursor("## "),
    },
    {
      id: "h3",
      label: "Heading 3",
      icon: Heading3,
      description: "Small section heading",
      action: () => insertTextAtCursor("### "),
    },
    {
      id: "text",
      label: "Text",
      icon: Type,
      description: "Plain text paragraph",
      action: () => insertTextAtCursor(""),
    },
    {
      id: "bullet",
      label: "Bullet List",
      icon: List,
      description: "Create a bulleted list",
      action: () => insertTextAtCursor("- "),
    },
    {
      id: "numbered",
      label: "Numbered List",
      icon: ListOrdered,
      description: "Create a numbered list",
      action: () => insertTextAtCursor("1. "),
    },
    {
      id: "todo",
      label: "To-Do List",
      icon: CheckSquare,
      description: "Track tasks with a checklist",
      action: () => insertTextAtCursor("- [ ] "),
    },
    {
      id: "image-upload",
      label: "Image Upload",
      icon: Upload,
      description: "Upload an image from your device",
      action: () => imageFileInputRef.current?.click(),
    },
    {
      id: "image-url",
      label: "Image (URL)",
      icon: ImageIcon,
      description: "Embed an image via link",
      action: () => {
        const url = prompt("Enter Image URL:");
        if (url) insertTextAtCursor(`![Image](${url})`);
      },
    },
    {
      id: "video",
      label: "Video / YouTube",
      icon: Video,
      description: "Embed a video from URL or YouTube",
      action: () => insertVideoBlock(),
    },
    {
      id: "table",
      label: "Table",
      icon: TableIcon,
      description: "Insert a table template",
      action: () =>
        insertTextAtCursor(
          "\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n",
        ),
    },
    {
      id: "quote",
      label: "Quote",
      icon: Quote,
      description: "Capture a quote",
      action: () => insertTextAtCursor("> "),
    },
    {
      id: "code",
      label: "Code Block",
      icon: Code,
      description: "Capture a code snippet",
      action: () => insertTextAtCursor("\n```\ncode here\n```\n"),
    },
    {
      id: "divider",
      label: "Divider",
      icon: Minus,
      description: "Visually divide blocks",
      action: () => insertTextAtCursor("\n---\n"),
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept navigation when slash menu is open
    if (slashMenuOpen) {
      if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
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

    // Markdown Tab support
    if (e.key === "Tab") {
      e.preventDefault();
      insertTextAtCursor("  ");
    }

    // Markdown list/quote auto-continuation on Enter
    if (e.key === "Enter" && !slashMenuOpen && textareaRef.current) {
      const val = textareaRef.current.value;
      const start = textareaRef.current.selectionStart;

      const beforeCursor = val.substring(0, start);
      const currentLine = beforeCursor.split("\n").pop() || "";

      // Find leading spaces or list markers (e.g., "- ", "* ", "1. ", "> ")
      const match = currentLine.match(/^(\s*(?:- |\* |\d+\. |> )?)/);

      if (match && match[0]) {
        // Check if current list item is empty. If so, un-indent/remove it instead of continuing
        if (currentLine.trim() === match[0].trim() && match[0].trim() !== "") {
          e.preventDefault();
          const withoutMarker =
            val.substring(0, start - match[0].length) + val.substring(start);
          handleContentChange(withoutMarker);

          // Restore cursor after removal
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(
                start - match[0].length,
                start - match[0].length,
              );
            }
          }, 0);
          return;
        }

        // Otherwise, continue the list marker
        e.preventDefault();
        // Handle basic numeric list incrementation safely
        let nextLinePrefix = match[0];
        const numMatch = match[0].match(/(\s*)(\d+)\. /);
        if (numMatch) {
          const nextNum = parseInt(numMatch[2], 10) + 1;
          nextLinePrefix = `${numMatch[1]}${nextNum}. `;
        }

        insertTextAtCursor("\n" + nextLinePrefix);
      }
    }

    if (e.key === "/") {
      // Calculate position for menu
      if (textareaRef.current) {
        const pos = textareaRef.current.selectionStart;
        const coords = getCaretCoordinates(textareaRef.current, pos);

        setSlashMenuPos({
          top: coords.top + 24, // Slight offset below cursor
          left: coords.left,
        });
        setSlashMenuOpen(true);
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    // Close menu if user backspaces the slash
    if (slashMenuOpen && e.key === "Backspace") {
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
        const cleanName = file.name.replace(/[\[\]\(\)\s]/g, "_");
        const refId = `img_${Date.now()}`;

        const imageTag = `![${cleanName}][${refId}]`;
        const newRefDef = `[${refId}]: ${base64}`;

        if (!textareaRef.current || !activeNote) return;

        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const currentEditorVal = textareaRef.current.value;

        const newEditorVal =
          currentEditorVal.substring(0, start) +
          imageTag +
          currentEditorVal.substring(end);

        const existingImageRefs = activeNote.content.match(imageRefRegex) || [];
        const allRefs = [...existingImageRefs, newRefDef];
        const newFullContent =
          newEditorVal.trim() + "\n\n" + allRefs.join("\n");

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
    e.target.value = "";
  };

  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const mdFiles = fileList.filter(
      (file) => file.name.endsWith(".md") || file.name.endsWith(".markdown"),
    );

    if (mdFiles.length === 0) {
      setImportStatus("No valid Markdown (.md) files found.");
      setTimeout(() => setImportStatus(null), 3000);
      e.target.value = "";
      return;
    }

    const promises = mdFiles.map((file) => {
      return new Promise<{ title: string; content: string; tags?: string[] }>(
        (resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            const generateTitle = (filename: string) => {
              const base = filename.replace(/\.(md|markdown)$/i, "");
              return base
                .replace(/[_-]/g, " ")
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
            };
            const title = generateTitle(file.name);
            resolve({ title, content, tags: [] });
          };
          reader.onerror = () =>
            reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        },
      );
    });

    Promise.all(promises)
      .then((results) => {
        importMultipleNotes(results);
        setImportStatus(`Successfully imported ${results.length} files!`);
        setTimeout(() => setImportStatus(null), 3500);
      })
      .catch((err) => {
        console.error(err);
        setImportStatus("Error importing files.");
        setTimeout(() => setImportStatus(null), 3000);
      })
      .finally(() => {
        e.target.value = "";
      });
  };

  const handleImportFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const mdFiles = fileList.filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    );

    if (mdFiles.length === 0) {
      setImportStatus("No .md files found in folder.");
      setTimeout(() => setImportStatus(null), 3000);
      e.target.value = "";
      return;
    }

    const promises = mdFiles.map((file) => {
      return new Promise<{
        title: string;
        content: string;
        tags?: string[];
        folder?: string;
      }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const generateTitle = (filename: string) => {
            const base = filename.replace(/\.(md|markdown)$/i, "");
            return base
              .replace(/[_-]/g, " ")
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
          };
          const title = generateTitle(file.name);

          // Keep track of folder names as tags
          const tags: string[] = [];
          let folder = "";
          if (file.webkitRelativePath) {
            const parts = file.webkitRelativePath.split("/");
            parts.pop(); // remove file name
            if (parts.length > 0) {
              folder = parts[parts.length - 1];
            }
            parts.forEach((part) => {
              if (part && part !== "." && part !== "..") {
                const cleanTag = part.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                if (cleanTag && !tags.includes(cleanTag)) {
                  tags.push(cleanTag);
                }
              }
            });
          }

          resolve({ title, content, tags, folder });
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
      });
    });

    Promise.all(promises)
      .then((results) => {
        importMultipleNotes(results);
        setImportStatus(
          `Successfully imported ${results.length} notes from folder!`,
        );
        setTimeout(() => setImportStatus(null), 3500);
      })
      .catch((err) => {
        console.error(err);
        setImportStatus("Error importing folder.");
        setTimeout(() => setImportStatus(null), 3000);
      })
      .finally(() => {
        e.target.value = "";
      });
  };

  // --- AI Actions ---
  const handleAIAction = async (promptPrefix: string) => {
    if (!editorContent) return;

    setIsGenerating(true);
    setGeneratedText("");

    // Capture precise highlight if exists
    let selectedText = "";
    let start = 0;
    let end = 0;
    if (textareaRef.current) {
      start = textareaRef.current.selectionStart;
      end = textareaRef.current.selectionEnd;
      selectedText = textareaRef.current.value.substring(start, end);
    }

    if (selectedText) {
      setActiveSelection({ start, end, text: selectedText });
    } else {
      setActiveSelection(null);
    }

    const service = new LLMService(config);

    // Context from surrounding documents
    const otherNotesTitles = notes
      .filter((n) => n.id !== activeNote?.id)
      .map((n) => n.title || "Untitled Note")
      .join(", ");
    const noteTitle = activeNote?.title || "Untitled Note";

    // Build the instruction
    let fullPrompt = "";
    if (selectedText) {
      fullPrompt = `You are editing a document titled "${noteTitle}" in an AI-native workspace named Lumen.
Other items/notes available in the workspace: [${otherNotesTitles}].

The user has highlighted an explicit section of the document and selected the tool Action: "${promptPrefix}".

--- SURROUNDING DOCUMENT CONTENT FOR CONTEXT ---
${editorContent}
------------------------------------------------

--- THE SPECIFIC HIGHLIGHTED TEXT TO PROCESS ---
${selectedText}
------------------------------------------------

Instructions:
1. Process ONLY the HIGHLIGHTED TEXT based on the instruction: "${promptPrefix}".
2. Maintain complete consistency with the style, tone, and logical context of the surrounding document.
3. Output ONLY the improved/processed version of that highlighted section. Do not output any markdown wrappers of your entire response, do not rewrite unchanged parts of the document. Return only the final revised text directly.`;
    } else {
      fullPrompt = `You are analyzing a document titled "${noteTitle}" in an AI-native workspace named Lumen.
Other items/notes available in the workspace: [${otherNotesTitles}].

The user selected the tool Action: "${promptPrefix}" on the entire document.

--- FULL DOCUMENT CONTENT ---
${editorContent}
-----------------------------

Instructions:
1. Perform the operation: "${promptPrefix}" on the document.
2. Return your output in clean Markdown format.`;
    }

    // Split text into chunks if it is extremely long, otherwise keep it unified
    const chunkText = (text: string, maxChunkSize: number = 8000): string[] => {
      if (text.length <= maxChunkSize) return [text];

      const chunks: string[] = [];
      const paragraphs = text.split("\n");
      let currentChunk = "";

      for (const para of paragraphs) {
        if ((currentChunk + "\n" + para).length > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            currentChunk = para;
          } else {
            let remaining = para;
            while (remaining.length > maxChunkSize) {
              chunks.push(remaining.substring(0, maxChunkSize));
              remaining = remaining.substring(maxChunkSize);
            }
            currentChunk = remaining;
          }
        } else {
          currentChunk = currentChunk ? currentChunk + "\n" + para : para;
        }
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      return chunks;
    };

    const chunks = chunkText(fullPrompt, 8000);

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        let chunkPrompt = chunk;
        if (chunks.length > 1) {
          chunkPrompt = `${chunk}\n\n(Part ${i + 1} of ${chunks.length})`;
          setGeneratedText(
            (prev) => prev + (prev ? "\n\n" : "") + `### Section ${i + 1}:\n`,
          );
        }

        const messages: ChatMessage[] = [
          { role: "user", content: chunkPrompt },
        ];
        const generator = service.streamResponse(messages);

        for await (const token of generator) {
          setGeneratedText((prev) => prev + token);
        }
      }
    } catch (e) {
      setGeneratedText(
        (prev) =>
          prev +
          "\n\nError generating response. Please check your AI Settings.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIInsert = () => {
    if (activeSelection && textareaRef.current && activeNote) {
      const val = textareaRef.current.value;
      const newVal =
        val.substring(0, activeSelection.start) +
        generatedText +
        val.substring(activeSelection.end);
      handleContentChange(newVal);

      setTimeout(() => {
        textareaRef.current?.focus();
        const newCursorPos = activeSelection.start + generatedText.length;
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
      setActiveSelection(null);
    } else {
      insertTextAtCursor(`\n\n${generatedText}\n\n`);
    }
    setGeneratedText("");
  };

  const handleAIDiscard = () => {
    setGeneratedText("");
    setActiveSelection(null);
  };

  const handleExport = (type: "md" | "txt" | "pdf") => {
    if (!activeNote) return;
    setIsExportMenuOpen(false);

    if (type === "pdf") {
      window.print();
      return;
    }

    // For md/txt, use the full, un-filtered content
    const content = activeNote.content;
    const mime = type === "md" ? "text/markdown" : "text/plain";
    const ext = type;

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeNote.title || "untitled"}.${ext}`;
    a.click();
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
      case "checking":
        return "bg-yellow-500 animate-pulse";
      case "disconnected":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const renderNoteItem = (note: Note, isInsideFolder = false) => {
    const isSelected = !!selectedNoteIds[note.id];

    const handleItemClick = (e: React.MouseEvent) => {
      if (isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
        toggleSelectNote(note.id);
      } else {
        setActiveNoteId(note.id);
      }
    };

    return (
      <div key={note.id} className="relative group flex items-center w-full">
        <button
          onClick={handleItemClick}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all text-left ${
            isSelectionMode
              ? isSelected
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 dark:border-emerald-500/30"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] hover:text-gray-700 dark:hover:text-gray-200 border border-transparent"
              : activeNoteId === note.id
                ? "bg-gray-200 dark:bg-[#1C1C1C] text-gray-900 dark:text-white border border-gray-300 dark:border-[#333]"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1A1A1A] hover:text-gray-700 dark:hover:text-gray-200 border border-transparent"
          } ${isInsideFolder ? "pl-5 border-l-2 border-dashed border-gray-205 dark:border-gray-800" : ""}`}
        >
          {isSelectionMode ? (
            <div className="shrink-0 flex items-center justify-center">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelectNote(note.id)}
                className="w-3.5 h-3.5 accent-emerald-500 text-emerald-600 rounded border-gray-300 dark:border-gray-700 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : note.type === "voice" ? (
            <Mic
              className={`w-3.5 h-3.5 shrink-0 ${activeNoteId === note.id ? "text-purple-500" : "text-purple-600 dark:text-purple-400"}`}
            />
          ) : (
            <FileText
              className={`w-3.5 h-3.5 shrink-0 ${activeNoteId === note.id ? "text-emerald-500" : "text-gray-500 dark:text-gray-550"}`}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 w-full">
              <span className="truncate block font-medium text-[13px]">
                {note.title || "Untitled Note"}
              </span>
              {note.type === "voice" && note.duration && (
                <span className="text-[9px] text-purple-600 dark:text-purple-400 font-mono font-bold bg-purple-500/10 dark:bg-purple-500/20 px-1 py-0.2 rounded border border-purple-500/10 shrink-0">
                  {Math.floor(note.duration / 60)}:
                  {(note.duration % 60).toString().padStart(2, "0")}
                </span>
              )}
            </div>
            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5 max-w-[150px]">
                {note.tags.map((t, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20 rounded font-mono truncate max-w-[60px]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
        {!isSelectionMode && (
          <div className="absolute right-2 top-0 bottom-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => handleRenameClick(note.id)}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#2A2A2A] rounded cursor-pointer"
              title="Rename note"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteClick(note.id)}
              className="p-1 text-red-500/70 hover:text-red-600 dark:hover:text-red-500 hover:bg-red-500/10 rounded cursor-pointer"
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-[#0F0F0F] text-gray-800 dark:text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 bg-gray-50 dark:bg-[#111111] border-r border-gray-200 dark:border-[#222] flex flex-col min-w-[250px] shrink-0 print:hidden z-20">
        <div className="p-4 border-b border-gray-200 dark:border-[#222]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl tracking-tight">
              <Zap className="w-5 h-5 fill-current" />
              <span>Lumen</span>
            </div>
            
            {/* Left Sidebar Toggle with ON/OFF Indicator */}
            <button
              onClick={() => setSidebarOpen(false)}
              title="Turn Off Sidebar"
              className="p-1.5 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30 hover:bg-emerald-500/20"
            >
              <Sidebar className="w-4 h-4" />
              <span className="text-[10px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                ON
              </span>
            </button>
          </div>
        </div>

        {/* Sidebar Tabs */}
        <div className="px-3 pt-2 pb-1 flex items-center gap-1 border-b border-gray-200 dark:border-[#222] bg-gray-100/50 dark:bg-[#161616]/20">
          {(["all", "notes", "voice"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md capitalize transition-all select-none cursor-pointer border ${
                sidebarTab === tab
                  ? "bg-white dark:bg-[#202020] text-emerald-600 dark:text-emerald-400 shadow-xs border-gray-200 dark:border-[#2f2f2f]"
                  : "text-gray-400 dark:text-gray-550 hover:text-gray-700 dark:hover:text-gray-300 border-transparent bg-transparent"
              }`}
            >
              {tab === "voice" ? "Voice" : tab}
            </button>
          ))}
        </div>

        <div className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {/* Bulk Selection Toolbar */}
          {isSelectionMode ? (
            <div className="px-3 py-2.5 mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>{selectedVisibleCount} Selected</span>
                </span>
                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedNoteIds({});
                  }}
                  className="text-[10px] tracking-wider uppercase font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white px-2 py-0.5 bg-gray-200/50 dark:bg-[#202020] rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleSelectAll}
                  className="flex-1 py-1 px-2 text-[11px] font-semibold rounded-md border border-gray-300 dark:border-[#333] hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-all text-gray-700 dark:text-gray-300 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-3 h-3 accent-emerald-500 rounded cursor-pointer pointer-events-none"
                    readOnly
                  />
                  <span>{isAllSelected ? "Deselect All" : "Select All"}</span>
                </button>

                <button
                  onClick={handleBulkDelete}
                  disabled={selectedVisibleCount === 0}
                  className="flex-1 py-1 px-2 text-[11px] font-semibold rounded-md bg-red-600 hover:bg-red-700 dark:bg-red-600/30 dark:hover:bg-red-500/50 text-white dark:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedVisibleCount})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 mb-1 flex items-center justify-between border-b border-gray-200/50 dark:border-[#222]/50">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {sidebarTab === "all" && "All Documents"}
                {sidebarTab === "notes" && "Markdown Notes"}
                {sidebarTab === "voice" && "Voice Memos"}
              </span>
              <button
                onClick={() => setIsSelectionMode(true)}
                className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 px-1.5 py-0.5 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                title="Manage multiple notes"
              >
                Bulk Action
              </button>
            </div>
          )}
          {/* Folders Accordion */}
          {Object.keys(groupedNotes.folders)
            .sort()
            .map((folderName) => {
              const isCollapsed = collapsedFolders[folderName];
              return (
                <div key={folderName} className="space-y-0.5 mb-2">
                  <button
                    onClick={() => toggleFolder(folderName)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white uppercase tracking-wider select-none bg-gray-100/35 dark:bg-[#161616]/20 rounded-md transition-colors border border-gray-200/50 dark:border-[#222]/30 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Folder className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 fill-blue-500/10 shrink-0" />
                      <span className="truncate">{folderName}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-550 lowercase font-normal shrink-0">
                        ({groupedNotes.folders[folderName].length})
                      </span>
                    </span>
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="pl-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      {groupedNotes.folders[folderName].map((note) =>
                        renderNoteItem(note, true),
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Unassigned Notes Heading if folders exist */}
          {Object.keys(groupedNotes.folders).length > 0 &&
            groupedNotes.unassigned.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 border-t border-gray-200/30 dark:border-[#222]/30 mt-3 pt-2">
                <File className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>Other Documents</span>
              </div>
            )}

          {/* Render Unassigned Notes */}
          <div className="space-y-1">
            {groupedNotes.unassigned.map((note) => renderNoteItem(note, false))}
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-[#222] mt-auto space-y-2">
          <Button
            onClick={addNote}
            className="w-full bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 shadow-lg shadow-emerald-900/20"
          >
            <Plus className="w-4 h-4 mr-2" /> New Note
          </Button>
          <Button
            onClick={() => setIsVoiceModeOpen(true)}
            className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-600/35 dark:hover:bg-purple-500 text-white shadow-xs border-transparent"
          >
            <Mic className="w-4 h-4 mr-2" /> Record Voice Memo
          </Button>
          <div className="flex items-center gap-2 relative">
            <div className="relative flex-1">
              <Button
                variant="secondary"
                onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
                className="w-full flex items-center justify-between h-10 px-3 py-2 text-sm"
              >
                <span className="flex items-center">
                  <Upload className="w-4 h-4 mr-2" /> Import
                </span>
                {isImportMenuOpen ? (
                  <ChevronDown className="w-4 h-4 ml-1 opacity-60 animate-in fade-in zoom-in-50 duration-200" />
                ) : (
                  <ChevronUp className="w-4 h-4 ml-1 opacity-60 animate-in fade-in zoom-in-50 duration-200" />
                )}
              </Button>

              {isImportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsImportMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#222]/80 rounded-lg shadow-xl py-1 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <button
                      onClick={() => {
                        setIsImportMenuOpen(false);
                        mdFileInputRef.current?.click();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#222]/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Import .md files</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsImportMenuOpen(false);
                        folderFileInputRef.current?.click();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#222]/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 text-blue-500" />
                      <span>Import Folder</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={toggleTheme}
              className="px-2.5 h-10"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative h-screen">
        {/* Header */}
        <header className="h-14 border-b border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#111111] flex items-center justify-between px-6 shrink-0 print:hidden z-20">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 w-full mr-4 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Turn On Sidebar"
                className="p-1.5 mr-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer bg-gray-150 dark:bg-[#1A1A1A] text-gray-450 dark:text-gray-500 border-gray-200 dark:border-[#333] hover:bg-gray-200 dark:hover:bg-[#222] hover:text-gray-650 dark:hover:text-[#fff] shrink-0 active:scale-95"
              >
                <Sidebar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-550" />
                <span className="text-[10px] font-bold tracking-wider text-gray-400 dark:text-gray-550 shrink-0">
                  OFF
                </span>
              </button>
            )}
            <span className="hidden sm:inline shrink-0">My Workspace</span>
            <ChevronRight className="w-4 h-4 hidden sm:inline shrink-0 font-light" />
            <input
              ref={headerTitleRef}
              className="bg-transparent text-gray-900 dark:text-white font-medium focus:outline-none focus:border-b border-gray-400 dark:border-gray-600 min-w-[100px] max-w-[160px] truncate"
              value={activeNote?.title || ""}
              onChange={(e) =>
                activeNote &&
                updateNote(activeNote.id, { title: e.target.value })
              }
              placeholder="Untitled Note"
            />

            {/* Folder indicator */}
            {activeNote && (
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <span className="text-gray-300 dark:text-gray-700 select-none">
                  /
                </span>
                <button
                  onClick={() => {
                    const f = prompt(
                      "Move note to folder / Set folder name:",
                      activeNote.folder || "",
                    );
                    if (f !== null) {
                      updateNote(activeNote.id, {
                        folder: f.trim() || undefined,
                      });
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                    activeNote.folder
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:bg-blue-500/15 border-blue-200 dark:border-blue-900/30 hover:scale-105"
                      : "text-gray-400 dark:text-gray-550 border-gray-200 dark:border-gray-800 border-dashed hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-500/30"
                  }`}
                  title="Set Note Folder"
                >
                  <Folder className="w-3 h-3" />
                  <span>{activeNote.folder || "+ Folder"}</span>
                </button>
              </div>
            )}

            {/* Header Active Note Tags Display */}
            {activeNote && (
              <div
                id="header-tags-list"
                className="flex items-center gap-1.5 flex-wrap overflow-hidden ml-2 max-h-10 py-1"
              >
                {activeNote.tags &&
                  activeNote.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20 rounded-full border border-emerald-500/10 dark:border-emerald-500/20 hover:scale-105 transition-all"
                    >
                      #{tag}
                      <button
                        onClick={() => {
                          const updated =
                            activeNote.tags?.filter((t) => t !== tag) || [];
                          updateNote(activeNote.id, { tags: updated });
                        }}
                        className="hover:text-red-500 font-bold ml-0.5 leading-none"
                        title="Remove Tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                <button
                  onClick={() => {
                    const tag = prompt("Add a tag to this note:");
                    if (tag && tag.trim()) {
                      const trimmed = tag.trim().toLowerCase();
                      const current = activeNote.tags || [];
                      if (!current.includes(trimmed)) {
                        updateNote(activeNote.id, {
                          tags: [...current, trimmed],
                        });
                      }
                    }
                  }}
                  className="text-[10px] font-semibold px-2 py-0.5 text-gray-400 hover:text-emerald-600 dark:text-gray-500 dark:hover:text-emerald-400 border border-gray-300 dark:border-[#333] border-dashed rounded-full bg-transparent hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-all"
                >
                  + Tag
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-200 dark:bg-[#1A1A1A] rounded-lg p-1 border border-gray-300 dark:border-[#333]">
              <button
                onClick={() => setViewMode("edit")}
                title="Editor Only"
                className={`p-1.5 rounded transition-all ${viewMode === "edit" ? "bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("split")}
                title="Split View"
                className={`p-1.5 rounded transition-all ${viewMode === "split" ? "bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <Columns className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("preview")}
                title="Preview Only"
                className={`p-1.5 rounded transition-all ${viewMode === "preview" ? "bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>

            <div className="h-4 w-px bg-gray-300 dark:bg-[#333] mx-1" />

            {/* Copilot Toggle Pattern matching existing box style */}
            <div className="flex bg-gray-200 dark:bg-[#1A1A1A] rounded-lg p-1 border border-gray-300 dark:border-[#333]">
              <button
                onClick={() => setChatOpen(!chatOpen)}
                title={chatOpen ? "Close Copilot" : "Open Copilot"}
                className={`p-1.5 rounded transition-all flex items-center gap-1 ${chatOpen ? "bg-white dark:bg-[#333] text-emerald-500 dark:text-emerald-400 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-semibold px-0.5 hidden md:inline">
                  Copilot
                </span>
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
                  <button
                    onClick={() => handleExport("md")}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white"
                  >
                    <FileCode className="w-4 h-4" /> Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleExport("txt")}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white"
                  >
                    <File className="w-4 h-4" /> Plain Text (.txt)
                  </button>
                  <button
                    onClick={() => handleExport("pdf")}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-black dark:hover:text-white"
                  >
                    <Printer className="w-4 h-4" /> PDF (Print)
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-[#1A1A1A] rounded-full border border-gray-200 dark:border-[#333]">
              <div
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${getStatusColor()}`}
                title={connectionStatus}
              />
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium uppercase tracking-wider">
                {config.provider}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="w-4 h-4" />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
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
          <div className="flex items-center gap-2 whitespace-nowrap flex-1">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider ml-2 mr-1">
              AI Tools
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleAIAction("Summarize this note")}
            >
              <Sparkles className="w-3 h-3 mr-2 text-emerald-500 dark:text-emerald-400" />{" "}
              Summarize
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleAIAction("Fix grammar and improve tone")}
            >
              <PenLine className="w-3 h-3 mr-2 text-blue-500 dark:text-blue-400" />{" "}
              Improve
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
        <div
          ref={containerRef}
          className="flex-1 flex overflow-hidden relative print:block print:overflow-visible print:h-auto"
        >
          {activeNote ? (
            activeNote.type === "voice" ? (
              <VoiceMemoPlayer note={activeNote} onUpdateNote={updateNote} />
            ) : (
              <>
                {/* Left: Markdown Input */}
                <div
                  style={{
                    width:
                      viewMode === "split"
                        ? `${splitPos}%`
                        : viewMode === "edit"
                          ? "100%"
                          : "0%",
                    display: viewMode === "preview" ? "none" : "flex",
                  }}
                  className="flex flex-col border-r border-gray-200 dark:border-[#222] bg-white dark:bg-[#111] transition-none print:hidden"
                >
                  <textarea
                    ref={textareaRef}
                    className="flex-1 w-full bg-transparent text-gray-700 dark:text-gray-300 font-mono text-sm p-6 resize-none focus:outline-none custom-scrollbar leading-relaxed break-words whitespace-pre-wrap"
                    placeholder="# Start typing your note here... (Type / for commands)"
                    value={editorContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    spellCheck={false}
                  />
                </div>

                {/* Resizer Handle */}
                {viewMode === "split" && (
                  <div
                    className="w-2 -ml-1 h-full cursor-col-resize z-50 flex items-center justify-center group hover:bg-emerald-500/10 transition-colors print:hidden"
                    onMouseDown={startResizing}
                  >
                    <div className="w-0.5 h-8 bg-gray-300 dark:bg-[#333] group-hover:bg-emerald-500 rounded-full transition-colors" />
                  </div>
                )}

                {/* Right: Preview */}
                <div
                  id="preview-pane"
                  style={{
                    width:
                      viewMode === "split"
                        ? `${100 - splitPos}%`
                        : viewMode === "preview"
                          ? "100%"
                          : "0%",
                    display: viewMode === "edit" ? "none" : "block",
                    pointerEvents: isDragging ? "none" : "auto", // Prevent iframe interference while dragging
                  }}
                  className={`h-full overflow-y-auto custom-scrollbar ${theme === "light" ? "bg-dotted-pattern-light" : "bg-dotted-pattern-dark"}`}
                >
                  <div
                    className={`prose ${theme === "dark" ? "dark:prose-invert" : ""} max-w-none p-8`}
                    dangerouslySetInnerHTML={{
                      __html: parseMarkdown(activeNote.content),
                    }}
                  />
                </div>
              </>
            )
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
            multiple
            onChange={handleImportMarkdown}
          />
          <input
            type="file"
            ref={folderFileInputRef}
            className="hidden"
            {...{ webkitdirectory: "", directory: "", multiple: true }}
            onChange={handleImportFolder}
          />

          {/* Import Status Toast */}
          {importStatus && (
            <div className="absolute bottom-6 left-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-900/95 dark:bg-black/95 text-white border border-[#333] shadow-2xl">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">{importStatus}</span>
              </div>
            </div>
          )}

          {/* AI Output Overlay */}
          {(isGenerating || generatedText) && (
            <div className="absolute bottom-6 right-6 w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="p-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-blue-500/20 backdrop-blur-md border border-gray-200 dark:border-[#333] shadow-2xl">
                <div className="bg-white/80 dark:bg-[#161616] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" /> AI Analysis
                  </div>
                  <div className="max-h-60 overflow-y-auto text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-3 custom-scrollbar">
                    {generatedText}
                    {isGenerating && (
                      <span className="inline-block w-1 h-3 bg-emerald-500 ml-1 animate-pulse" />
                    )}
                  </div>
                  <div className="flex gap-2 justify-end pt-2 border-t border-gray-200 dark:border-[#333]">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleAIDiscard}
                      disabled={isGenerating}
                      className="h-7 text-xs"
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 h-7 text-xs"
                      onClick={handleAIInsert}
                      disabled={isGenerating}
                    >
                      Insert
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {chatOpen && <AICopilot onClose={() => setChatOpen(false)} />}

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
        <div
          className="fixed inset-0 z-10 bg-transparent print:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      {isExportMenuOpen && (
        <div
          className="fixed inset-0 z-10 bg-transparent print:hidden"
          onClick={() => setIsExportMenuOpen(false)}
        />
      )}

      {noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Note
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Are you sure you want to delete this note? This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setNoteToDelete(null)}>
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white shadow-sm border-transparent"
              >
                Delete Note
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Multiple Notes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Are you sure you want to delete the {Object.keys(selectedNoteIds).filter(id => selectedNoteIds[id]).length} selected note(s)? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowBulkDeleteModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmBulkDelete}
                className="bg-red-500 hover:bg-red-600 text-white shadow-sm border-transparent animate-pulse"
              >
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// FIX: Added the 'App' wrapper component definition which was missing.
// This ensures that the context providers correctly wrap the application.
const App: React.FC = () => {
  return (
    <AIProvider>
      <NotesProvider>
        <EditorWorkspace />
      </NotesProvider>
    </AIProvider>
  );
};

export default App;
