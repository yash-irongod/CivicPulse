import { createSerwistRoute } from "@serwist/turbopack";

// Next.js 15+ project (see package.json) — the `nextConfig` option
// Serwist needs for older Next versions is intentionally omitted.
//
// additionalPrecacheEntries is empty by design: there's no offline
// fallback page yet (that belongs to Phase 8.1/10.2's designed
// empty/error-state pass, not this infrastructure task) and nothing else
// needs a versioned revision string at this point, so one isn't computed.
//
// esbuildOptions.supported.destructuring works around a live esbuild
// 0.28.x regression (confirmed against evanw/esbuild#4436 and
// angular/angular-cli#33191): esbuild incorrectly decides it needs to
// "lower" object-destructured function parameters for targets that
// already support them natively (e.g. inside serwist's own dependency
// chunk and idb), then fails because it can't actually lower that pattern
// for those targets. Declaring destructuring as supported skips the
// unnecessary — and currently broken — lowering path entirely. Safe to
// remove once the fix lands upstream; verify against the current esbuild
// version before removing.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: [],
    useNativeEsbuild: true,
    esbuildOptions: {
      supported: { destructuring: true },
    },
  });
