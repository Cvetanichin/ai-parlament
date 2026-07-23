import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Phase B (Opportunity Pipeline) lands here next -- direct Supabase read of
// `opportunities`, ported from grant-stream-studio's PipelineTab.tsx KPI
// strip and urgency-color deadline logic.
export function GrantStudioHome() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grant Studio</CardTitle>
        <CardDescription>Opportunity Pipeline lands here in Phase B.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Shell scaffolding complete (Phase A).</CardContent>
    </Card>
  );
}
