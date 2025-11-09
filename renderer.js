// renderer.js — tabs via event delegation + brand click + everything else unchanged
const $ = s => document.querySelector(s);

// Panels map (ids unchanged)
const panels = {
  dashboard: document.getElementById('panel-dashboard'),
  entries: document.getElementById('panel-entries'),
  settings: document.getElementById('panel-settings'),
  backup: document.getElementById('panel-backup'),
};

function setTab(active) {
  // Toggle active class on tab buttons
  document.querySelectorAll('#tabs .tab').forEach(btn=>{
    const isActive = btn.dataset.tab === active;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  // Show/hide panels
  Object.keys(panels).forEach(k=>{
    const show = k === active;
    panels[k].classList.toggle('hidden', !show);
    panels[k].setAttribute('aria-hidden', show ? 'false' : 'true');
  });
}

// --- NEW: Event delegation for tabs (robust) ---
document.getElementById('tabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tab[data-tab]');
  if (!btn) return;
  setTab(btn.dataset.tab);
});

// --- NEW: Brand click jumps to Dashboard ---
document.getElementById('brand-home').addEventListener('click', ()=> setTab('dashboard'));

// Keep the rest of your previous renderer.js logic:

const quickText = $('#quick-text');
const quickSaveBtn = $('#quick-save');
const quickSaveAskBtn = $('#quick-save-ask');
const openPromptBtn = $('#open-prompt-btn');
const backupNowBtn = $('#backup-now');
const openBackupFolderBtn = $('#open-backup-folder');
const restoreBtn = $('#restore-btn');
const recentEntriesEl = $('#recent-entries');
const entriesEl = $('#entries');
const searchInput = $('#search');

const intervalInput = $('#interval-min');
const saveSettingsBtn = $('#save-settings');
const resetSettingsBtn = $('#reset-settings');
const askToggle = $('#ask-toggle');
const notifToggle = $('#notif-toggle');
const backupDaysInput = $('#backup-days');
const darkToggle = $('#dark-toggle');
const compactToggle = $('#compact-toggle');

const infoInterval = $('#info-interval');
const infoAsk = $('#info-ask-enabled');
const infoNotif = $('#info-notif');
const backupLocationEl = $('#backup-location');
const lastBackupEl = $('#last-backup');
const backupKeepEl = $('#backup-keep');
const countdownEl = $('#countdown');

const promptModal = $('#prompt-modal');
const promptText = $('#prompt-text');

const toastRoot = document.getElementById('toast-root');
function toast(msg, type='success', t=3000) {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; toastRoot.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),220) }, t);
  setTimeout(()=>{ el.style.opacity='1' }, 20);
}

function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);}

async function loadEntries() {
  try {
    const items = await window.electronAPI.readEntries();
    renderEntries(items);
    renderRecent(items.slice(0,8));
    if (items && items.length) lastBackupEl.textContent = new Date(items[0].ts).toLocaleString();
  } catch (e) { console.error(e); }
}
function renderEntries(items) {
  entriesEl.innerHTML = '';
  if (!items || items.length === 0) return entriesEl.innerHTML = '<div class="entry">No entries yet</div>';
  items.forEach(it=>{
    const d = document.createElement('div'); d.className='entry';
    d.innerHTML = `<div>${escapeHtml(it.text)}</div><div class="ts">${new Date(it.ts).toLocaleString()}</div>`;
    entriesEl.appendChild(d);
  });
}
function renderRecent(items) {
  recentEntriesEl.innerHTML = '';
  if (!items || items.length === 0) return recentEntriesEl.innerHTML = '<div class="entry">No recent entries</div>';
  items.forEach(it=>{
    const d = document.createElement('div'); d.className='entry';
    d.innerHTML = `<div style="font-weight:600">${escapeHtml(it.text)}</div><div class="ts">${new Date(it.ts).toLocaleString()}</div>`;
    recentEntriesEl.appendChild(d);
  });
}

async function loadConfigToUI() {
  try {
    const cfg = await window.electronAPI.getConfig();
    if (!cfg) return;
    intervalInput.value = cfg.ask_interval_minutes || 15;
    askToggle.checked = !!cfg.ask_enabled;
    notifToggle.checked = !!cfg.notifications_enabled;
    backupDaysInput.value = cfg.backup_keep_days || 10;
    darkToggle.checked = !!cfg.dark_mode;
    compactToggle.checked = !!cfg.compact_mode;

    infoInterval.textContent = `${cfg.ask_interval_minutes || 15} min`;
    infoAsk.textContent = cfg.ask_enabled ? 'On' : 'Off';
    infoNotif.textContent = cfg.notifications_enabled ? 'On' : 'Off';
    backupKeepEl.textContent = cfg.backup_keep_days || 10;

    const p = await window.electronAPI.getBackupPath();
    backupLocationEl.textContent = p || '—';

    applyThemeLocally({ dark: !!cfg.dark_mode, compact: !!cfg.compact_mode });
  } catch (e) { console.error(e); }
}

// modal logic
function openPrompt() { promptModal.classList.add('open'); promptText.value=''; setTimeout(()=>promptText.focus(),80); }
function closePrompt(){ promptModal.classList.remove('open'); }
$('#save-ask').addEventListener('click', async ()=>{
  const t = promptText.value.trim(); closePrompt();
  if (!t) return toast('Empty — not saved','error');
  try { await window.electronAPI.saveEntry(t); toast('Saved'); await loadEntries(); } catch { toast('Save failed','error') }
});
$('#save-dontask').addEventListener('click', async ()=>{
  const t = promptText.value.trim(); closePrompt();
  if (!t) return toast('Empty — not saved','error');
  try {
    await window.electronAPI.saveEntry(t);
    await window.electronAPI.setConfig({ ask_enabled:false });
    toast('Saved & disabled prompts'); await loadConfigToUI(); await loadEntries();
  } catch { toast('Failed','error') }
});
$('#skip-this').addEventListener('click', async ()=>{ try{ await window.electronAPI.skipNext(); toast('Skipped next prompt'); }catch{toast('Failed','error')} closePrompt(); });
$('#modal-close').addEventListener('click', closePrompt);

// quick add
quickSaveBtn.addEventListener('click', async ()=> {
  const t = quickText.value.trim(); if (!t) return toast('Type something','error');
  try { await window.electronAPI.saveEntry(t); quickText.value=''; toast('Saved'); await loadEntries(); } catch { toast('Save failed','error') }
});
quickSaveAskBtn.addEventListener('click', async ()=> {
  const t = quickText.value.trim(); if (!t) return toast('Type something','error');
  try { await window.electronAPI.saveEntry(t); quickText.value=''; toast('Saved — will ask later'); await loadEntries(); } catch { toast('Save failed','error') }
});
openPromptBtn.addEventListener('click', openPrompt);

// backup actions
backupNowBtn.addEventListener('click', async ()=> {
  backupNowBtn.disabled = true; backupNowBtn.textContent = 'Backing up...';
  try {
    const res = await window.electronAPI.createBackup();
    if (res && res.ok) { toast('Backup updated'); await loadConfigToUI(); await loadEntries(); }
    else { toast('Backup failed','error'); console.error(res); }
  } catch(e){ toast('Backup failed','error'); console.error(e) }
  backupNowBtn.disabled = false; backupNowBtn.textContent = 'Backup Now';
});
openBackupFolderBtn.addEventListener('click', async ()=> {
  try {
    const res = await window.electronAPI.openBackupFolder();
    if (res && res.ok) {
      toast('Backup folder opened');
    } else {
      toast('Failed to open folder — path copied', 'error');
      const p = await window.electronAPI.getBackupPath();
      try { await navigator.clipboard.writeText(p || ''); } catch {}
    }
  } catch (e) { console.error(e); toast('Open folder failed', 'error'); }
});
document.getElementById('restore-btn')?.addEventListener('click', async ()=> {
  try {
    const res = await window.electronAPI.restoreFromFile();
    if (res && res.ok) {
      toast(`Restored ${res.restored} entries`);
      await loadEntries();
    } else if (!res?.canceled) {
      toast(res?.error || 'Restore failed', 'error');
    }
  } catch (e) { console.error(e); toast('Restore failed', 'error'); }
});

// settings save/reset
saveSettingsBtn.addEventListener('click', async ()=>{
  const partial = {
    ask_interval_minutes: Math.max(1, Number(intervalInput.value) || 15),
    ask_enabled: !!askToggle.checked,
    notifications_enabled: !!notifToggle.checked,
    backup_keep_days: Math.max(1, Number(backupDaysInput.value) || 10),
    dark_mode: !!darkToggle.checked,
    compact_mode: !!compactToggle.checked,
  };
  try { await window.electronAPI.setConfig(partial); toast('Settings saved'); await loadConfigToUI(); } catch { toast('Save failed','error') }
});
resetSettingsBtn.addEventListener('click', async ()=> {
  try {
    await window.electronAPI.setConfig({
      ask_enabled:true, ask_interval_minutes:15,
      notifications_enabled:true, backup_keep_days:10,
      dark_mode:false, compact_mode:false
    });
    toast('Settings reset'); await loadConfigToUI();
  } catch { toast('Reset failed','error') }
});

// main → renderer events
window.electronAPI.onOpenPrompt(()=>{ setTab('dashboard'); openPrompt(); });
window.electronAPI.onApplyTheme(({dark, compact}) => applyThemeLocally({dark, compact}));

// countdown UI
function formatMs(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60), r = s % 60;
  return `${m.toString().padStart(2,'0')}:${r.toString().padStart(2,'0')}`;
}
async function tickCountdown(){
  try {
    const info = await window.electronAPI.getNextPromptInfo();
    document.getElementById('countdown').textContent = `Next: ${formatMs(info.remainingMs)} `;
  } catch {
    document.getElementById('countdown').textContent = '';
  }
}
setInterval(tickCountdown, 1000);

// theme helpers
function applyThemeLocally({dark, compact}){
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.body.setAttribute('data-dense', compact ? '1' : '0');
}

// search
document.getElementById('search')?.addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const items = await window.electronAPI.readEntries();
  const filtered = items.filter(it => it.text.toLowerCase().includes(q));
  renderEntries(filtered);
});

// init
(async function init(){
  setTab('dashboard');       // default tab
  await loadEntries();
  await loadConfigToUI();
  tickCountdown();
  setInterval(()=>loadEntries(), 60_000);
})();
