# Local update v0.54

This release hardens the API ingress boundary for production deployment.

- Trusts only a bounded number of reverse-proxy hops instead of every forwarded address.
- Uses one trusted hop on Render and trusts no forwarded client IP locally by default.
- Rejects request bodies above a validated 1 MiB default limit.
- Applies a validated 15-second default request timeout.
- Keeps proxy hops, body size and timeout within explicit safe configuration ranges.
- Returns the existing safe `PAYLOAD_TOO_LARGE` response without exposing request content.
- Adds configuration and release-smoke regression coverage for the new boundaries.
- Does not add a product migration or change fleet workflows.

No SQL migration is required after v0.53. Upload the files listed in
`release-v0.54/update-files.txt`; the Render values are included in `render.yaml`.
