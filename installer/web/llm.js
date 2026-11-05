/* 恶雌模拟器安装器 · 「语言模型」页：自动找电脑上已有的大脑、一键用；每一家的步骤、推荐模型、自动拿模型列表；做完变绿。
   在 index.html 的主脚本后面加载，用主脚本里的 $ / esc / api / toast / busyBtn / S / brainLabel / refresh。 */

// lg：图标底色和字；steps：手把手教程；rec：推荐的模型（点一下就填上）；pick：拿到模型列表后按顺序挑第一个对得上的
const P = [
  { id: 'local', g: 'Local', name: '本地模型（推荐）', sub: '装在你电脑上', lg: ['#5b4636', '本'], kind: 'local' },
  { id: 'ollama', g: 'Local', name: 'Ollama', sub: '已经装了 Ollama 的人', lg: ['#222', 'O'], base: 'http://127.0.0.1:11434/v1', model: '', auto: true,
    steps: ['装好 <a href="#" data-open="https://ollama.com/download">Ollama</a>，打开它。', '拉一个模型：下面按你的显卡推荐了大小，点一下就复制命令，到 cmd 里粘贴回车。', '回到这里点「🔍 自动识别并填写」，再点「保存」。'] },
  { id: 'lmstudio', g: 'Local', name: 'LM Studio', sub: '图形界面跑本地模型', lg: ['#4a3aff', 'LM'], base: 'http://127.0.0.1:1234/v1', model: '', auto: true,
    steps: ['装好 <a href="#" data-open="https://lmstudio.ai/">LM Studio</a>，在里面搜一个模型下载（推荐 Qwen3，选能塞进你显存的大小）。', '左边点「Developer」→ 打开「Start server」，把模型加载进去。', '回到这里点「🔍 自动识别并填写」，再点「保存」。'] },
  { id: 'claudecode', g: 'Claude', name: 'Claude Code', sub: '有 Claude 订阅的人', lg: ['#d97757', 'C'], kind: 'claude' },
  { id: 'anthropic', g: 'Claude', name: 'Claude API', sub: 'Anthropic 控制台的 key', lg: ['#c96442', 'A'], base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5',
    rec: [['claude-sonnet-5-5', '推荐，又快又好'], ['claude-opus-5-5', '最强，贵一些']], pick: [/claude-sonnet/, /claude-opus/],
    steps: ['打开 <a href="#" data-open="https://console.anthropic.com/">console.anthropic.com</a> 注册登录。', '「Plans & Billing」里充值。', '「API Keys」→「Create Key」，名字随便填，复制 <b>sk-ant-</b> 开头的 key（只显示一次）。', '粘贴 key，模型用推荐的就行，点「测试一下」。'] },
  { id: 'deepseek', g: 'Api', name: 'DeepSeek', sub: '便宜，中文好', lg: ['#4d6bfe', 'DS'], base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', shot: 'deepseek',
    rec: [['deepseek-chat', '推荐，写得快'], ['deepseek-reasoner', '先想后写，慢一些']], pick: [/^deepseek-chat$/],
    steps: ['打开 <a href="#" data-open="https://platform.deepseek.com/">platform.deepseek.com</a>，用手机号注册登录。', '左边点「充值」，充 10 元就能玩很久（按字数扣钱）。', '左边点「API keys」→「创建 API key」，名字随便填（比如 恶雌）。', '弹出来的 <b>sk-</b> 开头的一串就是 key，<b>只显示这一次</b>，点「复制」。', '回到这里粘贴到「API key」，模型用推荐的，点「测试一下」。'] },
  { id: 'openai', g: 'Api', name: 'OpenAI', sub: 'GPT 系列', lg: ['#10a37f', 'AI'], base: 'https://api.openai.com/v1', model: '',
    pick: [/^gpt-5(\.\d+)?$/, /^gpt-5/, /^gpt-4\.1$/, /^gpt-4o$/],
    steps: ['打开 <a href="#" data-open="https://platform.openai.com/">platform.openai.com</a> 注册登录（要能访问 OpenAI 的网络）。', '右上角 Settings →「Billing」，绑卡充值（最少 5 美元）。', '左边「API keys」→「Create new secret key」→ 复制 <b>sk-</b> 开头的 key。', '粘贴 key，会自动拿到能用的模型、挑一个推荐的填上，点「测试一下」。'] },
  { id: 'gemini', g: 'Api', name: 'Google Gemini', sub: '有免费额度', lg: ['#1a73e8', 'G'], base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '',
    pick: [/^gemini-[\d.]+-pro$/, /^gemini-[\d.]+-pro/, /^gemini-[\d.]+-flash$/, /gemini.*flash/],
    steps: ['打开 <a href="#" data-open="https://aistudio.google.com/apikey">Google AI Studio</a>，用 Google 账号登录（要能访问 Google 的网络）。', '点「Create API key」，复制。', '粘贴 key，会自动挑一个推荐的模型，点「测试一下」。'] },
  { id: 'qwen', g: 'Api', name: '通义千问', sub: '阿里云百炼', lg: ['#615ced', '通'], base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',
    rec: [['qwen-plus', '推荐，便宜够用'], ['qwen-max', '最强']], pick: [/^qwen-plus$/, /^qwen-max$/],
    steps: ['打开 <a href="#" data-open="https://bailian.console.aliyun.com/">阿里云百炼</a>，用阿里云账号登录（要实名）。', '开通「模型服务」，新用户有免费额度。', '右上角头像 →「API-KEY」→ 创建 → 复制。', '粘贴 key，模型用推荐的，点「测试一下」。'] },
  { id: 'kimi', g: 'Api', name: 'Kimi', sub: '月之暗面', lg: ['#111', 'K'], base: 'https://api.moonshot.cn/v1', model: '',
    pick: [/^kimi-k2/, /^kimi-latest$/, /^moonshot-v1-128k$/, /^moonshot-v1-32k$/],
    steps: ['打开 <a href="#" data-open="https://platform.moonshot.cn/">platform.moonshot.cn</a> 注册登录。', '账户里充值。', '「API Key 管理」→ 新建 → 复制。', '粘贴 key，会自动挑一个推荐的模型，点「测试一下」。'] },
  { id: 'zhipu', g: 'Api', name: '智谱 GLM', sub: '清华系', lg: ['#3859ff', '智'], base: 'https://open.bigmodel.cn/api/paas/v4', model: '',
    pick: [/^glm-[\d.]+$/, /^glm-4-plus$/, /^glm-4/],
    steps: ['打开 <a href="#" data-open="https://open.bigmodel.cn/">open.bigmodel.cn</a> 注册登录。', '新用户有免费额度，不够再充值。', '右上角「API Keys」→ 添加新的 API Key → 复制。', '粘贴 key，会自动挑一个推荐的模型，点「测试一下」。'] },
  { id: 'silicon', g: 'Api', name: '硅基流动', sub: '国内一个 key 用很多家', lg: ['#7c3aed', '硅'], base: 'https://api.siliconflow.cn/v1', model: '',
    rec: [['deepseek-ai/DeepSeek-V3', '推荐']], pick: [/^deepseek-ai\/DeepSeek-V3/i, /^Qwen\/Qwen3-235B/i, /^Qwen\/Qwen3/i],
    steps: ['打开 <a href="#" data-open="https://cloud.siliconflow.cn/">cloud.siliconflow.cn</a>，手机号注册登录。', '新用户送额度；左边「API 密钥」→ 新建 → 复制。', '粘贴 key，模型用推荐的，点「测试一下」。'] },
  { id: 'openrouter', g: 'Api', name: 'OpenRouter', sub: '海外一个 key 用很多家', lg: ['#6467f2', 'OR'], base: 'https://openrouter.ai/api/v1', model: '',
    rec: [['deepseek/deepseek-chat', '推荐，便宜']], pick: [/^deepseek\/deepseek-chat/, /^anthropic\/claude-sonnet/],
    steps: ['打开 <a href="#" data-open="https://openrouter.ai/">openrouter.ai</a> 注册登录。', '「Credits」里充值。', '「Keys」→「Create Key」→ 复制。', '粘贴 key，模型用推荐的，点「测试一下」。'] },
  { id: 'xai', g: 'Api', name: 'xAI Grok', sub: '尺度较宽', lg: ['#000', 'X'], base: 'https://api.x.ai/v1', model: '',
    pick: [/^grok-\d+$/, /^grok-\d/, /^grok/],
    steps: ['打开 <a href="#" data-open="https://console.x.ai/">console.x.ai</a> 注册登录。', '充值后「API Keys」→ 创建 → 复制。', '粘贴 key，会自动挑一个推荐的模型，点「测试一下」。'] },
  { id: 'custom', g: 'Api', name: '其他', sub: '任何 OpenAI 兼容接口', lg: ['#8b7262', '+'], base: '', model: '',
    steps: ['填服务商给的「OpenAI 兼容」接口地址（一般以 /v1 结尾）和 key。', '点「📋 拿模型列表」选一个，再点「测试一下」。'] },
];
const T = x => (S.platform === 'darwin' ? x.replace(/cmd/g, '终端') : x);
const LG = { local: ['#5b4636', '本'], ollama: ['#222', 'O'], lmstudio: ['#4a3aff', 'LM'], claudecode: ['#d97757', 'C'] };
const pvHtml = p => `<div class="pv" data-pv="${p.id}"><span class="lg" style="background:${p.lg[0]}">${p.lg[1]}</span><div><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></div></div>`;
$('provLocal').innerHTML = P.filter(p => p.g === 'Local').map(pvHtml).join('');
$('provClaude').innerHTML = P.filter(p => p.g === 'Claude').map(pvHtml).join('');
$('provApi').innerHTML = P.filter(p => p.g === 'Api').map(pvHtml).join('');
let curPv = null, DET = null, plan = null;

function currentPv() {
  if (S.brain === 'claude') return 'claudecode';
  const b = S.api?.base || '';
  if (/127\.0\.0\.1:8080/.test(b)) return 'local';
  const hit = P.find(p => p.base && b && b.replace(/\/+$/, '') === p.base.replace(/\/+$/, ''));
  return hit ? hit.id : b ? 'custom' : null;
}
// 游戏装好了才叫「正在用」；还没装时选好的叫「已选好」，装好游戏就用它
const NOW = () => (S.game ? '✓ 正在用' : '✓ 已选好');
const usingNow = id => !!brainLabel() && currentPv() === id;
function markProviders() { const c = brainLabel() ? currentPv() : null; document.querySelectorAll('.pv').forEach(x => x.classList.toggle('cur', x.dataset.pv === c)); }
document.querySelectorAll('.prov').forEach(el => el.onclick = e => { const x = e.target.closest('.pv'); if (x) showPv(x.dataset.pv); });
document.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast('复制好了：' + c.dataset.copy, 'ok')).catch(() => {}); });

/* ---------- 自动找：电脑上已经有的，点一下就用 ---------- */
async function detect() {
  $('detList').innerHTML = '<p class="soft">正在找你电脑上的 Claude Code、本地模型、Ollama、LM Studio…</p>';
  DET = await api('/api/llm/detect').catch(() => ({ found: [] }));
  const rows = DET.found.map(d => {
    const on = d.id === 'claudecode' ? S.brain === 'claude'
      : S.brain === 'api' && (S.api?.base || '').replace(/\/+$/, '') === d.base && (d.id === 'local' || S.api?.model === d.model);
    const sel = d.models && d.models.length > 1 ? `<select data-dsel="${d.id}">${d.models.map(m => `<option ${m === d.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '';
    const info = d.id === 'claudecode' ? '找到了，可以直接用'
      : !d.running ? '装了，但现在没开：先把它打开，再点「重新找」'
      : d.models && d.models.length ? (d.models.length > 1 ? `有 ${d.models.length} 个模型，帮你挑了 ${d.model}` : '模型：' + d.model)
      : '开着，但还没有模型：先下载一个（点「看步骤」）';
    const can = d.id === 'claudecode' || (d.running && d.model);
    const btn = on ? `<button class="okbtn" disabled>${NOW()}</button>` : can ? (brainLabel() ? `<button data-duse="${d.id}">改用它</button>` : `<button class="p" data-duse="${d.id}">一键用它</button>`) : `<button class="ghost" data-dshow="${d.id}">看步骤</button>`;
    return `<div class="det ${on ? 'on' : ''}"><span class="lg" style="background:${LG[d.id][0]}">${LG[d.id][1]}</span><div class="tx"><b>${esc(d.name)}</b><small>${esc(info)}</small></div>${sel}${btn}</div>`;
  }).join('');
  $('detList').innerHTML = rows || '<p class="soft">没找到已经装好的。下面任选一家，照步骤做：有好显卡推荐「本地模型」，没有就选 DeepSeek（便宜）。</p>';
  $('detCard').classList.toggle('doneCard', !!brainLabel());
}
// 玩家点了才检查，不自动去找
$('detGo').onclick = e => busyBtn(e.target, async () => { await detect(); e.target.textContent = '🔍 重新检查'; });
$('detList').onclick = async e => {
  const show = e.target.closest('[data-dshow]'); if (show) return showPv(show.dataset.dshow);
  const b = e.target.closest('[data-duse]'); if (!b) return;
  const d = DET.found.find(x => x.id === b.dataset.duse), sel = $('detList').querySelector(`[data-dsel="${d.id}"]`);
  await busyBtn(b, async () => {
    let saved;
    if (d.id === 'claudecode') saved = await api('/api/brain', { brain: 'claude' }).catch(err => ({ error: err.message }));
    else {
      const a = { base: d.base, model: sel ? sel.value : d.model, key: '' };
      const t = await api('/api/brain/test', { api: a }).catch(err => ({ error: err.message }));
      if (!t.ok) return toast('试了一下没通：' + (t.error || ''), 'bad');
      saved = await api('/api/brain', { brain: 'api', api: a }).catch(err => ({ error: err.message }));
    }
    if (!saved || !saved.ok) return toast('没换成：' + ((saved && saved.error) || '保存失败'), 'bad');
    toast('好了！大脑换成 ' + d.name + (S.game ? '，重新打开游戏生效' : '，装好游戏就用它'), 'ok');
    await refresh(); await detect(); if (curPv) showPv(curPv, false);
  });
};

/* ---------- 每一家的面板 ---------- */
function showPv(id, scroll = true) {
  curPv = id;
  document.querySelectorAll('.pv').forEach(x => x.classList.toggle('on', x.dataset.pv === id));
  const p = P.find(x => x.id === id), box = $('provPanel'), using = usingNow(id);
  if (p.kind === 'local') box.innerHTML = `<div class="card pop ${using ? 'doneCard' : ''}"><h2>🖥️ 本地模型</h2>
    ${using ? `<div class="note ok">${NOW()}它当大脑</div>` : S.llm ? '<div class="note ok">✓ 已经装好了</div>' : ''}
    <p>在你电脑上跑一个不限尺度的开源大模型（Qwen 35B）。要好显卡、大内存；比线上慢，一轮 1～3 分钟。</p>
    <div class="row">
      <button id="lCheck" class="${S.llm ? 'okbtn' : brainLabel() ? '' : 'p'}" ${S.llm ? 'disabled' : ''}>${S.llm ? '✓ 已检查' : '① 检查我的电脑'}</button>
      <button id="lInstall" class="${S.llm ? 'okbtn' : ''}" disabled>${S.llm ? '✓ 已安装' : '② 安装'}</button>
      <button id="lTest" ${S.llm ? '' : 'disabled'}>③ 试一下</button>
      <button id="lUse" class="${using ? 'okbtn' : S.llm && !brainLabel() ? 'p' : ''}" ${S.llm && !using ? '' : 'disabled'}>${using ? NOW() : '④ 用它当大脑'}</button></div>
    <div id="lReport"></div><div class="job" id="job-llm"></div><div class="job" id="job-llmtest"></div>
    <p class="soft">想快一点：大脑用 Claude 或线上 API，本地模型只写亲密段落（装好就自动会用，不用点 ④）。</p></div>`;
  else if (p.kind === 'claude') box.innerHTML = `<div class="card pop ${using ? 'doneCard' : ''}"><h2>✳️ Claude Code</h2>
    <div class="note ${S.claude ? 'ok' : 'bad'}">${using ? NOW() + ' Claude Code 当大脑' : S.claude ? `✓ 找到了 Claude Code（${esc(S.claude)}）` : '还没找到 Claude Code，照下面做：'}</div>
    <ol class="steps ${using ? 'done' : brainLabel() ? 'idle' : ''}">
      <li class="${S.claude ? 'done' : ''}">要有 Claude 的付费订阅（Pro 或 Max），或者 Anthropic 的 API 额度。<a href="#" data-open="https://claude.ai/upgrade">看订阅</a></li>
      <li class="${S.claude ? 'done' : ''}">装 Claude Code：装好 <a href="#" data-open="https://code.visualstudio.com/">VS Code</a>，左边「扩展」里搜 <b>Claude Code</b> 点安装；或者照 <a href="#" data-open="https://docs.claude.com/en/docs/claude-code/setup">官方教程</a> 装命令行版。</li>
      <li class="${S.claude ? 'done' : ''}">打开一次 Claude Code，照提示用你的 Claude 账号登录。</li>
      <li>回到这里点「重新检查」，找到了就点「用 Claude Code 当大脑」。</li>
    </ol>
    <div class="row"><button id="cRecheck">重新检查</button>${using ? `<button class="okbtn" disabled>${NOW()} Claude Code</button>` : `<button class="${brainLabel() ? '' : 'p'}" id="cUse" ${S.claude ? '' : 'disabled'}>${brainLabel() ? '改用 Claude Code' : '用 Claude Code 当大脑'}</button>`}</div></div>`;
  else box.innerHTML = `<div class="card pop ${using ? 'doneCard' : ''}"><h2><span class="lg" style="background:${p.lg[0]};width:30px;height:30px;border-radius:9px;display:inline-grid;place-items:center;color:#fff;font-size:13px">${p.lg[1]}</span> ${esc(p.name)}</h2>
    ${using ? `<div class="note ok">${NOW()}它当大脑（模型 ${esc(S.api.model)}）</div>` : ''}
    <h3>${p.auto ? '怎么用' : '怎么拿到 key'}</h3><ol class="steps ${using ? 'done' : brainLabel() ? 'idle' : ''}">${p.steps.map(x => `<li>${T(x)}</li>`).join('')}</ol>
    ${p.shot ? `<img class="shot" src="guide/${p.shot}.svg" alt="示意图">` : ''}
    ${p.id === 'ollama' ? '<div id="olRec"></div>' : ''}
    ${p.auto ? '<div class="row"><button class="p" id="aAuto">🔍 自动识别并填写</button><span class="soft" id="aAutoMsg"></span></div>' : ''}
    <label class="f">接口地址 <input type="text" id="aBase" value="${esc(p.base)}"></label>
    ${p.auto ? '' : '<label class="f">API key <input type="password" id="aKey" placeholder="把复制的 key 粘贴到这里"></label>'}
    <label class="f">模型名 <input type="text" id="aModel" list="mlist" value="${esc(p.model)}" placeholder="${p.auto ? '点上面「自动识别并填写」' : '粘贴 key 以后会自动挑一个推荐的'}"><datalist id="mlist"></datalist></label>
    <div id="aRec">${(p.rec || []).map(([m, why]) => `<span class="rec" data-rec="${esc(m)}">⭐ ${esc(m)}<small>（${esc(why)}）</small></span>`).join('')}</div>
    <div class="row"><button class="ghost" id="aList">📋 拿模型列表</button><button id="aTest">🔌 测试一下</button><button class="${using || !brainLabel() ? 'p' : ''}" id="aSave">${using ? '保存修改' : brainLabel() ? '保存，改用它' : '保存，用它当大脑'}</button></div>
    <div class="result" id="aMsg"></div></div>`;
  if (!p.kind && currentPv() === id && S.api) { $('aBase').value = S.api.base || p.base; $('aModel').value = S.api.model || p.model; if (S.api.key && $('aKey')) $('aKey').value = S.api.key; }
  wirePanel(p);
  if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// 拿到模型列表：填进下拉；模型名还空着（或者不在列表里）就按推荐顺序挑一个
function applyModels(p, models, force) {
  $('mlist').innerHTML = models.map(m => `<option value="${esc(m)}">`).join('');
  const picks = [];
  for (const re of p.pick || []) { const hit = models.find(m => re.test(m)); if (hit && !picks.includes(hit)) picks.push(hit); }
  const best = picks[0] || models[0];
  const cur = $('aModel').value.trim();
  if (best && (force || !cur || !models.includes(cur))) $('aModel').value = best;
  if (picks.length) $('aRec').innerHTML = picks.slice(0, 3).map((m, i) => `<span class="rec" data-rec="${esc(m)}">⭐ ${esc(m)}${i === 0 ? '<small>（推荐）</small>' : ''}</span>`).join('');
  return best;
}
function wirePanel(p) {
  if (p.kind === 'local') {
    $('lCheck').onclick = e => busyBtn(e.target, async () => {
      plan = await api('/api/llm/check');
      const h = plan.hw;
      const rows = [['显卡', h.nvidia ? `${h.nvidia.name}，${h.nvidia.vramGB}GB 显存，驱动 ${h.nvidia.driver}` : (h.gpus.join('、') || '没找到')], ['内存', h.ramGB + ' GB'], ['CPU', `${h.cpu}（${h.cores} 线程）`], ['安装盘剩余', plan.free == null ? '—' : plan.free + ' GB']];
      const verdict = plan.tier === 'api' ? '<div class="note bad"><b>这台电脑带不动本地模型。</b>建议选线上 API（DeepSeek 最便宜，几块钱能玩很久）。</div>'
        : `<div class="note ok"><b>✓ 可以装：${esc(plan.model.label)}</b>，用 ${plan.build === 'cuda' ? 'NVIDIA 显卡' : plan.build === 'metal' ? '苹果芯片的 GPU（Metal）' : plan.build === 'vulkan' ? 'Vulkan（AMD / Intel 显卡）' : 'CPU'} 跑，要下载约 ${plan.needGB}GB。</div>`;
      $('lReport').innerHTML = `<table class="kv" style="margin-top:12px">${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>${verdict}${plan.why.map(w => `<p class="soft">· ${esc(w)}</p>`).join('')}${S.game ? '' : '<div class="note bad">先去「游戏本体」装游戏。</div>'}`;
      $('lInstall').disabled = plan.tier === 'api' || !S.game; $('lInstall').classList.toggle('p', !$('lInstall').disabled);
    });
    $('lInstall').onclick = () => { api('/api/llm/install', { tier: plan.tier, build: plan.build }); toast('开始下载，十几 GB，慢慢来…'); };
    $('lTest').onclick = () => api('/api/llm/test', {});
    $('lUse').onclick = async () => { const r = await api('/api/brain', { brain: 'api', api: { base: 'http://127.0.0.1:8080/v1', model: 'local', key: '' } }).catch(err => ({ error: err.message })); if (!r.ok) return toast('没换成：' + (r.error || ''), 'bad'); toast('大脑换成本地模型了', 'ok'); await refresh(); showPv('local', false); if (DET) detect(); };
    return;
  }
  if (p.kind === 'claude') {
    $('cRecheck').onclick = e => busyBtn(e.target, async () => { await refresh(); showPv('claudecode', false); toast(S.claude ? '找到了 Claude Code' : '还是没找到', S.claude ? 'ok' : 'bad'); });
    if ($('cUse')) $('cUse').onclick = async () => { const r = await api('/api/brain', { brain: 'claude' }).catch(e => ({ error: e.message })); r.ok ? toast('大脑换成 Claude Code 了', 'ok') : toast(r.error, 'bad'); await refresh(); showPv('claudecode', false); if (DET) detect(); };
    return;
  }
  const body = () => ({ base: $('aBase').value.trim(), model: $('aModel').value.trim(), key: $('aKey') ? $('aKey').value.trim() : '' });
  $('aRec').onclick = e => { const r = e.target.closest('[data-rec]'); if (r) { $('aModel').value = r.dataset.rec; toast('填上了：' + r.dataset.rec, 'ok'); } };
  const fetchList = async (force, quiet) => {
    const b = body(); if (!b.base) return null;
    const r = await api('/api/brain/models', { api: b }).catch(err => ({ error: err.message }));
    if (!r.ok) { if (!quiet) $('aMsg').innerHTML = `<span class="bad">拿不到模型列表：${esc(r.error || '')}</span>`; return null; }
    const best = applyModels(p, r.models, force);
    if (!quiet) $('aMsg').innerHTML = `<span class="ok">这家有 ${r.models.length} 个模型，帮你挑了 ${esc(best || '')}</span>`;
    return best;
  };
  $('aList').onclick = e => busyBtn(e.target, () => fetchList(false));
  // 粘贴完 key 就自动拿一次列表、挑推荐的
  if ($('aKey')) { let t; $('aKey').addEventListener('input', () => { clearTimeout(t); if ($('aKey').value.trim().length >= 16) t = setTimeout(() => fetchList(false), 600); }); }
  // Ollama / LM Studio：打开面板就自动找、填好
  if ($('aAuto')) {
    const auto = async () => {
      const d = await api('/api/llm/detect').catch(() => ({ found: [] }));
      const x = d.found.find(f => f.id === p.id);
      if (p.id === 'ollama' && $('olRec')) $('olRec').innerHTML = `<div class="note info">${S.platform === 'darwin' ? '按你的内存（' + d.ramGB + 'GB）' : '按你的显卡（' + (d.vram || '?') + 'GB 显存）'}推荐：<span class="cmd" style="cursor:pointer" data-copy="ollama pull ${d.ollamaRec}">ollama pull ${d.ollamaRec}</span> <span class="soft">← 点一下复制，${T('到 cmd 里粘贴回车')}</span></div>`;
      if (!x) return $('aAutoMsg').innerHTML = `<span class="bad">没找到 ${p.name}：先装好、打开它</span>`;
      if (!x.running) return $('aAutoMsg').innerHTML = `<span class="bad">装了但没开：先打开 ${p.name}</span>`;
      if (!x.models.length) return $('aAutoMsg').innerHTML = '<span class="bad">开着，但还没有模型：先下载一个</span>';
      $('aBase').value = x.base; $('mlist').innerHTML = x.models.map(m => `<option value="${esc(m)}">`).join(''); $('aModel').value = x.model;
      $('aAutoMsg').innerHTML = `<span class="ok">✓ 找到了，填好了：${esc(x.model)}（共 ${x.models.length} 个模型）</span>`;
    };
    $('aAuto').onclick = e => busyBtn(e.target, auto);   // 点了才找
  }
  $('aTest').onclick = e => busyBtn(e.target, async () => {
    const b = body(); if (!b.base || !b.model) return $('aMsg').innerHTML = '<span class="bad">接口地址和模型名都要填</span>';
    const r = await api('/api/brain/test', { api: b }).catch(err => ({ error: err.message }));
    $('aMsg').innerHTML = r.ok ? `<span class="ok pop" style="display:inline-block">✓ 通了！它说：「${esc(r.reply)}」</span>` : `<span class="bad">❌ ${esc(r.error)}</span>`;
  });
  $('aSave').onclick = async () => {
    const b = body(); if (!b.base || !b.model) return toast('接口地址和模型名都要填', 'bad');
    const r = await api('/api/brain', { brain: 'api', api: b }).catch(err => ({ error: err.message }));
    r.ok ? toast('保存好了，重新打开游戏生效', 'ok') : toast(r.error, 'bad'); await refresh(); showPv(p.id, false); if (DET) detect();
  };
}
