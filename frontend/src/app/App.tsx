import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "@/app/lib/auth";
import { RequireAuth } from "@/app/components/layout/RequireAuth";
import { AppShell } from "@/app/components/layout/AppShell";
import { LoginPage } from "@/app/routes/LoginPage";
import { SignupPage } from "@/app/routes/SignupPage";
import { ProposalListPage } from "@/app/routes/grant-studio/ProposalListPage";
import { ProposalDetailPage } from "@/app/routes/grant-studio/ProposalDetailPage";
import { ProjectListPage } from "@/app/routes/project-operations/ProjectListPage";
import { ProjectDetailPage } from "@/app/routes/project-operations/ProjectDetailPage";
import { KnowledgeSearchPage } from "@/app/routes/knowledge-hub/KnowledgeSearchPage";
import { DashboardPage } from "@/app/routes/executive-dashboard/DashboardPage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/grant-studio" replace />} />
              <Route path="/grant-studio" element={<ProposalListPage />} />
              <Route path="/grant-studio/proposals/:proposalId" element={<ProposalDetailPage />} />
              <Route path="/project-operations" element={<ProjectListPage />} />
              <Route path="/project-operations/:projectId" element={<ProjectDetailPage />} />
              <Route path="/knowledge-hub" element={<KnowledgeSearchPage />} />
              <Route path="/executive-dashboard" element={<DashboardPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
