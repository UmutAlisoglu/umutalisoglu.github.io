# Office conversion samples

`sample.docx` and `sample.pptx` are original, generated test documents with two pages/slides, ordinary text and a small embedded geometric illustration. The DOCX also contains a table and explicit page break. The PPTX includes a column chart and its embedded workbook. They contain no visitor data or external media.

The browser check verifies actual preview pixels, two-page PDF exports, selectable-text PDF extraction, cancellation, workspace handoff, and no external requests or uploads. It adds an external image relationship to a copy of the DOCX in memory to check that relationship removal works.
