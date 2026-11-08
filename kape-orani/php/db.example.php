<?php
/**
 * HALIMBAWA lang ito — HUWAG i-overwrite ang kasalukuyan mong db.php kung gumagana na ito sa website.
 * Gamitin lang bilang gabay: parehong db.php ang dapat gamit ng website AT mobile_api.php.
 *
 * Byethost: kunin ang tamang values sa Control Panel (vistapanel) → "MySQL Databases".
 *  - Host   : HINDI "localhost". Ito ay parang sql###.byethost5.com (nakalista sa panel)
 *  - DB name: parang b5_12345678_kapeorani
 *  - User   : parang b5_12345678
 */
function getDB(): ?PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = 'sqlXXX.byethost5.com';
    $name = 'b5_XXXXXXXX_kapeorani';
    $user = 'b5_XXXXXXXX';
    $pass = 'PASSWORD_DITO';

    try {
        $pdo = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET time_zone = '+08:00'");
    } catch (Throwable $e) {
        error_log('DB connect failed: ' . $e->getMessage());
        return null;
    }
    return $pdo;
}
