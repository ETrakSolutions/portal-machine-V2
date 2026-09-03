# -*- coding: utf-8 -*-
# Lot 4 (dernier) : ids 181 a 244.
# A SIGNALER : les ids de A_REVOIR ne sont pas des notes redigees, ce sont des
# jottings internes ramasses dans la BD (« elle ne se cree pas », « coupure 1 gars
# OK »). Les traduire n'a pas de sens : ils sont traduits au plus pres ET marques
# dans l'Excel pour que Jacquot les reecrive ou les efface.
SRC = '[Source: ProgressionLive work orders]'

A_REVOIR = {240, 241, 243}

TRAD = {
181: "Range limiter — standard installation with the Guide Pro and laser option. " + SRC,
182: "An electrical cut-off is enough — no hydraulic cut-off required despite the model year "
     "(confirmed 2023). Standard installation, height and rotation calibration. " + SRC,
183: "Range limiter — standard installation. Multi-bucket Guide Pro calibration (up to 4 buckets, "
     "some of them reversed). " + SRC,
184: "Range limiter — standard installation. Guide Pro + laser option documented. Sensor "
     "replacement (2×) during servicing. " + SRC,
185: "John Deere cut-off cable plus John Deere power cable. Cut-off on prevention: the safety arm "
     "must be reset after a rotation limit (prevention factor ~51, 366 teeth). The display harness "
     "can cause short circuits at cut-off — check it or replace it. " + SRC,
186: "Range limiter — standard John Deere cut-off and power cables. Height and rotation calibration "
     "and verification. Standard installation with no recurring quirks. " + SRC,
187: "Danfoss system used (not PRAN). Standard installation with calibration and verification of "
     "the height and rotation limiting. " + SRC,
188: "John Deere cut-off cable plus John Deere power cable. Case noted: the safety arm had to be "
     "raised by hand after a hydraulic cut-off (happened once). Standard height and rotation "
     "installation. " + SRC,
189: "John Deere cut-off: yellow wire with a red stripe, 8-pin connector. Standard John Deere power "
     "cable. Height and rotation calibration. " + SRC,
190: "John Deere power cable plus a Hitachi cut-off cable used on this machine (compatibility "
     "confirmed). Standard height/rotation calibration and verification. " + SRC,
191: "Height-only limiter (no rotation). Load indicator calibration per the internal lifting chart: "
     "400-tooth ring gear, offset-pivot slewing mast, three 6000 psi pressure sensors, valve "
     "pressures at 85 % (3889 psi). " + SRC,
192: "Hydraulic fitting (ORF#12 / ORF#12)",
193: "Hydraulic fitting (C02A-0021)",
194: "METRIC O-RING M27x2.0 male - JIC 12 male - 90 DEG",
195: "NPTF 12 male - NPTF 04 female - STR",
196: "NPTF 12 female - JIC 12 female - STR - SWIVEL",
197: "Case/Link-Belt cut-off cable (interchangeable). Intermittent inclinometer and harness "
     "problems reported (check the inclinometer cable, replace the 7120 if needed). Standard "
     "height and rotation calibration. " + SRC,
198: "Range limiter — standard installation with the Guide Pro and laser option. Two-bucket "
     "calibration required. " + SRC,
199: "Standard Case cut-off cable. One reinstallation documented, replacing the hydraulic cut-off "
     "with a relay and adding swinging-boom sensors; the proximity sensors were mounted from under "
     "the machine. Annual inspection routine. " + SRC,
200: "Range limiter — standard installation. Recalibration is required if the customer relocates "
     "the inclinometer. Verification of the height and rotation limiting. " + SRC,
201: "Height-only limiting — Kobelco hydraulic cut-off. Rotation is not enabled on these "
     "installations. " + SRC,
202: "Komatsu cut-off cable. Load indicator (IDC) option documented. The proximity sensors are hard "
     "to reach (the bracket has to go into a hole, repositioning required). Check the zero after a "
     "restart (a past MC problem, fixed by USB software). " + SRC,
203: "Guide Pro installation with the 2D digging system. Bucket/stick inclinometer wiring problems "
     "documented (parts missing). Verification of the height limiting, the rotation and the 2D "
     "system. " + SRC,
204: "The display cable is too short — allow at least 10 feet. Recurring calibration problems (the "
     "inclinometer had to be replaced up to 3×). The sensors need replacing regularly. Position "
     "the display away from the corner of the excavator. " + SRC,
205: "Standard Komatsu cut-off cable. 360-tooth ring gear confirmed. The quick coupler was not "
     "working at calibration time on several units — calibrate with a toothed bucket and "
     "recalibrate once the quick coupler is added. " + SRC,
206: "Hydraulic fitting (AS-12-GP / AS-12-GP)",
207: "Hydraulic fitting (ASX-20-GP (M14x90))",
208: "Hydraulic fitting (ASX-16-GP (M12x75))",
209: "HIT-JD proximity sensor bracket",
210: "Hydraulic fitting (AS-16-GP / AS-16-GP)",
211: "Hydraulic fitting (ORF # 16)",
212: "Hydraulic fitting (ORF#16)",
213: "Hydraulic fitting (GPFS2406-1010-4)",
214: "Hydraulic fitting (ORF # 16 ORF # 12)",
215: "Hydraulic fitting (ASX-16)",
216: "Hydraulic fitting (ORF#12 long / ORF#12 long)",
217: "The proximity sensors cannot be installed on this machine (sensors not feasible). Hydro "
     "requires a complete limiter — confirm feasibility with the customer before travelling "
     "out. " + SRC,
218: "Hydraulic fitting (ORF#16 / ORF#16)",
219: "Hydraulic fitting (ORF#10 / ORF#10)",
220: "Hydraulic fitting (AS-16-GP ; AS-16-GP / AS-16-GP)",
221: "Hydraulic fitting (ORF#12 / ORF#12)",
222: "Hydraulic fitting (ORF # 12)",
223: "Hydraulic fitting (C02A-0022)",
224: "Hydraulic fitting (ORF#12 (Parker))",
225: "Hydraulic fitting (ORF#12)",
226: "Hydraulic fitting (ORF #12)",
227: "Hydraulic fitting (AS-12 / AS-12 (M10x1.5x70mm))",
228: "Hydraulic fitting (ASX-16 / ASX-16 (M12x1.75x90))",
229: "Hydraulic fitting (JIC #16)",
230: "Hydraulic fitting (ORF#16 short / ORF#16 short)",
231: "Hydraulic fitting (JIC # 12)",
232: "Hydraulic fitting (ASX-16 / ASX-16 (M12x90))",
233: "Hydraulic fitting (ASX-20 (M14x90mm))",
234: "Hydraulic fitting (ASX-16 (M12x45))",
235: "Hydraulic fitting (“T” JIC-12 / “T” JIC-12)",
236: "Hydraulic fitting (JIC-12 / JIC-12)",
237: "Hydraulic fitting (AS-16 / AS-16 (M10x1.5x55))",
238: "Hydraulic fitting (ORF#16 / ORF#16)",
239: "Hydraulic fitting (TN121-15L / TN121-15L)",
240: "Drain OK, one person",
241: "Cut-off, 1 guy, OK",
242: "2026 model: no drain needed. Use connector X140 on the body valve to cut the hydraulic supply "
     "to the functions. It is a 2S Deutsch that plugs into a coil. Access through the locked left "
     "rear panel. Machine with a lifting cab.",
243: "(internal note — meaning unclear out of context, to be rewritten or deleted)",
244: "Fit the hydraulic valve and the plate for the proximity sensors.",
}
