# 从已确认版本的同次本机构建发布 GitHub 附件，复用固定发布入口。
param([Parameter(Mandatory)][string]$SourceCommit, [Parameter(Mandatory)][string]$Repository)
$ErrorActionPreference = 'Stop'
$repo = $Repository
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$agent = Join-Path $root 'services/windows-agent'
$version = (Get-Content (Join-Path $agent 'package.json') -Raw | ConvertFrom-Json).version
$tag = "agent-v$version"
$bundle = Join-Path $root 'apps/api/script-bundles'
$meta = Join-Path $bundle 'version.json'
$stage = Join-Path ([IO.Path]::GetTempPath()) ('epay-public-' + [guid]::NewGuid().ToString('N'))
function Invoke-Gh([string[]]$Arguments) {
  & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'GitHub 操作失败' }
}
# 源码同步并推送版本标签后才允许创建发布。
$remoteCommit = (Invoke-Gh @('api',"repos/$repo/commits/$tag",'--jq','.sha')).Trim()
if ($SourceCommit -cne $remoteCommit) { throw '已推送的标签与发布源码提交不一致' }
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $full = Join-Path $agent "release/epay-agent-win-x64-v$version.zip"
  $repair = Join-Path $agent "release/epay-agent-repair-v$version.zip"
  $published = if (Test-Path $meta) { (Get-Content $meta -Raw | ConvertFrom-Json).version }
  if ($published -ne $version) {
    & (Join-Path $agent 'build-release.ps1')
    if (!$? -or $LASTEXITCODE -ne 0) { throw '本机 Agent 发布失败' }
  }
  Copy-Item -LiteralPath $full -Destination (Join-Path $stage 'windows-agent.zip')
  Copy-Item -LiteralPath $repair -Destination (Join-Path $stage 'windows-agent-repair.zip')
  $files = @((Join-Path $stage 'windows-agent.zip'), (Join-Path $stage 'windows-agent-repair.zip'), $meta, (Join-Path $bundle 'bundle.zip'))
  foreach ($file in $files) { if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少发布附件 $file" } }
  $notesFile = Join-Path $root "infra/deploy/release-notes/$tag.md"
  Invoke-Gh (@('release','create',$tag,'--repo',$repo,'--verify-tag','--latest=false','--notes-file',$notesFile,'--title',$tag) + $files)
} finally {
  $target = [IO.Path]::GetFullPath($stage)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($target.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($target) -match '^epay-public-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}
