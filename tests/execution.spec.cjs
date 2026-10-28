const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url');
const fixture = require('./fixtures.cjs'),
  planning = require('../src/plan.js'),
  bundling = require('../src/bundle.js'),
  results = require('../src/results.js');
test('generated executor runs only the approved native operations after Start', async ({
  page
}) => {
  const preview = planning.createPlan({
    inventory: fixture.inventory(),
    decisions: fixture.decisions(),
    folderSnapshot: fixture.folders(),
    deleteOwnedIds: [fixture.ids.own],
    pinnedIds: [fixture.ids.study]
  });
  const approved = planning.authorizePlan(preview, {
    leave: true,
    delete: true,
    folders: true,
    confirmDeleteIds: [fixture.ids.own]
  });
  await page.goto(pathToFileURL(path.join(__dirname, 'execution-harness.html')).href);
  await page.evaluate(
    ({ inventory, plan, snapshot }) => {
      const guilds = Object.fromEntries(
        inventory.entries.map((r) => [r.id, { id: r.id, ownerId: r.owner_id }])
      );
      let folders = snapshot.folders.map((f) => ({
        folderId: f.folder_id ?? undefined,
        folderName: f.folder_name ?? undefined,
        folderColor: f.folder_color ?? undefined,
        guildIds: f.guild_ids
      }));
      window.NATIVE_FIXTURE_CALLS = [];
      const type = {
        fromJson(d) {
          return {
            guildIds: d.guildIds,
            ...(d.id
              ? { id: { value: d.id }, name: { value: d.name }, color: { value: d.color } }
              : {})
          };
        }
      };
      const settings = {
        ProtoClass: {
          typeName: 'fixture.PreloadedUserSettings',
          fields: [
            {
              localName: 'guildFolders',
              T: () => ({ fields: [{ localName: 'folders', T: () => type }] })
            }
          ]
        },
        async updateAsync(key, cb) {
          const value = { folders: [] };
          cb(value);
          folders = value.folders.map((f) => ({
            folderId: f.id ? Number(f.id.value) : undefined,
            folderName: f.name?.value,
            folderColor: f.color?.value,
            guildIds: f.guildIds
          }));
          window.NATIVE_FIXTURE_CALLS.push('folders');
        }
      };
      const actions = {
        async leaveGuild(id) {
          window.NATIVE_FIXTURE_CALLS.push('leave:' + id);
          delete guilds[id];
        },
        async deleteGuild(id) {
          window.NATIVE_FIXTURE_CALLS.push('delete:' + id);
          delete guilds[id];
        }
      };
      const stores = {
        GuildStore: { getGuilds: () => guilds, getGuild: (id) => guilds[id] },
        UserStore: { getCurrentUser: () => ({ id: plan.expected_user_id }) },
        SortedGuildStore: { getGuildFolders: () => folders }
      };
      window.Vencord = {
        Webpack: {
          findStore: (name) => stores[name],
          findByProps: () => actions,
          find: (predicate) => (predicate(settings) ? settings : null)
        }
      };
      window.fetch = () => {
        throw Error('No network calls are permitted in this synthetic test.');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw Error('Unavailable, as in some Discord contexts.');
        }
      });
    },
    { inventory: fixture.inventory(), plan: approved, snapshot: fixture.folders() }
  );
  await page.addScriptTag({ content: bundling.buildExecutor(approved) });
  await expect(page.locator('#discord-cleanup-panel')).toBeVisible();
  expect(await page.evaluate(() => window.NATIVE_FIXTURE_CALLS)).toEqual([]);
  const downloaded = page.waitForEvent('download');
  await page.locator('#discord-cleanup-start').click();
  const file = await downloaded;
  const result = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  expect(results.verifyResult(preview, result).verified).toBe(true);
  expect(await page.evaluate(() => window.NATIVE_FIXTURE_CALLS)).toEqual([
    'leave:' + fixture.ids.games,
    'delete:' + fixture.ids.own,
    'folders'
  ]);
});
