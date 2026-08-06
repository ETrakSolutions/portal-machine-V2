# Consignes — collecte des modèles de tracteurs (Portal V2, type « Tracteur »)

Ces consignes s'appliquent à tous les agents de recherche. Le résultat est lu par
`scripts/importer_tracteurs.py`, qui refuse d'écrire si le format n'est pas respecté.

## Ce qu'on cherche

Tracteurs **agricoles** vendus **neufs en Amérique du Nord (États-Unis + Canada)**
entre **2015 et 2026**. Toute la gamme : sous-compacts, compacts, utilitaires,
row-crop, articulés, chenillés, spécialisés (verger/vigne).

Exclus : tondeuses autoportées lawn & garden, VTT/UTV, chargeuses et rétrocaveuses
de construction, pulvérisateurs automoteurs, motoculteurs 2 roues.

## Règle de comptage — modèle de BASE, pas configuration

Une désignation de modèle de base = une entrée. `Steiger 620` et
`Steiger 620 Quadtrac` = **un seul** modèle. Cabine vs ROPS, 2RM vs 4RM,
transmission, largeur de voie = **configurations**, jamais des entrées séparées.
Ces variantes sont gérées par le BOM du portail, pas par la base modèles.

## Format de sortie

Un fichier JSON **par marque**, dans ce dossier, nommé en minuscules sans accent
(ex. `john-deere.json`, `massey-ferguson.json`) :

```json
{
  "marque": "John Deere",
  "modeles": [
    {
      "modele": "5075E",
      "annees": "2015-2026",
      "puissance": "75 hp",
      "poids": "6 393 lb",
      "levage": "3 197 lb",
      "source_url": "https://www.deere.com/...",
      "source_type": "fabricant",
      "confiance": "haute",
      "note": ""
    }
  ]
}
```

Le nom de marque dans `"marque"` doit être **exactement** celui de
`scripts/data/tracteurs_marques.json` — c'est lui qui devient la marque affichée
dans le portail.

## Format des valeurs — au caractère près

Relevé dans le type Loader déjà en base, à reproduire tel quel :

- puissance : `"68 hp"` — nombre entier, espace, `hp`
- poids : `"12 346 lb"` — **livres**, espace simple comme séparateur de milliers
- levage : `"3 986 lb"` — livres, même convention

Toujours en unités impériales. Convertir depuis le métrique si la fiche est en kg
(1 kg = 2,20462 lb), arrondir à l'entier, et le signaler dans `note`.

Définitions retenues :

- **puissance** = puissance moteur brute (engine hp) publiée par le fabricant.
  Si seule la puissance à la PDF (PTO hp) est publiée, laisser `puissance` **vide**
  et écrire la valeur PTO dans `note`.
- **poids** = poids opérationnel / shipping weight publié.
- **levage** = capacité de relevage 3 points **arrière**. Préciser dans `note` la
  convention publiée (aux rotules / at ball ends, ou à 24 po derrière).

## Règle absolue : jamais de valeur devinée

Un modèle entre en base **même si tous les champs sont vides**. C'est le choix
déjà fait pour les 234 excavatrices et les grues. On préfère une entrée nue à une
donnée inventée.

- Rien trouvé → chaîne vide `""`, jamais une estimation, jamais une valeur d'un
  modèle voisin, jamais une fourchette.
- Pas d'extrapolation d'une année à l'autre ni d'une variante à l'autre.
- `confiance` : `haute` (fiche fabricant NA), `moyenne` (source secondaire
  sérieuse ou fiche fabricant non NA), `nulle` (modèle retenu sans specs).
- `source_type` : `fabricant`, `deux_sources`, ou `aucune`.

## Années

`"annees"` = fenêtre de commercialisation NA du modèle, bornée à 2015-2026
(l'importeur tronque de toute façon). Format `"2015-2026"` ou `"2018-2022"`.
Utiliser la fenêtre de la marque indiquée dans `tracteurs_marques.json` comme
plafond (ex. Challenger s'arrête en 2023, Branson en 2022).

Si la fenêtre exacte d'un modèle est incertaine, prendre la fenêtre la plus
défendable d'après les sources et l'écrire dans `note` — ne pas rejeter le modèle
pour autant.

## Sources

Priorité aux sites constructeurs NA (`.com` / `.ca`), sitemaps, configurateurs,
fiches produits et brochures PDF officielles. Les concessionnaires servent à
confirmer une distribution NA, pas à établir une spec. Les agrégateurs
(TractorData, MachineryTrader, LECTURA) ne comptent **jamais** comme preuve de
distribution nord-américaine.

`source_url` doit pointer vers la page réellement consultée.

## Rebadges

Un modèle rebadgé est importé **sous sa marque de vente** — c'est le nom que le
client emploie. Le lien de plateforme va dans `note`.
Connus : Bobcat CT = plateformes Kioti, Bad Boy = Branson/TYM, RK = TYM probable,
Kubota M8 = Buhler Versatile, MF 2600H = TAFE, MF GC/1500 = Iseki.
