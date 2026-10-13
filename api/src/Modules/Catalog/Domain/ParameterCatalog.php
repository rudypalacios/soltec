<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

use LogicException;

/** The catalog parameters this API serves. Adding one is a row here, a migration and a contract entry. */
final class ParameterCatalog
{
    /** @return list<ParameterDefinition> */
    public static function all(): array
    {
        return [
            new ParameterDefinition('contact-types', 'contact_types', 'contactTypeId'),
            new ParameterDefinition('client-statuses', 'client_statuses', 'clientStatusId', hasColor: true),
            new ParameterDefinition('segments', 'segments', 'segmentId'),
            new ParameterDefinition('tax-regimes', 'tax_regimes', 'taxRegimeId'),
            new ParameterDefinition('payment-methods', 'payment_methods', 'paymentMethodId'),
        ];
    }

    public static function bySlug(string $slug): ParameterDefinition
    {
        foreach (self::all() as $definition) {
            if ($definition->slug === $slug) {
                return $definition;
            }
        }

        throw new LogicException(sprintf('Unknown catalog parameter "%s".', $slug));
    }
}
