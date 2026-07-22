$content = Get-Content "backend\restaurant\templates\restaurant\dictionary.html" -Raw -Encoding UTF8

# 1. حذف div جداگانه pdCustomUnitGroup و بردن input به داخل unit group
$old_form = @"
        </select>
    </div>
    <div class="dict-form-group" id="pdCustomUnitGroup" style="display:none;">
      <label>واحد سفارشی</label>
      <input type="text" id="pdCustomUnit" placeholder="مثال: سینی">
    </div>
    <div class="dict-form-group">
      <label>توضیحات</label>
"@

$new_form = @"
        </select>
        <input type="text" id="pdCustomUnit" placeholder="واحد سفارشی..." style="display:none; margin-top: 6px;">
      </div>
      <div class="dict-form-group">
        <label>توضیحات</label>
"@

$content = $content.Replace($old_form, $new_form)

# 2. حذف خط customUnitGroup از بخش Elements
$old_el = "  var customUnitEl = document.getElementById('pdCustomUnit');`r`n  var customUnitGroup = document.getElementById('pdCustomUnitGroup');"
$new_el = "  var customUnitEl = document.getElementById('pdCustomUnit');"
$content = $content.Replace($old_el, $new_el)

# 3. تغییر toggle - استایل مستقیم input
$old_toggle = @"
  unitEl.addEventListener('change', function() {
    if (this.value === 'custom') {
      customUnitGroup.style.display = '';
      customUnitEl.focus();
    } else {
      customUnitGroup.style.display = 'none';
      customUnitEl.value = '';
    }
  });
"@

$new_toggle = @"
  unitEl.addEventListener('change', function() {
    if (this.value === 'custom') {
      customUnitEl.style.display = '';
      customUnitEl.focus();
    } else {
      customUnitEl.style.display = 'none';
      customUnitEl.value = '';
    }
  });
"@

$content = $content.Replace($old_toggle, $new_toggle)

# 4. تغیر cancelEdit
$old_cancel = "    customUnitEl.value = ''; customUnitGroup.style.display = 'none';"
$new_cancel = "    customUnitEl.value = ''; customUnitEl.style.display = 'none';"
$content = $content.Replace($old_cancel, $new_cancel)

# 5. تغییر edit
$old_edit = "      customUnitGroup.style.display = '';"
$new_edit = "      customUnitEl.style.display = '';"
$content = $content.Replace($old_edit, $new_edit)

Set-Content -Path "backend\restaurant\templates\restaurant\dictionary.html" -Encoding UTF8 -Value $content -NoNewline
