#!/usr/bin/env python3
"""Récupère les recettes enregistrées sur Instagram et génère un carnet consultable.

Usage :
    python recettes/recettes.py fetch --login MON_PSEUDO [--collection Recettes]
    python recettes/recettes.py collections --login MON_PSEUDO
    python recettes/recettes.py build

Les données sont stockées dans recettes/data/ (recettes.json + miniatures),
la page générée est recettes/carnet.html : un seul fichier, utilisable hors ligne.
"""

import argparse
import base64
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import instaloader  # noqa: E402
from instaloader.exceptions import ConnectionException  # noqa: E402

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
THUMBS_DIR = DATA_DIR / "thumbs"
DB_FILE = DATA_DIR / "recettes.json"
TEMPLATE = HERE / "template.html"
OUTPUT = HERE / "carnet.html"

# Mots-clés recherchés dans les légendes -> étiquette affichée.
INGREDIENTS = {
    "Poulet": ["poulet", "chicken", "volaille", "dinde"],
    "Bœuf": ["boeuf", "beef", "steak", "hache", "bavette", "entrecote"],
    "Porc": ["porc", "pork", "lardon", "jambon", "bacon", "chorizo", "saucisse"],
    "Agneau": ["agneau", "lamb"],
    "Poisson": ["poisson", "saumon", "salmon", "thon", "cabillaud", "colin", "truite", "dorade", "fish"],
    "Fruits de mer": ["crevette", "shrimp", "moule", "calamar", "saint-jacques", "noix de st jacques"],
    "Œufs": ["oeuf", "egg"],
    "Pâtes": ["pates", "pasta", "spaghetti", "tagliatelle", "penne", "linguine", "lasagne", "gnocchi", "ravioli"],
    "Riz": ["riz", "rice", "risotto"],
    "Pomme de terre": ["pomme de terre", "pommes de terre", "patate", "potato"],
    "Légumes": ["courgette", "aubergine", "poivron", "brocoli", "epinard", "carotte", "chou",
                "tomate", "champignon", "poireau", "potiron", "butternut", "patate douce"],
    "Légumineuses": ["lentille", "pois chiche", "haricot", "chickpea", "lentil"],
    "Fromage": ["fromage", "cheese", "parmesan", "mozzarella", "feta", "chevre", "comte", "burrata", "ricotta"],
    "Chocolat": ["chocolat", "chocolate", "cacao", "cocoa"],
    "Fruits": ["pomme", "banane", "fraise", "framboise", "citron", "mangue", "poire", "myrtille", "fruit"],
}

CATEGORIES = {
    "Dessert": ["dessert", "gateau", "cake", "cookie", "tarte sucree", "brownie", "mousse", "crumble",
                "tiramisu", "cheesecake", "muffin", "biscuit", "patisserie", "fondant", "sucre"],
    "Petit-déj": ["petit dejeuner", "petit-dej", "breakfast", "brunch", "pancake", "granola", "porridge", "crepe"],
    "Apéro": ["apero", "aperitif", "tapas", "dip", "houmous", "hummus", "toast", "bouchee"],
    "Entrée / Salade": ["entree", "salade", "salad", "veloute", "soupe", "soup"],
    "Plat": ["plat", "diner", "dinner", "curry", "gratin", "poelee", "one pot", "wok", "burger", "pizza", "tacos"],
    "Boisson": ["cocktail", "smoothie", "boisson", "drink", "jus", "latte"],
}

DIETS = {
    "Végétarien": ["vegetarien", "vegetarian", "veggie"],
    "Vegan": ["vegan", "vegetalien"],
    "Rapide": ["rapide", "express", "quick", "facile", "easy", "15 min", "10 min", "20 min", "15min", "10min"],
    "Healthy": ["healthy", "leger", "light", "proteine", "protein", "sans sucre"],
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c)).replace("œ", "oe")


def find_tags(caption: str, table: dict) -> list:
    norm = normalize(caption)
    return [tag for tag, words in table.items()
            if any(re.search(r"\b" + re.escape(w), norm) for w in words)]


def load_db() -> dict:
    if DB_FILE.exists():
        return json.loads(DB_FILE.read_text(encoding="utf-8"))
    return {}


def save_db(db: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DB_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(DB_FILE)


# --- Connexion -------------------------------------------------------------------------------

def get_loader(args) -> instaloader.Instaloader:
    L = instaloader.Instaloader(quiet=False)
    if args.browser:
        from instaloader.__main__ import import_session
        import_session(args.browser, L, None)
        L.save_session_to_file()
        return L
    if not args.login:
        sys.exit("Indique --login TON_PSEUDO (ou --browser firefox/chrome pour réutiliser ta session).")
    try:
        L.load_session_from_file(args.login)
        if L.test_login() != args.login:
            raise FileNotFoundError
        print(f"Session existante réutilisée pour {args.login}.")
    except FileNotFoundError:
        L.interactive_login(args.login)
        L.save_session_to_file()
    return L


# --- Récupération ----------------------------------------------------------------------------

def iter_feed(L, path: str):
    """Parcourt un flux paginé de l'API mobile (enregistrements ou collection)."""
    max_id = None
    while True:
        params = {"max_id": max_id} if max_id else {}
        data = L.context.get_iphone_json(path, params)
        for item in data.get("items", []):
            yield item.get("media", item)
        if not data.get("more_available") or not data.get("next_max_id"):
            return
        max_id = data["next_max_id"]


def list_collections(L) -> list:
    data = L.context.get_iphone_json("api/v1/collections/list/",
                                     {"collection_types": '["ALL_MEDIA_AUTO_COLLECTION","MEDIA"]'})
    return [(c["collection_id"], c["collection_name"], c.get("collection_media_count"))
            for c in data.get("items", [])]


def pick_thumb(media: dict):
    """Choisit une image d'environ 480 px de large (bon compromis taille/qualité)."""
    src = media
    if "image_versions2" not in src and media.get("carousel_media"):
        src = media["carousel_media"][0]
    candidates = (src.get("image_versions2") or {}).get("candidates") or []
    if not candidates:
        return None
    ok = [c for c in candidates if c.get("width", 0) >= 400]
    return min(ok, key=lambda c: c["width"])["url"] if ok else max(candidates, key=lambda c: c.get("width", 0))["url"]


def media_to_recipe(media: dict) -> dict:
    code = media["code"]
    caption = (media.get("caption") or {}).get("text") or ""
    kind = "reel" if media.get("product_type") == "clips" else "p"
    user = media.get("user") or {}
    return {
        "code": code,
        "url": f"https://www.instagram.com/{kind}/{code}/",
        "auteur": user.get("username", ""),
        "auteur_nom": user.get("full_name", ""),
        "legende": caption,
        "date": datetime.fromtimestamp(media.get("taken_at", 0), timezone.utc).strftime("%Y-%m-%d"),
        "video": media.get("media_type") == 2 or kind == "reel",
        "thumb_url": pick_thumb(media),
    }


def cmd_collections(args):
    L = get_loader(args)
    for cid, name, count in list_collections(L):
        print(f"{name}  ({count if count is not None else '?'} posts)  id={cid}")


def cmd_fetch(args):
    L = get_loader(args)
    db = load_db()
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    if args.collection:
        matches = [c for c in list_collections(L) if normalize(c[1]) == normalize(args.collection)]
        if not matches:
            names = ", ".join(c[1] for c in list_collections(L))
            sys.exit(f"Collection « {args.collection} » introuvable. Collections disponibles : {names}")
        path = f"api/v1/feed/collection/{matches[0][0]}/posts/"
        print(f"Collection « {matches[0][1]} »")
    else:
        path = "api/v1/feed/saved/posts/"
        print("Tous les posts enregistrés")

    new = known_in_a_row = 0
    for media in iter_feed(L, path):
        if "code" not in media:
            continue
        code = media["code"]
        if code in db and not args.full:
            known_in_a_row += 1
            # Les enregistrements arrivent du plus récent au plus ancien : après 20 posts déjà
            # connus d'affilée, on considère que le reste est à jour.
            if known_in_a_row >= 20:
                print("Plus rien de nouveau, arrêt.")
                break
            continue
        known_in_a_row = 0
        recipe = media_to_recipe(media)
        recipe["ajoute_le"] = db.get(code, {}).get("ajoute_le") or datetime.now().strftime("%Y-%m-%d")
        thumb_file = THUMBS_DIR / f"{code}.jpg"
        if recipe["thumb_url"] and not thumb_file.exists():
            try:
                L.context.get_and_write_raw(recipe["thumb_url"], str(thumb_file))
            except ConnectionException as err:
                print(f"  miniature indisponible pour {code} : {err}")
        db[code] = recipe
        new += 1
        print(f"+ {recipe['auteur']:<25} {recipe['legende'][:60].replace(chr(10), ' ')}")
        if new % 25 == 0:
            save_db(db)
        if args.max and new >= args.max:
            break
    save_db(db)
    print(f"{new} recette(s) ajoutée(s), {len(db)} au total. Lance maintenant : python recettes/recettes.py build")


# --- Génération de la page -------------------------------------------------------------------

def guess_title(caption: str, author: str) -> str:
    for line in caption.splitlines():
        line = re.sub(r"#\w+|@\w+", "", line).strip(" -–—:•*|")
        if len(re.sub(r"[\W_]", "", line)) >= 4:
            return line[:90] + ("…" if len(line) > 90 else "")
    return f"Recette de @{author}" if author else "Recette"


def cmd_build(args):
    db = load_db()
    if not db:
        sys.exit("Aucune recette : lance d'abord la commande fetch.")
    recipes = []
    for r in sorted(db.values(), key=lambda r: r.get("ajoute_le", ""), reverse=True):
        thumb_file = THUMBS_DIR / f"{r['code']}.jpg"
        thumb = ("data:image/jpeg;base64," + base64.b64encode(thumb_file.read_bytes()).decode()
                 if thumb_file.exists() else "")
        recipes.append({
            "code": r["code"], "url": r["url"], "auteur": r["auteur"],
            "titre": guess_title(r["legende"], r["auteur"]), "legende": r["legende"],
            "date": r["date"], "ajoute": r.get("ajoute_le", ""), "video": r["video"], "thumb": thumb,
            "ingredients": find_tags(r["legende"], INGREDIENTS),
            "categories": find_tags(r["legende"], CATEGORIES),
            "regimes": find_tags(r["legende"], DIETS),
        })
    payload = json.dumps(recipes, ensure_ascii=False).replace("</", "<\\/")
    html = TEMPLATE.read_text(encoding="utf-8").replace("/*__RECETTES__*/[]", payload)
    html = html.replace("__GENERE_LE__", datetime.now().strftime("%d/%m/%Y"))
    out = Path(args.output) if args.output else OUTPUT
    out.write_text(html, encoding="utf-8")
    print(f"{len(recipes)} recettes -> {out} ({os.path.getsize(out) / 1e6:.1f} Mo)")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("fetch", "collections"):
        s = sub.add_parser(name)
        s.add_argument("--login", help="ton pseudo Instagram")
        s.add_argument("--browser", help="importer la session depuis un navigateur (firefox, chrome, safari…)")
    f = sub.choices["fetch"]
    f.add_argument("--collection", help="nom de la collection d'enregistrements (ex. Recettes)")
    f.add_argument("--full", action="store_true", help="tout reparcourir, même les posts déjà connus")
    f.add_argument("--max", type=int, help="nombre maximum de nouveaux posts (pour tester)")
    b = sub.add_parser("build")
    b.add_argument("--output", help=f"fichier HTML de sortie (défaut : {OUTPUT.name})")
    args = p.parse_args()
    {"fetch": cmd_fetch, "collections": cmd_collections, "build": cmd_build}[args.cmd](args)


if __name__ == "__main__":
    main()
