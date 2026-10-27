(function (root) {
  'use strict';

  function readCategories(data) {
    if (data.categories === undefined) return [];
    if (!Array.isArray(data.categories)) throw new Error('Playbook categories must be an array');
    const ids = new Set();
    return data.categories.map((category) => {
      if (!category || typeof category.id !== 'string' || !category.id ||
          typeof category.name !== 'string' || !category.name.trim() || ids.has(category.id) ||
          (category.hidden !== undefined && typeof category.hidden !== 'boolean')) {
        throw new Error('Playbook contains an invalid category');
      }
      ids.add(category.id);
      return { id: category.id, name: category.name.trim(), hidden: category.hidden === true };
    });
  }

  function categoryId(play, categories) {
    return categories.some((category) => category.id === play.categoryId) ? play.categoryId : null;
  }

  function playerSnapshot(data) {
    const categories = readCategories(data);
    const hidden = new Set(categories.filter((category) => category.hidden).map((category) => category.id));
    return {
      ...data,
      categories: categories.filter((category) => !category.hidden),
      plays: data.plays.filter((play) => !hidden.has(play.categoryId))
    };
  }

  function groups(plays, categories, query = '', filter = 'all') {
    const search = query.trim().toLowerCase();
    const sections = [...categories, { id: null, name: 'Uncategorized', hidden: false }];
    return sections.filter((category) => filter === 'all' || (category.id || '') === filter)
      .map((category) => ({
        ...category,
        plays: plays.filter((play) => categoryId(play, categories) === category.id &&
          (!search || `${play.name || ''} ${category.name}`.toLowerCase().includes(search)))
      })).filter((category) => category.plays.length);
  }

  function movePlay(plays, categories, playId, neighborId) {
    const from = plays.findIndex((play) => play.id === playId);
    const to = plays.findIndex((play) => play.id === neighborId);
    if (from < 0 || to < 0 || categoryId(plays[from], categories) !== categoryId(plays[to], categories)) return plays;
    const ordered = [...plays];
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    return ordered;
  }

  function deleteStep(play, index) {
    if (play.steps.length <= 1 || index < 0 || index >= play.steps.length) return false;
    play.steps.splice(index, 1);
    return true;
  }

  function trimSteps(play, index) {
    if (index < 0 || index >= play.steps.length - 1) return false;
    play.steps.splice(index + 1);
    return true;
  }

  function previousStepForShadow(play, index) {
    if (index <= 0 || !play.steps[index]?.showPreviousStep) return null;
    return play.steps[index - 1];
  }

  function publishedSnapshotUrl(settings, playerLink, now = Date.now()) {
    const filePath = settings.path?.trim() || 'data/playbook-live.json';
    let url;
    if (/^https?:\/\//i.test(filePath)) {
      url = new URL(filePath);
    } else if (settings.owner && settings.repo) {
      const owner = encodeURIComponent(settings.owner);
      const repo = encodeURIComponent(settings.repo);
      const branch = encodeURIComponent(settings.branch || 'main');
      const path = filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      url = new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
    } else {
      url = new URL(filePath, new URL('.', playerLink));
    }
    url.searchParams.set('v', String(now));
    return url.href;
  }

  const api = { readCategories, categoryId, playerSnapshot, groups, movePlay, deleteStep, trimSteps, previousStepForShadow, publishedSnapshotUrl };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaybookModel = api;
})(globalThis);
