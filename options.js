// options.js — API key storage

const API_KEY_STORAGE_KEY = 'tripclip_openai_key';

const apiKeyInput      = document.getElementById('api-key');
const saveBtn          = document.getElementById('save-btn');
const saveStatus       = document.getElementById('save-status');
const toggleVisibility = document.getElementById('toggle-visibility');

// Load saved key on open
chrome.storage.local.get([API_KEY_STORAGE_KEY], (result) => {
  if (result[API_KEY_STORAGE_KEY]) {
    apiKeyInput.value = result[API_KEY_STORAGE_KEY];
  }
});

// Save
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    saveStatus.textContent = 'Key cannot be empty.';
    saveStatus.style.color = '#dc2626';
    return;
  }
  chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key }, () => {
    saveStatus.textContent = 'Saved!';
    saveStatus.style.color = '#16a34a';
    setTimeout(() => { saveStatus.textContent = ''; }, 2500);
  });
});

// Toggle password visibility
toggleVisibility.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});
