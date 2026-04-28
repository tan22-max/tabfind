// popup.js
// this is the main file that does everything
// took me like 3 days to figure out how chrome.tabs works lol

// variables to keep track of stuff
var allTabs = [];
var notes = {}; // saves notes for each tab, uses the tab id as the key
var currentTabForNotes = null; // which tab the notes panel is open for
var focusedIndex = -1; // which item in the list is highlighted
var filterMode = 'all'; // what filter is active (all, title, url, notes)
var currentResults = []; // tabs that matched the search

// runs when popup opens
document.addEventListener('DOMContentLoaded', async function() {
  // load saved notes first, then get tabs
  await loadNotes();
  await loadTabs();
  setupEvents();
  // show all tabs when first opened (empty query = show everything)
  showResults('');
  document.getElementById('search-input').focus();
});

// gets saved notes from chrome storage
function loadNotes() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['tabNotes'], function(result) {
      // if no notes saved yet, use empty object
      notes = result.tabNotes || {};
      resolve();
    });
  });
}

// gets all open tabs
function loadTabs() {
  return new Promise(function(resolve) {
    chrome.tabs.query({}, function(tabs) {
      allTabs = tabs;
      // update the little counter badge
      document.getElementById('tab-count-badge').textContent = tabs.length + ' tabs';
      resolve();
    });
  });
}

// fuzzy search function - i looked this up on stackoverflow
// returns true/false if the text matches the query, plus score for sorting
function fuzzyMatch(str, query) {
  if (!query) {
    return { match: true, score: 0, ranges: [] };
  }

  // make both lowercase so search is case insensitive
  str = str.toLowerCase();
  query = query.toLowerCase();

  // check if the query appears directly in the string (exact match, highest score)
  var idx = str.indexOf(query);
  if (idx !== -1) {
    return {
      match: true,
      score: 100 + (100 / (str.length || 1)),
      ranges: [[idx, idx + query.length - 1]]
    };
  }

  // fuzzy match - checks if all query characters appear in order in str
  // e.g. "ggl" would match "google"
  var qi = 0;
  var ranges = [];
  var start = -1;

  for (var si = 0; si < str.length && qi < query.length; si++) {
    if (str[si] === query[qi]) {
      if (start === -1) start = si;
      qi++;
      // end of a consecutive run
      if (qi === query.length || str[si + 1] !== query[qi]) {
        ranges.push([start, si]);
        start = -1;
      }
    } else if (start !== -1) {
      ranges.push([start, si - 1]);
      start = -1;
    }
  }

  // if we didnt find all characters, no match
  if (qi < query.length) {
    return { match: false };
  }

  // calculate how consecutive the matches are (higher = better)
  var totalMatched = 0;
  for (var i = 0; i < ranges.length; i++) {
    totalMatched += ranges[i][1] - ranges[i][0] + 1;
  }
  var consecutiveness = totalMatched / query.length;

  return { match: true, score: 50 * consecutiveness, ranges: ranges };
}

// scores a tab against the search query
// returns null if the tab doesnt match at all
function scoreTab(tab, query) {
  if (!query) {
    return { score: 1, titleRanges: [], urlRanges: [], noteRanges: [] };
  }

  var noteText = notes[tab.id] || '';
  var title = tab.title || '';
  var url = tab.url || '';

  var titleResult = { match: false };
  var urlResult = { match: false };
  var noteResult = { match: false };

  // only search in the active filter
  if (filterMode === 'all' || filterMode === 'title') {
    titleResult = fuzzyMatch(title, query);
  }
  if (filterMode === 'all' || filterMode === 'url') {
    urlResult = fuzzyMatch(url, query);
  }
  if (filterMode === 'all' || filterMode === 'notes') {
    noteResult = fuzzyMatch(noteText, query);
  }

  // if nothing matched return null
  if (!titleResult.match && !urlResult.match && !noteResult.match) {
    return null;
  }

  // combine scores, title matches worth more than url
  var titleScore = titleResult.match ? titleResult.score * 1.5 : 0;
  var urlScore = urlResult.match ? urlResult.score : 0;
  var noteScore = noteResult.match ? noteResult.score * 1.2 : 0;
  var finalScore = Math.max(titleScore, urlScore, noteScore);

  return {
    score: finalScore,
    titleRanges: titleResult.ranges || [],
    urlRanges: urlResult.ranges || [],
    noteRanges: noteResult.ranges || []
  };
}

// wraps matched characters in <mark> tags so they show up highlighted
// had to look up how innerHTML injection works safely
function highlightText(text, ranges) {
  if (!ranges || ranges.length === 0) {
    return escapeHtml(text);
  }

  var result = '';
  var lastIndex = 0;

  for (var i = 0; i < ranges.length; i++) {
    var s = ranges[i][0];
    var e = ranges[i][1];
    // add the non-highlighted part before the match
    result += escapeHtml(text.slice(lastIndex, s));
    // add the highlighted match
    result += '<mark class="match-highlight">' + escapeHtml(text.slice(s, e + 1)) + '</mark>';
    lastIndex = e + 1;
  }

  // add whatever is left after the last match
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

// escape html to avoid xss or whatever its called
// copied this from stackoverflow
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// main function that rebuilds the list of tabs
function showResults(query) {
  // score every tab and filter out ones that didnt match
  var scored = [];
  for (var i = 0; i < allTabs.length; i++) {
    var tab = allTabs[i];
    var result = scoreTab(tab, query);
    if (result !== null) {
      scored.push({
        tab: tab,
        score: result.score,
        titleRanges: result.titleRanges,
        urlRanges: result.urlRanges
      });
    }
  }

  // sort by score, highest first
  scored.sort(function(a, b) {
    return b.score - a.score;
  });

  currentResults = scored;
  focusedIndex = scored.length > 0 ? 0 : -1;

  var list = document.getElementById('results-list');
  var emptyState = document.getElementById('empty-state');

  // clear the old list
  list.innerHTML = '';

  if (scored.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // build a list item for each matching tab
  for (var j = 0; j < scored.length; j++) {
    var item = scored[j];
    var tab = item.tab;
    var noteText = notes[tab.id] || '';

    var li = document.createElement('li');

    // add classes
    li.className = 'tab-item';
    if (j === 0) li.className += ' focused';
    if (tab.active) li.className += ' active-tab';

    li.dataset.tabId = tab.id;
    li.dataset.index = j;

    // favicon image or placeholder box
    var faviconHtml = '';
    if (tab.favIconUrl) {
      faviconHtml = '<img class="tab-favicon" src="' + escapeHtml(tab.favIconUrl) + '" onerror="this.style.display=\'none\'">';
    } else {
      faviconHtml = '<div class="tab-favicon-placeholder">⬜</div>';
    }

    // shorten the url so it doesnt overflow
    var shortUrl = (tab.url || '').replace(/^https?:\/\//, '').slice(0, 80);

    // note preview (only show if there is a note)
    var notePreviewHtml = '';
    if (noteText) {
      var previewText = noteText.slice(0, 60);
      if (noteText.length > 60) previewText += '…';
      notePreviewHtml = '<div class="tab-note-preview">✎ ' + escapeHtml(previewText) + '</div>';
    }

    li.innerHTML =
      faviconHtml +
      '<div class="tab-info">' +
        '<div class="tab-title">' + highlightText(tab.title || 'Untitled', item.titleRanges) + '</div>' +
        '<div class="tab-url">' + highlightText(shortUrl, item.urlRanges) + '</div>' +
        notePreviewHtml +
      '</div>' +
      '<div class="tab-actions">' +
        '<button class="action-btn note-btn ' + (noteText ? 'has-note' : '') + '" title="add note" data-tab-id="' + tab.id + '">✎</button>' +
        '<button class="action-btn close-btn" title="close tab" data-tab-id="' + tab.id + '">✕</button>' +
      '</div>';

    // clicking the row switches to that tab
    // had to use a closure here because of the loop variable thing (learned about this the hard way)
    (function(t) {
      li.addEventListener('click', function(e) {
        // dont switch tab if they clicked a button
        if (e.target.closest('.action-btn')) return;
        goToTab(t.id, t.windowId);
      });
    })(tab);

    // note button
    (function(t) {
      li.querySelector('.note-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        openNotes(t.id, t.title);
      });
    })(tab);

    // close button
    (function(t, el) {
      li.querySelector('.close-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        removeTab(t.id, el);
      });
    })(tab, li);

    list.appendChild(li);
  }
}

// switches chrome to a different tab
function goToTab(tabId, windowId) {
  chrome.tabs.update(tabId, { active: true });
  chrome.windows.update(windowId, { focused: true });
  window.close(); // close the popup
}

// closes a tab
function removeTab(tabId, listItem) {
  chrome.tabs.remove(tabId, function() {
    // animate it out before removing from DOM
    listItem.style.opacity = '0';
    listItem.style.transform = 'translateX(8px)';
    listItem.style.transition = 'all 0.2s';
    setTimeout(function() {
      listItem.remove();
      // remove from our array too
      allTabs = allTabs.filter(function(t) { return t.id !== tabId; });
      document.getElementById('tab-count-badge').textContent = allTabs.length + ' tabs';
    }, 200);
  });
}

// opens the notes panel for a tab
function openNotes(tabId, title) {
  currentTabForNotes = tabId;
  document.getElementById('notes-tab-title').textContent = title || 'Untitled';
  document.getElementById('notes-textarea').value = notes[tabId] || '';
  document.getElementById('notes-panel').classList.remove('hidden');
  document.getElementById('notes-textarea').focus();
}

// hides the notes panel
function closeNotes() {
  document.getElementById('notes-panel').classList.add('hidden');
  currentTabForNotes = null;
}

// saves the note to chrome storage
function saveNote() {
  if (currentTabForNotes === null) return;

  var text = document.getElementById('notes-textarea').value.trim();

  if (text) {
    notes[currentTabForNotes] = text;
  } else {
    // if text is empty just delete the note
    delete notes[currentTabForNotes];
  }

  // save to chrome storage so it persists between sessions
  chrome.storage.local.set({ tabNotes: notes }, function() {
    closeNotes();
    // refresh the list so note previews update
    showResults(document.getElementById('search-input').value);
  });
}

// deletes the note
function deleteNote() {
  if (currentTabForNotes === null) return;
  delete notes[currentTabForNotes];
  chrome.storage.local.set({ tabNotes: notes }, function() {
    document.getElementById('notes-textarea').value = '';
    closeNotes();
    showResults(document.getElementById('search-input').value);
  });
}

// moves the keyboard focus up or down in the list
function moveFocus(direction) {
  if (currentResults.length === 0) return;

  var items = document.querySelectorAll('.tab-item');
  if (items.length === 0) return;

  // remove focused class from current item
  if (items[focusedIndex]) {
    items[focusedIndex].classList.remove('focused');
  }

  // calculate new index (clamp between 0 and end of list)
  focusedIndex = focusedIndex + direction;
  if (focusedIndex < 0) focusedIndex = 0;
  if (focusedIndex >= currentResults.length) focusedIndex = currentResults.length - 1;

  // add focused class to new item and scroll it into view
  var newItem = items[focusedIndex];
  if (newItem) {
    newItem.classList.add('focused');
    newItem.scrollIntoView({ block: 'nearest' });
  }
}

// activates the currently focused tab (enter key)
function activateFocused() {
  if (focusedIndex < 0 || focusedIndex >= currentResults.length) return;
  var tab = currentResults[focusedIndex].tab;
  goToTab(tab.id, tab.windowId);
}

// sets up all the event listeners
function setupEvents() {
  var searchInput = document.getElementById('search-input');

  // update results whenever the user types
  searchInput.addEventListener('input', function() {
    showResults(searchInput.value.trim());
  });

  // keyboard shortcuts
  document.addEventListener('keydown', function(e) {

    // if the notes panel is open, only handle escape and ctrl+enter
    var notesPanel = document.getElementById('notes-panel');
    if (!notesPanel.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNotes();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveNote();
      }
      return; // dont process other shortcuts while notes is open
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      activateFocused();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      // clear search box
      searchInput.value = '';
      showResults('');
      searchInput.focus();
    }

    // press N to open notes for the focused tab
    if (e.key === 'n' || e.key === 'N') {
      if (document.activeElement !== searchInput && focusedIndex >= 0) {
        e.preventDefault();
        var tab = currentResults[focusedIndex].tab;
        openNotes(tab.id, tab.title);
      }
    }
  });

  // filter pills
  var pills = document.querySelectorAll('.pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].addEventListener('click', function() {
      // remove active from all pills then add to clicked one
      for (var j = 0; j < pills.length; j++) {
        pills[j].classList.remove('active');
      }
      this.classList.add('active');
      filterMode = this.dataset.filter;
      showResults(searchInput.value.trim());
    });
  }

  // notes panel buttons
  document.getElementById('notes-toggle').addEventListener('click', function() {
    // open notes for whatever tab is focused
    if (focusedIndex >= 0 && currentResults[focusedIndex]) {
      var tab = currentResults[focusedIndex].tab;
      openNotes(tab.id, tab.title);
    }
  });

  document.getElementById('notes-close').addEventListener('click', closeNotes);
  document.getElementById('notes-save').addEventListener('click', saveNote);
  document.getElementById('notes-delete').addEventListener('click', deleteNote);
}
