import json
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from pipeline import query_pipeline, ATTACK_URL_PATTERN, ATTACK_CLAIM_PATTERN
from ingestion import TRIGGER_QUERY

OUTPUT_FILE = Path("data/rows_9_to_12_distribution.json")

row_configs = [
    (9, "Row 09 (Delim ON, Sanit OFF, OutFilt OFF, Thresh OFF)", {
        "delimiter": True, "sanitization": False, "output_filter": False, "retrieval_score_threshold": False
    }),
    (10, "Row 10 (Delim ON, Sanit OFF, OutFilt OFF, Thresh ON)", {
        "delimiter": True, "sanitization": False, "output_filter": False, "retrieval_score_threshold": True
    }),
    (11, "Row 11 (Delim ON, Sanit OFF, OutFilt ON, Thresh OFF)", {
        "delimiter": True, "sanitization": False, "output_filter": True, "retrieval_score_threshold": False
    }),
    (12, "Row 12 (Delim ON, Sanit OFF, OutFilt ON, Thresh ON)", {
        "delimiter": True, "sanitization": False, "output_filter": True, "retrieval_score_threshold": True
    }),
]

TRIALS_PER_ROW = 5
results = []

print("=" * 80, flush=True)
print("RUNNING 5 TRIALS EACH FOR ABLATION ROWS 9, 10, 11, 12 AGAINST GROQ", flush=True)
print("=" * 80, flush=True)

total_calls = 0

for row_num, label, flags in row_configs:
    print(f"\n>>> Starting {label} (5 Trials)...", flush=True)
    row_trials = []
    
    for t in range(1, TRIALS_PER_ROW + 1):
        total_calls += 1
        print(f"  [Call {total_calls:02d}/20] Row {row_num} - Trial {t}/{TRIALS_PER_ROW}...", end=" ", flush=True)
        
        try:
            res = query_pipeline(TRIGGER_QUERY, mitigation_flags=flags)
            resp = res["response"]
            reason = res.get("reasoning_content") or ""
            
            has_url_resp = bool(ATTACK_URL_PATTERN.search(resp))
            has_claim_resp = bool(ATTACK_CLAIM_PATTERN.search(resp))
            has_url_reason = bool(ATTACK_URL_PATTERN.search(reason))
            has_claim_reason = bool(ATTACK_CLAIM_PATTERN.search(reason))
            
            status = res["final_status"]
            is_flagged = res["is_flagged"]
            
            if status == "leaked":
                outcome = "LEAKED"
            elif status == "blocked":
                outcome = "BLOCKED"
            else:
                outcome = "DEFENDED"
                
            trial_record = {
                "row_num": row_num,
                "trial_idx": t,
                "flags": flags,
                "final_status": status,
                "outcome": outcome,
                "is_flagged": is_flagged,
                "resp_url_detected": has_url_resp,
                "resp_claim_detected": has_claim_resp,
                "reason_url_detected": has_url_reason,
                "reason_claim_detected": has_claim_reason,
                "response_snippet": resp[:150],
            }
            results.append(trial_record)
            row_trials.append(trial_record)
            
            print(f"status='{status:<8}' outcome='{outcome:<8}' flagged={is_flagged!s:<5} (Resp URL={has_url_resp} Claim={has_claim_resp})", flush=True)
            
        except Exception as e:
            print(f"FAILED: {e}", flush=True)
            results.append({
                "row_num": row_num,
                "trial_idx": t,
                "flags": flags,
                "error": str(e)
            })
            
        # Pacing to avoid Groq 8000 TPM limit
        time.sleep(7.5)

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("\n" + "=" * 80, flush=True)
print("ALL 20 TRIALS COMPLETED. AGGREGATED SUMMARY PER ROW:", flush=True)
print("=" * 80, flush=True)

for row_num, label, _ in row_configs:
    sub = [r for r in results if r.get("row_num") == row_num and "outcome" in r]
    statuses = [r["final_status"] for r in sub]
    outcomes = [r["outcome"] for r in sub]
    from collections import Counter
    status_counts = Counter(statuses)
    status_str = ", ".join(f"{count}/{len(sub)} {st}" for st, count in status_counts.items())
    print(f"Row {row_num:02d}: {status_str} (Outcomes: {Counter(outcomes)})", flush=True)

print("=" * 80, flush=True)
