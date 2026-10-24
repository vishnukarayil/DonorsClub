(function () {
  const $ = (id) => document.getElementById(id);
  const esc = DC.esc;
  if (!DC.configured) { DC.setupNotice(); return; }

  let club = null;

  $('l-phone').addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length > 10) {
      if (d.startsWith('91') && d.length === 12) d = d.slice(2);
      else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
    }
    e.target.value = d.slice(0, 10);
  });

  /* kind 'code': phone + any card code.  kind 'dob': old way, only for donors who have no card yet. */
  async function fetchProfile(phone, cred, kind) {
    const { data, error } = kind === 'dob'
      ? await DC.client().rpc('get_profile', { p_phone: phone, p_dob: cred })
      : await DC.client().rpc('get_profile_by_code', { p_phone: phone, p_code: cred });
    if (error) throw error;
    return data;           // null when there is no match; {locked:true} when too many wrong tries
  }

  let mode = 'code';
  function setMode(m) {
    mode = m;
    $('l-code-wrap').hidden = m !== 'code';
    $('l-dob-wrap').hidden = m !== 'dob';
    $('l-intro').textContent = m === 'code'
      ? 'Enter the mobile number you used when you donated, and the 6-character code from any of your donor cards.'
      : 'Enter the mobile number you used when you donated, and your date of birth. This works only until you receive your first donor card.';
    $('l-switch').textContent = m === 'code' ? 'I have no card yet: use my date of birth' : 'I have a card: use my card code';
  }
  $('l-switch').addEventListener('click', () => setMode(mode === 'code' ? 'dob' : 'code'));
  $('l-code').addEventListener('input', (e) => { e.target.value = DC.cleanCode(e.target.value); });

  function showLookup(msg) {
    $('loading').hidden = true;
    $('profile').hidden = true;
    $('lookup').hidden = false;
    const a = $('lookup-alert');
    a.hidden = !msg; a.textContent = msg || '';
  }

  /* ---------- rendering ---------- */
  function render(p) {
    const tiers = club ? club.tiers : [];
    const s = club ? club.settings : null;
    const expired = p.days_left <= 0;
    const pct = Math.max(0, Math.min(100, Math.round((p.days_left / p.validity_days) * 100)));
    const gauge = expired ? '#8b95a3' : p.days_left <= 10 ? '#c8102e' : p.days_left <= 30 ? '#b86e00' : '#138a5e';
    const maxRank = tiers.length ? tiers[tiers.length - 1].rank : p.tier_rank;
    const next = tiers.find((t) => t.rank === p.tier_rank + 1);
    const nextDue = new Date(p.next_eligible_at) > new Date();

    const ladder = tiers.map((t) => {
      const cls = t.rank < p.tier_rank ? 'done' : t.rank === p.tier_rank ? 'now' : '';
      return `<i class="${cls}" style="--c:${esc(t.color)}" title="${esc(t.name)}"></i>`;
    }).join('');

    const perks = (club ? club.benefits : []).map((b) => {
      const unlocked = b.min_rank <= p.tier_rank;
      const req = tiers.find((t) => t.rank === b.min_rank);
      const cls = !unlocked ? 'locked' : expired ? 'paused' : '';
      const ico = !unlocked ? DC.icons.lock : expired ? DC.icons.pause : DC.icons.check;
      const tag = !unlocked ? `<span class="tag">Unlocks at ${esc(req ? req.name : 'a higher tier')}</span>`
                : expired ? '<span class="tag">Paused until you donate again</span>' : '';
      return `<li class="perk ${cls}"><span class="ico">${ico}</span><div><b>${esc(b.title)}</b>${b.description ? `<span class="d">${esc(b.description)}</span>` : ''}${tag}</div></li>`;
    }).join('');

    const tel = s ? String(s.enquiry_phone).replace(/[^\d+]/g, '') : '';
    const contact = s ? `
      <div class="psec">
        <h2>Contact the blood centre</h2>
        <div class="contact">
          <a class="btn ghost" href="tel:${esc(tel)}">${DC.icons.phone}<div>${esc(s.enquiry_phone)}<small>Blood enquiries and doubts about donation</small></div></a>
          <a class="btn ghost" href="mailto:${esc(s.feedback_email)}">${DC.icons.mail}<div>${esc(s.feedback_email)}<small>Complaints and feedback</small></div></a>
        </div>
      </div>` : '';

    $('profile').innerHTML = `
      <article class="pcard" style="--tier:${esc(p.tier_color)};--tier-ink:${DC.inkOn(p.tier_color)}">
        <div class="phead">
          <div class="avatar">${DCAvatar.svg(p.gender, p.tier_color)}</div>
          <h1>${esc(p.name)}</h1>
          <div class="tierpill">${DC.icons.drop}${esc(p.tier_name)}</div>
          <div class="pmeta">
            <span class="pbadge">Blood group <b>${esc(p.blood_group)}</b></span>
            <span class="pbadge"><b>${p.donation_count}</b> ${p.donation_count === 1 ? 'donation' : 'donations'}</span>
          </div>
        </div>

        <div class="psec">
          <h2>Membership validity</h2>
          <div class="gauge-top">
            <div class="gauge-num">${p.days_left} <small>of ${p.validity_days} days left</small></div>
          </div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.validity_days}" aria-valuenow="${p.days_left}" aria-label="Days of membership benefits left" style="--gauge:${gauge}"><i id="fill"></i></div>
          <div class="scale"><span>0</span><span>${Math.round(p.validity_days * .25)}</span><span>${Math.round(p.validity_days * .5)}</span><span>${Math.round(p.validity_days * .75)}</span><span>${p.validity_days}</span></div>
          ${expired
            ? `<p class="gauge-note expired">Your benefits are paused. Donate again to switch them on for another ${p.validity_days} days.</p>`
            : `<p class="gauge-note">Benefits are valid until <b>${DC.fmtDate(p.valid_until)}</b>. Last donation: ${DC.fmtDate(p.last_donated_at)}.</p>`}
          <p class="gauge-note" style="margin-top:6px">${nextDue ? `You can donate again from <b>${DC.fmtDate(p.next_eligible_at)}</b>.` : 'You are due for your next donation.'}</p>
        </div>

        <div class="psec">
          <h2>Your tier</h2>
          <div class="ladder" role="img" aria-label="Tier ${p.tier_rank} of ${maxRank}: ${esc(p.tier_name)}">${ladder}</div>
          <p class="ladder-note">${next ? `Your next donation takes you to <b>${esc(next.name)}</b>.` : 'You have reached the highest tier.'}</p>
        </div>

        <div class="psec">
          <h2>Membership benefits</h2>
          <ul class="perks">${perks || '<li class="hint">Benefits will appear here soon.</li>'}</ul>
          <p class="disclaimer" style="margin:12px 0 0">${esc(s ? s.disclaimer : 'Tier levels and membership benefits are subject to change as per our policies. Ahalia blood transfusion services never promotes monetary incentivization of blood donation.')}</p>
        </div>

        ${contact}
      </article>

      <div style="margin-top:16px">
        <button class="btn ghost block" id="install" type="button" hidden>${DC.icons.install} Add to home screen</button>
      </div>
      <p class="center" style="margin:8px 0 0"><button class="linkbtn" id="forget" type="button">Not you? Remove this profile from this device</button></p>`;

    $('loading').hidden = true;
    $('lookup').hidden = true;
    $('profile').hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = $('fill'); if (f) f.style.width = pct + '%'; }));
    DC.initInstall($('install'), $('install-dlg'));
    $('forget').addEventListener('click', () => { DC.store.clear(); location.reload(); });
  }

  /* ---------- lookup form ---------- */
  $('lookup').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const phone = $('l-phone').value.trim();
    const cred = mode === 'code' ? DC.cleanCode($('l-code').value) : $('l-dob').value;
    const alertEl = $('lookup-alert');
    alertEl.hidden = true;
    const bad = (m) => { alertEl.hidden = false; alertEl.textContent = m; };
    if (!/^[6-9][0-9]{9}$/.test(phone)) return bad('Enter the 10-digit mobile number you used when you donated.');
    if (mode === 'code' && !DC.CODE_RE.test(cred)) return bad('Enter the 6-character code printed on your card.');
    if (mode === 'dob' && !cred) return bad('Enter your date of birth.');
    const btn = $('lookup-btn'); btn.disabled = true; btn.textContent = 'Checking...';
    try {
      const p = await fetchProfile(phone, cred, mode);
      if (p && p.locked) { showLookup('Too many wrong tries. Please wait 15 minutes and try again, or use your card code.'); return; }
      if (!p) {
        showLookup(mode === 'code'
          ? 'We could not find a profile for that number and card code. Check both, and use the same number you gave when you donated.'
          : 'We could not find a profile for that number and date of birth. If you have received a donor card, use its code instead.');
        return;
      }
      DC.store.set(phone, cred, mode);
      render(p);
    } catch (e) {
      console.error(e);
      showLookup('We could not reach the server. Check your connection and try again.');
    } finally { btn.disabled = false; btn.textContent = 'Open my profile'; }
  });

  /* ---------- start ---------- */
  (async function init() {
    try {
      club = await DC.loadClub();
      $('brand').textContent = club.settings.club_name;
      $('footer').innerHTML = DC.footerHTML(club);
      $('l-switch').hidden = !club.settings.allow_dob_login;      // date-of-birth login can be switched off by the admin
    } catch (e) {
      console.error(e);
      DC.fail('Could not load the latest club details.');
    }
    const saved = DC.store.get();
    if (saved.phone && saved.cred) {
      try {
        const p = await fetchProfile(saved.phone, saved.cred, saved.kind === 'dob' ? 'dob' : 'code');
        if (p && !p.locked) { render(p); return; }
        if (p && p.locked) { showLookup(); return; }
        DC.store.clear();
      } catch (e) {
        console.error(e);
        showLookup('We could not reach the server. Check your connection and try again.');
        return;
      }
    }
    showLookup();
  })();
})();
