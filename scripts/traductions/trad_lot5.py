# -*- coding: utf-8 -*-
# Lot 5 (2026-10-06) : textes apparus dans la BD apres l'extraction du 2026-09-03.
# Cles = texte francais exact (ils n'ont pas d'id dans textes_fr.json).
# Les « Raccord hydraulique — numero a confirmer a la commande (...) » sont traites
# par une REGLE de prefixe dans appliquer_traductions.py (meme libelle anglais que
# le defaut de js/kit-rules.js), pas un par un : la parenthese porte la designation
# du raccord et reste telle quelle.
TRAD_FR = {
    # Le texte saisi porte un retour de ligne : la cle doit le reproduire.
    "Installer les proxs dans l'inspection hole en dessous\nModifier la bracket pour "
    "rapprocher les 2 prox, presque collé":
        "Install the proximity sensors in the inspection hole underneath.\nModify the bracket "
        "to bring the 2 proximity sensors closer together, almost touching.",
    # Designation de piece : identique dans les deux langues.
    "Gageport code 61 AS #16": "Gageport code 61 AS #16",
}

PREFIXES = {
    "Raccord hydraulique — numéro à confirmer à la commande":
        "Hydraulic fitting — part number to be confirmed at order",
}
