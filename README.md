# Donors' Club

Donor membership site for Ahalia Blood Transfusion Services.

- **Donor pages** (static, hosted on GitHub Pages): `index.html` (banner and donation form), `profile.html` (tier, validity bar, benefits, contact, add to home screen) and `card.html` (the page a card's QR code opens).
- **Admin console**: `admin.html` (donor table, review queue, donor cards, tiers, benefits, banner, settings).
- **Database and logins**: Supabase (free tier is plenty). GitHub Pages cannot store data, so Supabase holds the donors and the banner images.

## One-time setup (about 20 minutes)

### 1. Create the database
1. Sign up at supabase.com and create a project. Pick the region closest to you (Mumbai/Singapore).
2. Open **SQL Editor > New query**, paste the whole of `supabase/schema.sql`, and run it. It creates the tables, the security rules, the banner storage and starter tiers and benefits.
3. Open **Project Settings > API Keys**. Copy the **Project URL** and the **Publishable key** (`sb_publishable_...`; the legacy `anon` key also works).
4. Paste both into `js/config.js`. **Never paste a Secret key (`sb_secret_...`) or the legacy `service_role` key** into this site: it bypasses every security rule, GitHub will flag it and Supabase will revoke it. The site refuses to start if it finds one.

> **Already ran an older `schema.sql` and the admin shows "You do not have permission" with empty tables?** Run `supabase/fix-grants.sql` once in the SQL Editor. The current `schema.sql` already includes it.

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
| Donor card | Each donation needs a card from the centre: a 6-character code (plus QR) printed on an ATM-size card. A code works once. The donor accumulates one card per donation |
| Profile access | Mobile number **plus any of the donor's card codes** (old or new). After donating, the phone remembers them. Donors who have no card yet can use date of birth until you switch that off (Settings) |
| Timestamp | Taken from the server clock at the moment of submission (shown in IST). Staff can correct it in the admin console |

Rules I added that you did not specify (all in `supabase/schema.sql`, change or remove as you like):

- **Date of birth must match for repeat donors.** Otherwise anyone who knew a donor's number could overwrite their record or view their profile.
- **Duplicate guard:** a second entry for the same number within 90 days is refused ("already recorded on ..."), so a double tap cannot jump someone two tiers. Change or switch off under Admin > Settings.
- **Blood group mismatch:** a repeat entry with a different blood group is accepted but flagged for review automatically.
- **Age 18 to 65** is checked on the date of birth.
- **Consent tick box** on the form, since you are storing personal data.
- A hidden trap field catches simple form bots.

## Donor cards (version 1.2)

**Upgrading from 1.1:** paste the new `supabase/schema.sql` into the SQL Editor and run it. It is safe to re-run and keeps all existing data. Then upload the changed site files.

**Workflow**
1. Admin > **Cards** > generate a batch (up to 1000 at a time). Codes are random and unique.
2. **Print sheet** prints 10 cards per A4 page (2 x 5, 85.6 x 54 mm each, in your banner colour and logo). Choose "Background graphics" in the print dialog if the colour is missing. Cut along the cards.
3. When the printed cards are in your hands, press **Activate** on the batch. Cards that are not activated cannot be used, so a lost box is harmless.
4. Hand one card to each donor. The donor types the code on the donation form. A used or unknown code is refused on the spot.
5. The card is now logged with the registration date and an expiry 100 days later (the validity setting).
6. Scanning the QR opens `card.html`, which shows the donor's name (first name and last initial only), registration date, expiry date and tier. A card nobody has registered says "not issued to anyone"; an old one says "expired".

**Good to know**
- A repeat donation is still recognised by mobile number and date of birth, and moves the donor up one tier. A new card is used each time.
- If you delete a donation entry that used a card, you are asked whether to make the card usable again. **Find a card** (Cards tab) lets you look up any code, void a lost card, or release a used one.
- **Card web address** (Settings): printed QR codes contain the site address. If you plan to move to your own domain, set this to the final address **before printing**. Codes already printed keep the old address, so keep the old site redirecting.
- **Guess protection:** 20 wrong code guesses in a minute (across everyone) pause code checks for a minute, and 5 wrong date-of-birth tries per number lock that number's DOB login for 15 minutes. There are about 887 million possible codes and only activated cards count, so guessing is impractical, but a determined person could trigger the pause to inconvenience others briefly.
- Codes use 31 characters (no 0, 1, I, L or O), so they are easy to read aloud. They have no check character, so a mistyped code that happens to match another live card cannot be told apart; the donor's name on the QR page is the human check.

## Admin console

- **Donors**: every field is editable in the table (change, then press Save on that row). Filters: blood group, works at Ahalia, and "last donation more than 3 months ago". Search by name, phone or place. **Donations** opens a donor's donation history to fix a date, add a walk-in donation, flag or delete an entry. **Export CSV** downloads the filtered list.
- **Review**: flagged entries wait here. **Keep** returns them to normal; **Delete** stops them counting (the donor's tier drops accordingly) and moves them to the Deleted list, from where they can be restored or permanently purged.
- **Cards**: generate, print, activate, export and look up donor cards (see above).
- **Tiers**: rename and recolour the 11 rungs.
- **Benefits**: add, edit, reorder, hide or delete benefits, and set the tier each one unlocks at.
- **Banner**: upload an image (best 1600 x 600). Earlier banners are kept so you can switch back.
- **Settings**: club name, licence number, Medical Officer, phone, e-mail, validity days, duplicate-guard days, disclaimer, the card web address, and whether date-of-birth login is allowed.

The seeded benefits are **placeholders** I wrote. Replace them with what the blood centre will actually honour before launch.

## Things to know

- `admin.html` is a public address, but it shows nothing without a login, and the database itself refuses anyone who is not in the `admins` table.
- The public form can be submitted by anyone, which is why the Review queue exists. If spam becomes a problem, add Cloudflare Turnstile to the form.
- Opening a profile needs the mobile number *and* a card code, which only the centre issues. Switch off date-of-birth login (Settings) once every donor holds a card, so a number plus a guessed birth date can no longer open anything.
- Supabase's free tier pauses a project after a week of no activity; open the dashboard to wake it, or upgrade for production use.
- Donor data is personal and health-related: keep admin passwords strong, share logins with as few people as possible, and review your obligations under India's Digital Personal Data Protection Act.

## Files

```
index.html  profile.html  card.html  admin.html  manifest.webmanifest  sw.js
css/style.css  css/admin.css
js/config.js            <- the only file you edit
js/common.js  js/register.js  js/profile.js  js/card.js  js/avatars.js  js/admin.js
js/supabase.js, js/qrcode.js (vendored libraries; qrcode-generator is MIT licensed)
icons/                  app icons
supabase/schema.sql     database, security rules, storage, seed data
```
