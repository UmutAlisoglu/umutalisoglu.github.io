# Open-source credits

The website runs file conversions on the visitor's device. The following libraries and font are distributed with its browser build:

- **pdf-lib 1.17.1**, MIT: https://github.com/Hopding/pdf-lib/tree/v1.17.1
- **PDF.js / pdfjs-dist 6.4.299**, Apache 2.0: https://github.com/mozilla/pdf.js . Its bundled CMaps, standard fonts and WebAssembly resources retain the notices included in `/vendor/pdfjs/`.
- **fflate 0.8.3**, MIT: https://github.com/101arrowz/fflate . Creates image ZIP downloads locally.
- **@pdf-lib/fontkit 1.1.1**, MIT: https://github.com/Hopding/fontkit
- **SheetJS Community Edition 0.20.3**, Apache 2.0: https://git.sheetjs.com/sheetjs/sheetjs and https://cdn.sheetjs.com/xlsx-0.20.3/
- **@ffmpeg/ffmpeg 0.12.15**, MIT: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15
- **@ffmpeg/core 0.12.10** contains FFmpeg and codecs, including GPL components, and is licensed GPL-2.0-or-later. Corresponding source and codec build configuration for this release: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15 (see Dockerfile and build/). Release: https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15 . The build recipe identifies the source revisions of each included codec. These components remain under their own licenses; this website does not relicense them.
- **Noto Sans Regular**, SIL Open Font License 1.1: https://github.com/notofonts/noto-fonts . The font's license is included at `/fonts/LICENSE.txt`.
- **ImageTracerJS 1.2.6**, Unlicense, by András Jankovics: https://github.com/jankovicsandras/imagetracerjs . Traces image pixels into SVG paths locally. License included at `/licenses/imagetracer-Unlicense.txt`.
- **ONNX Runtime Web 1.30.0**, MIT, Microsoft: https://github.com/microsoft/onnxruntime . Executes the background model locally using the single-thread WebAssembly backend. License included at `/licenses/onnxruntime-MIT.txt`; its distributed WASM retains bundled third-party notices.
- **U²-Net small / U2NETP model**, Apache 2.0, Xuebin Qin and contributors: https://github.com/xuebinqin/U-2-Net . Unmodified ONNX weights from https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx . License, provenance and checksum are included at `/assets/models/LICENSE.txt` and `/assets/models/README.md`.

Dependency licenses and the fontkit README/source notices are included under `/licenses/` in the built website. Vite is a development/build dependency and is not a service used by visitors.
