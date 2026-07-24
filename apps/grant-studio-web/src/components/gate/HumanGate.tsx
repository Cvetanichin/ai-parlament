import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callEdgeFunction, ApiError } from "@/lib/api";
import type { GateDecision, GateDecisionResult, GateRequest } from "./types";

interface HumanGateProps {
  request: GateRequest;
  onDecided?: (decision: GateDecision, result: GateDecisionResult) => void;
}

// One reusable component for all four Human Gates (docs/13-Frontend §4) --
// Grant Studio's Go/No-Go and Polish gates, Project Ops' Submission
// Gateway gate. Not four bespoke implementations.
export function HumanGate({ request, onDecided }: HumanGateProps) {
  const [pendingDecision, setPendingDecision] = useState<GateDecision | null>(null);
  const [note, setNote] = useState("");
  const [justification, setJustification] = useState("");
  const [justificationRequired, setJustificationRequired] = useState(Boolean(request.knownOverride));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = (decision: GateDecision) => {
    setPendingDecision(decision);
    setNote("");
    setJustification("");
    setJustificationRequired(Boolean(request.knownOverride));
    setError(null);
  };

  const closeDialog = () => setPendingDecision(null);

  const submit = async () => {
    if (!pendingDecision) return;
    if (pendingDecision === "rejected" && !note.trim()) {
      setError("A note is required when rejecting.");
      return;
    }
    if (justificationRequired && !justification.trim()) {
      setError("A justification is required to override this gate.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await callEdgeFunction<GateDecisionResult>("workflow-gate-decide", {
        workflowInstanceId: request.workflowInstanceId,
        projectId: request.projectId,
        gateType: request.gateType,
        decision: pendingDecision,
        note: note.trim() || undefined,
        overrideJustification: justification.trim() || undefined,
      });
      onDecided?.(pendingDecision, result);
      closeDialog();
    } catch (err) {
      if (err instanceof ApiError && err.code === "error" && err.message.startsWith("override_justification_required")) {
        setJustificationRequired(true);
        setError("This decision overrides a flagged failure. Provide a justification to proceed.");
      } else if (err instanceof ApiError && err.code === "error" && err.message.startsWith("gate_precondition_unmet")) {
        setError("An earlier gate for this instance hasn't been decided yet.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to record the decision.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{request.title}</CardTitle>
          <CardDescription>Gate: {gateLabel(request.gateType)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>{request.artefact}</div>
          {request.supportingRecords && (
            <div className="rounded-md border bg-muted/40 p-4">{request.supportingRecords}</div>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="destructive" onClick={() => openDialog("rejected")}>
            Reject
          </Button>
          <Button onClick={() => openDialog("approved")}>Approve</Button>
        </CardFooter>
      </Card>

      <Dialog open={pendingDecision !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingDecision === "approved" ? "Approve" : "Reject"} — {gateLabel(request.gateType)}</DialogTitle>
            <DialogDescription>
              {pendingDecision === "rejected"
                ? "A note explaining the rejection is required."
                : "Confirm this approval. If it overrides a flagged failure, a justification will be required."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gate-note">Note {pendingDecision === "rejected" && "(required)"}</Label>
              <Textarea id="gate-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>

            {justificationRequired && (
              <div className="space-y-2">
                <Label htmlFor="gate-justification">Override justification (required)</Label>
                <Textarea
                  id="gate-justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function gateLabel(gateType: GateRequest["gateType"]) {
  switch (gateType) {
    case "go_no_go":
      return "Go / No-Go";
    case "polish":
      return "Polish";
    case "submission":
      return "Submission";
  }
}
