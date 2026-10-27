# Carnet de recettes Instagram

Récupère les recettes que tu as **enregistrées** sur Instagram et génère `carnet.html` :
une page unique, hors ligne, avec recherche (sans accents), filtres par catégorie /
ingrédient / régime, favoris, notes perso, bouton « idée au hasard » et partage du lien.

## 1. Installation (une fois, sur ton ordinateur)

```bash
git clone <ce dépôt> && cd instaloader
pip install requests browser_cookie3
```

> À lancer depuis **ton** ordinateur (ta connexion habituelle), pas depuis un serveur :
> Instagram bloque vite les connexions depuis des datacenters.

## 2. Connexion

Le plus simple et le plus sûr : être connecté à Instagram dans Firefox/Chrome, puis
utiliser `--browser firefox` (ta session est réutilisée, pas besoin de mot de passe).
Sinon `--login TON_PSEUDO` demande le mot de passe (et le code 2FA) une seule fois ;
la session est ensuite mémorisée.

## 3. Récupérer les recettes

Conseil : range tes recettes dans une collection d'enregistrements (ex. « Recettes »),
sinon tous tes posts enregistrés seront importés.

```bash
python recettes/recettes.py collections --browser firefox          # voir tes collections
python recettes/recettes.py fetch --browser firefox --collection Recettes
python recettes/recettes.py build                                   # -> recettes/carnet.html
```

Relance `fetch` puis `build` quand tu as enregistré de nouvelles recettes : seuls les
nouveaux posts sont téléchargés. `--max 10` permet de faire un premier essai.

## 4. Partager avec ta femme

`carnet.html` est un fichier autonome (images incluses) :

- envoie-le par WhatsApp / AirDrop / mail, ou mets-le dans un dossier Google Drive / iCloud partagé ;
- sur téléphone, ouvre-le depuis l'app Fichiers / Drive, puis « Ajouter à l'écran d'accueil » si possible ;
- les favoris et notes sont enregistrés **sur chaque appareil**.

Astuce : dans Instagram, la collection « Recettes » peut devenir une **collection partagée**
(Collection → ⋯ → Ajouter des collaborateurs) ; ta femme y enregistre aussi ses recettes et
elles apparaîtront au prochain `fetch`.

Les mots-clés utilisés pour les étiquettes (Poulet, Dessert, Rapide…) sont en haut de
`recettes.py` : ajoute-en librement.
