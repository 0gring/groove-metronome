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
  'crash', 'ride', 'hho', 'hhc', 'tamb', 'shaker', 'cowbell', 'clave', 'conga', 'tomH', 'tomL', 'clap', 'rim', 'snare', 'kick',
];

export const DRUM_LABELS = {
  crash: 'Crash', ride: 'Ride', hho: 'Open HH', hhc: 'Hi-hat', tamb: 'Tambourine', shaker: 'Shaker', cowbell: 'Bell',
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
    vars: [
      { name: 'Push', drums: { kick: 'X.x.....X.x..x..', hhc: 'X.x.X.x.X.x.X...', hho: '..............x.' } },
      { name: 'Ride', drums: { hhc: '....o.......o...', ride: 'X.x.X.x.X.x.X.x.' } },
    ],
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
    vars: [
      { name: 'Shaker', drums: { kick: 'X..x..x.X.......', shaker: 'xoxoxoxoxoxoxoxo' } },
      { name: 'Half-time', drums: { kick: 'X.........x.....', snare: '........X.......', clap: '........X.......' } },
    ],
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
    vars: [
      { name: 'Gallop', drums: { kick: 'X.xxX.xxX.xxX.xx' } },
      { name: 'Blast', drums: { kick: 'x.x.x.x.x.x.x.x.', snare: '.X.X.X.X.X.X.X.X', ride: 'X.x.X.x.X.x.X.x.' } },
    ],
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
    vars: [
      { name: '16th hats', drums: { kick: 'X..x..x...X.....', snare: '....X..g.g.gX..g', hhc: 'XxxxXxxxXxxxXxxx', hho: null } },
      { name: 'Open hats', drums: { kick: 'X.x...x...X..x.x', snare: '....X..g.g..X...', hhc: 'X.x.X.x.X.x.X.x.', hho: '...x.......x....' } },
    ],
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
    vars: [
      { name: 'Busy hats', drums: { hhc: 'xx..xx..xx..xx..', clap: '....X.......X...' } },
      { name: 'Syncopated snare', drums: { snare: '....X..x....X...', hho: null, hhc: 'x.x.x.x.x.x.x.x.' } },
    ],
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
    vars: [
      { name: 'Rim & push', drums: { kick: 'X.....x...x..x..', snare: null, rim: '....x.......x...' } },
      { name: 'Late kick', drums: { kick: 'X......x.xX.....', snare: '....X......g.gX.', hhc: 'x.x.x.x.x.x.x.x.' } },
    ],
  },

  // ---------------------------------------------------------------- Motown
  {
    id: 'motown', name: 'Motown Backbeat', genre: 'Motown', bpm: 118, beats: 4, sub: 4,
    drums: {
      tamb: '....X.......X...',
      hhc: 'x.x.x.x.x.x.x.x.',
      snare: 'o...X...o...X...',
      kick: 'X.x.....X.x.....',
    },
    bass: 'R . . R . . F . 6 . . F . . A .', bassSound: 'electric',
    chords: 'x - . . x - . . x - . . x - . .', chordSound: 'piano',
    melody: 'T . F . 6 . F . T - - . 2 . R .', melodySound: 'brass',
    prog: ['0:', '9:m', '5:', '7:'],
    desc: 'Snare on all four beats (strong on 2 & 4), tambourine on the backbeat, busy melodic bass.',
    vars: [
      { name: 'Pickup kick', drums: { kick: 'X..x....X..x..x.' } },
      { name: 'Tambourine 8ths', drums: { tamb: 'x.x.X.x.x.x.X.x.', hhc: null } },
    ],
  },
  {
    id: 'motown4', name: 'Motown Four-on-the-Floor', genre: 'Motown', bpm: 126, beats: 4, sub: 4,
    drums: {
      tamb: 'x.x.X.x.x.x.X.x.',
      snare: '....X.......X...',
      kick: 'X...X...X...X...',
    },
    bass: 'R . . R . . 8 . F . . 6 . . A .', bassSound: 'electric',
    chords: '. . . . X - . . . . . . X - . .', chordSound: 'piano',
    melody: '5 . . 5 . . 6 . 5 - - . T . 2 .', melodySound: 'brass',
    prog: ['0:', '9:m', '2:m7', '7:7'],
    desc: 'Driving kick on every beat, tambourine 8ths, piano stabs on 2 & 4.',
    vars: [
      { name: 'Hi-hat', drums: { hhc: 'x.x.x.x.x.x.x.x.', tamb: '....X.......X...' } },
      { name: 'Snare drive', drums: { snare: 'o...X...o...X...', tamb: 'xxxxXxxxxxxxXxxx' } },
    ],
  },
  {
    id: 'motownshuffle', name: 'Motown Shuffle', genre: 'Motown', bpm: 104, beats: 4, sub: 3,
    drums: {
      tamb: '...X.....X..',
      hhc: 'x.xx.xx.xx.x',
      snare: '...X.....X..',
      kick: 'X.....X.....',
    },
    bass: 'R . 8 F . 6 b7 . 6 F . A', bassSound: 'electric',
    chords: '. . . x . . . . . x . .', chordSound: 'piano',
    melody: 'T . F . . . 6 . F T - -', melodySound: 'brass',
    prog: ['0:', '0:', '5:', '7:7'],
    desc: 'Triplet shuffle with tambourine and piano on the backbeat.',
    vars: [
      { name: 'Four snare', drums: { snare: 'o..X..o..X..' } },
      { name: 'Ride', drums: { hhc: null, ride: 'x.xx.xx.xx.x' } },
    ],
  },
  {
    id: 'motownballad', name: 'Motown Ballad', genre: 'Motown', bpm: 72, beats: 4, sub: 4,
    drums: {
      tamb: '....x.......x...',
      hhc: 'x.x.x.x.x.x.x.x.',
      rim: '....X.......X...',
      kick: 'X.......X.x.....',
    },
    bass: 'R - - - T - - . F - - . 6 - A -', bassSound: 'electric',
    chords: 'X - - - - - - - x - - - - - - -', chordSound: 'epiano',
    melody: '. . . . T - - . 2 - R . . . . .', melodySound: 'flute',
    prog: ['0:maj7', '9:m7', '2:m7', '7:7'],
    desc: 'Slow and soulful: cross-stick backbeat, sustained electric piano, singing bass.',
    vars: [
      { name: 'Snare', drums: { rim: null, snare: '....X.......X...' } },
      { name: '16th hats', drums: { hhc: 'xoxoxoxoxoxoxoxo', kick: 'X......xX.x.....' } },
    ],
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
    vars: [
      { name: 'Sparse', drums: { kick: 'X.........X.x...', snare: '....X.......X..g', hhc: 'x.x.x.xxx.x.x.x.' } },
      { name: 'Bouncy', drums: { kick: 'X..x......X..x..', hhc: 'x.xxx.x.x.xxx.x.' } },
    ],
  },
  {
    id: 'trap', kit: 'electronic', name: 'Trap', genre: 'Hip-Hop & Electronic', bpm: 140, beats: 4, sub: 4,
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
    vars: [
      { name: 'Rolling', drums: { kick: 'X.....x...x...x.', hhc: 'x.x.xrx.x.x.t.x.' } },
      { name: 'Triplet hats', drums: { kick: 'X..x......x..x..', hhc: 'xxxxx.x.xxxxx.r.' } },
    ],
  },
  {
    id: 'house', kit: 'electronic', name: 'House', genre: 'Hip-Hop & Electronic', bpm: 124, beats: 4, sub: 4,
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
    vars: [
      { name: 'Bare', drums: { hhc: 'x...x...x...x...', shaker: null } },
      { name: 'Percussion', drums: { snare: '....x.......x..x', conga: '...x..x....x..x.' } },
    ],
  },
  {
    id: 'dnb', kit: 'electronic', name: 'Drum & Bass', genre: 'Hip-Hop & Electronic', bpm: 172, beats: 4, sub: 4,
    drums: {
      hhc: 'x.x.x.x.x.x.x.x.',
      snare: '....X..g.g..X...',
      kick: 'X.........X.....',
    },
    bass: 'R - - - - - - - - - T - - S - -', bassSound: 'synth',
    chords: 'X - - - - - - - - - - - - - - -', chordSound: 'pad',
    prog: ['0:m', '0:m', '8:maj7', '10:'],
    desc: 'Fast two-step breakbeat. Melody is generated — hit “New melody”.',
    vars: [
      { name: 'Double kick', drums: { kick: 'X.X.......X.....', snare: '....X.......X...' } },
      { name: 'Ride', drums: { kick: 'X.........X..x..', snare: '....X..g.g..X.g.', hhc: null, ride: 'x.x.x.x.x.x.x.x.' } },
    ],
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
    vars: [
      { name: '2-3 clave', drums: { rim: '..x..x..x..x..x.' } },
      { name: 'Ride', drums: { hhc: null, ride: 'x.x.x.x.' } },
    ],
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
    vars: [
      { name: 'Accents', drums: { shaker: 'xxXxxxXx', rim: 'x.x.x..x.x.x.x..' } },
      { name: 'Surdo', drums: { kick: 'o..x...x', tomL: '....X...' } },
    ],
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
    vars: [
      { name: '3-2 clave', drums: { clave: 'x..x..x...x.x...' } },
      { name: 'Campana', drums: { cowbell: 'XxX.XxX.', kick: '...x...x' } },
    ],
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
    vars: [
      { name: 'Steppers', drums: { kick: 'X...X...X...X...' } },
      { name: 'Rockers', drums: { kick: 'X.......X.......', rim: null, snare: '........X.......', hhc: 'x.xxx.xxx.xxx.xx' } },
    ],
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
    vars: [
      { name: 'Straight hats', drums: { kick: 'X.....x...X.....', hhc: 'x.x.x.x.x.x.x.x.' } },
      { name: 'Open hats', drums: { hhc: 'x...x...x...x...', hho: '..x...x...x...x.' } },
    ],
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
    vars: [
      { name: 'Two-feel', drums: { kick: 'g.....g.....', snare: '.....g..g...' } },
      { name: 'Brushes', drums: { ride: null, snare: 'o..o.oo..o.o' } },
    ],
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
    vars: [
      { name: 'Driving', drums: { kick: 'X..x..X..x..' } },
      { name: 'Ride', drums: { hhc: '...x.....x..', ride: 'x.xx.xx.xx.x' } },
    ],
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
    vars: [
      { name: 'Fuller', drums: { kick: 'X..X..', hhc: 'xxxxxx' } },
      { name: 'Ride', drums: { hhc: null, ride: 'x.xx.x' } },
    ],
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
    vars: [
      { name: 'Hats', drums: { hhc: 'x.x.x.' } },
      { name: 'Brushes', drums: { snare: 'o.ooo.' } },
    ],
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
    vars: [
      { name: 'Push', drums: { kick: 'X.x...X.x.' } },
      { name: 'Ride', drums: { hhc: null, ride: 'x.xxx.xxx.' } },
    ],
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
    vars: [
      { name: 'Driving', drums: { kick: 'X...X...X.....', snare: '..X...X.....X.' } },
      { name: 'Ride', drums: { kick: 'X.......X.x...', hhc: null, ride: 'x.x.x.x.x.x.x.' } },
    ],
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
