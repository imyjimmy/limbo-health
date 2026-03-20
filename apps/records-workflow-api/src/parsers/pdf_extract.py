#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import sys
import tempfile

import fitz

CHECKBOX_GLYPHS = {"q", "o", "☐", "☑", "☒", "□", "◯", "○"}


def bbox_to_pdf_coords(page, bbox):
    x0, y0, x1, y1 = bbox
    width = max(float(x1 - x0), 0.0)
    height = max(float(y1 - y0), 0.0)
    page_height = float(page.rect.height or 0)
    return {
        "x": float(x0),
        "y": max(page_height - float(y1), 0.0),
        "width": width,
        "height": height,
    }


def point_to_pdf_coords(page, point):
    page_height = float(page.rect.height or 0)
    return {
        "x": float(point.x),
        "y": max(page_height - float(point.y), 0.0),
    }


def rect_to_pdf_coords(page, rect):
    return bbox_to_pdf_coords(page, (rect.x0, rect.y0, rect.x1, rect.y1))


def extract_words(page):
    words = []
    for word in page.get_text("words") or []:
        x0, y0, x1, y1, text, *_rest = word
        cleaned = (text or "").strip()
        if not cleaned:
            continue

        words.append(
            {
                "text": cleaned,
                **bbox_to_pdf_coords(page, (x0, y0, x1, y1)),
            }
        )

    return words


def extract_mark_candidates(words):
    return [
        {
            **word,
            "shape": "checkbox_glyph",
        }
        for word in words
        if word.get("text") in CHECKBOX_GLYPHS
    ]


def extract_widgets(page):
    widgets = []
    for widget in page.widgets() or []:
        rect = getattr(widget, "rect", None)
        field_name = (getattr(widget, "field_name", "") or "").strip()
        if rect is None or not field_name:
            continue

        widgets.append(
            {
                "fieldName": field_name,
                "fieldLabel": (getattr(widget, "field_label", "") or "").strip() or None,
                "fieldType": (getattr(widget, "field_type_string", "") or "").strip() or None,
                "fieldValue": getattr(widget, "field_value", None),
                "choiceValues": list(getattr(widget, "choice_values", []) or []),
                **rect_to_pdf_coords(page, rect),
            }
        )

    return widgets


def extract_drawings(page):
    line_candidates = []
    checkbox_candidates = []

    for drawing in page.get_drawings() or []:
        for item in drawing.get("items", []):
            if not item:
                continue

            operator = item[0]

            if operator == "l" and len(item) >= 3:
                start = point_to_pdf_coords(page, item[1])
                end = point_to_pdf_coords(page, item[2])
                dx = abs(end["x"] - start["x"])
                dy = abs(end["y"] - start["y"])
                if dx >= 20 and dy <= 2:
                    line_candidates.append(
                        {
                            "shape": "line",
                            "orientation": "horizontal",
                            "x": min(start["x"], end["x"]),
                            "y": min(start["y"], end["y"]),
                            "width": dx,
                            "height": dy,
                        }
                    )
                elif dy >= 20 and dx <= 2:
                    line_candidates.append(
                        {
                            "shape": "line",
                            "orientation": "vertical",
                            "x": min(start["x"], end["x"]),
                            "y": min(start["y"], end["y"]),
                            "width": dx,
                            "height": dy,
                        }
                    )
            elif operator == "re" and len(item) >= 2:
                rect = item[1]
                candidate = {
                    **rect_to_pdf_coords(page, rect),
                    "shape": "rectangle",
                }
                line_candidates.append(candidate)
                width = candidate["width"]
                height = candidate["height"]
                if 6 <= width <= 18 and 6 <= height <= 18:
                    checkbox_candidates.append(
                        {
                            **candidate,
                            "shape": "checkbox_rect",
                        }
                    )

    return line_candidates, checkbox_candidates


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
        pages = []

        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            page_text = page.get_text("text") or ""
            if page_text.strip():
                text_parts.append(page_text)

            for link in page.get_links():
                uri = (link or {}).get("uri") or ""
                if uri and uri not in links:
                    links.append(uri)

            words = extract_words(page)
            line_candidates, checkbox_candidates = extract_drawings(page)
            pages.append(
                {
                    "pageIndex": page_index,
                    "width": float(page.rect.width or 0),
                    "height": float(page.rect.height or 0),
                    "words": words,
                    "widgets": extract_widgets(page),
                    "lineCandidates": line_candidates,
                    "checkboxCandidates": [
                        *checkbox_candidates,
                        *extract_mark_candidates(words),
                    ],
                }
            )

        header_lines = []
        if document.page_count > 0:
            header_lines = extract_header_lines(document.load_page(0))

        metadata = document.metadata or {}

        return {
            "title": (metadata.get("title") or "").strip(),
            "text": "\n".join(text_parts).strip(),
            "links": links,
            "headerLines": header_lines,
            "pages": pages,
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
        "pages": [],
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
