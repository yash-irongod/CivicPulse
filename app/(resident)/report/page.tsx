// Resident Report Page — clean submission flow.

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
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-ink tracking-tight">
          New Report
        </h1>
        <p className="text-sm text-ink/50 mt-1">
          Take a photo, speak, or describe the issue.
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
