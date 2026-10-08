/*
 * analysis.js — question-level analysis for reports.html
 *
 * Data contract (additive; the report webhook may return these next to
 * `analytics` and `leaderboard`):
 *   data.questions        [{ id, subject, chapter, topic?, difficulty?, max_marks?, neg_marks? }]
 *   data.question_results [{ student_id, student_name, question_id,
 *                            status: 'correct'|'wrong'|'skipped', marks, time_seconds? }]
 *
 * Pure functions (PGAnalysis.build) have no DOM access so they can be tested in node.
 */
(function (root) {
  'use strict';

  var WEAK_BELOW = 50;      // accuracy % under which an area is "needs improvement"
  var MIN_QS = 2;           // ignore areas with fewer questions than this (noise)

  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function label(q) { return (q.subject || 'Unknown') + ' › ' + (q.chapter || 'Unknown') + (q.topic ? ' › ' + q.topic : ''); }

  function blank() { return { total: 0, correct: 0, wrong: 0, skipped: 0, marks: 0, max: 0, lost: 0, negLoss: 0, time: 0, timed: 0 }; }

  function add(bucket, q, r) {
    var max = Number(q.max_marks != null ? q.max_marks : 1);
    var marks = Number(r.marks || 0);
    bucket.total++;
    bucket.max += max;
    bucket.marks += marks;
    bucket.lost += Math.max(0, max - marks);
    if (r.status === 'correct') bucket.correct++;
    else if (r.status === 'wrong') { bucket.wrong++; if (marks < 0) bucket.negLoss += -marks; }
    else bucket.skipped++;
    if (r.time_seconds != null) { bucket.time += Number(r.time_seconds); bucket.timed++; }
  }

  function finish(b, extra) {
    var o = Object.assign({}, extra, b);
    o.accuracy = pct(b.correct, b.total);
    o.attempted = b.correct + b.wrong;
    o.attemptAccuracy = pct(b.correct, o.attempted);
    o.avgTime = b.timed ? Math.round(b.time / b.timed) : null;
    o.weak = o.total >= MIN_QS && o.accuracy < WEAK_BELOW;
    return o;
  }

  function group(results, qmap, keyFn, metaFn) {
    var buckets = {};
    results.forEach(function (r) {
      var q = qmap[r.question_id];
      if (!q) return;
      var k = keyFn(q);
      if (!buckets[k]) buckets[k] = { b: blank(), meta: metaFn(q) };
      add(buckets[k].b, q, r);
    });
    return Object.keys(buckets).map(function (k) { return finish(buckets[k].b, buckets[k].meta); });
  }

  function byLostDesc(a, b) { return b.lost - a.lost || a.accuracy - b.accuracy; }

  function build(data) {
    var questions = (data && data.questions) || [];
    var results = (data && data.question_results) || [];
    if (!questions.length || !results.length) return null;

    var qmap = {};
    questions.forEach(function (q) { qmap[q.id] = q; });

    var subjKey = function (q) { return q.subject || 'Unknown'; };
    var chapKey = function (q) { return subjKey(q) + '||' + (q.chapter || 'Unknown'); };
    var chapMeta = function (q) { return { subject: subjKey(q), chapter: q.chapter || 'Unknown', name: label({ subject: q.subject, chapter: q.chapter }) }; };
    var topicKey = function (q) { return chapKey(q) + '||' + (q.topic || ''); };
    var topicMeta = function (q) { return { subject: subjKey(q), chapter: q.chapter || 'Unknown', topic: q.topic || '', name: label(q) }; };
    var hasTopics = questions.some(function (q) { return q.topic; });

    var cohort = {
      subjects: group(results, qmap, subjKey, function (q) { return { subject: subjKey(q), name: subjKey(q) }; }).sort(byLostDesc),
      chapters: group(results, qmap, chapKey, chapMeta).sort(byLostDesc),
      topics: hasTopics ? group(results, qmap, topicKey, topicMeta).sort(byLostDesc) : [],
      difficulty: group(results, qmap, function (q) { return q.difficulty || 'Unspecified'; }, function (q) { return { name: q.difficulty || 'Unspecified' }; }),
      overall: finish(results.reduce(function (b, r) { var q = qmap[r.question_id]; if (q) add(b, q, r); return b; }, blank()), { name: 'Overall' })
    };

    var ids = {};
    results.forEach(function (r) { (ids[r.student_id] = ids[r.student_id] || { name: r.student_name, rows: [] }).rows.push(r); });
    var students = {};
    Object.keys(ids).forEach(function (sid) {
      var rows = ids[sid].rows;
      var chapters = group(rows, qmap, chapKey, chapMeta).sort(byLostDesc);
      var topics = hasTopics ? group(rows, qmap, topicKey, topicMeta).sort(byLostDesc) : [];
      students[sid] = {
        student_id: sid,
        student_name: ids[sid].name,
        overall: finish(rows.reduce(function (b, r) { var q = qmap[r.question_id]; if (q) add(b, q, r); return b; }, blank()), { name: 'Overall' }),
        subjects: group(rows, qmap, subjKey, function (q) { return { subject: subjKey(q), name: subjKey(q) }; }).sort(byLostDesc),
        chapters: chapters,
        topics: topics,
        difficulty: group(rows, qmap, function (q) { return q.difficulty || 'Unspecified'; }, function (q) { return { name: q.difficulty || 'Unspecified' }; }),
        needsImprovement: (hasTopics ? topics : chapters).filter(function (c) { return c.weak; }).slice(0, 5)
      };
    });

    return { cohort: cohort, students: students };
  }

  // One-line weak-area summary for the parent WhatsApp message.
  function parentSummary(student) {
    if (!student || !student.needsImprovement.length) return '';
    return 'Focus areas: ' + student.needsImprovement.slice(0, 3).map(function (c) {
      return c.subject + ' – ' + c.chapter + (c.topic ? ' – ' + c.topic : '') + ' (' + c.accuracy + '%)';
    }).join('; ');
  }

  // ---- rendering (browser only) ---------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bar(p) {
    var col = p < WEAK_BELOW ? '#dc2626' : (p < 75 ? '#d97706' : '#16a34a');
    return '<div style="background:rgba(128,128,128,.2);border-radius:4px;height:6px;min-width:70px"><div style="width:' + Math.min(100, p) + '%;background:' + col + ';height:6px;border-radius:4px"></div></div>';
  }
  function areaRows(list, n) {
    return list.slice(0, n).map(function (a) {
      return '<tr><td>' + esc(a.name) + (a.weak ? ' <span style="color:#dc2626;font-weight:700">● weak</span>' : '') + '</td>' +
        '<td>' + a.correct + '/' + a.total + '</td><td style="min-width:90px">' + bar(a.accuracy) + '<small>' + a.accuracy + '%</small></td>' +
        '<td>' + a.skipped + '</td><td>' + (a.negLoss ? '-' + a.negLoss : '0') + '</td><td>' + (a.avgTime != null ? a.avgTime + 's' : '—') + '</td></tr>';
    }).join('');
  }
  function table(title, list, n) {
    return '<h4 style="margin:1rem 0 .4rem;font-size:.9rem">' + esc(title) + '</h4><div class="table-wrap"><table class="report-table"><thead><tr>' +
      '<th>Area</th><th>Correct</th><th>Accuracy</th><th>Skipped</th><th>Neg. marks</th><th>Avg time</th></tr></thead><tbody>' +
      areaRows(list, n || 10) + '</tbody></table></div>';
  }

  function render(el, analysis, opts) {
    opts = opts || {};
    if (!el) return;
    if (!analysis) {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Question-level data is not available for this test yet, so subject/chapter analysis cannot be shown.</p>';
      return;
    }
    var c = analysis.cohort;
    var weak = (c.topics.length ? c.topics : c.chapters).filter(function (x) { return x.weak; });
    var h = '';
    if (opts.demo) h += '<div style="background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:8px;padding:.5rem .8rem;font-weight:700;margin-bottom:.75rem">DEMO DATA — sample students, not real results. Remove ?demo=1 from the URL to hide.</div>';
    h += '<h3 style="font-size:1.05rem;font-weight:700;margin:1.5rem 0 .5rem">Subject &amp; Chapter Analysis</h3>';
    h += table('Subjects (most marks lost first)', c.subjects);
    h += weak.length ? table('Cohort weak areas (accuracy below ' + WEAK_BELOW + '%)', weak) : '<p style="font-size:.85rem">No chapter is below ' + WEAK_BELOW + '% accuracy for this cohort.</p>';
    h += table('Accuracy by difficulty', c.difficulty);
    h += '<h4 style="margin:1rem 0 .4rem;font-size:.9rem">Per-student: what to improve</h4>';
    Object.keys(analysis.students).forEach(function (sid) {
      var s = analysis.students[sid];
      h += '<details style="margin:.3rem 0"><summary style="cursor:pointer;font-weight:600">' + esc(s.student_name) + ' — ' + s.overall.accuracy + '% accuracy' +
        (s.needsImprovement.length ? ' · improve: ' + esc(s.needsImprovement.slice(0, 2).map(function (x) { return x.topic || x.chapter; }).join(', ')) : '') + '</summary>' +
        (s.needsImprovement.length ? table('Needs improvement', s.needsImprovement) : '<p style="font-size:.85rem">No weak chapter detected.</p>') +
        table('All subjects', s.subjects) + '</details>';
    });
    el.innerHTML = h;
  }

  root.PGAnalysis = { build: build, render: render, parentSummary: parentSummary, WEAK_BELOW: WEAK_BELOW };
  if (typeof module !== 'undefined') module.exports = root.PGAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
