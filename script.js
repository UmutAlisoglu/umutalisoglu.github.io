"use strict";
// Keep keyboard focus useful when following same-page links.
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener("click", () => {
    const target = document.getElementById(link.getAttribute("href").slice(1));
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
});
