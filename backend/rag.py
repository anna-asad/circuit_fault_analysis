from sentence_transformers import SentenceTransformer
from supabase import create_client
from google import genai
from dotenv import load_dotenv
import os

# Lazy-loaded dependencies (only initialized when first needed)
_model = None
_supabase = None
_gemini_client = None

def _get_model():
    """Lazy load the embedding model only when needed."""
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def _get_supabase():
    """Lazy load Supabase client only when needed."""
    global _supabase
    if _supabase is None:
        load_dotenv()
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        _supabase = create_client(supabase_url, supabase_key)
    return _supabase

def _get_gemini_client():
    """Lazy load Gemini client only when needed."""
    global _gemini_client
    if _gemini_client is None:
        load_dotenv()
        gemini_key = os.getenv("GEMINI_API_KEY")
        _gemini_client = genai.Client(api_key=gemini_key)
    return _gemini_client


def retrieve_context(question: str, n_results: int = 3) -> str:
    """Find the most relevant textbook chunks for a given question."""
    model = _get_model()
    supabase = _get_supabase()
    query_embedding = model.encode(question).tolist()
    result = supabase.rpc("match_chunks", {
        "query_embedding": query_embedding,
        "match_count": n_results
    }).execute()
    return "\n\n".join(row["content"] for row in result.data)


def call_llm(prompt: str) -> str:
    """Send a prompt to Gemini and return the response text."""
    gemini_client = _get_gemini_client()
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