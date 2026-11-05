# 恶雌模拟器 · 一键安装器
# 用法（cmd 里，或者 Win + R 的「运行」框里，粘贴这一行回车）：
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.ps1 | iex"
# 做的事：准备好 Node.js（没有就下一个免安装版），只下载安装器那几个文件放到 %LOCALAPPDATA%\EciSimulator，
# 桌面放一个「恶雌模拟器安装器」图标，然后打开它。不需要管理员权限。每一步都显示进度。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # PowerShell 自带的进度条会让下载慢很多倍；进度用下面自己画的
$Repo = 'mxxs109-ops/eci-simulator'
$Branch = 'main'
$Home2 = Join-Path $env:LOCALAPPDATA 'EciSimulator'
New-Item -ItemType Directory -Force $Home2 | Out-Null
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Step($n, $text) { Write-Host ''; Write-Host "[$n/3] $text" -ForegroundColor Magenta }
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
    $zipName = ($sums -split "`n" | Where-Object { $_ -match 'win-x64\.zip$' } | Select-Object -First 1).Split(' ')[-1].Trim()
    $zip = Join-Path $env:TEMP $zipName
    Fetch "https://nodejs.org/dist/latest-v22.x/$zipName" $zip
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
