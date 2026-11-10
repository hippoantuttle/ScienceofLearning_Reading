'use strict';
// No dependencies, directory crawling, environment variables, or local secret reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const RUNTIME = Object.freeze([
  'background.js', 'content.js', 'sidepanel.html', 'sidepanel.css',
  'panel-ui.js', 'worksheet.js', 'ai-client.js', 'submission-client.js',
  'record-contract.js', 'record-client.js', 'submission-contract.js',
  'submission-http.js', 'submission-auth.js', 'submission-flow.js',
  'sidepanel.js', 'submission-panel.js', 'pilot-ai-panel.js',
  'feedback-panel.js', 'records-panel.js', 'account-bar.js', 'panel-shell.js'
]);
const CONFIG_KEYS = ['authUrl', 'publicKey', 'endpoint', 'aiEndpoint', 'articleTestEnabled', 'feedbackTestEnabled'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function publicUrl(value, field, pathname) {
  let url;
  try { url = new URL(value); } catch { throw Error(`${field}: HTTPS 공개 주소가 필요합니다.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/i.test(url.hostname) ||
      (pathname && url.pathname !== pathname)) throw Error(`${field}: HTTPS 공개 주소 형식 오류`);
  return url;
}

function validateConfig(input) {
  if (!input || Array.isArray(input) || Object.keys(input).sort().join() !== [...CONFIG_KEYS].sort().join())
    throw Error('공개 설정은 지정된 여섯 필드만 허용합니다.');
  if (CONFIG_KEYS.slice(0, 4).some(key => typeof input[key] !== 'string')) throw Error('공개 키와 주소는 문자열이어야 합니다.');
  const auth = publicUrl(input.authUrl, 'authUrl', '/');
  const submission = publicUrl(input.endpoint, 'endpoint', '/submissions');
  if (typeof input.articleTestEnabled !== 'boolean' || typeof input.feedbackTestEnabled !== 'boolean')
    throw Error('AI 활성화 필드는 boolean이어야 합니다.');
  if (input.aiEndpoint) {
    const ai = publicUrl(input.aiEndpoint, 'aiEndpoint', '/recommend');
    if (ai.origin === submission.origin) throw Error('이 프로젝트의 AI Worker와 제출 Worker 주소를 구분하세요.');
    if (ai.hostname === 'reading-prereading-experiment.patrick020308.workers.dev') throw Error('과거 고정 예문 실험 Worker는 현재 확장 AI 계약과 호환되지 않습니다.');
  }
  else if (input.articleTestEnabled || input.feedbackTestEnabled) throw Error('AI 활성화에는 승인된 aiEndpoint가 필요합니다.');
  const key = input.publicKey;
  let isPublic = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (typeof key === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      isPublic = payload.role === 'anon' && !payload.sub && !payload.session_id &&
        (payload.ref ? auth.hostname === `${payload.ref}.supabase.co` : payload.iss === auth.origin + '/auth/v1');
    } catch { isPublic = false; }
  }
  if (!isPublic) throw Error('publishable 또는 해당 프로젝트의 legacy anon 공개 키만 허용합니다.');
  return Object.fromEntries(CONFIG_KEYS.map(key => [key, input[key]]));
}

// Explicit, balanced regions keep the development source testable. No minifier or
// ad-hoc JS pattern substitution; any malformed boundary fails the build.
function stripDevelopment(source) {
  let depth = 0;
  const output = source.split(/\r?\n/).filter(line => {
    if (/^\s*(?:\/\/|<!--) @development-start(?: -->)?\s*$/.test(line)) { depth++; return false; }
    if (/^\s*(?:\/\/|<!--) @development-end(?: -->)?\s*$/.test(line)) {
      if (--depth < 0) throw Error('개발 영역 종료 표시 오류');
      return false;
    }
    return !depth;
  }).join('\n');
  if (depth) throw Error('개발 영역 종료 표시 누락');
  return output;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP store method, sorted names, UTF-8 flag, fixed 1980-01-01 timestamp.
// These small text-only packages stay far below ZIP64 limits.
function makeZip(files) {
  const chunks = [], directory = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}

function extensionId(key) {
  return crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
}

function readSource(root, name) {
  const file = path.join(root, name);
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw Error('일반 소스 파일만 허용: ' + name);
  return fs.readFileSync(file, 'utf8');
}

function checkSecrets(source, name) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{8,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/.test(source))
    throw Error('비밀값 의심 문자열: ' + name);
  for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(match[1], 'base64url').toString()); } catch { throw Error('JWT 형식 문자열 검사 실패: ' + name); }
    if (payload.role !== 'anon' || payload.sub || payload.session_id) throw Error('공개 anon 이외 JWT 혼입: ' + name);
  }
}

function assemble({root = ROOT, config, reviewOnly = false} = {}) {
  if (reviewOnly && config) throw Error('검토 전용 빌드에는 원격 설정을 넣지 않습니다.');
  const settings = reviewOnly ? {authUrl:'', publicKey:'', endpoint:'', aiEndpoint:'', articleTestEnabled:false, feedbackTestEnabled:false} : validateConfig(config);
  const sourceManifest = readSource(root, 'manifest.json'), manifest = JSON.parse(sourceManifest);
  // Explicit manifest avoids accidentally inheriting new development permissions.
  const releaseManifest = {
    manifest_version:3, key:manifest.key, name:'한국어 독해 훈련' + (reviewOnly ? ' · 검토 전용' : ''),
    version:manifest.version, minimum_chrome_version:'116', description:'스스로 읽고 구조화하고 다시 말하는 독해 훈련',
    permissions:['sidePanel', 'activeTab', 'scripting'],
    host_permissions:reviewOnly ? [] : [...new Set([settings.authUrl, settings.endpoint, settings.aiEndpoint].filter(Boolean).map(url => new URL(url).origin + '/*'))],
    background:{service_worker:'background.js'}, action:{default_title:'독해 훈련 사이드 패널 열기'},
    side_panel:{default_path:'sidepanel.html'}
  };
  const files = {}, sourceHashes = {'manifest.json':hash(sourceManifest)};
  for (const name of RUNTIME) {
    const source = readSource(root, name); sourceHashes[name] = hash(source);
    const output = stripDevelopment(source);
    if (name.endsWith('.js')) new vm.Script(output, {filename:name});
    if (/http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])|submission-config\.local|@development-|requestMock|allowRepeatedRecommendations/.test(output))
      throw Error('개발 설정·로컬 요청 혼입: ' + name);
    files[name] = Buffer.from(output);
  }
  files['manifest.json'] = Buffer.from(JSON.stringify(releaseManifest, null, 2) + '\n');
  files['submission-config.js'] = Buffer.from("'use strict';\nconst SubmissionConfig = Object.freeze(" + JSON.stringify(settings) + ');\n');
  for (const [name, data] of Object.entries(files)) checkSecrets(data.toString(), name);
  const html = files['sidepanel.html'].toString();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!files[match[1]]) throw Error('패키지 참조 누락: ' + match[1]);
  if (/dev-only|개발자 도구|local-preview|synthetic-submit|mock-recommend/.test(html)) throw Error('개발 UI 혼입');
  // A restrictive release-only CSP also prevents accidental loopback connections.
  releaseManifest.content_security_policy = {extension_pages:"script-src 'self'; object-src 'none'; connect-src " + (reviewOnly ? "'none'" : releaseManifest.host_permissions.map(value => value.slice(0, -2)).join(' ')) + ';'};
  files['manifest.json'] = Buffer.from(JSON.stringify(releaseManifest, null, 2) + '\n');
  return {files, sourceHashes, manifest:releaseManifest, extensionId:extensionId(manifest.key), reviewOnly};
}

function build({config, reviewOnly = false, label, root = ROOT} = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label || '')) throw Error('--label: 영문 소문자·숫자·하이픈 1~64자 필요');
  const assembled = assemble({root, config, reviewOnly});
  const git = args => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
  const revision = git(['rev-parse', 'HEAD']);
  const trackedChanges = git(['diff', 'HEAD', '--name-only', '--']).split(/\r?\n/).filter(Boolean);
  const status = git(['status', '--porcelain', '--untracked-files=normal']);
  const files = Object.entries(assembled.files).sort(([a], [b]) => a.localeCompare(b, 'en'));
  const zip = makeZip(assembled.files);
  const report = {
    task:'TASK-017', mode:reviewOnly ? 'review-only-network-disabled' : 'remote-configured-unverified',
    version:assembled.manifest.version, revision, sourceDirty:!!status, trackedChanges,
    documentsDirty:!!git(['status', '--porcelain', '--untracked-files=normal', '--', 'docs', 'README.md']),
    sourceHashes:assembled.sourceHashes, builderSha256:hash(fs.readFileSync(__filename)),
    extensionId:assembled.extensionId, origin:'chrome-extension://' + assembled.extensionId,
    runtimeFiles:files.map(([name, data]) => ({name, bytes:data.length, sha256:hash(data)})),
    zipSha256:hash(zip), remoteVerified:false, chromeVerified:false
  };
  // No recursive delete/overwrite. Never follow a pre-existing output symlink.
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) fs.mkdirSync(dist);
  if (fs.lstatSync(dist).isSymbolicLink() || fs.realpathSync(dist) !== path.resolve(dist)) throw Error('dist 경로 오류');
  const destination = path.join(dist, label);
  fs.mkdirSync(destination);
  fs.mkdirSync(path.join(destination, 'extension'));
  for (const [name, data] of files) fs.writeFileSync(path.join(destination, 'extension', name), data, {flag:'wx'});
  fs.writeFileSync(path.join(destination, 'extension.zip'), zip, {flag:'wx'});
  fs.writeFileSync(path.join(destination, 'build-report.json'), JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
  fs.writeFileSync(path.join(destination, 'SHA256SUMS'), report.zipSha256 + '  extension.zip\n' + files.map(([name, data]) => hash(data) + '  extension/' + name).join('\n') + '\n', {flag:'wx'});
  return {destination, report};
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
      const flag = args.shift();
      if (flag === '--review-only') options.reviewOnly = true;
      else if (flag === '--label' && args.length) options.label = args.shift();
      else if (flag === '--config' && args.length) {
        const file = args.shift();
        if (!file.endsWith('.public.json')) throw Error('설정은 명시한 *.public.json 파일만 허용합니다.');
        if (fs.lstatSync(file).isSymbolicLink()) throw Error('설정 symlink 금지');
        options.config = JSON.parse(fs.readFileSync(file, 'utf8'));
      } else throw Error('사용법: node scripts/build-extension.cjs --label <이름> (--review-only | --config <설정.public.json>)');
    }
    const result = build(options);
    console.log(JSON.stringify({output:result.destination, mode:result.report.mode, extensionId:result.report.extensionId, zipSha256:result.report.zipSha256}));
  } catch { console.error('빌드 실패: 인수·공개 설정·소스 검사 또는 출력 경로를 확인하세요. 기존 산출물은 덮어쓰지 않습니다.'); process.exitCode = 1; }
}
module.exports = {RUNTIME, validateConfig, stripDevelopment, makeZip, assemble, build, extensionId};
