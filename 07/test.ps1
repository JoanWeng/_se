param([string]$Url = "http://127.0.0.1:8787")
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = $Url
$fail = 0

function Check($label, $cond) {
  if ($cond) { Write-Output "PASS $label" }
  else { Write-Output "FAIL $label"; $script:fail++ }
}

# 1. index.html served with 200
$index = Invoke-WebRequest "$base/" -UseBasicParsing
Check "index.html 200" ($index.StatusCode -eq 200)
Check "index.html content" ($index.Content -like '*/app.js*')

# 2. static assets
$css = Invoke-WebRequest "$base/style.css" -UseBasicParsing
Check "style.css 200" ($css.StatusCode -eq 200)
$js = Invoke-WebRequest "$base/app.js" -UseBasicParsing
Check "app.js 200" ($js.StatusCode -eq 200)

# 3. POST valid message (XSS payload stored as data)
$body = '{"name":"tester","content":"<script>alert(1)</script> hello guestbook","password":"1234"}'
try {
  $r = Invoke-RestMethod "$base/api/messages" -Method Post -ContentType "application/json" -Body $body
  $id = $r.id
  Check "POST 201 has id" ($null -ne $id)
} catch {
  $id = $null
  Check "POST 201 has id" ($false)
}

# 4. POST invalid (empty name)
try {
  Invoke-RestMethod "$base/api/messages" -Method Post -ContentType "application/json" -Body '{"name":"","content":"x","password":"1234"}' | Out-Null
  Check "POST invalid name 400" ($false)
} catch {
  Check "POST invalid name 400" ($_.Exception.Response.StatusCode.value__ -eq 400)
}

# 5. GET list shows message
$list = Invoke-RestMethod "$base/api/messages?page=1"
Check "GET list has message" ($list.items.Count -ge 1)
$m = $list.items | Where-Object { $_.id -eq $id }
Check "GET list message name" ($m.name -eq "tester")
Check "GET list xss stored raw" ($m.content -like "*<script>*")

# 6. DELETE wrong password -> 403
try {
  Invoke-RestMethod "$base/api/messages/$id" -Method Delete -ContentType "application/json" -Body '{"password":"9999"}' | Out-Null
  Check "DELETE wrong pw 403" ($false)
} catch {
  Check "DELETE wrong pw 403" ($_.Exception.Response.StatusCode.value__ -eq 403)
}

# 7. DELETE correct password -> 204
try {
  Invoke-RestMethod "$base/api/messages/$id" -Method Delete -ContentType "application/json" -Body '{"password":"1234"}' | Out-Null
  Check "DELETE correct pw 204" ($true)
} catch {
  Check "DELETE correct pw 204" ($_.Exception.Response.StatusCode.value__ -eq 204)
}

# 8. DELETE nonexistent -> 404
try {
  Invoke-RestMethod "$base/api/messages/999999" -Method Delete -ContentType "application/json" -Body '{"password":"1234"}' | Out-Null
  Check "DELETE nonexistent 404" ($false)
} catch {
  Check "DELETE nonexistent 404" ($_.Exception.Response.StatusCode.value__ -eq 404)
}

# 9. PASSWORD hash not leaked in list
Check "list has no password field" ($m.PSObject.Properties.Name -notcontains "password")

if ($fail -eq 0) { Write-Output "ALL TESTS PASSED" } else { Write-Output "$fail TESTS FAILED"; exit 1 }
