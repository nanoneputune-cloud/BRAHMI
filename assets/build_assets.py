"""
Brahmi Lipi Studio — logo + favicon generator.

The mark is a single Brahmi letter: ba (U+11029, bʱ... ), the first syllable of
"brahmi" (ba-ra-ha-virama-ma-ii). It is drawn as a seal: one glyph on one ground,
nothing else, so it still reads at 16 px.

Run:  python assets/build_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "C:/Windows/Fonts/seguihis.ttf"
GLYPH = chr(0x11027)          # BRAHMI LETTER PA — a vessel / ink-cup shape

SS = 4                        # supersampling factor
GOLD_HI, GOLD_LO = (242, 212, 146), (188, 138, 52)
INK_HI, INK_LO = (28, 34, 47), (11, 14, 20)
PAPER_HI, PAPER_LO = (250, 244, 230), (231, 220, 197)


def rounded_mask(size, radius, style):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    if style == "circle":
        d.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def linear_gradient(size, top, bottom):
    g = Image.new("RGB", (1, size))
    px = g.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return g.resize((size, size))


def glyph_mask(size, char, box_ratio, thicken=0):
    """Render the letter as an alpha mask, scaled to box_ratio of the canvas."""
    probe = ImageFont.truetype(FONT, 400)
    tmp = Image.new("L", (400 * 3, 400 * 3), 0)
    d = ImageDraw.Draw(tmp)
    d.text((400, 400), char, font=probe, fill=255)
    bb = tmp.getbbox()
    if not bb:
        raise SystemExit("font could not render the Brahmi glyph")
    glyph = tmp.crop(bb)

    target = int(size * box_ratio)
    w, h = glyph.size
    scale = target / max(w, h)
    glyph = glyph.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    if thicken:
        size_px = thicken if thicken % 2 else thicken + 1   # MaxFilter needs odd
        glyph = glyph.filter(ImageFilter.MaxFilter(size_px))

    canvas = Image.new("L", (size, size), 0)
    canvas.paste(glyph, ((size - glyph.size[0]) // 2, (size - glyph.size[1]) // 2))
    return canvas


def make_mark(px, style="squircle", thicken=0, char=None, ring_on=True, box=0.52):
    """One badge at px*SS, then downsampled. Returns RGBA."""
    s = px * SS
    radius = int(s * 0.235)

    if style == "circle-paper":
        ground = linear_gradient(s, PAPER_HI, PAPER_LO).convert("RGBA")
        ink = linear_gradient(s, INK_HI, INK_LO).convert("RGBA")
        ring = (16, 19, 26, 255)
    else:
        ground = linear_gradient(s, INK_HI, INK_LO).convert("RGBA")
        ink = linear_gradient(s, GOLD_HI, GOLD_LO).convert("RGBA")
        ring = (226, 178, 90, 200)

    ground.putalpha(rounded_mask(s, radius, style))

    # letter
    gm = glyph_mask(s, char or GLYPH, box, thicken)
    ground.paste(ink, (0, 0), gm)

    # a single hairline ring inside the edge — the only ornament
    if ring_on and style != "glyph-only":
        d = ImageDraw.Draw(ground)
        inset = s * 0.095
        wdt = max(2, int(s * 0.012))
        if style == "circle" or style == "circle-paper":
            d.ellipse([inset, inset, s - 1 - inset, s - 1 - inset], outline=ring, width=wdt)
        else:
            d.rounded_rectangle(
                [inset, inset, s - 1 - inset, s - 1 - inset],
                radius=radius * 0.72, outline=ring, width=wdt)

    return ground.resize((px, px), Image.LANCZOS)


def glyph_only(px, char=None):
    s = px * SS
    ink = linear_gradient(s, GOLD_HI, GOLD_LO).convert("RGBA")
    gm = glyph_mask(s, char or GLYPH, 0.92)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(ink, (0, 0), gm)
    return out.resize((px, px), Image.LANCZOS)


def contact_sheet():
    variants = [
        ("Squircle / app icon", make_mark(256, "squircle")),
        ("Seal / circle", make_mark(256, "circle")),
        ("Parchment seal", make_mark(256, "circle-paper")),
        ("Glyph only", glyph_only(256)),
    ]
    pad, label_h = 28, 34
    W = pad + (256 + pad) * len(variants)
    H = 256 + pad * 2 + label_h
    sheet = Image.new("RGB", (W, H), (16, 18, 24))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
    for i, (name, im) in enumerate(variants):
        x = pad + i * (256 + pad)
        sheet.paste(im, (x, pad), im)
        d.text((x, pad + 256 + 9), name, font=f, fill=(200, 190, 170))
    sheet.save(os.path.join(HERE, "logo-options.png"))
    print("logo-options.png", sheet.size)


def letters_sample():
    """A few large, well separated letters — the pick-a-character test image."""
    chars = "𑀓 𑀔 𑀕 𑀖 𑀗 𑀘 𑀚 𑀝 𑀞 𑀡"
    f = ImageFont.truetype(FONT, 84)
    img = Image.new("RGB", (1120, 200), "white")
    d = ImageDraw.Draw(img)
    d.text((28, 40), chars, font=f, fill=(16, 18, 24))
    img.save(os.path.join(HERE, "sample-letters.png"))
    print("sample-letters.png", img.size)


def stress_sample():
    """1000 characters on 20 lines, grouped into words — a scale test image."""
    import random
    random.seed(7)
    cons = [c for c in (0x11013 + i for i in range(34)) if c <= 0x11034]
    vowels = [0x11005, 0x11006, 0x11007, 0x11009, 0x1100F, 0x11011]
    pool = cons + vowels
    f = ImageFont.truetype(FONT, 26)

    lines = []
    for _ in range(20):
        words, count = [], 0
        while count < 50:
            n = min(random.randint(3, 6), 50 - count)
            words.append([chr(random.choice(pool)) for _ in range(n)])
            count += n
        lines.append(words)

    img = Image.new("RGB", (1300, 900), "white")
    d = ImageDraw.Draw(img)
    y = 14
    total = 0
    for words in lines:
        x = 14
        for w in words:
            for ch in w:
                d.text((x, y), ch, font=f, fill=(18, 18, 24))
                x += f.getlength(ch) + 4
                total += 1
            x += 16          # word gap
        y += 44
    img.save(os.path.join(HERE, "sample-large.png"))
    print("sample-large.png", img.size, total, "characters")


def alternates():
    """Other single-letter marks, in case a different letter is preferred."""
    chars = [
        (0x11005, "A"), (0x1102B, "MA"), (0x11032, "SA"), (0x11027, "PA"),
        (0x11033, "HA"), (0x1102E, "LA"), (0x1102C, "YA"), (0x11029, "BA"),
    ]
    s = 190
    pad, label_h = 22, 30
    W = pad + (s + pad) * len(chars)
    H = s + pad * 2 + label_h
    sheet = Image.new("RGB", (W, H), (16, 18, 24))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 15)
    for i, (cp, name) in enumerate(chars):
        im = make_mark(s, "squircle", char=chr(cp))
        x = pad + i * (s + pad)
        sheet.paste(im, (x, pad), im)
        d.text((x + 3, pad + s + 8), name, font=f, fill=(200, 190, 170))
    sheet.save(os.path.join(HERE, "logo-alternates.png"))
    print("logo-alternates.png", sheet.size)


def main():
    contact_sheet()
    alternates()
    letters_sample()
    stress_sample()

    # primary mark for the app header
    make_mark(512, "squircle").save(os.path.join(HERE, "logo-mark.png"))
    make_mark(128, "squircle").save(os.path.join(HERE, "logo-mark-128.png"))

    # Favicons: at 16-32 px the inner ring is just noise, so it is dropped and
    # the letter enlarged. No stroke thickening — that closes the cup up.
    make_mark(48, "squircle", ring_on=False, box=0.58).save(os.path.join(HERE, "favicon-48.png"))
    make_mark(32, "squircle", ring_on=False, box=0.60).save(os.path.join(HERE, "favicon-32.png"))
    make_mark(16, "squircle", ring_on=False, box=0.66).save(os.path.join(HERE, "favicon-16.png"))

    make_mark(180, "squircle").save(os.path.join(HERE, "apple-touch-icon.png"))

    ico_path = os.path.join(HERE, "favicon.ico")
    make_mark(48, "squircle", ring_on=False, box=0.58).save(
        ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote logo-mark.png, logo-mark-128.png, favicon-32/16.png, "
          "apple-touch-icon.png, favicon.ico")


if __name__ == "__main__":
    main()


