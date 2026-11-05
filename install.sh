#!/bin/bash
# 恶雌模拟器 · 一键安装器（Mac）
# 用法（「终端」里粘贴这一行回车）：
#   curl -fsSL https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.sh | bash
# 彻底卸载（安装器打不开也能删干净）：
#   curl -fsSL https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.sh | bash -s -- --uninstall
# 做的事：准备好 Node.js（没有就下一个免安装版），只下载安装器那几个文件放到 ~/Library/Application Support/EciSimulator，
# 桌面放一个「恶雌模拟器安装器」，然后打开它。不需要管理员密码。每一步都显示进度。
set -euo pipefail

REPO='mxxs109-ops/eci-simulator'
BRANCH='main'
HOME2="$HOME/Library/Application Support/EciSimulator"
DESK="$HOME/Desktop"
STEP='开始前的准备'

say() { printf '%s\n' "$*"; }
step() { STEP="第 $1 步「$2」"; printf '\n\033[35m[%s/3] %s\033[0m\n' "$1" "$2"; }
bar() {   # bar 已完成 总数 名字
  local w=30 fill=$(( $1 * 30 / $2 )) pct=$(( $1 * 100 / $2 ))
  printf '\r  [%s%s] %3d%%  %s   ' "$(printf '%*s' "$fill" '' | tr ' ' '#')" "$(printf '%*s' $(( w - fill )) '' | tr ' ' '-')" "$pct" "$3"
}
fail() { printf '\n\033[31m出错了：%s没做完。检查一下网络，再粘贴那一行试一次。\033[0m\n' "$STEP" >&2; }

# ---------- 彻底卸载 ----------
# 停掉属于我们的程序（安装器 7790、游戏 7788、本地模型 8080、配音 9880），删安装位置里我们装的东西、安装器文件夹、桌面图标
uninstall() {
  say '恶雌模拟器：彻底卸载'
  local root='' node=''
  for n in "$HOME2/node/bin/node" "$(command -v node 2>/dev/null || true)"; do if [ -x "$n" ]; then node="$n"; break; fi; done
  if [ -f "$HOME2/state.json" ]; then
    if [ -n "$node" ]; then root=$("$node" -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).root||"")}catch{}' "$HOME2/state.json" </dev/null || true)
    else root=$(sed -n 's/^ *"root": *"\(.*\)",*$/\1/p' "$HOME2/state.json" | head -1); fi
  fi
  [ -z "$root" ] && root="$HOME/EciSimulator"
  # 安装位置要像我们的（最后一级文件夹叫 EciSimulator，不分大小写；末尾带不带 / 都行），才去动
  while [ "${root%/}" != "$root" ] && [ "$root" != / ]; do root="${root%/}"; done
  local okroot=0
  case "$root" in /|"$HOME"|"$DESK"|"$HOME/Documents") ;; */*) [ "$(basename "$root" | tr '[:upper:]' '[:lower:]')" = ecisimulator ] && okroot=1 ;; esac

  say '  关掉正在运行的安装器、游戏、本地模型'
  mine() { case "$1" in *"$HOME2"*) return 0 ;; esac; if [ "$okroot" = 1 ]; then case "$1" in *"$root/"*) return 0 ;; esac; fi; return 1; }
  for port in 7790 7788 8080 9880; do
    for pid in $(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null || true); do
      local cmd cwd
      cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true)
      if mine "$cmd" || mine "$cwd/"; then kill "$pid" 2>/dev/null || true; fi
    done
  done
  # 跟着游戏开的看门程序（watch.js）之类：命令行里有安装器文件夹的都停掉
  { ps -axo pid=,command= 2>/dev/null || true; } | while read -r pid cmd; do
    if [ "$pid" = "$$" ]; then continue; fi
    case "$cmd" in *"$HOME2"*) kill "$pid" 2>/dev/null || true ;; esac
  done
  # 出门连接（Tailscale 转发）关掉
  for ts in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$(command -v tailscale 2>/dev/null || true)"; do
    if [ -x "$ts" ]; then "$ts" serve --http 8788 off >/dev/null 2>&1 </dev/null || true; break; fi
  done
  sleep 1

  if [ "$okroot" = 1 ] && [ -d "$root" ]; then
    say "  删除 $root 里的游戏、存档、语言模型、配音"
    for n in game saves template llm tts; do rm -rf "${root:?}/$n"; done
    rmdir "$root" 2>/dev/null || true
  elif [ -d "$root" ]; then
    say "  安装位置 $root 看着不像我们的文件夹，没动它"
  fi
  say '  删除桌面图标'
  rm -rf "$DESK/恶雌模拟器安装器.app" "$DESK/恶雌模拟器安装器.command" "$DESK/恶雌模拟器.command"
  say '  删除安装器（连同它下的 Node.js）'
  rm -rf "$HOME2"
  printf '\n\033[32m全部删干净了。\033[0m\n'
}

# ---------- 安装 ----------
install() {
  trap fail ERR
  say $'\033[35m恶雌模拟器安装器：开始安装（大约 1 分钟）\033[0m'
  mkdir -p "$HOME2"

  # 1. Node.js：电脑上有 18 以上就用，没有就下一个免安装版（只放在安装器文件夹里）
  step 1 '准备 Node.js'
  local node='' v=''
  if command -v node >/dev/null 2>&1; then
    v=$(node -v 2>/dev/null || true); local major=${v#v}; major=${major%%.*}
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 18 )); then node=$(command -v node); fi
  fi
  if [ -n "$node" ]; then say "  电脑上已经有 Node.js $v，直接用"
  elif [ -x "$HOME2/node/bin/node" ]; then node="$HOME2/node/bin/node"; say '  上次已经下好了，直接用'
  else
    local arch=x64
    [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] && arch=arm64   # 苹果芯片（终端开了 Rosetta 也认得出）
    say '  下载 Node.js（约 50MB）：'
    local sums name tmp
    sums=$(curl -fsSL --retry 3 --connect-timeout 15 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)
    name=$(printf '%s\n' "$sums" | awk -v a="darwin-$arch.tar.gz" '$2 ~ a"$" { print $2; exit }')
    [ -n "$name" ] || { say '  没找到 Mac 版 Node.js 的下载地址'; false; }
    tmp=$(mktemp -d)
    curl -fL -# --retry 3 --connect-timeout 15 -o "$tmp/$name" "https://nodejs.org/dist/latest-v22.x/$name"
    local want got
    want=$(printf '%s\n' "$sums" | awk -v n="$name" '$2 == n { print $1 }')
    got=$(shasum -a 256 "$tmp/$name" | awk '{ print $1 }')
    [ "$want" = "$got" ] || { say '  下载的文件不完整'; rm -rf "$tmp"; false; }
    say '  解压…'
    rm -rf "$HOME2/node.new" && mkdir -p "$HOME2/node.new"
    tar -xzf "$tmp/$name" -C "$HOME2/node.new" --strip-components 1
    rm -rf "$tmp" "$HOME2/node" && mv "$HOME2/node.new" "$HOME2/node"
    node="$HOME2/node/bin/node"
  fi

  # 2. 安装器：只下载仓库里 installer 文件夹的那几个文件（不拖整个游戏）
  step 2 '下载安装器'
  say '  问 GitHub 要文件清单…'
  local dest="$HOME2/installer" tmp2 list=''
  tmp2=$(mktemp -d)
  # 先问 GitHub 要最新的清单；问不到（一小时最多 60 次）就用下面这份（和 install.ps1 里的一样）
  list=$(curl -fsSL -m 8 -H 'User-Agent: eci-installer' "https://api.github.com/repos/$REPO/git/trees/$BRANCH?recursive=1" 2>/dev/null \
    | "$node" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const t of JSON.parse(s).tree)if(t.type==="blob"&&t.path.startsWith("installer/"))console.log(t.path)}catch{}})' 2>/dev/null) || list=''
  if [ -z "$list" ]; then
    list='installer/server.js
installer/watch.js
installer/shortcut.ps1
installer/tts_server.py
installer/web/index.html
installer/web/llm.js
installer/web/vendor/qrcode.js
installer/web/icon.png
installer/web/icon.ico
installer/web/guide/deepseek.svg
installer/web/guide/apikey.svg'
  fi
  local total i=0 f url
  total=$(printf '%s\n' "$list" | grep -c .)
  while IFS= read -r f; do
    if [ -z "$f" ]; then continue; fi
    i=$(( i + 1 )); bar "$i" "$total" "${f##*/}"
    url="https://raw.githubusercontent.com/$REPO/$BRANCH/$("$node" -e 'process.stdout.write(process.argv[1].split("/").map(encodeURIComponent).join("/"))' "$f" </dev/null)"
    mkdir -p "$tmp2/$(dirname "$f")"
    curl -fsSL --retry 3 --connect-timeout 15 -o "$tmp2/$f" "$url" </dev/null
  done <<< "$list"
  say ''
  say "  下好了 $total 个文件（游戏本体之后在安装器里装）"
  rm -rf "$dest" && mv "$tmp2/installer" "$dest" && rm -rf "$tmp2"

  # 3. 桌面图标：一个小 .app，双击在后台开安装器（不留终端窗口）
  step 3 '放桌面图标'
  local launch="$HOME2/open-installer.sh" app="$DESK/恶雌模拟器安装器.app"
  cat > "$launch" <<EOF
#!/bin/bash
# 桌面图标点开时跑这个：后台开安装器，它自己打开浏览器（已经开着就只打开浏览器）
cd "$dest" || exit 1
nohup "$node" "$dest/server.js" >/dev/null 2>&1 </dev/null &
EOF
  chmod +x "$launch"
  mkdir -p "$DESK"
  rm -rf "$app" "$DESK/恶雌模拟器安装器.command"
  if osacompile -o "$app" -e "do shell script quoted form of \"$launch\"" >/dev/null 2>&1 </dev/null; then
    # 换上游戏图标（换不了就用默认的）
    local png="$dest/web/icon.png" icns="$HOME2/icon.icns"
    if [ -f "$png" ] && sips -z 256 256 "$png" --out "$HOME2/icon256.png" >/dev/null 2>&1 && sips -s format icns "$HOME2/icon256.png" --out "$icns" >/dev/null 2>&1; then
      cp "$icns" "$app/Contents/Resources/applet.icns" 2>/dev/null || true
      codesign --force --deep --sign - "$app" >/dev/null 2>&1 || true   # 改过图标要重新签一下，不然有的系统打不开
      touch "$app"
    fi
    rm -f "$HOME2/icon256.png" "$icns"
  else
    # 做不了 .app：退回一个 .command（双击会开一个终端窗口）
    printf '#!/bin/bash\n%q\necho "安装器打开了，这个窗口可以关掉"\n' "$launch" > "$DESK/恶雌模拟器安装器.command"
    chmod +x "$DESK/恶雌模拟器安装器.command"
  fi
  say '  桌面上多了「恶雌模拟器安装器」'

  trap - ERR
  printf '\n\033[32m好了！现在帮你打开安装器（浏览器里），之后的事都在那里点。这个终端窗口可以关掉了。\033[0m\n'
  "$launch" </dev/null
}

case "${1:-}" in
  --uninstall|uninstall) uninstall ;;
  *) install ;;
esac
