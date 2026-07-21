import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "@/app/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

// Frontend spec §2: RLS alone answers "can this user see this project" —
// direct Supabase client read, same pattern as ProposalListPage.tsx.
interface ProjectRow {
  id: string;
  name: string;
  donor: string | null;
  grant_reference: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

export function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("projects")
      .select("id, name, donor, grant_reference, status, start_date, end_date")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProjects(data ?? []);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Project Operations</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!projects && !error && <p className="text-muted-foreground">Loading…</p>}
      {projects?.length === 0 && <p className="text-muted-foreground">No projects yet.</p>}
      <div className="grid gap-3">
        {projects?.map((p) => (
          <Link key={p.id} to={`/project-operations/${p.id}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{p.name}</CardTitle>
                {p.status && <Badge variant="outline">{p.status}</Badge>}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {p.donor ?? "No donor recorded"}
                {p.grant_reference ? ` · ${p.grant_reference}` : ""}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
