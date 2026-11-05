/* 恶雌模拟器 · 物品与等级 → 游戏背包
   左边一列角色头像；右边：立绘 + 状态条 + 属性小卡（点开看全文）+ 背包格子（点一格看详情）。
   数据还是 物品与等级.md，格式不用改：「- **属性名**：内容」是属性，「- 名字｜来历｜说明」是物品。 */
(() => {
  const $ = s => document.querySelector(s);
  const G = p => '/game/' + p.split('/').map(encodeURIComponent).join('/');
  const E = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = s => E(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/（([^）]*)）/g, '<span class="ivp">（$1）</span>');

  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  #view-items.on { flex-direction: row; }
  #view-items > main { display: none; }
  .inv { flex: 1; display: flex; min-height: 0; background: linear-gradient(#f3ead9, #eadcc3); }
  .inv .iside { width: 96px; flex: none; overflow-y: auto; padding: 12px 8px; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid var(--line); background: rgba(255,255,255,.35); }
  .inv .iwho { position: relative; flex: none; width: 76px; height: 76px; border-radius: 14px; border: 3px solid var(--c); background: #fff no-repeat; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.15); transition: transform .15s; display: flex; align-items: center; justify-content: center; font-size: 30px; }
  .inv .iwho:hover { transform: scale(1.06); }
  .inv .iwho.on { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--c); }
  .inv .iwho.away { filter: grayscale(1) opacity(.45); }
  .inv .iwho span { position: absolute; bottom: -2px; left: 0; right: 0; text-align: center; font: 700 11px system-ui; color: #fff; background: rgba(0,0,0,.45); border-radius: 0 0 10px 10px; }
  .inv .main { flex: 1; overflow-y: auto; padding: 18px 22px; display: grid; grid-template-columns: 260px 1fr; gap: 18px; align-content: start; }
  .inv .pic { grid-row: span 3; position: relative; border-radius: 16px; overflow: hidden; background: radial-gradient(ellipse at 50% 70%, #fff8ea, #e6d3b2); min-height: 420px; border: 2px solid var(--c); }
  .inv .pic img { position: absolute; left: 50%; bottom: 0; height: 100%; transform: translateX(-50%); object-fit: contain; }
  .inv .pic .nm { position: absolute; left: 0; right: 0; bottom: 0; padding: 30px 14px 12px; background: linear-gradient(transparent, rgba(20,12,8,.8)); color: #fff; }
  .inv .pic .nm b { font: 700 26px "STKaiti","KaiTi",serif; letter-spacing: 3px; }
  .inv .pic .nm small { display: block; opacity: .85; font-size: 12px; line-height: 1.5; }
  .inv .rbox { background: rgba(255,255,255,.6); border-radius: 16px; padding: 10px 12px 6px; }
  .inv .rbox h4 small { font: 400 12px system-ui; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
  .inv .radar { display: block; width: min(100%, 340px) !important; height: auto !important; aspect-ratio: 260 / 270; margin: 4px auto; overflow: visible; }
  .inv .radar .cur { animation: rgrow .6s cubic-bezier(.3,1.4,.5,1); transform-origin: 130px 128px; }
  @keyframes rgrow { from { transform: scale(.2); opacity: 0; } }
  .inv .radar .rl { font: 700 12px "PingFang SC","Microsoft YaHei",sans-serif; fill: #5a4632; }
  .inv .radar .rv { font: 700 11px system-ui; fill: #3b2f25; } .inv .radar .rp { font-weight: 400; fill: #a88a5c; }
  .inv .rleg { display: flex; justify-content: center; gap: 16px; font-size: 12px; color: var(--muted); padding-bottom: 4px; }
  .inv .rleg span::before { content: ""; display: inline-block; width: 14px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
  .inv .rleg .lc::before { background: var(--c); opacity: .6; } .inv .rleg .lp::before { border: 1.5px dashed #d9a84f; background: rgba(224,180,106,.15); }
  .inv .stchips { display: flex; flex-wrap: wrap; gap: 8px; }
  .inv .stchips span { background: #fff3e0; border: 1px solid #f0c58a; color: #8a4b12; border-radius: 999px; padding: 4px 12px; font-size: 14px; font-weight: 700; }
  .inv .stchips small { font-weight: 400; opacity: .8; margin-left: 2px; }
  .inv .bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
  .inv .bar { background: rgba(255,255,255,.7); border-radius: 12px; padding: 8px 12px; font-size: 13px; }
  .inv .bar .t { display: flex; justify-content: space-between; }
  .inv .bar .g { height: 8px; border-radius: 4px; background: #e6dccb; overflow: hidden; margin-top: 4px; }
  .inv .bar .g i { display: block; height: 100%; border-radius: 4px; }
  .inv h4 { margin: 4px 0 6px; font: 700 15px "STKaiti","KaiTi",serif; color: var(--c); letter-spacing: 2px; }
  .inv .attrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .inv .attr { background: rgba(255,255,255,.75); border-radius: 12px; padding: 8px 10px; cursor: pointer; border: 1px solid transparent; transition: transform .12s; }
  .inv .attr:hover { transform: translateY(-2px); border-color: var(--c); }
  .inv .attr .k { font-size: 12px; color: var(--muted); }
  .inv .attr .v { font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .inv .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
  .inv .slot { aspect-ratio: 1/1; border-radius: 12px; background: linear-gradient(#fffaf0, #f0e3c9); border: 2px solid #d9c6a3; box-shadow: inset 0 -3px 0 rgba(0,0,0,.06); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; transition: transform .12s; }
  .inv .slot:hover { transform: scale(1.06); border-color: var(--c); }
  .inv .slot.on { border-color: var(--c); box-shadow: 0 0 0 3px var(--c); }
  .inv .slot .ic { font-size: 30px; line-height: 1; }
  .inv .slot .n { font-size: 11px; margin-top: 4px; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inv .slot.empty { opacity: .35; cursor: default; }
  .inv .detail { background: rgba(255,255,255,.85); border-radius: 14px; padding: 12px 16px; font-size: 14px; line-height: 1.8; border-left: 4px solid var(--c); min-height: 60px; }
  .inv .detail .h { font: 700 17px "STKaiti","KaiTi",serif; }
  .inv .detail .src { font-size: 12px; color: var(--muted); }
  .inv .ivp { color: var(--muted); }
  .inv .away-tag { display: inline-block; margin-left: 8px; font-size: 12px; background: #999; color: #fff; border-radius: 8px; padding: 0 8px; }
  #invPop { position: fixed; inset: 0; z-index: 900; background: rgba(20,12,8,.55); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
  #invPop .win { position: relative; width: min(1100px, 94vw); height: min(780px, 90vh); display: flex; border-radius: 20px; overflow: hidden; border: 3px solid #c9a46a; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  #invPop .inv .main { padding-right: 62px; }
  #invPop .x { position: absolute; right: 10px; top: 10px; z-index: 5; width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(0,0,0,.55); color: #fff; font-size: 18px; cursor: pointer; }
  @media (max-width: 900px) { .inv .main { grid-template-columns: 1fr; padding: 12px; } .inv .pic { min-height: 300px; grid-row: auto; } .inv .iside { width: 74px; } .inv .iwho { width: 56px; height: 56px; } }
  ` }));

  const box = document.createElement('div'); box.className = 'inv';
  $('#view-items').appendChild(box);

  const ICON = [[/袍|衣|布|披风|袖/, '👘'], [/叶|草药|草/, '🌿'], [/短匕|匕/, '🗡️'], [/刀|剑/, '🔪'], [/兽晶|晶石|晶/, '💎'], [/镣|链|锁/, '⛓️'], [/丹|药|维生素/, '💊'],
    [/灵泉|水/, '💧'], [/牛奶|奶/, '🥛'], [/肉/, '🍖'], [/狼皮|皮/, '🐺'], [/狼尸/, '🦴'], [/床/, '🛏️'], [/箱/, '📦'], [/盐/, '🧂'], [/果|香蕉/, '🍌'], [/信|书|纸/, '📜'],
    [/罐|陶/, '🏺'], [/烛|灯/, '🕯️'], [/胶/, '🔫'], [/易容|假发|头发/, '💇'], [/空间/, '🌌'], [/结界/, '🔮'], [/复活/, '❤️‍🩹'], [/院|墙/, '🏡'], [/洞/, '🕳️'], [/火塘|火/, '🔥'],
    [/石槽|槽/, '🪨'], [/柴/, '🪵'], [/食物|干/, '🥩'], [/骨牌|牌/, '🏷️'], [/蛋/, '🥚'], [/角/, '🦴']];
  const iconOf = n => (ICON.find(([re]) => re.test(n)) || [0, '🎒'])[1];
  const ATTR_ICON = { 现在: '⚡', 曾经: '👑', '兽核 / 经脉': '💠', 逆鳞: '🐉', 伤势: '🩸', 还能用的本事: '✨', 恢复条件: '🗝️', 恢复进度: '📈', 契约: '💍', 易感期: '🔥', 身高: '📏' };

  let data = [], sel = null, selItem = -1;
  // 「战斗」「六维」画成状态条和雷达图，不放进下面的属性格子
  const HIDE = ['现在', '曾经', '战斗', '六维'];
  const shownAttrs = d => d.attrs.filter(a => !HIDE.includes(a.k));
  const AXES = ['体魄', '攻击', '防御', '灵力', '精神力', '速度'];
  function battle(d) {
    const b = (d.attrs.find(a => a.k === '战斗') || {}).v || '', six = (d.attrs.find(a => a.k === '六维') || {}).v || '';
    const pair = (txt, k) => { const m = txt.match(new RegExp(k + '\\s*(\\d+)\\s*/\\s*(\\d+)')); return m ? [+m[1], +m[2]] : null; };
    const tier = (b.split(/[｜|]/)[0] || '').trim();
    return { tier, hp: pair(b, '血量'), mp: pair(b, '灵力'), six: AXES.map(k => pair(six, k)) };
  }
  // 雷达：六个顶点从正上方顺时针；外圈三道参考线；巅峰一层金色虚线，现在一层用他的颜色填满
  function radar(six, c) {
    const W = 260, cx = 130, cy = 128, r = 92;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * r * v / 100, cy + Math.sin(a) * r * v / 100]; };
    const poly = vals => vals.map((v, i) => pt(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
    const rings = [33, 66, 100].map(v => `<polygon points="${poly(AXES.map(() => v))}" fill="none" stroke="rgba(120,90,60,.18)"/>`).join('');
    const spokes = AXES.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(120,90,60,.15)"/>`; }).join('');
    const labels = AXES.map((k, i) => { const [x, y] = pt(i, 122); const v = six[i];
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" class="rl">${k}<tspan x="${x.toFixed(1)}" dy="15" class="rv">${v ? v[0] + '<tspan class="rp"> / ' + v[1] + '</tspan>' : '—'}</tspan></text>`; }).join('');
    const peak = six.map(v => (v ? v[1] : 0)), cur = six.map(v => (v ? v[0] : 0));
    return `<svg class="radar" viewBox="0 0 ${W} ${W + 10}" role="img" aria-label="六维：现在和巅峰">${rings}${spokes}
      <polygon points="${poly(peak)}" fill="rgba(224,180,106,.12)" stroke="#d9a84f" stroke-width="1.5" stroke-dasharray="4 3"/>
      <polygon class="cur" points="${poly(cur)}" fill="${c}" fill-opacity=".38" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
      ${cur.map((v, i) => { const [x, y] = pt(i, v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${c}"/>`; }).join('')}${labels}</svg>`;
  }
  function parse(text) {
    return text.split(/^## /m).slice(1).map(p => {
      const [title, ...body] = p.split(/\r?\n/);
      const name = title.trim(), lines = body.map(l => l.trim()).filter(Boolean);
      const away = lines.some(l => /【尚未登场】/.test(l));
      const attrs = [], items = [];
      for (const l of lines) {
        if (/^>/.test(l) || /【尚未登场】/.test(l) || /^#/.test(l)) continue;
        const a = l.match(/^[-*]\s+\*\*([^*]+)\*\*[：:]\s*(.*)$/);
        if (a) { attrs.push({ k: a[1], v: a[2] }); continue; }
        const it = l.match(/^[-*]\s+(.*)$/);
        if (it) {
          if (!it[1].includes('｜') && /[：:]/.test(it[1])) { const [n, ...r] = it[1].split(/[：:]/); items.push({ n: n.trim(), src: '', d: r.join('：').trim() }); continue; }
          const [n, src, ...rest] = it[1].split('｜'); items.push({ n: n.trim(), src: (src || '').trim(), d: rest.join('｜').trim() });
        }
      }
      return { name, away, attrs, items };
    });
  }
  window.loadItems = async function () {
    if (typeof castOrder !== 'undefined' && !castOrder.length && typeof loadCast === 'function') await loadCast();
    const text = await fetch(G('物品与等级.md') + '?t=' + Date.now()).then(r => r.ok ? r.text() : '').catch(() => '');
    data = parse(text);
    const ord = n => (typeof castOrder !== 'undefined' && castOrder.indexOf(n) >= 0 ? castOrder.indexOf(n) : n === '我' ? -2 : n === '家里' ? -1 : 99);
    data.sort((a, b) => (a.away - b.away) || ord(a.name) - ord(b.name));
    if (!sel || !data.find(d => d.name === sel)) sel = (data.find(d => d.name !== '我' && d.name !== '家里' && !d.away) || data[0] || {}).name;
    draw();
  };
  const colorOf = n => (typeof COLORS !== 'undefined' && COLORS[n]) || (n === '我' ? 'var(--me)' : '#8a6a4a');
  function avatarStyle(n) {
    if (n === '我') return `background-image:url(${G('立绘/2D/我-小人.png')});background-size:contain;background-position:center`;
    if (typeof faceStyle === 'function' && typeof cast !== 'undefined' && cast[n]) return faceStyle(n, 70);
    return '';
  }
  function draw() {
    const d = data.find(x => x.name === sel); if (!d) { box.innerHTML = ''; return; }
    const c = colorOf(d.name), live = typeof cast !== 'undefined' ? cast[d.name] : null;
    box.style.setProperty('--c', c);
    const side = data.map(x => `<div class="iwho ${x.name === sel ? 'on' : ''} ${x.away ? 'away' : ''}" data-inv="${E(x.name)}" style="--c:${colorOf(x.name)};${avatarStyle(x.name)}">${x.name === '家里' ? '🏡' : ''}<span>${E(x.name === '我' ? '我' : x.name)}</span></div>`).join('');
    const pic = d.name === '家里' ? G('立绘/2D/院子.png') : d.name === '我' ? G('立绘/2D/我-小人.png') : (() => {
      const st = live && /【易感期】/.test(live.doing || '') ? '-易感期' : live && /【战损】/.test(live.doing || '') ? '-终极战损' : '';
      return G(`立绘/抠图/${d.name}${st}.png`);
    })();
    const now = d.attrs.find(a => a.k === '现在'), was = d.attrs.find(a => a.k === '曾经');
    const hv = live && +(((live.food && live.food.nutrition) || '').match(/健康值\s*(\d+)/) || [])[1];
    const bar = (label, v, col, txt) => `<div class="bar"><div class="t"><span>${label}</span><b>${txt ?? v}</b></div><div class="g"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></div></div>`;
    const bars = [live ? bar('❤ 好感', live.favor || 0, '#e57399') : '', hv >= 0 ? bar('🩺 健康', hv, hv > 60 ? '#4caf50' : hv > 30 ? '#f0b429' : '#e53935') : '',
      live && live.mood ? `<div class="bar"><div class="t"><span>💭 心情</span><b>${E(live.mood)}</b></div></div>` : ''].join('');
    // 状态：怀孕（游戏知道，头两天他自己还不知道）、战损、易感期
    const doing = (live && live.doing) || '', preg = doing.match(/【怀孕(?:·第(\d+)天)?】/);
    const chips = [preg ? `🥚 怀孕${preg[1] ? ' 第 ' + preg[1] + ' 天' : ''}${!preg[1] || +preg[1] < 3 ? '<small>（他自己还不知道）</small>' : ''}` : '',
      /【战损】/.test(doing) ? '💀 重伤' : '', /【易感期】/.test(doing) ? '🔥 易感期' : ''].filter(Boolean);
    const stat = chips.length ? `<div class="stchips">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : '';
    const attrs = shownAttrs(d);
    const bt = battle(d);
    const fight = [bt.hp ? bar('❤️‍🩹 血量', bt.hp[0] / bt.hp[1] * 100, '#e0533d', bt.hp[0] + ' / ' + bt.hp[1]) : '', bt.mp ? bar('💠 灵力', bt.mp[1] ? bt.mp[0] / bt.mp[1] * 100 : 0, '#4f8fe0', bt.mp[0] + ' / ' + bt.mp[1]) : ''].join('');
    const radarBox = bt.six.some(Boolean) ? `<div class="rbox"><h4>六维 <small>${E(bt.tier)}</small></h4>${radar(bt.six, c)}<div class="rleg"><span class="lc" style="--c:${c}">现在</span><span class="lp">巅峰</span></div></div>` : '';
    const slotsN = Math.max(12, Math.ceil(d.items.length / 6) * 6);
    const slots = Array.from({ length: slotsN }, (_, i) => { const it = d.items[i];
      return it ? `<div class="slot ${i === selItem ? 'on' : ''}" data-slot="${i}" title="${E(it.n)}"><div class="ic">${iconOf(it.n)}</div><div class="n">${E(it.n.replace(/（[^）]*）/g, ''))}</div></div>` : '<div class="slot empty"></div>'; }).join('');
    const it = d.items[selItem];
    box.innerHTML = `<div class="iside">${side}</div><div class="main">
      <div class="pic"><img src="${pic}" onerror="this.style.display='none'"><div class="nm"><b>${E(d.name === '家里' ? '家里' : d.name)}</b>${d.away ? '<span class="away-tag">尚未登场</span>' : ''}<small>${T(now ? now.v.split(/[；;]/)[0] : '')}</small>${was ? `<small>曾经：${T(was.v)}</small>` : ''}</div></div>
      ${stat}${bars || fight ? `<div class="bars">${bars}${fight}</div>` : ''}
      ${radarBox}
      ${attrs.length ? `<div><h4>属性</h4><div class="attrs">${attrs.map((a, i) => `<div class="attr" data-attr="${i}"><div class="k">${ATTR_ICON[a.k] || '◆'} ${E(a.k)}</div><div class="v">${T(a.v)}</div></div>`).join('')}</div></div>` : ''}
      <div><h4>背包 · ${d.items.length} 件</h4><div class="slots">${slots}</div>
        <div class="detail" style="margin-top:10px">${it ? `<div class="h">${iconOf(it.n)} ${T(it.n)}</div>${it.src ? `<div class="src">来历：${T(it.src)}</div>` : ''}<div>${T(it.d)}</div>` : ''}</div></div>
    </div>`;
  }
  box.addEventListener('click', e => {
    const w = e.target.closest('[data-inv]'); if (w) { sel = w.dataset.inv; selItem = -1; draw(); return; }
    const s = e.target.closest('[data-slot]'); if (s) { selItem = +s.dataset.slot; draw(); s.animate && box.querySelector(`[data-slot="${selItem}"]`)?.animate([{ transform: 'scale(.9,1.1)' }, { transform: 'scale(1.08,.94)' }, { transform: 'scale(1)' }], { duration: 300 }); return; }
    const a = e.target.closest('[data-attr]'); if (a) {
      const d = data.find(x => x.name === sel), at = shownAttrs(d)[+a.dataset.attr];
      box.querySelector('.detail').innerHTML = `<div class="h">${ATTR_ICON[at.k] || '◆'} ${E(at.k)}</div><div>${T(at.v)}</div>`;
      box.querySelector('.detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  if (document.querySelector('#view-items.on')) window.loadItems();

  /* ---------- 大立绘左上角 📜：同一个背包页，弹窗打开 ---------- */
  const home = $('#view-items');
  function closeInv() {
    const p = $('#invPop'); if (!p) return;
    p.querySelector('.win').animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.85)', opacity: 0 }], { duration: 160, easing: 'ease-in' }).onfinish = () => { home.appendChild(box); p.remove(); };
  }
  window.openInv = async function (name) {
    if ($('#invPop')) return;
    const p = document.createElement('div'); p.id = 'invPop';
    p.innerHTML = '<div class="win"><button class="x">✕</button></div>';
    document.body.appendChild(p);
    p.querySelector('.win').appendChild(box);
    sel = name; selItem = -1;
    p.addEventListener('click', e => { if (e.target === p || e.target.closest('.x')) closeInv(); });
    p.querySelector('.win').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: .7 }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    await window.loadItems();
  };
  window.addEventListener('keydown', e => { if (!$('#invPop')) return; e.stopPropagation(); if (e.key === 'Escape') closeInv(); }, true);

  /* ---------- 小屋页下面的「仓库」：家里的东西，一格一格 ---------- */
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .store { margin-top: 18px; --c: #8a6a4a; }
  .store h2 small { font: 400 13px system-ui; color: var(--muted); margin-left: 8px; }
  .store .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
  .store .slot { aspect-ratio: 1/1; border-radius: 12px; background: linear-gradient(#fffaf0, #f0e3c9); border: 2px solid #d9c6a3; box-shadow: inset 0 -3px 0 rgba(0,0,0,.06); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; transition: transform .12s; }
  .store .slot:hover { transform: scale(1.06); border-color: #8a6a4a; }
  .store .slot.on { box-shadow: 0 0 0 3px #8a6a4a; }
  .store .slot .ic { font-size: 30px; line-height: 1; }
  .store .slot .n { font-size: 11px; margin-top: 4px; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .store .slot .q { position: absolute; right: 5px; bottom: 3px; font: 700 11px system-ui; color: #6b4a2a; }
  .store .slot.empty { opacity: .35; cursor: default; }
  .store .detail { margin-top: 10px; background: rgba(255,255,255,.85); border-radius: 14px; padding: 12px 16px; font-size: 14px; line-height: 1.8; border-left: 4px solid #8a6a4a; }
  .store .detail .h { font: 700 17px "STKaiti","KaiTi",serif; }
  .store .detail .src { font-size: 12px; color: var(--muted); }
  ` }));
  let storeItems = [], storeSel = -1;
  const qtyOf = t => { const m = t.match(/([一二两三四五六七八九十\d]+)\s*(条|块|张|具|袋|罐|个|件|颗|根|捆|包|只)/); return m ? m[1] + m[2] : ''; };
  async function loadStore() {
    const wrap = document.querySelector('#view-room .wrap2'); if (!wrap) return;
    let el = wrap.querySelector('.store');
    if (!el) { el = document.createElement('div'); el.className = 'store'; wrap.appendChild(el); el.addEventListener('click', e => { const s = e.target.closest('[data-st]'); if (s) { storeSel = +s.dataset.st; drawStore(el); } }); }
    const text = await fetch(G('物品与等级.md') + '?t=' + Date.now()).then(r => r.ok ? r.text() : '').catch(() => '');
    const home = parse(text).find(d => d.name === '家里');
    storeItems = home ? home.items : [];
    drawStore(el);
  }
  function drawStore(el) {
    const n = Math.max(12, Math.ceil(storeItems.length / 8) * 8);
    const it = storeItems[storeSel];
    el.innerHTML = `<h2>仓库</h2><div class="slots">${Array.from({ length: n }, (_, i) => { const x = storeItems[i];
      return x ? `<div class="slot ${i === storeSel ? 'on' : ''}" data-st="${i}" title="${E(x.n)}"><div class="ic">${iconOf(x.n)}</div><div class="n">${E(x.n.replace(/（[^）]*）/g, '').replace(/[一二两三四五六七八九十\d]+(条|块|张|具|袋|罐|个|件|颗|根|捆|包|只)$/, ''))}</div>${qtyOf(x.n) ? `<div class="q">${E(qtyOf(x.n))}</div>` : ''}</div>` : '<div class="slot empty"></div>'; }).join('')}</div>
      <div class="detail">${it ? `<div class="h">${iconOf(it.n)} ${T(it.n)}</div>${it.src ? `<div class="src">来历：${T(it.src)}</div>` : ''}<div>${T(it.d)}</div>` : ''}</div>`;
  }
  document.addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.view === 'room') setTimeout(loadStore, 50); });
  if (document.querySelector('#view-room.on')) setTimeout(loadStore, 300);
  setInterval(() => { if (document.querySelector('#view-room.on')) loadStore(); }, 60 * 1000);
})();
