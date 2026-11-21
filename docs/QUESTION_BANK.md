# Question bank generation and import

The rebuild has a question database and a server-side import, review and rights workflow (admins import packs; teachers
and admins edit, approve and reject; every action is recorded in the staff-actions log). It does not yet have screens for
that workflow, a PDF-to-question AI provider, or student practice. The old question tables were not defined in the old
repository, so questions enter only through the portable JSON format below.

## Current workflow

1. Prepare a question pack using the version 1 shape below. A later PDF extraction/generation step can produce this
   same format.
2. Run `npm run questions:validate -- path/to/question-pack.json` from the project root.
3. Review every answer, explanation, source page and right to use the source. Keep generated questions in `pending`
   review until a teacher has checked them.
4. An admin imports the pack through `POST /api/admin/question-packs` (there is no import screen yet). Every question
   enters as `pending`, whatever the file says. Only questions that are approved by a teacher **and** have known source
   rights are publishable.

The validator only reads the selected JSON file. It does not send it to a service, write files, call an AI provider or
change the database. It reports structural issues, duplicate references/questions, answer keys that do not match an
option, missing years for past questions, incomplete reviewer details and missing rights evidence. Unknown rights are
allowed for drafts but block readiness for a future import.

## Version 1 example

```json
{
  "schemaVersion": 1,
  "title": "Biology practice draft",
  "sourceDocument": {
    "title": "Biology class notes",
    "rights": "unknown"
  },
  "questions": [
    {
      "referenceId": "page-2-question-1",
      "exam": "jamb",
      "origin": "generated_from_pdf",
      "year": null,
      "subject": "Biology",
      "topic": "Cells",
      "stem": "Which structure controls the activities of a cell?",
      "options": [
        { "label": "A", "text": "Cell wall" },
        { "label": "B", "text": "Nucleus" },
        { "label": "C", "text": "Cytoplasm" },
        { "label": "D", "text": "Vacuole" }
      ],
      "answer": "B",
      "explanation": "The nucleus contains genetic material and controls cell activities.",
      "difficulty": 3,
      "sourcePage": 2,
      "reviewStatus": "pending"
    }
  ]
}
```

For `sourceDocument.rights`, choose `owned`, `permission_granted`, `licensed`, `public_domain`, or `unknown`. When rights
are known, include `rightsEvidence` with the license, permission record or other basis. Each question records its source
page. `origin` is `past_question`, `teacher_authored`, or `generated_from_pdf`; a past question needs its exam year.

The next part of the tool should extract text page by page from selectable-text PDFs. Scanned PDFs need OCR, and question
generation needs an AI provider; those choices remain separate until we can evaluate cost, Nigerian curriculum quality,
privacy and review needs. No generated question should be published without human answer checking.
