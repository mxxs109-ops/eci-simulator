// 游戏里的「⚙️ 设置」：选大脑（Claude Code / API 接口）、交接模型、城市（天气）、手机连接（二维码）
(() => {
  const PRESETS = [
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'https://platform.deepseek.com/api_keys' },
    { id: 'openai', name: 'OpenAI（GPT）', base: 'https://api.openai.com/v1', model: '', key: 'https://platform.openai.com/api-keys' },
    { id: 'anthropic', name: 'Anthropic（Claude API）', base: 'https://api.anthropic.com/v1', model: '', key: 'https://console.anthropic.com/settings/keys' },
    { id: 'qwen', name: '通义千问（阿里云百炼）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', key: 'https://bailian.console.aliyun.com/' },
    { id: 'kimi', name: 'Kimi（月之暗面）', base: 'https://api.moonshot.cn/v1', model: '', key: 'https://platform.moonshot.cn/console/api-keys' },
    { id: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: '', key: 'https://open.bigmodel.cn/usercenter/apikeys' },
    { id: 'openrouter', name: 'OpenRouter（一个 key 用很多家）', base: 'https://openrouter.ai/api/v1', model: '', key: 'https://openrouter.ai/keys' },
    { id: 'local', name: '本机模型（llama.cpp，端口 8080）', base: 'http://127.0.0.1:8080/v1', model: 'local', key: '' },
    { id: 'custom', name: '其他（自己填地址）', base: '', model: '', key: '' },
  ];
  const css = `
  #eciSet { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; z-index: 9999; align-items: center; justify-content: center; }
  #eciSet.on { display: flex; }
  #eciSet .box { background: var(--card, #fffaf4); color: var(--ink, #3b2a20); width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; border-radius: 16px; padding: 18px 20px; font-size: 15px; }
  #eciSet h3 { margin: 16px 0 6px; font-size: 16px; } #eciSet h3:first-child { margin-top: 0; }
  #eciSet label { display: block; margin: 6px 0; }
  #eciSet input[type=text], #eciSet input[type=password], #eciSet select { width: 100%; padding: 7px 9px; border: 1px solid var(--line, #e2d3c2); border-radius: 8px; font: inherit; background: transparent; color: inherit; }
  #eciSet .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  #eciSet button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line, #e2d3c2); background: transparent; color: inherit; cursor: pointer; }
  #eciSet button.p { background: var(--me, #8a5a3c); border-color: var(--me, #8a5a3c); color: #fff; }
  #eciSet .msg { font-size: 14px; color: var(--soft, #8a6f5c); }
  #eciSet .qr { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
  #eciSet .qr div { text-align: center; font-size: 12px; word-break: break-all; max-width: 200px; }
  #eciSet .qr img { width: 180px; height: 180px; background: #fff; padding: 6px; border-radius: 8px; }
  #eciSetBtn { display: none !important; }   /* 设置都在安装器里，游戏里只玩 */
  #eciSetBtn { position: fixed; right: 14px; top: 10px; display: grid; place-items: center; padding: 0; line-height: 1; z-index: 9998; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line, #e2d3c2); background: var(--card, #fffaf4); font-size: 20px; cursor: pointer; }`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  document.body.insertAdjacentHTML('beforeend', `
  <button id="eciSetBtn" title="设置">⚙️</button>
  <div id="eciSet"><div class="box">
    <h3>游戏的大脑</h3>
    <label><input type="radio" name="brain" value="claude"> Claude Code（电脑上装了 Claude Code 并登录了）</label>
    <label><input type="radio" name="brain" value="api"> API 接口（GPT、DeepSeek、通义、本机模型……）</label>
    <div id="apiBox">
      <label>服务商 <select id="sPreset">${PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <label>接口地址 <input type="text" id="sBase"></label>
      <label>模型名 <input type="text" id="sModel" placeholder="照服务商官网上的模型名填"></label>
      <label>API key <input type="password" id="sKey" placeholder="sk-…"></label>
      <div class="row"><button id="sTest">测试一下</button><a id="sKeyLink" target="_blank">去申请 key →</a><span class="msg" id="sTestMsg"></span></div>
    </div>
    <h3>亲密段落交给谁写</h3>
    <div class="msg">大脑写不了的那一截，交给这个模型。默认是本机模型（安装器里装的）。</div>
    <label>接口地址 <input type="text" id="hBase"></label>
    <label>模型名（本机模型可以留空） <input type="text" id="hModel"></label>
    <label>API key（本机模型留空） <input type="password" id="hKey"></label>
    <h3>天气</h3>
    <label>城市（留空 = 按网络位置自动定位） <input type="text" id="sCity" placeholder="例如：上海、Tokyo"></label>
    <div class="msg" id="sWeather"></div>
    <h3>手机连接</h3>
    <label><input type="checkbox" id="sLan"> 允许同一个 Wi-Fi 下的手机连进来（要扫码，带连接码）</label>
    <div class="qr" id="sQr"></div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button id="sClose">取消</button><button class="p" id="sSave">保存</button></div>
  </div></div>`);
  const $ = id => document.getElementById(id);
  const fillPreset = id => {
    const p = PRESETS.find(x => x.id === id) || PRESETS[0];
    if (id !== 'custom') { $('sBase').value = p.base; if (p.model || !$('sModel').value) $('sModel').value = p.model; }
    $('sKeyLink').style.display = p.key ? '' : 'none';
    $('sKeyLink').href = p.key || '#';
  };
  $('sPreset').onchange = e => fillPreset(e.target.value);
  const showApi = () => { $('apiBox').style.display = document.querySelector('[name=brain]:checked')?.value === 'api' ? '' : 'none'; };
  document.querySelectorAll('[name=brain]').forEach(r => r.onchange = showApi);

  async function drawQr() {
    const r = await fetch('/api/pair').then(r => r.json()).catch(() => ({}));
    if (!r.enabled || !r.urls?.length) { $('sQr').innerHTML = r.enabled ? '<div>没找到局域网地址，确认电脑连着 Wi-Fi 或网线</div>' : ''; return; }
    $('sQr').innerHTML = r.urls.map(u => {
      const q = qrcode(0, 'M'); q.addData(u); q.make();
      return `<div><img src="${q.createDataURL(6, 0)}" alt="">${u.replace(/\?t=.*/, '')}</div>`;
    }).join('') + '<div class="msg" style="max-width:none">用手机相机扫码（安卓、iPhone 都行），打开后点「添加到主屏幕」；手机和电脑要连同一个 Wi-Fi。</div>';
  }
  async function open() {
    const c = await fetch('/api/config').then(r => r.json());
    document.querySelector(`[name=brain][value=${c.brain}]`).checked = true;
    const p = PRESETS.find(x => x.base && x.base === c.api.base);
    $('sPreset').value = p ? p.id : (c.api.base ? 'custom' : 'deepseek');
    fillPreset($('sPreset').value);
    if (c.api.base) $('sBase').value = c.api.base;
    $('sModel').value = c.api.model || $('sModel').value;
    $('sKey').value = c.api.key || '';
    $('hBase').value = c.handoff.base; $('hModel').value = c.handoff.model; $('hKey').value = c.handoff.key || '';
    $('sCity').value = c.city || '';
    $('sWeather').textContent = c.weather ? '现在：' + c.weather : '';
    $('sLan').checked = !!c.lan.enabled;
    $('sTestMsg').textContent = '';
    showApi(); drawQr();
    $('eciSet').classList.add('on');
  }
  const body = () => ({
    brain: document.querySelector('[name=brain]:checked').value,
    api: { base: $('sBase').value.trim(), model: $('sModel').value.trim(), key: $('sKey').value.trim() },
    handoff: { base: $('hBase').value.trim(), model: $('hModel').value.trim(), key: $('hKey').value.trim() },
    city: $('sCity').value.trim(),
    lan: { enabled: $('sLan').checked },
  });
  $('sTest').onclick = async () => {
    $('sTestMsg').textContent = '正在连……';
    const r = await fetch('/api/brain/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api: body().api }) }).then(r => r.json()).catch(e => ({ error: e.message }));
    $('sTestMsg').textContent = r.ok ? '✅ 通了，模型回复：' + r.reply : '❌ ' + r.error;
  };
  $('sSave').onclick = async () => {
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) }).then(r => r.json()).catch(e => ({ error: e.message }));
    if (!r.ok) return alert(r.error || '保存失败');
    $('eciSet').classList.remove('on');
    if ($('sLan').checked) setTimeout(open, 800);   // 刚打开手机连接：重新打开看二维码
  };
  $('sClose').onclick = () => $('eciSet').classList.remove('on');
  $('eciSetBtn').onclick = open;
  // 有新版本：右下角冒一条小提示
  setTimeout(async () => {
    const u = await fetch('/api/update').then(r => r.json()).catch(() => ({}));
    if (!u.remote || !u.local || u.remote.version === u.local) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="eciUpd" style="position:fixed;right:60px;bottom:14px;z-index:9998;background:var(--card,#fffaf4);border:1px solid var(--line,#e2d3c2);border-radius:10px;padding:6px 12px;font-size:14px">🔔 有新版本 ' + u.remote.version + '：打开桌面上的「恶雌模拟器安装器」→ 游戏本体 → 更新</div>');
    document.getElementById('eciUpd').onclick = e => e.currentTarget.remove();   // 点一下收起
  }, 3000);
  // 手机上（不是电脑本机）不显示设置按钮
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) $('eciSetBtn').style.display = 'none';
})();
