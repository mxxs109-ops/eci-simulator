/* 恶雌模拟器 · 手机布局的小动作（配合 mobile.css，只在窄屏生效）
   底部标签栏的图标和字分两行；兽夫头像上标出怀孕 / 重伤 / 易感期和好感；点头像弹出他的详情。 */
(() => {
  const narrow = () => matchMedia('(max-width: 760px)').matches;
  // 标签：「💬 聊天」拆成图标 + 字
  function tabs() {
    document.querySelectorAll('.tabs .tab').forEach(t => {
      if (t.querySelector('.ti')) return;
      const m = t.textContent.trim().match(/^(\S+)\s+(.+)$/);
      if (!m) return;
      t.innerHTML = `<span class="ti">${m[1]}</span><span class="tl">${m[2].replace('物品与等级', '物品').replace('兽夫日记', '日记')}</span>`;
    });
  }
  // 头像：右下角状态、下面一条好感
  function thumbs() {
    document.querySelectorAll('#thumbs .card').forEach(c => {
      if (c.querySelector('.mstat, .mfav')) return;
      const doing = c.querySelector('.doing')?.textContent || '';
      const st = /🥚/.test(doing) ? '🥚' : /💀/.test(doing) ? '💀' : /🔥/.test(doing) ? '🔥' : '';
      const fav = c.querySelector('.info .bar i')?.style.width || '0%';
      c.insertAdjacentHTML('beforeend', `${st ? `<span class="mstat">${st}</span>` : ''}<span class="mfav"><i style="width:${fav}"></i></span>`);
    });
  }
  const tidy = () => { tabs(); thumbs(); };
  new MutationObserver(tidy).observe(document.body, { childList: true, subtree: true });
  tidy();
  // 手机上点头像 = 看他的详情（电脑上还是换到大立绘）
  document.addEventListener('click', e => {
    if (!narrow()) return;
    const c = e.target.closest('#thumbs .card');
    if (!c || !c.dataset.name || typeof window.openInv !== 'function') return;
    e.stopPropagation(); e.preventDefault();
    window.openInv(c.dataset.name);
  }, true);
  // 输入框跟着字数长高（最多 120px）
  const ip = document.getElementById('input');
  if (ip) ip.addEventListener('input', () => { if (!narrow()) return; ip.style.height = 'auto'; ip.style.height = Math.min(120, ip.scrollHeight) + 'px'; });
})();
