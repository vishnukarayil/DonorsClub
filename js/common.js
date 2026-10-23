/* Shared helpers for the public pages. */
window.DC = (function () {
  const cfg = window.DC_CONFIG || {};
  /* a secret / service_role key must never run in a browser */
  const secretKey = (() => {
    const k = String(cfg.SUPABASE_ANON_KEY || '');
    if (/^sb_secret_/.test(k)) return true;
    const p = k.split('.');
    if (p.length === 3) {
      try { return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (_) { /* not a JWT */ }
    }
    return false;
  })();
  const configured = !secretKey && !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR-PROJECT|YOUR-ANON/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));

  let _client = null;
  function client() {
    if (!configured) return null;
    if (!_client) {
      _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    return _client;
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const IST = 'Asia/Kolkata';
  const dFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' });
  const dtFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const fmtDate = (v) => (v ? dFmt.format(new Date(v)) : '');
  const fmtDateTime = (v) => (v ? dtFmt.format(new Date(v)) : '');

  const icons = {
    drop:  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C9 7 5 10.5 5 15a7 7 0 0 0 14 0c0-4.500-4-8-7-13Z"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>',
    lock:  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.500 7V5a3.500 3.500 0 1 1 7 0v2H13v7H3V7h1.500Zm1.500 0h4V5a2 2 0 1 0-4 0v2Z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.600 10.800a15.100 15.100 0 0 0 6.600 6.600l2.200-2.200a1 1 0 0 1 1-.25c1.100.37 2.300.57 3.600.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.600 21 3 13.400 3 4a1 1 0 0 1 1-1h3.500a1 1 0 0 1 1 1c0 1.300.2 2.500.57 3.600a1 1 0 0 1-.25 1l-2.200 2.200Z"/></svg>',
    mail:  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.500L4.500 7v1.800l7.500 5.200 7.500-5.200V7L12 12.500Z"/></svg>',
    install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="20" height="20"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14"/></svg>'
  };

  /* readable text colour on a tier colour */
  function inkOn(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#111';
    const n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#111' : '#fff';
  }

  /* ---------- club content (settings, tiers, benefits) ---------- */
  const VERSION = '1.2.0';

  /* ---------- card codes ---------- */
  const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;
  /* what people type: upper case, no spaces or dashes, at most 6 characters */
  const cleanCode = (v) => String(v || '').toUpperCase().replace(/[\s-]+/g, '').slice(0, 6);
  /* the address printed in each card's QR: <base>/card.html?c=CODE */
  function cardUrl(settings, code) {
    let base = settings && settings.card_base_url ? String(settings.card_base_url).replace(/\/+$/, '') : '';
    if (!base) base = location.href.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');
    return `${base}/card.html?c=${encodeURIComponent(code)}`;
  }

  async function loadClub() {
    const sb = client();
    const [s, t, b] = await Promise.all([
      sb.from('club_settings').select('*').eq('id', 1).single(),
      sb.from('tiers').select('rank,name,color').order('rank'),
      sb.from('benefits').select('id,title,description,min_rank,sort_order').eq('active', true).order('sort_order').order('created_at')
    ]);
    if (s.error) throw s.error;
    if (t.error) throw t.error;
    if (b.error) throw b.error;
    return { settings: s.data, tiers: t.data, benefits: b.data };
  }

  /* ---------- banner: built from settings.banner, drawn as live HTML ---------- */
  const BANNER_DEFAULT = { title: null, programme: '', logo: '', bg_mode: 'color', bg_color: '#5e0d1c', bg_image: '', darken: 40 };
  const safePath = (p) => (/^[A-Za-z0-9._-]{1,120}$/.test(p || '') ? p : '');
  const safeColor = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : d);
  const publicUrl = (path) => `${String(cfg.SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/banners/${path}`;

  function bannerConfig(settings) {
    const raw = (settings && settings.banner) || {};
    const b = { ...BANNER_DEFAULT, ...raw };
    if (b.title === null || b.title === undefined) b.title = (settings && settings.club_name) || '';
    return b;
  }

  function bannerHTML(settings) {
    const b = bannerConfig(settings);
    const bg = safeColor(b.bg_color, BANNER_DEFAULT.bg_color);
    const img = b.bg_mode === 'image' && safePath(b.bg_image) ? publicUrl(safePath(b.bg_image)) : '';
    const logo = safePath(b.logo) ? publicUrl(safePath(b.logo)) : '';
    const ink = img ? '#ffffff' : inkOn(bg);
    const dark = Math.max(0, Math.min(80, Number(b.darken) || 0)) / 100;
    const title = String(b.title || '').trim();
    const prog = String(b.programme || '').trim();
    const style = `--bn-bg:${bg};--bn-ink:${ink};--bn-dark:${dark}` + (img ? `;--bn-img:url(${esc(img)})` : '');
    return `<figure class="banner${img ? ' has-img' : ''}" style="${style}"><div class="banner-in">` +
      (logo ? `<img class="banner-logo" src="${esc(logo)}" alt="">` : '') +
      (title || prog ? `<div class="banner-text">${title ? `<div class="banner-title">${esc(title)}</div>` : ''}${prog ? `<div class="banner-prog">${esc(prog)}</div>` : ''}</div>` : '') +
      `</div></figure>`;
  }

  const legalText = (s) => `© ${new Date().getFullYear()} ${s.center_name}. All rights reserved.`;
  const versionText = (s) => `${s.club_name} app, version ${VERSION}`;

  function footerHTML(club) {
    const s = club.settings;
    const tel = String(s.enquiry_phone).replace(/[^\d+]/g, '');
    return `<footer class="foot"><div class="wrap">
      <p><b>${esc(s.center_name)}</b></p>
      <p>Licence No. ${esc(s.license_no)}</p>
      <p>Medical Officer: ${esc(s.medical_officer)}</p>
      <p>Blood enquiries and donation doubts: <a href="tel:${esc(tel)}">${esc(s.enquiry_phone)}</a></p>
      <p>Complaints and feedback: <a href="mailto:${esc(s.feedback_email)}">${esc(s.feedback_email)}</a></p>
      <p class="legal">${esc(legalText(s))}<br>${esc(versionText(s))}</p>
    </div></footer>`;
  }

  function setupNotice() {
    document.body.innerHTML = secretKey
      ? `<div class="setup"><div class="sheet">
      <h1 style="font-size:1.5rem">Wrong kind of key</h1>
      <p><code>js/config.js</code> contains a <b>secret</b> key. Secret keys must never be put in a website. Delete it from the file, revoke it in Supabase, and use the <b>publishable</b> key (or the legacy <b>anon</b> key) instead.</p></div></div>`
      : `<div class="setup"><div class="sheet">
      <h1 style="font-size:1.5rem">Almost there</h1>
      <p>This site is not connected to its database yet. Open <code>js/config.js</code> and paste your Supabase project URL and publishable key, then reload.</p>
      <p class="hint">Step-by-step instructions are in <code>README.md</code>.</p></div></div>`;
  }

  function fail(msg) {
    const el = document.getElementById('app-error');
    if (el) { el.hidden = false; el.textContent = msg; }
  }

  /* ---------- add to home screen ---------- */
  function initInstall(btn, dlg) {
    if (!btn) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
    window.addEventListener('appinstalled', () => { btn.hidden = true; });
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) { /* ignore */ }
        deferred = null;
      } else if (dlg) {
        dlg.querySelector('[data-ios]').hidden = !ios;
        dlg.querySelector('[data-other]').hidden = ios;
        dlg.showModal();
      }
    });
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* remembered login on this device: phone + credential, where kind is 'code' (card code) or 'dob' (old way) */
  const store = {
    get: () => {
      try {
        const phone = localStorage.getItem('dc.phone');
        const cred = localStorage.getItem('dc.cred') || localStorage.getItem('dc.dob');   // dc.dob: saved by version 1.1
        const kind = localStorage.getItem('dc.kind') || (localStorage.getItem('dc.dob') ? 'dob' : '');
        return { phone, cred, kind };
      } catch (_) { return {}; }
    },
    set: (phone, cred, kind) => {
      try { localStorage.setItem('dc.phone', phone); localStorage.setItem('dc.cred', cred); localStorage.setItem('dc.kind', kind); localStorage.removeItem('dc.dob'); } catch (_) { /* private mode */ }
    },
    clear: () => { try { ['dc.phone', 'dc.cred', 'dc.kind', 'dc.dob'].forEach((k) => localStorage.removeItem(k)); } catch (_) { /* ignore */ } }
  };

  return { cfg, configured, client, esc, fmtDate, fmtDateTime, icons, inkOn, loadClub, bannerConfig, bannerHTML, footerHTML, legalText, versionText, VERSION, setupNotice, fail, initInstall,
           CODE_RE, cleanCode, cardUrl, store };
})();
