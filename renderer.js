// renderer.js - modern UI logic (works with your existing preload IPC)
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const pages = {
  dashboard: $('#dashboard-view'),
  entries: $('#entries-view'),
  settings: $('#settings-view'),
};
const navButtons = {
  dashboard: $('#btn-dashboard'),
  entries: $('#btn-entries'),
  settings: $('#btn-settings'),
};

const promptModal = $('#prompt-modal');
const promptText = $('#prompt-text');

const quickText = $('#quick-text');
const quickSaveBtn = $('#quick-save');
const quickSaveAskBtn = $('#quick-save-ask');
const openPromptBtn = $('#open-prompt-btn');
const backupNowBtn = $('#backup-now');
const recentEntriesEl = $('#recent-entries');
const entriesEl = $('#entries');
const searchInput = $('#search');

const intervalInput = $('#interval-min');
const saveSettingsBtn = $('#save-settings');
const resetSettingsBtn = $('#reset-settings');
const askToggle = $('#ask-toggle');
const notifToggle = $('#notif-toggle');
const backupDaysInput = $('#backup-days');

const infoInterval = $('#info-interval');
const infoAsk = $('#info-ask-enabled');
const infoNotif = $('#info-notif');
const backupLocationEl = $('#backup-location');
const lastBackupEl = $('#last-backup');
const pageTitle = $('#page-title');
const pageSub = $('#page-sub');
const currentIntervalSpan = $('#current-interval');

// Toast utils
const toastRoot = document.getElementById('toast-root');
function showToast(msg, type = 'success', t = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, t);
  // animate in
  setTimeout(() => { el.style.opacity = '1'; }, 20);
}

// navigation
function setActive(page) {
  Object.values(navButtons).forEach(b => b.classList.remove('active'));
  if (page === 'dashboard') navButtons.dashboard.classList.add('active');
  if (page === 'entries') navButtons.entries.classList.add('active');
  if (page === 'settings') navButtons.settings.classList.add('active');
  Object.values(pages).forEach(p => p.classList.add('hidden'));
  if (page === 'dashboard') pages.dashboard.classList.remove('hidden');
  if (page === 'entries') pages.entries.classList.remove('hidden');
  if (page === 'settings') pages.settings.classList.remove('hidden');
  pageTitle.textContent = (page === 'dashboard' && 'Dashboard') || (page === 'entries' && 'All Entries') || 'Settings';
}

// load entries
async function loadEntries(limit = 200) {
  try {
    const items = await window.electronAPI.readEntries();
    renderEntries(items);
    renderRecent(items.slice(0, 8));
  } catch (e) {
    console.error(e);
  }
}
function renderEntries(items) {
  entriesEl.innerHTML = '';
  if (!items || items.length === 0) {
    entriesEl.innerHTML = '<div class="entry">No entries yet</div>'; return;
  }
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'entry';
    d.innerHTML = `<div>${escapeHtml(it.text)}</div><div class="ts">${new Date(it.ts).toLocaleString()}</div>`;
    entriesEl.appendChild(d);
  });
}
function renderRecent(items) {
  recentEntriesEl.innerHTML = '';
  if (!items || items.length === 0) {
    recentEntriesEl.innerHTML = '<div class="entry">No recent entries</div>'; return;
  }
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'entry';
    d.innerHTML = `<div style="font-weight:600">${escapeHtml(it.text)}</div><div class="ts">${new Date(it.ts).toLocaleString()}</div>`;
    recentEntriesEl.appendChild(d);
  });
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

// load config and populate UI
async function loadConfig() {
  try {
    const cfg = await window.electronAPI.getConfig();
    if (!cfg) return;
    intervalInput.value = cfg.ask_interval_minutes || 15;
    askToggle.checked = !!cfg.ask_enabled;
    notifToggle.checked = !!cfg.notifications_enabled;
    backupDaysInput.value = cfg.backup_keep_days || 10;
    infoInterval.textContent = `${cfg.ask_interval_minutes || 15} min`;
    infoAsk.textContent = cfg.ask_enabled ? 'On' : 'Off';
    infoNotif.textContent = cfg.notifications_enabled ? 'On' : 'Off';
    currentIntervalSpan.textContent = `${cfg.ask_interval_minutes || 15}`;
    // backup path
    const p = await window.electronAPI.getBackupPath();
    backupLocationEl.textContent = p || '—';
  } catch (e) {
    console.error('loadConfig', e);
  }
}

// open prompt modal
function openPrompt() {
  promptModal.classList.add('open');
  promptText.value = '';
  setTimeout(() => promptText.focus(), 80);
}
function closePrompt() { promptModal.classList.remove('open'); }

// wire modal buttons
$('#save-ask').addEventListener('click', async () => {
  const txt = promptText.value.trim(); closePrompt();
  if (!txt) { showToast('Empty — not saved', 'error'); return; }
  try {
    await window.electronAPI.saveEntry(txt);
    await loadEntries();
    showToast('Saved');
  } catch (e) { showToast('Failed to save', 'error'); }
});
$('#save-dontask').addEventListener('click', async () => {
  const txt = promptText.value.trim(); closePrompt();
  if (!txt) { showToast('Empty — not saved', 'error'); return; }
  try {
    await window.electronAPI.saveEntry(txt);
    await window.electronAPI.setConfig({ ask_enabled: false });
    await loadEntries();
    await loadConfig();
    showToast('Saved and disabled prompts');
  } catch (e) { showToast('Failed', 'error'); }
});
$('#skip-this').addEventListener('click', async () => {
  try { await window.electronAPI.skipNext(); showToast('Skipped next prompt'); } catch(e){showToast('Failed', 'error');}
  closePrompt();
});
$('#modal-close').addEventListener('click', closePrompt);

// quick add
quickSaveBtn.addEventListener('click', async () => {
  const t = quickText.value.trim(); if (!t) return showToast('Type something', 'error');
  try { await window.electronAPI.saveEntry(t); quickText.value = ''; await loadEntries(); showToast('Saved'); } catch(e){showToast('Save failed','error')}
});
quickSaveAskBtn.addEventListener('click', async () => {
  const t = quickText.value.trim(); if (!t) return showToast('Type something', 'error');
  try { await window.electronAPI.saveEntry(t); quickText.value = ''; await loadEntries(); showToast('Saved — will ask later'); } catch(e){showToast('Save failed','error')}
});

// open prompt button
openPromptBtn.addEventListener('click', () => openPrompt());

// backup
backupNowBtn.addEventListener('click', async () => {
  backupNowBtn.disabled = true; backupNowBtn.textContent = 'Backing up...';
  try {
    await window.electronAPI.createBackup();
    showToast('Backup updated');
    await loadConfig();
  } catch (e) { showToast('Backup failed', 'error') }
  backupNowBtn.disabled = false; backupNowBtn.textContent = 'Backup';
});

// settings save
saveSettingsBtn.addEventListener('click', async () => {
  const partial = {
    ask_interval_minutes: Math.max(1, Number(intervalInput.value) || 15),
    ask_enabled: !!askToggle.checked,
    notifications_enabled: !!notifToggle.checked,
    backup_keep_days: Math.max(1, Number(backupDaysInput.value) || 10),
  };
  try {
    const cfg = await window.electronAPI.setConfig(partial);
    showToast('Settings saved');
    await loadConfig();
  } catch (e) {
    console.error(e); showToast('Save failed', 'error');
  }
});

// reset settings
resetSettingsBtn.addEventListener('click', async () => {
  try {
    await window.electronAPI.setConfig({ ask_enabled: true, ask_interval_minutes: 15, notifications_enabled: true, backup_keep_days: 10 });
    showToast('Settings reset');
    await loadConfig();
  } catch (e) { showToast('Reset failed', 'error') }
});

// search
searchInput?.addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const items = await window.electronAPI.readEntries();
  const filtered = items.filter(it => it.text.toLowerCase().includes(q));
  renderEntries(filtered);
});

// respond to main open-prompt
window.electronAPI.onOpenPrompt(() => {
  openPrompt();
});

// nav buttons
navButtons.dashboard.addEventListener('click', () => setActive('dashboard'));
navButtons.entries.addEventListener('click', () => setActive('entries'));
navButtons.settings.addEventListener('click', () => setActive('settings'));

// init
(async function init(){
  setActive('dashboard');
  await loadEntries();
  await loadConfig();
  // update backup last info from entries timestamp (best effort)
  const entries = await window.electronAPI.readEntries();
  if (entries && entries.length) lastBackupEl.textContent = new Date(entries[0].ts).toLocaleString();
})();

// helper to reload entries if main process updates data
setInterval(()=>loadEntries(), 60_000);
