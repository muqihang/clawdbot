#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    print("usage: patch-mem0-sitepkg.py <venv-site-packages-path>")
    sys.exit(2)

site_pkg = Path(sys.argv[1])
file = site_pkg / "mem0" / "llms" / "openai.py"
if not file.exists():
    print(f"missing file: {file}")
    sys.exit(1)

text = file.read_text()

if "_use_responses_api" not in text:
    text = text.replace(
        "    def _parse_response(self, response, tools):\n",
        "    def _use_responses_api(self) -> bool:\n"
        "        flag = os.getenv(\"MEM0_USE_RESPONSES_API\", \"1\").strip().lower()\n"
        "        return flag in {\"1\", \"true\", \"yes\", \"on\"}\n\n"
        "    def _generate_with_responses(\n"
        "        self,\n"
        "        messages: List[Dict[str, str]],\n"
        "        response_format=None,\n"
        "        tools: Optional[List[Dict]] = None,\n"
        "        tool_choice: str = \"auto\",\n"
        "        **kwargs,\n"
        "    ):\n"
        "        request: Dict = {\n"
        "            \"model\": self.config.model,\n"
        "            \"input\": messages,\n"
        "            \"max_output_tokens\": kwargs.get(\"max_tokens\", self.config.max_tokens),\n"
        "        }\n"
        "        if response_format is not None:\n"
        "            request[\"text\"] = {\"format\": {\"type\": \"json_object\"}}\n"
        "        if tools:\n"
        "            request[\"tools\"] = tools\n"
        "            request[\"tool_choice\"] = tool_choice\n"
        "        response = self.client.responses.create(**request)\n"
        "        return response\n\n"
        "    def _parse_response(self, response, tools):\n",
    )

old_block = """        if response_format:
            params[\"response_format\"] = response_format
        if tools:  # TODO: Remove tools if no issues found with new memory addition logic
            params[\"tools\"] = tools
            params[\"tool_choice\"] = tool_choice
        response = self.client.chat.completions.create(**params)
        parsed_response = self._parse_response(response, tools)
"""

new_block = """        if response_format:
            params[\"response_format\"] = response_format
        if tools:  # TODO: Remove tools if no issues found with new memory addition logic
            params[\"tools\"] = tools
            params[\"tool_choice\"] = tool_choice

        response = None
        if self._use_responses_api():
            response = self._generate_with_responses(
                messages=messages,
                response_format=response_format,
                tools=tools,
                tool_choice=tool_choice,
                **kwargs,
            )
            parsed_response = response.output_text
        else:
            response = self.client.chat.completions.create(**params)
            parsed_response = self._parse_response(response, tools)
"""

if old_block in text:
    text = text.replace(old_block, new_block)

file.write_text(text)
print(f"patched {file}")


verify = file.read_text()
required = [
    "_use_responses_api",
    "_generate_with_responses",
    "responses.create(**request)",
    "if self._use_responses_api():",
]
for marker in required:
    if marker not in verify:
        print(f"verification failed: {marker}")
        sys.exit(1)
