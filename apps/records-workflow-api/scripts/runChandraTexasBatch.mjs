import fs from 'node:fs/promises';
import path from 'node:path';
import { rerunSourceDocumentParse } from '../src/services/pipeline/humanRescueService.js';
import { reextractQuestionReview } from '../src/services/questionReviewService.js';

const DOCS = [
  {
    system: 'Baptist Health System (San Antonio)',
    id: '16eb147a-dcac-4f2a-9848-6d8d1e33a470',
    title: 'Download Form',
  },
  {
    system: 'Baylor Scott & White Health',
    id: '88e55acf-1b2f-48d1-8cff-af5272aeae4f',
    title: 'Authorization for release of information to BSWH (espanol)',
  },
  {
    system: 'Baylor Scott & White Health',
    id: '6da8fce8-095a-46b4-ad0a-c6b02025ff55',
    title: 'Authorization for release of information to BSWH',
  },
  {
    system: 'Baylor Scott & White Health',
    id: '9663b285-a44e-41be-ada5-0323fe551e2b',
    title: 'Authorization for release of information form BSWH (espanol)',
  },
  {
    system: 'Baylor Scott & White Health',
    id: '46b41eda-c55d-4217-853a-bb70220602ab',
    title: 'Authorization of release of information from BSWH',
  },
  {
    system: "CHI St. Luke's Health",
    id: '565e4f51-217c-4379-9639-dd7823eba60b',
    title: 'Authorization for Use or Disclosure of/Access to Protected Health Information',
  },
  {
    system: 'CHRISTUS Health',
    id: '4feddf51-e15a-49b7-9e21-2932859e6218',
    title: 'Authorization for Disclosure of Protected Health Information form',
  },
  {
    system: 'CHRISTUS Health',
    id: 'c0684c38-cdc6-4148-99b8-f566f19b5e51',
    title: 'Patient Request form',
  },
  {
    system: 'CHRISTUS Health',
    id: '0d7c99d8-3da7-45cd-8115-0240545c959c',
    title: 'Patient Identification',
  },
  {
    system: 'CHRISTUS Health',
    id: '834504a1-b33e-422b-a0c2-2e6da1821d3e',
    title: 'Patient Identification',
  },
  {
    system: 'CHRISTUS Health',
    id: '0ff377e6-d5ce-4808-8770-7cef677cf3e4',
    title: '11644',
  },
  {
    system: "Cook Children's",
    id: '0e7834ea-74a3-4ce8-b1f6-e5ce2e32afd3',
    title: 'Formulario de autorizacion',
  },
  {
    system: "Cook Children's",
    id: 'be9e5088-f1eb-487b-8dca-8a7386a3a854',
    title: 'Authorization form',
  },
  {
    system: 'HCA Gulf Coast Division (HCA Houston Healthcare)',
    id: 'fd0c636d-17b4-4bc6-abe8-9abda544ecc0',
    title: 'Authorization for Release of PHI-Spanish (Protected Health Information)',
  },
  {
    system: 'HCA Gulf Coast Division (HCA Houston Healthcare)',
    id: '6b3ece24-42a8-4bcf-93b6-c04d291bc9c9',
    title: 'Authorization for Release of PHI (Protected Health Information)',
  },
  {
    system: 'Harris Health',
    id: '51538362-2520-42f4-9995-da4550326289',
    title: 'Authorization for Use, Request, and Disclosure of Protected Health Information form',
  },
];

function summarizeQuestionMappings(questionMappings = []) {
  return questionMappings.reduce(
    (summary, entry) => {
      const bindings = Array.isArray(entry?.bindings) ? entry.bindings.length : 0;
      summary.binding_count += bindings;
      return summary;
    },
    { binding_count: 0 },
  );
}

async function main() {
  const requestedIds = new Set(
    String(process.env.SOURCE_DOCUMENT_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const docs =
    requestedIds.size > 0
      ? DOCS.filter((doc) => requestedIds.has(doc.id))
      : DOCS;
  const results = [];

  for (const doc of docs) {
    const row = {
      system: doc.system,
      source_document_id: doc.id,
      title: doc.title,
    };

    try {
      console.log(`PARSE_START ${doc.system} :: ${doc.title}`);
      const parse = await rerunSourceDocumentParse(doc.id);
      row.parse = {
        stage_status: parse.stage_status,
        parsed_documents: parse.parsed_documents,
        failed: parse.failed,
        details: parse.details,
      };
      console.log(`PARSE_DONE ${doc.system} :: ${doc.title} :: ${parse.stage_status}`);
    } catch (error) {
      row.parse_error = error instanceof Error ? error.message : String(error);
      console.log(`PARSE_FAIL ${doc.system} :: ${doc.title} :: ${row.parse_error}`);
      results.push(row);
      continue;
    }

    try {
      console.log(`QUESTION_START ${doc.system} :: ${doc.title}`);
      const review = await reextractQuestionReview(doc.id, {
        replaceDraft: true,
      });
      const draft = review.current_draft || null;
      row.question = {
        supported: draft?.supported ?? null,
        confidence: draft?.confidence ?? null,
        question_count: Array.isArray(draft?.questions) ? draft.questions.length : 0,
        ...summarizeQuestionMappings(draft?.question_mappings || []),
      };
      console.log(
        `QUESTION_DONE ${doc.system} :: ${doc.title} :: q=${row.question.question_count} bindings=${row.question.binding_count}`,
      );
    } catch (error) {
      row.question_error = error instanceof Error ? error.message : String(error);
      console.log(`QUESTION_FAIL ${doc.system} :: ${doc.title} :: ${row.question_error}`);
    }

    results.push(row);
  }

  const outputPath = path.join('/app', 'storage', 'chandra-tx-batch-results.json');
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`RESULTS_WRITTEN ${outputPath}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
