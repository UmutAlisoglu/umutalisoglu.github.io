# Product review — 27 October 2026

## Decision

Keep FileForge as the main file toolbox. Keep Product Kit Studio as a focused FileForge workflow for small product-photo collections. Keep Repodock as a separate utility for people who already work with local software projects. No product deletion is justified by the evidence in this review. Audience fit is a product judgment; no participant research was performed for this review.

The previous homepage overpromoted Product Kit. A niche batch-photo workflow should not define the whole personal website or obscure FileForge and Repodock. The homepage now opens FileForge and gives Product Kit a smaller, specific place within that toolbox.

## FileForge: useful, but too many entrances and too much repetition

The strongest reason to use it is everyday file work on the visitor's own device. The browser is a sensible default. Installing the Windows package makes more sense for bundled offline engines and larger native limits; installation should not be presented as a necessary upgrade for everyone.

Changes:

- Removed the promoted classic-studio link from the directory. Its existing URL remains available for compatibility.
- Replaced the long feature changelog on the product page with concise export limitations.
- Made the full browser/Windows comparison expandable, while keeping the main edition choice visible.
- Added direct routes for one-file/custom workflows, batch product photos, and a specific converter.
- Explicitly distinguished newer browser Quick Jobs and Product Kit from the unchanged Windows 0.3.0 download.
- Clarified browser memory-only results versus the desktop native queue's temporary local copies and retention.
- Fixed a directory inconsistency: Product Kit was counted and searchable but missing from the default grouped list. A regression check now requires every catalogued tool to appear exactly once.
- Kept generic background-removal searches focused on the single-photo tool. Batch/product searches can surface Product Kit.

Limits that remain real: Office exports are flattened page images and can differ from Microsoft Office layout; OCR produces TXT rather than a searchable PDF; PDF compression does not guarantee a smaller file. The website now states these limits directly. This review did not rebuild or launch the FileForge Windows installer. Its native entry points, queue/file handling, packaging and published requirements were inspected in source; browser workflows were exercised.

## Product Kit: a workflow, not a separate platform

Consistent square exports and an organized ZIP are useful. The earlier presentation implied more than the actual product did, and its error handling was too destructive.

Fixed:

- A 480 px thumbnail was the only result preview. The studio now uses the actual listing/web/thumbnail exports, with exact dimensions and sizes, a full-size view, and individual downloads.
- Editing settings deleted the finished download. Settings now mark the previous build as stale while leaving it available until a replacement succeeds.
- Cancellation or engine failure could discard completed work. Rebuild results are committed together only after a successful ZIP is ready; the previous kit survives failures and cancellation.
- One failed photo aborted the batch. Successful photos now form a downloadable kit; skipped files and reasons appear in the interface and `kit.json`. Failed partial exports are not included.
- Background removal was enabled by default. It is now opt-in, with a per-photo option to keep an original background, plus a working retry without the model if engine loading fails.
- The sample action could replace a selected collection. It is disabled while photos are selected; clearing the workspace is explicit.
- Partial-success counts could overstate the available output. The toolbar and download summary now report the actual completed image count.
- Removed the unqualified promise of a “lighter” web export. Formats do not guarantee smaller byte sizes. Enlargement warnings identify when a smaller source is resized upward.

The studio still exports fixed square sizes. It does not write product descriptions, enforce marketplace specifications, reconstruct missing detail, or replace a manual photo editor. Difficult edges still require inspection and, when needed, the separate cutout editor. These boundaries are now reflected in the copy.

## Repodock: a distinct developer utility, not universal one-click setup

Its useful job is keeping local project commands, processes, ports and logs together. Runtime installation, databases, credentials and unusual repository layouts can still need project knowledge. The product page now identifies that audience and explains those limits before the feature tour. It also corrects the WebView2 requirement: the app window uses it, with a browser fallback when unavailable.

A reproducible source defect was found: `package.json` containing `null` raises an AttributeError in command detection. Dashboard state invokes detection for ready projects, so malformed repository metadata can interrupt the library view. Array/scalar manifests and malformed script/task tables had related problems.

[Repodock PR #1](https://github.com/UmutAlisoglu/repodock/pull/1) validates Node/Deno metadata before reading it, preserves valid Deno task objects, and lets other supported project types continue to be detected. It was merged as `053f22a67b88a10f5970765824ba3c6f80c09a5d` after all eight CI jobs passed.

The published Windows download remains v0.2.1. The repository's main branch identifies itself as unreleased 0.3.0. The patched Windows CI build has been saved alongside the delivered review as an installer and portable ZIP. This does not patch an installed copy or replace the public release; updating the public download still needs a published desktop release.

## Verification

- Website: 46 unit tests passed and the production build passed.
- Product Kit: actual ZIP contents, nine image dimensions/byte sizes, JPEG output, real ONNX cutouts, alpha transparency, per-photo background selection, full-size and individual exports, previous-build preservation, model-load recovery, partial success, invalid files, saved settings and reset were checked.
- Shared website: product media and keyboard tour, tool finder, URL-backed search, workspace recovery, page destinations, sitemap, six widths from 320–1440 px, reduced motion and JavaScript-disabled navigation passed. Processing checks observed same-origin GET requests and local blob/data activity, with no file uploads.
- Repodock: local Windows/Python 3.14 suite ran 99 tests: 98 passed and one platform-specific test was skipped. All 31 detection tests passed after the final task-object compatibility update. GitHub CI passed Linux/Python 3.9–3.13, Windows/Python 3.9 and 3.13, and macOS/Python 3.13.
- Repodock Windows build: [workflow run 40562867062](https://github.com/UmutAlisoglu/repodock/actions/runs/40562867062) succeeded after the merge, building the executables and installer and checking the CLI, browser mode, app window, single-instance handoff, clean quit and installer. The downloaded review artifacts are an unreleased 0.3.0 build, not a new stable release.
- Deno task-object compatibility was checked against the [official task documentation](https://docs.deno.com/runtime/reference/cli/task/).

These checks establish the covered behavior, not exhaustive compatibility or proven demand. No participant feedback or adoption figures are claimed. The Windows build checks ran in GitHub CI; no desktop app was installed into the user's Windows environment during this review.

## Release follow-up — 27 October 2026

[Repodock 0.3.0 is now published](https://github.com/UmutAlisoglu/repodock/releases/tag/v0.3.0), superseding the distribution status recorded above. It includes the detection fix, reviewed project links and the existing 0.3.0 link-handoff changes. The [release Windows workflow](https://github.com/UmutAlisoglu/repodock/actions/runs/40567258025) rebuilt and checked the CLI, app window, protocol handoff and installer successfully. Its automatic Scoop and winget manifest generation completed; winget manifests have not been submitted to Microsoft's package repository.

The final installer, portable ZIP and optional extension were downloaded and matched to GitHub's SHA-256 digests. `SHA256SUMS.txt` is published with the release. The Alisoglu product/download pages now link to 0.3.0 with the final package sizes. The website's `npm run check:releases` maintenance command checks stable-version links, required assets and public download responses for both desktop apps.

## Product Kit retirement — 27 October 2026

The earlier decision to retain Product Kit has been superseded. Its fixed-size batch pipeline and separate interface did not earn their place alongside the existing image tools. The studio, processing code and promotions have been removed. Image Studio remains the route for batch conversion/resizing; the guided photo job remains the route for editable cutouts and cropping. The old Product Kit URL serves a noindex retirement page with both alternatives, rather than a broken link. Previous implementation details above are historical review findings, not current advertised features.
