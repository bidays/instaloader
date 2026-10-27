# Carnet de recettes Instagram

Récupère les recettes que tu as **enregistrées** sur Instagram et génère `carnet.html` :
une page unique, hors ligne, avec recherche (sans accents), filtres par catégorie /
ingrédient / régime, favoris, notes perso, bouton « idée au hasard » et partage du lien.

## Recommandé : l'app partagée « Nos recettes »

`app.src.html` est une page publiée sur claude.ai (`python recettes/recettes.py app`
génère `app.html`). Elle garde les recettes dans une base commune : ta femme et toi voyez
les mêmes fiches, favoris, « testée » et notes. Pour ajouter une recette depuis l'iPhone :
capture d'écran dans Instagram + Partager → Copier le lien, puis « Ajouter » dans l'app ;
Claude lit la capture et remplit titre, ingrédients et étapes. Pour importer d'un coup la
collection existante : bouton 📤 du signet Safari ci-dessous, puis « Importer » dans l'app.

## Sur iPhone : le signet Safari

`signet.txt` contient un signet (bookmarklet) à installer dans Safari. Sur instagram.com,
connecté à ton compte, touche le signet : le carnet s'affiche par-dessus la page, lit ta
collection avec ta propre session, se met à jour à chaque ouverture et garde une copie
pour s'ouvrir tout de suite. Favoris et notes sont stockés sur le téléphone.

Installation : copie le contenu de `signet.txt`, crée un signet dans Safari (Partager →
Ajouter un signet), puis modifie-le et remplace son adresse par le code copié.
Après avoir changé `signet.src.js` ou les mots-clés : `python recettes/recettes.py signet`.

## Sur ordinateur : page HTML hors ligne

### 1. Installation

```bash
git clone <ce dépôt> && cd instaloader
pip install requests browser_cookie3
```

> À lancer depuis **ton** ordinateur (ta connexion habituelle), pas depuis un serveur :
> Instagram bloque vite les connexions depuis des datacenters.

### 2. Connexion

Le plus simple et le plus sûr : être connecté à Instagram dans Firefox/Chrome, puis
utiliser `--browser firefox` (ta session est réutilisée, pas besoin de mot de passe).
Sinon `--login TON_PSEUDO` demande le mot de passe (et le code 2FA) une seule fois ;
la session est ensuite mémorisée.

### 3. Récupérer les recettes

Conseil : range tes recettes dans une collection d'enregistrements (ex. « Recettes »),
sinon tous tes posts enregistrés seront importés.

```bash
python recettes/recettes.py collections --browser firefox          # voir tes collections
python recettes/recettes.py fetch --browser firefox --collection Recettes
python recettes/recettes.py build                                   # -> recettes/carnet.html
```

Relance `fetch` puis `build` quand tu as enregistré de nouvelles recettes : seuls les
nouveaux posts sont téléchargés. `--max 10` permet de faire un premier essai.

### 4. Partager avec ta femme

`carnet.html` est un fichier autonome (images incluses) :

- envoie-le par WhatsApp / AirDrop / mail, ou mets-le dans un dossier Google Drive / iCloud partagé ;
- sur téléphone, ouvre-le depuis l'app Fichiers / Drive, puis « Ajouter à l'écran d'accueil » si possible ;
- les favoris et notes sont enregistrés **sur chaque appareil**.

Astuce : dans Instagram, la collection « Recettes » peut devenir une **collection partagée**
(Collection → ⋯ → Ajouter des collaborateurs) ; ta femme y enregistre aussi ses recettes et
elles apparaîtront au prochain `fetch`.

Les mots-clés utilisés pour les étiquettes (Poulet, Dessert, Rapide…) sont en haut de
`recettes.py` : ajoute-en librement.
