from sentence_transformers import SentenceTransformer
from supabase import create_client
from google import genai
from dotenv import load_dotenv
import os

# Load credentials from .env
load_dotenv()

# --- Supabase setup ---
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

# --- Embedding model setup ---
model = SentenceTransformer("all-MiniLM-L6-v2")

# --- Gemini setup ---
gemini_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=gemini_key)


def retrieve_context(question: str, n_results: int = 3) -> str:
    """Find the most relevant textbook chunks for a given question."""
    query_embedding = model.encode(question).tolist()
    result = supabase.rpc("match_chunks", {
        "query_embedding": query_embedding,
        "match_count": n_results
    }).execute()
    return "\n\n".join(row["content"] for row in result.data)


def call_llm(prompt: str) -> str:
    """Send a prompt to Gemini and return the response text."""
    response = gemini_client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt
    )
    return response.text


def explain_fault(fault_type: str, component: str) -> str:
    """Full RAG pipeline: retrieve textbook context, then generate an explanation."""
    query = f"{fault_type} fault in {component} causes and effects"
    context = retrieve_context(query)

    prompt = f"""Using these excerpts from an electric circuits textbook:

{context}

Explain in 2-3 simple sentences why a {fault_type} might occur in a {component}, for a student who just detected this fault in their circuit."""

    return call_llm(prompt)