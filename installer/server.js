// 恶雌模拟器安装器：本地网页（端口 7790）+ 这个 Node 小服务。不依赖任何 npm 包。
// 管的东西：安装位置 / 游戏本体 / 语言模型 / 配音 / 留言板 / 卸载。状态记在 %LOCALAPPDATA%\EciSimulator\state.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync, execFileSync, execFile } = require('child_process');

const REPO = 'mxxs109-ops/eci-simulator';
const BRANCH = 'main';
const PORT = Number(process.env.ECI_PORT) || 7790;
// Mac：走下面各处的 MAC 分支；MAC_TEST=1 在 Windows 上假装是 Mac（只用来看页面，不跑 Mac 的命令）
const MAC = process.platform === 'darwin' || process.env.MAC_TEST === '1';
const HOME = process.env.ECI_HOME || (MAC ? path.join(os.homedir(), 'Library', 'Application Support', 'EciSimulator')
  : path.join(process.env.LOCALAPPDATA || os.homedir(), 'EciSimulator'));   // ECI_HOME：测试时换个地方   // 安装器自己住的地方
const STATE_FILE = path.join(HOME, 'state.json');
const NODE = process.execPath;
const HERE = __dirname;

const LLAMA_TAG = 'b12102';
const MODEL_REPO = 'HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive';
const MODELS = {
  full: { file: 'Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf', gb: 23.4, label: '完整版（Q4_K_P，23.4GB）' },
  lite: { file: 'Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-IQ3_M.gguf', gb: 15.4, label: '轻量版（IQ3_M，15.4GB）' },
};
const INDEX_TTS_SHA = 'd9e41aac89fd00b3d71497fddb287b7f24613712';

// ---------- 小工具 ----------
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2), 'utf8'); };
const defaultRoot = () => path.join(os.homedir(), 'EciSimulator');
const TEST = !!process.env.ECI_HOME;   // 测试模式：不碰真桌面、真防火墙、真 Tailscale
// state.json 坏了（读不出来）：改名备份，页面顶上报红条；在她重新选安装位置之前不往里写，免得悄悄换成默认目录
let stateBroken = false;
function state() {
  let saved = {};
  if (fs.existsSync(STATE_FILE)) {
    try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
    catch {
      const t = new Date().toISOString().replace(/[:.]/g, '-');
      try { fs.renameSync(STATE_FILE, path.join(HOME, `state.broken-${t}.json`)); } catch {}
      stateBroken = true;
    }
  }
  return { root: defaultRoot(), game: null, llm: null, tts: null, ...saved };
}
function saveState(patch, force) {
  if (stateBroken && !force) throw new Error('安装信息坏了，已备份：先去「安装位置」选一下装在哪');
  const s = { ...state(), ...patch }; writeJson(STATE_FILE, s); return s;
}
const dirs = (s = state()) => ({ game: path.join(s.root, 'game'), llm: path.join(s.root, 'llm'), tts: path.join(s.root, 'tts') });
// PowerShell 的输出按 UTF-8 读：不然中文路径（选文件夹、桌面在中文用户名下）会变成乱码
const ps = cmd => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${cmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8', windowsHide: true }).trim();
// 不卡住安装器的版本：命令用 -EncodedCommand 传（中文、引号都不怕），等它跑完再回来
function psAsync(cmd) {
  return new Promise((ok, no) => {
    const enc = Buffer.from('[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + cmd, 'utf16le').toString('base64');
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString('utf8')); p.stderr.on('data', d => err += d.toString('utf8'));
    p.on('error', no);
    p.on('close', code => code === 0 ? ok(out.trim()) : no(new Error(err.trim().slice(0, 300) || 'PowerShell 退出码 ' + code)));
  });
}
const desktop = () => {
  if (TEST) { const d = path.join(HOME, 'Desktop-test'); fs.mkdirSync(d, { recursive: true }); return d; }   // 测试时图标放这里，不动真桌面
  if (MAC) return path.join(os.homedir(), 'Desktop');
  try { return ps('[Environment]::GetFolderPath(\'Desktop\')'); } catch { return path.join(os.homedir(), 'Desktop'); }
};
// 在浏览器里打开网址：Windows 用 rundll32（cmd 的 start 有 8191 字的长度限制，网址里的 & 也会被 cmd 吃掉）
function openUrl(u) {
  if (MAC) return macOpen(u);
  try { spawn('rundll32', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
}
function writeBat(file, lines) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, ['@echo off', 'chcp 65001 >nul', ...lines, ''].join('\r\n'), 'utf8'); }
// Mac 的启动脚本：.command 双击会在终端里跑
function writeSh(file, lines) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, ['#!/bin/bash', ...lines, ''].join('\n'), 'utf8'); fs.chmodSync(file, 0o755); }
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";   // 给 bash 用的单引号
// Mac 上用 open 打开网址、文件
const macOpen = (...a) => { try { execFile('open', a, () => {}); } catch {} };
// 桌面图标在 Mac 上叫什么（卸载时一起删）
const MAC_ICONS = ['恶雌模拟器.command', '恶雌模拟器安装器.app', '恶雌模拟器安装器.command'];
// 桌面图标：用 shortcut.ps1（IShellLinkW），中文名字、中文路径在任何语言的 Windows 上都行
function shortcut(name, target, args, icon) {
  if (MAC) {   // Mac：桌面放一个 .command，双击就跑 target
    const f = path.join(desktop(), name + '.command');
    return writeSh(f, [`exec ${shq(target)}`]);
  }
  const lnk = path.join(desktop(), name + '.lnk');
  const r = require('child_process').spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'shortcut.ps1'),
    lnk, target, args || '', path.dirname(target), icon || ''], { windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('建桌面图标失败：' + (r.stderr || '').slice(0, 200));
}
const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch {} return !fs.existsSync(p); };   // 返回真的删没了没有
// 被占着删不掉：等一秒再删，最多 5 次
async function rmrfRetry(p) { for (let i = 0; i < 5; i++) { if (rmrf(p)) return true; await new Promise(r => setTimeout(r, 1000)); } return false; }
// 端口上的程序是不是我们装的：模型、配音看程序文件在不在安装文件夹里；游戏问它自己的文件夹
function portPid(port) {
  if (MAC) { try { return Number(execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/)[0]) || 0; } catch { return 0; } }
  try { return Number(ps(`(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`)) || 0; } catch { return 0; }
}
// 游戏端口：测试模式可以用 ECI_GAME_PORT 换一个（沙盒里的假游戏），绝不去碰 7788 上她真的游戏
const GPORT = (TEST && Number(process.env.ECI_GAME_PORT)) || 7788;
const PORTS = { game: GPORT, llm: 8080, tts: 9880 };
// 游戏端口上的是不是我们装的这一份（问它自己的文件夹）
async function ourGameUp() {
  try {
    const st = await (await fetch(`http://127.0.0.1:${GPORT}/api/status`, { signal: AbortSignal.timeout(1500) })).json();
    return !!st.gameDir && path.resolve(st.gameDir).toLowerCase() === path.resolve(dirs().game).toLowerCase();
  } catch { return false; }
}
// 本地模型 / 配音端口上的程序是不是我们装的：是就返回进程号，不是（或者没人在听）返回 0
async function ourPid(w) {
  const dir = path.resolve(dirs()[w]).toLowerCase() + path.sep;
  if (MAC) {   // Mac：启动脚本里写的是绝对路径，看命令行里有没有安装文件夹
    const pid = portPid(PORTS[w]); if (!pid) return 0;
    try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).toLowerCase().includes(dir) ? pid : 0; } catch { return 0; }
  }
  try {
    const out = await psAsync(`$p=(Get-NetTCPConnection -LocalPort ${PORTS[w]} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if ($p) { "$p|" + (Get-Process -Id $p).Path }`);
    const [pid, exe] = out.split('|');
    return exe && exe.toLowerCase().startsWith(dir) ? Number(pid) : 0;
  } catch { return 0; }
}
// 我们的东西现在开着没有（只看端口不够：7788 / 8080 上可能是她别的游戏、自己开的模型）
async function ourRunning() {
  const [game, llm, tts] = await Promise.all([ourGameUp(), up('http://127.0.0.1:8080/health').then(u => u && ourPid('llm').then(Boolean)), up('http://127.0.0.1:9880/health').then(u => u && ourPid('tts').then(Boolean))]);
  return { game, llm: !!llm, tts: !!tts };
}
// 按命令行关掉我们开的黑窗口（taskkill /T 连里面跑的程序一起关）：
// 「启动游戏.bat」停在 pause 上、占着游戏文件夹，换存档、卸载会失败；本地模型、配音的窗口；看门的 watch.js。只认我们自己文件夹里的
const LAUNCH = { game: () => path.join(dirs().game, MAC ? '启动游戏.command' : '启动游戏.bat'), llm: () => path.join(dirs().llm, MAC ? '启动本地模型.command' : '启动本地模型.bat'),
  tts: () => path.join(dirs().tts, '启动配音.bat'), watch: () => path.join(HERE, 'watch.js') };
async function killWindows(which) {
  const pats = which.map(w => LAUNCH[w] && LAUNCH[w]()).filter(Boolean);
  if (!pats.length) return;
  if (MAC) {   // Mac：命令行里带这些路径的都停掉（游戏窗口是终端，进程没了窗口就空了）
    for (const p of [...pats, ...(which.includes('llm') ? [path.join(dirs().llm, 'llama.cpp', 'llama-server')] : [])]) { try { execFileSync('pkill', ['-f', p], { stdio: 'ignore' }); } catch {} }
    return;
  }
  const like = pats.map(p => `$_.CommandLine -like '*${p.replace(/'/g, "''").replace(/[[\]*?`]/g, '`$&')}*'`).join(' -or ');
  try { await psAsync(`Get-CimInstance Win32_Process -Filter "Name='cmd.exe' or Name='node.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and (${like}) } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`); } catch {}
}
// 关掉我们的东西；which 里可以有 game / llm / tts / watch（watch = 跟着游戏开的看门程序，卸载时才一起关）
async function stopOurs(...which) {
  await killWindows(which);
  for (const w of which) {
    if (w === 'watch') continue;
    if (w === 'game') { if (await ourGameUp()) { const pid = portPid(GPORT); if (pid) { try { process.kill(pid); } catch {} } } continue; }
    const pid = await ourPid(w);
    if (pid) { try { process.kill(pid); } catch {} }
  }
  await new Promise(r => setTimeout(r, 1500));
}
// ---------- 后台任务（下载、安装）：网页每秒来问进度 ----------
const jobs = {};   // name → { step, pct, log[], done, error }
// 正在跑的下载 / 安装子进程（curl、uv、python…）：卸载时要全部停掉
const kids = new Set();
let cancelling = false;   // 卸载开始了：别的任务看到它就停下，不再往下装
const track = p => { kids.add(p); p.on('close', () => kids.delete(p)); return p; };
const stopIfCancelled = () => { if (cancelling) throw new Error('已经停下（要卸载）'); };
function killKids() {
  for (const p of kids) {
    if (MAC) { try { execFileSync('pkill', ['-KILL', '-P', String(p.pid)], { stdio: 'ignore' }); } catch {} try { process.kill(p.pid, 'SIGKILL'); } catch {} continue; }
    try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch {}
  }
}
// 任务叫什么（拒绝时告诉她在等哪个）
const JOB_NAME = { game: '游戏下载 / 更新', llm: '本地模型安装', llmtest: '本地模型试运行', tts: '配音安装', ollama: 'Ollama 一键安装', lmstudio: 'LM Studio 一键安装',
  tailscale: 'Tailscale 安装', uninstall: '卸载', location: '搬家', saves: '存档操作' };
const MOVERS = ['location', 'saves'];   // 搬家、换存档：要动整个文件夹，和别的任务不能一起跑
// 能不能开始这个任务：搬家 / 存档要等别的都做完；下载安装要等搬家 / 存档做完；卸载不等（它会先把别的停下）
function guard(name) {
  if (stateBroken && name !== 'location') throw new Error('安装信息坏了，已备份：先去「安装位置」选一下装在哪');
  if (jobs[name] && !jobs[name].done) throw new Error('「' + (JOB_NAME[name] || name) + '」正在进行中');
  if (name === 'uninstall') return;
  const running = Object.keys(jobs).filter(n => !jobs[n].done && n !== name);
  const block = MOVERS.includes(name) ? running[0] : running.find(n => MOVERS.includes(n) || n === 'uninstall');
  if (block) throw new Error('等「' + (JOB_NAME[block] || block) + '」做完再来');
}
// 安装器自己重启（安装器文件被更新了）：等 2 秒让旧的退出、端口空出来，再开新的；页面那边会自己重新加载
function restartSelf() {
  const js = path.join(HERE, 'server.js'), env = { ...process.env, NO_OPEN: '1' };
  if (MAC) spawn('/bin/sh', ['-c', 'sleep 2; exec "$0" "$1"', NODE, js], { detached: true, stdio: 'ignore', env }).unref();
  else spawn('cmd', ['/c', `ping -n 3 127.0.0.1 >nul & "${NODE}" "${js}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env }).unref();
  server.close();
  process.exit(0);
}
function job(name, fn) {
  guard(name);
  const j = jobs[name] = { step: '准备中', pct: 0, log: [], done: false, error: '' };
  let lastKey = '';
  const say = (step, pct) => {
    j.step = step; if (pct != null) j.pct = pct;
    const line = `${new Date().toLocaleTimeString()} ${step}`, key = step.split('：')[0];
    if (key === lastKey && /\d+ (MB|GB)/.test(step)) j.log[j.log.length - 1] = line; else j.log.push(line);   // 下载进度只更新最后一行
    lastKey = key; if (j.log.length > 200) j.log.shift();
  };
  fn(say).then(() => { j.msg = j.step; j.done = true; j.pct = 100; say('完成'); }).catch(e => { j.done = true; j.error = e.message; say('出错：' + e.message); })
    .finally(() => {   // 先让页面看到「完成」，等别的任务也做完，再重启
      if (!restartAfterJob) return;
      j.restart = true;
      const later = () => (Object.values(jobs).some(x => !x.done) ? setTimeout(later, 3000) : restartSelf());
      setTimeout(later, 2500);
    });
  return j;
}
// 大小写成人看得懂的：1GB 以下用 MB
const size = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';   // 网慢时速度不到 1MB，写 KB，别显示成 0
const dur = sec => sec >= 3600 ? Math.floor(sec / 3600) + ' 小时 ' + Math.round(sec % 3600 / 60) + ' 分' : sec >= 60 ? Math.round(sec / 60) + ' 分钟' : Math.max(1, Math.round(sec)) + ' 秒';
// 断线续传下载：用系统自带的 curl（Windows 是 curl.exe），按文件大小算进度。
// opt.from / opt.to：这次下载占整个进度条的哪一段；opt.estimate：服务器不告诉总大小时（GitHub 打包下载）按这个估
async function download(url, file, say, label, opt = {}) {
  const from = opt.from ?? 0, to = opt.to ?? 100;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let total = 0;
  try { const h = await fetch(url, { method: 'HEAD', redirect: 'follow' }); total = Number(h.headers.get('content-length')) || 0; } catch {}
  if (total && fs.existsSync(file) && fs.statSync(file).size === total) return say(`${label}：已经下好了`, to);
  const guess = total || opt.estimate || 0;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const ok = await new Promise(resolve => {
      stopIfCancelled();
      const p = track(spawn(MAC ? 'curl' : 'curl.exe', ['-L', '-C', '-', '--retry', '5', '--connect-timeout', '30', '-s', '-o', file, url], { windowsHide: true }));
      let last = fs.existsSync(file) ? fs.statSync(file).size : 0, speed = 0;
      const t = setInterval(() => {
        const got = fs.existsSync(file) ? fs.statSync(file).size : 0;
        speed = speed ? speed * 0.7 + (got - last) * 0.3 : got - last; last = got;   // 每秒多少字节，平滑一下
        const part = guess ? Math.min(0.99, got / guess) : 0;
        const left = total && speed > 0 ? '，还要约 ' + dur((total - got) / speed) : '';
        say(`${label}：${size(got)}${total ? ' / ' + size(total) : guess ? ' / 约 ' + size(guess) : ''}${speed > 0 ? '，' + size(speed) + '/秒' : ''}${left}`,
          guess ? Math.floor(from + (to - from) * part) : null);
      }, 1000);
      p.on('close', code => { clearInterval(t); resolve(code === 0); });
    });
    if (ok && (!total || fs.statSync(file).size >= total)) return;
    stopIfCancelled();
    say(`${label}：第 ${attempt} 次断线，10 秒后接着下`);
    await new Promise(r => setTimeout(r, 10000));
    stopIfCancelled();
  }
  throw new Error(label + ' 下载失败，检查一下网络再试');
}
// 解压：用 .NET 的 ZipFile 按 UTF-8 读文件名（Windows 自带的 tar 在日文、英文系统上读不了中文文件名）
// 先解到临时文件夹再合并进去，目标文件夹里已经有东西也不怕
async function unzip(zip, dest) {
  const tmp = dest.replace(/[\\/]+$/, '') + '.unzip-tmp';
  rmrf(tmp);
  const q = s => "'" + s.replace(/'/g, "''") + "'";
  if (MAC) await run('ditto', ['-x', '-k', zip, tmp], {});   // Mac 自带的 ditto，中文文件名也没事
  else await psAsync(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${q(zip)}, ${q(tmp)}, [Text.Encoding]::UTF8)`);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(tmp, dest, { recursive: true, force: true });
  rmrf(tmp);
}
function run(cmd, args, opts, say) {
  return new Promise((resolve, reject) => {
    stopIfCancelled();
    const p = track(spawn(cmd, args, { windowsHide: true, ...opts }));
    let tail = '';
    const eat = d => { tail = (tail + d.toString('utf8')).slice(-3000); const l = tail.trim().split(/\r?\n/).pop(); if (l && say) say(l.slice(0, 160)); };
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} 退出码 ${code}：${tail.slice(-400)}`)));
  });
}

// ---------- 0. 安装位置 ----------
async function pickFolder() {
  if (MAC) {   // 点「取消」时 osascript 会报错：当作没选
    return new Promise(ok => execFile('osascript', ['-e', 'activate', '-e', 'POSIX path of (choose folder with prompt "选一个文件夹，游戏和模型都装在这里面")'], { encoding: 'utf8' }, (e, out) => ok(e ? '' : String(out).trim().replace(/\/+$/, ''))));
  }
  return psAsync("Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='选一个文件夹，游戏和模型都装在这里面'; $f.ShowNewFolderButton=$true; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}");
}
function freeGB(p) {
  if (MAC) {   // df 要一个已经有的文件夹：往上找
    try {
      let d = path.resolve(p); while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
      const cols = execFileSync('df', ['-k', d], { encoding: 'utf8' }).trim().split('\n').pop().trim().split(/\s+/);
      return Math.floor(Number(cols[3]) * 1024 / 1e9);
    } catch { return null; }
  }
  try { const drive = path.parse(path.resolve(p)).root.replace(/[\\:]/g, ''); return Math.floor(Number(ps(`(Get-PSDrive ${drive}).Free`)) / 1e9); } catch { return null; }
}
// 安装信息坏了之后重新选了位置：看看那里已经装了什么，照着记回去（不去下载、不搬东西）
function rebuildState(root) {
  const d = dirs({ root }), patch = { root, game: null, llm: null, tts: null };
  if (isGame(d.game)) patch.game = { version: readJson(path.join(d.game, 'version.json'), {}).version || '?', at: new Date().toISOString() };
  const llmScript = path.join(d.llm, MAC ? '启动本地模型.command' : '启动本地模型.bat');
  if (fs.existsSync(llmScript)) {
    const file = (() => { try { return fs.readdirSync(path.join(d.llm, 'models')).find(n => n.endsWith('.gguf')); } catch { return null; } })();
    const tier = Object.keys(MODELS).find(k => MODELS[k].file === file) || 'lite';
    patch.llm = { tier, build: MAC ? 'metal' : null, file, ctx: null };
  }
  if (fs.existsSync(path.join(d.tts, '启动配音.bat'))) patch.tts = { at: new Date().toISOString() };
  return patch;
}
async function moveRoot(to, say) {
  to = path.resolve(to);
  if (stateBroken) {
    say('照新位置重新记一下装了什么');
    saveState({ ...rebuildState(to), pendingCfg: null }, true);
    stateBroken = false;
    if (state().game) writeLaunchers(); else if (state().tts) writeTtsBat();
    return say('记好了：' + to);
  }
  const s = state();
  const from = s.root;
  if (to.toLowerCase() === path.resolve(from).toLowerCase()) return;
  if (to.toLowerCase().startsWith(path.resolve(from).toLowerCase() + path.sep)) throw new Error('不能搬到原来文件夹的里面');
  if (fs.existsSync(from) && (s.game || s.llm || s.tts)) {
    say('先关掉正在运行的游戏、模型和配音');
    await stopOurs('game', 'watch', 'llm', 'tts');
    fs.mkdirSync(to, { recursive: true });
    for (const name of ['game', 'saves', 'template', 'llm', 'tts']) {
      const a = path.join(from, name), b = path.join(to, name);
      if (!fs.existsSync(a)) continue;
      say(`正在搬 ${name}（大文件可能要几分钟）`);
      try { fs.renameSync(a, b); }   // 同一个盘：一下就好
      catch (e) {
        if (MAC) { await run('ditto', [a, b], {}, say); rmrf(a); continue; }   // Mac 换了盘：ditto 复制过去再删旧的
        await run('robocopy', [a, b, '/E', '/MOVE', '/NFL', '/NDL', '/NJH', '/NJS'], {}, say).catch(e => { if (!/退出码 [0-7]：/.test(e.message)) throw e; }); }
    }
    try { fs.rmdirSync(from); } catch {}
  }
  saveState({ root: to });
  if (s.tts) {   // 配音：启动脚本里写着声音文件夹的绝对路径；Python 环境的 pyvenv.cfg 里写着旧位置，都换成新的
    writeTtsBat();
    const cfg = path.join(dirs().tts, 'index-tts', '.venv', 'pyvenv.cfg');
    try {
      const old = path.resolve(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(new RegExp(old, 'gi'), () => to), 'utf8');
    } catch {}
  }
  writeLaunchers();
  say('搬好了：' + to);
}

// ---------- 启动脚本和桌面图标 ----------
function writeLaunchers() {
  const s = state(), d = dirs(s);
  if (!s.game) return;
  if (MAC) return writeLaunchersMac(s, d);
  const lines = ['title 恶雌模拟器', 'rem 本机模型和配音装了就顺手开（已经在跑就不重复开）；记下这次是游戏开的，游戏关了它们也跟着关', 'set "ECI_START="'];
  if (s.llm) lines.push(`netstat -ano | findstr ":8080 " | findstr LISTENING >nul || (start "恶雌模拟器-本地模型" /min "${path.join(d.llm, '启动本地模型.bat')}" & set "ECI_START=%ECI_START% llm")`);
  if (s.tts) lines.push(`netstat -ano | findstr ":9880 " | findstr LISTENING >nul || (start "恶雌模拟器-配音" /min "${path.join(d.tts, '启动配音.bat')}" & set "ECI_START=%ECI_START% tts")`);
  lines.push(`if defined ECI_START "${NODE}" "${path.join(HERE, 'watch.js')}" 7788 %ECI_START%`);
  lines.push(`cd /d "${path.join(d.game, 'app')}"`, `"${NODE}" server.js`, 'pause');
  writeBat(path.join(d.game, '启动游戏.bat'), lines);
  const ico = path.join(d.game, 'app', 'icon.ico');
  shortcut('恶雌模拟器', path.join(d.game, '启动游戏.bat'), '', fs.existsSync(ico) ? ico : '');
}
// Mac：游戏在终端窗口里跑（关掉窗口游戏就停）；本地模型在后台跑，日志写进 llm/log.txt
// 从桌面双击时 PATH 很短：把 Claude Code 常装的地方加上，游戏才找得到 claude
const MAC_PATH = '"$CC:$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"';
const MAC_CC = 'CC="$(ls -dt "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary 2>/dev/null | head -1)"';
const macUp = port => `lsof -nP -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1`;
const macLlm = () => path.join(dirs().llm, '启动本地模型.command');
function writeLaunchersMac(s, d) {
  const lines = ['# 恶雌模拟器', MAC_CC, `export PATH=${MAC_PATH}`, 'ECI_START=""'];
  if (s.llm) lines.push(`${macUp(8080)} || { nohup ${shq(path.join(d.llm, '启动本地模型.command'))} >${shq(path.join(d.llm, 'log.txt'))} 2>&1 </dev/null & ECI_START="$ECI_START llm"; }`);
  lines.push(`[ -n "$ECI_START" ] && ${shq(NODE)} ${shq(path.join(HERE, 'watch.js'))} 7788 $ECI_START`);
  // 游戏自己开浏览器的那句只认 Windows：这里等它起来再 open
  lines.push('( for i in $(seq 60); do sleep 1; curl -s -o /dev/null http://127.0.0.1:7788/api/status && { open http://localhost:7788/; break; }; done ) &');
  lines.push(`cd ${shq(path.join(d.game, 'app'))}`, `NO_OPEN=1 exec ${shq(NODE)} server.js`);
  writeSh(path.join(d.game, '启动游戏.command'), lines);
  shortcut('恶雌模拟器', path.join(d.game, '启动游戏.command'));
}
// Mac：后台开本地模型
function startLlmMac() {
  const out = fs.openSync(path.join(dirs().llm, 'log.txt'), 'w');
  spawn('/bin/bash', [macLlm()], { detached: true, stdio: ['ignore', out, out] }).unref();
  fs.closeSync(out);
}

// ---------- 1. 游戏本体：下载、更新 ----------
const SAVE_FILES = ['我的日记', '自定义规则.md', 'app/自定义记录.json', '状态.md', '物品与等级.md', '回忆.md', '回忆摘要.md', '我的一天.md', '模拟日志.md', '崽崽.md', '开局.json', '兽夫日记', '归档',
  'app/config.json', 'app/history.json', 'app/session.json', 'app/session-api.json', 'app/sim.json', 'app/room.json', 'app/ui.json', 'app/uploads', '配音/缓存'];
async function remoteVersion() {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/version.json?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('连不上 GitHub（' + r.status + '）');
  return r.json();
}
async function fetchRepo(say) {
  const tmp = path.join(HOME, 'tmp'); rmrf(tmp); fs.mkdirSync(tmp, { recursive: true });
  const zip = path.join(tmp, 'repo.zip');
  await download(`https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`, zip, say, '下载游戏', { estimate: 235e6, from: 0, to: 70 });
  stopIfCancelled();
  say('解压（一两分钟）', 72);
  await unzip(zip, tmp);
  const top = fs.readdirSync(tmp).find(n => fs.statSync(path.join(tmp, n)).isDirectory());
  return path.join(tmp, top);
}
// 和游戏里开局改名一样的换法：新下载的文件也要换成玩家起的名字
function applyRenames(dir, map) {
  const pairs = Object.entries(map || {}).filter(([a, b]) => a && b && a !== b).sort((x, y) => y[0].length - x[0].length);
  if (!pairs.length) return;
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, out) : out.push(f); } return out; };
  const swap = s => { pairs.forEach(([a], i) => { s = s.split(a).join(`\u0000${i}\u0000`); }); pairs.forEach(([, b], i) => { s = s.split(`\u0000${i}\u0000`).join(b); }); return s; };
  const all = walk(dir);
  for (const f of all.filter(f => /\.(md|json|txt|js|html)$/i.test(f))) { const s = fs.readFileSync(f, 'utf8'), n = swap(s); if (n !== s) fs.writeFileSync(f, n, 'utf8'); }
  for (const f of all) { const b = path.basename(f), nb = swap(b); if (nb !== b) fs.renameSync(f, path.join(path.dirname(f), nb)); }
}
// 复制一个游戏文件夹：图片、声音这些大文件用硬链接（不多占硬盘），文字文件复制一份（开局改名会改它们）
function cloneDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    const fa = path.join(a, e.name), fb = path.join(b, e.name);
    if (e.isDirectory()) cloneDir(fa, fb);
    else if (/\.(md|json|txt|js|html|css|bat|ps1|py)$/i.test(e.name)) fs.copyFileSync(fa, fb);
    else { try { fs.linkSync(fa, fb); } catch { fs.copyFileSync(fa, fb); } }
  }
}
// 用模板（干净的新版本）更新一个游戏文件夹：存档和设置不动；玩家改过名，新文件也换成新名字
function updateDir(dir, say) {
  const tpl = templateDir();
  const start = readJson(path.join(dir, '开局.json'), null);
  let src = tpl;
  if (start && start.renamed) {
    say('把新文件里的名字换成你起的名字');
    src = path.join(HOME, 'tmp-rename'); rmrf(src); cloneDir(tpl, src); applyRenames(src, start.renamed);
  }
  const keep = new Set(SAVE_FILES.map(p => path.join(dir, p).toLowerCase()));
  const copy = (a, b) => {
    for (const e of fs.readdirSync(a, { withFileTypes: true })) {
      const fa = path.join(a, e.name), fb = path.join(b, e.name);
      if (keep.has(fb.toLowerCase())) continue;
      if (e.isDirectory()) { fs.mkdirSync(fb, { recursive: true }); copy(fa, fb); }
      else { try { fs.unlinkSync(fb); } catch {} fs.copyFileSync(fa, fb); }   // 先删再写：硬链接不会改到别的存档
    }
  };
  copy(src, dir);
  if (src !== tpl) rmrf(src);
}
// 干净的模板（新建存档用）：从下载好的仓库里拷一份
function makeTemplate(repo, say) {
  const s = state();
  say('准备干净的模板（新建存档用）', 80);
  rmrf(templateDir(s)); fs.mkdirSync(s.root, { recursive: true });
  fs.cpSync(path.join(repo, 'game'), templateDir(s), { recursive: true });
  fs.copyFileSync(path.join(repo, 'version.json'), path.join(templateDir(s), 'version.json'));
}
// 两个文件夹里的文件有没有不一样（新的比旧的多、或者内容变了）
function dirChanged(a, b) {
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    const fa = path.join(a, e.name), fb = path.join(b, e.name);
    if (e.isDirectory()) { if (!fs.existsSync(fb) || dirChanged(fa, fb)) return true; continue; }
    try { if (!fs.readFileSync(fa).equals(fs.readFileSync(fb))) return true; } catch { return true; }
  }
  return false;
}
let restartAfterJob = false;   // 安装器文件被更新了：这个任务做完就重启自己
async function installGame(say) {
  const s = state(), d = dirs(s);
  const repo = await fetchRepo(say);
  const ver = readJson(path.join(repo, 'version.json'), { version: '?' });
  const fresh = !fs.existsSync(path.join(d.game, 'app', 'server.js'));
  makeTemplate(repo, say);
  if (fresh) {
    say('复制游戏文件', 88);
    cloneDir(templateDir(s), d.game);
    // 装游戏之前就选好的大脑：写进游戏的设置
    const pend = state().pendingCfg;
    if (pend) { writeJson(path.join(d.game, 'app', 'config.json'), { ...readJson(path.join(d.game, 'app', 'config.json'), {}), ...pend }); saveState({ pendingCfg: null }); }
    saveState({ save: freeSaveName(true) });
  } else {
    say('更新游戏（存档和设置不动）', 88);
    await stopOurs('game');
    updateDir(d.game, say);
  }
  fs.copyFileSync(path.join(repo, 'version.json'), path.join(d.game, 'version.json'));
  // 安装器自己也跟着更新：文件真变了、而且跑的就是这一份，任务结束后自己重启，换上新的 server.js
  say('更新安装器', 97);
  const changed = dirChanged(path.join(repo, 'installer'), path.join(HOME, 'installer'));
  fs.cpSync(path.join(repo, 'installer'), path.join(HOME, 'installer'), { recursive: true });
  if (changed && path.resolve(HERE).toLowerCase() === path.resolve(HOME, 'installer').toLowerCase()) restartAfterJob = true;
  rmrf(path.join(HOME, 'tmp'));
  saveState({ game: { version: ver.version, at: new Date().toISOString() } });
  writeLaunchers();
  say(fresh ? '装好了，桌面上多了「恶雌模拟器」' : '更新到 ' + ver.version);
}

// ---------- 8. 存档：root/game 是正在玩的那个，其他存档整个放在 root/saves/名字 ----------
const savesDir = (s = state()) => path.join(s.root, 'saves');
const templateDir = (s = state()) => path.join(s.root, 'template');
const isGame = dir => fs.existsSync(path.join(dir, 'app', 'server.js'));
function saveInfo(dir, name, active) {
  const start = readJson(path.join(dir, '开局.json'), null);
  let st = ''; try { st = fs.readFileSync(path.join(dir, '状态.md'), 'utf8'); } catch {}
  const day = (st.match(/第\s*(\d+)\s*天/) || [])[1];
  let last = null; try { last = fs.statSync(path.join(dir, 'app', 'history.json')).mtime; } catch {}
  let turns = 0; try { turns = readJson(path.join(dir, 'app', 'history.json'), []).filter(m => m.role === 'user').length; } catch {}
  const custom = fs.existsSync(path.join(dir, '自定义规则.md'));
  return { name, active, started: !!start, husbands: start ? (start.order || []).length - (start.skipped || []).length : 0, day: day ? Number(day) : null, turns, last, custom,
    version: readJson(path.join(dir, 'version.json'), {}).version || null };
}
function listSaves() {
  const s = state(), d = dirs(s), out = [];
  if (isGame(d.game)) out.push(saveInfo(d.game, s.save || '存档 1', true));
  try { for (const n of fs.readdirSync(savesDir(s))) if (isGame(path.join(savesDir(s), n))) out.push(saveInfo(path.join(savesDir(s), n), n, false)); } catch {}
  return out;
}
function saveName(n) {
  n = String(n || '').trim();
  if (!n || n.length > 20 || /[\\/:*?"<>|]/.test(n) || /^\.+$/.test(n)) throw new Error('存档名 1～20 个字，不能有 \\ / : * ? " < > |');
  if (listSaves().some(x => x.name === n)) throw new Error('已经有叫「' + n + '」的存档了');
  return n;
}
// 「存档 N」里第一个没被用的名字（onlyParked：只看收起来的那些，给刚装好的游戏起名用）
function freeSaveName(onlyParked) {
  let used = [];
  if (onlyParked) { try { used = fs.readdirSync(savesDir()); } catch {} } else used = listSaves().map(x => x.name);
  for (let i = 1; ; i++) if (!used.includes('存档 ' + i)) return '存档 ' + i;
}
// 设置（大脑、接口、手机、城市）是全局的：换存档时带过去
const GLOBAL_CFG = ['brain', 'api', 'handoff', 'lan', 'city'];
function carryConfig(from, to) {
  const a = readJson(path.join(from, 'app', 'config.json'), {}), f = path.join(to, 'app', 'config.json');
  const b = readJson(f, {});
  for (const k of GLOBAL_CFG) if (a[k] !== undefined) b[k] = a[k];
  writeJson(f, b);
}
async function newSave(name, say) {
  const s = state(), d = dirs(s);
  name = saveName(name);
  if (!isGame(templateDir(s))) {   // 没有模板：自动下载一份（和装游戏下的是同一个）
    const repo = await fetchRepo(say);
    makeTemplate(repo, say);
    rmrf(path.join(HOME, 'tmp'));
  }
  // 一个存档都没有（正在玩的那个被删了）：新建的直接当正在玩的
  const asCurrent = !isGame(d.game);
  const to = asCurrent ? d.game : path.join(savesDir(s), name);
  say('复制一份干净的游戏', 85);
  if (asCurrent) rmrf(d.game);
  cloneDir(templateDir(s), to);
  if (!isGame(to)) throw new Error('没建成：「' + name + '」里缺文件');
  if (asCurrent) {
    const pend = state().pendingCfg;   // 设置（大脑、手机、城市）删存档时先收在这里
    if (pend) { writeJson(cfgFile(), { ...readJson(cfgFile(), {}), ...pend }); saveState({ pendingCfg: null }); }
    saveState({ save: name, game: { version: readJson(path.join(templateDir(), 'version.json'), {}).version || '?', at: new Date().toISOString() } });
    writeLaunchers();
    return say('建好了「' + name + '」，现在玩的就是它', 100);
  }
  if (isGame(d.game)) carryConfig(d.game, to);
  say('建好了「' + name + '」，点「加载」开始玩', 100);
}
// 存档的程序比现在的旧：用模板更新一下
function updateIfOld(dir, say) {
  const ver = state().game?.version;
  if (ver && readJson(path.join(dir, 'version.json'), {}).version !== ver && isGame(templateDir())) {
    say('这个存档的程序是旧版本，更新到 ' + ver);
    updateDir(dir, say);
    fs.copyFileSync(path.join(templateDir(), 'version.json'), path.join(dir, 'version.json'));
  }
}
async function loadSave(name, say) {
  const s = state(), d = dirs(s);
  const cur = s.save || '存档 1';
  if (name === cur && isGame(d.game)) return say('正在玩的就是「' + name + '」', 100);
  const from = path.join(savesDir(s), name);
  if (!isGame(from)) throw new Error('找不到存档「' + name + '」');
  say('关掉正在运行的游戏');
  await stopOurs('game');
  await new Promise(r => setTimeout(r, 800));
  fs.mkdirSync(savesDir(s), { recursive: true });
  const park = path.join(savesDir(s), cur);
  const hadGame = isGame(d.game);
  if (hadGame) {
    if (fs.existsSync(park)) throw new Error('saves 文件夹里已经有「' + cur + '」，先给它改个名');
    say('把「' + cur + '」收起来');
    try { fs.renameSync(d.game, park); } catch (e) { throw new Error('游戏文件夹正被占用（开着的黑窗口、文件夹窗口、编辑器？）关掉再试：' + e.code); }
  } else rmrf(d.game);
  say('换上「' + name + '」');
  try { fs.renameSync(from, d.game); } catch (e) { if (hadGame) fs.renameSync(park, d.game); throw new Error('换不过去，已经还原：' + e.code); }
  if (hadGame) carryConfig(park, d.game);
  else { const pend = state().pendingCfg; if (pend) { writeJson(cfgFile(), { ...readJson(cfgFile(), {}), ...pend }); saveState({ pendingCfg: null }); } }
  saveState({ save: name, ...(state().game ? {} : { game: { version: readJson(path.join(d.game, 'version.json'), {}).version || '?', at: new Date().toISOString() } }) });
  updateIfOld(d.game, say);
  writeLaunchers();
  // 真的换过去了才算好
  if (!isGame(d.game) || fs.existsSync(from) || (hadGame && !isGame(park))) throw new Error('没换成：游戏文件夹不对，打开 ' + s.root + ' 看看');
  say('现在玩的是「' + name + '」', 100);
}
// 删存档：别的存档直接删；正在玩的也能删（先关游戏），删完换上最近玩过的那个，一个都不剩就回到「还没有存档」
async function deleteSave(name, say) {
  const s = state(), d = dirs(s), cur = s.save || '存档 1';
  const held = '游戏窗口、这个文件夹的资源管理器窗口或编辑器可能还开着，关掉再试';
  if (name !== cur || !isGame(d.game)) {
    const p = path.join(savesDir(s), name);
    if (!isGame(p)) throw new Error('找不到存档「' + name + '」');
    say('删除「' + name + '」', 50);
    if (!(await rmrfRetry(p))) throw new Error('「' + name + '」没删干净：' + held);
    return say('删掉了「' + name + '」', 100);
  }
  say('关掉正在运行的游戏', 10);
  await stopOurs('game');
  // 设置（大脑、手机、城市）是所有存档通用的：先收起来，换上的存档 / 以后新建的存档接着用
  const cfg = readJson(cfgFile(), {}), keep = {};
  for (const k of GLOBAL_CFG) if (cfg[k] !== undefined) keep[k] = cfg[k];
  say('删除「' + name + '」', 40);
  if (!(await rmrfRetry(d.game))) throw new Error('「' + name + '」没删干净：' + held);
  const rest = listSaves().filter(x => !x.active).sort((a, b) => new Date(b.last || 0) - new Date(a.last || 0));
  if (!rest.length) {
    try { fs.unlinkSync(path.join(desktop(), MAC ? '恶雌模拟器.command' : '恶雌模拟器.lnk')); } catch {}   // 没有游戏了，桌面图标点了也开不起来
    saveState({ game: null, save: null, pendingCfg: Object.keys(keep).length ? keep : null });
    return say('删掉了「' + name + '」，现在一个存档都没有了', 100);
  }
  saveState({ pendingCfg: Object.keys(keep).length ? keep : null, save: null });
  say('换上最近玩的「' + rest[0].name + '」', 70);
  await loadSave(rest[0].name, say);
  say('删掉了「' + name + '」，现在玩的是「' + rest[0].name + '」', 100);
}
function renameSave(name, to) {
  const s = state();
  to = saveName(to);
  if (name === (s.save || '存档 1')) { saveState({ save: to }); return; }
  fs.renameSync(path.join(savesDir(s), name), path.join(savesDir(s), to));
}
// state.json 和磁盘对不上（文件夹被手动删了、卸载删了一半）：以磁盘为准
function reconcile(force) {
  if (stateBroken) return;
  if (!force && Object.entries(jobs).some(([n, j]) => !j.done && ['game', 'saves', 'location', 'uninstall', 'llm', 'tts'].includes(n))) return;   // 正在装 / 搬 / 换，文件夹本来就不全
  const s = state(), d = dirs(s), patch = {};
  if (s.game && !isGame(d.game)) patch.game = null;
  if (s.llm && !fs.existsSync(path.join(d.llm, MAC ? '启动本地模型.command' : '启动本地模型.bat'))) patch.llm = null;
  if (s.tts && !fs.existsSync(path.join(d.tts, '启动配音.bat'))) patch.tts = null;
  if (Object.keys(patch).length) saveState(patch);
}

// ---------- 6. 自定义游戏机制：交给游戏的大脑整理成 自定义规则.md ----------
// 大脑叫什么（页面上的 brainLabel 直接用这里算好的，两边一个说法）：
// :8080 叫「本地模型」，别的本机地址叫「本机模型（模型名）」，线上叫模型名，Claude Code 叫 Claude Code；没准备好就是空的
const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i;
const is8080 = base => /^https?:\/\/(127\.0\.0\.1|localhost):8080(\/|$)/i.test(base || '');
async function brainName(cfg = brainCfg()) {
  const brain = cfg.brain || (isGame(dirs().game) ? 'claude' : null);
  if (brain === 'claude') return findClaude() ? 'Claude Code' : '';
  if (brain !== 'api' || !cfg.api?.base || !cfg.api?.model) return '';
  // 指着 8080：我们装了本地模型，或者 8080 上真有服务（她自己开的 llama.cpp）才算选好
  if (is8080(cfg.api.base)) return state().llm || (await up('http://127.0.0.1:8080/v1/models')) ? '本地模型' : '';
  return LOCAL_RE.test(cfg.api.base) ? '本机模型（' + cfg.api.model + '）' : cfg.api.model;
}
async function brainReady() {
  const d = dirs();
  // 两样分开查：游戏没装时大脑也可能已经先选好了（pendingCfg）
  const brain = await brainName();
  const game = isGame(d.game);
  if (game && brain) return { ok: true, what: brain, game, brain };
  return { ok: false, game, brain, why: !game ? '先装游戏本体' : '还没选好大脑：去「语言模型」选一个' };
}
// 游戏开着就直接问它；没开就临时开一个不跑整点模拟的后台，用完关掉
async function withGame(fn) {
  const d = dirs();
  if (await ourGameUp()) return await fn(`http://127.0.0.1:${GPORT}`);
  if ((await brainReady()).what === '本地模型' && !(await up('http://127.0.0.1:8080/health')) && state().llm) {
    if (MAC) startLlmMac(); else
    spawn('cmd', ['/c', 'start', '"恶雌模拟器-本地模型"', '/min', path.join(dirs().llm, '启动本地模型.bat')], { windowsHide: true, detached: true });
    for (let i = 0; i < 90 && !(await up('http://127.0.0.1:8080/health')); i++) await new Promise(r => setTimeout(r, 2000));
  }
  const port = 7791;
  const env = { ...process.env, PORT: String(port), NO_OPEN: '1', NO_SIM: '1' };
  if (MAC) env.PATH = [path.dirname(findClaudeMac() || '/'), path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', env.PATH || ''].join(':');   // 游戏找 PATH 里的 claude
  const child = spawn(NODE, ['server.js'], { cwd: path.join(d.game, 'app'), env, windowsHide: true });
  try {
    for (let i = 0; i < 40 && !(await up(`http://127.0.0.1:${port}/api/status`)); i++) await new Promise(r => setTimeout(r, 300));
    return await fn(`http://127.0.0.1:${port}`);
  } finally { try { child.kill(); } catch {} }
}
const gameApi = (base, p, b) => fetch(base + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

// ---------- 2. 语言模型：检查电脑 → 推荐 → 安装 ----------
function hardware() {
  const h = { ramGB: Math.round(os.totalmem() / 1e9), cpu: os.cpus()[0]?.model || '', cores: os.cpus().length, gpus: [], nvidia: null };
  if (MAC) {   // Mac：没有 NVIDIA；苹果芯片（M1 以后）用 Metal 跑，内存就是显存
    try { h.apple = execFileSync('sysctl', ['-n', 'hw.optional.arm64'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '1'; } catch { h.apple = process.arch === 'arm64'; }
    h.mac = true; h.gpus = h.apple ? [h.cpu + '（Metal）'] : [];
    return h;
  }
  try {
    const out = execSync('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits', { encoding: 'utf8', windowsHide: true }).trim();
    const [name, mem, drv] = out.split('\n')[0].split(',').map(x => x.trim());
    h.nvidia = { name, vramGB: Math.round(Number(mem) / 1024), driver: drv };
  } catch {}
  try { h.gpus = ps('(Get-CimInstance Win32_VideoController).Name').split(/\r?\n/).filter(Boolean); } catch {}
  return h;
}
function llmPlan() {
  const h = hardware(), s = state();
  const free = freeGB(s.root);
  if (MAC) {   // Mac：苹果芯片 + 32GB 内存起步；模型和系统共用内存，留出余量
    let tier = 'api', why = [];
    if (!h.apple) why.push('Intel 芯片的 Mac 跑不动本地模型');
    else if (h.ramGB >= 48) tier = 'full';
    else if (h.ramGB >= 32) tier = 'lite';
    else why.push(`内存只有 ${h.ramGB}GB，Mac 上本地模型至少要 32GB`);
    const need = tier === 'api' ? 0 : Math.ceil(MODELS[tier].gb + 1.5);
    if (need && free != null && free < need) { why.push(`安装位置所在的盘只剩 ${free}GB，要 ${need}GB`); tier = 'api'; }
    return { hw: h, free, tier, build: tier === 'api' ? null : 'metal', model: MODELS[tier] || null, needGB: tier === 'api' ? 0 : need, why };
  }
  const otherGpu = !h.nvidia && h.gpus.some(g => /AMD|Radeon|Intel\(R\) Arc/i.test(g));
  const drvOk = h.nvidia && Number(h.nvidia.driver.split('.')[0]) >= 528;
  let tier = 'api', build = null, why = [];
  if (h.nvidia && drvOk && h.nvidia.vramGB >= 12 && h.ramGB >= 32) { tier = 'full'; build = 'cuda'; }
  else if (h.nvidia && drvOk && h.nvidia.vramGB >= 6 && h.ramGB >= 24) { tier = 'lite'; build = 'cuda'; }
  else if (otherGpu && h.ramGB >= 24) { tier = 'lite'; build = 'vulkan'; why.push('不是 NVIDIA 显卡，用 Vulkan 版，会慢一些'); }
  else if (h.ramGB >= 32) { tier = 'lite'; build = 'cpu'; why.push('没有能用的独立显卡，只能用 CPU 跑，一段要好几分钟'); }
  if (h.nvidia && !drvOk) why.push(`显卡驱动太旧（${h.nvidia.driver}），先更新驱动`);
  if (h.ramGB < 24) why.push(`内存只有 ${h.ramGB}GB，本地模型至少要 24GB`);
  const need = tier === 'api' ? 0 : Math.ceil(MODELS[tier].gb + 1.5);
  if (need && free != null && free < need) { why.push(`安装位置所在的盘只剩 ${free}GB，要 ${need}GB`); tier = 'api'; build = null; }
  return { hw: h, free, tier, build, model: MODELS[tier] || null, needGB: need, why };
}
async function installLLM(tier, build, say) {
  const s = state(), d = dirs(s);
  const m = MODELS[tier]; if (!m) throw new Error('这台电脑不建议装本地模型');
  if (MAC) return installLLMMac(tier, m, say);
  const base = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/`;
  const zips = build === 'cuda' ? [`llama-${LLAMA_TAG}-bin-win-cuda-12.4-x64.zip`, 'cudart-llama-bin-win-cuda-12.4-x64.zip']
    : build === 'vulkan' ? [`llama-${LLAMA_TAG}-bin-win-vulkan-x64.zip`] : [`llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`];
  for (const z of zips) {
    const f = path.join(d.llm, 'download', z);
    await download(base + z, f, say, '下载 llama.cpp', { from: 0, to: 6 });
    say('解压 ' + z, 7); await unzip(f, path.join(d.llm, 'llama.cpp'));
  }
  await download(`https://huggingface.co/${MODEL_REPO}/resolve/main/${m.file}`, path.join(d.llm, 'models', m.file), say, '下载模型', { estimate: m.gb * 1e9, from: 8, to: 97 });
  // 上下文：游戏规则 + 存档有三万多字，给 64k；显存小的给 48k
  const hw = hardware();
  const ctx = hw.nvidia && hw.nvidia.vramGB >= 12 ? 65536 : 49152;
  const gpu = build === 'cpu' ? '' : '-ngl 99 --cpu-moe';
  writeBat(path.join(d.llm, '启动本地模型.bat'), ['title 恶雌模拟器-本地模型 (端口 8080)', 'cd /d "%~dp0"',
    `llama.cpp\\llama-server.exe -m "models\\${m.file}" --jinja -c ${ctx} -np 1 ${gpu} -t ${Math.max(4, Math.min(16, os.cpus().length - 2))} --host 127.0.0.1 --port 8080`, 'pause']);
  rmrf(path.join(d.llm, 'download'));
  saveState({ llm: { tier, build, file: m.file, ctx } });
  writeLaunchers();
  say('装好了');
}
// Mac：llama.cpp 官方的 macOS 苹果芯片版（Metal），tar.gz 里是 llama-<版本>/ 一层文件夹
async function installLLMMac(tier, m, say) {
  const d = dirs();
  const tgz = `llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`, f = path.join(d.llm, 'download', tgz), dest = path.join(d.llm, 'llama.cpp');
  await download(`https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${tgz}`, f, say, '下载 llama.cpp', { from: 0, to: 6 });
  say('解压 ' + tgz, 7);
  rmrf(dest); fs.mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', f, '-C', dest, '--strip-components', '1'], { stdio: 'ignore' });
  try { execFileSync('xattr', ['-dr', 'com.apple.quarantine', dest], { stdio: 'ignore' }); } catch {}   // 有隔离标记的话 Mac 不让跑
  await download(`https://huggingface.co/${MODEL_REPO}/resolve/main/${m.file}`, path.join(d.llm, 'models', m.file), say, '下载模型', { estimate: m.gb * 1e9, from: 8, to: 97 });
  const ctx = tier === 'full' ? 65536 : 49152;
  // 用绝对路径跑：安装器靠命令行里的路径认出这是我们开的
  writeSh(macLlm(), ['# 恶雌模拟器-本地模型 (端口 8080)', 'D="$(cd "$(dirname "$0")" && pwd)"',
    `exec "$D/llama.cpp/llama-server" -m "$D/models/${m.file}" --jinja -c ${ctx} -np 1 -ngl 99 -t ${Math.max(4, Math.min(16, os.cpus().length - 2))} --host 127.0.0.1 --port 8080`]);
  rmrf(path.join(d.llm, 'download'));
  saveState({ llm: { tier, build: 'metal', file: m.file, ctx } });
  writeLaunchers();
  say('装好了');
}
async function testLLM(say) {
  const d = dirs();
  await stopOurs('llm');
  if (MAC) startLlmMac(); else
  spawn('cmd', ['/c', 'start', '"恶雌模拟器-本地模型"', '/min', path.join(d.llm, '启动本地模型.bat')], { windowsHide: true, detached: true });
  say('启动本地模型（第一次要把模型从硬盘读进内存，1～3 分钟）');
  for (let i = 0; i < 180; i++) {
    try { if ((await (await fetch('http://127.0.0.1:8080/health')).json()).status === 'ok') break; } catch {}
    await new Promise(r => setTimeout(r, 2000));
    if (i === 179) throw new Error(MAC ? '本地模型没起来，看看 ' + path.join(d.llm, 'log.txt') + ' 里写了什么' : '本地模型没起来，看看那个最小化的黑窗口里写了什么');
  }
  say('试写一句');
  const t0 = Date.now();
  const r = await (await fetch('http://127.0.0.1:8080/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '用一句话介绍你自己。' }], max_tokens: 80, chat_template_kwargs: { enable_thinking: false } }) })).json();
  say(`能用：${((Date.now() - t0) / 1000).toFixed(1)} 秒回了「${(r.choices?.[0]?.message?.content || '').slice(0, 40)}」`);
}
// 游戏的大脑写进游戏的 config.json
// 游戏的设置文件；游戏还没装时先记在安装器自己的 state.json 里（pendingCfg），装好游戏时写进去
const brainCfg = () => (isGame(dirs().game) ? readJson(path.join(dirs().game, 'app', 'config.json'), {}) : state().pendingCfg || {});
function setBrain(b) {
  const f = path.join(dirs().game, 'app', 'config.json');
  const c = brainCfg();
  if (b.brain) c.brain = b.brain;
  if (b.api) c.api = { ...(c.api || {}), ...b.api, key: b.api.key && !b.api.key.includes('…') ? b.api.key : (c.api || {}).key || '' };
  if (b.handoff) c.handoff = { ...(c.handoff || {}), ...b.handoff };
  if (isGame(dirs().game)) writeJson(f, c); else saveState({ pendingCfg: c });
  return c;
}
// Mac：claude 程序在哪（VS Code 插件自带的，或者命令行版常装的几个地方）；从桌面图标开的安装器 PATH 很短，挨个看
function findClaudeMac() {
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  try {
    const hit = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).map(d => path.join(ext, d, 'resources', 'native-binary', 'claude'))
      .filter(p => fs.existsSync(p)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (hit) return hit;
  } catch {}
  for (const p of [path.join(os.homedir(), '.local', 'bin', 'claude'), path.join(os.homedir(), '.claude', 'local', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) if (fs.existsSync(p)) return p;
  try { return execSync('command -v claude', { encoding: 'utf8', shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}
function findClaude() {
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  if (MAC) { const p = findClaudeMac(); return !p ? '' : p.startsWith(ext) ? 'VS Code 插件' : '命令行 claude'; }
  try { if (fs.readdirSync(ext).some(d => d.startsWith('anthropic.claude-code-'))) return 'VS Code 插件'; } catch {}
  try { execSync('where claude', { windowsHide: true, stdio: 'ignore' }); return '命令行 claude'; } catch {}
  return '';
}

// ---------- 2b. 自动找：电脑上已经有哪些大脑能直接用 ----------
const getJson = (u, ms = 1500) => fetch(u, { signal: AbortSignal.timeout(ms) }).then(r => (r.ok ? r.json() : null)).catch(() => null);
async function detectLLM() {
  const d = dirs(), s = state(), hw = hardware();
  const vram = MAC ? (hw.apple ? Math.floor(hw.ramGB * 0.65) : 0) : hw.nvidia ? hw.nvidia.vramGB : 0;   // Mac：内存的三分之二左右能给模型用
  const found = [];
  const macApp = n => MAC && fs.existsSync(path.join('/Applications', n + '.app'));
  // 本机 llama.cpp（我们装的，或者别人自己开的 8080）
  const lc = await getJson('http://127.0.0.1:8080/v1/models');
  if (lc) found.push({ id: 'local', name: '本地模型（llama.cpp）', base: 'http://127.0.0.1:8080/v1', models: (lc.data || []).map(m => m.id), model: 'local', running: true });
  else if (s.llm) found.push({ id: 'local', name: '本地模型（已装，没开）', base: 'http://127.0.0.1:8080/v1', models: ['local'], model: 'local', running: false });
  // Ollama：11434
  const ol = await getJson('http://127.0.0.1:11434/api/tags');
  const olInstalled = ol || macApp('Ollama') || fs.existsSync(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'));
  if (olInstalled) {
    const list = ((ol && ol.models) || []).map(m => ({ id: m.name, gb: Math.round((m.size || 0) / 1e8) / 10 }));
    // 挑一个：能塞进显存的里面最大的；中文好的（qwen / deepseek / glm / yi）优先
    const fit = list.filter(m => !vram || m.gb <= vram * 1.1);
    const zh = m => /qwen|deepseek|glm|yi|internlm/i.test(m.id);
    const pick = [...fit].sort((a, b) => (zh(b) - zh(a)) || b.gb - a.gb)[0] || list[0];
    found.push({ id: 'ollama', name: 'Ollama', base: 'http://127.0.0.1:11434/v1', models: list.map(m => m.id), sizes: list, model: pick ? pick.id : '', running: !!ol });
  }
  // LM Studio：1234
  const lm = await getJson('http://127.0.0.1:1234/v1/models');
  const lmInstalled = lm || macApp('LM Studio') || ['LM Studio', 'lm-studio'].some(n => fs.existsSync(path.join(process.env.LOCALAPPDATA || '', 'Programs', n)));
  if (lmInstalled) { const ids = ((lm && lm.data) || []).map(m => m.id).filter(id => !/embed/i.test(id)); found.push({ id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234/v1', models: ids, model: ids[0] || '', running: !!lm }); }
  // Claude Code
  const cc = findClaude();
  if (cc) found.push({ id: 'claudecode', name: 'Claude Code（' + cc + '）', running: true });
  // 推荐给 Ollama 拉的模型：按显存
  const ollamaRec = vram >= 22 ? 'qwen3:32b' : vram >= 12 ? 'qwen3:14b' : vram >= 7 ? 'qwen3:8b' : 'qwen3:4b';
  const sz = recSize(vram);
  return { found, vram, ramGB: hw.ramGB, ollamaRec, olRec: 'qwen3:' + sz + 'b', lmRec: 'Qwen3-' + sz + 'B', olExe: !!ollamaExe(), lmExe: !!LMS_EXE() };
}
// ---------- 2c. Ollama / LM Studio 一键 ----------
// 推荐模型按显存挑（和 detectLLM 里的一样）：Ollama 用官方库名，LM Studio 用 lmstudio-community 的 Qwen3 GGUF（Q4_K_M）
const recSize = vram => (vram >= 22 ? '32' : vram >= 12 ? '14' : vram >= 7 ? '8' : '4');
function vramNow() { const hw = hardware(); return MAC ? (hw.apple ? Math.floor(hw.ramGB * 0.65) : 0) : hw.nvidia ? hw.nvidia.vramGB : 0; }
const gb = n => (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' GB';
async function waitUp(u, sec, say, msg) { for (let i = 0; i < sec; i++) { stopIfCancelled(); if (await up(u)) return true; if (msg && i % 5 === 0) say(msg); await new Promise(r => setTimeout(r, 1000)); } return false; }

const ollamaExe = () => MAC ? (fs.existsSync('/Applications/Ollama.app') ? '/Applications/Ollama.app' : null)
  : [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')].find(p => fs.existsSync(p)) || null;
async function oneClickOllama(say, want) {
  const model = want || 'qwen3:' + recSize(vramNow()) + 'b';
  let base = 0;
  if (!(await up('http://127.0.0.1:11434/api/version')) && !ollamaExe()) {
    if (MAC) { macOpen('https://ollama.com/download/mac'); throw new Error('Mac 上要自己装 Ollama：官网已经打开，装好、打开它，再点一次'); }
    const dir = path.join(HOME, 'tmp-ollama'); fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, 'OllamaSetup.exe');
    await download('https://ollama.com/download/OllamaSetup.exe', exe, say, '下载 Ollama', { estimate: 1.7e9, from: 0, to: 30 });
    stopIfCancelled();
    say('安装 Ollama（一两分钟，不用点任何东西）', 32);
    await run(exe, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], {}, say);
    rmrf(dir);
    if (!ollamaExe()) throw new Error('Ollama 没装上，再点一次试试');
    base = 35;
  }
  // 开起来：没在跑就在后台起 ollama serve
  if (!(await up('http://127.0.0.1:11434/api/version'))) {
    say('打开 Ollama', base + 1);
    if (MAC) macOpen('-a', 'Ollama'); else spawn(ollamaExe(), ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    if (!(await waitUp('http://127.0.0.1:11434/api/version', 60, say, '等 Ollama 开起来…'))) throw new Error('Ollama 没开起来：从开始菜单打开 Ollama，再点一次');
  }
  // 下模型：/api/pull 一行一行回进度
  say(`下载模型 ${model}`, base + 2);
  const r = await fetch('http://127.0.0.1:11434/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: true }) });
  if (!r.ok || !r.body) throw new Error('Ollama 不肯下这个模型（' + r.status + '）');
  const dec = new TextDecoder(); let buf = '', biggest = 0, t0 = Date.now(), last = 0;
  for await (const chunk of r.body) {
    stopIfCancelled();
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.error) throw new Error('下载出错：' + j.error);
      // 只跟最大的那一层（模型本体）报进度，小文件一闪而过
      if (j.total && j.total >= biggest) {
        biggest = j.total;
        const done = j.completed || 0, now = Date.now();
        if (now - last > 900) {
          last = now;
          const sp = done / Math.max(1, (now - t0) / 1000), left = sp > 0 ? Math.round((j.total - done) / sp) : 0;
          say(`下载模型 ${model}：${gb(done)} / ${gb(j.total)}${sp > 0 ? '，' + (sp / 1e6).toFixed(1) + ' MB/秒' : ''}${left > 0 ? '，还要约 ' + (left > 90 ? Math.round(left / 60) + ' 分钟' : left + ' 秒') : ''}`, base + 2 + Math.floor((97 - base - 2) * done / j.total));
        }
      } else if (j.status && !j.total) say(j.status === 'success' ? '模型下好了' : 'Ollama：' + j.status);
    }
  }
  setBrain({ brain: 'api', api: { base: 'http://127.0.0.1:11434/v1', model, key: '' } });
  say(`装好了，大脑换成 Ollama（${model}）`, 100);
}

const LMS_EXE = () => MAC ? (fs.existsSync('/Applications/LM Studio.app') ? '/Applications/LM Studio.app' : null)
  : [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'LM Studio', 'LM Studio.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'lm-studio', 'LM Studio.exe')].find(p => fs.existsSync(p)) || null;
// lms 命令行：第一次打开 LM Studio 后会放到 ~/.lmstudio/bin；安装包里也带了一份
function lmsCli() {
  const c = [path.join(os.homedir(), '.lmstudio', 'bin', MAC ? 'lms' : 'lms.exe')];
  const app = LMS_EXE();
  if (app && !MAC) c.push(path.join(path.dirname(app), 'resources', 'app', '.webpack', 'lms.exe'));
  if (app && MAC) c.push(path.join(app, 'Contents', 'Resources', 'app', '.webpack', 'lms'));
  return c.find(p => fs.existsSync(p)) || null;
}
async function oneClickLMStudio(say) {
  const size = recSize(vramNow());
  let base = 0;
  if (!(await up('http://127.0.0.1:1234/v1/models')) && !LMS_EXE()) {
    if (MAC) { macOpen('https://lmstudio.ai/download'); throw new Error('Mac 上要自己装 LM Studio：官网已经打开，装好、打开一次，再点一次'); }
    const dir = path.join(HOME, 'tmp-lmstudio'); fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, 'LM-Studio-Setup.exe');
    await download('https://lmstudio.ai/download/latest/win32/x64', exe, say, '下载 LM Studio', { estimate: 6.3e8, from: 0, to: 25 });
    stopIfCancelled();
    say('安装 LM Studio（一两分钟，不用点任何东西）', 27);
    await run(exe, ['/S'], {}, say);
    rmrf(dir);
    if (!LMS_EXE()) throw new Error('LM Studio 没装上，再点一次试试');
    base = 30;
  }
  // 开服务：用 lms server start；还没有 lms 就先在后台打开一次 LM Studio，等它把 lms 放好
  if (!(await up('http://127.0.0.1:1234/v1/models'))) {
    say('打开 LM Studio 的服务', base + 1);
    if (!lmsCli()) {
      if (MAC) macOpen('-a', 'LM Studio'); else spawn(LMS_EXE(), ['--run-as-service'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      for (let i = 0; i < 90 && !lmsCli(); i++) { stopIfCancelled(); await new Promise(r => setTimeout(r, 1000)); }
    }
    if (!lmsCli()) throw new Error('没找到 LM Studio 的 lms：打开一次 LM Studio，再点一次');
    await run(lmsCli(), ['server', 'start'], {}, say).catch(() => {});
    if (!(await waitUp('http://127.0.0.1:1234/v1/models', 90, say, '等 LM Studio 的服务开起来…'))) throw new Error('LM Studio 的服务没开起来：打开 LM Studio，左边「Developer」里打开「Start server」，再点一次');
  }
  // 下模型：官方接口 /api/v1/models/download，再按 job_id 查进度
  const name = `Qwen3-${size}B`;
  say(`下载模型 ${name}`, base + 2);
  const r = await fetch('http://127.0.0.1:1234/api/v1/models/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: `https://huggingface.co/lmstudio-community/${name}-GGUF`, quantization: 'Q4_K_M' }) });
  const j0 = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('LM Studio 不肯下这个模型：' + (j0.error && (j0.error.message || j0.error) || r.status));
  if (j0.status !== 'already_downloaded') {
    for (;;) {
      stopIfCancelled();
      await new Promise(r => setTimeout(r, 1000));
      const st = await getJson(`http://127.0.0.1:1234/api/v1/models/download/status/${j0.job_id}`, 5000);
      if (!st) continue;
      if (st.status === 'failed') throw new Error('模型下载失败，检查网络再点一次');
      if (st.status === 'completed') break;
      const tot = st.total_size_bytes || j0.total_size_bytes || 0, done = st.downloaded_bytes || 0, sp = st.bytes_per_second || 0;
      const left = sp > 0 && tot ? Math.round((tot - done) / sp) : 0;
      say(`下载模型 ${name}：${gb(done)}${tot ? ' / ' + gb(tot) : ''}${sp ? '，' + (sp / 1e6).toFixed(1) + ' MB/秒' : ''}${left > 0 ? '，还要约 ' + (left > 90 ? Math.round(left / 60) + ' 分钟' : left + ' 秒') : ''}${st.status === 'paused' ? '（暂停了）' : ''}`, tot ? base + 2 + Math.floor((97 - base - 2) * done / tot) : null);
    }
  }
  // 模型名：去 /v1/models 里找刚下的那个
  const list = ((await getJson('http://127.0.0.1:1234/v1/models', 5000)) || {}).data || [];
  const id = (list.find(m => new RegExp('qwen3-' + size + 'b', 'i').test(m.id)) || list.find(m => !/embed/i.test(m.id)) || {}).id;
  if (!id) throw new Error('模型下好了，但 LM Studio 没列出来：打开 LM Studio 看看');
  setBrain({ brain: 'api', api: { base: 'http://127.0.0.1:1234/v1', model: id, key: '' } });
  say(`装好了，大脑换成 LM Studio（${id}）`, 100);
}

// 去接口拿这家能用的模型列表（OpenAI 兼容的 /models）
async function listModels(api) {
  const t = { ...api };
  if (t.key && t.key.includes('…')) t.key = readJson(path.join(dirs().game, 'app', 'config.json'), {}).api?.key || '';
  const r = await fetch(t.base.replace(/\/+$/, '') + '/models', { signal: AbortSignal.timeout(15000), headers: t.key ? { Authorization: 'Bearer ' + t.key, 'x-api-key': t.key, 'anthropic-version': '2023-06-01' } : {} });
  const x = await r.text();
  if (!r.ok) return { ok: false, error: `${r.status}：${x.slice(0, 160)}` };
  let j; try { j = JSON.parse(x); } catch { return { ok: false, error: '返回的不是模型列表' }; }
  const ids = (j.data || j.models || []).map(m => (m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
  return { ok: true, models: [...new Set(ids)] };
}

// ---------- 游戏设置：亲密段落交给谁写、天气城市、手机连接（游戏里不再有设置，全在这里） ----------
const GAME_PORT = GPORT;
const cfgFile = () => path.join(dirs().game, 'app', 'config.json');
function gameCfg() {
  const c = readJson(cfgFile(), {});
  const lan = { enabled: false, token: '', ...(c.lan || {}) };
  if (!lan.token) { lan.token = require('crypto').randomBytes(12).toString('base64url'); writeJson(cfgFile(), { ...c, lan }); }
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) ips.push(a.address);
  const mask = k => (k ? k.slice(0, 4) + '…' + k.slice(-4) : '');
  const h = { base: 'http://127.0.0.1:8080/v1', key: '', model: '', ...(c.handoff || {}) };
  return { handoff: { ...h, key: mask(h.key) }, city: c.city || '', lan: { enabled: !!lan.enabled }, urls: ips.map(ip => `http://${ip}:${GAME_PORT}/?t=${lan.token}`) };
}
async function setGameCfg(b) {
  if (!isGame(dirs().game)) throw new Error('先装游戏本体');
  // 游戏开着（而且是我们装的这份）：交给它改，手机连接开关能马上生效
  try {
    if (await ourGameUp()) {
      await fetch(`http://127.0.0.1:${GAME_PORT}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(5000) });
      return gameCfg();
    }
  } catch {}
  const c = readJson(cfgFile(), {});
  const keep = (old = {}, nu) => ({ ...old, ...nu, key: nu.key && !nu.key.includes('…') ? nu.key : old.key || '' });
  if (b.handoff) c.handoff = keep(c.handoff, b.handoff);
  if (b.city !== undefined) c.city = String(b.city).trim();
  if (b.lan) c.lan = { ...(c.lan || {}), enabled: !!b.lan.enabled };
  writeJson(cfgFile(), c);
  return gameCfg();
}

// 天气：按网络位置找你在哪个城市（几家轮着试），或者按她填的城市名找；再问 Open-Meteo 现在的天气
const WMO = c => c === 0 ? '晴' : c <= 2 ? '多云' : c === 3 ? '阴' : c <= 48 ? '有雾' : c <= 57 ? '毛毛雨' : c <= 67 ? '下雨' : c <= 77 ? '下雪' : c <= 82 ? '阵雨' : c <= 86 ? '阵雪' : '雷雨';
async function geo(city) {
  let p = null;
  if (city) {
    const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&name=' + encodeURIComponent(city), 8000);
    const r = j && j.results && j.results[0];
    if (!r) throw new Error('没找到「' + city + '」这个城市，换个写法试试（中文、英文都行）');
    p = { city: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude };
  } else {
    for (const [u, f] of [['https://ipwho.is/', j => j.success !== false && { city: j.city, country: j.country, lat: j.latitude, lon: j.longitude }],
      ['https://ipapi.co/json/', j => !j.error && { city: j.city, country: j.country_name, lat: j.latitude, lon: j.longitude }],
      ['http://ip-api.com/json/?lang=zh-CN', j => j.status === 'success' && { city: j.city, country: j.country, lat: j.lat, lon: j.lon }]]) {
      const j = await getJson(u, 6000); const x = j && f(j); if (x && x.city) { p = x; break; }
    }
    if (!p) throw new Error('网络定位没查到：检查一下网络，或者改成手动填城市');
  }
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&timezone=auto`, 8000);
  if (w && w.current) p.weather = `${WMO(w.current.weather_code)}，${Math.round(w.current.temperature_2m)}°C`;
  return p;
}

// ---------- 3. 配音：检查 → 安装 ----------
function ttsPlan() {
  if (MAC) return { hw: hardware(), free: null, ok: false, mac: true, why: ['Mac 不支持配音（要 NVIDIA 显卡）'] };
  const h = hardware(), s = state(), free = freeGB(s.root), why = [];
  if (!h.nvidia) why.push('配音要 NVIDIA 显卡（没有找到）');
  else {
    if (h.nvidia.vramGB < 8) why.push(`显存 ${h.nvidia.vramGB}GB，配音至少要 8GB`);
    if (Number(h.nvidia.driver.split('.')[0]) < 570) why.push(`显卡驱动 ${h.nvidia.driver} 太旧，要 570 以上（去 NVIDIA 官网更新）`);
  }
  if (free != null && free < 25) why.push(`安装位置所在的盘只剩 ${free}GB，配音要 25GB`);
  if (s.llm && h.nvidia && h.nvidia.vramGB < 16) why.push('显存不到 16GB：配音和本地模型不能同时开，玩的时候二选一');
  const ok = !why.some(w => !w.includes('二选一'));
  return { hw: h, free, ok, why };
}
// 配音的启动脚本（装好、搬家以后都要重写：里面有游戏声音文件夹的绝对路径）
function writeTtsBat() {
  const d = dirs();
  writeBat(path.join(d.tts, '启动配音.bat'), ['title 恶雌模拟器-配音 (端口 9880)', 'cd /d "%~dp0index-tts"',
    `set "VOICE_DIR=${path.join(d.game, '配音', '参考')}"`, 'set PYTHONUTF8=1', '.venv\\Scripts\\python.exe tts_server.py', 'pause']);
}
async function installTTS(say) {
  const s = state(), d = dirs(s);
  const env = { ...process.env, UV_HTTP_TIMEOUT: '300', UV_PYTHON_INSTALL_DIR: path.join(d.tts, 'python'), UV_CACHE_DIR: path.join(d.tts, 'uv-cache') };
  const uv = path.join(d.tts, 'uv', 'uv.exe');
  if (!fs.existsSync(uv)) {
    const z = path.join(d.tts, 'download', 'uv.zip');
    await download('https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip', z, say, '下载 uv', { from: 0, to: 3 });
    await unzip(z, path.join(d.tts, 'uv'));
  }
  const src = path.join(d.tts, 'index-tts');
  if (!fs.existsSync(path.join(src, 'pyproject.toml'))) {
    const z = path.join(d.tts, 'download', 'index-tts.zip');
    await download(`https://codeload.github.com/index-tts/index-tts/zip/${INDEX_TTS_SHA}`, z, say, '下载 IndexTTS', { estimate: 60e6, from: 3, to: 8 });
    await unzip(z, path.join(d.tts, 'download'));
    fs.renameSync(path.join(d.tts, 'download', `index-tts-${INDEX_TTS_SHA}`), src);
  }
  say('装 Python 环境和 PyTorch（几 GB，要一阵子）', 10);
  await run(uv, ['sync'], { cwd: src, env }, say);
  await run(uv, ['pip', 'install', '-p', path.join(src, '.venv', 'Scripts', 'python.exe'), 'fastapi', 'uvicorn', 'huggingface_hub'], { cwd: src, env }, say);
  say('下载配音模型（约 5GB）', 55);
  await run(path.join(src, '.venv', 'Scripts', 'python.exe'), ['-c',
    "from huggingface_hub import snapshot_download; snapshot_download('IndexTeam/IndexTTS-2.5', local_dir='checkpoints', max_workers=8)"], { cwd: src, env: { ...env, PYTHONUTF8: '1' } }, say);
  fs.copyFileSync(path.join(HERE, 'tts_server.py'), path.join(src, 'tts_server.py'));
  writeTtsBat();
  rmrf(path.join(d.tts, 'download'));
  saveState({ tts: { at: new Date().toISOString() } });
  writeLaunchers();
  say('装好了（第一次开配音时还会自动下几个小模型，要等几分钟）');
}

// ---------- 出门在外也能玩：Tailscale ----------
// 手机和电脑登录同一个 Tailscale 账号，手机在哪都能连回这台电脑；转发端口 8788 → 游戏 7788（走本机，游戏不用开「手机连接」、不用防火墙）
const TS_PORT = 8788;
function tsExe() {
  if (MAC) {   // Mac 版（App Store / 官网）里的程序本身就能当命令行用
    for (const p of ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale']) if (fs.existsSync(p)) return p;
    try { return execSync('command -v tailscale', { encoding: 'utf8', shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
  }
  for (const d of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']) {
    if (!d) continue;
    const p = path.join(d, 'Tailscale', 'tailscale.exe');
    if (fs.existsSync(p)) return p;
  }
  try { return execSync('where tailscale', { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim() || null; } catch { return null; }
}
const tsRun = (args, timeout = 15000) => execFileSync(tsExe(), args, { encoding: 'utf8', windowsHide: true, timeout, stdio: ['ignore', 'pipe', 'pipe'] });
function tsState() {
  if (!tsExe()) return { installed: false };
  let st;
  try { st = JSON.parse(tsRun(['status', '--json'])); } catch { return { installed: true, running: false }; }
  const self = st.Self || {};
  const ip = (self.TailscaleIPs || []).find(x => /^100\./.test(x)) || '';
  let serving = false;
  try { serving = tsRun(['serve', 'status', '--json']).includes('"' + TS_PORT + '"'); } catch {}
  return { installed: true, running: true, state: st.BackendState, loggedIn: st.BackendState === 'Running', authUrl: st.AuthURL || '',
    who: (st.User && self.UserID && st.User[self.UserID] && st.User[self.UserID].LoginName) || '', ip, serving, url: ip ? `http://${ip}:${TS_PORT}/` : '' };
}
async function installTailscale(say) {
  if (tsExe()) return say('电脑上已经有 Tailscale 了', 100);
  if (MAC) throw new Error('Mac 版要从官网或 App Store 装');
  if (TEST) return say('测试模式：不真的装 Tailscale', 100);
  const dir = path.join(HOME, 'tmp-tailscale'); fs.mkdirSync(dir, { recursive: true });
  const msi = path.join(dir, 'tailscale-setup.msi');
  await download(`https://pkgs.tailscale.com/stable/tailscale-setup-latest-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.msi`, msi, say, '下载 Tailscale', { estimate: 39e6, from: 0, to: 80 });
  stopIfCancelled();
  say('安装（Windows 问「是否允许更改」时点「是」）', 85);
  try { await psAsync(`Start-Process msiexec -ArgumentList '/i','"${msi.replace(/'/g, "''")}"','/quiet','/norestart' -Verb RunAs -Wait`); } catch {}
  rmrf(dir);
  if (!tsExe()) throw new Error('没装上：Windows 问「是否允许更改」时要点「是」，再点一次安装');
  say('装好了', 100);
}
// 登录：后台跑 tailscale up，拿到登录网址就在浏览器里打开
async function tsLogin() {
  if (!tsExe()) throw new Error('先装 Tailscale');
  const s0 = tsState();
  if (s0.loggedIn) return { ok: true, already: true };
  if (TEST) throw new Error('测试模式：不真的登录 Tailscale');
  spawn(tsExe(), ['up'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const s = tsState();
    if (s.loggedIn) return { ok: true };
    if (/^https:\/\//.test(s.authUrl)) { openUrl(s.authUrl); return { ok: true, url: s.authUrl }; }
  }
  throw new Error(MAC ? '没拿到登录网址：点屏幕右上角菜单栏里的 Tailscale 图标登录也行' : '没拿到登录网址：点电脑右下角托盘里的 Tailscale 图标登录也行');
}
function tsServe(on) {
  if (!tsExe()) throw new Error('先装 Tailscale');
  if (TEST) return tsState();   // 测试模式：不动真的转发
  if (on) tsRun(['serve', '--bg', '--yes', '--http', String(TS_PORT), `http://127.0.0.1:${GPORT}`]);
  else { try { tsRun(['serve', '--http', String(TS_PORT), 'off']); } catch {} }
  return tsState();
}

// ---------- 4. 留言板：读 GitHub Issues（公开，不用登录） ----------
async function board() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=50&labels=${encodeURIComponent('留言')}`, { headers: { 'User-Agent': 'eci-installer' } });
  if (!r.ok) throw new Error('读不到留言（' + r.status + '）');
  return (await r.json()).map(i => ({ title: i.title, body: (i.body || '').slice(0, 2000), user: i.user?.login, at: i.created_at, url: i.html_url, comments: i.comments }));
}
const newIssueUrl = (title, body) => `https://github.com/${REPO}/issues/new?labels=${encodeURIComponent('留言')}&title=${encodeURIComponent(title || '留言')}&body=${encodeURIComponent(body || '')}`;

// ---------- 7. 手机连接：防火墙放行 7788（要管理员，弹一次确认） ----------
// 规则对所有网络都放行（家里的 Wi-Fi 常常被 Windows 当成「公用网络」，只放行专用网络会连不上）
async function firewall(on) {
  if (MAC || TEST) return;   // Mac 默认不拦；测试模式不动真的防火墙
  const add = 'netsh advfirewall firewall add rule name=EciSimulator dir=in action=allow protocol=TCP localport=7788 profile=any';
  const del = 'netsh advfirewall firewall delete rule name=EciSimulator';
  const cmd = on ? `${del} >nul 2>&1 & ${add}` : del;   // 放行：先删掉旧的（以前只放行专用网络），再建新的
  await psAsync(`Start-Process cmd -ArgumentList '/c ${cmd}' -Verb RunAs -WindowStyle Hidden -Wait`);
}
const hasFwRule = () => { if (MAC) return false; try { execSync('netsh advfirewall firewall show rule name=EciSimulator', { windowsHide: true, stdio: 'ignore' }); return true; } catch { return false; } };
// 真的查：规则在不在、管不管得到现在连的网络；有没有专门拦 node.exe 的规则（以前在 Windows 弹窗里点过「取消」就会有）
async function fwState() {
  const lan = !!readJson(cfgFile(), {}).lan?.enabled;
  if (MAC) return { on: true, mac: true, lan };   // Mac 不用放行
  try {
    const j = JSON.parse(await psAsync(`$rules = @(Get-NetFirewallRule -DisplayName 'EciSimulator' -ErrorAction SilentlyContinue | Where-Object { [string]$_.Enabled -eq 'True' -and [string]$_.Direction -eq 'Inbound' -and [string]$_.Action -eq 'Allow' } | ForEach-Object { [string]$_.Profile });
$nets = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.NetworkCategory });
$block = @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue | Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -like '*node.exe' } | ForEach-Object { $_.DisplayName });
@{ rules = $rules; nets = $nets; block = $block } | ConvertTo-Json -Compress`));
    const list = x => [].concat(x || []);
    const rules = list(j.rules), nets = list(j.nets), block = list(j.block);
    const covers = p => /any/i.test(p) || nets.every(n => p.includes(/domain/i.test(n) ? 'Domain' : n));
    const on = rules.some(covers);
    return { on, exists: rules.length > 0, nets, nodeBlocked: block.length > 0, lan };
  } catch {   // PowerShell 查不了：退回只看规则在不在
    return { on: hasFwRule(), lan };
  }
}

// ---------- 5. 卸载 ----------
// 大脑指着 8080（本地模型）：本地模型删了，这个选择也清掉（所有存档的设置、还没装游戏时先选的）
function clearLocalBrain() {
  const s = state(), d = dirs(s);
  const fix = f => { const c = readJson(f, null); if (c && c.brain === 'api' && is8080(c.api?.base)) { delete c.brain; delete c.api; writeJson(f, c); } };
  if (isGame(d.game)) fix(cfgFile());
  try { for (const n of fs.readdirSync(savesDir(s))) fix(path.join(savesDir(s), n, 'app', 'config.json')); } catch {}
  const p = s.pendingCfg;
  if (p && p.brain === 'api' && is8080(p.api?.base)) { const { brain, api, ...rest } = p; saveState({ pendingCfg: Object.keys(rest).length ? rest : null }); }
}
async function uninstall(parts, say) {
  if (parts.includes('installer')) parts = ['game', 'llm', 'tts', 'installer'];   // 游戏的启动脚本要用安装器里的东西：删安装器就要连游戏一起删
  const s = state(), d = dirs(s);
  try {
    // 先停下正在进行的下载和安装，等它们真的停了再删（不然这边删完、那边又解压回来）
    const busy = Object.entries(jobs).filter(([n, j]) => n !== 'uninstall' && !j.done);
    if (busy.length) {
      say('先停下正在进行的下载和安装', 5);
      cancelling = true;
      killKids();
      for (let i = 0; i < 60 && Object.entries(jobs).some(([n, j]) => n !== 'uninstall' && !j.done); i++) { killKids(); await new Promise(r => setTimeout(r, 500)); }
    }
    say('关掉正在运行的游戏、模型和配音', 15);
    await stopOurs('game', 'watch', 'llm', 'tts');
    const left = [];
    // 删完挨个看真的没了；被占着就等一秒再删，最多 5 次；还删不掉就记下来，最后报错（不说「删干净了」）
    const del = async (p, name, who) => {
      say('删除 ' + name);
      if (await rmrfRetry(p)) return true;
      left.push(`${name}（${p}，${who}）`); return false;
    };
    if (parts.includes('llm') && await del(d.llm, '语言模型', '本地模型的黑窗口可能还开着')) { saveState({ llm: null }); clearLocalBrain(); }
    if (parts.includes('tts') && await del(d.tts, '配音', '配音的黑窗口可能还开着')) saveState({ tts: null });
    if (parts.includes('game')) {
      const held = '游戏窗口、这个文件夹的资源管理器窗口或编辑器可能还开着';
      await del(d.game, '游戏本体和存档', held);
      await del(savesDir(s), '其他存档', held);
      await del(templateDir(s), '新存档用的模板', held);
      try { fs.unlinkSync(path.join(desktop(), '恶雌模拟器.lnk')); } catch {}
      if (MAC) rmrf(path.join(desktop(), '恶雌模拟器.command'));
      // 游戏没了，放行游戏端口的防火墙规则也删掉（没有这条规则就不弹「是否允许更改」）
      if (!MAC && !TEST && hasFwRule()) { say('删除防火墙规则（Windows 问「是否允许更改」时点「是」）'); try { await firewall(false); } catch {} }
      if (!isGame(d.game)) saveState({ game: null, save: null });
    }
    if (left.length) throw new Error('没删干净：' + left.join('；') + '。关掉它再点一次卸载');
    if (parts.includes('installer')) {
      try { if (tsExe()) tsServe(false); } catch {}
      if (MAC) {   // Mac：桌面图标都删掉；安装器文件夹（连同自己下的 Node.js）等这个程序退出后再删
        for (const n of MAC_ICONS) rmrf(path.join(desktop(), n));
        try { fs.rmdirSync(s.root); } catch {}
        say('安装器会在关掉后把自己删掉');
        spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', path.resolve(HOME)], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => process.exit(0), 1500);
        return;
      }
      try { fs.rmdirSync(s.root); } catch {}
      try { fs.unlinkSync(path.join(desktop(), '恶雌模拟器安装器.lnk')); } catch {}
      say('安装器会在关掉后把自己删掉');
      // 自己删不了正在运行的自己：交给一个等 3 秒的 cmd
      spawn('cmd', ['/c', `ping -n 4 127.0.0.1 >nul & rmdir /s /q "${path.resolve(HOME)}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
      setTimeout(() => process.exit(0), 1500);
    } else writeLaunchers();
    say(parts.length === 1 ? '删好了' : '选中的都删好了', 100);
  } finally {
    try { reconcile(true); } catch {}   // 出错、删了一半：state 照磁盘上的真样子改
    cancelling = false;   // 只卸了一部分（或者出错了）：之后还能接着装
    for (const t of ['tmp', 'tmp-rename', 'tmp-tailscale', 'tmp-ollama', 'tmp-lmstudio']) rmrf(path.join(HOME, t));
  }
}

// ---------- 网页 ----------
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((ok, no) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); }); }
const routes = {
  'GET /api/state': async () => {
    state(); try { reconcile(); } catch {}   // 先读一次（坏了就备份），再照磁盘改正
    const s = state(), d = dirs(s);
    const cfg = brainCfg();
    const [running, brainWhat] = await Promise.all([ourRunning(), brainName(cfg)]);
    return { ...s, platform: MAC ? 'darwin' : process.platform, dirs: d, home: HOME, free: freeGB(s.root), stateBroken, test: TEST,
      brain: cfg.brain || (isGame(d.game) ? 'claude' : null), brainWhat,
      api: { ...(cfg.api || {}), key: cfg.api?.key ? cfg.api.key.slice(0, 4) + '…' + cfg.api.key.slice(-4) : '' }, claude: findClaude(),
      custom: fs.existsSync(path.join(d.game, '自定义规则.md')), template: isGame(templateDir(s)), running };
  },
  'POST /api/pick-folder': async () => ({ path: await pickFolder() }),
  'POST /api/location': async b => { job('location', say => moveRoot(b.dir, say)); return { ok: true }; },
  'GET /api/game/check': async () => { const r = await remoteVersion(); return { remote: r, local: state().game?.version || null }; },
  'POST /api/game/install': async () => { job('game', installGame); return { ok: true }; },
  'POST /api/game/open': async () => {
    if (!isGame(dirs().game)) throw new Error('还没有游戏：先装游戏本体或新建一个存档');
    if (MAC) { macOpen(path.join(dirs().game, '启动游戏.command')); return { ok: true }; }   // 在终端里打开
    spawn('cmd', ['/c', 'start', '""', path.join(dirs().game, '启动游戏.bat')], { detached: true, windowsHide: true }); return { ok: true };
  },
  'GET /api/llm/check': async () => llmPlan(),
  'GET /api/llm/detect': async () => detectLLM(),
  'POST /api/ollama/oneclick': async b => { job('ollama', say => oneClickOllama(say, String(b.model || '').trim())); return { ok: true }; },
  'POST /api/lmstudio/oneclick': async () => { job('lmstudio', say => oneClickLMStudio(say)); return { ok: true }; },
  'POST /api/brain/models': async b => listModels(b.api || {}),
  'POST /api/llm/install': async b => { job('llm', say => installLLM(b.tier, b.build, say)); return { ok: true }; },
  'POST /api/llm/test': async () => { job('llmtest', testLLM); return { ok: true }; },
  'POST /api/brain': async b => ({ ok: true, config: !!setBrain(b) }),   // 游戏没装也能先选，装的时候带过去
  'POST /api/brain/test': async b => {
    const t = { ...b.api };
    if (!t.base || !t.model) return { ok: false, error: '接口地址和模型名都要填' };
    if (t.key && t.key.includes('…')) t.key = brainCfg().api?.key || '';
    // 本机模型第一次要先把模型读进内存，给 2 分钟
    try {
      const r = await fetch(t.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', signal: AbortSignal.timeout(LOCAL_RE.test(t.base) ? 120000 : 30000),
        headers: { 'Content-Type': 'application/json', ...(t.key ? { Authorization: 'Bearer ' + t.key } : {}) },
        body: JSON.stringify({ model: t.model, messages: [{ role: 'user', content: '只回复两个字：你好' }], max_tokens: 20 }) });
      const x = await r.text();
      if (!r.ok) return { ok: false, error: `${r.status}：${x.slice(0, 200)}` };
      return { ok: true, reply: JSON.parse(x).choices?.[0]?.message?.content || '' };
    } catch (e) { return { ok: false, error: '连不上：' + (e.cause?.code || e.message) }; }
  },
  'GET /api/tts/check': async () => ttsPlan(),
  'POST /api/tts/install': async () => {
    if (!isGame(dirs().game)) throw new Error('先装游戏本体');
    const p = ttsPlan(); if (!p.ok) throw new Error(p.why.filter(w => !w.includes('二选一')).join('；') || '检查没通过');
    job('tts', installTTS); return { ok: true };
  },
  'GET /api/board': async () => board(),
  // 留言正文太长网址会超长：截到 1500 字
  'POST /api/board/new': async b => { openUrl(newIssueUrl(String(b.title || '').slice(0, 100), String(b.body || '').slice(0, 1500))); return { ok: true }; },
  'POST /api/open': async b => { if (/^https:\/\//.test(b.url)) openUrl(b.url); return { ok: true }; },
  'POST /api/firewall': async b => { await firewall(!!b.on); return { ok: true }; },
  'POST /api/geo': async b => { try { return { ok: true, ...(await geo(String(b.city || '').trim())) }; } catch (e) { return { ok: false, error: e.message }; } },
  'GET /api/gameup': async () => ({ up: await ourGameUp() }),   // 只认我们这一份游戏
  'GET /api/gamecfg': async () => (isGame(dirs().game) ? gameCfg() : { none: true }),
  'POST /api/gamecfg': async b => setGameCfg(b),
  'GET /api/tailscale': async () => tsState(),
  'POST /api/tailscale/install': async () => { job('tailscale', say => installTailscale(say)); return { ok: true }; },
  'POST /api/tailscale/login': async () => tsLogin(),
  'POST /api/tailscale/serve': async b => ({ ok: true, ...tsServe(!!b.on) }),
  // 防火墙规则在不在、管不管得到现在的网络（查不用管理员）；游戏设置里开没开手机连接
  'GET /api/firewall': async () => fwState(),
  'POST /api/uninstall': async b => {
    let parts = Array.isArray(b.parts) && b.parts.length ? b.parts.filter(p => ['game', 'llm', 'tts', 'installer'].includes(p)) : ['game', 'llm', 'tts', 'installer'];
    if (parts.includes('installer')) parts = ['game', 'llm', 'tts', 'installer'];   // 删安装器就要连游戏一起删（游戏的启动脚本用着安装器里的东西）
    job('uninstall', say => uninstall(parts, say)); return { ok: true, parts };
  },
  'GET /api/saves': async () => ({ list: listSaves(), template: isGame(templateDir()), next: freeSaveName() }),
  'POST /api/saves/new': async b => { job('saves', say => newSave(b.name, say)); return { ok: true }; },
  'POST /api/saves/load': async b => { job('saves', say => loadSave(b.name, say)); return { ok: true }; },
  'POST /api/saves/delete': async b => { job('saves', say => deleteSave(b.name, say)); return { ok: true }; },
  'POST /api/saves/rename': async b => { guard('saves'); renameSave(b.name, b.to); return { ok: true }; },
  'GET /api/custom': async () => {
    const ready = await brainReady(), d = dirs();
    let rules = ''; try { rules = fs.readFileSync(path.join(d.game, '自定义规则.md'), 'utf8').trim(); } catch {}
    return { ready, rules, log: readJson(path.join(d.game, 'app', '自定义记录.json'), []).slice(-20).reverse(), save: state().save || '存档 1' };
  },
  'POST /api/custom': async b => {
    const ready = await brainReady(); if (!ready.ok) throw new Error(ready.why);
    return withGame(base => gameApi(base, '/api/custom', { text: b.text }));
  },
  'POST /api/custom/save': async b => {
    if (!isGame(dirs().game)) throw new Error('先装游戏本体');
    const f = path.join(dirs().game, '自定义规则.md'), t = String(b.rules || '').trim();
    if (t) fs.writeFileSync(f, t + '\n', 'utf8'); else rmrf(f);
    // 真的写进去了才算
    const now = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    if (now !== t) throw new Error('没存上：' + f + ' 写不进去');
    return { ok: true };
  },
  'GET /api/jobs': async () => jobs,
};
async function up(u) { try { return (await fetch(u, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } }

// 安装器网页关掉 3 分钟、又没有下载 / 安装在跑：安装器自己退出（网页开着每秒都会来问一次）
let lastHit = Date.now();
setInterval(() => { if (Date.now() - lastHit > 180000 && Object.values(jobs).every(j => j.done)) process.exit(0); }, 30000).unref();
// 别的网站不能借她的浏览器来点这里的按钮：Host 只认本机地址；POST 要是 JSON、来源（Origin）要是这个页面自己
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
function allowed(req, url) {
  if (!HOSTS.includes(String(req.headers.host || '').toLowerCase())) return false;
  if (req.method !== 'GET' && url.startsWith('/api/')) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return false;
    const o = req.headers.origin;
    if (o && !HOSTS.map(h => 'http://' + h).includes(o.toLowerCase())) return false;
  }
  return true;
}
const server = http.createServer(async (req, res) => {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
  const url = req.url.split('?')[0];
  if (!allowed(req, url)) return json(res, { ok: false, error: '不让外面的网页调用' }, 403);
  lastHit = Date.now();
  try {
    const fn = routes[`${req.method} ${url}`];
    if (fn) return json(res, await fn(req.method === 'POST' ? await body(req) : {}));
    const file = path.join(HERE, 'web', decodeURIComponent(url === '/' ? 'index.html' : url.slice(1)));
    if (!file.startsWith(path.join(HERE, 'web')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { json(res, { ok: false, error: e.message }, 500); }
});
server.listen(PORT, '127.0.0.1', () => { if (!process.env.NO_OPEN) openUrl(`http://127.0.0.1:${PORT}/`); });
server.on('error', e => { if (e.code === 'EADDRINUSE') { if (!process.env.NO_OPEN) openUrl(`http://127.0.0.1:${PORT}/`); setTimeout(() => process.exit(0), 800); } });
