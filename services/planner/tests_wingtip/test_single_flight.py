import threading
import time

from wingtip.single_flight import _WORKING, once, one_at_a_time


def test_callers_at_once_build_it_once_and_share_the_answer():
    built = []

    @once(maxsize=2)
    def table(path: str) -> list:
        built.append(path)
        time.sleep(0.2)
        return [path]

    answers = []
    threads = [threading.Thread(target=lambda: answers.append(table("APT_CON.csv"))) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert built == ["APT_CON.csv"]
    assert len(answers) == 8 and all(a is answers[0] for a in answers)


def test_other_keys_are_built_beside_each_other_and_a_failure_is_tried_again():
    calls = []
    # Side by side, not one after the other: "a" and "b" each wait inside
    # their build for the other to arrive, which only happens if neither
    # waits for the other to finish. It timed this before (under 0.35 s for
    # two 0.2 s builds), which a busy machine failed at 0.62 s.
    both_in = threading.Barrier(2, timeout=10)
    side_by_side = []

    @once(maxsize=4)
    def table(path: str) -> str:
        calls.append(path)
        if path == "bad" and calls.count("bad") == 1:
            raise OSError("not yet")
        if path in ("a", "b") and calls.count(path) == 1:
            try:
                both_in.wait()
                side_by_side.append(path)
            except threading.BrokenBarrierError:
                pass
        return path

    threads = [threading.Thread(target=table, args=(p,)) for p in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(side_by_side) == ["a", "b"]
    try:
        table("bad")
    except OSError:
        pass
    assert table("bad") == "bad"
    table.cache_clear()
    table("a")
    assert calls.count("a") == 2


def test_it_keeps_the_newest_maxsize_keys_and_counts_like_lru_cache():
    built = []

    @once(maxsize=2)
    def table(path: str) -> str:
        built.append(path)
        return path

    for path in ("a", "b", "a", "c", "b"):
        table(path)
    # "b" was the least recently used when "c" came, so it is built again.
    assert built == ["a", "b", "c", "b"]
    info = table.cache_info()
    assert (info.hits, info.misses, info.maxsize, info.currsize) == (1, 4, 2, 2)


def test_one_key_is_worked_on_one_at_a_time_and_forgotten_after():
    inside, most = [], []

    def work():
        with one_at_a_time("page-3.png"):
            inside.append(1)
            most.append(len(inside))
            time.sleep(0.01)
            inside.pop()

    threads = [threading.Thread(target=work) for _ in range(4)]
    for t in threads:
        t.start()
    with one_at_a_time("another.png"):  # a different key is not held up
        pass
    for t in threads:
        t.join()
    assert max(most) == 1 and _WORKING == {}
