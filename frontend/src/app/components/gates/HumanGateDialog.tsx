import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { Badge } from "@/app/components/ui/badge";

// Frontend spec §4: "The four Human Gates plus Compliance Override recur
// across Grant Studio and Project Operations... One reusable component, not
// four bespoke implementations... This component is the frontend expression
// of Parliament Core §2.4's Gate Request record — it renders whatever that
// record contains, it does not independently decide what a gate needs to
// show." This session's real gated actions this component drives:
// compliance-override (Grant Studio §8.1, requiresJustification=true) and
// submission-package-submit (Grant Studio §10.1, the Submission Gate).
// Go/No-Go and Polish reuse this identically once Proposal Builder's earlier
// stages get their own screens.

export interface GateFinding {
  label: string;
  status: "pass" | "warning" | "fail" | "context_dependent";
  source?: string;
}

const STATUS_VARIANT: Record<GateFinding["status"], "success" | "warning" | "destructive" | "outline"> = {
  pass: "success",
  warning: "warning",
  fail: "destructive",
  context_dependent: "outline",
};

interface HumanGateDialogProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  artefact: ReactNode;
  findings?: GateFinding[];
  requiresJustification?: boolean;
  approveLabel?: string;
  onApprove: (noteOrJustification?: string) => Promise<void>;
  onReject?: (note: string) => Promise<void>;
}

export function HumanGateDialog({
  trigger,
  title,
  description,
  artefact,
  findings,
  requiresJustification = false,
  approveLabel = "Approve",
  onApprove,
  onReject,
}: HumanGateDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBlockingFinding = findings?.some((f) => f.status === "fail" || f.status === "warning") ?? false;
  const justificationRequired = requiresJustification || hasBlockingFinding;

  async function handleApprove() {
    if (justificationRequired && !note.trim()) {
      setError("A justification is required to approve against a flagged finding (Compliance Override, EAS §3.1).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onApprove(note.trim() || undefined);
      setOpen(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!note.trim()) {
      setError("A note is required when rejecting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onReject?.(note.trim());
      setOpen(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="rounded-md border border-border p-3 text-sm">{artefact}</div>

        {findings && findings.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Findings</span>
            <div className="flex flex-col gap-1.5">
              {findings.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {f.label}
                    {f.source && <span className="text-muted-foreground"> — {f.source}</span>}
                  </span>
                  <Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gate-note">
            {justificationRequired ? "Justification (required — overrides a flagged finding)" : "Note (required on rejection)"}
          </Label>
          <Textarea id="gate-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {onReject && (
            <Button variant="outline" onClick={handleReject} disabled={submitting}>
              Reject
            </Button>
          )}
          <Button onClick={handleApprove} disabled={submitting}>
            {submitting ? "Submitting…" : approveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
