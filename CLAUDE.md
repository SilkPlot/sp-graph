# SilkPlot — Claude entrypoint

This is the Claude entrypoint. Follow [AGENTS.md](AGENTS.md) exactly; it links to the
architecture rules rather than duplicating them here.

Core rule: **D3 computes, Solid renders.** Never use `d3-selection`, `d3-transition`, or
`d3-axis` in the render path.
