FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY .npmrc ./
COPY dest ./

RUN npm ci --omit=dev && rm .npmrc

ENV PORT=80
EXPOSE 80

CMD ["npm", "run", "docker:start"]
