/* DEMO ONLY — fake data for verifying reports analysis. Safe to delete this file;
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
    for (var k = 0; k < 2; k++) questions.push({ id: 'DEMO-Q' + (i * 2 + k + 1), subject: c[0], chapter: c[1], topic: c[2], difficulty: c[3], max_marks: 4, neg_marks: 1 });
  });
  // accuracy per topic, 0..1 (rest are wrong; the 2nd question of a 0-accuracy topic is skipped)
  var weakTopics = {
    'DEMO Aarav Sharma (strong)': {},
    'DEMO Diya Patel (weak Organic Chemistry)': { 'Williamson synthesis': 0, 'Kolbe reaction': 0, 'Cannizzaro reaction': 0, 'Diazonium salts': 0.5, 'Azo coupling': 0 },
    'DEMO Kabir Singh (weak Calculus)': { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0 },
    'DEMO Meera Iyer (weak Atoms and AC)': { 'X-rays': 0, "Moseley's law": 0, 'Power factor': 0, 'Alternating Current': 0.5 },
    'DEMO Rohan Das (average)': { "Moseley's law": 0, 'Azo coupling': 0, "Lagrange's mean value theorem": 0.5, 'Kolbe reaction': 0.5 },
    'DEMO Sana Khan (guesses a lot)': { 'Heating effect': 0, 'Oxidation': 0, 'Application of Integrals': 0, 'Power factor': 0, 'Diazonium salts': 0 },
    'DEMO Vikram Rao (weak Maths)': { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0, 'Current Electricity': 0.5 },
    'DEMO Tara Menon (top)': { "Moseley's law": 0.5 }
  };
  var results = [];
  Object.keys(weakTopics).forEach(function (name, si) {
    var seen = {};
    questions.forEach(function (q, qi) {
      seen[q.topic] = (seen[q.topic] || 0) + 1;
      var acc = weakTopics[name][q.topic]; if (acc === undefined) acc = 1;
      var ok = acc >= 1 || (acc > 0 && seen[q.topic] === 1);
      var skip = !ok && acc === 0 && seen[q.topic] === 2;
      var status = ok ? 'correct' : (skip ? 'skipped' : 'wrong');
      results.push({ student_id: 'DEMO-S' + (si + 1), student_name: name, question_id: q.id, status: status,
        marks: ok ? 4 : (skip ? 0 : -1), time_seconds: 35 + ((qi * 11 + si * 17) % 80) });
    });
  });
  root.PG_DEMO_ANALYSIS = { questions: questions, question_results: results };
})(window);
