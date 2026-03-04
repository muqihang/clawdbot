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

    old_reasoning = "if is_reasoning_model and reasoning is not None:"
    new_reasoning = "if False and is_reasoning_model and reasoning is not None:"
    if new_reasoning not in text and old_reasoning in text:
        text = text.replace(old_reasoning, new_reasoning)
        changed = True

    old_verbosity = "if is_reasoning_model and verbosity is not None:"
    new_verbosity = "if False and is_reasoning_model and verbosity is not None:"
    if new_verbosity not in text and old_verbosity in text:
        text = text.replace(old_verbosity, new_verbosity)
        changed = True

    # Some upstream versions no longer pass reasoning/verbosity kwargs at all.
    # In that case, treat this patch as a no-op rather than a hard failure.
    if old_reasoning in text and new_reasoning not in text:
        raise RuntimeError("failed to disable reasoning kwargs")
    if old_verbosity in text and new_verbosity not in text:
        raise RuntimeError("failed to disable verbosity kwargs")

    return text, changed


def patch_chat_completions_to_responses(text: str) -> tuple[str, bool]:
    """
    Graphiti upstream has drifted between providers:

    - Some versions use OpenAI Responses API (preferred for Sub2API gateway)
    - Some versions fall back to chat.completions (which Sub2API does not expose)

    We normalize to Responses API to keep the local memory stack compatible with
    Sub2API's `/v1/responses` endpoint.
    """

    if "self.client.responses.create" in text:
        return text, False

    old_structured = """
        response = await self.client.chat.completions.create(
            model=model,
            messages=patched_messages,
            temperature=temperature if not is_reasoning_model else None,
            max_tokens=max_tokens,
            response_format={
                'type': 'json_schema',
                'json_schema': {
                    'name': response_model.__name__,
                    'schema': strict_schema,
                    'strict': True,
                },
            },
        )

        content = '{}'
        if response.choices and response.choices[0].message:
            content = response.choices[0].message.content or '{}'

        usage = getattr(response, 'usage', None)
        normalized_usage = SimpleNamespace(
            input_tokens=getattr(usage, 'prompt_tokens', 0) or 0,
            output_tokens=getattr(usage, 'completion_tokens', 0) or 0,
        )
        return SimpleNamespace(output_text=content, usage=normalized_usage)
""".lstrip("\n")

    new_structured = """
        request = {
            'model': model,
            'input': patched_messages,
            'max_output_tokens': max_tokens,
            'text': {
                'format': {
                    'type': 'json_schema',
                    'name': response_model.__name__,
                    'schema': strict_schema,
                    'strict': True,
                },
            },
        }
        if not is_reasoning_model and temperature is not None:
            request['temperature'] = temperature

        return await self.client.responses.create(**request)
""".lstrip("\n")

    old_completion = """
        return await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature if not is_reasoning_model else None,
            max_tokens=max_tokens,
            response_format={'type': 'json_object'},
        )
""".lstrip("\n")

    new_completion = """
        request = {
            'model': model,
            'input': messages,
            'max_output_tokens': max_tokens,
            'text': {'format': {'type': 'json_object'}},
        }
        if not is_reasoning_model and temperature is not None:
            request['temperature'] = temperature

        response = await self.client.responses.create(**request)
        content = response.output_text or '{}'

        usage = getattr(response, 'usage', None)
        fake_usage = SimpleNamespace(
            prompt_tokens=getattr(usage, 'input_tokens', 0) or 0,
            completion_tokens=getattr(usage, 'output_tokens', 0) or 0,
        )

        fake_message = SimpleNamespace(content=content)
        fake_choice = SimpleNamespace(message=fake_message)
        return SimpleNamespace(choices=[fake_choice], usage=fake_usage)
""".lstrip("\n")

    changed = False
    if old_structured in text:
        text = text.replace(old_structured, new_structured)
        changed = True
    else:
        raise RuntimeError("failed to patch structured chat.completions -> responses")

    if old_completion in text:
        text = text.replace(old_completion, new_completion)
        changed = True
    else:
        raise RuntimeError("failed to patch completion chat.completions -> responses")

    if "self.client.responses.create" not in text:
        raise RuntimeError("verification failed: responses.create missing after patch")

    return text, changed


def patch_responses_temperature_kwargs(text: str) -> tuple[str, bool]:
    """
    Sub2API's OpenAI Responses compatibility layer is intentionally strict and may
    not support every OpenAI parameter. In particular, `temperature` can cause
    upstream failures (502) for some routes/models.

    We remove the temperature passthrough when using Responses requests.
    """

    block = """
        if not is_reasoning_model and temperature is not None:
            request['temperature'] = temperature
""".lstrip("\n")

    changed = False
    while block in text:
        text = text.replace(block, "")
        changed = True

    return text, changed


def patch_embedder_dimensions(text: str) -> tuple[str, bool]:
    marker = "dimensions=self.config.embedding_dim"
    if text.count(marker) >= 2:
        return text, False

    replacements = [
        (
            """
        result = await self.client.embeddings.create(
            input=input_data, model=self.config.embedding_model
        )
""".lstrip("\n"),
            """
        result = await self.client.embeddings.create(
            input=input_data,
            model=self.config.embedding_model,
            dimensions=self.config.embedding_dim,
        )
""".lstrip("\n"),
            "create",
        ),
        (
            """
        result = await self.client.embeddings.create(
            input=input_data_list, model=self.config.embedding_model
        )
""".lstrip("\n"),
            """
        result = await self.client.embeddings.create(
            input=input_data_list,
            model=self.config.embedding_model,
            dimensions=self.config.embedding_dim,
        )
""".lstrip("\n"),
            "create_batch",
        ),
    ]

    changed = False
    for old_block, new_block, name in replacements:
        if new_block in text:
            continue
        if old_block not in text:
            raise RuntimeError(f"failed to patch embedder {name} dimensions block")
        text = text.replace(old_block, new_block)
        changed = True

    if text.count(marker) < 2:
        raise RuntimeError("verification failed: dimensions marker count < 2 in embedder openai.py")

    return text, changed


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-graphiti-sitepkg.py <venv-site-packages-path>")
        return 2

    site_pkg = Path(sys.argv[1])
    llm_file = site_pkg / "graphiti_core" / "llm_client" / "openai_client.py"
    embedder_file = site_pkg / "graphiti_core" / "embedder" / "openai.py"

    if not llm_file.exists():
        print(f"missing file: {llm_file}")
        return 1
    if not embedder_file.exists():
        print(f"missing file: {embedder_file}")
        return 1

    llm_text = llm_file.read_text()
    embedder_text = embedder_file.read_text()

    try:
        llm_text, _ = ensure_helper_block(llm_text)
        llm_text, _ = patch_input_messages(llm_text)
        llm_text, _ = patch_structured_format(llm_text)
        llm_text, _ = patch_reasoning_kwargs(llm_text)
        llm_text, _ = patch_chat_completions_to_responses(llm_text)
        llm_text, _ = patch_responses_temperature_kwargs(llm_text)
        embedder_text, _ = patch_embedder_dimensions(embedder_text)
    except RuntimeError as exc:
        print(f"patch failed: {exc}")
        return 1

    llm_file.write_text(llm_text)
    embedder_file.write_text(embedder_text)
    print(f"patched {llm_file}")
    print(f"patched {embedder_file}")

    verify = llm_file.read_text()
    required = [
        "_make_strict_json_schema",
        "_ensure_json_keyword_for_responses",
        "_ensure_json_keyword_for_responses(messages)",
        "'type': 'json_schema'",
        "_make_strict_json_schema(response_model.model_json_schema())",
        "self.client.responses.create",
    ]
    for marker in required:
        if marker not in verify:
            print(f"verification failed: {marker}")
            return 1

    forbidden = [
        "if is_reasoning_model and reasoning is not None:",
        "if is_reasoning_model and verbosity is not None:",
        "request['temperature'] = temperature",
    ]
    for marker in forbidden:
        if marker in verify:
            print(f"verification failed: {marker} should be disabled/absent")
            return 1

    embedder_verify = embedder_file.read_text()
    marker = "dimensions=self.config.embedding_dim"
    if embedder_verify.count(marker) < 2:
        print(f"verification failed: expected at least 2 occurrences of {marker}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
