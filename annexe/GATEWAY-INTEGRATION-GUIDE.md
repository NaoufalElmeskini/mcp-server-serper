# Guide d'intégration - Serveur MCP Serper avec IBM MCP Context Forge Gateway

## Vue d'ensemble

Ce document technique décrit l'intégration du **Serveur MCP Serper** avec la **IBM MCP Context Forge Gateway** (`mcpgateway.translate`). Le serveur Serper fournit des capacités de recherche web et de scraping via l'API Serper, exposé via un transport HTTP/SSE conforme au protocole MCP.

### Architecture du serveur

- **Langage**: TypeScript/Node.js
- **SDK**: `@modelcontextprotocol/sdk` v0.6.0
- **Transport**: SSEServerTransport (Server-Sent Events)
- **Protocole**: JSON-RPC 2.0
- **Port par défaut**: 3000 (configurable via `PORT` env var)

## Endpoints disponibles

### 1. GET /sse
**Établissement de connexion SSE**

Crée une connexion Server-Sent Events persistante et génère un identifiant de session unique.

**Requête**:
```http
GET /sse HTTP/1.1
Host: localhost:3000
```

**Réponse**:
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: endpoint
data: /message?sessionId=d2a4755b-ec16-41be-914d-3059386ef1d7

```

**Points clés**:
- Le `sessionId` est un UUID v4 généré côté serveur
- La connexion doit rester ouverte pour maintenir la session active
- Les réponses aux requêtes POST sont envoyées via ce stream SSE
- La déconnexion entraîne la destruction du transport et l'invalidation du sessionId

### 2. POST /message
**Envoi de requêtes JSON-RPC**

Envoie des requêtes MCP au serveur en utilisant le sessionId obtenu via SSE.

**Requête**:
```http
POST /message?sessionId=d2a4755b-ec16-41be-914d-3059386ef1d7 HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Réponse**:
```http
HTTP/1.1 202 Accepted
```

La réponse complète est envoyée via la connexion SSE établie avec GET /sse :

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}

```

**Codes d'erreur**:
- `400 Bad Request`: sessionId manquant dans query parameter
- `404 Not Found`: session invalide ou expirée

### 3. GET /health
**Vérification de l'état du serveur**

Endpoint de santé pour monitoring et diagnostics.

**Requête**:
```http
GET /health HTTP/1.1
Host: localhost:3000
```

**Réponse**:
```json
{
  "status": "ok",
  "activeSessions": 2
}
```

## Méthodes MCP supportées

Le serveur implémente les méthodes MCP suivantes selon la spécification JSON-RPC 2.0 :

### 1. tools/list
Liste tous les outils disponibles.

**Requête**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Réponse**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "google_search",
        "description": "Tool to perform web searches via Serper API...",
        "inputSchema": {
          "type": "object",
          "properties": {
            "q": { "type": "string", "description": "Search query string" },
            "gl": { "type": "string", "description": "Region code (ISO 3166-1 alpha-2)" },
            "hl": { "type": "string", "description": "Language code (ISO 639-1)" },
            ...
          },
          "required": ["q", "gl", "hl"]
        }
      },
      {
        "name": "scrape",
        "description": "Tool to scrape a webpage and retrieve content...",
        "inputSchema": {
          "type": "object",
          "properties": {
            "url": { "type": "string", "description": "URL to scrape" },
            "includeMarkdown": { "type": "boolean", "description": "Include markdown" }
          },
          "required": ["url"]
        }
      }
    ]
  }
}
```

### 2. tools/call
Exécute un outil spécifique.

**Exemple - Recherche Google**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "google_search",
    "arguments": {
      "q": "artificial intelligence trends 2025",
      "gl": "us",
      "hl": "en",
      "num": 10
    }
  }
}
```

**Réponse**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"organic\":[...],\"knowledgeGraph\":{...},\"peopleAlsoAsk\":[...]}"
      }
    ]
  }
}
```

**Exemple - Scraping de page web**:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "scrape",
    "arguments": {
      "url": "https://example.com/article",
      "includeMarkdown": true
    }
  }
}
```

### 3. prompts/list
Liste tous les prompts disponibles.

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "prompts/list"
}
```

### 4. prompts/get
Récupère un prompt spécifique avec ses arguments.

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "prompts/get",
  "params": {
    "name": "search_prompt",
    "arguments": { ... }
  }
}
```

## Configuration et déploiement

### Variables d'environnement requises

```bash
SERPER_API_KEY=your_serper_api_key_here  # OBLIGATOIRE
PORT=3000                                  # OPTIONNEL (défaut: 3000)
```

### Démarrage du serveur

**Mode développement**:
```bash
npm install
npm run build
npm run start:http
```

**Mode production avec Docker**:
```bash
docker build -t mcp-server-serper .
docker run -e SERPER_API_KEY=xxx -p 3000:3000 mcp-server-serper
```

### Commande de démarrage
```bash
node build/index-http.js
```

## Intégration avec IBM MCP Context Forge Gateway

La gateway `mcpgateway.translate` peut exposer ce serveur HTTP/SSE de deux manières :

### Option 1 : Mode SSE direct (recommandé)

Si le serveur est déjà en cours d'exécution sur `http://localhost:3000` :

```bash
python3 -m mcpgateway.translate \
  --sse-url http://localhost:3000 \
  --expose-sse \
  --port 9000
```

Cela expose le serveur Serper via la gateway sur le port 9000.

### Option 2 : Mode stdio avec exposition SSE

Si vous préférez démarrer le serveur via la gateway (mode stdio à SSE) :

```bash
python3 -m mcpgateway.translate \
  --stdio "node /path/to/mcp-server-serper/build/index.js" \
  --expose-sse \
  --port 9000
```

**Note**: Cette option utilise le mode stdio (index.js) et non le mode HTTP (index-http.js).

### Configuration avec authentification

Pour intégrer avec authentification OAuth2 :

```bash
python3 -m mcpgateway.translate \
  --sse-url http://localhost:3000 \
  --expose-sse \
  --port 9000 \
  --auth-header "Authorization: Bearer YOUR_TOKEN"
```

### Configuration multi-tenant

Pour injecter des variables d'environnement dynamiques via headers HTTP :

```bash
python3 -m mcpgateway.translate \
  --sse-url http://localhost:3000 \
  --expose-sse \
  --port 9000 \
  --env-from-header "SERPER_API_KEY:X-Serper-Key"
```

Cela permet de passer différentes clés API Serper via le header `X-Serper-Key` dans les requêtes.

## Flux de communication

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│   Gateway   │      │  MCP Serper  │      │   Serper API     │
│  (Python)   │      │  HTTP/SSE    │      │                  │
└──────┬──────┘      └──────┬───────┘      └────────┬─────────┘
       │                    │                       │
       │ 1. GET /sse        │                       │
       │───────────────────>│                       │
       │                    │                       │
       │ 2. SSE stream      │                       │
       │    + sessionId     │                       │
       │<───────────────────│                       │
       │                    │                       │
       │ 3. POST /message   │                       │
       │    ?sessionId=xxx  │                       │
       │    {tools/call}    │                       │
       │───────────────────>│                       │
       │                    │                       │
       │ 4. 202 Accepted    │                       │
       │<───────────────────│                       │
       │                    │                       │
       │                    │ 5. API Request        │
       │                    │──────────────────────>│
       │                    │                       │
       │                    │ 6. API Response       │
       │                    │<──────────────────────│
       │                    │                       │
       │ 7. SSE message     │                       │
       │    {result}        │                       │
       │<───────────────────│                       │
       │                    │                       │
```

## Gestion des sessions

### Cycle de vie d'une session

1. **Création** : GET /sse génère un UUID unique
2. **Stockage** : Le transport est stocké en mémoire dans `transports[sessionId]`
3. **Utilisation** : POST /message utilise le sessionId pour router les messages
4. **Destruction** : Déconnexion SSE supprime le transport de la mémoire

### Considérations importantes

- **Pas de persistance** : Les sessions sont stockées en mémoire uniquement
- **Pas de partage entre instances** : Chaque instance du serveur a ses propres sessions
- **Timeout** : Pas de timeout automatique (la session reste active tant que SSE est connecté)
- **Scalabilité** : Pour un déploiement multi-instance, utiliser un load balancer avec sticky sessions

## Tests et validation

### Test 1 : Vérification de disponibilité

```bash
curl http://localhost:3000/health
```

Réponse attendue :
```json
{"status":"ok","activeSessions":0}
```

### Test 2 : Connexion SSE et envoi de requête

**Terminal 1** - Établir connexion SSE :
```bash
curl -N http://localhost:3000/sse
```

Copier le sessionId de la sortie.

**Terminal 2** - Envoyer requête :
```bash
curl -X POST \
  "http://localhost:3000/message?sessionId=VOTRE_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

La réponse apparaît dans Terminal 1.

### Test 3 : Via la gateway

Si la gateway est configurée sur le port 9000 :

```bash
# Connexion SSE via gateway
curl -N http://localhost:9000/sse

# Envoi de requête via gateway
curl -X POST \
  "http://localhost:9000/message?sessionId=XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Sécurité

### CORS
Actuellement, le serveur autorise toutes les origines (`Access-Control-Allow-Origin: *`). Pour la production, configurez des origines spécifiques :

```javascript
// Dans index-http.ts
res.setHeader("Access-Control-Allow-Origin", "https://votre-gateway.com");
```

### Variables sensibles
- La `SERPER_API_KEY` doit être sécurisée (secrets manager, vault)
- Ne jamais exposer la clé API dans les logs ou réponses

### Validation
- Validation des entrées dans les handlers de tools
- Gestion des erreurs pour éviter les fuites d'informations

## Performance et monitoring

### Métriques à surveiller

1. **Nombre de sessions actives** : Disponible via GET /health
2. **Latence des requêtes Serper API** : Non implémenté (à ajouter si nécessaire)
3. **Taux d'erreur** : Surveiller les logs serveur
4. **Utilisation mémoire** : Important car les sessions sont en mémoire

### Logs

Le serveur produit des logs détaillés :
```
[GET /sse] New SSE connection request
[GET /sse] Created sessionId: "d2a4755b-ec16-41be-914d-3059386ef1d7"
[POST /message] Received sessionId: "d2a4755b-ec16-41be-914d-3059386ef1d7"
[POST /message] Forwarding message to transport...
```

## Limitations actuelles

1. **Pas de persistance des sessions** : Redémarrage du serveur invalide toutes les sessions
2. **Pas de support multi-instance natif** : Nécessite sticky sessions avec load balancer
3. **CORS permissif** : Autorise toutes les origines (à restreindre en production)
4. **Pas de rate limiting** : Pas de protection contre les abus
5. **Headers MCP non standard** : sessionId via query param plutôt que header `Mcp-Session-Id`

## Dépannage

### Erreur : "No active session found"
- ✅ Vérifier que la connexion SSE est toujours ouverte
- ✅ Vérifier le sessionId (sensible à la casse, pas d'espaces)
- ✅ Vérifier les logs serveur pour voir les sessions actives

### Erreur : "sessionId query parameter is required"
- ✅ Inclure `?sessionId=XXX` dans l'URL POST

### Erreur : "SERPER_API_KEY environment variable is required"
- ✅ Définir la variable d'environnement avant le démarrage

### Port déjà utilisé
- ✅ Changer le port : `PORT=3001 npm run start:http`
- ✅ Ou arrêter le processus existant

## Ressources

- [Documentation MCP officielle](https://modelcontextprotocol.io)
- [IBM MCP Context Forge Gateway](https://ibm.github.io/mcp-context-forge/using/mcpgateway-translate/)
- [Spécification MCP Transport HTTP/SSE](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Repository GitHub du serveur](https://github.com/marcopesani/mcp-server-serper)

## Support

Pour toute question ou problème d'intégration :
1. Vérifier les logs détaillés du serveur
2. Tester avec le client HTML fourni (`test-client.html`)
3. Consulter le guide de test (`HTTP-TEST-GUIDE.md`)
4. Ouvrir une issue sur le repository GitHub
