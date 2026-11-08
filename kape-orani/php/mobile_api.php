<?php
/**
 * KapeOrani — Mobile API bridge (Expo / React Native)
 * Ilagay sa same folder ng auth.php, search.php, db.php (htdocs/KapeOrani/)
 *
 * - CORS enabled
 * - Token-based auth (walang PHP session cookie — para sa mobile)
 * - Public: login, register, forgot, cafes, reviews, promos, claim
 * - Authenticated: reservation, chat, me
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
date_default_timezone_set('Asia/Manila');
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Mobile-Token, X-User-Id');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function inp(): array {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $d = json_decode(file_get_contents('php://input'), true);
        return is_array($d) ? $d : [];
    }
    return array_merge($_GET, $_POST);
}

function ensureMobileTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mobile_tokens (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        token VARCHAR(64) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_user (user_id),
        INDEX idx_token (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cafe_reservation_settings (
        cafe_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        capacity_per_slot SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        reservations_paused TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cafe_reservations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        cafe_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        customer_name VARCHAR(120) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        reservation_date DATE NOT NULL,
        reservation_time TIME NOT NULL,
        guest_count SMALLINT UNSIGNED NOT NULL,
        note VARCHAR(500) NOT NULL DEFAULT '',
        status ENUM('pending','confirmed','declined') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cafe_slot_status (cafe_id, reservation_date, reservation_time, status),
        INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cafe_messages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        user_id INT NOT NULL,
        user_name VARCHAR(120) NOT NULL DEFAULT '',
        sender_type ENUM('user','owner') NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        deleted_for_user TINYINT(1) NOT NULL DEFAULT 0,
        deleted_for_owner TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cafe_user (cafe_id, user_id),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try { $pdo->exec("ALTER TABLE cafe_messages ADD COLUMN deleted_for_user TINYINT(1) NOT NULL DEFAULT 0"); } catch (Throwable $e) {}
    try { $pdo->exec("ALTER TABLE cafe_messages ADD COLUMN deleted_for_owner TINYINT(1) NOT NULL DEFAULT 0"); } catch (Throwable $e) {}

    // Upgrade existing INT columns to BIGINT without dropping data
    try {
        $pdo->exec("ALTER TABLE cafe_reservation_settings MODIFY cafe_id BIGINT UNSIGNED NOT NULL");
        $pdo->exec("ALTER TABLE cafe_reservations
            MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            MODIFY cafe_id BIGINT UNSIGNED NOT NULL,
            MODIFY user_id BIGINT UNSIGNED NOT NULL");
        $pdo->exec("ALTER TABLE cafe_reservation_notification_reads
            MODIFY reservation_id BIGINT UNSIGNED NOT NULL,
            MODIFY user_id BIGINT UNSIGNED NOT NULL");
    } catch (Throwable $e) {
        error_log('KapeOrani mobile BIGINT migrate: ' . $e->getMessage());
    }
}


function issueToken(PDO $pdo, int $userId): string {
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + 60 * 60 * 24 * 30); // 30 days
    $pdo->prepare('DELETE FROM mobile_tokens WHERE user_id = ? OR expires_at < NOW()')->execute([$userId]);
    $pdo->prepare('INSERT INTO mobile_tokens (user_id, token, expires_at) VALUES (?,?,?)')
        ->execute([$userId, $token, $expires]);
    return $token;
}

function authUser(PDO $pdo): ?array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $token = '';
    foreach ($headers as $k => $v) {
        if (strcasecmp($k, 'X-Mobile-Token') === 0 || strcasecmp($k, 'Authorization') === 0) {
            $token = $v;
            break;
        }
    }
    // Shared hosting (CGI/FastCGI): walang getallheaders() o tinatanggal ang headers.
    if ($token === '') {
        $token = $_SERVER['HTTP_X_MOBILE_TOKEN']
            ?? $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';
    }
    if (stripos($token, 'Bearer ') === 0) {
        $token = trim(substr($token, 7));
    }
    $token = trim($token);
    if ($token === '') {
        $in = inp();
        $token = trim((string)($in['token'] ?? ''));
    }
    if ($token === '') return null;

    $st = $pdo->prepare('SELECT t.user_id, u.id, u.fullname, u.username, u.phone
        FROM mobile_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ? AND t.expires_at > NOW() LIMIT 1');
    $st->execute([$token]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

$pdo = getDB();
if (!$pdo) {
    out(['success' => false, 'message' => 'Database hindi available.'], 500);
}
ensureMobileTables($pdo);

$in = inp();
$action = (string)($in['action'] ?? $_GET['action'] ?? '');


// ---------- SITE STATUS (maintenance mode from site_settings.json) ----------
// Always available so mobile app can lock when admin enables maintenance on web.
if ($action === 'site_status' || $action === 'status') {
    $maint = false;
    $settingsPath = __DIR__ . '/site_settings.php';
    if (is_file($settingsPath)) {
        require_once $settingsPath;
        if (function_exists('isMaintenanceMode')) {
            $maint = isMaintenanceMode();
        } elseif (function_exists('getSiteSettings')) {
            $s = getSiteSettings();
            $maint = !empty($s['maintenance_mode']);
        }
    } else {
        // Fallback: read JSON beside this API if helpers not present
        $jsonPath = __DIR__ . '/site_settings.json';
        if (is_file($jsonPath)) {
            $raw = @file_get_contents($jsonPath);
            $data = json_decode((string)$raw, true);
            if (is_array($data)) $maint = !empty($data['maintenance_mode']);
        }
    }
    out([
        'success' => true,
        'maintenance_mode' => (bool)$maint,
        'message' => $maint
            ? 'Maintenance Mode ON. Naka-lock ang app at website.'
            : 'Site is open.',
    ]);
}



// When maintenance is ON, lock public mobile API (same as web index.php for visitors)
$__maintOn = false;
$__settingsPath = __DIR__ . '/site_settings.php';
if (is_file($__settingsPath)) {
    require_once $__settingsPath;
    if (function_exists('isMaintenanceMode')) {
        $__maintOn = isMaintenanceMode();
    }
} else {
    $__jsonPath = __DIR__ . '/site_settings.json';
    if (is_file($__jsonPath)) {
        $__raw = @file_get_contents($__jsonPath);
        $__data = json_decode((string)$__raw, true);
        if (is_array($__data)) $__maintOn = !empty($__data['maintenance_mode']);
    }
}
if ($__maintOn) {
    out([
        'success' => false,
        'maintenance_mode' => true,
        'message' => 'Maintenance Mode ON. Naka-lock muna ang KapeOrani app. Bumalik agad kami.',
    ], 503);
}


// ============================================================
// AUTH
// ============================================================
if ($action === 'register') {
    $fullname = trim($in['fullname'] ?? '');
    $phone = trim($in['phone'] ?? '');
    $username = trim($in['username'] ?? '');
    $password = $in['password'] ?? '';
    $securityQ = trim($in['security_q'] ?? '');
    $securityA = trim($in['security_a'] ?? '');

    if ($fullname === '' || $phone === '' || $username === '' || $password === '' || $securityQ === '' || $securityA === '') {
        out(['success' => false, 'message' => 'Lahat ng fields ay required.'], 400);
    }
    if (!preg_match('/^09\d{9}$/', $phone)) {
        out(['success' => false, 'message' => 'Phone number dapat 11 digits at nagsisimula sa 09.'], 400);
    }
    if (strlen($username) < 3) out(['success' => false, 'message' => 'Username minimum 3 characters.'], 400);
    if (strlen($password) < 6) out(['success' => false, 'message' => 'Password minimum 6 characters.'], 400);

    $st = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    if ($st->fetch()) out(['success' => false, 'message' => 'Username na ginagamit na.'], 409);
    $st = $pdo->prepare('SELECT id FROM users WHERE phone = ? LIMIT 1');
    $st->execute([$phone]);
    if ($st->fetch()) out(['success' => false, 'message' => 'Phone number na ginagamit na.'], 409);

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $pdo->prepare('INSERT INTO users (fullname, phone, username, password_hash, security_q, security_a) VALUES (?,?,?,?,?,?)')
        ->execute([$fullname, $phone, $username, $hash, $securityQ, mb_strtolower($securityA)]);
    $uid = (int)$pdo->lastInsertId();
    $token = issueToken($pdo, $uid);

    out([
        'success' => true,
        'message' => 'Matagumpay ang registration!',
        'token' => $token,
        'user' => ['id' => $uid, 'fullname' => $fullname, 'username' => $username, 'phone' => $phone, 'type' => 'user'],
    ]);
}

if ($action === 'login') {
    $username = $in['username'] ?? '';
    $password = $in['password'] ?? '';
    if ($username === '' || $password === '') {
        out(['success' => false, 'message' => 'Username at password required.'], 400);
    }
    $st = $pdo->prepare('SELECT id, fullname, username, phone, password_hash FROM users WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    $user = $st->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        out(['success' => false, 'message' => 'Maling username o password. Case-sensitive ang username.'], 401);
    }
    $token = issueToken($pdo, (int)$user['id']);
    out([
        'success' => true,
        'message' => 'Welcome, ' . $user['fullname'] . '!',
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'fullname' => $user['fullname'],
            'username' => $user['username'],
            'phone' => $user['phone'] ?? '',
            'type' => 'user',
        ],
    ]);
}

if ($action === 'forgot') {
    $username = $in['username'] ?? '';
    $securityQ = trim($in['security_q'] ?? '');
    $securityA = trim($in['security_a'] ?? '');
    $newPass = $in['password'] ?? '';
    if ($username === '' || $securityQ === '' || $securityA === '' || $newPass === '') {
        out(['success' => false, 'message' => 'Lahat ng fields required.'], 400);
    }
    if (strlen($newPass) < 6) out(['success' => false, 'message' => 'Password minimum 6 characters.'], 400);
    $st = $pdo->prepare('SELECT id, security_q, security_a FROM users WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    $user = $st->fetch(PDO::FETCH_ASSOC);
    if (!$user) out(['success' => false, 'message' => 'Hindi nahanap ang username.'], 404);
    if ($user['security_q'] !== $securityQ || mb_strtolower($user['security_a']) !== mb_strtolower($securityA)) {
        out(['success' => false, 'message' => 'Maling security question o sagot.'], 401);
    }
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($newPass, PASSWORD_DEFAULT), $user['id']]);
    out(['success' => true, 'message' => 'Na-reset ang password!']);
}

if ($action === 'logout') {
    $user = authUser($pdo);
    if ($user) {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $token = '';
        foreach ($headers as $k => $v) {
            if (strcasecmp($k, 'X-Mobile-Token') === 0) { $token = trim($v); break; }
        }
        if ($token === '') $token = trim((string)($in['token'] ?? ''));
        if ($token !== '') {
            $pdo->prepare('DELETE FROM mobile_tokens WHERE token = ?')->execute([$token]);
        }
    }
    out(['success' => true, 'message' => 'Naka-log out ka na.']);
}

if ($action === 'me') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Hindi naka-login.'], 401);
    out([
        'success' => true,
        'user' => [
            'id' => (int)$user['id'],
            'fullname' => $user['fullname'],
            'username' => $user['username'],
            'phone' => $user['phone'] ?? '',
            'type' => 'user',
        ],
    ]);
}

// ============================================================
// CAFES — proxy to same logic as search.php (inline minimal)
// ============================================================
if ($action === 'cafes' || $action === 'search') {
    // Prefer redirecting client to search.php; still support here
    $q = trim((string)($in['q'] ?? $_GET['q'] ?? ''));
    $limit = max(1, min(200, (int)($in['limit'] ?? $_GET['limit'] ?? 100)));
    $lat = isset($in['lat']) ? (float)$in['lat'] : (isset($_GET['lat']) ? (float)$_GET['lat'] : null);
    $lng = isset($in['lng']) ? (float)$in['lng'] : (isset($_GET['lng']) ? (float)$_GET['lng'] : null);
    $barangay = trim((string)($in['barangay'] ?? $_GET['barangay'] ?? ''));
    $category = trim((string)($in['category'] ?? $_GET['category'] ?? ''));

    $cols = [];
    foreach ($pdo->query('SHOW COLUMNS FROM cafes')->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $cols[$c['Field']] = true;
    }
    $latCol = isset($cols['lat']) ? 'c.lat' : (isset($cols['latitude']) ? 'c.latitude' : null);
    $lngCol = isset($cols['lng']) ? 'c.lng' : (isset($cols['longitude']) ? 'c.longitude' : null);

    $select = ['c.*'];
    if ($lat !== null && $lng !== null && $latCol && $lngCol) {
        $select[] = "(6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians({$lat})) * cos(radians({$latCol})) * cos(radians({$lngCol}) - radians({$lng}))
            + sin(radians({$lat})) * sin(radians({$latCol}))
        )))) AS distance_km";
    }
    $sql = 'SELECT ' . implode(', ', $select) . ' FROM cafes c';
    $where = [];
    $params = [];
    if (isset($cols['status'])) {
        $where[] = "(c.status IS NULL OR c.status = '' OR (c.status NOT LIKE '%Inactive%' AND c.status NOT LIKE '%Pending%'))";
    }
    if ($q !== '') {
        $like = '%' . $q . '%';
        $parts = ['c.name LIKE ?'];
        $params[] = $like;
        if (isset($cols['barangay'])) { $parts[] = 'c.barangay LIKE ?'; $params[] = $like; }
        if (isset($cols['address'])) { $parts[] = 'c.address LIKE ?'; $params[] = $like; }
        $where[] = '(' . implode(' OR ', $parts) . ')';
    }
    if ($barangay !== '' && isset($cols['barangay'])) {
        $where[] = 'c.barangay LIKE ?';
        $params[] = '%' . $barangay . '%';
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    if ($lat !== null && $lng !== null && $latCol) {
        $sql .= ' ORDER BY distance_km ASC';
    } else {
        $sql .= ' ORDER BY c.name ASC';
    }
    $sql .= ' LIMIT ' . (int)$limit;

    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        out(['success' => false, 'message' => $e->getMessage(), 'data' => []], 500);
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($dir === '/' || $dir === '\\') $dir = '';
    $base = $scheme . '://' . $host . $dir;

    $outRows = [];
    foreach ($rows as $r) {
        $id = (int)($r['id'] ?? 0);
        $image = $r['image'] ?? null;
        if ($image && !preg_match('~^https?://~i', $image)) {
            $image = $base . '/' . ltrim($image, '/');
        }
        $latVal = isset($r['lat']) ? (float)$r['lat'] : (isset($r['latitude']) ? (float)$r['latitude'] : null);
        $lngVal = isset($r['lng']) ? (float)$r['lng'] : (isset($r['longitude']) ? (float)$r['longitude'] : null);
        $specialties = [];
        $categories = [];
        $amenities = [];
        $highlights = [];
        try {
            $s = $pdo->prepare('SELECT name FROM cafe_specialties WHERE cafe_id = ?');
            $s->execute([$id]);
            $specialties = array_column($s->fetchAll(), 'name');
        } catch (Throwable $e) {}
        try {
            $c = $pdo->prepare('SELECT category FROM cafe_categories WHERE cafe_id = ?');
            $c->execute([$id]);
            $categories = array_column($c->fetchAll(), 'category');
        } catch (Throwable $e) {}
        // Amenities / highlights tables used by web admin (optional — skip if missing)
        try {
            $a = $pdo->prepare('SELECT name FROM cafe_amenities WHERE cafe_id = ?');
            $a->execute([$id]);
            $amenities = array_column($a->fetchAll(), 'name');
        } catch (Throwable $e) {
            try {
                $a = $pdo->prepare('SELECT amenity FROM cafe_amenities WHERE cafe_id = ?');
                $a->execute([$id]);
                $amenities = array_column($a->fetchAll(), 'amenity');
            } catch (Throwable $e2) {}
        }
        try {
            $h = $pdo->prepare('SELECT name FROM cafe_highlights WHERE cafe_id = ?');
            $h->execute([$id]);
            $highlights = array_column($h->fetchAll(), 'name');
        } catch (Throwable $e) {
            try {
                $h = $pdo->prepare('SELECT highlight FROM cafe_highlights WHERE cafe_id = ?');
                $h->execute([$id]);
                $highlights = array_column($h->fetchAll(), 'highlight');
            } catch (Throwable $e2) {}
        }
        // Column-based amenities / highlights on cafes row (comma or JSON)
        foreach (['amenities', 'amenity', 'highlights', 'highlight', 'tags', 'features'] as $colKey) {
            if (empty($r[$colKey]) || !is_string($r[$colKey])) continue;
            $raw = trim($r[$colKey]);
            if ($raw === '') continue;
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                foreach ($decoded as $v) {
                    if (is_string($v) && trim($v) !== '') $amenities[] = trim($v);
                }
            } else {
                foreach (preg_split('/[,|;]+/', $raw) as $v) {
                    $v = trim($v);
                    if ($v !== '') $amenities[] = $v;
                }
            }
        }
        // Merge unique list for mobile cards (same labels as web)
        $mergedAmenities = [];
        foreach (array_merge($specialties, $amenities, $highlights, $categories) as $label) {
            $label = trim((string)$label);
            if ($label === '') continue;
            $key = mb_strtolower($label);
            if (!isset($mergedAmenities[$key])) $mergedAmenities[$key] = $label;
        }
        $amenitiesList = array_values($mergedAmenities);

        $item = [
            'id' => $id,
            'name' => $r['name'] ?? '',
            'barangay' => $r['barangay'] ?? '',
            'address' => $r['address'] ?? '',
            'description' => $r['description'] ?? '',
            'rating' => isset($r['rating']) ? (float)$r['rating'] : 0,
            'image' => $image,
            'photo' => $image,
            'lat' => $latVal,
            'lng' => $lngVal,
            'hours' => $r['hours'] ?? $r['operating_hours'] ?? '',
            'contact' => $r['contact'] ?? $r['phone'] ?? '',
            'status' => $r['status'] ?? '',
            'categories' => $categories,
            'specialties' => $specialties,
            'amenities' => $amenitiesList,
            'highlights' => array_values(array_unique(array_filter(array_map('trim', $highlights)))),
            'is_featured' => !empty($r['is_featured']) || !empty($r['featured']) || (isset($r['is_top']) && $r['is_top']) ? 1 : 0,
        ];
        if (isset($r['distance_km'])) {
            $item['distance_km'] = round((float)$r['distance_km'], 2);
        }
        if ($latVal !== null && $lngVal !== null) {
            $item['gmaps_url'] = 'https://maps.google.com/?q=' . $latVal . ',' . $lngVal;
            $item['waze_url'] = 'https://waze.com/ul?ll=' . $latVal . ',' . $lngVal . '&navigate=yes';
        }
        // Optional menu
        try {
            $m = $pdo->prepare('SELECT id, item_name, category, description, price, image_path, is_available
                FROM cafe_menu_items WHERE cafe_id = ? AND is_available = 1 ORDER BY sort_order, id LIMIT 50');
            $m->execute([$id]);
            $menu = $m->fetchAll(PDO::FETCH_ASSOC);
            foreach ($menu as &$mi) {
                if (!empty($mi['image_path']) && !preg_match('~^https?://~i', $mi['image_path'])) {
                    $mi['image_path'] = $base . '/' . ltrim($mi['image_path'], '/');
                }
            }
            $item['menu'] = $menu;
        } catch (Throwable $e) {
            $item['menu'] = [];
        }
        $outRows[] = $item;
    }
    out(['success' => true, 'data' => $outRows, 'meta' => ['total' => count($outRows)]]);
}

// ============================================================
// REVIEWS & PROMOS & CLAIM (public)
// ============================================================
if ($action === 'reviews_public') {
    try {
        $st = $pdo->prepare("SELECT r.id, r.reviewer_name, r.comment, r.rating, r.created_at,
            COALESCE(r.location,'') AS location, r.cafe_id, c.name AS cafe_name
            FROM reviews r JOIN cafes c ON c.id = r.cafe_id
            WHERE LOWER(TRIM(r.status)) IN ('approved','pending') ORDER BY r.created_at DESC LIMIT 100");
        $st->execute();
        out(['success' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        out(['success' => true, 'data' => []]);
    }
}

if ($action === 'review_submit') {
    $name = trim((string)($in['reviewer_name'] ?? $in['name'] ?? ''));
    $comment = trim((string)($in['comment'] ?? ''));
    $rating = (int)($in['rating'] ?? 5);
    $cafeId = (int)($in['cafe_id'] ?? 0);
    $location = trim((string)($in['location'] ?? ''));
    $auth = authUser($pdo);
    $userId = $auth ? (int)$auth['id'] : (isset($in['user_id']) ? (int)$in['user_id'] : null);
    if ($name === '' || $comment === '' || $cafeId < 1) {
        out(['success' => false, 'message' => 'Pangalan, komento, at cafe required.'], 400);
    }
    if ($rating < 1 || $rating > 5) $rating = 5;
    $chk = $pdo->prepare('SELECT id FROM cafes WHERE id = ? LIMIT 1');
    $chk->execute([$cafeId]);
    if (!$chk->fetch()) out(['success' => false, 'message' => 'Invalid cafe.'], 400);
    try {
        if ($userId) {
            $pdo->prepare('INSERT INTO reviews (reviewer_name, comment, rating, status, cafe_id, user_id, location) VALUES (?,?,?,?,?,?,?)')
                ->execute([$name, $comment, $rating, 'Pending', $cafeId, $userId, $location]);
        } else {
            $pdo->prepare('INSERT INTO reviews (reviewer_name, comment, rating, status, cafe_id, location) VALUES (?,?,?,?,?,?)')
                ->execute([$name, $comment, $rating, 'Pending', $cafeId, $location]);
        }
    } catch (Throwable $e) {
        out(['success' => false, 'message' => 'Hindi na-save: ' . $e->getMessage()], 500);
    }
    out(['success' => true, 'message' => 'Review submitted. Pending admin approval.']);
}

if ($action === 'my_reviews') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    try {
        $st = $pdo->prepare("SELECT r.id, r.reviewer_name, r.comment, r.rating, r.status, r.created_at,
            r.cafe_id, COALESCE(c.name, CONCAT('Cafe #', r.cafe_id)) AS cafe_name, COALESCE(r.location,'') AS location
            FROM reviews r LEFT JOIN cafes c ON c.id = r.cafe_id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC, r.id DESC LIMIT 100");
        $st->execute([(int)$user['id']]);
        out(['success' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        out(['success' => true, 'data' => []]);
    }
}

if ($action === 'promos_public') {
    try {
        $st = $pdo->query("SELECT p.*, c.name AS cafe_name, c.barangay
            FROM promotions p LEFT JOIN cafes c ON c.id = p.cafe_id
            WHERE p.is_active = 1
            AND (p.start_date IS NULL OR p.start_date <= CURDATE())
            AND (p.end_date IS NULL OR p.end_date >= CURDATE())
            ORDER BY p.id DESC LIMIT 20");
        out(['success' => true, 'data' => $st ? $st->fetchAll(PDO::FETCH_ASSOC) : []]);
    } catch (Throwable $e) {
        out(['success' => true, 'data' => []]);
    }
}

if ($action === 'claim_submit') {
    $claimant = trim((string)($in['claimant_name'] ?? $in['name'] ?? ''));
    $contact = trim((string)($in['contact'] ?? ''));
    $cafeId = (int)($in['cafe_id'] ?? 0);
    $message = trim((string)($in['message'] ?? $in['proof'] ?? ''));
    if ($claimant === '' || $contact === '' || $cafeId < 1) {
        out(['success' => false, 'message' => 'Name, contact, at cafe required.'], 400);
    }
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS cafe_claims (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            cafe_id INT UNSIGNED NOT NULL,
            claimant_name VARCHAR(120) NOT NULL,
            contact VARCHAR(120) NOT NULL,
            message TEXT NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->prepare('INSERT INTO cafe_claims (cafe_id, claimant_name, contact, message, status) VALUES (?,?,?,?,?)')
            ->execute([$cafeId, $claimant, $contact, $message, 'Pending']);
        out(['success' => true, 'message' => 'Naipadala ang claim request.']);
    } catch (Throwable $e) {
        out(['success' => false, 'message' => $e->getMessage()], 500);
    }
}

// ============================================================
// RESERVATION (token auth)
// ============================================================
if ($action === 'reservation_settings') {
    $cafeId = (int)($in['cafe_id'] ?? $_GET['cafe_id'] ?? 0);
    if ($cafeId < 1) out(['success' => false, 'message' => 'cafe_id required.'], 400);
    $st = $pdo->prepare('SELECT capacity_per_slot, reservations_paused, updated_at FROM cafe_reservation_settings WHERE cafe_id = ? LIMIT 1');
    $st->execute([$cafeId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        out([
            'success' => true,
            'configured' => false,
            'capacity_per_slot' => 0,
            'reservations_paused' => 1,
            'message' => 'Wala pang naka-set na reservation ang owner.',
        ]);
    }
    $capacity = (int)$row['capacity_per_slot'];
    $paused = (int)$row['reservations_paused'] === 1;
    // Pareho sa owner_dashboard: capacity > 0 at hindi paused
    $configured = ($capacity > 0 && !$paused);
    out([
        'success' => true,
        'configured' => $configured,
        'capacity_per_slot' => $capacity,
        'reservations_paused' => $paused ? 1 : 0,
        'updated_at' => $row['updated_at'],
        'message' => $configured
            ? 'Available for reservation.'
            : 'Wala pang naka-reserve. Sa owner dashboard, ilagay ang capacity (higit sa 0) at i-off ang pause.',
    ]);
}

if ($action === 'reservation_submit') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);

    $cafeId = (int)($in['cafe_id'] ?? 0);
    $date = trim((string)($in['date'] ?? $in['reservation_date'] ?? ''));
    $time = trim((string)($in['time'] ?? $in['reservation_time'] ?? ''));
    $guestCount = (int)($in['guest_count'] ?? 0);
    $name = trim((string)($in['customer_name'] ?? $user['fullname'] ?? ''));
    $phone = trim((string)($in['customer_phone'] ?? $user['phone'] ?? ''));
    $note = trim((string)($in['note'] ?? ''));

    if ($cafeId < 1 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}/', $time)) {
        out(['success' => false, 'message' => 'Valid cafe, date (YYYY-MM-DD), at time required.'], 400);
    }
    if (strlen($time) === 5) $time .= ':00';
    if ($guestCount < 1 || $guestCount > 20) out(['success' => false, 'message' => 'Guests: 1–20.'], 400);
    if (!preg_match('/^09\d{9}$/', $phone)) out(['success' => false, 'message' => 'Phone dapat 09XXXXXXXXX.'], 400);

    $slotTs = strtotime($date . ' ' . $time);
    if ($slotTs === false || $slotTs <= time()) {
        out(['success' => false, 'message' => 'Dapat future date at time lang ang pwedeng i-reserve.'], 400);
    }

    $chk = $pdo->prepare('SELECT id FROM cafes WHERE id = ? LIMIT 1');
    $chk->execute([$cafeId]);
    if (!$chk->fetch()) out(['success' => false, 'message' => 'Hindi nahanap ang coffee shop.'], 404);

    $setSt = $pdo->prepare('SELECT capacity_per_slot, reservations_paused FROM cafe_reservation_settings WHERE cafe_id = ? LIMIT 1');
    $setSt->execute([$cafeId]);
    $setRow = $setSt->fetch(PDO::FETCH_ASSOC);
    if (!$setRow) {
        out(['success' => false, 'message' => 'Wala pang naka-reserve ang owner ng coffee shop na ito.'], 400);
    }
    if ((int)$setRow['reservations_paused'] === 1) {
        out(['success' => false, 'message' => 'Naka-pause ang reservations ng coffee shop na ito.'], 400);
    }
    if ((int)$setRow['capacity_per_slot'] < 1) {
        out(['success' => false, 'message' => 'Hindi pa binuksan ang reservation (capacity dapat higit sa 0 sa owner dashboard).'], 400);
    }

    $pdo->prepare('INSERT INTO cafe_reservations
        (cafe_id, user_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, note, status)
        VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$cafeId, (int)$user['id'], $name, $phone, $date, $time, $guestCount, $note, 'pending']);

    out(['success' => true, 'message' => 'Naipadala ang reservation (pending).', 'id' => (int)$pdo->lastInsertId()]);
}

if ($action === 'my_reservations') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $st = $pdo->prepare("SELECT r.*, c.name AS cafe_name, c.barangay
        FROM cafe_reservations r LEFT JOIN cafes c ON c.id = r.cafe_id
        WHERE r.user_id = ? ORDER BY r.reservation_date DESC, r.id DESC LIMIT 50");
    $st->execute([(int)$user['id']]);
    out(['success' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
}

// ============================================================
// CHAT (token auth)
// ============================================================
if ($action === 'chat_threads') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $st = $pdo->prepare("SELECT m.cafe_id,
            COALESCE(c.name, CONCAT('Cafe #', m.cafe_id)) AS cafe_name,
            COALESCE(c.barangay, '') AS barangay,
            MAX(m.id) AS last_id,
            SUBSTRING_INDEX(GROUP_CONCAT(m.message ORDER BY m.id DESC SEPARATOR '\n'), '\n', 1) AS last_message,
            MAX(m.created_at) AS last_at,
            SUM(CASE WHEN m.sender_type = 'owner' AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread
        FROM cafe_messages m
        LEFT JOIN cafes c ON c.id = m.cafe_id
        WHERE m.user_id = ? AND m.deleted_for_user = 0
        GROUP BY m.cafe_id, c.name, c.barangay
        ORDER BY last_at DESC LIMIT 100");
    $st->execute([(int)$user['id']]);
    $threads = $st->fetchAll(PDO::FETCH_ASSOC);
    $unread = 0;
    foreach ($threads as $t) $unread += (int)$t['unread'];
    out(['success' => true, 'data' => $threads, 'unread' => $unread]);
}

if ($action === 'chat_messages') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $cafeId = (int)($in['cafe_id'] ?? $_GET['cafe_id'] ?? 0);
    if ($cafeId < 1) out(['success' => false, 'message' => 'cafe_id required.'], 400);
    $st = $pdo->prepare('SELECT id, cafe_id, user_id, user_name, sender_type, message, is_read, created_at
        FROM cafe_messages WHERE cafe_id = ? AND user_id = ? AND deleted_for_user = 0 ORDER BY id ASC LIMIT 200');
    $st->execute([$cafeId, (int)$user['id']]);
    $pdo->prepare("UPDATE cafe_messages SET is_read = 1
        WHERE cafe_id = ? AND user_id = ? AND sender_type = 'owner' AND is_read = 0")
        ->execute([$cafeId, (int)$user['id']]);
    out(['success' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($action === 'chat_send') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $cafeId = (int)($in['cafe_id'] ?? 0);
    $message = trim((string)($in['message'] ?? ''));
    if ($cafeId < 1 || $message === '') out(['success' => false, 'message' => 'Cafe at message required.'], 400);
    $pdo->prepare("INSERT INTO cafe_messages (cafe_id, user_id, user_name, sender_type, message)
        VALUES (?,?,?,'user',?)")
        ->execute([$cafeId, (int)$user['id'], $user['fullname'] ?: $user['username'], $message]);
    out(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if ($action === 'chat_delete_thread') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $cafeId = (int)($in['cafe_id'] ?? $_GET['cafe_id'] ?? 0);
    if ($cafeId < 1) out(['success' => false, 'message' => 'cafe_id required.'], 400);
    $st = $pdo->prepare('UPDATE cafe_messages SET deleted_for_user = 1 WHERE cafe_id = ? AND user_id = ? AND deleted_for_user = 0');
    $st->execute([$cafeId, (int)$user['id']]);
    out(['success' => true, 'message' => 'Na-delete ang conversation (app view only).', 'deleted' => $st->rowCount()]);
}

// ============================================================
// PROFILE UPDATE (token auth)
// ============================================================
if ($action === 'profile_update') {
    $user = authUser($pdo);
    if (!$user) out(['success' => false, 'message' => 'Mag-login muna.'], 401);
    $uid = (int)$user['id'];
    $fullname = trim((string)($in['fullname'] ?? ''));
    $phone = trim((string)($in['phone'] ?? ''));
    $curPass = (string)($in['current_password'] ?? '');
    $newPass = (string)($in['new_password'] ?? '');

    if ($fullname === '') out(['success' => false, 'message' => 'Kailangan ang pangalan.'], 400);
    if (!preg_match('/^09\d{9}$/', $phone)) {
        out(['success' => false, 'message' => 'Phone number dapat 11 digits at nagsisimula sa 09.'], 400);
    }
    $st = $pdo->prepare('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1');
    $st->execute([$phone, $uid]);
    if ($st->fetch()) out(['success' => false, 'message' => 'Phone number na ginagamit na ng iba.'], 409);

    $pdo->prepare('UPDATE users SET fullname = ?, phone = ? WHERE id = ?')->execute([$fullname, $phone, $uid]);

    if ($newPass !== '') {
        if (strlen($newPass) < 6) out(['success' => false, 'message' => 'Bagong password minimum 6 characters.'], 400);
        $st = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $st->execute([$uid]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row || !password_verify($curPass, $row['password_hash'])) {
            out(['success' => false, 'message' => 'Mali ang current password.'], 401);
        }
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($newPass, PASSWORD_DEFAULT), $uid]);
    }

    out([
        'success' => true,
        'message' => 'Na-update ang profile!',
        'user' => [
            'id' => $uid,
            'fullname' => $fullname,
            'username' => $user['username'],
            'phone' => $phone,
            'type' => 'user',
        ],
    ]);
}

out(['success' => false, 'message' => 'Unknown action: ' . $action], 400);
