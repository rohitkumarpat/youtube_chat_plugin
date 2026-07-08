from fastapi import FastAPI
from pydantic import BaseModel
from rag import index_video
app = FastAPI()


class IndexRequest(BaseModel):
    videoId: str


class ChatRequest(BaseModel):
    videoId: str
    question: str


@app.get("/")
def home():
    return {
        "success": True,
        "message": "Python RAG API is running"
    }


@app.post("/index")
def index(request: IndexRequest):

    index_video(request.videoId)

    return {
        "success": True,
        "message": "Video Indexed Successfully"
    }


@app.post("/chat")
def chat(request: ChatRequest):

    print("Question:", request.question)

    return {
        "success": True,
        "answer": "Hello from RAG"
    }