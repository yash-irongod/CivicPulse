"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { isPushNotificationSupported, subscribeToPush } from "@/lib/pwa/push";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaContextValue {
  canInstall: boolean;
  isIosSafari: boolean;
  isInstalled: boolean;
  installDismissed: boolean;
  pushSupported: boolean;
  pushConfigured: boolean;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushDismissed: boolean;
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismissInstall: () => void;
  enablePush: () => Promise<boolean>;
  dismissPush: () => void;
}

const INSTALL_DISMISSED_KEY = "nivas:pwa-install-dismissed:v1";
const PUSH_DISMISSED_KEY = "nivas:pwa-push-dismissed:v1";

const PwaContext = createContext<PwaContextValue>({
  canInstall: false,
  isIosSafari: false,
  isInstalled: false,
  installDismissed: false,
  pushSupported: false,
  pushConfigured: false,
  pushPermission: "unsupported",
  pushSubscribed: false,
  pushDismissed: false,
  triggerInstall: async () => "unavailable",
  dismissInstall: () => {},
  enablePush: async () => false,
  dismissPush: () => {},
});

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

function detectIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/.test(ua);
  const isThirdPartyBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isWebKit && !isThirdPartyBrowser;
}

export function PwaInstallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushDismissed, setPushDismissed] = useState(true);

  const pushConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    const standalone = detectStandalone();
    setIsInstalled(standalone);
    setIsIosSafari(!standalone && detectIosSafari());

    try {
      setInstallDismissed(
        window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1",
      );
      setPushDismissed(window.localStorage.getItem(PUSH_DISMISSED_KEY) === "1");
    } catch {
      setInstallDismissed(false);
      setPushDismissed(false);
    }

    const supported = isPushNotificationSupported();
    setPushSupported(supported);
    if (supported && typeof Notification !== "undefined") {
      setPushPermission(Notification.permission);
      if (
        Notification.permission === "granted" &&
        "serviceWorker" in navigator
      ) {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            if (sub) setPushSubscribed(true);
          })
          .catch(() => {});
      }
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return "unavailable" as const;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return outcome;
    } catch {
      return "unavailable" as const;
    }
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Ignore storage failures
    }
  }, []);

  const enablePush = useCallback(async () => {
    const ok = await subscribeToPush();
    if (typeof Notification !== "undefined") {
      setPushPermission(Notification.permission);
    }
    if (ok) {
      setPushSubscribed(true);
      try {
        window.localStorage.setItem(PUSH_DISMISSED_KEY, "1");
      } catch {
        // Ignore
      }
    }
    return ok;
  }, []);

  const dismissPush = useCallback(() => {
    setPushDismissed(true);
    try {
      window.localStorage.setItem(PUSH_DISMISSED_KEY, "1");
    } catch {
      // Ignore
    }
  }, []);

  return (
    <PwaContext.Provider
      value={{
        canInstall: Boolean(deferredPrompt) && !isInstalled,
        isIosSafari,
        isInstalled,
        installDismissed,
        pushSupported,
        pushConfigured,
        pushPermission,
        pushSubscribed,
        pushDismissed,
        triggerInstall,
        dismissInstall,
        enablePush,
        dismissPush,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwaInstall() {
  return useContext(PwaContext);
}
