
import React, { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  isListening: boolean;
}

export const AudioVisualizer: React.FC<Props> = ({ stream, isListening }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!stream || !isListening || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize Audio Context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    // CRITICAL: Browsers suspend audio context until user interaction. Force resume.
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; // Higher resolution for smoothness
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Animation state
    let phase = 0;

    const draw = () => {
      if (!isListening) return;
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Calculate approximate volume (RMS) for amplitude
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
          const x = (dataArray[i] - 128) / 128.0;
          sum += x * x;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const volume = Math.min(rms * 10, 1); // Boost sensitivity

      ctx.clearRect(0, 0, width, height);

      // Draw multiple overlapping waves for a "rich" effect
      const colors = ['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.5)', 'rgba(52, 211, 153, 0.8)'];
      
      colors.forEach((color, index) => {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          
          // Phase shift for each layer
          const layerPhase = phase + (index * Math.PI / 4);
          
          ctx.moveTo(0, centerY);

          for (let x = 0; x < width; x++) {
              // Sine wave combined with noise from audio
              // We create a "bulb" shape in the middle that tapers at ends
              const progress = x / width;
              const window = 4 * progress * (1 - progress); // Parabolic window (0 at ends, 1 in middle)
              
              const frequency = 0.02 + (index * 0.01);
              const amplitude = (height / 3) * volume * window;
              
              const y = centerY + Math.sin(x * frequency + layerPhase) * amplitude;
              
              ctx.lineTo(x, y);
          }
          ctx.stroke();
      });

      phase += 0.1; // Animate the wave moving
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stream, isListening]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={200} 
      className="w-full h-48 rounded-xl bg-gray-100 dark:bg-[#0a0a0a]"
    />
  );
};
