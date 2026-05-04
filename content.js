// content.js — injected into every page
// Handles: text selection detection, floating clip button, clip-and-confirm toast

(function () {
  // Guard: don't inject into extension pages or iframes
  if (window.self !== window.top) return;

  let clipBtn = null;
  let pendingText = '';

  // ─── Floating clip button ────────────────────────────────────────────────

  function createClipButton() {
    const btn = document.createElement('button');
    btn.id = 'tripclip-float-btn';
    btn.textContent = '✈ Clip';
    btn.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'background:#2563eb',
      'color:#fff',
      'border:none',
      'border-radius:4px',
      'padding:4px 9px',
      'font-size:12px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-weight:600',
      'cursor:pointer',
      'box-shadow:0 2px 6px rgba(0,0,0,0.25)',
      'display:none',
      'user-select:none',
      'line-height:1.6',
    ].join(';');

    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', handleClip);
    document.body.appendChild(btn);
    return btn;
  }

  function showClipButton(clientX, clientY) {
    if (!clipBtn) clipBtn = createClipButton();

    // Position just above the cursor; clamp to viewport edges
    const btnW = 64;
    const btnH = 28;
    const x = Math.min(clientX + 6, window.innerWidth - btnW - 8);
    const y = Math.max(clientY - btnH - 6, 8);

    clipBtn.style.left = `${x}px`;
    clipBtn.style.top = `${y}px`;
    clipBtn.style.display = 'block';
  }

  function hideClipButton() {
    if (clipBtn) clipBtn.style.display = 'none';
  }

  // ─── Selection listeners ─────────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Small delay so browser finalises the selection object
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text.length > 0) {
        pendingText = text;
        showClipButton(e.clientX, e.clientY);
      } else {
        hideClipButton();
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (clipBtn && !clipBtn.contains(e.target)) {
      hideClipButton();
    }
  });

  document.addEventListener('scroll', hideClipButton, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideClipButton();
  });

  // ─── Clip action ─────────────────────────────────────────────────────────

  function handleClip() {
    if (!pendingText) return;

    const payload = {
      text: pendingText,
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
    };

    chrome.runtime.sendMessage({ type: 'CLIP_FRAGMENT', payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[TripClip] Could not send clip:', chrome.runtime.lastError.message);
      }
    });

    hideClipButton();
    window.getSelection()?.removeAllRanges();
    pendingText = '';
    showToast('Clipped!');
  }

  // ─── Toast notification ───────────────────────────────────────────────────

  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:2147483647',
      'background:#1e293b',
      'color:#fff',
      'padding:7px 14px',
      'border-radius:6px',
      'font-size:13px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-weight:500',
      'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
      'opacity:1',
      'transition:opacity 0.3s ease',
      'pointer-events:none',
    ].join(';');

    document.body.appendChild(toast);

    setTimeout(() => { toast.style.opacity = '0'; }, 1400);
    setTimeout(() => { toast.remove(); }, 1750);
  }
})();
