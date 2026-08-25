---
name: nedarim-api
description: Reference for the Nedarim Plus (נדרים פלוס) donation/payment API — matara.pro / reports.matara.pro. Covers direct payment-page links, credit card charging (including iframe embedding), credit standing orders (הו"ק אשראי), Bit/instant-transfer/crypto, bank direct-debit (מס"ב), receipts, external income, expenses, donor cards, categories, webhooks, Nedarim Card stored-value cards, Nedarim Phone, matching donations, and forms. Use this skill whenever a task in this repo involves calling, integrating with, or debugging anything related to Nedarim Plus — e.g. building a donation/payment page, a webhook handler for payment notifications, syncing donor or transaction data, issuing receipts, or reconciling Nedarim Plus history against this app's own incomes/checks tables. Trigger this even if the user just says "נדרים פלוס", "Nedarim", "matara.pro", "האייפרם של נדרים", or mentions an API key starting with npk_ — don't wait for an explicit "use the Nedarim skill" request.
---

# Nedarim Plus API

Nedarim Plus is an Israeli donation/payment-processing platform. This skill indexes the full API reference so you can jump straight to the relevant section instead of guessing parameter names — Nedarim Plus's API is large, inconsistent in places (see gotchas below), and getting it wrong means either a failed charge or a silently-wrong webhook.

The complete reference (translated table of contents below) lives in `references/api-reference.md` (~4400 lines, Hebrew). **Don't read the whole file** — `grep` for the relevant Hebrew section heading or parameter name first, then read just that section with an offset/limit, or ask a subagent to extract it. The line numbers below are a starting point; re-grep if the file has been updated.

## Universal rules (apply to every endpoint)

- All calls are HTTPS.
- Dates are `dd/mm/yyyy`.
- Every call needs an institution ID (מזהה מוסד) — the parameter name varies by API family, check the specific endpoint.
- Every call needs an API key (`ApiPassword`, starts with `npk_`) created by the customer at עוד > מפתחות API. The payment-page auth password (`ApiValid`) is shown on the same screen.
- Respect the documented HTTP method: **GET** = query string, **POST** = form body. Most endpoints accept either, but some only support one — check the specific card.
- URL-encode Hebrew and special characters, UTF-8.
- **Response shape is inconsistent**: some actions return JSON, some plain text, and an error can come back as plain text even from a JSON-documented endpoint. Always try to parse JSON first; on parse failure, treat the raw body as an error message.
- An API key can have restricted permissions (set at creation via `AllowedActions`) — a call outside those permissions is rejected even though it's documented here. If something documented here 403s/rejects unexpectedly, check the key's allowed-actions list before assuming the integration code is wrong.
- `AjaxId` (on some endpoints): a unique per-request ID (e.g. `Date.now()`) — a repeat with the same ID is blocked, preventing double-execution from a duplicate submit. Always send it on any endpoint that charges money or issues a document.

## Index — find your section

Each entry is `heading → line number in references/api-reference.md`. Grep the Hebrew heading text to relocate it if line numbers drift.

### כללי (general)
- כללים לכל הפעולות (full rules) → line 21
- קישור מהיר ללקוח ליצירת מפתח API (send the client a link to self-generate an API key) → line 40

### דף תשלום - קישור ישיר (hosted payment page via direct link — no code needed)
- כתובת דף התשלום + כל הפרמטרים (amount, donor fields, payment method, currency, category, redirect-after-success) → line 89

### אשראי (credit card)
- אייפרם: מבוא, הטמעה, פרמטרים, הודעות/אירועים, ביצוע עסקה, הקמת עסקה בצד שרת, אימות תשלום, יצירת טוקן (full iframe embedding flow, for a payment UI inside your own page) → line 207
- הסטוריית עסקאות (transaction history) → line 607
- משיכת סירובים JSON (declined-payment retrieval) → line 669
- ביטול עסקה / זיכוי עסקה / עדכון פרטי עסקה (cancel / refund / update a transaction) → lines 726, 761, 803
- טיפול בעסקה זמנית → line 859
- Callback / Webhook, הגדרת/קריאת כתובת Webhook → line 903 (setup: 1014, read: 1063)
- ייצוא CSV (history, בפורמט עסקים, פורמט APT) → lines 1102–1188

### אשראי הו"ק (credit-card standing orders / recurring donations)
- רשימת הוראות, פרטי הוראה, עריכה, שכפול → line 1189
- קישור לעדכון כרטיס ע"י התורם (let the donor update their own card) → line 1443
- גביית תשלום בודד, מחיקה, הקפאה, הפעלה → lines 1514–1658
- ייצוא CSV (רשימה / עסקים / סירובים) → line 1658+

### ביט / העברה בקליק / קריפטו
- סליקת ביט (Bit) → line 1717
- העברה בקליק (instant bank transfer) → line 1780
- מטבע דיגיטלי / קריפטו → line 1859

### בנקאי (bank direct-debit, מס"ב)
- יצירת/עריכת/מחיקת/שחזור הוראה → line 1927
- רשימת הוראות, הסטוריית חיובים, יומן הוראה → lines 2107–2352
- סימון חזרה בנקאית / ביטול סימון (mark/unmark a bounced direct debit) → line 2191
- גביית תשלום בודד, ביטול תשלום בודד, הקפאה, הפעלה → line 2352+
- שידור ידני מסלול א' / שידור קובץ מס"ב חיצוני (submit the direct-debit batch file to the bank) → line 2643
- ייצוא CSV → line 2603+

### קבלות (receipts)
- הפקת קבלה — עסקת אשראי / הו"ק אשראי מרוכזת / הו"ק בנקאית מרוכזת / הכנסה חיצונית / לפי תורם → line 2753
- קבלות ממתינות להפקה, קישור לצפייה, ביטול קבלה → line 2914+

### הכנסות חיצוניות (external income not processed through Nedarim itself)
- הוספה / עריכה / מחיקה → line 3011

### הוצאות (expenses — Nedarim also has its own expense-tracking module)
- רשימת הוצאות, שמירה, עדכון סטטוס תשלום, מחיקה → line 3071
- ניהול קטגוריות / ספקים / אמצעי תשלום / הוצאות קבועות / קבצים מצורפים → line 3287+

### ניהול תורמים (donor management)
- הקמת/עריכת כרטיס תורם, ייצוא CSV → line 3507

### ניהול קטגוריות (donation categories)
- רשימה, הוספה/עריכה, מחיקה → line 3638

### הודעות לגבאי (notifications to the gabbai/admin)
- הסטוריית הודעות → line 3771

### נדרים קארד (Nedarim Card — magnetic stored-value card, e.g. for a shul/store network)
- משפחות, כרטיס משפחה, שיוך כרטיס מגנטי, טעינה/פריקה, חנויות, ביצוע/בירור/ביטול עסקה בחנות → line 3807

### נדרים פון
- ייצוא CSV דוח שיחות → line 4283

### מצ'ינג (matching donations)
- הוספת תרומות אופליין, ייצוא CSV → line 4306

### טפסים (forms)
- רשומות שנשלחו בטופס → line 4379

## Working with this reference

- If you're implementing a specific flow (e.g. "charge a card via iframe" or "handle the payment webhook"), read the whole relevant `##`/`###` block from `references/api-reference.md` in one go — sections are self-contained with the endpoint URL, method, full parameter table, and worked examples.
- Every parameter table marks required fields with **(חובה)** — don't guess at what's optional.
- When something the doc doesn't cover comes up (a new field in a real response, an undocumented status code), say so explicitly rather than inventing a parameter name — this is financial/payment data and a wrong guess here means a real failed or duplicate charge.
- If this project's own database schema needs to store or reconcile Nedarim Plus data (e.g. matching an incoming webhook to a local `incomes` row), check the existing schema/conventions in this repo first — don't assume Nedarim Plus's field names map 1:1 onto this app's column names.
