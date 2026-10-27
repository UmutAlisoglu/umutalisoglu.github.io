# FileForge usability session

Prepared 27 October 2026. This is a test plan, not a record of completed user research.

## Run a 15-minute session

Invite 3–5 people who handle ordinary files. Include a phone user and someone who
does not normally use developer tools. Let each participant use their own browser.
Do not ask them to use personal documents: use the sample artwork and a sample
document photo. Ask before recording a session. Notes alone are enough.

Say: “We are testing the website. If something is unclear, that is useful for us.
Please say what you expect to happen. I will mostly watch.”

Start at the home page. Avoid telling them which button or tool to choose.

## Three tasks

1. **Prepare an attachment.** “You want to email this image. Make a copy that is
   ready to send, and save it. Tell me how you know which file you downloaded.”
   Observe discovery, file selection, understanding the preset, comparison of
   sizes, and finding the download. A larger result is possible; note whether
   they notice and know how to adjust it.
2. **Make a product image.** “You want to list these headphones in a shop. Make
   an image with a transparent background and a square crop, then save it.”
   Observe the distinction between preparing a cutout and exporting it, whether
   Next is discoverable, whether transparency is understood, and whether the
   final downloaded PNG matches the intended crop.
3. **Clean up a document.** “Turn this photographed page into a tidy PDF you can
   send to somebody.” Observe corner placement, straightening, reviewing the
   preview, preparing the intermediate image, and exporting the final PDF.
   Ask whether they expect selectable text; the current output is a page image.

If they are stuck, wait long enough to see what they try. Then ask “What are you
looking for?” Give help only after recording where they got stuck. Stop any task
that becomes frustrating.

## Record one row per task

| Participant code | Device / browser | Task | Completed without help? | Approx. time | Where they hesitated | Exact words | Help given | Suggested change |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | | | | | | | | |

Use participant codes, not names or file contents. Ask three closing questions:

- What felt easier than expected?
- What felt unclear or unnecessary?
- Would you know where to return for another file job?

## Decide what to change

Fix data loss, misleading output and blocked tasks first. Then fix repeated
hesitation and unclear labels. Prefer the smallest change that addresses an
observed problem. Run the same task again with a fresh participant after a fix.
Do not infer statistical conversion rates from this small group.

## What is already checked automatically

`npm run test:quick-jobs` covers real image/PDF exports, the product cutout chain,
actual transparency, presets, invalid selections, reset, small screens and local
requests. These checks help catch regressions. They do not establish whether
people can discover and understand the interface without help.

## Demonstrations

The FileForge product page contains a recording of a real browser conversion with
the original headphones sample. Repodock has a clearly labelled walkthrough of
its existing dashboard screenshot. It is not a recording of running a repository.
