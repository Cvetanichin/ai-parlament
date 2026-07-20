import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/app/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

// Frontend spec §2: RLS alone answers "can this user see this row" for a
// proposal list — direct Supabase client read, no Edge Function needed.
interface ProposalRow {
  id: string;
  stage: string;
  status: string;
  version: number;
  created_at: string;
  opportunities: { title: string } | null;
}

export function ProposalListPage() {
  const [proposals, setProposals] = useState<ProposalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("proposals")
      .select("id, stage, status, version, created_at, opportunities(title)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProposals(data as unknown as ProposalRow[]);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Proposals</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!proposals && !error && <p className="text-muted-foreground">Loading…</p>}
      {proposals?.length === 0 && <p className="text-muted-foreground">No proposals yet.</p>}
      <div className="grid gap-3">
        {proposals?.map((p) => (
          <Link key={p.id} to={`/grant-studio/proposals/${p.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{p.opportunities?.title ?? "Untitled Opportunity"}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">{p.stage}</Badge>
                  <Badge variant="secondary">{p.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                v{p.version} · created {new Date(p.created_at).toLocaleDateString()}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
