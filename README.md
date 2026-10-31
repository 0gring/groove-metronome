# Groove Metronome

A metronome that plays **real grooves** — drums, bass, chords and rhythmic melodies — instead of just a click.
It's an installable web app (PWA): it runs in any modern browser, installs on Android like a native app,
and works offline. Every sound is synthesized live with the Web Audio API (no samples, ~60 KB total).

## Grooves (23)

| Style | Grooves |
|---|---|
| Basic | Click-only metronome (1–12 beats, quarter/eighth/triplet/16th subdivisions) |
| Rock & Pop | Rock, Pop (I–V–vi–IV), Metal double-kick |
| Funk & Soul | Funk 16ths, Motown, Disco, Neo-Soul |
| Hip-Hop & Electronic | Boom Bap, Trap, House, Drum & Bass |
| Latin & Caribbean | Bossa Nova, Samba, Salsa (2-3 son clave), Reggae One Drop |
| African | Afrobeat |
| Jazz & Blues | Jazz Swing (walking bass, ii–V–I), 12-bar Blues Shuffle |
| Ballads & 3s | 6/8 Ballad, Waltz 3/4 |
| Odd Meters | 5/4 (3+2), 7/8 (2+2+3) |

## Features

- **Layers:** click, drums, bass, chords, melody — each with on/off, volume and a choice of synth sound.
- **Rhythmic melodies:** each groove has a riff that follows the chord changes; **🎲 New melody** generates
  a fresh repeating motif for rhythm-reading and call-and-response practice.
- **Key** selector (all 12 keys), **swing** amount, **humanize** (timing/velocity looseness).
- **Editable pattern grid:** tap drum cells to cycle off → hit → accent → ghost; the playhead follows along.
- **Tap tempo**, hold ± to change tempo quickly, 30–300 BPM, optional **count-in**.
- **Practice tools:** gap trainer (plays N bars, goes silent for M bars — test your internal clock),
  tempo trainer (+X BPM every N bars up to a target), screen flash and phone vibration on the beat,
  keep-screen-on.
- Groove changes while playing happen on the next bar line, so you stay in time.
- Settings are remembered between sessions.

## Get it on Android

1. Merge to `main`, then in the GitHub repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   The workflow in `.github/workflows/pages.yml` publishes the site to
   `https://<user>.github.io/groove-metronome/`.
2. Open that URL in **Chrome on Android** → tap **Install app** (in the page header, or Chrome's ⋮ menu → *Install app* / *Add to Home screen*).
3. It now launches full-screen from your home screen and works offline.

Tip: keep "Keep screen on while playing" enabled — Android can throttle audio timing when the screen turns off.

## Run locally

Any static file server works (ES modules need http, not `file://`):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node tests/grooves.test.mjs   # validate groove data & theory helpers
```

## Adding a groove

Grooves live in `js/grooves.js` as plain-text patterns — see the notation guide at the top of that file.
A drum lane is one character per step (`X` accent, `x` hit, `g` ghost, `r` roll, `.` rest), and
bass/melody lines use chord-relative tokens (`R` root, `T` third, `F` fifth, `S` seventh, `b7`, `8`, `-` tie).
Run `node tests/grooves.test.mjs` to check the lengths line up.

## Project layout

```
index.html            UI markup
css/style.css         styles (mobile-first)
js/app.js             scheduler, UI, practice tools
js/audio.js           synthesized drum kit and instruments
js/grooves.js         groove library
js/theory.js          pattern parsers, chord theory, melody generator
sw.js, manifest.webmanifest, icons/   PWA / offline / install
```
