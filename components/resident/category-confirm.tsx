// Category Confirmation Component.
// Friendly category confirmation so residents see where their report is routed.

"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Check,
  ArrowRight,
  CircleAlert,
  Loader2,
} from "@/components/shared/icons";

interface Category {
  id: string;
  name: string;
}

interface Classification {
  categoryId: string | null;
  categoryName: string | null;
  severity: string;
  confidence: number;
  reasoning: string;
  needsHumanTriage: boolean;
}

interface CategoryConfirmProps {
  issueId: string;
  incidentId?: string;
  onConfirmed: () => void;
}

export function CategoryConfirm({
  issueId,
  onConfirmed,
}: CategoryConfirmProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [classification, setClassification] = useState<Classification | null>(
    null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showOverridePicker, setShowOverridePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const catRes = await fetch("/api/categories");
        if (!catRes.ok) throw new Error("Could not load categories.");
        const catData = await catRes.json();
        const availableCategories: Category[] = catData.categories || [];
        if (!cancelled) setCategories(availableCategories);

        const classRes = await fetch(`/api/issues/${issueId}/classify`, {
          method: "POST",
        });
        if (classRes.ok) {
          const classData = await classRes.json();
          if (!cancelled && classData.classification) {
            setClassification(classData.classification);
            if (classData.classification.categoryId) {
              setSelectedCategoryId(classData.classification.categoryId);
            } else if (
              availableCategories.length > 0 &&
              availableCategories[0]
            ) {
              setSelectedCategoryId(availableCategories[0].id);
              setShowOverridePicker(true);
            }
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to classify report.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const handleConfirm = async () => {
    if (!selectedCategoryId) return;

    setIsConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/confirm-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: selectedCategoryId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to confirm category.");
      }

      onConfirmed();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error confirming category.",
      );
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-ink/10 p-6 space-y-3 bg-paper shadow-soft">
        <div className="flex items-center gap-2.5">
          <Loader2 size={16} className="text-marigold animate-spin" />
          <h3 className="text-sm font-semibold text-ink">
            Analyzing your report…
          </h3>
        </div>
        <p className="text-xs text-ink/60 leading-relaxed">
          Finding the right maintenance team for your issue.
        </p>
        <div className="h-1.5 w-full bg-ink/6 rounded-full overflow-hidden">
          <div className="h-full w-2/3 bg-marigold/50 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ||
    "Select Category";

  return (
    <div className="rounded-2xl border border-ink/10 p-6 space-y-5 bg-paper shadow-card">
      <div className="border-b border-ink/8 pb-3.5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink tracking-tight">
            Confirm Category
          </h2>
          <p className="text-xs text-ink/50 mt-0.5">
            Helps route your issue straight to the right team
          </p>
        </div>
        <Sparkles size={18} className="text-marigold shrink-0" />
      </div>

      {classification?.categoryId && !showOverridePicker ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-marigold/25 bg-marigold/[0.04] space-y-1.5">
            <div className="text-xs font-medium text-marigold">
              Suggested team
            </div>
            <div className="text-base font-bold text-ink">
              {classification.categoryName || selectedCategoryName}
            </div>
            {classification.reasoning && (
              <p className="text-xs text-ink/65 leading-relaxed">
                {classification.reasoning}
              </p>
            )}
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleConfirm}
              className="w-full py-3.5 px-4 bg-marigold text-on-marigold font-semibold text-sm rounded-xl hover:bg-marigold/90 disabled:opacity-50 transition-all active:scale-[0.99] shadow-soft flex items-center justify-center gap-2"
            >
              {isConfirming ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Confirming…</span>
                </>
              ) : (
                <>
                  <span>
                    Confirm{" "}
                    {classification.categoryName || selectedCategoryName}
                  </span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowOverridePicker(true)}
              className="w-full py-2 text-xs text-ink/60 hover:text-ink text-center font-medium rounded-xl hover:bg-ink/5 transition-colors"
            >
              Choose a different category
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-ink/75">
            Select the relevant category:
          </label>
          <div className="grid grid-cols-1 gap-2">
            {categories.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`text-left px-4 py-3 rounded-xl text-sm border transition-all flex items-center justify-between ${
                    isSelected
                      ? "border-marigold bg-marigold/10 font-semibold text-ink ring-1 ring-marigold/40"
                      : "border-ink/12 text-ink/75 hover:border-ink/30 bg-paper"
                  }`}
                >
                  <span>{cat.name}</span>
                  {isSelected && <Check size={16} className="text-marigold" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!selectedCategoryId || isConfirming}
            onClick={handleConfirm}
            className="w-full py-3.5 px-4 bg-marigold text-on-marigold font-semibold text-sm rounded-xl disabled:opacity-50 hover:bg-marigold/90 transition-all active:scale-[0.99] shadow-soft flex items-center justify-center gap-2"
          >
            {isConfirming ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Confirming…</span>
              </>
            ) : (
              <>
                <span>Confirm {selectedCategoryName}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
