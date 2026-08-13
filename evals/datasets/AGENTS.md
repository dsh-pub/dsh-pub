# Dataset Rules

- Give every case a stable, user-journey-oriented `metadata.caseId`.
- Record `datasetVersion`, `rubricVersion`, `providerVersion`, `assertionVersion`, and the fixed judge identity on every model-graded case so a result can be reproduced.
- Use representative, sanitized inputs. Never commit production conversations, personal data, credentials, or proprietary customer content.
- Include deterministic assertions whenever possible; use a model-graded rubric only for behavior that cannot be checked reliably in code.
- Keep smoke datasets small enough for explicit runs. Put broad or expensive suites in separate versioned files.
