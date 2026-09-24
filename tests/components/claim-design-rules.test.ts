import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Guards DESIGN LANGUAGE (§7) for the Task 3.1 screens. Source-level on
// purpose: these are the rules a future edit is most likely to break quietly.

const FILES = [
  "components/resident/claim-form.tsx",
  "components/resident/claim-notice.tsx",
  "components/resident/language-switch.tsx",
  "app/auth/claim/page.tsx",
  "app/auth/claim/done/page.tsx",
];

// Comments may legitimately name a banned thing while explaining why it is
// banned, so only code is checked: full-line // comments and /* */ blocks
// (including JSX {/* */}) are dropped first.
function source(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe.each(FILES)("%s", (file) => {
  const text = source(file);

  it("applies no letter-spacing utility (breaks the Devanagari shirorekha)", () => {
    expect(text).not.toMatch(/\btracking-/);
  });

  it("uses no all-caps transform (no Devanagari equivalent)", () => {
    expect(text).not.toMatch(/\buppercase\b/);
  });

  it("has no raw hex colour and no font-family string (tokens only)", () => {
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(text).not.toMatch(/font-\[|fontFamily/);
  });

  it("uses Brick nowhere (critical severity only)", () => {
    expect(text).not.toMatch(/\b(?:bg|text|border|outline)-brick\b/);
  });

  it("uses no rounded card, shadow or entrance animation", () => {
    expect(text).not.toMatch(/\brounded/);
    expect(text).not.toMatch(/\bshadow/);
    expect(text).not.toMatch(/\b(?:animate|transition)-?/);
  });

  it("uses no middot-joined strings or arrow-suffixed labels", () => {
    expect(text).not.toMatch(/ · /);
    expect(text).not.toMatch(/[→›»]/);
  });
});

describe("filled controls", () => {
  it("pair every Marigold fill with the on-marigold text token", () => {
    for (const file of FILES) {
      const text = source(file);
      const fills = text.match(/bg-marigold/g)?.length ?? 0;
      const pairs = text.match(/text-on-marigold/g)?.length ?? 0;
      expect(pairs).toBeGreaterThanOrEqual(fills);
    }
  });
});
