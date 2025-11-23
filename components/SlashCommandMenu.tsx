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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % commands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + commands.length) % commands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(commands[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Ensure menu doesn't go off screen
  const menuStyle: React.CSSProperties = {
    top: position.top,
    left: position.left,
    maxHeight: '300px'
  };

  // Adjust if too close to bottom (simplified)
  if (position.top > window.innerHeight - 300) {
      menuStyle.top = 'auto';
      menuStyle.bottom = window.innerHeight - position.top + 20;
  }

  return (
    <div 
      className="fixed z-[9999] w-72 bg-[#1C1C1C] border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
      style={menuStyle}
    >
      <div className="px-3 py-2 border-b border-[#2A2A2A] bg-[#161616] text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
        <span>Insert Block</span>
        <span className="text-[10px] bg-[#222] px-1.5 rounded border border-[#333]">ESC to close</span>
      </div>
      <div className="overflow-y-auto flex-1 p-1 custom-scrollbar" ref={menuRef} style={{ maxHeight: '280px' }}>
        {commands.map((cmd, index) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              index === selectedIndex 
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/20' 
                : 'text-gray-300 hover:bg-[#2A2A2A] border border-transparent'
            }`}
          >
            <div className={`p-1.5 rounded-md ${index === selectedIndex ? 'bg-emerald-600 text-white' : 'bg-[#222] text-gray-400'}`}>
                <cmd.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{cmd.label}</div>
              <div className={`text-xs truncate ${index === selectedIndex ? 'text-emerald-400/70' : 'text-gray-500'}`}>
                {cmd.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};