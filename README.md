# YouTube Video Chat Extension

Ask questions about the YouTube video you are currently watching from a Chrome extension popup.

This project combines:

- `youtube-ai-backend`: a Node.js + Express API that fetches a video's transcript, breaks it into chunks, retrieves the most relevant context, and sends that context to Gemini for grounded answers.
- `chrome-extension`: a Chrome extension popup that detects the active YouTube tab, indexes the video, and lets the user chat with it.

## What This Extension Does

- Detects the current YouTube video automatically
- Fetches the transcript for that video when available
- Stores the indexed transcript in memory for fast follow-up questions
- Answers only from transcript context and lightweight page context
- Can use current playback time, chapter title, visible playlist items, and description text for better answers

## How It Works

1. Open a YouTube video in Chrome.
2. Open the extension popup.
3. The extension reads the current tab and extracts the `videoId`.
4. The popup sends the `videoId` to the backend.
5. The backend fetches the transcript and builds transcript chunks in memory.
6. When you ask a question, the backend retrieves the most relevant chunks and sends only that context to Gemini.
7. The answer is returned in the popup chat UI.

## Project Structure

```text
Youtube_extension/
|- chrome-extension/       # Chrome extension popup UI
|- youtube-ai-backend/     # Express API + transcript retrieval + Gemini chat
|- rag/                    # Older/experimental RAG-related scripts
`- README.md
```

## Requirements

Before starting, make sure you have:

- Node.js 18+ installed
- Google Chrome installed
- A valid Google Gemini API key
- Internet access for transcript fetching and Gemini API calls

## Backend Setup

1. Open the backend folder:

```bash
cd youtube-ai-backend
```

2. Create your environment file from the example:

```bash
cp .env.example .env
```

If you are on Windows PowerShell, you can use:

```powershell
Copy-Item .env.example .env
```

3. Add your API key to `.env`:

```env
GOOGLE_API_KEY=your_google_api_key_here
PORT=3000
GEMINI_MODEL=gemini-2.5-flash
```

4. Install dependencies:

```bash
npm install
```

5. Start the backend:

```bash
npm run dev
```

The backend will run at:

```text
http://localhost:3000
```

## Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `chrome-extension` folder from this project

Once loaded, pin the extension if you want quick access from the Chrome toolbar.

## Using the Extension

1. Start the backend server.
2. Open any YouTube video page.
3. Open the extension popup.
4. Wait for the extension to detect the video and index it.
5. Ask a question such as:
   - "What is the main point of this video?"
   - "What is happening at this time?"
   - "Summarize this video in simple words."
   - "Which songs are in this mix?"

## API Endpoints

The backend currently exposes these routes:

- `GET /api/health` - check whether the backend is running
- `POST /api/videos/index` - index a video transcript in memory
- `POST /api/chat` - ask a question about a video

### Example: Health Check

```bash
curl http://localhost:3000/api/health
```

### Example: Index a Video

```bash
curl -X POST http://localhost:3000/api/videos/index \
  -H "Content-Type: application/json" \
  -d "{\"videoId\":\"YOUR_VIDEO_ID\"}"
```

### Example: Ask a Question

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"videoId\":\"YOUR_VIDEO_ID\",\"question\":\"What is this video about?\"}"
```

## Features

- Transcript-aware video Q&A
- In-memory indexing for fast repeated queries
- Context retrieval instead of sending the entire transcript every time
- Timestamp-aware answers for "what is happening now?" style questions
- Fallback support using page metadata when the transcript is unavailable
- Song list support from visible YouTube mix or playlist items

## Limitations

- The backend stores indexed videos only in memory, so restarting the server clears the cache.
- Some videos do not have accessible subtitles or transcripts.
- Transcript quality depends on the subtitles provided by YouTube.
- The extension currently expects the backend to run on `http://localhost:3000`.
- The Chrome extension is designed for YouTube watch pages and may not work correctly on other tabs.

## Troubleshooting

### The extension says no video was found

Make sure:

- you are on a YouTube video page
- the tab is the active tab in the current Chrome window
- the page URL contains a valid YouTube video ID

### The backend does not start

Check that:

- `.env` exists inside `youtube-ai-backend`
- `GOOGLE_API_KEY` is set correctly
- port `3000` is not already in use

### The transcript could not be loaded

This usually means:

- the video has no accessible subtitles
- transcript fetching failed for that video
- the video is restricted or unsupported by the transcript source

### The extension loads but chat does not work

Check that:

- the backend is running on `http://localhost:3000`
- Chrome has permission to access the extension
- the extension was loaded from the correct `chrome-extension` folder

## Tech Stack

- Frontend: Chrome Extension (Manifest V3, HTML, CSS, JavaScript)
- Backend: Node.js, Express
- AI Model: Google Gemini
- Transcript Source: `youtube-transcript`

## Future Improvements

- Persistent transcript storage
- Better transcript language handling
- Source citations in answers
- Streaming chat responses
- Side panel UI instead of popup-only chat
- Deployment support for a hosted backend

## License

Add a license here if you plan to open-source or distribute the project.
