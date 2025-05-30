# 1. Node.js Basisimage
FROM node:20-alpine

# 2. Arbeitsverzeichnis im Container
WORKDIR /app

# 3. Dateien ins Image kopieren
COPY . .

# 4. http-server installieren
RUN npm install -g http-server

# 5. Port freigeben
EXPOSE 8080

# 6. Startbefehl für Container
CMD ["http-server", ".", "-p", "8080"]
