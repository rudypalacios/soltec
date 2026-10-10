<?php

declare(strict_types=1);

namespace Soltec\Tests\Unit\Kernel\Auth;

use PHPUnit\Framework\TestCase;
use Soltec\Kernel\Auth\Team;

final class TeamTest extends TestCase
{
    public function testAUserAloneIsTheirOwnTeam(): void
    {
        self::assertSame(['lead'], Team::members('lead', [$this->person('lead')]));
    }

    public function testIncludesDirectAndIndirectSubordinates(): void
    {
        $people = [
            $this->person('lead'),
            $this->person('direct', manager: 'lead'),
            $this->person('indirect', manager: 'direct'),
            $this->person('peer'),
            $this->person('peer-report', manager: 'peer'),
        ];

        self::assertSame(['direct', 'indirect', 'lead'], $this->sorted(Team::members('lead', $people)));
    }

    public function testDoesNotIncludeTheManagerAbove(): void
    {
        $people = [$this->person('boss'), $this->person('lead', manager: 'boss')];

        self::assertSame(['lead'], Team::members('lead', $people));
    }

    public function testIncludesTheMembersOfTheDepartmentButNotTheirReports(): void
    {
        $people = [
            $this->person('lead', department: 'sales'),
            $this->person('colleague', department: 'sales'),
            $this->person('colleague-report', manager: 'colleague', department: 'support'),
            $this->person('outsider', department: 'support'),
        ];

        self::assertSame(['colleague', 'lead'], $this->sorted(Team::members('lead', $people)));
    }

    public function testAUserWithoutDepartmentGetsOnlyTheHierarchy(): void
    {
        $people = [
            $this->person('lead'),
            $this->person('report', manager: 'lead'),
            $this->person('nobody-else'),
        ];

        self::assertSame(['lead', 'report'], $this->sorted(Team::members('lead', $people)));
    }

    public function testACycleInTheDataDoesNotLoopForever(): void
    {
        $people = [$this->person('a', manager: 'b'), $this->person('b', manager: 'a')];

        self::assertSame(['a', 'b'], $this->sorted(Team::members('a', $people)));
    }

    /** @return array{id: string, manager_id: string|null, department_id: string|null} */
    private function person(string $id, ?string $manager = null, ?string $department = null): array
    {
        return ['id' => $id, 'manager_id' => $manager, 'department_id' => $department];
    }

    /**
     * @param list<string> $ids
     * @return list<string>
     */
    private function sorted(array $ids): array
    {
        sort($ids);

        return $ids;
    }
}
