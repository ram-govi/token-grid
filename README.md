# token-grid

A Claude Code mod that draws dotted grid bars above the prompt:

```
Context   ⣿⣿⣿⣿⣿⣿⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀   272.3k / 1M  27%  $3.21
5h limit  ⣿⣿⣿⣿⣿⣿⣿⣿⣀⣀⣀⣀⣀⣀⣀⣀   41%  ↻ 2h 14m
7d limit  ⣿⣿⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀   13%  ↻ 4d 6h
```

- **Context**: tokens in the context window, percent used, and the session's cost so far (as `/cost` totals it).
- **5h / 7d limit**: subscription rate-limit windows and when they reset (shown only on a subscription, after the first response).

On the desktop app each bar is a dithered, gently twinkling SVG grid; in the terminal it is block text. Colour moves green → purple → amber → red as a bar fills. Figures come from `$.session.usage()` and the `session.measure` event, so it works on every model.

## Install

At the prompt of a terminal session:

```
/plugin install token-grid --marketplace ram-govi/token-grid
```

From a shell:

```bash
claude plugin install token-grid --marketplace ram-govi/token-grid
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `ram-govi/token-grid`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope.
