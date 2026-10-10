"use strict";
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener("click", () => {
    const target = document.getElementById(link.getAttribute("href").slice(1));
    if (target) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  });
});
const form = document.getElementById("prompt-form");
const input = document.getElementById("problem-input");
const result = document.getElementById("prompt-result");
const output = document.getElementById("prompt-output");
const copyStatus = document.getElementById("copy-status");
const ideas = [
  "My Downloads folder looks like it lost a fight.",
  "I want to try GitHub projects without opening twelve terminal tabs.",
  "My video is too big to share and I want it under a size limit.",
  "I keep collecting screenshots and can never find the right one.",
  "I have five PDFs and would like them to become one civilized document.",
  "I want a tiny desktop timer that politely reminds me to take a break.",
  "I want to turn a folder of photos into smaller images for sharing."
];
let lastIdea = -1;
function makePrompt(problem) {
  const clean = problem.trim();
  if (!clean) { input.focus(); return; }
  output.textContent = "Build a small, practical app to solve this problem:\n\n" + clean +
    "\n\nStart with a useful first version. Explain the approach, keep the interface simple, and process files locally where possible. Include clear setup instructions, meaningful checks, and an honest list of current limitations. Ask about any decision that truly needs my input.\n\nBonus: give it a little personality. Useful does not have to mean boring.";
  result.hidden = false;
  copyStatus.textContent = "";
}
form.addEventListener("submit", event => {
  event.preventDefault();
  input.setCustomValidity(input.value.trim() ? "" : "Give me a problem to work with. A blank stare doesn't compile.");
  if (form.reportValidity()) makePrompt(input.value);
});
document.getElementById("surprise-button").addEventListener("click", () => {
  let index = Math.floor(Math.random() * ideas.length);
  if (index === lastIdea) index = (index + 1) % ideas.length;
  lastIdea = index;
  input.setCustomValidity("");
  input.value = ideas[index];
  makePrompt(input.value);
});
document.getElementById("copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.textContent);
    copyStatus.textContent = "Copied. Go make the robots earn their keep.";
  } catch {
    copyStatus.textContent = "Copying wasn’t available here. You can select the prompt text and copy it yourself.";
  }
});
input.addEventListener("input", () => {
  input.setCustomValidity("");
  if (!result.hidden) { result.hidden = true; copyStatus.textContent = ""; }
});
