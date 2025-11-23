
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Sparkles, X, Wand2, AlertCircle, RefreshCw } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { Button } from './ui/Button';
import { useAI } from '../context/AIContext';
import { LLMService } from '../services/llmService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

type Stage = 'idle' | 'recording' | 'processing' | 'error';

export const VoiceModeModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const { config } = useAI();
  const [stage, setStage] = useState<Stage>('idle');
  const [transcript, setTranscript] = useState('');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const shouldBeRecording = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setTranscript('');
      setErrorMsg('');
      shouldBeRecording.current = true;
      startRecording();
    } else {
      stopEverything();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const cleanupResources = () => {
    shouldBeRecording.current = false;
    if (recognitionRef.current) {
        try {
            recognitionRef.current.onend = null; // Prevent restart loops during cleanup
            recognitionRef.current.stop();
        } catch (e) { /* ignore */ }
        recognitionRef.current = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
  };

  const stopEverything = () => {
    cleanupResources();
    setMediaStream(null);
    if (stage !== 'error') setStage('idle');
  };

  const initSpeech = () => {
    if (typeof window === 'undefined') return null;

    // Check for browser support
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setStage('error');
      setErrorMsg("This browser does not support Voice Mode. Please use Google Chrome, Edge, or Safari.");
      return null;
    }

    const recognition = new SpeechRecognition();
    // CRITICAL FIX: Set continuous to false. 
    // Many non-Chrome browsers fail with Network Error if continuous is true due to socket timeouts.
    // We will manually restart it in onend to simulate continuous recording.
    recognition.continuous = false; 
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    return recognition;
  };

  const startRecording = async () => {
    try {
      // 1. Get Mic Stream (for Visualizer)
      let stream = mediaStream;
      if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setMediaStream(stream);
      }
      
      const recognition = initSpeech();
      if (!recognition) {
          stream?.getTracks().forEach(t => t.stop());
          return;
      }

      recognition.onresult = (event: any) => {
        if (!shouldBeRecording.current) return;

        // With continuous=false, we get one result set per "session"
        // We handle the concatenation in state updates or by appending final results
        const result = event.results[event.resultIndex];
        const transcriptText = result[0].transcript;
        
        if (result.isFinal) {
             setTranscript(prev => {
                 // Avoid duplicate appending if the logic fires multiple times
                 if (prev.trim().endsWith(transcriptText.trim())) return prev;
                 return prev + ' ' + transcriptText;
             });
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
            // Ignore no-speech, it just means the burst finished without audio
            return;
        }
        
        console.warn("Speech recognition error:", event.error);
        
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             cleanupResources();
             setStage('error');
             setErrorMsg("Microphone access denied.");
        } else if (event.error === 'network') {
             // In "burst" mode, network errors are rare, but if they happen, we try to ignore/restart 
             // unless it persists. For now, we log it.
             console.log("Transient network error in speech, ignoring...");
        } else {
             // Aborted or other
        }
      };

      recognition.onend = () => {
        // RESTART LOGIC: "Manual Continuous"
        // If we are still supposed to be recording, start the engine again immediately.
        if (shouldBeRecording.current && stage !== 'error') {
            try {
                recognition.start();
            } catch (e) {
                // Ignore if already started
            }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setStage('recording');

    } catch (err) {
      console.error("Microphone access error:", err);
      setStage('error');
      setErrorMsg("Could not access microphone. Please check your system settings.");
    }
  };

  const handleFinish = () => {
    shouldBeRecording.current = false;
    if (recognitionRef.current) {
        recognitionRef.current.onend = null; // Stop the restart loop
        recognitionRef.current.stop();
    }
    
    // Wait small tick to ensure final event processed
    setTimeout(() => {
        cleanupResources();
        setMediaStream(null);
        setStage('idle');
        
        if (!transcript.trim()) {
            onClose(); 
            return;
        }
        processWithAI();
    }, 200);
  };

  const handleRetry = () => {
    stopEverything();
    setErrorMsg('');
    setStage('idle');
    shouldBeRecording.current = true;
    setTimeout(() => {
        startRecording();
    }, 100);
  };

  const processWithAI = async () => {
    setStage('processing');
    const service = new LLMService(config);
    
    const prompt = `
      I have recorded the following raw thoughts/notes:
      "${transcript}"

      Please restructure this into a clean, professional, and cohesive note.
      - Fix grammar and flow.
      - Use headers (<h2>) and bullet points (<ul>) where appropriate.
      - Keep the tone professional and clear.
      - Return only the HTML content.
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-[#111] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#222]">
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${stage === 'processing' ? 'bg-purple-500/20 animate-pulse' : 'bg-emerald-500/20'}`}>
                 {stage === 'recording' ? <Mic className="w-5 h-5 text-emerald-400 animate-pulse" /> : <Sparkles className="w-5 h-5 text-purple-400" />}
              </div>
              <div>
                  <h2 className="text-xl font-bold text-white">Voice Mode</h2>
                  <p className="text-sm text-gray-400">
                      {stage === 'recording' && "Listening..."}
                      {stage === 'processing' && "Synthesizing cohesive note..."}
                      {stage === 'error' && "Error occurred"}
                  </p>
              </div>
           </div>
           <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-6 h-6"/></button>
        </div>

        {/* Visualization Area */}
        <div className="relative bg-black h-48 flex items-center justify-center border-b border-[#222]">
           {stage === 'recording' ? (
               <AudioVisualizer stream={mediaStream} isListening={true} />
           ) : (
               <div className="text-gray-600 flex flex-col items-center justify-center h-full">
                   {stage === 'processing' ? (
                        <>
                            <Wand2 className="w-12 h-12 animate-spin text-purple-500 mb-4" />
                            <span className="text-purple-400 animate-pulse">Refining thoughts...</span>
                        </>
                   ) : (
                       <div className="text-sm text-gray-600">Microphone inactive</div>
                   )}
               </div>
           )}
        </div>

        {/* Content Preview */}
        <div className="p-6 space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Transcript</label>
                <div className="p-4 bg-[#1A1A1A] rounded-xl border border-[#333] min-h-[120px] max-h-[200px] overflow-y-auto text-gray-200 leading-relaxed text-lg font-light transition-all">
                    {transcript || <span className="text-gray-600 italic">Start speaking to capture your thoughts...</span>}
                </div>
            </div>

            {errorMsg && (
                <div className="p-3 bg-red-900/20 border border-red-500/50 text-red-300 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> 
                    <span className="text-sm font-medium">{errorMsg}</span>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#222] bg-[#161616] flex justify-between items-center">
             <div className="text-xs text-gray-500">
                Lumen will automatically format your speech into a note.
             </div>

             <div className="flex gap-3">
                 {stage === 'error' ? (
                     <Button onClick={handleRetry} className="bg-emerald-600 hover:bg-emerald-500 px-6">
                         <RefreshCw className="w-4 h-4 mr-2" /> Retry
                     </Button>
                 ) : stage === 'recording' ? (
                     <Button onClick={handleFinish} className="bg-red-600 hover:bg-red-500 px-8 py-3 h-auto text-base shadow-lg shadow-red-900/20">
                         <Square className="w-4 h-4 mr-2" /> Stop & Summarize
                     </Button>
                 ) : (
                     <Button variant="ghost" onClick={onClose}>Cancel</Button>
                 )}
             </div>
        </div>

      </div>
    </div>
  );
};
