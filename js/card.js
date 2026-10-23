/* Public card check: opened by scanning the QR on a donor card (card.html?c=CODE). */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = DC.esc;
  if (!DC.configured) { DC.setupNotice(); return; }

  let club = null;

  function show(html, cls) {
    $('loading').hidden = true;
    const r = $('result');
    r.className = 'sheet vcard ' + (cls || '');
    r.innerHTML = html;
    r.hidden = false;
    $('manual').hidden = false;
  }

  function render(v, code) {
    if (v.state === 'valid' || v.state === 'expired') {
      const valid = v.state === 'valid';
      const color = v.tier_color || '#5e0d1c';
      show(`
        <div class="vstate ${valid ? 'ok' : 'old'}">${valid ? DC.icons.check : DC.icons.pause}<span>${valid ? 'Valid donor card' : 'This card has expired'}</span></div>
        <div class="vname">${esc(v.name)}</div>
        <div class="tierpill" style="--tier:${esc(color)};--tier-ink:${DC.inkOn(color)}">${DC.icons.drop}${esc(v.tier_name)}</div>
        <dl class="vdl">
          <dt>Registered on</dt><dd>${esc(DC.fmtDate(v.registered_at))}</dd>
          <dt>${valid ? 'Valid until' : 'Expired on'}</dt><dd>${esc(DC.fmtDate(v.expires_at))}</dd>
          ${valid ? `<dt>Days left</dt><dd>${v.days_left}</dd>` : ''}
          <dt>Card code</dt><dd class="mono">${esc(code)}</dd>
        </dl>
        ${valid ? '' : '<p class="hint">Cards are valid for 100 days from the donation they were issued with.</p>'}`,
        valid ? 'is-valid' : 'is-expired');
    } else if (v.state === 'busy') {
      show(`<div class="vstate old"><span>Please wait a minute</span></div>
        <p>Too many cards were checked in a short time. Try again in a minute.</p>`, 'is-expired');
    } else {
      show(`<div class="vstate bad"><span>This card is not issued to anyone</span></div>
        <p>We have no donor registered with this code${code ? ` (<span class="mono">${esc(code)}</span>)` : ''}. If you were handed this card at the blood centre,
        <a href="index.html${code ? `?code=${encodeURIComponent(code)}` : ''}">log your donation</a> to activate it.</p>`, 'is-none');
    }
  }

  async function check(raw) {
    const code = DC.cleanCode(raw);
    $('result').hidden = true; $('loading').hidden = false;
    if (!DC.CODE_RE.test(code)) { render({ state: 'not_issued' }, code.length === 6 ? code : ''); return; }
    try {
      const { data, error } = await DC.client().rpc('verify_card', { p_code: code });
      if (error) throw error;
      render(data || { state: 'not_issued' }, code);
    } catch (e) {
      console.error(e);
      $('loading').hidden = true;
      DC.fail('We could not reach the server. Check your connection and try again.');
    }
  }

  $('m-code').addEventListener('input', (e) => { e.target.value = DC.cleanCode(e.target.value); });
  $('manual').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const c = DC.cleanCode($('m-code').value);
    history.replaceState(null, '', c ? `?c=${encodeURIComponent(c)}` : location.pathname);
    $('app-error').hidden = true;
    check(c);
  });

  (async function init() {
    try {
      club = await DC.loadClub();
      $('brand').textContent = club.settings.club_name;
      $('footer').innerHTML = DC.footerHTML(club);
    } catch (e) { console.error(e); }
    const c = new URLSearchParams(location.search).get('c');
    if (c) check(c);
    else { $('loading').hidden = true; $('manual').hidden = false; }
  })();
})();
