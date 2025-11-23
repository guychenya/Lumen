import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Sparkles, X, Wand2, AlertCircle, RefreshCw, Activity } from 'lucide-react';
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
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const shouldBeRecording = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setFinalTranscript('');
      setInterimTranscript('');
      setAiResponse('');
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
            recognitionRef.current.onend = null;
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

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setStage('error');
      setErrorMsg("This browser does not support Voice Mode. Please use Google Chrome, Edge, or Safari.");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = true; 
    recognition.lang = 'en-US';
    return recognition;
  };

  const startRecording = async () => {
    try {
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

        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalChunk += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        if (finalChunk) {
            setFinalTranscript(prev => {
                const spacer = prev ? ' ' : '';
                return prev + spacer + finalChunk;
            });
        }
        setInterimTranscript(interim);
      };

      recognition.onspeechstart = () => setIsSpeechDetected(true);
      recognition.onspeechend = () => setIsSpeechDetected(false);

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        
        console.warn("Speech recognition error:", event.error);
        
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             cleanupResources();
             setStage('error');
             setErrorMsg("Microphone access denied.");
        } else if (event.error === 'network') {
             if (!navigator.userAgent.includes('Chrome')) {
                 setStage('error');
                 setErrorMsg("Connection failed. This browser often blocks speech API. Please try Chrome.");
             }
        }
      };

      recognition.onend = () => {
        if (shouldBeRecording.current && stage !== 'error') {
            try {
                recognition.start();
            } catch (e) {}
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
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
    }
    
    // Combine final and any leftover interim
    const fullText = (finalTranscript + ' ' + interimTranscript).trim();
    
    setTimeout(() => {
        cleanupResources();
        setMediaStream(null);
        
        if (!fullText) {
            onClose(); 
            return;
        }
        processWithAI(fullText);
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

  const processWithAI = async (textToProcess: string) => {
    setStage('processing');
    setAiResponse(''); 
    const service = new LLMService(config);
    
    // Updated prompt to avoid hallucinating todo lists
    const prompt = `
      I have recorded the following voice note:
      "${textToProcess}"

      Your task is to transcribe and lightly format this text into Markdown.
      Rules:
      1. Correct basic grammar and spelling mistakes.
      2. If the user is clearly dictating a structure (like "Heading: Plan"), use Markdown headers (#).
      3. If the user is listing items, use bullet points (-).
      4. DO NOT create a checklist or todo list unless the user explicitly says "create a checklist" or "todo".
      5. If the text is short or conversational, just return it as a clean paragraph.
      6. Output ONLY the Markdown text.
    `;

    try {
        let fullResult = '';
        const generator = service.streamResponse([{ role: 'user', content: prompt }]);
        for await (const chunk of generator) {
            fullResult += chunk;
            setAiResponse(prev => prev + chunk); // Live update
        }
        
        // Allow user to read the summary briefly
        setTimeout(() => {
            onInsert(fullResult);
            onClose();
        }, 1500);

    } catch (e) {
        setStage('error');
        setErrorMsg("AI Processing Failed. Please check settings.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 dark:bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#222]">
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${stage === 'processing' ? 'bg-purple-100 dark:bg-purple-500/20 animate-pulse' : 'bg-emerald-100 dark:bg-emerald-500/20'}`}>
                 {stage === 'recording' ? <Mic className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-pulse" /> : <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Voice Mode</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      {stage === 'recording' && "Listening..."}
                      {stage === 'recording' && isSpeechDetected && <span className="text-emerald-600 dark:text-emerald-500 text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 rounded border border-emerald-200 dark:border-emerald-500/30">Voice Detected</span>}
                      {stage === 'processing' && "Formatting..."}
                      {stage === 'error' && "Error occurred"}
                  </p>
              </div>
           </div>
           <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-white"><X className="w-6 h-6"/></button>
        </div>

        {/* Visualization Area */}
        <div className="relative bg-gray-900 dark:bg-black h-48 flex items-center justify-center border-b border-gray-200 dark:border-[#222]">
           {stage === 'recording' ? (
               <AudioVisualizer stream={mediaStream} isListening={true} />
           ) : (
               <div className="text-gray-600 dark:text-gray-600 flex flex-col items-center justify-center h-full">
                   {stage === 'processing' ? (
                        <>
                            <div className="flex items-center gap-3 mb-4">
                                <Wand2 className="w-8 h-8 animate-spin text-emerald-500" />
                                <Sparkles className="w-6 h-6 animate-pulse text-purple-500" />
                            </div>
                            <span className="text-emerald-500 dark:text-emerald-400 font-medium animate-pulse">Formatting Markdown...</span>
                        </>
                   ) : (
                       <div className="text-sm text-gray-500 dark:text-gray-600">Microphone inactive</div>
                   )}
               </div>
           )}
        </div>

        {/* Content Preview */}
        <div className="p-6 space-y-4">
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                        {stage === 'processing' ? 'Generating Note' : 'Live Transcript'}
                    </label>
                    {stage === 'processing' && <span className="text-xs text-emerald-600 dark:text-emerald-500 animate-pulse">Streaming from AI...</span>}
                </div>
                
                <div className="p-4 bg-gray-100 dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333] min-h-[120px] max-h-[300px] overflow-y-auto transition-all custom-scrollbar">
                    {stage === 'processing' ? (
                         <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-sm">
                            {aiResponse || 'Thinking...'}
                         </div>
                    ) : (
                        <div className="text-gray-800 dark:text-gray-200 leading-relaxed text-lg font-light">
                             {finalTranscript || interimTranscript ? (
                                <>
                                    <span>{finalTranscript}</span>
                                    <span className="text-gray-500 dark:text-gray-500 ml-1">{interimTranscript}</span>
                                </>
                             ) : (
                                <span className="text-gray-500 dark:text-gray-600 italic">Start speaking to capture your thoughts...</span>
                             )}
                        </div>
                    )}
                </div>
            </div>

            {errorMsg && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> 
                    <span className="text-sm font-medium">{errorMsg}</span>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#161616] flex justify-between items-center">
             <div className="text-xs text-gray-500 dark:text-gray-500">
                Lumen will automatically format your speech into Markdown.
             </div>

             <div className="flex gap-3">
                 {stage === 'error' ? (
                     <Button onClick={handleRetry} className="bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 px-6 text-white">
                         <RefreshCw className="w-4 h-4 mr-2" /> Retry
                     </Button>
                 ) : stage === 'recording' ? (
                     <Button onClick={handleFinish} className="bg-red-600 hover:bg-red-700 px-8 py-3 h-auto text-base shadow-lg shadow-red-900/20 text-white">
                         <Square className="w-4 h-4 mr-2" /> Stop & Format
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
