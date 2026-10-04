<# Beendet SEO-Agent und laya-serve (Ollama bleibt, falls andere Programme es nutzen; mit -All auch Ollama). #>
param([switch]$All)
$ports = @(4310, 8000); if ($All) { $ports += 11434 }
foreach ($p in $ports) {
  Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; "Port $p beendet (PID $($_.OwningProcess))" }
}
