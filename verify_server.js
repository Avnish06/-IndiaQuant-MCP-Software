import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, 'dist/index.js');
console.log(`Starting server at ${serverPath}...`);

const server = spawn('node', [serverPath], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'inherit']
});

let output = '';

server.stdout.on('data', (data) => {
  const str = data.toString();
  console.log(`STDOUT Received: ${str}`);
  output += str;
  
  if (output.includes('tools')) {
    console.log('Successfully received tool list! Server is working.');
    server.kill();
    process.exit(0);
  }
});

server.stderr.on('data', (data) => {
  console.error(`STDERR Received: ${data.toString()}`);
});

// Send initialize request
const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }
};

// Send tools/list request
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {}
};

setTimeout(() => {
  console.log('Sending initialize...');
  server.stdin.write(JSON.stringify(initializeRequest) + '\n');
}, 1000);

setTimeout(() => {
  console.log('Sending tools/list...');
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 2000);

setTimeout(() => {
  console.log('Test timed out.');
  server.kill();
  process.exit(1);
}, 10000);
