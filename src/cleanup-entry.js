/* Browser entry: explicit local start, bounded approved scope, durable progress and result download. */
(async () => {
  'use strict';
  const plan = globalThis.DISCORD_CLEANUP_APPROVED_PLAN;
  if (globalThis.DiscordCleanup?.state?.running) throw Error('A cleanup is already running.');
  const core = globalThis.DiscordCleanupCore,
    native = globalThis.DiscordCleanupNative;
  if (!plan || !core || !native) throw Error('The plan or an execution component is missing.');
  core.validatePlan(plan);
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(plan);
  document.getElementById('discord-cleanup-panel')?.remove();
  const panel = document.createElement('section');
  panel.id = 'discord-cleanup-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    right: '20px',
    top: '20px',
    width: '440px',
    maxWidth: 'calc(100vw - 40px)',
    background: '#151b29',
    color: '#edf0ff',
    border: '2px solid #9688ef',
    borderRadius: '14px',
    padding: '22px',
    zIndex: '2147483647',
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: '13px',
    boxShadow: '0 10px 50px #0009'
  });
  const add = (tag, text) => {
    const element = document.createElement(tag);
    element.textContent = text;
    panel.append(element);
    return element;
  };
  add('h2', 'Approved Discord cleanup');
  add(
    'p',
    plan.expected_counts.leave +
      ' departures · ' +
      plan.expected_counts.delete +
      ' owned-server deletions · ' +
      plan.expected_counts.retain +
      ' servers remaining.'
  );
  add('p', 'Only the approved plan will run. Notification settings will not change.');
  if (plan.delete.length)
    add(
      'p',
      'Owned-server deletion is irreversible. If Discord requests a password or 2FA, complete it yourself in Discord.'
    );
  const status = add('p', 'Checking native controls…');
  status.setAttribute('role', 'status');
  const progress = add('progress', '');
  progress.max = Math.max(
    1,
    plan.leave.length + plan.delete.length + (plan.authorization.folders ? 1 : 0)
  );
  progress.value = 0;
  progress.style.width = '100%';
  const start = add('button', 'Start approved cleanup');
  start.id = 'discord-cleanup-start';
  start.disabled = true;
  const stop = add('button', 'Stop subsequent actions');
  stop.disabled = true;
  const save = add('button', 'Download result');
  for (const button of [start, stop, save])
    Object.assign(button.style, {
      padding: '10px',
      margin: '7px 5px 0 0',
      borderRadius: '7px',
      cursor: 'pointer'
    });
  add('small', 'Stopping cannot undo completed actions or cancel an in-flight request.');
  const state = { running: false, stop: false },
    key = 'discord-review.cleanup.' + plan.plan_id;
  const names = new Map([...plan.leave, ...plan.delete].map((r) => [r.id, r.name]));
  const journal = {
    schema: 'discord-cleanup-result/v1',
    plan_id: plan.plan_id,
    source_hashes: plan.source_hashes,
    expected_counts: plan.expected_counts,
    status: 'ready',
    events: [],
    report: null,
    folders_before: null,
    membership_before: null
  };
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('discord-review-cleanup', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('journals'))
        request.result.createObjectStore('journals');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Could not open the local execution journal.'));
  });
  const persist = async () => {
    const db = await database;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('journals', 'readwrite');
      transaction.objectStore('journals').put(JSON.stringify(journal), key);
      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(Error('Could not persist progress; execution will not continue.'));
      transaction.onabort = () => reject(Error('Progress persistence was aborted.'));
    });
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discord-cleanup-result.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const api = {
    state,
    report: null,
    stop() {
      state.stop = true;
      status.textContent =
        'Stopping before the next action. An in-flight request cannot be cancelled.';
    },
    download
  };
  globalThis.DiscordCleanup = api;
  document.body.append(panel);
  let deps;
  try {
    deps = native.makeAdapter(globalThis.Vencord, plan, {
      shouldStop: () => state.stop,
      onEvent: async (event) => {
        journal.events.push({ ...event, at: new Date().toISOString() });
        await persist();
        const verb =
          event.stage === 'leave'
            ? 'Leave'
            : event.stage === 'delete'
              ? 'Delete'
              : 'Organize folders';
        status.textContent =
          event.phase === 'before'
            ? verb + ': ' + (names.get(event.target_id) || 'approved layout')
            : 'Verified: ' + (names.get(event.target_id) || 'folder order');
        progress.value = journal.events.filter((e) => e.phase === 'verified').length;
      }
    });
    journal.folders_before = deps.readFolders();
    journal.membership_before = deps.listGuildIds();
    await persist();
    start.disabled = false;
    status.textContent = 'Controls available. Start runs only the approved selection.';
  } catch (error) {
    status.textContent = 'Blocked without account changes: ' + error.message;
    start.disabled = true;
    journal.status = 'blocked';
    journal.error = String(error.message).slice(0, 500);
  }
  stop.addEventListener('click', () => api.stop());
  save.addEventListener('click', download);
  start.addEventListener('click', async () => {
    if (state.running || !deps) return;
    state.running = true;
    state.stop = false;
    start.disabled = true;
    stop.disabled = false;
    journal.status = 'running';
    journal.started_at = new Date().toISOString();
    try {
      await persist();
      const report = await core.execute(plan, deps);
      api.report = report;
      journal.report = report;
      journal.status = report.status;
      journal.finished_at = new Date().toISOString();
      journal.membership_after = deps.listGuildIds();
      journal.folders_after = deps.readFolders();
      await persist();
      const verified = report.results.filter((r) => r.outcome === 'performed_and_verified').length;
      status.textContent =
        report.status === 'completed'
          ? 'Completed and verified. Download the result.'
          : 'Stopped with ' +
            verified +
            ' verified actions. ' +
            report.message +
            ' Subsequent actions were not attempted.';
      download();
    } catch (error) {
      journal.status = 'failed';
      journal.error = String(error.message).slice(0, 500);
      status.textContent = 'Stopped: ' + journal.error;
      try {
        await persist();
        download();
      } catch (_) {}
    } finally {
      state.running = false;
      stop.disabled = true;
    }
  });
})();
