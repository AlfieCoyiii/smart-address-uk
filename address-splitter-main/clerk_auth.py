"""
Verify Clerk JWT from Authorization: Bearer <token>.
Uses JWKS from CLERK_JWKS_URL; optional CLERK_ISSUER for issuer claim.
Returns user_id (sub) from token. Org is passed separately via X-Org-Id header.
If PyJWT is not installed or CLERK_JWKS_URL is not set, all requests are treated as anonymous.
"""
import os

# Use certifi's CA bundle for HTTPS (fixes SSL_CERTIFICATE_VERIFY_FAILED on macOS when fetching JWKS)
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

try:
    import jwt
    from jwt import PyJWKClient
    _JWT_AVAILABLE = True
except ImportError:
    _JWT_AVAILABLE = False

_JWKS_CLIENT: "PyJWKClient | None" = None


def _get_jwks_client():
    if not _JWT_AVAILABLE:
        return None
    url = (os.environ.get("CLERK_JWKS_URL") or "").strip()
    if not url:
        return None
    global _JWKS_CLIENT
    if _JWKS_CLIENT is None:
        _JWKS_CLIENT = PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _JWKS_CLIENT


def verify_clerk_token(bearer_token: str) -> str | None:
    """Verify Clerk JWT and return user_id (sub), or None if invalid/missing."""
    uid, _ = verify_clerk_token_with_reason(bearer_token)
    return uid


def verify_clerk_token_with_reason(bearer_token: str) -> tuple[str | None, str]:
    """
    Verify Clerk JWT. Returns (user_id, reason_string).
    reason_string is 'ok' on success, or a short error reason on failure (for diagnostics).
    """
    if not bearer_token or not bearer_token.strip():
        return None, "No token"
    token = bearer_token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not _JWT_AVAILABLE:
        return None, "PyJWT not installed (pip install pyjwt[crypto])"
    url = (os.environ.get("CLERK_JWKS_URL") or "").strip()
    if not url:
        return None, "CLERK_JWKS_URL not set in .env"
    client = _get_jwks_client()
    if not client:
        return None, "Could not create JWKS client"
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        issuer = (os.environ.get("CLERK_ISSUER") or "").strip() or None
        try:
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=issuer,
                options={"require": ["exp", "sub"]},
            )
        except Exception as e:
            if issuer:
                try:
                    payload = jwt.decode(
                        token,
                        signing_key.key,
                        algorithms=["RS256"],
                        options={"require": ["exp", "sub"]},
                    )
                except Exception as e2:
                    return None, f"JWT invalid: {type(e2).__name__}: {e2}"
            else:
                return None, f"JWT invalid: {type(e).__name__}: {e}"
        return payload.get("sub"), "ok"
    except Exception as e:
        return None, f"Verify failed: {type(e).__name__}: {e}"
