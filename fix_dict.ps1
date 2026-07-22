$content = Get-Content "backend\restaurant\templates\restaurant\dictionary.html" -Raw -Encoding UTF8

# 1. Elements
$old1 = "  var fmCatSaveBtn = document.getElementById('fmCatSaveBtn');"
$new1 = "  var fmCatSaveBtn = document.getElementById('fmCatSaveBtn');`r`n  var customUnitEl = document.getElementById('pdCustomUnit');`r`n  var customUnitGroup = document.getElementById('pdCustomUnitGroup');"
$content = $content.Replace($old1, $new1)

# 2. Custom Unit Toggle
$old2 = "  /* ═══ Init ═══ */"
$new2 = @"
  /* ═══ Custom Unit Toggle ═══ */
  unitEl.addEventListener('change', function() {
    if (this.value === 'custom') {
      customUnitGroup.style.display = '';
      customUnitEl.focus();
    } else {
      customUnitGroup.style.display = 'none';
      customUnitEl.value = '';
    }
  });

  /* ═══ Init ═══ */
"@
$content = $content.Replace($old2, $new2)

# 3. Save
$old3 = "    if (!unit) { unitEl.focus(); toast("
$new3 = @"
    if (unit === 'custom') {
      unit = customUnitEl.value.trim();
      if (!unit) { customUnitEl.focus(); toast('واحد سفارشی را وارد کنید', 'error'); return; }
    }
    if (!unit) { unitEl.focus(); toast(
"@
$content = $content.Replace($old3, $new3)

# 4. Cancel
$old4 = "    nameEl.value = ''; unitEl.value = ''; descEl.value = '';"
$new4 = "    nameEl.value = ''; unitEl.value = ''; descEl.value = '';`r`n    customUnitEl.value = ''; customUnitGroup.style.display = 'none';"
$content = $content.Replace($old4, $new4)

# 5. Edit
$old5 = "    addBtn.innerHTML = '<i class=""bi bi-check-lg""></i> ذخیره';"
$new5 = @"
    var knownUnits = ['kg','g','l','ml','unit','bunch','pack'];
    if (knownUnits.indexOf(item.unit) === -1) {
      unitEl.value = 'custom';
      customUnitEl.value = item.unit;
      customUnitGroup.style.display = '';
    }
    addBtn.innerHTML = '<i class="bi bi-check-lg"></i> ذخیره';
"@
$content = $content.Replace($old5, $new5)

Set-Content -Path "backend\restaurant\templates\restaurant\dictionary.html" -Encoding UTF8 -Value $content -NoNewline
