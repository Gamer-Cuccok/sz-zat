(function () {
  const config = window.APP_CONFIG && window.APP_CONFIG.firebase;
  const hasFirebaseLib = typeof window.firebase !== "undefined";
  const configured = !!(hasFirebaseLib && config && config.apiKey && config.databaseURL && config.projectId);
  let app = null;
  let db = null;

  function setStatus(text, ok) {
    const el = document.getElementById("connectionStatus");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("warn", !ok);
  }

  if (configured) {
    try {
      app = window.firebase.apps && window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      db = window.firebase.database(app);
      setStatus("Firebase aktív", true);
    } catch (err) {
      console.error("Firebase init failed", err);
      setStatus("Firebase hiba", false);
    }
  } else {
    setStatus("Firebase nincs beállítva", false);
  }

  function ensureDb() {
    if (!db) {
      throw new Error("Firebase nincs beállítva. Másold a config.example.js fájlt config.js néven, és töltsd ki.");
    }
    return db;
  }

  async function get(path) {
    const snap = await ensureDb().ref(path).get();
    return snap.val();
  }

  async function set(path, value) {
    return ensureDb().ref(path).set(value);
  }

  async function update(path, value) {
    return ensureDb().ref(path).update(value);
  }

  async function remove(path) {
    return ensureDb().ref(path).remove();
  }

  function push(path, value) {
    const ref = ensureDb().ref(path).push();
    return ref.set(value).then(() => ref.key);
  }

  function onValue(path, cb, errCb) {
    const ref = ensureDb().ref(path);
    const handler = snap => cb(snap.val(), snap);
    ref.on("value", handler, errCb || console.error);
    return () => ref.off("value", handler);
  }

  function onChild(path, eventName, cb, errCb) {
    const ref = ensureDb().ref(path);
    const handler = snap => cb(snap.val(), snap.key, snap);
    ref.on(eventName, handler, errCb || console.error);
    return () => ref.off(eventName, handler);
  }

  function serverTimestamp() {
    return window.firebase && window.firebase.database ? window.firebase.database.ServerValue.TIMESTAMP : Date.now();
  }

  async function transaction(path, fn) {
    const result = await ensureDb().ref(path).transaction(fn);
    return result.snapshot.val();
  }

  window.SPFirebase = {
    configured: !!db,
    db,
    get,
    set,
    update,
    remove,
    push,
    onValue,
    onChild,
    transaction,
    serverTimestamp,
    ensureDb
  };
})();
