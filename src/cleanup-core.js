/* Safe, dependency-injected Discord cleanup execution core. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DiscordCleanupCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ID = /^\d{17,20}$/;
  var SCHEMA = 'discord-cleanup-approved/v1';

  function fail(message) {
    throw new Error(message);
  }
  function isId(value) {
    return typeof value === 'string' && ID.test(value);
  }
  function ids(values, label) {
    if (!Array.isArray(values)) fail(label + ' must be an array');
    values.forEach(function (id) {
      if (!isId(id)) fail(label + ' contains an invalid snowflake id');
    });
  }
  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function unique(values, label) {
    if (new Set(values).size !== values.length) fail(label + ' must be unique');
  }
  function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail(label + ' must be an object');
  }
  function validatePlan(plan) {
    requireObject(plan, 'plan');
    if (plan.schema !== SCHEMA) fail('unsupported plan schema');
    if (plan.execution_authorized !== true) fail('execution authorization is required');
    requireObject(plan.authorization, 'authorization');
    ['leave', 'delete', 'folders'].forEach(function (key) {
      if (typeof plan.authorization[key] !== 'boolean')
        fail('authorization.' + key + ' must be explicit');
    });
    if (plan.authorization.muting !== false || Object.prototype.hasOwnProperty.call(plan, 'muting'))
      fail('muting is not authorized and no muting action is permitted');
    if (!isId(plan.expected_user_id)) fail('expected_user_id must be a snowflake id');
    if (plan.priority_top_server_id !== null && !isId(plan.priority_top_server_id))
      fail('priority_top_server_id must be null or a snowflake id');
    if (typeof plan.plan_id !== 'string' || !plan.plan_id) fail('plan_id is required');
    ids(plan.expected_server_ids, 'expected_server_ids');
    unique(plan.expected_server_ids, 'expected_server_ids');
    ['leave', 'delete'].forEach(function (key) {
      if (!Array.isArray(plan[key])) fail(key + ' must be an array');
      plan[key].forEach(function (item) {
        requireObject(item, key + ' item');
        if (!isId(item.id) || typeof item.name !== 'string')
          fail(key + ' item requires id and name');
      });
      unique(
        plan[key].map(function (x) {
          return x.id;
        }),
        key
      );
    });
    ids(plan.retain_ids, 'retain_ids');
    unique(plan.retain_ids, 'retain_ids');
    ['leave', 'delete'].forEach(function (key) {
      if (plan[key].length && !plan.authorization[key])
        fail('authorization.' + key + ' is required for selected actions');
    });
    var leaveIds = plan.leave.map(function (x) {
      return x.id;
    });
    var deleteIds = plan.delete.map(function (x) {
      return x.id;
    });
    var all = leaveIds.concat(deleteIds, plan.retain_ids);
    unique(all, 'leave/delete/retain ids');
    if (
      all.length !== plan.expected_server_ids.length ||
      all.some(function (id) {
        return !plan.expected_server_ids.includes(id);
      })
    )
      fail('leave/delete/retain union must exactly equal expected_server_ids');
    requireObject(plan.expected_counts, 'expected_counts');
    ['leave', 'delete', 'retain'].forEach(function (key) {
      var actual = key === 'retain' ? plan.retain_ids.length : plan[key].length;
      if (!Number.isInteger(plan.expected_counts[key]) || plan.expected_counts[key] !== actual)
        fail('expected count mismatch for ' + key);
    });
    if (plan.folders === null) {
      if (plan.authorization.folders || plan.priority_top_server_id !== null)
        fail('folder authorization/pins require an explicit layout');
      return true;
    }
    if (!plan.authorization.folders || !Array.isArray(plan.folders))
      fail('folders require explicit authorization and an array');
    plan.folders.forEach(function (folder) {
      requireObject(folder, 'folder');
      if (!(
        folder.folder_id === null ||
        (Number.isInteger(folder.folder_id) &&
          folder.folder_id > 0 &&
          folder.folder_id <= 0xffffffff)
      ))
        fail('folder_id must be null or a positive uint32');
      if (!(folder.folder_name === null || typeof folder.folder_name === 'string'))
        fail('folder_name must be null or string');
      if (!(
        folder.folder_color === null ||
        (Number.isInteger(folder.folder_color) &&
          folder.folder_color >= 0 &&
          folder.folder_color <= 0xffffff)
      ))
        fail('folder_color must be null or a valid RGB integer');
      ids(folder.guild_ids, 'folder guild_ids');
    });
    unique(
      plan.folders
        .filter(function (x) {
          return x.folder_id !== null;
        })
        .map(function (x) {
          return x.folder_id;
        }),
      'native folder ids'
    );
    var flattened = plan.folders.flatMap(function (x) {
      return x.guild_ids;
    });
    unique(flattened, 'folder guild ids');
    if (
      flattened.length !== plan.retain_ids.length ||
      flattened.some(function (id) {
        return !plan.retain_ids.includes(id);
      })
    )
      fail('folder flatten must exactly equal retain_ids');
    var first = plan.folders[0];
    if (
      plan.priority_top_server_id !== null &&
      (!first ||
        first.folder_id !== null ||
        first.guild_ids.length !== 1 ||
        first.guild_ids[0] !== plan.priority_top_server_id ||
        !plan.retain_ids.includes(plan.priority_top_server_id))
    )
      fail('first node must be the standalone pinned server');
    return true;
  }

  function report() {
    return {
      status: 'running',
      events: [],
      results: [],
      message: null,
      target_id: null,
      stage: null,
      folders: null
    };
  }
  async function execute(plan, deps) {
    var r = report();
    function stop(stage, target) {
      r.status = 'stopped';
      r.stage = stage;
      r.target_id = target || null;
      r.message = 'execution stopped';
      return r;
    }
    function failed(stage, target, error) {
      r.status = 'failed';
      r.stage = stage;
      r.target_id = target || null;
      r.message = error && error.message ? error.message : String(error);
      return r;
    }
    async function event(e) {
      await deps.onEvent(e);
      r.events.push(e);
    }
    function account() {
      if (deps.currentUserId() !== plan.expected_user_id)
        fail('current account does not match expected_user_id');
    }
    function membership(requireExact) {
      var current = deps.listGuildIds();
      ids(current, 'current guild ids');
      unique(current, 'current guild ids');
      var allowed = new Set(plan.expected_server_ids);
      if (
        current.some(function (id) {
          return !allowed.has(id);
        })
      )
        fail('unexpected current membership');
      if (
        plan.retain_ids.some(function (id) {
          return !current.includes(id);
        })
      )
        fail('missing retained membership');
      if (
        requireExact &&
        (current.length !== plan.retain_ids.length ||
          current.some(function (id) {
            return !plan.retain_ids.includes(id);
          }))
      )
        fail('remaining membership does not exactly equal retain_ids');
    }
    async function verifyAbsent(id) {
      var waited = await deps.waitAbsent(id);
      if (waited !== true || deps.getGuild(id) !== null)
        fail('absence verification is unknown or failed');
    }
    try {
      validatePlan(plan);
    } catch (e) {
      return failed('plan', null, e);
    }
    var required = [
      'currentUserId',
      'getGuild',
      'listGuildIds',
      'leaveGuild',
      'deleteGuild',
      'waitAbsent',
      'applyFolders',
      'readFolders',
      'shouldStop',
      'onEvent'
    ];
    try {
      required.forEach(function (key) {
        if (typeof deps[key] !== 'function') fail('missing dependency: ' + key);
      });
      account();
      membership(false);
    } catch (e) {
      return failed(e.message.indexOf('account') >= 0 ? 'account' : 'membership', null, e);
    }
    try {
      plan.leave.forEach(function (item) {
        var g = deps.getGuild(item.id);
        if (g && g.ownerId === plan.expected_user_id) fail('departure target is currently owned');
      });
      plan.delete.forEach(function (item) {
        var g = deps.getGuild(item.id);
        if (g && g.ownerId !== plan.expected_user_id)
          fail('deletion target is not currently owned');
      });
    } catch (e) {
      return failed('preflight', null, e);
    }
    async function operation(kind, item) {
      if (deps.shouldStop()) return stop(kind, item.id);
      try {
        account();
        membership(false);
      } catch (e) {
        return failed(e.message.indexOf('account') >= 0 ? 'account' : 'membership', item.id, e);
      }
      var guild;
      try {
        guild = deps.getGuild(item.id);
      } catch (e) {
        return failed('lookup', item.id, e);
      }
      if (!guild) {
        r.results.push({ id: item.id, action: kind, outcome: 'already_absent' });
        return null;
      }
      try {
        await event({ phase: 'before', stage: kind, target_id: item.id, plan_id: plan.plan_id });
      } catch (e) {
        return failed('event', item.id, e);
      }
      if (deps.shouldStop()) return stop(kind, item.id);
      try {
        account();
      } catch (e) {
        return failed('account', item.id, e);
      }
      try {
        var latest = deps.getGuild(item.id);
        if (
          !latest ||
          (kind === 'leave' && latest.ownerId === plan.expected_user_id) ||
          (kind === 'delete' && latest.ownerId !== plan.expected_user_id)
        )
          fail('ownership changed immediately before mutation');
        await (kind === 'leave' ? deps.leaveGuild(item.id) : deps.deleteGuild(item.id));
      } catch (e) {
        return failed(kind, item.id, e);
      }
      try {
        await verifyAbsent(item.id);
      } catch (e) {
        return failed('verify_absent', item.id, e);
      }
      r.results.push({ id: item.id, action: kind, outcome: 'performed_and_verified' });
      try {
        await event({ phase: 'verified', stage: kind, target_id: item.id, plan_id: plan.plan_id });
      } catch (e) {
        return failed('event', item.id, e);
      }
      return null;
    }
    for (var i = 0; i < plan.leave.length; i++) {
      var a = await operation('leave', plan.leave[i]);
      if (a) return a;
    }
    for (var j = 0; j < plan.delete.length; j++) {
      var b = await operation('delete', plan.delete[j]);
      if (b) return b;
    }
    if (!plan.authorization.folders) {
      try {
        account();
        membership(true);
      } catch (e) {
        return failed('membership', null, e);
      }
      r.status = 'completed';
      r.stage = 'complete';
      r.message = 'all approved operations verified; folders unchanged';
      return r;
    }
    if (deps.shouldStop()) return stop('folders');
    try {
      account();
      membership(true);
    } catch (e) {
      return failed(e.message.indexOf('account') >= 0 ? 'account' : 'membership', 'folders', e);
    }
    try {
      await event({
        phase: 'before',
        stage: 'folders',
        target_id: 'folders',
        plan_id: plan.plan_id
      });
    } catch (e) {
      return failed('event', 'folders', e);
    }
    if (deps.shouldStop()) return stop('folders');
    try {
      account();
    } catch (e) {
      return failed('account', 'folders', e);
    }
    try {
      await deps.applyFolders(plan.folders);
    } catch (e) {
      return failed('folders', 'folders', e);
    }
    try {
      if (!same(deps.readFolders(), plan.folders))
        fail('folder readback does not match approved folders');
    } catch (e) {
      return failed('verify_folders', 'folders', e);
    }
    r.folders = plan.folders;
    try {
      await event({
        phase: 'verified',
        stage: 'folders',
        target_id: 'folders',
        plan_id: plan.plan_id
      });
    } catch (e) {
      return failed('event', 'folders', e);
    }
    try {
      account();
      membership(true);
    } catch (e) {
      return failed(e.message.indexOf('account') >= 0 ? 'account' : 'membership', null, e);
    }
    r.status = 'completed';
    r.stage = 'complete';
    r.message = 'all approved operations verified';
    return r;
  }
  return { validatePlan: validatePlan, execute: execute };
});
