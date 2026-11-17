"""Browser checks for the applicant website against a running Core (and the departments behind it).

Set DASHBOARD_URL (default http://localhost:3004), CORE_URL (default http://localhost:8000) and CORE_REQUESTER_TOKEN
(the Scholarship requester credential, used here only to create launch links like the scholarship portal does).
Core should run with OTP_DEMO_DISCLOSURE=enabled so the page shows the demonstration code.
Set BROWSER_CHANNEL=msedge to use an installed Microsoft Edge instead of a downloaded Chromium.
"""
import os
import re
import secrets

import httpx
import pytest
from playwright.sync_api import expect, sync_playwright

SITE = os.getenv("DASHBOARD_URL", "http://localhost:3004").rstrip("/")
CORE = os.getenv("CORE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.getenv("CORE_REQUESTER_TOKEN", "")
EVIDENCE = [{"provider_id": "revenue", "evidence_categories": ["income", "caste"]},
            {"provider_id": "examination", "evidence_categories": ["marks"]},
            {"provider_id": "university", "evidence_categories": ["enrolment", "bonafide"]}]
PROVIDERS = ("revenue", "examination", "university")

pytestmark = pytest.mark.skipif(not TOKEN, reason="CORE_REQUESTER_TOKEN is not set")


def launch(student="MHSTU0001"):
    """Create a verification request as the scholarship portal's server would and return (transaction, link)."""
    response = httpx.post(f"{CORE}/v1/verification-requests", timeout=20, headers={
        "Authorization": f"Bearer {TOKEN}", "Idempotency-Key": secrets.token_hex(8)}, json={
        "service_id": "DEMO-PMS", "application_reference": "APP-" + secrets.token_hex(3), "applicant_reference": student,
        "applicant_mobile": "900000000" + student[-1], "purpose": "SCHOLARSHIP_VERIFICATION", "requested_evidence": EVIDENCE})
    response.raise_for_status()
    body = response.json()
    return body["transaction_reference"], f"{SITE}/start?ref={body['launch_reference']}"


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as driver:
        browser = driver.chromium.launch(channel=os.getenv("BROWSER_CHANNEL") or None)
        yield browser
        browser.close()


@pytest.fixture()
def page(browser):
    context = browser.new_context()
    page = context.new_page()
    page.set_default_timeout(15000)
    yield page
    context.close()


def card(page, provider):
    return page.locator(f"article[data-provider={provider}]")


def verify_department(page, provider, wrong_first=False):
    """Click Verify, read the demonstration code from the page, confirm it and wait for the records."""
    article = card(page, provider)
    article.get_by_role("button", name="Verify", exact=True).click()
    code = article.locator(".demo-code strong")
    expect(code).to_be_visible()
    if wrong_first:
        article.get_by_label("Six-digit code").fill("000000" if code.inner_text() != "000000" else "111111")
        article.get_by_role("button", name="Confirm").click()
        expect(article.get_by_role("alert")).to_contain_text("not correct")
    article.get_by_label("Six-digit code").fill(code.inner_text())
    article.get_by_role("button", name="Confirm").click()
    expect(article).to_have_attribute("data-status", "COMPLETED")


def run_through(page, student, providers=PROVIDERS):
    transaction, link = launch(student)
    page.goto(link)
    expect(page).to_have_url(f"{SITE}/verify")
    for provider in providers:
        verify_department(page, provider)
    page.get_by_role("button", name=re.compile("^Finish")).click()
    return transaction


def test_launch_sets_a_protected_session_and_hides_the_reference(page):
    _, link = launch()
    page.goto(link)
    expect(page).to_have_url(f"{SITE}/verify")
    assert "ref=" not in page.url
    expect(page.get_by_role("heading", name="Verify your records for Demo post-matric scholarship")).to_be_visible()
    expect(page.get_by_text("90•••••001").first).to_be_visible()
    for provider, name in zip(PROVIDERS, ("Revenue Department", "Examination Department", "University")):
        expect(card(page, provider).get_by_role("heading", name=name)).to_be_visible()
        expect(card(page, provider).get_by_role("button", name="Verify", exact=True)).to_be_visible()
    cookie = next(c for c in page.context.cookies() if c["name"] == "ms_session")
    assert cookie["httpOnly"] and cookie["sameSite"] == "Lax"
    assert page.evaluate("document.cookie") == ""  # script cannot read the session
    assert "ms_session" not in page.content()


def test_verified_student_returns_to_the_service_without_an_sms(page):
    transaction = run_through(page, "MHSTU0001")
    expect(page.get_by_role("heading", name="Verified", exact=True)).to_be_visible()
    expect(page.get_by_text("Passed checks (8)")).to_be_visible()
    expect(page.get_by_text("We sent an SMS")).to_have_count(0)
    link = page.get_by_role("link", name="Return to Demo post-matric scholarship")
    assert link.get_attribute("href").endswith("/verification/return?ref=" + transaction)
    page.reload()  # a reload shows the same result and does not repeat anything
    expect(page.get_by_role("heading", name="Verified", exact=True)).to_be_visible()


@pytest.mark.parametrize("student,state,title,reasons", [
    ("MHSTU0002", "FAILED_CHECK", "Not verified", ["Annual income is above the limit for this scheme."]),
    ("MHSTU0003", "FAILED_CHECK", "Not verified", ["Income certificate has expired.", "Caste certificate has expired."]),
    ("MHSTU0004", "INSUFFICIENT_DATA", "Not enough information", ["No SSC result was found at the Examination Department."]),
    ("MHSTU0005", "PARTIAL", "Partly verified", ["Enrolment is still pending.", "No bonafide certificate was found at the University."]),
])
def test_unsuccessful_results_show_reasons_and_the_sms(page, student, state, title, reasons):
    transaction = run_through(page, student)
    heading = page.get_by_role("heading", name=title, exact=True)
    expect(heading).to_be_visible()
    expect(page.locator("h1")).to_have_attribute("data-state", state)
    for reason in reasons:
        expect(page.get_by_text(reason).first).to_be_visible()
    expect(page.get_by_text("We sent an SMS with these reasons")).to_be_visible()
    page.get_by_role("link", name="See it in the demo SMS inbox").click()
    expect(page).to_have_url(f"{SITE}/messages?tx={transaction}")
    sms = page.locator('[data-kind="VERIFICATION_RESULT"]')
    expect(sms).to_have_count(1)
    for reason in reasons:
        expect(sms).to_contain_text(reason)
    assert page.locator('[data-kind="OTP"]').count() == 3


def test_wrong_codes_are_explained_and_exhausted_codes_can_be_replaced(page):
    _, link = launch()
    page.goto(link)
    article = card(page, "revenue")
    article.get_by_role("button", name="Verify", exact=True).click()
    expect(article.locator(".demo-code strong")).to_be_visible()
    code = article.locator(".demo-code strong").inner_text()
    wrong = "000000" if code != "000000" else "111111"
    for attempts_left in ("2 attempt", "1 attempt"):
        article.get_by_label("Six-digit code").fill(wrong)
        article.get_by_role("button", name="Confirm").click()
        expect(article.get_by_role("alert")).to_contain_text(attempts_left)
    article.get_by_label("Six-digit code").fill(wrong)
    article.get_by_role("button", name="Confirm").click()
    expect(article.get_by_role("alert")).to_contain_text("Too many wrong codes")
    article.get_by_role("button", name="Send a new code").click()
    expect(article.locator(".demo-code strong")).not_to_have_text(code)
    article.get_by_label("Six-digit code").fill(article.locator(".demo-code strong").inner_text())
    article.get_by_role("button", name="Confirm").click()
    expect(article).to_have_attribute("data-status", "COMPLETED")


def test_permission_can_be_withdrawn_and_given_again(page):
    _, link = launch()
    page.goto(link)
    verify_department(page, "revenue", wrong_first=True)
    card(page, "revenue").get_by_role("button", name="Withdraw permission").click()
    expect(card(page, "revenue")).to_have_attribute("data-status", "DECLINED")
    card(page, "revenue").get_by_role("button", name="Verify again").click()
    expect(card(page, "revenue").locator(".demo-code strong")).to_be_visible()


def test_finishing_early_asks_for_confirmation_and_counts_missing_evidence(page):
    _, link = launch("MHSTU0001")
    page.goto(link)
    verify_department(page, "revenue")
    page.get_by_role("button", name=re.compile("^Finish")).click()
    expect(page.get_by_role("group", name="Confirm finishing")).to_contain_text("Examination Department, University have not been verified")
    page.get_by_role("button", name="Go back").click()
    expect(page.get_by_role("group", name="Confirm finishing")).to_have_count(0)
    page.get_by_role("button", name=re.compile("^Finish")).click()
    page.get_by_role("button", name="Finish anyway").click()
    expect(page.locator("h1")).to_have_attribute("data-state", "INSUFFICIENT_DATA")


def test_nothing_authorized_is_reported_as_nothing_verified(page):
    _, link = launch()
    page.goto(link)
    page.get_by_role("button", name=re.compile("^Finish")).click()
    page.get_by_role("button", name="Finish anyway").click()
    expect(page.get_by_role("heading", name="Nothing was verified", exact=True)).to_be_visible()
    expect(page.get_by_text("No department was authorized, so nothing could be verified.").first).to_be_visible()


@pytest.mark.parametrize("url,title", [
    (f"{SITE}/start?ref=short", "This link is not valid"),
    (f"{SITE}/start?ref=" + "A" * 43, "This link is not valid"),
    (f"{SITE}/verify", "Your session has ended"),
    (f"{SITE}/result", "Your session has ended"),
])
def test_bad_links_and_missing_sessions_get_a_clear_page(page, url, title):
    page.goto(url)
    expect(page.get_by_role("heading", name=title)).to_be_visible()
    assert "/problem" in page.url


def test_browser_endpoint_refuses_cross_site_and_unauthenticated_use(page, browser):
    _, link = launch()
    page.goto(link)
    api = page.request
    assert api.get(f"{SITE}/api/core/overview").status == 200
    assert api.post(f"{SITE}/api/core/complete").status == 403  # no X-Requested-With
    assert api.post(f"{SITE}/api/core/complete", headers={"X-Requested-With": "mahasetu", "Origin": "https://evil.example"}).status == 403
    assert api.post(f"{SITE}/api/core/departments/revenue/otp/verify", headers={"X-Requested-With": "mahasetu"},
                    data={"challenge_reference": "x", "code": "1"}).status == 400
    assert api.get(f"{SITE}/api/core/anything/else").status == 404
    assert api.post(f"{SITE}/api/core/departments/bad_id/otp", headers={"X-Requested-With": "mahasetu"}).status == 404
    fresh = browser.new_context()
    try:
        assert fresh.request.get(f"{SITE}/api/core/overview").status == 401
    finally:
        fresh.close()
    headers = page.request.get(f"{SITE}/verify").headers
    assert headers["referrer-policy"] == "no-referrer" and headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["content-security-policy"] and headers["cache-control"] == "no-store"


def test_mobile_layout_has_no_horizontal_scroll(browser):
    context = browser.new_context(viewport={"width": 375, "height": 800})
    page = context.new_page()
    page.set_default_timeout(15000)
    try:
        _, link = launch("MHSTU0002")
        page.goto(link)
        card(page, "revenue").get_by_role("button", name="Verify", exact=True).click()
        expect(card(page, "revenue").locator(".demo-code strong")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.goto(f"{SITE}/messages")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    finally:
        context.close()


def test_health(page):
    assert page.request.get(f"{SITE}/health").json() == {"site": "mahasetu-dashboard", "status": "ready"}
