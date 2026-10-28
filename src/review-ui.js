/* Local-only visual reviewer. No account actions or Discord API calls. */
(() => {
  'use strict';
  const api = globalThis.VisualReview,
    $ = (id) => document.getElementById(id);
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';
  const STORAGE = 'vencord-server-cleanup.review.v1.' + (DEMO_MODE ? 'demo' : 'real');
  const labels = {
    review: 'To review',
    keep: 'Keep',
    leave: 'Propose leaving',
    mute: 'Consider muting'
  };
  const priorities = {
    old: 'Older signal · review first',
    quiet: 'Signal from 6–12 months ago',
    recent: 'Signal from less than 6 months ago',
    unknown: 'No verified date',
    limited: 'Limited captured access',
    owned: 'Owned · protected'
  };
  const views = [
    ['all', 'All servers'],
    ['pending', 'To review'],
    ['old', 'Older signals'],
    ['friends', 'With detected friends'],
    ['favorite', 'Favorites'],
    ['owned', 'My servers'],
    ['proposed', 'Proposed departures']
  ];
  let inventory = null,
    history = null,
    activeId = null,
    currentView = 'all',
    currentTopic = null,
    filtered = [],
    saveAvailable = true;
  const node = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const status = (message, error = false) => {
    $('status').textContent = message;
    $('status').className = 'status' + (error ? ' error' : '');
  };
  const normalize = (value) =>
    String(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(value)
        )
      : 'No date';
  function stored(suffix) {
    try {
      return JSON.parse(localStorage.getItem(STORAGE + suffix) || 'null');
    } catch (_) {
      return null;
    }
  }
  function writeStorage(suffix, data) {
    try {
      localStorage.setItem(STORAGE + suffix, JSON.stringify(data));
      return true;
    } catch (_) {
      saveAvailable = false;
      $('save-state').textContent = 'Download a backup';
      return false;
    }
  }
  function snapshot() {
    return {
      schema: 'discord-review/v1',
      mode: 'passive-cache-only',
      captured_at: inventory.captured_at,
      account_id: inventory.account_id,
      demo: inventory.demo === true,
      collector_version: inventory.collector_version,
      entries: inventory.rows.map((r) => ({
        id: r.id,
        kind: 'server',
        name: r.name,
        owned_by_me: r.owned_by_me,
        member_count: r.member_count,
        online_count: r.online_count,
        channels: r.channels,
        last_cached_message_at: r.last_cached_message_at,
        icon_url: r.icon_url,
        friend_matches: r.friend_matches,
        friend_coverage: r.friend_coverage,
        owner_name: r.owner_name,
        evidence: r.evidence,
        warnings: r.warnings
      }))
    };
  }
  function exportDraft() {
    const draft = api.makeDraft(inventory),
      ids = new Set(inventory.rows.map((r) => r.id));
    return { ...draft, archived_entries: (history?.entries || []).filter((r) => !ids.has(r.id)) };
  }
  function persist() {
    if (!inventory) return;
    history = api.mergeHistory(history, api.makeDraft(inventory));
    const historySaved = writeStorage('.history', history),
      draftSaved = writeStorage('.draft', exportDraft());
    $('save-state').textContent =
      historySaved && draftSaved && saveAvailable ? 'Saved in this browser' : 'Download a backup';
  }
  function loadInventory(raw) {
    if (DEMO_MODE !== Boolean(raw.demo))
      throw Error(
        'Use the separate demo window for synthetic data and the main window for real captures.'
      );
    let next = api.importInventory(raw);
    const previous = history || stored('.history') || stored('.draft');
    const nextHistory = api.mergeHistory(null, previous);
    if (previous) {
      const ids = new Set(next.rows.map((r) => r.id));
      const owned = new Set(next.rows.filter((r) => r.owned_by_me).map((r) => r.id));
      const entries = nextHistory.entries
        .filter((r) => ids.has(r.id))
        .map((r) => ({
          ...r,
          decision:
            (owned.has(r.id) || r.owned_by_me) && r.decision === 'leave' ? 'keep' : r.decision
        }));
      next = api.restoreDraft(next, { ...nextHistory, entries });
    }
    inventory = next;
    history = nextHistory;
    $('export').disabled = false;
    if (!inventory.rows.some((r) => r.id === activeId)) activeId = null;
    writeStorage('.inventory', snapshot());
    persist();
    const icons = inventory.rows.filter((r) => r.icon_url).length;
    const archived = exportDraft().archived_entries.length;
    status(
      inventory.rows.length +
        ' servers loaded · ' +
        icons +
        ' with an icon in this capture.' +
        (archived
          ? ' Notes and decisions are preserved for ' +
            archived +
            ' servers absent from this capture.'
          : '') +
        ' Proposals are a draft, never execution authorization.'
    );
    render();
  }
  function matchesView(row, view) {
    return (
      view === 'all' ||
      (view === 'pending' && row.decision === 'review') ||
      (view === 'old' && ['old', 'quiet'].includes(row.priority)) ||
      (view === 'friends' && row.friend_matches.length > 0) ||
      (view === 'favorite' && row.favorite) ||
      (view === 'owned' && row.owned_by_me === true) ||
      (view === 'proposed' && row.decision === 'leave')
    );
  }
  function topic(row) {
    return row.topic_override || row.topic;
  }
  function topicNames() {
    return [
      ...new Set([...api.topics, ...inventory.rows.map((r) => r.topic_override).filter(Boolean)])
    ];
  }
  function getFiltered() {
    const query = normalize($('search').value);
    let rows = inventory.rows.filter(
      (r) =>
        matchesView(r, currentView) &&
        (!currentTopic || topic(r) === currentTopic) &&
        ($('decision-filter').value === 'all' || r.decision === $('decision-filter').value)
    );
    if (query)
      rows = rows.filter((r) =>
        normalize(
          [
            r.name,
            r.id,
            r.note,
            ...r.friend_matches.flatMap((f) => [f.display_name, f.username, f.nickname]),
            ...r.channels.map((c) => c.name)
          ].join(' ')
        ).includes(query)
      );
    const ranks = { old: 0, quiet: 1, unknown: 2, limited: 3, recent: 4, owned: 5 };
    return rows.sort((a, b) => {
      if ($('sort').value === 'name') return a.name.localeCompare(b.name, 'en');
      if ($('sort').value === 'friends')
        return (
          b.friend_matches.length - a.friend_matches.length || a.name.localeCompare(b.name, 'en')
        );
      if ($('sort').value === 'members')
        return (
          (a.member_count ?? Infinity) - (b.member_count ?? Infinity) ||
          a.name.localeCompare(b.name, 'en')
        );
      return (
        ranks[a.priority] - ranks[b.priority] ||
        (a.last_cached_message_at || '9999').localeCompare(b.last_cached_message_at || '9999') ||
        a.name.localeCompare(b.name, 'en')
      );
    });
  }
  function avatar(name, url, size) {
    const box = node(
      'div',
      String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] || '')
        .join('')
        .toUpperCase(),
      'avatar' + (size ? ' ' + size : '')
    );
    box.setAttribute('aria-hidden', 'true');
    if (url && $('images').checked) {
      const img = node('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      img.addEventListener('error', () => img.remove(), { once: true });
      box.append(img);
    }
    return box;
  }
  function updateSummary() {
    const rows = inventory.rows,
      eligible = rows.filter((r) => !r.owned_by_me),
      done = eligible.filter((r) => r.decision !== 'review').length;
    $('total').textContent = rows.length;
    $('friend-total').textContent = rows.some((r) => r.friend_coverage === 'cached_partial')
      ? rows.filter((r) => r.friend_matches.length > 0).length
      : '—';
    $('proposal-total').textContent = rows.filter((r) => r.decision === 'leave').length;
    $('progress-caption').textContent =
      done +
      ' / ' +
      eligible.length +
      ' reviewed · ' +
      rows.filter((r) => r.owned_by_me).length +
      (rows.filter((r) => r.owned_by_me).length === 1
        ? ' owned server protected'
        : ' owned servers protected');
    $('progress').max = eligible.length || 1;
    $('progress').value = done;
    $('capture-info').textContent =
      'Captured: ' +
      date(inventory.captured_at) +
      ' (UTC) · Partial cache · Version ' +
      inventory.collector_version;
    const missing = rows.filter((r) => r.friend_coverage === 'unavailable').length;
    const iconCount = rows.filter((r) => r.icon_url).length;
    $('social-notice').textContent =
      (missing === rows.length
        ? 'Friend coverage is unavailable in this capture. Import a new capture to try detecting friends. Unavailable data does not mean zero friends.'
        : 'Displayed friends are matches between your friend list and cached server members. This list may be incomplete' +
          (missing ? ' (' + missing + ' servers without friend coverage).' : '.')) +
      (iconCount
        ? ' ' + iconCount + ' icons available; enable images below to load them from Discord CDN.'
        : ' No icons are available in this capture.') +
      ' Your notes and inventory are not uploaded.';
  }
  function renderNav() {
    $('views').replaceChildren();
    $('topics').replaceChildren();
    for (const [key, label] of views) {
      const b = node(
        'button',
        undefined,
        'nav-item' + (currentView === key && !currentTopic ? ' active' : '')
      );
      b.dataset.view = key;
      b.append(
        node('span', label),
        node('span', String(inventory.rows.filter((r) => matchesView(r, key)).length), 'count')
      );
      b.addEventListener('click', () => {
        currentView = key;
        currentTopic = null;
        render();
      });
      $('views').append(b);
    }
    for (const name of topicNames()) {
      const count = inventory.rows.filter((r) => topic(r) === name).length;
      if (!count) continue;
      const b = node('button', undefined, 'nav-item' + (currentTopic === name ? ' active' : ''));
      b.dataset.topic = name;
      b.append(node('span', name), node('span', String(count), 'count'));
      b.addEventListener('click', () => {
        currentTopic = name;
        currentView = 'all';
        render();
      });
      $('topics').append(b);
    }
  }
  function renderList() {
    $('server-list').replaceChildren();
    for (const row of filtered) {
      const b = node('button', undefined, 'server-row' + (row.id === activeId ? ' active' : ''));
      b.dataset.serverId = row.id;
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', row.name + ' · ' + labels[row.decision]);
      b.setAttribute('aria-current', String(row.id === activeId));
      const copy = node('span', undefined, 'row-copy');
      copy.append(node('span', (row.favorite ? '★ ' : '') + row.name, 'row-title'));
      const social = row.friend_matches.length
        ? row.friend_matches.length +
          ' friend' +
          (row.friend_matches.length > 1 ? 's' : '') +
          ' detected'
        : row.friend_coverage === 'cached_partial'
          ? 'No cached matches'
          : 'Friends unverified';
      copy.append(
        node(
          'span',
          (row.member_count === null
            ? 'Member count unavailable'
            : row.member_count.toLocaleString('en-US') +
              (row.member_count === 1 ? ' member' : ' members')) +
            ' · ' +
            social,
          'row-sub'
        )
      );
      b.append(
        avatar(row.name, row.icon_url),
        copy,
        node('span', undefined, 'row-decision ' + row.decision)
      );
      b.addEventListener('click', () => {
        activeId = row.id;
        renderList();
        renderDetail();
      });
      $('server-list').append(b);
    }
    if (!filtered.length)
      $('server-list').append(
        node('div', 'No matches. Change the view, search, or filters.', 'empty-state')
      );
    $('view-title').textContent =
      currentTopic || views.find(([key]) => key === currentView)?.[1] || 'Servidores';
    $('shown').textContent = filtered.length;
  }
  function setDecision(value) {
    const row = inventory.rows.find((r) => r.id === activeId);
    if (!row || (row.owned_by_me && value === 'leave')) return;
    row.decision = value;
    persist();
    render();
  }
  function go(delta) {
    const i = filtered.findIndex((r) => r.id === activeId),
      row = filtered[i + delta];
    if (row) {
      activeId = row.id;
      renderList();
      renderDetail();
    }
  }
  function renderDetail() {
    const container = $('detail');
    container.replaceChildren();
    const row = inventory.rows.find((r) => r.id === activeId);
    const index = filtered.findIndex((r) => r.id === activeId);
    $('prev').disabled = index <= 0;
    $('next').disabled = index < 0 || index >= filtered.length - 1;
    $('position').textContent =
      index >= 0 ? index + 1 + ' de ' + filtered.length + ' in this view' : '';
    if (!row) {
      container.append(node('div', 'Select a server to review it.', 'empty-state'));
      return;
    }
    const hero = node('div', undefined, 'hero'),
      heroCopy = node('div', undefined, 'hero-copy');
    heroCopy.append(
      node('h2', row.name),
      node(
        'div',
        row.owner_name
          ? 'Owner: ' + row.owner_name
          : row.owned_by_me
            ? 'You own this server'
            : 'Server ' + row.id,
        'caption'
      )
    );
    const favorite = node(
      'button',
      row.favorite ? '★' : '☆',
      'favorite' + (row.favorite ? ' on' : '')
    );
    favorite.id = 'favorite';
    favorite.title = 'Mark as favorite (does not perform account actions)';
    favorite.setAttribute('aria-label', 'Mark favorite');
    favorite.setAttribute('aria-pressed', String(row.favorite));
    favorite.addEventListener('click', () => {
      row.favorite = !row.favorite;
      persist();
      render();
    });
    hero.append(avatar(row.name, row.icon_url, 'hero-icon'), heroCopy, favorite);
    container.append(hero);
    const tags = node('div', undefined, 'detail-tags');
    tags.append(
      node('span', priorities[row.priority], 'pill ' + row.priority),
      node('span', topic(row) + (row.topic_override ? '' : ' · suggested'), 'pill')
    );
    container.append(tags);
    const facts = node('div', undefined, 'facts');
    for (const [value, label] of [
      [
        row.member_count === null ? 'Unavailable' : row.member_count.toLocaleString('en-US'),
        'Cached member count'
      ],
      [date(row.last_cached_message_at), 'Last known signal · UTC'],
      [String(row.channels.length), 'Captured channels/categories']
    ]) {
      const fact = node('div', undefined, 'fact');
      fact.append(node('strong', value), node('span', label));
      facts.append(fact);
    }
    container.append(facts);
    const heading = node('div', undefined, 'section-heading');
    heading.append(
      node('h3', 'Friends detected here'),
      node(
        'span',
        row.friend_coverage === 'cached_partial' ? 'Partial cache' : 'Unverified',
        'pill'
      )
    );
    container.append(heading);
    const friends = node('div', undefined, 'friends');
    for (const friend of row.friend_matches) {
      const card = node('button', undefined, 'friend');
      card.title = 'Show servers where this friend was detected';
      card.setAttribute('aria-label', 'Show servers with ' + friend.display_name);
      card.addEventListener('click', () => {
        currentView = 'all';
        currentTopic = null;
        $('decision-filter').value = 'all';
        $('search').value = friend.username || friend.display_name;
        render();
      });
      const copy = node('div');
      copy.append(node('strong', friend.display_name));
      if (friend.username) copy.append(node('small', '@' + friend.username));
      if (friend.nickname && friend.nickname !== friend.display_name)
        copy.append(node('small', 'In this server: ' + friend.nickname));
      card.append(avatar(friend.display_name, friend.avatar_url, 'friend-avatar'), copy);
      friends.append(card);
    }
    if (!row.friend_matches.length)
      friends.append(
        node(
          'div',
          row.friend_coverage === 'cached_partial'
            ? 'No matches were detected in this server cache. This does not mean you have no friends here.'
            : 'Friend data is unavailable. Import a new capture to try detecting cached matches without requesting members.',
          'empty-friends'
        )
      );
    container.append(friends);
    if (row.friend_matches.length)
      container.append(
        node(
          'p',
          'These friends appear in cached members; there may be more. Membership does not establish current participation.',
          'tiny'
        )
      );
    const block = node('div', undefined, 'decision-block');
    block.append(
      node('h3', 'What would you like to do with this server?'),
      node(
        'div',
        row.owned_by_me
          ? 'Protected because you own this server. It cannot be marked for departure.'
          : 'Draft only. Nothing is executed in Discord.',
        'tiny'
      )
    );
    const choices = node('div', undefined, 'decision-buttons');
    for (const [value, label] of Object.entries(labels)) {
      const b = node(
        'button',
        label,
        'decision-button ' + value + (row.decision === value ? ' selected' : '')
      );
      b.dataset.decision = value;
      b.disabled = value === 'leave' && row.owned_by_me === true;
      b.setAttribute('aria-pressed', String(row.decision === value));
      b.addEventListener('click', () => setDecision(value));
      choices.append(b);
    }
    block.append(choices);
    const notes = node('textarea');
    notes.id = 'notes';
    notes.maxLength = 4000;
    notes.value = row.note;
    notes.placeholder = 'Who is here? Why keep it or leave?';
    notes.setAttribute('aria-label', 'Notes for ' + row.name);
    notes.addEventListener('input', () => {
      row.note = notes.value;
      persist();
    });
    block.append(notes);
    container.append(block);
    const topicControl = node('div', undefined, 'topic-control'),
      topicLabel = node('label', 'Folder group');
    topicLabel.htmlFor = 'topic-edit';
    const select = node('select', undefined, 'topic-select');
    select.id = 'topic-edit';
    const auto = node('option', 'Suggested: ' + row.topic);
    auto.value = '';
    select.append(auto);
    for (const name of topicNames()) {
      const option = node('option', name);
      option.value = name;
      select.append(option);
    }
    select.value = row.topic_override || '';
    select.addEventListener('change', () => {
      row.topic_override = select.value || null;
      persist();
      render();
    });
    const newGroup = node('button', 'New group', 'button secondary');
    newGroup.id = 'new-group';
    newGroup.addEventListener('click', () => {
      const name = prompt('Folder group name (1–80 characters):', row.topic_override || '');
      if (name === null) return;
      if (!name.trim() || name.length > 80) {
        status('Folder group names must contain 1–80 characters.', true);
        return;
      }
      row.topic_override = name.trim();
      persist();
      render();
    });
    topicControl.append(topicLabel, select, newGroup);
    container.append(topicControl);
    const utilities = node('div', undefined, 'utilities');
    const link = node('a', 'Open in Discord ↗', 'button secondary');
    link.href = 'https://discord.com/channels/' + row.id;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Opens Discord; conversations may be marked as read.';
    if (inventory.demo) {
      link.removeAttribute('href');
      link.textContent = 'Demo · Discord links disabled';
      link.setAttribute('aria-disabled', 'true');
    }
    const copy = node('button', 'Copy ID', 'button secondary');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(row.id);
        status('ID copied: ' + row.id);
      } catch (_) {
        status('Server ID: ' + row.id);
      }
    });
    utilities.append(link, copy);
    container.append(utilities);
    const details = node('details', undefined, 'channels-details');
    details.append(node('summary', 'View channels and evidence · ' + row.channels.length));
    const search = node('input', undefined, 'channel-search');
    search.type = 'search';
    search.placeholder = 'Search channels…';
    search.setAttribute('aria-label', 'Search channels');
    details.append(search);
    const list = node('div', undefined, 'channel-list');
    const channelRender = () => {
      list.replaceChildren();
      const channels = row.channels
        .filter((c) => normalize(c.name).includes(normalize(search.value)))
        .sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
      for (const channel of channels) {
        const c = node('div', undefined, 'channel-row');
        c.append(
          node(
            'span',
            (channel.type === 4 ? '▤ ' : channel.type === 2 ? '◖ ' : '# ') + channel.name
          ),
          node('span', date(channel.last_message_at))
        );
        list.append(c);
      }
      if (!channels.length) list.append(node('p', 'No channels to display.', 'tiny'));
    };
    search.addEventListener('input', channelRender);
    channelRender();
    details.append(
      list,
      node(
        'p',
        'Cached timestamps do not establish recent human conversation or cover all voice, thread, or unloaded-channel activity.',
        'tiny'
      )
    );
    container.append(details);
    if (row.warnings.length) container.append(node('p', row.warnings.join(' · '), 'tiny'));
  }
  function render() {
    if (!inventory) return;
    updateSummary();
    renderNav();
    filtered = getFiltered();
    if (!filtered.some((r) => r.id === activeId)) activeId = filtered[0]?.id || null;
    renderList();
    renderDetail();
  }
  async function readFile(input) {
    const file = input.files?.[0];
    if (!file) return null;
    if (file.size > 15 * 1024 * 1024) throw Error('File exceeds 15 MB.');
    return JSON.parse(await file.text());
  }
  $('inventory-file').addEventListener('change', async () => {
    try {
      const raw = await readFile($('inventory-file'));
      if (raw) loadInventory(raw);
    } catch (error) {
      status('Import failed: ' + error.message + ' The previous inventory is unchanged.', true);
    } finally {
      $('inventory-file').value = '';
    }
  });
  $('draft-file').addEventListener('change', async () => {
    try {
      const draft = await readFile($('draft-file'));
      if (draft) {
        const normalized = api.mergeHistory(null, draft),
          ids = new Set(inventory.rows.map((r) => r.id));
        const entries = normalized.entries.filter((r) => ids.has(r.id));
        if (!entries.length && inventory.rows.length && normalized.entries.length)
          throw Error('The draft does not match this inventory.');
        const restored = api.restoreDraft(inventory, { ...normalized, entries }),
          merged = api.mergeHistory(history, normalized);
        inventory = restored;
        history = merged;
        persist();
        status(
          'Decisions and history restored. They remain a draft, without execution authorization.'
        );
        render();
      }
    } catch (error) {
      status('Restore failed: ' + error.message, true);
    } finally {
      $('draft-file').value = '';
    }
  });
  $('export').addEventListener('click', () => {
    if (!inventory) return;
    try {
      const data = exportDraft();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      );
      const a = node('a');
      a.href = url;
      a.download = 'discord-decisions-DRAFT.json';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('Draft and history downloaded. This is not execution authorization.');
    } catch (error) {
      status(error.message, true);
    }
  });
  $('prev').addEventListener('click', () => go(-1));
  $('next').addEventListener('click', () => go(1));
  for (const id of ['search', 'decision-filter', 'sort'])
    $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
  $('images').checked = stored('.images') === true;
  $('images').addEventListener('change', () => {
    writeStorage('.images', $('images').checked);
    render();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!saveAvailable && inventory) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('keydown', (event) => {
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.target.closest('input,textarea,select,[contenteditable]')
    )
      return;
    const key = event.key.toLowerCase();
    if (key === 'j') {
      event.preventDefault();
      go(1);
    } else if (key === 'k') {
      event.preventDefault();
      go(-1);
    } else if (['1', '2', '3', '4'].includes(key)) {
      event.preventDefault();
      setDecision({ 1: 'keep', 2: 'leave', 3: 'mute', 4: 'review' }[key]);
    }
  });
  try {
    const saved = stored('.inventory');
    const seed = DEMO_MODE ? globalThis.ServerCleanupDemo.getDemo() : null;
    if (DEMO_MODE)
      document.querySelector('.safe-tag').textContent =
        'Demo · Synthetic data · No account actions';
    const raw =
      saved && seed && Date.parse(saved.captured_at) >= Date.parse(seed.captured_at)
        ? saved
        : seed || saved;
    if (raw) loadInventory(raw);
    else status('Import an inventory to begin, or open the synthetic demo.');
  } catch (error) {
    status('Could not load inventory: ' + error.message, true);
  }
})();
