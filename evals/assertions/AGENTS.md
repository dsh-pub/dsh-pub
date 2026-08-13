# Assertion Rules

- Prefer deterministic checks for JSON shape, required facts, forbidden content, citations, tool calls, and other machine-verifiable behavior.
- Return a reason that explains a failure without exposing secrets or sensitive model output.
- Keep assertions domain-specific and side-effect free. An assertion must not call a model or external service.
- Increment `assertionVersion` whenever pass/fail semantics change.
