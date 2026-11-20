-- The pilot's own photo for their avatar (PUT /api/me/avatar): one a
-- pilot, a small square JPEG, PNG or WebP the app has already scaled
-- down (at most 512 KB, AvatarService), gone with the pilot. Kept apart
-- from pilots so the row read on every request never carries the bytes;
-- updated_at is the version in the photo's address, so a new photo is
-- never an old one from a cache.
CREATE TABLE pilot_avatars (
    pilot_id BIGINT PRIMARY KEY REFERENCES pilots (id) ON DELETE CASCADE,
    content_type VARCHAR(16) NOT NULL,
    image BYTEA NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
