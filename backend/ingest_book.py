from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv
import os

# Load your .env credentials
load_dotenv()
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

# Extract text
reader = PdfReader("nilsson_electric_circuits_10ed.pdf")
full_text = "\n".join(page.extract_text() for page in reader.pages)

# Chunk it
words = full_text.split()
chunk_size, overlap = 500, 100
chunks = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size - overlap)]
print(f"{len(chunks)} chunks created")

# Load embedding model (downloads once, ~90MB, cached after)
print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

# Embed and upload each chunk
for i, chunk in enumerate(chunks):
    embedding = model.encode(chunk).tolist()
    supabase.table("book_chunks").insert({
        "content": chunk,
        "embedding": embedding
    }).execute()
    
    if (i + 1) % 50 == 0:
        print(f"Uploaded {i + 1}/{len(chunks)} chunks...")

print("Done! All chunks uploaded to Supabase.")