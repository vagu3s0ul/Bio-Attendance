<?php
// notifications-upload.php — admin-only file upload for notification image/attachment.
// Returns JSON: { ok: true, url: "https://.../uploads/notifications/<name>" }
session_start();
require __DIR__ . '/config.php';

// Auth: must be logged in as admin/principal via PHP session.
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Please log in again.']);
    exit;
}
$pdo = (isset($pdo) && $pdo instanceof PDO) ? $pdo : null;
if (!$pdo) {
    // fallback: create pdo from config constants if config.php didn't
    try {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'DB unavailable']);
        exit;
    }
}
$stmt = $pdo->prepare("SELECT role FROM teachers WHERE id = ? AND is_active = 1 LIMIT 1");
$stmt->execute([(int)$_SESSION['user_id']]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row || !in_array($row['role'], ['admin', 'principal'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}
$f = $_FILES['file'];
if ($f['size'] > 5 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large (max 5 MB)']);
    exit;
}

$ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
$allowed = ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx','txt','zip'];
if (!in_array($ext, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'File type not allowed']);
    exit;
}

$dir = __DIR__ . '/uploads/notifications';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}
$name = bin2hex(random_bytes(8)) . '.' . $ext;
$dest = $dir . '/' . $name;
if (!move_uploaded_file($f['tmp_name'], $dest)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save file']);
    exit;
}

$base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
// strip trailing script name to get base path
$script = $_SERVER['SCRIPT_NAME'];
$basePath = rtrim(dirname($script), '/');
$url = $base . $basePath . '/uploads/notifications/' . $name;

header('Content-Type: application/json');
echo json_encode(['ok' => true, 'url' => $url, 'name' => $name]);
exit;