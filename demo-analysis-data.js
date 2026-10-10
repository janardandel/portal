/* DEMO ONLY - comprehensive mock data for verifying reports analysis and cohort comparison.
   Includes distinct classes/batches:
   - Test 101: Class 12 JEE Advanced Grand Mock (Morning Batch)
   - Test 102: Class 11 Physics Electrostatics Diagnostic (Evening Batch)
   - Test 103: Class 11 NEET Droppers Biology & Chemistry Assessment
   - Test 104: Class 10 Foundation Science Board Benchmark
*/
(function (root) {
  // ── 1. JEE Syllabus Questions Spec ────────────────────────────
  var jeeSpec = [
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
  var jeeQuestions = [];
  jeeSpec.forEach(function (c, i) {
    for (var k = 0; k < 2; k++) {
      jeeQuestions.push({
        id: 'JEE-Q' + (i * 2 + k + 1),
        subject: c[0],
        chapter: c[1],
        topic: c[2],
        difficulty: c[3],
        max_marks: 4,
        neg_marks: 1
      });
    }
  });

  // ── 2. Class 11 Diagnostic Questions Spec (Physics & Chem) ────
  var c11Spec = [
    ['Physics','Electrostatics','Coulomb Law & Field','Easy'],
    ['Physics','Electrostatics','Electric Dipole & Flux','Medium'],
    ['Physics','Electrostatics','Gauss Law Applications','Hard'],
    ['Physics','Current Electricity',"Ohm's Law & Drift Velocity",'Easy'],
    ['Physics','Current Electricity',"Kirchhoff's Rules",'Medium'],
    ['Physics','Current Electricity','Potentiometer & Meter Bridge','Hard'],
    ['Physics','Capacitance','Parallel Plate Capacitors','Medium'],
    ['Physics','Capacitance','Energy Stored in Capacitor','Hard'],
    ['Chemistry','Chemical Bonding','VSEPR Theory','Easy'],
    ['Chemistry','Chemical Bonding','Hybridization & Molecular Orbitals','Hard']
  ];
  var c11Questions = [];
  c11Spec.forEach(function (c, i) {
    for (var k = 0; k < 2; k++) {
      c11Questions.push({
        id: 'C11-Q' + (i * 2 + k + 1),
        subject: c[0],
        chapter: c[1],
        topic: c[2],
        difficulty: c[3],
        max_marks: 4,
        neg_marks: 1
      });
    }
  });

  // ── 3. NEET Droppers Questions Spec (Biology & Chemistry) ─────
  var neetSpec = [
    ['Botany','Cell Biology','Cell Wall & Membrane Transport','Easy'],
    ['Botany','Cell Biology','Mitochondria & Chloroplasts','Medium'],
    ['Botany','Plant Physiology','Photosynthesis - Light Reaction','Hard'],
    ['Botany','Plant Physiology','Calvin Cycle & Photorespiration','Medium'],
    ['Zoology','Human Physiology','Digestion & Absorption','Easy'],
    ['Zoology','Human Physiology','Cardiac Cycle & ECG','Medium'],
    ['Zoology','Genetics','Mendelian Dihybrid Crosses','Hard'],
    ['Zoology','Genetics','Linkage & Chromosomal Disorders','Hard'],
    ['Chemistry','Biomolecules','Amino Acids & Peptide Bonds','Easy'],
    ['Chemistry','Biomolecules','DNA & RNA Nucleotides','Medium']
  ];
  var neetQuestions = [];
  neetSpec.forEach(function (c, i) {
    for (var k = 0; k < 2; k++) {
      neetQuestions.push({
        id: 'NEET-Q' + (i * 2 + k + 1),
        subject: c[0],
        chapter: c[1],
        topic: c[2],
        difficulty: c[3],
        max_marks: 4,
        neg_marks: 1
      });
    }
  });

  // ── 4. Class 10 Foundation Science Spec ────────────────────────
  var fndSpec = [
    ['Physics','Light - Reflection and Refraction','Mirror Formula & Sign Convention','Easy'],
    ['Physics','Light - Reflection and Refraction','Lens Formula & Magnification','Medium'],
    ['Physics','Electricity',"Ohm's Law & Resistance in Series/Parallel",'Medium'],
    ['Chemistry','Chemical Reactions and Equations','Balancing Equations','Easy'],
    ['Chemistry','Acids, Bases and Salts','pH Scale & Neutralization','Easy'],
    ['Biology','Life Processes','Nutrition and Respiration in Amoeba & Humans','Medium'],
    ['Biology','Life Processes','Heart Function and Double Circulation','Hard']
  ];
  var fndQuestions = [];
  fndSpec.forEach(function (c, i) {
    for (var k = 0; k < 2; k++) {
      fndQuestions.push({
        id: 'FND-Q' + (i * 2 + k + 1),
        subject: c[0],
        chapter: c[1],
        topic: c[2],
        difficulty: c[3],
        max_marks: 3,
        neg_marks: 0
      });
    }
  });

  // ── Helper to generate student results ────────────────────────
  function generateResults(students, questions, maxMarks, negMarks) {
    var list = [];
    students.forEach(function (std, si) {
      var seen = {};
      questions.forEach(function (q, qi) {
        seen[q.topic] = (seen[q.topic] || 0) + 1;
        var acc = std.weak[q.topic];
        if (acc === undefined) acc = 1;
        var ok = acc >= 1 || (acc > 0 && seen[q.topic] === 1);
        var skip = !ok && acc === 0 && seen[q.topic] === 2;
        var status = ok ? 'correct' : (skip ? 'skipped' : 'wrong');
        list.push({
          student_id: std.id,
          roll_number: std.roll_number,
          student_name: std.name,
          question_id: q.id,
          status: status,
          marks: ok ? maxMarks : (skip ? 0 : -negMarks),
          time_seconds: 35 + ((qi * 11 + si * 17) % 80)
        });
      });
    });
    return list;
  }

  // ── Roster 1: Class 12 JEE Advanced (Morning Batch) ───────────
  var jeeStudents = [
    { id: 'JEE-S1', roll_number: 'JEE26-001', name: 'Aarav Sharma', weak: {} },
    { id: 'JEE-S2', roll_number: 'JEE26-002', name: 'Diya Patel', weak: { 'Williamson synthesis': 0, 'Kolbe reaction': 0, 'Cannizzaro reaction': 0, 'Diazonium salts': 0.5, 'Azo coupling': 0 } },
    { id: 'JEE-S3', roll_number: 'JEE26-003', name: 'Kabir Singh', weak: { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0 } },
    { id: 'JEE-S4', roll_number: 'JEE26-004', name: 'Meera Iyer', weak: { 'X-rays': 0, "Moseley's law": 0, 'Power factor': 0, 'Alternating Current': 0.5 } },
    { id: 'JEE-S5', roll_number: 'JEE26-005', name: 'Rohan Das', weak: { "Moseley's law": 0, 'Azo coupling': 0, "Lagrange's mean value theorem": 0.5, 'Kolbe reaction': 0.5 } },
    { id: 'JEE-S6', roll_number: 'JEE26-006', name: 'Sana Khan', weak: { 'Heating effect': 0, 'Oxidation': 0, 'Application of Integrals': 0, 'Power factor': 0, 'Diazonium salts': 0 } },
    { id: 'JEE-S7', roll_number: 'JEE26-007', name: 'Vikram Rao', weak: { "Lagrange's mean value theorem": 0, 'Increasing and decreasing functions': 0, 'Application of Integrals': 0, 'Current Electricity': 0.5 } },
    { id: 'JEE-S8', roll_number: 'JEE26-008', name: 'Tara Menon', weak: { "Moseley's law": 0.5 } }
  ];

  // ── Roster 2: Class 11 Physics (Evening Batch) ─────────────────
  var c11Students = [
    { id: 'C11-S1', roll_number: 'EVN27-011', name: 'Ananya Deshmukh', weak: {} },
    { id: 'C11-S2', roll_number: 'EVN27-012', name: 'Reyansh Gupta', weak: { 'Potentiometer & Meter Bridge': 0, 'Gauss Law Applications': 0 } },
    { id: 'C11-S3', roll_number: 'EVN27-013', name: 'Ishaan Verma', weak: { 'Energy Stored in Capacitor': 0, 'Parallel Plate Capacitors': 0.5 } },
    { id: 'C11-S4', roll_number: 'EVN27-014', name: 'Prisha Nair', weak: { 'Hybridization & Molecular Orbitals': 0, "Kirchhoff's Rules": 0 } },
    { id: 'C11-S5', roll_number: 'EVN27-015', name: 'Aditya Kulkarni', weak: { 'Electric Dipole & Flux': 0.5, 'Potentiometer & Meter Bridge': 0 } },
    { id: 'C11-S6', roll_number: 'EVN27-016', name: 'Kavya Joshi', weak: {} },
    { id: 'C11-S7', roll_number: 'EVN27-017', name: 'Devansh Pandey', weak: { 'Gauss Law Applications': 0, 'Energy Stored in Capacitor': 0, "Kirchhoff's Rules": 0 } }
  ];

  // ── Roster 3: Class 11 NEET Droppers Batch ────────────────────
  var neetStudents = [
    { id: 'NEET-S1', roll_number: 'NEET26-101', name: 'Pooja Sundaram', weak: {} },
    { id: 'NEET-S2', roll_number: 'NEET26-102', name: 'Zoya Siddiqui', weak: { 'Calvin Cycle & Photorespiration': 0, 'Linkage & Chromosomal Disorders': 0 } },
    { id: 'NEET-S3', roll_number: 'NEET26-103', name: 'Nikhil Aggarwal', weak: { 'Photosynthesis - Light Reaction': 0.5, 'Cardiac Cycle & ECG': 0 } },
    { id: 'NEET-S4', roll_number: 'NEET26-104', name: 'Shreya Bhattacharya', weak: { 'Linkage & Chromosomal Disorders': 0, 'Mendelian Dihybrid Crosses': 0.5 } },
    { id: 'NEET-S5', roll_number: 'NEET26-105', name: 'Manish Chawla', weak: { 'DNA & RNA Nucleotides': 0, 'Amino Acids & Peptide Bonds': 0.5 } },
    { id: 'NEET-S6', roll_number: 'NEET26-106', name: 'Harshita Reddy', weak: {} }
  ];

  // ── Roster 4: Class 10 Foundation Science Batch ───────────────
  var fndStudents = [
    { id: 'F10-S1', roll_number: 'F10-501', name: 'Aryan Mehta', weak: {} },
    { id: 'F10-S2', roll_number: 'F10-502', name: 'Tanvi Saxena', weak: { "Heart Function and Double Circulation": 0 } },
    { id: 'F10-S3', roll_number: 'F10-503', name: 'Omkar Tiwari', weak: { "Ohm's Law & Resistance in Series/Parallel": 0, "Lens Formula & Magnification": 0 } },
    { id: 'F10-S4', roll_number: 'F10-504', name: 'Anika Sen', weak: { "pH Scale & Neutralization": 0.5 } },
    { id: 'F10-S5', roll_number: 'F10-505', name: 'Kunal Mukherjee', weak: { "Heart Function and Double Circulation": 0, "Lens Formula & Magnification": 0 } }
  ];

  // ── Export Comprehensive Multi-Batch Demo Dataset ─────────────
  root.PG_DEMO_DATASETS = {
    '101': {
      quiz_name: 'JEE Advanced Grand Mock Test 01',
      course_name: 'Class 12 JEE Advanced (Morning Batch)',
      batch_name: 'JEE Morning',
      class: '12',
      timelimit: 3600,
      max_score: 120,
      questions: jeeQuestions,
      question_results: generateResults(jeeStudents, jeeQuestions, 4, 1),
      students: jeeStudents.map(function(s) { return { student_id: s.id, roll_number: s.roll_number, student_name: s.name }; })
    },
    '102': {
      quiz_name: 'Physics Electrostatics & Current Diagnostic',
      course_name: 'Class 11 Physics (Evening Batch)',
      batch_name: 'JEE Evening',
      class: '11',
      timelimit: 2700,
      max_score: 80,
      questions: c11Questions,
      question_results: generateResults(c11Students, c11Questions, 4, 1),
      students: c11Students.map(function(s) { return { student_id: s.id, roll_number: s.roll_number, student_name: s.name }; })
    },
    '103': {
      quiz_name: 'NEET Biology & Bio-Chem Drill 02',
      course_name: 'Class 11 NEET Droppers Batch',
      batch_name: 'NEET Droppers',
      class: '11',
      timelimit: 3000,
      max_score: 80,
      questions: neetQuestions,
      question_results: generateResults(neetStudents, neetQuestions, 4, 1),
      students: neetStudents.map(function(s) { return { student_id: s.id, roll_number: s.roll_number, student_name: s.name }; })
    },
    '104': {
      quiz_name: 'Class 10 Foundation Science Benchmark',
      course_name: 'Class 10 Secondary Foundation',
      batch_name: 'Class 10 Foundation',
      class: '10',
      timelimit: 2400,
      max_score: 42,
      questions: fndQuestions,
      question_results: generateResults(fndStudents, fndQuestions, 3, 0),
      students: fndStudents.map(function(s) { return { student_id: s.id, roll_number: s.roll_number, student_name: s.name }; })
    }
  };

  // Backwards compatibility for single global reference
  root.PG_DEMO_ANALYSIS = root.PG_DEMO_DATASETS['101'];

})(typeof window !== 'undefined' ? window : globalThis);
