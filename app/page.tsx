// Nivas Landing Page (Server Entry).
// Resolves optional user assets on disk so hero/step illustrations load with zero 404s.

import React from "react";
import { getResolvedAssets } from "@/lib/assets/manifest";
import { LandingExperience } from "@/components/home/landing-experience";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const assets = getResolvedAssets();
  return <LandingExperience assets={assets} />;
}
