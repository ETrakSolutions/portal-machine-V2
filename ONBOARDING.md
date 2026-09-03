# Portal Machine V2 — mise en route d'un nouveau poste

Ce document sert à démarrer quelqu'un qui va travailler sur le portail. Il se lit en
cinq minutes; la mise en route elle-même se fait par Claude Code (prompt à la fin).

> ## ⚠️ À SAVOIR AVANT TOUT LE RESTE
>
> **Une fois le poste configuré, ouvre Claude Code DANS le dossier du dépôt**
> (`…\CLAUDE_CODE\portal-machine-v2`), jamais ailleurs.
>
> Les **sept skills** du projet vivent dans `.claude/skills/` et ne se chargent que
> dans ce contexte, `CLAUDE.md` non plus. Ouvert ailleurs, Claude n'a aucun de ces
> repères : il pose des questions au lieu de chercher, et il ignore les règles du
> projet. Trois skills n'existent QUE là — dont **`portal-fill-specs`**, celui qui
> sert à créer ou compléter une machine, la tâche la plus fréquente.
>
> C'est un piège qui a déjà coûté une session complète. Si Claude te semble perdu
> ou trop bavard, la première chose à vérifier est le dossier d'ouverture.

## Le projet en trois phrases

Le **Portal Machine V2** est l'outil interne e-Trak pour consulter les spécifications de
machines lourdes et configurer le kit de limiteur à installer dessus, jusqu'à la demande
de soumission. C'est un site statique (HTML/CSS/JS, aucun framework) servi par GitHub
Pages, dont la base de données est un fichier JSON dans le dépôt. Un backend Google Apps
Script écrit directement dans le dépôt quand un admin sauvegarde depuis l'interface.

- Dépôt : `ETrakSolutions/portal-machine-V2` (public)
- Site : https://etraksolutions.github.io/portal-machine-V2/
- ⚠️ La **V1** (`portal-machine`) est **gelée** : ne plus y toucher.

## Ce qu'il faut avoir compris avant de modifier quoi que ce soit

1. **Rien ne va en ligne sans validation à la source du fabricant.** La page produit ou la
   fiche technique du constructeur. Un résumé de recherche ne vaut pas preuve. Si la
   source est inaccessible, on laisse la donnée inchangée et on le signale — on ne devine
   pas. Cette règle existe parce qu'une règle interne commode (un seuil de poids) a
   contredit la réalité technique pendant des mois sur 991 entrées.
2. **Les JSON s'écrivent en compact.** `separators=(',',':')`. `data/machines.json` tient
   sur une seule ligne; un `indent=2` le reformate en centaines de milliers de lignes.
3. **On teste en navigateur avant de pousser.** Un endpoint qui répond 200 ne prouve rien
   sur ce que l'utilisateur voit.
4. **Jamais `git add -A`.** Plusieurs sessions travaillent parfois dans le même clone.
5. **Une décision métier va dans les overrides**, pas en dur dans le code.

## Par quoi commencer, dans le dépôt

Le skill **`portal-machine-db` est la référence canonique** : modèle de données, pièges,
règle de validation du fabricant. `CLAUDE.md` à la racine donne l'aiguillage vers les six
autres — dont **`portal-fill-specs`** pour créer ou compléter une machine, et
**`portal-deploy`** pour tester et mettre en ligne.

## Ce qu'il faut demander à Jacquot

- **Accès en écriture** au dépôt GitHub (le clone et la lecture marchent sans rien).
- Le fichier **`PIN Portail.txt`** — le NIP du portail, jamais dans le dépôt.
- L'accès au compte **`etrak.portail@gmail.com`** si tu dois toucher au backend Apps
  Script (redéploiement du Web App).

## Le prompt de mise en route

Coller tel quel dans Claude Code, depuis n'importe quel dossier :

---

Tu vas me configurer ce poste pour travailler sur le Portal Machine V2 d'e-Trak. Fais
tout toi-même, étape par étape, et arrête-toi en me l'expliquant si quelque chose bloque.

1. Vérifie les prérequis et dis-moi ce qui manque : `git`, Python 3, Google Chrome, et la
   CLI GitHub `gh` (utile, pas obligatoire).

   Pour Python, attention : sur un poste Windows il y a souvent **plusieurs
   installations**, et `python` ne pointe pas forcément sur celle qui a les paquets.
   Liste-les avec `py -0`, puis pour chacune vérifie `selenium` et `openpyxl` —
   par exemple `py -3.13 -c "import selenium, openpyxl"`. Installe ce qui manque avec
   le `py -3.xx -m pip` de l'interpréteur retenu, puis **dis-moi la commande exacte à
   utiliser pour lancer les scripts de ce dépôt** (ce sera `py -3.xx` et pas forcément
   `python`) et emploie-la partout ensuite.

   Ça vaut la peine : sur le poste de Jacquot, `python` est un Python 3.13 **sans**
   selenium alors qu'un autre 3.13 l'a — les tests navigateur échouaient avec
   `ModuleNotFoundError` sur un environnement parfaitement sain.

2. Clone le dépôt public https://github.com/ETrakSolutions/portal-machine-V2 dans
   `%USERPROFILE%\CLAUDE_CODE\portal-machine-v2` s'il n'y est pas déjà. S'il y est déjà,
   fais plutôt un `git pull`.

3. Depuis le dépôt, active le garde-fou anti-erreur : `git config core.hooksPath .githooks`
   puis confirme-moi qu'il est bien actif. Sans ça, le hook qui bloque un HTML vide ou un
   JSON invalide ne s'exécute pas sur mon poste.

4. Lis `CLAUDE.md` à la racine, puis `.claude/skills/portal-machine-db/SKILL.md`.
   Résume-moi en une dizaine de lignes : à quoi sert le projet, où vivent les données
   (quels fichiers, qui écrit dedans), et les cinq règles dures.

5. Lance les deux contrôles en lecture seule pour confirmer que l'environnement est
   fonctionnel, et rapporte-moi le résultat sans rien corriger :
   `<python> scripts/check_portal_integrity.py`
   `<python> scripts/controle_sante_portail.py`

   `<python>` = la commande retenue à l'étape 1 (souvent `py -3.13`, pas `python`).

6. Lance le test navigateur de bout en bout, qui tourne contre le site en ligne et ne
   modifie rien : `<python> scripts/selenium_mini_fabricant_test.py`. Il doit se terminer
   par `RESULTAT: OK`. S'il échoue, dis-moi précisément quelle vérification a lâché.

7. Termine en me listant ce que je dois obtenir de Jacquot : accès en écriture au dépôt,
   le fichier `PIN Portail.txt`, et l'accès au compte `etrak.portail@gmail.com` pour le
   backend.

Règles pour cette session : **ne modifie aucune donnée, ne commit rien, ne pousse rien.**
C'est une mise en route en lecture seule. Quand tu as terminé, rappelle-moi de rouvrir
Claude Code directement dans le dossier du dépôt, pour que les skills du projet se
chargent.

---

## Pour comprendre plus en profondeur

`PROCEDURE PORTAIL.md` à la racine décrit l'architecture en détail : pages, backend Apps
Script, overrides découpés par type, règles du kit, historique des décisions.
