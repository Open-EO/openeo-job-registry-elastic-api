# dev build
FROM node:18-alpine AS builder
LABEL stage=builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
COPY . .

RUN npm run build



# prod build
FROM node:18-alpine
ARG NODE_ENV=prod
ENV NODE_ENV=${NODE_ENV}
WORKDIR /usr/src/app

#COPY .npmrc ./
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
