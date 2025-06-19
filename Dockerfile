FROM node:18
WORKDIR /opt/render/project/src
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y ffmpeg
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
