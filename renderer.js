const entriesEl = document.getElementById("entries");
const modal = document.getElementById("prompt-modal");
const promptText = document.getElementById("prompt-text");
const saveBtn = document.getElementById("save-entry");
const dismissBtn = document.getElementById("dismiss");
const intervalMinInput = document.getElementById("interval-min");
const saveIntervalBtn = document.getElementById("save-interval");
const backupBtn = document.getElementById("backup-now");
const lastBackupEl = document.getElementById("last-backup");
const backupLocationEl = document.getElementById("backup-location");

async function loadEntries() {
  const entries = await window.electronAPI.readEntries();
  renderEntries(entries);
  await showBackupLocation();
}

function renderEntries(entries) {
  entriesEl.innerHTML = "";
  if (!entries.length) {
    entriesEl.innerHTML = "<div class='no-entry'>No entries yet</div>";
    return;
  }
  entries.forEach((e) => {
    const div = document.createElement("div");
    div.className = "entry";
    div.innerHTML = `
      <div>${escapeHtml(e.text)}</div>
      <div class="ts">${new Date(e.ts).toLocaleString()}</div>
    `;
    entriesEl.appendChild(div);
  });
  lastBackupEl.textContent = `Last entry: ${new Date(entries[0].ts).toLocaleString()}`;
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function openPrompt() {
  modal.classList.add("open");
  promptText.value = "";
  promptText.focus();
}
function closePrompt() {
  modal.classList.remove("open");
}

saveBtn.onclick = async () => {
  const text = promptText.value.trim();
  closePrompt();
  if (!text) return;
  await window.electronAPI.saveEntry(text);
  await loadEntries();
};
dismissBtn.onclick = closePrompt;

saveIntervalBtn.onclick = async () => {
  const mins = Number(intervalMinInput.value) || 15;
  await window.electronAPI.setIntervalMinutes(mins);
  alert(`Interval set to ${mins} min`);
};

window.electronAPI.onOpenPrompt(() => openPrompt());

backupBtn.onclick = async () => {
  backupBtn.disabled = true;
  backupBtn.textContent = "Backing up…";
  await window.electronAPI.createBackup();
  await loadEntries();
  lastBackupEl.textContent = `Backup created: ${new Date().toLocaleString()}`;
  await showBackupLocation();
  backupBtn.textContent = "Backup Now";
  backupBtn.disabled = false;
};

async function showBackupLocation() {
  const path = await window.electronAPI.getBackupPath();
  backupLocationEl.textContent = path;
}

loadEntries();
