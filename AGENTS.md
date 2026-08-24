# innFactory fork of firecrawl-mcp-server

This is a fork of [`firecrawl/firecrawl-mcp-server`](https://github.com/firecrawl/firecrawl-mcp-server).
It exists for exactly two reasons. Keep it that way — every additional
divergence is paid for again at each upstream sync.

## What we changed, and why

### 1. `FIRECRAWL_MCP_TOOLS` — restrict the exposed tool surface

Upstream registers every tool unconditionally and offers no supported way to
narrow that (the only per-tool switches are `FIRECRAWL_NO_SEARCH_FEEDBACK` and
`FIRECRAWL_NO_ENDPOINT_FEEDBACK`). Self-hosted 3.24 exposes **27** tools,
including monitor, research and developer families we neither operate nor want
in a customer's tool picker.

Upstream *does* maintain a fail-closed choke point for its own hosted "search"
profile: `ServerProfile.toolAllowlist`, enforced by the `server.addTool`
wrapper in `src/index.ts`. Every registration in the process passes through it.
We reuse that seam from an environment variable instead of inventing our own.

- **`src/tool-allowlist.ts`** — new file, ours alone. Never conflicts.
- **`src/index.ts`** — two hunks: an import, and `toolAllowlist: envToolAllowlist(),`
  in the object returned by `makeFullProfile()`.

Unset or blank `FIRECRAWL_MCP_TOOLS` yields `undefined`, which upstream reads as
"no allowlist" — so the default build behaves exactly like upstream.

Deliberately **not** touched: the guard inside the `addTool` wrapper,
`SEARCH_PROFILE_TOOLS`, and every `addTool` call site. Those are upstream's
churn hotspots.

### 2. `z.record()` → `z.any()` — Gemini / Vertex compatibility

`z.record()` emits JSON Schema `propertyNames`, which Gemini function-calling
rejects, so any tool carrying such a parameter breaks the whole tool list for
Google-backed models. All `z.record(...).optional()` occurrences in
`src/index.ts` are rewritten to `z.any().optional()`.

This is reported upstream as issue **#373** and is still open. **Re-check it on
every sync** — if upstream fixes it, drop this hunk entirely.

### 3. `.github/workflows/image-innfactory.yml`

A **new** file, not an edit to upstream's `image.yml` (which pushes to
`ghcr.io/firecrawl/...` and is irrelevant here). Ours builds `Dockerfile.service`
and pushes to `ghcr.io/innfactory/firecrawl-mcp-server` on tags matching
`v*-inn.*`.

## Versioning — read this before tagging

**Do not invent version numbers.** The old `v2.9.0` tag contained upstream
**3.13.0**; the label suggested a v2 line that never existed here and cost real
debugging time.

Tag as **`v<upstream package.json version>-inn.<n>`**, e.g. `v3.24.0-inn.1`.
The upstream part must match `package.json` exactly; `-inn.<n>` counts our own
rebuilds on the same upstream base. Upstream itself stopped tagging after
`v3.2.1` and now only bumps `package.json`, so that field is the source of truth.

## Syncing with upstream

```bash
git remote add upstream https://github.com/firecrawl/firecrawl-mcp-server.git   # once
git fetch upstream
git checkout main
git merge upstream/main
```

Expect conflicts in **`src/index.ts` only**, and only in our two areas:

1. `makeFullProfile()` — keep `toolAllowlist: envToolAllowlist(),` in the
   returned object. If upstream restructured profiles, find wherever the
   *primary* profile object is built and put it there.
2. The `z.record` rewrites — upstream keeps adding new ones. After merging, run
   `grep -n 'z\.record(' src/index.ts`; it must return nothing (unless #373 is
   fixed, in which case drop our rewrites and keep upstream's).

`src/tool-allowlist.ts` and `image-innfactory.yml` never conflict — they do not
exist upstream.

### Verify before tagging

```bash
npm install && npm run build

# 1. no z.record survived
grep -n 'z\.record(' src/index.ts    # must be empty

# 2. allowlist actually filters — start the server and list tools
HTTP_STREAMABLE_SERVER=true HOST=127.0.0.1 PORT=8931 \
  FIRECRAWL_API_URL=http://127.0.0.1:9 \
  FIRECRAWL_MCP_TOOLS=firecrawl_scrape,firecrawl_search \
  node dist/index.js &

curl -s -X POST http://127.0.0.1:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' >/dev/null

curl -s -X POST http://127.0.0.1:8931/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | grep -oE '"firecrawl_[a-z_]+"' | sort -u
```

The second command must return exactly the two names you allowed. Without
`FIRECRAWL_MCP_TOOLS` it returns all 27 — that is the control.

## How companyGPT consumes this

`modules/websearch/firecrawl-mcp.tf` in the `companyGPT` repo pins the image tag
and sets `FIRECRAWL_MCP_TOOLS`. The MCP server talks to the self-hosted
Firecrawl API via `FIRECRAWL_API_URL` (no API key needed — that satisfies the
credential gate on its own) and serves streamable HTTP on `/mcp` with a
`/health` endpoint for the liveness probe.

Note `firecrawl_extract` requires a RabbitMQ broker on the Firecrawl API side
(`NUQ_RABBITMQ_URL`), which companyGPT does not operate. Keep it out of the
allowlist unless that changes.
