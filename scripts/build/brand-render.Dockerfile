# The image that turns the brand's SVG sources into the apps' icons and
# launch art (scripts/build/app-icons.sh) and frames the store screenshots
# (scripts/build/store-frames.sh). librsvg draws the SVGs, Pillow sizes,
# rounds and packs them; Barlow, the brand's text face (design/tokens.json
# font.brand), sets the store art's words. Pinned so the Mac and CI draw
# the same pixels: the base by tag, Pillow by version, Barlow by the
# google/fonts commit and its checksum.
FROM python:3.13-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends librsvg2-bin fontconfig \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pillow==11.3.0
ADD --checksum=sha256:86577cb32f8abe3673db53ca0f4221e6856751a4f6730c867e00f720f8bb1fc5 \
    https://raw.githubusercontent.com/google/fonts/6cdf01867df0813c2390f90dff7dc66c87f14cf7/ofl/barlow/Barlow-SemiBold.ttf \
    /usr/share/fonts/truetype/barlow/Barlow-SemiBold.ttf
ADD --checksum=sha256:84e6a4d61e7c3e21f3c50ea6a4f7e5303a3467864c038be6ea3759bab8d547f9 \
    https://raw.githubusercontent.com/google/fonts/6cdf01867df0813c2390f90dff7dc66c87f14cf7/ofl/barlow/Barlow-Bold.ttf \
    /usr/share/fonts/truetype/barlow/Barlow-Bold.ttf
RUN chmod 644 /usr/share/fonts/truetype/barlow/*.ttf && fc-cache -f
