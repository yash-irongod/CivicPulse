import type { ReactElement } from "react";

// A plain message with a left-edge bar, the same instrument-panel idiom the
// product uses for severity (§7.2), never a rounded chip or card. Marigold
// means "needs attention"; Pine means "done". The title is always text, so
// meaning never rests on color alone (§7.7). Brick is reserved for critical
// severity and is deliberately not used for errors.

type Tone = "attention" | "success";

interface ClaimNoticeProps {
  tone: Tone;
  title: string;
  body: string;
}

export function ClaimNotice({
  tone,
  title,
  body,
}: ClaimNoticeProps): ReactElement {
  const bar = tone === "attention" ? "border-marigold" : "border-pine";
  return (
    <div
      role={tone === "attention" ? "alert" : "status"}
      className={`border-l-4 ${bar} py-1 pl-4`}
    >
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-base leading-relaxed">{body}</p>
    </div>
  );
}
