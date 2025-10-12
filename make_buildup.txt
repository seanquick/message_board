from midiutil import MIDIFile

m = MIDIFile(1); tr=0; m.addTempo(tr, 0, 120); ch=9  # drum channel (10 in GM)
K,S,T1,T2,HC,HO,CR = 36,38,45,47,42,46,49

def add(n, t, d, v): m.addNote(tr, ch, n, t, d, v)

# Bar 1 (0–4s at 120 BPM): soft kick + closed hats
for i in range(4): add(K, i*1.0, 0.5, 70)
for i in range(8): add(HC, i*0.5, 0.25, 40)

# Bar 2 (4–8s): stronger kick, a couple accents
for i in range(4): add(K, 4+i*1.0, 0.5, 80)
for i in range(8): add(HC, 4+i*0.5, 0.25, 55)
add(S, 5.5, 0.25, 50); add(T1, 7.0, 0.25, 55)

# Bar 3 (8–12s): open hats, rising hits
for i in range(4): add(K, 8+i*1.0, 0.5, 90)
for i in range(8): add(HO, 8+i*0.5, 0.25, 65)
add(S, 9.0, 0.25, 70); add(T1,10.0,0.25,70); add(T2,11.0,0.25,70)

# Bar 4 (12–16s): full energy + crash, clean stop into bar 5
for i in range(4): add(K,12+i*1.0,0.5,110)
for i in range(8): add(HO,12+i*0.5,0.25,85)
add(S,14.0,0.5,100); add(CR,15.75,1.0,120)

with open("Nightmare_Walkout_Cinematic_Buildup_v1.mid","wb") as f: m.writeFile(f)
print("Created Nightmare_Walkout_Cinematic_Buildup_v1.mid")
