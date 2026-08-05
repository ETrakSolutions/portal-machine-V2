# Signalements — specs Grue Mobile et Excavatrice (2026-08-05)

## 0. Excavatrice — écart relevé sur une valeur importée le 2026-08-05

| Marque | Modèle | Champ | Valeur en base | Fiche constructeur | Source |
|---|---|---|---|---|---|
| LiuGong | 936E | Poids operationnel | 36000 kg | **37000 kg** | brochure combinée 933E/936E, p8 |

Le 36 000 kg vient de l'estimation de l'audit du 2026-07-01 ; la brochure LiuGong
donne 37 000 kg. Écart de 2,8 %, sous le seuil de tolérance du contrôle, donc non
corrigé automatiquement. Les poids des 920E, 925E et 933E concordent, eux, avec
leurs fiches.



Relevés **en marge du mandat** par les agents de recherche : ce sont des valeurs
DÉJÀ en base qui semblent fausses, ou des conventions incohérentes. Rien n'a été
écrasé — le pipeline d'intégration ne remplit que des champs vides. À trancher.

## A. Valeurs existantes contredites par la fiche constructeur

| Marque | Modèle | Champ | Valeur en base | Valeur constructeur | Source |
|---|---|---|---|---|---|
| XCMG | XCR130_U | Puissance moteur | about 577 hp (Mercedes-Benz) | Cummins L9 310 hp | XCMG North America |
| XCMG | XCR100_U | Contrepoids max | 11.5 t | 10 t (22 046 lb) | fiche XCMG NA |
| SANY | SCA3300A | Capacite max | 272 t | 300 t (330 USt) | brochure SANY |
| Manitowoc | MLC300 | Contrepoids max | 200 t | 215.2 t (VPC sup. max ; 175.2 t en Series 2) | Product Guide Manitowoc |
| Grove | GMK5250L-1 | Fleche telescopique | 13.4-78.5 m | 13.3-70.0 m | Product Guide Grove officiel |
| Maeda | MC-275C | Capacite max | 2.8 t | 2.5 t (brochure) / 2.52 t | brochure concessionnaire |
| Maeda | LC785M-8, LC785M-8B | Puissance moteur | Komatsu S4D95LE-3-A 40 kW | SAA4D95LE-5, 41.0 kW (le S4D95LE-3-A est la génération M-6) | tableau officiel Maeda |
| Liebherr | LTF 1045-4.1 | Contrepoids max | 9 t | 5.0 t (11 000 lb, montage Kenworth) | fiche technique NA officielle |
| Tadano | **TR-600XXL-4** | Contrepoids max | **41.1 t** | introuvable — **invraisemblable pour une grue de 54 t** | doc Tadano (absente) |
| Tadano | CC 6800-1 | Fleche telescopique / Hauteur max | 96 m / 260 m | 30-156 m / 206 m | brochure OEM Demag |
| Tadano | GR-1600XL | Hauteur max | 78 m | 92.20 m | fiche Tadano |
| Tadano | GR-1300XL-4 | Contrepoids / Hauteur | 18 t / 76 m | 19.7 t (43 500 lb) / 72.51 m | fiche Tadano |
| Tadano | GR-1200XL | Contrepoids max | 11.5 t | 10.0 t (22 000 lb) | fiche Tadano |
| Tadano | GR-900XL-4 | Contrepoids max | 10 t | 9.1 t | fiche Tadano |
| Tadano | GR-800XLL-4 | Hauteur max | 64.4 m | 68.30 m | fiche Tadano |
| Tadano | GT-550E | Capacite max | 50 t | 55 t (à 3.0 m) — flèche 11.1-42.0 m identique, donc même modèle | fiche Tadano GT-550E-1 |
| Terex | RT 90 | Capacite max | 82 t | « 90 t capacity class » — RT 90 et RT 100US sont la même grue (tableaux de poids identiques), rating métrique vs US | fiche métrique Terex |
| Terex | T 775 | Essieux | 3 | porteur 8x4 = 4 essieux | deux documents Terex |
| Terex | Explorer 5500 | Capacite max | 127 t | 130 t | fiche Terex |
| Terex | Explorer 5800 | Capacite max | 200 t | 220 t | fiche Terex |
| Terex | T 340-1 XL | Contrepoids max | 5 t | 4.99 t (907/3265/4990 kg) — même fiche que T 340-1 | fiche Terex |

## B. Conventions incohérentes dans les données existantes

**« Hauteur max » — convention majoritaire = hauteur maximale ATTEIGNABLE (fléchette
incluse).** Mesuré sur les 279 modèles où hauteur et flèche sont toutes deux
renseignées : 249 ont une hauteur supérieure à la flèche, ratio médian 1,40, dans
les 8 familles. C'est la convention retenue pour la campagne.

Exception locale : **Altec — ✅ NORMALISÉ le 2026-08-05** (31 entrées). Ses valeurs
étaient des hauteurs en flèche seule ; relevées sur les spec sheets officielles
Altec, confiance haute :

| Modèle | Avant | Après | Fléchette |
|---|---|---|---|
| AC18-70B | 24.4 m | **36.6 m** | 2 pièces 24-40 pi (option) |
| AC23-95S | 32.0 m | **45.4 m** | 1 pièce 26 pi / 2 pièces 26-44 pi |
| AC38-127S | 41.8 m | **58.5 m** | 1 pièce 31 pi / 2 pièces 55 pi |
| AC45E-127S | 41.1 m | **57.6 m** | IJ26 / 1 pièce 31 pi / 2 pièces 55 pi |
| AC65E-155S | (vide) | **65.5 m** | deux fléchettes 2 étages de 50 pi |
| AC30-53T | 19.2 m | 19.2 m — **inchangé** | **aucune fléchette au catalogue** : grue-tracteur à sellette, flèche 3 sections de 53 pi. Sa hauteur en flèche seule EST sa hauteur max atteignable (ratio 1,19 = vrai cas hors norme, à ne pas forcer). |
| AC40E-152S | 63.1 m | 63.1 m — **inchangé** | était déjà le seul conforme |

⚠️ PIÈGE à ne pas reprendre : les fiches AC40E-152S et AC65E-155S contiennent une
table AERIAL SPECIFICATIONS (ANSI A92.2) avec des « Platform Working Height » de
65.6 / 67.7 et 65.8 m — ce sont des hauteurs de **plancher de nacelle**, pas de
poulie de grue.


**SANY — « Contrepoids max » : deux règles cohabitent.** Les treillis déjà en base
cumulent contrepoids arrière + châssis (SCA3300A = 188 t = 128 + 60 ; SCA4000A =
146 t = 100 + 46), tandis que la SCA900TB ne compte que l'arrière (26 t).
L'agent a reproduit cette double convention par famille et détaillé chaque
décomposition dans ses notes. À uniformiser si on veut une règle unique.

## C. Données qui n'existent pas sous forme publiée

**Manitowoc, chenilles treillis — « Hauteur max » (14 modèles).** Le constructeur
ne publie aucune hauteur en bout de flèche : les Product Guides donnent les
longueurs de flèche principale / fixe / relevable, et les diagrammes de portée
sont des images sans cote. Vérifié sur les 14 guides, le poster de gamme et les
flyers « wide boom ».

**SANY, treillis SCA1000A / SCA1350A / SCA3000A / SCA4000A — « Hauteur max ».**
Non publiée, alors que les modèles TB de la même marque l'affichent.

→ Piste : pour ces familles, une valeur du type « Selon configuration » serait
plus honnête qu'un champ vide, sur le modèle de « Selon châssis » adopté pour
les boom trucks. À valider.

## D. Contradiction interne à une source constructeur

**Manitex TC700 — contrepoids.** La section « Counterweight » et l'en-tête de la
charte de charge donnent 22 000 lb (10.0 t, cohérent avec 4 × 5 500 lb), mais la
note de bas de page « Preliminary Chassis Data » du **même document** parle d'un
« full (20,000 lbs.) CWT ». Valeur retenue : 10.0 t. À valider avant de s'y fier
en soumission.

## E. Entrées de la base probablement fausses ou en double

| Marque | Modèle | Problème |
|---|---|---|
| Link-Belt | **90\|RT 2** | fiche = copie intégrale du 90\|RT, alors que le communiqué officiel décrit une flèche 11.6-42.7 m *pin and latch* 5 sections, différente de la 12.3-47.2 m *full-power* du 90\|RT. **Specs à refaire.** |
| Kobelco | **CK800-2** | n'existe pas chez Kobelco NA (gamme : CK800, -II, -III, G, G-2, G-3). Mêmes capacité (73 t), flèche (61 m) et millésimes que CK800G-2, déjà en base. Doublon probable. |
| Kobelco | **CK2500G-2** | introuvable dans toute la doc Kobelco, y compris « Old Models ». Ses valeurs sont celles du CK2500-II. À fusionner ou supprimer. |
| Liebherr | **LTC 1055-3.2** | désignation inexistante au catalogue : la gamme LTC s'arrête à 1055-3.1, le suffixe -3.2 appartient aux LTM. À identifier. |
| Kobelco | CK2000-II, CK2500-II | moteur en base « 363 hp (Hino P11C) » ; spec books officiels : **331 HP (Hino P11C-UN, Tier 3)** |
| Kobelco | CK1100G-2 | moteur en base « Hino J08E-UV » (Tier 4 intérimaire, = CK1100G) ; spec book du -2 : **J08E-VV** (Tier 4 Final) |
| Link-Belt | HTT-8660 | voltage en base « 24V DC » ; document officiel : **12-volt neg. ground / 12 volt starting** |
| Link-Belt | ATC-3250 | contrepoids en base 62.6 t ; doc 71 t |
| Link-Belt | RTC-8050 II | hauteur en base 52.4 m ; doc 44.5 m |
| Link-Belt | RTC-8030 | flèche en base 11-31 m ; doc 8.84-27.84 m |
| Link-Belt | 238 HSL | flèche en base 73.2 m ; doc 79.25 m |
| Link-Belt | HTC-8640 | 3 essieux en base ; porteur 8x4 au document |

## F. Voltages déduits par règle, JAMAIS confirmés en fiche (à vérifier)

La passe 1 a étendu le voltage à **81 modèles** par déduction interne (même marque
+ même famille + valeurs unanimes en base). La campagne a ensuite prouvé que le
voltage **n'est pas uniforme à l'intérieur d'une famille** chez au moins deux
marques :
- **Link-Belt** : 65\|RT = 12V mais 75/85/90/100/120\|RT = 24V ; ATC-3250 = 24V mais
  ATC-3210 et ATC-3275 = 12V ; TCC-800 et TCC-1800 = 24V mais TCC-550/750/1100/
  1200/1400/2500 = 12V.
- **Grove** : GRT et TMS/TTS = 24V, mais RT530E-2, RT765E-2 et RT9130E-2 = 12V.

Deux erreurs déjà confirmées, produites par cette règle : **HTT-8660** et
**HTC-8675 Series II**, inscrits 24V DC alors que la doc Link-Belt dit 12V.

Liste nominative des 81 : `scripts/data/grues_voltage_a_verifier.json`
(34 en priorité haute = Link-Belt et Grove).

## G. Modèles sans documentation constructeur

| Marque | Modèle | Manque |
|---|---|---|
| Manitowoc | MLC100A-1 | aucune section Documentation sur la page produit |
| SANY | SCA3000A | la page sert une brochure intitulée SCA2600A (renommage probable) |
| Elliott | 45127, 45142 | contrepoids visible sur une photo de la fiche, masse jamais publiée |
