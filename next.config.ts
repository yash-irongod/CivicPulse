import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// Still otherwise empty at this point in the project (Task 1.1) — real
// config (image domains, headers, etc.) gets added as later tasks need
// it, not pre-guessed here. withSerwist is the one addition this task
// makes: it's what actually serves app/sw.ts under Turbopack (see
// app/serwist/[path]/route.ts and lib/pwa/register.ts for why this
// tool and not next-pwa or a plain webpack plugin).
const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
