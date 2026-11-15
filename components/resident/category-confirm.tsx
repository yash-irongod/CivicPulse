// Category Confirmation Component (Task 8.2, §6.7, §7.4).
// Clean, friendly category confirmation so residents understand where their report went.

"use client";

import React, { useEffect, useState } from "react";

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
      <div className="border border-ink/15 p-6 space-y-3 bg-paper">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-marigold animate-ping" />
          <h3 className="text-sm font-semibold text-ink">
            Analyzing your report...
          </h3>
        </div>
        <p className="text-xs text-ink/60">
          Identifying the right maintenance team for your issue.
        </p>
      </div>
    );
  }

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ||
    "Select Category";

  return (
    <div className="border border-ink/20 p-6 space-y-5 bg-paper shadow-sm">
      <div className="border-b border-ink/10 pb-3">
        <h2 className="text-base font-bold text-ink">Confirm Category</h2>
      </div>

      {classification?.categoryId && !showOverridePicker ? (
        <div className="space-y-4">
          <div className="p-4 border-l-4 border-l-marigold bg-marigold/[0.04] border border-ink/10 space-y-1">
            <div className="text-base font-bold text-ink">
              {classification.categoryName || selectedCategoryName}
            </div>
            {classification.reasoning && (
              <p className="text-xs text-ink/75 italic">
                &ldquo;{classification.reasoning}&rdquo;
              </p>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleConfirm}
              className="w-full py-3 bg-marigold text-on-marigold font-bold text-xs uppercase tracking-wider hover:bg-marigold/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {isConfirming
                ? "Submitting..."
                : `Confirm ${classification.categoryName || selectedCategoryName} →`}
            </button>

            <button
              type="button"
              onClick={() => setShowOverridePicker(true)}
              className="w-full py-1.5 text-xs text-ink/60 hover:text-ink text-center underline font-medium"
            >
              Choose a different category
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-ink">
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
                  className={`text-left p-3 text-xs border transition-all ${
                    isSelected
                      ? "border-marigold bg-marigold/10 font-bold text-ink border-l-4 border-l-marigold"
                      : "border-ink/15 text-ink/80 hover:border-ink/40 bg-paper"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!selectedCategoryId || isConfirming}
            onClick={handleConfirm}
            className="w-full mt-2 py-3 bg-marigold text-on-marigold font-bold text-xs uppercase tracking-wider disabled:opacity-50 hover:bg-marigold/90 transition-all shadow-sm"
          >
            {isConfirming ? "Confirming..." : `Confirm ${selectedCategoryName}`}
          </button>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {error}
        </div>
      )}
    </div>
  );
}
