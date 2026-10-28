/* Data model for a review-only local catalog. There is no execution interface. */
(() => {
  'use strict';
  const decisions = ['review', 'keep', 'leave', 'mute'];
  const idOk = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);
  const text = (value, max = 500) => (typeof value === 'string' ? value.slice(0, max) : '');
  const knownName = (value, max = 500) => (value === 'unknown' ? '' : text(value, max));
  const safeTopic = (value) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= 80
      ? value.trim()
      : null;
  const number = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
  const date = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
      ? value
      : null;
  const topics = [
    'Programming and technology',
    'Trading and finance',
    'Languages and learning',
    'Games and communities',
    'Small circles · unconfirmed',
    'Uncategorized',
    'Friends and contacts'
  ];
  function safeImage(value, kind, id) {
    if (typeof value !== 'string') return null;
    try {
      const u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.hostname !== 'cdn.discordapp.com' ||
        u.port ||
        u.username ||
        u.password ||
        u.hash
      )
        return null;
      const pattern =
        kind === 'icon'
          ? new RegExp('^/icons/' + id + '/(?:a_)?[a-f0-9]{32}\\.(?:png|webp|gif)$')
          : new RegExp('^/avatars/' + id + '/(?:a_)?[a-f0-9]{32}\\.(?:png|webp|gif)$');
      if (
        !pattern.test(u.pathname) &&
        !(kind === 'avatar' && /^\/embed\/avatars\/\d{1,2}\.png$/.test(u.pathname))
      )
        return null;
      if ([...u.searchParams].some(([key, val]) => key !== 'size' || !/^\d{1,4}$/.test(val)))
        return null;
      return u.href;
    } catch (_) {
      return null;
    }
  }
  function topicFor(row, channels) {
    const normalize = (value) =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const name = normalize(row.name);
    if (/trading|cripto|crypto|forex|defi|fiscalidad|finanzas/.test(name)) return topics[1];
    if (/bootcamp|programaci|javascript|full stack|appsec|cyber|ciber|software/.test(name))
      return topics[0];
    if (/spanish|english|language|idioma/.test(name)) return topics[2];
    if (/valorant|league|dota|gaming|gensh|torneo|doom|game|minecraft|reino/.test(name))
      return topics[3];
    const names = normalize(channels.map((ch) => ch.name).join(' '));
    if (/appsec|python|javascript|typescript|ciberseguridad/.test(names)) return topics[0];
    if (row.member_count !== null && row.member_count <= 150) return topics[4];
    return topics[5];
  }
  function importInventory(data) {
    if (
      data?.schema !== 'discord-review/v1' ||
      data.mode !== 'passive-cache-only' ||
      !Array.isArray(data.entries) ||
      data.entries.length > 20000
    )
      throw Error('Unsupported inventory format.');
    const captured_at = date(data.captured_at);
    if (!captured_at) throw Error('A valid capture timestamp is required.');
    const seen = new Set();
    const rows = data.entries
      .filter((row) => row.kind === 'server')
      .map((row) => {
        if (!idOk(row.id) || typeof row.name !== 'string' || seen.has(row.id))
          throw Error('Invalid or duplicate server.');
        seen.add(row.id);
        const channels = Array.isArray(row.channels)
          ? row.channels
              .filter((ch) => idOk(ch.id))
              .map((ch) => ({
                id: ch.id,
                name: text(ch.name),
                type: number(ch.type),
                last_message_at: date(ch.last_message_at),
                voice_connected_cached: number(ch.voice_connected_cached)
              }))
          : [];
        const latest = date(row.last_cached_message_at),
          age = latest
            ? Math.floor((Date.parse(captured_at) - Date.parse(latest)) / 86400000)
            : null;
        const gated = channels.filter((ch) => [0, 5, 15, 16].includes(ch.type));
        const limited = gated.length === 1 && /verif|important/i.test(gated[0].name);
        const owned = row.owned_by_me === true;
        const friends = new Map();
        if (Array.isArray(row.friend_matches))
          for (const friend of row.friend_matches.slice(0, 10000)) {
            if (!idOk(friend.id)) continue;
            friends.set(friend.id, {
              id: friend.id,
              display_name:
                knownName(friend.display_name) ||
                knownName(friend.nickname) ||
                knownName(friend.username) ||
                'Friend · ' + friend.id.slice(-6),
              username: knownName(friend.username, 100),
              nickname: knownName(friend.nickname, 100),
              avatar_url: safeImage(friend.avatar_url, 'avatar', friend.id)
            });
          }
        return {
          id: row.id,
          name: text(row.name),
          kind: 'server',
          owned_by_me: typeof row.owned_by_me === 'boolean' ? row.owned_by_me : null,
          member_count: number(row.member_count),
          online_count: number(row.online_count),
          channels,
          last_cached_message_at: latest,
          age_days: age,
          priority: owned
            ? 'owned'
            : limited
              ? 'limited'
              : age === null
                ? 'unknown'
                : age >= 365
                  ? 'old'
                  : age >= 180
                    ? 'quiet'
                    : 'recent',
          icon_url: safeImage(row.icon_url, 'icon', row.id),
          friend_matches: [...friends.values()],
          friend_coverage:
            row.friend_coverage === 'cached_partial' ? 'cached_partial' : 'unavailable',
          owner_name: knownName(row.owner_name || row.owner_display_name, 200),
          decision: owned ? 'keep' : 'review',
          note: '',
          favorite: false,
          topic: topicFor({ ...row, member_count: number(row.member_count) }, channels),
          topic_override: null,
          evidence: text(row.evidence, 2000),
          warnings: Array.isArray(row.warnings) ? row.warnings.map((w) => text(w, 500)) : []
        };
      });
    return {
      captured_at,
      account_id: idOk(data.account_id) ? data.account_id : null,
      demo: data.demo === true,
      rows,
      collector_version: text(data.collector_version || 'unknown version'),
      warnings: Array.isArray(data.warnings) ? data.warnings.map((w) => text(w, 1000)) : []
    };
  }
  function makeDraft(inventory) {
    return {
      schema: 'discord-review-decisions/v1',
      captured_at: inventory.captured_at,
      account_id: inventory.account_id,
      demo: inventory.demo === true,
      execution_authorized: false,
      entries: inventory.rows.map((row) => {
        if (!decisions.includes(row.decision) || !idOk(row.id)) throw Error('Invalid decision.');
        if (row.owned_by_me === true && row.decision === 'leave')
          throw Error('Protected: you are the owner.');
        return {
          id: row.id,
          kind: 'server',
          name: row.name,
          owned_by_me: row.owned_by_me === true ? true : null,
          decision: row.decision,
          note: text(row.note, 4000),
          favorite: row.favorite === true,
          topic_override: safeTopic(row.topic_override)
        };
      })
    };
  }
  function restoreDraft(inventory, draft) {
    if (
      draft?.schema !== 'discord-review-decisions/v1' ||
      !Array.isArray(draft.entries) ||
      draft.entries.length > 20000
    )
      throw Error('Unsupported draft.');
    if (inventory.account_id && draft.account_id && inventory.account_id !== draft.account_id)
      throw Error('The draft belongs to another account.');
    const byId = new Map(inventory.rows.map((row) => [row.id, row]));
    const updates = new Map();
    for (const item of draft.entries) {
      if (item.kind !== 'server') continue;
      if (!byId.has(item.id) || updates.has(item.id))
        throw Error('The draft does not match this inventory.');
      if (!decisions.includes(item.decision)) throw Error('Invalid draft decision.');
      const protectedOwner = byId.get(item.id).owned_by_me === true || item.owned_by_me === true;
      if (protectedOwner && item.decision === 'leave') throw Error('Protected: you are the owner.');
      updates.set(item.id, {
        ...(protectedOwner ? { owned_by_me: true, priority: 'owned' } : {}),
        decision: item.decision,
        note: text(item.note, 4000),
        favorite: item.favorite === true,
        topic_override: safeTopic(item.topic_override)
      });
    }
    return {
      ...inventory,
      rows: inventory.rows.map((row) => ({ ...row, ...(updates.get(row.id) || {}) }))
    };
  }
  function mergeHistory(previous, draft) {
    const rows = new Map();
    let account_id = null,
      demo = false;
    for (const data of [previous, draft]) {
      if (!data) continue;
      if (account_id && data.account_id && account_id !== data.account_id)
        throw Error('Cannot merge history from another account.');
      if (idOk(data.account_id)) account_id = data.account_id;
      demo = demo || data.demo === true;
      if (
        data.schema !== 'discord-review-decisions/v1' ||
        !Array.isArray(data.entries) ||
        data.entries.length > 20000 ||
        (data.archived_entries !== undefined && !Array.isArray(data.archived_entries))
      )
        throw Error('Unsupported history.');
      const entries = [...(data.archived_entries || []), ...data.entries];
      if (entries.length > 20000) throw Error('History is too large.');
      for (const item of entries) {
        if (item.kind !== 'server') continue;
        if (!idOk(item.id) || !decisions.includes(item.decision))
          throw Error('Invalid history entry.');
        const owned = rows.get(item.id)?.owned_by_me === true || item.owned_by_me === true;
        if (owned && item.decision === 'leave') throw Error('Protected: you are the owner.');
        rows.set(item.id, {
          id: item.id,
          kind: 'server',
          name: text(item.name),
          owned_by_me: owned ? true : null,
          decision: item.decision,
          note: text(item.note, 4000),
          favorite: item.favorite === true,
          topic_override: safeTopic(item.topic_override)
        });
      }
    }
    return {
      schema: 'discord-review-decisions/v1',
      account_id,
      demo,
      execution_authorized: false,
      entries: [...rows.values()]
    };
  }
  const api = { importInventory, makeDraft, restoreDraft, mergeHistory, topics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.VisualReview = api;
})();
