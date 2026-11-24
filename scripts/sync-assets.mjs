import fs from "node:fs";
import path from "node:path";

const rawDir = path.resolve(process.cwd(), "assets", "raw");
const publicAssetsDir = path.resolve(process.cwd(), "public", "assets");
const allowedExtensions = new Set([".svg", ".webp", ".png", ".jpg", ".jpeg"]);

function syncAssets() {
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }
  if (!fs.existsSync(publicAssetsDir)) {
    fs.mkdirSync(publicAssetsDir, { recursive: true });
  }

  const entries = fs.readdirSync(rawDir, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) continue;

    const src = path.join(rawDir, entry.name);
    const dest = path.join(publicAssetsDir, entry.name);
    fs.copyFileSync(src, dest);
    copied++;
  }

  if (copied > 0) {
    console.log(
      `[sync-assets] Synced ${copied} asset(s) from assets/raw -> public/assets`,
    );
  }
}

syncAssets();
