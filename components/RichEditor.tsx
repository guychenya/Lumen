
import React, { useRef, useEffect, useState } from 'react';
import { markdownToHtml } from '../services/converter';

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelect: () => void;
  placeholder?: string;
  className?: string;
  editorRef: React.RefObject<HTMLDivElement>;
}

export const RichEditor: React.FC<Props> = ({ 
  initialContent, 
  onChange, 
  onKeyDown, 
  onSelect,
  placeholder,
  className,
  editorRef
}) => {
  const [isEmpty, setIsEmpty] = useState(!initialContent);
  const isInitialized = useRef(false);

  useEffect(() => {
    // Only update content if it's a new note or first load
    // This prevents cursor jumping issues during typing
    if (editorRef.current && (!isInitialized.current || initialContent !== editorRef.current.innerHTML)) {
      // Heuristic: If it looks like HTML, use it. If it looks like MD (starts with # or -), parse it.
      // For simplicity in this migration, we check if it has HTML tags.
      const hasTags = /<\/?[a-z][\s\S]*>/i.test(initialContent);
      
      if (hasTags || !initialContent) {
        editorRef.current.innerHTML = initialContent;
      } else {
        // Legacy markdown content detected, convert to HTML for editor
        editorRef.current.innerHTML = markdownToHtml(initialContent);
      }
      
      setIsEmpty(!editorRef.current.textContent?.trim());
      isInitialized.current = true;
    }
  }, [initialContent]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    onChange(html);
    setIsEmpty(!e.currentTarget.textContent?.trim());
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Prevent default paste to avoid bringing in external styles (like white backgrounds)
    e.preventDefault();
    // Get plain text
    const text = e.clipboardData.getData('text/plain');
    // Insert text at cursor position which inherits current styling
    document.execCommand('insertText', false, text);
  };

  return (
    <div className="relative group">
      {isEmpty && (
        <div className="absolute top-0 left-0 text-gray-600 pointer-events-none font-light text-lg">
          {placeholder || "Start typing..."}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        onMouseUp={onSelect}
        onPaste={handlePaste}
        className={`outline-none min-h-[50vh] prose prose-invert max-w-none 
          prose-headings:font-bold prose-headings:text-emerald-500 
          prose-p:text-gray-300 prose-p:leading-relaxed
          prose-a:text-blue-400 prose-img:rounded-xl prose-img:shadow-lg
          prose-blockquote:border-l-emerald-500 prose-blockquote:bg-[#1A1A1A]
          prose-code:text-emerald-300 prose-code:bg-[#222] prose-code:rounded prose-code:px-1
          ${className}`}
      />
    </div>
  );
};
