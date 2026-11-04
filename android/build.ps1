# 编译手机 App（不用 Gradle，直接用 Android SDK 里的工具）
# 要：Android SDK（build-tools 34 以上、platforms/android-34）、JDK 17+（Android Studio 自带的 jbr 就行）
# 用法：powershell -ExecutionPolicy Bypass -File android\build.ps1
# 签名用的 keystore 不进仓库：默认 %USERPROFILE%\.android\eci-release.jks，第一次会自动生成
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$bt = Get-ChildItem "$sdk\build-tools" | Sort-Object { [version]($_.Name -replace '[^\d.]', '') } | Select-Object -Last 1
$jar = "$sdk\platforms\android-34\android.jar"
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$out = Join-Path $here 'build'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\res", "$out\gen", "$out\classes", "$out\dex" | Out-Null
$src = Join-Path $here 'src\main'

& "$($bt.FullName)\aapt2.exe" compile --dir "$src\res" -o "$out\res.zip"
& "$($bt.FullName)\aapt2.exe" link -o "$out\base.apk" -I $jar --manifest "$src\AndroidManifest.xml" -A "$src\assets" --java "$out\gen" "$out\res.zip" --auto-add-overlay
if ($LASTEXITCODE) { throw 'aapt2 link 失败' }

$java = Get-ChildItem "$src\java", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName
& "$jdk\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -nowarn -bootclasspath $jar -classpath $jar -d "$out\classes" $java
if ($LASTEXITCODE) { throw 'javac 失败' }
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
$env:JAVA_HOME = $jdk
& "$($bt.FullName)\d8.bat" --min-api 24 --lib $jar --output "$out\dex" $classes
if ($LASTEXITCODE) { throw 'd8 失败' }

# 把 classes.dex 放进 apk
Copy-Item "$out\base.apk" "$out\unsigned.apk"
Push-Location "$out\dex"; & "$jdk\bin\jar.exe" uf "$out\unsigned.apk" classes.dex; Pop-Location
& "$($bt.FullName)\zipalign.exe" -f -p 4 "$out\unsigned.apk" "$out\aligned.apk"

$ks = if ($env:ECI_KEYSTORE) { $env:ECI_KEYSTORE } else { "$env:USERPROFILE\.android\eci-release.jks" }
$pw = if ($env:ECI_KEYPASS) { $env:ECI_KEYPASS } else { 'eci-simulator' }
if (-not (Test-Path $ks)) {
  & "$jdk\bin\keytool.exe" -genkeypair -keystore $ks -alias eci -keyalg RSA -keysize 2048 -validity 10000 -storepass $pw -keypass $pw -dname 'CN=eci-simulator'
}
& "$($bt.FullName)\apksigner.bat" sign --ks $ks --ks-pass "pass:$pw" --key-pass "pass:$pw" --out "$here\eci-simulator.apk" "$out\aligned.apk"
if ($LASTEXITCODE) { throw '签名失败' }
& "$($bt.FullName)\apksigner.bat" verify "$here\eci-simulator.apk"
Write-Host ('好了：' + "$here\eci-simulator.apk" + '（' + [math]::Round((Get-Item "$here\eci-simulator.apk").Length / 1KB) + ' KB）')
