/* Vencord Server Cleanup 3.1: SERVERS ONLY, passive cache.
   No credentials, message bodies, private groups, navigation, API requests,
   account mutations or persistent settings. Downloads allowlisted metadata only. */
(() => {
  'use strict';
  function collect() {
    const finder = globalThis.Vencord?.Webpack?.findStore;
    if (typeof finder !== 'function') throw Error('Vencord is unavailable. Nothing was changed.');
    const store = (name) => {
      try {
        return finder(name);
      } catch (_) {
        return null;
      }
    };
    const guilds = store('GuildStore'),
      channels = store('ChannelStore'),
      user = store('UserStore'),
      counts = store('GuildMemberCountStore'),
      reads = store('ReadStateStore'),
      permissions = store('PermissionStore'),
      voice = store('VoiceStateStore'),
      relationships = store('RelationshipStore'),
      members = store('GuildMemberStore');
    if (typeof guilds?.getGuilds !== 'function') throw Error('GuildStore is unavailable.');
    const raw = guilds.getGuilds();
    if (!raw || typeof raw !== 'object') throw Error('Server list is unavailable.');
    const validId = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);
    const validHash = (value) => typeof value === 'string' && /^(?:a_)?[a-f0-9]{32}$/.test(value);
    const cdnUrl = (kind, id, hash) =>
      validId(id) && validHash(hash)
        ? 'https://cdn.discordapp.com/' +
          kind +
          '/' +
          id +
          '/' +
          hash +
          (hash.startsWith('a_') ? '.gif' : '.png') +
          '?size=128'
        : null;
    const text = (value, fallback = 'unknown') =>
      typeof value === 'string' && value ? value : fallback;
    let myId = null;
    try {
      myId = user?.getCurrentUser?.()?.id || null;
    } catch (_) {}
    let friendIds = null;
    if (typeof relationships?.getFriendIDs === 'function')
      try {
        const ids = relationships.getFriendIDs();
        if (ids && typeof ids[Symbol.iterator] === 'function')
          friendIds = [...new Set(Array.from(ids, String).filter(validId))];
      } catch (_) {}
    const friendsCoverage =
      Array.isArray(friendIds) && typeof members?.getMember === 'function'
        ? 'cached_partial'
        : 'unavailable';
    const warnings = [
      'Cache only: no network requests or message-body reads. An old timestamp does NOT establish inactivity.',
      'Channel coverage may be partial; forums, threads, and voice activity may be missing.'
    ];
    const entries = [];
    for (const guild of Object.values(raw)) {
      if (!guild?.id) continue;
      const id = String(guild.id),
        issues = [];
      const read = (s, method, args) => {
        if (typeof s?.[method] !== 'function') return null;
        try {
          return s[method](...args);
        } catch (_) {
          issues.push('Read error: ' + method);
          return null;
        }
      };
      const numeric = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
      const member_count = numeric(read(counts, 'getMemberCount', [id]));
      const online_count = numeric(read(counts, 'getOnlineCount', [id]));
      let friend_matches = [];
      const friend_coverage = friendsCoverage;
      if (friend_coverage === 'cached_partial')
        for (const friendId of friendIds) {
          const member = read(members, 'getMember', [id, friendId]);
          if (!member) continue;
          const friend = read(user, 'getUser', [friendId]);
          const match = {
            id: friendId,
            display_name: text(friend?.globalName || friend?.displayName || friend?.username),
            username: text(friend?.username),
            avatar_url: cdnUrl('avatars', friendId, friend?.avatar)
          };
          if (typeof member.nick === 'string' && member.nick) match.nickname = member.nick;
          friend_matches.push(match);
        }
      let owner_display_name = 'unknown';
      if (validId(String(guild.ownerId || ''))) {
        const owner = read(user, 'getUser', [String(guild.ownerId)]);
        owner_display_name = text(owner?.globalName || owner?.displayName || owner?.username);
      }
      const rawChannels = read(channels, 'getMutableGuildChannelsForGuild', [id]);
      const channelRows = [];
      if (rawChannels && typeof rawChannels === 'object') {
        const seen = new Set();
        for (const ch of Object.values(rawChannels)) {
          if (!ch?.id || String(ch.guild_id || ch.guildId) !== id || seen.has(String(ch.id)))
            continue;
          seen.add(String(ch.id));
          let visible = null;
          if (typeof permissions?.can === 'function') {
            try {
              visible = Boolean(permissions.can(1024n, ch));
            } catch (_) {
              issues.push('Channel permissions could not be verified');
            }
          }
          if (visible === false) continue;
          const candidates = [
            ['channel.lastMessageId', ch.lastMessageId],
            ['ReadStateStore.lastMessageId', read(reads, 'lastMessageId', [String(ch.id)])]
          ]
            .filter(([, v]) => typeof v === 'string' && /^\d{17,20}$/.test(v))
            .sort((a, b) =>
              BigInt(a[1]) > BigInt(b[1]) ? -1 : BigInt(a[1]) < BigInt(b[1]) ? 1 : 0
            );
          const messageId = candidates[0]?.[1] || null;
          let timestamp = null;
          if (messageId) {
            const ms = Number((BigInt(messageId) >> 22n) + 1420070400000n);
            const dt = new Date(ms);
            if (Number.isFinite(dt.getTime())) timestamp = dt.toISOString();
          }
          let voiceCount = null;
          if ([2, 13].includes(ch.type)) {
            const states = read(voice, 'getVoiceStatesForChannel', [String(ch.id)]);
            if (states && typeof states === 'object') voiceCount = Object.keys(states).length;
          }
          channelRows.push({
            id: String(ch.id),
            name: String(ch.name || ch.id),
            type: Number.isInteger(ch.type) ? ch.type : null,
            visibility: visible === true ? 'confirmed' : 'unknown',
            last_message_id: messageId,
            last_message_at: timestamp,
            last_message_source: candidates[0]?.[0] || null,
            voice_connected_cached: voiceCount
          });
        }
      } else issues.push('Channels are unavailable through the compatible cache reader.');
      const timestamps = channelRows
        .map((ch) => ch.last_message_at)
        .filter(Boolean)
        .sort();
      const latest = timestamps.at(-1) || null;
      entries.push({
        id,
        kind: 'server',
        name: String(guild.name || id),
        icon_url: cdnUrl('icons', id, guild.icon),
        owner_id: guild.ownerId ? String(guild.ownerId) : null,
        owner_display_name,
        owned_by_me: myId && guild.ownerId ? String(guild.ownerId) === String(myId) : null,
        member_count,
        online_count,
        friend_matches,
        friend_coverage,
        channels: channelRows,
        channels_coverage:
          rawChannels && typeof rawChannels === 'object' ? 'cached_partial' : 'unavailable',
        last_cached_message_at: latest,
        activity_status: latest ? 'cached_signal_only' : 'not_reviewed',
        decision: 'review',
        evidence: latest
          ? 'Last known message in captured channels: ' +
            latest +
            '. Cached signal; not evidence of complete activity.'
          : 'No verifiable activity timestamp in captured channels.',
        warnings: [...new Set(issues)]
      });
    }
    return {
      schema: 'discord-review/v1',
      collector_version: '3.1',
      account_id: validId(myId) ? myId : null,
      captured_at: new Date().toISOString(),
      mode: 'passive-cache-only',
      execution_authorized: false,
      entries,
      coverage: {
        servers: 'cached',
        channels: 'cached_partial',
        friends: friendsCoverage,
        groups: 'excluded_by_user',
        messages: 'not_collected'
      },
      warnings
    };
  }
  function download(data, env = globalThis) {
    const url = env.URL.createObjectURL(
      new env.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const a = env.document.createElement('a');
    a.href = url;
    a.download = 'discord-servers-visual.json';
    env.document.body.appendChild(a);
    a.click();
    a.remove();
    env.setTimeout(() => env.URL.revokeObjectURL(url), 10000);
  }
  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined')
    module.exports = { collect, download };
  else {
    try {
      const data = collect();
      download(data);
      console.info('Vencord Server Cleanup: inventory downloaded. No account changes.', {
        servers: data.entries.length,
        with_dates: data.entries.filter((r) => r.last_cached_message_at).length,
        coverage: data.coverage
      });
    } catch (error) {
      console.error('Discord Review: ' + error.message);
    }
  }
})();
