<?php

declare(strict_types=1);

// Drops and recreates the database of the E2E run, so every run starts from an empty schema. The name must end in
// "_e2e": this script erases everything in it.
$name = getenv('DB_NAME') ?: '';
if (preg_match('/^[a-z0-9_]+_e2e$/', $name) !== 1) {
    fwrite(STDERR, "DB_NAME must end in _e2e (got '$name').\n");
    exit(1);
}

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%s', getenv('DB_HOST') ?: '127.0.0.1', getenv('DB_PORT') ?: '3306'),
    getenv('DB_USER') ?: '',
    getenv('DB_PASS') ?: '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$pdo->exec("DROP DATABASE IF EXISTS `$name`");
$pdo->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
