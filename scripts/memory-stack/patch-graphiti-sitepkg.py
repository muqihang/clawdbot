#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


HELPER_BLOCK = """
from copy import deepcopy


def _extract_text_content(value: typing.Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                part = item.get('text')
                if isinstance(part, str):
                    parts.append(part)
        return "\\n".join(parts)
    return ''


def _make_strict_json_schema(schema: typing.Any) -> typing.Any:
    if isinstance(schema, dict):
        out = {k: _make_strict_json_schema(v) for k, v in schema.items()}
        is_object = out.get('type') == 'object' or 'properties' in out
        if is_object:
            out.setdefault('additionalProperties', False)
        if 'properties' in out and isinstance(out['properties'], dict):
            out['properties'] = {
                key: _make_strict_json_schema(value)
                for key, value in out['properties'].items()
            }
            out['required'] = list(out['properties'].keys())
        if 'items' in out:
            out['items'] = _make_strict_json_schema(out['items'])
        for keyword in ('allOf', 'anyOf', 'oneOf'):
            if keyword in out and isinstance(out[keyword], list):
                out[keyword] = [_make_strict_json_schema(v) for v in out[keyword]]
        if '$defs' in out and isinstance(out['$defs'], dict):
            out['$defs'] = {k: _make_strict_json_schema(v) for k, v in out['$defs'].items()}
        return out
    if isinstance(schema, list):
        return [_make_strict_json_schema(v) for v in schema]
    return schema


def _ensure_json_keyword_for_responses(
    messages: list[ChatCompletionMessageParam],
) -> list[ChatCompletionMessageParam]:
    content_blob = '\\n'.join(
        _extract_text_content((m or {}).get('content'))
        for m in messages
        if isinstance(m, dict)
    ).lower()
    if 'json' in content_blob:
        return messages
    patched = deepcopy(messages)
    hint = 'Return a valid JSON object only.'
    if patched and isinstance(patched[0], dict) and patched[0].get('role') == 'system':
        base = _extract_text_content(patched[0].get('content'))
        patched[0]['content'] = f"{base}\\n{hint}".strip()
    else:
        patched.insert(0, {'role': 'system', 'content': hint})
    patched.append({'role': 'user', 'content': 'Please return json.'})
    return patched
""".lstrip("\n")


def ensure_helper_block(text: str) -> tuple[str, bool]:
    if "_make_strict_json_schema" in text and "_ensure_json_keyword_for_responses" in text:
        return text, False

    pattern = r"(from \.openai_base_client import DEFAULT_REASONING, DEFAULT_VERBOSITY, BaseOpenAIClient\n)"
    def helper_replacement(match: re.Match[str]) -> str:
        anchor = match.group(1)
        return f"{anchor}\n{HELPER_BLOCK}\n"

    new_text, count = re.subn(pattern, helper_replacement, text, count=1)
    if count == 0:
        raise RuntimeError("failed to locate openai_base_client import anchor")
    return new_text, True


def patch_input_messages(text: str) -> tuple[str, bool]:
    if "_ensure_json_keyword_for_responses(messages)" in text:
        return text, False

    pattern = (
        r"(?P<prefix>['\"]input['\"]:\s*)"
        r"messages"
        r"(?P<suffix>\s*,\s*(?:#\s*type:\s*ignore(?:\[[^\]]+\])?)?)"
    )
    replacement = r"\g<prefix>_ensure_json_keyword_for_responses(messages)\g<suffix>"
    new_text, count = re.subn(pattern, replacement, text, count=1)
    if count == 0:
        raise RuntimeError("failed to patch responses input messages line")
    return new_text, True


def patch_structured_format(text: str) -> tuple[str, bool]:
    if "'type': 'json_schema'" in text and "_make_strict_json_schema(response_model.model_json_schema())" in text:
        return text, False

    text_format_pattern = (
        r"(?P<indent>^[ \t]*)['\"]text_format['\"]:\s*response_model,\s*#\s*type:\s*ignore[^\n]*$"
    )

    def text_format_repl(match: re.Match[str]) -> str:
        indent = match.group("indent")
        return (
            f"{indent}'text': {{\n"
            f"{indent}    'format': {{\n"
            f"{indent}        'type': 'json_schema',\n"
            f"{indent}        'name': response_model.__name__,\n"
            f"{indent}        'schema': _make_strict_json_schema(response_model.model_json_schema()),\n"
            f"{indent}        'strict': True,\n"
            f"{indent}    }},\n"
            f"{indent}}},  # type: ignore"
        )

    new_text, count = re.subn(text_format_pattern, text_format_repl, text, count=1, flags=re.MULTILINE)
    if count == 1:
        return new_text, True

    old_format_pattern = (
        r"(?P<indent>^[ \t]*)['\"]format['\"]:\s*\{\s*['\"]type['\"]:\s*['\"]json_object['\"]\s*\},\s*$"
    )

    def old_format_repl(match: re.Match[str]) -> str:
        indent = match.group("indent")
        return (
            f"{indent}'format': {{\n"
            f"{indent}    'type': 'json_schema',\n"
            f"{indent}    'name': response_model.__name__,\n"
            f"{indent}    'schema': _make_strict_json_schema(response_model.model_json_schema()),\n"
            f"{indent}    'strict': True,\n"
            f"{indent}}},"
        )

    new_text, count = re.subn(old_format_pattern, old_format_repl, text, count=1, flags=re.MULTILINE)
    if count == 1:
        return new_text, True

    raise RuntimeError("failed to patch structured format block")


def patch_reasoning_kwargs(text: str) -> tuple[str, bool]:
    changed = False

    old_line = "if is_reasoning_model and reasoning is not None:"
    new_line = "if False and is_reasoning_model and reasoning is not None:"
    if new_line not in text and old_line in text:
        text = text.replace(old_line, new_line)
        changed = True

    old_line = "if is_reasoning_model and verbosity is not None:"
    new_line = "if False and is_reasoning_model and verbosity is not None:"
    if new_line not in text and old_line in text:
        text = text.replace(old_line, new_line)
        changed = True

    if (
        "if False and is_reasoning_model and reasoning is not None:" not in text
        or "if False and is_reasoning_model and verbosity is not None:" not in text
    ):
        raise RuntimeError("failed to disable reasoning/verbosity kwargs")

    return text, changed


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-graphiti-sitepkg.py <venv-site-packages-path>")
        return 2

    site_pkg = Path(sys.argv[1])
    file = site_pkg / "graphiti_core" / "llm_client" / "openai_client.py"
    if not file.exists():
        print(f"missing file: {file}")
        return 1

    text = file.read_text()

    try:
        text, _ = ensure_helper_block(text)
        text, _ = patch_input_messages(text)
        text, _ = patch_structured_format(text)
        text, _ = patch_reasoning_kwargs(text)
    except RuntimeError as exc:
        print(f"patch failed: {exc}")
        return 1

    file.write_text(text)
    print(f"patched {file}")

    verify = file.read_text()
    required = [
        "_make_strict_json_schema",
        "_ensure_json_keyword_for_responses",
        "_ensure_json_keyword_for_responses(messages)",
        "'type': 'json_schema'",
        "_make_strict_json_schema(response_model.model_json_schema())",
        "if False and is_reasoning_model and reasoning is not None:",
        "if False and is_reasoning_model and verbosity is not None:",
    ]
    for marker in required:
        if marker not in verify:
            print(f"verification failed: {marker}")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
