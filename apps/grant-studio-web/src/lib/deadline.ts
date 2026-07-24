// Deadline helpers ported from grant-stream-studio's src/lib/deadline.ts.
// That version pinned TODAY to a fixed demo date to keep urgency colours
// stable for screenshots -- this is a real app, so TODAY is the actual
// current time.

export function daysUntil(deadline: string | null, today: Date = new Date()): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - today.getTime();
  return Math.ceil(ms / 86_400_000);
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Rolling";
  return new Date(deadline).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type DeadlineTone = "rolling" | "closed" | "critical" | "urgent" | "soon" | "open" | "upcoming";

export function deadlineTone(days: number | null): DeadlineTone {
  if (days === null) return "rolling";
  if (days < 0) return "closed";
  if (days <= 7) return "critical";
  if (days <= 14) return "urgent";
  if (days <= 30) return "soon";
  if (days <= 60) return "open";
  return "upcoming";
}

export function deadlineLabel(days: number | null): string {
  switch (deadlineTone(days)) {
    case "rolling":
      return "Rolling";
    case "closed":
      return "Closed";
    case "critical":
      return "Critical";
    case "urgent":
      return "Urgent";
    case "soon":
      return "Soon";
    case "open":
      return "Open";
    case "upcoming":
      return "Upcoming";
  }
}

// Tailwind classes mapped to the shadcn/ui default palette (grant-stream-studio's
// version referenced its own --brand/--success/--warning tokens, which this
// app's tailwind.config.js doesn't define -- ported onto the equivalent
// standard tones instead: emerald/amber/orange/destructive).
export function deadlineClasses(tone: DeadlineTone): string {
  switch (tone) {
    case "rolling":
      return "border-emerald-400/40 bg-emerald-100/60 text-emerald-800";
    case "closed":
      return "border-border bg-muted text-muted-foreground";
    case "critical":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "urgent":
      return "border-orange-400/40 bg-orange-100/60 text-orange-800";
    case "soon":
      return "border-amber-400/40 bg-amber-100/60 text-amber-800";
    case "open":
      return "border-emerald-400/40 bg-emerald-100/60 text-emerald-800";
    case "upcoming":
      return "border-sky-400/40 bg-sky-100/60 text-sky-800";
  }
}
