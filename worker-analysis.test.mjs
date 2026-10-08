import assert from 'node:assert';
const { buildAnalysisPayload } = await import('./_worker.js');
const attempts = [
  { student_id: 's1', question_id: 'q1', selected_answer: 'A', is_correct: true,  time_taken_sec: 30 },
  { student_id: 's1', question_id: 'q2', selected_answer: 'B', is_correct: false, time_taken_sec: 50 },
  { student_id: 's1', question_id: 'q3', selected_answer: null, is_correct: null, time_taken_sec: 5 },
];
const p = buildAnalysisPayload(attempts, [{ id: 's1', full_name: 'DEMO One' }],
  [{ id: 'q1', subject: 'Physics', chapter: 'Kinematics', difficulty_level: 'Easy' }], { correctMarks: 4, negativeMarks: 1 });
assert.deepStrictEqual(p.question_results.map(r => [r.status, r.marks]), [['correct', 4], ['wrong', -1], ['skipped', 0]]);
assert.strictEqual(p.question_results[0].student_name, 'DEMO One');
assert.strictEqual(p.questions.find(q => q.id === 'q2').subject, 'Untagged');
// feeds the existing analysis module end-to-end
globalThis.window = globalThis;
const { default: A } = await import('./analysis.js');
const out = A.build(p);
assert.ok(out && out.students.s1.overall.total === 3);
console.log('ok');
