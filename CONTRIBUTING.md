# Contributing

The whole tool is one file on purpose: `webview-tuner.js`, vanilla JS, zero
dependencies, no build step. Keep it that way - it has to drop into any stack
and run inside old locked-down webviews.

## Ground rules

- **No dependencies, no build.** If a change needs a bundler, it does not
  belong here.
- **Stay dormant without `?wvtune=1`.** People keep the script in production -
  nothing may render, listen, or allocate until the gate matches (`data-auto`
  is the only exception).
- **Never break the page under test.** Overrides go through the CSS
  `translate` property (composes with `transform` animations) and injected
  `!important` styles that `reset` fully removes. In browse mode the page
  must behave exactly as if the script were not there.
- **Old webviews are the target.** iOS WKWebView and Android Chromium inside
  wallet apps: no remote inspection, sometimes years-old engines. Prefer
  boring JS (the file is written ES5-style var/function on purpose).
- **The report is an API.** AI assistants parse it (see `SKILL.md`). If you
  change its format, update `SKILL.md` and the README example in the same PR.

## Testing a change

1. `node --check webview-tuner.js` - syntax.
2. Open `demo.html` in a browser (the script is wired with `data-auto`):
   toggle the badge, select the Buy button, nudge, copy - the report must
   reflect what you did.
3. Best effort: open a page with your build inside a real wallet browser
   (Phantom/Solflare/Jupiter) - that is the environment this exists for.

## Scope

Good PRs: broader webview metrics, selection ergonomics, report clarity,
compatibility fixes for specific wallet browsers (name the wallet + version
in the PR).

Out of scope: frameworks, styling systems, network calls of any kind,
analytics. The tool must stay something you can audit in five minutes.
