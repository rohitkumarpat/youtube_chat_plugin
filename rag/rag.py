import os
import time
from pathlib import Path

from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma

# ==========================
# Load Environment Variables
# ==========================

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("GOOGLE_API_KEY not found")


def index_video(video_id: str):

    # ==========================
    # Fetch Transcript
    # ==========================

    api = YouTubeTranscriptApi()

    transcript = api.fetch(video_id, languages=["en"])

    text = " ".join(chunk.text for chunk in transcript)

    print("✅ Transcript fetched")

    # ==========================
    # Split Transcript
    # ==========================

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=2500,
        chunk_overlap=300,
    )

    chunks = splitter.create_documents([text])

    print(f"✅ Total Chunks: {len(chunks)}")

    # ==========================
    # Embeddings
    # ==========================

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key,
    )

    # ==========================
    # Open/Create Chroma Collection
    # ==========================

    vectorstore = Chroma(
        persist_directory="vectorstore",
        embedding_function=embeddings,
        collection_name=video_id,
    )

    # ==========================
    # Check if already indexed
    # ==========================

    existing_docs = vectorstore.get()

    if len(existing_docs["ids"]) > 0:
        print("✅ Video already indexed.")
        return True

    # ==========================
    # Batch Indexing
    # ==========================

    batch_size = 40

    for i in range(0, len(chunks), batch_size):

        batch = chunks[i:i + batch_size]

        print(
            f"📦 Indexing Batch {i // batch_size + 1} "
            f"({len(batch)} chunks)"
        )

        vectorstore.add_documents(batch)

        print("✅ Batch Indexed")

        # Wait before next batch
        if i + batch_size < len(chunks):
            print("⏳ Waiting 60 seconds to avoid Gemini rate limit...")
            time.sleep(60)

    print("🎉 Vector Store Created Successfully")

    return True

def chat(video_id, question):