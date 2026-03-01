import { createHash } from "node:crypto";
import type { P3CandidatePayload, P3OutboxEventRecord } from "./types.js";

export const ONTOLOGY_V1_MARKER_PREFIX = "OC_ONTOLOGY_V1:";

type OntologyEntityType = "Decision" | "Project" | "Reason" | "RejectedOption";

export type OntologyV1Entity = {
  type: OntologyEntityType;
  id: string;
  name: string;
  summary: string;
  source_ref: string;
  created_at: string;
  group_id: string;
  session_key: string;
};

type OntologyV1RelationType = "Decision->Project" | "Decision->Reason" | "Decision->RejectedOption";

export type OntologyV1Relation = {
  type: OntologyV1RelationType;
  from_id: string;
  to_id: string;
};

export type OntologyV1MarkerPayload = {
  version: "1";
  group_id: string;
  session_key: string;
  decision: OntologyV1Entity;
  project: OntologyV1Entity | null;
  reasons: OntologyV1Entity[];
  rejected: OntologyV1Entity[];
  relations: OntologyV1Relation[];
};

export type GraphitiOntologyV1WriteSummary = {
  decision_count: number;
  project_count: number;
  reason_count: number;
  rejected_option_count: number;
  relation_count: number;
  has_rejected_options: boolean;
};

export type GraphitiOntologyV1WriteDegradeReason =
  | "flag_disabled"
  | "sample_percent_zero"
  | "sample_skipped"
  | "no_tags"
  | "non_decision_candidate"
  | "precision_key_bucket"
  | "ontology_empty";

export type GraphitiOntologyV1WriteTrace = {
  enabled: boolean;
  sampled: boolean;
  sample_percent: number;
  active: boolean;
  ontology_summary: GraphitiOntologyV1WriteSummary;
  degrade_reason: GraphitiOntologyV1WriteDegradeReason | null;
};

export type GraphitiOntologyV1WriteOptions = {
  enabled: boolean;
  sample_percent: number;
};

export type BuildOntologyV1WriteResult = {
  marker_line: string | null;
  trace: GraphitiOntologyV1WriteTrace;
};

const DECISION_FACT_KEY_PATTERN =
  /\b(decision|rationale|reason|trade[-_ ]?off|reject(?:ed)?|why)\b/i;
const DECISION_TAG_PATTERN = /^(decision(?::|$)|decision_reason$|rationale$|reason$)/i;
const PRECISION_BUCKET_TAG_PATTERN = /^(precision_key_bucket|exact_id|bucket:exact_id)$/i;
const PROJECT_TAG_PREFIX = "project:";
const REASON_TAG_PREFIX = "reason:";
const REJECTED_TAG_PREFIX = "rejected:";

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 100;
  }
  return Math.floor(value);
};

const hashToPercentBucket = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
};

const normalizeTag = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const tag of value) {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      continue;
    }
    deduped.add(normalized);
  }
  return Array.from(deduped);
};

const stripTagPrefix = (tag: string, prefix: string): string | null => {
  if (!tag.toLowerCase().startsWith(prefix)) {
    return null;
  }
  const value = tag.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
};

const normalizeSentence = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
};

const shortHash = (value: string): string => {
  return createHash("sha1").update(value, "utf8").digest("hex").slice(0, 12);
};

const buildEntity = (params: {
  type: OntologyEntityType;
  idSeed: string;
  name: string;
  summary: string;
  sourceRef: string;
  createdAt: string;
  groupId: string;
  sessionKey: string;
}): OntologyV1Entity => {
  const normalizedName = params.name.trim() || params.summary.trim() || params.type;
  const normalizedSummary = params.summary.trim() || normalizedName;
  return {
    type: params.type,
    id: `${params.type.toLowerCase()}:${shortHash(params.idSeed)}`,
    name: normalizedName,
    summary: normalizedSummary,
    source_ref: params.sourceRef,
    created_at: params.createdAt,
    group_id: params.groupId,
    session_key: params.sessionKey,
  };
};

const ensureIsoTimestamp = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
};

const extractTagValues = (tags: string[], prefix: string): string[] => {
  const output: string[] = [];
  for (const tag of tags) {
    const value = stripTagPrefix(tag, prefix);
    if (value) {
      output.push(value);
    }
  }
  return output;
};

const createEmptySummary = (): GraphitiOntologyV1WriteSummary => {
  return {
    decision_count: 0,
    project_count: 0,
    reason_count: 0,
    rejected_option_count: 0,
    relation_count: 0,
    has_rejected_options: false,
  };
};

const summarizePayload = (
  payload: OntologyV1MarkerPayload | null,
): GraphitiOntologyV1WriteSummary => {
  if (!payload) {
    return createEmptySummary();
  }
  return {
    decision_count: payload.decision ? 1 : 0,
    project_count: payload.project ? 1 : 0,
    reason_count: payload.reasons.length,
    rejected_option_count: payload.rejected.length,
    relation_count: payload.relations.length,
    has_rejected_options: payload.rejected.length > 0,
  };
};

const buildMarkerPayload = (input: {
  event: P3OutboxEventRecord;
  payload: P3CandidatePayload;
  tags: string[];
}): OntologyV1MarkerPayload | null => {
  const candidate = input.payload.candidate;
  const createdAt = ensureIsoTimestamp(candidate.ingest_time, candidate.event_time);
  const sourceRef = input.event.source_ref;
  const groupId = input.event.session_key;
  const sessionKey = input.event.session_key;

  const decision = buildEntity({
    type: "Decision",
    idSeed: `${groupId}|${candidate.memory_id}|decision`,
    name: candidate.fact_key,
    summary: candidate.fact_value,
    sourceRef,
    createdAt,
    groupId,
    sessionKey,
  });

  const projectValue = extractTagValues(input.tags, PROJECT_TAG_PREFIX)[0] ?? null;
  const reasonValues = extractTagValues(input.tags, REASON_TAG_PREFIX);
  const rejectedValues = extractTagValues(input.tags, REJECTED_TAG_PREFIX);

  const project = projectValue
    ? buildEntity({
        type: "Project",
        idSeed: `${groupId}|project|${projectValue}`,
        name: projectValue,
        summary: projectValue,
        sourceRef,
        createdAt,
        groupId,
        sessionKey,
      })
    : null;

  const reasons = reasonValues.map((reasonValue, index) =>
    buildEntity({
      type: "Reason",
      idSeed: `${groupId}|reason|${index}|${reasonValue}`,
      name: reasonValue,
      summary: reasonValue,
      sourceRef,
      createdAt,
      groupId,
      sessionKey,
    }),
  );

  const rejected = rejectedValues.map((rejectedValue, index) =>
    buildEntity({
      type: "RejectedOption",
      idSeed: `${groupId}|rejected|${index}|${rejectedValue}`,
      name: rejectedValue,
      summary: rejectedValue,
      sourceRef,
      createdAt,
      groupId,
      sessionKey,
    }),
  );

  const relations: OntologyV1Relation[] = [];
  if (project) {
    relations.push({
      type: "Decision->Project",
      from_id: decision.id,
      to_id: project.id,
    });
  }
  for (const reason of reasons) {
    relations.push({
      type: "Decision->Reason",
      from_id: decision.id,
      to_id: reason.id,
    });
  }
  for (const rejectedOption of rejected) {
    relations.push({
      type: "Decision->RejectedOption",
      from_id: decision.id,
      to_id: rejectedOption.id,
    });
  }

  if (!project && reasons.length === 0 && rejected.length === 0) {
    return null;
  }

  return {
    version: "1",
    group_id: groupId,
    session_key: sessionKey,
    decision,
    project,
    reasons,
    rejected,
    relations,
  };
};

const isDecisionCandidate = (params: { candidateFactKey: string; tags: string[] }): boolean => {
  if (DECISION_FACT_KEY_PATTERN.test(params.candidateFactKey)) {
    return true;
  }
  return params.tags.some((tag) => DECISION_TAG_PATTERN.test(tag));
};

const hasPrecisionBucketTag = (tags: string[]): boolean => {
  return tags.some((tag) => PRECISION_BUCKET_TAG_PATTERN.test(tag.toLowerCase()));
};

export const appendOntologyMarkerLine = (content: string, markerLine: string): string => {
  const base = content.trimEnd();
  if (base.length === 0) {
    return markerLine;
  }
  return `${base}\n${markerLine}`;
};

export const buildOntologyV1WriteResult = (params: {
  event: P3OutboxEventRecord;
  payload: P3CandidatePayload;
  options: GraphitiOntologyV1WriteOptions;
}): BuildOntologyV1WriteResult => {
  const samplePercent = clampPercent(params.options.sample_percent);
  const sampleSeed = `${params.event.event_id}:${params.event.session_key}`;
  const sampled = samplePercent >= 100 || hashToPercentBucket(sampleSeed) < samplePercent;
  const tags = normalizeTags(params.payload.metadata?.tags);

  let degradeReason: GraphitiOntologyV1WriteDegradeReason | null = null;
  if (!params.options.enabled) {
    degradeReason = "flag_disabled";
  } else if (hasPrecisionBucketTag(tags)) {
    degradeReason = "precision_key_bucket";
  } else if (samplePercent <= 0) {
    degradeReason = "sample_percent_zero";
  } else if (!sampled) {
    degradeReason = "sample_skipped";
  } else if (tags.length === 0) {
    degradeReason = "no_tags";
  } else if (!isDecisionCandidate({ candidateFactKey: params.payload.candidate.fact_key, tags })) {
    degradeReason = "non_decision_candidate";
  }

  let markerPayload: OntologyV1MarkerPayload | null = null;
  if (degradeReason === null) {
    markerPayload = buildMarkerPayload({
      event: params.event,
      payload: params.payload,
      tags,
    });
    if (!markerPayload) {
      degradeReason = "ontology_empty";
    }
  }

  const markerLine = markerPayload
    ? `${ONTOLOGY_V1_MARKER_PREFIX}${JSON.stringify(markerPayload)}`
    : null;
  const ontologySummary = summarizePayload(markerPayload);
  return {
    marker_line: markerLine,
    trace: {
      enabled: params.options.enabled,
      sampled,
      sample_percent: samplePercent,
      active: markerLine !== null,
      ontology_summary: ontologySummary,
      degrade_reason: degradeReason,
    },
  };
};
