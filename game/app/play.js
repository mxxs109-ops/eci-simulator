/* 恶雌模拟器 · 小屋（装修）和崽崽（孵蛋、出壳、打野怪）
   在 index.html 主脚本之前加载：先把两个页签和两个页面插进去，主脚本负责切换页签。
   Q 弹效果全靠 CSS 动画 + Web Animations：挤压回弹、闪白、震屏、粒子、伤害数字。 */
(() => {
  // 小人在做什么 → 动作动画 + 头顶小图标 + 该站到哪（院子里的家具旁边）+ 脚下一行小字。index.html 的地图框也用这些
  window.kidAct = function (doing) {
    const d = String(doing || '');
    const ACTS = [
      [/睡|躺|昏迷|打盹|昏睡/, 'a-sleep', '💤', '木床'],
      [/她床边|床边/, 'a-rest', '', '她的床'],
      [/床上|在床/, 'a-rest', '', '木床'],
      [/说话|聊|问|哄|骂|笑|看着|递/, 'a-talk', '💬', null],
      [/守|望|等|巡|结界|火把|院门|盯/, 'a-patrol', '👀', 'gate'],
      [/洗|冲|泡|擦身|石槽|打水/, 'a-wash', '💧', 'water'],
      [/烤|熏|煮|做饭|添柴|拨火|火塘|烧水|烧石/, 'a-cook', '♨️', '火塘'],
      [/劈|砍|削|刮|剥|绑|做床|木头|鞣|缝|编|磨/, 'a-work', '✨', '柴堆'],
      [/吃|喝|嚼|啃/, 'a-eat', '🍖', null],
      [/打|杀|练|修炼|对峙/, 'a-fight', '💢', null],
      [/歇|坐|靠/, 'a-rest', '', null],
    ];
    for (const [re, cls, emo, near] of ACTS) if (re.test(d)) return { cls, emo, near };
    return { cls: '', emo: '', near: null };
  };
  window.kidSpot = function (near, yardItems, fallback, cls) {
    if (near === 'gate') return [50, 82];
    if (near === 'water') return [80, 52];
    const it = near && (yardItems || []).find(x => x.k === near);
    if (it && (near === '木床' || cls === 'a-sleep')) return [it.x + 1, it.y - 1];   // 睡觉就躺到床上（身子中间对着床中间）；她睡自己的床也一样
    return it ? [it.x + 7, it.y + 5] : fallback;
  };
  // 脚下那行字：「此刻在做什么」的第一小句，最多 10 个字
  window.kidSay = function (doing) {
    const t = String(doing || '').replace(/【[^】]*】/g, '').split(/[，；。,;]/)[0].trim();
    return t.length > 10 ? t.slice(0, 10) + '…' : t;
  };
  const G = p => '/game/' + p.split('/').map(encodeURIComponent).join('/');
  const IMG2D = n => G('立绘/2D/' + n);
  const $q = (s, el = document) => el.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- 样式 ---------------- */
  document.head.appendChild(h(`<style>
  .pv { flex: 1; overflow-y: auto; padding: 16px; }
  .pv .wrap2 { max-width: 1100px; margin: 0 auto; }
  .pv h2 { font: 700 20px "STKaiti","KaiTi",serif; margin: 6px 0 10px; letter-spacing: 2px; }
  .pv .hint { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  /* 小人的动作（地图框和小屋页共用） */
  .kid .emo { position: absolute; left: 72%; top: -4%; font-style: normal; font-size: 15px; pointer-events: none; animation: emoUp 2s ease-out infinite; }
  @keyframes emoUp { 0% { transform: translate(0,6px) scale(.6); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(6px,-18px) scale(1.1); opacity: 0; } }
  .kid .say { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 2px; white-space: nowrap; font: 600 11px/1.4 system-ui; color: #3b2f25; background: rgba(255,250,240,.92); border-radius: 8px; padding: 0 6px; box-shadow: 0 1px 3px rgba(0,0,0,.25); pointer-events: none; }
  .kid.a-sleep img { transform: rotate(58deg) scale(.85); transform-origin: 50% 50%; }   /* 头朝枕头（床的右上），顺着床躺 */
  .kid.a-sleep .say { top: 92%; opacity: .85; max-width: 130%; overflow: hidden; text-overflow: ellipsis; }   /* 躺着时字放到床脚下面，不挡脸 */
  .kid.a-sleep, .kid.a-rest { animation: zzz 3s ease-in-out infinite !important; }
  @keyframes zzz { 0%,100% { transform: translate(-50%,-100%) scale(1,1); } 50% { transform: translate(-50%,-100%) scale(1.03,.97); } }
  .kid.a-work { animation: chop 1.1s cubic-bezier(.4,1.6,.5,1) infinite !important; }
  @keyframes chop { 0%,100% { transform: translate(-50%,-100%) scale(1,1) rotate(0); } 40% { transform: translate(-50%,-96%) scale(1.12,.86) rotate(-6deg); } 60% { transform: translate(-50%,-104%) scale(.92,1.08) rotate(4deg); } }
  .kid.a-cook { animation: sway 2.6s ease-in-out infinite !important; }
  @keyframes sway { 0%,100% { transform: translate(-50%,-100%) rotate(-5deg); } 50% { transform: translate(-50%,-100%) rotate(5deg) scale(1.03,.97); } }
  .kid.a-wash { animation: wiggle .9s ease-in-out infinite !important; }
  @keyframes wiggle { 0%,100% { transform: translate(-50%,-100%) rotate(-4deg); } 50% { transform: translate(-50%,-100%) rotate(4deg) scale(1.05,.95); } }
  .kid.a-eat { animation: nibble 1s ease-in-out infinite !important; }
  @keyframes nibble { 0%,100% { transform: translate(-50%,-100%) scale(1,1); } 50% { transform: translate(-50%,-97%) scale(1.06,.94); } }
  .kid.a-patrol { animation: patrol 14s ease-in-out infinite !important; }
  .kid.a-patrol img { animation: faceflip 14s step-end infinite; }
  @keyframes patrol { 0%,100% { transform: translate(-150%,-100%); } 50% { transform: translate(50%,-100%); } }
  @keyframes faceflip { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
  .kid.a-talk { animation: talkA 1.6s ease-in-out infinite !important; }
  @keyframes talkA { 0%,100% { transform: translate(-50%,-100%) rotate(0); } 25% { transform: translate(-50%,-102%) rotate(-3deg); } 50% { transform: translate(-50%,-100%) scale(1.03,.97); } 75% { transform: translate(-50%,-102%) rotate(3deg); } }
  .kid.a-fight { animation: fightA .7s linear infinite !important; }
  @keyframes fightA { 0%,100% { transform: translate(-50%,-100%); } 25% { transform: translate(-56%,-100%) rotate(-4deg); } 75% { transform: translate(-44%,-100%) rotate(4deg); } }
  /* 小屋 */
  .roomwrap { display: flex; gap: 16px; align-items: flex-start; }
  #room { position: relative; width: min(100%, 760px); aspect-ratio: 1/1; flex: none; border-radius: 16px; overflow: hidden;
    background: #3b2f25 url(${IMG2D('山洞屋子.png')}) center/100% 100% no-repeat; touch-action: none; user-select: none; }
  #room.yard { background-image: url(${IMG2D('院子.png')}); }
  #room .kid { position: absolute; transform: translate(-50%, -100%); pointer-events: none; transform-origin: 50% 100%; animation: kidb 2.2s ease-in-out infinite; text-align: center; }
  #room .kid img, #minimap .kid img { display: block; width: 100%; filter: drop-shadow(0 3px 2px rgba(0,0,0,.3)); }
  #room .kid.noimg::before { content: ''; display: block; width: 100%; aspect-ratio: 1/1; border-radius: 50%; background: #8a7d70; }
  @keyframes kidb { 0%,100% { transform: translate(-50%,-100%) scale(1,1); } 50% { transform: translate(-50%,-100%) scale(1.04,.96); } }
  #room .fx { position: absolute; transform: translate(-50%, -100%); cursor: grab; transform-origin: 50% 100%; }
  #room .fx img { display: block; width: 100%; pointer-events: none; filter: drop-shadow(0 4px 3px rgba(0,0,0,.25)); }
  #room .fx.sel img { filter: drop-shadow(0 0 0 #fff) drop-shadow(0 0 4px #fff) drop-shadow(0 4px 3px rgba(0,0,0,.3)); }
  #room .fx.drag { cursor: grabbing; }
  #room .fx.flip img { transform: scaleX(-1); }
  #room .fx[data-k="火塘"] img { animation: flick 1.2s ease-in-out infinite; }
  #room .fx[data-k="传送小箱子"] img { animation: glow 2.4s ease-in-out infinite; }
  @keyframes flick { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.02,.98); } }
  @keyframes glow { 0%,100% { filter: drop-shadow(0 0 2px #ffd36b); } 50% { filter: drop-shadow(0 0 10px #ffd36b); } }
  .squash { animation: squash .42s cubic-bezier(.3,1.6,.5,1); }
  @keyframes squash { 0% { transform: translate(-50%,-100%) scale(1.25,.7); } 45% { transform: translate(-50%,-100%) scale(.88,1.14); } 75% { transform: translate(-50%,-100%) scale(1.05,.96); } 100% { transform: translate(-50%,-100%) scale(1,1); } }
  .popin { animation: popin .5s cubic-bezier(.3,1.7,.5,1); }
  @keyframes popin { 0% { transform: translate(-50%,-100%) scale(0,0); } 70% { transform: translate(-50%,-100%) scale(1.15,.9); } 100% { transform: translate(-50%,-100%) scale(1,1); } }
  .poof { animation: poof .35s ease-in forwards; }
  @keyframes poof { to { transform: translate(-50%,-100%) scale(1.4,0); opacity: 0; } }
  .palette { flex: 1; min-width: 200px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .palette button { border-radius: 12px; padding: 6px; background: var(--paper); display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; transition: transform .15s; }
  .palette button:hover { transform: translateY(-3px) rotate(-2deg); }
  .palette button:active { transform: scale(.9,1.08); }
  .palette img { width: 64px; height: 52px; object-fit: contain; }
  .rtools { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
  .dust { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: rgba(230,210,170,.85); pointer-events: none; }
  @media (max-width: 900px) { .roomwrap { flex-direction: column; } #room { width: 100%; } .palette { grid-template-columns: repeat(4, 1fr); width: 100%; } }
  /* 崽崽 */
  .eggs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .egg { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 8px 6px 6px; text-align: center; cursor: pointer; }
  .egg img { width: 100%; aspect-ratio: 1/1; object-fit: contain; animation: breathe 2.8s ease-in-out infinite; transform-origin: 50% 90%; }
  .egg:nth-child(3n) img { animation-delay: -.9s; } .egg:nth-child(3n+1) img { animation-delay: -1.8s; }
  .egg .nm { font-size: 13px; }
  .egg.wob img { animation: wob .6s ease-in-out; }
  @keyframes breathe { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.03,.97); } }
  @keyframes wob { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-9deg) scale(1.05,.95); } 45% { transform: rotate(7deg) scale(.95,1.05); } 70% { transform: rotate(-4deg); } }
  .babies { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .baby { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: flex; gap: 10px; }
  .baby .pic { width: 90px; height: 90px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 56px; }
  .baby .pic img { width: 100%; height: 100%; object-fit: contain; animation: breathe 2.4s ease-in-out infinite; transform-origin: 50% 90%; }
  .baby b { font-size: 16px; }
  .baby { position: relative; border-width: 2px; }
  .baby.q-R { border-color: #4a8fe0; box-shadow: 0 0 0 1px #4a8fe0 inset; }
  .baby.q-SR { border-color: #a35de0; box-shadow: 0 0 10px rgba(163,93,224,.45); }
  .baby.q-SSR { border-color: #e0a92a; box-shadow: 0 0 14px rgba(240,190,60,.7); background: linear-gradient(135deg, #fffaf0, #fff1c9); }
  .qtag { display: inline-block; font: 900 12px system-ui; padding: 1px 8px; border-radius: 8px; color: #fff; margin-left: 6px; vertical-align: middle; }
  .qtag.R { background: linear-gradient(#5aa0f0, #2f6fc0); }
  .qtag.SR { background: linear-gradient(#b878f0, #7a3dc0); }
  .qtag.SSR { background: linear-gradient(#ffd96a, #d8952a); text-shadow: 0 1px 1px rgba(0,0,0,.3); animation: ssrglow 1.6s ease-in-out infinite; }
  @keyframes ssrglow { 50% { box-shadow: 0 0 10px #ffd96a; } }
  .radar { width: 150px; height: 150px; flex: none; } .baby .meta { font-size: 13px; color: var(--muted); line-height: 1.6; }
  .baby .acts { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
  /* 全屏舞台（出壳、战斗） */
  #stage2 { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(10,8,20,.72); }
  #stage2.on { display: flex; }
  #stage2 .box { position: relative; width: min(860px, 96vw); height: min(560px, 88vh); border-radius: 18px; overflow: hidden;
    background: radial-gradient(ellipse at 50% 78%, #fbf3e3 0%, #ecdcc0 45%, #c9ae86 100%); box-shadow: 0 10px 40px rgba(0,0,0,.5); }
  #stage2 .box.cave { background: linear-gradient(rgba(30,20,12,.35), rgba(30,20,12,.55)), url(${IMG2D('山洞屋子.png')}) center/cover; }
  #stage2 .close { position: absolute; right: 10px; top: 10px; z-index: 5; background: rgba(255,255,255,.85); }
  .shake { animation: shake .35s; }
  @keyframes shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-8px,4px); } 40% { transform: translate(7px,-5px); } 60% { transform: translate(-5px,3px); } 80% { transform: translate(4px,-2px); } }
  .flash { position: absolute; inset: 0; background: #fff; pointer-events: none; animation: flashA .5s ease-out forwards; z-index: 4; }
  @keyframes flashA { from { opacity: .9; } to { opacity: 0; } }
  .ptl { position: absolute; pointer-events: none; z-index: 3; }
  .dmg { position: absolute; font: 900 28px system-ui; color: #fff; -webkit-text-stroke: 1.5px #a11; pointer-events: none; z-index: 4; }
  /* 出壳 */
  .hatch { position: absolute; left: 50%; top: 52%; width: 340px; height: 340px; transform: translate(-50%,-50%); }
  .hatch img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .hatch svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .hatch .crk { fill: none; stroke: #fff3b0; stroke-width: 1.4; stroke-linecap: round; filter: drop-shadow(0 0 6px #ffcf4a); stroke-dasharray: 60; stroke-dashoffset: 60; }
  .hatchtxt { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; color: #fff; font: 700 20px "STKaiti","KaiTi",serif; text-shadow: 0 2px 6px #000; }
  .newborn { position: absolute; left: 50%; top: 46%; width: 200px; height: 200px; transform: translate(-50%,-50%) scale(0); display: flex; align-items: center; justify-content: center; font-size: 130px; }
  .newborn img { width: 100%; height: 100%; object-fit: contain; }
  /* 战斗 */
  .side { position: absolute; width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; font-size: 140px; transform-origin: 50% 90%; }
  .side img { width: 100%; height: 100%; object-fit: contain; }
  .side.mine { left: 10%; bottom: 30%; } .side.foe { right: 10%; top: 12%; }
  .side.tall { width: 230px; height: 330px; left: 6%; bottom: 96px; font-size: 120px; }
  #stage2 .box.hb .side.foe { right: 12%; top: 8%; width: 170px; height: 170px; font-size: 110px; }
  #stage2 .box.hb .hpbox.mine { right: 5%; bottom: 158px; }
  #stage2 .box.hb .hpbox.foe { left: auto; right: calc(12% + 180px); top: 9%; }
  #stage2 .box.hb-院外林子 { background: radial-gradient(ellipse at 50% 85%, #eef3d8 0%, #b9cf94 45%, #6f8f55 100%); }
  #stage2 .box.hb-莽荒森林深处 { background: radial-gradient(ellipse at 50% 85%, #cfdcb4 0%, #6f8a5a 45%, #2f4630 100%); }
  #stage2 .box.hb-十万大山 { background: radial-gradient(ellipse at 50% 85%, #e2dbe8 0%, #9a8fa8 45%, #4a4258 100%); }
  .hpbar.mp i { background: #4f8fe0 !important; }
  .hpbox .mpl { display: block; margin-top: 4px; font-size: 12px; color: #4f6fa0; }
  .blog .moves button:disabled { opacity: .45; cursor: not-allowed; }
  .blog .moves button small b { color: #4f8fe0; font-weight: 700; }
  @media (max-width: 700px) { .side.tall { width: 140px; height: 220px; bottom: 150px; } #stage2 .box.hb .side.foe { width: 110px; height: 110px; font-size: 76px; right: 6%; } #stage2 .box.hb .hpbox.foe { right: calc(6% + 116px); } #stage2 .box.hb .hpbox.mine { bottom: 190px; } }
  .side.idle { animation: breathe 1.8s ease-in-out infinite; }
  .side.hit { animation: hitA .4s; }
  @keyframes hitA { 0%,100% { filter: none; } 15%,45% { filter: brightness(3) saturate(0); } 30% { transform: translateX(-10px) scale(.94,1.06); } 60% { transform: translateX(8px); } }
  .side.faint { animation: faintA .7s ease-in forwards; }
  @keyframes faintA { 30% { transform: scale(1.1,.8); } to { transform: scale(1.4,0) translateY(40px); opacity: 0; } }
  .hpbox { position: absolute; background: rgba(255,250,240,.93); border-radius: 12px; padding: 8px 12px; min-width: 210px; font-size: 14px; box-shadow: 0 3px 10px rgba(0,0,0,.3); color: #3b2f25; }
  .hpbox.mine { right: 6%; bottom: 34%; } .hpbox.foe { left: 6%; top: 10%; }
  .hpbar { height: 10px; background: #ddd; border-radius: 6px; overflow: hidden; margin-top: 4px; }
  .hpbar i { display: block; height: 100%; width: 100%; background: #4caf50; transition: width .6s cubic-bezier(.3,1.2,.5,1), background .3s; }
  .blog { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(255,250,240,.95); padding: 10px 14px; color: #3b2f25; min-height: 96px; }
  .blog .msg2 { font-size: 15px; min-height: 22px; margin-bottom: 8px; }
  .blog .moves { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .blog .moves button { border-radius: 10px; padding: 6px; font-size: 13px; line-height: 1.3; }
  .blog .moves button small { display: block; color: #8a7a6a; font-size: 11px; }
  .blog .row2 { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
  .t-一般 { background: #ece8de; } .t-水 { background: #cfe6ff; } .t-龙 { background: #ddd2ff; } .t-恶 { background: #d8d0c8; } .t-火 { background: #ffd8c2; } .t-飞行 { background: #e2ecff; } .t-毒 { background: #ead2f2; } .t-冰 { background: #d8f4f6; } .t-岩 { background: #d6e8d2; }
  @media (max-width: 700px) { .side { width: 140px; height: 140px; font-size: 90px; } .blog .moves { grid-template-columns: repeat(2, 1fr); } .hpbox { min-width: 150px; font-size: 12px; } }
  </style>`));

  /* ---------------- 页签和页面 ---------------- */
  const tabs = $q('.tabs');
  tabs.appendChild(h('<button class="tab" data-view="room">🏠 小屋</button>'));
  tabs.appendChild(h('<button class="tab" data-view="babies">🥚 幼崽</button>'));
  const lastView = [...document.querySelectorAll('section.view')].pop();
  lastView.after(h(`<section class="view" id="view-babies"><div class="pv"><div class="wrap2">
      <h2>我的幼崽</h2><div id="babyList" class="babies"></div>
      <h2>蛋图鉴</h2>
      <div class="rtools"><button id="demoHatch">🐣 试看出壳（沧龙蛋）</button><button id="demoBattle">⚔️ 试玩打野怪</button></div>
      <div id="eggList" class="eggs"></div></div></div></section>`));
  lastView.after(h(`<section class="view" id="view-room"><div class="pv"><div class="wrap2">
      <h2 id="roomTitle">院子</h2>
      <div class="roomwrap"><div id="room"></div><div>
        <div class="rtools"><button id="backYard" style="display:none">⬅ 回院子</button><button id="rFlip">↔ 翻转</button><button id="rBig">＋ 放大</button><button id="rSmall">－ 缩小</button><button id="rDel">🗑 拿走</button></div>
        <div class="palette" id="palette"></div></div></div></div></div></section>`));
  document.body.appendChild(h('<div id="stage2"><div class="box"><button class="close">✕</button><div class="inner"></div></div></div>'));
  document.addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    if (t.dataset.view === 'room') loadRoom();
    if (t.dataset.view === 'babies') loadBabies();
  });

  /* ---------------- 粒子 ---------------- */
  function burst(parent, x, y, { n = 14, colors = ['#ffe28a', '#fff'], size = [6, 14], dist = [40, 120], dur = 700, shape = '50%', grav = 0, text } = {}) {
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'ptl';
      if (parent === document.body) p.style.position = 'fixed', p.style.zIndex = 70;
      const s = rnd(...size);
      Object.assign(p.style, { left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px', borderRadius: shape,
        background: colors[i % colors.length], fontSize: s + 'px' });
      if (text) { p.textContent = text[i % text.length]; p.style.background = 'none'; }
      parent.appendChild(p);
      const a = rnd(0, Math.PI * 2), d = rnd(...dist);
      p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + grav}px)) scale(.2) rotate(${rnd(-200, 200)}deg)`, opacity: 0 }],
        { duration: dur * rnd(.7, 1.2), easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => p.remove();
    }
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function flash(el, color = '#fff') { const f = document.createElement('div'); f.className = 'flash'; f.style.background = color; el.appendChild(f); setTimeout(() => f.remove(), 550); }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener('animationend', () => el.classList.remove(cls), { once: true }); }

  /* ---------------- 小屋：院子是大场景，她的小屋在院子里，点小屋进屋 ---------------- */
  const FURN = { 她的床: 30, 草垛: 24, 木床: 27, 石桌: 24, 石凳: 18, 火塘: 21, 熏肉架: 23, 石槽: 22, 狼皮地毯: 27, 木箱: 16, 传送小箱子: 12, 陶水罐: 10, 柴堆: 18 };
  const YARD_K = .5;                        // 院子比屋里远，家具画小一半
  const HOUSE = { x1: 36, x2: 62, y1: 6, y2: 30 };   // 院子图上小屋的位置（点这里进屋）
  // 开局的样子：洞里只有她的床和草垛。院子里有石桌、火塘、熏肉架、柴堆
  const DEFAULT_CAVE = [{ k: '她的床', x: 34, y: 50, s: 1 }, { k: '草垛', x: 28, y: 62, s: 1 }];
  const DEFAULT_YARD = [{ k: '石桌', x: 42, y: 62, s: 1 }, { k: '石凳', x: 42, y: 72, s: 1 }, { k: '火塘', x: 62, y: 56, s: 1 }, { k: '柴堆', x: 78, y: 74, s: 1 }];
  let data = { items: [], yard: [] }, scene = (() => { try { return localStorage.getItem('roomScene') || 'yard'; } catch { return 'yard'; } })(), sel = null, saveT = 0, roomLoaded = false;
  const list = () => data[scene === 'yard' ? 'yard' : 'items'];
  const setList = v => { data[scene === 'yard' ? 'yard' : 'items'] = v; };
  const wOf = it => FURN[it.k] * (it.s || 1) * (scene === 'yard' ? YARD_K : 1);
  const roomEl = () => $q('#room');
  const clean = arr => arr.map(({ _el, ...x }) => x);
  function saveRoom() { clearTimeout(saveT); saveT = setTimeout(() => fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: clean(data.items), yard: clean(data.yard) }) }), 400); }
  // 在场的人（兽夫按「在哪」，她按 /api/map 的 me）：院子里站在对应地方，洞里的站在屋里
  let people = [];
  const SPOT = { '院子·她的洞': [49, 34], '院子·石桌火塘': [55, 66] };
  async function loadPeople() {
    const [cast, map] = await Promise.all([fetch('/api/cast').then(r => r.json()).catch(() => []), fetch('/api/map').then(r => r.json()).catch(() => ({}))]);
    people = cast.filter(c => /^院子·/.test(c.where || '')).map(c => ({ n: c.name, w: c.where, doing: c.doing }));
    if (map.me && /^院子·/.test(map.me)) people.unshift({ n: '我', w: map.me, doing: map.meDoing || '' });
  }
  function drawPeople(el) {
    const here = people.filter(p => scene === 'cave' ? p.w === '院子·她的洞' : p.w !== '院子·她的洞' || true);
    const count = {};
    here.forEach(p => {
      const act = window.kidAct(p.doing), say = window.kidSay(p.doing);
      if (p.n === '我' && act.near === '木床') act.near = '她的床';
      let [x, y] = scene === 'cave' ? window.kidSpot(act.near, data.items, [50, 70], act.cls) : (SPOT[p.w] || [50, 76]);
      if (scene === 'yard' && p.w === '院子·她的洞') { [x, y] = SPOT['院子·她的洞']; act.cls = ''; }   // 在屋里的人，院子里显示在小屋门口
      else if (scene === 'yard') [x, y] = window.kidSpot(act.near, data.yard, [x, y]);   // 干什么活就站到哪
      const key = x + ',' + y, k = (count[key] = (count[key] || 0) + 1) - 1; x += (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 9;
      const d = h(`<div class="kid ${act.cls}" title="${p.n}${p.doing ? '：' + p.doing : ''}"><img src="${IMG2D(p.n + '-小人.png')}" onerror="this.parentNode.classList.add('noimg');this.remove()">${act.emo ? `<i class="emo">${act.emo}</i>` : ''}<b class="say">${p.n}${say ? '·' + say : ''}</b></div>`);
      Object.assign(d.style, { left: x + '%', top: y + '%', width: (scene === 'yard' ? 9 : 16) + '%', animationDelay: (-k * .5) + 's' });
      el.appendChild(d);
    });
  }
  function drawRoom() {
    const el = roomEl(); el.innerHTML = '';
    el.classList.toggle('yard', scene === 'yard');
    $q('#roomTitle').textContent = scene === 'yard' ? '院子' : '她的洞';
    $q('#backYard').style.display = scene === 'cave' ? '' : 'none';
    [...list()].sort((a, b) => a.y - b.y).forEach(it => {   // 越靠下越在前面（45° 俯视的遮挡）
      const d = h(`<div class="fx${it.f ? ' flip' : ''}${it === sel ? ' sel' : ''}" data-k="${it.k}"><img src="${IMG2D('家具/' + it.k + '.png')}" onerror="this.onerror=null;this.src='${IMG2D('家具/木床.png')}'" draggable="false"></div>`);
      Object.assign(d.style, { left: it.x + '%', top: it.y + '%', width: wOf(it) + '%' });
      d._it = it; el.appendChild(d); it._el = d;
    });
    drawPeople(el);
  }
  function dust(it) {
    const r = roomEl().getBoundingClientRect(), b = it._el.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div'); p.className = 'dust';
      p.style.left = (b.left - r.left + b.width * rnd(.15, .85)) + 'px'; p.style.top = (b.bottom - r.top - 4) + 'px';
      roomEl().appendChild(p);
      p.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: .9 }, { transform: `translate(calc(-50% + ${rnd(-30, 30)}px), calc(-50% - ${rnd(6, 22)}px)) scale(1.6)`, opacity: 0 }], { duration: 500, easing: 'ease-out' }).onfinish = () => p.remove();
    }
  }
  async function loadRoom() {
    if (!roomLoaded) {
      const saved = await fetch('/api/room').then(r => r.json()).catch(() => null);
      data.items = saved && saved.items ? saved.items : DEFAULT_CAVE.map(x => ({ ...x }));
      data.yard = saved && saved.yard ? saved.yard : DEFAULT_YARD.map(x => ({ ...x }));
      roomLoaded = true;
      $q('#palette').innerHTML = Object.keys(FURN).map(k => `<button data-add="${k}"><img src="${IMG2D('家具/' + k + '.png')}" onerror="this.onerror=null;this.src='${IMG2D('家具/木床.png')}'">${k}</button>`).join('');
    }
    await loadPeople();
    drawRoom();
  }
  // 进屋 / 回院子：缩放过场
  async function goScene(to) {
    const el = roomEl();
    await el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: to === 'cave' ? 'scale(1.6)' : 'scale(.7)', opacity: 0 }], { duration: 260, easing: 'ease-in' }).finished;
    scene = to; sel = null; try { localStorage.setItem('roomScene', to); } catch {} drawRoom();
    el.animate([{ transform: to === 'cave' ? 'scale(.7)' : 'scale(1.3)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#backYard')) return goScene('yard');
    const b = e.target.closest('[data-add]'); if (!b) return;
    const it = { k: b.dataset.add, x: rnd(40, 60), y: rnd(55, 70), s: 1 };
    list().push(it); sel = it; drawRoom(); replay(it._el, 'popin'); setTimeout(() => dust(it), 250); saveRoom();
  });
  // 拖动：按下压扁一下，拖着走，松手 Q 弹落地 + 扬灰；在院子里点小屋 = 进屋
  document.addEventListener('pointerdown', e => {
    const d = e.target.closest('#room .fx');
    if (!d) {
      if (!e.target.closest('#room')) return;
      const r = roomEl().getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 100, py = (e.clientY - r.top) / r.height * 100;
      if (scene === 'yard' && px > HOUSE.x1 && px < HOUSE.x2 && py > HOUSE.y1 && py < HOUSE.y2) return goScene('cave');
      sel = null; drawRoom(); return;
    }
    const it = d._it; sel = it; drawRoom();
    const el = it._el, r = roomEl().getBoundingClientRect();
    const ox = e.clientX - (r.left + it.x / 100 * r.width), oy = e.clientY - (r.top + it.y / 100 * r.height);
    el.classList.add('drag'); el.animate([{ transform: 'translate(-50%,-100%) scale(1,1)' }, { transform: 'translate(-50%,-104%) scale(1.08,.94)' }], { duration: 120, fill: 'forwards' });
    let moved = false;
    const mv = ev => {
      moved = true;
      it.x = Math.max(4, Math.min(96, (ev.clientX - ox - r.left) / r.width * 100));
      it.y = Math.max(12, Math.min(98, (ev.clientY - oy - r.top) / r.height * 100));
      el.style.left = it.x + '%'; el.style.top = it.y + '%';
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      el.getAnimations().forEach(a => a.cancel()); el.classList.remove('drag');
      drawRoom(); replay(it._el, 'squash'); if (moved) { dust(it); saveRoom(); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  const tool = (id, fn) => document.addEventListener('click', e => { if (e.target.closest('#' + id) && sel) { fn(sel); drawRoom(); if (sel && sel._el) replay(sel._el, 'squash'); saveRoom(); } });
  tool('rFlip', it => { it.f = !it.f; });
  tool('rBig', it => { it.s = Math.min(2, (it.s || 1) * 1.12); });
  tool('rSmall', it => { it.s = Math.max(.5, (it.s || 1) / 1.12); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#rDel') || !sel) return;
    const it = sel; sel = null; it._el.classList.add('poof');
    setTimeout(() => { setList(list().filter(x => x !== it)); drawRoom(); saveRoom(); }, 330);
  });

  /* ---------------- 崽崽数据 ---------------- */
  // 兽夫 → 蛋图、族名（三形态图：立绘/2D/族名-幼年体.png 等）
  const EGGS = [['玄烬', '沧龙蛋', '沧龙'], ['夜墨渊', '幽王蛇蛋', '幽王蛇'], ['长珏', '碧玉蝎蛋', '碧玉蝎'], ['无咎', '暗渊蝠蛋', '暗渊蝠'], ['墨清寒', '玄月黑腾蛇蛋', '玄月黑腾蛇'],
    ['明镜', '明镜蛋', '明镜'], ['楚月白', '银狼蛋', '银狼'], ['容听澜', '冰翡蝎蛋', '冰翡蝎'], ['南黎辰', '鲛人蛋', '鲛人'], ['栖朔', '星鹿蛋', '星鹿'], ['君玄', '吟霜狼蛋', '吟霜狼'],
    ['蓝槿初', '蝶雀孔雀蛋', '蝶雀孔雀'], ['鳞峦', '蔚蓝鲛蛋', '蔚蓝鲛'], ['方清然', '水母蛋', '水母'], ['顾宴礼', '紫狮蛋', '紫狮'], ['苍冽', '炽焰狮蛋', '炽焰狮'], ['灿星', '海星蛋', '海星'], ['焚寂', '赤焰狐蛋', '赤焰狐']];
  const eggOf = dad => EGGS.find(e => e[0] === dad) || EGGS[0];
  const FALLBACK = { 沧龙: '🐉', 幽王蛇: '🐍', 玄月黑腾蛇: '🐍', 碧玉蝎: '🦂', 冰翡蝎: '🦂', 暗渊蝠: '🦇', 银狼: '🐺', 吟霜狼: '🐺', 鲛人: '🧜', 蔚蓝鲛: '🧜', 星鹿: '🦌', 蝶雀孔雀: '🦚', 水母: '🪼', 紫狮: '🦁', 炽焰狮: '🦁', 海星: '⭐', 赤焰狐: '🦊', 明镜: '🐙' };
  // 有图就用图，没图先用表情代替（图画好放进去会自动换上）
  function picHtml(src, emoji) { return `<img src="${src}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${emoji}'}))">`; }

  // 招式表（照搬宝可梦，简化）：[属性, 威力, 命中, 效果]
  const MOVES = {
    撞击: ['一般', 40, 100], 叫声: ['一般', 0, 100, { foeAtk: -1 }], 水枪: ['水', 40, 100], 龙息: ['龙', 60, 100, { para: .3 }],
    龙爪: ['龙', 80, 100], 水之波动: ['水', 60, 100, { conf: .2 }], 咬碎: ['恶', 80, 100, { foeDef: -1, p: .2 }], 龙之舞: ['龙', 0, 100, { atk: 1, spd: 1 }],
    逆鳞: ['龙', 120, 100], 冲浪: ['水', 90, 100], 恶之波动: ['恶', 80, 100], 沧溟潮: ['水', 0, 100, { heal: .5 }],
    缠绕: ['一般', 15, 90, { poison: 1 }], 毒针: ['毒', 15, 100, { poison: .3 }], 起风: ['飞行', 40, 100], 瞪眼: ['一般', 0, 100, { foeDef: -1 }],
    毒牙: ['毒', 50, 100, { poison: .5 }], 空气斩: ['飞行', 75, 95], 盘蜷: ['毒', 0, 100, { atk: 1, def: 1 }], 毒击: ['毒', 80, 100, { poison: .3 }], 暴风: ['飞行', 110, 70], 月华流光: ['飞行', 90, 100, { spd: 1 }],
    细雪: ['冰', 40, 100], 孤狼啸: ['冰', 0, 100, { atk: 2 }], 月冥霜狱: ['冰', 110, 85, { para: .2 }],
    泡沫: ['水', 40, 100], 墨汁: ['恶', 0, 100, { foeAtk: -1 }], 自我再生: ['一般', 0, 100, { heal: .5 }], 紧束: ['一般', 70, 95], 深渊之握: ['水', 100, 95, { foeSpd: -1 }],
    冰砾: ['冰', 40, 100], 瞬移: ['龙', 0, 100, { spd: 2 }], 冰冻光束: ['冰', 90, 100, { para: .1 }], 玄月寒蚀: ['冰', 100, 100],
    吸血: ['恶', 20, 100, { drain: .5 }], 超音波: ['一般', 0, 55, { conf: 1 }], 回声: ['飞行', 0, 100, { spd: 1, atk: 1 }], 暗渊猎杀: ['恶', 110, 95, { drain: .3 }],
    夹住: ['一般', 55, 100], 落石: ['岩', 50, 90], 变硬: ['岩', 0, 100, { def: 1 }], 十字毒刃: ['毒', 70, 100, { poison: .2 }], 岩石封锁: ['岩', 60, 95, { foeSpd: -1 }],
    复瞳: ['岩', 0, 100, { atk: 1, spd: 1 }], 尖石攻击: ['岩', 100, 80], 铁壁: ['岩', 0, 100, { def: 2 }], 尾钩寒毒: ['毒', 100, 100, { poison: .5, foeSpd: -1 }],
    咬住: ['恶', 60, 100], 抓: ['一般', 40, 100], 嚎叫: ['一般', 0, 100, { atk: 1 }], 火花: ['火', 40, 100], 啄: ['飞行', 35, 100], 毒雾: ['毒', 40, 90, { poison: .3 }],
    翅膀攻击: ['飞行', 60, 100], 冰牙: ['冰', 65, 95], 劈开: ['一般', 70, 100], 暗袭: ['恶', 70, 100], 地狱突刺: ['恶', 90, 100],
  };
  const LINES = { 沧龙: { types: ['龙', '水'], forms: { 幼年体: ['撞击', '叫声', '水枪', '龙息'], 中间体: ['龙爪', '水之波动', '咬碎', '龙之舞'], 成年体: ['逆鳞', '冲浪', '恶之波动', '沧溟潮'] } },
    银狼: { types: ['冰', '恶'], forms: { 幼年体: ['咬住', '细雪', '嚎叫', '瞪眼'], 中间体: ['冰牙', '暗袭', '嚎叫', '孤狼啸'], 成年体: ['冰冻光束', '地狱突刺', '孤狼啸', '月冥霜狱'] } },
    明镜: { types: ['水', '恶'], forms: { 幼年体: ['泡沫', '缠绕', '墨汁', '自我再生'], 中间体: ['水之波动', '空气斩', '紧束', '自我再生'], 成年体: ['冲浪', '恶之波动', '自我再生', '深渊之握'] } },
    玄月黑腾蛇: { types: ['龙', '冰'], forms: { 幼年体: ['缠绕', '冰砾', '瞪眼', '龙息'], 中间体: ['冰牙', '龙爪', '瞬移', '盘蜷'], 成年体: ['冰冻光束', '逆鳞', '瞬移', '玄月寒蚀'] } },
    暗渊蝠: { types: ['恶', '飞行'], forms: { 幼年体: ['吸血', '超音波', '咬住', '起风'], 中间体: ['暗袭', '空气斩', '回声', '吸血'], 成年体: ['地狱突刺', '暴风', '回声', '暗渊猎杀'] } },
    碧玉蝎: { types: ['毒', '岩'], forms: { 幼年体: ['夹住', '毒针', '落石', '变硬'], 中间体: ['十字毒刃', '岩石封锁', '复瞳', '变硬'], 成年体: ['尖石攻击', '铁壁', '复瞳', '尾钩寒毒'] } },
    幽王蛇: { types: ['毒', '飞行'], forms: { 幼年体: ['缠绕', '毒针', '起风', '瞪眼'], 中间体: ['毒牙', '空气斩', '盘蜷', '暗袭'], 成年体: ['毒击', '暴风', '盘蜷', '月华流光'] } } };
  const TYPE = { 岩: { 火: 2, 冰: 2, 飞行: 2, 岩: .5 }, 水: { 火: 2, 水: .5, 龙: .5, 冰: 1, 岩: 2 }, 火: { 冰: 2, 水: .5, 火: .5, 龙: .5 }, 龙: { 龙: 2 }, 冰: { 龙: 2, 飞行: 2, 水: .5, 冰: .5, 火: .5 }, 飞行: {}, 恶: { 恶: .5 }, 毒: { 毒: .5 }, 一般: {} };
  const eff = (mt, types) => types.reduce((m, t) => m * ((TYPE[mt] || {})[t] ?? 1), 1);
  // 野怪：按地点
  const WILD = {
    院外林子: [['灰狼', '🐺', ['恶'], ['咬住', '抓', '嚎叫'], [2, 6]], ['臭臭兽', '🦨', ['毒'], ['毒雾', '抓'], [2, 5]], ['赤焰雉', '🐓', ['火', '飞行'], ['火花', '啄'], [3, 7]]],
    莽荒森林深处: [['黑鹰', '🦅', ['飞行', '恶'], ['翅膀攻击', '啄', '暗袭'], [9, 18]], ['雪豹', '🐆', ['冰'], ['冰牙', '劈开', '抓'], [10, 20]], ['灰狼王', '🐺', ['恶'], ['咬住', '暗袭', '嚎叫'], [12, 20]]],
    十万大山: [['异兽', '👹', ['恶', '龙'], ['地狱突刺', '劈开', '暗袭'], [28, 45]]],
  };
  const stat = (lv, form) => { const b = { 幼年体: 1, 中间体: 1.25, 成年体: 1.5 }[form] || 1; return { hp: Math.round((24 + lv * 4) * b), atk: Math.round((9 + lv * 2) * b), def: Math.round((8 + lv * 1.6) * b), spd: Math.round((8 + lv * 1.5) * b) }; };
  const expNeed = lv => 10 + lv * 8;

  // 六项个体值的雷达图（0～31）
  const STATS = ['体力', '攻击', '防御', '特攻', '特防', '速度'];
  function radar(vals, q) {
    const col = { R: '#3f86dc', SR: '#9a52dc', SSR: '#e0a020' }[q] || '#8a6a4a';
    const cx = 75, cy = 78, R = 52, pt = (i, r) => [cx + r * Math.sin(i * Math.PI / 3), cy - r * Math.cos(i * Math.PI / 3)];
    const ring = k => STATS.map((_, i) => pt(i, R * k).join(',')).join(' ');
    const shape = vals.map((v, i) => pt(i, R * Math.max(0, Math.min(31, v)) / 31).join(',')).join(' ');
    return `<svg class="radar" viewBox="0 0 150 156">${[1, .66, .33].map(k => `<polygon points="${ring(k)}" fill="none" stroke="#d9c6a3" stroke-width="1"/>`).join('')}
      ${STATS.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="#e5d6b8"/>`).join('')}
      <polygon points="${shape}" fill="${col}" fill-opacity=".35" stroke="${col}" stroke-width="2"/>
      ${STATS.map((n, i) => { const [x, y] = pt(i, R + 14); return `<text x="${x}" y="${y + 4}" font-size="10" text-anchor="middle" fill="#6b5a48">${n} ${vals[i] ?? ''}</text>`; }).join('')}</svg>`;
  }
  /* ---------------- 崽崽页 ---------------- */
  let babies = [];
  async function loadBabies() {
    babies = await fetch('/api/babies').then(r => r.json()).catch(() => []);
    const live = babies.filter(b => b['形态'] !== '已放生');
    $q('#babyList').innerHTML = live.length ? live.map((b, i) => {
      const [, eggImg, line] = eggOf(b['雄父']);
      const form = b['形态'] || '蛋';
      const src = form === '蛋' ? IMG2D(eggImg + '.png') : IMG2D(`${line}-${form}.png`);
      const canFight = form !== '蛋' && LINES[line];
      const q = (b['品质'] || '').toUpperCase().match(/SSR|SR|R/)?.[0] || '';
      const iv = (b['个体值（体/攻/防/特攻/特防/速）'] || '').split(/[\/／,，\s]+/).map(Number).filter(n => !isNaN(n));
      return `<div class="baby ${q ? 'q-' + q : ''}"><div class="pic">${picHtml(src, FALLBACK[line] || '🥚')}</div><div>
        <b>${b['名字']}</b>${q ? `<span class="qtag ${q}">${q}</span>` : ''}<div class="meta">雄父：${b['雄父']}${b['雌雄'] ? '｜' + b['雌雄'] : ''}｜${form}${b['等级'] ? '｜Lv' + b['等级'] : ''}<br>${b['性格'] || ''}${b['长大进度'] ? '<br>' + b['长大进度'] : ''}</div>
        ${iv.length === 6 ? radar(iv, q) : ''}${b['天赋点'] ? `<div class="meta">天赋点：${b['天赋点']}</div>` : ''}
        <div class="acts">${canFight ? `<button data-fight="${i}">⚔️ 出去打野怪</button>` : ''}${form === '蛋' ? `<button data-hatchbaby="${i}">🐣 看看蛋</button>` : ''}</div></div></div>`;
    }).join('') : '<p class="hint" style="grid-column:1/-1">还没有幼崽</p>';
    $q('#eggList').innerHTML = EGGS.map(([dad, egg]) => `<div class="egg" data-dad="${dad}"><img src="${IMG2D(egg + '.png')}"><div class="nm">${dad}</div></div>`).join('');
  }
  document.addEventListener('click', e => {
    const eg = e.target.closest('.egg');
    if (eg) {
      replay(eg, 'wob');
      const r = eg.getBoundingClientRect();
      burst(document.body, r.left + r.width / 2, r.top + r.height * .4, { n: 8, colors: ['#ffe28a', '#fff', '#ffd1f0'], size: [5, 10], dist: [30, 70] });
      return;
    }
    if (e.target.closest('#demoHatch')) return hatch('沧龙蛋', '沧龙', null);
    if (e.target.closest('#demoBattle')) return battle({ name: '小沧龙（试玩）', line: '沧龙', form: '幼年体', level: 5, exp: 0, demo: true });
    const fb = e.target.closest('[data-fight]');
    if (fb) { const b = babies.filter(x => x['形态'] !== '已放生')[fb.dataset.fight]; const line = eggOf(b['雄父'])[2]; return battle({ name: b['名字'], line, form: b['形态'], level: +b['等级'] || 1, exp: +b['经验'] || 0 }); }
    const hb = e.target.closest('[data-hatchbaby]');
    if (hb) { const b = babies.filter(x => x['形态'] !== '已放生')[hb.dataset.hatchbaby]; const [, egg] = eggOf(b['雄父']); return openEgg(egg); }
  });
  const stage = () => $q('#stage2'), inner = () => $q('#stage2 .inner'), box = () => $q('#stage2 .box');
  let stageBusy = false;
  function openStage(html, cls = '') { inner().innerHTML = html; box().className = 'box ' + cls; stage().classList.add('on'); }
  $q('#stage2 .close').onclick = () => { stage().classList.remove('on'); inner().innerHTML = ''; stageBusy = false; };

  function openEgg(egg) {
    openStage(`<div class="hatch"><img src="${IMG2D(egg + '.png')}"></div><div class="hatchtxt"></div>`, 'cave');
    const im = $q('.hatch img'); im.style.animation = 'breathe 2s ease-in-out infinite';
    $q('.hatch').onclick = () => { replay(im, 'wob'); im.style.animation = 'wob .6s'; };
  }

  /* ---------------- 出壳动画 ---------------- */
  async function hatch(egg, line, babyName) {
    if (stageBusy) return; stageBusy = true;
    const src = IMG2D(egg + '.png');
    openStage(`<div class="hatch">
        <img class="bot" src="${src}" style="clip-path:polygon(0 100%,0 39%,32% 37%,35% 39%,39% 40%,44% 35%,50% 37%,54% 40%,59% 35%,64% 36%,68% 39%,100% 39%,100% 100%)">
        <img class="top" src="${src}" style="clip-path:polygon(0 0,100% 0,100% 39%,68% 39%,64% 36%,59% 35%,54% 40%,50% 37%,44% 35%,39% 40%,35% 39%,32% 37%,0 39%)">
        <svg viewBox="0 0 100 100"><path class="crk" d="M50 37 L54 40 L59 35 L64 36"/><path class="crk" d="M50 37 L44 35 L39 40 L35 39"/><path class="crk" d="M64 36 L68 39"/><path class="crk" d="M35 39 L32 37"/><path class="crk" d="M54 40 L52 46 L56 50"/></svg>
      </div><div class="newborn"></div><div class="hatchtxt">……</div>`, 'cave');
    const H = $q('.hatch'), top = $q('.hatch .top'), txt = $q('.hatchtxt'), bx = box();
    const wobble = (deg, t) => H.animate([{ transform: 'translate(-50%,-50%) rotate(0)' }, { transform: `translate(-50%,-50%) rotate(${-deg}deg) scale(1.03,.97)` }, { transform: `translate(-50%,-50%) rotate(${deg}deg) scale(.97,1.03)` }, { transform: 'translate(-50%,-50%) rotate(0)' }], { duration: t, easing: 'ease-in-out' }).finished;
    const cx = () => { const r = H.getBoundingClientRect(), b = bx.getBoundingClientRect(); return [r.left - b.left + r.width / 2, r.top - b.top + r.height * .36]; };
    txt.textContent = ''; await wobble(4, 600); await sleep(300);
     await wobble(8, 500);
    const cracks = [...H.querySelectorAll('.crk')];
    for (const c of cracks) { c.animate([{ strokeDashoffset: 60 }, { strokeDashoffset: 0 }], { duration: 380, fill: 'forwards' }); burst(bx, ...cx(), { n: 6, size: [4, 8], dist: [20, 50] }); await wobble(6, 260); }
    
    for (let i = 0; i < 3; i++) { shake(bx); await wobble(10, 220); }
    // 炸开：上半截蛋壳飞走、碎片四散、闪白
    flash(bx); shake(bx);
    const [x, y] = cx();
    burst(bx, x, y, { n: 26, colors: ['#1b1b1b', '#c9a24a', '#ffe28a'], size: [8, 18], dist: [80, 220], shape: '2px', grav: 60, dur: 900 });
    burst(bx, x, y, { n: 18, colors: ['#fff6c8', '#ffe28a'], size: [6, 12], dist: [60, 180] });
    top.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(90px,-260px) rotate(70deg)', opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
    cracks.forEach(c => c.style.display = 'none');
    // 崽崽蹦出来
    const nb = $q('.newborn');
    nb.innerHTML = picHtml(IMG2D(`${line}-幼年体.png`), FALLBACK[line] || '🐣');
    await sleep(150);
    await nb.animate([{ transform: 'translate(-50%,-10%) scale(0,0)' }, { transform: 'translate(-50%,-75%) scale(1.25,.8)', offset: .5 }, { transform: 'translate(-50%,-50%) scale(.85,1.15)', offset: .75 }, { transform: 'translate(-50%,-50%) scale(1,1)' }], { duration: 700, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'forwards' }).finished;
    nb.animate([{ transform: 'translate(-50%,-50%) scale(1,1)' }, { transform: 'translate(-50%,-50%) scale(1.05,.95)' }, { transform: 'translate(-50%,-50%) scale(1,1)' }], { duration: 1600, iterations: Infinity });
    burst(bx, x, y - 40, { n: 12, text: ['✨', '💛', '⭐'], size: [16, 26], dist: [60, 140], dur: 1200 });
    const girl = Math.random() < .1;   // 雌崽稀少，约一成
    const roll = Math.random() * 1000, q = roll >= 930 ? 'SSR' : roll >= 650 ? 'SR' : 'R', lo = { R: 1, SR: 10, SSR: 20 }[q];
    const iv = STATS.map(() => lo + Math.floor(Math.random() * (32 - lo)));
    txt.textContent = girl ? '♀ 雌崽' : '♂ 雄崽';
    const card = document.createElement('div'); card.className = 'baby q-' + q;
    Object.assign(card.style, { position: 'absolute', left: '14px', top: '14px', zIndex: 6, padding: '8px', flexDirection: 'column', alignItems: 'center' });
    card.innerHTML = `<b>Lv1 <span class="qtag ${q}">${q}</span></b>${radar(iv, q)}`;
    bx.appendChild(card);
    card.animate([{ transform: 'scale(0) rotate(-20deg)' }, { transform: 'scale(1.15) rotate(4deg)', offset: .7 }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (q === 'SSR') { flash(bx, '#ffe7a0'); burst(bx, 90, 90, { n: 24, text: ['✨', '⭐', '💛'], size: [16, 26], dist: [40, 160], dur: 1400 }); }
    if (girl) burst(bx, x, y - 40, { n: 16, text: ['♀', '🌸', '✨'], size: [18, 28], dist: [60, 160], dur: 1400 });

    stageBusy = false;
  }

  /* ---------------- 战斗 ---------------- */
  const FX = { 水: ['#7cc4ff', '#ffffff', '#3f8fe0'], 龙: ['#9b7bff', '#d9c8ff', '#5b3fd0'], 恶: ['#3a2f3f', '#7a5f8a', '#111'], 火: ['#ff8a3d', '#ffd36b', '#ff4d2e'], 冰: ['#c9f3ff', '#fff', '#7fd8ea'], 岩: ['#5fbf7a', '#b9f0c4', '#2f7d4a'], 毒: ['#b46ad6', '#e2b6f5', '#7a3d9b'], 飞行: ['#e6efff', '#fff', '#a9c2ee'], 一般: ['#fff', '#ffe9b0', '#d9cfb8'] };
  async function battle(b, test) {
    if (stageBusy) return; stageBusy = true;
    const line = LINES[b.line] || LINES['沧龙'];
    const places = Object.keys(WILD);
    openStage(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#3b2f25">
      <div style="font:700 22px STKaiti,KaiTi,serif">带 ${b.name} 去哪里？</div>
      ${places.map(p => `<button data-place="${p}" style="min-width:220px">${p}${p === '院外林子' ? '（弱）' : p === '十万大山' ? '（最强）' : '（强）'}</button>`).join('')}
      <label style="font-size:14px"><input type="checkbox" id="autoFight"> 自动战斗</label></div>`);
    const place = test ? '院外林子' : await new Promise(res => inner().onclick = e => { const p = e.target.closest('[data-place]'); if (p) res(p.dataset.place); });
    const auto = test || $q('#autoFight').checked; inner().onclick = null;
    const pool = WILD[place], w = pool[Math.floor(Math.random() * pool.length)];
    const flv = Math.round(rnd(...w[4]));
    const me = { name: b.name, lv: b.level, types: line.types, moves: line.forms[b.form] || line.forms['幼年体'], ...stat(b.level, b.form), st: { atk: 0, def: 0, spd: 0 } };
    const foe = { name: '野生的' + w[0], short: w[0], lv: flv, types: w[2], moves: w[3], ...stat(flv, '幼年体'), st: { atk: 0, def: 0, spd: 0 } };
    me.max = me.hp; foe.max = foe.hp; let potions = 3;
    openStage(`<div class="side foe idle" id="sFoe">${w[1]}</div>
      <div class="side mine idle" id="sMe">${picHtml(IMG2D(`${b.line}-${b.form}.png`), FALLBACK[b.line] || '🐉')}</div>
      <div class="hpbox foe"><b>${foe.name}</b> Lv${foe.lv}<div class="hpbar"><i id="hpFoe"></i></div></div>
      <div class="hpbox mine"><b>${me.name}</b> Lv${me.lv}<div class="hpbar"><i id="hpMe"></i></div><small id="hpMeT">${me.hp}/${me.max}</small></div>
      <div class="blog"><div class="msg2" id="bMsg"></div><div class="moves" id="bMoves"></div><div class="row2" id="bRow"></div></div>`);
    const bx = box(), sMe = $q('#sMe'), sFoe = $q('#sFoe');
    // 攻击图：先在后台试着载一下，有才用
    let atkImg = null; { const u = '/game/' + ['立绘', '抠图', name + '-攻击.png'].map(encodeURIComponent).join('/'); const t = new Image(); t.onload = () => { atkImg = u; }; t.src = u; }
    const say = async (t, ms = 900) => { $q('#bMsg').textContent = t; await sleep(ms); };
    const setHp = () => {
      for (const [u, id] of [[me, 'hpMe'], [foe, 'hpFoe']]) {
        const pct = Math.max(0, u.hp / u.max * 100), bar = $q('#' + id);
        bar.style.width = pct + '%'; bar.style.background = pct > 50 ? '#4caf50' : pct > 20 ? '#f0b429' : '#e53935';
      }
      $q('#hpMeT').textContent = `${Math.max(0, me.hp)}/${me.max}`;
    };
    setHp();
    const center = el => { const r = el.getBoundingClientRect(), q = bx.getBoundingClientRect(); return [r.left - q.left + r.width / 2, r.top - q.top + r.height / 2]; };
    async function act(u, t, uEl, tEl, mv) {
      const [mt, pw, acc, ef = {}] = MOVES[mv];
      await say(`${u.name}使出了「${mv}」！`, 500);
      // 有攻击图就换上攻击图，打完换回来
      const im = uEl.querySelector('img'), idle = im && im.getAttribute('src');
      const atk = idle && idle.replace(/\.png$/, '-攻击.png').replace(/%E6%94%BB%E5%87%BB-%E6%94%BB%E5%87%BB/, '');
      if (im && pw > 0) { const t = new Image(); t.onload = () => { im.src = atk; setTimeout(() => { im.src = idle; }, 1100); }; t.src = atk; }
      const dir = uEl === sMe ? 1 : -1;
      // 蓄力压扁 → 弹出去
      await uEl.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.15,.82)' }], { duration: 180, fill: 'forwards' }).finished;
      if (pw > 0) {
        await uEl.animate([{ transform: 'scale(1.15,.82)' }, { transform: `translate(${dir * 70}px,${-dir * 40}px) scale(.88,1.15)` }, { transform: 'translate(0,0) scale(1,1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)' }).finished;
        if (Math.random() * 100 > acc) { await say('但是没有打中！'); return; }
        const [x, y] = center(tEl);
        burst(bx, x, y, { n: 18, colors: FX[mt] || FX.一般, size: [8, 16], dist: [30, 110] });
        if (mt === '水') burst(bx, x, y, { n: 10, text: ['💧'], size: [14, 22], dist: [40, 100], grav: 50 });
        if (mt === '龙') burst(bx, x, y, { n: 6, text: ['✦'], size: [20, 30], dist: [20, 80] });
        const sAtk = u.atk * (1 + u.st.atk * .5), sDef = t.def * (1 + t.st.def * .5);
        const e2 = eff(mt, t.types), stab = u.types.includes(mt) ? 1.5 : 1;
        const dmg = Math.max(1, Math.round(((2 * u.lv / 5 + 2) * pw * sAtk / sDef / 50 + 2) * stab * e2 * rnd(.85, 1)));
        t.hp -= dmg; replay(tEl, 'hit'); shake(bx); if (e2 > 1) flash(bx, '#fff6c8');
        const d = document.createElement('div'); d.className = 'dmg'; d.textContent = '-' + dmg; d.style.left = x + 'px'; d.style.top = (y - 40) + 'px'; bx.appendChild(d);
        d.animate([{ transform: 'translate(-50%,0) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-30px) scale(1.3)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-60px) scale(1)', opacity: 0 }], { duration: 900 }).onfinish = () => d.remove();
        setHp(); await sleep(450);
        if (e2 > 1) await say('效果拔群！', 700); else if (e2 < 1) await say('效果不太好……', 700);
        // 反伤：被近身打中，打人的也疼
        if (phys && t.pas && t.pas.thorns) { const back = Math.max(1, Math.round(dmg * t.pas.thorns)); u.hp -= back; replay(uEl, 'hit'); setHp(); await say(`${u.name}被反震伤了 ${back}！`, 600); }
        if (ef.drain) { u.hp = Math.min(u.max, u.hp + Math.round(dmg * ef.drain)); setHp(); await say(`${u.name}吸回了一些体力！`, 600); }
        const immune = t.pas && t.pas.statusImmune;
        if (ef.para && !immune && Math.random() < ef.para && !t.para) { t.para = true; await say(`${t.name}麻痹了！`, 700); }
        if (ef.conf && !immune && Math.random() < ef.conf && !t.conf) { t.conf = 2; await say(`${t.name}混乱了！`, 700); }
        if (ef.poison && !immune && Math.random() < ef.poison && !t.poison) { t.poison = true; await say(`${t.name}中毒了！`, 700); }
        if (ef.foeSpd) { t.st.spd = Math.max(-3, t.st.spd + ef.foeSpd); await say(`${t.name}的速度降低了！`, 600); }
        if (ef.foeDef && Math.random() < (ef.p || 1)) { t.st.def = Math.max(-3, t.st.def - 1); await say(`${t.name}的防御降低了！`, 600); }
      } else {
        const [x, y] = center(uEl);
        if (ef.heal) { u.hp = Math.min(u.max, u.hp + Math.round(u.max * ef.heal)); burst(bx, x, y, { n: 14, text: ['💧', '✨'], size: [14, 22], dist: [30, 90] }); setHp(); await say(`${u.name}的体力恢复了！`, 700); }
        if (ef.atk) { u.st.atk = Math.min(3, u.st.atk + ef.atk); burst(bx, x, y, { n: 10, text: ['⬆'], size: [16, 24], dist: [20, 70] }); await say(`${u.name}的攻击提高了！`, 700); }
        if (ef.spd) u.st.spd = Math.min(3, u.st.spd + ef.spd);
        if (ef.foeAtk) { t.st.atk = Math.max(-3, t.st.atk + ef.foeAtk); replay(tEl, 'hit'); await say(`${t.name}的攻击降低了！`, 700); }
        if (ef.conf && !t.conf && Math.random() < .5) { t.conf = 2; replay(tEl, 'hit'); await say(`${t.name}混乱了！`, 700); } else if (ef.conf) await say('但是没有效果……', 600);
        if (ef.def) { u.st.def = Math.min(3, u.st.def + ef.def); await say(`${u.name}的防御提高了！`, 600); }
        if (ef.foeDef) { t.st.def = Math.max(-3, t.st.def + ef.foeDef); replay(tEl, 'hit'); await say(`${t.name}的防御降低了！`, 700); }
        uEl.animate([{ transform: 'scale(1.15,.82)' }, { transform: 'scale(.9,1.1)' }, { transform: 'scale(1,1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      }
    }
    async function turnOf(u, t, uEl, tEl, mv) {
      if (u.para && Math.random() < .25) { await say(`${u.name}身体麻痹，动不了！`); return; }
      if (u.conf) { u.conf--; if (Math.random() < .33) { const d = Math.round(u.max * .1); u.hp -= d; replay(uEl, 'hit'); setHp(); await say(`${u.name}晕乎乎地打到了自己！`); return; } }
      await act(u, t, uEl, tEl, mv);
    }
    const fainted = async (u, el) => { el.classList.remove('idle'); el.classList.add('faint'); await say(`${u.name}倒下了！`, 1000); };
    const pickFoe = () => foe.moves[Math.floor(Math.random() * foe.moves.length)];
    const pickAuto = () => { // 雄父带着打：挑打得最疼的招
      let best = me.moves[0], bv = -1;
      for (const m of me.moves) { const [mt, pw] = MOVES[m]; const v = pw ? pw * eff(mt, foe.types) * (me.types.includes(mt) ? 1.5 : 1) : (MOVES[m][3]?.heal && me.hp < me.max * .4 ? 999 : 10); if (v > bv) { bv = v; best = m; } }
      return best;
    };
    await say(`${foe.name}跳了出来！`, 1000);
    let result = null;
    while (!result) {
      // 选招
      let choice;
      if (auto) { await sleep(300); choice = me.hp < me.max * .3 && potions > 0 && Math.random() < .6 ? '灵泉水' : pickAuto(); }
      else {
        $q('#bMsg').textContent = `${me.name}要怎么做？`;
        $q('#bMoves').innerHTML = me.moves.map(m => `<button class="t-${MOVES[m][0]}" data-mv="${m}">${m}<small>${MOVES[m][0]}${MOVES[m][1] ? ' · ' + MOVES[m][1] : ''}</small></button>`).join('');
        $q('#bRow').innerHTML = `<button data-mv="灵泉水">💧 灵泉水（剩 ${potions}）</button><button data-mv="逃跑">🏃 逃跑</button>`;
        choice = await new Promise(res => $q('.blog').onclick = e => { const m = e.target.closest('[data-mv]'); if (m && !(m.dataset.mv === '灵泉水' && potions <= 0)) res(m.dataset.mv); });
        $q('#bMoves').innerHTML = ''; $q('#bRow').innerHTML = '';
      }
      if (choice === '逃跑') { await say('溜了溜了！', 900); result = 'run'; break; }
      const order = (me.spd * (1 + me.st.spd * .5)) >= foe.spd ? ['me', 'foe'] : ['foe', 'me'];
      for (const who of order) {
        if (who === 'me') {
          if (choice === '灵泉水') { potions--; me.hp = Math.min(me.max, me.hp + Math.round(me.max * .5)); const [x, y] = center(sMe); burst(bx, x, y, { n: 14, text: ['💧', '✨'], size: [14, 22], dist: [30, 90] }); setHp(); await say(`喂${me.name}喝了一口灵泉水，体力恢复了！`); }
          else await turnOf(me, foe, sMe, sFoe, choice);
        } else await turnOf(foe, me, sFoe, sMe, pickFoe());
        if (foe.hp <= 0) { await fainted(foe, sFoe); result = 'win'; break; }
        if (me.hp <= 0) { await fainted(me, sMe); result = 'lose'; break; }
      }
      if (!result) for (const [u, el] of [[me, sMe], [foe, sFoe]]) if (u.poison && u.hp > 0) { u.hp -= Math.max(1, Math.round(u.max / 12)); replay(el, 'hit'); setHp(); await say(`${u.name}受到了毒的伤害！`, 600); if (u.hp <= 0) { await fainted(u, el); result = u === me ? 'lose' : 'win'; } }
    }
    // 结算
    let lv = b.level, exp = b.exp, up = false;
    if (result === 'win') {
      const gain = Math.round(flv * 6 + 4); exp += gain;
      burst(bx, bx.clientWidth / 2, bx.clientHeight / 3, { n: 30, text: ['🎉', '✨', '⭐', '💛'], size: [16, 28], dist: [80, 260], dur: 1400 });
      await say(`赢了！${b.name}得到了 ${gain} 点经验。`, 1200);
      while (exp >= expNeed(lv)) { exp -= expNeed(lv); lv++; up = true; }
      if (up) { flash(bx, '#fff6c8'); sMe.animate([{ transform: 'scale(1.25,.75)' }, { transform: 'scale(.85,1.2)' }, { transform: 'scale(1,1)' }], { duration: 500, easing: 'cubic-bezier(.3,1.5,.5,1)' }); await say(`${b.name}升到了 Lv${lv}！`, 1300); }
    } else if (result === 'lose') await say(`${b.name}受了伤，雄父把它抱回了家，要养几天。`, 1500);
    if (!b.demo && result !== 'run') fetch('/api/battle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: b.name, win: result === 'win', enemy: w[0], place, level: lv, exp, levelUp: up }) });
    $q('#bRow').innerHTML = `<button onclick="document.querySelector('#stage2 .close').click()">回家</button>`;
    stageBusy = false;
  }
  /* ---------------- 兽夫出战 ---------------- */
  // 种族属性：有崽崽那一族的用那一族（招式用成年体那套），没有的按种族给
  const RACE_TYPES = { 炽焰狮: ['火'], 紫狮: ['火', '恶'], 赤焰狐: ['火', '恶'], 鲛人: ['水'], 蔚蓝鲛: ['水', '冰'], 海星: ['水', '岩'], 水母: ['水', '毒'], 星鹿: ['冰', '飞行'], 蝶雀孔雀: ['飞行', '毒'], 吟霜狼: ['冰'], 冰翡蝎: ['冰', '毒'] };
  const TYPE_MOVES = { 火: ['火焰牙', '劈开', '嚎叫', '烈焰冲'], 水: ['紧束', '水之波动', '自我再生', '冲浪'], 冰: ['冰牙', '劈开', '孤狼啸', '冰冻光束'], 毒: ['毒牙', '劈开', '盘蜷', '毒击'], 飞行: ['翅膀攻击', '空气斩', '回声', '暴风'], 恶: ['咬住', '暗袭', '嚎叫', '地狱突刺'], 岩: ['夹住', '落石', '变硬', '尖石攻击'], 龙: ['龙爪', '龙息', '龙之舞', '逆鳞'] };
  Object.assign(MOVES, { 火焰牙: ['火', 65, 95, { para: .1 }], 烈焰冲: ['火', 110, 90] });
  // 近身招：用「攻击」，不耗灵力；其余是异能：用「灵力」，按威力耗灵力
  const PHYS = new Set(['撞击', '抓', '咬住', '夹住', '劈开', '咬碎', '龙爪', '冰牙', '火焰牙', '毒牙', '暗袭', '翅膀攻击', '啄', '紧束', '缠绕', '地狱突刺', '十字毒刃']);
  const HMETA = {};   // 专属招式：{ cost, phys, tier, desc }
  const COST = mv => { if (HMETA[mv]) return HMETA[mv].cost; const [mt, pw] = MOVES[mv]; return PHYS.has(mv) || mt === '一般' && pw > 0 ? 0 : !pw ? 10 : pw >= 100 ? 40 : pw >= 80 ? 25 : 15; };
  // 兽夫的敌人：按地点，带阶位
  const HFOES = {
    院外林子: [['灰狼群', '🐺', ['恶'], ['咬住', '抓', '嚎叫'], 1], ['赤焰雉', '🐓', ['火', '飞行'], ['火花', '啄', '翅膀攻击'], 1], ['臭臭兽', '🦨', ['毒'], ['毒雾', '抓', '毒牙'], 1]],
    莽荒森林深处: [['雪豹', '🐆', ['冰'], ['冰牙', '劈开', '抓'], 2], ['灰狼王', '🐺', ['恶'], ['咬住', '暗袭', '嚎叫'], 2], ['黑鹰盗匪', '🦅', ['飞行', '恶'], ['翅膀攻击', '暗袭', '空气斩'], 3]],
    十万大山: [['异兽', '👹', ['恶', '龙'], ['地狱突刺', '劈开', '暗袭'], 5], ['岩甲巨熊', '🐻', ['岩'], ['尖石攻击', '劈开', '变硬'], 4]],
  };
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const tierOf = t => /不到一阶|灵力全无/.test(t) ? .5 : CN[(t.match(/([一二三四五六七八九])阶/) || [])[1]] || .5;
  async function husbandInfo(name) {
    const text = await fetch('/game/' + encodeURIComponent('物品与等级.md') + '?t=' + Date.now()).then(r => r.text()).catch(() => '');
    const sec = (text.split(/^## /m).find(p => p.split(/\r?\n/)[0].trim() === name) || '');
    const line = k => ((sec.match(new RegExp('^[-*]\\s+\\*\\*' + k + '\\*\\*[：:]\\s*(.*)$', 'm')) || [])[1] || '');
    const pair = (t, k) => { const m = t.match(new RegExp(k + '\\s*(\\d+)\\s*/\\s*(\\d+)')); return m ? [+m[1], +m[2]] : null; };
    const b = line('战斗'), six = line('六维');
    const cur = k => (pair(six, k) || [10])[0];
    return { tier: (b.split(/[｜|]/)[0] || '').trim(), hp: pair(b, '血量'), mp: pair(b, '灵力') || [0, 0], atk: cur('攻击'), def: cur('防御'), sp: cur('灵力'), spd: cur('速度'), skills: line('技能') };
  }
  async function husbandBattle(name) {
    if (stageBusy) return;
    const info = await husbandInfo(name);
    if (!info.hp) return alert(name + ' 还没有战斗数值');
    if (info.hp[0] <= 0) return alert(name + ' 伤得太重，现在打不了');
    stageBusy = true;
    const egg = EGGS.find(e => e[0] === name), kin = egg ? egg[2] : '';
    const raceKey = Object.keys(RACE_TYPES).find(k => kin.includes(k)) || kin;
    let types = (LINES[kin] && LINES[kin].types) || RACE_TYPES[raceKey] || ['一般'];
    if ((window.HUSBAND_SKILLS || {})[name]) types = window.HUSBAND_SKILLS[name].types;
    // 技能：档案里写了「技能」就用写的（招式表里有的），不然用他那一族成年体的招 / 按属性配一套
    // 专属技能（app/skills.js）：招式登记进招式表，按「现在的阶」解锁；没解锁的灰着显示几阶解锁
    const HS = (window.HUSBAND_SKILLS || {})[name];
    let moves, locked = [];
    if (HS) {
      for (const m of HS.moves) { MOVES[m.name] = [m.type, m.power, m.acc, m.ef || {}]; HMETA[m.name] = { cost: m.cost || 0, phys: !!m.phys, tier: m.tier || 0, desc: m.desc || '' }; }
      const now = tierOf(info.tier) < 1 ? 0 : tierOf(info.tier);
      moves = HS.moves.filter(m => (m.tier || 0) <= now).map(m => m.name);
      locked = HS.moves.filter(m => (m.tier || 0) > now).map(m => m.name);
    } else {
      moves = (info.skills.match(/[^｜|，,、\s（）()]+/g) || []).filter(m => MOVES[m]).slice(0, 4);
      if (moves.length < 4) moves = ((LINES[kin] && LINES[kin].forms['成年体']) || TYPE_MOVES[types[0]] || TYPE_MOVES.恶).slice();
      // 灵力全无也得能打：没有不耗灵力的攻击招，就把最后一招换成「劈开」
      if (!moves.some(m => COST(m) === 0 && MOVES[m][1] > 0)) moves[moves.length - 1] = '劈开';
    }
    const places = Object.keys(HFOES);
    openStage(`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#3b2f25">
      <div style="font:700 22px STKaiti,KaiTi,serif">${name}去哪里打？</div>
      <div style="font-size:13px;color:#7a6a58">${info.tier}｜血量 ${info.hp[0]}/${info.hp[1]}｜灵力 ${info.mp[0]}/${info.mp[1]}</div>
      ${places.map(p => `<button data-place="${p}" style="min-width:240px">${p}（${[...new Set(HFOES[p].map(f => f[4]))].map(n => '一二三四五六七八九'[n - 1] + '阶').join('～')}）</button>`).join('')}
      <label style="font-size:14px"><input type="checkbox" id="autoFight"> 自动战斗</label></div>`);
    const place = await new Promise(res => inner().onclick = e => { const p = e.target.closest('[data-place]'); if (p) res(p.dataset.place); });
    const auto = $q('#autoFight').checked; inner().onclick = null;
    const pool = HFOES[place], w = pool[Math.floor(Math.random() * pool.length)];
    const ft = w[4], cap = v => Math.min(100, Math.round(v));
    const t0 = tierOf(info.tier);
    const me = { name, lv: Math.round(t0 * 10), types, moves, hp: info.hp[0], max: info.hp[1], mp: info.mp[0], mpMax: info.mp[1], atk: Math.max(5, info.atk), sp: Math.max(5, info.sp), def: Math.max(5, info.def), spd: Math.max(5, info.spd), st: { atk: 0, def: 0, spd: 0 }, pas: (HS && HS.passive && HS.passive.effect) || {} };
    const fhp = Math.round(ft * 100 * rnd(.8, 1.1));
    const foe = { name: w[0], lv: ft * 10, types: w[2], moves: w[3], hp: fhp, max: fhp, mp: 999, atk: cap(ft * 12 + rnd(0, 15)), sp: cap(ft * 12 + rnd(0, 15)), def: cap(ft * 12 + rnd(0, 15)), spd: cap(ft * 12 + rnd(0, 15)), st: { atk: 0, def: 0, spd: 0 } };
    let potions = 3;
    openStage(`<div class="side foe idle" id="sFoe">${w[1]}</div>
      <div class="side mine tall idle" id="sMe">${picHtml('/game/' + ['立绘', '抠图', name + '.png'].map(encodeURIComponent).join('/'), '🛡️')}</div>
      <div class="hpbox foe"><b>${foe.name}</b> ${'一二三四五六七八九'[ft - 1]}阶<div class="hpbar"><i id="hpFoe"></i></div></div>
      <div class="hpbox mine"><b>${me.name}</b> ${esc0(info.tier.replace(/（.*$/, ''))}<div class="hpbar"><i id="hpMe"></i></div><small id="hpMeT"></small><div class="hpbar mp"><i id="mpMe"></i></div><small class="mpl" id="mpMeT"></small></div>
      <div class="blog"><div class="msg2" id="bMsg"></div><div class="moves" id="bMoves"></div><div class="row2" id="bRow"></div></div>`, 'hb hb-' + place);
    const bx = box(), sMe = $q('#sMe'), sFoe = $q('#sFoe');
    // 攻击图：先在后台试着载一下，有才用
    let atkImg = null; { const u = '/game/' + ['立绘', '抠图', name + '-攻击.png'].map(encodeURIComponent).join('/'); const t = new Image(); t.onload = () => { atkImg = u; }; t.src = u; }
    const say = async (t, ms = 900) => { $q('#bMsg').textContent = t; await sleep(ms); };
    const setHp = () => {
      for (const [u, id] of [[me, 'hpMe'], [foe, 'hpFoe']]) {
        const pct = Math.max(0, u.hp / u.max * 100), bar = $q('#' + id);
        bar.style.width = pct + '%'; bar.style.background = pct > 50 ? '#4caf50' : pct > 20 ? '#f0b429' : '#e53935';
      }
      $q('#hpMeT').textContent = `血量 ${Math.max(0, me.hp)}/${me.max}`;
      $q('#mpMe').style.width = (me.mpMax ? me.mp / me.mpMax * 100 : 0) + '%';
      $q('#mpMeT').textContent = `灵力 ${me.mp}/${me.mpMax}`;
    };
    setHp();
    const center = el => { const r = el.getBoundingClientRect(), q = bx.getBoundingClientRect(); return [r.left - q.left + r.width / 2, r.top - q.top + r.height / 2]; };
    async function act(u, t, uEl, tEl, mv) {
      const [mt, pw, acc, ef = {}] = MOVES[mv];
      if (u === me) { me.mp = Math.max(0, me.mp - COST(mv)); setHp(); }
      await say(`${u.name}使出了「${mv}」！`, 500);
      if (u === me && pw > 0 && atkImg) { const im = uEl.querySelector('img'); if (im) { const idle = im.src; im.src = atkImg; setTimeout(() => { im.src = idle; }, 1200); } }
      const dir = uEl === sMe ? 1 : -1;
      await uEl.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.12,.86)' }], { duration: 180, fill: 'forwards' }).finished;
      if (pw > 0) {
        await uEl.animate([{ transform: 'scale(1.12,.86)' }, { transform: `translate(${dir * 70}px,${-dir * 40}px) scale(.9,1.12)` }, { transform: 'translate(0,0) scale(1,1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)' }).finished;
        if (Math.random() * 100 > acc) { await say('但是没有打中！'); return; }
        const [x, y] = center(tEl);
        burst(bx, x, y, { n: 18, colors: FX[mt] || FX.一般, size: [8, 16], dist: [30, 110] });
        if (mt === '水') burst(bx, x, y, { n: 10, text: ['💧'], size: [14, 22], dist: [40, 100], grav: 50 });
        if (mt === '火') burst(bx, x, y, { n: 10, text: ['🔥'], size: [14, 22], dist: [30, 90] });
        if (mt === '冰') burst(bx, x, y, { n: 8, text: ['❄'], size: [14, 22], dist: [30, 90] });
        if (mt === '龙') burst(bx, x, y, { n: 6, text: ['✦'], size: [20, 30], dist: [20, 80] });
        // 近身招看「攻击」，异能看「灵力」
        const phys = HMETA[mv] ? HMETA[mv].phys : COST(mv) === 0;
        const A = (u === me && !phys ? u.sp : u.atk) * (1 + u.st.atk * .5), D = t.def * (1 + t.st.def * .5);
        const e2 = eff(mt, t.types), stab = u.types.includes(mt) ? 1.5 : 1;
        const up = u.pas && u.pas.lowHpBoost === mt && u.hp < u.max / 3 ? 1.5 : 1;
        const crit = u.pas && u.pas.critUp && Math.random() < u.pas.critUp ? 1.5 : 1;
        const guard = t.pas && t.pas.guard ? 1 - t.pas.guard : 1;
        const dmg = Math.max(1, Math.round(((2 * u.lv / 5 + 2) * pw * A / D / 50 + 2) * 2 * stab * e2 * up * crit * guard * rnd(.85, 1)));
        if (crit > 1) say('会心一击！', 1);
        if (up > 1) say(`${u.name}的「${HS && HS.passive ? HS.passive.name : '特性'}」发动了！`, 1);
        t.hp -= dmg; replay(tEl, 'hit'); shake(bx); if (e2 > 1) flash(bx, '#fff6c8');
        const d = document.createElement('div'); d.className = 'dmg'; d.textContent = '-' + dmg; d.style.left = x + 'px'; d.style.top = (y - 40) + 'px'; bx.appendChild(d);
        d.animate([{ transform: 'translate(-50%,0) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-30px) scale(1.3)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-60px) scale(1)', opacity: 0 }], { duration: 900 }).onfinish = () => d.remove();
        setHp(); await sleep(450);
        if (e2 > 1) await say('效果拔群！', 700); else if (e2 < 1) await say('效果不太好……', 700);
        // 反伤：被近身打中，打人的也疼
        if (phys && t.pas && t.pas.thorns) { const back = Math.max(1, Math.round(dmg * t.pas.thorns)); u.hp -= back; replay(uEl, 'hit'); setHp(); await say(`${u.name}被反震伤了 ${back}！`, 600); }
        if (ef.drain) { u.hp = Math.min(u.max, u.hp + Math.round(dmg * ef.drain)); setHp(); await say(`${u.name}吸回了一些体力！`, 600); }
        const immune = t.pas && t.pas.statusImmune;
        if (ef.para && !immune && Math.random() < ef.para && !t.para) { t.para = true; await say(`${t.name}麻痹了！`, 700); }
        if (ef.conf && !immune && Math.random() < ef.conf && !t.conf) { t.conf = 2; await say(`${t.name}混乱了！`, 700); }
        if (ef.poison && !immune && Math.random() < ef.poison && !t.poison) { t.poison = true; await say(`${t.name}中毒了！`, 700); }
        if (ef.foeSpd) { t.st.spd = Math.max(-3, t.st.spd + ef.foeSpd); await say(`${t.name}的速度降低了！`, 600); }
        if (ef.foeDef && Math.random() < (ef.p || 1)) { t.st.def = Math.max(-3, t.st.def - 1); await say(`${t.name}的防御降低了！`, 600); }
      } else {
        const [x, y] = center(uEl);
        if (ef.heal) { u.hp = Math.min(u.max, u.hp + Math.round(u.max * ef.heal)); burst(bx, x, y, { n: 14, text: ['💧', '✨'], size: [14, 22], dist: [30, 90] }); setHp(); await say(`${u.name}的体力恢复了！`, 700); }
        if (ef.atk) { u.st.atk = Math.min(3, u.st.atk + ef.atk); burst(bx, x, y, { n: 10, text: ['⬆'], size: [16, 24], dist: [20, 70] }); await say(`${u.name}的攻击提高了！`, 700); }
        if (ef.spd) u.st.spd = Math.min(3, u.st.spd + ef.spd);
        if (ef.def) { u.st.def = Math.min(3, u.st.def + ef.def); await say(`${u.name}的防御提高了！`, 600); }
        if (ef.foeAtk) { t.st.atk = Math.max(-3, t.st.atk + ef.foeAtk); replay(tEl, 'hit'); await say(`${t.name}的攻击降低了！`, 700); }
        if (ef.foeDef) { t.st.def = Math.max(-3, t.st.def + ef.foeDef); replay(tEl, 'hit'); await say(`${t.name}的防御降低了！`, 700); }
        if (ef.conf && !t.conf && Math.random() < .5) { t.conf = 2; replay(tEl, 'hit'); await say(`${t.name}混乱了！`, 700); } else if (ef.conf) await say('但是没有效果……', 600);
        uEl.animate([{ transform: 'scale(1.12,.86)' }, { transform: 'scale(.92,1.08)' }, { transform: 'scale(1,1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      }
    }
    async function turnOf(u, t, uEl, tEl, mv) {
      if (u.para && Math.random() < .25) { await say(`${u.name}身体麻痹，动不了！`); return; }
      if (u.conf) { u.conf--; if (Math.random() < .33) { const d = Math.round(u.max * .08); u.hp -= d; replay(uEl, 'hit'); setHp(); await say(`${u.name}晕乎乎地伤到了自己！`); return; } }
      await act(u, t, uEl, tEl, mv);
    }
    const fainted = async (u, el) => { el.classList.remove('idle'); el.classList.add('faint'); await say(u === me ? `${u.name}撑不住，倒下了！` : `${u.name}倒下了！`, 1000); };
    const usable = m => me.mp >= COST(m);
    const pickAuto = () => {
      let best = me.moves.find(usable) || '劈开', bv = -1;
      for (const m of me.moves.filter(usable)) { const [mt, pw] = MOVES[m]; const v = pw ? pw * eff(mt, foe.types) * (me.types.includes(mt) ? 1.5 : 1) * ((COST(m) ? me.sp : me.atk) / 50) : (MOVES[m][3]?.heal && me.hp < me.max * .4 ? 999 : 5); if (v > bv) { bv = v; best = m; } }
      return best;
    };
    await say(`${foe.name}挡在了前面！`, 1000);
    let result = null;
    while (!result) {
      let choice;
      if (auto) { await sleep(300); choice = me.hp < me.max * .3 && potions > 0 && Math.random() < .6 ? '灵泉水' : pickAuto(); }
      else {
        $q('#bMsg').textContent = `${me.name}要怎么做？`;
        $q('#bMoves').innerHTML = me.moves.map(m => `<button class="t-${MOVES[m][0]}" data-mv="${m}" title="${esc0((HMETA[m] || {}).desc || '')}" ${usable(m) ? '' : 'disabled'}>${m}<small>${MOVES[m][0]}${MOVES[m][1] ? ' · ' + MOVES[m][1] : ''}${COST(m) ? ` · <b>💠${COST(m)}</b>` : ''}</small></button>`).join('') + locked.map(m => `<button class="t-${MOVES[m][0]}" disabled title="${esc0(HMETA[m].desc)}">🔒 ${m}<small>${'一二三四五六七八九'[HMETA[m].tier - 1] || HMETA[m].tier}阶解锁</small></button>`).join('');
        $q('#bRow').innerHTML = `<button data-mv="灵泉水">💧 灵泉水（剩 ${potions}）</button><button data-mv="逃跑">🏃 撤</button>`;
        choice = await new Promise(res => $q('.blog').onclick = e => { const m = e.target.closest('[data-mv]'); if (m && !m.disabled && !(m.dataset.mv === '灵泉水' && potions <= 0)) res(m.dataset.mv); });
        $q('#bMoves').innerHTML = ''; $q('#bRow').innerHTML = '';
      }
      if (choice === '逃跑') { await say(`${me.name}护着退了回来。`, 900); result = 'run'; break; }
      const order = (me.pas.firstStrike && !me.struck) || (me.spd * (1 + me.st.spd * .5)) >= foe.spd ? ['me', 'foe'] : ['foe', 'me'];
      me.struck = true;
      for (const who of order) {
        if (who === 'me') {
          if (choice === '灵泉水') { potions--; me.hp = Math.min(me.max, me.hp + Math.round(me.max * .3)); const [x, y] = center(sMe); burst(bx, x, y, { n: 14, text: ['💧', '✨'], size: [14, 22], dist: [30, 90] }); setHp(); await say(`${me.name}喝了一口灵泉水，血量回来了一些！`); }
          else await turnOf(me, foe, sMe, sFoe, choice);
        } else await turnOf(foe, me, sFoe, sMe, foe.moves[Math.floor(Math.random() * foe.moves.length)]);
        if (foe.hp <= 0) { await fainted(foe, sFoe); result = 'win'; break; }
        if (me.hp <= 0) { await fainted(me, sMe); result = 'lose'; break; }
      }
      if (!result && me.pas.regen && me.hp > 0 && me.hp < me.max) { me.hp = Math.min(me.max, me.hp + Math.round(me.max * me.pas.regen)); setHp(); await say(`${me.name}的伤口慢慢合上了一些。`, 500); }
      if (!result && me.pas.mpRegen && me.mp < me.mpMax) { me.mp = Math.min(me.mpMax, me.mp + me.pas.mpRegen); setHp(); }
      if (!result) for (const [u, el] of [[me, sMe], [foe, sFoe]]) if (u.poison && u.hp > 0) { u.hp -= Math.max(1, Math.round(u.max / 14)); replay(el, 'hit'); setHp(); await say(`${u.name}受到了毒的伤害！`, 600); if (u.hp <= 0) { await fainted(u, el); result = u === me ? 'lose' : 'win'; } }
    }
    me.hp = Math.max(0, me.hp);
    if (result === 'win') { burst(bx, bx.clientWidth / 2, bx.clientHeight / 3, { n: 30, text: ['🎉', '✨', '⭐'], size: [16, 28], dist: [80, 260], dur: 1400 }); await say(`赢了！${me.name}打退了${foe.name}。`, 1200); }
    else if (result === 'lose') await say(`${me.name}伤得站不起来了……`, 1400);
    await fetch('/api/battle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ husband: name, win: result === 'win', run: result === 'run', enemy: foe.name, place, hp: me.hp, mp: me.mp }) }).catch(() => {});
    if (typeof window.loadItems === 'function') window.loadItems();
    $q('#bRow').innerHTML = `<button onclick="document.querySelector('#stage2 .close').click()">回家</button>`;
    stageBusy = false;
  }
  const esc0 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.husbandBattle = husbandBattle;
  document.addEventListener('click', e => { const h = e.target.closest('[data-hfight]'); if (h) husbandBattle(h.dataset.hfight); });

  // 自测用：地址后面加 #test-hatch / #test-battle 直接播动画
  if (location.hash === '#test-hatch') setTimeout(() => hatch('沧龙蛋', '沧龙', null), 300);
  if (location.hash === '#test-battle') setTimeout(() => battle({ name: '小沧龙（试玩）', line: '沧龙', form: '幼年体', level: 5, exp: 0, demo: true }, true), 300);
})();
