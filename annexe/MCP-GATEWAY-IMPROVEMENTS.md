# Améliorations recommandées pour la conformité Gateway MCP

## Vue d'ensemble

Ce document présente des améliorations minimalistes pour rendre le serveur MCP Serper pleinement conforme à la **spécification MCP Transport HTTP/SSE (2025-06-18)** et optimisé pour l'intégration avec **IBM MCP Context Forge Gateway**.

Les améliorations sont classées par priorité :
- 🔴 **CRITIQUE** : Requis pour conformité complète
- 🟡 **RECOMMANDÉ** : Améliore la compatibilité et la sécurité
- 🟢 **OPTIONNEL** : Fonctionnalités avancées

## Résumé des améliorations

| # | Amélioration | Priorité | Impact |
|---|-------------|----------|---------|
| 1 | Headers MCP standardisés | 🔴 CRITIQUE | Conformité spec MCP |
| 2 | Validation Origin stricte | 🔴 CRITIQUE | Sécurité |
| 3 | Support Bearer Token OAuth2 | 🟡 RECOMMANDÉ | Authentification |
| 4 | Endpoint /mcp unifié | 🟡 RECOMMANDÉ | Compatibilité Gateway |
| 5 | Injection variables d'environnement | 🟡 RECOMMANDÉ | Multi-tenant |
| 6 | Health check étendu | 🟢 OPTIONNEL | Monitoring |
| 7 | Rate limiting | 🟢 OPTIONNEL | Protection abus |

---

## 1. Headers MCP standardisés 🔴 CRITIQUE

### Problème actuel

Le serveur ne gère pas les headers requis par la spécification MCP :
- `MCP-Protocol-Version` : Non vérifié
- `Mcp-Session-Id` : sessionId passé en query param au lieu du header
- `Accept` : Non vérifié
- `Origin` : Non validé (CORS permissif)

### Spécification MCP (2025-06-18)

```
Clients MUST include MCP-Protocol-Version header
Servers SHOULD default to version 2025-03-26 if header missing
Servers MUST validate Origin header
Sessions SHOULD use Mcp-Session-Id header (cryptographically secure)
```

### Solution proposée

Ajouter la gestion des headers dans `src/index-http.ts` :

```typescript
// Constantes
const SUPPORTED_MCP_VERSIONS = ['2025-03-26', '2025-06-18'];
const DEFAULT_MCP_VERSION = '2025-03-26';

// Fonction utilitaire pour valider les headers MCP
function validateMCPHeaders(req: http.IncomingMessage): {
  version: string;
  sessionId?: string;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Valider MCP-Protocol-Version
  const versionHeader = req.headers['mcp-protocol-version'] as string;
  const version = versionHeader || DEFAULT_MCP_VERSION;

  if (versionHeader && !SUPPORTED_MCP_VERSIONS.includes(versionHeader)) {
    errors.push(`Unsupported MCP version: ${versionHeader}. Supported: ${SUPPORTED_MCP_VERSIONS.join(', ')}`);
  }

  // 2. Récupérer Mcp-Session-Id (priorité header > query param)
  const sessionIdHeader = req.headers['mcp-session-id'] as string;
  const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionIdQuery = parsedUrl.searchParams.get("sessionId");
  const sessionId = sessionIdHeader || sessionIdQuery || undefined;

  // 3. Valider Accept header pour POST /message
  const acceptHeader = req.headers['accept'] as string;
  if (req.method === 'POST' && acceptHeader) {
    const validAccept = acceptHeader.includes('application/json') ||
                       acceptHeader.includes('text/event-stream');
    if (!validAccept) {
      errors.push('Accept header must include application/json or text/event-stream');
    }
  }

  return { version, sessionId, errors };
}
```

### Utilisation dans les handlers

```typescript
// Dans le handler POST /message
if (req.method === "POST" && pathname === "/message") {
  const { version, sessionId, errors } = validateMCPHeaders(req);

  if (errors.length > 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Invalid MCP headers",
      details: errors
    }));
    return;
  }

  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "sessionId required (Mcp-Session-Id header or sessionId query param)"
    }));
    return;
  }

  // Ajouter version dans les logs
  console.log(`[POST /message] MCP Version: ${version}, SessionId: ${sessionId}`);

  // ... reste du code
}
```

### Impact
- ✅ Conformité complète avec spec MCP 2025-06-18
- ✅ Support rétrocompatible (query param toujours accepté)
- ✅ Meilleure interopérabilité avec gateways et clients MCP
- ⚠️ Changement mineur du code (~50 lignes)

---

## 2. Validation Origin stricte 🔴 CRITIQUE

### Problème actuel

```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
```

Cela expose le serveur à des attaques CSRF et ne respecte pas la spécification MCP.

### Spécification MCP

```
Servers MUST validate the Origin header to prevent unauthorized access
```

### Solution proposée

```typescript
// Configuration des origines autorisées (via env var)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:9000',
  'https://votre-gateway.com'
];

// Fonction de validation Origin
function validateOrigin(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin;

  // Autoriser les requêtes sans Origin (ex: curl, Postman)
  if (!origin) {
    // En production, vous pouvez vouloir rejeter ces requêtes
    console.warn('[SECURITY] Request without Origin header');
    return true; // ou false en production stricte
  }

  // Vérifier si l'origine est autorisée
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    return true;
  }

  console.error(`[SECURITY] Unauthorized Origin: ${origin}`);
  return false;
}

// Dans le handler HTTP
const httpServer = http.createServer(async (req, res) => {
  // Valider Origin AVANT toute autre opération
  if (!validateOrigin(req, res)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden: Invalid Origin" }));
    return;
  }

  // Headers CORS (après validation)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Authorization");

  // ... reste du code
});
```

### Configuration

```bash
# .env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:9000,https://gateway.example.com
```

### Impact
- ✅ Protection contre CSRF
- ✅ Conformité spec MCP
- ✅ Configurable via env var
- ⚠️ Peut casser des tests existants si Origin non configuré

---

## 3. Support Bearer Token OAuth2 🟡 RECOMMANDÉ

### Justification

La gateway IBM supporte l'authentification OAuth2 Bearer token. Pour intégrer avec des systèmes sécurisés, le serveur doit valider ces tokens.

### Solution proposée

```typescript
// Configuration
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const VALID_TOKENS = process.env.VALID_TOKENS?.split(',') || [];

// Fonction de validation token
function validateBearerToken(req: http.IncomingMessage): { valid: boolean; error?: string } {
  if (!REQUIRE_AUTH) {
    return { valid: true }; // Auth désactivée
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return { valid: false, error: 'Authorization header required' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Invalid Authorization format. Expected: Bearer <token>' };
  }

  const token = match[1];

  // Validation simple (à remplacer par validation JWT en production)
  if (!VALID_TOKENS.includes(token)) {
    return { valid: false, error: 'Invalid or expired token' };
  }

  return { valid: true };
}

// Dans les handlers
const httpServer = http.createServer(async (req, res) => {
  // Valider Origin
  if (!validateOrigin(req, res)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden: Invalid Origin" }));
    return;
  }

  // Valider Bearer Token (sauf pour health check)
  if (req.url !== '/health') {
    const { valid, error } = validateBearerToken(req);
    if (!valid) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer"
      });
      res.end(JSON.stringify({ error: error || 'Unauthorized' }));
      return;
    }
  }

  // ... reste du code
});
```

### Configuration

```bash
# .env
REQUIRE_AUTH=true
VALID_TOKENS=token123,token456,prod-token-xyz
```

### Amélioration avec JWT (production)

Pour une validation JWT complète :

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'mcp-gateway';

function validateJWT(token: string): { valid: boolean; payload?: any; error?: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      algorithms: ['HS256', 'RS256']
    });
    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Impact
- ✅ Sécurisation de l'accès
- ✅ Intégration OAuth2 avec gateway
- ✅ Désactivable via env var (rétrocompatible)
- ⚠️ Nécessite gestion des tokens

---

## 4. Endpoint /mcp unifié 🟡 RECOMMANDÉ

### Justification

La spécification MCP recommande un endpoint unique pour les transports HTTP. La gateway IBM en mode Streamable HTTP utilise :
- `POST /mcp` : Envoi de requêtes
- `GET /mcp` : Établissement stream SSE

### Solution proposée

Ajouter ces endpoints **en plus** de /sse et /message (rétrocompatibilité) :

```typescript
const httpServer = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // ... validation Origin, Auth, Headers ...

  // Nouveau endpoint unifié GET /mcp (équivalent à GET /sse)
  if (req.method === "GET" && pathname === "/mcp") {
    console.log("[GET /mcp] New SSE connection request");

    const transport = new SSEServerTransport("/mcp", res);
    const sessionId = transport.sessionId;

    transports[sessionId] = transport;
    console.log(`[GET /mcp] Created sessionId: "${sessionId}"`);

    // Ajouter le sessionId dans le header de réponse (en plus du SSE event)
    res.setHeader("Mcp-Session-Id", sessionId);

    res.on("close", () => {
      console.log(`[GET /mcp] SSE connection closed for session: ${sessionId}`);
      delete transports[sessionId];
    });

    await server.connect(transport);
    console.log(`[GET /mcp] Server connected to transport for session: ${sessionId}`);
    return;
  }

  // Nouveau endpoint unifié POST /mcp (équivalent à POST /message)
  if (req.method === "POST" && pathname === "/mcp") {
    const { version, sessionId, errors } = validateMCPHeaders(req);

    if (errors.length > 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid MCP headers", details: errors }));
      return;
    }

    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "sessionId required (Mcp-Session-Id header or sessionId query param)"
      }));
      return;
    }

    const transport = transports[sessionId];
    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `No active session found for sessionId: ${sessionId}`
      }));
      return;
    }

    console.log(`[POST /mcp] Forwarding message to transport (session: ${sessionId})...`);
    await transport.handlePostMessage(req, res);
    return;
  }

  // Conserver endpoints existants /sse et /message pour rétrocompatibilité
  // ... code existant ...
});
```

### Impact
- ✅ Conformité avec spec MCP Streamable HTTP
- ✅ Compatibilité avec gateway en mode Streamable HTTP
- ✅ Rétrocompatible (endpoints /sse et /message conservés)
- ✅ sessionId retourné dans header et SSE event
- ⚠️ Code dupliqué (~100 lignes) - possibilité de refactoriser

---

## 5. Injection de variables d'environnement via headers 🟡 RECOMMANDÉ

### Justification

La gateway IBM permet d'injecter des env vars via headers HTTP (`--env-from-header`). Cela permet un déploiement multi-tenant avec une seule instance du serveur.

### Use case

```bash
python3 -m mcpgateway.translate \
  --sse-url http://localhost:3000 \
  --expose-sse \
  --env-from-header "SERPER_API_KEY:X-Serper-Key"
```

Chaque client peut passer sa propre clé API via le header `X-Serper-Key`.

### Solution proposée

```typescript
// Configuration des headers autorisés pour env vars
const ENV_HEADER_MAPPINGS: Record<string, string> = {
  'x-serper-key': 'SERPER_API_KEY',
  'x-api-key': 'SERPER_API_KEY', // Alias
  // Ajouter d'autres mappings si nécessaire
};

// Fonction pour extraire les env vars des headers
function extractEnvFromHeaders(req: http.IncomingMessage): Record<string, string> {
  const envVars: Record<string, string> = {};

  for (const [headerName, envVarName] of Object.entries(ENV_HEADER_MAPPINGS)) {
    const headerValue = req.headers[headerName.toLowerCase()];
    if (headerValue && typeof headerValue === 'string') {
      envVars[envVarName] = headerValue;
      console.log(`[ENV] Injected ${envVarName} from header ${headerName}`);
    }
  }

  return envVars;
}

// Modifier SerperClient pour accepter une clé API dynamique
class SerperClient {
  private baseApiKey: string;

  constructor(apiKey: string) {
    this.baseApiKey = apiKey;
  }

  async search(query: SearchParams, overrideApiKey?: string): Promise<SearchResult> {
    const apiKey = overrideApiKey || this.baseApiKey;

    if (!apiKey) {
      throw new Error('SERPER_API_KEY is required (env var or X-Serper-Key header)');
    }

    // Utiliser apiKey dans la requête
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    // ... reste du code
  }
}

// Dans le handler de requête
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // extra.req contient la requête HTTP avec headers
  const req = (extra as any).req as http.IncomingMessage;
  const envOverrides = extractEnvFromHeaders(req);

  switch (request.params.name) {
    case "google_search": {
      const result = await searchTools.search(
        { /* params */ },
        envOverrides.SERPER_API_KEY // Passer la clé override
      );
      // ...
    }
  }
});
```

### Modification du SSEServerTransport

Pour passer la requête HTTP au handler, il faut modifier légèrement l'architecture :

```typescript
// Stocker req avec transport
const transports: Record<string, {
  transport: SSEServerTransport;
  req: http.IncomingMessage;
}> = {};

// Dans POST /message
const session = transports[sessionId];
if (session) {
  // Attacher la requête originale pour extraction des headers
  (session.transport as any).originalRequest = req;
  await session.transport.handlePostMessage(req, res);
}
```

### Impact
- ✅ Support multi-tenant avec une seule instance
- ✅ Clés API dynamiques par requête
- ✅ Compatible avec gateway `--env-from-header`
- ⚠️ Modification architecture (~150 lignes)
- ⚠️ Nécessite modifier SerperClient et handlers

---

## 6. Health check étendu 🟢 OPTIONNEL

### Amélioration

Ajouter plus d'informations de diagnostic :

```typescript
if (req.method === "GET" && pathname === "/health") {
  const healthInfo = {
    status: "ok",
    version: "0.2.0",
    mcp: {
      protocolVersion: DEFAULT_MCP_VERSION,
      supportedVersions: SUPPORTED_MCP_VERSIONS,
      transport: "SSE",
      endpoints: {
        sse: ["/sse", "/mcp"],
        message: ["/message", "/mcp"]
      }
    },
    capabilities: {
      tools: true,
      prompts: true,
      resources: false,
      sampling: false
    },
    sessions: {
      active: Object.keys(transports).length,
      max: process.env.MAX_SESSIONS ? parseInt(process.env.MAX_SESSIONS) : null
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(healthInfo, null, 2));
  return;
}
```

### Impact
- ✅ Meilleur monitoring
- ✅ Diagnostic facilité
- ✅ Compatible avec systèmes de supervision
- ⚠️ Exposition d'informations (utiliser avec prudence)

---

## 7. Rate limiting 🟢 OPTIONNEL

### Solution proposée

```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100');

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimits.get(identifier);

  if (!entry || now > entry.resetAt) {
    // Nouvelle fenêtre
    rateLimits.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

// Dans le handler
const identifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
const rateLimit = checkRateLimit(identifier);

res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX.toString());
res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetAt).toISOString());

if (!rateLimit.allowed) {
  res.writeHead(429, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    error: "Rate limit exceeded",
    resetAt: new Date(rateLimit.resetAt).toISOString()
  }));
  return;
}
```

### Impact
- ✅ Protection contre abus
- ✅ Headers standards X-RateLimit-*
- ✅ Configurable via env var
- ⚠️ Stockage en mémoire (pas de partage multi-instance)

---

## Plan d'implémentation recommandé

### Phase 1 : Conformité critique 🔴
1. Headers MCP standardisés
2. Validation Origin stricte

**Effort** : 1-2 jours
**Priorité** : IMMÉDIATE

### Phase 2 : Sécurité et compatibilité 🟡
3. Support Bearer Token OAuth2
4. Endpoint /mcp unifié

**Effort** : 2-3 jours
**Priorité** : HAUTE

### Phase 3 : Multi-tenant 🟡
5. Injection variables d'environnement

**Effort** : 3-4 jours
**Priorité** : MOYENNE

### Phase 4 : Observabilité 🟢
6. Health check étendu
7. Rate limiting

**Effort** : 1-2 jours
**Priorité** : BASSE

---

## Exemple de configuration finale

### .env
```bash
# API Keys
SERPER_API_KEY=default_key_here

# Server
PORT=3000

# MCP Protocol
MCP_DEFAULT_VERSION=2025-03-26

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:9000,https://gateway.example.com
REQUIRE_AUTH=true
VALID_TOKENS=token123,prod-token-xyz
# ou JWT
JWT_SECRET=your-jwt-secret
JWT_ISSUER=mcp-gateway

# Rate Limiting
RATE_LIMIT_MAX=100

# Sessions
MAX_SESSIONS=1000
```

### Commande gateway avec toutes les fonctionnalités

```bash
python3 -m mcpgateway.translate \
  --sse-url http://localhost:3000/mcp \
  --expose-sse \
  --port 9000 \
  --auth-header "Authorization: Bearer prod-token-xyz" \
  --env-from-header "SERPER_API_KEY:X-Serper-Key" \
  --cors-origin "https://app.example.com"
```

---

## Ressources et références

### Spécifications
- [MCP Specification - Transport Layer (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [RFC 6750 - OAuth 2.0 Bearer Token](https://datatracker.ietf.org/doc/html/rfc6750)

### IBM Gateway
- [MCP Context Forge Gateway Documentation](https://ibm.github.io/mcp-context-forge/using/mcpgateway-translate/)
- [Gateway GitHub Repository](https://github.com/ibm/mcp-context-forge)

### Bonnes pratiques
- [OWASP - CORS Security](https://owasp.org/www-community/attacks/CSRF)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

## Tests de validation

Après implémentation, valider avec ces tests :

### Test 1 : Headers MCP
```bash
curl -i http://localhost:3000/mcp \
  -H "MCP-Protocol-Version: 2025-06-18"
```

Attendu : SSE stream avec sessionId

### Test 2 : Origin validation
```bash
curl -i http://localhost:3000/mcp \
  -H "Origin: https://unauthorized.com"
```

Attendu : 403 Forbidden

### Test 3 : Bearer Token
```bash
curl -i http://localhost:3000/mcp \
  -H "Authorization: Bearer invalid-token"
```

Attendu : 401 Unauthorized

### Test 4 : Env var injection
```bash
curl -i http://localhost:3000/mcp \
  -H "X-Serper-Key: custom-api-key-123"
```

Attendu : Utilisation de la clé custom dans les logs

### Test 5 : Rate limiting
```bash
for i in {1..101}; do
  curl -s http://localhost:3000/health
done
```

Attendu : 429 Too Many Requests à la 101ème requête

---

## Conclusion

Ces améliorations rendent le serveur MCP Serper :
- ✅ **Conforme** à la spécification MCP 2025-06-18
- ✅ **Sécurisé** avec validation Origin et Bearer Token
- ✅ **Compatible** avec IBM MCP Context Forge Gateway
- ✅ **Scalable** avec support multi-tenant
- ✅ **Moniteur** avec health checks étendus
- ✅ **Protégé** contre les abus (rate limiting)

**Prioriser les améliorations 🔴 et 🟡** pour une intégration production-ready avec la gateway.
