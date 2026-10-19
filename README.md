# Donors' Club

Donor membership site for Ahalia Blood Transfusion Services.

- **Donor pages** (static, hosted on GitHub Pages): `index.html` (banner and donation form) and `profile.html` (tier, validity bar, benefits, contact, add to home screen).
- **Admin console**: `admin.html` (donor table, review queue, tiers, benefits, banner, settings).
- **Database and logins**: Supabase (free tier is plenty). GitHub Pages cannot store data, so Supabase holds the donors and the banner images.

## One-time setup (about 20 minutes)

### 1. Create the database
1. Sign up at supabase.com and create a project. Pick the region closest to you (Mumbai/Singapore).
2. Open **SQL Editor > New query**, paste the whole of `supabase/schema.sql`, and run it. It creates the tables, the security rules, the banner storage and starter tiers and benefits.
3. Open **Project Settings > API Keys**. Copy the **Project URL** and the **Publishable key** (`sb_publishable_...`; the legacy `anon` key also works).
4. Paste both into `js/config.js`. **Never paste a Secret key (`sb_secret_...`) or the legacy `service_role` key** into this site: it bypasses every security rule, GitHub will flag it and Supabase will revoke it. The site refuses to start if it finds one.

### 2. Create the first admin
1. In Supabase: **Authentication > Users > Add user**. Enter your e-mail and a strong password, and tick auto-confirm.
2. In the SQL Editor run (with your e-mail):
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
3. In **Authentication > Sign In / Providers**, switch **off** "Allow new users to sign up". Only people you add can have logins.
4. Add more staff the same way (new user, then the insert).

### 3. Publish on GitHub Pages
1. Create a GitHub repository and upload everything in this folder (the `supabase` folder and this README may stay in; they are harmless).
2. **Settings > Pages > Build and deployment**: deploy from branch `main`, folder `/ (root)`.
3. The site appears at `https://<your-user>.github.io/<repo>/`. The donor form is the home page, the admin console is `/admin.html`.

### 4. Moving to a custom domain later
Add the domain under **Settings > Pages > Custom domain** and set the DNS records GitHub shows. Nothing in the code needs to change: every link is relative, and the database address does not depend on where the site lives. Donors who installed the app to their home screen will need to add it again from the new address.

## How it works

| Rule | Behaviour |
|---|---|
| First donation | New donor, **Silver** (rung 1) |
| Repeat donation | Matched by the 10-digit mobile number; moves up one rung (Silver, Gold I, Gold II, ... Eternal Being) |
| Validity | 100 days from the latest donation. Shown as a shrinking bar on the profile. When it reaches 0 the benefits show as paused; the tier is kept |
| Mobile number | Exactly 10 digits, starting 6 to 9. The form tells donors to always use the same number |
| Profile access | Donor enters mobile number and date of birth. After donating, the phone remembers them |
| Timestamp | Taken from the server clock at the moment of submission (shown in IST). Staff can correct it in the admin console |

Rules I added that you did not specify (all in `supabase/schema.sql`, change or remove as you like):

- **Date of birth must match for repeat donors.** Otherwise anyone who knew a donor's number could overwrite their record or view their profile.
- **Duplicate guard:** a second entry for the same number within 90 days is refused ("already recorded on ..."), so a double tap cannot jump someone two tiers. Change or switch off under Admin > Settings.
- **Blood group mismatch:** a repeat entry with a different blood group is accepted but flagged for review automatically.
- **Age 18 to 65** is checked on the date of birth.
- **Consent tick box** on the form, since you are storing personal data.
- A hidden trap field catches simple form bots.

## Admin console

- **Donors**: every field is editable in the table (change, then press Save on that row). Filters: blood group, works at Ahalia, and "last donation more than 3 months ago". Search by name, phone or place. **Donations** opens a donor's donation history to fix a date, add a walk-in donation, flag or delete an entry. **Export CSV** downloads the filtered list.
- **Review**: flagged entries wait here. **Keep** returns them to normal; **Delete** stops them counting (the donor's tier drops accordingly) and moves them to the Deleted list, from where they can be restored or permanently purged.
- **Tiers**: rename and recolour the 11 rungs.
- **Benefits**: add, edit, reorder, hide or delete benefits, and set the tier each one unlocks at.
- **Banner**: upload an image (best 1600 x 600). Earlier banners are kept so you can switch back.
- **Settings**: club name, licence number, Medical Officer, phone, e-mail, validity days, duplicate-guard days, disclaimer.

The seeded benefits are **placeholders** I wrote. Replace them with what the blood centre will actually honour before launch.

## Things to know

- `admin.html` is a public address, but it shows nothing without a login, and the database itself refuses anyone who is not in the `admins` table.
- The public form can be submitted by anyone, which is why the Review queue exists. If spam becomes a problem, add Cloudflare Turnstile to the form.
- Anyone who guesses a donor's number *and* date of birth can open that profile (name, blood group, tier). Supabase applies its own rate limits to this.
- Supabase's free tier pauses a project after a week of no activity; open the dashboard to wake it, or upgrade for production use.
- Donor data is personal and health-related: keep admin passwords strong, share logins with as few people as possible, and review your obligations under India's Digital Personal Data Protection Act.

## Files

```
index.html  profile.html  admin.html  manifest.webmanifest  sw.js
css/style.css  css/admin.css
js/config.js            <- the only file you edit
js/common.js  js/register.js  js/profile.js  js/avatars.js  js/admin.js  js/supabase.js (vendored library)
icons/                  app icons
supabase/schema.sql     database, security rules, storage, seed data
```
