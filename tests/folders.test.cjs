const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
function load(stores) {
  const context = {
    module: { exports: {} },
    console,
    Date,
    Vencord: {
      Webpack: {
        findStore(name) {
          assert.ok(['SortedGuildStore', 'GuildStore', 'UserStore'].includes(name));
          return stores[name];
        }
      }
    },
    fetch() {
      throw Error('Network forbidden');
    }
  };
  const p = path.join(__dirname, '../collectors/folders.js');
  vm.runInNewContext(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '', context);
  return context.module.exports;
}
test('folder capture preserves native order, IDs, names and color without any writes', () => {
  const a = '123456789012345678',
    b = '223456789012345678';
  const api = load({
    SortedGuildStore: {
      getGuildFolders: () => [
        { folderId: null, guildIds: [a] },
        { folderId: 123, folderName: 'My friends', folderColor: 58867, guildIds: [b] }
      ]
    },
    GuildStore: {
      getGuilds: () => ({
        [a]: { id: a, name: 'priority server fixture' },
        [b]: { id: b, name: 'Other fixture' }
      })
    }
  });
  assert.equal(typeof api.collect, 'function');
  const r = api.collect();
  assert.ok(Object.hasOwn(r, 'account_id'));
  assert.equal(r.schema, 'discord-folders/v1');
  assert.equal(r.execution_authorized, false);
  assert.equal(r.folders[0].guild_ids[0], a);
  assert.equal(r.folders[1].folder_id, 123);
  assert.equal(r.folders[1].folder_name, 'My friends');
  assert.equal(r.folders[1].folder_color, 58867);
  assert.equal(r.guild_names[b], 'Other fixture');
  assert.equal(r.unique_server_count, 2);
});
test('unavailable folder store fails closed instead of pretending folders are empty', () => {
  const api = load({});
  assert.equal(typeof api.collect, 'function');
  assert.throws(() => api.collect(), /folder/i);
});
