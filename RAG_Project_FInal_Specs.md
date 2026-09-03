# Sentinel RAG — Final Project Specification
### AI & Agentic Automation Security Platform — ITC411 Project 5

This document is the single source of truth for building the project. It supersedes any earlier draft — where a later decision contradicted an earlier one, the earlier one was changed and the change is flagged below.

---

## PART 1 — RAG Pipeline Architecture & Decisions

### 1.1 Build path
**RAG pipeline (Path A)** — primary and sufficient on its own.
**Tool-calling agent (Path B)** — optional stretch goal only if D1–D3 are solid with time remaining. Not required for a complete grade.

### 1.2 Framework: LlamaIndex — used only for the retrieval half of the pipeline
LlamaIndex handles:
- Document loading
- Chunking (`SentenceSplitter`, 300–500 tokens, overlapping)
- Embedding calls (`all-MiniLM-L6-v2` via sentence-transformers)
- Vector storage/query interface (Chroma)
- Retrieval (`index.as_retriever()` → returns raw chunks + metadata + similarity score)

**Why not LangChain as the core framework:** LangChain's strength is LangGraph-based multi-step agent orchestration, which this project doesn't need — even the optional tool stretch goal is a single callable tool, not a multi-step agent loop. LlamaIndex is purpose-built for retrieval quality (hierarchical chunking, auto-merging retrieval) and needs meaningfully less boilerplate for RAG specifically.

### 1.3 Prompt assembly: hand-built, NOT the framework's query engine
Call `retriever.retrieve(query)` to get raw chunks only. Assemble the final prompt in a plain Python function you write yourself. This is deliberate: using LlamaIndex's default query engine would hide the exact prompt-construction step where the vulnerability and the mitigation both live. Full transparency here is the actual point of the assignment.

```
retrieved_chunks = retriever.retrieve(user_query)
prompt = build_prompt(user_query, retrieved_chunks, mitigation_enabled=True/False)
```

### 1.4 LLM call: direct HTTP call to Ollama, not a framework LLM wrapper
```python
import requests
response = requests.post("http://localhost:11434/api/generate", json={
    "model": "llama3.1",
    "prompt": assembled_prompt
})
```
Since prompt assembly already bypasses the framework, a direct call keeps one less layer to explain in the viva. No benefit is gained from a framework LLM wrapper here since there's no plan to swap LLM providers.

### 1.5 Vector store: Chroma
Simplest setup, more than sufficient for a document set of 5–10 (or a few dozen, per the expanded Documents screen) files. FAISS's advantage (raw performance at large scale) is irrelevant at this scale.

### 1.6 The vulnerability: indirect prompt injection
One authored document (e.g. `faq_doc.md`) contains a hidden instruction paragraph embedded in otherwise legitimate content. A normal-looking query retrieves that chunk. Without mitigation, the LLM follows the embedded instruction (leaks system prompt / outputs attacker-planted content) instead of answering normally.

**Chunk-boundary guardrail (locked in):** `SentenceSplitter` splits along sentence/punctuation boundaries — if the payload straddles a chunk boundary, it can lose its imperative structure and cause a false negative that has nothing to do with your mitigation working. Protocol:
- Surround the payload with distinct, unrelated contextual sentences rather than placing it at the very top or bottom of the document.
- Keep the adversarial command compact — roughly 40–60 tokens, a single dense paragraph.
- Add a one-time assertion during Week 10–11 and freeze the layout once it passes:
  ```python
  retrieved = retriever.retrieve(trigger_query)
  assert len(retrieved) > 0
  assert raw_attack_string in retrieved[0].text
  ```
  Once this passes, don't touch chunk size or document layout again — treat it as frozen infrastructure for the rest of the build.

### 1.7 Mitigations — implemented as independently toggleable techniques
This is the one structural upgrade the sentinel-rag.html mockup introduced over the original plan: instead of one combined on/off switch, each technique is its own toggle, so you can demonstrate each one's individual contribution.

| Technique | Status | What it does |
|---|---|---|
| **Delimiter / instruction-hierarchy enforcement** | Primary, fully implemented | Wraps retrieved chunks in explicit tags (`<untrusted_context>...</untrusted_context>`) inside the hand-built prompt function; system prompt instructs the model never to treat tagged content as commands |
| **Input keyword sanitization** | Fully implemented, secondary | Regex/keyword strips common injection phrases ("ignore previous instructions", etc.) before a chunk reaches the prompt. Easy to demo, easy to bypass — good talking point on limitations in the report |
| **Output filtering** | Partial / exploratory, off by default | Checks the model's response for signs of a leaked system prompt before returning it. Mention as "additional layer explored" even if only partially implemented |
| **Flag threshold** | Supporting control | A similarity-to-known-attack-pattern slider (default 0.75) that determines when a retrieved chunk gets flagged for review. Not a mitigation itself — a detection sensitivity knob that feeds the other techniques and lets you answer live "what if I change the wording" questions |

**"Naive Filter" UI badge (locked in):** the keyword sanitization toggle in Settings gets a visible badge — `[Naive Keyword Filter — Known Regex Limitations]` — next to it. This preempts the obvious "what if the attacker uses synonyms/base64?" question rather than waiting for it, and gives you a direct, ready-made line for the report/viva on why syntactic filtering fails against semantic redirection. Cheap to add, disproportionately strong signal of security maturity.

### 1.8 Toggle mechanism
Each mitigation technique is its own boolean, checked inside the prompt-assembly function and the response-handling function. Exposed in the UI as individual switches (Settings screen) plus one always-visible global "Mitigation" indicator (sidebar) that reflects the current combined state. No restart required to flip any of them.

### 1.9 Logging / audit layer
SQLite (recommended over flat JSON once the app has a real backend — supports the Audit log page's filtering/export without re-parsing files on every request). Every stage logged with timestamps:
- Raw query
- Retrieved chunk(s): source document, chunk id, similarity score
- Whether the chunk was flagged (and against which threshold)
- Full assembled prompt (including which mitigations were active)
- Full LLM response
- Final status: `clean` / `flagged` / `sanitized` / `blocked` / `leaked`

This is what makes the vulnerable/mitigated comparison evidence-backed rather than a live claim.

### 1.10 App layer: **React + Tailwind CSS (frontend) + FastAPI (backend)** — changed from the earlier Streamlit decision
**This decision was corrected.** The original plan chose Streamlit purely for build speed. That directly contradicts the goal of a portfolio-grade custom UI — Streamlit cannot produce the interface designed in Part 2 of this document. The corrected architecture:

- **Backend:** FastAPI (Python) — thin REST layer wrapping the LlamaIndex retriever, the hand-built prompt function, the Ollama call, and the SQLite audit log. Endpoints needed: `POST /query`, `GET /documents`, `POST /documents/upload`, `GET /audit-log`, `GET /settings`, `POST /settings`, `GET /test-runs`.
- **Frontend:** React (Vite) + Tailwind CSS — consumes the FastAPI endpoints, owns all UI/UX described in Part 2.
- This is a small amount of extra plumbing (one FastAPI file with ~6 routes) compared to Streamlit, but it's the only way to get the interface you actually want, and it's a more realistic production pattern to speak to in interviews.

### 1.11 Security testing tool: Promptfoo
Runs the injection query systematically (e.g. 10 trials) against both mitigation states, producing the pass/fail comparison the Test suite results screen (Part 2) displays. Garak is a viable alternative but Promptfoo's structured before/after output maps more directly to what's needed here.

### 1.12 Full pipeline (end to end)

```
[Documents] → LlamaIndex: chunk + embed + Chroma store      ← framework
     → LlamaIndex: retriever.retrieve(query)                 ← framework, raw chunks out
     → build_prompt(): delimiter wrap + sanitization check   ← hand-built (mitigations live here)
     → [Log: query, chunks, prompt, active mitigations]      ← SQLite
     → requests.post() → Ollama /api/generate                ← direct API call
     → output filter check (if enabled)                      ← hand-built
     → [Log: response, final status]                         ← SQLite
     → FastAPI returns JSON → React renders result            ← app layer
```

### 1.13 Week-by-week fit (unchanged from course doc)

| Week | Task |
|---|---|
| 9 | Ollama + model running locally |
| 10 | LlamaIndex retrieval pipeline built; FastAPI skeleton + React shell scaffolded |
| 11 | Poisoned document authored and confirmed retrievable |
| 12 | Vulnerability demoed via Promptfoo, logged. Progress Presentation 1 |
| 13 | Mitigations implemented (delimiter + sanitization primary, output filtering partial) |
| 14 | Before/after comparison demoed across all toggle combinations. Progress Presentation 2 |
| 15 | End-to-end testing of all screens, polish, rehearse |
| 16 | Final live demo, report, viva |

---

## PART 2 — UI/UX Specification

### 2.1 Theme: Dark, confirmed
Base direction validated by sentinel-rag.html. Full token system below (this is the final palette — use it as-is or treat as a starting point to refine, but keep the same structure: layered dark surfaces, one accent color, status colors reserved for meaning only).

### 2.2 Design tokens

**Color**
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#08090C` | Page background |
| `--bg-sidebar` | `#0B0D12` | Sidebar background |
| `--panel` | `#0E1015` | Card/panel surface |
| `--panel-2` | `#12151D` | Raised/nested surface (e.g. code blocks, sidebar footer) |
| `--border` | `#1E2230` | Default hairline |
| `--border-strong` | `#2C3040` | Emphasized divider, input borders |
| `--violet` | `#8B7FE8` | Primary accent — active nav, primary buttons, "on" states |
| `--red` | `#E15A5A` | Danger — leaked/succeeded attack, flagged content |
| `--teal` | `#6FBFA0` | Safe — blocked attack, clean/indexed status |
| `--amber` | `#E3A23C` | Warning — processing, pending states |
| `--text-primary` | `#E7E6EE` | Primary text |
| `--text-secondary` | `#8A8CA0` | Supporting text, labels |
| `--text-muted` | `#565A6B` | Placeholders, metadata |

Each status color has a `-dim` variant (14% opacity wash) used as a badge/banner background, with the full-strength color as the text on top of it — never plain text color on a tinted background.

**Type**
- **IBM Plex Sans** — UI chrome: nav, headings, body copy, buttons
- **IBM Plex Mono** — anything that's literal data: timestamps, similarity scores, prompt/chunk text, thresholds, log tables

**Layout**
- Fixed left sidebar (190px expanded / 64px icon-only below 780px breakpoint) + main content area, max-width 980px, left-aligned
- Cards: `--panel` background, 1px `--border`, 10px radius, 16–20px padding
- Consistent 12–14px gap rhythm between grid items

### 2.3 Screen list (final — 7 screens)

| # | Screen | Status vs. sentinel-rag.html |
|---|---|---|
| 1 | Live trace (dashboard) | Present — keep as-is, this is the landing screen |
| 2 | Chat / Query console | Present — keep as-is |
| 3 | Documents | Present — keep, see note below on collections |
| 4 | Audit log | Present — keep as-is |
| 5 | **Attack replay / Trace detail** | **New — add this** |
| 6 | **Test suite results** | **New — add this** |
| 7 | Settings | Present — keep as-is, this is the strongest screen in the mockup |

### 2.4 Screen-by-screen spec

#### 1. Live trace (landing/dashboard)
- Horizontal pipeline visualization: Query → Embed → Retrieve → Scan → Generate, connected nodes, the node where something was flagged turns red with a red connecting line into it, green out of it once handled.
- Metric grid (4 cards): queries today (with sparkbar trend), injection attempts, blocked count, detection rate.
- Two-column split below: left = most recent query/answer pair with a safe/danger banner; right = flagged-document callout + recent test runs list.
- "Run test" primary button top-right — triggers the canned injection query for a live demo without retyping it.

#### 2. Chat / Query console
- Standard chat thread, right-aligned user bubbles, left-aligned AI responses.
- Each AI response shows citation chips (source file + page/section) under the answer — direct visual proof of grounding.
- Global mitigation toggle inline in the page header, always visible while chatting — flipping it changes the *next* response's behavior, not the whole thread, so a demo can show a before/after in one screen without navigating away.
- Safe/danger banner under any response that touched a flagged chunk.

#### 3. Documents
- Grid of document cards: filename, file type tag, size, status badge (`Indexed`, `Processing`, `Failed`, `Flagged pattern`).
- The one poisoned document gets a distinct warn-bordered card so you can point at it directly in the demo instead of hunting for it.
- Upload dropzone.
- **Note on collections:** the mockup groups documents into named collections (Product docs, Legal contracts, etc.). This is optional polish — for the actual graded demo you only need one working collection with your 5–10 authored documents. Keep the collection-chip UI since it's low-effort and reads well in a portfolio screenshot, but don't spend build time populating multiple real collections.

#### 4. Audit log
- Dense table: Time, Event (query received / retrieval / generation), Source document, Similarity score, Status badge.
- Filter bar: All events / Flagged only.
- Export CSV button — useful both for your report's evidence appendix and as a "professional tool" signal.
- Monospace for time and similarity columns specifically (not the whole table) — data columns only.

#### 5. Attack replay / Trace detail — new screen
Opens from clicking any flagged row in the Audit log or Live trace's recent-runs list. Full-width, two-column layout:
- **Left column — Unmitigated run:** the exact query, exact retrieved chunk (raw, unwrapped), exact prompt sent, exact response, ending in a red "succeeded" banner.
- **Right column — Mitigated run (same query, re-run):** same query, same retrieved chunk but shown wrapped in the delimiter tags, exact prompt sent, exact response, ending in a teal "blocked" banner.
- A small toolbar above both columns to re-run the same query live against the current settings, so this screen doubles as your live demo surface for the instructor's on-the-spot follow-up question.
- This is your strongest single screen for the "Technical Evidence" grading category — it's a literal side-by-side of the vulnerability and the fix.

**Substring highlighting (locked in):** the injected payload is highlighted red in the raw unmitigated chunk; the `<untrusted_context>` delimiter tags are highlighted teal in the mitigated view. Since both the exact attack substring and the exact delimiter strings are known values (you authored them), a simple split-and-map helper is the right amount of engineering here — no AST or markdown parser needed:
```typescript
function highlightTrace(text: string, attackSubstring: string): React.ReactNode[] {
  // split `text` on the known attack substring / delimiter strings
  // return an array of plain strings and <span> elements — NOT an HTML string
}
```
**Important correction:** build this as an array of React nodes (`{parts.map(p => p.match ? <span className="...">{p.text}</span> : p.text)}`), never as a concatenated HTML string passed through `dangerouslySetInnerHTML`. The retrieved chunk text is attacker-controllable by design — that's the entire premise of the vulnerability — so rendering it as raw HTML would introduce a real XSS vector into the one screen meant to demonstrate security awareness. Same visual result either way; only the React-nodes approach is safe.

#### 6. Test suite results — new screen
- Header stat row: trials run, succeeded (red), blocked (teal), block rate %.
- A simple bar chart: unmitigated success rate vs. mitigated success rate, per mitigation technique (delimiter alone / sanitization alone / both combined) — this directly visualizes the "ablation" value of having independently toggleable mitigations from section 1.7.
- A trial-by-trial table below: trial #, mitigation config used, outcome, link into Trace detail for that specific run.
- "Run Promptfoo suite" button to trigger a fresh batch live.

#### 7. Settings
- Four independently toggleable mitigation rows (delimiter, sanitization, output filtering) each with a title + one-sentence description + toggle — as built in the mockup, this is the strongest screen already; keep it exactly as designed.
- Flag threshold slider with live numeric readout.
- Read-only model/config info panel: LLM, embedding model, vector store, active knowledge base — answers viva questions about the stack without you needing to say it out loud.
- "Reset demo data" — clears the audit log and restores the document set to its original unpoisoned state, for a clean start before each live run.

**Reset implementation (locked in):** stale Chroma embeddings from earlier test runs are the most common cause of an unpredictable live RAG demo, so the reset must wipe the vector store, not just the log. A single `POST /settings/reset` handler does all of it in one call:
```python
chroma_client.delete_collection("sentinel_docs")
chroma_client.create_collection("sentinel_docs")
# re-index only the baseline 5–10 documents right here, synchronously
reindex_baseline_documents()
# then clear the SQLite audit log rows
clear_audit_log()
```
Deterministic clean-slate state in roughly 1–2 seconds, no backend restart needed. Don't split this into two separate buttons/endpoints (one for logs, one for vectors) — a partial reset (log cleared but stale vectors still present, or vice versa) is worse than no reset button at all, since it looks clean but isn't.

### 2.5 Interaction principles carried through every screen
1. The mitigation state is always visible somewhere on screen (sidebar footer at minimum) — never a setting you have to navigate away to check.
2. Status color is never decorative — red/teal/amber only ever appear when they mean danger/safe/pending. No color is spent on anything else.
3. One motion moment per meaningful state change (a flagged node/row settling into its red state) — no hover animations scattered across every card.
4. Every screen that shows a result traces back to a real logged pipeline run — nothing is a static mockup value once the backend is wired in.

---

## Stretch enhancements (Week 15, time permitting — not required for D1–D4)

These are legitimate ideas but each introduces new risk or cost close to a deadline, so they're deliberately scoped out of the core build:

| Idea | Why it's stretch, not core |
|---|---|
| **Streaming responses (SSE)** | Genuinely more convincing on the Attack Replay/Chat screens, but touches FastAPI, the Ollama call, and React state simultaneously — the kind of feature that looks 90% done and breaks during rehearsal. Build the blocking version first; only add streaming if D1–D3 are solid with time to spare. If added, scope to Chat + Attack Replay only — the Test suite screen runs batched trials, streaming adds nothing there. |
| **Dockerization** | The underlying problem (four terminal windows on demo day) is real, but Docker/Compose networking issues the night before a viva are a worse failure mode than terminal tabs you've rehearsed. Lower-risk alternative: a single `start-dev.sh` script that launches FastAPI, the React dev server, and checks Chroma/Ollama are up — same reliability benefit, no new infrastructure surface. |
| **LLM-as-a-judge output filtering** | Adds a second model call to every request (latency) and a new failure mode (a confused judge model). Output filtering is already correctly scoped as partial/exploratory — more time-efficient to write one report paragraph explaining this as the natural next step than to build and debug it under deadline pressure. |

---

## Summary of what changed from earlier drafts
- App layer: **Streamlit → React + Tailwind + FastAPI** (contradiction with portfolio-UI goal, corrected)
- Mitigation toggle: **one combined switch → three independently toggleable techniques + a threshold slider** (adopted from sentinel-rag.html, strictly better for evidence depth)
- Screens: **6 planned → 7 final** (added Attack replay/Trace detail and Test suite results; sentinel-rag.html's Live trace, Chat, Documents, Audit log, and Settings are adopted largely as designed)
- Demo-reliability guardrails added: combined Chroma + audit-log reset in one endpoint, chunk-boundary invariance test, "Naive Filter" UI badge, XSS-safe substring highlighting on Trace Detail
- Streaming, Dockerization, and LLM-as-judge filtering explicitly moved to a "Week 15, time permitting" stretch bucket — not required for core grading
