param([string]$LocalMockUrl = '')
$ErrorActionPreference = 'Stop'
$url = 'https://reading-prereading-experiment.patrick020308.workers.dev/recommend'
if ($LocalMockUrl) {
    if ($LocalMockUrl -notmatch '^http://127\.0\.0\.1:[0-9]{1,5}/recommend$') { Write-Host 'Invalid mock URL.'; exit 1 }
    $url = $LocalMockUrl
    Write-Host 'LOCAL MOCK ONLY - use a fictional token, never a real secret.'
}
$secure = Read-Host 'ACCESS_TOKEN (hidden)' -AsSecureString
$ptr = [IntPtr]::Zero
$token = $null
try {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'No token entered.'; exit 1 }
    try {
        $response = Invoke-WebRequest -Uri $url -Method Post -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
    } catch {
        Write-Host 'Request failed or timed out. Do not retry: the one call may have been consumed.'
        exit 1
    }
    if ($response.StatusCode -ne 200) { Write-Host 'Unexpected HTTP status. Do not retry.'; exit 1 }
    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
        $data = $utf8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
    } catch { Write-Host 'Invalid response. Do not retry.'; exit 1 }
    if ($data.kind -ne 'experiment' -or $null -eq $data.recommendation -or $null -eq $data.usage) { Write-Host 'Unexpected response. Do not retry.'; exit 1 }
    Write-Host 'PRIVATE RESULT (do not share screenshots or logs):'
    Write-Host ($data.recommendation | ConvertTo-Json -Depth 5)
    Write-Host 'TOKEN USAGE:'
    Write-Host ($data.usage | ConvertTo-Json -Depth 3)
} finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $token = $null
    $secure.Dispose()
    Write-Host 'Return to Cloudflare now and set EXPERIMENT_ENABLED=false; verify deployed version.'
}
