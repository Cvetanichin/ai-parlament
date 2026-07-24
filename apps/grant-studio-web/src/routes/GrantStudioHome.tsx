import { Route, Routes } from "react-router-dom";
import { Pipeline } from "@/routes/grant-studio/Pipeline";
import { ProposalPlaceholder } from "@/routes/grant-studio/ProposalPlaceholder";

// Grant Studio's own sub-router, nested under App.tsx's "/grant-studio/*"
// route -- Phase C onward add more sub-routes here (eligibility, concept
// note, logframe, budget, compliance, submission) without touching the
// top-level shell routing in App.tsx.
export function GrantStudioHome() {
  return (
    <Routes>
      <Route index element={<Pipeline />} />
      <Route path="proposals/:proposalId" element={<ProposalPlaceholder />} />
    </Routes>
  );
}
