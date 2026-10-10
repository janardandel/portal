/* DEMO ONLY - fake data for verifying reports analysis. Safe to delete this file;
   reports.html only uses it when the URL has ?demo=1. All names start with "DEMO". */
(function (root) {
  // Subjects / chapters / topics are real rows from the portal's jee_syllabus table (exam = JEE).
  var spec = [
    ['Chemistry','Alcohols, Phenols and Ethers','Williamson synthesis','Medium'],
    ['Chemistry','Alcohols, Phenols and Ethers','Kolbe reaction','Hard'],
    ['Chemistry','Aldehydes, Ketones and Carboxylic Acids','Oxidation','Easy'],
    ['Chemistry','Aldehydes, Ketones and Carboxylic Acids','Cannizzaro reaction','Hard'],
    ['Chemistry','Amines','Diazonium salts','Medium'],
    ['Chemistry','Amines','Azo coupling','Hard'],
    ['Maths','Applications of Derivatives',"Lagrange's mean value theorem",'Hard'],
    ['Maths','Applications of Derivatives','Increasing and decreasing functions','Medium'],
    ['Maths','Application of Integrals','Application of Integrals','Medium'],
    ['Physics','Alternating Current','Alternating Current','Easy'],
    ['Physics','Alternating Current','Power factor','Medium'],
    ['Physics','Atoms','X-rays','Medium'],
    ['Physics','Atoms',"Moseley's law",'Hard'],
    ['Physics','Current Electricity','Heating effect','Easy'],
    ['Physics','Current Electricity','Current Electricity','Medium']
  ];
  var questions = [];
  spec.forEach(function (c, i) {
    for (var k = 0; k < 2; k++) {
      questions.push({
        id: 'DEMO-Q' + (i * 2 + k + 1),
        subject: c[0],
        chapter: c[1],
        topic: c[2],
        difficulty: c[3],
        max_marks: 4,
        neg_marks: 1
      });
    }
  });

  // Demo student profiles with realistic Roll Numbers (from Moodle idnumber/username)
  var studentsRoster = [
    { id: 'DEMO-S1', roll_number: '2026-001', name: 'DEMO Aarav Sharma (strong)', weak: {} },
    { id: 'DEMO-S2', roll_number: '2026-002', name: 'DEMO Diya Patel (weak Organic Chemistry)', weak: { 'Williamson synthesis': 0, 'Kolbe reaction': 0, 'Cannizzaro reaction': 0, 'Diazonium salts': 0.5, 'Azo coupling': 0 } },
    { id: 'DEMO-S3', roll_number: '2026-003', name: 'DEMO Kabir Singh (weak Calculus)', weak: { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0 } },
    { id: 'DEMO-S4', roll_number: '2026-004', name: 'DEMO Meera Iyer (weak Atoms and AC)', weak: { 'X-rays': 0, "Moseley's law": 0, 'Power factor': 0, 'Alternating Current': 0.5 } },
    { id: 'DEMO-S5', roll_number: '2026-005', name: 'DEMO Rohan Das (average)', weak: { "Moseley's law": 0, 'Azo coupling': 0, "Lagrange's mean value theorem": 0.5, 'Kolbe reaction': 0.5 } },
    { id: 'DEMO-S6', roll_number: '2026-006', name: 'DEMO Sana Khan (guesses a lot)', weak: { 'Heating effect': 0, 'Oxidation': 0, 'Application of Integrals': 0, 'Power factor': 0, 'Diazonium salts': 0 } },
    { id: 'DEMO-S7', roll_number: '2026-007', name: 'DEMO Vikram Rao (weak Maths)', weak: { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0, 'Current Electricity': 0.5 } },
    { id: 'DEMO-S8', roll_number: '2026-008', name: 'DEMO Tara Menon (top)', weak: { "Moseley's law": 0.5 } }
  ];

  var results = [];
  studentsRoster.forEach(function (std, si) {
    var seen = {};
    questions.forEach(function (q, qi) {
      seen[q.topic] = (seen[q.topic] || 0) + 1;
      var acc = std.weak[q.topic];
      if (acc === undefined) acc = 1;
      var ok = acc >= 1 || (acc > 0 && seen[q.topic] === 1);
      var skip = !ok && acc === 0 && seen[q.topic] === 2;
      var status = ok ? 'correct' : (skip ? 'skipped' : 'wrong');
      results.push({
        student_id: std.id,
        roll_number: std.roll_number,
        student_name: std.name,
        question_id: q.id,
        status: status,
        marks: ok ? 4 : (skip ? 0 : -1),
        time_seconds: 35 + ((qi * 11 + si * 17) % 80)
      });
    });
  });

  root.PG_DEMO_ANALYSIS = {
    moodle_url: 'https://lms.pitthugram.com',
    quiz_title: 'JEE Advanced Grand Mock Test 01',
    moodle_quiz_id: '101',
    course_name: 'JEE Masterclass 2026',
    questions: questions,
    question_results: results,
    students: studentsRoster.map(function(s) { return { student_id: s.id, roll_number: s.roll_number, student_name: s.name }; })
  };
})(typeof window !== 'undefined' ? window : globalThis);
