// 用 OpenAI 兼容接口（GPT、DeepSeek、通义、Kimi、本地 llama.cpp……）当游戏的大脑。
// Claude Code 自己会读写存档；这里给普通聊天模型配上同样的几个工具（读、写、改、列文件、搜索），
// 只能动游戏文件夹里的东西，一轮里循环调用，直到模型不再要工具为止。
const fs = require('fs');
const path = require('path');

const TOOLS = [
  { name: 'read_file', description: '读游戏文件夹里的一个文件（相对路径，例如 状态.md、兽夫/玄烬.md）', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: '整个覆盖写一个文件（新建或重写）。只在新建文件或整篇重写时用，平时改几行用 edit_file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: '把文件里的一段原文（old，必须和文件里一字不差、只出现一次）换成新文字（new）', parameters: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] } },
  { name: 'append_file', description: '在文件末尾追加文字（记日志、记回忆时用）', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'list_files', description: '列出一个文件夹里的文件（相对路径，空字符串 = 游戏文件夹本身）', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] } },
  { name: 'search', description: '在游戏文件里搜索一段文字，返回出现的文件和行', parameters: { type: 'object', properties: { text: { type: 'string' }, path: { type: 'string' } }, required: ['text'] } },
].map(f => ({ type: 'function', function: f }));

function inGame(gameDir, rel) {
  const full = path.resolve(gameDir, String(rel || ''));
  const root = path.resolve(gameDir);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('只能访问游戏文件夹里的文件');
  if (/[\\/]app[\\/](config|session|history)[^\\/]*\.json$/i.test(full)) throw new Error('这个文件不能动');
  return full;
}

function runTool(gameDir, name, a) {
  try {
    switch (name) {
      case 'read_file': return fs.readFileSync(inGame(gameDir, a.path), 'utf8').slice(0, 60000);
      case 'write_file': {
        const f = inGame(gameDir, a.path);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, String(a.content ?? ''), 'utf8');
        return 'ok';
      }
      case 'edit_file': {
        const f = inGame(gameDir, a.path);
        const s = fs.readFileSync(f, 'utf8');
        const n = s.split(String(a.old)).length - 1;
        if (n !== 1) return `没改：原文在文件里出现了 ${n} 次（要正好一次）。先 read_file 看清楚再改`;
        fs.writeFileSync(f, s.replace(String(a.old), () => String(a.new ?? '')), 'utf8');
        return 'ok';
      }
      case 'append_file': {
        const f = inGame(gameDir, a.path);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.appendFileSync(f, String(a.content ?? ''), 'utf8');
        return 'ok';
      }
      case 'list_files': return fs.readdirSync(inGame(gameDir, a.path || '')).join('\n');
      case 'search': {
        const out = [];
        const walk = dir => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const f = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/^(node_modules|立绘|配音|uploads|\.git)$/.test(e.name)) walk(f); continue; }
            if (!/\.(md|json|txt)$/i.test(e.name)) continue;
            fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
              if (l.includes(a.text) && out.length < 60) out.push(`${path.relative(gameDir, f)}:${i + 1}: ${l.slice(0, 200)}`);
            });
          }
        };
        walk(inGame(gameDir, a.path || ''));
        return out.join('\n') || '没找到';
      }
    }
    return '没有这个工具';
  } catch (e) { return '出错：' + e.message; }
}

// 一轮：messages 是这段会话到现在的全部消息（会被就地追加）；回调 onText(字)、onTool()（模型开始用工具）
// 有的模型（特别是本机的小模型）不走正规的工具调用，而是把调用当正文写出来：
//   <function_calls> {"name":"write_file","path":"回忆.md","content":"…"} </function_calls>
//   <tool_call>{"name":"edit_file","arguments":{…}}</tool_call>
//   <invoke name="write_file"><parameter name="path">…</parameter>…</invoke>
// 这些不给她看，照样执行
const CALL_START = /<\s*(function_calls|tool_call|invoke\b|antml:invoke)/i;
function jsonObjects(t) {
  // 一边扫一边抄一份：字符串里直接写的换行 / 制表符（小模型常这么写，严格 JSON 不认）换成转义
  const out = []; let depth = 0, inStr = false, esc = false, buf = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (depth > 0) buf += inStr && c === '\n' ? '\\n' : inStr && c === '\r' ? '' : inStr && c === '\t' ? '\\t' : c;
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) buf = '{'; }
    else if (c === '}' && depth > 0 && --depth === 0) { try { out.push(JSON.parse(buf)); } catch {} }
  }
  return out;
}
function textCalls(text) {
  const calls = [];
  const blocks = /<\s*(function_calls|tool_call)\s*>([\s\S]*?)(<\s*\/\s*\1\s*>|$)|<\s*(?:antml:)?invoke\s+name="([^"]+)"\s*>([\s\S]*?)(<\s*\/\s*(?:antml:)?invoke\s*>|$)/gi;
  const rest = text.replace(blocks, (m, tag, inner, end, invName, invBody) => {
    if (invName) {
      const a = {}; (invBody || '').replace(/<\s*(?:antml:)?parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\s*\/\s*(?:antml:)?parameter\s*>/gi, (x, k, v) => { a[k] = v; return ''; });
      calls.push({ name: invName, args: a });
    } else for (const o of jsonObjects(inner || '')) {
      const name = o.name || o.function?.name || o.tool || o.tool_name;
      if (!name) continue;
      let a = o.arguments ?? o.parameters ?? o.args ?? o.input ?? o.function?.arguments;
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      if (!a) { a = { ...o }; delete a.name; }
      calls.push({ name, args: a });
    }
    return '';
  });
  return { calls, rest: rest.replace(/\n{3,}/g, '\n\n') };
}
async function runTurn({ base, key, model, gameDir, messages, onText, onTool, signal, extraBody }) {
  const url = base.replace(/\/+$/, '') + '/chat/completions';
  // 本机 llama.cpp 跑的 Qwen 这类模型默认会先「想」一大段，关掉：省上下文，也快
  const local = /127\.0\.0\.1|localhost/.test(base);
  const extra = { ...(local ? { chat_template_kwargs: { enable_thinking: false } } : {}), ...(extraBody || {}) };
  for (let step = 0; step < 40; step++) {
    const r = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
      body: JSON.stringify({ model, messages, tools: TOOLS, stream: true, temperature: 0.8, ...extra }),
    });
    if (!r.ok) throw new Error(`模型接口出错 ${r.status}：${(await r.text()).slice(0, 300)}`);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', text = '', finish = '', shown = 0;
    const feed = () => { const at = text.search(CALL_START); let upto = at >= 0 ? at : text.length; if (at < 0) { const lt = text.lastIndexOf('<'); if (lt >= 0 && text.length - lt < 16) upto = lt; } if (upto > shown) { onText(text.slice(shown, upto)); shown = upto; } };
    const calls = [];   // { id, name, args }
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
        let ch; try { ch = JSON.parse(line.slice(5)).choices?.[0]; } catch { continue; }
        if (ch?.finish_reason) finish = ch.finish_reason;
        const d = ch?.delta;
        if (!d) continue;
        if (d.content) { text += d.content; feed(); }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? calls.length;
          if (!calls[i]) { calls[i] = { id: tc.id || 'call_' + i, name: '', args: '' }; onTool(); }
          if (tc.id) calls[i].id = tc.id;
          if (tc.function?.name) calls[i].name += tc.function.name;
          if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        }
      }
    }
    const used = calls.filter(Boolean);
    if (!used.length && CALL_START.test(text)) {
      const { calls: tc, rest } = textCalls(text);
      const before = text.slice(0, text.search(CALL_START));
      const after = rest.slice(before.length);
      if (after.trim()) onText(after);
      const results = tc.map(c => `${c.name}：${runTool(gameDir, c.name, c.args || {})}`);
      if (tc.length) onTool();
      messages.push({ role: 'assistant', content: rest || null });
      if (!rest.trim() && tc.length) { messages.push({ role: 'user', content: '[工具结果]\n' + results.join('\n') + '\n\n接着把回复写完（用正规的工具调用改存档，不要把调用写成正文）' }); continue; }
      if (tc.length) messages.push({ role: 'user', content: '[工具结果，不是她说的话]\n' + results.join('\n') + '\n\n（以后改存档请用正规的工具调用，不要写进正文。这条不用回复）' });
      return rest;
    }
    if (shown < text.length) onText(text.slice(shown));   // 压住的那几个字（不是调用）补上
    messages.push({ role: 'assistant', content: text || null, ...(used.length ? { tool_calls: used.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) } : {}) });
    if (!used.length) {
      if (finish === 'length' && !text.trim()) throw new Error('模型的上下文不够长，回复被截断了（本机模型：在安装器里把上下文调大；线上模型：换一个上下文更长的）');
      return text;
    }
    for (const c of used) {
      let a = {}; try { a = JSON.parse(c.args || '{}'); } catch {}
      messages.push({ role: 'tool', tool_call_id: c.id, content: runTool(gameDir, c.name, a) });
    }
  }
  return '';
}

// 测一下接口能不能用（安装器 / 设置页的「测试」按钮）
async function ping({ base, key, model }) {
  const r = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: '只回复两个字：你好' }], max_tokens: 20 }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}：${t.slice(0, 200)}`);
  return JSON.parse(t).choices?.[0]?.message?.content || '';
}

module.exports = { runTurn, ping, runTool, TOOLS };
