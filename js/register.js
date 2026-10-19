(function () {
  const $ = (id) => document.getElementById(id);
  if (!DC.configured) { DC.setupNotice(); return; }

  const form = $('form');
  const submitBtn = $('submit');

  /* ---------- club content: banner, name, footer ---------- */
  DC.loadClub().then((club) => {
    $('banner').innerHTML = DC.bannerHTML(club);
    $('footer').innerHTML = DC.footerHTML(club);
    $('brand').textContent = club.settings.club_name;
    document.title = club.settings.club_name;
  }).catch((e) => { console.error(e); DC.fail('Could not load the latest club details. You can still fill in the form.'); });

  /* ---------- input rules ---------- */
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  $('dob').max = ymd(new Date(now.getFullYear() - 18, now.getMonth(), now.getDate()));
  $('dob').min = ymd(new Date(now.getFullYear() - 66, now.getMonth(), now.getDate() + 1));

  $('phone').addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length > 10) {                       // pasted "+91 98765 43210" or "098765 43210"
      if (d.startsWith('91') && d.length === 12) d = d.slice(2);
      else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
    }
    e.target.value = d.slice(0, 10);
  });
  $('pincode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

  /* ---------- validation (the database checks the same rules again) ---------- */
  const val = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

  function collect() {
    return {
      name: $('name').value.trim().replace(/\s+/g, ' '),
      dob: $('dob').value,
      gender: val('gender'),
      bg: val('bg'),
      village: $('village').value.trim().replace(/\s+/g, ' '),
      pincode: $('pincode').value.trim(),
      ahalia: val('ahalia'),
      phone: $('phone').value.trim(),
      consent: $('consent').checked
    };
  }

  function validate(v) {
    const e = {};
    if (v.name.length < 2) e.name = 'Enter your full name.';
    if (!v.dob) e.dob = 'Enter your date of birth.';
    else if (v.dob > $('dob').max || v.dob < $('dob').min) e.dob = 'Donors must be between 18 and 65 years old.';
    if (!v.gender) e.gender = 'Select a gender.';
    if (!v.bg) e.blood_group = 'Select your blood group.';
    if (v.village.length < 2) e.village = 'Enter your village or town.';
    if (!/^[1-9][0-9]{5}$/.test(v.pincode)) e.pincode = 'Enter a 6-digit pincode.';
    if (!v.ahalia) e.ahalia = 'Tell us whether you work at Ahalia.';
    if (!/^[6-9][0-9]{9}$/.test(v.phone)) e.phone = 'Enter a 10-digit mobile number, digits only.';
    if (!v.consent) e.consent = 'Please tick the box to continue.';
    return e;
  }

  function showErrors(errs) {
    form.querySelectorAll('[data-f]').forEach((f) => {
      const key = f.dataset.f;
      const p = f.querySelector('.err');
      if (!p) return;
      const msg = errs[key];
      p.hidden = !msg; p.textContent = msg || '';
      f.classList.toggle('invalid', !!msg);
      f.querySelectorAll('input:not([type=radio]):not([type=checkbox])').forEach((i) => i.setAttribute('aria-invalid', msg ? 'true' : 'false'));
    });
    const c = form.querySelector('[data-e="consent"]');
    c.hidden = !errs.consent; c.textContent = errs.consent || '';
    const first = form.querySelector('.invalid, [data-e="consent"]:not([hidden])');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // clear a field's error as soon as the person edits it
  ['input', 'change'].forEach((evt) => form.addEventListener(evt, (e) => {
    const f = e.target.closest && e.target.closest('[data-f]');
    if (!f) return;
    const p = f.querySelector('.err');
    if (p) { p.hidden = true; p.textContent = ''; }
    f.classList.remove('invalid');
    if (f.dataset.f === 'consent') { const c = form.querySelector('[data-e="consent"]'); c.hidden = true; }
  }));

  function formAlert(msg) {
    const a = $('form-alert');
    a.hidden = !msg; a.textContent = msg || '';
    if (msg) a.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- submit ---------- */
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    formAlert('');
    if (form.elements.website.value) return;           // bot trap: real people never see this field

    const v = collect();
    const errs = validate(v);
    showErrors(errs);
    if (Object.keys(errs).length) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    try {
      const { data, error } = await DC.client().rpc('register_donation', {
        p_name: v.name, p_dob: v.dob, p_gender: v.gender, p_blood_group: v.bg,
        p_village: v.village, p_pincode: v.pincode, p_ahalia: v.ahalia === 'yes',
        p_phone: v.phone, p_consent: v.consent
      });
      if (error) throw error;
      if (!data || !data.ok) {
        const code = data && data.code;
        const map = { phone: 'phone', name: 'name', dob: 'dob', gender: 'gender', blood_group: 'blood_group', village: 'village', pincode: 'pincode', ahalia: 'ahalia', consent: 'consent' };
        if (map[code]) showErrors({ [map[code]]: data.message });
        else formAlert((data && data.message) || 'Something went wrong. Please try again.');
        return;
      }
      done(v, data);
    } catch (e) {
      console.error(e);
      formAlert('We could not reach the server, so your donation was not saved. Check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Record my donation';
    }
  });

  function done(v, res) {
    DC.store.set(v.phone, v.dob);
    const p = res.profile;
    const first = v.name.split(' ')[0];
    const medal = $('medal');
    medal.style.setProperty('--tier', p.tier_color);
    medal.style.color = DC.inkOn(p.tier_color);
    medal.innerHTML = DC.icons.drop;
    $('done-title').textContent = res.is_repeat ? `Welcome back, ${first}` : `Welcome to the club, ${first}`;
    $('done-text').textContent = res.is_repeat
      ? `Thank you for donating again. You are now ${p.tier_name}, with ${p.donation_count} donations recorded. Your benefits are valid for ${p.validity_days} days.`
      : `You are now a ${p.tier_name} member. Your benefits are valid for ${p.validity_days} days from today.`;
    const flag = $('done-flag');
    flag.hidden = !res.flagged;
    if (res.flagged) flag.textContent = 'Your blood group is different from the one we hold on record. The Medical Officer will check this with you.';
    form.hidden = true;
    document.querySelector('.lede').hidden = true;
    const d = $('done');
    d.hidden = false; d.focus(); d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
