# ---- michigan_fight_song.py ----
# Creates michigan_fight_song.mid — a faithful, band-style MIDI arrangement
# of "Hail to the Victors" (University of Michigan Fight Song)
# Melody, harmony, and drums included.

from midiutil import MIDIFile

BPM = 144  # traditional marching tempo
mf = MIDIFile(4)
for t in range(4):
    mf.addTempo(t, 0, BPM)

# Channels
CH_MELODY = 0   # Trumpets
CH_HARMONY = 1  # Trombones/Horns
CH_BASS = 2     # Bass line / tuba
CH_DRUMS = 9    # Percussion (GM Drum Kit)

# Instrument Programs (General MIDI)
mf.addProgramChange(0, CH_MELODY, 0, 56)  # Trumpet
mf.addProgramChange(1, CH_HARMONY, 0, 57) # Trombone
mf.addProgramChange(2, CH_BASS, 0, 58)    # Tuba

# Helper function
def add(track, ch, note, start, dur, vel):
    mf.addNote(track, ch, note, start, dur, vel)

# Key reference: Bb major
# Bb3 = 58, Bb4 = 70, F4 = 65, etc.

Bb3, C4, D4, Eb4, F4, G4, A4, Bb4, C5, D5, Eb5, F5, G5, A5, Bb5 = 58, 60, 62, 63, 65, 67, 69, 70, 72, 74, 75, 77, 79, 81, 82

# === Melody ===
mel = [
    # "Hail! to the victors valiant"
    (Bb4, 0.5), (Bb4, 0.5), (C5, 0.5), (Bb4, 0.5), (F5, 1.0), (F5, 0.5), (Eb5, 0.5), (D5, 1.0),
    # "Hail! to the conqu’ring heroes"
    (C5, 0.5), (C5, 0.5), (D5, 0.5), (C5, 0.5), (G5, 1.0), (G5, 0.5), (F5, 0.5), (Eb5, 1.0),
    # "Hail! Hail! to Michigan"
    (Bb4, 0.5), (Bb4, 0.5), (C5, 0.5), (Bb4, 0.5), (A4, 0.5), (Bb4, 0.5), (C5, 0.5), (D5, 0.5),
    # "the champions of the West!"
    (Eb5, 0.5), (F5, 0.5), (G5, 0.5), (A5, 0.5), (Bb5, 1.0), (Bb5, 1.0)
]

time = 0.0
for note, dur in mel:
    add(0, CH_MELODY, note, time, dur, 100)
    time += dur

# === Harmony ===
# Plays a lower brass harmony roughly a third/fifth below melody
time = 0.0
for note, dur in mel:
    lower = note - 5  # interval adjustment
    add(1, CH_HARMONY, lower, time, dur, 90)
    time += dur

# === Bass Line (Tuba) ===
bass_pattern = [
    (Bb3, 1.0), (F3, 1.0), (Bb3, 1.0), (F3, 1.0),
    (Bb3, 1.0), (G3, 1.0), (C4, 1.0), (F3, 1.0),
    (Bb3, 1.0), (Bb3, 1.0), (Eb3, 1.0), (F3, 1.0),
    (Bb3, 1.0), (F3, 1.0), (Bb3, 1.0), (Bb3, 1.0)
]
time = 0.0
for note, dur in bass_pattern:
    add(2, CH_BASS, note, time, dur, 100)
    time += dur

# === Percussion (Channel 10) ===
# Basic marching beat: snare + bass + crash
for bar in range(0, 16):
    beat = bar * 2.0
    mf.addNote(3, CH_DRUMS, 36, beat, 0.25, 100)  # Bass drum on 1
    mf.addNote(3, CH_DRUMS, 38, beat + 1.0, 0.25, 90)  # Snare on 2
    if bar % 4 == 0:
        mf.addNote(3, CH_DRUMS, 49, beat, 0.5, 100)  # Crash every 4 bars

# Save
with open("michigan_fight_song.mid", "wb") as f:
    mf.writeFile(f)

print("✅ Wrote michigan_fight_song.mid")
