<?php
// bulk-students-upload module for api.php (drop into the site's api.php routing)
//
// Lets an admin bulk-import a roster from a single Excel (.xlsx) or CSV file.
// Columns (header row, any order, case-insensitive):
//   name            - student's full name (required)
//   reg number      - registration / roll number (required)  (aliases: reg_no, regno, roll, rollno, roll_no)
//   class           - class name, e.g. "6" or "6A" (required)
//   section         - section key or name, e.g. "A" / "R" / "Red" (optional; folded into the class)
//   whatsapp number - parent WhatsApp number (optional)        (aliases: whatsapp, phone, mobile, number)
//
// Students are grouped into their class automatically: the final class key is
// "class" + "section" (e.g. class "6" + section "A" -> "6A"), so a teacher whose
// account is assigned to "6A" sees exactly those students. Section names are
// shortened to their key: "Red" / "R" -> "R", "Green" -> "G", "Blue" -> "B",
// so class "5" + section "Red" becomes "5R". A section that does not exist yet
// is created simply by importing a student into it (class lists are built from
// the students table). A class cell that already carries the section
// ("5R", "5 Red", "5-R") is used as-is instead of being appended twice.
//
// Pass flush=1 (or replace_all=1) with the upload to delete the whole existing
// roster first, so the uploaded file becomes the complete student list.
// Attendance history (daily_records) is kept. An existing student (same class +
// reg number) is updated in place instead of duplicated.
//
// No schema change required on the live site: "section" is folded into the
// class key (e.g. class "6" + section "A" -> "6A"), and the existing
// "whatsapp" / "rollno" columns are reused. Only make sure a UNIQUE KEY on
// (class, rollno) exists so re-uploads update instead of duplicate; the site's
// manage.php already relies on it. If missing:
//   ALTER TABLE students ADD UNIQUE KEY uq_class_roll (class, rollno);
//
// Router additions in api.php:
//   case 'manage/upload':
//       require_once __DIR__.'/bulk-students-upload.php'; handle_bulk_students_upload(); break;
//
//   // inside the existing manage/action switch (same place as add_student etc.)
//   case 'bulk_delete_students':
//       require_once __DIR__.'/bulk-students-upload.php'; handle_bulk_delete_students(); break;
//
// The app uploads the picked file as multipart under the field name "csv_file"
// (kept for backwards compatibility) OR "students_file".

function handle_bulk_students_upload() {
    global $pdo, $user;
    if (!isset($user) || ($user['role'] !== 'admin' && $user['role'] !== 'principal')) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'message' => 'Forbidden']);
        return;
    }

    // Accept either field name so older clients keep working.
    $file = null;
    foreach (['csv_file', 'students_file', 'file'] as $key) {
        if (isset($_FILES[$key]) && is_uploaded_file($_FILES[$key]['tmp_name'])) {
            $file = $_FILES[$key];
            break;
        }
    }
    if (!$file) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'No file uploaded.']);
        return;
    }

    // Upload hardening: size limit and strict extension whitelist.
    $maxBytes = 5 * 1024 * 1024; // 5 MB
    if (!isset($file['size']) || (int)$file['size'] > $maxBytes) {
        http_response_code(413);
        echo json_encode(['ok' => false, 'message' => 'File too large (max 5 MB).']);
        return;
    }
    if (!is_uploaded_file($file['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Invalid upload.']);
        return;
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['csv', 'txt', 'xlsx'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Unsupported file type. Use .csv or .xlsx.']);
        return;
    }
    // Validate MIME type as a second line of defence.
    $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : null;
    if ($finfo) {
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        $allowedMimes = ['text/plain', 'text/csv', 'application/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'];
        if ($mime && !in_array($mime, $allowedMimes, true)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'File content type not allowed.']);
            return;
        }
    }
    $rows = [];
    $parseError = null;
    try {
        if ($ext === 'csv' || $ext === 'txt') {
            $rows = parse_bulk_students_csv($file['tmp_name']);
        } elseif ($ext === 'xlsx') {
            $rows = parse_bulk_students_xlsx($file['tmp_name']);
        } else {
            $parseError = 'Unsupported file type. Use .csv or .xlsx.';
        }
    } catch (Throwable $e) {
        $parseError = $e->getMessage();
    }

    if ($parseError) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => $parseError]);
        return;
    }
    if (empty($rows)) {
        echo json_encode(['ok' => false, 'message' => 'No student rows found. Check the column headers.']);
        return;
    }

    $input = bulk_students_request_input();

    // Snapshot the class list so newly created sections can be reported back.
    // Taken before the flush, otherwise every section would look new.
    $classesBefore = [];
    foreach ($pdo->query("SELECT DISTINCT class FROM students WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN) as $c) {
        $classesBefore[$c] = true;
    }

    // Flush (replace-all): drop the previous roster before inserting the new one.
    // Only runs once the file has parsed cleanly, so a bad upload never wipes data.
    $flushed = 0;
    if (!empty($input['flush']) || !empty($input['replace_all'])) {
        try {
            $flushed = (int)$pdo->exec("DELETE FROM students");
            if (function_exists('logAudit')) {
                logAudit($pdo, 'FLUSH_STUDENTS', 'students', 0, "Flushed $flushed students before bulk import");
            }
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'Could not flush the existing students: ' . $e->getMessage()]);
            return;
        }
    }

    $imported = 0;
    $updated  = 0;
    $skipped  = 0;
    $errors   = [];
    $seen     = [];
    $used     = [];

    foreach ($rows as $i => $r) {
        $name    = trim($r['name'] ?? '');
        $roll    = trim($r['reg_number'] ?? $r['roll'] ?? $r['rollno'] ?? '');
        $class   = trim($r['class'] ?? '');
        $section = trim($r['section'] ?? '');
        $whatsapp= trim($r['whatsapp_number'] ?? $r['whatsapp'] ?? $r['phone'] ?? $r['mobile'] ?? $r['number'] ?? '');

        if ($name === '' || $roll === '' || $class === '') {
            $skipped++;
            $errors[] = 'Row ' . ($i + 2) . ': name, reg number and class are required.';
            continue;
        }
        // Group students into their class: append the section key (5 + Red -> 5R).
        $className = bulk_students_class_key($class, $section);
        if ($className === '') {
            $skipped++;
            $errors[] = 'Row ' . ($i + 2) . ': name, reg number and class are required.';
            continue;
        }
        $used[$className] = true;

        // De-duplicate within the same upload.
        $key = $className . "\x1f" . $roll;
        if (isset($seen[$key])) {
            $skipped++;
            $errors[] = 'Row ' . ($i + 2) . ': duplicate reg number ' . $roll . ' in class ' . $className . '.';
            continue;
        }
        $seen[$key] = true;

        try {
            $stmt = $pdo->prepare(
                "INSERT INTO students (class, rollno, name, whatsapp)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   name = VALUES(name),
                   whatsapp = VALUES(whatsapp)"
            );
            $stmt->execute([$className, $roll, $name, $whatsapp !== '' ? $whatsapp : '']);
            if ($stmt->rowCount() === 1) $imported++;
            else $updated++;
        } catch (Throwable $e) {
            $skipped++;
            $errors[] = 'Row ' . ($i + 2) . ': ' . $e->getMessage();
        }
    }

    $newSections = [];
    foreach (array_keys($used) as $c) {
        if (!isset($classesBefore[$c])) $newSections[] = $c;
    }
    sort($newSections);

    $message = "Imported $imported new, updated $updated, skipped $skipped of " . count($rows) . " rows.";
    if ($flushed > 0) $message .= " Flushed $flushed previous students.";
    if ($newSections) $message .= ' New sections: ' . implode(', ', $newSections) . '.';

    echo json_encode([
        'ok'           => true,
        'message'      => $message,
        'imported'     => $imported,
        'updated'      => $updated,
        'skipped'      => $skipped,
        'flushed'      => $flushed,
        'new_sections' => $newSections,
        'errors'       => $errors,
    ]);
}

/**
 * Bulk-delete (deactivate) students of one or more classes, or every class.
 *
 * Router addition in api.php (the manage/action switch):
 *   case 'bulk_delete_students':
 *       require_once __DIR__.'/bulk-students-upload.php';
 *       handle_bulk_delete_students(); break;
 *
 * Body: { action: 'bulk_delete_students', classes: ['5R', '6A'], all: 0|1 }
 */
function handle_bulk_delete_students() {
    global $pdo, $user;
    if (!isset($user) || ($user['role'] !== 'admin' && $user['role'] !== 'principal')) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'message' => 'Forbidden']);
        return;
    }

    $input = bulk_students_request_input();
    $all = !empty($input['all']);
    $classes = $input['classes'] ?? $input['class'] ?? [];
    if (!is_array($classes)) $classes = [$classes];
    $classes = array_values(array_filter(array_map('trim', array_map('strval', $classes)), 'strlen'));

    if (!$all && empty($classes)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'message' => 'Choose at least one class to delete.']);
        return;
    }

    try {
        if ($all) {
            $affected = (int)$pdo->exec("UPDATE students SET is_active = 0 WHERE is_active = 1");
            $label = 'all classes';
        } else {
            $placeholders = implode(',', array_fill(0, count($classes), '?'));
            $stmt = $pdo->prepare("UPDATE students SET is_active = 0 WHERE is_active = 1 AND class IN ($placeholders)");
            $stmt->execute($classes);
            $affected = (int)$stmt->rowCount();
            $label = implode(', ', $classes);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'Could not delete the students: ' . $e->getMessage()]);
        return;
    }

    if (function_exists('logAudit')) {
        logAudit($pdo, 'BULK_DELETE_STUDENTS', 'students', 0, "Deactivated $affected students ($label)");
    }

    echo json_encode([
        'ok'       => true,
        'deleted'  => $affected,
        'classes'  => $all ? [] : $classes,
        'message'  => "Deleted $affected students from $label.",
    ]);
}

/**
 * POST body for these handlers: form fields (multipart/urlencoded) or a JSON
 * body, whichever the caller sent.
 */
function bulk_students_request_input() {
    static $data = null;
    if (is_array($data)) return $data;

    $data = $_POST;
    if (empty($data)) {
        $raw = file_get_contents('php://input');
        if (is_string($raw) && $raw !== '') {
            $json = json_decode($raw, true);
            if (is_array($json)) $data = $json;
        }
    }
    return $data;
}

// ---------------------------------------------------------------------------
// CSV parser: header row in any column order, or bare rows.
// ---------------------------------------------------------------------------
function parse_bulk_students_csv($path) {
    $out = [];
    $fh = fopen($path, 'r');
    if (!$fh) throw new RuntimeException('Could not read the uploaded file.');
    $lines = [];
    while (($row = fgetcsv($fh, 1000, ',', '"', '\\')) !== false) $lines[] = $row;
    fclose($fh);
    if (empty($lines)) return $out;

    $header = array_map('bulk_students_norm_header', $lines[0]);
    $hasHeader = in_array('name', $header, true)
              || in_array('reg_number', $header, true)
              || in_array('roll', $header, true)
              || in_array('class', $header, true);

    if ($hasHeader) {
        $idx = bulk_students_column_index($header);
        foreach (array_slice($lines, 1) as $line) {
            if (bulk_students_row_empty($line)) continue;
            $out[] = [
                'name'            => bulk_students_cell($line, $idx['name']),
                'reg_number'      => bulk_students_cell($line, $idx['reg']),
                'class'           => bulk_students_cell($line, $idx['class']),
                'section'         => bulk_students_cell($line, $idx['section']),
                'whatsapp_number' => bulk_students_cell($line, $idx['whatsapp']),
            ];
        }
    } else {
        // Bare rows: name, reg number, class, section, whatsapp
        foreach ($lines as $line) {
            if (bulk_students_row_empty($line)) continue;
            $out[] = [
                'name'            => trim($line[0] ?? ''),
                'reg_number'      => trim($line[1] ?? ''),
                'class'           => trim($line[2] ?? ''),
                'section'         => trim($line[3] ?? ''),
                'whatsapp_number' => trim($line[4] ?? ''),
            ];
        }
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Minimal .xlsx parser using ZipArchive + SimpleXML (no PhpSpreadsheet needed).
// ---------------------------------------------------------------------------
function parse_bulk_students_xlsx($path) {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('ZipArchive is not available on this server; upload a CSV instead.');
    }
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        throw new RuntimeException('Could not open the Excel file.');
    }

    // Shared strings.
    $shared = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false) {
        $sx = simplexml_load_string($sharedXml);
        if ($sx) {
            foreach ($sx->si as $si) {
                // concatenate all <t> runs
                $text = '';
                if (isset($si->t)) {
                    $text = (string)$si->t;
                } else {
                    foreach ($si->r as $r) $text .= (string)$r->t;
                }
                $shared[] = $text;
            }
        }
    }

    // First worksheet.
    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if ($sheetXml === false) throw new RuntimeException('No worksheet found in the Excel file.');

    $sx = simplexml_load_string($sheetXml);
    if (!$sx) throw new RuntimeException('Could not parse the Excel worksheet.');

    // Column letters -> index.
    $rows = [];
    foreach ($sx->sheetData->row as $row) {
        $cells = [];
        foreach ($row->c as $c) {
            $ref = (string)$c['r'];
            preg_match('/^([A-Z]+)/', $ref, $m);
            $col = $m[1];
            $colIdx = bulk_students_col_letter_to_index($col);
            $type = (string)$c['t'];
            $raw = isset($c->v) ? (string)$c->v : '';
            if ($type === 's') {
                $val = isset($shared[(int)$raw]) ? $shared[(int)$raw] : '';
            } elseif ($type === 'inlineStr') {
                $val = isset($c->is->t) ? (string)$c->is->t : '';
            } else {
                $val = $raw;
            }
            $cells[$colIdx] = trim($val);
        }
        if (empty($cells)) continue;
        // Preserve column positions even when a row skips intermediate columns
        // (sparse rows): pad missing slots with empty strings so values do not
        // shift left and break header-based column mapping.
        $maxCol = max(array_keys($cells));
        for ($i = 0; $i <= $maxCol; $i++) {
            if (!isset($cells[$i])) $cells[$i] = '';
        }
        ksort($cells);
        $rows[] = array_values($cells);
    }
    if (empty($rows)) return [];

    // Detect header row.
    $header = array_map('bulk_students_norm_header', $rows[0]);
    $hasHeader = in_array('name', $header, true)
              || in_array('reg_number', $header, true)
              || in_array('roll', $header, true)
              || in_array('class', $header, true);

    $out = [];
    if ($hasHeader) {
        $idx = bulk_students_column_index($header);
        foreach (array_slice($rows, 1) as $line) {
            if (bulk_students_row_empty($line)) continue;
            $out[] = [
                'name'            => bulk_students_cell($line, $idx['name']),
                'reg_number'      => bulk_students_cell($line, $idx['reg']),
                'class'           => bulk_students_cell($line, $idx['class']),
                'section'         => bulk_students_cell($line, $idx['section']),
                'whatsapp_number' => bulk_students_cell($line, $idx['whatsapp']),
            ];
        }
    } else {
        foreach ($rows as $line) {
            if (bulk_students_row_empty($line)) continue;
            $out[] = [
                'name'            => trim($line[0] ?? ''),
                'reg_number'      => trim($line[1] ?? ''),
                'class'           => trim($line[2] ?? ''),
                'section'         => trim($line[3] ?? ''),
                'whatsapp_number' => trim($line[4] ?? ''),
            ];
        }
    }
    return $out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Section key: "Red" -> R, "Green" -> G, "Blue" -> B, "A" -> A.
 * Unknown longer names keep their first letter ("Rose" -> R).
 */
function bulk_students_section_code($section) {
    $s = preg_replace('/[^a-z0-9]/', '', strtolower(trim((string)$section)));
    if ($s === '') return '';
    $map = array(
        'red' => 'R', 'green' => 'G', 'blue' => 'B', 'yellow' => 'Y', 'pink' => 'P',
        'white' => 'W', 'black' => 'K', 'orange' => 'O', 'purple' => 'U', 'maroon' => 'M',
        'grey' => 'E', 'gray' => 'E', 'silver' => 'S', 'gold' => 'D',
    );
    if (isset($map[$s])) return $map[$s];
    if (strlen($s) <= 3) return strtoupper($s);
    return strtoupper(substr($s, 0, 1));
}

/** Whether a word looks like a section rather than part of the class name. */
function bulk_students_is_section_word($word) {
    $w = strtolower(preg_replace('/[^a-z0-9]/i', '', (string)$word));
    if ($w === '') return false;
    if (strlen($w) === 1) return ctype_alpha($w);
    return in_array($w, ['red', 'green', 'blue', 'yellow', 'pink', 'white', 'black', 'orange', 'purple', 'maroon', 'grey', 'gray', 'silver', 'gold'], true);
}

/**
 * Final class key from a class cell and an optional section cell:
 *   ("5", "Red") -> 5R   ("5R", "") -> 5R   ("5 Red", "") -> 5R   ("6", "A") -> 6A
 */
function bulk_students_class_key($class, $section) {
    $class = trim(preg_replace('/\s+/', ' ', (string)$class));
    $section = trim((string)$section);
    if ($class === '') return '';

    // Only fold the section into the class key when it is a genuine section
    // label (single letter or a known colour). Digits and other free-text
    // values are NOT sections: keep the class name exactly as written in the
    // Excel file instead of producing garbage like "Three3".
    $validSection = ($section !== '' && bulk_students_is_section_word($section));

    // The class cell may already carry the section: "5 Red" / "5 R".
    if ($section === '' && strpos($class, ' ') !== false) {
        $parts = explode(' ', $class);
        $last = array_pop($parts);
        if (bulk_students_is_section_word($last)) {
            $class = implode(' ', $parts);
            $section = $last;
            $validSection = true;
        }
    }

    if ($validSection) {
        // Fold letter/colour sections: "5" + "Red" -> "5R".
        $class = preg_replace('/\s*-\s*/', '', $class);          // "5 - R" -> 5R
        $class = rtrim($class, " -_/,.\t\n\r");
        $code = bulk_students_section_code($section);
        if ($code === '') {
            return preg_replace('/\s+/', ' ', trim($class));
        }
        $tail = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', substr($class, -strlen($code))));
        if ($tail === $code) return preg_replace('/\s+/', ' ', trim($class));
        return preg_replace('/\s+/', ' ', trim($class)) . $code;
    }

    // No valid section to fold: keep the exact class name from the Excel file.
    // Append a non-section value (e.g. a digit) with a space if it is not
    // already part of the class name.
    if ($section !== '' && stripos($class, $section) === false) {
        return preg_replace('/\s+/', ' ', trim($class)) . ' ' . $section;
    }
    return preg_replace('/\s+/', ' ', trim($class));
}

function bulk_students_norm_header($v) {
    $v = strtolower(trim((string)$v));
    $v = preg_replace('/[^a-z0-9]+/', '_', $v);
    $v = trim($v, '_');
    $map = [
        'name' => 'name', 'student' => 'name', 'student_name' => 'name',
        'reg_number' => 'reg_number', 'reg_no' => 'reg_number', 'regno' => 'reg_number',
        'registration_number' => 'reg_number', 'roll' => 'reg_number', 'rollno' => 'reg_number',
        'roll_no' => 'reg_number', 'roll_number' => 'reg_number',
        'class' => 'class', 'grade' => 'class',
        'section' => 'section', 'sec' => 'section',
        'whatsapp_number' => 'whatsapp', 'whatsapp' => 'whatsapp', 'whatsapp_no' => 'whatsapp',
        'phone' => 'whatsapp', 'mobile' => 'whatsapp', 'number' => 'whatsapp', 'contact' => 'whatsapp',
    ];
    return isset($map[$v]) ? $map[$v] : $v;
}

function bulk_students_column_index($header) {
    $idx = ['name' => -1, 'reg' => -1, 'class' => -1, 'section' => -1, 'whatsapp' => -1];
    foreach ($header as $i => $h) {
        if ($h === 'name' && $idx['name'] < 0) $idx['name'] = $i;
        elseif (($h === 'reg_number') && $idx['reg'] < 0) $idx['reg'] = $i;
        elseif ($h === 'class' && $idx['class'] < 0) $idx['class'] = $i;
        elseif ($h === 'section' && $idx['section'] < 0) $idx['section'] = $i;
        elseif ($h === 'whatsapp' && $idx['whatsapp'] < 0) $idx['whatsapp'] = $i;
    }
    return $idx;
}

function bulk_students_cell($line, $i) {
    if ($i < 0 || !isset($line[$i])) return '';
    return trim((string)$line[$i]);
}

function bulk_students_row_empty($line) {
    foreach ($line as $c) if (trim((string)$c) !== '') return false;
    return true;
}

function bulk_students_col_letter_to_index($letters) {
    $letters = strtoupper($letters);
    $n = 0;
    for ($i = 0; $i < strlen($letters); $i++) {
        $n = $n * 26 + (ord($letters[$i]) - 64);
    }
    return $n - 1;
}
