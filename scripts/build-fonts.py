"""Build the font files used by the site from the IBM Plex package.

Run once when the fonts change (needs Python with fonttools and brotli):
    python scripts/build-fonts.py

Input: assets/fonts/source/ (variable IBM Plex Sans and Mono, roman, from the official IBM Plex package).
Output:
  assets/fonts/plex-sans-var.woff2, plex-mono-var.woff2   web fonts (variable weight; Sans also width)
  assets/fonts/pdf/plex-sans-{400,600}.ttf, plex-mono-{400,600}.ttf   static fonts embedded in PDF reports
All files are subset to Latin, Greek, punctuation, arrows and maths symbols.
"""

import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"
SRC = OUT / "source"

UNICODES = (
    "U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02C6-02DC,U+0300-036F,U+0370-03FF,"
    "U+2000-206F,U+2070-209F,U+20AC,U+2100-214F,U+2190-21FF,U+2200-22FF,U+FFFD"
)

SANS = SRC / "IBMPlexSans-Var-Roman.ttf"
MONO = SRC / "IBMPlexMono-Var-Roman.ttf"


def subset_font(font: TTFont, flavor: str | None) -> TTFont:
    options = subset.Options()
    options.flavor = flavor
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    sub = subset.Subsetter(options)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    font.flavor = flavor
    return font


def main() -> None:
    for f in (SANS, MONO):
        if not f.exists():
            sys.exit(f"missing {f}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "pdf").mkdir(exist_ok=True)

    # web: variable fonts as WOFF2
    for src, name in ((SANS, "plex-sans-var.woff2"), (MONO, "plex-mono-var.woff2")):
        font = subset_font(TTFont(src), "woff2")
        font.save(OUT / name)
        print(f"{name}: {(OUT / name).stat().st_size // 1024} KB")

    # PDF: static instances (pdf-lib cannot use variable fonts)
    for src, family, axes in ((SANS, "sans", {"wdth": 100}), (MONO, "mono", {})):
        for weight in (400, 600):
            font = instancer.instantiateVariableFont(TTFont(src), {"wght": weight, **axes})
            font = subset_font(font, None)
            path = OUT / "pdf" / f"plex-{family}-{weight}.ttf"
            font.save(path)
            print(f"pdf/{path.name}: {path.stat().st_size // 1024} KB")

    shutil.copy(SRC / "LICENSE.txt", OUT / "OFL-LICENSE.txt")


if __name__ == "__main__":
    main()
