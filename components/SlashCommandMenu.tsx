
import React, { useEffect, useRef, useState } from 'react';
import { 
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, 
  ImageIcon, Table, Quote, Code, Minus, Palette, Video, Type
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  action: () => void; // Simplified for execCommand
}

interface Props {
  isOpen: boolean;
  position: { top: number; left: number };
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

const execute = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
};

const insertHtml = (html: string) => {
    document.execCommand('insertHTML', false, html);
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    icon: Heading1,
    description: 'Big section heading',
    action: () => execute('formatBlock', 'H1')
  },
  {
    id: 'h2',
    label: 'Heading 2',
    icon: Heading2,
    description: 'Medium section heading',
    action: () => execute('formatBlock', 'H2')
  },
  {
    id: 'text',
    label: 'Paragraph',
    icon: Type,
    description: 'Standard text',
    action: () => execute('formatBlock', 'P')
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    icon: List,
    description: 'Create a simple bulleted list',
    action: () => execute('insertUnorderedList')
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    icon: ListOrdered,
    description: 'Create a numbered list',
    action: () => execute('insertOrderedList')
  },
  {
    id: 'table',
    label: 'Table',
    icon: Table,
    description: 'Add a simple 2x2 table',
    action: () => insertHtml('<table class="border-collapse w-full my-4"><thead><tr><th class="border border-gray-700 p-2 bg-gray-800">Header 1</th><th class="border border-gray-700 p-2 bg-gray-800">Header 2</th></tr></thead><tbody><tr><td class="border border-gray-700 p-2">Cell 1</td><td class="border border-gray-700 p-2">Cell 2</td></tr></tbody></table><p><br/></p>')
  },
  {
    id: 'image',
    label: 'Image (URL)',
    icon: ImageIcon,
    description: 'Embed an image via URL',
    action: () => {
        const url = prompt("Enter Image URL:");
        if(url) execute('insertImage', url);
    }
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: Quote,
    description: 'Capture a quote',
    action: () => {
        // Blockquote execCommand is tricky, insertHTML is safer
        insertHtml('<blockquote class="border-l-4 border-emerald-500 pl-4 italic my-4 bg-gray-800/50 py-2">Quote here</blockquote><p><br/></p>');
    }
  },
  {
    id: 'code',
    label: 'Code Block',
    icon: Code,
    description: 'Capture a code snippet',
    action: () => insertHtml('<pre class="bg-gray-900 p-4 rounded border border-gray-700 font-mono text-sm text-gray-300 my-4"><code>// Code here</code></pre><p><br/></p>')
  },
  {
    id: 'divider',
    label: 'Divider',
    icon: Minus,
    description: 'Visually divide blocks',
    action: () => execute('insertHorizontalRule')
  }
];

export const SlashCommandMenu: React.FC<Props> = ({ isOpen, position, onSelect, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % SLASH_COMMANDS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(SLASH_COMMANDS[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const selectedElement = menuRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed z-50 w-72 bg-[#1C1C1C] border border-[#333] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[300px] animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.top + 24, left: position.left }}
    >
      <div className="px-3 py-2 border-b border-[#2A2A2A] bg-[#161616] text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Insert Block
      </div>
      <div className="overflow-y-auto flex-1 p-1" ref={menuRef}>
        {SLASH_COMMANDS.map((cmd, index) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
              index === selectedIndex 
                ? 'bg-emerald-600 text-white' 
                : 'text-gray-300 hover:bg-[#2A2A2A]'
            }`}
          >
            <cmd.icon className={`w-4 h-4 ${index === selectedIndex ? 'text-white' : 'text-gray-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{cmd.label}</div>
              <div className={`text-xs truncate ${index === selectedIndex ? 'text-emerald-100' : 'text-gray-500'}`}>
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
