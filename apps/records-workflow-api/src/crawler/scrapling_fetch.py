#!/usr/bin/env python3

import base64
import json
import sys

from scrapling import Fetcher


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Missing URL argument.\n")
        sys.exit(1)

    url = sys.argv[1]

    response = Fetcher().get(url)
    body = response.body or b""
    headers = {}
    for key, value in (response.headers or {}).items():
        headers[str(key).lower()] = str(value)

    payload = {
        "status": int(getattr(response, "status", 0) or 0),
        "finalUrl": getattr(response, "url", url) or url,
        "headers": headers,
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }

    sys.stdout.write(json.dumps(payload))


if __name__ == "__main__":
    main()
