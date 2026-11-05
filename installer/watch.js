// 看门：游戏关了（端口没了）就把跟着游戏一起开的本地模型、配音窗口也关掉
// 用法（启动游戏.bat / Mac 的 启动游戏.command 里调用）：node watch.js 7788 llm tts   —— 后面只写这次是游戏顺手开的那几个
const { spawn, execSync, execFileSync } = require('child_process');
const net = require('net');

// 先把自己挪到后台（不挂在黑窗口上），这样关黑窗口不会把看门的也关掉
if (!process.env.ECI_WATCH) {
  spawn(process.execPath, [__filename, ...process.argv.slice(2)], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ECI_WATCH: '1' } }).unref();
  process.exit(0);
}

const port = Number(process.argv[2]) || 7788;
const started = process.argv.slice(3);
const BAT = { llm: '启动本地模型.bat', tts: '启动配音.bat' };
const PORTS = { llm: 8080, tts: 9880 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = p => new Promise(r => { const s = net.connect(p, '127.0.0.1'); s.setTimeout(1500); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); }); });
const ps = cmd => execSync('powershell -NoProfile -EncodedCommand ' + Buffer.from(cmd, 'utf16le').toString('base64'), { encoding: 'utf8', windowsHide: true });

// Mac：按端口找到在听的程序关掉；还没开始听（模型还在读）的，按程序路径再找一遍
function stopMac(w) {
  try { for (const pid of execFileSync('lsof', ['-nP', `-iTCP:${PORTS[w]}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split(/\s+/)) if (pid) process.kill(Number(pid)); } catch {}
  if (w === 'llm') { try { execFileSync('pkill', ['-f', '/llm/llama.cpp/llama-server'], { stdio: 'ignore' }); } catch {} }
}

function stop(w) {
  if (process.platform === 'darwin') return stopMac(w);
  // 关掉开它的那个黑窗口（连同里面的模型 / 配音）；再按端口补一刀
  try { ps(`Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*${BAT[w]}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`); } catch {}
  try {
    const pid = (execSync(`netstat -ano | findstr ":${PORTS[w]} " | findstr LISTENING`, { encoding: 'utf8', windowsHide: true }).trim().split(/\s+/).pop());
    if (pid && pid !== '0') execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
  } catch {}
}

(async () => {
  if (!started.length) return;
  // 等游戏起来（最多 2 分钟）
  for (let i = 0; i < 60 && !(await alive(port)); i++) await sleep(2000);
  // 游戏开着就一直等；连着 4 次（约 10 秒）都连不上才算关了（切换手机连接时游戏会重开一下端口）
  let miss = 0;
  while (miss < 4) { await sleep(2500); miss = (await alive(port)) ? 0 : miss + 1; }
  for (const w of started) if (BAT[w]) stop(w);
})();
