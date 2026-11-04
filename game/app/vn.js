/* 恶雌模拟器 · 剧情模式（galgame 对话框）
   回复一段一段进队列，对话框里打字机显示，点一下 / 空格翻到下一段；场景是院子或她的洞，
   说话的兽夫用抠好图的立绘站在场景里（按状态换战损 / 易感期），说话的人亮、别人暗。
   在主脚本之后加载：包一层 render()，聊天流里每来一次新文字就把写完的段落放进队列。 */
(() => {
  const $ = s => document.querySelector(s);
  const G = p => '/game/' + p.split('/').map(encodeURIComponent).join('/');
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inl = s => escH(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/（([^）]*)）/g, '<span class="vact">（$1）</span>').replace(/\*([^*]+)\*/g, '<i class="vthink">$1</i>');

  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  #vn { position: relative; flex: 1; min-height: 0; overflow: hidden; display: none; background: #2b2118 center/cover no-repeat; user-select: none; cursor: pointer; }
  body.vnmode #vn { display: block; }
  body.vnmode #log { display: none; }
  #vn .shade { position: absolute; inset: 0; pointer-events: none; transition: background .8s; }
  #vn .sprites { position: absolute; inset: 0; pointer-events: none; }
  #vn .spr { position: absolute; bottom: -38%; height: 128%; transform: translateX(-50%); transition: filter .35s, transform .35s, opacity .4s, left .5s; filter: brightness(.55) saturate(.7) drop-shadow(0 0 18px rgba(0,0,0,.4)); opacity: 0; }
  #vn .spr.on { opacity: 1; }
  #vn .spr.calm { filter: brightness(.95) drop-shadow(0 0 18px rgba(0,0,0,.4)); }
  #vn .spr.talk { filter: brightness(1) drop-shadow(0 0 22px rgba(0,0,0,.45)); transform: translateX(-50%) scale(1.03); z-index: 2; }
  #vn .spr.hop { animation: vhop .38s cubic-bezier(.3,1.6,.5,1); }
  @keyframes vhop { 0% { transform: translateX(-50%) scale(1.03) translateY(0); } 40% { transform: translateX(-50%) scale(1.04,.99) translateY(-14px); } 100% { transform: translateX(-50%) scale(1.03) translateY(0); } }
  #vn .box { position: absolute; left: 3%; right: 3%; bottom: 3%; min-height: 18%; max-height: 42%; overflow-y: auto; z-index: 5;
    background: rgba(30,22,16,.82); backdrop-filter: blur(3px); border: 1px solid rgba(255,230,190,.35); border-radius: 14px; padding: 18px 24px 26px; color: #fbf3e6;
    font: 18px/1.85 "PingFang SC","Microsoft YaHei",sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.45); }
  #vn .name { position: absolute; left: 4%; bottom: auto; top: auto; z-index: 6; padding: 4px 22px; border-radius: 10px 10px 0 0; font: 700 20px "STKaiti","KaiTi",serif; color: #fff; background: var(--c, #8a5a3c); letter-spacing: 3px; box-shadow: 0 -2px 10px rgba(0,0,0,.3); }
  #vn .name:empty { display: none; }
  #vn .box.narr { font-style: normal; color: #efe4d2; }
  #vn .box.hasface { padding-left: 166px; min-height: max(18%, 172px); }
  #vn .face { display: none; position: sticky; float: left; top: 0; margin-left: -144px; width: 124px; height: 124px; border-radius: 14px; border: 3px solid var(--c, #c9a46a); background: #2a1f17 no-repeat; box-shadow: 0 0 0 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.5); }
  #vn .box.hasface .face { display: block; }
  #vn .box.env { text-align: center; color: #d8cbb8; font-size: 15px; }
  #vn .box.me { display: block; border-color: rgba(255,180,160,.6); }
  #vn .box.sum { background: rgba(70,52,26,.9); border-color: rgba(255,214,140,.7); font-size: 16px; }
  #vn .vact { color: #c9b79f; font-size: .92em; }
  #vn .vthink { color: #b9d4ff; font-style: italic; }
  #vn .next { position: absolute; right: 22px; bottom: 10px; font-size: 14px; color: #ffe2a8; animation: vblink 1s infinite; }
  @keyframes vblink { 50% { opacity: .2; transform: translateY(3px); } }
  #vn .wait { color: #d8cbb8; }
  #vn .wait::after { content: '…'; animation: vblink 1s infinite; }
  #vn .bar { position: absolute; top: 10px; right: 12px; z-index: 7; display: flex; gap: 6px; }
  #vn .bar button { background: rgba(255,250,240,.88); font-size: 13px; padding: 3px 10px; }
  #vn .bar button.on { background: #8a5a3c; color: #fff; }
  #vn .count { position: absolute; top: 12px; left: 14px; z-index: 7; color: #fff; font-size: 12px; background: rgba(0,0,0,.35); padding: 2px 8px; border-radius: 8px; }
  #vnToggle.on { background: var(--me); color: #fff; }
  #vn .hud { position: absolute; top: 40px; left: 12px; z-index: 7; display: flex; flex-direction: column; gap: 6px; }
  #vn .hud .h { background: rgba(30,22,16,.72); color: #fbf3e6; border-radius: 10px; padding: 6px 10px; font-size: 12px; line-height: 1.6; min-width: 190px; max-width: 260px; border-left: 3px solid var(--c); }
  #vn .hud .h b { font: 700 15px "STKaiti","KaiTi",serif; color: #fff; }
  #vn .hud .bar2 { display: inline-block; width: 70px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.25); vertical-align: middle; overflow: hidden; margin: 0 4px; }
  #vn .hud .bar2 i { display: block; height: 100%; }
  #vn .hud .d { opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 900px) { #vn .box { font-size: 16px; padding: 20px 16px 26px; min-height: 30%; } #vn .box.hasface { padding-left: 104px; } #vn .face { width: 76px; height: 76px; margin-left: -90px; } #vn .spr { height: 110%; bottom: -24%; } #vn .name { font-size: 16px; bottom: calc(3% + 30% - 8px); } }
  ` }));

  // 场景
  const vn = document.createElement('div');
  vn.id = 'vn';
  vn.innerHTML = `<div class="shade"></div><div class="sprites"></div><div class="count"></div><div class="hud"></div>
    <div class="bar"><button data-vn="back" title="上一段">◀</button><button data-vn="skip" title="直接看完这一轮">⏭ 看完</button><button data-vn="auto" title="自动播放">▶ 自动</button><button data-vn="voice" title="配音" style="display:none">🔊</button><button data-vn="log" title="看聊天记录">📜 记录</button></div>
    <div class="name"></div><div class="box"><div class="face"></div><span class="txt"></span><span class="next" style="display:none">▼</span></div>`;
  $('#log').before(vn);
  // 页头的开关：剧情模式 / 记录模式
  const tg = document.createElement('button');
  tg.id = 'vnToggle'; tg.title = '剧情模式：像 galgame 一样一段一段看';
  $('#reset').before(tg);
  let on = (() => { try { return localStorage.getItem('vnMode') !== 'off'; } catch { return true; } })();
  const setMode = v => { on = v; document.body.classList.toggle('vnmode', on); tg.classList.toggle('on', on); tg.textContent = on ? '🎬 剧情' : '📜 记录'; try { localStorage.setItem('vnMode', on ? 'on' : 'off'); } catch {} if (on) paint(); };

  // 队列：pages = [{who, text, kind}]，idx = 正在看的那一段
  let waiting = false, roundKey = '', pages = [], idx = -1, streamText = '', streamFed = 0, typing = null, shown = '';
  const parse = raw => {
    const p = raw.trim(); if (!p) return null;
    const m = p.match(/^\*{0,2}【([^】]+)】\*{0,2}\s*([\s\S]*)$/);
    if (m) return { who: m[1], text: m[2], kind: 'say' };
    if (/^📌/.test(p)) return { who: '小结', text: p.replace(/^📌\s*小结[：:]\s*/, ''), kind: 'sum' };
    if (/^`?——/.test(p)) return { who: '', text: p.replace(/`/g, ''), kind: 'env' };
    return { who: '', text: p, kind: 'narr' };
  };
  const split = t => t.split(/\n\s*\n/).map(parse).filter(Boolean);

  // 包一层 render：发消息期间，回复每长一截，就把写完的段落放进队列
  const origRender = window.render;
  window.render = function (text) {
    if (sendBtn.disabled && typeof text === 'string') feed(text, false);
    return origRender(text);
  };
  const origAddMe = window.addMe;
  window.addMe = function (text) {
    if (sendBtn.disabled) {   // 她刚发的话：作为新一轮的第一页
      pages = [{ who: '我', text, kind: 'me' }]; idx = -1; streamText = ''; streamFed = 0; roundKey = 'sending';
      waiting = false; setTimeout(() => go(0), 0);
    }
    return origAddMe(text);
  };
  function feed(text, done) {
    streamText = text;
    const ps = split(text);
    const ready = done ? ps.length : ps.length - 1;   // 最后一段可能还没写完
    for (; streamFed < ready; streamFed++) pages.push(ps[streamFed]);
    if (waiting && idx < pages.length - 1 && !typing) { waiting = false; go(idx + 1); }   // 她点过“下一页”在等：新的一段来了再翻
    paintCount();
  }
  // 发完了：把最后一段也放进去
  setInterval(() => {
    if (!sendBtn.disabled && streamText && streamFed < split(streamText).length) feed(streamText, true);
    if (!sendBtn.disabled && roundKey === 'sending') {   // 这一轮写完了：记下是哪一轮，刷新后接着读
      roundKey = 'saving';
      fetch('/api/history').then(r => r.json()).then(h => { roundKey = roundOf(h).key; savePos(); }).catch(() => {});
    }
    // 停在最后一页、兽夫还在写：一直挂着「下一段还在写…」
    if (on && !typing && pages[idx] && idx === pages.length - 1 && sendBtn.disabled) {
      const nx = vn.querySelector('.next');
      if (nx.textContent !== '下一段还在写…' || nx.style.display === 'none') { nx.textContent = '下一段还在写…'; nx.style.display = ''; }
    } else if (on && !typing && idx < pages.length - 1) {   // 下一段已经到了（含整点的新动态）：换回 ▼
      const nx = vn.querySelector('.next');
      if (nx.textContent !== '▼') { nx.textContent = '▼'; nx.style.display = ''; }
    }
    // 她点过“下一页”在等：有新的一段就翻；写完了却没收到（刷新过、流断了），从记录里重新取这一轮
    if (waiting && !typing) {
      if (idx < pages.length - 1) { waiting = false; go(idx + 1); }
      else if (!sendBtn.disabled && !refetching) {
        refetching = true;
        fetch('/api/history').then(r => r.json()).then(h => {
          const r = roundOf(h);
          if (r.pages.length > pages.length) { pages = r.pages; roundKey = r.key; streamFed = pages.length; }
          if (!waiting) return;
          waiting = false;
          if (idx < pages.length - 1) go(idx + 1); else advance();   // 真没有了：显示「本轮完」
        }).catch(() => {}).finally(() => { refetching = false; });
      }
    }
  }, 400);
  let refetching = false;

  // 一轮 = 她最后说的那句起到现在的所有东西：兽夫们的回复、整点的旁白和 🕐 小动态，按时间顺序
  function roundOf(h) {
    let s = -1; h.forEach((m, i) => { if (m.role === 'user' && !m.tick) s = i; });
    const ps = [];
    for (const m of s >= 0 ? h.slice(s) : h.slice(-1)) {
      if (m.tick) ps.push({ who: '', text: m.text, kind: 'env' });
      else if (m.role === 'user') ps.push({ who: '我', text: m.text, kind: 'me' });
      else ps.push(...split(m.text));
    }
    return { pages: ps, key: s >= 0 ? 'me|' + (h[s].time || '') + '|' + h[s].text.length : '' };
  }
  // 整点模拟在后台往记录里加东西：剧情这边也跟上（正在写回复时不动）
  async function syncRound() {
    if (sendBtn.disabled || roundKey === 'sending' || roundKey === 'saving') return;
    const h = await fetch('/api/history').then(r => r.json()).catch(() => null);
    if (!h || sendBtn.disabled) return;
    const r = roundOf(h);
    if (r.key !== roundKey) { pages = r.pages; roundKey = r.key; idx = Math.min(Math.max(idx, 0), pages.length - 1); streamFed = 0; paint(); return; }
    if (r.pages.length <= pages.length) return;
    const wasLast = idx === pages.length - 1;
    pages = r.pages; paintCount();
    if (on && wasLast && autoOn && !voicing && !typing) go(idx + 1);   // 自动播放停在最后：新的来了接着播
  }
  // 载入时：显示最后一轮，停在上次读到的地方，可以往回翻
  async function loadLast() {
    const h = await fetch('/api/history').then(r => r.json()).catch(() => []);
    ({ pages, key: roundKey } = roundOf(h));
    // 上次读到哪一页：同一轮就接着读，新的一轮从头读
    let saved = null; try { saved = JSON.parse(localStorage.getItem('vnPos') || 'null'); } catch {}
    idx = saved && saved.key === roundKey ? Math.min(saved.idx, pages.length - 1) : (saved ? 0 : pages.length - 1);
    shown = 'done';
    paint();
  }

  // 场景和立绘
  let cast = {}, map = {};
  async function loadWorld() {
    const [c, m] = await Promise.all([fetch('/api/cast').then(r => r.json()).catch(() => []), fetch('/api/map').then(r => r.json()).catch(() => ({}))]);
    cast = Object.fromEntries(c.map(x => [x.name, x])); map = m || {};
    paint();
  }
  const spriteOf = n => {
    const d = (cast[n] && cast[n].doing) || '';
    const st = /【易感期】/.test(d) ? '-易感期' : /【战损】/.test(d) ? '-终极战损' : '';
    return { cut: G(`立绘/抠图/${n}${st}.png`), raw: G(`立绘/${n}${st}.jpg`) };
  };
  function paintScene() {
    const inCave = map.me === '院子·她的洞';
    vn.style.backgroundImage = `url(${G('立绘/2D/' + (inCave ? '山洞屋子.png' : '院子.png'))})`;
    const night = /夜|深夜|凌晨/.test(map.period || ''), dusk = /黄昏/.test(map.period || '');
    vn.querySelector('.shade').style.background = night ? 'linear-gradient(rgba(10,14,40,.55), rgba(10,10,30,.35))' : dusk ? 'rgba(80,40,10,.25)' : 'rgba(0,0,0,.08)';
    // 在她身边的兽夫：和她同在洞里，或者她在院子里时院子里的
    const here = Object.keys(cast).filter(n => {
      const w = cast[n].where || '';
      return inCave ? w === '院子·她的洞' : /^院子·/.test(w) && /^院子·/.test(map.me || '');
    });
    const cur = pages[idx];
    if (cur && cur.kind === 'say' && cast[cur.who] && !here.includes(cur.who)) here.push(cur.who);   // 传音 / 刚来的也站出来
    const box = vn.querySelector('.sprites');
    const keep = new Set();
    here.forEach((n, i) => {
      let el = box.querySelector(`[data-n="${n}"]`);
      const s = spriteOf(n);
      if (!el) {
        el = document.createElement('img'); el.className = 'spr'; el.dataset.n = n;
        el.onerror = () => { if (el.src !== location.origin + s.raw) el.src = s.raw; };
        box.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
      }
      if (el.dataset.src !== s.cut) { el.dataset.src = s.cut; el.src = s.cut; }
      el.style.left = (here.length === 1 ? 50 : 22 + 56 * i / (here.length - 1)) + '%';
      el.classList.toggle('talk', !!cur && cur.who === n);
      el.classList.toggle('calm', !cur || cur.kind !== 'say' || !here.includes(cur.who));
      keep.add(n);
    });
    box.querySelectorAll('.spr').forEach(el => { if (!keep.has(el.dataset.n)) el.remove(); });
    vn.querySelector('.hud').innerHTML = here.map(n => {
      const c = cast[n], hv = +(((c.food && c.food.nutrition) || '').match(/健康值\s*(\d+)/) || [])[1];
      const bar = (v, col) => `<span class="bar2"><i style="width:${v}%;background:${col}"></i></span>`;
      return `<div class="h" style="--c:${COLORS[n] || '#8a5a3c'}"><b>${escH(n)}</b>　❤ ${bar(Math.max(0, Math.min(100, c.favor || 0)), '#e57399')}${c.favor || 0}${hv >= 0 ? `　🩺 ${bar(hv, hv > 60 ? '#4caf50' : hv > 30 ? '#f0b429' : '#e53935')}${hv}` : ''}
        <div class="d" title="${escH(c.doing || '')}">${escH((c.doing || '').replace('【战损】', '💀 ').replace('【易感期】', '🔥 '))}</div><div class="d">${escH(c.mood || '')}${c.food && c.food.body ? '｜' + escH(c.food.body) : ''}</div></div>`;
    }).join('');
  }
  function paintCount() {
    vn.querySelector('.count').textContent = pages.length ? `${Math.max(0, idx) + 1} / ${pages.length}${sendBtn.disabled ? ' …' : ''}` : '';
  }
  function paint() { if (!on) return; paintScene(); showPage(false); paintCount(); }

  // 对话框：打字机
  function showPage(animate) {
    const p = pages[idx], box = vn.querySelector('.box'), name = vn.querySelector('.name'), txt = vn.querySelector('.txt'), nx = vn.querySelector('.next');
    clearInterval(typing); typing = null;
    if (!p) {
      name.textContent = '';
      box.className = 'box narr';
      txt.innerHTML = sendBtn.disabled ? '<span class="wait"></span>' : '';
      nx.style.display = 'none'; return;
    }
    name.textContent = p.kind === 'say' || p.kind === 'me' || p.kind === 'sum' ? (p.kind === 'sum' ? '📌 小结' : p.who) : '';
    name.style.setProperty('--c', p.kind === 'sum' ? '#b8893a' : p.kind === 'me' ? 'var(--me)' : (COLORS[p.who]) || '#8a5a3c');
    box.className = 'box ' + p.kind;
    // 说话的人：对话框左边一个头像框
    const face = box.querySelector('.face'), small = innerWidth <= 900 ? 76 : 124;
    const fs2 = p.kind === 'say' && typeof faceStyle === 'function' ? faceStyle(p.who.split(/[、,，和]/)[0].trim(), small) : '';
    const fsMe = p.kind === 'me' ? `background-image:url(${G('立绘/2D/我-小人.png')});background-size:contain;background-position:center` : '';
    face.setAttribute('style', (fs2 || fsMe) + ';--c:' + (p.kind === 'me' ? 'var(--me)' : (COLORS[p.who] || '#c9a46a')));
    box.classList.toggle('hasface', !!(fs2 || fsMe));
    requestAnimationFrame(() => { const r = box.getBoundingClientRect(), v = vn.getBoundingClientRect(); name.style.top = (r.top - v.top - name.offsetHeight + 2) + 'px'; });
    const html = inl(p.text);
    nx.style.display = 'none'; nx.textContent = '▼';
    if (!animate) { txt.innerHTML = html; shown = 'done'; nx.style.display = hasNext() ? '' : 'none'; return; }
    // 一个字一个字出来（标签整块跳过）
    const parts = html.split(/(<[^>]+>)/); let out = '', pi = 0, ci = 0;
    shown = 'typing';
    typing = setInterval(() => {
      for (let k = 0; k < 2; k++) {
        while (pi < parts.length && (parts[pi] === '' || parts[pi].startsWith('<'))) out += parts[pi++];
        if (pi >= parts.length) break;
        const seg = parts[pi];
        if (seg[ci] === '&') { const e = seg.indexOf(';', ci); out += seg.slice(ci, e + 1); ci = e + 1; } else out += seg[ci++];
        if (ci >= seg.length) { pi++; ci = 0; }
      }
      txt.innerHTML = out;
      box.scrollTop = box.scrollHeight;
      if (pi >= parts.length) { clearInterval(typing); typing = null; shown = 'done'; nx.style.display = hasNext() ? '' : 'none'; }
    }, 28);
  }
  const hasNext = () => idx < pages.length - 1 || (sendBtn.disabled);
  function go(i) {
    if (i < 0 || i >= pages.length) return;
    idx = i; savePos(); paintScene(); paintCount(); showPage(true); speak(idx);
    const p = pages[idx], sp = p && vn.querySelector(`.spr[data-n="${p.who}"]`);
    if (sp) { sp.classList.remove('hop'); void sp.offsetWidth; sp.classList.add('hop'); }
  }
  /* ---------- 配音：翻到哪页读哪页，后面几页提前生成 ---------- */
  let voiceOn = (() => { try { return localStorage.getItem('vnVoice') !== 'off'; } catch { return true; } })();
  let voiceUp = false, audio = null;
  const voiceUrls = new Map();
  const paintVoiceBtn = () => { const b = vn.querySelector('[data-vn="voice"]'); if (b) { b.textContent = voiceOn && voiceUp ? '🔊' : '🔇'; b.style.display = voiceUp ? '' : 'none'; } };
  const checkVoice = () => fetch('/api/voice/status').then(r => r.json()).then(j => { voiceUp = !!j.ok; paintVoiceBtn(); }).catch(() => { voiceUp = false; paintVoiceBtn(); });
  checkVoice(); setInterval(checkVoice, 30000);
  // 一页切成几段按顺序念：括号动作 = 旁白；*斜体* 心里话 = 想事情的人压低声音；其余 = 说话的人（她自己 = 「我」，叙述 / 小结 = 旁白）
  const lead = w => (w || '').split(/[、,，和]/)[0].trim();
  const cleanV = t => t.replace(/\*+/g, '').replace(/[`#>]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
  function voiceOf(i) {
    const p = pages[i]; if (!p) return [];
    let j = i; while (j >= 0 && !(pages[j] && pages[j].kind === 'say')) j--;
    const self = p.kind === 'say' ? lead(p.who) : p.kind === 'me' ? '我' : '旁白';
    const thinker = self !== '旁白' ? self : j >= 0 ? lead(pages[j].who) : '旁白';
    const acts = self !== '旁白' ? (p.text.match(/[（(][^）)]*[）)]/g) || []).map(x => x.slice(1, -1)).join('，') : '';
    const segs = [];
    for (const m of p.text.matchAll(/([（(][^）)]*[）)])|(?<!\*)\*([^*\n]+)\*(?!\*)|([^（(*]+|\*+)/g)) {
      const v = m[1] ? { who: '旁白', text: m[1].slice(1, -1), emo: '' }
        : m[2] ? { who: thinker, text: m[2], emo: '心里默想，低声' }
        : { who: self, text: m[3], emo: acts };
      v.text = cleanV(v.text);
      if (!/[\p{L}\p{N}]/u.test(v.text)) continue;
      const last = segs[segs.length - 1];
      if (last && last.who === v.who && last.emo === v.emo) last.text += ' ' + v.text; else segs.push(v);
    }
    return segs;
  }
  function segUrl(v) {
    const k = v.who + '|' + v.text + '|' + v.emo;
    if (!voiceUrls.has(k)) voiceUrls.set(k, fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
      .then(r => r.ok ? r.blob() : null).then(b => b && URL.createObjectURL(b)).catch(() => null)
      .then(u => { if (!u) voiceUrls.delete(k); return u; }));
    return voiceUrls.get(k);
  }
  const pageUrls = i => voiceOf(i).map(segUrl);
  /* ---------- 自动播放：念完（没配音就按字数停一会儿）自动翻页 ---------- */
  let autoOn = (() => { try { return localStorage.getItem('vnAuto') === 'on'; } catch { return false; } })();
  let vtok = 0, autoT = null, voicing = false;
  const paintAutoBtn = () => { const b = vn.querySelector('[data-vn="auto"]'); if (b) { b.textContent = autoOn ? '⏸ 自动' : '▶ 自动'; b.classList.toggle('on', autoOn); } };
  const readMs = i => 1500 + ((pages[i] && pages[i].text.length) || 0) * 120;
  function autoNext(i, ms) {
    clearTimeout(autoT);
    autoT = setTimeout(() => {
      if (!autoOn || !on || idx !== i) return;
      if (typing) { advance(); return autoNext(i, 1200); }
      advance();
    }, ms);
  }
  function stopVoice() { vtok++; voicing = false; clearTimeout(autoT); if (audio) { audio.pause(); audio = null; } }
  async function speak(i) {
    stopVoice(); const tok = vtok;
    if (!voiceOn || !voiceUp) { if (autoOn) autoNext(i, readMs(i)); return; }
    const urls = pageUrls(i);
    for (let k = 1; k <= 3; k++) pageUrls(i + k);   // 后面几页先生成好
    voicing = true;
    for (const pu of urls) {
      const u = await pu; if (tok !== vtok) return;
      if (!u) continue;
      await new Promise(res => { audio = new Audio(u); audio.onended = audio.onerror = res; audio.play().catch(res); });
      if (tok !== vtok) return;
    }
    audio = null; voicing = false;
    if (autoOn) autoNext(i, urls.length ? 600 : readMs(i));
  }

  function savePos() { try { localStorage.setItem('vnPos', JSON.stringify({ key: roundKey, idx })); } catch {} }
  function advance() {
    if (typing) { clearInterval(typing); typing = null; showPage(false); return; }   // 正在打字：先整段显示
    if (idx < pages.length - 1) return go(idx + 1);
    if (sendBtn.disabled) {   // 还在写：这一页留着，右下角显示在等，下一段来了再翻
      waiting = true; const nx = vn.querySelector('.next'); nx.style.display = ''; nx.textContent = '下一段还在写…';
    }
    else {   // 这一轮读完了：提示一下，光标放进输入框
      const nx = vn.querySelector('.next'); nx.style.display = ''; nx.textContent = '— 本轮完 · 在下面回他 —';
      const box = vn.querySelector('.box'); box.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }], { duration: 300 });
      const ip = document.querySelector('#input'); if (ip) { ip.focus(); ip.animate([{ boxShadow: '0 0 0 0 rgba(200,90,60,.0)' }, { boxShadow: '0 0 0 6px rgba(200,90,60,.45)' }, { boxShadow: '0 0 0 0 rgba(200,90,60,.0)' }], { duration: 900 }); }
    }
  }
  vn.addEventListener('click', e => {
    const b = e.target.closest('[data-vn]');
    if (b) {
      e.stopPropagation();
      if (b.dataset.vn === 'back') go(idx - 1);
      else if (b.dataset.vn === 'skip') { idx = pages.length - 1; paint(); }
      else if (b.dataset.vn === 'log') switchMode(false);
      else if (b.dataset.vn === 'voice') { voiceOn = !voiceOn; try { localStorage.setItem('vnVoice', voiceOn ? 'on' : 'off'); } catch {} paintVoiceBtn(); speak(idx); }
      else if (b.dataset.vn === 'auto') {
        autoOn = !autoOn; try { localStorage.setItem('vnAuto', autoOn ? 'on' : 'off'); } catch {} paintAutoBtn();
        if (!autoOn) clearTimeout(autoT); else if (!voicing) autoNext(idx, 800);
      }
      return;
    }
    advance();
  });
  document.addEventListener('keydown', e => {
    if (!on || !document.querySelector('#view-chat.on')) return;
    const ae = document.activeElement, inField = ae && ae.matches('textarea, input');
    if (inField && (ae.value || e.code === 'Enter')) return;   // 在打字：不抢键
    if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); advance(); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  });
  // 剧情 ⇄ 记录 来回切：两边停在同一段。记录里最后一条「我」+ 最后一条回复的各段，和 pages 一一对应
  function logEls() {
    const list = document.querySelector('#list'); if (!list) return [];
    const kids = [...list.children], els = [];
    let s = -1; kids.forEach((el, i) => { if (el.matches('.msg.me')) s = i; });
    for (const el of kids.slice(s >= 0 ? s : kids.length - 1)) {
      if (el.matches('.msg.ai')) els.push(...el.children); else if (el.matches('.msg.me, .tick')) els.push(el);
    }
    return els;
  }
  function fromLog() {   // 记录 → 剧情：取记录里最上面露出来的那段（和 toLog 滚到的位置一致，来回切不跳）
    const log = document.querySelector('#log'), els = logEls(); if (!log || !els.length) return;
    const r = log.getBoundingClientRect();
    if (els[0].getBoundingClientRect().top >= r.bottom) return;   // 在看更早的几轮：剧情里没有，不动
    let k = els.findIndex(el => el.getBoundingClientRect().bottom > r.top + 20); if (k < 0) k = els.length - 1;
    idx = Math.min(k, pages.length - 1); shown = 'done'; savePos();
  }
  function toLog() {   // 剧情 → 记录：滚到剧情里这一页
    const log = document.querySelector('#log'), el = logEls()[idx]; if (!log || !el) return;
    log.scrollTop += el.getBoundingClientRect().top - log.getBoundingClientRect().top - 16;
    el.animate([{ background: 'rgba(200,150,80,.25)' }, { background: 'transparent' }], { duration: 1200 });
  }
  const switchMode = v => {
    if (v === on) return;
    if (v) { fromLog(); setMode(true); speak(idx); }
    else { stopVoice(); setMode(false); requestAnimationFrame(toLog); }
  };
  tg.onclick = () => switchMode(!on);

  setMode(on); paintAutoBtn();
  loadLast(); loadWorld();
  setInterval(() => { loadWorld(); syncRound(); }, 30 * 1000);
  // 记录模式里点一条回复，也能回到剧情模式
})();
