# Open-source credits

Document tools also bundle **docx-preview 0.4.1** (Apache-2.0), **@aiden0z/pptx-renderer 1.4.0** (Apache-2.0), **html2canvas 1.4.1** (MIT), **JSZip 3.10.2** (MIT/GPL dual license; used under MIT), **ECharts 6.1.0** (Apache-2.0), **zrender 6.1.0** (BSD-3-Clause), and **mtx-decompressor 1.8.0** (MPL-2.0). License copies are in `/licenses/`; the upstream PowerPoint renderer notices and ECMA-derived geometry notices are included there too. This build resolves the external decompressor to 1.8.0; the upstream notice describes its older bundled distribution. The unmodified MPL-covered source for this build is available at https://github.com/ChristopherVR/mtx-decompressor/tree/v1.8.0 and https://github.com/ChristopherVR/mtx-decompressor/archive/refs/tags/v1.8.0.tar.gz . These licenses apply to their respective components, not visitor documents.

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

- **Tesseract.js 7.0.0** and **tesseract.js-core 7.0.0**, Apache 2.0: https://github.com/naptha/tesseract.js/tree/v7.0.0 and https://github.com/naptha/tesseract.js-core/tree/v7.0.0 . Executes OCR locally. Worker dependencies and native OCR/image-codec component notices are included at `/licenses/tesseract-THIRD-PARTY.txt`; project licenses are at `/licenses/tesseract.js-Apache-2.0.txt` and `/licenses/tesseract-core-Apache-2.0.txt`.
- **English/German/Turkish Tesseract traineddata**, Apache 2.0, pinned `@tesseract.js-data/{eng,deu,tur}` 1.0.0 packages: https://github.com/naptha/tessdata . Source attribution is included at `/licenses/tesseract-traineddata-NOTICE.txt`. Exact input versions, byte sizes and SHA-256 checksums are recorded by `scripts/prepare-ocr.mjs` and distributed in `/vendor/tesseract/manifest.json`.

The headphones demo is synthetic sample artwork, not a real product or endorsement. Sample notes are in `/assets/demos/README.md`. Example text and PDF documents are generated locally from original sample content.

- **heic-to 1.6.6**, LGPL-3.0: https://github.com/hoppergee/heic-to/tree/v1.6.6 (npm source package: https://registry.npmjs.org/heic-to/-/heic-to-1.6.6.tgz). Its unmodified, replaceable worker module is served at `/vendor/heic/heic-to.js`; licenses at `/licenses/heic-to-LGPL-3.0.txt` and `/licenses/GPL-3.0.txt`. Includes libheif 1.23.6, LGPL-3.0, and its HEVC decoder dependencies. Corresponding libheif source: https://github.com/strukturag/libheif/tree/v1.23.6 ; decoder build instructions and dependency configuration: https://github.com/hoppergee/heic-to/blob/main/README.md .
