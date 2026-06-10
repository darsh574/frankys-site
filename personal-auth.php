<?php
/**
 * Server-side password gate for the Personal Stuff task manager.
 * The hash lives in ai-config.php (gitignored, server-only) so the
 * password is never present in client JS, HTML or the repo.
 *
 * Setup: on the server, append a line to ai-config.php:
 *     $PERSONAL_PASSWORD_HASH = '$2y$10$...';     // bcrypt hash
 * Generate the hash on the server with:
 *     php -r "echo password_hash('your-password-here', PASSWORD_DEFAULT);"
 */

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$configFile = __DIR__ . '/ai-config.php';
if (file_exists($configFile)) {
    require $configFile;
}
if (empty($PERSONAL_PASSWORD_HASH)) {
    http_response_code(500);
    echo json_encode(['error' => 'Personal lock is not configured on the server (missing $PERSONAL_PASSWORD_HASH in ai-config.php).']);
    exit;
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
$password = is_array($data) && isset($data['password']) ? (string)$data['password'] : '';

// Small artificial delay to slow brute-force attempts.
usleep(350000);

if ($password === '' || !password_verify($password, $PERSONAL_PASSWORD_HASH)) {
    http_response_code(401);
    echo json_encode(['ok' => false]);
    exit;
}

echo json_encode(['ok' => true]);
