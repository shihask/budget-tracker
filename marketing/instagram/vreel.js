// Value reels (phase 1: grow followers, no app). Each vreel-*.html sets window.VREEL to a list of
// scenes and loads this file after reel-kit.js; this builds the DOM and the render(t) timeline.
//
// Scene types:
//   { type: 'hook',  dur, lines: [...], soft?: '...' }          big lines on green
//   { type: 'rows',  dur, kicker, rows: [[label, value, hl?]], note? }   card rows appear in turn
//   { type: 'steps', dur, kicker, steps: [...] }                numbered steps appear in turn
//   { type: 'quote', dur, text, em, bg? }                        words appear one by one
//   { type: 'follow', dur, tagline?, cta?, save? }               the closing follow card (texts overridable, e.g. Malayalam)
// Every figure must be arithmetic the viewer can check (see content-plan.md guardrails).

(function () {
  const cfg = window.VREEL
  const root = document.createElement('div')
  document.body.appendChild(root)
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

  let t0 = 0
  const scenes = cfg.map((s, i) => {
    const start = t0; t0 += s.dur
    const id = 'v' + i
    let html = ''
    if (s.type === 'hook') {
      html = `<section class="scene green" id="${id}"><div style="flex:1"></div>
        ${s.lines.map((l, j) => `<div class="big el" id="${id}l${j}">${esc(l)}</div>`).join('')}
        ${s.soft ? `<div style="height:70px"></div><div class="mid soft el" id="${id}s">${esc(s.soft)}</div>` : ''}
        <div style="flex:1.3"></div></section>`
    } else if (s.type === 'rows') {
      html = `<section class="scene cream" id="${id}">
        <div class="kicker el" id="${id}k">${esc(s.kicker)}</div>
        <div class="vcard card el" id="${id}c">${s.rows.map((r, j) =>
          `<div class="vrow el${r[2] ? ' hl' : ''}" id="${id}r${j}"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>
        ${s.note ? `<div class="note el" id="${id}n" style="margin-top:24px">${esc(s.note)}</div>` : ''}
      </section>`
    } else if (s.type === 'steps') {
      html = `<section class="scene cream" id="${id}">
        <div class="kicker el" id="${id}k">${esc(s.kicker)}</div>
        <div class="vsteps">${s.steps.map((st, j) =>
          `<div class="vstep el" id="${id}r${j}"><span class="vn">${j + 1}</span><span>${esc(st)}</span></div>`).join('')}</div>
      </section>`
    } else if (s.type === 'quote') {
      const words = s.text.split(' ').map((w, j) => `<span class="w" id="${id}w${j}">${esc(w)} </span>`).join('')
      const em = s.em.split(' ').map((w, j) => `<span class="w em" id="${id}e${j}">${esc(w)} </span>`).join('')
      html = `<section class="scene ${s.bg || 'ink'}" id="${id}"><div style="flex:1"></div>
        <div class="vmark">“</div><div class="vquote">${words}${em}</div>
        <div style="flex:1.3"></div></section>`
    } else if (s.type === 'follow') {
      html = `<section class="scene green end" id="${id}">
        <img class="logo el" src="../../public/email-logo.png" alt="">
        <div class="name el" style="font-size:84px">@moneyplant.online</div>
        <div class="tagline el">${esc(s.tagline || 'Practical money ideas for salaried families')}</div>
        <div class="pill el vfollow"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>${esc(s.cta || 'Follow for more')}</div>
        <div class="vsave el">${esc(s.save || 'Save this for later')}</div>
      </section>`
    }
    root.insertAdjacentHTML('beforeend', html)
    return { ...s, id, start }
  })
  const DURATION = t0

  function render(t) {
    for (const s of scenes) {
      const a = s.start, id = s.id, q = sel => document.getElementById(id + sel)
      if (s.type === 'follow') { endCard($(id), t, a, DURATION); rise(document.querySelector(`#${id} .vsave`), t, a + 1.2); continue }
      scene($(id), t, a, a + s.dur, .3)
      if (s.type === 'hook') {
        s.lines.forEach((_, j) => rise(q('l' + j), t, a + .1 + j * .3, .4))
        if (s.soft) rise(q('s'), t, a + .2 + s.lines.length * .3 + .25, .45)
      } else if (s.type === 'rows' || s.type === 'steps') {
        rise(q('k'), t, a + .05, .35, 30)
        if (s.type === 'rows') rise(q('c'), t, a + .1, .35, 40)
        const n = s.type === 'rows' ? s.rows.length : s.steps.length
        const gap = Math.min(.9, (s.dur - 1.6) / n)
        for (let j = 0; j < n; j++) rise(q('r' + j), t, a + .35 + j * gap, .35, 30)
        if (s.note) rise(q('n'), t, a + .35 + n * gap, .35, 0)
      } else if (s.type === 'quote') {
        const words = s.text.split(' ').length, ems = s.em.split(' ').length
        const step = Math.min(.28, (s.dur - 1.4) / (words + ems))
        for (let j = 0; j < words; j++) rise(q('w' + j), t, a + .2 + j * step, .3, 20)
        for (let j = 0; j < ems; j++) rise(q('e' + j), t, a + .2 + (words + j) * step, .3, 20)
      }
    }
  }

  // stills: the middle of each scene, plus the last frame
  boot(render, DURATION, [...scenes.map(s => +(s.start + s.dur * .75).toFixed(2)), +(DURATION - .2).toFixed(2)])
})()
