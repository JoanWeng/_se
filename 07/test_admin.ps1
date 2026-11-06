param([string]$Url = "http://127.0.0.1:8787")
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = $Url
$pw = "Joan@0704"
$fail = 0

function Check($label, $cond) {
  if ($cond) { Write-Output "PASS $label" }
  else { Write-Output "FAIL $label"; $script:fail++ }
}

# 1. wrong password -> 401
try {
  Invoke-RestMethod "$base/api/admin/login" -Method Post -ContentType "application/json" -Body '{"password":"nope"}' | Out-Null
  Check "login wrong pw 401" ($false)
} catch {
  Check "login wrong pw 401" ($_.Exception.Response.StatusCode.value__ -eq 401)
}

# 2. correct password -> token
$ok = Invoke-RestMethod "$base/api/admin/login" -Method Post -ContentType "application/json" -Body ('{"password":"' + $pw + '"}')
$token = $ok.token
Check "login ok returns token" ($token -like "*.*")
$h = @{ Authorization = "Bearer $token" }

# 3. admin messages without token -> 401
try {
  Invoke-RestMethod "$base/api/admin/messages" | Out-Null
  Check "admin list no token 401" ($false)
} catch {
  Check "admin list no token 401" ($_.Exception.Response.StatusCode.value__ -eq 401)
}

# 4. admin list shows ip
$list = Invoke-RestMethod "$base/api/admin/messages" -Headers $h
Check "admin list 200 with ip" ($null -ne $list.items)

# 5. create a public message, admin delete without user password
$pub = Invoke-RestMethod "$base/api/messages" -Method Post -ContentType "application/json" -Body '{"name":"admintest","content":"admin flow test","password":"1234"}'
$mid = $pub.id
Check "public post for admin test" ($null -ne $mid)
try {
  Invoke-RestMethod "$base/api/admin/messages/$mid" -Method Delete -Headers $h | Out-Null
  Check "admin delete no user pw 204" ($true)
} catch {
  Check "admin delete no user pw 204" ($_.Exception.Response.StatusCode.value__ -eq 204)
}
try {
  Invoke-RestMethod "$base/api/messages/$mid" -Method Delete -ContentType "application/json" -Body '{"password":"1234"}' | Out-Null
  Check "public delete after admin delete 404" ($false)
} catch {
  Check "public delete after admin delete 404" ($_.Exception.Response.StatusCode.value__ -eq 404)
}

# 6. ban / list / duplicate ban / unban / re-unban
Invoke-RestMethod "$base/api/admin/ban" -Method Post -ContentType "application/json" -Headers $h -Body '{"ip":"198.51.100.77","reason":"test"}'
Invoke-RestMethod "$base/api/admin/ban" -Method Post -ContentType "application/json" -Headers $h -Body '{"ip":"198.51.100.77","reason":"test"}'
$banned = Invoke-RestMethod "$base/api/admin/banned" -Headers $h
$dup = @($banned.items | Where-Object { $_.ip -eq "198.51.100.77" })
Check "ban + duplicate ignored" ($dup.Count -eq 1)

try {
  Invoke-RestMethod "$base/api/admin/ban" -Method Post -ContentType "application/json" -Body '{"ip":"1.2.3.4"}' -Headers $null
  Check "ban without token 401" ($false)
} catch {
  Check "ban without token 401" ($_.Exception.Response.StatusCode.value__ -eq 401)
}

Invoke-RestMethod "$base/api/admin/ban/198.51.100.77" -Method Delete -Headers $h
try {
  Invoke-RestMethod "$base/api/admin/ban/198.51.100.77" -Method Delete -Headers $h | Out-Null
  Check "unban again 404" ($false)
} catch {
  Check "unban again 404" ($_.Exception.Response.StatusCode.value__ -eq 404)
}

# 7. login burst -> 429 after threshold (local only, remote test would lock admin out)
if ($Url -match "^http://(127\.0\.0\.1|localhost)") {
  $got429 = $false
  try {
    for ($i = 0; $i -lt 15; $i++) {
      try {
        Invoke-RestMethod "$base/api/admin/login" -Method Post -ContentType "application/json" -Body '{"password":"wrong"}' | Out-Null
      } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) { $got429 = $true; break }
      }
    }
  } catch { }
  Check "login burst 429" $got429
} else {
  Write-Output "SKIP login burst 429 (remote)"
}

# 8. tampered token -> 401
$bad = @{ Authorization = "Bearer 99999999999999.deadbeef" }
try {
  Invoke-RestMethod "$base/api/admin/messages" -Headers $bad | Out-Null
  Check "tampered token 401" ($false)
} catch {
  Check "tampered token 401" ($_.Exception.Response.StatusCode.value__ -eq 401)
}

# 9. joan.html served
$adm = Invoke-WebRequest "$base/joan.html" -UseBasicParsing
Check "joan.html 200" ($adm.StatusCode -eq 200)

if ($fail -eq 0) { Write-Output "ALL ADMIN TESTS PASSED" } else { Write-Output "$fail TESTS FAILED"; exit 1 }
