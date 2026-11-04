# 恶雌模拟器 · 一键安装器
# 用法（在 PowerShell 里粘贴这一行回车）：
#   irm https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.ps1 | iex
# 做的事：准备好 Node.js（没有就下一个免安装版），把安装器放到 %LOCALAPPDATA%\EciSimulator，
# 桌面放一个「恶雌模拟器安装器」图标，然后打开它。不需要管理员权限。
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'mxxs109-ops/eci-simulator'
$Home2 = Join-Path $env:LOCALAPPDATA 'EciSimulator'
New-Item -ItemType Directory -Force $Home2 | Out-Null
Write-Host '恶雌模拟器安装器：准备中…' -ForegroundColor Magenta

# 1. Node.js：电脑上有 18 以上就用，没有就下一个免安装版（只放在安装器文件夹里）
$node = $null
try { $v = (& node -v) 2>$null; if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 18) { $node = (Get-Command node).Source } } catch {}
if (-not $node) {
  $local = Join-Path $Home2 'node\node.exe'
  if (-not (Test-Path $local)) {
    Write-Host '下载 Node.js（约 30MB）…'
    $sums = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -UseBasicParsing).Content
    $zipName = ($sums -split "`n" | Where-Object { $_ -match 'win-x64\.zip$' } | Select-Object -First 1).Split(' ')[-1].Trim()
    $zip = Join-Path $env:TEMP $zipName
    Invoke-WebRequest "https://nodejs.org/dist/latest-v22.x/$zipName" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $Home2 -Force
    Remove-Item $zip
    Rename-Item (Join-Path $Home2 ($zipName -replace '\.zip$', '')) 'node'
  }
  $node = $local
}

# 2. 安装器本身：从仓库下载 installer 文件夹
Write-Host '下载安装器…'
$zip = Join-Path $env:TEMP 'eci-simulator.zip'
Invoke-WebRequest "https://codeload.github.com/$Repo/zip/refs/heads/main" -OutFile $zip -UseBasicParsing
$tmp = Join-Path $env:TEMP 'eci-simulator-src'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
if (Test-Path (Join-Path $Home2 'installer')) { Remove-Item (Join-Path $Home2 'installer') -Recurse -Force }
Copy-Item (Join-Path $src.FullName 'installer') (Join-Path $Home2 'installer') -Recurse
Remove-Item $zip, $tmp -Recurse -Force

# 3. 桌面图标：用 wscript 隐藏黑窗口启动安装器
$vbs = Join-Path $Home2 '打开安装器.vbs'
$serverJs = Join-Path $Home2 'installer\server.js'
Set-Content $vbs -Encoding Unicode -Value "CreateObject(""WScript.Shell"").Run """"""$node"""" """"$serverJs"""""", 0, False"
# 用 shortcut.ps1（IShellLinkW）建图标：WScript.Shell 在非中文系统上存不了中文名字
$desk = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $Home2 'installer\web\icon.ico'
if (-not (Test-Path $ico)) { $ico = '' }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Home2 'installer\shortcut.ps1') (Join-Path $desk '恶雌模拟器安装器.lnk') "$env:WINDIR\System32\wscript.exe" "`"$vbs`"" $Home2 $ico

Write-Host '好了！桌面上多了「恶雌模拟器安装器」，现在帮你打开。' -ForegroundColor Green
Start-Process wscript.exe "`"$vbs`""
