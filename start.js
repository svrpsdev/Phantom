const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting PHANTOM BEC Framework...');

if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
  console.error('❌ node_modules not found! Run npm install first.');
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
  console.log('🔧 Starting backend...');
  const backend = spawn('node', ['proxy_server.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || 3000 }
  });

  console.log('🌐 Starting Next.js...');
  const frontend = spawn('npm', ['run', 'start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || 3000 }
  });

  process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    backend.kill();
    frontend.kill();
    process.exit();
  });
}
