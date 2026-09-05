import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from pipeline import query_pipeline, ATTACK_URL_PATTERN, ATTACK_CLAIM_PATTERN
from ingestion import TRIGGER_QUERY

rows = [
    (10, {"delimiter": True, "sanitization": False, "output_filter": False, "retrieval_score_threshold": True}),
    (11, {"delimiter": True, "sanitization": False, "output_filter": True, "retrieval_score_threshold": False}),
    (12, {"delimiter": True, "sanitization": False, "output_filter": True, "retrieval_score_threshold": True}),
]

print("=" * 80)
print("RE-RUNNING ROWS 10, 11, 12 TO VERIFY REASONING SEPARATION & PATTERN MATCHING")
print("=" * 80)

for idx, cfg in rows:
    print(f"\n[Executing Row {idx}] Config: {cfg}")
    res = query_pipeline(TRIGGER_QUERY, mitigation_flags=cfg)
    resp = res["response"]
    reason = res.get("reasoning_content") or ""
    
    url_in_resp = bool(ATTACK_URL_PATTERN.search(resp))
    claim_in_resp = bool(ATTACK_CLAIM_PATTERN.search(resp))
    url_in_reason = bool(ATTACK_URL_PATTERN.search(reason))
    claim_in_reason = bool(ATTACK_CLAIM_PATTERN.search(reason))
    
    print(f"Row {idx} Outcome: final_status='{res['final_status']}', is_flagged={res['is_flagged']}")
    print(f"  In Clean Response: URL detected={url_in_resp}, Claim detected={claim_in_resp}")
    print(f"  In Reasoning:      URL detected={url_in_reason}, Claim detected={claim_in_reason}")
    print(f"  Clean Response snippet: {resp[:120]}...")
    print(f"  Reasoning snippet:      {reason[:120]}...")
    time.sleep(7.5)

print("\n" + "=" * 80)
print("VERIFICATION COMPLETED")
print("=" * 80)
