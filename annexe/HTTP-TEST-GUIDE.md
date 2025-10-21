# Guide de test du serveur MCP HTTP/SSE

Ce guide explique comment tester le serveur MCP Serper en mode HTTP/SSE.

## Démarrage du serveur

```bash
npm run start:http
```

Le serveur démarre sur le port **3000** par défaut (configurable via `PORT` env var).

## Endpoints disponibles

- **GET /sse** - Établir une connexion SSE et obtenir un sessionId
- **POST /message?sessionId=<id>** - Envoyer une requête JSON-RPC MCP
- **GET /health** - Vérifier l'état du serveur

## Méthode 1 : Test avec le client HTML (RECOMMANDÉ)

C'est la méthode la plus simple pour tester le serveur.

1. Démarrer le serveur : `npm run start:http`
2. Ouvrir `test-client.html` dans votre navigateur
3. Cliquer sur "Se connecter"
4. Utiliser les boutons pour envoyer des requêtes

## Méthode 2 : Test avec le script Node.js

```bash
node test-mcp.cjs
```

Ce script teste automatiquement :
- La connexion SSE
- L'extraction du sessionId
- L'envoi d'une requête `tools/list`

## Méthode 3 : Test avec Postman

⚠️ **IMPORTANT** : Avec Postman, vous devez garder la connexion SSE ouverte pendant que vous envoyez les requêtes POST.

### Étape 1 : Établir la connexion SSE (dans un onglet Postman)

1. Créer une nouvelle requête **GET**
2. URL : `http://localhost:3000/sse`
3. Cliquer sur **Send**
4. ⚠️ **NE PAS FERMER CET ONGLET** - Laisser la requête en cours d'exécution
5. Dans la réponse, vous verrez :
   ```
   event: endpoint
   data: /message?sessionId=d2a4755b-ec16-41be-914d-3059386ef1d7
   ```
6. Copier le **sessionId** (l'UUID après `sessionId=`)

### Étape 2 : Envoyer une requête MCP (dans un NOUVEAU onglet Postman)

**PENDANT QUE LA CONNEXION SSE EST TOUJOURS OUVERTE** :

1. Créer une nouvelle requête **POST**
2. URL : `http://localhost:3000/message?sessionId=<VOTRE_SESSION_ID>`
3. Headers :
   ```
   Content-Type: application/json
   ```
4. Body (raw JSON) :
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/list"
   }
   ```
5. Cliquer sur **Send**
6. Vous recevrez une réponse `202 Accepted`
7. La réponse complète apparaîtra dans l'onglet SSE (étape 1)

## Exemples de requêtes

### Lister les outils disponibles

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### Effectuer une recherche Google

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "google_search",
    "arguments": {
      "q": "artificial intelligence",
      "gl": "us",
      "hl": "en"
    }
  }
}
```

### Scraper une page web

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "scrape",
    "arguments": {
      "url": "https://example.com",
      "includeMarkdown": false
    }
  }
}
```

### Lister les prompts

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "prompts/list"
}
```

## Méthode 4 : Test avec curl

### Établir la connexion SSE (Terminal 1)

```bash
curl -N http://localhost:3000/sse
```

Copier le sessionId depuis la sortie.

### Envoyer une requête (Terminal 2)

⚠️ Garder le curl du Terminal 1 en cours d'exécution !

```bash
curl -X POST \
  "http://localhost:3000/message?sessionId=<VOTRE_SESSION_ID>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Pourquoi la connexion SSE doit rester ouverte ?

Le protocole MCP avec SSE fonctionne ainsi :
1. **GET /sse** : Le client établit une connexion SSE persistante
2. Le serveur crée un **transport** identifié par un **sessionId**
3. **POST /message** : Le client envoie des requêtes via POST en incluant le sessionId
4. Le serveur répond via la connexion SSE (événement `message`)
5. Si la connexion SSE est fermée, le transport est détruit et le sessionId devient invalide

C'est pourquoi avec Postman, vous devez maintenir la connexion SSE ouverte dans un onglet pendant que vous envoyez des POST dans un autre onglet.

## Logs de debug

Le serveur affiche des logs détaillés :
- `[GET /sse]` : Logs de connexion SSE
- `[POST /message]` : Logs des requêtes entrantes
- Vous pouvez voir le sessionId créé, les sessions actives, etc.

## Configuration

Vous pouvez changer le port avec la variable d'environnement `PORT` :

```bash
PORT=8080 npm run start:http
```

## Vérification de santé

```bash
curl http://localhost:3000/health
```

Réponse :
```json
{
  "status": "ok",
  "activeSessions": 1
}
```

## Dépannage

### Erreur "No active session found"

- ✅ Vérifiez que la connexion SSE est toujours ouverte
- ✅ Vérifiez que vous utilisez le bon sessionId
- ✅ Le sessionId est sensible à la casse et aux espaces

### Erreur "sessionId query parameter is required"

- ✅ Assurez-vous d'inclure `?sessionId=<id>` dans l'URL du POST

### Port déjà utilisé

- ✅ Changez le port avec `PORT=3002 npm run start:http`
- ✅ Ou tuez le processus existant
