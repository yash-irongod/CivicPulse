// Resident Report Page (Task 8.2, §7.4).
// Hero live viewfinder report composer with post-submission AI category confirmation.

"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { CategoryConfirm } from "@/components/resident/category-confirm";
import { ReportComposer } from "@/components/resident/report-composer";

export default function ResidentReportPage() {
  const router = useRouter();
  const [submittedIssueId, setSubmittedIssueId] = useState<string | null>(null);

  const handleSubmitted = (issueId: string) => {
    setSubmittedIssueId(issueId);
  };

  const handleConfirmed = () => {
    router.push("/my-reports");
  };

  return (
    <div className="space-y-4">
      <header className="border-b border-ink/10 pb-3">
        <h1 className="text-lg font-bold text-ink">New Report</h1>
        <p className="text-xs text-ink/70">
          Point your camera at the problem, speak, or describe in text.
        </p>
      </header>

      {!submittedIssueId ? (
        <ReportComposer onSubmitted={handleSubmitted} />
      ) : (
        <CategoryConfirm
          issueId={submittedIssueId}
          onConfirmed={handleConfirmed}
        />
      )}
    </div>
  );
}
