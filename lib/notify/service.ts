// Notification Service (Task 6.1, §5, §7.6, §9).
// Dispatches notifications via in-app inbox, Web Push (PWA), and email fallback (Resend).
// Respects resident preferred_language and logs external calls safely.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import {
  renderNotification,
  type NotificationPayloadMap,
  type NotificationType,
} from "./templates";

export interface NotifyResult {
  inAppCreated: boolean;
  pushDelivered: boolean;
  emailDelivered: boolean;
}

/**
 * Send an email via Resend API or SMTP fallback.
 */
async function sendEmailFallback(params: {
  toEmail: string;
  title: string;
  body: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    logEvent("info", "notify.email_skipped_no_key", { to: "[email]" });
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Nivas <notifications@nivas.app>",
        to: params.toEmail,
        subject: params.title,
        text: params.body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Resend returned HTTP ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    logEvent("info", "notify.email_sent", { to: "[email]" });
    return true;
  } catch (error) {
    logEvent("warn", "notify.email_failed", describeError(error));
    return false;
  }
}

/**
 * Dispatch web push notification to a stored subscription endpoint.
 */
async function sendWebPush(subscription: {
  endpoint: string;
  title: string;
  body: string;
}): Promise<boolean> {
  try {
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: JSON.stringify({
        title: subscription.title,
        body: subscription.body,
        icon: "/icons/icon-192.png",
      }),
    });

    return res.ok;
  } catch (err) {
    logEvent("warn", "notify.push_network_failed", describeError(err));
    return false;
  }
}

/**
 * Single entry point for all notifications across the product.
 */
export async function notify<T extends NotificationType>(
  client: SupabaseClient,
  residentId: string,
  type: T,
  payload: NotificationPayloadMap[T],
): Promise<NotifyResult> {
  let lang: "en" | "hi" = "en";
  let communityId: string | null = null;
  let email: string | null = null;

  try {
    // 1. Fetch resident language and community
    const { data: resident } = await client
      .from("residents")
      .select("id, preferred_language, auth_user_id")
      .eq("id", residentId)
      .maybeSingle();

    if (resident?.preferred_language === "hi") {
      lang = "hi";
    }

    // Resolve primary community membership
    const { data: membership } = await client
      .from("memberships")
      .select("community_id")
      .eq("resident_id", residentId)
      .limit(1)
      .maybeSingle();

    communityId = membership?.community_id ?? null;

    if (resident?.auth_user_id) {
      const { data: authUser } = await client.auth.admin.getUserById(
        resident.auth_user_id,
      );
      if (authUser?.user?.email && !authUser.user.email.endsWith(".invalid")) {
        email = authUser.user.email;
      }
    }
  } catch (err) {
    logEvent("warn", "notify.resident_lookup_failed", describeError(err));
  }

  const { title, body } = renderNotification(type, payload, lang);

  let inAppCreated = false;
  let pushDelivered = false;
  let emailDelivered = false;

  // 2. Insert into notifications table (in-app inbox) if communityId is known
  if (communityId) {
    try {
      const { error: notifError } = await client.from("notifications").insert({
        community_id: communityId,
        resident_id: residentId,
        type,
        title,
        body,
        payload,
      });

      if (!notifError) inAppCreated = true;
    } catch (err) {
      logEvent("error", "notify.inbox_insert_failed", describeError(err));
    }
  }

  // 3. Check for Web Push subscriptions
  try {
    const { data: subs } = await client
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("resident_id", residentId);

    if (subs && subs.length > 0) {
      for (const sub of subs) {
        const sent = await sendWebPush({
          endpoint: sub.endpoint,
          title,
          body,
        });
        if (sent) pushDelivered = true;
      }
    }
  } catch (err) {
    logEvent("warn", "notify.push_check_failed", describeError(err));
  }

  // 4. Fallback to Email if Web Push wasn't delivered and resident has email
  if (!pushDelivered && email) {
    emailDelivered = await sendEmailFallback({
      toEmail: email,
      title,
      body,
    });
  }

  return {
    inAppCreated,
    pushDelivered,
    emailDelivered,
  };
}
