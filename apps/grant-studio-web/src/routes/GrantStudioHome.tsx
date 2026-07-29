import { Route, Routes } from "react-router-dom";
import { Pipeline } from "@/routes/grant-studio/Pipeline";
import { ProposalDetail } from "@/routes/grant-studio/ProposalDetail";
import { Logframe } from "@/routes/grant-studio/Logframe";
import { Budget } from "@/routes/grant-studio/Budget";

// Grant Studio's own sub-router, nested under App.tsx's "/grant-studio/*"
// route -- Phase F onward add more sub-routes here (compliance,
// submission) without touching the top-level shell routing in App.tsx.
export function GrantStudioHome() {
  return (
    <Routes>
      <Route index element={<Pipeline />} />
      <Route path="proposals/:proposalId" element={<ProposalDetail />} />
      <Route path="proposals/:proposalId/logframe" element={<Logframe />} />
      <Route path="proposals/:proposalId/budget" element={<Budget />} />
    </Routes>
  );
}
