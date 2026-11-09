# Interactive local verification only; never writes the token or response body.
$ErrorActionPreference = 'Stop'
$secure = Read-Host 'ACCESS_TOKEN (input hidden)' -AsSecureString
$pointer = [IntPtr]::Zero
$token = $null
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'No token entered.'; exit 1 }
    try {
        $result = Invoke-WebRequest -Uri 'https://reading-prereading-experiment.patrick020308.workers.dev/recommend' -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
        $status = [int]$result.StatusCode
    } catch {
        if ($null -eq $_.Exception.Response) { Write-Host 'Network or TLS error; no status confirmed.'; exit 1 }
        $status = [int]$_.Exception.Response.StatusCode
    }
    Write-Host "HTTP status: $status"
    if ($status -eq 503) { Write-Host 'Authenticated request is disabled (503).'; exit 0 }
    if ($status -eq 401) { Write-Host 'Authentication failed (401); registration or input is not confirmed.'; exit 1 }
    Write-Host 'Unexpected status; do not enable or retry automatically.'
    exit 1
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $token = $null
    $secure.Dispose()
}
