import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCw, Volume2, Mic, Clock, Calendar, Check, Save, Copy, Download } from 'lucide-react';
import { Note } from '../types';
import { Button } from './ui/Button';

interface VoiceMemoPlayerProps {
  note: Note;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
}

export const VoiceMemoPlayer: React.FC<VoiceMemoPlayerProps> = ({ note, onUpdateNote }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(note.duration || 0);
  const [volume, setVolume] = useState(1);
  const [transcript, setTranscript] = useState(note.content || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Sync transcript when active note changes
  useEffect(() => {
    setTranscript(note.content || '');
    setIsEditing(false);
    setIsSaved(false);
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [note]);

  // Handle Playback Setup
  useEffect(() => {
    if (note.audioData) {
      const audio = new Audio(note.audioData);
      audioRef.current = audio;

      const handleLoadedMetadata = () => {
        setDuration(audio.duration || note.duration || 0);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.pause();
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    } else {
      audioRef.current = null;
    }
  }, [note.audioData]);

  // Synchronize audio volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Bouncing levels visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let barsCount = 35;
    let waveHeights = Array.from({ length: barsCount }, () => Math.random() * 20 + 5);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / barsCount - 3;

      for (let i = 0; i < barsCount; i++) {
        // Animate based on playback state
        let factor = 1;
        if (isPlaying) {
          factor = Math.sin(Date.now() * 0.005 + i * 0.5) * 0.6 + 0.8;
        } else {
          factor = 0.3; // Static idle state
        }

        const barHeight = waveHeights[i] * factor;
        const x = i * (barWidth + 3);
        const y = (height - barHeight) / 2;

        const isPlayedRange = (i / barsCount) < (currentTime / (duration || 1));

        ctx.fillStyle = isPlayedRange 
          ? 'rgba(16, 185, 129, 0.85)' // Emerald active
          : 'rgba(156, 163, 175, 0.35)'; // Gray inactive

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, currentTime, duration]);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error(e));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
    setCurrentTime(val);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveTranscript = () => {
    onUpdateNote(note.id, { content: transcript });
    setIsEditing(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleDownloadAudio = () => {
    if (!note.audioData) return;
    
    let extension = 'm4a';
    const match = note.audioData.match(/^data:audio\/(\w+);base64,/);
    if (match && match[1]) {
      const mime = match[1].toLowerCase();
      if (mime === 'webm' || mime === 'ogg' || mime === 'mp4' || mime === 'aac' || mime === 'm4a') {
        extension = 'm4a';
      } else {
        extension = mime;
      }
    }
    
    const link = document.createElement('a');
    link.href = note.audioData;
    const sanitizedTitle = (note.title || 'voice-memo').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `${sanitizedTitle}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyTranscript = () => {
    if (!note.content) return;
    navigator.clipboard.writeText(note.content)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(err => console.error("Could not copy transcript: ", err));
  };

  const handleDownloadTranscript = () => {
    if (!note.content) return;
    const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = (note.title || 'voice-memo-transcript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `${sanitizedTitle}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-gray-50/50 dark:bg-[#0c0c0c] p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        
        {/* Card Header for Voice Memo Details */}
        <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-[#222] rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
                <Mic className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block">Voice Recording</span>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white mt-0.5">{note.title}</h1>
              </div>
            </div>

            <div className="flex flex-col items-end text-xs text-gray-400 font-mono">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(note.updatedAt).toLocaleDateString()}</span>
              <span className="flex items-center gap-1 mt-1"><Clock className="w-3.5 h-3.5" /> {formatTime(duration)} duration</span>
            </div>
          </div>

          {/* Canvas Waveform Visualizer & Slider Tracker */}
          <div className="bg-gray-900 dark:bg-black rounded-xl p-4 flex flex-col items-center justify-center relative shadow-inner overflow-hidden border border-gray-200 dark:border-[#222]">
            <canvas 
              ref={canvasRef} 
              width={650} 
              height={80} 
              className="w-full max-w-[650px] h-20"
            />
            
            {/* Playback time overlays */}
            <div className="w-full flex justify-between px-2 text-[10px] text-gray-400 font-mono mt-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            
            {/* Range Slider for Scrubbing */}
            <input 
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              disabled={!note.audioData}
              className="w-full accent-emerald-500 h-1 bg-gray-700/50 rounded-lg appearance-none cursor-pointer mt-1"
            />
          </div>

          {/* Audio controls block */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <Button 
                onClick={togglePlayback}
                disabled={!note.audioData}
                className="rounded-full w-12 h-12 flex items-center justify-center p-0 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 border-none text-white shadow-md shadow-emerald-500/15"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </Button>

              <button 
                onClick={() => { if (audioRef.current) audioRef.current.currentTime = 0; setCurrentTime(0); }}
                className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-[#1c1c1c] dark:hover:bg-[#2a2a2a] rounded-full text-gray-600 dark:text-gray-300 transition-colors mr-1"
                title="Restart"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {note.audioData && (
                <Button 
                  onClick={handleDownloadAudio}
                  variant="secondary"
                  size="sm"
                  className="h-9 text-xs px-3 bg-gray-100 hover:bg-gray-200 dark:bg-[#1c1c1c] dark:hover:bg-[#2a2a2a] rounded-full border-none flex items-center gap-1.5 font-medium cursor-pointer"
                  title="Download raw audio file"
                >
                  <Download className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> Download Audio
                </Button>
              )}
            </div>

            {/* Volume control */}
            <div className="flex items-center gap-2 text-gray-500">
              <Volume2 className="w-4 h-4 shrink-0" />
              <input 
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 accent-emerald-500 h-1 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Transcription Area */}
        <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-[#222] rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#222] pb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Mic className="w-4 h-4 text-emerald-500" /> AI Transcription Content
            </h2>

            <div className="flex items-center gap-2">
              {isCopied && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mr-1 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" /> Copied!
                </span>
              )}
              {isSaved && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              {!isEditing && note.content && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCopyTranscript}
                    className="h-8 text-xs flex items-center gap-1 hover:text-emerald-550 dark:hover:text-emerald-400 cursor-pointer"
                    title="Copy transcript to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-500" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDownloadTranscript}
                    className="h-8 text-xs flex items-center gap-1 hover:text-emerald-550 dark:hover:text-emerald-400 cursor-pointer"
                    title="Download transcript as document"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-500" /> Download Transcript
                  </Button>
                </>
              )}
              {isEditing ? (
                <Button 
                  size="sm" 
                  onClick={handleSaveTranscript}
                  className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 h-8 text-xs text-white"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => setIsEditing(true)}
                  className="h-8 text-xs"
                >
                  Edit Text
                </Button>
              )}
            </div>
          </div>

          {/* Textarea or Text Display */}
          {isEditing ? (
            <textarea
              className="w-full h-80 bg-gray-50 dark:bg-[#161616] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-4 font-mono text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent resize-none leading-relaxed custom-scrollbar"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          ) : (
            <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed min-h-[150px] whitespace-pre-wrap font-sans">
              {note.content || <em className="text-gray-400">Transcribing or empty memo...</em>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
