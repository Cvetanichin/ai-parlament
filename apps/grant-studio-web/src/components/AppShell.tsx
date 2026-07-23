import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

// One authenticated shell, four top-level sections (docs/13-Frontend §1) --
// real routes, not grant-stream-studio's AppShell.tsx tab-state pattern, so
// each section is directly linkable and the shell can grow new sections
// without restructuring. Nav is role-gated by visibility only: every
// section is shown to every role (viewer sees the same structure an owner
// does), differentiated interaction happens inside each section, not here.
const SECTIONS = [
  { to: "/grant-studio", label: "Grant Studio" },
  { to: "/project-operations", label: "Project Operations" },
  { to: "/knowledge-hub", label: "Knowledge Hub" },
  { to: "/executive-dashboard", label: "Executive Dashboard" },
];

export function AppShell() {
  const { signOut, session } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <nav className="flex items-center gap-1">
            {SECTIONS.map((section) => (
              <NavLink
                key={section.to}
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-accent text-accent-foreground",
                  )
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{session?.user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
