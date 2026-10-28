const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const file = path.join(__dirname, '../collectors/servers.js');
const guildId = '123456789012345678',
  userId = '223456789012345678',
  friendId = '323456789012345678',
  channelId = '333456789012345678';
function run(overrides = {}) {
  const stores = {
    GuildStore: {
      getGuilds: () => ({
        [guildId]: {
          id: guildId,
          name: 'Fixture server',
          icon: 'a_0123456789abcdef0123456789abcdef',
          ownerId: userId
        }
      })
    },
    UserStore: {
      getCurrentUser: () => ({ id: userId, token: 'SECRET' }),
      getUser: (id) =>
        id === friendId
          ? {
              id,
              globalName: 'Friend Display',
              username: 'friend',
              avatar: '0123456789abcdef0123456789abcdef'
            }
          : id === userId
            ? { id, username: 'owner' }
            : null
    },
    ChannelStore: {
      getMutableGuildChannelsForGuild: () => ({
        [channelId]: {
          id: channelId,
          guild_id: guildId,
          type: 0,
          name: 'fixture-general',
          lastMessageId: '1480420250930385147'
        }
      })
    },
    GuildMemberCountStore: { getMemberCount: () => 52, getOnlineCount: () => 3 },
    ReadStateStore: { lastMessageId: () => null },
    VoiceStateStore: {},
    PermissionStore: { can: () => true },
    RelationshipStore: { getFriendIDs: () => [friendId] },
    GuildMemberStore: {
      getMember: (id, memberId) =>
        id === guildId && memberId === friendId ? { nick: 'Cached Nick' } : null
    },
    ...overrides
  };
  const context = {
    module: { exports: {} },
    Date,
    console,
    Vencord: {
      Webpack: {
        findStore(name) {
          assert.ok(
            [
              'GuildStore',
              'UserStore',
              'ChannelStore',
              'GuildChannelStore',
              'GuildMemberCountStore',
              'ReadStateStore',
              'VoiceStateStore',
              'PermissionStore',
              'RelationshipStore',
              'GuildMemberStore'
            ].includes(name),
            'Forbidden store ' + name
          );
          return stores[name];
        }
      }
    },
    fetch() {
      throw Error('Network forbidden');
    }
  };
  vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', context);
  assert.equal(typeof context.module.exports.collect, 'function');
  return context.module.exports.collect();
}
test('exports server-only cache with ownership and channel date, no user secrets', () => {
  const result = run();
  const row = result.entries[0];
  assert.equal(result.account_id, userId);
  assert.equal(result.coverage.groups, 'excluded_by_user');
  assert.equal(result.coverage.friends, 'cached_partial');
  assert.equal(result.execution_authorized, false);
  assert.equal(row.owned_by_me, true);
  assert.equal(row.member_count, 52);
  assert.equal(result.collector_version, '3.1');
  assert.equal(
    row.icon_url,
    'https://cdn.discordapp.com/icons/123456789012345678/a_0123456789abcdef0123456789abcdef.gif?size=128'
  );
  assert.equal(row.friend_coverage, 'cached_partial');
  assert.equal(
    JSON.stringify(row.friend_matches),
    JSON.stringify([
      {
        id: friendId,
        display_name: 'Friend Display',
        username: 'friend',
        avatar_url:
          'https://cdn.discordapp.com/avatars/323456789012345678/0123456789abcdef0123456789abcdef.png?size=128',
        nickname: 'Cached Nick'
      }
    ])
  );
  assert.equal(row.channels.length, 1);
  assert.equal(row.channels[0].name, 'fixture-general');
  assert.equal(row.channels[0].last_message_at, '2026-03-09T04:21:32.700Z');
  assert.equal(row.activity_status, 'cached_signal_only');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
test('marks friend data unavailable rather than inferring no friends in a server', () => {
  const result = run({ RelationshipStore: {} }),
    row = result.entries[0];
  assert.equal(result.coverage.friends, 'unavailable');
  assert.equal(row.friend_coverage, 'unavailable');
  assert.equal(JSON.stringify(row.friend_matches), '[]');
});
