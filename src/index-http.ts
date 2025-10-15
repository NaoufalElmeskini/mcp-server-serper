#!/usr/bin/env node

/**
 * MCP server implementation with HTTP/SSE transport that provides web search capabilities via Serper API.
 */

import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {SerperClient} from "./services/serper-client.js";
import {SerperSearchTools} from "./tools/search-tool.js";
import {SerperPrompts} from "./prompts/index.js";
import http from "node:http";
import {URL} from "node:url";

// Fallback API key from environment
const defaultApiKey = process.env.SERPER_API_KEY;

// Create MCP server
const server = new Server(
  {
    name: "Serper MCP Server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {}
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "webSearch" tool for performing web searches.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Define input schema for search tool
  const searchInputSchema = {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "Search query string (e.g., 'artificial intelligence', 'climate change solutions')"
      },
      gl: {
        type: "string",
        description: "Optional region code for search results in ISO 3166-1 alpha-2 format (e.g., 'us', 'gb', 'de')"
      },
      hl: {
        type: "string",
        description: "Optional language code for search results in ISO 639-1 format (e.g., 'en', 'es', 'fr')"
      },
      location: {
        type: "string",
        description: "Optional location for search results (e.g., 'SoHo, New York, United States', 'California, United States')"
      },
      num: {
        type: "number",
        description: "Number of results to return (default: 10)"
      },
      tbs: {
        type: "string",
        description: "Time-based search filter ('qdr:h' for past hour, 'qdr:d' for past day, 'qdr:w' for past week, 'qdr:m' for past month, 'qdr:y' for past year)"
      },
      page: {
        type: "number",
        description: "Page number of results to return (default: 1)"
      },
      autocorrect: {
        type: "boolean",
        description: "Whether to autocorrect spelling in query"
      },
      // Advanced search operators
      site: {
        type: "string",
        description: "Limit results to specific domain (e.g., 'github.com', 'wikipedia.org')"
      },
      filetype: {
        type: "string",
        description: "Limit to specific file types (e.g., 'pdf', 'doc', 'xls')"
      },
      inurl: {
        type: "string",
        description: "Search for pages with word in URL (e.g., 'download', 'tutorial')"
      },
      intitle: {
        type: "string",
        description: "Search for pages with word in title (e.g., 'review', 'how to')"
      },
      related: {
        type: "string",
        description: "Find similar websites (e.g., 'github.com', 'stackoverflow.com')"
      },
      cache: {
        type: "string",
        description: "View Google's cached version of a specific URL (e.g., 'example.com/page')"
      },
      before: {
        type: "string",
        description: "Date before in YYYY-MM-DD format (e.g., '2024-01-01')"
      },
      after: {
        type: "string",
        description: "Date after in YYYY-MM-DD format (e.g., '2023-01-01')"
      },
      exact: {
        type: "string",
        description: "Exact phrase match (e.g., 'machine learning', 'quantum computing')"
      },
      exclude: {
        type: "string",
        description: "Terms to exclude from search results as comma-separated string (e.g., 'spam,ads', 'beginner,basic')"
      },
      or: {
        type: "string",
        description: "Alternative terms as comma-separated string (e.g., 'tutorial,guide,course', 'documentation,manual')"
      }
    },
    required: ["q", "gl", "hl"],
  };

  // Return list of tools with input schemas
  return {
    tools: [
      {
        name: "google_search",
        description:
          "Tool to perform web searches via Serper API and retrieve rich results. It is able to retrieve organic search results, people also ask, related searches, and knowledge graph.",
        inputSchema: searchInputSchema,
      },
      {
        name: "scrape",
        description:
          "Tool to scrape a webpage and retrieve the text and, optionally, the markdown content. It will retrieve also the JSON-LD metadata and the head metadata.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL of the webpage to scrape.",
            },
            includeMarkdown: {
              type: "boolean",
              description: "Whether to include markdown content.",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

/**
 * Handler for the webSearch tool.
 * Performs a web search using Serper API and returns results.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Get API key from current session
  const apiKey = currentApiKey || defaultApiKey;
  if (!apiKey) {
    throw new Error("No API key available. Please provide X-API-Key header or set SERPER_API_KEY environment variable");
  }

  // Create client and tools with the API key
  const client = new SerperClient(apiKey);
  const tools = new SerperSearchTools(client);

  switch (request.params.name) {
    case "google_search": {
      const {
        q,
        gl,
        hl,
        location,
        num,
        tbs,
        page,
        autocorrect,
        // Advanced search parameters
        site,
        filetype,
        inurl,
        intitle,
        related,
        cache,
        before,
        after,
        exact,
        exclude,
        or
      } = request.params.arguments || {};

      if (!q || !gl || !hl) {
        throw new Error(
          "Search query and region code and language are required"
        );
      }

      try {
        const result = await tools.search({
          q: String(q),
          gl: String(gl),
          hl: String(hl),
          location: location as string | undefined,
          num: num as number | undefined,
          tbs: tbs as "qdr:h" | "qdr:d" | "qdr:w" | "qdr:m" | "qdr:y" | undefined,
          page: page as number | undefined,
          autocorrect: autocorrect as boolean | undefined,
          // Advanced search parameters
          site: site as string | undefined,
          filetype: filetype as string | undefined,
          inurl: inurl as string | undefined,
          intitle: intitle as string | undefined,
          related: related as string | undefined,
          cache: cache as string | undefined,
          before: before as string | undefined,
          after: after as string | undefined,
          exact: exact as string | undefined,
          exclude: exclude as string | undefined,
          or: or as string | undefined
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(`Search failed: ${error}`);
      }
    }

    case "scrape": {
      const url = request.params.arguments?.url as string;
      const includeMarkdown = request.params.arguments
        ?.includeMarkdown as boolean;
      const result = await tools.scrape({ url, includeMarkdown });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

// Handle prompts/list requests
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const apiKey = currentApiKey || defaultApiKey;
  if (!apiKey) {
    throw new Error("No API key available. Please provide X-API-Key header or set SERPER_API_KEY environment variable");
  }
  const client = new SerperClient(apiKey);
  const tools = new SerperSearchTools(client);
  const prompts = new SerperPrompts(tools);
  return prompts.listPrompts();
});

// Handle prompts/get requests
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const apiKey = currentApiKey || defaultApiKey;
  if (!apiKey) {
    throw new Error("No API key available. Please provide X-API-Key header or set SERPER_API_KEY environment variable");
  }
  const client = new SerperClient(apiKey);
  const tools = new SerperSearchTools(client);
  const prompts = new SerperPrompts(tools);
  return prompts.getPrompt(request.params.name, request.params.arguments || {});
});

/**
 * Storage for SSE transports and API keys indexed by session ID
 */
interface SessionData {
  transport: SSEServerTransport;
  apiKey?: string;
}
const sessions: Record<string, SessionData> = {};

// Current API key (set during POST /message handling)
let currentApiKey: string | undefined;

/**
 * Start the HTTP server with SSE transport.
 */
async function main() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  const httpServer = http.createServer(async (req, res) => {
    // Parse URL and query parameters
    const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const sessionId = parsedUrl.searchParams.get("sessionId")?.trim();

    // Enable CORS for testing
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Handle SSE connection (GET /sse)
    if (req.method === "GET" && pathname === "/sse") {
      console.log("[GET /sse] New SSE connection request");

      // Create SSE transport
      const transport = new SSEServerTransport("/message", res);
      const sessionId = transport.sessionId;

      console.log(`[GET /sse] Created sessionId: "${sessionId}"`);
      console.log(`[GET /sse] SessionId type: ${typeof sessionId}`);
      console.log(`[GET /sse] SessionId length: ${sessionId.length}`);

      sessions[sessionId] = { transport };
      console.log(`[GET /sse] Stored in sessions. Total sessions: ${Object.keys(sessions).length}`);
      console.log(`[GET /sse] Available sessions:`, Object.keys(sessions));

      // Clean up on connection close
      res.on("close", () => {
        console.log(`[GET /sse] SSE connection closed for session: ${sessionId}`);
        delete sessions[sessionId];
      });

      // Connect server to transport
      await server.connect(transport);
      console.log(`[GET /sse] Server connected to transport for session: ${sessionId}`);
      return;
    }

    // Handle incoming messages (POST /message?sessionId=xxx)
    if (req.method === "POST" && pathname === "/message") {
      if (!sessionId) {
          console.log("sessionId query parameter is required")
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "sessionId query parameter is required" }));
        return;
      }

      // Extract API key from header
      const apiKeyFromHeader = req.headers['x-api-key'] as string | undefined;

      console.log(`[POST /message] Received sessionId: "${sessionId}"`);
      console.log(`[POST /message] X-API-Key header:`, apiKeyFromHeader || 'NOT PROVIDED');
      console.log(`[POST /message] Available sessions:`, Object.keys(sessions));

      const session = sessions[sessionId!];
      if (!session) {
        console.log(`[POST /message] ERROR: No active session found`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: `No active session found for sessionId: ${sessionId}`,
          availableSessions: Object.keys(sessions)
        }));
        return;
      }

      // Set current API key (from header or session or default)
      currentApiKey = apiKeyFromHeader || session.apiKey || defaultApiKey;

      // Store API key in session for future requests
      if (apiKeyFromHeader) {
        session.apiKey = apiKeyFromHeader;
      }

      console.log(`[POST /message] Using API Key:`, currentApiKey ? 'YES' : 'NO');

      // Handle the message through the transport
      await session.transport.handlePostMessage(req, res);
      return;
    }

    // Handle health check
    if (req.method === "GET" && pathname === "/health") {
        console.log("Health check request received");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        activeSessions: Object.keys(sessions).length
      }));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, () => {
    console.log(`MCP Serper Server (HTTP/SSE) running on port ${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Message endpoint: http://localhost:${PORT}/message?sessionId=<sessionId>`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
