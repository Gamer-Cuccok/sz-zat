(function () {
  const $ = id => document.getElementById(id);
  const engine = () => window.SPGameEngine;
  const state = { words: new Map(), githubSha: null };

  function toast(message, type = "") {
    const host = $("toastHost");
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[ch]));
  }

  function settings() {
    return {
      owner: $("ghOwner").value.trim(),
      repo: $("ghRepo").value.trim(),
      branch: $("ghBranch").value.trim() || "main",
      path: $("ghPath").value.trim() || "data/words.json",
      token: $("ghToken").value.trim()
    };
  }

  function saveSettingsIfNeeded() {
    if (!$("rememberGh").checked) return;
    const data = settings();
    data.token = $("ghToken").value;
    localStorage.setItem("szoparbaj.admin.github", JSON.stringify(data));
  }

  function restoreSettings() {
    try {
      const data = JSON.parse(localStorage.getItem("szoparbaj.admin.github") || "{}");
      $("ghOwner").value = data.owner || "";
      $("ghRepo").value = data.repo || "";
      $("ghBranch").value = data.branch || "main";
      $("ghPath").value = data.path || "data/words.json";
      $("ghToken").value = data.token || "";
      $("rememberGh").checked = !!data.token || !!data.owner;
    } catch {}
  }

  function normalizeEntry(raw, defaults = {}) {
    const word = engine().normalizeWord(typeof raw === "string" ? raw : raw.word);
    if (!engine().isValidHungarianWordShape(word)) return null;
    const length = Array.from(word).length;
    if (length < 3) return null;
    return { word, length, enabled: raw.enabled !== false, source: raw.source || defaults.source || "admin" };
  }

  function upsert(entry) {
    if (!entry) return false;
    const prev = state.words.get(entry.word) || {};
    state.words.set(entry.word, {
      word: entry.word,
      length: entry.length,
      enabled: entry.enabled !== false,
      source: entry.source || prev.source || "admin"
    });
    return true;
  }

  function addWord(word) {
    const entry = normalizeEntry({ word, enabled: true, source: "admin" });
    if (!entry) throw new Error("Érvénytelen szó. Legalább 3 magyar betű kell, szám és írásjel nélkül.");
    const existed = state.words.has(entry.word) && state.words.get(entry.word).enabled !== false;
    upsert(entry);
    render();
    return existed;
  }

  async function loadJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nem sikerült betölteni: ${url}`);
    const json = await res.json();
    const arr = Array.isArray(json) ? json : (json.words || []);
    let count = 0;
    arr.forEach(raw => { if (upsert(normalizeEntry(raw, { source: "canonical" }))) count += 1; });
    return count;
  }

  async function loadLocal() {
    try {
      state.words.clear();
      const count = await loadJson("data/words.json");
      render();
      toast(`${count} szó betöltve a közös words.json fájlból.`, "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function githubHeaders(token) {
    return { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  }

  async function loadGithub() {
    const s = settings();
    saveSettingsIfNeeded();
    if (!s.owner || !s.repo || !s.token) return toast("Owner, repo és token kötelező.", "error");
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${s.path}?ref=${encodeURIComponent(s.branch)}`;
      const res = await fetch(url, { headers: githubHeaders(s.token) });
      if (!res.ok) throw new Error(`GitHub betöltési hiba: ${res.status}`);
      const data = await res.json();
      state.githubSha = data.sha;
      const text = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      const json = JSON.parse(text);
      state.words.clear();
      (Array.isArray(json) ? json : (json.words || [])).forEach(raw => upsert(normalizeEntry(raw, { source: "github" })));
      render();
      toast("GitHub words.json betöltve.", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function exportData() {
    const words = Array.from(state.words.values())
      .sort((a, b) => a.word.localeCompare(b.word, "hu"))
      .map(w => ({ word: w.word, length: w.length, enabled: w.enabled !== false }));
    return {
      version: 3,
      language: "hu",
      description: "Canonical unified SzóPárbaj word list. Every enabled word is both an accepted guess and a possible answer.",
      policy: "single-list-all-enabled-words-are-guesses-and-answers",
      updatedAt: new Date().toISOString(),
      words
    };
  }

  async function saveGithub() {
    const s = settings();
    saveSettingsIfNeeded();
    if (!s.owner || !s.repo || !s.token) return toast("Owner, repo és token kötelező.", "error");
    try {
      if (!state.githubSha) {
        const metaUrl = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${s.path}?ref=${encodeURIComponent(s.branch)}`;
        const meta = await fetch(metaUrl, { headers: githubHeaders(s.token) });
        if (meta.ok) state.githubSha = (await meta.json()).sha;
      }
      const body = {
        message: "Update unified Hungarian Wordle word list",
        branch: s.branch,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(exportData(), null, 2))))
      };
      if (state.githubSha) body.sha = state.githubSha;
      const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${s.path}`;
      const res = await fetch(url, { method: "PUT", headers: { ...githubHeaders(s.token), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`GitHub mentési hiba: ${res.status}`);
      const data = await res.json();
      state.githubSha = data.content && data.content.sha;
      toast("GitHub mentés kész.", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function importWords() {
    const text = $("importTextarea").value;
    const parts = text.split(/[\s,;]+/g).map(x => x.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;
    parts.forEach(word => {
      try {
        const existed = addWord(word);
        if (existed) skipped += 1;
        else added += 1;
      } catch { skipped += 1; }
    });
    $("importTextarea").value = "";
    render();
    toast(`${added} új szó importálva${skipped ? `, ${skipped} kihagyva vagy már létezett` : ""}.`, "ok");
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "words.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function pushFirebase() {
    if (!window.SPFirebase || !window.SPFirebase.configured) return toast("Firebase nincs beállítva.", "error");
    try {
      const entries = Array.from(state.words.values()).filter(w => w.enabled !== false);
      const updates = {};
      entries.forEach(w => {
        const id = w.word.replace(/[.#$\/\[\]]/g, "_");
        updates[`words/dynamic/${id}`] = { word: w.word, length: w.length, enabled: true, source: "admin", addedAt: Date.now(), addedBy: "admin" };
      });
      await window.SPFirebase.update("", updates);
      toast(`${entries.length} szó elküldve Firebase-be.`, "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function removeWord(word) {
    const entry = state.words.get(word);
    if (!entry) return;
    entry.enabled = false;
    state.words.set(word, entry);
    render();
  }

  function restoreWord(word) {
    const entry = state.words.get(word);
    if (!entry) return;
    entry.enabled = true;
    state.words.set(word, entry);
    render();
  }

  function filteredWords() {
    const query = engine().normalizeWord($("searchWord").value || "");
    const kind = $("filterKind").value;
    const length = Number($("filterLength").value || 0);
    return Array.from(state.words.values()).filter(w => {
      if (query && !w.word.includes(query)) return false;
      if (length && w.length !== length) return false;
      if (kind === "enabled" && w.enabled === false) return false;
      if (kind === "disabled" && w.enabled !== false) return false;
      return true;
    }).sort((a, b) => a.word.localeCompare(b.word, "hu"));
  }

  function renderStats() {
    const all = Array.from(state.words.values());
    const enabled = all.filter(w => w.enabled !== false);
    const byLength = enabled.reduce((acc, w) => { acc[w.length] = (acc[w.length] || 0) + 1; return acc; }, {});
    $("wordStats").innerHTML = `
      <span>Összes: <strong>${all.length}</strong></span>
      <span>Aktív: <strong>${enabled.length}</strong></span>
      <span>Tiltott: <strong>${all.length - enabled.length}</strong></span>
      <span>Hosszak: <strong>${Object.entries(byLength).sort((a,b)=>a[0]-b[0]).map(([l,c]) => `${l}:${c}`).join(" • ")}</strong></span>
    `;
  }

  function renderTable() {
    const rows = filteredWords().slice(0, 600);
    $("wordTable").innerHTML = rows.map(w => `
      <div class="word-row-admin ${w.enabled === false ? "disabled-word" : ""}">
        <strong>${escapeHTML(w.word)}</strong>
        <span class="tag">${w.length} betű</span>
        <span class="tag">${w.enabled === false ? "tiltott" : "közös szó"}</span>
        <button class="${w.enabled === false ? "secondary-btn" : "ghost-btn"} small" data-${w.enabled === false ? "restore" : "remove"}="${escapeHTML(w.word)}">${w.enabled === false ? "Vissza" : "Tilt"}</button>
      </div>
    `).join("");
    $("wordTable").querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => removeWord(btn.dataset.remove)));
    $("wordTable").querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", () => restoreWord(btn.dataset.restore)));
  }

  function render() {
    renderStats();
    renderTable();
  }

  function bind() {
    $("loadLocalButton").addEventListener("click", loadLocal);
    $("loadGithubButton").addEventListener("click", loadGithub);
    $("saveGithubButton").addEventListener("click", saveGithub);
    $("addSingleButton").addEventListener("click", () => {
      try {
        const existed = addWord($("singleWordInput").value);
        $("singleWordInput").value = "";
        toast(existed ? "Ez a szó már benne volt, aktívra állítottam." : "Szó hozzáadva a közös listához.", "ok");
      } catch (err) { toast(err.message, "error"); }
    });
    $("importButton").addEventListener("click", importWords);
    $("exportButton").addEventListener("click", downloadExport);
    $("pushFirebaseButton").addEventListener("click", pushFirebase);
    ["searchWord", "filterKind", "filterLength"].forEach(id => $(id).addEventListener("input", render));
    $("rememberGh").addEventListener("change", saveSettingsIfNeeded);
  }

  async function init() {
    restoreSettings();
    bind();
    await loadLocal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
