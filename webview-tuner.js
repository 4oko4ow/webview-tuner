/*! webview-tuner v0.5.0 - layout forensics + live nudging for uninspectable
 * wallet/in-app webviews. Inspect mode: DRAG an element to move it (snaps to
 * neighbours), tap to select, walk the DOM tree to grab a whole block, arrows
 * for exact pixels, copy a report your AI assistant can act on.
 * MIT. https://github.com/4oko4ow/webview-tuner */
(function () {
  'use strict'
  // Single-instance guard MUST be set before any DOM work: hosts can include the
  // script twice (framework <Script> + a manual tag), and two instances mean two
  // launchers with separate selection state - taps land on one, reads hit the
  // other. The debug API is attached to window.__wvtuner later.
  if (window.__wvtunerLoaded) return
  var script = document.currentScript
  var auto = script && script.hasAttribute('data-auto')
  if (!auto && !/[?&]wvtune=1/.test(location.search)) return
  window.__wvtunerLoaded = true

  var GREEN = '#36d399'
  var GREY = '#99a2b2'
  var GUIDE = '#ff5cf4'
  var SNAP_PX = 8
  // multi-select: every picked element carries its own offsets so the report
  // stays per-element even when they are nudged together
  var sel = [] // { el, ox, oy, ow, baseW, ring }
  var x8 = false
  var axis = 'free' // 'free' | 'x' | 'y' - lock nudging to one direction
  var snap = true // snap edges/centers to siblings and the parent
  // Prefs survive reloads: on a phone you reload constantly, and re-setting the
  // axis lock / pad position every time is the kind of friction that makes a
  // tool go unused.
  var PREF_KEY = 'wvtuner.prefs'
  var prefs = {}
  try { prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } catch (e) { prefs = {} }
  if (prefs.axis) axis = prefs.axis
  if (typeof prefs.snap === 'boolean') snap = prefs.snap
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ axis: axis, snap: snap, padX: prefs.padX, padY: prefs.padY, collapsed: prefs.collapsed }))
    } catch (e) {}
  }

  // --- probes ---------------------------------------------------------------
  var probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;'
  var px = function (h) {
    probe.style.height = h
    return probe.offsetHeight
  }

  function selectorPath(el) {
    if (el.id) return '#' + el.id
    var path = []
    var cur = el
    while (cur && cur !== document.body && path.length < 4) {
      var seg = cur.tagName.toLowerCase()
      var cls = (typeof cur.className === 'string' ? cur.className : '').trim().split(/\s+/)[0]
      if (cls) seg += '.' + cls
      var parent = cur.parentElement
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === cur.tagName })
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')'
      }
      path.unshift(seg)
      cur = parent
    }
    return path.join(' > ')
  }

  function metrics() {
    var doc = document.documentElement
    var hOver = doc.scrollWidth - doc.clientWidth
    var lines = [
      innerWidth + 'x' + innerHeight + '  outer ' + outerHeight + '  screen ' + screen.height,
      'vv ' + Math.round(visualViewport ? visualViewport.height : 0) + '  dvh ' + px('100dvh') + '  svh ' + px('100svh') + '  lvh ' + px('100lvh'),
      'safe-b ' + px('env(safe-area-inset-bottom)') + '  hscroll ' + (hOver > 0 ? '+' + hOver + 'px !' : 'none'),
    ]
    if (sel.length) lines.push('axis ' + axis + '  snap ' + (snap ? 'on' : 'off') + '  step ' + (x8 ? 8 : 1) + 'px')
    sel.forEach(function (s, i) {
      var r = s.el.getBoundingClientRect()
      lines.push('sel[' + i + '] ' + selectorPath(s.el))
      lines.push('  box ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @ ' + Math.round(r.left) + ',' + Math.round(r.top))
      if (s.ox || s.oy || s.ow) lines.push('  OVERRIDE dx ' + s.ox + ' dy ' + s.oy + (s.ow ? ' dw ' + s.ow : ''))
    })
    return lines.join('\n')
  }

  // --- overrides --------------------------------------------------------------
  function apply(s) {
    // `translate` is its own property - composes with transform animations
    s.el.style.setProperty('translate', s.ox + 'px ' + s.oy + 'px', 'important')
    if (s.ow) {
      if (s.baseW == null) s.baseW = s.el.getBoundingClientRect().width
      s.el.style.setProperty('width', s.baseW + s.ow + 'px', 'important')
      s.el.style.setProperty('max-width', 'none', 'important')
    }
  }

  function clearOverrides(s) {
    s.el.style.removeProperty('translate')
    s.el.style.removeProperty('width')
    s.el.style.removeProperty('max-width')
    s.ox = s.oy = s.ow = 0
    s.baseW = null
  }

  // --- snapping ----------------------------------------------------------------
  // Figma-style alignment: after a nudge, if an edge or center lands within
  // SNAP_PX of a sibling's (or the parent's) matching edge/center, close the gap
  // exactly and flash a guide. Pixel-nudging alone always ends up one px off -
  // this is what keeps a hand-tuned layout actually symmetrical.
  var guideV = document.createElement('div')
  var guideH = document.createElement('div')
  guideV.style.cssText = 'position:fixed;top:0;bottom:0;width:1px;background:' + GUIDE + ';z-index:2147483644;pointer-events:none;display:none'
  guideH.style.cssText = 'position:fixed;left:0;right:0;height:1px;background:' + GUIDE + ';z-index:2147483644;pointer-events:none;display:none'
  var guideTimer = null

  function flashGuide(el, pos) {
    el.style.display = 'block'
    if (el === guideV) el.style.left = pos + 'px'
    else el.style.top = pos + 'px'
    clearTimeout(guideTimer)
    guideTimer = setTimeout(function () {
      guideV.style.display = 'none'
      guideH.style.display = 'none'
    }, 700)
  }

  function alignTargets(el) {
    var xs = []
    var ys = []
    var push = function (r) {
      xs.push(r.left, r.right, r.left + r.width / 2)
      ys.push(r.top, r.bottom, r.top + r.height / 2)
    }
    var parent = el.parentElement
    if (parent && parent !== document.body) push(parent.getBoundingClientRect())
    if (parent) {
      Array.prototype.forEach.call(parent.children, function (c) {
        if (c !== el && !panel.contains(c) && !pad.contains(c) && c !== launcher) push(c.getBoundingClientRect())
      })
    }
    return { xs: xs, ys: ys }
  }

  function nearest(mine, targets) {
    var best = null
    mine.forEach(function (m) {
      targets.forEach(function (v) {
        var d = v - m
        if (Math.abs(d) <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: v }
      })
    })
    return best
  }

  function snapAdjust(s) {
    if (!snap) return
    var t = alignTargets(s.el)
    var r = s.el.getBoundingClientRect()
    if (axis !== 'y') {
      var bx = nearest([r.left, r.right, r.left + r.width / 2], t.xs)
      if (bx) {
        s.ox += Math.round(bx.d)
        apply(s)
        flashGuide(guideV, bx.at)
      }
    }
    if (axis !== 'x') {
      var r2 = s.el.getBoundingClientRect()
      var by = nearest([r2.top, r2.bottom, r2.top + r2.height / 2], t.ys)
      if (by) {
        s.oy += Math.round(by.d)
        apply(s)
        flashGuide(guideH, by.at)
      }
    }
  }

  // --- ui ---------------------------------------------------------------------
  // 44px minimum touch targets - the first version's 11px chips were unusable
  // one-handed on a phone.
  function btn(label, onTap, wide) {
    var b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'min-width:' + (wide ? 64 : 44) + 'px;min-height:44px;font:700 15px ui-monospace,monospace;color:' + GREEN + ';background:rgba(255,255,255,0.04);border:1px solid ' + GREEN + ';border-radius:10px;padding:0 8px;cursor:pointer;touch-action:manipulation;pointer-events:auto'
    b.addEventListener('click', function (e) {
      e.stopPropagation()
      e.preventDefault()
      onTap(b)
    })
    return b
  }

  function row() {
    var d = document.createElement('div')
    d.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center'
    for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i])
    return d
  }

  var panel = document.createElement('div')
  // pointer-events none on the shell: the panel must never eat a tap meant for
  // the page underneath (with 44px buttons it covers real content). Only its
  // buttons opt back in, so the tool is visible without being in the way.
  panel.style.cssText = 'position:fixed;top:64px;left:8px;z-index:2147483646;background:rgba(0,0,0,.85);border-radius:10px;padding:8px 10px;max-width:min(300px,86vw);font:11px/1.6 ui-monospace,monospace;pointer-events:none;color:' + GREEN
  panel.style.display = 'none'
  var pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;white-space:pre-wrap;color:inherit;font:inherit'
  panel.appendChild(pre)

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    ta.remove()
  }

  var copyBtn = btn('copy', function (b) {
    var report = metrics() + '\nurl ' + location.href + '\nua ' + navigator.userAgent
    var done = function () {
      b.textContent = 'copied'
      setTimeout(function () { b.textContent = 'copy' }, 1500)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(done, function () { fallbackCopy(report); done() })
    } else { fallbackCopy(report); done() }
  }, true)

  var axisBtn = btn('axis ' + axis, function (b) {
    axis = axis === 'free' ? 'y' : axis === 'y' ? 'x' : 'free'
    b.textContent = 'axis ' + axis
    b.style.background = axis === 'free' ? 'rgba(255,255,255,0.04)' : GREEN
    b.style.color = axis === 'free' ? GREEN : '#000'
    savePrefs()
  }, true)
  axisBtn.style.background = axis === 'free' ? 'rgba(255,255,255,0.04)' : GREEN
  axisBtn.style.color = axis === 'free' ? GREEN : '#000'
  var snapBtn = btn(snap ? 'snap on' : 'snap off', function (b) {
    snap = !snap
    b.textContent = snap ? 'snap on' : 'snap off'
    // fill it when active: a label-only toggle read as "not working" on device
    b.style.background = snap ? GREEN : 'rgba(255,255,255,0.04)'
    b.style.color = snap ? '#000' : GREEN
    savePrefs()
  }, true)
  snapBtn.style.background = snap ? GREEN : 'rgba(255,255,255,0.04)'
  snapBtn.style.color = snap ? '#000' : GREEN

  var body = document.createElement('div')
  body.appendChild(row(copyBtn, btn('reset', function () { sel.forEach(clearOverrides) }, true)))
  body.appendChild(row(axisBtn, snapBtn))
  panel.appendChild(body)
  // Collapse to a one-line bar: on a phone the panel itself covers the elements
  // you are trying to tune, so hiding it must be one tap away (and remembered).
  if (prefs.collapsed == null) prefs.collapsed = true // out of the way by default
  var collapseBtn = btn(prefs.collapsed ? '+' : '-', function (b) {
    prefs.collapsed = !prefs.collapsed
    b.textContent = prefs.collapsed ? '+' : '-'
    body.style.display = prefs.collapsed ? 'none' : 'block'
    hint.style.display = prefs.collapsed ? 'none' : hint.style.display
    savePrefs()
  })
  collapseBtn.style.position = 'absolute'
  collapseBtn.style.top = '4px'
  collapseBtn.style.right = '4px'
  collapseBtn.style.minWidth = '34px'
  collapseBtn.style.minHeight = '34px'
  panel.style.position = 'fixed'
  panel.style.paddingRight = '44px'
  panel.appendChild(collapseBtn)
  if (prefs.collapsed) body.style.display = 'none'
  var hint = document.createElement('div')
  hint.textContent = 'drag an element to move it (snaps to neighbours). tap to select, tap again to release. parent/child grab the whole block. arrows = exact pixels, no snap.'
  hint.style.cssText = 'margin-top:6px;color:' + GREY + ';font:10px ui-monospace,monospace;max-width:250px'
  if (prefs.collapsed) hint.style.display = 'none'
  panel.appendChild(hint)

  // floating nudge pad - appears next to the selection
  var pad = document.createElement('div')
  pad.style.cssText = 'position:fixed;z-index:2147483646;background:rgba(0,0,0,.88);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:8px;display:none;width:190px;pointer-events:none'
  var step = function () { return x8 ? 8 : 1 }
  // Arrows are PRECISION: no snapping. With an 8px snap radius a 1px nudge was
  // immediately pulled back to the nearest edge, so the element looked stuck -
  // snapping belongs to dragging (below), exactly like a design tool.
  var nudge = function (dx, dy, dw) {
    return function () {
      sel.forEach(function (s) {
        var lockedX = axis === 'y' && dx
        var lockedY = axis === 'x' && dy
        if (!lockedX && !lockedY) {
          s.ox += dx * step()
          s.oy += dy * step()
        }
        s.ow += dw * step()
        apply(s)
      })
    }
  }
  var x8btn = btn('x8', function (b) {
    x8 = !x8
    b.style.background = x8 ? GREEN : 'rgba(255,255,255,0.04)'
    b.style.color = x8 ? '#000' : GREEN
  })

  function clearSelection() {
    sel.forEach(function (s) { s.ring.remove() })
    sel = []
  }

  function addToSelection(el) {
    var ring = document.createElement('div')
    ring.style.cssText = 'position:fixed;z-index:2147483645;border:1px dashed ' + GREEN + ';pointer-events:none;border-radius:4px'
    document.body.appendChild(ring)
    sel.push({ el: el, ox: 0, oy: 0, ow: 0, baseW: null, ring: ring })
    hint.style.display = 'none'
  }

  // Walk the DOM instead of hunting tiny targets: tap whatever you CAN hit,
  // then step up to the block you actually want to move (nudging a row element
  // by element is the thing this replaces). Overrides reset on the way.
  function walk(up) {
    if (sel.length !== 1) return
    var cur = sel[0].el
    var next = up
      ? cur.parentElement
      : Array.prototype.filter.call(cur.children, function (c) {
          return c !== panel && c !== pad && c !== launcher && c.getBoundingClientRect().width > 0
        })[0]
    if (!next || next === document.body || next === document.documentElement) return
    if (panel.contains(next) || pad.contains(next) || next === launcher) return
    clearOverrides(sel[0])
    clearSelection()
    addToSelection(next)
  }

  // Drag handle: the auto-placed pad inevitably lands over the thing you are
  // tuning on a small screen, so let it be parked anywhere - and remember where.
  var grip = document.createElement('div')
  grip.textContent = '\u2022 \u2022 \u2022'
  grip.style.cssText = 'height:26px;display:flex;align-items:center;justify-content:center;color:' + GREY + ';font:12px ui-monospace,monospace;letter-spacing:2px;cursor:grab;touch-action:none;user-select:none;pointer-events:auto'
  var dragging = null
  grip.addEventListener('pointerdown', function (e) {
    e.stopPropagation()
    e.preventDefault()
    var r = pad.getBoundingClientRect()
    dragging = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    grip.setPointerCapture(e.pointerId)
  })
  grip.addEventListener('pointermove', function (e) {
    if (!dragging) return
    e.stopPropagation()
    var x = Math.min(Math.max(4, e.clientX - dragging.dx), innerWidth - pad.offsetWidth - 4)
    var y = Math.min(Math.max(4, e.clientY - dragging.dy), innerHeight - pad.offsetHeight - 4)
    pad.style.left = x + 'px'
    pad.style.top = y + 'px'
    prefs.padX = x
    prefs.padY = y
  })
  grip.addEventListener('pointerup', function (e) {
    e.stopPropagation()
    dragging = null
    savePrefs()
  })
  pad.appendChild(grip)
  pad.appendChild(row(btn('↑', nudge(0, -1, 0)), x8btn, btn('✕', function () { clearSelection() })))
  pad.appendChild(row(btn('←', nudge(-1, 0, 0)), btn('↓', nudge(0, 1, 0)), btn('→', nudge(1, 0, 0))))
  pad.appendChild(row(btn('w-', nudge(0, 0, -1)), btn('w+', nudge(0, 0, 1))))
  pad.appendChild(row(btn('parent', function () { walk(true) }, true), btn('child', function () { walk(false) }, true)))

  function toggle(el) {
    if (!el || el === document.body || el === document.documentElement) return
    if (panel.contains(el) || pad.contains(el) || el === launcher || launcher.contains(el)) return
    for (var i = 0; i < sel.length; i++) {
      // ancestry match too: floating/animated elements shift a few px between
      // taps, so the second tap can land on a wrapper of the selected node
      if (sel[i].el === el || sel[i].el.contains(el) || el.contains(sel[i].el)) {
        clearOverrides(sel[i])
        sel[i].ring.remove()
        sel.splice(i, 1)
        return
      }
    }
    addToSelection(el)
  }

  // --- inspect mode -------------------------------------------------------
  // Explicit and modal, toggled by the floating launcher: OFF = the page works
  // untouched (zero interception), ON = the page is inert and every tap
  // selects/unselects the element under the finger. No long-press gymnastics -
  // pages often act on pointerdown itself, so half-measures misfire.
  var inspecting = false

  var launcher = document.createElement('button')
  // inline svg crosshair - text glyphs sit off-baseline in random webview fonts
  launcher.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/></svg>'
  launcher.setAttribute('aria-label', 'webview-tuner')
  launcher.style.cssText = 'position:fixed;bottom:86px;right:10px;z-index:2147483647;width:44px;height:44px;padding:0;border-radius:50%;border:1px solid ' + GREEN + ';background:rgba(0,0,0,.85);color:' + GREEN + ';cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center'
  launcher.addEventListener('click', function (e) {
    e.stopPropagation()
    e.preventDefault()
    inspecting = !inspecting
    launcher.style.background = inspecting ? GREEN : 'rgba(0,0,0,.85)'
    launcher.style.color = inspecting ? '#000' : GREEN
    panel.style.display = inspecting ? 'block' : 'none'
    // a drag must move the element, not scroll the page under it
    document.documentElement.style.touchAction = inspecting ? 'none' : ''
    if (!inspecting) clearSelection()
  })

  // Gestures in inspect mode: DRAG moves things (the natural way to place an
  // element, snapping as you go), a TAP without movement selects/unselects.
  // Everything is swallowed at capture so the page underneath never reacts.
  var press = null
  var DRAG_START_PX = 5

  function ours(t) {
    return launcher.contains(t) || panel.contains(t) || pad.contains(t)
  }

  document.addEventListener('pointerdown', function (e) {
    if (!inspecting || ours(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    press = { x: e.clientX, y: e.clientY, target: e.target, dragging: false, base: null }
  }, true)

  document.addEventListener('pointermove', function (e) {
    if (!inspecting || !press) return
    e.preventDefault()
    e.stopPropagation()
    var dx = e.clientX - press.x
    var dy = e.clientY - press.y
    if (!press.dragging && Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return
    if (!press.dragging) {
      press.dragging = true
      // drag whatever is selected; if the press landed outside the selection,
      // select that element first so a drag always moves something visible
      var inSel = sel.some(function (s) { return s.el === press.target || s.el.contains(press.target) })
      if (!inSel) {
        clearSelection()
        addToSelection(press.target)
      }
      press.base = sel.map(function (s) { return { ox: s.ox, oy: s.oy } })
    }
    sel.forEach(function (s, i) {
      var b = press.base[i] || { ox: 0, oy: 0 }
      if (axis !== 'y') s.ox = b.ox + Math.round(dx)
      if (axis !== 'x') s.oy = b.oy + Math.round(dy)
      apply(s)
    })
    // snap the leader; the rest keep their relative offsets
    if (sel.length) snapAdjust(sel[0])
  }, true)

  document.addEventListener('pointerup', function (e) {
    if (!inspecting || !press) return
    e.preventDefault()
    e.stopPropagation()
    if (!press.dragging) toggle(press.target)
    else savePrefs()
    press = null
  }, true)

  // the page must not react to the swallowed gesture in any form
  ;['mousedown', 'mouseup', 'click', 'pointercancel'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!inspecting || ours(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      if (type === 'pointercancel') press = null
    }, true)
  })

  document.addEventListener('keydown', function (e) {
    if (!sel.length) return
    var st = e.shiftKey ? 8 : 1
    var move = function (dx, dy) {
      if (axis === 'y' && dx) return
      if (axis === 'x' && dy) return
      sel.forEach(function (s) {
        s.ox += dx * st
        s.oy += dy * st
        apply(s)
      })
      e.preventDefault()
    }
    if (e.key === 'ArrowLeft') move(-1, 0)
    if (e.key === 'ArrowRight') move(1, 0)
    if (e.key === 'ArrowUp') move(0, -1)
    if (e.key === 'ArrowDown') move(0, 1)
  })

  // --- loop --------------------------------------------------------------------
  function tick() {
    // the on-screen panel stays compact - a grown panel covers the very
    // elements being tuned (full metrics travel via the copy report)
    pre.textContent = 'dvh ' + px('100dvh') + ' · ' + sel.length + ' selected' + (axis === 'free' ? '' : ' · axis ' + axis)
    if (sel.length) {
      var minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity
      sel.forEach(function (s) {
        var r = s.el.getBoundingClientRect()
        s.ring.style.left = r.left - 2 + 'px'
        s.ring.style.top = r.top - 2 + 'px'
        s.ring.style.width = r.width + 2 + 'px'
        s.ring.style.height = r.height + 2 + 'px'
        if (r.left < minL) minL = r.left
        if (r.top < minT) minT = r.top
        if (r.right > maxR) maxR = r.right
        if (r.bottom > maxB) maxB = r.bottom
      })
      pad.style.display = 'block'
      if (prefs.padX != null && prefs.padY != null) {
        // parked by hand - never move it back under the user's finger
        pad.style.left = Math.min(prefs.padX, innerWidth - pad.offsetWidth - 4) + 'px'
        pad.style.top = Math.min(prefs.padY, innerHeight - pad.offsetHeight - 4) + 'px'
        return
      }
      var pw = pad.offsetWidth || 190
      var ph = pad.offsetHeight || 210
      var left = Math.min(Math.max(8, maxR + 10), innerWidth - pw - 8)
      var top = Math.min(Math.max(8, minT), innerHeight - ph - 8)
      // if the pad would cover the selection, drop it below
      if (left < maxR + 10 && top < maxB && top + ph > minT) top = Math.min(maxB + 10, innerHeight - ph - 8)
      // float/breathe animations jiggle the bbox every tick - only follow real
      // moves so the pad stays tappable
      var curL = parseFloat(pad.style.left) || 0
      var curT = parseFloat(pad.style.top) || 0
      if (Math.abs(curL - left) > 24 || Math.abs(curT - top) > 24) {
        pad.style.left = left + 'px'
        pad.style.top = top + 'px'
      }
    } else {
      pad.style.display = 'none'
    }
  }

  // Debug surface: the panel is deliberately compact, so automated checks (and
  // an agent verifying its own fix) read the live selection from here instead of
  // scraping rings out of the DOM. Also the re-entry guard.
  window.__wvtuner = {
    selection: function () { return sel.map(function (s) { return { path: selectorPath(s.el), dx: s.ox, dy: s.oy, dw: s.ow } }) },
    state: function () { return { inspecting: inspecting, axis: axis, snap: snap, step: x8 ? 8 : 1, pressing: !!press, dragging: !!(press && press.dragging) } },
    report: function () { return metrics() },
  }

  function mount() {
    document.body.appendChild(probe)
    document.body.appendChild(launcher)
    document.body.appendChild(panel)
    document.body.appendChild(pad)
    document.body.appendChild(guideV)
    document.body.appendChild(guideH)
    tick()
    setInterval(tick, 400)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
