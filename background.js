// background.js — service worker
// Handles: context menu registration, fragment saving, sidepanel opening

const FRAGMENTS_KEY = 'tripclip_fragments';

// Open sidepanel automatically when toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Register context menu item on install / update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tripclip-clip',
    title: 'Clip to TripClip ✈',
    contexts: ['selection'],
  });
});

// Context menu click → save fragment
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tripclip-clip') return;
  if (!info.selectionText) return;

  let domain = '';
  try { domain = new URL(info.pageUrl).hostname; } catch (_) {}

  saveFragment({
    text: info.selectionText,
    url: info.pageUrl,
    title: tab?.title ?? '',
    domain,
  });
});

// Messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CLIP_FRAGMENT') {
    saveFragment(message.payload);
    sendResponse({ success: true });
  }
  return true; // keep channel open for async sendResponse
});

// Persist a new fragment (prepend so newest appears first)
function saveFragment(data) {
  const fragment = {
    id: crypto.randomUUID(),
    text: data.text,
    url: data.url,
    title: data.title,
    domain: data.domain,
    status: 'consider', // default; cycles: consider → keep → discard
    timestamp: Date.now(),
  };

  chrome.storage.local.get([FRAGMENTS_KEY], (result) => {
    const fragments = result[FRAGMENTS_KEY] ?? [];
    fragments.unshift(fragment);
    chrome.storage.local.set({ [FRAGMENTS_KEY]: fragments });
  });
}
