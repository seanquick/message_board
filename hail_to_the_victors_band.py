# ---- hail_to_the_victors_band.py ----
# Full marching band style version of "Hail to the Victors" (University of Michigan)
# Melody, harmony, tuba, and drums included.

from midiutil import MIDIFile

# -----------------------------
# Setup
# -----------------------------
BPM = 144  # Marching tempo
mf = MIDIFile(4)  # Four tracks: melody, harmony, bass, drums
for t in range(4):
    mf.addTempo(t, 0, BPM)

# Channels and instruments
CH_MELODY = 0   # Trumpets
CH_HARMONY = 1  # Trombones / Horns
CH_BASS = 2     # Tuba / Sousaphone
CH_DRUMS = 9    # Percussion (drum channel)

mf.addProgramChange(0, CH_MELODY, 0, 56)  # Trumpet
mf.addProgramChange(1, CH_HARMONY, 0, 57) # Trombone
mf.addProgramChange(2, CH_BASS, 0, 58)    # Tuba

# -----------------------------
# Notes (Bb Major)
# -----------------------------
Bb2, C3, D3, Eb3, F3, G3, A3, Bb3 = 46, 48, 50, 51, 53, 55, 57, 58
C4, D4, Eb4, F4, G4, A4, Bb4 = 60, 62, 63, 65, 67, 69, 70
C5, D5, Eb5, F5, G5, A5, Bb5 = 72, 74, 75, 77, 79, 81, 82

def add(track, ch, note, start, dur, vel=100):
    mf.addNote(track, ch, note, start, dur, vel)

# -----------------------------
# Melody (2 full verses)
# -----------------------------
melody = [
    # "Hail! to the victors valiant"
    (Bb4,0.5),(Bb4,0.5),(C5,0.5),(Bb4,0.5),(F5,1.0),
    (F5,0.5),(Eb5,0.5),(D5,1.0),
    # "Hail! to the conqu’ring heroes"
    (C5,0.5),(C5,0.5),(D5,0.5),(C5,0.5),(G5,1.0),
    (G5,0.5),(F5,0.5),(Eb5,1.0),
    # "Hail! Hail! to Michigan"
    (Bb4,0.5),(Bb4,0.5),(C5,0.5),(Bb4,0.5),
    (A4,0.5),(Bb4,0.5),(C5,0.5),(D5,0.5),
    # "the champions of the West!"
    (Eb5,0.5),(F5,0.5),(G5,0.5),(A5,0.5),(Bb5,2.0),

    # Second verse - "Now for a cheer..."
    (Bb4,0.5),(Bb4,0.5),(C5,0.5),(Bb4,0.5),(F5,1.0),
    (F5,0.5),(Eb5,0.5),(D5,1.0),
    (C5,0.5),(C5,0.5),(D5,0.5),(C5,0.5),(G5,1.0),
    (G5,0.5),(F5,0.5),(Eb5,1.0),
    (Bb4,0.5),(Bb4,0.5),(C5,0.5),(Bb4,0.5),
    (A4,0.5),(Bb4,0.5),(C5,0.5),(D5,0.5),
    (Eb5,0.5),(F5,0.5),(G5,0.5),(A5,0.5),(Bb5,2.0)
]

# -----------------------------
# Harmony (trombones)
# -----------------------------
harmony = [(note - 5, dur) for (note, dur) in melody]

# -----------------------------
# Bass (Tuba / Sousaphone)
# -----------------------------
bass = [
    (Bb2,1.0),(F3,1.0),(Bb2,1.0),(F3,1.0),
    (Bb2,1.0),(G3,1.0),(C3,1.0),(F3,1.0),
    (Bb2,1.0),(Bb2,1.0),(Eb3,1.0),(F3,1.0),
    (Bb2,1.0),(F3,1.0),(Bb2,1.0),(Bb2,1.0),
    (Bb2,1.0),(F3,1.0),(Bb2,1.0),(F3,1.0),
    (Bb2,1.0),(G3,1.0),(C3,1.0),(F3,1.0),
    (Bb2,1.0),(Bb2,1.0),(Eb3,1.0),(F3,1.0),
    (Bb2,1.0),(F3,1.0),(Bb2,1.0),(Bb2,1.0)
]

# -----------------------------
# Drums (simple march cadence)
# -----------------------------
for bar in range(0, 32):
    beat = bar * 1.0
    mf.addNote(3, CH_DRUMS, 36, beat, 0.25, 100)  # Bass drum on 1
    mf.addNote(3, CH_DRUMS, 38, beat + 0.5, 0.25, 90)  # Snare upbeat
    if bar % 8 == 0:
        mf.addNote(3, CH_DRUMS, 49, beat, 0.5, 110)  # Crash cymbal on 1 every 8 bars

# -----------------------------
# Write all parts
# -----------------------------
t = 0.0
for note, dur in melody:
    add(0, CH_MELODY, note, t, dur, 115)
    t += dur

t = 0.0
for note, dur in harmony:
    add(1, CH_HARMONY, note, t, dur, 95)
    t += dur

t = 0.0
for note, dur in bass:
    add(2, CH_BASS, note, t, dur, 105)
    t += dur

# -----------------------------
# Export
# -----------------------------
with open("hail_to_the_victors_band.mid", "wb") as f:
    mf.writeFile(f)

print("✅ Wrote hail_to_the_victors_band.mid — full marching band version!")
