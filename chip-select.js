// TASK-026: pointer-friendly chip row that mirrors a native <select>.
// The select stays the single source of truth and the only control exposed to
// assistive technology and the keyboard; controllers keep reading/writing
// select.value and select.disabled exactly as before.
(function () {
  if (typeof document === 'undefined' || typeof HTMLSelectElement === 'undefined') return;
  const proto = HTMLSelectElement.prototype;
  const valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
  const disabledDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'disabled') || Object.getOwnPropertyDescriptor(proto, 'disabled');
  if (!valueDesc || !disabledDesc) return;

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || select.dataset.chipsReady) return;
    select.dataset.chipsReady = 'true';
    const group = document.createElement('div');
    group.className = 'chip-group';
    group.setAttribute('aria-hidden', 'true');
    const chips = new Map();
    function build() {
      group.textContent = '';
      chips.clear();
      for (const option of select.options) {
        if (option.value === '') continue;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip-option';
        chip.tabIndex = -1;
        chip.textContent = option.textContent;
        chip.addEventListener('click', () => {
          if (select.disabled || select.value === option.value) return;
          valueDesc.set.call(select, option.value);
          sync();
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        chips.set(option.value, chip);
        group.append(chip);
      }
    }
    function sync() {
      const value = valueDesc.get.call(select), off = disabledDesc.get.call(select);
      group.toggleAttribute('data-disabled', off);
      for (const [key, chip] of chips) {
        chip.setAttribute('data-selected', String(key === value));
        chip.disabled = off;
      }
    }
    // Controllers set value/disabled programmatically without events; mirror them.
    Object.defineProperty(select, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); sync(); } });
    Object.defineProperty(select, 'disabled', { configurable: true, get() { return disabledDesc.get.call(this); }, set(v) { disabledDesc.set.call(this, v); sync(); } });
    select.addEventListener('change', sync);
    new MutationObserver(() => { build(); sync(); }).observe(select, { childList: true, subtree: true, characterData: true });
    select.classList.add('chip-select-native');
    select.after(group);
    build();
    sync();
  }

  for (const select of document.querySelectorAll('select[data-chips]')) enhance(select);
})();
