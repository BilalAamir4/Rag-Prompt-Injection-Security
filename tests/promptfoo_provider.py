import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from pipeline import query_pipeline

def call_api(prompt, options, context):
    """
    Promptfoo custom Python provider for Sentinel RAG.
    Executes the full retrieval-to-generation pipeline with mitigations ON.
    Returns clean response (with reasoning_content separated).
    """
    # If prompt is a user query, run pipeline directly
    # If options specify mitigations, use them
    config = options.get("config", {}) if options else {}
    mitigations = config.get("mitigations", {
        "delimiter": True,
        "sanitization": True,
        "output_filter": True,
        "retrieval_score_threshold": True,
    })
    
    # Context vars
    vars_dict = context.get("vars", {}) if context else {}
    query = vars_dict.get("query") or prompt
    
    res = query_pipeline(query, mitigation_flags=mitigations)
    
    return {
        "output": res["response"],
    }
