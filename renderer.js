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
  if (!entries || entries.length === 0) {
    entriesEl.innerHTML = "<div style='padding:14px;color:#666'>No entries yet</div>";
    lastBackupEl.textContent = "No entries yet";
    return;
  }
  for (const e of entries) {
    const d = document.createElement("div");
    d.className = "entry";
    const ts = new Date(e.ts).toLocaleString();
    d.innerHTML = `<div>${escapeHtml(e.text)}</div><div class="ts">${ts}</div>`;
    entriesEl.appendChild(d);
  }
  lastBackupEl.textContent = `Last entry: ${new Date(entries[0].ts).toLocaleString()}`;
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

function openPrompt() {
  promptText.value = "";
  modal.classList.add("open");
  promptText.focus();
}

function closePrompt() {
  modal.classList.remove("open");
}

saveBtn.addEventListener("click", async () => {
  const text = promptText.value.trim();
  closePrompt();
  if (!text) return;
  await window.electronAPI.saveEntry(text);
  await loadEntries();
});

dismissBtn.addEventListener("click", () => {
  closePrompt();
});

saveIntervalBtn.addEventListener("click", async () => {
  const mins = Number(intervalMinInput.value) || 15;
  await window.electronAPI.setIntervalMinutes(mins);
  alert(`Interval set to ${mins} minute(s)`);
});

window.electronAPI.onOpenPrompt(() => {
  openPrompt();
});

if (backupBtn) {
  backupBtn.addEventListener("click", async () => {
    backupBtn.disabled = true;
    backupBtn.textContent = "Backing up…";
    try {
      await window.electronAPI.createBackup();
      await loadEntries();
      lastBackupEl.textContent = `Backup created: ${new Date().toLocaleString()}`;
      await showBackupLocation();
    } catch (e) {
      console.error("Backup failed:", e);
      alert("Backup failed. Check console.");
    } finally {
      backupBtn.disabled = false;
      backupBtn.textContent = "Backup Now";
    }
  });
}

async function showBackupLocation() {
  try {
    const p = await window.electronAPI.getBackupPath();
    if (backupLocationEl) backupLocationEl.textContent = p || "—";
  } catch (e) {
    console.error("Failed to get backup path:", e);
    if (backupLocationEl) backupLocationEl.textContent = "Unknown";
  }
}

// initial load
loadEntries();
