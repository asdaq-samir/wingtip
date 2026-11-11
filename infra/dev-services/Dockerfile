# The developer console's Docker sidecar (infra/dev-services/server.py):
# standard library only, so python and one file.
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
COPY infra/dev-services/server.py /app/server.py
CMD ["python", "-u", "/app/server.py"]
