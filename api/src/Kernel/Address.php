<?php

declare(strict_types=1);

namespace Soltec\Kernel;

use Soltec\Kernel\Http\Input;

/**
 * A place of a supplier or a client. At most one of a set is the primary one.
 */
final class Address
{
    public function __construct(
        public readonly string $label,
        public readonly string $address,
        public readonly ?string $zone,
        public readonly ?string $country,
        public readonly bool $isPrimary,
    ) {
    }

    /** @return array{label: string, address: string, zone: string|null, country: string|null, is_primary: bool} */
    public function toArray(): array
    {
        return [
            'label' => $this->label,
            'address' => $this->address,
            'zone' => $this->zone,
            'country' => $this->country,
            'is_primary' => $this->isPrimary,
        ];
    }

    /**
     * Reads the `addresses` of a body. The first one is the primary when none was marked; a second primary is
     * rejected (422 `duplicate` on `addresses.<n>.is_primary`).
     *
     * @return list<self>
     */
    public static function listFromInput(Input $input, int $max): array
    {
        $addresses = [];
        $primaries = 0;
        foreach ($input->objectList('addresses', $max) as $position => $item) {
            $row = Input::nested('addresses.' . $position, $item);
            $label = $row->text('label', 1, 60);
            $address = $row->text('address', 1, 255);
            $zone = $row->nullableText('zone', 100);
            $country = $row->nullableText('country', 100);
            $primary = $row->optionalBoolean('is_primary');
            if ($primary && ++$primaries > 1) {
                $row->fail('is_primary', 'duplicate');
            }
            $input->absorb($row);
            $addresses[] = new self((string) $label, (string) $address, $zone, $country, $primary);
        }

        if ($addresses !== [] && $primaries === 0) {
            $first = $addresses[0];
            $addresses[0] = new self($first->label, $first->address, $first->zone, $first->country, true);
        }

        return $addresses;
    }
}
