/* 首页：搜索、标签筛选、排序、视图切换 */
(function () {
  "use strict";

  var grid = document.getElementById("grid");
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
  var search = document.getElementById("search");
  var sortSel = document.getElementById("sort");
  var viewBtn = document.querySelector("[data-view-toggle]");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var countEl = document.getElementById("count");
  var empty = document.getElementById("empty");

  var activeTag = "";

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      /* 存储不可用时忽略 */
    }
    return null;
  }

  /* ---------- 筛选 ---------- */
  function apply() {
    var q = (search ? search.value : "").trim().toLowerCase();
    var shown = 0;

    cards.forEach(function (card) {
      var haystack = card.getAttribute("data-search") || "";
      var tags = card.getAttribute("data-tags") || "";
      var hitQ = !q || haystack.indexOf(q) !== -1;
      var hitTag = !activeTag || tags.split("|").indexOf(activeTag) !== -1;
      var show = hitQ && hitTag;
      card.classList.toggle("is-hidden", !show);
      if (show) shown++;
    });

    if (countEl) countEl.textContent = shown;
    if (empty) empty.classList.toggle("is-on", shown === 0);
  }

  if (search) {
    search.addEventListener("input", apply);
    search.addEventListener("search", apply);
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var tag = chip.getAttribute("data-tag") || "";
      activeTag = activeTag === tag ? "" : tag;
      chips.forEach(function (c) {
        c.setAttribute(
          "aria-pressed",
          String((c.getAttribute("data-tag") || "") === activeTag)
        );
      });
      apply();
    });
  });

  /* ---------- 排序 ---------- */
  function sortBy(mode) {
    var sorted = cards.slice().sort(function (a, b) {
      var an = a.getAttribute("data-name");
      var bn = b.getAttribute("data-name");
      switch (mode) {
        case "name":
          return an.localeCompare(bn, "zh-Hans-CN");
        case "length":
          return an.length - bn.length || an.localeCompare(bn, "zh-Hans-CN");
        case "tld":
          return (
            a.getAttribute("data-tld").localeCompare(b.getAttribute("data-tld")) ||
            an.localeCompare(bn, "zh-Hans-CN")
          );
        default:
          return (
            Number(a.getAttribute("data-order")) - Number(b.getAttribute("data-order"))
          );
      }
    });
    var frag = document.createDocumentFragment();
    sorted.forEach(function (c) {
      frag.appendChild(c);
    });
    grid.appendChild(frag);
  }

  if (sortSel) {
    sortSel.addEventListener("change", function () {
      sortBy(sortSel.value);
      store("dm-sort", sortSel.value);
    });
    var savedSort = store("dm-sort");
    if (savedSort) {
      sortSel.value = savedSort;
      if (sortSel.value === savedSort) sortBy(savedSort);
    }
  }

  /* ---------- 网格 / 列表 ---------- */
  function setView(view) {
    grid.classList.toggle("is-list", view === "list");
    if (viewBtn) {
      viewBtn.setAttribute("aria-label", view === "list" ? "切换到网格视图" : "切换到列表视图");
      var g = viewBtn.querySelector("[data-icon-grid]");
      var l = viewBtn.querySelector("[data-icon-list]");
      if (g && l) {
        g.style.display = view === "list" ? "" : "none";
        l.style.display = view === "list" ? "none" : "";
      }
    }
  }

  if (viewBtn) {
    viewBtn.addEventListener("click", function () {
      var next = grid.classList.contains("is-list") ? "grid" : "list";
      setView(next);
      store("dm-view", next);
    });
    setView(store("dm-view") === "list" ? "list" : "grid");
  }

  /* ---------- 快捷键 ---------- */
  document.addEventListener("keydown", function (ev) {
    if (!search) return;
    if (ev.key === "/" && document.activeElement !== search) {
      ev.preventDefault();
      search.focus();
      search.select();
    }
    if (ev.key === "Escape" && document.activeElement === search) {
      search.value = "";
      apply();
      search.blur();
    }
  });

  apply();
})();
