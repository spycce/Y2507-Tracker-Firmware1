$nat = New-Object -ComObject HNetCfg.NATUPnP
if ($nat.StaticPortMappingCollection) {
    try {
        $nat.StaticPortMappingCollection.Add(5023, "TCP", 5023, "192.168.1.18", $true, "AeroTrack")
        Write-Host "UPnP SUCCESS: Port 5023 mapped on router!"
    } catch {
        Write-Host "UPnP Error: " $_.Exception.Message
    }
} else {
    Write-Host "UPnP is disabled or not supported on this router."
}
