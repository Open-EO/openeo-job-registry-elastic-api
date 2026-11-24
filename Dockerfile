FROM flyway/flyway:13.13.0 AS flyway

FROM node:26-bookworm-slim AS builder
LABEL stage=builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:26-bookworm-slim AS elasticsearch
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/src/main.js"]

FROM elasticsearch AS postgresql
COPY --from=flyway /flyway /flyway
COPY --from=flyway /opt/java/openjdk /opt/java/openjdk
COPY --from=builder /usr/src/app/sql ./sql
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/flyway:${JAVA_HOME}/bin:${PATH}"
