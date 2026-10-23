# Consignes — passe de specs avant import, Portail e-Trak (2026-10-23)

Dossier : C:\Users\jcaron\AppData\Local\Temp\claude\C--Users-jcaron\91eb230e-54d8-4773-90ef-2047a675affc\scratchpad\specs
Ton fichier d'entrée : work_<lot>.json -> "modeles" (modèles confirmés manquants, avec l'URL fabricant déjà trouvée)
et "exemples_format_bd" (une entrée réelle de la BD par type|fabricant : ce sont les CLÉS et le FORMAT exacts à reproduire).
LECTURE SEULE sur le dépôt du portail et le serveur : tu n'écris que ton fichier de sortie.

## But
Pour chaque modèle, remplir les champs de specs du type, au format exact des exemples, depuis la page ou la fiche
technique du FABRICANT (ou de son distributeur officiel NA). Les specs servent à chiffrer des soumissions.

## Règles
- Source fabricant seulement, page ouverte par toi (WebFetch ; si bloqué, une requête HTTP directe sur le même site est acceptée).
  Un résumé de moteur de recherche n'est PAS une source. Valeur introuvable = "A completer". N'invente jamais, n'estime jamais.
- Reproduis le format des exemples au caractère près (unités, ordre kg / lbs, espaces de milliers, « 24V DC »...).
  Conversion d'unités permise seulement si la valeur source est exacte (1 lb = 0,45359237 kg ; 1 m = 3,28084 pi), arrondie à l'entier.
  Une plage publiée reste une plage.
- CHAMPS QUI PILOTENT LA FACTURATION — les traiter en priorité, et ne JAMAIS les déduire du nom du modèle :
  * Excavatrice : "Poids operationnel (kg / lbs)" (≤ 5000 kg = mini), "Type de traction" (Chenille / Roue),
    "Swing boom" ("Oui" seulement si le fabricant offre une flèche à déport/offset/swing boom sur CE modèle, sinon "Non" ;
    "A completer" si tu ne peux pas le savoir). "Classe machine" : laisse "" (je la calcule par les voisins de poids).
    "Type de boom" : Chenille -> "Boom 1 partie", Roue -> "Boom 2 parties (articule)" sauf preuve contraire.
    "Voltage machine (V/type)" : "12V DC" si < 5000 kg sinon "24V DC" sauf si la fiche dit autre chose.
  * Nacelle : "Categorie" (même vocabulaire que la BD : regarde l'exemple ; articulée vs télescopique est décisif),
    "Hauteur plateforme (pi)".
  * Pompe a Beton : "Nombre de sections" (chiffre), "Type de pliage".
  * Telehandler : "Base rotative" (Oui/Non), "Pattes stabilisatrices" (Oui/Non).
- Le reste des champs : au mieux, sinon "A completer".
- Modèles listés "millesime" : ils existent déjà en BD ; mets "specs": null (je recopierai l'entrée existante).

## Livrable
Écris specs\out_<lot>.json (UTF-8) :
{ "lot": "...", "resultats": [ { "type": "...", "fabricant": "...", "modele": "...",
   "specs": { "<clé exacte>": "<valeur>", ... } ou null,
   "sources": { "<clé>": "<url>" }, "remarque": "..." } ] }
Un résultat par modèle d'entrée, dans le même ordre, même s'il reste tout en "A completer".
Si en lisant la fiche tu découvres que le modèle n'existe pas, est mal nommé ou est déjà en BD sous un autre nom : dis-le dans "remarque".
Réponds ensuite par 6 lignes max : nombre de modèles, combien ont les champs de facturation remplis, problèmes.
