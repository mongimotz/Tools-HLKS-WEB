# PDF-Editor: checks for the owner

Manual checks that the automated tests cannot do. Tick them off here or tell the agent what failed.

## Symbols and stamps

- [ ] Review the 25 schema symbols (`tools/pdf-editor/symbols/*.svg`, shown in the Symbole panel): drawing, name, category and the `norm` reference in `symbols/manifest.json`. Change an SVG, run `node scripts/build-symbol-library.mjs`, commit both.
- [ ] Stamps `Geprüft`, `Freigegeben`, `Entwurf`, `Ungültig`, `Zur Kenntnis`: wording, colours, size (56 × 16 mm).
