# Intake gate

- [ ] Detection order kept: magic bytes, then extension, then text sniffing
- [ ] Reader returns the common shape; failures roll back and mark the source unknown with an error
- [ ] Digest lines exist at every level of the ladder, and a large sample still fits the 5,600 character MCP cap
- [ ] Ids stable when the same files are ingested again and when files are appended
- [ ] get_source pages the new kind sensibly and stays under 16,000 characters per call
- [ ] FORMAT.md intake section, the ingest tool description, the MCP GUIDE and the harness digest reference updated
- [ ] Scratch check: mixed folder ingested, draft_spec built without warnings
