
import React, { useEffect, useState, useRef } from 'react';
import { Bold, Italic, Sparkles, PenLine } from 'lucide-react';

interface Props {
  editorRef: React.RefObject<HTMLDivElement>; // Changed from textareaRef
  onFormat: (command: string, value?: string) => void;
  onAI: (promptPrefix: string) => void;
}

export const FloatingToolbar: React.FC<Props> = ({ editorRef, onFormat, onAI }) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setIsVisible(false);
      return;
    }

    // Ensure selection is inside our editor
    if (editorRef.current && !editorRef.current.contains(selection.anchorNode)) {
        setIsVisible(false);
        return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Absolute positioning relative to document
    setPosition({
      top: rect.top + window.scrollY - 50,
      left: rect.left + window.scrollX + (rect.width / 2) - 100 // Center align
    });
    setIsVisible(true);
  };

  useEffect(() => {
    document.addEventListener('selectionchange', updatePosition);
    return () => document.removeEventListener('selectionchange', updatePosition);
  }, []);

  if (!isVisible || !position) return null;

  return (
    <div 
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1 bg-[#1C1C1C] border border-[#333] rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-200"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
    >
      <button onClick={() => onFormat('bold')} className="p-2 text-gray-300 hover:text-white hover:bg-[#333] rounded" title="Bold">
        <Bold className="w-4 h-4" />
      </button>
      <button onClick={() => onFormat('italic')} className="p-2 text-gray-300 hover:text-white hover:bg-[#333] rounded" title="Italic">
        <Italic className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-[#444] mx-1" />
      <button onClick={() => onAI("Summarize this selection")} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 rounded">
        <Sparkles className="w-3 h-3" /> Summarize
      </button>
      <button onClick={() => onAI("Improve this writing")} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 rounded">
        <PenLine className="w-3 h-3" /> Improve
      </button>
    </div>
  );
};
