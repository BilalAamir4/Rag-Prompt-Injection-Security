"""
Sentinel RAG - Swappable LLM Client
OpenAI-compatible /v1/chat/completions client.
All LLM generation in the application MUST go through generate().
"""

import time
import requests
import config

from typing import Optional

__all__ = ["generate"]


def generate(
    prompt: str,
    temperature: float = 0.0,
    seed: Optional[int] = 42,
) -> str:
    """
    Sends a prompt to the configured LLM endpoint via OpenAI-compatible format:
      POST {config.LLM_BASE_URL}/chat/completions
      {"model": config.LLM_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.0, "seed": 42}
    
    Includes 2 retries with exponential backoff for rate limits (429) or 5xx server errors.
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
            return data["choices"][0]["message"]["content"]

        except (requests.RequestException, KeyError, IndexError) as err:
            if attempt < max_retries and isinstance(err, requests.RequestException):
                time.sleep(retry_delay * (2 ** attempt))
                continue
            raise RuntimeError(f"LLM generation failed after {attempt + 1} attempt(s): {err}") from err
