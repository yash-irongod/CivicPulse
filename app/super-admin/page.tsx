// /super-admin — Founder Portal for Zero-SQL society setup, Chief Admin provisioning & recovery links.
// Intentionally unlinked from public landing page, resident UI, and society admin nav.

import type { Metadata } from "next";
import React from "react";

import { SuperAdminPortal } from "@/components/super-admin/portal";
import { getResolvedAssets } from "@/lib/assets/manifest";
import {
  isSuperAdminAuthenticated,
  isSuperAdminConfigured,
} from "@/lib/auth/super-admin-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nivas — Founder Console",
  robots: { index: false, follow: false },
};

export default async function SuperAdminPage() {
  const configured = isSuperAdminConfigured();
  const authenticated = configured ? await isSuperAdminAuthenticated() : false;
  const assets = getResolvedAssets();

  return (
    <SuperAdminPortal
      initialConfigured={configured}
      initialAuthenticated={authenticated}
      logoUrl={assets.logo}
    />
  );
}
