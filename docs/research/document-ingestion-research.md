# Document Ingestion Research

**Date:** 2026-05-31
**Scope:** PDF text extraction, OCR for images and scanned PDFs, DOCX extraction, chunking strategies, vector storage, and end-to-end RAG pipeline design for Emma's `/api/emma/ingest/document` route.

---

## 1. PDF Text Extraction

### 1.1 pdf-parse

**Install:** `npm install pdf-parse`

**API:**

```ts
import pdfParse from "pdf-parse";
const data = await pdfParse(buffer);
// data.text       — full extracted text as a string
// data.numpages   — page count
// data.info       — PDF metadata (author, title, creation date)
// data.metadata   — XMP metadata if present
```

**What it returns:** A flat string of all text content, with page breaks loosely preserved via newlines. Does not return per-page text by default (you can pass a `pagerender` callback to get per-page output).

**Limitations:**

- No OCR. If the PDF is a scanned image (no embedded text layer), `data.text` returns an empty string. There is no fallback.
- Complex multi-column layouts can produce garbled reading order.
- Known issue with encrypted PDFs — throws an exception rather than returning partial output.
- Underlying engine is based on an older fork of PDF.js and is not kept in lockstep with Mozilla's releases.
- The package has not been actively maintained (last meaningful release was several years ago). There are open issues about Next.js/webpack bundling conflicts when imported in App Router server components.

**Bundle size:** approximately 2.3 MB unminified, ~900 KB gzipped, because it bundles the PDF.js render pipeline even though Emma only needs text extraction.

**Runtime requirement:** Node.js only. Cannot run in Edge Runtime because it uses Node.js `Buffer`, `fs` shims, and native Canvas bindings for certain codepaths. Must use `export const runtime = 'nodejs'` in the route segment config.

**Verdict:** Usable for basic text-based PDFs. Fragile, unmaintained, large bundle. See pdfjs-dist for a better alternative.

---

### 1.2 pdfjs-dist (Mozilla PDF.js)

**Install:** `npm install pdfjs-dist`

**Current version at time of research:** v4.x (distributed via NPM; the `mozilla/pdfjs-dist` GitHub repo was archived July 2024 — releases now go directly to NPM from the main `mozilla/pdf.js` repo).

**API for Node.js text extraction:**

```ts
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// In Node.js, disable the worker (runs synchronously in-process)
GlobalWorkerOptions.workerSrc = "";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pages.push(pageText);
  }
  return pages.join("\n\n");
}
```

Use the `legacy/` build path for Node.js — the standard build targets modern browsers and uses dynamic `import()` in ways that can confuse the Next.js bundler.

**Advantages over pdf-parse:**

- Actively maintained by Mozilla (used in Firefox).
- Better handling of complex layouts, ligatures, and Unicode text.
- Per-page iteration gives clean page boundaries (useful for metadata tagging chunks).
- Can be configured to run in a Web Worker in the browser for zero blocking.
- Handles password-protected PDFs (can pass a `password` option).

**Limitations:**

- Still no OCR — same scanned-PDF problem as pdf-parse.
- Node.js runtime only on Vercel (not Edge Runtime). The WASM worker will not initialise in the Edge sandbox.
- Larger install: the full `pdfjs-dist` package is ~12 MB on disk because it ships fonts, CMap data, and multiple build targets. In practice the Vercel function bundle only includes the files you `import`, but `standard_fonts/` and `cmaps/` directories must be included via `outputFileTracingIncludes` if PDF.js needs to load them at runtime.
- Initial cold-start is slower than pdf-parse (~200-400 ms for the first call on a cold function).

**Verdict for Emma:** This is the right choice for text-based PDF extraction. More robust, actively maintained. Use the `legacy/` build in the Node.js runtime.

---

### 1.3 pdf2json

**Install:** `npm install pdf2json`

**What it does:** Built on top of PDF.js (like pdf-parse), but outputs structured JSON with page geometry — each text item has `x`, `y`, `width`, `height`, `text` and `R` (rotation) fields, not just raw string content.

**API:**

```ts
import PDFParser from "pdf2json";

const parser = new PDFParser();
parser.on("pdfParser_dataReady", (pdfData) => {
  const rawText = parser.getRawTextContent();
  // pdfData.Pages[n].Texts[m].R[0].T is a URI-encoded text fragment
});
parser.on("pdfParser_dataError", (err) => {
  /* ... */
});
parser.loadPDF("./file.pdf");
// OR
parser.parseBuffer(buffer);
```

**Zero dependencies** since v3.1.6 (the parser now ships its own PDF.js fork inline).

**When to use it:** When you need spatial coordinates — for example, to reconstruct table layout or to identify columns in forms. For plain RAG text extraction the coordinate data is unused overhead.

**Limitations:** Same as pdf-parse: no OCR, Node.js only. The event-based API is more awkward than pdfjs-dist's promise API. Text encoding requires `decodeURIComponent` on each fragment.

**Verdict for Emma:** Not the right primary tool. The structured output adds value only when spatial layout matters, which it does not for embedding-based retrieval. Useful if a future requirement involves form field extraction.

---

### 1.4 Which library to use for Emma

Use **pdfjs-dist** with the `legacy/` build in the Node.js runtime. The route must declare:

```ts
export const runtime = "nodejs";
export const maxDuration = 60; // PDFs can be slow; bump if needed
```

The 4.5 MB Vercel request body limit is a hard ceiling on upload size. A 4 MB PDF (compressed) contains 20-50 pages of dense text for typical documents — which is sufficient for the target use case. Larger uploads should be rejected with a clear error before any parsing begins.

---

## 2. OCR for Images and Scanned PDFs

### 2.1 Tesseract.js

**Install:** `npm install tesseract.js`
**Current version:** v7 (requires Node.js v16+)

**API:**

```ts
import { createWorker } from "tesseract.js";

const worker = await createWorker("eng");
const {
  data: { text },
} = await worker.recognize(imageBuffer);
await worker.terminate();
```

For multiple images, create the worker once and call `recognize` repeatedly before terminating.

**How it works:** Ships a WebAssembly port of the C++ Tesseract OCR engine. Language data (`.traineddata` files) are downloaded on first use and cached. The English model is ~4 MB compressed.

**Accuracy:** Good for clean printed documents (95%+ character accuracy on clear scans). Degrades on low-resolution images, handwriting, unusual fonts, or documents with heavy noise. Tesseract.js explicitly states it does not modify the Tesseract recognition model — it wraps it as-is.

**Speed:** Approximately 3-7 seconds per page on a Vercel serverless function (single-thread WASM, no GPU). For a 10-page scanned PDF this could hit the 60 s function timeout. The WASM binary is ~8 MB; cold-start adds ~1-2 s on top.

**Language support:** 100+ languages via separate `.traineddata` files. Multi-language recognition: `createWorker(['eng', 'fra'])`.

**Output formats beyond text:** Can return word bounding boxes (`hocr`, `tsv`), confidence scores, and block/paragraph/line/word breakdowns. These are disabled by default in v6+ to reduce output size.

**Platform:** Runs in both browser and Node.js. No Edge Runtime support (needs WASM + large binary).

**Limitations:**

- Does not support PDF input — images only. A scanned PDF must first be rasterised per-page (requires an additional library like `sharp` or `canvas`) before Tesseract can process it.
- Slow enough that it should run asynchronously, not as part of a user-blocking request.
- The WASM binary must be bundled or fetched; Vercel function size limit (250 MB) can be approached if language packs accumulate.

---

### 2.2 Google Cloud Vision API

**REST endpoint:** `POST https://vision.googleapis.com/v1/images:annotate`

**Features relevant to Emma:**

- `TEXT_DETECTION` — fast OCR for images with sparse text (receipts, labels).
- `DOCUMENT_TEXT_DETECTION` — layout-aware OCR for dense documents (contracts, forms). Returns paragraph, block, and word-level bounding boxes.
- Both features also work on PDF/TIFF files via the `files:asyncBatchAnnotate` method (processes multiple pages server-side, results written to GCS).

**Pricing (as of May 2026, confirmed from Google Cloud pricing page):**

- First 1,000 units/month: free.
- Units 1,001 to 5,000,000: $1.50 per 1,000 units (one image = one unit).
- Document Text Detection: same $1.50 per 1,000 units.

**Accuracy:** Best-in-class for printed text, including poor-quality scans and handwriting. Google's model is continuously updated. Significantly better than Tesseract.js on edge cases.

**Latency:** ~300-800 ms per image (network round-trip). Much faster than Tesseract.js for single images, but adds an external dependency and billing.

**Setup for Emma:** Requires a GCP project + service account + `GOOGLE_APPLICATION_CREDENTIALS` env var (or a `GOOGLE_VISION_API_KEY`). Adds operational overhead that may not be worth it for an optional feature.

**Handwriting:** `DOCUMENT_TEXT_DETECTION` handles handwritten text reasonably well — accuracy varies by handwriting quality. This is where it clearly outperforms Tesseract.js.

---

### 2.3 OpenAI Vision (GPT-4o / OpenRouter)

Since Emma already uses OpenRouter, vision models are available without adding a new API dependency.

**Approach:** Send the image as base64 with a prompt like `"Extract all text from this image verbatim. Return only the text content."` via the vision model endpoint.

**Cost:** Approximately $0.00765 per image at 768px detail (OpenAI's "low" resolution mode), or $0.0153+ for high-detail mode. Via OpenRouter prices vary slightly by model.

**Accuracy on printed text:** Comparable to Google Vision for clean documents. GPT-4o handles complex mixed-language documents and tables better than Tesseract.js.

**Accuracy on handwriting:** GPT-4o significantly outperforms both Tesseract.js and Google Vision on messy or cursive handwriting. It can contextually reconstruct partially illegible words.

**Latency:** 2-6 seconds depending on image size and queue pressure. Slower than Google Vision but already in Emma's architecture.

**Limitation:** The vision model cannot process a whole multi-page PDF at once — each page must be rasterised and sent as a separate image. A 20-page scanned PDF would cost ~$0.15-0.30 and take 40-120 seconds sequentially. Parallelise page requests to reduce wall time.

---

### 2.4 Which OCR approach to use for Emma

Two-tier recommendation:

**Free tier / all plans:** Tesseract.js for single-page images and scanned PDFs with up to 3-5 pages. Run it in a background job or queue if possible to avoid timeout risk. For scanned PDFs, rasterise pages with `sharp` before passing to Tesseract.

**Pro plan:** Route OCR through the existing OpenRouter vision model (already configured in Emma's `vision/route.ts`). This avoids a new API dependency, handles handwriting well, and costs roughly $0.01 per image — reasonable for Pro users. Parallelise page calls with `Promise.all` with a concurrency cap.

Google Cloud Vision is the highest-accuracy option but adds a billing relationship and env var that Emma does not currently have. Not recommended unless accuracy requirements escalate beyond what GPT-4o provides.

---

## 3. DOCX Extraction

### 3.1 mammoth

**Install:** `npm install mammoth`
**Stars:** 6.2k. Actively maintained (last commit May 2026).

**What it does:** Converts `.docx` files to clean HTML or raw text, using the semantic structure of Word styles rather than attempting to reproduce visual formatting.

**API:**

```ts
import mammoth from "mammoth";

// From a file path:
const result = await mammoth.convertToHtml({ path: "document.docx" });
const html = result.value; // clean HTML string
const warnings = result.messages; // conversion warnings

// From a Buffer:
const result = await mammoth.convertToHtml({ buffer: docxBuffer });

// Raw text only (no HTML tags):
const result = await mammoth.extractRawText({ buffer: docxBuffer });
const text = result.value;
```

**Supported elements:** Headings, lists (ordered and unordered), tables (content preserved, border styling ignored), footnotes, endnotes, images (inline base64 by default), bold, italic, underline, strikethrough, superscript, subscript, links, line breaks, text boxes (treated as paragraphs after the containing paragraph), comments.

**Style mapping:** Customisable. For example, a Word paragraph styled `"Contract Heading"` can be mapped to `<h2>` by passing `styleMap`. Defaults cover standard Word styles.

**Security note:** mammoth does no sanitisation of embedded HTML in the source `.docx`. Treat output as untrusted if the file came from a user. Strip scripts before storing or rendering.

**Bundle size:** ~250 KB. No native binaries, pure JavaScript. Works in both Node.js and browser.

**Limitations:**

- Does not support `.doc` (legacy Word 97-2003 binary format). Only `.docx` (OOXML).
- Complex tables lose border/shading information.
- Embedded images are included as base64 data URIs in the HTML by default; for RAG purposes these should be stripped or handled separately.
- Markdown output is deprecated in mammoth — the maintainer recommends converting the HTML output to Markdown with a separate library if needed.

### 3.2 docx2txt

A minimal alternative that shells out to the Python `docx2txt` script or uses a pure-JS port. Not recommended: smaller ecosystem, less reliable with edge case OOXML structures, no TypeScript types.

### 3.3 Verdict for Emma

**mammoth is the clear choice for DOCX.** It is actively maintained, has a simple async API, works in Node.js serverless without native binaries, and handles the semantic structure of Word documents well. Use `extractRawText` for RAG ingestion (avoids carrying HTML tags into the chunk text).

---

## 4. Chunking Strategies for RAG

### 4.1 Why chunking matters

Large documents cannot be passed wholesale to the LLM. A 50-page contract is ~25,000 tokens — far exceeding a usable context injection budget. Chunking breaks the text into retrieval units that can be embedded individually and retrieved by semantic similarity at query time.

### 4.2 Fixed-size chunking

Split text every N characters or tokens, with an overlap of 10-20% to avoid severing a concept across a chunk boundary.

```
Chunk 1: characters 0..1024
Chunk 2: characters 896..1920  (128-character overlap)
Chunk 3: characters 1792..2816
...
```

**Pros:** Trivially simple. No dependencies. Predictable embedding cost (every chunk costs approximately the same).

**Cons:** Cuts sentences mid-way, which harms embedding quality. A sentence that starts at the end of chunk 3 and finishes at the start of chunk 4 gets split between two embeddings, degrading recall for that content.

**When to use:** Bulk ingestion of structured data (CSV exports, log files) where semantic coherence within a chunk matters less.

---

### 4.3 Sentence-boundary chunking

Split only at sentence boundaries (`.`, `?`, `!` followed by whitespace), then merge sentences into groups that fit within the target token budget.

```
Group 1: sentences until cumulative length >= 512 tokens
Group 2: includes last 1-2 sentences of Group 1 (overlap), continues until >= 512 tokens
...
```

**Pros:** Preserves semantic units. Each chunk is a coherent thought. Better embedding quality than fixed-size because the model can "understand" the chunk as a complete utterance.

**Cons:** Chunk sizes are variable (a paragraph of short sentences vs. one very long sentence). May require post-processing to enforce hard limits.

**Recommended for Emma** for prose documents (contracts, meeting notes, emails, reports).

---

### 4.4 Semantic chunking

Embed each sentence individually, then merge adjacent sentences if their cosine similarity exceeds a threshold. Start a new chunk when similarity drops (a "topic shift").

**Pros:** Chunks align with actual topic boundaries, not arbitrary position boundaries. Best retrieval recall for long documents covering multiple subjects.

**Cons:** Expensive — requires N embedding API calls for a document of N sentences before any storage happens. On a 20-page document (~500 sentences) this is 500 embedding calls upfront. Too slow for synchronous ingestion. Could work as a background job.

**Verdict:** Not recommended for Emma's initial implementation. Revisit for Pro/Enterprise tiers where users upload large corpora.

---

### 4.5 RecursiveCharacterTextSplitter (LangChain TypeScript)

The `@langchain/textsplitters` package provides `RecursiveCharacterTextSplitter`, which is the practical sweet spot between fixed-size and sentence-boundary chunking.

**Install:** `npm install @langchain/textsplitters`

**How it works:** Attempts to split on a hierarchy of separators in order:

1. `"\n\n"` (paragraph break)
2. `"\n"` (line break)
3. `" "` (word boundary)
4. `""` (character boundary as last resort)

For each separator, it splits the text and merges resulting pieces back up to `chunkSize`, carrying `chunkOverlap` characters from the previous chunk.

**API (confirmed from source at langchain-ai/langchainjs):**

```ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000, // target chunk size in characters (not tokens by default)
  chunkOverlap: 150, // overlap between consecutive chunks
  // lengthFunction: (text) => countTokens(text)  // optional: token-based sizing
});

const chunks = await splitter.splitText(extractedText);
// Returns string[]
```

**Key parameters from source (text_splitter.ts in langchainjs repo):**

- `chunkSize` default: 1000. The class emits a console warning if a single segment exceeds chunkSize but still creates the chunk (no silent truncation).
- `chunkOverlap` default: 200. Must be less than `chunkSize` — constructor throws if violated.
- `keepSeparator` default: true in `RecursiveCharacterTextSplitter` (the separator is kept at the start of the next chunk rather than discarded).
- `lengthFunction`: defaults to `text.length` (character count). To use token count, pass a custom function wrapping a tokeniser like `tiktoken`.
- `separators`: configurable array, defaults to `["\n\n", "\n", " ", ""]`.

**TokenTextSplitter variant:** Also in `@langchain/textsplitters`. Uses tiktoken to count tokens rather than characters. More accurate for LLM budget calculations, but adds a dependency on `js-tiktoken`.

**Standalone alternative (no LangChain dependency):** The splitting algorithm is simple enough to implement in ~50 lines. If bundle size is a concern, the logic can be inlined rather than importing the full LangChain textsplitters package.

---

### 4.6 Recommended chunk size for Emma

Target **800-1000 characters** per chunk with **150-character overlap** using `RecursiveCharacterTextSplitter`. This corresponds to roughly 200-250 tokens per chunk (English prose averages ~4 chars/token), leaving comfortable room within a 2000-token injection budget for top-3 chunks plus formatting overhead.

Why not use tokens directly? Character-based sizing is deterministic and fast. Token counting adds latency and a dependency. The character:token ratio for English prose is stable enough that 1000 chars is a reliable proxy for ~250 tokens.

**Guidance by document type:**

| Document type                 | Recommended chunk size | Notes                                  |
| ----------------------------- | ---------------------- | -------------------------------------- |
| Legal contracts / policy docs | 800-1000 chars         | Dense, many clauses; overlap important |
| Meeting notes / memos         | 500-800 chars          | Shorter, conversational                |
| Technical manuals / README    | 1000-1200 chars        | Code blocks should not be split        |
| Emails                        | 400-600 chars          | Often already short                    |

---

## 5. Vector Storage Options

### 5.1 Supabase pgvector

Emma already uses Supabase for auth, memory, and integrations. The `vector` extension (pgvector) is available on all Supabase plans via `CREATE EXTENSION IF NOT EXISTS vector`.

**Table schema for document chunks:**

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_id      text NOT NULL,           -- filename or user-assigned document ID
  chunk_index integer NOT NULL,        -- position within the document
  chunk_text  text NOT NULL,
  embedding   extensions.vector(1536), -- matches text-embedding-3-small dimensions
  created_at  timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb DEFAULT '{}'
);

-- RLS: users can only see their own chunks
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns chunks" ON document_chunks
  FOR ALL USING (auth.uid() = user_id);

-- Index for fast similarity search (add after initial data load)
CREATE INDEX ON document_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);
```

**Similarity search function (confirmed from Supabase docs):**

```sql
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding extensions.vector(1536),
  match_user_id   uuid,
  match_threshold float DEFAULT 0.75,
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  id         uuid,
  doc_id     text,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    doc_id,
    chunk_text,
    1 - (embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE user_id = match_user_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
```

Call from supabase-js:

```ts
const { data } = await supabase.rpc("match_document_chunks", {
  query_embedding: queryEmbedding,
  match_user_id: userId,
  match_threshold: 0.75,
  match_count: 3,
});
```

**Index types:**

- **HNSW** (`hnsw`): best for read-heavy workloads, high recall, low latency per query. Higher memory usage. Recommended for Emma — users upload once, query many times.
- **IVFFlat** (`ivfflat`): better for very large datasets (100k+ rows) with lower memory. Less accurate than HNSW at small-to-medium scale.

**Supabase confirmed:** The recommended pattern is to filter by user-specific columns (like `user_id`) inside the SQL function, not as a PostgREST `.eq()` chain after `rpc()`, because the outer filter prevents the vector index from being used during similarity ranking.

**Similarity operators:**

- `<=>` cosine distance (0 = identical). Safe default; does not require normalised vectors.
- `<#>` negative inner product. Faster if embeddings are normalised (OpenAI embeddings are normalised). Similarity = `-1 * result`.

---

### 5.2 OpenAI text-embedding-3-small

**Model:** `text-embedding-3-small`
**Dimensions:** 1536
**Pricing (May 2026):** $0.020 per 1 million tokens

For a 20-page document chunked into ~60 chunks of ~250 tokens each, embedding cost is:
`60 chunks x 250 tokens = 15,000 tokens = $0.0003`

For 1,000 documents: `$0.30`. Embedding cost is negligible at Emma's scale.

**API via OpenRouter** (compatible with OpenAI format, uses existing `OPENROUTER_API_KEY`):

```ts
const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/text-embedding-3-small",
    input: chunkText,
  }),
});
const { data } = await response.json();
const embedding = data[0].embedding; // float[] of length 1536
```

OpenRouter supports batched inputs: pass an array of strings to `input` to embed multiple chunks in one request (up to the model's batch limit).

---

### 5.3 Free embedding alternatives

**Hugging Face Inference API — `sentence-transformers/all-MiniLM-L6-v2`:**

- **Dimensions:** 384 (not 1536 — requires a different `vector(384)` column)
- **Free tier:** Available via Hugging Face Inference API at no cost up to rate limits (confirmed from HuggingFace model card)
- **Model size:** 22.7M parameters, Apache-2.0 license, 261M downloads/month
- **Context limit:** 256 word pieces (tokens) — chunks longer than ~180 words get silently truncated. This is a meaningful constraint — Emma's recommended 250-token chunks would be at the limit.
- **TypeScript:** Use `@huggingface/inference` client or direct REST POST to `https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2`

**Supabase's built-in `gte-small`:**

- Available as a built-in in Supabase Edge Functions via `@supabase/supabase-js` AI helpers
- 384 dimensions, runs in the Edge Functions sandbox (not in Next.js API routes)
- Useful if Emma ever migrates embedding generation to a Supabase Edge Function

**Verdict:** For Emma, use `text-embedding-3-small` via OpenRouter. The cost at Emma's scale is negligible, the quality is substantially better than MiniLM, and it requires no additional API key or configuration. If cost becomes a concern on the free plan, gate document ingestion as a Pro-only feature.

---

## 6. End-to-End Pipeline

```
User uploads file
        |
        v
POST /api/emma/ingest/document
  |- Validate file type (PDF / DOCX / image)
  |- Enforce 4.5 MB limit (Vercel body limit)
  |
  |- [PDF] --> pdfjs-dist (legacy build)
  |              |
  |              |- Has text layer? --> extractedText
  |              +- No text layer?  --> [each page] --> OCR
  |                                       |- Free:  Tesseract.js
  |                                       +- Pro:   OpenRouter vision model
  |
  |- [DOCX] --> mammoth.extractRawText --> extractedText
  |
  +- [Image] --> OCR (Tesseract.js or OpenRouter vision)
                        |
                        v
                  extractedText
                        |
                        v
        RecursiveCharacterTextSplitter
          chunkSize: 1000, chunkOverlap: 150
                        |
                        v
                  chunks: string[]
                        |
                        v
        Embed each chunk via OpenRouter
          model: openai/text-embedding-3-small
          (batch inputs array to minimise API calls)
                        |
                        v
        INSERT INTO document_chunks
          (user_id, doc_id, chunk_index, chunk_text, embedding)
                        |
                        v
        Return: { doc_id, chunk_count, page_count }
```

**At query time (inside the brain route at `/api/emma/route.ts`):**

```
User sends message
        |
        v
Embed the user message
  model: openai/text-embedding-3-small
        |
        v
supabase.rpc('match_document_chunks', {
  query_embedding, match_user_id, match_count: 3
})
        |
        v
top_chunks: [{ chunk_text, similarity, doc_id }]
        |
        v
Inject into system prompt (before conversation, after persona)
```

---

## 7. Context Injection Strategy

### 7.1 How many chunks to inject

**Recommendation: top-3 chunks by cosine similarity**, filtered by `similarity > 0.75`.

Why 3:

- 3 chunks x ~250 tokens = ~750 tokens of injected context
- Leaves room for the persona (~400 tokens), memory entries (~400 tokens), conversation history, and response
- Diminishing returns beyond 3 — chunks 4-5 are often only marginally related

If no chunks exceed the 0.75 threshold, skip injection entirely rather than injecting weakly related content.

### 7.2 Where to inject in the system prompt

Insert the document context block after the persona/memory section and before the start of the conversation. This positioning ensures Emma "reads" the document context as background knowledge before processing the conversation.

Structure:

```
[Persona text]
[Memory entries]

--- Document Context ---
[Source: filename.pdf, chunk 3/47]
<chunk_text>

[Source: filename.pdf, chunk 8/47]
<chunk_text>

[Source: contract.docx, chunk 2/12]
<chunk_text>
--- End Document Context ---

[Conversation]
```

Label each chunk with its source and position. This helps Emma attribute information correctly and gives users confidence about which document was consulted.

### 7.3 Token budget

**Hard cap: 2000 tokens** for injected document context.

At the start of context injection, measure approximate token count (4 chars/token heuristic or a tiktoken call). If top-3 chunks would exceed 2000 tokens, trim the third chunk or drop it. Never exceed the budget to avoid crowding out conversation history.

### 7.4 Handling documents with no relevant chunks

If the similarity search returns nothing above threshold, do not inject. Optionally append a note to the persona:

```
Note: The user has uploaded documents, but none contain content relevant to the current question.
```

This prevents Emma from hallucinating document content when the query is off-topic.

---

## 8. Vercel Serverless Constraints

Confirmed from Vercel documentation:

- **Request body limit:** 4.5 MB. Files larger than this must be rejected before parsing. A dedicated file storage integration (e.g. Supabase Storage) would be needed for larger uploads.
- **Function duration:** 300 s default on Hobby, configurable to 800 s on Pro. Sufficient for most documents. Tesseract.js on a 10-page scanned PDF may approach 60-90 s.
- **Bundle size:** 250 MB uncompressed. pdfjs-dist is ~12 MB on disk (tree-shaking reduces the actual included size), mammoth ~250 KB, tesseract.js WASM binary ~8 MB. Comfortably within budget.
- **Memory:** 2 GB on all plans (4 GB on Pro/Enterprise). PDF.js and Tesseract.js are memory-intensive for large documents; a 50-page PDF under pdfjs-dist may peak at 200-400 MB.
- **Edge Runtime:** Not compatible with pdfjs-dist, Tesseract.js, or pdf2json. All document processing must use `export const runtime = 'nodejs'`.

---

## 9. Open Questions for Implementation

1. **Where should document metadata live?** A separate `documents` table (filename, user_id, upload_date, page_count, doc_type) with `doc_id` as the foreign key in `document_chunks` would allow listing/deleting uploaded documents. The schema above uses `doc_id text` as a loose reference — a proper table would be cleaner.

2. **Scanned PDF detection:** How do we know if a PDF has a text layer? After extracting with pdfjs-dist, check if `extractedText.trim().length < 50` (heuristic). If so, fall back to OCR. This is not perfectly reliable for mixed documents (some pages scanned, some digital).

3. **Re-embedding on model change:** If Emma switches embedding models, all stored vectors are incompatible with new queries (different dimensions and vector space). A migration strategy is needed. Short-term: version the embedding model in the `metadata` jsonb column.

4. **Deduplication:** If a user uploads the same document twice, chunks will be duplicated. A simple guard: hash the document buffer before processing, store the hash in the `documents` table, and skip ingestion if the hash already exists for that user.

5. **Chunk deletion:** When a user deletes a document, all associated chunks must be deleted. `DELETE FROM document_chunks WHERE user_id = $1 AND doc_id = $2` is sufficient given the RLS policy.

6. **Background processing for large documents:** A synchronous ingestion route will time out on very large PDFs or scanned documents. Consider returning a `{ job_id }` immediately and processing asynchronously via Vercel Queues or a Supabase Edge Function. The existing `emma/tasks/route.ts` infrastructure could be leveraged.

7. **Image rasterisation for scanned PDFs:** pdfjs-dist does not rasterise pages to images natively in Node.js. An additional library is needed to convert PDF pages to images before Tesseract.js can process them. `canvas` (npm) or `sharp` with a PDF plugin are the main options, but both have native binary dependencies that add build complexity on Vercel.
