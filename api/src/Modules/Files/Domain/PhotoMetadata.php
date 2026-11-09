<?php

declare(strict_types=1);

namespace Soltec\Modules\Files\Domain;

use Soltec\Kernel\Http\Input;

/**
 * What the phone says about a photo, as the client read it from the EXIF before shrinking the picture (ADR-0009).
 * Only these fields are kept, whatever else the client sends, and the coordinates go together or not at all.
 */
final class PhotoMetadata
{
    private const COORDINATE_SCALE = 6;

    /** @param array<string, mixed> $values only the fields that came, already validated */
    private function __construct(private readonly array $values)
    {
    }

    public static function none(): self
    {
        return new self([]);
    }

    /** @return self the fields that were present; errors are recorded in `$input`, which the caller finishes */
    public static function read(Input $input): self
    {
        $values = [];
        $takenAt = $input->timestamp('taken_at');
        if ($takenAt !== null) {
            $values['taken_at'] = $takenAt->format('Y-m-d\TH:i:s.v\Z');
        }

        $latitude = $input->coordinate('latitude', 90);
        $longitude = $input->coordinate('longitude', 180);
        if ($latitude !== null && $longitude !== null) {
            $values['latitude'] = round($latitude, self::COORDINATE_SCALE);
            $values['longitude'] = round($longitude, self::COORDINATE_SCALE);
        } elseif ($input->has('latitude') !== $input->has('longitude')) {
            // One of the two came alone. A coordinate that came and was wrong already has its own error.
            $input->fail($input->has('latitude') ? 'longitude' : 'latitude', 'required');
        }

        foreach (['device_make', 'device_model'] as $field) {
            $text = $input->nullableText($field, 100);
            if ($text !== null) {
                $values[$field] = $text;
            }
        }

        return new self($values);
    }

    /** @param array<array-key, mixed>|null $stored the JSON column as it was read */
    public static function fromStored(?array $stored): self
    {
        $values = [];
        foreach ($stored ?? [] as $key => $value) {
            $values[(string) $key] = $value;
        }

        return new self($values);
    }

    public function isEmpty(): bool
    {
        return $this->values === [];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->values;
    }
}
