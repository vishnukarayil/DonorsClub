(function () {
  const $ = (id) => document.getElementById(id);
  const esc = DC.esc;
  if (!DC.configured) { DC.setupNotice(); return; }

  const sb = window.supabase.createClient(DC.cfg.SUPABASE_URL, DC.cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  let settings = null;
  let tiers = [];
  const PAGE = 25;
  let page = 0, total = 0;
  let curDonor = null;

  /* ---------- small helpers ---------- */
  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3000);
  }
  const must = (r) => { if (r.error) throw r.error; return r.data; };
  function friendly(e) {
    if (!e) return 'Something went wrong.';
    if (e.code === '23505') return 'That mobile number already belongs to another donor.';
    if (e.code === '23514') return 'One of the values is not allowed. Check the blood group, phone, pincode and date of birth.';
    if (e.code === '42501') return 'You do not have permission to do that.';
    return e.message || 'Something went wrong.';
  }
  async function act(fn) {
    try { return await fn(); } catch (e) { console.error(e); toast(friendly(e), true); }
  }
  const istLocal = (iso) => new Date(new Date(iso).getTime() + 19800000).toISOString().slice(0, 16);
  const fromIst = (s) => new Date(s + ':00+05:30').toISOString();
  const sel = (a, b) => (a === b ? 'selected' : '');
  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const tierFor = (count) => tiers.length ? tiers[Math.min(Math.max(count, 1), tiers.length) - 1] : null;
  const threeMonthsAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d; };

  /* ---------- sign in ---------- */
  function showLogin(msg) {
    $('app').hidden = true; $('login').hidden = false;
    const a = $('login-alert'); a.hidden = !msg; a.textContent = msg || '';
  }
  async function checkAdmin() {
    const { data, error } = await sb.rpc('is_admin');
    if (error) throw error;
    return data === true;
  }
  async function boot() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return showLogin();
    if (!(await checkAdmin())) { await sb.auth.signOut(); return showLogin('This account is not an administrator.'); }
    await showApp(data.session.user);
  }
  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('login-btn'); btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const { error } = await sb.auth.signInWithPassword({ email: $('a-email').value.trim(), password: $('a-pass').value });
      if (error) {
        const keyBad = error.status === 401 || error.status === 403 || /api key|apikey|jwt/i.test(error.message || '');
        showLogin(keyBad ? 'The site cannot connect: the Supabase key in js/config.js is not valid or was revoked.' : 'Wrong e-mail or password.');
        return;
      }
      $('a-pass').value = '';
      await boot();
    } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  $('signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  async function loadMeta() {
    settings = must(await sb.from('club_settings').select('*').eq('id', 1).single());
    tiers = must(await sb.from('tiers').select('rank,name,color').order('rank'));
    $('a-brand').textContent = settings.club_name + ' admin';
    $('a-legal').textContent = DC.legalText(settings) + ' ' + DC.versionText(settings) + '.';
    document.title = settings.club_name + ' admin';
  }

  async function showApp(user) {
    $('login').hidden = true; $('app').hidden = false;
    $('a-user').textContent = user.email || '';
    await act(loadMeta);
    openTab('donors');
    act(refreshBadge);
  }

  /* ---------- tabs ---------- */
  const loaders = { donors: loadDonors, review: loadReview, cards: loadCards, tiers: loadTiers, benefits: loadBenefits, banner: loadBanners, settings: loadSettingsForm };
  function openTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('[role=tabpanel]').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    act(loaders[name]);
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

  async function refreshBadge() {
    const r = await sb.from('donations').select('id', { count: 'exact', head: true }).eq('status', 'flagged');
    const b = $('review-badge');
    b.textContent = r.count || 0; b.hidden = !r.count;
  }

  /* =====================================================================
     DONORS
     ===================================================================== */
  function filters() {
    return {
      q: $('f-search').value.replace(/[%,()*.\\]/g, ' ').trim(),
      bg: $('f-bg').value, ah: $('f-ah').value, due: $('f-due').checked, sort: $('f-sort').value
    };
  }
  function donorQuery(f, withCount) {
    let q = sb.from('donor_summary').select('*', withCount ? { count: 'exact' } : undefined).gt('donation_count', 0);
    if (f.bg) q = q.eq('blood_group', f.bg);
    if (f.ah) q = q.eq('works_in_ahalia', f.ah === 'yes');
    if (f.due) q = q.lt('last_donated_at', threeMonthsAgo().toISOString());
    if (f.q) q = q.or(`name.ilike.*${f.q}*,phone.like.*${f.q}*,village_town.ilike.*${f.q}*`);
    switch (f.sort) {
      case 'last_old': q = q.order('last_donated_at', { ascending: true }); break;
      case 'name':     q = q.order('name', { ascending: true }); break;
      case 'count':    q = q.order('donation_count', { ascending: false }).order('name'); break;
      case 'joined':   q = q.order('created_at', { ascending: false }); break;
      default:         q = q.order('last_donated_at', { ascending: false, nullsFirst: false });
    }
    return q;
  }

  async function loadStats() {
    const validFrom = new Date(Date.now() - settings.validity_days * 86400000).toISOString();
    const base = () => sb.from('donor_summary').select('id', { count: 'exact', head: true }).gt('donation_count', 0);
    const [a, b, c] = await Promise.all([base(), base().gte('last_donated_at', validFrom), base().lt('last_donated_at', threeMonthsAgo().toISOString())]);
    $('stats').innerHTML = `
      <div class="stat"><b>${a.count ?? 0}</b><span>Donors in the club</span></div>
      <div class="stat"><b>${b.count ?? 0}</b><span>Benefits currently valid</span></div>
      <div class="stat"><b>${c.count ?? 0}</b><span>Last donated over 3 months ago</span></div>`;
  }

  async function loadDonors() {
    const f = filters();
    const res = await donorQuery(f, true).range(page * PAGE, page * PAGE + PAGE - 1);
    if (res.error) throw res.error;
    total = res.count || 0;
    if (page > 0 && !res.data.length) { page = Math.max(0, Math.ceil(total / PAGE) - 1); return loadDonors(); }
    renderDonors(res.data);
    const from = total ? page * PAGE + 1 : 0, to = Math.min(total, page * PAGE + PAGE);
    $('page-info').textContent = total ? `${from}–${to} of ${total}` : 'No donors';
    $('prev').disabled = page === 0; $('next').disabled = to >= total;
    loadStats().catch(console.error);
  }

  function renderDonors(rows) {
    const body = $('donor-body');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="13" class="empty">No donors match these filters.</td></tr>'; return; }
    const cutoff = threeMonthsAgo();
    body.innerHTML = rows.map((r) => {
      const t = tierFor(r.donation_count);
      const valid = r.last_donated_at ? new Date(new Date(r.last_donated_at).getTime() + settings.validity_days * 86400000) : null;
      const expired = valid && valid < new Date();
      const due = r.last_donated_at && new Date(r.last_donated_at) < cutoff;
      return `<tr data-id="${esc(r.id)}">
        <td><input class="w-name" data-k="name" maxlength="80" value="${esc(r.name)}" aria-label="Name"></td>
        <td><input class="w-phone" data-k="phone" inputmode="numeric" maxlength="10" value="${esc(r.phone)}" aria-label="Mobile"></td>
        <td><input class="w-dob" type="date" data-k="dob" value="${esc(r.dob)}" aria-label="Date of birth"></td>
        <td><select data-k="gender" aria-label="Gender"><option value="male" ${sel('male', r.gender)}>Male</option><option value="female" ${sel('female', r.gender)}>Female</option><option value="other" ${sel('other', r.gender)}>Other</option></select></td>
        <td><select data-k="blood_group" aria-label="Blood group">${BLOOD.map((b) => `<option ${sel(b, r.blood_group)}>${b}</option>`).join('')}</select></td>
        <td><input class="w-place" data-k="village_town" maxlength="80" value="${esc(r.village_town)}" aria-label="Village or town"></td>
        <td><input class="w-pin" data-k="pincode" inputmode="numeric" maxlength="6" value="${esc(r.pincode)}" aria-label="Pincode"></td>
        <td><select data-k="works_in_ahalia" aria-label="Works at Ahalia"><option value="no" ${sel(false, r.works_in_ahalia)}>No</option><option value="yes" ${sel(true, r.works_in_ahalia)}>Yes</option></select></td>
        <td class="num">${r.donation_count}${r.flagged_count ? ` <span class="pill flagged">${r.flagged_count} flagged</span>` : ''}</td>
        <td>${t ? `<span class="chip-tier" style="background:${esc(t.color)};color:${DC.inkOn(t.color)}">${esc(t.name)}</span>` : ''}</td>
        <td class="nowrap">${DC.fmtDate(r.last_donated_at)}${due ? '<span class="pill due">due</span>' : ''}</td>
        <td class="nowrap">${valid ? (expired ? `<span style="color:var(--red-deep);font-weight:600">Expired ${DC.fmtDate(valid)}</span>` : DC.fmtDate(valid)) : ''}</td>
        <td class="actions"><button class="btn primary" data-save disabled>Save</button><button class="btn ghost" data-don>Donations</button></td>
      </tr>`;
    }).join('');
  }

  const body = $('donor-body');
  body.addEventListener('input', markDirty);
  body.addEventListener('change', markDirty);
  function markDirty(e) {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (e.target.dataset.k === 'phone') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (e.target.dataset.k === 'pincode') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    tr.classList.add('dirty');
    const s = tr.querySelector('[data-save]'); if (s) s.disabled = false;
  }
  body.addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (e.target.closest('[data-save]')) act(() => saveDonorRow(tr));
    if (e.target.closest('[data-don]')) openDonations(tr.dataset.id, tr.querySelector('[data-k=name]').value);
  });

  async function saveDonorRow(tr) {
    const v = {};
    tr.querySelectorAll('[data-k]').forEach((i) => { v[i.dataset.k] = i.value.trim(); });
    if (v.name.length < 2) return toast('Enter the donor’s name.', true);
    if (!/^[6-9][0-9]{9}$/.test(v.phone)) return toast('The mobile number must be 10 digits.', true);
    if (!/^[1-9][0-9]{5}$/.test(v.pincode)) return toast('The pincode must be 6 digits.', true);
    if (!v.dob) return toast('Enter the date of birth.', true);
    if (v.village_town.length < 2) return toast('Enter the village or town.', true);
    v.works_in_ahalia = v.works_in_ahalia === 'yes';
    must(await sb.from('donors').update(v).eq('id', tr.dataset.id));
    toast('Saved.');
    await loadDonors();
  }

  let searchTimer;
  $('f-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 0; act(loadDonors); }, 300); });
  ['f-bg', 'f-ah', 'f-due', 'f-sort'].forEach((id) => $(id).addEventListener('change', () => { page = 0; act(loadDonors); }));
  $('prev').addEventListener('click', () => { page = Math.max(0, page - 1); act(loadDonors); });
  $('next').addEventListener('click', () => { page += 1; act(loadDonors); });

  $('export').addEventListener('click', () => act(async () => {
    const f = filters(); const out = []; let from = 0;
    for (;;) {
      const r = must(await donorQuery(f, false).range(from, from + 999));
      out.push(...r); if (r.length < 1000) break; from += 1000;
    }
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const head = ['Name', 'Mobile', 'Date of birth', 'Gender', 'Blood group', 'Village or town', 'Pincode', 'Works at Ahalia', 'Donations', 'Tier', 'Last donated', 'Benefits valid until'];
    const lines = [head.map(cell).join(',')];
    out.forEach((r) => {
      const t = tierFor(r.donation_count);
      const valid = r.last_donated_at ? new Date(new Date(r.last_donated_at).getTime() + settings.validity_days * 86400000) : null;
      lines.push([r.name, r.phone, r.dob, r.gender, r.blood_group, r.village_town, r.pincode, r.works_in_ahalia ? 'Yes' : 'No', r.donation_count,
        t ? t.name : '', DC.fmtDate(r.last_donated_at), valid ? DC.fmtDate(valid) : ''].map(cell).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'donors-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Exported ${out.length} donors.`);
  }));

  /* ---------- donations dialog ---------- */
  const statusLabel = { active: 'Counted', flagged: 'Flagged', rejected: 'Deleted' };
  async function openDonations(donorId, name) {
    curDonor = donorId;
    $('don-title').textContent = 'Donations: ' + name;
    $('don-sub').textContent = 'Fix a wrong date, flag a suspicious entry for review, or add a donation made at the centre.';
    $('don-new').value = istLocal(new Date().toISOString());
    $('don-dlg').showModal();
    await act(loadDonations);
  }
  async function loadDonations() {
    const rows = must(await sb.from('donations').select('*').eq('donor_id', curDonor).order('donated_at', { ascending: false }));
    const cardOf = {};
    must(await sb.from('cards').select('code,donation_id').eq('donor_id', curDonor)).forEach((c) => { if (c.donation_id) cardOf[c.donation_id] = c.code; });
    $('don-body').innerHTML = rows.map((d) => {
      const acts = d.status === 'rejected'
        ? '<button class="btn ghost" data-act="restore">Restore</button>'
        : `<button class="btn ghost" data-act="time">Save time</button>${d.status === 'flagged'
            ? '<button class="btn ghost" data-act="keep">Keep</button>'
            : '<button class="btn ghost" data-act="flag">Flag</button>'}<button class="btn danger" data-act="delete">Delete</button>`;
      return `<tr data-id="${esc(d.id)}">
        <td><input type="datetime-local" data-k="dt" value="${istLocal(d.donated_at)}" ${d.status === 'rejected' ? 'disabled' : ''} aria-label="Donation date and time"></td>
        <td><span class="pill ${esc(d.status)}">${statusLabel[d.status]}</span>${d.flag_reason ? `<div class="hint">${esc(d.flag_reason)}</div>` : ''}</td>
        <td>${d.source === 'admin' ? 'By staff' : 'Web form'}</td>
        <td class="mono">${esc(cardOf[d.id] || '')}</td>
        <td class="actions">${acts}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">No donations.</td></tr>';
  }
  $('don-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const tr = b.closest('tr'), id = tr.dataset.id;
    act(async () => {
      const a = b.dataset.act;
      if (a === 'time') {
        const v = tr.querySelector('[data-k=dt]').value; if (!v) return toast('Pick a date and time.', true);
        must(await sb.from('donations').update({ donated_at: fromIst(v) }).eq('id', id));
      } else if (a === 'flag') {
        const reason = window.prompt('Why are you flagging this entry?', '');
        if (reason === null) return;
        must(await sb.from('donations').update({ status: 'flagged', flag_reason: reason.trim() || 'Flagged by admin' }).eq('id', id));
      } else if (a === 'keep' || a === 'restore') {
        must(await sb.from('donations').update({ status: 'active' }).eq('id', id));
      } else if (a === 'delete') {
        if (!window.confirm('Delete this entry? It will stop counting towards the donor’s tier. You can restore it later from the Review tab.')) return;
        must(await sb.from('donations').update({ status: 'rejected' }).eq('id', id));
        await offerFreeCard(id);
      }
      toast('Updated.');
      await loadDonations(); await loadDonors(); await refreshBadge();
    });
  });
  $('don-add').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const v = $('don-new').value; if (!v) return toast('Pick a date and time.', true);
      must(await sb.from('donations').insert({ donor_id: curDonor, donated_at: fromIst(v), source: 'admin' }));
      toast('Donation added.');
      await loadDonations(); await loadDonors();
    });
  });

  /* a deleted entry leaves its card used up; offer to give the card back to its holder */
  async function offerFreeCard(donationId) {
    const c = must(await sb.from('cards').select('code').eq('donation_id', donationId).maybeSingle());
    if (!c) return;
    if (window.confirm(`This entry was made with card ${c.code}. Make the card usable again?\n\nChoose OK if the card is genuine and its holder simply made a mistake. Choose Cancel if the card was misused: it then stays blocked.`)) {
      must(await sb.rpc('admin_free_card_for_donation', { p_donation: donationId }));
      toast(`Card ${c.code} can be used again.`);
    }
  }

  /* =====================================================================
     REVIEW
     ===================================================================== */
  const DON_SELECT = 'id,donated_at,status,flag_reason,flagged_at,source,donor:donors(name,phone,dob,gender,blood_group,village_town,pincode,works_in_ahalia)';
  function reviewCard(d, kind) {
    const x = d.donor || {};
    const buttons = kind === 'flagged'
      ? '<button class="btn ghost" data-act="keep">Keep entry</button><button class="btn danger" data-act="delete">Delete entry</button>'
      : '<button class="btn ghost" data-act="restore">Restore</button>';
    return `<article class="rcard" data-id="${esc(d.id)}">
      <h4>${esc(x.name)}</h4>
      ${d.flag_reason ? `<div class="why">${esc(d.flag_reason)}</div>` : ''}
      <dl>
        <dt>Mobile</dt><dd>${esc(x.phone)}</dd>
        <dt>Born</dt><dd>${esc(x.dob)} (${esc(x.gender)})</dd>
        <dt>Blood group</dt><dd>${esc(x.blood_group)}</dd>
        <dt>Place</dt><dd>${esc(x.village_town)} ${esc(x.pincode)}</dd>
        <dt>At Ahalia</dt><dd>${x.works_in_ahalia ? 'Yes' : 'No'}</dd>
        <dt>Donated</dt><dd>${DC.fmtDateTime(d.donated_at)}</dd>
        <dt>Entered</dt><dd>${d.source === 'admin' ? 'By staff' : 'Web form'}</dd>
      </dl>
      <div class="actions">${buttons}</div></article>`;
  }
  async function loadReview() {
    const [f, r] = await Promise.all([
      sb.from('donations').select(DON_SELECT).eq('status', 'flagged').order('flagged_at', { ascending: true }),
      sb.from('donations').select(DON_SELECT).eq('status', 'rejected').order('reviewed_at', { ascending: false }).limit(100)
    ]);
    const flagged = must(f), rejected = must(r);
    $('flagged-list').innerHTML = flagged.map((d) => reviewCard(d, 'flagged')).join('') || '<p class="hint">Nothing is waiting for review.</p>';
    $('rejected-list').innerHTML = rejected.map((d) => reviewCard(d, 'rejected')).join('') || '<p class="hint">No deleted entries.</p>';
    $('purge').hidden = !rejected.length;
    refreshBadge();
  }
  $('tab-review').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.rcard').dataset.id;
    act(async () => {
      if (b.dataset.act === 'delete') {
        if (!window.confirm('Delete this entry? It will stop counting towards the donor’s tier.')) return;
        must(await sb.from('donations').update({ status: 'rejected' }).eq('id', id));
        await offerFreeCard(id);
      } else {
        must(await sb.from('donations').update({ status: 'active' }).eq('id', id));
      }
      toast('Updated.'); await loadReview();
    });
  });
  $('purge').addEventListener('click', () => act(async () => {
    if (!window.confirm('Permanently remove every deleted entry, and any donor left with no entries? This cannot be undone.')) return;
    const r = must(await sb.rpc('admin_purge_rejected'));
    toast(`Removed ${r.donations} entries and ${r.donors} donors.`);
    await loadReview();
  }));


  /* =====================================================================
     CARDS
     ===================================================================== */
  const CODE = DC.CODE_RE;
  const stamp = (iso) => DC.fmtDate(iso);

  async function loadCards() {
    await loadMeta();
    const rows = must(await sb.from('card_batch_summary').select('*').order('created_at', { ascending: false }));
    $('batch-body').innerHTML = rows.map((b) => {
      const active = !!b.activated_at;
      return `<tr data-id="${esc(b.id)}" data-label="${esc(b.label || '')}">
        <td><b>${esc(b.label || 'Untitled batch')}</b>${active ? '' : ' <span class="pill flagged">not activated</span>'}</td>
        <td class="nowrap">${stamp(b.created_at)}</td>
        <td class="num">${b.total}</td><td class="num">${b.stock}</td><td class="num">${b.issued}</td><td class="num">${b.claimed}</td><td class="num">${b.void}</td>
        <td class="actions">
          ${active ? '' : '<button class="btn primary" data-bact="activate">Activate</button>'}
          <button class="btn ghost" data-bact="print">Print sheet</button>
          <button class="btn ghost" data-bact="csv">CSV</button>
          <button class="btn danger" data-bact="delete" ${b.claimed ? 'disabled title="Cards from this batch have been used"' : ''}>Delete</button>
        </td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">No cards yet. Generate your first batch above.</td></tr>';
  }

  $('card-gen').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const n = Number($('cg-count').value);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return toast('Choose between 1 and 1000 cards.', true);
      const r = must(await sb.rpc('admin_generate_cards', { p_count: n, p_label: $('cg-label').value.trim() || null }));
      $('cg-label').value = '';
      toast(`${r.count} cards generated. Print them, then press Activate.`);
      await loadCards();
    });
  });

  async function batchCards(id) {
    const out = []; let from = 0;
    for (;;) {
      const r = must(await sb.from('cards').select('code,status').eq('batch_id', id).neq('status', 'void').order('code').range(from, from + 999));
      out.push(...r); if (r.length < 1000) break; from += 1000;
    }
    return out;
  }

  $('batch-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bact]'); if (!b) return;
    const tr = b.closest('tr'), id = tr.dataset.id, label = tr.dataset.label || 'this batch';
    act(async () => {
      const a = b.dataset.bact;
      if (a === 'activate') {
        if (!window.confirm(`Activate "${label}"? Every card in it becomes usable on the donation form. Do this only when the printed cards are in your hands.`)) return;
        const r = must(await sb.rpc('admin_activate_batch', { p_batch: id }));
        toast(`${r.activated} cards are now ready to use.`);
        await loadCards();
      } else if (a === 'delete') {
        if (!window.confirm(`Delete "${label}" and all its unused cards? Printed cards from it will stop working.`)) return;
        must(await sb.from('card_batches').delete().eq('id', id));
        toast('Batch deleted.'); await loadCards();
      } else if (a === 'csv') {
        const cards = await batchCards(id);
        const lines = ['code,url', ...cards.map((c) => `${c.code},${DC.cardUrl(settings, c.code)}`)];
        const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const el = document.createElement('a');
        el.href = URL.createObjectURL(blob); el.download = 'cards-' + label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '.csv';
        document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 2000);
      } else if (a === 'print') {
        const cards = await batchCards(id);
        if (!cards.length) return toast('This batch has no printable cards.', true);
        printCards(cards.map((c) => c.code));
      }
    });
  });

  /* ---------- printable card sheet: 10 cards of 85.6 x 54 mm per A4 page ---------- */
  function qrSvg(text) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ scalable: true, margin: 0 });
  }
  function cardFace(code) {
    const c = DC.bannerConfig(settings);
    const bg = /^#[0-9a-f]{6}$/i.test(c.bg_color) ? c.bg_color : '#5e0d1c';
    const ink = DC.inkOn(bg);
    const logo = /^[A-Za-z0-9._-]{1,120}$/.test(c.logo || '') ? `${String(DC.cfg.SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/banners/${c.logo}` : '';
    const shown = code.slice(0, 3) + ' ' + code.slice(3);
    return `<div class="pcard-face" style="--cbg:${bg};--cink:${ink}">
      <div class="pc-top">${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><b>${esc(settings.club_name)}</b><span>Donor card</span></div></div>
      <div class="pc-mid">
        <div class="pc-code"><small>Card code</small><strong>${esc(shown)}</strong></div>
        <div class="pc-qr">${qrSvg(DC.cardUrl(settings, code))}</div>
      </div>
      <div class="pc-foot">${esc(settings.center_name)} &middot; Licence ${esc(settings.license_no)}<br>${esc(settings.enquiry_phone)} &middot; Benefits valid ${settings.validity_days} days from each donation</div>
    </div>`;
  }
  function printCards(codes) {
    const pages = [];
    for (let i = 0; i < codes.length; i += 10) pages.push(`<div class="pc-page">${codes.slice(i, i + 10).map(cardFace).join('')}</div>`);
    const area = $('print-area');
    area.innerHTML = pages.join('');
    const imgs = [...area.querySelectorAll('img')];
    Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => {
      document.body.classList.add('printing');
      const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
    });
  }

  /* ---------- look up one card ---------- */
  $('cf-code').addEventListener('input', (e) => { e.target.value = DC.cleanCode(e.target.value); });
  $('card-find').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const code = DC.cleanCode($('cf-code').value);
      const out = $('card-found');
      if (!CODE.test(code)) { out.innerHTML = '<p class="hint">Enter the 6-character code.</p>'; return; }
      const c = must(await sb.from('cards').select('code,status,claimed_at,expires_at,batch:card_batches(label),donor:donors(name,phone)').eq('code', code).maybeSingle());
      if (!c) { out.innerHTML = `<p class="hint">No card <span class="mono">${esc(code)}</span> exists.</p>`; return; }
      const names = { stock: 'In stock (batch not activated)', issued: 'Ready to use, not used yet', claimed: 'Used', void: 'Void' };
      out.innerHTML = `<article class="rcard" data-code="${esc(c.code)}" style="max-width:420px">
        <h4 class="mono">${esc(c.code)}</h4>
        <dl><dt>Status</dt><dd>${esc(names[c.status])}</dd>
        <dt>Batch</dt><dd>${esc((c.batch && c.batch.label) || '')}</dd>
        ${c.status === 'claimed' && c.donor ? `<dt>Donor</dt><dd>${esc(c.donor.name)}, ${esc(c.donor.phone)}</dd>
        <dt>Registered</dt><dd>${stamp(c.claimed_at)}</dd><dt>Expires</dt><dd>${stamp(c.expires_at)}</dd>` : ''}</dl>
        <div class="actions">
          ${c.status === 'issued' || c.status === 'stock' ? '<button class="btn danger" data-cact="void">Mark as lost / void</button>' : ''}
          ${c.status === 'claimed' ? '<button class="btn ghost" data-cact="free">Release card for reuse</button>' : ''}
        </div></article>`;
    });
  });
  $('card-found').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cact]'); if (!b) return;
    const code = b.closest('.rcard').dataset.code;
    act(async () => {
      if (b.dataset.cact === 'void') {
        if (!window.confirm(`Void card ${code}? It can never be used.`)) return;
        must(await sb.from('cards').update({ status: 'void' }).eq('code', code));
      } else {
        if (!window.confirm(`Release card ${code}? The card becomes unused and can be registered again. The donation it was used for stays on the donor's record: delete that entry from the Donors tab if it should not count.`)) return;
        must(await sb.rpc('admin_free_card', { p_code: code }));
      }
      toast('Done.'); $('card-find').requestSubmit(); await loadCards(); await refreshBadge();
    });
  });

  /* =====================================================================
     TIERS
     ===================================================================== */
  async function loadTiers() {
    await loadMeta();
    $('tier-rows').innerHTML = tiers.map((t) => `<div class="trow" data-rank="${t.rank}">
      <span class="rk">${t.rank}</span>
      <input type="color" value="${esc(t.color)}" aria-label="Colour for rung ${t.rank}">
      <input type="text" value="${esc(t.name)}" maxlength="40" aria-label="Name for rung ${t.rank}"></div>`).join('');
  }
  $('save-tiers').addEventListener('click', () => act(async () => {
    const changes = [];
    for (const row of $('tier-rows').querySelectorAll('.trow')) {
      const rank = Number(row.dataset.rank);
      const color = row.querySelector('input[type=color]').value;
      const name = row.querySelector('input[type=text]').value.trim();
      if (!name) return toast(`Rung ${rank} needs a name.`, true);
      const old = tiers.find((t) => t.rank === rank);
      if (old.name !== name || old.color.toLowerCase() !== color.toLowerCase()) changes.push({ rank, name, color });
    }
    if (!changes.length) return toast('Nothing has changed.');
    for (const c of changes) must(await sb.from('tiers').update({ name: c.name, color: c.color }).eq('rank', c.rank));
    toast(`Saved ${changes.length} tier${changes.length > 1 ? 's' : ''}.`);
    await loadTiers();
  }));

  /* =====================================================================
     BENEFITS
     ===================================================================== */
  const tierOptions = (cur) => tiers.map((t) => `<option value="${t.rank}" ${sel(t.rank, cur)}>${esc(t.name)} and above</option>`).join('');
  async function loadBenefits() {
    await loadMeta();
    $('nb-rank').innerHTML = tierOptions(1);
    const rows = must(await sb.from('benefits').select('*').order('sort_order').order('created_at'));
    $('benefit-rows').innerHTML = rows.map((b) => `<div class="brow ${b.active ? '' : 'off'}" data-id="${esc(b.id)}">
      <input type="text" data-k="title" value="${esc(b.title)}" maxlength="120" aria-label="Title">
      <input type="text" data-k="description" value="${esc(b.description || '')}" maxlength="400" aria-label="Description">
      <select data-k="min_rank" aria-label="Unlocks at">${tierOptions(b.min_rank)}</select>
      <input type="number" data-k="sort_order" value="${b.sort_order}" aria-label="Order" title="Order (lower shows first)">
      <label class="check"><input type="checkbox" data-k="active" ${b.active ? 'checked' : ''}> Shown</label>
      <div class="actions"><button class="btn primary" data-bsave>Save</button><button class="btn danger" data-bdel>Delete</button></div></div>`).join('')
      || '<p class="hint">No benefits yet. Add the first one above.</p>';
  }
  $('benefit-rows').addEventListener('click', (e) => {
    const row = e.target.closest('.brow'); if (!row) return;
    if (e.target.closest('[data-bsave]')) act(async () => {
      const g = (k) => row.querySelector(`[data-k=${k}]`);
      const title = g('title').value.trim();
      if (!title) return toast('A benefit needs a title.', true);
      must(await sb.from('benefits').update({
        title, description: g('description').value.trim() || null,
        min_rank: Number(g('min_rank').value), sort_order: Number(g('sort_order').value) || 0, active: g('active').checked
      }).eq('id', row.dataset.id));
      toast('Saved.'); await loadBenefits();
    });
    if (e.target.closest('[data-bdel]')) act(async () => {
      if (!window.confirm('Delete this benefit? To hide it for now, untick Shown instead.')) return;
      must(await sb.from('benefits').delete().eq('id', row.dataset.id));
      toast('Deleted.'); await loadBenefits();
    });
  });
  $('benefit-new').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const title = $('nb-title').value.trim();
      if (!title) return toast('Give the benefit a title.', true);
      const last = must(await sb.from('benefits').select('sort_order').order('sort_order', { ascending: false }).limit(1));
      must(await sb.from('benefits').insert({
        title, description: $('nb-desc').value.trim() || null,
        min_rank: Number($('nb-rank').value), sort_order: (last[0] ? last[0].sort_order : 0) + 10
      }));
      $('nb-title').value = ''; $('nb-desc').value = '';
      toast('Benefit added.'); await loadBenefits();
    });
  });

  /* =====================================================================
     BANNER
     ===================================================================== */
  let bn = null;               // draft banner design being edited
  let fresh = [];              // files uploaded in this editing session

  const fileLabel = (path) => (path ? 'Uploaded' : 'None');

  async function loadBanners() {
    await loadMeta();
    await discardFresh();
    const c = DC.bannerConfig(settings);
    bn = { title: c.title, programme: c.programme, logo: c.logo || '', bg_mode: c.bg_mode === 'image' ? 'image' : 'color',
           bg_color: /^#[0-9a-f]{6}$/i.test(c.bg_color) ? c.bg_color : '#5e0d1c', bg_image: c.bg_image || '', darken: Number(c.darken) || 0 };
    $('b-title').value = bn.title; $('b-prog').value = bn.programme;
    document.querySelector(`input[name=b-mode][value=${bn.bg_mode}]`).checked = true;
    $('b-color').value = bn.bg_color; $('b-darken').value = bn.darken;
    syncBanner();
  }
  function syncBanner() {
    $('b-darken-val').textContent = bn.darken;
    $('b-color-wrap').hidden = bn.bg_mode !== 'color';
    $('b-image-wrap').hidden = bn.bg_mode !== 'image';
    $('b-logo-name').textContent = fileLabel(bn.logo); $('b-logo-clear').disabled = !bn.logo;
    $('b-image-name').textContent = fileLabel(bn.bg_image); $('b-image-clear').disabled = !bn.bg_image;
    $('banner-preview').innerHTML = DC.bannerHTML({ ...settings, banner: bn });
  }
  async function discardFresh() {
    if (fresh.length) { await sb.storage.from('banners').remove(fresh).catch(() => {}); fresh = []; }
  }

  $('b-title').addEventListener('input', (e) => { bn.title = e.target.value; syncBanner(); });
  $('b-prog').addEventListener('input', (e) => { bn.programme = e.target.value; syncBanner(); });
  $('b-color').addEventListener('input', (e) => { bn.bg_color = e.target.value; syncBanner(); });
  $('b-darken').addEventListener('input', (e) => { bn.darken = Number(e.target.value); syncBanner(); });
  document.querySelectorAll('input[name=b-mode]').forEach((r) => r.addEventListener('change', () => { bn.bg_mode = r.value; syncBanner(); }));
  $('b-logo-clear').addEventListener('click', () => { bn.logo = ''; syncBanner(); });
  $('b-image-clear').addEventListener('click', () => { bn.bg_image = ''; syncBanner(); });

  /* shrink an image in the browser: logos stay PNG (keeps transparency), backgrounds become JPEG */
  async function shrink(file, maxSide, asPng) {
    const bmp = await createImageBitmap(file);
    let k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), q = 0.88, blob;
    for (let i = 0; i < 8; i++) {
      const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      if (!asPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
      g.drawImage(bmp, 0, 0, W, H);
      blob = await new Promise((res) => c.toBlob(res, asPng ? 'image/png' : 'image/jpeg', q));
      if (blob.size <= 1.8 * 1024 * 1024) return blob;
      if (!asPng && q > 0.5) q -= 0.1; else k *= 0.75;
    }
    return blob;
  }
  async function upload(file, kind) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Choose a JPG, PNG or WebP image.', true); return null; }
    if (file.size > 20 * 1024 * 1024) { toast('That image is too large. Choose one under 20 MB.', true); return null; }
    toast('Uploading...');
    const png = kind === 'logo';
    const blob = await shrink(file, png ? 600 : 1600, png);
    const path = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${png ? 'png' : 'jpg'}`;
    must(await sb.storage.from('banners').upload(path, blob, { contentType: png ? 'image/png' : 'image/jpeg', cacheControl: '31536000' }));
    fresh.push(path);
    toast('Uploaded. Press Save banner to publish.');
    return path;
  }
  $('b-logo-file').addEventListener('change', (e) => act(async () => {
    const f = e.target.files[0]; e.target.value = '';
    const p = await upload(f, 'logo'); if (p) { bn.logo = p; syncBanner(); }
  }));
  $('b-image-file').addEventListener('change', (e) => act(async () => {
    const f = e.target.files[0]; e.target.value = '';
    const p = await upload(f, 'bg'); if (p) { bn.bg_image = p; bn.bg_mode = 'image'; document.querySelector('input[name=b-mode][value=image]').checked = true; syncBanner(); }
  }));

  $('banner-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const out = { title: bn.title.trim(), programme: bn.programme.trim(), logo: bn.logo, bg_mode: bn.bg_mode,
                    bg_color: bn.bg_color, bg_image: bn.bg_image, darken: bn.darken };
      if (out.title.length > 80) return toast('The title can be at most 80 characters.', true);
      if (out.programme.length > 120) return toast('The programme line can be at most 120 characters.', true);
      if (out.bg_mode === 'image' && !out.bg_image) return toast('Upload a background image, or switch the background to Colour.', true);
      const old = settings.banner || {};
      must(await sb.from('club_settings').update({ banner: out }).eq('id', 1));
      // tidy up: remove files that are no longer used
      const used = [out.logo, out.bg_image];
      const stale = [old.logo, old.bg_image, ...fresh].filter((p) => p && !used.includes(p));
      if (stale.length) await sb.storage.from('banners').remove(stale).catch(() => {});
      fresh = [];
      toast('Banner saved.');
      await loadBanners();
    });
  });
  $('b-discard').addEventListener('click', () => act(async () => { await loadBanners(); toast('Changes discarded.'); }));

  /* =====================================================================
     SETTINGS
     ===================================================================== */
  const sf = { club_name: 's-club', center_name: 's-center', license_no: 's-license', medical_officer: 's-mo', enquiry_phone: 's-phone', feedback_email: 's-email', validity_days: 's-valid', min_gap_days: 's-gap', disclaimer: 's-disc' };
  async function loadSettingsForm() {
    await loadMeta();
    Object.entries(sf).forEach(([k, id]) => { $(id).value = settings[k] ?? ''; });
    $('s-base').value = settings.card_base_url || '';
    $('s-dob').checked = settings.allow_dob_login !== false;
  }
  $('settings-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    act(async () => {
      const v = {};
      Object.entries(sf).forEach(([k, id]) => { v[k] = $(id).value.trim(); });
      v.validity_days = Number(v.validity_days); v.min_gap_days = Number(v.min_gap_days);
      v.card_base_url = $('s-base').value.trim().replace(/\/+$/, '');
      v.allow_dob_login = $('s-dob').checked;
      if (v.card_base_url && !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(v.card_base_url)) return toast('The card web address must start with https:// and contain no spaces.', true);
      if (!v.club_name || !v.center_name) return toast('Club name and blood centre name are required.', true);
      if (!Number.isInteger(v.validity_days) || v.validity_days < 1 || v.validity_days > 3650) return toast('Validity must be between 1 and 3650 days.', true);
      if (!Number.isInteger(v.min_gap_days) || v.min_gap_days < 0 || v.min_gap_days > 365) return toast('The minimum gap must be between 0 and 365 days.', true);
      must(await sb.from('club_settings').update(v).eq('id', 1));
      toast('Settings saved.'); await loadSettingsForm();
    });
  });

  boot().catch((e) => { console.error(e); showLogin('Could not connect. Check your internet connection, and that the Supabase key in js/config.js is valid.'); });
})();
