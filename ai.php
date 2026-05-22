<?php
/**
 * Server-side proxy for the AI task assistant.
 * Keeps the NVIDIA API key on the server (never sent to the browser) and
 * avoids browser CORS issues. The key lives in ai-config.php (gitignored),
 * which must be created on the server only.
 */

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// Only allow POST.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Load the API key.
$configFile = __DIR__ . '/ai-config.php';
if (file_exists($configFile)) {
    require $configFile;
}
if (empty($NVIDIA_API_KEY)) {
    http_response_code(500);
    echo json_encode(['error' => 'AI is not configured on the server (missing ai-config.php).']);
    exit;
}

// Read and validate the request body.
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data) || empty($data['messages']) || !is_array($data['messages'])) {
    http_response_code(400);
    echo json_encode(['error' => 'A "messages" array is required.']);
    exit;
}

// Build the upstream request.
$payload = json_encode([
    'model'       => 'meta/llama-3.3-70b-instruct',
    'messages'    => $data['messages'],
    'temperature' => 0.3,
    'top_p'       => 0.9,
    'max_tokens'  => 1024,
]);

$ch = curl_init('https://integrate.api.nvidia.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $NVIDIA_API_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
    ],
    CURLOPT_TIMEOUT        => 60,
]);

$response = curl_exec($ch);
if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed: ' . curl_error($ch)]);
    curl_close($ch);
    exit;
}
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($status ?: 200);
echo $response;
