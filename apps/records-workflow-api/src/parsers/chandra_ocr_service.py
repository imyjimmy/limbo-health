#!/usr/bin/env python3

import base64
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from bs4 import BeautifulSoup
from PIL import Image

from chandra.model import InferenceManager
from chandra.model.schema import BatchInputItem

HOST = os.getenv("CHANDRA_OCR_HOST", "127.0.0.1")
PORT = int(os.getenv("CHANDRA_OCR_PORT", "8765"))
METHOD = os.getenv("CHANDRA_OCR_METHOD", "hf").strip().lower() or "hf"
MAX_OUTPUT_TOKENS = max(int(os.getenv("CHANDRA_OCR_MAX_OUTPUT_TOKENS", "3072")), 256)


def normalize_text(value):
    return " ".join((value or "").strip().split())


def extract_block_lines(content_html):
    if not content_html:
        return []
    soup = BeautifulSoup(content_html, "html.parser")
    text = soup.get_text("\n")
    return [
        line
        for line in (normalize_text(part) for part in text.replace("\r", "\n").split("\n"))
        if line
    ]


def serialize_output(output):
    blocks = []
    for chunk in output.chunks or []:
        bbox = chunk.get("bbox") or [0, 0, 0, 0]
        content_html = chunk.get("content") or ""
        lines = extract_block_lines(content_html)
        blocks.append(
            {
                "label": normalize_text(chunk.get("label") or ""),
                "bbox": [int(value) for value in bbox],
                "content_html": content_html,
                "text": "\n".join(lines).strip(),
                "lines": lines,
            }
        )

    return {
        "engine": "chandra-ocr-2",
        "raw_html": output.raw,
        "html": output.html,
        "markdown": output.markdown,
        "token_count": output.token_count,
        "error": bool(output.error),
        "page_box": output.page_box,
        "image_width": output.page_box[2] if len(output.page_box) >= 3 else 0,
        "image_height": output.page_box[3] if len(output.page_box) >= 4 else 0,
        "blocks": blocks,
        "text": "\n\n".join(block["text"] for block in blocks if block["text"]).strip(),
    }


class ChandraOCRHandler(BaseHTTPRequestHandler):
    manager = None
    manager_lock = threading.Lock()

    @classmethod
    def get_manager(cls):
        if cls.manager is None:
            cls.manager = InferenceManager(method=METHOD)
        return cls.manager

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return

        payload = json.dumps(
            {
                "ok": True,
                "method": METHOD,
                "model": os.getenv("MODEL_CHECKPOINT", "datalab-to/chandra-ocr-2"),
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/ocr":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body.decode("utf-8"))
            image_bytes = base64.b64decode(payload["image_base64"])
            prompt_type = normalize_text(payload.get("prompt_type") or "") or "ocr_layout"

            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            manager = self.get_manager()
            with self.manager_lock:
                output = manager.generate(
                    [BatchInputItem(image=image, prompt_type=prompt_type)],
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    include_images=False,
                )[0]
            response_payload = json.dumps(serialize_output(output)).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_payload)))
            self.end_headers()
            self.wfile.write(response_payload)
        except Exception as error:
            response_payload = json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                }
            ).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_payload)))
            self.end_headers()
            self.wfile.write(response_payload)

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), ChandraOCRHandler)
    print(f"Chandra OCR service listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
