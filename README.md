# YouTube Video Chat Extension

This project now has:

- `youtube-ai-backend`: a Node.js + Express backend that fetches a YouTube transcript, builds transcript chunks in memory, and answers questions with Gemini using only the retrieved transcript context.
- `chrome-extension`: a Chrome extension popup that detects the current YouTube tab and lets the user chat with that video's transcript.

## Backend setup

1. Go to `youtube-ai-backend`.
2. Create a `.env` file from `.env.example`.
3. Add your `GOOGLE_API_KEY`.
4. Install packages:

```bash
npm install
```

5. Start the backend:

```bash
npm run dev
```

The backend runs on `http://localhost:3000`.

## Chrome extension setup

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `chrome-extension` folder.

## How it works

1. Open any YouTube video in Chrome.
2. Open the extension popup.
3. The popup detects the current `videoId` and asks the backend to index the transcript.
4. Ask questions in the popup chat box.

## Notes

- The backend needs an English transcript/subtitles to exist for the video.
- Video indexing is stored in memory for the current backend session.
- If you restart the backend, the videos will be indexed again on demand.
