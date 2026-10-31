// Groove library.
//
// beats  = beats per bar (what the click counts)
// sub    = steps per beat (2 = eighths, 3 = triplets, 4 = sixteenths)
// Drum lanes: one char per step. '.' rest, g ghost, o soft, x normal, X accent,
//             r ratchet (2 hits), t triplet ratchet (3 hits). Spaces/| ignored.
//             A lane may span several bars (its length is a multiple of beats*sub).
// bass / melody: space separated tokens per step. R T F S = chord root/3rd/5th/7th,
//             numbers = scale degrees from chord root (b3, 5, b7, 8 ...), ^/_ octave,
//             x dead note, '-' tie, '.' rest.
// chords:    comping rhythm: X/x/o hit, '-' tie, '.' rest.
// prog:      one chord per bar: "semitonesFromKey:quality".

const pad = (s, n) => s.padEnd(n, '.');

export const DRUM_ORDER = [
  'crash', 'ride', 'hho', 'hhc', 'shaker', 'cowbell', 'clave', 'conga', 'tomH', 'tomL', 'clap', 'rim', 'snare', 'kick',
];

export const DRUM_LABELS = {
  crash: 'Crash', ride: 'Ride', hho: 'Open HH', hhc: 'Hi-hat', shaker: 'Shaker', cowbell: 'Bell',
  clave: 'Clave', conga: 'Conga', tomH: 'Tom hi', tomL: 'Tom lo', clap: 'Clap', rim: 'Rim', snare: 'Snare', kick: 'Kick',
};

export const GROOVES = [
  // ---------------------------------------------------------------- Basic
  {
    id: 'metronome', name: 'Metronome (click only)', genre: 'Basic', basic: true,
    bpm: 100, beats: 4, sub: 1, drums: {}, prog: ['0:'],
    desc: 'Plain click. Choose beats per bar and subdivision below.',
  },

  // ---------------------------------------------------------------- Rock & Pop
  {
    id: 'rock', name: 'Rock Beat', genre: 'Rock & Pop', bpm: 110, beats: 4, sub: 4,
    drums: {
      crash: pad('X', 64),
      hhc: 'X.x.X.x.X.x.X.x.',
      snare: '....X.......X...',
      kick: 'X.......X.x.....',
    },
    bass: 'R . R . R . R . R . R . R . F .', bassSound: 'electric',
    chords: 'X - - - - - x - X - - - - - x -', chordSound: 'guitar',
    melody: 'R . . R . . b3 . 3 . . . 5 . . .', melodySound: 'square',
    prog: ['0:5', '5:5', '0:5', '7:5'],
    desc: 'Straight 8th-note hi-hat, backbeat on 2 & 4. I–IV–I–V power chords.',
  },
  {
    id: 'pop', name: 'Pop / Four Chords', genre: 'Rock & Pop', bpm: 100, beats: 4, sub: 4,
    drums: {
      hhc: 'x.x.x.x.x.x.x.x.',
      clap: '....X.......X...',
      snare: '....x.......x...',
      kick: 'X.....x.X.x.....',
    },
    bass: 'R . . R . . R . R . . R . . F .', bassSound: 'synth',
    chords: 'X . . x . . x . . . x . x . . .', chordSound: 'epiano',
    melody: '5 - . 6 - . 5 . T - - . 2 . R .', melodySound: 'pluck',
    prog: ['0:', '7:', '9:m', '5:'],
    desc: 'The I–V–vi–IV progression behind countless pop songs.',
  },
  {
    id: 'metal', name: 'Metal (double kick)', genre: 'Rock & Pop', bpm: 150, beats: 4, sub: 4,
    drums: {
      ride: 'X...X...X...X...',
      snare: '....X.......X...',
      kick: 'xxxxxxxxxxxxxxxx',
    },
    bass: 'R R R R R R R R R R R R b2 b2 R R', bassSound: 'synth',
    chords: 'X - - - - - - - X - - - X - x -', chordSound: 'guitar',
    melody: '8 . 8 . b7 . 8 . 5 . 8 . b6 . 5 .', melodySound: 'saw',
    prog: ['0:5', '0:5', '3:5', '1:5'],
    desc: 'Continuous 16th-note double kick. Great for building endurance.',
  },

  // ---------------------------------------------------------------- Funk & Soul
  {
    id: 'funk', name: 'Funk (16th feel)', genre: 'Funk & Soul', bpm: 98, beats: 4, sub: 4,
    drums: {
      hho: '..............x.',
      hhc: 'XoxoXoxoXoxoXo.o',
      snare: '....X..g.g..X..g',
      kick: 'X.....x...X..x..',
    },
    bass: 'R . . 8 . . R . x R . b7 . F b7 8', bassSound: 'electric',
    chords: '. . x X . . x . . x . X . . x .', chordSound: 'guitar',
    melody: '. . . . . . 5 . b7 . 8 - . . . .', melodySound: 'brass',
    prog: ['0:m7', '0:m7', '5:7', '5:7'],
    desc: 'Ghost notes on the snare, syncopated kick, chicken-scratch guitar.',
  },
  {
    id: 'motown', name: 'Motown', genre: 'Funk & Soul', bpm: 120, beats: 4, sub: 4,
    drums: {
      shaker: 'x.x.x.x.x.x.x.x.',
      snare: 'o...X...o...X...',
      kick: 'X.x.....X.x.....',
    },
    bass: 'R . . R . . F . 6 . . F . . T .', bassSound: 'electric',
    chords: 'x - . . x - . . x - . . x - . .', chordSound: 'epiano',
    melody: 'T . F . 6 . F . T - - . 2 . R .', melodySound: 'square',
    prog: ['0:', '4:m', '5:', '7:'],
    desc: 'Snare on every beat with a strong 2 & 4. Melodic, busy bass.',
  },
  {
    id: 'disco', name: 'Disco', genre: 'Funk & Soul', bpm: 120, beats: 4, sub: 4,
    drums: {
      hho: '..x...x...x...x.',
      hhc: 'x...x...x...x...',
      snare: '....X.......X...',
      kick: 'X...X...X...X...',
    },
    bass: 'R . 8 . R . 8 . R . 8 . R . 8 .', bassSound: 'synth',
    chords: '. . x . . . x . . . x . . . x .', chordSound: 'epiano',
    melody: '8 . 8 . S . 8 . . . F . T . F .', melodySound: 'saw',
    prog: ['0:m7', '5:m7', '10:', '3:maj7'],
    desc: 'Four-on-the-floor kick, open hi-hat on the offbeats, octave bass.',
  },
  {
    id: 'neosoul', name: 'Neo-Soul (laid back)', genre: 'Funk & Soul', bpm: 84, beats: 4, sub: 4, swing: 60,
    drums: {
      hhc: 'x.oxx.o.x.oxx.o.',
      snare: '....x.......x...',
      kick: 'X......x..X.....',
    },
    bass: 'R - - . . . . T F - . . 2 . T .', bassSound: 'electric',
    chords: 'X - - - - - . . . . x - - - . .', chordSound: 'epiano',
    melody: '. . 9 - S . F . . . T . 2 . R .', melodySound: 'flute',
    prog: ['0:maj7', '4:m7', '9:m7', '2:9'],
    desc: 'Swung 16ths, lush extended chords. Try more swing and humanize.',
  },

  // ---------------------------------------------------------------- Hip-Hop & Electronic
  {
    id: 'boombap', name: 'Boom Bap', genre: 'Hip-Hop & Electronic', bpm: 90, beats: 4, sub: 4, swing: 58,
    drums: {
      hhc: 'x.x.x.x.x.x.x.x.',
      snare: '....X.......X...',
      kick: 'X......x..X..x..',
    },
    bass: 'R - - - . . . b7 . . R - . . b3 .', bassSound: 'electric',
    chords: 'X - - - - - - - . . . . x - - -', chordSound: 'epiano',
    melody: '8 . . 5 . . b7 . . . 5 . b3 . . .', melodySound: 'bell',
    prog: ['0:m7', '0:m7', '8:maj7', '7:m7'],
    desc: 'Classic 90s hip-hop with a lazy swing.',
  },
  {
    id: 'trap', name: 'Trap', genre: 'Hip-Hop & Electronic', bpm: 140, beats: 4, sub: 4,
    drums: {
      hhc: 'x.x.x.x.x.xrx.t.',
      clap: '........X.......',
      kick: 'X......x..x.....',
    },
    bass: 'R - - - - - - R - - R - - - - -', bassSound: '808',
    chords: 'X - - - - - - - - - - - - - - -', chordSound: 'pad',
    melody: '8 . . S . . F . . . T . . . F .', melodySound: 'bell',
    prog: ['0:m', '0:m', '8:', '7:'],
    desc: 'Half-time clap on 3, hi-hat rolls, sliding 808 bass.',
  },
  {
    id: 'house', name: 'House', genre: 'Hip-Hop & Electronic', bpm: 124, beats: 4, sub: 4,
    drums: {
      hho: '..x...x...x...x.',
      shaker: 'xoxoxoxoxoxoxoxo',
      clap: '....X.......X...',
      kick: 'X...X...X...X...',
    },
    bass: '. . R . . . 8 . . . R . . . 8 R', bassSound: 'synth',
    chords: '. . . x . . x . . . . x . . x .', chordSound: 'organ',
    melody: 'F . 8 . F . S . F . 8 . 9 . S .', melodySound: 'pluck',
    prog: ['0:m9', '0:m9', '5:m9', '5:m9'],
    desc: 'Four-on-the-floor, offbeat bass and open hats.',
  },
  {
    id: 'dnb', name: 'Drum & Bass', genre: 'Hip-Hop & Electronic', bpm: 172, beats: 4, sub: 4,
    drums: {
      hhc: 'x.x.x.x.x.x.x.x.',
      snare: '....X..g.g..X...',
      kick: 'X.........X.....',
    },
    bass: 'R - - - - - - - - - T - - S - -', bassSound: 'synth',
    chords: 'X - - - - - - - - - - - - - - -', chordSound: 'pad',
    prog: ['0:m', '0:m', '8:maj7', '10:'],
    desc: 'Fast two-step breakbeat. Melody is generated — hit “New melody”.',
  },

  // ---------------------------------------------------------------- Latin & Caribbean
  {
    id: 'bossa', name: 'Bossa Nova', genre: 'Latin & Caribbean', bpm: 140, beats: 4, sub: 2,
    drums: {
      hhc: 'oooooooo',
      rim: 'x..x..x...x..x..',
      kick: 'X..xX..x',
    },
    bass: 'R - - F F - - F', bassSound: 'upright',
    chords: 'x . x . . x . x . x . . x . x .', chordSound: 'guitar',
    melody: '5 - - T - . 2 - T - - 2 - . R -', melodySound: 'flute',
    prog: ['0:maj7', '0:maj7', '2:7', '2:7', '2:m7', '1:7', '0:maj7', '1:7'],
    desc: 'Brazilian bossa clave on the rim, gentle 8th-note feel.',
  },
  {
    id: 'samba', name: 'Samba', genre: 'Latin & Caribbean', bpm: 100, beats: 2, sub: 4,
    drums: {
      shaker: 'xoXoxoXo',
      rim: 'x.xx.x.x.xx.x.x.',
      kick: 'o..xX..x',
    },
    bass: 'R . . F F - - .', bassSound: 'electric',
    chords: 'x . x . . x . x', chordSound: 'guitar',
    melody: '8 . 6 . F . T . F . . T . 2 . .', melodySound: 'flute',
    prog: ['2:m7', '7:7', '0:maj7', '0:maj7'],
    desc: 'Counted in 2. Surdo-style kick with the accent on beat 2.',
  },
  {
    id: 'salsa', name: 'Salsa (son clave 2-3)', genre: 'Latin & Caribbean', bpm: 180, beats: 4, sub: 2,
    drums: {
      cowbell: 'X.x.X.x.',
      clave: '..x.x...x..x..x.',
      conga: '..x...xx',
    },
    bass: '. . . F - - R -', bassSound: 'upright',
    chords: 'x . x x . x x . x . x x . x . x', chordSound: 'epiano',
    melody: '8 . T . F . T . R - . . . . . .', melodySound: 'brass',
    prog: ['0:', '5:', '7:7', '5:'],
    desc: '2-3 son clave, conga tumbao, anticipated bass and piano montuno.',
  },
  {
    id: 'reggae', name: 'Reggae One Drop', genre: 'Latin & Caribbean', bpm: 76, beats: 4, sub: 4, swing: 62,
    drums: {
      hhc: 'x.x.x.x.x.x.x.xx',
      rim: '........X.......',
      kick: '........X.......',
    },
    bass: 'R - . . . . T . F - . . . . T .', bassSound: 'electric',
    chords: '. . . . x . . . . . . . x . . .', chordSound: 'organ',
    melody: 'T . F . . . S . 8 - - - . . . .', melodySound: 'square',
    prog: ['0:m', '10:', '0:m', '10:'],
    desc: 'Kick and rim together on beat 3 only, organ skank on the offbeats.',
  },

  // ---------------------------------------------------------------- African
  {
    id: 'afrobeat', name: 'Afrobeat', genre: 'African', bpm: 110, beats: 4, sub: 4,
    drums: {
      hhc: 'x.o.x.o.x.o.x.o.',
      shaker: 'oooooooooooooooo',
      cowbell: 'X.x.xx.x.xx.x.x.',
      snare: '....x..g.x..x..g',
      kick: 'X......xX.x.....',
    },
    bass: 'R . . R . . b7 . 8 . . F . b7 F .', bassSound: 'electric',
    chords: 'x . x . . x . x . . x . x . . x', chordSound: 'guitar',
    melody: '8 - . S - . F . . . T . F - . .', melodySound: 'brass',
    prog: ['0:m7', '0:m7', '5:9', '5:9'],
    desc: 'Interlocking bell, shaker and guitar patterns over a hypnotic bass.',
  },

  // ---------------------------------------------------------------- Jazz & Blues
  {
    id: 'swing', name: 'Jazz Swing', genre: 'Jazz & Blues', bpm: 150, beats: 4, sub: 3,
    drums: {
      ride: 'x..X.xx..X.x',
      hhc: '...x.....x..',
      snare: '........g.......g..g....',
      kick: 'g..g..g..g..',
    },
    bass: 'R - - 2 - - T - - A - -', bassSound: 'upright',
    chords: 'x . . . . x . . . . . .', chordSound: 'epiano',
    melody: 'F - - . . T 2 - - R . .', melodySound: 'brass',
    prog: ['2:m7', '7:7', '0:maj7', '9:7'],
    desc: 'Spang-a-lang ride, hi-hat on 2 & 4, walking bass over ii–V–I–VI.',
  },
  {
    id: 'shuffle', name: 'Blues Shuffle (12-bar)', genre: 'Jazz & Blues', bpm: 100, beats: 4, sub: 3,
    drums: {
      hhc: 'x.xx.xx.xx.x',
      snare: '...X.....X..',
      kick: 'X.....X.....',
    },
    bass: 'R . 3 F . 6 b7 . 6 F . 3', bassSound: 'electric',
    chords: '. . . x . . . . . x . .', chordSound: 'organ',
    melody: 'b3 . 3 . . . R . . . . .', melodySound: 'square',
    prog: ['0:7', '5:7', '0:7', '0:7', '5:7', '5:7', '0:7', '0:7', '7:7', '5:7', '0:7', '7:7'],
    desc: 'Triplet shuffle with a boogie bass line through a full 12-bar blues.',
  },

  // ---------------------------------------------------------------- Ballads & Waltz
  {
    id: 'ballad68', name: '6/8 Ballad', genre: 'Ballads & 3s', bpm: 60, beats: 2, sub: 3,
    drums: {
      hhc: 'xooxoo',
      snare: '...X..',
      kick: 'X.....X..x..',
    },
    bass: 'R - - F - -', bassSound: 'electric',
    chords: 'x - - - - -', chordSound: 'epiano',
    melody: 'R . T . F . 8 - - F - -', melodySound: 'bell',
    prog: ['0:', '9:m', '5:', '7:'],
    desc: 'Felt in 2 (dotted quarters), each beat split in three.',
  },
  {
    id: 'waltz', name: 'Waltz 3/4', genre: 'Ballads & 3s', bpm: 120, beats: 3, sub: 2,
    drums: {
      snare: '..o.o.',
      kick: 'X.....',
    },
    bass: 'R - - - - - F - - - - -', bassSound: 'upright',
    chords: '. . x - x -', chordSound: 'epiano',
    melody: 'F - - - T . 8 - - - . .', melodySound: 'flute',
    prog: ['0:', '7:7', '7:7', '0:'],
    desc: 'Oom-pah-pah: bass on 1, chords on 2 and 3.',
  },

  // ---------------------------------------------------------------- Odd meters
  {
    id: 'five4', name: '5/4 (3+2)', genre: 'Odd Meters', bpm: 160, beats: 5, sub: 2, accentBeats: [0, 3],
    drums: {
      hhc: 'x.x.x.x.x.',
      snare: '..X.....X.',
      kick: 'X.....X...',
    },
    bass: 'R - . . F . R - . .', bassSound: 'upright',
    chords: 'x . . x . . x . x .', chordSound: 'epiano',
    melody: '8 . F . T . R . 2 .', melodySound: 'flute',
    prog: ['0:m7', '5:m7'],
    desc: 'Five beats grouped 3+2. Accented clicks mark the groups.',
  },
  {
    id: 'seven8', name: '7/8 (2+2+3)', genre: 'Odd Meters', bpm: 220, beats: 7, sub: 2, accentBeats: [0, 2, 4],
    beatUnit: '♪',
    drums: {
      hhc: 'x.x.x.x.x.x.x.',
      snare: '....X.......x.',
      kick: 'X.......X.....',
    },
    bass: 'R - . . R - . . F - . . T .', bassSound: 'synth',
    chords: 'x . . . x . . . x . . . . .', chordSound: 'guitar',
    melody: '8 . F . T . F . 8 . . S . .', melodySound: 'pluck',
    prog: ['0:m', '0:m', '10:', '10:'],
    desc: 'Tempo is in eighth notes. Grouped 2+2+3 — “quick, quick, slow”.',
  },
];

// Chord progressions a bass player can swap in to practise lines over changes.
export const PROGRESSIONS = [
  { id: 'default', name: 'Groove default' },
  { id: 'vamp-m', name: 'One-chord vamp (minor)', chords: ['0:m7'] },
  { id: 'vamp-7', name: 'One-chord vamp (dominant)', chords: ['0:7'] },
  { id: '145', name: 'I – IV – V – IV', chords: ['0:', '5:', '7:', '5:'] },
  { id: '1645', name: 'I – vi – IV – V', chords: ['0:', '9:m', '5:', '7:'] },
  { id: '251', name: 'ii – V – I', chords: ['2:m7', '7:7', '0:maj7', '0:maj7'] },
  { id: 'minor', name: 'i – ♭VII – ♭VI – V', chords: ['0:m', '10:', '8:', '7:7'] },
  { id: 'blues', name: '12-bar blues', chords: ['0:7', '5:7', '0:7', '0:7', '5:7', '5:7', '0:7', '0:7', '7:7', '5:7', '0:7', '7:7'] },
  { id: 'circle', name: 'Circle of 4ths (all keys)', chords: ['0:7', '5:7', '10:7', '3:7', '8:7', '1:7', '6:7', '11:7', '4:7', '9:7', '2:7', '7:7'] },
];
