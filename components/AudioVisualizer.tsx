import React, { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  isListening: boolean;
}

export const AudioVisualizer: React.FC<Props> = ({ stream, isListening }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
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

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isListening) return;
      
      const width = canvas.width;
      const height = canvas.height;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Draw glowing line
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#10b981'; // Lumen Emerald
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#10b981';
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, height / 2); // Start middle
        } else {
            // Smooth curve
            const prevX = x - sliceWidth;
            const prevY = (dataArray[i - 1] / 128.0 * height) / 2;
            const cp1x = prevX + (x - prevX) / 2;
            // Mirror vertically to create a sound wave look centered vertically
            // Actually, let's just do a simple bar or line visualization for clarity
            // Let's do a centered wave
             
            // Calculate offset from center
            const deviation = (v - 1) * (height / 2);
            
            ctx.lineTo(x, (height / 2) - deviation);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      
      // Mirror reflection for symmetry
      ctx.beginPath();
      x = 0;
      ctx.moveTo(x, height / 2);
      for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const deviation = (v - 1) * (height / 2);
          x += sliceWidth;
          ctx.lineTo(x, (height / 2) + deviation);
      }
      ctx.stroke();
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
      className="w-full h-48 rounded-xl bg-gradient-to-r from-[#111] via-[#161616] to-[#111]"
    />
  );
};