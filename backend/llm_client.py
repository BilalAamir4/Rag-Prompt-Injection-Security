"""
Sentinel RAG - Swappable LLM Client
OpenAI-compatible /v1/chat/completions client.
All LLM generation in the application MUST go through generate().
"""

import time
import requests
import config

import re
import time
import requests
import config

from typing import Optional, Tuple, Union

__all__ = ["generate", "generate_with_reasoning", "check_health"]


def check_health(timeout: float = 2.0) -> bool:
    """
    Checks reachability of the OpenAI-compatible endpoint via GET /models.
    Returns True if endpoint responds with 200 OK, False otherwise.
    """
    try:
        endpoint = f"{config.LLM_BASE_URL.rstrip('/')}/models"
        headers = {}
        if config.LLM_API_KEY and config.LLM_API_KEY != "unused-for-local-ollama":
            headers["Authorization"] = f"Bearer {config.LLM_API_KEY}"
        resp = requests.get(endpoint, headers=headers, timeout=timeout)
        return resp.status_code == 200
    except Exception:
        return False


def generate(
    prompt: str,
    temperature: float = 0.0,
    seed: Optional[int] = 42,
    return_reasoning: bool = False,
) -> Union[str, Tuple[str, Optional[str]]]:
    """
    Sends a prompt to the configured LLM endpoint via OpenAI-compatible format:
      POST {config.LLM_BASE_URL}/chat/completions
      {"model": config.LLM_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "seed": 42, "reasoning_format": "parsed"}
    
    Includes 2 retries with exponential backoff for rate limits (429) or 5xx server errors.
    Separates reasoning_content from user-facing content.
    If return_reasoning=True, returns (content, reasoning_content).
    Otherwise returns content string for backward compatibility.
    """
    endpoint = f"{config.LLM_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
    }
    if config.LLM_API_KEY:
        headers["Authorization"] = f"Bearer {config.LLM_API_KEY}"

    payload = {
        "model": config.LLM_MODEL,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "reasoning_format": "parsed",
    }
    if seed is not None:
        payload["seed"] = seed

    max_retries = 2
    retry_delay = 1.0  # seconds

    for attempt in range(max_retries + 1):
        try:
            response = requests.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=120,
            )

            # Retry on rate limits (429) or transient 5xx server errors
            if response.status_code in (429, 500, 502, 503, 504):
                if attempt < max_retries:
                    time.sleep(retry_delay * (2 ** attempt))
                    continue
                response.raise_for_status()

            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            content = message.get("content") or ""
            reasoning_content = message.get("reasoning") or message.get("reasoning_content") or None

            # Fallback for inline <think>...</think> tags if model returned raw reasoning inline in content
            if "<think>" in content:
                think_match = re.search(r"<think>(.*?)</think>", content, flags=re.DOTALL)
                if think_match:
                    inline_reasoning = think_match.group(1).strip()
                    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                    if not reasoning_content:
                        reasoning_content = inline_reasoning

            if return_reasoning:
                return content, reasoning_content
            return content

        except (requests.RequestException, KeyError, IndexError) as err:
            if attempt < max_retries and isinstance(err, requests.RequestException):
                time.sleep(retry_delay * (2 ** attempt))
                continue
            raise RuntimeError(f"LLM generation failed after {attempt + 1} attempt(s): {err}") from err


def generate_with_reasoning(
    prompt: str,
    temperature: float = 0.0,
    seed: Optional[int] = 42,
) -> Tuple[str, Optional[str]]:
    """Helper that always returns (content, reasoning_content)."""
    return generate(prompt, temperature=temperature, seed=seed, return_reasoning=True)

