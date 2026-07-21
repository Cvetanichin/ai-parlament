import { useState } from "react";
import { useAuth } from "@/app/lib/auth";
import { invokeEdgeFunction, EdgeFunctionError } from "@/app/lib/edgeFunctions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

// Knowledge Hub §1.1 (Document Browser)/§1.2 (Meeting Notes Capture): both
// go through Edge Functions, not a direct Supabase read/write — search
// embeds the query and calls a similarity-search RPC (beyond plain RLS),
// and capture applies the PII filter server-side before the row is ever
// written (Frontend spec §2's rule: Edge Function calls when a rule beyond
// RLS is involved).
interface SearchResult {
  id: string;
  title: string;
  document_type: string;
  tags: string[];
  similarity: number;
}

export function KnowledgeSearchPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Knowledge Hub</h1>
      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="capture">Capture meeting notes</TabsTrigger>
        </TabsList>
        <TabsContent value="search">
          <SearchPanel />
        </TabsContent>
        <TabsContent value="capture">
          <CapturePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SearchPanel() {
  const { defaultProjectId } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim() || !defaultProjectId) return;
    setSearching(true);
    setError(null);
    try {
      const res = await invokeEdgeFunction<{ results: SearchResult[] }>("knowledge-search-run", {
        projectId: defaultProjectId,
        query,
      });
      setResults(res.results);
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Search institutional knowledge</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. lessons learned on EU visibility requirements"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {results?.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
        <div className="flex flex-col gap-2">
          {results?.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{r.title}</span>
                <div className="flex gap-1.5">
                  <Badge variant="outline">{r.document_type}</Badge>
                  {r.tags?.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{(r.similarity * 100).toFixed(0)}% match</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CapturePanel() {
  const { defaultProjectId } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [redactionCount, setRedactionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !content.trim() || !defaultProjectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await invokeEdgeFunction<{ knowledgeDocumentId: string; redactions: unknown[] }>("knowledge-document-meeting-notes-create", {
        projectId: defaultProjectId,
        title,
        content,
      });
      setRedactionCount(res.redactions.length);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof EdgeFunctionError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Capture meeting notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Notes</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Any beneficiary name mentioned here is redacted before this is saved or embedded (Security spec §4)."
            rows={6}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {redactionCount !== null && (
          <p className="text-sm text-muted-foreground">
            Saved. {redactionCount > 0 ? `${redactionCount} span(s) redacted before storage.` : "No PII spans detected."}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="w-fit">
          {saving ? "Saving…" : "Save meeting notes"}
        </Button>
      </CardContent>
    </Card>
  );
}
