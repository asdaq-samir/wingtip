"""The gateway's database roles, read from the deployment's files: Flyway
signs in as the database's owner, the app as a role that may change rows
and nothing else, with a secret of its own on every stack (the deep
security review of 2026-11-21, N4; docs/SECURITY.md)."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CALLBACK = (ROOT / "services/gateway/src/main/resources/db/callback/afterMigrate.sql").read_text()
TEMPLATE = (ROOT / "infra/cloudformation/template.yaml").read_text()


def _gateway_env(compose: str) -> dict[str, str]:
    text = (ROOT / compose).read_text()
    block = re.search(r"\n  gateway:\n(.*?)(?=\n  \w[\w-]*:\n|\Z)", text, re.S)[1]
    return dict(re.findall(r"^\s+(SPRING_(?:DATASOURCE|FLYWAY)_\w+): (\S+)", block, re.M))


def test_every_stack_runs_flyway_and_the_app_as_two_roles():
    for compose in ("docker-compose.yml", "infra/docker-compose.prod.yml"):
        env = _gateway_env(compose)
        assert env["SPRING_FLYWAY_USER"] == "wingtip", compose
        assert env["SPRING_DATASOURCE_USERNAME"] == "wingtip_app", compose
        # Each with a password of its own.
        assert "POSTGRES_PASSWORD" in env["SPRING_FLYWAY_PASSWORD"], compose
        assert "APP_DB_PASSWORD" in env["SPRING_DATASOURCE_PASSWORD"], compose


def test_the_apps_role_is_given_rows_and_no_schema():
    grants = re.findall(r"GRANT ([A-Z, ]+) ON (ALL TABLES|ALL SEQUENCES|TABLES|SEQUENCES)", CALLBACK)
    assert grants
    for privileges, _ in grants:
        assert set(p.strip() for p in privileges.split(",")) <= {"SELECT", "INSERT", "UPDATE", "DELETE", "USAGE"}, privileges
    assert "REVOKE CREATE ON SCHEMA public" in CALLBACK
    assert re.search(r"NOSUPERUSER NOCREATEDB NOCREATEROLE", CALLBACK)
    # Its password is in the statement: never in Postgres's log.
    assert CALLBACK.index("SET log_min_error_statement = panic") < CALLBACK.index("PASSWORD")


def test_the_server_reads_the_apps_own_secret():
    assert re.search(r"^  AppDbPasswordSecret:\n    Type: AWS::SecretsManager::Secret\n", TEMPLATE, re.M)
    assert re.search(r"secretsmanager:GetSecretValue\n\s+Resource: \[[^]]*!Ref AppDbPasswordSecret", TEMPLATE)
    assert "APP_DB_SECRET_ARN=${AppDbPasswordSecret}" in TEMPLATE
    deploy = (ROOT / "infra/server/deploy.sh").read_text()
    assert 'app_db_password=$(secret "$APP_DB_SECRET_ARN")' in deploy
    assert 'echo "APP_DB_PASSWORD=$app_db_password"' in deploy
    assert "APP_DB_PASSWORD=" in (ROOT / "infra/rehearsal/run.sh").read_text()
