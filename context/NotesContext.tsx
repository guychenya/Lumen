

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Note } from '../types';

function generateUUID(): string {
  if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface NotesContextType {
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  addNote: () => void;
  addVoiceMemo: (title: string, content: string, audioData?: string, duration?: number, tags?: string[]) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  deleteMultipleNotes: (ids: string[]) => void;
  importNote: (title: string, content: string, tags?: string[], folder?: string) => void;
  importMultipleNotes: (items: Array<{ title: string; content: string; tags?: string[]; folder?: string }>) => void;
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
        id: generateUUID(),
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
      id: generateUUID(),
      title: '',
      content: '',
      updatedAt: Date.now(),
      type: 'note',
    };
    // Add the new note to the top of the list and make it active.
    setNotes(prevNotes => [newNote, ...prevNotes]);
    setActiveNoteId(newNote.id);
  };

  const addVoiceMemo = (title: string, content: string, audioData?: string, duration?: number, tags?: string[]) => {
    const newMemo: Note = {
      id: generateUUID(),
      title: title || `Voice Memo - ${new Date().toLocaleDateString()}`,
      content,
      updatedAt: Date.now(),
      tags: tags || [],
      type: 'voice',
      audioData,
      duration,
    };
    setNotes(prevNotes => [newMemo, ...prevNotes]);
    setActiveNoteId(newMemo.id);
  };
  
  const importNote = (title: string, content: string, tags?: string[], folder?: string) => {
    const newNote: Note = {
      id: generateUUID(),
      title,
      content,
      updatedAt: Date.now(),
      tags: tags || [],
      type: 'note',
      folder,
    };
    setNotes(prevNotes => [newNote, ...prevNotes]);
    setActiveNoteId(newNote.id);
  };

  const importMultipleNotes = (items: Array<{ title: string; content: string; tags?: string[]; folder?: string }>) => {
    if (items.length === 0) return;
    const newNotes: Note[] = items.map(item => ({
      id: generateUUID(),
      title: item.title,
      content: item.content,
      updatedAt: Date.now(),
      tags: item.tags || [],
      type: 'note',
      folder: item.folder,
    }));
    setNotes(prevNotes => [...newNotes, ...prevNotes]);
    setActiveNoteId(newNotes[0].id);
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

  const deleteMultipleNotes = (ids: string[]) => {
    const idSet = new Set(ids);
    setNotes(prevNotes => prevNotes.filter(n => !idSet.has(n.id)));
  };

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <NotesContext.Provider value={{ notes, activeNoteId, setActiveNoteId, addNote, addVoiceMemo, updateNote, deleteNote, deleteMultipleNotes, importNote, importMultipleNotes, activeNote }}>
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
