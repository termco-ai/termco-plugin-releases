/**
 * SSRF-hardened undici dispatcher for the AI HTTP proxy: validate_url →
 * classify → pin undici to the exact safe IPs (defeats DNS rebinding). The
 * source plugin exposes this implementation only through `network.http`.
 */
import { isIP } from "node:net";
import { Agent } from "undici";

/**
 * An undici dispatcher pinned to the safe IPs (Host/SNI stay the real hostname).
 *
 * All of them, not just the first: `localhost` resolves to `[::1, 127.0.0.1]` on
 * macOS, and a server bound to IPv4 only (9router, and plenty of other local
 * model servers) refuses the `::1` attempt. Pinning to `safeIps[0]` therefore
 * failed the whole request while curl and plain `fetch` succeeded — they fall
 * back across families. `autoSelectFamily` restores that Happy Eyeballs
 * behaviour while the pinned lookup keeps the DNS-rebinding guarantee: only
 * addresses that were resolved *and* classified are ever connected to.
 */
export function pinnedAgent(safeIps: string[]): Agent {
  const pinned = safeIps.map((address) => ({ address, family: isIP(address) }));
  return new Agent({
    connect: {
      autoSelectFamily: true,
      lookup: (
        _hostname: string,
        options: { all?: boolean },
        cb: (
          err: NodeJS.ErrnoException | null,
          address: string | { address: string; family: number }[],
          family?: number,
        ) => void,
      ) => {
        if (options?.all) cb(null, pinned);
        else cb(null, pinned[0].address, pinned[0].family);
      },
    },
  });
}
