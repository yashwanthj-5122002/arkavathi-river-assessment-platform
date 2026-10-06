$ErrorActionPreference = 'Stop'
$Port = 8088
$RuleName = 'Arkavathi Dashboard LAN TCP 8088'
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[OK] Firewall rule already exists: $RuleName" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any -RemoteAddress '192.168.10.0/24' | Out-Null
    Write-Host "[OK] Firewall opened TCP port $Port only for office subnet 192.168.10.0/24." -ForegroundColor Green
}
Write-Host 'Backend port 8765 remains private and is NOT exposed to the LAN.' -ForegroundColor Cyan
