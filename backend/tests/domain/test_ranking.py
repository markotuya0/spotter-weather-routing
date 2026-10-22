import itertools

from hypothesis import given, strategies as st

from domain.models import RankedRoute
from domain.ranking import rank


def _route(route_id, provider_index, severe, high, avg_risk, duration):
    return RankedRoute(
        route_id=route_id,
        provider_index=provider_index,
        severe_miles=severe,
        high_miles=high,
        average_risk=avg_risk,
        duration_s=duration,
    )


def test_worked_example_from_docs_05_section_9():
    r1 = _route("r1", 0, 24.5, 10.0, 1.21, 8 * 3600 + 20 * 60)
    r2 = _route("r2", 1, 0.0, 40.1, 0.74, 8 * 3600 + 40 * 60)
    r3 = _route("r3", 2, 0.0, 40.1, 0.74, 8 * 3600 + 55 * 60)
    ranked = rank([r1, r2, r3])
    by_id = {r.route_id: r.rank for r in ranked}
    assert by_id == {"r2": 1, "r3": 2, "r1": 3}


def test_severe_miles_decides_in_isolation():
    a = _route("a", 0, 1.0, 100.0, 4.0, 1000)
    b = _route("b", 1, 2.0, 0.0, 0.0, 1)
    ranked = rank([a, b])
    assert ranked[0].route_id == "a"


def test_high_miles_decides_when_severe_ties():
    a = _route("a", 0, 5.0, 1.0, 4.0, 1000)
    b = _route("b", 1, 5.0, 2.0, 0.0, 1)
    ranked = rank([a, b])
    assert ranked[0].route_id == "a"


def test_average_risk_decides_when_severe_and_high_tie():
    a = _route("a", 0, 5.0, 5.0, 0.5, 1000)
    b = _route("b", 1, 5.0, 5.0, 0.9, 1)
    ranked = rank([a, b])
    assert ranked[0].route_id == "a"


def test_duration_decides_when_first_three_tie():
    a = _route("a", 0, 5.0, 5.0, 0.5, 100)
    b = _route("b", 1, 5.0, 5.0, 0.5, 200)
    ranked = rank([a, b])
    assert ranked[0].route_id == "a"


def test_provider_index_is_final_tie_break():
    a = _route("a", 1, 5.0, 5.0, 0.5, 100)
    b = _route("b", 0, 5.0, 5.0, 0.5, 100)
    ranked = rank([a, b])
    assert ranked[0].route_id == "b"  # lower provider_index wins the tie


def test_permutation_of_input_changes_nothing_except_which_object_is_rank_1():
    a = _route("a", 0, 1.0, 1.0, 0.1, 100)
    b = _route("b", 1, 2.0, 1.0, 0.1, 100)
    c = _route("c", 2, 3.0, 1.0, 0.1, 100)
    orders = list(itertools.permutations([a, b, c]))
    results = [[r.route_id for r in rank(list(o))] for o in orders]
    assert all(r == ["a", "b", "c"] for r in results)


def test_average_risk_null_sorts_last_in_tier():
    a = _route("a", 0, 0.0, 0.0, None, 100)
    b = _route("b", 1, 0.0, 0.0, 5.0, 100)
    ranked = rank([a, b])
    assert ranked[0].route_id == "b"
    assert ranked[1].route_id == "a"


def test_rounding_boundary_on_ranking_key_independent_of_raw_classification():
    # 0.04 and 0.049 mi both round half-up to 0.0 at 0.1 precision -> they tie on
    # that key and fall through to duration, the next PDF key (docs/05 §9 note).
    a = _route("a", 0, 0.04, 0.0, 0.0, 100)
    b = _route("b", 1, 0.049, 0.0, 0.0, 50)
    ranked = rank([a, b])
    assert ranked[0].route_id == "b"  # ties on severe (both round to 0.0), wins on duration


def test_empty_list_returns_empty():
    assert rank([]) == []


def test_single_route_returns_rank_one_with_empty_reason():
    a = _route("a", 0, 0.0, 0.0, 0.0, 100)
    ranked = rank([a])
    assert ranked[0].rank == 1
    assert ranked[0].reason == ""


def test_reason_text_names_deciding_key():
    a = _route("a", 0, 0.0, 10.0, 0.74, 100)
    b = _route("b", 1, 24.5, 10.0, 1.21, 100)
    ranked = rank([a, b])
    assert "Severe" in ranked[0].reason


ROUTE_STRATEGY = st.builds(
    _route,
    route_id=st.sampled_from(["x", "y", "z"]),
    provider_index=st.integers(min_value=0, max_value=5),
    severe=st.floats(min_value=0, max_value=100, allow_nan=False),
    high=st.floats(min_value=0, max_value=100, allow_nan=False),
    avg_risk=st.one_of(st.none(), st.floats(min_value=0, max_value=4, allow_nan=False)),
    duration=st.integers(min_value=0, max_value=100000),
)


@given(st.lists(ROUTE_STRATEGY, min_size=1, max_size=6))
def test_ranking_is_a_total_order_within_a_tier(routes):
    # distinct provider_index to keep sort deterministic/comparable
    routes = [r for i, r in enumerate(routes)]
    for i, r in enumerate(routes):
        routes[i] = r.__class__(**{**r.__dict__, "provider_index": i})
    ranked = rank(routes)
    ranks = [r.rank for r in ranked]
    assert ranks == sorted(ranks)
    assert ranks == list(range(1, len(routes) + 1))
