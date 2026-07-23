import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/routes/RequireAuth";
import { Login } from "@/routes/Login";
import { GrantStudioHome } from "@/routes/GrantStudioHome";
import { ComingSoon } from "@/routes/ComingSoon";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Navigate to="/grant-studio" replace />} />
              <Route path="/grant-studio/*" element={<GrantStudioHome />} />
              <Route path="/project-operations" element={<ComingSoon section="Project Operations" />} />
              <Route path="/knowledge-hub" element={<ComingSoon section="Knowledge Hub" />} />
              <Route path="/executive-dashboard" element={<ComingSoon section="Executive Dashboard" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
