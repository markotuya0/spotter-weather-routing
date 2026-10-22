from hypothesis import given, strategies as st

from domain import eligibility
from domain.models import RiskLevel, UNKNOWN

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def test_eligible_when_all_known_and_no_no_travel():
    assert eligibility.assess([L, M, H, S])["status"] == "eligible"


def test_incomplete_when_any_unknown():
    assert eligibility.assess([L, UNKNOWN, H])["status"] == "incomplete"


def test_blocked_when_any_no_travel():
    assert eligibility.assess([L, N, H])["status"] == "blocked"


def test_blocked_beats_incomplete_when_route_has_both():
    # docs/05 §8.1: a route with both a no_travel AND an unknown checkpoint is
    # blocked, not incomplete — the unknown point doesn't excuse the known hazard.
    assert eligibility.assess([UNKNOWN, N, L])["status"] == "blocked"


def test_partition_groups_by_status_preserving_order():
    routes = [
        ("r1", [L, L]),
        ("r2", [N, L]),
        ("r3", [UNKNOWN, L]),
        ("r4", [L, L]),
    ]
    groups = eligibility.partition_by_eligibility(routes)
    assert groups["eligible"] == ["r1", "r4"]
    assert groups["blocked"] == ["r2"]
    assert groups["incomplete"] == ["r3"]


def test_partition_empty_group_when_no_routes_of_that_kind():
    routes = [("r1", [L, L])]
    groups = eligibility.partition_by_eligibility(routes)
    assert groups["blocked"] == []
    assert groups["incomplete"] == []


LEVEL_OR_UNKNOWN = st.sampled_from([L, M, H, S, N, UNKNOWN])


@given(st.lists(LEVEL_OR_UNKNOWN, min_size=1, max_size=15))
def test_partition_is_exhaustive_and_disjoint(levels):
    status = eligibility.assess(levels)["status"]
    assert status in ("eligible", "incomplete", "blocked")
    groups = eligibility.partition_by_eligibility([("r", levels)])
    memberships = [name for name, g in groups.items() if "r" in g]
    assert memberships == [status]  # exactly one group contains it
