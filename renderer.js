// renderer.js — updated to call openBackupFolder and improved UI feedback
const $ = s => document.querySelector(s);

const tabs = {
  dashboard: $('#tab-dashboard'),
  entries: $('#tab-entries'),
  settings: $('#tab-settings'),
  backup: $('#tab-backup'),
};
const panels = {
  dashboard: $('#panel-dashboard'),
  entries: $('#panel-entries'),
  settings: $('#panel-settings'),
  backup: $('#panel-backup'),
};

function setTab(active) {
  Object.keys(tabs).forEach(k=>{
    tabs[k].classList.toggle('active', k===active);
    panels[k].classList.toggle('hidden', k!==active);
    panels[k].setAttribute('aria-hidden', k!==active);
    tabs[k].setAttribute('aria-selected', k===active ? 'true' : 'false');
  });
}

const quickText = $('#quick-text');
const quickSaveBtn = $('#quick-save');
const quickSaveAskBtn = $('#quick-save-ask');
const openPromptBtn = $('#open-prompt-btn');
const backupNowBtn = $('#backup-now');
const openBackupFolderBtn = $('#open-backup-folder');
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
const backupKeepEl = $('#backup-keep');
const currentIntervalSpan = document.getElementById('current-interval');

const toastRoot = document.getElementById('toast-root');
function toast(msg, type='success', t=3000) {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; toastRoot.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),220) }, t);
  setTimeout(()=>{ el.style.opacity='1' }, 20);
}

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
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);}

async function loadConfigToUI() {
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
    currentIntervalSpan && (currentIntervalSpan.textContent = `${cfg.ask_interval_minutes || 15}`);
    backupKeepEl.textContent = cfg.backup_keep_days || 10;
    const p = await window.electronAPI.getBackupPath();
    backupLocationEl.textContent = p || '—';
  } catch (e) { console.error(e); }
}

// modal logic
const promptModal = $('#prompt-modal');
const promptText = $('#prompt-text');
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
  try { await window.electronAPI.saveEntry(t); await window.electronAPI.setConfig({ ask_enabled:false }); toast('Saved & disabled prompts'); await loadConfigToUI(); await loadEntries(); } catch { toast('Failed','error') }
});
$('#skip-this').addEventListener('click', async ()=>{ try{ await window.electronAPI.skipNext(); toast('Skipped next prompt'); }catch{toast('Failed','error')} closePrompt(); });
$('#modal-close').addEventListener('click', closePrompt);

quickSaveBtn.addEventListener('click', async ()=> {
  const t = quickText.value.trim(); if (!t) return toast('Type something','error');
  try { await window.electronAPI.saveEntry(t); quickText.value=''; toast('Saved'); await loadEntries(); } catch { toast('Save failed','error') }
});
quickSaveAskBtn.addEventListener('click', async ()=> {
  const t = quickText.value.trim(); if (!t) return toast('Type something','error');
  try { await window.electronAPI.saveEntry(t); quickText.value=''; toast('Saved — will ask later'); await loadEntries(); } catch { toast('Save failed','error') }
});
openPromptBtn.addEventListener('click', openPrompt);

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
      toast('Failed to open folder — copied path to clipboard', 'error');
      // copy path so user can open manually
      const p = await window.electronAPI.getBackupPath();
      try { await navigator.clipboard.writeText(p || ''); } catch {}
    }
  } catch (e) {
    console.error(e); toast('Open folder failed', 'error');
  }
});

saveSettingsBtn.addEventListener('click', async ()=>{
  const partial = {
    ask_interval_minutes: Math.max(1, Number(intervalInput.value) || 15),
    ask_enabled: !!askToggle.checked,
    notifications_enabled: !!notifToggle.checked,
    backup_keep_days: Math.max(1, Number(backupDaysInput.value) || 10),
  };
  try { await window.electronAPI.setConfig(partial); toast('Settings saved'); await loadConfigToUI(); } catch { toast('Save failed','error') }
});
resetSettingsBtn.addEventListener('click', async ()=> {
  try { await window.electronAPI.setConfig({ ask_enabled:true, ask_interval_minutes:15, notifications_enabled:true, backup_keep_days:10 }); toast('Settings reset'); await loadConfigToUI(); } catch { toast('Reset failed','error') }
});

document.getElementById('tab-dashboard').addEventListener('click', ()=>setTab('dashboard'));
document.getElementById('tab-entries').addEventListener('click', ()=>setTab('entries'));
document.getElementById('tab-settings').addEventListener('click', ()=>setTab('settings'));
document.getElementById('tab-backup').addEventListener('click', ()=>setTab('backup'));

window.electronAPI.onOpenPrompt(()=>{ setTab('dashboard'); openPrompt(); });

searchInput?.addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const items = await window.electronAPI.readEntries();
  const filtered = items.filter(it => it.text.toLowerCase().includes(q));
  renderEntries(filtered);
});

(async function init(){
  setTab('dashboard');
  await loadEntries();
  await loadConfigToUI();
  setInterval(()=>loadEntries(), 60_000);
})();
