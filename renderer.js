const entriesEl = document.getElementById("entries");
const modal = document.getElementById("prompt-modal");
const promptText = document.getElementById("prompt-text");
const saveBtn = document.getElementById("save-entry");
const dismissBtn = document.getElementById("dismiss");
const intervalMinInput = document.getElementById("interval-min");
const saveIntervalBtn = document.getElementById("save-interval");

async function loadEntries() {
  const entries = await window.electronAPI.readEntries();
  entriesEl.innerHTML = "";
  if (!entries || entries.length === 0) {
    entriesEl.innerHTML = "<div style='padding:14px;color:#666'>No entries yet</div>";
    return;
  }
  for (const e of entries) {
    const d = document.createElement("div");
    d.className = "entry";
    const ts = new Date(e.ts).toLocaleString();
    d.innerHTML = `<div>${escapeHtml(e.text)}</div><div class="ts">${ts}</div>`;
    entriesEl.appendChild(d);
  }
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
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
  if (!text) {
    // allow empty? we ignore
    closePrompt();
    return;
  }
  await window.electronAPI.saveEntry(text);
  await loadEntries();
  closePrompt();
});

dismissBtn.addEventListener("click", () => {
  closePrompt();
});

saveIntervalBtn.addEventListener("click", async () => {
  const mins = Number(intervalMinInput.value) || 15;
  await window.electronAPI.setIntervalMinutes(mins);
  alert(`Interval set to ${mins} minute(s)`);
});

// Listen for main process asking to open prompt
window.electronAPI.onOpenPrompt(() => {
  openPrompt();
});

// initial load
loadEntries();
