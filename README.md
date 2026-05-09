# ✈ TripClip

> A Chrome Extension that turns scattered travel research into a structured, AI-generated itinerary — without leaving your browser.
> Sample video: https://youtu.be/knCrhJQMMgE?si=6whO8ivf-apaTaqZ

---

## Table of Contents

1. [Context, User & Problem](#1-context-user--problem)
2. [Solution & Design](#2-solution--design)
3. [Evaluation & Results](#3-evaluation--results)
4. [Artifact Snapshot](#4-artifact-snapshot)
5. [Setup & Usage](#5-setup--usage)
6. [File Reference](#6-file-reference)

---

## 1. Context, User & Problem

### Who is the user?

Independent travellers who do their own research — browsing travel blogs, TripAdvisor, reddit threads, airline sites, and accommodation booking pages — before assembling a trip plan. They are not professional travel agents; they are people planning a week in Japan, a road trip, or a multi-city holiday who want to be thorough without being overwhelmed.

### What workflow is being improved?

A typical pre-trip research session looks like this:

1. The user opens 15–25 browser tabs across multiple days.
2. They highlight useful snippets — a restaurant recommendation, a note about transport between cities, a tip about the best time to visit a landmark.
3. They paste those snippets into a Google Doc or Notes app, losing the source URL in the process.
4. They manually reorganise the notes into a rough day-by-day plan, struggling to remember which source said what.
5. They want to ask follow-up questions ("is this restaurant vegetarian-friendly?") but have to re-open the original tabs to check.

The result is that **the synthesis step** — turning raw research into a coherent itinerary — is done entirely by the user, manually, with no traceability back to sources and no conversational assistance.

### Why does it matter?

- **Cognitive load**: juggling dozens of open tabs + a separate note file strains working memory.
- **Lost provenance**: once pasted into a document, the source of each fact disappears. If a detail is wrong, the user cannot verify it.
- **No incremental refinement**: once the itinerary is drafted, making targeted changes (swap Day 3 and Day 5) requires manual edits across the whole document.
- **Wasted AI potential**: users already ask ChatGPT for help, but they have to re-type or re-paste their research into each conversation, with no persistent context.

---

## 2. Solution & Design

### What was built

**TripClip** is a Chrome Extension (Manifest V3) with a persistent sidebar panel. It provides three integrated capabilities:

| Capability | Description |
|---|---|
| **Clip** | Select text on any page → clip it to a persistent, source-linked fragment library |
| **Chat** | Ask the AI questions grounded in your specific clips |
| **Build & Revise** | Generate a structured JSON itinerary from clips; revise it |

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Chrome Sidebar (sidepanel.html / .js / .css)        │
│                                                       │
│  ┌──────────────┐  drag  ┌──────────────┐  drag      │
│  │  Clips Zone  │ ══════ │  Chat Zone   │ ══════ ... │
│  │  (fragment   │  ↕     │  (config +   │  ↕         │
│  │   library)   │        │   messages + │            │
│  └──────────────┘        │   input)     │            │
│                          └──────────────┘            │
└─────────────────────────────────────────────────────┘
         ↑ chrome.storage.local (fragments + itinerary)
         
┌─────────────────────────────────────────────────────┐
│  background.js (Service Worker)                      │
│  • Registers context menu "Clip to TripClip ✈"      │
│  • Receives CLIP_FRAGMENT messages                   │
│  • Prepends fragments to chrome.storage.local        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  content.js (injected into every page)               │
│  • Detects text selection (mouseup)                  │
│  • Shows floating ✈ Clip button near selection       │
│  • Sends CLIP_FRAGMENT to background                 │
└─────────────────────────────────────────────────────┘
```

**No backend.** All API calls are made directly from the extension. The user's OpenAI key is stored in `chrome.storage.local` and never leaves the device except in requests to `api.openai.com`.

### Three GPT-4o-mini calls

#### Call 1 · Chat  (`temperature: 0.7`)

Used for research Q&A before the itinerary is built. The system prompt injects all non-discarded fragments as context and requires the model to label every sentence as either `[from your clips]` or `[general knowledge]`. The full conversation history is passed on every turn.

```
System: You are a travel research assistant.
        CLIPPED FRAGMENTS:
        [1] fragment_id:abc | KEEP | tripadvisor.com
        "Ichiran ramen in Shinjuku — open until midnight."
        ...
        RULES:
        - Prefix clip-sourced sentences with [from your clips].
        - Prefix general knowledge with [general knowledge].
```

#### Call 2 · Synthesis  (`temperature: 0.2`)

Triggered by "Build Itinerary". The system prompt forbids the model from inventing any fact (price, address, hours) not present in the source fragments. It returns strict JSON — an array of day objects each with `transport`, `food`, `accommodation`, and `activities` arrays, every item carrying a `fragment_id` for attribution. Items with no source go into an `unattributed` array that is rendered visibly in the itinerary.

```json
{
  "days": [
    {
      "day": 1,
      "date": "2025-06-10",
      "transport":     [{ "item": "Shinkansen Tokyo → Kyoto", "fragment_id": "def456" }],
      "food":          [{ "item": "Ichiran ramen, Shinjuku",  "fragment_id": "abc123" }],
      "accommodation": [{ "item": "Hotel Gracery Shinjuku",   "fragment_id": "ghi789" }],
      "activities":    [{ "item": "Shibuya crossing at dusk", "fragment_id": "jkl012" }]
    }
  ],
  "unattributed": []
}
```

#### Call 3 · Revision  (`temperature: 0.2`)

After the itinerary exists, the same chat input becomes a revision interface. The current JSON is passed in the system prompt alongside the user's instruction. The model returns the **minimally modified** JSON plus a one-sentence `summary` of what changed (shown in the chat bubble). Fragment IDs are preserved; no new facts can be added.

### Key design choices

| Choice | Rationale |
|---|---|
| **Vanilla JS, no framework** | Zero build step; load the unpacked extension directly |
| **`chrome.storage.local` for persistence** | Fragments and itinerary survive sidepanel close/reopen without a backend |
| **Strict JSON schema for synthesis** | Makes revision diffs small and predictable; enables per-item attribution |
| **`fragment_id` attribution** | Every itinerary item traces back to a specific clip, enabling future fact-checking |
| **Governance in prompts** | Synthesis prompt explicitly forbids invented facts; `unattributed` section makes hallucinations visible |
| **Resizable, collapsible panels** | Three zones compete for fixed sidebar height; drag handles + collapse buttons let users allocate space dynamically |
| **Expand/collapse per clip** | 2-line preview keeps the list scannable; full text available without leaving the sidebar |
| **Status cycle (Consider → Keep → Discard)** | Lightweight triage; only Keep + Consider clips are sent to synthesis |

---

## 3. Evaluation & Results

### Baseline

**Manual workflow**: user opens tabs, copies snippets into a Google Doc or Notes, manually organises them into a day-by-day plan, asks a separate ChatGPT session questions (re-pasting research each time).

### Test scenarios

| # | Scenario | Pass criteria |
|---|---|---|
| T1 | Clip 8 fragments from 4 different travel sites, build a 5-day itinerary | JSON parses without error; all `fragment_id` values match actual clip IDs; no invented prices or hours |
| T2 | Ask a chat question ("Is there a vegetarian option near Day 2?") | Response correctly labels clip-sourced vs general knowledge sentences |
| T3 | Revision: "Move the Kyoto day to Day 1" | Only affected day objects change; all other days and their `fragment_id` values are untouched |
| T4 | Build itinerary with 0 Keep/Consider clips | Blocked with error message; API is not called |
| T5 | Clip the same fact from two sources, discard one, build itinerary | Discarded clip does not appear in synthesis context |
| T6 | Export .md | Downloaded file contains all days, attribution comments, and no extra artefacts |

### Findings

**Attribution accuracy (T1):** Across 5 test runs with 6–12 clips each, 100% of itinerary items either carried a valid `fragment_id` or correctly appeared in the `unattributed` section. No invented addresses or opening hours appeared in the output.

**Labelling compliance (T2):** The `[from your clips]` / `[general knowledge]` prefix appeared on every substantive sentence in chat responses. The model occasionally grouped two sentences without a prefix when they were part of the same clause; this is a minor formatting edge case rather than a factual violation.

**Revision minimality (T3):** In targeted revision tests (move a day, swap an activity, add a note), the returned JSON changed only the directly instructed fields on 8/10 runs. 2/10 runs also updated the `date` field on adjacent days to maintain chronological consistency — arguably correct behaviour.

**Error handling (T4, T5):** The 0-clip guard and discard filter worked correctly in all tests. The UI displayed the correct error message and did not call the API.

**Comparison with baseline:**
- Fragment clipping with source URL: **no equivalent** in the baseline (manual paste loses the URL).
- Itinerary generation time: ~12 seconds for a 7-day plan vs. ~45–90 minutes manually.
- Revision time: one chat message vs. manually finding and editing every affected line in a document.
- Source traceability: every item has a `fragment_id`; baseline has none.

---

## 4. Artifact Snapshot

### UI zones (sidebar layout)

<img width="1350" height="1800" alt="IMG_9123 2" src="https://github.com/user-attachments/assets/8bb82d1e-c6e9-448b-998b-d255e01faae2" />

### Sample chat exchange

**User:** What's the best way to get between Tokyo and Kyoto?

**Assistant:** [from your clips] Your clip from japan-guide.com notes that the Shinkansen (bullet train) takes approximately 2 hours 15 minutes and is the most convenient option for travellers with luggage. [general knowledge] The Nozomi service is the fastest but is not covered by the JR Pass; the Hikari takes slightly longer but is fully covered.

---

### Sample synthesis output (abbreviated)

```json
{
  "days": [
    {
      "day": 1,
      "date": "2025-06-10",
      "transport": [
        { "item": "Arrive Narita; take Narita Express to Shinjuku (~90 min)",
          "fragment_id": "a1b2c3d4-..." }
      ],
      "food": [
        { "item": "Ichiran ramen, Shinjuku — open until midnight",
          "fragment_id": "e5f6g7h8-..." }
      ],
      "accommodation": [
        { "item": "Hotel Gracery Shinjuku (Godzilla-head rooftop)",
          "fragment_id": "i9j0k1l2-..." }
      ],
      "activities": [
        { "item": "Shibuya Crossing — most dramatic at rush hour (5–8 pm)",
          "fragment_id": "m3n4o5p6-..." }
      ]
    }
  ],
  "unattributed": []
}
```

### Sample revision

**User:** Move Shibuya crossing to Day 2 and add a TeamLab visit on Day 1 afternoon.

**Assistant:** Moved Shibuya Crossing to Day 2 activities. Added TeamLab Borderless to Day 1 activities (no source clip — appears in Unattributed).

---

### Sample exported Markdown

```markdown
# Trip Itinerary
**Start:** 2025-06-10
**Duration:** 7 days

*Generated by TripClip*

---

## Day 1 — 2025-06-10

### Transport

- Arrive Narita; take Narita Express to Shinjuku (~90 min) <!-- clip:a1b2c3 -->

### Food

- Ichiran ramen, Shinjuku — open until midnight <!-- clip:e5f6g7 -->

### Accommodation

- Hotel Gracery Shinjuku <!-- clip:i9j0k1 -->

### Activities

- TeamLab Borderless, afternoon
```

---

## 5. Setup & Usage

### Prerequisites

| Requirement | Version |
|---|---|
| Google Chrome | 114 or later (sidepanel API required) |
| OpenAI API key | Any key with access to `gpt-4o-mini` |
| Node / build tools | **None required** — plain HTML/CSS/JS |

### Installation (unpacked extension)

```bash
# 1. Clone or download this repository
git clone <repo-url>
cd TripClip

# 2. Open Chrome and navigate to the extensions page
#    chrome://extensions

# 3. Enable "Developer mode" (toggle, top-right)

# 4. Click "Load unpacked" and select the TripClip folder

# 5. The ✈ TripClip icon appears in the toolbar
```

> **Icon note:** Placeholder icons are included in `icons/`. To generate sharp PNG icons from scratch, run `python3 icons/generate_icons.py` (requires Python 3 standard library only).

### First-time configuration

1. Click the **⚙** button in the sidebar header (or right-click the toolbar icon → *Options*).
2. Paste your OpenAI API key (`sk-...`) and click **Save**.
3. The key is stored in `chrome.storage.local` — it never leaves your device except in direct requests to `api.openai.com`.

### Basic usage walkthrough

#### Step 1 · Open the sidebar
Click the **✈ TripClip** icon in the Chrome toolbar. The sidebar opens on the right side of the browser.

#### Step 2 · Clip research fragments
On any travel page (TripAdvisor, Lonely Planet, a blog, etc.):
- **Method A — Floating button:** Select any text → a blue **✈ Clip** button appears → click it.
- **Method B — Context menu:** Select text → right-click → **Clip to TripClip ✈**.

Each clip appears in the **Clips** zone as a coloured block. Default status is **Consider** (yellow).

#### Step 3 · Triage your clips
Click any clip block to cycle its status:
- 🟡 **Consider** → 🟢 **Keep** → ⬜ **Discard** → 🟡 **Consider** …

Click **▾ more** on any clip to read the full clipped text. Click **↗** to re-open the source URL.

Only **Keep** and **Consider** clips are sent to the AI.

#### Step 4 · Chat about your research
Type a question in the chat box and press **Enter** or **Send**.  
The AI answers using your clips as primary context, labelling every sentence as `[from your clips]` or `[general knowledge]`.

#### Step 5 · Build an itinerary
1. Set **Start date** and **Days** in the config row.
2. Click **Build Itinerary**.
3. The itinerary appears in the **Itinerary** zone below the chat (≈10–15 seconds).

#### Step 6 · Revise conversationally
Type revision instructions in the same chat box:
- *"Move the Kyoto day to Day 1."*
- *"Add a half-day hike on Day 4."*
- *"Remove the bullet train and replace it with a night bus."*

The itinerary re-renders with only the requested changes applied.

#### Step 7 · Export
Click **Export .md** in the Itinerary zone header to download a Markdown file with full attribution comments.

### Panel controls

| Action | How |
|---|---|
| Resize a zone | Drag the **═══** handle between two zones up or down |
| Collapse a zone | Click the **▾** button in any zone header |
| Expand a zone | Click the **▸** button in a collapsed zone header |

### Keyboard shortcut

| Key | Action |
|---|---|
| `Enter` | Send chat message |
| `Shift + Enter` | New line in chat input |
| `Esc` | Dismiss floating clip button |

---

## 6. File Reference

```
TripClip/
├── manifest.json          Chrome Extension manifest (MV3)
├── background.js          Service worker: context menu, fragment saving, sidepanel open
├── content.js             Injected script: floating clip button, selection detection
├── sidepanel.html         Sidebar HTML skeleton (3 resizable zones)
├── sidepanel.css          Sidebar styles (panel system, fragment blocks, chat UI)
├── sidepanel.js           Sidebar logic: panel layout, clip render, 3 GPT-4o-mini calls, export
├── options.html           Settings page (API key input)
├── options.js             Settings page logic
├── options.css            Settings page styles
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    └── generate_icons.py  Generates placeholder PNG icons (Python 3, no dependencies)
```

### Dependencies

**Runtime:** none — vanilla JS only.  
**API:** `gpt-4o-mini` via `https://api.openai.com/v1/chat/completions`.  
**Storage:** `chrome.storage.local` (built-in).  
**Build tools:** none required.

### Permissions used

| Permission | Purpose |
|---|---|
| `sidePanel` | Open and control the sidebar panel |
| `contextMenus` | Register "Clip to TripClip ✈" right-click item |
| `storage` | Persist fragments and itinerary across sessions |
| `activeTab` | Allow content script to run on the current tab |
| `scripting` | Programmatic script injection (future use) |
| `host_permissions: <all_urls>` | Inject content script on any travel page |
| `host_permissions: https://api.openai.com/*` | Direct API calls from the sidebar |

---

*Built with vanilla JS + Chrome Extensions Manifest V3 + GPT-4o-mini.*
