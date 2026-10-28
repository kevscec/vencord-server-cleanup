const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const me = '123456789012345678',
  leaveId = '223456789012345678',
  deleteId = '323456789012345678',
  keepId = '423456789012345678';
function fixture() {
  const guilds = {
    [leaveId]: { id: leaveId, ownerId: '523456789012345678' },
    [deleteId]: { id: deleteId, ownerId: me },
    [keepId]: { id: keepId, ownerId: me }
  };
  let folders = [{ guildIds: [leaveId, deleteId, keepId] }];
  const calls = [];
  const value = { folders: [], unrelated: 'KEEP' };
  const type = {
    fromJson(data) {
      return {
        guildIds: [...data.guildIds],
        ...(data.id
          ? { id: { value: data.id }, name: { value: data.name }, color: { value: data.color } }
          : {})
      };
    }
  };
  const settings = {
    ProtoClass: {
      typeName: 'discord.PreloadedUserSettings',
      fields: [
        {
          localName: 'guildFolders',
          T: () => ({ fields: [{ localName: 'folders', T: () => type }] })
        }
      ]
    },
    async updateAsync(key, callback, delay) {
      calls.push(['update', key, delay]);
      callback(value);
      folders = value.folders.map((f) => ({
        folderId: f.id ? Number(f.id.value) : undefined,
        folderName: f.name?.value,
        folderColor: f.color?.value,
        guildIds: [...f.guildIds]
      }));
    }
  };
  const actions = {
    async leaveGuild(id) {
      calls.push(['leave', id]);
      delete guilds[id];
    },
    async deleteGuild(id) {
      calls.push(['delete', id]);
      delete guilds[id];
    }
  };
  const stores = {
    GuildStore: { getGuilds: () => guilds, getGuild: (id) => guilds[id] },
    UserStore: { getCurrentUser: () => ({ id: me }) },
    SortedGuildStore: { getGuildFolders: () => folders }
  };
  const Vencord = {
    Webpack: {
      findStore(name) {
        assert.ok(['GuildStore', 'UserStore', 'SortedGuildStore'].includes(name));
        return stores[name];
      },
      findByProps(...props) {
        assert.ok(props.every((p) => typeof actions[p] === 'function'));
        return actions;
      },
      find(predicate) {
        return predicate(settings) ? settings : null;
      }
    }
  };
  const plan = {
    execution_authorized: true,
    expected_user_id: me,
    leave: [{ id: leaveId }],
    delete: [{ id: deleteId }],
    retain_ids: [keepId],
    folders: [{ folder_id: null, folder_name: null, folder_color: null, guild_ids: [keepId] }]
  };
  const context = { module: { exports: {} }, Date, Promise, setTimeout, clearTimeout, console };
  const file = path.join(__dirname, '../src/cleanup-native.js');
  vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', context);
  return { api: context.module.exports, Vencord, plan, calls, settings, value, actions, stores };
}
test('native adapter discovers capabilities without mutations and uses native verified methods only', async () => {
  const f = fixture();
  assert.equal(typeof f.api.makeAdapter, 'function');
  const deps = f.api.makeAdapter(f.Vencord, f.plan, { paceMs: 0, waitMs: 0 });
  assert.equal(f.calls.length, 0);
  await deps.leaveGuild(leaveId);
  assert.equal(deps.getGuild(leaveId), null);
  assert.equal(await deps.waitAbsent(leaveId), true);
  await deps.deleteGuild(deleteId);
  assert.equal(await deps.waitAbsent(deleteId), true);
  await deps.applyFolders(f.plan.folders);
  assert.equal(f.value.unrelated, 'KEEP');
  assert.equal(deps.readFolders()[0].guild_ids[0], keepId);
  assert.equal(f.calls.filter((c) => c[0] === 'update').length, 1);
});
test('leave-only adapter does not discover or require folder mutation controls', async () => {
  const f = fixture();
  f.plan.delete = [];
  f.plan.folders = null;
  f.plan.retain_ids = [deleteId, keepId];
  f.Vencord.Webpack.find = () => {
    throw Error('Unexpected folder discovery');
  };
  const deps = f.api.makeAdapter(f.Vencord, f.plan, { paceMs: 0, waitMs: 0 });
  await deps.leaveGuild(leaveId);
  assert.equal(f.calls.length, 1);
  assert.equal(deps.getGuild(deleteId).id, deleteId);
});
test('folder-only adapter never discovers destructive action modules', async () => {
  const f = fixture();
  f.plan.leave = [];
  f.plan.delete = [];
  f.plan.retain_ids = [leaveId, deleteId, keepId];
  f.plan.folders = [
    {
      folder_id: 42,
      folder_name: 'Resources',
      folder_color: 123,
      guild_ids: [leaveId, deleteId, keepId]
    }
  ];
  f.Vencord.Webpack.findByProps = () => {
    throw Error('Unexpected action discovery');
  };
  const deps = f.api.makeAdapter(f.Vencord, f.plan, { paceMs: 0, waitMs: 0 });
  await deps.applyFolders(f.plan.folders);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'update');
});
