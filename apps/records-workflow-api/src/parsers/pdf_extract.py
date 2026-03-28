#!/usr/bin/env python3

import base64
import csv
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

import fitz

CHECKBOX_GLYPHS = {"q", "o", "☐", "☑", "☒", "□", "◯", "○"}
OCR_LANGUAGES = os.getenv("PDF_OCR_LANGUAGES", "eng+spa")
OCR_PAGE_SEGMENTATION_MODE = os.getenv("PDF_OCR_PSM", "6")
OCR_RENDER_SCALE = max(float(os.getenv("PDF_OCR_RENDER_SCALE", "2.5")), 1.0)
OCR_MIN_CONFIDENCE = float(os.getenv("PDF_OCR_MIN_CONFIDENCE", "35"))
CHANDRA_OCR_URL = (os.getenv("CHANDRA_OCR_URL", "") or "").strip()
CHANDRA_OCR_RENDER_SCALE = max(float(os.getenv("CHANDRA_OCR_RENDER_SCALE", "2.0")), 1.0)
CHANDRA_OCR_TIMEOUT_SECONDS = max(float(os.getenv("CHANDRA_OCR_TIMEOUT_SECONDS", "180")), 5.0)
CHANDRA_OCR_PROMPT_TYPE = (
    os.getenv("CHANDRA_OCR_PROMPT_TYPE", "ocr") or "ocr"
).strip()
PDF_OCR_ENGINE = (
    os.getenv("PDF_OCR_ENGINE")
    or ("chandra" if CHANDRA_OCR_URL else "tesseract")
).strip().lower()
HTML_TAG_RE = re.compile(r"<[^>]+>")
HTML_LINE_BREAK_RE = re.compile(r"<\s*(?:br|/p|/div|/li|/tr|/h[1-6])\s*/?>", re.IGNORECASE)


def normalize_word_text(value):
    return " ".join((value or "").strip().split())


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
        cleaned = normalize_word_text(text)
        if not cleaned:
            continue

        words.append(
            {
                "text": cleaned,
                **bbox_to_pdf_coords(page, (x0, y0, x1, y1)),
                "source": "pdf_text",
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
            elif operator == "qu" and len(item) >= 2:
                quad = item[1]
                xs = [point.x for point in quad]
                ys = [point.y for point in quad]
                candidate = bbox_to_pdf_coords(
                    page,
                    (min(xs), min(ys), max(xs), max(ys)),
                )
                candidate["shape"] = "quad"
                width = candidate["width"]
                height = candidate["height"]
                if 6 <= width <= 18 and 6 <= height <= 18:
                    checkbox_candidates.append(
                        {
                            **candidate,
                            "shape": "checkbox_quad",
                        }
                    )

    return line_candidates, checkbox_candidates


def build_word_merge_key(word):
    text = normalize_word_text(word.get("text", "")).lower()
    return (
        text,
        round(float(word.get("x", 0)) / 4.0),
        round(float(word.get("y", 0)) / 4.0),
        round(float(word.get("width", 0)) / 4.0),
        round(float(word.get("height", 0)) / 4.0),
    )


def merge_words(primary_words, secondary_words):
    merged = list(primary_words or [])
    seen = {build_word_merge_key(word) for word in merged}

    for word in secondary_words or []:
        key = build_word_merge_key(word)
        if key in seen:
            continue
        seen.add(key)
        merged.append(word)

    return merged


def build_text_from_words(words):
    if not words:
        return ""

    ordered_words = sorted(
        words,
        key=lambda word: (-float(word.get("y", 0)), float(word.get("x", 0))),
    )
    rows = []
    for word in ordered_words:
        matched_row = None
        for row in rows:
            if abs(row["y"] - float(word.get("y", 0))) <= 4:
                matched_row = row
                break

        if matched_row is None:
            matched_row = {
                "y": float(word.get("y", 0)),
                "words": [],
            }
            rows.append(matched_row)

        matched_row["words"].append(word)

    lines = []
    for row in sorted(rows, key=lambda row: -row["y"]):
        ordered_row_words = sorted(row["words"], key=lambda word: float(word.get("x", 0)))
        text = " ".join(
            normalize_word_text(word.get("text", "")) for word in ordered_row_words
        ).strip()
        if text:
            lines.append(text)

    return "\n".join(lines).strip()


def parse_ocr_confidence(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def render_page_image_for_ocr(page, image_path, scale):
    matrix = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    pixmap.save(image_path)


def render_page_png_bytes(page, scale):
    matrix = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    return pixmap.tobytes("png"), float(pixmap.width or 0), float(pixmap.height or 0)


def image_bbox_to_pdf_coords(page, bbox, image_width, image_height):
    if not bbox or image_width <= 0 or image_height <= 0:
        return {
            "x": 0.0,
            "y": 0.0,
            "width": 0.0,
            "height": 0.0,
        }

    x0, y0, x1, y1 = bbox
    scale_x = float(page.rect.width or 0) / float(image_width)
    scale_y = float(page.rect.height or 0) / float(image_height)
    pdf_x0 = float(x0) * scale_x
    pdf_x1 = float(x1) * scale_x
    pdf_top = float(y0) * scale_y
    pdf_bottom = float(y1) * scale_y

    return bbox_to_pdf_coords(
        page,
        (
            pdf_x0,
            pdf_top,
            pdf_x1,
            pdf_bottom,
        ),
    )


def split_text_into_lines(text):
    if not text:
        return []
    return [
        compacted
        for compacted in (
            normalize_word_text(part)
            for part in text.replace("\r", "\n").split("\n")
        )
        if compacted
    ]


def build_words_from_text_lines(page, lines, bbox):
    if not lines or not bbox:
        return []

    x = float(bbox.get("x", 0))
    y = float(bbox.get("y", 0))
    width = max(float(bbox.get("width", 0)), 1.0)
    height = max(float(bbox.get("height", 0)), 1.0)
    line_height = max(height / max(len(lines), 1), 8.0)
    words = []

    for line_index, line in enumerate(lines):
        tokens = [token for token in normalize_word_text(line).split(" ") if token]
        if not tokens:
            continue

        total_chars = max(sum(len(token) for token in tokens) + max(len(tokens) - 1, 0), 1)
        line_y = y + max(height - (line_index + 1) * line_height, 0)
        cursor = 0

        for token in tokens:
            start_fraction = float(cursor) / float(total_chars)
            end_fraction = float(cursor + len(token)) / float(total_chars)
            token_x = x + width * start_fraction
            token_width = max(width * (end_fraction - start_fraction), 6.0)
            words.append(
                {
                    "text": token,
                    "x": token_x,
                    "y": line_y,
                    "width": token_width,
                    "height": min(line_height, height),
                    "source": "chandra",
                }
            )
            cursor += len(token) + 1

    return words


def html_fragment_to_text_lines(fragment):
    if not fragment:
        return []

    with_breaks = HTML_LINE_BREAK_RE.sub("\n", fragment)
    stripped = HTML_TAG_RE.sub(" ", with_breaks)
    unescaped = html.unescape(stripped)
    return split_text_into_lines(unescaped)


def request_chandra_ocr(page):
    if not CHANDRA_OCR_URL:
        return None

    image_bytes, image_width, image_height = render_page_png_bytes(page, CHANDRA_OCR_RENDER_SCALE)
    payload = json.dumps(
        {
            "image_base64": base64.b64encode(image_bytes).decode("ascii"),
            "prompt_type": CHANDRA_OCR_PROMPT_TYPE,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        CHANDRA_OCR_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=CHANDRA_OCR_TIMEOUT_SECONDS) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "ignore")
        raise RuntimeError(
            f"Chandra OCR request failed with HTTP {error.code}: {detail or error.reason}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Chandra OCR request failed: {error.reason}") from error

    blocks = []
    words = []
    for block in response_payload.get("blocks", []) or []:
        bbox = image_bbox_to_pdf_coords(
            page,
            block.get("bbox") or [0, 0, 0, 0],
            response_payload.get("image_width") or image_width,
            response_payload.get("image_height") or image_height,
        )
        lines = split_text_into_lines(block.get("text", "")) or html_fragment_to_text_lines(
            block.get("content_html", "")
        )
        blocks.append(
            {
                "label": normalize_word_text(block.get("label", "")) or None,
                "text": "\n".join(lines).strip(),
                "lines": lines,
                "contentHtml": block.get("content_html") or "",
                **bbox,
            }
        )
        words.extend(build_words_from_text_lines(page, lines, bbox))

    page_text = response_payload.get("text") or build_text_from_words(words)
    return {
        "blocks": blocks,
        "words": words,
        "text": page_text.strip(),
        "engine": normalize_word_text(response_payload.get("engine", "")) or "chandra",
    }


def extract_ocr_words(page):
    tesseract_path = shutil.which("tesseract")
    if not tesseract_path:
        return []

    with tempfile.TemporaryDirectory(prefix="records-ocr-") as ocr_dir:
        image_path = os.path.join(ocr_dir, f"page-{page.number}.png")
        render_page_image_for_ocr(page, image_path, OCR_RENDER_SCALE)
        completed = subprocess.run(
            [
                tesseract_path,
                image_path,
                "stdout",
                "-l",
                OCR_LANGUAGES,
                "--psm",
                OCR_PAGE_SEGMENTATION_MODE,
                "tsv",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

    words = []
    reader = csv.DictReader(io.StringIO(completed.stdout), delimiter="\t")
    for row in reader:
        cleaned = normalize_word_text(row.get("text", ""))
        if not cleaned:
            continue

        confidence = parse_ocr_confidence(row.get("conf"))
        if confidence is not None and confidence < OCR_MIN_CONFIDENCE:
            continue

        left = float(row.get("left") or 0)
        top = float(row.get("top") or 0)
        width = float(row.get("width") or 0)
        height = float(row.get("height") or 0)
        if width <= 0 or height <= 0:
            continue

        words.append(
            {
                "text": cleaned,
                **bbox_to_pdf_coords(
                    page,
                    (
                        left / OCR_RENDER_SCALE,
                        top / OCR_RENDER_SCALE,
                        (left + width) / OCR_RENDER_SCALE,
                        (top + height) / OCR_RENDER_SCALE,
                    ),
                ),
                "source": "ocr",
                "ocr_confidence": confidence,
            }
        )

    return words


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

            widgets = extract_widgets(page)
            words = extract_words(page)
            ocr_words = []
            ocr_blocks = []
            ocr_engine = None
            if len(widgets) == 0:
                if PDF_OCR_ENGINE == "chandra":
                    chandra_payload = request_chandra_ocr(page)
                    ocr_words = chandra_payload.get("words", []) if chandra_payload else []
                    ocr_blocks = chandra_payload.get("blocks", []) if chandra_payload else []
                    ocr_engine = chandra_payload.get("engine") if chandra_payload else "chandra"
                    if not page_text.strip() and chandra_payload and chandra_payload.get("text"):
                        text_parts.append(chandra_payload["text"])
                elif PDF_OCR_ENGINE == "auto" and CHANDRA_OCR_URL:
                    try:
                        chandra_payload = request_chandra_ocr(page)
                        ocr_words = chandra_payload.get("words", []) if chandra_payload else []
                        ocr_blocks = chandra_payload.get("blocks", []) if chandra_payload else []
                        ocr_engine = chandra_payload.get("engine") if chandra_payload else "chandra"
                        if not page_text.strip() and chandra_payload and chandra_payload.get("text"):
                            text_parts.append(chandra_payload["text"])
                    except Exception:
                        ocr_words = extract_ocr_words(page)
                        ocr_engine = "tesseract"
                else:
                    ocr_words = extract_ocr_words(page)
                    if ocr_words:
                        ocr_engine = "tesseract"

            merged_words = merge_words(words, ocr_words)
            if not page_text.strip() and merged_words and (
                not text_parts or text_parts[-1] != build_text_from_words(merged_words)
            ):
                text_parts.append(build_text_from_words(merged_words))
            line_candidates, checkbox_candidates = extract_drawings(page)
            pages.append(
                {
                    "pageIndex": page_index,
                    "width": float(page.rect.width or 0),
                    "height": float(page.rect.height or 0),
                    "words": merged_words,
                    "ocrWords": ocr_words,
                    "ocrBlocks": ocr_blocks,
                    "ocrEngine": ocr_engine,
                    "widgets": widgets,
                    "lineCandidates": line_candidates,
                    "checkboxCandidates": [
                        *checkbox_candidates,
                        *extract_mark_candidates(merged_words),
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
