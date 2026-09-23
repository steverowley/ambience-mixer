#!/usr/bin/env python3
"""Subset and self-host Fraunces.

Fraunces is used for exactly three strings (the wordmark, the empty-state
heading, the theatre layer name) and the dialog headings. Pulling a whole
variable family from Google Fonts for that costs a render-blocking
stylesheet plus a cross-origin font fetch on the critical path of an app
that is otherwise a single file.

We subset it to the Latin characters those strings actually need, plus the
punctuation the UI can produce, and emit a woff2 to sit next to index.html.
"""
import re
import sys
import urllib.request
from pathlib import Path

from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent.parent
UA_WOFF2 = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# Everything Fraunces is asked to render, plus headroom for user mix names
# appearing in dialog titles.
CHARS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " .,:;!?'\"()[]{}-–—_/\\&@#%+=*×·…“”‘’"
)


def fetch_css(family_query: str) -> str:
    req = urllib.request.Request(
        f"https://fonts.googleapis.com/css2?family={family_query}",
        headers={"User-Agent": UA_WOFF2},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def main() -> int:
    css = fetch_css("Fraunces:opsz,wght@9..144,400")
    urls = re.findall(r"url\((https://[^)]+\.woff2)\)", css)
    if not urls:
        print("no woff2 url found in Google Fonts CSS", file=sys.stderr)
        return 1

    # The latin block is the last @font-face Google emits; take the final URL.
    src = urls[-1]
    print("source:", src)
    with urllib.request.urlopen(urllib.request.Request(
            src, headers={"User-Agent": UA_WOFF2}), timeout=30) as r:
        raw = r.read()
    tmp = HERE / "fraunces-full.woff2"
    tmp.write_bytes(raw)
    print("downloaded", len(raw), "bytes")

    font = TTFont(str(tmp))
    opts = Options()
    opts.flavor = "woff2"
    opts.desubroutinize = True
    opts.layout_features = ["kern", "liga", "calt"]
    opts.name_IDs = ["*"]
    opts.name_legacy = False
    opts.notdef_outline = False
    opts.recalc_bounds = True
    # Keep the variable axis pinned at the weight we use.
    sub = Subsetter(options=opts)
    sub.populate(text=CHARS)
    sub.subset(font)

    out = HERE / "fraunces-subset.woff2"
    font.flavor = "woff2"
    font.save(str(out))
    font.close()
    tmp.unlink()

    print(f"wrote {out.name}: {out.stat().st_size} bytes "
          f"(from {len(raw)}), {len(set(CHARS))} glyphs requested")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
