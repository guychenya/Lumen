import React, { useEffect, useRef, useState } from 'react';

export interface SlashCommand {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  position: { top: number; left: number };
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export const SlashCommandMenu: React.FC<Props> = ({ isOpen, position, commands, onSelect, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen]);

  // FIX: Added a click-outside handler to ensure the menu closes properly.
  // This prevents a bug where the menu state could get stuck as "open",
  // which would block the "Enter" key in the main editor.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % commands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + commands.length) % commands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(commands[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, selectedIndex, onSelect, onClose, commands]);

  useEffect(() => {
    if (menuRef.current) {
      const selectedElement = menuRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  // Calculate position to keep in viewport
  const MENU_WIDTH = 300;
  const MENU_HEIGHT = 320; 
  const PADDING = 16;
  
  let top = position.top;
  let left = position.left;
  let origin = 'top';

  // Horizontal clamping
  if (left + MENU_WIDTH > window.innerWidth - PADDING) {
    left = window.innerWidth - MENU_WIDTH - PADDING;
  }
  if (left < PADDING) left = PADDING;

  // Vertical flipping
  if (top + MENU_HEIGHT > window.innerHeight - PADDING) {
    top = position.top - MENU_HEIGHT - 40; 
    origin = 'bottom';
  }

  const menuStyle: React.CSSProperties = {
    top: `${top}px`,
    left: `${left}px`,
    maxHeight: `${MENU_HEIGHT}px`,
    transformOrigin: origin === 'bottom' ? 'bottom left' : 'top left'
  };

  return (
    <div 
      ref={menuRef}
      className="fixed z-[99999] w-[300px] bg-white dark:bg-[#1C1C1C] border border-gray-200 dark:border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
      style={menuStyle}
    >
      <div className="px-3 py-2 border-b border-gray-200 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#161616] text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider flex justify-between items-center">
        <span>Insert Block</span>
        <span className="text-[10px] bg-gray-200 dark:bg-[#222] px-1.5 rounded border border-gray-300 dark:border-[#333]">ESC to close</span>
      </div>
      <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
        {commands.map((cmd, index) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              index === selectedIndex 
                ? 'bg-emerald-50 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-600/20' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] border border-transparent'
            }`}
          >
            <div className={`p-1.5 rounded-md shrink-0 ${index === selectedIndex ? 'bg-emerald-600 text-white' : 'bg-gray-200 dark:bg-[#222] text-gray-500 dark:text-gray-400'}`}>
                <cmd.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{cmd.label}</div>
              <div className={`text-xs truncate ${index === selectedIndex ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-gray-500 dark:text-gray-500'}`}>
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};