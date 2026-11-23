# syntax=docker/dockerfile:1
# Build context is the repository root, because the image carries the
# front end: Spring Boot is the only public surface, so the bundle and
# the API it calls ship together and are served from one origin.
#
# Two independent build stages, one runtime stage. The bundle is copied
# beside the jar rather than into it (WebMvcConfig serves it from
# APP_STATIC_LOCATION), so a front-end change rebuilds only the `web`
# stage and a Java change only the `build` stage -- neither waits on the
# other's toolchain.

# Node's LTS line, the major in apps/web/.nvmrc (which CI's web job reads).
FROM node:26-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS web
# At its path in the repository, so `npm run types` finds the documents
# below at the relative paths package.json names (../../services/...).
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
# --mount=type=cache: npm's own download/extract cache, keyed by this
# stage -- survives across builds (unlike the layer cache, which a
# `COPY apps/web/ ./` below still invalidates on every source change) so
# `npm ci` doesn't re-download the same packages every time.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY apps/web/ ./
# The planner's and this app's own OpenAPI documents, from which `npm run
# types` generates the front end's API types (apps/web/src/lib/api/
# schema.d.ts and gateway-schema.d.ts, not committed).
COPY services/planner/openapi.json /repo/services/planner/openapi.json
COPY services/gateway/openapi.json /repo/services/gateway/openapi.json
# The engine's contract, from which it generates the engine calls' types
# (apps/web/src/lib/engine/contract.ts, committed, made again here).
COPY engine/contract/engine.schema.json /repo/engine/contract/engine.schema.json
# The engine's open-source notices, which the build adds to the page's
# own (vite-plugins/licences.ts, /app/licences.txt).
COPY engine/licences/NOTICES.txt /repo/engine/licences/NOTICES.txt
RUN npm run types && npx vite build --outDir /web/dist --emptyOutDir

# 25, not the truly-latest 26: spring-boot-maven-plugin 3.5.3's bundled
# JDK 25, the same LTS the app targets (pom.xml's java.version), runs on
# (the eclipse-temurin:25-jre-resolute stage below) and CI tests with. ASM in
# Spring Boot's `repackage` can't parse Java 26+ class files anyway.
FROM maven:4.0.0-rc-7-eclipse-temurin-25-resolute@sha256:9ef706874c56a1aaf1f7ecabca03b51333b6f0792b64bf6a5be48110fa6a3158 AS build
WORKDIR /build
COPY services/gateway/pom.xml .
# Maven's JVM options: Lombok, run inside javac, still reads fields
# through sun.misc.Unsafe, which JDK 24 on warns about unless allowed.
COPY services/gateway/.mvn ./.mvn
# The dependencies into the layer itself (/build/m2), not only into the
# cache mount. A cache mount belongs to the machine that built it and is
# not exported with the layer cache: on a CI runner restoring the layers
# from the registry this step was a hit, the mount was empty, and
# `mvn package` below downloaded every dependency again on each commit.
# The mount stays, as the local download cache for a changed pom.
RUN --mount=type=cache,target=/root/.m2/repository \
    mvn -B -q dependency:go-offline && cp -R /root/.m2/repository /build/m2
# The planner's OpenAPI document, at ../planner from the pom as in the
# repository: the routes the proxy forwards and who may call each, from
# its x-gateway marks (UpstreamRoutes), copied into the jar by pom.xml,
# and the planner's asks and answers PlannerClient sends and reads,
# generated from it (pom.xml's openapi-generator-maven-plugin).
COPY services/planner/openapi.json /planner/openapi.json
# src/main alone: the tests are neither run here (-DskipTests) nor
# wanted in the layer, where an edited test rebuilt the jar.
COPY services/gateway/src/main ./src/main
RUN mvn -B -q package -DskipTests -Dmaven.repo.local=/build/m2
# The jar unpacked into a plain one and its libraries beside it (Spring
# Boot's extract, a layer of files each), which the JVM's own class
# loader reads, rather than run as the one jar of jars Spring Boot's
# nested loader reads. That loader closed a library under a running
# server: at the context's refresh, ClearCachesApplicationListener has
# it close the jar files it keeps open while Tomcat, already
# listening, loads its classes from them on the acceptor's thread. The
# first connection to come in that instant failed with "Zip file
# closed", NioSocketWrapper was then never loadable, and every later
# connection was dropped: the gateway never became healthy (CI run
# 44566705876, shard 1; 3 of 12 cold starts of that image here with a
# client at its port, 0 of 12 of its jar unpacked). Unpacked, no nested jar is open to close, and
# the class-data archive (docker-compose.yml's JAVA_TOOL_OPTIONS) can
# hold the libraries' classes, which it skips in a jar of jars.
RUN java -Djarmode=tools -jar target/*.jar extract --layers --destination extracted \
      --application-filename app.jar

# Ubuntu 26.04 (resolute) named in the tag, as the build stage above, so a
# digest update stays on the release trivy was checked against.
FROM eclipse-temurin:25-jre-resolute@sha256:a0862ac8790c648f6b5db8a113b9990d24fbe8e65f3c4ba8d68b0302d270c1e6
WORKDIR /app
# Libraries first, the application last: a change to the gateway's own
# code changes only the last layer.
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./
COPY --from=web /web/dist ./static/app
ENV APP_STATIC_LOCATION=file:/app/static/app/
# /cds: where the JVM keeps its class-data-sharing archive when
# docker-compose.yml asks for one (-XX:+AutoCreateSharedArchive) -- a
# named volume, so it outlives the container and the next start of the
# same jar skips class loading and verification it already did.
RUN useradd -m appuser && mkdir /cds && chown appuser /cds
USER appuser
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
