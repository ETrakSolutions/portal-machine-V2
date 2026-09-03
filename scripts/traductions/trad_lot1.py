# -*- coding: utf-8 -*-
# Lot 1 : ids 1 a 60 (voir textes_fr.json). Vocabulaire ancre sur js/translations.js :
#   limiteur de portee -> Range limiter | coupure -> cut-off | guide de creusage -> Digging guide
#   inclinometre -> inclinometer | capteur de proximite / prox -> proximity sensor
#   godet -> bucket | couronne -> ring gear | equerre -> bracket | reel -> reel
#   bons de travail ProgressionLive -> ProgressionLive work orders
# Les noms de produits (Limit Pro, Guide Pro, PRAN, Limit PRAN), les numeros de piece
# et les noms de personnes restent tels quels.
SRC = '[Source: ProgressionLive work orders]'

TRAD = {
1: "Electrical cut-off (cut-off type: electrical — see e-Trak documentation).",
2: "This quote must be reviewed by engineering before it is finalized.",
3: "Range limiter — standard installation. " + SRC,
4: "Bolts",
5: "Proximity sensor bracket",
6: "Range limiter — standard installation. Height and rotation calibration. " + SRC,
7: "Rotation encoder",
8: "70 mm proximity sensor",
9: "Welded proximity sensor plate",
10: "Hydraulic fitting (GPFS2406-1212-4)",
11: "Hydraulic fitting (ASX-20)",
12: "Hydraulic fitting (ASX-12)",
13: "ROTOBEC ELITE 915 M26",
14: "Standard Case cut-off cable. Standard height and rotation range limiter installation. "
    "Limited data (a single work order). " + SRC,
15: "CAT magnetic cut-off (Z03A-0100). Use a bracket and magnets to steady the proximity sensors "
    "under the cab, facing the teeth. Some installations are limited to height only. " + SRC,
16: "Guide Pro option with laser documented. Calibration is sometimes incomplete when the quick "
    "coupler is not working or the bucket is missing — have the attachments on hand before the "
    "appointment. Water reported in the swing motor compartment. " + SRC,
17: "Cut-off through a solenoid (like a dummer). Range limiter installation — limited data, "
    "a single work order. " + SRC,
18: "Cut-off through a dummer coil (solenoid). Standard range limiter installation. " + SRC,
19: "Complex hydraulic work documented: added grease points, block replacement (105→75), several "
    "high-pressure fittings (20 ft hose, JIC elbows). Specialized, non-standard job. " + SRC,
20: "360-tooth ring gear (to be programmed). Standard CAT cut-off cable. Standard range limiter "
    "installation, height and rotation calibration. " + SRC,
21: "Hydraulic cut-off required — to be completed on a second visit. Initial installation without "
    "hydraulic cut-off. " + SRC,
22: "Installed with single-connector inclinometers. Replacement of the Limit PRAN by a Limit Pro + "
    "Guide Pro documented. Standard installation. " + SRC,
23: "Hydraulic cut-off required; the part was missing on the initial visit (remote site in the "
    "bush). Include the hydraulic cut-off in the kit before travelling out. " + SRC,
24: "Hydraulic cut-off — at high speed, regaining control requires deactivating then reactivating "
    "the cut-off arm. A recurring quirk to point out to the operator. " + SRC,
25: "Range limiter — standard installation. Calibration documented with a 1015 kg bucket. " + SRC,
26: "Cut-off through a series relay (no hydraulic cut-off) — wired to the 8-pin connector behind "
    "the seat, on the left side. Standard Hitachi power cable. " + SRC,
27: "Installation with the PRAN Guide Pro. Frequent inclinometer replacement (up to 3×). Laser "
    "bracket to be mounted on the right. Bucket calibration required (bucket 2). " + SRC,
28: "New generation: the cut-off requires a hydraulic valve (an electrical cable alone is not "
    "enough). The display stays on after the key is turned off — shut it down by removing the key. "
    "Calibration to be completed if the bucket or quick coupler is missing. " + SRC,
29: "Hydraulic cut-off required. Hitachi cut-off cable plus Hitachi power connector. Check the main "
    "harness during installation. Height and rotation calibration. " + SRC,
30: "Range limiter — standard installation (very limited data in the work orders). " + SRC,
31: "PRAN display compatibility problems reported during road testing on this model (display not "
    "working). Contact Keven before installing. " + SRC,
32: "Hitachi cut-off cable plus Hitachi power cable required. Hydraulic cut-off frequently "
    "requested (installed by a second technician). Confirm the quick attach is available before "
    "calibrating — otherwise calibrate with the original coupler and advise the customer. " + SRC,
33: "Hitachi cut-off cable. A bracket with neodymium magnets is required for the proximity sensors "
    "(mini excavator, small teeth). Relay cut-off. Standard height and rotation installation. " + SRC,
34: "Range limiter — documented servicing: display harness repair, display bracket replacement, "
    "cut-off relay connection repair. Standard height and rotation installation. " + SRC,
35: "Standard John Deere cut-off and power cables. The hydraulic check valve can fault out — plan "
    "on disabling it if needed. Check the prevention factor (swing). " + SRC,
36: "Hydraulic cut-off required, with coil/reel. 6-pin Deutsch connector: pin 5 = power, pin 4 "
    "(black) = ground. A 90° connector is recommended to reach the reel. Wiring is often done in "
    "two stages (the reel is mounted separately). " + SRC,
37: "Hydraulic cut-off only (no electrical cut-off available). Boom inclinometer replacement plus a "
    "10 m cable (single connector). “Tongue” type proximity sensors used as a substitute "
    "(the teeth are not compatible with standard sensors). Verify that the hydraulic cut-off works "
    "at commissioning. " + SRC,
38: "Hydraulic cut-off required; may be left pending completion by a second technician. " + SRC,
39: "Hydraulic cut-off required; may call for a separate visit (completed the next day). "
    "Installation with a John Deere cut-off cable. " + SRC,
40: "The proximity sensor bracket has to be custom-made and welded (special bracket). The sensor "
    "sequence is hard to calibrate — many attempts. Bucket inclinometer and a 3 m two-connector "
    "cable required. Check the prevention factor (hydraulic cut-off during a fast swing). " + SRC,
41: "Hydraulic cut-off required; may be left pending completion at the initial installation. " + SRC,
42: "Recurring calibration problems: the system does not hold its zero (controller or display may "
    "be defective — test both). Metal particles reported in the slew ring grease; advise the "
    "customer. " + SRC,
43: "PRAN range limiter. Guide Pro option with laser documented (two-bucket calibration). Standard "
    "height and rotation installation. " + SRC,
44: "Replacement of a defective proximity sensor reported; check the sensor sequence and the "
    "height/rotation limiting after any reinstallation. " + SRC,
45: "Standard Komatsu cut-off cable (hydraulic or electrical depending on the version). Frequent "
    "proximity sensor replacement (2×). 5M1C sensor replaced on some units. Check which side the "
    "inclinometer is on when a hammer is in use (risk of wrong orientation). Calibration with a "
    "bucket available on site. " + SRC,
46: "The proximity sensors must be adjusted vertically to get the correct sequence. Replacement of "
    "both sensors documented. Check height and rotation limiting after any adjustment. " + SRC,
47: "Komatsu cut-off cable. Hydraulic cut-off present on some units. A few height-only "
    "installations. Always verify the zero. " + SRC,
48: "Often configured for height only. Proximity sensors mounted on the inside floor — hard to "
    "reach, tight space. Check the limiting and the cut-off at delivery. " + SRC,
49: "Standard height and rotation installation. 400-tooth ring gear (enter 401 to keep the Maximum "
    "Teeth parameter stable). Narrower teeth: use a sensor bracket with adjustable lateral "
    "positioning. Known issue: the system does not keep its last position on restart — report it "
    "to PRAN. " + SRC,
50: "Requires a proximity sensor bracket machined specifically for this machine. Height and "
    "rotation calibration. An engineer's certification letter is frequently requested. " + SRC,
51: "Only mention: installation of a back-up camera. No range limiter installation data in the "
    "available work orders. " + SRC,
52: "Hydraulic cut-off present; the hydraulic cut-off relay is prone to failure (replacement "
    "documented during an annual inspection). " + SRC,
53: "Case cut-off cable used on the Link-Belt 145 X3. Standard height and rotation range limiter "
    "installation. Guide Pro + laser option calibrated on some units. " + SRC,
54: "Range limiter — standard installation. Recurring servicing: inclinometer and fuse replacement, "
    "proximity sensor readjustment, zero reset. " + SRC,
55: "Height-only limiting documented — rotation was not completed at the initial installation. "
    "Plan a second visit for rotation if it is required. " + SRC,
56: "Range limiter — standard Takeuchi cut-off cable. Height and rotation calibration and "
    "verification. Standard installation with no recurring quirks. " + SRC,
57: "Danfoss cut-off (differs from the standard). Rotation is sometimes disabled on the display "
    "depending on the work order (height only). Enable or disable rotation according to the "
    "configuration requested. " + SRC,
58: "Standard Takeuchi cut-off cable. Height-only cases (rotation disabled) documented. "
    "Reinstallations from a TB245-2 or TB-240 are compatible. " + SRC,
59: "Small machine: mount the proximity sensors with a bracket and two magnets so the teeth stay "
    "in view. Standard height and rotation installation. " + SRC,
60: "Height-only limiting is common on this model; rotation is disabled in several installations. "
    "Guide Pro can be calibrated with a laser and multiple buckets. Confirm whether rotation is "
    "required before installing. " + SRC,
}
