const assert = require('assert');
global.window = global;
require('./demo-analysis-data.js');
const A = require('./analysis.js');
const out = A.build(global.PG_DEMO_ANALYSIS);
const s = Object.values(out.students);
const diya = s.find(x => x.student_name.includes('Diya'));
const kabir = s.find(x => x.student_name.includes('Kabir'));
const aarav = s.find(x => x.student_name.includes('Aarav'));
assert.strictEqual(aarav.needsImprovement.length, 0);
assert.ok(diya.needsImprovement.every(c => c.subject === 'Chemistry') && diya.needsImprovement.length >= 3, JSON.stringify(diya.needsImprovement.map(c=>c.name)));
assert.strictEqual(diya.subjects[0].subject, 'Chemistry');   // most marks lost
assert.strictEqual(kabir.chapters[0].chapter, 'Applications of Derivatives');
assert.ok(A.parentSummary(diya).includes('Chemistry'));
assert.strictEqual(A.build({ questions: [], question_results: [] }), null);
console.log('ok', out.cohort.subjects.map(x => x.subject + ':' + x.accuracy));
