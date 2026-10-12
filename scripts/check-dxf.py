# SPDX-License-Identifier: AGPL-3.0-or-later
"""Check DXF files of the PDF -> DXF tool with ezdxf (recover + audit).

Developer tool, not part of npm test. Needs Python with ezdxf:

    pip install ezdxf
    python scripts/check-dxf.py out/*.dxf

Prints one line per file and exits with 1 when a file has errors. "Fixes" are
things ezdxf repaired silently (for information); errors are real problems.
"""

import sys

try:
    import ezdxf
    from ezdxf import recover
except ImportError:  # pragma: no cover
    print("ezdxf is not installed: pip install ezdxf")
    sys.exit(2)


def check(path):
    try:
        doc, auditor = recover.readfile(path)
    except IOError as e:
        return False, f"cannot read: {e}"
    except ezdxf.DXFStructureError as e:
        return False, f"invalid structure: {e}"
    audit = doc.audit()
    errors = [str(e.message) for e in auditor.errors + audit.errors]
    fixes = [str(f.message) for f in auditor.fixes + audit.fixes]
    msp = doc.modelspace()
    types = {}
    for e in msp:
        types[e.dxftype()] = types.get(e.dxftype(), 0) + 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(types.items()))
    line = f"{doc.dxfversion} | {len(errors)} errors | {len(fixes)} fixes | {summary}"
    if errors:
        line += "\n    " + "\n    ".join(errors[:10])
    if fixes:
        line += "\n    fixes: " + "; ".join(fixes[:5])
    return not errors, line


def main(paths):
    if not paths:
        print(__doc__)
        return 2
    bad = 0
    for p in paths:
        ok, line = check(p)
        print(f"{'ok ' if ok else 'BAD'} {p}: {line}")
        bad += 0 if ok else 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
