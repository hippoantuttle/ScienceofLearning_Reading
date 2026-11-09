const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('action click requests side panel twice even after worker restart (mock API)', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const requests = [];
  function startWorker() {
    let handler;
    const chrome = {
      runtime: { onMessage: { addListener() {} } },
      action: { onClicked: { addListener(fn) { handler = fn; } } },
      sidePanel: {
        setPanelBehavior: async () => {},
        open: async ({ windowId }) => { requests.push(windowId); },
      },
    };
    vm.runInNewContext(source, { chrome, console: { info() {}, error() {} } });
    return handler;
  }
  startWorker()({ windowId: 7 });
  startWorker()({ windowId: 7 });
  assert.deepEqual(requests, [7, 7]);
});
