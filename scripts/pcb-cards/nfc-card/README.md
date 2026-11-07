# NFC business card (Rev B)

Vector generator for Umut's 85 x 55 mm PCB business card with a built-in NFC tag.
Everything is drawn as vector geometry (shapely), so the Gerbers have smooth edges instead of pixel steps.

- Front: round silver (HASL) 6-turn antenna coil (43 mm) with dial ticks and an arc tagline, NXP NT3H2111W0FTTJ (NTAG I2C plus, TSSOP-8, LCSC C2654884), name and contacts.
- Back: round tap target over the antenna, copper ripples spreading over both sides, monogram in a dotted ring, QR code to https://alisoglu.com.
- Antenna: round, 43 mm outside, 0.5 mm track, 0.4 mm gap, about 2.4 µH, resonance about 14 MHz with the 50 pF chip.
  No other copper inside or near the coil on either side. C1 is an optional 0402 tuning capacitor, not fitted.

```
pip install shapely fonttools uharfbuzz qrcode pycairo pygerber opencv-python-headless
python3 card.py out              # Gerbers, drill, BOM, CPL, layers.pkl
python3 check.py out/layers.pkl  # DRC: 0.15 mm copper/silk, 0.1 mm mask dam, edge clearance
python3 render.py out/layers.pkl out/preview.png blue 24 silver   # or black / white, gold
python3 verify.py out            # re-reads every Gerber with pygerber, decodes the QR code
```

Fonts: Inter (OTF) and JetBrains Mono from the system font folder (`/usr/share/fonts`).
The chip ships blank: write the URL once with the NXP TagWriter app.
