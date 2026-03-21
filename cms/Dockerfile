###############################
# Builder Stage
###############################
ARG DIRECTUS_VERSION=11.6.1
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends bash python3 make g++ ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY ./package.json ./

RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build-extensions


###############################
# Final Stage
###############################
FROM directus/directus:${DIRECTUS_VERSION}

WORKDIR /directus

USER root

RUN apk add --no-cache curl

# Copy built extensions from builder (adjust if your build output goes elsewhere)
COPY --from=builder --chown=node:node /app/extensions /directus/extensions

# Copy templates and start scripts
COPY ./templates /directus/templates
COPY ./scripts/start.sh /directus/start.sh
COPY ./scripts/start.bat /directus/start.bat

RUN chmod +x /directus/start.sh

USER node

CMD ["sh", "/directus/start.sh"]
