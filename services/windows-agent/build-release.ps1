# 易支付 Windows Agent 发布打包脚本：只发布监控运行文件，不携带用户配置。
param(
  [ValidatePattern('^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')]
  [string]$Version = (([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json).version),
  [switch]$ScriptsOnly
)

$ErrorActionPreference = 'Stop'
$clock = [Diagnostics.Stopwatch]::StartNew()
$ROOT = $PSScriptRoot
$PROJECT_ROOT = [IO.Path]::GetFullPath((Join-Path $ROOT '..\..'))
$RELEASE_DIR = Join-Path $ROOT 'release'
$BUNDLES_DIR = Join-Path $PROJECT_ROOT 'apps\api\script-bundles'
$UTF8 = [Text.UTF8Encoding]::new($false)
$STAGE_DIR = Join-Path $env:TEMP ('epay-agent-release-' + [guid]::NewGuid().ToString('N'))
$BUILD_DIST = Join-Path $STAGE_DIR 'build'
$AGENT_DIR = Join-Path $STAGE_DIR 'epay-agent'
$AGENT_DIST = Join-Path $AGENT_DIR 'dist'
$NODE_DIR = Join-Path $AGENT_DIR 'node'
$RUNTIME_FILES = @('main.js', 'runner.js', 'central.js', 'adspower.js', 'cdp.js', 'contracts.js', 'agent-client.js', 'agent-runtime.js', 'outbox.js')
$BROWSER_FILES = @('adspower-browser.js', 'adspower-request.js', 'monitoring-log.js', 'app-id-parser.js', 'alipay-session.js', 'login-flow.js', 'captcha-handler.js', 'captcha-solver.js', 'post-login-inspection.js', 'transfer.js')

function Write-Utf8File([string]$Path, [string]$Content) {
  $text = $Content -replace "`r?`n", "`r`n"
  Write-Host ('[write] ' + $Path + ': ' + ($text -split "`r`n")[0])
  [IO.File]::WriteAllBytes($Path, $UTF8.GetBytes($text))
}

function Publish-AtomicFile([string]$Pending, [string]$Destination) {
  # 待发布文件与目标位于同一目录，替换期间不暴露半写入文件。
  if ([IO.File]::Exists($Destination)) {
    [IO.File]::Replace($Pending, $Destination, [NullString]::Value)
  } else {
    [IO.File]::Move($Pending, $Destination)
  }
}

function Compare-ScriptVersion([string]$Left, [string]$Right) {
  $a = @(($Left -split '[+]', 2)[0] -split '-', 2)
  $b = @(($Right -split '[+]', 2)[0] -split '-', 2)
  $core = ([version]$a[0]).CompareTo([version]$b[0])
  if ($core -ne 0) { return $core }
  if ($a.Count -eq 1 -and $b.Count -eq 1) { return 0 }
  if ($a.Count -eq 1) { return 1 }
  if ($b.Count -eq 1) { return -1 }
  $aa = $a[1].Split('.')
  $bb = $b[1].Split('.')
  for ($i = 0; $i -lt [Math]::Min($aa.Count, $bb.Count); $i++) {
    $an = $aa[$i] -match '^[0-9]+$'
    $bn = $bb[$i] -match '^[0-9]+$'
    if ($an -and $bn) { $order = ([bigint]$aa[$i]).CompareTo([bigint]$bb[$i]) }
    elseif ($an) { $order = -1 }
    elseif ($bn) { $order = 1 }
    else { $order = [string]::CompareOrdinal($aa[$i], $bb[$i]) }
    if ($order -ne 0) { return $order }
  }
  return $aa.Count.CompareTo($bb.Count)
}

$releaseLock = $null
$pendingBundle = $null
$pendingVersion = $null
try {
  # 串行发布，避免并发替换包或互相清理临时文件。
  $lockDir = Join-Path $PROJECT_ROOT '.runtime'
  New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
  $releaseLock = [IO.File]::Open((Join-Path $lockDir 'windows-agent-release.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $packageVersion = ([IO.File]::ReadAllText((Join-Path $ROOT 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json).version
  $runtimeSource = [IO.File]::ReadAllText((Join-Path $ROOT 'src/agent-runtime.ts'), [Text.Encoding]::UTF8)
  $runtimeVersion = [regex]::Match($runtimeSource, "SCRIPT_VERSION[ ]*=[ ]*'windows-agent-([^']+)'").Groups[1].Value
  if ($Version -cne $packageVersion -or $Version -cne $runtimeVersion) { throw '请先同步 package.json、SCRIPT_VERSION 与发布版本' }
  $currentMetadata = Join-Path $BUNDLES_DIR 'version.json'
  if (Test-Path -LiteralPath $currentMetadata -PathType Leaf) {
    $currentVersion = ([IO.File]::ReadAllText($currentMetadata, [Text.Encoding]::UTF8) | ConvertFrom-Json).version
    if ((Compare-ScriptVersion $Version $currentVersion) -le 0) { throw ('发布版本必须高于中心版本：' + $currentVersion) }
  }
  New-Item -ItemType Directory -Path $AGENT_DIST, $BUILD_DIST, $NODE_DIR, $RELEASE_DIR, $BUNDLES_DIR -Force | Out-Null
  Write-Host '[1/5] 编译监控运行文件...'
  Push-Location $ROOT
  try {
    & node (Join-Path $ROOT 'node_modules\typescript\bin\tsc') -p tsconfig.json --outDir $BUILD_DIST --noEmitOnError
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript 编译失败' }
  } finally {
    Pop-Location
  }

  Write-Host '[2/5] 收集本次编译产物并生成清单...'
  # 只收集本次干净编译的运行文件。
  foreach ($name in $RUNTIME_FILES) {
    $file = Join-Path $BUILD_DIST $name
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw ('缺少监控文件：' + $file) }
    Copy-Item -LiteralPath $file -Destination (Join-Path $AGENT_DIST $name)
  }
  $BROWSER_DIST = Join-Path $BUILD_DIST 'browser'
  $AGENT_BROWSER = Join-Path $AGENT_DIST 'browser'
  New-Item -ItemType Directory -Path $AGENT_BROWSER -Force | Out-Null
  foreach ($name in $BROWSER_FILES) {
    $file = Join-Path $BROWSER_DIST $name
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw ('缺少浏览器模块文件：' + $file) }
    Copy-Item -LiteralPath $file -Destination (Join-Path $AGENT_BROWSER $name)
  }
  Write-Utf8File (Join-Path $AGENT_DIST 'script-version.txt') ($Version + "`r`n")
  # 将启动器也放入脚本包，支持热更新
  Copy-Item -LiteralPath (Join-Path $ROOT 'launcher.cjs') -Destination (Join-Path $AGENT_DIST 'launcher.cjs')
  $fileHashes = [ordered]@{}
  foreach ($name in $RUNTIME_FILES) {
    $fileHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $AGENT_DIST $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  foreach ($name in $BROWSER_FILES) {
    $fileHashes['browser/' + $name] = (Get-FileHash -LiteralPath (Join-Path $AGENT_BROWSER $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $fileHashes['launcher.cjs'] = (Get-FileHash -LiteralPath (Join-Path $AGENT_DIST 'launcher.cjs') -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = [ordered]@{ version = $Version; files = $fileHashes } | ConvertTo-Json -Depth 3
  Write-Utf8File (Join-Path $AGENT_DIST 'script-manifest.json') ($manifest + "`r`n")
  if (!$ScriptsOnly) {
  Copy-Item -LiteralPath (Join-Path $ROOT 'launcher.cjs') -Destination (Join-Path $AGENT_DIR 'launcher.cjs')
  Copy-Item -LiteralPath (Join-Path $ROOT 'start-agent.bat') -Destination (Join-Path $AGENT_DIR '启动Agent.bat')

  Write-Host '[完整包] 复用便携版 Node.js...'
  $portableNode = @(
    (Join-Path $ROOT 'release\epay-agent\node\node.exe'),
    (Join-Path $ROOT 'release\stage\epay-agent\node\node.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (!$portableNode) { throw '未找到便携版 Node.js，请先将 Node.js 22 的 node.exe 放入 release\epay-agent\node。' }
  Copy-Item -LiteralPath $portableNode -Destination (Join-Path $NODE_DIR 'node.exe')
  Get-ChildItem -LiteralPath (Split-Path $portableNode) -File |
    Where-Object { $_.Extension -eq '.dll' -or $_.Name -like 'icudt*.dat' } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $NODE_DIR $_.Name) }

  Write-Host '[完整包] 写入无凭据配置模板...'
  $template = @"
# 易支付 Windows Agent 配置模板：首次启动会在配置不存在时复制为 .env。
# 填写可访问中心 API 的地址。通过 HTTPS 反向代理部署时填写管理后台同域地址，可带 /v1。
CENTRAL_API_URL=https://your-server/v1
COLLECTOR_ID=your-collector-id
COLLECTOR_TOKEN=your-collector-token
ADSPOWER_ENDPOINT=http://localhost:50325
ADSPOWER_API_KEY=your-adspower-api-key
# 环境同步间隔已改为在中心「脚本设置」页配置（环境同步时间，单位分钟，默认 30），此处无需设置。
"@
  Write-Utf8File (Join-Path $AGENT_DIR '.env.example') ($template + "`r`n")
  $package = [ordered]@{ name = 'epay-windows-agent'; version = $Version; type = 'module'; private = $true; dependencies = [ordered]@{ 'playwright-core' = '1.65.0' } } | ConvertTo-Json -Depth 3
  Write-Utf8File (Join-Path $AGENT_DIR 'package.json') ($package + "`r`n")
  $readme = @"
易支付 Windows Agent v$Version

首次使用：双击启动Agent.bat，按提示编辑首次生成的 .env，再重新启动。
覆盖升级：关闭旧 Agent，将新文件覆盖到原目录，保留原有 .env，再启动。
启动器使用 Node.js 加载配置，不在 CMD 中解析或回显凭据。
完整包不包含 .env，不会覆盖已有配置。
热更新包包含监控运行文件和启动器，不包含 Node.js、依赖或配置文件。
环境列表默认每 30 分钟自动同步，可在中心「脚本设置」页的“环境同步时间（分）”调整，修改后自动生效。
后台需部署与本版本匹配的运行配置、账号列表和心跳接口。
"@
  Write-Utf8File (Join-Path $AGENT_DIR 'README.txt') ($readme + "`r`n")

  Write-Host '[完整包] 复制已安装的生产依赖（playwright-core）...'
  $playwrightSource = (& node -e "const path=require('node:path');console.log(path.dirname(require.resolve('playwright-core/package.json',{paths:[process.argv[1]]})))" $ROOT).Trim()
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $playwrightSource -PathType Container)) { throw '未找到已安装的 playwright-core，请先安装项目依赖。' }
  $productionModules = Join-Path $AGENT_DIR 'node_modules'
  New-Item -ItemType Directory -Path $productionModules -Force | Out-Null
  Copy-Item -LiteralPath $playwrightSource -Destination (Join-Path $productionModules 'playwright-core') -Recurse

  Write-Host '[完整包] 生成完整包与覆盖修复包...'
  $fullPending = Join-Path $STAGE_DIR 'complete.zip'
  Compress-Archive -LiteralPath $AGENT_DIR -DestinationPath $fullPending -CompressionLevel Optimal
  $ZIP_PATH = Join-Path $RELEASE_DIR ('epay-agent-win-x64-v' + $Version + '.zip')
  Move-Item -LiteralPath $fullPending -Destination $ZIP_PATH -Force
  # 通配目录内全部 dist 文件（含 browser/ 子目录），launcher 校验时按 browser/xxx 路径查找。

  # 覆盖修复包不含 Node 和 .env，保留采集机原配置与便携运行时。
  $REPAIR_DIR = Join-Path $STAGE_DIR 'repair\epay-agent'
  New-Item -ItemType Directory -Path $REPAIR_DIR -Force | Out-Null
  foreach ($name in @('dist', 'launcher.cjs', '启动Agent.bat', 'package.json', '.env.example', 'README.txt', 'node_modules')) {
    Copy-Item -LiteralPath (Join-Path $AGENT_DIR $name) -Destination (Join-Path $REPAIR_DIR $name) -Recurse
  }
  $REPAIR_ZIP = Join-Path $RELEASE_DIR ('epay-agent-repair-v' + $Version + '.zip')
  Compress-Archive -LiteralPath $REPAIR_DIR -DestinationPath $REPAIR_ZIP -CompressionLevel Optimal -Force
  }
  if (!$ScriptsOnly) {
    $installers = Join-Path $BUNDLES_DIR 'installers'
    New-Item -ItemType Directory -Path $installers -Force | Out-Null
    foreach ($asset in @(@($ZIP_PATH, 'windows-agent.zip'), @($REPAIR_ZIP, 'windows-agent-repair.zip'))) {
      $pending = Join-Path $installers ($asset[1] + '.pending')
      Copy-Item -LiteralPath $asset[0] -Destination $pending -Force
      Publish-AtomicFile $pending (Join-Path $installers $asset[1])
    }
    Write-Utf8File (Join-Path $installers 'version.txt') $Version
  }
  $pendingBundle = Join-Path $BUNDLES_DIR ('.bundle-' + [guid]::NewGuid().ToString('N') + '.zip')
  # 从暂存 dist 目录整体打包，保留 browser/ 子目录路径。
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($AGENT_DIST, $pendingBundle, [IO.Compression.CompressionLevel]::Optimal, $false)
  Write-Host '[3/5] 执行一次内置包检查...'
  & (Join-Path $ROOT 'scripts\verify-script-bundle.ps1') -BundlePath $pendingBundle -Version $Version
  $hash = (Get-FileHash -LiteralPath $pendingBundle -Algorithm SHA256).Hash.ToLowerInvariant()

  # 替换前准备好配对文件，先发布包，最后发布无 BOM 的元数据。
  $metadata = [ordered]@{ version = $Version; minCenterVersion = '1.0.0'; bundleHash = $hash; releasedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
  $pendingVersion = Join-Path $BUNDLES_DIR ('.version-' + [guid]::NewGuid().ToString('N') + '.json')
  Write-Utf8File $pendingVersion ($metadata + "`r`n")
  Write-Host '[4/5] 发布本机中心脚本包和版本元数据...'
  Publish-AtomicFile $pendingBundle (Join-Path $BUNDLES_DIR 'bundle.zip')
  $pendingBundle = $null
  Publish-AtomicFile $pendingVersion (Join-Path $BUNDLES_DIR 'version.json')
  $pendingVersion = $null

  Write-Host '[5/5] 清理旧版本包和构建残留...'
  $removed = 0
  Get-ChildItem -LiteralPath $RELEASE_DIR -File | ForEach-Object {
    if ($_.Name -match '^epay-agent-(?:win-x64|repair)-v([0-9A-Za-z.+-]+)[.]zip$' -and $Matches[1] -cne $Version) {
      Remove-Item -LiteralPath $_.FullName -Force
      $removed++
    }
  }
  Get-ChildItem -LiteralPath $BUNDLES_DIR -File | Where-Object { $_.Name -match '^[.](?:bundle-[0-9A-Za-z-]+[.]zip|version-[0-9A-Za-z-]+[.]json)$' } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removed++
  }
  foreach ($relative in @('dist/captcha.js', 'dist/login.js', 'dist/task-runner.js', 'dist/browser/monitoring-tabs.js')) {
    $obsolete = Join-Path $ROOT $relative
    if (Test-Path -LiteralPath $obsolete -PathType Leaf) { Remove-Item -LiteralPath $obsolete -Force; $removed++ }
  }
  if (!$ScriptsOnly) { Write-Output ('完整包：' + $ZIP_PATH); Write-Output ('覆盖修复包：' + $REPAIR_ZIP) }
  Write-Output ('热更新包：' + (Join-Path $BUNDLES_DIR 'bundle.zip'))
  Write-Output ('版本：' + $Version + ' SHA256=' + $hash)
} finally {
  try {
  # 无论成功失败，都清理本次独立暂存目录和未发布文件。
  foreach ($pending in @($pendingBundle, $pendingVersion)) {
    if ($pending -and (Test-Path -LiteralPath $pending -PathType Leaf)) {
      $resolved = [IO.Path]::GetFullPath($pending)
      $allowed = [IO.Path]::GetFullPath($BUNDLES_DIR).TrimEnd('\') + '\'
      if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw '拒绝清理非发布目录临时文件' }
      Remove-Item -LiteralPath $resolved -Force
    }
  }
  if (Test-Path -LiteralPath $STAGE_DIR) {
    $resolvedStage = [IO.Path]::GetFullPath($STAGE_DIR)
    $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if (!$resolvedStage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedStage -Leaf) -notmatch '^epay-agent-release-[0-9a-f]{32}$') {
      throw '拒绝清理未确认的暂存目录'
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
  } finally {
    if ($releaseLock) { $releaseLock.Dispose() }
  }
}
$clock.Stop()
Write-Output ('RELEASE_OK version=' + $Version + ' SHA256=' + $hash + ' cleaned=' + $removed + ' elapsedSeconds=' + $clock.Elapsed.TotalSeconds.ToString('F2', [Globalization.CultureInfo]::InvariantCulture))
