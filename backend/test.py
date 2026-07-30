from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
model = SentenceTransformer("all-MiniLM-L6-v2")
question = "What is Ohm's law and how does it relate voltage current and resistance?"
query_embedding = model.encode(question).tolist()

result = supabase.rpc("match_chunks", {
    "query_embedding": query_embedding,
    "match_count": 3
}).execute()

for row in result.data:
    print(f"Similarity: {row['similarity']:.3f}")
    print(row['content'][:200], "...\n")