from . import docs
from .annot import annotate, comments
from .core import (Locked, extract_images, extract_tables, extract_text, images_deck, info, merge, page_count, pages_zip, parse_pages,
                   render_png, split, tables_xlsx, to_deck)
from .edit import (compress, crop, fill_fields, header_footer, metadata, organize, page_numbers, protect, read_fields, redact, unlock,
                   watermark)
from .search import areas as match_areas
from .search import find

__all__ = ["docs", "Locked", "info", "extract_text", "extract_images", "extract_tables", "merge", "split", "to_deck", "images_deck",
           "page_count", "pages_zip", "parse_pages", "render_png", "tables_xlsx", "annotate", "comments", "organize", "read_fields",
           "fill_fields", "protect", "unlock", "redact", "metadata", "compress", "page_numbers", "header_footer", "watermark", "crop", "find",
           "match_areas"]
