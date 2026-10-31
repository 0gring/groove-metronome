# Groove Metronome

A metronome that plays **real grooves** — drums, bass, chords and rhythmic melodies — instead of just a click.
It's an installable web app (PWA): it runs in any modern browser, installs on Android like a native app,
and works offline.

**Sound:** a recorded acoustic drum kit (kick, snare, cross-stick, hi-hat, ride, crash, toms) from
[Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (CC0), close and room mics blended;
percussion, electric piano and grand piano from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0); velocity layers and round-robin
throughout. Finger bass, upright bass and guitar use a Karplus-Strong plucked-string model; electronic styles
(trap, house, drum & bass) use a synthesized kick; synth bass, 808, organ, pad and leads are synthesized.
Mixed in stereo with room reverb and a soft limiter (~3 MB of samples).

## Grooves (26, each with 3 variations)

| Style | Grooves |
|---|---|
| Basic | Click-only metronome (1–12 beats, quarter/eighth/triplet/16th subdivisions) |
| Rock & Pop | Rock, Pop (I–V–vi–IV), Metal double-kick |
| Funk & Soul | Funk 16ths, Disco, Neo-Soul |
| Motown | Backbeat (snare on all four), Four-on-the-Floor, Shuffle, Ballad — with tambourine |
| Hip-Hop & Electronic | Boom Bap, Trap, House, Drum & Bass |
| Latin & Caribbean | Bossa Nova, Samba, Salsa (2-3 son clave), Reggae One Drop |
| African | Afrobeat |
| Jazz & Blues | Jazz Swing (walking bass, ii–V–I), 12-bar Blues Shuffle |
| Ballads & 3s | 6/8 Ballad, Waltz 3/4 |
| Odd Meters | 5/4 (3+2), 7/8 (2+2+3) |

Every groove has a main pattern (A) and two variations (B, C), e.g. Rock *Push* / *Ride*, Funk *16th hats* /
*Open hats*, Bossa *2-3 clave* / *Ride*, Reggae *Steppers* / *Rockers*. **Mix** plays A A A B, A A A C…, and
**Fills** adds a snare-to-toms fill at the end of every 4 or 8 bars with a crash on the next downbeat.

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
- **Practice speed:** play at 50 / 60 / 70 / 85 / 100% of the target tempo, optionally stepping up
  automatically every N bars until you're at full speed.
- Groove changes while playing happen on the next bar line, so you stay in time.
- Settings are remembered between sessions.

## For bass players

- **You play the bass:** set *The app's bass* to *Silent* — the line keeps showing in the tab and grid
  while you play it — or *Call & response*: the app plays a bar, you play it back the next bar.
- **Live bass tab** (4- or 5-string) with note names and counting (1 e & a), following the chords and
  lighting up the current note. Fingerings keep your hand in one position.
- **Now / Next chord** display, so you always see where you're heading.
- **Fretboard view** (frets 0–12, 4 or 5 strings) for the current chord: root, chord tones, and optionally
  the matching scale (Dorian for m7, Mixolydian for 7, …) or pentatonic, labelled as intervals or note
  names. The note the bass is playing lights up live, so you see the line move across the neck.
- **Bass line styles:** groove's own line, roots, root–5th–octave, *lock to the kick*, walking lines with
  chromatic approach notes, and 🎲 random groove lines.
- **Note values** for each style: quarter, eighth or 16th notes, counted 1 e & a in the tab (on eighth-note grooves the grid is refined to 16ths; triplet-feel grooves get swung eighths / triplets).
  Walking lines in 8ths/16ths add octave skips and ghost notes; *lock to the kick* keeps only the kick hits on that rhythm.
- **Drums: kick only / kick + snare** to practise locking in with the kick drum.
- **Chord changes:** swap in a one-chord vamp, I–IV–V, I–vi–IV–V, ii–V–I, minor, 12-bar blues or the
  circle of 4ths (all 12 keys) over any groove.
- **Bass tuner:** microphone tuner that tracks down to low B (5-string), plus reference notes B E A D G.

## Practise your own music

Import files into **My music** (they're saved on your device and reopen next time):

| File | What you get |
|---|---|
| Text tab (`.txt`, or paste it in) | Playable. Rhythm is read from the spacing between bar lines (quantized to 16ths). Detects 4/5/6-string bass, guitar, drop/flat tunings. |
| MusicXML (`.musicxml`, `.xml`, `.mxl`) | Playable with exact rhythm. Export from MuseScore, Guitar Pro, Sibelius, Finale… Picks the bass part automatically (switchable), keeps tab fingerings, file tempo, ties and pickup bars. |
| PDF | Shown page by page next to the metronome, with page-turn buttons, tap-to-turn and auto page-turn every N bars. If the PDF contains tab as text, it's also playable. |

While practising a piece you get a tab of the current bar **and the next one** (read ahead), the note lit up on
the fretboard, a **loop from bar X to bar Y**, and everything else still works: practice speed, silent
"you play" mode, call & response, gap trainer, count-in. The selected groove's drums play along when its
meter matches the piece; otherwise you get the click.

### Sheet-music PDFs → MusicXML (Audiveris)

Printed notation can be converted into playable MusicXML with **[Audiveris](https://github.com/Audiveris/audiveris)**
(free, open-source optical music recognition), running as a GitHub Action in this repository
(`.github/workflows/omr.yml`). From the app: open a PDF in **My music** → **🎼 Convert to MusicXML**.
The app uploads the PDF to `omr/inbox/`, the workflow converts it (a few minutes) into `omr/out/`, and the
result appears in your library as a playable piece with the original PDF shown under it.

One-time setup:

1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new) with access
   to **only this repository** and the permission **Contents: Read and write**.
2. In the app (*My music → Sheet music → MusicXML setup*) enter `owner/groove-metronome` and the token.
   The token is kept only on your device and is sent only to `api.github.com`.

**Privacy:** in a public repository, the PDFs you convert and the results are public too (including git history).
The app asks you to confirm this once. To keep them private, copy `.github/` and `omr/` into a private repository
and enter that one in the app instead.

You can also drop a PDF/PNG/JPG into `omr/inbox/` on GitHub yourself; results land in `omr/out/`.
Recognition is best on clean, computer-engraved scores and weaker on phone photos and handwriting, so check
the result by ear. Bass-clef parts are assumed to be written bass (sounding an octave lower); change **Pitch** on
the piece if needed.

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
node tests/tuner.test.mjs     # pitch detector accuracy on synthetic bass notes
node tests/importers.test.mjs # ASCII tab parser and .mxl unzip (sample files in tests/fixtures/)
node tests/audio.test.mjs     # plucked-string bass/guitar tuning
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
js/audio.js           audio engine: samples, plucked strings, synths, reverb/limiter
samples/              CC0 recorded drum kit (Virtuosity Drums), percussion, e-piano, piano (VCSL) + manifest
js/grooves.js         groove library
js/theory.js          pattern parsers, chord theory, melody & bass line generators
js/tuner.js           microphone pitch detection for the tuner
js/practice.js        "My music" library, piece view, PDF viewer
js/importers.js       ASCII tab + MusicXML/.mxl parsers
js/library.js         IndexedDB storage for imported files
js/omr.js             GitHub upload/polling for sheet-music conversion
js/pdfview.js         PDF rendering / text extraction (loads vendor/pdfjs on demand)
vendor/pdfjs/         pdf.js 4.10.38 legacy build (Apache-2.0)
sw.js, manifest.webmanifest, icons/   PWA / offline / install
.github/workflows/omr.yml + .github/scripts/omr-convert.sh   Audiveris conversion
omr/inbox, omr/out    conversion queue and results
```
