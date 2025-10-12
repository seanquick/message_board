# ---- victors_dark_remix.py ----
# Creates victors_dark_remix.mid (8 bars @ 120 BPM) in a dark C-minor vibe.
# Tracks:
#   1 - Melody (Channel 1) -> Route to Dexed bell/piano
#   2 - Bass (Channel 2)   -> Route to SI-Bass (finger/pick, dark tone)
#   3 - Drums (Channel 10) -> Route to SI-Drum Kit (GM mapping)

from mido import Message, MidiFile, MidiTrack, MetaMessage, bpm2tempo

PPQ = 480          # ticks per quarter note
BPM = 120
TEMPO = bpm2tempo(BPM)

# ---- helpers ---------------------------------------------------------------

def add_note(track, ch, note, vel, ticks, dur_ticks):
    """note-on then note-off after dur_ticks"""
    track.append(Message('note_on', channel=ch, note=note, velocity=vel, time=ticks))
    track.append(Message('note_off', channel=ch, note=note, velocity=0, time=dur_ticks))

def q(n):             # n quarter-notes -> ticks
    return int(PPQ * n)

def bar(n):           # n bars (4/4) -> ticks
    return int(PPQ * 4 * n)

# ---- file & tempo ----------------------------------------------------------

mid = MidiFile(type=1, ticks_per_beat=PPQ)
conductor = MidiTrack(); mid.tracks.append(conductor)
conductor.append(MetaMessage('set_tempo', tempo=TEMPO, time=0))
conductor.append(MetaMessage('time_signature', numerator=4, denominator=4, time=0))
conductor.append(MetaMessage('key_signature', key='Cm', time=0))  # C minor

# ---- Tracks ----------------------------------------------------------------

mel = MidiTrack(); mid.tracks.append(mel)   # ch 0 (Channel 1)
bass = MidiTrack(); mid.tracks.append(bass) # ch 1 (Channel 2)
drm = MidiTrack();  mid.tracks.append(drm)  # ch 9 (Channel 10)

# Optional program changes (you can ignore in DAW, but nice as defaults)
mel.append(Message('program_change', channel=0, program=0, time=0))   # Acoustic Grand (placeholder)
bass.append(Message('program_change', channel=1, program=33, time=0))  # Fingered Bass
drm.append(Message('program_change', channel=9, program=0, time=0))    # GM Drums ignore program

# ---------------------------------------------------------------------------
#  MELODY: recognizable “Hail to the Victors” chorus, adapted to C minor
#  Eight bars total. Each tuple: (start_in_quarters, midi_note, duration_quarters)
#  Use G4/Ab4/Bb4/C5/Eb5 degrees for the minor twist, but the rhythm scans like the chorus.
#
#  Bar layout here starts at bar 1 of THIS MIDI file. Import at bar 13 in your project.
# ---------------------------------------------------------------------------

# MIDI note helpers
C4, D4, Eb4, F4, G4, Ab4, Bb4, C5, D5, Eb5, F5, G5 = 60, 62, 63, 65, 67, 68, 70, 72, 74, 75, 77, 79

melody_events = []

# Bars 1–2: "Hail! to the vic-tors val-iant"
# G4 G4 Ab4 G4 | C5 C5 Bb4 Ab4
melody_events += [
    (0.0,  G4, 0.5), (0.5,  G4, 0.5), (1.0, Ab4, 0.5), (1.5, G4, 0.5),
    (2.0,  C5, 0.5), (2.5,  C5, 0.5), (3.0, Bb4, 0.5), (3.5, Ab4, 0.5),
]

# Bars 3–4: "Hail! to the con-qu’ring he-roes"
# G4 G4 Ab4 G4 | Eb5 Eb5 D5 C5
melody_events += [
    (4.0,  G4, 0.5), (4.5,  G4, 0.5), (5.0, Ab4, 0.5), (5.5, G4, 0.5),
    (6.0,  Eb5,0.5), (6.5,  Eb5,0.5), (7.0, D5, 0.5), (7.5, C5, 0.5),
]

# Bars 5–6: "Hail! Hail! to Mich-i-gan"
# Bb4 Bb4 C5 Bb4 | Ab4 G4 F4 G4
melody_events += [
    (8.0,  Bb4,0.5), (8.5,  Bb4,0.5), (9.0,  C5, 0.5), (9.5,  Bb4,0.5),
    (10.0, Ab4,0.5), (10.5, G4, 0.5), (11.0, F4, 0.5), (11.5, G4, 0.5),
]

# Bars 7–8: "the cham-pions of the West!"
# Ab4 G4 F4 Eb4 | C5  (hold a bit for the cadence)
melody_events += [
    (12.0, Ab4,0.5), (12.5, G4, 0.5), (13.0, F4, 0.5), (13.5, Eb4,0.5),
    (14.0, C5, 1.5),  # hold through bar 8
]

# Write melody
for start_q, note, dur_q in melody_events:
    add_note(mel, 0, note, 96, q(start_q), q(dur_q))

# ---------------------------------------------------------------------------
#  BASS: simple, heavy underpinning (Cmin vibe)
#  Progression (2 bars each): C  | Ab | Bb | G   (root notes in lower register)
# ---------------------------------------------------------------------------
C2, Ab1, Bb1, G1 = 36, 32, 34, 31
bass_prog = [
    (0.0,  C2, 4.0),   # bars 1–2
    (4.0,  Ab1,4.0),   # bars 3–4
    (8.0,  Bb1,4.0),   # bars 5–6
    (12.0, G1, 4.0),   # bars 7–8
]
for start_q, note, dur_q in bass_prog:
    add_note(bass, 1, note, 88, q(start_q), q(dur_q))

# ---------------------------------------------------------------------------
#  DRUMS (GM on Channel 10): supportive, not busy
#    Kick (36) on 1 and 3
#    Low Tom (45) hits to accent the “Hail!” moments
#    Crash (49) at bar 5 downbeat for lift
# ---------------------------------------------------------------------------
KICK, TOM_L, CRASH = 36, 45, 49

def add_drum(note, start_q, dur_q=0.05, vel=100):
    # short gate for drums (MIDI ch 9)
    drm.append(Message('note_on', channel=9, note=note, velocity=vel, time=q(start_q)))
    drm.append(Message('note_off', channel=9, note=note, velocity=0, time=q(dur_q)))

# 8 bars total: add kicks on every bar 1 & 3 beat
for bar_idx in range(8):
    add_drum(KICK, bar_idx*4 + 0.0, 0.05, 110)  # beat 1
    add_drum(KICK, bar_idx*4 + 2.0, 0.05, 105)  # beat 3

# Toms on the “Hail!” accents (downbeats of bars 1,3,5,7)
for bar_on in [0, 4, 8, 12]:
    add_drum(TOM_L, bar_on + 0.0, 0.30, 100)

# Single crash to open bars 5–6 (feels like the “big reveal”)
add_drum(CRASH, 8.0, 0.50, 100)

# Done
mid.save('victors_dark_remix.mid')
print("Wrote victors_dark_remix.mid")
