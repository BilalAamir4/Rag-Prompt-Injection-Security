import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from ingestion import get_retriever, ATTACK_PAYLOAD, TRIGGER_QUERY


def test_chunk_boundary_invariant():
    """
    Spec 1.6 Chunk-boundary guardrail assertion:
    Verifies that the trigger query reliably retrieves the poisoned chunk as the
    top retrieval result (retrieved[0]) and that the entire raw attack payload
    is contained within retrieved[0].text without being fragmented across chunks.
    """
    retriever = get_retriever(similarity_top_k=3)
    retrieved = retriever.retrieve(TRIGGER_QUERY)

    print("\n" + "=" * 60)
    print(f"Trigger Query: {TRIGGER_QUERY}")
    print(f"Total retrieved nodes: {len(retrieved)}")
    print("=" * 60)
    print("--- Retrieved[0] Metadata ---")
    print(f"File: {retrieved[0].metadata.get('file_name')}")
    print(f"Score: {retrieved[0].score}")
    print("\n--- Retrieved[0] Text Content ---")
    print(retrieved[0].text)
    print("=" * 60)

    # Spec 1.6 required assertions
    assert len(retrieved) > 0, "No chunks retrieved for trigger query"
    assert (
        ATTACK_PAYLOAD in retrieved[0].text
    ), "Exact raw attack payload string NOT found in top retrieved chunk retrieved[0].text"

    print("\n[PASS] Spec 1.6 Assertion Passed: retrieved[0].text contains the exact raw attack string.")


if __name__ == "__main__":
    test_chunk_boundary_invariant()
