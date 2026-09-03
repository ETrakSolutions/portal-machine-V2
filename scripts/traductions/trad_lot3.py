# -*- coding: utf-8 -*-
# Lot 3 : ids 116 a 180. Meme vocabulaire que les lots 1 et 2.
SRC = '[Source: ProgressionLive work orders]'

TRAD = {
116: "Specific CAT cut-off cable (ref. 335-07H). The proximity sensors have to be spaced out with a "
     "short bracket plus 2 nuts to reach the centre of the teeth. Frequent replacement of both "
     "sensors. Check for moisture under the cover. " + SRC,
117: "Hitachi 08D cut-off cable used on this CAT model. Height and rotation calibration. " + SRC,
118: "Guide Pro option with laser is common. Calibration is sometimes postponed (bucket or quick "
     "coupler missing). Replacement of inclinometer 73 documented. Have the full set of "
     "attachments on hand before the visit. " + SRC,
119: "Keep an eye on the swing cover — the orientation can end up reversed after a transfer (the "
     "sensors must stay aligned with the pinion). Transfers between identical machines are "
     "documented. " + SRC,
120: "Hydraulic cut-off required (John Deere cut-off harness). After a cut-off during rotation, "
     "raise the hydraulic arm to regain the controls (not always necessary). Height and rotation "
     "calibration. " + SRC,
121: "Check valve disabled in software (flipping the switch has no effect). A poorly crimped power "
     "wire (brown power) reported. Three-axis calibration (height, rotation, check valve). " + SRC,
122: "Standard Liebherr cut-off. Replacement of a defective PRAN inclinometer noted several times. "
     "Height and rotation calibration. " + SRC,
123: "Range limiter — standard installation. By-pass run under the armrest. Replacement of "
     "proximity sensors (2×) and of module 72, which was freezing the CAN bus, noted during a "
     "service call. " + SRC,
124: "Hydraulic fitting (JIC-16 / JIC-16 (ORB 4 port), also known as 16-4-LOHL665TP)",
125: "Two system generations documented: Danfoss and PRAN. Confirm which system is installed "
     "before the visit. A defective inclinometer reported on at least one unit. " + SRC,
126: "The GC box is required for the hydraulic cut-off (CAT 315GC). Caterpillar cut-off cable "
     "required. Include the GC box when the kit is prepared. " + SRC,
127: "Water in the swing housing is recurrent on several units — inspect it and tell the mechanic "
     "before closing up. The range limiter and Guide Pro can both be installed. " + SRC,
128: "CAT cut-off cable (Z03A-0100). After a hydraulic cut-off on a limit, the safety arm has to be "
     "deactivated and reactivated to regain the controls — recurring behaviour reported. " + SRC,
129: "Requires special Komatsu sensors (i-series model). Komatsu cut-off cable. Otherwise a "
     "standard installation. " + SRC,
130: "Installation with a beacon (strobe). Annual inspection documented. " + SRC,
131: "Komatsu cut-off cable required. Reprogram the check valve on some installations. Fuse between "
     "the seat and the right-hand wall. Height and rotation calibration. " + SRC,
132: "Standard Komatsu cut-off cable. Load indicator (IDC) fitted — check the stick and boom "
     "pressures. Zero and limits (height + rotation) to be validated. Flash on the limiter "
     "enabled, documented. " + SRC,
133: "Range limiter — standard installation. The display position is constrained by an existing "
     "second display (the customer's approval is required). " + SRC,
134: "Guide Pro and limiting relay installation. Standard mini excavator installation. " + SRC,
135: "Standard installation with new proximity sensors on a bracket with magnets. Model documented "
     "for limiter use on a two-boom excavator (concrete pump). Verification of the calibration and "
     "of the height/rotation limiting. " + SRC,
136: "Installation with hydraulic cut-off. Very little data (2 entries); the installation was done "
     "as a team. " + SRC,
137: "Range limiter — standard installation. No model-specific technical comment in the available "
     "work orders. " + SRC,
138: "Link Belt hydraulic cut-off cable. Standard height and rotation installation. One work order "
     "mentions Guide Pro only (no range limiter). " + SRC,
139: "Standard Link Belt cut-off cable. On one reinstallation the sensors sat too close to the "
     "teeth (they made contact) — reposition them and loom the sensor and inclinometer cables. "
     "Intermittent Tyco relay reported (replace it). " + SRC,
140: "Standard Link Belt cut-off cable. Electrical and hydraulic cut-off are both possible (relay). "
     "Frequent sensor replacement. Display harness problem documented (a sensor staying "
     "lit). " + SRC,
141: "Range limiter — standard installation. Height/rotation calibration and verification. " + SRC,
142: "Main harness replacement reported. Standard installation with a Link-Belt cut-off "
     "cable. " + SRC,
143: "Takeuchi hydraulic cut-off. The proximity sensor bracket has to be machined specifically for "
     "the TB210R. Height and rotation calibration. " + SRC,
144: "Range limiter — standard installation with a Takeuchi cut-off cable. Height and rotation "
     "calibration and verification. " + SRC,
145: "The cut-off cable is located under the fuse block's circuit board, identified by a yellow "
     "tie-wrap. The main harness is prone to CAN communication trouble — check it on any "
     "reinstallation. " + SRC,
146: "Backhoe range limiter already installed by e-Trak. Cut-off through a 12 V relay, with "
     "rotation cut-off and sensors. " + SRC,
147: "e-Trak has NOT installed a limiter on this model. Only known job: a back-up camera (2023) — "
     "a problem was reported when reversing (automatic mode). " + SRC,
148: "Backhoe range limiter already installed (2022, 2024). Cut-off through a 12 V relay; the "
     "cut-off is emulated by a “dummer” solenoid/coil. " + SRC,
149: "Range limiter already installed. Cut-off through a 12 V relay; on recent models the cut-off "
     "is emulated by a “dummer” coil. " + SRC,
150: "Hydraulic fitting (AS-12-GP)",
151: "Range limiter — standard installation. Machine calibration and verification of the height "
     "and rotation limiting. " + SRC,
152: "Hydraulic cut-off mandatory. Once it trips, regaining the hydraulic controls requires "
     "lowering then raising the cut-off arm. " + SRC,
153: "A hydraulic cut-off is mentioned on every installation. Case cut-off cable required. Some "
     "units combine an electrical and a hydraulic cut-off. " + SRC,
154: "Standard Caterpillar cut-off cable. A hydraulic cut-off is possible (move the relay to the "
     "hydraulic harness). Inclinometer replacement noted. Check the stick inclinometer (a third "
     "axis was added on some units). " + SRC,
155: "Cut-off through a magnetic relay — mounted differently from the standard (see "
     "Mathieu/Keven). The sensors are very hard to reach; a pre-drilled plate is provided. 12 V "
     "machine: it does not hold its zero when shut down. CAN communication problems reported on "
     "some units. " + SRC,
156: "Moisture reported in the swing bearing (advise the customer). Check valve disabled in "
     "software. Calibration and verification of all three limiting points. " + SRC,
157: "Height-only limiting (rotation not installed). A hydraulic valve is required in the swing; "
     "wires run to the fuse box (#1 power, #2 ground). The power connection and the hydraulic "
     "valve are to be completed in two stages. " + SRC,
158: "John Deere and Hitachi cut-off cables are interchangeable depending on the version. Check the "
     "main harness. A few machines have a pre-existing ISOGARDE system to remove before "
     "installing. Three-bucket calibration is possible. " + SRC,
159: "John Deere cut-off cable plus John Deere power cable required. Axiomatic inclinometer "
     "(8120, Z01B-0008) used as a replacement. Check the sensor cables; the stick inclinometer is "
     "prone to failure. " + SRC,
160: "PRAN range limiter. Recurring servicing: replacement of the inclinometer, the rotation sensor "
     "and the display bracket. Correction of a check valve error documented. Annual inspection "
     "scheduled. " + SRC,
161: "Standard John Deere cut-off installation. Frequent replacement of defective proximity sensors "
     "and inclinometers (up to 3 inclinometers). Height and rotation verification. " + SRC,
162: "Hydraulic cut-off through a switch with a harness modification (3 wires on a 1S2P relay). Two "
     "extra relays are needed to avoid fault codes — non-standard wiring, to be validated with the "
     "crew leader. " + SRC,
163: "Range limiter — standard installation. MC reprogramming with Keven's technical support "
     "documented. Height and rotation calibration. " + SRC,
164: "Liebherr G8 specific cut-off harness. Standard range limiter installation, height and "
     "rotation calibration. " + SRC,
165: "Range limiter — standard installation (a transfer from another machine is documented). Full "
     "calibration, height and rotation verification. " + SRC,
166: "Cut-off in series with the safety lever switch (as on a standard excavator, unlike the older "
     "SANY machines). Normally-closed cut-off to be verified. A 15 A fuse is recommended (brief "
     "surges blow a 5 A). " + SRC,
167: "Hydraulic fitting (AS-16-GP)",
168: "Hydraulic fitting",
169: "Range limiter — standard installation. Verification of the height and rotation "
     "limiting. " + SRC,
170: "Twin cut-off relays: one hydraulic and one electrical. Installations with Guide Pro (laser) "
     "are also documented. Otherwise a standard Case installation. " + SRC,
171: "Standard height and rotation installation. Guide Pro + laser option is common. Sensors "
     "replaced 2× along with cables (a risk of sparks in the shop was reported). Water in the "
     "swing on several units — advise the customer. Move the inclinometer to the side of the boom "
     "if needed. " + SRC,
172: "Twin cut-off: electrical (Case cable) and hydraulic. Hydraulic cut-off V2 confirmed on boom "
     "up (S1, S2) and on the swing. The hydraulic cut-off is sometimes finished on a second "
     "visit. " + SRC,
173: "The sensors are prone to moisture under the cover — inspect them and replace as needed. The "
     "inclinometer and fuse need replacing regularly. Standard CAT cut-off installation, height "
     "and rotation calibration, operator training on all three modes. " + SRC,
174: "Standard CAT cut-off cable. Omron sensor replacement documented. Some units have no rotation "
     "(height only). Operator training is included with the installation. " + SRC,
175: "Installations including Guide Pro with a laser reference and bucket calibration. Standard "
     "Caterpillar range limiter. Note: recalibration is required if the bucket blade is rotated "
     "after installation. " + SRC,
176: "CAT cut-off cable. Several height-only installations (rotation to be planned as a second "
     "phase). GQ-0895 inclinometer replacement. A long changeover kit on some units. " + SRC,
177: "Range limiter — standard installation (only Guide Pro documented). " + SRC,
178: "Hitachi cut-off cable plus Hitachi power cable. Standard height and rotation installation. "
     "History: frequent transfers from and to other models (Doosan). " + SRC,
179: "Hitachi 7H cut-off cable plus Hitachi power cable required. Note: the cut-off cable wiring "
     "can be fitted backwards (check the polarity). Recalibration if the quick attach is "
     "changed. " + SRC,
180: "Gageport code 62 ASX #20",
}
