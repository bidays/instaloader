// Carnet de recettes : signet (bookmarklet) à lancer sur instagram.com, depuis Safari sur iPhone.
// Ne pas installer ce fichier tel quel : `python recettes/recettes.py signet` produit signet.txt.
(async () => {
  if (!/(^|\.)instagram\.com$/.test(location.hostname)) {
    alert("Ouvre d'abord instagram.com dans Safari (connecté à ton compte), puis touche à nouveau ce signet.");
    return;
  }
  if (window.__carnet) { window.__carnet.show(); return; }

  const TAGS = /*__TAGS__*/{};
  const APP_ID = "936619743392459";
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("carnet." + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("carnet." + k, JSON.stringify(v)); } catch (e) {} },
  };
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
  const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // --- API Instagram (avec la session déjà ouverte dans Safari) ---
  async function api(path) {
    const r = await fetch("/api/v1/" + path, {
      credentials: "include",
      headers: { "X-IG-App-ID": APP_ID, "X-Requested-With": "XMLHttpRequest" },
    });
    if (r.status === 401 || r.status === 403 || r.redirected) throw new Error("Connecte-toi d'abord à Instagram dans Safari.");
    if (r.status === 429) throw new Error("Instagram demande de patienter un peu, réessaie dans quelques minutes.");
    if (!r.ok) throw new Error("Erreur Instagram " + r.status);
    return r.json();
  }
  async function collections() {
    const d = await api('collections/list/?collection_types=' + encodeURIComponent('["ALL_MEDIA_AUTO_COLLECTION","MEDIA"]'));
    return (d.items || []).filter(c => c.collection_type !== "ALL_MEDIA_AUTO_COLLECTION")
      .map(c => ({ id: c.collection_id, name: c.collection_name, n: c.collection_media_count }));
  }
  async function fetchAll(cfg, progress) {
    const base = cfg.id ? "feed/collection/" + cfg.id + "/posts/" : "feed/saved/posts/";
    const out = [];
    let maxId = null;
    for (;;) {
      const d = await api(base + (maxId ? "?max_id=" + encodeURIComponent(maxId) : ""));
      (d.items || []).forEach(it => { const m = it.media || it; if (m && m.code) out.push(toRecipe(m)); });
      progress(out.length);
      if (!d.more_available || !d.next_max_id) return out;
      maxId = d.next_max_id;
      await sleep(700);
    }
  }

  // --- Mise en forme d'un post ---
  function pickThumb(m) {
    const src = m.image_versions2 ? m : (m.carousel_media || [])[0] || {};
    const c = (src.image_versions2 || {}).candidates || [];
    if (!c.length) return "";
    const ok = c.filter(x => x.width >= 400);
    return (ok.length ? ok.reduce((a, b) => a.width <= b.width ? a : b) : c[0]).url;
  }
  function findTags(caption, table) {
    const n = norm(caption);
    return Object.keys(table).filter(t => table[t].some(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(n)));
  }
  function guessTitle(caption, author) {
    for (let line of caption.split("\n")) {
      line = line.replace(/#\w+|@[\w.]+/g, "").trim().replace(/^[\s\-–—:•*|]+|[\s\-–—:•*|]+$/g, "");
      if (line.replace(/[\W_]/g, "").length >= 4) return line.length > 90 ? line.slice(0, 90) + "…" : line;
    }
    return author ? "Recette de @" + author : "Recette";
  }
  function toRecipe(m) {
    const caption = (m.caption && m.caption.text) || "";
    const reel = m.product_type === "clips";
    const author = (m.user || {}).username || "";
    return {
      code: m.code, url: "/" + (reel ? "reel" : "p") + "/" + m.code + "/", auteur: author,
      titre: guessTitle(caption, author), legende: caption, video: reel || m.media_type === 2,
      date: new Date((m.taken_at || 0) * 1000).toLocaleDateString("fr-FR"), thumb: pickThumb(m),
      ingredients: findTags(caption, TAGS.ingredients), categories: findTags(caption, TAGS.categories),
      regimes: findTags(caption, TAGS.regimes),
    };
  }

  // --- Interface (dans un Shadow DOM pour ne pas être perturbée par le style d'Instagram) ---
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
:host { --bg:#faf7f2; --card:#fff; --text:#2b2420; --muted:#8a7f76; --line:#ece5dc; --accent:#c8553d; --soft:#f6e3dc; --chip:#f1ebe3; }
@media (prefers-color-scheme: dark) { :host { --bg:#1b1816; --card:#262220; --text:#f1ebe5; --muted:#a39890; --line:#3a3430; --accent:#e57a5f; --soft:#3d2a24; --chip:#322c29; } }
* { box-sizing:border-box; }
.app { position:absolute; inset:0; background:var(--bg); color:var(--text); overflow-y:auto; -webkit-overflow-scrolling:touch;
       font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
header { position:sticky; top:0; z-index:2; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 16px 10px; padding-top:max(12px,env(safe-area-inset-top)); }
.top { display:flex; gap:8px; align-items:center; }
input { flex:1; min-width:0; padding:10px 14px; border-radius:12px; border:1px solid var(--line); background:var(--card); color:var(--text); font-size:16px; }
button { font:inherit; color:inherit; cursor:pointer; }
.btn { border:1px solid var(--line); background:var(--card); border-radius:12px; padding:9px 11px; white-space:nowrap; }
.status { color:var(--muted); font-size:12px; margin-top:6px; }
.filters { margin-top:8px; display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; }
.filters::-webkit-scrollbar { display:none; }
.chip { border:0; background:var(--chip); border-radius:999px; padding:6px 12px; font-size:13px; white-space:nowrap; }
.chip.on { background:var(--accent); color:#fff; }
.sep { width:1px; background:var(--line); flex:none; margin:0 4px; }
main { padding:14px 16px 40px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
.card { background:var(--card); border-radius:14px; overflow:hidden; border:1px solid var(--line); position:relative; }
.card img, .noimg { width:100%; aspect-ratio:4/5; object-fit:cover; background:var(--chip); display:block; }
.noimg { display:grid; place-items:center; font-size:40px; }
.t { padding:8px 10px 2px; font-weight:600; font-size:14px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.a { padding:0 10px 10px; color:var(--muted); font-size:12px; }
.badge { position:absolute; top:8px; left:8px; background:rgba(0,0,0,.55); color:#fff; border-radius:8px; padding:2px 7px; font-size:12px; }
.fav { position:absolute; top:6px; right:6px; border:0; background:rgba(0,0,0,.4); color:#fff; border-radius:50%; width:34px; height:34px; font-size:16px; }
.fav.on { background:var(--accent); }
.empty { text-align:center; color:var(--muted); padding:50px 0; }
.list button { display:block; width:100%; text-align:left; margin-bottom:8px; padding:14px; border-radius:12px; border:1px solid var(--line); background:var(--card); }
.list small { color:var(--muted); }
.sheet { position:absolute; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:flex-end; z-index:3; }
.panel { background:var(--card); color:var(--text); width:100%; max-height:92%; border-radius:18px 18px 0 0; display:flex; flex-direction:column;
         font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding-bottom:env(safe-area-inset-bottom); }
.p-head { display:flex; gap:12px; padding:16px; border-bottom:1px solid var(--line); }
.p-head img { width:84px; aspect-ratio:4/5; object-fit:cover; border-radius:10px; flex:none; }
.p-head h2 { font-size:17px; margin:0 0 4px; }
.meta { color:var(--muted); font-size:13px; }
.tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.tags span { background:var(--soft); border-radius:999px; padding:2px 9px; font-size:12px; }
.body { padding:16px; overflow-y:auto; white-space:pre-wrap; word-wrap:break-word; -webkit-overflow-scrolling:touch; }
mark { background:#ffe58a; color:#000; border-radius:3px; }
textarea { margin:0 16px 10px; width:calc(100% - 32px); min-height:56px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--text); padding:8px 10px; font:inherit; font-size:16px; }
.actions { display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; border-top:1px solid var(--line); }
.primary { background:var(--accent); color:#fff; border:0; border-radius:12px; padding:9px 14px; text-decoration:none; }
.right { margin-left:auto; }
@media (min-width:700px) { .panel { max-width:720px; margin:0 auto; border-radius:18px; align-self:center; } .sheet { align-items:center; } }
</style>
<div class="app">
  <header>
    <div class="top">
      <input id="q" type="search" placeholder="Poulet curry, tiramisu, @auteur…" autocomplete="off">
      <button class="btn" id="rand" aria-label="Idée au hasard">🎲</button>
      <button class="btn" id="exp" aria-label="Exporter vers Nos recettes">📤</button>
      <button class="btn" id="cfg" aria-label="Choisir la collection">⚙︎</button>
      <button class="btn" id="close" aria-label="Fermer">✕</button>
    </div>
    <div class="filters" id="filters"></div>
    <div class="status" id="status"></div>
  </header>
  <main id="main"></main>
</div>`;
  const $ = id => root.getElementById(id);

  let cfg = store.get("cfg", null);
  let recipes = store.get("cache", []);
  let favs = new Set(store.get("favs", []));
  let notes = store.get("notes", {});
  const state = { q: "", filters: new Set(), favOnly: false };
  const status = t => { $("status").textContent = t; };

  function index() { recipes.forEach(r => { r._s = norm([r.titre, r.legende, "@" + r.auteur, ...r.ingredients, ...r.categories, ...r.regimes].join(" ")); }); }

  function buildFilters() {
    const count = {};
    recipes.forEach(r => [...r.categories, ...r.regimes, ...r.ingredients].forEach(t => count[t] = (count[t] || 0) + 1));
    const el = $("filters");
    el.innerHTML = "";
    const add = (label, on, fn) => {
      const b = document.createElement("button");
      b.className = "chip" + (on ? " on" : "");
      b.textContent = label;
      b.onclick = () => { fn(); buildFilters(); render(); };
      el.appendChild(b);
    };
    add("❤️ Favoris (" + favs.size + ")", state.favOnly, () => state.favOnly = !state.favOnly);
    for (const key of ["categories", "regimes", "ingredients"]) {
      const tags = [...new Set(recipes.flatMap(r => r[key]))].sort((a, b) => count[b] - count[a]);
      if (!tags.length) continue;
      const s = document.createElement("span"); s.className = "sep"; el.appendChild(s);
      tags.forEach(t => add(t + " " + count[t], state.filters.has(t),
        () => state.filters.has(t) ? state.filters.delete(t) : state.filters.add(t)));
    }
  }

  function results() {
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    return recipes.filter(r =>
      (!state.favOnly || favs.has(r.code)) &&
      [...state.filters].every(t => r.categories.includes(t) || r.regimes.includes(t) || r.ingredients.includes(t)) &&
      words.every(w => r._s.includes(w) || norm(notes[r.code]).includes(w)));
  }

  function render() {
    const list = results();
    const main = $("main");
    if (!recipes.length) { main.innerHTML = '<div class="empty">Chargement des recettes…</div>'; return; }
    main.innerHTML = '<div class="meta" style="margin-bottom:10px">' + list.length + " recette" + (list.length > 1 ? "s" : "") +
      (list.length !== recipes.length ? " sur " + recipes.length : "") + '</div><div class="grid"></div>' +
      (list.length ? "" : '<div class="empty">Aucune recette ne correspond 🤷</div>');
    const grid = main.querySelector(".grid");
    for (const r of list) {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = (r.thumb ? '<img loading="lazy" referrerpolicy="no-referrer" alt="">' : '<div class="noimg">🍽️</div>') +
        (r.video ? '<span class="badge">▶ Reel</span>' : "") +
        '<button class="fav' + (favs.has(r.code) ? " on" : "") + '" aria-label="Favori">♥</button>' +
        '<div class="t">' + esc(r.titre) + '</div><div class="a">@' + esc(r.auteur) + "</div>";
      const img = c.querySelector("img");
      if (img) { img.src = r.thumb; img.onerror = () => { img.replaceWith(Object.assign(document.createElement("div"), { className: "noimg", textContent: "🍽️" })); }; }
      c.querySelector(".fav").onclick = e => { e.stopPropagation(); toggleFav(r.code); };
      c.onclick = () => openRecipe(r);
      grid.appendChild(c);
    }
  }

  function toggleFav(code) {
    favs.has(code) ? favs.delete(code) : favs.add(code);
    store.set("favs", [...favs]);
    buildFilters(); render();
  }

  function highlight(el, text) {
    const words = norm(state.q).split(/\s+/).filter(w => w.length > 2 && w[0] !== "@");
    el.textContent = text;
    if (!words.length) return;
    let n = "", idx = [];
    for (let i = 0; i < text.length; i++) { const c = norm(text[i]); n += c; for (const _ of c) idx.push(i); }
    const marks = [];
    words.forEach(w => { let i = 0; while ((i = n.indexOf(w, i)) !== -1) { marks.push([idx[i], idx[i + w.length - 1] + 1]); i += w.length; } });
    if (!marks.length) return;
    marks.sort((a, b) => a[0] - b[0]);
    el.textContent = "";
    let pos = 0;
    for (const [s, e] of marks) {
      if (s < pos) continue;
      el.append(text.slice(pos, s));
      const m = document.createElement("mark"); m.textContent = text.slice(s, e); el.append(m);
      pos = e;
    }
    el.append(text.slice(pos));
  }

  function openRecipe(r) {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const tags = [...r.categories, ...r.regimes, ...r.ingredients].map(t => "<span>" + esc(t) + "</span>").join("");
    sheet.innerHTML = '<div class="panel"><div class="p-head">' +
      (r.thumb ? '<img referrerpolicy="no-referrer" alt="">' : "") +
      "<div><h2>" + esc(r.titre) + '</h2><div class="meta">@' + esc(r.auteur) + " · " + esc(r.date) + '</div><div class="tags">' + tags + "</div></div></div>" +
      '<div class="body"></div><textarea placeholder="Nos notes (testée ? modifs ?…)"></textarea>' +
      '<div class="actions"><a class="primary" target="_blank" rel="noopener" href="' + esc(r.url) + '">Voir sur Instagram</a>' +
      '<button class="btn share">Partager</button><button class="btn fv"></button><button class="btn right cl">Fermer</button></div></div>';
    if (r.thumb) sheet.querySelector("img").src = r.thumb;
    highlight(sheet.querySelector(".body"), r.legende || "(pas de légende — la recette est sûrement dans la vidéo)");
    const ta = sheet.querySelector("textarea");
    ta.value = notes[r.code] || "";
    ta.oninput = () => { ta.value ? notes[r.code] = ta.value : delete notes[r.code]; store.set("notes", notes); };
    const fv = sheet.querySelector(".fv");
    const label = () => { fv.textContent = favs.has(r.code) ? "♥ Favori" : "♡ Favori"; };
    label();
    fv.onclick = () => { toggleFav(r.code); label(); };
    sheet.querySelector(".share").onclick = async () => {
      const url = "https://www.instagram.com" + r.url;
      try {
        if (navigator.share) await navigator.share({ title: r.titre, text: r.titre, url });
        else { await navigator.clipboard.writeText(r.titre + "\n" + url); alert("Lien copié"); }
      } catch (e) {}
    };
    const close = () => sheet.remove();
    sheet.querySelector(".cl").onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    root.querySelector(".app").appendChild(sheet);
  }

  async function chooseCollection() {
    const main = $("main");
    main.innerHTML = '<div class="empty">Chargement de tes collections…</div>';
    let cols;
    try { cols = await collections(); } catch (e) { main.innerHTML = '<div class="empty">' + esc(e.message) + "</div>"; return; }
    main.innerHTML = '<p>Quelle collection contient tes recettes ?</p><div class="list"></div>';
    const list = main.querySelector(".list");
    const opts = [...cols.filter(c => c.id && c.name), { id: null, name: "Tous mes enregistrements" }];
    opts.forEach(c => {
      const b = document.createElement("button");
      b.innerHTML = esc(c.name) + (c.n != null ? " <small>· " + c.n + " posts</small>" : "");
      b.onclick = () => {
        cfg = { id: c.id, name: c.name };
        store.set("cfg", cfg);
        recipes = []; store.set("cache", []);
        buildFilters(); refresh();
      };
      list.appendChild(b);
    });
  }

  async function refresh() {
    if (!cfg) return chooseCollection();
    index(); buildFilters(); render();
    status("« " + cfg.name + " » · mise à jour…");
    try {
      const fresh = await fetchAll(cfg, n => status("« " + cfg.name + " » · mise à jour… " + n));
      recipes = fresh;
      store.set("cache", recipes.map(({ _s, ...r }) => r));
      index(); buildFilters(); render();
      status("« " + cfg.name + " » · " + recipes.length + " recettes · à jour");
    } catch (e) {
      status((recipes.length ? "Copie hors ligne affichée · " : "") + e.message);
      if (!recipes.length) $("main").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    }
  }

  let timer;
  $("q").addEventListener("input", e => { const v = e.target.value; clearTimeout(timer); timer = setTimeout(() => { state.q = v; render(); }, 120); });
  $("rand").onclick = () => { const l = results(); if (l.length) openRecipe(l[Math.floor(Math.random() * l.length)]); };
  $("cfg").onclick = chooseCollection;
  // Copie la collection pour l'importer dans l'app partagée « Nos recettes ».
  $("exp").onclick = async () => {
    if (!recipes.length) { status("Rien à exporter pour l'instant."); return; }
    const data = JSON.stringify({ recettes: recipes.map(r => ({ code: r.code, url: "https://www.instagram.com" + r.url, auteur: r.auteur, titre: r.titre, legende: r.legende })) });
    try { await navigator.clipboard.writeText(data); status(recipes.length + " recettes copiées : colle-les dans « Nos recettes » → Importer."); }
    catch (e) { status("Copie refusée par Safari, réessaie."); }
  };
  $("close").onclick = () => { host.remove(); document.documentElement.style.overflow = ""; };

  window.__carnet = { show() { document.body.appendChild(host); document.documentElement.style.overflow = "hidden"; refresh(); } };
  window.__carnet.show();
})();
