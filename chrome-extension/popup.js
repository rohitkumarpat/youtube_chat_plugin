const API_BASE = "http://localhost:3000/api";

const state = {
  videoId: null,
  title: "",
  loading: false,
  tabId: null,
  pageContext: null,
};

const elements = {
  videoMeta: document.getElementById("videoMeta"),
  statusBadge: document.getElementById("statusBadge"),
  indexButton: document.getElementById("indexButton"),
  messages: document.getElementById("messages"),
  chatForm: document.getElementById("chatForm"),
  questionInput: document.getElementById("questionInput"),
  sendButton: document.getElementById("sendButton"),
};

function setStatus(text) {
  elements.statusBadge.textContent = text;
}

function setLoading(loading) {
  state.loading = loading;
  elements.indexButton.disabled = loading || !state.videoId;
  elements.sendButton.disabled = loading || !state.videoId;
  elements.questionInput.disabled = loading || !state.videoId;
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  article.appendChild(paragraph);

  elements.messages.appendChild(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function getVideoIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "") || null;
    }

    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v");
    }
  } catch (error) {
    return null;
  }

  return null;
}

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return "--:--";
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
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

async function getCurrentYouTubeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const [tab] = tabs;

  if (!tab || !tab.url) {
    return null;
  }

  const videoId = getVideoIdFromUrl(tab.url);

  if (!videoId) {
    return null;
  }

  return {
    tabId: tab.id,
    videoId,
    title: tab.title || "Current YouTube video",
  };
}

async function getPageContext() {
  if (!state.tabId) {
    return null;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: state.tabId },
      func: () => {
        const video = document.querySelector("video");
        const heading =
          document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() ||
          document.querySelector("h1 yt-formatted-string")?.textContent?.trim();
        const chapterTitle =
          document.querySelector(".ytp-chapter-title-content")?.textContent?.trim() ||
          document.querySelector(".ytp-chapter-title-prefix")?.textContent?.trim() ||
          null;

        const titleSelectors = [
          "ytd-playlist-panel-video-renderer #video-title",
          "ytd-compact-video-renderer #video-title",
          "ytd-rich-item-renderer #video-title",
          "yt-lockup-view-model a[href*='watch']",
          "a.yt-simple-endpoint.style-scope.ytd-watch-card-compact-video-renderer",
        ];

        const rawTitles = titleSelectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector)).map((item) =>
            item.textContent?.replace(/\s+/g, " ").trim()
          )
        );

        const uniqueTitles = [];
        const seen = new Set();

        for (const title of rawTitles) {
          if (!title || title.length < 2) {
            continue;
          }

          const normalized = title.toLowerCase();

          if (seen.has(normalized)) {
            continue;
          }

          seen.add(normalized);
          uniqueTitles.push(title);
        }

        const description =
          document.querySelector("#description-inline-expander")?.textContent?.trim() ||
          document.querySelector("#description")?.textContent?.trim() ||
          "";

        const playlistOrMixTitle =
          document.querySelector("ytd-playlist-panel-renderer #header-description")?.textContent?.trim() ||
          document.querySelector("ytd-playlist-panel-renderer #title")?.textContent?.trim() ||
          null;

        return {
          videoTitle: heading || document.title,
          currentTimeSeconds: Number(video?.currentTime || 0),
          durationSeconds: Number(video?.duration || 0),
          chapterTitle,
          playlistTitles: uniqueTitles.slice(0, 40),
          playlistOrMixTitle,
          description: description.slice(0, 4000),
        };
      },
    });

    return result?.result || null;
  } catch (error) {
    return null;
  }
}

function updateVideoMeta() {
  if (!state.videoId) {
    return;
  }

  const lines = [state.title, `Video ID: ${state.videoId}`];

  if (state.pageContext?.currentTimeSeconds != null) {
    lines.push(`Current time: ${formatTime(state.pageContext.currentTimeSeconds)}`);
  }

  if (state.pageContext?.chapterTitle) {
    lines.push(`Chapter: ${state.pageContext.chapterTitle}`);
  }

  if (state.pageContext?.playlistTitles?.length) {
    lines.push(`Detected songs: ${state.pageContext.playlistTitles.length}`);
  }

  elements.videoMeta.textContent = lines.join("\n");
}

async function indexVideo(showSuccessMessage = false) {
  if (!state.videoId) {
    return;
  }

  setLoading(true);
  setStatus("Indexing...");

  try {
    const response = await fetch(`${API_BASE}/videos/index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ videoId: state.videoId }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to index video.");
    }

    setStatus("Ready");

    if (showSuccessMessage) {
      const transcriptStatus = data.transcriptAvailable
        ? `Transcript ready with ${data.chunkCount} chunks.`
        : "Transcript is unavailable, but page info is still available for limited questions.";

      appendMessage("assistant", `${data.message} ${transcriptStatus}`);
    }
  } catch (error) {
    setStatus("Error");
    appendMessage("assistant", error.message);
  } finally {
    setLoading(false);
  }
}

async function sendQuestion(question) {
  setLoading(true);
  setStatus("Thinking...");
  appendMessage("user", question);

  try {
    state.pageContext = await getPageContext();
    updateVideoMeta();

    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoId: state.videoId,
        question,
        pageContext: state.pageContext,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to get an answer.");
    }

    appendMessage("assistant", data.answer);
    setStatus("Ready");
  } catch (error) {
    appendMessage("assistant", error.message);
    setStatus("Error");
  } finally {
    setLoading(false);
  }
}

async function bootstrap() {
  setLoading(true);
  setStatus("Checking tab...");

  const tabInfo = await getCurrentYouTubeTab();

  if (!tabInfo) {
    elements.videoMeta.textContent =
      "Open any YouTube video page, then reopen this extension popup.";
    setStatus("No video");
    setLoading(false);
    return;
  }

  state.videoId = tabInfo.videoId;
  state.title = tabInfo.title;
  state.tabId = tabInfo.tabId;
  state.pageContext = await getPageContext();

  updateVideoMeta();

  setLoading(false);
  await indexVideo(false);
}

elements.indexButton.addEventListener("click", async () => {
  state.pageContext = await getPageContext();
  updateVideoMeta();
  await indexVideo(true);
});

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = elements.questionInput.value.trim();

  if (!question || !state.videoId || state.loading) {
    return;
  }

  elements.questionInput.value = "";
  await sendQuestion(question);
});

bootstrap();
