import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health Route
app.use("/api/health", healthRouter);
app.use("/api/chat", chatRouter);

export default app;