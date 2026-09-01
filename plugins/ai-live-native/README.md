# AI Live Workspace

This replaceable renderer provider owns the one application-wide AI live
contribution registry. Consumers use `ai.live`; workspace, terminal, browser,
and managed-agent integrations register only the methods they implement through
`ai.live-contributions`.

The provider owns precedence, fallbacks, disposal, and the stable facade. It
does not create or duplicate SSH connections, PTYs, tabs, browsers, or agents.
