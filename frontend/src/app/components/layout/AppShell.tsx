import { NavLink, Outlet } from "react-router";
import { useAuth } from "@/app/lib/auth";
import { supabase } from "@/app/lib/supabaseClient";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

// Frontend spec §1: "One React shell application, not four separately
// deployed frontends" — Grant Studio, Project Operations, Knowledge Hub, and
// the Executive Dashboard are top-level nav sections within this one shell.
// All four now have real routes. Executive Dashboard (§5) is read-only
// aggregation: pipeline/deadlines/cost are direct Supabase reads,
// compliance posture goes through executive-dashboard-compliance-get
// (getOrganisationComplianceOverview, complianceStudio.ts) — see
// DashboardPage.tsx for the one known gap (report due dates aren't
// modeled in this schema, so deadlines come from opportunities only).
const SECTIONS = [
  { to: "/grant-studio", label: "Grant Studio", enabled: true },
  { to: "/project-operations", label: "Project Operations", enabled: true },
  { to: "/knowledge-hub", label: "Knowledge Hub", enabled: true },
  { to: "/executive-dashboard", label: "Executive Dashboard", enabled: true },
];

export function AppShell() {
  const { role, isPlatformOperator } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Quorum Engine</span>
          <nav className="flex items-center gap-1">
            {SECTIONS.map((s) =>
              s.enabled ? (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={({ isActive }) =>
                    cn("rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent", isActive && "bg-accent")
                  }
                >
                  {s.label}
                </NavLink>
              ) : (
                <span key={s.to} className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-muted-foreground" title="Not built yet">
                  {s.label}
                </span>
              ),
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {role && <span>{role}</span>}
          {isPlatformOperator && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs">operator</span>}
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
