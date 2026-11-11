"""The gateway's access tokens, checked as the MCP authorization spec
asks of a resource server (modelcontextprotocol.io, 2026-07-28,
"Access Token Usage"): the signature against the gateway's published
keys, the issuer, the expiry, and the audience -- this connector's own
address (RFC 8707), so a token the gateway issued for anything else is
refused. Nothing here passes the token on: the pilot's records are asked
of the gateway with the planner's own credential (app.mcp.records)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

import anyio.to_thread
import jwt
from mcp.server.auth.provider import AccessToken, TokenVerifier

from . import records

log = logging.getLogger(__name__)

#: Whether a pilot's connection through a client still stands.
Live = Callable[[str, str], Awaitable[bool]]

#: Seconds between two fetches of the gateway's keys for a key id not seen.
KEY_REFETCH_S = 60

#: The gateway signs with RS256 (its RSA key, security/mcp/SigningKey).
ALGORITHMS = ["RS256"]


class GatewayTokens(TokenVerifier):
    """Reads a bearer token as the gateway's JWT for this connector, or
    None (a 401 with the resource metadata's address, said by the SDK)."""

    def __init__(self, *, jwks_url: str, issuer: str, resource: str, live: Live | None = None) -> None:
        # PyJWT's key set client keeps the keys and asks again for a key id
        # it has not seen, which is what a gateway restarted with a new
        # development key looks like -- but at most once a minute
        # (KEY_REFETCH_S): anyone can send /mcp junk tokens with made-up key
        # ids, and each was a fetch of the gateway's /oauth2/jwks (the
        # security audit's L7). In between, an unknown id is refused.
        self._keys = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600, timeout=5, cooldown_duration=KEY_REFETCH_S)
        self.issuer = issuer
        self.resource = resource
        # Whether the connection a token was issued on still stands
        # (app.mcp.records.connection_live): asked on every call, so a
        # pilot who disconnects or deletes their account is cut off at
        # once, not when the token runs out.
        self.live = live or records.connection_live

    def claims(self, token: str) -> dict:
        """The token's claims once it checks out; raises jwt's errors."""
        key = self._keys.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=ALGORITHMS,
            audience=self.resource,
            issuer=self.issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            # The key set is fetched over HTTP the first time: off the loop.
            claims = await anyio.to_thread.run_sync(self.claims, token)
        except jwt.PyJWTError as err:
            log.info("connector token refused: %s", err)
            return None
        if not await self.live(str(claims["sub"]), str(claims.get("client_id", ""))):
            log.info("connector token refused: its connection was revoked or its account deleted")
            return None
        return AccessToken(
            token=token,
            client_id=str(claims.get("client_id", "")),
            scopes=str(claims.get("scope", "")).split(),
            expires_at=int(claims["exp"]),
            resource=self.resource,
            subject=str(claims["sub"]),
            claims={"iss": claims["iss"]},
        )
