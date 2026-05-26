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
      path: $("ghPath").value.trim() || "data/starter-words.json",
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
      $("ghPath").value = data.path || "data/starter-words.json";
      $("ghToken").value = data.token || "";
      $("rememberGh").checked = !!data.token || !!data.owner;
    } catch {}
  }

  function normalizeEntry(raw, defaults = {}) {
    const word = engine().normalizeWord(typeof raw === "string" ? raw : raw.word);
    if (!engine().isValidHungarianWordShape(word)) return null;
    return {
      word,
      length: Array.from(word).length,
      isAnswer: raw.isAnswer ?? defaults.isAnswer ?? true,
      isAccepted: raw.isAccepted ?? defaults.isAccepted ?? true,
      enabled: raw.enabled ?? defaults.enabled ?? true,
      source: raw.source || defaults.source || "admin"
    };
  }

  function upsert(entry) {
    if (!entry) return false;
    const prev = state.words.get(entry.word) || { word: entry.word, length: entry.length, isAnswer: false, isAccepted: false, enabled: true, source: entry.source };
    prev.isAnswer = !!(prev.isAnswer || entry.isAnswer);
    prev.isAccepted = !!(prev.isAccepted || entry.isAccepted || entry.isAnswer);
    prev.enabled = entry.enabled !== false;
    prev.length = entry.length;
    prev.source = entry.source;
    state.words.set(entry.word, prev);
    return true;
  }

  function addWord(word, isAnswer, isAccepted) {
    const entry = normalizeEntry({ word, isAnswer, isAccepted: isAccepted || isAnswer, enabled: true, source: "admin" });
    if (!entry) throw new Error("Érvénytelen szó. Csak magyar betűk engedélyezettek.");
    const existed = state.words.has(entry.word);
    upsert(entry);
    render();
    return existed;
  }

  async function loadJson(url, defaults) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nem sikerült betölteni: ${url}`);
    const json = await res.json();
    const words = Array.isArray(json) ? json : json.words || [];
    let count = 0;
    words.forEach(raw => { if (upsert(normalizeEntry(raw, defaults))) count += 1; });
    return count;
  }

  async function loadLocal() {
    try {
      state.words.clear();
      const a = await loadJson("data/starter-words.json", { isAnswer: true, isAccepted: true, source: "starter" });
      const b = await loadJson("data/accepted-words.json", { isAnswer: false, isAccepted: true, source: "accepted" });
      render();
      toast(`${a + b} helyi szó betöltve.`, "ok");
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
      (Array.isArray(json) ? json : json.words || []).forEach(raw => upsert(normalizeEntry(raw, { isAnswer: true, isAccepted: true, source: "github" })));
      render();
      toast("GitHub szólista betöltve.", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function exportData() {
    const words = Array.from(state.words.values()).sort((a, b) => a.word.localeCompare(b.word, "hu"));
    return { version: 1, updatedAt: new Date().toISOString(), words };
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
        message: "Update Hungarian Wordle word list",
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

  function importWords(kind) {
    const text = $("importTextarea").value;
    const parts = text.split(/[\s,;]+/g).map(x => x.trim()).filter(Boolean);
    let added = 0;
    let bad = 0;
    parts.forEach(word => {
      try {
        addWord(word, kind === "both", true);
        added += 1;
      } catch { bad += 1; }
    });
    $("importTextarea").value = "";
    render();
    toast(`${added} szó importálva${bad ? `, ${bad} hibás kihagyva` : ""}.`, bad ? "" : "ok");
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "starter-words.json";
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
        const id = w.word.replace(/[.#$\/[\]]/g, "_");
        updates[`words/dynamic/${id}`] = { ...w, source: "admin", addedAt: Date.now(), addedBy: "admin" };
      });
      await window.SPFirebase.update("", updates);
      toast(`${entries.length} szó elküldve Firebase-be.`, "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function toggle(word, field) {
    const entry = state.words.get(word);
    if (!entry) return;
    entry[field] = !entry[field];
    if (field === "isAnswer" && entry.isAnswer) entry.isAccepted = true;
    state.words.set(word, entry);
    render();
  }

  function removeWord(word) {
    const entry = state.words.get(word);
    if (!entry) return;
    entry.enabled = false;
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
      if (kind === "answer" && !w.isAnswer) return false;
      if (kind === "acceptedOnly" && (w.isAnswer || !w.isAccepted)) return false;
      if (kind === "disabled" && w.enabled !== false) return false;
      if (kind !== "disabled" && w.enabled === false) return false;
      return true;
    }).sort((a, b) => a.length - b.length || a.word.localeCompare(b.word, "hu"));
  }

  function renderStats() {
    const words = Array.from(state.words.values());
    const enabled = words.filter(w => w.enabled !== false);
    const byLength = enabled.reduce((acc, w) => { acc[w.length] = (acc[w.length] || 0) + 1; return acc; }, {});
    $("wordStats").innerHTML = [
      `<span>Összes aktív: <strong>${enabled.length}</strong></span>`,
      `<span>Válasz szó: <strong>${enabled.filter(w => w.isAnswer).length}</strong></span>`,
      `<span>Elfogadott tipp: <strong>${enabled.filter(w => w.isAccepted || w.isAnswer).length}</strong></span>`,
      `<span>Tiltott: <strong>${words.filter(w => w.enabled === false).length}</strong></span>`,
      ...Object.entries(byLength).sort((a, b) => a[0] - b[0]).map(([len, count]) => `<span>${len} betű: <strong>${count}</strong></span>`)
    ].join("");
  }

  function renderTable() {
    const list = filteredWords().slice(0, 700);
    $("wordTable").innerHTML = list.map(w => `
      <div class="word-row-admin">
        <strong>${escapeHTML(w.word)}</strong>
        <span class="tag">${w.length} betű</span>
        <button class="secondary-btn small" data-toggle="isAnswer" data-word="${escapeHTML(w.word)}">${w.isAnswer ? "válasz" : "nem válasz"}</button>
        <button class="secondary-btn small" data-toggle="isAccepted" data-word="${escapeHTML(w.word)}">${w.isAccepted || w.isAnswer ? "elfogadott" : "nem elfogadott"}</button>
        <button class="ghost-btn small" data-remove="${escapeHTML(w.word)}">Tilt</button>
      </div>
    `).join("") || '<p class="hint">Nincs találat.</p>';
    $("wordTable").querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", () => toggle(btn.dataset.word, btn.dataset.toggle)));
    $("wordTable").querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => removeWord(btn.dataset.remove)));
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
        const existed = addWord($("singleWordInput").value, $("singleIsAnswer").checked, $("singleIsAccepted").checked);
        $("singleWordInput").value = "";
        toast(existed ? "A szó már létezett, frissítve." : "Szó hozzáadva.", "ok");
      } catch (err) { toast(err.message, "error"); }
    });
    $("importAsBothButton").addEventListener("click", () => importWords("both"));
    $("importAcceptedButton").addEventListener("click", () => importWords("accepted"));
    $("exportButton").addEventListener("click", downloadExport);
    $("pushFirebaseButton").addEventListener("click", pushFirebase);
    ["searchWord", "filterKind", "filterLength"].forEach(id => $(id).addEventListener("input", renderTable));
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreSettings();
    bind();
    loadLocal();
  });
})();
