\version "2.24.0"
\header { title = "Bass Line Study" tagline = ##f }
\paper { #(set-paper-size "a4") }
\score {
  \new Staff \with { instrumentName = "Bass" } {
    \clef bass \key c \major \time 4/4 \tempo 4 = 100
    a,4 c8 e8 a4 g4 |
    d4 f8 a8 d'4 c'4 |
    e4 gis8 b8 e'2 |
    a,4 r4 a,8 b,8 c4 |
    f,4 a,8 c8 f4 e4 |
    d4 f4 a4 r4 |
    e4 e8 e8 gis4 b4 |
    a,2 ~ a,4 r4 \bar "|."
  }
  \layout { }
}
