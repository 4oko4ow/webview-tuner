/*! webview-tuner v0.2.0 - layout forensics + live nudging for uninspectable
 * wallet/in-app webviews. Long-press (or right-click) an element, nudge it by
 * pixels with the floating pad, copy a report your AI assistant can act on.
 * Multi-select supported. MIT. https://github.com/4oko4ow/webview-tuner */
(function () {
  'use strict'
  if (window.__wvtuner) return
  var script = document.currentScript
  var auto = script && script.hasAttribute('data-auto')
  if (!auto && !/[?&]wvtune=1/.test(location.search)) return
  window.__wvtuner = true

  var GREEN = '#36d399'
  var GREY = '#99a2b2'
  // multi-select: every picked element carries its own offsets so the report
  // stays per-element even when they are nudged together
  var sel = [] // { el, ox, oy, ow, baseW, ring }
  var x8 = false

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

  // --- ui ---------------------------------------------------------------------
  function btn(label, onTap, wide) {
    var b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'font:600 13px ui-monospace,monospace;color:' + GREEN + ';background:transparent;border:1px solid ' + GREEN + ';border-radius:6px;padding:' + (wide ? '6px 12px' : '6px 10px') + ';cursor:pointer;touch-action:manipulation'
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
  panel.style.cssText = 'position:fixed;top:64px;left:8px;z-index:2147483646;background:rgba(0,0,0,.85);border-radius:8px;padding:8px 10px;max-width:92vw;font:11px/1.6 ui-monospace,monospace;color:' + GREEN
  panel.style.display = 'none'
  var pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;white-space:pre-wrap;color:inherit;font:inherit'
  panel.appendChild(pre)
  var copyBtn = btn('copy', function (b) {
    var report = metrics() + '\nurl ' + location.href + '\nua ' + navigator.userAgent
    var done = function () {
      b.textContent = 'copied'
      setTimeout(function () { b.textContent = 'copy' }, 1500)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(done, function () { fallbackCopy(report); done() })
    } else { fallbackCopy(report); done() }
  })
  panel.appendChild(row(copyBtn, btn('reset', function () { sel.forEach(clearOverrides) })))
  var hint = document.createElement('div')
  hint.textContent = 'tap an element to select, tap again to unselect. arrows move ALL selected. round badge exits.'
  hint.style.cssText = 'margin-top:5px;color:' + GREY + ';font:10px ui-monospace,monospace;max-width:250px'
  panel.appendChild(hint)

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    ta.remove()
  }

  // floating nudge pad - appears next to the selection
  var pad = document.createElement('div')
  pad.style.cssText = 'position:fixed;z-index:2147483646;background:rgba(0,0,0,.85);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px;display:none;width:170px'
  var step = function () { return x8 ? 8 : 1 }
  var nudge = function (dx, dy, dw) {
    return function () {
      sel.forEach(function (s) {
        s.ox += dx * step()
        s.oy += dy * step()
        s.ow += dw * step()
        apply(s)
      })
    }
  }
  var x8btn = btn('x8', function (b) {
    x8 = !x8
    b.style.background = x8 ? GREEN : 'transparent'
    b.style.color = x8 ? '#000' : GREEN
  })
  pad.appendChild(row(btn('↑', nudge(0, -1, 0), true), x8btn))
  pad.appendChild(row(btn('←', nudge(-1, 0, 0), true), btn('↓', nudge(0, 1, 0), true), btn('→', nudge(1, 0, 0), true)))
  pad.appendChild(row(btn('w-', nudge(0, 0, -1)), btn('w+', nudge(0, 0, 1)), btn('✕', function () { clearSelection() })))

  function clearSelection() {
    sel.forEach(function (s) { s.ring.remove() })
    sel = []
  }

  function toggle(el) {
    if (!el || el === document.body || el === document.documentElement) return
    if (panel.contains(el) || pad.contains(el)) return
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
    var ring = document.createElement('div')
    ring.style.cssText = 'position:fixed;z-index:2147483645;border:1px dashed ' + GREEN + ';pointer-events:none;border-radius:4px'
    document.body.appendChild(ring)
    sel.push({ el: el, ox: 0, oy: 0, ow: 0, baseW: null, ring: ring })
    hint.style.display = 'none'
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
  launcher.style.cssText = 'position:fixed;bottom:86px;right:10px;z-index:2147483647;width:44px;height:44px;padding:0;border-radius:50%;border:1px solid ' + GREEN + ';background:rgba(0,0,0,.85);color:' + GREEN + ';font:20px/1 ui-monospace,monospace;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center'
  launcher.addEventListener('click', function (e) {
    e.stopPropagation()
    e.preventDefault()
    inspecting = !inspecting
    launcher.style.background = inspecting ? GREEN : 'rgba(0,0,0,.85)'
    launcher.style.color = inspecting ? '#000' : GREEN
    panel.style.display = inspecting ? 'block' : 'none'
    if (!inspecting) clearSelection()
  })

  var tapStart = null
  ;['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!inspecting) return
      if (launcher.contains(e.target) || panel.contains(e.target) || pad.contains(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      if (type === 'pointerdown') tapStart = { x: e.clientX, y: e.clientY, target: e.target }
      if (type === 'pointerup' && tapStart) {
        // a tap, not a scroll/drag
        if (Math.abs(e.clientX - tapStart.x) < 10 && Math.abs(e.clientY - tapStart.y) < 10) {
          toggle(tapStart.target)
        }
        tapStart = null
      }
    }, true)
  })

  document.addEventListener('keydown', function (e) {
    if (!sel.length) return
    var st = e.shiftKey ? 8 : 1
    var move = function (dx, dy) {
      sel.forEach(function (s) { s.ox += dx * st; s.oy += dy * st; apply(s) })
      e.preventDefault()
    }
    if (e.key === 'ArrowLeft') move(-1, 0)
    if (e.key === 'ArrowRight') move(1, 0)
    if (e.key === 'ArrowUp') move(0, -1)
    if (e.key === 'ArrowDown') move(0, 1)
  })

  // --- loop --------------------------------------------------------------------
  function tick() {
    // the on-screen panel stays one line tall - a grown panel covers the very
    // elements being tuned (full metrics travel via the copy report)
    pre.textContent = 'dvh ' + px('100dvh') + ' \u00b7 ' + sel.length + ' selected'
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
      var pw = pad.offsetWidth || 170
      var ph = pad.offsetHeight || 130
      var left = Math.min(Math.max(8, maxR + 10), innerWidth - pw - 8)
      var top = Math.min(Math.max(8, minT), innerHeight - ph - 8)
      // if the pad would cover the selection, drop it below
      if (left < maxR + 10 && top < maxB && top + ph > minT) top = Math.min(maxB + 10, innerHeight - ph - 8)
      // float/breathe animations jiggle the bbox every tick - only follow
      // real moves so the pad stays tappable
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

  function mount() {
    document.body.appendChild(probe)
    document.body.appendChild(launcher)
    document.body.appendChild(panel)
    document.body.appendChild(pad)
    tick()
    setInterval(tick, 400)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
