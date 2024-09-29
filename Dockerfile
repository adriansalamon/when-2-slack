FROM node:lts as build-image
RUN apt-get -qy update && apt-get -qy install openssl

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
COPY ./src src
COPY ./prisma prisma
COPY ./start.sh .

RUN npm ci
RUN npm run build


FROM node:lts-slim
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app
ENV NODE_ENV production

COPY --from=build-image ./usr/src/app/package.json ./
COPY --from=build-image ./usr/src/app/package-lock.json ./
COPY --from=build-image ./usr/src/app/dist ./dist
COPY --from=build-image ./usr/src/app/prisma ./prisma
COPY --from=build-image ./usr/src/app/start.sh .

RUN npm ci --only=production
RUN chmod +x ./start.sh
EXPOSE 8080

ENTRYPOINT [ "./start.sh" ]