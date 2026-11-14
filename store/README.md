# Publishing Groove Metronome on Google Play ($2)

The Android app is a **Trusted Web Activity (TWA)**: a small Android shell that opens the web app full-screen, with no
browser bar. Every update you push to the website reaches the Android app straight away. You only rebuild the
Android package when the app shell changes (icon, name, version).

Decisions already made:
- **Price:** US$1.99–2.00 on Google Play. The website stays free.
- **Package name:** `com.groovemetronome.app`. This is permanent and can never be changed.

Everything prepared in this folder:

| File | What it's for |
|---|---|
| `listing.md` | App name, short and full description, category, contact fields: copy-paste ready |
| `icon-512.png`, `feature-graphic.png`, `screenshots/` | Store graphics, already at Play's sizes |
| `twa-manifest.json` | Package settings, if you build with the Bubblewrap command-line tool instead of PWABuilder |
| `assetlinks.json` | Template for the domain-verification file (step 4) |
| `../privacy.html` | Privacy policy (required, because the tuner uses the microphone) |
| `../promo/groove-metronome-promo.mp4` | Promo video: upload it to YouTube and paste the link in the listing |

---

## 1. Google Play developer account
1. Sign up at https://play.google.com/console. The fee is US$25, paid once. You'll need ID verification.
2. **Payments profile (merchant account).** You need this to sell a paid app: Play Console → Settings → Payments profile.
   Google pays out to your bank account. Check that your country is supported for merchants; Google takes 15% of sales
   up to US$1M a year.
3. **Personal accounts must run a closed test before going live.** Google currently requires new personal developer
   accounts to run a closed test with at least **12 testers for 14 days in a row** before you can apply for production.
   Plan for about 2–3 weeks between first upload and the public launch. The console shows the current rule.

## 2. Build the Android package (easiest: PWABuilder, in the browser)
1. Open https://www.pwabuilder.com and enter `https://0gring.github.io/groove-metronome/`.
2. Choose **Package for stores → Android → Google Play**, and fill in:
   - Package ID: `com.groovemetronome.app`
   - App name: `Groove Metronome` · Launcher name: `Groove`
   - App version: `1.0.0` · Version code: `1`
   - Host: `0gring.github.io` · Start URL: `/groove-metronome/`
   - Display mode: standalone · Theme, background and navigation colour: `#16141F`
   - Signing key: **Create new**. Enter your name and organisation, and choose strong passwords.
3. Download the zip. It contains:
   - `*.aab`: the file you upload to Play
   - `signing.keystore` and `signing-key-info.txt`: **your upload key. Back these up in two safe places and never put
     them in the public repo.** You need them for every future update.
   - `assetlinks.json`: the domain-verification file, with your key's fingerprint already filled in

Using the command line instead (needs Node and a JDK): `npx @bubblewrap/cli init --manifest
https://0gring.github.io/groove-metronome/manifest.webmanifest`, then answer using the values above (or start from
`twa-manifest.json`), and run `npx @bubblewrap/cli build`.

## 3. Create the app in Play Console
1. **Create app.** Name: Groove Metronome · Language: English · App · **Paid**.
   ⚠️ **Choose Paid from the start.** Google does not allow a free app to be changed to paid later.
2. **Monetise → App pricing:** US$1.99 (or 2.00). Google converts it into local prices and handles VAT in most countries.
3. **Store listing:** paste the texts from `listing.md`, then upload the icon, feature graphic, screenshots and the YouTube link.
4. **App content** (Policy → App content). These answers match what the app does:
   - Privacy policy: `https://0gring.github.io/groove-metronome/privacy.html`
   - Ads: **No**
   - App access: **All functionality is available without special access.**
   - Content rating questionnaire: category *Utility, productivity, communication or other*. Answer **No** to violence,
     sexual content, gambling, user interaction and sharing location. The expected result is rated for everyone.
   - Target audience: **13 and over** (avoids the extra Families-programme requirements; the app suits all ages anyway)
   - Data safety: **No data collected, no data shared.** The microphone audio is processed only on the device and never
     stored or sent, which Google does not count as "collected". Encryption in transit: yes (HTTPS). Deletion
     requests: not applicable, because nothing is collected.
   - News app / government / financial / health: **No**

## 4. Prove you own the website (removes the browser bar)
Android checks `https://0gring.github.io/.well-known/assetlinks.json`. It has to be at the **root of the domain**, not
under `/groove-metronome/`. GitHub serves the domain root from a repository named exactly **`0gring.github.io`**:
1. Create the public repo `0gring/0gring.github.io`.
2. Add `.well-known/assetlinks.json` (from the PWABuilder zip) and an empty file `.nojekyll`. The `.nojekyll` file is
   needed so GitHub serves folders that start with a dot.
3. Settings → Pages → deploy from branch `main`.
4. After your first upload to Play, open Play Console → Test and release → **App integrity → App signing** and copy the
   **App signing key SHA-256**. Add it to `sha256_cert_fingerprints` next to the upload-key fingerprint that's already
   there (see `assetlinks.json` here for the format).
5. Check https://0gring.github.io/.well-known/assetlinks.json in a browser. Then install the test build: it should open
   with no address bar. If you still see a URL bar, the fingerprints don't match yet.

## 5. Test, then launch
1. Test and release → **Closed testing** → create a track → upload the `.aab` → add testers by email. Friends, your band
   and students all count.
2. Testers must buy a paid app too. Give them free **promo codes**: Monetise → Promo codes.
3. Keep the test running for the required 14 days. Fix anything they report; website updates reach them straight away.
4. **Apply for production** in the console, answer the short questionnaire, and roll out.

## 6. Later updates
- **App features or fixes:** push to the website (main branch) as usual. The Android app shows the new version
  immediately, with no Play review needed.
- **Icon, name or version changes:** rebuild with PWABuilder or Bubblewrap **using the same keystore**, raise the
  version code (2, 3, …), and upload the new `.aab`.
