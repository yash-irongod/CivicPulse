import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { MapPin } from "@/components/shared/icons";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink font-sans">
      <div className="max-w-md w-full space-y-5">
        <EmptyState
          title="Page not found"
          description="The requested screen or incident record does not exist or has moved."
          icon={<MapPin size={40} />}
        />
        <div className="flex items-center justify-center gap-3 text-sm font-medium">
          <Link
            href="/report"
            className="px-5 py-2.5 bg-ink text-paper rounded-xl hover:bg-ink/90 transition-all"
          >
            Resident portal
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 border border-ink/15 text-ink rounded-xl hover:bg-ink/5 transition-all"
          >
            Admin dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
