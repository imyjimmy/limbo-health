FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-spa \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/records-workflow-python
ENV PATH="/opt/records-workflow-python/bin:${PATH}"

COPY apps/records-workflow-api/package*.json ./
RUN npm ci

COPY apps/records-workflow-api/ ./

RUN python -m pip install --upgrade pip \
  && python -m pip install --no-cache-dir -r python-requirements.txt

# Make the container-wide python entrypoints execute the venv-backed interpreter.
RUN printf '%s\n' '#!/bin/sh' 'exec /opt/records-workflow-python/bin/python "$@"' > /usr/local/bin/python \
  && chmod +x /usr/local/bin/python \
  && printf '%s\n' '#!/bin/sh' 'exec /opt/records-workflow-python/bin/python "$@"' > /usr/local/bin/python3 \
  && chmod +x /usr/local/bin/python3

ENV PORT=3020
EXPOSE 3020

CMD ["npm", "run", "start"]
