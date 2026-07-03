const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting PHANTOM BEC Framework...');

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;

if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
  console.error('❌ node_modules not found!');
  process.exit(1);
}

const nextBuildPath = path.join(process.cwd(), '.next');
if (!fs.existsSync(nextBuildPath)) {
  console.log('📦 Building Next.js...');
  const build = spawn('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env } });
  build.on('close', (code) => {
    if (code !== 0) process.exit(code);
    startServices();
  });
} else {
  startServices();
}

function startServices() {
  // Start backend on port 3001
  console.log(`🔧 Starting backend on port ${BACKEND_PORT}...`);
  const backend = spawn('node', ['proxy_server.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: BACKEND_PORT }
  });

  // Start Next.js on port 3000 (main port)
  console.log(`🌐 Starting Next.js on port ${FRONTEND_PORT}...`);
  const frontend = spawn('npx', ['next', 'start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: FRONTEND_PORT }
  });

  console.log(`✅ Backend: ${BACKEND_PORT}, Frontend: ${FRONTEND_PORT}`);

  process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    backend.kill();
    frontend.kill();
    process.exit();
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    backend.kill();
    frontend.kill();
    process.exit();
  });
}
