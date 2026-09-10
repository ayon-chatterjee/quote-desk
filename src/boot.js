/* Quote Desk — boot. Nothing here talks to Claude; the first call happens on a click. */
(function () {
'use strict';
var A = window.APP;

A.seedFresh();
A.render();

Promise.resolve()
  .then(function () { return A.initDb(); })
  .then(function () { return A.loadFromDb(); })
  .then(function (loaded) {
    if (loaded) A.toast('Picked up where this workspace left off.');
    A.render();
    return Promise.all([A.initSample(), A.initDownloads()]);
  })
  .then(function () { A.paintNav(); })
  .catch(function () { A.aiReady = false; A.paintNav(); });

/* Reading everything at once spends the viewer's own Claude usage, so it asks first. */
var origRunAll = A.runAll;
A.runAll = function (ids) {
  var pool = ids ? ids.map(A.sampleById).filter(Boolean) : A.arrived();
  var pending = pool.filter(function (e) { return !A.emailById(e.id); });
  if (A.aiReady && pending.length > 2) {
    if (!window.confirm('This reads ' + pending.length + ' emails with Claude, one call each, on your own account. Continue?')) return;
  }
  origRunAll(ids);
};
})();
