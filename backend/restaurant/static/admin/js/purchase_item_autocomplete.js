document.addEventListener('DOMContentLoaded', function () {

  function attachAutocomplete(input) {
    let dropdown = document.createElement('ul');
    dropdown.style.cssText = `
      position: absolute; background: white; border: 1px solid #ccc;
      list-style: none; margin: 0; padding: 0; z-index: 9999;
      min-width: 200px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      border-radius: 4px; max-height: 200px; overflow-y: auto;
    `;
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);

    input.addEventListener('input', function () {
      const q = this.value.trim();
      if (q.length < 1) { dropdown.innerHTML = ''; return; }

      fetch(`/api/raw-material-suggestions/?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(names => {
          dropdown.innerHTML = '';
          names.forEach(name => {
            let li = document.createElement('li');
            li.textContent = name;
            li.style.cssText = 'padding: 6px 12px; cursor: pointer; font-size: 13px;';
            li.addEventListener('mouseenter', () => li.style.background = '#f0f0f0');
            li.addEventListener('mouseleave', () => li.style.background = 'white');
            li.addEventListener('mousedown', () => {
              input.value = name;
              dropdown.innerHTML = '';
            });
            dropdown.appendChild(li);
          });
        });
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dropdown.innerHTML = '', 200);
    });
  }

  function initAll() {
    document.querySelectorAll('input[name$="item_name"]').forEach(input => {
      if (!input.dataset.autocompleteAttached) {
        input.dataset.autocompleteAttached = 'true';
        attachAutocomplete(input);
      }
    });
  }

  // برای ردیف‌های موجود
  initAll();

  // برای ردیف‌هایی که بعداً اضافه می‌شن (دکمه Add another)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('add-row')) {
      setTimeout(initAll, 100);
    }
  });
});