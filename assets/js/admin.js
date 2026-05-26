(function () {
  const $ = id => document.getElementById(id);
  const engine = () => window.SPGameEngine;
  const state = { words: new Map(), githubSha: null, busy: false };

  function toast(message, type = "") {
    const host = $("toastHost");
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => node.remove(), 5200);
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[ch]));
  }

  function setBusy(isBusy, label) {
    state.busy = !!isBusy;
    const button = $("addEverywhereButton");
    if (!button) return;
    button.disabled = !!isBusy;
    button.textContent = isBusy ? (label || "Dolgozom...") : "Hozzáadás";
  }

  function setReport(lines, type = "") {
    const el = $("addReport");
    if (!el) return;
    const arr = Array.isArray(lines) ? lines : [lines];
    el.className = `add-report ${type}`.trim();
    el.innerHTML = arr.filter(Boolean).map(line => `<div>${escapeHTML(line)}</div>`).join("");
    el.classList.toggle("hidden", arr.length === 0);
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

  function githubIsReady() {
    const s = settings();
    return !!(s.owner && s.repo && s.branch && s.path && s.token);
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
    const obj = typeof raw === "string" ? { word: raw } : (raw || {});
    const word = engine().normalizeWord(obj.word);
    if (!engine().isValidHungarianWordShape(word)) return null;
    const length = Array.from(word).length;
    if (length < 3) return null;
    return {
      word,
      length,
      enabled: obj.enabled !== false,
      source: obj.source || defaults.source || "admin"
    };
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

  function extractWords(text) {
    const normalized = String(text || "").toLocaleLowerCase("hu-HU").normalize("NFC");
    return normalized.match(/[a-záéíóöőúüű]+/giu) || [];
  }

  function sleepFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  async function applyWordBatch(rawWords) {
    const seenInBatch = new Set();
    const changedEntries = [];
    const publishEntries = [];
    const result = {
      added: 0,
      reactivated: 0,
      duplicate: 0,
      repeatedInBatch: 0,
      invalid: 0,
      totalParsed: rawWords.length
    };

    for (let i = 0; i < rawWords.length; i += 1) {
      const entry = normalizeEntry({ word: rawWords[i], enabled: true, source: "admin" });
      if (!entry) {
        result.invalid += 1;
      } else if (seenInBatch.has(entry.word)) {
        result.repeatedInBatch += 1;
      } else {
        seenInBatch.add(entry.word);
        const prev = state.words.get(entry.word);
        if (prev && prev.enabled !== false) {
          result.duplicate += 1;
          publishEntries.push({ ...prev, word: entry.word, length: entry.length, enabled: true });
        } else {
          const finalEntry = {
            ...prev,
            word: entry.word,
            length: entry.length,
            enabled: true,
            source: prev && prev.source ? prev.source : entry.source
          };
          state.words.set(entry.word, finalEntry);
          changedEntries.push(finalEntry);
          publishEntries.push(finalEntry);
          if (prev && prev.enabled === false) result.reactivated += 1;
          else result.added += 1;
        }
      }

      if (i > 0 && i % 900 === 0) {
        setBusy(true, `Feldolgozás... ${i}/${rawWords.length}`);
        await sleepFrame();
      }
    }

    result.changedEntries = changedEntries;
    result.publishEntries = publishEntries;
    return result;
  }

  async function readSelectedTextFiles() {
    const input = $("wordFileInput");
    const files = Array.from(input && input.files ? input.files : []);
    const chunks = [];
    for (let i = 0; i < files.length; i += 1) {
      setBusy(true, `TXT olvasás... ${i + 1}/${files.length}`);
      chunks.push(await files[i].text());
      await sleepFrame();
    }
    return chunks;
  }

  async function collectWordsFromInputs() {
    const chunks = [];
    const single = $("singleWordInput").value.trim();
    if (single) chunks.push(single);
    const text = $("importTextarea").value.trim();
    if (text) chunks.push(text);
    const fileTexts = await readSelectedTextFiles();
    chunks.push(...fileTexts);
    return chunks.flatMap(extractWords);
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
      version: 4,
      language: "hu",
      description: "Canonical unified SzóPárbaj word list. Every enabled word is both an accepted guess and a possible answer.",
      policy: "single-list-all-enabled-words-are-guesses-and-answers",
      updatedAt: new Date().toISOString(),
      words
    };
  }

  async function saveGithub(options = {}) {
    const silent = !!options.silent;
    const s = settings();
    saveSettingsIfNeeded();
    if (!s.owner || !s.repo || !s.token) {
      if (!silent) toast("Owner, repo és token kötelező.", "error");
      return { ok: false, skipped: true, message: "GitHub nincs beállítva" };
    }
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
      if (!silent) toast("GitHub mentés kész.", "ok");
      return { ok: true, message: "GitHub mentés kész" };
    } catch (err) {
      if (!silent) toast(err.message, "error");
      return { ok: false, message: err.message };
    }
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

  async function pushEntriesToFirebase(entries) {
    if (!entries.length) return { ok: true, count: 0, skipped: 0, message: "Nem volt új Firebase-be küldendő szó" };
    if (!window.SPFirebase || !window.SPFirebase.configured) {
      return { ok: false, skipped: true, count: 0, message: "Firebase nincs beállítva" };
    }

    let pushed = 0;
    let skipped = 0;
    const chunkSize = 450;
    for (let start = 0; start < entries.length; start += chunkSize) {
      const chunk = entries.slice(start, start + chunkSize);
      const updates = {};
      chunk.forEach(w => {
        const id = String(w.word || "").replace(/[.#$\/\[\]]/g, "_");
        if (!id) { skipped += 1; return; }
        updates[`words/dynamic/${id}`] = {
          word: w.word,
          length: w.length,
          enabled: true,
          source: "admin",
          addedAt: Date.now(),
          addedBy: "admin"
        };
      });
      if (Object.keys(updates).length) {
        setBusy(true, `Firebase élesítés... ${Math.min(start + chunk.length, entries.length)}/${entries.length}`);
        await window.SPFirebase.update("", updates);
        pushed += Object.keys(updates).length;
      }
      await sleepFrame();
    }
    return { ok: true, count: pushed, skipped, message: `${pushed} szó élesítve Firebase-ben` };
  }

  async function addEverywhere() {
    if (state.busy) return;
    setReport([]);
    setBusy(true, "Előkészítés...");

    try {
      const rawWords = await collectWordsFromInputs();
      if (!rawWords.length) {
        toast("Adj meg legalább egy szót, vagy válassz ki egy TXT fájlt.", "error");
        setReport("Nincs feldolgozható szó.", "error");
        return;
      }

      setBusy(true, "Szavak feldolgozása...");
      const batch = await applyWordBatch(rawWords);
      render();

      let firebaseResult = { ok: true, count: 0, message: "Nem volt új szó Firebase-be küldve" };
      let githubResult = { ok: false, skipped: true, message: "GitHub nincs beállítva" };

      if (batch.publishEntries.length) {
        firebaseResult = await pushEntriesToFirebase(batch.publishEntries);
        if (githubIsReady()) {
          setBusy(true, "GitHub mentés...");
          githubResult = await saveGithub({ silent: true });
        }
      }

      $("singleWordInput").value = "";
      $("importTextarea").value = "";
      $("wordFileInput").value = "";
      updateSelectedFileInfo();

      const lines = [
        `Feldolgozva: ${batch.totalParsed} szó`,
        `Új: ${batch.added}, újra aktivált: ${batch.reactivated}, már létezett: ${batch.duplicate}`,
        batch.repeatedInBatch ? `Ismétlés ugyanebben az importban: ${batch.repeatedInBatch}` : "",
        batch.invalid ? `Érvénytelen / túl rövid: ${batch.invalid}` : "",
        firebaseResult.ok ? firebaseResult.message : `Firebase: ${firebaseResult.message}`,
        githubResult.ok ? githubResult.message : (githubResult.skipped ? "GitHub: nincs beállítva, ezért a data/words.json fájl nem mentődött automatikusan" : `GitHub: ${githubResult.message}`)
      ].filter(Boolean);

      const ok = batch.publishEntries.length && firebaseResult.ok && (githubResult.ok || githubResult.skipped);
      setReport(lines, ok ? "ok" : "warn");

      const activatedCount = batch.added + batch.reactivated;
      if (!batch.publishEntries.length) {
        toast("Nem volt feldolgozható szó, minden ismétlés vagy érvénytelen volt.", "warn");
      } else if (!githubResult.ok && githubResult.skipped) {
        toast(activatedCount
          ? `${activatedCount} szó hozzáadva és Firebase-ben élesítve. GitHub mentéshez töltsd ki a GitHub adatokat.`
          : "Új szó nem volt, de a megadott szavakat újra élesítettem Firebase-ben.", "ok");
      } else if (firebaseResult.ok && githubResult.ok) {
        toast(activatedCount
          ? `${activatedCount} szó hozzáadva mindenhová.`
          : "Új szó nem volt, de a megadott szavakat újra élesítettem és GitHubra is mentettem.", "ok");
      } else {
        toast("A helyi admin lista frissült, de az egyik online mentés hibázott. Nézd meg a jelentést.", "error");
      }
    } catch (err) {
      setReport(err.message, "error");
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
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

  function updateSelectedFileInfo() {
    const input = $("wordFileInput");
    const info = $("selectedFileInfo");
    if (!input || !info) return;
    const files = Array.from(input.files || []);
    if (!files.length) {
      info.textContent = "Nincs kiválasztott TXT fájl.";
      return;
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const names = files.slice(0, 3).map(file => file.name).join(", ");
    info.textContent = `${files.length} fájl kiválasztva: ${names}${files.length > 3 ? "..." : ""} • ${(total / 1024).toFixed(1)} KB`;
  }

  function bind() {
    $("loadLocalButton").addEventListener("click", loadLocal);
    $("loadGithubButton").addEventListener("click", loadGithub);
    $("saveGithubButton").addEventListener("click", () => saveGithub());
    $("addEverywhereButton").addEventListener("click", addEverywhere);
    $("singleWordInput").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addEverywhere();
      }
    });
    $("importTextarea").addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        addEverywhere();
      }
    });
    $("wordFileInput").addEventListener("change", updateSelectedFileInfo);
    $("exportButton").addEventListener("click", downloadExport);
    ["searchWord", "filterKind", "filterLength"].forEach(id => $(id).addEventListener("input", render));
    $("rememberGh").addEventListener("change", saveSettingsIfNeeded);
  }

  async function init() {
    restoreSettings();
    bind();
    updateSelectedFileInfo();
    await loadLocal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
