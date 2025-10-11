from midiutil import MIDIFile

midi = MIDIFile(1)
track = 0
time = 0
tempo = 120
channel = 9  # drum channel
midi.addTempo(track, time, tempo)

def add(note, t, dur, vel):
    midi.addNote(track, channel, note, t, dur, vel)

kick, snare, tom1, tom2, hat_c, hat_o, crash = 36, 38, 45, 47, 42, 46, 49

# Bar 1
for i in range(4): add(kick, i, 0.5, 70)
for i in range(8): add(hat_c, i*0.5, 0.25, 40)

# Bar 2
for i in range(4): add(kick, 4+i, 0.5, 80)
for i in range(8): add(hat_c, 4+i*0.5, 0.25, 55)
add(snare, 5.5, 0.25, 50); add(tom1, 7, 0.25, 55)

# Bar 3
for i in range(4): add(kick, 8+i, 0.5, 90)
for i in range(8): add(hat_o, 8+i*0.5, 0.25, 65)
add(snare, 9, 0.25, 70); add(tom1, 10, 0.25, 70); add(tom2, 11, 0.25, 70)

# Bar 4
for i in range(4): add(kick, 12+i, 0.5, 110)
for i in range(8): add(hat_o, 12+i*0.5, 0.25, 85)
add(snare, 14, 0.5, 100); add(crash, 15.75, 1, 120)

with open("Nightmare_Walkout_Cinematic_Buildup_v1.mid", "wb") as f:
    midi.writeFile(f)

print("✅ MIDI file created: Nightmare_Walkout_Cinematic_Buildup_v1.mid")
