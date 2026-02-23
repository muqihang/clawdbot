import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_CANONICAL_META_FIELDS = ["memory_id", "source_event_id", "status"];

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
  metrics.indexReferenceCount = linkTargets.length;

  for (const target of linkTargets) {
    const referenced = path.resolve(path.dirname(indexPath), target);
    const relativeReferenced = path.relative(params.workspaceDir, referenced);

    if (!(await exists(referenced))) {
      metrics.missingReferenceCount += 1;
      failures.push(`missing referenced file: ${target}`);
      continue;
    }

    if (!/memory\/(canonical|details?)\//i.test(relativeReferenced.replace(/\\/g, "/"))) {
      continue;
    }

    const content = await readFile(referenced, "utf8");
    const metadata = parseFrontmatter(content);

    for (const key of REQUIRED_CANONICAL_META_FIELDS) {
      if (metadata[key]) {
        continue;
      }
      metrics.missingMetadataCount += 1;
      failures.push(`canonical metadata missing (${key}): ${relativeReferenced}`);
    }
  }

  const topicFiles = await collectMarkdownFiles(path.join(params.workspaceDir, "memory", "topics"));
  for (const filePath of topicFiles) {
    const content = await readFile(filePath, "utf8");
    const metadata = parseFrontmatter(content);
    const derivedView = metadata.derived_view?.toLowerCase();
    const authoritative = metadata.authoritative?.toLowerCase();

    if (derivedView !== "true" || authoritative === "true") {
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
