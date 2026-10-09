ARG PARENT_VERSION=3.0.5-node24.14.1
ARG PORT=3000

FROM defradigital/node-development:${PARENT_VERSION} AS development
ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node-development:${PARENT_VERSION}

ARG PORT
ENV PORT=${PORT}

COPY --chown=node:node package.json package-lock.json .npmrc ./
# --ignore-scripts blocks preinstall/install/postinstall/prepare for this package and
# every dependency (belt-and-braces with .npmrc's ignore-scripts=true) — the mechanism
# behind npm supply-chain worms (e.g. Shai-Hulud) that execute code at install time.
# min-release-age collides with the git-dependency prepare step npm always attempts for
# bng-library (npm/cli#9005), same as bng-metric-backend's Dockerfile workaround.
RUN sed -i '/^min-release-age=/d' .npmrc && npm ci --ignore-scripts
COPY --chown=node:node ./app ./app

CMD [ "npm", "run", "dev" ]

FROM defradigital/node:${PARENT_VERSION} AS production
ARG PARENT_VERSION
LABEL uk.gov.defra.ffc.parent-image=defradigital/node:${PARENT_VERSION}

# curl: CDP platform healthcheck requirement.
# git: required by npm to fetch the bng-library GitHub dependency.
USER root
RUN apk add --no-cache curl git
USER node

# CDP takes care of https in the nginx layer, so we don't need to force https in the app
ENV USE_HTTPS=false
ENV NODE_ENV=production

COPY --from=development /home/node/package.json /home/node/package-lock.json /home/node/.npmrc ./
COPY --from=development /home/node/app ./app/

RUN npm ci --omit=dev --ignore-scripts

ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "npm", "start" ]
