"""
Offline evaluation of the glyph matcher — mirrors js/glyph.js step for step
(binarise -> crop -> fit long side to 28 in 32 -> 2x2 average -> 16x16 ink map)
and measures top-1 accuracy against different typefaces.

Run:  python assets/eval_match.py
"""
import os
import sys
import math
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_assets import GLYPH  # noqa: E402

NOTO = os.path.join(tempfile.gettempdir(), "NotoSansBrahmi.ttf")
SEGOE = "C:/Windows/Fonts/seguihis.ttf"
FONT_PX = 120
SIZE = 160

CONSONANTS = [0x11013 + i for i in range(0x11034 - 0x11013 + 1)]
VOWELS = [0x11005 + i for i in range(0x11013 - 0x11005)]
MATRAS = [0x11038] + list(range(0x1103A, 0x11046))
SIGNS = [0x11000, 0x11001, 0x11002, 0x11046]
CHARS = VOWELS + CONSONANTS + MATRAS + SIGNS


# ---------------------------------------------------------------- rendering
def render_binary(codepoint, font_path, text=None):
    f = ImageFont.truetype(font_path, FONT_PX)
    img = Image.new("L", (SIZE, SIZE), 255)
    d = ImageDraw.Draw(img)
    s = text if text is not None else chr(codepoint)
    d.text((SIZE / 2, SIZE / 2), s, font=f, fill=0, anchor="mm")
    bin_img = img.point(lambda p: 255 if p < 140 else 0)
    return bin_img


def crop_to_ink(bin_img):
    bb = bin_img.getbbox()
    return bin_img.crop(bb) if bb else None


def feature(bin_crop):
    """16x16 ink-density map + aspect ratio, exactly like maskToFeature()."""
    if bin_crop is None:
        return None
    bw, bh = bin_crop.size
    if bw < 2 or bh < 2:
        return None
    scale = 28.0 / max(bw, bh)
    dw = max(1, round(bw * scale))
    dh = max(1, round(bh * scale))
    small = bin_crop.resize((dw, dh), Image.BILINEAR)
    canvas = Image.new("L", (32, 32), 0)
    canvas.paste(small, (round((32 - dw) / 2), round((32 - dh) / 2)))
    px = canvas.load()
    v = []
    for y in range(16):
        for x in range(16):
            s = (px[x * 2, y * 2] + px[x * 2 + 1, y * 2] +
                 px[x * 2, y * 2 + 1] + px[x * 2 + 1, y * 2 + 1]) / 4.0
            v.append(s / 255.0)
    return v, bw / bh


def char_feature(codepoint, font_path):
    """Combining marks are isolated by diffing 'base + mark' against 'base'."""
    if codepoint in MATRAS or codepoint in (0x11000, 0x11001, 0x11002, 0x11046):
        base = render_binary(0, font_path, text=chr(0x11013))
        comp = render_binary(0, font_path, text=chr(0x11013) + chr(codepoint))
        diff = Image.new("L", (SIZE, SIZE), 0)
        b, c = base.load(), comp.load()
        dp = diff.load()
        n = 0
        for y in range(SIZE):
            for x in range(SIZE):
                if c[x, y] and not b[x, y]:
                    dp[x, y] = 255
                    n += 1
        if n >= 12:
            return feature(crop_to_ink(diff))
        return feature(crop_to_ink(comp))
    return feature(crop_to_ink(render_binary(codepoint, font_path)))


# ----------------------------------------------------------------- matching
def pearson(a, b):
    ma = sum(a) / len(a)
    mb = sum(b) / len(b)
    ca = [x - ma for x in a]
    cb = [x - mb for x in b]
    na = math.sqrt(sum(x * x for x in ca))
    nb = math.sqrt(sum(x * x for x in cb))
    if na < 1e-6 or nb < 1e-6:
        return 0.0
    return max(0.0, sum(x * y for x, y in zip(ca, cb)) / (na * nb))


def ar_factor(ar_q, ar_t):
    """0.6 octaves free, then a linear penalty — stops a wide blob matching a dot."""
    if not ar_q or not ar_t:
        return 1.0
    d = abs(math.log(ar_q / ar_t, 2))
    return max(0.0, 1.0 - max(0.0, d - 0.6) * 0.55)


def best_match(feat, templates, gate):
    f, ar = feat
    best, best_id = -1, None
    for cid, tf, tar in templates:
        s = pearson(f, tf)
        if gate:
            s *= ar_factor(ar, tar)
        if s > best:
            best, best_id = s, cid
    return best_id, best


def build(font_paths, gate_unused=None):
    out = []
    for fp in font_paths:
        for cp in CHARS:
            ft = char_feature(cp, fp)
            if ft:
                out.append((cp, ft[0], ft[1]))
    return out


def accuracy(templates, query_font, gate, label):
    hits = 0
    confusions = []
    for cp in CHARS:
        q = char_feature(cp, query_font)
        if not q:
            continue
        got, score = best_match(q, templates, gate)
        if got == cp:
            hits += 1
        else:
            confusions.append((hex(cp), hex(got) if got else None, round(score, 2)))
    print(f"{label:52s} {hits}/{len(CHARS)}  = {100*hits/len(CHARS):.0f}%")
    return hits, confusions


if __name__ == "__main__":
    print(f"fonts: Noto={os.path.exists(NOTO)}  Segoe={os.path.exists(SEGOE)}")
    both = build([NOTO, SEGOE])
    noto_only = build([NOTO])
    sego_only = build([SEGOE])
    print(f"templates: noto={len(noto_only)}  segoe={len(sego_only)}  both={len(both)}\n")

    print("--- top-1 accuracy, same typeface as the templates (the easy case) ---")
    accuracy(noto_only, NOTO, True, "query=Noto, templates=Noto")
    accuracy(sego_only, SEGOE, True, "query=Segoe, templates=Segoe")

    print("\n--- top-1 accuracy, CROSS typeface (the reported bug) ---")
    accuracy(noto_only, SEGOE, True, "query=Segoe, templates=Noto  (today's build)")
    accuracy(both, SEGOE, True, "query=Segoe, templates=Noto+Segoe (the fix)")
    accuracy(both, NOTO, True, "query=Noto,  templates=Noto+Segoe (regression?)")

    print("\n--- aspect-ratio gate on false positives ---")
    wide = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(wide)
    d.line([(10, 80), (150, 80)], fill=255, width=6)
    d.line([(10, 70), (150, 70)], fill=255, width=3)
    wf = feature(crop_to_ink(wide))
    vir = [(cp, f, ar) for cp, f, ar in both if cp == 0x11046]
    if vir:
        s_off = pearson(wf[0], vir[0][1])
        s_on = s_off * ar_factor(wf[1], vir[0][2])
        print(f"wide line-blob vs virāma: raw={s_off:.2f}  gated={s_on:.2f}  "
              f"(ar blob={wf[1]:.1f} vs mark={vir[0][2]:.1f})")


    print("\n--- does the aspect-ratio gate cost accuracy? ---")
    accuracy(both, SEGOE, False, "query=Segoe, both fonts, gate OFF")
    accuracy(both, SEGOE, True, "query=Segoe, both fonts, gate ON ")
    accuracy(both, NOTO, False, "query=Noto,  both fonts, gate OFF")
    accuracy(both, NOTO, True, "query=Noto,  both fonts, gate ON ")
