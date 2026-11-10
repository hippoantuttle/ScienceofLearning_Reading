'use strict';
// Visual status semantics only. Request gates and storage contracts stay in their owners.
var PanelUI = (() => {
  function tone(element, kind = 'warning') {
    if (!element) return;
    element.setAttribute?.('data-tone', kind);
    element.setAttribute?.('role', kind === 'error' ? 'alert' : 'status');
  }
  return {tone};
})();
if (typeof module !== 'undefined') module.exports = PanelUI;
