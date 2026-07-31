---
name: webview-tuner
description: Debug and fix layouts inside uninspectable webviews - wallet in-app browsers (Phantom, Solflare, Jupiter, Backpack), TWAs, release WKWebView/Chromium. Use when the user says a page "looks broken in the wallet browser / on the phone but fine in Chrome", or when they paste a webview-tuner report (lines like "dvh 746", "sel button.cta", "OVERRIDE dx -14").
---

# webview-tuner

A one-file, dependency-free overlay (`webview-tuner.js`, next to this file) that
lets a person measure and live-tune a page INSIDE the webview where it actually
breaks, then send you a text report instead of screenshots. Your job has three
phases: wire it up, tell the user what to do on the device, turn their report
into a real fix.

## Phase 0 - is the project's copy current?

Do this ONCE per session, before anything else, and only when the project
already has a copy of the tool (skip it on a fresh install - phase 1 fetches
the newest version anyway):

1. Read the version from the project's copy: the first line of the vendored
   `webview-tuner.js` is `/*! webview-tuner vX.Y.Z`.
2. Read the version on `main`:
   `curl -s https://raw.githubusercontent.com/4oko4ow/webview-tuner/main/webview-tuner.js | head -1`
3. If they match, say nothing and move on. Version checks that announce
   themselves when there is no news are noise.
4. If `main` is newer, fetch
   `https://raw.githubusercontent.com/4oko4ow/webview-tuner/main/CHANGELOG.md`,
   and tell the user in ONE short message: their version, the new version, and
   the 2-4 changes that matter for what they are doing right now. Then ASK
   before touching anything - never update the file unprompted, and never update
   mid-task (a tool that changes under the user while they are tuning a layout
   is worse than an old tool).
5. If they say yes, overwrite the vendored copy with the fetched file and
   confirm the new version. Nothing else in their project needs to change - the
   script is self-contained and the query-param gate is unchanged.

## Phase 1 - wire the script into the project

1. Copy `webview-tuner.js` from this skill's directory into the project's
   static assets (`public/` for Next.js/Vite, `static/` for SvelteKit, etc.).
2. Load it on the pages being debugged:
   - plain HTML: `<script src="/webview-tuner.js"></script>` before `</body>`
   - Next.js: `<Script src="/webview-tuner.js" strategy="lazyOnload" />` in the
     root layout (or the affected page)
3. The script renders NOTHING unless the URL has `?wvtune=1`, so it is safe
   on production. `data-auto` on the script tag
   forces it on for dev builds.
4. Deploy or serve wherever the user's device can reach it. The whole point is
   running inside the REAL webview - localhost through a tunnel or a preview
   deploy both work.

## Phase 2 - what the user does on the device

Tell them, in one short message:

1. Open the affected page inside the actual wallet browser / webview with
   `?wvtune=1` appended.
2. Read nothing - just check the panel appeared (top-left, green mono text).
3. Tap the round ⌖ badge (bottom-right) - inspect mode ON: the page goes
   inert, plain taps now SELECT elements (dashed ring + floating arrow pad).
   Tap more elements to select several - arrows move ALL of them together.
   Tap a selected element again to unselect, `✕` clears everything.
   To move something, DRAG it - it follows the finger and snaps to neighbours.
   Arrows are precision: exactly 1px (`x8` toggles 8px), no snapping, `w-`/`w+`
   resize.
   `parent` / `child` walk the DOM tree - tell them to tap any easy target and
   step UP to the block they mean, rather than fighting a tiny element.
   `axis free/y/x` locks the direction; `snap on` snaps edges and centers to
   siblings within 8px (guide line flashes). The pad drags by its dotted grip
   and the panel collapses via `-` - both remembered across reloads.
4. Tap `copy` in the top panel, paste the text back into the chat, tap the
   badge again to give the page back its clicks.

## Phase 3 - read the report and fix the source

Report format and what each line tells you:

```
440x746  outer 746  screen 956     <- layout viewport vs physical screen: the
                                      webview chrome eats 956-746px; never
                                      assume a fullscreen viewport
vv 746  dvh 746  svh 746  lvh 746  <- how CSS viewport units actually resolve
                                      HERE. dvh != your DevTools emulation.
safe-b 0  hscroll none             <- safe-area-inset-bottom in px; hscroll
                                      +Npx means horizontal overflow exists
axis y  snap on  step 8px          <- the modes that produced the offsets below
                                      (axis y means dx was locked at 0)
sel[0] div.stage > button.cta      <- CSS-ish path to a picked element (one
  box 384x64 @ 28,562                 block per selected element)
  OVERRIDE dx 0 dy -14 dw 16       <- what the user chose: move 14px UP and
                                      16px WIDER than the current CSS produces
url ...?wvtune=1                   <- exact page
ua ... JupiterBrowser/3.11.0 ...   <- which webview (report differs per wallet)
```

Rules for turning OVERRIDE into a fix:

- Find the element in the SOURCE by the `sel` path (CSS-module hashes: match on
  the readable fragment, e.g. `packWrap` inside `pack_packWrap__x7f2`).
- `dy`/`dx` are the user's desired visual delta at THAT viewport. Do not paste
  them as absolute margins blindly: if the misplacement scales with viewport
  height (check the dvh line vs what the layout was designed for), fix the
  formula (flex distribution, `clamp()` with dvh terms), not the constant.
- `dw` on a capped element usually means a `max-width`/`clamp` ceiling is too
  tight - raise the ceiling, keep the floor, so small browsers stay unchanged.
- Different wallets report different dvh for the same phone. A fix must hold
  across the range, not just the reported value: prefer `clamp(floor, formula
  with 100dvh, cap)` and flexbox growth over fixed offsets.
- `hscroll +Npx` means some element overflows horizontally - find it (widths
  over 100vw, unwrapped rows) before cosmetic tuning.
- After editing, verify at the reported size in a headless browser (e.g.
  playwright viewport `{width, height}` from line 1) AND at a common mobile
  browser height (~660px) to prove the old look did not regress.

## Gotchas learned in production

- The overlay's own nudge uses the CSS `translate` property so it composes
  with `transform` animations (a float/breathe keyframe would otherwise be
  clobbered). Your real fix should do the same: don't add `transform` to an
  element that animates `transform`.
- Growing a width from inline styles loses to `max-width: 100%` chains - that
  is why the overlay injects `max-width: none`. Your source fix should adjust
  the actual constraint instead.
- In-app browsers on iOS are WKWebView: no remote inspection on release
  builds, `justify-content: safe center` unsupported (declare plain `center`
  on the line before as a fallback).
