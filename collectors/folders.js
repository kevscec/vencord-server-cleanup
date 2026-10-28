/* Read-only snapshot of Discord's native folder order. No mutations or network. */
(() => {
  'use strict';
  function collect() {
    const find = globalThis.Vencord?.Webpack?.findStore;
    if (typeof find !== 'function') throw Error('Vencord is unavailable for reading folders.');
    let sorted, guilds;
    try {
      sorted = find('SortedGuildStore');
      guilds = find('GuildStore');
    } catch (_) {
      throw Error('Could not read folders; nothing was changed.');
    }
    if (typeof sorted?.getGuildFolders !== 'function')
      throw Error('Folder reader is unavailable; nothing was changed.');
    const raw = sorted.getGuildFolders();
    if (!Array.isArray(raw)) throw Error('Unsupported folder format; nothing was changed.');
    const validId = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);
    const warnings = [],
      allIds = [];
    const folders = raw.map((folder, index) => {
      if (!Array.isArray(folder.guildIds) || !folder.guildIds.every(validId))
        throw Error('Unrecognized server IDs in folders. Nothing was changed.');
      const rawId = folder.folderId;
      if (
        rawId !== undefined &&
        rawId !== null &&
        !(typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId >= 0) &&
        !(typeof rawId === 'string' && /^\d+$/.test(rawId))
      )
        throw Error('Unsupported folder ID.');
      allIds.push(...folder.guildIds);
      return {
        position: index,
        folder_id: rawId ?? null,
        folder_name: typeof folder.folderName === 'string' ? folder.folderName : null,
        folder_color: Number.isSafeInteger(folder.folderColor) ? folder.folderColor : null,
        guild_ids: [...folder.guildIds]
      };
    });
    const known = typeof guilds?.getGuilds === 'function' ? guilds.getGuilds() : {};
    const guild_names = {};
    for (const [id, g] of Object.entries(known || {}))
      if (validId(id)) guild_names[id] = String(g.name || id);
    if (new Set(allIds).size !== allIds.length)
      warnings.push('Duplicate IDs across nodes: review before planning changes.');
    const missing = Object.keys(guild_names).filter((id) => !allIds.includes(id));
    if (missing.length) warnings.push('Some cached servers are missing from the captured order.');
    return {
      schema: 'discord-folders/v1',
      captured_at: new Date().toISOString(),
      mode: 'read-only-cache',
      account_id: (() => {
        try {
          return find('UserStore')?.getCurrentUser?.()?.id || null;
        } catch (_) {
          return null;
        }
      })(),
      execution_authorized: false,
      folders,
      guild_names,
      unique_server_count: new Set(allIds).size,
      missing_from_order: missing,
      warnings
    };
  }
  function download(data, env = globalThis) {
    const url = env.URL.createObjectURL(
      new env.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const a = env.document.createElement('a');
    a.href = url;
    a.download = 'discord-folders-current.json';
    env.document.body.appendChild(a);
    a.click();
    a.remove();
    env.setTimeout(() => env.URL.revokeObjectURL(url), 10000);
  }
  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined')
    module.exports = { collect, download };
  else {
    try {
      const result = collect();
      download(result);
      console.info('Folders and order captured. Discord was not modified.', {
        nodes: result.folders.length,
        servers: result.unique_server_count,
        warnings: result.warnings
      });
    } catch (error) {
      console.error('Discord Review: ' + error.message);
    }
  }
})();
