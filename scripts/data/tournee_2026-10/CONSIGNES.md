# Consignes communes — tournée de vérification des modèles manquants, Portail e-Trak (2026-10-23)

Le Portail e-Trak sert à chiffrer des soumissions d'équipement installé sur des machines lourdes.
Quand une machine d'un client manque à la BD, la soumission bloque. On cherche les TROUS de la BD.

## Données d'entrée
Dossier : C:\Users\jcaron\AppData\Local\Temp\claude\C--Users-jcaron\91eb230e-54d8-4773-90ef-2047a675affc\scratchpad\audit
Fichier inv_<type>.json : {type, fabricants: {Fabricant: {Modele: "anneeMin-anneeMax" (+ "(n ans)" si trous)}}}.
C'est ce que la BD contient AUJOURD'HUI. LECTURE SEULE — ne modifie aucun fichier du dépôt du portail, n'écris rien au serveur.

## Ce qu'on cherche
Marché : Amérique du Nord (Canada + É.-U.). En cas de doute sur la distribution NA, on inclut mais on le dit.
- MODE « 2025-2026 » (par défaut) : pour chaque fabricant de ton périmètre, ouvre la page de gamme ACTUELLE du fabricant
  (site nord-américain : .com/en-us, /en-ca, /na) et liste chaque modèle en vente pour les années 2025-2026.
  Compare à l'inventaire. Signale :
  (a) "absent" : le modèle n'existe sous aucune variante dans la BD pour ce fabricant ;
  (b) "millesime" : le modèle existe dans la BD mais s'arrête avant 2025 ou 2026 alors qu'il est encore en vente.
  Ne signale PAS un modèle discontinué. Les nouvelles générations (-7, -12, série E/F, nouveaux suffixes) sont la cible n°1 :
  les 15 dernières demandes de clients visaient presque toutes des modèles 2026 de nouvelle génération.
- MODE « complet 2015-2026 » (seulement si ton prompt le dit) : toute la gamme NA vendue entre 2015 et 2026, génération par génération.

## Correspondance tolérante (éviter les faux positifs — 37 faux positifs écartés au dernier audit)
Avant de déclarer « absent », compare sans casse, sans espaces, sans tirets ni points : "TB 125" = "TB125", "320 P" = "320P",
"DX140LCR-7" = "DX140LCR-7". Une variante de suffixe proche (LC vs LCR, -7 vs -7H, US vs USR) est un modèle DISTINCT
seulement si le fabricant la vend comme modèle distinct (fiche séparée). Si la BD a le nom sous une forme différente du nom officiel,
mets-le dans "a_verifier" et non dans "absent".
Pas de parenthèses descriptives dans un nom de modèle (« SK210D-10 », pas « SK210D-10 (Car Demo) »).
Camion Vacuum : jamais un châssis (Kenworth, Peterbilt, Freightliner...) — l'unité montée seulement.

## Preuve — RÈGLE NON NÉGOCIABLE
Chaque modèle signalé doit avoir été vu sur une page du FABRICANT (ou de son distributeur officiel NA) que tu as ouverte avec WebFetch.
Donne l'URL exacte et une citation courte du texte de la page qui nomme le modèle. Un résumé de moteur de recherche n'est PAS une preuve :
la dernière fois qu'on s'y est fié, 31 modèles de tracteurs inventés sont passés. Si tu n'arrives pas à ouvrir la page du fabricant :
statut "non_verifiable", avec la source tierce si tu en as une. N'invente jamais un nom, une année ou une spec.
Pour l'année de lancement d'un modèle absent : seulement si la source la donne (communiqué, fiche) ; sinon null.

## Livrable
Écris UN fichier JSON (UTF-8) : <dossier>\out_<ton_id>.json :
{
 "perimetre": "...", "mode": "...",
 "fabricants": [ { "fabricant": "<nom exact de l'inventaire>", "page_gamme": "<url>", "page_ouverte": true/false,
                   "modeles_vus_sur_page": <nombre>, "commentaire": "..." } ],
 "manquants": [ { "fabricant": "...", "modele": "<nom officiel exact>", "statut": "absent|millesime|non_verifiable",
                  "annees_a_ajouter": [2025, 2026] , "annee_lancement": 2024 ou null,
                  "variante_bd_proche": "<nom BD le plus proche ou null>", "url": "...", "citation": "...",
                  "specs_vues": {"<clé>": "<valeur exacte telle que publiée>"} ou {} , "note": "..." } ],
 "a_verifier": [ { "fabricant": "...", "modele_bd": "...", "probleme": "...", "url": "..." } ]
}
Ne remplis specs_vues que si la valeur est sur la page fabricant ouverte. Réponds ensuite par un résumé de 10 lignes max :
nombre de manquants par fabricant, fabricants dont la page n'a pas pu être ouverte.
