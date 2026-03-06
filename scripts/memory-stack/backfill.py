#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import random
import re
import socket
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PHASES: tuple[str, ...] = ("canonical", "topics", "daily")
TIER_BY_PHASE = {
    "canonical": "canonical",
    "topics": "topic_derived",
    "daily": "daily_log",
}
TIER_RANK = {
    "canonical": 0,
    "topic_derived": 1,
    "daily_log": 2,
}

DEFAULT_SOURCE_SYSTEM = {
    "canonical": "local_p15_lite",
    "topic_derived": "local_topic_digest",
    "daily_log": "local_daily_log",
}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
BULLET_META_RE = re.compile(r"^\s*-\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$")
DAILY_FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


@dataclass(frozen=True)
class ChunkRecord:
    chunk_id: str
    semantic_key: str
    source_path: str
    heading: str
    text: str
    phase: str
    source_tier: str
    source_system: str
    source_ref: str
    event_time: str
    ingest_time: str
    canonical_guarded: bool


@dataclass
class TargetResult:
    status: str
    retries: int = 0
    error: str | None = None


@dataclass
class ProcessResult:
    record: ChunkRecord
    mem0: TargetResult
    graphiti: TargetResult


@dataclass
class HttpCallError(Exception):
    message: str
    status_code: int | None
    response_body: str
    retryable: bool

    def __str__(self) -> str:
        status = self.status_code if self.status_code is not None else "n/a"
        body_excerpt = self.response_body[:240].replace("\n", " ")
        return f"status={status} retryable={self.retryable} message={self.message} body={body_excerpt}"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def chunk_id(source_path: str, heading: str, chunk_text: str) -> str:
    normalized_chunk_text = normalize_text(chunk_text)
    digest_src = f"{source_path}\n{heading}\n{normalized_chunk_text}".encode("utf-8")
    return hashlib.sha256(digest_src).hexdigest()


def semantic_key(source_ref: str, heading: str, chunk_text: str) -> str:
    source_ref_clean = normalize_text(source_ref).lower()
    if source_ref_clean and source_ref_clean != "none":
        digest_src = f"source_ref::{source_ref_clean}".encode("utf-8")
        return hashlib.sha256(digest_src).hexdigest()

    normalized_heading = normalize_text(heading).lower()
    normalized_text = normalize_text(chunk_text).lower()
    digest_src = f"fallback::{normalized_heading}::{normalized_text[:280]}".encode("utf-8")
    return hashlib.sha256(digest_src).hexdigest()


def apply_semantic_owner(state: dict[str, Any], key: str, source_tier: str, new_chunk_id: str) -> bool:
    owners = state.setdefault("semantic_owner", {})
    current_owner = owners.get(key)
    if current_owner is None:
        owners[key] = {"source_tier": source_tier, "chunk_id": new_chunk_id}
        return True

    current_rank = TIER_RANK.get(current_owner.get("source_tier", "daily_log"), 999)
    next_rank = TIER_RANK.get(source_tier, 999)
    if next_rank < current_rank:
        owners[key] = {"source_tier": source_tier, "chunk_id": new_chunk_id}
        return True

    return False


def split_section_by_size(section_text: str, max_chars: int) -> list[str]:
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", section_text.strip()) if item.strip()]
    if not paragraphs:
        return []

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in paragraphs:
        para_len = len(paragraph)
        if current and current_len + para_len + 2 > max_chars:
            chunks.append("\n\n".join(current).strip())
            current = [paragraph]
            current_len = para_len
        else:
            current.append(paragraph)
            current_len += para_len + (2 if current_len else 0)

    if current:
        chunks.append("\n\n".join(current).strip())

    return chunks


def chunk_markdown(source_path: str, content: str, max_chars: int = 1200) -> list[dict[str, str]]:
    del source_path

    sections: list[tuple[str, str]] = []
    heading_stack: list[str] = []
    current_heading = "Document"
    current_lines: list[str] = []

    def flush_current() -> None:
        text = "\n".join(current_lines).strip()
        if text:
            sections.append((current_heading, text))
        current_lines.clear()

    for line in content.splitlines():
        heading_match = HEADING_RE.match(line)
        if heading_match:
            flush_current()
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            heading_stack[:] = heading_stack[: max(level - 1, 0)]
            heading_stack.append(title)
            current_heading = " / ".join(heading_stack)
            continue

        current_lines.append(line)

    flush_current()

    if not sections and content.strip():
        sections = [("Document", content.strip())]

    chunked: list[dict[str, str]] = []
    for heading, section_text in sections:
        split_chunks = split_section_by_size(section_text, max_chars=max_chars)
        if not split_chunks:
            continue
        for index, chunk_text in enumerate(split_chunks, start=1):
            effective_heading = heading if len(split_chunks) == 1 else f"{heading} (part {index})"
            chunked.append({"heading": effective_heading, "text": chunk_text})

    return chunked


def collect_phase_files(source_root: Path, phase: str, days: int) -> list[Path]:
    root = source_root.resolve()
    if phase == "canonical":
        discovered: list[Path] = []
        index_file = root / "MEMORY.md"
        if index_file.is_file():
            discovered.append(index_file)

        for glob_pattern in (
            "memory/people/**/*.md",
            "memory/projects/**/*.md",
            "memory/decisions/**/*.md",
            "memory/context/**/*.md",
        ):
            discovered.extend(path for path in root.glob(glob_pattern) if path.is_file())

        return sorted({path.resolve() for path in discovered}, key=lambda item: str(item))

    if phase == "topics":
        return sorted(
            {path.resolve() for path in root.glob("memory/topics/**/*.md") if path.is_file()},
            key=lambda item: str(item),
        )

    if phase == "daily":
        lower_bound = date.today() - timedelta(days=max(days, 1) - 1)
        daily_files: list[tuple[date, Path]] = []
        for path in root.glob("memory/*.md"):
            if not path.is_file():
                continue
            match = DAILY_FILE_RE.match(path.name)
            if not match:
                continue
            file_date = date.fromisoformat(match.group(1))
            if file_date < lower_bound:
                continue
            if file_date > date.today():
                continue
            daily_files.append((file_date, path.resolve()))

        daily_files.sort(key=lambda item: (item[0], str(item[1])))
        return [path for _, path in daily_files]

    raise ValueError(f"unsupported phase: {phase}")


def extract_file_metadata(content: str) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for line in content.splitlines():
        match = BULLET_META_RE.match(line)
        if not match:
            continue
        key = match.group(1).strip().lower()
        value = match.group(2).strip()
        if key and value and key not in metadata:
            metadata[key] = value
    return metadata


def normalize_event_time(value: str) -> str:
    candidate = value.strip()
    if candidate.endswith("Z"):
        parser_input = candidate.replace("Z", "+00:00")
    else:
        parser_input = candidate
    parsed = datetime.fromisoformat(parser_input)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.replace(microsecond=0).isoformat()


def derive_default_event_time(source_path: Path) -> str:
    match = DAILY_FILE_RE.match(source_path.name)
    if match:
        day = date.fromisoformat(match.group(1))
        return f"{day.isoformat()}T00:00:00+08:00"

    mtime = datetime.fromtimestamp(source_path.stat().st_mtime, tz=timezone.utc)
    return mtime.replace(microsecond=0).isoformat()


def build_file_records(
    source_root: Path,
    source_path: Path,
    phase: str,
    ingest_time: str,
    semantic_owners: dict[str, dict[str, str]],
) -> list[ChunkRecord]:
    source_tier = TIER_BY_PHASE[phase]
    content = source_path.read_text(encoding="utf-8")
    relative_source_path = source_path.resolve().relative_to(source_root.resolve()).as_posix()

    file_meta = extract_file_metadata(content)
    source_system = file_meta.get("source_system") or DEFAULT_SOURCE_SYSTEM[source_tier]
    source_ref = file_meta.get("source_ref") or relative_source_path

    try:
        event_time = normalize_event_time(file_meta.get("event_time", ""))
    except Exception:
        event_time = derive_default_event_time(source_path)

    records: list[ChunkRecord] = []
    for part in chunk_markdown(relative_source_path, content):
        chunk_text = part["text"].strip()
        if not chunk_text:
            continue
        heading = part["heading"]
        deterministic_id = chunk_id(relative_source_path, heading, chunk_text)
        key = semantic_key(source_ref, heading, chunk_text)
        existing_owner = semantic_owners.get(key)
        canonical_guarded = bool(
            source_tier != "canonical"
            and existing_owner
            and existing_owner.get("source_tier") == "canonical"
        )

        records.append(
            ChunkRecord(
                chunk_id=deterministic_id,
                semantic_key=key,
                source_path=relative_source_path,
                heading=heading,
                text=chunk_text,
                phase=phase,
                source_tier=source_tier,
                source_system=source_system,
                source_ref=source_ref,
                event_time=event_time,
                ingest_time=ingest_time,
                canonical_guarded=canonical_guarded,
            )
        )

    return records


def build_mem0_payload(record: ChunkRecord, mem0_user_id: str, run_id: str) -> dict[str, Any]:
    return {
        "messages": [{"role": "user", "content": record.text}],
        "user_id": mem0_user_id,
        "run_id": run_id,
        "metadata": {
            "deterministic_id": record.chunk_id,
            "semantic_key": record.semantic_key,
            "source_path": record.source_path,
            "heading": record.heading,
            "phase": record.phase,
            "source_tier": record.source_tier,
            "source_system": record.source_system,
            "source_ref": record.source_ref,
            "event_time": record.event_time,
            "ingest_time": record.ingest_time,
            "canonical_guarded": record.canonical_guarded,
        },
    }


def build_graphiti_payload(record: ChunkRecord, graphiti_group_prefix: str) -> dict[str, Any]:
    group_id = f"{graphiti_group_prefix}-{record.phase}"
    content = (
        f"[backfill:{record.phase}]\n"
        f"deterministic_id: {record.chunk_id}\n"
        f"semantic_key: {record.semantic_key}\n"
        f"source_tier: {record.source_tier}\n"
        f"source_system: {record.source_system}\n"
        f"source_ref: {record.source_ref}\n"
        f"source_path: {record.source_path}\n"
        f"heading: {record.heading}\n"
        f"event_time: {record.event_time}\n"
        f"ingest_time: {record.ingest_time}\n"
        f"canonical_guarded: {str(record.canonical_guarded).lower()}\n\n"
        f"{record.text}"
    )
    return {
        "group_id": group_id,
        "messages": [
            {
                "content": content,
                "role_type": "user",
                "role": "user",
                "timestamp": record.event_time,
            }
        ],
    }


def request_json(method: str, url: str, payload: dict[str, Any], timeout_s: float) -> dict[str, Any]:
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=payload_bytes,
        method=method,
        headers={"content-type": "application/json"},
    )

    try:
        with urlopen(request, timeout=timeout_s) as response:
            raw_body = response.read().decode("utf-8", "replace")
            if not raw_body.strip():
                return {}
            try:
                return json.loads(raw_body)
            except json.JSONDecodeError:
                return {"raw": raw_body}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        retryable = exc.code == 429 or exc.code >= 500
        raise HttpCallError(
            message=f"HTTPError {exc.code} {exc.reason}",
            status_code=exc.code,
            response_body=body,
            retryable=retryable,
        ) from exc
    except (TimeoutError, socket.timeout) as exc:
        raise HttpCallError(
            message=str(exc),
            status_code=None,
            response_body="",
            retryable=True,
        ) from exc
    except URLError as exc:
        raise HttpCallError(
            message=str(exc.reason),
            status_code=None,
            response_body="",
            retryable=True,
        ) from exc


async def request_json_with_retry(
    method: str,
    url: str,
    payload: dict[str, Any],
    timeout_s: float,
    max_attempts: int,
    backoff_base_s: float,
    backoff_max_s: float,
) -> tuple[dict[str, Any], int]:
    retries_used = 0
    attempt = 1
    while True:
        try:
            response_json = await asyncio.to_thread(request_json, method, url, payload, timeout_s)
            return response_json, retries_used
        except HttpCallError:
            error = sys.exc_info()[1]
            assert isinstance(error, HttpCallError)
            should_retry = error.retryable and attempt < max_attempts
            if not should_retry:
                raise

            retries_used += 1
            sleep_seconds = min(backoff_max_s, backoff_base_s * (2 ** (attempt - 1)))
            sleep_seconds += random.uniform(0, max(backoff_base_s, 0.1))
            await asyncio.sleep(sleep_seconds)
            attempt += 1


def default_state() -> dict[str, Any]:
    now = utc_now_iso()
    return {
        "version": 1,
        "created_at": now,
        "updated_at": now,
        "targets": {
            "mem0": {},
            "graphiti": {},
        },
        "semantic_owner": {},
    }


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        state = default_state()
        save_state(path, state)
        return state

    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        loaded = default_state()

    loaded.setdefault("version", 1)
    loaded.setdefault("created_at", utc_now_iso())
    loaded.setdefault("updated_at", utc_now_iso())
    loaded.setdefault("targets", {})
    loaded["targets"].setdefault("mem0", {})
    loaded["targets"].setdefault("graphiti", {})
    loaded.setdefault("semantic_owner", {})
    return loaded


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now_iso()
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    tmp_path.replace(path)


def init_phase_metrics(phase: str, file_count: int, chunk_count: int) -> dict[str, Any]:
    return {
        "phase": phase,
        "source_tier": TIER_BY_PHASE[phase],
        "files": file_count,
        "chunks": chunk_count,
        "reconciliation": {
            "canonical_guarded_chunks": 0,
            "semantic_owner_updates": 0,
        },
        "mem0": {
            "planned": 0,
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "retried": 0,
            "skipped_existing": 0,
        },
        "graphiti": {
            "planned": 0,
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "retried": 0,
            "skipped_existing": 0,
        },
    }


def update_target_metrics(phase_metrics: dict[str, Any], target: str, result: TargetResult) -> None:
    target_metrics = phase_metrics[target]
    if result.status == "skipped_disabled":
        return
    if result.status == "dry_run_pending":
        target_metrics["planned"] += 1
        return
    if result.status == "skipped_existing":
        target_metrics["skipped_existing"] += 1
        return
    target_metrics["attempted"] += 1
    target_metrics["retried"] += result.retries
    if result.status == "success":
        target_metrics["succeeded"] += 1
        return
    target_metrics["failed"] += 1


def write_audit_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        handle.write("\n")


async def process_record(
    record: ChunkRecord,
    mode: str,
    targets: set[str],
    mem0_done: dict[str, Any],
    graphiti_done: dict[str, Any],
    mem0_url: str,
    graphiti_url: str,
    mem0_user_id: str,
    graphiti_group_prefix: str,
    run_id: str,
    timeout_s: float,
    max_attempts: int,
    backoff_base_s: float,
    backoff_max_s: float,
) -> ProcessResult:
    mem0_enabled = "mem0" in targets
    graphiti_enabled = "graphiti" in targets

    mem0_already_done = record.chunk_id in mem0_done
    graphiti_already_done = record.chunk_id in graphiti_done

    if mode == "dry-run":
        mem0_status = (
            ("skipped_existing" if mem0_already_done else "dry_run_pending")
            if mem0_enabled
            else "skipped_disabled"
        )
        graphiti_status = (
            ("skipped_existing" if graphiti_already_done else "dry_run_pending")
            if graphiti_enabled
            else "skipped_disabled"
        )
        return ProcessResult(record, TargetResult(mem0_status), TargetResult(graphiti_status))

    mem0_result = TargetResult("skipped_disabled" if not mem0_enabled else "skipped_existing")
    if mem0_enabled and not mem0_already_done:
        try:
            _, retries = await request_json_with_retry(
                method="POST",
                url=f"{mem0_url}/memories",
                payload=build_mem0_payload(record, mem0_user_id=mem0_user_id, run_id=run_id),
                timeout_s=timeout_s,
                max_attempts=max_attempts,
                backoff_base_s=backoff_base_s,
                backoff_max_s=backoff_max_s,
            )
            mem0_result = TargetResult(status="success", retries=retries)
        except HttpCallError as error:
            mem0_result = TargetResult(status="failed", retries=max_attempts - 1, error=str(error))

    graphiti_result = TargetResult(
        "skipped_disabled" if not graphiti_enabled else "skipped_existing"
    )
    if graphiti_enabled and not graphiti_already_done:
        try:
            _, retries = await request_json_with_retry(
                method="POST",
                url=f"{graphiti_url}/messages",
                payload=build_graphiti_payload(record, graphiti_group_prefix=graphiti_group_prefix),
                timeout_s=timeout_s,
                max_attempts=max_attempts,
                backoff_base_s=backoff_base_s,
                backoff_max_s=backoff_max_s,
            )
            graphiti_result = TargetResult(status="success", retries=retries)
        except HttpCallError as error:
            graphiti_result = TargetResult(status="failed", retries=max_attempts - 1, error=str(error))

    return ProcessResult(record, mem0=mem0_result, graphiti=graphiti_result)


async def run_phase(
    phase: str,
    source_root: Path,
    state: dict[str, Any],
    mode: str,
    targets: set[str],
    days: int,
    concurrency: int,
    mem0_url: str,
    graphiti_url: str,
    mem0_user_id: str,
    graphiti_group_prefix: str,
    run_id: str,
    timeout_s: float,
    max_attempts: int,
    backoff_base_s: float,
    backoff_max_s: float,
    state_file: Path,
    audit_file: Path,
    ingest_time: str,
) -> dict[str, Any]:
    discovered_files = collect_phase_files(source_root, phase, days)

    semantic_owners = state.setdefault("semantic_owner", {})
    records: list[ChunkRecord] = []
    for source_path in discovered_files:
        records.extend(
            build_file_records(
                source_root=source_root,
                source_path=source_path,
                phase=phase,
                ingest_time=ingest_time,
                semantic_owners=semantic_owners,
            )
        )

    deduped_records: list[ChunkRecord] = []
    seen_chunk_ids: set[str] = set()
    duplicate_chunk_ids = 0
    for record in records:
        if record.chunk_id in seen_chunk_ids:
            duplicate_chunk_ids += 1
            continue
        seen_chunk_ids.add(record.chunk_id)
        deduped_records.append(record)

    phase_metrics = init_phase_metrics(phase, file_count=len(discovered_files), chunk_count=len(deduped_records))
    phase_metrics["duplicate_chunk_ids"] = duplicate_chunk_ids

    semaphore = asyncio.Semaphore(max(concurrency, 1))

    async def run_one(record: ChunkRecord) -> ProcessResult:
        async with semaphore:
            return await process_record(
                record=record,
                mode=mode,
                targets=targets,
                mem0_done=state["targets"]["mem0"],
                graphiti_done=state["targets"]["graphiti"],
                mem0_url=mem0_url,
                graphiti_url=graphiti_url,
                mem0_user_id=mem0_user_id,
                graphiti_group_prefix=graphiti_group_prefix,
                run_id=run_id,
                timeout_s=timeout_s,
                max_attempts=max_attempts,
                backoff_base_s=backoff_base_s,
                backoff_max_s=backoff_max_s,
            )

    tasks = [asyncio.create_task(run_one(record)) for record in deduped_records]
    for completed in asyncio.as_completed(tasks):
        result = await completed
        update_target_metrics(phase_metrics, "mem0", result.mem0)
        update_target_metrics(phase_metrics, "graphiti", result.graphiti)

        if result.record.canonical_guarded:
            phase_metrics["reconciliation"]["canonical_guarded_chunks"] += 1

        if result.mem0.status != "skipped_disabled":
            write_audit_line(
                audit_file,
                {
                    "timestamp": utc_now_iso(),
                    "run_id": run_id,
                    "phase": phase,
                    "target": "mem0",
                    "status": result.mem0.status,
                    "retries": result.mem0.retries,
                    "error": result.mem0.error,
                    "chunk_id": result.record.chunk_id,
                    "semantic_key": result.record.semantic_key,
                    "source_tier": result.record.source_tier,
                    "source_system": result.record.source_system,
                    "source_ref": result.record.source_ref,
                    "source_path": result.record.source_path,
                    "heading": result.record.heading,
                    "event_time": result.record.event_time,
                    "ingest_time": result.record.ingest_time,
                    "canonical_guarded": result.record.canonical_guarded,
                },
            )
        if result.graphiti.status != "skipped_disabled":
            write_audit_line(
                audit_file,
                {
                    "timestamp": utc_now_iso(),
                    "run_id": run_id,
                    "phase": phase,
                    "target": "graphiti",
                    "status": result.graphiti.status,
                    "retries": result.graphiti.retries,
                    "error": result.graphiti.error,
                    "chunk_id": result.record.chunk_id,
                    "semantic_key": result.record.semantic_key,
                    "source_tier": result.record.source_tier,
                    "source_system": result.record.source_system,
                    "source_ref": result.record.source_ref,
                    "source_path": result.record.source_path,
                    "heading": result.record.heading,
                    "event_time": result.record.event_time,
                    "ingest_time": result.record.ingest_time,
                    "canonical_guarded": result.record.canonical_guarded,
                },
            )

        if mode == "apply":
            state_updated = False
            if result.mem0.status == "success":
                state["targets"]["mem0"][result.record.chunk_id] = {
                    "phase": phase,
                    "source_tier": result.record.source_tier,
                    "at": utc_now_iso(),
                }
                state_updated = True
            if result.graphiti.status == "success":
                state["targets"]["graphiti"][result.record.chunk_id] = {
                    "phase": phase,
                    "source_tier": result.record.source_tier,
                    "at": utc_now_iso(),
                }
                state_updated = True

            if result.mem0.status == "success" or result.graphiti.status == "success":
                owner_changed = apply_semantic_owner(
                    state,
                    key=result.record.semantic_key,
                    source_tier=result.record.source_tier,
                    new_chunk_id=result.record.chunk_id,
                )
                if owner_changed:
                    phase_metrics["reconciliation"]["semantic_owner_updates"] += 1
                    state_updated = True

            if state_updated:
                save_state(state_file, state)

    return phase_metrics


def summarize_totals(phases: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, Any] = {
        "files": 0,
        "chunks": 0,
        "duplicate_chunk_ids": 0,
        "mem0": {"planned": 0, "attempted": 0, "succeeded": 0, "failed": 0, "retried": 0, "skipped_existing": 0},
        "graphiti": {"planned": 0, "attempted": 0, "succeeded": 0, "failed": 0, "retried": 0, "skipped_existing": 0},
        "reconciliation": {"canonical_guarded_chunks": 0, "semantic_owner_updates": 0},
    }

    for phase in phases:
        totals["files"] += phase["files"]
        totals["chunks"] += phase["chunks"]
        totals["duplicate_chunk_ids"] += phase.get("duplicate_chunk_ids", 0)
        for target in ("mem0", "graphiti"):
            for key in ("planned", "attempted", "succeeded", "failed", "retried", "skipped_existing"):
                totals[target][key] += phase[target][key]
        totals["reconciliation"]["canonical_guarded_chunks"] += phase["reconciliation"]["canonical_guarded_chunks"]
        totals["reconciliation"]["semantic_owner_updates"] += phase["reconciliation"]["semantic_owner_updates"]

    return totals


async def run(args: argparse.Namespace) -> int:
    source_root = Path(args.source_root).expanduser().resolve()
    if not source_root.is_dir():
        print(f"[backfill] ERROR: source root not found: {source_root}", file=sys.stderr)
        return 2

    if args.phase == "all":
        phase_order = list(PHASES)
    else:
        phase_order = [args.phase]

    mode = "apply" if args.apply else "dry-run"
    run_id = datetime.now(timezone.utc).strftime("backfill-%Y%m%dT%H%M%SZ")
    ingest_time = utc_now_iso()

    targets = set(args.targets)
    if not targets:
        print("[backfill] ERROR: --targets must include at least one of: mem0, graphiti", file=sys.stderr)
        return 2

    state_file = Path(args.state_file).expanduser()
    summary_dir = Path(args.summary_dir).expanduser()
    summary_dir.mkdir(parents=True, exist_ok=True)
    audit_file = Path(args.audit_file).expanduser() if args.audit_file else summary_dir / f"{run_id}.audit.jsonl"
    summary_file = summary_dir / f"{run_id}.summary.json"

    state = load_state(state_file)

    phase_summaries: list[dict[str, Any]] = []
    for phase in phase_order:
        summary = await run_phase(
            phase=phase,
            source_root=source_root,
            state=state,
            mode=mode,
            targets=targets,
            days=args.days,
            concurrency=args.concurrency,
            mem0_url=args.mem0_url.rstrip("/"),
            graphiti_url=args.graphiti_url.rstrip("/"),
            mem0_user_id=args.mem0_user_id,
            graphiti_group_prefix=args.graphiti_group_prefix,
            run_id=run_id,
            timeout_s=args.timeout,
            max_attempts=args.max_attempts,
            backoff_base_s=args.backoff_base,
            backoff_max_s=args.backoff_max,
            state_file=state_file,
            audit_file=audit_file,
            ingest_time=ingest_time,
        )
        phase_summaries.append(summary)

    totals = summarize_totals(phase_summaries)
    final_summary = {
        "run_id": run_id,
        "mode": mode,
        "phase_arg": args.phase,
        "phase_order": phase_order,
        "source_root": str(source_root),
        "state_file": str(state_file),
        "audit_file": str(audit_file),
        "summary_file": str(summary_file),
        "days": args.days,
        "concurrency": args.concurrency,
        "retry": {
            "max_attempts": args.max_attempts,
            "timeout": args.timeout,
            "backoff_base": args.backoff_base,
            "backoff_max": args.backoff_max,
        },
        "phases": phase_summaries,
        "totals": totals,
        "started_at": ingest_time,
        "finished_at": utc_now_iso(),
    }

    summary_file.write_text(json.dumps(final_summary, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    save_state(state_file, state)

    print(json.dumps(final_summary, ensure_ascii=False, indent=2, sort_keys=True))

    has_failure = any(
        phase[target]["failed"] > 0 for phase in phase_summaries for target in ("mem0", "graphiti")
    )
    if mode == "apply" and has_failure:
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Canonical-first local memory backfill to Mem0 + Graphiti")
    parser.add_argument("--source-root", required=True, help="local source memory root")
    parser.add_argument("--phase", choices=[*PHASES, "all"], default="all")
    parser.add_argument("--days", type=int, default=14, help="daily phase days window")
    parser.add_argument(
        "--targets",
        nargs="+",
        choices=["mem0", "graphiti"],
        default=["mem0", "graphiti"],
        help="which remote targets to write (default: both)",
    )

    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--dry-run", action="store_true")
    mode_group.add_argument("--apply", action="store_true")

    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-attempts", type=int, default=5)
    parser.add_argument("--backoff-base", type=float, default=1.0)
    parser.add_argument("--backoff-max", type=float, default=12.0)

    parser.add_argument(
        "--state-file",
        default=str(Path("~/.openclaw-memory-stack/run/backfill-state.json").expanduser()),
    )
    parser.add_argument(
        "--summary-dir",
        default=str(Path("~/.openclaw-memory-stack/run").expanduser()),
    )
    parser.add_argument("--audit-file", default="")

    parser.add_argument("--mem0-url", default="http://127.0.0.1:8766")
    parser.add_argument("--graphiti-url", default="http://127.0.0.1:8000")
    parser.add_argument("--mem0-user-id", default="openclaw-backfill")
    parser.add_argument("--graphiti-group-prefix", default="openclaw-backfill")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
