# Changelog

The version lives in the first line of `webview-tuner.js`
(`/*! webview-tuner vX.Y.Z`). Agents compare a project's copy against the
version on `main` and offer the update - see SKILL.md phase 0.

## 0.5.0

- **drag to move**: press an element and drag it - the natural gesture, with
  snapping and guides while you go. Tapping still selects; the arrows are now
  pure precision.
- **arrows no longer snap**: an 8px snap radius was eating every 1px nudge, so
  elements looked stuck. Snapping belongs to dragging (like a design tool).
- **fix: the tool's own panel was blocking the page.** With 44px buttons the
  panel covered real content and swallowed every tap aimed underneath - so
  nothing could be grabbed. The panel and pad shells are now transparent to
  pointer events (only their buttons take taps), and the panel starts collapsed.
- axis / snap toggles show their state by filling, not by label alone
- `state()` in the debug API also reports the live gesture (pressing/dragging)

## 0.4.0

- `parent` / `child` walk the DOM tree: tap any easy target, then step up to the
  block you actually want to move (moving a row no longer means nudging each
  child separately)
- axis lock (`axis free / y / x`) so a vertical tune cannot drift sideways
- snapping: edges and centers align to siblings and the parent within 8px with a
  guide line, so hand-nudged layouts come out symmetrical
- phone-first controls: 44px touch targets, the pad drags anywhere by its grip,
  the panel collapses to one line
- axis / snap / pad position / collapsed state persist across reloads
- fix: single-instance guard now runs before any DOM work - a page that included
  the script twice got two launchers with separate selection state
- `window.__wvtuner` debug API (`selection()`, `state()`, `report()`) so an agent
  can verify its own fix without scraping the DOM

## 0.3.0

- explicit inspect mode toggled by a floating badge: the page is inert while
  tuning, so a tap can never fire a CTA underneath
- replaced the long-press gesture (pages that act on `pointerdown` misfired)

## 0.2.0

- multi-select: nudge several elements together
- floating nudge pad next to the selection

## 0.1.0

- first release: viewport metrics (dvh/svh/lvh, safe-area, horizontal overflow),
  element selection, pixel nudging, and the copy-for-AI report
