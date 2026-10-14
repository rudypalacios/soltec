<?php

declare(strict_types=1);

namespace Soltec\Modules\Catalog\Domain;

use LogicException;

/** The catalog lists this API serves. Adding one is a row here, a migration and a contract entry. */
final class ParameterCatalog
{
    /** @return list<ParameterDefinition> */
    public static function all(): array
    {
        return [
            new ParameterDefinition('contact-types', 'contact_types', 'contactTypeId', offersOptions: true),
            new ParameterDefinition('client-statuses', 'client_statuses', 'clientStatusId', hasColor: true),
            new ParameterDefinition('segments', 'segments', 'segmentId'),
            new ParameterDefinition('tax-regimes', 'tax_regimes', 'taxRegimeId'),
            new ParameterDefinition('payment-methods', 'payment_methods', 'paymentMethodId'),
            new ParameterDefinition('brands', 'brands', 'brandId', offersOptions: true),
            new ParameterDefinition(
                'areas',
                'areas',
                'areaId',
                children: new ChildLink('product_groups', 'area_id', 'active_group_count', 'area_in_use'),
                offersOptions: true,
            ),
            new ParameterDefinition(
                'product-groups',
                'product_groups',
                'productGroupId',
                parent: new ParentLink('area_id', 'areas', 'area'),
                offersOptions: true,
            ),
            new ParameterDefinition(
                'unit-categories',
                'unit_categories',
                'unitCategoryId',
                nameMax: 60,
                children: new ChildLink('units_of_measure', 'category_id', 'active_unit_count', 'unit_category_in_use'),
                offersOptions: true,
            ),
            new ParameterDefinition(
                'units-of-measure',
                'units_of_measure',
                'unitOfMeasureId',
                nameMax: 60,
                parent: new ParentLink('category_id', 'unit_categories', 'category'),
                offersOptions: true,
            ),
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
