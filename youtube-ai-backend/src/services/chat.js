import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";

const videoCache = new Map();
const FULL_TRANSCRIPT_CHAR_LIMIT = 120000;
const TIMESTAMP_QUERY_REGEX =
  /\b(at this time|this time|right now|now|current time|timestamp|iss time|is time|abhi)\b/i;
const SONG_LIST_QUERY_REGEX =
  /\b(song list|songs list|list of songs|list of all song|all songs|track list|playlist|which songs|give me all the song|song names)\b/i;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "what",
  "when",
  "where",
  "who",
  "why",
  "how",
  "this",
  "there",
  "about",
  "into",
  "than",
  "then",
  "them",
  "they",
  "you",
  "your",
  "their",
  "does",
  "did",
  "have",
  "had",
  "can",
  "could",
  "would",
  "should",
]);

function getModel() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is missing in the backend .env file.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
      .join(":");
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createChunk(entries, index) {
  const chunkText = entries.map((item) => item.text).join(" ");
  const start = Number(entries[0].offset || 0);
  const endEntry = entries[entries.length - 1];
  const end = Number(endEntry.offset || 0) + Number(endEntry.duration || 0);

  return {
    index,
    text: chunkText,
    start,
    end,
    label: `${formatSeconds(start)} - ${formatSeconds(end)}`,
    tokens: tokenize(chunkText),
  };
}

function buildTranscriptChunks(transcriptEntries, maxChars = 1800, overlapEntries = 2) {
  const chunks = [];
  let currentEntries = [];
  let currentLength = 0;

  for (const entry of transcriptEntries) {
    const entryText = String(entry.text || "").trim();

    if (!entryText) {
      continue;
    }

    if (currentEntries.length > 0 && currentLength + entryText.length > maxChars) {
      chunks.push(createChunk(currentEntries, chunks.length));
      currentEntries = currentEntries.slice(-overlapEntries);
      currentLength = currentEntries.reduce((sum, item) => sum + String(item.text || "").length, 0);
    }

    currentEntries.push(entry);
    currentLength += entryText.length;
  }

  if (currentEntries.length > 0) {
    chunks.push(createChunk(currentEntries, chunks.length));
  }

  return chunks;
}

function scoreChunk(questionTokens, chunk) {
  if (questionTokens.length === 0) {
    return 0;
  }

  const chunkTokenCounts = new Map();

  for (const token of chunk.tokens) {
    chunkTokenCounts.set(token, (chunkTokenCounts.get(token) || 0) + 1);
  }

  let score = 0;

  for (const token of questionTokens) {
    if (chunkTokenCounts.has(token)) {
      score += 3 + chunkTokenCounts.get(token);
    }
  }

  return score;
}

function getTopContextChunks(question, chunks, limit = 5) {
  const questionTokens = tokenize(question);

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(questionTokens, chunk),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function dedupeAndSortChunks(chunks) {
  const unique = new Map();

  for (const chunk of chunks) {
    unique.set(chunk.index, chunk);
  }

  return [...unique.values()].sort((left, right) => left.index - right.index);
}

function getNeighborChunks(chunks, selectedChunks, radius = 1) {
  const expanded = [];

  for (const chunk of selectedChunks) {
    for (let offset = -radius; offset <= radius; offset += 1) {
      const neighbor = chunks[chunk.index + offset];

      if (neighbor) {
        expanded.push({
          ...neighbor,
          score: chunk.score ?? 0,
        });
      }
    }
  }

  return dedupeAndSortChunks(expanded);
}

function getDistributedFallbackChunks(chunks) {
  if (chunks.length <= 6) {
    return chunks;
  }

  const positions = [
    0,
    Math.floor(chunks.length * 0.25),
    Math.floor(chunks.length * 0.5),
    Math.floor(chunks.length * 0.75),
    chunks.length - 1,
  ];

  return dedupeAndSortChunks(
    positions.map((position) => ({
      ...chunks[position],
      score: 0,
    }))
  );
}

function getChunksAroundTime(chunks, currentTimeSeconds, radius = 1) {
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return [];
  }

  const directMatch =
    chunks.find(
      (chunk) =>
        currentTimeSeconds >= chunk.start && currentTimeSeconds <= chunk.end
    ) ||
    chunks.reduce((closest, chunk) => {
      if (!closest) {
        return chunk;
      }

      const closestDistance = Math.min(
        Math.abs(currentTimeSeconds - closest.start),
        Math.abs(currentTimeSeconds - closest.end)
      );
      const chunkDistance = Math.min(
        Math.abs(currentTimeSeconds - chunk.start),
        Math.abs(currentTimeSeconds - chunk.end)
      );

      return chunkDistance < closestDistance ? chunk : closest;
    }, null);

  if (!directMatch) {
    return [];
  }

  return getNeighborChunks(chunks, [{ ...directMatch, score: 1000 }], radius);
}

function getUniqueTitles(pageContext = {}) {
  const titles = Array.isArray(pageContext.playlistTitles)
    ? pageContext.playlistTitles
    : [];

  const unique = [];
  const seen = new Set();

  for (const title of titles) {
    const cleaned = String(title || "").replace(/\s+/g, " ").trim();

    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(cleaned);
  }

  return unique;
}

function buildSongListAnswer(pageContext = {}) {
  const titles = getUniqueTitles(pageContext);

  if (titles.length === 0) {
    return null;
  }

  const header = pageContext.playlistOrMixTitle
    ? `I found these songs from the visible YouTube mix "${pageContext.playlistOrMixTitle}":`
    : "I found these visible song titles on the page:";

  return `${header}\n\n${titles.map((title, index) => `${index + 1}. ${title}`).join("\n")}`;
}

function buildPageContextText(pageContext = {}) {
  const sections = [];

  if (pageContext.videoTitle) {
    sections.push(`Video title: ${pageContext.videoTitle}`);
  }

  if (Number.isFinite(pageContext.currentTimeSeconds)) {
    sections.push(`Current playback time: ${formatSeconds(pageContext.currentTimeSeconds)}`);
  }

  if (pageContext.chapterTitle) {
    sections.push(`Current chapter: ${pageContext.chapterTitle}`);
  }

  if (pageContext.playlistOrMixTitle) {
    sections.push(`Playlist or mix title: ${pageContext.playlistOrMixTitle}`);
  }

  const visibleTitles = getUniqueTitles(pageContext);

  if (visibleTitles.length > 0) {
    sections.push(
      `Visible song or playlist items:\n${visibleTitles
        .map((title, index) => `${index + 1}. ${title}`)
        .join("\n")}`
    );
  }

  if (pageContext.description) {
    sections.push(`Visible description excerpt:\n${pageContext.description}`);
  }

  return sections.join("\n\n");
}

function buildContextPayload(video, question, pageContext = {}) {
  const topChunks = video.transcriptAvailable ? getTopContextChunks(question, video.chunks) : [];
  const hasStrongMatch = topChunks.some((chunk) => chunk.score > 0);
  const timestampChunks = video.transcriptAvailable
    ? getChunksAroundTime(video.chunks, pageContext.currentTimeSeconds, 1)
    : [];
  const wantsTimestampFocus = TIMESTAMP_QUERY_REGEX.test(question);

  if (video.transcriptAvailable && video.transcriptText.length <= FULL_TRANSCRIPT_CHAR_LIMIT && !wantsTimestampFocus) {
    return {
      mode: "full_transcript",
      contextText: video.chunks
        .map((chunk, index) => `[Transcript ${index + 1}] (${chunk.label})\n${chunk.text}`)
        .join("\n\n"),
      selectedChunks: topChunks,
    };
  }

  let selectedChunks = [];

  if (wantsTimestampFocus && timestampChunks.length > 0) {
    selectedChunks = timestampChunks;
  } else if (hasStrongMatch) {
    selectedChunks = getNeighborChunks(video.chunks, topChunks, 1);
  } else if (timestampChunks.length > 0) {
    selectedChunks = timestampChunks;
  } else if (video.transcriptAvailable) {
    selectedChunks = getDistributedFallbackChunks(video.chunks);
  }

  const transcriptSection = selectedChunks.length
    ? selectedChunks
        .map(
          (chunk, index) =>
            `[Transcript ${index + 1}] (${chunk.label})\n${chunk.text}`
        )
        .join("\n\n")
    : "No transcript context available.";

  return {
    mode: wantsTimestampFocus
      ? "timestamp_focused"
      : hasStrongMatch
        ? "targeted_chunks"
        : video.transcriptAvailable
          ? "distributed_fallback"
          : "page_context_only",
    contextText: transcriptSection,
    selectedChunks,
  };
}

async function fetchTranscriptWithFallbacks(videoId) {
  const attempts = [
    undefined,
    { lang: "hi" },
    { lang: "en" },
    { lang: "hi-IN" },
    { lang: "en-US" },
  ];

  for (const config of attempts) {
    try {
      const transcript = config
        ? await YoutubeTranscript.fetchTranscript(videoId, config)
        : await YoutubeTranscript.fetchTranscript(videoId);

      if (transcript.length > 0) {
        return transcript;
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error(
    `Could not fetch transcript for video ${videoId}. The video may not have accessible subtitles.`
  );
}

export async function ensureVideoIsIndexed(videoId) {
  if (videoCache.has(videoId)) {
    const cached = videoCache.get(videoId);

    return {
      message: cached.transcriptAvailable
        ? "Video already indexed in memory."
        : "Video loaded with page-only support. Transcript is unavailable.",
      videoId,
      chunkCount: cached.chunks.length,
      transcriptLength: cached.transcriptText.length,
      transcriptAvailable: cached.transcriptAvailable,
      cached: true,
    };
  }

  try {
    const transcriptEntries = await fetchTranscriptWithFallbacks(videoId);
    const transcriptText = transcriptEntries.map((entry) => entry.text).join(" ");
    const chunks = buildTranscriptChunks(transcriptEntries);

    videoCache.set(videoId, {
      transcriptEntries,
      transcriptText,
      chunks,
      indexedAt: new Date().toISOString(),
      transcriptAvailable: true,
      transcriptLanguage: transcriptEntries.find((entry) => entry.lang)?.lang || "unknown",
    });

    return {
      message: "Video indexed successfully.",
      videoId,
      chunkCount: chunks.length,
      transcriptLength: transcriptText.length,
      transcriptAvailable: true,
      cached: false,
    };
  } catch (error) {
    videoCache.set(videoId, {
      transcriptEntries: [],
      transcriptText: "",
      chunks: [],
      indexedAt: new Date().toISOString(),
      transcriptAvailable: false,
      transcriptLanguage: null,
      transcriptError: error.message,
    });

    return {
      message: "Transcript could not be loaded. Metadata-only support is available.",
      videoId,
      chunkCount: 0,
      transcriptLength: 0,
      transcriptAvailable: false,
      cached: false,
    };
  }
}

export async function askVideoQuestion(videoId, question, pageContext = {}) {
  await ensureVideoIsIndexed(videoId);

  if (SONG_LIST_QUERY_REGEX.test(question)) {
    const songListAnswer = buildSongListAnswer(pageContext);

    if (songListAnswer) {
      return {
        success: true,
        answer: songListAnswer,
        videoId,
        indexedAt: videoCache.get(videoId).indexedAt,
        transcriptAvailable: videoCache.get(videoId).transcriptAvailable,
        transcriptLanguage: videoCache.get(videoId).transcriptLanguage,
        retrievalMode: "page_song_list",
        contextChunks: [],
      };
    }
  }

  const video = videoCache.get(videoId);
  const pageContextText = buildPageContextText(pageContext);
  const { mode, contextText, selectedChunks } = buildContextPayload(video, question, pageContext);

  const prompt = `You are a helpful AI assistant for YouTube videos.

Use the provided transcript context and page context to answer the question.
Rules:
- Reply in the same language as the user's question.
- For "at this time" or timestamp-based questions, focus on the transcript near the current playback time.
- If the user asks for song names or a song list, use the visible playlist items when available.
- If transcript context is unavailable, you may still answer from the page context when it clearly contains the answer.
- If the answer is not present in either the transcript context or page context, reply exactly:
I don't know.

Page Context:
${pageContextText || "No page context available."}

Transcript Context:
${contextText}

Question:
${question}`;

  const model = getModel();
  const result = await model.generateContent(prompt);
  const answer = result.response.text().trim();

  return {
    success: true,
    answer,
    videoId,
    indexedAt: video.indexedAt,
    transcriptAvailable: video.transcriptAvailable,
    transcriptLanguage: video.transcriptLanguage,
    retrievalMode: mode,
    contextChunks: selectedChunks.map((chunk) => ({
      label: chunk.label,
      score: chunk.score ?? 0,
      preview: chunk.text.slice(0, 180),
    })),
  };
}
