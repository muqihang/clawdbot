export type PrecisionKeyKind =
  | "error_code"
  | "ticket_id"
  | "group_id"
  | "commit_sha"
  | "endpoint_path";

export type PrecisionKeyMatch = {
  kind: PrecisionKeyKind;
  value: string;
  normalizedValue: string;
  matchStart: number;
  matchEnd: number;
};

export type QuerySignature = {
  version: "v1";
  query: string;
  normalizedQuery: string;
  precisionKey: PrecisionKeyMatch | null;
};

const ENDPOINT_PATH_PATTERN =
  /\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%\\-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%\\-]*)*/;
const COMMIT_SHA_PATTERN = /\b([a-f0-9]{7,40})\b/i;
const TICKET_ID_PATTERN = /\b([a-z][a-z0-9]{1,9}-\d{1,10})\b/i;
const HTTP_STATUS_PATTERN = /\b(?:http\s*)?([45]\d{2})\b/i;
const UPPER_SNAKE_ERROR_PATTERN = /\b([A-Z][A-Z0-9]+_[A-Z0-9_]{2,})\b/;
const GROUP_ID_PATTERN = /(?:^|\s)(-?\d{5,})(?=\s|$)/;

const normalizeString = (value: string): string => value.trim();

const createMatch = (params: {
  kind: PrecisionKeyKind;
  normalizedQuery: string;
  value: string;
  start: number;
  end: number;
}): PrecisionKeyMatch => {
  const normalizedValue = params.value.trim().toLowerCase();
  return {
    kind: params.kind,
    value: params.value,
    normalizedValue,
    matchStart: params.start,
    matchEnd: params.end,
  };
};

const matchEndpointPath = (query: string): PrecisionKeyMatch | null => {
  const match = ENDPOINT_PATH_PATTERN.exec(query);
  if (!match) {
    return null;
  }
  const value = match[0];
  return createMatch({
    kind: "endpoint_path",
    normalizedQuery: query,
    value,
    start: match.index,
    end: match.index + value.length,
  });
};

const matchCommitSha = (query: string): PrecisionKeyMatch | null => {
  const match = COMMIT_SHA_PATTERN.exec(query);
  if (!match) {
    return null;
  }
  const value = match[1];
  if (!value) {
    return null;
  }
  if (!/[a-f]/i.test(value)) {
    return null;
  }
  return createMatch({
    kind: "commit_sha",
    normalizedQuery: query,
    value,
    start: match.index,
    end: match.index + value.length,
  });
};

const matchTicketId = (query: string): PrecisionKeyMatch | null => {
  const match = TICKET_ID_PATTERN.exec(query);
  if (!match) {
    return null;
  }
  const value = match[1];
  if (!value) {
    return null;
  }
  return createMatch({
    kind: "ticket_id",
    normalizedQuery: query,
    value,
    start: match.index,
    end: match.index + value.length,
  });
};

const matchErrorCode = (query: string): PrecisionKeyMatch | null => {
  const statusMatch = HTTP_STATUS_PATTERN.exec(query);
  if (statusMatch?.[1]) {
    const value = statusMatch[1];
    const start = statusMatch.index + Math.max(0, statusMatch[0].length - value.length);
    return createMatch({
      kind: "error_code",
      normalizedQuery: query,
      value,
      start,
      end: start + value.length,
    });
  }

  const snakeMatch = UPPER_SNAKE_ERROR_PATTERN.exec(query);
  if (!snakeMatch?.[1]) {
    return null;
  }
  const value = snakeMatch[1];
  return createMatch({
    kind: "error_code",
    normalizedQuery: query,
    value,
    start: snakeMatch.index,
    end: snakeMatch.index + value.length,
  });
};

const matchGroupId = (query: string): PrecisionKeyMatch | null => {
  const match = GROUP_ID_PATTERN.exec(query);
  if (!match?.[1]) {
    return null;
  }

  const value = match[1];
  const normalizedQuery = query.trim();
  const lowered = normalizedQuery.toLowerCase();
  const hasHint =
    lowered.includes("group") ||
    lowered.includes("group_id") ||
    lowered.includes("chat") ||
    lowered.includes("thread") ||
    normalizedQuery.includes("群");
  const standalone = normalizedQuery === value;

  if (!hasHint && !standalone && value.length < 10) {
    return null;
  }

  const start = match.index + match[0].lastIndexOf(value);
  return createMatch({
    kind: "group_id",
    normalizedQuery: query,
    value,
    start,
    end: start + value.length,
  });
};

export function resolveQuerySignature(query: string): QuerySignature {
  const normalizedQuery = normalizeString(query);
  const precisionKey =
    matchEndpointPath(normalizedQuery) ??
    matchCommitSha(normalizedQuery) ??
    matchTicketId(normalizedQuery) ??
    matchErrorCode(normalizedQuery) ??
    matchGroupId(normalizedQuery);

  return {
    version: "v1",
    query,
    normalizedQuery,
    precisionKey,
  };
}
