"""Render the first JavaScript quotes page with Playwright and save quotes.csv.

Setup:
    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
    .venv/bin/python -m playwright install chromium
Run:
    .venv/bin/python scrape_quotes.py
"""

import csv
from pathlib import Path

from playwright.sync_api import sync_playwright


URL = "https://quotes.toscrape.com/js/"
OUTPUT = Path(__file__).resolve().with_name("quotes.csv")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            response = page.goto(URL, wait_until="load", timeout=30000)
            if response is None or not response.ok:
                raise RuntimeError("Failed to load the quotes page")
            page.locator(".quote").first.wait_for(state="visible", timeout=15000)
            quotes = []
            for card in page.locator(".quote").all():
                quote = card.locator(".text").inner_text().strip()
                author = card.locator(".author").inner_text().strip()
                if not quote or not author:
                    raise ValueError("Missing quote or author")
                quotes.append({"quote": quote, "author": author})
            if len(quotes) != 10:
                raise ValueError(f"Expected 10 quotes, got {len(quotes)}")
        finally:
            browser.close()

    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["quote", "author"])
        writer.writeheader()
        writer.writerows(quotes)
    print(f"Saved {len(quotes)} quotes to {OUTPUT}")


if __name__ == "__main__":
    main()
