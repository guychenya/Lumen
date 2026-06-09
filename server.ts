import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { LLMService } from "./services/llmService";
import { AIConfig, ChatMessage } from "./types";

const app = express();
const PORT = 3000;

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

// Vite middleware for development or Static serving for Production
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
