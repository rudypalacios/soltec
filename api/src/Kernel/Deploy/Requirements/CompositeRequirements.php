<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

/** The checks of several modules, in order. The Kernel does not know which modules exist: the container lists them. */
final class CompositeRequirements implements ModuleRequirements
{
    /** @param list<ModuleRequirements> $modules */
    public function __construct(private readonly array $modules)
    {
    }

    /** @return list<RequirementCheck> */
    public function checks(): array
    {
        $checks = [];
        foreach ($this->modules as $module) {
            array_push($checks, ...$module->checks());
        }

        return $checks;
    }
}
