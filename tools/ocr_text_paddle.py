#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from paddleocr import PaddleOCR
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
MODEL_ROOT = REPO_ROOT / ".paddle-models"

def fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(1)


if len(sys.argv) < 2:
    fail("usage: python tools/ocr_text_paddle.py <image.png>")

image_path = Path(sys.argv[1])
if not image_path.exists():
    fail(f"failed to load image: {image_path}")

img = Image.open(image_path)
img_w, img_h = img.size

ocr = PaddleOCR(
    use_angle_cls=False,
    lang="ch",
    show_log=False,
    use_gpu=False,
    det_model_dir=str(MODEL_ROOT / "det" / "ch_PP-OCRv4_det_infer"),
    rec_model_dir=str(MODEL_ROOT / "rec" / "ch_PP-OCRv4_rec_infer"),
    cls_model_dir=str(MODEL_ROOT / "cls" / "ch_ppocr_mobile_v2.0_cls_infer"),
)

result = ocr.ocr(str(image_path), cls=False)
lines = []

for page in result or []:
    for item in page or []:
        box, data = item
        text = data[0]
        confidence = float(data[1])
        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        x = float(min(xs))
        y = float(min(ys))
        width = float(max(xs) - x)
        height = float(max(ys) - y)
        lines.append({
            "text": text,
            "confidence": confidence,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "centerX": x + width / 2,
            "centerY": y + height / 2,
        })

lines.sort(key=lambda line: (round(line["centerY"] / 10), line["centerX"]))

print(json.dumps({
    "imageWidth": img_w,
    "imageHeight": img_h,
    "lines": lines,
}, ensure_ascii=False, indent=2, sort_keys=True))
