# 恶雌模拟器 · 一键安装器
# 用法（cmd 里粘贴这一行回车；先下载成文件再运行，不用「irm | iex」——Windows Defender 会把它误判成木马拦掉）：
#   curl -fsSL -o "%TEMP%\eci-install.ps1" https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.ps1 && powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\eci-install.ps1"
# 彻底卸载（安装器打不开也能删干净）：同一行最后加 -Uninstall
# 做的事：准备好 Node.js（没有就下一个免安装版），只下载安装器那几个文件放到 %LOCALAPPDATA%\EciSimulator，
# 桌面放一个「恶雌模拟器安装器」图标，然后打开它。不需要管理员权限。每一步都显示进度。
# 注意：这个文件要存成「UTF-8 带 BOM」，用 -File 运行时 PowerShell 5 才认得出中文
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # PowerShell 自带的进度条会让下载慢很多倍；进度用下面自己画的
$Repo = 'mxxs109-ops/eci-simulator'
$Branch = 'main'
$Home2 = Join-Path $env:LOCALAPPDATA 'EciSimulator'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

# 出错了：说清楚哪一步没做完、为什么，别只露一屏红字
$script:StepName = '开始前的准备'
trap {
  Write-Host ''
  Write-Host ("出错了：{0}没做完：{1}" -f $script:StepName, $_.Exception.Message) -ForegroundColor Red
  Write-Host '检查一下网络，再粘贴那一行试一次。' -ForegroundColor Yellow
  exit 1
}

function Step($n, $text) { $script:StepName = "第 $n 步「$text」"; Write-Host ''; Write-Host "[$n/3] $text" -ForegroundColor Magenta }
function Bar($done, $total, $label) {
  $w = 30; $p = if ($total -gt 0) { [math]::Min(1.0, [double]$done / $total) } else { 0 }
  $fill = [int]([math]::Round($p * $w))
  Write-Host ("`r  [" + ('#' * $fill) + ('-' * ($w - $fill)) + "] " + ([int]($p * 100)).ToString().PadLeft(3) + "%  $label   ") -NoNewline
}
# 下载一个文件：有 curl.exe（Win10 以后都有）就用它，自带进度条；没有就退回 Invoke-WebRequest
function Fetch($url, $out, [switch]$Quiet) {
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  $curl = Join-Path $env:WINDIR 'System32\curl.exe'
  if (Test-Path $curl) {
    $ca = @('-fL', '--retry', '3', '--connect-timeout', '15', '-o', $out, $url)
    if ($Quiet) { $ca = @('-s') + $ca } else { $ca = @('-#') + $ca }
    & $curl @ca
    if ($LASTEXITCODE -ne 0) { throw "下载失败：$url" }
  } else { Invoke-WebRequest $url -OutFile $out -UseBasicParsing }
}

# ---------- 彻底卸载 ----------
# 停掉属于我们的程序（安装器 7790、游戏 7788、本地模型 8080、配音 9880），删安装位置里我们装的东西、安装器文件夹、桌面图标、防火墙规则
function Remove-Eci {
  $script:StepName = '卸载'
  $ErrorActionPreference = 'Continue'   # 卸载时一样删不掉就接着删下一样，最后一起报
  Write-Host '恶雌模拟器：彻底卸载' -ForegroundColor Magenta
  $root = ''
  $stateFile = Join-Path $Home2 'state.json'
  if (Test-Path $stateFile) { try { $root = [string](Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json).root } catch {} }
  if (-not $root) { $root = Join-Path $env:USERPROFILE 'EciSimulator' }
  $root = $root.TrimEnd('\', '/')
  # 安装位置要像我们的（最后一级文件夹叫 EciSimulator），才去动
  $okRoot = (Split-Path $root -Leaf) -ieq 'EciSimulator'
  $h = $Home2.ToLower() + '\'
  $r = $root.ToLower() + '\'
  $mine = { param($s) if (-not $s) { return $false }; $s = $s.ToLower(); return $s.Contains($h) -or ($okRoot -and $s.Contains($r)) }

  Write-Host '  关掉正在运行的安装器、游戏、本地模型、配音'
  # 游戏：问它自己装在哪
  try {
    $st = Invoke-RestMethod 'http://127.0.0.1:7788/api/status' -TimeoutSec 2
    if ($okRoot -and $st.gameDir -and ([IO.Path]::GetFullPath($st.gameDir).TrimEnd('\').ToLower() -eq (Join-Path $root 'game').ToLower())) {
      Get-NetTCPConnection -LocalPort 7788 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F 2>$null | Out-Null }
    }
  } catch {}
  # 安装器、本地模型、配音：程序路径或命令行在我们的文件夹里
  foreach ($port in 7790, 8080, 9880) {
    foreach ($c in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
      $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
      if ($p -and ((& $mine $p.ExecutablePath) -or (& $mine $p.CommandLine))) { taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null }
    }
  }
  # 黑窗口（启动游戏.bat、启动本地模型.bat、启动配音.bat）和看门的 watch.js：命令行里有我们的文件夹
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe' or Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and (& $mine $_.CommandLine) } |
    ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
  # 出门连接（Tailscale 转发）关掉
  $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
  if (Test-Path $ts) { try { & $ts serve --http 8788 off 2>$null | Out-Null } catch {} }
  Start-Sleep 2

  $left = @()
  if ($okRoot -and (Test-Path $root)) {
    Write-Host "  删除 $root 里的游戏、存档、语言模型、配音"
    foreach ($n in 'game', 'saves', 'template', 'llm', 'tts') {
      $d = Join-Path $root $n
      if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; if (Test-Path $d) { $left += $d } }
    }
    if (-not (Get-ChildItem $root -Force -ErrorAction SilentlyContinue)) { Remove-Item $root -Force -ErrorAction SilentlyContinue }
  } elseif (Test-Path $root) {
    Write-Host "  安装位置 $root 看着不像我们的文件夹，没动它" -ForegroundColor Yellow
  }
  Write-Host '  删除桌面图标'
  $desk = [Environment]::GetFolderPath('Desktop')
  foreach ($n in '恶雌模拟器.lnk', '恶雌模拟器安装器.lnk') { Remove-Item (Join-Path $desk $n) -Force -ErrorAction SilentlyContinue }
  # 防火墙规则：有才删（删要管理员，Windows 会问「是否允许更改」）
  & netsh advfirewall firewall show rule name=EciSimulator *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host '  删除防火墙规则（Windows 问「是否允许更改」时点「是」）'
    try { Start-Process netsh -ArgumentList 'advfirewall firewall delete rule name=EciSimulator' -Verb RunAs -WindowStyle Hidden -Wait } catch {}
    & netsh advfirewall firewall show rule name=EciSimulator *> $null
    if ($LASTEXITCODE -eq 0) { $left += '防火墙规则 EciSimulator（要在「是否允许更改」里点「是」）' }
  }
  Write-Host '  删除安装器（连同它下的 Node.js）'
  if (Test-Path $Home2) { Remove-Item $Home2 -Recurse -Force -ErrorAction SilentlyContinue; if (Test-Path $Home2) { $left += $Home2 } }

  Write-Host ''
  if ($left.Count) {
    Write-Host '这些没删掉（可能有窗口还开着占着它）：' -ForegroundColor Yellow
    $left | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host '关掉开着的窗口，再粘贴那一行试一次。' -ForegroundColor Yellow
    exit 1
  }
  Write-Host '全部删干净了。' -ForegroundColor Green
  exit 0
}
if ($Uninstall) { Remove-Eci }

New-Item -ItemType Directory -Force $Home2 | Out-Null
Write-Host '恶雌模拟器安装器：开始安装（大约 1 分钟）' -ForegroundColor Magenta

# 1. Node.js：电脑上有 18 以上就用，没有就下一个免安装版（只放在安装器文件夹里）
Step 1 '准备 Node.js'
$node = $null
try { $v = (& node -v) 2>$null; if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 18) { $node = (Get-Command node).Source } } catch {}
if ($node) { Write-Host "  电脑上已经有 Node.js $v，直接用" }
else {
  $local = Join-Path $Home2 'node\node.exe'
  if (Test-Path $local) { Write-Host '  上次已经下好了，直接用' }
  else {
    Write-Host '  下载 Node.js（约 30MB）：'
    $sums = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
    $line = $sums -split "`n" | Where-Object { $_ -match 'win-x64\.zip\s*$' } | Select-Object -First 1
    if (-not $line) { throw '没找到 Node.js 的下载地址' }
    $want = $line.Trim().Split(' ')[0].ToLower()
    $zipName = $line.Trim().Split(' ')[-1].Trim()
    $zip = Join-Path $env:TEMP $zipName
    Fetch "https://nodejs.org/dist/latest-v22.x/$zipName" $zip
    # 对一下官方给的 SHA256：下载不完整或者被改过就不用
    $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $want) { Remove-Item $zip -Force -ErrorAction SilentlyContinue; throw '下载的 Node.js 不完整（校验对不上）' }
    Write-Host '  解压…'
    Expand-Archive $zip -DestinationPath $Home2 -Force
    Remove-Item $zip
    $dir = Join-Path $Home2 'node'
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    Rename-Item (Join-Path $Home2 ($zipName -replace '\.zip$', '')) 'node'
  }
  $node = $local
}

# 2. 安装器：只下载仓库里 installer 文件夹的那几个文件（不拖整个游戏）
Step 2 '下载安装器'
Write-Host '  问 GitHub 要文件清单…'
$dest = Join-Path $Home2 'installer'
$tmp = Join-Path $env:TEMP 'eci-installer-new'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
# 安装器有哪些文件：先问 GitHub 要最新的清单；问不到（一小时最多 60 次）就用下面这份
$files = @('installer/server.js', 'installer/watch.js', 'installer/shortcut.ps1', 'installer/tts_server.py', 'installer/web/index.html',
  'installer/web/llm.js', 'installer/web/vendor/qrcode.js', 'installer/web/icon.png', 'installer/web/icon.ico', 'installer/web/guide/deepseek.svg', 'installer/web/guide/apikey.svg')
try {
  $tree = Invoke-RestMethod "https://api.github.com/repos/$Repo/git/trees/$Branch`?recursive=1" -Headers @{ 'User-Agent' = 'eci-installer' } -TimeoutSec 8
  $list = @($tree.tree | Where-Object { $_.type -eq 'blob' -and $_.path -like 'installer/*' } | ForEach-Object { $_.path })
  if ($list.Count) { $files = $list }
} catch {}
$i = 0
foreach ($f in $files) {
  $i++; Bar $i $files.Count (Split-Path $f -Leaf)
  $url = "https://raw.githubusercontent.com/$Repo/$Branch/" + ((($f -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  Fetch $url (Join-Path $tmp ($f -replace '/', '\')) -Quiet
}
Write-Host ''
Write-Host "  下好了 $($files.Count) 个文件（游戏本体之后在安装器里装）"
$src = Join-Path $tmp 'installer'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $src $dest -Recurse
Remove-Item $tmp -Recurse -Force

# 3. 桌面图标：用 wscript 隐藏黑窗口启动安装器
Step 3 '放桌面图标'
$vbs = Join-Path $Home2 '打开安装器.vbs'
$serverJs = Join-Path $dest 'server.js'
Set-Content $vbs -Encoding Unicode -Value "CreateObject(""WScript.Shell"").Run """"""$node"""" """"$serverJs"""""", 0, False"
# 用 shortcut.ps1（IShellLinkW）建图标：WScript.Shell 在非中文系统上存不了中文名字
$desk = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $dest 'web\icon.ico'
if (-not (Test-Path $ico)) { $ico = '' }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'shortcut.ps1') (Join-Path $desk '恶雌模拟器安装器.lnk') "$env:WINDIR\System32\wscript.exe" "`"$vbs`"" $Home2 $ico
Write-Host '  桌面上多了「恶雌模拟器安装器」'

Write-Host ''
Write-Host '好了！现在帮你打开安装器（浏览器里），之后的事都在那里点。' -ForegroundColor Green
Start-Process wscript.exe "`"$vbs`""
# 装好了：这个黑窗口用不着了，倒数 5 秒自己关（是从 cmd 里跑的，就连 cmd 一起关）
Write-Host ''
for ($n = 5; $n -gt 0; $n--) { Write-Host "`r  这个窗口 $n 秒后自动关掉  " -NoNewline; Start-Sleep 1 }
try {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" | ForEach-Object { Get-Process -Id $_.ParentProcessId -ErrorAction Stop }
  if ($parent.ProcessName -eq 'cmd') { Stop-Process -Id $parent.Id -Force }
} catch {}
[Environment]::Exit(0)
