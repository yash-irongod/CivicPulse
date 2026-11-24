// Empty State — clean, centered, with optional illustration & fallback icon slot.
// No platitudes, no celebration copy. Just what's empty and what to do.

import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  imageSrc?: string | null;
  imageAlt?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  imageSrc,
  imageAlt,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-14 px-6 text-center rounded-2xl border border-ink/8 bg-paper/60 ${className}`}
      role="status"
    >
      {imageSrc ? (
        <div className="mb-5 w-44 h-32 flex items-center justify-center overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={imageAlt || title}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        icon && <div className="mb-4 text-ink/20">{icon}</div>
      )}
      <h3 className="text-base font-semibold text-ink tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-sm text-ink/60 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-ink text-paper rounded-xl hover:bg-ink/90 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-marigold"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
