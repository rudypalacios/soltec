<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/**
 * Where the audit log finds the name of the record an entry is about. Only tables with a `name` column and a binary
 * `id` belong here; a module whose records should be named in the audit adds its table. Records without an entry
 * here (the single-row settings, sequences) have no label: the section already says what they are.
 */
final class AuditEntityLabels
{
    /** @var list<string> */
    private const TABLES = [
        'users',
        'roles',
        'departments',
        'margin_levels',
        'devices',
        'contact_types',
        'client_statuses',
        'segments',
        'tax_regimes',
        'payment_methods',
        'brands',
        'areas',
        'product_groups',
        'unit_categories',
        'units_of_measure',
        'contacts',
        'suppliers',
        'clients',
        'products',
        'bundles',
    ];

    /** Longest label stored: the column's width. */
    public const MAX_LENGTH = 190;

    /** The table whose `name` labels records of this type, or null when the type has no label. */
    public static function tableOf(string $entityType): ?string
    {
        return in_array($entityType, self::TABLES, true) ? $entityType : null;
    }

    /**
     * SQL for the name the record has now, for an entry written before labels were stored. A subquery per row, but
     * only for rows without a stored label, and a page has at most a hundred.
     *
     * @param string $entry alias of `audit_logs` in the query
     */
    public static function currentNameSql(string $entry): string
    {
        $cases = '';
        foreach (self::TABLES as $table) {
            $cases .= sprintf(
                " WHEN '%s' THEN (SELECT t.name FROM %s t WHERE t.id = %s.entity_id)",
                $table,
                $table,
                $entry,
            );
        }

        return sprintf(
            'CASE WHEN %1$s.entity_label IS NULL AND %1$s.entity_id IS NOT NULL THEN CASE %1$s.entity_type%2$s END END',
            $entry,
            $cases,
        );
    }
}
