import os
from pathlib import Path

from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import (
    GoogleGenerativeAIEmbeddings,
    ChatGoogleGenerativeAI,
)
from langchain_community.vectorstores import Chroma

from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import (
    RunnableLambda,
    RunnablePassthrough,
    RunnableParallel,
)
from langchain_core.output_parsers import StrOutputParser


# ==========================================
# Load Environment Variables
# ==========================================

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("GOOGLE_API_KEY not found in .env")


# ==========================================
# Helper Function
# ==========================================

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


# ==========================================
# Fetch Transcript
# ==========================================

video_id = "RoLv6iJzStY"

api = YouTubeTranscriptApi()

try:
    transcript = api.fetch(video_id, languages=["en"])
    text = " ".join(chunk.text for chunk in transcript)
    print("✅ Transcript fetched successfully!")

except Exception as e:
    print(e)
    exit()


# ==========================================
# Split Transcript
# ==========================================

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
)

chunks = text_splitter.create_documents([text])

print(f"Total Chunks : {len(chunks)}")


# ==========================================
# Embeddings
# ==========================================

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=api_key,
)


# ==========================================
# Create Vector Store
# (Run this once)
# ==========================================

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="vectorstore",
    collection_name="youtube_transcript",
)

print("✅ Vector Store Created")


# ==========================================
# Retriever
# ==========================================

retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k":4}
)


# ==========================================
# LLM
# ==========================================

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=api_key,
)


# ==========================================
# Prompt
# ==========================================

prompt = PromptTemplate(
    template="""
You are a helpful AI assistant.

Answer ONLY from the provided transcript context.

If the answer is not available in the context, reply:

"I don't know."

Context:
{context}

Question:
{question}
""",
    input_variables=["context", "question"],
)


# ==========================================
# Output Parser
# ==========================================

parser = StrOutputParser()


# ==========================================
# RAG Chain
# ==========================================

parallel_chain = RunnableParallel(
    context=retriever | RunnableLambda(format_docs),
    question=RunnablePassthrough(),
)

final_chain = (
    parallel_chain
    | prompt
    | llm
    | parser
)


# ==========================================
# Ask Question
# ==========================================

question = "Is the alien topic discussed in this video?"

answer = final_chain.invoke(question)

print("\nAnswer:\n")
print(answer)