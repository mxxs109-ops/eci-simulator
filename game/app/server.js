// 恶雌模拟器：本地网页 <-> 游戏的大脑（Claude Code，或任何 OpenAI 兼容接口：GPT、DeepSeek、本地模型……）
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const localLLM = require('./local-llm');   // 〔接手：…〕 那段交给本地模型写
// 她的话沾一点亲密就整段交给本地模型；说了这些，上一轮没写完的亲密戏才算结束
const INTIMATE = /露骨|色情|涩|做爱|交合|交配|结合|性爱|上床|阴茎|阳具|肉棒|鸡巴|龟头|阴道|阴蒂|小穴|子宫|宫口|乳|奶子|胸|屁股|臀|肛|直肠|前列腺|下体|腿间|精液|射精|射了|内射|高潮|潮吹|呻吟|娇喘|喘息|一丝不挂|赤裸|裸|脱|衣服|吻|亲我|亲他|亲你|亲嘴|亲了|亲亲|舌|舔|吮|含住|摸|揉|捏|抚|抱|搂|贴着|蹭|骑|插|抽插|操|干我|要我|硬了|湿了|发情|易感期|热潮|逆鳞|洗澡|共浴|同睡|一起睡|暧昧|调情|撩|勾引|老公|宝贝/;
const SCENE_END = /停下|停吧|不要了|不做了|结束|睡了|睡吧|晚安|起床|出门|下次再/;
const agentApi = require('./agent-api');   // 不用 Claude 时：OpenAI 兼容接口 + 读写存档的工具

const PORT = Number(process.env.PORT) || 7788;
const APP_DIR = __dirname;
const GAME_DIR = path.dirname(APP_DIR);
const UPLOAD_DIR = path.join(APP_DIR, 'uploads');
const SESSION_FILE = path.join(APP_DIR, 'session.json');
const HISTORY_FILE = path.join(APP_DIR, 'history.json');
const START_FILE = path.join(GAME_DIR, '开局.json');

// 设置：用哪个大脑、交接给谁、手机连接、天气用哪个城市（安装器和游戏里的「设置」都写这个文件）
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
function readConfig() {
  const c = readJson(CONFIG_FILE, {});
  return {
    brain: c.brain || 'claude',                                   // claude | api
    api: { base: '', key: '', model: '', ...(c.api || {}) },      // brain = api 时用
    handoff: { base: 'http://127.0.0.1:8080/v1', key: '', model: '', ...(c.handoff || {}) },
    lan: { enabled: false, token: '', ...(c.lan || {}) },
    city: c.city || '',                                           // 空 = 按网络位置自动定位
  };
}
function saveConfig(patch) {
  const c = { ...readJson(CONFIG_FILE, {}), ...patch };
  writeJson(CONFIG_FILE, c);
  return readConfig();
}
const MAX_BODY = 60 * 1024 * 1024;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/* ---------- 配音：IndexTTS 服务（D:\AI\TTS，端口 9880）按句生成，存进 配音/缓存，同一句只生成一次 ---------- */
const TTS_URL = process.env.TTS_URL || 'http://127.0.0.1:9880';
const VOICE_CACHE = path.join(path.dirname(__dirname), '配音', '缓存');
const voiceJobs = new Map();
function voiceKey(b) { return crypto.createHash('sha1').update([b.who || '旁白', b.text || '', b.emo || ''].join('|')).digest('hex').slice(0, 20); }
async function makeVoice(b) {
  const key = voiceKey(b), file = path.join(VOICE_CACHE, key + '.wav');
  if (fs.existsSync(file)) return file;
  if (voiceJobs.has(key)) return voiceJobs.get(key);
  const job = (async () => {
    const r = await fetch(TTS_URL + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: b.text, speaker: b.who || '旁白', emo_text: b.emo || null }) });
    if (!r.ok) throw new Error('tts ' + r.status);
    fs.mkdirSync(VOICE_CACHE, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return file;
  })().finally(() => voiceJobs.delete(key));
  voiceJobs.set(key, job);
  return job;
}

function findClaude() {
  const extRoot = path.join(os.homedir(), '.vscode', 'extensions');
  try {
    const candidates = fs.readdirSync(extRoot)
      .filter(d => d.startsWith('anthropic.claude-code-'))
      .map(d => path.join(extRoot, d, 'resources', 'native-binary', 'claude.exe'))
      .filter(p => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (candidates.length) return candidates[0];
  } catch {}
  return 'claude'; // 退而求其次：PATH 里的 claude
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('文件太大了（上限 60MB）')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---------- 时间 ----------
const pad = n => String(n).padStart(2, '0');
function dateStr(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function timeStr(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function periodOf(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return '凌晨';
  if (h < 10) return '早上';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}
function stamp(d = new Date()) { return `${dateStr(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }

// ---------- 保存上传的文件 ----------
function safeName(name) {
  return (name || 'file').replace(/[\\/:*?"<>|\s]+/g, '_').slice(-60);
}
function saveFiles(files, dir, prefix) {
  fs.mkdirSync(dir, { recursive: true });
  return (files || []).map((f, i) => {
    const ext = path.extname(f.name || '').toLowerCase() || '.bin';
    const base = path.basename(safeName(f.name), path.extname(f.name || ''));
    const fileName = `${prefix}_${i + 1}_${base}${ext}`;
    fs.writeFileSync(path.join(dir, fileName), Buffer.from(f.data, 'base64'));
    return { fileName, isImage: /^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(ext) };
  });
}

// ---------- 兽夫立绘 + 状态 ----------
// 立绘放在 兽世/立绘/名字.jpg（png/webp 也行）；好感、心情从 状态.md 的表格里读
const PORTRAIT_DIR = path.join(GAME_DIR, '立绘');
// 取 状态.md 里某个「## 标题」下面那张表的数据行（去掉表头和分隔线）
function sectionRows(md, title) {
  const start = md.search(new RegExp(`^##\\s*${title}`, 'm'));
  if (start < 0) return [];
  const rest = md.slice(start).split(/\r?\n/).slice(1);
  const end = rest.findIndex(l => /^##\s/.test(l));
  const rows = (end < 0 ? rest : rest.slice(0, end))
    .filter(l => /^\|/.test(l) && !/^\|\s*:?-/.test(l))
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
  return rows.slice(1); // 第一行是表头
}
function readFoodTable(md) {
  return Object.fromEntries(sectionRows(md, '饮食与(?:健康|营养)').map(([name, meals, nutrition, body, sleep, exercise]) => [name, { meals, nutrition, body, sleep, exercise }]));
}
function listCast() {
  let files = [];
  try { files = fs.readdirSync(PORTRAIT_DIR).filter(n => /\.(png|jpe?g|webp)$/i.test(n)); } catch {}
  let animFiles = [];
  try { animFiles = fs.readdirSync(path.join(PORTRAIT_DIR, '动画素材')); } catch {}
  let status = '';
  try { status = fs.readFileSync(path.join(GAME_DIR, '状态.md'), 'utf8'); } catch {}
  const faces = readJson(path.join(PORTRAIT_DIR, '头像位置.json'), {});
  const food = readFoodTable(status);
  const husbands = sectionRows(status, '兽夫一览');
  return husbands.map(([name, level, favor, mood, doing, where]) => {
    const img = files.find(f => path.parse(f).name === name);
    const beast = files.find(f => path.parse(f).name === `${name}-兽形`);
    const half = files.find(f => path.parse(f).name === `${name}-半身`);
    const idPhoto = files.find(f => path.parse(f).name === `${name}-证件照`);
    const three = files.find(f => path.parse(f).name === `${name}-三视图`);
    const wreck = files.find(f => path.parse(f).name === `${name}-终极战损`);
    const wreckHalf = files.find(f => path.parse(f).name === `${name}-终极战损-半身`);
    const fever = files.find(f => path.parse(f).name === `${name}-易感期`);
    const feverHalf = files.find(f => path.parse(f).name === `${name}-易感期-半身`);
    // 动态证件照：立绘/动画素材/编号_名字.mp4（或 .webm）
    const vid = animFiles.find(f => /\.(mp4|webm)$/i.test(f) && path.parse(f).name.replace(/^\d+_/, '') === name);
    return {
      name, level, favor: Number(favor) || 0, mood, doing, where: where || '', img: img ? `立绘/${img}` : null,
      beastImg: beast ? `立绘/${beast}` : null,
      halfImg: half ? `立绘/${half}` : null,
      idImg: idPhoto ? `立绘/${idPhoto}` : null,
      threeImg: three ? `立绘/${three}` : null,
      wreckImg: wreck ? `立绘/${wreck}` : null,
      wreckHalfImg: wreckHalf ? `立绘/${wreckHalf}` : null,
      feverImg: fever ? `立绘/${fever}` : null,
      feverHalfImg: feverHalf ? `立绘/${feverHalf}` : null,
      idVideo: vid ? `立绘/动画素材/${vid}` : null,
      face: faces[name] || null, halfFace: faces[`${name}-半身`] || null, idFace: faces[`${name}-证件照`] || null, food: food[name] || null,
    };
  });
}

// 小地图：她在哪、现在是第几天什么时候、最近几条整点记录
function readMap() {
  let status = '', log = '';
  try { status = fs.readFileSync(path.join(GAME_DIR, '状态.md'), 'utf8'); } catch {}
  try { log = fs.readFileSync(path.join(GAME_DIR, '模拟日志.md'), 'utf8'); } catch {}
  const field = k => (status.match(new RegExp(`^- \\*\\*${k}\\*\\*：(.*)$`, 'm')) || [])[1]?.trim() || '';
  const recent = log.split('\n').filter(l => /^- /.test(l)).slice(-6).map(l => l.slice(2));
  return { me: field('我在哪'), meDoing: field('我在做什么'), day: field('天数'), period: field('时间段'), weather: field('天气'), recent, simming };
}

// ---------- 兽夫日记：兽世/兽夫日记/名字.md ----------
function listHusbandDiaries() {
  const dir = path.join(GAME_DIR, '兽夫日记');
  return listCast().map(c => {
    let text = '';
    try { text = fs.readFileSync(path.join(dir, `${c.name}.md`), 'utf8'); } catch {}
    return { name: c.name, img: c.img, text };
  });
}

// ---------- 存档快照（新会话开头一次性给全，省掉一个个读文件的来回） ----------
const SNAPSHOT_FILE = path.join(APP_DIR, 'snapshot.md');
// 自定义游戏机制：玩家自己定的规则，和 CLAUDE.md 等原规则冲突时以它为准（存档的一部分，更新游戏不会覆盖）
const CUSTOM_FILE = path.join(GAME_DIR, '自定义规则.md');
const CUSTOM_LOG = path.join(APP_DIR, '自定义记录.json');
const customRules = () => { try { return fs.readFileSync(CUSTOM_FILE, 'utf8').trim(); } catch { return ''; } };
const ARCHIVE_DIR = path.join(GAME_DIR, '归档');
function readGame(rel) { try { return fs.readFileSync(path.join(GAME_DIR, rel), 'utf8').replace(/^﻿/, ''); } catch { return ''; } }
// 只留文件开头和最后 n 个「## 」小节（日记、我的一天按天分节）
function lastSections(text, n) {
  const parts = text.split(/\n(?=## )/);
  return [parts[0], ...parts.slice(1).slice(-n)].join('\n');
}
// 游戏里的一天：凌晨 5 点换天
const dayKey = (d = new Date()) => dateStr(new Date(new Date(d).getTime() - 5 * 3600 * 1000));
function buildSnapshot() {
  const present = listCast().filter(c => c.where && c.where !== '未登场').map(c => c.name);
  const sec = (title, body) => (body && body.trim() ? `\n\n===== ${title} =====\n${body.trim()}` : '');
  const pool = readGame('事件池.md');
  const pool0 = (pool.match(/## 〇、[\s\S]*?(?=\n## )/) || [''])[0];
  const log = readGame('模拟日志.md').split(/\r?\n/).filter(l => l.startsWith('- ')).slice(-12).join('\n');
  const recent = readJson(HISTORY_FILE, []).filter(m => !m.tick).slice(-6)
    .map(m => `${m.role === 'user' ? '【她】' : '【兽夫们】'}（${m.time || ''}）${m.text}`).join('\n\n');
  let s = '# 存档快照\n服务器在这段会话开始时替你读好的存档，下面就是这些文件此刻的内容，**不用再去读它们**，直接开始写回复。之后你自己改过的，以文件为准。没放进来的（不在场兽夫的档案、事件池其他节、原著参考、归档）需要时再读。';
  s += sec('自定义规则.md（玩家自己定的规则，和 CLAUDE.md、世界设定等原规则冲突时**一律以这里为准**）', customRules());
  s += sec('世界设定.md', readGame('世界设定.md'));
  s += sec('状态.md', readGame('状态.md'));
  s += sec('物品与等级.md', readGame('物品与等级.md'));
  s += sec('回忆摘要.md（更早的回忆，压缩过）', readGame('回忆摘要.md'));
  s += sec('回忆.md（最近 7 天）', readGame('回忆.md'));
  s += sec('我的一天.md（最后一天）', lastSections(readGame('我的一天.md'), 1));
  s += sec('心伤与黑化.md', readGame('心伤与黑化.md'));
  s += sec('崽崽.md', readGame('崽崽.md'));
  s += sec('事件池.md 第〇节', pool0);
  for (const n of present) {
    s += sec(`兽夫/${n}.md`, readGame(`兽夫/${n}.md`));
    s += sec(`兽夫日记/${n}.md（最近两篇）`, lastSections(readGame(`兽夫日记/${n}.md`), 2));
  }
  s += sec('家里的摆设（她在「小屋」页自己摆的，兽夫们都知道东西在哪）', describeRoom(readJson(ROOM_FILE, null)) + '\n\napp/room.json 原文（剧情里挪了家具就改它，规则见 CLAUDE.md「小屋同步」）：\n' + JSON.stringify(readJson(ROOM_FILE, null)));
  s += sec('模拟日志.md（最后 12 行）', log);
  s += sec('最近几条聊天（上一段会话的结尾，接着往下演）', recent);
  fs.writeFileSync(SNAPSHOT_FILE, s, 'utf8');
  return SNAPSHOT_FILE;
}
// 换天后把模拟日志里前几天的行挪进归档，主文件只留今天
function rotateSimLog() {
  const file = path.join(GAME_DIR, '模拟日志.md');
  const text = readGame('模拟日志.md');
  const lines = text.split(/\r?\n/);
  const days = lines.map(l => (l.match(/^- 第(\d+)天/) || [])[1]).filter(Boolean).map(Number);
  if (!days.length) return;
  const today = Math.max(...days);
  const old = lines.filter(l => { const m = l.match(/^- 第(\d+)天/); return m && Number(m[1]) < today; });
  if (!old.length) return;
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.appendFileSync(path.join(ARCHIVE_DIR, '模拟日志.md'), old.join('\n') + '\n', 'utf8');
  const keep = lines.filter(l => !old.includes(l));
  fs.writeFileSync(file, keep.join('\n'), 'utf8');
  console.log(`模拟日志：${old.length} 行挪进 归档/模拟日志.md`);
}

// ---------- 聊天 ----------
let busy = false;

// 游戏规则（CLAUDE.md）改过以后，提醒正在进行的对话重新读一遍
function rulesNote(session) {
  let mtime = 0;
  for (const f of [path.join(GAME_DIR, 'CLAUDE.md'), CUSTOM_FILE]) { try { mtime = Math.max(mtime, fs.statSync(f).mtimeMs); } catch {} }
  const seen = session.rulesMtime;
  session.rulesMtime = mtime;
  if (!session.id || !seen || mtime <= seen) return '';
  return '[系统提示，不是她说的话：游戏规则 CLAUDE.md 和存档格式刚刚更新过，请先重新读一遍 CLAUDE.md、自定义规则.md（有的话，冲突时以它为准）和 状态.md，按新规则继续。不要在回复里提到这件事。]\n\n';
}

// ---------- 大脑：Claude Code 或 OpenAI 兼容接口，对外是同一套回调 ----------
// on: { block() 一段新文字开始, tool() 开始用工具, text(字), session(id) }；返回 { ok, err }
const API_MSGS_FILE = path.join(APP_DIR, 'session-api.json');
function runBrain({ prompt, resume, stream, on, ephemeral }) {
  const cfg = readConfig();
  if (cfg.brain === 'api') return runApiBrain(cfg, { prompt, resume, on, ephemeral });
  return new Promise(resolve => {
    const args = [prompt, '-p', '--output-format', stream ? 'stream-json' : 'text', '--permission-mode', 'acceptEdits'];
    if (stream) args.push('--verbose', '--include-partial-messages');
    if (resume) args.push('--resume', resume);
    else args.push('--append-system-prompt-file', buildSnapshot());
    args.push('--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep');
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const child = spawn(findClaude(), args, { cwd: GAME_DIR, env, windowsHide: true });
    child.stdin.end();
    let buf = '', err = '', out = '';
    child.stdout.on('data', chunk => {
      if (!stream) { out += chunk.toString('utf8'); return; }
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.session_id) on.session?.(msg.session_id);
        if (msg.type === 'stream_event') {
          const ev = msg.event || {};
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') on.tool?.();
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') on.block?.();
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') on.text?.(ev.delta.text);
        } else if (msg.type === 'result' && msg.is_error) err += msg.result || '出错了';
      }
    });
    child.stderr.on('data', d => { err += d.toString('utf8'); });
    child.on('error', e => resolve({ ok: false, err: '没能启动 Claude Code：' + e.message + '（没装 Claude Code 的话，在设置里换成 API 接口）' }));
    child.on('close', code => {
      if (!stream && out) on.text?.(out);
      resolve({ ok: code === 0, err: err.slice(0, 500) });
    });
  });
}

async function runApiBrain(cfg, { prompt, resume, on, ephemeral }) {
  if (!cfg.api.base || !cfg.api.model) return { ok: false, err: '还没设置模型接口：打开「设置」填上接口地址、模型名和 API key' };
  // 和 Claude 一样：一个游戏日一段会话；会话开头放规则 + 存档快照
  const saved = readJson(API_MSGS_FILE, {});
  let messages = resume && saved.id === resume ? saved.messages : null;
  if (!messages) {
    buildSnapshot();
    const rules = readGame('CLAUDE.md');
    const tools = '\n\n# 工具\n你用 read_file / edit_file / write_file / append_file / list_files / search 读写游戏文件夹里的存档（路径相对游戏文件夹，例如 状态.md）。规则里说的 Read / Edit / Write 就是这几个工具。改存档前先读；edit_file 的原文要一字不差。';
    messages = [{ role: 'system', content: rules + tools + '\n\n' + fs.readFileSync(SNAPSHOT_FILE, 'utf8') }];
  }
  messages.push({ role: 'user', content: prompt });
  const id = resume && saved.id === resume ? resume : 'api-' + Date.now();
  on.session?.(id);
  let first = true, usedTool = false;
  try {
    await agentApi.runTurn({
      ...cfg.api, gameDir: GAME_DIR, messages,
      onText: t => { if (first) { on.block?.(); first = false; } on.text?.(t); },
      onTool: () => { on.tool?.(); first = true; usedTool = true; },
    });
    // 很多模型写完回复就停了、忘了存档：补一步，只让它改文件，这一步写的字不给她看
    if (!usedTool) {
      messages.push({ role: 'user', content: '[系统提示，不是她说的话：回复已经给她看了。现在按 CLAUDE.md「存档」一节，用工具把这一轮该改的存档改好（至少 状态.md 的「兽夫一览」「我在哪」「我在做什么」，有事发生就记 回忆.md、我的一天.md）。只改文件，改完回复一个字：好]' });
      await agentApi.runTurn({ ...cfg.api, gameDir: GAME_DIR, messages, onText: () => {}, onTool: () => {} });
    }
  } catch (e) {
    return { ok: false, err: e.message };
  }
  // 会话太长就丢掉中间的工具往来，只留开头的规则和最近的对话
  if (messages.length > 80) messages = [messages[0], ...messages.slice(-50).filter((m, i, a) => !(i === 0 && m.role === 'tool'))];
  if (!ephemeral) writeJson(API_MSGS_FILE, { id, messages });
  return { ok: true };
}

// 新游戏的第一条消息：照 开局.json 让第一位兽夫登场
function openingNote() {
  const start = readJson(START_FILE, null);
  if (!start || readJson(HISTORY_FILE, []).some(m => m.role === 'ai' && !m.tick)) return '';
  return `[系统提示，不是她说的话：这是新游戏的第一轮。她在开局界面定的兽夫登场顺序是：${start.order.join('、')}。按 状态.md「兽夫登场」一节，让第一位（${start.order[0]}）照他档案里的「登场」场面登场，写开场；她自己是什么人、有什么本事，一概不替她设定，等她说。]\n\n`;
}

function chat(text, res) {
  const session = readJson(SESSION_FILE, {});
  // 每个游戏日（凌晨 5 点换天）开一段新会话，剧情都在存档里，不会越聊越慢
  if (session.id && session.day !== dayKey()) { delete session.id; delete session.rulesMtime; }
  session.day = dayKey();
  // 告诉游戏现在的现实时间（玩家电脑的本地时间）和当地天气
  const clock = `[系统提示，不是她说的话，不要回应：她发这条消息的现实时间是 ${dateStr()} ${timeStr()}${weather ? `，她那里现在${weather}（游戏里的天气就是这个）` : ''}。本条骰子：${Math.floor(Math.random() * 1000)}（0～999，需要随机时用它，比如怀孕、谁受伤）。写完回复后**必须**把 状态.md「兽夫一览」里在场兽夫的「此刻在做什么」和「在哪」改成这一轮结尾他们的样子（谁进了她的洞、谁躺下睡了、谁去了院子哪里），还有「我在哪」「我在做什么」（她这一轮结尾在干嘛，一句话不超过 20 字）——小程序的小人和地图靠这几栏动]\n\n`;
  // 她在「小屋」页挪过家具：告诉兽夫们（他们回家 / 进屋时会发现）
  const roomNow = readJson(ROOM_FILE, null);
  const moved = roomChanges(session.roomSeen || ROOM_START, roomNow);
  if (roomNow) session.roomSeen = roomNow;
  const roomNote = moved ? `[系统提示，不是她说的话：她刚动过家里的摆设——${moved}。现在的摆法：${describeRoom(roomNow)}。在场或进屋的兽夫会注意到，按各自性格自然地反应一下（发现、嘀咕、帮忙、有意见……），不在家的等回来看到再说；不要念这条提示]\n\n` : '';
  // 沾一点亲密就整段交给本地模型：她的话里有亲密的字眼，或者上一轮是本地模型写的、她还没说停
  const lastAi = readJson(HISTORY_FILE, []).filter(m => m.role === 'ai' && !m.sim && !m.tick).pop();
  // 有兽夫正在易感期 / 发情期（状态.md 里写着【易感期】）：随时可能擦枪走火，也按亲密分工写
  let rut = false;
  try { rut = /【易感期】/.test(fs.readFileSync(path.join(GAME_DIR, '状态.md'), 'utf8')); } catch {}
  const intimate = INTIMATE.test(text) || rut || (lastAi?.local && !SCENE_END.test(text));
  const intimateNote = intimate ? `[系统提示，不是她说的话：这一轮沾到亲密（${INTIMATE.test(text) ? '她的话里有亲密的内容' : rut ? '有兽夫正在易感期' : '上一轮的亲密戏还没结束'}）。**照原来的展示方式写完整的回复**：环境、他的台词和口吻、心理（*斜体*）、剧情推进、📌 小结都由你写，和平时一样。但**身体和性的描写你一个字都不自己写，也不准带过、不准用台词或心理代替**：每到要写身体、裸体、体液、亲吻抚摸、性的地方，单独一段写交接标记 \`〔接手：兽夫名字｜在哪｜这一刻｜约 N 字：这一小段要写什么——谁对谁做了什么、写到哪一步为止〕\`（N 一般 150～500；她要的露骨内容越多，标记越多、字数越大；她这一轮要的每一个动作都要落在某个标记里）。标记前后接着写台词和心理，和标记里的事衔接，不要在标记前后重复写同一个动作。小结写清楚这场戏还没结束、他在等她什么（她说停了才算结束）。存档照常改，写到亲密的地方也用交接标记，不要自己写、不要带过]\n\n` : '';
  const prompt = rulesNote(session) + roomNote + openingNote() + clock + intimateNote + text;
  writeJson(SESSION_FILE, session);

  const send = obj => res.write(JSON.stringify(obj) + '\n');
  // 网页上显示的 = 回复里的 〔接手：…〕 换成交接模型写的那段（还在写时，后面先不显示）
  const ho = localLLM.create(GAME_DIR, () => { if (!quiet) pushView(); }, readConfig().handoff, { her: text, history: readJson(HISTORY_FILE, []).slice(-6) });
  // 边写边存：她发的话马上存，回复显示出来一点就存一点（断电、出错也不丢）
  const live = Date.now(), time0 = `${dateStr()} ${timeStr()}`;
  let liveTimer = null;
  function saveLive(t) {
    const history = readJson(HISTORY_FILE, []);
    let i = history.findIndex(e => e.live === live);
    if (i < 0) { history.push({ role: 'user', text, time: time0 }, { role: 'ai', text: '', time: time0, live }); i = history.length - 1; }
    history[i].text = t.trim();
    writeJson(HISTORY_FILE, history);
  }
  saveLive('');
  function pushView() {
    const v = ho.view(reply);
    if (v.startsWith(shown)) { if (v.length > shown.length) { send({ type: 'delta', text: v.slice(shown.length) }); shown = v; } }
    else { send({ type: 'reset' }); if (v) send({ type: 'delta', text: v }); shown = v; }
    if (!liveTimer) liveTimer = setTimeout(() => { liveTimer = null; saveLive(shown); }, 300);
  }
  // 有时会先写一遍回复、存完档又写一遍：按"工具调用"切成几段，最后只留最完整的一段
  const segments = [''];
  let reply = '', shown = '', quiet = false, needBreak = false, sawTool = false, keep = -1;

  runBrain({
    prompt, resume: session.id, stream: true,
    on: {
      session: id => { if (id !== session.id) { session.id = id; writeJson(SESSION_FILE, session); } },
      tool: () => { sawTool = true; },
      block: () => {
        if (!reply) return;
        if (sawTool) {
          segments.push(reply = '');
          // 前面只有零星几个字就清掉重来；已经是一段像样的回复就留在屏幕上，不让它闪
          if (shown.trim().length < 40) { shown = ''; quiet = false; send({ type: 'reset' }); }
          else { quiet = true; if (keep < 0) keep = segments.length - 2; }
        } else needBreak = true;
        sawTool = false;
      },
      text: t => {
        if (needBreak) { t = '\n\n' + t; needBreak = false; }
        reply += t;
        segments[segments.length - 1] = reply;
        if (!quiet) pushView();
      },
    },
  }).then(async ({ ok, err }) => {
    const best = keep >= 0 ? segments[keep] : segments.reduce((a, b) => (b.trim().length > a.trim().length ? b : a), '');
    let full = await ho.finish(best);   // 等交接那段写完，拼成一整段
    // 已经给她看过的字不换掉：拼出来的和屏幕上的对不上，就用屏幕上的
    const norm = x => x.replace(/\n{3,}/g, '\n\n').trim();
    if (shown.trim() && !norm(full).startsWith(norm(shown))) full = norm(shown);
    busy = false;
    clearTimeout(liveTimer); liveTimer = null;
    if (full !== shown) send({ type: 'final', text: full });
    if (full.trim()) {
      const history = readJson(HISTORY_FILE, []);
      const i = history.findIndex(e => e.live === live);
      if (i >= 0) { history[i].text = full.trim(); delete history[i].live; if (ho.used()) history[i].local = true; }
      else history.push({ role: 'user', text, time: time0 }, { role: 'ai', text: full.trim(), time: time0 });
      writeJson(HISTORY_FILE, history);
      const s = readJson(SESSION_FILE, {});
      s.roomSeen = readJson(ROOM_FILE, s.roomSeen);   // 剧情里兽夫自己挪的家具不算她挪的
      writeJson(SESSION_FILE, s);
    } else {
      const history = readJson(HISTORY_FILE, []).filter(e => e.live !== live);   // 一个字都没写出来：她的话留着，空回复去掉
      writeJson(HISTORY_FILE, history);
      if (!ok) send({ type: 'error', text: err || '没有收到回复' });
    }
    send({ type: 'done' });
    localLLM.fillMarks(GAME_DIR, readConfig().handoff, readJson(HISTORY_FILE, []));   // /写日记 时也一样
    res.end();
  });
}

// ---------- 玩家所在地的实时天气（Open-Meteo，免费、不用注册），游戏里的天气跟着它 ----------
// 位置：设置里填了城市就用城市；没填就按网络位置大概定位（只取城市级别的坐标）
const WMO = { 0: '晴', 1: '大致晴朗', 2: '多云', 3: '阴天', 45: '起雾', 48: '雾凇', 51: '小毛毛雨', 53: '毛毛雨', 55: '密密的毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨', 71: '小雪', 73: '中雪', 75: '大雪', 77: '飘雪粒', 80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '大阵雪', 95: '雷雨', 96: '雷雨夹冰雹', 99: '雷雨夹冰雹' };
let weather = '', place = null;
async function locate() {
  const city = readConfig().city;
  if (city) {
    const g = (await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&name=' + encodeURIComponent(city))).json()).results?.[0];
    if (g) return { lat: g.latitude, lon: g.longitude, name: g.name };
  }
  // 按网络位置定位：几家免费服务轮流试
  for (const [u, f] of [['https://ipwho.is/', j => j.success !== false && [j.latitude, j.longitude, j.city]], ['https://ipapi.co/json/', j => !j.error && [j.latitude, j.longitude, j.city]], ['http://ip-api.com/json/', j => j.status === 'success' && [j.lat, j.lon, j.city]]]) {
    try {
      const r = f(await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
      if (r && r[0]) return { lat: r[0], lon: r[1], name: r[2] || '' };
    } catch {}
  }
  return null;
}
async function refreshWeather() {
  try {
    if (!place || place.city !== readConfig().city) { place = await locate(); if (place) place.city = readConfig().city; }
    if (!place) return;
    const c = (await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`)).json()).current;
    const wind = c.wind_speed_10m < 12 ? '微风' : c.wind_speed_10m < 29 ? '有风' : '大风';
    weather = `${WMO[c.weather_code] ?? '天气说不清'}，${Math.round(c.temperature_2m)}°C（体感 ${Math.round(c.apparent_temperature)}°C），${wind}`;
    if (busy) return; // 正在聊天或模拟时不动存档，下次再写
    const file = path.join(GAME_DIR, '状态.md');
    const s = fs.readFileSync(file, 'utf8');
    const n = s.replace(/^- \*\*天气\*\*：.*$/m, `- **天气**：${weather}（实时）`);
    if (n !== s) fs.writeFileSync(file, n, 'utf8');
  } catch {}
}
refreshWeather();
setInterval(refreshWeather, 20 * 60 * 1000);

// ---------- 整点模拟：游戏时间跟现实同步，每到整点让兽夫们各自过完这一小时 ----------
const SIM_FILE = path.join(APP_DIR, 'sim.json');
let simming = false;
const hourStart = d => { const x = new Date(d); x.setMinutes(0, 0, 0); return x; };

async function simTick() {
  if (busy) return; // 正在聊天或正在模拟：下一分钟再看
  if (!fs.existsSync(START_FILE)) return; // 还没开局
  const sim = readJson(SIM_FILE, {});
  const now = hourStart(new Date());
  if (!sim.last) return writeJson(SIM_FILE, { last: now.toISOString() }); // 第一次：从这个整点开始算
  const last = new Date(sim.last);
  if (now <= last) return;
  const hours = Math.round((now - last) / 3600000);
  const from = `${dateStr(last)} ${timeStr(last)}`, to = `${dateStr(now)} ${timeStr(now)}`;
  const dice = Math.floor(Math.random() * 1000);
  const prompt = `[整点模拟，不是她说的话，不要写给她看的回复]
现在是现实时间 ${to}，游戏时间和现实同步。她那里现在的天气：${weather || '没取到'}（游戏里的天气就是这个，已写进 状态.md）。从 ${from} 到 ${to}，过去了 ${hours} 小时。本次骰子：${dice}（0～999，需要随机时用它）。
按 CLAUDE.md「整点模拟」一节办，再看一眼 状态.md「未完成的约定 / 待解之谜」：挂了半天以上她没推的大事，按「她不推进，兽夫自己推进」那一节让相关的兽夫自己往前推一步。存档快照已经放在系统提示里（状态、设定、物品、在场兽夫档案、事件池第〇节都在），不用再读，必要时才读别的文件；模拟这 ${hours} 小时里已登场的兽夫各自做了什么，改好 状态.md 和其他要改的存档，在 模拟日志.md 末尾按小时追加记录。
只改文件。全部改完后，最后只输出一两句话的旁白（会直接显示在她的聊天窗口里）：只写**她在自己所在的地方能看到、听到、察觉到**的事（谁回来了、门外的动静、火塘边谁在干什么……），用小说旁白的口吻，不要写她看不到的事、不要剧透兽夫瞒着她的遭遇、不要提"模拟"。她在睡觉，或这段时间没有任何她能察觉的事，就只输出：（无）`;
  const newDay = dayKey(last) !== dayKey(now);
  // 这一小时里她聊过天：聊天已经把兽夫此刻的样子写好了，模拟不能盖掉
  const lastChat = readJson(HISTORY_FILE, []).filter(m => m.role === 'user').pop();
  const chatted = lastChat && lastChat.time && new Date(lastChat.time.replace(' ', 'T')) > new Date(now.getTime() - 3600 * 1000);
  const keepNote = chatted ? `

**注意**：她在 ${lastChat.time} 刚聊过天，最近的聊天才是现在的情况（见快照里「最近几条聊天」）。不要改 状态.md「兽夫一览」里在场兽夫的「此刻在做什么」「在哪」，也不要改「我在哪」，只在 模拟日志.md 追加这段时间里**聊天以外**的事（不在场的兽夫、她没看到的动静）；没什么可写就写一行「她在跟兽夫说话，按聊天里的走」。` : '';
  const fullPrompt = prompt + keepNote + (newDay ? `

这次跨过了凌晨 5 点，进入新的一天。除了 CLAUDE.md「整点模拟」里换天要做的事，再做一件整理：按 CLAUDE.md「存档整理」一节，把 回忆.md 里 7 天以前的条目压进 回忆摘要.md、原文挪进 归档/回忆.md。` : '');
  busy = simming = true;
  let out = '';
  const { ok, err } = await runBrain({ prompt: fullPrompt, stream: false, on: { text: t => { out += t; }, tool: () => { out = ''; } } });
  busy = simming = false;
  if (!ok) return console.log(`整点模拟失败（${to}）：${(err || out).slice(0, 300)}`);
  // 只剩「（无）」（有的模型还会多带几个字、换行）就当没有她能察觉的事
  let say = /^[（(]\s*无\s*[)）]/.test(out.trim()) ? '' : out.trim();
  // 旁白里写到亲密的地方留了 〔接手：…〕：交给本地模型写好换进去
  if (localLLM.MARK.test(say)) say = await localLLM.create(GAME_DIR, () => {}, readConfig().handoff, { history: readJson(HISTORY_FILE, []).slice(-6) }).finish(say);
  if (newDay) { try { rotateSimLog(); } catch (e) { console.log('模拟日志归档失败：' + e.message); } }
  writeJson(SIM_FILE, { last: now.toISOString(), summary: say.slice(0, 300) });
  // 她能察觉到的事，作为一条旁白放进聊天记录，网页会自动显示出来
  const history = readJson(HISTORY_FILE, []);
  if (say && !/^[（(]无[)）]$/.test(say)) {
    history.push({ role: 'ai', text: `—— ${timeStr(now)}　${say.replace(/^——\s*/, '')}`, time: `${dateStr()} ${timeStr()}`, sim: true });
  } else {
    // 她察觉不到（比如在睡觉）：放一条小字的整点动态，让她知道每个小时兽夫们在干什么
    const who = listCast().filter(c => c.where && c.where !== '未登场' && !/尚未登场/.test(c.doing))
      .map(c => `${c.name}·${c.where}：${c.doing.replace(/【(战损|易感期)】/g, '')}`).join('　');
    if (who) history.push({ role: 'ai', text: `🕐 ${timeStr(now)}　${who}`, time: `${dateStr()} ${timeStr()}`, tick: true });
  }
  writeJson(HISTORY_FILE, history);
  localLLM.fillMarks(GAME_DIR, readConfig().handoff, history);   // 存档里亲密的那段交给本地模型
}
if (!process.env.NO_SIM) {   // 安装器临时开一个游戏后台来改规则时不跑整点模拟
  setInterval(simTick, 60 * 1000);
  setTimeout(simTick, 10 * 1000);
}

// ---------- 小屋（装修）和崽崽 ----------
const ROOM_FILE = path.join(APP_DIR, 'room.json');
// 兽夫们最初知道的摆法（开局的样子）
const ROOM_START = { items: [{ k: '她的床', x: 34, y: 50, s: 1 }, { k: '草垛', x: 28, y: 62, s: 1 }],
  yard: [{ k: '石桌', x: 42, y: 62, s: 1 }, { k: '石凳', x: 42, y: 72, s: 1 }, { k: '火塘', x: 62, y: 56, s: 1 }, { k: '柴堆', x: 78, y: 74, s: 1 }] };
const BABY_FILE = path.join(GAME_DIR, '崽崽.md');
// 家具摆在哪，翻成兽夫看得懂的话（屋里 / 院子 + 方位）
function placeWord(it, where) {
  const lr = it.x < 35 ? '左边' : it.x > 65 ? '右边' : '中间';
  const fb = where === '屋里' ? (it.y < 50 ? '靠里头' : it.y > 72 ? '靠门口' : '当中') : (it.y < 45 ? '靠小屋那头' : it.y > 72 ? '靠院门' : '当中');
  return `${where}${fb}${lr === '中间' && fb === '当中' ? '' : lr}`;
}
function describeRoom(room) {
  if (!room) return '';
  const part = (arr, where) => (arr || []).map(it => `${it.k}（${placeWord(it, where)}）`).join('、');
  return `屋里：${part(room.items, '屋里') || '空的'}；院子里：${part(room.yard, '院子') || '空的'}`;
}
// 她挪了家具：和上次兽夫知道的摆法比，说出哪些东西挪了、添了、拿走了
function roomChanges(prev, cur) {
  if (!prev || !cur) return '';
  const out = [];
  for (const [key, where] of [['items', '屋里'], ['yard', '院子']]) {
    const a = (prev[key] || []).slice(), b = cur[key] || [];
    for (const it of b) {
      const i = a.findIndex(x => x.k === it.k);
      if (i < 0) { out.push(`添了${it.k}（${placeWord(it, where)}）`); continue; }
      const o = a.splice(i, 1)[0];
      const w0 = placeWord(o, where), w1 = placeWord(it, where);
      if (Math.hypot(o.x - it.x, o.y - it.y) > 6) out.push(w0 === w1 ? `把${where}的${it.k}挪了挪（还在${w1}）` : `把${it.k}从${w0}挪到了${w1}`);
      else if (!!o.f !== !!it.f || Math.abs((o.s || 1) - (it.s || 1)) > .05) out.push(`把${where}的${it.k}换了个样子摆`);
    }
    for (const o of a) out.push(`把${where}的${o.k}拿走了`);
  }
  return out.join('；');
}

// 读 崽崽.md 里的表：第一张以「| 名字 |」开头的表
function readBabies() {
  let text = '';
  try { text = fs.readFileSync(BABY_FILE, 'utf8'); } catch { return []; }
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex(l => /^\|\s*名字\s*\|/.test(l));
  if (h < 0) return [];
  const head = lines[h].split('|').slice(1, -1).map(x => x.trim());
  const out = [];
  for (let i = h + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').slice(1, -1).map(x => x.trim());
    const row = {}; head.forEach((k, j) => { row[k] = cells[j] || ''; });
    if (row['名字']) out.push(row);
  }
  return out;
}
// 打完一仗：改 崽崽.md 里这只崽的等级和经验，再在聊天里放一行小字
function recordBattle(b) {
  const name = String(b.name || '').trim();
  if (!name) return { ok: false };
  let text = '';
  try { text = fs.readFileSync(BABY_FILE, 'utf8'); } catch { return { ok: false }; }
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex(l => /^\|\s*名字\s*\|/.test(l));
  if (h >= 0) {
    const head = lines[h].split('|').slice(1, -1).map(x => x.trim());
    const li = head.indexOf('等级'), ei = head.indexOf('经验'), ni = head.indexOf('名字');
    for (let i = h + 2; i < lines.length && lines[i].startsWith('|'); i++) {
      const cells = lines[i].split('|').slice(1, -1).map(x => x.trim());
      if (cells[ni] !== name) continue;
      if (li >= 0 && b.level) cells[li] = String(b.level);
      if (ei >= 0 && b.exp != null) cells[ei] = String(b.exp);
      lines[i] = '| ' + cells.join(' | ') + ' |';
    }
    fs.writeFileSync(BABY_FILE, lines.join('\n'), 'utf8');
  }
  const history = readJson(HISTORY_FILE, []);
  const now = new Date();
  history.push({ role: 'ai', tick: true, time: `${dateStr()} ${timeStr()}`,
    text: `⚔️ ${timeStr(now)}　${name}在${b.place || '院外林子'}${b.win ? '打赢了' : '没打过'}${b.enemy || '野怪'}${b.levelUp ? `，升到了 Lv${b.level}` : ''}` });
  writeJson(HISTORY_FILE, history);
  return { ok: true };
}

// ---------- 新版本提醒 ----------
let remoteVersion = null;
fetch('https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/version.json?t=' + Date.now(), { signal: AbortSignal.timeout(15000) })
  .then(r => r.ok ? r.json() : null).then(v => { remoteVersion = v; }).catch(() => {});

// ---------- 静态文件 ----------
function serveFile(res, root, rel) {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(full)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ---------- 开局：选兽夫、排顺序、改名 ----------
// 兽夫名单：兽夫/*.md（_模板 除外），带一句简介和证件照
function roster() {
  const dir = path.join(GAME_DIR, '兽夫');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_')); } catch {}
  return files.map(f => {
    const name = f.slice(0, -3);
    const md = fs.readFileSync(path.join(dir, f), 'utf8');
    const line = k => ((md.match(new RegExp(`^- \\*\\*${k}\\*\\*[：:]\\s*(.+)$`, 'm')) || [])[1] || '').replace(/\*\*/g, '').trim();
    const pic = ['-证件照.jpg', '.jpg', '.png'].map(x => `立绘/${name}${x}`).find(p => fs.existsSync(path.join(GAME_DIR, p)));
    const short = t => t.split(/[（(。；"“]/)[0].trim().slice(0, 40);
    return { name, race: short(line('种族')), brief: short(line('一句话')), img: pic || null };
  });
}

// 改名：把游戏文件夹里所有文字里的旧名字换成新名字，文件名里带旧名字的也改（立绘、配音、档案）
function applyRenames(map) {
  const pairs = Object.entries(map).filter(([a, b]) => a && b && a !== b);
  if (!pairs.length) return;
  pairs.sort((x, y) => y[0].length - x[0].length);   // 长名字先换，免得短名字吃掉长名字的一部分
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(node_modules|\.git|uploads|缓存)$/.test(e.name)) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, out); else out.push(f);
    }
    return out;
  };
  const all = walk(GAME_DIR);
  // 1. 文字：先换成占位符再换成新名字，避免 A→B、B→A 互相串
  for (const f of all.filter(f => /\.(md|json|txt|js|html)$/i.test(f))) {
    let s = fs.readFileSync(f, 'utf8'), n = s;
    pairs.forEach(([a], i) => { n = n.split(a).join(`\u0000${i}\u0000`); });
    pairs.forEach(([, b], i) => { n = n.split(`\u0000${i}\u0000`).join(b); });
    if (n !== s) fs.writeFileSync(f, n, 'utf8');
  }
  // 2. 文件名
  for (const f of all) {
    const base = path.basename(f);
    let nb = base;
    pairs.forEach(([a], i) => { nb = nb.split(a).join(`\u0000${i}\u0000`); });
    pairs.forEach(([, b], i) => { nb = nb.split(`\u0000${i}\u0000`).join(b); });
    if (nb !== base) fs.renameSync(f, path.join(path.dirname(f), nb));
  }
}

function startGame(body) {
  if (fs.existsSync(START_FILE)) throw new Error('已经开过局了');
  const names = roster().map(r => r.name);
  const order = (body.order || []).filter(n => names.includes(n));
  if (!order.length) throw new Error('至少选一位兽夫');
  const rename = {};
  const used = new Set();
  for (const n of names) {
    const want = String((body.rename || {})[n] || '').trim();
    const final = want || n;
    if (!/^[一-龥A-Za-z·]{1,6}$/.test(final)) throw new Error(`名字「${final}」不行：1～6 个字，只能用中文或字母`);
    if (used.has(final)) throw new Error(`名字「${final}」重复了`);
    used.add(final);
    if (final !== n) rename[n] = final;
  }
  applyRenames(rename);
  const finalOrder = order.map(n => rename[n] || n);
  // 没选的兽夫：这一局不登场（档案留着，状态表里标出来）
  const skipped = names.map(n => rename[n] || n).filter(n => !finalOrder.includes(n));
  writeJson(START_FILE, { order: finalOrder, skipped, started: `${dateStr()} ${timeStr()}`, renamed: rename });
  writeJson(SIM_FILE, { last: hourStart(new Date()).toISOString() });
  return { ok: true, order: finalOrder };
}

// ---------- 手机连接：局域网 + 连接码（二维码里带着），没有连接码的设备进不来 ----------
const isLoopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function lanToken() {
  const cfg = readConfig();
  if (cfg.lan.token) return cfg.lan.token;
  const token = crypto.randomBytes(12).toString('base64url');
  saveConfig({ lan: { ...cfg.lan, token } });
  return token;
}
function lanUrls() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) ips.push(a.address);
  }
  const t = lanToken();
  return ips.map(ip => `http://${ip}:${PORT}/?t=${t}`);
}
function lanAllowed(req, res) {
  if (isLoopback(req)) return true;
  const cfg = readConfig();
  if (!cfg.lan.enabled) return false;
  const q = new URL(req.url, 'http://x').searchParams.get('t');
  const cookie = ((req.headers.cookie || '').match(/(?:^|;\s*)eci_t=([^;]+)/) || [])[1];
  const t = lanToken();
  if (q === t) { res.setHeader('Set-Cookie', `eci_t=${t}; Path=/; Max-Age=31536000; SameSite=Lax`); return true; }
  return cookie === t;
}
const maskKey = k => (k ? k.slice(0, 4) + '…' + k.slice(-4) : '');

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    if (!lanAllowed(req, res)) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<meta name="viewport" content="width=device-width"><p style="font:16px sans-serif;padding:24px">请在电脑上打开游戏 →「设置」→「手机连接」，用手机 App 扫二维码连接。</p>');
    }
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      // 还没开局：先进选兽夫的界面
      const page = fs.existsSync(START_FILE) ? 'index.html' : 'start.html';
      return fs.createReadStream(path.join(APP_DIR, page)).pipe(res);
    }
    if (req.method === 'GET' && url.startsWith('/game/')) return serveFile(res, GAME_DIR, url.slice(6));
    if (req.method === 'GET' && /^\/(inv|vn|play|settings|vendor\/qrcode)\.js$/.test(url)) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(path.join(APP_DIR, url.slice(1))).pipe(res);
    }

    // 开局
    if (req.method === 'GET' && url === '/api/roster') return json(res, roster());
    if (req.method === 'POST' && url === '/api/start') {
      try { return json(res, startGame(await readBody(req))); } catch (e) { return json(res, { ok: false, error: e.message }); }
    }

    // 设置（API key 只回显前后几位）
    // 自定义游戏机制：只能在电脑上改
    if (url.startsWith('/api/custom')) {
      if (!isLoopback(req)) return json(res, { ok: false, error: '只能在电脑上改' }, 403);
      if (req.method === 'GET' && url === '/api/custom') return json(res, { rules: customRules(), log: readJson(CUSTOM_LOG, []).slice(-20) });
      const b = await readBody(req);
      if (url === '/api/custom/save') {
        const t = String(b.rules || '').trim();
        if (t) fs.writeFileSync(CUSTOM_FILE, t + '\n', 'utf8'); else { try { fs.unlinkSync(CUSTOM_FILE); } catch {} }
        return json(res, { ok: true, rules: customRules() });
      }
      if (url === '/api/custom') {
        const ask = String(b.text || '').trim();
        if (!ask) return json(res, { ok: false, error: '写一下想怎么改' });
        if (busy) return json(res, { ok: false, error: '游戏正在写回复或整点模拟，等它写完再改' });
        busy = true;
        let out = '';
        const prompt = `[自定义游戏机制，不是她在游戏里说的话，不要写剧情]
玩家想这样改游戏：
「${ask}」

把玩家的要求整理成清楚、具体、能照着执行的游戏规则，写进游戏文件夹里的 自定义规则.md（没有就新建）。这个文件里的规则优先于 CLAUDE.md、世界设定.md 等原来的规则。
- 文件开头一行写 \`# 自定义规则\`；每条规则一行，以「- **简短标题**：」开头，后面写清楚怎么执行
- 已有的条目保留；和这次要求冲突的就改掉那一条，不要两条打架；玩家要求删掉某条就删掉
- 只改 自定义规则.md 这一个文件，不要动别的文件和存档
- 改完只回复两三句大白话：你理解的是什么，加了 / 改了 / 删了哪几条，从下一轮开始生效`;
        const r = await runBrain({ prompt, stream: false, ephemeral: true, on: { text: t => { out += t; }, tool: () => { out = ''; } } });
        busy = false;
        const reply = out.trim() || (r.ok ? '改好了' : '');
        if (!r.ok && !reply) return json(res, { ok: false, error: r.err || '大脑没有回应' });
        const log = readJson(CUSTOM_LOG, []);
        log.push({ time: `${dateStr()} ${timeStr()}`, ask, reply });
        writeJson(CUSTOM_LOG, log);
        return json(res, { ok: true, reply, rules: customRules() });
      }
      return json(res, { ok: false }, 404);
    }
    if (req.method === 'GET' && url === '/api/config') {
      const c = readConfig();
      return json(res, { ...c, api: { ...c.api, key: maskKey(c.api.key), hasKey: !!c.api.key }, handoff: { ...c.handoff, key: maskKey(c.handoff.key), hasKey: !!c.handoff.key }, lan: { enabled: c.lan.enabled }, weather });
    }
    if (req.method === 'POST' && url === '/api/config') {
      if (!isLoopback(req)) return json(res, { ok: false, error: '只能在电脑上改设置' }, 403);
      const b = await readBody(req), c = readConfig();
      const merge = (old, nu) => ({ ...old, ...nu, key: nu && nu.key && !nu.key.includes('…') ? nu.key : old.key });
      const next = saveConfig({
        brain: b.brain || c.brain, city: b.city ?? c.city,
        api: b.api ? merge(c.api, b.api) : c.api,
        handoff: b.handoff ? merge(c.handoff, b.handoff) : c.handoff,
        lan: b.lan ? { ...c.lan, enabled: !!b.lan.enabled } : c.lan,
      });
      if (b.city !== undefined) { place = null; refreshWeather(); }
      if (b.lan && b.lan.enabled !== c.lan.enabled) setTimeout(relisten, 300);
      return json(res, { ok: true, brain: next.brain });
    }
    if (req.method === 'POST' && url === '/api/brain/test') {
      const b = await readBody(req), c = readConfig();
      const t = { ...c[b.which === 'handoff' ? 'handoff' : 'api'], ...(b.api || {}) };
      if (t.key && t.key.includes('…')) t.key = c[b.which === 'handoff' ? 'handoff' : 'api'].key;
      try { return json(res, { ok: true, reply: await agentApi.ping(t) }); } catch (e) { return json(res, { ok: false, error: e.message }); }
    }
    if (req.method === 'GET' && url === '/api/pair') {
      if (!isLoopback(req)) return json(res, { ok: false }, 403);
      return json(res, { enabled: readConfig().lan.enabled, urls: lanUrls() });
    }

    // 有没有新版本（安装器更新）：启动时查一次 GitHub 上的 version.json
    if (req.method === 'GET' && url === '/api/update') return json(res, { local: readJson(path.join(GAME_DIR, 'version.json'), {}).version || null, remote: remoteVersion });
    // 网页自己的小偏好（小图顺序等）
    if (req.method === 'GET' && url === '/api/settings') return json(res, readJson(path.join(APP_DIR, 'ui.json'), {}));
    if (req.method === 'POST' && url === '/api/settings') {
      const ui = { ...readJson(path.join(APP_DIR, 'ui.json'), {}), ...(await readBody(req)) };
      writeJson(path.join(APP_DIR, 'ui.json'), ui);
      return json(res, ui);
    }
    if (req.method === 'GET' && url === '/api/room') return json(res, readJson(ROOM_FILE, null));
    if (req.method === 'POST' && url === '/api/room') {
      const body = await readBody(req);
      if (Array.isArray(body.items)) writeJson(ROOM_FILE, { items: body.items, yard: Array.isArray(body.yard) ? body.yard : (readJson(ROOM_FILE, {}) || {}).yard });
      return json(res, { ok: true });
    }
    if (req.method === 'GET' && url === '/api/babies') return json(res, readBabies());
    if (req.method === 'POST' && url === '/api/battle') {
      const b = await readBody(req);
      return json(res, recordBattle(b));
    }
    if (req.method === 'GET' && url === '/api/voice/status') {
      try { const r = await fetch(TTS_URL + '/health', { signal: AbortSignal.timeout(1500) }); return json(res, { ok: r.ok, ...(await r.json()) }); }
      catch { return json(res, { ok: false }); }
    }
    if (req.method === 'POST' && url === '/api/voice') {
      const b = await readBody(req);
      if (!b.text || !String(b.text).trim()) return json(res, { ok: false });
      try {
        const file = await makeVoice(b);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'max-age=31536000' });
        return fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('voice off: ' + e.message); }
    }
    if (req.method === 'GET' && url === '/api/history') return json(res, readJson(HISTORY_FILE, []));
    if (req.method === 'GET' && url === '/api/status') return json(res, { busy, simming, started: fs.existsSync(START_FILE), gameDir: isLoopback(req) ? GAME_DIR : undefined });
    if (req.method === 'GET' && url === '/api/map') return json(res, readMap());
    if (req.method === 'GET' && url === '/api/cast') return json(res, listCast());
    if (req.method === 'GET' && url === '/api/husband-diary') return json(res, listHusbandDiaries());
    if (req.method === 'GET' && url === '/api/myday') {
      let text = '';
      try { text = fs.readFileSync(path.join(GAME_DIR, '我的一天.md'), 'utf8'); } catch {}
      return json(res, { text });
    }
    if (req.method === 'GET' && url === '/api/food') {
      let status = '';
      try { status = fs.readFileSync(path.join(GAME_DIR, '状态.md'), 'utf8'); } catch {}
      return json(res, readFoodTable(status));
    }

    // 聊天里发的图片/文件：存到 app/uploads，返回相对游戏文件夹的路径
    if (req.method === 'POST' && url === '/api/upload') {
      const body = await readBody(req);
      const saved = saveFiles(body.files, UPLOAD_DIR, stamp());
      return json(res, saved.map(s => ({ path: `app/uploads/${s.fileName}`, isImage: s.isImage })));
    }

    if (req.method === 'POST' && url === '/api/chat') {
      const { text } = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (!text || !text.trim()) return res.end(JSON.stringify({ type: 'done' }) + '\n');
      if (busy) {
        res.write(JSON.stringify({ type: 'busy' }) + '\n');
        return res.end(JSON.stringify({ type: 'done' }) + '\n');
      }
      busy = true;
      return chat(text.trim(), res);
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    if (!res.headersSent) json(res, { ok: false, error: err.message }, 500);
    else res.end();
  }
});

// 开了「手机连接」就对局域网开放（有连接码才进得来），没开只给本机
function listen() {
  const host = readConfig().lan.enabled ? '0.0.0.0' : '127.0.0.1';
  server.listen(PORT, host, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`恶雌模拟器已启动：${url}${host === '0.0.0.0' ? '（手机连接已打开）' : ''}`);
    console.log(`游戏的大脑：${readConfig().brain === 'api' ? readConfig().api.model || '还没设置' : 'Claude Code ' + findClaude()}`);
    console.log('关掉这个黑色窗口，游戏就会停止。');
    if (!process.env.NO_OPEN && !relistening) exec(`start "" ${url}`);
    relistening = false;
  });
}
let relistening = false;
function relisten() { relistening = true; server.close(() => listen()); server.closeAllConnections?.(); }
listen();
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log('游戏已经在运行了，直接打开浏览器。');
    exec(`start "" http://localhost:${PORT}`);
  } else {
    console.error(err);
  }
});
