const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('PowerShell reads UTF-8 JSON bytes without a charset', { skip: process.platform !== 'win32' }, async () => {
  const expected = { terms: [{ term: '배움', definition: '한글 설명 · 기호!' }], background: ['가상의 문장과 따옴표 “예시”'], structureType: 'unspecified' };
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(Buffer.from(JSON.stringify({ kind: 'experiment', recommendation: expected, usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }), 'utf8'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const script = path.resolve(__dirname, '../scripts/request-experiment-once.ps1').replace(/'/g, "''");
    const command = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); function global:Read-Host { param($Prompt,[switch]$AsSecureString) ConvertTo-SecureString 'fictional-local-test' -AsPlainText -Force }; & '${script}' -LocalMockUrl 'http://127.0.0.1:${server.address().port}/recommend'`;
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
    const chunks = []; const errors = [];
    child.stdout.on('data', c => chunks.push(c)); child.stderr.on('data', c => errors.push(c));
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, Buffer.concat(errors).toString('utf8'));
    const output = Buffer.concat(chunks).toString('utf8');
    for (const text of ['배움', '한글 설명 · 기호!', '가상의 문장과 따옴표 “예시”']) assert.ok(output.includes(text), `UTF-8 text not preserved: ${text}`);
    assert.equal(requests, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
