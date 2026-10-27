(() => {
  const CFG = window.MANI_CONFIG;
  const PAGE = 24;
  const $ = (id) => document.getElementById(id);

  // Telegram Mini App: скрипт определяет WebApp и вне Telegram, поэтому смотрим на platform
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(tg && tg.platform && tg.platform !== "unknown");

  const state = {
    all: [], categories: [], looks: [], cat: "", sub: "", q: "", size: "", color: "", shown: PAGE,
    current: null, colorIdx: 0, pickedSize: "",
  };

  const rub = (n) => n == null ? "" : n.toLocaleString("ru-RU") + " ₽";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const swatch = (c) => `<span class="swatch" style="background-image:url('${esc(c.swatch)}')"></span>`;

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

  // Размеры: одежда XS…2XL, обувь по номеру, One Size в конце
  const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL"];
  function sizeRank(s) {
    const i = SIZE_ORDER.indexOf(s);
    if (i >= 0) return i;
    const n = parseFloat(s);
    return isNaN(n) ? 1000 : 100 + n;
  }
  const bySize = (a, b) => sizeRank(a) - sizeRank(b);

  function stickers(p) {
    return [
      p.hit && `<span class="sticker">Хит</span>`,
      p.new && `<span class="sticker sticker--new">Новинка</span>`,
      p.sale && `<span class="sticker sticker--sale">Акция</span>`,
    ].filter(Boolean).join("");
  }
  function priceHtml(c) {
    return rub(c.price) + (c.oldPrice && c.oldPrice > c.price ? `<s>${rub(c.oldPrice)}</s>` : "");
  }

  // Цвет, который показываем в списке: выбранный в фильтре, иначе первый
  function shownColor(p) {
    const i = state.color ? p.colors.findIndex((c) => c.title === state.color) : 0;
    return Math.max(i, 0);
  }

  function card(p, w) {
    const ci = shownColor(p), c = p.colors[ci];
    const named = p.colors.filter((x) => x.title);
    const dots = named.length > 1
      ? `<div class="card__swatches">${named.slice(0, 5).map(swatch).join("")}${named.length > 5 ? `+${named.length - 5}` : ""}</div>`
      : "";
    return `<button class="card" data-id="${p.id}" data-color="${ci}">
      <div class="card__img">${imgTag(c.images[0], w, p.name)}<div class="stickers">${stickers(p)}</div></div>
      <div class="card__name">${esc(p.name)}</div>
      <div class="price">${priceHtml(c)}</div>
      ${dots}
    </button>`;
  }

  // ---------- Каталог ----------
  function matches(p) {
    const q = state.q.trim().toLowerCase();
    if (state.cat && p.category !== state.cat) return false;
    if (state.sub && p.subsection !== state.sub) return false;
    if (q && !(p.name + " " + p.subsectionTitle + " " + p.colors.map((c) => c.title).join(" ")).toLowerCase().includes(q)) return false;
    // Цвет и размер должны совпасть в одном варианте: «чёрный 38», а не «чёрный» + «38 в бежевом»
    return p.colors.some((c) =>
      (!state.color || c.title === state.color) && (!state.size || c.sizes.includes(state.size)));
  }
  const filtered = () => state.all.filter(matches);

  function renderChips() {
    const cats = [{ slug: "", title: "Все" }, ...state.categories];
    $("cats").innerHTML = cats.map((c) =>
      `<button class="chip" data-cat="${c.slug}" aria-pressed="${c.slug === state.cat}">${esc(c.title)}</button>`).join("");

    const subs = new Map();
    if (state.cat) state.all.filter((p) => p.category === state.cat && p.subsection)
      .forEach((p) => subs.set(p.subsection, p.subsectionTitle || p.subsection));
    $("subs").innerHTML = subs.size < 2 ? "" : [["", "Все"], ...subs].map(([s, t]) =>
      `<button class="chip" data-sub="${s}" aria-pressed="${s === state.sub}">${esc(t)}</button>`).join("");

    const [sizeBtn, colorBtn] = $("filters").querySelectorAll("[data-filter]");
    sizeBtn.setAttribute("aria-pressed", !!state.size);
    sizeBtn.firstElementChild.textContent = state.size ? "Размер " + state.size : "Размер";
    colorBtn.setAttribute("aria-pressed", !!state.color);
    colorBtn.firstElementChild.textContent = state.color || "Цвет";
    $("resetFilters").hidden = !state.size && !state.color;
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
    // В хитах всегда основной цвет, независимо от фильтров каталога
    const saved = state.color; state.color = "";
    $("hits").innerHTML = hits.map((p) => card(p, 500)).join("");
    state.color = saved;
    $("hitsCount").textContent = "листайте →";
  }

  function refresh() { state.shown = PAGE; renderChips(); renderGrid(); }

  $("cats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.cat = b.dataset.cat; state.sub = "";
    haptic(); refresh();
  });
  $("subs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]"); if (!b) return;
    state.sub = b.dataset.sub;
    haptic(); refresh();
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
    const c = e.target.closest(".card"); if (c) openProduct(+c.dataset.id, +c.dataset.color);
  });

  // ---------- Фильтры размер / цвет ----------
  // Варианты считаем по текущему разделу, чтобы не предлагать «XL» в обуви
  function filterOptions(kind) {
    const pool = state.all.filter((p) => (!state.cat || p.category === state.cat) && (!state.sub || p.subsection === state.sub));
    if (kind === "size") {
      const set = new Set();
      pool.forEach((p) => p.colors.forEach((c) => c.sizes.forEach((s) => set.add(s))));
      return [...set].sort(bySize).map((s) => ({ value: s, label: esc(s) }));
    }
    const map = new Map();
    pool.forEach((p) => p.colors.forEach((c) => { if (c.title && !map.has(c.title)) map.set(c.title, c); }));
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"))
      .map((c) => ({ value: c.title, label: swatch(c) + esc(c.title) }));
  }

  function openFilter(kind) {
    const current = state[kind];
    $("fTitle").textContent = kind === "size" ? "Размер" : "Цвет";
    $("fOptions").innerHTML = [{ value: "", label: "Любой" }, ...filterOptions(kind)].map((o) =>
      `<button class="chip" data-value="${esc(o.value)}" aria-pressed="${o.value === current}">${o.label}</button>`).join("");
    $("fOptions").onclick = (e) => {
      const b = e.target.closest("[data-value]"); if (!b) return;
      state[kind] = b.dataset.value;
      haptic(); refresh(); closeSheet();
    };
    openSheet("filterSheet");
  }
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]"); if (b) openFilter(b.dataset.filter);
  });
  $("resetFilters").addEventListener("click", () => { state.size = ""; state.color = ""; haptic(); refresh(); });

  // ---------- Карточка товара ----------
  function openProduct(id, colorIdx = 0) {
    const p = state.all.find((x) => x.id === id); if (!p) return;
    state.current = p;
    // Если в каталоге выбран размер и он есть в этом цвете — сразу подставляем
    state.pickedSize = "";
    $("pStickers").innerHTML = stickers(p);
    $("pName").textContent = p.name;
    $("pSection").textContent = [catTitle(p.category), p.subsectionTitle].filter(Boolean).join(" · ");
    selectColor(colorIdx || 0);
    openSheet("product");
  }

  function selectColor(i) {
    const p = state.current, c = p.colors[i] || p.colors[0];
    state.colorIdx = p.colors.indexOf(c);
    if (state.pickedSize && !c.sizes.includes(state.pickedSize)) state.pickedSize = "";
    if (!state.pickedSize && state.size && c.sizes.includes(state.size)) state.pickedSize = state.size;
    // Единственный размер (One Size) выбираем сами
    if (!state.pickedSize && c.sizes.length === 1) state.pickedSize = c.sizes[0];

    $("pGallery").innerHTML = c.images.map((u) => imgTag(u, 900, p.name)).join("");
    $("pGallery").scrollLeft = 0;
    $("pDots").innerHTML = c.images.length > 1 ? c.images.map((_, k) => `<span class="${k ? "" : "on"}"></span>`).join("") : "";
    $("pPrice").innerHTML = priceHtml(c);
    $("pSite").href = c.url;

    const named = p.colors.filter((x) => x.title);
    $("pColorsBox").hidden = !named.length;
    $("pColorName").textContent = c.title;
    $("pColors").innerHTML = p.colors.map((x, k) => x.title
      ? `<button data-color="${k}" aria-pressed="${k === state.colorIdx}" title="${esc(x.title)}" aria-label="${esc(x.title)}">${swatch(x)}</button>` : "").join("");
    renderSizes();
  }

  function renderSizes() {
    const p = state.current, c = p.colors[state.colorIdx];
    const all = (p.allSizes.length ? p.allSizes : c.sizes).slice().sort(bySize);
    $("pSizesBox").hidden = !all.length;
    $("pSizeName").textContent = state.pickedSize || "выберите";
    $("pSizes").innerHTML = all.map((s) => {
      const ok = c.sizes.includes(s);
      return `<button data-size="${esc(s)}" aria-pressed="${s === state.pickedSize}" ${ok ? "" : "disabled title=\"Нет в этом цвете\""}>${esc(s)}</button>`;
    }).join("");
  }

  $("pColors").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]"); if (!b) return;
    haptic(); selectColor(+b.dataset.color);
  });
  $("pSizes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]"); if (!b || b.disabled) return;
    state.pickedSize = state.pickedSize === b.dataset.size ? "" : b.dataset.size;
    haptic(); renderSizes();
  });
  $("pGallery").addEventListener("scroll", (e) => {
    const g = e.target, i = Math.round(g.scrollLeft / g.clientWidth);
    [...$("pDots").children].forEach((d, k) => d.classList.toggle("on", k === i));
  }, { passive: true });
  // На ПК мышью не свайпнуть — листаем кликом по точкам
  $("pDots").addEventListener("click", (e) => {
    const i = [...$("pDots").children].indexOf(e.target); if (i < 0) return;
    const g = $("pGallery"); g.scrollTo({ left: i * g.clientWidth, behavior: "smooth" });
  });
  $("pWrite").addEventListener("click", () => contact(state.current));
  $("pSite").addEventListener("click", (e) => {
    if (inTg) { e.preventDefault(); tg.openLink($("pSite").href); }
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

  // ---------- Написать нам ----------
  function message(p) {
    if (!p) return CFG.messageGeneral;
    const c = p.colors[state.colorIdx] || p.colors[0];
    const variant = [c.title && "цвет: " + c.title, state.pickedSize && "размер: " + state.pickedSize]
      .filter(Boolean).map((s) => ", " + s).join("");
    return CFG.messageItem.replace("{name}", p.name).replace("{variant}", variant)
      .replace("{price}", rub(c.price)).replace("{url}", c.url);
  }

  function channels(text) {
    const m = CFG.manager, enc = encodeURIComponent(text), list = [];
    // Ботам Telegram текст через ?text= не передать — только открываем чат, текст уже скопирован
    if (m.telegram) list.push({ title: "Telegram", color: "#2aabee", ic: "TG", tg: true,
      href: `https://t.me/${m.telegram}` + (/bot$/i.test(m.telegram) ? "" : `?text=${enc}`) });
    if (m.vk) list.push({ title: "ВКонтакте", color: "#0077ff", ic: "VK", href: `https://vk.me/${m.vk}` });
    if (m.max) list.push({ title: "MAX", color: "#6f42ff", ic: "MAX", href: m.max });
    if (m.whatsapp) list.push({ title: "WhatsApp", color: "#25d366", ic: "WA", href: `https://wa.me/${m.whatsapp}?text=${enc}` });
    if (m.phone) list.push({ title: "Позвонить", color: "#555", ic: "☎", href: "tel:" + m.phone.replace(/[^\d+]/g, ""), plain: true, call: true });
    return list;
  }

  function go(ch) {
    if (inTg && ch.tg) return tg.openTelegramLink(ch.href);
    if (inTg && !ch.plain) return tg.openLink(ch.href);
    window.open(ch.href, ch.plain ? "_self" : "_blank");
  }

  // Копируем синхронно, прямо в обработчике нажатия: во встроенном браузере Telegram
  // navigator.clipboard часто молча не работает, а execCommand через выделение — работает.
  function copy(text) {
    const ta = $("cText");
    ta.value = text;
    let ok = false;
    // readonly — чтобы на телефоне не выскакивала клавиатура
    const ro = ta.readOnly; ta.readOnly = true;
    try {
      ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, text.length);
      ok = document.execCommand("copy");
    } catch {}
    ta.blur(); ta.readOnly = ro;
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    return ok;
  }

  // Текст сообщения всегда виден: Telegram не гарантирует подстановку ?text= в чат
  // (а если в чате уже есть черновик — оставляет старый), поэтому человек видит, что отправляет.
  function contact(p, text) {
    haptic("medium");
    $("cTitle").textContent = p ? "Сообщение о товаре" : text ? "Сообщение об образе" : "Ваше сообщение";
    $("cText").value = text || message(p);
    renderChannels();
    openSheet("contact"); // сначала показать: скрытое поле нельзя выделить и скопировать
    showCopied(copy($("cText").value));
  }

  function renderChannels() {
    const list = channels($("cText").value);
    $("cList").innerHTML = list.map((c, i) =>
      `<a href="${esc(c.href)}" data-ch="${i}" target="_blank" rel="noopener"><span class="ic" style="background:${c.color}">${c.ic}</span>${esc(c.title)}</a>`).join("");
    $("cList").onclick = (e) => {
      const a = e.target.closest("[data-ch]"); if (!a) return;
      e.preventDefault();
      const ch = list[+a.dataset.ch];
      if (ch.call && !isCallTime()) return openOffHours(list);
      // Перед переходом копируем ещё раз — вдруг текст поправили
      showCopied(copy($("cText").value));
      go(ch);
    };
  }

  // Звонки — только в часы работы (по Москве). В остальное время предлагаем мессенджеры.
  function isCallTime() {
    const h = CFG.callHours; if (!h) return true;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: h.timeZone, weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const min = (+parts.hour % 24) * 60 + +parts.minute;
    return h.days.includes(day) && min >= h.from * 60 && min < h.to * 60;
  }

  function openOffHours(list) {
    haptic("medium");
    $("oText").textContent = `Звонки принимаем ${CFG.callHours.label}. А сообщения — в любое время: напишите в мессенджер, ответим в рабочие часы.`;
    const msg = list.filter((c) => !c.call);
    $("oList").innerHTML = msg.map((c, i) =>
      `<a href="${esc(c.href)}" data-ch="${i}" target="_blank" rel="noopener"><span class="ic" style="background:${c.color}">${c.ic}</span>${esc(c.title)}</a>`).join("");
    $("oList").onclick = (e) => {
      const a = e.target.closest("[data-ch]"); if (!a) return;
      e.preventDefault();
      showCopied(copy($("cText").value));
      go(msg[+a.dataset.ch]);
    };
    $("oCall").href = list.find((c) => c.call).href;
    openSheet("offHours");
  }

  function showCopied(ok) {
    const b = $("cCopy");
    ok ? b.setAttribute("data-done", "") : b.removeAttribute("data-done");
    b.textContent = ok ? "✓ Текст скопирован" : "Скопировать текст";
    $("cHint").textContent = ok
      ? "вставьте его в чат"
      : "и выберите, куда написать";
  }
  $("cCopy").addEventListener("click", () => { haptic(); showCopied(copy($("cText").value)); });
  // Текст можно поправить перед отправкой — ссылки с ?text= обновляем
  $("cText").addEventListener("input", () => { showCopied(false); renderChannels(); });
  $("writeBtn").addEventListener("click", () => contact(null));

  // ---------- Лукбук ----------
  function renderLooks() {
    $("looksSection").hidden = !state.looks.length;
    $("looks").innerHTML = state.looks.map((l, i) =>
      `<button class="look" data-look="${i}" aria-label="${esc(l.alt)}">${imgTag(l.src, 600, l.alt)}</button>`).join("");
  }
  $("looks").addEventListener("click", (e) => {
    const b = e.target.closest("[data-look]"); if (b) openLook(+b.dataset.look);
  });

  function openLook(i) {
    const track = $("vTrack");
    if (!track.children.length) track.innerHTML = state.looks.map((l) => imgTag(l.src, 1100, l.alt)).join("");
    openSheet("viewer");
    track.scrollLeft = i * track.clientWidth;
    updateLookCount();
  }
  const lookIndex = () => Math.round($("vTrack").scrollLeft / ($("vTrack").clientWidth || 1));
  function updateLookCount() { $("vCount").textContent = `${lookIndex() + 1} / ${state.looks.length}`; }
  function lookMessage() {
    const i = lookIndex();
    return `Здравствуйте! Понравился образ из лукбука MANIOLINI (фото ${i + 1}). Подберёте похожее?
${state.looks[i].src}`;
  }
  $("vTrack").addEventListener("scroll", updateLookCount, { passive: true });
  $("vWrite").addEventListener("click", () => contact(null, lookMessage()));
  // На ПК листаем стрелками на экране и на клавиатуре
  const stepLook = (d) => { const t = $("vTrack"); t.scrollBy({ left: d * t.clientWidth, behavior: "smooth" }); };
  $("viewer").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]"); if (b) stepLook(+b.dataset.step);
  });
  document.addEventListener("keydown", (e) => {
    if ($("viewer").hidden || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    stepLook(e.key === "ArrowRight" ? 1 : -1);
  });

  // ---------- Telegram ----------
  function haptic(kind = "light") { if (inTg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(kind); }

  function syncTgButtons() {
    if (!inTg) return;
    const top = stack[stack.length - 1];
    stack.length ? tg.BackButton.show() : tg.BackButton.hide();
    if (top === "contact" || top === "filterSheet" || top === "offHours") return tg.MainButton.hide();
    tg.MainButton.setParams({
      text: top === "product" ? "Написать о товаре" : top === "viewer" ? "Хочу такой образ" : "Написать нам",
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
    tg.MainButton.onClick(() => {
      const top = stack[stack.length - 1];
      if (top === "viewer") return contact(null, lookMessage());
      contact(stack.includes("product") ? state.current : null);
    });
    tg.BackButton.onClick(closeSheet);
    syncTgButtons();
  }

  // Ссылки вида ?cat=obuv или ?item=35595 и startapp=cat_obuv / item_35595 из бота.
  // item — id товара или конкретного цвета (oid с сайта).
  function applyDeepLink() {
    const qs = new URLSearchParams(location.search);
    const sp = inTg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || "";
    const [k, v] = sp.split("_");
    const cat = qs.get("cat") || (k === "cat" ? sp.slice(4) : "");
    const item = +(qs.get("item") || (k === "item" ? v : "")) || 0;
    if (cat && state.categories.some((c) => c.slug === cat)) state.cat = cat;
    if (!item) return null;
    for (const p of state.all) {
      if (p.id === item) return [p.id, 0];
      const i = p.colors.findIndex((c) => c.oid === item);
      if (i >= 0) return [p.id, i];
    }
    return null;
  }

  // ---------- Старт ----------
  async function init() {
    initTg();
    $("siteLink").href = CFG.site;
    $("siteLink").addEventListener("click", (e) => { if (inTg) { e.preventDefault(); tg.openLink(CFG.site); } });
    try {
      const res = await fetch("data/products.json", { cache: "no-cache" });
      const data = await res.json();
      state.all = data.products; state.categories = data.categories; state.looks = data.lookbook || [];
      $("updated").textContent = "Обновлено " + new Date(data.updated).toLocaleDateString("ru-RU");
    } catch (e) {
      $("empty").hidden = false;
      $("empty").textContent = "Каталог не загрузился. Напишите нам — пришлём подборку.";
      return;
    }
    const item = applyDeepLink();
    renderHits(); renderLooks(); renderChips(); renderGrid();
    if (item) openProduct(...item);
  }
  init();
})();
