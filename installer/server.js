// 恶雌模拟器安装器：本地网页（端口 7790）+ 这个 Node 小服务。不依赖任何 npm 包。
// 管的东西：安装位置 / 游戏本体 / 语言模型 / 配音 / 留言板 / 卸载。状态记在 %LOCALAPPDATA%\EciSimulator\state.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');

const REPO = 'mxxs109-ops/eci-simulator';
const BRANCH = 'main';
const PORT = Number(process.env.ECI_PORT) || 7790;
const HOME = process.env.ECI_HOME || path.join(process.env.LOCALAPPDATA || os.homedir(), 'EciSimulator');   // ECI_HOME：测试时换个地方   // 安装器自己住的地方
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
function state() { return { root: defaultRoot(), game: null, llm: null, tts: null, ...readJson(STATE_FILE, {}) }; }
function saveState(patch) { const s = { ...state(), ...patch }; writeJson(STATE_FILE, s); return s; }
const dirs = (s = state()) => ({ game: path.join(s.root, 'game'), llm: path.join(s.root, 'llm'), tts: path.join(s.root, 'tts') });
// PowerShell 的输出按 UTF-8 读：不然中文路径（选文件夹、桌面在中文用户名下）会变成乱码
const ps = cmd => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${cmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8', windowsHide: true }).trim();
const desktop = () => { try { return ps('[Environment]::GetFolderPath(\'Desktop\')'); } catch { return path.join(os.homedir(), 'Desktop'); } };
function writeBat(file, lines) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, ['@echo off', 'chcp 65001 >nul', ...lines, ''].join('\r\n'), 'utf8'); }
// 桌面图标：用 shortcut.ps1（IShellLinkW），中文名字、中文路径在任何语言的 Windows 上都行
function shortcut(name, target, args, icon) {
  const lnk = path.join(process.env.ECI_HOME ? HOME : desktop(), name + '.lnk');   // 测试时图标放进测试文件夹，不动真桌面
  const r = require('child_process').spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'shortcut.ps1'),
    lnk, target, args || '', path.dirname(target), icon || ''], { windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('建桌面图标失败：' + (r.stderr || '').slice(0, 200));
}
const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch {} };
// 端口上的程序是不是我们装的：模型、配音看程序文件在不在安装文件夹里；游戏问它自己的文件夹
function portPid(port) { try { return Number(ps(`(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`)) || 0; } catch { return 0; } }
async function stopOurs(...which) {
  const d = dirs();
  for (const w of which) {
    const port = { game: 7788, llm: 8080, tts: 9880 }[w], pid = portPid(port);
    if (!pid) continue;
    let ours = false;
    if (w === 'game') {
      try { const st = await (await fetch('http://127.0.0.1:7788/api/status', { signal: AbortSignal.timeout(1500) })).json(); ours = !!st.gameDir && path.resolve(st.gameDir).toLowerCase() === path.resolve(d.game).toLowerCase(); } catch {}
    } else {
      try { ours = ps(`(Get-Process -Id ${pid}).Path`).toLowerCase().startsWith(path.resolve(d[w]).toLowerCase()); } catch {}
    }
    if (ours) { try { process.kill(pid); } catch {} }
  }
  await new Promise(r => setTimeout(r, 1500));
}

// ---------- 后台任务（下载、安装）：网页每秒来问进度 ----------
const jobs = {};   // name → { step, pct, log[], done, error }
function job(name, fn) {
  if (jobs[name] && !jobs[name].done) throw new Error('正在进行中');
  const j = jobs[name] = { step: '准备中', pct: 0, log: [], done: false, error: '' };
  const say = (step, pct) => { j.step = step; if (pct != null) j.pct = pct; j.log.push(`${new Date().toLocaleTimeString()} ${step}`); if (j.log.length > 200) j.log.shift(); };
  fn(say).then(() => { j.done = true; j.pct = 100; say('完成'); }).catch(e => { j.done = true; j.error = e.message; say('出错：' + e.message); });
  return j;
}
// 断线续传下载：用 Windows 自带的 curl.exe，按文件大小算进度
async function download(url, file, say, label) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let total = 0;
  try { const h = await fetch(url, { method: 'HEAD', redirect: 'follow' }); total = Number(h.headers.get('content-length')) || 0; } catch {}
  if (total && fs.existsSync(file) && fs.statSync(file).size === total) return;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const ok = await new Promise(resolve => {
      const p = spawn('curl.exe', ['-L', '-C', '-', '--retry', '5', '--connect-timeout', '30', '-s', '-o', file, url], { windowsHide: true });
      const t = setInterval(() => {
        const got = fs.existsSync(file) ? fs.statSync(file).size : 0;
        say(`${label}：${(got / 1e9).toFixed(2)}${total ? ' / ' + (total / 1e9).toFixed(2) : ''} GB`, total ? Math.floor(got / total * 100) : null);
      }, 1000);
      p.on('close', code => { clearInterval(t); resolve(code === 0); });
    });
    if (ok && (!total || fs.statSync(file).size >= total)) return;
    say(`${label}：第 ${attempt} 次断线，10 秒后接着下`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error(label + ' 下载失败，检查一下网络再试');
}
// 解压：用 .NET 的 ZipFile 按 UTF-8 读文件名（Windows 自带的 tar 在日文、英文系统上读不了中文文件名）
// 先解到临时文件夹再合并进去，目标文件夹里已经有东西也不怕
function unzip(zip, dest) {
  const tmp = dest.replace(/[\\/]+$/, '') + '.unzip-tmp';
  rmrf(tmp);
  const q = s => "'" + s.replace(/'/g, "''") + "'";
  ps(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${q(zip)}, ${q(tmp)}, [Text.Encoding]::UTF8)`);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(tmp, dest, { recursive: true, force: true });
  rmrf(tmp);
}
function run(cmd, args, opts, say) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let tail = '';
    const eat = d => { tail = (tail + d.toString('utf8')).slice(-3000); const l = tail.trim().split(/\r?\n/).pop(); if (l && say) say(l.slice(0, 160)); };
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} 退出码 ${code}：${tail.slice(-400)}`)));
  });
}

// ---------- 0. 安装位置 ----------
function pickFolder() {
  return ps("Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='选一个文件夹，游戏和模型都装在这里面'; $f.ShowNewFolderButton=$true; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}");
}
function freeGB(p) {
  try { const drive = path.parse(path.resolve(p)).root.replace(/[\\:]/g, ''); return Math.floor(Number(ps(`(Get-PSDrive ${drive}).Free`)) / 1e9); } catch { return null; }
}
async function moveRoot(to, say) {
  const s = state();
  const from = s.root;
  to = path.resolve(to);
  if (to.toLowerCase() === path.resolve(from).toLowerCase()) return;
  if (to.toLowerCase().startsWith(path.resolve(from).toLowerCase() + path.sep)) throw new Error('不能搬到原来文件夹的里面');
  if (fs.existsSync(from) && (s.game || s.llm || s.tts)) {
    say('先关掉正在运行的游戏、模型和配音');
    await stopOurs('game', 'llm', 'tts');
    fs.mkdirSync(to, { recursive: true });
    for (const name of ['game', 'saves', 'template', 'llm', 'tts']) {
      const a = path.join(from, name), b = path.join(to, name);
      if (!fs.existsSync(a)) continue;
      say(`正在搬 ${name}（大文件可能要几分钟）`);
      try { fs.renameSync(a, b); }   // 同一个盘：一下就好
      catch { await run('robocopy', [a, b, '/E', '/MOVE', '/NFL', '/NDL', '/NJH', '/NJS'], {}, say).catch(e => { if (!/退出码 [0-7]：/.test(e.message)) throw e; }); }
    }
    try { fs.rmdirSync(from); } catch {}
  }
  saveState({ root: to });
  writeLaunchers();
  say('搬好了：' + to);
}

// ---------- 启动脚本和桌面图标 ----------
function writeLaunchers() {
  const s = state(), d = dirs(s);
  if (!s.game) return;
  const lines = ['title 恶雌模拟器', 'rem 本机模型和配音装了就顺手开（已经在跑就不重复开）'];
  if (s.llm) lines.push(`netstat -ano | findstr ":8080 " | findstr LISTENING >nul || start "恶雌模拟器-本地模型" /min "${path.join(d.llm, '启动本地模型.bat')}"`);
  if (s.tts) lines.push(`netstat -ano | findstr ":9880 " | findstr LISTENING >nul || start "恶雌模拟器-配音" /min "${path.join(d.tts, '启动配音.bat')}"`);
  lines.push(`cd /d "${path.join(d.game, 'app')}"`, `"${NODE}" server.js`, 'pause');
  writeBat(path.join(d.game, '启动游戏.bat'), lines);
  const ico = path.join(d.game, 'app', 'icon.ico');
  shortcut('恶雌模拟器', path.join(d.game, '启动游戏.bat'), '', fs.existsSync(ico) ? ico : '');
}

// ---------- 1. 游戏本体：下载、更新 ----------
const SAVE_FILES = ['自定义规则.md', 'app/自定义记录.json', '状态.md', '物品与等级.md', '回忆.md', '回忆摘要.md', '我的一天.md', '模拟日志.md', '崽崽.md', '开局.json', '兽夫日记', '归档',
  'app/config.json', 'app/history.json', 'app/session.json', 'app/session-api.json', 'app/sim.json', 'app/room.json', 'app/ui.json', 'app/uploads', '配音/缓存'];
async function remoteVersion() {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/version.json?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('连不上 GitHub（' + r.status + '）');
  return r.json();
}
async function fetchRepo(say) {
  const tmp = path.join(HOME, 'tmp'); rmrf(tmp); fs.mkdirSync(tmp, { recursive: true });
  const zip = path.join(tmp, 'repo.zip');
  await download(`https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`, zip, say, '下载游戏');
  say('解压');
  unzip(zip, tmp);
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
async function installGame(say) {
  const s = state(), d = dirs(s);
  const repo = await fetchRepo(say);
  const ver = readJson(path.join(repo, 'version.json'), { version: '?' });
  const fresh = !fs.existsSync(path.join(d.game, 'app', 'server.js'));
  say('准备干净的模板（新建存档用）');
  rmrf(templateDir(s)); fs.mkdirSync(s.root, { recursive: true });
  fs.cpSync(path.join(repo, 'game'), templateDir(s), { recursive: true });
  fs.copyFileSync(path.join(repo, 'version.json'), path.join(templateDir(s), 'version.json'));
  if (fresh) {
    say('复制游戏文件');
    cloneDir(templateDir(s), d.game);
    saveState({ save: '存档 1' });
  } else {
    say('更新游戏（存档和设置不动）');
    await stopOurs('game');
    updateDir(d.game, say);
  }
  fs.copyFileSync(path.join(repo, 'version.json'), path.join(d.game, 'version.json'));
  // 安装器自己也跟着更新
  say('更新安装器');
  fs.cpSync(path.join(repo, 'installer'), path.join(HOME, 'installer'), { recursive: true });
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
// 设置（大脑、接口、手机、城市）是全局的：换存档时带过去
function carryConfig(from, to) {
  const a = readJson(path.join(from, 'app', 'config.json'), {}), f = path.join(to, 'app', 'config.json');
  const b = readJson(f, {});
  for (const k of ['brain', 'api', 'handoff', 'lan', 'city']) if (a[k] !== undefined) b[k] = a[k];
  writeJson(f, b);
}
async function newSave(name, say) {
  const s = state(), d = dirs(s);
  name = saveName(name);
  if (!isGame(templateDir(s))) throw new Error('没有模板：先在「游戏本体」里点一次「更新」');
  const to = path.join(savesDir(s), name);
  say('复制一份干净的游戏');
  cloneDir(templateDir(s), to);
  if (isGame(d.game)) carryConfig(d.game, to);
  say('建好了「' + name + '」，点「加载」开始玩');
}
async function loadSave(name, say) {
  const s = state(), d = dirs(s);
  const cur = s.save || '存档 1';
  if (name === cur) return say('正在玩的就是「' + name + '」');
  const from = path.join(savesDir(s), name);
  if (!isGame(from)) throw new Error('找不到存档「' + name + '」');
  say('关掉正在运行的游戏');
  await stopOurs('game');
  await new Promise(r => setTimeout(r, 800));
  fs.mkdirSync(savesDir(s), { recursive: true });
  const park = path.join(savesDir(s), cur);
  if (fs.existsSync(park)) throw new Error('saves 文件夹里已经有「' + cur + '」，先给它改个名');
  say('把「' + cur + '」收起来');
  try { fs.renameSync(d.game, park); } catch (e) { throw new Error('游戏文件夹正被占用（开着的黑窗口、文件夹窗口、编辑器？）关掉再试：' + e.code); }
  say('换上「' + name + '」');
  try { fs.renameSync(from, d.game); } catch (e) { fs.renameSync(park, d.game); throw new Error('换不过去，已经还原：' + e.code); }
  carryConfig(park, d.game);
  saveState({ save: name });
  const ver = state().game?.version;
  if (ver && readJson(path.join(d.game, 'version.json'), {}).version !== ver && isGame(templateDir())) {
    say('这个存档的程序是旧版本，更新到 ' + ver);
    updateDir(d.game, say);
    fs.copyFileSync(path.join(templateDir(), 'version.json'), path.join(d.game, 'version.json'));
  }
  writeLaunchers();
  say('现在玩的是「' + name + '」');
}
function deleteSave(name) {
  const s = state();
  if (name === (s.save || '存档 1')) throw new Error('正在玩的存档不能删：先加载别的存档');
  const p = path.join(savesDir(s), name);
  if (!isGame(p)) throw new Error('找不到存档「' + name + '」');
  rmrf(p);
  if (fs.existsSync(p)) throw new Error('有文件被占用，没删干净：关掉打开着的文件再试');
}
function renameSave(name, to) {
  const s = state();
  to = saveName(to);
  if (name === (s.save || '存档 1')) { saveState({ save: to }); return; }
  fs.renameSync(path.join(savesDir(s), name), path.join(savesDir(s), to));
}

// ---------- 6. 自定义游戏机制：交给游戏的大脑整理成 自定义规则.md ----------
function brainReady() {
  const d = dirs(), cfg = readJson(path.join(d.game, 'app', 'config.json'), {});
  if (!isGame(d.game)) return { ok: false, why: '先装游戏本体' };
  if ((cfg.brain || 'claude') === 'claude') return findClaude() ? { ok: true, what: 'Claude Code' } : { ok: false, why: '还没装好语言模型：去「语言模型」选一个当大脑' };
  if (!cfg.api?.base || !cfg.api?.model) return { ok: false, why: '还没装好语言模型：去「语言模型」选一个当大脑' };
  return { ok: true, what: /127\.0\.0\.1|localhost/.test(cfg.api.base) ? '本地模型' : cfg.api.model };
}
// 游戏开着就直接问它；没开就临时开一个不跑整点模拟的后台，用完关掉
async function withGame(fn) {
  const d = dirs();
  try {
    const st = await (await fetch('http://127.0.0.1:7788/api/status', { signal: AbortSignal.timeout(1500) })).json();
    if (st.gameDir && path.resolve(st.gameDir).toLowerCase() === path.resolve(d.game).toLowerCase()) return await fn('http://127.0.0.1:7788');
  } catch {}
  if (brainReady().what === '本地模型' && !(await up('http://127.0.0.1:8080/health')) && state().llm) {
    spawn('cmd', ['/c', 'start', '"恶雌模拟器-本地模型"', '/min', path.join(dirs().llm, '启动本地模型.bat')], { windowsHide: true, detached: true });
    for (let i = 0; i < 90 && !(await up('http://127.0.0.1:8080/health')); i++) await new Promise(r => setTimeout(r, 2000));
  }
  const port = 7791;
  const child = spawn(NODE, ['server.js'], { cwd: path.join(d.game, 'app'), env: { ...process.env, PORT: String(port), NO_OPEN: '1', NO_SIM: '1' }, windowsHide: true });
  try {
    for (let i = 0; i < 40 && !(await up(`http://127.0.0.1:${port}/api/status`)); i++) await new Promise(r => setTimeout(r, 300));
    return await fn(`http://127.0.0.1:${port}`);
  } finally { try { child.kill(); } catch {} }
}
const gameApi = (base, p, b) => fetch(base + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

// ---------- 2. 语言模型：检查电脑 → 推荐 → 安装 ----------
function hardware() {
  const h = { ramGB: Math.round(os.totalmem() / 1e9), cpu: os.cpus()[0]?.model || '', cores: os.cpus().length, gpus: [], nvidia: null };
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
  const base = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/`;
  const zips = build === 'cuda' ? [`llama-${LLAMA_TAG}-bin-win-cuda-12.4-x64.zip`, 'cudart-llama-bin-win-cuda-12.4-x64.zip']
    : build === 'vulkan' ? [`llama-${LLAMA_TAG}-bin-win-vulkan-x64.zip`] : [`llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`];
  for (const z of zips) {
    const f = path.join(d.llm, 'download', z);
    await download(base + z, f, say, '下载 llama.cpp');
    say('解压 ' + z); unzip(f, path.join(d.llm, 'llama.cpp'));
  }
  await download(`https://huggingface.co/${MODEL_REPO}/resolve/main/${m.file}`, path.join(d.llm, 'models', m.file), say, '下载模型');
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
async function testLLM(say) {
  const d = dirs();
  await stopOurs('llm');
  spawn('cmd', ['/c', 'start', '"恶雌模拟器-本地模型"', '/min', path.join(d.llm, '启动本地模型.bat')], { windowsHide: true, detached: true });
  say('启动本地模型（第一次要把模型从硬盘读进内存，1～3 分钟）');
  for (let i = 0; i < 180; i++) {
    try { if ((await (await fetch('http://127.0.0.1:8080/health')).json()).status === 'ok') break; } catch {}
    await new Promise(r => setTimeout(r, 2000));
    if (i === 179) throw new Error('本地模型没起来，看看那个最小化的黑窗口里写了什么');
  }
  say('试写一句');
  const t0 = Date.now();
  const r = await (await fetch('http://127.0.0.1:8080/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '用一句话介绍你自己。' }], max_tokens: 80, chat_template_kwargs: { enable_thinking: false } }) })).json();
  say(`能用：${((Date.now() - t0) / 1000).toFixed(1)} 秒回了「${(r.choices?.[0]?.message?.content || '').slice(0, 40)}」`);
}
// 游戏的大脑写进游戏的 config.json
function setBrain(b) {
  const f = path.join(dirs().game, 'app', 'config.json');
  const c = readJson(f, {});
  if (b.brain) c.brain = b.brain;
  if (b.api) c.api = { ...(c.api || {}), ...b.api, key: b.api.key && !b.api.key.includes('…') ? b.api.key : (c.api || {}).key || '' };
  if (b.handoff) c.handoff = { ...(c.handoff || {}), ...b.handoff };
  writeJson(f, c);
  return c;
}
function findClaude() {
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  try { if (fs.readdirSync(ext).some(d => d.startsWith('anthropic.claude-code-'))) return 'VS Code 插件'; } catch {}
  try { execSync('where claude', { windowsHide: true, stdio: 'ignore' }); return '命令行 claude'; } catch {}
  return '';
}

// ---------- 3. 配音：检查 → 安装 ----------
function ttsPlan() {
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
async function installTTS(say) {
  const s = state(), d = dirs(s);
  const env = { ...process.env, UV_HTTP_TIMEOUT: '300', UV_PYTHON_INSTALL_DIR: path.join(d.tts, 'python'), UV_CACHE_DIR: path.join(d.tts, 'uv-cache') };
  const uv = path.join(d.tts, 'uv', 'uv.exe');
  if (!fs.existsSync(uv)) {
    const z = path.join(d.tts, 'download', 'uv.zip');
    await download('https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip', z, say, '下载 uv');
    unzip(z, path.join(d.tts, 'uv'));
  }
  const src = path.join(d.tts, 'index-tts');
  if (!fs.existsSync(path.join(src, 'pyproject.toml'))) {
    const z = path.join(d.tts, 'download', 'index-tts.zip');
    await download(`https://codeload.github.com/index-tts/index-tts/zip/${INDEX_TTS_SHA}`, z, say, '下载 IndexTTS');
    unzip(z, path.join(d.tts, 'download'));
    fs.renameSync(path.join(d.tts, 'download', `index-tts-${INDEX_TTS_SHA}`), src);
  }
  say('装 Python 环境和 PyTorch（几 GB，要一阵子）');
  await run(uv, ['sync'], { cwd: src, env }, say);
  await run(uv, ['pip', 'install', '-p', path.join(src, '.venv', 'Scripts', 'python.exe'), 'fastapi', 'uvicorn', 'huggingface_hub'], { cwd: src, env }, say);
  say('下载配音模型（约 5GB）');
  await run(path.join(src, '.venv', 'Scripts', 'python.exe'), ['-c',
    "from huggingface_hub import snapshot_download; snapshot_download('IndexTeam/IndexTTS-2.5', local_dir='checkpoints', max_workers=8)"], { cwd: src, env: { ...env, PYTHONUTF8: '1' } }, say);
  fs.copyFileSync(path.join(HERE, 'tts_server.py'), path.join(src, 'tts_server.py'));
  writeBat(path.join(d.tts, '启动配音.bat'), ['title 恶雌模拟器-配音 (端口 9880)', 'cd /d "%~dp0index-tts"',
    `set "VOICE_DIR=${path.join(d.game, '配音', '参考')}"`, 'set PYTHONUTF8=1', '.venv\\Scripts\\python.exe tts_server.py', 'pause']);
  rmrf(path.join(d.tts, 'download'));
  saveState({ tts: { at: new Date().toISOString() } });
  writeLaunchers();
  say('装好了（第一次开配音时还会自动下几个小模型，要等几分钟）');
}

// ---------- 4. 留言板：读 GitHub Issues（公开，不用登录） ----------
async function board() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=50&labels=${encodeURIComponent('留言')}`, { headers: { 'User-Agent': 'eci-installer' } });
  if (!r.ok) throw new Error('读不到留言（' + r.status + '）');
  return (await r.json()).map(i => ({ title: i.title, body: (i.body || '').slice(0, 2000), user: i.user?.login, at: i.created_at, url: i.html_url, comments: i.comments }));
}
const newIssueUrl = (title, body) => `https://github.com/${REPO}/issues/new?labels=${encodeURIComponent('留言')}&title=${encodeURIComponent(title || '留言')}&body=${encodeURIComponent(body || '')}`;

// ---------- 7. 手机连接：防火墙放行 7788（要管理员，弹一次确认） ----------
function firewall(on) {
  const cmd = on
    ? 'netsh advfirewall firewall add rule name=EciSimulator dir=in action=allow protocol=TCP localport=7788 profile=private'
    : 'netsh advfirewall firewall delete rule name=EciSimulator';
  ps(`Start-Process cmd -ArgumentList '/c ${cmd}' -Verb RunAs -WindowStyle Hidden -Wait`);
}

// ---------- 5. 卸载 ----------
async function uninstall(parts, say) {
  const s = state(), d = dirs(s);
  say('关掉正在运行的游戏、模型和配音');
  await stopOurs('game', 'llm', 'tts');
  const del = (p, name) => { say('删除 ' + name); rmrf(p); };
  if (parts.includes('llm')) { del(d.llm, '语言模型'); saveState({ llm: null }); }
  if (parts.includes('tts')) { del(d.tts, '配音'); saveState({ tts: null }); }
  if (parts.includes('game')) {
    del(d.game, '游戏本体和存档');
    del(savesDir(s), '其他存档');
    del(templateDir(s), '新存档用的模板');
    try { fs.unlinkSync(path.join(desktop(), '恶雌模拟器.lnk')); } catch {}
    saveState({ game: null });
  }
  if (parts.includes('installer')) {
    try { firewall(false); } catch {}
    try { fs.rmdirSync(s.root); } catch {}
    try { fs.unlinkSync(path.join(desktop(), '恶雌模拟器安装器.lnk')); } catch {}
    say('安装器会在关掉后把自己删掉');
    // 自己删不了正在运行的自己：交给一个等 3 秒的 cmd
    spawn('cmd', ['/c', `timeout /t 3 /nobreak >nul & rmdir /s /q "${HOME}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => process.exit(0), 1500);
  } else writeLaunchers();
}

// ---------- 网页 ----------
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((ok, no) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); }); }
const routes = {
  'GET /api/state': async () => {
    const s = state(), d = dirs(s);
    const cfg = readJson(path.join(d.game, 'app', 'config.json'), {});
    return { ...s, dirs: d, home: HOME, free: freeGB(s.root), brain: cfg.brain || 'claude', api: { ...(cfg.api || {}), key: cfg.api?.key ? cfg.api.key.slice(0, 4) + '…' + cfg.api.key.slice(-4) : '' }, claude: findClaude(),
      running: { game: await up('http://127.0.0.1:7788/api/status'), llm: await up('http://127.0.0.1:8080/health'), tts: await up('http://127.0.0.1:9880/health') } };
  },
  'POST /api/pick-folder': async () => ({ path: pickFolder() }),
  'POST /api/location': async b => { job('location', say => moveRoot(b.dir, say)); return { ok: true }; },
  'GET /api/game/check': async () => { const r = await remoteVersion(); return { remote: r, local: state().game?.version || null }; },
  'POST /api/game/install': async () => { job('game', installGame); return { ok: true }; },
  'POST /api/game/open': async () => { spawn('cmd', ['/c', 'start', '""', path.join(dirs().game, '启动游戏.bat')], { detached: true, windowsHide: true }); return { ok: true }; },
  'GET /api/llm/check': async () => llmPlan(),
  'POST /api/llm/install': async b => { job('llm', say => installLLM(b.tier, b.build, say)); return { ok: true }; },
  'POST /api/llm/test': async () => { job('llmtest', testLLM); return { ok: true }; },
  'POST /api/brain': async b => { if (!state().game) throw new Error('先装游戏本体'); return { ok: true, config: !!setBrain(b) }; },
  'POST /api/brain/test': async b => {
    const t = { ...b.api };
    if (t.key && t.key.includes('…')) t.key = readJson(path.join(dirs().game, 'app', 'config.json'), {}).api?.key || '';
    const r = await fetch(t.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', ...(t.key ? { Authorization: 'Bearer ' + t.key } : {}) },
      body: JSON.stringify({ model: t.model, messages: [{ role: 'user', content: '只回复两个字：你好' }], max_tokens: 20 }) });
    const x = await r.text();
    if (!r.ok) return { ok: false, error: `${r.status}：${x.slice(0, 200)}` };
    return { ok: true, reply: JSON.parse(x).choices?.[0]?.message?.content || '' };
  },
  'GET /api/tts/check': async () => ttsPlan(),
  'POST /api/tts/install': async () => { if (!ttsPlan().ok) throw new Error('检查没通过'); job('tts', installTTS); return { ok: true }; },
  'GET /api/board': async () => board(),
  'POST /api/board/new': async b => { exec(`start "" "${newIssueUrl(b.title, b.body).replace(/"/g, '%22')}"`); return { ok: true }; },
  'POST /api/open': async b => { if (/^https:\/\//.test(b.url)) exec(`start "" "${b.url.replace(/"/g, '%22')}"`); return { ok: true }; },
  'POST /api/firewall': async b => { firewall(!!b.on); return { ok: true }; },
  'POST /api/uninstall': async b => { job('uninstall', say => uninstall(b.parts || ['game', 'llm', 'tts', 'installer'], say)); return { ok: true }; },
  'GET /api/saves': async () => ({ list: listSaves(), template: isGame(templateDir()) }),
  'POST /api/saves/new': async b => { job('saves', say => newSave(b.name, say)); return { ok: true }; },
  'POST /api/saves/load': async b => { job('saves', say => loadSave(b.name, say)); return { ok: true }; },
  'POST /api/saves/delete': async b => { deleteSave(b.name); return { ok: true }; },
  'POST /api/saves/rename': async b => { renameSave(b.name, b.to); return { ok: true }; },
  'GET /api/custom': async () => {
    const ready = brainReady(), d = dirs();
    let rules = ''; try { rules = fs.readFileSync(path.join(d.game, '自定义规则.md'), 'utf8').trim(); } catch {}
    return { ready, rules, log: readJson(path.join(d.game, 'app', '自定义记录.json'), []).slice(-20).reverse(), save: state().save || '存档 1' };
  },
  'POST /api/custom': async b => {
    const ready = brainReady(); if (!ready.ok) throw new Error(ready.why);
    return withGame(base => gameApi(base, '/api/custom', { text: b.text }));
  },
  'POST /api/custom/save': async b => {
    const f = path.join(dirs().game, '自定义规则.md'), t = String(b.rules || '').trim();
    if (t) fs.writeFileSync(f, t + '\n', 'utf8'); else rmrf(f);
    return { ok: true };
  },
  'GET /api/jobs': async () => jobs,
};
async function up(u) { try { return (await fetch(u, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } }

const server = http.createServer(async (req, res) => {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
  const url = req.url.split('?')[0];
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
server.listen(PORT, '127.0.0.1', () => { if (!process.env.NO_OPEN) exec(`start "" http://127.0.0.1:${PORT}/`); });
server.on('error', e => { if (e.code === 'EADDRINUSE') { exec(`start "" http://127.0.0.1:${PORT}/`); process.exit(0); } });
