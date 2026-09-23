#!/usr/bin/env node
/* CLI utility for SocialLive: start, status, doctor, stop */

import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

function usage() {
  console.log(`
SocialLive CLI — self-hosted live streaming control platform

Usage: social-live <command> [options]

Commands:
  start         Start the server (daemonizes if --daemon)
  stop          Stop the running server
  status        Show server status and diagnostics
  doctor        Run environment diagnostics
  setup         Interactive first-run setup (admin account)
  help          Show this help

Environment (or .env file):
  DATA_DIR           Data directory (default: ./data)
  APP_HOST           Bind address (default: 0.0.0.0)
  APP_PORT           Port (default: 3000)
  FFMPEG_PATH        Path to ffmpeg binary
  FFPROBE_PATH       Path to ffprobe binary
  SESSION_SECRET     Session cookie secret
  ENCRYPTION_KEY     Master key for credential encryption

Examples:
  social-live start --daemon
  social-live status
  social-live doctor
`);
  process.exit(0);
}

function findPid() {
  const pidPath = join(process.env.DATA_DIR || './data', 'app.pid');
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, 'utf8').trim());
    try {
      process.kill(pid, 0); // signal 0 = existence check
      return pid;
    } catch {
      return null;
    }
  }
  return null;
}

async function runDoctor() {
  console.log('🩺 SocialLive Diagnostics\n');
  const { loadConfig } = await import('../apps/server/dist/config.js');
  const { Database, createRepos } = await import('../packages/database/dist/index.js');
  const { resolveFfmpeg, resolveFfprobe } = await import('../packages/streaming/dist/index.js');
  const { runDiagnostics } = await import('../apps/server/dist/services/doctor.js');
  const { systemInfo } = await import('../apps/server/dist/services/doctor.js');

  const config = loadConfig();
  const db = new Database(config.dbPath);
  const repos = createRepos(db);

  const info = systemInfo(config, resolveFfmpeg(config.ffmpegPath)?.version ?? null);
  console.log(`  Name:      ${info.name} ${info.version}`);
  console.log(`  Node:      ${info.nodeVersion}`);
  console.log(`  Platform:  ${info.platform}`);
  console.log(`  Data dir:  ${info.dataDir}`);
  console.log(`  FFmpeg:    ${info.ffmpegPath ?? 'NOT FOUND'} (${info.ffmpegVersion ?? '?'})`);
  console.log(`  FFprobe:   ${info.ffprobePath ?? 'NOT FOUND'}`);
  console.log(`  HTTPS:     ${info.https ? 'yes (production)' : 'no (dev)'}`);
  console.log('');

  const checks = await runDiagnostics(config, repos, { checkPort: false });
  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}`);
    if (!check.ok) allOk = false;
    console.log(`      ${check.detail}`);
    if (check.hint) console.log(`      💡 ${check.hint}`);
  }
  console.log('');
  if (allOk) console.log('All checks passed. Ready to stream!');
  else console.log('Some checks failed. Fix the issues above before starting.');

  db.close();
  process.exit(allOk ? 0 : 1);
}

async function startServer(daemon = false) {
  const pid = findPid();
  if (pid) {
    console.error(`Server already running (PID ${pid})`);
    process.exit(1);
  }

  const env = { ...process.env };
  if (daemon) {
    const child = spawn('node', ['apps/server/dist/index.js'], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env,
    });
    child.unref();
    console.log('SocialLive started in background. Check logs in DATA_DIR/logs/');
    return;
  }

  // foreground
  const { buildApp } = await import('../apps/server/dist/app.js');
  const app = await buildApp();
  const config = (await import('../apps/server/dist/config.js')).loadConfig();
  await app.listen({ port: config.port, host: config.host });
  console.log(`SocialLive running at http://${config.host}:${config.port}`);
  // Keep process alive
  process.on('SIGTERM', () => app.close());
  process.on('SIGINT', () => app.close());
}

async function stopServer() {
  const pid = findPid();
  if (!pid) {
    console.log('No running server found');
    return;
  }
  console.log(`Stopping server (PID ${pid})...`);
  process.kill(pid, 'SIGTERM');
  let waited = 0;
  while (waited < 5000) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 200));
      waited += 200;
    } catch {
      break;
    }
  }
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
    console.log('Force-killed');
  } catch {
    console.log('Stopped gracefully');
  }
}

async function showStatus() {
  const pid = findPid();
  if (!pid) {
    console.log('Server: STOPPED');
    return;
  }
  console.log(`Server: RUNNING (PID ${pid})`);
  const config = (await import('../apps/server/dist/config.js')).loadConfig();
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/health`);
    const data = await res.json();
    console.log(`Health:   ${data.status}`);
  } catch {
    console.log('Health:   unreachable');
  }
}

async function interactiveSetup() {
  const readline = await import('node:readline/promises');
  const { stdin: input, stdout: output } = process;
  const rl = readline.createInterface({ input, output });

  console.log('\n👋 Welcome to SocialLive setup!\n');
  console.log('Create your local administrator account.\n');

  const username = await rl.question('Username: ');
  const email = await rl.question('Email (optional): ');
  const password = await rl.question('Password (min 8 chars): ', { mask: '*' });
  const confirm = await rl.question('Confirm password: ', { mask: '*' });
  rl.close();

  if (password !== confirm) {
    console.error('Passwords do not match');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const config = (await import('../apps/server/dist/config.js')).loadConfig();
  const { buildApp } = await import('../apps/server/dist/app.js');
  const app = await buildApp();
  const { repos } = app.sl;

  if (repos.users.count() > 0) {
    console.error('Administrator account already exists. Use "social-live stop" and remove DATA_DIR to reset.');
    await app.close();
    process.exit(1);
  }

  const { hashPassword } = await import('../apps/server/dist/lib/crypto.js');
  repos.users.create({ username, email: email || null, passwordHash: hashPassword(password) });
  console.log('\n✅ Administrator account created!');
  console.log('Run "social-live start" to launch the server.');
  await app.close();
}

const cmd = process.argv[2]?.toLowerCase() ?? 'help';
switch (cmd) {
  case 'start':
    startServer(process.argv.includes('--daemon')).catch((e) => { console.error(e); process.exit(1); });
    break;
  case 'stop':
    stopServer().catch((e) => { console.error(e); process.exit(1); });
    break;
  case 'status':
    showStatus().catch((e) => { console.error(e); process.exit(1); });
    break;
  case 'doctor':
    runDoctor().catch((e) => { console.error(e); process.exit(1); });
    break;
  case 'setup':
    interactiveSetup().catch((e) => { console.error(e); process.exit(1); });
    break;
  default:
    usage();
}