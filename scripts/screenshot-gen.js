#!/usr/bin/env node
/* Regenerates docs/screenshots/*.svg — phone-frame mockups of every app screen.
   Style follows the SPSC Essence system: #FAFAFA canvas, white 16px-radius cards,
   #2D6CDF primary, Inter type. Run: node scripts/screenshot-gen.js */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const W = 280, H = 660;
const BLUE = '#2D6CDF', INK = '#1A1A1B', MUT = '#717172', LINE = '#F0F0F0';

const TABS = ['Home', 'Entry', 'Reports', 'Notices', 'More'];
const tabX = i => 14 + 252 * (i + 0.5) / 5;

function svg(name, { title, content, active, noNav, headerRight }) {
  const header = `<rect x="14" y="58" width="252" height="44" fill="#FFFFFF"/>
  <line x1="14" y1="102" x2="266" y2="102" stroke="#EEEEEE"/>
  <text x="32" y="86" font-size="14" font-weight="700" letter-spacing="0.5" fill="${BLUE}">SPSC</text>
  ${headerRight || `<circle cx="246" cy="80" r="13" fill="#E8E8E8"/>
  <text x="246" y="85" font-size="9" font-weight="600" fill="${BLUE}" text-anchor="middle">A</text>`}`;
  const nav = noNav ? '' : `<rect x="14" y="582" width="252" height="54" fill="#FFFFFF"/>
  <line x1="14" y1="582" x2="266" y2="582" stroke="#EEEEEE"/>
  ${TABS.map((t, i) => {
    const cx = tabX(i), on = t === active;
    return on
      ? `<rect x="${cx - 26}" y="590" width="52" height="32" rx="14" fill="${BLUE}"/><text x="${cx}" y="611" font-size="9" font-weight="600" fill="#FFFFFF" text-anchor="middle">${t}</text>`
      : `<text x="${cx}" y="611" font-size="9" font-weight="600" fill="#9AA0A8" text-anchor="middle">${t}</text>`;
  }).join('\n  ')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, sans-serif">
  <!-- phone frame -->
  <rect x="6" y="6" width="268" height="648" rx="42" fill="#111111"/>
  <rect x="10" y="10" width="260" height="640" rx="38" fill="#20242C"/>
  <rect x="14" y="14" width="252" height="636" rx="32" fill="#FAFAFA"/>
  <!-- status bar -->
  <text x="34" y="38" font-size="11" font-weight="600" fill="${INK}">9:41</text>
  <circle cx="230" cy="34" r="1.8" fill="${INK}" opacity="0.8"/>
  <circle cx="238" cy="34" r="1.8" fill="${INK}" opacity="0.8"/>
  <rect x="246" y="31.5" width="9" height="4" rx="2" fill="${INK}" opacity="0.8"/>
  <!-- header -->
  ${header}
  <!-- content -->
  ${content}
  <!-- bottom nav -->
  ${nav}
</svg>
`;
}

function label(x, y, txt) {
  return `<text x="${x}" y="${y}" font-size="8" font-weight="600" letter-spacing="0.8" fill="${MUT}">${txt}</text>`;
}
function card(x, y, w, h, r = 12) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#FFFFFF" stroke="${LINE}"/>`;
}
function btn(x, y, w, h, fill, r = 12) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
}

/* ---------------- screens ---------------- */
const screens = {
  login: {
    noNav: true,
    title: '',
    content: `<rect x="52" y="180" width="176" height="176" rx="88" fill="#EBF1FD"/>
  <text x="140" y="266" font-size="40" font-weight="700" fill="${BLUE}" text-anchor="middle">S</text>
  <text x="140" y="292" font-size="16" font-weight="700" fill="${INK}" text-anchor="middle">Bio Attendance</text>
  <text x="140" y="308" font-size="8.5" fill="${MUT}" text-anchor="middle">Sialkot Public School &amp; College</text>
  <rect x="50" y="392" width="180" height="34" rx="10" fill="#FFFFFF" stroke="${LINE}"/>
  <text x="62" y="414" font-size="9.5" fill="#1A1A1B">admin@school</text>
  <rect x="50" y="434" width="180" height="34" rx="10" fill="#FFFFFF" stroke="${LINE}"/>
  <text x="62" y="456" font-size="9.5" fill="#1A1A1B">••••••••</text>
  <rect x="50" y="478" width="180" height="38" rx="12" fill="${BLUE}"/>
  <text x="140" y="502" font-size="11" font-weight="600" fill="#FFFFFF" text-anchor="middle">Sign In</text>
  <text x="140" y="536" font-size="8" fill="#A0A0A0" text-anchor="middle">Same account as attendance.spscsialkot.com</text>`,
  },
  home: {
    title: 'Home', active: 'Home',
    content: `<text x="32" y="124" font-size="14.5" font-weight="300" fill="${INK}">Good morning, admin</text>
  <text x="32" y="139" font-size="9" fill="${MUT}">Welcome back. Here is your overview for today.</text>
  <rect x="32" y="150" width="216" height="28" rx="10" fill="#FFF9E6"/>
  <polygon points="44,160 50,171 38,171" fill="#F39C12"/>
  <text x="58" y="168" font-size="9" fill="#805D00">Entries close at <tspan font-weight="600">09:30 AM</tspan> · 1st Period</text>
  ${card(32, 186, 104, 54)}<text x="48" y="206" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">TEACHERS</text><text x="48" y="228" font-size="22" font-weight="300" fill="${INK}">23</text>
  ${card(144, 186, 104, 54)}<text x="160" y="206" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">STUDENTS</text><text x="160" y="228" font-size="22" font-weight="300" fill="${INK}">622</text>
  ${card(32, 248, 104, 54)}<text x="48" y="268" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">CLASSES</text><text x="48" y="290" font-size="22" font-weight="300" fill="${INK}">23</text>
  ${card(144, 248, 104, 54)}<text x="160" y="268" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">TODAY'S ENTRIES</text><text x="160" y="290" font-size="22" font-weight="300" fill="${BLUE}">0</text>
  ${label(32, 324, 'QUICK ACTIONS')}
  ${btn(32, 332, 216, 40, BLUE)}<text x="80" y="351" font-size="11" font-weight="600" fill="#FFFFFF">Daily Entry</text><text x="80" y="363" font-size="8" fill="#FFFFFF" opacity="0.8">Mark attendance and uniform</text><text x="240" y="358" font-size="13" fill="#FFFFFF" opacity="0.85" text-anchor="end">›</text>
  ${card(32, 378, 216, 40)}<text x="80" y="397" font-size="11" font-weight="600" fill="${INK}">View Reports</text><text x="80" y="409" font-size="8" fill="${MUT}">Daily, weekly, monthly &amp; student-wise</text><text x="240" y="404" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${card(32, 424, 216, 40)}<text x="80" y="443" font-size="11" font-weight="600" fill="${INK}">Audit Trail</text><text x="80" y="455" font-size="8" fill="${MUT}">Secret timestamps &amp; late detection</text><text x="240" y="450" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${label(32, 486, "TODAY'S ENTRY STATUS")}
  ${card(32, 494, 216, 76, 16)}<text x="48" y="516" font-size="11.5" font-weight="600" fill="${INK}">10B</text><text x="48" y="528" font-size="8.5" fill="${MUT}">Ms. Khadija</text><text x="186" y="517" font-size="8.5" fill="${MUT}" text-anchor="end">0/20</text><rect x="194" y="506" width="46" height="18" rx="8" fill="#FDECEA"/><text x="217" y="518" font-size="7.5" font-weight="600" fill="#E74C3C" text-anchor="middle">Not Done</text>
  <line x1="48" y1="533" x2="248" y2="533" stroke="#EEEEEE"/>
  <text x="48" y="555" font-size="11.5" font-weight="600" fill="${INK}">5G</text><text x="48" y="567" font-size="8.5" fill="${MUT}">Ms. Kiran</text><text x="186" y="556" font-size="8.5" fill="${MUT}" text-anchor="end">27/27</text><rect x="194" y="545" width="46" height="18" rx="8" fill="#E9F7EF"/><text x="217" y="557" font-size="7.5" font-weight="600" fill="#006D37" text-anchor="middle">Done</text>`,
  },
  entry: {
    title: 'Daily Entry', active: 'Entry',
    content: `<text x="32" y="124" font-size="14.5" font-weight="600" fill="${INK}">Class 10B · Mon 4 Nov</text>
  <text x="32" y="139" font-size="9" fill="${MUT}">21 students · 6 checks each</text>
  <rect x="32" y="150" width="216" height="8" rx="4" fill="#E8E8E8"/><rect x="32" y="150" width="129" height="8" rx="4" fill="${BLUE}"/>
  <text x="32" y="172" font-size="8.5" fill="${MUT}">15 / 21 marked</text>
  ${card(32, 184, 216, 74, 16)}
  <text x="48" y="206" font-size="11" font-weight="600" fill="${INK}">M. Haider</text><text x="48" y="219" font-size="8" fill="${MUT}">Roll 2539</text>
  ${['U', 'S', 'So', 'H', 'N', 'B'].map((c, i) => {
    const cx = 48 + i * 34, on = i < 5;
    return `<circle cx="${cx}" cy="240" r="9" fill="${on ? '#E9F7EF' : '#FFFFFF'}" stroke="${on ? '#1F9D63' : '#D8D8D8'}"/><text x="${cx}" y="243" font-size="6.5" font-weight="600" fill="${on ? '#006D37' : '#9AA0A8'}" text-anchor="middle">${c}</text>`;
  }).join('\n  ')}
  ${card(32, 266, 216, 74, 16)}
  <text x="48" y="288" font-size="11" font-weight="600" fill="${INK}">Usman Aftab</text><text x="48" y="301" font-size="8" fill="${MUT}">Roll 2570</text>
  ${['U', 'S', 'So', 'H', 'N', 'B'].map((c, i) => {
    const cx = 48 + i * 34, on = i < 6;
    return `<circle cx="${cx}" cy="322" r="9" fill="${on ? '#E9F7EF' : '#FFFFFF'}" stroke="${on ? '#1F9D63' : '#D8D8D8'}"/><text x="${cx}" y="325" font-size="6.5" font-weight="600" fill="${on ? '#006D37' : '#9AA0A8'}" text-anchor="middle">${c}</text>`;
  }).join('\n  ')}
  <rect x="32" y="352" width="216" height="34" rx="12" fill="#FFFFFF" stroke="${BLUE}" stroke-width="1.5"/>
  <text x="140" y="374" font-size="10.5" font-weight="600" fill="${BLUE}" text-anchor="middle">✓✓ Mark All Uniform</text>
  <text x="248" y="366" font-size="11" fill="#A0A0A0" text-anchor="end">↺</text>
  ${btn(32, 400, 216, 40, BLUE)}<text x="140" y="425" font-size="11" font-weight="600" fill="#FFFFFF" text-anchor="middle">Save Entry</text>
  <text x="140" y="456" font-size="8" fill="#A0A0A0" text-anchor="middle">Saved entries update the website instantly</text>`,
  },
  reports: {
    title: 'Reports', active: 'Reports',
    content: `<rect x="32" y="118" width="60" height="26" rx="13" fill="${BLUE}"/><text x="62" y="134" font-size="9" font-weight="600" fill="#FFFFFF" text-anchor="middle">Daily</text>
  <rect x="98" y="118" width="62" height="26" rx="13" fill="#FFFFFF" stroke="${LINE}"/><text x="129" y="134" font-size="9" fill="${MUT}" text-anchor="middle">Weekly</text>
  <rect x="166" y="118" width="72" height="26" rx="13" fill="#FFFFFF" stroke="${LINE}"/><text x="202" y="134" font-size="9" fill="${MUT}" text-anchor="middle">Monthly</text>
  ${card(32, 156, 216, 70, 14)}
  <text x="48" y="178" font-size="8" font-weight="600" letter-spacing="0.8" fill="${MUT}">UNIFORM COMPLIANCE</text>
  <rect x="48" y="188" width="184" height="9" rx="4.5" fill="#E8E8E8"/><rect x="48" y="188" width="147" height="9" rx="4.5" fill="#1F9D63"/>
  <text x="48" y="213" font-size="8.5" fill="${MUT}">80% · 17 of 21 students</text>
  ${label(32, 248, 'RECORDS')}
  ${card(32, 256, 216, 176, 16)}
  <rect x="48" y="270" width="184" height="22" rx="8" fill="#F5F6F8"/>
  ${['Name', 'Uniform', 'Shoes', 'Absent'].map((h, i) => {
    const cx = 48 + i * 46 + 23;
    return `<text x="${cx}" y="285" font-size="7" font-weight="600" fill="${MUT}" text-anchor="middle">${h}</text>`;
  }).join('\n  ')}
  ${[['M. Haider', '✓', '✓', '—'], ['Usman Aftab', '✓', '✗', '—'], ['Moiz Butt', '✗', '—', '✓']].map((r, ri) => {
    const ry = 296 + ri * 40;
    return `<text x="48" y="${ry + 18}" font-size="8.5" font-weight="500" fill="${INK}">${r[0]}</text>`
      + r.slice(1).map((v, ci) => {
        const cx = 142 + ci * 30;
        const col = v === '✓' ? '#006D37' : v === '✗' ? '#E74C3C' : '#C0C0C0';
        return `<text x="${cx}" y="${ry + 18}" font-size="9.5" font-weight="600" fill="${col}" text-anchor="middle">${v}</text>`;
      }).join('');
  }).join('\n  ')}`,
  },
  settings: {
    title: 'Profile', active: 'More',
    content: `<circle cx="140" cy="150" r="34" fill="#EBF1FD"/><text x="140" y="160" font-size="26" font-weight="600" fill="${BLUE}" text-anchor="middle">H</text>
  <text x="140" y="200" font-size="13" font-weight="600" fill="${INK}" text-anchor="middle">Hafiz Ahmad</text>
  <text x="140" y="215" font-size="9" fill="${MUT}" text-anchor="middle">Administrator · Class 10B</text>
  ${card(32, 236, 216, 46, 14)}<text x="48" y="258" font-size="9" fill="${MUT}">Late warnings</text><text x="248" y="258" font-size="11" font-weight="600" fill="#E74C3C" text-anchor="end">3</text>
  ${label(32, 302, 'ADMIN TOOLS')}
  ${card(32, 310, 216, 40)}<text x="80" y="334" font-size="11" font-weight="600" fill="${INK}">Manage Students</text><text x="240" y="335" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${card(32, 356, 216, 40)}<text x="80" y="380" font-size="11" font-weight="600" fill="${INK}">Manage Teachers</text><text x="240" y="381" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${card(32, 402, 216, 40)}<text x="80" y="426" font-size="11" font-weight="600" fill="${INK}">Attendance Deadline</text><text x="240" y="427" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${card(32, 456, 216, 40)}<text x="80" y="480" font-size="11" font-weight="600" fill="${INK}">WhatsApp Number</text><text x="240" y="481" font-size="11" font-weight="600" fill="${BLUE}" text-anchor="end">+92…</text>
  ${btn(32, 510, 216, 38, '#FDECEA', 12)}<text x="140" y="534" font-size="10.5" font-weight="600" fill="#E74C3C" text-anchor="middle">Log Out</text>
  <text x="140" y="566" font-size="7.5" fill="#A0A0A0" text-anchor="middle">Bio Attendance v1.3.1</text>`,
  },
  manage: {
    title: 'Manage', active: 'More',
    content: `<text x="32" y="124" font-size="14.5" font-weight="600" fill="${INK}">Administration</text>
  <text x="32" y="139" font-size="9" fill="${MUT}">Tools for keeping records in order</text>
  ${card(32, 160, 104, 96, 16)}<rect x="48" y="178" width="30" height="30" rx="10" fill="#EBF1FD"/><text x="63" y="198" font-size="12" fill="${BLUE}" text-anchor="middle">▤</text><text x="60" y="230" font-size="10.5" font-weight="600" fill="${INK}">Students</text><text x="60" y="243" font-size="7.5" fill="${MUT}">622 enrolled</text>
  ${card(144, 160, 104, 96, 16)}<rect x="160" y="178" width="30" height="30" rx="10" fill="#EBF1FD"/><text x="175" y="198" font-size="12" fill="${BLUE}" text-anchor="middle">◉</text><text x="172" y="230" font-size="10.5" font-weight="600" fill="${INK}">Teachers</text><text x="172" y="243" font-size="7.5" fill="${MUT}">23 active</text>
  ${card(32, 268, 104, 96, 16)}<rect x="48" y="286" width="30" height="30" rx="10" fill="#EBF1FD"/><text x="63" y="306" font-size="12" fill="${BLUE}" text-anchor="middle">₨</text><text x="60" y="338" font-size="10.5" font-weight="600" fill="${INK}">Fees</text><text x="60" y="351" font-size="7.5" fill="${MUT}">Dues &amp; receipts</text>
  ${card(144, 268, 104, 96, 16)}<rect x="160" y="286" width="30" height="30" rx="10" fill="#EBF1FD"/><text x="175" y="306" font-size="12" fill="${BLUE}" text-anchor="middle">◎</text><text x="172" y="338" font-size="10.5" font-weight="600" fill="${INK}">Notices</text><text x="172" y="351" font-size="7.5" fill="${MUT}">School circulars</text>
  <text x="32" y="392" font-size="8" font-weight="600" letter-spacing="0.8" fill="${MUT}">DEFERRED</text>
  ${card(32, 400, 216, 40)}<text x="80" y="424" font-size="11" font-weight="600" fill="${INK}">Audit Trail</text><text x="80" y="436" font-size="8" fill="${MUT}">Entry timestamps &amp; late flags</text><text x="240" y="431" font-size="13" fill="${MUT}" text-anchor="end">›</text>
  ${card(32, 446, 216, 40)}<text x="80" y="470" font-size="11" font-weight="600" fill="${INK}">CSV Bulk Upload</text><text x="80" y="482" font-size="8" fill="${MUT}">Import students from a file</text><text x="240" y="477" font-size="13" fill="${MUT}" text-anchor="end">›</text>`,
  },
  students: {
    title: 'Students', active: 'More', headerRight: `<rect x="206" y="67" width="54" height="26" rx="13" fill="${BLUE}"/><text x="233" y="84" font-size="9" font-weight="600" fill="#FFFFFF" text-anchor="middle">＋ Add</text>`,
    content: `<rect x="32" y="120" width="216" height="32" rx="12" fill="#FFFFFF" stroke="${LINE}"/><text x="46" y="140" font-size="9" fill="#A0A0A0">Search name or roll…</text>
  <rect x="32" y="164" width="52" height="24" rx="12" fill="${BLUE}"/><text x="58" y="179" font-size="8.5" font-weight="600" fill="#FFFFFF" text-anchor="middle">10B</text>
  <rect x="90" y="164" width="52" height="24" rx="12" fill="#FFFFFF" stroke="${LINE}"/><text x="116" y="179" font-size="8.5" fill="${MUT}" text-anchor="middle">5G</text>
  <rect x="148" y="164" width="52" height="24" rx="12" fill="#FFFFFF" stroke="${LINE}"/><text x="174" y="179" font-size="8.5" fill="${MUT}" text-anchor="middle">7A</text>
  ${card(32, 200, 216, 52, 14)}<text x="48" y="222" font-size="10.5" font-weight="600" fill="${INK}">M. Haider</text><text x="48" y="236" font-size="8" fill="${MUT}">Roll 2539 · 10B</text><text x="210" y="225" font-size="8" font-weight="600" fill="${BLUE}">Edit</text>
  ${card(32, 260, 216, 52, 14)}<text x="48" y="282" font-size="10.5" font-weight="600" fill="${INK}">Usman Aftab</text><text x="48" y="296" font-size="8" fill="${MUT}">Roll 2570 · 10B</text><text x="210" y="285" font-size="8" font-weight="600" fill="${BLUE}">Edit</text>
  ${card(32, 320, 216, 52, 14)}<text x="48" y="342" font-size="10.5" font-weight="600" fill="${INK}">Moiz Butt</text><text x="48" y="356" font-size="8" fill="${MUT}">Roll 2605 · 10B</text><text x="210" y="345" font-size="8" font-weight="600" fill="${BLUE}">Edit</text>
  ${card(32, 380, 216, 52, 14)}<text x="48" y="402" font-size="10.5" font-weight="600" fill="${INK}">Ali Raza</text><text x="48" y="416" font-size="8" fill="${MUT}">Roll 2621 · 10B</text><text x="210" y="405" font-size="8" font-weight="600" fill="${BLUE}">Edit</text>
  <text x="140" y="470" font-size="8.5" fill="#A0A0A0" text-anchor="middle">Tap a row for WhatsApp &amp; face options</text>`,
  },
  teachers: {
    title: 'Teachers', active: 'More', headerRight: `<rect x="206" y="67" width="54" height="26" rx="13" fill="${BLUE}"/><text x="233" y="84" font-size="9" font-weight="600" fill="#FFFFFF" text-anchor="middle">＋ Add</text>`,
    content: `<rect x="32" y="120" width="216" height="32" rx="12" fill="#FFFFFF" stroke="${LINE}"/><text x="46" y="140" font-size="9" fill="#A0A0A0">Search teacher…</text>
  ${card(32, 168, 216, 58, 14)}<circle cx="62" cy="190" r="14" fill="#EBF1FD"/><text x="62" y="195" font-size="9" font-weight="600" fill="${BLUE}" text-anchor="middle">K</text><text x="86" y="188" font-size="10.5" font-weight="600" fill="${INK}">Ms. Khadija</text><text x="86" y="202" font-size="8" fill="${MUT}">Class 10B · 9876</text><rect x="196" y="180" width="42" height="18" rx="9" fill="#E9F7EF"/><text x="217" y="192" font-size="7.5" font-weight="600" fill="#006D37" text-anchor="middle">Active</text>
  ${card(32, 234, 216, 58, 14)}<circle cx="62" cy="256" r="14" fill="#EBF1FD"/><text x="62" y="261" font-size="9" font-weight="600" fill="${BLUE}" text-anchor="middle">K</text><text x="86" y="254" font-size="10.5" font-weight="600" fill="${INK}">Ms. Kiran</text><text x="86" y="268" font-size="8" fill="${MUT}">Class 5G · 5432</text><rect x="196" y="246" width="42" height="18" rx="9" fill="#E9F7EF"/><text x="217" y="258" font-size="7.5" font-weight="600" fill="#006D37" text-anchor="middle">Active</text>
  ${card(32, 300, 216, 58, 14)}<circle cx="62" cy="322" r="14" fill="#F3F3F3"/><text x="62" y="327" font-size="9" font-weight="600" fill="${MUT}" text-anchor="middle">A</text><text x="86" y="320" font-size="10.5" font-weight="600" fill="${INK}">Mr. Aslam</text><text x="86" y="334" font-size="8" fill="${MUT}">Class 7A · 1122</text><rect x="196" y="312" width="42" height="18" rx="9" fill="#FDECEA"/><text x="217" y="324" font-size="7.5" font-weight="600" fill="#E74C3C" text-anchor="middle">Inactive</text>
  <text x="140" y="398" font-size="8.5" fill="#A0A0A0" text-anchor="middle">Tap a row to edit or reset login</text>`,
  },
  face: {
    title: 'Face Attendance', active: 'More',
    content: `<text x="32" y="124" font-size="14.5" font-weight="600" fill="${INK}">On-device face check-in</text>
  <text x="32" y="139" font-size="9" fill="${MUT}">No photos leave the phone</text>
  ${card(32, 164, 216, 110, 16)}<circle cx="62" cy="206" r="22" fill="#EBF1FD"/><text x="62" y="211" font-size="11" fill="${BLUE}" text-anchor="middle">▣</text><text x="96" y="196" font-size="11.5" font-weight="600" fill="${INK}">Enroll Student</text><text x="96" y="212" font-size="8" fill="${MUT}">3 camera samples → face vector</text><rect x="96" y="226" width="104" height="24" rx="12" fill="${BLUE}"/><text x="148" y="242" font-size="8.5" font-weight="600" fill="#FFFFFF" text-anchor="middle">Start Enroll</text>
  ${card(32, 286, 216, 110, 16)}<circle cx="62" cy="328" r="22" fill="#EBF1FD"/><text x="62" y="333" font-size="11" fill="${BLUE}" text-anchor="middle">◉</text><text x="96" y="318" font-size="11.5" font-weight="600" fill="${INK}">Scan Class</text><text x="96" y="334" font-size="8" fill="${MUT}">Live match · ~1 frame per second</text><rect x="96" y="348" width="104" height="24" rx="12" fill="${BLUE}"/><text x="148" y="364" font-size="8.5" font-weight="600" fill="#FFFFFF" text-anchor="middle">Start Scan</text>
  ${label(32, 426, 'ENROLLED (10B)')}
  <text x="48" y="448" font-size="9.5" fill="${INK}">• M. Haider</text>
  <text x="48" y="466" font-size="9.5" fill="${INK}">• Usman Aftab</text>
  <text x="48" y="484" font-size="9.5" fill="${INK}">• Moiz Butt</text>
  <text x="140" y="520" font-size="8" fill="#A0A0A0" text-anchor="middle">Face data stays on-device as 192-d vectors</text>`,
  },
  enroll: {
    title: 'Enroll Student', active: 'More',
    content: `<rect x="14" y="106" width="252" height="348" fill="#111318"/>
  <ellipse cx="140" cy="252" rx="72" ry="96" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="140" y="140" font-size="11" font-weight="600" fill="#FFFFFF">M. Haider · 2539</text>
  <rect x="210" y="122" width="30" height="30" rx="10" fill="rgba(255,255,255,0.14)"/><text x="225" y="142" font-size="12" fill="#FFFFFF" text-anchor="middle">⇄</text>
  <text x="140" y="382" font-size="8.5" fill="rgba(255,255,255,0.7)" text-anchor="middle">Front camera · good light · no glare</text>
  <circle cx="90" cy="420" r="8" fill="#FFFFFF" opacity="0.25"/><circle cx="140" cy="420" r="8" fill="#1F9D63"/><circle cx="190" cy="420" r="8" fill="#FFFFFF" opacity="0.25"/>
  <text x="140" y="446" font-size="8.5" fill="#A0A0A0" text-anchor="middle">Sample 2 of 3 — keep still</text>
  <circle cx="140" cy="400" r="26" fill="none" stroke="#FFFFFF" stroke-width="3"/>
  <circle cx="140" cy="400" r="19" fill="rgba(255,255,255,0.2)"/>
  <rect x="32" y="472" width="216" height="40" rx="12" fill="${BLUE}"/><text x="140" y="497" font-size="11" font-weight="600" fill="#FFFFFF" text-anchor="middle">Capture Sample</text>
  <text x="140" y="530" font-size="8" fill="#A0A0A0" text-anchor="middle">3 samples build a more reliable match</text>`,
  },
  scan: {
    title: 'Scan Class 10B', active: 'More',
    content: `<rect x="14" y="106" width="252" height="348" fill="#111318"/>
  <rect x="52" y="196" width="176" height="176" rx="24" fill="rgba(52,209,126,0.14)" stroke="#1F9D63" stroke-width="3"/>
  <circle cx="96" cy="238" r="20" fill="#2B2F38"/><path d="M 88 246 Q 96 232 104 246 Z" fill="#8A8F9A"/><circle cx="90" cy="230" r="2.5" fill="#DDE1E6"/><circle cx="102" cy="230" r="2.5" fill="#DDE1E6"/>
  <text x="196" y="260" font-size="10" font-weight="600" fill="#34D17E" text-anchor="middle">✓ M. Haider</text>
  <text x="196" y="274" font-size="7.5" fill="rgba(255,255,255,0.7)" text-anchor="middle">matched · 0.86</text>
  <text x="140" y="382" font-size="8.5" fill="rgba(255,255,255,0.7)" text-anchor="middle">3 present · scanning…</text>
  <text x="140" y="426" font-size="8" font-weight="600" letter-spacing="0.8" fill="${MUT}" text-anchor="middle">PRESENT</text>
  <rect x="32" y="436" width="216" height="34" rx="12" fill="#FFFFFF"/>
  <circle cx="56" cy="453" r="9" fill="#E9F7EF"/><text x="56" y="457" font-size="7" font-weight="600" fill="#006D37" text-anchor="middle">✓</text>
  <text x="74" y="457" font-size="9" font-weight="500" fill="${INK}">M. Haider</text>
  <rect x="32" y="476" width="216" height="34" rx="12" fill="#FFFFFF"/>
  <circle cx="56" cy="493" r="9" fill="#E9F7EF"/><text x="56" y="497" font-size="7" font-weight="600" fill="#006D37" text-anchor="middle">✓</text>
  <text x="74" y="497" font-size="9" font-weight="500" fill="${INK}">Usman Aftab</text>
  ${btn(32, 522, 216, 38, BLUE)}<text x="140" y="546" font-size="10.5" font-weight="600" fill="#FFFFFF" text-anchor="middle">Finish &amp; Save</text>`,
  },
  defaulters: {
    title: 'Defaulters', active: 'More',
    content: `<rect x="32" y="118" width="64" height="26" rx="13" fill="${BLUE}"/><text x="64" y="134" font-size="9" font-weight="600" fill="#FFFFFF" text-anchor="middle">Uniform</text>
  <rect x="102" y="118" width="66" height="26" rx="13" fill="#FFFFFF" stroke="${LINE}"/><text x="135" y="134" font-size="9" fill="${MUT}" text-anchor="middle">Absence</text>
  <rect x="174" y="118" width="60" height="26" rx="13" fill="#FFFFFF" stroke="${LINE}"/><text x="204" y="134" font-size="9" fill="${MUT}" text-anchor="middle">Fees</text>
  ${label(32, 170, 'TODAY · 4 WITHOUT UNIFORM')}
  ${card(32, 178, 216, 50, 14)}<text x="48" y="200" font-size="10.5" font-weight="600" fill="${INK}">M. Haider</text><text x="48" y="214" font-size="8" fill="${MUT}">Roll 2539 · missing 2 items</text><rect x="188" y="188" width="48" height="26" rx="13" fill="#1DA851"/><text x="212" y="205" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle">WhatsApp</text>
  ${card(32, 236, 216, 50, 14)}<text x="48" y="258" font-size="10.5" font-weight="600" fill="${INK}">Usman Aftab</text><text x="48" y="272" font-size="8" fill="${MUT}">Roll 2570 · missing 1 item</text><rect x="188" y="246" width="48" height="26" rx="13" fill="#1DA851"/><text x="212" y="263" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle">WhatsApp</text>
  ${card(32, 294, 216, 50, 14)}<text x="48" y="316" font-size="10.5" font-weight="600" fill="${INK}">Moiz Butt</text><text x="48" y="330" font-size="8" fill="${MUT}">Roll 2605 · shoes only</text><rect x="188" y="304" width="48" height="26" rx="13" fill="#1DA851"/><text x="212" y="321" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle">WhatsApp</text>
  ${card(32, 352, 216, 50, 14)}<text x="48" y="374" font-size="10.5" font-weight="600" fill="${INK}">Ali Raza</text><text x="48" y="388" font-size="8" fill="${MUT}">Roll 2621 · nails</text><rect x="188" y="362" width="48" height="26" rx="13" fill="#1DA851"/><text x="212" y="379" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle">WhatsApp</text>
  <text x="140" y="440" font-size="8" fill="#A0A0A0" text-anchor="middle">Batch-send all, or schedule a reminder</text>`,
  },
  fees: {
    title: 'Fee Dues', active: 'More',
    content: `<text x="32" y="124" font-size="9" fill="${MUT}">November 2026</text>
  ${card(32, 136, 104, 62, 14)}<text x="48" y="158" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">BILLED</text><text x="48" y="184" font-size="18" font-weight="300" fill="${INK}">₹—</text>
  ${card(144, 136, 104, 62, 14)}<text x="160" y="158" font-size="7" font-weight="600" letter-spacing="0.8" fill="${MUT}">RECEIVED</text><text x="160" y="184" font-size="18" font-weight="300" fill="#1F9D63">₹—</text>
  ${card(32, 210, 216, 68, 14)}<rect x="48" y="226" width="34" height="26" rx="8" fill="#FFF9E6"/><text x="65" y="244" font-size="9" fill="#F39C12" text-anchor="middle">!</text><text x="92" y="234" font-size="10" font-weight="600" fill="${INK}">M. Haider · 2539</text><text x="92" y="248" font-size="8" fill="#E74C3C">Due · 2 months · Rs 4,000</text><text x="240" y="242" font-size="8" font-weight="600" fill="${BLUE}" text-anchor="end">Pay</text>
  ${card(32, 286, 216, 68, 14)}<rect x="48" y="302" width="34" height="26" rx="8" fill="#FFF9E6"/><text x="65" y="320" font-size="9" fill="#F39C12" text-anchor="middle">!</text><text x="92" y="310" font-size="10" font-weight="600" fill="${INK}">Usman Aftab · 2570</text><text x="92" y="324" font-size="8" fill="#E74C3C">Due · 1 month · Rs 2,000</text><text x="240" y="318" font-size="8" font-weight="600" fill="${BLUE}" text-anchor="end">Pay</text>
  ${card(32, 362, 216, 68, 14)}<rect x="48" y="378" width="34" height="26" rx="8" fill="#E9F7EF"/><text x="65" y="396" font-size="9" fill="#1F9D63" text-anchor="middle">✓</text><text x="92" y="386" font-size="10" font-weight="600" fill="${INK}">Moiz Butt · 2605</text><text x="92" y="400" font-size="8" fill="${MUT}">Paid in full</text>
  <text x="140" y="470" font-size="8" fill="#A0A0A0" text-anchor="middle">CSV import supported · admin only</text>`,
  },
  notices: {
    title: 'Notices', active: 'Notices',
    content: `${card(32, 120, 216, 96, 16)}<circle cx="60" cy="144" r="14" fill="#EBF1FD"/><text x="60" y="149" font-size="9" font-weight="700" fill="${BLUE}" text-anchor="middle">N</text><text x="84" y="142" font-size="10.5" font-weight="600" fill="${INK}">Winter Uniform From Monday</text><text x="84" y="156" font-size="8" fill="${MUT}">2 days ago</text><text x="48" y="178" font-size="8" fill="#4A4A4B">All students must switch to the winter uniform…</text><rect x="218" y="140" width="8" height="8" rx="4" fill="${BLUE}"/>
  ${card(32, 224, 216, 96, 16)}<circle cx="60" cy="248" r="14" fill="#F3F3F3"/><text x="60" y="253" font-size="9" font-weight="700" fill="${MUT}" text-anchor="middle">N</text><text x="84" y="246" font-size="10.5" font-weight="600" fill="${INK}">PTM Rescheduled</text><text x="84" y="260" font-size="8" fill="${MUT}">5 days ago</text><text x="48" y="282" font-size="8" fill="#4A4A4B">Parent–teacher meeting moved to Saturday 9 AM…</text>
  ${card(32, 328, 216, 96, 16)}<circle cx="60" cy="352" r="14" fill="#F3F3F3"/><text x="60" y="357" font-size="9" font-weight="700" fill="${MUT}" text-anchor="middle">N</text><text x="84" y="350" font-size="10.5" font-weight="600" fill="${INK}">Fee Deadline Extended</text><text x="84" y="364" font-size="8" fill="${MUT}">1 week ago</text><text x="48" y="386" font-size="8" fill="#4A4A4B">Deadline for November fees extended to the…</text>
  <text x="248" y="452" font-size="8" font-weight="600" fill="${BLUE}" text-anchor="end">Mark all read</text>`,
  },
  notify: {
    title: 'Notify Parents', active: 'More',
    content: `<rect x="32" y="120" width="216" height="8" rx="4" fill="#E8E8E8"/><rect x="32" y="120" width="162" height="8" rx="4" fill="${BLUE}"/>
  <text x="32" y="142" font-size="8.5" fill="${MUT}">3 of 4 sent · resumes automatically</text>
  ${card(32, 156, 216, 58, 14)}<circle cx="62" cy="178" r="14" fill="#E9F7EF"/><text x="62" y="183" font-size="9" font-weight="600" fill="#006D37" text-anchor="middle">✓</text><text x="86" y="176" font-size="10.5" font-weight="600" fill="${INK}">M. Haider</text><text x="86" y="190" font-size="8" fill="${MUT}">Uniform missing 2 items</text><text x="248" y="185" font-size="7.5" font-weight="600" fill="#1F9D63" text-anchor="end">Sent</text>
  ${card(32, 222, 216, 58, 14)}<circle cx="62" cy="244" r="14" fill="#E9F7EF"/><text x="62" y="249" font-size="9" font-weight="600" fill="#006D37" text-anchor="middle">✓</text><text x="86" y="242" font-size="10.5" font-weight="600" fill="${INK}">Usman Aftab</text><text x="86" y="256" font-size="8" fill="${MUT}">Shoes not worn</text><text x="248" y="251" font-size="7.5" font-weight="600" fill="#1F9D63" text-anchor="end">Sent</text>
  ${card(32, 288, 216, 58, 14)}<circle cx="62" cy="310" r="14" fill="#FFF3E0"/><text x="62" y="315" font-size="9" font-weight="600" fill="#E67E22" text-anchor="middle">…</text><text x="86" y="308" font-size="10.5" font-weight="600" fill="${INK}">Moiz Butt</text><text x="86" y="322" font-size="8" fill="${MUT}">Nails long</text><text x="248" y="317" font-size="7.5" font-weight="600" fill="#E67E22" text-anchor="end">Sending</text>
  ${card(32, 354, 216, 58, 14)}<circle cx="62" cy="376" r="14" fill="#F3F3F3"/><text x="62" y="381" font-size="9" font-weight="600" fill="${MUT}" text-anchor="middle">?</text><text x="86" y="374" font-size="10.5" font-weight="600" fill="${INK}">Ali Raza</text><text x="86" y="388" font-size="8" fill="${MUT}">No number on file</text><rect x="188" y="364" width="48" height="26" rx="13" fill="${BLUE}"/><text x="212" y="381" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle">Add No.</text>
  <text x="140" y="452" font-size="8" fill="#A0A0A0" text-anchor="middle">Opens WhatsApp chat for each parent</text>`,
  },
};

fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const [name, def] of Object.entries(screens)) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg(name, def));
  count++;
}
console.log(`wrote ${count} SVGs → ${OUT}`);
