import { Route, Routes } from "react-router-dom";
import { Pipeline } from "@/routes/grant-studio/Pipeline";
import { ProposalDetail } from "@/routes/grant-studio/ProposalDetail";

// Grant Studio's own sub-router, nested under App.tsx's "/grant-studio/*"
// route -- Phase D onward add more sub-routes here (concept note, logframe,
// budget, compliance, submission) without touching the top-level shell
// routing in App.tsx.
export function GrantStudioHome() {
  return (
    <Routes>
      <Route index element={<Pipeline />} />
      <Route path="proposals/:proposalId" element={<ProposalDetail />} />
    </Routes>
  );
}
