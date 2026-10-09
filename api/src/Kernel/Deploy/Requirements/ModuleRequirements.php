<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

/**
 * What a module needs the person installing an instance to set up by hand (for example, the first account).
 * The Kernel does not know modules, so each one contributes its checks through this interface.
 */
interface ModuleRequirements
{
    /** @return list<RequirementCheck> */
    public function checks(): array;
}
