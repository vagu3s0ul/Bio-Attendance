<?php
// notifications module for api.php (drop into the site's api.php routing)
// Table:
// CREATE TABLE notifications (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   title VARCHAR(255) NOT NULL,
//   body TEXT NOT NULL,
//   image VARCHAR(500) DEFAULT NULL,
//   link VARCHAR(500) DEFAULT NULL,
//   attachment VARCHAR(500) DEFAULT NULL,
//   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
// );

// In api.php router, add case 'notifications/list':
//   require __DIR__.'/notifications.php'; handle_notifications_list(); break;
// and case 'notifications/send' (admin only):
//   handle_notifications_send(); break;

function handle_notifications_list() {
    global $pdo, $user;
    // Require an authenticated session; notifications are not public.
    if (!isset($user) || empty($user['id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    $stmt = $pdo->query("SELECT id,title,body,image,link,attachment,created_at FROM notifications ORDER BY id DESC LIMIT 50");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Sanitize text fields on output to prevent stored XSS if rendered in a browser.
    foreach ($rows as &$r) {
        $r['title'] = htmlspecialchars((string)($r['title'] ?? ''), ENT_QUOTES, 'UTF-8');
        $r['body']  = htmlspecialchars((string)($r['body'] ?? ''), ENT_QUOTES, 'UTF-8');
        // Only allow http(s) URLs for link/image/attachment.
        foreach (['image', 'link', 'attachment'] as $f) {
            if (!empty($r[$f]) && !preg_match('#^https?://#i', (string)$r[$f])) {
                $r[$f] = null;
            }
        }
    }
    unset($r);
    header('Content-Type: application/json');
    echo json_encode(['notifications' => $rows]);
}

function handle_notifications_send() {
    global $pdo, $user;
    if ($user['role'] !== 'admin' && $user['role'] !== 'principal') {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $title = trim($input['title'] ?? '');
    $body  = trim($input['body'] ?? '');
    if ($title === '' || $body === '') {
        http_response_code(400);
        echo json_encode(['error' => 'title and body required']);
        return;
    }
    if (mb_strlen($title) > 255 || mb_strlen($body) > 5000) {
        http_response_code(400);
        echo json_encode(['error' => 'title or body too long']);
        return;
    }
    // Only allow http(s) URLs for link/image/attachment.
    $cleanUrl = function ($v) {
        $v = trim((string)($v ?? ''));
        if ($v === '') return null;
        return preg_match('#^https?://#i', $v) ? $v : null;
    };
    $stmt = $pdo->prepare("INSERT INTO notifications (title,body,image,link,attachment) VALUES (?,?,?,?,?)");
    $stmt->execute([
        $title,
        $body,
        $cleanUrl($input['image'] ?? null),
        $cleanUrl($input['link'] ?? null),
        $cleanUrl($input['attachment'] ?? null),
    ]);
    echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
}
