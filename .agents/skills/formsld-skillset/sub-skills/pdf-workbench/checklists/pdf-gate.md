# PDF gate

- [ ] Only permissive libraries used; no PyMuPDF
- [ ] pdfium calls run under the `PDFIUM` lock
- [ ] Operation derives a new document; input untouched; protection re-applied; failures discarded
- [ ] Errors raise `ValueError` with a sentence (or `Locked`) and map through `_run`
- [ ] Window flow uses `run` with a delayed indicator and can step back to the previous state
- [ ] Scratch checks: sample PDF, protected PDF, large PDF
- [ ] MCP pdf tool and harness pdf reference updated if agents gain the feature
