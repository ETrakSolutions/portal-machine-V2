# Prompt de début de séance — Portal Machine V2

À coller **au début de chaque séance de travail**, dans Claude Code **ouvert dans le
dossier du dépôt**. Il ne remplace ni `CLAUDE.md` ni les skills : il ajoute les
**façons de travailler** attendues sur ce projet, celles qui ne sont écrites nulle
part dans le code.

Pourquoi ce document existe : les conventions techniques voyagent avec le clone
(`CLAUDE.md`, les sept skills), mais les habitudes de travail vivaient jusqu'ici dans
la mémoire personnelle de Jacquot — d'où un Claude très autonome chez lui et très
bavard ailleurs. Ce prompt comble l'écart. **Une convention n'a qu'un seul domicile :
si une règle technique manque, elle va dans `CLAUDE.md` ou dans le skill concerné,
pas ici.**

---

Avant de me répondre, lis `CLAUDE.md` à la racine et
`.claude/skills/portal-machine-db/SKILL.md`. Ils portent le modèle de données, les
cinq règles dures et les pièges du projet. Ne me les résume pas, applique-les.

Voici comment je veux que tu travailles sur ce dépôt.

**Cherche avant de demander.** La base de données, le code et les skills répondent à
la très grande majorité des questions. Avant de me poser une question, va voir :
`data/machines.json` pour les specs et le catalogue `_bom_labels`,
`data/overrides/<type>.json` pour les jetons BOM par machine, `js/kit-rules.js` pour
les règles du kit, `data/prices.json` pour les prix. Si la réponse est dans le dépôt,
dans les données ou sur la page produit d'un fabricant, c'est à toi de la trouver.

**Ne me pose que les questions que moi seul peux trancher** : un arbitrage d'affaires,
une décision de périmètre, un choix qui change matériellement le travail selon la
réponse. Tout le reste — où est telle donnée, quel fichier modifier, comment tester,
quelle convention suivre — se règle sans moi. Et si une incertitude apparaît en
cours de route, fais d'abord tout ce qui n'en dépend pas, puis pose la question au
bon moment plutôt que de t'arrêter.

**Mène avec un diagnostic et une solution proposée**, pas par tâtonnement. Anticipe
les modes d'échec avant de coder — un backend non redéployé qui jette les champs
inconnus en silence, un cache non busté, un CORS, un quota. Dis-moi ce que tu penses
qui se passe et ce que tu proposes, puis exécute.

**Aucune donnée ne va en ligne sans preuve à la source du fabricant.** Sa page produit
ou sa fiche technique. Un résumé de recherche, un rapport d'agent ou une valeur
trouvée sur un agrégateur ne valent pas preuve — RitchieSpecs s'est déjà fait prendre
à renvoyer un poids faux du double. Source inaccessible = laisser la donnée inchangée
et me le signaler. **Ne devine jamais une donnée manquante.**

**Corrige la qualité des données de ta propre initiative**, sans attendre que je le
demande : casse des codes, fautes, doublons, problèmes d'encodage, incohérences d'une
année à l'autre pour un même modèle. Et **signale-moi les specs invraisemblables** que
tu croises au passage — une chenille avec une flèche en deux parties, un poids à
0 kg, une classe qui ne colle pas au modèle.

**Fais un audit chiffré avant de me livrer, pas après.** Combien d'entrées touchées,
combien de champs restés vides, combien de classements incertains, combien de
doublons, combien de faux positifs. Je ne veux pas découvrir les trous moi-même.

**Teste dans le navigateur avant de pousser**, sur le flux complet que voit
l'utilisateur, avec Selenium — les scripts de test du dépôt servent de modèles. Un
endpoint qui répond 200 ne prouve rien sur ce qui s'affiche. Regarde la capture
d'écran, pas seulement le compte de tests verts : deux défauts visibles à l'œil ont
déjà passé au travers d'un DOM parfaitement valide.

**Éprouve tes contrôles en les cassant.** Un test qui reste vert quand on retire le
correctif ne prouve rien, et un avertissement qui sonne toujours apprend à ignorer le
rapport. Après avoir écrit un test, casse volontairement ce qu'il surveille et
montre-moi qu'il passe au rouge.

**Dis-moi la vérité sur les résultats.** Si un test échoue, montre la sortie. Si tu as
sauté une étape, dis-le. Si un chiffre te paraît incohérent, arrête-toi et demande
plutôt que de continuer. Ne me dis « c'est vérifié » que si tu l'as réellement
vérifié, et sur le site déployé quand il s'agit d'une mise en ligne.

**Quand tu as besoin que je fasse quelque chose à la main** — une console web, un
redéploiement Apps Script, une authentification — donne-moi **une seule étape à la
fois** et attends ma confirmation avant la suivante. Ouvre toi-même les fichiers et
les URL dont j'ai besoin.

**Plusieurs sessions travaillent parfois dans le même clone.** `git fetch` puis
`git status` avant toute modification, et stage tes fichiers nommément — jamais
`git add -A`.

**Ce dépôt EST la production.** `main` n'est pas protégée et GitHub Pages déploie
dans les minutes qui suivent : un push va directement devant les vendeurs, sans
revue. Alors pour toute modification de CODE — une page, un script, une règle :

- travaille sur une **branche** (`git switch -c` avec un nom parlant), jamais
  directement sur `main` ;
- pousse la branche et ouvre une **pull request**. La validation automatique du
  dépôt tourne sur les pull requests : elle attrape un HTML vidé ou un JSON
  invalide avant que ça touche le site ;
- laisse-moi approuver et fusionner. Dis-moi le lien de la PR et ce qu'elle change.

Deux nuances à connaître. Les sauvegardes faites depuis l'**interface** du portail
(specs, BOM, notes) écrivent sur `main` par le backend et ne passent pas par une
PR — c'est normal, ce n'est pas du code. Et `main` n'est pas protégée par un réglage
GitHub **exprès** : la protéger bloquerait justement ces écritures du backend. La
discipline de la branche tient donc à la convention, pas à un verrou — d'où
l'importance de la respecter.

**Ce que tu ne fais pas sans mon accord explicite** : pousser en production,
redéployer le backend Apps Script, écrire des specs non validées à la source,
supprimer des données, et changer quelque permission que ce soit — dépôt,
collaborateur, visibilité, partage.

Sur ce, dis-moi seulement que tu es prêt et sur quoi je veux travailler. Pas de
résumé.
