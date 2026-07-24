import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Concept Note / Full Application editing lands here in Phase D -- this
// placeholder exists so "Start proposal from this call" and "Open linked
// project" (Pipeline.tsx) have a real route to land on now rather than a
// dead link.
export function ProposalPlaceholder() {
  const { proposalId } = useParams();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proposal {proposalId}</CardTitle>
        <CardDescription>Concept Note / Full Application editing lands here in Phase D.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The proposal record exists in <code>proposals</code> -- this page just doesn't render its
        content yet.
      </CardContent>
    </Card>
  );
}
