#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import sys
import tempfile

import fitz


def extract_header_lines(page, top_ratio=0.15, expanded_top_ratio=0.18):
    page_height = float(page.rect.height or 0)
    if page_height <= 0:
        return []

    boundary = page_height * max(top_ratio, expanded_top_ratio)
    lines = []

    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
      if block.get("type") != 0:
          continue

      for line in block.get("lines", []):
          spans = line.get("spans", [])
          if not spans:
              continue

          text = "".join(span.get("text", "") for span in spans).strip()
          if not text:
              continue

          x0, y0, _, _ = line.get("bbox", (0, 0, 0, 0))
          if y0 > boundary:
              continue

          font_size = max(float(span.get("size", 0) or 0) for span in spans)
          lines.append(
              {
                  "text": text,
                  "x": float(x0),
                  "y": float(y0),
                  "fontSize": font_size,
              }
          )

    lines.sort(key=lambda line: (line["y"], line["x"]))
    return lines[:18]


def extract_pdf(path):
    with fitz.open(path) as document:
        text_parts = []
        links = []

        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            page_text = page.get_text("text") or ""
            if page_text.strip():
                text_parts.append(page_text)

            for link in page.get_links():
                uri = (link or {}).get("uri") or ""
                if uri and uri not in links:
                    links.append(uri)

        header_lines = []
        if document.page_count > 0:
            header_lines = extract_header_lines(document.load_page(0))

        metadata = document.metadata or {}

        return {
            "title": (metadata.get("title") or "").strip(),
            "text": "\n".join(text_parts).strip(),
            "links": links,
            "headerLines": header_lines,
        }


def try_qpdf_repair(input_path):
    qpdf_path = shutil.which("qpdf")
    if not qpdf_path:
        return None

    repair_dir = tempfile.mkdtemp(prefix="records-qpdf-")
    repaired_path = os.path.join(repair_dir, "repaired.pdf")

    try:
        subprocess.run(
            [qpdf_path, input_path, repaired_path],
            check=True,
            capture_output=True,
            text=True,
        )
        return repaired_path
    except subprocess.CalledProcessError:
        shutil.rmtree(repair_dir, ignore_errors=True)
        return None


def build_result(payload=None, **extra):
    result = {
        "title": "",
        "text": "",
        "links": [],
        "headerLines": [],
        "parseStatus": "failed",
        "repairAttempted": False,
        "repaired": False,
        "parseError": "",
    }
    if payload:
        result.update(payload)
    result.update(extra)
    return result


def main():
    if len(sys.argv) != 2:
        sys.stdout.write(json.dumps(build_result(parseError="Missing PDF path argument.")))
        return

    pdf_path = sys.argv[1]

    try:
        extracted = extract_pdf(pdf_path)
        parse_status = "success" if extracted.get("text") else "empty_text"
        sys.stdout.write(
            json.dumps(
                build_result(
                    extracted,
                    parseStatus=parse_status,
                    repairAttempted=False,
                    repaired=False,
                    parseError="",
                )
            )
        )
        return
    except Exception as first_error:
        repaired_path = try_qpdf_repair(pdf_path)
        if not repaired_path:
            sys.stdout.write(
                json.dumps(
                    build_result(
                        parseStatus="failed",
                        repairAttempted=shutil.which("qpdf") is not None,
                        repaired=False,
                        parseError=str(first_error),
                    )
                )
            )
            return

        try:
            extracted = extract_pdf(repaired_path)
            parse_status = "repaired" if extracted.get("text") else "repaired_empty_text"
            sys.stdout.write(
                json.dumps(
                    build_result(
                        extracted,
                        parseStatus=parse_status,
                        repairAttempted=True,
                        repaired=True,
                        parseError="",
                    )
                )
            )
        except Exception as second_error:
            sys.stdout.write(
                json.dumps(
                    build_result(
                        parseStatus="failed",
                        repairAttempted=True,
                        repaired=False,
                        parseError=str(second_error),
                    )
                )
            )
        finally:
            shutil.rmtree(os.path.dirname(repaired_path), ignore_errors=True)


if __name__ == "__main__":
    main()
