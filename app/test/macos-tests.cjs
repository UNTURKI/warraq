const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const pkg = require('../../package.json');

for (const platform of ['darwin', 'linux']) {
  test(`${platform} updates open releases without downloading or installing`, async () => {
    const context = { require, module: { exports: {} }, process: { platform } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../electron/updater.cjs'), 'utf8'), context);
    const opened = [];
    const updater = context.module.exports.setupUpdater({ shell: { openExternal: async (url) => opened.push(url) } });
    updater.start();
    assert.equal(opened.length, 0);
    assert.equal((await updater.check()).state, 'manual');
    assert.deepEqual(opened, ['https://github.com/UNTURKI/warraq/releases/latest']);
  });
}

test('macOS packaging has distinct architecture-specific artifacts', () => {
  assert.match(pkg.scripts['dist:mac'], /--mac --arm64 --x64/);
  assert.deepEqual(pkg.build.mac.target, ['dmg', 'zip']);
  assert.match(pkg.build.mac.artifactName, /\$\{arch\}/);
  assert.ok(fs.existsSync(path.join(__dirname, '../..', pkg.build.mac.icon)));
});
