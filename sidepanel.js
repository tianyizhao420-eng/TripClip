// sidepanel.js — Phase 1 + 2 + resizable/collapsible panels + clip expand

// ── Storage keys ───────────────────────────────────────────────────────────
const FRAGMENTS_KEY = 'tripclip_fragments';
const ITINERARY_KEY = 'tripclip_itinerary';
const API_KEY_STORE = 'tripclip_openai_key';
const OPENAI_URL    = 'https://api.openai.com/v1/chat/completions';
const MODEL         = 'gpt-4o-mini';

// ── DOM refs ───────────────────────────────────────────────────────────────
const fragmentsList    = document.getElementById('fragments-list');
const fragmentCount    = document.getElementById('fragment-count');
const noFragmentsMsg   = document.getElementById('no-fragments-msg');
const chatMessages     = document.getElementById('chat-messages');
const chatInput        = document.getElementById('chat-input');
const sendBtn          = document.getElementById('send-btn');
const buildBtn         = document.getElementById('build-btn');
const startDateInput   = document.getElementById('start-date');
const numDaysInput     = document.getElementById('num-days');
const itineraryZone    = document.getElementById('itinerary-zone');
const itineraryContent = document.getElementById('itinerary-content');
const exportBtn        = document.getElementById('export-btn');
const optionsBtn       = document.getElementById('options-btn');

// ── App state ──────────────────────────────────────────────────────────────
let fragments           = [];
let conversationHistory = [];
let currentItinerary    = null;

// Tracks which fragment IDs are currently expanded (survives re-renders)
const expandedFragments = new Set();

// ══════════════════════════════════════════════════════════════════════════════
//  PANEL LAYOUT SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

const ZONE_IDS     = ['fragments-zone', 'chat-zone', 'itinerary-zone'];
const HEADER_H     = 38;   // px — #header
const ZONE_HDR_H   = 32;   // px — .zone-header
const HANDLE_H     = 6;    // px — .resize-handle
const MIN_ZONE_H   = ZONE_HDR_H + 56; // minimum expanded height

// Current target heights (px) for each zone when expanded
const panelH       = { 'fragments-zone': 0, 'chat-zone': 0, 'itinerary-zone': 0 };
// Collapsed flags
const panelClosed  = { 'fragments-zone': false, 'chat-zone': false, 'itinerary-zone': false };
// Heights saved before collapsing (so expand restores them)
const savedH       = {};

let drag = null; // active drag state

// ── Helpers ────────────────────────────────────────────────────────────────
function visibleZones() {
  return ZONE_IDS.filter(id => !document.getElementById(id).hidden);
}

function openZones() {
  return visibleZones().filter(id => !panelClosed[id]);
}

function visibleHandleCount() {
  return document.querySelectorAll('.resize-handle:not([hidden])').length;
}

function totalAvailable() {
  return window.innerHeight - HEADER_H - visibleHandleCount() * HANDLE_H;
}

// Apply current panelH (and collapse state) to the DOM
function applyHeights() {
  visibleZones().forEach(id => {
    const el = document.getElementById(id);
    el.style.height = (panelClosed[id] ? ZONE_HDR_H : panelH[id]) + 'px';
  });
}

// Distribute totalAvailable() equally among all currently visible, open zones
function redistributeAll() {
  const open    = openZones();
  const total   = totalAvailable();
  const per     = Math.floor(total / open.length);

  open.forEach((id, i) => {
    panelH[id] = i === open.length - 1
      ? total - per * (open.length - 1)
      : per;
  });
  applyHeights();
}

// ── Init ───────────────────────────────────────────────────────────────────
function initPanelLayout() {
  redistributeAll();
  initDragHandles();
  bindCollapseButtons();
  window.addEventListener('resize', onWindowResize);
}

// ── Drag handles ───────────────────────────────────────────────────────────
function initDragHandles() {
  document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();

      const aboveId = handle.dataset.above;
      const belowId = handle.dataset.below;
      // Don't drag if either adjacent zone is collapsed
      if (panelClosed[aboveId] || panelClosed[belowId]) return;

      drag = {
        handle,
        aboveId, belowId,
        startY:    e.clientY,
        startAboveH: panelH[aboveId],
        startBelowH: panelH[belowId],
      };
      handle.classList.add('dragging');
      document.body.style.cursor      = 'ns-resize';
      document.body.style.userSelect  = 'none';
    });
  });

  document.addEventListener('mousemove', e => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    let a = drag.startAboveH + dy;
    let b = drag.startBelowH - dy;

    // Clamp both sides to MIN_ZONE_H
    if (a < MIN_ZONE_H) { b += a - MIN_ZONE_H; a = MIN_ZONE_H; }
    if (b < MIN_ZONE_H) { a += b - MIN_ZONE_H; b = MIN_ZONE_H; }

    panelH[drag.aboveId] = a;
    panelH[drag.belowId] = b;
    applyHeights();
  });

  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag.handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    drag = null;
  });
}

// ── Collapse / expand ──────────────────────────────────────────────────────
function bindCollapseButtons() {
  document.querySelectorAll('.collapse-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      togglePanel(btn.dataset.zone);
    });
  });
}

function togglePanel(zoneId) {
  const el         = document.getElementById(zoneId);
  const isCollapsed = panelClosed[zoneId];

  if (isCollapsed) {
    // ── EXPAND ──────────────────────────────────────────────────────────
    const restoreH = savedH[zoneId] || Math.floor(totalAvailable() / (openZones().length + 1));
    const extra    = restoreH - ZONE_HDR_H;

    // Take the needed space proportionally from open sibling zones
    const donors = openZones().filter(id => id !== zoneId);
    if (donors.length) {
      const donorTotal = donors.reduce((s, id) => s + panelH[id], 0);
      donors.forEach(id => {
        const share = donorTotal > 0 ? panelH[id] / donorTotal : 1 / donors.length;
        panelH[id] = Math.max(MIN_ZONE_H, panelH[id] - Math.round(extra * share));
      });
    }

    panelH[zoneId]      = restoreH;
    panelClosed[zoneId] = false;
    el.classList.remove('collapsed');

  } else {
    // ── COLLAPSE ─────────────────────────────────────────────────────────
    savedH[zoneId]      = panelH[zoneId];
    const freed         = panelH[zoneId] - ZONE_HDR_H;
    panelH[zoneId]      = ZONE_HDR_H;
    panelClosed[zoneId] = true;
    el.classList.add('collapsed');

    // Give freed space to the nearest open sibling zone
    const receiver = nearestOpenZone(zoneId);
    if (receiver) panelH[receiver] += freed;
  }

  applyHeights();
}

function nearestOpenZone(excludeId) {
  const open = openZones().filter(id => id !== excludeId);
  if (!open.length) return null;
  const idx  = ZONE_IDS.indexOf(excludeId);
  return open.find(id => ZONE_IDS.indexOf(id) > idx) || open[open.length - 1];
}

// ── Show itinerary zone (first time only) ─────────────────────────────────
function showItineraryPanel() {
  const zone     = document.getElementById('itinerary-zone');
  const handleCI = document.getElementById('handle-ci');
  if (!zone.hidden) return;

  zone.hidden     = false;
  handleCI.hidden = false;
  panelClosed['itinerary-zone'] = false;

  // Recalculate total (now includes handle-ci)
  const total  = totalAvailable();
  const itinH  = Math.max(MIN_ZONE_H, Math.floor(total * 0.32));
  const remain = total - itinH;

  // Preserve relative proportions of existing zones
  const donors  = ['fragments-zone', 'chat-zone'].filter(id => !zone.hidden);
  const dTotal  = donors.reduce((s, id) => s + panelH[id], 0);

  donors.forEach(id => {
    panelH[id] = dTotal > 0
      ? Math.max(MIN_ZONE_H, Math.floor(remain * (panelH[id] / dTotal)))
      : Math.floor(remain / donors.length);
  });

  panelH['itinerary-zone'] = remain - donors.reduce((s, id) => s + panelH[id], 0) + itinH;
  // Simpler: just assign itinH directly after adjusting donors
  panelH['itinerary-zone'] = itinH;

  applyHeights();
}

// ── Window resize ──────────────────────────────────────────────────────────
function onWindowResize() {
  const open = openZones();
  if (!open.length) return;

  const total    = totalAvailable();
  const openSum  = open.reduce((s, id) => s + panelH[id], 0);
  if (openSum <= 0) { redistributeAll(); return; }

  const ratio = total / openSum;
  open.forEach(id => {
    panelH[id] = Math.max(MIN_ZONE_H, Math.floor(panelH[id] * ratio));
  });

  // Fix rounding: last open zone absorbs remainder
  const newSum = open.reduce((s, id) => s + panelH[id], 0);
  panelH[open[open.length - 1]] += total - newSum;

  applyHeights();
}

// ══════════════════════════════════════════════════════════════════════════════
//  FRAGMENT RENDERING
// ══════════════════════════════════════════════════════════════════════════════

function loadFragments() {
  return new Promise(resolve => {
    chrome.storage.local.get([FRAGMENTS_KEY], r => {
      fragments = r[FRAGMENTS_KEY] ?? [];
      resolve();
    });
  });
}

function renderFragments() {
  const count = fragments.length;
  fragmentCount.textContent = `${count} clip${count !== 1 ? 's' : ''}`;
  fragmentsList.innerHTML = '';

  if (count === 0) {
    fragmentsList.appendChild(noFragmentsMsg);
    return;
  }
  fragments.forEach(f => fragmentsList.appendChild(buildFragmentBlock(f)));
}

function buildFragmentBlock(fragment) {
  const STATUS_LABELS = { keep: 'Keep', consider: 'Consider', discard: 'Discard' };
  const isExpanded    = expandedFragments.has(fragment.id);

  const block = document.createElement('div');
  block.className = `fragment-block ${fragment.status}${isExpanded ? ' expanded' : ''}`;
  block.dataset.id = fragment.id;

  // ── ↗ source link (top-right, never cycles status) ────────────────────
  const link = document.createElement('a');
  link.className = 'fragment-link';
  link.href = fragment.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = fragment.url;
  link.textContent = '↗';
  link.addEventListener('click', e => e.stopPropagation());

  // ── Text preview / full text ───────────────────────────────────────────
  const text = document.createElement('div');
  text.className = `fragment-text${isExpanded ? ' expanded' : ''}`;
  text.textContent = fragment.text;

  // ── Meta row: domain + status badge ───────────────────────────────────
  const meta = document.createElement('div');
  meta.className = 'fragment-meta';

  const domain = document.createElement('span');
  domain.className = 'fragment-domain';
  domain.textContent = fragment.domain;

  const badge = document.createElement('span');
  badge.className = 'fragment-status-badge';
  badge.textContent = STATUS_LABELS[fragment.status];

  meta.append(domain, badge);

  // ── Expand / collapse toggle ───────────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.className = 'fragment-toggle';
  toggle.setAttribute('aria-label', isExpanded ? 'Collapse clip' : 'Expand clip');
  toggle.innerHTML = `<i class="toggle-icon">▾</i><span class="toggle-label">${isExpanded ? 'less' : 'more'}</span>`;

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    const nowExpanded = expandedFragments.has(fragment.id);
    if (nowExpanded) {
      expandedFragments.delete(fragment.id);
      block.classList.remove('expanded');
      text.classList.remove('expanded');
      toggle.setAttribute('aria-label', 'Expand clip');
      toggle.querySelector('.toggle-label').textContent = 'more';
    } else {
      expandedFragments.add(fragment.id);
      block.classList.add('expanded');
      text.classList.add('expanded');
      toggle.setAttribute('aria-label', 'Collapse clip');
      toggle.querySelector('.toggle-label').textContent = 'less';
    }
  });

  // ── Clicking the block body cycles status ─────────────────────────────
  block.addEventListener('click', () => cycleStatus(fragment.id));

  block.append(link, text, meta, toggle);
  return block;
}

// ── Status cycling ─────────────────────────────────────────────────────────
const STATUS_CYCLE = { consider: 'keep', keep: 'discard', discard: 'consider' };

function cycleStatus(id) {
  const f = fragments.find(x => x.id === id);
  if (!f) return;
  f.status = STATUS_CYCLE[f.status];
  chrome.storage.local.set({ [FRAGMENTS_KEY]: fragments });
  renderFragments();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CHAT UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function appendSystemNote(text) {
  const div = document.createElement('div');
  div.className = 'chat-message system-note';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendError(text) {
  const div = document.createElement('div');
  div.className = 'chat-message error';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'chat-message typing';
  div.id = 'typing-indicator';
  div.textContent = '…';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
}

function setLoading(on) {
  sendBtn.disabled   = on;
  buildBtn.disabled  = on;
  chatInput.disabled = on;
  if (on) showTyping(); else removeTyping();
}

function setRevisionMode(on) {
  chatInput.placeholder = on
    ? 'Revise the itinerary (e.g. "move the beach day to Day 3")…'
    : 'Ask about your clips…';
}

// ══════════════════════════════════════════════════════════════════════════════
//  EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════════════════

function bindEvents() {
  optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  buildBtn.addEventListener('click', handleBuildItinerary);
  exportBtn.addEventListener('click', handleExport);
}

// ── Route send to chat or revision ────────────────────────────────────────
async function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  appendMessage('user', text);

  if (currentItinerary) {
    await handleRevisionCall(text);
  } else {
    await handleChatCall(text);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  OPENAI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get([API_KEY_STORE], r => resolve(r[API_KEY_STORE] ?? null));
  });
}

async function callOpenAI(messages, temperature) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key. Open Settings (⚙) to add your OpenAI key.');

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `OpenAI error ${res.status}`);
  }
  return (await res.json()).choices[0].message.content;
}

function buildFragmentContext(frags) {
  return frags.map((f, i) =>
    `[${i + 1}] fragment_id:${f.id} | ${f.status.toUpperCase()} | ${f.domain}\n"${f.text}"`
  ).join('\n\n');
}

function extractJSON(raw) {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : raw).trim();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ══════════════════════════════════════════════════════════════════════════════
//  CALL 1 · Chat  (temp 0.7)
// ══════════════════════════════════════════════════════════════════════════════

async function handleChatCall(userMessage) {
  const active = fragments.filter(f => f.status !== 'discard');

  const system = `You are a knowledgeable travel research assistant.
The user has clipped the following text fragments from the web. Use these as your PRIMARY source.

CLIPPED FRAGMENTS:
${active.length ? buildFragmentContext(active) : '(no clips yet)'}

RULES:
- When a sentence is based on one of the clips, start it with "[from your clips]".
- When you use general knowledge not found in the clips, start it with "[general knowledge]".
- Be concise and focused on travel planning.`;

  conversationHistory.push({ role: 'user', content: userMessage });

  setLoading(true);
  try {
    const reply = await callOpenAI(
      [{ role: 'system', content: system }, ...conversationHistory],
      0.7
    );
    conversationHistory.push({ role: 'assistant', content: reply });
    appendMessage('assistant', reply);
  } catch (err) {
    conversationHistory.pop();
    appendError(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CALL 2 · Synthesis  (temp 0.2)
// ══════════════════════════════════════════════════════════════════════════════

async function handleBuildItinerary() {
  const active = fragments.filter(f => f.status !== 'discard');
  if (!active.length) {
    appendError('No Keep or Consider clips. Mark at least one clip before building.');
    return;
  }

  const startDate = startDateInput.value;
  const numDays   = parseInt(numDaysInput.value, 10);
  if (!startDate)          { appendError('Please set a trip start date.'); return; }
  if (!numDays || numDays < 1) { appendError('Please enter a valid number of days.'); return; }

  const system = `You are a travel itinerary builder. Organise the user's clips into a day-by-day itinerary.

STRICT RULES:
1. Do NOT invent prices, opening hours, addresses, or any facts absent from the fragments.
2. Every item MUST include its source fragment_id. If an item has no source fragment, set fragment_id to null — it goes in "unattributed".
3. Distribute items sensibly across ${numDays} days. Do not overload any single day.
4. Return ONLY valid JSON — no markdown fences, no prose outside the JSON.

CLIPPED FRAGMENTS:
${buildFragmentContext(active)}

REQUIRED JSON SCHEMA:
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "transport":     [{ "item": "string", "fragment_id": "string|null" }],
      "food":          [{ "item": "string", "fragment_id": "string|null" }],
      "accommodation": [{ "item": "string", "fragment_id": "string|null" }],
      "activities":    [{ "item": "string", "fragment_id": "string|null" }]
    }
  ],
  "unattributed": [{ "item": "string", "section": "transport|food|accommodation|activities" }]
}

Build a ${numDays}-day itinerary starting ${startDate}.`;

  setLoading(true);
  buildBtn.textContent = 'Building…';

  try {
    const raw  = await callOpenAI([{ role: 'user', content: system }], 0.2);
    const data = JSON.parse(extractJSON(raw));

    saveItinerary(data);
    showItineraryPanel();
    renderItinerary(data);
    setRevisionMode(true);
    appendSystemNote(`Itinerary built — ${data.days.length} days. Use the chat below to revise.`);

    // Auto-expand itinerary zone if it was just hidden
    if (panelClosed['itinerary-zone']) togglePanel('itinerary-zone');

  } catch (err) {
    appendError(err instanceof SyntaxError
      ? 'Could not parse the itinerary JSON. Try again or simplify your clips.'
      : `Error: ${err.message}`
    );
  } finally {
    setLoading(false);
    buildBtn.textContent = 'Build Itinerary';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CALL 3 · Revision  (temp 0.2)
// ══════════════════════════════════════════════════════════════════════════════

async function handleRevisionCall(instruction) {
  const system = `You are editing an existing travel itinerary JSON in response to a user instruction.

CURRENT ITINERARY:
${JSON.stringify(currentItinerary, null, 2)}

RULES:
1. Make ONLY the changes required by the instruction — touch nothing else.
2. Preserve all fragment_id values; do not invent new facts.
3. Return ONLY valid JSON in the same schema, plus a top-level "summary" string.

SCHEMA:
{
  "summary": "one-sentence description of what changed",
  "days": [ ... ],
  "unattributed": [ ... ]
}`;

  setLoading(true);
  try {
    const raw  = await callOpenAI(
      [{ role: 'system', content: system }, { role: 'user', content: instruction }],
      0.2
    );
    const data              = JSON.parse(extractJSON(raw));
    const { summary, ...itinerary } = data;

    saveItinerary(itinerary);
    renderItinerary(itinerary);
    appendMessage('assistant', summary ?? 'Itinerary updated.');

  } catch (err) {
    appendError(err instanceof SyntaxError
      ? 'Could not parse the revised itinerary. Try rephrasing.'
      : `Error: ${err.message}`
    );
  } finally {
    setLoading(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ITINERARY RENDER + STORAGE
// ══════════════════════════════════════════════════════════════════════════════

function saveItinerary(data) {
  currentItinerary = data;
  chrome.storage.local.set({ [ITINERARY_KEY]: data });
}

function loadItinerary() {
  return new Promise(resolve => {
    chrome.storage.local.get([ITINERARY_KEY], r => {
      currentItinerary = r[ITINERARY_KEY] ?? null;
      resolve();
    });
  });
}

function renderItinerary(data) {
  const { days = [], unattributed = [] } = data;
  const ICONS = { transport: '🚌', food: '🍜', accommodation: '🏨', activities: '🗺' };

  let html = '';
  days.forEach(({ day, date, transport, food, accommodation, activities }) => {
    const ds = date
      ? ` <span style="font-weight:400;color:#64748b;font-size:11px;">— ${date}</span>`
      : '';
    html += `<h2>Day ${day}${ds}</h2>`;

    [['transport', transport], ['food', food],
     ['accommodation', accommodation], ['activities', activities]]
      .forEach(([key, items]) => {
        if (!items?.length) return;
        html += `<h3>${ICONS[key]} ${key.charAt(0).toUpperCase() + key.slice(1)}</h3><ul>`;
        items.forEach(({ item }) => { html += `<li>${escapeHtml(item)}</li>`; });
        html += '</ul>';
      });
  });

  if (unattributed.length) {
    html += '<h2>⚠ Unattributed Items</h2><ul>';
    unattributed.forEach(({ item, section }) => {
      html += `<li><em>[${escapeHtml(section)}]</em> ${escapeHtml(item)}</li>`;
    });
    html += '</ul>';
  }

  itineraryContent.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORT TO .md
// ══════════════════════════════════════════════════════════════════════════════

function handleExport() {
  if (!currentItinerary) { appendError('No itinerary to export yet.'); return; }

  const md      = itineraryToMarkdown(currentItinerary);
  const blob    = new Blob([md], { type: 'text/markdown' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `TripClip-${startDateInput.value || 'trip'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function itineraryToMarkdown({ days = [], unattributed = [] }) {
  let md = `# Trip Itinerary\n`;
  if (startDateInput.value) md += `**Start:** ${startDateInput.value}  \n`;
  if (numDaysInput.value)   md += `**Duration:** ${numDaysInput.value} days  \n`;
  md += `\n*Generated by TripClip*\n\n---\n\n`;

  days.forEach(({ day, date, transport, food, accommodation, activities }) => {
    md += `## Day ${day}${date ? ` — ${date}` : ''}\n\n`;
    [['Transport', transport], ['Food', food],
     ['Accommodation', accommodation], ['Activities', activities]]
      .forEach(([label, items]) => {
        if (!items?.length) return;
        md += `### ${label}\n\n`;
        items.forEach(({ item, fragment_id }) => {
          md += `- ${item}${fragment_id ? ` <!-- clip:${fragment_id.slice(0,8)} -->` : ''}\n`;
        });
        md += '\n';
      });
  });

  if (unattributed.length) {
    md += `## ⚠ Unattributed Items\n\n`;
    unattributed.forEach(({ item, section }) => { md += `- *[${section}]* ${item}\n`; });
  }
  return md;
}

// ══════════════════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
  await Promise.all([loadFragments(), loadItinerary()]);

  renderFragments();
  initPanelLayout();   // sets heights, wires drag + collapse

  // Restore persisted itinerary
  if (currentItinerary) {
    showItineraryPanel();
    renderItinerary(currentItinerary);
    setRevisionMode(true);
  }

  // React to clips saved from any tab
  chrome.storage.onChanged.addListener(changes => {
    if (changes[FRAGMENTS_KEY]) {
      fragments = changes[FRAGMENTS_KEY].newValue ?? [];
      renderFragments();
    }
  });

  bindEvents();
}

init();
