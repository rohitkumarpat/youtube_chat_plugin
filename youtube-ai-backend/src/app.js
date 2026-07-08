import cors from "cors";
import express from "express";

import chatRouter from "./routes/chat.js";
import healthRouter from "./routes/health.js";
import videoRouter from "./routes/video.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/videos", videoRouter);
app.use("/api/chat", chatRouter);

export default app;
