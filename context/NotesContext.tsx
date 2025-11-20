
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Note } from '../types';

interface NotesContextType {
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string) => void;
  addNote: () => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  activeNote: Note | undefined;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useLocalStorage<Note[]>('lumen-notes', []);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Initialize with a welcome note if empty
  useEffect(() => {
    if (notes.length === 0) {
      const newNote: Note = {
        id: crypto.randomUUID(),
        title: 'Welcome to Lumen Notes',
        content: 'Start typing here to capture your thoughts.\n\nUse the toolbar above to format text or use AI tools to summarize and improve your writing.',
        updatedAt: Date.now(),
      };
      setNotes([newNote]);
      setActiveNoteId(newNote.id);
    } else if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      updatedAt: Date.now(),
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prevNotes => prevNotes.map(note => 
      note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note
    ));
  };

  const deleteNote = (id: string) => {
    const newNotes = notes.filter(n => n.id !== id);
    setNotes(newNotes);
    if (activeNoteId === id) {
      setActiveNoteId(newNotes.length > 0 ? newNotes[0].id : null);
    }
  };

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <NotesContext.Provider value={{ notes, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote, activeNote }}>
      {children}
    </NotesContext.Provider>
  );
};

export const useNotes = () => {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within NotesProvider');
  }
  return context;
};
