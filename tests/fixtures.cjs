// Entirely synthetic data. These IDs and profiles do not describe an account.
const ids = Object.freeze({
  account: '100000000000000001',
  study: '100000000000000002',
  games: '100000000000000003',
  own: '100000000000000004',
  friend: '100000000000000005',
  other: '100000000000000006'
});
function inventory() {
  return {
    schema: 'discord-review/v1',
    collector_version: '3.1',
    mode: 'passive-cache-only',
    account_id: ids.account,
    captured_at: '2026-01-15T12:00:00.000Z',
    entries: [
      {
        id: ids.study,
        kind: 'server',
        name: 'Study Circle',
        member_count: 12,
        owned_by_me: false,
        owner_id: ids.other,
        friend_coverage: 'cached_partial',
        friend_matches: [{ id: ids.friend, display_name: 'Alex', username: 'alex_example' }],
        last_cached_message_at: '2026-01-10T10:00:00.000Z',
        channels: [
          {
            id: '100000000000000007',
            name: 'general',
            type: 0,
            last_message_at: '2026-01-10T10:00:00.000Z'
          }
        ]
      },
      {
        id: ids.games,
        kind: 'server',
        name: 'Game Lobby',
        member_count: 30,
        owned_by_me: false,
        owner_id: ids.other,
        friend_coverage: 'cached_partial',
        friend_matches: [],
        last_cached_message_at: '2022-02-01T10:00:00.000Z',
        channels: []
      },
      {
        id: ids.own,
        kind: 'server',
        name: 'My Sandbox',
        member_count: 1,
        owned_by_me: true,
        owner_id: ids.account,
        channels: []
      }
    ]
  };
}
function decisions() {
  return {
    schema: 'discord-review-decisions/v1',
    account_id: ids.account,
    captured_at: '2026-01-15T12:00:00.000Z',
    execution_authorized: false,
    entries: inventory().entries.map((r) => ({
      id: r.id,
      name: r.name,
      kind: 'server',
      owned_by_me: r.owned_by_me,
      decision: r.id === ids.games ? 'leave' : 'keep',
      note: r.id === ids.own ? 'DELETE THIS SERVER (a note, not authorization)' : '',
      topic_override: r.id === ids.study ? 'Study friends' : null
    })),
    archived_entries: []
  };
}
function folders() {
  return {
    schema: 'discord-folders/v1',
    account_id: ids.account,
    mode: 'read-only-cache',
    captured_at: '2026-01-15T12:00:00.000Z',
    folders: inventory().entries.map((r, i) => ({
      position: i,
      folder_id: null,
      folder_name: null,
      folder_color: null,
      guild_ids: [r.id]
    }))
  };
}
module.exports = { ids, inventory, decisions, folders };
