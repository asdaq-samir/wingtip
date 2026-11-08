# syntax=docker/dockerfile:1

# The notebooks' image: Jupyter and scikit-learn over wingtip's own list,
# for notebooks 01-03 and 08. Python 3.14, as every other image: the
# 3.13 it was held at was for TensorFlow, which went with the PyTorch,
# Spark and sentence-transformers comparison notebooks (2026-11-06), and
# with them the CPU torch wheel and the JDK PySpark needed.
# wingtip's base (services/Dockerfile.base): Python, wingtip's own
# requirements, its Rust extension and the appuser, built once for every
# image that imports wingtip. The build context `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace

# Copied at the paths they have in the repo, so the image's list finds
# wingtip's own through its -r ../services/planner/requirements-wingtip.txt.
COPY services/planner/requirements-wingtip.txt services/planner/
COPY ml/requirements-ml.txt ml/
RUN --mount=type=cache,target=/root/.cache/pip pip install -r ml/requirements-ml.txt
# The build fails here if a package the notebooks and wingtip import is
# missing, rather than a notebook cell later. This image carries no
# source (compose mounts the checkout), so it is the packages alone:
# wingtip's own list, then the notebooks'.
RUN python -B -c "import wingtip_native, numpy, pandas, requests, pyarrow.parquet, shapely.ops, shapefile, pyproj, scipy.spatial, pygeomag, sklearn, joblib, matplotlib, PIL, folium, notebook"

# Non-root (the base's appuser), matching every other image
# (Dockerfile.processing, Dockerfile.training, planner) -- this one used to run (and
# need --allow-root for) root specifically, despite mounting the same `.:/workspace` bind mount the other two
# pipeline images already run non-root against: a notebook saved from
# inside this container was landing on the host owned by root, not the
# host user who'd then need sudo to edit or delete it.
USER appuser

EXPOSE 8888

CMD ["jupyter", "notebook", "--no-browser", "--ip=0.0.0.0", \
     "--NotebookApp.notebook_dir=/workspace", "--NotebookApp.token=wingtip"]
