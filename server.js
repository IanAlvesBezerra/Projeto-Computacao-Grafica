/**
 * server.js
 * Servidor Web local com suporte a HTTP e HTTPS (0.0.0.0)
 * para testes no PC e em celulares na mesma rede Wi-Fi / LAN.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;

// Mapeamento de tipos MIME
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

/**
 * Obtém todos os endereços IPv4 locais não-internos
 */
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignora loopback e endereços IPv6
      if (iface.family === 'IPv4' && !iface.internal) {
        // Ignora redes virtuais comuns se houver outra rede física (ex: Wi-Fi)
        ips.push({
          interface: name,
          ip: iface.address
        });
      }
    }
  }

  // Prioriza Wi-Fi ou Ethernet
  ips.sort((a, b) => {
    const aScore = a.interface.toLowerCase().includes('wi-fi') || a.interface.toLowerCase().includes('eth') ? -1 : 1;
    const bScore = b.interface.toLowerCase().includes('wi-fi') || b.interface.toLowerCase().includes('eth') ? -1 : 1;
    return aScore - bScore;
  });

  return ips;
}

/**
 * Manipulador de requisições HTTP/HTTPS
 */
function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Rota de API: informações de rede para exibir na tela do PC
  if (pathname === '/api/network-info') {
    const ips = getLocalIps();
    const primaryIp = ips[0] ? ips[0].ip : 'localhost';
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      primaryIp,
      allIps: ips,
      httpPort: HTTP_PORT,
      httpsPort: HTTPS_PORT,
      httpUrl: `http://${primaryIp}:${HTTP_PORT}`,
      httpsUrl: `https://${primaryIp}:${HTTPS_PORT}`
    }));
    return;
  }

  // Servir arquivos estáticos
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, pathname);

  // Previne Directory Traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Arquivo não encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Inicia servidor HTTP
const httpServer = http.createServer(handleRequest);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  // Inicia servidor HTTPS se certificados existirem
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');

  let hasHttps = false;
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      const httpsServer = https.createServer(httpsOptions, handleRequest);
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        printBanner(true);
      });
      hasHttps = true;
    } catch (e) {
      console.warn('Não foi possível iniciar HTTPS:', e.message);
      printBanner(false);
    }
  } else {
    printBanner(false);
  }
});

function printBanner(hasHttps) {
  const ips = getLocalIps();
  const primaryIp = ips[0] ? ips[0].ip : 'localhost';

  console.log('\n===============================================================');
  console.log('       ASCII CAM FILTER - SERVIDOR LOCAL ATIVO 🚀              ');
  console.log('===============================================================');
  console.log('💻 No seu computador (navegador local):');
  console.log(`   👉 http://localhost:${HTTP_PORT}`);
  if (hasHttps) {
    console.log(`   👉 https://localhost:${HTTPS_PORT}`);
  }

  console.log('\n📱 No seu celular (conectado ao mesmo Wi-Fi):');
  if (hasHttps) {
    console.log(`   🔥 https://${primaryIp}:${HTTPS_PORT} (RECOMENDADO PARA CÂMERA)`);
    console.log('   ℹ️  Nota no celular: Como o certificado é local autoassinado,');
    console.log('      o navegador exibirá um aviso. Toque em "Avançado" -> "Continuar".');
  }
  console.log(`   🌐 http://${primaryIp}:${HTTP_PORT}`);

  if (ips.length > 1) {
    console.log('\nOutros IPs de rede detectados:');
    ips.slice(1).forEach(i => {
      console.log(`   - ${i.interface}: http://${i.ip}:${HTTP_PORT}`);
    });
  }
  console.log('===============================================================\n');
}
