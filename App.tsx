import React, { useState, useRef, useEffect, useMemo } from "react";
import { AIProvider, useAI } from "./context/AIContext";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
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
import { ChatMessage, Note } from "./types";
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
  ShieldAlert,
  Lock,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  Presentation,
  BookOpen,
  FolderPlus,
  Maximize2,
  HelpCircle,
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
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<
    Record<string, boolean>
  >({});
  const [excludedFolders, setExcludedFolders] = useState<
    Record<string, boolean>
  >({});

  // Drag and Drop States
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dragOverUnassigned, setDragOverUnassigned] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    noteId: string;
  } | null>(null);

  // Preview Mode and Zoom States
  const [previewMode, setPreviewMode] = useState<"document" | "html_rich" | "presentation" | "infographic">("document");
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [htmlTemplate, setHtmlTemplate] = useState<"raw" | "social" | "pitch" | "cyberpunk">("social");
  const [presentationStyle, setPresentationStyle] = useState<"standard" | "dark" | "retro" | "teal">("standard");
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState<boolean>(false);

  // Close context menu on global click
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  // Slides Calculator for presentation mode
  const slides = useMemo(() => {
    if (!activeNote || !activeNote.content) return [""];
    const parts = activeNote.content.split(/\n\s*---\s*\n|\n\s*\*\*\*\s*\n/);
    const filtered = parts.map(s => s.trim()).filter(Boolean);
    return filtered.length > 0 ? filtered : [activeNote.content];
  }, [activeNote?.content]);

  // Reset slide index when active note changes
  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [activeNoteId]);

  // Slides keydown navigational helper
  useEffect(() => {
    if (previewMode !== "presentation") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Space") {
        setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Escape") {
        setIsPresentationFullscreen(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewMode, slides.length]);

  const toggleSelectNote = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedNoteIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleExcludeFolder = (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExcludedFolders((prev) => {
      const isCurrentlyExcluded = !prev[folderName];
      
      // If we are excluding this folder, automatically deselect all notes inside it
      if (isCurrentlyExcluded) {
        setSelectedNoteIds((prevSelected) => {
          const nextSelected = { ...prevSelected };
          const folderNotes = notes.filter((n) => n.folder === folderName);
          folderNotes.forEach((note) => {
            delete nextSelected[note.id];
          });
          return nextSelected;
        });
      }
      
      return {
        ...prev,
        [folderName]: isCurrentlyExcluded,
      };
    });
  };

  const toggleSelectFolder = (folderName: string) => {
    if (excludedFolders[folderName]) return;
    
    const folderNotes = notes.filter((n) => n.folder === folderName);
    const allSelected =
      folderNotes.length > 0 &&
      folderNotes.every((n) => selectedNoteIds[n.id]);

    setSelectedNoteIds((prev) => {
      const next = { ...prev };
      folderNotes.forEach((note) => {
        if (allSelected) {
          delete next[note.id];
        } else {
          next[note.id] = true;
        }
      });
      return next;
    });
  };

  const selectAllWorkspace = () => {
    setSelectedNoteIds((prev) => {
      const next = { ...prev };
      notes.forEach((note) => {
        const isExcluded = note.folder && excludedFolders[note.folder];
        if (!isExcluded) {
          next[note.id] = true;
        } else {
          delete next[note.id];
        }
      });
      return next;
    });
  };

  const selectAllCurrentTab = () => {
    setSelectedNoteIds((prev) => {
      const next = { ...prev };
      filteredNotes.forEach((note) => {
        const isExcluded = note.folder && excludedFolders[note.folder];
        if (!isExcluded) {
          next[note.id] = true;
        } else {
          delete next[note.id];
        }
      });
      return next;
    });
  };

  const deselectAll = () => {
    setSelectedNoteIds({});
  };

  const handleBulkDelete = () => {
    const idsToDelete = Object.keys(selectedNoteIds).filter((id) => {
      if (!selectedNoteIds[id]) return false;
      const note = notes.find((n) => n.id === id);
      return !(note && note.folder && excludedFolders[note.folder]);
    });
    if (idsToDelete.length === 0) return;
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = () => {
    const idsToDelete = Object.keys(selectedNoteIds).filter((id) => {
      if (!selectedNoteIds[id]) return false;
      const note = notes.find((n) => n.id === id);
      return !(note && note.folder && excludedFolders[note.folder]);
    });
    if (idsToDelete.length > 0) {
      deleteMultipleNotes(idsToDelete);
      setSelectedNoteIds({});
      setExcludedFolders({});
      setIsSelectionMode(false);
    }
    setShowBulkDeleteModal(false);
  };

  const hasVisibleNotes = filteredNotes.length > 0;
  
  const selectedTotalCount = useMemo(() => {
    return Object.keys(selectedNoteIds).filter((id) => {
      if (!selectedNoteIds[id]) return false;
      const note = notes.find((n) => n.id === id);
      return !(note && note.folder && excludedFolders[note.folder]);
    }).length;
  }, [selectedNoteIds, notes, excludedFolders]);

  const selectedVisibleCount = useMemo(() => {
    return filteredNotes.filter((n) => {
      if (!selectedNoteIds[n.id]) return false;
      return !(n.folder && excludedFolders[n.folder]);
    }).length;
  }, [filteredNotes, selectedNoteIds, excludedFolders]);

  const isAllSelected =
    hasVisibleNotes && selectedVisibleCount === filteredNotes.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedNoteIds((prev) => {
        const next = { ...prev };
        filteredNotes.forEach((n) => {
          delete next[n.id];
        });
        return next;
      });
    } else {
      setSelectedNoteIds((prev) => {
        const next = { ...prev };
        filteredNotes.forEach((n) => {
          const isExcluded = n.folder && excludedFolders[n.folder];
          if (!isExcluded) {
            next[n.id] = true;
          }
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

  // Sections Parser for Bento Infographics mode
  const parsedSections = useMemo(() => {
    if (!activeNote || !activeNote.content) return [];
    
    const lines = activeNote.content.split("\n");
    const sections: { title: string; paragraphs: string[]; list_items: string[]; type: 'stats' | 'general' | 'code'; stats?: { num: string; label: string }[] }[] = [];
    
    let currentSection: typeof sections[0] = { title: "Overview", paragraphs: [], list_items: [], type: 'general' };
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // If it's a heading
      if (trimmed.startsWith("#")) {
        if (currentSection.paragraphs.length > 0 || currentSection.list_items.length > 0 || currentSection.title !== "Overview") {
          sections.push(currentSection);
        }
        
        const titleText = trimmed.replace(/^#+\s+/, "");
        currentSection = {
          title: titleText,
          paragraphs: [],
          list_items: [],
          type: 'general'
        };
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        currentSection.list_items.push(trimmed.replace(/^[-*]\s+/, ""));
      } else if (trimmed.startsWith("```")) {
        currentSection.type = 'code';
      } else {
        // Statistical highlights: e.g. "99% Success rate" or "15,000 Users" or "Active"
        const statMatch = trimmed.match(/^([\d,kMBT%+$★#\-/.]+)\s+(.+)$/);
        if (statMatch) {
          if (!currentSection.stats) currentSection.stats = [];
          currentSection.stats.push({ num: statMatch[1], label: statMatch[2] });
          currentSection.type = 'stats';
        } else {
          currentSection.paragraphs.push(trimmed);
        }
      }
    });
    
    if (currentSection.paragraphs.length > 0 || currentSection.list_items.length > 0 || currentSection.title !== "Overview" || (currentSection.stats && currentSection.stats.length > 0)) {
      sections.push(currentSection);
    }
    
    return sections;
  }, [activeNote?.content]);

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

    const fileList = Array.from(files) as any[];
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

    const fileList = Array.from(files) as any[];
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
    const isFolderExcluded = !!(note.folder && excludedFolders[note.folder]);

    const handleItemClick = (e: React.MouseEvent) => {
      if (isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
        if (isFolderExcluded) return;
        toggleSelectNote(note.id);
      } else {
        setActiveNoteId(note.id);
      }
    };

    return (
      <div
        key={note.id}
        className="relative group flex items-center w-full"
        draggable={!isSelectionMode}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", note.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            show: true,
            x: e.clientX,
            y: e.clientY,
            noteId: note.id,
          });
        }}
      >
        <button
          onClick={handleItemClick}
          disabled={isSelectionMode && isFolderExcluded}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all text-left ${
            isSelectionMode
              ? isFolderExcluded
                ? "bg-amber-500/[0.03] dark:bg-amber-500/[0.01] border border-dashed border-amber-500/20 dark:border-amber-500/10 cursor-not-allowed text-gray-400 dark:text-gray-500"
                : isSelected
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
                checked={isSelected && !isFolderExcluded}
                disabled={isFolderExcluded}
                onChange={() => {
                  if (!isFolderExcluded) {
                    toggleSelectNote(note.id);
                  }
                }}
                className={`w-3.5 h-3.5 accent-emerald-500 text-emerald-600 rounded border-gray-300 dark:border-gray-700 ${
                  isFolderExcluded ? "opacity-20 cursor-not-allowed" : "cursor-pointer"
                }`}
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
              <span className={`truncate block font-medium text-[13px] ${isSelectionMode && isFolderExcluded ? "line-through opacity-70" : ""}`}>
                {note.title || "Untitled Note"}
              </span>
              {isSelectionMode && isFolderExcluded && (
                <span className="text-[9px] px-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-sm font-mono flex items-center gap-0.5 shrink-0 animate-pulse border border-amber-500/10">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Spared</span>
                </span>
              )}
              {note.type === "voice" && note.duration && (!isSelectionMode || !isFolderExcluded) && (
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
                    className={`text-[9px] px-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20 rounded font-mono truncate max-w-[60px] ${isSelectionMode && isFolderExcluded ? "opacity-30" : ""}`}
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
            <div className="px-3 py-2.5 mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>{selectedTotalCount} Selected</span>
                </span>
                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedNoteIds({});
                    setExcludedFolders({});
                  }}
                  className="text-[10px] tracking-wider uppercase font-extrabold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white px-2 py-0.5 bg-gray-200/50 dark:bg-[#202020] rounded transition-colors cursor-pointer border border-transparent"
                >
                  Cancel
                </button>
              </div>

              {/* Multi-Selection Control Buttons */}
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-semibold text-gray-400 dark:text-gray-550 tracking-wider">Select Options:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={selectAllWorkspace}
                    title="Select all items across the entire workspace"
                    className="flex-1 py-1 px-1 text-[10px] font-semibold rounded border border-gray-250 dark:border-[#333] hover:bg-gray-100 dark:hover:bg-[#1C1C1C] transition-all text-gray-700 dark:text-gray-300 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>Entire Space</span>
                  </button>
                  <button
                    onClick={selectAllCurrentTab}
                    title={`Select all visible items in the current ${sidebarTab} view`}
                    className="flex-1 py-1 px-1 text-[10px] font-semibold rounded border border-gray-250 dark:border-[#333] hover:bg-gray-100 dark:hover:bg-[#1C1C1C] transition-all text-gray-700 dark:text-gray-300 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>Current Tab</span>
                  </button>
                  <button
                    onClick={deselectAll}
                    disabled={selectedTotalCount === 0}
                    className="py-1 px-2 text-[10px] font-semibold rounded border border-transparent bg-gray-100 hover:bg-gray-200 dark:bg-[#202020] dark:hover:bg-[#2A2A2A] transition-all text-gray-600 dark:text-gray-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-center"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Action and Protective Indicators */}
              <div className="space-y-1.5 pt-1.5 border-t border-emerald-500/10">
                {Object.keys(excludedFolders).filter(f => excludedFolders[f]).length > 0 && (
                  <div className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 bg-amber-500/5 px-2 py-1 rounded font-medium border border-amber-500/10">
                    <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    <span>{Object.keys(excludedFolders).filter(f => excludedFolders[f]).length} folder(s) excluded/guarded</span>
                  </div>
                )}
                
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedTotalCount === 0}
                  className="w-full py-1.5 px-2 text-[11px] font-bold rounded-md bg-red-600 hover:bg-red-700 dark:bg-red-600/35 dark:hover:bg-red-550/60 text-white dark:text-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-transparent"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedTotalCount})</span>
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
                title="Manage multiple notes and protect folders"
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
              const isExcluded = !!excludedFolders[folderName];
              
              // Count total notes and selected notes inside this folder
              const folderNotes = groupedNotes.folders[folderName] || [];
              const selectedInFolder = folderNotes.filter(n => selectedNoteIds[n.id]).length;
              const allSelected = folderNotes.length > 0 && folderNotes.every(n => selectedNoteIds[n.id]);

              return (
                <div
                  key={folderName}
                  className={`space-y-0.5 mb-2 rounded-lg border transition-all ${
                    dragOverFolder === folderName
                      ? "border-emerald-500/50 bg-emerald-500/[0.03] scale-[1.01] shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20"
                      : isExcluded
                        ? "border-amber-500/10 bg-amber-500/[0.01] opacity-90 p-1"
                        : "border-transparent"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOverFolder(folderName);
                  }}
                  onDragLeave={() => {
                    setDragOverFolder(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverFolder(null);
                    const noteId = e.dataTransfer.getData("text/plain");
                    if (noteId) {
                      updateNote(noteId, { folder: folderName });
                    }
                  }}
                >
                  <div
                    onClick={() => toggleFolder(folderName)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold select-none rounded-md transition-colors border cursor-pointer ${
                      isExcluded 
                        ? "bg-amber-500/5 text-amber-805 dark:text-amber-400 border-amber-500/20" 
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100/35 dark:bg-[#161616]/20 border-gray-200/50 dark:border-[#222]/30"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isSelectionMode && (
                        <input
                          type="checkbox"
                          checked={allSelected && !isExcluded}
                          disabled={isExcluded}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectFolder(folderName);
                          }}
                          className={`w-3.5 h-3.5 accent-emerald-500 text-emerald-600 rounded shrink-0 ${
                            isExcluded ? "opacity-20 cursor-not-allowed" : "cursor-pointer"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      
                      <Folder className={`w-3.5 h-3.5 shrink-0 ${isExcluded ? "text-amber-500 fill-amber-500/10" : "text-blue-500 dark:text-blue-400 fill-blue-500/10"}`} />
                      
                      <span className={`truncate text-[11px] ${isExcluded ? "line-through leading-relaxed opacity-80" : ""}`}>
                        {folderName}
                      </span>
                      
                      <span className="text-[9px] text-gray-400 dark:text-gray-500 font-normal shrink-0 lowercase">
                        ({folderNotes.length}{selectedInFolder > 0 && `, ${selectedInFolder} sel`})
                      </span>
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSelectionMode && (
                        <button
                          onClick={(e) => toggleExcludeFolder(folderName, e)}
                          title={isExcluded ? "Cancel Guard / Include in bulk delete" : "Exclude / Protect folder contents"}
                          className={`px-1 rounded text-[9px] py-0.5 font-extrabold uppercase transition-all flex items-center gap-0.5 cursor-pointer border shrink-0 ${
                            isExcluded
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              : "bg-gray-150 hover:bg-amber-550/10 dark:bg-[#202020] hover:text-amber-500 hover:border-amber-500/20 text-[10px] text-gray-400 border-transparent font-medium"
                          }`}
                        >
                          <ShieldAlert className="w-2.5 h-2.5" />
                          <span>{isExcluded ? "Spared" : "Protect"}</span>
                        </button>
                      )}
                      
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
                      )}
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="pl-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      {folderNotes.map((note) =>
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
          <div
            className={`space-y-1 p-1 rounded-lg border transition-all ${
              dragOverUnassigned
                ? "border-emerald-500/35 bg-emerald-500/[0.02] border-dashed scale-[0.99]"
                : "border-transparent"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOverUnassigned(true);
            }}
            onDragLeave={() => {
              setDragOverUnassigned(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverUnassigned(false);
              const noteId = e.dataTransfer.getData("text/plain");
              if (noteId) {
                updateNote(noteId, { folder: undefined });
              }
            }}
          >
            {groupedNotes.unassigned.map((note) => renderNoteItem(note, false))}
          </div>
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-[#222] mt-auto space-y-2">
          <div className="relative">
            <div className="flex items-stretch w-full rounded-lg overflow-hidden shadow-lg shadow-indigo-900/20">
              <button
                onClick={() => { addNote(); setIsNewMenuOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2.5 transition-colors"
              >
                <Plus className="w-4 h-4" /> New
              </button>
              <button
                onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                className="px-3 bg-indigo-700 hover:bg-indigo-800 text-white border-l border-indigo-500/40 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            {isNewMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsNewMenuOpen(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#222]/80 rounded-lg shadow-xl py-1 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    onClick={() => { addNote(); setIsNewMenuOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#222]/80 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <span>Note</span>
                  </button>
                  <button
                    onClick={() => {
                      const folderName = prompt("Folder name:");
                      if (folderName?.trim()) {
                        addNote();
                        // We'll set the folder on the new note after it's created
                        setTimeout(() => {
                          const newest = notes[notes.length - 1];
                          if (newest) updateNote(newest.id, { folder: folderName.trim() });
                        }, 50);
                      }
                      setIsNewMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#222]/80 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4 text-blue-500" />
                    <span>Folder</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
                  className={`h-full flex flex-col relative overflow-hidden bg-white dark:bg-[#111111] ${
                    theme === "light" ? "bg-dotted-pattern-light" : "bg-dotted-pattern-dark"
                  }`}
                >
                  {/* PREVIEW CONTROLS TOOLBAR */}
                  <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-150 dark:border-[#222] bg-gray-50/95 dark:bg-[#121212]/95 backdrop-blur-md select-none shrink-0 print:hidden shadow-sm">
                    {/* Render Modes Selector */}
                    <div className="flex bg-gray-200/80 dark:bg-[#1A1A1A] rounded-lg p-0.5 border border-gray-250 dark:border-[#2b2b2b]">
                      <button
                        onClick={() => setPreviewMode("document")}
                        title="Standard Document View"
                        className={`p-1.5 px-2.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                          previewMode === "document"
                            ? "bg-white dark:bg-[#2A2A2A] text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Doc</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode("html_rich")}
                        title="HTML Designer View"
                        className={`p-1.5 px-2.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                          previewMode === "html_rich"
                            ? "bg-white dark:bg-[#2A2A2A] text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>HTML</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode("presentation")}
                        title="Presentation Slides Mode"
                        className={`p-1.5 px-2.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                          previewMode === "presentation"
                            ? "bg-white dark:bg-[#2A2A2A] text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        <Presentation className="w-3.5 h-3.5" />
                        <span>Slides</span>
                      </button>
                      <button
                        onClick={() => setPreviewMode("infographic")}
                        title="Bento Grid Infographic"
                        className={`p-1.5 px-2.5 rounded-md transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                          previewMode === "infographic"
                            ? "bg-white dark:bg-[#2A2A2A] text-emerald-600 dark:text-emerald-400 shadow-sm"
                            : "text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Bento</span>
                      </button>
                    </div>

                    {/* Layout Presets (Contextual) */}
                    {previewMode === "html_rich" && (
                      <div className="flex items-center gap-1.5 bg-gray-200/50 dark:bg-[#1A1A1A]/80 px-2 py-1 rounded-lg border border-gray-200 dark:border-[#2c2c2c] text-xs">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Layout:</span>
                        <select
                          value={htmlTemplate}
                          onChange={(e) => setHtmlTemplate(e.target.value as any)}
                          className="bg-transparent text-gray-700 dark:text-gray-300 font-semibold focus:outline-none cursor-pointer text-xs focus:ring-0"
                        >
                          <option value="raw" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Canvas Default</option>
                          <option value="social" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Social Promo Card</option>
                          <option value="pitch" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Cream Proposal Pitch</option>
                          <option value="cyberpunk" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Cyber TerminalHUD</option>
                        </select>
                      </div>
                    )}

                    {previewMode === "presentation" && (
                      <div className="flex items-center gap-1.5 bg-gray-200/50 dark:bg-[#1A1A1A]/80 px-2 py-1 rounded-lg border border-gray-200 dark:border-[#2c2c2c] text-xs">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Style:</span>
                        <select
                          value={presentationStyle}
                          onChange={(e) => setPresentationStyle(e.target.value as any)}
                          className="bg-transparent text-gray-700 dark:text-gray-300 font-semibold focus:outline-none cursor-pointer text-xs focus:ring-0"
                        >
                          <option value="standard" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Standard Light</option>
                          <option value="dark" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Classic Night</option>
                          <option value="retro" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Brutalist Orange</option>
                          <option value="teal" className="bg-white dark:bg-[#111] text-gray-800 dark:text-white">Teal Wave Gradient</option>
                        </select>
                      </div>
                    )}

                    {/* Zoom Controller */}
                    <div className="flex items-center gap-2">
                      <div className="flex bg-gray-200/80 dark:bg-[#1A1A1A] rounded-lg p-0.5 border border-gray-250 dark:border-[#2b2b2b] items-center">
                        <button
                          onClick={() => setPreviewZoom(z => Math.max(50, z - 10))}
                          title="Zoom Out"
                          className="p-1 px-2 rounded-md hover:bg-white dark:hover:bg-[#2A2A2A] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-all cursor-pointer"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPreviewZoom(100)}
                          title="Click to Reset Zoom (100%)"
                          className="text-[10px] font-mono font-bold text-gray-600 dark:text-gray-400 px-1.5 select-none hover:text-emerald-500 hover:scale-105 transition-all text-center min-w-[40px] cursor-pointer"
                        >
                          {previewZoom}%
                        </button>
                        <button
                          onClick={() => setPreviewZoom(z => Math.min(250, z + 10))}
                          title="Zoom In"
                          className="p-1 px-2 rounded-md hover:bg-white dark:hover:bg-[#2A2A2A] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-all cursor-pointer"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {previewMode === "presentation" && (
                        <button
                          onClick={() => setIsPresentationFullscreen(true)}
                          title="Open Slide in Fullscreen Deck Mode"
                          className="p-1.5 bg-gray-200 dark:bg-[#1A1A1A] hover:bg-[#2A2A2A] hover:text-white dark:hover:bg-[#222] border border-gray-300 dark:border-[#333] text-gray-600 dark:text-gray-400 rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ACTUAL RENDERED STAGE CONTAINER */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                    {/* Mode 1: Document View */}
                    {previewMode === "document" && (
                      <div 
                        className="flex-1 p-8"
                        style={{ fontSize: `${previewZoom}%`, transition: 'font-size 150ms ease-in-out' }}
                      >
                        <div
                          className={`prose ${theme === "dark" ? "dark:prose-invert" : ""} max-w-none`}
                          dangerouslySetInnerHTML={{
                            __html: parseMarkdown(activeNote.content),
                          }}
                        />
                      </div>
                    )}

                    {/* Mode 2: HTML custom layouts */}
                    {previewMode === "html_rich" && (
                      <div 
                        className="flex-1 p-8 flex flex-col items-center justify-center"
                        style={{ fontSize: `${previewZoom}%`, transition: 'font-size 150ms ease-in-out' }}
                      >
                        {htmlTemplate === "raw" && (
                          <div
                            className="w-full h-full min-h-[400px] shadow-sm p-6 rounded-xl border border-gray-250 dark:border-[#333] bg-white dark:bg-[#141414] text-gray-800 dark:text-gray-100"
                            dangerouslySetInnerHTML={{
                              __html: activeNote.content.trim().startsWith("<") 
                                ? activeNote.content 
                                : parseMarkdown(activeNote.content),
                            }}
                          />
                        )}

                        {htmlTemplate === "social" && (
                          <div className="w-full max-w-2xl bg-gradient-to-br from-[#10b981]/25 via-teal-500/[0.05] to-[#3b82f6]/20 p-8 rounded-3xl border border-emerald-500/10 dark:border-emerald-500/5 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center py-16">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 blur-3xl rounded-full" />
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 blur-3xl rounded-full" />
                            
                            <div className="max-w-md space-y-6 select-text">
                              <span className="text-[10px] tracking-widest uppercase font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/10">
                                {activeNote.folder || "Unassigned Space"}
                              </span>
                              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight font-sans drop-shadow-sm">
                                {activeNote.title || "Untitled Note"}
                              </h2>
                              <div 
                                className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-sans max-h-48 overflow-y-auto no-scrollbar"
                                dangerouslySetInnerHTML={{
                                  __html: parseMarkdown(activeNote.content),
                                }}
                              />
                            </div>
                            <div className="mt-12 flex items-center gap-2 text-[10px] font-mono text-gray-400 uppercase tracking-widest pt-6 border-t border-gray-150 dark:border-gray-800 w-full justify-center">
                              <span>Lumen Workspace</span>
                              <span>•</span>
                              <span>{new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        )}

                        {htmlTemplate === "pitch" && (
                          <div className="w-full max-w-2xl bg-[#FCFAF2] text-[#2C2A21] border-2 border-[#D4CBB3] rounded-2xl p-10 min-h-[450px] shadow-sm flex flex-col justify-between font-serif select-text">
                            <div className="space-y-6">
                              <div className="flex items-center justify-between border-b-2 border-[#D4CBB3] pb-3 text-xs uppercase font-bold tracking-wider opacity-60">
                                <span>Note: {activeNote.title}</span>
                                <span>{activeNote.folder || "Draft"}</span>
                              </div>
                              <h2 className="text-2xl font-bold tracking-normal italic text-gray-900 mt-2">
                                {activeNote.title || "Untitled Proposal"}
                              </h2>
                              <div 
                                className="text-sm leading-relaxed text-gray-800 font-serif"
                                dangerouslySetInnerHTML={{
                                  __html: parseMarkdown(activeNote.content),
                                }}
                              />
                            </div>
                            <div className="pt-8 border-t border-[#D4CBB3]/50 text-[10px] font-mono uppercase tracking-widest text-[#7C7563] flex justify-between">
                              <span>Confidential Document</span>
                              <span>{new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        )}

                        {htmlTemplate === "cyberpunk" && (
                          <div className="w-full max-w-2xl bg-black border-2 border-[#00f3ff] shadow-[0_0_20px_rgba(0,243,255,0.2)] rounded-lg p-8 min-h-[450px] flex flex-col justify-between font-mono relative overflow-hidden select-text">
                            <div className="absolute top-0 right-0 p-1 text-[8px] text-[#00f3ff] border-l border-b border-[#00f3ff] bg-[#00f3ff]/10">
                              HUD_V.1.08
                            </div>
                            <div className="space-y-6">
                              <div className="flex items-center gap-2 text-[10px] text-[#00f3ff] uppercase font-bold">
                                <span className="inline-block w-2.5 h-2.5 bg-[#00f3ff] animate-ping shrink-0" />
                                <span>Note Database://{activeNote.title?.toUpperCase().replace(/\s+/g, "_") || "NULL"}</span>
                              </div>
                              <h2 className="text-2xl font-black text-white uppercase tracking-wider border-b border-[#00f3ff]/30 pb-4">
                                {activeNote.title || "UNTITLED_STORM"}
                              </h2>
                              <div 
                                className="text-xs text-green-400 space-y-2 leading-relaxed"
                                dangerouslySetInnerHTML={{
                                  __html: parseMarkdown(activeNote.content),
                                }}
                              />
                            </div>
                            <div className="pt-6 text-[9px] text-[#00f3ff]/60 border-t border-[#00f3ff]/20 flex justify-between">
                              <span>STALKER CORE TERMINAL</span>
                              <span>SYS_TIME: {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mode 3: Interactive Slides Slide deck */}
                    {previewMode === "presentation" && (
                      <div 
                        className="flex-1 p-8 flex flex-col justify-center items-center min-h-[450px]"
                        style={{ fontSize: `${previewZoom}%`, transition: 'font-size 150ms ease-in-out' }}
                      >
                        {/* Slide Aspect Screen Card */}
                        <div 
                          className={`w-full max-w-2xl aspect-[16/10] rounded-2xl border flex flex-col justify-between p-10 relative overflow-hidden shadow-2xl transition-all duration-300 ${
                            presentationStyle === "standard"
                              ? "bg-white border-gray-200 text-gray-800 shadow-gray-250/50"
                              : presentationStyle === "dark"
                                ? "bg-[#111111] border-gray-800 text-gray-100 shadow-neutral-950"
                                : presentationStyle === "retro"
                                  ? "bg-[#FFEAD2] border-black text-black border-2 font-mono shadow-neutral-950"
                                  : "bg-gradient-to-br from-[#111827] via-[#0f172a] to-[#1e1e38] border-[#312e81]/30 text-teal-100 shadow-neutral-950"
                          }`}
                        >
                          {/* Slide Header logo indicator */}
                          <div className="flex items-center justify-between text-xs font-semibold opacity-60">
                            <span className="uppercase tracking-widest font-bold">
                              {activeNote.title || "Pitch Slide Deck"}
                            </span>
                            <span className="font-mono">
                              {currentSlideIndex + 1} / {slides.length}
                            </span>
                          </div>

                          {/* Presenter Content Box */}
                          <div className="my-auto flex flex-col justify-center py-6 text-center select-text">
                            <div 
                              className={`prose ${presentationStyle === "dark" || presentationStyle === "teal" ? "dark:prose-invert" : ""} text-center font-sans max-w-none text-base max-h-56 overflow-y-auto no-scrollbar`}
                              dangerouslySetInnerHTML={{
                                __html: parseMarkdown(slides[currentSlideIndex]),
                              }}
                            />
                          </div>

                          {/* Progress Line */}
                          <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-300" style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }} />

                          {/* Navigation Buttons inside slide footer */}
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100/10 z-10">
                            <button
                              onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                              disabled={currentSlideIndex === 0}
                              className="px-3 py-1 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-gray-700 dark:text-gray-300"
                            >
                              ← Prev
                            </button>
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-40">
                              (Use Arrow Keys)
                            </span>
                            <button
                              onClick={() => setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                              disabled={currentSlideIndex === slides.length - 1}
                              className="px-3 py-1 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-gray-700 dark:text-gray-300"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mode 4: Bento Infographics Layout */}
                    {previewMode === "infographic" && (
                      <div 
                        className="flex-1 p-8 overflow-y-auto"
                        style={{ fontSize: `${previewZoom}%`, transition: 'font-size 150ms ease-in-out' }}
                      >
                        <div className="max-w-4xl mx-auto space-y-6">
                          {/* Banner Header */}
                          <div className="p-8 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xl relative overflow-hidden flex flex-col justify-end min-h-[160px]">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-3xl rounded-full" />
                            <span className="text-[10px] tracking-widest uppercase font-mono font-extrabold text-teal-100 mb-2">Workspace Bento Infographic</span>
                            <h1 className="text-3xl font-black tracking-tight">{activeNote.title || "Graphic Note Template"}</h1>
                            <p className="text-sm text-teal-50 font-medium mt-1">Automatically compiled from markdown segments.</p>
                          </div>

                          {/* Render beautiful grid cards */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {parsedSections.map((sect, i) => (
                              <div 
                                key={i}
                                className={`p-6 rounded-2xl border transition-all hover:scale-[1.01] hover:shadow-lg flex flex-col justify-between ${
                                  sect.type === 'stats'
                                    ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-[#132c1e] dark:to-[#081810] border-emerald-500/20 col-span-1 md:col-span-2 text-center py-10"
                                    : sect.type === 'code'
                                      ? "bg-[#161616] border-gray-800 text-gray-300 col-span-1"
                                      : "bg-white dark:bg-[#181818] border-gray-150 dark:border-[#222] text-gray-800 dark:text-gray-200 col-span-1"
                                }`}
                              >
                                <div>
                                  <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide border-b border-gray-100 dark:border-neutral-800 pb-2 mb-3">
                                    {sect.title}
                                  </h3>

                                  {/* Stats Layout */}
                                  {sect.type === 'stats' && sect.stats && (
                                    <div className="flex flex-wrap items-center justify-center gap-12 py-4">
                                      {sect.stats.map((stat, idx) => (
                                        <div key={idx} className="flex flex-col items-center">
                                          <span className="text-4xl md:text-5xl font-black text-emerald-500 tracking-tight select-none">
                                            {stat.num}
                                          </span>
                                          <span className="text-xs uppercase font-extrabold tracking-wider text-gray-500 dark:text-gray-400 mt-1.5">
                                            {stat.label}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Paragraph list-items */}
                                  {sect.paragraphs.length > 0 && (
                                    <div className="space-y-2 text-sm leading-relaxed opacity-90 mb-4 select-text">
                                      {sect.paragraphs.map((p, idx) => <p key={idx}>{p}</p>)}
                                    </div>
                                  )}

                                  {/* Bullet Lists items */}
                                  {sect.list_items.length > 0 && (
                                    <ul className="space-y-1.5 my-3 text-sm">
                                      {sect.list_items.map((item, idx) => (
                                        <li key={idx} className="flex items-start gap-2 select-text">
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                          <span className="opacity-95">{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            ))}

                            {/* Standard fallback card if content is too short */}
                            {parsedSections.length === 0 && (
                              <div className="p-6 rounded-2xl border border-dashed border-gray-300 dark:border-[#333] col-span-2 text-center text-gray-500 py-12">
                                Write headers (# Name) and key metrics (e.g., "99% Active") to populate interactive bento elements.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
            <h3 className="text-lg font-semibold text-gray-901 dark:text-white mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <span>Delete Multiple Notes</span>
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Are you sure you want to delete the <strong className="text-gray-950 dark:text-white font-extrabold">{selectedTotalCount}</strong> selected note(s)? This action cannot be undone.
            </p>
            
            {Object.keys(excludedFolders).filter(f => excludedFolders[f]).length > 0 && (
              <div className="text-xs bg-amber-500/10 text-amber-720 dark:text-amber-300 border border-amber-500/20 p-3 rounded-lg mb-6 leading-relaxed flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold mb-0.5">Note Guard Active</strong>
                  <span>The following folders are excluded/guarded: <strong className="font-bold opacity-90">{Object.keys(excludedFolders).filter(f => excludedFolders[f]).join(", ")}</strong>. Their contents will be untouched.</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-[#222] pt-4">
              <Button variant="ghost" className="h-9" onClick={() => setShowBulkDeleteModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={confirmBulkDelete}
                className="h-9 bg-red-600 hover:bg-red-700 dark:bg-red-650 dark:hover:bg-red-600 text-white shadow-sm border-transparent"
              >
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT-CLICK CONTEXT MENU OVERLAY */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-48 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md border border-gray-200 dark:border-[#2A2A2A] rounded-lg shadow-xl py-1 text-sm animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-[#222]">
            Move to Folder
          </div>
          
          <div className="py-1">
            {/* Create Folder option */}
            <button
              onClick={() => {
                const newFolder = prompt("Enter name for the new folder:");
                if (newFolder && newFolder.trim()) {
                  updateNote(contextMenu.noteId, { folder: newFolder.trim() });
                }
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-emerald-500" />
              <span>＋ Create New Folder...</span>
            </button>

            <div className="h-px bg-gray-100 dark:bg-[#222] my-1" />

            {/* Unassigned Option */}
            <button
              onClick={() => {
                updateNote(contextMenu.noteId, { folder: undefined });
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-[#1c1c1c] text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer"
            >
              <File className="w-3.5 h-3.5 text-gray-400" />
              <span>Make Floating (No Folder)</span>
            </button>

            {/* Folder list */}
            {Object.keys(groupedNotes.folders).sort().map((folderName) => {
              const note = notes.find(n => n.id === contextMenu.noteId);
              const isCurrent = note?.folder === folderName;

              return (
                <button
                  key={folderName}
                  onClick={() => {
                    updateNote(contextMenu.noteId, { folder: folderName });
                    setContextMenu(null);
                  }}
                  disabled={isCurrent}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer ${
                    isCurrent 
                      ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-bold opacity-60 pointer-events-none" 
                      : "hover:bg-gray-100 dark:hover:bg-[#1c1c1c] text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Folder className="w-3.5 h-3.5 text-blue-550 shrink-0" />
                    <span className="truncate">{folderName}</span>
                  </span>
                  {isCurrent && <span className="text-[9px] font-bold text-emerald-500">Current</span>}
                </button>
              );
            })}
          </div>

          <div className="h-px bg-gray-100 dark:bg-[#222] my-1" />

          {/* Quick actions rename / delete */}
          <div className="py-1 border-t border-gray-100 dark:border-[#222]/50">
            <button
              onClick={() => {
                handleRenameClick(contextMenu.noteId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-[#1c1c1c] text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Rename Note</span>
            </button>
            <button
              onClick={() => {
                handleDeleteClick(contextMenu.noteId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/10 text-red-650 dark:text-red-400 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Delete Note</span>
            </button>
          </div>
        </div>
      )}

      {/* FULLSCREEN PRESENTATION DECK MODAL */}
      {isPresentationFullscreen && activeNote && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950 text-white select-none transition-opacity duration-300 animate-in fade-in">
          {/* Header bar */}
          <div className="flex items-center justify-between p-4 bg-black/40 backdrop-blur-md border-b border-white/5 select-none">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 text-sm font-bold tracking-widest uppercase bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                Presenter Mode
              </span>
              <span className="text-gray-300 font-semibold font-sans text-sm truncate max-w-sm">
                {activeNote.title || "Pitch Slide Deck"}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono">
                Slide {currentSlideIndex + 1} of {slides.length}
              </span>
              <button
                onClick={() => setIsPresentationFullscreen(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all cursor-pointer text-gray-300 hover:text-white"
              >
                Exit Fullscreen (Esc)
              </button>
            </div>
          </div>

          {/* Slide Deck Screen */}
          <div className="flex-1 flex flex-col justify-center items-center p-8 select-text">
            <div 
              className={`w-full max-w-5xl aspect-[16/10] rounded-3xl border flex flex-col justify-between p-16 shadow-2xl relative overflow-hidden transition-all duration-300 ${
                presentationStyle === "standard"
                  ? "bg-white border-gray-200 text-gray-800"
                  : presentationStyle === "dark"
                    ? "bg-[#111111] border-gray-800 text-gray-100"
                    : presentationStyle === "retro"
                      ? "bg-[#FFEAD2] border-black text-black border-2 font-mono"
                      : "bg-gradient-to-br from-[#111827] via-[#0f172a] to-[#1e1e38] border-[#312e81]/30 text-teal-100"
              }`}
              style={{ fontSize: `${previewZoom + 40}%` }}
            >
              {/* Top Banner layout */}
              <div className="flex items-center justify-between text-xs font-bold opacity-40">
                <span>{activeNote.title}</span>
                <span>{currentSlideIndex + 1} / {slides.length}</span>
              </div>

              {/* Main Presenter content block */}
              <div className="my-auto flex flex-col justify-center py-8 text-center">
                <div 
                  className={`prose ${presentationStyle === "dark" || presentationStyle === "teal" ? "dark:prose-invert" : ""} text-center font-sans max-w-none text-xl max-h-[420px] overflow-y-auto no-scrollbar`}
                  dangerouslySetInnerHTML={{
                    __html: parseMarkdown(slides[currentSlideIndex]),
                  }}
                />
              </div>

              {/* Navigation help description */}
              <div className="flex items-center justify-between text-xs opacity-50 border-t border-white/5 pt-4">
                <button
                  onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentSlideIndex === 0}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-all disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-gray-350 hover:text-white"
                >
                  ← Previous Slide
                </button>
                <span className="font-mono text-[10px] uppercase">
                  (Press space or arrow keys to navigate)
                </span>
                <button
                  onClick={() => setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                  disabled={currentSlideIndex === slides.length - 1}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-bold transition-all disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-gray-350 hover:text-white"
                >
                  Next Slide →
                </button>
              </div>
            </div>
          </div>

          {/* Progress bar line */}
          <div className="h-1.5 bg-[#222] w-full">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${((currentSlideIndex + 1)/slides.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// FIX: Added the 'App' wrapper component definition which was missing.
// This ensures that the context providers correctly wrap the application.
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: string|null}> {
  constructor(props: any) { super(props); this.state = {error: null}; }
  static getDerivedStateFromError(e: any) { return {error: String(e)}; }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,fontFamily:'monospace',background:'#fff',color:'red',whiteSpace:'pre-wrap'}}>
        <b>App crashed:</b>{'\n'}{this.state.error}
      </div>
    );
    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AIProvider>
          <NotesProvider>
            <EditorWorkspace />
          </NotesProvider>
        </AIProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
