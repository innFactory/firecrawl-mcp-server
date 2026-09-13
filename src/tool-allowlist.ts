/**
 * innFactory fork addition — NOT upstream.
 *
 * Upstream registers every tool unconditionally; there is no supported way to
 * narrow the exposed surface. It does however maintain a fail-closed choke
 * point for its own hosted "search" profile: `ServerProfile.toolAllowlist`,
 * enforced in the `server.addTool` wrapper in `src/index.ts`. Every
 * registration in the process flows through it, including the monitor,
 * research and developer families.
 *
 * This module reuses that seam from an environment variable so a deployment
 * can decide its own tool surface without patching registration sites.
 *
 * `FIRECRAWL_MCP_TOOLS` — comma-separated tool names, e.g.
 *   FIRECRAWL_MCP_TOOLS=firecrawl_scrape,firecrawl_search,firecrawl_map
 *
 * Unset or blank returns `undefined`, which upstream reads as "no allowlist".
 * The default build therefore behaves exactly like upstream.
 */
export function envToolAllowlist(): Set<string> | undefined {
  const raw = process.env.FIRECRAWL_MCP_TOOLS?.trim();
  if (!raw) return undefined;

  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.length === 0) return undefined;
  return new Set(names);
}
