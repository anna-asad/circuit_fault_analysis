from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

BOOK_NAME = "Basic-Electrical-Engineering"  # change per book
PDF_PATH = "Basic-Electrical-Engineering.pdf"                 # change per book

reader = PdfReader(PDF_PATH)
full_text = "\n".join(page.extract_text() for page in reader.pages)

words = full_text.split()
chunk_size, overlap = 500, 100
chunks = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size - overlap)]
print(f"{len(chunks)} chunks created")

model = SentenceTransformer("all-MiniLM-L6-v2")

for i, chunk in enumerate(chunks):
    embedding = model.encode(chunk).tolist()
    supabase.table("book_chunks").insert({
        "content": chunk,
        "embedding": embedding,
        "source": BOOK_NAME
    }).execute()
    if (i + 1) % 50 == 0:
        print(f"Uploaded {i + 1}/{len(chunks)}...")

print("Done!")