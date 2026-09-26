/* 全站通用：主题切换、复制、Toast、详情页键盘导航 */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---------- 主题 ---------- */
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      /* 隐私模式 / 禁用存储时静默忽略 */
    }
    return null;
  }

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  var toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("dm-theme", next);
    });
  }

  /* ---------- Toast ---------- */
  var toastEl = null;
  var toastTimer = null;

  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    // 强制回流，保证连续点击时动画会重播
    void toastEl.offsetWidth;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-on");
    }, 1600);
  }

  window.__toast = toast;

  /* ---------- 复制 ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // http 环境下的兜底
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-copy]");
    if (!btn) return;
    ev.preventDefault();
    copyText(btn.getAttribute("data-copy")).then(
      function () {
        toast("已复制 " + btn.getAttribute("data-copy"));
      },
      function () {
        toast("复制失败，请手动选择");
      }
    );
  });

  /* ---------- 详情页：← → 翻页 ---------- */
  var prev = document.body.getAttribute("data-prev");
  var next = document.body.getAttribute("data-next");

  if (prev || next) {
    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (ev.key === "ArrowLeft" && prev) location.href = prev;
      if (ev.key === "ArrowRight" && next) location.href = next;
    });
  }
})();
