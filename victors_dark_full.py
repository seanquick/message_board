# ---- victors_dark_full.py ----
# Generates victors_dark_full.mid with a recognizable "Hail to the Victors"
# chorus in a dark C-minor adaptation, with bass + drums. 120 BPM.

from midiutil import MIDIFile

BPM = 120
TPQ = 960  # high ticks per quarter for smooth timing (internal; MIDIUtil hides it)

# Tracks & channels
TR_MELO, CH_MELO = 0, 0   # Dexed
TR_BASS, CH_BASS = 1, 1   # SI-Bass
TR_DRUM, CH_DRUM = 2, 9   # GM Drums (channel 10)

m = MIDIFile(3)
m.addTempo(TR_MELO, 0, BPM)
m.addTempo(TR_BASS, 0, BPM)
m.addTempo(TR_DRUM, 0, BPM)

# Helper
def add(tr, ch, note, start_beats, dur_beats, vel):
    m.addNote(tr, ch, note, start_beats, dur_beats, vel)

# ---------- Pitch helpers (C minor register) ----------
# Octave reference: C4 = 60
C3, D3, Eb3, F3, G3, Ab3, Bb3 = 48, 50, 51, 53, 55, 56, 58
C4, D4, Eb4, F4, G4, Ab4, Bb4 = 60, 62, 63, 65, 67, 68, 70
C5, D5, Eb5, F5, G5, Ab5, Bb5 = 72, 74, 75, 77, 79, 80, 82
C6 = 84
# Low register for Bass Guitar
C2, D2, Eb2, F2, G2, Ab2, Bb2 = 36, 38, 39, 41, 43, 44, 46
C1, D1, Eb1, F1, G1, Ab1, Bb1 = 24, 26, 27, 29, 31, 32, 34


# ---------- Form plan ----------
# We'll do a 32-beat (= 8 bars) chorus phrase, then vary/repeat to feel like a full version.
# Each tuple: (start_in_beats, midi_note, duration_beats, velocity)
# Rhythms are dotted/straight to match the recognizable chant-like contour.

mel = []

# CHORUS A (beats 0–32): "Hail! to the vic-tors val-iant / Hail! to the conqu’ring heroes"
# Phrase 1: G G Ab G | C C Bb Ab  (each roughly 1/2-beat or 1-beat — adapted for C minor mood)
mel += [
    (0.0,  G4, 0.5, 100), (0.5,  G4, 0.5, 100), (1.0, Ab4,0.5,105), (1.5, G4, 0.5,100),
    (2.0,  C5, 0.5,110), (2.5,  C5, 0.5,110), (3.0, Bb4,0.5,105), (3.5, Ab4,0.5,100),
]
# Phrase 2: G G Ab G | Eb Eb D C
mel += [
    (4.0,  G4, 0.5,100), (4.5,  G4, 0.5,100), (5.0, Ab4,0.5,105), (5.5, G4, 0.5,100),
    (6.0,  Eb5,0.5,112), (6.5,  Eb5,0.5,112), (7.0, D5, 0.5,108), (7.5, C5, 0.5,106),
]
# Phrase 3: Bb Bb C Bb | Ab G F G
mel += [
    (8.0,  Bb4,0.5,106), (8.5,  Bb4,0.5,106), (9.0,  C5, 0.5,110), (9.5,  Bb4,0.5,106),
    (10.0, Ab4,0.5,104), (10.5, G4, 0.5,100), (11.0, F4, 0.5,96),  (11.5, G4, 0.5,100),
]
# Phrase 4 (cadence): Ab G F Eb | C (hold 2 beats)
mel += [
    (12.0, Ab4,0.5,104), (12.5, G4, 0.5,100), (13.0, F4, 0.5,96),  (13.5, Eb4,0.5,96),
    (14.0, C5, 2.0, 112),
]

# CHORUS B (beats 16–48): repeat with slight lift (octave ups on key notes & a stronger cadence)
lift = 16.0
mel += [
    (lift+0.0,  G4, 0.5,104), (lift+0.5,  G4, 0.5,104), (lift+1.0, Ab4,0.5,110), (lift+1.5, G4, 0.5,104),
    (lift+2.0,  C5, 0.5,114), (lift+2.5,  C5, 0.5,114), (lift+3.0, Bb4,0.5,110), (lift+3.5, Ab4,0.5,106),

    (lift+4.0,  G4, 0.5,104), (lift+4.5,  G4, 0.5,104), (lift+5.0, Ab4,0.5,110), (lift+5.5, G4, 0.5,104),
    (lift+6.0,  Eb5,0.5,116), (lift+6.5,  Eb5,0.5,116), (lift+7.0, D5, 0.5,112), (lift+7.5, C5, 0.5,110),

    (lift+8.0,  Bb4,0.5,110), (lift+8.5,  Bb4,0.5,110), (lift+9.0,  C5, 0.5,114), (lift+9.5,  Bb4,0.5,110),
    (lift+10.0, Ab4,0.5,108), (lift+10.5, G4,0.5,104), (lift+11.0, F4,0.5,100), (lift+11.5, G4,0.5,104),

    # Stronger cadence: Ab G F Eb | C5 (hold) + add C6 soft layer for lift
    (lift+12.0, Ab4,0.5,108), (lift+12.5, G4, 0.5,104), (lift+13.0, F4, 0.5,100), (lift+13.5, Eb4,0.5,100),
    (lift+14.0, C5,  2.0,120), (lift+14.0, C6, 2.0, 64),
]

# WRITE melody
for start, note, dur, vel in mel:
    add(TR_MELO, CH_MELO, note, start, dur, vel)

# ---------- Bass foundation ----------
# Simple march-like roots to support the melody:
# | C | C | Ab | Ab | Bb | Bb | G | G |   (each block = 2 bars / 8 beats)
bass_prog = [
    (0.0,  C2, 8.0, 88),
    (8.0,  Ab1,8.0, 86),
    (16.0, Bb1,8.0, 88),
    (24.0, G1, 8.0,  86),
]
for start, note, dur, vel in bass_prog:
    add(TR_BASS, CH_BASS, note, start, dur, vel)

# ---------- Drums (GM ch 10) ----------
KICK, SNARE, TOML, CRASH = 36, 38, 45, 49

def hat_grid(start_beat, bars, on_vel=72, off_vel=64):
    # closed hats on 8ths with a light humanized pulse
    steps = int(bars * 8)
    t = start_beat
    for i in range(steps):
        vel = on_vel if (i % 2 == 0) else off_vel
        # Use 42 (Closed Hat)
        m.addNote(TR_DRUM, CH_DRUM, 42, t, 0.1, vel)
        t += 0.5

# Kicks on 1 and 3, Snare on 2 and 4 across the whole 32 beats
for bar in range(0, 32, 4):
    b = float(bar)
    # per bar in this loop (4 beats at a time)
    for sub in range(4):
        beat_start = b + sub
        # Kick on 1 and 3
        if sub in (0, 2):
            m.addNote(TR_DRUM, CH_DRUM, KICK, beat_start, 0.1, 112)
        # Snare on 2 and 4
        if sub in (1, 3):
            m.addNote(TR_DRUM, CH_DRUM, SNARE, beat_start, 0.1, 106)

# light tom accents on the downbeats of each 8-beat block
for t0 in [0.0, 8.0, 16.0, 24.0]:
    m.addNote(TR_DRUM, CH_DRUM, TOML, t0, 0.25, 98)

# Crash at the mid-point and final cadence
m.addNote(TR_DRUM, CH_DRUM, CRASH, 16.0, 1.0, 108)
m.addNote(TR_DRUM, CH_DRUM, CRASH, 30.0, 1.5, 116)

# Optional hat bed for momentum
hat_grid(0.0, bars=8)  # 8 bars of gentle 8th hats

# SAVE
with open("victors_dark_full.mid", "wb") as f:
    m.writeFile(f)

print("✅ Wrote victors_dark_full.mid")
