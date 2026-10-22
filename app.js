(() => {
  const CFG = window.MANI_CONFIG;
  const PAGE = 24;
  const $ = (id) => document.getElementById(id);

  // Telegram Mini App: скрипт определяет WebApp и вне Telegram, поэтому смотрим на platform
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(tg && tg.platform && tg.platform !== "unknown");

  const state = { all: [], cat: "", sub: "", q: "", shown: PAGE, current: null };

  const rub = (n) => n == null ? "" : n.toLocaleString("ru-RU") + " ₽";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function img(url, w) {
    if (!CFG.imageProxy) return url;
    return CFG.imageProxy.replace("{w}", w).replace("{url}", encodeURIComponent(url));
  }
  // Если ресайз-CDN недоступен — тихо грузим оригинал с сайта
  function imgTag(url, w, alt) {
    return `<img src="${esc(img(url, w))}" data-orig="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async" data-loading>`;
  }
  document.addEventListener("load", (e) => { if (e.target.tagName === "IMG") e.target.removeAttribute("data-loading"); }, true);
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (el.tagName === "IMG" && el.dataset.orig && el.src !== el.dataset.orig) el.src = el.dataset.orig;
  }, true);

  function stickers(p) {
    return [
      p.hit && `<span class="sticker">Хит</span>`,
      p.new && `<span class="sticker sticker--new">Новинка</span>`,
      p.sale && `<span class="sticker sticker--sale">Акция</span>`,
    ].filter(Boolean).join("");
  }
  function priceHtml(p) {
    return rub(p.price) + (p.oldPrice && p.oldPrice > p.price ? `<s>${rub(p.oldPrice)}</s>` : "");
  }
  function card(p, w) {
    return `<button class="card" data-id="${p.id}">
      <div class="card__img">${imgTag(p.images[0], w, p.name)}<div class="stickers">${stickers(p)}</div></div>
      <div class="card__name">${esc(p.name)}</div>
      <div class="price">${priceHtml(p)}</div>
    </button>`;
  }

  // ---------- Каталог ----------
  function filtered() {
    const q = state.q.trim().toLowerCase();
    return state.all.filter((p) =>
      (!state.cat || p.category === state.cat) &&
      (!state.sub || p.subsection === state.sub) &&
      (!q || (p.name + " " + p.subsectionTitle).toLowerCase().includes(q)));
  }

  function renderChips() {
    const cats = [{ slug: "", title: "Все" }, ...state.categories];
    $("cats").innerHTML = cats.map((c) =>
      `<button class="chip" data-cat="${c.slug}" aria-pressed="${c.slug === state.cat}">${esc(c.title)}</button>`).join("");

    if (!state.cat) { $("subs").innerHTML = ""; return; }
    const subs = new Map();
    state.all.filter((p) => p.category === state.cat && p.subsection)
      .forEach((p) => subs.set(p.subsection, p.subsectionTitle || p.subsection));
    $("subs").innerHTML = subs.size < 2 ? "" : [["", "Все"], ...subs].map(([s, t]) =>
      `<button class="chip" data-sub="${s}" aria-pressed="${s === state.sub}">${esc(t)}</button>`).join("");
  }

  function renderGrid() {
    const list = filtered();
    $("grid").innerHTML = list.slice(0, state.shown).map((p) => card(p, 400)).join("");
    $("count").textContent = list.length ? `${list.length} шт.` : "";
    $("more").hidden = list.length <= state.shown;
    $("empty").hidden = list.length > 0;
  }

  function renderHits() {
    let hits = state.all.filter((p) => p.hit);
    if (hits.length < 6) hits = hits.concat(state.all.filter((p) => !p.hit && p.new)).slice(0, 12);
    $("hitsSection").hidden = !hits.length;
    $("hits").innerHTML = hits.map((p) => card(p, 500)).join("");
    $("hitsCount").textContent = "листайте →";
  }

  $("cats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.cat = b.dataset.cat; state.sub = ""; state.shown = PAGE;
    haptic(); renderChips(); renderGrid();
  });
  $("subs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]"); if (!b) return;
    state.sub = b.dataset.sub; state.shown = PAGE;
    haptic(); renderChips(); renderGrid();
  });
  $("more").addEventListener("click", () => { state.shown += PAGE; renderGrid(); });
  $("searchToggle").addEventListener("click", () => {
    const box = $("searchBox"); box.hidden = !box.hidden;
    if (!box.hidden) $("search").focus();
  });
  let t;
  $("search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; renderGrid(); }, 150);
  });
  document.addEventListener("click", (e) => {
    const c = e.target.closest(".card"); if (c) openProduct(+c.dataset.id);
  });

  // ---------- Карточка товара ----------
  function openProduct(id) {
    const p = state.all.find((x) => x.id === id); if (!p) return;
    state.current = p;
    $("pGallery").innerHTML = p.images.map((u) => imgTag(u, 900, p.name)).join("");
    $("pGallery").scrollLeft = 0;
    $("pDots").innerHTML = p.images.length > 1 ? p.images.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("") : "";
    $("pStickers").innerHTML = stickers(p);
    $("pName").textContent = p.name;
    $("pSection").textContent = [catTitle(p.category), p.subsectionTitle].filter(Boolean).join(" · ");
    $("pPrice").innerHTML = priceHtml(p);
    $("pSite").href = p.url;
    openSheet("product");
  }
  $("pGallery").addEventListener("scroll", (e) => {
    const g = e.target, i = Math.round(g.scrollLeft / g.clientWidth);
    [...$("pDots").children].forEach((d, k) => d.classList.toggle("on", k === i));
  }, { passive: true });
  $("pWrite").addEventListener("click", () => contact(state.current));
  $("pSite").addEventListener("click", (e) => {
    if (inTg) { e.preventDefault(); tg.openLink(state.current.url); }
  });

  const catTitle = (slug) => (state.categories.find((c) => c.slug === slug) || {}).title || "";

  // ---------- Шторки ----------
  const stack = [];
  function openSheet(id) {
    $(id).hidden = false; stack.push(id);
    document.body.classList.add("locked");
    syncTgButtons();
  }
  function closeSheet() {
    const id = stack.pop(); if (id) $(id).hidden = true;
    if (!stack.length) document.body.classList.remove("locked");
    syncTgButtons();
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---------- Написать менеджеру ----------
  function message(p) {
    if (!p) return CFG.messageGeneral;
    return CFG.messageItem.replace("{name}", p.name).replace("{price}", rub(p.price)).replace("{url}", p.url);
  }

  function channels(text) {
    const m = CFG.manager, enc = encodeURIComponent(text), list = [];
    if (m.telegram) list.push({ title: "Telegram", color: "#2aabee", ic: "TG", tg: true,
      href: `https://t.me/${m.telegram}?text=${enc}` });
    if (m.vk) list.push({ title: "ВКонтакте", color: "#0077ff", ic: "VK", href: `https://vk.me/${m.vk}` });
    if (m.whatsapp) list.push({ title: "WhatsApp", color: "#25d366", ic: "WA", href: `https://wa.me/${m.whatsapp}?text=${enc}` });
    if (m.phone) list.push({ title: "Позвонить " + m.phone, color: "#555", ic: "☎", href: "tel:" + m.phone.replace(/[^\d+]/g, ""), plain: true });
    return list;
  }

  function go(ch) {
    if (inTg && ch.tg) return tg.openTelegramLink(ch.href);
    if (inTg && !ch.plain) return tg.openLink(ch.href);
    window.open(ch.href, ch.plain ? "_self" : "_blank");
  }

  // Буфер обмена в webview может «зависнуть» на запросе доступа — не ждём дольше 300 мс
  function copy(text) {
    const write = navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false);
    return Promise.race([write, new Promise((r) => setTimeout(() => r(false), 300))]);
  }

  async function contact(p) {
    haptic("medium");
    const text = message(p);
    const copied = await copy(text);
    const list = channels(text);
    // Внутри Telegram с указанным менеджером — сразу в чат, без лишнего шага
    if (inTg && list[0] && list[0].tg) {
      if (copied) toast("Текст скопирован");
      return go(list[0]);
    }
    $("cHint").textContent = copied
      ? "Текст сообщения скопирован — вставьте его в чат."
      : "Напишите нам — менеджер поможет с размером и заказом.";
    $("cList").innerHTML = list.map((c, i) =>
      `<a href="${esc(c.href)}" data-ch="${i}" target="_blank" rel="noopener"><span class="ic" style="background:${c.color}">${c.ic}</span>${esc(c.title)}</a>`).join("");
    $("cList").onclick = (e) => {
      const a = e.target.closest("[data-ch]"); if (!a) return;
      e.preventDefault(); go(list[+a.dataset.ch]);
    };
    openSheet("contact");
  }
  $("writeBtn").addEventListener("click", () => contact(null));

  function toast(msg) {
    const el = $("toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), 2200);
  }

  // ---------- Telegram ----------
  function haptic(kind = "light") { if (inTg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(kind); }

  function syncTgButtons() {
    if (!inTg) return;
    const top = stack[stack.length - 1];
    stack.length ? tg.BackButton.show() : tg.BackButton.hide();
    if (top === "contact") return tg.MainButton.hide();
    tg.MainButton.setParams({
      text: top === "product" ? "Написать о товаре" : "Написать менеджеру",
      is_visible: true,
    });
  }

  function initTg() {
    if (!inTg) return;
    document.body.classList.add("in-tg");
    tg.ready(); tg.expand();
    const applyTheme = () => document.documentElement.dataset.theme = tg.colorScheme === "dark" ? "dark" : "light";
    applyTheme(); tg.onEvent("themeChanged", applyTheme);
    try { tg.setHeaderColor("bg_color"); } catch {}
    tg.MainButton.onClick(() => contact(stack.includes("product") ? state.current : null));
    tg.BackButton.onClick(closeSheet);
    syncTgButtons();
  }

  // Ссылки вида ?cat=obuv или ?item=35358 и startapp=cat_obuv / item_35358 из бота
  function applyDeepLink() {
    const qs = new URLSearchParams(location.search);
    const sp = inTg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || "";
    const [k, v] = sp.split("_");
    const cat = qs.get("cat") || (k === "cat" ? sp.slice(4) : "");
    const item = qs.get("item") || (k === "item" ? v : "");
    if (cat && state.categories.some((c) => c.slug === cat)) state.cat = cat;
    return item ? +item : null;
  }

  // ---------- Старт ----------
  async function init() {
    initTg();
    $("siteLink").href = CFG.site;
    $("siteLink").addEventListener("click", (e) => { if (inTg) { e.preventDefault(); tg.openLink(CFG.site); } });
    try {
      const res = await fetch("data/products.json", { cache: "no-cache" });
      const data = await res.json();
      state.all = data.products; state.categories = data.categories;
      $("updated").textContent = "Обновлено " + new Date(data.updated).toLocaleDateString("ru-RU");
    } catch (e) {
      $("empty").hidden = false;
      $("empty").textContent = "Каталог не загрузился. Напишите менеджеру — пришлём подборку.";
      return;
    }
    const item = applyDeepLink();
    renderHits(); renderChips(); renderGrid();
    if (item) openProduct(item);
  }
  init();
})();
