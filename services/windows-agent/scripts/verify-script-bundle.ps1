# 校验真实脚本更新包，拒绝整包内容、版本漂移和文件哈希不一致。
param(
  [Parameter(Mandatory = $true)][string]$BundlePath,
  [Parameter(Mandatory = $true)][string]$Version
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($BundlePath))
function Read-ZipText($Entry) {
  $reader = [IO.StreamReader]::new($Entry.Open(), [Text.Encoding]::UTF8)
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
  $entries = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if (!$name.EndsWith('/')) { $entries.Add($name, $entry) }
  }
  foreach ($name in @('main.js', 'agent-runtime.js', 'browser/adspower-browser.js', 'script-version.txt', 'script-manifest.json')) {
    if (!$entries.ContainsKey($name)) { throw ('脚本包根目录缺少：' + $name) }
  }
  $manifest = (Read-ZipText $entries['script-manifest.json']) | ConvertFrom-Json
  $marker = (Read-ZipText $entries['script-version.txt']).Trim()
  if ($manifest.version -ne $Version -or $marker -ne $Version) { throw '脚本包版本与发布版本不一致' }
  $allowed = @('script-version.txt', 'script-manifest.json') + @($manifest.files.PSObject.Properties.Name)
  foreach ($name in $entries.Keys) {
    if ($name -notin $allowed -or ($name -notin @('script-version.txt', 'script-manifest.json') -and $name -notmatch '^(?:(?:browser/)?[A-Za-z0-9_-]+\.js|launcher\.cjs)$')) {
      throw ('脚本包混入非脚本文件：' + $name)
    }
  }
  foreach ($property in $manifest.files.PSObject.Properties) {
    if (!$entries.ContainsKey($property.Name)) { throw ('清单文件缺失：' + $property.Name) }
    $stream = $entries[$property.Name].Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -cne $property.Value) { throw ('脚本哈希不一致：' + $property.Name) }
  }
  if (!(Read-ZipText $entries['agent-runtime.js']).Contains('windows-agent-' + $Version)) { throw '运行时上报版本与发布版本不一致' }
  Write-Output ('SCRIPT_BUNDLE_OK version=' + $Version + ' files=' + $entries.Count + ' bytes=' + (Get-Item -LiteralPath $BundlePath).Length)
} finally { $zip.Dispose() }
