<?php

declare(strict_types=1);

namespace Soltec\Modules\Access\Domain;

/**
 * The widgets a home screen can show. A widget is code in the web app; this list is what a role may be assigned, and
 * it mirrors the `WidgetCode` enum of the contract (a test keeps the two equal, and the web registry is typed by that
 * enum, so a code that is missing there fails the type check).
 *
 * A widget never shows data its viewer may not see: it asks the API for it with the viewer's own permissions. Adding
 * one means a line here, the value in the contract and its component in the web registry.
 */
final class WidgetCatalog
{
    /** @var array<string, array{name: string, description: string}> */
    private const WIDGETS = [
        'quick_links' => [
            'name' => 'Accesos rápidos',
            'description' => 'Atajos a las pantallas que la persona puede abrir.',
        ],
        'service_status' => [
            'name' => 'Estado del servicio',
            'description' => 'Si el servicio y su base de datos responden.',
        ],
    ];

    /** @return list<string> */
    public static function codes(): array
    {
        return array_keys(self::WIDGETS);
    }

    /** @return list<array{code: string, name: string, description: string}> */
    public static function all(): array
    {
        $widgets = [];
        foreach (self::WIDGETS as $code => $widget) {
            $widgets[] = ['code' => $code] + $widget;
        }

        return $widgets;
    }
}
