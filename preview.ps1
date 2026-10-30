# preview.ps1 - local preview server for bible (no install needed)
# Usage:  .\preview.ps1   -> http://localhost:8765/
# Stop:   Ctrl+C or close the window

param([int]$Port = 8765)
$root = (Resolve-Path $PSScriptRoot).Path
$prefix = "http://localhost:$Port/"
$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
  ".json"="application/json; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".ico"="image/x-icon";
  ".webmanifest"="application/manifest+json"
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Preview running: ${prefix}  (Ctrl+C to stop)" -ForegroundColor Green
try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(300)) { }   # lets Ctrl+C work
    $ctx = $task.GetAwaiter().GetResult()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq "") { $rel = "index.html" }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $res = $ctx.Response
    $res.Headers.Add("Cache-Control", "no-store")
    try {
      if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = "application/octet-stream" }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    } catch { }
    $res.Close()
  }
} finally { $listener.Stop() }
