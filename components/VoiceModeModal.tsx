import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Sparkles, X, Wand2, Play, AlertCircle } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { Button } from './ui/Button';
import { useAI } from '../context/AIContext';
import { LLMService } from '../services/llmService';
import { ChatMessage } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

type Stage = 'idle' | 'recording_content' | 'awaiting_command' | 'recording_command' | 'processing' | 'error';

export const VoiceModeModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const { config } = useAI();
  const [stage, setStage] = useState<Stage>('idle');
  const [transcript, setTranscript] = useState('');
  const [styleCommand, setStyleCommand] = useState('');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      startRecordingContent();
    } else {
      stopEverything();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const initSpeech = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setStage('error');
      setErrorMsg("Speech recognition is not supported in this browser.");
      return null;
    }
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    return recognition;
  };

  const startRecordingContent = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      
      const recognition = initSpeech();
      if (!recognition) return;

      recognition.onresult = (event: any) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        // Append new final text to existing transcript
        if (final) {
            setTranscript(prev => prev + ' ' + final);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech error", event.error);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setStage('recording_content');
    } catch (err) {
      setStage('error');
      setErrorMsg("Could not access microphone. Please allow permissions.");
    }
  };

  const startRecordingCommand = () => {
    // Stop previous instance first
    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = initSpeech();
    if (!recognition) return;

    recognition.continuous = false; // Single command
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
       const cmd = event.results[0][0].transcript;
       setStyleCommand(cmd);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setStage('recording_command');
  };

  const stopEverything = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    setMediaStream(null);
    setTranscript('');
    setStyleCommand('');
    setStage('idle');
  };

  const handleStopContent = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setStage('awaiting_command');
  };

  const handleStopCommand = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    processWithAI();
  };

  const processWithAI = async () => {
    setStage('processing');
    const service = new LLMService(config);
    
    // Default fallback if no voice command was given
    const style = styleCommand || "a comprehensive summary";

    const prompt = `
      I have recorded the following raw thoughts/notes:
      "${transcript}"

      Please rewrite this content following this style instruction: "${style}".
      Return formatted HTML (using <h2>, <p>, <ul>, <strong> etc) suitable for a note taking app.
    `;

    try {
        let result = '';
        const generator = service.streamResponse([{ role: 'user', content: prompt }]);
        for await (const chunk of generator) {
            result += chunk;
        }
        onInsert(result);
        onClose();
    } catch (e) {
        setStage('error');
        setErrorMsg("AI Processing Failed. Please check settings.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-[#111] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#222]">
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${stage === 'processing' ? 'bg-purple-500/20 animate-pulse' : 'bg-emerald-500/20'}`}>
                 {stage === 'recording_content' || stage === 'recording_command' ? <Mic className="w-5 h-5 text-emerald-400 animate-pulse" /> : <Sparkles className="w-5 h-5 text-purple-400" />}
              </div>
              <div>
                  <h2 className="text-xl font-bold text-white">Voice Mode</h2>
                  <p className="text-sm text-gray-400">
                      {stage === 'recording_content' && "Listening to your thoughts..."}
                      {stage === 'awaiting_command' && "Thoughts captured. Ready for direction."}
                      {stage === 'recording_command' && "Listening for style command..."}
                      {stage === 'processing' && "Generating cohesive summary..."}
                  </p>
              </div>
           </div>
           <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-6 h-6"/></button>
        </div>

        {/* Visualization Area */}
        <div className="relative bg-black h-48 flex items-center justify-center border-b border-[#222]">
           {stage === 'recording_content' || stage === 'recording_command' ? (
               <AudioVisualizer stream={mediaStream} isListening={true} />
           ) : (
               <div className="text-gray-600 flex flex-col items-center">
                   {stage === 'processing' ? <Wand2 className="w-12 h-12 animate-spin text-purple-500 mb-2" /> : <div className="w-full h-1 bg-emerald-900/30 w-64 rounded"/>}
               </div>
           )}
           
           {/* Stage Indicator Overlay */}
           <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${stage === 'recording_content' ? 'bg-emerald-500' : 'bg-gray-700'}`} />
              <div className={`w-2 h-2 rounded-full transition-colors ${stage === 'recording_command' ? 'bg-emerald-500' : 'bg-gray-700'}`} />
              <div className={`w-2 h-2 rounded-full transition-colors ${stage === 'processing' ? 'bg-purple-500' : 'bg-gray-700'}`} />
           </div>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-6">
            
            {/* Raw Transcript */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raw Input</label>
                <div className="p-4 bg-[#1A1A1A] rounded-xl border border-[#333] min-h-[100px] max-h-[200px] overflow-y-auto text-gray-300 leading-relaxed text-lg">
                    {transcript || <span className="text-gray-600 italic">Start speaking...</span>}
                </div>
            </div>

            {/* Command Input (Only shows after stopping content) */}
            {stage !== 'recording_content' && stage !== 'idle' && (
                <div className="space-y-2 animate-in slide-in-from-bottom-4">
                    <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                        <Wand2 className="w-3 h-3" /> Style Instruction
                    </label>
                    <div className="flex gap-2">
                        <div className="flex-1 p-3 bg-[#1A1A1A] rounded-lg border border-purple-900/30 text-purple-200">
                            {styleCommand || <span className="text-gray-600 italic">e.g., "Summarize as a bulleted list", "Make it a blog post"</span>}
                        </div>
                        {stage === 'awaiting_command' && (
                             <Button onClick={startRecordingCommand} className="bg-emerald-600 hover:bg-emerald-500">
                                <Mic className="w-4 h-4 mr-2" /> Speak Style
                             </Button>
                        )}
                        {stage === 'recording_command' && (
                             <Button onClick={handleStopCommand} className="bg-red-600 hover:bg-red-500 animate-pulse">
                                <Square className="w-4 h-4 mr-2" /> Finish
                             </Button>
                        )}
                    </div>
                </div>
            )}
            
            {/* Error Message */}
            {errorMsg && (
                <div className="p-3 bg-red-900/20 border border-red-500/50 text-red-300 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
            )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#222] bg-[#161616] flex justify-between items-center">
             <div className="text-xs text-gray-500">
                {stage === 'recording_content' && "Press Stop when finished thoughts"}
                {stage === 'awaiting_command' && "Tell AI how to format this"}
             </div>

             <div className="flex gap-3">
                 {stage === 'recording_content' && (
                     <Button onClick={handleStopContent} className="bg-red-600 hover:bg-red-500 px-8">
                         <Square className="w-4 h-4 mr-2" /> Stop Recording
                     </Button>
                 )}
                 {stage === 'awaiting_command' && (
                     <>
                        <Button variant="ghost" onClick={() => processWithAI()}>Skip Style</Button>
                        <Button onClick={() => processWithAI()} className="bg-purple-600 hover:bg-purple-500">
                            <Sparkles className="w-4 h-4 mr-2" /> Generate Note
                        </Button>
                     </>
                 )}
             </div>
        </div>

      </div>
    </div>
  );
};