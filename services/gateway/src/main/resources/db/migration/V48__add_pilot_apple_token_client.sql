-- The Apple client a pilot's kept refresh token was issued to: the iOS
-- app's bundle id when the app's Sign in with Apple traded its
-- authorization code (AppleAppTokens), null for the web's Services ID.
-- Apple's /auth/revoke takes a token only with the client it was issued
-- to, so deleting the account (AppleRevocation) needs to know which.
ALTER TABLE pilots ADD COLUMN apple_token_client VARCHAR(255);
