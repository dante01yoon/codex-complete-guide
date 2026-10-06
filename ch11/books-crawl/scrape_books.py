"""Collect book listings from pages 1–3 into books.csv (standard library only)."""

import csv
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen


RATINGS = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}
OUTPUT = Path(__file__).resolve().with_name("books.csv")


class BookParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.books = []
        self.book = None
        self.in_heading = False
        self.field = None
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "article" and "product_pod" in classes:
            self.book = {}
        if self.book is None:
            return
        if tag == "h3":
            self.in_heading = True
        elif tag == "a" and self.in_heading:
            self.book["title"] = attrs.get("title", "").strip()
        elif tag == "p":
            if "star-rating" in classes:
                self.book["rating"] = next(
                    (RATINGS[name] for name in classes if name in RATINGS), None
                )
            elif "price_color" in classes:
                self.field, self.parts = "price", []
            elif "availability" in classes:
                self.field, self.parts = "stock", []

    def handle_data(self, data):
        if self.field is not None:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if self.book is None:
            return
        if tag == "h3":
            self.in_heading = False
        elif tag == "p" and self.field is not None:
            self.book[self.field] = " ".join("".join(self.parts).split())
            self.field, self.parts = None, []
        elif tag == "article":
            if not all(self.book.get(key) for key in ("title", "price", "stock", "rating")):
                raise ValueError(f"Missing book data: {self.book!r}")
            self.books.append(self.book)
            self.book = None


def main():
    books = []
    for page in range(1, 4):
        if page > 1:
            time.sleep(1)
        url = f"https://books.toscrape.com/catalogue/page-{page}.html"
        request = Request(url, headers={"User-Agent": "BooksLearningScraper/1.0"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8")
        parser = BookParser()
        parser.feed(html)
        parser.close()
        if len(parser.books) != 20:
            raise ValueError(f"Page {page}: expected 20 books, got {len(parser.books)}")
        books.extend(parser.books)
        print(f"Page {page}: {len(parser.books)} books")

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["title", "price", "stock", "rating"])
        writer.writeheader()
        writer.writerows(books)
    print(f"Saved {len(books)} books to {OUTPUT}")


if __name__ == "__main__":
    main()
