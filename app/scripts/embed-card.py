#!/usr/bin/env python3
"""يضع بيانات «بطاقة أسلوب» (JSON) داخل صورة PNG، بلا حاجة إلى الموقع ولا إلى أي مكتبة.

    python3 scripts/embed-card.py card.warraq.json picture.png out.warraq.png

الصيغة: مقطع iTXt قبل IEND، مفتاحه warraq-style، ونصه JSON البطاقة (UTF-8 غير مضغوط).
"""
import json, struct, sys, zlib

def embed(card: dict, png: bytes) -> bytes:
    assert png[:8] == b"\x89PNG\r\n\x1a\n", "ليست صورة PNG"
    data = b"warraq-style" + b"\x00\x00\x00\x00\x00" + json.dumps(card, ensure_ascii=False).encode("utf-8")
    chunk = struct.pack(">I", len(data)) + b"iTXt" + data + struct.pack(">I", zlib.crc32(b"iTXt" + data) & 0xFFFFFFFF)
    i = png.rfind(b"IEND") - 4
    return png[:i] + chunk + png[i:]

if __name__ == "__main__":
    card_path, png_path, out_path = sys.argv[1:4]
    card = json.load(open(card_path, encoding="utf-8"))
    assert card.get("format") == "warraq-style", "الملف ليس بطاقة أسلوب"
    open(out_path, "wb").write(embed(card, open(png_path, "rb").read()))
    print("✓", out_path)
