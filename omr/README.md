# Sheet music → MusicXML (Audiveris)

Drop a PDF (or a PNG/JPG/TIFF scan) of sheet music into `omr/inbox/` on the default branch.
The **Sheet music to MusicXML** workflow runs [Audiveris](https://github.com/Audiveris/audiveris)
(open-source optical music recognition) and writes:

- `omr/out/<name>.mxl` — the MusicXML score (if recognition succeeded)
- `omr/out/<name>.json` — status, message and a log excerpt

The input file is then removed from the inbox. The Groove Metronome app does all of this for you:
open a PDF in **My music** and tap **🎼 Convert to MusicXML** (one-time GitHub token setup).

Works best on clean, computer-engraved scores. Phone photos, handwriting and very dense scores
are often recognized poorly — check the result by ear before practising it.
