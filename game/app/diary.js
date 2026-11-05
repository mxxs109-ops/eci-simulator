/* 恶雌模拟器 · 日记页：我的日记和兽夫日记放在一起
   顶上一排：我、每位兽夫。点「我」下面再分两格：🌍 现实日记（她自己记的现实生活，可以带图，可以让兽夫们知道）
   和 🎮 游戏日记（原来的「我的一天」，游戏替她记的）。原来单独的「我的一天」标签收进这里。
   在主脚本之后加载：换掉主脚本里的 loadDiary / drawDtabs。 */
(() => {
  const $ = id => document.getElementById(id);
  const view = $('view-diary'); if (!view || !$('days')) return;
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WEEK = '日一二三四五六';
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .dsub { display: flex; justify-content: center; padding: 10px 16px 0; }
  .dsub .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line); }
  .dsub button { border: none; background: transparent; border-radius: 999px; padding: 5px 16px; color: var(--muted); font-size: 14px; }
  .dsub button.on { background: var(--me); color: var(--me-ink, #fff); font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
  #view-diary .dtab.mine { padding: 4px 14px; }
  #view-diary .day h3 small { color: var(--muted); font-weight: normal; font-size: 13px; margin-left: 8px; }
  #view-diary .entry { margin: 4px 0; white-space: pre-wrap; word-break: break-word; }
  #view-diary .entry img { display: block; max-width: 260px; max-height: 260px; border-radius: 8px; margin: 6px 0; cursor: zoom-in; }
  #view-diary .tm { color: var(--me); font-weight: 700; margin-right: 4px; }
  @media (max-width: 760px) {
    #view-diary .dtabs { flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; padding: 8px 10px; scrollbar-width: none; }
    #view-diary .dtabs::-webkit-scrollbar { display: none; }
    #view-diary .dtab { flex: none; white-space: nowrap; }
    #diaryComposer .hint span { display: none; }
  }
  .dhint { color: var(--muted); font-size: 12px; text-align: center; margin: 6px 0 0; }
  ` }));

  // 原来的「我的一天」标签藏起来，它的内容挪进日记页；标签名统一叫「日记」
  const mdTab = document.querySelector('.tab[data-view="myday"]'); if (mdTab) mdTab.style.display = 'none';
  const dTab = document.querySelector('.tab[data-view="diary"]'); if (dTab && !dTab.querySelector('.ti')) dTab.textContent = '📔 日记';
  const days = $('days'), mydays = $('mydays');
  if (mydays) days.parentNode.appendChild(mydays);

  // 现实日记的输入框：老存档本来就有；公开版没有就补一个
  if (!$('diaryComposer')) {
    $('dtabs').insertAdjacentHTML('afterend', `<div class="composer" id="diaryComposer"><div class="wrap">
      <div class="pending" id="diaryPending"></div>
      <div class="row"><button class="clip" id="diaryClip" title="添加图片或文件">📎</button>
        <textarea id="diaryInput" placeholder="现在在做什么？例如：起床了，感觉好冷。"></textarea>
        <button class="primary" id="diarySave">记下</button></div>
      <div class="hint"><label><input type="checkbox" id="withTime" checked> 自动加上时间</label>
        <label><input type="checkbox" id="shareDiary"> 让兽夫们知道我今天的日记</label><span>Ctrl+Enter 记下</span></div>
    </div></div>`);
    const input = $('diaryInput'), attach = makeAttach($('diaryPending'));
    hookAttach(attach, $('diaryClip'), input, view);
    async function save() {
      const text = input.value.trim(), files = attach.take();
      if (!text && !files.length) return;
      $('diarySave').disabled = true;
      try {
        await fetch('/api/diary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, withTime: $('withTime').checked, files: await toPayload(files) }) });
        input.value = ''; await window.loadDiary();
      } catch (e) { alert('保存失败：' + e.message); }
      $('diarySave').disabled = false; input.focus();
    }
    $('diarySave').onclick = save;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); save(); } });
    fetch('/api/settings').then(r => r.json()).then(s => { $('shareDiary').checked = !!s.shareDiary; }).catch(() => {});
    $('shareDiary').onchange = e => fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareDiary: e.target.checked }) });
  }

  // 「我」下面的两格
  $('diaryComposer').insertAdjacentHTML('beforebegin', `<div class="dsub" id="dsub"><div class="seg"><button data-sub="real">🌍 现实日记</button><button data-sub="game">🎮 游戏日记</button></div></div>`);
  let sub = (() => { try { return localStorage.getItem('diarySub') || 'real'; } catch { return 'real'; } })();
  $('dsub').onclick = e => { const b = e.target.closest('[data-sub]'); if (!b) return; sub = b.dataset.sub; try { localStorage.setItem('diarySub', sub); } catch {} window.loadDiary(); };

  const who = () => (typeof diaryWho !== 'undefined' && diaryWho) || '我';
  // 只列已经登场的兽夫（还没见过面的不该有日记本）
  const met = n => { const c = typeof cast !== 'undefined' && cast[n]; return !!c && c.where !== '未登场' && !/尚未登场/.test(c.doing || ''); };
  window.drawDtabs = function () {
    const w = who();
    $('dtabs').innerHTML = [`<button class="dtab mine ${w === '我' ? 'on' : ''}" data-who="我">📔 我的日记</button>`]
      .concat(castOrder.filter(met).map(n => `<button class="dtab ${w === n ? 'on' : ''}" data-who="${E(n)}" style="--c:${COLORS[n] || 'var(--c-other)'}"><span class="mini" style="${faceStyle(n, 26, 9)}"></span>${E(n)}</button>`)).join('');
  };
  function renderReal(text) {
    return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
      const html = E(line)
        .replace(/^(凌晨|早上|上午|中午|下午|傍晚|晚上|深夜)? ?(\d{1,2}:\d{2})，?/, m => `<span class="tm">${m}</span>`)
        .replace(/\[(图片|文件)\] (\S+)/g, (_, kind, p) => { const u = fileUrl('/diary/', p);
          return kind === '图片' ? `<img src="${u}" alt="">` : `<a class="filechip" href="${u}" target="_blank">📄 ${E(p.split('/').pop())}</a>`; });
      return `<div class="entry">${html}</div>`;
    }).join('');
  }
  window.loadDiary = async function () {
    if (!castOrder.length) await loadCast();
    if (typeof diaryWho !== 'undefined' && diaryWho && diaryWho !== '我' && !met(diaryWho)) diaryWho = '我';
    if (typeof diaryWho !== 'undefined' && !diaryWho) diaryWho = '我';
    window.drawDtabs();
    const mine = who() === '我';
    $('dsub').style.display = mine ? '' : 'none';
    $('dsub').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
    $('diaryComposer').style.display = mine && sub === 'real' ? '' : 'none';
    if (mydays) mydays.style.display = mine && sub === 'game' ? '' : 'none';
    days.style.display = mine && sub === 'game' ? 'none' : '';
    if (!mine) {
      const all = await fetch('/api/husband-diary').then(r => r.json()).catch(() => []);
      days.innerHTML = renderHusbandDiary(all.find(x => x.name === who()) || { name: who(), text: '' });
      return;
    }
    if (sub === 'game') { if (typeof loadMyDay === 'function') await loadMyDay(); return; }
    const list = await fetch('/api/diary').then(r => r.json()).catch(() => []);
    if (!list.length) { days.innerHTML = '<div class="empty">还没有现实日记。在上面记下今天发生的事吧。</div>'; return; }
    const health = typeof showHealth === 'function';   // 老存档有「饮食与身体分析」
    days.innerHTML = list.map(d => `<div class="day"><h3>${d.date}<small>星期${WEEK[new Date(d.date + 'T00:00').getDay()]}</small></h3>${renderReal(d.text) || '<div class="empty">（空）</div>'}
      ${health ? `<button class="hbtn" data-health="${d.date}">🩺 饮食与身体分析</button><div class="health" id="health-${d.date}" hidden></div>` : ''}</div>`).join('');
    if (health) for (const d of list) fetch('/api/health/' + d.date).then(r => r.json()).then(h => { if (h.text) showHealth(d.date, h.text); }).catch(() => {});
  };
  // 地址后面是 #myday 的（老书签）：打开日记页的游戏日记
  if (location.hash === '#myday') { sub = 'game'; document.querySelector('.tab[data-view="diary"]')?.click(); }
  if (view.classList.contains('on')) window.loadDiary();
})();
