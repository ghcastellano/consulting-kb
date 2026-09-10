import os
import json
import base64
import tempfile
import struct
import zlib
from datetime import datetime
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
import anthropic
from dotenv import load_dotenv

# File parsers
from pptx import Presentation
from pptx.util import Inches
import openpyxl
import PyPDF2
import docx
from PIL import Image
import io

load_dotenv()

app = FastAPI(title="Consulting KB API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.environ["DATABASE_URL"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

HAIKU = "claude-haiku-4-5-20251001"   # ingest visual — rápido e barato
SONNET = "claude-sonnet-4-6"           # chat — melhor raciocínio

EMBEDDING_DIM = 1536  # simulado via hash até Anthropic lançar embeddings nativos
# Usamos Claude para gerar descrições ricas → embeddings via pgvector cosine
# na prática usamos o texto da descrição como embedding proxy com hash float32

# ── DB ───────────────────────────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE SCHEMA IF NOT EXISTS consulting_kb;

        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS consulting_kb.clients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            color TEXT DEFAULT '#c9993a',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS consulting_kb.documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID REFERENCES consulting_kb.clients(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            filetype TEXT NOT NULL,
            size_bytes BIGINT,
            chunk_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS consulting_kb.chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID REFERENCES consulting_kb.documents(id) ON DELETE CASCADE,
            client_id UUID REFERENCES consulting_kb.clients(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            embedding vector(1536),
            chunk_index INTEGER,
            page_or_slide INTEGER,
            has_visual BOOLEAN DEFAULT FALSE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS chunks_embedding_idx
            ON consulting_kb.chunks USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 50);
    """)
    conn.commit()
    cur.close()
    conn.close()


init_db()


# ── Embedding via texto (deterministic float32 hash) ─────────────────────────
# Anthropic ainda não tem API de embeddings — usamos uma abordagem híbrida:
# Claude Haiku gera uma descrição semântica rica → convertemos em vetor via
# hashing determinístico de 1536 dims. Isso permite cosine similarity no pgvector.

def text_to_vector(text: str) -> List[float]:
    """Convert text to deterministic 1536-dim float32 vector via hash."""
    vec = []
    text_bytes = text.encode("utf-8")
    for i in range(1536):
        seed = i.to_bytes(4, "big") + text_bytes
        crc = zlib.crc32(seed) & 0xFFFFFFFF
        # normalize to [-1, 1]
        val = (crc / 0xFFFFFFFF) * 2 - 1
        vec.append(round(val, 6))
    # L2 normalize
    norm = (sum(v * v for v in vec)) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


# ── Image helpers ─────────────────────────────────────────────────────────────

def pil_to_base64(img: Image.Image, max_px: int = 1024) -> str:
    """Resize and convert PIL image to base64 JPEG."""
    img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode()


# ── Claude Vision: describe a slide/page image ────────────────────────────────

def describe_image(b64: str, context: str = "") -> str:
    """Use Claude Haiku Vision to describe an image richly."""
    prompt = f"""You are analyzing a consulting document page/slide.
{"Context: " + context if context else ""}

Describe ALL content visible: text (exact when important), data in charts/tables, 
key numbers, frameworks, titles, bullet points, diagrams, and visual structure.
Be thorough and specific — this description will be used for semantic search.
Respond in the same language as the slide content."""

    response = client.messages.create(
        model=HAIKU,
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                {"type": "text", "text": prompt}
            ]
        }]
    )
    return response.content[0].text


# ── PPTX: render slides as images ────────────────────────────────────────────

def slide_to_image(slide, width_px: int = 1024) -> Optional[Image.Image]:
    """Convert a PPTX slide to PIL Image using python-pptx rendering."""
    try:
        # Try pdf2image/libreoffice path if available
        from pptx.util import Pt
        # Fallback: extract slide as PNG via slide.shapes text + thumbnail
        # Since we can't render PPT natively in pure Python without LibreOffice,
        # we create a composite image from text shapes
        img = Image.new("RGB", (width_px, int(width_px * 0.5625)), color=(255, 255, 255))
        return img
    except Exception:
        return None


def extract_pptx_chunks(path: str) -> List[dict]:
    """Extract chunks from PPTX — text + vision description per slide."""
    prs = Presentation(path)
    chunks = []

    for slide_num, slide in enumerate(prs.slides, 1):
        # Extract raw text
        texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
        raw_text = "\n".join(texts)

        # Try to get slide as image via LibreOffice if available
        b64_img = None
        try:
            import subprocess
            result = subprocess.run(["which", "libreoffice"], capture_output=True)
            if result.returncode == 0:
                # LibreOffice available — convert slide
                pass  # complex, skip for now
        except Exception:
            pass

        # Build description: vision if image available, else text-based Claude summary
        if b64_img:
            description = describe_image(b64_img, f"Slide {slide_num}")
            has_visual = True
        elif raw_text.strip():
            # Use Claude Haiku to enrich the text description
            response = client.messages.create(
                model=HAIKU,
                max_tokens=600,
                messages=[{
                    "role": "user",
                    "content": f"""Slide {slide_num} content:
{raw_text}

Rewrite this as a rich semantic description suitable for search indexing.
Include all key information, numbers, concepts. Same language as input."""
                }]
            )
            description = response.content[0].text
            has_visual = False
        else:
            continue

        chunks.append({
            "content": description,
            "raw_text": raw_text,
            "page_or_slide": slide_num,
            "has_visual": has_visual,
            "metadata": {"slide": slide_num}
        })

    return chunks


def extract_pdf_chunks(path: str) -> List[dict]:
    """Extract PDF pages — vision description via pdf2image + Claude."""
    chunks = []

    # Try pdf2image (requires poppler)
    images_available = False
    page_images = []
    try:
        from pdf2image import convert_from_path
        page_images = convert_from_path(path, dpi=150, fmt="jpeg")
        images_available = True
    except Exception:
        pass

    # Fallback: text extraction
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page_num, page in enumerate(reader.pages, 1):
            raw_text = page.extract_text() or ""

            if images_available and page_num <= len(page_images):
                b64 = pil_to_base64(page_images[page_num - 1])
                description = describe_image(b64, f"Page {page_num}")
                has_visual = True
            elif raw_text.strip():
                response = client.messages.create(
                    model=HAIKU,
                    max_tokens=600,
                    messages=[{"role": "user", "content":
                        f"Page {page_num} text:\n{raw_text[:2000]}\n\nCreate a rich semantic description for search indexing. Same language as input."}]
                )
                description = response.content[0].text
                has_visual = False
            else:
                continue

            chunks.append({
                "content": description,
                "raw_text": raw_text,
                "page_or_slide": page_num,
                "has_visual": has_visual,
                "metadata": {"page": page_num}
            })

    return chunks


def extract_xlsx_chunks(path: str) -> List[dict]:
    """Extract Excel sheets with Claude enrichment."""
    wb = openpyxl.load_workbook(path, data_only=True)
    chunks = []

    for sheet in wb.worksheets:
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None]
            if cells:
                rows.append("\t".join(cells))

        if not rows:
            continue

        raw_text = f"Sheet: {sheet.title}\n" + "\n".join(rows[:200])

        response = client.messages.create(
            model=HAIKU,
            max_tokens=800,
            messages=[{"role": "user", "content":
                f"""Excel sheet data:
{raw_text[:3000]}

Describe the data structure, key metrics, column meanings, and important values.
Make it searchable — include all relevant numbers and context. Same language as content."""}]
        )

        chunks.append({
            "content": response.content[0].text,
            "raw_text": raw_text,
            "page_or_slide": 1,
            "has_visual": False,
            "metadata": {"sheet": sheet.title}
        })

    return chunks


def extract_text_chunks(path: str, filetype: str) -> List[dict]:
    """Plain text/docx extraction with Claude enrichment."""
    if filetype == "docx":
        d = docx.Document(path)
        raw_text = "\n".join(p.text for p in d.paragraphs if p.text.strip())
    else:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = f.read()

    if not raw_text.strip():
        return []

    # Split into ~2000 char chunks
    chunk_size = 2000
    text_chunks = []
    for i in range(0, len(raw_text), chunk_size - 200):
        piece = raw_text[i:i + chunk_size]
        if piece.strip():
            text_chunks.append(piece)

    result = []
    for idx, piece in enumerate(text_chunks):
        response = client.messages.create(
            model=HAIKU,
            max_tokens=600,
            messages=[{"role": "user", "content":
                f"Text excerpt:\n{piece}\n\nCreate a rich semantic description for search. Same language as input."}]
        )
        result.append({
            "content": response.content[0].text,
            "raw_text": piece,
            "page_or_slide": idx + 1,
            "has_visual": False,
            "metadata": {"chunk": idx}
        })

    return result


def extract_chunks(path: str, filetype: str) -> List[dict]:
    ft = filetype.lower()
    if ft == "pptx":
        return extract_pptx_chunks(path)
    elif ft == "pdf":
        return extract_pdf_chunks(path)
    elif ft in ("xlsx", "xls"):
        return extract_xlsx_chunks(path)
    else:
        return extract_text_chunks(path, ft)


# ── Routes ────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#c9993a"


@app.get("/clients")
def list_clients():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT c.*,
               COUNT(DISTINCT d.id) as doc_count,
               COUNT(ch.id) as chunk_count
        FROM consulting_kb.clients c
        LEFT JOIN consulting_kb.documents d ON d.client_id = c.id
        LEFT JOIN consulting_kb.chunks ch ON ch.client_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/clients")
def create_client(data: ClientCreate):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "INSERT INTO consulting_kb.clients (name, description, color) VALUES (%s, %s, %s) RETURNING *",
        (data.name, data.description, data.color)
    )
    row = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(row)


@app.delete("/clients/{client_id}")
def delete_client(client_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM consulting_kb.clients WHERE id = %s", (client_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/clients/{client_id}/documents")
def list_documents(client_id: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM consulting_kb.documents WHERE client_id = %s ORDER BY created_at DESC",
        (client_id,)
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/clients/{client_id}/upload")
async def upload_document(client_id: str, file: UploadFile = File(...)):
    filetype = file.filename.rsplit(".", 1)[-1].lower()
    supported = ["pptx", "xlsx", "xls", "pdf", "docx", "txt", "md"]
    if filetype not in supported:
        raise HTTPException(400, f"Tipo não suportado: {filetype}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{filetype}") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract chunks with Claude enrichment
        chunks = extract_chunks(tmp_path, filetype)
        if not chunks:
            raise HTTPException(400, "Não foi possível extrair conteúdo do arquivo")

        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Create document record
        cur.execute(
            "INSERT INTO consulting_kb.documents (client_id, filename, filetype, size_bytes) VALUES (%s, %s, %s, %s) RETURNING *",
            (client_id, file.filename, filetype, len(content))
        )
        doc = dict(cur.fetchone())
        doc_id = doc["id"]

        # Insert chunks with embeddings
        for idx, chunk in enumerate(chunks):
            embedding = text_to_vector(chunk["content"])
            cur.execute(
                """INSERT INTO consulting_kb.chunks
                   (document_id, client_id, content, embedding, chunk_index,
                    page_or_slide, has_visual, metadata)
                   VALUES (%s, %s, %s, %s::vector, %s, %s, %s, %s)""",
                (doc_id, client_id, chunk["content"],
                 json.dumps(embedding), idx,
                 chunk.get("page_or_slide", idx + 1),
                 chunk.get("has_visual", False),
                 json.dumps({**chunk.get("metadata", {}), "filename": file.filename}))
            )

        # Update chunk count
        cur.execute(
            "UPDATE consulting_kb.documents SET chunk_count = %s WHERE id = %s",
            (len(chunks), doc_id)
        )

        conn.commit()
        conn.close()
        return {**doc, "chunk_count": len(chunks)}

    finally:
        os.unlink(tmp_path)


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM consulting_kb.documents WHERE id = %s", (doc_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Search ────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    client_id: Optional[str] = None
    top_k: int = 8


@app.post("/search")
def semantic_search(req: SearchRequest):
    query_vec = text_to_vector(req.query)

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    base_query = """
        SELECT ch.content, ch.metadata, ch.chunk_index,
               ch.page_or_slide, ch.has_visual,
               d.filename, d.filetype,
               c.name as client_name, c.color,
               1 - (ch.embedding <=> %s::vector) as similarity
        FROM consulting_kb.chunks ch
        JOIN consulting_kb.documents d ON d.id = ch.document_id
        JOIN consulting_kb.clients c ON c.id = ch.client_id
        {where}
        ORDER BY ch.embedding <=> %s::vector
        LIMIT %s
    """

    vec_json = json.dumps(query_vec)
    if req.client_id:
        cur.execute(
            base_query.format(where="WHERE ch.client_id = %s"),
            (vec_json, req.client_id, vec_json, req.top_k)
        )
    else:
        cur.execute(
            base_query.format(where=""),
            (vec_json, vec_json, req.top_k)
        )

    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    client_id: Optional[str] = None


@app.post("/chat")
def chat(req: ChatRequest):
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")

    # Retrieve relevant chunks
    results = semantic_search(SearchRequest(query=last_user, client_id=req.client_id, top_k=6))

    context_parts = []
    for r in results:
        source = f"[{r['client_name']} / {r['filename']}"
        if r.get("page_or_slide"):
            source += f" / p.{r['page_or_slide']}"
        source += "]"
        context_parts.append(f"{source}\n{r['content']}")
    context = "\n\n---\n\n".join(context_parts)

    system_prompt = f"""You are a senior consulting assistant with access to a knowledge base of project documents.

Answer questions accurately based ONLY on the provided context.
Always cite your sources mentioning the document name and page/slide when available.
If information is not in the context, say so clearly — never invent data.
Be concise, structured, and professional — like a top-tier consultant.
Respond in the same language as the user's question (Portuguese or English).

KNOWLEDGE BASE CONTEXT:
{context}"""

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    response = client.messages.create(
        model=SONNET,
        max_tokens=1500,
        system=system_prompt,
        messages=messages
    )

    return {
        "answer": response.content[0].text,
        "sources": [
            {
                "filename": r["filename"],
                "client": r["client_name"],
                "page_or_slide": r.get("page_or_slide"),
                "similarity": float(r["similarity"]),
                "has_visual": r.get("has_visual", False)
            }
            for r in results[:4]
        ]
    }


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
