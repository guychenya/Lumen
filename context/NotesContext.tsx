

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
  importNote: (title: string, content: string) => void;
  activeNote: Note | undefined;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export const NotesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useLocalStorage<Note[]>('lumen-notes', []);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Initialize with a welcome note if empty, or select the first note on load.
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
    } else if (!activeNoteId) {
      // On initial load, ensure notes are sorted and set the first one as active.
      const sortedNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
      setNotes(sortedNotes);
      setActiveNoteId(sortedNotes[0].id);
    }
    // This effect should only run once on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // This effect ensures the activeNoteId is always valid after any change to the notes list.
  useEffect(() => {
    const activeNoteExists = notes.some(note => note.id === activeNoteId);

    if (activeNoteId && !activeNoteExists) {
      // The active note was deleted, so select the new most recent note.
      setActiveNoteId(notes.length > 0 ? notes[0].id : null);
    } else if (!activeNoteId && notes.length > 0) {
      // If no note is active, select the most recent one.
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId]);


  const addNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      updatedAt: Date.now(),
    };
    // Add the new note to the top of the list and make it active.
    setNotes(prevNotes => [newNote, ...prevNotes]);
    setActiveNoteId(newNote.id);
  };
  
  const importNote = (title: string, content: string) => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title,
      content,
      updatedAt: Date.now(),
    };
    setNotes(prevNotes => [newNote, ...prevNotes]);
    setActiveNoteId(newNote.id);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prevNotes => {
        const noteToUpdate = prevNotes.find(note => note.id === id);
        if (!noteToUpdate) return prevNotes;
        
        const updatedNote = { ...noteToUpdate, ...updates, updatedAt: Date.now() };
        
        // Move updated note to the top of the list
        const otherNotes = prevNotes.filter(note => note.id !== id);
        return [updatedNote, ...otherNotes];
    });
  };

  const deleteNote = (id: string) => {
    // Simply remove the note. The useEffect will handle updating the active ID.
    setNotes(prevNotes => prevNotes.filter(n => n.id !== id));
  };

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <NotesContext.Provider value={{ notes, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote, importNote, activeNote }}>
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
