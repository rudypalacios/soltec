<?php

declare(strict_types=1);

namespace Soltec\Kernel\Deploy\Requirements;

enum CheckStatus: string
{
    /** The requirement is met. */
    case Pass = 'pass';
    /** The system works, but something will matter later or is not the recommended setup. */
    case Warn = 'warn';
    /** The system cannot work correctly until this is fixed. */
    case Fail = 'fail';
}
