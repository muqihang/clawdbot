import type {
  P3ContextAssembleInput,
  P3ContextAssembleResult,
  P3ContextBucket,
  P3ContextRetrievalHit,
  P3ContextT1Result,
  P3ContextT2Result,
  P3ContextT3Result,
} from "./types.js";

const TEMPLATE_BUDGETS: Record<P3ContextBucket, { input: number; output: number }> = {
  exact_id: {
    input: 1800,
    output: 420,
  },
  timeline: {
    input: 2200,
    output: 560,
  },
  decision_reason: {
    input: 2400,
    output: 680,
  },
};

const ISO_TIME_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/;

const estimateTokens = (value: string): number => {
  if (value.length === 0) {
    return 0;
  }
  return Math.ceil(value.length / 4);
};

const toInputTokens = (input: P3ContextAssembleInput): number => {
  return estimateTokens(JSON.stringify(input));
};

const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(3));
};

const normalizeSnippet = (snippet: string, maxLength = 160): string => {
  if (snippet.length <= maxLength) {
    return snippet;
  }
  return `${snippet.slice(0, maxLength)}...`;
};

const sortedHits = (hits: P3ContextRetrievalHit[]): P3ContextRetrievalHit[] => {
  return [...hits].sort((left, right) => right.score - left.score);
};

const resolveT1Identity = (
  input: P3ContextAssembleInput,
): {
  resolvedId: string | null;
  resolvedType: "oc_user_id" | "oc_thread_id" | "oc_message_id" | null;
} => {
  if (input.oc_message_id) {
    return {
      resolvedId: input.oc_message_id,
      resolvedType: "oc_message_id",
    };
  }
  if (input.oc_thread_id) {
    return {
      resolvedId: input.oc_thread_id,
      resolvedType: "oc_thread_id",
    };
  }
  if (input.oc_user_id) {
    return {
      resolvedId: input.oc_user_id,
      resolvedType: "oc_user_id",
    };
  }
  return {
    resolvedId: null,
    resolvedType: null,
  };
};

const resolveTimestamp = (hit: P3ContextRetrievalHit): string | null => {
  if (hit.created_at) {
    const parsed = Date.parse(hit.created_at);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const matched = hit.snippet.match(ISO_TIME_PATTERN);
  if (!matched) {
    return null;
  }

  const parsed = Date.parse(matched[0]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

const finalizeTokenUsage = <T extends P3ContextAssembleResult>(
  result: T,
  inputTokens: number,
): T => {
  const outputTokens = estimateTokens(JSON.stringify(result));
  return {
    ...result,
    token_usage: {
      input: inputTokens,
      output: outputTokens,
    },
  };
};

const toTrimReport = (reason: string): string[] => {
  return [`degrade:${reason}`];
};

const toDegradeResult = (params: {
  templateId: "T1" | "T2" | "T3";
  reason: string;
  inputTokens: number;
}): P3ContextAssembleResult => {
  const degradeReason =
    params.reason.trim().length > 0 ? params.reason.trim() : "degrade_unspecified";

  if (params.templateId === "T1") {
    const degraded: P3ContextT1Result = {
      template_id: "T1",
      decision: "degrade",
      resolved_id: null,
      resolved_id_type: null,
      answer_text: "context assembler degraded to baseline",
      evidence: [],
      confidence: 0,
      degrade_reason: degradeReason,
      trim_report: toTrimReport(degradeReason),
      token_usage: {
        input: params.inputTokens,
        output: 0,
      },
    };
    return finalizeTokenUsage(degraded, params.inputTokens);
  }

  if (params.templateId === "T2") {
    const degraded: P3ContextT2Result = {
      template_id: "T2",
      decision: "degrade",
      timeline: [],
      answer_text: "context assembler degraded to baseline",
      coverage: {
        events_used: 0,
        events_total: 0,
      },
      confidence: 0,
      degrade_reason: degradeReason,
      trim_report: toTrimReport(degradeReason),
      token_usage: {
        input: params.inputTokens,
        output: 0,
      },
    };
    return finalizeTokenUsage(degraded, params.inputTokens);
  }

  const degraded: P3ContextT3Result = {
    template_id: "T3",
    decision: "degrade",
    claim: "",
    rationale: [],
    counter_evidence: [],
    final_recommendation: "unknown",
    answer_text: "context assembler degraded to baseline",
    confidence: 0,
    degrade_reason: degradeReason,
    trim_report: toTrimReport(degradeReason),
    token_usage: {
      input: params.inputTokens,
      output: 0,
    },
  };
  return finalizeTokenUsage(degraded, params.inputTokens);
};

const checkInputBudget = (
  input: P3ContextAssembleInput,
  templateId: "T1" | "T2" | "T3",
): { inputTokens: number; degrade: P3ContextAssembleResult | null } => {
  const inputTokens = toInputTokens(input);
  const budget = TEMPLATE_BUDGETS[input.bucket];
  if (inputTokens > budget.input) {
    return {
      inputTokens,
      degrade: toDegradeResult({
        templateId,
        reason: `input_budget_exceeded:${inputTokens}>${budget.input}`,
        inputTokens,
      }),
    };
  }
  return {
    inputTokens,
    degrade: null,
  };
};

const checkOutputBudget = (
  input: P3ContextAssembleInput,
  templateId: "T1" | "T2" | "T3",
  result: P3ContextAssembleResult,
  inputTokens: number,
): P3ContextAssembleResult => {
  const budget = TEMPLATE_BUDGETS[input.bucket];
  const outputTokens = estimateTokens(JSON.stringify(result));
  if (outputTokens > budget.output) {
    return toDegradeResult({
      templateId,
      reason: `output_budget_exceeded:${outputTokens}>${budget.output}`,
      inputTokens,
    });
  }
  return finalizeTokenUsage(result, inputTokens);
};

const assembleT1 = (input: P3ContextAssembleInput): P3ContextAssembleResult => {
  const budgetStatus = checkInputBudget(input, "T1");
  if (budgetStatus.degrade) {
    return budgetStatus.degrade;
  }

  const identity = resolveT1Identity(input);
  if (!identity.resolvedId || !identity.resolvedType) {
    return toDegradeResult({
      templateId: "T1",
      reason: "missing_identity_fields:oc_user_id|oc_thread_id|oc_message_id",
      inputTokens: budgetStatus.inputTokens,
    });
  }

  const hits = sortedHits(input.retrieval_hits);
  if (hits.length === 0) {
    return toDegradeResult({
      templateId: "T1",
      reason: "missing_retrieval_hits",
      inputTokens: budgetStatus.inputTokens,
    });
  }

  const evidence = hits.slice(0, 5).map((hit) => ({
    source_id: hit.source_id,
    snippet: normalizeSnippet(hit.snippet),
    score: hit.score,
  }));

  const answer: P3ContextT1Result = {
    template_id: "T1",
    decision: "answer",
    resolved_id: identity.resolvedId,
    resolved_id_type: identity.resolvedType,
    answer_text: `resolved ${identity.resolvedType}=${identity.resolvedId} using ${evidence[0].source_id}`,
    evidence,
    confidence: clampConfidence(Math.max(hits[0]?.score ?? 0, 0.6)),
    degrade_reason: null,
    trim_report: [],
    token_usage: {
      input: budgetStatus.inputTokens,
      output: 0,
    },
  };

  return checkOutputBudget(input, "T1", answer, budgetStatus.inputTokens);
};

const assembleT2 = (input: P3ContextAssembleInput): P3ContextAssembleResult => {
  const budgetStatus = checkInputBudget(input, "T2");
  if (budgetStatus.degrade) {
    return budgetStatus.degrade;
  }

  const events = input.retrieval_hits
    .map((hit) => {
      const timestamp = resolveTimestamp(hit);
      if (!timestamp) {
        return null;
      }
      return {
        ts: timestamp,
        event: normalizeSnippet(hit.snippet, 120),
        source_id: hit.source_id,
        score: hit.score,
      };
    })
    .filter((event): event is { ts: string; event: string; source_id: string; score: number } => {
      return event !== null;
    })
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));

  if (events.length < 2) {
    return toDegradeResult({
      templateId: "T2",
      reason: "insufficient_timeline_events",
      inputTokens: budgetStatus.inputTokens,
    });
  }

  // Keep timelines compact and deterministic for explainable degrade paths.
  const maxEvents = Number.isFinite(input.max_events)
    ? Math.max(2, Math.floor(input.max_events ?? 6))
    : 6;
  const timeline = events.slice(0, maxEvents).map(({ ts, event, source_id }) => ({
    ts,
    event,
    source_id,
  }));

  const firstEvent = timeline[0];
  const lastEvent = timeline[timeline.length - 1];
  const answer: P3ContextT2Result = {
    template_id: "T2",
    decision: "answer",
    timeline,
    answer_text: `timeline spans ${firstEvent.ts} -> ${lastEvent.ts}`,
    coverage: {
      events_used: timeline.length,
      events_total: events.length,
    },
    confidence: clampConfidence(
      timeline.reduce((sum, _, index) => sum + (events[index]?.score ?? 0), 0) / timeline.length,
    ),
    degrade_reason: null,
    trim_report: [],
    token_usage: {
      input: budgetStatus.inputTokens,
      output: 0,
    },
  };

  return checkOutputBudget(input, "T2", answer, budgetStatus.inputTokens);
};

const assembleT3 = (input: P3ContextAssembleInput): P3ContextAssembleResult => {
  const budgetStatus = checkInputBudget(input, "T3");
  if (budgetStatus.degrade) {
    return budgetStatus.degrade;
  }

  const hits = sortedHits(input.retrieval_hits).filter((hit) => hit.source_id.trim().length > 0);
  if (hits.length < 2) {
    return toDegradeResult({
      templateId: "T3",
      reason: "insufficient_decision_evidence",
      inputTokens: budgetStatus.inputTokens,
    });
  }

  const rationale = hits.slice(0, 2).map((hit) => ({
    point: normalizeSnippet(hit.snippet, 120),
    source_id: hit.source_id,
  }));

  const counterEvidence = (input.risk_flags ?? []).slice(0, 2).map((riskFlag, index) => ({
    point: normalizeSnippet(riskFlag, 120),
    source_id: hits[Math.min(index, hits.length - 1)].source_id,
  }));

  const finalRecommendation = counterEvidence.length > 0 ? "revise" : "keep";
  const answer: P3ContextT3Result = {
    template_id: "T3",
    decision: "answer",
    claim: normalizeSnippet(`decision analysis for: ${input.query_text}`, 120),
    rationale,
    counter_evidence: counterEvidence,
    final_recommendation: finalRecommendation,
    answer_text: `recommendation=${finalRecommendation}`,
    confidence: clampConfidence((hits[0].score + hits[1].score) / 2),
    degrade_reason: null,
    trim_report: [],
    token_usage: {
      input: budgetStatus.inputTokens,
      output: 0,
    },
  };

  return checkOutputBudget(input, "T3", answer, budgetStatus.inputTokens);
};

export function contextAssemble(input: P3ContextAssembleInput): P3ContextAssembleResult {
  if (input.bucket === "exact_id") {
    return assembleT1(input);
  }

  if (input.bucket === "timeline") {
    return assembleT2(input);
  }

  return assembleT3(input);
}
