# To do for the owner (Fabio)

Tasks the agent cannot do. Ordered by priority.

- [ ] **Test in Trimble Nova:** work through `docs/pdf-to-dxf-nova-test.md` and fill in the results. Most important: rows 1–2 (import and control distance), 10–11 (line weights, true colours), 15–19 (text), 30–32 (R12). If Nova rejects the true colours (group code 420 in R2000 files, see DECISIONS D7), tell the agent: the default of "Echtfarben" then goes to off.
- [ ] **Real plans:** put a few typical architect PDFs (vector and scanned) into `tests/fixtures/pdf-to-dxf/real/` (git-ignored, they stay local) and run `npm test` and `node scripts/pdf-to-dxf.mjs tests/fixtures/pdf-to-dxf/real/<plan>.pdf --out out`. Note slow files, missing content, wrong layers or text in the Nova checklist (rows 33–34).
- [ ] **GitHub "About":** after `main` contains the branch, check that GitHub shows the license as AGPL-3.0 (it reads `LICENSE` automatically).
- [ ] **Local main:** released on 2026-10-13 on your go ("release it"): `origin/main` was fast-forwarded to `feature/pdf-to-dxf`. In the main working tree run `git pull --ff-only` once. Then the worktree `../Tools-HLKS-pdf-to-dxf` and the branch can be removed (`git worktree remove ../Tools-HLKS-pdf-to-dxf`, `git branch -d feature/pdf-to-dxf`, `git push origin --delete feature/pdf-to-dxf`).
- [ ] Optional: `pip install ezdxf`, then `python scripts/check-dxf.py out/*.dxf` on the DXF files of the real plans.
