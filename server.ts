import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { LLMService } from "./services/llmService";
import { AIConfig, ChatMessage } from "./types";
import multer from "multer";
import FormData from "form-data";

const app = express();
const PORT = 3000;
const WHISPER_URL = process.env.WHISPER_URL || "http://localhost:8080";
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// 1. Connection Verification Endpoint (Proxy calls server-side)
app.post("/api/ai/verify", async (req, res) => {
  try {
    const config: AIConfig = req.body.config;
    if (!config) {
      return res.status(400).json({ success: false, message: "Missing AI configuration." });
    }
    const service = new LLMService(config);
    const result = await service.verifyConnection();
    res.json(result);
  } catch (error: any) {
    console.error("Verify connection error:", error);
    res.status(500).json({ success: false, message: error.message || "Internal server error." });
  }
});

// 2. Chat Streaming Endpoint (Proxy calls server-side)
app.post("/api/ai/stream", async (req, res) => {
  try {
    const config: AIConfig = req.body.config;
    const messages: ChatMessage[] = req.body.messages;

    if (!config || !messages) {
      return res.status(400).send("Missing AI configuration or message payload.");
    }

    const service = new LLMService(config);
    const generator = service.streamResponse(messages);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    for await (const chunk of generator) {
      res.write(chunk);
    }
    res.end();
  } catch (error: any) {
    console.error("Stream response error:", error);
    if (!res.headersSent) {
      res.status(500).send(error.message || "Internal streaming error.");
    } else {
      res.write(`\n[Server Error: ${error.message || "Internal streaming error."}]`);
      res.end();
    }
  }
});

// 3. Transcription Endpoint (proxies audio to local Whisper server)
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });
    const form = new FormData();
    form.append("file", req.file.buffer, { filename: req.file.originalname || "audio.webm", contentType: req.file.mimetype });
    form.append("response_format", "json");
    const response = await fetch(`${WHISPER_URL}/inference`, {
      method: "POST",
      body: form as any,
      headers: form.getHeaders(),
    });
    if (!response.ok) throw new Error(`Whisper error: ${response.statusText}`);
    const data = await response.json() as any;
    res.json({ text: data.text || "" });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message });
  }
});

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

// 4. Ollama proxy — forwards browser requests to local Ollama over secure channel
app.all("/api/ollama/{*path}", async (req, res) => {
  try {
    const ollamaPath = req.path.replace("/api/ollama", "");
    const url = `${OLLAMA_URL}${ollamaPath}`;
    const body = req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined;
    const upstream = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body,
    });
    res.status(upstream.status);
    upstream.headers.forEach((v, k) => { if (!["transfer-encoding","connection"].includes(k)) res.setHeader(k, v); });
    const reader = (upstream.body as any)?.getReader?.();
    if (reader) {
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(Buffer.from(value));
        pump();
      };
      pump();
    } else {
      res.send(await upstream.text());
    }
  } catch (error: any) {
    res.status(502).json({ error: `Ollama proxy error: ${error.message}` });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
