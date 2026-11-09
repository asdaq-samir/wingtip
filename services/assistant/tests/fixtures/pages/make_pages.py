"""The sample pages the documents tests send as photos, drawn here so no
handbook or logbook is copied: a cruise table and a weight and balance
page with made-up figures in a light single's range (the same as
apps/web/src/lib/fixtures/documents.json's clean page), a logbook page of
three made-up flights and a clearance note in shorthand. The tests stub
the model, so these stand for what a phone sends; they are kept for
reading against a live model by hand.

    python tests/fixtures/pages/make_pages.py    # needs Pillow; writes the PNGs beside it
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT = ImageFont.load_default(size=22)
SMALL = ImageFont.load_default(size=18)


def page(lines: list[tuple[int, int, str, bool]], size=(1100, 800), name="page.png") -> None:
    image = Image.new("L", size, 250)
    draw = ImageDraw.Draw(image)
    for x, y, text, small in lines:
        draw.text((x, y), text, fill=20, font=SMALL if small else FONT)
    image.save(HERE / name, optimize=True)


def table(x: int, y: int, rows: list[list[str]], widths: list[int], step=34) -> list[tuple[int, int, str, bool]]:
    out = []
    for r, row in enumerate(rows):
        at = x
        for cell, w in zip(row, widths):
            out.append((at, y + r * step, cell, r > 0))
            at += w
    return out


def cruise() -> None:
    rows = [
        ["PRESS ALT FT", "RPM", "% BHP", "KTAS", "GPH"],
        ["4000", "2450", "65", "110", "8.6"],
        ["6000", "2300", "55", "104", "7.4"],
        ["6000", "2450", "65", "113", "8.5"],
        ["6000", "2600", "75", "120", "9.6"],
        ["8000", "2500", "65", "116", "8.4"],
    ]
    lines = [
        (40, 30, "SECTION 5 - PERFORMANCE      SAMPLE AIRPLANE (NOT A REAL HANDBOOK)", False),
        (40, 80, "CRUISE PERFORMANCE   Standard temperature   Maximum weight", False),
    ]
    lines += table(40, 140, rows, [220, 130, 130, 130, 130])
    lines += [
        (40, 400, "CLIMB: Vy 74 KIAS, 700 FPM at sea level, 11 GPH", False),
        (40, 440, "MAXIMUM GLIDE: 68 KIAS, glide ratio 9:1", False),
        (40, 480, "FUEL CAPACITY: total 56 gal, usable 53 gal", False),
    ]
    page(lines, name="cruise.png")


def weight_balance() -> None:
    lines = [
        (40, 30, "SECTION 6 - WEIGHT & BALANCE      SAMPLE AIRPLANE (NOT A REAL HANDBOOK)", False),
        (40, 90, "BASIC EMPTY WEIGHT 1680 LB   ARM 39.5 IN   MOMENT/1000 66.36", False),
        (40, 130, "MAXIMUM TAKEOFF WEIGHT 2450 LB", False),
        (40, 190, "CENTER OF GRAVITY LIMITS (corners, inches aft of datum, pounds)", False),
    ]
    corners = [["35.0", "1500"], ["35.0", "1950"], ["41.0", "2450"], ["47.3", "2450"], ["47.3", "1500"]]
    lines += table(40, 240, [["ARM IN", "WEIGHT LB"], *corners], [200, 200])
    page(lines, name="weight-balance.png")


def logbook() -> None:
    rows = [
        ["DATE", "TYPE", "IDENT", "FROM", "TO", "TOTAL", "NIGHT", "XC", "DUAL", "SOLO", "SIM", "APP", "LDG D", "LDG N"],
        ["10/03", "C172", "N12345", "KANE", "KSTC", "1.4", "", "1.4", "", "1.4", "", "", "1", ""],
        ["10/03", "C172", "N12345", "KSTC", "KANE", "1.3", "0.8", "1.3", "", "1.3", "", "", "", "1"],
        ["10/10", "C172", "N12345", "KANE", "KANE", "1.6", "", "", "1.6", "", "1.0", "2", "3", ""],
        ["TOTAL THIS PAGE", "", "", "", "", "4.3", "0.8", "2.7", "1.6", "2.7", "1.0", "2", "4", "1"],
    ]
    lines = [(30, 30, "PILOT LOGBOOK   2026   (SAMPLE, MADE-UP FLIGHTS)", False)]
    lines += table(30, 90, rows, [90, 70, 100, 80, 80, 70, 70, 60, 60, 60, 60, 50, 70, 70], step=44)
    page(lines, size=(1100, 400), name="logbook.png")


def clearance() -> None:
    lines = [
        (60, 60, "KANE  CLNC", False),
        (60, 120, "C  KDLH", False),
        (60, 170, "RV  / GOPHER  / AF", False),
        (60, 220, "M 3000   E 7000 10", False),
        (60, 270, "DEP 125.35", False),
        (60, 320, "SQ 4521", False),
    ]
    page(lines, size=(600, 420), name="clearance.png")


if __name__ == "__main__":
    cruise()
    weight_balance()
    logbook()
    clearance()
