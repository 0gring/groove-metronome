# Groove Metronome — sheet music conversion (keep this repo PRIVATE)

This repository converts sheet-music PDFs into MusicXML for the
[Groove Metronome](https://github.com/0gring/groove-metronome) app, using
[Audiveris](https://github.com/Audiveris/audiveris) (open-source optical music recognition) in GitHub Actions.

**Keep it private.** Everything uploaded here (your PDFs, the converted scores and their git history)
is visible to anyone who can read the repository.

## How it works

1. The app uploads a PDF to `omr/inbox/` (or you add a PDF/PNG/JPG there yourself on github.com).
2. The **Sheet music to MusicXML** workflow runs Audiveris and writes
   - `omr/out/<name>.mxl`: the MusicXML score (if recognition succeeded)
   - `omr/out/<name>.json`: status, message and a log excerpt
3. The input file is removed from the inbox, and the app downloads the result into your library.

## Setup

1. Copy the contents of this folder (`.github/`, `omr/`, this README) into a new **private** repository.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with
   *Repository access* → **only this repository** and *Permissions* → **Contents: Read and write**.
3. In the app: **My music → Sheet music → MusicXML setup**, enter `owner/this-repo` and the token.

Private repositories get 2,000 free GitHub Actions minutes per month; a conversion takes a few minutes.
Recognition is best on clean, computer-engraved scores and weaker on phone photos and handwriting.
