import { knowledge } from "./knowledge.js";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* -----------------------------
   STRUCTURED KNOWLEDGE
----------------------------- */

function getRecords(category) {
  const data = knowledge?.[category];

  if (!data) {
    return [];
  }

  if (Array.isArray(data.content)) {
    return data.content;
  }

  return [];
}

function getTeamRecords() {
  return getRecords("team").filter(
    item => item?.type === "team_member"
  );
}

function getMentorRecords() {
  return getRecords("mentors");
}

function getEventRecords() {
  return getRecords("events");
}

function parseDate(dateString) {
  if (!dateString) {
    return 0;
  }

  const parts = String(dateString).split("/");

  if (parts.length !== 3) {
    return 0;
  }

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  const date = new Date(year, month - 1, day);

  return date.getTime();
}

/* -----------------------------
   STRUCTURED QUESTION DETECTION
----------------------------- */

function isMentorListQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("who are the mentors") ||
    q.includes("list all mentors") ||
    q.includes("list the mentors") ||
    q.includes("show all mentors") ||
    q.includes("show the mentors") ||
    q.includes("all mentors") ||
    q.includes("mentor list") ||
    q.includes("mentor network")
  );
}

function isMentorCountQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("how many mentors") ||
    q.includes("number of mentors")
  );
}

function isTeamListQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("who are the team members") ||
    q.includes("who is on the team") ||
    q.includes("who are on the team") ||
    q.includes("list all team members") ||
    q.includes("list the team members") ||
    q.includes("show all team members") ||
    q.includes("show the team members") ||
    q.includes("all team members") ||
    q.includes("core team")
  );
}

function isTeamCountQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("how many team members") ||
    q.includes("how many members are on the team") ||
    q.includes("number of team members")
  );
}

function isLatestEventQuestion(message) {
  const q = normalize(message);

  return (
    q.includes("latest event") ||
    q.includes("latest events") ||
    q.includes("most recent event") ||
    q.includes("recent event") ||
    q.includes("newest event") ||
    q.includes("upcoming event")
  );
}

/* -----------------------------
   STRUCTURED ANSWERS
----------------------------- */

function getMentorListAnswer() {
  const mentors = getMentorRecords();

  if (!mentors.length) {
    return null;
  }

  const lines = mentors.map((mentor, index) => {
    const companyPart =
      mentor.company
        ? `, ${mentor.company}`
        : mentor.organization
        ? `, ${mentor.organization}`
        : "";

    return `${index + 1}. ${mentor.name} - ${mentor.role}${companyPart}`;
  });

  return (
    `MANUUConnect has ${mentors.length} mentors/alumni in the current directory.\n\n` +
    lines.join("\n")
  );
}

function getMentorCountAnswer() {
  const mentors = getMentorRecords();

  if (!mentors.length) {
    return null;
  }

  return `The current mentor directory contains ${mentors.length} mentors/alumni.`;
}

function getTeamListAnswer() {
  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  const lines = team.map((member, index) => {
    return `${index + 1}. ${member.name} - ${member.position}`;
  });

  return (
    `MANUUConnect has ${team.length} current team members.\n\n` +
    lines.join("\n")
  );
}

function getTeamCountAnswer() {
  const team = getTeamRecords();

  if (!team.length) {
    return null;
  }

  return `The current team has ${team.length} members.`;
}

function getLatestEventAnswer() {
  const events = getEventRecords();

  if (!events.length) {
    return null;
  }

  const sorted = [...events].sort(
    (a, b) =>
      parseDate(b.date) - parseDate(a.date)
  );

  const latest = sorted[0];

  return (
    `The latest event in the current knowledge base is "${latest.title}".\n\n` +
    `Date: ${latest.date}\n` +
    `Participants: ${latest.participants}\n` +
    `Speakers: ${latest.speakers.join(", ")}`
  );
}

function getStructuredAnswer(message) {
  if (isMentorListQuestion(message)) {
    return getMentorListAnswer();
  }

  if (isMentorCountQuestion(message)) {
    return getMentorCountAnswer();
  }

  if (isTeamListQuestion(message)) {
    return getTeamListAnswer();
  }

  if (isTeamCountQuestion(message)) {
    return getTeamCountAnswer();
  }

  if (isLatestEventQuestion(message)) {
    return getLatestEventAnswer();
  }

  return null;
}

/* -----------------------------
   KNOWLEDGE → VECTOR RECORDS
----------------------------- */

function buildKnowledgeRecords() {
  const records = [];

  for (const [category, data] of Object.entries(knowledge)) {
    if (!data || typeof data !== "object") {
      continue;
    }

    const categoryType =
      data.type || category;

    const categoryTitle =
      data.title || category;

    const content =
      data.content;

    if (Array.isArray(content)) {
      content.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          return;
        }

        const id =
          item.id ||
          `${category}-${index + 1}`;

        const title =
          item.title ||
          item.name ||
          item.question ||
          categoryTitle;

        const text = [
          `Category: ${category}`,
          `Type: ${item.type || categoryType}`,
          `Title: ${title}`,
          `Keywords: ${(data.keywords || []).join(", ")}`,
          JSON.stringify(item, null, 2)
        ].join("\n");

        records.push({
          id,
          category,
          type: item.type || categoryType,
          title,
          text
        });
      });

      continue;
    }

    const text = [
      `Category: ${category}`,
      `Type: ${categoryType}`,
      `Title: ${categoryTitle}`,
      `Keywords: ${(data.keywords || []).join(", ")}`,
      JSON.stringify(content, null, 2)
    ].join("\n");

    records.push({
      id: data.id || category,
      category,
      type: categoryType,
      title: categoryTitle,
      text
    });
  }

  return records;
}

function splitForEmbedding(text, maxChars = 1800) {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks = [];

  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(
      text.slice(i, i + maxChars)
    );
  }

  return chunks;
}

function buildEmbeddingRecords() {
  const sourceRecords =
    buildKnowledgeRecords();

  const output = [];

  for (const record of sourceRecords) {
    const chunks =
      splitForEmbedding(record.text);

    chunks.forEach((chunk, index) => {
      output.push({
        id:
          chunks.length === 1
            ? record.id
            : `${record.id}-chunk-${index + 1}`,

        category: record.category,
        type: record.type,
        title: record.title,
        text: chunk
      });
    });
  }

  return output;
}

/* -----------------------------
   VECTORIZE INDEXING
----------------------------- */

async function indexKnowledge(env) {
  const records =
    buildEmbeddingRecords();

  if (!records.length) {
    throw new Error(
      "No knowledge records found."
    );
  }

  const texts =
    records.map(record => record.text);

  const embeddings =
    await env.AI.run(
      EMBEDDING_MODEL,
      {
        text: texts
      }
    );

  if (
    !embeddings ||
    !Array.isArray(embeddings.data)
  ) {
    throw new Error(
      "Embedding generation failed."
    );
  }

  const vectors =
    records.map((record, index) => ({
      id: record.id,
      values: embeddings.data[index],
      metadata: {
        category: record.category,
        type: record.type,
        title: record.title,
        text: record.text
      }
    }));

  const batchSize = 50;
  const results = [];

  for (
    let i = 0;
    i < vectors.length;
    i += batchSize
  ) {
    const batch =
      vectors.slice(
        i,
        i + batchSize
      );

    const result =
      await env.VECTORIZE.upsert(batch);

    results.push(result);
  }

  return {
    records: records.length,
    batches: results.length,
    results
  };
}

/* -----------------------------
   VECTOR SEARCH
----------------------------- */

async function searchVectorize(query, env) {
  const embedding =
    await env.AI.run(
      EMBEDDING_MODEL,
      {
        text: [query]
      }
    );

  const queryVector =
    embedding?.data?.[0];

  if (!queryVector) {
    throw new Error(
      "Failed to generate query embedding."
    );
  }

  const result =
    await env.VECTORIZE.query(
      queryVector,
      {
        topK: 8,
        returnMetadata: "all"
      }
    );

  return result?.matches || [];
}

/* -----------------------------
   SERPER FALLBACK
----------------------------- */

async function searchSerper(query, env, site) {
  if (!env.SERPER_API_KEY) {
    return [];
  }

  const searchQuery =
    `site:${site} ${query}`;

  try {
    const response =
      await fetch(
        "https://google.serper.dev/search",
        {
          method: "POST",

          headers: {
            "X-API-KEY":
              env.SERPER_API_KEY,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            q: searchQuery,
            gl: "in",
            hl: "en",
            num: 5
          })
        }
      );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    return (
      data.organic || []
    ).map(item => ({
      title:
        item.title || "",
      link:
        item.link || "",
      snippet:
        item.snippet || ""
    }));

  } catch {
    return [];
  }
}

function formatWebResults(
  results,
  source
) {
  return results
    .map(
      (item, index) =>
        `[${source} ${index + 1}]
Title: ${item.title}
URL: ${item.link}
Snippet: ${item.snippet}`
    )
    .join("\n\n");
}

/* -----------------------------
   GREETINGS
----------------------------- */

function isGreeting(message) {
  const q =
    normalize(message);

  return [
    "hi",
    "hello",
    "hey",
    "hii",
    "hiii",
    "heyy",
    "yo",
    "sup",
    "wassup",
    "what is up",
    "whats up",
    "good morning",
    "good afternoon",
    "good evening",
    "thanks",
    "thank you",
    "ok",
    "okay"
  ].includes(q);
}

function greetingResponse(message) {
  const q =
    normalize(message);

  if (
    q === "thanks" ||
    q === "thank you"
  ) {
    return "You're welcome.";
  }

  return "Hi! 👋 How can I help you with MANUUConnect?";
}

/* -----------------------------
   WORKER
----------------------------- */

export default {
  async fetch(request, env) {

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type"
        }
      });
    }

    if (
      request.method === "GET"
    ) {
      const url =
        new URL(request.url);

      /*
        Temporary indexing endpoint.
      */

      if (
        url.pathname === "/index"
      ) {
        try {
          const result =
            await indexKnowledge(env);

          return jsonResponse({
            status: "indexed",
            ...result
          });

        } catch (error) {
          console.error(
            "Indexing error:",
            error
          );

          return jsonResponse(
            {
              error:
                error.message ||
                "Indexing failed."
            },
            500
          );
        }
      }

      return jsonResponse({
        status: "ok",
        service: "MANUUConnect AI",
        model: MODEL,
        embeddingModel:
          EMBEDDING_MODEL
      });
    }

    if (
      request.method !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed."
        },
        405
      );
    }

    try {
      const body =
        await request.json();

      const message =
        body?.message;

      if (
        !message ||
        typeof message !== "string"
      ) {
        return jsonResponse(
          {
            error:
              "Please provide a message."
          },
          400
        );
      }

      const cleanMessage =
        message.trim();

      if (!cleanMessage) {
        return jsonResponse(
          {
            error:
              "Please provide a message."
          },
          400
        );
      }

      /*
        Greeting
      */

      if (
        isGreeting(
          cleanMessage
        )
      ) {
        return jsonResponse({
          reply:
            greetingResponse(
              cleanMessage
            ),
          source: null
        });
      }

      /*
        FIRST:
        Structured questions.
      */

      const structuredAnswer =
        getStructuredAnswer(
          cleanMessage
        );

      if (structuredAnswer) {
        return jsonResponse({
          reply:
            structuredAnswer,
          source:
            "MANUUConnect knowledge"
        });
      }

      /*
        SECOND:
        Vectorize semantic search.
      */

      const matches =
        await searchVectorize(
          cleanMessage,
          env
        );

      const bestScore =
        matches[0]?.score || 0;

      const VECTOR_THRESHOLD =
        0.55;

      const strongMatches =
        bestScore >= VECTOR_THRESHOLD
          ? matches
          : [];

      let context = "";
      let source = null;

      if (
        strongMatches.length > 0
      ) {
        context =
          strongMatches
            .map(match => {
              const metadata =
                match.metadata || {};

              return `[MANUUConnect Knowledge]
Category: ${metadata.category || ""}
Type: ${metadata.type || ""}
Title: ${metadata.title || ""}

${metadata.text || ""}`;
            })
            .join("\n\n");

        source =
          "MANUUConnect knowledge";
      }

      /*
        THIRD:
        Official website fallback.
      */

      if (!context) {
        const websiteResults =
          await searchSerper(
            cleanMessage,
            env,
            "manuuconnect.in"
          );

        if (
          websiteResults.length > 0
        ) {
          context = `
Trusted external source:
manuuconnect.in

${formatWebResults(
  websiteResults,
  "manuuconnect.in"
)}
`;

          source =
            "manuuconnect.in";
        }
      }

      /*
        FOURTH:
        LinkedIn fallback.
      */

      if (!context) {
        const linkedinResults =
          await searchSerper(
            `MANUUConnect ${cleanMessage}`,
            env,
            "linkedin.com"
          );

        if (
          linkedinResults.length > 0
        ) {
          context = `
Trusted external source:
LinkedIn

${formatWebResults(
  linkedinResults,
  "LinkedIn"
)}
`;

          source =
            "LinkedIn";
        }
      }

      /*
        Nothing found.
      */

      if (!context) {
        context = `
No reliable MANUUConnect information
was found for this question.
`;
      }

      /*
        AI
      */

      const systemPrompt = `
You are MANUUConnect AI.

You answer questions about:
- MANUUConnect
- team members
- mentors
- alumni
- events
- projects
- achievements
- internships
- referrals
- FAQs
- student guidance
- learning and career guidance

Use the provided information.

For MANUUConnect facts, do not invent information.

If reliable MANUUConnect information is unavailable,
say:

"I don't have that information yet."

For general student guidance, you may give useful
general advice.

Keep answers short and clear.

Use short paragraphs.

Use bullet points or numbered lists when useful.

Leave blank lines between separate sections.

Do not repeat the user's question.

USER QUESTION:
${cleanMessage}

RETRIEVED INFORMATION:
${context}
`;

      const result =
        await env.AI.run(
          MODEL,
          {
            messages: [
              {
                role: "system",
                content:
                  systemPrompt
              },
              {
                role: "user",
                content:
                  cleanMessage
              }
            ],
            max_tokens: 300
          }
        );

      const reply =
        result?.response?.trim() ||
        "I don't have an answer for that right now.";

      return jsonResponse({
        reply,
        source,
        vectorScore:
          bestScore || null
      });

    } catch (error) {

      console.error(
        "MANUUConnect error:",
        error
      );

      return jsonResponse(
        {
          error:
            "Something went wrong. Please try again."
        },
        500
      );
    }
  }
};
