import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_CANONICAL_META_RULES = [
  {
    label: "canonical_id",
    keys: ["canonical_id", "memory_id", "person_id", "project_id", "decision_id", "context_id"],
  },
  {
    label: "source_ref",
    keys: ["source_ref", "source_event_id"],
  },
  {
    label: "status",
    keys: ["status"],
  },
];

const CANONICAL_DETAIL_PATHS = [
  /^memory\/(canonical|details?)\//i,
  /^memory\/(people|projects|decisions|context)\//i,
];

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const parseMarkdownLinks = (content: string): string[] => {
  const links: string[] = [];
  const pattern = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;

  for (const match of content.matchAll(pattern)) {
    const target = match[1]?.trim();
    if (!target) {
      continue;
    }
    if (target.startsWith("http://") || target.startsWith("https://")) {
      continue;
    }
    links.push(target);
  }

  return links;
};

const parsePathEntries = (content: string): string[] => {
  const targets: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/(?:^|\|)\s*path::([^|]+)/i);
    const target = match?.[1]?.trim().replace(/^`|`$/g, "");
    if (!target) {
      continue;
    }
    if (target.startsWith("http://") || target.startsWith("https://")) {
      continue;
    }
    targets.push(target);
  }

  return targets;
};

const parseFrontmatter = (content: string): Record<string, string> => {
  if (!content.startsWith("---\n")) {
    return {};
  }

  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    return {};
  }

  const block = content.slice(4, end);
  const result: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
};

const parseMetadataSection = (content: string): Record<string, string> => {
  const lines = content.split(/\r?\n/);
  const metadataHeadingIndex = lines.findIndex((line) => /^##\s+metadata\b/i.test(line.trim()));

  if (metadataHeadingIndex < 0) {
    return {};
  }

  const metadata: Record<string, string> = {};

  for (let i = metadataHeadingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (/^##\s+/.test(line)) {
      break;
    }

    const match = line.match(/^-\s*([a-zA-Z0-9_.-]+)\s*:\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) {
      continue;
    }

    metadata[key] = value;
  }

  return metadata;
};

const parseDocumentMetadata = (content: string): Record<string, string> => {
  return {
    ...parseFrontmatter(content),
    ...parseMetadataSection(content),
  };
};

const hasAnyMetadataKey = (metadata: Record<string, string>, keys: string[]): boolean => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return true;
    }
  }
  return false;
};

const normalizeRelativePath = (value: string): string => value.replace(/\\/g, "/");

const isCanonicalDetailPath = (relativePath: string): boolean => {
  const normalized = normalizeRelativePath(relativePath);
  return CANONICAL_DETAIL_PATHS.some((pattern) => pattern.test(normalized));
};

const isContextCanonicalPath = (relativePath: string): boolean => {
  return /^memory\/context\//i.test(normalizeRelativePath(relativePath));
};

const resolveIndexTargetPath = (params: {
  target: string;
  workspaceDir: string;
  indexPath: string;
}): string => {
  const normalizedTarget = params.target.trim();
  if (path.isAbsolute(normalizedTarget)) {
    return normalizedTarget;
  }

  const normalizedSlashes = normalizeRelativePath(normalizedTarget);
  if (normalizedSlashes.startsWith("memory/")) {
    return path.resolve(params.workspaceDir, normalizedSlashes);
  }

  return path.resolve(path.dirname(params.indexPath), normalizedTarget);
};

const isDerivedTopic = (metadata: Record<string, string>): boolean => {
  const authority = metadata.authority?.toLowerCase();
  const derivedView = metadata.derived_view?.toLowerCase();

  if (authority === "derived" || authority === "derived_view" || authority === "derived-view") {
    return true;
  }

  return derivedView === "true" || derivedView === "1" || derivedView === "yes";
};

const isAuthoritativeTopic = (metadata: Record<string, string>): boolean => {
  const authority = metadata.authority?.toLowerCase();
  const authoritative = metadata.authoritative?.toLowerCase();

  if (authoritative === "true" || authoritative === "1" || authoritative === "yes") {
    return true;
  }

  return (
    authority === "authoritative" || authority === "canonical" || authority === "source_of_truth"
  );
};

const collectMarkdownFiles = async (dir: string): Promise<string[]> => {
  if (!(await exists(dir))) {
    return [];
  }

  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files;
};

export type IndexConsistencyCheckResult = {
  ok: boolean;
  failures: string[];
  metrics: {
    indexReferenceCount: number;
    missingReferenceCount: number;
    missingMetadataCount: number;
    topicRuleViolationCount: number;
  };
};

export async function runIndexConsistencyCheck(params: {
  workspaceDir: string;
  indexPath?: string;
}): Promise<IndexConsistencyCheckResult> {
  const indexPath = params.indexPath
    ? path.isAbsolute(params.indexPath)
      ? params.indexPath
      : path.join(params.workspaceDir, params.indexPath)
    : path.join(params.workspaceDir, "MEMORY.md");

  const failures: string[] = [];
  const metrics = {
    indexReferenceCount: 0,
    missingReferenceCount: 0,
    missingMetadataCount: 0,
    topicRuleViolationCount: 0,
  };

  if (!(await exists(indexPath))) {
    failures.push(`missing index file: ${path.relative(params.workspaceDir, indexPath)}`);
    return {
      ok: false,
      failures,
      metrics,
    };
  }

  const indexContent = await readFile(indexPath, "utf8");
  const linkTargets = parseMarkdownLinks(indexContent);
  const pathTargets = parsePathEntries(indexContent);
  const indexTargets = Array.from(new Set([...linkTargets, ...pathTargets]));
  metrics.indexReferenceCount = indexTargets.length;

  for (const target of indexTargets) {
    const referenced = resolveIndexTargetPath({
      target,
      workspaceDir: params.workspaceDir,
      indexPath,
    });
    const relativeReferenced = path.relative(params.workspaceDir, referenced);

    if (!(await exists(referenced))) {
      metrics.missingReferenceCount += 1;
      failures.push(`missing referenced file: ${target}`);
      continue;
    }

    if (!isCanonicalDetailPath(relativeReferenced)) {
      continue;
    }

    if (isContextCanonicalPath(relativeReferenced)) {
      continue;
    }

    const content = await readFile(referenced, "utf8");
    const metadata = parseDocumentMetadata(content);

    for (const rule of REQUIRED_CANONICAL_META_RULES) {
      if (hasAnyMetadataKey(metadata, rule.keys)) {
        continue;
      }
      metrics.missingMetadataCount += 1;
      failures.push(`canonical metadata missing (${rule.label}): ${relativeReferenced}`);
    }
  }

  const topicFiles = await collectMarkdownFiles(path.join(params.workspaceDir, "memory", "topics"));
  for (const filePath of topicFiles) {
    if (path.basename(filePath).toLowerCase() === "readme.md") {
      continue;
    }

    const content = await readFile(filePath, "utf8");
    const metadata = parseDocumentMetadata(content);

    if (!isDerivedTopic(metadata) || isAuthoritativeTopic(metadata)) {
      metrics.topicRuleViolationCount += 1;
      failures.push(
        `topic file must be derived_view and non-authoritative: ${path.relative(params.workspaceDir, filePath)}`,
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    metrics,
  };
}
