# Mettre Griboulade en ligne gratuitement

Ce guide part de zéro et aboutit à un lien public à envoyer à tes amis. Compte 30 à 45 minutes la
première fois. Aucun paiement, aucun serveur à acheter.

## Vue d'ensemble

| Élément | Hébergeur | Ce qu'il fait |
| --- | --- | --- |
| Le site (dossier `client/`) | **Cloudflare Workers** (ou Pages, ou Vercel) | Sert les pages du jeu |
| Le serveur de jeu (`server/`) | **Render** | Salons, temps réel (Socket.IO / WebSocket) |
| La base de données | **Neon** (PostgreSQL) | Salons en cours, dessins, parties terminées |
| Le code | **GitHub** | Source des déploiements automatiques |

```
 Tes amis ──► https://griboulade.goubill-arthur.workers.dev  (site, Cloudflare Workers)
                     │  WebSocket + HTTPS
                     ▼
              https://griboulade-serveur.onrender.com        (serveur de jeu, Render)
                     │
                     ▼
              PostgreSQL chez Neon                           (salons, dessins, parties)
```

### Ce que valent vraiment les offres gratuites

Points vérifiés en novembre 2026. Les offres gratuites changent souvent : jette un œil à la page
tarifaire de chaque service au moment de t'inscrire.

| Service | Limites utiles à connaître | Conséquence pour le jeu |
| --- | --- | --- |
| **Render** (service web gratuit) | S'endort après 15 min sans trafic, réveil en 1 min environ ; 750 heures par mois ; disque effacé à chaque redémarrage | La première personne qui ouvre le jeu après une pause attend jusqu'à une minute (un message l'explique). Pendant une partie, les messages WebSocket comptent comme du trafic : le serveur reste éveillé. Rien n'est stocké sur son disque. |
| **Neon** (plan Free) | 1 Go par projet, 100 heures de calcul par mois, mise en veille après 5 min d'inactivité, pas de facturation de dépassement | Un dessin pèse 10 à 60 Ko : 1 Go représente des milliers de parties. Les parties de plus de 30 jours sont supprimées automatiquement (`GAME_RETENTION_DAYS`). |
| **Cloudflare Workers** (plan Free) | Le site n'est fait que de fichiers statiques, servis sans passer par du code Worker | Largement suffisant pour jouer entre amis. |
| **Cloudflare Pages** (plan Free) | 500 compilations par mois, 20 000 fichiers | Largement suffisant : le site fait une dizaine de fichiers. |
| **Vercel** (plan Hobby) | Réservé à un usage personnel non commercial | Convient pour jouer entre amis. |

Trois choses que je n'ai **pas** pu vérifier depuis mon environnement de travail, et que tu dois
contrôler toi-même :

- le site render.com n'était pas accessible : les chiffres ci-dessus viennent de sa documentation telle
  que citée par les moteurs de recherche. Un article tiers évoque une modification des offres Render le
  1ᵉʳ août 2026 (bande passante réduite) que je n'ai pas pu lire ;
- la base PostgreSQL *gratuite de Render* expire 30 jours après sa création : c'est pour cela que ce
  guide utilise Neon et pas elle ;
- l'exigence ou non d'une carte bancaire à l'inscription peut varier selon le pays.

---

## Étape 0 — Vérifier que tout marche chez toi

Installe [Node.js 22](https://nodejs.org) et [Git](https://git-scm.com), puis dans le dossier du projet :

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

Ouvre <http://localhost:5173>, crée un salon, et rejoins-le depuis deux fenêtres de navigation privée.

## Étape 1 — Publier le code sur GitHub

1. Crée un compte sur <https://github.com> si besoin.
2. Clique sur **New repository**. Nom : `griboulade`. Laisse-le vide (pas de README), public ou privé.
3. Dans le dossier du projet :

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "Griboulade : première version"
```

```bash
git remote add origin https://github.com/TON-PSEUDO/griboulade.git
```

```bash
git push -u origin main
```

Le fichier `.gitignore` empêche d'envoyer `node_modules` et tes fichiers `.env` (qui contiennent des
secrets). Ne mets jamais l'adresse de ta base de données dans le dépôt.

## Étape 2 — Créer la base de données (Neon)

1. Inscris-toi sur <https://neon.com> (connexion avec GitHub possible).
2. **Create project** — nom `griboulade`, région **AWS Europe (Frankfurt)** pour être près du serveur.
3. Sur le tableau de bord, clique sur **Connect** et copie la *connection string*. Elle ressemble à :

```
postgresql://neondb_owner:MOT_DE_PASSE@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Garde-la de côté : c'est la valeur de `DATABASE_URL`. Les tables sont créées automatiquement au premier
démarrage du serveur, il n'y a rien d'autre à faire.

## Étape 3 — Héberger le serveur de jeu (Render)

1. Inscris-toi sur <https://render.com> avec ton compte GitHub.
2. **New → Blueprint**, choisis ton dépôt `griboulade`. Render lit le fichier `render.yaml` et propose
   le service `griboulade-serveur` (offre *Free*, région Francfort).
3. Render te demande deux valeurs :
   - `DATABASE_URL` : colle la chaîne de connexion Neon ;
   - `CLIENT_ORIGIN` : mets provisoirement `*` (on le remplacera à l'étape 5).
4. Valide. Le premier déploiement prend quelques minutes.
5. Note l'adresse du service, par exemple `https://griboulade-serveur.onrender.com`, et ouvre
   `https://griboulade-serveur.onrender.com/health`. Tu dois voir :

```json
{"ok":true,"store":"postgres","rooms":0,"uptime":12}
```

`"store":"postgres"` confirme que la base est branchée. Si tu lis `"memory"`, l'adresse de la base est
absente ou fausse (regarde l'onglet **Logs**).

<details>
<summary>Sans Blueprint : création manuelle du service</summary>

**New → Web Service**, choisis le dépôt, puis :

| Réglage | Valeur |
| --- | --- |
| Language | Node |
| Region | Frankfurt |
| Root Directory | *(vide)* |
| Build Command | `npm ci --include=dev && npm run build:server` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

Variables d'environnement : `NODE_ENV=production`, `NODE_VERSION=22`, `DATABASE_URL`, `CLIENT_ORIGIN`.

</details>

## Étape 4 — Héberger le site

### Option A — Cloudflare Workers (configuration utilisée)

C'est ce que Cloudflare propose désormais par défaut quand on clique sur **Create** : le projet est un
*Worker* qui sert les fichiers du site. Le fichier `wrangler.jsonc`, à la racine du dépôt, lui indique
quoi envoyer :

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "griboulade",
  "compatibility_date": "2026-11-01",
  "assets": {
    "directory": "./client/dist",
    "not_found_handling": "single-page-application"
  }
}
```

> Sans ce fichier, le déploiement échoue avec : *« The Cloudflare application detection logic has been
> run in the root of a workspace instead of targeting a specific project »*. Le dépôt contient deux
> projets (`client/` et `server/`) et Cloudflare ne sait pas lequel déployer.

1. Inscris-toi sur <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Import a repository**, choisis le dépôt `griboulade`.
3. Dans le projet : **Settings → Build → Build configuration** :

| Réglage | Valeur |
| --- | --- |
| Build command | `npm run build:client` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Build watch paths | *(laisser par défaut)* |

4. Toujours dans **Settings → Build**, juste en dessous, bloc **Variables and secrets** (celui de la
   section *Build*, pas celui des variables d'exécution plus haut dans la page) → **+ Add** :
   - `VITE_SERVER_URL` = l'adresse Render de l'étape 3, **sans** barre oblique finale
     (ex. `https://griboulade-serveur.onrender.com`).

   Inutile d'ajouter `NODE_VERSION` : le fichier `.node-version` du dépôt fixe déjà Node 22.
5. **Deployments** → **Retry** sur le dernier déploiement pour que la variable soit prise en compte.
6. L'adresse du site s'affiche en haut de la page du projet (bouton **Visit**) ou dans
   **Settings → Domains & Routes**. Ici :

```
https://griboulade.goubill-arthur.workers.dev
```

Les liens directs (`/rejoindre/ABCDE`, `/galerie/…`) fonctionnent grâce au réglage
`"not_found_handling": "single-page-application"` de `wrangler.jsonc`. Le fichier
`client/public/.assetsignore` (une seule ligne : `_redirects`) empêche Workers de lire le fichier
`_redirects` prévu pour Pages, qu'il refuse avec l'erreur *« Infinite loop detected in this rule »*.

### Option A bis — Cloudflare Pages

Si tu préfères Pages (adresse en `.pages.dev`), crée le projet via **Workers & Pages → Create → Pages →
Connect to Git** (lien *« Looking to deploy Pages? »* en bas de l'écran de création). Le fichier
`wrangler.jsonc` n'est alors pas utilisé.

| Réglage | Valeur |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build:client` |
| Build output directory | `client/dist` |
| Root directory | *(vide)* |

Variable d'environnement : `VITE_SERVER_URL` (adresse Render, sans barre oblique finale). Le fichier
`client/public/_redirects` fait fonctionner les liens directs.

### Option B — Vercel

1. Inscris-toi sur <https://vercel.com> avec GitHub, puis **Add New → Project** et importe le dépôt.
2. Laisse **Root Directory** à la racine : le fichier `vercel.json` fournit déjà la commande de
   compilation, le dossier de sortie et la redirection des liens directs.
3. Ajoute la variable `VITE_SERVER_URL` (adresse Render, sans barre oblique finale), puis **Deploy**.

> `VITE_SERVER_URL` est lue **au moment de la compilation**. Si tu la modifies, relance un déploiement
> du site pour qu'elle soit prise en compte.

## Étape 5 — Relier le site et le serveur

Le serveur n'accepte que les sites que tu autorises.

1. Sur Render : service `griboulade-serveur` → **Environment**.
2. Remplace la valeur de `CLIENT_ORIGIN` par l'adresse exacte de ton site, sans barre oblique finale :

```
https://griboulade.goubill-arthur.workers.dev
```

   Plusieurs adresses se séparent par des virgules, et `*` sert de joker pour un sous-domaine (utile
   pour les aperçus de Cloudflare Pages, par exemple) :

```
https://griboulade.goubill-arthur.workers.dev,https://*.griboulade.pages.dev
```

3. **Save** : Render redémarre le service.

### Vérification

- Ouvre ton site, crée un salon : le code à 5 lettres apparaît.
- Ouvre le lien d'invitation sur ton téléphone (en 4G, pour vérifier que ça marche hors de chez toi).
- Lancez une partie à trois, jusqu'à la galerie finale.
- Rouvre `…onrender.com/health` : `rooms` vaut 1 pendant la partie.

## Étape 6 — Inviter tes amis

Le lien à partager est celui de ton site (`https://griboulade.goubill-arthur.workers.dev`). Dans la salle d'attente, le
bouton **Inviter** envoie directement un lien qui amène au bon salon ; sinon, dicte le code à 5 lettres.

À savoir : après 15 minutes sans joueur, le serveur gratuit s'endort. La première personne qui arrive
voit « Le serveur se réveille… » pendant une minute au plus, puis tout est instantané.

## Mettre à jour le jeu

```bash
git add .
```

```bash
git commit -m "Ma modification"
```

```bash
git push
```

Render et Cloudflare (ou Vercel) redéploient tout seuls. Les salons en cours sont sauvegardés à
l'arrêt du serveur et restaurés au redémarrage : les joueurs sont reconnectés automatiquement.

---

## Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| « Le serveur se réveille… » pendant une minute | Mise en veille de Render | Normal sur l'offre gratuite. Attends. |
| « Serveur injoignable » en permanence | `VITE_SERVER_URL` absente, fausse, ou site non recompilé | Corrige la variable chez Cloudflare/Vercel puis relance un déploiement du site. |
| Erreur « CORS » dans la console du navigateur (F12) | `CLIENT_ORIGIN` ne correspond pas à l'adresse du site | Copie l'adresse exacte du site (avec `https://`, sans `/` final) dans `CLIENT_ORIGIN`. |
| `/health` affiche `"store":"memory"` | Base non branchée | Vérifie `DATABASE_URL` sur Render ; lis les **Logs**. |
| « Partie introuvable » dans l'historique | Partie de plus de 30 jours, ou serveur sans base | Augmente `GAME_RETENTION_DAYS`, branche une base. |
| Page blanche sur `/rejoindre/ABCDE` | Redirection des liens directs absente | Vérifie `wrangler.jsonc` (Cloudflare Workers), `client/public/_redirects` (Cloudflare Pages) ou `vercel.json` (Vercel). |
| Cloudflare : *« application detection logic has been run in the root of a workspace »* | Pas de `wrangler.jsonc` à la racine du dépôt | Ajoute le fichier décrit à l'étape 4, option A. |
| Cloudflare : *« Invalid _redirects configuration… Infinite loop detected »* | Workers lit le `_redirects` prévu pour Pages | Vérifie que `client/public/.assetsignore` existe et contient `_redirects`. |
| La compilation échoue sur Cloudflare | Version de Node trop ancienne | Vérifie que `.node-version` (valeur `22`) est à la racine, ou ajoute la variable de build `NODE_VERSION=22`. |
| Erreur de connexion à la base avec `DATABASE_SSL=verify` | Certificat non reconnu | Remets `DATABASE_SSL=require`. |

---

## Si un hébergeur gratuit tombe ou dépasse ses quotas

Le projet est conçu pour que chaque brique soit remplaçable sans toucher au code.

### Le site est indisponible

- Passe de Cloudflare à Vercel (ou l'inverse) : étape 4, puis ajoute la nouvelle adresse à
  `CLIENT_ORIGIN`. Un fichier `netlify.toml` est aussi fourni pour Netlify.
- **Ou supprime la dépendance au site séparé** avec le mode « tout-en-un » : le serveur sert lui-même
  le site. Sur Render, remplace la *Build Command* par :

```bash
npm ci --include=dev && npm run build
```

  et ne définis pas `VITE_SERVER_URL`. Le jeu est alors disponible directement à l'adresse
  `…onrender.com`, sans CORS à régler. C'est aussi la configuration la plus simple si tu ne veux gérer
  qu'un seul service.

### La base de données est indisponible ou pleine

- Le jeu **reste jouable sans base** : si la connexion échoue au démarrage, le serveur bascule en
  mémoire. On perd seulement l'historique et la reprise après redémarrage.
- Pour changer de fournisseur, remplace simplement `DATABASE_URL`. Tout PostgreSQL convient. Avec
  **Supabase** (500 Mo gratuits, mise en pause après une semaine sans activité) : *Project Settings →
  Database → Connection string*, choisis le mode **Session pooler**.
- Pour libérer de la place, baisse `GAME_RETENTION_DAYS` (par exemple à `7`).

### Le serveur de jeu est indisponible ou a épuisé ses heures

- **Autre hébergeur de conteneurs** : le `Dockerfile` fourni construit une image « tout-en-un » qui
  fonctionne partout où Docker est accepté. Koyeb propose une instance gratuite, mais les informations
  que j'ai trouvées se contredisent sur l'obligation d'enregistrer une carte bancaire : vérifie à
  l'inscription. Variables à définir : `DATABASE_URL` (et rien d'autre).
- **Plan de secours sans aucun hébergeur** — ton ordinateur fait serveur le temps d'une soirée :

```bash
npm run build
```

```bash
npm start
```

  puis, dans un autre terminal, ouvre un tunnel public gratuit avec
  [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  (aucun compte requis) :

```bash
cloudflared tunnel --url http://localhost:3001
```

  La commande affiche une adresse `https://….trycloudflare.com` : envoie-la à tes amis. Elle reste
  valable tant que la commande tourne.

### Limites à garder en tête

- Un seul serveur gratuit suffit pour des dizaines de salons simultanés, mais l'architecture garde les
  salons actifs en mémoire sur **une seule instance** : ne configure pas plusieurs instances en parallèle.
- Les identifiants de partie et de dessin sont longs et aléatoires, mais une galerie est lisible par
  toute personne qui en possède le lien. Ne dessinez rien de confidentiel.
