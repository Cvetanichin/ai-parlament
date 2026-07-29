import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { fetchProposal } from "@/lib/opportunities";
import { ensureProjectForOpportunity } from "@/lib/eligibility";
import {
  fetchLogframeNarrative,
  saveLogframeNarrative,
  fetchIndicators,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  suggestIndicators,
  type InterventionObjective,
  type Indicator,
  type IndicatorInput,
} from "@/lib/logframe";

const EMPTY_INDICATOR: IndicatorInput = {
  name: "",
  level: "",
  unit: "",
  baseline: null,
  target: null,
  dataSource: "",
  collectionMethod: "",
  frequency: "",
  responsible: "",
};

function newId() {
  return crypto.randomUUID();
}

// Module 5 -- Logframe Studio (Grant Studio spec §6): an editable
// intervention-logic workspace (Theory of Change, objectives -> results ->
// activities, indicators with baselines/targets/sources of verification),
// not merely an Annex C generator. Indicators are real `indicators` rows
// (proposal_id-scoped pre-award, per spec §6.1's gap-fix); the objective
// tree lives as intervention_logic jsonb on `logframe_narratives`, since
// it's a tree, not a flat record set.
export function Logframe() {
  const { proposalId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [theoryOfChange, setTheoryOfChange] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [objectives, setObjectives] = useState<InterventionObjective[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const { data: proposal } = useQuery({
    queryKey: ["proposal", proposalId],
    queryFn: () => fetchProposal(proposalId!),
    enabled: Boolean(proposalId),
  });

  const { data: projectId } = useQuery({
    queryKey: ["project-for-opportunity", proposal?.organisationId, proposal?.opportunity.id],
    queryFn: () =>
      ensureProjectForOpportunity(proposal!.organisationId, proposal!.opportunity.id, proposal!.opportunity.title, session!.user.id),
    enabled: Boolean(proposal && session),
  });

  const { data: narrative, isLoading: narrativeLoading } = useQuery({
    queryKey: ["logframe-narrative", proposalId],
    queryFn: () => fetchLogframeNarrative(proposalId!),
    enabled: Boolean(proposalId),
  });

  useEffect(() => {
    if (narrative) {
      setTheoryOfChange(narrative.theoryOfChange);
      setAssumptions(narrative.assumptions);
      setObjectives(narrative.interventionLogic);
    }
  }, [narrative]);

  const { data: indicators = [] } = useQuery({
    queryKey: ["indicators", proposalId],
    queryFn: () => fetchIndicators(proposalId!),
    enabled: Boolean(proposalId),
  });

  const saveNarrative = useMutation({
    mutationFn: () =>
      saveLogframeNarrative(proposal!.organisationId, proposalId!, { theoryOfChange, assumptions, interventionLogic: objectives }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["logframe-narrative", proposalId] }),
  });

  const addIndicator = useMutation({
    mutationFn: () => createIndicator(proposal!.organisationId, proposalId!, EMPTY_INDICATOR),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["indicators", proposalId] }),
  });

  const saveIndicator = useMutation({
    mutationFn: (args: { id: string; input: IndicatorInput }) => updateIndicator(args.id, args.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["indicators", proposalId] }),
  });

  const removeIndicator = useMutation({
    mutationFn: (id: string) => deleteIndicator(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["indicators", proposalId] }),
  });

  const runSuggest = useMutation({
    mutationFn: () =>
      suggestIndicators(
        projectId!,
        `Suggest a set of M&E indicators (with level, unit, baseline, target, data source, collection method, frequency) for this proposal.\n\nTitle: ${proposal?.opportunity.title}\nTheory of Change: ${theoryOfChange || "(not yet written)"}`,
      ),
    onSuccess: (result) => {
      setSuggestion(result);
      setSuggestError(null);
    },
    onError: (err) => setSuggestError((err as Error).message),
  });

  const updateObjective = (objIndex: number, patch: Partial<InterventionObjective>) => {
    setObjectives((prev) => prev.map((o, i) => (i === objIndex ? { ...o, ...patch } : o)));
  };
  const addObjective = () => setObjectives((prev) => [...prev, { id: newId(), description: "", results: [] }]);
  const removeObjective = (objIndex: number) => setObjectives((prev) => prev.filter((_, i) => i !== objIndex));

  const addResult = (objIndex: number) => {
    setObjectives((prev) =>
      prev.map((o, i) => (i === objIndex ? { ...o, results: [...o.results, { id: newId(), description: "", activities: [] }] } : o)),
    );
  };
  const updateResult = (objIndex: number, resIndex: number, description: string) => {
    setObjectives((prev) =>
      prev.map((o, i) =>
        i === objIndex ? { ...o, results: o.results.map((r, j) => (j === resIndex ? { ...r, description } : r)) } : o,
      ),
    );
  };
  const removeResult = (objIndex: number, resIndex: number) => {
    setObjectives((prev) =>
      prev.map((o, i) => (i === objIndex ? { ...o, results: o.results.filter((_, j) => j !== resIndex) } : o)),
    );
  };

  const addActivity = (objIndex: number, resIndex: number) => {
    setObjectives((prev) =>
      prev.map((o, i) =>
        i === objIndex
          ? {
              ...o,
              results: o.results.map((r, j) => (j === resIndex ? { ...r, activities: [...r.activities, { id: newId(), description: "" }] } : r)),
            }
          : o,
      ),
    );
  };
  const updateActivity = (objIndex: number, resIndex: number, actIndex: number, description: string) => {
    setObjectives((prev) =>
      prev.map((o, i) =>
        i === objIndex
          ? {
              ...o,
              results: o.results.map((r, j) =>
                j === resIndex ? { ...r, activities: r.activities.map((a, k) => (k === actIndex ? { ...a, description } : a)) } : r,
              ),
            }
          : o,
      ),
    );
  };
  const removeActivity = (objIndex: number, resIndex: number, actIndex: number) => {
    setObjectives((prev) =>
      prev.map((o, i) =>
        i === objIndex
          ? {
              ...o,
              results: o.results.map((r, j) => (j === resIndex ? { ...r, activities: r.activities.filter((_, k) => k !== actIndex) } : r)),
            }
          : o,
      ),
    );
  };

  if (!proposalId) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Logframe</h1>
          <p className="text-sm text-muted-foreground">
            Theory of Change, intervention logic, and indicators -- Module 5, Grant Studio spec §6.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/grant-studio/proposals/${proposalId}`}>Back to proposal</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Theory of Change</CardTitle>
          <CardDescription>The narrative statement of how this intervention is expected to create change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="toc">Theory of Change</Label>
            <Textarea id="toc" rows={4} value={theoryOfChange} onChange={(e) => setTheoryOfChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assumptions">Assumptions and risks</Label>
            <Textarea id="assumptions" rows={3} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
          </div>
          {narrativeLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intervention Logic</CardTitle>
          <CardDescription>Objectives → Results → Activities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {objectives.map((objective, objIndex) => (
            <div key={objective.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Input
                  placeholder="Objective"
                  value={objective.description}
                  onChange={(e) => updateObjective(objIndex, { description: e.target.value })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeObjective(objIndex)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="ml-4 space-y-3 border-l pl-4">
                {objective.results.map((result, resIndex) => (
                  <div key={result.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        placeholder="Result"
                        value={result.description}
                        onChange={(e) => updateResult(objIndex, resIndex, e.target.value)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeResult(objIndex, resIndex)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="ml-4 space-y-2 border-l pl-4">
                      {result.activities.map((activity, actIndex) => (
                        <div key={activity.id} className="flex items-start gap-2">
                          <Input
                            placeholder="Activity"
                            value={activity.description}
                            onChange={(e) => updateActivity(objIndex, resIndex, actIndex, e.target.value)}
                          />
                          <Button variant="ghost" size="icon" onClick={() => removeActivity(objIndex, resIndex, actIndex)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addActivity(objIndex, resIndex)}>
                        <Plus className="mr-1 h-3 w-3" /> Activity
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addResult(objIndex)}>
                  <Plus className="mr-1 h-3 w-3" /> Result
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addObjective}>
            <Plus className="mr-1 h-3 w-3" /> Objective
          </Button>

          <div>
            <Button onClick={() => saveNarrative.mutate()} disabled={saveNarrative.isPending}>
              {saveNarrative.isPending ? "Saving…" : "Save logframe"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indicators</CardTitle>
          <CardDescription>
            Baselines, targets, and sources of verification. Each row is a real indicator that graduates into project M&E on award.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {indicators.map((indicator) => (
              <IndicatorRow
                key={indicator.id}
                indicator={indicator}
                onSave={(input) => saveIndicator.mutate({ id: indicator.id, input })}
                onDelete={() => removeIndicator.mutate(indicator.id)}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => addIndicator.mutate()} disabled={addIndicator.isPending}>
            <Plus className="mr-1 h-3 w-3" /> Add indicator
          </Button>

          <div className="space-y-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runSuggest.mutate()}
              disabled={!projectId || runSuggest.isPending}
            >
              <Sparkles className="mr-1 h-3 w-3" /> {runSuggest.isPending ? "Asking M&E Ministry…" : "Suggest indicators (AI)"}
            </Button>
            <p className="text-xs text-muted-foreground">
              A suggestion, not an auto-fill -- review it and add rows above yourself.
            </p>
            {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}
            {suggestion && (
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{suggestion}</pre>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicatorRow({
  indicator,
  onSave,
  onDelete,
}: {
  indicator: Indicator;
  onSave: (input: IndicatorInput) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<IndicatorInput>({
    name: indicator.name,
    level: indicator.level,
    unit: indicator.unit,
    baseline: indicator.baseline,
    target: indicator.target,
    dataSource: indicator.dataSource,
    collectionMethod: indicator.collectionMethod,
    frequency: indicator.frequency,
    responsible: indicator.responsible,
  });

  const field = (key: keyof IndicatorInput, placeholder: string, type: "text" | "number" = "text") => (
    <Input
      placeholder={placeholder}
      type={type}
      value={(draft[key] as string | number | null) ?? ""}
      onChange={(e) =>
        setDraft((d) => ({
          ...d,
          [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value,
        }))
      }
      onBlur={() => onSave(draft)}
    />
  );

  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-3 md:grid-cols-9">
      <div className="col-span-2 md:col-span-2">{field("name", "Indicator name")}</div>
      {field("level", "Level (outcome/output)")}
      {field("unit", "Unit")}
      {field("baseline", "Baseline", "number")}
      {field("target", "Target", "number")}
      {field("dataSource", "Data source")}
      {field("collectionMethod", "Collection method")}
      <div className="flex items-center gap-2">
        {field("frequency", "Frequency")}
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
