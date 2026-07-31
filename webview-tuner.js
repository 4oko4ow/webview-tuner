/*! webview-tuner v0.1.0 - layout forensics + live nudging for uninspectable
 * wallet/in-app webviews. Tap an element, nudge it by pixels, copy a report
 * your AI assistant can act on. MIT. https://github.com/4oko4ow/webview-tuner */
(function () {
  'use strict'
  if (window.__wvtuner) return
  var script = document.currentScript
  var auto = script && script.hasAttribute('data-auto')
  if (!auto && !/[?&](wvtune|vhdebug)=1/.test(location.search)) return
  window.__wvtuner = true

  var GREEN = '#36d399'
  var picked = null
  var offset = { x: 0, y: 0, w: 0 }
  var selecting = false

  // --- probes -------------------------------------------------------------
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
    if (picked) {
      var r = picked.getBoundingClientRect()
      lines.push('sel ' + selectorPath(picked))
      lines.push('box ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @ ' + Math.round(r.left) + ',' + Math.round(r.top))
      if (offset.x || offset.y || offset.w) {
        lines.push('OVERRIDE dx ' + offset.x + ' dy ' + offset.y + (offset.w ? ' dw ' + offset.w : ''))
      }
    }
    return lines.join('\n')
  }

  // --- overrides ----------------------------------------------------------
  function apply() {
    if (!picked) return
    // `translate` is its own property - composes with transform animations
    picked.style.setProperty('translate', offset.x + 'px ' + offset.y + 'px', 'important')
    if (offset.w) {
      var base = picked.getBoundingClientRect().width - parseFloat(picked.dataset.wvBaseW || 0)
      if (!picked.dataset.wvBaseW) picked.dataset.wvBaseW = String(picked.getBoundingClientRect().width)
      picked.style.setProperty('width', parseFloat(picked.dataset.wvBaseW) + offset.w + 'px', 'important')
      picked.style.setProperty('max-width', 'none', 'important')
    }
  }

  function resetOverrides() {
    if (picked) {
      picked.style.removeProperty('translate')
      picked.style.removeProperty('width')
      picked.style.removeProperty('max-width')
      delete picked.dataset.wvBaseW
    }
    offset = { x: 0, y: 0, w: 0 }
  }

  // --- ui -----------------------------------------------------------------
  var panel = document.createElement('div')
  panel.style.cssText = 'position:fixed;top:64px;left:8px;z-index:2147483646;background:rgba(0,0,0,.85);border-radius:8px;padding:8px 10px;max-width:92vw;font:11px/1.6 ui-monospace,monospace;color:' + GREEN
  var pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;white-space:pre-wrap;color:inherit;font:inherit'
  panel.appendChild(pre)

  var ring = document.createElement('div')
  ring.style.cssText = 'position:fixed;z-index:2147483645;border:1px dashed ' + GREEN + ';pointer-events:none;display:none;border-radius:4px'

  function btn(label, onTap) {
    var b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'font:600 11px ui-monospace,monospace;color:' + GREEN + ';background:transparent;border:1px solid ' + GREEN + ';border-radius:6px;padding:4px 9px;cursor:pointer'
    b.addEventListener('click', function (e) {
      e.stopPropagation()
      onTap(b)
    })
    return b
  }

  function row() {
    var d = document.createElement('div')
    d.style.cssText = 'display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;align-items:center'
    for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i])
    return d
  }

  var selectBtn = btn('select', function (b) {
    selecting = !selecting
    b.style.background = selecting ? GREEN : 'transparent'
    b.style.color = selecting ? '#000' : GREEN
  })

  var nudge = function (dx, dy, dw) {
    return function () {
      offset.x += dx
      offset.y += dy
      offset.w += dw
      apply()
    }
  }

  var copyBtn = btn('copy', function (b) {
    var report = metrics() + '\nurl ' + location.href + '\nua ' + navigator.userAgent
    var done = function () {
      b.textContent = 'copied'
      setTimeout(function () { b.textContent = 'copy' }, 1500)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(done, function () { fallbackCopy(report); done() })
    } else {
      fallbackCopy(report)
      done()
    }
  })

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    ta.remove()
  }

  panel.appendChild(row(selectBtn, copyBtn, btn('reset', function () { resetOverrides() })))
  panel.appendChild(row(
    btn('←', nudge(-1, 0, 0)), btn('→', nudge(1, 0, 0)),
    btn('↑', nudge(0, -1, 0)), btn('↓', nudge(0, 1, 0)),
    btn('-8w', nudge(0, 0, -8)), btn('+8w', nudge(0, 0, 8))
  ))
  var hint = document.createElement('div')
  hint.textContent = 'select -> tap an element -> arrows nudge by 1px (Shift+arrows = 8px) -> copy'
  hint.style.cssText = 'margin-top:5px;color:#99a2b2;font:10px ui-monospace,monospace;max-width:260px'
  panel.appendChild(hint)

  // --- selection ----------------------------------------------------------
  document.addEventListener('click', function (e) {
    if (!selecting) return
    if (panel.contains(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    resetOverrides()
    picked = e.target
    selecting = false
    selectBtn.style.background = 'transparent'
    selectBtn.style.color = GREEN
  }, true)

  document.addEventListener('keydown', function (e) {
    if (!picked) return
    var step = e.shiftKey ? 8 : 1
    if (e.key === 'ArrowLeft') { offset.x -= step; apply(); e.preventDefault() }
    if (e.key === 'ArrowRight') { offset.x += step; apply(); e.preventDefault() }
    if (e.key === 'ArrowUp') { offset.y -= step; apply(); e.preventDefault() }
    if (e.key === 'ArrowDown') { offset.y += step; apply(); e.preventDefault() }
  })

  // --- loop ---------------------------------------------------------------
  function tick() {
    pre.textContent = metrics()
    if (picked) {
      var r = picked.getBoundingClientRect()
      ring.style.display = 'block'
      ring.style.left = r.left - 2 + 'px'
      ring.style.top = r.top - 2 + 'px'
      ring.style.width = r.width + 2 + 'px'
      ring.style.height = r.height + 2 + 'px'
    } else {
      ring.style.display = 'none'
    }
  }

  function mount() {
    document.body.appendChild(probe)
    document.body.appendChild(ring)
    document.body.appendChild(panel)
    tick()
    setInterval(tick, 500)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
