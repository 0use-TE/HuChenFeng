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
  let currentPath = "";
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

  function hashFor(path) {
    const clean = path.replace(/^\.\//, "");
    return "#/" + clean.split("/").map(encodeURIComponent).join("/");
  }

  function pathFromHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    if (!raw || raw === "cover") return "";
    try {
      return decodeURIComponent(raw);
    } catch (err) {
      return raw;
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
    document.title = "户晨风选集";
    document.documentElement.classList.add("ready");
    closeMenu();
  }

  function flipTo(dir, html) {
    const flip = document.getElementById("flip");
    const oldHtml = sheet.innerHTML;
    const height = Math.max(sheet.offsetHeight, 480);
    sheet.innerHTML = html;
    const front = dir > 0 ? oldHtml : html;
    const back = dir > 0 ? html : oldHtml;
    flip.style.height = height + "px";
    flip.className = "flip";
    flip.innerHTML = '<div class="flip-face flip-front">' + front + '</div><div class="flip-face flip-back">' + back + "</div>";
    void flip.offsetWidth;
    flip.classList.add("is-on", dir > 0 ? "turn-next" : "turn-prev");
  }

  function pager(index) {
    const prev = index > 0 ? flat[index - 1] : null;
    const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
    const prevHtml = prev
      ? '<a class="prev" href="' + hashFor(prev.path) + '">上一页</a>'
      : '<a class="prev" href="#/cover">封面</a>';
    const nextHtml = next
      ? '<a class="next" href="' + hashFor(next.path) + '">下一页</a>'
      : '<span class="next edge">下一页</span>';
    const folio = index >= 0 ? index + 1 : "";
    return (
      '<nav class="pager">' + prevHtml + '<span class="pager-star">★</span>' + nextHtml + "</nav>" +
      '<p class="folio">' + folio + "</p>"
    );
  }

  async function openPage(path, dir) {
    const token = ++requestId;
    document.documentElement.classList.remove("has-page");
    const turning = Boolean(dir) && !reduced && !spread.hidden && sheet.childElementCount > 0;
    cover.hidden = true;
    spread.hidden = false;
    document.documentElement.classList.add("ready");
    closeMenu();
    currentPath = path;
    const entry = flat.find((item) => item.path === path);
    const title = entry ? entry.title : path;
    topbarTitle.textContent = title;
    document.title = title + " · 户晨风选集";
    syncToc(path);
    const volume = /年\d{2}月\/README\.md$/.test(path) || /年\d{2}月\/README\.md$/.test(decodeURIComponent(path));
    if (!turning) {
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
      const index = flat.findIndex((item) => item.path === path);
      const html =
        '<div class="page-inner"><p class="running">户晨风选集</p>' +
        heading +
        '<div class="body">' + body.innerHTML + "</div>" +
        pager(index) +
        "</div>";
      if (token !== requestId) return;
      sheet.classList.toggle("is-volume", volume);
      if (turning) flipTo(dir, html);
      else sheet.innerHTML = html;
      window.scrollTo(0, 0);
    } catch (err) {
      if (token !== requestId) return;
      sheet.innerHTML = '<div class="page-inner"><p class="running">户晨风选集</p><p class="miss">这一页尚未印出</p></div>';
    }
  }

  function route() {
    if (animating) return;
    const path = pathFromHash();
    if (!path) {
      showCover();
      return;
    }
    let dir = 0;
    const from = flat.findIndex((item) => item.path === currentPath);
    const to = flat.findIndex((item) => item.path === path);
    if (from >= 0 && to >= 0 && from !== to) dir = to > from ? 1 : -1;
    openPage(path, dir);
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
    if (!search.value.trim()) syncToc(pathFromHash());
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
    if (event.target.id !== "flip") return;
    const flip = event.target;
    flip.className = "flip";
    flip.innerHTML = "";
    flip.style.height = "";
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
