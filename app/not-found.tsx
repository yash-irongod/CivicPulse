import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink">
      <div className="max-w-md w-full">
        <EmptyState
          title="Page not found"
          description="The requested screen or incident record does not exist or has been moved."
        />
        <div className="mt-4 flex gap-4 text-xs font-medium">
          <Link
            href="/report"
            className="px-3 py-1.5 bg-ink text-paper hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-marigold"
          >
            Resident portal
          </Link>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 border border-ink/20 text-ink hover:bg-ink/5 focus:outline-none focus:ring-2 focus:ring-marigold"
          >
            Admin dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
