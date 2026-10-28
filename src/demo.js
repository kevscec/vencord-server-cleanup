/* Synthetic demo only. Never contains an exported Discord account. */
(() => {
  const id = (n) => String(100000000000000000n + BigInt(n));
  const friends = {
    alex: { id: id(20), display_name: 'Alex', username: 'alex_example' },
    riley: { id: id(21), display_name: 'Riley', username: 'riley_example' },
    sam: { id: id(22), display_name: 'Sam', username: 'sam_example' }
  };
  function getDemo() {
    const definitions = [
      [
        'Weekend Crew',
        18,
        ['alex', 'riley'],
        '2026-01-13T19:00:00.000Z',
        ['general', 'weekend-plans'],
        false
      ],
      [
        'Coding Circle',
        230,
        ['sam'],
        '2026-01-14T09:00:00.000Z',
        ['javascript', 'help', 'general'],
        false
      ],
      ['Old Game Lobby', 7, ['alex'], '2021-06-12T10:00:00.000Z', ['general', 'clips'], false],
      ['Resource Desk', 5100, [], '2026-01-10T12:00:00.000Z', ['verification'], false],
      ['My Sandbox', 1, [], null, ['general'], true],
      [
        'Language Exchange',
        80,
        ['riley'],
        '2026-01-12T08:00:00.000Z',
        ['general', 'practice'],
        false
      ],
      ['Trading Lab', 240, [], '2026-01-14T15:00:00.000Z', ['general', 'research'], false]
    ];
    return {
      schema: 'discord-review/v1',
      collector_version: 'demo',
      mode: 'passive-cache-only',
      account_id: id(1),
      demo: true,
      captured_at: '2026-01-15T12:00:00.000Z',
      entries: definitions.map(([name, members, people, date, channels, owned], i) => ({
        id: id(i + 2),
        kind: 'server',
        name,
        member_count: members,
        owned_by_me: owned,
        owner_id: owned ? id(1) : id(30),
        friend_coverage: 'cached_partial',
        friend_matches: people.map((p) => ({ ...friends[p] })),
        last_cached_message_at: date,
        channels: channels.map((name, j) => ({
          id: id(100 + i * 10 + j),
          name,
          type: 0,
          last_message_at: date
        })),
        evidence: date
          ? 'Synthetic cached timestamp for demonstration.'
          : 'Synthetic server without a cached timestamp.'
      }))
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { getDemo };
  else globalThis.ServerCleanupDemo = { getDemo };
})();
