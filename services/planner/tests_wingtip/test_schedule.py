"""wingtip.schedule: every job held to one run at a time, missed turns run
once however late, and the first turn now unless asked otherwise."""

from wingtip import schedule


def test_a_job_runs_one_at_a_time_and_its_missed_turns_once():
    on = schedule.scheduler()
    schedule.every(on, 60, print, name="now")
    schedule.every(on, 60, print, name="later", now=False)
    # Paused, so the defaults are applied and nothing runs.
    on.start(paused=True)
    try:
        now, later = on.get_job("now"), on.get_job("later")
        assert (now.max_instances, now.coalesce, now.misfire_grace_time) == (1, True, None)
        assert later.next_run_time > now.next_run_time
        assert (later.next_run_time - now.next_run_time).total_seconds() > 59
    finally:
        on.shutdown(wait=False)
