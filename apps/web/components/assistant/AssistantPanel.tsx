"use client";

import { useState } from "react";

import {
  applyDraft,
  briefsReady,
  emptyTaskIds,
  requestAnswer,
  requestDraft,
} from "@/lib/assistant";
import { retrievePassages } from "@/lib/graphrag";
import { useProjectStore } from "@/store/project-store";
import { useUiPreferencesStore } from "@/store/ui-preferences-store";

export function AssistantPanel() {
  const role = useUiPreferencesStore((state) => state.workspaceRole);
  const endpoint = useUiPreferencesStore((state) => state.assistantEndpoint);
  const model = useUiPreferencesStore((state) => state.assistantModel);
  const setWorkspaceRole = useUiPreferencesStore((state) => state.setWorkspaceRole);
  const graph = useProjectStore((state) => state.graph);
  const replaceGraph = useProjectStore((state) => state.replaceGraph);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const ready = briefsReady(graph.workflow.tasks);

  const build = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!endpoint.trim()) {
        throw new Error("Set the model endpoint with the gear under search.");
      }
      if (emptyTaskIds(graph).length === 0) {
        setStatus("Every task already has components. The draft was not applied.");
        return;
      }
      const draft = await requestDraft(endpoint, model, graph);
      const applied = applyDraft(useProjectStore.getState().graph, draft);
      if (applied.added === 0) {
        setStatus("Every task already has components. The draft was not applied.");
        return;
      }
      replaceGraph(applied.graph, true);
      setStatus(draft.summary);
      setWorkspaceRole("engineer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The draft could not be built.");
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    setAnswer("");
    setSources([]);
    try {
      if (!endpoint.trim()) {
        throw new Error("Set the model endpoint with the gear under search.");
      }
      const passages = await retrievePassages(graph, question);
      setSources(passages.map((passage) => passage.label));
      const response = await requestAnswer(endpoint, model, question, passages);
      setAnswer(response.answer);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex h-full flex-col gap-3 p-3" aria-label="AI assistant">
      <header>
        <h2 className="text-sm font-semibold">AI assistant</h2>
        <p className="mt-1 text-xs text-[var(--athanor-slate)]">
          The model token stays in the local vault. Set the endpoint with the gear under search.
        </p>
      </header>
      {role === "sme" ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--athanor-slate)]">
            Build an initial engineering draft from the task briefs. Tasks that already have components are left unchanged.
          </p>
          <button
            type="button"
            className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            disabled={!ready || busy}
            onClick={() => void build()}
          >
            {busy ? "Building…" : "Build draft"}
          </button>
          {!ready && (
            <p className="text-xs text-[var(--athanor-slate)]">
              Add a role and expected tasks to every task before building.
            </p>
          )}
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <label className="block text-xs font-medium" htmlFor="assistant-question">
            Ask about this deployment
          </label>
          <textarea
            id="assistant-question"
            className="min-h-24 w-full rounded border border-[var(--athanor-mist)] px-2 py-1.5 text-sm"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Which sandbox and model does this task use?"
          />
          <button
            type="submit"
            className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            disabled={busy || !question.trim()}
          >
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
      )}
      {status && <p className="text-sm">{status}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {answer && <p className="whitespace-pre-wrap text-sm">{answer}</p>}
      {sources.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--athanor-slate)]">From this project</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--athanor-slate)]">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
