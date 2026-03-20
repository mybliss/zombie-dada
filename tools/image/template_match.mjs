import fs from "fs";
import { execFileSync } from "child_process";
import { PNG } from "pngjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadPng(imagePath) {
  if (typeof imagePath === "string") {
    const buffer = fs.readFileSync(imagePath);
    return PNG.sync.read(buffer);
  }
  return imagePath;
}

export function matchTemplate(image, template, options = {}) {
  const imgPath = typeof image === "string" ? image : null;
  const tplPath = typeof template === "string" ? template : null;
  
  if (!imgPath || !tplPath) {
    throw new Error("matchTemplate requires file paths for both image and template");
  }

  const threshold = Number.parseFloat(options.threshold || "0.7");
  const scales = options.scales || "2,1.5,1,0.5";
  
  const scriptPath = path.join(__dirname, "template_match.py");
  
  try {
    const output = execFileSync("python3", [scriptPath, imgPath, tplPath, String(threshold), scales], {
      encoding: "utf8",
      timeout: 30000,
    });
    
    const result = JSON.parse(output.trim());
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result;
  } catch (err) {
    return {
      matched: false,
      score: 0,
      x: 0,
      y: 0,
      centerX: 0,
      centerY: 0,
      width: 0,
      height: 0,
      scale: 1,
      error: err.message,
    };
  }
}
