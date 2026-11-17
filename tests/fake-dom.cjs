'use strict';
// Minimal DOM node for vm-based panel tests: enough for AIResultView.render.
// textContent joins own text and children with '\n' so tests can read sections in order.
function fakeNode(tag = 'div', extra = {}) {
  let own = '';
  const node = {
    tag, className: '', children: [], attrs: {},
    classList: { add(name) { node.className = (node.className + ' ' + name).trim(); } },
    setAttribute(k, v) { node.attrs[k] = String(v); },
    append(...items) { node.children.push(...items); },
    get textContent() { return [own, ...node.children.map(c => c.textContent)].filter(Boolean).join('\n'); },
    set textContent(v) { own = String(v); node.children = []; },
    find(className) { return node.className.split(' ').includes(className) ? [node] : node.children.flatMap(c => c.find(className)); },
  };
  return Object.assign(node, extra);
}
module.exports = { fakeNode, createElement: tag => fakeNode(tag) };
