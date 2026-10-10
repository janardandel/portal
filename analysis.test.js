const assert = require('assert');
global.window = global;
require('./demo-analysis-data.js');
const A = require('./analysis.js');

const out = A.build(global.PG_DEMO_ANALYSIS);
assert.ok(out, 'Build output should not be null');

// Verify student-level metrics
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

// Verify Roll Number integration
assert.strictEqual(aarav.roll_number, '2026-001');
assert.strictEqual(diya.roll_number, '2026-002');
assert.ok(out.studentList.every(std => std.roll_number && std.roll_number.startsWith('2026-')));

// Verify Class Performance summary
assert.strictEqual(out.classSummary.totalStudents, 8);
assert.ok(out.classSummary.avgAccuracy > 0 && out.classSummary.avgAccuracy <= 100);
assert.ok(out.classSummary.avgScore > 0);
assert.ok(out.classSummary.topStudent);
assert.ok(out.classSummary.lowestStudent);
assert.strictEqual(out.studentList[0].rank, 1);
assert.strictEqual(out.studentList[out.studentList.length - 1].rank, 8);
assert.ok(out.cohort.topics.length > 0);

console.log('Class Performance verified successfully:');
console.log('  Total Students:', out.classSummary.totalStudents);
console.log('  Class Avg Accuracy:', out.classSummary.avgAccuracy + '%');
console.log('  Top Student:', out.classSummary.topStudent.student_name, '[' + out.classSummary.topStudent.roll_number + ']');
console.log('  Lowest Student:', out.classSummary.lowestStudent.student_name, '[' + out.classSummary.lowestStudent.roll_number + ']');
console.log('  At Risk Count:', out.classSummary.atRiskCount);
console.log('ok all tests passed!');
