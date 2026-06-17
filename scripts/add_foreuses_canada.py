# -*- coding: utf-8 -*-
# Ajout des foreuses sur le marche canadien (chassis d'excavatrice OU forage vertical)
# Recherche fabricants/distributeurs canadiens (2026-06-17). Annees 2020-2026.
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = 'data/machines.json'
YEARS = [str(y) for y in range(2020, 2027)]  # 2020..2026

# m=modele t=type d=diametre forage p=profondeur max pu=puissance po=poids
# mt=type de mat ml=longueur mat kl=longueur kelly
DATA = {
 "Traxxon": [
  {"m":"TR-EX 1000","t":"Foreuse de roc sur excavatrice (montee sur balancier)","d":"35-64 mm (1-3/8\"-2,5\")","p":"15 m (50 pi)","pu":"Marteau Sandvik HL300, 8 kW","po":"94 kg (attachement, hors mat)","mt":"Glissiere (feed) sur excavatrice","ml":"N/D","kl":"N/A"},
  {"m":"TR-EX 1500","t":"Foreuse compacte de genie civil sur excavatrice (ancrages, clouage, micropieux)","d":"N/D","p":"N/D","pu":"Excavatrice porteuse ~30 t (ex. CAT 330)","po":"N/D","mt":"Glissiere (feed) articulee","ml":"N/D","kl":"N/A"},
  {"m":"TR-EX 2000","t":"Foreuse de roc haute performance sur excavatrice","d":"N/D","p":"N/D","pu":"Excavatrice porteuse (classe excavatrice)","po":"N/D","mt":"Glissiere (feed) sur excavatrice","ml":"N/D","kl":"N/A"},
 ],
 "TEI Rock Drills": [
  {"m":"HEM 360","t":"Attachement de forage hydraulique sur excavatrice (drifter TE360)","d":"35-76 mm (1 3/8\"-3\")","p":"Course 3,6 m (tige d'ajout au-dela)","pu":"Excavatrice min. 13 t (132 lpm, 155 bar)","po":"1 492 kg","mt":"Glissiere (feed a drifter)","ml":"Total 4,9 m; course 3,6 m","kl":"N/A"},
  {"m":"HEM 350R","t":"Attachement de forage rotatif sur excavatrice (tete RDS350)","d":"70-203 mm (2 3/4\"-8\")","p":"Course 3,6 m (tige d'ajout au-dela)","pu":"Excavatrice min. 13 t (95 lpm, 175 bar)","po":"1 440 kg","mt":"Glissiere (feed a tete rotative)","ml":"Total 4,9 m; course 3,6 m","kl":"N/A"},
  {"m":"HEM 760","t":"Attachement de forage hydraulique sur excavatrice (drifter TE760)","d":"42-172 mm (1 5/8\"-5\")","p":"Course 3,6 m (tige d'ajout au-dela)","pu":"Excavatrice min. 20 t (170 lpm, 172 bar)","po":"1 700 kg","mt":"Glissiere (feed a drifter)","ml":"Total 4,9 m; course 3,6 m","kl":"N/A"},
  {"m":"HEM 550R","t":"Attachement de forage rotatif sur excavatrice (tete RDS550)","d":"102-305 mm (4\"-12\")","p":"Course 3,6 m (tige d'ajout au-dela)","pu":"Excavatrice min. 20 t (152 lpm, 207 bar)","po":"2 177 kg","mt":"Glissiere (feed a tete rotative)","ml":"Total 4,9 m; course 3,6 m","kl":"N/A"},
  {"m":"HEM 1004","t":"Attachement rotatif lourd sur excavatrice, tres gros diametre (tete RDS1004)","d":"127-558 mm (5\"-22\")","p":"Course 3,9 m (tige d'ajout au-dela)","pu":"Excavatrice min. 25 t (170 lpm, 207 bar)","po":"2 600 kg","mt":"Glissiere (feed a tete rotative)","ml":"Total 5,2 m; course 3,9 m","kl":"N/A"},
  {"m":"HEMH","t":"Attachement de forage hydraulique sur excavatrice (le plus gros de la gamme HEM)","d":"N/D","p":"N/D","pu":"Excavatrice 25-30 t","po":"N/D","mt":"Glissiere (feed)","ml":"N/D","kl":"N/A"},
  {"m":"MEM","t":"Attachement de forage pour excavatrice de poids moyen","d":"N/D","p":"Course 3,35 m","pu":"Excavatrice 12-15 t","po":"1 089 kg","mt":"Glissiere (avance SCF allegee)","ml":"Course 3,35 m","kl":"N/A"},
  {"m":"MME","t":"Attachement de forage pour mini-excavatrice","d":"N/D","p":"N/D","pu":"Mini-excavatrice 5-10 t","po":"N/D","mt":"Glissiere (feed)","ml":"N/D","kl":"N/A"},
  {"m":"TD75","t":"Foreuse sur chenilles a acces restreint (micropieux gaines, forage vertical)","d":"jusqu'a ~254 mm (10\")","p":"Tige d'ajout (course ~1,8 m/passe)","pu":"Moteur electrique 75 HP (56 kW) 480V; tete RDS550","po":"2 585 kg","mt":"Glissiere (mat PCFH5, rotation 180 deg)","ml":"Mat ~2 794 mm","kl":"N/A"},
  {"m":"TD100","t":"Foreuse sur chenilles a acces restreint (micropieux/barres creuses, forage vertical)","d":"jusqu'a ~254 mm (10\")","p":"jusqu'a ~30 m (barres 103 mm)","pu":"Moteur electrique 100 HP (75 kW) 480V; tete RDS1004","po":"5 207 kg","mt":"Glissiere (mat PCFH7, rotation 120 deg)","ml":"Mat ~3 734 mm","kl":"N/A"},
 ],
 "Watson": [
  {"m":"EX20","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill)","d":"457-1219 mm (18\"-48\")","p":"20 m (66 pi)","pu":"Excavatrice min. 10 t; couple 33 kNm","po":"17,8 t","mt":"Kelly (carre a friction ou rond verrouillant)","ml":"N/D","kl":"N/D"},
  {"m":"EX40","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill, double entrainement)","d":"457-1829 mm (18\"-72\")","p":"24,1 m (79 pi)","pu":"Excavatrice 15-25 t; couple 68 kNm","po":"38,1 t","mt":"Kelly (carre a friction ou rond verrouillant)","ml":"N/D","kl":"N/D"},
  {"m":"EX60","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill, double entrainement)","d":"457-2438 mm (18\"-96\")","p":"29,6 m (114 pi)","pu":"Excavatrice 30-40 t; couple 104 kNm","po":"41,3 t","mt":"Kelly (carre a friction ou rond verrouillant)","ml":"N/D","kl":"N/D"},
  {"m":"EX90","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill)","d":"N/D","p":"28,7 m (94 pi)","pu":"Excavatrice 30-45 t; couple 144 kNm","po":"49,9 t","mt":"Kelly (carre a friction ou rond verrouillant)","ml":"N/D","kl":"N/D"},
  {"m":"EX130","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill nouvelle generation)","d":"jusqu'a 3658 mm (144\")","p":"28,7 m (94 pi)","pu":"Excavatrice 35-45 t; couple 210 kNm","po":"51,3 t","mt":"Kelly (jusqu'a 6 elements)","ml":"N/D","kl":"N/D"},
  {"m":"EX180","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill)","d":"N/D","p":"28 m (95 pi)","pu":"Excavatrice; couple 287 kNm","po":"51,3 t","mt":"Kelly Heavy Duty (jusqu'a 6 elements)","ml":"N/D","kl":"N/D"},
  {"m":"EX250","t":"Foreuse a pieux forés sur excavatrice (ExcaDrill, plus gros modele EX)","d":"N/D","p":"28 m (95 pi)","pu":"Excavatrice; couple 328 kNm","po":"59 t","mt":"Kelly Heavy Duty","ml":"N/D","kl":"N/D"},
  {"m":"1100","t":"Foreuse a pieux forés a forage vertical (camion 6x4 ou chenilles)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat telescopique","ml":"N/D","kl":"N/D"},
  {"m":"2500","t":"Foreuse a pieux forés a forage vertical (camion ou chenilles)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat","ml":"N/D","kl":"N/D"},
  {"m":"3110","t":"Foreuse a pieux forés grand diametre a forage vertical (camion ou chenilles)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat (mat court dispo)","ml":"N/D","kl":"N/D"},
  {"m":"4500 CM","t":"Foreuse a pieux forés a forage vertical sur chenilles","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat","ml":"N/D","kl":"N/D"},
  {"m":"7300 CM","t":"Foreuse a pieux forés grand couple a forage vertical sur chenilles","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat","ml":"N/D","kl":"N/D"},
  {"m":"1030 TM","t":"Foreuse a pieux forés a forage vertical sur camion","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat","ml":"N/D","kl":"N/D"},
  {"m":"2200 TM","t":"Foreuse a pieux forés a forage vertical sur camion","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly / mat","ml":"N/D","kl":"N/D"},
 ],
 "Movax": [
  {"m":"TAD-32","t":"Foreuse a pieux sur excavatrice, telescopique (beton coule en place)","d":"400-1000 mm","p":"9 m","pu":"Excavatrice 24-35 t; couple 30 kNm","po":"3 200 kg","mt":"Glissiere telescopique (auger drive)","ml":"3 855 mm","kl":"N/A"},
  {"m":"KB-70S","t":"Foreuse a pieux sur excavatrice, barre Kelly (beton coule en place)","d":"420-1500 mm","p":"9-15 m","pu":"Excavatrice 30-50 t; couple 70 kNm","po":"5 300-5 800 kg","mt":"Kelly (barre telescopique)","ml":"4 500 mm","kl":"N/D"},
  {"m":"KB-70L","t":"Foreuse a pieux sur excavatrice, barre Kelly, longue portee","d":"420-1500 mm","p":"20 m","pu":"Excavatrice 35-50 t; couple 70 kNm","po":"6 700 kg","mt":"Kelly (barre telescopique)","ml":"5 550 mm","kl":"N/D"},
 ],
 "Comacchio": [
  {"m":"MC-E 6","t":"Attachement de forage sur excavatrice (consolidation de sol, ancrages)","d":"N/D","p":"N/D","pu":"Excavatrice 5 t","po":"1 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 15","t":"Attachement de forage sur excavatrice","d":"Serrage 45-170 mm","p":"N/D","pu":"Excavatrice 12-18 t","po":"1-2 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 20","t":"Attachement de forage sur excavatrice","d":"N/D","p":"N/D","pu":"Excavatrice 15-18 t","po":"2 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 25","t":"Attachement de forage sur excavatrice","d":"N/D","p":"N/D","pu":"Excavatrice 20 t","po":"3 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 30","t":"Attachement de forage sur excavatrice","d":"N/D","p":"N/D","pu":"Excavatrice 20-25 t","po":"2-3 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 45","t":"Attachement de forage sur excavatrice","d":"N/D","p":"N/D","pu":"Excavatrice 30-35 t","po":"4-5 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"MC-E 80","t":"Attachement de forage sur excavatrice (le plus gros de la gamme MC-E)","d":"N/D","p":"N/D","pu":"Excavatrice 35-50 t","po":"8-9 t","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"GEO 105","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"18,5 kW (25 HP)","po":"2 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 205","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"33 kW (44 HP)","po":"2-3 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 300","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"45-55 kW (60-75 HP)","po":"3-4 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 305","t":"Foreuse geotechnique multifonction sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"55 kW (75 HP)","po":"4-5 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 405","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"75 kW (100 HP)","po":"6-8 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"eGEO 405","t":"Foreuse geotechnique electrique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"Electrique 350 VDC - 78 kWh","po":"9-10 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 600","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"55-74 kW (74-99 HP)","po":"7-8 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 601","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"86-100 kW (115-134 HP)","po":"8-9 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 601 W","t":"Foreuse geotechnique/puits d'eau sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"100 kW (134 HP)","po":"11-12 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 602","t":"Foreuse geotechnique sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"115-119 kW (154-160 HP)","po":"9-11 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 700 W","t":"Foreuse geotechnique/puits d'eau sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"149 kW (200 HP)","po":"18-20 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 900","t":"Foreuse geotechnique/geothermie sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"126-180 kW (169-240 HP)","po":"16-18 t","mt":"Glissiere","ml":"N/D","kl":"N/A"},
  {"m":"GEO 901","t":"Foreuse geotechnique/exploration sur chenilles (forage vertical)","d":"N/D","p":"N/D","pu":"188-209 kW (255-285 HP)","po":"19-20 t","mt":"Glissiere (jusqu'a 30 000 daN)","ml":"N/D","kl":"N/A"},
 ],
 "Montabert": [
  {"m":"Micro CPA","t":"Attachement de forage de roche sur excavatrice (rotopercussion)","d":"26-76 mm (1-3 po)","p":"3,2 m","pu":"Excavatrice 9-12 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"Micro CPA 360","t":"Attachement de forage de roche sur excavatrice, tete rotative 360 deg","d":"26-76 mm","p":"3,2 m","pu":"Excavatrice 10-14 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 222E","t":"Attachement de forage de roche sur excavatrice","d":"38-76 mm","p":"7,4 m","pu":"Excavatrice 20-27 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 28 050","t":"Attachement de forage de roche sur excavatrice","d":"38-76 mm","p":"15 m","pu":"Excavatrice 28-35 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 30 095","t":"Attachement de forage de roche sur excavatrice","d":"64-102 mm","p":"29,8 m","pu":"Excavatrice 28-35 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 30 150","t":"Attachement de forage de roche sur excavatrice","d":"64-115 mm","p":"29,8 m","pu":"Excavatrice 28-35 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 35 160","t":"Attachement de forage de roche sur excavatrice","d":"64-127 mm","p":"30,9 m","pu":"Excavatrice 28-40 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
  {"m":"CPA 295","t":"Attachement de forage de roche sur excavatrice (drifter HC95)","d":"76-102 mm (3-4 po)","p":"~22 m (72 pi)","pu":"Excavatrice >25 t","po":"N/D","mt":"Glissiere (sur bras d'excavatrice)","ml":"N/D","kl":"N/A"},
 ],
 "Soilmec": [
  {"m":"SR-35","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"3000 mm max","p":"63 m","pu":"209 kW","po":"37 t","mt":"Kelly telescopique","ml":"7,5/8,5 m (mat modulaire)","kl":"N/D"},
  {"m":"SR-45","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"3000 mm max","p":"69,7 m","pu":"209 kW","po":"37-40 t","mt":"Kelly telescopique","ml":"8,4/9,45 m (mat modulaire)","kl":"N/D"},
  {"m":"SR-65","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2000 mm (CCS)","p":"77,9 m","pu":"272 kW","po":"56,5 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"SR-75","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2300 mm (CCS)","p":"93 m","pu":"336 kW","po":"71 t","mt":"Kelly telescopique","ml":"N/D","kl":"3x9 m a 4x11,5 m (selon config)"},
  {"m":"SR-95","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2700 mm (CCS)","p":"102 m","pu":"455 kW","po":"92 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"SR-105","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"SR-125","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"3500 mm max","p":"121 m","pu":"470 kW","po":"128 t","mt":"Kelly telescopique","ml":"N/D","kl":"4x13,5 m (verrouillage mecanique)"},
 ],
 "Casagrande": [
  {"m":"B200","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"1800 mm","p":"68 m","pu":"246 kW","po":"65 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B240","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"1800 mm","p":"78 m","pu":"283 kW","po":"72 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B250","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2100 mm","p":"78 m","pu":"336 kW","po":"86 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B275","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2100 mm","p":"78 m","pu":"336 kW","po":"92 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B300","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2300 mm","p":"89,5 m","pu":"400 kW","po":"100 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B360","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2700 mm","p":"99 m","pu":"400 kW","po":"123 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B400","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"2700 mm","p":"99 m","pu":"450 kW","po":"124 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B420","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"3500 mm","p":"101 m","pu":"450 kW","po":"144 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"B470","t":"Foreuse rotative a pieux (chenilles, forage vertical)","d":"3500 mm","p":"111 m","pu":"563 kW","po":"167 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
 ],
 "Liebherr": [
  {"m":"LB 20.1","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"1500 mm","p":"34,5 m","pu":"N/D","po":"52,8 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"LB 25","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"3300 mm","p":"53,2 m","pu":"N/D","po":"69,3-79,9 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"LB 30","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"3400 mm","p":"70,8 m","pu":"N/D","po":"73,6-84,6 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"LB 35.1","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"4100 mm","p":"77,5 m","pu":"N/D","po":"99,0-111,1 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"LB 45.1","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"4500 mm","p":"95,0 m","pu":"N/D","po":"115,5-133,2 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
  {"m":"LB 55","t":"Foreuse rotative sur chenilles (pieux forés, forage vertical)","d":"4800 mm","p":"120,4 m","pu":"N/D","po":"162,5-178,2 t","mt":"Kelly telescopique","ml":"N/D","kl":"N/D"},
 ],
 "IMT": [
  {"m":"AF135","t":"Foreuse rotative sur chenilles (base excavatrice CAT, pieux forés)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly telescopique (verrouillage auto)","ml":"N/D","kl":"N/D"},
  {"m":"AF218","t":"Foreuse rotative sur chenilles (base excavatrice CAT, pieux forés)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly telescopique (verrouillage auto)","ml":"N/D","kl":"N/D"},
  {"m":"AF260","t":"Foreuse rotative sur chenilles (base excavatrice CAT, pieux forés)","d":"N/D","p":"N/D","pu":"N/D","po":"N/D","mt":"Kelly telescopique (verrouillage auto)","ml":"N/D","kl":"N/D"},
  {"m":"AF290","t":"Foreuse rotative sur chenilles (base excavatrice CAT, pieux forés)","d":"2300 mm (pieu)","p":"N/D","pu":"328 kW (446 HP) CAT C13","po":"74,5 t (Kelly standard)","mt":"Kelly telescopique (verrouillage auto)","ml":"N/D","kl":"Standard 4/46 m (options 4/35-5/75)"},
 ],
 "Furukawa": [
  {"m":"HCR900-ESV","t":"Foreuse de surface sur chenilles a marteau hors-trou (forage vertical)","d":"64-89 mm (2,5-3,5 po)","p":"N/D","pu":"Cummins QSB6.7, 168 kW (225 hp)","po":"11 030 kg","mt":"Glissiere (feed)","ml":"Feed 4480 mm","kl":"N/A"},
  {"m":"HCR1100-ER","t":"Foreuse de surface sur chenilles a marteau hors-trou (forage vertical)","d":"64-102 mm (2,5-4 po)","p":"N/D","pu":"Cummins QSB6.7, 168 kW (226 hp)","po":"12 460 kg","mt":"Glissiere (feed)","ml":"Feed 4781 mm","kl":"N/A"},
  {"m":"HCR1100-ED","t":"Foreuse de surface sur chenilles a marteau hors-trou (forage vertical)","d":"64-89 mm (2,5-3,5 po)","p":"N/D","pu":"Cummins QSB6.7, 168 kW (226 hp)","po":"13 150 kg","mt":"Glissiere (feed)","ml":"Feed 4704 mm","kl":"N/A"},
  {"m":"HCR L110-E5","t":"Foreuse de surface sur chenilles a marteau hors-trou (forage vertical)","d":"102-140 mm","p":"N/D","pu":"CAT C9.3B, 280 kW (375 hp)","po":"19 750 kg","mt":"Glissiere (feed)","ml":"Feed 5225 mm; glissiere 8700 mm","kl":"N/A"},
  {"m":"HCR1800-EDII","t":"Foreuse de surface sur chenilles a marteau hors-trou (forage vertical)","d":"89-140 (152) mm","p":"N/D","pu":"CAT C9.3, 261 kW (350 hp)","po":"19 930 kg","mt":"Glissiere (feed)","ml":"Feed 5225 mm; glissiere 8700 mm","kl":"N/A"},
  {"m":"DCR22","t":"Foreuse de surface fond-de-trou (DTH) sur chenilles (forage vertical)","d":"89-165 mm (3,5-6,5 po)","p":"N/D","pu":"CAT C13, 328 kW (440 hp)","po":"25 500 kg","mt":"Glissiere (feed)","ml":"Feed 5827 mm; glissiere 10 030 mm","kl":"N/A"},
 ],
}

ORDER = ["Diametre forage","Profondeur max","Type de mat (lead/kelly)","Longueur du mat",
         "Longueur du kelly","Puissance moteur","Poids operationnel","Type"]

def make_specs(md):
    return {
        "Diametre forage": md["d"],
        "Profondeur max": md["p"],
        "Type de mat (lead/kelly)": md["mt"],
        "Longueur du mat": md["ml"],
        "Longueur du kelly": md["kl"],
        "Puissance moteur": md["pu"],
        "Poids operationnel": md["po"],
        "Type": md["t"],
        "_note_tech_texte": "",
        "_note_tech_auteur": "",
        "_note_tech_date": "",
        "_actif": "Oui",
    }

d = json.load(open(PATH, encoding='utf-8'))
f = d['Foreuse']

added_models = 0
added_entries = 0
for brand, models in DATA.items():
    if brand in f:
        print("ATTENTION: marque deja presente, ignoree ->", brand); continue
    f[brand] = {}
    for yr in YEARS:
        f[brand][yr] = {}
        for md in models:
            f[brand][yr][md["m"]] = make_specs(md)
            added_entries += 1
    added_models += len(models)

json.dump(d, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.load(open(PATH, encoding='utf-8'))  # validate

print(f"Marques ajoutees : {len(DATA)}")
print(f"Modeles uniques ajoutes : {added_models}")
print(f"Entrees ajoutees (modeles x annees) : {added_entries}")
print("Marques Foreuse totales :", [b for b in f if not b.startswith('_')])
