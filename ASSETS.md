# Nivas — Asset Shotlist

Drop your generated or sourced files into **`assets/raw/`** using the exact filenames below.
Our build and dev pipeline (`scripts/sync-assets.mjs`) automatically syncs them to `public/assets/`, and Nivas also resolves them at runtime — so simply dropping a matching file into `assets/raw/` makes it live immediately, with zero broken images before or after.

**Style Register:** Editorial architectural minimalism (muted cool stone `#F4F5F2`, deep slate `#151C2C`, warm marigold `#9C6212`, deep pine `#1F6F5C`). Deliberately stylized isometric / crisp architectural illustration — never stock-photoreal, never cartoonish 3D.

---

## 01 — Brand Monogram Mark (Optional SVG)

- **Where it renders:** Navbar, Admin console sidebar, Mobile top bar, Resident portal header
- **Type & Spec:** Clean vector `SVG`, square `32x32` viewBox, monochrome (`currentColor`)
- **Save as:** `assets/raw/logo.svg`
- **Prompt / Direction:**
  > Minimal architectural monogram combining the letter N with a clean courtyard archway threshold. Flat geometric vector strokes, balanced negative space, crisp 32x32 icon grid, monochrome black `#151C2C` on transparent background. No gradients, no drop shadows, no extra text.

## 02 — Landing Hero Illustration

- **Where it renders:** Landing page hero companion visual (`aspect-[3/2]`, subtle scroll parallax)
- **Type & Spec:** `1200x800` `WebP` (q80), < 250 KB
- **Save as:** `assets/raw/hero-illustration.webp`
- **Prompt:**
  > Minimal editorial isometric illustration of a serene contemporary Indian residential apartment complex with shaded courtyard, clean pathways, terrace planters, and subtle repair care motif. Matte architectural gouache and fine ink linework. Strictly limited palette: cool off-white paper `#F4F5F2`, deep slate `#151C2C`, small warm marigold `#9C6212` and pine `#1F6F5C` accents. Calm daylight, generous negative space, no text, no watermarks, no logos, no realistic human faces.

## 03 — Empty Reports Illustration

- **Where it renders:** Resident "My Reports" empty state
- **Type & Spec:** `600x450` `WebP` (q80), < 80 KB
- **Save as:** `assets/raw/empty-reports.webp`
- **Prompt:**
  > Minimal single-weight architectural line illustration of a tidy ledger notebook resting on a courtyard bench with a small botanical leaf beside it. Background flat `#F4F5F2`, fine ink `#151C2C` lines, subtle `#1F6F5C` leaf accent. Generous negative space, no text, no watermarks.

## 04 — Empty Updates Illustration

- **Where it renders:** Resident "Updates" notifications empty state
- **Type & Spec:** `600x450` `WebP` (q80), < 80 KB
- **Save as:** `assets/raw/empty-notifications.webp`
- **Prompt:**
  > Minimal fine architectural line illustration of a quiet brass residence bell hanging cleanly above an arched doorway. Flat `#F4F5F2` background, `#151C2C` ink linework, single `#9C6212` warm marigold accent on the bell. Generous negative space, no text, no watermarks.

## 05 — Workflow Step Vignettes (Optional)

- **Where they render:** Landing page 3-step commitment sequence (only shown if supplied; crisp vector icons show cleanly otherwise)
- **Save as:**
  - `assets/raw/step-report.webp` (`400x400` WebP) — camera lens framing a society hallway light fixture in `#151C2C` & `#9C6212` on `#F4F5F2`
  - `assets/raw/step-assign.webp` (`400x400` WebP) — neat blueprint routing line connecting a block icon to a wrench mark in `#151C2C` & `#1F6F5C` on `#F4F5F2`
  - `assets/raw/step-verify.webp` (`400x400` WebP) — subtle split inspection frame showing completed repair with a pine `#1F6F5C` checkmark on `#F4F5F2`

---

## Asset Budget

```
01 logo.svg                 vector SVG         ~2 KB
02 hero-illustration.webp   1200x800 WebP    ~180 KB
03 empty-reports.webp       600x450 WebP      ~45 KB
04 empty-notifications.webp 600x450 WebP      ~45 KB
05 step vignettes (×3)      400x400 WebP     ~100 KB total
─────────────────────────────────────────────────────
Total landing weight if all present          ~372 KB
```
