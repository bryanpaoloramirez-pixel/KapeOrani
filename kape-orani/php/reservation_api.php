<?php
/**
 * KapeOrani reservation requests.
 * This is a separate additive API; existing admin/public APIs are unchanged.
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
date_default_timezone_set('Asia/Manila');
ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';

function reservationReply(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function reservationInput(): array {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $decoded = json_decode(file_get_contents('php://input'), true);
        return is_array($decoded) ? $decoded : [];
    }
    return array_merge($_GET, $_POST);
}

function reservationEnsureTables(PDO $pdo): void {
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
        INDEX idx_cafe_status_date (cafe_id, status, reservation_date),
        INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS cafe_reservation_notification_reads (
        reservation_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_read (user_id, read_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
        // Ignore if already BIGINT or table missing
        error_log('KapeOrani reservation BIGINT migrate: ' . $e->getMessage());
    }
}


function reservationTextLength(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function reservationValidSlot(string $date, string $time): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^(?:[01]\d|2[0-3]):00$/', $time)) {
        return false;
    }
    $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);
    if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date || $date < date('Y-m-d')) {
        return false;
    }
    if ($date === date('Y-m-d') && $time <= date('H:00')) {
        return false;
    }
    return true;
}

function reservationOwnerCafeId(): int {
    if (empty($_SESSION['admin_id'])) {
        reservationReply(['success' => false, 'message' => 'Mag-login muna bilang coffee shop owner.'], 401);
    }
    if (strtolower(trim((string)($_SESSION['admin_role'] ?? ''))) !== 'owner') {
        reservationReply(['success' => false, 'message' => 'Owner account lang ang puwedeng mag-manage ng reservations.'], 403);
    }
    $cafeId = (int)($_SESSION['admin_cafe_id'] ?? 0);
    if ($cafeId < 1) {
        reservationReply(['success' => false, 'message' => 'Walang naka-link na coffee shop sa owner account.'], 400);
    }
    return $cafeId;
}

set_exception_handler(function (Throwable $e): void {
    error_log('KapeOrani reservation API error: ' . $e->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['success' => false, 'message' => 'Nagkaroon ng problema sa reservation system.'], JSON_UNESCAPED_UNICODE);
    exit;
});

$pdo = getDB();
if (!$pdo) {
    reservationReply(['success' => false, 'message' => 'Hindi available ang database.'], 500);
}

try {
    reservationEnsureTables($pdo);
} catch (Throwable $e) {
    error_log('KapeOrani reservation schema error: ' . $e->getMessage());
    reservationReply(['success' => false, 'message' => 'Hindi maihanda ang reservation system sa database.'], 500);
}

$input = reservationInput();
$action = (string)($input['action'] ?? $_GET['action'] ?? '');

if ($action === 'availability') {
    $cafeId = (int)($_GET['cafe_id'] ?? $input['cafe_id'] ?? 0);
    $date = trim((string)($_GET['date'] ?? $input['date'] ?? ''));
    $time = trim((string)($_GET['time'] ?? $input['time'] ?? ''));
    if ($cafeId < 1 || !reservationValidSlot($date, $time)) {
        reservationReply(['success' => false, 'message' => 'Pumili ng valid na petsa at buong oras na slot.'], 400);
    }

    $cafeCheck = $pdo->prepare('SELECT id FROM cafes WHERE id = ? LIMIT 1');
    $cafeCheck->execute([$cafeId]);
    if (!$cafeCheck->fetch()) {
        reservationReply(['success' => false, 'message' => 'Hindi nahanap ang coffee shop.'], 404);
    }

    $pdo->prepare('INSERT IGNORE INTO cafe_reservation_settings (cafe_id) VALUES (?)')->execute([$cafeId]);
    $settingQuery = $pdo->prepare('SELECT capacity_per_slot, reservations_paused FROM cafe_reservation_settings WHERE cafe_id = ?');
    $settingQuery->execute([$cafeId]);
    $settings = $settingQuery->fetch() ?: ['capacity_per_slot' => 0, 'reservations_paused' => 0];

    $reservedQuery = $pdo->prepare("SELECT COALESCE(SUM(guest_count), 0)
        FROM cafe_reservations
        WHERE cafe_id = ? AND reservation_date = ? AND reservation_time = ?
          AND status IN ('pending', 'confirmed')");
    $reservedQuery->execute([$cafeId, $date, $time]);
    $reserved = (int)$reservedQuery->fetchColumn();
    $capacity = (int)$settings['capacity_per_slot'];
    $paused = (int)$settings['reservations_paused'] === 1;
    $available = max(0, $capacity - $reserved);

    reservationReply([
        'success' => true,
        'enabled' => $capacity > 0 && !$paused,
        'is_full' => $paused,
        'capacity' => $capacity,
        'reserved' => $reserved,
        'available' => $paused ? 0 : $available,
        'date' => $date,
        'time' => $time
    ]);
}

if ($action === 'submit') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        reservationReply(['success' => false, 'message' => 'POST request ang kailangan.'], 405);
    }
    $userId = (int)($_SESSION['user_id'] ?? 0);
    if ($userId < 1 || ($_SESSION['type'] ?? '') !== 'user') {
        reservationReply(['success' => false, 'message' => 'Mag-login muna bilang customer para makapagpa-reserve.'], 401);
    }

    $cafeId = (int)($input['cafe_id'] ?? 0);
    $date = trim((string)($input['date'] ?? ''));
    $time = trim((string)($input['time'] ?? ''));
    $guestCount = (int)($input['guest_count'] ?? 0);
    $name = trim((string)($input['customer_name'] ?? ''));
    $phone = trim((string)($input['customer_phone'] ?? ''));
    $note = trim((string)($input['note'] ?? ''));

    if ($cafeId < 1 || !reservationValidSlot($date, $time)) {
        reservationReply(['success' => false, 'message' => 'Pumili ng valid na coffee shop, petsa, at oras.'], 400);
    }
    if ($guestCount < 1 || $guestCount > 20) {
        reservationReply(['success' => false, 'message' => 'Ang bilang ng bisita ay dapat 1 hanggang 20.'], 400);
    }
    if ($name === '' || reservationTextLength($name) > 120) {
        reservationReply(['success' => false, 'message' => 'Ilagay ang pangalan (hanggang 120 character).'], 400);
    }
    if (!preg_match('/^09\d{9}$/', $phone)) {
        reservationReply(['success' => false, 'message' => 'Gumamit ng 11-digit na cellphone number na nagsisimula sa 09.'], 400);
    }
    if (reservationTextLength($note) > 500) {
        reservationReply(['success' => false, 'message' => 'Hanggang 500 character lang ang dagdag na mensahe.'], 400);
    }

    $cafeCheck = $pdo->prepare('SELECT id FROM cafes WHERE id = ? LIMIT 1');
    $cafeCheck->execute([$cafeId]);
    if (!$cafeCheck->fetch()) {
        reservationReply(['success' => false, 'message' => 'Hindi nahanap ang coffee shop.'], 404);
    }

    $pdo->prepare('INSERT IGNORE INTO cafe_reservation_settings (cafe_id) VALUES (?)')->execute([$cafeId]);
    try {
        $pdo->beginTransaction();
        $settingQuery = $pdo->prepare('SELECT capacity_per_slot, reservations_paused FROM cafe_reservation_settings WHERE cafe_id = ? FOR UPDATE');
        $settingQuery->execute([$cafeId]);
        $settings = $settingQuery->fetch();
        $capacity = (int)($settings['capacity_per_slot'] ?? 0);
        if (!$settings || $capacity < 1 || (int)$settings['reservations_paused'] === 1) {
            $pdo->rollBack();
            reservationReply(['success' => false, 'message' => 'Hindi muna tumatanggap ng reservation ang coffee shop na ito.'], 409);
        }

        $reservedQuery = $pdo->prepare("SELECT COALESCE(SUM(guest_count), 0)
            FROM cafe_reservations
            WHERE cafe_id = ? AND reservation_date = ? AND reservation_time = ?
              AND status IN ('pending', 'confirmed')");
        $reservedQuery->execute([$cafeId, $date, $time]);
        $reserved = (int)$reservedQuery->fetchColumn();
        if ($guestCount > $capacity - $reserved) {
            $pdo->rollBack();
            reservationReply([
                'success' => false,
                'message' => 'Kulang na ang bakanteng upuan sa oras na iyon. Pumili ng ibang oras o bawasan ang bilang ng bisita.',
                'available' => max(0, $capacity - $reserved)
            ], 409);
        }

        $insert = $pdo->prepare("INSERT INTO cafe_reservations
            (cafe_id, user_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $insert->execute([$cafeId, $userId, $name, $phone, $date, $time . ':00', $guestCount, $note]);
        $reservationId = (int)$pdo->lastInsertId();
        $pdo->commit();
        reservationReply([
            'success' => true,
            'message' => 'Naipadala na ang reservation request. Hintayin ang kumpirmasyon ng coffee shop.',
            'id' => $reservationId
        ], 201);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('KapeOrani reservation submit error: ' . $e->getMessage());
        reservationReply(['success' => false, 'message' => 'Hindi na-save ang request. Subukan ulit mamaya.'], 500);
    }
}

if ($action === 'owner_data') {
    $cafeId = reservationOwnerCafeId();
    $pdo->prepare('INSERT IGNORE INTO cafe_reservation_settings (cafe_id) VALUES (?)')->execute([$cafeId]);
    $settingQuery = $pdo->prepare('SELECT capacity_per_slot, reservations_paused, updated_at FROM cafe_reservation_settings WHERE cafe_id = ?');
    $settingQuery->execute([$cafeId]);
    $settings = $settingQuery->fetch();
    $requests = $pdo->prepare("SELECT id, customer_name, customer_phone, reservation_date, reservation_time,
            guest_count, note, status, created_at
        FROM cafe_reservations
        WHERE cafe_id = ? AND (reservation_date >= ? OR status = 'pending')
        ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, reservation_date ASC, reservation_time ASC, id DESC
        LIMIT 100");
    $requests->execute([$cafeId, date('Y-m-d')]);
    reservationReply(['success' => true, 'settings' => $settings, 'data' => $requests->fetchAll()]);
}

if ($action === 'owner_save_settings') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        reservationReply(['success' => false, 'message' => 'POST request ang kailangan.'], 405);
    }
    $cafeId = reservationOwnerCafeId();
    if (!array_key_exists('capacity', $input)) {
        reservationReply(['success' => false, 'message' => 'Ilagay ang kapasidad ng upuan.'], 400);
    }
    $capacity = filter_var($input['capacity'], FILTER_VALIDATE_INT);
    if ($capacity === false || $capacity < 0 || $capacity > 500) {
        reservationReply(['success' => false, 'message' => 'Ang kapasidad ay dapat 0 hanggang 500 upuan.'], 400);
    }
    $paused = !empty($input['paused']) ? 1 : 0;
    $pdo->prepare('INSERT IGNORE INTO cafe_reservation_settings (cafe_id) VALUES (?)')->execute([$cafeId]);
    $update = $pdo->prepare('UPDATE cafe_reservation_settings SET capacity_per_slot = ?, reservations_paused = ? WHERE cafe_id = ?');
    $update->execute([$capacity, $paused, $cafeId]);
    reservationReply(['success' => true, 'message' => 'Na-save ang reservation settings.']);
}

if ($action === 'owner_update_request') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        reservationReply(['success' => false, 'message' => 'POST request ang kailangan.'], 405);
    }
    $cafeId = reservationOwnerCafeId();
    $requestId = (int)($input['reservation_id'] ?? 0);
    $newStatus = (string)($input['status'] ?? '');
    if ($requestId < 1 || !in_array($newStatus, ['confirmed', 'declined'], true)) {
        reservationReply(['success' => false, 'message' => 'Hindi valid ang reservation update.'], 400);
    }

    $pdo->prepare('INSERT IGNORE INTO cafe_reservation_settings (cafe_id) VALUES (?)')->execute([$cafeId]);
    try {
        $pdo->beginTransaction();
        $settingsQuery = $pdo->prepare('SELECT capacity_per_slot, reservations_paused FROM cafe_reservation_settings WHERE cafe_id = ? FOR UPDATE');
        $settingsQuery->execute([$cafeId]);
        $settings = $settingsQuery->fetch();
        $requestQuery = $pdo->prepare('SELECT id, reservation_date, reservation_time, guest_count, status
            FROM cafe_reservations WHERE id = ? AND cafe_id = ? FOR UPDATE');
        $requestQuery->execute([$requestId, $cafeId]);
        $request = $requestQuery->fetch();

        if (!$request || $request['status'] !== 'pending') {
            $pdo->rollBack();
            reservationReply(['success' => false, 'message' => 'Hindi na pending ang request na ito. I-refresh ang listahan.'], 409);
        }
        if ($newStatus === 'confirmed') {
            if (!reservationValidSlot($request['reservation_date'], substr((string)$request['reservation_time'], 0, 5))) {
                $pdo->rollBack();
                reservationReply(['success' => false, 'message' => 'Lumipas na ang oras ng reservation. Maaari na lang itong tanggihan.'], 409);
            }
            $capacity = (int)($settings['capacity_per_slot'] ?? 0);
            if ($capacity < 1 || (int)$settings['reservations_paused'] === 1) {
                $pdo->rollBack();
                reservationReply(['success' => false, 'message' => 'Naka-pause o walang kapasidad ang reservations. I-update muna ang settings.'], 409);
            }
            $reservedQuery = $pdo->prepare("SELECT COALESCE(SUM(guest_count), 0)
                FROM cafe_reservations
                WHERE cafe_id = ? AND reservation_date = ? AND reservation_time = ?
                  AND status IN ('pending', 'confirmed')");
            $reservedQuery->execute([$cafeId, $request['reservation_date'], $request['reservation_time']]);
            if ((int)$reservedQuery->fetchColumn() > $capacity) {
                $pdo->rollBack();
                reservationReply(['success' => false, 'message' => 'Hindi makukumpirma: lampas na sa kapasidad ang slot. Dagdagan muna ang kapasidad.'], 409);
            }
        }

        $update = $pdo->prepare('UPDATE cafe_reservations SET status = ? WHERE id = ? AND cafe_id = ?');
        $update->execute([$newStatus, $requestId, $cafeId]);
        $pdo->commit();
        reservationReply([
            'success' => true,
            'message' => $newStatus === 'confirmed' ? 'Nakumpirma ang reservation.' : 'Tinanggihan ang reservation.'
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('KapeOrani reservation owner update error: ' . $e->getMessage());
        reservationReply(['success' => false, 'message' => 'Hindi na-update ang reservation. Subukan ulit.'], 500);
    }
}

if ($action === 'owner_delete_request') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        reservationReply(['success' => false, 'message' => 'POST request ang kailangan.'], 405);
    }
    $cafeId = reservationOwnerCafeId();
    $requestId = (int)($input['reservation_id'] ?? 0);
    if ($requestId < 1) {
        reservationReply(['success' => false, 'message' => 'Hindi valid ang reservation.'], 400);
    }
    try {
        $pdo->beginTransaction();
        $request = $pdo->prepare('SELECT id FROM cafe_reservations WHERE id = ? AND cafe_id = ? FOR UPDATE');
        $request->execute([$requestId, $cafeId]);
        if (!$request->fetch()) {
            $pdo->rollBack();
            reservationReply(['success' => false, 'message' => 'Hindi nahanap ang reservation. I-refresh ang listahan.'], 404);
        }
        // Hard-delete: mawawala sa My Reservations ng app at sa database
        $pdo->prepare('DELETE FROM cafe_reservation_notification_reads WHERE reservation_id = ?')->execute([$requestId]);
        $del = $pdo->prepare('DELETE FROM cafe_reservations WHERE id = ? AND cafe_id = ?');
        $del->execute([$requestId, $cafeId]);
        if ($del->rowCount() < 1) {
            $pdo->rollBack();
            reservationReply(['success' => false, 'message' => 'Hindi nabura ang reservation. Subukan ulit.'], 500);
        }
        $pdo->commit();
        reservationReply(['success' => true, 'message' => 'Nabura na ang reservation; nabakante ulit ang slot.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('KapeOrani reservation delete error: ' . $e->getMessage());
        reservationReply(['success' => false, 'message' => 'Hindi nabura ang reservation. Subukan ulit.'], 500);
    }
}


if ($action === 'user_notifications') {
    $userId = (int)($_SESSION['user_id'] ?? 0);
    if ($userId < 1 || ($_SESSION['type'] ?? '') !== 'user') {
        reservationReply(['success' => false, 'message' => 'Mag-login muna bilang customer.'], 401);
    }
    $stmt = $pdo->prepare("SELECT r.id AS reservation_id, r.cafe_id, r.reservation_date,
            r.reservation_time, r.guest_count, r.updated_at AS created_at,
            COALESCE(c.name, CONCAT('Cafe #', r.cafe_id)) AS cafe_name,
            CASE WHEN nr.reservation_id IS NULL THEN 0 ELSE 1 END AS is_read
        FROM cafe_reservations r
        LEFT JOIN cafes c ON c.id = r.cafe_id
        LEFT JOIN cafe_reservation_notification_reads nr
            ON nr.reservation_id = r.id AND nr.user_id = r.user_id
        WHERE r.user_id = ? AND r.status = 'confirmed'
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT 30");
    $stmt->execute([$userId]);
    $notifications = $stmt->fetchAll();
    foreach ($notifications as &$notification) {
        $time = substr((string)$notification['reservation_time'], 0, 5);
        $notification['type'] = 'reservation';
        $notification['id'] = (int)$notification['reservation_id'];
        $notification['message'] = 'Nakumpirma na ng ' . $notification['cafe_name'] .
            ' ang reservation mo para sa ' . $notification['reservation_date'] . ', ' .
            $time . ' (' . (int)$notification['guest_count'] . ' bisita).';
    }
    unset($notification);
    $count = $pdo->prepare("SELECT COUNT(*)
        FROM cafe_reservations r
        LEFT JOIN cafe_reservation_notification_reads nr
            ON nr.reservation_id = r.id AND nr.user_id = r.user_id
        WHERE r.user_id = ? AND r.status = 'confirmed' AND nr.reservation_id IS NULL");
    $count->execute([$userId]);
    reservationReply([
        'success' => true,
        'data' => $notifications,
        'unread' => (int)$count->fetchColumn()
    ]);
}

if ($action === 'user_notification_read' || $action === 'user_notifications_read_all') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        reservationReply(['success' => false, 'message' => 'POST request ang kailangan.'], 405);
    }
    $userId = (int)($_SESSION['user_id'] ?? 0);
    if ($userId < 1 || ($_SESSION['type'] ?? '') !== 'user') {
        reservationReply(['success' => false, 'message' => 'Mag-login muna bilang customer.'], 401);
    }

    if ($action === 'user_notification_read') {
        $reservationId = (int)($input['reservation_id'] ?? 0);
        if ($reservationId < 1) {
            reservationReply(['success' => false, 'message' => 'Hindi valid ang reservation notification.'], 400);
        }
        $exists = $pdo->prepare("SELECT id FROM cafe_reservations WHERE id = ? AND user_id = ? AND status = 'confirmed' LIMIT 1");
        $exists->execute([$reservationId, $userId]);
        if (!$exists->fetch()) {
            reservationReply(['success' => false, 'message' => 'Hindi nahanap ang reservation notification.'], 404);
        }
        $read = $pdo->prepare("INSERT INTO cafe_reservation_notification_reads (reservation_id, user_id, read_at)
            VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), read_at = NOW()");
        $read->execute([$reservationId, $userId]);
        reservationReply(['success' => true]);
    }

    $readAll = $pdo->prepare("INSERT INTO cafe_reservation_notification_reads (reservation_id, user_id, read_at)
        SELECT id, user_id, NOW() FROM cafe_reservations
        WHERE user_id = ? AND status = 'confirmed'
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), read_at = NOW()");
    $readAll->execute([$userId]);
    reservationReply(['success' => true]);
}

reservationReply(['success' => false, 'message' => 'Unknown reservation action.'], 400);
