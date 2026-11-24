"use client";

import React, { createContext, useContext } from "react";
import type { ResolvedAssets } from "@/lib/assets/manifest";

interface CommunityShellContextValue {
  communityName: string;
  assets: ResolvedAssets;
}

const DEFAULT_ASSETS: ResolvedAssets = {
  logo: null,
  logoWordmark: null,
  heroIllustration: null,
  emptyReports: null,
  emptyNotifications: null,
  stepReport: null,
  stepAssign: null,
  stepVerify: null,
  residentWelcomePoster: null,
};

const CommunityShellContext = createContext<CommunityShellContextValue>({
  communityName: "Society",
  assets: DEFAULT_ASSETS,
});

export function CommunityShellProvider({
  communityName,
  assets,
  children,
}: {
  communityName: string;
  assets: ResolvedAssets;
  children: React.ReactNode;
}) {
  return (
    <CommunityShellContext.Provider value={{ communityName, assets }}>
      {children}
    </CommunityShellContext.Provider>
  );
}

export function useCommunityShell() {
  return useContext(CommunityShellContext);
}
