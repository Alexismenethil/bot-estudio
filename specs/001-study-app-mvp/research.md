# Phase 0 Research: Personal Study App Core Features

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05

Every "NEEDS CLARIFICATION" from Technical Context plus the two research mandates
from the planning input are resolved below. Format per decision: Decision /
Rationale / Alternatives considered.

---

## R1. Local RAG for page citations when Gemini is unavailable (planning-input mandate)

**Question**: Can the local WebGPU model receive enough of the document directly in
its context window, or does it need its own embedding-retrieval step before
generating?

**Decision**: The local model always receives **retrieved chunks, never the whole
document**. Retrieval is required in both fallback scenarios; only the *retriever*
changes:

| Scenario | Retriever | Generator | Page citation source |
|----------|-----------|-----------|----------------------|
| Normal | pgvector top-k (server) | Gemini | `page_number` on retrieved chunks |
| **A. Gemini down, backend reachable** | pgvector top-k (server) — same query embedding path, no Gemini involved | Local WebGPU model | Same `page_number` metadata, passed through unchanged |
| **B. No backend connectivity** | Client-side cosine top-k over the IndexedDB-cached chunks+embeddings of the currently open document | Local WebGPU model | `page_number` stored with each cached chunk |
| B, cache absent/insufficient | — | — | FR-030 "temporarily unavailable" (cache absent) or the FR-007 "cannot answer from the document" rule (retrieval returns nothing relevant) — never invented |

**Rationale**:
- Context-window math rules out whole-document stuffing: a small instruct model
  practical on a mid-range phone has a 4k–8k token window (Phi-3-mini-4k class),
  while a course PDF is routinely 50k–500k tokens. Even models advertising longer
  windows degrade sharply on long-context recall at q4 quantization, and prefill
  time on mobile WebGPU makes multi-thousand-token prompts painfully slow. Top-k
  (k=6) chunks of ~400 tokens ≈ 2.5k tokens of context fits comfortably and keeps
  first-token latency acceptable.
- Accurate page citations REQUIRE retrieval metadata regardless of window size: the
  citation comes from the chunk's stored `page_number`, not from the model "knowing"
  page boundaries. A model given raw concatenated text cannot cite pages reliably;
  a model given chunks tagged `[p. 37]` just copies the tag. This is also how the
  citation is made testable (SC-002) — the pipeline, not the LLM, guarantees the
  page number's provenance.
- Scenario A reuses the exact same server retrieval as the normal path because
  query embedding does NOT depend on Gemini (see R3) — so a Gemini quota/timeout
  failure cannot take retrieval down with it.
- Scenario B is possible because opening a document warms an IndexedDB cache
  (chunks + their embeddings + page numbers, fetched from the server while online)
  and the query embedding can be computed client-side with the same embedding model
  running under transformers.js. Cosine top-k over ≤ a few thousand cached vectors
  in JS is milliseconds — no index needed.
- Microsoft's reference "RAG with Phi-3-mini in the browser" architecture
  (WebGPU + ONNX Runtime Web + transformers.js) validates exactly this
  retrieve-then-read shape for in-browser small models.

**Alternatives considered**:
- *Whole-document context stuffing*: rejected — window overflow on real PDFs,
  unusable prefill latency on phones, and no trustworthy page provenance.
- *Client-side vector DB (e.g., Voy/wasm HNSW)*: rejected — YAGNI at ≤ few
  thousand chunks per document; brute-force cosine is fast enough (Principle VII).
- *Ship a summarized "mini-document" to the client*: rejected — summaries lose the
  page fidelity that FR-005 requires.

## R2. Exact behavior when the WebGPU fallback itself is unavailable (planning-input mandate)

**Decision**: `navigator.gpu` absent, adapter request failure, insufficient
memory/OOM during model init, and model-weights-not-cached-while-offline are all
classified as **local-engine failure**, indistinguishable at the fallback-chain level
from a local inference crash. The chain then terminates in the FR-030 state: explicit
"temporarily unavailable" message + the student's question/explanation preserved for
retry. Each cause is logged distinctly (Principle VIII: `engine=local`,
`failure_class=unsupported|oom|not_cached|inference_error`) even though the UX
outcome is identical.

**Rationale**: One deterministic failure taxonomy keeps `askWithFallback()` a pure,
mutation-testable decision function; the spec already defines the terminal state
(FR-030), so no new UX is invented. Distinct log classes preserve debuggability
without adding UI branches.

**Alternatives considered**: Prompting the user to download the model on demand when
offline — impossible (offline) and adds a state the spec doesn't define; silently
retrying Gemini in a loop — violates FR-030's explicit-message requirement.

## R3. Embedding model: one model, three call sites

**Decision**: `intfloat/multilingual-e5-small` (384-dim) via transformers.js
(`@huggingface/transformers`), executed in three places against identical weights:
(1) server-side at document ingestion (chunk embeddings → pgvector `vector(384)`),
(2) server-side for query embedding on the normal and Scenario-A paths,
(3) client-side (WASM/WebGPU) for query embedding on the Scenario-B offline path.

**Rationale**:
- Embeddings must NOT come from the Gemini API: quota exhaustion or network loss
  would kill retrieval exactly when the fallback needs it (defeats FR-008).
- Content is Spanish (course PDFs, IS-481 etc.), so a multilingual model is
  required; e5-small is the standard small multilingual retriever with ONNX builds
  that run in both Node and browser.
- Same model everywhere ⇒ query and chunk vectors live in one space; the cached
  chunk embeddings downloaded for Scenario B are directly comparable to
  client-computed query embeddings. ~120 MB ONNX (q8) is a tolerable one-time
  client download, cached by the browser (Cache Storage) for reuse.

**Alternatives considered**: Gemini `text-embedding` API (rejected — couples
retrieval availability to the exact service being fallen back from);
`all-MiniLM-L6-v2` (rejected — English-centric, weak on Spanish);
`multilingual-e5-base` (rejected — 2× size for marginal gain at this corpus scale).

## R4. Local generation model (WebGPU)

**Decision**: Default `Phi-3-mini-4k-instruct` ONNX, `q4f16` (~1.8–2.1 GB) when
`navigator.deviceMemory ≥ 6` and WebGPU is available; otherwise
`Qwen2.5-1.5B-Instruct` ONNX q4 (~1.0 GB) as the low-memory profile. Model id is a
single constant pair — not a user-facing setting (Principle VII). Weights load via
transformers.js with progress UI and are cached in browser Cache Storage; a load
failure at any point is a local-engine failure per R2.

**Rationale**: Phi-3-mini is the reference model for in-browser WebGPU RAG and fits
int4 in ~2 GB; mid-range phones (the constraint in the planning input) often cap a
tab well below that, so a ~1 GB 1.5B model is the honest mobile profile. Both
handle Spanish acceptably for grounded QA over provided chunks (the retrieval does
the heavy lifting; the model mostly reads).

**Alternatives considered**: Phi-3.5-mini (fine, but 3.8B q4 is the same memory
class as Phi-3-mini — no reason to add a second large profile); WebLLM/MLC engine
(rejected — second inference stack when transformers.js already serves both the
embedder and generator; Principle VII); Gemma-2-2B (comparable; Qwen2.5-1.5B chosen
for smaller footprint and better multilingual showing at this size).

## R5. PDF pipeline: viewer, extraction, storage

**Decision**: `pdfjs-dist` renders the viewer (page-by-page canvas, zoom, page nav —
FR-002) and extracts per-page text client-side at upload time. Upload sends the PDF
binary to Vercel Blob and the per-page text array to the server, which chunks
(page-aware, ~400 tokens, no cross-page chunks) and embeds into
`document_chunks(page_number, content, embedding)`. Non-PDF or unparseable files are
rejected at this step with an explicit error (spec edge case).

**Rationale**: pdf.js is the only serious in-browser PDF stack; extracting where the
file already is (client) avoids a serverless PDF-parsing dependency and keeps the
upload route a simple metadata+chunks write. Page-aware chunking is what makes
FR-005 page citations exact by construction.

**Alternatives considered**: Server-side extraction with `pdf-parse`/`unpdf`
(workable, but duplicates pdf.js which the viewer already ships, and page-accurate
extraction is more mature in pdf.js); storing PDFs as bytea in Postgres (rejected —
50 MB binaries don't belong in Neon rows; Blob is the platform-native store).

## R6. Passcode gate in middleware

**Decision**: `middleware.ts` matches every route except `/unlock` and static
assets. `/api/unlock` verifies the submitted passcode against `APP_PASSCODE` (env)
using a double-HMAC timing-safe comparison (Web Crypto `SubtleCrypto`, Edge-runtime
compatible — no Node `crypto.timingSafeEqual` on Edge), then sets an HttpOnly,
Secure, SameSite=Lax cookie containing an HMAC-SHA256-signed token (via `jose`,
`HS256`, secret from `SESSION_SECRET` env, 30-day expiry). Middleware verifies the
signature on each request; failure ⇒ redirect to `/unlock`.

**Rationale**: Satisfies FR-026 (a lock, not accounts) with zero DB state; `jose` +
Web Crypto is the documented Edge-safe pattern (Node `crypto` is unavailable in
middleware); double-HMAC comparison sidesteps the missing `timingSafeEqual` without
hand-rolling constant-time logic.

**Alternatives considered**: Basic Auth (rejected — poor mobile UX, no logout/expiry
control); NextAuth/Auth.js (rejected — an account system the spec explicitly
excludes); storing the raw passcode in the cookie (rejected — signature-verified
token means the secret never round-trips).

## R7. Data access: Drizzle ORM on Neon

**Decision**: Drizzle ORM with `@neondatabase/serverless` (HTTP driver) and the
`pgvector` column type; migrations via `drizzle-kit`. `CREATE EXTENSION vector` is
migration 0001.

**Rationale**: pgvector is first-class on every Neon plan; Drizzle has native
`vector` column + cosine-distance operators, is serverless-driver-friendly, and
generates plain SQL migrations the instructor can read (academic-rigor section of
the constitution). Prisma's pgvector story still routes through raw SQL — worse fit.

**Alternatives considered**: Prisma (heavier, pgvector via `Unsupported` type);
plain `pg` + hand-written SQL (loses typed schema that keeps data-model.md and code
verifiably in sync).

## R8. Gemini integration shape

**Decision**: `@google/genai` SDK, model `gemini-2.5-flash` for both the assistant
(US1) and Feynman evaluation (US5). All calls go through `src/lib/ai/gemini.ts`,
which classifies failures into the taxonomy `{timeout (AbortController, 10 s),
quota (HTTP 429 / RESOURCE_EXHAUSTED), network (fetch TypeError/offline)}` — the
three constitution-mandated modes — plus `invalid_response`. Feynman evaluation
requests JSON output against a fixed schema (`responseSchema`), then
`feynman-eval.ts` (pure, mutation-tested) validates/normalizes it into the
correct/missing/wrong structure; the same normalizer parses local-model output, so
US5's contract is engine-agnostic (FR-023, FR-025).

**Rationale**: Flash-class latency fits SC-001; one call-site module is what makes
Principle V's "every Gemini call handles all three failure modes" checkable and
testable (MSW simulates each mode against this single seam).

**Alternatives considered**: Vercel AI SDK (nice streaming ergonomics but adds an
abstraction layer over exactly the error details the constitution requires us to
classify; rejected per Principle VII).

## R9. Mutation & property testing wiring

**Decision**: StrykerJS with `@stryker-mutator/vitest-runner` (Stryker ≥ 9 supports
Vitest natively), `mutate` limited to `src/lib/engine/**`, `src/lib/scoring/**`,
`src/lib/ai/feynman-eval.ts`, with `thresholds: { break: 80 }` enforcing the
constitution's ≥80% score. fast-check property suites live in `tests/property/` and
run under plain Vitest (they also count toward killing mutants). Timer math
(`remainingMs(startedAt, durationMs, now)`) is pure and included in the property
suite (FR-020/FR-029 invariants: never negative, monotonic in `now`, resume equals
real elapsed time).

**Rationale**: Scoping `mutate` to the constitution-named modules keeps runs
minutes-fast and the 80% gate meaningful; property tests are the cheapest mutant
killers for arithmetic logic.

**Alternatives considered**: Mutating the whole `src/` tree (rejected — UI mutants
produce noise the constitution doesn't require and would make the gate flaky).

## R10. Accessibility verification stack

**Decision**: Two layers: (1) `vitest-axe` assertions in component tests for
interactive primitives (tabs, timer, card reveal, chat overlay); (2) a Playwright
suite that visits every screen in a seeded state and runs `@axe-core/playwright`
with WCAG 2.1 A/AA tags, failing on any violation — this is the SC-008 gate.
Manual spot-checks on Exam and Feynman screens are a checklist item in tasks.md per
the constitution.

**Rationale**: axe-core is the constitution's named tool; the screen-level sweep is
what "100% of screens, zero critical violations" (SC-008) literally measures, and
component-level checks catch regressions earlier in the TDD loop.

**Alternatives considered**: Lighthouse CI a11y audits (rejected — coarser, slower,
duplicate of axe), eslint-plugin-jsx-a11y alone (kept as a linter nicety but it
cannot verify rendered contrast/focus, so it doesn't discharge SC-008).

## R11. Server-authoritative exam timer

**Decision**: An exam session stores `started_at` (server timestamp) and
`duration_seconds`. Remaining time is always derived: client renders a countdown
from server-provided values; every answer submission is validated server-side
against `now > started_at + duration` (late answers rejected, exam auto-finalized).
Reopening the app re-derives remaining time from the same fields (FR-029, US4-AC5/6);
if the deadline passed while away, the report simply finalizes grading over the
answers already stored.

**Rationale**: The clock cannot be paused, spoofed, or lost by closing the tab —
"timer keeps running in background" falls out of arithmetic instead of a background
process. The derivation function is pure ⇒ property-testable (R9).

**Alternatives considered**: Client-held countdown with periodic sync (rejected —
loses state on close, cheatable, and adds reconciliation complexity for nothing).

---

### Sources

- [Transformers.js v3: WebGPU Support](https://huggingface.co/blog/transformersjs-v3) · [Transformers.js docs](https://huggingface.co/docs/transformers.js/index) · [transformers.js GitHub](https://github.com/huggingface/transformers.js/)
- [RAG with WebGPU + ONNX Runtime Web + Transformers.js + Phi-3-mini (Microsoft)](https://techcommunity.microsoft.com/blog/educatordeveloperblog/use-webgpu--onnx-runtime-web--transformer-js-to-build-rag-applications-by-phi-3-/4190968)
- [Running LLMs in the Browser (WebGPU/transformers.js overview)](https://pockit.tools/blog/run-llms-browser-webgpu-transformers-js-chrome-built-in-ai-guide/) · [WebGPU browser inference costs/support 2026](https://www.buildmvpfast.com/blog/webgpu-browser-ai-inference-cost-savings-2026)
- [Stryker Vitest runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) · [StrykerJS 7.0 announcement (Vitest support)](https://stryker-mutator.io/blog/announcing-stryker-js-7/) · [@stryker-mutator/vitest-runner (npm)](https://www.npmjs.com/package/@stryker-mutator/vitest-runner)
- [Neon pgvector docs](https://neon.com/docs/extensions/pgvector) · [Neon–Vercel integration](https://neon.com/docs/guides/vercel-overview)
- [web-timing-safe-equal (double-HMAC pattern for Edge)](https://github.com/advename/web-timing-safe-equal) · [Verifying HMAC signatures with SubtleCrypto in Vercel Edge](https://medium.com/@jackoddy/verifying-slack-signatures-using-web-crypto-subtlecrypto-in-vercels-edge-runtime-45c1a1d2b33b)
