(function () {
  const FIRST = "Preface.md";
  const DIGIT = "〇一二三四五六七八九";
  const cover = document.getElementById("cover");
  const board = document.getElementById("cover-board");
  const spread = document.getElementById("spread");
  const tocNav = document.getElementById("toc-nav");
  const toc = document.getElementById("toc");
  const sheet = document.getElementById("sheet");
  const search = document.getElementById("search");
  const menuBtn = document.getElementById("menu-btn");
  const backdrop = document.getElementById("backdrop");
  const topbarTitle = document.getElementById("topbar-title");
  const base = new URL(".", location.href);

  let flat = [];
  let animating = false;
  let requestId = 0;
  let burnToken = 0;
  let currentPath = "";
  let currentPage = 0;
  const cache = new Map();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cnDigits(value) {
    return String(value).split("").map((d) => DIGIT[Number(d)]).join("");
  }

  function cnUnder(n) {
    if (n < 10) return DIGIT[n];
    if (n === 10) return "十";
    if (n < 20) return "十" + DIGIT[n % 10];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return DIGIT[tens] + "十" + (ones ? DIGIT[ones] : "");
  }

  function formatTitle(title) {
    let m = title.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return cnDigits(m[1]) + "年" + cnUnder(Number(m[2])) + "月" + cnUnder(Number(m[3])) + "日";
    m = title.match(/^(\d{4})年(\d{2})月$/);
    if (m) return cnDigits(m[1]) + "年" + cnUnder(Number(m[2])) + "月";
    return title;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function safeUrl(url) {
    const trimmed = url.trim();
    if (/^(javascript|data):/i.test(trimmed)) return "#";
    return trimmed;
  }

  function hashFor(path, page) {
    const clean = path.replace(/^\.\//, "");
    const hash = "#/" + clean.split("/").map(encodeURIComponent).join("/");
    if (page === "last") return hash + "?p=last";
    if (page > 0) return hash + "?p=" + page;
    return hash;
  }

  function readHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    if (!raw || raw === "cover") return { path: "", page: 0 };
    const splitAt = raw.indexOf("?");
    const pathPart = splitAt === -1 ? raw : raw.slice(0, splitAt);
    const query = splitAt === -1 ? "" : raw.slice(splitAt + 1);
    let page = 0;
    if (query) {
      const value = new URLSearchParams(query).get("p");
      page = value === "last" ? "last" : Math.max(0, parseInt(value || "0", 10) || 0);
    }
    try {
      return { path: decodeURIComponent(pathPart), page: page };
    } catch (err) {
      return { path: pathPart, page: page };
    }
  }

  function inline(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const url = safeUrl(href);
      if (/\.md(?:$|\?)/i.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        return '<a href="' + hashFor(url) + '">' + label + "</a>";
      }
      const external = /^[a-z][a-z0-9+.-]*:/i.test(url);
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + escapeHtml(url) + '"' + attrs + ">" + label + "</a>";
    });
    return html;
  }

  function renderMarkdown(source) {
    const text = source
      .replace(/\r\n/g, "\n")
      .replace(/\{%\s*embed\s+url="([^"]+)"\s*%\}/g, "[$1]($1)")
      .replace(/^\s*\\\s*$/gm, "");
    const lines = text.split("\n");
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      if (/^```/.test(line.trim())) {
        const buf = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          buf.push(lines[i]);
          i += 1;
        }
        i += 1;
        blocks.push("<pre><code>" + escapeHtml(buf.join("\n")) + "</code></pre>");
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        blocks.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        i += 1;
        continue;
      }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        blocks.push("<hr>");
        i += 1;
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
        }
        blocks.push("<blockquote><p>" + inline(buf.join(" ")) + "</p></blockquote>");
        continue;
      }
      if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\.\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push("<li>" + inline(lines[i].replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")) + "</li>");
          i += 1;
        }
        const tag = ordered ? "ol" : "ul";
        blocks.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
        continue;
      }
      const buf = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|```|-{3,}$|\*{3,}$|\s*(?:[-*+]|\d+\.)\s+)/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      blocks.push("<p>" + inline(buf.join(" ")) + "</p>");
    }
    return blocks.join("\n");
  }

  function paintSpeakers(root) {
    root.querySelectorAll("p").forEach((p) => {
      const html = p.innerHTML;
      const matched = html.match(/^([^<>：:]{1,8})([：:])/);
      if (!matched || /[，。！？、A-Za-z0-9]/.test(matched[1])) return;
      if (!html.slice(matched[0].length).trim()) return;
      p.classList.add("speech");
      p.innerHTML = '<span class="speaker">' + matched[1] + "</span>" + matched[2] + html.slice(matched[0].length);
    });
  }

  function parseSummary(text) {
    const root = [];
    const stack = [{ indent: -1, children: root }];
    text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
      const matched = line.match(/^(\s*)\*\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);
      if (!matched) return;
      const indent = matched[1].replace(/\t/g, "  ").length;
      const node = {
        title: matched[2],
        path: decodeURIComponent(matched[3].trim()),
        children: []
      };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push({ indent, children: node.children, node });
    });
    return root;
  }

  function walk(nodes, visit) {
    nodes.forEach((node) => {
      visit(node);
      if (node.children.length) walk(node.children, visit);
    });
  }

  function renderToc(nodes) {
    const parts = [];
    nodes.forEach((node) => {
      if (!node.children.length) {
        parts.push('<a class="toc-leaf" data-path="' + escapeHtml(node.path) + '" href="' + hashFor(node.path) + '">' + escapeHtml(node.title) + "</a>");
        return;
      }
      const days = node.children.map((child) => {
        return '<a data-path="' + escapeHtml(child.path) + '" href="' + hashFor(child.path) + '">' + escapeHtml(child.title) + "</a>";
      }).join("");
      parts.push(
        '<div class="toc-block" data-block>' +
          '<div class="month-row">' +
            '<button class="chevron" type="button" aria-expanded="false" aria-label="展开' + escapeHtml(node.title) + '"><span class="caret">▶</span></button>' +
            '<a class="month-link" data-path="' + escapeHtml(node.path) + '" href="' + hashFor(node.path) + '">' + escapeHtml(node.title) + "</a>" +
          "</div>" +
          '<div class="toc-days" hidden>' + days + "</div>" +
        "</div>"
      );
    });
    tocNav.innerHTML = parts.join("") + '<p class="toc-note">文字稿 · 非官方刊行</p>';
  }

  function setOpen(block, open) {
    const days = block.querySelector(".toc-days");
    const button = block.querySelector(".chevron");
    days.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncToc(path) {
    tocNav.querySelectorAll("a").forEach((link) => link.classList.remove("is-active"));
    if (!search.value.trim()) {
      tocNav.querySelectorAll("[data-block]").forEach((block) => setOpen(block, false));
    }
    const link = tocNav.querySelector('a[data-path="' + CSS.escape(path) + '"]');
    if (!link) return;
    link.classList.add("is-active");
    const block = link.closest("[data-block]");
    if (block) setOpen(block, true);
    link.scrollIntoView({ block: "nearest" });
  }

  function applyFilter() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    tocNav.querySelectorAll(".toc-leaf, [data-block]").forEach((node) => {
      if (!query) {
        node.hidden = false;
        node.querySelectorAll("a").forEach((link) => { link.hidden = false; });
        shown += 1;
        return;
      }
      if (node.classList.contains("toc-leaf")) {
        const hit = node.textContent.toLowerCase().includes(query);
        node.hidden = !hit;
        if (hit) shown += 1;
        return;
      }
      const monthHit = node.querySelector(".month-link").textContent.toLowerCase().includes(query);
      let dayHit = false;
      node.querySelectorAll(".toc-days a").forEach((link) => {
        const hit = monthHit || link.textContent.toLowerCase().includes(query);
        link.hidden = !hit;
        if (hit) dayHit = true;
      });
      node.hidden = !monthHit && !dayHit;
      if (!node.hidden) {
        shown += 1;
        setOpen(node, true);
      }
    });
    let empty = tocNav.querySelector(".toc-empty");
    if (!shown && query) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "toc-empty";
        empty.textContent = "目录中无此条目";
        tocNav.prepend(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function closeMenu() {
    toc.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    cache.set(path, text);
    return text;
  }

  function showCover() {
    document.documentElement.classList.remove("has-page");
    cover.hidden = false;
    spread.hidden = true;
    currentPath = "";
    currentPage = 0;
    document.title = "户晨风选集";
    document.documentElement.classList.add("ready");
    closeMenu();
  }

  function resetFlip(flip) {
    const map = document.getElementById("crumple-map");
    if (map) map.setAttribute("scale", "0");
    flip.className = "flip";
    flip.innerHTML = "";
    flip.style.height = "";
    flip.style.transform = "";
    flip.style.opacity = "";
  }

  function clearBurn() {
    burnToken += 1;
    resetFlip(document.getElementById("flip"));
  }

  function burnField(cols) {
    function hash(ix, iy) {
      let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }
    function fade(t) { return t * t * (3 - 2 * t); }
    function at(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = fade(x - x0);
      const fy = fade(y - y0);
      const a = hash(x0, y0);
      const b = hash(x0 + 1, y0);
      const c = hash(x0, y0 + 1);
      const d = hash(x0 + 1, y0 + 1);
      return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
    const wobble = new Float32Array(cols);
    const tongue = new Float32Array(cols);
    const seed = 1 + Math.floor(Math.random() * 40);
    for (let x = 0; x < cols; x++) {
      const broad = at(x / 16, seed);
      const mid = at(x / 6, seed + 3.7);
      const fine = at(x / 2.2, seed + 9.1);
      wobble[x] = (broad - 0.5) * 0.36 + (mid - 0.5) * 0.16 + (fine - 0.5) * 0.06;
      tongue[x] = 0.35 + fine * 0.95 + mid * 0.35;
    }
    return { wobble: wobble, tongue: tongue };
  }

  function burnAway(html) {
    const flip = document.getElementById("flip");
    const token = ++burnToken;
    const oldHtml = sheet.innerHTML;
    const height = Math.max(sheet.offsetHeight, 480);
    sheet.innerHTML = html;
    settle(currentPath);
    flip.className = "flip is-on burn";
    flip.style.height = height + "px";
    flip.style.transform = "";
    flip.style.opacity = "1";
    flip.innerHTML = '<div class="flip-face">' + oldHtml + '</div><canvas class="burn-fire" aria-hidden="true"></canvas>';
    const face = flip.querySelector(".flip-face");
    const canvas = flip.querySelector(".burn-fire");
    const map = document.getElementById("crumple-map");
    const noise = document.getElementById("crumple-noise");
    if (noise) noise.setAttribute("seed", String(1 + Math.floor(Math.random() * 80)));
    if (map) map.setAttribute("scale", "0");
    const width = Math.max(flip.clientWidth, 2);
    const viewH = Math.max(flip.clientHeight, 2);
    if (width < 8 || viewH < 8) {
      resetFlip(flip);
      return;
    }
    face.style.clipPath = "polygon(0px 0px, " + width + "px 0px, " + width + "px " + viewH + "px, 0px " + viewH + "px)";
    canvas.width = Math.round(width);
    canvas.height = Math.round(viewH);
    const ctx = canvas.getContext("2d");
    const cols = Math.max(72, Math.round(width / 5));
    const field = burnField(cols);
    const step = width / cols;
    const embers = [];
    const ashes = [];
    const crumpleMs = 720;
    const burnStart = 900;
    const burnMs = 1700;
    const fadeMs = 360;
    let last = performance.now();
    let elapsed = 0;

    function frontAt(x, burnT) {
      const eaten = burnT * 1.46 + field.wobble[x];
      return viewH * (1 - Math.min(1, Math.max(0, eaten)));
    }

    function frame(now) {
      if (token !== burnToken) return;
      elapsed += Math.min(50, now - last);
      last = now;
      const crumple = Math.min(1, elapsed / crumpleMs);
      const ease = crumple * crumple * (3 - 2 * crumple);
      if (map) map.setAttribute("scale", (ease * 38).toFixed(2));
      const burnT = Math.max(0, Math.min(1, (elapsed - burnStart) / burnMs));
      const shake = burnT > 0 && burnT < 1 ? Math.sin(elapsed * 0.05) * 0.55 * (1 - burnT) : 0;
      flip.style.transform = "scale(" + (1 - ease * 0.05).toFixed(4) + ") rotate(" + (-1.6 * ease + shake).toFixed(3) + "deg)";
      if (burnT > 0) face.style.filter = "sepia(" + (burnT * 0.65).toFixed(3) + ") brightness(" + (1 - burnT * 0.22).toFixed(3) + ")";

      const fronts = new Float32Array(cols);
      for (let x = 0; x < cols; x++) fronts[x] = burnT > 0 ? frontAt(x, burnT) : viewH;
      const parts = ["0px 0px", width.toFixed(1) + "px 0px", width.toFixed(1) + "px " + fronts[cols - 1].toFixed(1) + "px"];
      for (let x = cols - 1; x >= 0; x--) parts.push((x * step).toFixed(1) + "px " + fronts[x].toFixed(1) + "px");
      face.style.clipPath = "polygon(" + parts.join(",") + ")";

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (burnT > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (let x = 0; x < cols; x++) {
          const y = fronts[x];
          if (y >= viewH - 0.5) continue;
          const flick = 0.72 + 0.28 * Math.sin(elapsed * 0.02 + x * 0.73);
          const fh = (28 + field.tongue[x] * 52) * flick * Math.min(1, burnT * 3.2);
          const grad = ctx.createLinearGradient(0, y, 0, y + fh);
          grad.addColorStop(0, "rgba(255, 250, 224, 0.96)");
          grad.addColorStop(0.28, "rgba(255, 150, 24, 0.92)");
          grad.addColorStop(1, "rgba(170, 16, 0, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x * step - 3, y, step + 6, fh);
        }
        ctx.globalCompositeOperation = "source-over";
        for (let x = 0; x < cols; x++) {
          const y = fronts[x];
          if (y >= viewH - 0.5) continue;
          ctx.fillStyle = "rgba(36, 8, 0, 0.88)";
          ctx.fillRect(x * step - 1, y - 9, step + 2, 9);
          ctx.fillStyle = "rgba(255, 232, 170, 0.96)";
          ctx.fillRect(x * step - 1, y - 2, step + 2, 3);
        }
        if (embers.length < 52 && Math.random() < 0.9) {
          const x = Math.floor(Math.random() * cols);
          embers.push({
            x: x * step + Math.random() * step,
            y: fronts[x] + Math.random() * 6,
            vy: -0.75 - Math.random() * 1.6,
            vx: (Math.random() - 0.5) * 0.75,
            life: 0.65 + Math.random() * 0.55,
            r: 1 + Math.random() * 1.6
          });
        }
        if (ashes.length < 28 && burnT > 0.12 && Math.random() < 0.45) {
          const x = Math.floor(Math.random() * cols);
          ashes.push({
            x: x * step,
            y: fronts[x] + 4,
            vy: 0.3 + Math.random() * 0.9,
            vx: (Math.random() - 0.5) * 0.9,
            life: 1,
            s: 2 + Math.random() * 3.2,
            rot: Math.random() * 6
          });
        }
        for (let i = embers.length - 1; i >= 0; i--) {
          const ember = embers[i];
          ember.x += ember.vx;
          ember.y += ember.vy;
          ember.life -= 0.011;
          if (ember.life <= 0) {
            embers.splice(i, 1);
            continue;
          }
          ctx.fillStyle = "rgba(255," + Math.floor(130 + ember.life * 100) + ",36," + ember.life.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(ember.x, ember.y, ember.r, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = ashes.length - 1; i >= 0; i--) {
          const ash = ashes[i];
          ash.x += ash.vx;
          ash.y += ash.vy;
          ash.rot += 0.05;
          ash.life -= 0.01;
          if (ash.life <= 0 || ash.y > viewH) {
            ashes.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.translate(ash.x, ash.y);
          ctx.rotate(ash.rot);
          ctx.fillStyle = "rgba(32, 18, 14," + (ash.life * 0.9).toFixed(3) + ")";
          ctx.fillRect(-ash.s / 2, -ash.s / 2, ash.s, ash.s * 0.65);
          ctx.restore();
        }
      }
      if (elapsed > burnStart + burnMs) flip.style.opacity = String(Math.max(0, 1 - (elapsed - burnStart - burnMs) / fadeMs));
      if (elapsed < burnStart + burnMs + fadeMs) requestAnimationFrame(frame);
      else if (token === burnToken) resetFlip(flip);
    }
    requestAnimationFrame(frame);
  }

  function layoutFlow(root) {
    const win = root.querySelector(".page-window");
    const flow = root.querySelector(".page-flow");
    if (!win || !flow) return { page: 0, pages: 1 };
    const width = win.clientWidth;
    const height = win.clientHeight;
    if (width < 20 || height < 20) return { page: 0, pages: 1 };
    flow.style.columnWidth = width + "px";
    flow.style.width = width + "px";
    flow.style.height = height + "px";
    const raw = flow.scrollWidth / width;
    let pages = Math.max(1, Math.round(raw));
    if (pages > 1 && raw - (pages - 1) < 0.08) pages -= 1;
    let page = flow.dataset.page === "last" ? pages - 1 : Number(flow.dataset.page);
    if (!Number.isFinite(page)) page = 0;
    page = Math.min(Math.max(0, page), pages - 1);
    flow.dataset.page = String(page);
    flow.dataset.pages = String(pages);
    flow.style.transform = "translateX(" + (-page * width) + "px)";
    return { page: page, pages: pages };
  }

  function writePager(root, path, page, pages) {
    const index = flat.findIndex((item) => item.path === path);
    const prevDoc = index > 0 ? flat[index - 1] : null;
    const nextDoc = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
    const prevHref = page > 0 ? hashFor(path, page - 1) : (prevDoc ? hashFor(prevDoc.path, "last") : "#/cover");
    const prevLabel = page === 0 && !prevDoc ? "封面" : "上一页";
    const nextHtml = page < pages - 1
      ? '<a class="next" href="' + hashFor(path, page + 1) + '">下一页</a>'
      : (nextDoc ? '<a class="next" href="' + hashFor(nextDoc.path) + '">下一页</a>' : '<span class="next edge">下一页</span>');
    const nav = root.querySelector(".pager");
    const folio = root.querySelector(".folio");
    if (nav) nav.innerHTML = '<a class="prev" href="' + prevHref + '">' + prevLabel + '</a><span class="pager-star">★</span>' + nextHtml;
    if (folio) folio.textContent = (page + 1) + " / " + pages;
  }

  function settle(path) {
    const pager = sheet.querySelector(".pager");
    if (pager && !pager.innerHTML) pager.innerHTML = '<span class="prev">上一页</span><span class="pager-star">★</span><span class="next">下一页</span>';
    let laid = layoutFlow(sheet);
    writePager(sheet, path, laid.page, laid.pages);
    laid = layoutFlow(sheet);
    writePager(sheet, path, laid.page, laid.pages);
    currentPage = laid.page;
    const canonical = hashFor(path, laid.page);
    if (location.hash !== canonical) history.replaceState(null, "", canonical);
    return laid;
  }

  async function openPage(path, page, dir) {
    const token = ++requestId;
    document.documentElement.classList.remove("has-page");
    const turning = dir > 0 && !reduced && !spread.hidden && Boolean(sheet.querySelector(".page-flow"));
    cover.hidden = true;
    spread.hidden = false;
    document.documentElement.classList.add("ready");
    closeMenu();
    currentPath = path;
    if (page !== "last") currentPage = page;
    const entry = flat.find((item) => item.path === path);
    const title = entry ? entry.title : path;
    topbarTitle.textContent = title;
    document.title = title + " · 户晨风选集";
    syncToc(path);
    const volume = /年\d{2}月\/README\.md$/.test(path) || /年\d{2}月\/README\.md$/.test(decodeURIComponent(path));
    if (!turning) {
      clearBurn();
      sheet.classList.toggle("is-volume", volume);
      sheet.innerHTML = '<div class="page-inner"><p class="running">户晨风选集</p><p class="miss">翻阅中</p></div>';
    }
    try {
      let source = await load(path);
      if (token !== requestId) return;
      const volumePage = /\/README\.md$/.test(path) && /^\d{4}年\d{2}月$/.test(title);
      if (volumePage) source = source.replace(/^#\s+.+$/m, "# " + formatTitle(title));
      const startsWithHeading = /^#\s+/m.test(source.trim());
      const heading = startsWithHeading ? "" : "<h1>" + escapeHtml(formatTitle(title)) + "</h1>";
      const body = document.createElement("div");
      body.className = "body";
      body.innerHTML = renderMarkdown(source);
      paintSpeakers(body);
      const pageMark = page === "last" ? "last" : String(page || 0);
      const html =
        '<div class="page-inner"><p class="running">户晨风选集</p>' +
        '<div class="page-window"><div class="page-flow" data-page="' + pageMark + '">' +
        heading +
        '<div class="body">' + body.innerHTML + "</div></div></div>" +
        '<nav class="pager"></nav><p class="folio"></p></div>';
      if (token !== requestId) return;
      sheet.classList.toggle("is-volume", volume);
      if (turning) burnAway(html);
      else {
        sheet.innerHTML = html;
        settle(path);
      }
    } catch (err) {
      if (token !== requestId) return;
      sheet.innerHTML = '<div class="page-inner"><p class="running">户晨风选集</p><p class="miss">这一页尚未印出</p></div>';
    }
  }

  function route() {
    if (animating) return;
    const loc = readHash();
    if (!loc.path) {
      showCover();
      return;
    }
    let dir = 0;
    if (loc.path === currentPath && sheet.querySelector(".page-flow")) {
      const nextPage = loc.page === "last" ? currentPage + 1 : loc.page;
      if (nextPage !== currentPage) dir = nextPage > currentPage ? 1 : -1;
    } else {
      const from = flat.findIndex((item) => item.path === currentPath);
      const to = flat.findIndex((item) => item.path === loc.path);
      if (from >= 0 && to >= 0 && from !== to) dir = to > from ? 1 : -1;
    }
    openPage(loc.path, loc.page, dir);
  }

  function openBook() {
    if (animating) return;
    animating = true;
    if (reduced) {
      animating = false;
      location.hash = hashFor(FIRST);
      return;
    }
    board.classList.add("is-opening");
    window.setTimeout(() => {
      animating = false;
      board.classList.remove("is-opening");
      location.hash = hashFor(FIRST);
      route();
    }, 720);
  }

  board.addEventListener("click", openBook);
  board.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBook();
    }
  });

  tocNav.addEventListener("click", (event) => {
    const button = event.target.closest(".chevron");
    if (button) {
      const block = button.closest("[data-block]");
      setOpen(block, button.getAttribute("aria-expanded") !== "true");
      return;
    }
    if (event.target.closest("a")) closeMenu();
  });

  search.addEventListener("input", () => {
    applyFilter();
    if (!search.value.trim()) syncToc(readHash().path);
  });

  menuBtn.addEventListener("click", () => {
    const open = !toc.classList.contains("is-open");
    toc.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  backdrop.addEventListener("click", closeMenu);

  function goCover(event) {
    event.preventDefault();
    if (location.hash === "#/cover" || location.hash === "" || location.hash === "#") {
      history.replaceState(null, "", "#/cover");
      showCover();
      return;
    }
    location.hash = "#/cover";
  }

  document.getElementById("toc-home").addEventListener("click", goCover);
  document.getElementById("back-cover").addEventListener("click", goCover);
  document.getElementById("flip").addEventListener("animationend", (event) => {
    if (event.target.id !== "flip" || event.target.classList.contains("burn")) return;
    resetFlip(event.target);
  });

  let wheelAt = 0;
  document.getElementById("leaf").addEventListener("wheel", (event) => {
    if (spread.hidden) return;
    event.preventDefault();
    const now = Date.now();
    if (now - wheelAt < (event.deltaY > 0 ? 2800 : 180) || Math.abs(event.deltaY) < 8) return;
    const link = sheet.querySelector(event.deltaY > 0 ? "a.next" : "a.prev");
    if (!link) return;
    wheelAt = now;
    location.hash = link.getAttribute("href");
  }, { passive: false });

  document.addEventListener("keydown", (event) => {
    if (spread.hidden || event.target === search) return;
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp";
    if (!forward && !back) return;
    const link = sheet.querySelector(forward ? "a.next" : "a.prev");
    if (!link) return;
    event.preventDefault();
    location.hash = link.getAttribute("href");
  });

  let touchX = 0;
  document.getElementById("leaf").addEventListener("touchstart", (event) => {
    touchX = event.changedTouches[0].clientX;
  }, { passive: true });
  document.getElementById("leaf").addEventListener("touchend", (event) => {
    const dx = event.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) < 50) return;
    const link = sheet.querySelector(dx < 0 ? "a.next" : "a.prev");
    if (link) location.hash = link.getAttribute("href");
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (spread.hidden || !sheet.querySelector(".page-flow")) return;
    settle(currentPath);
  });

  fetch(new URL("SUMMARY.md", base))
    .then((response) => response.text())
    .then((text) => {
      const tree = parseSummary(text);
      flat = [];
      walk(tree, (node) => flat.push(node));
      renderToc(tree);
      route();
    })
    .catch(() => {
      document.documentElement.classList.add("ready");
      sheet.innerHTML = '<div class="page-inner"><p class="miss">目录未能装订</p></div>';
    });

  window.addEventListener("hashchange", route);
})();
