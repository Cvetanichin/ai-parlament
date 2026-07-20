import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "@/app/lib/auth";
import { RequireAuth } from "@/app/components/layout/RequireAuth";
import { AppShell } from "@/app/components/layout/AppShell";
import { LoginPage } from "@/app/routes/LoginPage";
import { SignupPage } from "@/app/routes/SignupPage";
import { ProposalListPage } from "@/app/routes/grant-studio/ProposalListPage";
import { ProposalDetailPage } from "@/app/routes/grant-studio/ProposalDetailPage";

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
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
