// renderer.js – IST display everywhere; UTC math for logic
const $ = s => document.querySelector(s);

/* ---------- IST formatting helpers ---------- */
function formatIST(dateLike) {
  return new Date(dateLike).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false
  });
}
function formatISTShort(dateLike) {
  return new Date(dateLike).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
function startOfDayIST(d=new Date()){
  // We only need this for "today" grouping in UI; use system local + compare string by IST date.
  const s = new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' });
  // parse again just to get a comparable Y-M-D string:
  const [dd, mm, yyyy] = s.split(',')[0].split('/'); // "dd/mm/yyyy, ..."
  return `${yyyy}-${mm}-${dd}`; // IST day key
}
function startOfWeekKeyIST(d=new Date()){
  // find Monday in IST: walk back to Monday using IST weekday
  const dt = new Date(d);
  // get IST weekday (0=Sunday in JS, but we want Monday-based week UI; do a loop)
  let w = new Date(dt).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', weekday:'short' });
  const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  let day = map[w] ?? 0;
  const back = (day + 6) % 7; // days to go back to Monday
  dt.setDate(dt.getDate() - back);
  const key = startOfDayIST(dt);
  return key;
}

/* ---------- Panels & Tabs ---------- */
const panels = {
  dashboard: $('#panel-dashboard'),
  entries:   $('#panel-entries'),
  settings:  $('#panel-settings'),
  backup:    $('#panel-backup'),
};
const tabsNode = document.getElementById('tabs');
const tabButtons = () => [...tabsNode.querySelectorAll('[role="tab"]')];

function setTab(active) {
  tabButtons().forEach(btn=>{
    const isActive = btn.dataset.tab === active;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
  });
  Object.keys(panels).forEach(k=>{
    const show = k === active;
    panels[k].classList.toggle('hidden', !show);
    panels[k].setAttribute('aria-hidden', show ? 'false' : 'true');
  });
}
tabsNode.addEventListener('click', e=>{
  const btn = e.target.closest('.tab[data-tab]');
  if (!btn) return;
  setTab(btn.dataset.tab);
  btn.focus();
});
tabsNode.addEventListener('keydown', e=>{
  const keys = ['ArrowLeft','ArrowRight','Home','End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const tabs = tabButtons();
  const i = tabs.findIndex(t=>t.getAttribute('aria-selected')==='true');
  let ni = i;
  if (e.key === 'ArrowLeft')  ni = (i - 1 + tabs.length) % tabs.length;
  if (e.key === 'ArrowRight') ni = (i + 1) % tabs.length;
  if (e.key === 'Home')       ni = 0;
  if (e.key === 'End')        ni = tabs.length - 1;
  const target = tabs[ni];
  setTab(target.dataset.tab);
  target.focus();
});
document.getElementById('brand-home').addEventListener('click', ()=> setTab('dashboard'));

/* ---------- Elements ---------- */
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

/* ---------- Stats labels ---------- */
const statToday = $('#stat-today');
const statWeek  = $('#stat-week');
const statTotal = $('#stat-total');
const statStreak= $('#stat-streak');

/* ---------- Toast ---------- */
const toastRoot = document.getElementById('toast-root');
function toast(msg, type='success', t=2600) {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; toastRoot.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),180) }, t);
  setTimeout(()=>{ el.style.opacity='1' }, 18);
}

/* ---------- Render helpers ---------- */
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);}
function emptyState(msg){ return `<div class="entry"><div class="text"><span class="dot"></span>${escapeHtml(msg)}</div></div>`; }

function renderEntries(items) {
  const y = entriesEl.scrollTop;
  entriesEl.innerHTML = '';
  if (!items || items.length === 0) {
    entriesEl.innerHTML = emptyState('No entries yet — start logging from the dashboard.');
    return;
  }
  items.forEach(it=>{
    const row = document.createElement('div'); row.className='entry';
    row.innerHTML = `
      <div class="text"><span class="dot"></span>${escapeHtml(it.text)}</div>
      <div class="ts">${formatISTShort(it.ts)}</div>
    `;
    entriesEl.appendChild(row);
  });
  entriesEl.scrollTop = y;
}
function renderRecent(items) {
  recentEntriesEl.innerHTML = '';
  if (!items || items.length === 0) {
    recentEntriesEl.innerHTML = emptyState('Nothing logged yet today.');
    return;
  }
  items.forEach(it=>{
    const row = document.createElement('div'); row.className='entry';
    row.innerHTML = `
      <div class="text"><span class="dot"></span><strong>${escapeHtml(it.text)}</strong></div>
      <div class="ts">${formatISTShort(it.ts)}</div>
    `;
    recentEntriesEl.appendChild(row);
  });
}

/* ---------- Stats (by IST day/week) ---------- */
function computeStats(items){
  const byDay = new Map();
  let total = items.length;

  items.forEach(it=>{
    const dayKey = startOfDayIST(new Date(it.ts));
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
  });

  // today
  const todayKey = startOfDayIST(new Date());
  const today = byDay.get(todayKey) || 0;

  // week
  const sowKey = startOfWeekKeyIST(new Date());
  let week = 0;
  // sum days from monday to todayKey (rough approach: iterate last 7 days)
  for (let i=0;i<7;i++){
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = startOfDayIST(d);
    week += (byDay.get(k) || 0);
    if (k === sowKey) break;
  }

  // streak
  let streak = 0;
  for (let i=0; i<365; i++){
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = startOfDayIST(d);
    if (byDay.has(k)) streak++;
    else break;
  }

  statToday.textContent = today;
  statWeek.textContent  = week;
  statTotal.textContent = total;
  statStreak.textContent= streak;
}

/* ---------- Load entries & stats ---------- */
async function loadEntries() {
  try {
    entriesEl.innerHTML = '<div class="entry"><div class="skeleton" style="width:70%"></div></div>';
    const items = await window.electronAPI.readEntries();
    renderEntries(items);
    renderRecent(items.slice(0,8));
    (window.requestIdleCallback || setTimeout)(()=> computeStats(items), 50);
    if (items && items.length) lastBackupEl.textContent = formatISTShort(items[0].ts);
  } catch (e) { console.error(e); }
}

/* ---------- Config → UI ---------- */
function applyThemeLocally({dark, compact}){
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.body.setAttribute('data-dense', compact ? '1' : '0');
}
async function loadConfigToUI() {
  try {
    const cfg = await window.electronAPI.getConfig();
    if (!cfg) return;
    intervalInput.value = cfg.ask_interval_minutes ?? 15;
    askToggle.checked = !!cfg.ask_enabled;
    notifToggle.checked = !!cfg.notifications_enabled;
    backupDaysInput.value = cfg.backup_keep_days ?? 10;
    darkToggle.checked = !!cfg.dark_mode;
    compactToggle.checked = !!cfg.compact_mode;

    infoInterval.textContent = `${cfg.ask_interval_minutes ?? 15} min`;
    infoAsk.textContent = cfg.ask_enabled ? 'On' : 'Off';
    infoNotif.textContent = cfg.notifications_enabled ? 'On' : 'Off';
    backupKeepEl.textContent = cfg.backup_keep_days ?? 10;

    const p = await window.electronAPI.getBackupPath();
    backupLocationEl.textContent = p || '—';

    if (cfg.dark_mode === undefined) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyThemeLocally({ dark: prefersDark, compact: !!cfg.compact_mode });
    } else {
      applyThemeLocally({ dark: !!cfg.dark_mode, compact: !!cfg.compact_mode });
    }
  } catch (e) { console.error(e); }
}

/* ---------- Modal ---------- */
const promptModal = $('#prompt-modal');
const promptText = $('#prompt-text');
const modalClose = $('#modal-close');
let lastFocused = null;

function trapFocus(e){
  if (!promptModal.classList.contains('open')) return;
  const f = [...promptModal.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.disabled && el.offsetParent!==null);
  if (f.length===0) return;
  const first=f[0], last=f[f.length-1];
  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
function openPrompt() {
  lastFocused = document.activeElement;
  document.body.classList.add('modal-open');
  promptModal.classList.add('open');
  promptModal.setAttribute('aria-hidden','false');
  setTimeout(()=>promptText.focus(), 60);
  document.addEventListener('keydown', trapFocus);
}
function closePrompt(){
  promptModal.classList.remove('open');
  promptModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', trapFocus);
  if (lastFocused?.focus) lastFocused.focus();
}
modalClose.addEventListener('click', closePrompt);
promptModal.addEventListener('keydown', e=>{ if(e.key==='Escape') closePrompt(); });

/* ---------- Actions ---------- */
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

const quickSave = async (alsoAskLater=false)=>{
  const t = quickText.value.trim(); if (!t) return toast('Type something','error');
  try { await window.electronAPI.saveEntry(t); quickText.value=''; toast(alsoAskLater?'Saved — will ask later':'Saved'); await loadEntries(); } catch { toast('Save failed','error') }
};
quickSaveBtn.addEventListener('click', ()=>quickSave(false));
quickSaveAskBtn.addEventListener('click', ()=>quickSave(true));
openPromptBtn.addEventListener('click', openPrompt);

/* ---------- Backups ---------- */
backupNowBtn.addEventListener('click', async ()=> {
  backupNowBtn.disabled = true; backupNowBtn.textContent = 'Backing up...';
  try {
    const res = await window.electronAPI.createBackup();
    if (res && res.ok) {
      const p = await window.electronAPI.getBackupPath();
      toast(`Backup updated (${(p||'').split('/').pop() || 'today.json'})`);
      await loadEntries();
    } else {
      toast('Backup failed','error');
    }
  } catch(e){ toast('Backup failed','error'); console.error(e) }
  backupNowBtn.disabled = false; backupNowBtn.textContent = 'Backup Now';
});
openBackupFolderBtn.addEventListener('click', async ()=> {
  try {
    const res = await window.electronAPI.openBackupFolder();
    if (res && res.ok) toast('Backup folder opened');
    else toast('Failed to open folder', 'error');
  } catch (e) { console.error(e); toast('Open folder failed', 'error'); }
});
restoreBtn.addEventListener('click', async ()=> {
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

/* ---------- Settings ---------- */
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
window.electronAPI.onOpenPrompt(()=>{ setTab('dashboard'); openPrompt(); });
window.electronAPI.onApplyTheme(({dark, compact}) => applyThemeLocally({dark, compact}));

/* ---------- Countdown (UTC math, display only) ---------- */
function formatMs(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(s/60), r = s % 60;
  return `${m.toString().padStart(2,'0')}:${r.toString().padStart(2,'0')}`;
}
async function tickCountdown(){
  try {
    const info = await window.electronAPI.getNextPromptInfo();
    countdownEl.textContent = `Next: ${formatMs(info.remainingMs)}`;
  } catch {
    countdownEl.textContent = 'Next: --:--';
  }
}
setInterval(tickCountdown, 1000);

/* ---------- Search ---------- */
searchInput?.addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const items = await window.electronAPI.readEntries();
  const filtered = items.filter(it => it.text.toLowerCase().includes(q));
  renderEntries(filtered);
});

/* ---------- Init ---------- */
(async function init(){
  setTab('dashboard');
  await loadEntries();
  await loadConfigToUI();
  tickCountdown();
  // periodic refresh
  setInterval(()=>loadEntries(), 60_000);
})();
