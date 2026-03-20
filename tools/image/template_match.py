#!/usr/bin/env python3
import sys
import json
import cv2
import numpy as np

def match_template(image_path, template_path, threshold=0.7, scales="2,1.5,1,0.5"):
    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    tpl = cv2.imread(template_path, cv2.IMREAD_COLOR)
    
    if img is None or tpl is None:
        return {"matched": False, "error": "Failed to load image"}
    
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    tpl_gray = cv2.cvtColor(tpl, cv2.COLOR_BGR2GRAY)
    
    scale_list = [float(s) for s in scales.split(",")]
    
    best_score = 0
    best_x = 0
    best_y = 0
    best_w = tpl.shape[1]
    best_h = tpl.shape[0]
    best_scale = 1.0
    
    for scale in scale_list:
        new_w = int(tpl.shape[1] * scale)
        new_h = int(tpl.shape[0] * scale)
        
        if new_w < 10 or new_h < 10:
            continue
        if new_w >= img.shape[1] or new_h >= img.shape[0]:
            continue
        
        scaled_tpl = cv2.resize(tpl_gray, (new_w, new_h))
        
        result = cv2.matchTemplate(img_gray, scaled_tpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
        
        if max_val > best_score:
            best_score = max_val
            best_x = max_loc[0]
            best_y = max_loc[1]
            best_w = new_w
            best_h = new_h
            best_scale = scale
    
    matched = best_score >= threshold
    
    return {
        "matched": matched,
        "score": float(best_score),
        "x": int(best_x),
        "y": int(best_y),
        "centerX": int(best_x + best_w / 2),
        "centerY": int(best_y + best_h / 2),
        "width": int(best_w),
        "height": int(best_h),
        "scale": float(best_scale)
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: template_match.py <image> <template> [threshold] [scales]"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    template_path = sys.argv[2]
    threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.7
    scales = sys.argv[4] if len(sys.argv) > 4 else "2,1.5,1,0.5"
    
    result = match_template(image_path, template_path, threshold, scales)
    print(json.dumps(result))
