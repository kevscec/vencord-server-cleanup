/* Native Vencord adapter. No token access, fetch, REST fallback or notification changes. */
(() => {
  'use strict';
  function makeAdapter(Vencord, plan, options = {}) {
    if (plan?.execution_authorized !== true) throw Error('Execution is not authorized.');
    const w = Vencord?.Webpack;
    if (!w?.findStore || !w.findByProps || !w.find)
      throw Error('Vencord does not expose the required controls.');
    const guilds = w.findStore('GuildStore'),
      users = w.findStore('UserStore'),
      sorted = w.findStore('SortedGuildStore');
    const actions =
      plan.leave.length || plan.delete.length
        ? w.findByProps(
            ...[
              ...(plan.leave.length ? ['leaveGuild'] : []),
              ...(plan.delete.length ? ['deleteGuild'] : [])
            ]
          )
        : null;
    const settings =
      plan.folders === null
        ? null
        : w.find(
            (m) =>
              m?.ProtoClass?.typeName?.endsWith('.PreloadedUserSettings') &&
              typeof m.updateAsync === 'function'
          );
    const field = settings?.ProtoClass?.fields?.find((f) => f.localName === 'guildFolders')?.T();
    const folderType = field?.fields?.find((f) => f.localName === 'folders')?.T();
    if (
      !guilds?.getGuilds ||
      !users?.getCurrentUser ||
      !sorted?.getGuildFolders ||
      (plan.leave.length && !actions?.leaveGuild) ||
      (plan.delete.length && !actions?.deleteGuild) ||
      (plan.folders !== null && !folderType?.fromJson)
    )
      throw Error('Compatible native controls are unavailable. Nothing was changed.');
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const pause = options.paceMs ?? 1500,
      waitMs = options.waitMs ?? 15000;
    const currentUserId = () => users.getCurrentUser()?.id || null;
    const getGuild = (id) =>
      (typeof guilds.getGuild === 'function' ? guilds.getGuild(id) : guilds.getGuilds()[id]) ||
      null;
    const check = () => {
      if (currentUserId() !== plan.expected_user_id)
        throw Error('The account changed; execution stopped.');
      if (options.shouldStop?.()) throw Error('Stopped by the user.');
    };
    function readFolders() {
      const folders = sorted.getGuildFolders();
      if (!Array.isArray(folders)) throw Error('Could not verify folder order.');
      return folders.map((f) => ({
        folder_id: f.folderId == null ? null : Number(f.folderId),
        folder_name: typeof f.folderName === 'string' ? f.folderName : null,
        folder_color: Number.isSafeInteger(f.folderColor) ? f.folderColor : null,
        guild_ids: [...f.guildIds]
      }));
    }
    const proto = (folders) =>
      folders.map((f) =>
        folderType.fromJson({
          ...(f.folder_id === null
            ? {}
            : {
                id: String(f.folder_id),
                ...(f.folder_name === null ? {} : { name: f.folder_name }),
                ...(f.folder_color === null ? {} : { color: f.folder_color })
              }),
          guildIds: [...f.guild_ids]
        })
      );
    check();
    if (plan.folders !== null) proto(plan.folders);
    readFolders();
    const authorized = {
      leave: new Set(plan.leave.map((r) => r.id)),
      delete: new Set(plan.delete.map((r) => r.id))
    };
    async function timeout(promise) {
      let timer;
      try {
        return await Promise.race([
          Promise.resolve(promise),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error(
                    'Discord did not confirm in time. The action may still be pending; it will not be retried.'
                  )
                ),
              options.actionTimeoutMs ?? 120000
            );
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function mutate(kind, id) {
      if (!authorized[kind].has(id)) throw Error('ID is outside the approved scope.');
      await sleep(pause);
      check();
      const g = getGuild(id);
      if (!g) throw Error('The server is no longer present.');
      if (kind === 'delete' && g.ownerId !== plan.expected_user_id)
        throw Error('You do not own the deletion target.');
      if (kind === 'leave' && g.ownerId === plan.expected_user_id)
        throw Error('An owned server cannot be a departure target.');
      await timeout(kind === 'leave' ? actions.leaveGuild(id) : actions.deleteGuild(id));
    }
    return {
      currentUserId,
      getGuild,
      listGuildIds: () => Object.keys(guilds.getGuilds()),
      readFolders,
      shouldStop: () => options.shouldStop?.() === true,
      onEvent: options.onEvent || (() => {}),
      leaveGuild: (id) => mutate('leave', id),
      deleteGuild: (id) => mutate('delete', id),
      async waitAbsent(id) {
        const start = Date.now();
        do {
          check();
          if (!getGuild(id)) return true;
          if (Date.now() - start >= waitMs) return false;
          await sleep(250);
        } while (true);
      },
      async applyFolders(folders) {
        check();
        if (plan.folders === null || JSON.stringify(folders) !== JSON.stringify(plan.folders))
          throw Error('Folder order does not match the approved plan.');
        const ids = Object.keys(guilds.getGuilds());
        if (
          ids.length !== plan.retain_ids.length ||
          ids.some((id) => !plan.retain_ids.includes(id))
        )
          throw Error('Membership changed before organization.');
        const prepared = proto(folders);
        await timeout(
          settings.updateAsync(
            'guildFolders',
            (value) => {
              check();
              if (!Array.isArray(value.folders)) throw Error('Unsupported folder structure.');
              const live = Object.keys(guilds.getGuilds());
              if (
                live.length !== plan.retain_ids.length ||
                live.some((id) => !plan.retain_ids.includes(id))
              )
                throw Error('Membership changed during organization.');
              value.folders = prepared;
            },
            0
          )
        );
        const start = Date.now();
        do {
          check();
          if (JSON.stringify(readFolders()) === JSON.stringify(folders)) return;
          if (Date.now() - start >= waitMs)
            throw Error('The new folder order could not be confirmed.');
          await sleep(250);
        } while (true);
      }
    };
  }
  const api = { makeAdapter };
  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined')
    module.exports = api;
  else globalThis.DiscordCleanupNative = api;
})();
