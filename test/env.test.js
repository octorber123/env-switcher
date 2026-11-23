const assert = require('assert');
const env = require('../lib/env');

const api = ['DB_HOST=localhost', '# DB_DATABASE=shop_demo', '# DB_DATABASE=shop_staging', 'DB_DATABASE=shop_testing', '# DB_DATABASE=shop_local', 'DB_USERNAME=root', ''].join('\n');
const legacy = ['DB_HOST=localhost', '# DB_DATABASE=shop_remote_testing', '# DB_HOST=remote.example.com', '# DB_DATABASE=shop_remote_staging', '#DB_DATABASE="shop_staging"', 'DB_DATABASE=shop_testing', '# DB_DATABASE=shop_local', ''].join('\r\n');

assert.deepStrictEqual(env.read(api, 'DB_DATABASE'), {
  current: 'shop_testing',
  options: ['shop_demo', 'shop_staging', 'shop_testing', 'shop_local'],
});

const switched = env.write(api, 'DB_DATABASE', 'shop_local');
assert.strictEqual(env.read(switched, 'DB_DATABASE').current, 'shop_local');
assert.ok(switched.includes('# DB_DATABASE=shop_testing\nDB_DATABASE=shop_local\n'));
assert.ok(switched.includes('DB_HOST=localhost\n'), 'other keys untouched');
assert.strictEqual(env.write(switched, 'DB_DATABASE', 'shop_testing'), api, 'round trip restores the file');
assert.strictEqual(env.write(api, 'DB_DATABASE', 'shop_testing'), api, 'same value is a no-op');
assert.strictEqual(env.write(api, 'DB_DATABASE', 'nope'), null);

const quoted = env.write(legacy, 'DB_DATABASE', 'shop_staging');
assert.strictEqual(env.read(quoted, 'DB_DATABASE').current, 'shop_staging');
assert.ok(quoted.includes('\r\nDB_DATABASE="shop_staging"\r\n# DB_DATABASE=shop_testing\r\n'), 'CRLF and quotes kept');
assert.ok(quoted.includes('# DB_HOST=remote.example.com'), 'commented host untouched');

const linked = env.group([api, legacy], 'DB_DATABASE');
assert.deepStrictEqual(linked, { synced: true, current: 'shop_testing', options: ['shop_staging', 'shop_testing', 'shop_local'] });
assert.strictEqual(env.group([switched, legacy], 'DB_DATABASE').synced, false);

assert.strictEqual(env.read('APP_ENV=local\n', 'DB_DATABASE').current, null);
assert.deepStrictEqual(env.read('XDB_DATABASE=a\nDB_DATABASE_2=b\n', 'DB_DATABASE').options, []);

console.log('all passed');
