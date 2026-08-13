# Provider Adapter Rules

- Call the real product boundary used by users or production integrations; do not call a model SDK directly unless that SDK is the product boundary.
- Read endpoints and credentials from environment variables. Never embed tokens, account IDs, or production URLs.
- Return provider/model identity, latency, token usage, and cost when the boundary exposes them.
- Set explicit timeouts and surface non-success responses as evaluation errors without leaking authorization headers or sensitive response bodies.
- Increment `providerVersion` when request mapping or response extraction changes materially.
