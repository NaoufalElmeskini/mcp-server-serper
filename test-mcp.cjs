// Script de test pour simuler un client MCP
const http = require('http');

let sessionId = null;

// Étape 1: Établir la connexion SSE
function connectSSE() {
  return new Promise((resolve, reject) => {
    console.log('Connecting to SSE endpoint...');

    const req = http.get('http://localhost:3000/sse', (res) => {
      console.log('SSE connection established, status:', res.statusCode);

      res.on('data', (chunk) => {
        const data = chunk.toString();
        console.log('Received SSE data:', data);

        // Extract sessionId from the endpoint event
        const match = data.match(/sessionId=([a-f0-9-]+)/);
        if (match) {
          sessionId = match[1];
          console.log('Extracted sessionId:', sessionId);
          resolve(sessionId);
        }
      });

      res.on('error', (err) => {
        console.error('SSE error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });
  });
}

// Étape 2: Envoyer une requête MCP
function sendMCPRequest(sessionId, request) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(request);

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/message?sessionId=${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    console.log('\nSending POST request to:', options.path);
    console.log('Request body:', data);

    const req = http.request(options, (res) => {
      console.log('Response status:', res.statusCode);

      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        console.log('Response body:', responseData);
        resolve(responseData);
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// Test principal
async function main() {
  try {
    // Connexion SSE
    await connectSSE();

    // Attendre un peu pour s'assurer que tout est prêt
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Envoyer une requête pour lister les tools
    const response = await sendMCPRequest(sessionId, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    });

    console.log('\n✅ Test completed successfully!');

    // Garder la connexion ouverte quelques secondes
    console.log('\nKeeping connection alive for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
