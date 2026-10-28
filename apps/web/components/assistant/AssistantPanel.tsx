"use client";

import { useState } from "react";

import {
  applyDraft,
  briefsReady,
  emptyTaskIds,
  engineeringPlans,
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
  const useToken = useUiPreferencesStore((state) => state.assistantUseToken);
  const setWorkspaceRole = useUiPreferencesStore((state) => state.setWorkspaceRole);
  const graph = useProjectStore((state) => state.graph);
  const replaceGraph = useProjectStore((state) => state.replaceGraph);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [rebuild, setRebuild] = useState(false);
  const plans = engineeringPlans(graph);
  const openIds = emptyTaskIds(graph);
  const targetIds = rebuild ? graph.workflow.tasks.map((task) => task.id) : openIds;
  const ready = briefsReady(graph.workflow.tasks);

  const build = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!endpoint.trim()) {
        throw new Error("Set the model endpoint with the gear under search.");
      }
      if (targetIds.length === 0) {
        setStatus("Choose Rebuild all tasks to replace the existing components.");
        return;
      }
      const draft = await requestDraft(endpoint, model, graph, useToken, targetIds);
      if (useProjectStore.getState().graph !== graph) {
        throw new Error("The project changed while building. Try again to use the updated brief.");
      }
      const applied = applyDraft(graph, draft, targetIds);
      if (applied.added === 0) {
        setStatus("Every task already has components. The draft was not applied.");
        return;
      }
      replaceGraph(applied.graph, true);
      setStatus(draft.summary);
      setRebuild(false);
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
      const response = await requestAnswer(endpoint, model, question, passages, useToken);
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
          Set the endpoint and optional API token with the gear under search.
        </p>
      </header>
      <div className="space-y-2">
        <p className="text-xs text-[var(--athanor-slate)]">
          Build each task into an agent stage. Task results feed the next prompts through your workflow transitions.
        </p>
        {openIds.length < graph.workflow.tasks.length && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={rebuild} disabled={busy}
              onChange={(event) => setRebuild(event.target.checked)} />
            Rebuild all tasks (replace components; Undo available)
          </label>
        )}
        {rebuild && <p className="text-xs text-[var(--athanor-slate)]">
          Existing task components and their configuration will be replaced. Task briefs and drawn transitions stay in place.
        </p>}
        <button type="button"
          className="rounded bg-[var(--athanor-ink)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
          disabled={!ready || busy || targetIds.length === 0} onClick={() => void build()}>
          {busy ? "Working…" : rebuild ? "Rebuild agent chain" : "Build agent chain"}
        </button>
        {!ready && <p className="text-xs text-[var(--athanor-slate)]">
          Add a role and expected tasks to every task before building.
        </p>}
        {ready && targetIds.length === 0 && <p className="text-xs text-[var(--athanor-slate)]">
          Every task already has components. Select Rebuild all tasks to improve this implementation.
        </p>}
      </div>
      {role !== "sme" && (
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
      {plans.length > 0 && <div className="space-y-2" aria-label="Engineering stage plans">
        <h3 className="text-sm font-semibold">Engineering stage plans</h3>
        <p className="text-xs text-[var(--athanor-slate)]">
          Rebuild after editing task briefs to refresh these plans. Review setup requirements before exporting. Run preview does not execute the models.
        </p>
        {plans.map((plan) => <details key={plan.taskId} className="rounded border border-[var(--athanor-mist)] p-2 text-xs">
          <summary className="cursor-pointer font-medium">{plan.name}</summary>
          <p className="mt-2">{plan.approach}</p>
          <p className="mt-2"><strong>Input:</strong> {plan.inputContract}</p>
          <p className="mt-2"><strong>Output:</strong> {plan.outputContract}</p>
          <p className="mt-2 font-medium">Acceptance checks</p>
          <ul className="list-disc space-y-1 pl-4">{plan.acceptanceChecks.map((check, i) => <li key={i}>{check}</li>)}</ul>
          <p className="mt-2"><strong>Connected tools:</strong> {plan.connectedTools.join(", ") || "None"}</p>
          {plan.setupRequirements.length > 0 && <>
            <p className="mt-2 font-medium">Setup requirements</p>
            <ul className="list-disc space-y-1 pl-4">{plan.setupRequirements.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </>}
        </details>)}
      </div>}
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
