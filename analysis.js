/* Subject, Chapter & Topic Performance Analysis Engine for Pitthugram / Moodle */
(function (root) {
  var WEAK_BELOW = 50; // accuracy percent below which an area is flagged as weak
  var MIN_QS = 2;      // minimum questions in a topic/chapter before flagging as weak
  var curMin = MIN_QS;

  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function blank() { return { total: 0, max: 0, marks: 0, lost: 0, correct: 0, wrong: 0, skipped: 0, negLoss: 0, time: 0, timed: 0 }; }

  function label(q) {
    var p = [];
    if (q.subject) p.push(q.subject);
    if (q.chapter && q.chapter !== q.subject) p.push(q.chapter);
    if (q.topic && q.topic !== q.chapter) p.push(q.topic);
    return p.join(' ? ') || 'General';
  }

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
    o.weak = o.total >= curMin && o.accuracy < WEAK_BELOW;
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
    curMin = questions.length < 20 ? 1 : MIN_QS;

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
    results.forEach(function (r) {
      if (!ids[r.student_id]) {
        ids[r.student_id] = {
          name: r.student_name || 'Student ' + r.student_id,
          roll_number: r.roll_number || r.idnumber || r.username || ('ID-' + r.student_id),
          rows: []
        };
      }
      ids[r.student_id].rows.push(r);
    });

    var students = {};
    var studentList = [];

    Object.keys(ids).forEach(function (sid) {
      var stdInfo = ids[sid];
      var rows = stdInfo.rows;
      var chapters = group(rows, qmap, chapKey, chapMeta).sort(byLostDesc);
      var topics = hasTopics ? group(rows, qmap, topicKey, topicMeta).sort(byLostDesc) : [];
      var overall = finish(rows.reduce(function (b, r) { var q = qmap[r.question_id]; if (q) add(b, q, r); return b; }, blank()), { name: 'Overall' });
      var needsImprovement = (hasTopics ? topics : chapters).filter(function (c) { return c.weak; }).slice(0, 5);

      students[sid] = {
        student_id: sid,
        roll_number: stdInfo.roll_number,
        student_name: stdInfo.name,
        overall: overall,
        subjects: group(rows, qmap, subjKey, function (q) { return { subject: subjKey(q), name: subjKey(q) }; }).sort(byLostDesc),
        chapters: chapters,
        topics: topics,
        difficulty: group(rows, qmap, function (q) { return q.difficulty || 'Unspecified'; }, function (q) { return { name: q.difficulty || 'Unspecified' }; }),
        needsImprovement: needsImprovement
      };

      studentList.push({
        student_id: sid,
        roll_number: stdInfo.roll_number,
        student_name: stdInfo.name,
        score: overall.marks,
        maxScore: overall.max,
        accuracy: overall.accuracy,
        correct: overall.correct,
        total: overall.total,
        skipped: overall.skipped,
        negLoss: overall.negLoss,
        weakCount: needsImprovement.length
      });
    });

    // Rank students by score descending
    studentList.sort(function (a, b) { return b.score - a.score || b.accuracy - a.accuracy; });
    studentList.forEach(function (s, i) {
      s.rank = i + 1;
      if (students[s.student_id]) students[s.student_id].rank = s.rank;
    });

    // Class aggregate KPI summary
    var totalStudents = studentList.length;
    var avgScore = totalStudents ? Math.round((studentList.reduce(function (acc, s) { return acc + s.score; }, 0) / totalStudents) * 10) / 10 : 0;
    var avgAccuracy = totalStudents ? Math.round((studentList.reduce(function (acc, s) { return acc + s.accuracy; }, 0) / totalStudents) * 10) / 10 : 0;
    var atRisk = studentList.filter(function (s) { return s.accuracy < WEAK_BELOW; });

    var classSummary = {
      totalStudents: totalStudents,
      avgScore: avgScore,
      avgAccuracy: avgAccuracy,
      topStudent: studentList[0] || null,
      lowestStudent: studentList[totalStudents - 1] || null,
      atRiskCount: atRisk.length,
      atRiskStudents: atRisk
    };

    return {
      cohort: cohort,
      classSummary: classSummary,
      students: students,
      studentList: studentList
    };
  }

  // One-line weak-area summary for parent WhatsApp message
  function parentSummary(student) {
    if (!student || !student.needsImprovement || !student.needsImprovement.length) return '';
    return 'Focus areas: ' + student.needsImprovement.slice(0, 3).map(function (c) {
      return c.subject + ' ? ' + c.chapter + (c.topic ? ' ? ' + c.topic : '') + ' (' + c.accuracy + '%)';
    }).join('; ');
  }

  // ---- rendering (browser only) ---------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bar(p) {
    var col = p < WEAK_BELOW ? '#ef4444' : (p < 75 ? '#f59e0b' : '#10b981');
    return '<div style="background:rgba(128,128,128,.18);border-radius:4px;height:7px;min-width:70px;overflow:hidden"><div style="width:' + Math.min(100, Math.max(0, p)) + '%;background:' + col + ';height:7px;border-radius:4px"></div></div>';
  }

  function areaRows(list, n) {
    return list.slice(0, n).map(function (a) {
      var badge = a.accuracy < WEAK_BELOW
        ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700">? Needs Review</span>'
        : (a.accuracy >= 75 ? '<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:600">? Strong</span>' : '');
      return '<tr>' +
        '<td style="font-weight:500">' + esc(a.name) + ' ' + badge + '</td>' +
        '<td>' + a.correct + '/' + a.total + '</td>' +
        '<td style="min-width:110px"><div style="display:flex;align-items:center;gap:8px">' + bar(a.accuracy) + '<span style="font-weight:600;font-size:0.85rem">' + a.accuracy + '%</span></div></td>' +
        '<td>' + a.skipped + '</td>' +
        '<td style="color:' + (a.negLoss ? '#b91c1c' : 'inherit') + '">' + (a.negLoss ? '-' + a.negLoss : '0') + '</td>' +
        '<td>' + (a.avgTime != null ? a.avgTime + 's' : '?') + '</td>' +
        '</tr>';
    }).join('');
  }

  function table(title, list, n) {
    return '<h4 style="margin:1.2rem 0 .5rem;font-size:.95rem;font-weight:600">' + esc(title) + '</h4><div class="table-wrap"><table class="report-table" style="width:100%;border-collapse:collapse;font-size:0.88rem"><thead><tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.2);">' +
      '<th style="padding:8px">Area</th><th style="padding:8px">Correct</th><th style="padding:8px">Accuracy</th><th style="padding:8px">Skipped</th><th style="padding:8px">Neg. marks</th><th style="padding:8px">Avg time</th></tr></thead><tbody>' +
      areaRows(list, n || 20) + '</tbody></table></div>';
  }

  function render(el, analysis, opts) {
    opts = opts || {};
    if (!el) return;
    if (!analysis) {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Question-level data is not available for this test yet, so subject/chapter analysis cannot be shown.</p>';
      return;
    }

    var c = analysis.cohort;
    var summary = analysis.classSummary;
    var students = analysis.students;
    var roster = analysis.studentList;

    var containerId = 'pg_analysis_container_' + Math.random().toString(36).substr(2, 6);

    var h = '<div id="' + containerId + '" style="font-family:inherit;">';

    if (opts.demo) {
      h += '<div style="background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:8px;padding:.6rem .9rem;font-weight:600;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">' +
        '<span>?? <strong>DEMO MODE:</strong> Displaying simulated cohort performance across 8 students.</span>' +
        '<span style="font-size:0.8rem;background:#fde68a;padding:2px 8px;border-radius:4px">Moodle Sync Preview</span></div>';
    }

    // Top Controls Bar (Selector & View Pills)
    h += '<div style="background:var(--bg-card, #f8fafc);border:1px solid var(--border-color, #e2e8f0);border-radius:10px;padding:1rem;margin-bottom:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,0.05);">';
    h += '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">';

    // Student Menu (Roll Number + Name)
    h += '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:280px;">';
    h += '<label for="pgStudentSelect" style="font-weight:700;font-size:0.88rem;white-space:nowrap;">Select View:</label>';
    h += '<select id="pgStudentSelect" style="flex:1;max-width:440px;padding:7px 12px;border:1px solid var(--border-color, #cbd5e1);border-radius:6px;font-size:0.88rem;font-weight:500;background:white;cursor:pointer;">';
    h += '<option value="CLASS_OVERVIEW" selected>?? Entire Class Performance (Overview)</option>';
    h += '<option value="TOPIC_ANALYSIS">?? Topic-wise Breakdown (Class Wide)</option>';
    h += '<optgroup label="Individual Students (Roll Number - Name)">';
    roster.forEach(function (std) {
      h += '<option value="' + esc(std.student_id) + '">[' + esc(std.roll_number) + '] ' + esc(std.student_name) + ' (' + std.accuracy + '%)</option>';
    });
    h += '</optgroup>';
    h += '</select>';
    h += '</div>';

    // Search input for fast filtering
    h += '<div style="display:flex;align-items:center;gap:8px;">';
    h += '<input type="text" id="pgStudentFilter" placeholder="Filter Roll No or Name..." style="padding:6px 10px;border:1px solid var(--border-color, #cbd5e1);border-radius:6px;font-size:0.84rem;width:200px;">';
    h += '</div>';

    h += '</div></div>'; // end controls bar

    // Container for Dynamic Content
    h += '<div id="pgViewContent"></div>';
    h += '</div>'; // end container

    el.innerHTML = h;

    // View Renderers
    function renderClassOverview() {
      var out = '';
      // 5 KPI Cards
      out += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:1.5rem;">';

      out += '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary, #64748b);font-weight:600">Class Avg Accuracy</div>' +
        '<div style="font-size:1.6rem;font-weight:800;color:#2563eb;margin-top:4px">' + summary.avgAccuracy + '%</div>' +
        '<div style="font-size:0.8rem;color:#64748b;margin-top:2px">Avg Score: ' + summary.avgScore + ' marks</div></div>';

      out += '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary, #64748b);font-weight:600">Top Performer</div>' +
        '<div style="font-size:1.15rem;font-weight:700;color:#16a34a;margin-top:4px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">' + (summary.topStudent ? esc(summary.topStudent.student_name.split('(')[0].replace('DEMO','').trim()) : '?') + '</div>' +
        '<div style="font-size:0.8rem;color:#64748b;margin-top:2px">Roll: ' + (summary.topStudent ? summary.topStudent.roll_number : '?') + ' (' + (summary.topStudent ? summary.topStudent.accuracy : 0) + '%)</div></div>';

      out += '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary, #64748b);font-weight:600">Lowest Score</div>' +
        '<div style="font-size:1.15rem;font-weight:700;color:#dc2626;margin-top:4px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">' + (summary.lowestStudent ? esc(summary.lowestStudent.student_name.split('(')[0].replace('DEMO','').trim()) : '?') + '</div>' +
        '<div style="font-size:0.8rem;color:#64748b;margin-top:2px">Roll: ' + (summary.lowestStudent ? summary.lowestStudent.roll_number : '?') + ' (' + (summary.lowestStudent ? summary.lowestStudent.accuracy : 0) + '%)</div></div>';

      out += '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary, #64748b);font-weight:600">At-Risk Students</div>' +
        '<div style="font-size:1.6rem;font-weight:800;color:' + (summary.atRiskCount ? '#dc2626' : '#16a34a') + ';margin-top:4px">' + summary.atRiskCount + '</div>' +
        '<div style="font-size:0.8rem;color:#64748b;margin-top:2px">Scoring below ' + WEAK_BELOW + '%</div></div>';

      out += '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-secondary, #64748b);font-weight:600">Total Enrolled</div>' +
        '<div style="font-size:1.6rem;font-weight:800;color:#0f172a;margin-top:4px">' + summary.totalStudents + '</div>' +
        '<div style="font-size:0.8rem;color:#64748b;margin-top:2px">Active Attempts: 100%</div></div>';

      out += '</div>'; // end cards

      // Subject Summary
      out += table('Subject Breakdown (Cohort)', c.subjects);

      // Class-wide Weak Topics
      var weakTopics = (c.topics.length ? c.topics : c.chapters).filter(function (x) { return x.weak; });
      if (weakTopics.length) {
        out += '<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:1rem;margin:1.5rem 0;">' +
          '<div style="display:flex;align-items:center;gap:8px;color:#9f1239;font-weight:700;margin-bottom:0.5rem">' +
          '<span>?? Class-Wide Urgent Topics to Re-Teach (' + weakTopics.length + ' topics below ' + WEAK_BELOW + '% accuracy)</span></div>' +
          table('Critical Remediation Areas', weakTopics) + '</div>';
      }

      // Student Performance Matrix
      out += '<h3 style="font-size:1rem;font-weight:700;margin:1.5rem 0 .5rem">Student Performance Matrix (' + roster.length + ' students)</h3>';
      out += '<div class="table-wrap"><table class="report-table" style="width:100%;border-collapse:collapse;font-size:0.88rem;">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid var(--border-color, #cbd5e1);">' +
        '<th style="padding:8px">Rank</th><th style="padding:8px">Roll Number</th><th style="padding:8px">Student Name</th>' +
        '<th style="padding:8px">Score</th><th style="padding:8px">Accuracy</th><th style="padding:8px">Weak Topics</th><th style="padding:8px">Action</th></tr></thead><tbody>';

      roster.forEach(function (std) {
        var statusBadge = std.accuracy < WEAK_BELOW
          ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700">At Risk</span>'
          : (std.accuracy >= 75 ? '<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:600">Mastered</span>' : '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:600">Average</span>');

        out += '<tr style="border-bottom:1px solid var(--border-color, #e2e8f0);">' +
          '<td style="padding:8px;font-weight:700">#' + std.rank + '</td>' +
          '<td style="padding:8px;font-family:monospace;font-weight:600;color:#2563eb;">' + esc(std.roll_number) + '</td>' +
          '<td style="padding:8px;font-weight:500">' + esc(std.student_name) + '</td>' +
          '<td style="padding:8px;font-weight:600">' + std.score + '/' + std.maxScore + '</td>' +
          '<td style="padding:8px;"><div style="display:flex;align-items:center;gap:6px;">' + bar(std.accuracy) + '<span>' + std.accuracy + '%</span> ' + statusBadge + '</div></td>' +
          '<td style="padding:8px;color:' + (std.weakCount ? '#dc2626' : '#16a34a') + ';font-weight:600;">' + std.weakCount + ' areas</td>' +
          '<td style="padding:8px;"><button class="pg-inspect-btn" data-id="' + esc(std.student_id) + '" style="background:#2563eb;color:white;border:none;border-radius:4px;padding:4px 10px;font-size:0.8rem;cursor:pointer;font-weight:500;">View Analysis ?</button></td>' +
          '</tr>';
      });

      out += '</tbody></table></div>';
      return out;
    }

    function renderTopicAnalysis() {
      var out = '<div style="margin-bottom:1.5rem;">';
      out += '<h3 style="font-size:1.05rem;font-weight:700;margin-bottom:0.5rem">?? Comprehensive Topic-Wise Diagnostics (Whole Class)</h3>';
      out += '<p style="color:var(--text-secondary, #64748b);font-size:0.85rem;margin-bottom:1rem;">All tested syllabus topics ranked by accuracy and marks lost across all students in the batch.</p>';
      var list = c.topics.length ? c.topics : c.chapters;
      out += table('All Tested Topics (' + list.length + ' topics)', list);
      out += table('Performance by Question Difficulty', c.difficulty);
      out += '</div>';
      return out;
    }

    function renderStudentDetail(sid) {
      var s = students[sid];
      if (!s) return '<p>Student not found.</p>';

      var out = '<div style="background:var(--bg-card, white);border:1px solid var(--border-color, #e2e8f0);border-radius:8px;padding:1.2rem;margin-bottom:1.5rem;">';

      // Header
      out += '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-color, #e2e8f0);padding-bottom:1rem;margin-bottom:1rem;gap:10px;">';
      out += '<div>' +
        '<div style="font-size:0.8rem;color:#2563eb;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">Roll No: ' + esc(s.roll_number) + '</div>' +
        '<h2 style="font-size:1.25rem;font-weight:800;margin:3px 0">' + esc(s.student_name) + '</h2>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary, #64748b);">Class Rank: <strong>#' + (s.rank || '?') + '</strong> of ' + summary.totalStudents + ' students</div>' +
        '</div>';

      out += '<div style="text-align:right;">' +
        '<div style="font-size:1.6rem;font-weight:800;color:' + (s.overall.accuracy < WEAK_BELOW ? '#dc2626' : '#16a34a') + '">' + s.overall.accuracy + '%</div>' +
        '<div style="font-size:0.82rem;color:var(--text-secondary, #64748b);">' + s.overall.marks + ' / ' + s.overall.max + ' marks (Class Avg: ' + summary.avgAccuracy + '%)</div>' +
        '</div>';
      out += '</div>';

      // Needs Improvement Cards
      if (s.needsImprovement.length) {
        out += '<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;padding:10px 14px;margin-bottom:1.2rem;">' +
          '<div style="color:#9f1239;font-weight:700;font-size:0.9rem;margin-bottom:6px">?? Needs Immediate Improvement (' + s.needsImprovement.length + ' Weak Areas):</div>' +
          table('Weak Areas (< ' + WEAK_BELOW + '% accuracy)', s.needsImprovement) +
          '</div>';
      } else {
        out += '<div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:6px;padding:10px 14px;font-weight:600;font-size:0.88rem;margin-bottom:1.2rem;">' +
          '?? Outstanding Performance: No weak topics detected for this student!</div>';
      }

      // WhatsApp Parent Summary Box
      var summaryMsg = parentSummary(s);
      if (summaryMsg) {
        out += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;margin-bottom:1.2rem;">' +
          '<div style="font-size:0.8rem;color:#166534;font-weight:700;text-transform:uppercase;margin-bottom:4px">?? Parent WhatsApp Feedback Note:</div>' +
          '<div style="font-size:0.88rem;color:#14532d;font-style:italic">"Dear Parent, ' + esc(s.student_name.split('(')[0].trim()) + ' scored ' + s.overall.accuracy + '% in the recent test. ' + esc(summaryMsg) + '."</div>' +
          '</div>';
      }

      // Detailed Subject & Chapter Tables
      out += table('Subject Performance Breakdown', s.subjects);
      if (s.topics.length) {
        out += table('All Topics Attempted by Student', s.topics);
      } else {
        out += table('Chapter Performance', s.chapters);
      }

      out += '</div>';
      return out;
    }

    var contentEl = el.querySelector('#pgViewContent');
    var selectEl = el.querySelector('#pgStudentSelect');
    var filterEl = el.querySelector('#pgStudentFilter');

    function updateView(val) {
      if (val === 'CLASS_OVERVIEW') {
        contentEl.innerHTML = renderClassOverview();
      } else if (val === 'TOPIC_ANALYSIS') {
        contentEl.innerHTML = renderTopicAnalysis();
      } else {
        contentEl.innerHTML = renderStudentDetail(val);
      }

      // Re-bind inspect buttons
      contentEl.querySelectorAll('.pg-inspect-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var sid = this.getAttribute('data-id');
          if (selectEl) {
            selectEl.value = sid;
            updateView(sid);
          }
        });
      });
    }

    if (selectEl) {
      selectEl.addEventListener('change', function () {
        updateView(this.value);
      });
    }

    if (filterEl) {
      filterEl.addEventListener('input', function () {
        var query = this.value.toLowerCase().trim();
        if (!selectEl) return;
        var opts = selectEl.querySelectorAll('option');
        for (var i = 0; i < opts.length; i++) {
          var opt = opts[i];
          if (opt.value === 'CLASS_OVERVIEW' || opt.value === 'TOPIC_ANALYSIS') continue;
          var text = opt.textContent.toLowerCase();
          opt.style.display = (!query || text.indexOf(query) !== -1) ? '' : 'none';
        }
      });
    }

    // Default view: Class Overview
    updateView('CLASS_OVERVIEW');
  }

  root.PGAnalysis = {
    build: build,
    render: render,
    parentSummary: parentSummary,
    WEAK_BELOW: WEAK_BELOW
  };

  if (typeof module !== 'undefined') module.exports = root.PGAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
